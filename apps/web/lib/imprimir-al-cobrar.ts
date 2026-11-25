/**
 * «Imprimir solo al cobrar» (Felipe, 2026-11-16; act. 2026-11-25): confirmar el cobro ya imprime la boleta y Vender vuelve solo a una venta
 * nueva, sin la hoja «Venta registrada» ni el segundo toque de «Imprimir y nueva venta». Es el primer paso de que la venta se cierre sola
 * (lo que sigue es que la confirme el aviso de Izipay).
 *
 * Es una preferencia de ESTE equipo, no de la cuenta. Desde el 2026-11-25 arranca ENCENDIDA en un computador y APAGADA en un teléfono o
 * una tablet (el puntero principal es un dedo, `(pointer: coarse)`, el mismo criterio de ADR-0674): el piso no tiene impresora, y ahí la
 * hoja sigue como siempre (o la boleta va a la cola de la caja). Lo que un equipo ya eligió a mano se respeta. En un computador sin
 * impresión directa (Chrome sin `--kiosk-printing` ni el ayudante de la Mac, `docs/OPERACION-IMPRESORA-TERMICA.md`) se abre el cuadro
 * de impresión del navegador: un clic en vez de los dos de antes.
 *
 * La hoja sigue apareciendo cuando hay algo que ver o hacer con ella: sin conexión o sin comprobante (no hay qué imprimir), «Imprimir en la
 * caja» (dice cómo va la cola), el WhatsApp de la boleta que se le ofrece al cliente, o la boleta que no salió (`noSeImprimio`).
 *
 * La regla pura (`queHacerAlRegistrar`) decide; Vender y la hoja solo la obedecen.
 */
import { money } from "./money";
import { preferenciaLocal } from "./preferencia-local";

const VALORES = ["si", "no"] as const;

/** El valor de fábrica de «Imprimir solo al cobrar»: encendido en un computador, apagado si el puntero principal es un dedo. */
export function imprimirAlCobrarDeFabrica(tactil: boolean): (typeof VALORES)[number] {
  return tactil ? "no" : "si";
}

/** ¿El puntero principal de este equipo es un dedo? Sin `matchMedia` (un navegador raro) se toma como computador. */
function equipoTactil(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/** La preferencia del equipo (`localStorage`). Úsala con `useSyncExternalStore(p.suscribir, p.leer, p.leerEnServidor)`. */
export const imprimirAlCobrar = preferenciaLocal<(typeof VALORES)[number]>("cayla-imprimir-al-cobrar", VALORES, "no", () =>
  imprimirAlCobrarDeFabrica(equipoTactil()),
);

/**
 * «Imprimir en la caja» (Felipe, 2026-11-16): el celular o la tablet del piso no tiene impresora; al cobrar, la boleta se pide a
 * la cola de la caja de la sede (`retail.impresiones`) y la imprime la ventana «CAYLA Caja». Del equipo y apagado de fábrica:
 * cuando el piso tenga su impresora inalámbrica, se apaga en ese equipo y vuelve a imprimir donde se cobra.
 */
export const imprimirEnLaCaja = preferenciaLocal<(typeof VALORES)[number]>("cayla-imprimir-en-la-caja", VALORES, "no");

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
