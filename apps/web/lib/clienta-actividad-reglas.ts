// Lo que la ficha de clienta deduce de sus compras — D-101 (talla por tipo de prenda) y D-103
// («te falta N para frecuente»). Lógica pura sobre las filas que ya trajo `fn_clienta_compras`
// (`lib/clientas.ts`): CALCULADA AL LEER, JAMÁS GUARDADA (D-103 lo exige explícito) — el día que
// cambie el umbral de "frecuente" no hay que migrar ninguna columna, solo esta función.
import type { Compra, FichaClienta } from "./clientas-reglas";
import { diaLima } from "./fechas-lima";

/** Propuesta D-103, a ajustar cuando haya datos reales de ventas (hoy el club recién empieza). */
export const COMPRAS_PARA_FRECUENTE = 3;
export const MESES_PARA_FRECUENTE = 6;

export type TallaDeducida = { categoria: string; talla: string };

/**
 * La talla más RECIENTE por categoría (no la más frecuente): una clienta cambia de talla con el
 * tiempo, y lo último que compró es más confiable que un promedio. `compras` debe venir ordenada
 * de más reciente a más antigua (así la sale `fn_clienta_compras`) — se toma la primera aparición
 * de cada categoría.
 *
 * LÍMITE CONOCIDO (v1), aceptado: un regalo cuenta como si fuera su talla. D-101 pedía excluir la
 * prenda marcada «es para regalo» en caja, pero Felipe decidió el 2026-09-30 seguir el spike
 * aprobado del club, que no lleva esa marca (ADR-0288, «Actualización 2026-09-30 (e)»: D-7 y D-101
 * quedan superadas en ese punto). Lo corrige la talla que ella dice en su ficha (preferencias,
 * tanda 1f), que manda sobre esta deducida.
 */
export function deducirTallas(compras: readonly Compra[]): TallaDeducida[] {
  const vistas = new Set<string>();
  const resultado: TallaDeducida[] = [];
  for (const compra of compras) {
    for (const item of compra.items) {
      if (!item.categoria || !item.talla || vistas.has(item.categoria)) continue;
      vistas.add(item.categoria);
      resultado.push({ categoria: item.categoria, talla: item.talla });
    }
  }
  return resultado;
}

/** Cuántas compras (ventas distintas) hizo en los últimos `meses`, contadas desde `ahora`. */
export function comprasRecientes(compras: readonly Compra[], ahora: Date, meses = MESES_PARA_FRECUENTE): number {
  const corte = new Date(ahora);
  corte.setMonth(corte.getMonth() - meses);
  return compras.filter((c) => new Date(c.fecha) >= corte).length;
}

export type EstadoFrecuente = { esFrecuente: boolean; faltanParaFrecuente: number; comprasEnVentana: number };

/** D-103: «te falta N para frecuente» — regla fija y explicable, nunca guardada. */
export function estadoFrecuente(compras: readonly Compra[], ahora: Date): EstadoFrecuente {
  const comprasEnVentana = comprasRecientes(compras, ahora);
  const esFrecuente = comprasEnVentana >= COMPRAS_PARA_FRECUENTE;
  return { esFrecuente, faltanParaFrecuente: esFrecuente ? 0 : COMPRAS_PARA_FRECUENTE - comprasEnVentana, comprasEnVentana };
}

/* ------------------------------------------------------------------
   El historial de la ficha: una sola línea de tiempo (Felipe 2026-10-20, diseño B)
   ------------------------------------------------------------------
   Antes eran cuatro listas sueltas (compras, cambios, devoluciones, apartados). Ahora van juntas, de lo más nuevo a lo más viejo,
   cada una con su etiqueta, su sede y su monto; se filtran por tipo y se agrupan por mes. Solo ordena y pone en palabras lo que
   `fn_clienta_*` ya trajo: no calcula nada que la base no haya dicho (el total comprado es la suma de las compras leídas). */

export type TipoMovimiento = "compra" | "cambio" | "devolucion" | "apartado";
export type FiltroLinea = "todo" | TipoMovimiento;

export type Movimiento = {
  /** Único dentro de la línea (el tipo y el id de su fila): sirve de `key`. */
  clave: string;
  tipo: TipoMovimiento;
  /** El instante o el día tal como lo dio la base. */
  fecha: string;
  /** La tienda donde pasó; los apartados y devoluciones no la traen. */
  sede: string | null;
  detalle: string;
  /** Lo que vale (compra, apartado) o lo que se devolvió; null si no hay monto que decir. */
  monto: number | null;
  /** «Vigente», «Aprobada»…: el estado que dio la base, con su primera letra en mayúscula. */
  estado: string | null;
};

const mayuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

const detalleDeCompra = (c: Compra) =>
  c.items.map((i) => `${i.cantidad}× ${i.categoria ?? "prenda"}${i.talla ? ` (${i.talla})` : ""}`).join(", ") || "Sin detalle";

/** Todo lo que hizo, junto y ordenado de lo más nuevo a lo más viejo (a igual fecha, el orden en que llegó). */
export function lineaDeTiempo(f: Pick<FichaClienta, "compras" | "cambios" | "devoluciones" | "separaciones">): Movimiento[] {
  const todos: Movimiento[] = [
    ...f.compras.map((c): Movimiento => ({ clave: `compra-${c.ventaId}`, tipo: "compra", fecha: c.fecha, sede: c.ubicacion, detalle: detalleDeCompra(c), monto: c.total, estado: null })),
    ...f.cambios.map((c): Movimiento => ({ clave: `cambio-${c.id}`, tipo: "cambio", fecha: c.fecha, sede: c.ubicacion, detalle: c.motivo ?? "Cambio de prenda", monto: null, estado: null })),
    ...f.devoluciones.map((d): Movimiento => ({ clave: `devolucion-${d.id}`, tipo: "devolucion", fecha: d.fecha, sede: null, detalle: d.motivo ?? "Devolución", monto: d.reembolsoMonto, estado: mayuscula(d.estado) })),
    ...f.separaciones.map((s): Movimiento => ({ clave: `apartado-${s.id}`, tipo: "apartado", fecha: s.fecha, sede: null, detalle: s.codigo, monto: s.total, estado: mayuscula(s.estado) })),
  ];
  return todos
    .map((m, i) => ({ m, i, t: Date.parse(m.fecha) }))
    .sort((a, b) => (Number.isNaN(b.t) ? 0 : b.t) - (Number.isNaN(a.t) ? 0 : a.t) || a.i - b.i)
    .map(({ m }) => m);
}

/** Cuánto sumaron las compras que se leyeron. Sin descontar devoluciones: la ficha lo dice cuando hay alguna. */
export function totalComprado(compras: readonly Compra[]): number {
  return compras.reduce((suma, c) => suma + c.total, 0);
}

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = { compra: "Compra", cambio: "Cambio", devolucion: "Devolución", apartado: "Apartado" };
const PLURAL_MOVIMIENTO: Record<TipoMovimiento, string> = { compra: "Compras", cambio: "Cambios", devolucion: "Devoluciones", apartado: "Apartados" };

/** Las píldoras de la línea: «Todo» y solo los tipos que tienen algo, cada uno con cuántos. */
export function filtrosDeLaLinea(movimientos: readonly Movimiento[]): { valor: FiltroLinea; texto: string; cuenta: number }[] {
  const tipos: TipoMovimiento[] = ["compra", "cambio", "devolucion", "apartado"];
  return [
    { valor: "todo", texto: "Todo", cuenta: movimientos.length },
    ...tipos.flatMap((t) => {
      const cuenta = movimientos.filter((m) => m.tipo === t).length;
      return cuenta > 0 ? [{ valor: t, texto: PLURAL_MOVIMIENTO[t], cuenta }] : [];
    }),
  ];
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** El día y el mes de un movimiento en hora de Lima («16», «oct»); sin fecha legible, guiones. */
export function diaYMesDe(fecha: string): { dia: string; mes: string } {
  const d = diaLima(fecha);
  if (!d) return { dia: "—", mes: "" };
  const [, m, dd] = d.split("-");
  return { dia: dd, mes: MESES_CORTOS[Number(m) - 1] ?? "" };
}

/** Los movimientos de cada mes («Octubre 2026»), en el mismo orden en que llegaron. */
export function agruparPorMes<T extends { fecha: string }>(movimientos: readonly T[]): { mes: string; movimientos: T[] }[] {
  const grupos: { mes: string; movimientos: T[] }[] = [];
  for (const m of movimientos) {
    const d = diaLima(m.fecha);
    const [anio, mes] = d ? d.split("-") : [];
    const titulo = d ? `${MESES[Number(mes) - 1]} ${anio}` : "Sin fecha";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.mes === titulo) ultimo.movimientos.push(m);
    else grupos.push({ mes: titulo, movimientos: [m] });
  }
  return grupos;
}
