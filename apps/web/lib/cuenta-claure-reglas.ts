import { fechaCorta, soles } from "./compras-reglas";
import type { ChipRespuesta } from "./dinero-telar-reglas";

// Finanzas ▸ Cuentas y dinero ▸ CLAURE (ADR-0560, actividad 1): lógica pura, sin servidor ni navegador. La base calcula qué parte de lo que
// se cobró en cuentas de CAYLA es de CLAURE (`fn_claure_cuenta`, 20261029004000); aquí solo se leen sus filas, se suman y se explican.
// El saldo NO se guarda: sale de sumar estas filas y restar los pagos a CLAURE (`fn_claure_pagos`, actividad 2; principio 4).

export type OrigenClaure = "venta" | "devolucion" | "cambio";

export type FilaClaure = {
  /** El día, en hora de Lima (`aaaa-mm-dd`). */
  fecha: string;
  origen: OrigenClaure;
  medio: string;
  cuentaId: string | null;
  cuentaNombre: string | null;
  ubicacionId: string | null;
  /** Cuántos pagos (ventas) o devoluciones se juntaron en la fila. */
  nPagos: number;
  /** Lo cobrado de CLAURE (+), lo devuelto (−) o, en un cambio, su diferencia. */
  monto: number;
  /** El IGV que va incluido en `monto` (nulo en un cambio). */
  igv: number | null;
  /** La comisión estimada del POS; 0 si el medio no lleva; nula si debería llevar y no hay tarifa. */
  comision: number | null;
  /** Falso en un cambio: se lista para revisarlo, pero no entra al saldo. */
  contado: boolean;
};

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numeroONulo = (v: unknown): number | null => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function leerFilaClaure(r: Record<string, unknown>): FilaClaure {
  return {
    fecha: String(r.fecha ?? "").slice(0, 10),
    origen: r.origen === "devolucion" || r.origen === "cambio" ? r.origen : "venta",
    medio: String(r.medio ?? ""),
    cuentaId: r.cuenta_id ? String(r.cuenta_id) : null,
    cuentaNombre: r.cuenta_nombre ? String(r.cuenta_nombre) : null,
    ubicacionId: r.ubicacion_id ? String(r.ubicacion_id) : null,
    nPagos: numero(r.n_pagos),
    monto: numero(r.monto),
    igv: numeroONulo(r.igv),
    comision: numeroONulo(r.comision),
    contado: r.contado === true,
  };
}

/** Un pago a CLAURE: plata que salió de un banco de CAYLA para pagarle a Claudia (`movimientos_dinero.tipo = 'pago_claure'`). */
export type PagoClaure = {
  id: string;
  /** El día del pago (`aaaa-mm-dd`). */
  fecha: string;
  cuentaId: string | null;
  /** El banco de donde salió. */
  cuentaNombre: string | null;
  monto: number;
  /** El n.º de operación, si se anotó. */
  referencia: string | null;
  registradoPor: string | null;
};

export function leerPagoClaure(r: Record<string, unknown>): PagoClaure {
  return {
    id: String(r.id ?? ""),
    fecha: String(r.fecha ?? "").slice(0, 10),
    cuentaId: r.cuenta_id ? String(r.cuenta_id) : null,
    cuentaNombre: r.cuenta_nombre ? String(r.cuenta_nombre) : null,
    monto: numero(r.monto),
    referencia: r.referencia ? String(r.referencia) : null,
    registradoPor: r.registrado_por ? String(r.registrado_por) : null,
  };
}

export type ResumenClaure = {
  /** Lo que las ventas de CLAURE cobraron en cuentas de CAYLA. */
  cobrado: number;
  /** Lo devuelto desde cuentas de CAYLA (positivo). */
  devuelto: number;
  /** La comisión estimada del POS, de los cobros que tienen tarifa. */
  comision: number;
  /** Cuántas filas de tarjeta o QR no tienen tarifa: su comisión no está en `comision`. */
  sinTarifa: number;
  /** Lo que ya se le pagó a CLAURE (pagos vigentes). */
  pagado: number;
  /** Lo que se le debe a CLAURE: cobrado − devuelto − comisión − pagado. Negativo si se le pagó de más: queda a favor de CAYLA. */
  saldo: number;
  /** El IGV que va incluido en lo cobrado menos lo devuelto (la boleta sale con el RUC de CAYLA). */
  igv: number;
  /** Los cambios con prendas de CLAURE: no entran al saldo, se revisan a mano. */
  cambios: { n: number; monto: number };
};

export function resumenClaure(filas: readonly FilaClaure[], pagos: readonly PagoClaure[] = []): ResumenClaure {
  let cobrado = 0;
  let devuelto = 0;
  let comision = 0;
  let sinTarifa = 0;
  let igv = 0;
  let nCambios = 0;
  let montoCambios = 0;
  for (const f of filas) {
    if (!f.contado) {
      nCambios += 1;
      montoCambios += Math.abs(f.monto);
      continue;
    }
    if (f.origen === "devolucion") devuelto += -f.monto;
    else cobrado += f.monto;
    igv += f.igv ?? 0;
    if (f.comision === null) sinTarifa += 1;
    else comision += f.comision;
  }
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);
  return {
    cobrado: redondear(cobrado),
    devuelto: redondear(devuelto),
    comision: redondear(comision),
    sinTarifa,
    pagado: redondear(pagado),
    saldo: redondear(cobrado - devuelto - comision - pagado),
    igv: redondear(igv),
    cambios: { n: nCambios, monto: redondear(montoCambios) },
  };
}

/** Las filas que entran al saldo, de la más nueva a la más vieja. */
export function filasContadas(filas: readonly FilaClaure[]): FilaClaure[] {
  return filas.filter((f) => f.contado);
}

/** Los cambios con prendas de CLAURE que el saldo todavía no cuenta. */
export function cambiosPorRevisar(filas: readonly FilaClaure[]): FilaClaure[] {
  return filas.filter((f) => !f.contado);
}

/** Lo que de esa fila se le debe a CLAURE: lo cobrado (o devuelto, en negativo) menos la comisión estimada. */
export function seLeDebeDeFila(f: FilaClaure): number {
  return redondear(f.monto - (f.comision ?? 0));
}

const TEXTO_MEDIO: Record<string, string> = { yape: "Yape", plin: "Plin", tarjeta: "Tarjeta", transferencia: "Transferencia", qr: "QR" };
export function textoMedioClaure(medio: string): string {
  return TEXTO_MEDIO[medio] ?? medio;
}

const TEXTO_ORIGEN: Record<OrigenClaure, string> = { venta: "Venta", devolucion: "Devolución", cambio: "Cambio" };
export function textoOrigenClaure(origen: OrigenClaure): string {
  return TEXTO_ORIGEN[origen];
}

/** «S/ 118.00» o, si es negativo, «− S/ 118.00». */
export function solesConSigno(n: number): string {
  return n < 0 ? `− ${soles(-n)}` : soles(n);
}

/** La pregunta de la cabecera y su cifra: lo que se le debe a CLAURE o, si se le pagó de más, lo que CLAURE le debe a CAYLA (siempre en positivo). */
export function respuestaClaure(saldo: number): { pregunta: string; valor: number } {
  return saldo < 0 ? { pregunta: "¿Cuánto te debe CLAURE?", valor: -saldo } : { pregunta: "¿Cuánto le debes a CLAURE?", valor: saldo };
}

/** Bajo la pregunta: de dónde sale la cifra y lo que pide atención. */
export function chipsClaure(r: ResumenClaure, hayDatos: boolean): ChipRespuesta[] {
  if (!hayDatos) return [{ texto: "Sin cobros todavía", tono: "pizarra" }];
  const chips: ChipRespuesta[] = [{ texto: `Cobrado ${soles(r.cobrado)}`, tono: "pizarra" }];
  if (r.devuelto > 0) chips.push({ texto: `Devuelto ${soles(r.devuelto)}`, tono: "pizarra" });
  if (r.comision > 0) chips.push({ texto: `Comisión del POS ${soles(r.comision)}`, tono: "pizarra" });
  if (r.pagado > 0) chips.push({ texto: `Ya pagado ${soles(r.pagado)}`, tono: "verde" });
  if (r.saldo < 0) chips.push({ texto: "Se le pagó de más: queda a favor de CAYLA", tono: "ambar" });
  if (r.sinTarifa > 0) chips.push({ texto: `${r.sinTarifa} ${r.sinTarifa === 1 ? "cobro" : "cobros"} sin tarifa`, tono: "ambar" });
  if (r.cambios.n > 0) chips.push({ texto: `${r.cambios.n} ${r.cambios.n === 1 ? "cambio" : "cambios"} por revisar`, tono: "ambar" });
  return chips;
}

/** El monto con que arranca «Pagar a CLAURE»: todo lo que se le debe, en el formato del campo; vacío si no se le debe nada. */
export function montoSugeridoPago(saldo: number): string {
  return saldo > 0 ? saldo.toFixed(2) : "";
}

/** La frase de arriba: desde cuándo se cuenta y qué entra. */
export function fraseClaure(desde: string | null): string {
  const cuando = desde ? `Se cuenta desde el ${fechaCorta(desde)}. ` : "";
  return `${cuando}Entra lo que una venta de CLAURE cobró en una cuenta de CAYLA (tarjeta, QR, Yape, transferencia). El efectivo no entra: lo tiene Claudia.`;
}

/** La nota al pie: cómo se calcula lo que no se ve en la tabla. */
export const NOTA_CLAURE =
  "La comisión del POS es una estimación con la tarifa de la máquina (Configuración ▸ Cuentas y cobros) y la asume CLAURE. El IGV va incluido en lo cobrado: la boleta sale con el RUC de CAYLA. Una prenda de CLAURE devuelta y reembolsada desde una cuenta de CAYLA resta; si se reembolsó en efectivo, no.";

/** Bajo los pagos: dónde se anula uno equivocado. */
export const NOTA_PAGOS_CLAURE = "Un pago equivocado se anula en Dónde está ▸ Movimientos, y el saldo vuelve a subir.";
