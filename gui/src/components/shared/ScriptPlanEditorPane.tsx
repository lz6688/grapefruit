import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";

import type {
  InjectWhen,
  ScriptPlanDetail,
  ScriptPlanItem,
  ScriptPlanTarget,
  StoredScript,
} from "@/lib/script-plan-types";
import { scriptItemLabel, scriptTargetPlatformLabel } from "@/lib/scripts-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ScriptPlanDraft
  extends Omit<ScriptPlanDetail, "id" | "targets" | "items"> {
  id?: number;
  targets: ScriptPlanTarget[];
  items: ScriptPlanItem[];
}

interface ScriptPlanEditorPaneProps {
  draft: ScriptPlanDraft | null;
  scripts: StoredScript[];
  dirty: boolean;
  saving: boolean;
  deleting: boolean;
  onChange: (draft: ScriptPlanDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onReset: () => void;
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function ScriptPlanEditorPane({
  draft,
  scripts,
  dirty,
  saving,
  deleting,
  onChange,
  onSave,
  onDelete,
  onReset,
}: ScriptPlanEditorPaneProps) {
  const { t } = useTranslation();

  if (!draft) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("plan_select_hint")}
      </div>
    );
  }

  const updateTarget = (index: number, patch: Partial<ScriptPlanTarget>) => {
    const targets = draft.targets.map((target, targetIndex) =>
      targetIndex === index ? { ...target, ...patch } : target,
    );
    onChange({ ...draft, targets });
  };

  const updateItem = (index: number, patch: Partial<ScriptPlanItem>) => {
    const items = draft.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    );
    onChange({ ...draft, items });
  };

  const addTarget = () => {
    onChange({
      ...draft,
      targets: [
        ...draft.targets,
        { platform: "fruity", mode: "app", bundle: "" },
      ],
    });
  };

  const addItem = () => {
    const first = scripts[0];
    if (!first) return;
    onChange({
      ...draft,
      items: [
        ...draft.items,
        {
          scriptId: first.id,
          injectWhen: "attach",
          enabled: true,
          scriptName: first.name,
        },
      ],
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">
            {draft.id ? `${t("script_plans")} #${draft.id}` : t("plan_new")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {dirty ? t("unsaved_changes") : t("saved_state")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={!dirty || saving}
          >
            <RotateCcw className="h-4 w-4" />
            {t("reset")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={!draft.id || deleting || saving}
          >
            <Trash2 className="h-4 w-4" />
            {t("delete")}
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {t("save")}
          </Button>
        </div>
      </div>

      <div className="overflow-y-auto">
        <div className="grid gap-3 border-b px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              {t("name")}
            </label>
            <Input
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder={t("plan_name_placeholder")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              {t("plan_priority")}
            </label>
            <Input
              type="number"
              value={draft.priority}
              onChange={(e) =>
                onChange({
                  ...draft,
                  priority: Number.parseInt(e.target.value || "0", 10) || 0,
                })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">{t("enabled")}</p>
              <p className="text-xs text-muted-foreground">
                {t("plan_enabled_hint")}
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(checked) =>
                onChange({ ...draft, enabled: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">{t("plan_auto_apply")}</p>
              <p className="text-xs text-muted-foreground">
                {t("plan_auto_apply_hint")}
              </p>
            </div>
            <Switch
              checked={draft.autoApply}
              onCheckedChange={(checked) =>
                onChange({ ...draft, autoApply: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 md:col-span-2 xl:col-span-4">
            <div>
              <p className="text-sm font-medium">{t("plan_continue_on_error")}</p>
              <p className="text-xs text-muted-foreground">
                {t("plan_continue_on_error_hint")}
              </p>
            </div>
            <Switch
              checked={draft.continueOnError}
              onCheckedChange={(checked) =>
                onChange({ ...draft, continueOnError: checked })
              }
            />
          </div>
        </div>

        <section className="border-b px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">{t("plan_targets")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("plan_targets_hint")}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addTarget}>
              <Plus className="h-4 w-4" />
              {t("plan_add_target")}
            </Button>
          </div>
          <div className="space-y-3">
            {draft.targets.map((target, index) => (
              <div
                key={`target-${index}`}
                className="grid gap-3 rounded-md border p-3 lg:grid-cols-[140px_140px_minmax(0,1fr)_minmax(0,1fr)_120px_auto]"
              >
                <Select
                  value={target.platform}
                  onValueChange={(value) =>
                    updateTarget(index, {
                      platform: value as ScriptPlanTarget["platform"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {scriptTargetPlatformLabel(target.platform)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fruity">
                      {scriptTargetPlatformLabel("fruity")}
                    </SelectItem>
                    <SelectItem value="droid">
                      {scriptTargetPlatformLabel("droid")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={target.mode}
                  onValueChange={(value) =>
                    updateTarget(index, {
                      mode: value as ScriptPlanTarget["mode"],
                      bundle: value === "app" ? target.bundle ?? "" : null,
                      processName:
                        value === "daemon" ? target.processName ?? "" : null,
                      pid: value === "daemon" ? target.pid ?? null : null,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="app">{t("app")}</SelectItem>
                    <SelectItem value="daemon">{t("daemon")}</SelectItem>
                  </SelectContent>
                </Select>
                {target.mode === "app" ? (
                  <Input
                    className="lg:col-span-3"
                    value={target.bundle ?? ""}
                    placeholder={t("bundle_id")}
                    onChange={(e) =>
                      updateTarget(index, { bundle: e.target.value })
                    }
                  />
                ) : (
                  <>
                    <Input
                      value={target.processName ?? ""}
                      placeholder={t("process_name_placeholder")}
                      onChange={(e) =>
                        updateTarget(index, { processName: e.target.value })
                      }
                    />
                    <Input
                      type="number"
                      value={target.pid ?? ""}
                      placeholder="PID"
                      onChange={(e) =>
                        updateTarget(index, {
                          pid: e.target.value
                            ? Number.parseInt(e.target.value, 10)
                            : null,
                        })
                      }
                    />
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    onChange({
                      ...draft,
                      targets: draft.targets.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {draft.targets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("plan_no_targets")}
              </p>
            )}
          </div>
        </section>

        <section className="px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">{t("plan_scripts")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("plan_scripts_hint")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={scripts.length === 0}
            >
              <Plus className="h-4 w-4" />
              {t("plan_add_script")}
            </Button>
          </div>
          <div className="space-y-3">
            {draft.items.map((item, index) => (
              <div
                key={`item-${index}`}
                className="grid gap-3 rounded-md border p-3 lg:grid-cols-[minmax(0,1fr)_160px_120px_auto_auto_auto]"
              >
                <Select
                  value={String(item.scriptId)}
                  onValueChange={(value) => {
                    const script = scripts.find((entry) => entry.id === Number(value));
                    updateItem(index, {
                      scriptId: Number(value),
                      scriptName: script?.name,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {scriptItemLabel(item, scripts)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {scripts.map((script) => (
                      <SelectItem key={script.id} value={String(script.id)}>
                        {script.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={item.injectWhen}
                  onValueChange={(value) =>
                    updateItem(index, { injectWhen: value as InjectWhen })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attach">attach</SelectItem>
                    <SelectItem value="spawn">spawn</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-between rounded-md border px-3">
                  <span className="text-sm">{t("enabled")}</span>
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={(checked) =>
                      updateItem(index, { enabled: checked })
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    index > 0 &&
                    onChange({
                      ...draft,
                      items: moveItem(draft.items, index, index - 1),
                    })
                  }
                  disabled={index === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    index < draft.items.length - 1 &&
                    onChange({
                      ...draft,
                      items: moveItem(draft.items, index, index + 1),
                    })
                  }
                  disabled={index === draft.items.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    onChange({
                      ...draft,
                      items: draft.items.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {draft.items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {scripts.length === 0
                  ? t("plan_no_scripts_available")
                  : t("plan_no_items")}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
