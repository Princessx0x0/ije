# ADR 008: Opt the agent out of certificate-bound tokens, for now

- **Status:** Accepted (temporary; see Follow-up)
- **Date:** 2026-10-15

## Context

The agent runs on Agent Runtime with Agent Identity (ADR 003). By default,
Google binds that identity's access tokens to the runtime's certificate: a
token is accepted only when presented over mutual TLS from the agent's own
environment, so a stolen token is useless elsewhere.

Google's client libraries present the certificate automatically, which is why
Gemini works. Two parts of the agent make their own HTTPS calls with a plain
bearer token, and Google rejects them with `401 UNAUTHENTICATED`:

- `firebase-admin`'s revocation check in `verify_id_token(..., check_revoked=True)`,
  which calls the Firebase Auth API. Every signed-in run on the live site
  failed with "Could not verify the Firebase ID token: server error
  UnauthenticatedError".
- The Places API and Weather API calls in `agent/tools/maps.py` (ADR 006).

Google documents an opt-out, `GOOGLE_API_ENABLE_RUNTIME_BOUND_TOKEN=false`, for
agents that inject tokens into request headers or receive `401 UNAUTHENTICATED`.

## Decision

- Set `GOOGLE_API_ENABLE_RUNTIME_BOUND_TOKEN=false` on the deployed agent
  (`scripts/deploy-agent.sh`).
- Keep everything else: Agent Identity, its IAM roles, revocation checks on
  every Firebase token, and OAuth with no API keys (ADR 002, ADR 006).

## Consequences

- Sign-in, Places and Weather work on the live agent.
- The agent's access tokens are no longer tied to the runtime. A leaked token
  could be replayed elsewhere until it expires (about an hour), with only the
  agent's own permissions. Leaking one would first need another failure, such
  as logging a token, which Ije never does.

## Follow-up (tracked)

Restore binding by making Ije's own calls present the agent's certificate:

1. Replace the `firebase-admin` revocation check with a direct Firebase Auth
   API call made over mTLS.
2. Make `agent/tools/maps.py` use an mTLS-configured session and the APIs'
   mTLS endpoints.
3. Test on a non-production engine, then remove the opt-out and supersede
   this ADR.
