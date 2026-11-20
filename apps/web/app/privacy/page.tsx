import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <article className="prose max-w-none space-y-3 pt-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold">
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p>Yojana Mitra helps people find government schemes. It is designed to work without collecting personal data.</p>
      <h2>What we never collect</h2>
      <p>Aadhaar, PAN, bank account or card numbers, OTPs, passwords, voter ID or any other identity number. If you type one, we reject the message and do not store it.</p>
      <h2>What we process</h2>
      <p>The details you give to check eligibility (age, state, income range, occupation, category, etc.) are used only to answer that request. On the website and in Claude they are not stored. On WhatsApp they are kept as a temporary conversation state for up to 60 minutes (keyed by a one-way hash, not your phone number) and then deleted. Voice notes are converted to text in memory and not stored.</p>
      <h2>Anonymous counters</h2>
      <p>We count usage by channel, tool, state, language and time only — never who you are. These counters cannot be linked to a person.</p>
      <h2>Reports</h2>
      <p>If you report wrong information, the message is stored after automatic removal of phone numbers, emails and ID numbers.</p>
      <h2>Third parties</h2>
      <p>WhatsApp messages pass through Meta&apos;s WhatsApp Business Platform. Voice notes are transcribed by our speech-to-text provider. When you use Yojana Mitra inside Claude, your conversation is handled by Anthropic under its own policies; our server receives only the tool inputs.</p>
      <h2>Contact</h2>
      <p>Open an issue in the project repository to ask a question or request deletion of a report.</p>
    </article>
  );
}
