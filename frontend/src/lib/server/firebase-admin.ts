import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

/**
 * Firebase Admin for server routes. Uses the runtime's Google credentials
 * (the frontend service account on Cloud Run, ADC locally); no key files.
 */
function adminApp() {
  return getApps()[0] ?? initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}

/** The verified uid from an `Authorization: Bearer <Firebase ID token>` header, or null. */
export async function verifiedUid(authorization: string | null): Promise<string | null> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try {
    return (await getAuth(adminApp()).verifyIdToken(token, true)).uid;
  } catch {
    return null;
  }
}
