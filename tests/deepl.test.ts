// DeepL's client against a fake fetch (issue #104): CI never calls DeepL.
// The live check (.github/workflows/deepl-live.yml) calls the real one.
import { describe, expect, it } from "vitest";
import {
  DEEPL_TARGETS,
  DeepLError,
  deeplBaseUrl,
  readUsage,
  translateFromFrench,
  usageTooHigh,
} from "../cms/translation/deepl.ts";

type Call = { url: string; init: RequestInit };

/** A fake fetch that records each call and answers with `answer`. */
function fakeFetch(answer: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return answer(call);
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Echoes each text back, prefixed with the target language. */
const echo = ({ init }: Call) => {
  const body = JSON.parse(String(init.body)) as {
    text: string[];
    target_lang: string;
  };
  return json({
    translations: body.text.map((text) => ({
      detected_source_language: "FR",
      text: `${body.target_lang}:${text}`,
    })),
  });
};

describe("deeplBaseUrl", () => {
  it("sends free keys to the free host and others to the paid one", () => {
    expect(deeplBaseUrl("abc:fx")).toBe("https://api-free.deepl.com");
    expect(deeplBaseUrl("abc")).toBe("https://api.deepl.com");
  });
});

describe("translateFromFrench", () => {
  it("sends the key in the header, French as the source and the target's code", async () => {
    const { calls, fetch } = fakeFetch(echo);
    const result = await translateFromFrench(
      { key: "k:fx", fetch },
      ["Joint", "Pompe"],
      "en",
    );
    expect(result).toEqual(["EN-GB:Joint", "EN-GB:Pompe"]);
    expect(calls).toHaveLength(1);
    const [call] = calls as [Call];
    expect(call.url).toBe("https://api-free.deepl.com/v2/translate");
    expect(call.init.method).toBe("POST");
    expect((call.init.headers as Record<string, string>).Authorization).toBe(
      "DeepL-Auth-Key k:fx",
    );
    expect(JSON.parse(String(call.init.body))).toEqual({
      text: ["Joint", "Pompe"],
      source_lang: "FR",
      target_lang: "EN-GB",
    });
  });

  it("uses British English and European Portuguese, and a code for each target", () => {
    expect(DEEPL_TARGETS.en).toBe("EN-GB");
    expect(DEEPL_TARGETS.pt).toBe("PT-PT");
    expect(Object.keys(DEEPL_TARGETS).sort()).toEqual(
      ["da", "de", "en", "es", "it", "nl", "pl", "pt", "sv"].sort(),
    );
  });

  it("splits more than 50 texts into requests of 50 and keeps their order", async () => {
    const { calls, fetch } = fakeFetch(echo);
    const texts = Array.from({ length: 120 }, (_, i) => `t${i}`);
    const result = await translateFromFrench({ key: "k", fetch }, texts, "de");
    expect(
      calls.map((c) => JSON.parse(String(c.init.body)).text.length),
    ).toEqual([50, 50, 20]);
    expect(result).toEqual(texts.map((t) => `DE:${t}`));
  });

  it.each([
    [403, /rejected the key/],
    [456, /quota is spent/],
    [429, /limiting the request rate/],
    [500, /answered 500/],
  ])(
    "throws a DeepLError on %i, with no second request",
    async (status, message) => {
      const { calls, fetch } = fakeFetch(() => json({ message: "no" }, status));
      const error = await translateFromFrench(
        { key: "k", fetch },
        ["Joint"],
        "it",
      ).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DeepLError);
      expect((error as DeepLError).status).toBe(status);
      expect((error as DeepLError).message).toMatch(message);
      expect(calls).toHaveLength(1);
    },
  );

  it("throws when DeepL cannot be reached", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;
    await expect(
      translateFromFrench({ key: "k", fetch }, ["Joint"], "nl"),
    ).rejects.toThrow(/could not be reached/);
  });

  it("throws when the answer has the wrong number of translations", async () => {
    const { fetch } = fakeFetch(() => json({ translations: [] }));
    await expect(
      translateFromFrench({ key: "k", fetch }, ["Joint"], "sv"),
    ).rejects.toThrow(/unexpected answer/);
  });
});

describe("readUsage and usageTooHigh", () => {
  it("reads the usage with a GET that spends no characters", async () => {
    const { calls, fetch } = fakeFetch(() =>
      json({ character_count: 12, character_limit: 1_000_000 }),
    );
    expect(await readUsage({ key: "k:fx", fetch })).toEqual({
      characterCount: 12,
      characterLimit: 1_000_000,
    });
    expect(calls[0]?.url).toBe("https://api-free.deepl.com/v2/usage");
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("alerts from 90% of the quota, and when there is no limit", () => {
    const at = (count: number, limit = 1_000_000) =>
      usageTooHigh({ characterCount: count, characterLimit: limit });
    expect(at(899_999)).toBe(false);
    expect(at(900_000)).toBe(true);
    expect(at(1_000_000)).toBe(true);
    expect(at(0, 0)).toBe(true);
  });

  it("throws when the usage answer has no counts", async () => {
    const { fetch } = fakeFetch(() => json({}));
    await expect(readUsage({ key: "k", fetch })).rejects.toThrow(
      /no character counts/,
    );
  });
});
