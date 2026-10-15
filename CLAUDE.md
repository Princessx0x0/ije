# Ije

AI travel itinerary planner. ADK agent on Agent Runtime (`agent/`), Next.js 16 + CopilotKit 1.73 frontend on Cloud Run (`frontend/`).

## Read these first

@docs/frontend-brief.md
@docs/backend-contract.md
@docs/design-system.md

ADRs live in `docs/decisions/`. Read the relevant one before touching identity, sessions, hosting or third-party services. How the Firebase token travels through CopilotKit: `docs/copilotkit-forwarded-props.md`.

## Hard rules

- **Do not change `agent/`.** The backend is done. `agent/schema.py` is the source of truth for state shapes (`persona`, `vibe`, `trip`).
- **Production standard:** real Firebase Auth only. No mock auth, demo users, hard-coded user IDs or bypasses. Identity comes only from the Firebase ID token in `forwardedProps.firebaseIdToken`, verified by the agent.
- **No new third parties** (analytics, fonts CDN, telemetry) without an ADR. CopilotKit telemetry is disabled in the runtime route; keep it that way.
- **No em dashes in UI copy.** Sentence case everywhere.

## Design system: how to build UI

- Tokens: edit `frontend/src/styles/tokens.json` only, then `npm run tokens`. Never edit `tokens.css` (generated).
- Components: use the classes in `frontend/src/styles/components.css` (`ije-button`, `ije-card`, `ije-chip`, `ije-field`, `ije-vibe`, `ije-segmented`, `ije-badge`, `ije-notice`, `ije-link`). Add new components there, not as one-off inline styles.
- Colours only via tokens (`var(--primary)` etc.). One action colour: `primary`. `laterite` only for local picks. `danger` only for errors and account deletion.
- Spacing only from the 8px scale (`--space-8` to `--space-64`). No borders on cards: use `surface` + `shadow-card` on `paper`, or `inset`.
- Type: Newsreader (`--font-display`) for places, days and headings; Atkinson Hyperlegible Next (`--font-text`) for everything else. Both self-hosted via Fontsource.
- Accessibility: real `<button>`, `<a href>`, `<label for>`; toggles use `aria-pressed`; 48px touch targets; check both light and dark themes.
- Not chat-first: the itinerary canvas is the main surface; chat is a hideable side panel built with CopilotKit hooks, not `CopilotSidebar`.

## Auth flow (frontend)

- `components/auth/AuthProvider.tsx`: Firebase state and actions. Guests upgrade in place (`linkWithCredential` / `linkWithPopup`), keeping their uid.
- `components/auth/IjeCopilotKit.tsx`: mounts CopilotKit only when signed in, keyed by uid, and refreshes the token in `onAgentRunStarted`.
- `components/auth/AuthGate.tsx`: wraps any page that needs a signed-in user.

## Current state and next work

- `app/page.tsx` is a **placeholder** from the auth step (shows "Signed in as" and Sign out). It is not a real screen.
- Next: after sign-in or Continue as guest, route new users (no persona in Firestore) to onboarding, and returning users to their trips/canvas. Guests should never be pushed to sign out or sign up to proceed; the upgrade prompt is optional and lives in the account menu.
- Then: trip details, vibe sliders, itinerary canvas, PDF export, preferences, delete account (order in `docs/backend-contract.md`), privacy policy page.

## Commands (run in `frontend/`)

- `npm run dev`: UI on :3000 and agent on :8000
- `npm run typecheck`
- `npm run build`
- `npm run tokens`: regenerate `tokens.css` from `tokens.json`
- `npm run verify:forwarded-props`: re-run after any `@copilotkit/*` or `@ag-ui/*` upgrade
