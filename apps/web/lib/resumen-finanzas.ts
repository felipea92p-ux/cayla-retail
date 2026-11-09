import "server-only";
import { createClient } from "@/lib/supabase/server";
import { explicarFallaLectura, leerResumen, type ResumenFinanzas } from "@/lib/resumen-finanzas-reglas";
import { capturarError } from "@/lib/errores";
import { contarPrendasPorRegistrar } from "@/lib/costo-estimado";
import { calcularConfianza, leerHechosConfianza, type Confianza } from "@/lib/finanzas-confianza";
import { aplicarProvision, delMes, faltanSueldosPorFalla, resumenDeProvision } from "@/lib/planilla-provision-reglas";
import { getProvisionPlanilla } from "@/lib/planilla-provision";
import { rangoMes } from "@/lib/gastos-reglas";
import { conIgvDeLasVentasDe } from "@/lib/igv-ventas";
import { mesAnterior } from "@/lib/resultados-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import type { FilaProvision } from "@/lib/planilla-provision-reglas";

// Finanzas ▸ Resumen (ADR-0195 F10; contrato en 20260925200000_finanzas_resumen.sql). Solo LEE, en una sola llamada:
// `fn_resumen_finanzas` junta lo que ya calculan las fases y respeta el permiso de cada una. Si la lectura entera falla, la
// pantalla lo dice (principio 9): nunca muestra ceros como si fueran datos.

export type Lectura<T> = { datos: T; falla: string | null; sueldosSinLeer?: boolean };

export async function getResumenFinanzas(pedido: { ubicacionId: string | null; soloEmpresa: boolean }): Promise<Lectura<ResumenFinanzas | null>> {
  const supabase = await createClient();
  // Los sueldos estimados se piden A LA VEZ que el resumen (ADR-0583): antes se esperaba a que el resumen terminara para saber su mes, y
  // eso sumaba una espera entera. El mes es el de hoy en Lima, el mismo que usa la base; si justo a medianoche no coinciden, se piden otra vez.
  const mes = hoyLima().slice(0, 7);
  const [{ data, error }, provision] = await Promise.all([
    supabase.rpc("fn_resumen_finanzas" as never, { p_ubicacion_id: pedido.ubicacionId, p_solo_empresa: pedido.soloEmpresa } as never),
    getProvisionPlanilla(rangoMes(mesAnterior(mes)).desde, rangoMes(mes).hasta, pedido.ubicacionId),
  ]);
  if (error) {
    capturarError("finanzas.resumen", error);
    return { datos: null, falla: explicarFallaLectura(error, "leer el resumen") };
  }
  const { datos, sinLeer } = await conSueldosEstimados(leerResumen(data), pedido.ubicacionId, { mes, ...provision });
  return { datos, falla: null, sueldosSinLeer: sinLeer };
}

/**
 * «Hoy te toca» dice cuánto necesitaba vender la tienda que perdió el mes pasado, y eso va con IGV (tarea 19). `fn_resumen_finanzas` no lo trae: se lee aparte y solo si alguna tienda
 * perdió. Si no se puede leer, las filas quedan como están y el aviso dice «sin IGV».
 */
export async function conIgvDelMesAnterior<L extends { datos: ResumenFinanzas | null }>(lectura: L): Promise<L> {
  const r = lectura.datos;
  if (r?.resultadosAnterior.estado !== "ok" || !r.resultadosAnterior.datos.some((f) => f.unidad === "tienda" && f.resultado < 0)) return lectura;
  const { desde, hasta } = rangoMes(r.mesAnterior);
  const { datos } = await conIgvDeLasVentasDe(desde, hasta, { datos: r.resultadosAnterior.datos, falla: null });
  return { ...lectura, datos: { ...r, resultadosAnterior: { estado: "ok", datos } } };
}

/**
 * Suma los sueldos ESTIMADOS (ADR-0453) al Estado de resultados del mes y al del anterior: lo que corresponde pagar hasta hoy según las
 * boletas de Dynamic, de un período que todavía no pagó. Fuera del libro (la base sigue igual) y marcado en cada fila. Una sola lectura
 * cubre los dos meses (pedida a la vez que el resumen: `leida`); el período que TERMINA en un mes es la planilla de ese mes (D-35). Sin estimación (Dynamic no la ve esta cuenta,
 * no abrió el período, o la lectura falló), el Resumen queda como la base lo dijo.
 */
async function conSueldosEstimados(r: ResumenFinanzas, ubicacionId: string | null, leida: { mes: string; filas: FilaProvision[]; sinLeer: boolean }): Promise<{ datos: ResumenFinanzas; sinLeer: boolean }> {
  if (r.resultadosMes.estado !== "ok" && r.resultadosAnterior.estado !== "ok") return { datos: r, sinLeer: false };
  const { filas: prov, sinLeer: caida } = leida.mes === r.mes ? leida : await getProvisionPlanilla(rangoMes(r.mesAnterior).desde, rangoMes(r.mes).hasta, ubicacionId);
  const sinLeer = faltanSueldosPorFalla(caida, r.resultadosMes.estado === "ok" ? r.resultadosMes.datos : []);
  if (!prov.length) return { datos: r, sinLeer };
  return {
    datos: {
      ...r,
      resultadosMes: r.resultadosMes.estado === "ok" ? { estado: "ok", datos: aplicarProvision(r.resultadosMes.datos, delMes(prov, r.mes)) } : r.resultadosMes,
      resultadosAnterior: r.resultadosAnterior.estado === "ok" ? { estado: "ok", datos: aplicarProvision(r.resultadosAnterior.datos, delMes(prov, r.mesAnterior)) } : r.resultadosAnterior,
    },
    sinLeer,
  };
}

// El medidor de confianza (ADR-0417): los hechos salen de `fn_finanzas_confianza` (20261015235000) y la calificación la pone
// `lib/finanzas-confianza.ts`. Si la base no responde o la cuenta no ve el diario, la pantalla sigue sin el medidor: nunca
// muestra un 0 % como si fuera una medida.
export async function getConfianzaFinanzas(pedido: { ubicacionId: string | null }, mes?: string): Promise<Lectura<Confianza | null>> {
  const supabase = await createClient();
  // `mes` («2026-09»): la confianza del mes que se mira en la barra del telar; sin él, la base usa el mes en curso.
  const { data, error } = await supabase.rpc("fn_finanzas_confianza" as never, { p_mes: mes ? `${mes}-01` : null, p_ubicacion_id: pedido.ubicacionId } as never);
  if (error) {
    capturarError("finanzas.resumen.confianza", error);
    return { datos: null, falla: explicarFallaLectura(error, "medir qué tan seguro es este número") };
  }
  const hechos = leerHechosConfianza(data);
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(hechos.mes);
  const { desde, hasta } = rangoMes((fechaValida ? hechos.mes : `${hoyLima().slice(0, 7)}-01`).slice(0, 7));
  // Con la planilla del mes sin pagar, la confianza cuenta los sueldos estimados con las boletas de Dynamic (ADR-0453).
  const pideSueldos = hechos.planilla.visible && !hechos.planilla.mesPagada && fechaValida;
  // Cuántas siguen por registrar, para no prometer un registro que ya no se puede hacer (tarea 75).
  const hayEstimado = hechos.costo.unidadesEstimadas > 0 || hechos.costo.unidadesSinCosto > 0;
  const [sueldos, pendientes] = await Promise.all([
    pideSueldos ? getProvisionPlanilla(desde, hasta, pedido.ubicacionId) : Promise.resolve(null),
    hayEstimado ? contarPrendasPorRegistrar(desde, hasta, pedido.ubicacionId) : Promise.resolve(null),
  ]);
  return {
    datos: calcularConfianza({
      ...hechos,
      costo: { ...hechos.costo, ...(hayEstimado ? { pendientes } : {}) },
      planilla: sueldos ? { ...hechos.planilla, provision: resumenDeProvision(sueldos.filas), sinLeer: sueldos.sinLeer } : hechos.planilla,
    }),
    falla: null,
  };
}
