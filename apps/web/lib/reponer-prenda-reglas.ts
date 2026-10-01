/**
 * «Reponer piso» por PRENDA (modelo + color): las reglas puras de la ventana, sin React ni supabase, para probarlas.
 *
 * EL PROBLEMA. El botón «Reponer» de la tarjeta (y «Reponer a piso» del cajón) abría una ventana para UNA sola talla —la
 * primera que se podía bajar—: con la S y la M por colgar, la M no aparecía y para bajarla había que cerrar y volver a
 * empezar. Además la ventana mostraba el SKU y «disponible en piso / en almacén» en voz de sistema.
 *
 * CONTRATO. La ventana lista TODAS las tallas de la prenda, la persona elige cuántas baja de cada una, y al confirmar se
 * llama UNA vez a `bajar_al_piso` (todo o nada, con marca de reintento: ADR-0208), nunca una llamada por talla. Asume que
 * las cifras que recibe son lo DISPONIBLE (neto de lo apartado para clientas), que es lo único que la base deja mover.
 * No sugiere cuántas bajar (ADR-0231): arranca en cero y la cifra la pone quien tiene la prenda en la mano.
 */

import { BOTON_CONFIRMAR_DE_NUEVO, type LineaBajada } from "./bajada-reglas";
import type { FilaPrenda } from "./existencias-prendas";

/** Lo mínimo de cada talla que necesita la ventana; una fila de Existencias lo satisface por estructura. */
export type FilaDeTalla = Pick<FilaPrenda, "varianteId" | "talla" | "pisoDisponible" | "almacenDisponible">;

/** Una talla tal como la lee la ventana: sin nulos, para que ninguna cuenta dependa de `?? 0` regado por el JSX. */
export type TallaParaReponer = { varianteId: string; talla: string; piso: number; almacen: number };

/** Cuánto lleva cada talla en el selector, por variante. Lo que no está aquí es 0. */
export type Cantidades = Readonly<Record<string, number>>;

/** Hacia dónde van las prendas: «bajar» = del almacén al piso («Reponer»); «subir» = del piso al almacén («Subir a almacén»). */
export type Rumbo = "bajar" | "subir";

/** Una fila del selector de tallas, ya dicha en voz de tienda: la comparten «Reponer» y «Subir a almacén». */
export type FilaDelSelector = {
  varianteId: string;
  talla: string;
  /** Lo máximo que se puede mover de esta talla (lo libre del lugar de donde sale). 0 = no se ofrece el control. */
  tope: number;
  /** La cifra del lugar de donde SALEN las prendas: es la que manda. */
  principal: string;
  /** La cifra del otro lugar, más tenue. */
  secundaria: string;
};

const cifra = (n: number, lugar: string) => (n > 0 ? `${n} en ${lugar}` : `Nada en ${lugar}`);

/** Las filas del selector para un rumbo: lo que sale va primero y manda el tope. */
export function filasDelSelector(tallas: readonly TallaParaReponer[], rumbo: Rumbo): FilaDelSelector[] {
  return tallas.map((t) =>
    rumbo === "bajar"
      ? { varianteId: t.varianteId, talla: t.talla, tope: t.almacen, principal: cifra(t.almacen, "almacén"), secundaria: cifra(t.piso, "el piso") }
      : { varianteId: t.varianteId, talla: t.talla, tope: t.piso, principal: cifra(t.piso, "el piso"), secundaria: cifra(t.almacen, "almacén") }
  );
}

/** Todas las tallas de la prenda, en el orden en que llegan (ya vienen en curva: `agruparPorPrenda`). Sin tope ni filtro:
 *  una talla sin nada en el almacén también se lista, para que quien la busca vea POR QUÉ no se puede bajar. */
export function tallasParaReponer(filas: readonly FilaDeTalla[]): TallaParaReponer[] {
  return filas.map((f) => ({
    varianteId: f.varianteId,
    talla: f.talla?.trim() || "Única",
    piso: Math.max(0, f.pisoDisponible ?? 0),
    almacen: Math.max(0, f.almacenDisponible ?? 0),
  }));
}

/** Se puede bajar si hay algo LIBRE en el almacén. No pide que «Acción hoy» diga reponer: quien ve una talla con 3 en el
 *  piso y 4 atrás puede querer subir una más, y la base solo exige que haya. */
export function sePuedeBajarTalla(t: Pick<TallaParaReponer, "almacen">): boolean {
  return t.almacen > 0;
}

/** Se puede subir al almacén si hay algo LIBRE en el piso (lo apartado para una clienta no se mueve). */
export function sePuedeSubirTalla(t: Pick<TallaParaReponer, "piso">): boolean {
  return t.piso > 0;
}

export function cantidadDe(cantidades: Cantidades, varianteId: string): number {
  return cantidades[varianteId] ?? 0;
}

/** Un entero entre 0 y el tope: el «+» no pasa de lo que hay y el «−» no baja de cero. */
export function acotarCantidad(n: number, tope: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(0, Math.trunc(n)), Math.max(0, Math.trunc(tope)));
}

/** Lo que la persona teclea en la cajita del número: lo que no es número cuenta como cero, y nunca pasa del tope. */
export function leerCantidadTecleada(texto: string, tope: number): number {
  const solo = texto.replace(/\D/g, "");
  return solo === "" ? 0 : acotarCantidad(Number(solo), tope);
}

/** Las líneas que viajan a la base: solo las tallas con algo elegido, en el orden de la curva, recortadas al tope del lugar
 *  de donde salen (el almacén al bajar, el piso al subir). */
export function lineasDeMover(tallas: readonly TallaParaReponer[], cantidades: Cantidades, rumbo: Rumbo): LineaBajada[] {
  const lineas: LineaBajada[] = [];
  for (const t of tallas) {
    const cantidad = acotarCantidad(cantidadDe(cantidades, t.varianteId), rumbo === "bajar" ? t.almacen : t.piso);
    if (cantidad > 0) lineas.push({ varianteId: t.varianteId, cantidad });
  }
  return lineas;
}

/** «Reponer»: del almacén al piso. */
export const lineasDeReponer = (tallas: readonly TallaParaReponer[], cantidades: Cantidades): LineaBajada[] => lineasDeMover(tallas, cantidades, "bajar");

export function totalAReponer(lineas: readonly LineaBajada[]): number {
  return lineas.reduce((suma, l) => suma + l.cantidad, 0);
}

/** El botón: dice cuánto se va a bajar apenas hay algo elegido, y tras un corte de red pide confirmar lo mismo de nuevo. */
export function textoBotonReponer(total: number, congelado: boolean): string {
  if (congelado) return BOTON_CONFIRMAR_DE_NUEVO;
  if (total <= 0) return "Bajar al piso";
  return total === 1 ? "Bajar 1 prenda" : `Bajar ${total} prendas`;
}

/** «Body Bonita · Beige»: la prenda como la nombra la tienda, sin código. */
export function nombreDePrendaParaReponer(p: { referencia: string; color: string | null }): string {
  const color = p.color?.trim();
  return color ? `${p.referencia} · ${color}` : p.referencia;
}

/** «S 1 · M 2»: qué se bajó, talla por talla, para el aviso de éxito. */
export function detalleDeLoBajado(tallas: readonly TallaParaReponer[], lineas: readonly LineaBajada[]): string {
  const talla = new Map(tallas.map((t) => [t.varianteId, t.talla]));
  return lineas.map((l) => `${talla.get(l.varianteId) ?? "?"} ${l.cantidad}`).join(" · ");
}

/** Lo que dice una fila cuando la base le contestó que ya no hay tanto. `motivo` viene de `bajar_al_piso` / `retirar_del_piso`;
 *  `lugar` es de donde salen las prendas (el almacén al bajar, el piso al subir). */
export function textoFilaSinAlcance(hay: number, motivo: string, lugar: "almacén" | "piso" = "almacén"): string {
  if (motivo === "archivada") return "Esta talla está archivada: no se baja al piso.";
  if (motivo === "no_existe") return "Esta talla ya no existe en el catálogo.";
  if (motivo === "no_es_prenda") return "Esto no es una prenda real: no se mueve.";
  const en = lugar === "piso" ? "el piso" : "el almacén";
  return hay === 0 ? `Ya no queda nada libre en ${en}.` : hay === 1 ? `Solo queda 1 libre en ${en}.` : `Solo quedan ${hay} libres en ${en}.`;
}
