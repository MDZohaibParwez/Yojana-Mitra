import { describe, expect, it } from "vitest";
import { describeCheck, detectLanguage, evaluate, formatInr, getLocale, LANGS } from "../src/index.js";

describe("language detection", () => {
  it.each([
    ["I am a farmer from Gujarat", "en"],
    ["mera naam Ramesh hai, main kisan hoon", "hinglish"],
    ["mujhe pension chahiye", "hinglish"],
    ["मैं किसान हूँ", "hi"],
    ["मी शेतकरी आहे", "mr"],
    ["હું ખેડૂત છું", "gu"],
    ["நான் விவசாயி", "ta"],
    ["నేను రైతును", "te"],
    ["আমি কৃষক", "bn"],
    ["ನಾನು ರೈತ", "kn"],
  ] as const)("%s → %s", (text, lang) => {
    expect(detectLanguage(text)).toBe(lang);
  });
  it("falls back for empty / numeric input", () => {
    expect(detectLanguage("", "hi")).toBe("hi");
    expect(detectLanguage("42", "hi")).toBe("hi");
  });
});

describe("locales", () => {
  it("every language has every key", () => {
    const keys = Object.keys(getLocale("en"));
    for (const l of LANGS) for (const k of keys) expect(getLocale(l), `${l}.${k}`).toHaveProperty(k);
  });
  it("formats INR in lakh", () => {
    expect(formatInr(150000, "en")).toBe("₹1.5 lakh");
    expect(formatInr(250000, "hi")).toBe("₹2.5 लाख");
    expect(formatInr(5000, "en")).toBe("₹5,000");
  });
  it("describes failed checks with expectation", () => {
    const r = evaluate({ age: 45 }, { field: "age", op: "between", value: [18, 40] });
    expect(describeCheck(r.failed[0]!, "failed", "en")).toBe("Age: 45 years ✗ (needs 18 years to 40 years)");
    expect(describeCheck(r.failed[0]!, "failed", "hi")).toContain("उम्र");
  });
});
