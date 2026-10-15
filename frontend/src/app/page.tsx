"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthGate } from "@/components/auth/AuthGate";
import { LoadError, Loading, PROFILE_LOAD_ERROR } from "@/components/profile/LoadState";
import { useProfile } from "@/components/profile/useProfile";
import { homeFor } from "@/lib/profile";

/**
 * The landing route after sign-in or Continue as guest. Guests and full
 * accounts are treated the same: no persona yet means onboarding, otherwise
 * their trips.
 */
export default function Home() {
  return (
    <AuthGate>
      <RouteHome />
    </AuthGate>
  );
}

function RouteHome() {
  const router = useRouter();
  const profile = useProfile();
  const destination = profile.status === "ready" ? homeFor(profile.persona) : null;

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  if (profile.status === "error") return <LoadError message={PROFILE_LOAD_ERROR} onRetry={profile.retry} />;
  return <Loading />;
}
