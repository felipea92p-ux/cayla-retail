import { textoCategoria, type FlujoReal, type SemanaReal } from "./flujo-caja-reglas";
import { sumarDias, type Periodo } from "./estados-periodo";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: «Movimientos» (Felipe 2026-11-09). Lo que entró y salió de la plata de CAYLA, día por día, como la lista
// de movimientos de la app del banco. Lógica pura sobre `fn_flujo_caja_real`, la misma lectura de Estados financieros ▸ Flujo de efectivo: un día aquí
// suma lo mismo que ese estado mirando ese día. No se suma plata nueva: se agrupa lo que la base ya dio y se escribe en palabras de tienda.
//
// Lo que solo cambia de lugar (la plata en camino entre cuentas) se muestra sin signo y no entra en lo que entró o salió del día; lo que faltó o sobró
// al contar una caja sí cambia la plata, y lleva su signo; lo que se le paga a CLAURE sale, pero se dice que no es gasto: es de Claudia. Un período
// largo o un mes que ya cerró se cuenta por semanas, y los días seguidos sin movimiento van en una sola línea.

/** Cuántos días se muestran uno por uno. */
export const DIAS_DEL_FEED = 6;

const MEDIOS = ["efectivo", "yape", "plin", "tarjeta", "transferencia", "qr"] as const;
const NEUTRAS = new Set(["entre_cuentas"]);
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export type TipoMovimientoFeed = "cobro" | "entra" | "sale" | "claure" | "ajuste" | "mueve";
export type MovimientoFeed = { clave: string; tipo: TipoMovimientoFeed; titulo: string; detalle: string; monto: number };
export type DiaFeed = { fecha: string; nombre: string; movimientos: MovimientoFeed[]; neto: number };
export type SemanaFeed = { desde: string; hasta: string; entro: number; salio: number };

/** Qué días se piden uno por uno, del más nuevo al más viejo; `null` si el período se cuenta por semanas. */
export function diasDelFeed(p: Pick<Periodo, "desde" | "hasta" | "dias" | "enCurso">): string[] | null {
  if (!p.enCurso && p.dias > DIAS_DEL_FEED + 1) return null;
  const n = Math.min(DIAS_DEL_FEED, p.dias);
  return Array.from({ length: n }, (_, i) => sumarDias(p.hasta, -i)).filter((d) => d >= p.desde);
}

/** «Hoy · lunes 9», «Ayer · domingo 8», «Sábado 7». */
export function nombreDelDia(fecha: string, hoy: string): string {
  const f = new Date(`${fecha}T12:00:00Z`);
  const base = `${DIAS[f.getUTCDay()]} ${f.getUTCDate()}`;
  if (fecha === hoy) return `Hoy · ${base}`;
  if (fecha === sumarDias(hoy, -1)) return `Ayer · ${base}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const solesCorto = (n: number) => `S/ ${Math.round(n).toLocaleString("en-US")}`;

/** Los movimientos de un día (o de cualquier tramo): los cobros a clientes juntos, con sus medios; lo demás, uno por categoría, de mayor a menor. */
export function movimientosDe(real: Pick<FlujoReal, "categorias">): { movimientos: MovimientoFeed[]; neto: number } {
  const medios = MEDIOS.map((m) => ({ m, monto: r2(real.categorias.filter((c) => c.clave === m && c.lado === "entra").reduce((a, c) => a + c.monto, 0)) })).filter((x) => Math.abs(x.monto) > 0.004);
  const cobrado = r2(medios.reduce((a, x) => a + x.monto, 0));
  const movimientos: MovimientoFeed[] = [];
  if (cobrado > 0.004) {
    movimientos.push({ clave: "cobros", tipo: "cobro", titulo: "Cobraste a clientes", detalle: medios.map((x) => `${textoCategoria(x.m)} ${solesCorto(x.monto)}`).join(" · "), monto: cobrado });
  }
  const resto = real.categorias.filter((c) => !(c.lado === "entra" && (MEDIOS as readonly string[]).includes(c.clave)) && Math.abs(c.monto) > 0.004);
  const juntas = new Map<string, MovimientoFeed>();
  for (const c of resto) {
    const tipo: TipoMovimientoFeed = NEUTRAS.has(c.clave) ? "mueve" : c.lado === "ajuste" ? "ajuste" : c.clave === "pago_claure" ? "claure" : c.lado === "entra" ? "entra" : "sale";
    const k = `${tipo}|${c.clave}`;
    const ya = juntas.get(k);
    if (ya) ya.monto = r2(ya.monto + c.monto);
    else
      juntas.set(k, {
        clave: k,
        tipo,
        titulo: textoCategoria(c.clave),
        detalle:
          tipo === "mueve" ? "La plata cambia de lugar: no es gasto" : tipo === "claure" ? "Lo que Claudia vendió en Lima: no es gasto" : tipo === "ajuste" ? "Lo que faltó o sobró al contar la caja" : "",
        monto: r2(c.monto),
      });
  }
  const orden: Record<TipoMovimientoFeed, number> = { cobro: 0, entra: 1, sale: 2, claure: 3, ajuste: 4, mueve: 5 };
  movimientos.push(...[...juntas.values()].sort((a, b) => orden[a.tipo] - orden[b.tipo] || Math.abs(b.monto) - Math.abs(a.monto)));
  // Lo que entra suma, lo que sale resta, un ajuste ya trae su signo y lo que cambia de lugar no cuenta.
  const neto = r2(movimientos.reduce((a, m) => a + (m.tipo === "cobro" || m.tipo === "entra" || m.tipo === "ajuste" ? m.monto : m.tipo === "sale" || m.tipo === "claure" ? -m.monto : 0), 0));
  return { movimientos, neto };
}

/** Un día del feed, con su nombre. */
export function diaDelFeed(fecha: string, hoy: string, real: Pick<FlujoReal, "categorias">): DiaFeed {
  return { fecha, nombre: nombreDelDia(fecha, hoy), ...movimientosDe(real) };
}

/** Las semanas de un período largo, de la más nueva a la más vieja. */
export function semanasDelFeed(semanas: readonly SemanaReal[]): SemanaFeed[] {
  return [...semanas].reverse().map((s) => ({ desde: s.desde, hasta: s.hasta, entro: r2(s.entro), salio: r2(s.salio) }));
}

export type PasoDelFeed = { tipo: "dia"; dia: DiaFeed } | { tipo: "vacios"; clave: string; texto: string };

/** Los días seguidos sin movimiento, en una sola línea («Del miércoles 4 al domingo 8, no entró ni salió plata»). */
export function pasosDelFeed(dias: readonly DiaFeed[]): PasoDelFeed[] {
  const pasos: PasoDelFeed[] = [];
  let tanda: DiaFeed[] = [];
  const cerrar = () => {
    if (!tanda.length) return;
    const nuevo = tanda[0]!;
    const viejo = tanda[tanda.length - 1]!;
    const corto = (d: DiaFeed) => d.nombre.replace(/^(Hoy|Ayer) · /, "").toLowerCase();
    const texto = tanda.length === 1 ? `${nuevo.nombre}: no entró ni salió plata.` : `Del ${corto(viejo)} al ${corto(nuevo)}, no entró ni salió plata.`;
    pasos.push({ tipo: "vacios", clave: `vacios-${nuevo.fecha}`, texto });
    tanda = [];
  };
  for (const d of dias) {
    if (d.movimientos.length === 0) tanda.push(d);
    else {
      cerrar();
      pasos.push({ tipo: "dia", dia: d });
    }
  }
  cerrar();
  return pasos;
}
