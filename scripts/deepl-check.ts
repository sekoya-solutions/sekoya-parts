// The live DeepL check (issue #104), run by .github/workflows/deepl-live.yml
// with the real key: it catches what the faked tests cannot, such as a
// rejected key, a nearly spent quota or a change in DeepL's API.
//
// Usage: node scripts/deepl-check.ts [--translate]
//
// It always reads the usage, which spends no characters, and fails on a
// rejected key or from 90% of the quota. With --translate (pull requests
// only) it also translates one short phrase, 16 characters of the free
// plan's 1,000,000 in total.
import {
  DeepLError,
  readUsage,
  translateFromFrench,
  USAGE_ALERT_SHARE,
  usageTooHigh,
} from "../cms/translation/deepl.ts";

const PHRASE = "Pompe de vidange";

function fail(message: string): never {
  console.error(`::error::${message}`);
  process.exit(1);
}

const key = process.env.DEEPL_API_KEY?.trim();
if (!key)
  fail(
    "DEEPL_API_KEY is not set: add it as a GitHub Actions secret of the repository.",
  );
const client = { key };

try {
  const usage = await readUsage(client);
  const share = usage.characterLimit
    ? usage.characterCount / usage.characterLimit
    : 1;
  console.log(
    `DeepL usage: ${usage.characterCount} of ${usage.characterLimit} characters (${(share * 100).toFixed(1)}%).`,
  );
  if (usageTooHigh(usage))
    fail(
      `DeepL's quota is ${(share * 100).toFixed(1)}% spent, at or over the ${USAGE_ALERT_SHARE * 100}% alert.`,
    );

  if (process.argv.includes("--translate")) {
    const [english] = await translateFromFrench(client, [PHRASE], "en");
    console.log(`"${PHRASE}" in British English: "${english}".`);
    if (!english || !/pump/i.test(english))
      fail(`DeepL translated "${PHRASE}" as "${english}", not a pump.`);
  }
  console.log("DeepL answers as expected.");
} catch (error) {
  if (error instanceof DeepLError) fail(error.message);
  throw error;
}
