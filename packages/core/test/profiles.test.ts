import { describe, expect, it } from "vitest";
import { evaluate, parseRule, type Profile } from "../src/index.js";
import { bySlug, loadSeedRecords } from "./fixtures.js";

type Expect = Record<string, true | false | "maybe">;
interface Case {
  name: string;
  profile: Profile;
  expect: Expect;
  missing?: Record<string, string[]>;
}

const CASES: Case[] = [
  {
    name: "Gujarat SC farmer, 42, 1.2 ha, ₹1.5 lakh",
    profile: { age: 42, gender: "male", state: "GJ", socialCategory: "SC", occupation: "farmer", annualIncome: 150000, landHoldingHectares: 1.2, isIncomeTaxPayer: false, area: "rural", hasPuccaHouse: true, hasBplCard: false },
    expect: { "pm-kisan": true, "pm-kmy": false, pmfby: true, "kisan-credit-card": true, "atal-pension-yojana": false, "pmay-g": false, "pm-jay": false, "e-shram": true, mgnrega: true, "pm-surya-ghar": true },
  },
  {
    name: "Farmer with unknown land and tax status",
    profile: { age: 42, occupation: "farmer" },
    expect: { "pm-kisan": "maybe" },
    missing: { "pm-kisan": ["landHoldingHectares", "isIncomeTaxPayer"] },
  },
  {
    name: "UP rural BPL widow, 55, homemaker",
    profile: { age: 55, gender: "female", maritalStatus: "widowed", hasBplCard: true, area: "rural", occupation: "homemaker", state: "UP" },
    expect: { ignwps: true, ignoaps: false, pmuy: true, "pm-jay": true, mgnrega: true, "atal-pension-yojana": false },
  },
  {
    name: "BPL widow aged 82",
    profile: { age: 82, gender: "female", maritalStatus: "widowed", hasBplCard: true },
    expect: { ignwps: false, ignoaps: true, "pm-jay": true },
  },
  {
    name: "Urban retired man, 72, not BPL",
    profile: { age: 72, gender: "male", hasBplCard: false, area: "urban", occupation: "retired" },
    expect: { "pm-jay": true, ignoaps: false, pmsby: false, pmjjby: false },
  },
  { name: "Girl aged 6", profile: { age: 6, gender: "female" }, expect: { "sukanya-samriddhi": true, pmjdy: false, pmjjby: false } },
  { name: "Boy aged 6", profile: { age: 6, gender: "male" }, expect: { "sukanya-samriddhi": false } },
  { name: "Girl, age unknown", profile: { gender: "female" }, expect: { "sukanya-samriddhi": "maybe" }, missing: { "sukanya-samriddhi": ["age"] } },
  {
    name: "SC college student, 19, ₹2 lakh",
    profile: { age: 19, gender: "female", socialCategory: "SC", occupation: "student", annualIncome: 200000, educationLevel: "higher_secondary" },
    expect: { "post-matric-scholarship-sc": true, "post-matric-scholarship-st": false, "pm-yasasvi-post-matric-obc": false, pmuy: true, pmegp: true, "stand-up-india": false },
  },
  {
    name: "SC student above income ceiling",
    profile: { age: 19, socialCategory: "SC", occupation: "student", annualIncome: 300000, educationLevel: "higher_secondary" },
    expect: { "post-matric-scholarship-sc": false },
  },
  {
    name: "ST student, 17, Class 10 pass",
    profile: { age: 17, socialCategory: "ST", occupation: "student", annualIncome: 100000, educationLevel: "secondary", isIncomeTaxPayer: false },
    expect: { "post-matric-scholarship-st": true, "atal-pension-yojana": false, "e-shram": false },
  },
  {
    name: "OBC graduate student, 20",
    profile: { age: 20, socialCategory: "OBC", occupation: "student", annualIncome: 240000, educationLevel: "graduate" },
    expect: { "pm-yasasvi-post-matric-obc": true },
  },
  {
    name: "OBC student still in primary",
    profile: { age: 10, socialCategory: "OBC", occupation: "student", annualIncome: 100000, educationLevel: "primary" },
    expect: { "pm-yasasvi-post-matric-obc": false },
  },
  {
    name: "Urban street vendor, 35",
    profile: { age: 35, gender: "male", occupation: "street_vendor", area: "urban", annualIncome: 120000, isIncomeTaxPayer: false },
    expect: { "pm-svanidhi": true, "pm-mudra": true, "pm-sym": true, "atal-pension-yojana": true, "e-shram": true, "pmay-u-2": "maybe" },
    missing: { "pmay-u-2": ["hasPuccaHouse"] },
  },
  { name: "Rural street vendor", profile: { age: 35, occupation: "street_vendor", area: "rural" }, expect: { "pm-svanidhi": false } },
  {
    name: "OBC male artisan (carpenter), 30",
    profile: { age: 30, gender: "male", occupation: "artisan", area: "rural", socialCategory: "OBC" },
    expect: { "pm-vishwakarma": true, "pm-mudra": true, "stand-up-india": false, pmegp: true },
  },
  { name: "Woman artisan, 30", profile: { age: 30, gender: "female", occupation: "artisan" }, expect: { "stand-up-india": true, "pm-vishwakarma": true } },
  {
    name: "SC man running a shop, 45",
    profile: { age: 45, gender: "male", socialCategory: "SC", occupation: "business", annualIncome: 400000 },
    expect: { "stand-up-india": true, "pm-sym": false, "pm-mudra": true },
  },
  { name: "General man running a shop, 45", profile: { age: 45, gender: "male", socialCategory: "General", occupation: "business" }, expect: { "stand-up-india": false } },
  {
    name: "Pregnant SC homemaker, 25",
    profile: { age: 25, gender: "female", socialCategory: "SC", isPregnantOrLactating: true, occupation: "homemaker" },
    expect: { pmmvy: true },
  },
  {
    name: "Pregnant, General, ₹9 lakh, no disability",
    profile: { age: 25, gender: "female", socialCategory: "General", isPregnantOrLactating: true, occupation: "homemaker", annualIncome: 900000, hasBplCard: false, hasDisability: false },
    expect: { pmmvy: false },
  },
  {
    name: "Pregnant government employee",
    profile: { age: 29, gender: "female", isPregnantOrLactating: true, occupation: "government_employee", socialCategory: "SC" },
    expect: { pmmvy: false },
  },
  {
    name: "Pregnant woman, occupation unknown",
    profile: { age: 25, gender: "female", isPregnantOrLactating: true, hasBplCard: true },
    expect: { pmmvy: "maybe" },
    missing: { pmmvy: ["occupation"] },
  },
  {
    name: "Man with 85% disability, BPL, 45",
    profile: { age: 45, gender: "male", hasDisability: true, disabilityPercent: 85, hasBplCard: true },
    expect: { igndps: true, adip: "maybe" },
    missing: { adip: ["annualIncome"] },
  },
  {
    name: "50% disability, BPL, ₹1 lakh",
    profile: { age: 45, hasDisability: true, disabilityPercent: 50, hasBplCard: true, annualIncome: 100000 },
    expect: { igndps: false, adip: true },
  },
  {
    name: "85% disability aged 85, BPL",
    profile: { age: 85, hasDisability: true, disabilityPercent: 85, hasBplCard: true },
    expect: { igndps: false, ignoaps: true, "pm-jay": true },
  },
  {
    name: "Unemployed graduate, 22, ₹3 lakh",
    profile: { age: 22, occupation: "unemployed", educationLevel: "graduate", annualIncome: 300000 },
    expect: { "pm-internship": true, "pm-mudra": true, pmegp: true, "atal-pension-yojana": "maybe" },
    missing: { "atal-pension-yojana": ["isIncomeTaxPayer"] },
  },
  { name: "Unemployed graduate aged 26", profile: { age: 26, occupation: "unemployed", educationLevel: "graduate", annualIncome: 300000 }, expect: { "pm-internship": false } },
  { name: "Unemployed graduate, family ₹9 lakh", profile: { age: 22, occupation: "unemployed", educationLevel: "graduate", annualIncome: 900000 }, expect: { "pm-internship": false } },
  {
    name: "Young marginal farmer, 30, 1.5 ha",
    profile: { age: 30, occupation: "farmer", landHoldingHectares: 1.5, isIncomeTaxPayer: false },
    expect: { "pm-kmy": true, "pm-kisan": true, "atal-pension-yojana": true },
  },
  { name: "Young farmer with 3 ha", profile: { age: 30, occupation: "farmer", landHoldingHectares: 3, isIncomeTaxPayer: false }, expect: { "pm-kmy": false, "pm-kisan": true } },
  {
    name: "Landless tenant farmer",
    profile: { age: 30, occupation: "farmer", landHoldingHectares: 0, isIncomeTaxPayer: false },
    expect: { "pm-kisan": false, "pm-kmy": false, pmfby: true, "kisan-credit-card": true },
  },
  {
    name: "Farmer family paying income tax",
    profile: { age: 35, occupation: "farmer", landHoldingHectares: 4, isIncomeTaxPayer: true },
    expect: { "pm-kisan": false, "atal-pension-yojana": false, "e-shram": false },
  },
  {
    name: "Urban government employee, 40",
    profile: { age: 40, occupation: "government_employee", area: "urban", annualIncome: 800000, hasPuccaHouse: true },
    expect: { "pm-kisan": false, "pmay-u-2": false, pmjjby: true, pmsby: true, "atal-pension-yojana": "maybe", mgnrega: false },
  },
  {
    name: "Empty profile",
    profile: {},
    expect: { pmjjby: "maybe", "pm-jay": "maybe" },
    missing: { pmjjby: ["age"], "pm-jay": ["age", "hasBplCard"] },
  },
  { name: "Only state known", profile: { state: "MH" }, expect: { pmfby: "maybe" }, missing: { pmfby: ["occupation"] } },
  { name: "Fisher, 50", profile: { age: 50, occupation: "fisherman" }, expect: { "kisan-credit-card": true, "pm-mudra": true, "e-shram": "maybe" } },
  { name: "Fisher, 80", profile: { age: 80, occupation: "fisherman" }, expect: { "kisan-credit-card": false } },
  {
    name: "Construction worker, 28, ₹1.5 lakh",
    profile: { age: 28, occupation: "construction_worker", annualIncome: 150000, isIncomeTaxPayer: false },
    expect: { "pm-sym": true, "e-shram": true, "atal-pension-yojana": true },
  },
  {
    name: "Construction worker, 28, ₹2.5 lakh",
    profile: { age: 28, occupation: "construction_worker", annualIncome: 250000, isIncomeTaxPayer: false },
    expect: { "pm-sym": false, "e-shram": true },
  },
  {
    name: "Rural BPL homemaker, 35",
    profile: { age: 35, gender: "female", hasBplCard: true, area: "rural", occupation: "homemaker" },
    expect: { pmuy: true, "pm-jay": true, mgnrega: true, "pm-sym": "maybe", "atal-pension-yojana": "maybe" },
  },
  { name: "BPL girl, 17", profile: { age: 17, gender: "female", hasBplCard: true }, expect: { pmuy: false } },
  { name: "BPL man, 30", profile: { age: 30, gender: "male", hasBplCard: true }, expect: { pmuy: false } },
  { name: "General woman, not BPL", profile: { age: 30, gender: "female", socialCategory: "General", hasBplCard: false }, expect: { pmuy: false } },
  { name: "ST woman, BPL unknown", profile: { age: 30, gender: "female", socialCategory: "ST" }, expect: { pmuy: true } },
  {
    name: "OBC woman, BPL unknown",
    profile: { age: 30, gender: "female", socialCategory: "OBC" },
    expect: { pmuy: "maybe" },
    missing: { pmuy: ["hasBplCard"] },
  },
  {
    name: "Urban family ₹5 lakh, no pucca house",
    profile: { area: "urban", annualIncome: 500000, hasPuccaHouse: false },
    expect: { "pmay-u-2": true, "pmay-g": false },
  },
  { name: "Urban family ₹12 lakh, no pucca house", profile: { area: "urban", annualIncome: 1200000, hasPuccaHouse: false }, expect: { "pmay-u-2": false } },
  {
    name: "Rural farm labourer in kutcha house",
    profile: { age: 33, area: "rural", hasPuccaHouse: false, isIncomeTaxPayer: false, occupation: "agricultural_labourer" },
    expect: { "pmay-g": true, mgnrega: true, "pm-sym": "maybe" },
  },
  { name: "Rural kutcha house, tax status unknown", profile: { area: "rural", hasPuccaHouse: false, occupation: "agricultural_labourer" }, expect: { "pmay-g": "maybe" } },
  { name: "BPL senior, 65", profile: { age: 65, hasBplCard: true }, expect: { ignoaps: true, "pm-jay": true, pmsby: true } },
  { name: "Exactly 70, not BPL", profile: { age: 70, hasBplCard: false }, expect: { "pm-jay": true } },
  { name: "Exactly 60, BPL", profile: { age: 60, hasBplCard: true }, expect: { ignoaps: true } },
  { name: "APY upper boundary 40", profile: { age: 40, isIncomeTaxPayer: false }, expect: { "atal-pension-yojana": true } },
  { name: "APY age 41", profile: { age: 41, isIncomeTaxPayer: false }, expect: { "atal-pension-yojana": false } },
  { name: "PMJJBY lower boundary 18", profile: { age: 18 }, expect: { pmjjby: true, pmsby: true } },
  { name: "PMJJBY age 51", profile: { age: 51 }, expect: { pmjjby: false, pmsby: true } },
  { name: "Owns pucca house", profile: { hasPuccaHouse: true }, expect: { "pm-surya-ghar": true } },
  { name: "No pucca house", profile: { hasPuccaHouse: false }, expect: { "pm-surya-ghar": false } },
  { name: "School student, 15", profile: { age: 15, occupation: "student", socialCategory: "General" }, expect: { pmjdy: true, pmjjby: false } },
];

const schemes = bySlug(loadSeedRecords());

describe("seed data", () => {
  it("every seed rule is a valid rule tree", () => {
    for (const s of Object.values(schemes)) expect(() => parseRule(s.rule), s.slug).not.toThrow();
  });
  it("has at least 50 realistic test profiles", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50);
  });
});

describe.each(CASES)("profile: $name", ({ profile, expect: exp, missing }) => {
  for (const [slug, expected] of Object.entries(exp)) {
    it(`${slug} → ${String(expected)}`, () => {
      const s = schemes[slug];
      expect(s, `scheme ${slug} exists`).toBeDefined();
      const r = evaluate(profile, s!.rule);
      expect(r.eligible).toBe(expected);
      if (expected === true) expect(r.failed).toEqual([]);
      if (expected === false) expect(r.failed.length).toBeGreaterThan(0);
      if (expected === "maybe") expect(r.missing.length).toBeGreaterThan(0);
      if (missing?.[slug]) expect(r.missing).toEqual(missing[slug]);
    });
  }
});
