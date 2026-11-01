import { useEffect, useRef } from "react";
import { leaveTarget } from "./draft-intent";

interface Options {
  /** Reads refs, so the listeners below are registered once. */
  shouldGuard(): boolean;
  /** An in-site link click was held back; `href` is where it was going. */
  onIntercept(href: string): void;
}

/**
 * Guards in-site link clicks (capture phase, so it also sees links rendered in
 * portals by other islands) and browser-level exits (native beforeunload).
 * `release()` disables both so a deliberate `location.assign` doesn't prompt.
 */
export function useLeaveGuard(options: Options): { release(): void } {
  const latest = useRef(options);
  latest.current = options;
  const released = useRef(false);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (released.current || !(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      const href = leaveTarget(
        event,
        {
          href: link.href,
          target: link.target,
          download: link.hasAttribute("download"),
          hreflang: link.hreflang,
        },
        location.href,
      );
      if (!href || !latest.current.shouldGuard()) return;
      event.preventDefault();
      latest.current.onIntercept(href);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!released.current && latest.current.shouldGuard())
        event.preventDefault();
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  return {
    release() {
      released.current = true;
    },
  };
}
