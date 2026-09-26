import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerTodas } from "@/lib/resultado";
import { leerFilaPorPagar, type FilaPorPagar } from "@/lib/por-pagar-consolidado-reglas";
import type { UbicacionGastos, Ver } from "@/lib/gastos-reglas";
import type { PersonaActualV2 } from "@/lib/persona-actual";

// Finanzas ▸ Cuentas y dinero ▸ Por pagar (ADR-0195 F4). Una sola lectura, `fn_por_pagar_consolidado` (20260925120000):
// ya mira solo lo que la cuenta ve (el líder, todo; con Cuentas y dinero, su tienda). Si falla, la pantalla se dibuja igual
// y lo dice (principio 9): nunca muestra «S/ 0» como si no se debiera nada.

type Lectura<T> = { datos: T; falla: string | null };

/** Lo que se debe según «Ver»: todas (comprobantes enteros), una unidad (su parte) o la empresa. `hasta` = vence hasta esa fecha. */
export async function getPorPagarConsolidado(ver: Ver, hasta: string | null = null): Promise<Lectura<FilaPorPagar[]>> {
  const supabase = await createClient();
  // Una fila por comprobante con saldo: hoy decenas. PostgREST cortaría en 1.000 sin avisar y la deuda saldría menor, así
  // que se lee por páginas, en serie (ADR-0192); el orden es el de la función, cerrado con el id.
  const { data, error } = await leerTodas(
    (desde, h) =>
      supabase
        .rpc("fn_por_pagar_consolidado" as never, { p_ubicacion_id: ver.ubicacionId, p_hasta: hasta, p_solo_empresa: ver.soloEmpresa } as never)
        .order("vence" as never)
        .order("proveedor" as never)
        .order("documento" as never)
        .order("id" as never)
        .range(desde, h) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
    { enParalelo: 1 },
  );
  if (error) return { datos: [], falla: `No se pudo leer lo que se debe: ${error.message}` };
  return { datos: (data ?? []).map(leerFilaPorPagar), falla: null };
}

/**
 * Las unidades que se pueden elegir en «Ver»: el líder, todas las activas (tiendas, Taller y almacén); quien tiene el
 * módulo, solo la sede donde trabaja (la base no le devuelve otra cosa).
 */
export async function getUnidadesPorPagar(persona: Pick<PersonaActualV2, "rol" | "ubicacionId" | "ubicacionEtiqueta">): Promise<UbicacionGastos[]> {
  if (persona.rol !== "lider") return persona.ubicacionId ? [{ id: persona.ubicacionId, nombre: persona.ubicacionEtiqueta }] : [];
  const supabase = await createClient();
  const { data } = await supabase.from("ubicaciones").select("id, nombre, tipo").eq("activo", true);
  const orden = { tienda: 0, taller: 1, almacen: 2 } as Record<string, number>;
  return ((data ?? []) as { id: string; nombre: string; tipo: string }[])
    .sort((a, b) => (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9) || a.nombre.localeCompare(b.nombre, "es"))
    .map((u) => ({ id: u.id, nombre: u.nombre }));
}
