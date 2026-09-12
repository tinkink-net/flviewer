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
});
