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

/** The fields of Trip the trips list reads. Dates are YYYY-MM-DD. */
export interface TripSummary {
  trip_id: string;
  destination: string;
  start_date: string;
  end_date: string;
}
