import { fechaDeSello } from "./traslados-pases-reglas";

// La guía impresa de un traslado (ADR-0242 D-3; ADR-0355 punto 8): el papel que viaja pegado a la caja. Dice de qué sede a cuál,
// qué buscar adentro y trae una casilla vacía por prenda para anotar cuántas llegaron; su QR abre el pase de ESA caja, donde se
// cuenta. NUNCA dice cuántas van: la otra sede cuenta a ciegas (ADR-0239 D-130). Es la misma regla del WhatsApp
// (`mensajeParaLaOtraSede`), y aquí la hace cumplir el tipo: `GuiaTraslado` no tiene un solo campo de cantidad, y la prueba
// exige que dos cajas con las mismas prendas y otras cantidades den la MISMA guía.
//
// Tampoco lleva la nota de quien envió: es texto libre y puede decir «van 5 blusas». En el pase de quien recibe la nota se ve
// recién al terminar de contar; en un papel pegado a la caja se leería antes.

/** Las dos hojas: la térmica de 80 mm (la de la caja de la tienda) o una A4. */
export type FormatoGuia = "termica" | "a4";

export const FORMATOS_GUIA: readonly { id: FormatoGuia; texto: string; detalle: string }[] = [
  { id: "termica", texto: "Térmica 80 mm", detalle: "La impresora de boletas de la caja" },
  { id: "a4", texto: "Hoja A4", detalle: "Cualquier impresora de oficina" },
];

/** Dónde se recuerda la hoja elegida: por computadora, como la forma de las etiquetas (cada una tiene su impresora). */
export const CLAVE_FORMATO_GUIA = "cayla.traslados.guia.formato";

/** Lo guardado en el aparato, leído sin confiar: cualquier otra cosa (o nada) es la térmica, la que tiene toda tienda. */
export function leerFormatoGuia(guardado: string | null | undefined): FormatoGuia {
  return guardado === "a4" ? "a4" : "termica";
}

/** La dirección del pase de una caja: la misma de la billetera (`rutaDelPase`), aquí para el servidor y para el QR. */
export const rutaDelPaseDeTraslado = (id: string) => `/inventario/traslados/${id}`;

/** La pantalla que imprime la guía. Vive FUERA de la billetera (no es un pase: es una hoja para imprimir). */
export const rutaDeLaGuia = (id: string) => `/inventario/traslados/guia/${id}`;

/**
 * Lo que codifica el QR: la dirección COMPLETA del pase, para que la cámara del celular la abra sin más. Quien recibe ve ahí
 * «Ábrela y cuéntala»; quien no tiene el módulo de Traslados cae en «Sin acceso», como con cualquier enlace del ERP.
 * El origen sale del navegador (`location.origin`), como el enlace del WhatsApp: el mismo papel impreso en local apunta al local.
 */
export function urlDelQrDeLaGuia(origen: string, id: string): string {
  return `${origen.replace(/\/+$/, "")}${rutaDelPaseDeTraslado(id)}`;
}

/** Lo mínimo que la guía necesita de una prenda de la caja (`LineaTraslado` lo cumple). */
export type LineaParaGuia = {
  varianteId: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  codigo: string | null;
  /** Solo para saber si la prenda SALIÓ en la caja (`null` = la anotó quien recibió, «prenda de más»). Nunca se imprime. */
  cantidadEnviada: number | null;
};

/** Lo mínimo que la guía necesita de un traslado (`TrasladoDetalle` lo cumple). */
export type TrasladoParaGuia = {
  id: string;
  numero: number;
  estado: string;
  ubicacionOrigenNombre: string;
  ubicacionDestinoNombre: string;
  creadoEn: string;
  fechaEstimadaLlegada: string | null;
  creadoPorNombre: string;
  lineas: readonly LineaParaGuia[];
};

/** Una prenda que buscar en la caja: su nombre, su talla y su color, y el código de la etiqueta. Sin cantidad. */
export type PrendaDeLaGuia = {
  varianteId: string;
  nombre: string;
  /** «Talla M · Rosado», o lo que haya: vacío si la prenda no tiene ni talla ni color. */
  detalle: string;
  codigo: string | null;
};

export type GuiaTraslado = {
  id: string;
  numero: number;
  de: string;
  a: string;
  /** «6 OCT · 10:40»: fechas fijas, nunca «hoy» ni «mañana» (el papel se lee otro día). */
  salio: string;
  llega: string;
  envia: string | null;
  prendas: PrendaDeLaGuia[];
  /** Por qué no se imprime (una caja anulada no viaja); `null` si se puede imprimir. */
  porQueNo: string | null;
  /** La caja ya llegó: se puede volver a imprimir, pero el papel ya no le sirve a nadie para contar. */
  yaLlego: boolean;
};

/** «Talla M · Rosado», «Talla única», «Rosado»: lo que distingue a dos prendas del mismo modelo, en el orden en que se buscan. */
export function detalleDePrenda(l: Pick<LineaParaGuia, "talla" | "color">): string {
  const talla = l.talla?.trim();
  const color = l.color?.trim();
  return [talla ? `Talla ${talla}` : null, color || null].filter(Boolean).join(" · ");
}

/** Lo que dice el papel. Las prendas van en el orden de la caja y solo las que salieron en ella (no las anotadas «de más»). */
export function guiaDelTraslado(t: TrasladoParaGuia): GuiaTraslado {
  const anulada = t.estado === "anulada";
  return {
    id: t.id,
    numero: t.numero,
    de: t.ubicacionOrigenNombre,
    a: t.ubicacionDestinoNombre,
    salio: fechaDeSello(t.creadoEn),
    llega: t.fechaEstimadaLlegada ? fechaDeSello(t.fechaEstimadaLlegada) : "Sin hora",
    envia: t.creadoPorNombre && t.creadoPorNombre !== "—" ? t.creadoPorNombre : null,
    prendas: t.lineas
      .filter((l) => l.cantidadEnviada !== null)
      .map((l) => ({ varianteId: l.varianteId, nombre: l.referencia, detalle: detalleDePrenda(l), codigo: l.codigo })),
    porQueNo: anulada ? `El traslado ${t.numero} se anuló: las prendas volvieron a ${t.ubicacionOrigenNombre} y la caja no viaja.` : null,
    yaLlego: !anulada && t.estado !== "en_transito",
  };
}

/** El texto del botón que imprime, con la hoja elegida: «Imprimir en la térmica», «Imprimir en A4». */
export function textoImprimirGuia(formato: FormatoGuia): string {
  return formato === "a4" ? "Imprimir en A4" : "Imprimir en la térmica";
}
