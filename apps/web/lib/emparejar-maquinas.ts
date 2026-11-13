// Emparejar lo que llegó al banco con lo que cobraron las máquinas (ADR-0629, Fase B). Lógica pura: recibe las líneas del extracto
// (`lib/extracto-interbank.ts`) y lo pendiente de cada máquina (`fn_pos_pendientes`), y propone qué depósito registrar. No guarda:
// la persona confirma cada propuesta y el guardado es el de siempre (`registrar_abono_pos`).
//
// Vendemás deposita UN lote por día hábil, solo neto, con las dos tiendas juntas (ADR-0552): el lote del día D cubre lo cobrado desde
// el día del lote anterior hasta D−1. El sábado y el domingo caen juntos en el lote del lunes. Un feriado sin lote alarga el siguiente:
// por eso, si el extracto trae el lote anterior, la ventana empieza en su día.

import { revisarComision, type LotePendiente } from "./cuentas-dinero-reglas";
import { fechaCorta } from "./gastos-reglas";
import { solesDeCentimos, type LineaExtracto } from "./extracto-interbank";

export type EstadoPropuesta = "cuadra" | "revisar" | "sin_ventas" | "ya_registrado";

/** Un depósito de máquina que ya está en el ERP, como lo leyó la pantalla: el día y lo que llegó al banco. */
export type DepositoRegistrado = { fecha: string; centimos: number };

export type PropuestaLote = {
  linea: LineaExtracto;
  /** Los días (tienda y medio) que cubre, del más viejo al más nuevo. */
  dias: LotePendiente[];
  /** Lo cobrado esos días y la comisión que quedaría (cobrado − lo que llegó), en céntimos. */
  brutoCentimos: number;
  comisionCentimos: number;
  estado: EstadoPropuesta;
  /** Qué mirar antes de registrarlo; nulo si cuadra. */
  motivo: string | null;
};

const aCentimos = (soles: number) => Math.round(soles * 100);

/** El día anterior (`AAAA-MM-DD`), sin pasar por la zona horaria del aparato. */
function diaAntes(fecha: string, dias = 1): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** El día del lote anterior cuando el extracto no lo trae: el sábado para un lote del lunes; el día anterior para los demás. */
export function loteAnteriorDe(fecha: string): string {
  return diaAntes(fecha, new Date(`${fecha}T12:00:00Z`).getUTCDay() === 1 ? 2 : 1);
}

/**
 * Por cada lote de Vendemás del extracto, del más viejo al más nuevo, los días pendientes que cubre y si la comisión que resulta es la
 * normal. Un día se asigna a un solo lote. La regla de «comisión normal» es la del formulario del depósito (`revisarComision`): la misma
 * en los dos lugares.
 */
export function emparejarVendemas(lineas: readonly LineaExtracto[], pendientes: readonly LotePendiente[], registrados: readonly DepositoRegistrado[] = []): PropuestaLote[] {
  const lotes = lineas.filter((l) => l.tipo === "lote_vendemas" && l.centimos > 0).sort((a, b) => a.orden - b.orden);
  const yaEstan = lineasYaRegistradas(lotes, registrados);
  const usados = new Set<string>();
  return lotes.map((linea, i) => {
    // Antes que nada: si esta línea ya tiene su depósito en el ERP (mismo día y mismo monto), no se propone otra vez.
    if (yaEstan.has(linea.orden)) return { linea, dias: [], brutoCentimos: 0, comisionCentimos: 0, estado: "ya_registrado" as const, motivo: null };
    const desde = i > 0 ? lotes[i - 1].fecha : loteAnteriorDe(linea.fecha);
    const hasta = diaAntes(linea.fecha);
    const dias = pendientes
      .filter((p) => p.bruto > 0 && p.fecha >= desde && p.fecha <= hasta && !usados.has(p.clave))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ubicacionNombre.localeCompare(b.ubicacionNombre, "es"));
    dias.forEach((d) => usados.add(d.clave));
    const brutoCentimos = dias.reduce((s, d) => s + aCentimos(d.bruto), 0);
    const comisionCentimos = brutoCentimos - linea.centimos;
    if (dias.length === 0) {
      return {
        linea,
        dias,
        brutoCentimos,
        comisionCentimos,
        estado: "sin_ventas",
        motivo: `No hay ventas de Vendemás por depositar del ${fechaCorta(desde)} al ${fechaCorta(hasta)}: o este depósito ya está registrado, o esas ventas se anotaron con otra máquina.`,
      };
    }
    if (comisionCentimos < 0) {
      return { linea, dias, brutoCentimos, comisionCentimos, estado: "revisar", motivo: "Llegó más de lo que se cobró esos días: falta anotar una venta, o una venta con tarjeta quedó en otra máquina." };
    }
    const esperado = dias.every((d) => d.esperado !== null) ? dias.reduce((s, d) => s + aCentimos(d.esperado ?? 0), 0) / 100 : null;
    const aviso = revisarComision({ bruto: brutoCentimos / 100, comision: comisionCentimos / 100, esperado });
    return { linea, dias, brutoCentimos, comisionCentimos, estado: aviso ? "revisar" : "cuadra", motivo: aviso };
  });
}

/**
 * Qué líneas del banco ya tienen su depósito registrado: se emparejan por día y monto exactos, cada depósito con UNA línea (dos lotes
 * iguales el mismo día y un solo depósito: la segunda línea sigue por registrar). Es el segundo candado contra registrar dos veces; el
 * primero es que un día ya cubierto no vuelve a «pendiente» (`fn_pos_pendientes`).
 */
export function lineasYaRegistradas(lineas: readonly LineaExtracto[], registrados: readonly DepositoRegistrado[]): Set<number> {
  const quedan = new Map<string, number>();
  for (const r of registrados) quedan.set(`${r.fecha}|${r.centimos}`, (quedan.get(`${r.fecha}|${r.centimos}`) ?? 0) + 1);
  const ya = new Set<number>();
  for (const l of [...lineas].sort((a, b) => a.orden - b.orden)) {
    const k = `${l.fecha}|${l.centimos}`;
    const n = quedan.get(k) ?? 0;
    if (n > 0) {
      ya.add(l.orden);
      quedan.set(k, n - 1);
    }
  }
  return ya;
}

// ---- Izipay, pago por pago (ADR-0629, Fase B, actividad 4) -------------------------------------------------------------------
// El QR de Izipay llega suelto a Interbank, un «Abono QR IBK» por pago, con las tiendas mezcladas y en el orden en que se cobró. Lo que se
// paga con tarjeta (en la máquina o escaneando el QR con la app del banco) llega en un lote por código de comercio («PAGO IZIPAY 0058…»):
// un código es una tienda, y el lote del lunes junta viernes, sábado y domingo (Izipay no abona el fin de semana).

/** Un pago de una máquina como lo devuelve `fn_pos_pagos_por_depositar`, con sus montos en céntimos. */
export type PagoMaquina = {
  origen: "venta_pago" | "separacion_pago" | "cambio";
  origenId: string;
  clave: string;
  fecha: string;
  /** La hora del cobro (ISO): decide el orden cuando dos pagos son del mismo monto. */
  hora: string;
  ubicacionId: string;
  ubicacionNombre: string;
  medio: "qr" | "tarjeta";
  montoCentimos: number;
  /** Lo que llega suelto con la tarifa de su medio (gratis los primeros días del mes); nulo sin tarifa. */
  netoCentimos: number | null;
  /** Lo que llega dentro de un lote de tarjeta (un QR pagado con tarjeta cobra como tarjeta). */
  netoTarjetaCentimos: number | null;
  depositado: boolean;
  /** Su día ya tiene un depósito que no dice qué pagos cubrió: se cuadra con «Cuadrar depósitos». */
  diaSinDetalle: boolean;
};

const centimosONull = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 100));
export function leerPagoMaquina(f: Record<string, unknown>): PagoMaquina {
  return {
    origen: String(f.origen) as PagoMaquina["origen"],
    origenId: String(f.origen_id),
    clave: String(f.clave),
    fecha: String(f.fecha),
    hora: String(f.hora),
    ubicacionId: String(f.ubicacion_id),
    ubicacionNombre: String(f.ubicacion_nombre ?? ""),
    medio: String(f.medio) as PagoMaquina["medio"],
    montoCentimos: Math.round(Number(f.monto) * 100),
    netoCentimos: centimosONull(f.neto_esperado),
    netoTarjetaCentimos: centimosONull(f.neto_tarjeta),
    depositado: f.depositado === true,
    diaSinDetalle: f.dia_sin_detalle === true,
  };
}

/** Un depósito que se propone: lo que llegó (líneas del banco) y los pagos que lo explican. */
export type PropuestaIzipay = {
  clave: string;
  /** El día del banco: es la fecha del depósito. */
  fecha: string;
  tipo: "qr" | "lote";
  lineas: LineaExtracto[];
  pagos: PagoMaquina[];
  netoCentimos: number;
  brutoCentimos: number;
  estado: EstadoPropuesta;
  motivo: string | null;
};

export type CuadreIzipay = {
  propuestas: PropuestaIzipay[];
  /** Llegaron al banco y ninguna venta del ERP las explica: una venta anotada con otro medio («Yape»), o que nadie registró. */
  sinVenta: LineaExtracto[];
  /** QR cobrados en los días del extracto que no llegaron ni sueltos ni en un lote. */
  sinLlegar: PagoMaquina[];
  /** Líneas de días que ya tienen su depósito registrado: no se proponen otra vez. */
  yaRegistradas: LineaExtracto[];
};

/** El día del lote anterior de Izipay cuando el extracto no lo trae: el viernes para un lote del lunes; el día anterior para los demás. */
export function loteAnteriorIzipay(fecha: string): string {
  return diaAntes(fecha, new Date(`${fecha}T12:00:00Z`).getUTCDay() === 1 ? 3 : 1);
}

const suma = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
const porHora = (a: PagoMaquina, b: PagoMaquina) => a.hora.localeCompare(b.hora) || a.origenId.localeCompare(b.origenId);

/**
 * Empareja el extracto con los pagos de Izipay. Los QR sueltos primero, por día y monto exactos, en el orden en que se cobraron (dos del
 * mismo monto se emparejan en orden de hora; uno cobrado a medianoche puede llegar al día siguiente). Después, cada lote de tarjeta con
 * lo que queda de UNA tienda en su ventana: la tarjeta sola o con los QR que no llegaron sueltos (un QR pagado con tarjeta), al céntimo.
 * Un lote que no calza no se propone: dice qué revisar.
 */
export function emparejarIzipay(lineas: readonly LineaExtracto[], pagos: readonly PagoMaquina[]): CuadreIzipay {
  const libres = pagos.filter((p) => !p.depositado && !p.diaSinDetalle).sort(porHora);
  const usados = new Set<string>();
  const id = (p: PagoMaquina) => `${p.origen}:${p.origenId}`;
  const propuestas: PropuestaIzipay[] = [];
  const sinVenta: LineaExtracto[] = [];
  const yaRegistradas: LineaExtracto[] = [];

  // 1. Los QR sueltos, por día del banco.
  const qr = lineas.filter((l) => l.tipo === "qr_izipay" && l.centimos > 0).sort((a, b) => a.orden - b.orden);
  const porDia = new Map<string, LineaExtracto[]>();
  for (const l of qr) porDia.set(l.fecha, [...(porDia.get(l.fecha) ?? []), l]);
  for (const [fecha, delDia] of porDia) {
    const llegaron: LineaExtracto[] = [];
    const explican: PagoMaquina[] = [];
    for (const l of delDia) {
      const buscar = (dia: string) => libres.find((p) => p.medio === "qr" && p.fecha === dia && !usados.has(id(p)) && p.netoCentimos === l.centimos);
      const p = buscar(fecha) ?? buscar(diaAntes(fecha));
      if (p) {
        usados.add(id(p));
        llegaron.push(l);
        explican.push(p);
        continue;
      }
      // Sin venta libre que la explique: o su día ya está depositado (no se vuelve a ofrecer), o llegó sin venta.
      const cubierta = pagos.some((x) => x.medio === "qr" && (x.depositado || x.diaSinDetalle) && (x.fecha === fecha || x.fecha === diaAntes(fecha)) && x.netoCentimos === l.centimos);
      (cubierta ? yaRegistradas : sinVenta).push(l);
    }
    if (explican.length > 0) {
      const neto = suma(llegaron.map((l) => l.centimos));
      const bruto = suma(explican.map((p) => p.montoCentimos));
      propuestas.push({ clave: `qr:${fecha}`, fecha, tipo: "qr", lineas: llegaron, pagos: explican, netoCentimos: neto, brutoCentimos: bruto, estado: "cuadra", motivo: null });
    }
  }

  // 2. Los lotes de tarjeta, cada uno con UNA tienda. Un código que ya calzó con una tienda en este extracto la sigue usando.
  const lotes = lineas.filter((l) => l.tipo === "lote_izipay" && l.centimos > 0).sort((a, b) => a.orden - b.orden);
  const tiendaDe = new Map<string, string>();
  const anterior = new Map<string, string>();
  for (const l of lotes) {
    const codigo = l.codigoComercio ?? "";
    const desde = anterior.get(codigo) ?? loteAnteriorIzipay(l.fecha);
    anterior.set(codigo, l.fecha);
    const hasta = diaAntes(l.fecha);
    const enVentana = libres.filter((p) => !usados.has(id(p)) && p.fecha >= desde && p.fecha <= hasta && p.netoTarjetaCentimos !== null);
    const tiendas = [...new Set(enVentana.map((p) => p.ubicacionId))].sort((a, b) => Number(b === tiendaDe.get(codigo)) - Number(a === tiendaDe.get(codigo)));
    let calzo: PagoMaquina[] | null = null;
    for (const t of tiendas) {
      const deLaTienda = enVentana.filter((p) => p.ubicacionId === t);
      const soloTarjeta = deLaTienda.filter((p) => p.medio === "tarjeta");
      for (const grupo of [soloTarjeta, deLaTienda]) {
        if (grupo.length > 0 && suma(grupo.map((p) => p.netoTarjetaCentimos ?? 0)) === l.centimos) {
          calzo = grupo;
          break;
        }
      }
      if (calzo) break;
    }
    if (calzo) {
      calzo.forEach((p) => usados.add(id(p)));
      tiendaDe.set(codigo, calzo[0].ubicacionId);
      propuestas.push({
        clave: `lote:${l.orden}`,
        fecha: l.fecha,
        tipo: "lote",
        lineas: [l],
        pagos: calzo,
        netoCentimos: l.centimos,
        brutoCentimos: suma(calzo.map((p) => p.montoCentimos)),
        estado: "cuadra",
        motivo: null,
      });
      continue;
    }
    const cubierto = pagos.some((p) => (p.depositado || p.diaSinDetalle) && p.fecha >= desde && p.fecha <= hasta);
    propuestas.push({
      clave: `lote:${l.orden}`,
      fecha: l.fecha,
      tipo: "lote",
      lineas: [l],
      pagos: [],
      netoCentimos: l.centimos,
      brutoCentimos: 0,
      estado: cubierto ? "ya_registrado" : "sin_ventas",
      motivo: cubierto
        ? null
        : `Ninguna tienda suma ${solesDeCentimos(l.centimos)} con lo cobrado con tarjeta del ${fechaCorta(desde)} al ${fechaCorta(hasta)}: falta anotar una venta, o una tarjeta quedó en otra máquina.`,
    });
  }

  // 3. Lo que se cobró con QR en los días del extracto y no llegó por ningún lado.
  const desde = lineas.length ? lineas.reduce((m, l) => (l.fecha < m ? l.fecha : m), lineas[0].fecha) : "";
  const hasta = lineas.length ? lineas.reduce((m, l) => (l.fecha > m ? l.fecha : m), lineas[0].fecha) : "";
  const sinLlegar = libres.filter((p) => p.medio === "qr" && !usados.has(id(p)) && p.fecha >= desde && p.fecha <= hasta);

  propuestas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo));
  const porOrden = (a: LineaExtracto, b: LineaExtracto) => a.orden - b.orden;
  return { propuestas, sinVenta: sinVenta.sort(porOrden), sinLlegar, yaRegistradas: yaRegistradas.sort(porOrden) };
}
