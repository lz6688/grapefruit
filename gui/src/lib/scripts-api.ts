import type {
  ScriptLibraryImportResult,
  ScriptLibraryPayload,
  ScriptPlanDetail,
  ScriptPlanItem,
  ScriptPlanSummary,
  ScriptPlanTarget,
  StoredScript,
} from "./script-plan-types";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      try {
        const text = await res.text();
        if (text) message = text;
      } catch {
        // ignore secondary parsing failure
      }
    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export interface ScriptPayload {
  name: string;
  description?: string | null;
  source: string;
}

export interface ScriptPlanPayload {
  name: string;
  enabled: boolean;
  autoApply: boolean;
  continueOnError: boolean;
  priority: number;
}

export const scriptsApi = {
  listScripts() {
    return request<StoredScript[]>("/api/scripts");
  },
  getScript(id: number) {
    return request<StoredScript>(`/api/scripts/${id}`);
  },
  createScript(payload: ScriptPayload) {
    return request<StoredScript>("/api/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
  updateScript(id: number, payload: Partial<ScriptPayload>) {
    return request<StoredScript>(`/api/scripts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
  deleteScript(id: number) {
    return request<void>(`/api/scripts/${id}`, { method: "DELETE" });
  },
  exportLibrary() {
    return request<ScriptLibraryPayload>("/api/scripts/export");
  },
  importLibrary(payload: ScriptLibraryPayload) {
    return request<ScriptLibraryImportResult>("/api/scripts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
  listPlans() {
    return request<ScriptPlanSummary[]>("/api/script-plans");
  },
  getPlan(id: number) {
    return request<ScriptPlanDetail>(`/api/script-plans/${id}`);
  },
  createPlan(payload: Partial<ScriptPlanPayload>) {
    return request<ScriptPlanDetail>("/api/script-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
  updatePlan(id: number, payload: Partial<ScriptPlanPayload>) {
    return request<ScriptPlanDetail>(`/api/script-plans/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
  deletePlan(id: number) {
    return request<void>(`/api/script-plans/${id}`, { method: "DELETE" });
  },
  replaceTargets(id: number, targets: ScriptPlanTarget[]) {
    return request<ScriptPlanTarget[]>(`/api/script-plans/${id}/targets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets }),
    });
  },
  replaceItems(id: number, items: ScriptPlanItem[]) {
    return request<ScriptPlanItem[]>(`/api/script-plans/${id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((item) => ({
          scriptId: item.scriptId,
          injectWhen: item.injectWhen,
          enabled: item.enabled,
        })),
      }),
    });
  },
};
