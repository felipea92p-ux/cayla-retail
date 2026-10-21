// Cuentas y dinero en camino A («La respuesta», Felipe 2026-10-15): tres preguntas arriba de la lista de cuentas.
// ¿Dónde está mi plata? (lo que tienes, sumado de los saldos que la base ya calculó), ¿me alcanza? (la primera semana en que
// el Flujo proyectado baja de tu mínimo, y qué pasa si depositas lo que está guardado) y ¿qué debes? (lo vencido y lo
// próximo de Por pagar). Lógica pura: no suma plata que la base no haya sumado; solo decide qué se dice primero.

import { cuentasVisibles, type CuentaDinero } from "./cuentas-dinero-reglas";
import { etiquetaSemana, queFaltaEnLaProyeccion, soles, type FaltaProy, type Proyeccion, type SemanaProy } from "./flujo-caja-reglas";
import { diasHasta, type FilaPorPagar } from "./por-pagar-consolidado-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = (cs: readonly CuentaDinero[]) => r2(cs.reduce((a, c) => a + (c.saldo ?? 0), 0));

// ---- 1. ¿Dónde está mi plata? -------------------------------------------------------------------------------------------

export type ParteTienes = { clave: "bancos" | "camino" | "efectivo"; titulo: string; monto: number };
export type Tienes = {
  /** Bancos + en camino + efectivo; sin la tarjeta de crédito, que es deuda. */
  total: number;
  partes: ParteTienes[];
  /** Lo que se debe en tarjetas de crédito de CAYLA (en positivo). */
  tarjeta: number;
  /** Algún saldo no se ve (el cajón abierto lo ve quien cierra la caja). */
  ocultas: boolean;
  /** Lo que está guardado y no en el banco: cajas fuertes y lo que lleva el líder. Es lo que se puede depositar. */
  guardado: number;
  frase: string;
};

export function tienesPulso(cuentas: readonly CuentaDinero[], ubicacionId: string | null): Tienes {
  const vis = cuentasVisibles(cuentas, ubicacionId).filter((c) => !c.archivada);
  const bancos = suma(vis.filter((c) => c.tipo === "banco"));
  const camino = suma(vis.filter((c) => c.tipo === "por_abonar"));
  const efectivo = suma(vis.filter((c) => c.tipo === "cajon" || c.tipo === "caja_fuerte" || c.tipo === "por_rendir"));
  const guardado = suma(vis.filter((c) => c.tipo === "caja_fuerte" || c.tipo === "por_rendir"));
  const tarjeta = Math.abs(suma(vis.filter((c) => c.tipo === "tarjeta_credito")));
  const ocultas = vis.some((c) => c.saldo === null && c.tipo !== "tarjeta_credito");
  const partes: ParteTienes[] = [];
  if (vis.some((c) => c.tipo === "banco")) partes.push({ clave: "bancos", titulo: "En los bancos", monto: bancos });
  if (vis.some((c) => c.tipo === "por_abonar")) partes.push({ clave: "camino", titulo: "En camino (tarjeta por abonar)", monto: camino });
  if (vis.some((c) => c.tipo === "cajon" || c.tipo === "caja_fuerte" || c.tipo === "por_rendir")) partes.push({ clave: "efectivo", titulo: "En efectivo", monto: efectivo });
  const total = r2(bancos + camino + efectivo);
  const frase =
    partes.length === 0
      ? "Todavía no hay cuentas con saldo."
      : `${partes.map((p) => `${p.titulo.toLowerCase()} ${soles(p.monto)}`).join(" · ")}${tarjeta > 0 ? `. Aparte, debes ${soles(tarjeta)} en la tarjeta de crédito` : ""}${ocultas ? ". El cajón abierto lo ve quien cierra la caja" : ""}.`;
  return { total, partes, tarjeta, ocultas, guardado, frase: frase.charAt(0).toUpperCase() + frase.slice(1) };
}

// ---- 2. ¿Me alcanza? --------------------------------------------------------------------------------------------------

export type Alcanza =
  | { estado: "sin_dato"; frase: string }
  | {
      estado: "bien" | "baja";
      frase: string;
      /** La primera semana bajo el mínimo (baja) o la más baja (bien). */
      semana: SemanaProy;
      minimo: number;
      diasDeCaja: number | null;
      /** La proyección se apoya en pocos datos (ADR-0433, actividad 4): no se pinta como una respuesta firme, y dice qué falta. */
      provisional: boolean;
      faltan: FaltaProy[];
      /** Si depositas lo guardado (cajas fuertes y lo del líder): cuánto y en qué queda esa semana. */
      siDepositas: { monto: number; saldo: number; alcanza: boolean; frase: string } | null;
    };

export function alcanzaPulso(p: Proyeccion | null, guardado: number): Alcanza {
  if (!p || p.semanas.length === 0) return { estado: "sin_dato", frase: "El flujo de caja de las próximas semanas lo ve el líder." };
  const baja = p.semanas.find((s) => s.bajoMinimo) ?? null;
  const masBaja = p.semanas.reduce((m, s) => (s.saldo < m.saldo ? s : m), p.semanas[0]!);
  const semana = baja ?? masBaja;
  const { provisional, faltan } = queFaltaEnLaProyeccion(p);
  const siDepositas =
    guardado > 0
      ? (() => {
          const saldo = r2(semana.saldo + guardado);
          const alcanza = saldo >= p.minimoCaja;
          return {
            monto: guardado,
            saldo,
            alcanza,
            frase: `Si depositas lo guardado en cajas fuertes (${soles(guardado)}), esa semana quedas en ${soles(saldo)}${alcanza ? ", por encima de tu mínimo." : ", todavía bajo tu mínimo."}`,
          };
        })()
      : null;
  if (baja) {
    return {
      estado: "baja",
      frase: `La semana ${etiquetaSemana(baja.desde, baja.hasta)} bajas a ${soles(baja.saldo)}, bajo tu mínimo de ${soles(p.minimoCaja)}.`,
      semana: baja,
      minimo: p.minimoCaja,
      diasDeCaja: p.diasDeCaja,
      provisional,
      faltan,
      siDepositas,
    };
  }
  return {
    estado: "bien",
    frase: `En las próximas ${p.semanas.length} semanas no bajas de tu mínimo de ${soles(p.minimoCaja)}. La más baja es la ${etiquetaSemana(masBaja.desde, masBaja.hasta)}, con ${soles(masBaja.saldo)}.`,
    semana: masBaja,
    minimo: p.minimoCaja,
    diasDeCaja: p.diasDeCaja,
    provisional,
    faltan,
    siDepositas: null,
  };
}

// ---- 3. ¿Qué debes? ----------------------------------------------------------------------------------------------------

export type Debes = {
  total: number;
  n: number;
  vencidas: number;
  montoVencido: number;
  proxima: { proveedor: string; documento: string; saldo: number; vence: string; dias: number } | null;
  tono: "rojo" | "ambar" | "pizarra" | "verde";
  frase: string;
};

export function debesPulso(filas: readonly FilaPorPagar[], hoy: string): Debes {
  const conSaldo = filas.filter((f) => f.saldo > 0.004);
  const total = r2(conSaldo.reduce((a, f) => a + f.saldo, 0));
  const vencidas = conSaldo.filter((f) => diasHasta(f.vence, hoy) < 0);
  const montoVencido = r2(vencidas.reduce((a, f) => a + f.saldo, 0));
  const futuras = conSaldo.filter((f) => diasHasta(f.vence, hoy) >= 0).sort((a, b) => diasHasta(a.vence, hoy) - diasHasta(b.vence, hoy) || b.saldo - a.saldo);
  const p = futuras[0];
  const proxima = p ? { proveedor: p.proveedor, documento: p.documento, saldo: r2(p.saldo), vence: p.vence, dias: diasHasta(p.vence, hoy) } : null;
  const cuando = (d: number) => (d === 0 ? "vence hoy" : d === 1 ? "vence mañana" : `vence en ${d} días`);
  let frase: string;
  if (conSaldo.length === 0) frase = "No debes nada registrado. Si hay facturas sin anotar, no están aquí.";
  else if (vencidas.length > 0) frase = `${vencidas.length} ${vencidas.length === 1 ? "factura vencida" : "facturas vencidas"} por ${soles(montoVencido)}.${proxima ? ` Lo próximo: ${proxima.proveedor}, ${soles(proxima.saldo)}, ${cuando(proxima.dias)}.` : ""}`;
  else if (proxima) frase = `Nada vencido. Lo próximo: ${proxima.proveedor}, ${soles(proxima.saldo)}, ${cuando(proxima.dias)}.`;
  else frase = "Nada vencido.";
  const tono: Debes["tono"] = conSaldo.length === 0 ? "verde" : vencidas.length > 0 ? "rojo" : proxima && proxima.dias <= 3 ? "ambar" : "pizarra";
  return { total, n: conSaldo.length, vencidas: vencidas.length, montoVencido, proxima, tono, frase };
}
