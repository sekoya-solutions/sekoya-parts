// Whether a `next dev` server of a checkout is running (issue #193). Next.js
// 16 holds .next/dev/lock while its development server runs, with the
// server's process id and address in it; npm run test:e2e:local deletes the
// whole .next folder on Windows, which fails while that server holds it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type DevServer = { pid?: number; appUrl?: string };

/** Whether a process with this id runs. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * The development server that holds the checkout's .next/dev/lock, or
 * undefined when none does: no lock file, or one left by a process that
 * no longer runs. A lock file that cannot be read is held by a running
 * server, since Windows refuses reads of a locked file.
 */
export function runningDevServer(checkout: string): DevServer | undefined {
  let content: string;
  try {
    content = readFileSync(join(checkout, ".next", "dev", "lock"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return {};
  }
  let info: DevServer;
  try {
    info = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof info.pid !== "number" || !alive(info.pid)) return undefined;
  return info;
}
