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
  type MaterialVista,
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
  /** De qué tejido y de qué color es esta tela (el vocabulario de la prenda, ADR-0400); vacíos si no se dijo. */
  tejidoId: string | null;
  colorCodigo: string | null;
  /** La tela de la que este insumo es un color (ADR-0554); `null` o ausente = insumo suelto. */
  materialId?: string | null;
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
  /** La base entregó el costo de los lotes (quien mira ve Producción en este Taller, ADR-0400 actividad 6). Sin lotes no hay costo que ver y se da por visible; con lotes y cero filas, no se ve: nunca se dibuja «S/ 0.00». */
  veCostos: boolean;
  /** Las telas (y avíos con tela) del Taller: lo que es cada una y cómo se compra. Vacío si la base todavía no las tiene. */
  materiales: MaterialVista[];
  /** La base ya tiene las telas con sus colores (ADR-0554): sin ellas la pantalla se queda como antes. */
  hayTelas: boolean;
};

const LIMITE_LIBRO = 12;

type FilaInsumo = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  unidad_medida: string;
  merma_pct: number | string;
  stock_minimo: number | string | null;
  nota: string | null;
  tejido_id: string | null;
  color_codigo: string | null;
  material_id?: string | null;
};

type FilaMaterial = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  tejido_id: string | null;
  composicion: string | null;
  unidad_medida: string;
  merma_pct: number | string;
  unidad_compra: string;
  ancho_cm: number | string | null;
  gramaje_gm2: number | string | null;
  metros_por_rollo: number | string | null;
  updated_at: string;
};

type Respuesta<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

const COLUMNAS_INSUMO = "id, codigo, nombre, tipo, unidad_medida, merma_pct, stock_minimo, nota, tejido_id, color_codigo";

// `tejido_id`, `color_codigo` y `material_id` son nuevas y los tipos generados todavía no las traen: la consulta se tipa a mano, como `lotes` en recepcion-envio.ts.
function leerInsumos(supabase: Awaited<ReturnType<typeof createClient>>, columnas: string): Respuesta<FilaInsumo> {
  return (supabase.from("insumos") as unknown as { select: (c: string) => { is: (col: string, v: null) => { order: (c: string) => Respuesta<FilaInsumo> } } }).select(columnas).is("archivado_at", null).order("nombre");
}

function leerMateriales(supabase: Awaited<ReturnType<typeof createClient>>): Respuesta<FilaMaterial> {
  // La tabla es nueva (ADR-0554) y no está en los tipos generados: se tipa el cliente, no el resultado.
  return (supabase as unknown as { from: (t: string) => { select: (c: string) => { is: (col: string, v: null) => { order: (c: string) => Respuesta<FilaMaterial> } } } })
    .from("materiales")
    .select("id, codigo, nombre, tipo, tejido_id, composicion, unidad_medida, merma_pct, unidad_compra, ancho_cm, gramaje_gm2, metros_por_rollo, updated_at")
    .is("archivado_at", null)
    .order("nombre");
}

export async function getInsumosDelTaller(tallerId: string, opciones: { conCostos: boolean; hoy: string }): Promise<InsumosDelTaller> {
  const supabase = await createClient();
  // La web puede salir antes que la migración 20261028175000 (ADR-0554): sin `material_id` los insumos se leen como hasta hoy (sin telas) y la pantalla no se cae.
  const primera = await leerInsumos(supabase, `${COLUMNAS_INSUMO}, material_id`);
  const sinMaterialId = !!primera.error && (primera.error.code === "42703" || /material_id/.test(primera.error.message));
  const insumos = sinMaterialId ? await leerInsumos(supabase, COLUMNAS_INSUMO) : primera;
  const [lotes, movs, costos, materialesRes] = await Promise.all([
    supabase
      .from("insumo_lotes")
      .select("id, insumo_id, codigo_lote, fecha_ingreso, created_at, cantidad_ingresada, documento, origen")
      .eq("ubicacion_id", tallerId),
    supabase
      .from("movimientos_insumo")
      .select("id, insumo_id, insumo_lote_id, tipo, cantidad, produccion_id, motivo, created_at, produccion:producciones ( producto:productos ( referencia ) )")
      .eq("ubicacion_id", tallerId)
      .order("created_at", { ascending: false }),
    // Solo quien ve los costos del Taller recibe filas (`fn_ve_costos_del_taller`: el líder, o quien ve Producción parado en él); a los demás la base les responde vacío.
    opciones.conCostos ? supabase.rpc("fn_costos_insumos_taller", { p_ubicacion_id: tallerId }) : Promise.resolve({ data: [] as { lote_id: string; costo_unitario: number }[], error: null }),
    leerMateriales(supabase),
  ]);
  const costoDeLote = new Map(exigir(costos, "los costos de los lotes").map((c) => [c.lote_id, Number(c.costo_unitario)]));

  const filasInsumos = exigir(insumos, "los insumos");
  const filasLotes = exigir(lotes, "los lotes de insumos");
  const filasMovs = exigir(movs, "los movimientos de insumos");
  const veCostos = opciones.conCostos && (costoDeLote.size > 0 || filasLotes.length === 0);

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
    costoUnitario: veCostos ? (costoDeLote.get(l.id) ?? 0) : null,
    documento: l.documento,
    origen: l.origen as "compra" | "saldo_inicial",
  }));

  // Sin las telas (la base todavía no las tiene) la lista queda vacía y la pantalla se ve como antes; se avisa en el registro, no a la persona.
  if (materialesRes.error) console.error(`telas de los insumos: ${materialesRes.error.message}`);
  const materiales: MaterialVista[] = materialesRes.error
    ? []
    : (materialesRes.data ?? []).map((m) => ({
        id: m.id,
        codigo: m.codigo,
        nombre: m.nombre,
        tipo: m.tipo as TipoInsumo,
        tejidoId: m.tejido_id,
        composicion: m.composicion,
        unidad: m.unidad_medida as UnidadInsumo,
        merma: Number(m.merma_pct),
        compra: m.unidad_compra as MaterialVista["compra"],
        ancho: m.ancho_cm === null ? null : Number(m.ancho_cm),
        gramaje: m.gramaje_gm2 === null ? null : Number(m.gramaje_gm2),
        metrosPorRollo: m.metros_por_rollo === null ? null : Number(m.metros_por_rollo),
        version: String(m.updated_at),
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
      tejidoId: i.tejido_id ?? null,
      colorCodigo: i.color_codigo ?? null,
      materialId: i.material_id ?? null,
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
      costo: veCostos ? (m.insumo_lote_id ? (costoDeLote.get(m.insumo_lote_id) ?? 0) : 0) * Number(m.cantidad) * (m.tipo === "devolucion" ? -1 : 1) : null,
      creadoEn: m.created_at,
    });
  }

  return {
    insumos: vistas,
    libro,
    consumosPorOrden,
    capital: veCostos ? capitalEnLotes(vistas.flatMap((v) => v.lotes)) : null,
    veCostos,
    materiales,
    hayTelas: !sinMaterialId && !materialesRes.error,
  };
}
