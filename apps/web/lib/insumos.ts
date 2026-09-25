import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import {
  capitalEnLotes,
  consumoSemanal,
  estadoInsumo,
  saldoDeInsumo,
  saldoDeLote,
  semanasDeCobertura,
  type EstadoInsumo,
  type LoteConSaldo,
  type MovimientoInsumo,
  type TipoInsumo,
  type TipoMovInsumo,
  type UnidadInsumo,
} from "@/lib/insumos-reglas";

// Insumos del Taller (ADR-0133, F3): tela y avíos. Solo lecturas: toda escritura pasa por las RPC de ADR-0090
// (`recibir_insumo`, `registrar_consumo_insumo`) o, para el catálogo, por la política de INSERT del líder.
//
// El saldo se DERIVA del ledger `movimientos_insumo`; no se lee `v_insumo_saldos` a propósito: esa vista no tiene
// `security_invoker` y su dueño se salta la RLS, así que consultada con la sesión de un usuario mostraría el saldo de
// TODAS las ubicaciones (hallazgo de ADR-0090; se cierra en F4e). Acá se lee el ledger, que sí filtra por ubicación.
//
// Quien no es líder no recibe montos, y desde F4e (D-G) tampoco la base se los da: `costo_unitario` ya no es legible por la API directa
// (privilegio por columna; migración 20260921151000). Los costos del líder llegan por `fn_costos_insumos_taller`, que responde solo a
// él. El costo de un movimiento es el de su lote (`registrar_consumo_insumo` y `devolver_insumo_de_produccion` lo copian del lote).

export type InsumoVista = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoInsumo;
  unidad: UnidadInsumo;
  /** 0 a 0,5: lo que se pierde al cortar. */
  merma: number;
  minimo: number | null;
  nota: string | null;
  saldo: number;
  estado: EstadoInsumo;
  lotes: LoteConSaldo[];
  /** Ritmo medido en las últimas 4 semanas; `null` si no hubo consumo. */
  consumoSemanal: number | null;
  semanas: number | null;
};

export type MovimientoDelLibro = {
  id: string;
  insumoId: string;
  insumo: string;
  unidad: UnidadInsumo;
  tipo: TipoMovInsumo;
  cantidad: number;
  lote: string | null;
  orden: string | null;
  motivo: string | null;
  creadoEn: string;
};

export type ConsumoDeOrden = {
  id: string;
  insumoId: string;
  insumo: string;
  tipo: InsumoVista["tipo"];
  unidad: UnidadInsumo;
  cantidad: number;
  lote: string | null;
  loteId: string | null;
  /** `null` cuando quien mira no ve dinero. */
  costo: number | null;
  creadoEn: string;
};

export type InsumosDelTaller = {
  insumos: InsumoVista[];
  libro: MovimientoDelLibro[];
  /** Lo consumido por cada orden de producción, del más reciente al más viejo. */
  consumosPorOrden: Record<string, ConsumoDeOrden[]>;
  /** Cuánto vale lo que hay; `null` si no se ven costos. */
  capital: number | null;
};

const LIMITE_LIBRO = 12;

export async function getInsumosDelTaller(tallerId: string, opciones: { conCostos: boolean; hoy: string }): Promise<InsumosDelTaller> {
  const supabase = await createClient();
  const [insumos, lotes, movs, costos] = await Promise.all([
    supabase
      .from("insumos")
      .select("id, codigo, nombre, tipo, unidad_medida, merma_pct, stock_minimo, nota")
      .is("archivado_at", null)
      .order("nombre"),
    supabase
      .from("insumo_lotes")
      .select("id, insumo_id, codigo_lote, fecha_ingreso, created_at, cantidad_ingresada, documento, origen")
      .eq("ubicacion_id", tallerId),
    supabase
      .from("movimientos_insumo")
      .select("id, insumo_id, insumo_lote_id, tipo, cantidad, produccion_id, motivo, created_at, produccion:producciones ( producto:productos ( referencia ) )")
      .eq("ubicacion_id", tallerId)
      .order("created_at", { ascending: false }),
    // Solo el líder recibe filas; quien no lo es ni siquiera hace la consulta.
    opciones.conCostos ? supabase.rpc("fn_costos_insumos_taller", { p_ubicacion_id: tallerId }) : Promise.resolve({ data: [] as { lote_id: string; costo_unitario: number }[], error: null }),
  ]);
  const costoDeLote = new Map(exigir(costos, "los costos de los lotes").map((c) => [c.lote_id, Number(c.costo_unitario)]));

  const filasInsumos = exigir(insumos, "los insumos");
  const filasLotes = exigir(lotes, "los lotes de insumos");
  const filasMovs = exigir(movs, "los movimientos de insumos");

  const movimientos: (MovimientoInsumo & { costo: number })[] = filasMovs.map((m) => ({
    id: m.id,
    insumoId: m.insumo_id,
    loteId: m.insumo_lote_id,
    tipo: m.tipo as TipoMovInsumo,
    cantidad: Number(m.cantidad),
    produccionId: m.produccion_id,
    motivo: m.motivo,
    creadoEn: m.created_at,
    costo: m.insumo_lote_id ? (costoDeLote.get(m.insumo_lote_id) ?? 0) : 0,
  }));
  const lotesBase = filasLotes.map((l) => ({
    id: l.id,
    insumoId: l.insumo_id,
    codigo: l.codigo_lote,
    ingreso: l.fecha_ingreso,
    creadoEn: l.created_at,
    cantidadIngresada: Number(l.cantidad_ingresada),
    costoUnitario: opciones.conCostos ? (costoDeLote.get(l.id) ?? 0) : null,
    documento: l.documento,
    origen: l.origen as "compra" | "saldo_inicial",
  }));

  const vistas: InsumoVista[] = filasInsumos.map((i) => {
    const suyos = movimientos.filter((m) => m.insumoId === i.id);
    const suyosLotes: LoteConSaldo[] = lotesBase
      .filter((l) => l.insumoId === i.id)
      .map((l) => ({ ...l, saldo: saldoDeLote(l, suyos) }));
    const saldo = saldoDeInsumo(suyos);
    const semanal = consumoSemanal(suyos, opciones.hoy);
    return {
      id: i.id,
      codigo: i.codigo,
      nombre: i.nombre,
      tipo: i.tipo as TipoInsumo,
      unidad: i.unidad_medida as UnidadInsumo,
      merma: Number(i.merma_pct),
      minimo: i.stock_minimo === null ? null : Number(i.stock_minimo),
      nota: i.nota,
      saldo,
      estado: estadoInsumo(saldo, i.stock_minimo === null ? null : Number(i.stock_minimo)),
      lotes: suyosLotes,
      consumoSemanal: semanal,
      semanas: semanasDeCobertura(saldo, semanal),
    };
  });

  const porId = new Map(vistas.map((v) => [v.id, v]));
  const codigoDeLote = new Map(lotesBase.map((l) => [l.id, l.codigo]));

  const libro: MovimientoDelLibro[] = filasMovs.slice(0, LIMITE_LIBRO).map((m) => {
    const v = porId.get(m.insumo_id);
    return {
      id: m.id,
      insumoId: m.insumo_id,
      insumo: v?.nombre ?? "(insumo)",
      unidad: v?.unidad ?? "unidad",
      tipo: m.tipo as TipoMovInsumo,
      cantidad: Number(m.cantidad),
      lote: m.insumo_lote_id ? (codigoDeLote.get(m.insumo_lote_id) ?? null) : null,
      orden: m.produccion?.producto?.referencia ?? null,
      motivo: m.motivo,
      creadoEn: m.created_at,
    };
  });

  const consumosPorOrden: Record<string, ConsumoDeOrden[]> = {};
  for (const m of filasMovs) {
    if (!m.produccion_id || (m.tipo !== "consumo" && m.tipo !== "devolucion")) continue;
    const v = porId.get(m.insumo_id);
    (consumosPorOrden[m.produccion_id] ??= []).push({
      id: m.id,
      insumoId: m.insumo_id,
      insumo: v?.nombre ?? "(insumo)",
      tipo: v?.tipo ?? "tela",
      unidad: v?.unidad ?? "unidad",
      cantidad: Number(m.cantidad) * (m.tipo === "devolucion" ? -1 : 1),
      lote: m.insumo_lote_id ? (codigoDeLote.get(m.insumo_lote_id) ?? null) : null,
      loteId: m.insumo_lote_id,
      costo: opciones.conCostos ? (m.insumo_lote_id ? (costoDeLote.get(m.insumo_lote_id) ?? 0) : 0) * Number(m.cantidad) * (m.tipo === "devolucion" ? -1 : 1) : null,
      creadoEn: m.created_at,
    });
  }

  return {
    insumos: vistas,
    libro,
    consumosPorOrden,
    capital: opciones.conCostos ? capitalEnLotes(vistas.flatMap((v) => v.lotes)) : null,
  };
}
