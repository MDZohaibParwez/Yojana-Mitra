/**
 * Polite HTTP client for official portals:
 *  - honours robots.txt (cached per origin, fail-closed if robots says disallow)
 *  - per-host minimum delay between requests (rate limit)
 *  - timeouts + bounded retries with backoff on 429/5xx
 *  - generic identifying User-Agent (no personal data)
 */
export const USER_AGENT =
  process.env.INGEST_USER_AGENT ?? "YojanaMitraBot/0.1 (+https://github.com/mdzohaibparwez/yojana-mitra; public-interest scheme index)";

export interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
}

/** Minimal robots.txt parser: groups for our UA token or "*"; longest-match wins. */
export function parseRobots(txt: string, uaToken = "yojanamitrabot"): RobotsRules {
  const groups: Array<{ agents: string[]; rules: RobotsRules }> = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: { disallow: [], allow: [], crawlDelayMs: null } };
        groups.push(current);
      }
      current.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && val) current.rules.disallow.push(val);
    else if (key === "allow" && val) current.rules.allow.push(val);
    else if (key === "crawl-delay" && !Number.isNaN(Number(val))) current.rules.crawlDelayMs = Number(val) * 1000;
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && uaToken.includes(a)));
  const star = groups.find((g) => g.agents.includes("*"));
  return (specific ?? star)?.rules ?? { disallow: [], allow: [], crawlDelayMs: null };
}

function patternToRegex(p: string): RegExp {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + (esc.endsWith("\\$") ? esc.slice(0, -2) + "$" : esc));
}

export function robotsAllows(rules: RobotsRules, path: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const [list, allow] of [
    [rules.allow, true],
    [rules.disallow, false],
  ] as const) {
    for (const p of list) {
      if (patternToRegex(p).test(path) && (!best || p.length > best.len || (p.length === best.len && allow))) {
        best = { len: p.length, allow };
      }
    }
  }
  return best ? best.allow : true;
}

export class RobotsDisallowedError extends Error {}

export interface FetcherOptions {
  minDelayMs?: number;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class PoliteFetcher {
  private robots = new Map<string, RobotsRules>();
  private lastHit = new Map<string, number>();
  private f: typeof fetch;
  private sleep: (ms: number) => Promise<void>;

  constructor(private opts: FetcherOptions = {}) {
    this.f = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async robotsFor(origin: string): Promise<RobotsRules> {
    const cached = this.robots.get(origin);
    if (cached) return cached;
    let rules: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };
    try {
      const res = await this.raw(`${origin}/robots.txt`, "GET");
      if (res.ok) rules = parseRobots(await res.text());
      // 4xx => no robots file => allowed; 5xx => be conservative and disallow everything
      else if (res.status >= 500) rules = { disallow: ["/"], allow: [], crawlDelayMs: null };
    } catch {
      rules = { disallow: ["/"], allow: [], crawlDelayMs: null };
    }
    this.robots.set(origin, rules);
    return rules;
  }

  private async raw(url: string, method: "GET" | "HEAD"): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 20_000);
    try {
      return await this.f(url, {
        method,
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.5" },
      });
    } finally {
      clearTimeout(t);
    }
  }

  async fetch(url: string, method: "GET" | "HEAD" = "GET"): Promise<Response> {
    const u = new URL(url);
    if (u.protocol !== "https:") throw new Error(`refusing non-https url ${url}`);
    const rules = await this.robotsFor(u.origin);
    if (!robotsAllows(rules, u.pathname + u.search)) throw new RobotsDisallowedError(`robots.txt disallows ${url}`);
    const delay = Math.max(this.opts.minDelayMs ?? 2000, rules.crawlDelayMs ?? 0);
    const retries = this.opts.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      const last = this.lastHit.get(u.host) ?? 0;
      const wait = last + delay - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastHit.set(u.host, Date.now());
      try {
        const res = await this.raw(url, method);
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await this.sleep(delay * 2 ** (attempt + 1));
          continue;
        }
        return res;
      } catch (e) {
        if (attempt >= retries) throw e;
        await this.sleep(delay * 2 ** (attempt + 1));
      }
    }
  }

  async text(url: string): Promise<string> {
    const res = await this.fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    return res.text();
  }
}
