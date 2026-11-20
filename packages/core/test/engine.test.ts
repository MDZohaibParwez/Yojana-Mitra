import { describe, expect, it } from "vitest";
import { evaluate, evaluateCondition, matchStrength, parseRule, ruleFields, type RuleNode } from "../src/index.js";

describe("evaluateCondition", () => {
  it("eq / neq", () => {
    expect(evaluateCondition({ field: "gender", op: "eq", value: "female" }, { gender: "female" })).toBe(true);
    expect(evaluateCondition({ field: "gender", op: "eq", value: "female" }, { gender: "male" })).toBe(false);
    expect(evaluateCondition({ field: "gender", op: "neq", value: "female" }, { gender: "male" })).toBe(true);
  });
  it("in / nin", () => {
    expect(evaluateCondition({ field: "socialCategory", op: "in", value: ["SC", "ST"] }, { socialCategory: "ST" })).toBe(true);
    expect(evaluateCondition({ field: "socialCategory", op: "nin", value: ["SC", "ST"] }, { socialCategory: "ST" })).toBe(false);
  });
  it("numeric comparisons and between are inclusive where expected", () => {
    const p = { age: 40 };
    expect(evaluateCondition({ field: "age", op: "gte", value: 40 }, p)).toBe(true);
    expect(evaluateCondition({ field: "age", op: "gt", value: 40 }, p)).toBe(false);
    expect(evaluateCondition({ field: "age", op: "lte", value: 40 }, p)).toBe(true);
    expect(evaluateCondition({ field: "age", op: "lt", value: 40 }, p)).toBe(false);
    expect(evaluateCondition({ field: "age", op: "between", value: [18, 40] }, p)).toBe(true);
    expect(evaluateCondition({ field: "age", op: "between", value: [41, 60] }, p)).toBe(false);
  });
  it("ordinal comparison for education", () => {
    const c = { field: "educationLevel", op: "gte", value: "secondary" } as const;
    expect(evaluateCondition(c, { educationLevel: "graduate" })).toBe(true);
    expect(evaluateCondition(c, { educationLevel: "primary" })).toBe(false);
    expect(evaluateCondition(c, { educationLevel: "secondary" })).toBe(true);
  });
  it("missing field is unknown; exists never unknown", () => {
    expect(evaluateCondition({ field: "age", op: "gte", value: 18 }, {})).toBe("unknown");
    expect(evaluateCondition({ field: "age", op: "exists" }, {})).toBe(false);
    expect(evaluateCondition({ field: "age", op: "exists" }, { age: 3 })).toBe(true);
  });
  it("false boolean is a known value", () => {
    expect(evaluateCondition({ field: "hasBplCard", op: "eq", value: true }, { hasBplCard: false })).toBe(false);
  });
});

describe("three-valued logic", () => {
  const A: RuleNode = { field: "age", op: "gte", value: 18 };
  const F: RuleNode = { field: "gender", op: "eq", value: "female" };

  it("AND: false dominates unknown", () => {
    const r = evaluate({ age: 10 }, { all: [A, F] });
    expect(r.eligible).toBe(false);
    expect(r.missing).toEqual([]);
    expect(r.failed.map((c) => c.field)).toEqual(["age"]);
  });
  it("AND: unknown when nothing false", () => {
    const r = evaluate({ age: 30 }, { all: [A, F] });
    expect(r.eligible).toBe("maybe");
    expect(r.missing).toEqual(["gender"]);
    expect(r.passed.map((c) => c.field)).toEqual(["age"]);
  });
  it("OR: true dominates unknown", () => {
    expect(evaluate({ age: 30 }, { any: [A, F] }).eligible).toBe(true);
  });
  it("OR: unknown when nothing true", () => {
    const r = evaluate({ age: 10 }, { any: [A, F] });
    expect(r.eligible).toBe("maybe");
    expect(r.missing).toEqual(["gender"]);
  });
  it("OR: all false lists every failure", () => {
    const r = evaluate({ age: 10, gender: "male" }, { any: [A, F] });
    expect(r.eligible).toBe(false);
    expect(r.failed).toHaveLength(2);
  });
  it("NOT flips and marks checks negated", () => {
    const r = evaluate({ occupation: "government_employee" }, { not: { field: "occupation", op: "eq", value: "government_employee" } });
    expect(r.eligible).toBe(false);
    expect(r.failed[0]!.negated).toBe(true);
    const ok = evaluate({ occupation: "farmer" }, { not: { field: "occupation", op: "eq", value: "government_employee" } });
    expect(ok.eligible).toBe(true);
    expect(ok.passed[0]!.negated).toBe(true);
    expect(evaluate({}, { not: A }).eligible).toBe("maybe");
  });
  it("deep nesting", () => {
    const rule: RuleNode = {
      all: [A, { any: [F, { all: [{ field: "socialCategory", op: "in", value: ["SC", "ST"] }, { not: { field: "isIncomeTaxPayer", op: "eq", value: true } }] }] }],
    };
    expect(evaluate({ age: 30, gender: "male", socialCategory: "SC", isIncomeTaxPayer: false }, rule).eligible).toBe(true);
    expect(evaluate({ age: 30, gender: "male", socialCategory: "SC", isIncomeTaxPayer: true }, rule).eligible).toBe(false);
    expect(evaluate({ age: 30, gender: "male", socialCategory: "SC" }, rule).missing).toEqual(["isIncomeTaxPayer"]);
  });
  it("missing fields are de-duplicated and ordered by question order", () => {
    const rule: RuleNode = { all: [{ field: "annualIncome", op: "lte", value: 1 }, { field: "state", op: "eq", value: "GJ" }, { field: "annualIncome", op: "gte", value: 0 }] };
    expect(evaluate({}, rule).missing).toEqual(["state", "annualIncome"]);
  });
  it("is deterministic and does not mutate input", () => {
    const p = Object.freeze({ age: 30 });
    const rule: RuleNode = { all: [A, F] };
    expect(evaluate(p, rule)).toEqual(evaluate(p, rule));
  });
  it("derives disability % = 0 when user has no disability", () => {
    const rule: RuleNode = { field: "disabilityPercent", op: "gte", value: 40 };
    expect(evaluate({ hasDisability: false }, rule).eligible).toBe(false);
  });
});

describe("matchStrength", () => {
  it("orders yes > maybe > no", () => {
    const yes = evaluate({ age: 30 }, { field: "age", op: "gte", value: 18 });
    const maybe = evaluate({ age: 30 }, { all: [{ field: "age", op: "gte", value: 18 }, { field: "gender", op: "eq", value: "female" }] });
    const no = evaluate({ age: 3 }, { field: "age", op: "gte", value: 18 });
    expect(matchStrength(yes)).toBeGreaterThan(matchStrength(maybe));
    expect(matchStrength(maybe)).toBeGreaterThan(matchStrength(no));
  });
});

describe("parseRule", () => {
  it("accepts valid trees", () => {
    expect(() => parseRule({ all: [{ field: "age", op: "between", value: [1, 2] }, { not: { field: "gender", op: "eq", value: "male" } }] })).not.toThrow();
  });
  it("rejects unknown fields, bad ops and malformed values", () => {
    expect(() => parseRule({ field: "aadhaar", op: "eq", value: "x" })).toThrow();
    expect(() => parseRule({ field: "age", op: "approx", value: 1 })).toThrow();
    expect(() => parseRule({ field: "age", op: "between", value: 5 })).toThrow();
    expect(() => parseRule({ field: "age", op: "in", value: 5 })).toThrow();
    expect(() => parseRule({ all: [] })).toThrow();
    expect(() => parseRule({ field: "age", op: "gte" })).toThrow();
  });
  it("ruleFields lists every referenced field", () => {
    expect([...ruleFields({ all: [{ field: "age", op: "gte", value: 1 }, { not: { field: "gender", op: "eq", value: "m" } }] })].sort()).toEqual(["age", "gender"]);
  });
});
