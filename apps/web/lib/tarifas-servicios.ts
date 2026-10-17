import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC_TARIFAS_DE_SERVICIOS, leerTarifasDeServicios, type TarifaDeServicio } from "@/lib/tarifas-servicios-reglas";

// La lista de precios de los servicios de afuera (ADR-0400, actividad 8c): lectura del servidor. Solo la ve el líder (la base responde NULL a los demás). Es un dato de apoyo —el directorio de proveedores sigue
// vivo sin ella—, así que si falla NO tumba la pantalla: devuelve `null` y la pestaña dice que no pudo leerla (principio 9), nunca «no hay tarifas».

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

export async function getTarifasDeServicios(): Promise<TarifaDeServicio[] | null> {
  const supabase = await createClient();
  // La función es nueva y los tipos generados todavía no la conocen (se regeneran con el volcado).
  const r = await (supabase.rpc(RPC_TARIFAS_DE_SERVICIOS as never) as unknown as Respuesta);
  if (r.error) {
    console.error(`${RPC_TARIFAS_DE_SERVICIOS}: ${r.error.message}`);
    return null;
  }
  return leerTarifasDeServicios(r.data);
}
