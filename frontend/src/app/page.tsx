"use client";

import Link from "next/link";

import { AuthGate } from "@/components/auth/AuthGate";
import { useAuth } from "@/components/auth/AuthProvider";

export default function Home() {
  return (
    <AuthGate>
      <Account />
    </AuthGate>
  );
}

function Account() {
  const { user, isGuest, signOut } = useAuth();

  return (
    <main className="ije-status">
      <h1>Ije</h1>
      <p>{isGuest ? "You are planning as a guest." : `Signed in as ${user?.email ?? "your account"}.`}</p>
      {isGuest && (
        <p>
          <Link href="/sign-in">Create an account</Link> to keep your trips.
        </p>
      )}
      <button
        type="button"
        className="ije-link"
        onClick={() => {
          if (!isGuest || window.confirm("Signing out of a guest session loses its trips for good. Sign out anyway?")) {
            void signOut();
          }
        }}
      >
        Sign out
      </button>
    </main>
  );
}
