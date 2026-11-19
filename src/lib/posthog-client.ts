type EventProperties = Record<string, boolean | number | string | undefined>;

type PostHogClient = {
  capture: (event: string, properties?: EventProperties) => void;
};

/** Captures from hydrated React islands through the browser client initialized by AppLayout. */
export function capturePostHog(event: string, properties?: EventProperties) {
  if (typeof window === "undefined") return;
  (window as Window & { posthog?: PostHogClient }).posthog?.capture(
    event,
    properties,
  );
}
