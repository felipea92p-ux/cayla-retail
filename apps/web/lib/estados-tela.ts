/**
 * La tela de Estados financieros (ADR-0611): hilos finos que fluyen, con un hilo rojo, detrás del vidrio. Aquí está lo que se puede probar sin dibujar: por dónde va cada
 * hilo y cuánto se corre cada capa. Lo pinta `components/finanzas/estados/TelaHilos.tsx`, una vez; los colores salen de los tokens al pintar.
 */
import { ESTADOS } from "./estados-financieros-reglas";

/** Un haz: muchos hilos paralelos que ondulan juntos. `y`, `a` y `g` van en fracción del alto. */
export type HazDeHilos = { y: number; a: number; f: number; p: number; n: number; g: number };

/** Dos capas, para que se puedan correr por separado al cambiar de estado. */
export const CAPAS_DE_HILOS: readonly (readonly HazDeHilos[])[] = [
  [
    { y: 0.18, a: 0.1, f: 1.5, p: 0.4, n: 46, g: 0.0052 },
    { y: 0.74, a: 0.12, f: 1.2, p: 3.4, n: 40, g: 0.006 },
  ],
  [{ y: 0.46, a: 0.15, f: 1, p: 1.6, n: 42, g: 0.0058 }],
];

const PASOS_POR_HILO = 90;

/** Uno de cada haz es el rojo, siempre el mismo: hay que poder contar con él, porque gasta uno de los dos acentos rojos de la pantalla. */
export const esElHiloRojo = (haz: HazDeHilos, i: number): boolean => i === Math.floor(haz.n * 0.62);

/** Los puntos de un hilo sobre un lienzo de `ancho` × `alto`. Sin azar: la misma tela cada vez. */
export function puntosDelHilo(haz: HazDeHilos, i: number, ancho: number, alto: number): [number, number][] {
  return Array.from({ length: PASOS_POR_HILO + 1 }, (_, j) => {
    const u = j / PASOS_POR_HILO;
    const onda = haz.a * Math.sin(u * Math.PI * 2 * haz.f + haz.p + i * 0.022);
    const abanico = i * haz.g * (1 + 0.5 * Math.sin(u * Math.PI * 2 + haz.p));
    return [u * ancho, (haz.y + onda + abanico) * alto];
  });
}

/** El lienzo es un 16 % más grande que la ventana (lo que se corre no deja ver el borde), con un tope para no gastar memoria en una pantalla enorme. */
export function tamanoDelLienzo(ventanaAncho: number, ventanaAlto: number): { ancho: number; alto: number } {
  return { ancho: Math.min(2200, Math.round(ventanaAncho * 1.16)), alto: Math.round(ventanaAlto * 1.16) };
}

/** Cuánto se corre cada capa en cada estado: al cambiar de pestaña, los hilos se reacomodan. */
const CORRIMIENTO_POR_ESTADO: readonly (readonly [readonly [number, number], readonly [number, number]])[] = [
  [
    [0, 0],
    [0, 0],
  ],
  [
    [22, -14],
    [-30, 16],
  ],
  [
    [-20, 18],
    [34, -10],
  ],
  [
    [-28, -12],
    [-20, -20],
  ],
];

/** La pestaña por la ruta: lo que no es uno de los cuatro estados (las cuentas, las campañas) se queda con la tela del primero. */
export function estadoDeLaRuta(ruta: string): number {
  const i = ESTADOS.findIndex((e) => e.ruta === ruta);
  return i < 0 ? 0 : i;
}

/** Dónde queda una capa: su lugar en ese estado, más lo poco que sigue al mouse (`mx`, `my`: de -5 a 5 px). La capa de arriba se mueve más. */
export function corrimientoDeCapa(estado: number, capa: number, mx: number, my: number): { x: number; y: number } {
  const [x, y] = CORRIMIENTO_POR_ESTADO[estado]?.[capa] ?? [0, 0];
  const peso = (capa + 2) * 0.5;
  return { x: x + mx * peso, y: y + my * peso };
}

/** El mouse, de -5 a 5 px: va al revés del puntero, como si la tela estuviera más lejos. */
export const mouseEnLaTela = (posicion: number, largo: number): number => (posicion / largo - 0.5) * -10;

/**
 * El mapa de la lente (Felipe eligió el vidrio de la maqueta): cómo el borde de una placa desvía lo que hay detrás, como el canto de un vidrio. Cada pixel dice hacia
 * dónde empujar: rojo en horizontal, verde en vertical, y 127,5 es «no moverse». Lejos del borde no se mueve nada; en el borde, lo que más. Se dibuja a la mitad del
 * tamaño: no hace falta más y una placa grande son muchos pixeles.
 */
export function pixelesDeLente(ancho: number, alto: number, radio: number, banda: number): { w: number; h: number; datos: Uint8ClampedArray } {
  const paso = 2;
  const w = Math.ceil(ancho / paso);
  const h = Math.ceil(alto / paso);
  const datos = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const px = i * paso + 0.5;
      const py = j * paso + 0.5;
      const qx = Math.abs(px - ancho / 2) - (ancho / 2 - radio);
      const qy = Math.abs(py - alto / 2) - (alto / 2 - radio);
      // Qué tan adentro está, medido desde el borde redondeado.
      const adentro = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radio);
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        nx = qx / l;
        ny = qy / l;
      } else if (qx > qy) nx = 1;
      else ny = 1;
      nx *= Math.sign(px - ancho / 2) || 1;
      ny *= Math.sign(py - alto / 2) || 1;
      const m = adentro < banda ? Math.pow(1 - Math.max(adentro, 0) / banda, 2.2) : 0;
      const o = (j * w + i) * 4;
      datos[o] = 127.5 - nx * m * 127.5;
      datos[o + 1] = 127.5 - ny * m * 127.5;
      datos[o + 2] = 128;
      datos[o + 3] = 255;
    }
  }
  return { w, h, datos };
}
