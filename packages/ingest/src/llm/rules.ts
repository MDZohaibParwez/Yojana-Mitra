import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EDUCATION_LEVELS, GENDERS, MARITAL_STATUSES, OCCUPATIONS, parseRule, SOCIAL_CATEGORIES, STATE_CODES, type RuleNode } from "@ym/core";
import { anthropic, INGEST_MODEL } from "./client.js";

/**
 * Structured outputs guarantee this wrapper; the recursive rule tree itself is
 * returned as a JSON string and validated locally with parseRule (zod), so an
 * invalid tree can never reach the database.
 */
const ExtractionSchema = z.object({
  rule_json: z.string().describe("The eligibility rule tree as a JSON string"),
  unmapped_criteria: z.array(z.string()).describe("Official criteria that could not be expressed with the available fields"),
  confidence: z.enum(["high", "medium", "low"]),
});

export const RULE_SYSTEM_PROMPT = `You convert official Indian government scheme eligibility text into a machine-readable rule tree.

Rule tree grammar (JSON):
- {"all": [node, ...]} = AND, {"any": [node, ...]} = OR, {"not": node} = NOT
- condition: {"field": F, "op": OP, "value": V, "note": "short quote of the official criterion"}
- OP: eq, neq, in, nin (array value), gt, gte, lt, lte, between ([min,max] inclusive), exists (no value)

Fields (use ONLY these):
- age (years, number); gender: ${GENDERS.join("|")}
- annualIncome: annual FAMILY income in INR (convert monthly ×12, lakh ×100000)
- state: ${STATE_CODES.join("|")}; district (string); area: rural|urban
- occupation: ${OCCUPATIONS.join("|")}
- socialCategory: ${SOCIAL_CATEGORIES.join("|")}; isMinority (boolean)
- hasDisability (boolean); disabilityPercent (0-100)
- maritalStatus: ${MARITAL_STATUSES.join("|")}
- landHoldingHectares (number; 1 acre = 0.4047 ha)
- hasBplCard (boolean); educationLevel (ordered): ${EDUCATION_LEVELS.join(" < ")}
- isIncomeTaxPayer, isPregnantOrLactating, hasPuccaHouse (booleans)

Rules:
- Express ONLY what the text states. Never invent thresholds. If a criterion cannot be expressed, list it in unmapped_criteria instead of approximating it silently.
- Exclusions ("not eligible if ...") become {"not": ...} inside the top-level "all".
- State schemes: include {"field":"state","op":"eq","value":<code>} when residence is required.
- Keep notes short and factual. A human reviewer will check every rule before it is used.`;

export interface ExtractedRule {
  rule: RuleNode;
  unmapped: string[];
  confidence: "high" | "medium" | "low";
  model: string;
}

export async function extractRule(input: {
  name: string;
  stateCode: string | null;
  eligibility: string;
  exclusions?: string;
}): Promise<ExtractedRule> {
  const userText = [
    `Scheme: ${input.name}`,
    input.stateCode ? `State scheme of: ${input.stateCode}` : "Central government scheme",
    `Eligibility (official text):\n${input.eligibility.slice(0, 12000)}`,
    input.exclusions ? `Exclusions (official text):\n${input.exclusions.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic().beta.messages.parse({
      model: INGEST_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: zodOutputFormat(ExtractionSchema) },
      system: RULE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: lastError ? `${userText}\n\nYour previous rule was invalid: ${lastError}\nReturn a corrected rule.` : userText,
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error(`model declined to extract rule for ${input.name}`);
    const out = response.parsed_output;
    if (!out) {
      lastError = "output did not match the schema";
      continue;
    }
    try {
      const rule = parseRule(JSON.parse(out.rule_json));
      return { rule, unmapped: out.unmapped_criteria, confidence: out.confidence, model: response.model };
    } catch (e) {
      lastError = (e as Error).message.slice(0, 1000);
    }
  }
  throw new Error(`could not extract a valid rule for ${input.name}: ${lastError}`);
}
