import { createClient } from "@/lib/supabase/server";
import { exigirOpcional, exigir } from "@/lib/resultado";
import { getUbicaciones } from "@/lib/ubicaciones";
import { inicioDeDiaLima, diaLima, horaDelDiaLima } from "@/lib/panel-serie";

// Caja/POS V2 (2026-09-12) — ver supabase/migrations/0008_caja_y_pagos.sql.
// `getTableroCaja` alimenta las cifras del TABLERO de Caja (ventas por método, entradas, salidas) desde
// `fn_resumen_caja` (ADR-0191), que toma los montos del cajón de `fn_calcular_esperado_caja` — la misma función de
// `fn_esperado_caja` (la vista previa del cierre) y `cerrar_caja` (ADR-0186). Las ventas anuladas no cuentan
// (`estado <> 'anulada'`): su dinero volvió a la clienta, así que ni está en el cajón ni es venta del día.
export type CajaAbierta = {
  id: string;
  ubicacionId: string;
  montoApertura: number;
  abiertaEn: string;
  abiertaPorNombre: string | null;
};

/**
 * Montos sueltos del tablero de Caja. No trae el total esperado en el cajón: ese número tiene un solo dueño,
 * `fn_calcular_esperado_caja` en la base (ADR-0186), para que la pantalla y el cierre nunca den cifras distintas.
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
  /** Desglose de `ventasEfectivo + ventasOtros` por método real (efectivo/tarjeta/
   *  yape/plin/transferencia) — para el gráfico de dona del rediseño de Caja. Sale
   *  de la misma lectura (`fn_resumen_caja`), sin consulta extra. */
  porMetodo: { metodo: string; monto: number }[];
};

export type MovimientoCaja = {
  id: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  motivo: string;
  nota: string | null;
  esAjuste: boolean;
  creadoEn: string;
  usuarioId: string | null;
  registradoPorNombre: string | null;
};

/** Una barra del gráfico de ventas por hora / sparkline de un KPI. */
export type PuntoHora = {
  /** 0-23, hora de Lima (la base la calcula con `America/Lima`, no con el reloj del servidor). */
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

/** Lo que devuelve `fn_resumen_caja` (ADR-0191). Los montos llegan como número o texto según PostgREST. */
type ResumenCajaDeLaBase = {
  ventas_efectivo: number | string;
  ventas_otros: number | string;
  ingresos: number | string;
  egresos: number | string;
  reembolsos_efectivo: number | string;
  cambios_efectivo: number | string;
  esperado: number | string | null;
  por_metodo: Record<string, number | string>;
  por_hora: { hora: number; efectivo: number | string; otros: number | string }[];
};

/**
 * Las cifras y las series del tablero de Caja en UNA lectura (`fn_resumen_caja`, ADR-0191). La base toma los montos
 * del cajón de `fn_calcular_esperado_caja` —la misma fórmula del cierre, así pantalla y cierre no pueden dar cifras
 * distintas— y suma aparte el reparto por forma de pago y la serie por hora de Lima, sin ventas anuladas. Antes esto
 * eran dos funciones que traían todas las ventas y sus pagos (`.in("venta_id", [...])` con cada id en la URL) y
 * rehacían las cuentas en JS.
 */
export async function getTableroCaja(cajaId: string): Promise<{ resumen: ResumenCaja; series: SeriesVentasCaja }> {
  const supabase = await createClient();
  const t = exigir(await supabase.rpc("fn_resumen_caja", { p_caja_id: cajaId }), "el resumen de esta caja") as unknown as ResumenCajaDeLaBase;
  const porMetodo: Partial<Record<string, number>> = Object.fromEntries(Object.entries(t.por_metodo).map(([m, monto]) => [m, Number(monto)]));
  return {
    resumen: {
      ventasEfectivo: Number(t.ventas_efectivo),
      ventasOtros: Number(t.ventas_otros),
      ingresos: Number(t.ingresos),
      egresos: Number(t.egresos),
      reembolsosEfectivo: Number(t.reembolsos_efectivo),
      cambiosEfectivo: Number(t.cambios_efectivo),
      porMetodo: Object.entries(porMetodo).map(([metodo, monto]) => ({ metodo, monto: monto ?? 0 })),
    },
    series: {
      porMetodo,
      porHora: t.por_hora.map((p) => ({ hora: p.hora, efectivo: Number(p.efectivo), otros: Number(p.otros) })),
    },
  };
}

/**
 * Total vendido (todos los métodos) de esta ubicación entre el inicio del día de
 * Lima de hace 7 días y la misma hora de ese día — el comparativo "vs. mismo día de
 * la semana pasada" de la barra de meta. Ventana acotada a una hora (`hastaEstaHora`
 * en el caller, vía `horaDelDiaLima`) para no comparar un día completo contra lo que
 * llevamos hoy. Independiente de `getTableroCaja`: mira TODAS las ventas de la sede
 * ese día, no solo las de una caja puntual (una sede puede abrir/cerrar caja varias
 * veces en el día).
 */
export async function getVentasMismaHoraSemanaAnterior(ubicacionId: string, ahora = new Date()): Promise<number> {
  const supabase = await createClient();
  const hoyMs = ahora.getTime();
  const inicioDia = inicioDeDiaLima(diaLima(hoyMs) - 7);
  const finVentana = new Date(inicioDia.getTime() + horaDelDiaLima(hoyMs));

  // Los pagos van embebidos en la misma lectura: antes eran dos, la segunda con cada id de venta en la URL.
  const ventas = exigir(
    await supabase
      .from("ventas")
      .select("venta_pagos ( monto )")
      .eq("ubicacion_id", ubicacionId)
      .eq("estado", "completada")
      .gte("created_at", inicioDia.toISOString())
      .lt("created_at", finVentana.toISOString()),
    "las ventas de la sede la semana pasada"
  );
  return ventas.reduce((a, v) => a + v.venta_pagos.reduce((b, p) => b + Number(p.monto), 0), 0);
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
  /** Dato ficticio de prueba (D-54, ADR-0159): solo llega con `incluirPrueba`. */
  esPrueba: boolean;
  /** Lo que quedó en el cajón al cerrar (ADR-0186). `null` en cierres anteriores a ADR-0186. */
  montoFondo: number | null;
  /** El fondo que regía ese día (ADR-0195 F1). Si `montoFondo` es menor, se dejó menos: el cierre no se bloqueó. */
  fondoRequerido: number | null;
  /** A dónde fue el resto del efectivo contado (ADR-0186). Vacío si todo quedó en el cajón. */
  traslados: TrasladoCaja[];
  /** Con qué monto debió abrir según el cierre anterior, y por qué abrió con otro (ADR-0186). */
  aperturaEsperada: number | null;
  motivoDiferenciaApertura: string | null;
};

export type TrasladoCaja = { destino: string; monto: number; referencia: string | null };

/** Columnas y tabla de ADR-0186: si la migración aún no está pegada, la pantalla sigue sin ellas. */
const TABLA_INEXISTENTE = "42P01";

/**
 * Lo de ADR-0186 de cada caja (fondo, apertura esperada, motivo y traslados), pedido aparte y tolerante: si la
 * migración todavía no está en la base, el historial y la pantalla de Caja siguen funcionando con lo de siempre.
 */
async function getExtrasAdr0182(ids: string[]) {
  const vacio = new Map<string, { fondo: number | null; fondoRequerido: number | null; esperada: number | null; motivo: string | null; traslados: TrasladoCaja[] }>();
  if (ids.length === 0) return vacio;
  const supabase = await createClient();
  const [cajasRes, trasladosRes, requeridoRes] = await Promise.all([
    supabase.from("cajas").select("id, monto_fondo, monto_apertura_esperado, motivo_diferencia_apertura").in("id", ids),
    supabase.from("caja_traslados").select("caja_id, destino, monto, referencia").in("caja_id", ids).order("creado_en"),
    // El fondo que regía al cerrar (ADR-0195 F1, 20260924210000). Aparte y tolerado: sin esa migración, el historial
    // sigue igual que antes y solo no dice si se dejó menos del fondo.
    (supabase.from("cajas") as unknown as { select: (c: string) => { in: (col: string, v: string[]) => PromiseLike<{ data: { id: string; fondo_requerido: number | string | null }[] | null; error: { code?: string } | null }> } })
      .select("id, fondo_requerido")
      .in("id", ids),
  ]);
  const requerido = new Map(
    requeridoRes.error ? [] : (requeridoRes.data ?? []).map((r) => [r.id, r.fondo_requerido === null ? null : Number(r.fondo_requerido)] as const),
  );
  const faltaMigracion = (code?: string) => code === COLUMNA_INEXISTENTE || code === TABLA_INEXISTENTE;
  if (faltaMigracion(cajasRes.error?.code) || faltaMigracion(trasladosRes.error?.code)) return vacio;
  const filas = exigir(cajasRes, "el fondo de cada cierre");
  const traslados = exigir(trasladosRes, "los traslados de cada cierre");
  for (const f of filas) {
    vacio.set(f.id, {
      fondo: f.monto_fondo === null ? null : Number(f.monto_fondo),
      fondoRequerido: requerido.get(f.id) ?? null,
      esperada: f.monto_apertura_esperado === null ? null : Number(f.monto_apertura_esperado),
      motivo: f.motivo_diferencia_apertura,
      traslados: traslados
        .filter((t) => t.caja_id === f.id)
        .map((t) => ({ destino: t.destino, monto: Number(t.monto), referencia: t.referencia })),
    });
  }
  return vacio;
}

// `42703` = undefined_column: la migración de `es_prueba` (D-54, ADR-0159) es aditiva y puede
// tardar en pegarse en producción — mismo reintento que `ventas-historial.ts` y
// `getStockPorUbicacion` (`inventario-v2.ts`), para que desplegar la web antes que la migración
// no tumbe todo el historial de cierres, solo el filtro nuevo.
const COLUMNA_INEXISTENTE = "42703";

/**
 * Historial de cajas ya cerradas, más recientes primero. Sin filtro de ubicación a
 * propósito — mismo criterio que Facturación (`getVentasDeHoy`): mientras "control
 * total temporal" (0012_control_total_temporal.sql) siga vigente, cualquiera puede
 * operar cualquier sede y `cajas_select` ya deja ver todas; filtrar acá sería una
 * frontera que la base no hace cumplir. Cada fila lleva el nombre de la sede para
 * que se lea igual de claro.
 *
 * `incluirPrueba` (D-54, ADR-0159): apagado por defecto, las cajas `es_prueba` no se piden.
 */
export async function getHistorialCierres(limite = 60, incluirPrueba = false, ubicacionId?: string): Promise<CierreCaja[]> {
  const supabase = await createClient();
  const CAMPOS = "id, ubicacion_id, monto_apertura, abierta_en, abierta_por, monto_cierre_sistema, monto_cierre_real, diferencia, cerrada_en, cerrada_por, nota";
  const pedir = (conPrueba: boolean) => {
    let q = supabase
      .from("cajas")
      .select(conPrueba ? `${CAMPOS}, es_prueba` : CAMPOS)
      .eq("estado", "cerrada");
    if (ubicacionId) q = q.eq("ubicacion_id", ubicacionId);
    if (conPrueba && !incluirPrueba) q = q.eq("es_prueba", false);
    return q.order("cerrada_en", { ascending: false }).limit(limite);
  };
  let res = await pedir(true);
  if (res.error?.code === COLUMNA_INEXISTENTE) res = await pedir(false);
  const filas = exigir(res, "el historial de cierres de caja") as unknown as {
    id: string;
    ubicacion_id: string;
    monto_apertura: number;
    abierta_en: string;
    abierta_por: string | null;
    monto_cierre_sistema: number;
    monto_cierre_real: number;
    diferencia: number;
    cerrada_en: string | null;
    cerrada_por: string | null;
    nota: string | null;
    es_prueba?: boolean;
  }[];

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
  const extras = await getExtrasAdr0182(filas.map((f) => f.id));

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
    esPrueba: f.es_prueba === true,
    montoFondo: extras.get(f.id)?.fondo ?? null,
    fondoRequerido: extras.get(f.id)?.fondoRequerido ?? null,
    traslados: extras.get(f.id)?.traslados ?? [],
    aperturaEsperada: extras.get(f.id)?.esperada ?? null,
    motivoDiferenciaApertura: extras.get(f.id)?.motivo ?? null,
  }));
}

/** El último cierre real de la sede (sin datos de prueba), para mostrarlo con la caja cerrada y verificar la apertura. */
export async function getUltimoCierre(ubicacionId: string): Promise<CierreCaja | null> {
  return (await getHistorialCierres(1, false, ubicacionId))[0] ?? null;
}

export type AperturaPorRevisar = {
  cajaId: string;
  ubicacionNombre: string;
  abiertaEn: string;
  abiertaPorNombre: string | null;
  esperado: number;
  montoApertura: number;
  motivo: string;
};

/**
 * Aperturas que no coincidieron con el último cierre y que ningún líder marcó todavía como revisadas (ADR-0186).
 * `abrir_caja` solo guarda el motivo cuando hay diferencia, así que «tiene motivo» = «tuvo diferencia». Total: si no
 * se pudo leer (o la migración no está pegada) devuelve `null`, y quien la muestra dice que no pudo leerla.
 */
export async function getAperturasPorRevisar(): Promise<AperturaPorRevisar[] | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("cajas")
    .select("id, ubicacion_id, abierta_en, abierta_por, monto_apertura, monto_apertura_esperado, motivo_diferencia_apertura")
    .not("motivo_diferencia_apertura", "is", null)
    .is("apertura_revisada_en", null)
    .eq("es_prueba", false)
    .order("abierta_en", { ascending: false })
    .limit(50);
  if (res.error) return null;
  const filas = res.data;
  if (filas.length === 0) return [];
  const [ubicaciones, nombres] = await Promise.all([
    getUbicaciones(),
    supabase.rpc("fn_nombres_personas", {
      p_ids: Array.from(new Set(filas.map((f) => f.abierta_por).filter((v): v is string => v !== null))),
    }),
  ]);
  const nombreUbicacion = new Map(ubicaciones.map((u) => [u.id, u.nombre]));
  const nombrePersona = new Map((nombres.data ?? []).map((n) => [n.id, n.nombre]));
  return filas.map((f) => ({
    cajaId: f.id,
    ubicacionNombre: nombreUbicacion.get(f.ubicacion_id) ?? "—",
    abiertaEn: f.abierta_en,
    abiertaPorNombre: f.abierta_por ? (nombrePersona.get(f.abierta_por) ?? null) : null,
    esperado: Number(f.monto_apertura_esperado),
    montoApertura: Number(f.monto_apertura),
    motivo: f.motivo_diferencia_apertura ?? "",
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
    usuarioId: m.usuario_id,
    registradoPorNombre: m.usuario_id ? (nombrePorId.get(m.usuario_id) ?? null) : null,
  }));
}
