// Reglas puras de la «tabla de la prenda» de Nuevo producto (spike v2, 2026-09-28): la misma tabla color × talla se
// dibuja en el paso 3 (qué variantes se crean y sus fotos) y en el paso 4 (cuántas hay hoy y qué precio lleva cada una).
// Aquí vive lo que se puede equivocar sin que se note en pantalla —los totales, «Llenar todas», el ejemplo de la
// leyenda, cuándo un precio cuenta como distinto— para probarlo sin montar React.
//
// CONTRATO
//   PROMETE: sumar SOLO las celdas que siguen en la tabla (una celda quitada no se crea: su número no cuenta), y dar
//            los textos de la leyenda con un ejemplo de la MISMA prenda que se está cargando.
//   ASUME:   las claves de celda son las de `construirCeldas` (`lib/alta-producto.ts`); la base valida de nuevo al crear.
//   NO HACE: no guarda nada ni decide qué se manda a la RPC: eso sigue en `NuevoProductoForm`.

import { leerCantidad, limpiarCantidad, type CeldaAlta } from "./alta-producto";

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
  return Number.isFinite(n) && n > 0 ? `S/ ${n.toFixed(2)}` : "el precio de venta";
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
