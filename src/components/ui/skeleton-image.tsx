import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SkeletonImageProps = Omit<React.ComponentProps<"img">, "onLoad" | "onError" | "ref"> & {
  /**
   * Keep the image hidden behind the skeleton until it has fully loaded, then fade it in.
   * Use only inside a hydrated island: static HTML never reveals a held image.
   */
  hold?: boolean;
};

/**
 * A photo with the app's loading skeleton behind it. Its parent must be positioned.
 * The image stays visible without JavaScript; ui-sdk's Avatar hides it in server markup, so it isn't used here.
 */
function SkeletonImage({ hold = false, src, className, decoding, ...props }: SkeletonImageProps) {
  const image = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState<string | undefined>();
  const ready = loaded !== undefined && loaded === src;

  useEffect(() => {
    if (image.current?.complete) setLoaded(src);
  }, [src]);

  return (
    <>
      {!ready && <Skeleton aria-hidden="true" className="absolute inset-0 rounded-none" />}
      <img
        ref={image}
        src={src}
        onLoad={() => setLoaded(src)}
        onError={() => setLoaded(src)}
        decoding={decoding ?? (hold ? "sync" : "async")}
        data-slot="skeleton-image"
        data-loaded={ready || undefined}
        className={cn(
          "transition-opacity duration-300 motion-reduce:transition-none",
          hold && !ready && "[@media(scripting:enabled)]:opacity-0",
          className,
        )}
        {...props}
      />
    </>
  );
}

export { SkeletonImage };
