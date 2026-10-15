"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AuthGate } from "@/components/auth/AuthGate";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadError, Loading, PROFILE_LOAD_ERROR } from "@/components/profile/LoadState";
import { useProfile } from "@/components/profile/useProfile";
import { listTrips } from "@/lib/profile";
import { formatDates } from "@/lib/format";
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
        <div className="ije-page__head">
          <h1 className="ije-page__title">Your trips</h1>
          <Link href="/trips/new" className="ije-button">
            Plan a trip
          </Link>
        </div>
        <TripList />
      </main>
    </>
  );
}

function TripList() {
  const { user } = useAuth();
  const router = useRouter();
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
  const empty = Array.isArray(trips) && trips.length === 0;

  // No trips yet: there is nothing to list, so go straight to planning one.
  useEffect(() => {
    if (empty) router.replace("/trips/new");
  }, [empty, router]);

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
  if (empty) return null;
  return (
    <ul className="ije-trips">
      {trips.map((trip) => (
        <li key={trip.trip_id}>
          <Link href={`/trips/${trip.trip_id}`} className="ije-card ije-card--link">
            <h2 className="ije-card__title">{trip.destination || "Untitled trip"}</h2>
            <p className="ije-caption">{formatDates(trip.start_date, trip.end_date)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
