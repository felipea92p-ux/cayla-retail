// «¿En qué prendas?» de la hoja de una oferta (Felipe 2026-11-18): lo primero es agregar una prenda leyendo su etiqueta —con la pistola o con
// la cámara del teléfono— y, después, escribiendo su nombre. Aquí vive lo que no necesita la base: reconocer el código de una prenda que ya
// está en la pantalla y sugerir modelos por lo escrito. Lógica pura: la hoja solo la dibuja. No decide qué entra a la oferta (eso sigue en
// `alternarProducto` de la hoja y en la base).

/** Un modelo que la oferta puede elegir entero (todas sus tallas y colores). */
export type ModeloDeOferta = {
  id: string;
  nombre: string;
  categoriaId: string | null;
  precio: number;
  deClaure: boolean;
};

/** Para comparar sin tildes ni mayúsculas, como los combos (ADR-0209). */
const clave = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** El código que una prenda lleva entre paréntesis al final de su nombre: «Falda Emma (FAL-0008-NEG-M)» → «FAL-0008-NEG-M». */
export function codigoDelNombre(nombre: string): string | null {
  const m = /\(([^()]+)\)\s*$/.exec(nombre);
  return m ? m[1].trim() : null;
}

/**
 * El modelo de la prenda cuyo código es exactamente lo leído, entre las prendas a la venta que la hoja ya tiene. Responde al instante, sin
 * ir a la base; lo que no se reconoce aquí (el código de fábrica, una etiqueta vieja) lo busca la base. `null` si ninguna lo lleva.
 */
export function productoDeCodigo(prendas: readonly { nombre: string; productoId?: string }[], leido: string): string | null {
  const buscado = clave(leido);
  if (buscado.length < 2) return null;
  for (const p of prendas) {
    if (!p.productoId) continue;
    const codigo = codigoDelNombre(p.nombre);
    if (codigo && clave(codigo) === buscado) return p.productoId;
  }
  return null;
}

/**
 * Los modelos que coinciden con lo escrito, por su nombre o por su categoría; primero los que EMPIEZAN con lo escrito («pantalón» → Pantalón
 * Carla antes que Conjunto Chaleco y Pantalón) y, dentro de cada grupo, por nombre. Con menos de dos letras no sugiere nada.
 */
export function sugerirModelos<M extends ModeloDeOferta>(modelos: readonly M[], escrito: string, nombreCategoria: (id: string) => string, max = 6): M[] {
  const q = clave(escrito);
  if (q.length < 2) return [];
  const empiezan: M[] = [];
  const contienen: M[] = [];
  for (const m of modelos) {
    const nombre = clave(m.nombre);
    if (nombre.startsWith(q)) empiezan.push(m);
    else if (nombre.includes(q) || (m.categoriaId !== null && clave(nombreCategoria(m.categoriaId)).includes(q))) contienen.push(m);
  }
  const porNombre = (a: M, b: M) => a.nombre.localeCompare(b.nombre, "es");
  return [...empiezan.sort(porNombre), ...contienen.sort(porNombre)].slice(0, max);
}

/**
 * Varios nombres en una línea que no crece: los primeros y cuántos más («Camisas y Blusas, Casacas, Faldas y 39 más»). Con 42 categorías
 * elegidas, una ficha por cada una llenaba la hoja (Felipe 2026-11-18: «cuando hay muchas cosas se ve totalmente desordenado»). Vacío si no hay.
 */
export function resumirNombres(nombres: readonly string[], max = 3): string {
  if (nombres.length === 0) return "";
  if (nombres.length <= max) return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return `${nombres.slice(0, max).join(", ")} y ${nombres.length - max} más`;
}
