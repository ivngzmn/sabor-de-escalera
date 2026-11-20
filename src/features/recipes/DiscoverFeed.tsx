import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterChip } from "@/components/ui/filter-chip";
import { SearchField } from "@/components/ui/search-field";
import type { CatalogPage, RecipeCard as CardData } from "./catalog";
import { activeFilterCount, clearFilters, toDiscoverSearch, type DiscoverParams } from "./discover-state";
import FilterPanel from "./FilterPanel";
import { SENTINEL_MARGIN, appendPage, photoLoading, shouldAutoLoad, type FeedStatus, type PhotoLoading } from "./discover-paging";
import { favoriteIntentFrom } from "./draft-intent";
import { toast } from "@/components/ui/toaster";
import { originLabel as labelFor } from "./origin-label";
import RecipeCard, { RecipeCardSkeleton } from "./RecipeCard";
import { categories, type Origin } from "./validation";
import { capturePostHog } from "@/lib/posthog-client";

const copy = {
  en: {
    search: "Search recipes",
    searchHint: "Try birria, pupusas, or cilantro…",
    searchSavedHint: "Search your saved recipes by dish or ingredient…",
    submit: "Search",
    category: "Category",
    origin: "Origin",
    diet: "Dietary",
    sort: "Sort by",
    all: "All",
    timeChip: "Time",
    clearFilters: "Clear filters",
    anyOrigin: "Any origin",
    anyTime: "Any time",
    anyDiet: "Any diet",
    upTo: (m: number) => (m < 60 ? `Up to ${m} min` : `Up to ${m / 60} h`),
    vegan: "Vegan",
    vegetarian: "Vegetarian",
    sorts: { relevance: "Best match", newest: "Newest", rated: "Highest rated", saved: "Most saved" },
    loadMore: "Load more recipes",
    loading: "Loading recipes…",
    added: (n: number) => `${n} more ${n === 1 ? "recipe" : "recipes"} loaded.`,
    end: "You’ve reached the end.",
    failed: "We couldn’t load recipes.",
    retry: "Try again",
    none: "No recipes match yet.",
    noneHint: "Try a different word or clear a filter, or add the dish yourself.",
    shareRecipe: "Share your recipe",
    noFavorites: "You haven’t saved any recipes yet.",
    count: (n: number) => `${n} ${n === 1 ? "recipe" : "recipes"} shown`,
    saveFailed: "We couldn’t update your favorites. Please try again.",
    saved: (t: string) => `Saved ${t}.`,
    unsaved: (t: string) => `Removed ${t} from favorites.`,
    quickShelf: "Ready in an hour or less",
    quickShelfAction: "Filter ≤ 60 min",
    allRecipes: "All community recipes",
  },
  es: {
    search: "Buscar recetas",
    searchHint: "Prueba birria, pupusas o cilantro…",
    searchSavedHint: "Busca en tus recetas guardadas por platillo o ingrediente…",
    submit: "Buscar",
    category: "Categoría",
    origin: "Origen",
    diet: "Dieta",
    sort: "Ordenar por",
    all: "Todas",
    timeChip: "Tiempo",
    clearFilters: "Borrar filtros",
    anyOrigin: "Cualquier origen",
    anyTime: "Cualquier tiempo",
    anyDiet: "Cualquier dieta",
    upTo: (m: number) => (m < 60 ? `Hasta ${m} min` : `Hasta ${m / 60} h`),
    vegan: "Vegana",
    vegetarian: "Vegetariana",
    sorts: { relevance: "Más relevantes", newest: "Más recientes", rated: "Mejor calificadas", saved: "Más guardadas" },
    loadMore: "Cargar más recetas",
    loading: "Cargando recetas…",
    added: (n: number) => `Se cargaron ${n} ${n === 1 ? "receta" : "recetas"} más.`,
    end: "Llegaste al final.",
    failed: "No pudimos cargar las recetas.",
    retry: "Intentar de nuevo",
    none: "Todavía no hay recetas que coincidan.",
    noneHint: "Prueba otra palabra o quita un filtro, o añade el platillo tú.",
    shareRecipe: "Comparte tu receta",
    noFavorites: "Todavía no guardaste recetas.",
    count: (n: number) => `${n} ${n === 1 ? "receta" : "recetas"} en pantalla`,
    saveFailed: "No pudimos actualizar tus favoritos. Inténtalo de nuevo.",
    saved: (t: string) => `Guardaste ${t}.`,
    unsaved: (t: string) => `Quitaste ${t} de favoritos.`,
    quickShelf: "Listas en una hora o menos",
    quickShelfAction: "Filtrar ≤ 60 min",
    allRecipes: "Todas las recetas de la comunidad",
  },
};

interface Props {
  initial: CatalogPage | null;
  params: DiscoverParams;
  language: "en" | "es";
  origins: Origin[];
  scope?: "favorites";
  /** Shows ratings and the Highest rated sort. */
  ratingsEnabled?: boolean;
  /** Same-origin sign-in URL used when a guest tries to save. */
  signInBase: string;
}
type Status = FeedStatus;
const grid = "m-0 grid list-none gap-6 p-0 sm:grid-cols-2 xl:grid-cols-3";
interface Restore {
  pages: number;
  scrollY: number;
  search: string;
}

const restoreKey = () => `discover-restore:${window.location.pathname}`;

function readRestore(): Restore | null {
  try {
    const raw = sessionStorage.getItem(restoreKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Restore>;
    if (typeof parsed.pages === "number" && typeof parsed.scrollY === "number" && typeof parsed.search === "string") {
      return { pages: parsed.pages, scrollY: parsed.scrollY, search: parsed.search };
    }
  } catch {
    /* Storage unavailable. */
  }
  return null;
}

function writeRestore(patch: Partial<Restore>) {
  try {
    const current = readRestore() ?? { pages: 1, scrollY: 0, search: "" };
    sessionStorage.setItem(restoreKey(), JSON.stringify({ ...current, ...patch }));
  } catch {
    /* Storage unavailable. */
  }
}

function replaceUrl(url: URL) {
  if (url.href === window.location.href) return;
  try {
    history.replaceState(history.state, "", url);
  } catch {
    /* History updates throttled or restricted. */
  }
}

/** Discover/Favorites feed: URL-backed filters in a slide-out panel, curated shelves, and scannable cards. */
export default function DiscoverFeed({
  initial,
  params: initialParams,
  language,
  origins,
  scope,
  signInBase,
  ratingsEnabled = false,
}: Props) {
  const t = copy[language];
  const [params, setParams] = useState<DiscoverParams>(initialParams);
  const [text, setText] = useState(initialParams.q ?? "");
  const [items, setItems] = useState<CardData[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [status, setStatus] = useState<Status>(initial ? "idle" : "error");
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRun = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [scrolled, setScrolled] = useState(false);
  const pages = useRef(1);
  const request = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const endpoint = useCallback(
    (p: DiscoverParams, after?: string | null) => {
      const query = new URLSearchParams(toDiscoverSearch(p));
      if (p.sort) query.set("sort", p.sort);
      if (after) query.set("cursor", after);
      if (scope) query.set("scope", scope);
      if (language === "es") query.set("lang", "es");
      return `/api/recipes?${query}`;
    },
    [language, scope],
  );

  const remember = useCallback((patch: Partial<Restore>) => {
    writeRestore(patch);
  }, []);

  const fetchPage = useCallback(
    async (p: DiscoverParams, after: string | null): Promise<CatalogPage | null> => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setStatus("loading");
      try {
        const res = await fetch(endpoint(p, after), { signal: controller.signal, credentials: "same-origin" });
        const body = await res.json().catch(() => null);
        if (controller !== request.current) return null;
        if (!res.ok || !body?.ok) {
          if (res.status === 401 && scope) window.location.assign(signInBase);
          setStatus("error");
          return null;
        }
        setStatus("idle");
        return body.value as CatalogPage;
      } catch (e) {
        if ((e as Error).name !== "AbortError" && controller === request.current) setStatus("error");
        return null;
      }
    },
    [endpoint, scope, signInBase],
  );

  const replace = useCallback(
    async (next: DiscoverParams) => {
      setParams(next);
      const search = toDiscoverSearch(next);
      const url = new URL(window.location.href);
      const keep = new URLSearchParams(url.search);
      url.search = search;
      for (const key of ["lang", "tab"]) if (keep.has(key)) url.searchParams.set(key, keep.get(key)!);
      replaceUrl(url);
      remember({ pages: 1, scrollY: 0, search });
      const run = ++refreshRun.current;
      setRefreshing(true);
      const page = await fetchPage(next, null);
      if (run === refreshRun.current) setRefreshing(false);
      if (!page) return;
      pages.current = 1;
      setItems(page.items);
      setCursor(page.nextCursor);
      setAnnouncement(t.count(page.items.length));
    },
    [fetchPage, remember, t],
  );

  const loadMore = useCallback(async () => {
    if (!cursor || status === "loading") return;
    const page = await fetchPage(params, cursor);
    if (!page) return;
    pages.current += 1;
    setItems((current) => appendPage(current, page.items));
    setCursor(page.nextCursor);
    setAnnouncement(page.nextCursor ? t.added(page.items.length) : `${t.added(page.items.length)} ${t.end}`);
    remember({ pages: pages.current });
  }, [cursor, status, fetchPage, params, t, remember]);

  useEffect(() => {
    const q = text.trim().slice(0, 100);
    if (q === (params.q ?? "")) return;
    const timer = window.setTimeout(() => {
      const { sort, ...rest } = params;
      void replace({ ...rest, ...(q ? { q } : { q: undefined }), ...(sort && sort !== "relevance" ? { sort } : {}) });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, params, replace]);

  useEffect(() => {
    const nav = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
    const isBackForward = nav?.type === "back_forward";
    const saved = readRestore();
    const search = toDiscoverSearch(initialParams);
    if (!isBackForward || !saved || saved.search !== search || saved.pages <= 1 || !initial?.nextCursor) {
      remember({ pages: 1, scrollY: 0, search });
      return;
    }
    history.scrollRestoration = "manual";
    let after: string | null = initial.nextCursor;
    let restored = [...initial.items];
    (async () => {
      for (let n = 1; n < saved.pages && after; n++) {
        const page = await fetchPage(initialParams, after);
        if (!page) break;
        restored = appendPage(restored, page.items);
        after = page.nextCursor;
        pages.current = n + 1;
      }
      setItems(restored);
      setCursor(after);
      requestAnimationFrame(() => window.scrollTo(0, saved.scrollY));
    })();
  }, []);

  useEffect(() => {
    let timer = 0;
    const saveScroll = () => remember({ scrollY: Math.round(window.scrollY) });
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(saveScroll, 150);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", saveScroll);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", saveScroll);
    };
  }, [remember]);

  useEffect(() => {
    if (scrolled) return;
    const onScroll = () => window.scrollY > 0 && setScrolled(true);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [scrolled]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !shouldAutoLoad({ cursor, status, scrolled }) || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: SENTINEL_MARGIN });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, status, scrolled, loadMore]);

  const toggleFavorite = useCallback(
    async (card: CardData) => {
      setPending(card.id);
      const favorited = !card.favorited;
      const patch = (c: CardData) =>
        c.id === card.id ? { ...c, favorited, favoriteCount: Math.max(0, c.favoriteCount + (favorited ? 1 : -1)) } : c;
      if (scope && !favorited) {
        const index = items.findIndex((c) => c.id === card.id);
        const neighbour = items[index + 1] ?? items[index - 1];
        requestAnimationFrame(() => {
          const target = neighbour
            ? document.querySelector<HTMLElement>(`[data-recipe-card="${neighbour.id}"] button[aria-pressed]`)
            : document.getElementById("recipe-search");
          target?.focus();
        });
      }
      setItems((current) => (scope && !favorited ? current.filter((c) => c.id !== card.id) : current.map(patch)));
      try {
        const res = await fetch(`/api/recipes/${encodeURIComponent(card.id)}/favorite`, {
          method: favorited ? "PUT" : "DELETE",
          credentials: "same-origin",
          redirect: "error",
        });
        if (res.status === 401) {
          const body = await res.json().catch(() => null);
          window.location.assign(body?.error?.signIn ?? signInBase);
          return;
        }
        if (!res.ok) throw new Error();
        capturePostHog(favorited ? "recipe_favorited" : "recipe_unfavorited", {
          surface: scope === "favorites" ? "favorites" : "discover",
        });
        toast.success(favorited ? t.saved(card.title) : t.unsaved(card.title));
      } catch {
        setItems((current) => (current.some((c) => c.id === card.id) ? current.map((c) => (c.id === card.id ? card : c)) : [card, ...current]));
        toast.error(t.saveFailed);
      } finally {
        setPending(null);
      }
    },
    [items, scope, signInBase, t],
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = favoriteIntentFrom(url);
    if (!id) return;
    url.searchParams.delete("save");
    replaceUrl(url);
    const card = items.find((c) => c.id === id);
    if (card && !card.favorited) void toggleFavorite(card);
    else if (!card)
      void fetch(`/api/recipes/${encodeURIComponent(id)}/favorite`, { method: "PUT", credentials: "same-origin", redirect: "error" });
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim().slice(0, 100);
    const { sort, ...rest } = params;
    void replace({ ...rest, ...(q ? { q } : { q: undefined }), ...(sort && (q || sort !== "relevance") ? { sort } : {}) });
  };
  const set = (patch: Partial<DiscoverParams>) => void replace({ ...params, ...patch });
  const originLabel = (id: string | null) => {
    const o = origins.find((x) => x.id === id);
    return o ? labelFor(o, language) : undefined;
  };
  const clearHref = `?${new URLSearchParams([...new URLSearchParams(toDiscoverSearch(clearFilters(params))), ...(language === "es" ? [["lang", "es"]] : [])])}`;
  const filterCount = activeFilterCount(params);
  const showShelves = !scope && toDiscoverSearch(params) === "" && items.length >= 4;
  const featuredCard = showShelves ? items[0] : null;
  const quickShelf = showShelves
    ? items.filter((c) => c.id !== featuredCard?.id && c.totalMinutes !== null && c.totalMinutes <= 60).slice(0, 3)
    : [];
  const shelfIds = new Set([featuredCard?.id, ...quickShelf.map((c) => c.id)].filter(Boolean));
  const remainingItems = showShelves ? items.filter((c) => !shelfIds.has(c.id)) : items;

  const loadingFor = (card: CardData): PhotoLoading => photoLoading(items.indexOf(card), { shelves: showShelves });
  const renderCard = (card: CardData, featured = false) => (
    <RecipeCard
      holdPhoto
      photoLoading={loadingFor(card)}
      card={card}
      language={language}
      originLabel={originLabel(card.origin)}
      onToggleFavorite={toggleFavorite}
      pending={pending === card.id}
      ratingsEnabled={ratingsEnabled}
      featured={featured}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <form role="search" method="get" onSubmit={submit} data-hydrated={hydrated || undefined} className="flex flex-col gap-3">
        <Label htmlFor="recipe-search" className="sr-only">
          {t.search}
        </Label>
        <SearchField>
          <Input
            id="recipe-search"
            name="q"
            type="search"
            value={text}
            maxLength={100}
            placeholder={scope ? t.searchSavedHint : t.searchHint}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            className="border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
          />
          <Button type="submit" className="min-h-11 self-center">
            <MagnifyingGlassIcon aria-hidden="true" />
            <span className="max-[399px]:sr-only">{t.submit}</span>
          </Button>
        </SearchField>
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1 md:flex-wrap md:overflow-visible">
          <span className="shrink-0">
            <FilterPanel
              params={params}
              origins={origins}
              language={language}
              ratingsEnabled={ratingsEnabled}
              onApply={(next) => {
                const q = text.trim().slice(0, 100);
                const { sort, ...rest } = next;
                void replace({ ...rest, q: q || undefined, ...(sort && (q || sort !== "relevance") ? { sort } : {}) });
              }}
            />
          </span>

          <div role="group" aria-labelledby="filter-category-label" className="flex shrink-0 items-center gap-2">
            <span id="filter-category-label" className="sr-only">
              {t.category}
            </span>
            {[{ id: "", en: t.all, es: t.all }, ...categories].map((c) => (
              <FilterChip
                key={c.id || "all"}
                type="submit"
                name="category"
                value={c.id}
                active={(params.category ?? "") === c.id}
                onClick={(e) => {
                  e.preventDefault();
                  set({ category: c.id || undefined });
                }}
              >
                {language === "es" ? c.es : c.en}
              </FilterChip>
            ))}
          </div>
          {filterCount > 0 && (
            <a
              href={clearHref}
              className={buttonVariants({ variant: "link", className: "shrink-0" })}
              onClick={(e) => {
                e.preventDefault();
                void replace(clearFilters(params));
              }}
            >
              {t.clearFilters}
            </a>
          )}
        </div>
      </form>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div>

        <div className="flex min-w-0 flex-1 flex-col gap-10">
          {refreshing ? (
            <ul role="list" aria-busy="true" className={grid}>
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i}>
                  <RecipeCardSkeleton />
                </li>
              ))}
            </ul>
          ) : items.length > 0 ? (
            showShelves ? (
              <>
                {featuredCard && renderCard(featuredCard, true)}

                {quickShelf.length > 0 && (
                  <section aria-labelledby="shelf-quick" className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <h2 id="shelf-quick" className="m-0 type-headline-md">
                        {t.quickShelf}
                      </h2>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => set({ maxMinutes: 60 })}
                        className="px-0"
                      >
                        {t.quickShelfAction} →
                      </Button>
                    </div>
                    <ul
                      role="list"
                      className={grid}
                    >
                      {quickShelf.map((card) => (
                        <li key={card.id}>{renderCard(card)}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {remainingItems.length > 0 && (
                  <section aria-labelledby="shelf-all" className="flex flex-col gap-4">
                    <h2 id="shelf-all" className="m-0 type-headline-md">
                      {t.allRecipes}
                    </h2>
                    <ul
                      role="list"
                      aria-busy={status === "loading"}
                      className={grid}
                    >
                      {remainingItems.map((card) => (
                        <li key={card.id}>{renderCard(card)}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            ) : (
              <ul
                role="list"
                aria-busy={status === "loading"}
                className={grid}
              >
                {items.map((card) => (
                  <li key={card.id}>{renderCard(card)}</li>
                ))}
              </ul>
            )
          ) : (
            status === "idle" && (
              <div className="rounded-xl border border-dashed border-input/40 bg-card/60 p-8 text-center">
                <p className="m-0 font-semibold">{scope ? t.noFavorites : t.none}</p>
                {!scope && <p className="m-0 mt-1 text-sm text-muted-foreground">{t.noneHint}</p>}
                {!scope && (
                  <a
                    href={language === "es" ? "/add-recipe?lang=es" : "/add-recipe"}
                    data-slot="button"
                    className={buttonVariants({ className: "mt-4" })}
                  >
                    {t.shareRecipe}
                  </a>
                )}
              </div>
            )
          )}

          {status === "error" && (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{t.failed}</span>
                <Button type="button" variant="outline" onClick={() => (items.length && cursor ? loadMore() : replace(params))}>
                  {t.retry}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {status === "loading" && (
            <>
              <p className="sr-only">{t.loading}</p>
              {!refreshing && (
                <ul role="list" aria-hidden="true" className={grid}>
                  {Array.from({ length: 3 }, (_, i) => (
                    <li key={i}>
                      <RecipeCardSkeleton />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div ref={sentinel} aria-hidden="true" />
          {cursor && status !== "error" && (
            <Button type="button" variant="outline" className="self-center" disabled={status === "loading"} focusableWhenDisabled onClick={() => loadMore()}>
              {t.loadMore}
            </Button>
          )}
          {!cursor && items.length > 0 && status === "idle" && <p className="m-0 text-center text-sm text-muted-foreground">{t.end}</p>}
        </div>
      </div>
    </div>
  );
}
