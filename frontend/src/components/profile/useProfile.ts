"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { loadProfile, type Profile } from "@/lib/profile";

type ProfileState = { status: "loading" } | ({ status: "ready" } & Profile) | { status: "error" };

/**
 * The signed-in user's saved profile. Keyed by uid, so a guest upgrading in
 * place keeps their result, and switching accounts loads the new one.
 */
export function useProfile(): ProfileState & { retry: () => void } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; state: ProfileState } | null>(null);
  const key = `${uid}:${attempt}`;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    loadProfile(uid).then(
      (profile) => !cancelled && setResult({ key, state: { status: "ready", ...profile } }),
      (error) => {
        console.error("Could not load profile", error);
        if (!cancelled) setResult({ key, state: { status: "error" } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uid, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: ProfileState = result?.key === key ? result.state : { status: "loading" };
  return { ...state, retry };
}
