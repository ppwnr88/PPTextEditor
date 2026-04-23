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
  recentFiles: [],
  recentFolders: [],
  tabSize: 2,
  theme: "sublime",
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

export function searchInWorkspace(query: string, rootPath: string) {
  return invoke<SearchResult[]>("search_in_workspace", { query, rootPath });
}

export async function loadSettings() {
  try {
    const settings = await invoke<AppSettings>("load_settings");
    const persistedTheme = settings.theme as string;
    return {
      ...defaultSettings,
      ...settings,
      github: {
        ...defaultSettings.github,
        ...(settings.github ?? {}),
      },
      theme: persistedTheme === "midnight" ? "sublime" : settings.theme,
    } as AppSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings) {
  return invoke<void>("save_settings", { settings });
}
