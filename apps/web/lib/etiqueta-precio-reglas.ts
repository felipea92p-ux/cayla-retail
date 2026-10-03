// Lógica pura de la ETIQUETA DE PRECIO (la de papel que cuelga de la prenda; ADR-0180). Sin React ni Supabase,
// para poder probarla. La lectura vive en `lib/etiquetas-precio.ts` y el dibujo en `components/EtiquetaPrecio.tsx`.
//
// OJO CON EL NOMBRE: en el resto del sistema «etiqueta» es la CAMPAÑA (Black Friday, Aniversario — ADR-0107). Esta es
// la etiqueta de precio impresa; por eso todo lo suyo dice «etiqueta de precio» o `EtiquetaPrecio`, nunca «etiqueta» a secas.

import { ordenTalla } from "./catalogo-grupos";
import { conDesde, desdeSeguro } from "./vuelta-productos";
import { vigenciaDe, type Vigencia } from "./etiqueta-vigencia";
import { iconoDeEtiqueta, rotuloDeEtiqueta, type IconoEtiqueta } from "./etiqueta-visual";
import { normalizarNombre } from "./patron-visual";
import { descuentoDeCampana } from "./vender-reglas";

/** Lo que la base sabe de una prenda que entró (una variante: modelo + talla + color). */
export type VarianteEtiqueta = {
  id: string;
  productoId: string;
  prenda: string;
  /** El código corto (BLU-0042-AZM-M). */
  codigo: string | null;
  /** El identificador viejo: la caja lo sigue resolviendo, así que sirve de respaldo para el QR. */
  sku: string | null;
  precio: number;
  colorCodigo: string | null;
  color: string | null;
  /** Con qué se pinta el color en pantalla (`fondoDeMuestra`: el hex, con su brillo si es metálico o su jaspeado si es textura).
   *  Opcional en el tipo, como `marca`: quien arma variantes sin él no lo dibuja. */
  colorMuestra?: string | null;
  talla: string | null;
  /** De quién es la prenda (`productos.marca_id`, siempre tiene una). Opcional en el tipo: quien arma variantes sin ella
   *  (pruebas, datos viejos) simplemente no la imprime. */
  marca?: string | null;
};

/** Otra talla del mismo modelo: de aquí sale la fila «Tallas del modelo». */
export type HermanaEtiqueta = { productoId: string; colorCodigo: string | null; talla: string | null; activo: boolean };

/** La campaña que rige HOY sobre una prenda (la de mayor %, como la elige la caja). */
export type CampanaDeVariante = { etiquetaId: string; nombre: string; pct: number; hasta: string | null };

/** Lo que la etiqueta dice de la campaña: el motivo, el %, hasta cuándo y el descuento que cobra la caja. */
export type CampanaEtiqueta = { nombre: string; pct: number; hasta: string | null; descuento: number };

/** Cuántos íconos de etiqueta comercial caben en el papel (Felipe, 2026-09-29): dos, uno al lado del otro. */
export const MAX_ICONOS_EN_PAPEL = 2;

/** Una etiqueta comercial de la prenda tal como la guarda la base, con o sin descuento: la elegida a mano
 *  (`variante_etiquetas`) o la que la alcanza por su categoría (`etiqueta_categorias`). `pct` es `null` si no rebaja
 *  el precio (Nuevo, Top ventas, Hecho a mano…). */
export type EtiquetaDeLaPrenda = { etiquetaId: string; nombre: string; pct: number | null; desde: string | null; hasta: string | null };

/** Una etiqueta comercial en el papel (Felipe, 2026-09-29): la familia de su ícono (`iconoDeEtiqueta`; `generico` si el
 *  nombre no se reconoce), la palabra corta que lo acompaña (`rotuloDeEtiqueta`: un ícono solo no dice qué es) y el nombre
 *  completo, que lee el lector de pantalla y sale en el `title` de la vista previa. */
export type IconoDePapel = { icono: IconoEtiqueta | "generico"; rotulo: string; nombre: string };

/** Una etiqueta lista para dibujar, con cuántas unidades entraron de esa prenda. */
export type EtiquetaPrecio = {
  varianteId: string;
  /** Lo que codifica el QR y va escrito al pie: lo que la pistola de la caja lee. */
  codigo: string;
  prenda: string;
  color: string | null;
  /** Solo para la pantalla (Felipe, 2026-10-03): la franja y la cápsula del color en la lista, para saber de un vistazo qué
   *  etiqueta se imprime cuando todas las filas son el mismo modelo. El papel no lo usa: la Brother imprime en negro. `null` =
   *  un color sin hex (Estampado, Multicolor), que se pinta de varios tonos (`CapsulaColor`). */
  colorMuestra?: string | null;
  talla: string | null;
  /** La marca de la prenda (Felipe, 2026-09-29): va en el pie, a la izquierda del QR y sobre el código, que es el único
   *  hueco que la etiqueta tiene con y sin campaña; sobre el nombre no cabe (con campaña sobra 1,4 mm de alto). */
  marca?: string | null;
  /** Las tallas en que se hace el modelo EN ESTE COLOR —no el stock del día: la etiqueta impresa no cambia sola—,
   *  ordenadas como se leen en tienda. Siempre incluye la propia. */
  tallasDelModelo: string[];
  /** Precio de lista. Con campaña, lo que se cobra es `precio − campana.descuento`. */
  precio: number;
  /** La campaña de hoy, o `null`: la etiqueta siempre dice lo que la caja cobra HOY (Felipe, 2026-09-23). */
  campana: CampanaEtiqueta | null;
  /** Los íconos de las etiquetas comerciales de la prenda (`iconosDelPapel`), de la más importante a la menos: a lo
   *  sumo `MAX_ICONOS_EN_PAPEL`. Van al lado del nombre y no cambian el precio: el descuento es siempre uno solo,
   *  el de `campana`. */
  iconos: IconoDePapel[];
  /** Unidades que entraron (o que hay en la tienda): cuántas etiquetas se proponen. */
  cantidad: number;
};

/** De las campañas vigentes de cada prenda (`fn_campanas_por_variante`), la que cobra la caja: la de mayor %; a igual %,
 *  por nombre (el mismo orden que `campanas_vigentes()`). El % llega como texto (numeric) y se convierte. */
export function mejorCampanaPorVariante(
  filas: readonly { variante_id: string; etiqueta_id: string; etiqueta_nombre: string; descuento_pct: number }[],
  hastas: ReadonlyMap<string, string | null>,
): Map<string, CampanaDeVariante> {
  const mejor = new Map<string, CampanaDeVariante>();
  for (const f of filas) {
    const c: CampanaDeVariante = { etiquetaId: f.etiqueta_id, nombre: f.etiqueta_nombre, pct: Number(f.descuento_pct), hasta: hastas.get(f.etiqueta_id) ?? null };
    const actual = mejor.get(f.variante_id);
    if (!actual || c.pct > actual.pct || (c.pct === actual.pct && c.nombre.localeCompare(actual.nombre, "es") < 0)) mejor.set(f.variante_id, c);
  }
  return mejor;
}

/**
 * Qué íconos de etiqueta comercial salen en el papel de UNA prenda (Felipe, 2026-09-29).
 *
 * PROMETE: a lo sumo `max` íconos distintos, en este orden de importancia:
 *   1. el de la etiqueta cuyo descuento cobra la caja (`ganadoraId`, la de mayor %);
 *   2. las demás que rigen hoy y llevan descuento, de mayor a menor %;
 *   3. las que rigen hoy sin descuento (Nuevo, Hecho a mano…), por nombre;
 *   4. las que todavía no empiezan, la más cercana primero: la colaboradora reconoce la prenda por su campaña desde que
 *      la etiqueta, aunque aún no rija (Felipe).
 *   Una etiqueta que ya terminó no sale. Dos de la misma familia («Para liquidar — Taller» y «Para liquidar — AQP»)
 *   comparten dibujo y ocupan un solo lugar: dos íconos iguales no dicen nada más.
 * NO HACE: no toca el precio. Que una prenda tenga dos etiquetas con descuento nunca los suma: la caja cobra el mayor
 *   (`mejorCampanaPorVariante`, ADR-0107) y el papel dice ese mismo (`EtiquetaPrecio.campana`); acá solo se decide qué
 *   íconos acompañan a ese precio.
 */
export function iconosDelPapel(
  etiquetas: readonly EtiquetaDeLaPrenda[],
  hoy: string,
  ganadoraId: string | null,
  max: number = MAX_ICONOS_EN_PAPEL,
): IconoDePapel[] {
  const candidatas: { e: EtiquetaDeLaPrenda; grupo: 0 | 1 | 2 | 3 }[] = [];
  for (const e of etiquetas) {
    // Sin fechas la etiqueta es permanente (`vigenciaDe` → null): rige siempre.
    const v = vigenciaDe(e.desde, e.hasta, hoy);
    if (v?.estado === "terminada") continue;
    const proxima = v?.estado === "proxima";
    candidatas.push({ e, grupo: proxima ? 3 : e.etiquetaId === ganadoraId ? 0 : e.pct !== null ? 1 : 2 });
  }
  candidatas.sort(
    (a, b) =>
      a.grupo - b.grupo ||
      (a.grupo === 3 ? (a.e.desde ?? "").localeCompare(b.e.desde ?? "") : (b.e.pct ?? 0) - (a.e.pct ?? 0)) ||
      a.e.nombre.localeCompare(b.e.nombre, "es"),
  );
  const iconos: IconoDePapel[] = [];
  const vistos = new Set<string>();
  for (const { e } of candidatas) {
    const icono = iconoDeEtiqueta(e.nombre) ?? "generico";
    if (vistos.has(icono)) continue;
    vistos.add(icono);
    iconos.push({ icono, rotulo: rotuloDeEtiqueta(e.nombre), nombre: e.nombre });
    if (iconos.length >= max) break;
  }
  return iconos;
}

/** Los íconos de cada prenda: une las etiquetas que tiene a mano (`directas`) con las que la alcanzan por su categoría
 *  (`porCategoria`) —los dos caminos que reconoce `fn_campanas_por_variante`, y nunca chocan: es la misma etiqueta— y
 *  deja a `iconosDelPapel` elegir. `catalogo` trae solo las etiquetas aprobadas y activas. */
export function iconosPorVariante(
  variantes: readonly { id: string; categoriaId: string | null }[],
  directas: ReadonlyMap<string, readonly string[]>,
  porCategoria: ReadonlyMap<string, readonly string[]>,
  catalogo: ReadonlyMap<string, Omit<EtiquetaDeLaPrenda, "etiquetaId">>,
  campanas: ReadonlyMap<string, CampanaDeVariante>,
  hoy: string,
): Map<string, IconoDePapel[]> {
  const iconos = new Map<string, IconoDePapel[]>();
  for (const v of variantes) {
    const ids = new Set([...(directas.get(v.id) ?? []), ...(v.categoriaId ? (porCategoria.get(v.categoriaId) ?? []) : [])]);
    const suyas: EtiquetaDeLaPrenda[] = [];
    for (const etiquetaId of ids) {
      const e = catalogo.get(etiquetaId);
      if (e) suyas.push({ etiquetaId, ...e });
    }
    iconos.set(v.id, iconosDelPapel(suyas, hoy, campanas.get(v.id)?.etiquetaId ?? null));
  }
  return iconos;
}

/** ¿La campaña que rebaja el precio ya sale en la fila de etiquetas del papel (con su ícono y su palabra)? Entonces el bloque
 *  de precio no repite su nombre. Si no salió —una etiqueta armada sin íconos, o una que la fila no dejó entrar—, el bloque la
 *  nombra como antes: una campaña nunca queda sin decir cuál es. Se compara por nombre completo (el de `campana` y el de
 *  `IconoDePapel` salen de la misma etiqueta). */
export function campanaSaleEnLaFila(e: Pick<EtiquetaPrecio, "campana" | "iconos">): boolean {
  const campana = e.campana;
  return campana !== null && e.iconos.some((i) => i.nombre === campana.nombre);
}

/** Qué día mirar para saber qué prendas alcanza una campaña: hoy si rige (o no tiene fechas), su último día si ya
 *  terminó (para volver al precio normal lo que alcanzó) y su primer día si todavía no empieza. */
export function fechaDeAlcance(desde: string | null, hasta: string | null, hoy: string): string {
  const v = vigenciaDe(desde, hasta, hoy);
  if (v?.estado === "terminada") return v.hasta;
  if (v?.estado === "proxima") return v.desde;
  return hoy;
}

/** «30.09»: hasta cuándo vale el precio de campaña, corto como el resto de la etiqueta. */
export function fechaVigencia(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}`;
}

/** Un envío puede traer la misma prenda de dos proveedores (dos lotes): se imprime por prenda, no por línea. */
export function sumarEntradas(movimientos: { variante_id: string; cantidad: number }[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const m of movimientos) total.set(m.variante_id, (total.get(m.variante_id) ?? 0) + m.cantidad);
  return total;
}

export function tallasDelModelo(v: VarianteEtiqueta, hermanas: HermanaEtiqueta[]): string[] {
  if (!v.talla?.trim()) return [];
  const tallas = new Set([v.talla.trim()]);
  for (const h of hermanas) {
    if (h.activo && h.productoId === v.productoId && h.colorCodigo === v.colorCodigo && h.talla?.trim()) tallas.add(h.talla.trim());
  }
  return [...tallas].sort(ordenTalla);
}

/** «Única» (y el «Único» de antes, 20260918175000) no es una talla más de una fila: se dice «Talla única». */
export function esTallaUnica(talla: string): boolean {
  return ["unica", "unico", "u"].includes(normalizarNombre(talla));
}

const describir = (v: VarianteEtiqueta) => [v.prenda, v.color, v.talla].filter(Boolean).join(" · ");

export function armarEtiquetas(
  entradas: Map<string, number>,
  variantes: VarianteEtiqueta[],
  hermanas: HermanaEtiqueta[],
  campanas: ReadonlyMap<string, CampanaDeVariante> = new Map(),
  iconos: ReadonlyMap<string, IconoDePapel[]> = new Map(),
): { etiquetas: EtiquetaPrecio[]; sinCodigo: string[] } {
  const etiquetas: EtiquetaPrecio[] = [];
  const sinCodigo: string[] = [];
  for (const v of variantes) {
    const cantidad = entradas.get(v.id) ?? 0;
    if (cantidad <= 0) continue;
    // Sin nada que la pistola pueda leer, una etiqueta con precio igual se vería bien… y en la caja no se encontraría.
    const codigo = v.codigo?.trim() || v.sku?.trim();
    if (!codigo) {
      sinCodigo.push(describir(v));
      continue;
    }
    const c = campanas.get(v.id);
    // El mismo descuento exacto que cobra la caja (ADR-0302): el papel nunca dice otro precio ni otro %.
    const descuento = c ? descuentoDeCampana(v.precio, c.pct) : 0;
    etiquetas.push({
      varianteId: v.id,
      codigo,
      prenda: v.prenda,
      color: v.color,
      colorMuestra: v.colorMuestra ?? null,
      talla: v.talla?.trim() || null,
      marca: v.marca?.trim() || null,
      tallasDelModelo: tallasDelModelo(v, hermanas),
      precio: v.precio,
      campana: c && descuento > 0 ? { nombre: c.nombre, pct: c.pct, hasta: c.hasta, descuento } : null,
      iconos: iconos.get(v.id) ?? [],
      cantidad,
    });
  }
  // Salen agrupadas como se pegan: por modelo, color y talla.
  etiquetas.sort(
    (a, b) => a.prenda.localeCompare(b.prenda, "es") || (a.color ?? "").localeCompare(b.color ?? "", "es") || ordenTalla(a.talla ?? "", b.talla ?? ""),
  );
  return { etiquetas, sinCodigo };
}

/** La hoja que va a la impresora: cada etiqueta repetida según lo pedido (sin tocar = lo que entró). */
export function expandir(etiquetas: EtiquetaPrecio[], cantidades: Record<string, number>): EtiquetaPrecio[] {
  return etiquetas.flatMap((e) => Array.from({ length: cantidades[e.varianteId] ?? e.cantidad }, () => e));
}

/** Tope por prenda: 999 etiquetas de una sola talla ya es un error de tipeo, no un envío. */
export const MAX_POR_PRENDA = 999;

export function cantidadDeTexto(texto: string): number {
  const n = Math.floor(Number(texto));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_POR_PRENDA) : 0;
}

/** «89.90», «1,299.90»: el número grande de la etiqueta (el «S/» va aparte, más chico). */
export function precioEtiqueta(precio: number): string {
  return precio.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** «23.09.26»: la fecha de impresión, para saber cuál es la vigente si conviven dos de la misma prenda. */
export function fechaEtiqueta(hoy: string): string {
  const [a, m, d] = hoy.slice(0, 10).split("-");
  return `${d}.${m}.${a.slice(2)}`;
}

/** El enlace a la pantalla de impresión: desde el resultado de un ingreso (los lotes de Recibir / Ingreso sin
 *  comprobante, o la producción cerrada del Taller), desde una campaña o desde un producto. */
export function urlEtiquetasDePrecio(
  origen: { lotes: string[] } | { produccion: string } | { campana: string } | { producto: string } | { variantes: string[] },
  /** La pantalla exacta que abre las etiquetas (ruta + filtros + vista): con ella, «Volver» regresa a la misma Tabla
   *  o Grilla con los mismos filtros, y no a la vista por defecto. Solo la usan producto y variantes (`desdeSeguro`). */
  desde?: string,
): string {
  if ("lotes" in origen) return `/etiquetas-de-precio?lotes=${origen.lotes.join(",")}`;
  // Varias prendas marcadas en la Tabla de Productos (ADR-0254): sus tallas, como las marcadas en Existencias (ADR-0237).
  if ("variantes" in origen) return conDesde(`/etiquetas-de-precio?variantes=${origen.variantes.join(",")}`, desde);
  if ("produccion" in origen) return `/etiquetas-de-precio?produccion=${origen.produccion}`;
  if ("campana" in origen) return `/etiquetas-de-precio?campana=${origen.campana}`;
  return conDesde(`/etiquetas-de-precio?producto=${origen.producto}`, desde);
}

/**
 * ¿Se ofrece «Imprimir etiquetas» en la pantalla de éxito de Nuevo producto (ADR-0180, «Actualización 2026-09-29»)?
 *
 * PROMETE: un enlace y el número de etiquetas SOLO si el producto ya existe en la base (`id`) y entró con unidades de hoy
 *          (`stock`, la carga inicial de ADR-0212). Sale una etiqueta por unidad, igual que en Existencias y Productos.
 * ASUME:   esas unidades quedaron en la sede activa, que es desde donde `/etiquetas-de-precio?producto=` imprime
 *          (`NuevoProductoForm` se remonta con `key={ubicacionId}` al cambiar de sede). Un producto recién creado no tiene
 *          historia, así que lo que hay en la tienda es exactamente lo que se cargó.
 * NO HACE: no lee la base. Guardado sin conexión (`id` nulo) o sin stock no ofrece nada: no hay prenda que etiquetar
 *          todavía, y la pantalla de etiquetas solo diría «no hay prendas».
 */
export function etiquetasDelAlta(creado: { id: string | null; stock: { unidades: number } | null }): { href: string; unidades: number } | null {
  if (!creado.id || !creado.stock || !(creado.stock.unidades > 0)) return null;
  return { href: urlEtiquetasDePrecio({ producto: creado.id }), unidades: creado.stock.unidades };
}

/** Adónde vuelve la pantalla de etiquetas: a la que la abrió, que se deduce de lo que trae la URL. `lotes` sale tanto de
 *  Recibir como de su excepción (Ingreso sin comprobante): vuelve a Recibir, que lleva a las dos. Sin origen (la URL a
 *  secas), a Inicio. */
export function volverDeEtiquetas(
  origen: { tipo: "lotes" } | { tipo: "produccion"; id: string } | { tipo: "campana" } | { tipo: "producto" } | { tipo: "variantes" } | null,
  desde?: string | null,
): { href: string; a: string } {
  if (!origen) return { href: "/", a: "Inicio" };
  // Producto y variantes salen de la Tabla o la Grilla de Productos: se vuelve a la misma vista, con sus filtros.
  const vuelta = desdeSeguro(desde);
  if (vuelta && (origen.tipo === "producto" || origen.tipo === "variantes")) return { href: vuelta, a: "Productos" };
  switch (origen.tipo) {
    case "lotes":
      return { href: "/recibir", a: "Recibir mercadería" };
    case "produccion":
      return { href: `/produccion/ordenes?orden=${origen.id}`, a: "Órdenes" };
    case "campana":
      return { href: "/productos/atributos?tipo=etiquetas", a: "Atributos" };
    case "producto":
      return { href: "/productos", a: "Productos" };
    case "variantes":
      return { href: "/inventario", a: "Existencias" };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los ids que llegan por la URL (`?lotes=a,b`): cualquiera puede escribirla, así que solo pasan ids bien formados. */
export function idsDeParam(param: string | string[] | undefined): string[] {
  const partes = (Array.isArray(param) ? param : [param ?? ""]).flatMap((p) => p.split(","));
  return [...new Set(partes.map((p) => p.trim()).filter((p) => UUID.test(p)))];
}

/** Cuántas etiquetas por talla, como llegan por la URL (`?unidades=id:2,id:3`): las unidades que acaban de entrar desde Editar
 *  producto, para imprimir justo esas y no todo el stock de la tienda. Solo pasan ids bien formados y enteros de 1 a
 *  `MAX_POR_PRENDA`; un id repetido se suma. */
export function unidadesDeParam(param: string | string[] | undefined): Map<string, number> {
  const salida = new Map<string, number>();
  for (const parte of (Array.isArray(param) ? param : [param ?? ""]).flatMap((p) => p.split(","))) {
    const [id, n] = parte.trim().split(":");
    const cantidad = Number(n);
    if (!id || !UUID.test(id) || !Number.isInteger(cantidad) || cantidad < 1) continue;
    salida.set(id, Math.min(MAX_POR_PRENDA, (salida.get(id) ?? 0) + cantidad));
  }
  return salida;
}

/** El origen, en lo que la pantalla necesita para hablar de él. */
export type OrigenDeTexto =
  | { tipo: "lotes" }
  | { tipo: "produccion" }
  | { tipo: "campana"; campana: { nombre: string; pct: number; vigencia: Vigencia | null } | null }
  | { tipo: "producto"; nombre: string | null }
  /** Tallas sueltas. `desdeProductos`: se llegó desde la Tabla o la Grilla de Productos (misma regla que «Volver»:
   *  `desdeSeguro`), no desde Existencias. `tallas`: cuántas trae la URL — una sola es la impresora de esa talla, nadie
   *  «marcó» nada. */
  | { tipo: "variantes"; desdeProductos?: boolean; tallas?: number; entraron?: boolean }
  | { tipo: "ninguno" };

export type Encabezado = { sobretitulo: string; titulo: string; bajada: string; columnaCantidad: string; vacio: string };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const diaMes = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)).replace(/\.$/, "");

/** Lo que dice la pantalla según de dónde vienen las etiquetas. Una campaña terminada NO es un error: es el momento de
 *  volver a etiquetar con el precio normal (Felipe, 2026-09-23), y la pantalla lo dice así. */
export function encabezadoDeEtiquetas(o: OrigenDeTexto, n: { unidades: number; modelos: number }, sede: string): Encabezado {
  const prendas = plural(n.unidades, "prenda", "prendas");
  const modelos = plural(n.modelos, "modelo", "modelos");
  const base = { titulo: "Etiquetas de precio", columnaCantidad: "En tienda" };
  switch (o.tipo) {
    case "lotes":
      return {
        ...base,
        sobretitulo: "Recibir · Mercadería que entró",
        bajada: `Entraron ${prendas} de ${modelos}. Sale una etiqueta por prenda; si alguna ya venía etiquetada, baja su número.`,
        columnaCantidad: "Entraron",
        vacio: "Este ingreso no dejó prendas para etiquetar en tu sede.",
      };
    case "produccion":
      return {
        ...base,
        sobretitulo: "Taller · Producción cerrada",
        bajada: `Salieron ${plural(n.unidades, "prenda buena", "prendas buenas")} de ${modelos}. Sale una etiqueta por prenda.`,
        columnaCantidad: "Salieron",
        vacio: "Esta producción no dejó prendas para etiquetar en tu sede.",
      };
    case "producto":
      return {
        ...base,
        sobretitulo: `Productos · ${o.nombre ?? "Modelo"}`,
        bajada: `En ${sede} hay ${prendas} de este modelo. Sale una etiqueta por prenda; si alguna ya la tiene, baja su número.`,
        vacio: `En ${sede} no hay prendas de este modelo.`,
      };
    case "variantes":
      // `?unidades=`: lo que acaba de entrar al guardar la ficha en Editar producto (una por unidad nueva, no todo el stock).
      if (o.entraron) {
        return {
          ...base,
          sobretitulo: "Productos · Lo que entró",
          bajada: `Entraron ${prendas} de ${modelos} al guardar la ficha. Sale una etiqueta por cada prenda nueva.`,
          columnaCantidad: "Entraron",
          vacio: "Lo que entró ya no está en tu sede: no hay nada que etiquetar.",
        };
      }
      if (o.desdeProductos && o.tallas === 1) {
        return {
          ...base,
          sobretitulo: "Productos · Una talla",
          bajada: `En ${sede} hay ${prendas} de esta talla y color. Sale una etiqueta por prenda; si alguna ya la tiene, baja su número.`,
          vacio: `En ${sede} no hay unidades de esta talla y color.`,
        };
      }
      return {
        ...base,
        sobretitulo: `${o.desdeProductos ? "Productos" : "Existencias"} · Prendas marcadas`,
        bajada: `En ${sede} hay ${prendas} de ${modelos} entre las que marcaste. Sale una etiqueta por prenda; si alguna ya la tiene, baja su número.`,
        vacio: `En ${sede} no hay unidades de las prendas que marcaste.`,
      };
    case "campana": {
      const c = o.campana;
      if (!c) return { ...base, sobretitulo: "Campañas", bajada: "", vacio: "Esa etiqueta no tiene descuento: no cambia ningún precio, no hay nada que reimprimir." };
      const pct = `${c.pct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} %`;
      if (c.vigencia?.estado === "terminada") {
        return {
          ...base,
          sobretitulo: `Campaña terminada · ${c.nombre}`,
          titulo: "Volver al precio normal",
          bajada: `La campaña terminó el ${diaMes(c.vigencia.hasta)}. En ${sede} quedan ${prendas} que la tenían: estas etiquetas salen con el precio de hoy, para reemplazar las de campaña.`,
          vacio: `En ${sede} no quedan prendas de esta campaña: no hay nada que volver a etiquetar.`,
        };
      }
      if (c.vigencia?.estado === "proxima") {
        return {
          ...base,
          sobretitulo: `Campaña · ${c.nombre}`,
          titulo: "Etiquetas de campaña",
          bajada: "",
          vacio: `Empieza el ${diaMes(c.vigencia.desde)}: hasta entonces la caja cobra el precio normal y la etiqueta también lo diría. Imprímelas ese día.`,
        };
      }
      return {
        ...base,
        sobretitulo: `Campaña · ${c.nombre}`,
        titulo: "Etiquetas de campaña",
        bajada: `En ${sede} hay ${prendas} de ${modelos} con la campaña (−${pct}). Salen con el precio rebajado que cobra la caja; una por prenda.`,
        vacio: `En ${sede} no hay prendas de esta campaña.`,
      };
    }
    default:
      return { ...base, sobretitulo: "Etiquetas de precio", bajada: "", vacio: "Se llega aquí desde Recibir, el Taller, una campaña o un producto." };
  }
}
