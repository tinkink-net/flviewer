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
    // Ship pdf.js inside the lazy chunk so the built artifact works in
    // bundler-managed apps, CDN-direct and raw-ESM contexts alike.
    noExternal: ["pdfjs-dist"],
  },
});
