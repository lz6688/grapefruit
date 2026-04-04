export type ScriptTargetPlatform = "fruity" | "droid";
export type ScriptTargetMode = "app" | "daemon";
export type InjectWhen = "attach" | "spawn";
export type InjectionStatus = "success" | "error" | "skipped";

export interface StoredScript {
  id: number;
  name: string;
  description: string | null;
  source: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ScriptLibraryEntry {
  name: string;
  description: string | null;
  source: string;
}

export interface ScriptLibraryPayload {
  version: number;
  exportedAt: string;
  scripts: ScriptLibraryEntry[];
}

export interface ScriptLibraryImportResult {
  imported: StoredScript[];
}

export interface ScriptPlanTarget {
  id?: number;
  planId?: number;
  platform: ScriptTargetPlatform;
  mode: ScriptTargetMode;
  bundle?: string | null;
  processName?: string | null;
  pid?: number | null;
}

export interface ScriptPlanItem {
  id?: number;
  planId?: number;
  scriptId: number;
  position?: number;
  injectWhen: InjectWhen;
  enabled: boolean;
  scriptName?: string;
  scriptDescription?: string | null;
  scriptSource?: string;
}

export interface ScriptPlanSummary {
  id: number;
  name: string;
  enabled: boolean;
  autoApply: boolean;
  continueOnError: boolean;
  priority: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  targetCount: number;
  itemCount: number;
}

export interface ScriptPlanDetail {
  id: number;
  name: string;
  enabled: boolean;
  autoApply: boolean;
  continueOnError: boolean;
  priority: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  targets: ScriptPlanTarget[];
  items: ScriptPlanItem[];
}

export interface InjectionResultItem {
  planId: number;
  planName: string;
  scriptId: number;
  scriptName: string;
  injectWhen: InjectWhen;
  status: InjectionStatus;
  error?: string;
}

export interface InjectionReport {
  launch: "attach" | "spawn";
  matchedPlans: number;
  results: InjectionResultItem[];
  summary: {
    successful: number;
    failed: number;
    skipped: number;
  };
}
