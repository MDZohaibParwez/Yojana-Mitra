import { parse, type HTMLElement } from "node-html-parser";
import type { RawScheme } from "./types.js";

const SECTION_LABELS: Array<[keyof RawScheme["sections"], RegExp]> = [
  ["details", /^(details|about|overview|introduction|scheme details|योजना का विवरण|विवरण)/i],
  ["benefits", /^(benefits?|assistance|financial assistance|लाभ)/i],
  ["eligibility", /^(eligibility|eligibility criteria|who can apply|पात्रता)/i],
  ["exclusions", /^(exclusions?|not eligible|अपात्रता)/i],
  ["applicationProcess", /^(application process|how to apply|procedure|आवेदन प्रक्रिया|आवेदन कैसे करें)/i],
  ["documents", /^(documents? required|required documents|documents|आवश्यक दस्तावेज़|दस्तावेज़)/i],
];

export function cleanText(s: string): string {
  return s
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function blockText(el: HTMLElement): string {
  // Preserve list items as lines.
  el.querySelectorAll("li").forEach((li) => li.insertAdjacentHTML("afterbegin", "\n• "));
  el.querySelectorAll("br,p,div").forEach((x) => x.insertAdjacentHTML("afterend", "\n"));
  return cleanText(el.textContent);
}

/** Split a page into labelled sections using h1–h4 headings. */
export function extractSections(html: string): RawScheme["sections"] & { title?: string } {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const out: RawScheme["sections"] & { title?: string } = {};
  const h1 = root.querySelector("h1");
  if (h1) out.title = cleanText(h1.textContent);
  const headings = root.querySelectorAll("h2,h3,h4");
  for (const h of headings) {
    const label = cleanText(h.textContent);
    const match = SECTION_LABELS.find(([, re]) => re.test(label));
    if (!match) continue;
    const parts: string[] = [];
    let n = h.nextElementSibling;
    while (n && !/^(H[1-4]|FOOTER|NAV|ASIDE)$/.test(n.tagName)) {
      parts.push(blockText(n));
      n = n.nextElementSibling;
    }
    const text = cleanText(parts.join("\n"));
    if (text && !out[match[0]]) out[match[0]] = text;
  }
  return out;
}

export function extractLinks(html: string, base: string, pattern: RegExp): string[] {
  const root = parse(html);
  const links = new Set<string>();
  for (const a of root.querySelectorAll("a[href]")) {
    try {
      const u = new URL(a.getAttribute("href")!, base);
      u.hash = "";
      if (u.protocol === "https:" && pattern.test(u.href)) links.add(u.href);
    } catch {
      /* ignore bad hrefs */
    }
  }
  return [...links];
}

export function parseSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
}

/** Turn a bullet/line list into an array of items. */
export function toList(text?: string): string[] {
  if (!text) return [];
  return text
    .split(/\n|•|;(?=\s)/)
    .map((s) => s.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim())
    .filter((s) => s.length > 2);
}
