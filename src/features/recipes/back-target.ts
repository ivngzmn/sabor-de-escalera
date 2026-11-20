export type BackPlace = "discover" | "home" | "favorites" | "profile" | "recipe" | "page";

export interface BackTarget {
  href: string;
  place: BackPlace;
  /** The reader came from a page on this site, so history.back() returns there with its scroll and loaded pages. */
  fromSite: boolean;
}

/** Where the recipe page's back link goes: the same-site page the reader came from, else Discover. */
export function backTarget({ referrer, origin, current, language }: { referrer: string; origin: string; current: string; language: "en" | "es" }): BackTarget {
  const fallback: BackTarget = { href: language === "es" ? "/discover?lang=es" : "/discover", place: "discover", fromSite: false };
  let from: URL;
  try {
    from = new URL(referrer);
  } catch {
    return fallback;
  }
  if (from.origin !== origin || from.pathname === current) return fallback;
  const path = from.pathname;
  const place: BackPlace =
    path === "/discover"
      ? "discover"
      : path === "/"
        ? "home"
        : path === "/favorites" || (path === "/profile" && from.searchParams.get("tab") === "favorites")
          ? "favorites"
          : path.startsWith("/members/") || path === "/profile"
            ? "profile"
            : path.startsWith("/recipes/")
              ? "recipe"
              : "page";
  return { href: `${path}${from.search}`, place, fromSite: true };
}
