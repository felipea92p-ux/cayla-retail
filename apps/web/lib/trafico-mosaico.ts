// Tienda web ▸ Tráfico (ADR-0495): los colores que eligió la gente para una prenda, en franjas (la miniatura de la tabla y el cajón).
// Nació para la vitrina de baldosas (actividad 5 de la maqueta C), que se fue en la actividad 6 del Observatorio; quedan las franjas.
// Puro, sin React: se prueba en `trafico-mosaico.test.ts`.

export type Franja = { hex: string; nombre: string; peso: number };

/**
 * Las franjas de color de una prenda: los colores que eligieron, del más elegido al menos, con un piso del 4 % para que un color
 * elegido una vez se vea. Si nadie eligió color todavía, los colores de la prenda en el catálogo, todos iguales. Sin ninguno, nada
 * (la miniatura toma el ícono de su categoría).
 */
export function franjasDe(elegidos: readonly { hex: string | null; nombre: string; n: number }[], catalogo: readonly { hex: string | null; nombre: string }[]): Franja[] {
  const con = elegidos.filter((c): c is { hex: string; nombre: string; n: number } => !!c.hex && c.n > 0);
  if (con.length) {
    const total = con.reduce((a, c) => a + c.n, 0);
    return [...con].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es")).map((c) => ({ hex: c.hex, nombre: c.nombre, peso: Math.max(c.n, total * 0.04) }));
  }
  return catalogo
    .filter((c): c is { hex: string; nombre: string } => !!c.hex)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((c) => ({ hex: c.hex, nombre: c.nombre, peso: 1 }));
}
