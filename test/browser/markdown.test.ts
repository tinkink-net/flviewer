import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/markdown";

const MD_URL = "https://docs.test/guide/readme.md";
// DOMPurify is broken in happy-dom (over-strips); these tests run in the
// browser project against real Chromium — the environment users render in.

describe("renderMarkdown — sanitizer (hard requirement)", () => {
  it("strips script tags and on* handlers", async () => {
    const inline = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    const prose = await renderMarkdown(
      `hello <script>alert(1)</script><img src="${inline}" onerror="alert(1)">`,
      {},
    );
    expect(prose.querySelector("script")).toBeNull();
    const img = prose.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("onerror")).toBeNull();
    expect(prose.textContent).toContain("hello");
    expect(prose.textContent).not.toContain("alert(1)");
  });

  it("strips javascript: URIs", async () => {
    const prose = await renderMarkdown("[click](javascript:alert(1))", {});
    const a = prose.querySelector("a");
    // The href is removed or neutralized — never a javascript: URI.
    expect(a?.getAttribute("href")?.startsWith("javascript:")).not.toBe(true);
  });

  it("strips iframe/form/style/style-attr/srcset (allow-list tightening)", async () => {
    const prose = await renderMarkdown(
      "<iframe></iframe><form></form><style>body{}</style>" +
        '<div style="position:fixed">x</div><img srcset="a.png 1x" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">',
      {},
    );
    expect(prose.querySelector("iframe")).toBeNull();
    expect(prose.querySelector("form")).toBeNull();
    expect(prose.querySelector("style")).toBeNull();
    const div = prose.querySelector("div");
    expect(div?.getAttribute("style")).toBeNull();
    const img = prose.querySelector("img");
    expect(img?.getAttribute("srcset")).toBeNull();
  });

  it("strips in-prose audio/video (GitHub-style degradation)", async () => {
    const prose = await renderMarkdown("<video></video><audio></audio>", {});
    expect(prose.querySelector("video")).toBeNull();
    expect(prose.querySelector("audio")).toBeNull();
  });
});

describe("renderMarkdown — links", () => {
  it("forces external links to a new tab with noopener", async () => {
    const prose = await renderMarkdown("[ext](https://example.test/x)", { sourceUrl: MD_URL });
    const a = prose.querySelector("a")!;
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.getAttribute("href")).toBe("https://example.test/x");
  });

  it("resolves relative links against the source URL; strips when baseless", async () => {
    const prose = await renderMarkdown("[rel](other.md)", { sourceUrl: MD_URL });
    expect(prose.querySelector("a")!.getAttribute("href")).toBe("https://docs.test/guide/other.md");

    const baseless = await renderMarkdown("[rel](other.md)", {});
    const stripped = baseless.querySelector("a")!;
    expect(stripped.getAttribute("href")).toBeNull();
    expect(stripped.classList.contains("flv-link-missing")).toBe(true);
  });

  it("transformLinkUrl hook rewrites; null strips", async () => {
    const hooked = await renderMarkdown("[a](x.md)", {
      transformLinkUrl: (u) => `https://rewritten.test/${u}`,
    });
    expect(hooked.querySelector("a")!.getAttribute("href")).toBe("https://rewritten.test/x.md");

    const blocked = await renderMarkdown("[a](x.md)", { transformLinkUrl: () => null });
    expect(blocked.querySelector("a")!.getAttribute("href")).toBeNull();
  });

  it("adds heading ids and keeps fragment links in-view", async () => {
    const prose = await renderMarkdown("# Intro\n\ntext\n\n[go](#intro)", { sourceUrl: MD_URL });
    const heading = prose.querySelector("h1")!;
    expect(heading.id).toBe("intro");
    const a = prose.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("#intro");
    expect(a.getAttribute("target")).toBeNull();
    expect(a.classList.contains("flv-anchor")).toBe(true);
  });
});

describe("renderMarkdown — images (asset policy)", () => {
  it("resolves relative images against the source URL and hardens attrs", async () => {
    const prose = await renderMarkdown("![pic](img/a.png)", { sourceUrl: MD_URL });
    const img = prose.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://docs.test/guide/img/a.png");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("baseUrl option wins over the source URL", async () => {
    const prose = await renderMarkdown("![pic](img/a.png)", {
      sourceUrl: MD_URL,
      baseUrl: "https://base.test/assets/",
    });
    expect(prose.querySelector("img")!.getAttribute("src")).toBe(
      "https://base.test/assets/img/a.png",
    );
  });

  it("baseless relative images degrade to the placeholder (no typed error)", async () => {
    const prose = await renderMarkdown("![pic](img/a.png)", {});
    expect(prose.querySelector("img")).toBeNull();
    const placeholder = prose.querySelector(".flv-asset-missing");
    expect(placeholder).toBeTruthy();
    expect(placeholder!.textContent).toContain("img/a.png");
  });

  it("transformAssetUrl hook rewrites; null blocks to placeholder", async () => {
    const hooked = await renderMarkdown("![pic](a.png)", {
      transformAssetUrl: (u) => `https://signed.test/${u}?t=1`,
    });
    expect(hooked.querySelector("img")!.getAttribute("src")).toBe("https://signed.test/a.png?t=1");

    const blocked = await renderMarkdown("![pic](a.png)", { transformAssetUrl: () => null });
    expect(blocked.querySelector("img")).toBeNull();
    expect(blocked.querySelector(".flv-asset-missing")).toBeTruthy();
  });

  it("swaps broken images for the placeholder on error", async () => {
    // Deterministic decode failure — no network: an invalid data: URI.
    // The prose must be in the document: detached images never load.
    const prose = await renderMarkdown("![pic](data:image/png;base64,NOT-A-VALID-IMAGE)", {
      baseUrl: `${location.origin}/`,
    });
    document.body.append(prose);
    const img = prose.querySelector("img")!;
    expect(img).toBeTruthy();
    await new Promise<void>((resolve) => {
      img.addEventListener("error", () => resolve(), { once: true });
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(prose.querySelector("img")).toBeNull();
    const placeholder = prose.querySelector(".flv-asset-missing");
    expect(placeholder).toBeTruthy();
    expect(placeholder!.textContent).toContain("data:image/png;base64,NOT-A-VALID-IMAGE");
    prose.remove();
  });

  it("keeps data: URIs (inline images)", async () => {
    const uri = "data:image/png;base64,iVBORw0KGgo=";
    const prose = await renderMarkdown(`![inline](${uri})`, {});
    expect(prose.querySelector("img")!.getAttribute("src")).toBe(uri);
  });
});

describe("renderMarkdown — code blocks & structure", () => {
  it("highlights fenced code with the curated highlighter", async () => {
    const prose = await renderMarkdown("```js\nconst x = 1;\n```", {});
    const code = prose.querySelector("pre code")!;
    expect(code.className).toContain("hljs");
    expect(code.className).toContain("language-js");
    expect(code.innerHTML).toContain("hljs-keyword");
    // Text content is preserved (escaped markup).
    expect(code.textContent!.trimEnd()).toBe("const x = 1;");
  });

  it("escapes fenced code in unregistered languages", async () => {
    const prose = await renderMarkdown("```\n<b>not html</b>\n```", {});
    const code = prose.querySelector("pre code")!;
    expect(code.innerHTML).not.toContain("<b>");
    expect(code.textContent!.trimEnd()).toBe("<b>not html</b>");
  });

  it("renders markdown structure (headings, lists, tables, quotes)", async () => {
    const prose = await renderMarkdown(
      "# H1\n\n- a\n- b\n\n> quote\n\n| A | B |\n| - | - |\n| 1 | 2 |",
      {},
    );
    expect(prose.querySelector("h1")).toBeTruthy();
    expect(prose.querySelectorAll("li").length).toBe(2);
    expect(prose.querySelector("blockquote")).toBeTruthy();
    expect(prose.querySelectorAll("table td").length).toBe(2);
  });
});
