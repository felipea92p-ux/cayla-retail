// Estados financieros ▸ el informe (camino «A · El informe», elegido por Felipe el 2026-11-06; maqueta `docs/maquetas/estados-financieros-2026-11-rediseno/`).
// Cada estado se lee como lo leería un contador: una fila por concepto, de arriba abajo, con sus subtotales y su total, la columna de ahora y las de antes,
// y cuánto pesa cada fila contra la de referencia (lo vendido, lo que tienes). Aquí solo la forma: quién llena cada fila vive en la regla de su estado.
//
// PROMETE: las filas no calculan plata; reciben las cifras de la base y las ordenan. Un valor que no se pudo leer es `null` y se dibuja «—», nunca un cero.

import type { FilaDeParte } from "./estados-partes";

/** `seccion`: el título de un bloque (Activo, Pasivo, Patrimonio); no lleva cifras. */
export type TipoFilaInforme = "seccion" | "linea" | "subtotal" | "total";

export type FilaInforme = {
  clave: string;
  /** El nombre de tienda: «Lo que vendiste», «Mercadería». */
  nombre: string;
  /** El nombre del contador: «Ventas netas», «Costo de ventas». */
  contable: string;
  tipo: TipoFilaInforme;
  /** Resta del total: se escribe «−» delante del nombre. */
  resta?: boolean;
  /** Un valor por columna, en el orden de `columnas`. */
  valores: readonly (number | null)[];
  /** «46 %»: lo que pesa la columna de ahora contra la fila de referencia. */
  peso?: string | null;
  /** La columna de ahora en rojo (una pérdida) o en verde. */
  tono?: "bien" | "mal" | null;
  /** Qué es, en una frase: se lee al abrir la fila. */
  que?: string;
  /** Lo que la compone: se lee al abrir la fila. */
  detalle?: readonly FilaDeParte[];
  /** Lo que hay que saber de esta fila, en una línea. */
  aviso?: string | null;
};

export type ColumnaInforme = { etiqueta: string; actual: boolean };

export type Informe = {
  /** «Ganancias y pérdidas». */
  titulo: string;
  columnas: readonly ColumnaInforme[];
  /** «% de lo vendido». */
  pesoDe: string | null;
  /** La clave de la fila que es el 100 % de los pesos («ventas»). Si está, las barritas se miden contra ella y una fila sin peso no lleva barra. */
  referencia?: string;
  filas: readonly FilaInforme[];
};

/** Una fila se puede abrir si tiene algo que decir además de su cifra. */
export const seAbre = (f: FilaInforme): boolean => !!(f.que || f.aviso || (f.detalle && f.detalle.length));

/** Las filas en bloques, uno por sección, para que cada título gobierne las suyas (`<tbody>`, `scope="rowgroup"`). Sin secciones, un solo bloque. */
export function bloquesDelInforme(filas: readonly FilaInforme[]): FilaInforme[][] {
  const bloques: FilaInforme[][] = [];
  for (const f of filas) {
    if (f.tipo === "seccion" || !bloques.length) bloques.push([f]);
    else bloques.at(-1)!.push(f);
  }
  return bloques;
}

/** «46 %» contra la referencia; sin referencia (o con referencia en cero o negativa), nada. */
export function pesoContra(valor: number, referencia: number): string | null {
  if (!(referencia > 0)) return null;
  return `${Math.round((Math.abs(valor) / referencia) * 100)} %`;
}

/**
 * La barrita de una fila, en la columna de ahora, de 0 a 100. Sin referencia, contra la mayor del informe. Con referencia (Ganancias: «Lo que vendiste»), contra
 * ella, para que la barra diga lo mismo que su peso escrito aunque arriba haya una fila mayor («Cobraste», con IGV); y una fila sin peso no lleva barra (`null`).
 */
export function anchoEnElInforme(fila: FilaInforme, filas: readonly FilaInforme[], referencia?: string): number | null {
  const actual = (f: FilaInforme) => Math.abs(f.valores.at(-1) ?? 0);
  const ref = referencia ? filas.find((f) => f.clave === referencia) : undefined;
  if (ref && actual(ref) > 0) {
    if (!fila.peso) return null;
    return Math.min(100, (actual(fila) / actual(ref)) * 100);
  }
  const tope = Math.max(...filas.map(actual), 1);
  return (actual(fila) / tope) * 100;
}
