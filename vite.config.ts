import { defineConfig } from "vite-plus";

export default defineConfig({
  root: "playground",
  server: {
    open: true,
  },
  lint: {
    ignorePatterns: ["dist/**", "node_modules/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ["dist/**", "node_modules/**"],
  },
  pack: {
    // Ship pdf.js and the text pipeline (marked/DOMPurify/hljs) inside the
    // lazy chunks so the built artifact works in bundler-managed apps,
    // CDN-direct and raw-ESM contexts alike. Subpath imports are matched
    // literally by the packer, hence the explicit list.
    deps: {
      alwaysBundle: [
        "pdfjs-dist",
        "marked",
        "dompurify",
        "highlight.js/lib/core",
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
