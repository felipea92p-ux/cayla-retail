import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { inicioDeDiaLima, diaLima, inicioDeMesLima } from "@/lib/panel-serie";

export type EstadisticasCambios = {
  cambiosHoy: number;
  cambiosMes: number;
  prendaMasCambiada: { referencia: string; codigo: string } | null;
};

/** Mini-fila de estadísticas del rediseño de Cambios — igual que `getResumenCaja`,
 *  se agrega en JS a partir de tablas reales, no hay RPC dedicada para 3 números que
 *  se piden una vez por carga de pantalla. Acotado a ESTA sede (no respeta el toggle
 *  "buscar en todas las sedes" — ese es del buscador puntual, la mini-fila describe
 *  la sede en la que está parada la colaboradora, como dice el encabezado). */
export async function getEstadisticasCambios(ubicacionId: string, ahora = new Date()): Promise<EstadisticasCambios> {
  const supabase = await createClient();
  const inicioDia = inicioDeDiaLima(diaLima(ahora.getTime()));
  const inicioMes = inicioDeMesLima(ahora.getTime());

  const [hoyRes, mesRes] = await Promise.all([
    supabase
      .from("cambios")
      .select("id", { count: "exact", head: true })
      .eq("ubicacion_id", ubicacionId)
      .gte("created_at", inicioDia.toISOString()),
    supabase
      .from("cambios")
      .select("venta_item_id")
      .eq("ubicacion_id", ubicacionId)
      .gte("created_at", inicioMes.toISOString()),
  ]);
  if (hoyRes.error) throw new Error(`No se pudo cargar cuántos cambios hubo hoy: ${hoyRes.error.message}`);
  const cambiosDelMes = exigir(mesRes, "los cambios del mes");

  let prendaMasCambiada: EstadisticasCambios["prendaMasCambiada"] = null;
  if (cambiosDelMes.length > 0) {
    const itemIds = [...new Set(cambiosDelMes.map((c) => c.venta_item_id))];
    const items = exigir(
      await supabase.from("venta_items").select("id, variante_id").in("id", itemIds),
      "las prendas de los cambios del mes"
    );
    const varianteIdPorItem = new Map(items.map((i) => [i.id, i.variante_id]));

    const conteoPorVariante = new Map<string, number>();
    for (const c of cambiosDelMes) {
      const varianteId = varianteIdPorItem.get(c.venta_item_id);
      if (varianteId) conteoPorVariante.set(varianteId, (conteoPorVariante.get(varianteId) ?? 0) + 1);
    }
    const top = [...conteoPorVariante.entries()].sort((a, b) => b[1] - a[1])[0];

    if (top) {
      const [varianteIdTop] = top;
      const { data: v, error } = await supabase
        .from("variantes")
        .select("codigo, sku, producto:productos ( referencia )")
        .eq("id", varianteIdTop)
        .maybeSingle();
      if (error) throw new Error(`No se pudo cargar la prenda más cambiada: ${error.message}`);
      if (v) prendaMasCambiada = { referencia: v.producto?.referencia ?? "(sin referencia)", codigo: v.codigo || v.sku || "sin código" };
    }
  }

  return { cambiosHoy: hoyRes.count ?? 0, cambiosMes: cambiosDelMes.length, prendaMasCambiada };
}
