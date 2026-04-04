import { t } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "./StatusBar";

import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type DockviewTheme,
} from "dockview";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { PanelImperativeHandle } from "react-resizable-panels";

import { useSession } from "@/context/SessionContext";
import SessionProvider from "../providers/SessionProvider";
import { ApkBrowserTab } from "../tabs/ApkBrowserTab";
import { AssetCatalogTab } from "../tabs/AssetCatalogTab";
import { AudioPreviewTab } from "../tabs/AudioPreviewTab";
import { BinariesTab } from "../tabs/BinariesTab";
import { BinaryOverviewTab } from "../tabs/BinaryOverviewTab";
import { BookmarksTab } from "../tabs/BookmarksTab";
import { ChecksecTab } from "../tabs/ChecksecTab";
import { CryptoTab } from "../tabs/CryptoTab";
import { DexViewerTab } from "../tabs/DexViewerTab";
import { DisassemblyTab } from "../tabs/DisassemblyTab";
import { DroidClassDetailTab } from "../tabs/DroidClassDetailTab";
import { DroidHandlesTab } from "../tabs/DroidHandlesTab";
import { DroidHttpTab } from "../tabs/DroidHttpTab";
import { JNITab } from "../tabs/DroidJNITab";
import { DroidKeystoreTab } from "../tabs/DroidKeystoreTab";
import { DroidManifestTab } from "../tabs/DroidManifestTab";
import { DroidProvidersTab } from "../tabs/DroidProvidersTab";
import { DroidResourcesTab } from "../tabs/DroidResourcesTab";
import { DroidWebViewTab } from "../tabs/DroidWebViewTab";
import { FilesTab } from "../tabs/FilesTab";
import { FlutterMethodChannelsTab } from "../tabs/FlutterMethodChannelsTab";
import { FontPreviewTab } from "../tabs/FontPreviewTab";
import { FruityBinaryCookieTab } from "../tabs/FruityBinaryCookieTab";
import { FruityClassDetailTab } from "../tabs/FruityClassDetailTab";
import { FruityClassDumpTab } from "../tabs/FruityClassDumpTab";
import { FruityEntitlementsTab } from "../tabs/FruityEntitlementsTab";
import { FruityHandlesTab } from "../tabs/FruityHandlesTab";
import { FruityInfoPlistInsightsTab } from "../tabs/FruityInfoPlistInsightsTab";
import { FruityInfoPlistTab } from "../tabs/FruityInfoPlistTab";
import { FruityJSCTab } from "../tabs/FruityJSCTab";
import { FruityKeychainTab } from "../tabs/FruityKeychainTab";
import { FruityNSURLTab } from "../tabs/FruityNSURLTab";
import { FruityPlistPreviewTab } from "../tabs/FruityPlistPreviewTab";
import { FruityUIDumpTab } from "../tabs/FruityUIDumpTab";
import { FruityUserDefaultsTab } from "../tabs/FruityUserDefaultsTab";
import { FruityWebViewTab } from "../tabs/FruityWebViewTab";
import { FruityXPCTab } from "../tabs/FruityXPCTab";
import { HermesFileTab } from "../tabs/HermesFileTab";
import { HexPreviewTab } from "../tabs/HexPreviewTab";
import { HomeTab } from "../tabs/HomeTab";
import { Il2CppClassDetailTab } from "../tabs/Il2CppClassDetailTab";
import { Il2CppClassDumpTab } from "../tabs/Il2CppClassDumpTab";
import { ImagePreviewTab } from "../tabs/ImagePreviewTab";
import { MemoryMapsTab } from "../tabs/MemoryMapsTab";
import { MemoryPreviewTab } from "../tabs/MemoryPreviewTab";
import { MemoryScanTab } from "../tabs/MemoryScanTab";
import {
  ModuleClassesTab,
  ModuleExportedTab,
  ModuleImportsTab,
  ModuleSectionsTab,
  ModuleSymbolsTab,
} from "../tabs/ModuleViewTabs";
import { NoCloseTabHeader } from "../tabs/NoCloseTabHeader";
import { PrivacyTab } from "../tabs/PrivacyTab";
import { R2DisasmTab } from "../tabs/R2DisasmTab";
import { R2GraphTab } from "../tabs/R2GraphTab";
import { R2HexTab } from "../tabs/R2HexTab";
import { R2SearchTab } from "../tabs/R2SearchTab";
import { ReactNativeTab } from "../tabs/ReactNativeTab";
import { SQLiteEditorTab } from "../tabs/SQLiteEditorTab";
import { TextEditorTab } from "../tabs/TextEditorTab";
import { TypeEditorTab } from "../tabs/TypeEditorTab";
import { XCPrivacyTab } from "../tabs/XCPrivacyTab";
import { XrefGraphTab } from "../tabs/XrefGraphTab";
import { BottomPanelView } from "./BottomPanelView";
import { CommandPalette } from "./CommandPalette";
import { LeftPanelView } from "./LeftPanelView";

import { DockContext, useDockActions } from "@/context/DockContext";
import { R2Provider } from "@/context/R2Context";

const themeApp: DockviewTheme = {
  name: "app",
  className: "dockview-theme-app",
};

function WorkspaceContent() {
  const { bundle, device, mode, pid } = useSession();

  useEffect(() => {
    const target = bundle || (pid ? `PID ${pid}` : "");
    document.title = "HacKer" + (target ? ` - ${target}` : "");
  }, [bundle, pid]);

  const [bottomPanelVisible, setBottomPanelVisible] = useState(() => {
    try {
      const saved = localStorage.getItem("workspace-bottom-panel-visible");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    localStorage.setItem(
      "workspace-bottom-panel-visible",
      JSON.stringify(bottomPanelVisible),
    );
    const panel = bottomPanelRef.current;
    if (!panel) return;
    if (bottomPanelVisible) {
      panel.expand();
    } else {
      panel.collapse();
    }
    mountedRef.current = true;
  }, [bottomPanelVisible]);

  const bottomPanelRef = useRef<PanelImperativeHandle>(null);
  const mountedRef = useRef(false);

  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
  const { openSingletonPanel, openFilePanel } = useDockActions(dockApi);

  const getLayoutKey = useCallback(() => {
    if (!device) return null;
    const target = bundle || pid;
    if (!target) return null;
    return `workspace-dockview-layout:${device}:${mode}:${target}`;
  }, [device, bundle, pid, mode]);

  const resetLayout = useCallback(() => {
    if (!dockApi) return;
    const key = getLayoutKey();
    if (key) localStorage.removeItem(key);
    // Remove all existing panels
    for (const panel of dockApi.panels) {
      panel.api.close();
    }
    createDefaultLayout(dockApi);
  }, [dockApi, getLayoutKey]);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const dockContextValue = useMemo(
    () => ({
      api: dockApi,
      openSingletonPanel,
      openFilePanel,
      resetLayout,
    }),
    [dockApi, openSingletonPanel, openFilePanel, resetLayout],
  );

  const components = {
    home: HomeTab,
    apkBrowser: ApkBrowserTab,
    handles: FruityHandlesTab,
    infoPlist: FruityInfoPlistTab,
    entitlements: FruityEntitlementsTab,
    moduleDetail: ModuleImportsTab,
    moduleImports: ModuleImportsTab,
    moduleSections: ModuleSectionsTab,
    moduleClasses: ModuleClassesTab,
    moduleSymbols: ModuleSymbolsTab,
    moduleExported: ModuleExportedTab,
    classDetail: FruityClassDetailTab,
    classDump: FruityClassDumpTab,
    javaClassDetail: DroidClassDetailTab,
    files: FilesTab,
    imagePreview: ImagePreviewTab,
    audioPreview: AudioPreviewTab,
    hexPreview: HexPreviewTab,
    textEditor: TextEditorTab,
    plistPreview: FruityPlistPreviewTab,
    sqliteEditor: SQLiteEditorTab,
    fontPreview: FontPreviewTab,
    binaryCookie: FruityBinaryCookieTab,
    keychain: FruityKeychainTab,
    uiDump: FruityUIDumpTab,
    memory: MemoryPreviewTab,
    memoryScan: MemoryScanTab,
    webview: FruityWebViewTab,
    jsc: FruityJSCTab,
    userdefaults: FruityUserDefaultsTab,
    disassembly: DisassemblyTab,
    nsurl: FruityNSURLTab,
    flutterChannels: FlutterMethodChannelsTab,
    jni: JNITab,
    droidHandles: DroidHandlesTab,
    keystore: DroidKeystoreTab,
    infoPlistInsights: FruityInfoPlistInsightsTab,
    droidManifest: DroidManifestTab,
    droidProviders: DroidProvidersTab,
    xpc: FruityXPCTab,
    reactNative: ReactNativeTab,
    hermesFile: HermesFileTab,
    privacy: PrivacyTab,
    xcprivacy: XCPrivacyTab,
    droidHttp: DroidHttpTab,
    droidResources: DroidResourcesTab,
    droidWebview: DroidWebViewTab,
    assetCatalog: AssetCatalogTab,
    checksec: ChecksecTab,
    crypto: CryptoTab,
    il2cppClassDetail: Il2CppClassDetailTab,
    il2cppClassDump: Il2CppClassDumpTab,
    dexViewer: DexViewerTab,
    binaryOverview: BinaryOverviewTab,
    memoryMaps: MemoryMapsTab,
    binaries: BinariesTab,
    r2Search: R2SearchTab,
    typeEditor: TypeEditorTab,
    xrefGraph: XrefGraphTab,
    bookmarks: BookmarksTab,
    r2Graph: R2GraphTab,
    r2Hex: R2HexTab,
    r2Disasm: R2DisasmTab,
  };

  const tabComponents = {
    noClose: NoCloseTabHeader,
  };

  const onReady = (event: DockviewReadyEvent) => {
    setDockApi(event.api);

    const layoutKey = getLayoutKey();
    const savedLayoutWithMeta = layoutKey
      ? localStorage.getItem(layoutKey)
      : null;

    if (savedLayoutWithMeta) {
      try {
        const { layout } = JSON.parse(savedLayoutWithMeta);
        event.api.fromJSON(layout);
      } catch (e) {
        console.error("Failed to restore dockview layout:", e);
        if (layoutKey) {
          localStorage.removeItem(layoutKey);
        }
        createDefaultLayout(event.api);
      }
    } else {
      createDefaultLayout(event.api);
    }

    event.api.onDidLayoutChange(() => {
      const layout = event.api.toJSON();
      const key = getLayoutKey();
      if (key) {
        localStorage.setItem(
          key,
          JSON.stringify({ device, mode, target: bundle || pid, layout }),
        );
      }
    });
  };

  const createDefaultLayout = (dockApi: DockviewApi) => {
    dockApi.addPanel({
      id: "home_tab",
      component: "home",
      tabComponent: "noClose",
      title: t("home"),
    });
  };

  const r2StorageKey = `${device}:${mode}:${bundle || pid}`;

  return (
    <R2Provider storageKey={r2StorageKey}>
    <DockContext.Provider value={dockContextValue}>
      <div className="flex h-screen flex-col">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full"
          autoSaveId="workspace-left-split"
        >
          <ResizablePanel
            id="left"
            defaultSize="20%"
            minSize="15%"
            className="flex flex-col"
          >
            <LeftPanelView />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="main">
            <ResizablePanelGroup
              orientation="vertical"
              className="h-full"
              autoSaveId="workspace-bottom-split"
            >
              <ResizablePanel id="dock">
                <DockviewReact
                  theme={themeApp}
                  onReady={onReady}
                  components={components}
                  tabComponents={tabComponents}
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel
                id="bottom"
                panelRef={bottomPanelRef}
                defaultSize="30%"
                minSize="10%"
                collapsible
                collapsedSize={0}
                onResize={(size) => {
                  if (!mountedRef.current) return;
                  setBottomPanelVisible(size.asPercentage > 0);
                }}
              >
                <BottomPanelView />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
        <StatusBar
          bottomPanelVisible={bottomPanelVisible}
          setBottomPanelVisible={setBottomPanelVisible}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onResetLayout={resetLayout}
        />
      </div>
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </DockContext.Provider>
    </R2Provider>
  );
}

export function Workspace() {
  return (
    <SessionProvider>
      <WorkspaceContent />
    </SessionProvider>
  );
}
