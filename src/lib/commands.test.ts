import { describe, expect, it, vi } from "vitest";
import { createCoreCommands } from "./commands";
import type { CommandContext } from "../types";

function createContext(): CommandContext {
  return {
    activeTab: null,
    closeActiveTab: vi.fn(),
    focusCurrentFileSearch: vi.fn(),
    focusPalette: vi.fn(),
    focusWorkspaceSearch: vi.fn(),
    openFilePicker: vi.fn(async () => undefined),
    openFolderPicker: vi.fn(async () => undefined),
    openGitHubSettings: vi.fn(),
    openSettings: vi.fn(),
    saveActiveTab: vi.fn(async () => undefined),
    togglePalette: vi.fn(),
    toggleSidebar: vi.fn(),
    workspaceRoot: null,
  };
}

describe("createCoreCommands", () => {
  it("exposes keyboard-first command ids", () => {
    const commands = createCoreCommands(createContext());
    expect(commands.map((command) => command.id)).toEqual(
      expect.arrayContaining(["workspace.openFolder", "editor.save", "ui.commandPalette", "github.connect"]),
    );
  });

  it("runs command handlers through the provided context", async () => {
    const context = createContext();
    const commands = createCoreCommands(context);
    await commands.find((command) => command.id === "editor.save")?.run(context);
    expect(context.saveActiveTab).toHaveBeenCalled();
  });
});
