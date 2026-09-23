// Lectura de la cola «Por regularizar» (ADR-0179): prendas vendidas en caja antes de estar en el
// sistema. RLS deja ver solo las sedes que la persona puede operar; el líder, todas.
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { vencidasDesde } from "@/lib/por-regularizar-reglas";

export type FilaPorRegularizar = {
  id: string;
  descripcion: string;
  categoria: string;
  talla: string;
  color: string;
  precioCobrado: number;
  vendidoPor: string;
  vendidoEn: string;
  ubicacionId: string;
  sede: string;
  estado: "pendiente" | "regularizada" | "anulada";
  /** Solo regularizada: la prenda real y la diferencia (cobrado − oficial). */
  prendaReal: string | null;
  forma: "ya_registrada" | "llego_nueva" | null;
  diferencia: number | null;
};

/** Pendientes primero (las más antiguas arriba), después lo ya resuelto, de lo más nuevo a lo más viejo. */
export async function getPorRegularizar(ubicacionId: string | null): Promise<FilaPorRegularizar[]> {
  const supabase = await createClient();
  let consulta = supabase
    .from("prendas_por_regularizar")
    .select(
      `id, ubicacion_id, descripcion, precio_cobrado, vendido_por, vendido_en, estado, forma, diferencia,
       categoria:categorias ( nombre ), talla:tallas ( valor ), color:colores ( nombre ),
       ubicacion:ubicaciones ( nombre ), variante:variantes ( sku, producto:productos ( referencia ) )`,
    )
    .order("vendido_en", { ascending: false })
    .limit(200);
  if (ubicacionId) consulta = consulta.eq("ubicacion_id", ubicacionId);
  const filas = exigir(await consulta, "las prendas por regularizar");

  // `personas` vive en `public` (Dynamic): PostgREST no la embebe; se nombra con la misma función que Historial.
  const ids = [...new Set(filas.flatMap((f) => (f.vendido_por ? [f.vendido_por] : [])))];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    for (const n of exigir(await supabase.rpc("fn_nombres_personas", { p_ids: ids }), "quién vendió cada prenda")) nombres.set(n.id, n.nombre);
  }

  const aFila = (f: (typeof filas)[number]): FilaPorRegularizar => ({
    id: f.id,
    descripcion: f.descripcion,
    categoria: f.categoria?.nombre ?? "",
    talla: f.talla?.valor ?? "",
    color: f.color?.nombre ?? "",
    precioCobrado: Number(f.precio_cobrado),
    vendidoPor: (f.vendido_por && nombres.get(f.vendido_por)) || "—",
    vendidoEn: f.vendido_en,
    ubicacionId: f.ubicacion_id,
    sede: f.ubicacion?.nombre ?? "",
    estado: f.estado as FilaPorRegularizar["estado"],
    prendaReal: f.variante ? `${f.variante.producto?.referencia ?? ""} · ${f.variante.sku}` : null,
    forma: f.forma as FilaPorRegularizar["forma"],
    diferencia: f.diferencia === null ? null : Number(f.diferencia),
  });
  const todas = filas.map(aFila);
  const pendientes = todas.filter((f) => f.estado === "pendiente").reverse();
  return [...pendientes, ...todas.filter((f) => f.estado !== "pendiente")];
}

/** Para el aviso del inicio: pendientes que ya pasaron el plazo. Solo lo pide el líder. null = no se pudo leer. */
export async function contarVencidas(): Promise<number | null> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("prendas_por_regularizar")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente")
    .lte("vendido_en", vencidasDesde());
  // Nunca lanza: si no se puede leer, el inicio lo dice en la tarjeta en vez de dibujar un 0.
  return error ? null : (count ?? 0);
}
