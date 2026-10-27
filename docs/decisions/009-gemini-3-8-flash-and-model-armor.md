# ADR 009: Gemini 3.8 Flash, screened by Model Armor

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Google's model lifecycle page lists `gemini-2.5-flash` (the agent) and
`gemini-2.5-pro` (the eval judge) as retired on 20 October 2026, with
`gemini-3.8-flash` as the named replacement. Both still answered on 27 October,
but that can stop without notice.

Ije passes untrusted text to Gemini: chat messages, and Places results written
by third parties. A Model Armor template, `ije-guardrails`, was created to screen
it (first in `us-central1`, now also in the `us` multi-region): prompt injection and jailbreak (medium and above),
malicious URLs, and responsible AI filters (hate, dangerous, sexually explicit,
harassment, high confidence), `INSPECT_AND_BLOCK`, data residency compliant.

Checked on 27 October 2026:
- `gemini-3.8-flash` and `gemini-4-argon` answer on the global endpoint and
  return 404 in `us-central1`.
- On the global endpoint a `us-central1` template is found only when the
  request lands in that region: 6 of 8 benign calls failed with "template not
  found" (400). On the `us` endpoint with a `us` template: 8 of 8 benign calls
  answered and 4 of 4 injections were blocked (`blockReason: MODEL_ARMOR`).
- Streamed calls (`streamGenerateContent`) are not screened: the same injection
  went straight to the model. The AG-UI adapter streams by default.

## Decision

- The agent runs on `gemini-3.8-flash`: the named replacement, same Flash tier.
  `gemini-4-argon` is newer, but Google has not published its tier or pricing.
- Gemini runs on the **`us` multi-region** endpoint (`GOOGLE_CLOUD_LOCATION=us`),
  with the template copied to Model Armor's `us` location. This supersedes the
  location in ADR 007: prompts are now processed only in US data centres.
- The agent never streams (`run_config` in `agent/main.py`), so every call is
  screened. Chat replies arrive whole instead of word by word.
- Every Gemini call carries `model_armor_config` with `ije-guardrails` for both
  prompt and response, set from `IJE_MODEL_ARMOR_TEMPLATE`. The agent refuses to
  start on Agent Runtime without it, so it is never served unscreened.
- A blocked prompt gets a plain reply naming what Ije can do, and the turn ends.
- The Vertex AI service agent
  (`service-788712976210@gcp-sa-aiplatform.iam.gserviceaccount.com`) holds
  `roles/modelarmor.user`. Model Armor screens on its behalf, not the agent's.
- The eval judge moves to `gemini-4-argon` on the global endpoint: a different
  model from the agent, so the agent is never graded by itself.

## Consequences

- Multi-region pricing is about 10% above global. Capacity is narrower than
  global, so the existing retries matter more; watch for `429`s.
- Evidence of every test is in `docs/evidence/lab-3-govern/`.
- Model Armor fails open: if it is unavailable, Vertex AI skips screening and
  carries on. It is a layer on top of the rules in `agent/tools/rules.py`, never
  a replacement for them. Request-level templates also mean Gemini safety
  settings must not be set on the same request (they error together).
- Model Armor is Google Cloud, so no new third party. It sees the same prompts
  Gemini does, including health details; `docs/privacy-governance.md` records it.
- Responses blocked by the template are not yet mapped to a friendly reply; a
  blocked response surfaces as an error. Map it once its shape is confirmed.
- Eval scores from the new judge are not comparable with old 2.5 Pro scores.
  Re-run the full core and held-out sets before deploying.
