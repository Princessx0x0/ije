"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AuthGate } from "@/components/auth/AuthGate";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadError, Loading, PROFILE_LOAD_ERROR } from "@/components/profile/LoadState";
import { useProfile } from "@/components/profile/useProfile";
import { listTrips } from "@/lib/profile";
import type { TripSummary } from "@/lib/schema";

export default function TripsPage() {
  return (
    <AuthGate>
      <Trips />
    </AuthGate>
  );
}

function Trips() {
  const router = useRouter();
  const profile = useProfile();
  const needsOnboarding = profile.status === "ready" && !profile.persona;

  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  if (profile.status === "error") return <LoadError message={PROFILE_LOAD_ERROR} onRetry={profile.retry} />;
  if (profile.status !== "ready" || needsOnboarding) return <Loading />;

  return (
    <>
      <AppHeader />
      <main className="ije-page">
        <h1 className="ije-page__title">Your trips</h1>
        <TripList />
      </main>
    </>
  );
}

function TripList() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; trips: TripSummary[] | "error" } | null>(null);
  const key = `${uid}:${attempt}`;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    listTrips(uid).then(
      (trips) => !cancelled && setResult({ key, trips }),
      (error) => {
        console.error("Could not load trips", error);
        if (!cancelled) setResult({ key, trips: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uid, key]);

  const trips = result?.key === key ? result.trips : null;

  if (trips === null) return <p aria-busy="true">Loading your trips</p>;
  if (trips === "error") {
    return (
      <div className="ije-field">
        <p className="ije-notice ije-notice--error" role="alert">
          We could not load your trips. Check your connection and try again.
        </p>
        <button type="button" className="ije-button" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }
  if (trips.length === 0) {
    return (
      <section className="ije-card">
        <h2 className="ije-card__title">No trips yet</h2>
        <p>When you plan a trip, it will be kept here.</p>
      </section>
    );
  }
  return (
    <ul className="ije-trips">
      {trips.map((trip) => (
        <li key={trip.trip_id} className="ije-card">
          <h2 className="ije-card__title">{trip.destination || "Untitled trip"}</h2>
          <p className="ije-caption">{formatDates(trip.start_date, trip.end_date)}</p>
        </li>
      ))}
    </ul>
  );
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function formatDates(start: string, end: string): string {
  const parse = (d: string) => new Date(`${d}T00:00:00Z`);
  const a = parse(start);
  const b = parse(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "Dates not set";
  return start === end ? DATE.format(a) : DATE.formatRange(a, b);
}
