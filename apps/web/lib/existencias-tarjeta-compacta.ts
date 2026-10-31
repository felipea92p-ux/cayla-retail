/* ====================================================================
   La tarjeta compacta de Existencias (maqueta `docs/maquetas/existencias-tarjeta-cajon-2026-10/`, contrato en su `LOGICA.md`,
   aprobada por Felipe el 2026-10-07). Lógica pura: qué dice cada celda de la tabla «En el piso / Almacén», adónde lleva tocar una
   talla y en qué talla abre el cajón un toque en cualquier otra parte. El componente (`ExistenciasTarjetas`) solo la dibuja.

   No decide nada nuevo: el estado de la talla es `estadoTalla` (el motor del piso detrás) y las cifras son las LIBRES de la fila
   (lo apartado y lo dañado no cuentan), las mismas de la tabla y del cajón.
   ==================================================================== */

import { estadoTalla, type FilaPrenda } from "./existencias-prendas";

/** Cómo se pinta una columna de talla: «agotada» = no queda nada libre en la sede (rojo); «falta» = 0 colgadas y algo en almacén
 *  (la celda del piso en ámbar); «normal» = lo demás. */
export type EstadoColumna = "agotada" | "falta" | "normal";

export type CeldaTarjeta = {
  estado: EstadoColumna;
  /** Libres colgadas (en una sede que no separa: lo disponible). */
  piso: number;
  /** Libres en almacén (0 donde no se separa). */
  almacen: number;
};

type FilaCelda = Pick<FilaPrenda, "pisoDisponible" | "almacenDisponible" | "disponible" | "planPiso" | "apartado" | "danado" | "enTransito">;

export function celdaTarjeta(f: FilaCelda, separa: boolean): CeldaTarjeta {
  const e = estadoTalla(f as FilaPrenda);
  const piso = separa ? Math.max(0, f.pisoDisponible ?? 0) : Math.max(0, f.disponible);
  const almacen = separa ? Math.max(0, f.almacenDisponible ?? 0) : 0;
  return { estado: e === "sin_stock" ? "agotada" : e === "por_colgar" ? "falta" : "normal", piso, almacen };
}

/** La línea chica bajo el número grande de cada columna (ADR-0391, Felipe 2026-10-12): el número grande es lo COLGADO (lo que el
 *  cliente puede comprar) y debajo va lo del almacén, con las palabras del modal («+2 en almacén»; Felipe, 2026-10-13: antes «+2
 *  guardadas»). Con 3 tallas o más las palabras no caben y queda solo el número («+2», «0»): la leyenda del pie las pone. Antes el
 *  corte era en 4 (la tira medía 304 px); desde la tarjeta Vitrina (ADR-0589) la tira va al lado de la foto y mide ~224 px, y con 3
 *  tallas «0 en almacén» se cortaba a media palabra (medido). Agotada: «se acabó» («acabó» apretado).
 *  `cero` = no hay nada en el almacén: la línea va toda en taupe y sin negrita, para que un «0 en almacén» no pese lo mismo que un «+3»
 *  (en taupe pleno, no atenuado: el auditor del tema midió 2,3:1 con `taupe/55` y un 0 también se tiene que leer). */
export function lineaGuardadas(c: Pick<CeldaTarjeta, "estado" | "almacen">, tallasEnTarjeta: number): { texto: string; cero: boolean } {
  const apretada = tallasEnTarjeta >= 3;
  if (c.estado === "agotada") return { texto: apretada ? "acabó" : "se acabó", cero: false };
  if (c.almacen === 0) return { texto: apretada ? "0" : "0 en almacén", cero: true };
  return { texto: apretada ? `+${c.almacen}` : `+${c.almacen} en almacén`, cero: false };
}

/** Tocar una talla de la tarjeta: si hay algo en almacén y la persona puede colgar, el cajón abre LISTO PARA COLGAR esa talla
 *  (Felipe, 2026-10-07); si no, abre la talla para verla. */
export function destinoDeTalla(f: Pick<FilaPrenda, "almacenDisponible">, o: { separa: boolean; puedeReponer: boolean }): "colgar" | "ver" {
  return o.separa && o.puedeReponer && Math.max(0, f.almacenDisponible ?? 0) > 0 ? "colgar" : "ver";
}

/** Un toque en cualquier otra parte de la tarjeta abre el cajón en la talla que más importa: la primera que falta en el piso, si no
 *  la primera agotada, si no la primera. `preferida` (la del filtro puesto) gana a todas. */
export function tallaDeEntrada<F extends FilaCelda>(tallas: readonly F[], preferida?: F): F | undefined {
  if (preferida) return preferida;
  return tallas.find((t) => estadoTalla(t as unknown as FilaPrenda) === "por_colgar") ?? tallas.find((t) => estadoTalla(t as unknown as FilaPrenda) === "sin_stock") ?? tallas[0];
}

/** Las tallas agotadas del color que se ve, por su nombre: el pie de la tarjeta las dice («Se acabó: L»). */
export function tallasAgotadas(tallas: readonly (FilaCelda & Pick<FilaPrenda, "talla">)[]): string[] {
  return tallas.filter((t) => estadoTalla(t as unknown as FilaPrenda) === "sin_stock").map((t) => t.talla ?? "Única");
}

/** Cuántas tallas (de todos los colores) no tienen NINGUNA colgada libre y sí algo libre en almacén: lo físico, sin el motor. Una talla que
 *  el motor manda «mantener» no cuenta (ya decidió que así está bien), igual que en la línea «Faltan en el piso» (`loQueFaltaEnElPiso`). */
export function tallasSinColgar(colores: readonly { tallas: readonly (Pick<FilaPrenda, "pisoDisponible" | "almacenDisponible"> & { planPiso?: FilaPrenda["planPiso"] })[] }[]): number {
  return colores.reduce(
    (s, c) => s + c.tallas.filter((t) => (t.planPiso?.accion ?? null) !== "mantener" && Math.max(0, t.pisoDisponible ?? 0) === 0 && Math.max(0, t.almacenDisponible ?? 0) > 0).length,
    0
  );
}

/** El color que la tarjeta muestra si la persona no eligió otro (Felipe, 2026-10-07: una tarjeta que abría en un color agotado se veía
 *  vacía mientras el botón decía «2 tallas»): el primero con algo que colgar, si no el primero con algo libre, si no el primero.
 *  Desde el 2026-10-08 (Felipe) un color CON FOTO va primero dentro de cada escalón, y uno con foto y algo libre le gana a uno sin
 *  foto con algo que colgar: la foto principal es la prenda real. Un color con foto pero agotado no le gana a uno con algo libre. */
export function colorDeEntrada<C extends { tallas: readonly FilaCelda[]; fotoUrl?: string | null }>(colores: readonly C[], faltan: ReadonlySet<string> = new Set()): C | undefined {
  const porColgar = (c: C) => c.tallas.some((t) => faltan.has((t as { varianteId?: string }).varianteId ?? "") || (Math.max(0, t.pisoDisponible ?? 0) === 0 && Math.max(0, t.almacenDisponible ?? 0) > 0));
  const conAlgo = (c: C) => c.tallas.some((t) => estadoTalla(t as unknown as FilaPrenda) !== "sin_stock");
  const conFoto = (c: C) => !!c.fotoUrl;
  return (
    colores.find((c) => conFoto(c) && porColgar(c)) ??
    colores.find((c) => conFoto(c) && conAlgo(c)) ??
    colores.find(porColgar) ??
    colores.find(conAlgo) ??
    colores.find(conFoto) ??
    colores[0]
  );
}

/** La chapa de colores de la tarjeta Vitrina (ADR-0589): una sola línea sobre la foto. Hasta 5 colores caben todos; con 6 o más, 3 y
 *  «+N» (medido: 4 puntos y un «+10» se pasaban de los 86 px de la chapa). «+N» abre el modal de la prenda, que ya muestra todos los
 *  colores (Felipe 2026-10-31): la chapa nunca se abre ni crece.
 *  El color que se ve tiene que estar a la vista: si quedó fuera de los tres primeros (el de entrada puede ser el sexto), ocupa el
 *  tercer lugar. Los dos primeros no se mueven nunca, para que un punto no se corra debajo del mouse. */
export const COLORES_EN_CHAPA = 5;
export function coloresDeChapa<C extends { clave: string }>(colores: readonly C[], claveQueSeVe: string | undefined): { visibles: C[]; ocultos: number } {
  if (colores.length <= COLORES_EN_CHAPA) return { visibles: [...colores], ocultos: 0 };
  const tres = colores.slice(0, 3);
  const elegido = colores.find((c) => c.clave === claveQueSeVe);
  const visibles = elegido && !tres.includes(elegido) ? [tres[0], tres[1], elegido] : tres;
  return { visibles, ocultos: colores.length - visibles.length };
}

/** El filo de color en el canto de la tarjeta Vitrina: «agotada» si alguna talla del color que se ve se acabó en la sede, «falta» si
 *  alguna tiene 0 colgadas y algo en almacén; si no, nada. Lo mismo que ya pintan las celdas de la tira (`celdaTarjeta`): se ve de lejos. */
export function filoDeTarjeta(tallas: readonly FilaCelda[], separa: boolean): "agotada" | "falta" | null {
  const estados = tallas.map((t) => celdaTarjeta(t, separa).estado);
  return estados.includes("agotada") ? "agotada" : estados.includes("falta") ? "falta" : null;
}
