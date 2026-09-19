import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { NotaPendiente } from "./nota-pendiente-reglas";

// Indicadores de Compras para decidir (ADR-0111). Solo LEE. Cada función es una llamada
// a una función SQL del contrato de `docs/adr/0111-…md` (sección «Lectura»); las cifras
// se calculan en Postgres, nunca en la página (una página trae ≤ 50 filas, la deuda
// puede ser más). Los `numeric` de Postgres viajan como texto por JSON: se normalizan
// acá, una sola vez, para que las pantallas reciban `number`.
//
// Las llamadas son tipadas: los tipos de `packages/database` se generan contra la base local
// (`pnpm --filter @cayla-retail/database gen-types`) y traen estas funciones. Cada función
// devuelve una sola fila de agregados o una lista corta; el `Number(...)` de cada campo cubre
// que un `numeric` de Postgres viaje como texto por JSON.

const n = (v: unknown): number => (v == null ? 0 : Number(v));
const nOpt = (v: unknown): number | null => (v == null ? null : Number(v));

// ---------------------------------------------------------------- resumen extra
export type ResumenComprasExtra = {
  /** Unidades facturadas que aún no llegan (y no fueron cerradas por faltante). */
  unidadesPendientes: number;
  /** Valor S/ de esa mercadería por llegar (proporcional al pendiente de cada comprobante). */
  valorPorRecibir: number;
  /** Días de atraso del comprobante más atrasado; `null` si ninguno está atrasado. */
  diasMasAtrasada: number | null;
  documentoMasAtrasada: string | null;
  proveedorMasAtrasado: string | null;
  comprasMes: number;
  comprasMesAnterior: number;
  /** Crédito fiscal del mes: IGV de facturas menos el IGV de las notas de crédito del mes. */
  igvMes: number;
  topProveedorId: string | null;
  topProveedorNombre: string | null;
  /** 0–100: qué parte de la deuda está en el proveedor al que más se le debe. */
  topProveedorPct: number;
};

export async function getResumenComprasExtra(): Promise<ResumenComprasExtra> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("resumen_compras_extra"), "los indicadores de compras");
  const r = filas[0];
  return {
    unidadesPendientes: n(r?.unidades_pendientes),
    valorPorRecibir: n(r?.valor_por_recibir),
    diasMasAtrasada: nOpt(r?.dias_mas_atrasada),
    documentoMasAtrasada: (r?.documento_mas_atrasada as string | null) ?? null,
    proveedorMasAtrasado: (r?.proveedor_mas_atrasado as string | null) ?? null,
    comprasMes: n(r?.compras_mes),
    comprasMesAnterior: n(r?.compras_mes_anterior),
    igvMes: n(r?.igv_mes),
    topProveedorId: (r?.top_proveedor_id as string | null) ?? null,
    topProveedorNombre: (r?.top_proveedor_nombre as string | null) ?? null,
    topProveedorPct: n(r?.top_proveedor_pct),
  };
}

// ---------------------------------------------------------------- deuda por vencimiento
export type TramoVencimiento = "vencida" | "0_7" | "8_30" | "mas_30";
export type DeudaPorVencimiento = { tramo: TramoVencimiento; comprobantes: number; monto: number };

/** Siempre 4 filas, en este orden (vencida, 0–7, 8–30, más de 30), aunque sean ceros. */
export async function getDeudaPorVencimiento(): Promise<DeudaPorVencimiento[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("deuda_por_vencimiento"), "la deuda por vencimiento");
  return filas.map((f) => ({ tramo: f.tramo as TramoVencimiento, comprobantes: n(f.comprobantes), monto: n(f.monto) }));
}

// ---------------------------------------------------------------- salidas de caja
export type SalidaCaja = {
  orden: number;
  etiqueta: string;
  desde: string | null;
  hasta: string | null;
  comprobantes: number;
  monto: number;
  esVencido: boolean;
};

/** 6 filas: Vencido, cuatro semanas desde hoy (Lima), Después. */
export async function getSalidasCaja30d(): Promise<SalidaCaja[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("salidas_caja_30d"), "las salidas de caja");
  return filas.map((f) => ({
    orden: n(f.orden),
    etiqueta: String(f.etiqueta ?? ""),
    desde: (f.desde as string | null) ?? null,
    hasta: (f.hasta as string | null) ?? null,
    comprobantes: n(f.comprobantes),
    monto: n(f.monto),
    esVencido: Boolean(f.es_vencido),
  }));
}

// ---------------------------------------------------------------- tramos de Por pagar
export type ClaveTramoPorPagar = "vencidas" | "semana" | "despues";
export type TotalTramoPorPagar = { comprobantes: number; saldo: number };
export type TotalesTramosPorPagar = Record<ClaveTramoPorPagar, TotalTramoPorPagar>;

/**
 * Totales REALES por tramo (sobre toda la deuda que cumple los filtros, no sobre la página). Acepta los
 * mismos filtros que la lista (`listar_compras`), tipo de documento y rango de emisión incluidos: si un
 * filtro llega a la lista y no acá, los subtotales dejan de cuadrar con las filas (H3, ADR-0111).
 */
export async function getPorPagarTramos(
  filtros: { proveedorId?: string; condicion?: string; soloVencidas?: boolean; busqueda?: string; tipo?: string; desde?: string; hasta?: string } = {}
): Promise<TotalesTramosPorPagar> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.rpc("por_pagar_tramos", {
      ...(filtros.proveedorId ? { p_proveedor_id: filtros.proveedorId } : {}),
      ...(filtros.condicion ? { p_condicion: filtros.condicion } : {}),
      ...(filtros.soloVencidas ? { p_solo_vencidas: true } : {}),
      ...(filtros.busqueda ? { p_busqueda: filtros.busqueda } : {}),
      ...(filtros.tipo ? { p_tipo: filtros.tipo } : {}),
      ...(filtros.desde ? { p_desde: filtros.desde } : {}),
      ...(filtros.hasta ? { p_hasta: filtros.hasta } : {}),
    }),
    "los totales por tramo de la deuda"
  );
  const vacio = (): TotalTramoPorPagar => ({ comprobantes: 0, saldo: 0 });
  const totales: TotalesTramosPorPagar = { vencidas: vacio(), semana: vacio(), despues: vacio() };
  for (const f of filas) {
    const k = f.tramo as ClaveTramoPorPagar;
    if (k in totales) totales[k] = { comprobantes: n(f.comprobantes), saldo: n(f.saldo) };
  }
  return totales;
}

// ---------------------------------------------------------------- «esperando nota» en las listas
// El tipo vive en el módulo puro (`nota-pendiente-reglas`) para que un componente cliente lo importe sin
// arrastrar `supabase/server`. Se re-exporta acá para quien ya importa de este archivo.
export type { NotaPendiente } from "./nota-pendiente-reglas";

/**
 * De los comprobantes que la página tiene en pantalla, cuáles esperan su nota de crédito por faltante
 * (cierres sin la nota registrada) y por cuánto: `compras_nota_pendiente`. Devuelve un objeto por id de
 * comprobante; el que no está, no espera nada. Solo un líder recibe datos (un integrante recibe vacío,
 * como el resto de las cifras de dinero).
 *
 * NO lanza si la consulta falla: es un AVISO junto al saldo, no un número. Si no llega (la base todavía
 * sin la migración `20260918220000`, o una caída), la lista se dibuja igual con su saldo, que es correcto;
 * el error queda en el log del servidor. Sin ids no pregunta nada.
 */
export async function getNotasPendientes(compraIds: string[]): Promise<Record<string, NotaPendiente>> {
  const ids = [...new Set(compraIds)];
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("compras_nota_pendiente", { p_compra_ids: ids });
  if (error || !data) {
    console.error("Notas de crédito pendientes de las listas:", error?.message ?? "la consulta no devolvió datos");
    return {};
  }
  const porCompra: Record<string, NotaPendiente> = {};
  for (const f of data) {
    porCompra[String(f.compra_id)] = { unidadesCerradas: n(f.unidades_cerradas), montoEsperado: n(f.monto_esperado), resuelto: Boolean(f.resuelto) };
  }
  return porCompra;
}

// ---------------------------------------------------------------- recepciones
export type ResumenRecepciones = {
  unidadesRecibidas: number;
  recepciones: number;
  /** Días promedio entre emisión y llegada; `null` si no hay ninguna recepción. */
  diasEntregaPromedio: number | null;
  comprobantesRecibidos: number;
  entregasCompletas: number;
  faltanteUnidades: number;
  faltanteComprobantes: number;
};

/** `desde` (aaaa-mm-dd) omitido = últimos 90 días. */
export async function getResumenRecepciones(desde?: string): Promise<ResumenRecepciones> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("resumen_recepciones", desde ? { p_desde: desde } : {}), "el resumen de recepciones");
  const r = filas[0];
  return {
    unidadesRecibidas: n(r?.unidades_recibidas),
    recepciones: n(r?.recepciones),
    diasEntregaPromedio: nOpt(r?.dias_entrega_promedio),
    comprobantesRecibidos: n(r?.comprobantes_recibidos),
    entregasCompletas: n(r?.entregas_completas),
    faltanteUnidades: n(r?.faltante_unidades),
    faltanteComprobantes: n(r?.faltante_comprobantes),
  };
}

/** Una fila por (guía, comprobante). Una guía que cubre dos comprobantes aparece dos veces. */
export type RecepcionDeCompra = {
  loteId: string;
  fechaRecepcion: string;
  ubicacionNombre: string;
  proveedorId: string;
  proveedorNombre: string;
  numeroGuia: string | null;
  /** id de persona (Dynamic): se resuelve a nombre con `fn_nombres_personas`. */
  recibidoPor: string | null;
  compraId: string;
  documento: string;
  unidadesLlegaron: number;
  unidadesFacturadas: number;
  faltante: number;
  /** Días entre la emisión del comprobante y la llegada. */
  diasDemora: number;
};

export async function listarRecepcionesCompras(opciones: { proveedorId?: string; desde?: string; hasta?: string; busqueda?: string; limite?: number } = {}): Promise<RecepcionDeCompra[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.rpc("listar_recepciones_compras", {
      ...(opciones.proveedorId ? { p_proveedor_id: opciones.proveedorId } : {}),
      ...(opciones.desde ? { p_desde: opciones.desde } : {}),
      ...(opciones.hasta ? { p_hasta: opciones.hasta } : {}),
      ...(opciones.busqueda ? { p_busqueda: opciones.busqueda } : {}),
      ...(opciones.limite ? { p_limite: opciones.limite } : {}),
    }),
    "las recepciones contra comprobante"
  );
  return filas.map((f) => ({
    loteId: String(f.lote_id),
    fechaRecepcion: String(f.fecha_recepcion),
    ubicacionNombre: String(f.ubicacion_nombre ?? ""),
    proveedorId: String(f.proveedor_id),
    proveedorNombre: String(f.proveedor_nombre ?? ""),
    numeroGuia: (f.numero_guia as string | null) ?? null,
    recibidoPor: (f.recibido_por as string | null) ?? null,
    compraId: String(f.compra_id),
    documento: String(f.documento ?? ""),
    unidadesLlegaron: n(f.unidades_llegaron),
    unidadesFacturadas: n(f.unidades_facturadas),
    faltante: n(f.faltante),
    diasDemora: n(f.dias_demora),
  }));
}

// ---------------------------------------------------------------- ingreso sin comprobante
export type ResumenSinComprobante = {
  unidadesMes: number;
  recepcionesMes: number;
  /** Unidades del mes que entraron sin costo unitario registrado (distorsionan el margen). */
  unidadesSinCostoMes: number;
  ultimaRecepcion: string | null;
  ultimaUbicacion: string | null;
};

export async function getResumenSinComprobante(ubicacionId?: string): Promise<ResumenSinComprobante> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.rpc("resumen_sin_comprobante", ubicacionId ? { p_ubicacion_id: ubicacionId } : {}),
    "el resumen de ingresos sin comprobante"
  );
  const r = filas[0];
  return {
    unidadesMes: n(r?.unidades_mes),
    recepcionesMes: n(r?.recepciones_mes),
    unidadesSinCostoMes: n(r?.unidades_sin_costo_mes),
    ultimaRecepcion: (r?.ultima_recepcion as string | null) ?? null,
    ultimaUbicacion: (r?.ultima_ubicacion as string | null) ?? null,
  };
}

export type RecepcionSinComprobante = {
  loteId: string;
  fechaRecepcion: string;
  ubicacionNombre: string;
  proveedorNombre: string | null;
  numeroGuia: string | null;
  nota: string | null;
  recibidoPor: string | null;
  unidades: number;
  /** Costo unitario promedio del lote; `null` si no se registró costo. */
  costoUnitarioPromedio: number | null;
  sinCosto: boolean;
};

export async function listarRecepcionesSinComprobante(opciones: { ubicacionId?: string; limite?: number } = {}): Promise<RecepcionSinComprobante[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.rpc("recepciones_sin_comprobante", {
      ...(opciones.ubicacionId ? { p_ubicacion_id: opciones.ubicacionId } : {}),
      ...(opciones.limite ? { p_limite: opciones.limite } : {}),
    }),
    "los ingresos sin comprobante"
  );
  return filas.map((f) => ({
    loteId: String(f.lote_id),
    fechaRecepcion: String(f.fecha_recepcion),
    ubicacionNombre: String(f.ubicacion_nombre ?? ""),
    proveedorNombre: (f.proveedor_nombre as string | null) ?? null,
    numeroGuia: (f.numero_guia as string | null) ?? null,
    nota: (f.nota as string | null) ?? null,
    recibidoPor: (f.recibido_por as string | null) ?? null,
    unidades: n(f.unidades),
    costoUnitarioPromedio: nOpt(f.costo_unitario_promedio),
    sinCosto: Boolean(f.sin_costo),
  }));
}
