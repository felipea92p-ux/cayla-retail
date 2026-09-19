// Lógica pura de «etiquetar prendas» (la pantalla `PrendasDeEtiquetaModal` y, más
// adelante, el etiquetado en lote de Productos): qué está marcado, qué cambia y qué
// se le dice a la persona antes de aplicar. Sin React ni Supabase, para poder probarla.
//
// Se etiqueta por PRODUCTO (marca todas sus tallas y colores de un golpe) con
// excepciones por variante, pero lo que viaja a la base son ids de VARIANTE
// (`retail.etiquetar_variantes`, 20260919010000): el modelo por variante no cambia.

import { vigenciaDe } from "./etiqueta-vigencia";
import { normalizarNombre } from "./patron-visual";

export type VarianteEtiquetable = { id: string; talla: string | null; color: string | null };

export type ProductoEtiquetable = {
  id: string;
  referencia: string;
  descripcion: string | null;
  categoriaId: string | null;
  categoria: string;
  variantes: VarianteEtiquetable[];
};

export type EstadoMarca = "todas" | "algunas" | "ninguna";

export function estadoDe(p: ProductoEtiquetable, marcadas: ReadonlySet<string>): EstadoMarca {
  if (p.variantes.length === 0) return "ninguna";
  const n = p.variantes.filter((v) => marcadas.has(v.id)).length;
  return n === 0 ? "ninguna" : n === p.variantes.length ? "todas" : "algunas";
}

/** Un clic en el producto: si ya están todas, las suelta; si no, las marca todas
 *  (incluida la casilla «a medias»: el gesto natural ahí es completar). */
export function alternarProducto(p: ProductoEtiquetable, marcadas: ReadonlySet<string>): Set<string> {
  const siguiente = new Set(marcadas);
  if (estadoDe(p, marcadas) === "todas") p.variantes.forEach((v) => siguiente.delete(v.id));
  else p.variantes.forEach((v) => siguiente.add(v.id));
  return siguiente;
}

export function alternarVariante(id: string, marcadas: ReadonlySet<string>): Set<string> {
  const siguiente = new Set(marcadas);
  if (!siguiente.delete(id)) siguiente.add(id);
  return siguiente;
}

/** «Marcar visibles» / «Soltar visibles»: con un filtro por categoría puesto, es la forma
 *  de etiquetar todo un tipo de prenda en un clic. Solo toca los productos que se le pasan. */
export function marcarProductos(productos: ProductoEtiquetable[], marcadas: ReadonlySet<string>, marcar: boolean): Set<string> {
  const siguiente = new Set(marcadas);
  for (const p of productos) {
    for (const v of p.variantes) {
      if (marcar) siguiente.add(v.id);
      else siguiente.delete(v.id);
    }
  }
  return siguiente;
}

/** Lo que hay que mandar a la base: el diff contra lo que ya tenían. Ordenado para que
 *  dos clics iguales produzcan el mismo pedido. */
export function cambioEntre(iniciales: ReadonlySet<string>, marcadas: ReadonlySet<string>) {
  return {
    agregar: [...marcadas].filter((id) => !iniciales.has(id)).sort(),
    quitar: [...iniciales].filter((id) => !marcadas.has(id)).sort(),
  };
}

export function filtrarProductos(productos: ProductoEtiquetable[], filtro: { texto: string; categoriaId: string | null }) {
  const t = normalizarNombre(filtro.texto);
  return productos.filter((p) => {
    if (filtro.categoriaId && p.categoriaId !== filtro.categoriaId) return false;
    if (!t) return true;
    return normalizarNombre(`${p.referencia} ${p.descripcion ?? ""} ${p.categoria}`).includes(t);
  });
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Cuántos productos distintos tocan estos ids de variante. */
export function productosTocados(ids: string[], productos: ProductoEtiquetable[]): number {
  const s = new Set(ids);
  return productos.filter((p) => p.variantes.some((v) => s.has(v.id))).length;
}

export function textoCambio(cambio: { agregar: string[]; quitar: string[] }, productos: ProductoEtiquetable[]): string {
  const partes: string[] = [];
  if (cambio.agregar.length > 0) {
    const np = productosTocados(cambio.agregar, productos);
    partes.push(`Agregarás la etiqueta a ${plural(cambio.agregar.length, "prenda", "prendas")} (${plural(np, "producto", "productos")})`);
  }
  if (cambio.quitar.length > 0) {
    const np = productosTocados(cambio.quitar, productos);
    partes.push(`Quitarás la etiqueta de ${plural(cambio.quitar.length, "prenda", "prendas")} (${plural(np, "producto", "productos")})`);
  }
  return partes.length > 0 ? partes.join(" · ") : "Sin cambios";
}

const formatoFecha = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" });
// «9 nov.» trae un punto final en es-PE; dentro de una frase deja «nov.. En Vender».
const fecha = (f: string) => formatoFecha.format(new Date(f + "T00:00:00")).replace(/\.$/, "");

export type CampanaParaVistaPrevia = {
  nombre: string;
  descuentoPct: number | null;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
};

export type VistaPrevia = {
  titulo: string;
  /** Lo que va a pasar en la caja, con las fechas. */
  detalle: string;
  /** `true` si aplicar NO cambia ningún precio hoy (campaña futura o ya terminada). */
  sinEfectoHoy: boolean;
};

/** Lo que se le dice a la persona ANTES de aplicar una etiqueta que baja el precio en
 *  caja (ADR-0108). Devuelve `null` si la etiqueta no lleva descuento: ahí no hay nada
 *  que confirmar y se aplica directo. La frase nombra el efecto real, incluida la fecha:
 *  una campaña que empieza en dos meses no toca ningún precio hoy y hay que decirlo. */
export function vistaPrevia(c: CampanaParaVistaPrevia, prendasAgregadas: number, hoy: string): VistaPrevia | null {
  if (c.descuentoPct === null || prendasAgregadas <= 0) return null;
  const pct = `${c.descuentoPct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;
  const titulo = `«${c.nombre}» baja el precio ${pct} a ${plural(prendasAgregadas, "prenda", "prendas")}`;
  const v = vigenciaDe(c.vigenteDesde, c.vigenteHasta, hoy);

  if (v?.estado === "proxima") {
    return { titulo, detalle: `Empieza el ${fecha(v.desde)} (${v.enDias === 1 ? "mañana" : `en ${v.enDias} días`}): hasta entonces no cambia ningún precio.`, sinEfectoHoy: true };
  }
  if (v?.estado === "terminada") {
    return { titulo, detalle: `Esta campaña terminó el ${fecha(v.hasta)}: no va a cambiar ningún precio.`, sinEfectoHoy: true };
  }
  const hasta = c.vigenteHasta ? `hasta el ${fecha(c.vigenteHasta)}` : "sin fecha de fin";
  return { titulo, detalle: `Rige desde hoy, ${hasta}. En Vender se aplica solo, sin pedir código.`, sinEfectoHoy: false };
}
