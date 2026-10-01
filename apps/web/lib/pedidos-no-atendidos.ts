import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { leerMotivo, leerRazon, type MotivoPedido, type RazonSeProbo } from "@/lib/se-probo-reglas";

// «Pedido no atendido en 1 toque» (D-79, ADR-0152, 20260922190000_pedidos_no_atendidos.sql).
// SOLO la lectura para la pantalla de verificación — el registro (`registrar_pedido_no_atendido`)
// todavía no lo llama ninguna pantalla real (nace enganchado al Punto de Venta en otra tanda de
// esta misma ronda, ver el ADR). RLS ya limita a la ubicación de quien mira
// (`fn_puede_operar_ubicacion`, igual que `apartados`): esta función no vuelve a filtrar por
// permiso, solo pide la sede para que la consulta no traiga de más.
//
// ADR-0288 D-6 (tanda 1d): la misma tabla guarda «buscó y no había» (`no_habia_talla`) y «se la probó y no la llevó»
// (`se_probo_no_llevo`, con su razón). Cada fila trae su motivo; quien cuenta «pedidos» filtra con `esPedidoDeTalla`.
export type PedidoNoAtendido = {
  id: string;
  productoId: string | null;
  productoReferencia: string | null;
  descripcionLibre: string | null;
  talla: string | null;
  motivo: MotivoPedido;
  razon: RazonSeProbo | null;
  creadoEn: string;
  resuelto: boolean;
  resueltoEn: string | null;
};

export async function getPedidosNoAtendidos(ubicacionId: string): Promise<PedidoNoAtendido[]> {
  const supabase = await createClient();
  const respuesta = await supabase
    .from("pedidos_no_atendidos")
    .select("id, producto_id, descripcion_libre, talla, motivo, razon, created_at, resuelto, resuelto_en, producto:productos ( referencia )")
    .eq("ubicacion_id", ubicacionId)
    // Los pendientes primero (lo más viejo arriba: es lo que más tiempo lleva esperando), los
    // resueltos al final para poder verificar que el botón sí los saca de la lista.
    .order("resuelto", { ascending: true })
    .order("created_at", { ascending: true });
  const filas = exigir(respuesta, "los pedidos no atendidos");

  return filas.map((f) => {
    const motivo = leerMotivo(f.motivo);
    return {
      id: f.id,
      productoId: f.producto_id,
      productoReferencia: (f.producto as { referencia: string } | null)?.referencia ?? null,
      descripcionLibre: f.descripcion_libre,
      talla: f.talla,
      motivo,
      razon: leerRazon(motivo, f.razon),
      creadoEn: f.created_at,
      resuelto: f.resuelto,
      resueltoEn: f.resuelto_en,
    };
  });
}
