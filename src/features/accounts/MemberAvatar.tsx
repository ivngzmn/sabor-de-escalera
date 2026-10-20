import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const presets = { chile: "🌶️", corn: "🌽", lime: "🍋" } as const;

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Uploaded avatar first, then the chosen preset, then initials. Decorative: callers name the member. */
export function MemberAvatar({
  displayName,
  avatarAssetId,
  avatarPreset,
  className,
  fallbackClassName,
}: {
  displayName: string | null | undefined;
  avatarAssetId?: string | null;
  avatarPreset?: keyof typeof presets | null;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar aria-hidden="true" className={cn("bg-accent", className)}>
      {avatarAssetId && (
        <AvatarImage
          src={`/api/media/${encodeURIComponent(avatarAssetId)}?variant=avatar`}
          alt=""
          className="object-cover"
        />
      )}
      <AvatarFallback
        className={cn(
          "bg-accent font-semibold text-primary-ink",
          fallbackClassName,
        )}
      >
        {avatarPreset ? presets[avatarPreset] : initials(displayName)}
      </AvatarFallback>
    </Avatar>
  );
}
