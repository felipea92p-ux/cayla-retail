// Lógica pura de «etiquetar prendas» (la pantalla `PrendasDeEtiquetaModal` y, más
// adelante, el etiquetado en lote de Productos): qué está marcado, qué cambia y qué
// se le dice a la persona antes de aplicar. Sin React ni Supabase, para poder probarla.
//
// Se etiqueta por PRODUCTO (marca todas sus tallas y colores de un golpe) con
// excepciones por variante, pero lo que viaja a la base son ids de VARIANTE
// (`retail.etiquetar_variantes`, 20260919010000): el modelo por variante no cambia.

import { vigenciaDe } from "./etiqueta-vigencia";
import { normalizarNombre } from "./patron-visual";
import { descuentoDeCampana, totalDeLineas } from "./vender-reglas";

/** `colorHex` y `precio` son para que la hoja muestre la prenda como es (su color, su precio de etiqueta); la lógica de marcar
 *  no los usa. */
export type VarianteEtiquetable = { id: string; talla: string | null; color: string | null; colorHex?: string | null; precio?: number | null };

/** La foto y el prefijo y la familia de la categoría son para la miniatura (`MiniaturaPrenda`, ADR-0333): sin foto, el ícono de
 *  su categoría sobre su color. */
export type ProductoEtiquetable = {
  id: string;
  /** El nombre de la prenda para la gente («Blusa Aurora»); `codigo` es el corto del modelo (BLU-0042). */
  referencia: string;
  codigo?: string | null;
  descripcion: string | null;
  categoriaId: string | null;
  categoria: string;
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
  fotoUrl?: string | null;
  colorHex?: string | null;
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
    return normalizarNombre(`${p.referencia} ${p.codigo ?? ""} ${p.descripcion ?? ""} ${p.categoria}`).includes(t);
  });
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ---- Lo que la hoja dice de cada producto ---------------------------------------------------------------------------

/** ¿Lleva la etiqueta? Por su categoría (la regla de la campaña) o con al menos una talla marcada a mano. */
export function llevaEtiqueta(p: ProductoEtiquetable, marcadas: ReadonlySet<string>, porCategoria: ReadonlySet<string>): boolean {
  return (p.categoriaId !== null && porCategoria.has(p.categoriaId)) || p.variantes.some((v) => marcadas.has(v.id));
}

/** Las tres píldoras de la hoja: todas, las que llevan la etiqueta y las que no. */
export type FiltroMarca = "todas" | "con" | "sin";

export function cuentaPorMarca(
  productos: readonly ProductoEtiquetable[],
  marcadas: ReadonlySet<string>,
  porCategoria: ReadonlySet<string>,
): Record<FiltroMarca, number> {
  const con = productos.filter((p) => llevaEtiqueta(p, marcadas, porCategoria)).length;
  return { todas: productos.length, con, sin: productos.length - con };
}

/** Los productos que entran en una píldora. La hoja guarda este conjunto al tocar la píldora y no lo recalcula con cada casilla:
 *  si «Con la etiqueta» se recalculara, la prenda que la persona suelta se iría de la lista bajo su mouse y no podría
 *  arrepentirse. El número de la píldora sí sigue vivo. */
export function idsPorMarca(
  productos: readonly ProductoEtiquetable[],
  filtro: FiltroMarca,
  marcadas: ReadonlySet<string>,
  porCategoria: ReadonlySet<string>,
): Set<string> | null {
  if (filtro === "todas") return null;
  const quiereCon = filtro === "con";
  return new Set(productos.filter((p) => llevaEtiqueta(p, marcadas, porCategoria) === quiereCon).map((p) => p.id));
}

/** «5 tallas y colores» o, si solo una parte lleva la etiqueta, «2 de 5 tallas y colores». Si entra por su categoría, las lleva
 *  todas. */
export function textoTallas(p: ProductoEtiquetable, marcadas: ReadonlySet<string>, heredada: boolean): string {
  const total = p.variantes.length;
  const n = heredada ? total : p.variantes.filter((v) => marcadas.has(v.id)).length;
  const todas = total === 1 ? "1 talla y color" : `${total} tallas y colores`;
  return n === 0 || n === total ? todas : `${n} de ${todas}`;
}

/** El precio de etiqueta del producto antes y después del descuento, con la cuenta de la caja (`descuentoDeCampana`, ADR-0403).
 *  Si sus tallas tienen precios distintos, el más bajo y `desde`. `null` sin descuento o sin un precio mayor que 0. Es el precio
 *  de la prenda: una tienda con precio propio baja desde el suyo. */
export type PrecioConCampana = { antes: number; despues: number; desde: boolean };

export function precioConCampana(p: ProductoEtiquetable, pct: number | null): PrecioConCampana | null {
  if (pct === null || pct <= 0) return null;
  const precios = p.variantes.map((v) => v.precio).filter((x): x is number => typeof x === "number" && x > 0);
  if (precios.length === 0) return null;
  // El más bajo antes es el más bajo después: lo que se cobra no baja cuando el precio sube (lo prueba etiqueta-campana.test).
  const antes = Math.min(...precios);
  const despues = totalDeLineas([{ cantidad: 1, precioUnitario: antes, descuentoUnitario: descuentoDeCampana(antes, pct) }]);
  return { antes, despues, desde: new Set(precios).size > 1 };
}

/** Cuántos productos distintos tocan estos ids de variante. */
export function productosTocados(ids: string[], productos: ProductoEtiquetable[]): number {
  const s = new Set(ids);
  return productos.filter((p) => p.variantes.some((v) => s.has(v.id))).length;
}

/** `fueraDeVenta`: cuántas marcas de prendas que ya no se venden se quitan además (no están en `productos`, que son las de la lista). */
export function textoCambio(cambio: { agregar: string[]; quitar: string[] }, productos: ProductoEtiquetable[], fueraDeVenta = 0): string {
  const partes: string[] = [];
  if (cambio.agregar.length > 0) {
    const np = productosTocados(cambio.agregar, productos);
    partes.push(`Agregarás la etiqueta a ${plural(cambio.agregar.length, "prenda", "prendas")} (${plural(np, "producto", "productos")})`);
  }
  if (cambio.quitar.length > 0) {
    const np = productosTocados(cambio.quitar, productos);
    const fuera = fueraDeVenta > 0 ? ` y de ${fueraDeVenta} que ya no se ${fueraDeVenta === 1 ? "vende" : "venden"}` : "";
    partes.push(`Quitarás la etiqueta de ${plural(cambio.quitar.length, "prenda", "prendas")} (${plural(np, "producto", "productos")})${fuera}`);
  } else if (fueraDeVenta > 0) {
    partes.push(`Quitarás la etiqueta de ${plural(fueraDeVenta, "prenda que ya no se vende", "prendas que ya no se venden")}`);
  }
  return partes.length > 0 ? partes.join(" · ") : "Sin cambios";
}

/** El aviso de la hoja cuando la etiqueta sigue puesta en prendas que ya no se venden (una talla desactivada, un producto
 *  descontinuado). No cambia ningún precio hoy, pero si la prenda vuelve a la venta vuelve con la etiqueta, y con el descuento si
 *  lo lleva: eso es lo que se dice, no la causa técnica. `quitando`: ya se tocó «Quitárselas» y falta aplicar. */
export function avisoFueraDeVenta(n: number, conDescuento: boolean, quitando: boolean): { titulo: string; detalle: string } {
  // Con su frase también al quitar: el aviso no cambia de alto al tocar «Quitárselas» (ADR-0185).
  if (quitando) return { titulo: `Al aplicar, se la quitarás a ${plural(n, "prenda que ya no se vende", "prendas que ya no se venden")}`, detalle: "Hoy no cambia ningún precio: no están a la venta." };
  const vuelve = n === 1 ? "Si vuelve a la venta, vuelve" : "Si vuelven a la venta, vuelven";
  return {
    titulo: `${plural(n, "prenda que ya no se vende sigue marcada", "prendas que ya no se venden siguen marcadas")}`,
    detalle: `${n === 1 ? "Es una talla desactivada o un producto descontinuado" : "Son tallas desactivadas o productos descontinuados"}. ${vuelve} ${conDescuento ? "con este descuento" : "con la etiqueta"}.`,
  };
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
  const pct = textoPct(c.descuentoPct);
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

/** Lo mismo al QUITAR la etiqueta: con descuento, quitarla sube el precio en caja, y eso también se confirma. Antes se aplicaba
 *  directo: «Quitar todos» en «Para liquidar» devolvía 40 prendas a su precio sin una pregunta. Dice «sin este 30 %», no «a su
 *  precio normal»: la prenda puede seguir en otra campaña. `null` sin descuento o sin prendas quitadas (las que ya no se venden
 *  no cuentan: no cambian ningún precio). */
export function vistaPreviaQuitar(c: CampanaParaVistaPrevia, prendasQuitadas: number, hoy: string): VistaPrevia | null {
  if (c.descuentoPct === null || prendasQuitadas <= 0) return null;
  const prendas = plural(prendasQuitadas, "prenda", "prendas");
  const v = vigenciaDe(c.vigenteDesde, c.vigenteHasta, hoy);

  if (v?.estado === "proxima") {
    return { titulo: `«${c.nombre}» ya no rebajará ${prendas}`, detalle: `La campaña empieza el ${fecha(v.desde)}: hoy su precio no cambia.`, sinEfectoHoy: true };
  }
  if (v?.estado === "terminada") {
    return { titulo: `«${c.nombre}» se quita de ${prendas}`, detalle: `Esta campaña terminó el ${fecha(v.hasta)}: no cambia ningún precio.`, sinEfectoHoy: true };
  }
  return { titulo: `«${c.nombre}» deja de rebajar ${prendas}`, detalle: `Desde hoy, en Vender se cobran sin este ${textoPct(c.descuentoPct)}.`, sinEfectoHoy: false };
}

const textoPct = (pct: number) => `${pct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;
