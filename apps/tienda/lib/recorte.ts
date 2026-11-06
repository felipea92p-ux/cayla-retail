// Recortar una prenda de su foto (ADR-0613): las fotos son prendas sobre blanco, y la portada las pone sobre color. Lógica pura, sobre los
// puntos RGBA de la foto: la usa `app/api/recorte/[archivo]/route.ts`, que guarda el resultado para que no se repita.

/** Los anchos que se preparan: uno para el celular y otro para la computadora. Pocos, porque cada uno se calcula y se guarda aparte. */
export const ANCHOS_DE_RECORTE = [640, 1000] as const;

/** Un recorte se guarda un año por su dirección: si cambia cómo se recorta, se sube este número para que se vuelva a calcular. */
const VERSION_DEL_RECORTE = 2;

const CARPETA_DE_FOTOS = "/storage/v1/object/public/retail-productos-fotos/fotos/";
const NOMBRE_DE_FOTO = /^[0-9a-f-]{36}\.(?:png|jpe?g|webp)$/i;

/** ¿Es el nombre de una foto de prenda? Es lo único que la ruta acepta: nada de carpetas ni de otras direcciones. */
export const esNombreDeFoto = (archivo: string): boolean => NOMBRE_DE_FOTO.test(archivo);

/** La dirección de la foto original en el almacén. */
export const urlDeFotoOriginal = (origen: string, archivo: string): string => `${origen.replace(/\/$/, "")}${CARPETA_DE_FOTOS}${archivo}`;

/** La dirección del recorte de una foto, o `null` si la foto no es del almacén (entonces se muestra tal cual). */
export function urlDeRecorte(foto: string, ancho: (typeof ANCHOS_DE_RECORTE)[number]): string | null {
  const i = foto.indexOf(CARPETA_DE_FOTOS);
  if (i < 0) return null;
  const archivo = foto.slice(i + CARPETA_DE_FOTOS.length);
  return esNombreDeFoto(archivo) ? `/api/recorte/${archivo}?w=${ancho}&v=${VERSION_DEL_RECORTE}` : null;
}

export type CajaDePrenda = { izquierda: number; arriba: number; ancho: number; alto: number };

/** Menos de esta parte de la foto como prenda: no se encontró una prenda (toda blanca, por ejemplo), y la foto no se recorta. */
const PARTE_MINIMA = 0.03;
/** Una fila o columna cuenta si tiene estos puntos de prenda: una mota suelta no agranda la caja. */
const PUNTOS_POR_LINEA = 6;

/**
 * Vuelve transparente el fondo de la foto, deja su gris como sombra de verdad y quita el halo blanco de la orilla. Cambia `puntos` en su
 * lugar y devuelve la caja de la prenda, o `null` si no encontró una: una prenda blanca sobre fondo blanco se confunde con él, y es mejor
 * mostrar la foto tal cual que una prenda comida. El fondo se busca desde los bordes, más los huecos blancos encerrados (la abertura de un
 * cuello, entre el brazo y el cuerpo).
 */
export function recortarFondo(puntos: Uint8Array | Uint8ClampedArray, ancho: number, alto: number): CajaDePrenda | null {
  const total = ancho * alto;
  const fondo = new Uint8Array(total);
  // Algunas fotos no tienen el fondo blanco sino crema o gris: se mira el color de las esquinas, si son claras y coinciden entre sí.
  const esquinas = [0, ancho - 1, (alto - 1) * ancho, total - 1].map((i) => [puntos[i * 4], puntos[i * 4 + 1], puntos[i * 4 + 2]]);
  const base = [0, 1, 2].map((c) => esquinas.reduce((suma, e) => suma + e[c], 0) / 4);
  const fondoClaro = Math.min(...base) >= 190 && esquinas.every((e) => e.every((v, c) => Math.abs(v - base[c]) <= 10));
  const esFondo = (i: number) => {
    const p = i * 4;
    if (puntos[p + 3] < 16) return true;
    const r = puntos[p];
    const g = puntos[p + 1];
    const b = puntos[p + 2];
    if (fondoClaro && Math.abs(r - base[0]) <= 14 && Math.abs(g - base[1]) <= 14 && Math.abs(b - base[2]) <= 14) return true;
    const menor = Math.min(r, g, b);
    const dif = Math.max(r, g, b) - menor;
    return (menor >= 168 && dif <= 14) || (menor >= 225 && dif <= 24);
  };
  const pila = new Int32Array(total);
  let tope = 0;
  const mete = (i: number) => {
    if (!fondo[i] && esFondo(i)) {
      fondo[i] = 1;
      pila[tope++] = i;
    }
  };
  for (let x = 0; x < ancho; x++) {
    mete(x);
    mete((alto - 1) * ancho + x);
  }
  for (let y = 0; y < alto; y++) {
    mete(y * ancho);
    mete(y * ancho + ancho - 1);
  }
  while (tope > 0) {
    const i = pila[--tope];
    const x = i % ancho;
    if (x > 0) mete(i - 1);
    if (x < ancho - 1) mete(i + 1);
    if (i >= ancho) mete(i - ancho);
    if (i < ancho * (alto - 1)) mete(i + ancho);
  }

  // Los huecos blancos encerrados, solo si son grandes: un brillo en una tela satinada no es un hueco.
  const muyBlanco = (i: number) => puntos[i * 4 + 3] >= 16 && Math.min(puntos[i * 4], puntos[i * 4 + 1], puntos[i * 4 + 2]) >= 240;
  const visto = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (fondo[i] || visto[i] || !muyBlanco(i)) continue;
    let n = 0;
    visto[i] = 1;
    pila[n++] = i;
    for (let q = 0; q < n; q++) {
      const k = pila[q];
      const x = k % ancho;
      for (const v of [x > 0 ? k - 1 : -1, x < ancho - 1 ? k + 1 : -1, k >= ancho ? k - ancho : -1, k < ancho * (alto - 1) ? k + ancho : -1]) {
        if (v >= 0 && !visto[v] && !fondo[v] && muyBlanco(v)) {
          visto[v] = 1;
          pila[n++] = v;
        }
      }
    }
    if (n >= 350) for (let q = 0; q < n; q++) fondo[pila[q]] = 1;
  }

  let prenda = 0;
  const porFila = new Uint32Array(alto);
  const porColumna = new Uint32Array(ancho);
  for (let i = 0; i < total; i++) {
    if (fondo[i]) continue;
    prenda++;
    porFila[Math.floor(i / ancho)]++;
    porColumna[i % ancho]++;
  }
  if (prenda / total < PARTE_MINIMA) return null;

  // El fondo se vuelve transparente y su gris queda como sombra negra: funciona sobre cualquier color.
  const luzDelFondo = fondoClaro ? (base[0] + base[1] + base[2]) / 3 : 255;
  for (let i = 0; i < total; i++) {
    if (!fondo[i]) continue;
    const p = i * 4;
    if (puntos[p + 3] < 16) {
      puntos[p + 3] = 0;
      continue;
    }
    const luz = (puntos[p] + puntos[p + 1] + puntos[p + 2]) / 3;
    puntos[p] = puntos[p + 1] = puntos[p + 2] = 0;
    // La sombra se mide contra el color del fondo: el crema de una foto no es una sombra.
    puntos[p + 3] = luz >= luzDelFondo - 9 ? 0 : Math.min(90, (luzDelFondo - luz) * 0.8);
  }
  // La orilla: un punto de prenda junto al fondo trae mezclado el blanco de la foto.
  for (let i = 0; i < total; i++) {
    if (fondo[i]) continue;
    const x = i % ancho;
    if (!((x > 0 && fondo[i - 1]) || (x < ancho - 1 && fondo[i + 1]) || (i >= ancho && fondo[i - ancho]) || (i < ancho * (alto - 1) && fondo[i + ancho]))) continue;
    const p = i * 4;
    const t = Math.max(0.25, Math.min(1, (255 - Math.min(puntos[p], puntos[p + 1], puntos[p + 2])) / 110));
    for (let c = 0; c < 3; c++) puntos[p + c] = Math.max(0, Math.min(255, (puntos[p + c] - (1 - t) * 255) / t));
    puntos[p + 3] = Math.min(puntos[p + 3], t * 255);
  }

  const lineas = (cuentas: Uint32Array) => {
    let primera = -1;
    let ultima = -1;
    cuentas.forEach((n, i) => {
      if (n >= PUNTOS_POR_LINEA) {
        if (primera < 0) primera = i;
        ultima = i;
      }
    });
    return [primera, ultima] as const;
  };
  const [arriba, abajo] = lineas(porFila);
  const [izquierda, derecha] = lineas(porColumna);
  if (arriba < 0 || izquierda < 0) return null;
  // Un poco de aire alrededor y más abajo, donde cae la sombra.
  const aire = Math.round(ancho * 0.012);
  const x0 = Math.max(0, izquierda - aire);
  const y0 = Math.max(0, arriba - aire);
  const x1 = Math.min(ancho, derecha + aire + 1);
  const y1 = Math.min(alto, abajo + Math.round(alto * 0.03) + 1);
  return { izquierda: x0, arriba: y0, ancho: x1 - x0, alto: y1 - y0 };
}
