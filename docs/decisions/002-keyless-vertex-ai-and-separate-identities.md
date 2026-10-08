# ADR 002: Keyless Vertex AI access and separate build/runtime identities

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

The agent needs to call Gemini, and Cloud Run needs to build and run the
container. Both actions require an identity with permissions in the
Google Cloud project.

The default option for Gemini is an API key in an environment variable.
An API key is a long-lived bearer secret: anyone who holds it can use it
from anywhere until it is rotated, and keys commonly leak through commits,
logs and screenshots.

New projects no longer grant the default compute service account broad
roles automatically, so build permissions must be granted explicitly.

## Decision

- In Cloud Run, the agent calls Gemini through Vertex AI using a dedicated
  service account, `ije-agent`, with only `roles/aiplatform.user`. No API
  key is used in the cloud. Local development still uses a key in `.env`.
- Builds run as the default compute service account with only
  `roles/run.builder`.
- Each identity is limited to its own job: the build identity cannot call
  Gemini, and the runtime identity cannot build or push images.

## Consequences

- No long-lived model credential exists in the cloud; Cloud Run receives
  short-lived tokens automatically from the metadata server.
- A compromised runtime cannot modify the build pipeline, and vice versa.
- Every model call is attributable to a named identity in audit logs.
- Local and cloud authentication differ, so both paths must be tested.
