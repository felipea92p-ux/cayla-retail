"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cargaInicialDe, leerCargaInicial, type CargaInicialSede } from "@/lib/carga-inicial-reglas";

/**
 * La carga inicial de UNA sede, leída desde el navegador (ADR-0328, actividad 4): la usan «Ajustar inventario» y el stock de la
 * ficha del producto, que se abren desde varias pantallas y no reciben el dato de su página.
 *
 * Lectura opcional, como `fn_faltantes_de_conteo` en el mismo modal: mientras llega, o si la función no existe todavía (la web
 * salió antes que el SQL) o falla, devuelve `null` y la pantalla se porta como antes. La base igual cierra la puerta.
 * `x-espera: no`: es una lectura de fondo y no debe cubrir la pantalla con el loader (ADR-0149).
 */
export function useCargaInicial(ubicacionId: string | null | undefined): CargaInicialSede | null {
  const [carga, setCarga] = useState<CargaInicialSede | null>(null);
  useEffect(() => {
    if (!ubicacionId) return;
    let vigente = true;
    createClient()
      .rpc("fn_carga_inicial_sedes")
      .setHeader("x-espera", "no")
      .then(({ data, error }) => {
        if (vigente) setCarga(error ? null : cargaInicialDe(leerCargaInicial(data), ubicacionId));
      });
    return () => {
      vigente = false;
    };
  }, [ubicacionId]);
  return carga;
}
