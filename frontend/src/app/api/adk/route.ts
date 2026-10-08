import { GoogleAuth } from "google-auth-library";
import { NextRequest } from "next/server";

// Server-side proxy from CopilotKit to the Ije agent.
//
// The browser never calls Agent Runtime directly: Agent Runtime only accepts
// Google IAM credentials, which a browser must never hold. This route adds the
// frontend service account's access token on the server.
//
// It does NOT decide who the user is. The Firebase ID token travels inside the
// AG-UI request (forwardedProps.firebaseIdToken) and the agent verifies it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agent Runtime passthrough base, ending in /api. Unset locally.
const AGENT_RUNTIME_URL = process.env.AGENT_RUNTIME_URL;
const LOCAL_AGENT_URL = "http://localhost:8000";

const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

export async function POST(req: NextRequest) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: req.headers.get("accept") ?? "text/event-stream",
  };

  let base = LOCAL_AGENT_URL;
  if (AGENT_RUNTIME_URL) {
    // Cached and refreshed automatically by google-auth-library.
    const token = await googleAuth.getAccessToken();
    if (!token) {
      return new Response("Could not obtain a Google access token", { status: 500 });
    }
    headers.Authorization = `Bearer ${token}`;
    base = AGENT_RUNTIME_URL;
  }

  const upstream = await fetch(`${base}/api/adk`, {
    method: "POST",
    headers,
    body: await req.text(),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
