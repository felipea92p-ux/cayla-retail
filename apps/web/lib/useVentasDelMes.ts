"use client";

import { useCallback, useEffect, useState } from "react";
import type { MesEnCurso, VentaDelMes } from "./existencias-resumen";

// Lo vendido en el mes en curso para la ventana «Resumen disponible» de Existencias.
//
// CONTRATO
//   PROMETE: lee UNA vez al montarse (la ventana se abre a propósito; la página no la pide) y se acuerda mientras la ventana siga
//            abierta. Si falla, `estado = "fallo"` y `reintentar()` la pide de nuevo; si el navegador cancela (se cerró la ventana),
//            no marca un fallo que nadie va a ver.
//   ASUME:   `GET /api/existencias/ventas-del-mes?ubicacion=<id>` (solo un líder puede pedir otra sede; el mes lo trae la respuesta).
//   NO HACE: no suma ni ordena nada (eso es `existencias-resumen.ts`) y no escribe.

export type EstadoDeVentas = "cargando" | "listo" | "fallo";

export type CargaDeVentas = {
  estado: EstadoDeVentas;
  /** `null` mientras no se haya leído. */
  ventas: VentaDelMes[] | null;
  mes: MesEnCurso | null;
  reintentar: () => void;
};

export function useVentasDelMes(ubicacionId: string): CargaDeVentas {
  const [datos, setDatos] = useState<{ ventas: VentaDelMes[]; mes: MesEnCurso } | null>(null);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    void (async () => {
      try {
        const respuesta = await fetch(`/api/existencias/ventas-del-mes?ubicacion=${encodeURIComponent(ubicacionId)}`, { signal: control.signal, cache: "no-store" });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        // Sin sesión, la ruta redirige al login y llega HTML: `json()` falla y se cuenta como fallo, no como «no se vendió nada».
        const cuerpo = (await respuesta.json()) as { ventas?: VentaDelMes[]; mes?: MesEnCurso };
        if (!Array.isArray(cuerpo.ventas) || !cuerpo.mes) throw new Error("La respuesta no trae las ventas del mes");
        setDatos({ ventas: cuerpo.ventas, mes: cuerpo.mes });
        setFallo(false);
      } catch {
        if (!control.signal.aborted) setFallo(true);
      }
    })();
    return () => control.abort();
    // `intento` rearma la lectura tras «Reintentar».
  }, [ubicacionId, intento]);

  const reintentar = useCallback(() => {
    setFallo(false);
    setDatos(null);
    setIntento((n) => n + 1);
  }, []);

  return { estado: datos ? "listo" : fallo ? "fallo" : "cargando", ventas: datos?.ventas ?? null, mes: datos?.mes ?? null, reintentar };
}
