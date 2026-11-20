import { describe, expect, it } from "vitest";
import { evaluate, findSchemes, InMemoryRepository, STATES } from "../src/index.js";
import { bySlug, loadSeedRecords } from "./fixtures.js";

const records = loadSeedRecords();
const s = bySlug(records);

describe("state schemes", () => {
  it("every state scheme has a valid state code and requires residence", () => {
    const states = records.filter((r) => r.level === "state");
    expect(states.length).toBeGreaterThanOrEqual(15);
    for (const r of states) {
      expect(STATES.some((x) => x.code === r.stateCode), r.slug).toBe(true);
      expect(JSON.stringify(r.rule)).toContain(`"field":"state","op":"eq","value":"${r.stateCode}"`);
    }
  });
  it.each([
    ["mp-ladli-behna", { state: "MP", gender: "female", age: 35, maritalStatus: "married", annualIncome: 120000, isIncomeTaxPayer: false, occupation: "homemaker", landHoldingHectares: 0.5 }, true],
    ["mp-ladli-behna", { state: "UP", gender: "female", age: 35 }, false],
    ["mp-ladli-behna", { state: "MP", gender: "female", age: 35, maritalStatus: "single" }, false],
    ["mh-majhi-ladki-bahin", { state: "MH", gender: "female", age: 64, annualIncome: 200000, isIncomeTaxPayer: false, occupation: "homemaker" }, true],
    ["mh-majhi-ladki-bahin", { state: "MH", gender: "female", age: 66 }, false],
    ["wb-lakshmir-bhandar", { state: "WB", gender: "female", age: 30, occupation: "homemaker" }, true],
    ["wb-kanyashree", { state: "WB", gender: "female", age: 15, occupation: "student", maritalStatus: "single" }, true],
    ["ka-shakti", { state: "KA", gender: "transgender" }, true],
    ["ka-shakti", { state: "KA", gender: "male" }, false],
    ["tg-kalyana-lakshmi", { state: "TG", gender: "female", age: 22, socialCategory: "OBC", area: "urban", annualIncome: 180000 }, true],
    ["tg-kalyana-lakshmi", { state: "TG", gender: "female", age: 22, socialCategory: "OBC", area: "rural", annualIncome: 180000 }, false],
    ["tg-kalyana-lakshmi", { state: "TG", gender: "female", age: 22, socialCategory: "General", isMinority: true, area: "rural", annualIncome: 100000 }, true],
    ["or-kalia", { state: "OR", occupation: "agricultural_labourer", isIncomeTaxPayer: false, landHoldingHectares: 0 }, true],
    ["br-kanya-utthan", { state: "BR", gender: "female", educationLevel: "graduate" }, true],
    ["gj-vahali-dikri", { state: "GJ", gender: "female", age: 0, annualIncome: 150000 }, true],
  ] as const)("%s", (slug, profile, expected) => {
    expect(evaluate(profile, s[slug]!.rule).eligible).toBe(expected);
  });
  it("find_schemes only returns the user's own state schemes", async () => {
    const repo = new InMemoryRepository(records);
    const r = await findSchemes({ repo, channel: "web" }, { profile: { state: "MH", gender: "female", age: 30 } });
    const stateCodes = new Set(r.results.filter((x) => x.level === "state").map((x) => x.stateCode));
    expect([...stateCodes]).toEqual(["MH"]);
  });
});
