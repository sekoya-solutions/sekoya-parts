// robots.txt matching as Google documents it
// (https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt):
// a rule matches from the start of the path, `*` matches any sequence of
// characters and a final `$` the end of the path; the most specific rule,
// the longest, wins, and Allow wins a tie. A path no rule matches is allowed.
// For the tests of issue #121 and production's Lighthouse run (issue #130).

export type Rule = { allow: boolean; pattern: string };

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

export function isAllowed(rules: readonly Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (!rule.pattern || !matches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    )
      best = rule;
  }
  return best ? best.allow : true;
}

/** The rules of a robots.txt's group for every crawler (`User-Agent: *`). */
export function parseRobots(text: string): {
  rules: Rule[];
  sitemaps: string[];
} {
  const rules: Rule[] = [];
  const sitemaps: string[] = [];
  let inStarGroup = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") inStarGroup = value === "*";
    else if (field === "sitemap") sitemaps.push(value);
    else if (inStarGroup && (field === "allow" || field === "disallow"))
      rules.push({ allow: field === "allow", pattern: value });
  }
  return { rules, sitemaps };
}
