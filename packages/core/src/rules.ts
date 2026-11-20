import { z } from "zod";
import { PROFILE_FIELDS, type ProfileField } from "./profile.js";

/**
 * Machine-readable eligibility rule tree.
 *
 *   { "all": [ ...nodes ] }   – AND
 *   { "any": [ ...nodes ] }   – OR
 *   { "not": node }           – NOT
 *   { "field": "age", "op": "between", "value": [18, 40] }  – condition
 *
 * Conditions may carry a short human note (`note`) quoting the official text,
 * which is shown to users next to the auto-generated reason.
 */
export const OPERATORS = [
  "eq",
  "neq",
  "in",
  "nin",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "exists",
] as const;
export type Operator = (typeof OPERATORS)[number];

export type Scalar = string | number | boolean;

export interface Condition {
  field: ProfileField;
  op: Operator;
  value?: Scalar | Scalar[];
  note?: string;
}
export interface AllNode {
  all: RuleNode[];
  note?: string;
}
export interface AnyNode {
  any: RuleNode[];
  note?: string;
}
export interface NotNode {
  not: RuleNode;
  note?: string;
}
export type RuleNode = Condition | AllNode | AnyNode | NotNode;

const ScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

const ConditionSchema = z
  .object({
    field: z.enum(PROFILE_FIELDS as [ProfileField, ...ProfileField[]]),
    op: z.enum(OPERATORS),
    value: z.union([ScalarSchema, z.array(ScalarSchema)]).optional(),
    note: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const needsArray = c.op === "in" || c.op === "nin" || c.op === "between";
    if (c.op === "exists") return;
    if (c.value === undefined) {
      ctx.addIssue({ code: "custom", message: `op "${c.op}" requires a value` });
      return;
    }
    if (needsArray && !Array.isArray(c.value)) {
      ctx.addIssue({ code: "custom", message: `op "${c.op}" requires an array value` });
    }
    if (c.op === "between" && Array.isArray(c.value) && c.value.length !== 2) {
      ctx.addIssue({ code: "custom", message: `"between" requires [min, max]` });
    }
    if (!needsArray && Array.isArray(c.value)) {
      ctx.addIssue({ code: "custom", message: `op "${c.op}" requires a single value` });
    }
  });

export const RuleNodeSchema: z.ZodType<RuleNode> = z.lazy(() =>
  z.union([
    ConditionSchema,
    z.object({ all: z.array(RuleNodeSchema).min(1), note: z.string().max(500).optional() }).strict(),
    z.object({ any: z.array(RuleNodeSchema).min(1), note: z.string().max(500).optional() }).strict(),
    z.object({ not: RuleNodeSchema, note: z.string().max(500).optional() }).strict(),
  ]),
) as z.ZodType<RuleNode>;

export function isCondition(n: RuleNode): n is Condition {
  return (n as Condition).field !== undefined;
}
export function isAll(n: RuleNode): n is AllNode {
  return Array.isArray((n as AllNode).all);
}
export function isAny(n: RuleNode): n is AnyNode {
  return Array.isArray((n as AnyNode).any);
}
export function isNot(n: RuleNode): n is NotNode {
  return (n as NotNode).not !== undefined;
}

/** Parse untrusted JSON into a validated rule tree (throws ZodError). */
export function parseRule(input: unknown): RuleNode {
  return RuleNodeSchema.parse(input);
}

/** All profile fields referenced anywhere in a rule tree. */
export function ruleFields(node: RuleNode, acc = new Set<ProfileField>()): Set<ProfileField> {
  if (isCondition(node)) acc.add(node.field);
  else if (isAll(node)) node.all.forEach((n) => ruleFields(n, acc));
  else if (isAny(node)) node.any.forEach((n) => ruleFields(n, acc));
  else if (isNot(node)) ruleFields(node.not, acc);
  return acc;
}
