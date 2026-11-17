"use client";
// The home page's part finder (issue #196, owner decisions of 2026-11-17):
// one form with three fields, brand, appliance type and model, then a button
// to the model's page. Brand and model are comboboxes whose text filters
// their list as letters are typed (the WAI-ARIA combobox pattern, list
// autocomplete); the type is a plain <select> of the brand's types. Each field
// unlocks once the one before it holds a valid choice, and changing a field
// clears the ones after it.
//
// The server renders the same form at its final size, the type, model and
// button locked and the brand field read-only until the script runs, so
// nothing is swapped or moves when it does (owner decision: no version
// without JavaScript). The brands and their types come as props; the models
// come from the models route (site/finder-rules.ts), and only the answer to
// the field's latest text is ever shown: each change aborts the request
// before it.
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import {
  type FinderModels,
  filterByName,
  foldText,
  MAX_MODEL_QUERY,
  modelsUrl,
} from "./finder-rules.ts";

export type FinderBrand = {
  slug: string;
  name: string;
  types: { value: string; name: string }[];
};

export type FinderLabels = {
  brand: string;
  chooseBrand: string;
  noBrand: string;
  type: string;
  chooseType: string;
  model: string;
  chooseModel: string;
  popular: string;
  noModel: string;
  searching: string;
  error: string;
  submit: string;
};

type Model = FinderModels["models"][number];

type ModelList =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; popular: boolean; models: Model[] }
  | { status: "error" };

/** How long typing pauses before the model field asks the route. */
const TYPING_PAUSE_MS = 150;

const withQuery = (label: string, query: string) =>
  label.split("{query}").join(query);

export function HomeFinder({
  locale,
  brands,
  labels,
}: {
  locale: string;
  brands: FinderBrand[];
  labels: FinderLabels;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandText, setBrandText] = useState("");
  const [brand, setBrand] = useState<FinderBrand | null>(null);
  const [type, setType] = useState("");
  const [modelText, setModelText] = useState("");
  const [model, setModel] = useState<Model | null>(null);
  const [list, setList] = useState<ModelList>({ status: "idle" });

  useEffect(() => setReady(true), []);

  // The model list follows the brand, the type and the field's text. The
  // cleanup aborts the request in flight and cancels a pending one, so a
  // slower answer to older text can never replace a newer one.
  useEffect(() => {
    if (!brand || !type) {
      setList({ status: "idle" });
      return;
    }
    if (model && modelText === model.reference) return;
    const controller = new AbortController();
    setList({ status: "loading" });
    const timer = setTimeout(
      async () => {
        try {
          const response = await fetch(
            modelsUrl(locale, brand.slug, type, modelText),
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error(String(response.status));
          const body = (await response.json()) as FinderModels;
          setList({ status: "ready", ...body });
        } catch {
          if (!controller.signal.aborted) setList({ status: "error" });
        }
      },
      modelText.trim() ? TYPING_PAUSE_MS : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locale, brand, type, modelText, model]);

  function pickBrand(next: FinderBrand | null, text: string) {
    setBrandText(text);
    if (next?.slug === brand?.slug) return;
    setBrand(next);
    setType("");
    setModelText("");
    setModel(null);
  }

  function pickType(next: string) {
    setType(next);
    setModelText("");
    setModel(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (model) router.push(model.path);
  }

  const brandOptions = filterByName(brands, brand ? "" : brandText);
  const models = list.status === "ready" ? list.models : [];
  const query = modelText.trim();

  return (
    <form className="home-finder" onSubmit={onSubmit} data-finder>
      <Combobox
        label={labels.brand}
        placeholder={labels.chooseBrand}
        text={brandText}
        readOnly={!ready}
        disabled={false}
        options={brandOptions.map((b) => ({ key: b.slug, label: b.name }))}
        listName="finder-brands"
        empty={withQuery(labels.noBrand, brandText.trim())}
        onText={(text) => {
          const exact = brands.find((b) => foldText(b.name) === foldText(text));
          pickBrand(exact ?? null, text);
        }}
        onPick={(key) => {
          const next = brands.find((b) => b.slug === key) ?? null;
          pickBrand(next, next?.name ?? "");
        }}
      />
      <div className="home-finder-field">
        <label htmlFor="finder-type">{labels.type}</label>
        <select
          id="finder-type"
          value={type}
          disabled={!brand}
          onChange={(event) => pickType(event.target.value)}
        >
          <option value="" disabled>
            {labels.chooseType}
          </option>
          {brand?.types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <Combobox
        label={labels.model}
        placeholder={labels.chooseModel}
        text={modelText}
        readOnly={false}
        disabled={!brand || !type}
        maxLength={MAX_MODEL_QUERY}
        options={models.map((m) => ({ key: m.path, label: m.reference }))}
        listName="finder-models"
        heading={
          list.status === "ready" && list.popular && models.length > 0
            ? labels.popular
            : undefined
        }
        empty={
          list.status === "loading"
            ? labels.searching
            : list.status === "error"
              ? labels.error
              : list.status === "ready"
                ? withQuery(labels.noModel, query)
                : ""
        }
        busy={list.status === "loading"}
        onText={(text) => {
          setModelText(text);
          const exact = models.find(
            (m) => foldText(m.reference) === foldText(text),
          );
          setModel(exact ?? null);
        }}
        onPick={(key) => {
          const next = models.find((m) => m.path === key) ?? null;
          setModel(next);
          setModelText(next?.reference ?? "");
        }}
      />
      <button type="submit" disabled={!model}>
        {labels.submit}
      </button>
    </form>
  );
}

type Option = { key: string; label: string };

/**
 * An editable combobox with a list that the text filters: arrow keys move
 * through the options, Enter picks one, Escape closes the list. The list is
 * positioned over the page, so opening it moves nothing.
 */
function Combobox({
  label,
  placeholder,
  text,
  readOnly,
  disabled,
  maxLength,
  options,
  listName,
  heading,
  empty,
  busy = false,
  onText,
  onPick,
}: {
  label: string;
  placeholder: string;
  text: string;
  readOnly: boolean;
  disabled: boolean;
  maxLength?: number;
  options: Option[];
  listName: string;
  heading?: string;
  empty: string;
  busy?: boolean;
  onText: (text: string) => void;
  onPick: (key: string) => void;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const shown = open && !disabled;
  const current = active >= 0 && active < options.length ? active : -1;

  // The active option stays in view as the arrow keys move through a list
  // longer than its box.
  useEffect(() => {
    if (shown && current >= 0)
      document
        .getElementById(`${id}-${current}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [id, shown, current]);

  function pick(index: number) {
    const option = options[index];
    if (!option) return;
    onPick(option.key);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (readOnly) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setOpen(true);
        setActive(Math.min(current + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setOpen(true);
        setActive(Math.max(current - 1, 0));
        break;
      case "Enter":
        if (shown && current >= 0) {
          event.preventDefault();
          pick(current);
        }
        break;
      case "Escape":
        if (shown) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        }
        break;
    }
  }

  let status: ReactNode = null;
  if (shown && (busy || options.length === 0) && empty)
    status = <p className="home-finder-status">{empty}</p>;

  return (
    <div className="home-finder-field">
      <label htmlFor={id}>{label}</label>
      <div className="home-finder-combo">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            shown && current >= 0 ? `${id}-${current}` : undefined
          }
          aria-busy={busy || undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={text}
          readOnly={readOnly}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(event) => {
            onText(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => !readOnly && setOpen(true)}
          onClick={() => !readOnly && setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="home-finder-chevron"
        >
          <path
            d="M5 8l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the press only keeps focus in the field, so its blur does not close the list before a pick; the keyboard picks from the field itself. */}
        <div
          className="home-finder-popup"
          hidden={!shown || (options.length === 0 && !status)}
          // Picking happens before the field's blur closes the list.
          onMouseDown={(event) => event.preventDefault()}
        >
          {heading && !status && (
            <p className="home-finder-heading">{heading}</p>
          )}
          {status}
          <div
            id={listId}
            role="listbox"
            aria-label={heading ?? label}
            data-list={listName}
          >
            {!status &&
              options.map((option, index) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard moves through the options from the field (aria-activedescendant), as the combobox pattern asks.
                <div
                  key={option.key}
                  id={`${id}-${index}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === current}
                  onClick={() => pick(index)}
                  onMouseMove={() => index !== current && setActive(index)}
                >
                  {option.label}
                </div>
              ))}
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {shown && (busy || options.length === 0) ? empty : ""}
      </p>
    </div>
  );
}
