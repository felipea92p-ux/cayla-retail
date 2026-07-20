import { createClient } from "@/lib/supabase/server";
import type { PersonaActual } from "@/lib/persona";

// Núcleo financiero F1 (jubilación de SINATRA — docs/ANALISIS-SINATRA.md).
// Todo se calcula en meses CALENDARIO de Lima (UTC-5): "julio" es julio, no
// "últimos 30 días". Regla de oro heredada del resto del sistema: los números
// salen de las transacciones registradas, nunca de un contador editable.

const LIMA_OFFSET_MS = 5 * 3600 * 1000;

/** Límites UTC del mes calendario de Lima: [inicio, fin). */
export function mesLimaUTC(anio: number, mes: number): { desde: string; hasta: string } {
  const desde = new Date(Date.UTC(anio, mes - 1, 1) + LIMA_OFFSET_MS);
  const hasta = new Date(Date.UTC(anio, mes, 1) + LIMA_OFFSET_MS);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export function mesActualLima(): { anio: number; mes: number } {
  const lima = new Date(Date.now() - LIMA_OFFSET_MS);
  return { anio: lima.getUTCFullYear(), mes: lima.getUTCMonth() + 1 };
}

function anioMesLima(iso: string): { anio: number; mes: number } {
  const lima = new Date(new Date(iso).getTime() - LIMA_OFFSET_MS);
  return { anio: lima.getUTCFullYear(), mes: lima.getUTCMonth() + 1 };
}

// ==================== EERR POR MES CALENDARIO ====================

export type EERRMensual = {
  anio: number;
  mes: number;
  ventas: number;
  cogs: number;
  mermas: number;
  gastos: number;
  utilidad: number;
  margenBrutoPct: number | null;
  porSede: { sedeCodigo: string; ventas: number; cogs: number; mermas: number; gastos: number; utilidad: number }[];
};

export async function getEERRMensual(persona: PersonaActual, anio: number, mes: number): Promise<EERRMensual | null> {
  if (persona.rol !== "lider") return null;
  const supabase = await createClient();
  const { desde, hasta } = mesLimaUTC(anio, mes);

  const [{ data: sedesData }, { data: ventasData }, { data: movs }, { data: variantesData }, { data: gastosData }] =
    await Promise.all([
      supabase.from("sedes").select("id, codigo"),
      supabase.from("ventas").select("sede_id, monto_total").gte("created_at", desde).lt("created_at", hasta),
      supabase
        .from("movimientos")
        .select("variante_id, sede_id, cantidad, motivo")
        .eq("tipo", "salida")
        .in("motivo", ["venta", "merma"])
        .gte("created_at", desde)
        .lt("created_at", hasta),
      supabase.from("variantes").select("id, costo"),
      supabase.from("gastos").select("sede_id, total").gte("created_at", desde).lt("created_at", hasta),
    ]);

  const codigoDe = new Map((sedesData ?? []).map((s) => [s.id, s.codigo]));
  const costoDe = new Map((variantesData ?? []).map((v) => [v.id, Number(v.costo)]));

  type Fila = { ventas: number; cogs: number; mermas: number; gastos: number };
  const porSede = new Map<string, Fila>();
  const fila = (sedeId: string) => {
    const codigo = codigoDe.get(sedeId) ?? "?";
    if (!porSede.has(codigo)) porSede.set(codigo, { ventas: 0, cogs: 0, mermas: 0, gastos: 0 });
    return porSede.get(codigo)!;
  };

  let ventas = 0, cogs = 0, mermas = 0, gastos = 0;
  (ventasData ?? []).forEach((v) => { const m = Number(v.monto_total); ventas += m; fila(v.sede_id).ventas += m; });
  (movs ?? []).forEach((m) => {
    const costo = (costoDe.get(m.variante_id) ?? 0) * Math.abs(m.cantidad);
    if (m.motivo === "venta") { cogs += costo; fila(m.sede_id).cogs += costo; }
    else { mermas += costo; fila(m.sede_id).mermas += costo; }
  });
  (gastosData ?? []).forEach((g) => { const t = Number(g.total); gastos += t; fila(g.sede_id).gastos += t; });

  return {
    anio, mes, ventas, cogs, mermas, gastos,
    utilidad: ventas - cogs - mermas - gastos,
    margenBrutoPct: ventas > 0 ? Math.round(((ventas - cogs - mermas) / ventas) * 1000) / 10 : null,
    porSede: [...porSede.entries()]
      .map(([sedeCodigo, f]) => ({ sedeCodigo, ...f, utilidad: f.ventas - f.cogs - f.mermas - f.gastos }))
      .sort((a, b) => a.sedeCodigo.localeCompare(b.sedeCodigo)),
  };
}

// ==================== CUADRE DE EFECTIVO CONTINUO ====================
// Teórico por sede = Σ ajustes (incluye saldo inicial del corte) + Σ ventas en
// efectivo − Σ gastos en efectivo − Σ depósitos al banco. Cada cierre de caja
// aporta además su diferencia puntual (contado vs esperado del día).

export type CuadreSede = {
  sedeCodigo: string;
  teorico: number;
  ajustes: number;
  ventasEfectivo: number;
  gastosEfectivo: number;
  depositos: number;
  ultimaDiferenciaCierre: number | null;
  fechaUltimoCierre: string | null;
};

// Sin parámetro de persona: el alcance lo pone RLS solo (Líder ve todas las
// tiendas; una Encargada solo vería filas de su sede).
export async function getCuadreEfectivo(): Promise<CuadreSede[]> {
  const supabase = await createClient();

  const [{ data: sedesData }, { data: ajustes }, { data: ventasEf }, { data: gastosEf }, { data: depositos }, { data: cierres }] =
    await Promise.all([
      supabase.from("sedes").select("id, codigo, tipo").eq("tipo", "tienda").order("codigo"),
      supabase.from("ajustes_efectivo").select("sede_id, monto"),
      supabase.from("ventas").select("sede_id, monto_total").eq("metodo_pago", "efectivo"),
      supabase.from("gastos").select("sede_id, total").eq("metodo_pago", "efectivo"),
      supabase.from("depositos_bancarios").select("sede_id, monto"),
      supabase
        .from("cajas")
        .select("sede_id, diferencia, cerrada_en")
        .eq("estado", "cerrada")
        .order("cerrada_en", { ascending: false }),
    ]);

  return (sedesData ?? []).map((s) => {
    const suma = (rows: { sede_id: string; monto?: unknown; monto_total?: unknown; total?: unknown }[] | null) =>
      (rows ?? [])
        .filter((r) => r.sede_id === s.id)
        .reduce((a, r) => a + Number(r.monto ?? r.monto_total ?? r.total ?? 0), 0);

    const aj = suma(ajustes);
    const ve = suma(ventasEf);
    const ge = suma(gastosEf);
    const de = suma(depositos);
    const ultimoCierre = (cierres ?? []).find((c) => c.sede_id === s.id);

    return {
      sedeCodigo: s.codigo,
      teorico: Math.round((aj + ve - ge - de) * 100) / 100,
      ajustes: aj,
      ventasEfectivo: ve,
      gastosEfectivo: ge,
      depositos: de,
      ultimaDiferenciaCierre: ultimoCierre?.diferencia != null ? Number(ultimoCierre.diferencia) : null,
      fechaUltimoCierre: ultimoCierre?.cerrada_en ?? null,
    };
  });
}

// ==================== COMPARATIVO AÑO VS AÑO ====================
// Meses previos al corte: sembrados a mano en ventas_historicas_mensuales (una
// sola vez, desde SINATRA). Meses desde el corte: los calcula el sistema solo.
// Para un mismo sede/año/mes se SUMAN ambos (no se pisan): en el mes del corte
// conviven la parte Excel y la parte sistema.

export type ComparativoAnual = {
  anios: number[];
  filas: { mes: number; porAnio: Record<number, number> }[];
  totalPorAnio: Record<number, number>;
};

export async function getComparativoAnual(persona: PersonaActual, sedeCodigo?: string): Promise<ComparativoAnual | null> {
  if (persona.rol !== "lider") return null;
  const supabase = await createClient();

  const [{ data: sedesData }, { data: historicos }, { data: ventasData }] = await Promise.all([
    supabase.from("sedes").select("id, codigo"),
    supabase.from("ventas_historicas_mensuales").select("sede_id, anio, mes, monto"),
    supabase.from("ventas").select("sede_id, monto_total, created_at"),
  ]);
  const codigoDe = new Map((sedesData ?? []).map((s) => [s.id, s.codigo]));

  const acumulado = new Map<string, number>(); // "anio-mes" -> monto
  const sumar = (anio: number, mes: number, monto: number) => {
    const k = `${anio}-${mes}`;
    acumulado.set(k, (acumulado.get(k) ?? 0) + monto);
  };

  (historicos ?? []).forEach((h) => {
    if (sedeCodigo && codigoDe.get(h.sede_id) !== sedeCodigo) return;
    sumar(h.anio, h.mes, Number(h.monto));
  });
  (ventasData ?? []).forEach((v) => {
    if (sedeCodigo && codigoDe.get(v.sede_id) !== sedeCodigo) return;
    const { anio, mes } = anioMesLima(v.created_at);
    sumar(anio, mes, Number(v.monto_total));
  });

  const anios = [...new Set([...acumulado.keys()].map((k) => Number(k.split("-")[0])))].sort();
  if (anios.length === 0) return { anios: [], filas: [], totalPorAnio: {} };

  const totalPorAnio: Record<number, number> = {};
  const filas = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const porAnio: Record<number, number> = {};
    anios.forEach((a) => {
      const v = acumulado.get(`${a}-${mes}`) ?? 0;
      porAnio[a] = v;
      totalPorAnio[a] = (totalPorAnio[a] ?? 0) + v;
    });
    return { mes, porAnio };
  });

  return { anios, filas, totalPorAnio };
}

// ==================== PATRIMONIO v1 ====================

export type Patrimonio = {
  efectivoTeorico: number;
  inventarioCosto: number;
  itemsActivo: { id: string; nombre: string; monto: number; nota: string | null }[];
  itemsPasivo: { id: string; nombre: string; monto: number; nota: string | null }[];
  totalActivos: number;
  totalPasivos: number;
  patrimonioNeto: number;
};

export async function getPatrimonio(persona: PersonaActual): Promise<Patrimonio | null> {
  if (persona.rol !== "lider") return null;
  const supabase = await createClient();

  const [cuadre, { data: stockRows }, { data: items }] = await Promise.all([
    getCuadreEfectivo(),
    supabase.from("stock").select("cantidad, variantes(costo)"),
    supabase.from("patrimonio_items").select("id, nombre, tipo, monto, nota").order("monto", { ascending: false }),
  ]);

  const efectivoTeorico = cuadre.reduce((a, c) => a + c.teorico, 0);
  const inventarioCosto = (stockRows ?? []).reduce((a, r) => {
    const variante = Array.isArray(r.variantes) ? r.variantes[0] : r.variantes;
    return a + (Number(variante?.costo) || 0) * r.cantidad;
  }, 0);

  const itemsActivo = (items ?? []).filter((i) => i.tipo === "activo").map((i) => ({ ...i, monto: Number(i.monto) }));
  const itemsPasivo = (items ?? []).filter((i) => i.tipo === "pasivo").map((i) => ({ ...i, monto: Number(i.monto) }));
  const totalActivos = efectivoTeorico + inventarioCosto + itemsActivo.reduce((a, i) => a + i.monto, 0);
  const totalPasivos = itemsPasivo.reduce((a, i) => a + i.monto, 0);

  return {
    efectivoTeorico,
    inventarioCosto,
    itemsActivo,
    itemsPasivo,
    totalActivos,
    totalPasivos,
    patrimonioNeto: totalActivos - totalPasivos,
  };
}
