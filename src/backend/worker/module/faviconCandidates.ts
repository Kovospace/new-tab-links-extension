
/**
 *  Where a page says its icon is, read out of its HTML without a DOM.
 *
 *  This runs in the service worker, and a service worker has no DOMParser. The version that
 *  used one caught the ReferenceError and went straight to /favicon.ico, so the page's own
 *  declarations were never read - and for a link this browser has never visited, those are
 *  the only thing that knows where the icon is.
 *
 *  A pattern over the markup is enough for this: only `<link>` tags are wanted, their
 *  attributes are flat, and a tag that cannot be read costs one candidate, not the lookup.
 */

/** A `<link ...>` tag, attributes and all. */
const LINK_TAG = /<link\b([^>]*)>/gi;

/** One attribute: a name, then a double-quoted, single-quoted or bare value. */
const ATTRIBUTE = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/**
 *  Icon addresses in the order worth trying: every `<link rel~="icon">` the page declares,
 *  then `/favicon.ico`, which browsers look for when a page declares nothing.
 *
 *  @param html    the page's markup
 *  @param pageUrl the page's address, which relative hrefs are resolved against
 */
export function extractFaviconCandidates(html: string, pageUrl: string): string[] {
  const candidates: string[] = [];

  for (const tag of html.matchAll(LINK_TAG)) {
    const attributes = readAttributes(tag[1]);
    const rel = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
    const href = attributes.get("href");

    // "icon" as a whole token, as rel~="icon" matched: "shortcut icon" is one,
    // "apple-touch-icon" is not.
    if (!href || !rel.includes("icon")) continue;

    try {
      candidates.push(new URL(decodeEntities(href), pageUrl).href);
    } catch {
      // malformed href - skip
    }
  }

  candidates.push(new URL("/favicon.ico", pageUrl).href);
  return candidates;
}

/** Attributes of one tag by lower-cased name; the first occurrence wins, as in a browser. */
function readAttributes(tagBody: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tagBody.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) {
      attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
    }
  }
  return attributes;
}

/**
 *  The entities an href realistically carries; `&amp;` in a query string above all.
 *  `&amp;` goes last, or "&amp;lt;" would be decoded twice.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}
