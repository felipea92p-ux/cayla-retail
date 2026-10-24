// Lógica pura de «etiquetar prendas» (la pantalla `PrendasDeEtiquetaModal` y, más
// adelante, el etiquetado en lote de Productos): qué está marcado, qué cambia y qué
// se le dice a la persona antes de aplicar. Sin React ni Supabase, para poder probarla.
//
// Se etiqueta por PRODUCTO (marca todas sus tallas y colores de un golpe) con
// excepciones por variante, pero lo que viaja a la base son ids de VARIANTE
// (`retail.etiquetar_variantes`, 20260919010000): el modelo por variante no cambia.

import { resolverCodigoV2 } from "./buscar-prenda-v2";
import { cambioEnLasTiendas, rigeEnSede, type CambioDePrecio, type DondeSeImprime } from "./etiqueta-campana";
import { vigenciaDe } from "./etiqueta-vigencia";
import { normalizarNombre } from "./patron-visual";
import { descuentoDeCampana, totalDeLineas } from "./vender-reglas";

/** `colorHex` y `precio` son para que la hoja muestre la prenda como es (su color, su precio de etiqueta); la lógica de marcar
 *  no los usa. `codigos` son los que lee la pistola o la cámara (el `sku`, el código de la etiqueta y los de fábrica): sin
 *  ellos la prenda solo se marca con la casilla. */
export type VarianteEtiquetable = {
  id: string;
  talla: string | null;
  color: string | null;
  colorHex?: string | null;
  precio?: number | null;
  codigos?: readonly string[];
  /** Cuántas unidades de esta talla y color se pueden vender hoy en cada sede (`ubicacion_id` → unidades, solo las que tienen). Es la
   *  cifra de Existencias, la de `fn_existencias` (ADR-0270): físico menos dañado menos apartado (`disponiblePorVariante`). */
  disponible?: Readonly<Record<string, number>>;
};

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

// ---- Filtrar por sede: ¿hay prenda para vender en esa tienda? -------------------------------------------------------

/** Lo que devuelve `fn_existencias` (ADR-0270, la única fórmula de «cuánto hay»), por talla y sede → cuánto se puede vender en cada sede,
 *  solo las que tienen algo. La pantalla no suma `stock` por su cuenta: la cifra es la de la base. */
export function disponiblePorVariante(
  filas: readonly { variante_id: string; ubicacion_id: string; disponible: number }[],
): Map<string, Record<string, number>> {
  const salida = new Map<string, Record<string, number>>();
  for (const f of filas) {
    if (f.disponible <= 0) continue;
    const de = salida.get(f.variante_id) ?? {};
    de[f.ubicacion_id] = (de[f.ubicacion_id] ?? 0) + f.disponible;
    salida.set(f.variante_id, de);
  }
  return salida;
}

/** ¿Alguna talla o color del producto se puede vender hoy en esa sede? */
export function hayEnSede(p: ProductoEtiquetable, sedeId: string): boolean {
  return p.variantes.some((v) => (v.disponible?.[sedeId] ?? 0) > 0);
}

/** Con una sede elegida, solo los productos que tienen algo para vender ahí; sin sede (`null`), todos. Se aplica ENCIMA de los otros
 *  filtros (buscador, categoría, píldoras): cada uno recorta lo que dejó el anterior. */
export function filtrarPorSede<T extends ProductoEtiquetable>(productos: readonly T[], sedeId: string | null): T[] {
  return sedeId === null ? [...productos] : productos.filter((p) => hayEnSede(p, sedeId));
}

/** El número de cada chip de sede: cuántos de estos productos hay en ella. */
export function cuentaPorSede(productos: readonly ProductoEtiquetable[], sedeIds: readonly string[]): Record<string, number> {
  return Object.fromEntries(sedeIds.map((id) => [id, productos.filter((p) => hayEnSede(p, id)).length]));
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
 *  directo: «Quitar todos» devolvía todas las prendas de la etiqueta a su precio sin una pregunta. Dice «sin este 30 %», no «a su
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

/** Las prendas a las que etiquetar les cambia el precio en caja HOY (ADR-0472): con descuento y en su temporada, las que ganan la
 *  etiqueta (`quedan`) y las que la pierden (`salen`); si la etiqueta no rebaja hoy, ninguna. Las que entran por su categoría no están
 *  en `cambio` (no se marcan ni se quitan a mano). Como al guardar una campaña (`prendasQueCambianDePrecioHoy`), no mira otras campañas:
 *  si una prenda sigue rebajada por otra mayor, se reimprime igual y el papel sale con lo que cobra la caja (no hace daño).
 *  Una campaña de solo algunas tiendas (ADR-0486) cambia el precio solo allá: el aviso las nombra y el botón imprime solo si la sede de
 *  quien marca (`donde.aqui`) es una de ellas, con la misma regla que «Configurar» (`cambioEnLasTiendas`, Felipe 2026-10-23). */
export function prendasQueCambianAlEtiquetar(
  c: Pick<CampanaParaVistaPrevia, "descuentoPct" | "vigenteDesde" | "vigenteHasta"> & { sedeIds: readonly string[] },
  cambio: { agregar: readonly string[]; quitar: readonly string[] },
  hoy: string,
  donde: DondeSeImprime = { tiendas: [], aqui: null },
): CambioDePrecio {
  const v = vigenciaDe(c.vigenteDesde, c.vigenteHasta, hoy);
  const rebajaHoy = c.descuentoPct !== null && c.descuentoPct > 0 && (!v || v.estado === "vigente");
  return cambioEnLasTiendas(
    (sede) => (rebajaHoy && rigeEnSede(c, sede) ? { quedan: [...cambio.agregar], salen: [...cambio.quitar] } : { quedan: [], salen: [] }),
    donde,
    c.sedeIds,
  );
}

const textoPct = (pct: number) => `${pct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;

// ---- Escanear para marcar (Felipe 2026-10-21, maqueta `docs/maquetas/etiqueta-escanear-2026-10/`, dirección B) ----------------

/** Qué hace una lectura: «poner» la etiqueta (lo de siempre) o «quitarla». Leer dos veces la misma prenda NO alterna: la pistola a
 *  veces lee dos veces y la cámara vuelve a ver la misma etiqueta, y una segunda lectura desharía la primera sin que nadie lo note.
 *  Para quitar con el lector se cambia el modo. */
export type ModoLectura = "poner" | "quitar";

/** Una prenda que ya no se vende (talla desactivada): no está en la lista, pero su etiqueta sí se puede leer. */
export type PrendaFueraDeVenta = { referencia: string; talla: string | null; color: string | null; codigos: readonly string[] };

export type Lectura =
  | { tipo: "puesta" | "ya-la-llevaba" | "quitada" | "no-la-llevaba" | "por-categoria"; producto: ProductoEtiquetable; variante: VarianteEtiquetable }
  | { tipo: "fuera-de-venta"; prenda: PrendaFueraDeVenta }
  | { tipo: "desconocido"; codigo: string };

/**
 * Lo que pasa al leer `codigo` (pistola o cámara): se busca la prenda exacta como en Vender (`resolverCodigoV2`: el código de la
 * etiqueta o el de fábrica, sin mayúsculas, con el apóstrofo de la pistola como guion) y se marca o se quita SOLO esa talla y color,
 * la que está en la mano. Nada se guarda: es lo mismo que tocar su casilla, y se aplica con «Revisar y aplicar».
 */
export function leerCodigo(
  codigo: string,
  modo: ModoLectura,
  datos: { productos: readonly ProductoEtiquetable[]; marcadas: ReadonlySet<string>; porCategoria: ReadonlySet<string>; fueraDeVenta?: readonly PrendaFueraDeVenta[] },
): { lectura: Lectura; marcadas: Set<string> } {
  const marcadas = new Set(datos.marcadas);
  const buscables = datos.productos.flatMap((producto) =>
    producto.variantes.map((variante) => ({ ...buscable(variante.codigos, producto.referencia, variante), producto, variante })),
  );
  const hallada = resolverCodigoV2(codigo, buscables);
  if (!hallada) {
    const fuera = resolverCodigoV2(codigo, (datos.fueraDeVenta ?? []).map((prenda, i) => ({ ...buscable(prenda.codigos, prenda.referencia, prenda, `fuera-${i}`), prenda })));
    return { lectura: fuera ? { tipo: "fuera-de-venta", prenda: fuera.prenda } : { tipo: "desconocido", codigo: codigo.trim() }, marcadas };
  }
  const { producto, variante } = hallada;
  if (producto.categoriaId !== null && datos.porCategoria.has(producto.categoriaId)) return { lectura: { tipo: "por-categoria", producto, variante }, marcadas };
  const la = marcadas.has(variante.id);
  if (modo === "poner") {
    marcadas.add(variante.id);
    return { lectura: { tipo: la ? "ya-la-llevaba" : "puesta", producto, variante }, marcadas };
  }
  marcadas.delete(variante.id);
  return { lectura: { tipo: la ? "quitada" : "no-la-llevaba", producto, variante }, marcadas };
}

function buscable(codigos: readonly string[] | undefined, referencia: string, v: { talla: string | null; color: string | null }, id = "") {
  const [sku = "", ...resto] = codigos ?? [];
  return { varianteId: id, sku, codigosBarras: resto, referencia, talla: v.talla, color: v.color };
}

/** «M · Negro», o «Única» si la prenda no tiene ni talla ni color. */
export const nombreDeTalla = (v: { talla: string | null; color: string | null }) => [v.talla, v.color].filter(Boolean).join(" · ") || "Única";

/** Lo que la hoja dice tras una lectura, en palabras de tienda: verde si la etiqueta quedó puesta, taupe si se quitó, ámbar si no
 *  entró (con por qué) y pizarra si ya la llevaba. El texto de la cámara es el mismo. */
export function mensajeLectura(l: Lectura): { tono: "verde" | "taupe" | "ambar" | "pizarra"; estado: string; titulo: string; detalle: string } {
  switch (l.tipo) {
    case "puesta":
      return { tono: "verde", estado: "Lleva la etiqueta", titulo: l.producto.referencia, detalle: nombreDeTalla(l.variante) };
    case "ya-la-llevaba":
      return { tono: "pizarra", estado: "Ya la llevaba", titulo: l.producto.referencia, detalle: `${nombreDeTalla(l.variante)}: no cambia nada` };
    case "quitada":
      return { tono: "taupe", estado: "Se la quitas", titulo: l.producto.referencia, detalle: nombreDeTalla(l.variante) };
    case "no-la-llevaba":
      return { tono: "pizarra", estado: "No la llevaba", titulo: l.producto.referencia, detalle: `${nombreDeTalla(l.variante)}: no hay nada que quitar` };
    case "por-categoria":
      return { tono: "pizarra", estado: "Por su categoría", titulo: l.producto.referencia, detalle: "Ya la lleva por la regla de la campaña" };
    case "fuera-de-venta":
      return { tono: "ambar", estado: "Ya no se vende", titulo: l.prenda.referencia, detalle: `${nombreDeTalla(l.prenda)} está desactivada: no se le pone` };
    case "desconocido":
      return { tono: "ambar", estado: "No la encontramos", titulo: l.codigo, detalle: "No es el código de ninguna prenda a la venta. Búscala por su nombre." };
  }
}

/** Las tallas y colores de la prenda que todavía no llevan la etiqueta: «Ponérsela a sus otras N tallas», justo después de leer
 *  una. Las que entran por categoría ya la llevan: ninguna. */
export function otrasTallas(p: ProductoEtiquetable, marcadas: ReadonlySet<string>, porCategoria: ReadonlySet<string>): string[] {
  if (p.categoriaId !== null && porCategoria.has(p.categoriaId)) return [];
  return p.variantes.filter((v) => !marcadas.has(v.id)).map((v) => v.id);
}

/** Una pieza del mosaico de la etiqueta: UN producto con sus tallas y colores en el mismo estado (Felipe 2026-10-22: la foto de unos
 *  jeans repetida cinco veces no dejaba ver nada; ahora sale una vez con su «×5»). `ids` son sus tallas y colores, `variante` la
 *  primera (su color dibuja la pieza sin foto). `nueva` = se la pones ahora; `sigue` = ya la llevaba; `categoria` = la lleva por la
 *  regla de la campaña; `sale` = se la quitas (queda tenue y tachada hasta aplicar). */
export type PiezaEtiqueta = {
  id: string;
  producto: ProductoEtiquetable;
  variante: VarianteEtiquetable;
  ids: string[];
  estado: "nueva" | "sigue" | "categoria" | "sale";
};

/**
 * La etiqueta como se ve colgada: cuántas tallas y colores la llevan contando lo que aún no se aplica (`total`), y las piezas del
 * mosaico, una por producto y estado: primero lo que acabas de poner (lo último arriba), después lo que se quita, lo que ya la
 * llevaba y lo de su categoría. Solo se dibujan `max` piezas; `mas` dice cuántas quedaron fuera. Lo que se quita no cuenta en
 * `total`: al aplicar, ya no la lleva.
 */
export function etiquetaColgada(
  productos: readonly ProductoEtiquetable[],
  iniciales: ReadonlySet<string>,
  marcadas: ReadonlySet<string>,
  porCategoria: ReadonlySet<string>,
  max: number,
): { total: number; agregar: number; quitar: number; piezas: PiezaEtiqueta[]; mas: number } {
  const porVariante = new Map<string, { producto: ProductoEtiquetable; variante: VarianteEtiquetable }>();
  for (const producto of productos) for (const variante of producto.variantes) porVariante.set(variante.id, { producto, variante });
  const heredadas = productos.filter((p) => p.categoriaId !== null && porCategoria.has(p.categoriaId));
  const enCategoria = new Set(heredadas.flatMap((p) => p.variantes.map((v) => v.id)));
  // `marcadas` guarda el orden en que se marcaron: lo último marcado va primero, que es lo que la persona busca con la vista.
  const nuevas = [...marcadas].filter((id) => !iniciales.has(id) && !enCategoria.has(id)).reverse();
  const salen = [...iniciales].filter((id) => !marcadas.has(id) && !enCategoria.has(id));
  const siguen = [...marcadas].filter((id) => iniciales.has(id) && !enCategoria.has(id));
  // Un producto es UNA pieza por estado, en el lugar de su talla más reciente: si le pones dos tallas, sale una vez con «×2».
  const piezas = new Map<string, PiezaEtiqueta>();
  const juntar = (ids: readonly string[], estado: PiezaEtiqueta["estado"]) => {
    for (const id of ids) {
      const x = porVariante.get(id);
      if (!x) continue;
      const clave = `${x.producto.id}:${estado}`;
      const ya = piezas.get(clave);
      if (ya) ya.ids.push(id);
      else piezas.set(clave, { id: clave, producto: x.producto, variante: x.variante, ids: [id], estado });
    }
  };
  juntar(nuevas, "nueva");
  juntar(salen, "sale");
  juntar(siguen, "sigue");
  juntar([...enCategoria], "categoria");
  const todas = [...piezas.values()];
  const caben = todas.length > max ? Math.max(0, max - 1) : todas.length;
  return {
    total: nuevas.length + siguen.length + enCategoria.size,
    agregar: nuevas.length,
    quitar: salen.length,
    piezas: todas.slice(0, caben),
    mas: todas.length - caben,
  };
}

/** Cuánto cobra la caja por las prendas que se ponen ahora, una de cada talla y color: hoy y con la etiqueta (la cuenta de la caja,
 *  `descuentoDeCampana`). Sin descuento o sin precios, `null`. */
export function cajaAntesDespues(productos: readonly ProductoEtiquetable[], agregar: readonly string[], pct: number | null): { antes: number; despues: number } | null {
  if (pct === null || pct <= 0 || agregar.length === 0) return null;
  const ids = new Set(agregar);
  const lineas = productos
    .flatMap((p) => p.variantes)
    .filter((v) => ids.has(v.id) && typeof v.precio === "number" && v.precio > 0)
    .map((v) => ({ cantidad: 1, precioUnitario: v.precio as number, descuentoUnitario: descuentoDeCampana(v.precio as number, pct) }));
  if (lineas.length === 0) return null;
  return { antes: totalDeLineas(lineas.map((l) => ({ ...l, descuentoUnitario: 0 }))), despues: totalDeLineas(lineas) };
}
