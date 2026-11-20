import { DEFAULT_QUESTION_ORDER, ORDINAL_FIELDS, type Profile, type ProfileField } from "./profile.js";
import { isAll, isAny, isCondition, isNot, type Condition, type RuleNode, type Scalar } from "./rules.js";

export type Tri = true | false | "unknown";

export interface Check {
  field: ProfileField;
  op: Condition["op"];
  expected?: Scalar | Scalar[];
  actual?: Scalar;
  /** True when this condition sits under a NOT, i.e. the profile must NOT satisfy it. */
  negated: boolean;
  note?: string;
}

export interface EvaluationResult {
  eligible: boolean | "maybe";
  passed: Check[];
  failed: Check[];
  /** Profile fields still needed to decide, in the order they should be asked. */
  missing: ProfileField[];
}

interface Partial3 {
  value: Tri;
  passed: Check[];
  failed: Check[];
  missing: ProfileField[];
}

function toComparable(field: ProfileField, v: Scalar): number | string | boolean {
  const order = ORDINAL_FIELDS[field];
  if (order && typeof v === "string") {
    const idx = order.indexOf(v);
    return idx === -1 ? v : idx;
  }
  return v;
}

function cmp(field: ProfileField, a: Scalar, b: Scalar): number | null {
  const x = toComparable(field, a);
  const y = toComparable(field, b);
  if (typeof x === "number" && typeof y === "number") return x - y;
  return null; // not comparable
}

export function evaluateCondition(cond: Condition, profile: Profile): Tri {
  const actual = profile[cond.field] as Scalar | undefined;
  if (cond.op === "exists") return actual !== undefined && actual !== null;
  if (actual === undefined || actual === null) return "unknown";
  const v = cond.value;
  switch (cond.op) {
    case "eq":
      return actual === v;
    case "neq":
      return actual !== v;
    case "in":
      return Array.isArray(v) && v.includes(actual);
    case "nin":
      return Array.isArray(v) && !v.includes(actual);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (Array.isArray(v) || v === undefined) return false;
      const c = cmp(cond.field, actual, v);
      if (c === null) return false;
      if (cond.op === "gt") return c > 0;
      if (cond.op === "gte") return c >= 0;
      if (cond.op === "lt") return c < 0;
      return c <= 0;
    }
    case "between": {
      if (!Array.isArray(v) || v.length !== 2) return false;
      const lo = cmp(cond.field, actual, v[0] as Scalar);
      const hi = cmp(cond.field, actual, v[1] as Scalar);
      if (lo === null || hi === null) return false;
      return lo >= 0 && hi <= 0;
    }
    default:
      return false;
  }
}

function negate(c: Check): Check {
  return { ...c, negated: !c.negated };
}

function walk(node: RuleNode, profile: Profile): Partial3 {
  if (isCondition(node)) {
    const value = evaluateCondition(node, profile);
    const check: Check = {
      field: node.field,
      op: node.op,
      expected: node.value,
      actual: profile[node.field] as Scalar | undefined,
      negated: false,
      ...(node.note ? { note: node.note } : {}),
    };
    if (value === true) return { value, passed: [check], failed: [], missing: [] };
    if (value === false) return { value, passed: [], failed: [check], missing: [] };
    return { value, passed: [], failed: [], missing: [node.field] };
  }

  if (isNot(node)) {
    const r = walk(node.not, profile);
    const value: Tri = r.value === "unknown" ? "unknown" : !r.value;
    return { value, passed: r.failed.map(negate), failed: r.passed.map(negate), missing: r.missing };
  }

  if (isAll(node)) {
    const rs = node.all.map((n) => walk(n, profile));
    const anyFalse = rs.some((r) => r.value === false);
    const anyUnknown = rs.some((r) => r.value === "unknown");
    const value: Tri = anyFalse ? false : anyUnknown ? "unknown" : true;
    return {
      value,
      passed: rs.filter((r) => r.value === true).flatMap((r) => r.passed),
      failed: rs.filter((r) => r.value === false).flatMap((r) => r.failed),
      missing: value === "unknown" ? rs.filter((r) => r.value === "unknown").flatMap((r) => r.missing) : [],
    };
  }

  if (isAny(node)) {
    const rs = node.any.map((n) => walk(n, profile));
    const anyTrue = rs.some((r) => r.value === true);
    const anyUnknown = rs.some((r) => r.value === "unknown");
    const value: Tri = anyTrue ? true : anyUnknown ? "unknown" : false;
    if (value === true) {
      return { value, passed: rs.filter((r) => r.value === true).flatMap((r) => r.passed), failed: [], missing: [] };
    }
    if (value === false) {
      return { value, passed: [], failed: rs.flatMap((r) => r.failed), missing: [] };
    }
    return {
      value,
      passed: [],
      failed: [],
      missing: rs.filter((r) => r.value === "unknown").flatMap((r) => r.missing),
    };
  }

  throw new Error("Invalid rule node: " + JSON.stringify(node));
}

function sortFields(fields: ProfileField[]): ProfileField[] {
  const uniq = [...new Set(fields)];
  return uniq.sort((a, b) => {
    const ia = DEFAULT_QUESTION_ORDER.indexOf(a);
    const ib = DEFAULT_QUESTION_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function dedupeChecks(checks: Check[]): Check[] {
  const seen = new Set<string>();
  return checks.filter((c) => {
    const k = JSON.stringify([c.field, c.op, c.expected, c.negated]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Pure, deterministic eligibility evaluation using three-valued logic.
 * Missing profile fields yield "maybe" plus the list of fields to ask next.
 */
export function evaluate(profile: Profile, rules: RuleNode): EvaluationResult {
  const r = walk(rules, profile);
  return {
    eligible: r.value === "unknown" ? "maybe" : r.value,
    passed: dedupeChecks(r.passed),
    failed: dedupeChecks(r.failed),
    missing: sortFields(r.missing),
  };
}

/** 0..1 — how strongly the profile matches (1 = definitely eligible). */
export function matchStrength(r: EvaluationResult): number {
  if (r.eligible === true) return 1;
  if (r.eligible === false) return 0;
  const known = r.passed.length;
  const unknown = r.missing.length;
  // A "maybe" is always ranked below a confirmed match.
  return 0.2 + 0.6 * (known / Math.max(1, known + unknown));
}
