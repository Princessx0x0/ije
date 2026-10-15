"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { ChatLine } from "./useTripAgent";

/**
 * The side channel for refining a trip. Built on the trip's agent hook, not
 * CopilotSidebar: the itinerary canvas stays the main surface.
 */
export function ChatPanel({
  id,
  lines,
  isRunning,
  disabled,
  onSend,
}: {
  id: string;
  lines: ChatLine[];
  isRunning: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [lines.length]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isRunning || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <aside id={id} className="ije-chat" aria-label="Ask Ije">
      <h2 className="ije-chat__title">Ask Ije</h2>
      {lines.length === 0 ? (
        <p className="ije-caption">Ask for changes, for example “make the second day slower” or “more food markets”.</p>
      ) : (
        <ol ref={logRef} className="ije-chat__log" role="log" aria-live="polite">
          {lines.map((line) => (
            <li key={line.id} className={`ije-chat__line ije-chat__line--${line.role}`}>
              <span className="ije-sr-only">{line.role === "user" ? "You: " : "Ije: "}</span>
              {line.text}
            </li>
          ))}
        </ol>
      )}
      {isRunning && (
        <p className="ije-caption" role="status">
          Ije is thinking
        </p>
      )}
      <form className="ije-chat__form" onSubmit={onSubmit}>
        <label htmlFor={`${id}-input`} className="ije-sr-only">
          Message to Ije
        </label>
        <input
          id={`${id}-input`}
          className="ije-field__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask for a change"
          autoComplete="off"
        />
        <button type="submit" className="ije-button" disabled={isRunning || disabled || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
