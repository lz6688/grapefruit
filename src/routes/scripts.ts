import { Hono } from "hono";

import { createScriptStore } from "../lib/store/scripts.ts";
import {
  createScriptPlanStore,
  type ScriptPlanItemInput,
  type ScriptPlanTargetInput,
} from "../lib/store/script-plans.ts";

const scripts = createScriptStore();
const plans = createScriptPlanStore();

function parseId(value: string): number | null {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

async function readBody<T>(req: Request): Promise<T | null> {
  return req.json().catch(() => null);
}

interface ScriptLibraryEntry {
  name: string;
  description: string | null;
  source: string;
}

interface ScriptLibraryPayload {
  version: number;
  exportedAt: string;
  scripts: ScriptLibraryEntry[];
}

function parseLibraryPayload(body: unknown): ScriptLibraryPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("invalid script library payload");
  }

  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.scripts)) {
    throw new Error("invalid script library payload");
  }

  const parsedScripts = record.scripts.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`script ${index + 1} must be an object`);
    }

    const item = entry as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const source = typeof item.source === "string" ? item.source : "";

    if (!name || !source) {
      throw new Error(`script ${index + 1} requires name and source`);
    }

    return {
      name,
      description:
        typeof item.description === "string" ? item.description : null,
      source,
    };
  });

  return {
    version: typeof record.version === "number" ? record.version : 1,
    exportedAt:
      typeof record.exportedAt === "string"
        ? record.exportedAt
        : new Date().toISOString(),
    scripts: parsedScripts,
  };
}

function resolveImportedName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }

  let suffix = 1;
  while (true) {
    const candidate =
      suffix === 1 ? `${name} (imported)` : `${name} (imported ${suffix})`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
    suffix += 1;
  }
}

const routes = new Hono()
  .get("/scripts", (c) => c.json(scripts.list()))
  .post("/scripts", async (c) => {
    const body = await readBody<{
      name?: string;
      description?: string | null;
      source?: string;
    }>(c.req.raw);

    if (!body || typeof body.name !== "string") {
      return c.json({ error: "invalid script payload" }, 400);
    }

    const script = scripts.create({
      name: body.name,
      description: body.description,
      source: typeof body.source === "string" ? body.source : "",
    });

    return c.json(script, 201);
  })
  .get("/scripts/export", (c) =>
    c.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      scripts: scripts.list().map((script) => ({
        name: script.name,
        description: script.description,
        source: script.source,
      })),
    }),
  )
  .post("/scripts/import", async (c) => {
    const body = await readBody<unknown>(c.req.raw);

    try {
      const payload = parseLibraryPayload(body);
      const takenNames = new Set(scripts.list().map((script) => script.name));
      const imported = payload.scripts.map((entry) =>
        scripts.create({
          name: resolveImportedName(entry.name, takenNames),
          description: entry.description,
          source: entry.source,
        }),
      );
      return c.json({ imported }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  })
  .get("/scripts/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "invalid script id" }, 400);

    const script = scripts.get(id);
    if (!script) return c.json({ error: "script not found" }, 404);
    return c.json(script);
  })
  .put("/scripts/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "invalid script id" }, 400);

    const body = await readBody<{
      name?: string;
      description?: string | null;
      source?: string;
    }>(c.req.raw);
    if (!body) return c.json({ error: "invalid script payload" }, 400);

    const script = scripts.update(id, {
      name: body.name,
      description: body.description,
      source: body.source,
    });
    if (!script) return c.json({ error: "script not found" }, 404);
    return c.json(script);
  })
  .delete("/scripts/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "invalid script id" }, 400);
    if (!scripts.rm(id)) return c.json({ error: "script not found" }, 404);
    return c.body(null, 204);
  })
  .get("/script-plans", (c) => c.json(plans.list()))
  .post("/script-plans", async (c) => {
    const body = await readBody<{
      name?: string;
      enabled?: boolean;
      autoApply?: boolean;
      continueOnError?: boolean;
      priority?: number;
    }>(c.req.raw);
    if (!body) return c.json({ error: "invalid plan payload" }, 400);

    const plan = plans.create({
      name: body.name ?? "New Plan",
      enabled: body.enabled,
      autoApply: body.autoApply,
      continueOnError: body.continueOnError,
      priority: body.priority,
    });

    return c.json(plan, 201);
  })
  .get("/script-plans/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "invalid plan id" }, 400);

    const plan = plans.get(id);
    if (!plan) return c.json({ error: "plan not found" }, 404);
    return c.json(plan);
  })
  .put("/script-plans/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "invalid plan id" }, 400);

    const body = await readBody<{
      name?: string;
      enabled?: boolean;
      autoApply?: boolean;
      continueOnError?: boolean;
      priority?: number;
    }>(c.req.raw);
    if (!body) return c.json({ error: "invalid plan payload" }, 400);

    const plan = plans.update(id, body);
    if (!plan) return c.json({ error: "plan not found" }, 404);
    return c.json(plan);
  })
  .delete("/script-plans/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "invalid plan id" }, 400);
    if (!plans.rm(id)) return c.json({ error: "plan not found" }, 404);
    return c.body(null, 204);
  })
  .put("/script-plans/:id/targets", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "invalid plan id" }, 400);

    const body = await readBody<{ targets?: ScriptPlanTargetInput[] }>(c.req.raw);
    if (!body || !Array.isArray(body.targets)) {
      return c.json({ error: "invalid plan targets payload" }, 400);
    }

    try {
      const targets = plans.replaceTargets(id, body.targets);
      return c.json(targets);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "plan not found" ? 404 : 400;
      return c.json({ error: message }, status);
    }
  })
  .put("/script-plans/:id/items", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "invalid plan id" }, 400);

    const body = await readBody<{ items?: ScriptPlanItemInput[] }>(c.req.raw);
    if (!body || !Array.isArray(body.items)) {
      return c.json({ error: "invalid plan items payload" }, 400);
    }

    try {
      const items = plans.replaceItems(id, body.items);
      return c.json(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "plan not found" ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

export default routes;
