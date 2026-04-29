import { create } from "zustand";
import type { AppSettings, EditorTab, FileNode, SearchResult, SidebarMode, WorkspaceState } from "../types";

type AppStore = {
  currentFileQuery: string;
  fileTree: FileNode | null;
  isPaletteOpen: boolean;
  isSettingsOpen: boolean;
  isSidebarOpen: boolean;
  settings: AppSettings;
  sidebarMode: SidebarMode;
  tabs: EditorTab[];
  workspace: WorkspaceState;
  workspaceQuery: string;
  workspaceResults: SearchResult[];
  closeTab: (tabId: string) => void;
  markTabSaved: (tabId: string, savedTab?: Pick<EditorTab, "id" | "language" | "name" | "path">) => void;
  openTab: (tab: EditorTab) => void;
  setActiveTab: (tabId: string) => void;
  setCurrentFileQuery: (query: string) => void;
  setFileTree: (tree: FileNode | null) => void;
  setPaletteOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  setSettings: (settings: AppSettings) => void;
  setSettingsOpen: (next: boolean) => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setSidebarOpen: (next: boolean) => void;
  setWorkspaceQuery: (query: string) => void;
  setWorkspaceSearch: (query: string, results: SearchResult[]) => void;
  toggleNode: (path: string) => void;
  updateActiveTabContent: (content: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  updateRenamedPath: (previousPath: string, nextPath: string, nextLanguage?: string) => void;
  updateWorkspaceState: (rootPath: string | null, expandedNodes?: string[]) => void;
};

const defaultSettings: AppSettings = {
  autosave: false,
  fontFamily: "JetBrains Mono",
  fontSize: 14,
  github: {
    connected: false,
    token: "",
    username: "",
  },
  workspace: {
    expandedNodes: [],
    rootPath: null,
  },
  recentFiles: [],
  recentFolders: [],
  tabSize: 2,
  theme: "ember",
  wordWrap: "off",
};

export function addExpandedNode(expandedNodes: string[], path: string) {
  return expandedNodes.includes(path)
    ? expandedNodes.filter((entry) => entry !== path)
    : [...expandedNodes, path];
}

export const useAppStore = create<AppStore>((set) => ({
  currentFileQuery: "",
  fileTree: null,
  isPaletteOpen: false,
  isSettingsOpen: false,
  isSidebarOpen: true,
  settings: defaultSettings,
  sidebarMode: "explorer",
  tabs: [],
  workspace: {
    activeTabId: null,
    expandedNodes: [],
    openTabs: [],
    rootPath: null,
  },
  workspaceQuery: "",
  workspaceResults: [],
  closeTab: (tabId) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== tabId);
      const nextActiveTabId =
        state.workspace.activeTabId === tabId ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null) : state.workspace.activeTabId;

      return {
        tabs,
        workspace: {
          ...state.workspace,
          activeTabId: nextActiveTabId,
          openTabs: tabs.map((tab) => tab.id),
        },
      };
    }),
  markTabSaved: (tabId, savedTab) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, ...savedTab, dirty: false, originalContent: tab.content, preview: false } : tab,
      ),
      workspace: savedTab
        ? {
            ...state.workspace,
            activeTabId: savedTab.id,
            openTabs: state.tabs.map((tab) => (tab.id === tabId ? savedTab.id : tab.id)),
          }
        : state.workspace,
    })),
  openTab: (tab) =>
    set((state) => {
      const existing = state.tabs.find((item) => item.id === tab.id);
      if (existing) {
        return {
          tabs: state.tabs,
          workspace: {
            ...state.workspace,
            activeTabId: existing.id,
            openTabs: state.tabs.map((item) => item.id),
          },
        };
      }

      const reusablePreviewTab = tab.preview ? state.tabs.find((item) => item.preview && !item.dirty) : undefined;
      const tabs = reusablePreviewTab
        ? state.tabs.map((item) => (item.id === reusablePreviewTab.id ? { ...tab, dirty: false } : item))
        : [...state.tabs, { ...tab, dirty: false }];

      return {
        tabs,
        workspace: {
          ...state.workspace,
          activeTabId: tab.id,
          openTabs: tabs.map((item) => item.id),
        },
      };
    }),
  setActiveTab: (tabId) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        activeTabId: tabId,
      },
    })),
  setCurrentFileQuery: (currentFileQuery) => set({ currentFileQuery }),
  setFileTree: (fileTree) => set({ fileTree }),
  setPaletteOpen: (next) =>
    set((state) => ({
      isPaletteOpen: typeof next === "function" ? next(state.isPaletteOpen) : next,
    })),
  setSettings: (settings) => set({ settings }),
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
  setWorkspaceQuery: (workspaceQuery) => set({ workspaceQuery }),
  setWorkspaceSearch: (workspaceQuery, workspaceResults) => set({ workspaceQuery, workspaceResults }),
  toggleNode: (path) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        expandedNodes: addExpandedNode(state.workspace.expandedNodes, path),
      },
    })),
  updateActiveTabContent: (content) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.workspace.activeTabId
          ? { ...tab, content, dirty: content !== tab.originalContent }
          : tab,
      ),
    })),
  updateTabContent: (tabId, content) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, content, dirty: content !== tab.originalContent } : tab,
      ),
    })),
  updateRenamedPath: (previousPath, nextPath, nextLanguage) =>
    set((state) => {
      const nextName = nextPath.split("/").pop() ?? nextPath;
      const nextTabs = state.tabs.map((tab) => {
        if (tab.path === previousPath || tab.id === previousPath) {
          return {
            ...tab,
            id: nextPath,
            language: nextLanguage ?? tab.language,
            name: nextName,
            path: nextPath,
          };
        }

        if (!tab.path.startsWith(`${previousPath}/`)) {
          return tab;
        }

        const remappedPath = `${nextPath}${tab.path.slice(previousPath.length)}`;
        return {
          ...tab,
          id: tab.id === tab.path ? remappedPath : tab.id,
          name: remappedPath.split("/").pop() ?? remappedPath,
          path: remappedPath,
        };
      });
      const activeTabId =
        state.workspace.activeTabId === previousPath ||
        state.workspace.activeTabId?.startsWith(`${previousPath}/`)
          ? `${nextPath}${state.workspace.activeTabId.slice(previousPath.length)}`
          : state.workspace.activeTabId;

      return {
        tabs: nextTabs,
        workspace: {
          ...state.workspace,
          activeTabId,
          expandedNodes: state.workspace.expandedNodes.map((entry) =>
            entry === previousPath || entry.startsWith(`${previousPath}/`)
              ? `${nextPath}${entry.slice(previousPath.length)}`
              : entry,
          ),
          openTabs: nextTabs.map((tab) => tab.id),
        },
      };
    }),
  updateWorkspaceState: (rootPath, expandedNodes) =>
    set((state) => ({
      workspace: {
        ...state.workspace,
        expandedNodes: expandedNodes ?? (rootPath ? [rootPath] : []),
        rootPath,
      },
    })),
}));
