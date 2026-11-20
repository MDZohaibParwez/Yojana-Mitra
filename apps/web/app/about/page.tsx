import type { Metadata } from "next";
import { currentLang } from "@/lib/lang";
import { t } from "@/lib/strings";

export const metadata: Metadata = { title: "About" };

export default async function About() {
  const s = t(await currentLang());
  return (
    <article className="space-y-3 pt-2">
      <h1 className="text-2xl font-bold">{s.title}</h1>
      <p>{s.tagline}</p>
      <p>Yojana Mitra works on this website, on WhatsApp and inside Claude. It answers only from a database of schemes that a person has checked against the official source.</p>
      <p>Built for CSC operators, NGO workers, panchayat staff and anyone helping people apply for schemes.</p>
    </article>
  );
}
