/**
 * TypeScript mirrors of the state shapes in agent/schema.py, which is the
 * source of truth. Keep these in step with it; never add a user id field.
 */

export const CURRENCIES = ["GBP", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DIETARY = ["vegetarian", "vegan", "halal", "kosher", "gluten-free", "dairy-free"] as const;
export type Dietary = (typeof DIETARY)[number];

export const ACCESSIBILITY = ["wheelchair", "step-free", "limited-walking", "visual", "hearing"] as const;
export type Accessibility = (typeof ACCESSIBILITY)[number];

export const INTERESTS = [
  "culture",
  "history",
  "food",
  "nature",
  "adventure",
  "relaxation",
  "shopping",
  "nightlife",
  "art",
] as const;
export type Interest = (typeof INTERESTS)[number];

export interface Persona {
  dietary: Dietary[];
  allergies: string[];
  accessibility: Accessibility[];
  interests: Interest[];
  preferred_currency: Currency;
}

export interface Money {
  amount_minor: number;
  currency: Currency;
}

export const GROUP_TYPES = ["solo", "couple", "family", "friends", "business"] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

/** How this trip should feel. Integers 1 to 5. */
export interface Vibe {
  energy: number; // 1 slow, 5 packed
  local_vs_tourist: number; // 1 local, 5 tourist
  refinement: number; // 1 casual, 5 upscale
}

/** Combined needs of everyone on the trip. Special category data: needs consent. */
export interface PartyNeeds {
  dietary: Dietary[];
  allergies: string[];
  accessibility: Accessibility[];
}

export const SLOTS = ["morning", "afternoon", "evening"] as const;
export type Slot = (typeof SLOTS)[number];

export interface ItineraryItem {
  item_id: string;
  place_id: string;
  day: string; // YYYY-MM-DD
  slot: Slot;
  category: "sight" | "activity" | "food" | "shopping" | "nightlife";
  pick_type: "local" | "tourist";
  reason: string;
  source_url: string;
}

export interface DayWeather {
  day: string; // YYYY-MM-DD
  condition: "sunny" | "cloudy" | "rainy" | "snowy" | "mixed";
  temp_c: number;
}

/** Derived: from the Weather API in the agent's session, never stored (ADR 006). */
export interface Weather {
  mode: "forecast" | "seasonal";
  fetched_at: string;
  days: DayWeather[];
}

/** A stay suggestion. Hotels carry a place_id; names are fetched live, never stored. */
export interface StayOption {
  kind: "hotel" | "airbnb";
  name: string;
  place_id: string | null;
  deep_link: string;
  reason: string;
}

/** Trip as the agent reads it (no vibe, no timestamps). Dates are YYYY-MM-DD. */
export interface Trip {
  trip_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget_total: Money;
  base_place_id: string | null;
  items: ItineraryItem[];
  stay_options: StayOption[];
  travellers: number;
  group_type: GroupType;
  party_needs: PartyNeeds;
}

/** The fields of Trip the trips list reads. Dates are YYYY-MM-DD. */
export interface TripSummary {
  trip_id: string;
  destination: string;
  start_date: string;
  end_date: string;
}
