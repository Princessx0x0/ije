"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Firebase web config. These values identify the project; they are not
 * secrets (Firestore security rules protect the data). Each variable is read
 * with a literal `process.env.NEXT_PUBLIC_...` so Next.js inlines it at build.
 *
 * There is deliberately no fallback or emulator bypass: a missing value is a
 * configuration error, surfaced loudly, never a silent demo mode.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const REQUIRED = ["apiKey", "authDomain", "projectId", "appId"] as const;

export class FirebaseConfigError extends Error {}

function firebaseApp(): FirebaseApp {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new FirebaseConfigError(
      `Firebase is not configured. Set ${missing
        .map((k) => `NEXT_PUBLIC_FIREBASE_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`)
        .join(", ")} in frontend/.env.local (see .env.example).`,
    );
  }
  return getApps().length ? getApp() : initializeApp(config);
}

let authInstance: Auth | undefined;

/** The browser's Firebase Auth instance. Client components only. */
export function firebaseAuth(): Auth {
  authInstance ??= getAuth(firebaseApp());
  return authInstance;
}
