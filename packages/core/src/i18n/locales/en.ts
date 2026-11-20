import type { ProfileField } from "../../profile.js";

export interface Locale {
  fields: Record<ProfileField, string>;
  values: Record<string, string>;
  yes: string;
  no: string;
  notSure: string;
  ops: {
    between: string; // "{min} to {max}"
    gte: string; // "at least {v}"
    gt: string;
    lte: string; // "at most {v}"
    lt: string;
    eq: string; // "{v}"
    neq: string; // "not {v}"
    in: string; // "one of {v}"
    nin: string; // "none of {v}"
    exists: string;
    not: string; // "must not be: {x}"
  };
  reasonPassed: string; // "{label} is {actual} ✓ (needs {expect})"
  reasonFailed: string;
  reasonMissing: string; // "{label} not known"
  eligibleYes: string;
  eligibleNo: string;
  eligibleMaybe: string;
  fitsBecause: string;
  documents: string;
  officialLink: string;
  source: string;
  lastVerified: string;
  deadline: string;
  noDeadline: string;
  benefits: string;
  howToApply: string;
  disclaimer: string;
  freeServiceNote: string;
  questions: Record<ProfileField, string>;
  greeting: string;
  help: string;
  noResults: string;
  resultsHeader: string; // "{n} schemes may fit you"
  maybeHeader: string;
  askMore: string;
  sensitiveRejected: string;
  notUnderstood: string;
  newCheck: string;
  deadlinesHeader: string; // "Schemes closing in the next {days} days"
  noDeadlines: string;
  documentsHeader: string;
  reportThanks: string;
  voiceNotUnderstood: string;
  rateLimited: string;
  lakh: string;
  years: string;
  hectare: string;
  compareHeader: string;
  level: { central: string; state: string };
  checkingEligibility: string;
  moreResults: string; // "+{n} more – reply MORE"
}

export const en: Locale = {
  fields: {
    age: "Age",
    gender: "Gender",
    annualIncome: "Annual family income",
    state: "State",
    district: "District",
    area: "Area",
    occupation: "Occupation",
    socialCategory: "Social category",
    isMinority: "Minority community",
    hasDisability: "Disability",
    disabilityPercent: "Disability %",
    maritalStatus: "Marital status",
    landHoldingHectares: "Land holding",
    hasBplCard: "BPL ration card",
    educationLevel: "Education",
    isIncomeTaxPayer: "Income-tax payer",
    isPregnantOrLactating: "Pregnant / breastfeeding",
    hasPuccaHouse: "Owns a pucca house",
  },
  values: {
    male: "Male",
    female: "Female",
    transgender: "Transgender",
    rural: "Rural (village)",
    urban: "Urban (town/city)",
    farmer: "Farmer",
    agricultural_labourer: "Farm labourer",
    student: "Student",
    unorganised_worker: "Unorganised worker",
    construction_worker: "Construction worker",
    organised_worker: "Salaried (private)",
    self_employed: "Self-employed",
    business: "Business owner",
    street_vendor: "Street vendor",
    artisan: "Artisan / craftsperson",
    fisherman: "Fisher",
    unemployed: "Unemployed",
    homemaker: "Homemaker",
    retired: "Retired",
    government_employee: "Government employee",
    SC: "SC",
    ST: "ST",
    OBC: "OBC",
    General: "General",
    EWS: "EWS",
    single: "Unmarried",
    married: "Married",
    widowed: "Widow / widower",
    divorced: "Divorced",
    separated: "Separated",
    none: "No schooling",
    primary: "Primary (up to class 5)",
    secondary: "Class 10",
    higher_secondary: "Class 12",
    diploma: "Diploma / ITI",
    graduate: "Graduate",
    postgraduate: "Post-graduate",
  },
  yes: "Yes",
  no: "No",
  notSure: "Not sure",
  ops: {
    between: "{min} to {max}",
    gte: "at least {v}",
    gt: "more than {v}",
    lte: "at most {v}",
    lt: "less than {v}",
    eq: "{v}",
    neq: "not {v}",
    in: "one of: {v}",
    nin: "not: {v}",
    exists: "provided",
    not: "must not be {x}",
  },
  reasonPassed: "{label}: {actual} ✓",
  reasonFailed: "{label}: {actual} ✗ (needs {expect})",
  reasonMissing: "{label} not known yet",
  eligibleYes: "You appear eligible",
  eligibleNo: "You do not appear eligible",
  eligibleMaybe: "Maybe – a few details are needed",
  fitsBecause: "Why it fits",
  documents: "Documents",
  officialLink: "Apply (official)",
  source: "Source",
  lastVerified: "Last verified",
  deadline: "Deadline",
  noDeadline: "Open all year / no fixed deadline",
  benefits: "Benefits",
  howToApply: "How to apply",
  disclaimer:
    "Information help only. The final decision is with the government department. Always apply on the official link.",
  freeServiceNote: "This is a free service. Never pay anyone through this site or bot.",
  questions: {
    age: "What is your age (in years)?",
    gender: "What is your gender?",
    annualIncome: "What is your family's total yearly income (in ₹)? e.g. 1.5 lakh",
    state: "Which state or UT do you live in?",
    district: "Which district do you live in?",
    area: "Do you live in a village or a town/city?",
    occupation: "What is your main work?",
    socialCategory: "What is your social category?",
    isMinority: "Do you belong to a minority community (Muslim, Christian, Sikh, Buddhist, Jain, Parsi)?",
    hasDisability: "Do you have a disability?",
    disabilityPercent: "What is the disability percentage on your certificate?",
    maritalStatus: "What is your marital status?",
    landHoldingHectares: "How much farm land do you own? (in hectares or acres, e.g. 2 acre)",
    hasBplCard: "Do you have a BPL / Antyodaya ration card?",
    educationLevel: "What is your highest education?",
    isIncomeTaxPayer: "Does anyone in your family pay income tax?",
    isPregnantOrLactating: "Are you pregnant or breastfeeding a baby?",
    hasPuccaHouse: "Does your family own a pucca (concrete) house?",
  },
  greeting:
    "Namaste! I am Yojana Mitra. I help you find government schemes you may be eligible for. Tell me about yourself, e.g. \"I am a 42 year old farmer from Gujarat, SC, income 1.5 lakh\".",
  help:
    "Commands:\n• *naya check* – start again\n• *documents* – document checklist for your matches\n• *deadline* – schemes closing soon\n• *help* – this message\nYou can also send a voice note.",
  noResults: "I could not find a matching scheme in our verified list yet. Try changing your details or type *naya check*.",
  resultsHeader: "{n} scheme(s) you appear eligible for:",
  maybeHeader: "{n} more may fit if you answer a few questions.",
  askMore: "To check more schemes I need one more detail.",
  sensitiveRejected:
    "For your safety, please do NOT share Aadhaar, PAN, bank account, card numbers, OTP or passwords. I have not stored it. Just tell me your age, state, income and work.",
  notUnderstood: "Sorry, I did not understand. Please choose an option or type *help*.",
  newCheck: "Okay, let's start a new check.",
  deadlinesHeader: "Schemes closing in the next {days} days:",
  noDeadlines: "No verified scheme deadlines in the next {days} days.",
  documentsHeader: "Documents you will likely need:",
  reportThanks: "Thank you. Your report has been recorded and will be reviewed.",
  voiceNotUnderstood: "Sorry, I could not understand the voice note. Please try again or type your message.",
  rateLimited: "Too many messages. Please wait a minute and try again.",
  lakh: "lakh",
  years: "years",
  hectare: "hectare",
  compareHeader: "Comparison",
  level: { central: "Central Government", state: "State Government" },
  checkingEligibility: "Checking eligibility…",
  moreResults: "+{n} more – reply *more*",
};
