import { createClient } from "@/lib/supabase/server";
import { pedidoEntreSedesDeFila, type PedidoEntreSedes } from "@/lib/pedidos-entre-sedes-reglas";
import { pedidoConClienteDeFila } from "@/lib/pedidos-con-cliente-reglas";
import { filaPorAtenderDeFila, type FilaPorAtender } from "@/lib/pedidos-por-atender-reglas";
import { paraEnviarDeFila, type PrendaParaEnviar } from "@/lib/para-enviar-reglas";

// «Pedir a otra sede» (ADR-0242 D-7, 20260927210000): los pedidos de reposición que la sede hizo o le hicieron.
// Solo la lectura server-side; las escrituras (`pedir_a_otra_sede`, `enviar_pedido_a_otra_sede`,
// `cancelar_pedido_a_otra_sede`) se llaman desde los componentes cliente, como el resto de Traslados.
//
// Es secundaria en la pantalla de Traslados: si la migración todavía no está en esta base (PGRST202) o la lectura
// falla, devuelve una lista vacía y la tarjeta simplemente no aparece — la lista de traslados no se cae por esto.
export async function getPedidosEntreSedes(ubicacionId: string): Promise<PedidoEntreSedes[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_pedidos_entre_sedes", { p_ubicacion_id: ubicacionId });
  if (error) {
    if (error.code !== "PGRST202") console.error("No se pudieron leer los pedidos entre sedes:", error.message);
    return [];
  }
  return (data ?? []).map((f) => pedidoEntreSedesDeFila(f as unknown as Record<string, unknown>));
}

// ADR-0328 act. 17 (20261005100100): los pedidos PARA UN CLIENTE de la sede, con dónde está apartada la prenda en el
// origen y si ya se le avisó. Los lee Traslados (en la misma tarjeta que la reposición) y Vender (la franja «Llegó para un
// cliente»). Secundaria como la de arriba: sin la migración o si falla, lista vacía y lo demás sigue.
export async function getPedidosConCliente(ubicacionId: string): Promise<PedidoEntreSedes[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_pedidos_con_cliente", { p_ubicacion_id: ubicacionId });
  if (error) {
    if (error.code !== "PGRST202") console.error("No se pudieron leer los pedidos para clientes:", error.message);
    return [];
  }
  return (data ?? []).map((f) => pedidoConClienteDeFila(f as unknown as Record<string, unknown>));
}

/**
 * Lo que espera respuesta entre sedes (ADR-0328 act. 17): el número de «Te piden» del menú y el aviso de las 48 h.
 * `null` = no se pudo leer (nunca se dibuja como «nada pendiente»). Sin la migración (PGRST202) también es `null`: no hay
 * cómo saberlo, y un número inventado en el menú es peor que ninguno.
 */
export async function getPedidosPorAtender(ubicacionId: string): Promise<FilaPorAtender[] | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_pedidos_por_atender", { p_ubicacion_id: ubicacionId });
    if (error) {
      if (error.code !== "PGRST202") console.error("No se pudieron leer los pedidos por atender:", error.message);
      return null;
    }
    return (data ?? []).flatMap((f) => {
      const fila = filaPorAtenderDeFila(f as unknown as Record<string, unknown>);
      return fila ? [fila] : [];
    });
  } catch (e) {
    console.error("No se pudieron leer los pedidos por atender:", e);
    return null;
  }
}

/** La lista «Para enviar» de la sede (20261005100200). Secundaria: sin la migración o si falla, vacía. */
export async function getParaEnviar(ubicacionId: string): Promise<PrendaParaEnviar[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_para_enviar", { p_ubicacion_id: ubicacionId });
  if (error) {
    if (error.code !== "PGRST202") console.error("No se pudo leer la lista para enviar:", error.message);
    return [];
  }
  return (data ?? []).map((f) => paraEnviarDeFila(f as unknown as Record<string, unknown>));
}
