// Emparejar lo que llegó al banco con lo que cobraron las máquinas (ADR-0629, Fase B). Lógica pura: recibe las líneas del extracto
// (`lib/extracto-interbank.ts`) y lo pendiente de cada máquina (`fn_pos_pendientes`), y propone qué depósito registrar. No guarda:
// la persona confirma cada propuesta y el guardado es el de siempre (`registrar_abono_pos`).
//
// Vendemás deposita UN lote por día hábil, solo neto, con las dos tiendas juntas (ADR-0552): el lote del día D cubre lo cobrado desde
// el día del lote anterior hasta D−1. El sábado y el domingo caen juntos en el lote del lunes. Un feriado sin lote alarga el siguiente:
// por eso, si el extracto trae el lote anterior, la ventana empieza en su día.

import { revisarComision, type LotePendiente } from "./cuentas-dinero-reglas";
import { fechaCorta } from "./gastos-reglas";
import type { LineaExtracto } from "./extracto-interbank";

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
