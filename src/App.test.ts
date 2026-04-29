import { describe, expect, it, vi } from "vitest";
import { replaceEditorSelection } from "./App";

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
