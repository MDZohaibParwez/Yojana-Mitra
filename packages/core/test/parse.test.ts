import { describe, expect, it } from "vitest";
import { parseAnswer, parseMoney, parseProfileFromText, parseState } from "../src/index.js";

describe("parseProfileFromText", () => {
  it("English sentence from the README", () => {
    expect(parseProfileFromText("I'm a 42-year-old farmer from Gujarat, SC category, family income around 1.5 lakh")).toMatchObject({
      age: 42, occupation: "farmer", state: "GJ", socialCategory: "SC", annualIncome: 150000,
    });
  });
  it("Hinglish", () => {
    expect(parseProfileFromText("main 35 saal ki vidhwa mahila hoon, UP ke gaon mein rehti hoon, BPL card hai")).toMatchObject({
      age: 35, gender: "female", maritalStatus: "widowed", state: "UP", area: "rural", hasBplCard: true,
    });
  });
  it("Hindi Devanagari incl. Hindi digits and डेढ़ लाख", () => {
    expect(parseProfileFromText("मैं बिहार का ४५ साल का किसान हूँ, आय डेढ़ लाख, 2 एकड़ ज़मीन")).toMatchObject({
      age: 45, state: "BR", occupation: "farmer", annualIncome: 150000, landHoldingHectares: 0.81,
    });
  });
  it("ST is not confused with SC; adivasi", () => {
    expect(parseProfileFromText("अनुसूचित जनजाति").socialCategory).toBe("ST");
    expect(parseProfileFromText("hum adivasi hain").socialCategory).toBe("ST");
    expect(parseProfileFromText("अनुसूचित जाति").socialCategory).toBe("SC");
  });
  it("occupations", () => {
    expect(parseProfileFromText("main rehri lagata hoon").occupation).toBe("street_vendor");
    expect(parseProfileFromText("khet mazdoor").occupation).toBe("agricultural_labourer");
    expect(parseProfileFromText("I am a tailor").occupation).toBe("artisan");
    expect(parseProfileFromText("I study in college").occupation).toBe("student");
    expect(parseProfileFromText("sarkari naukri").occupation).toBe("government_employee");
    expect(parseProfileFromText("मैं मज़दूर हूँ").occupation).toBe("unorganised_worker");
  });
  it("state names: longest match and short aliases", () => {
    expect(parseState("west bengal")).toBe("WB");
    expect(parseState("from mp")).toBe("MP");
    expect(parseState("Tamil Nadu")).toBe("TN");
    expect(parseState("महाराष्ट्र")).toBe("MH");
    expect(parseState("jump")).toBeUndefined();
  });
  it("money", () => {
    expect(parseMoney("1.5 lakh")).toBe(150000);
    expect(parseMoney("15000 per month")).toBe(180000);
    expect(parseMoney("15 hazar mahina")).toBe(180000);
    expect(parseMoney("ढाई लाख")).toBe(250000);
    expect(parseMoney("₹2,50,000")).toBe(250000);
    expect(parseMoney("hello")).toBeUndefined();
  });
  it("misc facts", () => {
    expect(parseProfileFromText("kachcha ghar hai").hasPuccaHouse).toBe(false);
    expect(parseProfileFromText("divyang 60%")).toMatchObject({ hasDisability: true, disabilityPercent: 60 });
    expect(parseProfileFromText("12th pass").educationLevel).toBe("higher_secondary");
    expect(parseProfileFromText("BA graduate").educationLevel).toBe("graduate");
    expect(parseProfileFromText("income tax nahi bharte").isIncomeTaxPayer).toBe(false);
    expect(parseProfileFromText("garbhvati hoon").isPregnantOrLactating).toBe(true);
  });
});

describe("parseAnswer", () => {
  it("numbers and yes/no in many languages", () => {
    expect(parseAnswer("age", "42")).toBe(42);
    expect(parseAnswer("age", "४२")).toBe(42);
    expect(parseAnswer("hasBplCard", "haan")).toBe(true);
    expect(parseAnswer("hasBplCard", "नहीं")).toBe(false);
    expect(parseAnswer("hasBplCard", "pata nahi")).toBe("unsure");
    expect(parseAnswer("annualIncome", "2 lakh")).toBe(200000);
    expect(parseAnswer("landHoldingHectares", "5 acre")).toBe(2.02);
    expect(parseAnswer("landHoldingHectares", "1 hectare")).toBe(1);
    expect(parseAnswer("occupation", "kisan")).toBe("farmer");
    expect(parseAnswer("state", "rajasthan")).toBe("RJ");
    expect(parseAnswer("age", "banana")).toBeUndefined();
  });
});

describe("regional scripts", () => {
  it.each([
    ["હું 45 વર્ષનો ખેડૂત છું, ગુજરાત", { age: 45, occupation: "farmer", state: "GJ" }],
    ["நான் ௪௨ வயது விவசாயி", { occupation: "farmer" }],
    ["నేను 40 ఏళ్ల రైతును, తెలంగాణ", { age: 40, occupation: "farmer", state: "TG" }],
    ["আমি ৫০ বছরের কৃষক, পশ্চিমবঙ্গ", { age: 50, occupation: "farmer", state: "WB" }],
    ["ನಾನು 38 ವರ್ಷದ ರೈತ, ಕರ್ನಾಟಕ", { age: 38, occupation: "farmer", state: "KA" }],
    ["मी 42 वर्षांचा शेतकरी आहे, महाराष्ट्र", { age: 42, occupation: "farmer", state: "MH" }],
  ])("%s", (text, expected) => {
    expect(parseProfileFromText(text)).toMatchObject(expected);
  });
});
