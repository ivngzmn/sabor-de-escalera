import { clearAccountRecovery } from "../recipes/recovery";

/** Cancelable; a page with unsaved work prevents it and finishes sign-out itself. */
export const BEFORE_LOGOUT = "escalera:before-logout";
/** Fired once sign-out is under way; other listeners stop and clear their state. */
export const LOGOUT = "escalera:logout";

/** Asks the page whether sign-out may go ahead now. */
export function requestSignOut(target: EventTarget = window): boolean {
  return target.dispatchEvent(new Event(BEFORE_LOGOUT, { cancelable: true }));
}

/** Clears the account's device recovery copies, announces logout, and signs out of Clerk. */
export async function performSignOut(
  memberId: string | null,
  redirectUrl: string,
): Promise<void> {
  try {
    if (memberId) clearAccountRecovery(localStorage, memberId);
  } catch {
    /* Optional storage. */
  }
  window.dispatchEvent(new Event(LOGOUT));
  const clerk = (
    window as Window & {
      Clerk?: {
        signOut: (options?: { redirectUrl?: string }) => Promise<unknown>;
      };
    }
  ).Clerk;
  await clerk?.signOut({ redirectUrl });
}
