# ADR 007: Call Gemini through the global endpoint

- **Status:** Superseded by ADR 009 (Gemini now runs on the `us` multi-region)
- **Date:** 2026-10-15

## Context

Local development already called Gemini with `GOOGLE_CLOUD_LOCATION=global`,
while the deployed agent set no location at all. The privacy worksheet
recorded this as an open question, because ADR 005's addendum describes all
user data as staying in `us-central1`.

During evaluation, `gemini-2.5-flash` returned bursts of `429
RESOURCE_EXHAUSTED`. The global endpoint routes each request to any region
with capacity, which is Google's recommended default for Gemini on Vertex AI:
higher availability and fewer capacity errors than a single region.

## Decision

- The agent calls Gemini through the **global** endpoint, both locally and on
  Agent Runtime. `scripts/deploy-agent.sh` sets `GOOGLE_CLOUD_LOCATION=global`
  explicitly, so the deployed agent never falls back to an unstated default.
- Everything else stays where ADR 003 and ADR 005 put it: Agent Runtime, Agent
  Platform Sessions and Firestore remain in `us-central1`.
- The model keeps automatic retries with backoff for the remaining `429`s.

## Consequences

- Prompts, which carry the persona, the trip, party needs and tool results,
  may be processed in any Google region, not only the US. Stored data does
  not move: sessions and Firestore stay in `us-central1`.
- `docs/privacy-governance.md` records this. The privacy policy must say that
  processing for itinerary generation can happen outside the US and the UK,
  and the UK transfer mechanism (decision 5 there) must cover it.
- Planning runs see fewer capacity failures.
