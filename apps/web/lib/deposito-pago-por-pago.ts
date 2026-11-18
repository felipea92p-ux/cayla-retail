// El depósito de una máquina a mano, pago por pago (ADR-0629, Fase B). Lógica pura de la hoja «Depósito de la máquina».
//
// EL PROBLEMA. La hoja solo dejaba marcar DÍAS enteros (tienda y medio). Izipay manda el QR suelto, un abono por cada pago: si llegaron
// S/ 21 de un QR, había que marcar el día completo (S/ 1,138.40) y la «comisión» salía en S/ 1,117.40. La base ya sabía registrar un
// depósito por pagos (`registrar_abono_pos_pagos`, la que usa «Cuadrar con extracto»); faltaba que la hoja dejara elegirlos.
//
// CÓMO. Cada día se puede marcar entero o abrir y marcar sus pagos uno por uno. Si TODO lo marcado tiene sus pagos a la vista, el depósito
// se registra por pagos (`registrar_abono_pos_pagos`), también cuando un día va entero: si fuera por días (`registrar_abono_pos`), ese día
// quedaría «sin detalle» para siempre y su próximo QR suelto ya no se podría registrar pago por pago. Solo lo que no tiene pagos a la vista
// (no llegaron, el día es de hace más de dos meses o su depósito anterior no dijo qué pagos cubrió) va por días, como siempre. Un día así no
// se abre: adivinar sus pagos depositaría dos veces el mismo QR.

import {
  lotesPorDefecto,
  revisarComision,
  validarAbonoPos,
  type BorradorMovimiento,
  type CuentaDinero,
  type LotePendiente,
  type PayloadAbonoPos,
} from "./cuentas-dinero-reglas";
import type { PagoMaquina } from "./emparejar-maquinas";
import { fechaCorta, montoDentroDelTope, parsearMonto, type Resultado } from "./gastos-reglas";
import { solesDeCentimos } from "./extracto-interbank";

/** Un día pendiente de la máquina con sus pagos todavía sin depositar. `conDetalle`: sus pagos se pueden marcar uno por uno. */
export type DiaDeposito = {
  lote: LotePendiente;
  pagos: PagoMaquina[];
  conDetalle: boolean;
};

/**
 * Lo marcado en la hoja: los días enteros (`dias`, por su clave) y, de los días a medias, sus pagos sueltos (`pagos`, por `llavePago`).
 * Un día está en uno de los dos, nunca en ambos: así marcar días sigue funcionando aunque los pagos todavía no hayan llegado.
 */
export type EleccionDeposito = { dias: string[]; pagos: string[] };

export const llavePago = (p: Pick<PagoMaquina, "origen" | "origenId">) => `${p.origen}:${p.origenId}`;
const aCentimos = (soles: number) => Math.round(soles * 100);

/**
 * Junta los días pendientes (`fn_pos_pendientes`) con los pagos de la máquina (`fn_pos_pagos_por_depositar`). Un día se abre pago por pago
 * solo si sus pagos sin depositar suman exactamente lo que el día espera y ningún depósito anterior lo cubrió sin detalle. Sin pagos
 * (no llegaron, fallaron o el día es de hace más de dos meses), el día se marca entero como siempre.
 */
export function armarDias(lotes: readonly LotePendiente[], pagos: readonly PagoMaquina[] | null): DiaDeposito[] {
  const porClave = new Map<string, PagoMaquina[]>();
  for (const p of pagos ?? []) {
    const lista = porClave.get(p.clave) ?? [];
    lista.push(p);
    porClave.set(p.clave, lista);
  }
  return lotes.map((lote) => {
    const todos = porClave.get(lote.clave) ?? [];
    const pendientes = todos.filter((p) => !p.depositado).sort((a, b) => a.hora.localeCompare(b.hora) || a.origenId.localeCompare(b.origenId));
    const suma = pendientes.reduce((a, p) => a + p.montoCentimos, 0);
    const conDetalle = pendientes.length > 0 && !todos.some((p) => p.diaSinDetalle) && suma === aCentimos(lote.bruto);
    return { lote, pagos: conDetalle ? pendientes : [], conDetalle };
  });
}

/** Lo que viene marcado al abrir: los días enteros hasta la fecha del depósito, como siempre (`lotesPorDefecto`). */
export function eleccionPorDefecto(dias: readonly DiaDeposito[], fechaDeposito: string, desde: string | null = null): EleccionDeposito {
  return {
    dias: lotesPorDefecto(
      dias.map((d) => d.lote),
      fechaDeposito,
      desde,
    ),
    pagos: [],
  };
}

export type EstadoDia = "todo" | "parte" | "nada";
export function estadoDia(d: DiaDeposito, e: EleccionDeposito): EstadoDia {
  if (e.dias.includes(d.lote.clave)) return "todo";
  return d.pagos.some((p) => e.pagos.includes(llavePago(p))) ? "parte" : "nada";
}

const sinPagosDe = (d: DiaDeposito, pagos: readonly string[]) => {
  const suyos = new Set(d.pagos.map(llavePago));
  return pagos.filter((k) => !suyos.has(k));
};

/** La casilla del día: con todo marcado lo quita entero; a medias o sin marcar, lo marca entero. */
export function alternarDia(d: DiaDeposito, e: EleccionDeposito): EleccionDeposito {
  const clave = d.lote.clave;
  if (estadoDia(d, e) === "todo")
    return {
      dias: e.dias.filter((c) => c !== clave),
      pagos: sinPagosDe(d, e.pagos),
    };
  return { dias: [...e.dias, clave], pagos: sinPagosDe(d, e.pagos) };
}

/** La casilla de un pago. Si el día estaba entero, queda a medias sin ese pago; si con este quedan todos, vuelve a ser el día entero. */
export function alternarPago(d: DiaDeposito, p: PagoMaquina, e: EleccionDeposito): EleccionDeposito {
  const clave = d.lote.clave;
  const k = llavePago(p);
  const suyos = d.pagos.map(llavePago);
  let marcadosDelDia: string[];
  if (e.dias.includes(clave)) marcadosDelDia = suyos.filter((x) => x !== k);
  else if (e.pagos.includes(k)) marcadosDelDia = suyos.filter((x) => x !== k && e.pagos.includes(x));
  else marcadosDelDia = suyos.filter((x) => x === k || e.pagos.includes(x));
  const dias = e.dias.filter((c) => c !== clave);
  const resto = sinPagosDe(d, e.pagos);
  if (marcadosDelDia.length > 0 && marcadosDelDia.length === suyos.length) return { dias: [...dias, clave], pagos: resto };
  return { dias, pagos: [...resto, ...marcadosDelDia] };
}

/** Deja marcados solo estos pagos (el atajo «Marcar solo ese pago»), igual que si se marcaran a mano: un día con todos sus pagos va entero. */
export function soloEstosPagos(dias: readonly DiaDeposito[], pagos: readonly PagoMaquina[]): EleccionDeposito {
  let e: EleccionDeposito = { dias: [], pagos: [] };
  for (const p of pagos) {
    const d = dias.find((x) => x.lote.clave === p.clave && x.pagos.some((y) => llavePago(y) === llavePago(p)));
    if (d) e = alternarPago(d, p, e);
  }
  return e;
}

/** Los pagos que cubre lo marcado: todos los de un día entero con detalle y los sueltos de los días a medias. */
function pagosElegidos(dias: readonly DiaDeposito[], e: EleccionDeposito): PagoMaquina[] {
  const out: PagoMaquina[] = [];
  for (const d of dias) {
    if (e.dias.includes(d.lote.clave)) out.push(...d.pagos);
    else out.push(...d.pagos.filter((p) => e.pagos.includes(llavePago(p))));
  }
  return out;
}

/** Los días que toca lo marcado (enteros o a medias). */
const tocados = (dias: readonly DiaDeposito[], e: EleccionDeposito) => dias.filter((d) => estadoDia(d, e) !== "nada");

/**
 * ¿Se registra pago por pago? Sí cuando algún día va a medias, y también cuando todo lo marcado tiene sus pagos a la vista (así el día
 * entero deja dicho qué pagos cubrió). Por días solo si algo marcado no tiene pagos a la vista y ningún día va a medias.
 */
export function esPorPagos(dias: readonly DiaDeposito[], e: EleccionDeposito): boolean {
  const t = tocados(dias, e);
  if (t.length === 0) return false;
  return t.some((d) => estadoDia(d, e) === "parte") || t.every((d) => d.conDetalle);
}

export type ResumenDeposito = {
  /** Cuántos días toca lo marcado (enteros o a medias). */
  dias: number;
  /** Cuántos pagos sueltos (de días a medias) van en el depósito; 0 si todo son días enteros. */
  pagosSueltos: number;
  bruto: number;
  neto: number | null;
  comision: number | null;
  /** La comisión esperada con la tarifa; nula si algún día o pago marcado no tiene tarifa. */
  esperado: number | null;
};

/** La cuenta que la persona ve mientras marca: cuánto se cobró en lo marcado, cuánto llegó y la comisión (la diferencia). */
export function resumenDeposito(dias: readonly DiaDeposito[], e: EleccionDeposito, neto: string): ResumenDeposito {
  let brutoC = 0;
  let esperadoC: number | null = 0;
  let tocados = 0;
  let sueltos = 0;
  for (const d of dias) {
    const estado = estadoDia(d, e);
    if (estado === "nada") continue;
    tocados++;
    if (estado === "todo") {
      brutoC += aCentimos(d.lote.bruto);
      esperadoC = esperadoC === null || d.lote.esperado === null ? null : esperadoC + aCentimos(d.lote.esperado);
      continue;
    }
    for (const p of d.pagos.filter((x) => e.pagos.includes(llavePago(x)))) {
      sueltos++;
      brutoC += p.montoCentimos;
      esperadoC = esperadoC === null || p.netoCentimos === null ? null : esperadoC + (p.montoCentimos - p.netoCentimos);
    }
  }
  const m = neto.trim() === "" ? null : parsearMonto(neto);
  const n = m && m.ok ? m.valor : null;
  return {
    dias: tocados,
    pagosSueltos: sueltos,
    bruto: brutoC / 100,
    neto: n,
    comision: n === null ? null : (brutoC - aCentimos(n)) / 100,
    esperado: tocados === 0 ? null : esperadoC === null ? null : esperadoC / 100,
  };
}

/**
 * Los pagos sin depositar cuyo neto (lo que llega con la tarifa de su medio) es justo lo que se escribió: el QR de Izipay llega suelto, así
 * que «llegaron S/ 21» casi siempre es UN pago. Del más viejo al más nuevo (Izipay los abona en el orden en que se cobraron). Vacío si el
 * monto no se lee o lo marcado ya es exactamente uno de ellos.
 */
export function pagosQueCalzan(dias: readonly DiaDeposito[], e: EleccionDeposito, neto: string, fechaDeposito: string): PagoMaquina[] {
  const m = neto.trim() === "" ? null : parsearMonto(neto);
  if (!m || !m.ok) return [];
  const c = aCentimos(m.valor);
  const calzan = dias
    .flatMap((d) => d.pagos)
    // Un pago posterior a la fecha del depósito no puede ser este depósito (la base lo rechazaría).
    .filter((p) => p.netoCentimos === c && p.fecha <= fechaDeposito)
    .sort((a, b) => a.hora.localeCompare(b.hora) || a.origenId.localeCompare(b.origenId));
  if (calzan.length === 0) return [];
  const elegidos = pagosElegidos(dias, e);
  const yaEsUno =
    e.dias.every((clave) => dias.find((d) => d.lote.clave === clave)?.conDetalle) &&
    elegidos.length === 1 &&
    calzan.some((p) => llavePago(p) === llavePago(elegidos[0]!));
  return yaEsUno ? [] : calzan;
}

/** «3 pagos» o, con el día a medias, «1 de 3 pagos»: el botón que abre los pagos del día. */
export function textoCuantosPagos(d: DiaDeposito, e: EleccionDeposito): string {
  const n = d.pagos.length;
  const total = n === 1 ? "1 pago" : `${n} pagos`;
  if (estadoDia(d, e) !== "parte") return total;
  const marcados = d.pagos.filter((p) => e.pagos.includes(llavePago(p))).length;
  return `${marcados} de ${total}`;
}

/** Desde cuándo se piden los pagos: dos meses antes de hoy, lo que acepta la base en una lectura y al registrar por pagos. */
export function desdeDePagos(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 62);
  return d.toISOString().slice(0, 10);
}

const horaLima = (iso: string) =>
  new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Lima",
  }).format(new Date(iso));
const TEXTO_ORIGEN: Record<PagoMaquina["origen"], string> = {
  venta_pago: "venta",
  separacion_pago: "apartado",
  cambio: "cambio",
};

/** «14:32 · venta»: cómo se lee un pago dentro de su día. */
export function textoPago(p: Pick<PagoMaquina, "hora" | "origen">): string {
  return `${horaLima(p.hora)} · ${TEXTO_ORIGEN[p.origen]}`;
}

/** «llega ≈ S/ 20.50»: lo que ese pago debería dejar en el banco; nulo sin tarifa. */
export function textoLlega(p: Pick<PagoMaquina, "netoCentimos">): string | null {
  return p.netoCentimos === null ? null : `llega ≈ ${solesDeCentimos(p.netoCentimos)}`;
}

/** «9 nov · TRU · QR · 14:32 · S/ 21.00»: un pago dicho fuera de su día (en el atajo). */
export function textoPagoSuelto(p: PagoMaquina, textoDia: string): string {
  return `${textoDia} · ${horaLima(p.hora)} · ${solesDeCentimos(p.montoCentimos)}`;
}

export type PayloadAbonoPagos = {
  p_cuenta_id: string;
  p_banco_id: string;
  p_fecha: string;
  p_neto: number;
  p_pagos: { origen: PagoMaquina["origen"]; origen_id: string }[];
  p_referencia: string | null;
};
export type GuardadoDeposito = { rpc: "registrar_abono_pos"; valor: PayloadAbonoPos } | { rpc: "registrar_abono_pos_pagos"; valor: PayloadAbonoPagos };

/**
 * Lo que exige la base antes de mandar. Por días (`esPorPagos` falso): lo de siempre (`validarAbonoPos` → `registrar_abono_pos`). Por pagos:
 * lo mismo que exige `registrar_abono_pos_pagos` (todos los días tocados con detalle, depósito no anterior a sus pagos, no mayor que lo
 * cobrado), con la misma pregunta de la comisión rara.
 */
export function validarDeposito(
  b: Pick<BorradorMovimiento, "origen" | "destino" | "monto" | "referencia" | "fecha">,
  dias: readonly DiaDeposito[],
  e: EleccionDeposito,
  ctx: {
    cuentas: readonly CuentaDinero[];
    hoy: string;
    comisionConfirmada?: boolean;
  },
): Resultado<GuardadoDeposito> {
  if (!esPorPagos(dias, e)) {
    const v = validarAbonoPos(
      b,
      dias.map((d) => d.lote),
      e.dias,
      ctx,
    );
    return v.ok ? { ok: true, valor: { rpc: "registrar_abono_pos", valor: v.valor } } : v;
  }
  const maquina = ctx.cuentas.find((c) => c.id === b.origen);
  const banco = ctx.cuentas.find((c) => c.id === b.destino);
  if (!maquina || maquina.tipo !== "por_abonar") return { ok: false, error: "Elige la máquina que depositó." };
  if (!banco || banco.tipo !== "banco") return { ok: false, error: "Elige a qué banco llegó." };
  const sinDetalle = dias.find((d) => !d.conDetalle && e.dias.includes(d.lote.clave));
  if (sinDetalle) {
    return {
      ok: false,
      error: `El ${fechaCorta(sinDetalle.lote.fecha)} no se puede separar en pagos y va entero por días; los pagos sueltos van en un depósito aparte. Regístralos por separado.`,
    };
  }
  const pagos = pagosElegidos(dias, e);
  const m = montoDentroDelTope(parsearMonto(b.monto));
  if (!m.ok) return m;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) return { ok: false, error: "Elige la fecha." };
  if (b.fecha > ctx.hoy) return { ok: false, error: "La fecha no puede ser futura." };
  const ultimo = pagos
    .map((p) => p.fecha)
    .sort()
    .at(-1)!;
  if (b.fecha < ultimo)
    return {
      ok: false,
      error: `El depósito no puede ser anterior al último pago que cubre (${fechaCorta(ultimo)}).`,
    };
  const r = resumenDeposito(dias, e, b.monto);
  const rara = revisarComision(r);
  if (rara && !ctx.comisionConfirmada)
    return {
      ok: false,
      error: `${rara} Revísala contra el extracto y confirma.`,
    };
  if (r.comision !== null && r.comision < 0) {
    return {
      ok: false,
      error: `Llegó ${solesDeCentimos(aCentimos(m.valor))} y esos pagos suman ${solesDeCentimos(aCentimos(r.bruto))}: el depósito no puede ser mayor que lo cobrado. Marca los pagos que faltan o revisa el monto.`,
    };
  }
  return {
    ok: true,
    valor: {
      rpc: "registrar_abono_pos_pagos",
      valor: {
        p_cuenta_id: maquina.id,
        p_banco_id: banco.id,
        p_fecha: b.fecha,
        p_neto: m.valor,
        p_pagos: pagos.map((p) => ({
          origen: p.origen,
          origen_id: p.origenId,
        })),
        p_referencia: b.referencia.trim() || null,
      },
    },
  };
}
