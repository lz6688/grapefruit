import { EventEmitter } from "node:events";
import { describe, expect, it } from "bun:test";

import {
  createR2WorkerController,
  type R2WorkerChild,
} from "../lib/r2.ts";

class FakeStderr extends EventEmitter {
  setEncoding(_encoding: string) {}
}

class FakeChild extends EventEmitter implements R2WorkerChild {
  sent: unknown[] = [];
  stderr = new FakeStderr();

  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    this.sent.push(message);
    callback?.(null);
    return true;
  }

  kill(): boolean {
    this.emit("exit", 0, null);
    return true;
  }
}

describe("r2 worker controller", () => {
  it("sends IPC requests and resolves responses", async () => {
    const child = new FakeChild();
    const controller = createR2WorkerController(child);

    const pending = controller.rawCmd("ij");

    expect(child.sent).toEqual([
      {
        id: 1,
        type: "rawCmd",
        payload: { command: "ij" },
      },
    ]);

    child.emit("message", {
      id: 1,
      ok: true,
      result: '{"ok":true}',
    });

    await expect(pending).resolves.toBe('{"ok":true}');
  });

  it("rejects pending requests when the child exits", async () => {
    const child = new FakeChild();
    const controller = createR2WorkerController(child);

    const pending = controller.cmd("iIj");

    child.emit("exit", 1, null);

    await expect(pending).rejects.toThrow(/r2 child exited/);
  });
});
