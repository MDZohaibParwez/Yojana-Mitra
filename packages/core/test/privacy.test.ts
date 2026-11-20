import { describe, expect, it } from "vitest";
import { assertNoSensitive, containsSensitive, findSensitive, redact, SensitiveDataError, verhoeffValid } from "../src/index.js";

// Verhoeff-valid 12-digit test number (not a real person's Aadhaar).
const AADHAAR_LIKE = "234123412346";

describe("privacy guard", () => {
  it("verhoeff", () => {
    expect(verhoeffValid(AADHAAR_LIKE)).toBe(true);
    expect(verhoeffValid("234123412345")).toBe(false);
  });
  it("detects Aadhaar with or without spaces", () => {
    expect(findSensitive(`my number is ${AADHAAR_LIKE}`).map((f) => f.kind)).toContain("aadhaar");
    expect(findSensitive("aadhaar 2341 2341 2345").map((f) => f.kind)).toContain("aadhaar");
    expect(findSensitive("मेरा आधार 2341 2341 2345 है").map((f) => f.kind)).toContain("aadhaar");
  });
  it("detects PAN, IFSC, card, bank account, OTP/password", () => {
    expect(findSensitive("PAN ABCPE1234F").map((f) => f.kind)).toContain("pan");
    expect(findSensitive("ifsc SBIN0001234").map((f) => f.kind)).toContain("ifsc");
    expect(findSensitive("card 4111 1111 1111 1111").map((f) => f.kind)).toContain("card");
    expect(findSensitive("bank account 123456789012345").map((f) => f.kind)).toContain("bank_account");
    expect(findSensitive("otp is 482913").map((f) => f.kind)).toContain("otp_or_password");
    expect(findSensitive("my password: hunter2").map((f) => f.kind)).toContain("otp_or_password");
  });
  it("does not flag normal profile text", () => {
    for (const t of [
      "I am a 42 year old farmer from Gujarat, SC, income 1.5 lakh",
      "main 35 saal ki mahila hoon, aay 150000",
      "मेरी उम्र 60 साल है और BPL कार्ड है",
      "income 250000 per year, 2 acre land",
    ]) expect(containsSensitive(t), t).toBe(false);
  });
  it("assertNoSensitive walks nested objects", () => {
    expect(() => assertNoSensitive({ profile: { district: "ABCPE1234F" } })).toThrow(SensitiveDataError);
    expect(() => assertNoSensitive({ profile: { age: 30, district: "Surat" } })).not.toThrow();
  });
  it("redacts phone, email and ids", () => {
    const r = redact("call me 9876543210 or a@b.com, PAN ABCPE1234F");
    expect(r).not.toMatch(/9876543210|a@b\.com|ABCPE1234F/);
  });
});
