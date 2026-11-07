import { useMemo, useRef, useState } from "react";
import { CopyIcon, MinusIcon, PlusIcon, ReaderIcon } from "@radix-ui/react-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CookingMode from "./CookingMode";
import GalleryDialog from "./GalleryDialog";
import RecipePreview from "./RecipePreview";
import type { PhotoCredit } from "./catalog";
import { photoCreditText } from "./photo-credit";
import { clampServings, scaleQuantity } from "./scaling";
import { applyTranslation, type TranslatableText } from "./translation-text";
import type { Origin, RecipeInput } from "./validation";

const copy = {
  en: {
    servings: "Servings",
    fewer: "Fewer servings",
    more: "More servings",
    original: (n: number) => `Original recipe: ${n} ${n === 1 ? "serving" : "servings"}`,
    reset: "Reset to original",
    scaledNote: "Amounts are adjusted. Times, temperatures and “to taste” amounts stay as written.",
    copy: "Copy link",
    copied: "Link copied.",
    copyFailed: "Couldn’t copy. Select the address bar to copy the link.",
    print: "Print recipe",
    cook: "Cooking mode",
    fallback: (lang: string) => `This recipe is shown in its original language (${lang}).`,
    translated: (lang: string) => `Translated from ${lang} and reviewed.`,
  },
  es: {
    servings: "Porciones",
    fewer: "Menos porciones",
    more: "Más porciones",
    original: (n: number) => `Receta original: ${n} ${n === 1 ? "porción" : "porciones"}`,
    reset: "Volver a la original",
    scaledNote: "Las cantidades están ajustadas. Los tiempos, temperaturas y cantidades «al gusto» se mantienen.",
    copy: "Copiar enlace",
    copied: "Enlace copiado.",
    copyFailed: "No se pudo copiar. Selecciona la barra de direcciones para copiar el enlace.",
    print: "Imprimir receta",
    cook: "Modo cocina",
    fallback: (lang: string) => `Esta receta se muestra en su idioma original (${lang}).`,
    translated: (lang: string) => `Traducida del ${lang} y revisada.`,
  },
};
const languageName = { en: { en: "English", es: "Spanish" }, es: { en: "inglés", es: "español" } };

/** Public recipe reader: serving scaling, share, print and cooking mode around the shared preview renderer. */
export default function RecipeReader({
  id,
  url,
  input,
  origins,
  language,
  translation,
  credits = {},
}: {
  id: string;
  url: string;
  input: RecipeInput;
  origins: Origin[];
  language: "en" | "es";
  translation: TranslatableText | null;
  credits?: Record<string, PhotoCredit>;
}) {
  const t = copy[language];
  const baseline = input.baselineConfirmed && input.baseline ? input.baseline : null;
  const [servings, setServings] = useState(baseline ?? 1);
  const [status, setStatus] = useState("");
  const [cooking, setCooking] = useState(false);
  const [photo, setPhoto] = useState<number | null>(null);
  const cookButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openPhoto = (index: number) => {
    opener.current = document.activeElement as HTMLElement | null;
    setPhoto(index);
  };
  const shown = useMemo(() => {
    const base = translation ? applyTranslation(input, translation, language) : input;
    if (!baseline || servings === baseline) return base;
    const factor = servings / baseline;
    return {
      ...base,
      ingredients: base.ingredients.map((row) =>
        row.kind === "ingredient" ? { ...row, quantity: scaleQuantity(row.quantity, factor).text } : row,
      ),
    };
  }, [input, translation, language, baseline, servings]);
  const original = input.language === "es" ? "es" : "en";
  const set = (n: number) => setServings(clampServings(n));
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).href);
      setStatus(t.copied);
    } catch {
      setStatus(t.copyFailed);
    }
  }
  const src = (assetId: string) => `/api/recipes/${id}/photos/${assetId}?variant=gallery`;

  return (
    <div className="flex flex-col gap-6" data-servings={servings}>
      {original !== language && (
        <Alert>
          <AlertDescription>
            {translation ? t.translated(languageName[language][original]) : t.fallback(languageName[language][original])}
          </AlertDescription>
        </Alert>
      )}
      <div data-print-hide className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-card p-4 shadow-sm">
        {baseline && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="servings">{t.servings}</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label={t.fewer} onClick={() => set(servings - 1)} disabled={servings <= 1}>
                <MinusIcon aria-hidden="true" />
              </Button>
              <Input
                id="servings"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={servings}
                onChange={(e) => set(Number(e.target.value))}
                className="w-20 text-center"
                aria-describedby="servings-original"
              />
              <Button type="button" variant="outline" size="icon" aria-label={t.more} onClick={() => set(servings + 1)} disabled={servings >= 99}>
                <PlusIcon aria-hidden="true" />
              </Button>
              {servings !== baseline && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setServings(baseline)}>
                  {t.reset}
                </Button>
              )}
            </div>
            <p id="servings-original" className="m-0 text-sm text-muted-foreground">
              {t.original(baseline)}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copyLink}>
            <CopyIcon aria-hidden="true" />
            {t.copy}
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            {t.print}
          </Button>
          <Button ref={cookButton} type="button" onClick={() => setCooking(true)}>
            <ReaderIcon aria-hidden="true" />
            {t.cook}
          </Button>
        </div>
        <p role="status" className="m-0 w-full text-sm text-muted-foreground empty:hidden">
          {status}
        </p>
      </div>
      {baseline && servings !== baseline && <p className="m-0 text-sm text-muted-foreground">{t.scaledNote}</p>}
      <RecipePreview input={shown} id={id} origins={origins} spanish={language === "es"} published credits={credits} onOpenPhoto={openPhoto} servings={baseline ? { current: servings, original: baseline } : undefined} />
      <GalleryDialog
        photos={shown.photos}
        index={photo}
        onIndexChange={setPhoto}
        onClose={() => setPhoto(null)}
        src={(p) => src(p.assetId)}
        credit={(p) => photoCreditText(credits[p.assetId], language)}
        language={language}
        returnFocus={() => opener.current}
      />
      <CookingMode
        open={cooking}
        onOpenChange={setCooking}
        title={shown.title}
        ingredients={shown.ingredients}
        instructions={shown.instructions}
        language={language}
        returnFocus={cookButton}
      />
    </div>
  );
}
