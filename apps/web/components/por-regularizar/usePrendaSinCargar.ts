"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cargaInicialDe, leerCargaInicial } from "@/lib/carga-inicial-reglas";
import { cargaParaLaFrase, type CargaDeLaSede } from "@/lib/por-regularizar-reglas";

/**
 * ¿La prenda elegida entró alguna vez a la tienda de la venta? (ADR-0328 act. 5, 20261004204000; rescatado de #788 sobre la mesa de
 * ADR-0360). Una prenda sin ningún movimiento ahí no se regulariza con ninguna respuesta: `regularizar_prenda` la rechaza con una frase
 * que depende de la carga inicial de esa sede. Esto la lee ANTES del botón, para que el puente diga lo mismo que va a decir la base.
 *
 * CONTRATO
 *   PROMETE: `cargada` de ESA prenda en ESA tienda (`fn_prenda_cargada_en_sede`) y la carga de la tienda (`fn_carga_inicial_sedes`),
 *            leídas juntas, en paralelo: `undefined` mientras no volvieron; `null` si no se pudo saber.
 *   ASUME:   solo se pregunta (`preguntar`) por una prenda SIN unidades libres en la tienda (o sin poder leerlas): una con unidades libres
 *            ya entró, no hace falta.
 *   SE DEGRADA: nunca lanza ni frena nada. Si la lectura falla, `cargada` es `null` y el puente dice lo de antes; la base decide al
 *            guardar. `x-espera: no`: es de fondo, no tapa la pantalla con el loader (ADR-0149).
 */
export function usePrendaSinCargar(
  prendaId: string | null,
  ubicacionId: string | null,
  preguntar: boolean,
): { cargada: boolean | null | undefined; carga: CargaDeLaSede | null } {
  const [leida, setLeida] = useState<{ clave: string; cargada: boolean | null; carga: CargaDeLaSede | null } | null>(null);
  const clave = preguntar && prendaId && ubicacionId ? `${prendaId}|${ubicacionId}` : null;

  useEffect(() => {
    if (!clave || !prendaId || !ubicacionId) return;
    let vigente = true;
    const supabase = createClient();
    void Promise.all([
      supabase.rpc("fn_prenda_cargada_en_sede", { p_variante_id: prendaId, p_ubicacion_id: ubicacionId }).setHeader("x-espera", "no"),
      supabase.rpc("fn_carga_inicial_sedes").setHeader("x-espera", "no"),
    ]).then(
      ([cargada, cargas]) => {
        if (!vigente) return;
        setLeida({
          clave,
          cargada: cargada.error || typeof cargada.data !== "boolean" ? null : cargada.data,
          carga: cargas.error ? null : cargaParaLaFrase(cargaInicialDe(leerCargaInicial(cargas.data), ubicacionId)),
        });
      },
      () => {
        if (vigente) setLeida({ clave, cargada: null, carga: null });
      },
    );
    return () => {
      vigente = false;
    };
  }, [clave, prendaId, ubicacionId]);

  if (!clave) return { cargada: null, carga: null };
  return leida?.clave === clave ? { cargada: leida.cargada, carga: leida.carga } : { cargada: undefined, carga: null };
}
