import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CheckEligibilityInput,
  CompareSchemesInput,
  DocumentChecklistBase,
  FindSchemesInput,
  GetSchemeInput,
  ReportIssueInput,
  TOOLS,
  ToolError,
  UpcomingDeadlinesInput,
  type SchemeRepository,
  type ToolName,
} from "@ym/core";

export const SERVER_NAME = "yojana-mitra";
export const SERVER_VERSION = "0.1.0";

export const INSTRUCTIONS = `Yojana Mitra tells Indian citizens which government schemes (central + state) they may be eligible for.

How to use:
1. Build a profile ONLY from what the user said. Never guess missing fields. Convert: "1.5 lakh" -> annualIncome 150000 (yearly FAMILY income), acres -> hectares (x0.4047), state names -> 2-letter codes (Gujarat=GJ, Uttar Pradesh=UP, Maharashtra=MH, Bihar=BR, Delhi=DL, Tamil Nadu=TN, West Bengal=WB, Rajasthan=RJ, Madhya Pradesh=MP, Karnataka=KA, Telangana=TG, Andhra Pradesh=AP, Odisha=OR, Kerala=KL, Punjab=PB, Haryana=HR, Assam=AS, Jharkhand=JH, Chhattisgarh=CT, Uttarakhand=UT, Himachal Pradesh=HP).
2. Call find_schemes. Present confirmed matches first, each with its one-line reason, official link and last verified date.
3. If askNext is non-empty, ask the user ONE of those questions (simple words, their language), then call find_schemes again.
4. Use check_eligibility to explain why someone does or does not qualify, get_scheme for details, document_checklist before they visit an office.
Rules: Only state facts returned by these tools — never invent schemes, amounts or rules. Always show the official apply link and the source + last verified date. Reply in the user's language (set lang: en, hi, hinglish, gu, mr, ta, te, bn, kn). Never ask for or accept Aadhaar, PAN, bank, card numbers, OTPs or passwords. Remind users the service is free, to apply only on official links, and that the final decision rests with the government department.`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const DESCRIPTIONS: Record<ToolName, { title: string; description: string }> = {
  find_schemes: {
    title: "Find eligible government schemes",
    description:
      "Find Indian government schemes (central + the user's state) that a person is eligible for. Pass only known profile fields; missing fields make schemes 'maybe' instead of excluding them. " +
      "Returns ranked results (eligible: true first, then 'maybe') with a one-line reason, official apply URL, source URL and last verified date, plus `askNext` — the most useful follow-up questions to ask the user. " +
      "Optional `query` narrows by need, e.g. 'pension', 'house', 'scholarship', 'loan', 'किसान'.",
  },
  get_scheme: {
    title: "Get scheme details",
    description:
      "Full details of one scheme by id or slug (from find_schemes): benefits, how to apply steps, documents required, official apply link, source link, last verified date and the machine-readable eligibility rule.",
  },
  check_eligibility: {
    title: "Check eligibility for one scheme",
    description:
      "Check one scheme against a profile. Returns eligible true / false / 'maybe', human-readable passed and failed conditions (with what the rule requires), and the missing fields with ready-to-ask questions. Use this to explain exactly why someone does not qualify.",
  },
  compare_schemes: {
    title: "Compare schemes",
    description: "Side-by-side comparison of 2–5 schemes: level, ministry, benefits, documents, deadline and (if a profile is given) eligibility for each.",
  },
  document_checklist: {
    title: "Document checklist",
    description:
      "Combined, de-duplicated list of documents to carry, either for given schemeIds or for all schemes a profile is confirmed eligible for. Each document lists which schemes need it.",
  },
  upcoming_deadlines: {
    title: "Upcoming deadlines",
    description: "Schemes whose application deadline falls within the next `days` (default 30), optionally for a state (central schemes always included). Soonest first.",
  },
  report_issue: {
    title: "Report wrong information",
    description:
      "Report wrong or outdated information about a scheme (wrong amount, dead link, closed scheme). Creates a report for the review team. Do not include any personal details in the message. Only call when the user explicitly wants to report something.",
  },
};

const SCHEMAS = {
  find_schemes: FindSchemesInput.shape,
  get_scheme: GetSchemeInput.shape,
  check_eligibility: CheckEligibilityInput.shape,
  compare_schemes: CompareSchemesInput.shape,
  document_checklist: DocumentChecklistBase.shape,
  upcoming_deadlines: UpcomingDeadlinesInput.shape,
  report_issue: ReportIssueInput.shape,
} as const;

export function createMcpServer(repo: () => SchemeRepository): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  for (const name of Object.keys(TOOLS) as ToolName[]) {
    const meta = DESCRIPTIONS[name];
    server.registerTool(
      name,
      {
        title: meta.title,
        description: meta.description,
        inputSchema: SCHEMAS[name],
        annotations:
          name === "report_issue"
            ? { title: meta.title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
            : { title: meta.title, ...READ_ONLY },
      },
      async (args: unknown) => {
        try {
          const result = await TOOLS[name]({ repo: repo(), channel: "mcp" }, args);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        } catch (e) {
          const msg =
            e instanceof ToolError
              ? `${e.code}: ${e.message}`
              : "internal: Yojana Mitra could not complete this request. Please try again later.";
          if (!(e instanceof ToolError)) console.error("[mcp] tool error", name, (e as Error).name);
          return { isError: true, content: [{ type: "text" as const, text: msg }] };
        }
      },
    );
  }
  return server;
}
