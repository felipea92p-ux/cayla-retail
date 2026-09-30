// El canje del cumpleaños en Cobrar (ADR-0288 D-5 y «Contrato de la tanda 1c»): una vez por año, en su mes, la socia
// recibe un % (10 por defecto, `configuracion_empresa.club_cumple_pct`) sobre TODA la compra, en cascada sobre lo que ya
// tenía cada prenda (CL-11: una prenda al 20 % queda en 28 %). Lógica pura, sin React ni red: la usan la caja de la
// clienta en Cobrar y el armado de `p_items` para `registrar_venta`.
//
// Vive aparte de `club-cumple-reglas.ts` (la regla para ESCRIBIR el cumpleaños en la hoja, de la tanda 1b): este archivo
// es solo el canje del descuento.
//
// CONTRATO
//   PROMETE: el mismo monto, al céntimo, que calcula `registrar_venta`: `round((precio − descuento_sin_club) × pct / 100, 2)`
//            en `numeric`, donde el medio céntimo sube. Por eso cuenta en enteros (céntimos) y nunca en coma flotante: con
//            `Math.round(x * 100) / 100`, S/ 1.45 al 10 % da 0.14 y la base da 0.15 (lo prueba el `.test.ts` de al lado).
//   ASUME:   montos y % con 2 decimales como mucho (los del catálogo, los descuentos y `club_cumple_pct`). Quien decide
//            si la socia PUEDE canjear es la base (`resumen_clienta_caja.cumple_disponible` al leer, y
//            `registrar_venta` al cobrar: socia, su mes en Lima, sin canje vivo este año). Esto solo evita ofrecer lo que la
//            base rechazaría, y apaga el botón si el mes de Lima cambió con la pantalla abierta.
//   NO HACE: no manda el monto como verdad: la base lo recalcula y rechaza si no coincide (`cumple_descuento_distinto`, con
//            1 céntimo de holgura). Tampoco ofrece el canje sin conexión (D-5): una venta en cola podría llegar cuando otra
//            tienda ya lo usó, y la clienta ya se fue con el precio rebajado.

import { hoyLima } from "./fechas-lima";

/** El % de cumpleaños cuando la base no dice otro: el default de `configuracion_empresa.club_cumple_pct`. */
export const PCT_CUMPLE_POR_DEFECTO = 10;

/* ------------------------------------------------------------------ Aritmética exacta (la de `numeric` en Postgres) */
// En enteros, como `descuentoDeCampana` (lib/vender-reglas.ts): céntimos para los montos y centésimas de punto para el %.
// Los montos de la caja tienen 2 decimales (precio de catálogo y descuentos, `numeric(12,2)`) y el % también
// (`club_cumple_pct numeric(5,2)`): con esas escalas todo es exacto. El producto más grande (S/ 100 000 al 50 %) es
// 10^7 × 5·10^3 = 5·10^10, muy por debajo de 2^53: ningún entero pierde precisión.

/** Soles → céntimos exactos. Con 2 decimales, `x * 100` cae a una millonésima del entero y `Math.round` lo recupera. */
const aCentimos = (soles: number) => Math.round(soles * 100);
/** % → centésimas de punto exactas (12.5 → 1250). */
const aCentesimas = (pct: number) => Math.round(pct * 100);
/** Céntimos → soles. `285 / 100` es el double más cercano a 2.85: el mismo número que un 2.85 escrito a mano, y el JSON
 *  lo manda como «2.85». */
const aSoles = (centimos: number) => centimos / 100;

/** `numerador / denominador` (enteros, denominador > 0) redondeado al entero con el medio lejos del cero: lo que hace
 *  `round()` de Postgres con `numeric` (con `double precision` redondearía al par; la base usa `numeric`). Solo operaciones
 *  enteras exactas (`%`, resta, división exacta). */
function dividirRedondeando(numerador: number, denominador: number): number {
  const n = Math.abs(numerador);
  const doble = 2 * n + denominador;
  const q = (doble - (doble % (2 * denominador))) / (2 * denominador);
  return numerador < 0 ? -q : q;
}

/**
 * La parte del club (cumpleaños) de UNA unidad de una prenda: `round((precio − descuento_sin_club) × pct / 100, 2)`, igual
 * que `registrar_venta`. `descuentoSinClub` es lo que la prenda ya tenía sin el cumpleaños (su campaña o su descuento a
 * mano). Ej.: 79.90 con una campaña de 16.00 → 63.90 × 10 % = 6.39 (el descuento total queda en 22.39: un 28 %).
 */
export function descuentoClubLinea(precioUnitario: number, descuentoSinClub: number, pct: number): number {
  const base = aCentimos(precioUnitario) - aCentimos(descuentoSinClub);
  // base (céntimos) × pct (centésimas de punto) / 100 / 100 → céntimos.
  return aSoles(dividirRedondeando(base * aCentesimas(pct), 10_000));
}

/**
 * Lo que viaja en cada ítem de `p_items` cuando se canjea: `descuento_unitario` sigue siendo el descuento TOTAL por unidad
 * (sin club + club, sumado al céntimo exacto: nunca `a + b` en coma flotante, que puede dar 22.389999…) y
 * `descuento_club_unitario`, la parte del cumpleaños. Sin canje, `descuentoClub` es 0 y el ítem queda como siempre.
 */
export function descuentosParaRegistrar(
  descuentoSinClub: number,
  descuentoClub: number
): { descuento_unitario: number; descuento_club_unitario: number } {
  return {
    descuento_unitario: aSoles(aCentimos(descuentoSinClub) + aCentimos(descuentoClub)),
    descuento_club_unitario: aSoles(aCentimos(descuentoClub)),
  };
}

/* ------------------------------------------------------------------ El ticket con el canje */

/** Lo mínimo de una línea del ticket: su precio, el descuento que ya tiene SIN el cumpleaños y cuántas son. */
export type LineaParaCumple = { precioUnitario: number; descuentoUnitario: number; cantidad: number };

export type LineaConCumple<L extends LineaParaCumple> = L & {
  /** La parte del cumpleaños por unidad (0 sin canje). */
  descuentoClubUnitario: number;
  /** Lo que se cobra por unidad: precio − descuento sin club − club. */
  precioFinalUnitario: number;
};

export type TicketConCumple<L extends LineaParaCumple> = {
  lineas: LineaConCumple<L>[];
  /** El total SIN el cumpleaños (lo que se cobraría sin canjear). */
  totalSinCumple: number;
  /** Cuánto regala el club en esta compra: Σ parte del club × cantidad (es el `monto` de `club_canjes`). */
  totalCumple: number;
  /** El total a cobrar: `registrar_venta` exige que los pagos sumen esto. */
  total: number;
};

/**
 * Cómo quedan las líneas y el total con el canje (CL-11: en cascada, a TODA la compra, prenda sin registrar incluida).
 * `pct` null = sin canje: todo queda igual, con la parte del club en 0. Las sumas van en céntimos exactos.
 */
export function ticketConCumple<L extends LineaParaCumple>(lineas: readonly L[], pct: number | null): TicketConCumple<L> {
  let sinCumple = 0;
  let cumple = 0;
  const conCumple = lineas.map((l) => {
    const club = pct === null ? 0 : descuentoClubLinea(l.precioUnitario, l.descuentoUnitario, pct);
    const cobradoSinClub = aCentimos(l.precioUnitario) - aCentimos(l.descuentoUnitario);
    const cantidad = Math.trunc(l.cantidad);
    sinCumple += cobradoSinClub * cantidad;
    cumple += aCentimos(club) * cantidad;
    return { ...l, descuentoClubUnitario: club, precioFinalUnitario: aSoles(cobradoSinClub - aCentimos(club)) };
  });
  return { lineas: conCumple, totalSinCumple: aSoles(sinCumple), totalCumple: aSoles(cumple), total: aSoles(sinCumple - cumple) };
}

/* ------------------------------------------------------------------ ¿Se ofrece? (el mes de Lima y lo que dijo la base) */

/** El mes (1–12) de hoy en Lima: el mismo corte que `fn_hoy_lima()` (de 7 pm a medianoche de Lima, el servidor ya vive en
 *  «mañana»). */
export const mesLima = (ahora: Date = new Date()) => Number(hoyLima(ahora).slice(5, 7));
/** El año de hoy en Lima: el `anio` del canje (un canje por año calendario de Lima). */
export const anioLima = (ahora: Date = new Date()) => Number(hoyLima(ahora).slice(0, 4));

/** Lo que `resumen_clienta_caja` dice del cumpleaños (los campos de la tanda 1c, ya en camelCase). */
export type ResumenCumple = {
  esSocia: boolean;
  cumpleMes: number | null;
  cumpleDisponible: boolean;
  cumplePct: number | null;
  cumpleCanjeadoEsteAnio: boolean;
};

export type CumpleEnCaja =
  /** No es socia, no dio su mes, o no es su mes: la caja no dice nada del cumpleaños. */
  | { tipo: "nada" }
  /** Es su mes y no lo usó este año: el botón «Canjear 10 %». */
  | { tipo: "disponible"; pct: number }
  /** Es su mes y no lo usó, pero no hay conexión: el canje no se ofrece (D-5). */
  | { tipo: "sin_conexion"; pct: number }
  /** Ya lo usó este año: «Cumpleaños ya canjeado». */
  | { tipo: "canjeado" };

/**
 * Qué muestra la caja de la clienta sobre su cumpleaños. Manda lo que leyó la base (`cumpleDisponible`,
 * `cumpleCanjeadoEsteAnio`); el mes de Lima de AHORA solo puede apagarlo: si la pantalla quedó abierta de un mes al otro,
 * la lectura vieja no ofrece un canje que la base rechazaría (`cumple_fuera_de_mes`).
 */
export function cumpleEnCaja(r: ResumenCumple | null | undefined, enLinea: boolean, ahora: Date = new Date()): CumpleEnCaja {
  if (!r || !r.esSocia) return { tipo: "nada" };
  if (r.cumpleCanjeadoEsteAnio) return { tipo: "canjeado" };
  if (!r.cumpleDisponible || r.cumpleMes !== mesLima(ahora)) return { tipo: "nada" };
  const pct = r.cumplePct !== null && Number.isFinite(r.cumplePct) && r.cumplePct > 0 ? r.cumplePct : PCT_CUMPLE_POR_DEFECTO;
  return enLinea ? { tipo: "disponible", pct } : { tipo: "sin_conexion", pct };
}

/** El % que se aplica al ticket: el del canje si la asesora tocó «Canjear» y sigue disponible; null si no. Quitar a la
 *  clienta del ticket, perder la conexión o que cambie el mes lo apagan solos. */
export function pctDelCanje(aplicado: boolean, estado: CumpleEnCaja): number | null {
  return aplicado && estado.tipo === "disponible" ? estado.pct : null;
}

/* ------------------------------------------------------------------ Los textos */

/** Un % como se lee: 10 → «10», 12.5 → «12.5» (sin ceros de más). */
export const pctLegible = (pct: number) => String(Number(pct.toFixed(2)));

/** El botón de la caja de la clienta: «Canjear 10 %». */
export const textoBotonCumple = (pct: number) => `Canjear ${pctLegible(pct)} %`;

/** Lo que dice cada prenda con el canje: «−10 % cumpleaños» (con el signo menos tipográfico). */
export const textoLineaCumple = (pct: number) => `−${pctLegible(pct)} % cumpleaños`;

/** Cuando ya lo usó este año. */
export const TEXTO_CUMPLE_CANJEADO = "Cumpleaños ya canjeado";
