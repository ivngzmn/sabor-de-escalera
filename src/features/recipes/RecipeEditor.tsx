import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import ImageUploader from "../media/ImageUploader";
import {
  readConsent,
  registerConsentCleanup,
  subscribeConsent,
  synchronizeConsent,
} from "../consent/service";
import {
  clearAccountRecovery,
  forgetRecovery,
  readRecovery,
  writeRecovery,
  type Recovery,
} from "./recovery";
import {
  categories,
  emptyRecipe,
  sameRecipe,
  totalMinutes,
  validatePublication,
  type Draft,
  type Failure,
  type FieldError,
  type Ingredient,
  type Instruction,
  type Origin,
  type RecipeInput,
  type Result,
} from "./validation";
import RecipePreview from "./RecipePreview";
import "./editor.css";
interface Props {
  accountId: string;
  initial: Draft | null;
  origins: Origin[];
  mediaAvailable: boolean;
  language?: "en" | "es";
}
class RequestError extends Error {
  constructor(readonly details: Failure) {
    super(details.message);
  }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    credentials: "same-origin",
    redirect: "error",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data: Result<T> = await res.json();
  if (!data.ok) throw new RequestError(data.error);
  if (!res.ok) throw new Error("Request failed");
  return data.value;
}
const fieldId = (field: string) => `field-${field.replaceAll(".", "-")}`;
export default function RecipeEditor({
  accountId,
  initial,
  origins,
  mediaAvailable,
  language = "en",
}: Props) {
  const [draft, setDraft] = useState<Draft | null>(initial),
    [input, setInput] = useState<RecipeInput>(initial?.input ?? emptyRecipe()),
    [step, setStep] = useState(0),
    [lang, setLang] = useState(language);
  const [status, setStatus] = useState(initial ? "saved" : "creating"),
    [failure, setFailure] = useState<Failure | null>(null),
    [operationError, setOperationError] = useState(false),
    [errors, setErrors] = useState<FieldError[]>([]),
    [conflict, setConflict] = useState(false),
    [blocked, setBlocked] = useState(false),
    [publishing, setPublishing] = useState(false),
    [published, setPublished] = useState<Draft | null>(null),
    [recovery, setRecovery] = useState<Recovery | null>(null),
    [similar, setSimilar] = useState<
      { id: string; title: string; url: string }[]
    >([]),
    [paste, setPaste] = useState(""),
    [pasteLines, setPasteLines] = useState<string[] | null>(null),
    [confirmDelete, setConfirmDelete] = useState(false);
  const current = useRef(input),
    saved = useRef(initial?.input ?? null),
    record = useRef(initial),
    busy = useRef(false),
    stopped = useRef(false),
    publicationPending = useRef(false),
    lastWrite = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saveAction = useRef<() => Promise<Draft | null>>(async () => null),
    drag = useRef<number | null>(null);
  const t = (en: string, es: string) => (lang === "es" ? es : en);
  function update(next: RecipeInput) {
    current.current = next;
    setInput(next);
    setStatus("unsaved");
    setFailure(null);
    if (record.current) {
      try {
        writeRecovery(localStorage, readConsent().recovery, accountId, {
          id: record.current.id,
          version: record.current.version,
          generation: record.current.generation,
          input: next,
        });
      } catch {
        /* Storage unavailable. */
      }
    }
  }
  function forget(id: string) {
    try {
      forgetRecovery(localStorage, accountId, id);
    } catch {
      /* Storage unavailable. */
    }
  }
  function remember(next: Draft) {
    record.current = next;
    setDraft(next);
    saved.current = next.input;
    const url = new URL(location.href);
    url.searchParams.set("draft", next.id);
    history.replaceState(null, "", url);
  }
  function stop(error: Failure) {
    setOperationError(false);
    setFailure(error);
    setStatus("error");
    if (error.status === 409) setConflict(true);
    if (error.status === 410 || error.status === 401) {
      stopped.current = true;
      setBlocked(true);
      try {
        clearAccountRecovery(localStorage, accountId);
      } catch {
        /* Storage unavailable. */
      }
    }
  }
  function failOperation(error: unknown, message: string) {
    if (error instanceof RequestError) stop(error.details);
    else {
      setFailure({ status: 503, message });
      setStatus("error");
      setOperationError(true);
    }
  }
  async function confirmPublished(id: string) {
    try {
      const recipe = await request<Draft>(`/api/drafts/${id}`);
      if (recipe.state !== "published") return false;
      stopped.current = true;
      setPublished(recipe);
      forget(id);
      return true;
    } catch {
      return false;
    }
  }
  async function create() {
    if (busy.current) return;
    busy.current = true;
    setStatus("creating");
    try {
      const next = await request<Draft>("/api/drafts", {});
      remember(next);
      current.current = next.input;
      setInput(next.input);
      setStatus("saved");
    } catch (e) {
      stop(
        e instanceof RequestError
          ? e.details
          : {
              status: 503,
              message: t(
                "Could not create the draft. Retry.",
                "No se pudo crear el borrador. Reintenta.",
              ),
            },
      );
    } finally {
      busy.current = false;
    }
  }
  async function save(): Promise<Draft | null> {
    if (!record.current || busy.current || stopped.current || conflict)
      return null;
    const snapshot = current.current;
    if (sameRecipe(snapshot, saved.current)) {
      setStatus("saved");
      return record.current;
    }
    const wait = 5000 - (Date.now() - lastWrite.current);
    if (wait > 0) {
      setStatus("waiting");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void saveAction.current();
      }, wait);
      return null;
    }
    busy.current = true;
    setStatus("saving");
    setFailure(null);
    try {
      const next = await request<Draft>(`/api/drafts/${record.current.id}`, {
        action: "save",
        version: record.current.version,
        input: snapshot,
      });
      remember(next);
      lastWrite.current = Date.now();
      if (sameRecipe(current.current, snapshot)) {
        current.current = next.input;
        setInput(next.input);
        setStatus("saved");
        forget(next.id);
      } else setStatus("unsaved");
      return next;
    } catch (e) {
      const error =
        e instanceof RequestError
          ? e.details
          : {
              status: 503,
              message: t(
                "Could not save. Your text and photos are preserved. Retry.",
                "No se pudo guardar. Se conservan el texto y las fotos. Reintenta.",
              ),
            };
      stop(error);
      if (error.status === 429) {
        lastWrite.current = Date.now() - 5000 + (error.retryAfter ?? 5) * 1000;
        setStatus("waiting");
      }
      return null;
    } finally {
      busy.current = false;
    }
  }
  saveAction.current = () =>
    publicationPending.current ? Promise.resolve(null) : save();
  useEffect(() => {
    if (!initial) {
      void create();
      return;
    }
    try {
      const r = readRecovery(
        localStorage,
        readConsent().recovery,
        accountId,
        initial,
      );
      if (r && !sameRecipe(r.input, initial.input)) setRecovery(r);
    } catch {
      /* Optional storage. */
    }
    // Initial server load has checked tombstones and current generation.
  }, []);
  useEffect(() => {
    if (status !== "unsaved" && status !== "waiting") return;
    const scheduled = setTimeout(
      () => {
        void saveAction.current();
      },
      Math.max(700, 5000 - (Date.now() - lastWrite.current)),
    );
    return () => clearTimeout(scheduled);
  }, [input, status]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (
        record.current &&
        !stopped.current &&
        !sameRecipe(current.current, saved.current)
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("beforeunload", leave);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    const withdraw = registerConsentCleanup("recovery", () =>
      setRecovery(null),
    );
    const subscription = subscribeConsent(() => {
      if (!readConsent().recovery) setRecovery(null);
    });
    const storage = () => synchronizeConsent();
    window.addEventListener("storage", storage);
    const logout = () => {
      try {
        clearAccountRecovery(localStorage, accountId);
      } catch {
        /* Optional storage. */
      }
      stopped.current = true;
      setBlocked(true);
      setFailure({ status: 401, message: "Sign-in required." });
    };
    // Clerk session changes include logout in another tab; the auth boundary also
    // rejects every subsequent save/read. No test identity is installed here.
    const clerk = (
      window as Window & {
        Clerk?: {
          addListener: (fn: (state: { user: unknown }) => void) => () => void;
        };
      }
    ).Clerk;
    const removeClerk = clerk?.addListener((state) => {
      if (!state.user) logout();
    });
    window.addEventListener("escalera:logout", logout);
    const check = async () => {
      if (
        !record.current ||
        stopped.current ||
        document.visibilityState === "hidden"
      )
        return;
      try {
        await request<Draft>(`/api/drafts/${record.current.id}`);
      } catch (e) {
        if (
          e instanceof RequestError &&
          (e.details.status === 401 || e.details.status === 410)
        )
          stop(e.details);
      }
    };
    const poll = setInterval(check, 30000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      withdraw();
      subscription();
      removeClerk?.();
      window.removeEventListener("storage", storage);
      window.removeEventListener("escalera:logout", logout);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      clearInterval(poll);
    };
  }, [accountId]);
  useEffect(() => {
    const applyLanguage = (next: "en" | "es") => {
      setLang(next);
      document.documentElement.lang = next;
      document
        .querySelectorAll<HTMLElement>("[data-en][data-es]")
        .forEach((el) => {
          el.textContent = el.dataset[next] ?? "";
        });
      document
        .querySelectorAll<HTMLAnchorElement>("a[hreflang]")
        .forEach((el) => {
          if (el.hreflang === next) el.setAttribute("aria-current", "true");
          else el.removeAttribute("aria-current");
        });
      const url = new URL(location.href);
      url.searchParams.set("lang", next);
      history.replaceState(null, "", url);
      if (readConsent().preferences) {
        try {
          localStorage.setItem("escalera:preferences:language", next);
        } catch {
          /* Optional. */
        }
      }
    };
    if (!new URL(location.href).searchParams.has("lang") && readConsent().preferences) {
      try {
        const preferred = localStorage.getItem("escalera:preferences:language");
        if (preferred === "en" || preferred === "es") applyLanguage(preferred);
      } catch {
        /* Optional storage may be unavailable. */
      }
    }
    const switchLanguage = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[hreflang]");
      if (!link || !["en", "es"].includes(link.hreflang)) return;
      event.preventDefault();
      applyLanguage(link.hreflang as "en" | "es");
    };
    document.addEventListener("click", switchLanguage);
    return () => document.removeEventListener("click", switchLanguage);
  }, []);
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      if (input.title.trim().length >= 3)
        request<{ id: string; title: string; url: string }[]>(
          `/api/drafts?similar=${encodeURIComponent(input.title)}`,
        )
          .then((rows) => {
            if (active) setSimilar(rows);
          })
          .catch(() => {});
      else setSimilar([]);
    }, 500);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [input.title]);
  function jump(error: FieldError) {
    setStep(error.step);
    setTimeout(() => document.getElementById(fieldId(error.field))?.focus(), 0);
  }
  function set<K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) {
    update({ ...current.current, [key]: value });
  }
  function label(field: string, en: string, es: string) {
    const error = errors.find((e) => e.field === field);
    return (
      <>
        <Label htmlFor={fieldId(field)}>{t(en, es)}</Label>
        {error && (
          <p id={`${fieldId(field)}-error`} className="field-error">
            {lang === "es" ? "Revisa este campo." : error.message}
          </p>
        )}
      </>
    );
  }
  function textField(
    field:
      "title" | "yieldText" | "story" | "sourceCredit" | "videoUrl" | "notes",
    en: string,
    es: string,
    multiline = false,
  ) {
    const props = {
      id: fieldId(field),
      value: input[field],
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => set(field, e.target.value),
      "aria-invalid": errors.some((e) => e.field === field),
      "aria-describedby": errors.some((e) => e.field === field)
        ? `${fieldId(field)}-error`
        : undefined,
    };
    return (
      <div className="editor-field">
        {label(field, en, es)}
        {multiline ? <Textarea {...props} rows={4} /> : <Input {...props} />}
      </div>
    );
  }
  function plainPaste(event: ClipboardEvent<HTMLFormElement>) {
    const el = event.target;
    if (
      !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ||
      ["number", "range", "checkbox", "file"].includes(el.type)
    )
      return;
    event.preventDefault();
    const text = event.clipboardData
      .getData("text/plain")
      .replace(/\r\n?/g, "\n");
    const start = el.selectionStart ?? el.value.length,
      end = el.selectionEnd ?? start;
    const setter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(el, el.value.slice(0, start) + text + el.value.slice(end));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function move(
    kind: "ingredients" | "instructions" | "photos",
    from: number,
    to: number,
  ) {
    const rows = [...input[kind]];
    if (to < 0 || to >= rows.length) return;
    const [row] = rows.splice(from, 1);
    rows.splice(to, 0, row);
    update({ ...input, [kind]: rows });
  }
  function controls(
    kind: "ingredients" | "instructions" | "photos",
    i: number,
  ) {
    const noun =
      kind === "ingredients"
        ? t("ingredient", "ingrediente")
        : kind === "instructions"
          ? t("instruction", "instrucción")
          : t("photo", "foto");
    return (
      <div className="row-actions">
        <Button
          type="button"
          variant="outline"
          aria-label={t(`Move ${noun} ${i + 1} up`, `Subir ${noun} ${i + 1}`)}
          disabled={i === 0}
          onClick={() => move(kind, i, i - 1)}
        >
          ↑ {t("Move up", "Subir")}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label={t(`Move ${noun} ${i + 1} down`, `Bajar ${noun} ${i + 1}`)}
          disabled={i === input[kind].length - 1}
          onClick={() => move(kind, i, i + 1)}
        >
          ↓ {t("Move down", "Bajar")}
        </Button>
        <Button
          type="button"
          onClick={() =>
            update({
              ...input,
              [kind]: input[kind].filter((_, index) => index !== i),
            })
          }
        >
          {t("Remove", "Eliminar")}
        </Button>
      </div>
    );
  }
  const draggable = (
    kind: "ingredients" | "instructions" | "photos",
    i: number,
  ) => ({
    draggable: true,
    onDragStart: () => {
      drag.current = i;
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (drag.current !== null) move(kind, drag.current, i);
      drag.current = null;
    },
  });
  async function loadLatest() {
    if (!record.current) return;
    try {
      const next = await request<Draft>(`/api/drafts/${record.current.id}`);
      remember(next);
      current.current = next.input;
      setInput(next.input);
      setConflict(false);
      setFailure(null);
      setStatus("saved");
      forget(next.id);
    } catch (e) {
      failOperation(e, "Could not load the latest draft. Your work is preserved. Use Load latest to retry.");
    }
  }
  async function copy() {
    if (!record.current || busy.current) return;
    busy.current = true;
    const snapshot = current.current;
    try {
      const next = await request<Draft>(`/api/drafts/${record.current.id}`, {
        action: "copy",
        generation: record.current.generation,
        input: snapshot,
      });
      forget(record.current.id);
      remember(next);
      if (sameRecipe(current.current, snapshot)) {
        current.current = next.input;
        setInput(next.input);
        setStatus("saved");
      } else {
        update(current.current);
        setStatus("unsaved");
      }
      setConflict(false);
      setFailure(null);
    } catch (e) {
      failOperation(e, "Could not create a separate draft. Your work is preserved. Use Save as separate draft to retry.");
    } finally {
      busy.current = false;
    }
  }
  async function publish() {
    const fields = validatePublication(current.current);
    setErrors(fields);
    if (fields.length) {
      setFailure({
        status: 422,
        message: t(
          "Complete the checklist before publishing.",
          "Completa la lista antes de publicar.",
        ),
      });
      return;
    }
    publicationPending.current = true;
    setPublishing(true);
    try {
      const wait = Math.max(0, 5000 - (Date.now() - lastWrite.current));
      if (wait > 0) {
        setStatus("waiting");
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      const next = await save();
      if (
        !next ||
        !sameRecipe(current.current, saved.current) ||
        stopped.current
      ) {
        if (record.current) await confirmPublished(record.current.id);
        return;
      }
      const recipe = await request<Draft>(`/api/drafts/${next.id}`, {
        action: "publish",
        version: next.version,
      });
      stopped.current = true;
      setPublished(recipe);
      forget(next.id);
    } catch (e) {
      if (record.current && await confirmPublished(record.current.id)) return;
      failOperation(e, "Could not confirm publication. Your work is preserved. Use Publish Recipe to retry.");
      if (e instanceof RequestError) setErrors(e.details.fields ?? []);
    } finally {
      publicationPending.current = false;
      setPublishing(false);
    }
  }
  async function remove() {
    if (!draft) return;
    try {
      await request(`/api/drafts/${draft.id}`, {
        action: "delete",
        version: draft.version,
      });
      forget(draft.id);
      stopped.current = true;
      setBlocked(true);
      setFailure({
        status: 410,
        message: t(
          "Draft deleted. Its device copy has been removed.",
          "Borrador eliminado. Se ha borrado la copia del dispositivo.",
        ),
      });
    } catch (e) {
      failOperation(e, "Could not confirm deletion. Your work is preserved. Use Confirm delete to retry.");
    }
  }
  if (published)
    return (
      <section>
        <h1>{t("Your recipe is published", "Tu receta está publicada")}</h1>
        <div className="editor-actions">
          <a href={published.url!}>{t("View Recipe", "Ver receta")}</a>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  new URL(published.url!, location.origin).href,
                );
                setStatus("copied");
              } catch {
                setStatus("copy-failed");
              }
            }}
          >
            {t("Copy Link", "Copiar enlace")}
          </Button>
          <a href="/add-recipe">
            {t("Add Another Recipe", "Añadir otra receta")}
          </a>
        </div>
        <p role="status">
          {status === "copied"
            ? t("Link copied.", "Enlace copiado.")
            : status === "copy-failed"
              ? new URL(published.url!, location.origin).href
              : ""}
        </p>
      </section>
    );
  return (
    <div className="recipe-editor">
      <p className="eyebrow">{t("From your kitchen", "Desde tu cocina")}</p>
      <h1>{t("Share your recipe", "Comparte tu receta")}</h1>
      <p>
        {draft?.label ?? t("Preparing your draft…", "Preparando tu borrador…")}
      </p>
      <p>
        {t(
          "A title is required before publication. Saved drafts stay until you delete them.",
          "Se necesita un título para publicar. Los borradores se conservan hasta que los elimines.",
        )}
      </p>
      <div className="editor-actions">
        <Button
          type="button"
          disabled={busy.current || blocked || conflict || publishing}
          onClick={() => (draft ? void save() : void create())}
        >
          {t("Save Draft", "Guardar borrador")}
        </Button>
        <Button
          type="button"
          disabled={!draft || blocked || publishing}
          onClick={() => setConfirmDelete(true)}
        >
          {t("Delete draft", "Eliminar borrador")}
        </Button>
      </div>
      <p role="status" aria-live="polite">
        {
          {
            saved: t("Saved", "Guardado"),
            saving: t("Saving…", "Guardando…"),
            unsaved: t("Unsaved changes", "Cambios sin guardar"),
            waiting: t(
              "Saving shortly — at most once every five seconds.",
              "Se guardará pronto: como máximo una vez cada cinco segundos.",
            ),
            creating: t("Creating draft…", "Creando borrador…"),
            error: t("Not saved", "No guardado"),
          }[status]
        }
      </p>
      {failure && (
        <div role="alert">
          <p>
            {lang === "es" && failure.status !== 410
              ? t(
                  "Revisa los campos o vuelve a intentar. Tu trabajo se conserva.",
                  "Revisa los campos o vuelve a intentar. Tu trabajo se conserva.",
                )
              : failure.message}
          </p>
          {!blocked && !conflict && !operationError && (
            <Button
              type="button"
              onClick={() => (draft ? void save() : void create())}
            >
              {t("Retry save", "Reintentar guardado")}
            </Button>
          )}
        </div>
      )}
      {conflict && (
        <div className="editor-actions">
          <Button onClick={loadLatest}>
            {t("Load latest", "Cargar última versión")}
          </Button>
          <Button onClick={copy}>
            {t("Save as separate draft", "Guardar como otro borrador")}
          </Button>
        </div>
      )}
      {blocked && (
        <a href="/add-recipe">
          {t("Start a new recipe", "Empezar otra receta")}
        </a>
      )}
      {confirmDelete && !blocked && (
        <section aria-label={t("Confirm deletion", "Confirmar eliminación")}>
          <p>
            {t(
              "Delete this draft and its device recovery copy?",
              "¿Eliminar este borrador y su copia de recuperación?",
            )}
          </p>
          <Button onClick={remove}>
            {t("Confirm delete", "Confirmar eliminación")}
          </Button>{" "}
          <Button onClick={() => setConfirmDelete(false)}>
            {t("Cancel", "Cancelar")}
          </Button>
        </section>
      )}
      {recovery && !blocked && (
        <section>
          <p>
            {t(
              "A device recovery copy is available. Review it before saving.",
              "Hay una copia de recuperación. Revísala antes de guardar.",
            )}
          </p>
          <Button
            onClick={() => {
              const r = recovery;
              setRecovery(null);
              update(r.input);
              if (r.version !== draft?.version) {
                setConflict(true);
                setFailure({
                  status: 409,
                  message:
                    "The server version changed. Choose how to continue.",
                });
              }
            }}
          >
            {t("Restore device copy", "Restaurar copia")}
          </Button>
          <Button
            onClick={() => {
              if (draft) forget(draft.id);
              setRecovery(null);
            }}
          >
            {t("Discard device copy", "Descartar copia")}
          </Button>
        </section>
      )}
      <nav
        aria-label={t("Recipe steps", "Pasos de la receta")}
        className="editor-tabs"
      >
        {[
          t("Details", "Detalles"),
          t("Photos", "Fotos"),
          t("Ingredients", "Ingredientes"),
          t("Instructions", "Instrucciones"),
          t("Preview", "Vista previa"),
        ].map((name, index) => (
          <Button
            type="button"
            key={index}
            variant={step === index ? "secondary" : "outline"}
            aria-current={step === index ? "step" : undefined}
            onClick={() => {
              setStep(index);
              setPasteLines(null);
              setPaste("");
            }}
          >
            {name}
          </Button>
        ))}
      </nav>
      {errors.length > 0 && (
        <section aria-label={t("Publication checklist", "Lista para publicar")}>
          <h2>{t("Before you publish", "Antes de publicar")}</h2>
          <ul>
            {errors.map((error, i) => (
              <li key={i}>
                <Button
                  variant="link"
                  className="text-left justify-start"
                  type="button"
                  onClick={() => jump(error)}
                >
                  {lang === "es"
                    ? `${["Detalles", "Fotos", "Ingredientes", "Instrucciones"][error.step]}: revisa ${error.field}`
                    : error.message}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form onSubmit={(e) => e.preventDefault()} onPaste={plainPaste}>
        <fieldset
          disabled={!draft || blocked || !!published || publishing}
          className="editor-fields"
        >
          {step === 0 && (
            <section>
              <h2>{t("Details", "Detalles")}</h2>
              {textField("title", "Title", "Título")}
              {similar.length > 0 && (
                <aside>
                  <p>
                    {t(
                      "Similar titles already exist. Family variations are welcome; this does not block publication.",
                      "Ya hay títulos similares. Las variantes familiares son bienvenidas; puedes publicar.",
                    )}
                  </p>
                  <ul>
                    {similar.map((r) => (
                      <li key={r.id}>
                        <a href={r.url} target="_blank" rel="noopener">
                          {r.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
              <div className="editor-grid">
                <div className="editor-field">
                  {label("category", "Primary category", "Categoría principal")}
                  <NativeSelect
                    id={fieldId("category")}
                    value={input.category}
                    onChange={(e) => set("category", e.target.value)}
                  >
                    <option value="">{t("Choose…", "Elegir…")}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c[lang]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="editor-field">
                  {label("origin", "Origin", "Origen")}
                  <NativeSelect
                    id={fieldId("origin")}
                    value={input.origin}
                    onChange={(e) => set("origin", e.target.value)}
                  >
                    <option value="">{t("Choose…", "Elegir…")}</option>
                    {origins.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o[lang === "es" ? "label_es" : "label_en"]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              {textField(
                "yieldText",
                "Servings / yield",
                "Porciones / rendimiento",
              )}
              <div className="editor-field">
                {label(
                  "baseline",
                  "Scaling baseline",
                  "Base numérica para ajustar porciones",
                )}
                <Input
                  id={fieldId("baseline")}
                  type="number"
                  min="0.01"
                  step="any"
                  value={input.baseline ?? ""}
                  onChange={(e) =>
                    update({
                      ...input,
                      baseline:
                        e.target.value === "" ? null : Number(e.target.value),
                      baselineConfirmed: false,
                    })
                  }
                />
                <Label>
                  <input
                    type="checkbox"
                    checked={input.baselineConfirmed}
                    onChange={(e) => set("baselineConfirmed", e.target.checked)}
                  />
                  {t(
                    "I confirm this numeric baseline",
                    "Confirmo esta base numérica",
                  )}
                </Label>
                <p>
                  {t(
                    "Keep your yield range above; choose the number the written quantities serve. Quantities such as ½, 2–3 and “to taste” remain as written.",
                    "Conserva arriba el rango; elige cuántas porciones representan las cantidades. Se conservan ½, 2–3 y «al gusto».",
                  )}
                </p>
              </div>
              <div className="editor-field">
                {label("timing", "Timing method", "Cómo indicar el tiempo")}
                <NativeSelect
                  id={fieldId("timing")}
                  value={input.timing.mode}
                  onChange={(e) =>
                    set("timing", {
                      ...input.timing,
                      mode: e.target.value as "total" | "parts",
                    })
                  }
                >
                  <option value="total">
                    {t("Total time", "Tiempo total")}
                  </option>
                  <option value="parts">
                    {t("Prep + cook + rest", "Preparación + cocción + reposo")}
                  </option>
                </NativeSelect>
              </div>
              <div className="editor-grid">
                {(input.timing.mode === "total"
                  ? (["total"] as const)
                  : (["prep", "cook", "rest"] as const)
                ).map((k) => (
                  <div className="editor-field" key={k}>
                    {label(
                      `timing.${k}`,
                      `${{ total: "Total", prep: "Prep", cook: "Cook", rest: "Rest / chill (optional)" }[k]} minutes`,
                      `${{ total: "Total", prep: "Preparación", cook: "Cocción", rest: "Reposo / frío (opcional)" }[k]} en minutos`,
                    )}
                    <Input
                      id={fieldId(`timing.${k}`)}
                      type="number"
                      min="0"
                      value={input.timing[k] ?? ""}
                      onChange={(e) =>
                        set("timing", {
                          ...input.timing,
                          [k]:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <p>
                {t(
                  "Total includes all preparation, cooking and rest/chill time.",
                  "El total incluye preparación, cocción y reposo/frío.",
                )}{" "}
                {totalMinutes(input) ?? "—"} {t("minutes", "minutos")}
              </p>
              {textField(
                "story",
                "Story (optional)",
                "Historia (opcional)",
                true,
              )}
              {textField(
                "sourceCredit",
                "Source / original author credit (optional)",
                "Fuente / autor original (opcional)",
              )}
              {textField(
                "videoUrl",
                "External video link (optional)",
                "Enlace externo de vídeo (opcional)",
              )}
              {textField(
                "notes",
                "Author notes (optional)",
                "Notas del autor (opcional)",
                true,
              )}
              <div className="editor-field">
                {label(
                  "language",
                  "Original recipe language",
                  "Idioma original de la receta",
                )}
                <NativeSelect
                  id={fieldId("language")}
                  value={input.language}
                  onChange={(e) =>
                    set("language", e.target.value as "en" | "es")
                  }
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </NativeSelect>
              </div>
              <p>
                {t(
                  "Optional dietary tags are author provided.",
                  "Las etiquetas opcionales las indica el autor.",
                )}
              </p>
              {["vegan", "vegetarian"].map((tag) => (
                <Label key={tag}>
                  <input
                    type="checkbox"
                    checked={input.dietary.includes(tag)}
                    onChange={(e) =>
                      set(
                        "dietary",
                        e.target.checked
                          ? [...input.dietary, tag]
                          : input.dietary.filter((x) => x !== tag),
                      )
                    }
                  />
                  {tag === "vegan"
                    ? t("Vegan", "Vegano")
                    : t("Vegetarian", "Vegetariano")}
                </Label>
              ))}
            </section>
          )}
          {step === 1 && (
            <section>
              <h2 id={fieldId("photos")} tabIndex={-1}>
                {t("Photos", "Fotos")}
              </h2>
              <p>
                {t(
                  "Add 1–6 captioned photos. The first photo is the cover; the full image stays available in the gallery.",
                  "Añade de 1 a 6 fotos con descripción. La primera es la portada; se conserva la imagen completa en la galería.",
                )}
              </p>
              {input.photos.map((p, i) => (
                <fieldset key={p.assetId} {...draggable("photos", i)}>
                  <legend>
                    {i === 0
                      ? t("Cover photo", "Foto de portada")
                      : `${t("Photo", "Foto")} ${i + 1}`}
                  </legend>
                  <div className="cover-frame">
                    <img
                      src={`/api/media/${p.assetId}?variant=gallery`}
                      width={p.width ?? 640}
                      height={p.height ?? 480}
                      alt={p.alt || p.caption}
                      style={{
                        objectPosition: `${p.crop.x}% ${p.crop.y}%`,
                        transform: `scale(${p.crop.zoom})`,
                      }}
                    />
                  </div>
                  <div className="editor-field">
                    {label(
                      `photos.${i}.caption`,
                      `Caption ${i + 1}`,
                      `Descripción ${i + 1}`,
                    )}
                    <Textarea
                      id={fieldId(`photos.${i}.caption`)}
                      maxLength={400}
                      value={p.caption}
                      onChange={(e) =>
                        set(
                          "photos",
                          input.photos.map((photo, j) =>
                            j === i
                              ? { ...photo, caption: e.target.value }
                              : photo,
                          ),
                        )
                      }
                    />
                    <p>{Array.from(p.caption).length}/400</p>
                  </div>
                  <div className="editor-field">
                    {label(
                      `photos.${i}.alt`,
                      `Alt text ${i + 1} (optional)`,
                      `Texto alternativo ${i + 1} (opcional)`,
                    )}
                    <Input
                      id={fieldId(`photos.${i}.alt`)}
                      maxLength={400}
                      value={p.alt}
                      onChange={(e) =>
                        set(
                          "photos",
                          input.photos.map((photo, j) =>
                            j === i ? { ...photo, alt: e.target.value } : photo,
                          ),
                        )
                      }
                    />
                    <p>
                      {t(
                        "The caption is the default alt text.",
                        "La descripción se usa como texto alternativo por defecto.",
                      )}
                    </p>
                  </div>
                  {i === 0 &&
                    (["x", "y", "zoom"] as const).map((k) => (
                      <Label key={k}>
                        {t(
                          `Cover ${k === "x" ? "horizontal position" : k === "y" ? "vertical position" : "zoom"}`,
                          `Portada: ${k === "x" ? "posición horizontal" : k === "y" ? "posición vertical" : "zoom"}`,
                        )}
                        <input
                          type="range"
                          min={k === "zoom" ? 1 : 0}
                          max={k === "zoom" ? 3 : 100}
                          step={k === "zoom" ? 0.1 : 1}
                          value={p.crop[k]}
                          onChange={(e) =>
                            set(
                              "photos",
                              input.photos.map((photo, j) =>
                                j === i
                                  ? {
                                      ...photo,
                                      crop: {
                                        ...photo.crop,
                                        [k]: Number(e.target.value),
                                      },
                                    }
                                  : photo,
                              ),
                            )
                          }
                        />
                      </Label>
                    ))}
                  {i > 0 && (
                    <Button type="button" onClick={() => move("photos", i, 0)}>
                      {t("Make cover", "Usar como portada")}
                    </Button>
                  )}
                  {controls("photos", i)}
                  <ImageUploader
                    purpose="recipe"
                    available={mediaAvailable}
                    spanish={lang === "es"}
                    onComplete={(asset) =>
                      set(
                        "photos",
                        current.current.photos.map((photo) =>
                          photo.assetId === p.assetId
                            ? {
                                ...photo,
                                assetId: asset.id,
                                width: asset.width,
                                height: asset.height,
                              }
                            : photo,
                        ),
                      )
                    }
                  />
                </fieldset>
              ))}
              {input.photos.length < 6 && (
                <ImageUploader
                  purpose="recipe"
                  available={mediaAvailable}
                  spanish={lang === "es"}
                  onComplete={(asset) => {
                    if (
                      current.current.photos.length < 6 &&
                      !current.current.photos.some(
                        (p) => p.assetId === asset.id,
                      )
                    )
                      set("photos", [
                        ...current.current.photos,
                        {
                          assetId: asset.id,
                          width: asset.width,
                          height: asset.height,
                          caption: "",
                          alt: "",
                          crop: { x: 50, y: 50, zoom: 1 },
                        },
                      ]);
                  }}
                />
              )}
            </section>
          )}
          {(step === 2 || step === 3) && (
            <section>
              <h2
                id={fieldId(step === 2 ? "ingredients" : "instructions")}
                tabIndex={-1}
              >
                {step === 2
                  ? t("Ingredients", "Ingredientes")
                  : t("Instructions", "Instrucciones")}
              </h2>
              <p>
                {t(
                  "Drag rows or use Move up / Move down. Sections move with the same controls.",
                  "Arrastra las filas o usa Subir / Bajar. Las secciones usan los mismos controles.",
                )}
              </p>
              {step === 2
                ? input.ingredients.map((r, i) => (
                    <fieldset key={i} {...draggable("ingredients", i)}>
                      <legend>
                        {r.kind === "section"
                          ? t("Section", "Sección")
                          : `${t("Ingredient", "Ingrediente")} ${i + 1}`}
                      </legend>
                      <div className="editor-grid">
                        {(r.kind === "section"
                          ? (["name"] as const)
                          : (["quantity", "unit", "name", "notes"] as const)
                        ).map((k) => (
                          <div className="editor-field" key={k}>
                            {label(
                              `ingredients.${i}.${k}`,
                              `${{ quantity: "Quantity", unit: "Unit", name: "Ingredient name", notes: "Ingredient notes" }[k]} ${i + 1}`,
                              `${{ quantity: "Cantidad", unit: "Unidad", name: "Ingrediente", notes: "Notas del ingrediente" }[k]} ${i + 1}`,
                            )}
                            <Input
                              id={fieldId(`ingredients.${i}.${k}`)}
                              value={r[k]}
                              onChange={(e) =>
                                set(
                                  "ingredients",
                                  input.ingredients.map((row, j) =>
                                    j === i
                                      ? { ...row, [k]: e.target.value }
                                      : row,
                                  ),
                                )
                              }
                            />
                          </div>
                        ))}
                      </div>
                      {controls("ingredients", i)}
                    </fieldset>
                  ))
                : input.instructions.map((r, i) => (
                    <fieldset key={i} {...draggable("instructions", i)}>
                      <legend>
                        {r.kind === "section"
                          ? t("Section", "Sección")
                          : `${t("Step", "Paso")} ${i + 1}`}
                      </legend>
                      <div className="editor-field">
                        {label(
                          `instructions.${i}.text`,
                          `Instruction ${i + 1}`,
                          `Instrucción ${i + 1}`,
                        )}
                        <Textarea
                          id={fieldId(`instructions.${i}.text`)}
                          rows={4}
                          value={r.text}
                          onChange={(e) =>
                            set(
                              "instructions",
                              input.instructions.map((row, j) =>
                                j === i
                                  ? { ...row, text: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </div>
                      {controls("instructions", i)}
                    </fieldset>
                  ))}
              <div className="editor-actions">
                {[false, true].map((section) => (
                  <Button
                    type="button"
                    key={String(section)}
                    disabled={
                      step === 2
                        ? input.ingredients.length >= 100
                        : input.instructions.length >= 50
                    }
                    onClick={() =>
                      step === 2
                        ? set("ingredients", [
                            ...input.ingredients,
                            {
                              kind: section ? "section" : "ingredient",
                              quantity: "",
                              unit: "",
                              name: "",
                              notes: "",
                            },
                          ])
                        : set("instructions", [
                            ...input.instructions,
                            { kind: section ? "section" : "step", text: "" },
                          ])
                    }
                  >
                    {section
                      ? t("Add section", "Añadir sección")
                      : step === 2
                        ? t("Add ingredient", "Añadir ingrediente")
                        : t("Add instruction", "Añadir instrucción")}
                  </Button>
                ))}
              </div>
              <div className="editor-field">
                <Label htmlFor="paste-lines">
                  {step === 2
                    ? t(
                        "Paste ingredient lines",
                        "Pegar líneas de ingredientes",
                      )
                    : t(
                        "Paste instruction lines",
                        "Pegar líneas de instrucciones",
                      )}
                </Label>
                <Textarea
                  id="paste-lines"
                  value={paste}
                  onChange={(e) => {
                    setPaste(e.target.value);
                    setPasteLines(null);
                  }}
                />
                <Button
                  type="button"
                  disabled={!paste.trim()}
                  onClick={() =>
                    setPasteLines(
                      paste.split(/\r?\n/).filter((line) => line.trim()),
                    )
                  }
                >
                  {t("Review pasted lines", "Revisar líneas pegadas")}
                </Button>
              </div>
              {pasteLines && (
                <section>
                  <h3>
                    {t("Confirm ambiguous text", "Confirmar el texto ambiguo")}
                  </h3>
                  <p>
                    {t(
                      "Nothing has been added. Lines stay as written; review quantities and sections yourself.",
                      "No se ha añadido nada. Las líneas se conservan: revisa cantidades y secciones.",
                    )}
                  </p>
                  <ul>
                    {pasteLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    onClick={() => {
                      if (
                        step === 2 &&
                        input.ingredients.length + pasteLines.length <= 100
                      ) {
                        set("ingredients", [
                          ...input.ingredients,
                          ...pasteLines.map(
                            (name) =>
                              ({
                                kind: "ingredient",
                                quantity: "",
                                unit: "",
                                name,
                                notes: "",
                              }) as Ingredient,
                          ),
                        ]);
                        setPasteLines(null);
                        setPaste("");
                      } else if (
                        step === 3 &&
                        input.instructions.length + pasteLines.length <= 50
                      ) {
                        set("instructions", [
                          ...input.instructions,
                          ...pasteLines.map(
                            (text) => ({ kind: "step", text }) as Instruction,
                          ),
                        ]);
                        setPasteLines(null);
                        setPaste("");
                      } else
                        setFailure({
                          status: 422,
                          message: "Too many rows. Shorten the pasted list.",
                        });
                    }}
                  >
                    {t(
                      "Confirm lines as written",
                      "Confirmar líneas sin cambios",
                    )}
                  </Button>
                  <Button type="button" onClick={() => setPasteLines(null)}>
                    {t("Cancel", "Cancelar")}
                  </Button>
                </section>
              )}
            </section>
          )}
          {step === 4 && draft && (
            <>
              <RecipePreview
                input={input}
                id={draft.id}
                origins={origins}
                spanish={lang === "es"}
              />
              <Button
                type="button"
                disabled={conflict || busy.current}
                onClick={publish}
              >
                {t("Publish Recipe", "Publicar receta")}
              </Button>
            </>
          )}
        </fieldset>
      </form>
      <div className="editor-actions">
        {step > 0 && (
          <Button
            variant="outline"
            type="button"
            onClick={() => setStep(step - 1)}
          >
            {t("Back", "Atrás")}
          </Button>
        )}
        {step < 4 && (
          <Button type="button" onClick={() => setStep(step + 1)}>
            {t("Continue", "Continuar")}
          </Button>
        )}
      </div>
    </div>
  );
}
