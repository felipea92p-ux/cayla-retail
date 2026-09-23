// Lógica pura de la ETIQUETA DE PRECIO (la de papel que cuelga de la prenda; ADR-0180). Sin React ni Supabase,
// para poder probarla. La lectura vive en `lib/etiquetas-precio.ts` y el dibujo en `components/EtiquetaPrecio.tsx`.
//
// OJO CON EL NOMBRE: en el resto del sistema «etiqueta» es la CAMPAÑA (Black Friday, Aniversario — ADR-0107). Esta es
// la etiqueta de precio impresa; por eso todo lo suyo dice «etiqueta de precio» o `EtiquetaPrecio`, nunca «etiqueta» a secas.

import { ordenTalla } from "./catalogo-grupos";
import { vigenciaDe, type Vigencia } from "./etiqueta-vigencia";
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
  talla: string | null;
};

/** Otra talla del mismo modelo: de aquí sale la fila «Tallas del modelo». */
export type HermanaEtiqueta = { productoId: string; colorCodigo: string | null; talla: string | null; activo: boolean };

/** La campaña que rige HOY sobre una prenda (la de mayor %, como la elige la caja). */
export type CampanaDeVariante = { etiquetaId: string; nombre: string; pct: number; hasta: string | null };

/** Lo que la etiqueta dice de la campaña: el motivo, el %, hasta cuándo y el descuento que cobra la caja. */
export type CampanaEtiqueta = { nombre: string; pct: number; hasta: string | null; descuento: number };

/** Una etiqueta lista para dibujar, con cuántas unidades entraron de esa prenda. */
export type EtiquetaPrecio = {
  varianteId: string;
  /** Lo que codifica el QR y va escrito al pie: lo que la pistola de la caja lee. */
  codigo: string;
  prenda: string;
  color: string | null;
  talla: string | null;
  /** Las tallas en que se hace el modelo EN ESTE COLOR —no el stock del día: la etiqueta impresa no cambia sola—,
   *  ordenadas como se leen en tienda. Siempre incluye la propia. */
  tallasDelModelo: string[];
  /** Precio de lista. Con campaña, lo que se cobra es `precio − campana.descuento`. */
  precio: number;
  /** La campaña de hoy, o `null`: la etiqueta siempre dice lo que la caja cobra HOY (Felipe, 2026-09-23). */
  campana: CampanaEtiqueta | null;
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
    // El mismo descuento que cobra la caja (bajado al .90, ADR-0182): el papel nunca dice otro precio.
    const descuento = c ? descuentoDeCampana(v.precio, c.pct) : 0;
    etiquetas.push({
      varianteId: v.id,
      codigo,
      prenda: v.prenda,
      color: v.color,
      talla: v.talla?.trim() || null,
      tallasDelModelo: tallasDelModelo(v, hermanas),
      precio: v.precio,
      campana: c && descuento > 0 ? { nombre: c.nombre, pct: c.pct, hasta: c.hasta, descuento } : null,
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
export function urlEtiquetasDePrecio(origen: { lotes: string[] } | { produccion: string } | { campana: string } | { producto: string }): string {
  if ("lotes" in origen) return `/etiquetas-de-precio?lotes=${origen.lotes.join(",")}`;
  if ("produccion" in origen) return `/etiquetas-de-precio?produccion=${origen.produccion}`;
  if ("campana" in origen) return `/etiquetas-de-precio?campana=${origen.campana}`;
  return `/etiquetas-de-precio?producto=${origen.producto}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los ids que llegan por la URL (`?lotes=a,b`): cualquiera puede escribirla, así que solo pasan ids bien formados. */
export function idsDeParam(param: string | string[] | undefined): string[] {
  const partes = (Array.isArray(param) ? param : [param ?? ""]).flatMap((p) => p.split(","));
  return [...new Set(partes.map((p) => p.trim()).filter((p) => UUID.test(p)))];
}

/** El origen, en lo que la pantalla necesita para hablar de él. */
export type OrigenDeTexto =
  | { tipo: "lotes" }
  | { tipo: "produccion" }
  | { tipo: "campana"; campana: { nombre: string; pct: number; vigencia: Vigencia | null } | null }
  | { tipo: "producto"; nombre: string | null }
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
