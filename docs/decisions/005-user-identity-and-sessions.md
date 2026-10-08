# ADR 005: User identity from verified Firebase tokens, managed sessions

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The production standard bans hard-coded user IDs. The agent previously used
`user_id="demo_user"` and in-memory sessions, so every user shared one identity
and conversations were lost on restart.

`ag_ui_adk.ADKAgent` accepts a `user_id_extractor` function that receives the
AG-UI `RunAgentInput`, and a `session_service`.

The frontend is a public consumer app, so its Cloud Run service must accept
unauthenticated ingress. Browsers cannot present Google IAM credentials.

## Decision

- Users sign in with Firebase Authentication (email and password, Google, anonymous).
- The browser sends its Firebase ID token in `forwardedProps.firebaseIdToken` on
  every AG-UI request.
- The agent verifies the token itself (`firebase_admin.auth.verify_id_token`,
  with revocation checks) and uses its `uid` as the ADK session user ID.
  Requests without a valid token are refused.
- The frontend's `/api/adk` server route adds the frontend service account's
  Google access token and forwards to Agent Runtime. It does not decide identity.
- The frontend Cloud Run service allows unauthenticated ingress; identity is
  enforced in the app. Agent Runtime stays private: only IAM principals with
  `roles/aiplatform.user` can call it.
- On Agent Runtime, sessions use `VertexAiSessionService` (managed Agent Platform
  Sessions), selected by the `AGENT_ENGINE_ID` environment variable.

## Consequences

- Identity is verified at the agent, so neither the browser, the frontend server
  nor model output can impersonate a user (defence in depth).
- Anyone can reach the frontend's `/api/adk` route, but without a valid Firebase
  token the agent refuses the request before calling Gemini. Rate limiting is
  still needed before launch.
- Local development requires a real Firebase sign-in; there is no bypass.
- The Agent Identity needs `roles/firebaseauth.viewer` for revocation checks.

## Addendum: Firestore region

- Firestore (native mode) is created in `us-central1`, the same region as Agent
  Runtime and Agent Platform Sessions.
- Session state already holds a copy of the persona in the US, so a UK Firestore
  would split the data across two regions without keeping it in the UK.
- All user data, including health-related persona details, is therefore stored in
  the US. The privacy policy must say so.
- Before launching to real UK users: confirm the lawful basis for the UK to US
  transfer, and record it in the privacy policy.
