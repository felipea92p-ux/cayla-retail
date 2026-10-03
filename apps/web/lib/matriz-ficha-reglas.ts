// La matriz color × talla de Editar producto (maqueta B «Panel del taller», docs/maquetas/producto-editar-rediseno-2026-10/,
// elegida por Felipe el 2026-10-02) — sin React ni red.
//
// CONTRATO
//   PROMETE: armar las filas (colores activos, en el orden de la ficha) y columnas (tallas activas, en orden de curva) de la
//            matriz; el número de cada celda (el stock de HOY en el lugar que se ajusta, más lo que la persona ya tocó y todavía
//            no viaja); los totales por color, por talla y general; y el lote que se manda a `ajustar_inventario`.
//   ASUME:   el stock llega por `VarianteAjuste` (la misma lectura que `AjustarInventarioModal`), acotado a la sede activa.
//   NO HACE: no escribe stock. El stepper es el ajuste de siempre (ADR-0240, `ajustar_inventario`): lo tocado se junta y viaja
//            UNA vez, al confirmar «Revisar y guardar» (ADR-0313, act. 2026-10-02 noche), con su motivo y su responsable; `stock`
//            sigue siendo un snapshot de `movimientos` (principio 4).

import { compararTallas } from "./tallas";
import { apartadoEn, lineasDeAjuste, modoDeAjuste, stockEn, type LineaAjuste, type LugarAjuste, type MotivoAjuste, type VarianteAjuste } from "./ajuste-reglas";
import type { FilaFicha, NombresFicha } from "./variantes-ficha-reglas";

export type MatrizFicha = {
  /** Colores con alguna variante activa, en el orden en que aparecen en la ficha. */
  colores: (string | null)[];
  /** Tallas con alguna variante activa, en orden de curva (S · M · L, 28 · 30). */
  tallas: (string | null)[];
  /** La fila activa de cada celda; `undefined` = esa combinación no existe (o está desactivada). */
  celda: (color: string | null, talla: string | null) => FilaFicha | undefined;
};

export function armarMatriz(filas: readonly FilaFicha[], n: NombresFicha): MatrizFicha {
  const activas = filas.filter((f) => f.activo);
  const colores: (string | null)[] = [];
  const tallas: (string | null)[] = [];
  for (const f of activas) {
    if (!colores.includes(f.colorCodigo)) colores.push(f.colorCodigo);
    if (!tallas.includes(f.tallaId)) tallas.push(f.tallaId);
  }
  tallas.sort((a, b) => {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return compararTallas(n.talla(a), n.talla(b));
  });
  const porClave = new Map(activas.map((f) => [`${f.colorCodigo ?? ""}|${f.tallaId ?? ""}`, f]));
  return { colores, tallas, celda: (c, t) => porClave.get(`${c ?? ""}|${t ?? ""}`) };
}

/** Lo que la persona tocó y todavía no viajó (o está viajando), por variante guardada: +2, −1. */
export type Pendientes = Readonly<Record<string, number>>;

/** El número de una celda guardada: el stock de hoy en el lugar, más lo tocado. Sin lectura de stock (todavía cargando), 0. */
export function cantidadDeCelda(v: VarianteAjuste | undefined, lugar: LugarAjuste, pendiente: number): number {
  return (v ? stockEn(v, lugar) : 0) + pendiente;
}

/** El piso de una celda: no baja de cero ni de lo apartado para clientas (los dos candados de `fn_aplicar_movimiento`). */
export function minimoDeCelda(v: VarianteAjuste | undefined, lugar: LugarAjuste): number {
  return v ? apartadoEn(v, lugar) : 0;
}

/** Lo tocado tras un «−» o un «+»; `null` si ese toque dejaría la celda debajo de su piso. */
export function pasoDeCelda(actual: number, pendiente: number, paso: 1 | -1, minimo: number): number | null {
  const siguiente = pendiente + paso;
  if (actual + siguiente < minimo) return null;
  return siguiente;
}

/** Lo tocado para que la celda muestre `objetivo` (el número que se escribió en ella); `null` si no es un entero de 0 en
 *  adelante o si queda debajo de su piso (lo apartado para clientas no se puede contar como que no está). */
export function fijarCelda(actual: number, objetivo: number, minimo: number): number | null {
  if (!Number.isInteger(objetivo) || objetivo < 0 || objetivo < minimo) return null;
  return objetivo - actual;
}

/** Un cambio de stock de una variante guardada, como lo lee la hoja «Revisa y guarda»: de cuánto a cuánto. */
export type CambioDeStock = { varianteId: string; color: string | null; talla: string | null; antes: number; despues: number };

/** Lo tocado en las variantes guardadas, en el orden de la lectura (por talla y color). Lo que volvió a su número no cuenta. */
export function cambiosDeStock(variantes: readonly VarianteAjuste[], pendientes: Pendientes, lugar: LugarAjuste): CambioDeStock[] {
  return variantes.flatMap((v) => {
    const d = pendientes[v.varianteId];
    if (!d) return [];
    const antes = stockEn(v, lugar);
    return [{ varianteId: v.varianteId, color: v.color, talla: v.talla, antes, despues: antes + d }];
  });
}

/** El grupo «Stock» de la hoja: una línea por talla («S · Blanco  4 → 6») y una nota con el motivo y el lugar. */
export function grupoDeStockEnHoja(
  cambios: readonly CambioDeStock[],
  motivo: string,
  donde: string
): { titulo: string; lineas: { texto: string; antes: string; despues: string }[]; nota: string } | null {
  if (cambios.length === 0) return null;
  const sube = cambios.filter((c) => c.despues > c.antes).reduce((s, c) => s + (c.despues - c.antes), 0);
  return {
    titulo: "Stock",
    lineas: cambios.map((c) => ({ texto: [c.talla ?? "Única", c.color].filter(Boolean).join(" · "), antes: String(c.antes), despues: String(c.despues) })),
    nota: `Se registra como «${motivo}» ${donde}.${sube > 0 ? ` Entran ${sube} ${sube === 1 ? "unidad" : "unidades"}: al guardar te propone imprimir sus etiquetas.` : ""}`,
  };
}

/** Lo que subió al guardar, por variante (cuántas unidades nuevas, para imprimir justo esas etiquetas). Se suma si se repite. */
export type Subida = { varianteId: string; color: string | null; talla: string | null; unidades: number };

export function juntarSubidas(antes: readonly Subida[], nuevas: readonly Subida[]): Subida[] {
  const salida = antes.map((s) => ({ ...s }));
  for (const n of nuevas) {
    if (!(n.unidades > 0)) continue;
    const ya = salida.find((s) => s.varianteId === n.varianteId);
    if (ya) ya.unidades += n.unidades;
    else salida.push({ ...n });
  }
  return salida;
}

/** «Imprimir etiquetas» de lo que subió: una etiqueta por unidad nueva, no por todo el stock de la tienda (`?unidades=id:n`). */
export function hrefEtiquetasDeSubidas(subidas: readonly Subida[]): string | null {
  const con = subidas.filter((s) => s.unidades > 0);
  if (con.length === 0) return null;
  return `/etiquetas-de-precio?unidades=${con.map((s) => `${s.varianteId}:${s.unidades}`).join(",")}`;
}

/** Suma un paso a lo pendiente; lo que vuelve a 0 deja de estar pendiente. */
export function conPaso(p: Pendientes, varianteId: string, siguiente: number): Record<string, number> {
  const salida = { ...p };
  if (siguiente === 0) delete salida[varianteId];
  else salida[varianteId] = siguiente;
  return salida;
}

/**
 * El lote que viaja a `ajustar_inventario`: las mismas líneas que arma el modal (`lineasDeAjuste`), escritas como las escribiría
 * una persona en él. Con «Conteo físico» el modal pide CUÁNTAS HAY (el stock de la pantalla más lo tocado); con los demás
 * motivos, cuánto se suma o se resta. La base guarda siempre la diferencia, así que el resultado es el mismo con cualquier motivo.
 */
export function lineasDelLote(variantes: readonly VarianteAjuste[], pendientes: Pendientes, lugar: LugarAjuste, motivo: MotivoAjuste): LineaAjuste[] {
  const modo = modoDeAjuste(motivo);
  const cantidades: Record<string, string> = {};
  for (const v of variantes) {
    const d = pendientes[v.varianteId];
    if (!d) continue;
    cantidades[v.varianteId] = String(modo === "contado" ? stockEn(v, lugar) + d : d);
  }
  return lineasDeAjuste(variantes, cantidades, lugar, modo);
}

/** Totales de la matriz con lo que cada celda muestra: por color, por talla y general. */
export function totalesMatriz(m: MatrizFicha, numero: (f: FilaFicha) => number): { porColor: Map<string | null, number>; porTalla: Map<string | null, number>; total: number } {
  const porColor = new Map<string | null, number>();
  const porTalla = new Map<string | null, number>();
  let total = 0;
  for (const c of m.colores) {
    for (const t of m.tallas) {
      const f = m.celda(c, t);
      if (!f) continue;
      const u = numero(f);
      porColor.set(c, (porColor.get(c) ?? 0) + u);
      porTalla.set(t, (porTalla.get(t) ?? 0) + u);
      total += u;
    }
  }
  return { porColor, porTalla, total };
}

/** Cómo se pinta la barra de una talla en el panel: vacía en 0, en ámbar con 3 o menos (se acaba), en verde si hay. */
export function tonoDeBarra(unidades: number): "cero" | "bajo" | "normal" {
  return unidades <= 0 ? "cero" : unidades <= 3 ? "bajo" : "normal";
}

/** «9 variantes activas · S/ 69–89»: lo que dice la cabecera de «Variantes y precios» plegada o abierta. */
export function resumenVariantes(filas: readonly FilaFicha[]): string {
  const activas = filas.filter((f) => f.activo);
  const precios = activas.map((f) => Number(f.precio)).filter((p) => p > 0);
  const partes = [`${activas.length} ${activas.length === 1 ? "variante activa" : "variantes activas"}`];
  if (precios.length > 0) partes.push(rangoDePrecios(precios));
  return partes.join(" · ");
}

/** «S/ 69» si todas valen lo mismo, «S/ 69–89» si no. Con céntimos solo si alguno los tiene. */
export function rangoDePrecios(precios: readonly number[]): string {
  const min = Math.min(...precios);
  const max = Math.max(...precios);
  const conCentimos = precios.some((p) => !Number.isInteger(p));
  const f = (p: number) => (conCentimos ? p.toFixed(2) : String(p));
  return min === max ? `S/ ${f(min)}` : `S/ ${f(min)}–${f(max)}`;
}
