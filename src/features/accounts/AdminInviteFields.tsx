import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AdminInviteFields({ spanish }: { spanish: boolean }) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="invite-email">
          {spanish ? "Correo del administrador" : "Administrator email"}
        </FieldLabel>
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby="invite-description"
        />
        <FieldDescription id="invite-description">
          {spanish
            ? "La invitación dura siete días. El acceso se concede cuando inicie sesión con ese correo verificado. Comparte el enlace /admin; los correos de notificación están desactivados."
            : "The invitation lasts seven days. Access is granted when they sign in with that verified email. Share the /admin link; notification emails are disabled."}
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
}
