"use client";

import { useEffect, useState } from "react";
import { leerReferenciasDeCosto } from "@/lib/recepcion-conteo-acciones";
import type { ReferenciasDeCosto } from "@/lib/referencia-de-costo";

/**
 * Lo que necesita una hoja de Recibir para avisar de un costo dudoso (ADR-0668, A4), leído una vez por conjunto de prendas, categorías y
 * líneas. `falla`: la base no respondió; la hoja no inventa una duda, deja guardar y lo dice («No pude comparar con lo de antes»).
 */
export function useReferenciasDeCosto(
  pide: { variantes: readonly string[]; categorias: readonly string[]; lineasDelEnvio: readonly string[] },
  activo = true,
): { refs: ReferenciasDeCosto | null; falla: boolean } {
  const clave = [[...pide.variantes].sort().join(","), [...pide.categorias].sort().join(","), [...pide.lineasDelEnvio].sort().join(",")].join("|");
  const [estado, setEstado] = useState<{ clave: string; refs: ReferenciasDeCosto | null; falla: boolean } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void leerReferenciasDeCosto(pide).then((refs) => {
      if (vivo) setEstado({ clave, refs, falla: refs === null });
    });
    return () => {
      vivo = false;
    };
    // Se lee una vez por conjunto (la clave); `pide` se arma en cada dibujo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, activo]);
  // Mientras llega la lectura de un conjunto nuevo, no hay duda que decir (y tampoco «no pude»).
  return estado && estado.clave === clave ? { refs: estado.refs, falla: estado.falla } : { refs: null, falla: false };
}
