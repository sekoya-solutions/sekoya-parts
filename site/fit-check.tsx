"use client";
// "Does it fit my appliance?" on the product page (issue #161, owner decision
// of 2026-11-16): a plain GET form to the result page, which works before and
// without JavaScript; once the page's scripts run, a submit asks the fit
// route instead (app/(site)/api/fit/route.ts) and shows the answer under the
// form, without leaving the page. The labels come as props, so the browser
// loads no dictionary, and nothing here depends on the visitor before they
// type: the server renders the same form for everyone.
import { type FormEvent, useRef, useState } from "react";
import type { FitResponse } from "./fit.ts";
import { FitAnswerView, type FitLabels } from "./fit-answer.tsx";
import { FIT_PARAMS } from "./fit-params.ts";

export type FitCheckLabels = FitLabels & {
  fitTitle: string;
  fitIntro: string;
  fitLabel: string;
  fitSubmit: string;
  fitChecking: string;
  fitError: string;
};

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "answer"; answer: FitResponse; query: string }
  | { kind: "error" };

/** The longest model reference the form sends; longer is refused anyway. */
const MAX_INPUT = 100;

export function FitCheck({
  locale,
  part,
  action,
  labels,
}: {
  locale: string;
  part: string;
  /** The result page, where the form goes without JavaScript. */
  action: string;
  labels: FitCheckLabels;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  // Only the latest submit's answer shows: an earlier, slower one is aborted.
  const pending = useRef<AbortController | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get(FIT_PARAMS.q) ?? "",
    ).trim();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState({ kind: "checking" });
    const params = new URLSearchParams({
      lang: locale,
      [FIT_PARAMS.part]: part,
      [FIT_PARAMS.q]: query,
    });
    try {
      const response = await fetch(`/api/fit?${params}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      // 400 carries an answer too ("invalid"); anything else is a failure.
      if (!response.ok && response.status !== 400)
        throw new Error(`Fit route: ${response.status}`);
      const answer = (await response.json()) as FitResponse;
      if (pending.current === controller)
        setState({ kind: "answer", answer, query });
    } catch {
      if (!controller.signal.aborted) setState({ kind: "error" });
    }
  }

  return (
    <section aria-labelledby="fit-title" data-fit-check className="fit-check">
      <h2 id="fit-title" className="text-xl font-bold">
        {labels.fitTitle}
      </h2>
      <p className="mt-1 mb-3 max-w-prose">{labels.fitIntro}</p>
      <form
        method="get"
        action={action}
        onSubmit={onSubmit}
        className="listing-controls"
      >
        <input type="hidden" name={FIT_PARAMS.part} value={part} />
        <label>
          <span>{labels.fitLabel}</span>
          <input
            name={FIT_PARAMS.q}
            type="search"
            required
            maxLength={MAX_INPUT}
            autoComplete="off"
            className="search-input min-h-11 rounded-md border border-slate px-3"
          />
        </label>
        <button type="submit">{labels.fitSubmit}</button>
      </form>
      {/* Always in the page, so a screen reader announces what appears in it. */}
      <div role="status" data-fit-status className="mt-3">
        {state.kind === "checking" && <p>{labels.fitChecking}</p>}
        {state.kind === "error" && <p data-fit="error">{labels.fitError}</p>}
        {state.kind === "answer" && (
          <FitAnswerView
            answer={state.answer}
            query={state.query}
            labels={labels}
          />
        )}
      </div>
    </section>
  );
}
