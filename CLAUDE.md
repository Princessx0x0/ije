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
- Agent tools (ADR 006, `agent/tools/`): `get_forecast`, `search_places`, `update_itinerary`, `update_stays` on Google Maps Platform via OAuth (no keys). Hard rules live in the tools, not only the prompt (`agent/tools/rules.py`, unit-tested): full days, food daily, searched places only, needs added to every search, allergy clashes rejected, no place names in stored text. `after_model` in `agent/agent.py` repairs tool calls Gemini writes as Python (parsed with `ast`, never executed).
- Model (ADR 009): `gemini-3.8-flash` on the `us` multi-region (`GOOGLE_CLOUD_LOCATION=us`), every call screened by the `ije-guardrails` Model Armor template in Model Armor's `us` location (`IJE_MODEL_ARMOR_TEMPLATE`, required on Agent Runtime). Never stream: Model Armor skips streamed calls (`run_config` in `agent/main.py`). Blocked prompts get `BLOCKED_REPLY`. The eval judge is `gemini-4-argon`.
- Maps terms: store only place IDs, our own text and links. Names and addresses come live from `/api/places`. Weather is never stored. Keep the "Places and weather from Google Maps" attribution on the canvas.
- Agent Identity token binding is switched off on the deployed agent (ADR 008, `GOOGLE_API_ENABLE_RUNTIME_BOUND_TOKEN=false`) because `firebase-admin` and `agent/tools/maps.py` send plain bearer tokens. Tracked follow-up: move those calls to mTLS, then remove the opt-out.
- On Agent Runtime `GOOGLE_CLOUD_PROJECT` is the project number; the Firebase project comes from `FIREBASE_PROJECT_ID`.
- Known limits: chat history is not restored after a reload; the itinerary and stays are. Weather shows only after a run in the current session.
- Not built yet: delete account (order in `docs/backend-contract.md`), PDF export, the privacy policy page (waits for `docs/privacy-governance.md`; keep that worksheet current as features change the data).

## Where we stopped (2026-10-15)

- **Live:** frontend https://ije-frontend-788712976210.us-central1.run.app (Cloud Run `ije-frontend`); agent on Agent Runtime engine `2768957581710852096`. A full itinerary was produced end to end on the live site.
- **What changed and why:** `docs/changes/2026-10-15.md` (and the plain-language PDF beside it). Decisions: ADRs 001 to 009 in `docs/decisions/`. Read these before revisiting any of those choices.
- **Evals at the bar:** see `tests/eval/README.md`. Re-run before any agent deploy.
- **Branches:** PRs #1 to #3 are stacked (merge in order). Until merged, `main` does not have this file's current content.

## Next: prepare for real users

Do these before inviting real users, roughly in this order. Each needs the user's go-ahead where it changes cloud resources or deploys.

1. **Secrets hygiene:** remove the unused CopilotKit keys in `agent/.env` and the `GOOGLE_API_KEY` in `frontend/.env`, then revoke them.
2. **Delete account** (UK GDPR erasure, `docs/backend-contract.md` order): agent sessions, then Firestore `users/{uid}`, then the Firebase user.
3. **Governance decisions and privacy page:** controller, lawful basis, UK transfer mechanism (covering US Gemini processing, ADR 009), retention, DPIA. Then write the page and link it from onboarding, the trip form and the account menu.
4. **Abuse and cost controls:** rate limiting on `/api/adk` and `/api/places` (ADR 005), a Maps Platform budget alert, and quota caps.
5. **Restore token binding** (ADR 008 follow-up): move the Firebase revocation check and `agent/tools/maps.py` to mTLS, then remove `GOOGLE_API_ENABLE_RUNTIME_BOUND_TOKEN=false`.
6. **Reliability:** monitoring and alerts on agent errors and Places 4xx/5xx (see the Agent Runtime notes in docs), and min instances to avoid cold starts.
7. **Optimisation:** planning latency (about 40 s for 3 days), prompt and context size, fewer search calls, page performance.
8. **Product gaps:** restore chat history after reload, show weather without a new run, PDF export.
9. **Quality gates:** run the evals and rules tests in CI, and add eval cases for each new behaviour.

## Agent commands (run at the repo root)

- `uv sync`: install the agent's Python environment (`pyproject.toml` at the root; `agent/` is the package)
- `agents-cli run "prompt"`: quick local smoke test through ADK's api_server
- Evals (must pass before any deploy; see `tests/eval/README.md`): `uv run python tests/eval/make_dataset.py`, then generate and grade with `tests/eval/agents_cli_eval.py` (agents-cli 1.10 cannot seed state on ADK 2.11 without it). Bar: `plan_rules` 1 and `ije_judge` >= 4 on every case, including the held-out set.
- `uv run pytest tests/unit tests/integration`: code tests (never assert on LLM wording; that belongs in eval)
- `scripts/deploy-agent.sh`: deploy to Agent Runtime. Only with explicit human approval.
- `scripts/deploy-frontend.sh`: deploy the frontend to Cloud Run (`ije-frontend`, live at https://ije-frontend-788712976210.us-central1.run.app). Only with explicit human approval; needs a current `gcloud auth login`. Public via `--no-invoker-iam-check` (ADR 005 addendum). `AGENTS.md` is generated by agents-cli; where it disagrees, this file wins.

## Commands (run in `frontend/`)

- `npm run dev`: UI on :3000 and agent on :8000. The local agent uses Application Default Credentials for Gemini and for the token revocation check. If runs fail with "Invalid Firebase ID token: RefreshError", the Firebase token is fine: ADC has expired. Run `gcloud auth application-default login`, then restart `npm run dev` (the agent caches credentials at start).
- `npm run typecheck`
- `npm run test:rules`: Firestore rules tests on the emulator (needs the Firebase CLI and Java 21 on PATH). Must pass before `firebase deploy --only firestore:rules` (run from the repo root).
- `npm run build`
- `npm run tokens`: regenerate `tokens.css` from `tokens.json`
- `npm run verify:forwarded-props`: re-run after any `@copilotkit/*` or `@ag-ui/*` upgrade
