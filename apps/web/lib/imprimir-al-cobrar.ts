/**
 * «Imprimir solo al cobrar» (Felipe, 2026-11-16; act. 2026-11-25): confirmar el cobro ya imprime la boleta y Vender vuelve solo a una venta
 * nueva, sin la hoja «Venta registrada» ni el segundo toque de «Imprimir y nueva venta». Es el primer paso de que la venta se cierre sola
 * (lo que sigue es que la confirme el aviso de Izipay).
 *
 * Es una preferencia de ESTE equipo, no de la cuenta. Desde el 2026-11-25 arranca ENCENDIDA en la computadora y APAGADA en el celular o
 * la tablet (el aparato sin mouse, `MQ_SIN_IMPRESORA`): ahí no hay impresora, y desde el 2026-11-24 la boleta va sola a la cola de la caja
 * («Imprimir en la caja», abajo). Lo que un equipo ya eligió a mano se respeta. En una computadora sin impresión directa (Chrome sin
 * `--kiosk-printing` ni el ayudante de la Mac, `docs/OPERACION-IMPRESORA-TERMICA.md`) se abre el cuadro de impresión del navegador: un
 * clic en vez de los dos de antes.
 *
 * La hoja sigue apareciendo cuando hay algo que ver o hacer con ella: sin conexión o sin comprobante (no hay qué imprimir), «Imprimir en la
 * caja» (dice cómo va la cola), el WhatsApp de la boleta que se le ofrece al cliente, o la boleta que no salió (`noSeImprimio`).
 *
 * La regla pura (`queHacerAlRegistrar`) decide; Vender y la hoja solo la obedecen.
 */
import { money } from "./money";
import { preferenciaLocal } from "./preferencia-local";

const VALORES = ["si", "no"] as const;

/**
 * El aparato que se maneja con el dedo y sin mouse: un celular o una tablet. Ninguno tiene la ticketera conectada (ADR-0670). La Mac y la
 * PC de la caja tienen mouse, así que no entran, aunque su pantalla sea táctil.
 */
export const MQ_SIN_IMPRESORA = "(pointer: coarse) and (hover: none)";

/** ¿Este aparato es de los que no tienen impresora? Sin `matchMedia` (un navegador raro) se toma como computadora. */
const aparatoSinMouse = () => window.matchMedia?.(MQ_SIN_IMPRESORA).matches === true;

/** Cómo arranca «Imprimir solo al cobrar» donde nadie lo tocó (2026-11-25): encendido en la computadora, apagado sin mouse. */
export function imprimirAlCobrarDeFabrica(sinMouse: boolean): (typeof VALORES)[number] {
  return sinMouse ? "no" : "si";
}

/** La preferencia del equipo (`localStorage`). Úsala con `useSyncExternalStore(p.suscribir, p.leer, p.leerEnServidor)`. */
export const imprimirAlCobrar = preferenciaLocal<(typeof VALORES)[number]>("cayla-imprimir-al-cobrar", VALORES, "no", () =>
  imprimirAlCobrarDeFabrica(aparatoSinMouse()),
);

/**
 * Cómo arranca «Imprimir en la caja» en un aparato donde nadie lo tocó todavía (Felipe, 2026-11-24): encendido en el celular y la tablet, y
 * apagado en la computadora, que imprime donde cobra.
 */
export function enLaCajaDeFabrica(sinMouse: boolean): (typeof VALORES)[number] {
  return sinMouse ? "si" : "no";
}

/**
 * «Imprimir en la caja» (Felipe, 2026-11-16): el celular o la tablet del piso no tiene impresora; al cobrar, la boleta se pide a
 * la cola de la caja de la sede (`retail.impresiones`) y la imprime la caja (la estación, `lib/estacion-de-impresion.ts`). Es del equipo.
 * **Desde el 2026-11-24 viene encendido en el celular y la tablet** (Felipe: «debe estar marcado por defecto e imprimir de manera
 * automática»): apagado de fábrica, nadie lo encendió y en ocho días no salió ni una boleta del piso (0 filas en `retail.impresiones`).
 * Lo que alguien eligió a mano se respeta: cuando el piso tenga su impresora inalámbrica, se apaga en ese equipo y vuelve a imprimir
 * donde se cobra. En el servidor (que no sabe qué aparato es) sigue en «no».
 */
export const imprimirEnLaCaja = preferenciaLocal<(typeof VALORES)[number]>("cayla-imprimir-en-la-caja", VALORES, "no", () =>
  enLaCajaDeFabrica(aparatoSinMouse()),
);

/** Lo que pasa apenas se registra la venta. */
export type AlRegistrar =
  /** La hoja «Venta registrada» espera a que la cajera apriete «Imprimir y nueva venta» (apagado, o nada que imprimir). */
  | "esperar"
  /** Imprime sola y la hoja se queda abierta: hay un WhatsApp que ofrecerle al cliente. */
  | "imprimir-y-quedarse"
  /** Imprime sola y Vender vuelve a una venta nueva, sin hoja: un aviso dice el número, el vuelto y «Reimprimir». */
  | "imprimir-sin-hoja"
  /** No imprime aquí: pide la boleta a la cola de la caja y la hoja muestra cómo va. */
  | "mandar-a-la-caja";

export function queHacerAlRegistrar(p: {
  /** ¿Este equipo manda sus boletas a la caja? Gana sobre «Imprimir solo al cobrar». */
  enLaCaja?: boolean;
  /** La venta guardada en el servidor: sin ella no hay qué pedir a la cola. */
  ventaId?: string | null;
  /** ¿Este equipo tiene encendido «Imprimir solo al cobrar»? */
  encendido: boolean;
  /** ¿La venta trae su comprobante? Sin él (no se pudo leer) no hay nada que imprimir. */
  hayComprobante: boolean;
  /** ¿Se guardó sin conexión? Todavía no tiene serie ni número: no hay comprobante que imprimir. */
  sinConexion: boolean;
  /** ¿La hoja tiene un WhatsApp que ofrecer (el cliente dejó su celular y el comprobante es boleta o factura)? */
  conWhatsapp?: boolean;
}): AlRegistrar {
  if (!p.hayComprobante || p.sinConexion) return "esperar";
  if (p.enLaCaja && p.ventaId) return "mandar-a-la-caja";
  if (!p.encendido) return "esperar";
  return p.conWhatsapp ? "imprimir-y-quedarse" : "imprimir-sin-hoja";
}

/**
 * La segunda línea del aviso de una venta que se imprimió sin hoja: el comprobante y, si hubo, el vuelto (la cajera ya lo vio en la hoja
 * de cobro; aquí queda a mano mientras lo entrega). «Boleta B001-000123 · Vuelto S/30.20».
 */
export function detalleDelAvisoAlCobrar(p: { comprobante: string; vuelto: number }): string {
  return p.vuelto > 0 ? `${p.comprobante} · Vuelto ${money(p.vuelto)}` : p.comprobante;
}
