import { invoke } from "@tauri-apps/api/core";
import type { AppSettings, FileNode, SearchResult } from "../types";

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

export function listDir(path: string) {
  return invoke<FileNode>("list_dir", { path });
}

export function readFile(path: string) {
  return invoke<string>("read_text_file", { path });
}

export function writeFile(path: string, content: string) {
  return invoke<void>("write_file", { content, path });
}

export function createTextFile(path: string) {
  return invoke<void>("create_text_file", { path });
}

export function createDirectory(path: string) {
  return invoke<void>("create_directory", { path });
}

export function renamePath(path: string, newPath: string) {
  return invoke<void>("rename_path", { newPath, path });
}

export function deletePath(path: string) {
  return invoke<void>("delete_path", { path });
}

export function searchInWorkspace(query: string, rootPath: string) {
  return invoke<SearchResult[]>("search_in_workspace", { query, rootPath });
}

export function createPrintPreview(name: string, html: string) {
  return invoke<string>("create_print_preview", { html, name });
}

export async function loadSettings() {
  try {
    const settings = await invoke<AppSettings>("load_settings");
    const persistedTheme = settings.theme as string;
    const legacyDarkTheme = "sub" + "lime";
    return {
      ...defaultSettings,
      ...settings,
      github: {
        ...defaultSettings.github,
        ...(settings.github ?? {}),
      },
      workspace: {
        ...defaultSettings.workspace,
        ...(settings.workspace ?? {}),
      },
      theme: persistedTheme === "midnight" || persistedTheme === legacyDarkTheme ? "ember" : settings.theme,
    } as AppSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings) {
  return invoke<void>("save_settings", { settings });
}
