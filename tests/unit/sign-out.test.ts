import { afterEach, expect, test, vi } from "vitest";
import {
  BEFORE_LOGOUT,
  LOGOUT,
  performSignOut,
  requestSignOut,
} from "../../src/features/accounts/sign-out";

function memoryStorage(entries: Record<string, string>): Storage {
  const data = new Map(Object.entries(entries));
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

afterEach(() => vi.unstubAllGlobals());

test("requestSignOut proceeds when no listener holds it", () => {
  const target = new EventTarget();
  const seen: boolean[] = [];
  target.addEventListener(BEFORE_LOGOUT, (e) => seen.push(e.cancelable));
  expect(requestSignOut(target)).toBe(true);
  expect(seen).toEqual([true]);
});

test("requestSignOut is held when a listener prevents it", () => {
  const target = new EventTarget();
  target.addEventListener(BEFORE_LOGOUT, (e) => e.preventDefault());
  expect(requestSignOut(target)).toBe(false);
});

test("performSignOut clears this account's recovery, announces logout, then signs out", async () => {
  const order: string[] = [];
  const win = Object.assign(new EventTarget(), {
    Clerk: {
      signOut: vi.fn(async (options?: { redirectUrl?: string }) => {
        order.push(`clerk:${options?.redirectUrl}`);
      }),
    },
  });
  win.addEventListener(LOGOUT, () => order.push("logout"));
  const storage = memoryStorage({
    "escalera:recovery:member-1:a": "{}",
    "escalera:recovery:member-2:b": "{}",
    "unrelated:keep": "yes",
  });
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", storage);
  await performSignOut("member-1", "/?lang=es");
  expect(order).toEqual(["logout", "clerk:/?lang=es"]);
  expect(storage.getItem("escalera:recovery:member-1:a")).toBeNull();
  expect(storage.getItem("escalera:recovery:member-2:b")).toBe("{}");
  expect(storage.getItem("unrelated:keep")).toBe("yes");
});

test("performSignOut without Clerk or a member still announces logout", async () => {
  const win = new EventTarget();
  const logout = vi.fn();
  win.addEventListener(LOGOUT, logout);
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", undefined);
  await performSignOut(null, "/");
  expect(logout).toHaveBeenCalledOnce();
});
