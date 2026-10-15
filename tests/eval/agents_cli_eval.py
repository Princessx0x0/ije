"""Run `agents-cli eval ...` with session state seeded the way ADK 2.11 accepts.

agents-cli 1.10 seeds a case's `state_delta` as an event carrying
`actions.stateDelta` on session creation. ADK 2.11's api_server now refuses
client-supplied events with actions ("cannot include event actions"), so every
case fails before the agent runs. ADK does accept a plain `state` field, so this
wrapper moves the deltas there and otherwise runs agents-cli unchanged.

Run with agents-cli's own interpreter (see tests/eval/README.md):

    ~/.local/share/uv/tools/google-agents-cli/bin/python tests/eval/agents_cli_eval.py eval generate ...

Remove once agents-cli seeds state through `state`.
"""

from __future__ import annotations

import sys

import requests
from google.agents.cli import _adk_client
from google.agents.cli.eval import cmd_generate
from google.agents.cli.main import main


def create_session_with_state(base_url, app_name, user_id, *, headers, prior_events=None):
    state: dict = {}
    events = []
    for event in prior_events or []:
        delta = (event.pop("actions", None) or {}).get("stateDelta") or {}
        state.update(delta)
        if event.get("content"):  # a state-only event has nothing left to replay
            events.append(event)
    body: dict = {}
    if state:
        body["state"] = state
    if events:
        body["events"] = events
    resp = requests.post(
        f"{base_url}/apps/{app_name}/users/{user_id}/sessions",
        headers=headers,
        json=body,
        timeout=_adk_client._SESSION_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("id")


cmd_generate.create_session = create_session_with_state

if __name__ == "__main__":
    sys.argv[0] = "agents-cli"
    sys.exit(main())
