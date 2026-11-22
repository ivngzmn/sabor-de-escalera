import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
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
import { CheckIcon, CookieIcon, Cross2Icon, MixerHorizontalIcon, MinusCircledIcon } from "@radix-ui/react-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
      "Essential services keep sign-in secure and save drafts to your account. Optional settings start off. You can change them anytime in Privacy preferences.",
    accept: "Accept optional",
    reject: "Reject optional",
    customize: "Customize",
    back: "Back to privacy choices",
    optional: "Optional settings",
    save: "Save privacy choices",
    saved: "Privacy choices saved.",
    preferences: "Remember preferences",
    preferencesPurpose:
      "Remember your language and display choices on this device.",
    recovery: "Local draft recovery",
    recoveryPurpose:
      "Keep a text recovery copy on this device. Account autosave works without this choice.",
    analytics: "Usage analytics",
    analyticsPurpose:
      "Let Google Analytics and PostHog measure how the site is used. PostHog may also record visits as replays of the pages you see, with what you type in forms hidden. They get a device ID and, when you're signed in, your account ID and role.",
  },
  es: {
    title: "Tus opciones de privacidad",
    launcher: "Preferencias de privacidad",
    close: "Cerrar preferencias de privacidad",
    intro:
      "Los servicios esenciales protegen el inicio de sesión y guardan tus borradores en la cuenta. Las opciones empiezan desactivadas. Puedes cambiarlas en Preferencias de privacidad.",
    accept: "Aceptar opcionales",
    reject: "Rechazar opcionales",
    customize: "Personalizar",
    back: "Volver a las opciones de privacidad",
    optional: "Configuración opcional",
    save: "Guardar opciones de privacidad",
    saved: "Opciones de privacidad guardadas.",
    preferences: "Recordar preferencias",
    preferencesPurpose:
      "Recordar tu idioma y tus opciones de visualización en este dispositivo.",
    recovery: "Recuperación local de borradores",
    recoveryPurpose:
      "Guardar una copia de recuperación de texto en este dispositivo. El guardado en la cuenta funciona sin esta opción.",
    analytics: "Analíticas de uso",
    analyticsPurpose:
      "Permitir que Google Analytics y PostHog midan cómo se usa el sitio. PostHog también puede grabar las visitas como repeticiones de las páginas que ves, ocultando lo que escribes en los formularios. Reciben un identificador del dispositivo y, si iniciaste sesión, el identificador y el rol de tu cuenta.",
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
  const customizeButton = useRef<HTMLButtonElement>(null);
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
      setCustomize(settings);
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
  const back = () => {
    setChoices(readConsent());
    setCustomize(false);
    requestAnimationFrame(() => customizeButton.current?.focus());
  };
  return (
    <>
      <p role="status" className="sr-only">
        {message}
      </p>
      {!settings && ready && decided && (
        <Tooltip type="label" delay={150}>
          <TooltipTrigger
            render={
              <Button
                ref={launcher}
                type="button"
                variant="outline"
                size="icon"
                className="privacy-launcher rounded-full"
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
              />
            }
          >
            <CookieIcon className="privacy-launcher-icon size-5" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="right">{copy.launcher}</TooltipContent>
        </Tooltip>
      )}
      {visible && (
        <Card
          ref={panel}
          id={panelId}
          role="region"
          aria-label={copy.title}
          className={cn(
            "privacy-panel gap-4 rounded-2xl shadow-md",
            !settings && ready && "privacy-panel-floating",
            !settings && decided && "privacy-panel-reopened",
          )}
        >
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary-soft text-primary-ink">
                <CookieIcon aria-hidden="true" className="size-5" />
              </span>
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
          <CardContent className="flex flex-col gap-4">
            {(settings || !customize) && (
              <div className="privacy-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!ready}
                  onClick={() =>
                    save({ preferences: true, recovery: true, analytics: true })
                  }
                >
                  <CheckIcon data-icon="inline-start" aria-hidden="true" />
                  {copy.accept}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!ready}
                  onClick={() =>
                    save({
                      preferences: false,
                      recovery: false,
                      analytics: false,
                    })
                  }
                >
                  <MinusCircledIcon data-icon="inline-start" aria-hidden="true" />
                  {copy.reject}
                </Button>
                {!settings && (
                  <Button
                    type="button"
                    ref={customizeButton}
                    className="col-span-full"
                    variant="secondary"
                    size="sm"
                    disabled={!ready}
                    onClick={() => setCustomize(true)}
                  >
                    <MixerHorizontalIcon data-icon="inline-start" aria-hidden="true" />
                    {copy.customize}
                  </Button>
                )}
              </div>
            )}
            {customize && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save(choices);
                }}
              >
                <FieldGroup className="gap-4">
                  <FieldSet disabled={!ready} ref={fieldset} tabIndex={-1}>
                    <FieldLegend variant="label">{copy.optional}</FieldLegend>
                    <FieldGroup className="gap-0 divide-y divide-border rounded-lg border border-border">
                      {(["preferences", "recovery", "analytics"] as const).map(
                        (category) => (
                          <Field
                            key={category}
                            orientation="horizontal"
                            className="items-start gap-3 px-3 py-2.5"
                            data-disabled={!ready}
                          >
                            <Checkbox
                              id={`consent-${category}`}
                              className="mt-1"
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
                              <FieldLabel className="min-h-6 cursor-pointer" htmlFor={`consent-${category}`}>
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {!settings && (
                      <Button type="button" variant="ghost" onClick={back}>
                        {copy.back}
                      </Button>
                    )}
                    <Button type="submit" disabled={!ready}>{copy.save}</Button>
                  </div>
                </FieldGroup>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
