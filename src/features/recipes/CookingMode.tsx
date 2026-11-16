import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Ingredient, Instruction } from "./validation";

const copy = {
  en: {
    ingredients: "Ingredients",
    steps: "Steps",
    focusTab: "Focus step",
    allTab: "All steps",
    ingredientsTab: "Ingredients",
    awake: "Keep screen awake",
    on: "Your screen will stay on while cooking mode is open.",
    off: "Your screen may turn off as usual.",
    released: "Your device turned off the screen lock. Switch it on again if you need it.",
    unsupported: "This device can’t keep the screen on from the browser.",
    intro: "Step-by-step hands-free focus and synced ingredient checks.",
    stepOf: (cur: number, total: number) => `Step ${cur} of ${total}`,
    prevStep: "Previous step",
    nextStep: "Next step",
    finish: "All steps complete",
    noSteps: "No cooking steps listed for this recipe.",
    clear: "Clear checks",
  },
  es: {
    ingredients: "Ingredientes",
    steps: "Pasos",
    focusTab: "Paso a paso",
    allTab: "Todos los pasos",
    ingredientsTab: "Ingredientes",
    awake: "Mantener la pantalla encendida",
    on: "Tu pantalla seguirá encendida mientras el modo cocina esté abierto.",
    off: "Tu pantalla puede apagarse como de costumbre.",
    released: "Tu dispositivo desactivó el bloqueo de pantalla. Vuelve a activarlo si lo necesitas.",
    unsupported: "Este dispositivo no permite mantener la pantalla encendida desde el navegador.",
    intro: "Vista enfocada paso a paso y lista sincronizada de ingredientes.",
    stepOf: (cur: number, total: number) => `Paso ${cur} de ${total}`,
    prevStep: "Paso anterior",
    nextStep: "Siguiente paso",
    finish: "Pasos completados",
    noSteps: "Esta receta no tiene pasos registrados.",
    clear: "Limpiar marcas",
  },
};

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", fn: () => void): void;
}
type WakeState = "off" | "on" | "released" | "unsupported";

/** Phone/tablet cooking view using @ui-sdk/react Tabs and Progress with synced ingredient checks. */
export default function CookingMode({
  open,
  onOpenChange,
  title,
  ingredients,
  instructions,
  language,
  returnFocus,
  checkedIngredients,
  onToggleIngredient,
  onClearIngredients,
}: {
  returnFocus: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  language: "en" | "es";
  checkedIngredients?: Set<number>;
  onToggleIngredient?: (index: number, checked: boolean) => void;
  onClearIngredients?: () => void;
}) {
  const t = copy[language];
  const [wanted, setWanted] = useState(false);
  const [wake, setWake] = useState<WakeState>("off");
  const [localChecked, setLocalChecked] = useState<Set<number>>(new Set());
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [tab, setTab] = useState<string>("focus");
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  const checked = checkedIngredients ?? localChecked;
  const toggleCheck = (index: number, next: boolean) => {
    if (onToggleIngredient) {
      onToggleIngredient(index, next);
      return;
    }
    setLocalChecked((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(index);
      else updated.delete(index);
      return updated;
    });
  };
  const clearChecks = () => {
    if (onClearIngredients) onClearIngredients();
    else setLocalChecked(new Set());
  };

  const steps = useMemo(() => {
    let currentSection = "";
    const out: { text: string; section: string }[] = [];
    for (const row of instructions) {
      if (row.kind === "section") {
        currentSection = row.text;
      } else {
        out.push({ text: row.text, section: currentSection });
      }
    }
    return out;
  }, [instructions]);

  useEffect(() => {
    if (activeStepIndex >= steps.length && steps.length > 0) {
      setActiveStepIndex(steps.length - 1);
    }
  }, [steps.length, activeStepIndex]);

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
  const activeStep = steps[activeStepIndex];
  const stepPct = steps.length > 0 ? Math.round(((activeStepIndex + 1) / steps.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[100dvh] w-full max-w-3xl overflow-y-auto sm:max-h-[90dvh] sm:max-w-3xl"
        finalFocus={() => returnFocus.current}
      >
        <DialogHeader>
          <DialogTitle className="type-headline-md">{title}</DialogTitle>
          <DialogDescription>{t.intro}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/70 p-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="keep-awake" className="cursor-pointer font-semibold">
              {t.awake}
            </Label>
            <Switch id="keep-awake" checked={wanted} onCheckedChange={setWanted} />
          </div>
          <p role="status" className="m-0 text-xs text-muted-foreground">
            {status}
          </p>
        </div>

        <Tabs value={tab} onValueChange={(next) => { if (next) setTab(next); }} className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="focus">{t.focusTab}</TabsTrigger>
            <TabsTrigger value="all">{t.allTab}</TabsTrigger>
            <TabsTrigger value="ingredients">
              {t.ingredientsTab}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="focus" className="pt-3">
            {steps.length === 0 ? (
              <p className="text-muted-foreground">{t.noSteps}</p>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm font-semibold text-primary-ink tabular-nums">
                    <span>{t.stepOf(activeStepIndex + 1, steps.length)}</span>
                    <span>{stepPct}%</span>
                  </div>
                  <Progress value={stepPct} aria-label={t.stepOf(activeStepIndex + 1, steps.length)}>
                    <ProgressTrack>
                      <ProgressIndicator />
                    </ProgressTrack>
                  </Progress>
                </div>

                <div className="rounded-2xl border border-border bg-background p-6 shadow-xs">
                  {activeStep?.section && (
                    <p className="m-0 mb-2 text-xs font-semibold tracking-wider text-primary-ink uppercase">
                      {activeStep.section}
                    </p>
                  )}
                  <p className="author-text m-0 text-xl leading-relaxed text-foreground sm:text-2xl">
                    {activeStep?.text}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 flex-1"
                    disabled={activeStepIndex <= 0}
                    onClick={() => setActiveStepIndex((i) => Math.max(0, i - 1))}
                  >
                    <ArrowLeftIcon aria-hidden="true" />
                    {t.prevStep}
                  </Button>
                  {activeStepIndex < steps.length - 1 ? (
                    <Button
                      type="button"
                      className="min-h-12 flex-1"
                      onClick={() => setActiveStepIndex((i) => Math.min(steps.length - 1, i + 1))}
                    >
                      {t.nextStep}
                      <ArrowRightIcon aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-12 flex-1"
                      onClick={() => onOpenChange(false)}
                    >
                      <CheckIcon aria-hidden="true" />
                      {t.finish}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="all" className="pt-3">
            <section aria-labelledby="cook-steps">
              <h2 id="cook-steps" className="type-headline-sm mt-0 mb-3">
                {t.steps}
              </h2>
              <ol className="m-0 flex flex-col gap-4 pl-6 text-lg leading-relaxed">
                {instructions.map((row, i) =>
                  row.kind === "section" ? (
                    <li key={i} className="list-none pt-2">
                      <h3 className="m-0 text-base font-semibold text-primary-ink">{row.text}</h3>
                    </li>
                  ) : (
                    <li key={i} className="author-text">
                      {row.text}
                    </li>
                  ),
                )}
              </ol>
            </section>
          </TabsContent>

          <TabsContent value="ingredients" className="pt-3">
            <section aria-labelledby="cook-ingredients">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 id="cook-ingredients" className="type-headline-sm m-0">
                  {t.ingredients}
                </h2>
                {checked.size > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearChecks}>
                    {t.clear}
                  </Button>
                )}
              </div>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {ingredients.map((row, i) =>
                  row.kind === "section" ? (
                    <li key={i} className="pt-2">
                      <h3 className="m-0 text-base font-semibold text-primary-ink">{row.name}</h3>
                    </li>
                  ) : (
                    <li key={i} className="flex items-start gap-3">
                      <Checkbox
                        id={`cook-ingredient-${i}`}
                        className="mt-1 size-6"
                        checked={checked.has(i)}
                        onCheckedChange={(on) => toggleCheck(i, on === true)}
                      />
                      <Label
                        htmlFor={`cook-ingredient-${i}`}
                        className={cn(
                          "cursor-pointer text-lg leading-snug font-normal",
                          checked.has(i) && "text-muted-foreground line-through",
                        )}
                      >
                        {[row.quantity, row.unit, row.name].filter(Boolean).join(" ")}
                        {row.notes && ` — ${row.notes}`}
                      </Label>
                    </li>
                  ),
                )}
              </ul>
            </section>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
