import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import ImageUploader from "@/features/media/ImageUploader";
import { categories, type FieldError, type Origin, type RecipeInput } from "@/features/recipes/validation";

export interface CreditDraft {
  kind: "owner" | "stock" | "ai";
  photographer: string;
  sourceUrl: string;
  license: string;
  retrievedOn: string;
  cropping: string;
}
interface Props {
  entryId: string;
  version: number;
  input: RecipeInput;
  origins: Origin[];
  credits: Record<string, CreditDraft>;
  mediaAvailable: boolean;
}

async function send(entryId: string, body: unknown) {
  const res = await fetch(`/api/cookbook/${encodeURIComponent(entryId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    redirect: "error",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (res.ok && data?.ok) return { ok: true as const };
  return { ok: false as const, message: data?.error?.message ?? "That didn’t work. Please retry.", fields: (data?.error?.fields ?? []) as FieldError[] };
}
const minutes = (value: string) => (value.trim() === "" ? null : Number(value));

/** Admin corrections for a staged cookbook recipe: fill gaps, fix wording, manage photos. Rows stay as the book has them. */
export default function CookbookCorrectionForm({ entryId, version, input: initial, origins, credits, mediaAvailable }: Props) {
  const [input, setInput] = useState<RecipeInput>(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; fields: FieldError[] } | null>(null);
  const set = <K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) => setInput((current) => ({ ...current, [key]: value }));
  const invalid = (field: string) => Boolean(error?.fields.some((f) => f.field === field || f.field.startsWith(`${field}.`)));
  const saved = new Set(initial.photos.map((p) => p.assetId));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await send(entryId, { action: "correct", version, input, reason });
    if (result.ok) return window.location.reload();
    setError(result);
    setBusy(false);
    document.getElementById("correction-error")?.focus();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-8" aria-labelledby="correction-heading" noValidate>
      <h2 id="correction-heading" className="m-0">Correct this recipe</h2>
      <p className="m-0 text-muted-foreground">
        Fill in what the book leaves out and fix spelling or formatting without changing meaning. Rows can’t be added or removed. Saving sends changed text back for review.
      </p>

      <FieldSet>
        <FieldLegend>Details</FieldLegend>
        <FieldGroup>
          <Field data-invalid={invalid("title")}>
            <FieldLabel htmlFor="fix-title">Title</FieldLabel>
            <Input id="fix-title" value={input.title} aria-invalid={invalid("title")} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={invalid("category")}>
              <FieldLabel htmlFor="fix-category">Category</FieldLabel>
              <NativeSelect id="fix-category" value={input.category} aria-invalid={invalid("category")} onChange={(e) => set("category", e.target.value)}>
                <NativeSelectOption value="">Not set</NativeSelectOption>
                {categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.en}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field data-invalid={invalid("origin")}>
              <FieldLabel htmlFor="fix-origin">Origin</FieldLabel>
              <NativeSelect id="fix-origin" value={input.origin} aria-invalid={invalid("origin")} onChange={(e) => set("origin", e.target.value)}>
                <NativeSelectOption value="">Not set</NativeSelectOption>
                {origins.map((o) => <NativeSelectOption key={o.id} value={o.id}>{o.label_en}</NativeSelectOption>)}
              </NativeSelect>
              <FieldDescription>Use the origin the contributor confirmed; don’t guess from the dish name.</FieldDescription>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={invalid("yieldText")}>
              <FieldLabel htmlFor="fix-yield">Yield as printed</FieldLabel>
              <Input id="fix-yield" value={input.yieldText} aria-invalid={invalid("yieldText")} onChange={(e) => set("yieldText", e.target.value)} />
            </Field>
            <Field data-invalid={invalid("baseline")}>
              <FieldLabel htmlFor="fix-baseline">Servings for scaling</FieldLabel>
              <Input id="fix-baseline" type="number" inputMode="numeric" min={1} value={input.baseline ?? ""} aria-invalid={invalid("baseline")} onChange={(e) => set("baseline", e.target.value === "" ? null : Number(e.target.value))} />
            </Field>
          </div>
          <Field orientation="horizontal" data-invalid={invalid("baselineConfirmed")}>
            <Checkbox id="fix-baseline-confirmed" checked={input.baselineConfirmed} onCheckedChange={(checked) => set("baselineConfirmed", checked === true)} />
            <FieldLabel htmlFor="fix-baseline-confirmed">The servings number is confirmed, not estimated</FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Time</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fix-timing-mode">How the time is given</FieldLabel>
            <NativeSelect id="fix-timing-mode" value={input.timing.mode} onChange={(e) => set("timing", { ...input.timing, mode: e.target.value as "total" | "parts" })}>
              <NativeSelectOption value="total">One total time</NativeSelectOption>
              <NativeSelectOption value="parts">Prep, cook and rest times</NativeSelectOption>
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            {(input.timing.mode === "total" ? (["total"] as const) : (["prep", "cook", "rest"] as const)).map((part) => (
              <Field key={part} data-invalid={invalid(`timing.${part}`) || invalid("timing")}>
                <FieldLabel htmlFor={`fix-time-${part}`}>{`${part[0].toUpperCase()}${part.slice(1)} minutes`}</FieldLabel>
                <Input id={`fix-time-${part}`} type="number" inputMode="numeric" min={0} value={input.timing[part] ?? ""} aria-invalid={invalid(`timing.${part}`) || invalid("timing")} onChange={(e) => set("timing", { ...input.timing, [part]: minutes(e.target.value) })} />
              </Field>
            ))}
          </div>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Ingredients</FieldLegend>
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {input.ingredients.map((row, i) => {
            const update = (patch: Partial<typeof row>) => set("ingredients", input.ingredients.map((r, n) => (n === i ? { ...r, ...patch } : r)));
            return (
              <li key={i}>
                {row.kind === "section" ? (
                  <Field>
                    <FieldLabel htmlFor={`fix-ing-${i}-name`}>{`Section heading ${i + 1}`}</FieldLabel>
                    <Input id={`fix-ing-${i}-name`} value={row.name} onChange={(e) => update({ name: e.target.value })} />
                  </Field>
                ) : (
                  <fieldset className="grid gap-2 border-0 p-0 sm:grid-cols-[6rem_6rem_1fr_1fr]">
                    <legend className="sr-only">{`Ingredient ${i + 1}`}</legend>
                    {(["quantity", "unit", "name", "notes"] as const).map((key) => (
                      <Field key={key} data-invalid={invalid(`ingredients.${i}.${key}`)}>
                        <FieldLabel htmlFor={`fix-ing-${i}-${key}`} className="text-xs">{`${key[0].toUpperCase()}${key.slice(1)}`}</FieldLabel>
                        <Input id={`fix-ing-${i}-${key}`} value={row[key]} aria-invalid={invalid(`ingredients.${i}.${key}`)} onChange={(e) => update({ [key]: e.target.value })} />
                      </Field>
                    ))}
                  </fieldset>
                )}
              </li>
            );
          })}
        </ol>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Instructions</FieldLegend>
        <FieldGroup>
          {input.instructions.map((row, i) => (
            <Field key={i} data-invalid={invalid(`instructions.${i}`)}>
              <FieldLabel htmlFor={`fix-step-${i}`}>{row.kind === "section" ? `Section heading ${i + 1}` : `Step ${i + 1}`}</FieldLabel>
              {row.kind === "section" ? (
                <Input id={`fix-step-${i}`} value={row.text} onChange={(e) => set("instructions", input.instructions.map((r, n) => (n === i ? { ...r, text: e.target.value } : r)))} />
              ) : (
                <Textarea id={`fix-step-${i}`} rows={3} value={row.text} aria-invalid={invalid(`instructions.${i}`)} onChange={(e) => set("instructions", input.instructions.map((r, n) => (n === i ? { ...r, text: e.target.value } : r)))} />
              )}
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Photos</FieldLegend>
        <FieldDescription>Use photos the contributor permitted, individually checked Pexels or Unsplash photos, or approved AI images. Each photo needs a credit before images can be approved.</FieldDescription>
        <ol className="m-0 flex list-none flex-col gap-6 p-0">
          {input.photos.map((p, i) => {
            const update = (patch: Partial<typeof p>) => set("photos", input.photos.map((x, n) => (n === i ? { ...x, ...patch } : x)));
            return (
              <li key={p.assetId} className="flex flex-col gap-3 rounded-lg border border-input/60 p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <img src={`/api/media/${p.assetId}?variant=thumb`} alt="" width={160} height={120} className="rounded-md bg-muted object-cover" />
                  <div className="flex flex-1 flex-col gap-3">
                    <Field data-invalid={invalid(`photos.${i}.caption`)}>
                      <FieldLabel htmlFor={`fix-photo-${i}-caption`}>{`Photo ${i + 1} caption`}</FieldLabel>
                      <Input id={`fix-photo-${i}-caption`} value={p.caption} maxLength={400} aria-invalid={invalid(`photos.${i}.caption`)} onChange={(e) => update({ caption: e.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`fix-photo-${i}-alt`}>{`Photo ${i + 1} alt text (optional)`}</FieldLabel>
                      <Input id={`fix-photo-${i}-alt`} value={p.alt} maxLength={400} onChange={(e) => update({ alt: e.target.value })} />
                      <FieldDescription>Leave blank to use the caption.</FieldDescription>
                    </Field>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {i > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => set("photos", [p, ...input.photos.filter((_, n) => n !== i)])}>
                      Make cover
                    </Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => set("photos", input.photos.filter((_, n) => n !== i))}>
                    {`Remove photo ${i + 1}`}
                  </Button>
                </div>
                {saved.has(p.assetId) ? (
                  <PhotoCreditForm entryId={entryId} version={version} assetId={p.assetId} index={i} initial={credits[p.assetId]} />
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">Save corrections to add this photo’s credit.</p>
                )}
              </li>
            );
          })}
        </ol>
        {input.photos.length < 6 && (
          <ImageUploader
            purpose="recipe"
            available={mediaAvailable}
            onComplete={(asset) =>
              setInput((current) =>
                current.photos.length >= 6 || current.photos.some((p) => p.assetId === asset.id)
                  ? current
                  : { ...current, photos: [...current.photos, { assetId: asset.id, width: asset.width, height: asset.height, caption: "", alt: "", crop: { x: 50, y: 50, zoom: 1 } }] },
              )
            }
          />
        )}
      </FieldSet>

      <Field data-invalid={invalid("reason")}>
        <FieldLabel htmlFor="fix-reason">Reason for this correction</FieldLabel>
        <Textarea id="fix-reason" rows={2} maxLength={400} required value={reason} aria-invalid={invalid("reason")} onChange={(e) => setReason(e.target.value)} />
        <FieldDescription>Kept in the audit log, for example “Contributor confirmed 8 servings by email.”</FieldDescription>
      </Field>
      {error && (
        <Alert variant="destructive" role="alert" id="correction-error" tabIndex={-1}>
          <AlertDescription>
            {error.message}
            {error.fields.length > 0 && (
              <ul className="mt-2 mb-0">
                {error.fields.map((f) => <li key={`${f.field}-${f.message}`}>{`${f.field}: ${f.message}`}</li>)}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save corrections"}</Button>
      </div>
    </form>
  );
}

const emptyCredit: CreditDraft = { kind: "stock", photographer: "", sourceUrl: "", license: "", retrievedOn: "", cropping: "" };

/** Where one photo came from and under what permission. Saved on its own; any change reopens image review. */
function PhotoCreditForm({ entryId, version, assetId, index, initial }: { entryId: string; version: number; assetId: string; index: number; initial?: CreditDraft }) {
  const [credit, setCredit] = useState<CreditDraft>(initial ?? emptyCredit);
  const [state, setState] = useState<{ busy: boolean; message: string; failed: boolean }>({ busy: false, message: "", failed: false });
  const id = (key: string) => `credit-${index}-${key}`;
  const set = (key: keyof CreditDraft, value: string) => setCredit((c) => ({ ...c, [key]: value }));
  async function save() {
    setState({ busy: true, message: "", failed: false });
    const fields =
      credit.kind === "ai" ? { kind: "ai", license: credit.license, cropping: credit.cropping }
      : credit.kind === "owner" ? { kind: "owner", photographer: credit.photographer, license: credit.license, cropping: credit.cropping, ...(credit.retrievedOn ? { retrievedOn: credit.retrievedOn } : {}) }
      : credit;
    const result = await send(entryId, { action: "credit", version, assetId, credit: fields });
    if (result.ok) return window.location.reload();
    setState({ busy: false, failed: true, message: [result.message, ...result.fields.map((f) => f.message)].join(" ") });
  }
  return (
    <fieldset className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      <legend className="px-1 font-semibold">{`Photo ${index + 1} credit${initial ? "" : " (not recorded yet)"}`}</legend>
      <Field>
        <FieldLabel htmlFor={id("kind")}>Source</FieldLabel>
        <NativeSelect id={id("kind")} value={credit.kind} onChange={(e) => set("kind", e.target.value)}>
          <NativeSelectOption value="owner">Contributor or owner gave permission</NativeSelectOption>
          <NativeSelectOption value="stock">Pexels or Unsplash (shown as “Illustrative photo”)</NativeSelectOption>
          <NativeSelectOption value="ai">AI-generated (shown as “AI-generated illustrative image”)</NativeSelectOption>
        </NativeSelect>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {credit.kind !== "ai" && (
          <Field>
            <FieldLabel htmlFor={id("photographer")}>Photographer</FieldLabel>
            <Input id={id("photographer")} value={credit.photographer} maxLength={120} onChange={(e) => set("photographer", e.target.value)} />
          </Field>
        )}
        {credit.kind === "stock" && (
          <Field>
            <FieldLabel htmlFor={id("source")}>Photo page on Pexels or Unsplash</FieldLabel>
            <Input id={id("source")} type="url" value={credit.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={id("license")}>{credit.kind === "owner" ? "How permission was given" : credit.kind === "ai" ? "Generator and approved terms" : "Licence"}</FieldLabel>
          <Input id={id("license")} value={credit.license} maxLength={200} onChange={(e) => set("license", e.target.value)} />
        </Field>
        {credit.kind !== "ai" && (
          <Field>
            <FieldLabel htmlFor={id("date")}>{credit.kind === "stock" ? "Retrieved on" : "Permission date (optional)"}</FieldLabel>
            <Input id={id("date")} type="date" value={credit.retrievedOn} onChange={(e) => set("retrievedOn", e.target.value)} />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={id("cropping")}>Cropping or edits (optional)</FieldLabel>
          <Input id={id("cropping")} value={credit.cropping} maxLength={200} onChange={(e) => set("cropping", e.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" disabled={state.busy} onClick={save}>
          {`Save photo ${index + 1} credit`}
        </Button>
      </div>
      <p role={state.failed ? "alert" : "status"} className={state.failed ? "m-0 text-sm text-destructive" : "m-0 text-sm"}>{state.message}</p>
    </fieldset>
  );
}
