"use client";

import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";

import { firestore } from "./firebase";
import { CURRENCIES, type Persona, type TripSummary } from "./schema";

/*
 * Durable user data in Firestore (backend contract, "Shared state"):
 *   users/{uid}                 { persona, consents, updatedAt }
 *   users/{uid}/trips/{tripId}  Trip
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

export async function savePersona(uid: string, persona: Persona, healthConsent: boolean): Promise<void> {
  await setDoc(doc(firestore(), "users", uid), personaWrite(persona, healthConsent), { merge: true });
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
