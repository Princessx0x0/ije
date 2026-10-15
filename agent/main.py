"""Ije agent server: the agent in agent/agent.py, served over AG-UI.

Runs locally under uvicorn and on Agent Runtime (container deploy), where the
platform exposes this app's routes under its /api passthrough.

Identity: every request must carry a Firebase ID token in
forwardedProps.firebaseIdToken. The agent verifies it itself and uses the
token's uid as the ADK session user ID. Nothing the browser or the model says
about who the user is is ever trusted.
"""

from __future__ import annotations

import logging
import os

import firebase_admin
from ag_ui.core import RunAgentInput
from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from firebase_admin import auth as firebase_auth
from google.adk.sessions import VertexAiSessionService
from pydantic import BaseModel

from agent.agent import root_agent

load_dotenv()

# Warnings from the agent (for example ije.maps) go to Cloud Logging with their source.
logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

PROJECT_ID = os.environ["GOOGLE_CLOUD_PROJECT"]
# The Firebase project whose ID tokens we accept: the project ID string, which
# is the tokens' "aud" claim. Not GOOGLE_CLOUD_PROJECT: Agent Runtime sets that
# to the project NUMBER, and every token would then be refused.
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID") or PROJECT_ID
# Set only on Agent Runtime. Its presence switches sessions to managed storage.
AGENT_ENGINE_ID = os.getenv("AGENT_ENGINE_ID")
AGENT_ENGINE_LOCATION = os.getenv("AGENT_ENGINE_LOCATION", "us-central1")


# ---------- Identity ----------

firebase_admin.initialize_app(options={"projectId": FIREBASE_PROJECT_ID})


class AuthError(Exception):
    """Raised when a request has no valid Firebase ID token."""


def token_problem(e: Exception) -> str:
    """Say what went wrong, so logs and the UI do not call every failure "invalid"."""
    if isinstance(e, firebase_auth.ExpiredIdTokenError):
        return "Firebase ID token expired"
    if isinstance(e, firebase_auth.RevokedIdTokenError):
        return "Firebase ID token revoked"
    if isinstance(e, firebase_auth.UserDisabledError):
        return "Firebase user disabled"
    if isinstance(e, firebase_auth.InvalidIdTokenError):
        return f"Firebase ID token not valid for project {FIREBASE_PROJECT_ID} ({e})"
    # Anything else is the server's problem (for example its Google credentials), not the user's token.
    return f"Could not verify the Firebase ID token: server error {type(e).__name__}"


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
    except Exception as e:  # expired, revoked, wrong project, malformed, or our credentials
        raise AuthError(token_problem(e)) from e
    return decoded["uid"]


# ---------- Serving ----------

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
    adk_agent=root_agent,
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
        raise HTTPException(status_code=401, detail=token_problem(e))
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
    # Run from the repo root: python -m agent.main
    uvicorn.run(app, host="0.0.0.0", port=port)
