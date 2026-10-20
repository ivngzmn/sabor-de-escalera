import { useState } from "react";
import { CheckIcon, EyeOpenIcon, LockClosedIcon } from "@radix-ui/react-icons";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import ImageUploader from "@/features/media/ImageUploader";
import { initials, MemberAvatar } from "./MemberAvatar";
import type { Actor } from "./permissions";

type Preset = NonNullable<Actor["avatarPreset"]>;
type AvatarChoice = Preset | "initials";

const copy = {
  en: {
    about: "About you",
    aboutIntro: "Your name and bio appear beside every recipe you share.",
    name: "Display name",
    nameHint: "Required. How the community sees you.",
    bio: "Bio",
    bioHint: "Optional. Where you cook, who taught you, what you love to make.",
    bioPlaceholder: "Abuela’s kitchen in Michoacán taught me everything I know about mole.",
    avatar: "Avatar",
    avatarIntro: "Pick a symbol, or upload a photo. A photo takes the place of the symbol.",
    choices: { initials: "My initials", chile: "Chile pepper", corn: "Corn", lime: "Lime" },
    privacy: "Privacy",
    privacyIntro: "Your email address is never shown publicly.",
    savedPublic: "Show my saved recipes on my profile",
    savedHint: "When this is off, only your published recipes are visible to others.",
    device: "Device privacy settings",
    preview: "How others see you",
    live: "Live",
    noBio: "No bio yet.",
    publicFavorites: "Public favorites",
    privateFavorites: "Private favorites",
    unsaved: "You have unsaved changes.",
    save: "Save changes",
    cancel: "Cancel",
    member: "Member",
    count: (n: number, max: number) => `${n}/${max}`,
  },
  es: {
    about: "Sobre ti",
    aboutIntro: "Tu nombre y biografía aparecen junto a cada receta que compartes.",
    name: "Nombre público",
    nameHint: "Obligatorio. Así te verá la comunidad.",
    bio: "Biografía",
    bioHint: "Opcional. Dónde cocinas, quién te enseñó, qué te encanta preparar.",
    bioPlaceholder: "La cocina de mi abuela en Michoacán me enseñó todo lo que sé del mole.",
    avatar: "Avatar",
    avatarIntro: "Elige un símbolo o sube una foto. La foto reemplaza al símbolo.",
    choices: { initials: "Mis iniciales", chile: "Chile", corn: "Maíz", lime: "Lima" },
    privacy: "Privacidad",
    privacyIntro: "Tu correo electrónico nunca se muestra públicamente.",
    savedPublic: "Mostrar mis recetas guardadas en mi perfil",
    savedHint: "Si está desactivado, los demás solo verán tus recetas publicadas.",
    device: "Configuración de privacidad del dispositivo",
    preview: "Cómo te ven los demás",
    live: "En vivo",
    noBio: "Aún sin biografía.",
    publicFavorites: "Favoritos públicos",
    privateFavorites: "Favoritos privados",
    unsaved: "Tienes cambios sin guardar.",
    save: "Guardar cambios",
    cancel: "Cancelar",
    member: "Miembro",
    count: (n: number, max: number) => `${n}/${max}`,
  },
};

const symbols: Record<Preset, string> = { chile: "🌶️", corn: "🌽", lime: "🍋" };
const length = (value: string) => Array.from(value).length;

/** Stitch onboarding pattern: form sections on the left, a sticky live preview on the right. */
export default function ProfileSettingsForm({
  language,
  displayName,
  bio,
  avatarPreset,
  avatarAssetId,
  savedListPublic,
  mediaAvailable,
  error,
  cancelHref,
  privacyHref,
}: {
  language: "en" | "es";
  displayName: string | null;
  bio: string;
  avatarPreset: Actor["avatarPreset"];
  avatarAssetId: string | null;
  savedListPublic: boolean;
  mediaAvailable: boolean;
  error?: string;
  cancelHref: string;
  privacyHref: string;
}) {
  const t = copy[language];
  const initial = {
    name: displayName ?? "",
    bio,
    avatar: (avatarPreset ?? "initials") as AvatarChoice,
    savedPublic: savedListPublic,
  };
  const [name, setName] = useState(initial.name);
  const [about, setAbout] = useState(initial.bio);
  const [avatar, setAvatar] = useState<AvatarChoice>(initial.avatar);
  const [savedPublic, setSavedPublic] = useState(initial.savedPublic);
  const [photo, setPhoto] = useState(avatarAssetId);
  const dirty =
    name !== initial.name ||
    about !== initial.bio ||
    avatar !== initial.avatar ||
    savedPublic !== initial.savedPublic;
  const preset = avatar === "initials" ? null : avatar;

  return (
    <form
      method="post"
      className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8"
      aria-describedby={error ? "settings-error" : undefined}
    >
      <input type="hidden" name="avatarPreset" value={preset ?? ""} />
      <input type="hidden" name="savedListPublic" value={String(savedPublic)} />
      <div className="flex flex-col gap-6 lg:col-span-8">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="type-headline-sm m-0">{t.about}</h2>
            </CardTitle>
            <CardDescription>{t.aboutIntro}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={error ? true : undefined}>
                <div className="flex items-baseline justify-between gap-4">
                  <FieldLabel htmlFor="display-name">{t.name}</FieldLabel>
                  <span aria-hidden="true" className="text-xs text-muted-foreground tabular-nums">
                    {t.count(length(name), 80)}
                  </span>
                </div>
                <Input
                  id="display-name"
                  name="displayName"
                  required
                  maxLength={80}
                  autoComplete="nickname"
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`display-name-hint${error ? " settings-error" : ""}`}
                />
                <FieldDescription id="display-name-hint">{t.nameHint}</FieldDescription>
                {error && <FieldError>{error}</FieldError>}
              </Field>
              <Field>
                <div className="flex items-baseline justify-between gap-4">
                  <FieldLabel htmlFor="bio">{t.bio}</FieldLabel>
                  <span aria-hidden="true" className="text-xs text-muted-foreground tabular-nums">
                    {t.count(length(about), 400)}
                  </span>
                </div>
                <Textarea
                  id="bio"
                  name="bio"
                  maxLength={400}
                  rows={4}
                  placeholder={t.bioPlaceholder}
                  value={about}
                  onChange={(event) => setAbout(event.currentTarget.value)}
                  aria-describedby="bio-hint"
                />
                <FieldDescription id="bio-hint">{t.bioHint}</FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="avatar-heading" className="type-headline-sm m-0">{t.avatar}</h2>
            </CardTitle>
            <CardDescription id="avatar-intro">{t.avatarIntro}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <RadioGroupPrimitive.Root
              value={avatar}
              onValueChange={(value) => setAvatar(value as AvatarChoice)}
              aria-labelledby="avatar-heading"
              aria-describedby="avatar-intro"
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              {(["initials", "chile", "corn", "lime"] as const).map((choice) => (
                <label
                  key={choice}
                  htmlFor={`avatar-${choice}`}
                  className="relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-4 text-center text-sm font-semibold transition-[background-color,box-shadow] hover:bg-muted has-[[data-state=checked]]:bg-card has-[[data-state=checked]]:shadow-md has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring"
                >
                  <RadioGroupPrimitive.Item
                    data-slot="radio-group-item"
                    id={`avatar-${choice}`}
                    value={choice}
                    className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border border-input bg-card outline-none data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                  >
                    <RadioGroupPrimitive.Indicator>
                      <CheckIcon aria-hidden="true" className="size-4 text-primary-foreground" />
                    </RadioGroupPrimitive.Indicator>
                  </RadioGroupPrimitive.Item>
                  <span
                    aria-hidden="true"
                    className="flex size-14 items-center justify-center rounded-full bg-accent font-serif text-2xl text-primary-ink"
                  >
                    {choice === "initials" ? initials(name) : symbols[choice]}
                  </span>
                  {t.choices[choice]}
                </label>
              ))}
            </RadioGroupPrimitive.Root>
            <FieldSeparator />
            <ImageUploader
              purpose="avatar"
              available={mediaAvailable}
              spanish={language === "es"}
              currentAssetId={avatarAssetId}
              onSavedChange={setPhoto}
            />
          </CardContent>
        </Card>

        <Card id="privacy" className="scroll-mt-6">
          <CardHeader>
            <CardTitle>
              <h2 className="type-headline-sm m-0">{t.privacy}</h2>
            </CardTitle>
            <CardDescription>{t.privacyIntro}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field orientation="horizontal" className="items-start justify-between gap-6 rounded-xl bg-muted p-4">
              <FieldContent>
                <FieldLabel htmlFor="saved-list">{t.savedPublic}</FieldLabel>
                <FieldDescription id="saved-list-hint">{t.savedHint}</FieldDescription>
              </FieldContent>
              <Switch
                id="saved-list"
                checked={savedPublic}
                onCheckedChange={setSavedPublic}
                aria-describedby="saved-list-hint"
              />
            </Field>
            <a href={privacyHref} className="self-start text-sm font-semibold text-primary-ink">
              {t.device}
            </a>
          </CardContent>
        </Card>

        {/* Small screens: clear the fixed Privacy preferences button. */}
        <div className="sticky bottom-20 z-10 flex sm:bottom-4 flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-md backdrop-blur-sm">
          <p role="status" className="m-0 text-sm text-muted-foreground">
            {dirty ? t.unsaved : ""}
          </p>
          <a href={cancelHref} data-slot="button" className={buttonVariants({ variant: "ghost" })}>
            {t.cancel}
          </a>
          <Button type="submit">{t.save}</Button>
        </div>
      </div>

      <aside aria-labelledby="preview-heading" className="lg:sticky lg:top-6 lg:col-span-4">
        <Card className="relative gap-4 overflow-hidden shadow-md">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-masa to-secondary" />
          <CardHeader className="flex flex-row items-center justify-between gap-2 pt-2">
            <p id="preview-heading" className="m-0 text-sm font-semibold text-muted-foreground">
              {t.preview}
            </p>
            <Badge variant="tag">
              <EyeOpenIcon aria-hidden="true" />
              {t.live}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2 text-center" aria-live="polite">
            <MemberAvatar
              displayName={name}
              avatarAssetId={photo}
              avatarPreset={preset}
              className="mb-2 size-24 shadow-md"
              fallbackClassName="font-serif text-4xl"
            />
            <p className="type-headline-sm m-0 break-words">{name.trim() || t.member}</p>
            <p className={cn("m-0 text-sm break-words", about.trim() ? "text-foreground" : "text-muted-foreground")}>
              {about.trim() || t.noBio}
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm">
              {savedPublic ? (
                <EyeOpenIcon aria-hidden="true" className="size-4 text-primary-ink" />
              ) : (
                <LockClosedIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              )}
              {savedPublic ? t.publicFavorites : t.privateFavorites}
            </span>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
