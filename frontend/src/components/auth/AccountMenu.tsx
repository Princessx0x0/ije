"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { useAuth } from "./AuthProvider";

/**
 * The account menu. For guests this is the only place that offers an upgrade,
 * and it is optional: nothing in the app requires a guest to sign up or sign out.
 */
export function AccountMenu() {
  const { user, isGuest, signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  function close() {
    setOpen(false);
    setConfirmingSignOut(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="ije-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="ije-button ije-button--secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {isGuest ? "Guest" : "Account"}
      </button>

      <div id={panelId} className="ije-menu__panel" hidden={!open}>
        <p className="ije-menu__who">{isGuest ? "Planning as a guest" : (user?.email ?? "Signed in")}</p>

        {isGuest && (
          <div className="ije-card ije-card--inset">
            <p>Add an email or Google account to keep your trips on any device. Optional, and your plans stay as they are.</p>
            <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className="ije-link" onClick={close}>
              Save my account
            </Link>
          </div>
        )}

        <Link href="/onboarding" className="ije-link" onClick={close}>
          Travel preferences
        </Link>

        {confirmingSignOut ? (
          <div className="ije-card ije-card--inset" role="group" aria-label="Confirm sign out">
            <p>Signing out of a guest session loses its trips for good.</p>
            <div className="ije-menu__actions">
              <button type="button" className="ije-button ije-button--secondary" onClick={() => void signOut()}>
                Sign out anyway
              </button>
              <button type="button" className="ije-link" onClick={() => setConfirmingSignOut(false)}>
                Keep planning
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="ije-link"
            onClick={() => (isGuest ? setConfirmingSignOut(true) : void signOut())}
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
