import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

/** Server-rendered controls: native form submission needs no React hydration. */
export function ProfileFields({
  spanish,
  displayName,
  bio,
  avatarPreset,
}: {
  spanish: boolean;
  displayName?: string | null;
  bio?: string | null;
  avatarPreset?: string | null;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="display-name">
          {spanish ? "Nombre público (obligatorio)" : "Display name (required)"}
        </FieldLabel>
        <Input
          id="display-name"
          name="displayName"
          required
          maxLength={80}
          autoComplete="nickname"
          defaultValue={displayName ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="bio">
          {spanish ? "Biografía (opcional)" : "Bio (optional)"}
        </FieldLabel>
        <Textarea
          id="bio"
          name="bio"
          maxLength={400}
          rows={4}
          defaultValue={bio ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="avatar">Avatar</FieldLabel>
        <NativeSelect
          id="avatar"
          name="avatarPreset"
          defaultValue={avatarPreset ?? ""}
        >
          <NativeSelectOption value="">
            {spanish ? "Mis iniciales" : "My initials"}
          </NativeSelectOption>
          <NativeSelectOption value="chile">
            {spanish ? "Chile" : "Chile pepper"}
          </NativeSelectOption>
          <NativeSelectOption value="corn">
            {spanish ? "Maíz" : "Corn"}
          </NativeSelectOption>
          <NativeSelectOption value="lime">
            {spanish ? "Lima" : "Lime"}
          </NativeSelectOption>
        </NativeSelect>
      </Field>
    </FieldGroup>
  );
}

export function SavedListField({
  spanish,
  isPublic,
}: {
  spanish: boolean;
  isPublic?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="saved-list">
        {spanish
          ? "Visibilidad de recetas guardadas"
          : "Saved recipe visibility"}
      </FieldLabel>
      <NativeSelect
        id="saved-list"
        name="savedListPublic"
        defaultValue={isPublic === false ? "false" : "true"}
        aria-describedby="favorites-privacy"
      >
        <NativeSelectOption value="true">
          {spanish ? "Públicas" : "Public"}
        </NativeSelectOption>
        <NativeSelectOption value="false">
          {spanish ? "Privadas" : "Private"}
        </NativeSelectOption>
      </NativeSelect>
      <FieldDescription id="favorites-privacy">
        {spanish
          ? "Tus recetas guardadas son públicas por defecto. Elige Privadas para compartir solo tus recetas publicadas."
          : "Your saved recipes are public by default. Choose Private to share only your published recipes."}
      </FieldDescription>
    </Field>
  );
}
