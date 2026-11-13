import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterChip, FilterSelectChip } from "@/components/ui/filter-chip";
import { SearchField } from "@/components/ui/search-field";
import type { CatalogPage, RecipeCard as CardData } from "./catalog";
import { activeFilterCount, clearFilters, defaultSort, toDiscoverSearch, type DiscoverParams } from "./discover-state";
import FilterPanel, { sortOptions } from "./FilterPanel";
import { favoriteIntentFrom } from "./draft-intent";
import { originLabel as labelFor } from "./origin-label";
import RecipeCard from "./RecipeCard";
import { categories, type Origin } from "./validation";

const copy = {
  en: {
    search: "Search recipes",
    searchHint: "Title or ingredient",
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
    noneHint: "Try a different word or clear a filter.",
    noFavorites: "You haven’t saved any recipes yet.",
    count: (n: number) => `${n} ${n === 1 ? "recipe" : "recipes"} shown`,
    saveFailed: "We couldn’t update your favorites. Please try again.",
    saved: (t: string) => `Saved ${t}.`,
    unsaved: (t: string) => `Removed ${t} from favorites.`,
  },
  es: {
    search: "Buscar recetas",
    searchHint: "Título o ingrediente",
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
    noneHint: "Prueba otra palabra o quita un filtro.",
    noFavorites: "Todavía no guardaste recetas.",
    count: (n: number) => `${n} ${n === 1 ? "receta" : "recetas"} en pantalla`,
    saveFailed: "No pudimos actualizar tus favoritos. Inténtalo de nuevo.",
    saved: (t: string) => `Guardaste ${t}.`,
    unsaved: (t: string) => `Quitaste ${t} de favoritos.`,
  },
};

interface Props {
  initial: CatalogPage | null;
  params: DiscoverParams;
  language: "en" | "es";
  origins: Origin[];
  scope?: "favorites";
  /** Same-origin sign-in URL used when a guest tries to save. */
  signInBase: string;
}
type Status = "idle" | "loading" | "error";
interface Restore {
  pages: number;
  scrollY: number;
  search: string;
}

/** Discover/Favorites feed: URL-backed filters, debounced search with stale-request cancellation, accessible incremental loading. */
export default function DiscoverFeed({ initial, params: initialParams, language, origins, scope, signInBase }: Props) {
  const t = copy[language];
  const [params, setParams] = useState<DiscoverParams>(initialParams);
  const [text, setText] = useState(initialParams.q ?? "");
  const [items, setItems] = useState<CardData[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.nextCursor ?? null);
  const [status, setStatus] = useState<Status>(initial ? "idle" : "error");
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
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
    const current = (history.state?.discover ?? {}) as Partial<Restore>;
    history.replaceState({ ...history.state, discover: { ...current, ...patch } }, "");
  }, []);

  // One request at a time: a newer search aborts the older one and stale responses are ignored.
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
      history.replaceState({ ...history.state, discover: { pages: 1, scrollY: 0, search } }, "", url);
      const page = await fetchPage(next, null);
      if (!page) return;
      pages.current = 1;
      setItems(page.items);
      setCursor(page.nextCursor);
      setAnnouncement(t.count(page.items.length));
    },
    [fetchPage, t],
  );

  const loadMore = useCallback(async () => {
    if (!cursor || status === "loading") return;
    const page = await fetchPage(params, cursor);
    if (!page) return;
    pages.current += 1;
    setItems((current) => [...current, ...page.items.filter((i) => !current.some((c) => c.id === i.id))]);
    setCursor(page.nextCursor);
    setAnnouncement(page.nextCursor ? t.added(page.items.length) : `${t.added(page.items.length)} ${t.end}`);
    remember({ pages: pages.current });
  }, [cursor, status, fetchPage, params, t, remember]);

  // Debounced typing; the Search button and Enter submit immediately.
  useEffect(() => {
    const q = text.trim().slice(0, 100);
    if (q === (params.q ?? "")) return;
    const timer = window.setTimeout(() => {
      const { sort, ...rest } = params;
      void replace({ ...rest, ...(q ? { q } : { q: undefined }), ...(sort && sort !== "relevance" ? { sort } : {}) });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, params, replace]);

  // Back/forward restoration: reload as many pages as the reader had, then return to their scroll position.
  useEffect(() => {
    const saved = history.state?.discover as Restore | undefined;
    const search = toDiscoverSearch(initialParams);
    if (!saved || saved.search !== search || saved.pages <= 1 || !initial?.nextCursor) {
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
        restored = [...restored, ...page.items];
        after = page.nextCursor;
        pages.current = n + 1;
      }
      setItems(restored);
      setCursor(after);
      requestAnimationFrame(() => window.scrollTo(0, saved.scrollY));
    })();
    // Runs once on mount with the server-rendered page.
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => remember({ scrollY: Math.round(window.scrollY) }));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [remember]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor || status !== "idle") return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "600px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, status, loadMore]);

  const toggleFavorite = useCallback(
    async (card: CardData) => {
      setPending(card.id);
      const favorited = !card.favorited;
      const patch = (c: CardData) =>
        c.id === card.id ? { ...c, favorited, favoriteCount: Math.max(0, c.favoriteCount + (favorited ? 1 : -1)) } : c;
      if (scope && !favorited) {
        // The focused heart leaves with its card; move focus to the neighbouring card's control, or the search box.
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
        setAnnouncement(favorited ? t.saved(card.title) : t.unsaved(card.title));
      } catch {
        setItems((current) => (current.some((c) => c.id === card.id) ? current.map((c) => (c.id === card.id ? card : c)) : [card, ...current]));
        setAnnouncement(t.saveFailed);
      } finally {
        setPending(null);
      }
    },
    [items, scope, signInBase, t],
  );

  // A guest who pressed Save signs in and comes back with ?save=<id>; finish that action once.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = favoriteIntentFrom(url);
    if (!id) return;
    url.searchParams.delete("save");
    history.replaceState(history.state, "", url);
    const card = items.find((c) => c.id === id);
    if (card && !card.favorited) void toggleFavorite(card);
    else if (!card)
      void fetch(`/api/recipes/${encodeURIComponent(id)}/favorite`, { method: "PUT", credentials: "same-origin", redirect: "error" });
    // Once per page load.
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
  const sortValue = params.sort ?? defaultSort(params);
  // Plain browsing leads with the newest recipe as a wide card; searches and filters stay a uniform grid.
  const featureFirst = !scope && toDiscoverSearch(params) === "" && items.length >= 4;

  return (
    <div className="flex flex-col gap-6">
      {/* Without JavaScript the form still submits ?q= as a plain GET search. */}
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
            placeholder={t.searchHint}
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
          {hydrated && <FilterPanel params={params} origins={origins} language={language} onApply={(next) => void replace(next)} />}
          {/* Chips are submit buttons, so without JavaScript they still filter with a plain GET. */}
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
          <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-border" />
          {origins.length > 0 && (
            <FilterSelectChip
              name="origin"
              label={t.origin}
              valueLabel={originLabel(params.origin ?? null)}
              active={Boolean(params.origin)}
              value={params.origin ?? ""}
              onChange={(e) => set({ origin: e.target.value || undefined })}
            >
              <option value="">{t.anyOrigin}</option>
              {origins.map((o) => (
                <option key={o.id} value={o.id}>
                  {labelFor(o, language)}
                </option>
              ))}
            </FilterSelectChip>
          )}
          <FilterSelectChip
            name="time"
            label={t.timeChip}
            valueLabel={params.maxMinutes ? t.upTo(params.maxMinutes) : undefined}
            active={Boolean(params.maxMinutes)}
            value={params.maxMinutes ?? ""}
            onChange={(e) => set({ maxMinutes: (Number(e.target.value) || undefined) as DiscoverParams["maxMinutes"] })}
          >
            <option value="">{t.anyTime}</option>
            {([30, 60, 120] as const).map((m) => (
              <option key={m} value={m}>
                {t.upTo(m)}
              </option>
            ))}
          </FilterSelectChip>
          <FilterSelectChip
            name="diet"
            label={t.diet}
            valueLabel={params.diet ? t[params.diet] : undefined}
            active={Boolean(params.diet)}
            value={params.diet ?? ""}
            onChange={(e) => set({ diet: (e.target.value || undefined) as DiscoverParams["diet"] })}
          >
            <option value="">{t.anyDiet}</option>
            <option value="vegan">{t.vegan}</option>
            <option value="vegetarian">{t.vegetarian}</option>
          </FilterSelectChip>
          <FilterSelectChip
            name="sort"
            label={t.sort}
            valueLabel={t.sorts[sortValue]}
            value={sortValue}
            onChange={(e) => set({ sort: e.target.value as DiscoverParams["sort"] })}
          >
            {sortOptions(params.q).map((s) => (
              <option key={s} value={s}>
                {t.sorts[s]}
              </option>
            ))}
          </FilterSelectChip>
          {activeFilterCount(params) > 0 && (
            <Button type="button" variant="link" className="shrink-0" onClick={() => void replace(clearFilters(params))}>
              {t.clearFilters}
            </Button>
          )}
        </div>
      </form>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {items.length > 0 ? (
        <ul role="list" aria-busy={status === "loading"} className="m-0 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((card, index) => (
            <li key={card.id} className={featureFirst && index === 0 ? "sm:col-span-2 lg:col-span-3" : undefined}>
              <RecipeCard
                card={card}
                language={language}
                originLabel={originLabel(card.origin)}
                onToggleFavorite={toggleFavorite}
                pending={pending === card.id}
                featured={featureFirst && index === 0}
              />
            </li>
          ))}
        </ul>
      ) : (
        status === "idle" && (
          <div className="rounded-xl border border-dashed border-input/40 bg-card/60 p-8 text-center">
            <p className="m-0 font-semibold">{scope ? t.noFavorites : t.none}</p>
            {!scope && <p className="m-0 mt-1 text-sm text-muted-foreground">{t.noneHint}</p>}
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
      {status === "loading" && <p className="m-0 text-center text-sm text-muted-foreground">{t.loading}</p>}

      <div ref={sentinel} aria-hidden="true" />
      {cursor && status !== "error" && (
        <Button type="button" variant="outline" className="self-center" disabled={status === "loading"} onClick={() => loadMore()}>
          {t.loadMore}
        </Button>
      )}
      {!cursor && items.length > 0 && status === "idle" && <p className="m-0 text-center text-sm text-muted-foreground">{t.end}</p>}
    </div>
  );
}
