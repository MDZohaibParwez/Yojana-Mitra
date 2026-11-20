import { z } from "zod";
import { STATE_CODES } from "./states.js";

export const GENDERS = ["male", "female", "transgender"] as const;
export const AREAS = ["rural", "urban"] as const;
export const OCCUPATIONS = [
  "farmer",
  "agricultural_labourer",
  "student",
  "unorganised_worker",
  "construction_worker",
  "organised_worker",
  "self_employed",
  "business",
  "street_vendor",
  "artisan",
  "fisherman",
  "unemployed",
  "homemaker",
  "retired",
  "government_employee",
] as const;
export const SOCIAL_CATEGORIES = ["SC", "ST", "OBC", "General", "EWS"] as const;
export const MARITAL_STATUSES = ["single", "married", "widowed", "divorced", "separated"] as const;
/** Ordered from lowest to highest so rules can use gte/lte on education. */
export const EDUCATION_LEVELS = [
  "none",
  "primary",
  "secondary",
  "higher_secondary",
  "diploma",
  "graduate",
  "postgraduate",
] as const;

/**
 * Citizen profile. Every field is optional: the eligibility engine answers
 * "maybe" and lists what to ask next when a rule needs a missing field.
 *
 * Deliberately contains NO identifiers (no name, phone, Aadhaar, PAN, bank).
 */
export const ProfileSchema = z
  .object({
    age: z.number().int().min(0).max(120).describe("Age in completed years"),
    gender: z.enum(GENDERS),
    annualIncome: z
      .number()
      .min(0)
      .max(1_000_000_000)
      .describe("Annual FAMILY income in Indian Rupees (e.g. 1.5 lakh = 150000)"),
    state: z.enum(STATE_CODES).describe("State/UT code, e.g. GJ for Gujarat, UP for Uttar Pradesh"),
    district: z.string().min(2).max(60),
    area: z.enum(AREAS).describe("rural (village) or urban (town/city)"),
    occupation: z.enum(OCCUPATIONS),
    socialCategory: z.enum(SOCIAL_CATEGORIES),
    isMinority: z.boolean().describe("Belongs to a notified religious minority community"),
    hasDisability: z.boolean(),
    disabilityPercent: z.number().min(0).max(100),
    maritalStatus: z.enum(MARITAL_STATUSES),
    landHoldingHectares: z.number().min(0).max(10_000).describe("Cultivable land owned, in hectares (1 hectare ≈ 2.47 acres)"),
    hasBplCard: z.boolean().describe("Has a BPL / Antyodaya / priority household ration card"),
    educationLevel: z.enum(EDUCATION_LEVELS),
    isIncomeTaxPayer: z.boolean(),
    isPregnantOrLactating: z.boolean(),
    hasPuccaHouse: z.boolean(),
  })
  .partial()
  .strict();

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileField = keyof Profile;

export const PROFILE_FIELDS = Object.keys(ProfileSchema.shape) as ProfileField[];

/** Fields with an inherent order, so gte/lte comparisons work on enum values. */
export const ORDINAL_FIELDS: Partial<Record<ProfileField, readonly string[]>> = {
  educationLevel: EDUCATION_LEVELS,
};

/** Order in which a conversational channel asks for fields when everything is equally useful. */
export const DEFAULT_QUESTION_ORDER: ProfileField[] = [
  "state",
  "age",
  "gender",
  "occupation",
  "annualIncome",
  "socialCategory",
  "area",
  "maritalStatus",
  "hasDisability",
  "hasBplCard",
  "landHoldingHectares",
  "educationLevel",
  "isIncomeTaxPayer",
  "hasPuccaHouse",
  "isPregnantOrLactating",
  "disabilityPercent",
  "isMinority",
  "district",
];
