import type { ScriptPlanItem, StoredScript } from "./script-plan-types";

export function scriptItemLabel(
  item: Pick<ScriptPlanItem, "scriptId" | "scriptName">,
  scripts: Pick<StoredScript, "id" | "name">[],
): string {
  const live = scripts.find((script) => script.id === item.scriptId);
  if (live?.name) return live.name;
  if (item.scriptName) return item.scriptName;
  return `Script #${item.scriptId}`;
}
