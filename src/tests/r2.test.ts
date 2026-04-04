import { describe, expect, it } from "bun:test";

import { shouldConfigureLiveAsmArch } from "../lib/r2.ts";

describe("r2 live configuration", () => {
  it("skips asm.arch only for live darwin arm targets", () => {
    expect(shouldConfigureLiveAsmArch("darwin", "arm")).toBe(false);
    expect(shouldConfigureLiveAsmArch("darwin", "x86")).toBe(true);
    expect(shouldConfigureLiveAsmArch("linux", "arm")).toBe(true);
    expect(shouldConfigureLiveAsmArch(undefined, undefined)).toBe(true);
  });
});
