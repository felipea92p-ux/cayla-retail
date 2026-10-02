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

/** Soles como los dice la caja (`money` de `PuntoDeVenta`): «S/46.12». Aquí también, para que el texto salga armado de la
 *  regla y no del JSX. */
const soles = (n: number) => `S/${n.toFixed(2)}`;

/** Los meses como los abrevia el spike del club (`MESES`, y `OPCIONES_MES_CUMPLE` de `club-cumple-reglas.ts`). */
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** «12 sep» de una fecha `aaaa-mm-dd` (el día del canje, ya en Lima: `resumen_clienta_caja.cumple_canjeado_el`). null si no
 *  llega una fecha. */
export function diaYMesCorto(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${Number(m[3])} ${MESES_CORTOS[mes - 1]}`;
}

/** Hasta cuándo vale el canje: el último día del mes de hoy en Lima, «30 sep» (febrero bisiesto incluido). */
export function finDelMesLima(ahora: Date = new Date()): string {
  const [anio, mes] = hoyLima(ahora).split("-").map(Number) as [number, number];
  // El día 0 del mes siguiente es el último de este (en UTC, sin zonas de por medio).
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${ultimo} ${MESES_CORTOS[mes - 1]}`;
}

/* ------------------------------------------------------------------ La fila del cumpleaños en la caja de la clienta */
// Dibujada como el spike del club (`partesClub` de `45-club-caja.js`, commit 94f2dece): desplegada, UNA fila con su botón;
// plegada, una píldora con la acción. El componente (`ClientaDelTicket`) solo pinta lo que esto decide.

export type AccionCumple = "canjear" | "quitar";

export type FilaCumple =
  | {
      /** Es su mes y no lo usó: «Cumple este mes · 10 % disponible» con «Canjear 10 %», «Quitar» o «Sin conexión». */
      tipo: "canje";
      /** En negrita. */
      destacado: string;
      /** Después del punto medio. */
      resto: string;
      /** La segunda línea, más chica. */
      bajada: string;
      /** El botón de la fila. `accion` null = apagado (sin conexión). `primario`: el oscuro; si no, el de borde. */
      boton: { texto: string; primario: boolean; accion: AccionCumple | null };
      /** Con lo del club plegado, la misma acción como píldora (spike: «Canjear 10 %», «Quitar 10 %», «Sin conexión»). */
      pildora: { texto: string; accion: AccionCumple | null };
      /** Lo que dice al pasar el mouse (el `title`). */
      ayuda: string;
    }
  | {
      /** Ya lo usó este año: el candado, «Cumpleaños canjeado el 12 sep · Una vez al año». Sin acción. */
      tipo: "canjeado";
      destacado: string;
      resto: string;
      bajada: string;
      ayuda: string;
    };

/**
 * Qué muestra la fila del cumpleaños. null = nada del canje: la caja sigue con lo de la tanda 1b («Cumple el 18 de
 * setiembre» o «Sin cumpleaños»). `aplicado`: la asesora tocó «Canjear» en esta venta (y sigue disponible). `canjeadoEl`: el
 * día del canje (`cumple_canjeado_el`); sin él la fila dice «este año». `valeAplicado` (tanda 1g, G-13): el vale de
 * aniversario ya está en esta compra, y va una sola ventaja del club por compra: el botón se apaga y dice por qué.
 */
export function filaDelCumple(
  estado: CumpleEnCaja,
  aplicado: boolean,
  canjeadoEl: string | null,
  ahora: Date = new Date(),
  valeAplicado = false
): FilaCumple | null {
  if (estado.tipo === "canjeado") {
    const dia = diaYMesCorto(canjeadoEl);
    return {
      tipo: "canjeado",
      destacado: "Cumpleaños canjeado",
      resto: dia ? `el ${dia}` : "este año",
      bajada: "Una vez al año",
      ayuda: "Un solo canje por año. Devolver la compra no lo libera; anularla sí.",
    };
  }
  if (estado.tipo === "nada") return null;
  const pct = pctLegible(estado.pct);
  const ayuda = "Vale en toda la compra, una vez al año. Sin conexión se apaga: otra tienda podría canjearlo a la vez.";
  const base = { tipo: "canje" as const, destacado: "Cumple este mes", resto: `${pct} % disponible`, ayuda };
  if (estado.tipo === "sin_conexion") {
    return {
      ...base,
      bajada: "Sin conexión el botón se apaga",
      boton: { texto: "Sin conexión", primario: false, accion: null },
      pildora: { texto: "Sin conexión", accion: null },
    };
  }
  if (valeAplicado && !aplicado) {
    return {
      ...base,
      bajada: "Ya usa su vale de aniversario: una sola ventaja del club por compra",
      boton: { texto: textoBotonCumple(estado.pct), primario: false, accion: null },
      pildora: { texto: textoBotonCumple(estado.pct), accion: null },
    };
  }
  return {
    ...base,
    bajada: `${pct} % de toda la compra, sobre lo ya rebajado · hasta el ${finDelMesLima(ahora)}`,
    boton: aplicado ? { texto: "Quitar", primario: false, accion: "quitar" } : { texto: textoBotonCumple(estado.pct), primario: true, accion: "canjear" },
    pildora: aplicado ? { texto: `Quitar ${pct} %`, accion: "quitar" } : { texto: textoBotonCumple(estado.pct), accion: "canjear" },
  };
}

/** El `title` de «Cumple el 18 de setiembre» fuera de su mes (spike): el % sale de la base, nunca escrito a mano. */
export const ayudaCumpleFueraDeMes = (pct: number | null) => `El ${pctLegible(pct && pct > 0 ? pct : PCT_CUMPLE_POR_DEFECTO)} % se abre solo en su mes.`;

/* ------------------------------------------------------------------ El pie del ticket (spike, README punto 9) */
// El canje es UNA línea en el pie, sobre el total: «Cumpleaños del club · 10 % de la compra  −S/46.12». Las prendas no dicen
// nada: el reparto por línea (`descuento_club_unitario`) es de la base y del comprobante, no de la pantalla.

/** «Cumpleaños del club · 10 % de la compra». */
export const textoPieCumple = (pct: number) => `Cumpleaños del club · ${pctLegible(pct)} % de la compra`;

/** Su `title`: sobre cuánto se calculó. */
export const ayudaPieCumple = (pct: number, totalSinCumple: number) =>
  `${pctLegible(pct)} % de toda la compra (${soles(totalSinCumple)}), sobre lo ya rebajado`;

/** Después de cobrar («Venta registrada»), con el monto que regaló el club. */
export const textoCumpleCobrado = (monto: number) =>
  `Cumpleaños canjeado (−${soles(monto)}). No puede usarlo otra vez hasta el año que viene; devolver la compra tampoco lo devuelve.`;

/** En el ticket impreso, que muestra el descuento de cada prenda («Dscto. -22.39 c/u»): cuánto de eso es del club. */
export const textoCumpleEnElRecibo = (pct: number, monto: number) =>
  `Incluye ${pctLegible(pct)} % de cumpleaños del club: -${monto.toFixed(2)}`;

/* ------------------------------------------------------------------ Cuando algo lo apaga */

/** Por qué se apagó solo (sin que la asesora tocara «Quitar»): se perdió la conexión, o una relectura dice que ya no está. */
export type MotivoCumpleApagado = "sin_conexion" | "no_disponible";

/** El aviso cuando se apaga solo. No vuelve solo: la asesora lo vuelve a tocar (spike: sin conexión se apaga y queda así). */
export function avisoCumpleApagado(motivo: MotivoCumpleApagado, pct: number): { titulo: string; detalle: string } {
  const titulo = `Se quitó el ${pctLegible(pct)} % de cumpleaños`;
  return motivo === "sin_conexion"
    ? { titulo, detalle: "Sin conexión no se canjea: otra tienda podría usarlo a la vez. Cuando vuelva la conexión, tócalo otra vez." }
    : { titulo, detalle: "Ya no está disponible para este cliente (pudo usarlo en otra tienda, o terminó su mes). El total volvió a su precio." };
}

/** Los `hint` de `registrar_venta` que rechazan el canje (ADR-0288, «Contrato de la tanda 1c»). */
const RECHAZOS_DEL_CANJE: ReadonlyMap<string, { releer: boolean; queHacer: (pct: string) => string }> = new Map([
  // La base ya sabe algo que la caja no: se vuelve a leer su resumen para que la fila diga lo que es.
  ["cumple_ya_canjeado", { releer: true, queHacer: (p: string) => `Pudo usarlo en otra caja o tienda. Quité el ${p} %: revisa el total con el cliente y vuelve a confirmar el cobro.` }],
  ["cumple_fuera_de_mes", { releer: true, queHacer: (p: string) => `Su mes ya terminó (hora de Lima). Quité el ${p} %: revisa el total con el cliente y vuelve a confirmar el cobro.` }],
  ["cumple_no_socia", { releer: true, queHacer: (p: string) => `Quité el ${p} %: revisa el total con el cliente y vuelve a confirmar el cobro.` }],
  ["cumple_descuento_distinto", { releer: true, queHacer: (p: string) => `El % del club pudo cambiar mientras cobrabas. Quité el ${p} %: vuelve a tocar «Canjear» para calcularlo de nuevo.` }],
  // Tanda 1g: una sola ventaja del club por compra (la caja no manda las dos; si igual llega, se apaga y se relee).
  ["club_un_cupon_por_compra", { releer: true, queHacer: (p: string) => `Va una sola ventaja del club por compra. Quité el ${p} %: elige una y vuelve a confirmar el cobro.` }],
  // Estos no dependen de ella: la pantalla los evita, y si igual llegan, se apaga y se dice.
  ["cumple_sin_clienta", { releer: false, queHacer: (p: string) => `Quité el ${p} %: elige al cliente y vuelve a tocar «Canjear».` }],
  ["cumple_sin_canje", { releer: false, queHacer: (p: string) => `Quité el ${p} %: vuelve a tocar «Canjear» y confirma otra vez.` }],
  ["cumple_sin_monto", { releer: false, queHacer: (p: string) => `Quité el ${p} %: su cumpleaños queda para otra compra de este mes.` }],
]);

/**
 * Qué hace la caja cuando `registrar_venta` rechaza el canje: SIEMPRE lo apaga (la venta no se guardó y NO se vuelve a
 * mandar sola sin el descuento: la clienta tiene que saber que paga más), y a veces vuelve a leer su resumen. El título del
 * aviso es `traducirError` (lib/error-escritura.ts); esto es el detalle: qué hizo la pantalla y qué sigue. null si el
 * rechazo no es del canje.
 */
export function rechazoDelCanje(hint: string | null | undefined, pct: number): { releer: boolean; detalle: string } | null {
  const r = hint ? RECHAZOS_DEL_CANJE.get(hint) : undefined;
  return r ? { releer: r.releer, detalle: `La venta no se guardó. ${r.queHacer(pctLegible(pct))}` } : null;
}

/** Se cortó la conexión cobrando con el canje: no va a la cola (D-5). El mismo `p_token` hace seguro volver a confirmar. */
export function canjeSinConexion(pct: number): { titulo: string; detalle: string } {
  return {
    titulo: `Se cortó la conexión: el ${pctLegible(pct)} % de cumpleaños no se guarda sin internet`,
    detalle:
      "Otra tienda podría usarlo a la vez. Cuando vuelva la conexión, confirma otra vez: si ya se había guardado, el sistema la reconoce y no la duplica. Si el cliente no puede esperar, quita el cumpleaños y cobra el total completo.",
  };
}
