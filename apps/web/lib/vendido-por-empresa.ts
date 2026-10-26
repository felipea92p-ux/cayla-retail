import { createClient } from "@/lib/supabase/server";
import { limitesUTC, type FiltrosHistorial } from "@/lib/ventas-historial-reglas";
import { vendidoDeLaBase, vendidoPorCaja, type VendidoEmpresa } from "@/lib/vendido-por-empresa-reglas";

// Lo vendido por empresa (ADR-0532): CAYLA y CLAURE comparten caja en Lima. Solo lee. Las cuentas y lo que se dibuja viven en
// `lib/vendido-por-empresa-reglas.ts`.
//
// SE DEGRADA. Si la base todavía no tiene las funciones (la web se publicó antes que la migración) o no responde, devuelve `null` y la
// pantalla sale como antes, sin el reparto: es información de más, nunca bloquea la caja ni el historial (principio 9).

/** Lo vendido por empresa en el Historial, con los MISMOS filtros que sus totales (`fn_totales_historial_ventas`): su suma es el
 *  «vendido» de la cabecera. El buscador no lo cambia (las cifras son del período). */
export async function getVendidoPorEmpresaHistorial(f: FiltrosHistorial): Promise<VendidoEmpresa[] | null> {
  const supabase = await createClient();
  const { desdeISO, hastaISO } = limitesUTC(f.desde, f.hasta);
  const { data, error } = await supabase.rpc("fn_vendido_por_empresa", {
    p_desde: desdeISO ?? undefined,
    p_hasta: hastaISO ?? undefined,
    p_sede_id: f.sedeId ?? undefined,
    p_vendedor_id: f.vendedorId ?? undefined,
    p_estado: f.estado,
    p_pago: f.pago ?? undefined,
    p_comprobante: f.comprobante,
    p_incluir_prueba: f.incluirPrueba,
  });
  if (error || !data) return null;
  return data.map(vendidoDeLaBase);
}

/** Lo vendido por empresa en cada turno de caja (las que la cuenta puede ver), o `null` si no se pudo leer. */
export async function getVendidoPorEmpresaDeCajas(cajaIds: string[]): Promise<Map<string, VendidoEmpresa[]> | null> {
  if (cajaIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_vendido_por_empresa_de_cajas", { p_cajas: cajaIds });
  if (error || !data) return null;
  return vendidoPorCaja(data);
}
