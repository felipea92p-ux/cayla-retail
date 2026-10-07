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

/** Cuántas tallas (de todos los colores) no tienen NINGUNA colgada libre y sí algo libre en almacén: lo físico, sin el motor. */
export function tallasSinColgar(colores: readonly { tallas: readonly Pick<FilaPrenda, "pisoDisponible" | "almacenDisponible">[] }[]): number {
  return colores.reduce((s, c) => s + c.tallas.filter((t) => Math.max(0, t.pisoDisponible ?? 0) === 0 && Math.max(0, t.almacenDisponible ?? 0) > 0).length, 0);
}
