"use client";

import { useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ItineraryItem, Persona, StayOption, Trip, Vibe, Weather } from "@/lib/schema";

export interface ChatLine {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const RUN_FAILED = "Ije could not finish planning. Check your connection and try again.";

const UPDATES = [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged];

/**
 * The Ije agent bound to one trip. Thread id = trip id, so each trip has its
 * own agent session (ADR 005: the session's user is the verified uid).
 *
 * Every run goes through copilotkit.runAgent, never agent.runAgent: only the
 * core attaches forwardedProps.firebaseIdToken (docs/copilotkit-forwarded-props.md).
 * Before each run the agent's state is set to { persona, vibe, trip }, which
 * ag_ui_adk writes into the session state the agent reads.
 */
export function useTripAgent({
  persona,
  vibe,
  trip,
  onItems,
  onStays,
}: {
  persona: Persona;
  vibe: Vibe;
  trip: Trip;
  /** Called when a run produces a new itinerary. */
  onItems: (items: ItineraryItem[]) => void;
  /** Called when a run produces new stay suggestions. */
  onStays: (stays: StayOption[]) => void;
}) {
  const { copilotkit } = useCopilotKit();
  const { agent, isReady } = useAgent({
    agentId: `trip-${trip.trip_id}`,
    runtimeAgentId: "default",
    threadId: trip.trip_id,
    updates: UPDATES,
  });
  const [error, setError] = useState<string | null>(null);

  // Latest values for send(), without re-creating it on every render.
  const latest = useRef({ persona, vibe, trip });
  latest.current = { persona, vibe, trip };

  const send = useCallback(
    async (text: string) => {
      setError(null);
      const { persona, vibe, trip } = latest.current;
      agent.setState({ persona, vibe, trip });
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
      try {
        await copilotkit.runAgent({ agent });
      } catch (e) {
        console.error("Agent run failed", e);
        setError(RUN_FAILED);
      }
    },
    [agent, copilotkit],
  );

  // A run can fail without throwing: the agent reports RUN_ERROR as an event.
  useEffect(() => {
    const fail = (detail: unknown) => {
      console.error("Agent run failed", detail);
      setError(RUN_FAILED);
    };
    const subscription = agent.subscribe({
      onRunErrorEvent: ({ event }) => fail(event),
      onRunFailed: ({ error }) => fail(error),
    });
    return () => subscription.unsubscribe();
  }, [agent]);

  // New items in the agent's state mean update_itinerary succeeded.
  const remote = (agent.state as { trip?: Partial<Trip> & { weather?: Weather | null } } | undefined)?.trip;
  const remoteItems = remote?.items ? JSON.stringify(remote.items) : null;
  useEffect(() => {
    if (!remoteItems || remoteItems === JSON.stringify(latest.current.trip.items)) return;
    onItems(JSON.parse(remoteItems) as ItineraryItem[]);
  }, [remoteItems, onItems]);

  // New stay options mean update_stays succeeded.
  const remoteStays = remote?.stay_options ? JSON.stringify(remote.stay_options) : null;
  useEffect(() => {
    if (!remoteStays || remoteStays === JSON.stringify(latest.current.trip.stay_options)) return;
    onStays(JSON.parse(remoteStays) as StayOption[]);
  }, [remoteStays, onStays]);

  /** Forecast from this session's agent run; derived, so never saved. */
  const weather = remote?.weather ?? null;

  const lines: ChatLine[] = agent.messages.flatMap((m) => {
    if ((m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()) {
      return [{ id: m.id, role: m.role, text: m.content }];
    }
    return [];
  });

  return { isReady, isRunning: agent.isRunning, lines, send, error, weather };
}
