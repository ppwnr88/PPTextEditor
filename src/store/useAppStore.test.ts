import { describe, expect, it } from "vitest";
import { addExpandedNode } from "./useAppStore";

describe("addExpandedNode", () => {
  it("adds a collapsed node", () => {
    expect(addExpandedNode([], "/workspace")).toEqual(["/workspace"]);
  });

  it("removes an expanded node", () => {
    expect(addExpandedNode(["/workspace"], "/workspace")).toEqual([]);
  });
});
