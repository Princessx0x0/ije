# ADR 004: Opt out of CopilotKit Intelligence

- **Status:** Accepted
- **Date:** 2026-10-08
- **Supersedes:** ADR 001

## Context

ADR 001 assumed CopilotKit Intelligence could not be disabled. The generated
runtime route shows it is only enabled when `CPK_INTELLIGENCE_API_KEY` is set,
and otherwise falls back to `InMemoryAgentRunner`.

Ije will store persona data that can include health-related information
(dietary needs, allergies, accessibility). Every extra service holding
conversation data is another data processor to vet under UK GDPR.

Conversation state already lives in Agent Platform Sessions on Agent Runtime.

## Decision

- Remove the Intelligence code path from the CopilotKit runtime route.
- Remove the Intelligence keys from `.env` and `.env.example`.
- Revoke the CopilotKit Intelligence key in the CopilotKit dashboard.

## Consequences

- No conversation data is sent to CopilotKit's servers.
- No CopilotKit thread history or usage insights; observability comes from
  Agent Platform tracing instead.
- One fewer third party in the privacy policy.
