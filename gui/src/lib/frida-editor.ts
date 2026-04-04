import type { BeforeMount } from "@monaco-editor/react";

type MonacoLike = Parameters<BeforeMount>[0];

export async function loadFridaTypes(): Promise<Record<string, string>> {
  const res = await fetch("/api/d.ts/pack");
  if (!res.ok) throw new Error("Failed to load TypeScript definitions");
  return res.json();
}

export function applyFridaTypes(
  monaco: MonacoLike,
  dts: Record<string, string> | undefined,
) {
  const defaults = [
    monaco.languages.typescript.javascriptDefaults,
    monaco.languages.typescript.typescriptDefaults,
  ];

  for (const entry of defaults) {
    entry.setCompilerOptions({
      ...entry.getCompilerOptions(),
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      lib: ["esnext"],
      allowJs: true,
      allowNonTsExtensions: true,
      checkJs: false,
    });
  }

  if (!dts) return;

  for (const [name, source] of Object.entries(dts)) {
    for (const entry of defaults) {
      entry.addExtraLib(source, name);
    }
  }
}
