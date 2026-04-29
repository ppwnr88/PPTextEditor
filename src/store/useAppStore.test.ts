import { describe, expect, it } from "vitest";
import { addExpandedNode, useAppStore } from "./useAppStore";

describe("addExpandedNode", () => {
  it("adds a collapsed node", () => {
    expect(addExpandedNode([], "/workspace")).toEqual(["/workspace"]);
  });

  it("removes an expanded node", () => {
    expect(addExpandedNode(["/workspace"], "/workspace")).toEqual([]);
  });
});

describe("updateRenamedPath", () => {
  it("keeps an open file in the same tab after rename", () => {
    useAppStore.setState({
      tabs: [
        {
          content: "hello",
          dirty: false,
          id: "/workspace/old.txt",
          language: "plaintext",
          name: "old.txt",
          originalContent: "hello",
          path: "/workspace/old.txt",
          preview: false,
        },
      ],
      workspace: {
        activeTabId: "/workspace/old.txt",
        expandedNodes: ["/workspace"],
        openTabs: ["/workspace/old.txt"],
        rootPath: "/workspace",
      },
    });

    useAppStore.getState().updateRenamedPath("/workspace/old.txt", "/workspace/new.md", "markdown");

    expect(useAppStore.getState().tabs).toMatchObject([
      {
        id: "/workspace/new.md",
        language: "markdown",
        name: "new.md",
        path: "/workspace/new.md",
      },
    ]);
    expect(useAppStore.getState().workspace.activeTabId).toBe("/workspace/new.md");
    expect(useAppStore.getState().workspace.openTabs).toEqual(["/workspace/new.md"]);
  });

  it("remaps open child files when a folder is renamed", () => {
    useAppStore.setState({
      tabs: [
        {
          content: "hello",
          dirty: false,
          id: "/workspace/docs/readme.md",
          language: "markdown",
          name: "readme.md",
          originalContent: "hello",
          path: "/workspace/docs/readme.md",
          preview: false,
        },
      ],
      workspace: {
        activeTabId: "/workspace/docs/readme.md",
        expandedNodes: ["/workspace", "/workspace/docs"],
        openTabs: ["/workspace/docs/readme.md"],
        rootPath: "/workspace",
      },
    });

    useAppStore.getState().updateRenamedPath("/workspace/docs", "/workspace/notes");

    expect(useAppStore.getState().tabs[0].path).toBe("/workspace/notes/readme.md");
    expect(useAppStore.getState().workspace.activeTabId).toBe("/workspace/notes/readme.md");
    expect(useAppStore.getState().workspace.expandedNodes).toEqual(["/workspace", "/workspace/notes"]);
  });
});
