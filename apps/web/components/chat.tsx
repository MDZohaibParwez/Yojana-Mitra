"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Lang } from "@ym/core/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chatAction } from "@/lib/actions";
import type { WebStrings } from "@/lib/strings";

type Msg = { from: "user" | "bot"; text: string; buttons?: Array<{ id: string; title: string }> };

/** Minimal WhatsApp-style markup: *bold* and _italic_, links auto-detected. Text is escaped by React. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_|https:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <strong key={i}>{p.slice(1, -1)}</strong>
        : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em>
        : p.startsWith("https://") ? <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">{p}</a>
        : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export function Chat({ lang, s }: { lang: Lang; s: WebStrings }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [state, setState] = useState<unknown>({ v: 1, lang, profile: {}, skipped: [], questionsAsked: 0, resultPage: 0, seen: [] });
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = (input: { text?: string; replyId?: string }, shown: string) => {
    setMsgs((m) => [...m, { from: "user", text: shown }]);
    start(async () => {
      const r = await chatAction(state, input);
      if (!r.ok) return setMsgs((m) => [...m, { from: "bot", text: r.error }]);
      setState(r.data.state);
      setMsgs((m) => [
        ...m,
        ...r.data.messages.map((x) => ({ from: "bot" as const, text: x.text, buttons: x.buttons ?? x.list?.rows.map((row) => ({ id: row.id, title: row.title })) })),
      ]);
    });
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-lg border border-border">
      <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {msgs.length === 0 && <p className="text-sm text-muted-foreground">{s.chatPlaceholder}</p>}
        {msgs.map((m, i) => (
          <div key={i} className={m.from === "user" ? "ml-auto max-w-[85%] rounded-lg bg-primary p-2 text-primary-foreground" : "max-w-[92%] rounded-lg bg-muted p-2"}>
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed"><Rich text={m.text} /></div>
            {m.buttons && i === msgs.length - 1 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.buttons.map((b) => (
                  <Button key={b.id} variant="outline" className="min-h-10 px-3 text-sm" disabled={pending} onClick={() => send({ replyId: b.id }, b.title)}>
                    {b.title}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
        {pending && <p className="text-sm text-muted-foreground">…</p>}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = text.trim();
          if (!v) return;
          setText("");
          send({ text: v }, v);
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={s.chatPlaceholder} aria-label={s.chatTitle} maxLength={1000} autoComplete="off" />
        <Button type="submit" disabled={pending}>{s.send}</Button>
      </form>
    </div>
  );
}
