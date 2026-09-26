"use server";

import { requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { getSububicaciones } from "@/lib/sububicaciones";
import { getUbicaciones } from "@/lib/ubicaciones";
import { filaCsvMovimiento, filtrosDesdeParams, listarMovimientos, type CursorMovimientos, type ParamsMovimientos } from "@/lib/movimientos-v2";

// Exportar Movimientos a Excel (ADR-0234, decisión D3 de Felipe): el módulo promete «Consultar y exportar» en Roles y
// accesos. Trae TODO lo filtrado —no solo la página que se ve— de la sede de la cabecera, con los mismos filtros de la
// URL, y devuelve las filas ya armadas; el navegador arma el CSV (`descargarCsv`, la misma pieza de Existencias).
//
// PROMETE: las filas de `fn_movimientos` para esos filtros, de la más nueva a la más vieja, hasta TOPE_EXPORTACION; si
// hay más, `truncado` lo dice (nunca un archivo que parece completo y no lo es). ASUME: quien llama ve el módulo
// «movimientos»; igual la base vuelve a comprobar que opere la sede (`fn_puede_operar_ubicacion`).
// Números: la sede con más movimiento (TRU) hizo 127 en sus primeros 5 días; 90 días así son ~2.300 filas. 10.000 filas
// son ~50 llamadas de 200 (1–3 s) y un archivo de ~1,5 MB.
const TOPE_EXPORTACION = 10_000;

export type ExportacionMovimientos =
  | { ok: true; sede: string; filas: (string | number)[][]; truncado: boolean }
  | { ok: false; error: string };

export async function exportarMovimientos(busqueda: string): Promise<ExportacionMovimientos> {
  const persona = await requirePersonaActualV2();
  if (!veModulo(persona, "movimientos")) return { ok: false, error: "Tu rol no incluye Movimientos." };

  const params = Object.fromEntries(new URLSearchParams(busqueda)) as ParamsMovimientos;
  const [ubicaciones, sububicaciones] = await Promise.all([getUbicaciones(), getSububicaciones(persona.ubicacionId)]);
  const filtros = filtrosDesdeParams(params, { sububicaciones });

  const filas: (string | number)[][] = [];
  let cursor: CursorMovimientos | null = null;
  try {
    do {
      const pagina = await listarMovimientos(persona.ubicacionId, filtros, { cursor, limite: 200 });
      for (const m of pagina.filas) filas.push(filaCsvMovimiento(m));
      cursor = pagina.siguiente;
    } while (cursor && filas.length < TOPE_EXPORTACION);
  } catch (e) {
    console.error("Exportar Movimientos:", e);
    return { ok: false, error: "No se pudo leer los movimientos. Vuelve a intentar." };
  }

  return {
    ok: true,
    sede: ubicaciones.find((u) => u.id === persona.ubicacionId)?.nombre ?? persona.ubicacionEtiqueta,
    filas: filas.slice(0, TOPE_EXPORTACION),
    truncado: cursor !== null || filas.length > TOPE_EXPORTACION,
  };
}
