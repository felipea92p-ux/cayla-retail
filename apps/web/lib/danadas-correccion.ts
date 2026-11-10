/**
 * «Me equivoqué de prenda» y «No estaba dañada» (ADR-0640, Felipe 2026-11-10): las dos salidas de una dañada reportada por error.
 *
 * Nació de Trujillo: se reportó dañada una talla 28 cuando la manchada era la 30, y la tienda lo «corrigió» con dos «Ajustar stock»,
 * que no saben de la dañada; el sistema terminó contando una prenda de más. Con estas dos puertas la corrección son traslados
 * internos dentro de la sede (`corregir_prenda_danada`, `devolver_danada_sin_dano`, 20261110172000 y 20261110173000): nada se pierde
 * ni aparece. Aquí vive solo lo que la pantalla decide (qué se ofrece, desde dónde, qué se dice); las reglas las hace cumplir la base.
 */

import type { CampoDeGuia } from "./guia-campos";
import type { DesdeDanada } from "./danadas-reglas";

export const RPC_CORREGIR_DANADA = "corregir_prenda_danada";
/** @internal Lo lee solo su prueba, que lo cruza con la firma de la migración y con los argumentos que arma la pantalla. */
export const PARAMETROS_RPC_CORREGIR = ["p_id", "p_variante_id", "p_desde", "p_token"] as const;
export const RPC_SIN_DANO = "devolver_danada_sin_dano";
/** @internal Lo lee solo su prueba, que lo cruza con la firma de la migración y con los argumentos que arma la pantalla. */
export const PARAMETROS_RPC_SIN_DANO = ["p_id", "p_nota", "p_token"] as const;

/** De dónde salió una dañada reportada en la tienda, leído de su movimiento de entrada (un traslado del piso o del almacén a la
 *  cuarentena). Null si entró de otra forma (devolución, cambio, recepción): esas no se corrigen ni vuelven a ningún lugar. */
export function desdeDeLaEntrada(tipo: string | null | undefined, origen: string | null | undefined, destino: string | null | undefined): DesdeDanada | null {
  if (tipo !== "traslado" || destino !== "cuarentena") return null;
  if (origen === "piso_venta") return "piso";
  if (origen === "almacen_tienda") return "almacen";
  return null;
}

/** «talla 28 · Celeste», o lo que haya. Es como la tienda nombra una prenda dentro de un modelo. */
export function nombreCorto(talla: string | null, color: string | null): string {
  const partes = [talla ? `talla ${talla}` : null, color].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "esta prenda";
}

/** Otra talla o color del mismo modelo, con lo LIBRE de hoy en el piso y en el almacén de la sede. */
export type Hermana = { varianteId: string; talla: string | null; color: string | null; piso: number; almacen: number };

/** Una prenda que se puede elegir como «la dañada de verdad»: de dónde sale (sugerido) y si alcanza. */
export type OpcionCorreccion = Hermana & { desde: DesdeDanada | null; alcanza: boolean };

/**
 * Lugar sugerido para sacar la correcta: donde hay lo suficiente; con los dos, el mismo de donde salió la equivocada (lo más
 * probable es que estuvieran juntas). Sin ninguno, null: la opción se ve pero no se elige.
 */
export function desdeSugerido(h: Pick<Hermana, "piso" | "almacen">, cantidad: number, desdeDeLaEquivocada: DesdeDanada | null): DesdeDanada | null {
  const enPiso = h.piso >= cantidad;
  const enAlmacen = h.almacen >= cantidad;
  if (enPiso && enAlmacen) return desdeDeLaEquivocada ?? "almacen";
  if (enAlmacen) return "almacen";
  if (enPiso) return "piso";
  return null;
}

/**
 * Las prendas que se ofrecen al corregir: las del MISMO modelo menos la que ya dice la dañada, primero las del mismo color (el
 * error más común es la talla), en el orden de la curva. Las que no alcanzan se ven apagadas: así nadie busca una talla que «falta».
 */
export function opcionesDeCorreccion(
  danada: { varianteId: string; color: string | null; cantidad: number },
  hermanas: readonly Hermana[],
  desdeDeLaEquivocada: DesdeDanada | null
): OpcionCorreccion[] {
  const vistas = new Set<string>();
  const opciones: OpcionCorreccion[] = [];
  hermanas.forEach((h) => {
    if (h.varianteId === danada.varianteId || vistas.has(h.varianteId)) return;
    vistas.add(h.varianteId);
    const desde = desdeSugerido(h, danada.cantidad, desdeDeLaEquivocada);
    opciones.push({ ...h, piso: Math.max(0, h.piso), almacen: Math.max(0, h.almacen), desde, alcanza: desde !== null });
  });
  // Estable: el mismo color primero; dentro, el orden en que llegaron (la curva de tallas de Existencias).
  return opciones
    .map((o, i) => ({ o, i }))
    .sort((a, b) => Number(b.o.color === danada.color) - Number(a.o.color === danada.color) || a.i - b.i)
    .map(({ o }) => o);
}

const DEL_LUGAR: Record<DesdeDanada, string> = { piso: "del piso", almacen: "del almacén" };
const AL_LUGAR: Record<DesdeDanada, string> = { piso: "al piso", almacen: "al almacén" };

/** Lo que va a pasar, dicho antes de confirmar: las dos prendas, con su lugar. */
export function quePasaAlCorregir(
  equivocada: { talla: string | null; color: string | null },
  desdeEquivocada: DesdeDanada,
  correcta: { talla: string | null; color: string | null },
  desdeCorrecta: DesdeDanada,
  cantidad: number
): string {
  const una = cantidad === 1;
  const vuelve = `La ${nombreCorto(equivocada.talla, equivocada.color)} ${una ? "vuelve" : `(${cantidad}) vuelven`} ${AL_LUGAR[desdeEquivocada]}, lista${una ? "" : "s"} para vender.`;
  const pasa = `La ${nombreCorto(correcta.talla, correcta.color)} sale ${DEL_LUGAR[desdeCorrecta]} y pasa a dañadas, con el mismo daño y su foto.`;
  return `${vuelve} ${pasa}`;
}

/** Lo que pasa con «No estaba dañada»: vuelve a donde estaba, sin anotarse como arreglo ni como pérdida. */
export function quePasaSinDano(desde: DesdeDanada, cantidad: number): string {
  const una = cantidad === 1;
  const donde = desde === "piso" ? "al piso, colgada como antes" : "al almacén";
  return `${una ? "Vuelve" : `Las ${cantidad} vuelven`} ${donde}, ${una ? "lista" : "listas"} para vender. No cuenta como arreglo ni como pérdida.`;
}

/** La guía de «Me equivoqué de prenda»: cuál es la dañada de verdad y quién lo hace. */
export function camposGuiaCorreccion(elegida: boolean, responsableListo: boolean): CampoDeGuia[] {
  return [
    { id: "correcta", nombre: "Cuál es la dañada", requerido: true, hecho: elegida, pendiente: "Toca la talla o el color que está dañado de verdad." },
    { id: "responsable", nombre: "Quién lo hace", requerido: true, hecho: responsableListo, pendiente: "Elige quién lo hace." },
  ];
}

export type ArgumentosDeCorreccion = { p_id: string; p_variante_id: string; p_desde: DesdeDanada; p_token: string };

export function argumentosDeCorreccion(id: string, varianteId: string, desde: DesdeDanada, token: string): ArgumentosDeCorreccion {
  return { p_id: id, p_variante_id: varianteId, p_desde: desde, p_token: token };
}

export type ArgumentosSinDano = { p_id: string; p_nota: string | null; p_token: string };

export function argumentosSinDano(id: string, nota: string, token: string): ArgumentosSinDano {
  const n = nota.trim();
  return { p_id: id, p_nota: n.length > 0 ? n : null, p_token: token };
}

export function tituloExitoCorreccion(correcta: { talla: string | null; color: string | null }): string {
  return `Corregido: la dañada es la ${nombreCorto(correcta.talla, correcta.color)}`;
}

export function tituloExitoSinDano(unidades: number, desde: DesdeDanada): string {
  const donde = desde === "piso" ? "al piso" : "al almacén";
  return unidades === 1 ? `Volvió ${donde}: no estaba dañada` : `${unidades} prendas volvieron ${donde}: no estaban dañadas`;
}

/** «Antes decía talla 28»: lo que la lista muestra de una dañada ya corregida. */
export function textoCorregidaDe(talla: string | null, color: string | null): string {
  return `Corregida: antes decía ${nombreCorto(talla, color)}`;
}

/**
 * ADR-0640, actividad 3: en qué tallas (y colores) del modelo hay dañadas, para la casilla «1 dañada · talla 26» de «Todas». Sin esto la
 * casilla decía un número sin lugar y nadie notaba una talla mal reportada. El color se nombra solo si el modelo tiene más de uno.
 */
export function dondeEstanLasDanadas(colores: readonly { color: string | null; tallas: readonly { talla: string | null; danado?: number | null }[] }[]): string {
  const varios = colores.length > 1;
  const partes = colores.flatMap((c) =>
    c.tallas
      .filter((t) => (t.danado ?? 0) > 0)
      .map((t) => {
        const n = t.danado ?? 0;
        const talla = t.talla ?? "Única";
        return `${varios && c.color ? `${c.color} ` : ""}${talla}${n > 1 ? ` (${n})` : ""}`;
      })
  );
  if (partes.length === 0) return "";
  return `${partes.length === 1 && !varios ? "talla " : partes.length > 1 && !varios ? "tallas " : ""}${partes.join(" · ")}`;
}
