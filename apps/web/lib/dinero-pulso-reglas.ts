// Cuentas y dinero en camino A («La respuesta», Felipe 2026-10-15): tres preguntas arriba de la lista de cuentas.
// ¿Dónde está mi plata? (lo que tienes, sumado de los saldos que la base ya calculó), ¿me alcanza? (si hoy o algún día de la
// proyección quedas bajo tu mínimo, y que lo guardado ya cuenta en ese saldo) y ¿qué debes? (lo vencido y lo
// próximo de Por pagar). Lógica pura: no suma plata que la base no haya sumado; solo decide qué se dice primero.

import { cuentasVisibles, type CuentaDinero } from "./cuentas-dinero-reglas";
import { cajaDiaria, conLoRegistrado, etiquetaSemana, fechaEnPalabras, fraseBajoMinimo, puntoMasBajo, queFaltaEnLaProyeccion, soles, type FaltaProy, type Proyeccion, type SemanaProy } from "./flujo-caja-reglas";
import { diasHasta, type FilaPorPagar } from "./por-pagar-consolidado-reglas";

const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = (cs: readonly CuentaDinero[]) => r2(cs.reduce((a, c) => a + (c.saldo ?? 0), 0));

// ---- 1. ¿Dónde está mi plata? -------------------------------------------------------------------------------------------

export type ParteTienes = { clave: "bancos" | "camino" | "efectivo" | "compras" | "debes_compras"; titulo: string; monto: number };
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
  // ADR-0621: el fondo de compras ya viene sin lo gastado (aunque el papel siga por completar): es lo que las compradoras tienen para comprar.
  // Lo que queda (nunca negativo, como `fn_flujo_por_volver`); lo que una compradora gastó de más es lo que CAYLA le debe, y va aparte.
  const fondos = vis.filter((c) => c.tipo === "fondo");
  const compras = r2(fondos.reduce((a, c) => a + Math.max(c.saldo ?? 0, 0), 0));
  const debesCompras = r2(fondos.reduce((a, c) => a + Math.min(c.saldo ?? 0, 0), 0));
  const guardado = suma(vis.filter((c) => c.tipo === "caja_fuerte" || c.tipo === "por_rendir"));
  const tarjeta = Math.abs(suma(vis.filter((c) => c.tipo === "tarjeta_credito")));
  const ocultas = vis.some((c) => c.saldo === null && c.tipo !== "tarjeta_credito");
  const partes: ParteTienes[] = [];
  if (vis.some((c) => c.tipo === "banco")) partes.push({ clave: "bancos", titulo: "En los bancos", monto: bancos });
  if (vis.some((c) => c.tipo === "por_abonar")) partes.push({ clave: "camino", titulo: "En camino (tarjeta por abonar)", monto: camino });
  if (vis.some((c) => c.tipo === "cajon" || c.tipo === "caja_fuerte" || c.tipo === "por_rendir")) partes.push({ clave: "efectivo", titulo: "En efectivo", monto: efectivo });
  if (compras > 0) partes.push({ clave: "compras", titulo: "Por volver de compras", monto: compras });
  if (debesCompras < 0) partes.push({ clave: "debes_compras", titulo: "Le debes a las compradoras", monto: debesCompras });
  const total = r2(bancos + camino + efectivo + compras + debesCompras);
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
      /** `hoy_bajo`: ya hoy estás bajo el mínimo. `baja`: un día de la proyección lo estarás. */
      estado: "bien" | "baja" | "hoy_bajo";
      frase: string;
      /** La semana donde cae la primera baja, o la que cierra más bajo si no baja o si ya estás bajo hoy. */
      semana: SemanaProy;
      minimo: number;
      diasDeCaja: number | null;
      /** La proyección se apoya en pocos datos (ADR-0433, actividad 4): no se pinta como una respuesta firme, y dice qué falta. */
      provisional: boolean;
      faltan: FaltaProy[];
      /** Lo guardado (cajas fuertes y lo del líder) ya está dentro del saldo de la proyección: depositarlo lo pasa al banco, no lo aumenta. */
      guardadoYaCuenta: { monto: number; frase: string } | null;
      /** Lo que es de Claudia y la proyección ya no cuenta como tuyo (ADR-0560, actividad 16). */
      deClaudia: { monto: number; frase: string } | null;
      /** Lo que las compradoras tienen para comprar: es tuyo, pero no paga cuentas, y la proyección ya no lo cuenta (ADR-0621). */
      porVolver: { monto: number; frase: string } | null;
    };

export function alcanzaPulso(p: Proyeccion | null, guardado: number, falla = false): Alcanza {
  if (falla) return { estado: "sin_dato", frase: "No se pudo leer lo que viene. Vuelve a cargar la página en un rato." };
  if (!p || p.semanas.length === 0) return { estado: "sin_dato", frase: "El flujo de caja de las próximas semanas lo ve el líder." };
  // El mismo día por día de «Tu caja», con hoy incluido y en todas las semanas: el cierre de una semana no ve hoy ni la caída de un día de planilla.
  const caja = cajaDiaria(p);
  const primera = caja.puntos.find((x) => x.saldo < p.minimoCaja) ?? null;
  const masBajo = puntoMasBajo(caja.puntos)!;
  const masBaja = p.semanas.reduce((m, s) => (s.saldo < m.saldo ? s : m), p.semanas[0]!);
  const { provisional, faltan } = queFaltaEnLaProyeccion(p);
  // El saldo de la proyección (`fn_flujo_disponible`) suma todas las cuentas, cajas fuertes y lo del líder incluidos: sumarles `guardado`
  // otra vez prometía un saldo que depositar no cambia (DIN-01, examen de Finanzas 2026-10-27).
  const guardadoYaCuenta =
    guardado > 0
      ? {
          monto: guardado,
          frase: `Lo que tienes guardado (${soles(guardado)}, en cajas fuertes y con el líder) ya cuenta en ese saldo: depositarlo lo pasa al banco, pero no lo aumenta.`,
        }
      : null;
  const comun = {
    minimo: p.minimoCaja,
    diasDeCaja: p.diasDeCaja,
    provisional,
    faltan,
    deClaudia: aparteDeClaudia(p.deClaudia),
    porVolver: aparteDePorVolver(p.porVolverCompras),
  };
  if (primera) {
    const hoyBajo = primera.fecha === p.hoy;
    const delDia = fraseBajoMinimo({ hoy: p.hoy, masBajo, bajaDesde: primera.fecha, sinPlata: caja.puntos.some((x) => x.saldo < 0), minimo: p.minimoCaja });
    const frase =
      primera.semana && !hoyBajo
        ? `La semana ${etiquetaSemana(primera.semana.desde, primera.semana.hasta)} bajas a ${soles(primera.saldo)}, bajo tu mínimo de ${soles(p.minimoCaja)}.`
        : provisional
          ? conLoRegistrado(delDia)
          : delDia;
    return {
      ...comun,
      estado: hoyBajo ? "hoy_bajo" : "baja",
      frase,
      semana: p.semanas.find((s) => s.desde <= primera.fecha && primera.fecha <= s.hasta) ?? masBaja,
      guardadoYaCuenta,
    };
  }
  const elMasBajo = masBajo.fecha === p.hoy ? "hoy" : `el ${fechaEnPalabras(masBajo.fecha)}`;
  return {
    ...comun,
    estado: "bien",
    frase: `En las próximas ${p.semanas.length} semanas no bajas de tu mínimo de ${soles(p.minimoCaja)}. ${
      caja.porSemana ? `La más baja es la ${etiquetaSemana(masBaja.desde, masBaja.hasta)}, con ${soles(masBaja.saldo)}.` : `El día más bajo es ${elMasBajo}, con ${soles(masBajo.saldo)}.`
    }`,
    semana: masBaja,
    guardadoYaCuenta: null,
  };
}

/** «Sin los S/ X que son de Claudia»: la proyección parte de lo que hay menos lo que se le debe, y lo dice. */
function aparteDeClaudia(monto: number | null | undefined): { monto: number; frase: string } | null {
  if (!monto || !(monto > 0)) return null;
  return { monto, frase: `Sin los ${soles(monto)} que son de Claudia (CLAURE): ya están restados de lo que tienes.` };
}

/** «Sin los S/ X por volver de compras»: lo que las compradoras todavía tienen del fondo es de CAYLA, pero va a mercadería, no a pagar cuentas. */
export function aparteDePorVolver(monto: number | null | undefined): { monto: number; frase: string } | null {
  if (!monto || !(monto > 0)) return null;
  return { monto, frase: `Sin los ${soles(monto)} que las compradoras todavía tienen para comprar: son tuyos, pero van a mercadería, no a pagar cuentas.` };
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
  const cuando = (d: number) => (p?.origen === "servicio" ? "sin fecha" : d === 0 ? "vence hoy" : d === 1 ? "vence mañana" : `vence en ${d} días`);
  let frase: string;
  if (conSaldo.length === 0) frase = "No debes nada registrado. Si hay facturas sin anotar, no están aquí.";
  else if (vencidas.length > 0) frase = `${vencidas.length} ${vencidas.length === 1 ? "factura vencida" : "facturas vencidas"} por ${soles(montoVencido)}.${proxima ? ` Lo próximo: ${proxima.proveedor}, ${soles(proxima.saldo)}, ${cuando(proxima.dias)}.` : ""}`;
  else if (proxima) frase = `Nada vencido. Lo próximo: ${proxima.proveedor}, ${soles(proxima.saldo)}, ${cuando(proxima.dias)}.`;
  else frase = "Nada vencido.";
  const tono: Debes["tono"] = conSaldo.length === 0 ? "verde" : vencidas.length > 0 ? "rojo" : proxima && proxima.dias <= 3 ? "ambar" : "pizarra";
  return { total, n: conSaldo.length, vencidas: vencidas.length, montoVencido, proxima, tono, frase };
}
