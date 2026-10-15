import { useEffect } from "react";
import { clearAccountRecovery } from "./recovery";
export default function UnavailableDraft({
  accountId,
  clearRecovery,
  spanish,
}: {
  accountId: string;
  clearRecovery: boolean;
  spanish: boolean;
}) {
  useEffect(() => {
    if (clearRecovery) {
      try {
        clearAccountRecovery(localStorage, accountId);
      } catch {
        /* Optional storage may be unavailable. */
      }
    }
  }, [accountId, clearRecovery]);
  return (
    <section>
      <h1>{spanish ? "Borrador no disponible" : "Draft unavailable"}</h1>
      <p>
        {spanish
          ? "Este borrador ya no está disponible. La copia antigua del dispositivo no se puede restaurar."
          : "This draft is unavailable. Its old device copy cannot be restored."}
      </p>
      <a href={spanish ? "/add-recipe?lang=es" : "/add-recipe"}>
        {spanish ? "Empezar otra receta" : "Start a new recipe"}
      </a>
    </section>
  );
}
