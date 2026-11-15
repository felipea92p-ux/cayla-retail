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

/**
 * ¿Este precio, ya rebajado `REBAJA_FUERTE_PCT` %, deja al menos `dejando` milésimas? Sin redondear, en enteros:
 * (pd ÷ 1.18 − costo) ÷ (pd ÷ 1.18) ≥ dejando ÷ 1000. Con el margen redondeado a una décima, un precio que deja 19.95 % pasaba por 20 %.
 * La ayuda de Compras (sin pantalla todavía) sigue con su versión redondeada hasta que se unifique (ADR-0668, A15).
 */
function aguantaExactoCts(precioCts: number, costoCts: number, dejando: number): boolean {
  const pd = conRebajaCts(precioCts, REBAJA_FUERTE_PCT);
  if (pd <= 0) return false;
  return 1000 * (100 * pd - 118 * costoCts) >= 100 * dejando * pd;
}

/* ───────────────────────── La cuenta única de una prenda (ADR-0668, A2) ───────────────────────── */
//
// TODAS LAS PRENDAS IGUAL (Felipe 2026-11-15): vengan con factura o sin ella, el costo es lo del papel y a la venta se le quita la parte
// de SUNAT. Lo que se recupere con facturas se ve aparte, a fin de mes, en Compras: nunca infla lo que dice una prenda. Por eso la cifra
// es el piso real de lo que queda.

/** El tope del precio (y del costo) en la base: `variantes_precio_con_tope`. */
const TOPE_CTS = 500_000;

export type CuentaDelPrecio = {
  /** La parte de SUNAT dentro del precio. */
  sunat: number;
  /** Lo que queda por prenda: precio ÷ 1.18 − lo que se pagó. Negativo = se pierde. */
  teQuedan: number;
  /** Qué parte de lo tuyo (el precio sin IGV) es `teQuedan`, en milésimas. */
  margenPorMil: number;
};

/** La cuenta de una prenda con lo que se pagó (con IGV, el total del papel) y su precio de etiqueta. `null` si falta uno o no es positivo. */
export function cuentaDelPrecio(costo: number, precio: number): CuentaDelPrecio | null {
  if (!Number.isFinite(costo) || !Number.isFinite(precio) || costo <= 0 || precio <= 0) return null;
  const pCts = cts(precio);
  const cCts = cts(costo);
  const sinIgv = pCts / IGV;
  return {
    sunat: Math.round(pCts - sinIgv) / 100,
    teQuedan: Math.round(sinIgv - cCts) / 100,
    margenPorMil: margenPorMilCts(pCts, cCts) ?? 0,
  };
}

/**
 * «No bajes de»: el menor precio terminado en .90 que, rebajado 35 %, todavía deja 20 % de lo tuyo (≈ lo que pagaste × 2.27). Es un
 * margen sobre el precio rebajado sin IGV, no un recargo de 20 % sobre el costo (eso daría ×2.18). `null` si no hay costo o ningún precio
 * hasta el tope lo logra.
 */
export function pisoDelPrecio(costo: number): number | null {
  if (!Number.isFinite(costo) || costo <= 0) return null;
  const cCts = cts(costo);
  // El piso está cerca de 2.27 × costo: se arranca desde el doble y se sube de a S/ 1 por los .90.
  for (let n = Math.floor((cCts * 2) / 100); n * 100 + 90 <= TOPE_CTS; n++) {
    const p = n * 100 + 90;
    if (aguantaExactoCts(p, cCts, GANANCIA_TRAS_REBAJA_POR_MIL)) return p / 100;
  }
  return null;
}
