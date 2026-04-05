import { describe, expect, it } from "bun:test";

import getVersion from "../lib/version.ts";

describe("getVersion", () => {
  it("returns bundled versions for startup-critical packages", async () => {
    await expect(getVersion("frida")).resolves.toMatch(/^\d+\.\d+\.\d+/);
    await expect(getVersion("frida16")).resolves.toMatch(/^\d+\.\d+\.\d+/);
    await expect(getVersion("igf")).resolves.toMatch(/^\d+\.\d+\.\d+/);
  });
});
