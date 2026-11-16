import { ChevronLeftIcon, ChevronRightIcon, Cross2Icon } from "@radix-ui/react-icons";
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
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Photo } from "./validation";

const copy = {
  en: { previous: "Previous photo", next: "Next photo", close: "Close", photos: "Recipe photos", of: (i: number, n: number) => `Photo ${i} of ${n}` },
  es: { previous: "Foto anterior", next: "Foto siguiente", close: "Cerrar", photos: "Fotos de la receta", of: (i: number, n: number) => `Foto ${i} de ${n}` },
};

const glass =
  "flex size-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors outline-none hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white [&_svg]:size-5";

/** Full-bleed photo viewer. Swipe, arrow keys, the side buttons and the dots all move between photos; closing returns focus to the control that opened it. */
export default function GalleryDialog({
  photos,
  index,
  onIndexChange,
  onClose,
  src,
  credit,
  language,
  returnFocus,
}: {
  /** The thumbnail control that opened the viewer. */
  returnFocus: () => HTMLElement | null;
  photos: Photo[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  src: (photo: Photo) => string;
  /** Credit line for the photo, if one is recorded. */
  credit?: (photo: Photo) => string;
  language: "en" | "es";
}) {
  const t = copy[language];
  const photo = index === null ? null : photos[index];
  const many = photos.length > 1;
  const step = (delta: number) => index !== null && onIndexChange((index + delta + photos.length) % photos.length);
  return (
    <Dialog open={photo !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="h-[min(90dvh,860px)] w-[min(96vw,1280px)] max-w-none grid-rows-1 gap-0 overflow-hidden border-0 bg-neutral-950 p-0 text-white sm:max-w-none"
        initialFocus="[data-slot=carousel-viewport]"
        finalFocus={() => returnFocus()}
        onKeyDown={(e) => {
          // The viewport and the dots page with arrow keys themselves.
          if ((e.target as HTMLElement).closest("[data-slot=carousel-viewport],[role=tablist]")) return;
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        {photo && index !== null && (
          <>
            <DialogTitle className="sr-only">{t.of(index + 1, photos.length)}</DialogTitle>
            <Carousel
              aria-label={t.photos}
              loop
              page={index + 1}
              onPageChange={(page) => onIndexChange(page - 1)}
              className="relative size-full"
            >
              <CarouselViewport className="size-full outline-none [scrollbar-width:none]">
                <CarouselContent className="size-full">
                  {photos.map((item, i) => (
                    <CarouselItem key={item.assetId} className="relative size-full basis-full overflow-hidden">
                      {/* A blurred copy fills the stage so the photo never sits in empty bars. */}
                      <img src={src(item)} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" />
                      <img
                        src={src(item)}
                        alt={item.alt || item.caption}
                        width={item.width}
                        height={item.height}
                        loading={i === index ? "eager" : "lazy"}
                        draggable={false}
                        className="relative size-full object-contain"
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </CarouselViewport>

              <DialogClose aria-label={t.close} className={`${glass} absolute top-4 right-4`}>
                <Cross2Icon aria-hidden="true" />
              </DialogClose>
              {many && (
                <span className="absolute top-4 left-4 flex h-11 items-center rounded-full bg-black/40 px-4 text-sm font-medium tabular-nums backdrop-blur-md" aria-hidden="true">
                  {index + 1} / {photos.length}
                </span>
              )}
              {many && (
                <>
                  <CarouselPrevious aria-label={t.previous} className={`${glass} absolute top-1/2 left-4 -translate-y-1/2`}>
                    <ChevronLeftIcon aria-hidden="true" />
                  </CarouselPrevious>
                  <CarouselNext aria-label={t.next} className={`${glass} absolute top-1/2 right-4 -translate-y-1/2`}>
                    <ChevronRightIcon aria-hidden="true" />
                  </CarouselNext>
                </>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 pt-16 pb-5 text-center">
                <DialogDescription className="author-text max-w-3xl text-white">{photo.caption}</DialogDescription>
                {credit?.(photo) && <p className="m-0 -mt-2 text-sm text-white/70">{credit(photo)}</p>}
                {many && (
                  <CarouselIndicatorGroup aria-label={t.photos} className="pointer-events-auto flex items-center gap-2">
                    {photos.map((item, i) => (
                      <CarouselIndicator
                        key={item.assetId}
                        page={i + 1}
                        aria-label={t.of(i + 1, photos.length)}
                        className="relative h-2 w-2 cursor-pointer rounded-full bg-white/40 transition-all outline-none before:absolute before:-inset-2 before:content-[''] hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-white data-selected:w-6 data-selected:bg-white"
                      />
                    ))}
                  </CarouselIndicatorGroup>
                )}
              </div>
            </Carousel>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
