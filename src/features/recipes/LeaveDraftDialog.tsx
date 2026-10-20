import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  title: string;
  lang: "en" | "es";
  conflict: boolean;
  onKeepEditing(): void;
  onDiscard(): Promise<void>;
  onSave(): Promise<boolean>;
}

export default function LeaveDraftDialog(props: Props) {
  const { open, lang, conflict } = props;
  const t = (en: string, es: string) => (lang === "es" ? es : en);
  const [pending, setPending] = useState(false);
  const save = useRef<HTMLButtonElement>(null);
  // Success navigates away, so buttons stay disabled; failure closes the dialog.
  useEffect(() => {
    if (!open) setPending(false);
  }, [open]);
  async function run(action: () => Promise<unknown>) {
    setPending(true);
    try {
      if ((await action()) === false) setPending(false);
    } catch {
      setPending(false);
    }
  }
  const name = props.title.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) props.onKeepEditing();
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Focus the safe primary action, never Discard: Enter must not delete.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          save.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t(
              "Save your recipe before leaving?",
              "¿Guardar tu receta antes de salir?",
            )}
          </DialogTitle>
          <DialogDescription>
            {name
              ? t(
                  `You've started “${name}”. Save it as a draft to finish later, or discard it.`,
                  `Empezaste “${name}”. Guárdala como borrador para terminarla después o descártala.`,
                )
              : t(
                  "You've started your recipe. Save it as a draft to finish later, or discard it.",
                  "Empezaste tu receta. Guárdala como borrador para terminarla después o descártala.",
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={pending}
            onClick={() => void run(props.onDiscard)}
          >
            {t("Discard", "Descartar")}
          </Button>
          <div className="flex flex-col gap-2 min-[480px]:flex-row">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={props.onKeepEditing}
            >
              {t("Keep editing", "Seguir editando")}
            </Button>
            <Button
              ref={save}
              type="button"
              disabled={pending}
              onClick={() => void run(props.onSave)}
            >
              {conflict
                ? t("Save as separate draft", "Guardar como otro borrador")
                : t("Save draft", "Guardar borrador")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
