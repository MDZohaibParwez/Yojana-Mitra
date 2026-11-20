import type { Metadata } from "next";
import { Chat } from "@/components/chat";
import { currentLang } from "@/lib/lang";
import { t } from "@/lib/strings";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage() {
  const lang = await currentLang();
  const s = t(lang);
  return (
    <div className="space-y-3 pt-2">
      <h1 className="text-2xl font-bold">{s.chatTitle}</h1>
      <Chat lang={lang} s={s} />
    </div>
  );
}
