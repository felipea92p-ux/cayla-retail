import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// «Pedido no atendido en 1 toque» (D-79, ADR-0152, 20260922190000_pedidos_no_atendidos.sql).
// SOLO la lectura para la pantalla de verificación — el registro (`registrar_pedido_no_atendido`)
// todavía no lo llama ninguna pantalla real (nace enganchado al Punto de Venta en otra tanda de
// esta misma ronda, ver el ADR). RLS ya limita a la ubicación de quien mira
// (`fn_puede_operar_ubicacion`, igual que `apartados`): esta función no vuelve a filtrar por
// permiso, solo pide la sede para que la consulta no traiga de más.
export type PedidoNoAtendido = {
  id: string;
  productoId: string | null;
  productoReferencia: string | null;
  descripcionLibre: string | null;
  talla: string | null;
  creadoEn: string;
  resuelto: boolean;
  resueltoEn: string | null;
};

export async function getPedidosNoAtendidos(ubicacionId: string): Promise<PedidoNoAtendido[]> {
  const supabase = await createClient();
  const respuesta = await supabase
    .from("pedidos_no_atendidos")
    .select("id, producto_id, descripcion_libre, talla, created_at, resuelto, resuelto_en, producto:productos ( referencia )")
    .eq("ubicacion_id", ubicacionId)
    // Los pendientes primero (lo más viejo arriba: es lo que más tiempo lleva esperando), los
    // resueltos al final para poder verificar que el botón sí los saca de la lista.
    .order("resuelto", { ascending: true })
    .order("created_at", { ascending: true });
  const filas = exigir(respuesta, "los pedidos no atendidos");

  return filas.map((f) => ({
    id: f.id,
    productoId: f.producto_id,
    productoReferencia: (f.producto as { referencia: string } | null)?.referencia ?? null,
    descripcionLibre: f.descripcion_libre,
    talla: f.talla,
    creadoEn: f.created_at,
    resuelto: f.resuelto,
    resueltoEn: f.resuelto_en,
  }));
}
