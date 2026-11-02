import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fitToSource, sourceText, type TranslatableText } from "@/features/recipes/translation-text";
import type { RecipeInput } from "@/features/recipes/validation";

interface Existing {
  id: string;
  status: string;
  source_version: number;
  input: TranslatableText;
}

/** Side-by-side manual translation: original on the left, editable target on the right. Quantities are shown, never translated. */
export default function TranslationEditor({
  recipeId,
  source,
  version,
  target,
  proposed,
  approved,
}: {
  recipeId: string;
  source: RecipeInput;
  version: number;
  target: "en" | "es";
  proposed: Existing | null;
  approved: Existing | null;
}) {
  const original = sourceText(source);
  const stale = proposed !== null && proposed.source_version !== version;
  const [text, setText] = useState<TranslatableText>(() => fitToSource(proposed?.input ?? approved?.input ?? original, original));
  const [proposal, setProposal] = useState<string | null>(proposed?.source_version === version ? proposed.id : null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [approvedNow, setApprovedNow] = useState(false);
  const set = (patch: Partial<TranslatableText>) => {
    setText((t) => ({ ...t, ...patch }));
    setProposal(null);
  };
  async function send(body: unknown) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/translations/${encodeURIComponent(recipeId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        redirect: "error",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStatus({ tone: "error", message: data?.error?.message ?? "That didn’t work. Your text is still here; please retry." });
        return null;
      }
      return data.value;
    } catch {
      setStatus({ tone: "error", message: "That didn’t work. Your text is still here; please retry." });
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const value = await send({ action: "save", language: target, sourceVersion: version, input: text });
    if (value) {
      setProposal(value.id);
      setApprovedNow(false);
      setStatus({ tone: "ok", message: "Saved as a proposal. Readers still see the approved text until you approve this one." });
    }
  }
  async function approve() {
    if (!proposal) return;
    const value = await send({ action: "approve", items: [{ id: proposal, sourceVersion: version }] });
    if (!value) return;
    if (value.conflicts.length)
      setStatus({ tone: "error", message: "The recipe changed after this proposal. Reload the page and review it again." });
    else {
      setProposal(null);
      setApprovedNow(true);
      setStatus({ tone: "ok", message: "Approved. Readers now see this translation." });
    }
  }
  // Each input names its row and is described by the original text beside it.
  const field = (id: string, label: string, from: string, value: string, onChange: (v: string) => void, long = false) => (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <span aria-hidden="true" className="text-xs font-semibold text-muted-foreground uppercase">
          {label} · original
        </span>
        <p id={`${id}-original`} className="author-text m-0 rounded-md bg-muted p-2 text-sm" lang={source.language}>
          <span className="sr-only">Original: </span>
          {from || "—"}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        {long ? (
          <Textarea id={id} lang={target} value={value} aria-describedby={`${id}-original`} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Input id={id} lang={target} value={value} aria-describedby={`${id}-original`} onChange={(e) => onChange(e.target.value)} />
        )}
      </div>
    </div>
  );
  let step = 0;
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant="eyebrow">Recipe version {version}</Badge>
        {(approved || approvedNow) && <Badge variant="tag">Approved translation on file</Badge>}
      </div>
      {stale && (
        <Alert>
          <AlertDescription>
            The saved proposal was written for recipe version {proposed!.source_version}. It has been fitted to the current rows;
            check every row against the original before saving.
          </AlertDescription>
        </Alert>
      )}
      {field("t-title", "Title", original.title, text.title, (v) => set({ title: v }))}
      {field("t-yield", "Yield", original.yieldText, text.yieldText, (v) => set({ yieldText: v }))}
      {field("t-story", "Story", original.story, text.story, (v) => set({ story: v }), true)}
      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <legend className="type-headline-sm">Ingredients</legend>
        {source.ingredients.map((row, i) => (
          <fieldset key={i} className="flex flex-col gap-2 rounded-lg border p-3">
            <legend className="px-1 font-semibold">
              {row.kind === "section" ? `Section: ${row.name}` : `Ingredient ${i + 1}: ${row.name}`}
            </legend>
            {row.kind === "ingredient" && (
              <p className="m-0 text-sm text-muted-foreground">Quantity (not translated): {row.quantity || "—"}</p>
            )}
            {field(`t-ing-${i}`, row.kind === "section" ? "Heading" : "Ingredient", row.name, text.ingredients[i]?.name ?? "", (v) =>
              set({ ingredients: text.ingredients.map((r, j) => (j === i ? { ...r, name: v } : r)) }),
            )}
            {row.kind === "ingredient" && (
              <>
                {field(`t-unit-${i}`, "Unit", row.unit, text.ingredients[i]?.unit ?? "", (v) =>
                  set({ ingredients: text.ingredients.map((r, j) => (j === i ? { ...r, unit: v } : r)) }),
                )}
                {field(`t-notes-${i}`, "Notes", row.notes, text.ingredients[i]?.notes ?? "", (v) =>
                  set({ ingredients: text.ingredients.map((r, j) => (j === i ? { ...r, notes: v } : r)) }),
                )}
              </>
            )}
          </fieldset>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <legend className="type-headline-sm">Steps</legend>
        {source.instructions.map((row, i) =>
          field(`t-step-${i}`, row.kind === "section" ? "Heading" : `Step ${++step}`, row.text, text.instructions[i]?.text ?? "", (v) =>
            set({ instructions: text.instructions.map((r, j) => (j === i ? { text: v } : r)) }),
            row.kind === "step",
          ),
        )}
      </fieldset>
      {source.photos.length > 0 && (
        <fieldset className="flex flex-col gap-4 border-0 p-0">
          <legend className="type-headline-sm">Photo captions</legend>
          {source.photos.map((p, i) =>
            field(`t-cap-${i}`, `Caption ${i + 1}`, p.caption, text.captions[i] ?? "", (v) =>
              set({ captions: text.captions.map((c, j) => (j === i ? v : c)) }),
            ),
          )}
        </fieldset>
      )}
      {field("t-notes", "Author notes", original.notes, text.notes, (v) => set({ notes: v }), true)}
      {/* Always rendered so screen readers announce each new message. */}
      <div role="status" aria-live="polite" className={status?.tone === "ok" ? "rounded-lg border p-3 text-sm" : "sr-only"}>
        {status?.tone === "ok" ? status.message : ""}
      </div>
      {status?.tone === "error" && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          Save proposal
        </Button>
        <Button type="button" variant="outline" disabled={busy || !proposal} onClick={() => void approve()}>
          Approve for readers
        </Button>
      </div>
    </form>
  );
}
