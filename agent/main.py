"""Ije agent: shared-state travel planner (M1 step 1: state plumbing)."""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from dotenv import load_dotenv
from fastapi import FastAPI
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.tools import ToolContext
from google.genai import types
from pydantic import ValidationError

from schema import Trip

load_dotenv()

AGENT_NAME = "IjeAgent"
STATE_KEYS = ("persona", "vibe", "trip")


# ---------- Tools ----------

def update_itinerary(tool_context: ToolContext, items: list[dict]) -> Dict[str, Any]:
    """Replace the trip's itinerary with a new, complete list of items.

    Always pass the FULL list of items, not just the changes.

    Args:
        items: Every itinerary item for the trip. Each item needs: item_id (str),
            place_id (str), day (YYYY-MM-DD), slot ("morning" | "afternoon" | "evening"),
            category ("sight" | "activity" | "food" | "shopping" | "nightlife"),
            pick_type ("local" | "tourist"), reason (str, max 200 chars),
            source_url (str, a full https URL).

    Returns:
        A status dict. On error, the message explains what to fix and retry.
    """
    trip = tool_context.state.get("trip")
    if not trip:
        return {"status": "error", "message": "No trip exists yet. Ask the user for destination, dates and budget first."}

    try:
        # Validate the whole trip, not just the items, so cross-field rules run
        # (items inside trip dates, solo = 1 traveller, and so on).
        validated = Trip.model_validate({**trip, "items": items})
    except ValidationError as e:
        # Returned to the model so it can correct itself and call the tool again.
        return {"status": "error", "message": f"Itinerary rejected, fix and retry: {e}"}

    tool_context.state["trip"] = validated.model_dump(mode="json")
    return {"status": "success", "message": f"Itinerary updated with {len(items)} items."}


# ---------- Callbacks ----------

def on_before_agent(callback_context: CallbackContext):
    """Make sure every state key exists so the prompt and UI never see a missing key."""
    for key in STATE_KEYS:
        if key not in callback_context.state:
            callback_context.state[key] = None
    return None


def before_model_modifier(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> Optional[LlmResponse]:
    """Inject the current persona, vibe and trip into the system instruction."""
    if callback_context.agent_name != AGENT_NAME:
        return None

    snapshot = {key: callback_context.state.get(key) for key in STATE_KEYS}
    state_json = json.dumps(snapshot, indent=2, default=str)

    prefix = f"""You are Ije, a travel planner that builds day-by-day itineraries.
Current state (persona = the account holder, vibe = this trip's feel, trip = this trip):
{state_json}

If the trip is null or missing destination, dates or budget, ask the user to fill in the trip form.
When you change the itinerary, call update_itinerary with the COMPLETE list of items.
"""

    instruction = llm_request.config.system_instruction
    if not isinstance(instruction, types.Content):
        instruction = types.Content(role="system", parts=[types.Part(text=str(instruction or ""))])
    if not instruction.parts:
        instruction.parts = [types.Part(text="")]
    instruction.parts[0].text = prefix + (instruction.parts[0].text or "")
    llm_request.config.system_instruction = instruction
    return None


def stop_after_text_reply(
    callback_context: CallbackContext, llm_response: LlmResponse
) -> Optional[LlmResponse]:
    """End the turn once the model replies with text, so it does not loop on tools."""
    if callback_context.agent_name != AGENT_NAME:
        return None
    content = llm_response.content
    if content and content.parts and content.role == "model" and content.parts[0].text:
        callback_context._invocation_context.end_invocation = True
    return None


# ---------- Agent ----------

ije_agent = LlmAgent(
    name=AGENT_NAME,
    model="gemini-2.5-flash",
    instruction="""
Plan trips that fit the persona, the vibe sliders and the party's needs.

RULES FOR ITINERARY ITEMS:
1. Every item needs a short reason that names why it fits this traveller.
2. Respect every dietary and accessibility need in trip.party_needs.
3. Never schedule sunset or night activities in the morning or afternoon slot.
4. Until a places search tool is available, set place_id to "unverified".
5. If update_itinerary returns an error, read the message, fix the items and call it again.
""",
    tools=[update_itinerary, AGUIToolset()],
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_model_callback=stop_after_text_reply,
)

adk_ije_agent = ADKAgent(
    adk_agent=ije_agent,
    user_id="demo_user",  # TODO M2: take from the verified Firebase token
    session_timeout_seconds=3600,
    use_in_memory_services=True,  # TODO M2: persistent sessions
)

app = FastAPI(title="Ije Agent")
add_adk_fastapi_endpoint(app, adk_ije_agent, path="/api/adk")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    if not os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_USE_VERTEXAI"):
        print("Warning: set GOOGLE_API_KEY locally, or GOOGLE_GENAI_USE_VERTEXAI in the cloud.")

    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
