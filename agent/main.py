"""Ije agent: ADK agent served over AG-UI.

Runs locally under uvicorn and on Agent Runtime (container deploy), where the
platform exposes this app's routes under its /api passthrough.

Identity: every request must carry a Firebase ID token in
forwardedProps.firebaseIdToken. The agent verifies it itself and uses the
token's uid as the ADK session user ID. Nothing the browser or the model says
about who the user is is ever trusted.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import firebase_admin
from ag_ui.core import RunAgentInput
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from firebase_admin import auth as firebase_auth
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.sessions import VertexAiSessionService
from google.adk.tools import ToolContext
from google.genai import types
from pydantic import ValidationError

from schema import Trip

load_dotenv()

AGENT_NAME = "IjeAgent"
STATE_KEYS = ("persona", "vibe", "trip")

PROJECT_ID = os.environ["GOOGLE_CLOUD_PROJECT"]
# Set only on Agent Runtime. Its presence switches sessions to managed storage.
AGENT_ENGINE_ID = os.getenv("AGENT_ENGINE_ID")
AGENT_ENGINE_LOCATION = os.getenv("AGENT_ENGINE_LOCATION", "us-central1")


# ---------- Identity ----------

firebase_admin.initialize_app(options={"projectId": PROJECT_ID})


class AuthError(Exception):
    """Raised when a request has no valid Firebase ID token."""


def verified_user_id(input: RunAgentInput) -> str:
    """Return the uid from a verified Firebase ID token, or refuse the request.

    The token is checked against Google's signing keys, so it cannot be forged
    by the browser, by the frontend server, or by text the model produces.
    """
    props = input.forwarded_props if isinstance(input.forwarded_props, dict) else {}
    token = props.get("firebaseIdToken")
    if not token:
        raise AuthError("Missing firebaseIdToken in forwardedProps")
    try:
        decoded = firebase_auth.verify_id_token(token, check_revoked=True)
    except Exception as e:  # expired, revoked, wrong project, malformed
        raise AuthError(f"Invalid Firebase ID token: {type(e).__name__}") from e
    return decoded["uid"]


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
        # Validate the whole trip, not just the items, so cross-field rules run.
        validated = Trip.model_validate({**trip, "items": items})
    except ValidationError as e:
        return {"status": "error", "message": f"Itinerary rejected, fix and retry: {e}"}

    tool_context.state["trip"] = validated.model_dump(mode="json")
    return {"status": "success", "message": f"Itinerary updated with {len(items)} items."}


# ---------- Callbacks ----------

def on_before_agent(callback_context: CallbackContext):
    for key in STATE_KEYS:
        if key not in callback_context.state:
            callback_context.state[key] = None
    return None


def before_model_modifier(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> Optional[LlmResponse]:
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
    tools=[update_itinerary],
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_model_callback=stop_after_text_reply,
)

# Managed sessions on Agent Runtime; in-memory locally.
session_service = (
    VertexAiSessionService(
        project=PROJECT_ID,
        location=AGENT_ENGINE_LOCATION,
        agent_engine_id=AGENT_ENGINE_ID,
    )
    if AGENT_ENGINE_ID
    else None
)

adk_ije_agent = ADKAgent(
    adk_agent=ije_agent,
    app_name="ije",
    user_id_extractor=verified_user_id,
    session_service=session_service,
    session_timeout_seconds=3600,
)

app = FastAPI(title="Ije Agent")
add_adk_fastapi_endpoint(app, adk_ije_agent, path="/api/adk")


class DeleteSessionsRequest(BaseModel):
    firebaseIdToken: str


@app.post("/api/sessions/delete")
async def delete_my_sessions(body: DeleteSessionsRequest):
    """Delete every agent session belonging to the verified user (account deletion).

    Identity comes only from the verified Firebase ID token in the body.
    """
    try:
        uid = firebase_auth.verify_id_token(body.firebaseIdToken, check_revoked=True)["uid"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Firebase ID token: {type(e).__name__}")
    if session_service is None:
        return {"deleted": 0, "note": "in-memory sessions are not persisted"}
    listed = await session_service.list_sessions(app_name="ije", user_id=uid)
    for s in listed.sessions:
        await session_service.delete_session(app_name="ije", user_id=uid, session_id=s.id)
    return {"deleted": len(listed.sessions)}


@app.get("/health")
async def health():
    return {"status": "ok", "sessions": "managed" if AGENT_ENGINE_ID else "in-memory"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
