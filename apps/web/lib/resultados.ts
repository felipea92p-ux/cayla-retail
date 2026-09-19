import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { DetalleGasto, DetalleMerma, FilaResultados } from "@/lib/resultados-reglas";

// Lectura del Estado de Resultados (ADR-0109 / ADR-0120; contrato en `20260918197000_fn_estado_resultados.sql`).
// Solo LEE y solo para el líder (la RPC lo exige). Toda la plata se calcula en Postgres, sobre el diario
// `fn_asientos`; aquí solo se normalizan los tipos: los `numeric` viajan como texto por JSON.

const n = (v: unknown): number => (v == null ? 0 : Number(v));

/** Una fila por sede activa, una «De la empresa» y una consolidada, del mes de Lima que contiene `mes` (`aaaa-mm-dd`). */
export async function getEstadoResultados(mes: string): Promise<FilaResultados[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_estado_resultados", { p_mes: mes }), "el Estado de Resultados");
  return filas.map((r) => ({
    ubicacionId: (r.ubicacion_id as string | null) ?? null,
    nombre: r.nombre,
    esConsolidado: !!r.es_consolidado,
    ventasNetas: n(r.ventas_netas),
    costoVentas: n(r.costo_ventas),
    fletes: n(r.fletes),
    mermas: n(r.mermas),
    margenBruto: n(r.margen_bruto),
    gastosOperacion: n(r.gastos_operacion),
    utilidadOperativa: n(r.utilidad_operativa),
    igvVentas: n(r.igv_ventas),
    ventasBrutas: n(r.ventas_brutas),
    detalleMermas: ((r.detalle_mermas as { regla: string; monto: number | string }[] | null) ?? []).map(
      (d): DetalleMerma => ({ regla: d.regla, monto: n(d.monto) }),
    ),
    detalleGastos: ((r.detalle_gastos as { cuenta: string; nombre: string; monto: number | string }[] | null) ?? []).map(
      (d): DetalleGasto => ({ cuenta: d.cuenta, nombre: d.nombre, monto: n(d.monto) }),
    ),
    unidadesSinCosto: n(r.unidades_sin_costo),
    mermasSinCosto: n(r.mermas_sin_costo),
    asientosDescuadrados: n(r.asientos_descuadrados),
  }));
}
