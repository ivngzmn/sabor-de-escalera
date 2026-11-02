import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Mark reviewed / publish controls for one staged cookbook recipe. The server re-checks every blocker. */
export default function CookbookEntryActions({ entryId, textReviewed, eligible }: { entryId: string; textReviewed: boolean; eligible: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: "review" | "publish") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/cookbook/${encodeURIComponent(entryId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        redirect: "error",
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) return window.location.reload();
      const reasons = data?.error?.fields?.map((f: { field: string }) => f.field).join(", ");
      setError(`${data?.error?.message ?? "That didn’t work. Please retry."}${reasons ? ` Still missing: ${reasons}.` : ""}`);
    } catch {
      setError("That didn’t work. Please retry.");
    }
    setBusy(false);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {!textReviewed && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => run("review")}>
            Mark text reviewed
          </Button>
        )}
        <Button type="button" disabled={busy || !eligible} onClick={() => run("publish")}>
          Publish recipe
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
