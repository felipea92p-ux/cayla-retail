// Las listas cerradas de la hoja «Prenda sin registrar» (ADR-0179): categorías, tallas, colores y las tallas de cada categoría.
// Las piden dos pantallas con la MISMA hoja: Vender (al anotar la prenda) y Ventas sin registrar (al corregir lo anotado, ADR-0369).
// Una sola lectura para las dos: si una ofreciera otra lista, lo corregido podría ser algo que la caja nunca ofrece.
import { createClient } from "./supabase/server";
import { getEjesPorCategoria } from "./catalogo-v2";
import { ordenTalla } from "./catalogo-grupos";
import { usoDeColores, type ListasPrendaLibre } from "./prenda-sin-registrar-reglas";

/** Lo leído de la base, antes de cruzarlo con el catálogo. Si una lista no carga, sale vacía: la pantalla no se cae por esto. */
export type ListasPrendaLibreLeidas = Omit<ListasPrendaLibre, "usoColores">;

export async function leerListasPrendaLibre(): Promise<ListasPrendaLibreLeidas> {
  const supabase = await createClient();
  const [resCategorias, resTallas, resColores, ejes] = await Promise.all([
    supabase.from("categorias").select("id, nombre, prefijo, familia").eq("activo", true).order("nombre"),
    supabase.from("tallas").select("id, valor").eq("activo", true).eq("estado", "aprobado"),
    supabase.from("colores").select("codigo, nombre, hex, familia_color, sinonimos").eq("activo", true).order("orden").order("nombre"),
    // Las tallas de cada categoría (`categoria_tallas`) y sus habituales. Si no cargan, la hoja ofrece todas.
    getEjesPorCategoria().catch(() => null),
  ]);
  return {
    categorias: resCategorias.data ?? [],
    tallas: [...(resTallas.data ?? [])].sort((a, b) => ordenTalla(a.valor, b.valor)),
    tallasPorCategoria: ejes?.tallas ?? null,
    habitualesPorCategoria: ejes?.habituales ?? {},
    colores: (resColores.data ?? []).map((c) => ({ codigo: c.codigo, nombre: c.nombre, hex: c.hex, familiaColor: c.familia_color ?? "", sinonimos: c.sinonimos ?? [] })),
  };
}

/** Suma el uso de colores por categoría, que sale del catálogo que la pantalla ya cargó (sin otra consulta). */
export function armarListasPrendaLibre(leidas: ListasPrendaLibreLeidas, variantes: readonly { categoria: string | null; color: string | null }[]): ListasPrendaLibre {
  return { ...leidas, usoColores: usoDeColores(variantes, leidas.categorias, leidas.colores) };
}
