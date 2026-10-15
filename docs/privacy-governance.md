# Privacy governance worksheet

Status: **open**. This is not the privacy policy. It records what Ije does with
personal data today and the decisions the governance phase must make before a
policy can be written and published. Update it as features land; the policy is
written from it at the end.

Do not ship a `/privacy` page from this file until every item in "Decisions
needed" is closed.

## What we collect (as built)

| Data | Where it comes from | Special category? | Stored in |
| --- | --- | --- | --- |
| Firebase uid, email, sign-in provider | Firebase Auth (email, Google, anonymous) | No | Firebase Auth |
| Persona: interests, preferred currency | Onboarding | No | Firestore `users/{uid}`, copied into agent session state |
| Persona: diet, allergies, access needs | Onboarding | **Yes, likely health data** (UK GDPR Art. 9) | Firestore `users/{uid}`, copied into agent session state |
| Trip: destination, dates, budget, travellers, group type | Trip form, agent | No | Firestore `users/{uid}/trips`, agent session state |
| Party needs: diet, allergies, access needs of the group | Trip form (`/trips/new`), only after health consent | **Yes, and about other people** | Firestore trip, agent session state, sent to Gemini in every planning run |
| Vibe: pace, local or well known, style | Trip form | No | Firestore trip, agent session state |
| Itinerary items | Agent | No | Firestore trip, agent session state |
| Chat messages with the agent | Chat panel | Can contain anything the user types | Agent Platform Sessions |

Note: `halal` and `kosher` can reveal religious belief, which is also special
category data.

## Where it goes (as built)

| Processor / service | Purpose | Region |
| --- | --- | --- |
| Firestore (Google Cloud) | Durable persona and trips | `us-central1` (ADR 005 addendum) |
| Agent Platform Sessions (Google Cloud) | Agent working memory, chat history | `us-central1` |
| Vertex AI Gemini (Google Cloud) | Generating itineraries | `us-central1` (confirm no global endpoint is used) |
| Firebase Authentication | Accounts | Not region-selectable; confirm with Google |
| Cloud Run (Google Cloud) | Frontend, request logs | `us-central1` |

No other third party receives user data: CopilotKit telemetry and Intelligence
are off (ADR 004). Fonts are self-hosted.

**Nothing is stored in the UK.** Every UK user's data, health details included,
is transferred to and stored in the US.

## Decisions needed before writing the policy

1. **Controller.** Who is the data controller (name, address, contact email)?
   Is ICO registration and the data protection fee required?
2. **Lawful basis for ordinary data.** Likely contract (providing the service).
   Confirm.
3. **Condition for special category data.** Built assuming explicit consent
   (Art. 9(2)(a)). Confirm that is the right condition. What exists:
   - Onboarding and Travel preferences show an unticked consent checkbox; the
     diet, allergy and access fields only appear once it is ticked.
   - Firestore `users/{uid}.consents.health` records `{ granted, version, at }`.
   - Withdrawing (unticking, then saving) writes the health fields empty.
   - `firestore.rules` refuses health fields, and trip `party_needs`, unless
     consent to the current wording version is on record.
   - Withdrawal also clears `party_needs` on every trip, in the same batch.
   - Persona and party needs are sent to Gemini (Vertex AI) as session state
     on every planning run; without consent they are sent empty.
   - Gaps: when the wording version is bumped, old health data stays in
     Firestore until the user next saves preferences (decide whether to purge
     it). Once the agent session receives the persona, withdrawal must also
     clear it there.
4. **Party needs.** Users enter health details about other travellers. The
   rules require the user's own consent, but that is not the other travellers'
   consent. How is it justified, and what do we tell the user to tell them?
5. **UK to US transfer mechanism.** UK Extension to the EU-US Data Privacy
   Framework (Google LLC's certification), or the IDTA / UK Addendum through
   Google's Cloud Data Processing Addendum. Pick one and record it.
   Or: reconsider the region (would mean moving Firestore, sessions and the
   agent; ADR 005 explains why they are co-located).
6. **Retention.**
   - Agent sessions: how long do managed sessions persist? Set a TTL or cleanup job.
   - Anonymous accounts: abandoned guest uids and their Firestore data never
     expire today. Decide a period and implement cleanup.
   - Cloud Run and Vertex AI logs: confirm whether prompts or request bodies
     are logged, and their retention.
7. **Vertex AI data use.** Confirm Gemini on Vertex AI does not train on
   prompts, and whether abuse-monitoring logging applies to this project.
8. **DPIA.** Special category data, at scale, sent to an AI model: a Data
   Protection Impact Assessment is very likely required. Do it before launch.
9. **User rights.** Erasure is designed (backend contract, "Account deletion").
   Still needed: access / export, rectification (preferences screen covers
   persona), and how to contact us.
10. **Children.** Minimum age, and whether family trips change anything.

## When this is closed

- Write `frontend/src/app/privacy/page.tsx` from this file, in the voice rules
  of `docs/design-system.md` (plain, no em dashes).
- Link it from onboarding, the trip form (party needs) and the account menu.
- Record the transfer mechanism and special category condition in an ADR.
