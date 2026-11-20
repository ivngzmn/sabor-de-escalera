import { useEffect, useState, type MouseEvent } from "react";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { backTarget, type BackPlace, type BackTarget } from "./back-target";

const copy: Record<"en" | "es", Record<BackPlace, string>> = {
  en: {
    discover: "Back to Discover",
    home: "Back to Home",
    favorites: "Back to Favorites",
    profile: "Back to profile",
    recipe: "Back to previous recipe",
    page: "Back",
  },
  es: {
    discover: "Volver a Descubrir",
    home: "Volver al inicio",
    favorites: "Volver a Favoritos",
    profile: "Volver al perfil",
    recipe: "Volver a la receta anterior",
    page: "Volver",
  },
};

/** Back link above a recipe. Without JavaScript it is a plain link to Discover. */
export default function RecipeBackLink({ language }: { language: "en" | "es" }) {
  const [target, setTarget] = useState<BackTarget>(() => backTarget({ referrer: "", origin: "", current: "", language }));

  useEffect(() => {
    setTarget(backTarget({ referrer: document.referrer, origin: window.location.origin, current: window.location.pathname, language }));
  }, [language]);

  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks open the link in a new tab or window as usual.
    if (!target.fromSite || window.history.length < 2 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.back();
  };

  return (
    <a href={target.href} onClick={goBack} data-back-place={target.place} className="mb-2 inline-flex items-center gap-1.5 self-start py-2 text-sm font-semibold underline decoration-1 underline-offset-4 hover:decoration-2">
      <ArrowLeftIcon aria-hidden="true" className="size-4 shrink-0" />
      {copy[language][target.place]}
    </a>
  );
}
