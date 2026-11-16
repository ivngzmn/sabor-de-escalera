"use client";

import { PhotoCaption } from "@/components/ui/photo-caption";
import { useState } from "react";
import {
  ArrowRightIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  Pencil2Icon,
  PlusIcon,
} from "@radix-ui/react-icons";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Timeline,
  TimelineConnector,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
  type TimelineStatus,
} from "@/components/ui/timeline";

interface TimelineChapter {
  id: string;
  era: string;
  dateTime: string;
  title: string;
  summary: string;
  noteLabel: string;
  note: string;
  status: TimelineStatus;
}

interface PillarTab {
  id: "share" | "save";
  tabLabel: string;
  heading: string;
  summary: string;
  highlights: string[];
  actionLabel: string;
  actionHref: string;
}

const copy = {
  en: {
    eyebrow: "Our story · Escalera Community Cookbook",
    heroTitle: "Home recipes, shared at one table.",
    heroLead:
      "Sabor de Escalera is an online community cookbook for keeping our families’ dishes and the stories that come with them.",
    proverb: "Where one can eat, two can eat.",
    proverbNote: "Traditional proverb",
    discoverCta: "Discover recipes",
    shareCta: "Share your recipe",
    heroImageAlt:
      "Open linen-bound community recipe book on an oak kitchen table beside a stone molcajete, dried chilies, and fresh cilantro in morning sunlight.",
    heroCaptionTitle: "Born from the printed Escalera Recipe Book",
    heroCaptionBody: "¡Provecho! Enjoy! — Gathered dish by dish from community kitchens.",
    heroFallbackLabel: "Escalera community cookbook table",
    bookEyebrow: "The book behind the site",
    bookHeading: "Born from the Escalera Recipe Book",
    bookParagraphs: [
      "It started as a printed recipe book, gathered one recipe at a time by Escalera members. Its pages are full of authentic ingredients, blended cultures and the range of Latin American cooking.",
      "Sabor de Escalera brings that book online so the collection can keep growing: anyone can read, cook and add their family’s recipe.",
    ],
    bookSignoff: "¡Provecho! Enjoy!",
    timelineAriaLabel: "How the Escalera cookbook grew",
    chapters: [
      {
        id: "print-book",
        era: "The printed edition",
        dateTime: "2024",
        title: "Gathered page by page in print",
        summary:
          "Escalera members contributed cherished soups, stews, tamales, pastries, and family stories into a single printed keepsake.",
        noteLabel: "Archival detail",
        note: "Every recipe kept the home cook’s voice intact—pinches, pot sizes, regional spice names, and the gathering behind the dish.",
        status: "complete",
      },
      {
        id: "bilingual-edition",
        era: "Two languages",
        dateTime: "2025",
        title: "Edited for kitchens in English and Spanish",
        summary:
          "Translations are reviewed carefully so culinary terms, measurements, and family notes feel natural in whichever language you cook.",
        noteLabel: "Editorial standard",
        note: "Instead of machine guesswork, community reviewers verify bilingual entries side by side before approving them.",
        status: "complete",
      },
      {
        id: "living-table",
        era: "Open web pantry",
        dateTime: "2026",
        title: "Now growing with every home cook",
        summary:
          "Scale servings on the fly, check ingredients off on your phone while you prep, and add new family classics straight from your kitchen.",
        noteLabel: "Open invitation",
        note: "Your drafts save automatically as you write, and published recipes remain printable and searchable by country or course.",
        status: "current",
      },
    ] as TimelineChapter[],
    pillarsEyebrow: "Inside the kitchen",
    pillarsHeading: "What you can do here",
    pillarsLead: "Select a tool below to see how every part of Sabor de Escalera supports real home cooking.",
    pillarsTabsLabel: "Cookbook capabilities",
    pillars: [
      {
        id: "share",
        tabLabel: "Share your sazón",
        heading: "Publish family dishes with real context",
        summary:
          "Post your family recipe with its steps, timings and the story of where it comes from.",
        highlights: [
          "Split-view editor shows your live recipe card as you write.",
          "Enter ingredients row by row or paste a whole list in seconds.",
          "Auto-saved drafts let you finish photos and notes at your own pace.",
        ],
        actionLabel: "Start a recipe draft",
        actionHref: "/add-recipe",
      },
      {
        id: "save",
        tabLabel: "Save & cook",
        heading: "Keep favorites ready for tonight’s stove",
        summary:
          "Collect the recipes you want to cook and come back to them anytime.",
        highlights: [
          "Scale ingredient quantities smoothly for two, four, or a full reunion.",
          "Tap ingredients into an interactive checklist while you measure and chop.",
          "Switch to distraction-free Cooking Mode to step through directions clearly.",
        ],
        actionLabel: "Browse Discover",
        actionHref: "/discover",
      },
    ] as PillarTab[],
    thanksEyebrow: "Acknowledgments",
    thanksHeading: "Thank you to everyone who made it happen",
    thanksBody:
      "To every member who shared a recipe, and to the editors of the Escalera Recipe Book: this site exists because of your commitment.",
    editorRole: "Escalera Recipe Book editor",
    faqHeading: "Stewardship & community care",
    faqs: [
      {
        id: "credit",
        q: "How are original contributors and print recipes credited?",
        a: "Entries digitized from the printed Escalera Recipe Book carry their original attribution and notes, and every member who submits a new dish links directly to their profile and photo credits.",
      },
      {
        id: "corrections",
        q: "Can readers help improve a cookbook entry?",
        a: "Yes. Editors review corrections and missing ingredient details from the printed archive so older family recipes stay accurate and ready to cook.",
      },
    ],
    ctaHeading: "There’s a place for you at our table",
    ctaBody: "Have a recipe everyone asks for at gatherings? Share it.",
    ctaPrimary: "Share your recipe",
    ctaSecondary: "Browse all recipes",
  },
  es: {
    eyebrow: "Nuestra historia · Recetario Comunitario Escalera",
    heroTitle: "Recetas de casa, compartidas en una sola mesa.",
    heroLead:
      "Sabor de Escalera es un recetario comunitario en línea para guardar los platillos de nuestras familias y las historias que los acompañan.",
    proverb: "Donde come uno, comen dos.",
    proverbNote: "Refrán tradicional",
    discoverCta: "Descubrir recetas",
    shareCta: "Compartir tu receta",
    heroImageAlt:
      "Libro de recetas comunitario abierto sobre una mesa de roble junto a un molcajete, chiles secos y cilantro fresco bajo luz natural de mañana.",
    heroCaptionTitle: "Nació del Recetario Escalera",
    heroCaptionBody: "Provecho. — Reunido platillo a platillo desde nuestras cocinas.",
    heroFallbackLabel: "Mesa del recetario comunitario Escalera",
    bookEyebrow: "El libro detrás del sitio",
    bookHeading: "Nació del Recetario Escalera",
    bookParagraphs: [
      "Todo empezó con un libro de recetas impreso, reunido receta por receta por los miembros de Escalera. Cada página trae ingredientes auténticos, mezclas de culturas y la variedad de la cocina latinoamericana.",
      "Sabor de Escalera lleva ese libro a la web para que la colección siga creciendo: cualquiera puede leer, cocinar y sumar la receta de su familia.",
    ],
    bookSignoff: "Provecho.",
    timelineAriaLabel: "Cómo creció el recetario Escalera",
    chapters: [
      {
        id: "print-book",
        era: "Edición impresa",
        dateTime: "2024",
        title: "Reunido página por página en papel",
        summary:
          "Los miembros de Escalera aportaron caldos, guisos, tamales, postres y recuerdos familiares en un primer libro impreso.",
        noteLabel: "Detalle del archivo",
        note: "Cada página conservó la voz de quien cocina en casa: pizcas, ollas, nombres regionales de especias y la historia del platillo.",
        status: "complete",
      },
      {
        id: "bilingual-edition",
        era: "Dos idiomas",
        dateTime: "2025",
        title: "Cuidado para cocinas en español e inglés",
        summary:
          "Las traducciones se revisan con esmero para que medidas, ingredientes y notas suenen naturales en ambos idiomas.",
        noteLabel: "Criterio editorial",
        note: "En lugar de traducciones automáticas sin revisión, los editores verifican cada receta bilingüe antes de aprobarla.",
        status: "complete",
      },
      {
        id: "living-table",
        era: "Mesa abierta",
        dateTime: "2026",
        title: "Un recetario vivo que sigue creciendo",
        summary:
          "Escala porciones al momento, marca ingredientes mientras cocinas y suma tus propios clásicos familiares directo desde casa.",
        noteLabel: "Invitación abierta",
        note: "Tus borradores se guardan automáticamente al escribir y cada receta publicada queda lista para buscar por país o categoría.",
        status: "current",
      },
    ] as TimelineChapter[],
    pillarsEyebrow: "Dentro de la cocina",
    pillarsHeading: "Qué puedes hacer aquí",
    pillarsLead: "Elige una pestaña para explorar cómo Sabor de Escalera acompaña la cocina de todos los días.",
    pillarsTabsLabel: "Herramientas del recetario",
    pillars: [
      {
        id: "share",
        tabLabel: "Comparte tu sazón",
        heading: "Publica platillos familiares con su historia",
        summary:
          "Publica la receta de tu familia con sus pasos, tiempos y la historia de dónde viene.",
        highlights: [
          "Editor en vista dividida para ver tu receta mientras la escribes.",
          "Agrega ingredientes fila por fila o pega una lista completa en segundos.",
          "Guardado automático de borradores para terminar fotos y notas sin prisa.",
        ],
        actionLabel: "Crear un borrador",
        actionHref: "/add-recipe",
      },
      {
        id: "save",
        tabLabel: "Guarda y cocina",
        heading: "Ten tus favoritas listas frente a la estufa",
        summary:
          "Reúne las recetas que quieres cocinar y vuelve a ellas cuando quieras.",
        highlights: [
          "Ajusta cantidades automáticamente según las porciones que necesites.",
          "Marca ingredientes en una lista interactiva mientras preparas la mesa.",
          "Activa el Modo Cocina sin distracciones para seguir paso a paso.",
        ],
        actionLabel: "Explorar Descubrir",
        actionHref: "/discover",
      },
    ] as PillarTab[],
    thanksEyebrow: "Agradecimientos",
    thanksHeading: "Gracias a quienes lo hicieron posible",
    thanksBody:
      "A cada miembro que compartió una receta y a quienes editaron el Recetario Escalera: este sitio existe gracias a su compromiso.",
    editorRole: "Equipo editorial del Recetario Escalera",
    faqHeading: "Cuidado comunitario y archivo",
    faqs: [
      {
        id: "credit",
        q: "¿Cómo se da crédito a quienes aportaron recetas y fotos?",
        a: "Las recetas del Recetario impreso Escalera conservan sus notas y atribuciones, y cada nueva publicación enlaza al perfil de su autor y créditos de fotografía.",
      },
      {
        id: "corrections",
        q: "¿Pueden corregirse detalles del recetario impreso?",
        a: "Sí. El equipo revisa aclaraciones sobre cantidades, pasos o países de origen para que las recetas históricas se puedan cocinar con confianza.",
      },
    ],
    ctaHeading: "Hay un lugar para ti en nuestra mesa",
    ctaBody: "¿Tienes una receta que siempre piden en las reuniones? Compártela.",
    ctaPrimary: "Compartir tu receta",
    ctaSecondary: "Ver todas las recetas",
  },
};

const EDITORS = ["Stephanie Perez", "Joanna Pineda", "Jose Rivera"];

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("");

export interface AboutStoryProps {
  language: "en" | "es";
  heroImageUrl: string;
  languageSwitchEnabled: boolean;
}

export default function AboutStory({
  language,
  heroImageUrl,
  languageSwitchEnabled,
}: AboutStoryProps) {
  const t = copy[language];
  const chapters = t.chapters.filter((chapter) => languageSwitchEnabled || chapter.id !== "bilingual-edition");
  const [heroBroken, setHeroBroken] = useState(false);
  const [activePillar, setActivePillar] = useState<PillarTab["id"]>("share");

  const withLang = (path: string) => {
    if (path.includes("?")) return path;
    return language === "es" ? `${path}?lang=es` : path;
  };

  const pillarIcon = (id: PillarTab["id"]) => {
    if (id === "share") return <Pencil2Icon aria-hidden="true" className="size-4" />;
    return <BookmarkIcon aria-hidden="true" className="size-4" />;
  };

  return (
    <div className="flex flex-col gap-16">
      {/* 1. Editorial Split Hero */}
      <section aria-labelledby="about-hero-heading" className="flex flex-col gap-8">
        <div className="grid items-stretch gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
          <div className="flex flex-col justify-center gap-5 py-2">
            <p className="m-0 type-label-sm text-masa-foreground">{t.eyebrow}</p>
            <h1 id="about-hero-heading" className="m-0 type-headline-xl">
              {t.heroTitle}
            </h1>
            <p className="m-0 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t.heroLead}
            </p>

            <blockquote className="m-0 border-y border-border py-4">
              <p className="m-0 font-serif text-xl italic leading-snug text-primary-ink sm:text-2xl">
                “{t.proverb}”
              </p>
              <footer className="mt-1 type-label-sm text-muted-foreground">
                {t.proverbNote}
              </footer>
            </blockquote>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <a
                href={withLang("/discover")}
                data-slot="button"
                className={buttonVariants({ size: "lg" })}
              >
                {t.discoverCta}
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
                alt={t.heroImageAlt}
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
        </div>
      </section>

      {/* 2. Origin Narrative + @ui-sdk Timeline & Collapsible Notes */}
      <section aria-labelledby="book-heading" className="grid items-start gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12">
        <div className="flex flex-col items-start gap-3">
          <span className="type-label-sm text-masa-foreground">{t.bookEyebrow}</span>
          <h2 id="book-heading" className="m-0 type-headline-lg">
            {t.bookHeading}
          </h2>
          <div className="mt-1 flex flex-col gap-4 text-base leading-relaxed text-muted-foreground">
            {t.bookParagraphs.map((paragraph) => (
              <p key={paragraph} className="m-0">
                {paragraph}
              </p>
            ))}
            <p className="m-0 font-serif text-xl text-primary-ink">{t.bookSignoff}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs md:p-8">
          <Timeline aria-label={t.timelineAriaLabel}>
            {chapters.map((chapter, index) => (
              <TimelineItem key={chapter.id} value={chapter.id} status={chapter.status}>
                <TimelineMarker>
                  {chapter.status === "complete" ? (
                    <CheckIcon aria-hidden="true" className="size-4" />
                  ) : (
                    <span className="tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                  )}
                </TimelineMarker>
                <TimelineConnector />
                <TimelineTime dateTime={chapter.dateTime}>
                  {String(index + 1).padStart(2, "0")}. {chapter.era}
                </TimelineTime>
                <TimelineTitle render={<h3 className="m-0" />}>{chapter.title}</TimelineTitle>
                <TimelineDescription>{chapter.summary}</TimelineDescription>
                <div className="col-start-2 mt-2">
                  <Collapsible>
                    <CollapsibleTrigger className="group inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary-ink outline-none hover:underline focus-visible:rounded focus-visible:ring-[3px] focus-visible:ring-ring">
                      <span>{chapter.noteLabel}</span>
                      <ChevronDownIcon
                        aria-hidden="true"
                        className="size-3.5 transition-transform duration-200 group-data-[panel-open]:rotate-180"
                      />
                    </CollapsibleTrigger>
                    <CollapsiblePanel>
                      <p className="m-0 pt-2 text-sm leading-relaxed text-muted-foreground">
                        {chapter.note}
                      </p>
                    </CollapsiblePanel>
                  </Collapsible>
                </div>
              </TimelineItem>
            ))}
          </Timeline>
        </div>
      </section>

      {/* 3. Interactive Kitchen Pillars (@ui-sdk Tabs) */}
      <section aria-labelledby="pillars-heading" className="rounded-2xl border border-border bg-card p-6 shadow-xs md:p-10">
        <div className="flex flex-col gap-1.5">
          <span className="type-label-sm text-masa-foreground">{t.pillarsEyebrow}</span>
          <h2 id="pillars-heading" className="m-0 type-headline-lg">
            {t.pillarsHeading}
          </h2>
          <p className="m-0 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {t.pillarsLead}
          </p>
        </div>

        <Separator className="my-6" />

        <Tabs
          value={activePillar}
          onValueChange={(next) => {
            if (next) setActivePillar(next as PillarTab["id"]);
          }}
          className="gap-6"
        >
          <TabsList aria-label={t.pillarsTabsLabel} className="flex-wrap justify-start gap-1 bg-muted p-1 group-data-[orientation=horizontal]/tabs:h-auto">
            {t.pillars.map((pillar) => (
              <TabsTrigger
                key={pillar.id}
                value={pillar.id}
                className="min-h-10 cursor-pointer whitespace-nowrap px-4 py-1.5"
              >
                {pillarIcon(pillar.id)}
                <span>{pillar.tabLabel}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {t.pillars.map((pillar) => (
            <TabsContent key={pillar.id} value={pillar.id}>
              <div className="grid items-start gap-6 rounded-xl border border-border bg-background/70 p-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
                <div className="flex flex-col items-start gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-lg bg-secondary-soft text-secondary">
                    {pillarIcon(pillar.id)}
                  </span>
                  <h3 className="m-0 font-serif text-2xl font-semibold text-foreground">
                    {pillar.heading}
                  </h3>
                  <p className="m-0 text-base leading-relaxed text-muted-foreground">
                    {pillar.summary}
                  </p>
                  <a
                    href={withLang(pillar.actionHref)}
                    data-slot="button"
                    className={buttonVariants({ variant: "outline", className: "mt-2" })}
                  >
                    {pillar.actionLabel}
                    <ArrowRightIcon aria-hidden="true" />
                  </a>
                </div>

                <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                  {pillar.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-3 py-3 first:pt-1 last:pb-1">
                      <CheckIcon
                        aria-hidden="true"
                        className="mt-1 size-4 shrink-0 text-primary-ink"
                      />
                      <span className="text-sm leading-relaxed text-foreground sm:text-base">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      {/* 4. Acknowledgments (@ui-sdk Avatar) + Stewardship Accordion (@ui-sdk Accordion) */}
      <section aria-labelledby="thanks-heading" className="grid items-start gap-8 lg:grid-cols-[1fr_1fr] lg:gap-12">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs md:p-8">
          <div className="flex flex-col items-start gap-2">
            <span className="type-label-sm text-masa-foreground">{t.thanksEyebrow}</span>
            <h2 id="thanks-heading" className="m-0 type-headline-md">
              {t.thanksHeading}
            </h2>
            <p className="m-0 text-base leading-relaxed text-muted-foreground">{t.thanksBody}</p>
          </div>
          <Separator className="my-6" />
          <ul className="m-0 grid list-none gap-5 p-0">
            {EDITORS.map((name) => (
              <li key={name} className="flex items-center gap-3.5">
                <Avatar size="lg" className="size-12 border border-border">
                  <AvatarFallback className="bg-masa-soft font-semibold text-masa-foreground">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">{name}</span>
                  <span className="text-sm text-muted-foreground">{t.editorRole}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs md:p-8">
          <h2 className="m-0 mb-2 type-label-sm text-muted-foreground">{t.faqHeading}</h2>
          <Accordion defaultValue={["credit"]}>
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

      {/* 5. Community Invitation Banner */}
      <section
        aria-labelledby="about-cta-heading"
        className="flex flex-col items-start gap-5 rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm md:flex-row md:items-center md:justify-between md:p-10"
      >
        <div className="flex max-w-2xl flex-col gap-1.5">
          <h2 id="about-cta-heading" className="m-0 text-primary-foreground">
            {t.ctaHeading}
          </h2>
          <p className="m-0 type-body-lg text-primary-foreground/90">{t.ctaBody}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <a
            href={withLang("/add-recipe")}
            data-slot="button"
            className={buttonVariants({ variant: "outline" })}
          >
            {t.ctaPrimary}
          </a>
          <a
            href={withLang("/discover")}
            className="inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-semibold text-primary-foreground no-underline hover:underline whitespace-nowrap"
          >
            {t.ctaSecondary} →
          </a>
        </div>
      </section>
    </div>
  );
}
