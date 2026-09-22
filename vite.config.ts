import { defineConfig } from "vite-plus";

export default defineConfig({
  root: "playground",
  server: {
    open: true,
  },
  lint: {
    // playground/public/* are raw sample assets served to (and previewed by)
    // the viewer, not part of the TypeScript project (sample.ts imports the
    // package by name for display only).
    ignorePatterns: ["dist/**", "node_modules/**", "playground/public/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["dist/**", "node_modules/**"],
  },
  pack: {
    // Raw-ESM dist must stay browser-pure (ADR-1/ADR-7): no `node:` builtins
    // may survive in the emitted graph — SheetJS's guarded `require("fs")`
    // shims would otherwise drag in a createRequire interop at module scope.
    platform: "browser",
    // Keep the packaging contract (package.json exports, raw-ESM docs).
    outExtensions: () => ({ js: ".mjs", dts: ".d.mts" }),
    // jszip (docx-preview / pptx-renderer dep) is CJS with Node streaming
    // deps whose bundling drags in `node:` builtins — use its self-contained
    // browser build instead (raw-ESM dist must stay browser-pure, ADR-7).
    alias: {
      jszip: "jszip/dist/jszip.min.js",
    },
    // Ship pdf.js, the text pipeline (marked/DOMPurify/hljs) and the office
    // engines (docx-preview/SheetJS/pptx-renderer, ADR-7) inside the lazy
    // chunks so the built artifact works in bundler-managed apps, CDN-direct
    // and raw-ESM contexts alike. Subpath imports are matched literally by
    // the packer, hence the explicit list.
    deps: {
      alwaysBundle: [
        "pdfjs-dist",
        "marked",
        "dompurify",
        "highlight.js/lib/core",
        "docx-preview",
        "xlsx",
        "@aiden0z/pptx-renderer",
        "jszip",
        "echarts/core",
        "echarts/charts",
        "echarts/components",
        "echarts/features",
        "echarts/renderers",
        ...[
          "bash",
          "c",
          "cpp",
          "csharp",
          "css",
          "diff",
          "dockerfile",
          "go",
          "graphql",
          "ini",
          "java",
          "javascript",
          "json",
          "makefile",
          "markdown",
          "php",
          "plaintext",
          "python",
          "ruby",
          "rust",
          "sql",
          "typescript",
          "xml",
          "yaml",
        ].map((lang) => `highlight.js/lib/languages/${lang}`),
      ],
    },
  },
});
