import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Workflow } from "lucide-react";
import { toast } from "sonner";

import { scriptsApi } from "@/lib/scripts-api";
import type {
  ScriptPlanDetail,
  ScriptPlanSummary,
} from "@/lib/script-plan-types";
import {
  ScriptPlanEditorPane,
  type ScriptPlanDraft,
} from "@/components/shared/ScriptPlanEditorPane";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function emptyDraft(): ScriptPlanDraft {
  return {
    name: "",
    enabled: true,
    autoApply: true,
    continueOnError: true,
    priority: 0,
    targets: [],
    items: [],
  };
}

function toDraft(plan: ScriptPlanDetail): ScriptPlanDraft {
  return {
    ...plan,
    targets: plan.targets.map((target) => ({ ...target })),
    items: plan.items.map((item) => ({ ...item })),
  };
}

export function ScriptPlansPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ScriptPlanDraft | null>(null);
  const [baseline, setBaseline] = useState<ScriptPlanDraft | null>(null);

  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => scriptsApi.listScripts(),
  });

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["script-plans"],
    queryFn: () => scriptsApi.listPlans(),
  });

  const { data: planDetail } = useQuery({
    queryKey: ["script-plans", selectedId],
    queryFn: () => scriptsApi.getPlan(selectedId!),
    enabled: selectedId !== null,
  });

  useEffect(() => {
    if (selectedId === null && plans.length > 0 && draft === null) {
      setSelectedId(plans[0].id);
    }
    if (plans.length === 0 && draft === null) {
      const next = emptyDraft();
      setDraft(next);
      setBaseline(next);
    }
  }, [plans, selectedId, draft]);

  useEffect(() => {
    if (!planDetail) return;
    const next = toDraft(planDetail);
    setDraft(next);
    setBaseline(next);
  }, [planDetail]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [draft, baseline],
  );

  const saveMutation = useMutation({
    mutationFn: async (current: ScriptPlanDraft) => {
      const base = {
        name: current.name,
        enabled: current.enabled,
        autoApply: current.autoApply,
        continueOnError: current.continueOnError,
        priority: current.priority,
      };

      const createdOrUpdated = current.id
        ? await scriptsApi.updatePlan(current.id, base)
        : await scriptsApi.createPlan(base);

      await scriptsApi.replaceTargets(createdOrUpdated.id, current.targets);
      await scriptsApi.replaceItems(createdOrUpdated.id, current.items);
      return scriptsApi.getPlan(createdOrUpdated.id);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["script-plans"] });
      await queryClient.invalidateQueries({
        queryKey: ["script-plans", saved.id],
      });
      const next = toDraft(saved);
      setSelectedId(saved.id);
      setDraft(next);
      setBaseline(next);
      toast.success(t("plan_saved_success"));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => scriptsApi.deletePlan(id),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ["script-plans"] });
      await queryClient.removeQueries({ queryKey: ["script-plans", id] });
      const remaining = plans.filter((plan) => plan.id !== id);
      if (remaining.length > 0) {
        setSelectedId(remaining[0].id);
      } else {
        setSelectedId(null);
        const next = emptyDraft();
        setDraft(next);
        setBaseline(next);
      }
      toast.success(t("plan_deleted_success"));
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
            <h1 className="text-sm font-semibold">{t("script_plans")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("script_plans_hint")}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            {t("plan_new")}
          </Button>
        </div>
        <div className="space-y-1 p-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              {t("loading")}
            </div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("plans_empty")}</p>
          ) : (
            plans.map((plan: ScriptPlanSummary) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedId(plan.id)}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                  selectedId === plan.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60"
                }`}
              >
                <Workflow className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{plan.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("plan_counts", {
                      targets: plan.targetCount,
                      items: plan.itemCount,
                    })}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <ScriptPlanEditorPane
          draft={draft}
          scripts={scripts}
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
