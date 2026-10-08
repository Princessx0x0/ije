"use client";

import { CopilotKit, useCopilotKit } from "@copilotkit/react-core/v2";
import { useEffect, useMemo, type ReactNode } from "react";

import { useAuth } from "./AuthProvider";

/**
 * CopilotKit, wired to the signed-in Firebase user.
 *
 * How the token reaches the agent (verified in @copilotkit/core 1.73.2):
 *   CopilotKitCore.runAgent sends `forwardedProps: { ...core.properties, ...perRun }`
 *   -> /api/copilotkit runtime -> HttpAgent POSTs the input to /api/adk
 *   -> /api/adk adds the Google IAM token and forwards the body unchanged
 *   -> the agent reads forwardedProps.firebaseIdToken and verifies it.
 *
 * Two writers keep core.properties.firebaseIdToken current:
 *   1. The `properties` prop, from the token onIdTokenChanged last saw.
 *   2. TokenSync, which awaits a fresh getIdToken() in onAgentRunStarted.
 *      Core awaits that hook before it builds the run input, so every
 *      top-level run carries an unexpired token even after an idle hour.
 *
 * CopilotKit is mounted only for a signed-in user (the agent refuses anything
 * else) and keyed by uid, so switching accounts discards all agent and thread
 * state from the previous user instead of leaking it into the next session.
 */
export function IjeCopilotKit({ children }: { children: ReactNode }) {
  const { status, user, idToken } = useAuth();

  const properties = useMemo(() => (idToken ? { firebaseIdToken: idToken } : undefined), [idToken]);

  if (status !== "signedIn" || !user || !properties) return <>{children}</>;

  return (
    // REST transport: runtime-info and threads hit the multi-route endpoint
    // (auto-detect races the lazily compiled API route in `next dev`).
    <CopilotKit key={user.uid} runtimeUrl="/api/copilotkit" useSingleEndpoint={false} properties={properties}>
      <TokenSync />
      {children}
    </CopilotKit>
  );
}

function TokenSync() {
  const { copilotkit } = useCopilotKit();
  const { getIdToken } = useAuth();

  useEffect(() => {
    const subscription = copilotkit.subscribe({
      onAgentRunStarted: async () => {
        const token = await getIdToken();
        if (copilotkit.properties?.firebaseIdToken !== token) {
          copilotkit.setProperties({ ...copilotkit.properties, firebaseIdToken: token });
        }
      },
    });
    return () => subscription.unsubscribe();
  }, [copilotkit, getIdToken]);

  return null;
}
