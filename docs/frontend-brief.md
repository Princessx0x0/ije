# Ije frontend brief

## Visual rules
- Beautiful, calm and consistent. Research typography first and choose deliberately.
- No border lines on cards: separate with spacing, background tone and shadow.
- No neon colours.
- Spacing on an 8px scale only (8, 16, 24, 32, 40, 48, 64...).
- No em dashes anywhere in UI copy.
- Not chat-first: the itinerary canvas is the product, chat is a side channel.

## Accounts (Firebase Auth)
- Sign up and log in with email, or with Google.
- Continue as guest (anonymous auth, can upgrade to a full account later).
- Update preferences (the persona).
- Delete account, removing all stored data (UK GDPR right to erasure).
- Privacy policy page, required because persona data can include health-related details.

## Core flow
1. Onboarding: build the traveller persona (interests, diet, accessibility, currency).
2. Trip details: destination, dates, budget, travellers, group type, party needs.
3. Vibe sliders: energy, local to tourist, refinement.
4. Itinerary canvas: day-by-day cards, each with a reason and a named source.
5. Download the itinerary as a PDF.

## Technical constraints
- Deployed to Cloud Run (us-central1), private, with its own service account.
- The browser never calls Agent Runtime directly; a Next.js server route adds the token.
- Agent: projects/788712976210/locations/us-central1/reasoningEngines/2768957581710852096
