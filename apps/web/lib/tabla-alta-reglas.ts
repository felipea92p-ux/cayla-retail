// Reglas puras de la «tabla de la prenda» de Nuevo producto (spike v2, 2026-09-28): la misma tabla color × talla se
// dibuja en el paso 3 (qué variantes se crean y sus fotos) y en el paso 4 (cuántas hay hoy y qué precio y costo lleva cada
// una). Aquí vive lo que se puede equivocar sin que se note en pantalla —los totales, «Llenar todas», el ejemplo de la
// leyenda, cuándo un precio o un costo cuenta como distinto— para probarlo sin montar React.
//
// CONTRATO
//   PROMETE: sumar SOLO las celdas que siguen en la tabla (una celda quitada no se crea: su número no cuenta), y dar
//            los textos de la leyenda con un ejemplo de la MISMA prenda que se está cargando.
//   ASUME:   las claves de celda son las de `construirCeldas` (`lib/alta-producto.ts`); la base valida de nuevo al crear.
//   NO HACE: no guarda nada ni decide qué se manda a la RPC: eso sigue en `NuevoProductoForm`.

import { leerCantidad, limpiarCantidad, type CeldaAlta } from "./alta-producto";
import { precioValido } from "./variantes-ficha-reglas";

/** Tope de una celda de cantidad (`leerCantidad`/`crear_producto_con_stock_inicial`): un entero de 4 dígitos. */
const CANTIDAD_MAXIMA = 9999;

/** Clave de una fila (color) o columna (talla) en los totales: `null` (sin color / sin talla) se guarda como "". */
export const claveEje = (v: string | null) => v ?? "";

export type TotalesCantidades = {
  porFila: Record<string, number>;
  porColumna: Record<string, number>;
  total: number;
};

/** Totales de «Cuántas tienes hoy» por color, por talla y general. Lo que no es una cantidad válida cuenta 0 (el
 *  formulario ya lo marca con su propio aviso); una celda quitada en el paso 3 no suma aunque tenga algo escrito. */
export function totalesCantidades(
  celdas: readonly CeldaAlta[],
  excluidas: ReadonlySet<string>,
  cantidades: Readonly<Record<string, string>>
): TotalesCantidades {
  const porFila: Record<string, number> = {};
  const porColumna: Record<string, number> = {};
  let total = 0;
  for (const c of celdas) {
    const n = excluidas.has(c.clave) ? 0 : (leerCantidad(cantidades[c.clave] ?? "") ?? 0);
    porFila[claveEje(c.color)] = (porFila[claveEje(c.color)] ?? 0) + n;
    porColumna[claveEje(c.tallaId)] = (porColumna[claveEje(c.tallaId)] ?? 0) + n;
    total += n;
  }
  return { porFila, porColumna, total };
}

/** «Llenar todas con [n]»: qué celdas reciben qué valor. Solo las que siguen en la tabla; con la caja vacía (o sin un
 *  solo dígito) no se toca nada, para que un «Aplicar» por error no borre lo ya contado. */
export function llenarTodas(celdas: readonly CeldaAlta[], excluidas: ReadonlySet<string>, valor: string): { clave: string; valor: string }[] {
  const limpio = limpiarCantidad(valor);
  if (limpio === "") return [];
  // «007» se escribe «7»: es lo que la persona ve después en cada celda.
  const normal = String(Number(limpio));
  return celdas.filter((c) => !excluidas.has(c.clave)).map((c) => ({ clave: c.clave, valor: normal }));
}

/** El reverso de `llenarTodas`: al borrar la caja «Llenar todas con», deja vacías las mismas celdas que habría tocado
 *  (las que siguen en la tabla). Ya no hay un «Aplicar» que mis-clickear, así que una caja vacía borra de verdad. */
export function vaciarTodas(celdas: readonly CeldaAlta[], excluidas: ReadonlySet<string>): { clave: string; valor: string }[] {
  return celdas.filter((c) => !excluidas.has(c.clave)).map((c) => ({ clave: c.clave, valor: "" }));
}

/**
 * Lo que hace escribir (o borrar) en «Llenar todas con». Con un número, lo pone en todas las celdas que siguen en la tabla. Con la caja VACÍA —porque se borró o porque se tecleó algo que no
 * es un dígito— depende de la pantalla: en Nuevo producto es el reverso de lo anterior y deja vacías esas celdas (`borraAlVaciar`, lo de siempre); en «Nueva orden» NO toca nada, porque ahí
 * las cantidades suelen venir de la sugerencia de la red o de teclearlas una por una, y una tecla de más no debe vaciar la orden entera sin avisar (revisión adversaria de A2, 2026-10-13).
 */
export function cambiosDeRelleno(
  celdas: readonly CeldaAlta[],
  excluidas: ReadonlySet<string>,
  texto: string,
  borraAlVaciar: boolean
): { clave: string; valor: string }[] {
  const limpio = limpiarCantidad(texto);
  if (limpio !== "") return llenarTodas(celdas, excluidas, limpio);
  return borraAlVaciar ? vaciarTodas(celdas, excluidas) : [];
}

/** Los botones «−» / «+» junto a una celda: suman o restan 1 al entero leído (vacío cuenta 0), sin pasar de
 *  0 a 9999. El resultado vuelve a texto con la misma convención que tipear a mano: 0 se guarda vacío. */
export function pasoCantidad(valor: string, delta: -1 | 1): string {
  const actual = leerCantidad(valor) ?? 0;
  const siguiente = Math.min(CANTIDAD_MAXIMA, Math.max(0, actual + delta));
  return siguiente === 0 ? "" : String(siguiente);
}

/** Lo que admite la caja de precio de una celda mientras se tipea: dígitos y UN separador decimal (la coma se vuelve
 *  punto, que es lo que lee `Number`), hasta 2 decimales. */
export function limpiarPrecio(texto: string): string {
  const t = texto.replace(",", ".").replace(/[^0-9.]/g, "");
  const i = t.indexOf(".");
  if (i === -1) return t.slice(0, 7);
  return t.slice(0, Math.min(i, 7)) + "." + t.slice(i + 1).replace(/\./g, "").slice(0, 2);
}

/** Un precio escrito en una celda cuenta como «distinto» (se pinta en ámbar) si es un número y no es el precio de venta.
 *  Vacío = el de todas, nunca distinto. */
export function precioDistinto(valor: string | undefined, precioBase: string): boolean {
  if (valor === undefined || valor.trim() === "") return false;
  const v = Number(valor);
  if (!Number.isFinite(v)) return false;
  const base = Number(precioBase);
  return !(Number.isFinite(base) && base > 0 && Math.abs(v - base) < 0.005);
}

/** El precio de venta como se lee en la tabla: «S/ 89.90». Sin precio todavía, «el precio de venta». */
export function textoPrecioBase(precioBase: string): string {
  const n = Number(precioBase);
  return Number.isFinite(n) && n > 0 ? `S/\u00a0${n.toFixed(2)}` : "el precio de venta";
}

/** El costo de arriba leído como número: es opcional, así que vacío (o algo que no es un número) es 0, como lo guarda el alta. */
function costoDeArriba(costoBase: string): number {
  const n = Number(costoBase);
  return costoBase.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Un costo escrito en una celda cuenta como «distinto» (se pinta en ámbar) si no es el costo de arriba. Sin costo arriba, el
 *  de todas es 0: un 0 escrito no es distinto. Vacío = el de todas, nunca distinto. */
export function costoDistinto(valor: string | undefined, costoBase: string): boolean {
  if (valor === undefined || valor.trim() === "") return false;
  const v = Number(valor);
  if (!Number.isFinite(v)) return false;
  return Math.abs(v - costoDeArriba(costoBase)) >= 0.005;
}

/** El costo de arriba como se lee en la tabla: «S/ 12.50». Sin costo (es opcional), las vacías quedan «sin costo». */
export function textoCostoBase(costoBase: string): string {
  const n = costoDeArriba(costoBase);
  return n > 0 ? `S/\u00a0${n.toFixed(2)}` : "sin costo";
}

/** Lo que vale una celda de «Precios» o «Costos» al crear: lo escrito en ella o, vacía, el monto de todas. Un texto que no es
 *  número da NaN a propósito: el formulario lo frena antes de llamar a la base. */
export function montoDeCelda(propio: string | undefined, base: number): number {
  return propio !== undefined && propio.trim() !== "" ? Number(propio) : base;
}

/** Cómo se llama una celda en pantalla: «Negro en M», «Sin color en Única». La misma frase en la tabla (para el lector) y en
 *  «Falta», para que la persona encuentre la celda que se le nombra. */
export function nombreCelda(color: string | null | undefined, talla: string | null | undefined): string {
  return `${color || "Sin color"} en ${talla || "Única"}`;
}

/**
 * La primera celda (de las que siguen en la tabla) con un precio PROPIO que no sirve: un 0, o algo que no es un número. Vacía no
 * cuenta: toma el precio de todas, que se revisa aparte. Es la regla de Editar producto (`precioValido`, ADR-0377), sin la
 * excepción de Empaque: Nuevo producto pide siempre un precio mayor que 0 (una bolsa de obsequio se deja en 0 desde su ficha).
 * Sin esto, un «0» escrito por error en una celda creaba la prenda a S/ 0 y la caja la vendía gratis (ADR-0384).
 */
export function celdaSinPrecio<C extends { clave: string }>(celdas: readonly C[], precios: Readonly<Record<string, string>>): C | null {
  return celdas.find((c) => precioPropioInvalido(precios[c.clave])) ?? null;
}

/** ¿Lo escrito en una celda de «Precios» no sirve? Vacía sirve (toma el de todas). La celda lo marca y `celdaSinPrecio` la nombra. */
export function precioPropioInvalido(propio: string | undefined): boolean {
  return propio !== undefined && propio.trim() !== "" && !precioValido(Number(propio));
}

export type Leyenda = {
  /** «12 variantes» / «1 variante». */
  cuantas: string;
  /** De dónde salen: «cada talla en cada color», «una por talla»… */
  deDonde: string;
  /** Una celda de ESTA prenda para el «¿Alguna no existe, como … ?»; null si hay una sola celda (no hay qué quitar). */
  ejemplo: string | null;
};

/** La leyenda de la tabla del paso 3. El ejemplo es la última celda de la tabla (último color en la última talla):
 *  es la esquina que la persona tiene a la vista y suele ser la combinación rara (el color nuevo en la talla grande). */
export function leyendaVariantes(incluidas: number, colores: readonly string[], tallas: readonly string[]): Leyenda {
  const cuantas = `${incluidas} variante${incluidas === 1 ? "" : "s"}`;
  const color = colores.at(-1) ?? null;
  const talla = tallas.at(-1) ?? null;
  if (color && talla) {
    return { cuantas, deDonde: "cada talla en cada color", ejemplo: colores.length * tallas.length > 1 ? `${color} en ${talla}` : null };
  }
  if (talla) return { cuantas, deDonde: "una por talla", ejemplo: tallas.length > 1 ? `la talla ${talla}` : null };
  if (color) return { cuantas, deDonde: "una por color", ejemplo: colores.length > 1 ? color : null };
  return { cuantas, deDonde: "sin tallas ni colores", ejemplo: null };
}

/** Lo que dice bajo el nombre del color en la tabla del paso 3. `hayGeneral` = ya hay una foto de «Todos los colores»,
 *  que es la que se verá en este color mientras no tenga la suya (`fotoDeVariante`). */
export function textoFotosDeFila(n: number, hayGeneral: boolean): string {
  if (n > 0) return `${n} foto${n === 1 ? "" : "s"}`;
  return hayGeneral ? "usa la de todos" : "agrega su foto";
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// El teclado de la tabla de cantidades (ADR-0396, A2): quien carga una curva de 3 colores × 4 tallas no debería buscar cada celda con el mouse. Enter y ↓ bajan por la
// talla (la columna), ↑ y Shift+Enter suben; al llegar al fondo, Enter pasa a la talla siguiente (como una planilla) y ↓ se queda donde está. Lo que se mueve es solo el
// cursor: nada de esto escribe ni envía. Aquí vive lo que se puede equivocar sin que se note —qué celdas tienen caja, a cuál se salta, cuándo se acaba— para probarlo sin React.

export type MovimientoDeTecla = { sentido: 1 | -1; envolver: boolean };

/** Qué hace una tecla dentro de una celda: Enter y ↓ van a la de abajo, Shift+Enter y ↑ a la de arriba; solo Enter (con o sin Shift) pasa de una talla a la otra al
 *  llegar al fondo. Con Alt, Ctrl o Meta, con Shift+flecha o con cualquier otra tecla, `null`: la tecla es del navegador (atajos, selección de texto). */
export function movimientoDeTecla(k: { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): MovimientoDeTecla | null {
  if (k.altKey || k.ctrlKey || k.metaKey) return null;
  if (k.key === "Enter") return { sentido: k.shiftKey ? -1 : 1, envolver: true };
  if (k.shiftKey) return null;
  if (k.key === "ArrowDown") return { sentido: 1, envolver: false };
  if (k.key === "ArrowUp") return { sentido: -1, envolver: false };
  return null;
}

/** Una lista por columna (talla) con las claves de las celdas que TIENEN caja, de arriba abajo. Una celda quitada o que el modelo no tiene no cuenta (no hay a dónde
 *  saltar); una columna sin ninguna celda con caja se omite, para que «la siguiente talla» sea siempre una que se puede escribir. */
export function columnasEditables(
  filas: readonly (string | null)[],
  columnas: readonly (string | null)[],
  celdas: readonly CeldaAlta[],
  excluidas: ReadonlySet<string>
): string[][] {
  const porClave = new Map(celdas.map((c) => [`${c.color ?? ""}\u0000${c.tallaId ?? ""}`, c] as const));
  const listas: string[][] = [];
  for (const talla of columnas) {
    const claves: string[] = [];
    for (const color of filas) {
      const celda = porClave.get(`${color ?? ""}\u0000${talla ?? ""}`);
      if (celda && !excluidas.has(celda.clave)) claves.push(celda.clave);
    }
    if (claves.length > 0) listas.push(claves);
  }
  return listas;
}

/** La celda a la que va el cursor desde `desde`. Sentido 1: la siguiente de su columna; al fondo, si `envolver`, la primera de la columna siguiente; si no, `null`
 *  (se queda). Sentido −1: el espejo. Una `desde` que no está en la tabla da `null`: nunca se adivina. */
export function celdaVecina(columnas: readonly (readonly string[])[], desde: string, mov: MovimientoDeTecla): string | null {
  for (let c = 0; c < columnas.length; c++) {
    const r = columnas[c].indexOf(desde);
    if (r < 0) continue;
    const vecina = columnas[c][r + mov.sentido];
    if (vecina !== undefined) return vecina;
    if (!mov.envolver) return null;
    const otra = columnas[c + mov.sentido];
    if (!otra) return null;
    return mov.sentido === 1 ? otra[0] : (otra.at(-1) ?? null);
  }
  return null;
}
