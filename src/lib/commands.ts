import type { CommandContext, CommandDefinition } from "../types";

export function createCoreCommands(context: CommandContext): CommandDefinition[] {
  return [
    {
      id: "workspace.openFolder",
      keywords: ["project", "folder", "workspace"],
      run: () => context.openFolderPicker(),
      shortcut: "Cmd+Shift+O",
      title: "Open Folder",
    },
    {
      id: "workspace.openFile",
      keywords: ["file", "buffer"],
      run: () => context.openFilePicker(),
      shortcut: "Cmd+O",
      title: "Open File",
    },
    {
      id: "editor.save",
      keywords: ["write", "save"],
      run: () => context.saveActiveTab(),
      shortcut: "Cmd+S",
      title: "Save Active File",
    },
    {
      id: "editor.find",
      keywords: ["search", "find"],
      run: () => context.focusCurrentFileSearch(),
      shortcut: "Cmd+F",
      title: "Focus Find in Current File",
    },
    {
      id: "workspace.find",
      keywords: ["search", "grep", "find in files"],
      run: () => context.focusWorkspaceSearch(),
      shortcut: "Cmd+Shift+F",
      title: "Find in Files",
    },
    {
      id: "ui.commandPalette",
      keywords: ["palette", "command", "quick open"],
      run: () => context.togglePalette(),
      shortcut: "Cmd+P",
      title: "Toggle Command Palette",
    },
    {
      id: "ui.settings",
      keywords: ["preferences", "theme", "font"],
      run: () => context.openSettings(),
      shortcut: "Cmd+,",
      title: "Open Settings",
    },
    {
      id: "ui.sidebar",
      keywords: ["explorer", "sidebar"],
      run: () => context.toggleSidebar(),
      title: "Toggle Sidebar",
    },
    {
      id: "editor.closeTab",
      keywords: ["close", "tab"],
      run: () => context.closeActiveTab(),
      title: "Close Active Tab",
    },
  ];
}
