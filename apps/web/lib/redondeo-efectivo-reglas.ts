/**
 * Redondeo del efectivo (ADR-0311) — la regla ÚNICA de la caja y su gemela en la base (`retail.fn_redondeo_efectivo`,
 * migración `20261003100000_redondeo_efectivo_regla.sql`). Si las dos dan números distintos, `registrar_venta` rechaza la
 * venta en el mostrador: por eso `scripts/pruebas/redondeo_efectivo.mjs` las compara en los 99 999 montos de S/ 0.01 a
 * S/ 999.99.
 *
 * LA REGLA (Perú). La moneda más chica que circula es S/ 0.10 (el BCRP retiró la de 0.05 el 1-ene-2019), así que lo que se
 * cobra EN EFECTIVO se redondea al múltiplo de S/ 0.10, SIEMPRE hacia abajo (Ley 29571 art. 44: prohibido redondear en
 * perjuicio del consumidor; INDECOPI: 5.99 → 5.90, 2.69 → 2.60). Solo se redondea el efectivo, una sola vez, sobre la
 * parte de la cuenta que se paga en efectivo: la tarjeta, Yape/Plin y la transferencia se cobran exactos, y un precio, un
 * descuento o un IGV nunca se redondean. Tampoco se sube «al más cercano»: 100.19 → 100.10, no 100.20.
 *
 *   100.02 → cobra 100.00 (redondeo 0.02) · 100.12 → 100.10 (0.02) · 100.19 → 100.10 (0.09) · 100.10 → 100.10 (0.00)
 *
 * Va en céntimos enteros, nunca con el resto de una coma flotante (ADR-0302 midió 1 error en ~550 combinaciones con
 * `Math.round(n * 100) / 100`). Es una función pura: no sabe de medios de pago ni de cajas; quien la llama le pasa lo que
 * se debe pagar EN EFECTIVO.
 */

/** La moneda más chica que circula, en soles. */
export const UNIDAD_EFECTIVO = 0.1;

// Todo el cálculo es en céntimos enteros; 10 céntimos = una moneda de S/ 0.10.
const UNIDAD_CENTIMOS = 10;

const aCentimos = (monto: number): number => Math.round(monto * 100);

/** ¿Hay algo que redondear? Un monto que no es un número, es 0 o es negativo no tiene redondeo. */
const sinMonto = (monto: number): boolean => !Number.isFinite(monto) || monto <= 0;

/** Lo que se cobra de menos por redondear: de S/ 0.00 a S/ 0.09. Es lo que CAYLA cede por la ley. */
export function redondeoDelEfectivo(deudaEnEfectivo: number): number {
  if (sinMonto(deudaEnEfectivo)) return 0;
  return (aCentimos(deudaEnEfectivo) % UNIDAD_CENTIMOS) / 100;
}

/** Lo que se cobra en monedas y billetes: la deuda en efectivo, bajada al múltiplo de S/ 0.10. */
export function efectivoACobrar(deudaEnEfectivo: number): number {
  if (sinMonto(deudaEnEfectivo)) return 0;
  const c = aCentimos(deudaEnEfectivo);
  return (c - (c % UNIDAD_CENTIMOS)) / 100;
}
