import { useState } from "react";
import { MixerHorizontalIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CatalogSort } from "./catalog";
import { activeFilterCount, clearFilters, defaultSort, type DiscoverParams } from "./discover-state";
import { originLabel as labelFor } from "./origin-label";
import { categories, type Origin } from "./validation";

const copy = {
  en: {
    filters: "Filters",
    filtersCount: (n: number) => `Filters · ${n}`,
    description: "Choose filters, then apply them.",
    clearAll: "Clear all",
    cancel: "Cancel",
    apply: "Apply filters",
    time: "Total time",
    category: "Category",
    diet: "Dietary",
    origin: "Origin",
    sort: "Sort by",
    any: "Any",
    all: "All",
    anyOrigin: "Any origin",
    vegan: "Vegan",
    vegetarian: "Vegetarian",
    sorts: { relevance: "Best match", newest: "Newest", rated: "Highest rated", saved: "Most saved" },
  },
  es: {
    filters: "Filtros",
    filtersCount: (n: number) => `Filtros · ${n}`,
    description: "Elige filtros y luego aplícalos.",
    clearAll: "Borrar todo",
    cancel: "Cancelar",
    apply: "Aplicar filtros",
    time: "Tiempo total",
    category: "Categoría",
    diet: "Dieta",
    origin: "Origen",
    sort: "Ordenar por",
    any: "Cualquiera",
    all: "Todas",
    anyOrigin: "Cualquier origen",
    vegan: "Vegana",
    vegetarian: "Vegetariana",
    sorts: { relevance: "Más relevantes", newest: "Más recientes", rated: "Mejor calificadas", saved: "Más guardadas" },
  },
};

const short = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${minutes / 60} h`);

/** Sort choices for a query: best match only makes sense when there is a search. */
export function sortOptions(q?: string): CatalogSort[] {
  const all: CatalogSort[] = ["relevance", "newest", "rated", "saved"];
  return q ? all : all.filter((sort) => sort !== "relevance");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-6">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export default function FilterPanel({
  params,
  origins,
  language,
  onApply,
  defaultOpen = false,
}: {
  params: DiscoverParams;
  origins: Origin[];
  language: "en" | "es";
  onApply(next: DiscoverParams): void;
  defaultOpen?: boolean;
}) {
  const t = copy[language];
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<DiscoverParams>(params);
  const count = activeFilterCount(params);

  const change = (open: boolean) => {
    if (open) setDraft(params);
    setOpen(open);
  };
  const set = (patch: Partial<DiscoverParams>) => setDraft((current) => ({ ...current, ...patch }));
  const sort = draft.sort ?? defaultSort(draft);

  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetTrigger asChild>
        <FilterChip active={count > 0}>
          <MixerHorizontalIcon aria-hidden="true" className="size-4" />
          {count > 0 ? t.filtersCount(count) : t.filters}
        </FilterChip>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>{t.filters}</SheetTitle>
          {activeFilterCount(draft) > 0 && (
            <Button type="button" variant="link" onClick={() => setDraft(clearFilters(draft))}>
              {t.clearAll}
            </Button>
          )}
        </SheetHeader>
        <SheetDescription className="sr-only">{t.description}</SheetDescription>
        <SheetBody>
          <Section title={t.time}>
            <SegmentedControl
              aria-label={t.time}
              value={String(draft.maxMinutes ?? "any")}
              onValueChange={(value) =>
                set({ maxMinutes: value === "any" ? undefined : (Number(value) as DiscoverParams["maxMinutes"]) })
              }
              options={[
                { value: "any", label: t.any },
                ...([30, 60, 120] as const).map((m) => ({ value: String(m), label: short(m) })),
              ]}
            />
          </Section>
          <Section title={t.category}>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={!draft.category} onClick={() => set({ category: undefined })}>
                {t.all}
              </FilterChip>
              {categories.map((category) => (
                <FilterChip
                  key={category.id}
                  active={draft.category === category.id}
                  onClick={() => set({ category: category.id })}
                >
                  {category[language]}
                </FilterChip>
              ))}
            </div>
          </Section>
          <Section title={t.diet}>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={!draft.diet} onClick={() => set({ diet: undefined })}>
                {t.any}
              </FilterChip>
              <FilterChip active={draft.diet === "vegan"} onClick={() => set({ diet: "vegan" })}>
                {t.vegan}
              </FilterChip>
              <FilterChip active={draft.diet === "vegetarian"} onClick={() => set({ diet: "vegetarian" })}>
                {t.vegetarian}
              </FilterChip>
            </div>
          </Section>
          <Section title={t.origin}>
            <NativeSelect
              aria-label={t.origin}
              value={draft.origin ?? ""}
              onChange={(event) => set({ origin: event.target.value || undefined })}
            >
              <NativeSelectOption value="">{t.anyOrigin}</NativeSelectOption>
              {origins.map((origin) => (
                <NativeSelectOption key={origin.id} value={origin.id}>
                  {labelFor(origin, language)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Section>
          <Section title={t.sort}>
            <div className="flex flex-wrap gap-2">
              {sortOptions(draft.q).map((option) => (
                <FilterChip key={option} active={sort === option} onClick={() => set({ sort: option })}>
                  {t.sorts[option]}
                </FilterChip>
              ))}
            </div>
          </Section>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="button" variant="link">
              {t.cancel}
            </Button>
          </SheetClose>
          <Button
            type="button"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            {t.apply}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
