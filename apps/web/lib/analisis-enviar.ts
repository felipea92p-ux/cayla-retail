// Análisis v4 (ADR-0357, «Actualización 2026-10-17 — Mándalas y Enviar dicen la verdad», B2): a QUÉ tienda se le manda lo que aquí no se vende, qué tallas y
// colores de esa prenda lleva el envío y cuántas se pueden mandar hoy. Lógica pura (sin base ni React), probada en `analisis-enviar.test.ts`.
//
// EL PROBLEMA. «Mándalas a donde sí se venden» mueve stock en el mundo real, y la regla de antes era corta: bastaba que otra tienda hubiera vendido 2 o más
// en 30 días. No miraba si esa tienda ya tenía de sobra (se le mandaba a quien ya estaba cubierto), elegía entre dos destinos a la que MÁS tenía, el envío
// llevaba «una de cada talla» aunque allá solo se hubieran vendido dos, y Traslados descartaba en silencio lo que está en el piso (solo sale del almacén):
// el botón abría un traslado vacío o con menos líneas de las anunciadas. Y una tienda cuya lectura falló parecía «no vende»: de ahí a «Liquidar» había un paso.
//
// LAS REGLAS (decididas por el orquestador con la recomendación del plan, D10 y D7; Felipe puede cambiar cada constante):
//   · Destino = una tienda que LEÍMOS, que vendió `VENDIDAS_PARA_ENVIAR` o más en 30 días y a la que le queda POCA cobertura: menos de `COBERTURA_DESTINO_DIAS`
//     días de stock a su propio ritmo. Lo que ya viene en camino a esa tienda no se lee todavía (Análisis solo lee lo que viene a la mía): se dice.
//   · Entre dos destinos con la misma venta, la que tiene MENOS stock (antes, la que más tenía).
//   · El envío lleva solo las tallas y colores que el destino VENDIÓ, y solo lo que está en el almacén (lo que está en el piso no se puede mandar).
//   · Si una de las otras tiendas no se pudo leer, no se sabe si allá se vende: lo que dependa de ella (liquidar) queda en «Aún no se sabe», con su razón.
//   · Sin cantidades (decisión 7 de ADR-0357): cuántas, se elige en el traslado.

import type { PrendaAnalisis, PrendaEnOtraSede } from "./analisis-tipos";

// `analisis-reglas.ts` importa este archivo (grupoDe decide «Mándalas»): estas dos cuentas chicas viven aquí para no hacer un ciclo.
const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios);
const totalEnTienda = (p: Pick<PrendaAnalisis, "piso" | "almacen">): number => p.piso + p.almacen;

/** Cuánto tiene que haber vendido otra tienda en 30 días para proponer mandársela. */
export const VENDIDAS_PARA_ENVIAR = 2;
/** La tienda a la que se manda tiene que quedarle menos de esto de stock (a su propio ritmo): si ya tiene de sobra, no se le manda más. */
export const COBERTURA_DESTINO_DIAS = 30;
/** La ventana de las ventas de las otras tiendas (`vendidas30`). */
const VENTANA_OTRAS_DIAS = 30;

/**
 * Cuántos días de stock tiene esa tienda a su propio ritmo (`stock ÷ vendidas por día`): 0 si no tiene, null si no vendió (no hay ritmo con que medir).
 * Una tienda sin leer no tiene cobertura: no se sabe.
 */
export function coberturaDelDestino(o: Pick<PrendaEnOtraSede, "stock" | "vendidas30" | "sinLeer">): number | null {
  if (o.sinLeer || !(o.vendidas30 > 0)) return null;
  return o.stock <= 0 ? 0 : o.stock / (o.vendidas30 / VENTANA_OTRAS_DIAS);
}

/** ¿Esta tienda sirve de destino? Se leyó, vendió lo suficiente y le queda poca cobertura. */
export function esDestinoPosible(o: Pick<PrendaEnOtraSede, "stock" | "vendidas30" | "sinLeer">): boolean {
  if (o.sinLeer || o.vendidas30 < VENDIDAS_PARA_ENVIAR) return false;
  const c = coberturaDelDestino(o);
  return c !== null && c < COBERTURA_DESTINO_DIAS;
}

/**
 * A qué tienda se le manda esta prenda: de las que sirven, la que más vendió; a igual venta, la que tiene MENOS stock (la que más lo necesita), y después
 * el id (para que no cambie de un día a otro). null si ninguna sirve.
 */
export function destinoParaEnviar<T extends Pick<PrendaEnOtraSede, "sedeId" | "stock" | "vendidas30" | "sinLeer">>(otras: readonly T[]): T | null {
  const sirven = otras.filter(esDestinoPosible);
  if (sirven.length === 0) return null;
  return [...sirven].sort((a, b) => b.vendidas30 - a.vendidas30 || a.stock - b.stock || a.sedeId.localeCompare(b.sedeId))[0]!;
}

/** Las otras tiendas que no se pudieron leer (sus ids): de ellas no se sabe si allá se vende. */
export const tiendasSinLeer = (otras: readonly Pick<PrendaEnOtraSede, "sedeId" | "sinLeer">[]): string[] => otras.filter((o) => o.sinLeer).map((o) => o.sedeId);

/** «no se pudo leer Arequipa: no se sabe si allá se vende» (o «…Arequipa y Lima: no se sabe si allá se vende»). `nombre`: cómo se llama cada tienda. */
export function razonTiendaSinLeer(ids: readonly string[], nombre: (id: string) => string): string {
  const nombres = ids.map(nombre);
  const lista = nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return `No se pudo leer ${lista}: no se sabe si ${ids.length === 1 ? "allá" : "en esas tiendas"} se vende.`;
}

type ParaEnviar = Pick<PrendaAnalisis, "varianteId" | "piso" | "almacen" | "otras">;

/** Las tallas (variantes) de una fila: un modelo trae las suyas en `variantes`; una talla suelta va sola. */
const tallasDe = <T extends object>(filas: readonly T[]): T[] => filas.flatMap((f) => ("variantes" in f && Array.isArray(f.variantes) ? (f.variantes as T[]) : [f]));

/** ¿El destino vendió esta talla y color en sus últimos 30 días? */
const vendioAlla = (p: Pick<PrendaAnalisis, "otras">, destinoId: string): boolean => (p.otras.find((o) => o.sedeId === destinoId)?.vendidas30 ?? 0) > 0;

/**
 * Lo que lleva un envío a ese destino: SOLO las tallas y colores que el destino vendió y que hay en el ALMACÉN (el piso no se manda: el traslado lo
 * descarta). `tallas`: las filas que sí van; `movibles`: sus unidades en el almacén; `deLoVendido`: las unidades que tiene aquí de lo que el destino
 * vendió (piso + almacén), para decir «Puedes mandar 3 de 12».
 */
export function loQueLlevaElEnvio<T extends ParaEnviar>(prendas: readonly T[], destinoId: string): { tallas: T[]; movibles: number; deLoVendido: number } {
  const vendidas = tallasDe(prendas).filter((p) => totalEnTienda(p) > 0 && vendioAlla(p, destinoId));
  const tallas = vendidas.filter((p) => p.almacen > 0);
  return { tallas, movibles: tallas.reduce((s, p) => s + p.almacen, 0), deLoVendido: vendidas.reduce((s, p) => s + totalEnTienda(p), 0) };
}

/**
 * Lo que dice el botón de enviar cuando no todo se puede mandar hoy: «Puedes mandar 3 de 12: las otras están en el piso, sácalas primero». Vacío si se
 * puede mandar todo o no hay nada de lo que ese destino vendió.
 */
export function textoPuedesMandar(movibles: number, deLoVendido: number): string {
  if (deLoVendido <= 0 || movibles >= deLoVendido) return "";
  if (movibles <= 0) return `No puedes mandar ${plural(deLoVendido, "la", "las")} ${deLoVendido} hoy: ${plural(deLoVendido, "está", "están")} en el piso, ${plural(deLoVendido, "sácala", "sácalas")} primero.`;
  const resto = deLoVendido - movibles;
  return `Puedes mandar ${movibles} de ${deLoVendido}: ${plural(resto, "la otra está", "las otras están")} en el piso, ${plural(resto, "sácala", "sácalas")} primero.`;
}
