import {
  categories,
  totalMinutes,
  type RecipeInput,
  type Origin,
} from "./validation";
export default function RecipePreview({
  input,
  id,
  origins,
  spanish = false,
  published = false,
}: {
  input: RecipeInput;
  id: string;
  origins: Origin[];
  spanish?: boolean;
  published?: boolean;
}) {
  const t = (en: string, es: string) => (spanish ? es : en);
  return (
    <article className="recipe-preview">
      <p className="eyebrow">
        {
          categories.find((c) => c.id === input.category)?.[
            spanish ? "es" : "en"
          ]
        }{" "}
        ·{" "}
        {
          origins.find((o) => o.id === input.origin)?.[
            spanish ? "label_es" : "label_en"
          ]
        }
      </p>
      <h1>{input.title || t("Untitled recipe", "Receta sin título")}</h1>
      <p>
        {t("Original language", "Idioma original")}:{" "}
        {input.language === "es" ? "Español" : "English"}
      </p>
      <p>
        {input.yieldText}{" "}
        {totalMinutes(input) !== null && (
          <>
            · {totalMinutes(input)} {t("minutes", "minutos")}
          </>
        )}
      </p>
      {input.sourceCredit && (
        <p>
          {t("Source / original author", "Fuente / autor original")}:{" "}
          {input.sourceCredit}
        </p>
      )}
      {input.story && <p className="author-text">{input.story}</p>}
      <div className="recipe-gallery">
        {input.photos.map((p, i) => (
          <figure key={p.assetId}>
            <div className={i === 0 ? "cover-frame" : ""}>
              <img
                src={
                  published
                    ? `/api/recipes/${id}/photos/${p.assetId}?variant=gallery`
                    : `/api/media/${p.assetId}?variant=gallery`
                }
                width={p.width ?? 640}
                height={p.height ?? 480}
                alt={p.alt || p.caption}
                style={
                  i === 0
                    ? {
                        objectPosition: `${p.crop.x}% ${p.crop.y}%`,
                        transform: `scale(${p.crop.zoom})`,
                      }
                    : undefined
                }
              />
            </div>
            <figcaption>{p.caption}</figcaption>
            {i === 0 && (
              <a
                href={
                  published
                    ? `/api/recipes/${id}/photos/${p.assetId}?variant=gallery`
                    : `/api/media/${p.assetId}?variant=gallery`
                }
                target="_blank"
                rel="noopener"
              >
                {t("View full photo", "Ver foto completa")}
              </a>
            )}
          </figure>
        ))}
      </div>
      <div className="recipe-columns">
        <section aria-label={t("Ingredients", "Ingredientes")}>
          <h2>{t("Ingredients", "Ingredientes")}</h2>
          <ul>
            {input.ingredients.map((r, i) => (
              <li key={i}>
                {r.kind === "section" ? (
                  <h3>{r.name}</h3>
                ) : (
                  <>
                    <span>
                      {[r.quantity, r.unit, r.name].filter(Boolean).join(" ")}
                    </span>
                    {r.notes && <> — {r.notes}</>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label={t("Instructions", "Instrucciones")}>
          <h2>{t("Instructions", "Instrucciones")}</h2>
          <ol>
            {input.instructions.map((r, i) => (
              <li key={i} className="author-text">
                {r.kind === "section" ? <h3>{r.text}</h3> : r.text}
              </li>
            ))}
          </ol>
        </section>
      </div>
      {input.notes && (
        <section>
          <h2>{t("Author notes", "Notas del autor")}</h2>
          <p className="author-text">{input.notes}</p>
        </section>
      )}
      {input.videoUrl && (
        <a href={input.videoUrl} target="_blank" rel="noopener noreferrer">
          {t("Watch video on original site", "Ver vídeo en el sitio original")}
        </a>
      )}
    </article>
  );
}
