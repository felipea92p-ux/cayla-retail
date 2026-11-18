/* ====================================================================
   El corte de una tabla (Felipe 2026-11-05, «tablas parecidas»; ADR-0610 act.).

   El problema: casi todas las tablas activan sus columnas con `sm:grid-cols-[…]`, que mira la VENTANA (640 px), no lo que la tabla tiene de
   verdad. Con el menú abierto, a 1024 px de ventana la tabla mide 690; una plantilla que pide 864 se salía de lado, y su columna `1fr` se
   quedaba sin ancho: en Historial de compras no se veía el proveedor.

   La regla: de cuánto ancho necesita la plantilla sale un «corte», y bajo ese ancho la tabla usa la forma de celular que ya tiene. Lo aplica
   `app/estilos/tabla-corte.css` con una consulta de contenedor; aquí solo se calcula, así que una tabla nueva no tiene que hacer nada.
   ==================================================================== */

/** El relleno de la fila (`px-5`) y el hueco entre columnas (`gap-x-4`), en px. */
const RELLENO = 40;
const HUECO = 16;
/** Lo mínimo que se le da a cada `fr`: a una columna `1fr` le tiene que caber un nombre. */
const POR_FR = 100;
/** Una columna `auto` o que depende de una variable: no se sabe cuánto pide, se le da lo de una cifra. */
const SIN_MEDIDA = 64;

export const ESCALON_CORTE = 80;
export const CORTE_MINIMO = 400;
export const CORTE_MAXIMO = 1200;

/** Parte «8rem_minmax(0,1fr)_7rem» en sus pistas, sin cortar dentro de un paréntesis. */
function pistasDe(texto: string): string[] {
  const pistas: string[] = [];
  let actual = "";
  let hondura = 0;
  for (const c of texto) {
    if (c === "(") hondura++;
    if (c === ")") hondura--;
    if (c === "_" && hondura === 0) {
      pistas.push(actual);
      actual = "";
    } else actual += c;
  }
  if (actual) pistas.push(actual);
  return pistas;
}

function anchoFijo(valor: string): number | null {
  const m = /^([\d.]+)(rem|px)$/.exec(valor);
  if (!m) return null;
  return Number(m[2] === "rem" ? Number(m[1]) * 16 : m[1]);
}

/** Lo que una pista necesita para que su contenido quepa, en px. */
function anchoDePista(pista: string): number {
  const repetida = /^repeat\((\d+),(.+)\)$/.exec(pista);
  if (repetida) return Number(repetida[1]) * anchoDePista(repetida[2]);
  const fijo = anchoFijo(pista);
  if (fijo !== null) return fijo;
  const fr = /^([\d.]+)fr$/.exec(pista);
  if (fr) return Number(fr[1]) * POR_FR;
  const minmax = /^minmax\(([^,]+),(.+)\)$/.exec(pista);
  if (minmax) {
    const piso = anchoFijo(minmax[1]) ?? 0;
    const tope = /^([\d.]+)fr$/.exec(minmax[2]);
    if (tope) return Math.max(piso, Number(tope[1]) * POR_FR);
    // Con un tope fijo («minmax(0,14rem)») puede encogerse: la mitad alcanza.
    return Math.max(piso, (anchoFijo(minmax[2]) ?? SIN_MEDIDA) / 2);
  }
  return SIN_MEDIDA;
}

/** Cuánto ancho necesita una plantilla para mostrarse en columnas. `null` si no se decide por la ventana (`@min-[…]` ya mira su contenedor). */
export function anchoDePlantilla(plantilla: string): number | null {
  const m = /(?:^|\s)(?:sm|md|lg):grid-cols-\[([^\]\s]+)\]/.exec(plantilla);
  if (!m) return null;
  const pistas = pistasDe(m[1]);
  const columnas = pistas.reduce((n, p) => n + Number(/^repeat\((\d+),/.exec(p)?.[1] ?? 1), 0);
  return pistas.reduce((suma, p) => suma + anchoDePista(p), 0) + (columnas - 1) * HUECO + RELLENO;
}

/**
 * La clase que hace que la tabla pase a su forma de celular cuando no le caben las columnas («tabla-corte-880»), o «» si no hace falta.
 * Redondea hacia abajo: mejor una columna flexible un poco justa que perder las columnas por unos píxeles. Una plantilla con forma propia en
 * el celular (`grid-cols-2 sm:grid-cols-[…]`) se queda sin corte: su forma angosta no es una sola columna y no se puede pisar a ciegas.
 */
export function corteDePlantilla(plantilla: string): string {
  const ancho = anchoDePlantilla(plantilla);
  if (ancho === null || /(?:^|\s)grid-cols-(?!1(?:\s|$))/.test(plantilla)) return "";
  const corte = Math.min(CORTE_MAXIMO, Math.floor(ancho / ESCALON_CORTE) * ESCALON_CORTE);
  return corte < CORTE_MINIMO ? "" : `tabla-corte-${corte}`;
}
