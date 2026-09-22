import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { Apartado } from "@/lib/apartados-reglas";

// Los apartados ABIERTOS de una ubicación (`retail.listar_apartados`, 20260920160000, ADR-0141).
// Solo lectura: se escribe únicamente por las RPC `apartar_stock`/`liberar_apartado`, que llaman los
// modales. La base ya limita a lo de la tienda de quien mira (una líder ve la que elija), ordena por
// fecha límite (lo que vence primero, o ya venció, sale arriba) y resuelve `puede_liberar` — la regla
// «solo quien apartó o una líder» no se repite en la app.
//
// Excepción de la TERMINAL (Felipe, 2026-09-22; `liberar_apartado` en 20260923020000): libera siempre, sea quien sea
// que apartó — entregar la prenda o soltar un apartado vencido es operación del mostrador. `listar_apartados` todavía
// calcula `puede_liberar` con la persona de la sesión (una terminal no tiene), así que aquí se abre para la terminal
// hasta que la lectura se alinee en la base. La base sigue siendo la que decide al liberar.
export async function getApartadosAbiertos(ubicacionId: string, opciones: { esTerminal?: boolean } = {}): Promise<Apartado[]> {
  const supabase = await createClient();
  const respuesta = await supabase.rpc("listar_apartados", { p_ubicacion_id: ubicacionId });
  // PGRST202 = la función todavía no existe (la migración no está pegada en producción): sin apartados, y las
  // demás pantallas siguen. TEMPORAL, mismo criterio que `getStockPorUbicacion` (ADR-0141).
  if (respuesta.error?.code === "PGRST202") return [];
  const filas = exigir(respuesta, "los apartados");

  return filas.map((f) => ({
    id: f.id,
    varianteId: f.variante_id,
    sku: f.sku,
    referencia: f.referencia,
    talla: f.talla ?? null,
    color: f.color ?? null,
    sububicacionId: f.sububicacion_id ?? null,
    cantidad: f.cantidad,
    clienta: f.clienta_nombre,
    contacto: f.clienta_contacto,
    nota: f.nota ?? null,
    venceEl: f.vence_el,
    creadoEn: f.created_at,
    apartoNombre: f.creado_por_nombre ?? null,
    puedeLiberar: opciones.esTerminal === true || f.puede_liberar,
  }));
}
