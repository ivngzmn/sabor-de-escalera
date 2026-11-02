import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Proposal {
  id: string;
  recipeId: string;
  title: string;
  language: "en" | "es";
  sourceVersion: number;
  current: boolean;
}

/** Approve several reviewed translations at once. Proposals written for an older recipe version can't be selected. */
export default function BulkApprove({ proposals }: { proposals: Proposal[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  async function approve() {
    setBusy(true);
    setError("");
    try {
      const items = proposals.filter((p) => selected.has(p.id)).map((p) => ({ id: p.id, sourceVersion: p.sourceVersion }));
      const res = await fetch("/api/translations/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        redirect: "error",
        body: JSON.stringify({ action: "approve", items }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error?.message);
      setMessage(
        `${data.value.approved} approved.${data.value.conflicts.length ? ` ${data.value.conflicts.length} changed since review and were skipped; reload to see them.` : ""}`,
      );
      setSelected(new Set());
    } catch (e) {
      setError((e as Error).message || "That didn’t work. Please retry.");
    }
    setBusy(false);
  }
  if (!proposals.length) return <p className="m-0 text-muted-foreground">No translations are waiting for approval.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {proposals.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            <Checkbox id={`approve-${p.id}`} disabled={!p.current || busy} checked={selected.has(p.id)} onCheckedChange={(on) => toggle(p.id, on === true)} />
            <Label htmlFor={`approve-${p.id}`} className="font-normal">
              {p.title} ({p.language === "es" ? "Español" : "English"})
              {!p.current && " — recipe changed since this was written; reopen it to review"}
            </Label>
            <a href={`/admin/translations/${p.recipeId}`} className="ml-auto text-sm">
              Review
            </a>
          </li>
        ))}
      </ul>
      <div role="status" aria-live="polite" className="text-sm">
        {message}
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="button" className="self-start" disabled={busy || selected.size === 0} onClick={() => void approve()}>
        Approve selected ({selected.size})
      </Button>
    </div>
  );
}
