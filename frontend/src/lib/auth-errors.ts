import { FirebaseError } from "firebase/app";

/**
 * Plain-language messages for the Firebase Auth errors a person can actually
 * cause or fix. UI copy rule: no em dashes.
 */
const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "That email address does not look right.",
  "auth/missing-password": "Enter a password.",
  "auth/weak-password": "Use a password of at least 6 characters.",
  "auth/email-already-in-use": "There is already an account with that email. Try signing in instead.",
  "auth/invalid-credential": "That email and password do not match an account.",
  "auth/wrong-password": "That email and password do not match an account.",
  "auth/user-not-found": "That email and password do not match an account.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/network-request-failed": "We could not reach the sign-in service. Check your connection.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
  "auth/popup-closed-by-user": "The Google window was closed before sign-in finished.",
  "auth/cancelled-popup-request": "The Google window was closed before sign-in finished.",
  "auth/credential-already-in-use": "That Google account already has an Ije account.",
  "auth/requires-recent-login": "For your security, sign in again and then retry.",
  "auth/operation-not-allowed": "This sign-in method is not turned on for Ije yet.",
  "auth/unauthorized-domain": "This web address is not allowed to sign in. Add it to the Firebase authorised domains.",
};

export function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return MESSAGES[error.code] ?? "Something went wrong signing in. Please try again.";
  }
  if (error instanceof Error && error.name === "FirebaseConfigError") return error.message;
  return "Something went wrong signing in. Please try again.";
}

/** Errors that mean the person backed out, so the UI should stay quiet. */
export function isUserCancellation(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request")
  );
}
