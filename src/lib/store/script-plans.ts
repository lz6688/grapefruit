import { asc, desc, eq, inArray } from "drizzle-orm";

import {
  scriptPlanItems,
  scriptPlans,
  scriptPlanTargets,
  scripts,
} from "../schema.ts";
import { db } from "./db.ts";

export type ScriptTargetPlatform = "fruity" | "droid";
export type ScriptTargetMode = "app" | "daemon";
export type InjectWhen = "attach" | "spawn";

export type ScriptPlanRecord = typeof scriptPlans.$inferSelect;
export type ScriptPlanTargetRecord = typeof scriptPlanTargets.$inferSelect;
export type ScriptPlanItemRecord = typeof scriptPlanItems.$inferSelect;

export interface ScriptPlanInput {
  name: string;
  enabled?: boolean;
  autoApply?: boolean;
  continueOnError?: boolean;
  priority?: number;
}

export interface ScriptPlanTargetInput {
  platform: ScriptTargetPlatform;
  mode: ScriptTargetMode;
  bundle?: string | null;
  processName?: string | null;
  pid?: number | null;
}

export interface ScriptPlanItemInput {
  scriptId: number;
  injectWhen: InjectWhen;
  enabled?: boolean;
}

export interface ScriptPlanItemView
  extends Omit<ScriptPlanItemRecord, "injectWhen"> {
  injectWhen: InjectWhen;
  scriptName: string;
  scriptDescription: string | null;
  scriptSource: string;
}

export interface ScriptPlanView extends ScriptPlanRecord {
  targets: ScriptPlanTargetRecord[];
  items: ScriptPlanItemView[];
}

export interface ScriptPlanSummary extends ScriptPlanRecord {
  targetCount: number;
  itemCount: number;
}

export interface ScriptPlanMatchInput {
  platform: ScriptTargetPlatform;
  mode: ScriptTargetMode;
  bundle?: string;
  processName?: string;
  pid?: number;
  autoApply?: boolean;
}

function cleanPlanName(name: string): string {
  const value = name.trim();
  if (!value) throw new Error("plan name is required");
  return value;
}

function normalizeTarget(input: ScriptPlanTargetInput): Omit<
  ScriptPlanTargetRecord,
  "id" | "planId"
> {
  if (input.platform !== "fruity" && input.platform !== "droid") {
    throw new Error("target platform must be fruity or droid");
  }

  if (input.mode !== "app" && input.mode !== "daemon") {
    throw new Error("target mode must be app or daemon");
  }

  const bundle = input.bundle?.trim() || null;
  const processName = input.processName?.trim() || null;
  const pid = input.pid ?? null;

  if (input.mode === "app" && !bundle) {
    throw new Error("app target requires bundle");
  }

  if (input.mode === "daemon" && processName === null && pid === null) {
    throw new Error("daemon target requires processName or pid");
  }

  return {
    platform: input.platform,
    mode: input.mode,
    bundle: input.mode === "app" ? bundle : null,
    processName: input.mode === "daemon" ? processName : null,
    pid: input.mode === "daemon" ? pid : null,
  };
}

function normalizeItem(input: ScriptPlanItemInput): Omit<
  ScriptPlanItemRecord,
  "id" | "planId" | "position"
> {
  if (input.injectWhen !== "attach" && input.injectWhen !== "spawn") {
    throw new Error("injectWhen must be attach or spawn");
  }

  return {
    scriptId: input.scriptId,
    injectWhen: input.injectWhen,
    enabled: input.enabled ?? true,
  };
}

function targetMatches(
  target: ScriptPlanTargetRecord,
  input: ScriptPlanMatchInput,
): boolean {
  if (target.platform !== input.platform || target.mode !== input.mode) {
    return false;
  }

  if (target.mode === "app") {
    return !!input.bundle && target.bundle === input.bundle;
  }

  let constrained = false;

  if (target.pid !== null) {
    constrained = true;
    if (input.pid !== target.pid) return false;
  }

  if (target.processName) {
    constrained = true;
    if (input.processName !== target.processName) return false;
  }

  return constrained;
}

function touchPlan(planId: number) {
  db.update(scriptPlans)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(scriptPlans.id, planId))
    .run();
}

export function createScriptPlanStore() {
  return {
    list(): ScriptPlanSummary[] {
      const plans = db
        .select()
        .from(scriptPlans)
        .orderBy(desc(scriptPlans.priority), desc(scriptPlans.updatedAt), asc(scriptPlans.id))
        .all();

      return plans.map((plan) => ({
        ...plan,
        targetCount: db
          .select()
          .from(scriptPlanTargets)
          .where(eq(scriptPlanTargets.planId, plan.id))
          .all().length,
        itemCount: db
          .select()
          .from(scriptPlanItems)
          .where(eq(scriptPlanItems.planId, plan.id))
          .all().length,
      }));
    },

    get(id: number): ScriptPlanView | null {
      const plan = db
        .select()
        .from(scriptPlans)
        .where(eq(scriptPlans.id, id))
        .get();
      if (!plan) return null;

      const targets = db
        .select()
        .from(scriptPlanTargets)
        .where(eq(scriptPlanTargets.planId, id))
        .orderBy(asc(scriptPlanTargets.id))
        .all();

      const items = db
        .select()
        .from(scriptPlanItems)
        .where(eq(scriptPlanItems.planId, id))
        .orderBy(asc(scriptPlanItems.position), asc(scriptPlanItems.id))
        .all();

      const ids = [...new Set(items.map((item) => item.scriptId))];
      const linkedScripts = ids.length
        ? db
            .select({
              id: scripts.id,
              name: scripts.name,
              description: scripts.description,
              source: scripts.source,
            })
            .from(scripts)
            .where(inArray(scripts.id, ids))
            .all()
        : [];

      const scriptMap = new Map(linkedScripts.map((script) => [script.id, script]));

      return {
        ...plan,
        targets,
        items: items
          .map((item) => {
            const script = scriptMap.get(item.scriptId);
            if (!script) return null;
            return {
              ...item,
              scriptName: script.name,
              scriptDescription: script.description,
              scriptSource: script.source,
            };
          })
          .filter((item): item is ScriptPlanItemView => item !== null),
      };
    },

    create(input: Partial<ScriptPlanInput>): ScriptPlanRecord {
      const now = new Date().toISOString();
      const row = db
        .insert(scriptPlans)
        .values({
          name: cleanPlanName(input.name ?? "New Plan"),
          enabled: input.enabled ?? true,
          autoApply: input.autoApply ?? true,
          continueOnError: input.continueOnError ?? true,
          priority: input.priority ?? 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      if (!row) throw new Error("failed to create plan");
      return row;
    },

    update(id: number, input: Partial<ScriptPlanInput>): ScriptPlanRecord | null {
      const current = db
        .select()
        .from(scriptPlans)
        .where(eq(scriptPlans.id, id))
        .get();
      if (!current) return null;

      db.update(scriptPlans)
        .set({
          name:
            input.name !== undefined ? cleanPlanName(input.name) : current.name,
          enabled: input.enabled ?? current.enabled,
          autoApply: input.autoApply ?? current.autoApply,
          continueOnError:
            input.continueOnError ?? current.continueOnError,
          priority: input.priority ?? current.priority,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(scriptPlans.id, id))
        .run();

      return (
        db.select().from(scriptPlans).where(eq(scriptPlans.id, id)).get() ?? null
      );
    },

    replaceTargets(id: number, targets: ScriptPlanTargetInput[]): ScriptPlanTargetRecord[] {
      if (!this.get(id)) throw new Error("plan not found");

      const rows = targets.map(normalizeTarget);
      db.delete(scriptPlanTargets).where(eq(scriptPlanTargets.planId, id)).run();

      if (rows.length > 0) {
        db.insert(scriptPlanTargets)
          .values(rows.map((row) => ({ ...row, planId: id })))
          .run();
      }

      touchPlan(id);

      return db
        .select()
        .from(scriptPlanTargets)
        .where(eq(scriptPlanTargets.planId, id))
        .orderBy(asc(scriptPlanTargets.id))
        .all();
    },

    replaceItems(id: number, items: ScriptPlanItemInput[]): ScriptPlanItemView[] {
      if (!this.get(id)) throw new Error("plan not found");

      const rows = items.map(normalizeItem);
      const scriptIds = [...new Set(rows.map((item) => item.scriptId))];
      const existingScripts = scriptIds.length
        ? db
            .select({ id: scripts.id })
            .from(scripts)
            .where(inArray(scripts.id, scriptIds))
            .all()
        : [];

      if (existingScripts.length !== scriptIds.length) {
        throw new Error("plan item references a missing script");
      }

      db.delete(scriptPlanItems).where(eq(scriptPlanItems.planId, id)).run();

      if (rows.length > 0) {
        db.insert(scriptPlanItems)
          .values(
            rows.map((row, index) => ({
              ...row,
              planId: id,
              position: index,
            })),
          )
          .run();
      }

      touchPlan(id);
      return this.get(id)?.items ?? [];
    },

    rm(id: number): boolean {
      const exists = this.get(id);
      if (!exists) return false;

      db.delete(scriptPlanItems).where(eq(scriptPlanItems.planId, id)).run();
      db.delete(scriptPlanTargets).where(eq(scriptPlanTargets.planId, id)).run();
      db.delete(scriptPlans).where(eq(scriptPlans.id, id)).run();
      return true;
    },

    match(input: ScriptPlanMatchInput): ScriptPlanView[] {
      const plans = db
        .select()
        .from(scriptPlans)
        .orderBy(desc(scriptPlans.priority), desc(scriptPlans.updatedAt), asc(scriptPlans.id))
        .all()
        .filter((plan) => plan.enabled)
        .filter((plan) => (input.autoApply ?? true ? plan.autoApply : true));

      return plans
        .map((plan) => this.get(plan.id))
        .filter((plan): plan is ScriptPlanView => plan !== null)
        .filter((plan) => plan.targets.some((target) => targetMatches(target, input)));
    },
  };
}
