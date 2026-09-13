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
            // Synthetic clicks carry no user activation; without this the
            // autoplay policy rejects programmatic play() in tests.
            provider: playwright({
              launchOptions: {
                args: ["--autoplay-policy=no-user-gesture-required"],
              },
            }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
