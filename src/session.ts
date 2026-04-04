import { SessionDetachReason, type SpawnOptions, type Device } from "frida";

import frida from "./lib/xvii.ts";
import env from "./lib/env.ts";
import { agent } from "./lib/assets.ts";
import { check as isRestrictedBundle } from "./lib/regulation.ts";
import { Writer } from "./lib/log.ts";
import { fnv1a } from "./lib/hash.ts";
import { NSURLStore } from "./lib/store/nsurl.ts";
import { HttpStore } from "./lib/store/http.ts";
import { HookStore } from "./lib/store/hooks.ts";
import { CryptoStore } from "./lib/store/crypto.ts";
import { FlutterStore } from "./lib/store/flutter.ts";
import { JNIStore } from "./lib/store/jni.ts";
import { XPCStore } from "./lib/store/xpc.ts";
import { HermesStore } from "./lib/store/hermes.ts";
import { PrivacyStore } from "./lib/store/privacy.ts";
import { createScriptPlanStore } from "./lib/store/script-plans.ts";
import { formatInjectionLogLine } from "./lib/injection-log.ts";
import { setup as setupRelay } from "./relay.ts";
import type {
  InjectWhen,
  InjectionReport,
  InjectionResultItem,
  LaunchType,
  Platform,
  SessionParams,
  SessionSocket,
  SessionStores,
} from "./types.ts";

const manager = frida.getDeviceManager();
const scriptPlans = createScriptPlanStore();

export { manager };

async function resolveAppTarget(
  device: Device,
  bundleId: string,
  platform: Platform,
): Promise<{ pid: number; launch: LaunchType }> {
  const match = await device.enumerateApplications({
    identifiers: [bundleId],
    scope: frida.Scope.Full,
  });

  const app = match.at(0);
  if (!app) throw new Error(`Application ${bundleId} not found on device`);

  if (app.pid && app.pid !== 0) {
    const frontmost = await device.getFrontmostApplication().catch(() => null);
    if (frontmost?.pid === app.pid) {
      return { pid: app.pid, launch: "attach" };
    }
  }

  const devParams = await device.querySystemParameters();
  const opt: SpawnOptions = {};

  if (platform === "fruity") {
    if (devParams.access === "full" && devParams.os.id === "ios") {
      opt.env = {
        DISABLE_TWEAKS: "1",
      };
    }
  }

  return {
    pid: await device.spawn(bundleId, opt),
    launch: "spawn",
  };
}

function rpcErrorMessage(ns: string, method: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `RPC method ${ns}.${method} failed: ${msg}`;
}

async function evaluateManagedScript(
  script: Awaited<
    ReturnType<typeof import("frida").Session.prototype.createScript>
  >,
  source: string,
  name: string,
) {
  return script.exports.invoke("script", "evaluate", [source, name]);
}

function skippedItem(
  planId: number,
  planName: string,
  scriptId: number,
  scriptName: string,
  injectWhen: InjectWhen,
  error: string,
): InjectionResultItem {
  return {
    planId,
    planName,
    scriptId,
    scriptName,
    injectWhen,
    status: "skipped",
    error,
  };
}

interface PendingInjectionLog {
  level: "info" | "error";
  text: string;
}

function queueInjectionLog(
  logs: PendingInjectionLog[],
  logger: Writer,
  level: "info" | "error",
  text: string,
) {
  logger.appendAgentLog(level, text);
  logs.push({ level, text });
}

async function runInjectionStage(
  plans: ReturnType<typeof scriptPlans.match>,
  stage: InjectWhen,
  script: Awaited<
    ReturnType<typeof import("frida").Session.prototype.createScript>
  >,
  results: InjectionResultItem[],
  blockedPlans: Set<number>,
) {
  for (const plan of plans) {
    const stageItems = plan.items.filter(
      (item) => item.enabled && item.injectWhen === stage,
    );

    if (blockedPlans.has(plan.id)) {
      for (const item of stageItems) {
        results.push(
          skippedItem(
            plan.id,
            plan.name,
            item.scriptId,
            item.scriptName,
            item.injectWhen,
            "skipped after previous injection failure",
          ),
        );
      }
      continue;
    }

    for (const item of stageItems) {
      try {
        await evaluateManagedScript(
          script,
          item.scriptSource,
          `managed:${plan.name}:${item.scriptName}:${item.injectWhen}`,
        );
        results.push({
          planId: plan.id,
          planName: plan.name,
          scriptId: item.scriptId,
          scriptName: item.scriptName,
          injectWhen: item.injectWhen,
          status: "success",
        });
      } catch (err) {
        results.push({
          planId: plan.id,
          planName: plan.name,
          scriptId: item.scriptId,
          scriptName: item.scriptName,
          injectWhen: item.injectWhen,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        if (!plan.continueOnError) {
          blockedPlans.add(plan.id);
        }
      }
    }
  }
}

function summarizeInjection(
  launch: LaunchType,
  matchedPlans: number,
  results: InjectionResultItem[],
): InjectionReport {
  return {
    launch,
    matchedPlans,
    results,
    summary: {
      successful: results.filter((item) => item.status === "success").length,
      failed: results.filter((item) => item.status === "error").length,
      skipped: results.filter((item) => item.status === "skipped").length,
    },
  };
}

function setupSocketHandlers(
  socket: SessionSocket,
  script: Awaited<
    ReturnType<typeof import("frida").Session.prototype.createScript>
  >,
  session: Awaited<ReturnType<typeof import("frida").Device.prototype.attach>>,
  logger: Writer,
) {
  session.detached.connect((reason, crash) => {
    console.error("session detached:", reason, crash);
    switch (reason) {
      case SessionDetachReason.ApplicationRequested:
        break;
      case SessionDetachReason.DeviceLost:
        console.error("device lost");
        break;
      case SessionDetachReason.ProcessTerminated:
      case SessionDetachReason.ProcessReplaced:
        console.error("process was terminated or replaced");
    }
    socket.emit("detached", reason as string);
    socket.disconnect(true);
  });

  socket
    .on("rpc", (ns, method, args, ack) => {
      if (
        typeof ns !== "string" ||
        typeof method !== "string" ||
        !Array.isArray(args)
      ) {
        console.warn(`invalid RPC call ${ns}.${method}, dropping`, args);
        return;
      }

      console.info(`RPC method: ${ns}.${method}`, ...args);
      script.exports
        .invoke(ns, method, args)
        .then(
          (result) => ack(null, result),
          (err: Error) => {
            console.error(`RPC method ${method} failed:`, err);
            ack(rpcErrorMessage(ns, method, err), null);
          },
        )
        .catch((err: Error) => {
          console.error(`RPC method ${method} failed:`, err);
          ack(rpcErrorMessage(ns, method, err), null);
        });
    })
    .on("eval", (source, name, ack) => {
      console.info(`evaluating script: ${name}`);
      script.exports
        .invoke("script", "evaluate", [source, name])
        .then((result: unknown) => ack(null, result))
        .catch((err: Error) =>
          ack(rpcErrorMessage("script", "evaluate", err), null),
        );
    })
    .on("clearLog", (type, ack) => {
      logger
        .empty(type)
        .then(() => ack(null, true))
        .catch((err) => ack(rpcErrorMessage("log", "clearLog", err), null));
    })
    .on("disconnect", () => {
      console.info("socket disconnected");
      script
        .unload()
        .finally(() => session.detach())
        .finally(() => logger.close());
    });
}

export function parse(query: Record<string, unknown>): SessionParams | null {
  const { device, platform, mode, bundle, pid, name } = query;

  if (typeof device !== "string") return null;
  if (platform !== "fruity" && platform !== "droid") return null;
  if (mode !== "app" && mode !== "daemon") return null;

  if (mode === "app" && typeof bundle !== "string") return null;
  if (mode === "daemon" && typeof pid !== "string") return null;

  return {
    deviceId: device,
    platform: platform as Platform,
    mode: mode as "app" | "daemon",
    bundle: mode === "app" ? (bundle as string) : undefined,
    pid: mode === "daemon" ? parseInt(pid as string, 10) : undefined,
    name: typeof name === "string" ? name : undefined,
  };
}

export async function connect(socket: SessionSocket, params: SessionParams) {
  const {
    platform,
    mode,
    deviceId,
    bundle,
    pid: targetPid,
    name: processName,
  } = params;
  const device = await manager.getDeviceById(deviceId, env.timeout);

  let pid: number;
  let launch: LaunchType = "attach";
  if (mode === "app") {
    if (!bundle) throw new Error("bundle is required for app mode");

    if (isRestrictedBundle(bundle)) {
      socket.emit("denied");
      setTimeout(() => socket.disconnect(true), 100);
      return;
    }

    const target = await resolveAppTarget(device, bundle, platform);
    pid = target.pid;
    launch = target.launch;
  } else {
    if (!targetPid) throw new Error("pid is required for daemon mode");
    pid = targetPid;
  }

  const session = await device.attach(pid);

  let identifier: string;
  if (mode === "app") {
    identifier = bundle!;
  } else {
    const pname = processName || "pid";
    identifier = `${pname}-${fnv1a(pname + pid)}`;
  }

  const stores: SessionStores = {
    nsurl: new NSURLStore(deviceId, identifier),
    http: new HttpStore(deviceId, identifier),
    hooks: new HookStore(deviceId, identifier),
    crypto: new CryptoStore(deviceId, identifier),
    flutter: new FlutterStore(deviceId, identifier),
    jni: new JNIStore(deviceId, identifier),
    xpc: new XPCStore(deviceId, identifier),
    hermes: new HermesStore(deviceId, identifier),
    privacy: new PrivacyStore(deviceId, identifier),
  };

  const logHandles = await Writer.open(deviceId, identifier);
  const script = await session.createScript(await agent(platform));

  setupRelay(socket, script, logHandles, stores);
  setupSocketHandlers(socket, script, session, logHandles);

  await script.load();

  const matchedPlans = scriptPlans.match({
    platform,
    mode,
    bundle,
    pid,
    processName,
    autoApply: true,
  });
  const injectionResults: InjectionResultItem[] = [];
  const blockedPlans = new Set<number>();
  const pendingLogs: PendingInjectionLog[] = [];

  if (matchedPlans.length > 0) {
    queueInjectionLog(
      pendingLogs,
      logHandles,
      "info",
      `[inject] matched ${matchedPlans.length} plan(s) for ${launch} session`,
    );
  }

  if (launch !== "spawn") {
    for (const plan of matchedPlans) {
      for (const item of plan.items) {
        if (item.enabled && item.injectWhen === "spawn") {
          injectionResults.push(
            skippedItem(
              plan.id,
              plan.name,
              item.scriptId,
              item.scriptName,
              item.injectWhen,
              "spawn-only script skipped on attach session",
            ),
          );
        }
      }
    }
  } else {
    await runInjectionStage(
      matchedPlans,
      "spawn",
      script,
      injectionResults,
      blockedPlans,
    );
  }

  if (mode === "app" && launch === "spawn") {
    await device.resume(pid).catch(() => {});
  }

  await runInjectionStage(
    matchedPlans,
    "attach",
    script,
    injectionResults,
    blockedPlans,
  );

  socket.emit("ready", session.pid);

  if (matchedPlans.length > 0) {
    for (const result of injectionResults) {
      queueInjectionLog(
        pendingLogs,
        logHandles,
        result.status === "error" ? "error" : "info",
        formatInjectionLogLine(result),
      );
    }
    for (const entry of pendingLogs) {
      socket.emit("log", entry.level, entry.text);
    }
    socket.emit(
      "injection",
      summarizeInjection(launch, matchedPlans.length, injectionResults),
    );
  }
}
