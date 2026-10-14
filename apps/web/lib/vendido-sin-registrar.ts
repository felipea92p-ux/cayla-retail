// Lo vendido «sin registrar» de una tienda (`prendas_por_regularizar`): la venta que se cobró con la prenda centinela porque la
// prenda no estaba en el sistema, anotada en caja con su categoría, talla y color. No dice QUÉ prenda se vendió, pero sí de qué
// TIPO: con eso, Frescura mide la rapidez de cada categoría (ADR-0208, act. 2026-10-10 (c): «rapidez sí, días no») y Análisis
// cuenta lo vendido de cada tipo en «Qué pedir» (ADR-0357, act. 2026-10-14). Una sola lectura para las dos pantallas.
//
// CONTRATO
//   PROMETE: las ventas pendientes y las cerradas sin prenda de la tienda desde `desde` (lo regularizado ya es una venta con su prenda
//            y lo anulado no se vendió), sin las de una familia apagada (la bolsa de despacho, ADR-0377), en orden y sin el corte de
//            1.000 filas de PostgREST.
//   ASUME:   la llama el servidor con la sesión de quien mira; la RLS deja leer la propia sede (el líder, todas).
//   NO HACE: no decide qué prenda se vendió; LANZA si la lectura falla: quien la llama decide si calla (Frescura) o lo dice (Análisis).
import type { createClient } from "@/lib/supabase/server";
import { categoriasFueraDeMotores, sinCategoriasApagadas } from "@/lib/familias-motores";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type VentaSinRegistrar = {
  categoriaId: string;
  /** `categorias.nombre`: único en la base (`categorias_nombre_clave_unica`), así que sirve para cruzar con el tipo de Análisis. */
  categoria: string;
  vendidoEn: string;
  estado: "pendiente" | "cerrada_sin_prenda";
};

const PAGINA = 1000;
const TOPE = 20_000;

export async function leerVendidoSinRegistrar(supabase: Supabase, sedeId: string, desde: string): Promise<VentaSinRegistrar[]> {
  const filas: { categoria_id: string; vendido_en: string; estado: VentaSinRegistrar["estado"]; categoria: { nombre: string } | null }[] = [];
  // Paginado y ordenado: PostgREST corta en 1.000 filas sin avisar, y una tienda en diciembre puede pasar de eso en 30 días.
  for (let inicio = 0; inicio < TOPE; inicio += PAGINA) {
    const { data, error } = await supabase
      .from("prendas_por_regularizar")
      .select("categoria_id, vendido_en, estado, categoria:categorias ( nombre )")
      .eq("ubicacion_id", sedeId)
      .in("estado", ["pendiente", "cerrada_sin_prenda"])
      .gte("vendido_en", desde)
      .order("vendido_en", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error || !data) throw new Error(error?.message ?? "sin respuesta");
    filas.push(...(data as unknown as typeof filas));
    if (data.length < PAGINA) break;
  }
  const fuera = await categoriasFueraDeMotores(supabase);
  return sinCategoriasApagadas(filas, fuera, (f) => f.categoria_id).map((f) => ({
    categoriaId: f.categoria_id,
    categoria: f.categoria?.nombre?.trim() || "Sin categoría",
    vendidoEn: f.vendido_en,
    estado: f.estado,
  }));
}

/** Cuántas se vendieron sin registrar de cada tipo (por nombre de categoría, como agrupa Análisis). */
export function sinRegistrarPorTipo(ventas: readonly Pick<VentaSinRegistrar, "categoria">[]): Record<string, number> {
  const porTipo: Record<string, number> = {};
  for (const v of ventas) porTipo[v.categoria] = (porTipo[v.categoria] ?? 0) + 1;
  return porTipo;
}

/**
 * Cuántas ventas sin su prenda siguen PENDIENTES en la tienda (sin tope de fechas): las que de verdad se pueden registrar en Por
 * regularizar. Las cerradas sin prenda ya no vuelven (ADR-0357, act. 2026-10-14: «Registrar 347» llevaba a una lista de 41). Null si no se
 * pudo contar. Nunca lanza.
 */
export async function contarPendientes(supabase: Supabase, sedeId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from("prendas_por_regularizar")
      .select("id", { count: "exact", head: true })
      .eq("ubicacion_id", sedeId)
      .eq("estado", "pendiente");
    return error || count === null ? null : count;
  } catch {
    return null;
  }
}
