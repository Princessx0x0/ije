"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "./AuthProvider";

/** Renders children only for a signed-in user (guest or full account). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, configError } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "signedOut") {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status === "misconfigured") {
    return (
      <main className="ije-status" role="alert">
        <h1>Ije cannot start</h1>
        <p>{configError}</p>
      </main>
    );
  }
  if (status !== "signedIn") {
    return (
      <main className="ije-status" aria-busy="true">
        <p>Loading</p>
      </main>
    );
  }
  return <>{children}</>;
}
