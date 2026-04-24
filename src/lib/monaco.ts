import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

loader.config({ monaco });

const filenameAliases: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
};

export function getMonacoLanguage(path: string) {
  const normalizedPath = path.toLowerCase();
  const basename = normalizedPath.split("/").pop() ?? normalizedPath;
  const filenameMatch = filenameAliases[basename];
  if (filenameMatch) {
    return filenameMatch;
  }

  const match = monaco.languages
    .getLanguages()
    .find((language) =>
      language.extensions?.some((extension) => normalizedPath.endsWith(extension.toLowerCase())),
    );

  return match?.id ?? "plaintext";
}

export function configureMonaco(instance: typeof monaco) {
  instance.editor.defineTheme("pptext-ember", {
    base: "vs-dark",
    inherit: false,
    colors: {
      "editor.background": "#272822",
      "editor.foreground": "#f8f8f2",
      "editorLineNumber.foreground": "#8f908a",
      "editorLineNumber.activeForeground": "#c2c2bf",
      "editor.lineHighlightBackground": "#3e3d32",
      "editorCursor.foreground": "#f8f8f0",
      "editor.selectionBackground": "#49483e",
      "editor.inactiveSelectionBackground": "#3a3a31",
      "editor.wordHighlightBackground": "#57584f",
      "editor.findMatchBackground": "#ffe79255",
      "editor.findMatchHighlightBackground": "#ffe79233",
      "editorIndentGuide.background1": "#3b3a32",
      "editorIndentGuide.activeBackground1": "#70705f",
      "editorWhitespace.foreground": "#464741",
      "minimap.background": "#272822",
      "minimapSlider.background": "#79797933",
      "minimapSlider.hoverBackground": "#79797955",
      "scrollbarSlider.background": "#79797933",
      "scrollbarSlider.hoverBackground": "#79797955",
    },
    rules: [
      { token: "", foreground: "f8f8f2" },
      { token: "comment", foreground: "75715e", fontStyle: "italic" },
      { token: "string", foreground: "e6db74" },
      { token: "number", foreground: "ae81ff" },
      { token: "regexp", foreground: "e6db74" },
      { token: "keyword", foreground: "f92672" },
      { token: "operator", foreground: "f92672" },
      { token: "namespace", foreground: "f8f8f2" },
      { token: "type", foreground: "66d9ef", fontStyle: "italic" },
      { token: "struct", foreground: "66d9ef", fontStyle: "italic" },
      { token: "class", foreground: "a6e22e", fontStyle: "underline" },
      { token: "interface", foreground: "a6e22e" },
      { token: "function", foreground: "a6e22e" },
      { token: "variable", foreground: "f8f8f2" },
      { token: "constant", foreground: "ae81ff" },
      { token: "tag", foreground: "f92672" },
      { token: "attribute.name", foreground: "a6e22e" },
      { token: "attribute.value", foreground: "e6db74" },
      { token: "delimiter", foreground: "f8f8f2" },
    ],
  });

  instance.editor.defineTheme("pptext-paper", {
    base: "vs",
    inherit: true,
    colors: {
      "editor.background": "#fbf7f1",
      "editor.lineHighlightBackground": "#efe7da",
      "editorCursor.foreground": "#a5552a",
      "editor.selectionBackground": "#d8e4f7",
    },
    rules: [],
  });
}
