import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Copy,
  Check,
  Play,
  Save,
  AlertCircle,
  Trash2,
  FolderUp,
  Library,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Editor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useRepl } from "@/context/useRepl";
import { useSession } from "@/context/SessionContext";
import { scriptsApi } from "@/lib/scripts-api";
import { applyFridaTypes, loadFridaTypes } from "@/lib/frida-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EvalEntry {
  id: number;
  source: string;
  status: "loading" | "success" | "error";
  result?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatError(err: any): string {
  if (typeof err === "string") return err;
  if (err?.message) {
    const loc = [err.fileName, err.lineNumber].filter(Boolean).join(":");
    return loc ? `${err.message} (${loc})` : err.message;
  }
  if (typeof err === "object" && err !== null) {
    const { name, description, ...rest } = err;
    const label = description || name || "Error";
    const details = Object.entries(rest)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return details ? `${label} (${details})` : label;
  }
  return String(err);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatResult(value: any): string {
  if (value === null) return "null";
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

let nextId = 0;

export function CodeScratchPadTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { content, setContent, save, dirty } = useRepl();
  const { socket, lastInjection } = useSession();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [entries, setEntries] = useState<EvalEntry[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [overwriteDialogOpen, setOverwriteDialogOpen] = useState(false);
  const [newScriptName, setNewScriptName] = useState("");
  const [newScriptDescription, setNewScriptDescription] = useState("");
  const [overwriteId, setOverwriteId] = useState<string>("");
  const listEndRef = useRef<HTMLDivElement>(null);
  const { data: dts, isPending } = useQuery({
    queryKey: ["typescript"],
    queryFn: loadFridaTypes,
    retry: false,
  });
  const { data: savedScripts = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => scriptsApi.listScripts(),
  });

  useEffect(() => {
    if (!overwriteId && savedScripts.length > 0) {
      setOverwriteId(String(savedScripts[0].id));
    }
  }, [overwriteId, savedScripts]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const createScriptMutation = useMutation({
    mutationFn: async () =>
      scriptsApi.createScript({
        name: newScriptName,
        description: newScriptDescription || null,
        source: content,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scripts"] });
      setCreateDialogOpen(false);
      setNewScriptName("");
      setNewScriptDescription("");
      toast.success(t("script_saved_success"));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const overwriteScriptMutation = useMutation({
    mutationFn: async () => {
      const id = Number.parseInt(overwriteId, 10);
      return scriptsApi.updateScript(id, { source: content });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["scripts"] });
      setOverwriteDialogOpen(false);
      toast.success(t("script_overwrite_success"));
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleRun = useCallback(() => {
    if (!socket || !content.trim()) return;
    save();
    const id = nextId++;
    setEntries((prev) => [...prev, { id, source: content, status: "loading" }]);
    socket.emit("eval", content, "userscript", (err, result) => {
      console.debug("user script eval result", err, result);
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? err
              ? {
                  ...e,
                  status: "error" as const,
                  result: formatError(err),
                }
              : {
                  ...e,
                  status: "success" as const,
                  result:
                    result !== undefined ? formatResult(result) : undefined,
                }
            : e,
        ),
      );
    });
  }, [socket, content, save]);

  const handleClearEntries = useCallback(() => setEntries([]), []);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) setContent(value);
    },
    [setContent],
  );

  const saveRef = useRef(save);
  saveRef.current = save;

  const handleBeforeMount = useCallback<BeforeMount>(
    (monaco) => {
      applyFridaTypes(monaco, dts);
    },
    [dts],
  );

  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    monacoRef.current = monaco;

    editor.addAction({
      id: "save",
      label: "Save",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => saveRef.current(),
    });
  }, []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "script.js";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [content]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [content]);

  const running = entries.some((e) => e.status === "loading");

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-1">
          <Button
            variant="default"
            size="sm"
            className="h-7 px-2 gap-1.5"
            onClick={handleRun}
            disabled={running || !socket || !content.trim()}
          >
            {running ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {t("run")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5"
            onClick={save}
            disabled={!dirty}
          >
            <Save className="h-3.5 w-3.5" />
            {t("save")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5"
            onClick={() => setCreateDialogOpen(true)}
            disabled={!content.trim()}
          >
            <FolderUp className="h-3.5 w-3.5" />
            {t("repl_save_as_script")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5"
            onClick={() => setOverwriteDialogOpen(true)}
            disabled={!content.trim() || savedScripts.length === 0}
          >
            <Library className="h-3.5 w-3.5" />
            {t("repl_save_to_script")}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5"
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
            {t("repl_download")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                {t("copied")}
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                {t("repl_copy")}
              </>
            )}
          </Button>
        </div>
      </div>
      {lastInjection && (
        <div className="border-b bg-muted/20 px-3 py-2 text-xs">
          <div className="font-medium">
            {t("injection_summary", {
              plans: lastInjection.matchedPlans,
              success: lastInjection.summary.successful,
              failed: lastInjection.summary.failed,
              skipped: lastInjection.summary.skipped,
            })}
          </div>
          {lastInjection.results.length > 0 && (
            <div className="mt-1 max-h-24 space-y-1 overflow-y-auto text-muted-foreground">
              {lastInjection.results.map((item, index) => (
                <div key={`${item.planId}-${item.scriptId}-${index}`}>
                  {item.planName} / {item.scriptName} / {item.injectWhen} / {item.status}
                  {item.error ? ` / ${item.error}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          orientation="horizontal"
          autoSaveId="code-scratch-pad-split"
        >
          <ResizablePanel defaultSize="65%" minSize="30%">
            {isPending ? (
              <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                <Spinner className="w-5 h-5" />
                <span>{t("loading")}...</span>
              </div>
            ) : (
              <Editor
                height="100%"
                language="javascript"
                path="scratch-pad.js"
                value={content}
                onChange={handleChange}
                beforeMount={handleBeforeMount}
                onMount={handleEditorMount}
                theme={theme === "dark" ? "vs-dark" : "light"}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  fontSize: 13,
                  lineNumbers: "on",
                  folding: true,
                  automaticLayout: true,
                  tabSize: 2,
                  insertSpaces: true,
                  formatOnPaste: true,
                }}
              />
            )}
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="35%" minSize="15%">
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("output")}
                </span>
                {entries.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={handleClearEntries}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {entries.length === 0 ? null : (
                  <div className="divide-y">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="px-3 py-2 text-xs space-y-1"
                      >
                        <pre
                          className="font-mono text-muted-foreground truncate"
                          title={entry.source}
                        >
                          {entry.source}
                        </pre>
                        {entry.status === "loading" ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Spinner className="h-3 w-3" />
                            <span>Evaluating...</span>
                          </div>
                        ) : entry.status === "error" ? (
                          <div className="flex items-start gap-1.5 text-destructive">
                            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="break-all">{entry.result}</span>
                          </div>
                        ) : entry.result !== undefined ? (
                          <pre className="font-mono text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">
                            {entry.result}
                          </pre>
                        ) : (
                          <span className="text-muted-foreground italic">
                            undefined
                          </span>
                        )}
                      </div>
                    ))}
                    <div ref={listEndRef} />
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("repl_save_as_script")}</DialogTitle>
            <DialogDescription>
              {t("repl_save_as_script_hint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                {t("name")}
              </label>
              <Input
                value={newScriptName}
                onChange={(e) => setNewScriptName(e.target.value)}
                placeholder={t("script_name_placeholder")}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                {t("description")}
              </label>
              <Textarea
                value={newScriptDescription}
                onChange={(e) => setNewScriptDescription(e.target.value)}
                placeholder={t("script_description_placeholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={() => createScriptMutation.mutate()}
              disabled={!newScriptName.trim() || createScriptMutation.isPending}
            >
              {createScriptMutation.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <FolderUp className="h-4 w-4" />
              )}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overwriteDialogOpen} onOpenChange={setOverwriteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("repl_save_to_script")}</DialogTitle>
            <DialogDescription>
              {t("repl_save_to_script_hint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              {t("scripts_library")}
            </label>
            <Select
              value={overwriteId}
              onValueChange={(value) => {
                if (value) setOverwriteId(value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {savedScripts.map((script) => (
                  <SelectItem key={script.id} value={String(script.id)}>
                    {script.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverwriteDialogOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={() => overwriteScriptMutation.mutate()}
              disabled={!overwriteId || overwriteScriptMutation.isPending}
            >
              {overwriteScriptMutation.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Library className="h-4 w-4" />
              )}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
