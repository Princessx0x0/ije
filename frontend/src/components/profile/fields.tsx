"use client";

import {
  ACCESSIBILITY,
  CURRENCIES,
  DIETARY,
  type Accessibility,
  type Currency,
  type Dietary,
  type Interest,
} from "@/lib/schema";

/** Form controls shared by onboarding (the persona) and the trip form (party needs). */

export const INTEREST_LABELS: Record<Interest, string> = {
  culture: "Culture",
  history: "History",
  food: "Food",
  nature: "Nature",
  adventure: "Adventure",
  relaxation: "Relaxation",
  shopping: "Shopping",
  nightlife: "Nightlife",
  art: "Art",
};

export const DIETARY_LABELS: Record<Dietary, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  halal: "Halal",
  kosher: "Kosher",
  "gluten-free": "Gluten free",
  "dairy-free": "Dairy free",
};

export const ACCESSIBILITY_LABELS: Record<Accessibility, string> = {
  wheelchair: "Wheelchair user",
  "step-free": "Step-free access",
  "limited-walking": "Limited walking",
  visual: "Low vision or blind",
  hearing: "Deaf or hard of hearing",
};

export const CURRENCY_LABELS: Record<Currency, string> = { GBP: "£ GBP", USD: "$ USD", EUR: "€ EUR" };

/** Allergies are typed as one comma separated line. */
export function parseAllergies(text: string): string[] {
  return text
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

export interface NeedsDraft {
  dietary: Dietary[];
  /** Comma separated, as typed. */
  allergies: string;
  accessibility: Accessibility[];
}

/** Diet, allergies and access needs. Render only when health consent is on record. */
export function NeedsFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: NeedsDraft;
  onChange: (next: NeedsDraft) => void;
}) {
  return (
    <>
      <ChipGroup
        legend="Diet"
        options={DIETARY}
        labels={DIETARY_LABELS}
        value={value.dietary}
        onChange={(dietary) => onChange({ ...value, dietary })}
      />
      <div className="ije-field">
        <label className="ije-field__label" htmlFor={`${idPrefix}-allergies`}>
          Allergies
        </label>
        <input
          id={`${idPrefix}-allergies`}
          className="ije-field__input"
          value={value.allergies}
          onChange={(e) => onChange({ ...value, allergies: e.target.value })}
          aria-describedby={`${idPrefix}-allergies-hint`}
        />
        <p id={`${idPrefix}-allergies-hint`} className="ije-field__hint">
          Separate each one with a comma, for example peanuts, shellfish.
        </p>
      </div>
      <ChipGroup
        legend="Access needs"
        options={ACCESSIBILITY}
        labels={ACCESSIBILITY_LABELS}
        value={value.accessibility}
        onChange={(accessibility) => onChange({ ...value, accessibility })}
      />
    </>
  );
}

export function CurrencyPicker({
  value,
  onChange,
  legend = "Currency",
}: {
  value: Currency;
  onChange: (next: Currency) => void;
  legend?: string;
}) {
  return (
    <fieldset className="ije-fieldset">
      <legend className="ije-field__label">{legend}</legend>
      <div className="ije-segmented">
        {CURRENCIES.map((c) => (
          <button
            key={c}
            type="button"
            className="ije-segmented__option"
            aria-pressed={value === c}
            onClick={() => onChange(c)}
          >
            {CURRENCY_LABELS[c]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ChipGroup<T extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset className="ije-fieldset">
      <legend className="ije-field__label">{legend}</legend>
      <div className="ije-chips">
        {options.map((option) => {
          const pressed = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              className="ije-chip"
              aria-pressed={pressed}
              onClick={() => onChange(pressed ? value.filter((v) => v !== option) : [...value, option])}
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
