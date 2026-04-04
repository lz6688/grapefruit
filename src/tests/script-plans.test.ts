import { afterEach, describe, it } from "node:test";
import assert from "node:assert";

import {
  createScriptStore,
  type ScriptRecord,
} from "../lib/store/scripts.ts";
import {
  createScriptPlanStore,
  type ScriptPlanRecord,
} from "../lib/store/script-plans.ts";

const scriptStore = createScriptStore();
const planStore = createScriptPlanStore();

const scriptIds = new Set<number>();
const planIds = new Set<number>();

function trackScript(script: ScriptRecord) {
  scriptIds.add(script.id);
  return script;
}

function trackPlan(plan: ScriptPlanRecord) {
  planIds.add(plan.id);
  return plan;
}

afterEach(() => {
  for (const planId of planIds) {
    planStore.rm(planId);
  }
  planIds.clear();

  for (const scriptId of scriptIds) {
    scriptStore.rm(scriptId);
  }
  scriptIds.clear();
});

describe("script plan store", () => {
  it("creates and loads scripts with plan items", () => {
    const script = trackScript(
      scriptStore.create({
        name: "trace bootstrap",
        description: "injects early hooks",
        source: "Interceptor.attach(ptr('0x1'), {});",
      }),
    );

    const plan = trackPlan(
      planStore.create({
        name: "Safari auto hooks",
        enabled: true,
        autoApply: true,
        continueOnError: true,
        priority: 10,
      }),
    );

    planStore.replaceTargets(plan.id, [
      { platform: "fruity", mode: "app", bundle: "com.apple.mobilesafari" },
    ]);
    planStore.replaceItems(plan.id, [
      { scriptId: script.id, injectWhen: "spawn", enabled: true },
    ]);

    const full = planStore.get(plan.id);
    assert.ok(full);
    assert.strictEqual(full.targets[0]?.bundle, "com.apple.mobilesafari");
    assert.strictEqual(full.items[0]?.injectWhen, "spawn");
    assert.strictEqual(full.items[0]?.scriptId, script.id);
    assert.strictEqual(full.items[0]?.scriptName, script.name);
  });

  it("matches plans by bundle and daemon process identity", () => {
    const appScript = trackScript(
      scriptStore.create({
        name: "bootstrap",
        source: "send('bootstrap');",
      }),
    );
    const daemonScript = trackScript(
      scriptStore.create({
        name: "auditd hook",
        source: "send('daemon');",
      }),
    );

    const appPlan = trackPlan(
      planStore.create({
        name: "App plan",
        enabled: true,
        autoApply: true,
      }),
    );
    planStore.replaceTargets(appPlan.id, [
      { platform: "fruity", mode: "app", bundle: "com.test.demo" },
    ]);
    planStore.replaceItems(appPlan.id, [
      { scriptId: appScript.id, injectWhen: "attach", enabled: true },
    ]);

    const daemonPlan = trackPlan(
      planStore.create({
        name: "Daemon plan",
        enabled: true,
        autoApply: true,
      }),
    );
    planStore.replaceTargets(daemonPlan.id, [
      { platform: "droid", mode: "daemon", processName: "audioserver" },
      { platform: "droid", mode: "daemon", pid: 31337 },
    ]);
    planStore.replaceItems(daemonPlan.id, [
      { scriptId: daemonScript.id, injectWhen: "attach", enabled: true },
    ]);

    const matchedApp = planStore.match({
      platform: "fruity",
      mode: "app",
      bundle: "com.test.demo",
      pid: 777,
    });
    assert.deepStrictEqual(
      matchedApp.map((plan) => plan.id),
      [appPlan.id],
    );

    const matchedDaemonByName = planStore.match({
      platform: "droid",
      mode: "daemon",
      pid: 42,
      processName: "audioserver",
    });
    assert.deepStrictEqual(
      matchedDaemonByName.map((plan) => plan.id),
      [daemonPlan.id],
    );

    const matchedDaemonByPid = planStore.match({
      platform: "droid",
      mode: "daemon",
      pid: 31337,
      processName: "surfaceflinger",
    });
    assert.deepStrictEqual(
      matchedDaemonByPid.map((plan) => plan.id),
      [daemonPlan.id],
    );
  });

  it("removes dependent plan items when deleting scripts", () => {
    const script = trackScript(
      scriptStore.create({
        name: "temporary",
        source: "1 + 1",
      }),
    );
    const plan = trackPlan(planStore.create({ name: "Cleanup" }));

    planStore.replaceTargets(plan.id, [
      { platform: "fruity", mode: "app", bundle: "com.test.cleanup" },
    ]);
    planStore.replaceItems(plan.id, [
      { scriptId: script.id, injectWhen: "attach", enabled: true },
    ]);

    scriptStore.rm(script.id);
    scriptIds.delete(script.id);

    const full = planStore.get(plan.id);
    assert.ok(full);
    assert.deepStrictEqual(full.items, []);
  });
});
