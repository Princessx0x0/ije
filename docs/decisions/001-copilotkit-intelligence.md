# ADR 001: Use CopilotKit managed Intelligence during development

- **Status:** Superseded by ADR 004
- **Date:** 2026-10-07

## Context

The CopilotKit CLI includes Intelligence (durable threads, event logging,
usage insights) with every supported framework; the `--intelligence` flag is
a deprecated no-op, so it cannot be disabled at scaffold time.

The self-hosted option is a local evaluation preview that does not support
Docker Desktop on Linux, which rules out our WSL setup.

Ije will handle persona data that may include health-related information
(dietary needs, allergies, accessibility), which is special-category data
under UK GDPR. The M0 deadline is 9 October 2026.

## Decision

Use the CopilotKit managed service for development only.

- Fake test data only; no real personal data.
- App data lives in Firestore; conversation state lives in ADK sessions.
- No feature may depend on CopilotKit Intelligence.

## Consequences

- Faster M0 scaffold.
- A third party holds development conversation data.
- Before real users: review CopilotKit's data processing terms (region,
  retention, sub-processors), or remove or replace Intelligence.
