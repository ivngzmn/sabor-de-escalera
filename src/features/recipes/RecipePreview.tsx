import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  categories,
  totalMinutes,
  type RecipeInput,
  type Origin,
} from "./validation";
import type { PhotoCredit } from "./catalog";
import { originLabel } from "./origin-label";
import { photoCreditText } from "./photo-credit";
import PhotoCarousel from "./PhotoCarousel";

export default function RecipePreview({
  input,
  id,
  origins,
  spanish = false,
  published = false,
  onOpenPhoto,
  servings,
  credits = {},
  controls,
  byline,
  titleAs: Title = "h1",
  checkedIngredients,
  onToggleIngredient,
  onClearIngredients,
}: {
  input: RecipeInput;
  id: string;
  origins: Origin[];
  spanish?: boolean;
  published?: boolean;
  /** Reader-only: opens the gallery viewer instead of a new tab. */
  onOpenPhoto?: (index: number) => void;
  /** Reader-only: the chosen servings, shown on screen and in print. */
  servings?: { current: number; original: number };
  /** Photo credits keyed by asset id; shown under each photo and in print. */
  credits?: Record<string, PhotoCredit>;
  /** Reader-only: rendered beside or above the ingredients. */
  controls?: ReactNode;
  /** Reader-only: author, credit and dates shown under the title. */
  byline?: ReactNode;
  /** h2 when the page already has its own h1, as on admin review pages. */
  titleAs?: "h1" | "h2";
  /** Optional controlled checked ingredient indices (synced with Cooking Mode). */
  checkedIngredients?: Set<number>;
  onToggleIngredient?: (index: number, checked: boolean) => void;
  onClearIngredients?: () => void;
}) {
  const t = (en: string, es: string) => (spanish ? es : en);
  const [localChecked, setLocalChecked] = useState<Set<number>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());

  const checkedSet = checkedIngredients ?? localChecked;
  const toggleIngredient = (index: number, next: boolean) => {
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
  const clearAllIngredients = () => {
    if (onClearIngredients) onClearIngredients();
    else setLocalChecked(new Set());
  };

  const toggleStep = (index: number) => {
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Published eyebrow links open Discover filtered to that category or origin.
  const discover = (key: string, value: string) =>
    `/discover?${new URLSearchParams({ [key]: value, ...(spanish ? { lang: "es" } : {}) })}`;
  const category = categories.find((c) => c.id === input.category)?.[spanish ? "es" : "en"];
  const found = origins.find((o) => o.id === input.origin);
  const origin = found && originLabel(found, spanish ? "es" : "en");
  const mins = totalMinutes(input);

  const ingredientIndices = input.ingredients.reduce<number[]>((acc, row, idx) => {
    if (row.kind === "ingredient") acc.push(idx);
    return acc;
  }, []);
  const totalIngredients = ingredientIndices.length;
  const readyCount = ingredientIndices.filter((idx) => checkedSet.has(idx)).length;
  const ingredientPct = totalIngredients > 0 ? Math.round((readyCount / totalIngredients) * 100) : 0;

  return (
    <article className="recipe-preview">
      {(category || origin) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold tracking-wider text-primary-ink uppercase">
          {category &&
            (published ? (
              <a href={discover("category", input.category)} className="no-underline hover:underline">
                {category}
              </a>
            ) : (
              <span>{category}</span>
            ))}
          {category && origin && <span aria-hidden="true" className="text-muted-foreground/60">·</span>}
          {origin &&
            (published ? (
              <a href={discover("origin", input.origin)} className="no-underline hover:underline">
                {origin}
              </a>
            ) : (
              <span className="text-muted-foreground">{origin}</span>
            ))}
        </div>
      )}

      <Title
        className={
          Title === "h2"
            ? "mt-2 mb-3 text-[clamp(2rem,2.3vw+1.1rem,2.75rem)] leading-[1.15]"
            : "mt-2 mb-3"
        }
      >
        {input.title || t("Untitled recipe", "Receta sin título")}
      </Title>

      {byline}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <span>
          {servings && servings.current !== servings.original
            ? t(
                `Scaled to ${servings.current} servings (original: ${input.yieldText})`,
                `Ajustada a ${servings.current} porciones (original: ${input.yieldText})`,
              )
            : input.yieldText || t("Servings not set", "Sin porciones")}
        </span>
        {mins !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {mins} {t("min", "min")}
            </span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>
          {t("Written in", "Escrita en")}{" "}
          {input.language === "es" ? t("Spanish", "español") : t("English", "inglés")}
        </span>
        {input.sourceCredit && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {t("Source:", "Fuente:")} {input.sourceCredit}
            </span>
          </>
        )}
      </div>

      {(input.photos.length > 0 || input.story) && (
        <div className="recipe-hero" data-has-photos={input.photos.length > 0 ? "" : undefined}>
          {input.photos.length > 0 && (
            <PhotoCarousel
              photos={input.photos}
              spanish={spanish}
              src={(p) =>
                published
                  ? `/api/recipes/${id}/photos/${p.assetId}?variant=gallery`
                  : `/api/media/${p.assetId}?variant=gallery`
              }
              credit={(p) =>
                credits[p.assetId] ? photoCreditText(credits[p.assetId], spanish ? "es" : "en") : ""
              }
              onOpen={onOpenPhoto}
            />
          )}
          {input.story && (
            <div className="recipe-story">
              <p className="m-0 text-xs font-semibold tracking-wider text-primary-ink uppercase">
                {t("The story behind the dish", "La historia detrás del platillo")}
              </p>
              <p className="author-text">{input.story}</p>
            </div>
          )}
        </div>
      )}

      <Separator className="my-6" />

      <div className="recipe-layout">
        {controls && <div className="recipe-controls">{controls}</div>}
        <div className="recipe-columns">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <section aria-label={t("Ingredients", "Ingredientes")}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="m-0">{t("Ingredients", "Ingredientes")}</h2>
                  {totalIngredients > 0 && (
                    <span data-print-hide className="text-xs font-medium text-muted-foreground tabular-nums">
                      {readyCount}/{totalIngredients} {t("ready", "listos")}
                    </span>
                  )}
                </div>

                {totalIngredients > 0 && (
                  <div data-print-hide className="mt-2.5 flex flex-col gap-1.5">
                    <Progress value={ingredientPct} aria-label={t("Ingredients ready", "Ingredientes listos")}>
                      <ProgressTrack className="h-1.5">
                        <ProgressIndicator />
                      </ProgressTrack>
                    </Progress>
                    {readyCount > 0 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={clearAllIngredients}
                          className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-primary-ink hover:underline"
                        >
                          {t("Clear checks", "Limpiar marcas")}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
                  {input.ingredients.map((r, i) => (
                    <li key={i} className="!m-0">
                      {r.kind === "section" ? (
                        <h3 className="mt-3 mb-1 border-b border-border pb-1 text-base font-semibold text-primary-ink">
                          {r.name}
                        </h3>
                      ) : (
                        <div className="flex items-start gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60">
                          <span data-print-hide className="mt-0.5 flex shrink-0">
                            <Checkbox
                              id={`preview-ing-${id}-${i}`}
                              checked={checkedSet.has(i)}
                              onCheckedChange={(on) => toggleIngredient(i, on === true)}
                            />
                          </span>
                          <Label
                            htmlFor={`preview-ing-${id}-${i}`}
                            className={cn(
                              "flex-1 cursor-pointer text-[0.96875rem] leading-snug font-normal",
                              checkedSet.has(i) && "text-muted-foreground line-through",
                            )}
                          >
                            <span>
                              {[r.quantity, r.unit, r.name].filter(Boolean).join(" ")}
                              {r.notes && <span className="text-muted-foreground"> — {r.notes}</span>}
                            </span>
                          </Label>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <section aria-label={t("Instructions", "Instrucciones")}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="m-0">{t("Instructions", "Instrucciones")}</h2>
                  <span data-print-hide className="text-xs text-muted-foreground">
                    {t("Tap a step to mark it done", "Toca un paso para marcarlo")}
                  </span>
                </div>
                <ol className="recipe-steps mt-4">
                  {input.instructions.map((r, i) => {
                    if (r.kind === "section") {
                      return (
                        <li key={i}>
                          <h3 className="mt-4 mb-2 border-b border-border pb-1 text-base font-semibold text-primary-ink">
                            {r.text}
                          </h3>
                        </li>
                      );
                    }
                    const isDone = doneSteps.has(i);
                    return (
                      <li
                        key={i}
                        data-done={isDone ? "true" : undefined}
                        className="author-text"
                      >
                        <button
                          type="button"
                          aria-pressed={isDone}
                          onClick={() => toggleStep(i)}
                          className={cn(
                            "w-full cursor-pointer rounded-xl border border-transparent bg-transparent px-3 py-2 text-left text-[1.03125rem] leading-relaxed text-foreground transition-colors hover:bg-muted/60",
                            isDone && "border-primary/20 bg-accent/55 text-muted-foreground",
                          )}
                        >
                          {r.text}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>

      {input.notes && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-xs">
          <h2 className="mt-0 mb-2 text-lg">{t("Author notes", "Notas del autor")}</h2>
          <p className="author-text m-0 text-muted-foreground">{input.notes}</p>
        </section>
      )}
      {input.videoUrl && (
        <p className="mt-4">
          <a
            href={input.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center font-semibold text-primary-ink hover:underline"
          >
            {t("Watch video on original site", "Ver vídeo en el sitio original")} →
          </a>
        </p>
      )}
    </article>
  );
}
