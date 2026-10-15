"""The agent must accept tokens for the Firebase project ID, whatever GOOGLE_CLOUD_PROJECT holds."""

import importlib
import sys

import firebase_admin


def _load_main(monkeypatch, **env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    for app in list(firebase_admin._apps.values()):
        firebase_admin.delete_app(app)
    sys.modules.pop("agent.main", None)
    return importlib.import_module("agent.main")


def test_firebase_project_id_wins_over_a_project_number(monkeypatch):
    main = _load_main(monkeypatch, GOOGLE_CLOUD_PROJECT="788712976210", FIREBASE_PROJECT_ID="ije-travel-511008")
    assert firebase_admin.get_app().project_id == "ije-travel-511008"
    assert main.FIREBASE_PROJECT_ID == "ije-travel-511008"


def test_errors_name_the_real_problem(monkeypatch):
    main = _load_main(monkeypatch, GOOGLE_CLOUD_PROJECT="ije-travel-511008", FIREBASE_PROJECT_ID="ije-travel-511008")
    from firebase_admin import auth

    assert main.token_problem(auth.ExpiredIdTokenError("x", cause=None)) == "Firebase ID token expired"
    assert "not valid for project ije-travel-511008" in main.token_problem(auth.InvalidIdTokenError("bad aud"))
    assert main.token_problem(RuntimeError("no creds")).startswith("Could not verify the Firebase ID token: server error")
