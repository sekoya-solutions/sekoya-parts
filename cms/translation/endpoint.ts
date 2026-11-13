// GET /api/translations/run (issue #104): runs one translation sweep. The
// daily Vercel cron calls it with `Authorization: Bearer <CRON_SECRET>`
// (vercel.json; Vercel sends that header when CRON_SECRET is set), and a
// signed-in admin user can open it to run it at once. Anyone else gets 401.
//
// It is a GET because Vercel's crons send GET requests. It answers with what
// the run did; a DeepL failure answers 502, so Vercel's cron log shows it.
import { timingSafeEqual } from "node:crypto";
import type { Endpoint } from "payload";
import type { DeepLClient } from "./deepl.ts";
import { runTranslation } from "./store.ts";

export const TRANSLATION_RUN_PATH = "/translations/run";

/** Compares in constant time, so the answer's timing tells nothing. */
function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whether a request may run the sweep: a signed-in user, or the cron's
 * secret. With no secret set, or an empty one, only signed-in users can.
 */
export function mayRun(
  request: { user?: unknown; authorization?: string | null },
  cronSecret: string | undefined,
): boolean {
  if (request.user) return true;
  if (!cronSecret || !request.authorization) return false;
  return sameSecret(request.authorization, `Bearer ${cronSecret}`);
}

/** The DeepL client from the environment, or null without a key. */
export function deeplFromEnvironment(): DeepLClient | null {
  const key = process.env.DEEPL_API_KEY?.trim();
  return key ? { key } : null;
}

export const translationRunEndpoint: Endpoint = {
  path: TRANSLATION_RUN_PATH,
  method: "get",
  handler: async (req) => {
    const allowed = mayRun(
      {
        user: req.user,
        authorization: req.headers.get("authorization"),
      },
      process.env.CRON_SECRET,
    );
    if (!allowed)
      return Response.json({ message: "Unauthorized." }, { status: 401 });

    // No request passed on: each write commits on its own, so translations
    // paid for are kept even if a later step fails.
    const result = await runTranslation(req.payload, deeplFromEnvironment());
    if ("busy" in result)
      return Response.json(
        { message: "Another translation run is in progress." },
        { status: 409 },
      );
    const log = result.failed
      ? req.payload.logger.error
      : req.payload.logger.info;
    log.call(req.payload.logger, { msg: "Translation run", ...result });
    return Response.json(result, { status: result.failed ? 502 : 200 });
  },
};
