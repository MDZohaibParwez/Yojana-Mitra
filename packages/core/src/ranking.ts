import { matchStrength, type EvaluationResult } from "./engine.js";
import type { SchemeRecord } from "./scheme.js";

const DAY = 86_400_000;

export function daysUntil(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const d = Date.parse(deadline);
  if (Number.isNaN(d)) return null;
  return Math.ceil((d - now.getTime()) / DAY);
}

/**
 * Ranking score (higher = shown first):
 *   match strength  0..100  (confirmed eligible always beats "maybe")
 *   benefit size    0..20   (log scale of rough annual INR value)
 *   deadline        0..15   (closer open deadlines float up)
 *   query relevance 0..30   (only when a free-text query was given)
 */
export function rankScore(
  scheme: SchemeRecord,
  result: EvaluationResult,
  now: Date,
  queryScore = 0,
): number {
  const match = matchStrength(result) * 100;
  const benefit = scheme.benefitValueInr && scheme.benefitValueInr > 0 ? Math.min(20, Math.log10(scheme.benefitValueInr) * 3.3) : 0;
  const days = daysUntil(scheme.deadline, now);
  let deadline = 0;
  if (days !== null && days >= 0) {
    if (days <= 7) deadline = 15;
    else if (days <= 30) deadline = 10;
    else if (days <= 90) deadline = 5;
  }
  return Math.round((match + benefit + deadline + queryScore * 30) * 100) / 100;
}
