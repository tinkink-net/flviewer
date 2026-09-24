import { afterEach, describe, expect, it } from "vitest";
import { isWeChatWebView } from "../src/views";

const originalUA = navigator.userAgent;

function setUA(ua: string): void {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

describe("isWeChatWebView (issue #15)", () => {
  afterEach(() => setUA(originalUA));

  it("matches Android/iOS WeChat and WeChat Work user agents", () => {
    setUA(
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116 Mobile Safari/537.36 MicroMessenger/8.0.49 WeChat/arm64",
    );
    expect(isWeChatWebView()).toBe(true);
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 wxwork/4.1.0");
    expect(isWeChatWebView()).toBe(true);
  });

  it("is false for ordinary browsers", () => {
    setUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(isWeChatWebView()).toBe(false);
  });
});
