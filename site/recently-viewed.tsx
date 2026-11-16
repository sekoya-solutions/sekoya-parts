"use client";
// "Recently viewed" on the product page (issue #162): the products this
// visitor opened before, from the browser's local storage only
// (site/history.ts, docs/adr/0013-visitor-state.md). The server renders the
// same empty space for everyone, of a fixed height, so the product page stays
// static output and nothing shifts when the list appears. Without
// JavaScript, or with storage blocked or empty, the space stays empty.
import { useEffect, useRef, useState } from "react";
import type { Locale } from "../cms/locales.ts";
import {
  checkEntry,
  HISTORY_KEY,
  type HistoryEntry,
  parseHistory,
  remember,
  shownHistory,
} from "./history.ts";

export type RecentlyViewedLabels = {
  recentlyViewed: string;
  recentlyViewedClear: string;
  recentlyViewedCleared: string;
};

type State =
  | { kind: "empty" }
  | { kind: "list"; entries: HistoryEntry[] }
  | { kind: "cleared" };

/** The stored value, or null when storage is blocked or throws. */
function readStored(): string | null {
  try {
    return window.localStorage.getItem(HISTORY_KEY);
  } catch {
    return null;
  }
}

/** Writes or removes the stored value; a blocked or full storage changes nothing. */
function writeStored(history: HistoryEntry[] | null): void {
  try {
    if (history)
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    else window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Private browsing, a quota or a policy: the page works as without it.
  }
}

const shown = (entries: HistoryEntry[]): State =>
  entries.length > 0 ? { kind: "list", entries } : { kind: "empty" };

export function RecentlyViewed({
  locale,
  reference,
  name,
  path,
  labels,
}: {
  locale: Locale;
  /** The product on this page, remembered and left out of the list. */
  reference: string;
  name: string;
  path: string;
  labels: RecentlyViewedLabels;
}) {
  const [state, setState] = useState<State>({ kind: "empty" });
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const history = parseHistory(readStored());
    // The page's own product is checked like a stored one, so a product
    // whose address the check refuses is never written.
    const viewed = checkEntry({ reference, locale, name, path });
    const next = viewed ? remember(history, viewed) : history;
    writeStored(next);
    setState(shown(shownHistory(next, locale, reference)));

    // Another tab cleared or changed the history: show what is stored now.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== HISTORY_KEY) return;
      setState(
        shown(shownHistory(parseHistory(event.newValue), locale, reference)),
      );
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [locale, reference, name, path]);

  useEffect(() => {
    // The clear button goes with the list, so focus moves to the message
    // that replaces it rather than to the top of the page.
    if (state.kind === "cleared") status.current?.focus();
  }, [state.kind]);

  return (
    <div data-recently-viewed={state.kind} className="recently-viewed">
      {state.kind === "list" && (
        <section aria-labelledby="recently-viewed-title">
          <h2 id="recently-viewed-title" className="font-bold">
            {labels.recentlyViewed}
          </h2>
          <ul data-list="recently-viewed">
            {state.entries.map((entry) => (
              <li key={entry.reference}>
                <a href={entry.path}>{entry.name}</a>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              writeStored(null);
              setState({ kind: "cleared" });
            }}
          >
            {labels.recentlyViewedClear}
          </button>
        </section>
      )}
      {state.kind === "cleared" && (
        <p ref={status} role="status" tabIndex={-1}>
          {labels.recentlyViewedCleared}
        </p>
      )}
    </div>
  );
}
