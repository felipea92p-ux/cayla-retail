import { createClient } from "@/lib/supabase/server";
import { apartadoDeFila, estadoVisible, ORDEN_ESTADO, type ClaveEstado } from "@/lib/separaciones-reglas";
import { getGastosDeUbicacion } from "@/lib/gastos";
import { getDevolucionesPendientes } from "@/lib/devoluciones";
import { getTrasladosPorAtender } from "@/lib/traslados";
import { diaYHoraLima } from "@/lib/fechas-lima";
import type { TarjetaCaja } from "@/lib/caja-tablero-reglas";

// Lo que el tablero de Caja muestra de las pantallas vecinas (spike docs/maquetas/caja-tablero-spike-2026-09/):
// Apartados, Gastos del turno, Cambios y devoluciones, y los Pendientes antes de cerrar. SOLO LECTURA: todo sale de
// lecturas que esas pantallas ya usan, sin RPC nuevas.
//
// Reglas de esta capa:
//  - Cada bloque se pide solo si la cuenta ve ese módulo (ADR-0161): quien no ve Apartados no recibe su tarjeta.
//  - Ninguna lectura tumba la Caja (principio 9): si una falla, esa tarjeta llega con `null` y dice que no pudo leer.
//  - Apartados se leen con `buscar_separaciones` a secas, SIN `fn_vencer_separaciones` (que libera lo vencido y
//    escribe): la Caja se relee cada vez que entra una venta, y eso lo hace la pantalla de Apartados al abrirse.

export type ApartadoCaja = { id: string; clienta: string; prendas: string; saldo: number; estado: ClaveEstado; estadoTexto: string };
export type GastoCaja = { id: string; descripcion: string; categoria: string; hora: string; monto: number; conComprobante: boolean };
export type PosventaCaja = { id: string; tipo: "cambio" | "devolucion"; hora: string; texto: string; efectivo: number };
export type PendienteCaja = { clave: string; cantidad: number; texto: string; href: string };

export type ContextoTableroCaja = {
  /** Las tarjetas que esta cuenta puede prender («Tu caja muestra»), en orden. */
  disponibles: TarjetaCaja[];
  apartados: { lista: ApartadoCaja[]; porCobrar: number; activos: number } | null;
  gastos: { lista: GastoCaja[]; total: number } | null;
  posventa: { lista: PosventaCaja[]; efectivoDevuelto: number } | null;
  pendientes: PendienteCaja[];
};

type Permisos = {
  apartados: boolean;
  gastos: boolean;
  cambios: boolean;
  devoluciones: boolean;
  traslados: boolean;
  facturar: boolean;
  /** Quien puede cerrar un traslado con diferencia (lo usa el contador del menú, `getTrasladosPorAtender`). */
  ajustarInventario: boolean;
};

export async function getContextoTableroCaja(args: {
  cajaId: string;
  ubicacionId: string;
  hoy: string;
  /** Los movimientos manuales de ESTA caja (id y hora de Lima): un gasto del turno es uno que salió de ellos. */
  movimientos: readonly { id: string; hora: string }[];
  /** Cuántas ventas de hoy tienen el comprobante sin llegar a SUNAT (sale de `fn_ventas_del_dia`, ya leída). */
  comprobantesPorEnviar: number;
  permisos: Permisos;
}): Promise<ContextoTableroCaja> {
  const { permisos: p } = args;
  const [apartados, gastos, posventa, devolucionesPorAprobar, traslados] = await Promise.all([
    p.apartados ? leerApartados(args.ubicacionId, args.hoy) : Promise.resolve(null),
    p.gastos ? leerGastos(args.ubicacionId, args.hoy, args.movimientos) : Promise.resolve(null),
    p.cambios || p.devoluciones ? leerPosventa(args.cajaId) : Promise.resolve(null),
    p.devoluciones ? getDevolucionesPendientes(args.ubicacionId).then((d) => d.length, () => null) : Promise.resolve(null),
    p.traslados ? getTrasladosPorAtender(args.ubicacionId, p.ajustarInventario) : Promise.resolve(null),
  ]);

  const pendientes: PendienteCaja[] = [];
  if (p.facturar && args.comprobantesPorEnviar > 0)
    pendientes.push({ clave: "comprobantes", cantidad: args.comprobantesPorEnviar, texto: plural(args.comprobantesPorEnviar, "comprobante sin llegar a SUNAT", "comprobantes sin llegar a SUNAT"), href: "/vender/comprobantes" });
  if (apartados) {
    const urgentes = apartados.lista.filter((a) => a.estado === "porvencer" || a.estado === "vencida" || a.estado === "devolver").length;
    if (urgentes > 0) pendientes.push({ clave: "apartados", cantidad: urgentes, texto: plural(urgentes, "separación por atender hoy", "separaciones por atender hoy"), href: "/vender/apartados" });
  }
  if (devolucionesPorAprobar)
    pendientes.push({ clave: "devoluciones", cantidad: devolucionesPorAprobar, texto: plural(devolucionesPorAprobar, "devolución por aprobar", "devoluciones por aprobar"), href: "/devoluciones" });
  if (traslados)
    pendientes.push({ clave: "traslados", cantidad: traslados, texto: plural(traslados, "traslado por recibir", "traslados por recibir"), href: "/inventario/traslados" });

  const disponibles: TarjetaCaja[] = ["pendientes"];
  if (p.apartados) disponibles.push("apartados");
  if (p.gastos) disponibles.push("gastos");
  if (p.cambios || p.devoluciones) disponibles.push("posventa");

  return { disponibles, apartados, gastos, posventa, pendientes };
}

/** Las separaciones abiertas o por devolver de la tienda, lo urgente primero. */
async function leerApartados(ubicacionId: string, hoy: string): Promise<ContextoTableroCaja["apartados"]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("buscar_separaciones", { p_ubicacion_id: ubicacionId });
  if (error) return null;
  const lista = (data ?? [])
    .map((f) => apartadoDeFila(f as unknown as Record<string, unknown>))
    .filter((a) => a.estado === "abierta" || a.estado === "liberada")
    .map((a) => {
      const e = estadoVisible(a, hoy);
      return {
        id: a.id,
        clienta: `${a.nombres} ${a.apellidos}`.trim(),
        prendas: a.prendas.length === 1 ? "1 prenda" : `${a.prendas.length} prendas`,
        saldo: a.saldo,
        estado: e.clave,
        estadoTexto: e.texto,
        venceEl: a.venceEl,
      };
    })
    .sort((x, y) => ORDEN_ESTADO[x.estado] - ORDEN_ESTADO[y.estado] || x.venceEl.localeCompare(y.venceEl));
  const abiertas = lista.filter((a) => a.estado !== "devolver");
  return {
    lista: lista.map((a) => ({ id: a.id, clienta: a.clienta, prendas: a.prendas, saldo: a.saldo, estado: a.estado, estadoTexto: a.estadoTexto })),
    porCobrar: Math.round(abiertas.reduce((s, a) => s + a.saldo, 0) * 100) / 100,
    activos: abiertas.length,
  };
}

/** Los gastos de hoy de la tienda que salieron de ESTE cajón (su egreso es un movimiento de esta caja). */
async function leerGastos(ubicacionId: string, hoy: string, movimientos: readonly { id: string; hora: string }[]): Promise<ContextoTableroCaja["gastos"]> {
  const todos = await getGastosDeUbicacion(ubicacionId, hoy, hoy).catch(() => null);
  if (!todos) return null;
  // La hora es la del egreso del cajón: el gasto solo guarda la fecha.
  const horaDe = new Map(movimientos.map((m) => [m.id, m.hora]));
  const lista = todos
    .filter((g) => g.cajaMovimientoId !== null && horaDe.has(g.cajaMovimientoId))
    .map((g) => ({
      id: g.id,
      descripcion: g.descripcion || g.categoriaNombre,
      categoria: g.categoriaNombre,
      hora: horaDe.get(g.cajaMovimientoId!) ?? "",
      monto: g.montoTotal,
      conComprobante: g.comprobanteTipo !== "sin_comprobante",
    }));
  return { lista, total: Math.round(lista.reduce((s, g) => s + g.monto, 0) * 100) / 100 };
}

/** Cambios y devoluciones que pasaron por ESTA caja (`caja_id`, lo fija la base al registrarlos). */
async function leerPosventa(cajaId: string): Promise<ContextoTableroCaja["posventa"]> {
  const supabase = await createClient();
  const [cambios, devoluciones] = await Promise.all([
    supabase.from("cambios").select("id, created_at, diferencia, metodo_pago_diferencia, cantidad").eq("caja_id", cajaId),
    supabase.from("devoluciones").select("id, created_at, estado, reembolso_monto, reembolso_metodo").eq("caja_id", cajaId).eq("estado", "aprobada"),
  ]);
  if (cambios.error || devoluciones.error) return null;
  const lista: (PosventaCaja & { en: string })[] = [
    ...(cambios.data ?? []).map((c) => {
      const dif = Number(c.diferencia);
      const efectivo = c.metodo_pago_diferencia === "efectivo" ? dif : 0;
      return {
        id: c.id,
        en: c.created_at,
        tipo: "cambio" as const,
        hora: diaYHoraLima(c.created_at).hora,
        texto: dif === 0 ? "Cambio · sin diferencia de precio" : `Cambio · ${dif > 0 ? "pagó" : "se le devolvió"} S/ ${Math.abs(dif).toFixed(2)}`,
        efectivo,
      };
    }),
    ...(devoluciones.data ?? []).map((d) => {
      const monto = Number(d.reembolso_monto ?? 0);
      const efectivo = d.reembolso_metodo === "efectivo" ? -monto : 0;
      return {
        id: d.id,
        en: d.created_at,
        tipo: "devolucion" as const,
        hora: diaYHoraLima(d.created_at).hora,
        texto: monto > 0 ? `Devolución · S/ ${monto.toFixed(2)} por ${d.reembolso_metodo ?? "—"}` : "Devolución · sin reembolso",
        efectivo,
      };
    }),
  ].sort((a, b) => b.en.localeCompare(a.en));
  return {
    lista: lista.map((x) => ({ id: x.id, tipo: x.tipo, hora: x.hora, texto: x.texto, efectivo: x.efectivo })),
    efectivoDevuelto: Math.round(lista.reduce((s, x) => s + (x.efectivo < 0 ? -x.efectivo : 0), 0) * 100) / 100,
  };
}

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}
