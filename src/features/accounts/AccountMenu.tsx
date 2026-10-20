import { useEffect, useState } from "react";
import { useAuth } from "@clerk/astro/react";
import {
  ChevronDownIcon,
  ExitIcon,
  FileTextIcon,
  HeartIcon,
  LockClosedIcon,
  Pencil1Icon,
  PersonIcon,
  ReaderIcon,
} from "@radix-ui/react-icons";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberAvatar } from "./MemberAvatar";
import type { Actor } from "./permissions";
import { performSignOut, requestSignOut } from "./sign-out";

export type Me = Pick<
  Actor,
  "id" | "role" | "onboarded" | "displayName" | "avatarPreset"
> & { avatarAssetId: string | null };

const copy = {
  en: {
    signIn: "Sign in",
    menu: "Account menu",
    profile: "My profile",
    recipes: "My recipes",
    drafts: "Drafts",
    favorites: "Favorites",
    edit: "Edit profile",
    admin: "Admin",
    finish: "Finish your profile",
    signOut: "Sign out",
    member: "Member",
  },
  es: {
    signIn: "Iniciar sesión",
    menu: "Menú de la cuenta",
    profile: "Mi perfil",
    recipes: "Mis recetas",
    drafts: "Borradores",
    favorites: "Favoritos",
    edit: "Editar perfil",
    admin: "Administración",
    finish: "Completa tu perfil",
    signOut: "Cerrar sesión",
    member: "Miembro",
  },
};

/**
 * Header identity. The server renders the member summary into each private
 * page so the menu is complete on first paint; /api/accounts/me is only the
 * fallback when that lookup was unavailable. Clerk's browser session still
 * decides signed-out state after it loads.
 */
export default function AccountMenu({
  authEnabled,
  sessionHint = false,
  initialMe = null,
  language,
  signInHref,
}: {
  authEnabled: boolean;
  /** Server-read Clerk session cookie hint; decides the first paint before Clerk loads. */
  sessionHint?: boolean;
  initialMe?: Me | null;
  language: "en" | "es";
  signInHref: string;
}) {
  const t = copy[language];
  const { isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState<Me | null>(initialMe);
  // "failed" falls back to initials so Sign out stays reachable.
  const [profile, setProfile] = useState<"loading" | "ready" | "failed">(
    initialMe ? "ready" : "loading",
  );
  // Server HTML and hydration share the hint; live Clerk state takes over after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const href = (path: string) => {
    if (language !== "es") return path;
    return path.includes("?") ? `${path}&lang=es` : `${path}?lang=es`;
  };

  useEffect(() => {
    if (!isSignedIn) {
      if (isLoaded) {
        setMe(null);
        setProfile("loading");
      }
      return;
    }
    if (initialMe) return;
    const controller = new AbortController();
    fetch("/api/accounts/me", {
      credentials: "same-origin",
      redirect: "manual",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? (response.json() as Promise<Me>) : null))
      .then((value) => {
        setMe(value);
        setProfile(value ? "ready" : "failed");
      })
      .catch(() => {
        if (!controller.signal.aborted) setProfile("failed");
      });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, initialMe]);

  const signIn = (
    <a
      href={signInHref}
      data-slot="button"
      className={buttonVariants({ variant: "outline" })}
    >
      {t.signIn}
    </a>
  );
  // Same footprint as the loaded trigger, so nothing shifts when the profile arrives.
  const placeholder = (
    <div
      role="status"
      aria-label={t.menu}
      aria-busy="true"
      className="flex min-h-11 items-center gap-2 py-1 ps-1 pe-2"
    >
      <Skeleton className="size-9 rounded-full" />
      <Skeleton className="hidden h-4 w-24 lg:block" />
      <Skeleton className="size-4 rounded-sm" />
    </div>
  );
  if (!authEnabled) return signIn;
  // A server-rendered member stays put while Clerk loads; only a confirmed sign-out replaces it.
  if (!mounted || !isLoaded) {
    if (!initialMe) return sessionHint ? placeholder : signIn;
  } else if (!isSignedIn) return signIn;
  if (profile === "loading") return placeholder;

  const name = me?.displayName ?? null;
  const signOut = async () => {
    // An editor with unsaved work holds sign-out and asks first.
    if (!requestSignOut()) return;
    await performSignOut(me?.id ?? null, href("/"));
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={name ? `${t.menu}: ${name}` : t.menu}
        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full py-1 ps-1 pe-2 outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <MemberAvatar
          displayName={name}
          avatarAssetId={me?.avatarAssetId}
          avatarPreset={me?.avatarPreset}
          className="size-9 shadow-xs"
        />
        <span className="hidden max-w-36 truncate text-sm font-semibold text-foreground lg:inline">
          {name ?? t.member}
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <MemberAvatar
            displayName={name}
            avatarAssetId={me?.avatarAssetId}
            avatarPreset={me?.avatarPreset}
            className="size-10"
          />
          <span className="truncate font-serif text-base">{name ?? t.member}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {me && !me.onboarded ? (
          <DropdownMenuItem asChild>
            <a href={href("/onboarding?returnTo=%2Fprofile")}>
              <PersonIcon aria-hidden="true" />
              {t.finish}
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <a href={href("/profile")}>
                <PersonIcon aria-hidden="true" />
                {t.profile}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={href("/profile/settings")}>
                <Pencil1Icon aria-hidden="true" />
                {t.edit}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={href("/profile?tab=recipes")}>
                <ReaderIcon aria-hidden="true" />
                {t.recipes}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={href("/profile?tab=drafts")}>
                <FileTextIcon aria-hidden="true" />
                {t.drafts}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={href("/profile?tab=favorites")}>
                <HeartIcon aria-hidden="true" />
                {t.favorites}
              </a>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
        {me && me.role !== "member" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={href("/admin")}>
                <LockClosedIcon aria-hidden="true" />
                {t.admin}
              </a>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <ExitIcon aria-hidden="true" />
          {t.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
