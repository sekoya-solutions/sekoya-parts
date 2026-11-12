// The automation user: the account agents and tests use, through its API key,
// to edit content on previews (issue #55). It signs in only with its key: its
// password is random and never stored.

/** A reserved domain (RFC 2606), so the address can never reach anyone. */
export const AUTOMATION_EMAIL = "automation@sekoya-parts.invalid";

/** The shortest key accepted, in characters. */
export const AUTOMATION_KEY_MIN_LENGTH = 32;

/**
 * Why the automation user must not be created or updated in this environment,
 * or null when it may. Only Vercel Preview builds create it, so production,
 * local and CI databases never get a user with a key.
 */
export function automationUserSkipReason(
  env: Record<string, string | undefined>,
): string | null {
  if (env.VERCEL_ENV !== "preview") return "not a Vercel Preview build";
  const key = env.AUTOMATION_API_KEY ?? "";
  if (key.length === 0) return "AUTOMATION_API_KEY is not set";
  if (key.length < AUTOMATION_KEY_MIN_LENGTH) {
    return `AUTOMATION_API_KEY is shorter than ${AUTOMATION_KEY_MIN_LENGTH} characters`;
  }
  return null;
}
