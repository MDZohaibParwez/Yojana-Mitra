import { STATES } from "@ym/core";
import type { SourceConfig } from "./types.js";

/**
 * Every data source Yojana Mitra may import from. ALL are disabled
 * (`termsReviewed: false`) until a maintainer has read the portal's Terms of Use
 * / copyright policy, checked robots.txt (`pnpm check-sources`) and recorded the
 * result in DATA_SOURCES.md. myScheme also lists state schemes, so it is the
 * primary route to all-state coverage; state portals fill gaps.
 */
const STATE_PORTALS: Record<string, string> = {
  AP: "https://www.ap.gov.in",
  AR: "https://arunachalpradesh.gov.in",
  AS: "https://assam.gov.in",
  BR: "https://state.bihar.gov.in",
  CT: "https://cgstate.gov.in",
  GA: "https://www.goa.gov.in",
  GJ: "https://gujaratindia.gov.in",
  HR: "https://haryana.gov.in",
  HP: "https://himachal.nic.in",
  JH: "https://www.jharkhand.gov.in",
  KA: "https://www.karnataka.gov.in",
  KL: "https://kerala.gov.in",
  MP: "https://mp.gov.in",
  MH: "https://www.maharashtra.gov.in",
  MN: "https://manipur.gov.in",
  ML: "https://meghalaya.gov.in",
  MZ: "https://mizoram.gov.in",
  NL: "https://nagaland.gov.in",
  OR: "https://odisha.gov.in",
  PB: "https://punjab.gov.in",
  RJ: "https://rajasthan.gov.in",
  SK: "https://sikkim.gov.in",
  TN: "https://www.tn.gov.in",
  TG: "https://www.telangana.gov.in",
  TR: "https://tripura.gov.in",
  UP: "https://up.gov.in",
  UT: "https://uk.gov.in",
  WB: "https://wb.gov.in",
  AN: "https://andaman.gov.in",
  CH: "https://chandigarh.gov.in",
  DH: "https://ddd.gov.in",
  DL: "https://delhi.gov.in",
  JK: "https://jk.gov.in",
  LA: "https://ladakh.gov.in",
  LD: "https://lakshadweep.gov.in",
  PY: "https://www.py.gov.in",
};

export const SOURCES: SourceConfig[] = [
  {
    id: "myscheme",
    name: "myScheme (NeGD, MeitY)",
    kind: "myscheme",
    baseUrl: "https://www.myscheme.gov.in",
    stateCode: null,
    rateLimitMs: 3000,
    termsReviewed: false,
    notes: "Primary source for central AND state schemes. Uses public sitemap + public pages only.",
  },
  {
    id: "nsap",
    name: "National Social Assistance Programme",
    kind: "html",
    baseUrl: "https://nsap.nic.in",
    stateCode: null,
    rateLimitMs: 3000,
    termsReviewed: false,
  },
  {
    id: "nsp",
    name: "National Scholarship Portal",
    kind: "html",
    baseUrl: "https://scholarships.gov.in",
    stateCode: null,
    rateLimitMs: 3000,
    termsReviewed: false,
  },
  ...STATES.map(
    (s): SourceConfig => ({
      id: `state-${s.code.toLowerCase()}`,
      name: `${s.en} government portal`,
      kind: "html",
      baseUrl: STATE_PORTALS[s.code]!,
      stateCode: s.code,
      listUrls: [],
      linkPattern: undefined,
      rateLimitMs: 3000,
      termsReviewed: false,
      notes: "Configure listUrls + linkPattern for the scheme directory page after ToS review.",
    }),
  ),
];

export function getSource(id: string): SourceConfig | undefined {
  return SOURCES.find((s) => s.id === id);
}
