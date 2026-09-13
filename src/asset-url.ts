/** Reference resolution for Markdown assets/links (ADR-6). */
export interface ReferencePolicy {
  /** Explicit base for relative references (option; beats the source URL). */
  baseUrl?: string;
  /** The document's own URL, when the source is URL-typed. */
  sourceUrl?: string;
  /** Caller hook: raw reference → final URL, or `null` to block. */
  transform?: ((url: string) => string | null) | undefined;
}

export type ResolvedReference =
  | { kind: "url"; url: string }
  /** Fragment within the rendered document (links only). */
  | { kind: "fragment"; id: string }
  /** Unresolvable/blocked → placeholder (asset) or stripped (link). */
  | { kind: "missing" };

/** Bases may be page-relative (e.g. "/docs/readme.md") — normalize against location. */
function absoluteBase(base: string): string | undefined {
  try {
    return new URL(base).href;
  } catch {
    try {
      return new URL(base, location.href).href;
    } catch {
      return undefined;
    }
  }
}

/**
 * Per-reference resolution order (ADR-6): caller hook → fragment → absolute
 * URL (scheme-allow-listed) → relative against `baseUrl` ?? `sourceUrl` →
 * missing. The hook receives the raw reference and returns the final URL
 * verbatim.
 */
export function resolveReference(
  rawUrl: string,
  policy: ReferencePolicy,
  schemes: readonly string[] = ["http:", "https:", "mailto:", "data:", "blob:"],
): ResolvedReference {
  const ref = rawUrl.trim();
  if (!ref) {
    return { kind: "missing" };
  }
  if (ref.startsWith("#")) {
    return { kind: "fragment", id: ref.slice(1) };
  }
  if (policy.transform) {
    const mapped = policy.transform(ref);
    if (mapped === null || mapped === undefined || mapped.trim() === "") {
      return { kind: "missing" };
    }
    return { kind: "url", url: mapped };
  }
  try {
    const absolute = new URL(ref);
    if (schemes.includes(absolute.protocol)) {
      return { kind: "url", url: absolute.href };
    }
    return { kind: "missing" };
  } catch {
    // Relative reference.
  }
  const rawBase = policy.baseUrl ?? policy.sourceUrl;
  const base = rawBase ? absoluteBase(rawBase) : undefined;
  if (!base) {
    return { kind: "missing" };
  }
  try {
    return { kind: "url", url: new URL(ref, base).href };
  } catch {
    return { kind: "missing" };
  }
}
