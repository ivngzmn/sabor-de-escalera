import RecipePlaceholder from "@/components/RecipePlaceholder";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldLabel as Label,
  FieldDescription,
  FieldError as FieldErrorMessage,
} from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import DeleteDraftDialog from "./DeleteDraftDialog";
import LeaveDraftDialog from "./LeaveDraftDialog";
import { hasContent, hasUnsavedWork } from "./draft-intent";
import { useLeaveGuard } from "./useLeaveGuard";
import {
  BEFORE_LOGOUT,
  LOGOUT,
  performSignOut,
} from "@/features/accounts/sign-out";
import "./editor.css";

/** Where a held-back exit goes once the member saves or discards. */
type LeaveTarget = { kind: "href"; href: string } | { kind: "signout" };
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
const NONE_VALUE = "__none__";
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
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [status, setStatus] = useState(initial ? "saved" : "new"),
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
    [confirmDelete, setConfirmDelete] = useState(false),
    [leaving, setLeaving] = useState<LeaveTarget | null>(null);
  const current = useRef(input),
    saved = useRef(initial?.input ?? null),
    record = useRef(initial),
    busy = useRef(false),
    creating = useRef<Promise<Draft | null> | null>(null),
    saving = useRef<Promise<Draft | null> | null>(null),
    retryAfter = useRef<number | null>(null),
    createdHere = useRef<boolean>(false),
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
    // Without a draft nothing is pending on the server yet: keep "new" until the
    // member continues, or "creating" while that first request is in flight.
    setStatus(
      record.current ? "unsaved" : creating.current ? "creating" : "new",
    );
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
  function ensureDraft(): Promise<Draft | null> {
    if (record.current) return Promise.resolve(record.current);
    if (creating.current) return creating.current;
    if (busy.current || stopped.current || !hasContent(current.current))
      return Promise.resolve(null);
    busy.current = true;
    const snapshot = current.current;
    setStatus("creating");
    setFailure(null);
    const pending = (async () => {
      try {
        const next = await request<Draft>("/api/drafts", { input: snapshot });
        createdHere.current = true;
        remember(next);
        // Stopped meanwhile (logout, discard): don't rewrite a recovery copy.
        if (stopped.current) return next;
        if (sameRecipe(current.current, snapshot)) {
          current.current = next.input;
          setInput(next.input);
          setStatus("saved");
        } else update(current.current);
        return next;
      } catch (e) {
        stop(
          e instanceof RequestError
            ? e.details
            : {
                status: 503,
                message: t(
                  "Could not save the draft. Your work is preserved. Retry.",
                  "No se pudo guardar el borrador. Tu trabajo se conserva. Reintenta.",
                ),
              },
        );
        return null;
      } finally {
        busy.current = false;
        creating.current = null;
      }
    })();
    creating.current = pending;
    return pending;
  }
  function goToStep(index: number) {
    setStep(index);
    setPasteLines(null);
    setPaste("");
    if (!record.current && hasContent(current.current)) void ensureDraft();
  }
  /** `force` skips the client-side five-second wait (leaving the editor). */
  function save({ force = false } = {}): Promise<Draft | null> {
    if (!record.current || busy.current || stopped.current || conflict)
      return Promise.resolve(null);
    const draft = record.current;
    const snapshot = current.current;
    retryAfter.current = null;
    if (sameRecipe(snapshot, saved.current)) {
      setStatus("saved");
      return Promise.resolve(draft);
    }
    const wait = 5000 - (Date.now() - lastWrite.current);
    if (wait > 0 && !force) {
      setStatus("waiting");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void saveAction.current();
      }, wait);
      return Promise.resolve(null);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    busy.current = true;
    setStatus("saving");
    setFailure(null);
    const pending = (async () => {
      try {
        const next = await request<Draft>(`/api/drafts/${draft.id}`, {
          action: "save",
          version: draft.version,
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
          retryAfter.current = error.retryAfter ?? 5;
          lastWrite.current = Date.now() - 5000 + retryAfter.current * 1000;
          setStatus("waiting");
        }
        return null;
      } finally {
        busy.current = false;
        saving.current = null;
      }
    })();
    saving.current = pending;
    return pending;
  }
  /** Resolves once no save, create or copy request is in flight. */
  async function idle() {
    while (busy.current)
      await (saving.current ??
        creating.current ??
        new Promise((resolve) => setTimeout(resolve, 50)));
  }
  /** Saves without the five-second wait; a 429 is waited out and retried once. */
  async function saveNow(): Promise<Draft | null> {
    await idle();
    const next = await save({ force: true });
    if (next || retryAfter.current === null) return next;
    await new Promise((resolve) =>
      setTimeout(resolve, (retryAfter.current ?? 5) * 1000),
    );
    await idle();
    return save({ force: true });
  }
  // Autosave holds while the leave dialog is open, so Discard can't race it.
  saveAction.current = () =>
    publicationPending.current || leaving !== null
      ? Promise.resolve(null)
      : save();
  useEffect(() => {
    if (!initial) return;
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
  }, [input, status, leaving]);
  // Reads refs only, so listeners registered once can call it.
  const unsavedWork = () =>
    hasUnsavedWork({
      stopped: stopped.current,
      hasDraft: !!record.current,
      current: current.current,
      saved: saved.current,
    });
  const guard = useLeaveGuard({
    shouldGuard: unsavedWork,
    onIntercept: (href) => setLeaving({ kind: "href", href }),
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
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
    window.addEventListener(LOGOUT, logout);
    // Sign out from the account menu: hold it and ask, like a link would.
    const beforeLogout = (event: Event) => {
      if (!unsavedWork()) return;
      event.preventDefault();
      setLeaving({ kind: "signout" });
    };
    window.addEventListener(BEFORE_LOGOUT, beforeLogout);
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
      window.removeEventListener(LOGOUT, logout);
      window.removeEventListener(BEFORE_LOGOUT, beforeLogout);
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
    if (
      !new URL(location.href).searchParams.has("lang") &&
      readConsent().preferences
    ) {
      try {
        const preferred = localStorage.getItem("escalera:preferences:language");
        if (preferred === "en" || preferred === "es") applyLanguage(preferred);
      } catch {
        /* Optional storage may be unavailable. */
      }
    }
    const switchLanguage = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        "a[hreflang]",
      );
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
  function controlProps(field: string) {
    const invalid = errors.some((error) => error.field === field);
    return {
      id: fieldId(field),
      "aria-invalid": invalid,
      "aria-describedby": invalid ? `${fieldId(field)}-error` : undefined,
    };
  }
  function label(field: string, en: string, es: string) {
    const error = errors.find((e) => e.field === field);
    return (
      <>
        <Label htmlFor={fieldId(field)}>{t(en, es)}</Label>
        {error && (
          <FieldErrorMessage id={`${fieldId(field)}-error`}>
            {lang === "es" ? "Revisa este campo." : error.message}
          </FieldErrorMessage>
        )}
      </>
    );
  }
  function selectField(
    field: string,
    value: string | undefined,
    onChange: (value: string) => void,
    options: { value: string; label: string }[],
    placeholder?: string,
  ) {
    const known = options.some((option) => option.value === value);
    return (
      <Select
        value={known ? (value ?? "") : ""}
        onValueChange={(next) => onChange(next === NONE_VALUE ? "" : next)}
      >
        <SelectTrigger className="w-full" {...controlProps(field)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper">
          {placeholder && (
            <SelectItem value={NONE_VALUE}>{placeholder}</SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
      <Field data-invalid={props["aria-invalid"]}>
        {label(field, en, es)}
        {multiline ? <Textarea {...props} rows={4} /> : <Input {...props} />}
      </Field>
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
      failOperation(
        e,
        "Could not load the latest draft. Your work is preserved. Use Load latest to retry.",
      );
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
      failOperation(
        e,
        "Could not create a separate draft. Your work is preserved. Use Save as separate draft to retry.",
      );
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
      if (!record.current) await ensureDraft();
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
      if (record.current && (await confirmPublished(record.current.id))) return;
      failOperation(
        e,
        "Could not confirm publication. Your work is preserved. Use Publish Recipe to retry.",
      );
      if (e instanceof RequestError) setErrors(e.details.fields ?? []);
    } finally {
      publicationPending.current = false;
      setPublishing(false);
    }
  }
  /**
   * Deletes the current draft. `deleted` is true when it is gone (including an
   * earlier deletion, 410); `message` is set when the member should retry.
   */
  async function deleteDraft(): Promise<{
    deleted: boolean;
    message: string | null;
    status?: number;
  }> {
    const draft = record.current;
    if (!draft) return { deleted: false, message: null };
    try {
      await request(`/api/drafts/${draft.id}`, {
        action: "delete",
        version: draft.version,
      });
    } catch (e) {
      if (e instanceof RequestError) {
        const { status } = e.details;
        if (status === 401 || status === 409 || status === 410) {
          stop(e.details);
          setConfirmDelete(false);
          return { deleted: status === 410, message: null, status };
        }
        return { deleted: false, message: e.details.message, status };
      }
      return {
        deleted: false,
        message: t(
          "Could not confirm deletion. Your work is preserved. Try again.",
          "No se pudo confirmar la eliminación. Tu trabajo se conserva. Inténtalo de nuevo.",
        ),
      };
    }
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
    return { deleted: true, message: null };
  }
  async function remove(): Promise<string | null> {
    return (await deleteDraft()).message;
  }
  function leave(target: LeaveTarget) {
    guard.release();
    if (target.kind === "href") location.assign(target.href);
    else void performSignOut(accountId, lang === "es" ? "/?lang=es" : "/");
  }
  async function saveAndLeave(): Promise<boolean> {
    const target = leaving;
    if (!target) return false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await idle();
    if (conflict) await copy();
    else {
      if (!record.current) await ensureDraft();
      if (record.current) await saveNow();
    }
    if (record.current && sameRecipe(current.current, saved.current)) {
      leave(target);
      return true;
    }
    setLeaving(null);
    return false;
  }
  async function discardAndLeave() {
    const target = leaving;
    if (!target) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stopped.current = true;
    // A create or save may still land; wait so the right draft is removed.
    await idle();
    const draft = record.current;
    if (draft && createdHere.current) {
      const { deleted, message, status } = await deleteDraft();
      if (!deleted) {
        // A sign-out (401) keeps the editor stopped; anything else resumes.
        if (status !== 401) stopped.current = false;
        if (message) {
          setFailure({ status: 503, message });
          setStatus("error");
          setOperationError(true);
        }
        setLeaving(null);
        return;
      }
    } else if (draft) forget(draft.id);
    leave(target);
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
      <header className="editor-header">
        <div className="flex flex-col gap-1">
          <Badge variant="eyebrow">{t("From your kitchen", "Desde tu cocina")}</Badge>
          <h1>{t("Share your recipe", "Comparte tu receta")}</h1>
          <p className="intro">
            {draft?.label ?? t("New recipe", "Receta nueva")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(
              "A title is required before publication. Saved drafts stay until you delete them.",
              "Se necesita un título para publicar. Los borradores se conservan hasta que los elimines.",
            )}
          </p>
        </div>
        <div className="editor-actions">
          <Button
            type="button"
            variant="outline"
            disabled={
              !ready ||
              busy.current ||
              blocked ||
              conflict ||
              publishing ||
              (!draft && !hasContent(input))
            }
            onClick={() => (draft ? void save() : void ensureDraft())}
          >
            {t("Save Draft", "Guardar borrador")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-destructive border-destructive/40"
            disabled={!ready || !draft || blocked || publishing}
            onClick={() => setConfirmDelete(true)}
          >
            {t("Delete draft", "Eliminar borrador")}
          </Button>
        </div>
      </header>
      <p role="status" aria-live="polite" className="editor-status">
        {
          {
            saved: t("Saved", "Guardado"),
            saving: t("Saving…", "Guardando…"),
            unsaved: t("Unsaved changes", "Cambios sin guardar"),
            waiting: t(
              "Saving shortly — at most once every five seconds.",
              "Se guardará pronto: como máximo una vez cada cinco segundos.",
            ),
            creating: t("Saving…", "Guardando…"),
            new: t(
              "Not saved yet — your draft is saved when you continue.",
              "Aún no guardado: el borrador se guarda al continuar.",
            ),
            error: t("Not saved", "No guardado"),
          }[status]
        }
      </p>
      {failure && (
        <Alert variant="destructive">
          <AlertTitle>
            {t("Your draft needs attention", "Revisa tu borrador")}
          </AlertTitle>
          <AlertDescription>
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
                onClick={() => (draft ? void save() : void ensureDraft())}
              >
                {t("Retry save", "Reintentar guardado")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
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
      {draft && (
        <DeleteDraftDialog
          open={confirmDelete && !blocked}
          onOpenChange={setConfirmDelete}
          title={input.title}
          photoCount={input.photos.length}
          ingredientCount={input.ingredients.length}
          updatedAt={draft.updatedAt}
          lang={lang}
          onConfirm={async () => {
            const message = await remove();
            if (message === null) setConfirmDelete(false);
            return message;
          }}
        />
      )}
      <LeaveDraftDialog
        open={leaving !== null}
        title={input.title}
        lang={lang}
        conflict={conflict}
        discardDeletes={createdHere.current && !!record.current}
        onKeepEditing={() => setLeaving(null)}
        onDiscard={discardAndLeave}
        onSave={saveAndLeave}
      />
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
            disabled={!ready}
            variant="ghost"
            aria-current={step === index ? "step" : undefined}
            onClick={() => goToStep(index)}
          >
            <span aria-hidden="true" className="editor-step-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            {name}
          </Button>
        ))}
        <div aria-hidden="true" className="editor-progress">
          <span style={{ width: `${((step + 1) / 5) * 100}%` }} />
        </div>
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
      {!draft && !ready && (
        <RecipePlaceholder variant="editor" state="loading" language={lang} />
      )}
      <Card className={cn(!draft && !ready && "hidden")}>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {t("Recipe workspace", "Tu receta")}
          </CardTitle>
          <CardDescription>
            {t(
              "Build your recipe one step at a time.",
              "Prepara tu receta paso a paso.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => e.preventDefault()} onPaste={plainPaste}>
            <FieldSet
              disabled={!ready || blocked || !!published || publishing}
              className="editor-fields"
            >
              <FieldLegend className="sr-only">
                {t("Recipe fields", "Campos de la receta")}
              </FieldLegend>
              <FieldGroup>
                {step === 0 && (
                  <section>
                    <FieldGroup>
                      <h2 className="m-0 type-headline-md">{t("Details", "Detalles")}</h2>
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
                        <Field
                          data-invalid={errors.some(
                            (error) => error.field === "category",
                          )}
                        >
                          {label(
                            "category",
                            "Primary category",
                            "Categoría principal",
                          )}
                          {selectField(
                            "category",
                            input.category,
                            (value) => set("category", value),
                            categories.map((c) => ({
                              value: c.id,
                              label: c[lang],
                            })),
                            t("Choose…", "Elegir…"),
                          )}
                        </Field>
                        <Field
                          data-invalid={errors.some(
                            (error) => error.field === "origin",
                          )}
                        >
                          {label("origin", "Origin", "Origen")}
                          {selectField(
                            "origin",
                            input.origin,
                            (value) => set("origin", value),
                            origins.map((o) => ({
                              value: o.id,
                              label: o[lang === "es" ? "label_es" : "label_en"],
                            })),
                            t("Choose…", "Elegir…"),
                          )}
                        </Field>
                      </div>
                      {textField(
                        "yieldText",
                        "Servings / yield",
                        "Porciones / rendimiento",
                      )}
                      <Field
                        data-invalid={errors.some(
                          (error) => error.field === "baseline",
                        )}
                      >
                        {label(
                          "baseline",
                          "Scaling baseline",
                          "Base numérica para ajustar porciones",
                        )}
                        <Input
                          {...controlProps("baseline")}
                          type="number"
                          min="0.01"
                          step="any"
                          value={input.baseline ?? ""}
                          onChange={(e) =>
                            update({
                              ...input,
                              baseline:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              baselineConfirmed: false,
                            })
                          }
                        />
                        <Label htmlFor="baseline-confirmed">
                          <Checkbox
                            id="baseline-confirmed"
                            checked={input.baselineConfirmed}
                            onCheckedChange={(checked) =>
                              set("baselineConfirmed", checked === true)
                            }
                          />
                          {t(
                            "I confirm this numeric baseline",
                            "Confirmo esta base numérica",
                          )}
                        </Label>
                        <FieldDescription>
                          {t(
                            "Keep your yield range above; choose the number the written quantities serve. Quantities such as ½, 2–3 and “to taste” remain as written.",
                            "Conserva arriba el rango; elige cuántas porciones representan las cantidades. Se conservan ½, 2–3 y «al gusto».",
                          )}
                        </FieldDescription>
                      </Field>
                      <Field
                        data-invalid={errors.some(
                          (error) => error.field === "timing",
                        )}
                      >
                        {label(
                          "timing",
                          "Timing method",
                          "Cómo indicar el tiempo",
                        )}
                        {selectField(
                          "timing",
                          input.timing.mode,
                          (value) =>
                            set("timing", {
                              ...input.timing,
                              mode: value as "total" | "parts",
                            }),
                          [
                            {
                              value: "total",
                              label: t("Total time", "Tiempo total"),
                            },
                            {
                              value: "parts",
                              label: t(
                                "Prep + cook + rest",
                                "Preparación + cocción + reposo",
                              ),
                            },
                          ],
                        )}
                      </Field>
                      <div className="editor-grid">
                        {(input.timing.mode === "total"
                          ? (["total"] as const)
                          : (["prep", "cook", "rest"] as const)
                        ).map((k) => (
                          <Field
                            key={k}
                            data-invalid={errors.some(
                              (error) => error.field === `timing.${k}`,
                            )}
                          >
                            {label(
                              `timing.${k}`,
                              `${{ total: "Total", prep: "Prep", cook: "Cook", rest: "Rest / chill (optional)" }[k]} minutes`,
                              `${{ total: "Total", prep: "Preparación", cook: "Cocción", rest: "Reposo / frío (opcional)" }[k]} en minutos`,
                            )}
                            <Input
                              {...controlProps(`timing.${k}`)}
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
                          </Field>
                        ))}
                      </div>
                      <FieldDescription>
                        {t(
                          "Total includes all preparation, cooking and rest/chill time.",
                          "El total incluye preparación, cocción y reposo/frío.",
                        )}{" "}
                        {totalMinutes(input) ?? "—"} {t("minutes", "minutos")}
                      </FieldDescription>
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
                      <Field
                        data-invalid={errors.some(
                          (error) => error.field === "language",
                        )}
                      >
                        {label(
                          "language",
                          "Original recipe language",
                          "Idioma original de la receta",
                        )}
                        {selectField(
                          "language",
                          input.language,
                          (value) => set("language", value as "en" | "es"),
                          [
                            { value: "en", label: "English" },
                            { value: "es", label: "Español" },
                          ],
                        )}
                      </Field>
                      <FieldDescription>
                        {t(
                          "Optional dietary tags are author provided.",
                          "Las etiquetas opcionales las indica el autor.",
                        )}
                      </FieldDescription>
                      {["vegan", "vegetarian"].map((tag) => (
                        <Label key={tag} htmlFor={`dietary-${tag}`}>
                          <Checkbox
                            id={`dietary-${tag}`}
                            checked={input.dietary.includes(tag)}
                            onCheckedChange={(checked) =>
                              set(
                                "dietary",
                                checked === true
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
                    </FieldGroup>
                  </section>
                )}
                {step === 1 && (
                  <section>
                    <h2
                      id={fieldId("photos")}
                      tabIndex={-1}
                      className="m-0 type-headline-md"
                    >
                      {t("Photos", "Fotos")}
                    </h2>
                    <p>
                      {t(
                        "Add 1–6 captioned photos. The first photo is the cover; the full image stays available in the gallery.",
                        "Añade de 1 a 6 fotos con descripción. La primera es la portada; se conserva la imagen completa en la galería.",
                      )}
                    </p>
                    {input.photos.map((p, i) => (
                      <FieldSet key={p.assetId} {...draggable("photos", i)}>
                        <FieldLegend>
                          {i === 0
                            ? t("Cover photo", "Foto de portada")
                            : `${t("Photo", "Foto")} ${i + 1}`}
                        </FieldLegend>
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
                        <Field
                          data-invalid={errors.some(
                            (error) => error.field === `photos.${i}.caption`,
                          )}
                        >
                          {label(
                            `photos.${i}.caption`,
                            `Caption ${i + 1}`,
                            `Descripción ${i + 1}`,
                          )}
                          <Textarea
                            {...controlProps(`photos.${i}.caption`)}
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
                          <FieldDescription>
                            {Array.from(p.caption).length}/400
                          </FieldDescription>
                        </Field>
                        <Field
                          data-invalid={errors.some(
                            (error) => error.field === `photos.${i}.alt`,
                          )}
                        >
                          {label(
                            `photos.${i}.alt`,
                            `Alt text ${i + 1} (optional)`,
                            `Texto alternativo ${i + 1} (opcional)`,
                          )}
                          <Input
                            {...controlProps(`photos.${i}.alt`)}
                            maxLength={400}
                            value={p.alt}
                            onChange={(e) =>
                              set(
                                "photos",
                                input.photos.map((photo, j) =>
                                  j === i
                                    ? { ...photo, alt: e.target.value }
                                    : photo,
                                ),
                              )
                            }
                          />
                          <FieldDescription>
                            {t(
                              "The caption is the default alt text.",
                              "La descripción se usa como texto alternativo por defecto.",
                            )}
                          </FieldDescription>
                        </Field>
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
                          <Button
                            type="button"
                            onClick={() => move("photos", i, 0)}
                          >
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
                      </FieldSet>
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
                      className="m-0 type-headline-md"
                      {...controlProps(
                        step === 2 ? "ingredients" : "instructions",
                      )}
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
                          <FieldSet key={i} {...draggable("ingredients", i)}>
                            <FieldLegend>
                              {r.kind === "section"
                                ? t("Section", "Sección")
                                : `${t("Ingredient", "Ingrediente")} ${i + 1}`}
                            </FieldLegend>
                            <div className="editor-grid">
                              {(r.kind === "section"
                                ? (["name"] as const)
                                : ([
                                    "quantity",
                                    "unit",
                                    "name",
                                    "notes",
                                  ] as const)
                              ).map((k) => (
                                <Field
                                  key={k}
                                  data-invalid={errors.some(
                                    (error) =>
                                      error.field === `ingredients.${i}.${k}`,
                                  )}
                                >
                                  {label(
                                    `ingredients.${i}.${k}`,
                                    `${{ quantity: "Quantity", unit: "Unit", name: "Ingredient name", notes: "Ingredient notes" }[k]} ${i + 1}`,
                                    `${{ quantity: "Cantidad", unit: "Unidad", name: "Ingrediente", notes: "Notas del ingrediente" }[k]} ${i + 1}`,
                                  )}
                                  <Input
                                    {...controlProps(`ingredients.${i}.${k}`)}
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
                                </Field>
                              ))}
                            </div>
                            {controls("ingredients", i)}
                          </FieldSet>
                        ))
                      : input.instructions.map((r, i) => (
                          <FieldSet key={i} {...draggable("instructions", i)}>
                            <FieldLegend>
                              {r.kind === "section"
                                ? t("Section", "Sección")
                                : `${t("Step", "Paso")} ${i + 1}`}
                            </FieldLegend>
                            <Field
                              data-invalid={errors.some(
                                (error) =>
                                  error.field === `instructions.${i}.text`,
                              )}
                            >
                              {label(
                                `instructions.${i}.text`,
                                `Instruction ${i + 1}`,
                                `Instrucción ${i + 1}`,
                              )}
                              <Textarea
                                {...controlProps(`instructions.${i}.text`)}
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
                            </Field>
                            {controls("instructions", i)}
                          </FieldSet>
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
                                  {
                                    kind: section ? "section" : "step",
                                    text: "",
                                  },
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
                    <Field>
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
                    </Field>
                    {pasteLines && (
                      <section>
                        <h3>
                          {t(
                            "Confirm ambiguous text",
                            "Confirmar el texto ambiguo",
                          )}
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
                              input.ingredients.length + pasteLines.length <=
                                100
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
                              input.instructions.length + pasteLines.length <=
                                50
                            ) {
                              set("instructions", [
                                ...input.instructions,
                                ...pasteLines.map(
                                  (text) =>
                                    ({ kind: "step", text }) as Instruction,
                                ),
                              ]);
                              setPasteLines(null);
                              setPaste("");
                            } else
                              setFailure({
                                status: 422,
                                message:
                                  "Too many rows. Shorten the pasted list.",
                              });
                          }}
                        >
                          {t(
                            "Confirm lines as written",
                            "Confirmar líneas sin cambios",
                          )}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setPasteLines(null)}
                        >
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
              </FieldGroup>
            </FieldSet>
          </form>
        </CardContent>
      </Card>
      <div className="editor-actions">
        {step > 0 && (
          <Button
            variant="outline"
            type="button"
            disabled={!ready}
            onClick={() => goToStep(step - 1)}
          >
            {t("Back", "Atrás")}
          </Button>
        )}
        {step < 4 && (
          <Button
            type="button"
            disabled={!ready}
            onClick={() => goToStep(step + 1)}
          >
            {t("Continue", "Continuar")}
          </Button>
        )}
      </div>
    </div>
  );
}
