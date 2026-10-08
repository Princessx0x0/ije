# How the Firebase ID token reaches the agent

Confirmed against the installed packages (`@copilotkit/core`, `@copilotkit/react-core`
and `@copilotkit/runtime` 1.73.2, `@ag-ui/client` 0.0.59), by reading their source
and by running `npm run verify:forwarded-props` in `frontend/`.

## The path

1. **Browser.** `CopilotKitCore.runAgent` builds the run input with
   `forwardedProps: { ...core.properties, ...perRunForwardedProps }`.
   `core.properties` is set by the provider's `properties` prop and by
   `copilotkit.setProperties`. Suggestion runs and `connectAgent` also send
   `core.properties`.
2. **`/api/copilotkit`.** The runtime parses the `RunAgentInput` and
   `InMemoryAgentRunner` calls `agent.runAgent(request.input)` with it unchanged.
3. **`HttpAgent` (server).** `prepareRunAgentInput` copies `forwardedProps` into
   the input and POSTs `JSON.stringify(input)` to `/api/adk`.
4. **`/api/adk`.** Adds the frontend service account's Google token and forwards
   the body untouched to Agent Runtime.
5. **Agent.** `verified_user_id` reads `forwarded_props["firebaseIdToken"]`,
   verifies it and uses its `uid` as the session user ID.

## Keeping the token fresh

`properties` is a snapshot and Firebase ID tokens last about an hour.
`CopilotKitCore.runAgent` awaits every subscriber's `onAgentRunStarted` handler
before it builds the run input (top-level runs), so `IjeCopilotKit` subscribes
there, awaits `user.getIdToken()` (which refreshes near expiry) and calls
`setProperties` with the result. The `properties` prop is also kept in step with
`onIdTokenChanged`, so suggestion and connect requests carry a current token too.

CopilotKit mounts only for a signed-in user and is keyed by `uid`, so switching
accounts discards the previous user's agent and thread state.

## Telemetry

The CopilotKit runtime sends usage telemetry to CopilotKit by default. ADR 004
allows no third party without an ADR, so `app/api/copilotkit/route.ts` sets
`COPILOTKIT_TELEMETRY_DISABLED=true` before the runtime is constructed.

## Re-check on upgrade

These are internal behaviours, not documented guarantees. Re-run
`npm run verify:forwarded-props` whenever `@copilotkit/*` or `@ag-ui/*` changes.
