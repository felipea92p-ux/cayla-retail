import { cajaDe, colorDeLaPieza, presentes, tamanoEnLaFigura, ZONAS, type FotoDelColor, type Look, type PrendaDelProbador, type Zona } from "./probador";

// Qué fotos necesita la figura para dibujar un outfit y cuáles le faltan (Felipe, 2026-11-16: al cambiar de prenda no había señal de carga).
// La figura no cambia de prenda hasta tener su foto: aquí está la parte pura de esa espera; el estado vive en `useFotosDeLaFigura`.

/** Una foto tal como la pide la figura: de qué zona es, su recorte y el tamaño con que se pide (el mismo si está puesta, asomando o precargándose). */
export type FotoPedida = { z: Zona; url: string; foto: FotoDelColor; tamanos: string };

/** Las fotos de un outfit a tamaño de figura, de arriba abajo. Una prenda que ya no está en el catálogo no pide nada. */
export function fotosDelLook(look: Look, indice: ReadonlyMap<string, PrendaDelProbador>): FotoPedida[] {
  return presentes(look).flatMap((z) => {
    const pieza = look[z]!;
    const p = indice.get(pieza.id);
    if (!p) return [];
    const foto = colorDeLaPieza(p, pieza).foto;
    return [{ z, url: foto.url, foto, tamanos: tamanoEnLaFigura(cajaDe(z, p.largo, foto.proporcion)) }];
  });
}

/** Las fotos que todavía hay que bajar: las pedidas que no están listas, una vez cada una. */
export function queEspera<T extends { url: string }>(fotos: readonly T[], listas: ReadonlySet<string>): T[] {
  const vistas = new Set<string>();
  return fotos.filter((f) => {
    if (listas.has(f.url) || vistas.has(f.url)) return false;
    vistas.add(f.url);
    return true;
  });
}

/**
 * Las fotos cuya medida necesita la unión de un outfit (ADR-0449): la de arriba siempre, y la de abajo cuando hay una de arriba a la que unirla.
 * La figura las espera junto con las fotos, así la prenda entra ya unida.
 */
export function fotosQueSeMiden(fotos: readonly FotoPedida[]): FotoPedida[] {
  return fotos.some((f) => f.z === "arriba") ? fotos.filter((f) => f.z === "arriba" || f.z === "abajo") : [];
}

/** Cómo entró la prenda de una zona, tal como lo guarda el probador: `vuelta` sube en cada cambio. */
type EntradaPedida = { tipo: string; vuelta: number };
/** La entrada tal como la dibuja la figura: `vuelta` es la suya (sube en cada entrada que se VE) y `de`, la vuelta pedida de la que salió. */
export type EntradaVista<E extends EntradaPedida> = E & { de: number };

/**
 * Las entradas que la figura dibuja al adoptar un outfit. La animación de entrada vuelve a empezar cuando cambia la paridad de `vuelta` (la clase
 * alterna entre «-a» y «-b»). Como la figura espera las fotos, puede saltarse cambios (dos toques seguidos mientras baja la foto): con la vuelta
 * pedida, dos saltos dejarían la misma paridad y la prenda entraría sin animarse. Por eso la figura lleva su propia cuenta, que sube de uno en uno por
 * cada entrada que de verdad muestra. Una zona cuya entrada pedida no cambió conserva la suya (no se vuelve a animar).
 */
export function entradasQueSeVen<E extends EntradaPedida>(
  vistas: Readonly<Partial<Record<Zona, EntradaVista<E>>>>,
  pedidas: Readonly<Partial<Record<Zona, E>>>,
): Partial<Record<Zona, EntradaVista<E>>> {
  const salida: Partial<Record<Zona, EntradaVista<E>>> = {};
  for (const z of ZONAS) {
    const pedida = pedidas[z];
    if (!pedida) continue;
    const vista = vistas[z];
    salida[z] = vista && vista.de === pedida.vuelta ? vista : { ...pedida, vuelta: (vista?.vuelta ?? 0) + 1, de: pedida.vuelta };
  }
  return salida;
}

/** Las zonas que cambian entre el outfit que se ve y el pedido (otra prenda u otro color): son las que se atenúan mientras llega su foto. */
export function zonasQueCambian(visto: Look, pedido: Look): Zona[] {
  return ZONAS.filter((z) => visto[z]?.id !== pedido[z]?.id || visto[z]?.color !== pedido[z]?.color);
}
