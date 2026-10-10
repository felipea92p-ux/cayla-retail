/**
 * La parte VISUAL de la propuesta del mix (ADR-0329): los colores de cada grupo, cuántos ganchos dibuja cada riel y la escala de la mancuerna.
 * Lógica pura y sin React, para probar sin pintar nada: lo que se ve en pantalla no puede decir otra cosa que lo que dicen las cifras.
 *
 * Los colores salen SOLO de los tokens de la guía «CAYLA Dynamic» (`app/globals.css`, nunca un hex suelto) y sin el rojo: es «acento sagrado,
 * máximo 2 por pantalla» y aquí pintaría un grupo como si fuera una alerta. Un grupo ocupa el mismo color en TODA la pantalla (se asigna por su
 * posición en la lista de grupos del riel).
 */

/** Los tokens de color de los grupos del riel, en orden. Con más de seis grupos se vuelven a usar. */
export const TOKENS_DE_GRUPO = ["tinta", "pizarra", "verde", "ambar", "taupe", "sand"] as const;
export type TokenDeGrupo = (typeof TOKENS_DE_GRUPO)[number];

/** El mismo color como clases de Tailwind (fondo y el texto que contrasta encima), escritas completas para que el generador las encuentre. */
export const FONDOS_DE_GRUPO: readonly string[] = ["bg-tinta text-crema", "bg-pizarra text-crema", "bg-verde text-crema", "bg-ambar text-crema", "bg-taupe text-crema", "bg-sand text-tinta"];

export const tokenDeGrupo = (indice: number): TokenDeGrupo => TOKENS_DE_GRUPO[((indice % TOKENS_DE_GRUPO.length) + TOKENS_DE_GRUPO.length) % TOKENS_DE_GRUPO.length]!;
export const fondoDeGrupo = (indice: number): string => FONDOS_DE_GRUPO[((indice % FONDOS_DE_GRUPO.length) + FONDOS_DE_GRUPO.length) % FONDOS_DE_GRUPO.length]!;

export type Ganchos = {
  /** Una entrada por gancho de la capacidad: el índice del grupo que lo ocupa, o -1 si está libre. */
  ganchos: number[];
  /** Cuántos ganchos están ocupados. */
  ocupados: number;
  /** Prendas que no caben porque ya no queda gancho (más prendas que capacidad). */
  deMas: number;
};

/**
 * Reparte los ganchos del riel entre los grupos, en el orden de la lista y de a bloques (como se cuelga: un grupo junto). Lo que sobra de la
 * capacidad queda libre; lo que no cabe no se dibuja, se cuenta aparte (`deMas`): el riel nunca muestra más ganchos que su capacidad.
 */
export function asignarGanchos(prendasPorGrupo: readonly number[], capacidad: number): Ganchos {
  const total = Math.max(0, Math.floor(capacidad));
  const ganchos: number[] = new Array<number>(total).fill(-1);
  let siguiente = 0;
  let deMas = 0;
  prendasPorGrupo.forEach((n, grupo) => {
    const prendas = Math.max(0, Math.floor(n));
    const caben = Math.min(prendas, total - siguiente);
    for (let i = 0; i < caben; i++) ganchos[siguiente + i] = grupo;
    siguiente += caben;
    deMas += prendas - caben;
  });
  return { ganchos, ocupados: siguiente, deMas };
}

export type Cuadricula = { columnas: number; filas: number; ancho: number; alto: number };

/** Ancho que se le da a cada gancho, y el mínimo cuando hay tantos que no entran en pocas filas. */
const ANCHO_DE_GANCHO = 14;
const FILAS_MAXIMAS = 24;
const ALTO_SOBRE_ANCHO = 1.5;

/** Cómo se acomodan `n` ganchos en un riel de `anchoPx`: tantas columnas como entren a un ancho cómodo y, si eso pasa de 24 filas (AQP, 1.800), más
 *  columnas con ganchos más angostos. Nunca menos de 12 columnas ni más filas de las que la cuenta pide. */
export function cuadriculaDelRiel(n: number, anchoPx: number): Cuadricula {
  const ancho = Math.max(100, Math.floor(anchoPx));
  const total = Math.max(1, Math.floor(n));
  let columnas = Math.max(12, Math.floor(ancho / ANCHO_DE_GANCHO));
  if (Math.ceil(total / columnas) > FILAS_MAXIMAS) columnas = Math.ceil(total / FILAS_MAXIMAS);
  const filas = Math.ceil(total / columnas);
  const celda = ancho / columnas;
  return { columnas, filas, ancho, alto: Math.ceil(filas * celda * ALTO_SOBRE_ANCHO) + 6 };
}

/** El máximo del eje de la mancuerna: el mayor valor redondeado hacia arriba a un múltiplo de 10, entre 20 y 100. Sin valores, 20. */
export function escalaDeMancuerna(valores: readonly (number | null | undefined)[]): number {
  const mayor = valores.reduce<number>((m, v) => (typeof v === "number" && Number.isFinite(v) && v > m ? v : m), 0);
  return Math.min(100, Math.max(20, Math.ceil(mayor / 10) * 10));
}

/** La posición de un valor en el eje, de 0 a 100 %. Lo que se sale del eje queda en el borde, no fuera de la tarjeta. */
export function posicionEnEscala(valor: number, maximo: number): number {
  if (!(maximo > 0) || !Number.isFinite(valor)) return 0;
  return Math.min(100, Math.max(0, (valor / maximo) * 100));
}
