/**
 * Firestore security rules tests. Run with `npm run test:rules`, which starts
 * the Firestore emulator (needs Java 21) under a demo- project, so nothing here
 * can touch the real database. Run before every `firebase deploy --only firestore:rules`.
 */
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, writeBatch, type Firestore } from "firebase/firestore";

import {
  HEALTH_CONSENT_VERSION,
  itineraryWrite,
  NO_PARTY_NEEDS,
  partyNeedsClear,
  personaWrite,
  tripWrite,
} from "../src/lib/profile";
import type { ItineraryItem, Persona, Trip, Vibe } from "../src/lib/schema";

const PERSONA: Persona = {
  interests: ["food", "art"],
  dietary: ["vegetarian"],
  allergies: ["peanuts"],
  accessibility: ["step-free"],
  preferred_currency: "GBP",
};
const NO_HEALTH: Persona = { ...PERSONA, dietary: [], allergies: [], accessibility: [] };

const VIBE: Vibe = { energy: 2, local_vs_tourist: 1, refinement: 3 };

const FULL_TRIP: Trip = {
  trip_id: "t1",
  destination: "Lisbon",
  start_date: "2027-04-01",
  end_date: "2027-04-04",
  budget_total: { amount_minor: 180000, currency: "GBP" },
  base_place_id: null,
  items: [],
  stay_options: [],
  travellers: 2,
  group_type: "couple",
  party_needs: NO_PARTY_NEEDS,
};

const ITEMS: ItineraryItem[] = [
  {
    item_id: "i1",
    place_id: "unverified",
    day: "2027-04-01",
    slot: "morning",
    category: "sight",
    pick_type: "local",
    reason: "A quiet morning with the story of Lisbon tiles.",
    source_url: "https://www.visitlisboa.com/",
  },
];

const TRIP = {
  trip_id: "t1",
  destination: "Lisbon",
  start_date: "2027-04-01",
  end_date: "2027-04-04",
  budget_total: { amount_minor: 180000, currency: "GBP" },
  travellers: 2,
  group_type: "couple",
  items: [],
  stay_options: [],
};

let env: RulesTestEnvironment;

const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const anon = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

/** Writes data as the rules would never allow, to set up a starting state. */
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, path), data);
  });
}

function consent(granted: boolean, version = HEALTH_CONSENT_VERSION) {
  return { health: { granted, version } };
}

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-ije",
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host, port: Number(port) },
  });
});
beforeEach(() => env.clearFirestore());
after(() => env.cleanup());

describe("rules and app agree", () => {
  test("firestore.rules checks the same consent version as the app", () => {
    const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    if (!rules.includes(`'${HEALTH_CONSENT_VERSION}'`)) {
      throw new Error(`firestore.rules does not check HEALTH_CONSENT_VERSION ${HEALTH_CONSENT_VERSION}`);
    }
  });
});

describe("users/{uid}: owner only", () => {
  test("a user can read and write their own doc", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice"), personaWrite(PERSONA, false)));
    await assertSucceeds(getDoc(doc(as("alice"), "users/alice")));
  });

  test("a user cannot read or write someone else's doc", async () => {
    await seed("users/bob", { persona: NO_HEALTH });
    await assertFails(getDoc(doc(as("alice"), "users/bob")));
    await assertFails(setDoc(doc(as("alice"), "users/bob"), personaWrite(PERSONA, false)));
  });

  test("signed-out visitors can do nothing", async () => {
    await seed("users/bob", { persona: NO_HEALTH });
    await assertFails(getDoc(doc(anon(), "users/bob")));
    await assertFails(setDoc(doc(anon(), "users/bob"), personaWrite(PERSONA, false)));
  });

  test("other top-level collections are closed", async () => {
    await assertFails(setDoc(doc(as("alice"), "public/x"), { a: 1 }));
    await assertFails(getDoc(doc(as("alice"), "public/x")));
  });
});

describe("users/{uid}: health fields need explicit consent", () => {
  test("the app's write with consent keeps health fields, and is allowed", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice"), personaWrite(PERSONA, true)));
  });

  test("the app's write without consent empties health fields, and is allowed", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice"), personaWrite(PERSONA, false)));
  });

  for (const [field, value] of [
    ["dietary", ["halal"]],
    ["allergies", ["sesame"]],
    ["accessibility", ["wheelchair"]],
  ] as const) {
    test(`${field} is refused with no consent on record`, async () => {
      await assertFails(setDoc(doc(as("alice"), "users/alice"), { persona: { ...NO_HEALTH, [field]: value } }));
    });
  }

  test("health fields are refused when consent is declined", async () => {
    await assertFails(setDoc(doc(as("alice"), "users/alice"), { persona: PERSONA, consents: consent(false) }));
  });

  test("health fields are refused under consent to older wording", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "users/alice"), { persona: PERSONA, consents: consent(true, "2000-01-01") }),
    );
  });

  test("withdrawing consent while keeping health fields is refused", async () => {
    await seed("users/alice", { persona: PERSONA, consents: consent(true) });
    await assertFails(setDoc(doc(as("alice"), "users/alice"), { persona: PERSONA, consents: consent(false) }, { merge: true }));
  });

  test("withdrawing consent through the app's write is allowed and empties the fields", async () => {
    await seed("users/alice", { persona: PERSONA, consents: consent(true) });
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice"), personaWrite(PERSONA, false), { merge: true }));
    const saved = (await getDoc(doc(as("alice"), "users/alice"))).data();
    if (saved?.persona.dietary.length || saved?.persona.allergies.length || saved?.persona.accessibility.length) {
      throw new Error("health fields survived withdrawal");
    }
  });

  test("a user can delete their own doc", async () => {
    await seed("users/alice", { persona: PERSONA, consents: consent(true) });
    await assertSucceeds(deleteDoc(doc(as("alice"), "users/alice")));
  });
});

describe("users/{uid}/trips: owner only, party needs need consent", () => {
  test("a user can write and read a trip without party needs", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/trips/t1"), TRIP));
    await assertSucceeds(getDoc(doc(as("alice"), "users/alice/trips/t1")));
  });

  test("a user cannot read or write someone else's trips", async () => {
    await seed("users/bob/trips/t1", TRIP);
    await assertFails(getDoc(doc(as("alice"), "users/bob/trips/t1")));
    await assertFails(setDoc(doc(as("alice"), "users/bob/trips/t2"), TRIP));
  });

  test("party needs are refused without consent", async () => {
    await seed("users/alice", { persona: NO_HEALTH, consents: consent(false) });
    await assertFails(
      setDoc(doc(as("alice"), "users/alice/trips/t1"), { ...TRIP, party_needs: { dietary: ["vegan"] } }),
    );
  });

  test("party needs are refused before the user doc exists", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "users/alice/trips/t1"), { ...TRIP, party_needs: { allergies: ["nuts"] } }),
    );
  });

  test("party needs are allowed with current consent", async () => {
    await seed("users/alice", { persona: PERSONA, consents: consent(true) });
    await assertSucceeds(
      setDoc(doc(as("alice"), "users/alice/trips/t1"), {
        ...TRIP,
        party_needs: { dietary: ["vegan"], allergies: [], accessibility: [] },
      }),
    );
  });

  test("empty party needs are allowed without consent", async () => {
    await assertSucceeds(
      setDoc(doc(as("alice"), "users/alice/trips/t1"), {
        ...TRIP,
        party_needs: { dietary: [], allergies: [], accessibility: [] },
      }),
    );
  });
});

describe("trips as the app writes them", () => {
  test("a new trip without party needs is allowed without consent", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/trips/t1"), tripWrite(FULL_TRIP, VIBE)));
  });

  test("a new trip with party needs is allowed with consent", async () => {
    await seed("users/alice", { persona: PERSONA, consents: consent(true) });
    const trip = { ...FULL_TRIP, party_needs: { dietary: ["halal" as const], allergies: [], accessibility: [] } };
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/trips/t1"), tripWrite(trip, VIBE)));
  });

  test("a new trip with party needs is refused without consent", async () => {
    await seed("users/alice", { persona: NO_HEALTH, consents: consent(false) });
    const trip = { ...FULL_TRIP, party_needs: { dietary: [], allergies: ["sesame"], accessibility: [] } };
    await assertFails(setDoc(doc(as("alice"), "users/alice/trips/t1"), tripWrite(trip, VIBE)));
  });

  test("saving an itinerary is allowed", async () => {
    await seed("users/alice/trips/t1", { ...FULL_TRIP, vibe: VIBE });
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/trips/t1"), itineraryWrite(ITEMS), { merge: true }));
  });

  test("another user cannot save an itinerary onto your trip", async () => {
    await seed("users/alice/trips/t1", { ...FULL_TRIP, vibe: VIBE });
    await assertFails(setDoc(doc(as("bob"), "users/alice/trips/t1"), itineraryWrite(ITEMS), { merge: true }));
  });

  test("left-over party needs block itinerary saves after withdrawal, which is why withdrawal clears them", async () => {
    await seed("users/alice", { persona: NO_HEALTH, consents: consent(false) });
    await seed("users/alice/trips/t1", { ...FULL_TRIP, party_needs: { dietary: ["vegan"], allergies: [], accessibility: [] } });
    await assertFails(setDoc(doc(as("alice"), "users/alice/trips/t1"), itineraryWrite(ITEMS), { merge: true }));
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/trips/t1"), partyNeedsClear(), { merge: true }));
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/trips/t1"), itineraryWrite(ITEMS), { merge: true }));
  });

  test("withdrawing consent clears the profile and every trip in one batch", async () => {
    await seed("users/alice", { persona: PERSONA, consents: consent(true) });
    await seed("users/alice/trips/t1", { ...FULL_TRIP, party_needs: { dietary: ["vegan"], allergies: [], accessibility: [] } });
    await seed("users/alice/trips/t2", { ...FULL_TRIP, trip_id: "t2", party_needs: { dietary: [], allergies: ["nuts"], accessibility: [] } });
    const db = as("alice");
    const batch = writeBatch(db);
    batch.set(doc(db, "users/alice"), personaWrite(PERSONA, false), { merge: true });
    batch.set(doc(db, "users/alice/trips/t1"), partyNeedsClear(), { merge: true });
    batch.set(doc(db, "users/alice/trips/t2"), partyNeedsClear(), { merge: true });
    await assertSucceeds(batch.commit());
    for (const id of ["t1", "t2"]) {
      const needs = (await getDoc(doc(db, `users/alice/trips/${id}`))).data()?.party_needs;
      if (needs.dietary.length || needs.allergies.length || needs.accessibility.length) {
        throw new Error(`party needs survived withdrawal on ${id}`);
      }
    }
  });
});
