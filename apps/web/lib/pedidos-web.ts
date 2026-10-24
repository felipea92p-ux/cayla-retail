import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { EmpresaDeSede } from "@/lib/pedidos-web-reglas";

/**
 * El número del menú «Tienda web ▸ Pedidos» (ADR-0408, act. 8): los pedidos que esperan confirmación en esta tienda y todavía están a
 * tiempo (`fn_pedidos_web_por_confirmar`). Un pedido sin confirmar se cierra solo, y el menú es lo que se ve desde cualquier
 * pantalla. Total como el contador de Traslados: nunca lanza (el layout no tiene `error.tsx` propio); `null` = sin número.
 */
export const getPedidosWebPorConfirmar = cache(async (ubicacionId: string): Promise<number | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_pedidos_web_por_confirmar", { p_ubicacion_id: ubicacionId });
    if (error) {
      // PGRST202: la función todavía no está en esta base (la migración no está pegada): el menú sale sin número.
      if (error.code !== "PGRST202") console.error("Contador de pedidos web:", error.message);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (e) {
    console.error("Contador de pedidos web:", e);
    return null;
  }
});

/**
 * Las empresas que conviven en esta sede (CAYLA y CLAURE; hoy solo Lima, ADR-0463), de `empresa_sedes` por `fn_empresas_de_sede`, no del
 * nombre de la sede. Con una sola (Trujillo, Arequipa) o sin respuesta: `[]`, y el detalle de un pedido no nombra la empresa. Nunca lanza.
 */
export const getEmpresasDeLaSede = cache(async (ubicacionId: string): Promise<EmpresaDeSede[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_empresas_de_sede", { p_sede_id: ubicacionId });
    if (error || !Array.isArray(data) || data.length < 2) return [];
    return data.map((e) => ({ id: e.id, clave: e.clave, nombre: e.nombre }));
  } catch {
    return [];
  }
});

/** A qué empresa pertenece cada producto (`productos.empresa_id`): producto → id de empresa. Sin respuesta, vacío (nadie queda con empresa inventada). */
export async function getEmpresaDeProductos(productoIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(productoIds)];
  if (ids.length === 0) return new Map();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("productos").select("id, empresa_id").in("id", ids);
    if (error || !data) return new Map();
    return new Map(data.map((p) => [p.id, p.empresa_id]));
  } catch {
    return new Map();
  }
}
