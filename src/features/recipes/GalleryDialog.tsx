import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Photo } from "./validation";

const copy = {
  en: { previous: "Previous photo", next: "Next photo", of: (i: number, n: number) => `Photo ${i} of ${n}` },
  es: { previous: "Foto anterior", next: "Foto siguiente", of: (i: number, n: number) => `Foto ${i} de ${n}` },
};

/** Large gallery viewer. Arrow keys move between photos; closing returns focus to the control that opened it. */
export default function GalleryDialog({
  photos,
  index,
  onIndexChange,
  onClose,
  src,
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
  language: "en" | "es";
}) {
  const t = copy[language];
  const photo = index === null ? null : photos[index];
  const step = (delta: number) => index !== null && onIndexChange((index + delta + photos.length) % photos.length);
  return (
    <Dialog open={photo !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-full max-w-5xl"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus()?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        {photo && (
          <>
            <DialogTitle className="sr-only">{t.of(index! + 1, photos.length)}</DialogTitle>
            <figure className="m-0 flex flex-col gap-3">
              <img
                src={src(photo)}
                alt={photo.alt || photo.caption}
                width={photo.width}
                height={photo.height}
                className="max-h-[70dvh] w-full rounded-lg object-contain"
              />
              <figcaption>
                <DialogDescription className="author-text text-foreground">{photo.caption}</DialogDescription>
              </figcaption>
            </figure>
            {photos.length > 1 && (
              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={() => step(-1)}>
                  <ChevronLeftIcon aria-hidden="true" />
                  {t.previous}
                </Button>
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {t.of(index! + 1, photos.length)}
                </span>
                <Button type="button" variant="outline" onClick={() => step(1)}>
                  {t.next}
                  <ChevronRightIcon aria-hidden="true" />
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
