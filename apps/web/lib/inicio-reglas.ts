// Reglas puras de la pantalla Inicio (sin base de datos: se prueban solas).
// Las lecturas viven en `lib/inicio.ts`.

/** Suma las unidades de las filas de `stock` de una sede. `null` = la lectura falló: no es
 *  «0 unidades», es «no sé», y la pantalla lo dice con «—» en vez de una cifra que parezca
 *  normalidad. */
export function sumarUnidades(filas: { cantidad: number }[] | null): number | null {
  if (filas === null) return null;
  return filas.reduce((acc, f) => acc + f.cantidad, 0);
}

/** Lo que se pinta en una tarjeta: la cifra, o «—» si no se pudo leer. */
export function textoCifra(n: number | null): string {
  return n === null ? "—" : String(n);
}

/** Las tarjetas comparten una sola línea de aviso: muestra la primera que falló. */
export function primerAviso(avisos: (string | null)[]): string | null {
  return avisos.find((a): a is string => a !== null) ?? null;
}
