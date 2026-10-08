"use client";

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { firebaseAuth } from "@/lib/firebase";

type AuthStatus = "loading" | "signedOut" | "signedIn" | "misconfigured";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  isGuest: boolean;
  /** Latest Firebase ID token seen by onIdTokenChanged. For freshness at send time use getIdToken(). */
  idToken: string | null;
  configError: string | null;
  /** A current, unexpired ID token; refreshed by the SDK when close to expiry. */
  getIdToken: () => Promise<string>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let auth;
    try {
      auth = firebaseAuth();
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : String(e));
      setStatus("misconfigured");
      return;
    }
    // Fires on sign-in, sign-out, account linking and every token refresh.
    return onIdTokenChanged(auth, async (next) => {
      setUser(next);
      if (!next) {
        setIdToken(null);
        setStatus("signedOut");
        return;
      }
      setIdToken(await next.getIdToken());
      setStatus("signedIn");
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const auth = () => firebaseAuth();
    const current = () => auth().currentUser;

    return {
      status,
      user,
      isGuest: user?.isAnonymous ?? false,
      idToken,
      configError,

      async getIdToken() {
        const u = current();
        if (!u) throw new Error("Not signed in");
        return u.getIdToken();
      },

      async signUpWithEmail(email, password) {
        const u = current();
        if (u?.isAnonymous) {
          // Upgrade the guest in place: same uid, so their sessions and trips stay theirs.
          await linkWithCredential(u, EmailAuthProvider.credential(email, password));
          await u.getIdToken(true); // new token now carries the email provider
          return;
        }
        await createUserWithEmailAndPassword(auth(), email, password);
      },

      async signInWithEmail(email, password) {
        await signInWithEmailAndPassword(auth(), email, password);
      },

      async signInWithGoogle() {
        const provider = new GoogleAuthProvider();
        const u = current();
        if (u?.isAnonymous) {
          try {
            await linkWithPopup(u, provider);
            await u.getIdToken(true);
            return;
          } catch (e) {
            // That Google account already has an Ije account: sign into it instead.
            // The guest's working data stays with the guest uid and is not merged.
            if (e instanceof FirebaseError && e.code === "auth/credential-already-in-use") {
              const credential = GoogleAuthProvider.credentialFromError(e);
              if (credential) {
                await signInWithCredential(auth(), credential);
                return;
              }
            }
            throw e;
          }
        }
        await signInWithPopup(auth(), provider);
      },

      async continueAsGuest() {
        await signInAnonymously(auth());
      },

      async sendPasswordReset(email) {
        await sendPasswordResetEmail(auth(), email);
      },

      async signOut() {
        await firebaseSignOut(auth());
      },
    };
  }, [status, user, idToken, configError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
