import { createClient } from "@/lib/supabase/server";
import { exigirOpcional, exigir } from "@/lib/resultado";
import { getUbicaciones } from "@/lib/ubicaciones";

// Caja/POS V2 (2026-09-12) — ver supabase/migrations/0008_caja_y_pagos.sql.
// `resumen` se calcula acá con las MISMAS reglas que cerrar_caja() en SQL
// (apertura + ventas en efectivo + ingresos − egresos): es lo que la
// Encargada ve ANTES de cerrar, para que el número de cierre no la
// sorprenda. Si algún día cambia la fórmula del cuadre, cambia en los dos
// lugares — están separados porque uno es "vista previa" (puede leerse
// cien veces sin efecto) y el otro es la escritura real que congela el
// cierre; unificarlos exigiría que la vista previa mutara algo, que es
// justo lo que no debe hacer.
export type CajaAbierta = {
  id: string;
  ubicacionId: string;
  montoApertura: number;
  abiertaEn: string;
  abiertaPorNombre: string | null;
};

/**
 * Conteo ciego (ADR-0042): a propósito NO trae el total esperado en el cajón.
 * Quien cuenta no debe saber cuánto debería haber — si lo sabe, contar deja de
 * ser una medición y pasa a ser una confirmación, y la diferencia real nunca
 * aparece. El esperado lo calcula `cerrar_caja` en el servidor, en el instante
 * del cierre, y se muestra recién ahí junto a lo contado.
 */
export type ResumenCaja = {
  ventasEfectivo: number;
  ventasOtros: number;
  ingresos: number;
  egresos: number;
  /** Devoluciones aprobadas con reembolso en efectivo de ESTA caja (`devoluciones.
   *  caja_id`, fijado por `aprobar_devolucion` — 20260915180000). Solo efectivo:
   *  un reembolso por Yape/Plin/transferencia/tarjeta no toca el cajón físico. */
  reembolsosEfectivo: number;
  /** Diferencia neta en efectivo de los cambios de ESTA caja (`cambios.caja_id`,
   *  fijado por `registrar_cambio` — 20260915200000). Con signo: positiva si las
   *  clientas pagaron de más en total, negativa si se les devolvió más de lo que
   *  pagaron — igual que `cambios.diferencia`, que ya lo trae así. */
  cambiosEfectivo: number;
};

export type MovimientoCaja = {
  id: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  motivo: string;
  nota: string | null;
  esAjuste: boolean;
  creadoEn: string;
  registradoPorNombre: string | null;
};

/** Una barra del gráfico de ventas por hora / sparkline de un KPI. */
export type PuntoHora = {
  /** 0-23, hora local del servidor (la misma que ya usa el resto de Caja). */
  hora: number;
  efectivo: number;
  otros: number;
};

/** Serie horaria + distribución por método, para la dona y los gráficos del
 *  tablero de Caja. Separado de `ResumenCaja` a propósito: ese tipo existe
 *  para el conteo ciego (ADR-0042, montos ya sumados), esto es para dibujar,
 *  no para contar — mezclarlos ensuciaría el contrato del conteo ciego. */
export type SeriesVentasCaja = {
  porMetodo: Partial<Record<string, number>>;
  porHora: PuntoHora[];
};

export async function getCajaAbierta(ubicacionId: string): Promise<CajaAbierta | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("cajas")
    .select("id, ubicacion_id, monto_apertura, abierta_en, abierta_por")
    .eq("ubicacion_id", ubicacionId)
    .eq("estado", "abierta")
    .maybeSingle();
  const fila = exigirOpcional(res, "la caja abierta de esta ubicación");
  if (!fila) return null;

  // `abierta_por` referencia public.personas (Dynamic) — PostgREST no
  // embebe entre schemas, así que se resuelve aparte, en lote (ver
  // fn_nombres_personas en 0009_integracion_dynamic.sql).
  let abiertaPorNombre: string | null = null;
  if (fila.abierta_por) {
    const nombres = exigir(
      await supabase.rpc("fn_nombres_personas", { p_ids: [fila.abierta_por] }),
      "quién abrió esta caja"
    );
    abiertaPorNombre = nombres[0]?.nombre ?? null;
  }

  return {
    id: fila.id,
    ubicacionId: fila.ubicacion_id,
    montoApertura: Number(fila.monto_apertura),
    abiertaEn: fila.abierta_en,
    abiertaPorNombre,
  };
}

export async function getResumenCaja(cajaId: string): Promise<ResumenCaja> {
  const supabase = await createClient();
  const [ventasRes, movimientos, devolucionesRes, cambiosRes] = await Promise.all([
    supabase.from("ventas").select("id").eq("caja_id", cajaId),
    supabase.from("caja_movimientos").select("tipo, monto").eq("caja_id", cajaId),
    supabase.from("devoluciones").select("reembolso_monto, reembolso_metodo").eq("caja_id", cajaId).eq("estado", "aprobada"),
    supabase.from("cambios").select("diferencia, metodo_pago_diferencia").eq("caja_id", cajaId).eq("metodo_pago_diferencia", "efectivo"),
  ]);
  const ventaIds = exigir(ventasRes, "las ventas de esta caja").map((v) => v.id);
  const filasPagos =
    ventaIds.length === 0
      ? []
      : exigir(
          await supabase.from("venta_pagos").select("metodo, monto").in("venta_id", ventaIds),
          "los pagos de esta caja"
        );
  const filasMovs = exigir(movimientos, "los movimientos de esta caja");
  const filasDevoluciones = exigir(devolucionesRes, "las devoluciones de esta caja");
  const filasCambios = exigir(cambiosRes, "los cambios de esta caja");

  const ventasEfectivo = filasPagos.filter((p) => p.metodo === "efectivo").reduce((a, p) => a + Number(p.monto), 0);
  const ventasOtros = filasPagos.filter((p) => p.metodo !== "efectivo").reduce((a, p) => a + Number(p.monto), 0);
  const ingresos = filasMovs.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + Number(m.monto), 0);
  const egresos = filasMovs.filter((m) => m.tipo === "egreso").reduce((a, m) => a + Number(m.monto), 0);
  const reembolsosEfectivo = filasDevoluciones
    .filter((d) => d.reembolso_metodo === "efectivo")
    .reduce((a, d) => a + Number(d.reembolso_monto ?? 0), 0);
  const cambiosEfectivo = filasCambios.reduce((a, c) => a + Number(c.diferencia), 0);

  return { ventasEfectivo, ventasOtros, ingresos, egresos, reembolsosEfectivo, cambiosEfectivo };
}

export type CierreCaja = {
  id: string;
  ubicacionId: string;
  ubicacionNombre: string;
  montoApertura: number;
  abiertaEn: string;
  abiertaPorNombre: string | null;
  montoCierreSistema: number;
  montoCierreReal: number;
  diferencia: number;
  cerradaEn: string;
  cerradaPorNombre: string | null;
  nota: string | null;
};

/**
 * Historial de cajas ya cerradas, más recientes primero. Sin filtro de ubicación a
 * propósito — mismo criterio que Facturación (`getVentasDeHoy`): mientras "control
 * total temporal" (0012_control_total_temporal.sql) siga vigente, cualquiera puede
 * operar cualquier sede y `cajas_select` ya deja ver todas; filtrar acá sería una
 * frontera que la base no hace cumplir. Cada fila lleva el nombre de la sede para
 * que se lea igual de claro.
 */
export async function getHistorialCierres(limite = 60): Promise<CierreCaja[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("cajas")
      .select(
        "id, ubicacion_id, monto_apertura, abierta_en, abierta_por, monto_cierre_sistema, monto_cierre_real, diferencia, cerrada_en, cerrada_por, nota"
      )
      .eq("estado", "cerrada")
      .order("cerrada_en", { ascending: false })
      .limit(limite),
    "el historial de cierres de caja"
  );

  const ubicaciones = await getUbicaciones();
  const nombreUbicacion = new Map(ubicaciones.map((u) => [u.id, u.nombre]));

  // `abierta_por`/`cerrada_por` referencian public.personas (Dynamic) — mismo motivo
  // que en getCajaAbierta(): PostgREST no embebe entre schemas, se resuelve aparte.
  const idsPersonas = Array.from(
    new Set(filas.flatMap((f) => [f.abierta_por, f.cerrada_por]).filter((v): v is string => v !== null))
  );
  const nombresPersonas =
    idsPersonas.length === 0
      ? []
      : exigir(await supabase.rpc("fn_nombres_personas", { p_ids: idsPersonas }), "quién abrió o cerró cada caja");
  const nombrePersona = new Map(nombresPersonas.map((n) => [n.id, n.nombre]));

  return filas.map((f) => ({
    id: f.id,
    ubicacionId: f.ubicacion_id,
    ubicacionNombre: nombreUbicacion.get(f.ubicacion_id) ?? "—",
    montoApertura: Number(f.monto_apertura),
    abiertaEn: f.abierta_en,
    abiertaPorNombre: f.abierta_por ? (nombrePersona.get(f.abierta_por) ?? null) : null,
    montoCierreSistema: Number(f.monto_cierre_sistema),
    montoCierreReal: Number(f.monto_cierre_real),
    diferencia: Number(f.diferencia),
    cerradaEn: f.cerrada_en ?? "",
    cerradaPorNombre: f.cerrada_por ? (nombrePersona.get(f.cerrada_por) ?? null) : null,
    nota: f.nota,
  }));
}

export async function getMovimientosCaja(cajaId: string): Promise<MovimientoCaja[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("caja_movimientos")
      .select("id, tipo, monto, motivo, nota, es_ajuste, created_at, usuario_id")
      .eq("caja_id", cajaId)
      .order("created_at", { ascending: false }),
    "los movimientos de caja"
  );

  // `usuario_id` referencia public.personas (Dynamic) — mismo motivo que en
  // getCajaAbierta(): PostgREST no embebe entre schemas, se resuelve aparte.
  const idsUsuarios = Array.from(new Set(filas.map((m) => m.usuario_id).filter((v): v is string => v !== null)));
  const nombresUsuarios =
    idsUsuarios.length === 0
      ? []
      : exigir(await supabase.rpc("fn_nombres_personas", { p_ids: idsUsuarios }), "quién registró cada movimiento");
  const nombrePorId = new Map(nombresUsuarios.map((n) => [n.id, n.nombre]));

  return filas.map((m) => ({
    id: m.id,
    tipo: m.tipo as "ingreso" | "egreso",
    monto: Number(m.monto),
    motivo: m.motivo,
    nota: m.nota,
    esAjuste: m.es_ajuste,
    creadoEn: m.created_at,
    registradoPorNombre: m.usuario_id ? (nombrePorId.get(m.usuario_id) ?? null) : null,
  }));
}

/**
 * Serie horaria de ventas de ESTA caja (para la dona de métodos de pago, las
 * barras "ventas por hora" y los sparkline de los KPI de venta). Reusa las
 * mismas dos tablas que `getResumenCaja` (ventas + venta_pagos) en vez de
 * duplicar la fórmula de "cuánto se vendió" en una tercera función.
 */
export async function getSeriesVentasCaja(cajaId: string): Promise<SeriesVentasCaja> {
  const supabase = await createClient();
  const ventasRes = await supabase.from("ventas").select("id, created_at").eq("caja_id", cajaId);
  const filasVentas = exigir(ventasRes, "las ventas de esta caja");
  if (filasVentas.length === 0) return { porMetodo: {}, porHora: [] };

  const horaPorVenta = new Map(filasVentas.map((v) => [v.id, new Date(v.created_at).getHours()]));
  const filasPagos = exigir(
    await supabase
      .from("venta_pagos")
      .select("venta_id, metodo, monto")
      .in(
        "venta_id",
        filasVentas.map((v) => v.id)
      ),
    "los pagos de esta caja"
  );

  const porMetodo: Partial<Record<string, number>> = {};
  const porHoraMap = new Map<number, { efectivo: number; otros: number }>();
  for (const p of filasPagos) {
    const monto = Number(p.monto);
    porMetodo[p.metodo] = (porMetodo[p.metodo] ?? 0) + monto;

    const hora = horaPorVenta.get(p.venta_id);
    if (hora === undefined) continue;
    const punto = porHoraMap.get(hora) ?? { efectivo: 0, otros: 0 };
    if (p.metodo === "efectivo") punto.efectivo += monto;
    else punto.otros += monto;
    porHoraMap.set(hora, punto);
  }

  const porHora = Array.from(porHoraMap.entries())
    .map(([hora, v]) => ({ hora, ...v }))
    .sort((a, b) => a.hora - b.hora);

  return { porMetodo, porHora };
}
