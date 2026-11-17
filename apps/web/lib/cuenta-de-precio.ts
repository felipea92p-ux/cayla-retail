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

/* ───────────────────────── El costo dudoso (ADR-0668, A4) ───────────────────────── */
//
// Decisión 9 de Felipe (2026-11-15): «un costo raro no sugiere precio ni deja guardar hasta que la persona confirma «Sí, pagué S/ X»».
// La REGLA vive en la base (`retail.fn_motivo_de_costo`, 20261115204000) y es la que frena el cierre; esta es su espejo, para avisar
// ANTES de guardar con los mismos números (`fn_precio_referencia`). `lib/cuenta-de-precio.test.ts` y
// `scripts/pruebas/costo_dudoso.mjs` corren los mismos casos (`scripts/pruebas/costo-dudoso-casos.json`) contra las dos.
// No incluye «sin costo» ni «mayor que el precio»: el primero lo dice el campo, y el segundo es un aviso rojo que no apaga el sugerido.

export type MotivoDeCosto = "sube" | "baja" | "sin_igv" | "fuera_de_banda";

/** Lo que suele costar una prenda de su categoría (o de su familia, si la categoría tiene pocos modelos). */
export type BandaDeCosto = { lo: number; hi: number; de: "categoria" | "familia" };

export type ReferenciaDeCosto = {
  /** El costo de hoy de la prenda en la base del papel (con IGV si su última entrada fue con factura), o `null` si es nueva. */
  anterior: number | null;
  /** Lo que la orden dice que cuesta cada prenda, con todo; `null` si llegó sin orden. */
  deLaOrden: number | null;
  banda: BandaDeCosto | null;
};

/** El mismo IGV que la base usa hoy (`fn_tasa_igv`): la lectura de referencia lo trae; sin ella, el de siempre. */
const TASA_IGV = IGV - 1;

/**
 * Por qué este costo pide confirmar, o `null`. En el orden de la base, el primero que salte:
 *   1. «sube» / «baja»: más del doble o menos de dos tercios del anterior (la banda de `fn_costo_fuera_de_banda`).
 *   2. «sin_igv»: es lo de la orden ÷ 1.18, ±2 % (entre los dos montos hay 15 %: nunca toca al correcto).
 *   3. «fuera_de_banda»: fuera de lo que suele costar su categoría, solo si nada de lo anterior saltó.
 */
export function motivoDeCosto(costo: number | null, ref: ReferenciaDeCosto | null, tasaIgv = TASA_IGV): MotivoDeCosto | null {
  if (costo === null || !Number.isFinite(costo) || costo <= 0 || !ref) return null;
  const c = cts(costo);
  if (ref.anterior !== null && ref.anterior > 0) {
    const a = cts(ref.anterior);
    if (c > a * 2) return "sube";
    if (c * 3 < a * 2) return "baja";
  }
  if (ref.deLaOrden !== null && ref.deLaOrden > 0) {
    const o = cts(ref.deLaOrden);
    if (c !== o) {
      const sinIgv = Math.round(o / (1 + tasaIgv));
      if (Math.abs(c - sinIgv) * 50 <= sinIgv) return "sin_igv";
    }
  }
  if (ref.banda && (c < cts(ref.banda.lo) || c > cts(ref.banda.hi))) return "fuera_de_banda";
  return null;
}

/* ───────────────────────── «Pierdes» (ADR-0668, A5) ───────────────────────── */
//
// Felipe (2026-11-15, decisión 7): «Pierdes» —el precio sin IGV no cubre lo que se pagó— al guardar pide confirmar, no prohíbe. La base
// decide con `retail.fn_pierde_con` (20261116040000) y esta es su espejo: la MISMA cuenta que la línea «Te quedan», así que la pantalla
// pide confirmar exactamente cuando dice «Pierdes». Las dos corren `scripts/pruebas/pierde-casos.json`.

/**
 * ¿Este precio deja pérdida con este costo? Lo que queda, redondeado al céntimo como «Te quedan», es negativo. Sin precio o sin costo, no.
 * @public Sin pantalla hasta A5b (la hoja «¿Lo dejas así?» de Recibir); hoy la usa su prueba, cruzada con la base.
 */
export function pierdeConElPrecio(precio: number, costo: number): boolean {
  return (cuentaDelPrecio(costo, precio)?.teQuedan ?? 0) < 0;
}
