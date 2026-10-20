import { emptyRecipe, sameRecipe, type RecipeInput } from "./validation";

export function hasContent(input: RecipeInput): boolean {
  return !sameRecipe({ ...input, language: "en" }, emptyRecipe());
}

export function hasUnsavedWork(s: {
  stopped: boolean;
  hasDraft: boolean;
  current: RecipeInput;
  saved: RecipeInput | null;
}): boolean {
  if (s.stopped) return false;
  return s.hasDraft ? !sameRecipe(s.current, s.saved) : hasContent(s.current);
}

export function leaveTarget(
  click: {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    defaultPrevented: boolean;
  },
  link: { href: string; target: string; download: boolean; hreflang: string },
  here: string,
): string | null {
  if (
    click.button !== 0 ||
    click.metaKey ||
    click.ctrlKey ||
    click.shiftKey ||
    click.altKey ||
    click.defaultPrevented
  )
    return null;
  if (link.target !== "" && link.target !== "_self") return null;
  if (link.download || link.hreflang !== "") return null;

  let target: URL;
  let current: URL;
  try {
    target = new URL(link.href, here);
    current = new URL(here);
  } catch {
    return null;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return null;
  if (target.origin !== current.origin) return null;
  if (
    target.hash !== "" &&
    target.pathname === current.pathname &&
    target.search === current.search
  )
    return null;
  return target.href;
}
