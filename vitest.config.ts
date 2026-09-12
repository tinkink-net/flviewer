import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "happy-dom",
          include: ["test/*.test.ts"],
          setupFiles: ["test/setup.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["test/browser/*.test.ts"],
          setupFiles: ["test/setup.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
