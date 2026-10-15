# Ije

AI travel itinerary planner. ADK agent on Agent Runtime (`agent/`), Next.js 16 + CopilotKit 1.73 frontend on Cloud Run (`frontend/`).

## Read these first

@docs/frontend-brief.md
@docs/backend-contract.md
@docs/design-system.md

ADRs live in `docs/decisions/`. Read the relevant one before touching identity, sessions, hosting or third-party services. How the Firebase token travels through CopilotKit: `docs/copilotkit-forwarded-props.md`.

## Hard rules

- **Agent (`agent/`):** `agent/agent.py` holds the ADK agent (`root_agent`: tools, callbacks, instruction); `agent/main.py` serves it over AG-UI and verifies identity. Never weaken `verified_user_id` or serve the agent any other way in production: ADK's api_server (`agents-cli run`, `eval`, `playground`) is local-only. `agent/schema.py` is the source of truth for state shapes (`persona`, `vibe`, `trip`); mirror changes in `frontend/src/lib/schema.ts`. Agent behaviour changes need an eval run (`agents-cli eval run`) before deploy.
- **Production standard:** real Firebase Auth only. No mock auth, demo users, hard-coded user IDs or bypasses. Identity comes only from the Firebase ID token in `forwardedProps.firebaseIdToken`, verified by the agent.
- **No new third parties** (analytics, fonts CDN, telemetry) without an ADR. CopilotKit telemetry is disabled in the runtime route; keep it that way.
- **No em dashes in UI copy.** Sentence case everywhere.

## Design system: how to build UI

- Tokens: edit `frontend/src/styles/tokens.json` only, then `npm run tokens`. Never edit `tokens.css` (generated).
- Components: use the classes in `frontend/src/styles/components.css` (`ije-button`, `ije-card`, `ije-chip`, `ije-field`, `ije-vibe`, `ije-segmented`, `ije-badge`, `ije-notice`, `ije-link`). Add new components there, not as one-off inline styles.
- Colours only via tokens (`var(--primary)` etc.). One action colour: `primary`. `laterite` only for local picks. `danger` only for errors and account deletion.
- Spacing only from the 8px scale (`--space-8` to `--space-64`). No borders on cards: use `surface` + `shadow-card` on `paper`, or `inset`.
- Type: Newsreader (`--font-display`) for places, days and headings; Atkinson Hyperlegible Next (`--font-text`) for everything else. Both self-hosted via Fontsource.
- Accessibility: real `<button>`, `<a href>`, `<label for>`; toggles use `aria-pressed`; 48px touch targets. The app is light only (`color.followSystem: false` in `tokens.json`); don't reintroduce `prefers-color-scheme`.
- Not chat-first: the itinerary canvas is the main surface; chat is a hideable side panel built with CopilotKit hooks, not `CopilotSidebar`.

## Auth flow (frontend)

- `components/auth/AuthProvider.tsx`: Firebase state and actions. Guests upgrade in place (`linkWithCredential` / `linkWithPopup`), keeping their uid.
- `components/auth/IjeCopilotKit.tsx`: mounts CopilotKit only when signed in, keyed by uid, and refreshes the token in `onAgentRunStarted`.
- `components/auth/AuthGate.tsx`: wraps any page that needs a signed-in user.

## Current state and next work

- Flow: sign-in or Continue as guest, then `/` (`app/page.tsx`) routes by `users/{uid}.persona`: none goes to `/onboarding`, otherwise `/trips`. A new user's first onboarding save goes straight to `/trips/new`; `/trips` with no trips redirects there too, so nobody lands on an empty list. Guests and full accounts take the same path.
- `/trips/new`: trip details then vibe sliders; creates `users/{uid}/trips/{tripId}` and opens `/trips/{tripId}`.
- `/trips/{tripId}`: the itinerary canvas. `components/trip/useTripAgent.ts` binds a thread-scoped agent (thread id = trip id), sets `{ persona, vibe, trip }` as agent state before each run, and always runs through `copilotkit.runAgent` (never `agent.runAgent`, which would skip the Firebase token). New `trip.items` from the agent are saved to Firestore; reloads read Firestore. First visit with no items plans automatically. Chat is a hideable side panel (`components/trip/ChatPanel.tsx`).
- Guests are never pushed to sign out or sign up. The upgrade prompt is optional and lives only in `components/auth/AccountMenu.tsx`; `/sign-in` offers guests "Not now".
- Firestore layout: `users/{uid}` holds `{ persona, consents, updatedAt }`; trips are `users/{uid}/trips/{tripId}` holding `{ ...Trip, vibe, createdAt, updatedAt }` (`vibe` is per trip and sent to the agent separately). Rules are in `firestore.rules`, deployed with `firebase deploy --only firestore:rules` (`firebase.json`). TS mirrors of `agent/schema.py` are in `lib/schema.ts`.
- Health fields (diet, allergies, access needs, trip `party_needs`) need explicit consent: `savePersona` empties them without it and clears `party_needs` on every trip in the same batch, and the rules refuse them unless `consents.health` matches `HEALTH_CONSENT_VERSION`. Change the version in `lib/profile.ts` and `firestore.rules` together.
- Known limits: the agent has no place names or places search yet (`place_id: "unverified"`, model-chosen `source_url`), so cards lead with the reason. Chat history is not restored after a reload; the itinerary is.
- Then: PDF export, stays, delete account (order in `docs/backend-contract.md`). The privacy policy page waits for the governance phase: see `docs/privacy-governance.md`, and keep it current as features change what data is collected or where it goes.

## Agent commands (run at the repo root)

- `uv sync`: install the agent's Python environment (`pyproject.toml` at the root; `agent/` is the package)
- `agents-cli run "prompt"`: quick local smoke test through ADK's api_server
- `agents-cli eval run`: run and grade the eval dataset in `tests/eval/` (must pass before any deploy)
- `uv run pytest tests/unit tests/integration`: code tests (never assert on LLM wording; that belongs in eval)
- `scripts/deploy-agent.sh`: deploy to Agent Runtime. Only with explicit human approval. `AGENTS.md` is generated by agents-cli; where it disagrees, this file wins.

## Commands (run in `frontend/`)

- `npm run dev`: UI on :3000 and agent on :8000. The local agent uses Application Default Credentials for Gemini and for the token revocation check. If runs fail with "Invalid Firebase ID token: RefreshError", the Firebase token is fine: ADC has expired. Run `gcloud auth application-default login`, then restart `npm run dev` (the agent caches credentials at start).
- `npm run typecheck`
- `npm run test:rules`: Firestore rules tests on the emulator (needs the Firebase CLI and Java 21 on PATH). Must pass before `firebase deploy --only firestore:rules` (run from the repo root).
- `npm run build`
- `npm run tokens`: regenerate `tokens.css` from `tokens.json`
- `npm run verify:forwarded-props`: re-run after any `@copilotkit/*` or `@ag-ui/*` upgrade
