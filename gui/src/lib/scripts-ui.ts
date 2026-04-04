import type {
  ScriptPlanItem,
  ScriptTargetPlatform,
  StoredScript,
} from "./script-plan-types";

export function scriptItemLabel(
  item: Pick<ScriptPlanItem, "scriptId" | "scriptName">,
  scripts: Pick<StoredScript, "id" | "name">[],
): string {
  const live = scripts.find((script) => script.id === item.scriptId);
  if (live?.name) return live.name;
  if (item.scriptName) return item.scriptName;
  return `Script #${item.scriptId}`;
}

export function scriptFileName(name: string): string {
  const base = name.trim() || "script";
  return `${base.replace(/[\\/:*?"<>|]/g, "-")}.js`;
}

export function scriptLibraryFileName(exportedAt = new Date().toISOString()): string {
  const stamp = exportedAt.slice(0, 10) || "library";
  return `grapefruit-scripts-${stamp}.json`;
}

export function importedScriptDraft(fileName: string, source: string) {
  const name = fileName.replace(/\.[^.]+$/u, "").trim() || "Imported Script";
  return {
    name,
    description: "",
    source,
  };
}

export function scriptTargetPlatformLabel(
  platform: ScriptTargetPlatform,
): string {
  return platform === "fruity" ? "iOS" : "Android";
}
