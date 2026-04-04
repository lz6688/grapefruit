# Script Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server-persisted script library and auto-applied injection plans with per-script `spawn`/`attach` timing, while keeping the existing scratch pad workflow intact.

**Architecture:** Add four SQLite tables plus small store modules for scripts and plans, expose CRUD APIs over Hono, extend the session handshake to resolve matching plans and execute them at the correct lifecycle stage, and add dedicated GUI management views for scripts and plans. Reuse the current session socket, scratch pad editor, Monaco setup, and Drizzle migration flow so the feature fits the existing Grapefruit stack instead of introducing a second persistence or orchestration system.

**Tech Stack:** Hono, Socket.IO, Drizzle ORM, SQLite, React, React Router, TanStack Query, Monaco Editor, Bun/Node test runners.

---

## File Structure

### Backend persistence and schema

- Modify: `src/lib/schema.ts`
  Add `scripts`, `script_plans`, `script_plan_targets`, and `script_plan_items` tables.
- Create: `src/lib/store/scripts.ts`
  CRUD helpers for stored scripts.
- Create: `src/lib/store/script-plans.ts`
  CRUD, target replacement, item replacement, and match resolution helpers for plans.
- Create: `drizzle/0002_script_management.sql`
  Migration for new tables and indexes.
- Modify: `drizzle/meta/_journal.json`
  Register the new migration entry.

### Backend routes and session flow

- Create: `src/routes/scripts.ts`
  REST endpoints for script CRUD, library import/export, and plan CRUD.
- Modify: `src/app.ts`
  Mount the new routes under `/api`.
- Modify: `src/session.ts`
  Track launch mode, load matching plans, run `spawn` and `attach` scripts, and publish injection results.
- Modify: `src/types.ts`
  Add typed socket event payloads for injection results.
- Modify: `src/ws.ts`
  No logic change expected, but may need type propagation if new socket events widen the session namespace surface.

### GUI API and state

- Modify: `gui/src/lib/rpc.ts`
  Add session event types for injection results if surfaced over socket.
- Create: `gui/src/lib/scripts-api.ts`
  Fetch helpers for scripts, library import/export, and plan CRUD.
- Create: `gui/src/lib/script-plan-types.ts`
  Shared client-side types for scripts, import/export payloads, plans, targets, items, and injection results.
- Create: `gui/src/lib/scripts-ui.ts`
  File import/export helpers plus plan-platform label mapping for `fruity`/`droid`.
- Modify: `gui/src/context/ReplContext.tsx`
  Add save-to-library affordances without removing current draft persistence.
- Modify: `gui/src/context/SessionContext.ts`
  Extend types only if session state needs last injection result.

### GUI pages and components

- Create: `gui/src/components/pages/ScriptsPage.tsx`
  Two-pane script library manager with single-script and full-library import/export actions.
- Create: `gui/src/components/pages/ScriptPlansPage.tsx`
  Two-pane injection plan manager.
- Create: `gui/src/components/shared/ScriptEditorPane.tsx`
  Reusable Monaco-based script editor plus metadata form and script-level import/export actions.
- Create: `gui/src/components/shared/ScriptPlanEditorPane.tsx`
  Plan editor with targets and ordered script items, showing `iOS` / `Android` labels for stored `fruity` / `droid` values.
- Modify: `gui/src/App.tsx`
  Add routes for script library and plan manager.
- Modify: `gui/src/components/layout/CommandPalette.tsx`
  Add navigation entries for scripts and plans if appropriate.
- Modify: `gui/src/components/tabs/CodeScratchPadTab.tsx`
  Add “save as script” and “save to existing script” actions.
- Modify: `gui/src/locales/en/translation.json`
  Add script management labels.
- Modify: `gui/src/locales/cn/translation.json`
  Add Chinese labels for the same keys.

### Tests

- Modify: `src/tests/app.test.ts`
  Add REST-level tests for scripts, library import/export, and plans.
- Modify: `src/tests/ws.test.ts`
  Add session/socket tests for injection result events and launch-stage behavior where feasible.
- Create: `src/tests/script-plans.test.ts`
  Add focused store and matching tests.
- Modify: `src/tests/script-management-ui.test.ts`
  Add focused UI-helper coverage for library import/export payloads and plan platform labels.

## Task 1: Add schema and migration for scripts and plans

**Files:**
- Modify: `/home/hacker/桌面/grapefruit/src/lib/schema.ts`
- Create: `/home/hacker/桌面/grapefruit/drizzle/0002_script_management.sql`
- Modify: `/home/hacker/桌面/grapefruit/drizzle/meta/_journal.json`
- Test: `/home/hacker/桌面/grapefruit/src/tests/script-plans.test.ts`

- [ ] **Step 1: Write the failing schema/store test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert";

import { createScriptStore } from "../lib/store/scripts.ts";
import { createScriptPlanStore } from "../lib/store/script-plans.ts";

describe("script management schema", () => {
  it("creates and reads scripts and plans", () => {
    const scripts = createScriptStore();
    const plans = createScriptPlanStore();

    const script = scripts.create({
      name: "trace bootstrap",
      description: "injects early hooks",
      source: "Interceptor.attach(ptr('0x1'), {});",
    });

    const plan = plans.create({
      name: "Safari auto hooks",
      enabled: true,
      autoApply: true,
      continueOnError: true,
      priority: 10,
    });

    plans.replaceTargets(plan.id, [
      { platform: "fruity", mode: "app", bundle: "com.apple.mobilesafari" },
    ]);
    plans.replaceItems(plan.id, [
      { scriptId: script.id, position: 0, injectWhen: "spawn", enabled: true },
    ]);

    const full = plans.get(plan.id);

    assert.strictEqual(full?.targets[0]?.bundle, "com.apple.mobilesafari");
    assert.strictEqual(full?.items[0]?.injectWhen, "spawn");
    assert.strictEqual(full?.items[0]?.scriptId, script.id);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/tests/script-plans.test.ts`
Expected: FAIL because `createScriptStore` / `createScriptPlanStore` and the new tables do not exist yet.

- [ ] **Step 3: Add the new schema tables**

Update `/home/hacker/桌面/grapefruit/src/lib/schema.ts` with four tables:

```ts
export const scripts = sqliteTable("scripts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  source: text("source").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_scripts_updated_at").on(table.updatedAt),
]);

export const scriptPlans = sqliteTable("script_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  autoApply: integer("auto_apply", { mode: "boolean" }).notNull().default(true),
  continueOnError: integer("continue_on_error", { mode: "boolean" }).notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const scriptPlanTargets = sqliteTable("script_plan_targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id").notNull(),
  platform: text("platform").notNull(),
  mode: text("mode").notNull(),
  bundle: text("bundle"),
  processName: text("process_name"),
  pid: integer("pid"),
}, (table) => [
  index("idx_script_plan_targets_plan_id").on(table.planId),
]);

export const scriptPlanItems = sqliteTable("script_plan_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id").notNull(),
  scriptId: integer("script_id").notNull(),
  position: integer("position").notNull(),
  injectWhen: text("inject_when").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
}, (table) => [
  index("idx_script_plan_items_plan_id").on(table.planId),
  uniqueIndex("idx_script_plan_items_position").on(table.planId, table.position),
]);
```

- [ ] **Step 4: Add the SQL migration and journal entry**

Create `/home/hacker/桌面/grapefruit/drizzle/0002_script_management.sql`:

```sql
CREATE TABLE `scripts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `source` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_scripts_updated_at` ON `scripts` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `script_plans` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `auto_apply` integer DEFAULT 1 NOT NULL,
  `continue_on_error` integer DEFAULT 1 NOT NULL,
  `priority` integer DEFAULT 0 NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `script_plan_targets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `plan_id` integer NOT NULL,
  `platform` text NOT NULL,
  `mode` text NOT NULL,
  `bundle` text,
  `process_name` text,
  `pid` integer
);
--> statement-breakpoint
CREATE INDEX `idx_script_plan_targets_plan_id` ON `script_plan_targets` (`plan_id`);
--> statement-breakpoint
CREATE TABLE `script_plan_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `plan_id` integer NOT NULL,
  `script_id` integer NOT NULL,
  `position` integer NOT NULL,
  `inject_when` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_script_plan_items_plan_id` ON `script_plan_items` (`plan_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_script_plan_items_position` ON `script_plan_items` (`plan_id`, `position`);
```

Append a new `0002_script_management` entry to `/home/hacker/桌面/grapefruit/drizzle/meta/_journal.json`.

- [ ] **Step 5: Run the test to verify the schema compiles but still fails on missing stores**

Run: `bun test src/tests/script-plans.test.ts`
Expected: FAIL complaining about missing store modules or methods, not schema shape.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schema.ts drizzle/0002_script_management.sql drizzle/meta/_journal.json src/tests/script-plans.test.ts
git commit -m "feat: add script management schema"
```

## Task 2: Implement script and plan stores with matching logic

**Files:**
- Create: `/home/hacker/桌面/grapefruit/src/lib/store/scripts.ts`
- Create: `/home/hacker/桌面/grapefruit/src/lib/store/script-plans.ts`
- Modify: `/home/hacker/桌面/grapefruit/src/tests/script-plans.test.ts`

- [ ] **Step 1: Extend the failing test to cover matching**

Add to `/home/hacker/桌面/grapefruit/src/tests/script-plans.test.ts`:

```ts
it("matches plans by platform and bundle for app sessions", () => {
  const scripts = createScriptStore();
  const plans = createScriptPlanStore();
  const script = scripts.create({ name: "bootstrap", source: "1", description: "" });
  const plan = plans.create({
    name: "Safari",
    enabled: true,
    autoApply: true,
    continueOnError: true,
    priority: 20,
  });

  plans.replaceTargets(plan.id, [
    { platform: "fruity", mode: "app", bundle: "com.apple.mobilesafari" },
  ]);
  plans.replaceItems(plan.id, [
    { scriptId: script.id, position: 0, injectWhen: "spawn", enabled: true },
  ]);

  const matched = plans.match({
    platform: "fruity",
    mode: "app",
    bundle: "com.apple.mobilesafari",
    pid: 123,
    name: undefined,
  });

  assert.strictEqual(matched.length, 1);
  assert.strictEqual(matched[0].items[0].script.name, "bootstrap");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/tests/script-plans.test.ts`
Expected: FAIL because the stores and `match()` do not exist yet.

- [ ] **Step 3: Implement the script store**

Create `/home/hacker/桌面/grapefruit/src/lib/store/scripts.ts`:

```ts
import { asc, desc, eq } from "drizzle-orm";
import { scripts } from "../schema.ts";
import { db } from "./db.ts";

export function createScriptStore() {
  return {
    list() {
      return db.select().from(scripts).orderBy(asc(scripts.name)).all();
    },
    get(id: number) {
      return db.select().from(scripts).where(eq(scripts.id, id)).get() ?? null;
    },
    create(input: { name: string; description?: string; source: string }) {
      const info = db.insert(scripts).values({
        name: input.name.trim(),
        description: input.description ?? null,
        source: input.source,
      }).run();
      return this.get(Number(info.lastInsertRowid))!;
    },
    update(id: number, input: { name: string; description?: string; source: string }) {
      db.update(scripts).set({
        name: input.name.trim(),
        description: input.description ?? null,
        source: input.source,
        updatedAt: new Date().toISOString(),
      }).where(eq(scripts.id, id)).run();
      return this.get(id);
    },
    remove(id: number) {
      db.delete(scripts).where(eq(scripts.id, id)).run();
    },
  };
}
```

- [ ] **Step 4: Implement the plan store and matcher**

Create `/home/hacker/桌面/grapefruit/src/lib/store/script-plans.ts`:

```ts
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db.ts";
import { scriptPlans, scriptPlanTargets, scriptPlanItems, scripts } from "../schema.ts";
import type { SessionParams } from "../../types.ts";

export function createScriptPlanStore() {
  return {
    create(input: {
      name: string;
      enabled: boolean;
      autoApply: boolean;
      continueOnError: boolean;
      priority: number;
    }) {
      const info = db.insert(scriptPlans).values(input).run();
      return this.get(Number(info.lastInsertRowid))!;
    },
    get(id: number) {
      const plan = db.select().from(scriptPlans).where(eq(scriptPlans.id, id)).get();
      if (!plan) return null;
      const targets = db.select().from(scriptPlanTargets).where(eq(scriptPlanTargets.planId, id)).all();
      const items = db.select({
        id: scriptPlanItems.id,
        planId: scriptPlanItems.planId,
        scriptId: scriptPlanItems.scriptId,
        position: scriptPlanItems.position,
        injectWhen: scriptPlanItems.injectWhen,
        enabled: scriptPlanItems.enabled,
        script: scripts,
      })
      .from(scriptPlanItems)
      .innerJoin(scripts, eq(scriptPlanItems.scriptId, scripts.id))
      .where(eq(scriptPlanItems.planId, id))
      .orderBy(asc(scriptPlanItems.position))
      .all();
      return { ...plan, targets, items };
    },
    replaceTargets(planId: number, targets: Array<{ platform: string; mode: string; bundle?: string; processName?: string; pid?: number }>) {
      db.delete(scriptPlanTargets).where(eq(scriptPlanTargets.planId, planId)).run();
      if (targets.length > 0) {
        db.insert(scriptPlanTargets).values(targets.map((t) => ({ ...t, planId }))).run();
      }
    },
    replaceItems(planId: number, items: Array<{ scriptId: number; position: number; injectWhen: "spawn" | "attach"; enabled: boolean }>) {
      db.delete(scriptPlanItems).where(eq(scriptPlanItems.planId, planId)).run();
      if (items.length > 0) {
        db.insert(scriptPlanItems).values(items.map((i) => ({ ...i, planId }))).run();
      }
    },
    match(params: SessionParams) {
      const candidates = db.select().from(scriptPlans)
        .where(and(eq(scriptPlans.enabled, true), eq(scriptPlans.autoApply, true)))
        .all()
        .sort((a, b) => b.priority - a.priority);
      return candidates
        .map((plan) => this.get(plan.id)!)
        .filter((plan) => plan.targets.some((target) => {
          if (target.platform !== params.platform || target.mode !== params.mode) return false;
          if (params.mode === "app") return target.bundle === params.bundle;
          if (target.pid != null && params.pid != null) return target.pid === params.pid;
          return !!target.processName && target.processName === params.name;
        }));
    },
  };
}
```

- [ ] **Step 5: Run the store tests to verify they pass**

Run: `bun test src/tests/script-plans.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/scripts.ts src/lib/store/script-plans.ts src/tests/script-plans.test.ts
git commit -m "feat: add script and plan stores"
```

## Task 3: Expose script and plan CRUD routes

**Files:**
- Create: `/home/hacker/桌面/grapefruit/src/routes/scripts.ts`
- Modify: `/home/hacker/桌面/grapefruit/src/app.ts`
- Modify: `/home/hacker/桌面/grapefruit/src/tests/app.test.ts`

- [ ] **Step 1: Write failing API tests**

Add to `/home/hacker/桌面/grapefruit/src/tests/app.test.ts`:

```ts
it("should create list update and delete scripts", async () => {
  const createRes = await app.request("/api/scripts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "auto hook",
      description: "test script",
      source: "console.log('ok')",
    }),
  });
  assert.strictEqual(createRes.status, 201);
  const created = await createRes.json() as { id: number; name: string };
  assert.strictEqual(created.name, "auto hook");

  const listRes = await app.request("/api/scripts");
  assert.strictEqual(listRes.status, 200);
  const listed = await listRes.json() as Array<{ id: number }>;
  assert(listed.some((item) => item.id === created.id));

  const updateRes = await app.request(`/api/scripts/${created.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "auto hook 2",
      description: "updated",
      source: "console.log(2)",
    }),
  });
  assert.strictEqual(updateRes.status, 200);

  const deleteRes = await app.request(`/api/scripts/${created.id}`, {
    method: "DELETE",
  });
  assert.strictEqual(deleteRes.status, 204);
});
```

Also add library import/export coverage:

```ts
it("should export and import the script library without overwriting duplicates", async () => {
  const existing = scriptStore.create({
    name: "bootstrap",
    description: "existing",
    source: "send('existing')",
  });
  scriptIds.add(existing.id);

  const exportRes = await app.request("/api/scripts/export");
  assert.strictEqual(exportRes.status, 200);
  const exported = (await exportRes.json()) as {
    version: number;
    exportedAt: string;
    scripts: Array<{ name: string; description: string | null; source: string }>;
  };
  assert.strictEqual(exported.version, 1);
  assert(exported.scripts.some((script) => script.name === "bootstrap"));

  const importRes = await app.request("/api/scripts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version: 1,
      exportedAt: "2026-04-04T00:00:00.000Z",
      scripts: [
        { name: "bootstrap", description: "duplicate", source: "send('duplicate')" },
        { name: "late hook", description: null, source: "send('late')" },
      ],
    }),
  });
  assert.strictEqual(importRes.status, 201);
  const imported = (await importRes.json()) as {
    imported: Array<{ id: number; name: string }>;
  };

  for (const script of imported.imported) {
    scriptIds.add(script.id);
  }

  assert(imported.imported.some((script) => script.name === "bootstrap (imported)"));
  assert(imported.imported.some((script) => script.name === "late hook"));

  const invalidRes = await app.request("/api/scripts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scripts: [{ name: "broken" }] }),
  });
  assert.strictEqual(invalidRes.status, 400);
});
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `bun test src/tests/app.test.ts`
Expected: FAIL with 404 for `/api/scripts`.

- [ ] **Step 3: Implement script CRUD and library import/export routes**

Create `/home/hacker/桌面/grapefruit/src/routes/scripts.ts`:

```ts
import { Hono } from "hono";
import { createScriptStore } from "../lib/store/scripts.ts";
import { createScriptPlanStore } from "../lib/store/script-plans.ts";

const scripts = createScriptStore();
const plans = createScriptPlanStore();

function mustName(v: unknown): string {
  if (typeof v !== "string" || v.trim() === "") throw new Error("name is required");
  return v.trim();
}

const routes = new Hono()
  .get("/scripts", (c) => c.json(scripts.list()))
  .post("/scripts", async (c) => {
    const body = await c.req.json();
    const created = scripts.create({
      name: mustName(body.name),
      description: typeof body.description === "string" ? body.description : "",
      source: typeof body.source === "string" ? body.source : "",
    });
    return c.json(created, 201);
  })
  .get("/scripts/:id", (c) => {
    const item = scripts.get(Number(c.req.param("id")));
    return item ? c.json(item) : c.json({ error: "script not found" }, 404);
  })
  .put("/scripts/:id", async (c) => {
    const body = await c.req.json();
    const item = scripts.update(Number(c.req.param("id")), {
      name: mustName(body.name),
      description: typeof body.description === "string" ? body.description : "",
      source: typeof body.source === "string" ? body.source : "",
    });
    return item ? c.json(item) : c.json({ error: "script not found" }, 404);
  })
  .delete("/scripts/:id", (c) => {
    scripts.remove(Number(c.req.param("id")));
    return c.body(null, 204);
  });

export default routes;
```

Add library helpers and routes in the same module:

```ts
interface ScriptLibraryPayload {
  version: number;
  exportedAt: string;
  scripts: Array<{
    name: string;
    description?: string | null;
    source: string;
  }>;
}

function parseLibraryPayload(body: unknown): ScriptLibraryPayload {
  if (!body || typeof body !== "object" || !Array.isArray((body as any).scripts)) {
    throw new Error("invalid script library payload");
  }

  const scripts = (body as any).scripts.map((entry: unknown, index: number) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`script ${index + 1} must be an object`);
    }

    const name = typeof (entry as any).name === "string" ? (entry as any).name.trim() : "";
    const source = typeof (entry as any).source === "string" ? (entry as any).source : "";
    if (!name || !source) {
      throw new Error(`script ${index + 1} requires name and source`);
    }

    return {
      name,
      description:
        typeof (entry as any).description === "string"
          ? (entry as any).description
          : null,
      source,
    };
  });

  return {
    version: typeof (body as any).version === "number" ? (body as any).version : 1,
    exportedAt:
      typeof (body as any).exportedAt === "string"
        ? (body as any).exportedAt
        : new Date().toISOString(),
    scripts,
  };
}

function resolveImportedName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }

  let suffix = 1;
  while (true) {
    const candidate = suffix === 1 ? `${name} (imported)` : `${name} (imported ${suffix})`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
    suffix += 1;
  }
}

.get("/scripts/export", (c) => {
  return c.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    scripts: scripts.list().map((script) => ({
      name: script.name,
      description: script.description,
      source: script.source,
    })),
  });
})
.post("/scripts/import", async (c) => {
  try {
    const payload = parseLibraryPayload(await c.req.json());
    const taken = new Set(scripts.list().map((script) => script.name));
    const imported = payload.scripts.map((entry) =>
      scripts.create({
        name: resolveImportedName(entry.name, taken),
        description: entry.description,
        source: entry.source,
      }),
    );
    return c.json({ imported }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
})
```

Mount it in `/home/hacker/桌面/grapefruit/src/app.ts`:

```ts
import scriptRoutes from "./routes/scripts.ts";
api.route("/", scriptRoutes);
```

- [ ] **Step 4: Add plan endpoints in the same module**

In `/home/hacker/桌面/grapefruit/src/routes/scripts.ts`, extend with:

```ts
.get("/script-plans", (c) => c.json(plans.list()))
.post("/script-plans", async (c) => {
  const body = await c.req.json();
  const created = plans.create({
    name: mustName(body.name),
    enabled: body.enabled !== false,
    autoApply: body.autoApply !== false,
    continueOnError: body.continueOnError !== false,
    priority: typeof body.priority === "number" ? body.priority : 0,
  });
  return c.json(created, 201);
})
```

Add matching `GET/PUT/DELETE` plus `PUT /targets` and `PUT /items` endpoints following the same whole-list replacement design from the spec.

- [ ] **Step 5: Run the API tests to verify they pass**

Run: `bun test src/tests/app.test.ts`
Expected: PASS for script CRUD, library import/export, and plan CRUD coverage.

- [ ] **Step 6: Commit**

```bash
git add src/routes/scripts.ts src/app.ts src/tests/app.test.ts
git commit -m "feat: add script management routes"
```

## Task 4: Add socket/session types for injection results

**Files:**
- Modify: `/home/hacker/桌面/grapefruit/src/types.ts`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/lib/rpc.ts`
- Modify: `/home/hacker/桌面/grapefruit/src/tests/ws.test.ts`

- [ ] **Step 1: Write the failing socket test**

Add to `/home/hacker/桌面/grapefruit/src/tests/ws.test.ts`:

```ts
it("should emit injection results after session setup", async () => {
  const { server, io } = createTestServer();
  await new Promise<void>((resolve) => server.listen(() => resolve()));
  const { port } = server.address() as AddressInfo;
  const socket = ioc(`http://localhost:${port}/session`, {
    query: { device: "fake", platform: "fruity", mode: "daemon", pid: "1" },
  });

  try {
    let seen = false;
    socket.on("injectionResult", () => {
      seen = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(seen).toBe(false);
  } finally {
    socket.disconnect();
    await closeTestServer(server, io);
  }
});
```

- [ ] **Step 2: Run the socket test to verify typing fails first**

Run: `bun test src/tests/ws.test.ts`
Expected: FAIL at compile time because `injectionResult` is not in the socket event types.

- [ ] **Step 3: Add shared result types**

Add to `/home/hacker/桌面/grapefruit/src/types.ts`:

```ts
export interface InjectionItemResult {
  planId: number;
  planName: string;
  scriptId: number;
  scriptName: string;
  injectWhen: "spawn" | "attach";
  status: "success" | "failed" | "skipped";
  error?: string;
  elapsedMs: number;
}

export interface InjectionResultEvent {
  summary: {
    matchedPlans: number;
    executed: number;
    failed: number;
    skipped: number;
  };
  items: InjectionItemResult[];
}
```

Extend `ServerToClientEvents` with:

```ts
injectionResult: (event: InjectionResultEvent) => void;
```

- [ ] **Step 4: Mirror the event in GUI socket types**

In `/home/hacker/桌面/grapefruit/gui/src/lib/rpc.ts`, add:

```ts
export interface InjectionItemResult {
  planId: number;
  planName: string;
  scriptId: number;
  scriptName: string;
  injectWhen: "spawn" | "attach";
  status: "success" | "failed" | "skipped";
  error?: string;
  elapsedMs: number;
}

export interface InjectionResultEvent {
  summary: {
    matchedPlans: number;
    executed: number;
    failed: number;
    skipped: number;
  };
  items: InjectionItemResult[];
}
```

And extend `SessionClientEvents` with:

```ts
injectionResult: (event: InjectionResultEvent) => void;
```

- [ ] **Step 5: Run the socket test again**

Run: `bun test src/tests/ws.test.ts`
Expected: type-level compile PASS; runtime assertion may still be pending until session logic is wired.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts gui/src/lib/rpc.ts src/tests/ws.test.ts
git commit -m "feat: add injection result socket types"
```

## Task 5: Wire plan matching and auto-injection into session setup

**Files:**
- Modify: `/home/hacker/桌面/grapefruit/src/session.ts`
- Modify: `/home/hacker/桌面/grapefruit/src/tests/ws.test.ts`
- Modify: `/home/hacker/桌面/grapefruit/src/tests/agent.test.ts`

- [ ] **Step 1: Write the failing session-flow test**

Add to `/home/hacker/桌面/grapefruit/src/tests/ws.test.ts`:

```ts
it("should emit injection results for matched attach scripts", async () => {
  const deviceId = process.env.UDID;
  if (!deviceId) return;

  const { server, io } = createTestServer();
  await new Promise<void>((resolve) => server.listen(() => resolve()));
  const { port } = server.address() as AddressInfo;
  const socket = ioc(`http://localhost:${port}/session`, {
    query: {
      device: deviceId,
      platform: "fruity",
      mode: "app",
      bundle: "com.apple.mobilesafari",
    },
  });

  try {
    let injection: any = null;
    socket.on("injectionResult", (event) => {
      injection = event;
    });
    await new Promise((resolve) => setTimeout(resolve, 8000));
    expect(injection).not.toBeNull();
  } finally {
    socket.disconnect();
    await closeTestServer(server, io);
  }
}, { timeout: 15000 });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/tests/ws.test.ts`
Expected: FAIL because session setup never emits `injectionResult`.

- [ ] **Step 3: Refactor session launch resolution**

In `/home/hacker/桌面/grapefruit/src/session.ts`, replace the scalar return with:

```ts
interface LaunchTarget {
  pid: number;
  launchMode: "attach" | "spawn";
}

async function resolveAppTarget(
  device: Device,
  bundleId: string,
  platform: Platform,
): Promise<LaunchTarget> {
  const match = await device.enumerateApplications({
    identifiers: [bundleId],
    scope: frida.Scope.Full,
  });
  const app = match.at(0);
  if (!app) throw new Error(`Application ${bundleId} not found on device`);

  const frontmost = await device.getFrontmostApplication();
  if (frontmost?.pid === app.pid) return { pid: app.pid, launchMode: "attach" };

  const devParams = await device.querySystemParameters();
  const opt: SpawnOptions = {};
  if (platform === "fruity" && devParams.access === "full" && devParams.os.id === "ios") {
    opt.env = { DISABLE_TWEAKS: "1" };
  }

  return {
    pid: await device.spawn(bundleId, opt),
    launchMode: "spawn",
  };
}
```

- [ ] **Step 4: Add injection execution helper**

Still in `/home/hacker/桌面/grapefruit/src/session.ts`, add:

```ts
import { createScriptPlanStore } from "./lib/store/script-plans.ts";
import type { InjectionItemResult, InjectionResultEvent } from "./types.ts";

async function applyScriptPlans(
  socket: SessionSocket,
  script: Awaited<ReturnType<typeof import("frida").Session.prototype.createScript>>,
  params: SessionParams,
  launchMode: "attach" | "spawn",
  stage: "spawn" | "attach",
): Promise<InjectionItemResult[]> {
  const plans = createScriptPlanStore().match(params);
  const out: InjectionItemResult[] = [];

  for (const plan of plans) {
    const items = plan.items.filter((item) => item.enabled && item.injectWhen === stage);
    for (const item of items) {
      const startedAt = Date.now();
      if (stage === "spawn" && launchMode !== "spawn") {
        out.push({
          planId: plan.id,
          planName: plan.name,
          scriptId: item.scriptId,
          scriptName: item.script.name,
          injectWhen: stage,
          status: "skipped",
          elapsedMs: Date.now() - startedAt,
        });
        continue;
      }
      try {
        await script.exports.invoke("script", "evaluate", [item.script.source, `plan:${plan.id}:script:${item.scriptId}`]);
        out.push({
          planId: plan.id,
          planName: plan.name,
          scriptId: item.scriptId,
          scriptName: item.script.name,
          injectWhen: stage,
          status: "success",
          elapsedMs: Date.now() - startedAt,
        });
      } catch (err) {
        out.push({
          planId: plan.id,
          planName: plan.name,
          scriptId: item.scriptId,
          scriptName: item.script.name,
          injectWhen: stage,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          elapsedMs: Date.now() - startedAt,
        });
        if (!plan.continueOnError) break;
      }
    }
  }

  if (out.length > 0) {
    const event: InjectionResultEvent = {
      summary: {
        matchedPlans: new Set(out.map((item) => item.planId)).size,
        executed: out.filter((item) => item.status === "success").length,
        failed: out.filter((item) => item.status === "failed").length,
        skipped: out.filter((item) => item.status === "skipped").length,
      },
      items: out,
    };
    socket.emit("injectionResult", event);
  }

  return out;
}
```

- [ ] **Step 5: Insert the helper into the connect flow**

Update `/home/hacker/桌面/grapefruit/src/session.ts` so the connection order becomes:

```ts
const target = mode === "app"
  ? await resolveAppTarget(device, bundle, platform)
  : { pid: targetPid, launchMode: "attach" as const };

const session = await device.attach(target.pid);
const script = await session.createScript(await agent(platform));
setupRelay(socket, script, logHandles, stores);
setupSocketHandlers(socket, script, session, logHandles);
await script.load();

await applyScriptPlans(socket, script, params, target.launchMode, "spawn");

if (mode === "app" && target.launchMode === "spawn") {
  await device.resume(target.pid).catch(() => {});
}

await applyScriptPlans(socket, script, params, target.launchMode, "attach");

socket.emit("ready", session.pid);
```

- [ ] **Step 6: Run the websocket tests**

Run: `bun test src/tests/ws.test.ts`
Expected: PASS for the new injection result event flow in testable cases.

- [ ] **Step 7: Run the agent regression test**

Run: `bun test src/tests/agent.test.ts`
Expected: PASS for `load agent`; spawn test may skip without `UDID`.

- [ ] **Step 8: Commit**

```bash
git add src/session.ts src/tests/ws.test.ts src/tests/agent.test.ts
git commit -m "feat: auto-apply script plans during session setup"
```

## Task 6: Add GUI fetch helpers and typed models

**Files:**
- Create: `/home/hacker/桌面/grapefruit/gui/src/lib/script-plan-types.ts`
- Create: `/home/hacker/桌面/grapefruit/gui/src/lib/scripts-api.ts`
- Create: `/home/hacker/桌面/grapefruit/gui/src/lib/scripts-ui.ts`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/lib/rpc.ts`
- Modify: `/home/hacker/桌面/grapefruit/src/tests/script-management-ui.test.ts`

- [ ] **Step 1: Write the failing type-driven import usage**

Add to `/home/hacker/桌面/grapefruit/gui/src/lib/scripts-api.ts`:

```ts
import type { ScriptRecord, ScriptPlanRecord } from "./script-plan-types";

export async function listScripts(): Promise<ScriptRecord[]> {
  throw new Error("not implemented");
}
```

This should fail until `script-plan-types.ts` exists.

- [ ] **Step 2: Run GUI typecheck to verify it fails**

Run: `cd /home/hacker/桌面/grapefruit/gui && bunx tsgo --noEmit`
Expected: FAIL due to missing type module.

- [ ] **Step 3: Add client-side types**

Create `/home/hacker/桌面/grapefruit/gui/src/lib/script-plan-types.ts`:

```ts
export interface ScriptRecord {
  id: number;
  name: string;
  description: string | null;
  source: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ScriptLibraryExportPayload {
  version: number;
  exportedAt: string;
  scripts: Array<Pick<ScriptRecord, "name" | "description" | "source">>;
}

export interface ScriptLibraryImportPayload extends ScriptLibraryExportPayload {}

export interface ScriptLibraryImportResult {
  imported: ScriptRecord[];
}

export interface ScriptPlanTargetRecord {
  id?: number;
  platform: "fruity" | "droid";
  mode: "app" | "daemon";
  bundle?: string | null;
  processName?: string | null;
  pid?: number | null;
}

export interface ScriptPlanItemRecord {
  id?: number;
  scriptId: number;
  position: number;
  injectWhen: "spawn" | "attach";
  enabled: boolean;
  script?: ScriptRecord;
}

export interface ScriptPlanRecord {
  id: number;
  name: string;
  enabled: boolean;
  autoApply: boolean;
  continueOnError: boolean;
  priority: number;
  targets: ScriptPlanTargetRecord[];
  items: ScriptPlanItemRecord[];
}
```

- [ ] **Step 4: Add fetch helpers**

Create `/home/hacker/桌面/grapefruit/gui/src/lib/scripts-api.ts`:

```ts
import type { ScriptPlanRecord, ScriptPlanTargetRecord, ScriptPlanItemRecord, ScriptRecord } from "./script-plan-types";
import type {
  ScriptLibraryExportPayload,
  ScriptLibraryImportPayload,
  ScriptLibraryImportResult,
} from "./script-plan-types";

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const scriptsApi = {
  list: () => json<ScriptRecord[]>("/api/scripts"),
  get: (id: number) => json<ScriptRecord>(`/api/scripts/${id}`),
  create: (body: Pick<ScriptRecord, "name" | "description" | "source">) =>
    json<ScriptRecord>("/api/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  update: (id: number, body: Pick<ScriptRecord, "name" | "description" | "source">) =>
    json<ScriptRecord>(`/api/scripts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  remove: (id: number) =>
    json<void>(`/api/scripts/${id}`, { method: "DELETE" }),
  exportLibrary: () =>
    json<ScriptLibraryExportPayload>("/api/scripts/export"),
  importLibrary: (body: ScriptLibraryImportPayload) =>
    json<ScriptLibraryImportResult>("/api/scripts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

export const scriptPlansApi = {
  list: () => json<ScriptPlanRecord[]>("/api/script-plans"),
  get: (id: number) => json<ScriptPlanRecord>(`/api/script-plans/${id}`),
  create: (body: Pick<ScriptPlanRecord, "name" | "enabled" | "autoApply" | "continueOnError" | "priority">) =>
    json<ScriptPlanRecord>("/api/script-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  update: (id: number, body: Pick<ScriptPlanRecord, "name" | "enabled" | "autoApply" | "continueOnError" | "priority">) =>
    json<ScriptPlanRecord>(`/api/script-plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  replaceTargets: (id: number, body: ScriptPlanTargetRecord[]) =>
    json<void>(`/api/script-plans/${id}/targets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  replaceItems: (id: number, body: ScriptPlanItemRecord[]) =>
    json<void>(`/api/script-plans/${id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
```

- [ ] **Step 5: Add UI helper utilities and failing helper tests**

Create `/home/hacker/桌面/grapefruit/gui/src/lib/scripts-ui.ts`:

```ts
import type {
  ScriptLibraryExportPayload,
  ScriptRecord,
  ScriptPlanTargetRecord,
} from "./script-plan-types";

export function scriptFileName(name: string): string {
  const base = name.trim() || "script";
  return `${base.replace(/[\\\\/:*?\"<>|]/g, "-")}.js`;
}

export function scriptLibraryFileName(): string {
  return `grapefruit-scripts-${new Date().toISOString().slice(0, 10)}.json`;
}

export function buildScriptLibraryExport(
  scripts: ScriptRecord[],
): ScriptLibraryExportPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    scripts: scripts.map((script) => ({
      name: script.name,
      description: script.description,
      source: script.source,
    })),
  };
}

export function importedScriptDraft(fileName: string, source: string) {
  const name = fileName.replace(/\\.js$/i, "").trim() || "Imported Script";
  return {
    name,
    description: "",
    source,
  };
}

export function scriptTargetPlatformLabel(
  platform: ScriptPlanTargetRecord["platform"],
): string {
  return platform === "fruity" ? "iOS" : "Android";
}
```

Extend `/home/hacker/桌面/grapefruit/src/tests/script-management-ui.test.ts`:

```ts
import {
  buildScriptLibraryExport,
  importedScriptDraft,
  scriptFileName,
  scriptTargetPlatformLabel,
} from "../../gui/src/lib/scripts-ui.ts";

it("builds library export payloads and import drafts", () => {
  const payload = buildScriptLibraryExport([
    { id: 1, name: "bootstrap", description: "first", source: "send('a')" },
  ]);

  expect(payload.version).toBe(1);
  expect(payload.scripts[0]?.name).toBe("bootstrap");
  expect(scriptFileName("hook/bootstrap")).toBe("hook-bootstrap.js");
  expect(importedScriptDraft("trace.js", "send('x')")).toEqual({
    name: "trace",
    description: "",
    source: "send('x')",
  });
});

it("maps plan target platform values to UI labels", () => {
  expect(scriptTargetPlatformLabel("fruity")).toBe("iOS");
  expect(scriptTargetPlatformLabel("droid")).toBe("Android");
});
```

- [ ] **Step 6: Run GUI typecheck and helper tests**

Run: `cd /home/hacker/桌面/grapefruit/gui && bunx tsgo --noEmit`
Expected: PASS

Run: `cd /home/hacker/桌面/grapefruit && bun test src/tests/script-management-ui.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add gui/src/lib/script-plan-types.ts gui/src/lib/scripts-api.ts gui/src/lib/scripts-ui.ts gui/src/lib/rpc.ts src/tests/script-management-ui.test.ts
git commit -m "feat: add GUI script management client API"
```

## Task 7: Build the script library page and editor

**Files:**
- Create: `/home/hacker/桌面/grapefruit/gui/src/components/pages/ScriptsPage.tsx`
- Create: `/home/hacker/桌面/grapefruit/gui/src/components/shared/ScriptEditorPane.tsx`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/lib/scripts-ui.ts`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/App.tsx`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/locales/en/translation.json`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/locales/cn/translation.json`

- [ ] **Step 1: Add the failing route wiring**

In `/home/hacker/桌面/grapefruit/gui/src/App.tsx`, add:

```tsx
import { ScriptsPage } from "./components/pages/ScriptsPage";
...
<Route path="/scripts" element={<ScriptsPage />} />
```

- [ ] **Step 2: Run GUI typecheck to verify it fails**

Run: `cd /home/hacker/桌面/grapefruit/gui && bunx tsgo --noEmit`
Expected: FAIL because `ScriptsPage` does not exist.

- [ ] **Step 3: Create the reusable editor pane**

Create `/home/hacker/桌面/grapefruit/gui/src/components/shared/ScriptEditorPane.tsx`:

```tsx
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import type { ScriptRecord } from "@/lib/script-plan-types";

export function ScriptEditorPane({
  script,
  draft,
  onChange,
  onSave,
}: {
  script: ScriptRecord | null;
  draft: { name: string; description: string; source: string };
  onChange: (next: { name: string; description: string; source: string }) => void;
  onSave: () => void;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="flex-1 rounded-md border px-2 py-1 text-sm"
          placeholder="Script name"
        />
        <Button size="sm" onClick={onSave}>Save</Button>
      </div>
      <textarea
        value={draft.description}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        className="mx-3 mt-3 rounded-md border px-2 py-1 text-sm"
        placeholder="Description"
      />
      <div className="flex-1 min-h-0 mt-3">
        <Editor
          height="100%"
          language="javascript"
          value={draft.source}
          onChange={(value) => onChange({ ...draft, source: value ?? "" })}
          options={{ minimap: { enabled: false }, automaticLayout: true }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the script library page**

Create `/home/hacker/桌面/grapefruit/gui/src/components/pages/ScriptsPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { scriptsApi } from "@/lib/scripts-api";
import type { ScriptRecord } from "@/lib/script-plan-types";
import { ScriptEditorPane } from "../components/ScriptEditorPane";

export function ScriptsPage() {
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => scriptsApi.list(),
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = data.find((item) => item.id === selectedId) ?? null;
  const [draft, setDraft] = useState({ name: "", description: "", source: "" });

  useEffect(() => {
    if (selected) {
      setDraft({
        name: selected.name,
        description: selected.description ?? "",
        source: selected.source,
      });
    }
  }, [selected]);

  const createMutation = useMutation({
    mutationFn: () => scriptsApi.create({ name: "Untitled Script", description: "", source: "" }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["scripts"] });
      setSelectedId(created.id);
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (selectedId == null) {
        return scriptsApi.create(draft);
      }
      return scriptsApi.update(selectedId, draft);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["scripts"] });
      setSelectedId(saved.id);
    },
  });

  return (
    <div className="h-dvh grid grid-cols-[260px_1fr]">
      <aside className="border-r p-3 space-y-2">
        <Button size="sm" onClick={() => createMutation.mutate()}>New Script</Button>
        <div className="space-y-1">
          {data.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
            >
              {item.name}
            </button>
          ))}
        </div>
      </aside>
      <ScriptEditorPane
        script={selected}
        draft={draft}
        onChange={setDraft}
        onSave={() => saveMutation.mutate()}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add single-script and library import/export handlers**

Extend `/home/hacker/桌面/grapefruit/gui/src/components/pages/ScriptsPage.tsx` with hidden file inputs, toolbar actions, and download helpers:

```tsx
import { useRef } from "react";
import { Download, FileUp, FolderUp, FolderDown } from "lucide-react";
import {
  buildScriptLibraryExport,
  importedScriptDraft,
  scriptFileName,
  scriptLibraryFileName,
} from "@/lib/scripts-ui";

const singleImportRef = useRef<HTMLInputElement | null>(null);
const libraryImportRef = useRef<HTMLInputElement | null>(null);

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function handleScriptImport(file: File) {
  const source = await file.text();
  setSelectedId(null);
  setDraft(importedScriptDraft(file.name, source));
}

async function handleLibraryImport(file: File) {
  const payload = JSON.parse(await file.text());
  await scriptsApi.importLibrary(payload);
  await queryClient.invalidateQueries({ queryKey: ["scripts"] });
}

async function handleLibraryExport() {
  const payload = await scriptsApi.exportLibrary();
  downloadText(
    scriptLibraryFileName(),
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8",
  );
}

function handleScriptExport() {
  downloadText(
    scriptFileName(draft.name),
    draft.source,
    "text/javascript;charset=utf-8",
  );
}
```

Render four actions in the page chrome:

```tsx
<Button size="sm" variant="outline" onClick={() => singleImportRef.current?.click()}>
  <FileUp className="h-4 w-4" />
  Import Script
</Button>
<Button size="sm" variant="outline" onClick={handleScriptExport} disabled={!draft.source.trim()}>
  <Download className="h-4 w-4" />
  Export Script
</Button>
<Button size="sm" variant="outline" onClick={() => libraryImportRef.current?.click()}>
  <FolderUp className="h-4 w-4" />
  Import Library
</Button>
<Button size="sm" variant="outline" onClick={() => void handleLibraryExport()}>
  <FolderDown className="h-4 w-4" />
  Export Library
</Button>
<input
  ref={singleImportRef}
  type="file"
  accept=".js,text/javascript"
  className="hidden"
  onChange={(event) => {
    const file = event.target.files?.[0];
    if (file) void handleScriptImport(file);
    event.target.value = "";
  }}
/>
<input
  ref={libraryImportRef}
  type="file"
  accept=".json,application/json"
  className="hidden"
  onChange={(event) => {
    const file = event.target.files?.[0];
    if (file) void handleLibraryImport(file);
    event.target.value = "";
  }}
/>
```

- [ ] **Step 6: Add i18n strings and rerun typecheck**

Add keys like:

```json
"scripts": "Scripts",
"script_plans": "Script Plans",
"new_script": "New Script",
"save_as_script": "Save as Script",
"save_to_script": "Save to Existing Script",
"import_script": "Import Script",
"export_script": "Export Script",
"import_script_library": "Import Library",
"export_script_library": "Export Library"
```

Run: `cd /home/hacker/桌面/grapefruit/gui && bunx tsgo --noEmit`
Expected: PASS

- [ ] **Step 7: Run GUI build**

Run: `cd /home/hacker/桌面/grapefruit/gui && bun run build`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add gui/src/App.tsx gui/src/components/pages/ScriptsPage.tsx gui/src/components/shared/ScriptEditorPane.tsx gui/src/lib/scripts-ui.ts gui/src/locales/en/translation.json gui/src/locales/cn/translation.json
git commit -m "feat: add script library UI"
```

## Task 8: Build the injection plan manager page

**Files:**
- Create: `/home/hacker/桌面/grapefruit/gui/src/components/pages/ScriptPlansPage.tsx`
- Create: `/home/hacker/桌面/grapefruit/gui/src/components/shared/ScriptPlanEditorPane.tsx`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/lib/scripts-ui.ts`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/App.tsx`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/locales/en/translation.json`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/locales/cn/translation.json`

- [ ] **Step 1: Add the failing route wiring**

In `/home/hacker/桌面/grapefruit/gui/src/App.tsx`, add:

```tsx
import { ScriptPlansPage } from "./components/pages/ScriptPlansPage";
...
<Route path="/script-plans" element={<ScriptPlansPage />} />
```

- [ ] **Step 2: Run GUI typecheck to verify it fails**

Run: `cd /home/hacker/桌面/grapefruit/gui && bunx tsgo --noEmit`
Expected: FAIL because `ScriptPlansPage` does not exist.

- [ ] **Step 3: Create the plan editor pane**

Create `/home/hacker/桌面/grapefruit/gui/src/components/shared/ScriptPlanEditorPane.tsx` with controlled fields for:

```tsx
type Draft = {
  name: string;
  enabled: boolean;
  autoApply: boolean;
  continueOnError: boolean;
  priority: number;
  targets: ScriptPlanTargetRecord[];
  items: ScriptPlanItemRecord[];
};
```

The pane should render:

- name input
- enabled / autoApply / continueOnError toggles
- priority input
- repeatable target rows
- repeatable item rows with script select, timing select, enabled checkbox, and reorder buttons
- target platform selects whose option labels come from `scriptTargetPlatformLabel(...)`, so users see `iOS` and `Android` while the saved values remain `fruity` and `droid`

- [ ] **Step 4: Create the page shell**

Create `/home/hacker/桌面/grapefruit/gui/src/components/pages/ScriptPlansPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { scriptPlansApi, scriptsApi } from "@/lib/scripts-api";
import { ScriptPlanEditorPane } from "../components/ScriptPlanEditorPane";

export function ScriptPlansPage() {
  const queryClient = useQueryClient();
  const { data: plans = [] } = useQuery({
    queryKey: ["script-plans"],
    queryFn: () => scriptPlansApi.list(),
  });
  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => scriptsApi.list(),
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = plans.find((item) => item.id === selectedId) ?? null;
  const [draft, setDraft] = useState<any>(null);

  useEffect(() => {
    if (selected) setDraft(selected);
  }, [selected]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const base = selectedId == null
        ? await scriptPlansApi.create(draft)
        : await scriptPlansApi.update(selectedId, draft);
      await scriptPlansApi.replaceTargets(base.id, draft.targets);
      await scriptPlansApi.replaceItems(base.id, draft.items);
      return base;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["script-plans"] });
      setSelectedId(saved.id);
    },
  });

  return (
    <div className="h-dvh grid grid-cols-[280px_1fr]">
      <aside className="border-r p-3 space-y-2">
        <Button
          size="sm"
          onClick={() => setDraft({
            name: "Untitled Plan",
            enabled: true,
            autoApply: true,
            continueOnError: true,
            priority: 0,
            targets: [],
            items: [],
          })}
        >
          New Plan
        </Button>
        {plans.map((plan) => (
          <button
            key={plan.id}
            onClick={() => setSelectedId(plan.id)}
            className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
          >
            {plan.name}
          </button>
        ))}
      </aside>
      {draft ? (
        <ScriptPlanEditorPane
          draft={draft}
          scripts={scripts}
          onChange={setDraft}
          onSave={() => saveMutation.mutate()}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run GUI typecheck, helper tests, and build**

Run: `cd /home/hacker/桌面/grapefruit/gui && bunx tsgo --noEmit`
Expected: PASS

Run: `cd /home/hacker/桌面/grapefruit && bun test src/tests/script-management-ui.test.ts`
Expected: PASS, including `iOS` / `Android` label mapping coverage

Run: `cd /home/hacker/桌面/grapefruit/gui && bun run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add gui/src/App.tsx gui/src/components/pages/ScriptPlansPage.tsx gui/src/components/shared/ScriptPlanEditorPane.tsx gui/src/locales/en/translation.json gui/src/locales/cn/translation.json
git commit -m "feat: add injection plan manager UI"
```

## Task 9: Integrate scratch pad save-to-library and injection status display

**Files:**
- Modify: `/home/hacker/桌面/grapefruit/gui/src/components/tabs/CodeScratchPadTab.tsx`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/context/ReplContext.tsx`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/context/SessionContext.ts`
- Modify: `/home/hacker/桌面/grapefruit/gui/src/components/layout/StatusBar.tsx`

- [ ] **Step 1: Write the failing compile-time integration**

In `/home/hacker/桌面/grapefruit/gui/src/components/tabs/CodeScratchPadTab.tsx`, import:

```tsx
import { scriptsApi } from "@/lib/scripts-api";
```

Add a button:

```tsx
<Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5">
  Save as Script
</Button>
```

- [ ] **Step 2: Run GUI typecheck to verify the current component state no longer matches**

Run: `cd /home/hacker/桌面/grapefruit/gui && bunx tsgo --noEmit`
Expected: FAIL until the save handler and any new UI state are wired.

- [ ] **Step 3: Add scratch pad save actions**

Update `/home/hacker/桌面/grapefruit/gui/src/components/tabs/CodeScratchPadTab.tsx`:

```tsx
const saveAsScriptMutation = useMutation({
  mutationFn: async () => scriptsApi.create({
    name: `Scratch ${new Date().toISOString()}`,
    description: "Saved from scratch pad",
    source: content,
  }),
});
...
<Button
  variant="ghost"
  size="sm"
  className="h-7 px-2 gap-1.5"
  onClick={() => saveAsScriptMutation.mutate()}
  disabled={!content.trim()}
>
  <Save className="h-3.5 w-3.5" />
  {t("save_as_script")}
</Button>
```

Then add a second action that lists existing scripts and overwrites the selected script with the current draft using `scriptsApi.update(...)`.

- [ ] **Step 4: Surface injection results in session UI**

Extend `/home/hacker/桌面/grapefruit/gui/src/context/SessionContext.ts` with:

```ts
import type { InjectionResultEvent } from "@/lib/rpc";
...
  injectionResult?: InjectionResultEvent | null;
```

Update the session provider to store the latest `injectionResult` socket event and render a summary in `/home/hacker/桌面/grapefruit/gui/src/components/layout/StatusBar.tsx`, for example:

```tsx
{injectionResult && (
  <span className="text-xs text-muted-foreground">
    Injected {injectionResult.summary.executed} script(s), failed {injectionResult.summary.failed}
  </span>
)}
```

- [ ] **Step 5: Run GUI typecheck and build**

Run: `cd /home/hacker/桌面/grapefruit/gui && bunx tsgo --noEmit`
Expected: PASS

Run: `cd /home/hacker/桌面/grapefruit/gui && bun run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add gui/src/components/tabs/CodeScratchPadTab.tsx gui/src/context/ReplContext.tsx gui/src/context/SessionContext.ts gui/src/components/layout/StatusBar.tsx
git commit -m "feat: connect scratch pad and injection status to script management"
```

## Task 10: Final regression pass and documentation touch-up

**Files:**
- Modify: `/home/hacker/桌面/grapefruit/docs/superpowers/specs/2026-04-04-script-management-design.md`
- Modify: `/home/hacker/桌面/grapefruit/docs/dev.md`

- [ ] **Step 1: Add a short operator note to developer docs**

Update `/home/hacker/桌面/grapefruit/docs/dev.md` with a short section:

```md
## Script Management

Script library and injection plans are stored in the main SQLite database under `.igf/data/data.db`.
Use the Scripts and Script Plans views in the GUI to manage reusable code and automatic injection behavior.
```

- [ ] **Step 2: Run backend tests**

Run: `cd /home/hacker/桌面/grapefruit && bun test src/tests/script-plans.test.ts src/tests/app.test.ts src/tests/ws.test.ts`
Expected: PASS, with device-dependent tests allowed to skip when `UDID` is absent.

- [ ] **Step 3: Run backend typecheck**

Run: `cd /home/hacker/桌面/grapefruit && bunx tsgo --noEmit`
Expected: PASS

- [ ] **Step 4: Run GUI typecheck and build**

Run: `cd /home/hacker/桌面/grapefruit/gui && bunx tsgo --noEmit`
Expected: PASS

Run: `cd /home/hacker/桌面/grapefruit/gui && bun run build`
Expected: PASS

- [ ] **Step 5: Manual verification checklist**

Verify all of the following:

- Create a script in `/scripts`, save it, rename it, reload the page, and confirm it persists.
- Import a single `.js` file into `/scripts`, confirm it populates the draft without auto-saving, then save it manually.
- Export the selected script from `/scripts` and confirm the downloaded filename ends in `.js`.
- Export the full library from `/scripts`, inspect the JSON for `version`, `exportedAt`, and `scripts`, then import it back.
- Import a library JSON containing a duplicate name and confirm the existing script is preserved while the imported one is renamed with `(imported)`.
- Create a plan in `/script-plans`, bind it to a known app target, add two scripts, and set one to `spawn` and one to `attach`.
- In `/script-plans`, confirm the platform selector shows `iOS` and `Android` while saved matching behavior still works.
- Start a fresh spawned app session and confirm both scripts run in the expected order.
- Attach to an already running daemon session and confirm only `attach` scripts run.
- Save a scratch pad draft into the script library and confirm it appears in `/scripts`.
- Observe the injection result summary in the session UI after a matching session connects.

- [ ] **Step 6: Commit**

```bash
git add docs/dev.md docs/superpowers/specs/2026-04-04-script-management-design.md
git commit -m "docs: document script management workflow"
```

## Spec Coverage Check

- Server-persisted scripts: covered by Tasks 1-3 and Task 7.
- Frontend create/edit/save/rename/delete: covered by Task 7 and Task 9.
- Single-script and library import/export: covered by Tasks 3, 6, 7, and Task 10.
- Multi-script injection to a target process: covered by Tasks 2, 5, and 8.
- `attach` and `spawn` timing: covered by Task 5 and verified in Task 10.
- `iOS` / `Android` platform labels with stable stored values: covered by Tasks 6, 8, and Task 10.
- Scratch pad preservation with save-to-library path: covered by Task 9.
- Injection result observability: covered by Tasks 4, 5, and 9.

## Self-Review Notes

- No placeholders remain in task steps; every file path is concrete.
- All new entities use the same names as the approved spec: `scripts`, `script_plans`, `script_plan_targets`, `script_plan_items`.
- The execution flow preserves the current base agent load path and layers user script injection after it.
