"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AuthGate } from "@/components/auth/AuthGate";
import { useAuth } from "@/components/auth/AuthProvider";
import { CurrencyPicker, NeedsFields, parseAllergies, type NeedsDraft } from "@/components/profile/fields";
import { LoadError, Loading, PROFILE_LOAD_ERROR } from "@/components/profile/LoadState";
import { useProfile } from "@/components/profile/useProfile";
import { createTrip, NO_PARTY_NEEDS } from "@/lib/profile";
import { GROUP_TYPES, type Currency, type GroupType, type Persona, type Vibe } from "@/lib/schema";

const GROUP_LABELS: Record<GroupType, string> = {
  solo: "Just me",
  couple: "A couple",
  family: "Family",
  friends: "Friends",
  business: "Work trip",
};

/** Fixed traveller counts the schema enforces for some group types. */
const FIXED_TRAVELLERS: Partial<Record<GroupType, number>> = { solo: 1, couple: 2 };

/** Longer trips make one agent run very large; plan them in parts. */
const MAX_DAYS = 14;

const VIBES: { key: keyof Vibe; label: string; ends: [string, string]; words: string[] }[] = [
  {
    key: "energy",
    label: "Pace",
    ends: ["Slow", "Packed"],
    words: ["Very slow", "Slow", "Balanced", "Busy", "Packed"],
  },
  {
    key: "local_vs_tourist",
    label: "Local or well known",
    ends: ["Local", "Well known"],
    words: ["Mostly local", "Leaning local", "A mix", "Leaning well known", "Mostly well known"],
  },
  {
    key: "refinement",
    label: "Style",
    ends: ["Casual", "Upscale"],
    words: ["Very casual", "Casual", "A mix", "Polished", "Upscale"],
  },
];

export default function NewTripPage() {
  return (
    <AuthGate>
      <NewTrip />
    </AuthGate>
  );
}

function NewTrip() {
  const router = useRouter();
  const profile = useProfile();
  const needsOnboarding = profile.status === "ready" && !profile.persona;

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  if (profile.status === "error") return <LoadError message={PROFILE_LOAD_ERROR} onRetry={profile.retry} />;
  if (profile.status !== "ready" || !profile.persona) return <Loading />;
  return <PlanTrip persona={profile.persona} healthConsent={profile.healthConsent} />;
}

type Errors = Partial<Record<"destination" | "start" | "end" | "budget" | "group" | "travellers", string>>;

/** Today as YYYY-MM-DD in the traveller's own time zone. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

function PlanTrip({ persona, healthConsent }: { persona: Persona; healthConsent: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"details" | "vibe">("details");

  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState<Currency>(persona.preferred_currency);
  const [group, setGroup] = useState<GroupType | null>(null);
  const [travellers, setTravellers] = useState("2");
  const [needs, setNeeds] = useState<NeedsDraft>({ dietary: [], allergies: "", accessibility: [] });
  const [vibe, setVibe] = useState<Vibe>({ energy: 3, local_vs_tourist: 3, refinement: 3 });

  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const fixedTravellers = group ? FIXED_TRAVELLERS[group] : undefined;
  const travellerCount = fixedTravellers ?? Number(travellers);

  function validate(): Errors {
    const e: Errors = {};
    if (!destination.trim()) e.destination = "Enter where you are going.";
    if (!start) e.start = "Choose a start date.";
    else if (start < today()) e.start = "The start date has already passed.";
    if (!end) e.end = "Choose an end date.";
    else if (start && end < start) e.end = "The end date is before the start date.";
    else if (start && daysBetween(start, end) > MAX_DAYS) e.end = `Ije plans up to ${MAX_DAYS} days at a time.`;
    const amount = Number(budget);
    if (!budget.trim() || !Number.isFinite(amount) || amount <= 0) e.budget = "Enter a total budget above zero.";
    if (!group) e.group = "Choose who is going.";
    else if (!fixedTravellers && !(Number.isInteger(travellerCount) && travellerCount >= 1 && travellerCount <= 20)) {
      e.travellers = "Enter a number from 1 to 20.";
    }
    return e;
  }

  function onDetails(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(`trip-${first}`)?.focus();
      return;
    }
    setStep("vibe");
  }

  async function onFinish(ev: FormEvent) {
    ev.preventDefault();
    if (!user || !group) return;
    setBusy(true);
    setSaveError(null);
    try {
      const tripId = await createTrip(
        user.uid,
        {
          destination: destination.trim(),
          start_date: start,
          end_date: end,
          budget_total: { amount_minor: Math.round(Number(budget) * 100), currency },
          base_place_id: null,
          items: [],
          stay_options: [],
          travellers: travellerCount,
          group_type: group,
          party_needs: healthConsent
            ? { dietary: needs.dietary, allergies: parseAllergies(needs.allergies), accessibility: needs.accessibility }
            : NO_PARTY_NEEDS,
        },
        vibe,
      );
      router.replace(`/trips/${tripId}`);
    } catch (err) {
      console.error("Could not create trip", err);
      setSaveError("We could not save your trip. Check your connection and try again.");
      setBusy(false);
    }
  }

  const fieldError = (key: keyof Errors) =>
    errors[key] ? (
      <p id={`trip-${key}-error`} className="ije-field__error">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: keyof Errors) =>
    errors[key] ? { "aria-invalid": true as const, "aria-describedby": `trip-${key}-error` } : {};

  return (
    <>
      <AppHeader />
      <main className="ije-page">
        <div className="ije-field">
          <p className="ije-caption">Step {step === "details" ? 1 : 2} of 2</p>
          <h1 className="ije-page__title" ref={headingRef} tabIndex={-1}>
            {step === "details" ? "Where to?" : "How should it feel?"}
          </h1>
        </div>

        {step === "details" ? (
          <form className="ije-card ije-card--roomy" onSubmit={onDetails} noValidate>
            <div className="ije-field">
              <label className="ije-field__label" htmlFor="trip-destination">
                Destination
              </label>
              <input
                id="trip-destination"
                className="ije-field__input"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="For example Lisbon"
                autoComplete="off"
                {...invalid("destination")}
              />
              {fieldError("destination")}
            </div>

            <div className="ije-form-row">
              <div className="ije-field">
                <label className="ije-field__label" htmlFor="trip-start">
                  First day
                </label>
                <input
                  id="trip-start"
                  type="date"
                  className="ije-field__input"
                  value={start}
                  min={today()}
                  onChange={(e) => setStart(e.target.value)}
                  {...invalid("start")}
                />
                {fieldError("start")}
              </div>
              <div className="ije-field">
                <label className="ije-field__label" htmlFor="trip-end">
                  Last day
                </label>
                <input
                  id="trip-end"
                  type="date"
                  className="ije-field__input"
                  value={end}
                  min={start || today()}
                  onChange={(e) => setEnd(e.target.value)}
                  {...invalid("end")}
                />
                {fieldError("end")}
              </div>
            </div>

            <div className="ije-field">
              <label className="ije-field__label" htmlFor="trip-budget">
                Total budget for the group
              </label>
              <input
                id="trip-budget"
                className="ije-field__input"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="For example 1800"
                {...invalid("budget")}
              />
              {fieldError("budget")}
            </div>
            <CurrencyPicker legend="Budget currency" value={currency} onChange={setCurrency} />

            <fieldset className="ije-fieldset" {...(errors.group ? { "aria-describedby": "trip-group-error" } : {})}>
              <legend className="ije-field__label">Who is going?</legend>
              <div className="ije-chips">
                {GROUP_TYPES.map((g, i) => (
                  <button
                    key={g}
                    id={i === 0 ? "trip-group" : undefined}
                    type="button"
                    className="ije-chip"
                    aria-pressed={group === g}
                    onClick={() => setGroup(g)}
                  >
                    {GROUP_LABELS[g]}
                  </button>
                ))}
              </div>
              {fieldError("group")}
            </fieldset>

            {group && !fixedTravellers && (
              <div className="ije-field">
                <label className="ije-field__label" htmlFor="trip-travellers">
                  How many people, including you?
                </label>
                <input
                  id="trip-travellers"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  className="ije-field__input ije-field__input--short"
                  value={travellers}
                  onChange={(e) => setTravellers(e.target.value)}
                  {...invalid("travellers")}
                />
                {fieldError("travellers")}
              </div>
            )}

            <section className="ije-card ije-card--inset" aria-labelledby="party-heading">
              <h2 id="party-heading" className="ije-card__title">
                Needs for the whole group
              </h2>
              {healthConsent ? (
                <>
                  <p>Add anything the group needs on this trip, beyond your own preferences.</p>
                  <NeedsFields idPrefix="party" value={needs} onChange={setNeeds} />
                </>
              ) : (
                <p>
                  To plan around diet, allergies or access needs, first agree to Ije keeping them in{" "}
                  <Link href="/onboarding" className="ije-link ije-link--inline">
                    Travel preferences
                  </Link>
                  .
                </p>
              )}
            </section>

            <button type="submit" className="ije-button ije-button--block">
              Next: the vibe
            </button>
          </form>
        ) : (
          <form className="ije-card ije-card--roomy" onSubmit={onFinish}>
            {VIBES.map(({ key, label, ends, words }) => (
              <div key={key} className="ije-vibe">
                <div className="ije-vibe__head">
                  <label className="ije-field__label" htmlFor={`vibe-${key}`}>
                    {label}
                  </label>
                  <span className="ije-vibe__value" aria-hidden="true">
                    {words[vibe[key] - 1]}
                  </span>
                </div>
                <input
                  id={`vibe-${key}`}
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  className="ije-slider"
                  value={vibe[key]}
                  aria-valuetext={words[vibe[key] - 1]}
                  onChange={(e) => setVibe({ ...vibe, [key]: Number(e.target.value) })}
                />
                <div className="ije-vibe__ends" aria-hidden="true">
                  <span>{ends[0]}</span>
                  <span>{ends[1]}</span>
                </div>
              </div>
            ))}

            {saveError && (
              <p className="ije-notice ije-notice--error" role="alert">
                {saveError}
              </p>
            )}

            <div className="ije-form-actions">
              <button type="button" className="ije-button ije-button--secondary" onClick={() => setStep("details")}>
                Back
              </button>
              <button type="submit" className="ije-button" disabled={busy}>
                {busy ? "Saving" : "Plan my trip"}
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
