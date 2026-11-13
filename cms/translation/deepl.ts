// DeepL's API, which translates the showcase products
// (docs/adr/0011-languages-and-seo.md, issue #104). Only the two calls the
// project needs: translating texts from French, and reading the usage, which
// spends no characters.
//
// The free plan allows 1,000,000 characters in total, once (owner, 2026-11-13),
// so nothing here retries: a failed call throws, and the caller stops.
import type { Locale } from "../locales.ts";

/** The languages translated from the French source. */
export type TargetLocale = Exclude<Locale, "fr">;

/**
 * DeepL's code for each target language. English and Portuguese need a
 * variant: British English and European Portuguese, for a European catalog.
 */
export const DEEPL_TARGETS: Record<TargetLocale, string> = {
  en: "EN-GB",
  de: "DE",
  es: "ES",
  it: "IT",
  nl: "NL",
  pt: "PT-PT",
  pl: "PL",
  sv: "SV",
  da: "DA",
};

/** DeepL's limit on the texts of one request. */
export const MAX_TEXTS_PER_REQUEST = 50;

/** How long one call may take before it is abandoned. */
const TIMEOUT_MS = 30_000;

/**
 * DeepL's address for a key: free keys end in ":fx" and use their own host
 * (https://developers.deepl.com/docs/getting-started/auth).
 */
export const deeplBaseUrl = (key: string): string =>
  key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";

/** A call DeepL refused or did not answer properly. */
export class DeepLError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "DeepLError";
    this.status = status;
  }
}

/** What each refusal means, for the logs and the live check. */
function explain(status: number): string {
  switch (status) {
    case 403:
      return "DeepL rejected the key (403): it is wrong, expired or revoked.";
    case 456:
      return "DeepL's character quota is spent (456).";
    case 429:
      return "DeepL is limiting the request rate (429).";
    default:
      return `DeepL answered ${status}.`;
  }
}

export type DeepLClient = {
  key: string;
  /** The fetch to use; tests pass a fake. */
  fetch?: typeof fetch;
};

async function call(
  client: DeepLClient,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const doFetch = client.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${deeplBaseUrl(client.key)}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `DeepL-Auth-Key ${client.key}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new DeepLError(
      `DeepL could not be reached: ${(error as Error).message}`,
      null,
    );
  }
  if (!response.ok)
    throw new DeepLError(explain(response.status), response.status);
  try {
    return await response.json();
  } catch {
    throw new DeepLError("DeepL's answer is not JSON.", response.status);
  }
}

/**
 * Translates French texts into one language, in order, with one request per
 * 50 texts. The number of characters sent is what DeepL counts.
 */
export async function translateFromFrench(
  client: DeepLClient,
  texts: readonly string[],
  target: TargetLocale,
): Promise<string[]> {
  const result: string[] = [];
  for (let start = 0; start < texts.length; start += MAX_TEXTS_PER_REQUEST) {
    const batch = texts.slice(start, start + MAX_TEXTS_PER_REQUEST);
    const body = await call(client, "/v2/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: batch,
        source_lang: "FR",
        target_lang: DEEPL_TARGETS[target],
      }),
    });
    const translations = (body as { translations?: unknown }).translations;
    if (
      !Array.isArray(translations) ||
      translations.length !== batch.length ||
      !translations.every(
        (t) => typeof (t as { text?: unknown })?.text === "string",
      )
    )
      throw new DeepLError(
        `DeepL returned an unexpected answer for ${batch.length} texts.`,
        200,
      );
    result.push(...translations.map((t) => (t as { text: string }).text));
  }
  return result;
}

export type DeepLUsage = { characterCount: number; characterLimit: number };

/** The characters used and the limit. This call spends no characters. */
export async function readUsage(client: DeepLClient): Promise<DeepLUsage> {
  const body = (await call(client, "/v2/usage", { method: "GET" })) as {
    character_count?: unknown;
    character_limit?: unknown;
  };
  if (
    typeof body.character_count !== "number" ||
    typeof body.character_limit !== "number"
  )
    throw new DeepLError("DeepL's usage answer has no character counts.", 200);
  return {
    characterCount: body.character_count,
    characterLimit: body.character_limit,
  };
}

/** The share of the quota at which the live check fails. */
export const USAGE_ALERT_SHARE = 0.9;

/** Whether the quota is nearly spent, or has no limit to measure against. */
export const usageTooHigh = (usage: DeepLUsage): boolean =>
  usage.characterLimit <= 0 ||
  usage.characterCount >= usage.characterLimit * USAGE_ALERT_SHARE;
