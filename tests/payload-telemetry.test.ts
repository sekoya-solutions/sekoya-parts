// Payload sends anonymous usage data to telemetry.payloadcms.com unless its
// resolved config has telemetry set to false (issue #88). Payload fills in
// true when the option is left out, so this test fails without the setting.
// Resolving the config opens no database connection.

import { describe, expect, it } from "vitest";
import config from "../payload.config.ts";

describe("Payload config", () => {
  it("turns telemetry off", async () => {
    expect((await config).telemetry).toBe(false);
  });
});
