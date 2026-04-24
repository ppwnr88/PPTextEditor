import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import "./App.css";
import { createCoreCommands } from "./lib/commands";
import { extensionRegistry } from "./lib/extensions";
import { configureMonaco, getMonacoLanguage } from "./lib/monaco";
import {
  createDirectory,
  createTextFile,
  deletePath,
  loadSettings,
  listDir,
  readFile,
  renamePath,
  saveSettings,
  searchInWorkspace,
  writeFile,
} from "./lib/tauri";
import { useAppStore } from "./store/useAppStore";
import type { CommandDefinition, FileNode, SearchResult } from "./types";

const FONT_FACE_OPTIONS = [
  "JetBrains Mono",
  "SF Mono",
  "Menlo",
  "Monaco",
  "Fira Code",
  "Cascadia Code",
  "Source Code Pro",
  "IBM Plex Mono",
  "Consolas",
  "ui-monospace",
];

function App() {
  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceSearchInputRef = useRef<HTMLInputElement | null>(null);
  const paletteInputRef = useRef<HTMLInputElement | null>(null);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [cursorStatus, setCursorStatus] = useState({ column: 1, lineNumber: 1 });
  const [openError, setOpenError] = useState<string | null>(null);
  const [githubTokenDraft, setGithubTokenDraft] = useState("");
  const [githubStatus, setGithubStatus] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(268);
  const [workspaceMenu, setWorkspaceMenu] = useState<WorkspaceMenuState | null>(null);
  const [fileAction, setFileAction] = useState<FileActionState | null>(null);

  const {
    closeTab,
    currentFileQuery,
    fileTree,
    isPaletteOpen,
    isSettingsOpen,
    isSidebarOpen,
    markTabSaved,
    openTab,
    setActiveTab,
    setCurrentFileQuery,
    setFileTree,
    setPaletteOpen,
    setSettings,
    setSettingsOpen,
    setSidebarMode,
    setSidebarOpen,
    setWorkspaceQuery,
    setWorkspaceSearch,
    settings,
    sidebarMode,
    tabs,
    toggleNode,
    updateWorkspaceState,
    updateActiveTabContent,
    workspace,
    workspaceQuery,
    workspaceResults,
  } = useAppStore();

  const activeTabId = workspace.activeTabId;
  const deferredWorkspaceQuery = useDeferredValue(workspaceQuery);
  const deferredPaletteQuery = useDeferredValue(paletteQuery);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );

  async function handleOpenFolder(path: string, expandedNodes?: string[]) {
    const root = await listDir(path);
    const nextExpandedNodes = expandedNodes && expandedNodes.length > 0 ? expandedNodes : [path];
    setFileTree(root);
    updateWorkspaceState(path, nextExpandedNodes);
    setSettings({
      ...settings,
      workspace: {
        expandedNodes: nextExpandedNodes,
        rootPath: path,
      },
      recentFolders: [path, ...settings.recentFolders.filter((entry) => entry !== path)].slice(0, 12),
    });
  }

  async function restoreWorkspace(path: string, expandedNodes: string[]) {
    try {
      const root = await listDir(path);
      setFileTree(root);
      updateWorkspaceState(path, expandedNodes.length > 0 ? expandedNodes : [path]);
      setOpenError(null);
    } catch (error) {
      setOpenError(`Could not restore workspace: ${String(error)}`);
    }
  }

  async function refreshWorkspace() {
    if (!workspace.rootPath) {
      return;
    }

    try {
      setFileTree(await listDir(workspace.rootPath));
    } catch (error) {
      setOpenError(`Could not refresh workspace: ${String(error)}`);
    }
  }

  async function handleOpenFile(path: string) {
    try {
      const content = await readFile(path);
      openTab({
        content,
        dirty: false,
        id: path,
        language: getMonacoLanguage(path),
        name: path.split("/").pop() ?? path,
        originalContent: content,
        path,
      });
      setOpenError(null);
      setSettings({
        ...settings,
        recentFiles: [path, ...settings.recentFiles.filter((entry) => entry !== path)].slice(0, 12),
      });
    } catch (error) {
      setOpenError(`${path.split("/").pop() ?? path}: ${String(error)}`);
    }
  }

  async function handleSaveActiveTab(forcePicker = false) {
    if (!activeTab) {
      return;
    }

    const savePath =
      !forcePicker && activeTab.path
        ? activeTab.path
        : await save({
            defaultPath: workspace.rootPath ? `${workspace.rootPath}/${activeTab.name}` : activeTab.name,
            title: "Save File",
          });

    if (!savePath) {
      return;
    }

    await writeFile(savePath, activeTab.content);
    markTabSaved(activeTab.id, {
      id: savePath,
      language: getMonacoLanguage(savePath),
      name: savePath.split("/").pop() ?? savePath,
      path: savePath,
    });
    setSettings({
      ...settings,
      recentFiles: [savePath, ...settings.recentFiles.filter((entry) => entry !== savePath)].slice(0, 12),
    });
    await refreshWorkspace();
  }

  function createUntitledTab() {
    const untitledCount = tabs.filter((tab) => !tab.path).length + 1;
    const name = untitledCount === 1 ? "untitled" : `untitled ${untitledCount}`;

    openTab({
      content: "",
      dirty: false,
      id: `untitled:${Date.now()}`,
      language: "plaintext",
      name,
      originalContent: "",
      path: "",
    });
  }

  function selectSiblingTab(direction: 1 | -1) {
    if (!activeTabId || tabs.length < 2) {
      return;
    }

    const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    setActiveTab(tabs[nextIndex].id);
  }

  async function handleNativeMenuCommand(command: string) {
    switch (command) {
      case "native.new-file":
        createUntitledTab();
        break;
      case "native.open-file":
        await commandContext.openFilePicker();
        break;
      case "native.open-folder":
      case "native.add-folder":
        await commandContext.openFolderPicker();
        break;
      case "native.save":
        await handleSaveActiveTab();
        break;
      case "native.save-as":
        await handleSaveActiveTab(true);
        break;
      case "native.close-file":
        if (activeTabId) {
          closeTab(activeTabId);
        }
        break;
      case "native.find":
        searchInputRef.current?.focus();
        break;
      case "native.find-in-files":
        setSidebarOpen(true);
        setSidebarMode("search");
        workspaceSearchInputRef.current?.focus();
        break;
      case "native.goto-anything":
      case "native.command-palette":
        setPaletteOpen(true);
        break;
      case "native.toggle-sidebar":
        setSidebarOpen(!isSidebarOpen);
        break;
      case "native.toggle-word-wrap":
        setSettings({ ...settings, wordWrap: settings.wordWrap === "on" ? "off" : "on" });
        break;
      case "native.tab-size-2":
        setSettings({ ...settings, tabSize: 2 });
        break;
      case "native.tab-size-4":
        setSettings({ ...settings, tabSize: 4 });
        break;
      case "native.tab-size-8":
        setSettings({ ...settings, tabSize: 8 });
        break;
      case "native.refresh-folders":
        await refreshWorkspace();
        break;
      case "native.next-file":
        selectSiblingTab(1);
        break;
      case "native.previous-file":
        selectSiblingTab(-1);
        break;
      default:
        break;
    }
  }

  async function handleConnectGitHub() {
    const token = githubTokenDraft.trim() || settings.github.token.trim();
    if (!token) {
      setGithubStatus("Paste a GitHub personal access token first.");
      return;
    }

    setGithubStatus("Connecting to GitHub...");
    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        throw new Error(response.status === 401 ? "Token is invalid or expired." : `GitHub returned ${response.status}.`);
      }

      const profile = (await response.json()) as { login?: string };
      const username = profile.login ?? "github-user";
      setSettings({
        ...settings,
        github: {
          connected: true,
          token,
          username,
        },
      });
      setGithubTokenDraft("");
      setGithubStatus(`Connected as ${username}.`);
    } catch (error) {
      setGithubStatus(String(error instanceof Error ? error.message : error));
    }
  }

  function handleDisconnectGitHub() {
    setSettings({
      ...settings,
      github: {
        connected: false,
        token: "",
        username: "",
      },
    });
    setGithubTokenDraft("");
    setGithubStatus("Disconnected from GitHub.");
  }

  const commandContext = useMemo(
    () => ({
      activeTab,
      closeActiveTab: () => {
        if (activeTabId) {
          closeTab(activeTabId);
        }
      },
      focusCurrentFileSearch: () => {
        searchInputRef.current?.focus();
      },
      focusPalette: () => {
        setPaletteOpen(true);
      },
      focusWorkspaceSearch: () => {
        setSidebarOpen(true);
        setSidebarMode("search");
        workspaceSearchInputRef.current?.focus();
      },
      openFilePicker: async () => {
        const picked = await open({
          directory: false,
          multiple: false,
        });
        if (typeof picked === "string") {
          await handleOpenFile(picked);
        }
      },
      openFolderPicker: async () => {
        const picked = await open({
          directory: true,
          multiple: false,
        });
        if (typeof picked === "string") {
          await handleOpenFolder(picked);
        }
      },
      openGitHubSettings: () => {
        setSettingsOpen(true);
        setGithubStatus(settings.github.connected ? `Connected as ${settings.github.username}.` : null);
      },
      openSettings: () => setSettingsOpen(true),
      saveActiveTab: async () => {
        await handleSaveActiveTab();
      },
      togglePalette: () => {
        setPaletteOpen((previous) => !previous);
      },
      toggleSidebar: () => {
        setSidebarOpen(!isSidebarOpen);
      },
      workspaceRoot: workspace.rootPath,
    }),
    [
      activeTab,
      activeTabId,
      closeTab,
      isSidebarOpen,
      setPaletteOpen,
      setSettingsOpen,
      setSidebarMode,
      setSidebarOpen,
      settings.github.connected,
      settings.github.username,
      workspace.rootPath,
    ],
  );

  const workspaceFiles = useMemo(() => flattenFileTree(fileTree), [fileTree]);

  const commands = useMemo(() => {
    const providers = [createCoreCommands, ...extensionRegistry.getCommandProviders()];
    return providers.flatMap((provider) => provider(commandContext));
  }, [commandContext]);

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const query = deferredPaletteQuery.trim().toLowerCase();
    const commandItems = commands.filter((command) => {
      const haystack = [command.id, command.title, ...(command.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return !query || haystack.includes(query);
    });

    const fileItems = workspaceFiles
      .filter((node) => {
        const haystack = `${node.name} ${node.path}`.toLowerCase();
        return query.length > 0 && haystack.includes(query);
      })
      .slice(0, 24);

    return [
      ...fileItems.map((file) => ({ file, kind: "file" as const })),
      ...commandItems.map((command) => ({ command, kind: "command" as const })),
    ].slice(0, 36);
  }, [commands, deferredPaletteQuery, workspaceFiles]);

  const inFileResults = useMemo(() => {
    if (!activeTab || !currentFileQuery.trim()) {
      return [];
    }

    const needle = currentFileQuery.toLowerCase();
    const results: SearchResult[] = [];

    activeTab.content.split("\n").forEach((line, index) => {
      const column = line.toLowerCase().indexOf(needle);
      if (column >= 0) {
        results.push({
          column: column + 1,
          filePath: activeTab.path || activeTab.name,
          line: index + 1,
          preview: line.trim(),
        });
      }
    });

    return results.slice(0, 80);
  }, [activeTab, currentFileQuery]);

  const handleEditorMount: OnMount = (instance) => {
    editorRef.current = instance;
    setCursorStatus(instance.getPosition() ?? { column: 1, lineNumber: 1 });
    instance.onDidChangeCursorPosition((event) => {
      setCursorStatus(event.position);
    });
    instance.focus();
  };

  useEffect(() => {
    void loadSettings()
      .then((loaded) => {
        setSettings(loaded);
        if (loaded.workspace.rootPath) {
          void restoreWorkspace(loaded.workspace.rootPath, loaded.workspace.expandedNodes);
        }
      })
      .finally(() => setSettingsLoaded(true));
  }, [setSettings]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen("native-menu-settings", () => setSettingsOpen(true)).then((handler) => {
      unlisten = handler;
    });

    return () => unlisten?.();
  }, [setSettingsOpen]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void listen<string>("native-menu-command", (event) => {
      void handleNativeMenuCommand(event.payload);
    }).then((handler) => {
      unlisten = handler;
    });

    return () => unlisten?.();
  }, [activeTabId, commandContext, isSidebarOpen, settings, tabs, workspace.rootPath]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    if (
      settings.workspace.rootPath === workspace.rootPath &&
      arraysEqual(settings.workspace.expandedNodes, workspace.expandedNodes)
    ) {
      return;
    }

    setSettings({
      ...settings,
      workspace: {
        expandedNodes: workspace.expandedNodes,
        rootPath: workspace.rootPath,
      },
    });
  }, [settings, settingsLoaded, setSettings, workspace.expandedNodes, workspace.rootPath]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveSettings(settings);
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [settings, settingsLoaded]);

  useEffect(() => {
    if (!workspace.rootPath) {
      setWorkspaceSearch("", []);
      return;
    }

    const query = deferredWorkspaceQuery.trim();
    if (!query) {
      setWorkspaceSearch("", []);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void searchInWorkspace(query, workspace.rootPath!).then((results) => setWorkspaceSearch(query, results));
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [deferredWorkspaceQuery, setWorkspaceSearch, workspace.rootPath]);

  useEffect(() => {
    if (!activeTab || !activeTab.path || !settings.autosave || !activeTab.dirty) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void handleSaveActiveTab();
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, settings.autosave]);

  useEffect(() => {
    if (isPaletteOpen) {
      paletteInputRef.current?.focus();
    }
  }, [isPaletteOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        setWorkspaceMenu(null);
        setFileAction(null);
        setPaletteOpen(false);
        setSettingsOpen(false);
      }

      if (!modifier) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "p") {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (key === "s") {
        event.preventDefault();
        void handleSaveActiveTab();
      } else if (key === "o" && event.shiftKey) {
        event.preventDefault();
        void commandContext.openFolderPicker();
      } else if (key === "o") {
        event.preventDefault();
        void commandContext.openFilePicker();
      } else if (event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      } else if (key === "f" && event.shiftKey) {
        event.preventDefault();
        setSidebarOpen(true);
        setSidebarMode("search");
        workspaceSearchInputRef.current?.focus();
      } else if (key === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandContext, setPaletteOpen, setSettingsOpen, setSidebarMode, setSidebarOpen]);

  useEffect(() => {
    const closeWorkspaceMenu = () => setWorkspaceMenu(null);
    window.addEventListener("click", closeWorkspaceMenu);
    window.addEventListener("resize", closeWorkspaceMenu);

    return () => {
      window.removeEventListener("click", closeWorkspaceMenu);
      window.removeEventListener("resize", closeWorkspaceMenu);
    };
  }, []);

  function startSidebarResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      setSidebarWidth(Math.min(440, Math.max(180, startWidth + moveEvent.clientX - startX)));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function openWorkspaceMenu(event: MouseEvent<HTMLElement>, node: FileNode) {
    event.preventDefault();
    event.stopPropagation();
    setWorkspaceMenu({
      kind: node.isDir ? "folder" : "file",
      node,
      x: Math.min(event.clientX, window.innerWidth - 236),
      y: Math.min(event.clientY, window.innerHeight - (node.isDir ? 240 : 164)),
    });
  }

  async function runWorkspaceAction(action: () => Promise<void>) {
    setWorkspaceMenu(null);
    try {
      await action();
      await refreshWorkspace();
      setOpenError(null);
    } catch (error) {
      setOpenError(String(error));
    }
  }

  function startCreateFile(folderPath?: string | null) {
    if (!folderPath) {
      setOpenError("Open a workspace first, then press + to create a file in it.");
      return;
    }

    setWorkspaceMenu(null);
    setFileAction({
      mode: "create-file",
      targetPath: folderPath,
      title: "New File",
      value: "",
    });
  }

  function startCreateFolder(folderPath: string) {
    setWorkspaceMenu(null);
    setFileAction({
      mode: "create-folder",
      targetPath: folderPath,
      title: "New Folder",
      value: "",
    });
  }

  function startRenameWorkspaceNode(node: FileNode) {
    const currentName = node.path.split("/").pop() ?? node.name;

    setWorkspaceMenu(null);
    setFileAction({
      mode: "rename",
      node,
      targetPath: parentPath(node.path),
      title: `Rename ${node.isDir ? "Folder" : "File"}`,
      value: currentName,
    });
  }

  async function submitFileAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fileAction) {
      return;
    }

    const name = fileAction.value.trim();
    if (!isSafeNodeName(name)) {
      setOpenError("Use a file/folder name without slashes.");
      return;
    }

    try {
      if (fileAction.mode === "create-file") {
        const nextPath = joinPath(fileAction.targetPath, name);
        await createTextFile(nextPath);
        await refreshWorkspace();
        await handleOpenFile(nextPath);
      } else if (fileAction.mode === "create-folder") {
        const nextPath = joinPath(fileAction.targetPath, name);
        await createDirectory(nextPath);
        await refreshWorkspace();
        if (!workspace.expandedNodes.includes(fileAction.targetPath)) {
          toggleNode(fileAction.targetPath);
        }
      } else if (fileAction.node) {
        const currentName = fileAction.node.path.split("/").pop() ?? fileAction.node.name;
        if (name !== currentName) {
          const nextPath = joinPath(fileAction.targetPath, name);
          await renamePath(fileAction.node.path, nextPath);
          await refreshWorkspace();
          if (!fileAction.node.isDir) {
            await handleOpenFile(nextPath);
          }
        }
      }

      setFileAction(null);
      setOpenError(null);
    } catch (error) {
      setOpenError(String(error));
    }
  }

  async function deleteWorkspaceNode(node: FileNode) {
    const message = node.isDir
      ? `Delete folder "${node.name}" and everything inside it?`
      : `Delete file "${node.name}"?`;
    if (!confirm(message)) {
      return;
    }

    await deletePath(node.path);
  }

  return (
    <main
      className={`app-shell theme-${settings.theme} ${isSidebarOpen ? "" : "sidebar-collapsed"}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <section className="utility-bar" aria-hidden="true">
        <input
          ref={searchInputRef}
          className="utility-input"
          tabIndex={-1}
          value={currentFileQuery}
          onChange={(event) => setCurrentFileQuery(event.currentTarget.value)}
          placeholder="Find in current file"
        />
        <input
          ref={workspaceSearchInputRef}
          className="utility-input"
          tabIndex={-1}
          value={workspaceQuery}
          onChange={(event) => {
            setSidebarOpen(true);
            setSidebarMode("search");
            setWorkspaceQuery(event.currentTarget.value);
          }}
          placeholder="Search in workspace"
        />
      </section>

      <section className="layout">
        {isSidebarOpen ? (
          <aside className="sidebar">
            <div className="sidebar-header">
              <button className={sidebarMode === "explorer" ? "active" : ""} onClick={() => setSidebarMode("explorer")}>
                Explorer
              </button>
              <button className={sidebarMode === "search" ? "active" : ""} onClick={() => setSidebarMode("search")}>
                Search
              </button>
              <button className="sidebar-collapse" title="Hide sidebar" onClick={() => setSidebarOpen(false)}>
                ‹
              </button>
            </div>

            {sidebarMode === "explorer" ? (
              <div className="sidebar-section">
                <p className="section-label">Workspace</p>
                {fileTree ? (
                  <TreeNode
                    expandedNodes={workspace.expandedNodes}
                    node={fileTree}
                    onContextMenu={openWorkspaceMenu}
                    onOpenFile={handleOpenFile}
                    onToggleNode={toggleNode}
                  />
                ) : (
                  <p className="empty-copy">Open a local folder to browse files.</p>
                )}

                {settings.recentFolders.length > 0 ? (
                  <>
                    <p className="section-label">Recent Folders</p>
                    <div className="recent-list">
                      {settings.recentFolders.map((path) => (
                        <button key={path} className="recent-item" onClick={() => void handleOpenFolder(path)}>
                          {path}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="sidebar-section">
                <p className="section-label">Workspace Results</p>
                {workspaceResults.length > 0 ? (
                  <div className="search-results">
                    {workspaceResults.map((result) => (
                      <button
                        key={`${result.filePath}:${result.line}:${result.column}`}
                        className="search-result"
                        onClick={() => void handleOpenFile(result.filePath)}
                      >
                        <strong>{result.filePath.split("/").pop()}</strong>
                        <span>{`${result.line}:${result.column} ${result.preview}`}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">Type a query to search the current workspace.</p>
                )}
              </div>
            )}
            <div className="sidebar-resizer" role="separator" aria-orientation="vertical" onPointerDown={startSidebarResize} />
          </aside>
        ) : (
          <button className="sidebar-rail" title="Show sidebar" onClick={() => setSidebarOpen(true)}>
            Explorer
          </button>
        )}

        <section className="editor-panel">
          <div className="tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab ${tab.id === activeTabId ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                onAuxClick={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                    closeTab(tab.id);
                  }
                }}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                  }
                }}
              >
                <span>{tab.name}</span>
                {tab.dirty ? <em>•</em> : null}
                <span
                  className="tab-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  ×
                </span>
              </button>
            ))}
            <button className="new-tab-button" title="New File" onClick={createUntitledTab}>
              +
            </button>
          </div>

          <div className="editor-body">
            {openError ? (
              <button className="open-error" onClick={() => setOpenError(null)}>
                {openError}
              </button>
            ) : null}
            {activeTab ? (
              <>
                <Editor
                  beforeMount={configureMonaco}
                  height="100%"
                  language={activeTab.language}
                  onChange={(value) => updateActiveTabContent(value ?? "")}
                  onMount={handleEditorMount}
                  options={{
                    automaticLayout: true,
                    fontFamily: settings.fontFamily,
                    fontSize: settings.fontSize,
                    minimap: { enabled: true, renderCharacters: false, showSlider: "mouseover" },
                    scrollBeyondLastLine: false,
                    scrollbar: {
                      alwaysConsumeMouseWheel: false,
                      horizontal: settings.wordWrap === "off" ? "auto" : "hidden",
                      horizontalScrollbarSize: 8,
                      vertical: "hidden",
                    },
                    tabSize: settings.tabSize,
                    wordWrap: settings.wordWrap,
                  }}
                  path={activeTab.path || activeTab.id}
                  theme={settings.theme === "paper" ? "pptext-paper" : "pptext-sublime"}
                  value={activeTab.content}
                />
                <div className="inline-results">
                  {inFileResults.slice(0, 8).map((result) => (
                    <button
                      key={`${result.line}:${result.column}`}
                      className="inline-result"
                      onClick={() => {
                        editorRef.current?.setPosition({ column: result.column, lineNumber: result.line });
                        editorRef.current?.revealLineInCenter(result.line);
                        editorRef.current?.focus();
                      }}
                    >
                      <span>{`${result.line}:${result.column}`}</span>
                      <span>{result.preview}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="welcome-state">
                <div className="welcome-card">
                  <p className="eyebrow">Focused editing starts here</p>
                  <h1>Open a workspace and keep your hands on the keyboard.</h1>
                  <p>
                    PPText Editor includes Monaco-powered editing, local workspaces, command palette,
                    persistent settings, recent sessions, and fast text search out of the box.
                  </p>
                  <div className="welcome-actions">
                    <button onClick={() => void commandContext.openFolderPicker()}>Open Folder</button>
                    <button onClick={() => void commandContext.openFilePicker()}>Open File</button>
                  </div>
                  {settings.recentFiles.length > 0 ? (
                    <div className="recent-list">
                      {settings.recentFiles.map((path) => (
                        <button key={path} className="recent-item" onClick={() => void handleOpenFile(path)}>
                          {path}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <footer className="status-bar">
            <span>{activeTab ? activeTab.path || activeTab.name : "No active file"}</span>
            <span>{`Ln ${cursorStatus.lineNumber}, Col ${cursorStatus.column}`}</span>
            <span>{activeTab?.language ?? "plaintext"}</span>
            <span>{`Spaces: ${settings.tabSize}`}</span>
            <span>{settings.autosave ? "Autosave on" : "Manual save"}</span>
            <span>{settings.theme}</span>
          </footer>
        </section>
      </section>

      {isPaletteOpen ? (
        <div className="overlay" onClick={() => setPaletteOpen(false)}>
          <div className="palette" onClick={(event) => event.stopPropagation()}>
            <input
              ref={paletteInputRef}
              className="palette-input"
              value={paletteQuery}
              onChange={(event) => setPaletteQuery(event.currentTarget.value)}
              placeholder="Run a command"
            />
            <div className="palette-results">
              {paletteItems.map((item) =>
                item.kind === "file" ? (
                  <button
                    key={item.file.path}
                    className="palette-item file-palette-item"
                    onClick={() => {
                      void handleOpenFile(item.file.path);
                      setPaletteOpen(false);
                      setPaletteQuery("");
                    }}
                  >
                    <strong>{item.file.name}</strong>
                    <span>{trimPath(item.file.path, workspace.rootPath)}</span>
                  </button>
                ) : (
                  <button
                    key={item.command.id}
                    className="palette-item"
                    onClick={() => {
                      void item.command.run(commandContext);
                      setPaletteOpen(false);
                      setPaletteQuery("");
                    }}
                  >
                    <strong>{item.command.title}</strong>
                    <span>{item.command.shortcut ?? item.command.id}</span>
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      ) : null}

      {workspaceMenu ? (
        <div
          className="workspace-context-menu"
          style={{ left: workspaceMenu.x, top: workspaceMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {workspaceMenu.kind === "folder" ? (
            <>
              <button onClick={() => startCreateFile(workspaceMenu.node.path)}>New File</button>
              <button onClick={() => startRenameWorkspaceNode(workspaceMenu.node)}>Rename...</button>
              <button onClick={() => void runWorkspaceAction(() => handleOpenFolder(workspaceMenu.node.path))}>Open Folder...</button>
              <button onClick={() => void runWorkspaceAction(() => copyText(workspaceMenu.node.path))}>Copy Path</button>
              <hr />
              <button onClick={() => startCreateFolder(workspaceMenu.node.path)}>New Folder...</button>
              <button onClick={() => void runWorkspaceAction(() => deleteWorkspaceNode(workspaceMenu.node))}>Delete Folder</button>
              <button
                onClick={() => {
                  setWorkspaceMenu(null);
                  setSidebarMode("search");
                  setSidebarOpen(true);
                  workspaceSearchInputRef.current?.focus();
                }}
              >
                Find in Folder...
              </button>
            </>
          ) : (
            <>
              <button onClick={() => startRenameWorkspaceNode(workspaceMenu.node)}>Rename...</button>
              <button onClick={() => void runWorkspaceAction(() => deleteWorkspaceNode(workspaceMenu.node))}>Delete File</button>
              <button onClick={() => void runWorkspaceAction(() => revealItemInDir(workspaceMenu.node.path))}>Reveal in Finder</button>
              <button onClick={() => void runWorkspaceAction(() => copyText(workspaceMenu.node.path))}>Copy Path</button>
            </>
          )}
        </div>
      ) : null}

      {fileAction ? (
        <div className="file-action-overlay" onClick={() => setFileAction(null)}>
          <form className="file-action-dialog" onSubmit={submitFileAction} onClick={(event) => event.stopPropagation()}>
            <div>
              <strong>{fileAction.title}</strong>
              <span>{trimPath(fileAction.targetPath, workspace.rootPath)}</span>
            </div>
            <input
              autoFocus
              value={fileAction.value}
              placeholder={fileAction.mode === "create-folder" ? "folder-name" : "filename.ts"}
              onChange={(event) => setFileAction({ ...fileAction, value: event.currentTarget.value })}
            />
            <div className="file-action-buttons">
              <button type="button" onClick={() => setFileAction(null)}>
                Cancel
              </button>
              <button type="submit">{fileAction.mode === "rename" ? "Rename" : "Create"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <div>
                <strong>Preferences: Color Scheme</strong>
                <span>Select a color scheme</span>
              </div>
              <button onClick={() => setSettingsOpen(false)}>Esc</button>
            </div>

            <div className="theme-list" role="listbox" aria-label="Color scheme">
              <button
                className={`theme-option ${settings.theme === "sublime" ? "active" : ""}`}
                onClick={() => setSettings({ ...settings, theme: "sublime" })}
              >
                <span className="scheme-preview scheme-preview-sublime">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <strong>Monokai (Sublime)</strong>
                  <em>Classic Sublime Text dark scheme</em>
                </span>
              </button>
              <button
                className={`theme-option ${settings.theme === "paper" ? "active" : ""}`}
                onClick={() => setSettings({ ...settings, theme: "paper" })}
              >
                <span className="scheme-preview scheme-preview-paper">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <strong>Breakers / Light</strong>
                  <em>Soft light scheme for bright rooms</em>
                </span>
              </button>
            </div>

            <div className="settings-grid">
              <label>
                Font Face
                <select
                  value={settings.fontFamily}
                  onChange={(event) => setSettings({ ...settings, fontFamily: event.currentTarget.value })}
                >
                  {FONT_FACE_OPTIONS.includes(settings.fontFamily) ? null : (
                    <option value={settings.fontFamily}>{settings.fontFamily}</option>
                  )}
                  {FONT_FACE_OPTIONS.map((fontFace) => (
                    <option key={fontFace} value={fontFace}>
                      {fontFace}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Font Size: {settings.fontSize}
                <input
                  max={24}
                  min={12}
                  type="range"
                  value={settings.fontSize}
                  onChange={(event) => setSettings({ ...settings, fontSize: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                Tab Size: {settings.tabSize}
                <input
                  max={8}
                  min={2}
                  type="range"
                  value={settings.tabSize}
                  onChange={(event) => setSettings({ ...settings, tabSize: Number(event.currentTarget.value) })}
                />
              </label>
              <label>
                Word Wrap
                <select
                  value={settings.wordWrap}
                  onChange={(event) => setSettings({ ...settings, wordWrap: event.currentTarget.value as "on" | "off" })}
                >
                  <option value="off">Off</option>
                  <option value="on">On</option>
                </select>
              </label>
            </div>

            <label className="autosave-card">
              <span>
                <strong>Autosave</strong>
                <em>Save the active file automatically shortly after edits settle.</em>
              </span>
              <span className="autosave-control">
                <input
                  checked={settings.autosave}
                  type="checkbox"
                  onChange={(event) => setSettings({ ...settings, autosave: event.currentTarget.checked })}
                />
                <b>{settings.autosave ? "On" : "Off"}</b>
              </span>
            </label>

            <section className="github-panel">
              <div>
                <strong>GitHub</strong>
                <span>
                  {settings.github.connected
                    ? `Connected as ${settings.github.username}`
                    : "Connect with a personal access token to prepare GitHub-powered workflows."}
                </span>
              </div>
              <label>
                Personal Access Token
                <input
                  type="password"
                  value={githubTokenDraft}
                  placeholder={settings.github.connected ? "Connected token saved locally" : "github_pat_..."}
                  onChange={(event) => setGithubTokenDraft(event.currentTarget.value)}
                />
              </label>
              <div className="github-actions">
                <button onClick={() => void handleConnectGitHub()}>
                  {settings.github.connected ? "Reconnect GitHub" : "Connect GitHub"}
                </button>
                {settings.github.connected ? <button onClick={handleDisconnectGitHub}>Disconnect</button> : null}
              </div>
              {githubStatus ? <p>{githubStatus}</p> : null}
            </section>
          </div>
        </div>
      ) : null}
    </main>
  );
}

type PaletteItem =
  | {
      command: CommandDefinition;
      kind: "command";
    }
  | {
      file: FileNode;
      kind: "file";
    };

type WorkspaceMenuState = {
  kind: "file" | "folder";
  node: FileNode;
  x: number;
  y: number;
};

type FileActionState = {
  mode: "create-file" | "create-folder" | "rename";
  node?: FileNode;
  targetPath: string;
  title: string;
  value: string;
};

function flattenFileTree(root: FileNode | null) {
  if (!root) {
    return [];
  }

  const files: FileNode[] = [];
  const visit = (node: FileNode) => {
    if (node.isDir) {
      node.children.forEach(visit);
      return;
    }

    files.push(node);
  };

  visit(root);
  return files;
}

function trimPath(path: string, rootPath: string | null) {
  if (!rootPath || !path.startsWith(rootPath)) {
    return path;
  }

  return path.slice(rootPath.length + 1);
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isSafeNodeName(name: string) {
  return name.trim().length > 0 && !name.includes("/");
}

function joinPath(parent: string, child: string) {
  return `${parent.replace(/\/$/, "")}/${child.trim()}`;
}

function parentPath(path: string) {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.slice(0, lastSlash) : path;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

type TreeNodeProps = {
  expandedNodes: string[];
  node: FileNode;
  onContextMenu: (event: MouseEvent<HTMLElement>, node: FileNode) => void;
  onOpenFile: (path: string) => Promise<void>;
  onToggleNode: (path: string) => void;
};

function TreeNode({ expandedNodes, node, onContextMenu, onOpenFile, onToggleNode }: TreeNodeProps) {
  const isExpanded = expandedNodes.includes(node.path);

  if (!node.isDir) {
    return (
      <button className="tree-node file-node" onClick={() => void onOpenFile(node.path)} onContextMenu={(event) => onContextMenu(event, node)}>
        {node.name}
      </button>
    );
  }

  return (
    <div className="tree-group">
      <button className="tree-node folder-node" onClick={() => onToggleNode(node.path)} onContextMenu={(event) => onContextMenu(event, node)}>
        <span>{isExpanded ? "▾" : "▸"}</span>
        <span>{node.name}</span>
      </button>
      {isExpanded ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              expandedNodes={expandedNodes}
              node={child}
              onContextMenu={onContextMenu}
              onOpenFile={onOpenFile}
              onToggleNode={onToggleNode}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default App;
