import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

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
