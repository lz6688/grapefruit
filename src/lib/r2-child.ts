import type { CfgFunction } from "./r2.ts";
import { openLiveLocal, type R2Session } from "./r2.ts";

interface R2WorkerRequest {
  id: number;
  type: "open" | "rawCmd" | "cmd" | "disassemble" | "graph" | "close";
  payload?: Record<string, unknown>;
}

interface R2WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

function reply(message: R2WorkerResponse) {
  process.send?.(message);
}

let session: R2Session | null = null;
let queue = Promise.resolve();

async function cleanup() {
  if (!session) return;
  try {
    await session.r2.close();
  } finally {
    await session.fridaCleanup?.();
    session = null;
  }
}

async function handle(message: R2WorkerRequest) {
  switch (message.type) {
    case "open": {
      if (session) throw new Error("session already open");
      const payload = message.payload ?? {};
      session = await openLiveLocal({
        deviceId: String(payload.deviceId),
        pid: Number(payload.pid),
        arch: String(payload.arch),
        platform: String(payload.platform),
        pointerSize: Number(payload.pointerSize),
        pageSize: Number(payload.pageSize),
      });
      return { id: session.id };
    }

    case "rawCmd":
      if (!session) throw new Error("no session");
      return session.r2.rawCmd(String(message.payload?.command ?? ""));

    case "cmd":
      if (!session) throw new Error("no session");
      return session.r2.cmd(String(message.payload?.command ?? ""));

    case "disassemble":
      if (!session) throw new Error("no session");
      return session.r2.disassembleFunction(
        BigInt(String(message.payload?.address ?? "0")),
      );

    case "graph":
      if (!session) throw new Error("no session");
      return session.r2.functionGraph(
        BigInt(String(message.payload?.address ?? "0")),
      ) as Promise<CfgFunction | null>;

    case "close":
      await cleanup();
      return true;
  }
}

process.on("message", (incoming: unknown) => {
  if (!incoming || typeof incoming !== "object") {
    reply({ id: -1, ok: false, error: "invalid request payload" });
    return;
  }

  const message = incoming as Partial<R2WorkerRequest>;
  if (typeof message.id !== "number" || typeof message.type !== "string") {
    reply({ id: -1, ok: false, error: "invalid request payload" });
    return;
  }

  queue = queue
    .then(async () => {
      const result = await handle(message as R2WorkerRequest);
      reply({ id: message.id!, ok: true, result });
    })
    .catch((error) => {
      reply({
        id: message.id!,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
});

process.on("SIGTERM", () => {
  void cleanup().finally(() => process.exit(0));
});
