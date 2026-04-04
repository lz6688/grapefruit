import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, FileCode2 } from "lucide-react";
import { toast } from "sonner";

import { scriptsApi } from "@/lib/scripts-api";
import type { StoredScript } from "@/lib/script-plan-types";
import {
  ScriptEditorPane,
  type ScriptDraft,
} from "@/components/shared/ScriptEditorPane";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function toDraft(script: StoredScript): ScriptDraft {
  return {
    id: script.id,
    name: script.name,
    description: script.description ?? "",
    source: script.source,
  };
}

function emptyDraft(): ScriptDraft {
  return {
    name: "",
    description: "",
    source: "",
  };
}

export function ScriptsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ScriptDraft | null>(null);
  const [baseline, setBaseline] = useState<ScriptDraft | null>(null);

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => scriptsApi.listScripts(),
  });

  const { data: scriptDetail } = useQuery({
    queryKey: ["scripts", selectedId],
    queryFn: () => scriptsApi.getScript(selectedId!),
    enabled: selectedId !== null,
  });

  useEffect(() => {
    if (selectedId === null && scripts.length > 0 && draft === null) {
      setSelectedId(scripts[0].id);
    }
    if (scripts.length === 0 && draft === null) {
      const next = emptyDraft();
      setDraft(next);
      setBaseline(next);
    }
  }, [scripts, selectedId, draft]);

  useEffect(() => {
    if (!scriptDetail) return;
    const next = toDraft(scriptDetail);
    setDraft(next);
    setBaseline(next);
  }, [scriptDetail]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [draft, baseline],
  );

  const saveMutation = useMutation({
    mutationFn: async (current: ScriptDraft) => {
      if (!current.id) {
        return scriptsApi.createScript({
          name: current.name,
          description: current.description || null,
          source: current.source,
        });
      }

      return scriptsApi.updateScript(current.id, {
        name: current.name,
        description: current.description || null,
        source: current.source,
      });
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["scripts"] });
      await queryClient.invalidateQueries({ queryKey: ["scripts", saved.id] });
      const next = toDraft(saved);
      setSelectedId(saved.id);
      setDraft(next);
      setBaseline(next);
      toast.success(t("script_saved_success"));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => scriptsApi.deleteScript(id),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ["scripts"] });
      await queryClient.removeQueries({ queryKey: ["scripts", id] });
      const remaining = scripts.filter((script) => script.id !== id);
      if (remaining.length > 0) {
        setSelectedId(remaining[0].id);
      } else {
        setSelectedId(null);
        const next = emptyDraft();
        setDraft(next);
        setBaseline(next);
      }
      toast.success(t("script_deleted_success"));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleNew = () => {
    const next = emptyDraft();
    setSelectedId(null);
    setDraft(next);
    setBaseline(next);
  };

  return (
    <div className="flex min-h-full">
      <aside className="w-80 shrink-0 border-r bg-sidebar">
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div>
            <h1 className="text-sm font-semibold">{t("scripts_library")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("scripts_library_hint")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            {t("script_new")}
          </Button>
        </div>
        <div className="space-y-1 p-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              {t("loading")}
            </div>
          ) : scripts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("scripts_empty")}</p>
          ) : (
            scripts.map((script) => (
              <button
                key={script.id}
                type="button"
                onClick={() => setSelectedId(script.id)}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                  selectedId === script.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60"
                }`}
              >
                <FileCode2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{script.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {script.description || t("script_description_placeholder")}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <ScriptEditorPane
          draft={draft}
          dirty={dirty}
          saving={saveMutation.isPending}
          deleting={deleteMutation.isPending}
          onChange={setDraft}
          onSave={() => draft && saveMutation.mutate(draft)}
          onDelete={() => draft?.id && deleteMutation.mutate(draft.id)}
          onReset={() => baseline && setDraft(baseline)}
        />
      </main>
    </div>
  );
}
