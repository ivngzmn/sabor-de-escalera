import { useEffect, useRef, useState, type RefObject } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Ingredient, Instruction } from "./validation";

const copy = {
  en: {
    ingredients: "Ingredients",
    steps: "Steps",
    awake: "Keep screen awake",
    on: "Your screen will stay on while cooking mode is open.",
    off: "Your screen may turn off as usual.",
    released: "Your device turned off the screen lock. Switch it on again if you need it.",
    unsupported: "This device can’t keep the screen on from the browser.",
    intro: "Large steps and ingredient checks for cooking.",
  },
  es: {
    ingredients: "Ingredientes",
    steps: "Pasos",
    awake: "Mantener la pantalla encendida",
    on: "Tu pantalla seguirá encendida mientras el modo cocina esté abierto.",
    off: "Tu pantalla puede apagarse como de costumbre.",
    released: "Tu dispositivo desactivó el bloqueo de pantalla. Vuelve a activarlo si lo necesitas.",
    unsupported: "Este dispositivo no permite mantener la pantalla encendida desde el navegador.",
    intro: "Pasos grandes y lista de ingredientes para cocinar.",
  },
};

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", fn: () => void): void;
}
type WakeState = "off" | "on" | "released" | "unsupported";

/** Phone/tablet cooking view. No timer; Wake Lock only while open and enabled, re-requested on return if still enabled. */
export default function CookingMode({
  open,
  onOpenChange,
  title,
  ingredients,
  instructions,
  language,
  returnFocus,
}: {
  returnFocus: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  language: "en" | "es";
}) {
  const t = copy[language];
  const [wanted, setWanted] = useState(false);
  const [wake, setWake] = useState<WakeState>("off");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!open || !wanted) return;
    const api = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!api) {
      setWake("unsupported");
      return;
    }
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel.current && !sentinel.current.released)) return;
      try {
        const lock = await api.request("screen");
        if (cancelled) return void lock.release();
        sentinel.current = lock;
        setWake("on");
        lock.addEventListener("release", () => {
          if (!cancelled && document.visibilityState === "visible") setWake("released");
        });
      } catch {
        if (!cancelled) setWake("released");
      }
    };
    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel.current?.release().catch(() => {});
      sentinel.current = null;
      setWake("off");
    };
  }, [open, wanted]);

  const status = !wanted ? t.off : wake === "unsupported" ? t.unsupported : wake === "released" ? t.released : t.on;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[100dvh] w-full max-w-3xl overflow-y-auto sm:max-h-[90dvh]"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="type-headline-md">{title}</DialogTitle>
          <DialogDescription>{t.intro}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="keep-awake">{t.awake}</Label>
            <Switch id="keep-awake" checked={wanted} onCheckedChange={setWanted} />
          </div>
          <p role="status" className="m-0 text-sm text-muted-foreground">
            {status}
          </p>
        </div>
        <section aria-labelledby="cook-ingredients">
          <h2 id="cook-ingredients" className="type-headline-sm">{t.ingredients}</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {ingredients.map((row, i) =>
              row.kind === "section" ? (
                <li key={i}>
                  <h3 className="m-0 text-base font-semibold">{row.name}</h3>
                </li>
              ) : (
                <li key={i} className="flex items-start gap-3">
                  <Checkbox
                    id={`cook-ingredient-${i}`}
                    className="mt-1 size-6"
                    checked={checked.has(i)}
                    onCheckedChange={(on) =>
                      setChecked((s) => {
                        const next = new Set(s);
                        if (on) next.add(i);
                        else next.delete(i);
                        return next;
                      })
                    }
                  />
                  <Label htmlFor={`cook-ingredient-${i}`} className="text-lg leading-snug font-normal">
                    {[row.quantity, row.unit, row.name].filter(Boolean).join(" ")}
                    {row.notes && ` — ${row.notes}`}
                  </Label>
                </li>
              ),
            )}
          </ul>
        </section>
        <section aria-labelledby="cook-steps">
          <h2 id="cook-steps" className="type-headline-sm">{t.steps}</h2>
          <ol className="m-0 flex flex-col gap-5 pl-6 text-xl leading-relaxed">
            {instructions.map((row, i) =>
              row.kind === "section" ? (
                <li key={i} className="list-none">
                  <h3 className="m-0 text-lg font-semibold">{row.text}</h3>
                </li>
              ) : (
                <li key={i} className="author-text">
                  {row.text}
                </li>
              ),
            )}
          </ol>
        </section>
      </DialogContent>
    </Dialog>
  );
}
