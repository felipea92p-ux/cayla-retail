// Análisis v4 (ADR-0357): de lo que devuelve `retail.fn_analisis_por_llegar` (un arreglo jsonb por tienda, migración
// 20261006215000) a lo que viene en camino por prenda (`LlegadaPrenda[]` por id de variante). Lógica pura; la prueba es
// `analisis-por-llegar-lectura.test.ts`.
//
// No confía en la forma (principio 9): una parte sin prenda, con un origen que no se conoce o sin unidades se descarta (nunca se
// promete una prenda que nadie mandó); una fecha que no se entiende queda como «sin fecha». Dos partes de la misma prenda, el mismo
// origen y la misma fecha se suman en una.

import type { LlegadaPrenda, OrigenLlegada } from "./analisis-tipos";

/** La función de la base que lee lo que viene en camino a UNA tienda. */
export const RPC_POR_LLEGAR = "fn_analisis_por_llegar";

/** Los orígenes que se conocen, en el orden en que se nombran cuando llegan el mismo día. */
const ORIGENES: readonly OrigenLlegada[] = ["compra", "almacen", "taller", "tienda"];

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const esOrigen = (v: unknown): v is OrigenLlegada => typeof v === "string" && (ORIGENES as readonly string[]).includes(v);

/** Las unidades de una parte: enteras; lo que no es número o no es positivo, 0 (y esa parte no se cuenta). */
function unidades(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Una fecha de calendario de verdad (YYYY-MM-DD), o null. */
function fecha(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [a, m, d] = v.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? v : null;
}

/** Primero lo que llega antes; lo que no tiene fecha, al final; el mismo día, en el orden de `ORIGENES`. */
function ordenLlegadas(a: LlegadaPrenda, b: LlegadaPrenda): number {
  if (a.fecha !== b.fecha) {
    if (a.fecha === null) return 1;
    if (b.fecha === null) return -1;
    return a.fecha.localeCompare(b.fecha);
  }
  return ORIGENES.indexOf(a.de) - ORIGENES.indexOf(b.de);
}

/**
 * Lo que viene en camino, por id de variante, cada prenda con sus partes ordenadas por fecha. null si la respuesta no es un
 * arreglo: la base respondió NULL (la cuenta no puede analizar) o algo que no se entiende. Quien llama lo dice como «no se pudo
 * leer», nunca como «no viene nada».
 */
export function leerPorLlegar(v: unknown): Record<string, LlegadaPrenda[]> | null {
  if (!Array.isArray(v)) return null;
  const porVariante = new Map<string, LlegadaPrenda[]>();
  for (const crudo of v) {
    if (!esObjeto(crudo)) continue;
    const varianteId = texto(crudo.variante_id);
    const cantidad = unidades(crudo.cantidad);
    if (!varianteId || !esOrigen(crudo.de) || cantidad === 0) continue;
    const parte: LlegadaPrenda = { de: crudo.de, cantidad, fecha: fecha(crudo.fecha) };
    const partes = porVariante.get(varianteId) ?? [];
    const igual = partes.find((p) => p.de === parte.de && p.fecha === parte.fecha);
    if (igual) igual.cantidad += parte.cantidad;
    else partes.push(parte);
    porVariante.set(varianteId, partes);
  }
  return Object.fromEntries([...porVariante].map(([id, partes]) => [id, [...partes].sort(ordenLlegadas)]));
}
