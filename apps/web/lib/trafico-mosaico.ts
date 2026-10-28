// Tienda web ▸ Tráfico (ADR-0495, actividad 5): el mosaico de «La vitrina, por miradas». Cada prenda es una baldosa cuya ÁREA es lo que
// la miraron, lo más cuadrada posible (squarified: Bruls, Huizing y van Wijk, 2000), para que la más mirada se vea grande sin leer
// números. Puro, sin React: se prueba en `trafico-mosaico.test.ts`.

export type Baldosa = { x: number; y: number; w: number; h: number };

/**
 * Reparte el rectángulo `ancho × alto` en baldosas de área proporcional a `valores`, en el mismo orden (de mayor a menor da las más
 * cuadradas). Los valores en 0 o negativos dan una baldosa vacía en su lugar, para que el índice siga siendo el de la prenda.
 * Cada fila se va colocando contra el lado corto de lo que queda, mientras agregar otra baldosa no empeore la peor proporción.
 */
export function squarify(valores: readonly number[], ancho: number, alto: number): Baldosa[] {
  const positivos = valores.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = positivos.reduce((a, b) => a + b, 0);
  const salida: Baldosa[] = valores.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  if (!total || ancho <= 0 || alto <= 0) return salida;
  const areas = positivos.map((v, i) => ({ i, a: (v / total) * ancho * alto })).filter((x) => x.a > 0);

  let rx = 0;
  let ry = 0;
  let rw = ancho;
  let rh = alto;
  const suma = (f: { a: number }[]) => f.reduce((s, x) => s + x.a, 0);
  // La peor proporción (lado largo / lado corto) de una fila puesta contra un lado de largo `lado`.
  const peor = (f: { a: number }[], lado: number) => {
    const s = suma(f);
    let max = 0;
    let min = Infinity;
    for (const x of f) {
      if (x.a > max) max = x.a;
      if (x.a < min) min = x.a;
    }
    return Math.max((lado * lado * max) / (s * s), (s * s) / (lado * lado * min));
  };
  const colocar = (f: { i: number; a: number }[]) => {
    const s = suma(f);
    if (rw >= rh) {
      const w = s / rh;
      let y = ry;
      for (const x of f) {
        const h = x.a / w;
        salida[x.i] = { x: rx, y, w, h };
        y += h;
      }
      rx += w;
      rw -= w;
    } else {
      const h = s / rw;
      let xx = rx;
      for (const x of f) {
        const w = x.a / h;
        salida[x.i] = { x: xx, y: ry, w, h };
        xx += w;
      }
      ry += h;
      rh -= h;
    }
  };

  let fila: { i: number; a: number }[] = [];
  let k = 0;
  while (k < areas.length) {
    const lado = Math.min(rw, rh);
    if (!fila.length || peor([...fila, areas[k]], lado) <= peor(fila, lado)) {
      fila.push(areas[k]);
      k++;
    } else {
      colocar(fila);
      fila = [];
    }
  }
  if (fila.length) colocar(fila);
  return salida;
}

/** Cuánta etiqueta le cabe a una baldosa (ya descontado el hueco entre baldosas): nombre y cifra, solo la cifra, o nada. */
export function etiquetaQueCabe(w: number, h: number): "grande" | "media" | "chica" | "nada" {
  if (w >= 150 && h >= 96) return "grande";
  // «12 personas» y su ojal piden ~104 px: más angosta, la cifra se cortaba.
  if (w >= 104 && h >= 58) return "media";
  if (w >= 40 && h >= 30) return "chica";
  return "nada";
}

/**
 * El ícono de la categoría solo entra si la baldosa tiene al menos 64 px de lado corto (más chico tapa los colores) y si no choca con la
 * etiqueta: con nombre y cifra, la baldosa tiene que tener 96 px de alto; con solo la cifra, alcanza.
 */
export const conIcono = (w: number, h: number) => Math.min(w, h) >= 64 && (h >= 96 || etiquetaQueCabe(w, h) === "chica");

export type Franja = { hex: string; nombre: string; peso: number };

/**
 * Las franjas de color de una baldosa: los colores que eligieron, del más elegido al menos, con un piso del 4 % para que un color
 * elegido una vez se vea. Si nadie eligió color todavía, los colores de la prenda en el catálogo, todos iguales. Sin ninguno, nada
 * (la baldosa toma el tono de su familia).
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

/** Con más prendas que esto, las que siguen se juntan en una sola baldosa «y N prendas más» (la lista completa va en la tabla). */
export const BALDOSAS_A_LA_VISTA = 24;
