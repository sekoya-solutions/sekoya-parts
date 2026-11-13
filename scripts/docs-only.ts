// Decides whether a change is documentation only (issue #91): every file whose
// content differs between two commits ends in ".md". The two trees are
// compared directly, with no merge base, so the answer needs no history: when
// it is "documentation only", the code of the head commit is exactly the code
// of the base commit, which has already been built and tested.
//
// Exit code 0 means documentation only; any other exit, including an error,
// means the change touches code, so a failure never skips a check or a build.
//
// Usage:
//   node scripts/docs-only.ts <base> <head>   compares two commits already
//                                             fetched (GitHub Actions)
//   node scripts/docs-only.ts --vercel        Vercel's ignoreCommand: fetches
//                                             the base from GitHub itself
import { execFileSync } from "node:child_process";

/**
 * True when every path ends in ".md". An empty list is true too: the two
 * trees are identical, so there is no code to build or test.
 */
export const isDocsOnly = (files: readonly string[]): boolean =>
  files.every((file) => file.endsWith(".md"));

/**
 * The paths whose content differs between two commits. With --no-renames, a
 * renamed file lists both its old and new path, so renaming code to Markdown
 * still counts as a code change.
 */
export const changedFiles = (base: string, head: string, cwd?: string) =>
  execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", base, head, "--"],
    { cwd, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);

/**
 * What Vercel's build compares against, from its system environment
 * variables, or null when the build must go ahead.
 * - Production: the last commit Vercel deployed successfully on main
 *   (VERCEL_GIT_PREVIOUS_SHA), which is the code production serves.
 * - Preview: the tip of main, the code every pull request is checked against.
 */
export const vercelBase = (
  env: Readonly<Record<string, string | undefined>>,
): { url: string; ref: string } | null => {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const slug = env.VERCEL_GIT_REPO_SLUG;
  if (!owner || !slug) return null;
  const url = `https://github.com/${owner}/${slug}.git`;
  if (env.VERCEL_ENV === "production") {
    const previous = env.VERCEL_GIT_PREVIOUS_SHA;
    return previous ? { url, ref: previous } : null;
  }
  if (env.VERCEL_ENV === "preview") return { url, ref: "main" };
  return null;
};

const main = () => {
  const args = process.argv.slice(2);
  let base: string;
  let head: string;
  if (args[0] === "--vercel") {
    const target = vercelBase(process.env);
    if (!target) {
      console.log("docs-only: no base to compare with, building.");
      process.exit(1);
    }
    // Vercel's clone is shallow and may lack the base commit: one fetch of
    // that single commit from the public repository.
    execFileSync(
      "git",
      ["fetch", "--quiet", "--no-tags", "--depth=1", target.url, target.ref],
      { stdio: "inherit" },
    );
    base = "FETCH_HEAD";
    head = "HEAD";
  } else if (args.length === 2 && args[0] && args[1]) {
    [base, head] = [args[0], args[1]];
  } else {
    console.error("Usage: docs-only.ts <base> <head> | --vercel");
    process.exit(2);
  }
  const files = changedFiles(base, head);
  const docsOnly = isDocsOnly(files);
  console.log(
    `docs-only: ${files.length} changed file(s), ${
      docsOnly ? "documentation only" : "code changed"
    }.`,
  );
  process.exit(docsOnly ? 0 : 1);
};

if (import.meta.main) main();
