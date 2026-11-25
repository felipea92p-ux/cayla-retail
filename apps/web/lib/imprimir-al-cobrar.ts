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
  /** Imprime sola y Vender vuelve a una venta nueva, sin hoja: un aviso dice el número, el vuelto e «Imprimir otra copia». */
  | "imprimir-sin-hoja"
  /** No imprime aquí: pide la boleta a la cola de la caja y la hoja se queda abierta (hay un WhatsApp que ofrecer). */
  | "mandar-a-la-caja"
  /** No imprime aquí: pide la boleta a la cola de la caja y Vender vuelve a una venta nueva, sin hoja: el aviso dice cómo va (2026-11-25). */
  | "mandar-sin-hoja";

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
  if (p.enLaCaja && p.ventaId) return p.conWhatsapp ? "mandar-a-la-caja" : "mandar-sin-hoja";
  if (!p.encendido) return "esperar";
  return p.conWhatsapp ? "imprimir-y-quedarse" : "imprimir-sin-hoja";
}

/**
 * A dónde va la boleta de este equipo: lo que dice la tuerca de Vender al lado de su ícono (maqueta `docs/maquetas/impresion-vender-2026-11/`,
 * Felipe 2026-11-25). La caja es la ventana «CAYLA Caja» o la Mac con la ticketera en su ayudante; «a la caja», el equipo con «Imprimir en
 * la caja» encendido (de fábrica, el celular y la tablet). Se calcula con las MISMAS preferencias de siempre: no decide nada nuevo.
 */
export function destinoDelEquipo(p: { esCaja: boolean; enLaCaja: boolean }): "caja" | "a-la-caja" | "aqui" {
  if (p.esCaja) return "caja";
  return p.enLaCaja ? "a-la-caja" : "aqui";
}

export const TEXTO_DESTINO: Record<ReturnType<typeof destinoDelEquipo>, string> = {
  caja: "Esta es la caja",
  "a-la-caja": "Va a la caja",
  aqui: "Imprime aquí",
};

/** Lo que dice la hoja «Impresión de este equipo» en su primera línea, según a dónde va la boleta. */
export function fraseDelDestino(destino: ReturnType<typeof destinoDelEquipo>, enCelular: boolean): string {
  if (destino === "caja") return "Esta computadora imprime sus ventas y las del piso.";
  const equipo = enCelular ? "este celular" : "esta computadora";
  return destino === "a-la-caja" ? `Las boletas de ${equipo} salen en la caja de la tienda.` : `Las boletas de ${equipo} salen aquí.`;
}

/**
 * Lo que dice la tuerca de las boletas de ESTE equipo que esperan a la caja: «1 tuya en cola», «2 tuyas en cola» (/formidable 2026-11-25: con
 * «1 en cola» la lectora no supo si era su boleta o la de otra persona). Sin ninguna, nada.
 */
export function textoEnCola(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 tuya en cola" : `${n} tuyas en cola`;
}

/** Cuánto se espera a que la caja tome la boleta antes de decir «Sigue en la cola de la caja» (y dejar de parecer que imprime). */
export const ESPERA_LARGA_MS = 15_000;

/** En qué va la boleta del aviso al cobrar: impresa aquí (`aqui`) o pedida a la cola de la caja (`caja`). */
export type FaseDelAviso =
  | { donde: "aqui"; fase: "imprimiendo" | "impresa" | "fallo" }
  | { donde: "caja"; fase: "pidiendo" | "en-cola" | "impresa" | "error"; esperaLarga: boolean };

/** Lo que muestra el aviso que reemplaza a «Venta registrada» (maqueta aprobada el 2026-11-25). Sin «Imprimir aquí» en el celular. */
export type CaraDelAviso = {
  titulo: string;
  /** Una línea debajo del número, solo cuando hay algo que explicar. */
  nota: string | null;
  tono: "espera" | "ok" | "cola" | "mal";
  /** El botón principal (con Enter): seguir vendiendo, o reintentar lo que falló. */
  principal: "nueva-venta" | "reintentar";
  reimprimir: boolean;
};

export function caraDelAviso(f: FaseDelAviso): CaraDelAviso {
  if (f.donde === "aqui") {
    if (f.fase === "impresa") return { titulo: "Boleta impresa", nota: null, tono: "ok", principal: "nueva-venta", reimprimir: true };
    if (f.fase === "fallo")
      return { titulo: "La boleta no salió", nota: "Revisa que la ticketera esté prendida y con papel.", tono: "mal", principal: "reintentar", reimprimir: false };
    return { titulo: "Imprimiendo boleta", nota: null, tono: "espera", principal: "nueva-venta", reimprimir: false };
  }
  if (f.fase === "impresa") return { titulo: "Boleta impresa en la caja", nota: null, tono: "ok", principal: "nueva-venta", reimprimir: false };
  if (f.fase === "error")
    return { titulo: "No se pudo mandar a la caja", nota: "Revisa la conexión.", tono: "mal", principal: "reintentar", reimprimir: false };
  if (f.esperaLarga)
    return { titulo: "Sigue en la cola de la caja", nota: "Sale apenas la computadora de la caja esté prendida.", tono: "cola", principal: "nueva-venta", reimprimir: false };
  return { titulo: "Enviando a la caja", nota: null, tono: "espera", principal: "nueva-venta", reimprimir: false };
}
