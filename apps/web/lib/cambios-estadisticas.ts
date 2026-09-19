import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { inicioDeDiaLima, diaLima, inicioDeMesLima } from "@/lib/panel-serie";
import { tallasQueNoCalzan, type TallaQueNoCalza } from "@/lib/cambios-reglas";

export type EstadisticasCambios = {
  cambiosHoy: number;
  cambiosMes: number;
  /** Lo que valía lo que las clientas trajeron de vuelta este mes: lo que pagaron por
   *  cada prenda devuelta × cuántas. No es plata que entró ni salió (eso es la
   *  diferencia); es cuánta venta se "reabrió" por un cambio. */
  valorMes: number;
};

/** Los tres indicadores de la cabecera de Cambios — igual que `getResumenCaja`, se leen
 *  de la tabla real, no hay RPC dedicada para 3 números. Acotado a ESTA sede (no al
 *  alcance "todas las tiendas" del buscador: las cifras describen la sede en la que
 *  está parada la colaboradora). */
export async function getEstadisticasCambios(ubicacionId: string, ahora = new Date()): Promise<EstadisticasCambios> {
  const supabase = await createClient();
  const [hoyRes, mesRes] = await Promise.all([
    supabase
      .from("cambios")
      .select("id", { count: "exact", head: true })
      .eq("ubicacion_id", ubicacionId)
      .gte("created_at", inicioDeDiaLima(diaLima(ahora.getTime())).toISOString()),
    supabase
      .from("cambios")
      .select("cantidad, venta_item:venta_items ( precio_unitario )")
      .eq("ubicacion_id", ubicacionId)
      .gte("created_at", inicioDeMesLima(ahora.getTime()).toISOString()),
  ]);
  if (hoyRes.error) throw new Error(`No se pudo cargar cuántos cambios hubo hoy: ${hoyRes.error.message}`);
  const delMes = exigir(mesRes, "los cambios del mes");
  return {
    cambiosHoy: hoyRes.count ?? 0,
    cambiosMes: delMes.length,
    valorMes: delMes.reduce((suma, c) => suma + c.cantidad * Number(c.venta_item?.precio_unitario ?? 0), 0),
  };
}

/** Ventana de "Tallas que no calzan": un mes es poco para ver una horma con 3 tiendas. */
export const DIAS_VENTANA_TALLAS = 90;

/** Cambios de talla de los últimos 90 días, de todas las sedes que la persona puede ver
 *  (RLS de `cambios`): la horma de una prenda es la misma en Trujillo que en Lima, y el
 *  dato es para el Taller, no para una tienda. La pantalla lo pide solo para líderes. */
export async function getTallasQueNoCalzan(ahora = new Date()): Promise<TallaQueNoCalza[]> {
  const supabase = await createClient();
  const desde = inicioDeDiaLima(diaLima(ahora.getTime()) - DIAS_VENTANA_TALLAS);
  const filas = exigir(
    await supabase
      .from("cambios")
      .select(
        `cantidad,
         venta_item:venta_items ( variante:variantes ( talla:tallas ( valor ), producto:productos ( id, referencia ) ) ),
         variante_nueva:variantes ( talla:tallas ( valor ), producto:productos ( id ) )`
      )
      .gte("created_at", desde.toISOString()),
    "los cambios de talla de los últimos 90 días"
  );
  return tallasQueNoCalzan(
    filas.map((c) => ({
      referencia: c.venta_item?.variante?.producto?.referencia ?? "",
      productoVendidoId: c.venta_item?.variante?.producto?.id ?? "",
      productoEntregadoId: c.variante_nueva?.producto?.id ?? "",
      tallaVendida: c.venta_item?.variante?.talla?.valor ?? null,
      tallaEntregada: c.variante_nueva?.talla?.valor ?? null,
      cantidad: c.cantidad,
    }))
  );
}
