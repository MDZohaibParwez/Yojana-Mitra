"use client";
import { useState, useTransition } from "react";
import type { Lang } from "@ym/core/i18n";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { searchAction } from "@/lib/actions";
import type { WebStrings } from "@/lib/strings";
import { Results, type ResultData } from "./results";

export interface FieldOption {
  value: string;
  label: string;
}
export interface FormConfig {
  lang: Lang;
  s: WebStrings;
  labels: Record<string, string>;
  questions: Record<string, string>;
  yes: string;
  no: string;
  options: {
    state: FieldOption[];
    gender: FieldOption[];
    occupation: FieldOption[];
    socialCategory: FieldOption[];
    area: FieldOption[];
    maritalStatus: FieldOption[];
    educationLevel: FieldOption[];
  };
}

const ENUM_FIELDS = ["state", "gender", "occupation", "socialCategory", "area", "maritalStatus", "educationLevel"] as const;
const BOOL_FIELDS = ["hasBplCard", "hasDisability", "isIncomeTaxPayer", "hasPuccaHouse", "isPregnantOrLactating", "isMinority"] as const;

function buildProfile(fd: FormData): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const f of ENUM_FIELDS) {
    const v = fd.get(f);
    if (typeof v === "string" && v) p[f] = v;
  }
  for (const f of BOOL_FIELDS) {
    const v = fd.get(f);
    if (v === "true") p[f] = true;
    if (v === "false") p[f] = false;
  }
  const num = (k: string) => {
    const v = String(fd.get(k) ?? "").replace(/,/g, "").trim();
    return v === "" ? undefined : Number(v);
  };
  const age = num("age");
  if (age !== undefined && Number.isFinite(age)) p.age = Math.round(age);
  const income = num("annualIncome");
  if (income !== undefined && Number.isFinite(income)) p.annualIncome = income;
  const acres = num("landAcres");
  if (acres !== undefined && Number.isFinite(acres)) p.landHoldingHectares = Math.round(acres * 0.4047 * 100) / 100;
  const pct = num("disabilityPercent");
  if (pct !== undefined && Number.isFinite(pct)) p.disabilityPercent = pct;
  return p;
}

export function ProfileForm({ cfg }: { cfg: FormConfig }) {
  const { s, labels, options } = cfg;
  const [pending, start] = useTransition();
  const [data, setData] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  const enumSelect = (f: (typeof ENUM_FIELDS)[number]) => (
    <div key={f}>
      <Label htmlFor={f}>{labels[f]}</Label>
      <Select id={f} name={f} defaultValue="">
        <option value="">{s.notSure}</option>
        {options[f].map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </div>
  );
  const boolSelect = (f: (typeof BOOL_FIELDS)[number], onChange?: (v: string) => void) => (
    <div key={f}>
      <Label htmlFor={f}>{cfg.questions[f]}</Label>
      <Select id={f} name={f} defaultValue="" onChange={(e) => onChange?.(e.target.value)}>
        <option value="">{s.notSure}</option>
        <option value="true">{cfg.yes}</option>
        <option value="false">{cfg.no}</option>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const profile = buildProfile(new FormData(e.currentTarget));
          setError(null);
          start(async () => {
            const r = await searchAction(profile, cfg.lang);
            if (r.ok) {
              setData(r.data as unknown as ResultData);
              requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }));
            } else setError(r.error);
          });
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {enumSelect("state")}
          <div>
            <Label htmlFor="age">{labels.age}</Label>
            <Input id="age" name="age" type="number" inputMode="numeric" min={0} max={120} />
          </div>
          {enumSelect("gender")}
          {enumSelect("occupation")}
          <div>
            <Label htmlFor="annualIncome">{labels.annualIncome}</Label>
            <Input id="annualIncome" name="annualIncome" type="number" inputMode="numeric" min={0} step={1000} placeholder="150000" aria-describedby="income-hint" />
            <p id="income-hint" className="mt-1 text-xs text-muted-foreground">{s.incomeHint}</p>
          </div>
          {enumSelect("socialCategory")}
          {enumSelect("area")}
          {enumSelect("maritalStatus")}
          {enumSelect("educationLevel")}
          <div>
            <Label htmlFor="landAcres">{labels.landHoldingHectares} ({s.landHint})</Label>
            <Input id="landAcres" name="landAcres" type="number" inputMode="decimal" min={0} step="0.1" />
          </div>
        </div>
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer font-medium">+ {labels.hasBplCard}, {labels.hasDisability}, …</summary>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {boolSelect("hasBplCard")}
            {boolSelect("hasDisability", (v) => setDisabled(v === "true"))}
            {disabled && (
              <div>
                <Label htmlFor="disabilityPercent">{labels.disabilityPercent}</Label>
                <Input id="disabilityPercent" name="disabilityPercent" type="number" inputMode="numeric" min={0} max={100} />
              </div>
            )}
            {boolSelect("isIncomeTaxPayer")}
            {boolSelect("hasPuccaHouse")}
            {boolSelect("isPregnantOrLactating")}
            {boolSelect("isMinority")}
          </div>
        </details>
        <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
          {pending ? s.checking : s.submit}
        </Button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
      <div id="results" aria-live="polite">
        {data && <Results data={data} s={s} lang={cfg.lang} />}
      </div>
    </div>
  );
}
