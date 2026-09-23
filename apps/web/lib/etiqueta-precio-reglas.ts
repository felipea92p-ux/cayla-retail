// Lógica pura de la ETIQUETA DE PRECIO (la de papel que cuelga de la prenda; ADR-0180). Sin React ni Supabase,
// para poder probarla. La lectura vive en `lib/etiquetas-precio.ts` y el dibujo en `components/EtiquetaPrecio.tsx`.
//
// OJO CON EL NOMBRE: en el resto del sistema «etiqueta» es la CAMPAÑA (Black Friday, Aniversario — ADR-0107). Esta es
// la etiqueta de precio impresa; por eso todo lo suyo dice «etiqueta de precio» o `EtiquetaPrecio`, nunca «etiqueta» a secas.

import { ordenTalla } from "./catalogo-grupos";
import { normalizarNombre } from "./patron-visual";

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
  precio: number;
  /** Unidades que entraron: cuántas etiquetas se proponen. */
  cantidad: number;
};

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
    etiquetas.push({
      varianteId: v.id,
      codigo,
      prenda: v.prenda,
      color: v.color,
      talla: v.talla?.trim() || null,
      tallasDelModelo: tallasDelModelo(v, hermanas),
      precio: v.precio,
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

/** El enlace a la pantalla de impresión desde el resultado de un ingreso: los lotes de Recibir / Ingreso sin
 *  comprobante, o la producción cerrada del Taller. */
export function urlEtiquetasDePrecio(origen: { lotes: string[] } | { produccion: string }): string {
  return "produccion" in origen ? `/etiquetas-de-precio?produccion=${origen.produccion}` : `/etiquetas-de-precio?lotes=${origen.lotes.join(",")}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los ids que llegan por la URL (`?lotes=a,b`): cualquiera puede escribirla, así que solo pasan ids bien formados. */
export function idsDeParam(param: string | string[] | undefined): string[] {
  const partes = (Array.isArray(param) ? param : [param ?? ""]).flatMap((p) => p.split(","));
  return [...new Set(partes.map((p) => p.trim()).filter((p) => UUID.test(p)))];
}
