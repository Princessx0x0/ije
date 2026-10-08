# Ije backend contract (for the frontend build)

Read this with `docs/frontend-brief.md` and the ADRs in `docs/decisions/`.
The backend is done; the frontend should not need to change anything in `agent/`.

## Architecture

```
Browser (Firebase Auth, CopilotKit UI)
  -> Cloud Run frontend (Next.js), public ingress
       /api/copilotkit   CopilotKit runtime
       /api/adk          server proxy: adds Google IAM token
  -> Agent Runtime (us-central1), private, IAM only
       /api/adk              AG-UI endpoint (the Ije agent)
       /api/sessions/delete  delete the verified user's sessions
  -> Gemini via Vertex AI, Agent Platform Sessions
```

## Identity: the one rule

Every AG-UI request must carry the signed-in user's **Firebase ID token** in
`forwardedProps.firebaseIdToken`. The agent verifies it and uses its `uid` as the
session user ID. No token, an expired token or a forged token means the request
is refused.

- Get the token with `await auth.currentUser.getIdToken()` before each request.
  The SDK refreshes it automatically; tokens last about an hour.
- Guests are Firebase anonymous users. They have real uids and real tokens.
- Never send a user ID any other way. The agent ignores anything except the token.
- How CopilotKit passes `forwardedProps` through to the agent must be confirmed
  in the CopilotKit docs for the installed version before building screens.
  This is the first frontend task.

## Shared state

The agent reads and writes three top-level state keys. Their exact shapes are
the Pydantic models in `agent/schema.py`, which is the source of truth:

| Key | Model | Who writes it |
| --- | --- | --- |
| `persona` | `Persona` | Frontend (onboarding, preferences) |
| `vibe` | `Vibe` | Frontend (sliders) |
| `trip` | `Trip` | Frontend (trip form) and agent (`items` via `update_itinerary`) |

Money is always `{ "amount_minor": int, "currency": "GBP" | "USD" | "EUR" }`.
Dates are `YYYY-MM-DD`. Sliders are integers from 1 to 5.

Durable copies of persona and trips belong in Firestore under `users/{uid}/...`,
protected by security rules so a user can only read and write their own path.
Session state is working memory, not the permanent record.

## Account deletion

Deleting an account must remove, in this order:

1. Agent sessions: server-side `POST {agent}/api/sessions/delete` with body
   `{ "firebaseIdToken": "<token>" }`, via the same Google-token proxy pattern.
2. Firestore: everything under `users/{uid}`.
3. The Firebase Auth user (Admin SDK `deleteUser(uid)`, server-side).

Get the ID token before step 3, because it stops working once the user is deleted.

## Environment variables (frontend)

| Variable | Local | Cloud Run |
| --- | --- | --- |
| `AGENT_RUNTIME_URL` | unset (uses `localhost:8000`) | `https://us-central1-aiplatform.googleapis.com/reasoningEngines/v1/projects/788712976210/locations/us-central1/reasoningEngines/2768957581710852096/api` |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config | same |

The Firebase web config identifies the project; it is not a secret.
Firestore security rules are what protect the data.

## Infrastructure facts

- GCP project `ije-travel-511008` (number `788712976210`), region `us-central1`.
- Agent Runtime engine `2768957581710852096`, deployed with `scripts/deploy-agent.sh`.
- Frontend service account `ije-frontend@ije-travel-511008.iam.gserviceaccount.com`
  with `roles/aiplatform.user`, `roles/firebaseauth.admin`, `roles/datastore.user`.
- Local development uses Application Default Credentials (`gcloud auth
  application-default login`); there are no API keys anywhere.
- Firestore: native mode, `us-central1`, data under `users/{uid}`.
