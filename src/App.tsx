import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";
import { createCoreCommands } from "./lib/commands";
import { extensionRegistry } from "./lib/extensions";
import { configureMonaco, getMonacoLanguage } from "./lib/monaco";
import { loadSettings, listDir, readFile, saveSettings, searchInWorkspace, writeFile } from "./lib/tauri";
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

  async function handleOpenFolder(path: string) {
    const root = await listDir(path);
    setFileTree(root);
    updateWorkspaceState(path);
    setSettings({
      ...settings,
      recentFolders: [path, ...settings.recentFolders.filter((entry) => entry !== path)].slice(0, 12),
    });
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

  async function handleSaveActiveTab() {
    if (!activeTab) {
      return;
    }

    await writeFile(activeTab.path, activeTab.content);
    markTabSaved(activeTab.id);
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
          filePath: activeTab.path,
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
      .then((loaded) => setSettings(loaded))
      .finally(() => setSettingsLoaded(true));
  }, [setSettings]);

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
    if (!activeTab || !settings.autosave || !activeTab.dirty) {
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

  return (
    <main className={`app-shell theme-${settings.theme}`}>
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <strong>PPText Editor</strong>
            <span>{activeTab ? activeTab.path : "Ready"}</span>
          </div>
        </div>
        <div className="titlebar-actions">
          <button onClick={() => void commandContext.openFolderPicker()}>Open Folder</button>
          <button onClick={() => void commandContext.openFilePicker()}>Open File</button>
          <button onClick={() => setPaletteOpen(true)}>Goto Anything</button>
          <button onClick={() => setSettingsOpen(true)}>Settings</button>
        </div>
      </header>

      <section className="utility-bar">
        <input
          ref={searchInputRef}
          className="utility-input"
          value={currentFileQuery}
          onChange={(event) => setCurrentFileQuery(event.currentTarget.value)}
          placeholder="Find in current file"
        />
        <input
          ref={workspaceSearchInputRef}
          className="utility-input"
          value={workspaceQuery}
          onChange={(event) => {
            setSidebarOpen(true);
            setSidebarMode("search");
            setWorkspaceQuery(event.currentTarget.value);
          }}
          placeholder="Search in workspace"
        />
        <div className="utility-meta">
          <span>{workspace.rootPath ? workspace.rootPath.split("/").pop() : "No workspace open"}</span>
          <span>{activeTab ? `${inFileResults.length} matches in file` : "Open a file to start editing"}</span>
        </div>
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
            </div>

            {sidebarMode === "explorer" ? (
              <div className="sidebar-section">
                <p className="section-label">Workspace</p>
                {fileTree ? (
                  <TreeNode
                    expandedNodes={workspace.expandedNodes}
                    node={fileTree}
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
          </aside>
        ) : null}

        <section className="editor-panel">
          <div className="tabs">
            {tabs.length === 0 ? (
              <div className="empty-tabs">No file open</div>
            ) : (
              tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`tab ${tab.id === activeTabId ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
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
              ))
            )}
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
                      horizontal: "hidden",
                      vertical: "hidden",
                    },
                    tabSize: settings.tabSize,
                    wordWrap: settings.wordWrap,
                  }}
                  path={activeTab.path}
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
            <span>{activeTab ? activeTab.path : "No active file"}</span>
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

            <label className="checkbox-row">
              <input
                checked={settings.autosave}
                type="checkbox"
                onChange={(event) => setSettings({ ...settings, autosave: event.currentTarget.checked })}
              />
              Save on modified idle
            </label>
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

type TreeNodeProps = {
  expandedNodes: string[];
  node: FileNode;
  onOpenFile: (path: string) => Promise<void>;
  onToggleNode: (path: string) => void;
};

function TreeNode({ expandedNodes, node, onOpenFile, onToggleNode }: TreeNodeProps) {
  const isExpanded = expandedNodes.includes(node.path);

  if (!node.isDir) {
    return (
      <button className="tree-node file-node" onClick={() => void onOpenFile(node.path)}>
        {node.name}
      </button>
    );
  }

  return (
    <div className="tree-group">
      <button className="tree-node folder-node" onClick={() => onToggleNode(node.path)}>
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
