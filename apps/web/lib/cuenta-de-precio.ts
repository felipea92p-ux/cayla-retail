// La cuenta del precio (ADR-0668, Felipe 2026-11-15): un solo lugar para el IGV, la rebaja y el piso, en céntimos enteros. Todo lo que diga
// «te quedan», «no bajes de» o «aguanta la rebaja» en el ERP sale de aquí, para que la misma prenda diga lo mismo en cada pantalla.
//
// CONTRATO
//   PROMETE: cuentas exactas en céntimos enteros (sin el 48,99999… del punto flotante); el precio rebajado se redondea hacia abajo al
//            S/ 0.10, como en caja (ADR-0403).
//   ASUME:   montos en soles, con IGV, tal como se escriben (el precio de etiqueta y el costo del papel).
//   NO HACE: no lee la base ni decide qué se guarda; no sabe de facturas.

/** La tasa del IGV: de cada S/ 118 que paga el cliente, S/ 18 son de SUNAT. */
export const IGV = 1.18;

/** La rebaja fuerte con la que se prueba el piso: el tope de un líder a mano en caja (ADR-0054). */
export const REBAJA_FUERTE_PCT = 35;

/** Lo que debe quedar del precio ya rebajado (sin IGV), en milésimas (20 %). */
export const GANANCIA_TRAS_REBAJA_POR_MIL = 200;

/** Soles a céntimos enteros. */
export const cts = (n: number): number => Math.round(n * 100);

/** El precio rebajado `pct` %, hacia abajo al S/ 0.10 (ADR-0403), en céntimos. */
export function conRebajaCts(precioCts: number, pct: number): number {
  return Math.floor((precioCts * (100 - pct)) / 1000) * 10;
}

/** Lo que queda sobre el precio sin IGV, en milésimas redondeadas a un decimal de %. `null` si el precio no es positivo. */
export function margenPorMilCts(precioCts: number, costoCts: number): number | null {
  if (precioCts <= 0) return null;
  const ps = precioCts / IGV;
  return Math.round(((ps - costoCts) / ps) * 1000);
}

/** ¿Este precio, ya rebajado `REBAJA_FUERTE_PCT` %, deja al menos `dejando` milésimas? */
export function aguantaCts(precioCts: number, costoCts: number, dejando: number): boolean {
  const pd = conRebajaCts(precioCts, REBAJA_FUERTE_PCT);
  if (pd <= 0) return false;
  const m = margenPorMilCts(pd, costoCts);
  return m !== null && m >= dejando;
}
