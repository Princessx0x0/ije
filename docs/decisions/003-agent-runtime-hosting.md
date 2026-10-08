# ADR 003: Host the agent on Agent Runtime, frontend on Cloud Run, in us-central1

- **Status:** Accepted
- **Date:** 2026-10-08
- **Amends:** ADR 002 (runtime identity)

## Context

The DevCamp assignment requires the agent to be hosted on Agent Runtime
(Gemini Enterprise Agent Platform) and the frontend on Cloud Run.

The organisers' reference project shows that a container-based Agent
Runtime deployment exposes the container's own HTTP routes under an `/api`
passthrough. The FastAPI app serving AG-UI through `ag_ui_adk` therefore
works on Agent Runtime without a protocol bridge.

The Semantic Governance Policy Engine, needed for the govern phase, is not
available in `europe-west2` or `global`, and a policy can only bind to an
agent in the region it is registered in.

## Decision

- Deploy the agent to Agent Runtime with `agents-cli deploy -d agent_runtime
  --agent-identity`, in `us-central1`.
- Use Agent Identity as the agent's runtime identity, replacing the
  `ije-agent` service account. Secrets are read at runtime by that identity;
  the deployment carries only secret names.
- Use Agent Platform Sessions (`VertexAiSessionService`) when running on
  Agent Runtime; in-memory sessions locally.
- Deploy the frontend to Cloud Run as a private service with its own service
  account. The browser never calls the agent directly; Next.js route
  handlers add the bearer token server-side.
- Repo layout follows the reference: agent Dockerfile at the root, Next.js
  app in `frontend/`.
- Retire the M0 Cloud Run agent service.

## Consequences

- Session and agent data reside in the US, not the UK. Acceptable for a
  prototype with fake data; must be revisited before real UK users store
  health-related persona data.
- The govern phase can bind governance policies to the agent.
- The keyless principle from ADR 002 is kept; only the identity changes.
- Local and deployed paths differ (local ADC and in-memory sessions versus
  Agent Identity and managed sessions), so both must be tested.
