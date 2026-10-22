/**
 * Reglas puras del dedo sobre una hoja del celular (ADR-0479, Felipe eligió «B · Hoja viva con profundidad» el
 * 2026-10-22): cuándo un arrastre es de la hoja y no del contenido, cuánto se mueve, con qué velocidad se soltó
 * y a dónde va al soltar. Sin React ni DOM, para poder probarlas (`hoja-gesto.test.ts`); el que mueve la hoja es
 * `components/ui/useHojaArrastre.ts`.
 *
 * Nace de la auditoría del celular del 2026-10-22 (`docs/maquetas/hojas-movil-2026-10/`): de 61 hojas medidas a
 * 375 px, ninguna se movía con el dedo y en 29 la única salida era «Cancelar» al pie, a veces bajo el pliegue.
 *
 * Las posiciones son píxeles hacia abajo desde la hoja abierta: 0 es abierta del todo y el alto de la hoja es
 * cerrada. Una hoja con más de una altura (actividad 4) pasa más puntos; con dos, es abrir o cerrar.
 */

/** Lo que el dedo tiene que recorrer antes de que se decida de quién es el gesto (de la hoja o del contenido).
    @internal La prueba lo usa para medir el borde. */
export const MOVIMIENTO_MINIMO = 6;

/** Soltada más allá de este tramo hacia el siguiente punto, la hoja va a ese punto (un tercio: cerrar es fácil, no accidental).
    @internal La prueba lo usa para medir el umbral. */
export const FRACCION_PARA_PASAR = 1 / 3;

/** Un tirón (px por ms) decide el sentido aunque el dedo haya recorrido poco: 0,5 px/ms son 500 px por segundo. */
const VELOCIDAD_TIRON = 0.5;

/** La velocidad se mide en los últimos 100 ms: si el dedo se detuvo antes de soltar, no hay tirón. */
const VENTANA_VELOCIDAD = 100;

/** Lo más que cede la hoja cuando se tira más allá de un tope (o cuando no se puede cerrar porque guarda).
    @internal La prueba lo usa para medir el tope. */
export const TOPE_GOMA = 44;

export type Muestra = { t: number; y: number };

/**
 * De quién es el gesto, o `null` si el dedo todavía no se movió lo suficiente para saberlo.
 * La hoja solo toma el gesto cuando el dedo BAJA y todo lo que corre bajo él está arriba del todo; de lado (una
 * tabla que corre, un riel de píldoras) o hacia arriba, el gesto es del contenido.
 */
export function decidirGesto(dx: number, dy: number, contenidoArriba: boolean): "hoja" | "contenido" | null {
  if (Math.abs(dx) < MOVIMIENTO_MINIMO && Math.abs(dy) < MOVIMIENTO_MINIMO) return null;
  if (Math.abs(dx) > Math.abs(dy)) return "contenido";
  return dy > 0 && contenidoArriba ? "hoja" : "contenido";
}

/** Cuánto cede algo que se tira `d` px más allá de su tope: crece cada vez menos y nunca pasa de `tope`. Sin rebote.
    @internal La usa `posicionAlArrastrar`; la prueba la mide sola. */
export function goma(d: number, tope: number = TOPE_GOMA): number {
  if (d <= 0) return 0;
  return (1 - 1 / (d / (tope * 3.6) + 1)) * tope;
}

/**
 * Dónde dibujar la hoja mientras el dedo la lleva, desde la posición en que empezó (`desde`) y lo recorrido (`dy`).
 * Más arriba de abierta del todo, resiste. Con `resiste` (está guardando y no se puede cerrar), todo el recorrido
 * hacia abajo también resiste: se ve que la hoja oyó el dedo, pero no se va.
 */
export function posicionAlArrastrar(desde: number, dy: number, resiste = false): number {
  const y = desde + dy;
  if (y < 0) return -goma(-y);
  return resiste ? desde + goma(y - desde) : y;
}

/** Velocidad del dedo al soltar, en px por ms (positiva hacia abajo), medida en la ventana de los últimos 100 ms. */
export function velocidad(muestras: readonly Muestra[]): number {
  if (muestras.length < 2) return 0;
  const ultima = muestras[muestras.length - 1];
  const primera = muestras.find((m) => ultima.t - m.t <= VENTANA_VELOCIDAD) ?? muestras[0];
  const dt = ultima.t - primera.t;
  if (dt <= 0) return 0;
  return (ultima.y - primera.y) / Math.max(16, dt);
}

/**
 * A qué punto va la hoja al soltarla. `puntos` va de arriba abajo y el último es «cerrada» (el alto de la hoja).
 * Un tirón manda al siguiente punto en su sentido; si no, pasa al siguiente punto quien recorrió más de un tercio
 * del tramo desde donde empezó, y vuelve quien no.
 */
export function destinoAlSoltar(y: number, desde: number, puntos: readonly number[], vy: number): number {
  const p = [...puntos].sort((a, b) => a - b);
  if (vy > VELOCIDAD_TIRON) return p.find((x) => x > y + 0.5) ?? p[p.length - 1];
  if (vy < -VELOCIDAD_TIRON) return [...p].reverse().find((x) => x < y - 0.5) ?? p[0];
  if (y <= p[0]) return p[0];
  if (y >= p[p.length - 1]) return p[p.length - 1];
  const i = p.findIndex((x, k) => y >= x && y <= p[k + 1]);
  const a = p[i];
  const b = p[i + 1];
  // Bajando desde `a` (o desde más arriba), basta un tercio para pasar a `b`; subiendo desde `b`, un tercio para volver a `a`.
  const umbral = desde <= a ? a + (b - a) * FRACCION_PARA_PASAR : b - (b - a) * FRACCION_PARA_PASAR;
  return y > umbral ? b : a;
}

/**
 * Cuánto tarda la hoja en llegar a su punto al soltarla: lo que le queda dividido por la velocidad que traía el
 * dedo (así un tirón rápido termina rápido y uno lento no se arrastra), entre 180 y 420 ms (ADR-0136: respuestas
 * de 200 a 500 ms; 180 solo cuando el dedo ya la traía rápido).
 */
export function duracionHacia(distancia: number, vy: number): number {
  const ms = Math.abs(distancia) / Math.max(Math.abs(vy), 1);
  return Math.round(Math.min(420, Math.max(180, ms)));
}

/**
 * Lo de atrás con la hoja abierta (la «B» que eligió Felipe): la pantalla se aleja a 0,92, baja 12 px y su cabecera se
 * redondea 18 px, como una tarjeta que quedó debajo. @internal La prueba mide los extremos.
 */
export const FONDO_ALEJADO = { escala: 0.92, bajada: 12, radio: 18 } as const;

/**
 * Cómo dibujar lo de atrás según cuánto de la hoja se fue (0 abierta, 1 cerrada): vuelve a su lugar al mismo ritmo que el
 * dedo baja la hoja.
 */
export function fondoSegun(progreso: number): { escala: number; bajada: number; radio: number } {
  const p = Math.min(1, Math.max(0, progreso));
  return {
    escala: FONDO_ALEJADO.escala + (1 - FONDO_ALEJADO.escala) * p,
    bajada: FONDO_ALEJADO.bajada * (1 - p),
    radio: FONDO_ALEJADO.radio * (1 - p),
  };
}

/** Cuánto de la hoja se fue (0 abierta, 1 cerrada): el velo se aclara en esa misma proporción. */
export function progresoDeCierre(y: number, alto: number): number {
  if (alto <= 0) return 0;
  return Math.min(1, Math.max(0, y / alto));
}
