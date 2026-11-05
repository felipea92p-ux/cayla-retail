// Los números que se tocan sobre una línea (`<Linea marcas>`) cuando varias caen casi en el mismo punto: seis compras en dos días son seis
// números encimados que nadie puede leer ni tocar. Lógica pura: dónde se DIBUJA cada número y a cuáles les cabe su texto.
//
// CONTRATO
//   PROMETE: cada número queda a `minimo` px o más del vecino (si el ancho alcanza; si no, repartidos parejo), en el mismo orden, lo más cerca
//            posible de su lugar real (mínimos cuadrados) y dentro de [lo, hi]. Los que ya estaban separados no se mueven.
//   NO HACE: no mueve el escalón de la línea (el dato sigue donde cayó): solo el número, unido a su punto con un hilo.

/**
 * Las posiciones donde dibujar los números. `xs` son sus lugares reales (px), en cualquier orden; devuelve las posiciones en el MISMO orden
 * que `xs`. Mínimos cuadrados con separación mínima: el problema se vuelve «una secuencia que no baja» restando i × minimo, y eso lo resuelve
 * la regresión isotónica (juntar los bloques que se pisan y llevarlos a su promedio).
 */
export function separarMarcas(xs: readonly number[], minimo: number, lo: number, hi: number): number[] {
  const n = xs.length;
  if (n === 0) return [];
  const orden = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
  // Si no cabe a `minimo`, se reparte parejo en vez de salirse del gráfico.
  const sep = n > 1 ? Math.min(minimo, Math.max(0, (hi - lo) / (n - 1))) : 0;
  // q_i = x_i − i·sep debe ser no decreciente; los bloques que lo violan se promedian (PAVA).
  const bloques: { suma: number; n: number }[] = [];
  orden.forEach((idx, k) => {
    bloques.push({ suma: xs[idx]! - k * sep, n: 1 });
    while (bloques.length > 1 && bloques[bloques.length - 2]!.suma / bloques[bloques.length - 2]!.n > bloques[bloques.length - 1]!.suma / bloques[bloques.length - 1]!.n) {
      const b = bloques.pop()!;
      const a = bloques[bloques.length - 1]!;
      a.suma += b.suma;
      a.n += b.n;
    }
  });
  const q: number[] = bloques.flatMap((b) => Array<number>(b.n).fill(b.suma / b.n));
  const tope = hi - (n - 1) * sep;
  const salida = Array<number>(n).fill(0);
  orden.forEach((idx, k) => {
    salida[idx] = Math.min(Math.max(q[k]!, lo), Math.max(lo, tope)) + k * sep;
  });
  return salida;
}

/** Cuánto ocupa de ancho el texto de una marca («↑ subió S/ 1.61»), a 11,5 px: una cuenta gruesa, suficiente para decidir si cabe. */
export const anchoDeTexto = (texto: string): number => texto.length * 6.4 + 8;

/**
 * A cuáles de los números les cabe su texto sin pisar el del vecino. `posiciones` en px y `textos` en el mismo orden. El texto de un número
 * apretado no se dibuja (lo dicen la tabla de abajo, el título al pasar el mouse y el lector de pantalla); el elegido se dibuja siempre.
 */
export function textosQueCaben(posiciones: readonly number[], textos: readonly string[]): boolean[] {
  const orden = posiciones.map((_, i) => i).sort((a, b) => posiciones[a]! - posiciones[b]!);
  const cabe = Array<boolean>(posiciones.length).fill(true);
  for (let k = 1; k < orden.length; k++) {
    const a = orden[k - 1]!, b = orden[k]!;
    if (posiciones[b]! - posiciones[a]! < (anchoDeTexto(textos[a]!) + anchoDeTexto(textos[b]!)) / 2) {
      cabe[a] = false;
      cabe[b] = false;
    }
  }
  return cabe;
}

/** El radio del blanco que se toca: el de siempre, o menos si el vecino queda cerca (dos blancos encimados se roban el toque). */
export function radioDeToque(posiciones: readonly number[], i: number, normal = 20): number {
  let cerca = Infinity;
  posiciones.forEach((p, j) => {
    if (j !== i) cerca = Math.min(cerca, Math.abs(p - posiciones[i]!));
  });
  return Math.max(12, Math.min(normal, cerca / 2));
}
