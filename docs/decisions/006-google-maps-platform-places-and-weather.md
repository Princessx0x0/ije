# ADR 006: Google Maps Platform for places, stays and weather

- **Status:** Accepted
- **Date:** 2026-10-15

## Context

The agent planned with no real data. Every itinerary item had
`place_id: "unverified"` and a source URL the model chose itself, there was no
weather, and the agent could not suggest a stay. When asked for a hotel it said
it had no way to look one up: correct, and the behaviour we want to keep, but it
means the product cannot do its job.

The agent needs real places (sights, restaurants, hotels) with stable IDs and a
named source, and a weather forecast for the trip's dates.

## Decision

- Use **Places API (New)** for sights, food, activities and lodging, and the
  **Weather API** for daily forecasts. Both are Google Maps Platform, billed to
  `ije-travel-511008` like the rest of Ije, so no new vendor receives data.
- The agent calls them with its own identity (Agent Identity, which already has
  `roles/serviceusage.serviceUsageConsumer`) using OAuth bearer tokens and the
  `X-Goog-User-Project` header. Both APIs were verified to accept OAuth on
  2026-10-15, so there is no API key anywhere (ADR 002 holds).
- The frontend server looks up place names for display with its own service
  account, which needs the same `serviceUsageConsumer` role. Only signed-in users
  (verified Firebase ID token) can trigger a lookup, because each one costs money.
- Stays: hotels come from Places (`lodging`). Airbnb has no API we may use, so an
  Airbnb option is a search link built by our code from a fixed template
  (destination and dates), never written by the model.
- Weather: a real forecast only when the trip starts within the API's 10-day
  window. Further out, the agent and the app say when the forecast will be
  available. No climate averages and no model-invented numbers.

## What the Maps terms require, and how Ije complies

| Requirement | How Ije meets it |
| --- | --- |
| Place IDs may be stored indefinitely; other Places content must not be stored | Firestore holds `place_id`, our own reason text and links only. `update_itinerary` rejects a reason that repeats the place name, so names never reach Firestore through model text. Names and addresses are fetched live for display. |
| Latitude and longitude may be cached for at most 30 days | Not stored. The agent uses coordinates only within a run (`temp:` session state). |
| Weather content may only be cached temporarily | `trip.weather` is `derived` in `agent/schema.py`: session state only, never written to Firestore. |
| Attribution | Item cards link to Google Maps, and the canvas shows a "Google Maps" attribution line (there is no Google map on the page). |
| No use of Maps content to train models | Content is passed to Gemini only as tool results within a run; nothing is used for training. |
| Weather content must not be used to build a weather product | Ije is a travel planner; weather is one input to an itinerary. |

## Costs (estimates; check Google's pricing page before launch)

- Text Search: about $0.03 to $0.04 per call depending on the fields requested. A
  full plan makes roughly 5 to 15 calls.
- Place Details for display: about $0.02 per place, per view.
- Weather: a few calls per trip.
- Maps Platform includes a monthly free allowance per SKU, which covers
  development and early testing.

## Consequences

- Itineraries contain real, named places with a source the user can check.
- The trip's destination, dates and the needs used in searches (for example
  "halal restaurant" or "step-free museum") are sent to Google Maps Platform.
  `docs/privacy-governance.md` records this.
- Every new data source needs an ADR like this one.
- Usage needs a budget alert before launch.
