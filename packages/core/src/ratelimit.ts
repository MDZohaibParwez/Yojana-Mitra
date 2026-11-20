/**
 * Fixed-window in-memory rate limiter. Keys should already be anonymised
 * (e.g. hashed IP / HMAC of phone). On serverless each instance has its own
 * window, which is acceptable as a first line; put a WAF / Vercel Firewall rule in front for hard limits.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private limit: number,
    private windowMs = 60_000,
    private maxKeys = 50_000,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; remaining: number; resetAt: number } {
    let e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      if (this.hits.size >= this.maxKeys) this.sweep(now);
      e = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, e);
    }
    e.count++;
    return { allowed: e.count <= this.limit, remaining: Math.max(0, this.limit - e.count), resetAt: e.resetAt };
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
}
