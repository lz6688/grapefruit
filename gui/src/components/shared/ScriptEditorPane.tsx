import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { Save, Trash2, RotateCcw } from "lucide-react";

import { useTheme } from "@/components/providers/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { applyFridaTypes, loadFridaTypes } from "@/lib/frida-editor";

export interface ScriptDraft {
  id?: number;
  name: string;
  description: string;
  source: string;
}

interface ScriptEditorPaneProps {
  draft: ScriptDraft | null;
  dirty: boolean;
  saving: boolean;
  deleting: boolean;
  onChange: (draft: ScriptDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onReset: () => void;
}

export function ScriptEditorPane({
  draft,
  dirty,
  saving,
  deleting,
  onChange,
  onSave,
  onDelete,
  onReset,
}: ScriptEditorPaneProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { data: dts, isPending } = useQuery({
    queryKey: ["typescript"],
    queryFn: loadFridaTypes,
    retry: false,
  });
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const handleBeforeMount = useCallback<BeforeMount>(
    (monaco) => {
      applyFridaTypes(monaco, dts);
    },
    [dts],
  );

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editor.addAction({
      id: "save-script",
      label: "Save Script",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => saveRef.current(),
    });
  }, []);

  if (!draft) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("script_select_hint")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">
            {draft.id ? `${t("scripts_library")} #${draft.id}` : t("script_new")}
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

      <div className="grid gap-3 border-b px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            {t("name")}
          </label>
          <Input
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder={t("script_name_placeholder")}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            {t("description")}
          </label>
          <Textarea
            value={draft.description}
            onChange={(e) =>
              onChange({ ...draft, description: e.target.value })
            }
            rows={3}
            placeholder={t("script_description_placeholder")}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isPending ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" />
            {t("loading")}
          </div>
        ) : (
          <Editor
            height="100%"
            language="javascript"
            path={draft.id ? `script-${draft.id}.js` : "script-new.js"}
            value={draft.source}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            onChange={(value) => onChange({ ...draft, source: value ?? "" })}
            theme={theme === "dark" ? "vs-dark" : "light"}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              fontSize: 13,
              lineNumbers: "on",
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
