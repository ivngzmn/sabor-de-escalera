import type { ReactNode } from "react";

export function PhotoCaption({ children }: { children: ReactNode }) {
  return (
    <figcaption className="absolute inset-x-0 bottom-0 isolate flex flex-col gap-0.5 p-5 text-white">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-2rem] bottom-0 -z-10 bg-linear-to-t from-black/95 via-black/80 to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-2rem] bottom-0 -z-10 mask-[linear-gradient(to_top,black,black_55%,transparent)] backdrop-blur-sm"
      />
      {children}
    </figcaption>
  );
}
