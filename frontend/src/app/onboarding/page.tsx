"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AuthGate } from "@/components/auth/AuthGate";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadError, Loading, PROFILE_LOAD_ERROR } from "@/components/profile/LoadState";
import { useProfile } from "@/components/profile/useProfile";
import {
  ChipGroup,
  CurrencyPicker,
  INTEREST_LABELS,
  NeedsFields,
  parseAllergies,
} from "@/components/profile/fields";
import { savePersona } from "@/lib/profile";
import {
  INTERESTS,
  type Accessibility,
  type Currency,
  type Dietary,
  type Interest,
  type Persona,
} from "@/lib/schema";

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
          allergies: parseAllergies(allergies),
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
          <ChipGroup
            legend="What do you enjoy?"
            options={INTERESTS}
            labels={INTEREST_LABELS}
            value={interests}
            onChange={setInterests}
          />

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
                I agree to Ije keeping diet, allergies and access needs, mine and my travel group&apos;s, to plan my trips
              </label>
            </div>
            <p id="health-consent-hint" className="ije-field__hint">
              Optional. Untick this at any time in Travel preferences, and saving will delete them, including any added to your trips.
            </p>
            {savedConsent && !healthConsent && (
              <p className="ije-notice" role="status">
                When you save, diet, allergies and access needs will be deleted from your profile and every trip.
              </p>
            )}
          </section>

          {healthConsent && (
            <NeedsFields
              idPrefix="persona"
              value={{ dietary, allergies, accessibility }}
              onChange={(next) => {
                setDietary(next.dietary);
                setAllergies(next.allergies);
                setAccessibility(next.accessibility);
              }}
            />
          )}

          <CurrencyPicker value={currency} onChange={setCurrency} />

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
