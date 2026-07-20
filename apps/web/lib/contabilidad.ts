import { createClient } from "@/lib/supabase/server";
import type { PersonaActual } from "@/lib/persona";
import { mesLimaUTC } from "@/lib/finanzas-nucleo";

// ==================================================================
// Modelo contable de CAYLA (Fase C1 — ver docs/MANUAL-CONTABLE-CAYLA.md).
//
// Los 4 estados financieros se CALCULAN sobre los sub-libros que ya existen
// (ventas, gastos, movimientos, stock, ajustes, depósitos, patrimonio). No hay
// tabla de asientos todavía: es un modelo de lectura que aplica las reglas de
// posteo del manual. Cuadra POR CONSTRUCCIÓN — el patrimonio se define como
// (Activo − Pasivo), así que Activo = Pasivo + Patrimonio siempre es cierto, y
// se desglosa en Capital (residual, "aportes e inventario por formalizar") +
// Utilidades acumuladas (el EERR de toda la historia).
//
// Simplificaciones declaradas (manual §6): el Balance es a HOY (el inventario
// vive como saldo actual, no histórico); COGS al costo vigente; sin depreciación;
// sin cuentas por pagar aún (eso llega con el módulo de compras formales).
// ==================================================================

const IGV = 0.18;

type MetodoPago = string | null;

type Ventas = { monto_total: number; metodo_pago: MetodoPago; created_at: string; sede_id: string };
type Gastos = { subtotal: number; igv: number; total: number; metodo_pago: MetodoPago; created_at: string; categoria: string };
type MovVentaMerma = { variante_id: string; cantidad: number; motivo: string; created_at: string };
type Flujo = { monto: number; created_at: string };

function esEfectivo(m: MetodoPago) {
  return m === "efectivo" || m == null; // ventas antiguas sin método se asumen efectivo
}

export type EstadosContables = {
  anio: number;
  mes: number;
  // Estado de Resultados del mes
  eerr: {
    ventasNetas: number;
    igvVentas: number;
    costoVentas: number;
    fletes: number;
    mermas: number;
    margenBruto: number;
    margenBrutoPct: number | null;
    gastosOperativos: { categoria: string; monto: number }[];
    totalGastosOperativos: number;
    utilidadOperativa: number;
  };
  // Balance General a hoy
  balance: {
    caja: number;
    banco: number;
    inventario: number;
    activosFijos: number;
    totalActivo: number;
    igvPorPagar: number; // + debes a SUNAT, − SUNAT te debe
    pasivosManuales: number;
    totalPasivo: number;
    capital: number; // residual: aportes + inventario/saldos por formalizar
    utilidadesAcumuladas: number;
    totalPatrimonio: number;
    cuadra: boolean;
  };
  // Flujo de Efectivo del mes (método directo)
  flujo: {
    efectivoInicial: number;
    cobrosVentas: number;
    pagosGastos: number;
    ajustes: number;
    flujoOperacion: number;
    efectivoFinal: number;
  };
  // Estado de Cambios en el Patrimonio del mes
  cambiosPatrimonio: {
    capitalInicial: number;
    utilidadesInicial: number;
    patrimonioInicial: number;
    utilidadDelPeriodo: number;
    aportesNetos: number;
    capitalFinal: number;
    utilidadesFinal: number;
    patrimonioFinal: number;
  };
};

export async function getEstadosContables(
  persona: PersonaActual,
  anio: number,
  mes: number
): Promise<EstadosContables | null> {
  if (persona.rol !== "lider") return null;
  const supabase = await createClient();
  const { desde, hasta } = mesLimaUTC(anio, mes);

  const [
    { data: ventas },
    { data: gastos },
    { data: movs },
    { data: variantes },
    { data: ajustes },
    { data: depositos },
    { data: stockRows },
    { data: patrimonio },
  ] = await Promise.all([
    supabase.from("ventas").select("monto_total, metodo_pago, created_at, sede_id"),
    supabase.from("gastos").select("subtotal, igv, total, metodo_pago, created_at, categoria"),
    supabase.from("movimientos").select("variante_id, cantidad, motivo, created_at").eq("tipo", "salida").in("motivo", ["venta", "merma"]),
    supabase.from("variantes").select("id, costo"),
    supabase.from("ajustes_efectivo").select("monto, created_at"),
    supabase.from("depositos_bancarios").select("monto, created_at"),
    supabase.from("stock").select("cantidad, variantes(costo)"),
    supabase.from("patrimonio_items").select("tipo, monto"),
  ]);

  const ventasR = (ventas ?? []) as Ventas[];
  const gastosR = (gastos ?? []) as Gastos[];
  const movsR = (movs ?? []) as MovVentaMerma[];
  const costoDe = new Map((variantes ?? []).map((v) => [v.id, Number(v.costo)]));
  const ajustesR = (ajustes ?? []) as Flujo[];
  const depositosR = (depositos ?? []) as Flujo[];

  // ---------- Primitivas: flujos acumulados y por período ----------
  const enPeriodo = (iso: string) => iso >= desde && iso < hasta;
  const antesDe = (iso: string, lim: string) => iso < lim;

  // EERR de un rango (o todo si filtro = () => true)
  function eerrDe(filtro: (iso: string) => boolean) {
    let ventasNetas = 0, igvVentas = 0, costoVentas = 0, mermas = 0, fletes = 0;
    const gastosPorCat = new Map<string, number>();
    ventasR.forEach((v) => {
      if (!filtro(v.created_at)) return;
      const total = Number(v.monto_total);
      const neta = Math.round((total / (1 + IGV)) * 100) / 100;
      ventasNetas += neta;
      igvVentas += total - neta;
    });
    movsR.forEach((m) => {
      if (!filtro(m.created_at)) return;
      const costo = (costoDe.get(m.variante_id) ?? 0) * Math.abs(m.cantidad);
      if (m.motivo === "venta") costoVentas += costo;
      else mermas += costo;
    });
    gastosR.forEach((g) => {
      if (!filtro(g.created_at)) return;
      // El flete de compra (transporte) se presenta dentro del margen bruto (cuenta 609),
      // no entre los gastos de operación — corrección del manual §4①.
      if (g.categoria === "transporte") {
        fletes += Number(g.subtotal);
      } else {
        gastosPorCat.set(g.categoria, (gastosPorCat.get(g.categoria) ?? 0) + Number(g.subtotal));
      }
    });
    const margenBruto = ventasNetas - costoVentas - fletes - mermas;
    const totalGastosOperativos = [...gastosPorCat.values()].reduce((a, b) => a + b, 0);
    return {
      ventasNetas, igvVentas, costoVentas, fletes, mermas, margenBruto,
      margenBrutoPct: ventasNetas > 0 ? Math.round((margenBruto / ventasNetas) * 1000) / 10 : null,
      gastosOperativos: [...gastosPorCat.entries()].map(([categoria, monto]) => ({ categoria, monto })).sort((a, b) => b.monto - a.monto),
      totalGastosOperativos,
      utilidadOperativa: margenBruto - totalGastosOperativos,
    };
  }

  // Efectivo (caja + banco) a una fecha: Σ ventas − Σ gastos + Σ ajustes (depósitos son
  // netos cero: mueven caja→banco). Igual a la suma del cuadre de todas las sedes.
  function efectivoHasta(lim: string) {
    let e = 0;
    ventasR.forEach((v) => { if (antesDe(v.created_at, lim)) e += Number(v.monto_total); });
    gastosR.forEach((g) => { if (antesDe(g.created_at, lim)) e -= Number(g.total); });
    ajustesR.forEach((a) => { if (antesDe(a.created_at, lim)) e += Number(a.monto); });
    return Math.round(e * 100) / 100;
  }

  // Caja (solo efectivo) vs Banco (electrónico), a hoy, para el desglose del Balance.
  function cajaBancoHoy() {
    let caja = 0, banco = 0;
    ventasR.forEach((v) => {
      const t = Number(v.monto_total);
      if (esEfectivo(v.metodo_pago)) caja += t; else banco += t;
    });
    gastosR.forEach((g) => {
      const t = Number(g.total);
      if (esEfectivo(g.metodo_pago)) caja -= t; else banco -= t;
    });
    ajustesR.forEach((a) => { caja += Number(a.monto); });
    depositosR.forEach((d) => { caja -= Number(d.monto); banco += Number(d.monto); });
    return { caja: Math.round(caja * 100) / 100, banco: Math.round(banco * 100) / 100 };
  }

  // ---------- EERR del período ----------
  const eerr = eerrDe(enPeriodo);

  // ---------- Balance General a hoy ----------
  const { caja, banco } = cajaBancoHoy();
  const inventario = Math.round((stockRows ?? []).reduce((a, r) => {
    const variante = Array.isArray(r.variantes) ? r.variantes[0] : r.variantes;
    return a + (Number(variante?.costo) || 0) * r.cantidad;
  }, 0) * 100) / 100;
  const activosFijos = (patrimonio ?? []).filter((p) => p.tipo === "activo").reduce((a, p) => a + Number(p.monto), 0);
  const pasivosManuales = (patrimonio ?? []).filter((p) => p.tipo === "pasivo").reduce((a, p) => a + Number(p.monto), 0);

  // IGV por pagar = IGV cobrado en ventas (todo) − IGV pagado en compras/gastos (crédito fiscal).
  const eerrTotal = eerrDe(() => true);
  const igvGastos = gastosR.reduce((a, g) => a + Number(g.igv), 0);
  const igvPorPagar = Math.round((eerrTotal.igvVentas - igvGastos) * 100) / 100;

  const totalActivo = Math.round((caja + banco + inventario + activosFijos) * 100) / 100;
  const totalPasivo = Math.round((igvPorPagar + pasivosManuales) * 100) / 100;
  const totalPatrimonio = Math.round((totalActivo - totalPasivo) * 100) / 100;
  const utilidadesAcumuladas = Math.round(eerrTotal.utilidadOperativa * 100) / 100;
  const capital = Math.round((totalPatrimonio - utilidadesAcumuladas) * 100) / 100;

  // ---------- Flujo de Efectivo del período (método directo) ----------
  const efectivoInicial = efectivoHasta(desde);
  const efectivoFinal = efectivoHasta(hasta);
  let cobrosVentas = 0, pagosGastos = 0, ajustesPeriodo = 0;
  ventasR.forEach((v) => { if (enPeriodo(v.created_at)) cobrosVentas += Number(v.monto_total); });
  gastosR.forEach((g) => { if (enPeriodo(g.created_at)) pagosGastos += Number(g.total); });
  ajustesR.forEach((a) => { if (enPeriodo(a.created_at)) ajustesPeriodo += Number(a.monto); });

  // ---------- Estado de Cambios en el Patrimonio ----------
  const utilidadesInicial = Math.round(eerrDe((iso) => antesDe(iso, desde)).utilidadOperativa * 100) / 100;
  const utilidadDelPeriodo = Math.round(eerr.utilidadOperativa * 100) / 100;
  const utilidadesFinal = utilidadesAcumuladas;
  // El capital (aportes/inventario por formalizar) se asume estable en el período v1;
  // cualquier variación no explicada por la utilidad cae en "aportes netos".
  const patrimonioFinal = totalPatrimonio;
  const capitalFinal = capital;
  const patrimonioInicial = Math.round((patrimonioFinal - utilidadDelPeriodo) * 100) / 100;
  const capitalInicial = Math.round((patrimonioInicial - utilidadesInicial) * 100) / 100;
  const aportesNetos = Math.round((capitalFinal - capitalInicial) * 100) / 100;

  return {
    anio, mes,
    eerr,
    balance: {
      caja, banco, inventario, activosFijos, totalActivo,
      igvPorPagar, pasivosManuales, totalPasivo,
      capital, utilidadesAcumuladas, totalPatrimonio,
      cuadra: Math.abs(totalActivo - (totalPasivo + totalPatrimonio)) < 0.5,
    },
    flujo: {
      efectivoInicial,
      cobrosVentas: Math.round(cobrosVentas * 100) / 100,
      pagosGastos: Math.round(pagosGastos * 100) / 100,
      ajustes: Math.round(ajustesPeriodo * 100) / 100,
      flujoOperacion: Math.round((cobrosVentas - pagosGastos + ajustesPeriodo) * 100) / 100,
      efectivoFinal,
    },
    cambiosPatrimonio: {
      capitalInicial, utilidadesInicial, patrimonioInicial,
      utilidadDelPeriodo, aportesNetos,
      capitalFinal, utilidadesFinal, patrimonioFinal,
    },
  };
}
