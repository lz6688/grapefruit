import assert from "node:assert";
import { describe, it } from "node:test";

import { process as serializeProcess } from "../lib/serializer.ts";

describe("serializer", () => {
  it("makes process metadata JSON-safe when Frida returns bigint", () => {
    const serialized = serializeProcess({
      name: "SpringBoard",
      pid: 123,
      parameters: {
        path: "/System/Library/CoreServices/SpringBoard.app/SpringBoard",
        user: "mobile",
        ppid: 1n,
        started: "2026-04-04T00:00:00.000Z",
      },
    } as any);

    assert.doesNotThrow(() => JSON.stringify(serialized));
    assert.strictEqual(serialized.ppid, 1);
  });
});
