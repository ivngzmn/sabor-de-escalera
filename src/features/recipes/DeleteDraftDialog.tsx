import { useEffect, useState } from "react";
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

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  photoCount: number;
  ingredientCount: number;
  updatedAt: string;
  lang: "en" | "es";
  onConfirm(): Promise<string | null>;
}

function relativeTime(iso: string, lang: "en" | "es") {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size)
      return rtf.format(Math.round(seconds / size), unit);
  return rtf.format(Math.min(seconds, 0), "second");
}

export default function DeleteDraftDialog(props: Props) {
  const { open, onOpenChange, lang } = props;
  const t = (en: string, es: string) => (lang === "es" ? es : en);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  async function confirm() {
    setPending(true);
    setError(null);
    try {
      setError(await props.onConfirm());
    } finally {
      setPending(false);
    }
  }
  const when = relativeTime(props.updatedAt, lang);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("Delete draft", "Eliminar borrador")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "This permanently removes the draft below. This can't be undone.",
              "Esto elimina definitivamente el borrador. No se puede deshacer.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-md border bg-background p-3 text-sm">
          <p className="font-semibold">
            {props.title.trim() || t("Untitled recipe", "Receta sin título")}
          </p>
          <p className="text-muted-foreground">
            {lang === "es"
              ? `${props.photoCount} fotos · ${props.ingredientCount} ingredientes · guardado ${when}`
              : `${props.photoCount} photos · ${props.ingredientCount} ingredients · last saved ${when}`}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" disabled={pending}>
            {t("Keep draft", "Conservar borrador")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {pending
              ? t("Deleting…", "Eliminando…")
              : t("Delete permanently", "Eliminar definitivamente")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
