import { useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, EnterFullScreenIcon } from "@radix-ui/react-icons";
import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  CarouselViewport,
} from "@ui-sdk/react/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import type { Photo } from "./validation";

const glass =
  "flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors outline-none hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white [&_svg]:size-5";

function SlidePhoto({ photo, url, eager }: { photo: Photo; url: string; eager: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (image.current?.complete) setReady(true);
  }, []);

  return (
    <>
      {!ready && <Skeleton aria-hidden="true" className="absolute inset-0 rounded-none" />}
      <img
        ref={image}
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
        src={url}
        width={photo.width ?? 1200}
        height={photo.height ?? 900}
        alt={photo.alt || photo.caption}
        loading={eager ? "eager" : "lazy"}
        decoding="sync"
        referrerPolicy="no-referrer"
        draggable={false}
        className={`size-full object-cover ${!ready ? "[@media(scripting:enabled)]:opacity-0" : ""}`}
        style={{ objectPosition: `${photo.crop.x}% ${photo.crop.y}%`, scale: photo.crop.zoom }}
      />
    </>
  );
}

/** Large inline photo carousel for the recipe page. Pressing the photo opens the full-screen viewer when `onOpen` is given. */
export default function PhotoCarousel({
  photos,
  src,
  credit,
  onOpen,
  spanish,
}: {
  photos: Photo[];
  src: (photo: Photo) => string;
  credit?: (photo: Photo) => string;
  onOpen?: (index: number) => void;
  spanish: boolean;
}) {
  const t = (en: string, es: string) => (spanish ? es : en);
  const [page, setPage] = useState(1);
  const many = photos.length > 1;
  const current = photos[page - 1] ?? photos[0];
  return (
    <Carousel aria-label={t("Recipe photos", "Fotos de la receta")} page={page} onPageChange={setPage} loop className="photo-carousel relative self-start overflow-hidden rounded-xl bg-neutral-900 shadow-md">
      <CarouselViewport className="aspect-[4/3] w-full [scrollbar-width:none]">
        <CarouselContent className="h-full">
          {photos.map((photo, i) => {
            const url = src(photo);
            const image = <SlidePhoto key={url} photo={photo} url={url} eager={i === 0} />;
            return (
              <CarouselItem key={photo.assetId} className="relative size-full basis-full overflow-hidden">
                {onOpen ? (
                  <button
                    type="button"
                    data-slot="photo-open"
                    className="m-0 block size-full border-0 p-0 cursor-zoom-in outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white"
                    aria-label={`${t("View larger photo", "Ver foto más grande")}: ${photo.caption}`}
                    onClick={() => onOpen(i)}
                  >
                    {image}
                  </button>
                ) : (
                  <a href={url} target="_blank" rel="noopener" data-slot="photo-open" className="block size-full" aria-label={`${t("View full photo", "Ver foto completa")}: ${photo.caption}`}>
                    {image}
                  </a>
                )}
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </CarouselViewport>

      {many && (
        <span data-print-hide className="pointer-events-none absolute top-3 left-3 flex h-10 items-center rounded-full bg-black/40 px-3.5 text-sm font-medium text-white tabular-nums backdrop-blur-md" aria-hidden="true">
          {page} / {photos.length}
        </span>
      )}
      {onOpen && (
        <span data-print-hide className="pointer-events-none absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md" aria-hidden="true">
          <EnterFullScreenIcon />
        </span>
      )}
      {many && (
        <>
          <CarouselPrevious data-print-hide aria-label={t("Previous photo", "Foto anterior")} className={`${glass} absolute top-1/2 left-3 -translate-y-1/2`}>
            <ChevronLeftIcon aria-hidden="true" />
          </CarouselPrevious>
          <CarouselNext data-print-hide aria-label={t("Next photo", "Foto siguiente")} className={`${glass} absolute top-1/2 right-3 -translate-y-1/2`}>
            <ChevronRightIcon aria-hidden="true" />
          </CarouselNext>
        </>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pt-12 pb-3 text-center text-white">
        <p className="m-0 text-sm">{current.caption}</p>
        {credit?.(current) && <p className="m-0 -mt-1 text-xs text-white/70">{credit(current)}</p>}
        {many && (
          <CarouselIndicatorGroup data-print-hide aria-label={t("Choose a photo", "Elegir una foto")} className="pointer-events-auto flex items-center gap-2">
            {photos.map((photo, i) => (
              <CarouselIndicator
                key={photo.assetId}
                page={i + 1}
                aria-label={t(`Photo ${i + 1} of ${photos.length}`, `Foto ${i + 1} de ${photos.length}`)}
                className="relative h-2 w-2 cursor-pointer rounded-full bg-white/40 transition-all outline-none before:absolute before:-inset-2 before:content-[''] hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-white data-selected:w-6 data-selected:bg-white"
              />
            ))}
          </CarouselIndicatorGroup>
        )}
      </div>
    </Carousel>
  );
}
