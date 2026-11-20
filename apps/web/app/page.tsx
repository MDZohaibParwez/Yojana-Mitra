import Link from "next/link";
import { ProfileForm } from "@/components/profile-form";
import { formConfig } from "@/lib/form-config";
import { currentLang } from "@/lib/lang";

export default async function Home() {
  const lang = await currentLang();
  const cfg = formConfig(lang);
  return (
    <div className="space-y-6 pt-2">
      <section>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{cfg.s.tagline}</h1>
        <p className="mt-2 text-muted-foreground">{cfg.s.formHint}</p>
        <p className="mt-2 text-sm">
          💬 <Link href="/chat" className="font-medium text-primary underline">{cfg.s.chat}</Link>
        </p>
      </section>
      <section aria-labelledby="form-title">
        <h2 id="form-title" className="mb-3 text-lg font-semibold">{cfg.s.formTitle}</h2>
        <ProfileForm cfg={cfg} />
      </section>
    </div>
  );
}
