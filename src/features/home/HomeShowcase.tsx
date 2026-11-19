"use client";

import { PhotoCaption } from "@/components/ui/photo-caption";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
  createCarouselController,
} from "@/components/ui/carousel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import type { RecipeCard as CardData } from "@/features/recipes/catalog";
import { originLabel as labelFor } from "@/features/recipes/origin-label";
import RecipeCard from "@/features/recipes/RecipeCard";
import type { Origin } from "@/features/recipes/validation";
import { capturePostHog } from "@/lib/posthog-client";

const copy = {
  en: {
    eyebrow: "Community Cookbook",
    heroTitle: "Family recipes shared warm, from our kitchen to yours.",
    heroLead:
      "Browse heritage dishes, scale servings cleanly for tonight’s table, cook step by step without losing your place, and pass your own favorites down.",
    exploreCta: "Explore recipes",
    shareCta: "Share a recipe",
    heroCaptionTitle: "Born from the printed Escalera Recipe Book",
    heroCaptionBody: "Real family measurements, bilingual notes, and kitchens across Latin America.",
    heroFallbackLabel: "Shared community table",
    curatedEyebrow: "From the pantry",
    curatedTitle: "Tonight’s table picks",
    curatedSubtitle: "Switch shelves or glide through tested dishes from home cooks.",
    curatedCarouselLabel: "Featured community recipes",
    previousSlide: "Previous recipes",
    nextSlide: "Next recipes",
    viewAll: "Open full Discover feed",
    tabsLabel: "Recipe shelves",
    tabs: {
      popular: "Most saved",
      quick: "Under 60 min",
      newest: "Recently shared",
      sweet: "Sweets & drinks",
    },
    shelfEmpty: "No dishes in this shelf yet — explore the full catalog to see everything.",
    catalogUnavailable: "Community highlights are taking a moment to load. You can still browse Discover directly.",
    saveFailed: "We couldn’t update your favorites. Please try again.",
    saved: (t: string) => `Saved ${t}.`,
    unsaved: (t: string) => `Removed ${t} from favorites.`,
    guideEyebrow: "Made for real cooking",
    guideTitle: "Designed like a kitchen notebook, not a blog full of popups",
    guideLead:
      "Every recipe keeps ingredients, measurements, and clear steps front and center—whether you are reading across the counter or sharing a handwritten classic.",
    aboutLink: "Read the Escalera story",
    faqHeading: "How the kitchen works",
    faqs: [
      {
        id: "cooking-mode",
        q: "How do the interactive checklist and Cooking Mode work?",
        a: "Open any recipe to check off ingredients as you prep, adjust servings up or down with live scaled amounts, or switch into distraction-free Cooking Mode to step through directions one card at a time.",
      },
      {
        id: "bilingual",
        q: "Can I browse and read dishes in both English and Spanish?",
        a: "Yes. Switch between English and Español in the top bar at any time. Community-approved translations appear cleanly alongside each original story and ingredient list.",
      },
      {
        id: "sharing",
        q: "How do I share my own family recipe?",
        a: "Click Add Recipe to draft with a live split-view preview, fast 4-column ingredient entry, or bulk paste. Drafts auto-save as you go until you are ready to publish to the community.",
      },
    ],
    inviteTitle: "Have a dish everyone asks for at family gatherings?",
    inviteBody: "Add the measurements, story, and photos so the next cook can get it right on the first try.",
    invitePrimary: "Share your recipe",
    inviteSecondary: "Browse all recipes",
  },
  es: {
    eyebrow: "Recetario comunitario",
    heroTitle: "Recetas de casa compartidas con calidez, de nuestra mesa a la tuya.",
    heroLead:
      "Explora platillos de tradición familiar, ajusta las porciones al instante, cocina paso a paso sin perder tu lugar y suma tus recetas favoritas.",
    exploreCta: "Explorar recetas",
    shareCta: "Compartir receta",
    heroCaptionTitle: "Nacido del Recetario impreso Escalera",
    heroCaptionBody: "Medidas reales de familia, notas en dos idiomas y cocinas de toda Latinoamérica.",
    heroFallbackLabel: "Mesa comunitaria compartida",
    curatedEyebrow: "De la despensa",
    curatedTitle: "Selección para cocinar hoy",
    curatedSubtitle: "Cambia de colección o desliza por platillos probados por la comunidad.",
    curatedCarouselLabel: "Recetas destacadas de la comunidad",
    previousSlide: "Recetas anteriores",
    nextSlide: "Siguientes recetas",
    viewAll: "Abrir todo Descubrir",
    tabsLabel: "Colecciones de recetas",
    tabs: {
      popular: "Más guardadas",
      quick: "En 60 min o menos",
      newest: "Recién publicadas",
      sweet: "Postres y bebidas",
    },
    shelfEmpty: "Todavía no hay platillos en esta selección — explora todo el catálogo para ver más.",
    catalogUnavailable: "Estamos cargando las recetas destacadas. Aún puedes abrir Descubrir directamente.",
    saveFailed: "No pudimos actualizar tus favoritos. Inténtalo de nuevo.",
    saved: (t: string) => `Guardaste ${t}.`,
    unsaved: (t: string) => `Quitaste ${t} de favoritos.`,
    guideEyebrow: "Hecho para cocinar de verdad",
    guideTitle: "Pensado como un cuaderno de cocina, sin distracciones",
    guideLead:
      "Cada receta mantiene ingredientes, cantidades y pasos claros al frente, ya sea mientras cocinas en casa o cuando publicas una receta de familia.",
    aboutLink: "Conoce la historia de Escalera",
    faqHeading: "Cómo funciona la cocina",
    faqs: [
      {
        id: "cooking-mode",
        q: "¿Cómo funcionan la lista interactiva y el Modo Cocina?",
        a: "Abre cualquier receta para marcar ingredientes al preparar, escalar porciones al instante o pasar al Modo Cocina paso a paso sin perder el hilo.",
      },
      {
        id: "bilingual",
        q: "¿Puedo leer y navegar en español e inglés?",
        a: "Sí. Cambia entre Español e English en la barra superior en cualquier momento. Las traducciones aprobadas conservan la sazón y las medidas originales.",
      },
      {
        id: "sharing",
        q: "¿Cómo comparto la receta de mi familia?",
        a: "Pulsa Añadir receta para escribir con vista previa en vivo, filas rápidas de ingredientes o pegado en bloque. Tu borrador se guarda automáticamente.",
      },
    ],
    inviteTitle: "¿Tienes una receta que siempre piden en las reuniones?",
    inviteBody: "Guarda sus pasos, historia y fotos para que cualquiera pueda prepararla en casa.",
    invitePrimary: "Comparte tu receta",
    inviteSecondary: "Ver todas las recetas",
  },
};

type ShelfKey = "popular" | "quick" | "newest" | "sweet";

export interface HomeShowcaseProps {
  language: "en" | "es";
  heroImageUrl: string;
  popular: CardData[];
  quick: CardData[];
  newest: CardData[];
  sweet: CardData[];
  catalogHealthy: boolean;
  origins: Origin[];
  signInBase: string;
  ratingsEnabled?: boolean;
}

export default function HomeShowcase({
  language,
  heroImageUrl,
  popular,
  quick,
  newest,
  sweet,
  catalogHealthy,
  origins,
  signInBase,
  ratingsEnabled = false,
}: HomeShowcaseProps) {
  const t = copy[language];
  const [heroBroken, setHeroBroken] = useState(false);
  const [activeTab, setActiveTab] = useState<ShelfKey>("popular");
  const [carousel] = useState(createCarouselController);
  const [pending, setPending] = useState<string | null>(null);

  // Keep a unified favorite state map across all shelves so heart toggles stay in sync everywhere on Home.
  const initialOverrides = useMemo(() => {
    const map: Record<string, { favorited: boolean; favoriteCount: number }> = {};
    for (const card of [...popular, ...quick, ...newest, ...sweet]) {
      if (!(card.id in map)) map[card.id] = { favorited: card.favorited, favoriteCount: card.favoriteCount };
    }
    return map;
  }, [popular, quick, newest, sweet]);
  const [favMap, setFavMap] = useState(initialOverrides);

  const applyOverride = useCallback(
    (card: CardData): CardData => {
      const state = favMap[card.id];
      return state ? { ...card, ...state } : card;
    },
    [favMap],
  );

  const shelves: Record<ShelfKey, CardData[]> = {
    popular: popular.map(applyOverride),
    quick: quick.map(applyOverride),
    newest: newest.map(applyOverride),
    sweet: sweet.map(applyOverride),
  };

  const toggleFavorite = useCallback(
    async (card: CardData) => {
      setPending(card.id);
      const nextFavorited = !card.favorited;
      const nextCount = Math.max(0, card.favoriteCount + (nextFavorited ? 1 : -1));
      setFavMap((curr) => ({ ...curr, [card.id]: { favorited: nextFavorited, favoriteCount: nextCount } }));
      try {
        const res = await fetch(`/api/recipes/${encodeURIComponent(card.id)}/favorite`, {
          method: nextFavorited ? "PUT" : "DELETE",
          credentials: "same-origin",
          redirect: "error",
        });
        if (res.status === 401) {
          const body = await res.json().catch(() => null);
          window.location.assign(body?.error?.signIn ?? signInBase);
          return;
        }
        if (!res.ok) throw new Error();
        capturePostHog(
          nextFavorited ? "recipe_favorited" : "recipe_unfavorited",
          { surface: "home" },
        );
        toast.success(nextFavorited ? t.saved(card.title) : t.unsaved(card.title));
      } catch {
        setFavMap((curr) => ({ ...curr, [card.id]: { favorited: card.favorited, favoriteCount: card.favoriteCount } }));
        toast.error(t.saveFailed);
      } finally {
        setPending(null);
      }
    },
    [signInBase, t],
  );

  const withLang = (path: string) => {
    if (language !== "es") return path;
    return `${path}${path.includes("?") ? "&" : "?"}lang=es`;
  };

  const originLabel = (id: string | null) => {
    const found = origins.find((o) => o.id === id);
    return found ? labelFor(found, language) : undefined;
  };

  const currentCards = shelves[activeTab];

  return (
    <div className="flex flex-col gap-16">
      {/* 1. Editorial Split Hero */}
      <section aria-labelledby="home-hero-heading" className="grid items-stretch gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
        <div className="flex flex-col justify-center gap-5 py-2">
          <p className="m-0 type-label-sm text-masa-foreground">{t.eyebrow}</p>
          <h1 id="home-hero-heading" className="m-0 type-headline-xl">
            {t.heroTitle}
          </h1>
          <p className="m-0 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t.heroLead}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <a
              href={withLang("/discover")}
              data-slot="button"
              className={buttonVariants({ size: "lg" })}
            >
              {t.exploreCta}
              <ArrowRightIcon aria-hidden="true" />
            </a>
            <a
              href={withLang("/add-recipe")}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-ink no-underline hover:underline"
            >
              <PlusIcon aria-hidden="true" className="size-4" />
              {t.shareCta}
            </a>
          </div>
        </div>

        <figure className="relative m-0 min-h-[19rem] overflow-hidden rounded-2xl border border-border bg-muted shadow-sm lg:min-h-[26rem]">
          {!heroBroken ? (
            <img
              src={heroImageUrl}
              alt={t.heroFallbackLabel}
              width={1280}
              height={960}
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setHeroBroken(true)}
              className="size-full object-cover lg:absolute lg:inset-0"
            />
          ) : (
            <div className="flex size-full min-h-[19rem] flex-col items-center justify-center bg-gradient-to-br from-muted to-accent p-8 text-center">
              <span className="font-serif text-3xl text-primary-ink">Sabor de Escalera</span>
              <span className="mt-2 text-sm text-muted-foreground">{t.heroFallbackLabel}</span>
            </div>
          )}
          <PhotoCaption>
            <span className="font-serif text-lg leading-snug">{t.heroCaptionTitle}</span>
            <span className="text-xs text-white/90">{t.heroCaptionBody}</span>
          </PhotoCaption>
        </figure>
      </section>

      {/* 2. Curated Table Spotlight with @ui-sdk Tabs + Carousel */}
      <section aria-labelledby="curated-heading" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="type-label-sm text-masa-foreground">{t.curatedEyebrow}</span>
            <h2 id="curated-heading" className="m-0 type-headline-lg">
              {t.curatedTitle}
            </h2>
            <p className="m-0 text-sm text-muted-foreground">{t.curatedSubtitle}</p>
          </div>
          <a
            href={withLang("/discover")}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-ink no-underline hover:underline whitespace-nowrap"
          >
            {t.viewAll}
            <ArrowRightIcon aria-hidden="true" />
          </a>
        </div>

        {!catalogHealthy ? (
          <Alert>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{t.catalogUnavailable}</span>
              <a href={withLang("/discover")} data-slot="button" className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t.exploreCta}
              </a>
            </AlertDescription>
          </Alert>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(next) => {
              if (!next) return;
              setActiveTab(next as ShelfKey);
              carousel.setPage(1);
            }}
            className="gap-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList aria-label={t.tabsLabel} className="flex-wrap justify-start gap-1 bg-muted p-1 group-data-[orientation=horizontal]/tabs:h-auto">
                {(["popular", "quick", "newest", "sweet"] as const).map((key) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="min-h-9 cursor-pointer whitespace-nowrap px-3.5 py-1.5"
                  >
                    {t.tabs[key]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {currentCards.length > 0 && (
                <div className="hidden items-center gap-2 sm:flex">
                  <CarouselPrevious controller={carousel} aria-label={t.previousSlide}>
                    <ChevronLeftIcon aria-hidden="true" className="size-4" />
                  </CarouselPrevious>
                  <CarouselNext controller={carousel} aria-label={t.nextSlide}>
                    <ChevronRightIcon aria-hidden="true" className="size-4" />
                  </CarouselNext>
                </div>
              )}
            </div>

            {(["popular", "quick", "newest", "sweet"] as const).map((key) => {
              const shelfItems = shelves[key];
              return (
                <TabsContent key={key} value={key} keepMounted>
                  {shelfItems.length > 0 ? (
                    <Carousel aria-label={t.curatedCarouselLabel} controller={key === activeTab ? carousel : undefined} slidesPerPage="auto">
                      <CarouselViewport>
                        <CarouselContent>
                          {shelfItems.map((card) => (
                            <CarouselItem
                              key={card.id}
                              className="basis-[88%] sm:basis-[calc((100%-1.5rem)/2)] lg:basis-[calc((100%-3rem)/3)]"
                            >
                              <RecipeCard
                                shelf
                                card={card}
                                language={language}
                                originLabel={originLabel(card.origin)}
                                onToggleFavorite={toggleFavorite}
                                pending={pending === card.id}
                                ratingsEnabled={ratingsEnabled}
                              />
                            </CarouselItem>
                          ))}
                        </CarouselContent>
                      </CarouselViewport>
                    </Carousel>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-card/70 p-8 text-center text-sm text-muted-foreground">
                      <p className="m-0">{t.shelfEmpty}</p>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </section>

      {/* 4. Practical Guide Accordion (@ui-sdk Accordion) + Community CTA */}
      <section aria-labelledby="guide-heading" className="grid items-start gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
        <div className="flex flex-col items-start gap-3">
          <span className="type-label-sm text-masa-foreground">{t.guideEyebrow}</span>
          <h2 id="guide-heading" className="m-0 type-headline-lg">
            {t.guideTitle}
          </h2>
          <p className="m-0 text-base leading-relaxed text-muted-foreground">{t.guideLead}</p>
          <a
            href={withLang("/about")}
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-ink no-underline hover:underline"
          >
            {t.aboutLink}
            <ArrowRightIcon aria-hidden="true" />
          </a>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <h3 className="m-0 mb-2 type-label-sm text-muted-foreground">{t.faqHeading}</h3>
          <Accordion defaultValue={["cooking-mode"]}>
            {t.faqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id}>
                <AccordionHeader>
                  <AccordionTrigger>{faq.q}</AccordionTrigger>
                </AccordionHeader>
                <AccordionPanel>
                  <p className="m-0 pb-3 leading-relaxed">{faq.a}</p>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* 5. Community Invitation Strip */}
      <section
        aria-labelledby="home-invite-heading"
        className="flex flex-col items-start gap-5 rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm md:flex-row md:items-center md:justify-between md:p-10"
      >
        <div className="flex max-w-2xl flex-col gap-1.5">
          <h2 id="home-invite-heading" className="m-0 text-primary-foreground">
            {t.inviteTitle}
          </h2>
          <p className="m-0 type-body-lg text-primary-foreground/90">{t.inviteBody}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <a
            href={withLang("/add-recipe")}
            data-slot="button"
            className={buttonVariants({ variant: "outline" })}
          >
            {t.invitePrimary}
          </a>
          <a
            href={withLang("/discover")}
            className="inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-semibold text-primary-foreground no-underline hover:underline whitespace-nowrap"
          >
            {t.inviteSecondary} →
          </a>
        </div>
      </section>
    </div>
  );
}
