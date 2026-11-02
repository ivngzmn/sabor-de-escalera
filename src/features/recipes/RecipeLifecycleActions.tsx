import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";

type Action = "unpublish" | "delete-recipe" | "restore";
const copy = {
  en: {
    unpublish: "Unpublish to edit",
    edit: "Edit",
    delete: "Delete",
    restore: "Restore",
    confirmTitle: (t: string) => `Delete “${t}”?`,
    confirmBody: "It disappears from Discover, favorites and your profile. You can restore it for 30 days.",
    cancel: "Keep recipe",
    failed: "That didn’t work. Your recipe is unchanged. Please try again.",
    conflict: "This recipe changed elsewhere. Reload the page to see the latest version.",
    expired: "This recipe can no longer be restored.",
  },
  es: {
    unpublish: "Despublicar para editar",
    edit: "Editar",
    delete: "Eliminar",
    restore: "Restaurar",
    confirmTitle: (t: string) => `¿Eliminar «${t}»?`,
    confirmBody: "Desaparecerá de Descubrir, de los favoritos y de tu perfil. Puedes restaurarla durante 30 días.",
    cancel: "Conservar receta",
    failed: "No funcionó. Tu receta no cambió. Inténtalo de nuevo.",
    conflict: "Esta receta cambió en otro lugar. Recarga la página para ver la versión más reciente.",
    expired: "Esta receta ya no se puede restaurar.",
  },
};

/** My Recipes controls. Live recipes are unpublished before editing; deletion is recoverable for 30 days. */
export default function RecipeLifecycleActions({
  id,
  title,
  state,
  version,
  language,
}: {
  id: string;
  title: string;
  state: string;
  version: number;
  language: "en" | "es";
}) {
  const t = copy[language];
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  async function run(action: Action) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        redirect: "error",
        body: JSON.stringify(action === "restore" ? { action } : { action, version }),
      });
      if (res.ok) {
        // The server owns list membership and counts, so reload rather than patch three lists.
        window.location.reload();
        return;
      }
      setError(res.status === 409 ? t.conflict : res.status === 410 ? t.expired : t.failed);
    } catch {
      setError(t.failed);
    }
    setBusy(false);
  }
  const editHref = `/add-recipe?draft=${encodeURIComponent(id)}${language === "es" ? "&lang=es" : ""}`;
  return (
    <div className="relative z-10 flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {state === "published" && (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => run("unpublish")}>
            {t.unpublish}
          </Button>
        )}
        {state === "unpublished" && (
          <a href={editHref} data-slot="button" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t.edit}
          </a>
        )}
        {state === "deleted" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => run("restore")}>
            {t.restore}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            {t.delete}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmTitle(title)}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => run("delete-recipe")}
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
