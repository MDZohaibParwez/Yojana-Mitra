"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reportAction } from "@/lib/actions";
import type { WebStrings } from "@/lib/strings";

export function ReportForm({ schemeId, s }: { schemeId: string; s: WebStrings }) {
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">⚑ {s.report}</summary>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await reportAction(schemeId, msg);
            setStatus(r.ok ? s.reportSent : r.error);
            if (r.ok) setMsg("");
          });
        }}
      >
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-background p-2"
          maxLength={2000}
          minLength={5}
          required
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={s.reportPlaceholder}
          aria-label={s.report}
        />
        <Button type="submit" variant="outline" disabled={pending}>{s.send}</Button>
        {status && <p role="status" className="text-sm">{status}</p>}
      </form>
    </details>
  );
}
