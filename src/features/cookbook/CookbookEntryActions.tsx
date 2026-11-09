import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { missingLabel } from "./labels";

/** Fired by the correction form so this separate island can pause while edits are unsaved. */
export const UNSAVED_EVENT = "cookbook:unsaved";

/** Review and publish controls for one staged cookbook recipe. The server re-checks every blocker. */
export default function CookbookEntryActions({ entryId, version, textReviewed, detailsDone, imagesPending, sourcePending, sources, eligible }: {
  entryId: string;
  version: number;
  textReviewed: boolean;
  detailsDone: boolean;
  imagesPending: boolean;
  sourcePending: boolean;
  sources: string[];
  eligible: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  // Each action reloads the page, which would discard edits still open in the correction form.
  const [unsaved, setUnsaved] = useState(false);
  useEffect(() => {
    const listen = (event: Event) => setUnsaved((event as CustomEvent<boolean>).detail);
    window.addEventListener(UNSAVED_EVENT, listen);
    return () => window.removeEventListener(UNSAVED_EVENT, listen);
  }, []);
  async function run(action: "review" | "images" | "source" | "publish") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/cookbook/${encodeURIComponent(entryId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        redirect: "error",
        body: JSON.stringify(action === "publish" ? { action } : action === "source" ? { action, version, note } : { action, version }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) return window.location.reload();
      const reasons = data?.error?.fields?.map((f: { field: string }) => missingLabel(f.field)).join(", ");
      setError(`${data?.error?.message ?? "That didn’t work. Please retry."}${reasons ? ` Still needed: ${reasons}.` : ""}`);
    } catch {
      setError("That didn’t work. Please retry.");
    }
    setBusy(false);
  }
  const blocked = busy || unsaved;
  return (
    <div className="flex flex-col gap-3">
      {sourcePending && (
        <Field>
          <FieldLabel htmlFor="source-note-input">How was reuse cleared?</FieldLabel>
          {sources.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
              {sources.map((url) => (
                <li key={url} className="break-all">
                  <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                </li>
              ))}
            </ul>
          )}
          <Textarea id="source-note-input" rows={3} maxLength={400} value={note} onChange={(event) => setNote(event.currentTarget.value)} aria-describedby="source-note-hint" />
          <FieldDescription id="source-note-hint">For example: “Site owner agreed by email on March 3.” If it isn’t settled, leave this empty and the recipe stays unpublished.</FieldDescription>
          <Button type="button" variant="outline" disabled={blocked || !note.trim()} onClick={() => run("source")}>
            Save source note
          </Button>
        </Field>
      )}
      <div className="flex flex-col gap-2">
        {imagesPending && (
          <Button type="button" variant="outline" disabled={blocked} onClick={() => run("images")}>
            Approve images and credits
          </Button>
        )}
        {!textReviewed && detailsDone && (
          <Button type="button" variant="outline" disabled={blocked} onClick={() => run("review")}>
            Mark text reviewed
          </Button>
        )}
        <Button type="button" disabled={blocked || !eligible} onClick={() => run("publish")}>
          Publish recipe
        </Button>
        <p role="status" className="m-0 text-sm text-muted-foreground">
          {unsaved ? "Save your corrections first. These buttons reload the page." : eligible ? "" : "Publishing unlocks when every step is done."}
        </p>
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
