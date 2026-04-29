import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") {
      return new jsonWorker();
    }

    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }

    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }

    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }

    return new editorWorker();
  },
};

loader.config({ monaco });

export function preloadMonaco() {
  return loader.init();
}

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
      "editor.background": "#282923",
      "editor.foreground": "#e8e8df",
      "editorLineNumber.foreground": "#7d7e75",
      "editorLineNumber.activeForeground": "#b9b9b1",
      "editor.lineHighlightBackground": "#34352d",
      "editorCursor.foreground": "#f3f1df",
      "editor.selectionBackground": "#515248",
      "editor.inactiveSelectionBackground": "#3d3e36",
      "editor.wordHighlightBackground": "#52534a",
      "editor.findMatchBackground": "#ffe79255",
      "editor.findMatchHighlightBackground": "#ffe79233",
      "editorIndentGuide.background1": "#3a3a32",
      "editorIndentGuide.activeBackground1": "#676756",
      "editorWhitespace.foreground": "#42433c",
      "minimap.background": "#282923",
      "minimapSlider.background": "#79797933",
      "minimapSlider.hoverBackground": "#79797955",
      "scrollbarSlider.background": "#79797933",
      "scrollbarSlider.hoverBackground": "#79797955",
    },
    rules: [
      { token: "", foreground: "e8e8df" },
      { token: "comment", foreground: "75715e", fontStyle: "italic" },
      { token: "string", foreground: "e6db74" },
      { token: "number", foreground: "ae81ff" },
      { token: "regexp", foreground: "e6db74" },
      { token: "keyword", foreground: "f92672" },
      { token: "operator", foreground: "f92672" },
      { token: "namespace", foreground: "e8e8df" },
      { token: "type", foreground: "66d9ef", fontStyle: "italic" },
      { token: "struct", foreground: "66d9ef", fontStyle: "italic" },
      { token: "class", foreground: "a6e22e", fontStyle: "underline" },
      { token: "interface", foreground: "a6e22e" },
      { token: "function", foreground: "a6e22e" },
      { token: "variable", foreground: "e8e8df" },
      { token: "constant", foreground: "ae81ff" },
      { token: "tag", foreground: "f92672" },
      { token: "attribute.name", foreground: "a6e22e" },
      { token: "attribute.value", foreground: "e6db74" },
      { token: "delimiter", foreground: "e8e8df" },
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
