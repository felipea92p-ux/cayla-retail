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
 *
 * UN MODELO, TODOS SUS COLORES (ADR-0317). «Reponer prenda» y «Subir prenda» abren la ventana con el MODELO entero: una fila por
 * color y una columna por talla (la misma tabla de Nuevo/Editar producto). Cada celda es una variante, así que `cantidades`,
 * `problemas` y las líneas siguen yendo por `varianteId` y la llamada a la base sigue siendo UNA, todo o nada.
 */

import { BOTON_CONFIRMAR_DE_NUEVO, type LineaBajada } from "./bajada-reglas";
import type { FilaPrenda } from "./existencias-prendas";
import { compararTallas } from "./tallas";

/** Un color del modelo tal como llega a la ventana: una prenda (modelo + color) con todas sus tallas. */
export type PrendaParaReponer = {
  referencia: string;
  color: string | null;
  colorHex: string | null;
  /** La foto de la prenda: va a la izquierda de la ventana. */
  fotoUrl?: string | null;
  tallas: readonly FilaDeTalla[];
};

/** Lo mínimo de cada talla que necesita la ventana; una fila de Existencias lo satisface por estructura. */
export type FilaDeTalla = Pick<FilaPrenda, "varianteId" | "talla" | "pisoDisponible" | "almacenDisponible">;

/** Una talla tal como la lee la ventana: sin nulos, para que ninguna cuenta dependa de `?? 0` regado por el JSX. */
export type TallaParaReponer = { varianteId: string; talla: string; piso: number; almacen: number };

/** Cuánto lleva cada talla en el selector, por variante. Lo que no está aquí es 0. */
export type Cantidades = Readonly<Record<string, number>>;

/** Hacia dónde van las prendas: «bajar» = del almacén al piso («Reponer»); «subir» = del piso al almacén («Subir a almacén»). */
export type Rumbo = "bajar" | "subir";

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

export function totalAReponer(lineas: readonly LineaBajada[]): number {
  return lineas.reduce((suma, l) => suma + l.cantidad, 0);
}

/** El botón: dice cuánto se va a bajar apenas hay algo elegido, y tras un corte de red pide confirmar lo mismo de nuevo. */
export function textoBotonReponer(total: number, congelado: boolean): string {
  if (congelado) return BOTON_CONFIRMAR_DE_NUEVO;
  if (total <= 0) return "Bajar al piso";
  return total === 1 ? "Bajar 1 prenda" : `Bajar ${total} prendas`;
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

/** Un color del modelo ya leído por la ventana: sin nulos, con la clave que lo distingue de los demás. */
export type ColorParaMover = { clave: string; nombre: string; hex: string | null; tallas: readonly TallaParaReponer[] };

/** Los colores del modelo, en el orden en que llegan. `clave` es el nombre: dos colores del mismo modelo no se llaman igual. */
export function coloresParaMover(prendas: readonly PrendaParaReponer[]): ColorParaMover[] {
  return prendas.map((p, i) => ({
    clave: `${i}:${p.color?.trim() || "sin-color"}`,
    nombre: p.color?.trim() || "Sin color",
    hex: p.colorHex,
    tallas: tallasParaReponer(p.tallas),
  }));
}

/** Las columnas de la tabla: las tallas de TODOS los colores, sin repetir y en curva (S · M · L, 36 · 38). Un color al que le falta
 *  una talla deja esa celda vacía; no se inventa. */
export function columnasDeTallas(colores: readonly Pick<ColorParaMover, "tallas">[]): string[] {
  const vistas = new Set<string>();
  for (const c of colores) for (const t of c.tallas) vistas.add(t.talla);
  return [...vistas].sort(compararTallas);
}

/** La celda de un color en una talla; `undefined` si ese color no tiene esa talla. */
export function tallaDelColor(color: Pick<ColorParaMover, "tallas">, talla: string): TallaParaReponer | undefined {
  return color.tallas.find((t) => t.talla === talla);
}

/** Lo máximo que se mueve de esta celda: lo libre del lugar de donde salen las prendas. */
export const topeDeTalla = (t: Pick<TallaParaReponer, "piso" | "almacen">, rumbo: Rumbo): number => (rumbo === "bajar" ? t.almacen : t.piso);

export type TotalesDeMatriz = { porColor: Record<string, number>; porTalla: Record<string, number>; total: number };

/** Lo elegido, sumado por color, por talla y en general. Cada celda cuenta recortada a su tope (lo que se ve es lo que se envía). */
export function totalesDeMatriz(colores: readonly ColorParaMover[], cantidades: Cantidades, rumbo: Rumbo): TotalesDeMatriz {
  const porColor: Record<string, number> = {};
  const porTalla: Record<string, number> = {};
  let total = 0;
  for (const c of colores) {
    porColor[c.clave] = 0;
    for (const t of c.tallas) {
      const n = acotarCantidad(cantidadDe(cantidades, t.varianteId), topeDeTalla(t, rumbo));
      porColor[c.clave] += n;
      porTalla[t.talla] = (porTalla[t.talla] ?? 0) + n;
      total += n;
    }
  }
  return { porColor, porTalla, total };
}

/** Lo que se movió, para el aviso de éxito: «S 1 · M 2» con un solo color; «Azul S 2, M 3 · Blanco S 2» con varios. */
export function detalleDeLoMovido(colores: readonly ColorParaMover[], lineas: readonly LineaBajada[]): string {
  const cantidad = new Map(lineas.map((l) => [l.varianteId, l.cantidad]));
  const partes = colores
    .map((c) => {
      const tallas = c.tallas.filter((t) => cantidad.has(t.varianteId)).map((t) => `${t.talla} ${cantidad.get(t.varianteId)}`);
      if (tallas.length === 0) return null;
      return colores.length > 1 ? `${c.nombre} ${tallas.join(", ")}` : tallas.join(" · ");
    })
    .filter((x): x is string => x !== null);
  return partes.join(" · ");
}

/** Cuántos colores del modelo llevan algo elegido: el resumen del pie («19 prendas · 3 colores»). */
export function coloresConAlgo(colores: readonly ColorParaMover[], totales: TotalesDeMatriz): number {
  return colores.filter((c) => (totales.porColor[c.clave] ?? 0) > 0).length;
}

/** Las líneas que viajan a la base: las de todos los colores juntas, en el orden de la tabla. UNA sola llamada, todo o nada. */
export function lineasDeMoverModelo(colores: readonly Pick<ColorParaMover, "tallas">[], cantidades: Cantidades, rumbo: Rumbo): LineaBajada[] {
  return colores.flatMap((c) => lineasDeMover(c.tallas, cantidades, rumbo));
}
