// «Pregúntale a CAYLA» (ADR-0536, actividad 7; tensión 3 del ADR): las REGLAS DE TIENDA que el asistente puede contestar.
//
// Para responder «¿cuántos días tiene un cliente para cambiar una prenda?» la IA tiene que leer la regla en algún lado. Repartida entre
// `docs/datos/15-COMO-OPERA-CAYLA.md`, los ADR y el código, mezclaría lo decidido con lo viejo. Por eso viven aquí, cortas y con su fuente,
// y **solo las `aprobada` llegan a la IA**: cada una entra con el OK de Felipe. Lo que no está aquí, el asistente no lo sabe y lo dice
// («eso lo decide tu líder de tienda»). Las preguntas de reglas que no estaban vuelven en el informe del lunes como «escribir una regla».
//
// Al cambiar una regla del negocio en el código (un plazo, un tope), se cambia también aquí: `reglas-de-tienda.test.ts` cruza las cifras
// con las constantes del código que las aplican.

export type ReglaDeTienda = {
  /** Estable: lo anota la pregunta (`asistente_preguntas.referencia`). */
  id: string;
  /** Palabras con que la gente lo pregunta: la búsqueda local las usa para elegir qué reglas ver. */
  pregunta: string;
  /** La respuesta, en lenguaje de tienda, dos frases como máximo. Es lo que ve la persona, palabra por palabra. */
  respuesta: string;
  /** De dónde sale: un ADR, una regla de `15-COMO-OPERA-CAYLA.md`, una guía o una constante del código. */
  fuente: string;
  /** `borrador` hasta que Felipe la apruebe; solo las `aprobada` llegan a la IA. */
  estado: "borrador" | "aprobada";
};

// Felipe aprobó el 2026-10-27 todas menos «devolucion-aprueba» (el sistema todavía exige líder y él pide lo contrario: queda en borrador
// hasta que el sistema cambie). Sacó el tope de descuento y el cierre de caja: «los líderes solo supervisan visualmente».
export const REGLAS_DE_TIENDA: readonly ReglaDeTienda[] = [
  {
    id: "cambio-plazo",
    pregunta: "cuántos días tiene un cliente para cambiar una prenda plazo de cambio",
    respuesta: "Un cliente puede cambiar una prenda hasta 15 días después de comprarla, si está en buen estado.",
    fuente: "R-37 y R-38 de 15-COMO-OPERA-CAYLA; DIAS_PLAZO_CAMBIO (lib/cambios-reglas.ts)",
    estado: "aprobada",
  },
  {
    id: "cambio-diferencia",
    pregunta: "cambio con diferencia de precio la prenda nueva cuesta más o menos caja cerrada",
    respuesta: "Si la prenda nueva cuesta distinto, la diferencia en efectivo entra a la caja de hoy. Con la caja cerrada solo se hacen cambios sin diferencia en efectivo.",
    fuente: "Guía de Cambios (lib/guias/pantallas/ventas-posventa.ts)",
    estado: "aprobada",
  },
  {
    id: "devolucion-orden",
    pregunta: "el cliente quiere que le devuelva la plata devolución de dinero nota de crédito vale",
    respuesta: "Primero se ofrece cambiar por otra prenda; si no hay su talla ni algo de su agrado, se da nota de crédito. Devolver la plata es la última opción.",
    fuente: "R-37 de 15-COMO-OPERA-CAYLA",
    estado: "aprobada",
  },
  {
    id: "devolucion-aprueba",
    pregunta: "quién aprueba una devolución cuándo vuelve el stock nota de crédito",
    respuesta: "Una devolución la registra cualquiera del equipo y la aprueba un líder: recién ahí vuelve el stock y sale la nota de crédito.",
    fuente: "aprobar_devolucion exige líder (ADR-0177). Felipe (2026-10-27): «cualquiera hace la devolución, no necesita aprobación»; queda en borrador hasta que el sistema deje de exigirlo, para no contradecir la pantalla",
    estado: "borrador",
  },
  {
    id: "anular-venta",
    pregunta: "anular una venta hecha por error de hoy de ayer",
    respuesta: "Una venta solo se anula el mismo día en que se hizo, si fue por error. Después de ese día se hace un cambio o una devolución.",
    fuente: "Guía de Devoluciones, paso «Anular una venta de hoy»",
    estado: "aprobada",
  },
  {
    id: "anular-comprobante",
    pregunta: "anular una boleta o factura ya enviada a SUNAT quién puede",
    respuesta: "Anular un comprobante lo decide un líder, desde Ventas ▸ Comprobantes.",
    fuente: "Guía de Comprobantes («anular lo decide el líder»)",
    estado: "aprobada",
  },
  {
    id: "sin-comprobante",
    pregunta: "el cliente no quiere boleta ni factura venta sin comprobante nota de venta",
    respuesta: "Si el cliente no quiere boleta ni factura, la venta se registra igual con «Nota de venta»: no va a SUNAT, pero mueve el stock.",
    fuente: "ADR-0164 «Nota de venta»; R-15 de 15-COMO-OPERA-CAYLA",
    estado: "aprobada",
  },
  {
    id: "sunat-caido",
    pregunta: "SUNAT no responde se cayó no llega el comprobante por enviar",
    respuesta: "Si SUNAT no responde, se vende igual: el comprobante queda en «Por enviar» y se reintenta después, desde Ventas ▸ Comprobantes.",
    fuente: "R-16 de 15-COMO-OPERA-CAYLA; ADR-0005 y ADR-0009",
    estado: "aprobada",
  },
  {
    id: "apartado-plazo",
    pregunta: "cuántos días se guarda un apartado vence aplazar el cliente no vuelve adelanto",
    respuesta: "Un apartado se guarda como mucho 30 días desde que se apartó, y se puede aplazar dentro de ese tope. Si vence y el cliente no vuelve, la prenda regresa al stock y hay que devolverle el adelanto.",
    fuente: "TOPE_DIAS_APARTADO (lib/apartado-detalle-reglas.ts); guía de Apartados",
    estado: "aprobada",
  },
  {
    id: "apartado-comprobante",
    pregunta: "qué se le da al cliente al apartar constancia boleta del apartado",
    respuesta: "Al apartar se entrega una constancia, que no es comprobante de pago. La boleta o factura sale una sola vez, cuando recoge, por el total.",
    fuente: "Guía de Apartados",
    estado: "aprobada",
  },
  {
    id: "proforma",
    pregunta: "proforma cotización separa la prenda cuánto dura",
    respuesta: "Una proforma es una cotización: guarda el precio los días que elijas al hacerla, pero no es comprobante ni separa la prenda. Para separarla, se aparta.",
    fuente: "Guía de Proformas («no es comprobante de pago ni mueve stock»)",
    estado: "aprobada",
  },
  {
    id: "nombre-prenda",
    pregunta: "cómo le pongo nombre a una prenda nueva nombrar bautizar flor qué nombre le doy",
    respuesta: "El nombre es el tipo de prenda más una flor de la lista, como «Blusa Dalia»: el color y la talla nunca van en el nombre. Si es la misma prenda en otro color, no se crea otra: se abre la que ya existe y se le agrega el color.",
    fuente: "ADR-0556 (estándar de nombres, Felipe 2026-10-28); lib/nombre-de-prenda.ts",
    // Borrador: entra a la IA cuando Felipe la apruebe.
    estado: "borrador",
  },
];

/** Las que la IA puede usar: solo las aprobadas por Felipe. */
export function reglasAprobadas(reglas: readonly ReglaDeTienda[] = REGLAS_DE_TIENDA): ReglaDeTienda[] {
  return reglas.filter((r) => r.estado === "aprobada");
}
