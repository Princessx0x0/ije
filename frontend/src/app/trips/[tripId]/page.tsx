"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AuthGate } from "@/components/auth/AuthGate";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadError, Loading, PROFILE_LOAD_ERROR } from "@/components/profile/LoadState";
import { useProfile } from "@/components/profile/useProfile";
import { ChatPanel } from "@/components/trip/ChatPanel";
import { Itinerary } from "@/components/trip/Itinerary";
import { Stays } from "@/components/trip/Stays";
import { usePlaces } from "@/components/trip/usePlaces";
import { useTripAgent } from "@/components/trip/useTripAgent";
import { forecastOpens, formatDates, formatDay, formatMoney } from "@/lib/format";
import { loadTrip, saveItinerary, saveStays, type SavedTrip } from "@/lib/profile";
import type { ItineraryItem, Persona, StayOption } from "@/lib/schema";

export default function TripPage() {
  return (
    <AuthGate>
      <TripLoader />
    </AuthGate>
  );
}

function TripLoader() {
  const { tripId } = useParams<{ tripId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const profile = useProfile();
  const uid = user?.uid ?? null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; trip: SavedTrip | null | "error" } | null>(null);
  const key = `${uid}:${tripId}:${attempt}`;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    loadTrip(uid, tripId).then(
      (trip) => !cancelled && setResult({ key, trip }),
      (error) => {
        console.error("Could not load trip", error);
        if (!cancelled) setResult({ key, trip: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uid, tripId, key]);

  const needsOnboarding = profile.status === "ready" && !profile.persona;
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  const trip = result?.key === key ? result.trip : undefined;

  if (profile.status === "error") return <LoadError message={PROFILE_LOAD_ERROR} onRetry={profile.retry} />;
  if (trip === "error") {
    return (
      <LoadError
        message="We could not load this trip. Check your connection and try again."
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }
  if (trip === null) {
    return (
      <main className="ije-status">
        <h1>Trip not found</h1>
        <p>It may have been deleted, or it belongs to another account.</p>
        <Link href="/trips" className="ije-link">
          Back to your trips
        </Link>
      </main>
    );
  }
  if (profile.status !== "ready" || !profile.persona || trip === undefined) return <Loading />;
  return <TripCanvas key={tripId} uid={uid!} persona={profile.persona} saved={trip} />;
}

function TripCanvas({ uid, persona, saved }: { uid: string; persona: Persona; saved: SavedTrip }) {
  const tripId = saved.trip.trip_id;
  const [items, setItems] = useState<ItineraryItem[]>(saved.trip.items);
  const [stays, setStays] = useState<StayOption[]>(saved.trip.stay_options);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(true);

  const onItems = useCallback(
    (next: ItineraryItem[]) => {
      setItems(next);
      setSaveError(null);
      saveItinerary(uid, tripId, next).catch((e) => {
        console.error("Could not save itinerary", e);
        setSaveError("Your itinerary is shown but was not saved. Check your connection, then ask Ije for any change to save it.");
      });
    },
    [uid, tripId],
  );

  const onStays = useCallback(
    (next: StayOption[]) => {
      setStays(next);
      saveStays(uid, tripId, next).catch((e) => {
        console.error("Could not save stays", e);
        setSaveError("Your stays are shown but were not saved. Check your connection, then ask Ije again.");
      });
    },
    [uid, tripId],
  );

  const trip = { ...saved.trip, items, stay_options: stays };
  const { isReady, isRunning, lines, send, error, weather } = useTripAgent({
    persona,
    vibe: saved.vibe,
    trip,
    onItems,
    onStays,
  });
  const places = usePlaces([
    ...items.map((i) => i.place_id),
    ...stays.flatMap((s) => (s.place_id ? [s.place_id] : [])),
  ]);
  const opens = forecastOpens(saved.trip.start_date);

  // First visit: nothing planned yet, so start planning once the agent is ready.
  const started = useRef(false);
  useEffect(() => {
    if (!isReady || started.current || items.length > 0) return;
    started.current = true;
    void send("Plan my trip.");
  }, [isReady, items.length, send]);

  const askedQuestion = !isRunning && items.length === 0 && lines.some((l) => l.role === "assistant");
  const { trip: t } = saved;

  return (
    <>
      <AppHeader />
      <div className={chatOpen ? "ije-trip ije-trip--chat" : "ije-trip"}>
        <main className="ije-trip__canvas">
          <div className="ije-page__head">
            <div className="ije-field">
              <h1 className="ije-page__title">{t.destination}</h1>
              <p className="ije-caption">
                {formatDates(t.start_date, t.end_date)} · {t.travellers}{" "}
                {t.travellers === 1 ? "traveller" : "travellers"} ·{" "}
                {formatMoney(t.budget_total.amount_minor, t.budget_total.currency)} in total
              </p>
              {opens && <p className="ije-caption">Forecast available from {formatDay(opens)}.</p>}
            </div>
            <button
              type="button"
              className="ije-button ije-button--secondary"
              aria-expanded={chatOpen}
              aria-controls="trip-chat"
              onClick={() => setChatOpen((o) => !o)}
            >
              {chatOpen ? "Hide chat" : "Ask Ije"}
            </button>
          </div>

          {saveError && (
            <p className="ije-notice ije-notice--error" role="alert">
              {saveError}
            </p>
          )}
          {error && (
            <div className="ije-field">
              <p className="ije-notice ije-notice--error" role="alert">
                {error}
              </p>
              {items.length === 0 && (
                <button type="button" className="ije-button" onClick={() => void send("Plan my trip.")}>
                  Try again
                </button>
              )}
            </div>
          )}

          {items.length > 0 ? (
            <Itinerary items={items} places={places} weather={weather?.days ?? []} />
          ) : isRunning || !isReady ? (
            <section className="ije-card ije-planning" role="status" aria-live="polite">
              <h2 className="ije-card__title">Planning your days</h2>
              <p>Ije is working through your preferences, the vibe and what the group needs. This takes a moment.</p>
            </section>
          ) : askedQuestion ? (
            <p className="ije-notice">Ije has a question before planning. Answer it in the chat.</p>
          ) : null}

          <Stays stays={stays} places={places} />

          {(items.length > 0 || stays.length > 0) && (
            <p className="ije-caption">Places and weather from Google Maps</p>
          )}
        </main>

        <div hidden={!chatOpen}>
          <ChatPanel id="trip-chat" lines={lines} isRunning={isRunning} disabled={!isReady} onSend={(text) => void send(text)} />
        </div>
      </div>
    </>
  );
}
