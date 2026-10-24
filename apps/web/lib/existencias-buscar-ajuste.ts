/* ====================================================================
   «Ajustar stock» desde la cabecera de Existencias (ADR-0494, actividad 1 de «El stock se carga en Existencias», Felipe 2026-10-23)

   El botón de la cabecera pregunta «¿Qué prenda vas a ajustar?» y lista los MODELOS que coinciden con lo escrito (o escaneado): uno
   por producto, con la talla en la que entra la planilla —la primera de la curva; si se escribió un código, exactamente esa—. Usa
   el mismo índice que el buscador de Existencias (`indiceDeExistencias`: nombre, código, códigos de barras, color, talla, marca y
   categoría), así que encuentra lo mismo. Lógica pura, con su prueba.

   Hoy lista lo que esta sede tiene (o tuvo): una prenda que la tienda nunca tuvo es la actividad 2.
   ==================================================================== */

import { clavePercha } from "./inventario-reglas";
import { compararTallas } from "./tallas";
import { filtrarConBusquedaEspecial, type IndiceBusquedaEspecial } from "./filtro-busqueda-especial";

type FilaBuscable = {
  varianteId: string;
  productoId: string;
  referencia: string;
  color: string | null;
  talla: string | null;
  pisoDisponible: number | null;
  almacenDisponible: number | null;
  disponible: number;
};

/** Un modelo que coincide: con qué color y talla entra la planilla, y lo que tiene la sede. */
export type ModeloParaAjustar<F> = {
  productoId: string;
  referencia: string;
  /** La prenda (modelo + color) y la talla en que entra: con un código, esa talla; con un nombre, la primera de la curva del primer
   *  color que coincidió (S antes que M, aunque la lista venga por código: «…-L» antes que «…-S»). */
  clave: string;
  varianteId: string;
  /** La fila de esa talla (para la miniatura y el nombre del color). */
  fila: F;
  colores: number;
  /** Lo libre del modelo entero en la sede: en piso, en almacén (`null` donde no se separan) y en total. */
  piso: number | null;
  almacen: number | null;
  disponible: number;
};

/** Cuántos modelos se listan, como mucho: lo que se elige está arriba (orden por relevancia). */
export const TOPE_MODELOS = 8;

export function modelosParaAjustar<F extends FilaBuscable>(indice: IndiceBusquedaEspecial<F>, consulta: string, tope = TOPE_MODELOS): ModeloParaAjustar<F>[] {
  if (!consulta.trim()) return [];
  const { filas } = filtrarConBusquedaEspecial(indice, consulta, {}, { ordenar: "relevancia", grupo: (f) => f.productoId });
  const porProducto = new Map<string, ModeloParaAjustar<F>>();
  for (const primera of filas) {
    if (porProducto.has(primera.productoId)) continue;
    const delModelo = indice.entradas.map((e) => e.fila).filter((x) => x.productoId === primera.productoId);
    // Lo que coincidió de este modelo y de su primer color, por la curva. Un código deja una sola: esa.
    const f = filas
      .filter((x) => x.productoId === primera.productoId && x.color === primera.color)
      .sort((a, b) => (a.talla === null || b.talla === null ? (a.talla === b.talla ? 0 : a.talla === null ? 1 : -1) : compararTallas(a.talla, b.talla)))[0]!;
    const separa = delModelo.some((x) => x.pisoDisponible !== null);
    porProducto.set(f.productoId, {
      productoId: f.productoId,
      referencia: f.referencia,
      clave: clavePercha(f),
      varianteId: f.varianteId,
      fila: f,
      colores: new Set(delModelo.map((x) => x.color)).size,
      piso: separa ? delModelo.reduce((s, x) => s + Math.max(0, x.pisoDisponible ?? 0), 0) : null,
      almacen: separa ? delModelo.reduce((s, x) => s + Math.max(0, x.almacenDisponible ?? 0), 0) : null,
      disponible: delModelo.reduce((s, x) => s + Math.max(0, x.disponible), 0),
    });
    if (porProducto.size >= tope) break;
  }
  return [...porProducto.values()];
}

/** La línea bajo el nombre: «3 colores · 14 en piso · 20 en almacén» (o «8 en la sede» donde no se separan). */
export function detalleDelModelo(m: Pick<ModeloParaAjustar<unknown>, "colores" | "piso" | "almacen" | "disponible">): string {
  const colores = `${m.colores} ${m.colores === 1 ? "color" : "colores"}`;
  if (m.piso === null || m.almacen === null) return `${colores} · ${m.disponible} en la sede`;
  return `${colores} · ${m.piso} en piso · ${m.almacen} en almacén`;
}
