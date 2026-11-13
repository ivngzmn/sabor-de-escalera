import { ClockIcon, HeartFilledIcon, HeartIcon, StarFilledIcon } from "@radix-ui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RecipeCard as CardData } from "./catalog";

const copy = {
  en: {
    notRated: "Not rated yet",
    minutes: "min",
    by: "By",
    save: (t: string) => `Save ${t} to favorites`,
    unsave: (t: string) => `Remove ${t} from favorites`,
    translated: "Translated",
    featured: "Newest recipe",
  },
  es: {
    notRated: "Sin calificaciones",
    minutes: "min",
    by: "Por",
    save: (t: string) => `Guardar ${t} en favoritos`,
    unsave: (t: string) => `Quitar ${t} de favoritos`,
    translated: "Traducida",
    featured: "Receta más reciente",
  },
};

export interface RecipeCardProps {
  card: CardData;
  language: "en" | "es";
  originLabel?: string;
  /** Omit to hide the control, e.g. on server-rendered lists without an island. */
  onToggleFavorite?: (card: CardData) => void;
  pending?: boolean;
  /** Wide lead card: photo beside the details from md up, larger photo and title. */
  featured?: boolean;
}

/** Discover/Favorites/profile card: 16:10 cover with reserved space, stretched title link, favorite control above it. */
export default function RecipeCard({ card, language, originLabel, onToggleFavorite, pending, featured }: RecipeCardProps) {
  const t = copy[language];
  const href = language === "es" ? `${card.url}?lang=es` : card.url;
  return (
    <Card
      className={cn(
        "group relative h-full gap-0 overflow-hidden py-0 shadow-md transition-shadow hover:shadow-lg",
        featured && "md:grid md:grid-cols-[3fr_2fr]",
      )}
      data-recipe-card={card.id}
    >
      <div className={cn("relative aspect-[16/10] overflow-hidden bg-muted", featured && "md:aspect-auto md:min-h-80")}>
        {card.cover ? (
          <img
            src={`/api/recipes/${card.id}/photos/${card.cover.assetId}?variant=${featured ? "gallery" : "card"}`}
            alt={card.cover.alt}
            width={card.cover.width}
            height={card.cover.height}
            loading={featured ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
          />
        ) : (
          <div aria-hidden="true" className={cn("absolute inset-0 flex items-center justify-center font-serif text-primary-ink/30", featured ? "text-8xl" : "text-5xl")}>
            {card.title.trim()[0]?.toUpperCase() ?? "·"}
          </div>
        )}
        {originLabel && card.origin && (
          // Sits above the stretched title link so it opens Discover filtered to this origin.
          <Badge variant="region" className="absolute top-3 left-3 z-10" asChild>
            <a href={`/?${new URLSearchParams({ origin: card.origin, ...(language === "es" ? { lang: "es" } : {}) })}`}>{originLabel}</a>
          </Badge>
        )}
      </div>
      <div className={cn("flex flex-1 flex-col", featured && "md:justify-center md:p-6")}>
        <CardHeader className="pt-5">
          {featured && (
            <Badge variant="eyebrow" className="mb-1">
              {t.featured}
            </Badge>
          )}
          <CardTitle lang={card.language} className={cn(featured && "md:type-headline-lg")}>
            <a href={href} className="text-foreground no-underline after:absolute after:inset-0 hover:text-primary-ink focus-visible:outline-none">
              {card.title}
            </a>
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {card.authorName && card.authorId && (
              <span>
                {t.by}{" "}
                <a href={`/members/${card.authorId}${language === "es" ? "?lang=es" : ""}`} className="relative z-10">
                  {card.authorName}
                </a>
              </span>
            )}
            {card.totalMinutes !== null && (
              <span className="inline-flex items-center gap-1">
                <ClockIcon aria-hidden="true" />
                {card.totalMinutes} {t.minutes}
              </span>
            )}
            {card.translated && <span>{t.translated}</span>}
          </CardDescription>
        </CardHeader>
        <CardFooter className={cn("justify-between gap-3 pt-4 pb-5 text-sm", !featured && "mt-auto")}>
          <span className="inline-flex items-center gap-1 font-semibold text-primary-ink">
            {card.ratingCount ? (
              <>
                <StarFilledIcon aria-hidden="true" />
                {card.ratingAverage} ({card.ratingCount})
              </>
            ) : (
              t.notRated
            )}
          </span>
          {onToggleFavorite && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={card.favorited}
              aria-label={card.favorited ? t.unsave(card.title) : t.save(card.title)}
              disabled={pending}
              onClick={() => onToggleFavorite(card)}
              className="relative z-10"
            >
              {card.favorited ? <HeartFilledIcon aria-hidden="true" /> : <HeartIcon aria-hidden="true" />}
              {card.favoriteCount > 0 && <span>{card.favoriteCount}</span>}
            </Button>
          )}
        </CardFooter>
      </div>
    </Card>
  );
}
