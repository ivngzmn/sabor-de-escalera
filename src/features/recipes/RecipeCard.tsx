import { useEffect, useRef, useState } from "react";
import { ClockIcon, StarFilledIcon } from "@radix-ui/react-icons";
import { FavoriteHeart } from "@/components/ui/favorite-heart";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonImage } from "@/components/ui/skeleton-image";
import { cn } from "@/lib/utils";
import type { RecipeCard as CardData } from "./catalog";
import { PHOTO_MARGIN, photoSources, type PhotoLoading } from "./discover-paging";

const copy = {
  en: {
    notRated: "Not rated yet",
    minutes: "min",
    by: "By",
    save: (t: string) => `Save ${t} to favorites`,
    unsave: (t: string) => `Remove ${t} from favorites`,
    translated: "Translated",
    featured: "Featured recipe",
    viewRecipe: "Read recipe",
  },
  es: {
    notRated: "Sin calificaciones",
    minutes: "min",
    by: "Por",
    save: (t: string) => `Guardar ${t} en favoritos`,
    unsave: (t: string) => `Quitar ${t} de favoritos`,
    translated: "Traducida",
    featured: "Receta destacada",
    viewRecipe: "Ver receta",
  },
};

export interface RecipeCardProps {
  card: CardData;
  language: "en" | "es";
  originLabel?: string;
  /** Omit to hide the control, e.g. on server-rendered lists without an island. */
  onToggleFavorite?: (card: CardData) => void;
  pending?: boolean;
  /** Wide spotlight card: larger photo beside the editorial details from md up. */
  featured?: boolean;
  /** Shows the rating; off until members can rate recipes. */
  ratingsEnabled?: boolean;
  /** Keep the photo behind its skeleton until it loads, then fade it in. Only inside a hydrated island. */
  holdPhoto?: boolean;
  /** "deferred" leaves the photo out until the card nears the viewport; defaults to eager when featured, else lazy. */
  photoLoading?: PhotoLoading;
}

function useNearViewport(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!enabled);
  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    if (typeof IntersectionObserver === "undefined") return setNear(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: PHOTO_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);
  return [ref, near] as const;
}

/** Scannable recipe card: 16:10 photo, floating quick-save button, unboxed typographic metadata, zero pill clutter. */
export default function RecipeCard({
  card,
  language,
  originLabel,
  onToggleFavorite,
  pending,
  featured,
  ratingsEnabled = false,
  holdPhoto = false,
  photoLoading = featured ? "eager" : "lazy",
}: RecipeCardProps) {
  const t = copy[language];
  const sources = photoSources(card, featured);
  const deferred = photoLoading === "deferred";
  const [frame, near] = useNearViewport(deferred && Boolean(sources));
  const href = language === "es" ? `${card.url}?lang=es` : card.url;
  const originHref = card.origin
    ? `/discover?${new URLSearchParams({ origin: card.origin, ...(language === "es" ? { lang: "es" } : {}) })}`
    : null;

  return (
    <Card
      className={cn(
        "group relative h-full gap-0 overflow-hidden border-border bg-card py-0 shadow-xs transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md",
        featured && "md:grid md:grid-cols-[1.35fr_1fr]",
      )}
      data-recipe-card={card.id}
    >
      <div
        ref={frame}
        className={cn(
          "relative aspect-[16/10] overflow-hidden bg-muted",
          featured && "md:aspect-auto md:min-h-[21rem]",
        )}
      >
        {card.cover && sources ? (
          near ? (
          <SkeletonImage
            hold={holdPhoto}
            src={sources.src}
            srcSet={sources.srcSet}
            sizes={sources.sizes}
            alt={card.cover.alt}
            width={card.cover.width}
            height={card.cover.height}
            loading={photoLoading === "eager" ? "eager" : "lazy"}
            fetchPriority={photoLoading === "eager" && featured ? "high" : undefined}
            referrerPolicy="no-referrer"
            className="absolute inset-0 size-full object-cover transition-[opacity,transform] duration-500 motion-safe:group-hover:scale-105"
          />
          ) : (
            <>
            <Skeleton aria-hidden="true" className="absolute inset-0 rounded-none" />
            <noscript>
              <img
                src={sources.src}
                srcSet={sources.srcSet}
                sizes={sources.sizes}
                alt={card.cover.alt}
                width={card.cover.width}
                height={card.cover.height}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="absolute inset-0 size-full object-cover"
              />
            </noscript>
            </>
          )
        ) : (
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-accent font-serif text-primary-ink/25",
              featured ? "text-8xl" : "text-5xl",
            )}
          >
            {card.title.trim()[0]?.toUpperCase() ?? "·"}
          </div>
        )}
        {onToggleFavorite && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={card.favorited}
            aria-label={card.favorited ? t.unsave(card.title) : t.save(card.title)}
            disabled={pending}
            onClick={() => onToggleFavorite(card)}
            className="absolute top-3 right-3 z-20 min-h-10 rounded-full border border-border/70 bg-card/95 px-3 text-foreground shadow-sm backdrop-blur-xs hover:bg-card"
          >
            <FavoriteHeart active={card.favorited} />
            {card.favoriteCount > 0 && (
              <span className="text-xs font-semibold tabular-nums">{card.favoriteCount}</span>
            )}
          </Button>
        )}
      </div>

      <div className={cn("flex flex-1 flex-col", featured && "md:justify-center md:p-4")}>
        <CardHeader className="gap-2 pt-5 pb-3">
          {(featured || originLabel || card.totalMinutes !== null) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold tracking-wide text-muted-foreground">
              {featured && (
                <span className="type-label-sm text-masa-foreground">{t.featured}</span>
              )}
              {featured && (originLabel || card.totalMinutes !== null) && (
                <span aria-hidden="true">·</span>
              )}
              {originLabel && originHref && (
                <a
                  href={originHref}
                  className="relative z-10 text-primary-ink no-underline hover:underline"
                >
                  {originLabel}
                </a>
              )}
              {originLabel && card.totalMinutes !== null && (
                <span aria-hidden="true">·</span>
              )}
              {card.totalMinutes !== null && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <ClockIcon aria-hidden="true" className="size-3.5 text-masa-foreground" />
                  {card.totalMinutes} {t.minutes}
                </span>
              )}
              {card.translated && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{t.translated}</span>
                </>
              )}
            </div>
          )}

          <CardTitle lang={card.language} className={cn("leading-snug", featured && "md:type-headline-lg")}>
            <a
              href={href}
              className="text-foreground no-underline after:absolute after:inset-0 hover:text-primary-ink focus-visible:outline-none"
            >
              {card.title}
            </a>
          </CardTitle>

          {card.authorName && card.authorId && (
            <CardDescription className="pt-0.5 text-sm">
              {t.by}{" "}
              <a
                href={`/members/${card.authorId}${language === "es" ? "?lang=es" : ""}`}
                className="relative z-10 font-semibold text-foreground/85 no-underline hover:text-primary-ink hover:underline"
              >
                {card.authorName}
              </a>
            </CardDescription>
          )}
        </CardHeader>

        {(featured || ratingsEnabled) && (
          <CardFooter className={cn("justify-between gap-3 pt-2 pb-5 text-sm", !featured && "mt-auto")}>
            {featured && (
              <span className="text-sm font-semibold text-primary-ink group-hover:underline">
                {t.viewRecipe} →
              </span>
            )}
            {ratingsEnabled && (
              <span className="ml-auto inline-flex items-center gap-1 font-semibold text-primary-ink tabular-nums">
                {card.ratingCount ? (
                  <>
                    <StarFilledIcon aria-hidden="true" />
                    {card.ratingAverage} ({card.ratingCount})
                  </>
                ) : (
                  t.notRated
                )}
              </span>
            )}
          </CardFooter>
        )}
      </div>
    </Card>
  );
}

/** Placeholder with a recipe card's shape, shown while a page of results loads. */
export function RecipeCardSkeleton({ featured }: { featured?: boolean }) {
  return (
    <Card
      aria-hidden="true"
      className={cn("h-full gap-0 overflow-hidden border-border bg-card py-0 shadow-xs", featured && "md:grid md:grid-cols-[1.35fr_1fr]")}
    >
      <Skeleton className={cn("aspect-[16/10] rounded-none", featured && "md:aspect-auto md:min-h-[21rem]")} />
      <div className={cn("flex flex-col gap-3 px-6 pt-5 pb-6", featured && "md:justify-center md:p-10")}>
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className={cn("h-5 w-4/5", featured && "md:h-8")} />
      </div>
    </Card>
  );
}
