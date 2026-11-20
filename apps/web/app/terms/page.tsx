import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of use" };

export default function Terms() {
  return (
    <article className="space-y-3 pt-2">
      <h1 className="text-2xl font-bold">Terms of use</h1>
      <p>Yojana Mitra is a free information service. It is not a government website and does not process applications.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Information is collected from official government sources and reviewed, but may be outdated. Each answer shows its source and the date it was last verified.</li>
        <li>Eligibility results are indicative. The final decision is always with the government department.</li>
        <li>Always apply only on the official link. Never pay anyone who claims to apply for you through this service.</li>
        <li>Do not share Aadhaar, PAN, bank details, OTPs or passwords with this service.</li>
      </ul>
    </article>
  );
}
