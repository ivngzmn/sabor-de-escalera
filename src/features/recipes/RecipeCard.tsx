import { ClockIcon, HeartFilledIcon, HeartIcon, StarFilledIcon } from "@radix-ui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecipeCard as CardData } from "./catalog";

const copy = {
  en: {
    notRated: "Not rated yet",
    minutes: "min",
    by: "By",
    save: (t: string) => `Save ${t} to favorites`,
    unsave: (t: string) => `Remove ${t} from favorites`,
    translated: "Translated",
  },
  es: {
    notRated: "Sin calificaciones",
    minutes: "min",
    by: "Por",
    save: (t: string) => `Guardar ${t} en favoritos`,
    unsave: (t: string) => `Quitar ${t} de favoritos`,
    translated: "Traducida",
  },
};

export interface RecipeCardProps {
  card: CardData;
  language: "en" | "es";
  originLabel?: string;
  /** Omit to hide the control, e.g. on server-rendered lists without an island. */
  onToggleFavorite?: (card: CardData) => void;
  pending?: boolean;
}

/** Discover/Favorites/profile card: 16:10 cover with reserved space, stretched title link, favorite control above it. */
export default function RecipeCard({ card, language, originLabel, onToggleFavorite, pending }: RecipeCardProps) {
  const t = copy[language];
  const href = language === "es" ? `${card.url}?lang=es` : card.url;
  return (
    <Card className="group relative gap-0 overflow-hidden py-0 shadow-md transition-shadow hover:shadow-lg" data-recipe-card={card.id}>
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {card.cover ? (
          <img
            src={`/api/recipes/${card.id}/photos/${card.cover.assetId}?variant=card`}
            alt={card.cover.alt}
            width={card.cover.width}
            height={card.cover.height}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
          />
        ) : (
          <div aria-hidden="true" className="flex size-full items-center justify-center font-serif text-5xl text-primary-ink/30">
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
      <CardHeader className="pt-5">
        <CardTitle lang={card.language}>
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
      <CardFooter className="justify-between gap-3 pt-4 pb-5 text-sm">
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
    </Card>
  );
}
