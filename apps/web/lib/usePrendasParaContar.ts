"use client";

import { useCallback, useEffect, useState } from "react";
import type { PrendaDelLugar } from "./conteo-por-prenda";

// Las prendas de la sede para el buscador «Por prenda» de «Abrir un conteo».
//
// CONTRATO
//   PROMETE: no toca la red hasta que `activo` es verdadero (el inicio de Conteo se adelgazó a propósito: la mayoría de los conteos
//            son «Todo» o una categoría y no necesitan esta lectura); lee UNA vez y se acuerda: tocar «Todo» y volver a «Por prenda»
//            no vuelve a pedirla. Si falla, `estado = "fallo"` y `reintentar()` la pide de nuevo.
//   ASUME:   `GET /api/conteo/prendas` (la sede sale de la sesión, no de aquí).
//   NO HACE: no filtra por lugar ni busca (eso es `conteo-por-prenda.ts`) y no escribe nada.

export type EstadoDePrendas = "en_espera" | "cargando" | "listo" | "fallo";

export type CargaDePrendas = {
  estado: EstadoDePrendas;
  /** `null` mientras no se haya leído. */
  prendas: PrendaDelLugar[] | null;
  reintentar: () => void;
};

export function usePrendasParaContar(activo: boolean): CargaDePrendas {
  const [prendas, setPrendas] = useState<PrendaDelLugar[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!activo || prendas !== null) return;
    const control = new AbortController();
    void (async () => {
      try {
        const respuesta = await fetch("/api/conteo/prendas", { signal: control.signal, cache: "no-store" });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        // Sin sesión, la ruta redirige al login y llega HTML: `json()` falla y se cuenta como fallo, no como «no hay prendas».
        const cuerpo = (await respuesta.json()) as { prendas?: PrendaDelLugar[] };
        if (!Array.isArray(cuerpo.prendas)) throw new Error("La respuesta no trae prendas");
        setPrendas(cuerpo.prendas);
        setFallo(false);
      } catch {
        if (!control.signal.aborted) setFallo(true);
      }
    })();
    return () => control.abort();
    // `intento` rearma la lectura tras «Reintentar»; `fallo` no entra: marcarlo no debe volver a pedirla.
  }, [activo, prendas, intento]);

  const reintentar = useCallback(() => {
    setFallo(false);
    setIntento((n) => n + 1);
  }, []);

  const estado: EstadoDePrendas = prendas !== null ? "listo" : fallo ? "fallo" : activo ? "cargando" : "en_espera";
  return { estado, prendas, reintentar };
}
