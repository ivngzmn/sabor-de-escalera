import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  variant: "card" | "detail" | "editor";
  state: "loading" | "planned";
  language?: "en" | "es";
};

/** Presentation only. Callers replace loading with content, Empty, or Alert. */
export default function RecipePlaceholder({
  variant,
  state,
  language = "en",
}: Props) {
  const planned = state === "planned";
  const title =
    language === "es"
      ? planned
        ? "Próximamente"
        : "Cargando receta"
      : planned
        ? "Coming soon"
        : "Loading recipe";
  const shape = (layout: string) =>
    cn(layout, planned && "motion-safe:animate-none");
  return (
    <Card
      role={planned ? "group" : "status"}
      aria-label={title}
      aria-busy={planned ? undefined : true}
      data-placeholder={variant}
    >
      <CardHeader>
        {planned && <Badge variant="outline">{title}</Badge>}
        <CardTitle>
          {!planned && <span className="sr-only">{title}</span>}
          <Skeleton aria-hidden="true" className={shape("h-6 w-3/4")} />
        </CardTitle>
        <CardDescription>
          <span className="sr-only">
            {language === "es"
              ? planned
                ? "Vista previa del diseño de futuras recetas."
                : "Preparando el contenido de tu receta."
              : planned
                ? "Layout preview for future recipes."
                : "Preparing your recipe content."}
          </span>
          <Skeleton aria-hidden="true" className={shape("h-4 w-1/2")} />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {variant !== "editor" && (
          <Skeleton
            aria-hidden="true"
            className={shape("aspect-[4/3] w-full")}
          />
        )}
        {variant === "editor" ? (
          <div aria-hidden="true" className="flex flex-col gap-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex flex-col gap-3">
                <Skeleton aria-hidden="true" className={shape("h-4 w-1/3")} />
                <Skeleton aria-hidden="true" className={shape("h-11 w-full")} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton aria-hidden="true" className={shape("h-4 w-full")} />
            <Skeleton aria-hidden="true" className={shape("h-4 w-4/5")} />
            {variant === "detail" && (
              <Skeleton aria-hidden="true" className={shape("h-24 w-full")} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
