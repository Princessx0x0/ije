"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { authErrorMessage, isUserCancellation } from "@/lib/auth-errors";

type Mode = "signIn" | "signUp";

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}

/** Only allow same-origin relative redirects after sign-in. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function SignIn() {
  const { status, isGuest, configError, signInWithEmail, signUpWithEmail, signInWithGoogle, continueAsGuest, sendPasswordReset } =
    useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  // A guest who comes here is upgrading, so default to creating an account.
  const [mode, setMode] = useState<Mode>(isGuest ? "signUp" : "signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isGuest) setMode("signUp");
  }, [isGuest]);

  // A full account has nothing to do here.
  useEffect(() => {
    if (status === "signedIn" && !isGuest) router.replace(next);
  }, [status, isGuest, router, next]);

  async function run(action: () => Promise<void>, after?: () => void) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (after) after();
      else router.replace(next);
    } catch (e) {
      if (!isUserCancellation(e)) setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(() => (mode === "signUp" ? signUpWithEmail(email, password) : signInWithEmail(email, password)));
  }

  if (status === "misconfigured") {
    return (
      <main className="ije-status" role="alert">
        <h1>Ije cannot start</h1>
        <p>{configError}</p>
      </main>
    );
  }

  const upgrading = isGuest && mode === "signUp";

  return (
    <main className="ije-auth">
      <section className="ije-card ije-card--roomy ije-auth__card" aria-labelledby="auth-title">
        <div className="ije-field">
          <h1 id="auth-title">{upgrading ? "Keep your trips" : mode === "signUp" ? "Create your account" : "Welcome back"}</h1>
          <p className="ije-auth__lede">
            {upgrading
              ? "Add an email or Google account. Everything you planned as a guest stays with you."
              : "Sign in to plan and keep your trips."}
          </p>
        </div>

        <button
          type="button"
          className="ije-button ije-button--secondary ije-button--block"
          onClick={() => run(signInWithGoogle)}
          disabled={busy}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3zM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22zM6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9zM12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6z" />
          </svg>
          Continue with Google
        </button>

        <p className="ije-or">or use your email</p>

        <form onSubmit={onSubmit} className="ije-auth__form" noValidate>
          <div className="ije-field">
            <label className="ije-field__label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="ije-field__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="ije-field">
            <label className="ije-field__label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="ije-field__input"
              type="password"
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              aria-describedby={mode === "signUp" ? "password-hint" : undefined}
              required
            />
            {mode === "signUp" && (
              <p id="password-hint" className="ije-field__hint">
                At least 6 characters.
              </p>
            )}
          </div>
          <button type="submit" className="ije-button ije-button--block" disabled={busy}>
            {mode === "signUp" ? (upgrading ? "Save my account" : "Create account") : "Sign in"}
          </button>
        </form>

        {error && (
          <p className="ije-notice ije-notice--error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="ije-notice ije-notice--success" role="status">
            {notice}
          </p>
        )}

        <div className="ije-auth__links">
          {mode === "signIn" ? (
            <>
              <button type="button" className="ije-link" onClick={() => setMode("signUp")}>
                New to Ije? Create an account
              </button>
              <button
                type="button"
                className="ije-link"
                disabled={busy || !email}
                onClick={() =>
                  run(
                    () => sendPasswordReset(email),
                    () => setNotice("If that email has an account, a reset link is on its way."),
                  )
                }
              >
                Forgot password
              </button>
            </>
          ) : (
            <button type="button" className="ije-link" onClick={() => setMode("signIn")}>
              {isGuest ? "Already have an account? Sign in" : "Have an account? Sign in"}
            </button>
          )}
        </div>

        {isGuest && mode === "signIn" && (
          <p className="ije-notice">Signing into another account leaves this guest session and its trips behind.</p>
        )}

        {!isGuest && (
          <button type="button" className="ije-link ije-auth__guest" onClick={() => run(continueAsGuest)} disabled={busy}>
            Continue as guest
          </button>
        )}
      </section>
    </main>
  );
}
