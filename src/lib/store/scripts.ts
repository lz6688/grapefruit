import { desc, eq } from "drizzle-orm";

import { scriptPlanItems, scripts } from "../schema.ts";
import { db } from "./db.ts";

export type ScriptRecord = typeof scripts.$inferSelect;

export interface ScriptInput {
  name: string;
  description?: string | null;
  source?: string;
}

function cleanName(name: string): string {
  const value = name.trim();
  if (!value) throw new Error("script name is required");
  return value;
}

function cleanDescription(description?: string | null): string | null {
  const value = description?.trim();
  return value ? value : null;
}

export function createScriptStore() {
  return {
    list(): ScriptRecord[] {
      return db
        .select()
        .from(scripts)
        .orderBy(desc(scripts.updatedAt), desc(scripts.id))
        .all();
    },

    get(id: number): ScriptRecord | null {
      return (
        db.select().from(scripts).where(eq(scripts.id, id)).get() ?? null
      );
    },

    create(input: ScriptInput): ScriptRecord {
      const now = new Date().toISOString();
      const row = db
        .insert(scripts)
        .values({
          name: cleanName(input.name),
          description: cleanDescription(input.description),
          source: input.source ?? "",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      if (!row) throw new Error("failed to create script");
      return row;
    },

    update(id: number, input: Partial<ScriptInput>): ScriptRecord | null {
      const current = this.get(id);
      if (!current) return null;

      db.update(scripts)
        .set({
          name:
            input.name !== undefined ? cleanName(input.name) : current.name,
          description:
            input.description !== undefined
              ? cleanDescription(input.description)
              : current.description,
          source: input.source !== undefined ? input.source : current.source,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(scripts.id, id))
        .run();

      return this.get(id);
    },

    rm(id: number): boolean {
      const exists = this.get(id);
      if (!exists) return false;

      db.delete(scriptPlanItems).where(eq(scriptPlanItems.scriptId, id)).run();
      db.delete(scripts).where(eq(scripts.id, id)).run();
      return true;
    },
  };
}
