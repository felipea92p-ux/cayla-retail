/* ====================================================================
   «Colgar varias» como tabla tallas × colores (2026-10-07, maqueta `docs/maquetas/existencias-tarjeta-cajon-2026-10/`, `LOGICA.md`
   §2.5 bis; el mismo dibujo que la tabla de cantidades de Nuevo producto). Lógica pura, con su prueba: qué dice cada celda, los
   totales y los atajos de la barra. El paso (`FlujoTalla`) solo la dibuja; lo que viaja a la base sigue siendo `lineasDeMoverModelo`.

   - Cabecera: las tallas; izquierda: los colores. Una celda por talla existente de cada color.
   - Celda con algo libre en almacén: se edita (de 0 a lo que hay en almacén, nunca más). Dice «falta en el piso» si el motor del piso
     la pide (`tallasQueFaltan`) o, si no, cuántas hay ya colgadas.
   - Sin nada en almacén: no se edita. Si queda algo colgado, lo dice; si no queda nada libre en la sede, «Se acabó» (rojo).
   - «Solo lo que falta» = 1 en cada talla que el motor pide (mínimo 1 colgada por talla, confirmado por Felipe el 2026-10-07). Con el
     piso en pausa el motor no pide nada (ADR-0328, decisión 5) y la tabla no se llena sola.
   ==================================================================== */

import type { FilaPrenda } from "./existencias-prendas";

type Talla = Pick<FilaPrenda, "varianteId" | "pisoDisponible" | "almacenDisponible">;

export type CeldaColgar =
  | { tipo: "editable"; falta: boolean; piso: number; almacen: number }
  | { tipo: "sinAlmacen"; piso: number }
  | { tipo: "acabo" };

export function celdaColgarVarias(t: Talla, faltan: ReadonlySet<string>): CeldaColgar {
  const piso = Math.max(0, t.pisoDisponible ?? 0);
  const almacen = Math.max(0, t.almacenDisponible ?? 0);
  if (almacen > 0) return { tipo: "editable", falta: faltan.has(t.varianteId), piso, almacen };
  return piso > 0 ? { tipo: "sinAlmacen", piso } : { tipo: "acabo" };
}

/* «Subir varias» (2026-10-08, Felipe: «Subir a almacén debería ser de todas, como Colgar en el piso»): la MISMA tabla, al revés. Se
   edita la celda con algo libre colgado (de 0 a lo que hay en el piso); sin nada colgado dice cuántas hay en almacén, y sin nada libre
   en la sede, «Se acabó». No se llena sola (ADR-0231: la cifra la pone quien tiene la prenda en la mano). */
export type CeldaSubir =
  | { tipo: "editable"; piso: number; almacen: number }
  | { tipo: "sinPiso"; almacen: number }
  | { tipo: "acabo" };

export function celdaSubirVarias(t: Talla): CeldaSubir {
  const piso = Math.max(0, t.pisoDisponible ?? 0);
  const almacen = Math.max(0, t.almacenDisponible ?? 0);
  if (piso > 0) return { tipo: "editable", piso, almacen };
  return almacen > 0 ? { tipo: "sinPiso", almacen } : { tipo: "acabo" };
}

/** «Llenar todas con N»: N en cada celda editable, recortado a lo que hay donde salen (el almacén al colgar, el piso al subir).
 *  Vacío = todas en 0. */
export function llenarTodasCon(tallas: readonly Talla[], n: number | null, rumbo: "bajar" | "subir" = "bajar"): Record<string, number> {
  const cant: Record<string, number> = {};
  for (const t of tallas) {
    const hay = Math.max(0, (rumbo === "subir" ? t.pisoDisponible : t.almacenDisponible) ?? 0);
    if (hay > 0) cant[t.varianteId] = n === null ? 0 : Math.min(hay, Math.max(0, n));
  }
  return cant;
}

/** Los totales de la tabla: por color (fila), por talla (columna) y el general. */
export function totalesColgar(colores: readonly { clave: string; tallas: readonly (Talla & { talla: string | null })[] }[], cant: Readonly<Record<string, number>>) {
  const porColor: Record<string, number> = {};
  const porTalla: Record<string, number> = {};
  let total = 0;
  for (const c of colores) {
    for (const t of c.tallas) {
      const n = Math.max(0, cant[t.varianteId] ?? 0);
      porColor[c.clave] = (porColor[c.clave] ?? 0) + n;
      const k = t.talla ?? "Única";
      porTalla[k] = (porTalla[k] ?? 0) + n;
      total += n;
    }
  }
  const tallas = new Set(colores.flatMap((c) => c.tallas.filter((t) => (cant[t.varianteId] ?? 0) > 0).map((t) => t.varianteId))).size;
  return { porColor, porTalla, total, tallas };
}
