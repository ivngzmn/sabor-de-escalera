import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldLabel,
  FieldContent,
  FieldDescription,
} from "@/components/ui/field";
import { CookieIcon, Cross2Icon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import {
  CONSENT_STORAGE_KEY,
  readConsent,
  subscribeConsent,
  synchronizeConsent,
  updateConsent,
  type ConsentChoices,
} from "./service";
import "./consent.css";
const dictionaries = {
  en: {
    title: "Your privacy choices",
    launcher: "Privacy preferences",
    close: "Close privacy preferences",
    intro:
      "Essential services keep sign-in, security and your saved account drafts working. Optional choices start off and can be changed at any time in Privacy settings.",
    accept: "Accept optional",
    reject: "Reject optional",
    customize: "Customize",
    save: "Save privacy choices",
    saved: "Privacy choices saved.",
    essential: "Essential — always active",
    preferences: "Remember preferences",
    preferencesPurpose:
      "Remember your language and display choices on this device.",
    recovery: "Local draft recovery",
    recoveryPurpose:
      "Keep a text recovery copy on this device. Account autosave works without this choice.",
    analytics: "Usage analytics",
    analyticsPurpose:
      "Help us understand aggregate use without recipe text or personal profiles. Analytics remain unavailable until privacy controls are verified.",
  },
  es: {
    title: "Tus opciones de privacidad",
    launcher: "Preferencias de privacidad",
    close: "Cerrar preferencias de privacidad",
    intro:
      "Los servicios esenciales permiten iniciar sesión, mantener la seguridad y guardar tus borradores en la cuenta. Las opciones empiezan desactivadas y se pueden cambiar en Configuración de privacidad.",
    accept: "Aceptar opcionales",
    reject: "Rechazar opcionales",
    customize: "Personalizar",
    save: "Guardar opciones de privacidad",
    saved: "Opciones de privacidad guardadas.",
    essential: "Esenciales — siempre activos",
    preferences: "Recordar preferencias",
    preferencesPurpose:
      "Recordar tu idioma y tus opciones de visualización en este dispositivo.",
    recovery: "Recuperación local de borradores",
    recoveryPurpose:
      "Guardar una copia de recuperación de texto en este dispositivo. El guardado en la cuenta funciona sin esta opción.",
    analytics: "Analíticas de uso",
    analyticsPurpose:
      "Ayudarnos a entender el uso agregado sin texto de recetas ni perfiles personales. Las analíticas seguirán desactivadas hasta verificar los controles de privacidad.",
  },
};
export default function ConsentBanner({
  language = "en",
  settings = false,
}: {
  language?: "en" | "es";
  settings?: boolean;
}) {
  const copy = dictionaries[language];
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [decided, setDecided] = useState(false);
  const [customize, setCustomize] = useState(settings);
  const [choices, setChoices] = useState<ConsentChoices>({
    preferences: false,
    recovery: false,
    analytics: false,
  });
  const [message, setMessage] = useState("");
  const launcher = useRef<HTMLButtonElement>(null);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = settings
    ? "privacy-settings-panel"
    : "privacy-floating-panel";

  // Let footer links and focused content scroll above the nonmodal surface.
  useEffect(() => {
    if (settings || !ready) return;
    const surface = visible ? panel.current : launcher.current;
    if (!surface) return;
    const measure = () => {
      const clearance =
        document.documentElement.clientHeight -
        surface.getBoundingClientRect().top +
        16;
      document.documentElement.style.setProperty(
        "--privacy-clearance",
        `${clearance}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty("--privacy-clearance");
    };
  }, [settings, ready, visible, decided]);

  useEffect(() => {
    const refresh = () => {
      const consent = readConsent();
      setChoices(consent);
      setDecided(Boolean(consent.updatedAt));
      setVisible(settings || !consent.updatedAt);
    };
    refresh();
    synchronizeConsent();
    setReady(true);
    const unsubscribe = subscribeConsent(refresh);
    const sync = (event: StorageEvent) => {
      if (
        event.storageArea === window.localStorage &&
        (event.key === CONSENT_STORAGE_KEY || event.key === null)
      )
        synchronizeConsent();
    };
    window.addEventListener("storage", sync);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", sync);
    };
  }, [settings]);

  useEffect(() => {
    if (visible && customize && !settings) fieldset.current?.focus();
  }, [visible, customize, settings]);

  useEffect(() => {
    if (settings || !visible || !decided) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setVisible(false);
        launcher.current?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [settings, visible, decided]);

  const save = (next: ConsentChoices) => {
    updateConsent(next);
    setMessage(copy.saved);
    if (!settings) requestAnimationFrame(() => launcher.current?.focus());
  };
  const close = () => {
    setVisible(false);
    launcher.current?.focus();
  };
  return (
    <>
      <p role="status" className="sr-only">
        {message}
      </p>
      {!settings && ready && decided && (
        <Button
          ref={launcher}
          type="button"
          variant="outline"
          className="privacy-launcher"
          aria-expanded={visible}
          aria-controls={panelId}
          onClick={() => {
            if (visible) close();
            else {
              setChoices(readConsent());
              setCustomize(true);
              setVisible(true);
            }
          }}
        >
          <CookieIcon data-icon="inline-start" aria-hidden="true" />
          {copy.launcher}
        </Button>
      )}
      {visible && (
        <Card
          ref={panel}
          id={panelId}
          role="region"
          aria-label={copy.title}
          className={cn(
            "privacy-panel",
            !settings && "privacy-panel-floating",
            !settings && decided && "privacy-panel-reopened",
          )}
        >
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              {copy.title}
            </CardTitle>
            <CardDescription>{copy.intro}</CardDescription>
            {!settings && decided && (
              <CardAction>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={copy.close}
                  onClick={close}
                >
                  <Cross2Icon aria-hidden="true" />
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="privacy-actions">
              <Button
                type="button"
                disabled={!ready}
                onClick={() =>
                  save({ preferences: true, recovery: true, analytics: true })
                }
              >
                {copy.accept}
              </Button>
              <Button
                type="button"
                disabled={!ready}
                onClick={() =>
                  save({
                    preferences: false,
                    recovery: false,
                    analytics: false,
                  })
                }
              >
                {copy.reject}
              </Button>
              {!settings && (
                <Button
                  type="button"
                  disabled={!ready}
                  onClick={() => setCustomize(true)}
                >
                  {copy.customize}
                </Button>
              )}
            </div>
            {customize && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save(choices);
                }}
              >
                <FieldGroup>
                  <FieldSet disabled={!ready} ref={fieldset} tabIndex={-1}>
                    <FieldLegend>{copy.title}</FieldLegend>
                    <FieldGroup>
                      {(["preferences", "recovery", "analytics"] as const).map(
                        (category) => (
                          <Field
                            key={category}
                            orientation="horizontal"
                            data-disabled={!ready}
                          >
                            <Checkbox
                              id={`consent-${category}`}
                              checked={choices[category]}
                              disabled={!ready}
                              onCheckedChange={(checked) =>
                                setChoices((previous) => ({
                                  ...previous,
                                  [category]: checked === true,
                                }))
                              }
                              aria-describedby={`consent-${category}-purpose`}
                            />
                            <FieldContent>
                              <FieldLabel htmlFor={`consent-${category}`}>
                                {copy[category]}
                              </FieldLabel>
                              <FieldDescription
                                id={`consent-${category}-purpose`}
                              >
                                {copy[`${category}Purpose`]}
                              </FieldDescription>
                            </FieldContent>
                          </Field>
                        ),
                      )}
                    </FieldGroup>
                  </FieldSet>
                  <Button type="submit" disabled={!ready}>
                    {copy.save}
                  </Button>
                </FieldGroup>
              </form>
            )}
          </CardContent>
          <CardFooter>
            <p>{copy.essential}</p>
          </CardFooter>
        </Card>
      )}
    </>
  );
}
