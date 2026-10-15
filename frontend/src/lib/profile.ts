"use client";

import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";

import { firestore } from "./firebase";
import { CURRENCIES, type ItineraryItem, type PartyNeeds, type Persona, type Trip, type TripSummary, type Vibe } from "./schema";

/*
 * Durable user data in Firestore (backend contract, "Shared state"):
 *   users/{uid}                 { persona, consents, updatedAt }
 *   users/{uid}/trips/{tripId}  { ...Trip, vibe, createdAt, updatedAt }
 * Security rules (firestore.rules) let a user touch only their own path.
 * The uid always comes from the signed-in Firebase user, never from input.
 */

function isPersona(value: unknown): value is Persona {
  return (
    typeof value === "object" &&
    value !== null &&
    CURRENCIES.includes((value as Persona).preferred_currency)
  );
}

/**
 * Explicit consent (UK GDPR Art. 9(2)(a)) for the persona fields that can be
 * special category data: diet (health, religious belief), allergies and
 * access needs. Bump the version whenever the consent wording changes, so
 * users who agreed to older wording are asked again.
 */
export const HEALTH_CONSENT_VERSION = "2026-10-15";

export interface Profile {
  /** Null for a user who has not finished onboarding. */
  persona: Persona | null;
  /** True only for consent given to the current wording. */
  healthConsent: boolean;
}

export async function loadProfile(uid: string): Promise<Profile> {
  const data = (await getDoc(doc(firestore(), "users", uid))).data();
  const consent = data?.consents?.health;
  return {
    persona: isPersona(data?.persona) ? data.persona : null,
    healthConsent: consent?.granted === true && consent?.version === HEALTH_CONSENT_VERSION,
  };
}

/**
 * The users/{uid} write for a persona and its consent decision, made together.
 * Without consent the health fields are written empty, so withdrawing consent
 * deletes them. firestore.rules refuses health fields unless the same write
 * records consent. Exported for the rules tests.
 */
export function personaWrite(persona: Persona, healthConsent: boolean) {
  const stored: Persona = healthConsent ? persona : { ...persona, dietary: [], allergies: [], accessibility: [] };
  return {
    persona: stored,
    consents: { health: { granted: healthConsent, version: HEALTH_CONSENT_VERSION, at: serverTimestamp() } },
    updatedAt: serverTimestamp(),
  };
}

export const NO_PARTY_NEEDS: PartyNeeds = { dietary: [], allergies: [], accessibility: [] };

/**
 * Withdrawing consent also clears party_needs on every trip, in the same
 * atomic batch, so no health data is left behind (and later itinerary saves
 * to those trips still pass the rules).
 */
export async function savePersona(uid: string, persona: Persona, healthConsent: boolean): Promise<void> {
  const db = firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), personaWrite(persona, healthConsent), { merge: true });
  if (!healthConsent) {
    const trips = await getDocs(collection(db, "users", uid, "trips"));
    for (const trip of trips.docs) batch.set(trip.ref, partyNeedsClear(), { merge: true });
  }
  await batch.commit();
}

/** The trip update that removes party needs. Exported for the rules tests. */
export function partyNeedsClear() {
  return { party_needs: NO_PARTY_NEEDS, updatedAt: serverTimestamp() };
}

/** A new trip as the app writes it. Exported for the rules tests. */
export function tripWrite(trip: Trip, vibe: Vibe) {
  return { ...trip, vibe, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}

/** The itinerary update the canvas writes after each agent run. Exported for the rules tests. */
export function itineraryWrite(items: ItineraryItem[]) {
  return { items, updatedAt: serverTimestamp() };
}

/** Creates the trip and returns its id, which is also its trip_id and agent thread id. */
export async function createTrip(uid: string, draft: Omit<Trip, "trip_id">, vibe: Vibe): Promise<string> {
  const ref = doc(collection(firestore(), "users", uid, "trips"));
  await setDoc(ref, tripWrite({ ...draft, trip_id: ref.id }, vibe));
  return ref.id;
}

export interface SavedTrip {
  trip: Trip;
  vibe: Vibe;
}

/** The trip split into what the agent reads (trip, vibe), or null if it does not exist. */
export async function loadTrip(uid: string, tripId: string): Promise<SavedTrip | null> {
  const snap = await getDoc(doc(firestore(), "users", uid, "trips", tripId));
  if (!snap.exists()) return null;
  const d = snap.data();
  const trip: Trip = {
    trip_id: snap.id,
    destination: d.destination,
    start_date: d.start_date,
    end_date: d.end_date,
    budget_total: d.budget_total,
    base_place_id: d.base_place_id ?? null,
    items: d.items ?? [],
    stay_options: d.stay_options ?? [],
    travellers: d.travellers,
    group_type: d.group_type,
    party_needs: d.party_needs ?? NO_PARTY_NEEDS,
  };
  return { trip, vibe: d.vibe as Vibe };
}

export async function saveItinerary(uid: string, tripId: string, items: ItineraryItem[]): Promise<void> {
  await setDoc(doc(firestore(), "users", uid, "trips", tripId), itineraryWrite(items), { merge: true });
}

export async function listTrips(uid: string): Promise<TripSummary[]> {
  const snap = await getDocs(collection(firestore(), "users", uid, "trips"));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        trip_id: d.id,
        destination: String(data.destination ?? ""),
        start_date: String(data.start_date ?? ""),
        end_date: String(data.end_date ?? ""),
      };
    })
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
}

/** Where a signed-in user belongs: onboarding until they have a persona. */
export function homeFor(persona: Persona | null): "/onboarding" | "/trips" {
  return persona ? "/trips" : "/onboarding";
}
