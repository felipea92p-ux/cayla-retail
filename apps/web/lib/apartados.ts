import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { Apartado } from "@/lib/apartados-reglas";

// Los apartados ABIERTOS de una ubicación (`retail.listar_apartados`, 20260920160000, ADR-0141).
// Solo lectura: se escribe únicamente por las RPC `apartar_stock`/`liberar_apartado`, que llaman los
// modales. La base ya limita a lo de la tienda de quien mira (una líder ve la que elija), ordena por
// fecha límite (lo que vence primero, o ya venció, sale arriba) y resuelve `puede_liberar` — la regla
// «solo quien apartó o una líder» no se repite en la app.
export async function getApartadosAbiertos(ubicacionId: string): Promise<Apartado[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("listar_apartados", { p_ubicacion_id: ubicacionId }), "los apartados");

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
    puedeLiberar: f.puede_liberar,
  }));
}
