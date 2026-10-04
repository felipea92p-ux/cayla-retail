/**
 * La capacidad del piso de una sede (ADR-0329): cuántas prendas caben colgadas = m² de sala × prendas por m². En Existencias es la
 * nota «de 600» junto a «Colgadas en el piso» (ADR-0331): sin ella, «138 colgadas» no dice si el piso está lleno o medio vacío.
 *
 * PROMETE: leer la fila de `fn_capacidad_piso` sin confiar en su forma (lo que no sirve es «sin capacidad», nunca un número
 * inventado) y decir la nota y la explicación de la cifra, o nada. Mientras la sede no haya cuadrado su piso, la nota lo dice
 * («por cuadrar», ADR-0328): no saber si se cuadró cuenta como no cuadrado.
 * ASUME: la lectura la hace el servidor (`capacidad-piso-servidor.ts`) y la página la pone solo en «Colgadas en el piso», que existe
 * solo donde la sede separa piso y almacén: el Taller y una sede sin m² no llevan nota.
 */

export type CapacidadPiso = {
  m2Sala: number;
  /** Prendas colgadas por m² de sala. */
  densidad: number;
  /** Prendas que caben colgadas: m² × densidad, sin decimales (la calcula la base). */
  capacidad: number;
  /** La sede todavía no contó sus prendas: la densidad es prestada de TRU (30 por m²). */
  provisional: boolean;
  /**
   * El último cuadre del piso de la sede (ADR-0328, decisión 4; lo guarda la actividad 3). Null = «por cuadrar»: el sistema puede
   * tener como guardadas prendas que ya cuelgan, así que el número de colgadas todavía no es confiable (TRU: 138 contra 600–750).
   */
  cuadradoEn: string | null;
};

/** La fila de `fn_capacidad_piso` (un arreglo de 0 o 1 filas por PostgREST). Null si no hay fila o si no tiene la forma esperada. */
export function leerCapacidadPiso(datos: unknown): CapacidadPiso | null {
  const fila: unknown = Array.isArray(datos) ? datos[0] : datos;
  if (fila === null || typeof fila !== "object") return null;
  const f = fila as Record<string, unknown>;
  const m2Sala = Number(f.m2_sala);
  const densidad = Number(f.densidad);
  const capacidad = Number(f.capacidad);
  if (!(m2Sala > 0) || !(densidad > 0) || !Number.isInteger(capacidad) || capacidad < 1) return null;
  if (typeof f.provisional !== "boolean") return null;
  // Lo que no es una fecha (falta la columna, llega vacía o rara) se lee como «por cuadrar»: del lado seguro, nunca un piso que
  // parece cuadrado sin estarlo (la misma regla que el motor del piso, PR #787).
  const cuadradoEn = typeof f.cuadrado_en === "string" && !Number.isNaN(Date.parse(f.cuadrado_en)) ? f.cuadrado_en : null;
  return { m2Sala, densidad, capacidad, provisional: f.provisional, cuadradoEn };
}

/**
 * La nota de la cifra «Colgadas en el piso»: «de 600», «de 1800 (provisional)» si la sede no se ha contado, y « · por cuadrar»
 * mientras la sede no haya cuadrado su piso (ADR-0328: «583 de 600» con la marca «por cuadrar»). Sin separador de miles, como el
 * número grande de al lado (`CifraAnimada`), y como pide la RAE para cuatro cifras.
 */
export function notaCapacidadPiso(capacidad: CapacidadPiso | null): string | undefined {
  if (!capacidad) return undefined;
  const de = `de ${capacidad.capacidad}${capacidad.provisional ? " (provisional)" : ""}`;
  return capacidad.cuadradoEn ? de : `${de} · por cuadrar`;
}

// Sin separador de miles, como la nota y la cifra; con punto decimal, como los precios de la tienda («12.5 m²»).
const decimal = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2, useGrouping: false });

/** De dónde sale la nota, para el texto al pasar el mouse sobre la cifra. */
export function explicarCapacidadPiso(capacidad: CapacidadPiso | null): string | undefined {
  if (!capacidad) return undefined;
  const partes = [`Caben unas ${capacidad.capacidad} prendas colgadas: ${decimal(capacidad.m2Sala)} m² de sala × ${decimal(capacidad.densidad)} por m².`];
  if (capacidad.provisional) partes.push("Provisional: esta sede todavía no contó las prendas de su piso.");
  if (!capacidad.cuadradoEn) {
    partes.push("Por cuadrar: el piso de esta sede todavía no se cuadró, y el sistema puede tener como guardadas prendas que ya cuelgan.");
  }
  return partes.join(" ");
}
