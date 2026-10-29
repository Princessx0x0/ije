"""The Ije agent: tools, callbacks and the root agent.

Served two ways:
  - agent/main.py: production and `npm run dev`. AG-UI over FastAPI, with
    every request's Firebase ID token verified (ADR 005).
  - `agents-cli run` / `agents-cli eval`: ADK's local api_server loads
    `root_agent` and `app` from here. Local development only; it has no
    Firebase identity and is never deployed (the Dockerfile runs main.py).
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.apps import App
from google.adk.models import Gemini
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from .tools.planning import get_forecast, search_places, update_itinerary, update_stays
from .tools.rules import call_from_code, combined_needs

AGENT_NAME = "IjeAgent"
STATE_KEYS = ("persona", "vibe", "trip")

# Model Armor screens every prompt and response (ADR 009). Agent Runtime must
# never serve the agent unscreened, so a missing template stops it starting.
# Load agent/.env first: the package imports this module before main.py can,
# so local runs were unscreened. Never overrides Agent Runtime's real env vars.
load_dotenv(Path(__file__).with_name(".env"))
MODEL_ARMOR_TEMPLATE = os.environ.get("IJE_MODEL_ARMOR_TEMPLATE")
if os.environ.get("AGENT_ENGINE_ID") and not MODEL_ARMOR_TEMPLATE:
    raise RuntimeError("IJE_MODEL_ARMOR_TEMPLATE must be set on Agent Runtime (ADR 009).")

BLOCKED_REPLY = (
    "I can't help with that. I can plan your days, suggest places to eat and stay, "
    "and work around the weather and your group's needs."
)


# ---------- Callbacks ----------

def on_before_agent(callback_context: CallbackContext):
    for key in STATE_KEYS:
        if key not in callback_context.state:
            callback_context.state[key] = None
    return None


def _is_blocked_reply(content: types.Content) -> bool:
    return content.role == "model" and any(p.text == BLOCKED_REPLY for p in content.parts or [])


def _is_user_message(content: types.Content) -> bool:
    parts = content.parts or []
    return content.role == "user" and any(p.text for p in parts) and not any(p.function_response for p in parts)


def drop_blocked_turns(contents: list[types.Content]) -> list[types.Content]:
    """Leave out every earlier turn Model Armor blocked, from the user's message to the refusal.

    Model Armor screens the whole prompt, history included, so one blocked
    message left in the history would get every later request blocked too.
    """
    kept: list[types.Content] = []
    for content in contents:
        if _is_blocked_reply(content):
            while kept and not _is_user_message(kept[-1]):
                kept.pop()
            if kept:
                kept.pop()
            continue
        kept.append(content)
    return kept


def before_model_modifier(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> Optional[LlmResponse]:
    if callback_context.agent_name != AGENT_NAME:
        return None

    llm_request.contents = drop_blocked_turns(llm_request.contents)

    snapshot = {key: callback_context.state.get(key) for key in STATE_KEYS}
    state_json = json.dumps(snapshot, indent=2, default=str)

    today = datetime.now(timezone.utc).date().isoformat()
    trip = snapshot.get("trip") or {}
    needs = combined_needs(snapshot.get("persona"), trip.get("party_needs"))
    needs_line = "; ".join(f"{k}: {', '.join(v)}" for k, v in needs.items() if v) or "none recorded"
    prefix = f"""You are Ije, a travel planner that builds day-by-day itineraries.
Today is {today}.
NEEDS FOR EVERY PICK (traveller and group): {needs_line}
Current state (persona = the account holder, vibe = this trip's feel, trip = this trip):
{state_json}

"""

    instruction = llm_request.config.system_instruction
    if not isinstance(instruction, types.Content):
        instruction = types.Content(role="system", parts=[types.Part(text=str(instruction or ""))])
    if not instruction.parts:
        instruction.parts = [types.Part(text="")]
    instruction.parts[0].text = prefix + (instruction.parts[0].text or "")
    llm_request.config.system_instruction = instruction
    return None


TOOL_NAMES = {"get_forecast", "search_places", "update_itinerary", "update_stays"}


def repair_code_style_calls(content: types.Content) -> None:
    """Rewrite a tool call the model wrote as Python into the real call.

    With long arguments Gemini sometimes emits a call to a non-existent
    `google:python_interpreter` whose code is `print(default_api.update_itinerary(...))`,
    then repeats it until the run ends with nothing saved. The code is parsed
    (never executed) and only literal arguments to Ije's own tools are accepted.
    """
    for part in content.parts or []:
        call = part.function_call
        if not call or call.name in TOOL_NAMES:
            continue
        code = (call.args or {}).get("code")
        recovered = call_from_code(code, TOOL_NAMES) if isinstance(code, str) else None
        if recovered:
            name, args = recovered
            part.function_call = types.FunctionCall(id=call.id, name=name, args=args)


def after_model(
    callback_context: CallbackContext, llm_response: LlmResponse
) -> Optional[LlmResponse]:
    if callback_context.agent_name != AGENT_NAME:
        return None
    # A prompt Model Armor blocked comes back with no content, only the reason.
    if llm_response.error_code == types.BlockedReason.MODEL_ARMOR:
        callback_context._invocation_context.end_invocation = True
        return LlmResponse(content=types.Content(role="model", parts=[types.Part(text=BLOCKED_REPLY)]))
    content = llm_response.content
    if not (content and content.parts and content.role == "model"):
        return None
    repair_code_style_calls(content)
    # End the turn on a plain text reply, but never on a response that also
    # calls a tool ("Let me look that up" + function call), or planning stops.
    has_text = any(p.text for p in content.parts)
    calls_tool = any(p.function_call for p in content.parts)
    if has_text and not calls_tool:
        callback_context._invocation_context.end_invocation = True
    return llm_response


# ---------- Agent ----------

root_agent = LlmAgent(
    name=AGENT_NAME,
    # Retries ride out bursts of 429 RESOURCE_EXHAUSTED from shared capacity.
    model=Gemini(
        model="gemini-3.8-flash",
        retry_options=types.HttpRetryOptions(attempts=5, initial_delay=2, max_delay=30),
    ),
    generate_content_config=types.GenerateContentConfig(
        model_armor_config=types.ModelArmorConfig(
            prompt_template_name=MODEL_ARMOR_TEMPLATE,
            response_template_name=MODEL_ARMOR_TEMPLATE,
        )
    )
    if MODEL_ARMOR_TEMPLATE
    else None,
    instruction="""
You plan trips that fit the persona, the vibe sliders and the group's needs, using
only real data from your tools.

YOUR TOOLS ARE EXACTLY: get_forecast, search_places, update_itinerary, update_stays.
Never call any other tool and never write or run code. Do the reasoning yourself.

HOW TO PLAN (when asked to plan, or when the itinerary is empty):
1. Call get_forecast once. Use real weather to place outdoor picks on dry days.
   If it is unavailable, plan a sensible indoor and outdoor mix for the season and
   never state temperatures or conditions.
2. Call search_places for what this trip needs: sights, activities and places to
   eat that suit the persona's interests and the vibe. Put needs in the query
   ("halal restaurant", "step-free museum", "vegan cafe") and prefer places whose
   wheelchair_accessible_entrance or serves_vegetarian_food match the needs.
   Several focused searches beat one broad one.
3. Build EVERY day from start_date to end_date with a morning, an afternoon and an
   evening item, and at least one food item each day. Check opening_hours against
   the day of the week and the slot (morning, afternoon or evening): never put a
   place in a slot when it is closed. Spread areas sensibly and do not repeat a
   place unless asked.
4. Call update_itinerary once with the COMPLETE list. If it is rejected, fix every
   problem it lists and call it again.
5. Only after update_itinerary returns success, reply with two or three plain
   sentences: the shape of the trip and anything the traveller should know (for
   example, rain on day 2 so the museums are there). Never say a trip is planned
   unless update_itinerary returned success in this conversation.
   If get_forecast was unavailable, say the date it gives in available_from, for
   example "The forecast opens on 5 December".

THE VIBE (1 to 5):
- energy: 1 slow and spacious, 5 packed. local_vs_tourist: 1 where locals go,
  5 the famous sights; pick_type must say honestly which each item is.
- refinement: 1 casual, 5 upscale. Match the budget: budget_total is for the
  whole group for the whole trip.

NEEDS ARE NOT OPTIONAL:
- Respect every dietary need and allergy in persona and trip.party_needs in every
  food pick, and every accessibility need in every pick. If you cannot find a
  place that meets a need, say so instead of picking one that does not.
- Allergies: put every allergy in your food searches too ("gluten-free restaurant
  peanut-free", "nut-free bakery"), prefer places known for handling allergies,
  never claim a place is safe for an allergy, and always tell the traveller to
  confirm allergens with each restaurant before ordering.

REASONS:
- One short sentence on why it fits this traveller ("Your love of art, at a slow
  pace"). Never include the place's name: the app shows it.

STAYS:
- Only when asked where to stay: search_places with kind "lodging", then
  update_stays with up to 3 hotels that suit the budget and needs.

HONESTY:
- Never invent places, hotels, prices, opening hours or weather. If a tool fails
  or returns nothing suitable, say so plainly and suggest what the user can do.
- Bookings, flights, transport and reservations are outside what you can do. Say so
  plainly, then offer what you can do instead: plan the days, suggest places to eat
  and stay, and work around the weather and the group's needs.
""",
    tools=[get_forecast, search_places, update_itinerary, update_stays],
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_model_callback=after_model,
)

# For ADK's local api_server (agents-cli run / eval). The name matches the
# agent directory, which is how api_server finds it.
app = App(root_agent=root_agent, name="agent")
