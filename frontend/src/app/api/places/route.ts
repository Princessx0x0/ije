import { GoogleAuth } from "google-auth-library";
import { NextRequest } from "next/server";

import { verifiedUid } from "@/lib/server/firebase-admin";

// Place names for display (ADR 006). Ije stores only place IDs; Maps terms
// do not allow storing names or addresses, so the canvas asks this route each
// time it renders. Each lookup is billed, so only signed-in users may call it.
// Nothing here is cached or stored.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 60;
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const googleAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

export interface PlaceDisplay {
  name: string;
  address: string | null;
  mapsUrl: string | null;
}

async function lookup(id: string, token: string): Promise<[string, PlaceDisplay | null]> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Goog-User-Project": PROJECT ?? "",
      "X-Goog-FieldMask": "id,displayName,formattedAddress,googleMapsUri",
    },
    cache: "no-store",
  });
  if (!res.ok) return [id, null];
  const p = await res.json();
  return [
    id,
    { name: p.displayName?.text ?? "", address: p.formattedAddress ?? null, mapsUrl: p.googleMapsUri ?? null },
  ];
}

export async function POST(req: NextRequest) {
  if (!(await verifiedUid(req.headers.get("authorization")))) {
    return Response.json({ error: "Sign in to see place details." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length > MAX_IDS || !ids.every((id) => typeof id === "string" && PLACE_ID.test(id))) {
    return Response.json({ error: `Send up to ${MAX_IDS} valid place IDs.` }, { status: 400 });
  }
  const token = await googleAuth.getAccessToken();
  if (!token) return Response.json({ error: "Could not reach Google Maps." }, { status: 502 });

  const results = await Promise.all([...new Set(ids as string[])].map((id) => lookup(id, token)));
  return Response.json(
    { places: Object.fromEntries(results.filter(([, p]) => p)) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
