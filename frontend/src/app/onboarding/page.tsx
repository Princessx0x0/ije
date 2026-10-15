"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AuthGate } from "@/components/auth/AuthGate";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadError, Loading, PROFILE_LOAD_ERROR } from "@/components/profile/LoadState";
import { useProfile } from "@/components/profile/useProfile";
import { savePersona } from "@/lib/profile";
import {
  ACCESSIBILITY,
  CURRENCIES,
  DIETARY,
  INTERESTS,
  type Accessibility,
  type Currency,
  type Dietary,
  type Interest,
  type Persona,
} from "@/lib/schema";

const INTEREST_LABELS: Record<Interest, string> = {
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

const DIETARY_LABELS: Record<Dietary, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  halal: "Halal",
  kosher: "Kosher",
  "gluten-free": "Gluten free",
  "dairy-free": "Dairy free",
};

const ACCESSIBILITY_LABELS: Record<Accessibility, string> = {
  wheelchair: "Wheelchair user",
  "step-free": "Step-free access",
  "limited-walking": "Limited walking",
  visual: "Low vision or blind",
  hearing: "Deaf or hard of hearing",
};

const CURRENCY_LABELS: Record<Currency, string> = { GBP: "£ GBP", USD: "$ USD", EUR: "€ EUR" };

export default function OnboardingPage() {
  return (
    <AuthGate>
      <Onboarding />
    </AuthGate>
  );
}

function Onboarding() {
  const profile = useProfile();
  if (profile.status === "error") return <LoadError message={PROFILE_LOAD_ERROR} onRetry={profile.retry} />;
  if (profile.status !== "ready") return <Loading />;
  // Starts from what they saved, so the same form edits preferences later.
  return <PersonaForm saved={profile.persona} savedConsent={profile.healthConsent} />;
}

function PersonaForm({ saved, savedConsent }: { saved: Persona | null; savedConsent: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  // Health fields start from what was saved only under current consent.
  const health = savedConsent ? saved : null;
  const [interests, setInterests] = useState<Interest[]>(saved?.interests ?? []);
  const [healthConsent, setHealthConsent] = useState(savedConsent);
  const [dietary, setDietary] = useState<Dietary[]>(health?.dietary ?? []);
  const [accessibility, setAccessibility] = useState<Accessibility[]>(health?.accessibility ?? []);
  const [allergies, setAllergies] = useState((health?.allergies ?? []).join(", "));
  const [currency, setCurrency] = useState<Currency>(saved?.preferred_currency ?? "GBP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await savePersona(
        user.uid,
        {
        interests,
        dietary,
        accessibility,
        allergies: allergies
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        preferred_currency: currency,
        },
        healthConsent,
      );
      // A new user goes straight into planning; editing preferences returns to their trips.
      router.replace(saved ? "/trips" : "/trips/new");
    } catch (err) {
      console.error("Could not save persona", err);
      setError("We could not save your preferences. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="ije-page">
        <div className="ije-field">
          <h1 className="ije-page__title">{saved ? "Travel preferences" : "Tell us how you travel"}</h1>
          <p className="ije-auth__lede">
            Ije uses this for every trip you plan. Everything except currency is optional, and you can change it later.
          </p>
        </div>

        <form className="ije-card ije-card--roomy" onSubmit={onSubmit}>
          <ChipGroup legend="What do you enjoy?" options={INTERESTS} labels={INTEREST_LABELS} value={interests} onChange={setInterests} />

          <section className="ije-card ije-card--inset" aria-labelledby="health-heading">
            <h2 id="health-heading" className="ije-card__title">
              Diet, allergies and access needs
            </h2>
            <p>
              These help Ije plan safe, comfortable days. They can show health information or religious belief, so we only
              keep them with your permission. They are stored with Google Cloud in the United States.
            </p>
            <div className="ije-check">
              <input
                id="health-consent"
                type="checkbox"
                className="ije-check__input"
                checked={healthConsent}
                onChange={(e) => setHealthConsent(e.target.checked)}
                aria-describedby="health-consent-hint"
              />
              <label htmlFor="health-consent" className="ije-check__label">
                I agree to Ije keeping my diet, allergies and access needs to plan my trips
              </label>
            </div>
            <p id="health-consent-hint" className="ije-field__hint">
              Optional. Untick this at any time in Travel preferences, and saving will delete them.
            </p>
            {savedConsent && !healthConsent && (
              <p className="ije-notice" role="status">
                When you save, your diet, allergies and access needs will be deleted.
              </p>
            )}
          </section>

          {healthConsent && (
            <>
              <ChipGroup legend="Diet" options={DIETARY} labels={DIETARY_LABELS} value={dietary} onChange={setDietary} />

              <div className="ije-field">
                <label className="ije-field__label" htmlFor="allergies">
                  Allergies
                </label>
                <input
                  id="allergies"
                  className="ije-field__input"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  aria-describedby="allergies-hint"
                />
                <p id="allergies-hint" className="ije-field__hint">
                  Separate each one with a comma, for example peanuts, shellfish.
                </p>
              </div>

              <ChipGroup
                legend="Access needs"
                options={ACCESSIBILITY}
                labels={ACCESSIBILITY_LABELS}
                value={accessibility}
                onChange={setAccessibility}
              />
            </>
          )}

          <fieldset className="ije-fieldset">
            <legend className="ije-field__label">Currency</legend>
            <div className="ije-segmented">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="ije-segmented__option"
                  aria-pressed={currency === c}
                  onClick={() => setCurrency(c)}
                >
                  {CURRENCY_LABELS[c]}
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="ije-notice ije-notice--error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="ije-button ije-button--block" disabled={busy}>
            {saved ? "Save preferences" : "Continue"}
          </button>
        </form>
      </main>
    </>
  );
}

function ChipGroup<T extends string>({
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
