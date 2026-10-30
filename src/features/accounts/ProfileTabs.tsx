import { useRef, useState } from "react";
import {
  FileTextIcon,
  HeartIcon,
  PlusIcon,
  ReaderIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DeleteDraftDialog from "@/features/recipes/DeleteDraftDialog";

export type ProfileTab = "favorites" | "recipes" | "drafts";
export interface ProfileRecipe {
  id: string;
  label: string;
  url: string | null;
  cover: string | null;
  coverAlt: string;
  date: string;
  version: number;
  photoCount: number;
  ingredientCount: number;
}

const copy = {
  en: {
    tabs: "Profile sections",
    favorites: "Favorites",
    recipes: "My recipes",
    drafts: "Drafts",
    favoritesTitle: "Dishes I want to cook",
    favoritesIntro:
      "Your personal collection of flavors shared by the community.",
    recipesTitle: "Recipes I’ve shared",
    recipesIntro: "Published recipes everyone can read, print and cook.",
    draftsTitle: "Still simmering",
    draftsIntro: "Private drafts only you can see. They save automatically.",
    noFavorites: "No favorites yet",
    noFavoritesBody:
      "Saving recipes is on its way. Recipes you save will gather here.",
    noRecipes: "You haven’t published a recipe yet",
    noRecipesBody: "Share a family recipe so the community can cook it too.",
    noDrafts: "No drafts in progress",
    noDraftsBody: "Start a recipe and come back to it whenever you like.",
    discover: "Discover recipes",
    share: "Share a recipe",
    continue: "Continue editing",
    view: "View recipe",
    published: "Published",
    edited: "Last edited",
    draft: "Draft",
    delete: "Delete",
    deleteLabel: (title: string) => `Delete draft: ${title}`,
    deleted: (title: string) => `Deleted draft “${title}”.`,
    conflict:
      "This draft changed in another tab. Reload the page to see the latest version.",
    signedOut: "Your session ended. Sign in again to delete this draft.",
    failed: "Could not confirm deletion. Your draft is preserved. Try again.",
  },
  es: {
    tabs: "Secciones del perfil",
    favorites: "Favoritos",
    recipes: "Mis recetas",
    drafts: "Borradores",
    favoritesTitle: "Platillos que quiero cocinar",
    favoritesIntro:
      "Tu colección personal de sabores compartidos por la comunidad.",
    recipesTitle: "Recetas que he compartido",
    recipesIntro:
      "Recetas publicadas que todos pueden leer, imprimir y cocinar.",
    draftsTitle: "Todavía en el fuego",
    draftsIntro:
      "Borradores privados que solo tú puedes ver. Se guardan automáticamente.",
    noFavorites: "Aún no tienes favoritos",
    noFavoritesBody:
      "Pronto podrás guardar recetas. Las que guardes se reunirán aquí.",
    noRecipes: "Aún no has publicado una receta",
    noRecipesBody:
      "Comparte una receta familiar para que la comunidad también la cocine.",
    noDrafts: "No hay borradores en curso",
    noDraftsBody: "Empieza una receta y vuelve a ella cuando quieras.",
    discover: "Descubrir recetas",
    share: "Compartir una receta",
    continue: "Seguir editando",
    view: "Ver receta",
    published: "Publicada",
    edited: "Última edición",
    draft: "Borrador",
    delete: "Eliminar",
    deleteLabel: (title: string) => `Eliminar borrador: ${title}`,
    deleted: (title: string) => `Se eliminó el borrador «${title}».`,
    conflict:
      "Este borrador cambió en otra pestaña. Recarga la página para ver la versión más reciente.",
    signedOut:
      "Tu sesión terminó. Inicia sesión de nuevo para eliminar este borrador.",
    failed:
      "No pudimos confirmar la eliminación. Tu borrador se conserva. Inténtalo de nuevo.",
  },
};

const triggerClass =
  "min-h-11 flex-none gap-2 rounded-md px-4 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:hover:bg-primary";

function RecipeCard({
  recipe,
  kind,
  language,
  href,
  onDelete,
}: {
  recipe: ProfileRecipe;
  kind: "recipes" | "drafts";
  language: "en" | "es";
  href: string;
  onDelete?: () => void;
}) {
  const t = copy[language];
  const date = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
  }).format(new Date(recipe.date));
  return (
    <Card className="group gap-0 overflow-hidden py-0 shadow-md transition-shadow hover:shadow-lg">
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {recipe.cover ? (
          <img
            src={recipe.cover}
            alt={recipe.coverAlt}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-full items-center justify-center font-serif text-5xl text-primary-ink/30"
          >
            {recipe.label.trim()[0]?.toUpperCase() ?? "·"}
          </div>
        )}
        {kind === "drafts" && (
          <Badge variant="region" className="absolute top-3 left-3">
            {t.draft}
          </Badge>
        )}
      </div>
      <CardHeader className="pt-5">
        <CardTitle>
          <a
            href={href}
            className="text-foreground no-underline after:absolute after:inset-0 hover:text-primary-ink focus-visible:outline-none"
          >
            {recipe.label}
          </a>
        </CardTitle>
        <CardDescription>
          {kind === "drafts" ? t.edited : t.published}: {date}
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-between gap-3 pt-4 pb-5 text-sm font-semibold text-primary-ink">
        <span>{kind === "drafts" ? t.continue : t.view} →</span>
        {onDelete && (
          // Sits above the card's stretched link so it stays its own target.
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t.deleteLabel(recipe.label)}
            onClick={onDelete}
            className="relative z-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <TrashIcon aria-hidden="true" />
            {t.delete}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <Empty className="rounded-xl border border-dashed border-input/40 bg-card/60">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>
          <h3 className="type-headline-sm m-0">{title}</h3>
        </EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{action}</EmptyContent>
    </Empty>
  );
}

/** Stitch profile tab bar. The active tab mirrors ?tab= so links and Back keep their place. */
export default function ProfileTabs({
  initialTab,
  language,
  published,
  drafts: initialDrafts,
}: {
  initialTab: ProfileTab;
  language: "en" | "es";
  published: ProfileRecipe[];
  drafts: ProfileRecipe[];
}) {
  const t = copy[language];
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [drafts, setDrafts] = useState(initialDrafts);
  // Kept after close so the dialog can animate out and return focus on cancel.
  const [deleting, setDeleting] = useState<ProfileRecipe | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // The deleted card's button is gone, so focus lands on the Drafts tab instead.
  const draftsTab = useRef<HTMLButtonElement>(null);
  const removeDraft = (draft: ProfileRecipe) => {
    const remaining = drafts.filter((d) => d.id !== draft.id);
    setDrafts(remaining);
    setConfirming(false);
    requestAnimationFrame(() => draftsTab.current?.focus());
    setAnnouncement(t.deleted(draft.label));
    // The header stat is server-rendered outside this island.
    const stat = document.querySelector('[data-profile-stat="drafts"]');
    if (stat) stat.textContent = String(remaining.length);
  };
  async function confirmDelete(draft: ProfileRecipe): Promise<string | null> {
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draft.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        redirect: "error",
        body: JSON.stringify({ action: "delete", version: draft.version }),
      });
      // 410: already deleted elsewhere, so the card is stale either way.
      if (res.ok || res.status === 410) {
        removeDraft(draft);
        return null;
      }
      if (res.status === 409) return t.conflict;
      if (res.status === 401) return t.signedOut;
      const data = await res.json().catch(() => null);
      return data?.error?.message ?? t.failed;
    } catch {
      return t.failed;
    }
  }
  const href = (path: string) =>
    language === "es"
      ? `${path}${path.includes("?") ? "&" : "?"}lang=es`
      : path;
  const change = (value: string) => {
    const next = value as ProfileTab;
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "favorites") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    history.replaceState(history.state, "", url);
  };
  const shareLink = (
    <a
      href={href("/add-recipe")}
      data-slot="button"
      className={buttonVariants()}
    >
      <PlusIcon aria-hidden="true" />
      {t.share}
    </a>
  );
  const heading = (title: string, intro: string) => (
    <div className="flex flex-col gap-1">
      <h2 className="type-headline-md m-0">{title}</h2>
      <p className="m-0 text-sm text-muted-foreground">{intro}</p>
    </div>
  );
  const grid = (items: ProfileRecipe[], kind: "recipes" | "drafts") => (
    <ul role="list" className="m-0 grid list-none gap-6 p-0 md:grid-cols-2">
      {items.map((recipe) => (
        <li key={recipe.id} className="relative">
          <RecipeCard
            recipe={recipe}
            kind={kind}
            language={language}
            href={
              kind === "drafts"
                ? href(`/add-recipe?draft=${encodeURIComponent(recipe.id)}`)
                : href(recipe.url ?? "/")
            }
            onDelete={
              kind === "drafts"
                ? () => {
                    setDeleting(recipe);
                    setConfirming(true);
                  }
                : undefined
            }
          />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {deleting && (
        <DeleteDraftDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={deleting.label}
          photoCount={deleting.photoCount}
          ingredientCount={deleting.ingredientCount}
          updatedAt={deleting.date}
          lang={language}
          onConfirm={() => confirmDelete(deleting)}
        />
      )}
      <Tabs value={tab} onValueChange={change} className="gap-6">
        <TabsList
          aria-label={t.tabs}
          className="w-full justify-start group-data-[orientation=horizontal]/tabs:h-auto gap-1 overflow-x-auto rounded-xl bg-card p-1.5 shadow-sm"
        >
          <TabsTrigger value="favorites" className={triggerClass}>
            <HeartIcon aria-hidden="true" />
            {t.favorites} (0)
          </TabsTrigger>
          <TabsTrigger value="recipes" className={triggerClass}>
            <ReaderIcon aria-hidden="true" />
            {t.recipes} ({published.length})
          </TabsTrigger>
          <TabsTrigger ref={draftsTab} value="drafts" className={triggerClass}>
            <FileTextIcon aria-hidden="true" />
            {t.drafts} ({drafts.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="favorites" className="flex flex-col gap-6">
          {heading(t.favoritesTitle, t.favoritesIntro)}
          <EmptyState
            icon={<HeartIcon aria-hidden="true" />}
            title={t.noFavorites}
            body={t.noFavoritesBody}
            action={
              <a
                href={href("/")}
                data-slot="button"
                className={buttonVariants({ variant: "outline" })}
              >
                {t.discover}
              </a>
            }
          />
        </TabsContent>
        <TabsContent value="recipes" className="flex flex-col gap-6">
          {heading(t.recipesTitle, t.recipesIntro)}
          {published.length ? (
            grid(published, "recipes")
          ) : (
            <EmptyState
              icon={<ReaderIcon aria-hidden="true" />}
              title={t.noRecipes}
              body={t.noRecipesBody}
              action={shareLink}
            />
          )}
        </TabsContent>
        <TabsContent value="drafts" className="flex flex-col gap-6">
          {heading(t.draftsTitle, t.draftsIntro)}
          {drafts.length ? (
            grid(drafts, "drafts")
          ) : (
            <EmptyState
              icon={<FileTextIcon aria-hidden="true" />}
              title={t.noDrafts}
              body={t.noDraftsBody}
              action={shareLink}
            />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
