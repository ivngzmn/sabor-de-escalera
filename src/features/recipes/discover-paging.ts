import type { RecipeCard } from "./catalog";

export type FeedStatus = "idle" | "loading" | "error";

/** Appends a fetched page, dropping cards already on screen (a recipe can shift pages while the list changes). */
export function appendPage(current: RecipeCard[], incoming: RecipeCard[]): RecipeCard[] {
  const seen = new Set(current.map((c) => c.id));
  const fresh = incoming.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  return fresh.length ? [...current, ...fresh] : current;
}

/**
 * Infinite scroll asks for the next page only after the reader has scrolled, so a tall screen
 * doesn't pull every page on arrival. Until then "Load more" is the way in.
 */
export function shouldAutoLoad({ cursor, status, scrolled }: { cursor: string | null; status: FeedStatus; scrolled: boolean }): boolean {
  return Boolean(cursor) && status === "idle" && scrolled;
}

/** How far below the viewport the next page starts loading. */
export const SENTINEL_MARGIN = "400px";
/** How far outside the viewport a deferred card photo starts loading. */
export const PHOTO_MARGIN = "300px";
/** Cards per row at the widest grid; the first row's photos load eagerly. */
export const FIRST_ROW = 3;

export type PhotoLoading = "eager" | "lazy" | "deferred";

/**
 * Discover photo plan: with shelves the featured card is the first row, otherwise the first grid row.
 * Everything below waits until it nears the viewport.
 */
export function photoLoading(index: number, { shelves }: { shelves: boolean }): PhotoLoading {
  return index < (shelves ? 1 : FIRST_ROW) ? "eager" : "deferred";
}

export interface PhotoSources {
  src: string;
  srcSet: string;
  sizes: string;
}

/** Right-sized sources from the existing recipe photo variants (thumb 320, card 640, gallery 1600). */
export function photoSources(card: Pick<RecipeCard, "id" | "cover">, featured = false): PhotoSources | null {
  if (!card.cover) return null;
  const url = (variant: "thumb" | "card" | "gallery") => `/api/recipes/${card.id}/photos/${card.cover!.assetId}?variant=${variant}`;
  return featured
    ? {
        src: url("gallery"),
        srcSet: `${url("card")} 640w, ${url("gallery")} 1600w`,
        sizes: "(min-width: 1280px) 680px, (min-width: 768px) 55vw, 100vw",
      }
    : {
        src: url("card"),
        srcSet: `${url("thumb")} 320w, ${url("card")} 640w`,
        sizes: "(min-width: 1280px) 380px, (min-width: 640px) 50vw, 100vw",
      };
}
