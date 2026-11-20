import { Hono } from "hono";
import type { SchemeRepository } from "@ym/core";

/** Web chat — implemented with the shared conversation engine in Phase 7/8. */
export function chatRoutes(_repo: () => SchemeRepository) {
  return new Hono();
}
