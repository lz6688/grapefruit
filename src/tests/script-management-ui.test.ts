import { describe, it, expect } from "bun:test";

import { applyFridaTypes } from "../../gui/src/lib/frida-editor.ts";
import { scriptItemLabel } from "../../gui/src/lib/scripts-ui.ts";
import { formatInjectionLogLine } from "../lib/injection-log.ts";

function createDefaultsMock() {
  return {
    compilerOptions: { strict: true },
    libs: [] as Array<{ source: string; name: string }>,
    getCompilerOptions() {
      return this.compilerOptions;
    },
    setCompilerOptions(next: Record<string, unknown>) {
      this.compilerOptions = next;
    },
    addExtraLib(source: string, name: string) {
      this.libs.push({ source, name });
    },
  };
}

describe("script management ui helpers", () => {
  it("applies frida typings to both javascript and typescript monaco defaults", () => {
    const js = createDefaultsMock();
    const ts = createDefaultsMock();

    applyFridaTypes(
      {
        languages: {
          typescript: {
            ScriptTarget: { ESNext: 99 },
            javascriptDefaults: js,
            typescriptDefaults: ts,
          },
        },
      },
      {
        "frida.d.ts": "declare const ObjC: any;",
        "agent.d.ts": "declare const send: any;",
      },
    );

    expect(js.compilerOptions.target).toBe(99);
    expect(ts.compilerOptions.target).toBe(99);
    expect(js.libs).toEqual([
      { name: "frida.d.ts", source: "declare const ObjC: any;" },
      { name: "agent.d.ts", source: "declare const send: any;" },
    ]);
    expect(ts.libs).toEqual([
      { name: "frida.d.ts", source: "declare const ObjC: any;" },
      { name: "agent.d.ts", source: "declare const send: any;" },
    ]);
  });

  it("resolves script queue label from script list and falls back to embedded plan name", () => {
    expect(
      scriptItemLabel(
        { scriptId: 7, enabled: true, injectWhen: "attach", scriptName: "cached" },
        [{ id: 7, name: "live name", description: null, source: "" }],
      ),
    ).toBe("live name");

    expect(
      scriptItemLabel(
        { scriptId: 9, enabled: true, injectWhen: "spawn", scriptName: "saved in plan" },
        [],
      ),
    ).toBe("saved in plan");

    expect(
      scriptItemLabel(
        { scriptId: 13, enabled: true, injectWhen: "attach" },
        [],
      ),
    ).toBe("Script #13");
  });

  it("formats injection log lines with status and error details", () => {
    expect(
      formatInjectionLogLine({
        planId: 1,
        planName: "Safari",
        scriptId: 2,
        scriptName: "bootstrap",
        injectWhen: "spawn",
        status: "success",
      }),
    ).toBe("[inject][success][spawn] Safari / bootstrap");

    expect(
      formatInjectionLogLine({
        planId: 1,
        planName: "Safari",
        scriptId: 3,
        scriptName: "late hook",
        injectWhen: "attach",
        status: "error",
        error: "bad access",
      }),
    ).toBe("[inject][error][attach] Safari / late hook - bad access");
  });
});
