"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";

export interface PlaceDisplay {
  name: string;
  address: string | null;
  mapsUrl: string | null;
}

/**
 * Live names and addresses for place IDs, from /api/places. Held in memory for
 * this page only: Maps terms do not allow storing them (ADR 006).
 */
export function usePlaces(ids: string[]): Record<string, PlaceDisplay> {
  const { getIdToken } = useAuth();
  const [places, setPlaces] = useState<Record<string, PlaceDisplay>>({});
  const key = [...new Set(ids)].sort().join(",");

  useEffect(() => {
    const missing = key ? key.split(",").filter((id) => !(id in places)) : [];
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/places", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getIdToken()}` },
          body: JSON.stringify({ ids: missing.slice(0, 60) }),
        });
        if (!res.ok) throw new Error(`places ${res.status}`);
        const { places: found } = (await res.json()) as { places: Record<string, PlaceDisplay> };
        if (!cancelled) setPlaces((prev) => ({ ...prev, ...found }));
      } catch (e) {
        // Cards still render with their reason and Maps link; only the name is missing.
        console.error("Could not load place names", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `places` is read only to skip known IDs; refetching on its change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, getIdToken]);

  return places;
}
