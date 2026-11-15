import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  categories,
  totalMinutes,
  type RecipeInput,
  type Origin,
} from "./validation";
import type { PhotoCredit } from "./catalog";
import { originLabel } from "./origin-label";
import { photoCreditText } from "./photo-credit";
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
  titleAs: Title = "h1",
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
  /** Reader-only: rendered between the photos and the ingredients. */
  controls?: ReactNode;
  /** h2 when the page already has its own h1, as on admin review pages. */
  titleAs?: "h1" | "h2";
}) {
  const t = (en: string, es: string) => (spanish ? es : en);
  // Published badges open Discover filtered to that category or origin.
  const discover = (key: string, value: string) =>
    `/?${new URLSearchParams({ [key]: value, ...(spanish ? { lang: "es" } : {}) })}`;
  const category = categories.find((c) => c.id === input.category)?.[spanish ? "es" : "en"];
  const found = origins.find((o) => o.id === input.origin);
  const origin = found && originLabel(found, spanish ? "es" : "en");
  return (
    <article className="recipe-preview">
      <div className="flex flex-wrap items-center gap-2">
        {published && category ? (
          <Badge variant="tag" render={<a href={discover("category", input.category)} />}>
            {category}
          </Badge>
        ) : (
          category && <Badge variant="tag">{category}</Badge>
        )}
        {published && origin ? (
          <Badge variant="region" render={<a href={discover("origin", input.origin)} />}>
            {origin}
          </Badge>
        ) : (
          origin && <Badge variant="region">{origin}</Badge>
        )}
      </div>
      <Title className={Title === "h2" ? "mt-2 mb-4 text-[clamp(2.25rem,2.5vw+1.25rem,3rem)] leading-[1.17]" : undefined}>{input.title || t("Untitled recipe", "Receta sin título")}</Title>
      <p>
        {t("Original language", "Idioma original")}:{" "}
        {input.language === "es" ? "Español" : "English"}
      </p>
      <p>
        {servings && servings.current !== servings.original
          ? t(
              `Scaled to ${servings.current} servings (original: ${input.yieldText})`,
              `Ajustada a ${servings.current} porciones (original: ${input.yieldText})`,
            )
          : input.yieldText}{" "}
        {totalMinutes(input) !== null && (
          <>
            · {totalMinutes(input)} {t("minutes", "minutos")}
          </>
        )}
      </p>
      {input.sourceCredit && (
        <p>
          {t("Source / original author", "Fuente / autor original")}:{" "}
          {input.sourceCredit}
        </p>
      )}
      {input.photos.length > 0 && (
        <ul className="recipe-gallery" aria-label={t("Photos", "Fotos")}>
          {input.photos.map((p, i) => {
            const full = published
              ? `/api/recipes/${id}/photos/${p.assetId}?variant=gallery`
              : `/api/media/${p.assetId}?variant=gallery`;
            const thumb = published
              ? `/api/recipes/${id}/photos/${p.assetId}?variant=card`
              : `/api/media/${p.assetId}?variant=card`;
            const label = `${t("View larger photo", "Ver foto más grande")}: ${p.caption}`;
            const image = (
              <img
                src={thumb}
                width={p.width ?? 640}
                height={p.height ?? 480}
                alt={p.alt || p.caption}
                style={
                  i === 0
                    ? {
                        objectPosition: `${p.crop.x}% ${p.crop.y}%`,
                        transform: `scale(${p.crop.zoom})`,
                      }
                    : undefined
                }
              />
            );
            return (
              <li key={p.assetId}>
                {onOpenPhoto ? (
                  <button type="button" className="gallery-open" aria-label={label} onClick={() => onOpenPhoto(i)}>
                    {image}
                  </button>
                ) : (
                  <a className="gallery-open" href={full} target="_blank" rel="noopener" aria-label={label}>
                    {image}
                  </a>
                )}
                {credits[p.assetId] && (
                  <span className="photo-credit">{photoCreditText(credits[p.assetId], spanish ? "es" : "en")}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {input.story && (
        <div className="recipe-story">
          <Badge variant="eyebrow">
            {t("The story behind the dish", "La historia detrás del platillo")}
          </Badge>
          <p className="author-text">{input.story}</p>
        </div>
      )}
      <Separator className="my-6" />
      <div className="recipe-layout">
      {controls && <div className="recipe-controls">{controls}</div>}
      <div className="recipe-columns">
        <Card>
          <CardContent>
        <section aria-label={t("Ingredients", "Ingredientes")}>
          <h2>{t("Ingredients", "Ingredientes")}</h2>
          <ul>
            {input.ingredients.map((r, i) => (
              <li key={i}>
                {r.kind === "section" ? (
                  <h3>{r.name}</h3>
                ) : (
                  <>
                    <span>
                      {[r.quantity, r.unit, r.name].filter(Boolean).join(" ")}
                    </span>
                    {r.notes && <> — {r.notes}</>}
                  </>
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
          <h2>{t("Instructions", "Instrucciones")}</h2>
          <ol className="recipe-steps">
            {input.instructions.map((r, i) => (
              <li key={i} className="author-text">
                {r.kind === "section" ? <h3>{r.text}</h3> : r.text}
              </li>
            ))}
          </ol>
        </section>
          </CardContent>
        </Card>
      </div>
      </div>
      {input.notes && (
        <section>
          <h2>{t("Author notes", "Notas del autor")}</h2>
          <p className="author-text">{input.notes}</p>
        </section>
      )}
      {input.videoUrl && (
        <a href={input.videoUrl} target="_blank" rel="noopener noreferrer">
          {t("Watch video on original site", "Ver vídeo en el sitio original")}
        </a>
      )}
    </article>
  );
}
