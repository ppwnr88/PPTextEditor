export type ThemeMode = "sublime" | "paper";
export type SidebarMode = "explorer" | "search";

export type FileNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: FileNode[];
};

export type EditorTab = {
  id: string;
  name: string;
  path: string;
  language: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  preview: boolean;
};

export type WorkspaceState = {
  rootPath: string | null;
  expandedNodes: string[];
  openTabs: string[];
  activeTabId: string | null;
};

export type PersistedWorkspaceState = {
  rootPath: string | null;
  expandedNodes: string[];
};

export type AppSettings = {
  theme: ThemeMode;
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  wordWrap: "on" | "off";
  autosave: boolean;
  github: GitHubConnectionSettings;
  workspace: PersistedWorkspaceState;
  recentFiles: string[];
  recentFolders: string[];
};

export type GitHubConnectionSettings = {
  connected: boolean;
  token: string;
  username: string;
};

export type SearchResult = {
  filePath: string;
  line: number;
  column: number;
  preview: string;
};

export type CommandContext = {
  activeTab: EditorTab | null;
  closeActiveTab: () => void;
  focusCurrentFileSearch: () => void;
  focusPalette: () => void;
  focusWorkspaceSearch: () => void;
  openFilePicker: () => Promise<void>;
  openFolderPicker: () => Promise<void>;
  openGitHubSettings: () => void;
  openSettings: () => void;
  saveActiveTab: () => Promise<void>;
  togglePalette: () => void;
  toggleSidebar: () => void;
  workspaceRoot: string | null;
};

export type CommandDefinition = {
  id: string;
  title: string;
  shortcut?: string;
  keywords?: string[];
  run: (context: CommandContext) => Promise<void> | void;
};
