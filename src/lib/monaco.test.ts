import { describe, expect, it } from "vitest";
import { getMonacoLanguage } from "./monaco";

describe("getMonacoLanguage", () => {
  it("uses Monaco language registry extensions", () => {
    expect(getMonacoLanguage("/tmp/example.tsx")).toBe("typescript");
    expect(getMonacoLanguage("/tmp/example.rs")).toBe("rust");
    expect(getMonacoLanguage("/tmp/example.unknown-extension")).toBe("plaintext");
  });

  it("detects well-known extensionless filenames", () => {
    expect(getMonacoLanguage("/tmp/Dockerfile")).toBe("dockerfile");
  });
});
