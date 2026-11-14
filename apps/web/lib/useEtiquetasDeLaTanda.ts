"use client";

import { useCallback, useEffect, useState } from "react";
import type { EtiquetaPrecio } from "./etiqueta-precio-reglas";
import { urlApiEtiquetasDeLaTanda, type LineaDeSalida } from "./recepcion-salida-reglas";

// Las etiquetas de precio de la tanda que acaba de entrar al stock, para imprimirlas desde su hoja sin ir a la pantalla de Etiquetas
// (tarea 6 de Recibir, Felipe 2026-11-14).
//
// CONTRATO
//   PROMETE: las pide UNA vez al abrirse la hoja —así «Imprimir» es un solo toque y no espera una lectura— y nunca imprime por su cuenta:
//            solo las deja listas (ADR-0180: imprimir es siempre un clic de la persona). Si falla, `estado = "fallo"` y `reintentar()`.
//   ASUME:   `GET /api/etiquetas-de-precio/tanda?unidades=…`, la misma lectura de la pantalla de Etiquetas (precio de la sede y campaña de hoy).
//   NO HACE: no arma ni ordena etiquetas (eso es `armarEtiquetas`) y no escribe.

export type EtiquetasDeLaTanda = {
  etiquetas: EtiquetaPrecio[];
  /** Las prendas que no llevan etiqueta porque no tienen código que la pistola lea. */
  sinCodigo: string[];
  /** La fecha que va en el papel («Impreso 14.11»). */
  impreso: string;
};

export function useEtiquetasDeLaTanda(lineas: readonly LineaDeSalida[]): { estado: "cargando" | "listo" | "fallo"; datos: EtiquetasDeLaTanda | null; reintentar: () => void } {
  const [datos, setDatos] = useState<EtiquetasDeLaTanda | null>(null);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  // La dirección, y no `lineas`: la lista llega nueva en cada dibujo de la hoja y volvería a pedir lo mismo.
  const url = urlApiEtiquetasDeLaTanda(lineas);

  useEffect(() => {
    const control = new AbortController();
    void (async () => {
      try {
        const respuesta = await fetch(url, { signal: control.signal, cache: "no-store" });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        // Sin sesión, la ruta redirige al login y llega HTML: `json()` falla y se cuenta como fallo, no como «no hay etiquetas».
        const cuerpo = (await respuesta.json()) as Partial<EtiquetasDeLaTanda>;
        if (!Array.isArray(cuerpo.etiquetas) || !Array.isArray(cuerpo.sinCodigo) || typeof cuerpo.impreso !== "string") throw new Error("La respuesta no trae las etiquetas");
        setDatos({ etiquetas: cuerpo.etiquetas, sinCodigo: cuerpo.sinCodigo, impreso: cuerpo.impreso });
        setFallo(false);
      } catch {
        if (!control.signal.aborted) setFallo(true);
      }
    })();
    return () => control.abort();
    // `intento` rearma la lectura tras «Reintentar».
  }, [url, intento]);

  const reintentar = useCallback(() => {
    setFallo(false);
    setDatos(null);
    setIntento((n) => n + 1);
  }, []);

  return { estado: datos ? "listo" : fallo ? "fallo" : "cargando", datos, reintentar };
}
