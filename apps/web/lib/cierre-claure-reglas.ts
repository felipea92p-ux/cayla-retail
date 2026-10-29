import { fechaCorta, soles } from "./compras-reglas";
import { textoMedioClaure } from "./cuenta-claure-reglas";

// El cierre de caja de Lima y CLAURE (ADR-0560, actividad 3): lógica pura, sin servidor ni navegador. La base calcula todo lo que el cierre muestra
// (`fn_claure_cierre`, 20261029013000: el saldo con Claudia al terminar el día de la caja, lo del día por medio y el efectivo de las ventas partido
// entre CAYLA y CLAURE); aquí solo se lee ese jsonb, se dice en palabras de tienda y se arma el mensaje para pasárselo a Claudia.
// Nada de esto bloquea ni cambia el cierre: si no se puede leer, el cierre sigue como siempre (principio 9).

export type CierreClaure = {
  sede: string;
  /** El día del cierre (`aaaa-mm-dd`, hora de Lima). */
  fecha: string;
  /** Solo el líder registra el pago (sale de un banco). */
  puedePagar: boolean;
  /** Lo que se le debe a Claudia al terminar ese día; negativo si se le pagó de más. */
  saldo: number;
  /** Lo que se le debía al empezar ese día. */
  saldoAnterior: number;
  /** `gastos`: la parte de CLAURE de los gastos que pagó CAYLA ese día (alquiler, limpieza…): también baja lo que se le debe. `efectivoClaudia`: el efectivo de CAYLA que se quedó con ella al cerrar la caja ese día. */
  hoy: { cobrado: number; devuelto: number; igv: number; comision: number; pagado: number; efectivoClaudia: number; gastos: number };
  porMedio: { medio: string; monto: number; comision: number }[];
  /** El efectivo de las ventas de esa caja: lo de CAYLA y lo de CLAURE suman lo que espera la caja. */
  efectivo: { total: number; cayla: number; claure: number };
  cambiosPorRevisar: number;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Lee lo que devuelve la base. `null` si CLAURE no opera en la sede de esa caja (o si lo recibido no es un cierre): entonces el cierre no dice nada. */
export function leerCierreClaure(crudo: unknown): CierreClaure | null {
  const j = objeto(crudo);
  if (j.hay_claure !== true) return null;
  const hoy = objeto(j.hoy);
  const efectivo = objeto(j.efectivo);
  return {
    sede: String(j.sede ?? ""),
    fecha: String(j.fecha ?? "").slice(0, 10),
    puedePagar: j.puede_pagar === true,
    saldo: num(j.saldo),
    saldoAnterior: num(j.saldo_anterior),
    hoy: { cobrado: num(hoy.cobrado), devuelto: num(hoy.devuelto), igv: num(hoy.igv), comision: num(hoy.comision), pagado: num(hoy.pagado), efectivoClaudia: num(hoy.efectivo_claudia), gastos: num(hoy.gastos) },
    porMedio: (Array.isArray(j.por_medio) ? (j.por_medio as unknown[]) : []).map((m) => {
      const o = objeto(m);
      return { medio: String(o.medio ?? ""), monto: num(o.monto), comision: num(o.comision) };
    }),
    efectivo: { total: num(efectivo.total), cayla: num(efectivo.cayla), claure: num(efectivo.claure) },
    cambiosPorRevisar: num(j.cambios_por_revisar),
  };
}

/** La frase grande del bloque: lo que se le debe a Claudia o, si se le pagó de más, lo que ella le debe a CAYLA (siempre en positivo). */
export function titularDelCierre(c: CierreClaure): { frase: string; monto: number } {
  return c.saldo < 0 ? { frase: "Claudia te debe", monto: -c.saldo } : { frase: "Se le debe a Claudia", monto: c.saldo };
}

/** La línea de «hoy»: «Hoy se sumó S/ 164.60: Tarjeta S/ 50.00 · Yape S/ 118.00, menos S/ 3.31 de comisión». */
export function lineaDeHoy(c: CierreClaure): string {
  if (c.hoy.cobrado <= 0 && c.hoy.devuelto <= 0 && c.hoy.gastos <= 0 && c.hoy.efectivoClaudia <= 0) return "Hoy no se cobró nada de CLAURE en tus cuentas.";
  const medios = c.porMedio.filter((m) => m.monto > 0).map((m) => `${textoMedioClaure(m.medio)} ${soles(m.monto)}`);
  const partes = [`Hoy se cobró ${soles(c.hoy.cobrado)} de CLAURE en tus cuentas${medios.length ? ` (${medios.join(" · ")})` : ""}`];
  if (c.hoy.devuelto > 0) partes.push(`se devolvió ${soles(c.hoy.devuelto)}`);
  if (c.hoy.igv > 0) partes.push(`${soles(c.hoy.igv)} es IGV, que paga CAYLA`);
  if (c.hoy.comision > 0) partes.push(`la comisión del POS es ${soles(c.hoy.comision)}`);
  if (c.hoy.efectivoClaudia > 0) partes.push(`se restan ${soles(c.hoy.efectivoClaudia)} de efectivo de CAYLA que se quedó con ella`);
  if (c.hoy.gastos > 0) partes.push(`se restan ${soles(c.hoy.gastos)} de gastos suyos que pagó CAYLA`);
  return `${partes.join(", ")}.`;
}

/** El efectivo de Claudia, partido del de CAYLA: lo dice el bloque y, en el paso de contar, bajo «Ventas en efectivo». */
export function lineaDelEfectivo(c: CierreClaure): string {
  return `Del efectivo de hoy, ${soles(c.efectivo.claure)} es de CLAURE (lo tiene Claudia, no suma a lo que se le debe) y ${soles(c.efectivo.cayla)} es de CAYLA.`;
}

/** El resumen para pasárselo a Claudia por WhatsApp. Texto plano; el sistema no lo envía solo. */
export function mensajeParaClaudia(c: CierreClaure): string {
  const lineas: string[] = [`Hola Claudia, el resumen del cierre de caja de ${c.sede} (${fechaCorta(c.fecha)}):`, ""];
  const medios = c.porMedio.filter((m) => m.monto > 0).map((m) => `${textoMedioClaure(m.medio)} ${soles(m.monto)}`);
  lineas.push(`• Cobrado de CLAURE en cuentas de CAYLA: ${soles(c.hoy.cobrado)}${medios.length ? ` (${medios.join(", ")})` : ""}`);
  if (c.hoy.devuelto > 0) lineas.push(`• Devuelto: ${soles(c.hoy.devuelto)}`);
  if (c.hoy.igv > 0) lineas.push(`• IGV de esas ventas (lo declara y paga CAYLA, se descuenta): ${soles(c.hoy.igv)}`);
  if (c.hoy.comision > 0) lineas.push(`• Comisión del POS: ${soles(c.hoy.comision)}`);
  if (c.hoy.pagado > 0) lineas.push(`• Ya se te pagó hoy: ${soles(c.hoy.pagado)}`);
  if (c.hoy.efectivoClaudia > 0) lineas.push(`• Efectivo de CAYLA que te quedaste hoy (se resta): ${soles(c.hoy.efectivoClaudia)}`);
  if (c.hoy.gastos > 0) lineas.push(`• Gastos tuyos que pagó CAYLA hoy (se restan): ${soles(c.hoy.gastos)}`);
  if (c.efectivo.claure > 0) lineas.push(`• Efectivo de CLAURE de hoy (lo tienes tú): ${soles(c.efectivo.claure)}`);
  lineas.push("");
  const t = titularDelCierre(c);
  lineas.push(c.saldo < 0 ? `Saldo: se te pagó de más, ${soles(t.monto)} quedan a favor de CAYLA.` : `Saldo que te debemos: ${soles(t.monto)}`);
  return lineas.join("\n");
}

/**
 * Al elegir «Se queda con Claudia» en el paso de trasladar: cuánto se le debía y cuánto quedará. Solo informa; el efectivo que se queda con ella sale del cajón
 * y baja lo que se le debe (`fn_claure_cierre`, 20261029144000). `null` si no hay monto.
 */
export function vistaPreviaSeQueda(c: CierreClaure, monto: number): { antes: number; despues: number; frase: string } | null {
  if (!(monto > 0)) return null;
  const antes = Math.round(c.saldo * 100) / 100;
  const despues = Math.round((c.saldo - monto) * 100) / 100;
  const frase =
    despues < 0
      ? `Se le debían ${soles(antes)}; con esto Claudia le debería ${soles(-despues)} a CAYLA.`
      : `Se le debían ${soles(antes)}; con esto quedan ${soles(despues)}.`;
  return { antes, despues, frase };
}
