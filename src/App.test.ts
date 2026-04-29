import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App, { replaceEditorSelection } from "./App";
import { useAppStore } from "./store/useAppStore";

vi.mock("@monaco-editor/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    default: (props: {
      defaultValue?: string;
      onChange?: (value?: string) => void;
      onMount?: (editor: unknown) => void;
    }) => {
      const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
      const valueRef = React.useRef(props.defaultValue ?? "");

      React.useEffect(() => {
        props.onMount?.({
          focus: vi.fn(),
          getDomNode: () => textareaRef.current,
          getModel: () => ({
            getValue: () => valueRef.current,
          }),
          getPosition: () => ({ column: 1, lineNumber: 1 }),
          getSelection: () => ({ isEmpty: () => true }),
          onDidChangeCursorPosition: () => ({ dispose: vi.fn() }),
          onKeyDown: () => ({ dispose: vi.fn() }),
        });
      }, []);

      return React.createElement("textarea", {
        "aria-label": "editor",
        defaultValue: props.defaultValue,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
          valueRef.current = event.currentTarget.value;
          props.onChange?.(valueRef.current);
        },
        ref: textareaRef,
      });
    },
    loader: {
      config: vi.fn(),
      init: vi.fn().mockResolvedValue({}),
    },
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: vi.fn(),
    onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}));

afterEach(() => {
  useAppStore.setState({
    currentFileQuery: "",
    fileTree: null,
    isPaletteOpen: false,
    isSettingsOpen: false,
    isSidebarOpen: true,
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
  });
});

describe("tab close prompts", () => {
  it("asks to save when a new tab is typed into and closed immediately", async () => {
    const { container } = render(React.createElement(App));

    fireEvent.click(screen.getByTitle("New File"));
    fireEvent.change(await screen.findByLabelText("editor"), { target: { value: "typing before close" } });
    fireEvent.click(container.querySelector(".tab-close")!);

    await waitFor(() => {
      expect(screen.getByText(/Do you want to save the changes/)).toBeInTheDocument();
    });
  });

  it("asks for confirmation before deleting a workspace file", async () => {
    useAppStore.setState({
      fileTree: {
        children: [
          {
            children: [],
            isDir: false,
            name: "note.txt",
            path: "/workspace/note.txt",
          },
        ],
        isDir: true,
        name: "workspace",
        path: "/workspace",
      },
      workspace: {
        activeTabId: null,
        expandedNodes: ["/workspace"],
        openTabs: [],
        rootPath: "/workspace",
      },
    });

    render(React.createElement(App));

    fireEvent.contextMenu(await screen.findByRole("button", { name: "note.txt" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete File" }));

    expect(await screen.findByText('Delete file "note.txt"?')).toBeInTheDocument();
  });
});

describe("replaceEditorSelection", () => {
  it("replaces a selected range on the first typed character", () => {
    const selection = {
      endColumn: 19,
      endLineNumber: 1,
      isEmpty: () => false,
      getStartPosition: () => ({ column: 1, lineNumber: 1 }),
      positionColumn: 1,
      positionLineNumber: 1,
      selectionStartColumn: 1,
      selectionStartLineNumber: 1,
      startColumn: 1,
      startLineNumber: 1,
    };
    const model = {
      getOffsetAt: () => 0,
      getPositionAt: (offset: number) => ({ column: offset + 1, lineNumber: 1 }),
    };
    const editor = {
      executeEdits: vi.fn(),
      getModel: () => model,
      getSelection: () => selection,
      pushUndoStop: vi.fn(),
      setPosition: vi.fn(),
    };

    replaceEditorSelection(
      editor as unknown as Parameters<typeof replaceEditorSelection>[0],
      "X",
    );

    expect(editor.executeEdits).toHaveBeenCalledWith("selection-replace", [
      {
        forceMoveMarkers: true,
        range: selection,
        text: "X",
      },
    ]);
    expect(editor.setPosition).toHaveBeenCalledWith({ column: 2, lineNumber: 1 });
  });

  it("does nothing when there is no selected range", () => {
    const editor = {
      executeEdits: vi.fn(),
      getModel: () => ({
        getOffsetAt: () => 0,
        getPositionAt: () => ({ column: 1, lineNumber: 1 }),
      }),
      getSelection: () => ({ isEmpty: () => true }),
      pushUndoStop: vi.fn(),
      setPosition: vi.fn(),
    };

    replaceEditorSelection(
      editor as unknown as Parameters<typeof replaceEditorSelection>[0],
      "X",
    );

    expect(editor.executeEdits).not.toHaveBeenCalled();
  });
});
