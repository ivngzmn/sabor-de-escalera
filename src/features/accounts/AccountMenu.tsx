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

function AccountMenuDropdown({
  me,
  language,
  onSignOut,
}: {
  me: Me | null;
  language: "en" | "es";
  onSignOut: () => Promise<void> | void;
}) {
  const t = copy[language];
  const href = (path: string) => {
    if (language !== "es") return path;
    return path.includes("?") ? `${path}&lang=es` : `${path}?lang=es`;
  };
  const name = me?.displayName ?? null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={name ? `${t.menu}: ${name}` : t.menu}
        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full py-1 ps-1 pe-2 outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <MemberAvatar
          memberId={me?.id}
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
            memberId={me?.id}
            displayName={name}
            avatarAssetId={me?.avatarAssetId}
            avatarPreset={me?.avatarPreset}
            className="size-10"
          />
          <span className="truncate font-serif text-base">{name ?? t.member}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {me && !me.onboarded ? (
          <DropdownMenuItem render={<a href={href("/onboarding?returnTo=%2Fprofile")} />}>
            <PersonIcon aria-hidden="true" />
            {t.finish}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuItem render={<a href={href("/profile")} />}>
              <PersonIcon aria-hidden="true" />
              {t.profile}
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={href("/profile/settings")} />}>
              <Pencil1Icon aria-hidden="true" />
              {t.edit}
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={href("/profile?tab=recipes")} />}>
              <ReaderIcon aria-hidden="true" />
              {t.recipes}
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={href("/profile?tab=drafts")} />}>
              <FileTextIcon aria-hidden="true" />
              {t.drafts}
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={href("/profile?tab=favorites")} />}>
              <HeartIcon aria-hidden="true" />
              {t.favorites}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
        {me && me.role !== "member" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<a href={href("/admin")} />}>
              <LockClosedIcon aria-hidden="true" />
              {t.admin}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <ExitIcon aria-hidden="true" />
          {t.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClerkAccountMenu({
  sessionHint = false,
  initialMe = null,
  language,
  signInHref,
}: {
  sessionHint?: boolean;
  initialMe?: Me | null;
  language: "en" | "es";
  signInHref: string;
}) {
  const t = copy[language];
  const { isLoaded, isSignedIn } = useAuth();
  const [me, setMe] = useState<Me | null>(initialMe);
  const [profile, setProfile] = useState<"loading" | "ready" | "failed">(
    initialMe ? "ready" : "loading",
  );
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
  if (!mounted || !isLoaded) {
    if (!initialMe) return sessionHint ? placeholder : signIn;
  } else if (!isSignedIn) return signIn;
  if (profile === "loading") return placeholder;

  const signOut = async () => {
    if (!requestSignOut()) return;
    await performSignOut(me?.id ?? null, href("/"));
  };

  return <AccountMenuDropdown me={me} language={language} onSignOut={signOut} />;
}

function PreviewAccountMenu({
  initialMe = null,
  language,
  signInHref,
}: {
  initialMe?: Me | null;
  language: "en" | "es";
  signInHref: string;
}) {
  const t = copy[language];
  if (!initialMe) {
    return (
      <a
        href={signInHref}
        data-slot="button"
        className={buttonVariants({ variant: "outline" })}
      >
        {t.signIn}
      </a>
    );
  }
  const href = (path: string) => {
    if (language !== "es") return path;
    return path.includes("?") ? `${path}&lang=es` : `${path}?lang=es`;
  };
  const signOut = async () => {
    if (!requestSignOut()) return;
    document.cookie = "preview_session=signed_out; path=/; SameSite=Lax";
    await performSignOut(initialMe.id, href("/"));
    window.location.assign(href("/"));
  };
  return <AccountMenuDropdown me={initialMe} language={language} onSignOut={signOut} />;
}

/**
 * Header identity. Splits Clerk-backed sessions from local preview sessions so
 * @clerk/astro hooks never run when Clerk scripts are not injected.
 */
export default function AccountMenu({
  authEnabled,
  previewMode = false,
  sessionHint = false,
  initialMe = null,
  language,
  signInHref,
}: {
  authEnabled: boolean;
  previewMode?: boolean;
  sessionHint?: boolean;
  initialMe?: Me | null;
  language: "en" | "es";
  signInHref: string;
}) {
  if (authEnabled) {
    return (
      <ClerkAccountMenu
        sessionHint={sessionHint}
        initialMe={initialMe}
        language={language}
        signInHref={signInHref}
      />
    );
  }
  if (previewMode) {
    return (
      <PreviewAccountMenu
        initialMe={initialMe}
        language={language}
        signInHref={signInHref}
      />
    );
  }
  return (
    <a
      href={signInHref}
      data-slot="button"
      className={buttonVariants({ variant: "outline" })}
    >
      {copy[language].signIn}
    </a>
  );
}
