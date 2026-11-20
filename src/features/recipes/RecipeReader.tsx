import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CopyIcon, ReaderIcon } from "@radix-ui/react-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FavoriteHeart } from "@/components/ui/favorite-heart";
import { Label } from "@/components/ui/label";
import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@/components/ui/number-input";
import { toast } from "@/components/ui/toaster";
import { favoriteIntentFrom } from "./draft-intent";
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
    copied: "Link copied",
    copiedDetail: "Share it with anyone who loves to cook.",
    save: "Save to favorites",
    saved: "Saved",
    savedToast: "Saved to favorites",
    unsavedToast: "Removed from favorites",
    saveFailed: "We couldn’t update your favorites. Please try again.",
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
    copied: "Enlace copiado",
    copiedDetail: "Compártelo con quien ame cocinar.",
    save: "Guardar en favoritos",
    saved: "Guardada",
    savedToast: "Guardada en favoritos",
    unsavedToast: "Quitada de favoritos",
    saveFailed: "No pudimos actualizar tus favoritos. Inténtalo de nuevo.",
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
  favorite,
  byline,
}: {
  id: string;
  url: string;
  input: RecipeInput;
  origins: Origin[];
  language: "en" | "es";
  translation: TranslatableText | null;
  credits?: Record<string, PhotoCredit>;
  /** The viewer's save state; omit to hide the Save button. */
  favorite?: { favorited: boolean; count: number; signedIn: boolean; signIn: string };
  /** Server-rendered author, credit and dates (an Astro named slot) shown under the title. */
  byline?: ReactNode;
}) {
  const t = copy[language];
  const baseline = input.baselineConfirmed && input.baseline ? input.baseline : null;
  const [servings, setServings] = useState(baseline ?? 1);
  const [saved, setSaved] = useState(favorite?.favorited ?? false);
  const [saving, setSaving] = useState(false);
  const [cooking, setCooking] = useState(false);
  const [photo, setPhoto] = useState<number | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
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

  const toggleIngredient = (index: number, next: boolean) => {
    setCheckedIngredients((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(index);
      else updated.delete(index);
      return updated;
    });
  };

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).href);
      toast.success(t.copied, { description: t.copiedDetail });
    } catch {
      toast.error(t.copyFailed);
    }
  }
  async function setFavorite(next: boolean) {
    if (!favorite || saving) return;
    setSaving(true);
    setSaved(next);
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(id)}/favorite`, {
        method: next ? "PUT" : "DELETE",
        credentials: "same-origin",
        redirect: "error",
      });
      if (res.status === 401) {
        window.location.assign(favorite.signIn);
        return;
      }
      if (!res.ok) throw new Error();
      toast.success(next ? t.savedToast : t.unsavedToast, { description: input.title });
    } catch {
      setSaved(!next);
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  }
  // A guest who pressed Save signs in and comes back with ?save=<id>; finish it once.
  useEffect(() => {
    const here = new URL(window.location.href);
    if (favoriteIntentFrom(here) !== id) return;
    here.searchParams.delete("save");
    if (here.href !== window.location.href) {
      try {
        history.replaceState(history.state, "", here);
      } catch {
        /* History updates throttled or restricted. */
      }
    }
    if (favorite?.signedIn && !favorite.favorited) void setFavorite(true);
  }, []);
  const src = (assetId: string) => `/api/recipes/${id}/photos/${assetId}?variant=gallery`;

  const controls = (
    <>
      <div
        data-print-hide
        className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs lg:flex-col lg:items-stretch lg:justify-start"
      >
        {baseline && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="servings">{t.servings}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <NumberInput
                value={servings}
                min={1}
                max={99}
                step={1}
                onValueChange={(next) => {
                  if (next !== null && !Number.isNaN(next)) set(next);
                }}
              >
                <NumberInputGroup>
                  <NumberInputDecrement aria-label={t.fewer} />
                  <NumberInputControl id="servings" aria-describedby="servings-original" />
                  <NumberInputIncrement aria-label={t.more} />
                </NumberInputGroup>
              </NumberInput>
              {servings !== baseline && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setServings(baseline)}>
                  {t.reset}
                </Button>
              )}
            </div>
            <p id="servings-original" className="m-0 text-xs text-muted-foreground tabular-nums">
              {t.original(baseline)}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2 max-sm:w-full sm:flex-row sm:flex-wrap lg:flex-col lg:flex-nowrap">
          <Button ref={cookButton} type="button" onClick={() => setCooking(true)}>
            <ReaderIcon aria-hidden="true" />
            {t.cook}
          </Button>
          {favorite && (
            <Button
              type="button"
              variant={saved ? "secondary" : "outline"}
              className={saved ? "[--heart-fill:var(--primary-ink)]" : undefined}
              aria-pressed={saved}
              onClick={() => setFavorite(!saved)}
            >
              <FavoriteHeart active={saved} />
              {saved ? t.saved : t.save}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={copyLink}>
            <CopyIcon aria-hidden="true" />
            {t.copy}
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            {t.print}
          </Button>
        </div>
      </div>
      {baseline && servings !== baseline && (
        <p className="m-0 mb-4 text-sm text-muted-foreground">{t.scaledNote}</p>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6" data-servings={servings}>
      {original !== language && (
        <Alert>
          <AlertDescription>
            {translation
              ? t.translated(languageName[language][original])
              : t.fallback(languageName[language][original])}
          </AlertDescription>
        </Alert>
      )}
      <RecipePreview
        input={shown}
        id={id}
        origins={origins}
        spanish={language === "es"}
        published
        credits={credits}
        onOpenPhoto={openPhoto}
        controls={controls}
        byline={byline}
        servings={baseline ? { current: servings, original: baseline } : undefined}
        checkedIngredients={checkedIngredients}
        onToggleIngredient={toggleIngredient}
        onClearIngredients={() => setCheckedIngredients(new Set())}
      />
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
        checkedIngredients={checkedIngredients}
        onToggleIngredient={toggleIngredient}
        onClearIngredients={() => setCheckedIngredients(new Set())}
      />
    </div>
  );
}
