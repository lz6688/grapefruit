import type { InjectionResultItem } from "../types.ts";

export function formatInjectionLogLine(item: InjectionResultItem): string {
  const base = `[inject][${item.status}][${item.injectWhen}] ${item.planName} / ${item.scriptName}`;
  return item.error ? `${base} - ${item.error}` : base;
}
