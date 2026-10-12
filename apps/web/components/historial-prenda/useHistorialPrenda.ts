"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { armarEventos, type FilaHistorial, type LecturaHistorial } from "@/lib/historial-prenda-reglas";

export type { LecturaHistorial };

const LEYENDO: LecturaHistorial = { estado: "leyendo" };

/**
 * Lee el historial de una prenda desde el navegador (la vista rápida de la Grilla), solo cuando `activo`. `fn_historial_prenda` es
 * de solo lectura y empieza con `fn_`: no abre el loader global (ADR-0149); la hoja muestra su propio esqueleto. Si la base no
 * responde, la hoja lo dice y ofrece reintentar: nunca se cae (principio 9).
 */
export function useHistorialPrenda(productoId: string, activo: boolean): { lectura: LecturaHistorial; reintentar: () => void } {
  const [intento, setIntento] = useState(0);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  // La respuesta lleva la clave de la lectura que la pidió: una vieja (otra prenda, un reintento) no pisa a la nueva, y mientras
  // la clave no coincide se está «leyendo».
  const clave = `${productoId}|${intento}`;
  const [respuesta, setRespuesta] = useState<{ clave: string; lectura: LecturaHistorial } | null>(null);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    // Los tipos de la base son generados y todavía no traen esta función (ADR-0354): la llamada va con `as never`, como otras.
    void createClient()
      .rpc("fn_historial_prenda" as never, { p_producto_id: productoId } as never)
      .then(({ data, error }) => {
        if (!vivo) return;
        setRespuesta({
          clave,
          lectura: error || !Array.isArray(data) ? { estado: "error" } : { estado: "ok", eventos: armarEventos(data as FilaHistorial[]) },
        });
      });
    return () => {
      vivo = false;
    };
  }, [clave, productoId, activo]);

  return { lectura: respuesta?.clave === clave ? respuesta.lectura : LEYENDO, reintentar };
}
