import { createClient } from "@/lib/supabase/server";
import { getSedes, mapaSedes } from "@/lib/sedes";
import { exigir } from "@/lib/resultado";
import type { PersonaActual } from "@/lib/persona";
import { METODOS_PAGO, type MetodoPago } from "@cayla-retail/shared";

const DIA_MS = 86400000;

function totalesPorMetodoVacio(): Record<MetodoPago, number> {
  const out = {} as Record<MetodoPago, number>;
  METODOS_PAGO.forEach((m) => (out[m] = 0));
  return out;
}

export type CajaAbierta = {
  id: string;
  montoApertura: number;
  abiertaEn: string;
};

/** La caja abierta de una sede ahora mismo, si existe (índice único garantiza que hay a lo sumo una). */
export async function getCajaAbierta(sedeId: string): Promise<CajaAbierta | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cajas")
    .select("id, monto_apertura, abierta_en")
    .eq("sede_id", sedeId)
    .eq("estado", "abierta")
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, montoApertura: Number(data.monto_apertura), abiertaEn: data.abierta_en };
}

export type CajaConDetalle = {
  id: string;
  sedeCodigo: string;
  abiertaEn: string;
  cerradaEn: string | null;
  estado: "abierta" | "cerrada";
  montoApertura: number;
  montoCierreContado: number | null;
  montoCierreEsperado: number | null;
  diferencia: number | null;
};

export type ResumenDiarioCaja = {
  ventanaDias: number;
  cajas: CajaConDetalle[];
  totalPorMetodo: Record<MetodoPago, number>;
  total: number;
};

/**
 * Diario de caja: ventas agrupadas por método de pago en la ventana, más el estado
 * de apertura/cierre/diferencia de cada caja (conteo ciego — ver
 * supabase/migrations/0007_finanzas.sql, función cerrar_caja).
 * Líder-only, mismo criterio que la versión Sheets.
 */
export async function getDiarioCaja(persona: PersonaActual, ventanaDias = 30): Promise<ResumenDiarioCaja> {
  if (persona.rol !== "lider") {
    return { ventanaDias, cajas: [], totalPorMetodo: totalesPorMetodoVacio(), total: 0 };
  }

  const supabase = await createClient();
  const desde = new Date(Date.now() - ventanaDias * DIA_MS);

  // Las tres son independientes: las cajas no condicionan qué ventas se piden, y el mapa
  // de sedes solo se usa para traducir sede_id → código al armar la respuesta. Antes
  // esperaban una a la otra sin motivo. — ADR-0013.
  const [resCajas, sedes, resVentas] = await Promise.all([
    supabase
      .from("cajas")
      .select(
        "id, monto_apertura, abierta_en, monto_cierre_contado, monto_cierre_esperado, diferencia, cerrada_en, estado, sede_id"
      )
      .gte("abierta_en", desde.toISOString())
      .order("abierta_en", { ascending: false }),
    mapaSedes(),
    supabase.from("ventas").select("metodo_pago, monto_total").gte("created_at", desde.toISOString()),
  ]);

  // El cuadre de caja decide si a alguien le falta dinero al cerrar el día. Un cero falso
  // acá manda a contar billetes que sí estaban. Falla en duro.
  const cajasData = exigir(resCajas, "las cajas del período");
  const ventasData = exigir(resVentas, "las ventas del período");

  const totalPorMetodo = totalesPorMetodoVacio();
  let total = 0;
  ventasData.forEach((v) => {
    const metodo = v.metodo_pago as MetodoPago;
    const monto = Number(v.monto_total);
    totalPorMetodo[metodo] = (totalPorMetodo[metodo] ?? 0) + monto;
    total += monto;
  });

  const cajas: CajaConDetalle[] = cajasData.map((c) => {
    return {
      id: c.id,
      sedeCodigo: sedes.get(c.sede_id)?.codigo ?? "",
      abiertaEn: c.abierta_en,
      cerradaEn: c.cerrada_en,
      estado: c.estado as "abierta" | "cerrada",
      montoApertura: Number(c.monto_apertura),
      montoCierreContado: c.monto_cierre_contado != null ? Number(c.monto_cierre_contado) : null,
      montoCierreEsperado: c.monto_cierre_esperado != null ? Number(c.monto_cierre_esperado) : null,
      diferencia: c.diferencia != null ? Number(c.diferencia) : null,
    };
  });

  return { ventanaDias, cajas, totalPorMetodo, total };
}

export type EstadoResultadosPorSede = {
  sedeCodigo: string;
  ventas: number;
  cogs: number;
  mermas: number;
  gastos: number;
  utilidad: number;
};

export type ResumenEstadoResultados = {
  ventanaDias: number;
  ventas: number;
  cogs: number;
  mermas: number;
  gastos: number;
  utilidad: number;
  margenBrutoPct: number | null;
  porSede: EstadoResultadosPorSede[];
};

/**
 * Ventas − (COGS + Mermas) − Gastos = Utilidad neta. Mermas se restan junto al COGS,
 * no como gasto operativo — es el tratamiento estándar (GAAP/NIIF): la merma de
 * inventario reduce el margen bruto directamente, no es un gasto de operar el
 * negocio. Líder-only, mismo criterio que la versión Sheets.
 */
export async function getEstadoResultados(persona: PersonaActual, ventanaDias = 30): Promise<ResumenEstadoResultados> {
  const vacio: ResumenEstadoResultados = {
    ventanaDias,
    ventas: 0,
    cogs: 0,
    mermas: 0,
    gastos: 0,
    utilidad: 0,
    margenBrutoPct: null,
    porSede: [],
  };
  if (persona.rol !== "lider") return vacio;

  const supabase = await createClient();
  const desde = new Date(Date.now() - ventanaDias * DIA_MS);

  // Las 4 consultas son independientes entre sí (se cruzan después en JS por sede_id /
  // variante_id) — en paralelo en vez de la fila india de 5 viajes que había acá. A ~120ms
  // por viaje eso eran ~600ms de espera pura para traer datos de juguete. — ADR-0013.
  //
  // `sedes` ya no es consulta: sale de getSedes(), memorizado por request, y el layout lo
  // pidió antes que esta función — así que es la 5ª consulta que desaparece del todo, no
  // una que se paraleliza. Mismo patrón que lib/panel.ts.
  const [sedes, resMovimientos, resVariantes, resVentas, resGastos] =
    await Promise.all([
      getSedes(),
      supabase
        .from("movimientos")
        .select("variante_id, sede_id, cantidad, motivo")
        .eq("tipo", "salida")
        .in("motivo", ["venta", "merma"])
        .gte("created_at", desde.toISOString()),
      supabase.from("variantes").select("id, costo"),
      supabase.from("ventas").select("sede_id, monto_total").gte("created_at", desde.toISOString()),
      supabase.from("gastos").select("sede_id, total").gte("created_at", desde.toISOString()),
    ]);

  // Este es un ESTADO DE RESULTADOS: cada una de estas cuatro consultas es un renglón del
  // que Felipe saca decisiones de plata. Si alguna falla, la pantalla no se dibuja — antes
  // renderizaba S/0 con cara de normalidad y eso es peor que caerse. Ver lib/resultado.ts.
  const movimientosData = exigir(resMovimientos, "las salidas de mercadería del período");
  const variantesData = exigir(resVariantes, "los costos de las prendas");
  const ventasData = exigir(resVentas, "las ventas del período");
  const gastosData = exigir(resGastos, "los gastos del período");

  const sedeCodigoPorId = new Map(sedes.map((s) => [s.id, s.codigo]));
  const costoPorVariante = new Map(variantesData.map((v) => [v.id, Number(v.costo)]));

  const porSedeMap = new Map<string, EstadoResultadosPorSede>();
  const sedeDe = (sedeId: string) => {
    if (!porSedeMap.has(sedeId)) {
      porSedeMap.set(sedeId, {
        sedeCodigo: sedeCodigoPorId.get(sedeId) ?? "",
        ventas: 0,
        cogs: 0,
        mermas: 0,
        gastos: 0,
        utilidad: 0,
      });
    }
    return porSedeMap.get(sedeId)!;
  };

  let ventas = 0;
  let cogs = 0;
  let mermas = 0;
  let gastos = 0;

  ventasData.forEach((v) => {
    const monto = Number(v.monto_total);
    ventas += monto;
    sedeDe(v.sede_id).ventas += monto;
  });

  movimientosData.forEach((m) => {
    const costoLinea = (costoPorVariante.get(m.variante_id) ?? 0) * Math.abs(m.cantidad);
    if (m.motivo === "venta") {
      cogs += costoLinea;
      sedeDe(m.sede_id).cogs += costoLinea;
    } else if (m.motivo === "merma") {
      mermas += costoLinea;
      sedeDe(m.sede_id).mermas += costoLinea;
    }
  });

  gastosData.forEach((g) => {
    const total = Number(g.total);
    gastos += total;
    sedeDe(g.sede_id).gastos += total;
  });

  porSedeMap.forEach((s) => {
    s.utilidad = s.ventas - s.cogs - s.mermas - s.gastos;
  });

  const utilidad = ventas - cogs - mermas - gastos;
  const margenBrutoPct = ventas > 0 ? Math.round(((ventas - cogs - mermas) / ventas) * 1000) / 10 : null;

  return {
    ventanaDias,
    ventas,
    cogs,
    mermas,
    gastos,
    utilidad,
    margenBrutoPct,
    porSede: [...porSedeMap.values()].sort((a, b) => a.sedeCodigo.localeCompare(b.sedeCodigo)),
  };
}
