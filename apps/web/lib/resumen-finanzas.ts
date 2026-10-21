import "server-only";
import { createClient } from "@/lib/supabase/server";
import { leerResumen, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";
import { calcularConfianza, leerHechosConfianza, type Confianza } from "@/lib/finanzas-confianza";
import { aplicarProvision, delMes, resumenDeProvision } from "@/lib/planilla-provision-reglas";
import { getProvisionPlanilla } from "@/lib/planilla-provision";
import { rangoMes } from "@/lib/gastos-reglas";

// Finanzas ▸ Resumen (ADR-0195 F10; contrato en 20260925200000_finanzas_resumen.sql). Solo LEE, en una sola llamada:
// `fn_resumen_finanzas` junta lo que ya calculan las fases y respeta el permiso de cada una. Si la lectura entera falla, la
// pantalla lo dice (principio 9): nunca muestra ceros como si fueran datos.

export type Lectura<T> = { datos: T; falla: string | null };

export async function getResumenFinanzas(pedido: { ubicacionId: string | null; soloEmpresa: boolean }): Promise<Lectura<ResumenFinanzas | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "fn_resumen_finanzas" as never,
    { p_ubicacion_id: pedido.ubicacionId, p_solo_empresa: pedido.soloEmpresa } as never
  );
  if (error) return { datos: null, falla: `No se pudo leer el resumen: ${error.message}` };
  return { datos: await conSueldosEstimados(leerResumen(data), pedido.ubicacionId), falla: null };
}

/**
 * Suma los sueldos ESTIMADOS (ADR-0453) al Estado de resultados del mes y al del anterior: lo que corresponde pagar hasta hoy según las
 * boletas de Dynamic, de un período que todavía no pagó. Fuera del libro (la base sigue igual) y marcado en cada fila. Una sola lectura
 * cubre los dos meses; el período que TERMINA en un mes es la planilla de ese mes (D-35). Sin estimación (Dynamic no la ve esta cuenta,
 * no abrió el período, o la lectura falló), el Resumen queda como la base lo dijo.
 */
async function conSueldosEstimados(r: ResumenFinanzas, ubicacionId: string | null): Promise<ResumenFinanzas> {
  if (r.resultadosMes.estado !== "ok" && r.resultadosAnterior.estado !== "ok") return r;
  const prov = await getProvisionPlanilla(rangoMes(r.mesAnterior).desde, rangoMes(r.mes).hasta, ubicacionId);
  if (!prov.length) return r;
  return {
    ...r,
    resultadosMes: r.resultadosMes.estado === "ok" ? { estado: "ok", datos: aplicarProvision(r.resultadosMes.datos, delMes(prov, r.mes)) } : r.resultadosMes,
    resultadosAnterior: r.resultadosAnterior.estado === "ok" ? { estado: "ok", datos: aplicarProvision(r.resultadosAnterior.datos, delMes(prov, r.mesAnterior)) } : r.resultadosAnterior,
  };
}

// El medidor de confianza (ADR-0417): los hechos salen de `fn_finanzas_confianza` (20261015235000) y la calificación la pone
// `lib/finanzas-confianza.ts`. Si la base no responde o la cuenta no ve el diario, la pantalla sigue sin el medidor: nunca
// muestra un 0 % como si fuera una medida.
export async function getConfianzaFinanzas(pedido: { ubicacionId: string | null }): Promise<Lectura<Confianza | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_finanzas_confianza" as never, { p_mes: null, p_ubicacion_id: pedido.ubicacionId } as never);
  if (error) return { datos: null, falla: `No se pudo medir la confianza: ${error.message}` };
  const hechos = leerHechosConfianza(data);
  // Con la planilla del mes sin pagar, la confianza cuenta los sueldos estimados con las boletas de Dynamic (ADR-0453).
  if (hechos.planilla.visible && !hechos.planilla.mesPagada && /^\d{4}-\d{2}-\d{2}$/.test(hechos.mes)) {
    const { desde, hasta } = rangoMes(hechos.mes.slice(0, 7));
    const provision = resumenDeProvision(await getProvisionPlanilla(desde, hasta, pedido.ubicacionId));
    return { datos: calcularConfianza({ ...hechos, planilla: { ...hechos.planilla, provision } }), falla: null };
  }
  return { datos: calcularConfianza(hechos), falla: null };
}
