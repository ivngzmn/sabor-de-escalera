import { cn } from "../../lib/utils";

const presets = { chile: "🌶️", corn: "🌽", lime: "🍋" } as const;

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Uploaded avatar first, then the chosen preset, then initials. Decorative: callers name the member.
 * The photo is a plain <img> in the server HTML, so it shows without hydration and no preset flashes first.
 */
export function MemberAvatar({
  memberId,
  displayName,
  avatarAssetId,
  avatarPreset,
  className,
  fallbackClassName,
}: {
  memberId: string | null | undefined;
  displayName: string | null | undefined;
  avatarAssetId?: string | null;
  avatarPreset?: keyof typeof presets | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const photo = memberId && avatarAssetId;
  return (
    <span
      aria-hidden="true"
      data-slot="avatar"
      className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full bg-accent select-none", className)}
    >
      {photo ? (
        <img
          src={`/api/members/${encodeURIComponent(memberId)}/avatar?v=${encodeURIComponent(avatarAssetId)}`}
          alt=""
          width={256}
          height={256}
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex size-full items-center justify-center rounded-[inherit] bg-accent text-sm font-semibold text-primary-ink",
            fallbackClassName,
          )}
        >
          {avatarPreset ? presets[avatarPreset] : initials(displayName)}
        </span>
      )}
    </span>
  );
}
