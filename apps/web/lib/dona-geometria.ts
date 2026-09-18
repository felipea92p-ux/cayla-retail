// Geometría de la dona de métodos de pago (`components/ui/DonaMetodos.tsx`) — mismo
// patrón que `caja-panel-reglas.ts`: los números que un navegador no puede
// verificar por ti viven acá, sin React. Un desfase mal calculado no falla al
// compilar: se ve como un arco corrido o un hueco de más, y hay que saber dónde mirar.

/** Radio del anillo en unidades del viewBox (200×200) y su circunferencia. */
export const RADIO = 70;
export const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/** Hueco entre arcos: ~2,2° — el hilo de superficie que separa dos rellenos. */
const HUECO = (2.2 / 360) * CIRCUNFERENCIA;
/** Cuánto se adelanta hacia afuera el arco activo. */
const SALTO = 3;
/** Un arco nunca baja de esto: una porción minúscula igual tiene que verse. */
const LARGO_MINIMO = 1.5;

export type ArcoDona = {
  /** Fracción del total, 0–1. */
  frac: number;
  /** Largo dibujado (ya sin el hueco). Va al `strokeDasharray`. */
  largo: number;
  /** Dónde arranca, desde las 12 en punto siguiendo el reloj. Va (negativo) al `strokeDashoffset`. */
  inicio: number;
  /** Hacia dónde se adelanta al activarse, en el eje del anillo ya rotado -90°. */
  dx: number;
  dy: number;
};

/**
 * Un arco por valor, en el orden recibido. Con un solo valor no hay hueco (un
 * anillo cerrado no tiene con qué separarse). Sin plata, sin arcos.
 */
export function arcosDona(valores: readonly number[]): ArcoDona[] {
  const suma = valores.reduce((a, v) => a + v, 0);
  if (suma <= 0) return [];
  const hueco = valores.length === 1 ? 0 : HUECO;
  let acumulado = 0;
  return valores.map((v) => {
    const frac = v / suma;
    // Ángulo del centro del arco, desde las 12 siguiendo el reloj: en el eje local
    // del anillo (que se dibuja rotado -90°) coincide con el ángulo desde las 3.
    const medio = (acumulado + frac / 2) * 2 * Math.PI;
    const arco: ArcoDona = {
      frac,
      largo: Math.max(frac * CIRCUNFERENCIA - hueco, LARGO_MINIMO),
      inicio: acumulado * CIRCUNFERENCIA + hueco / 2,
      dx: Math.cos(medio) * SALTO,
      dy: Math.sin(medio) * SALTO,
    };
    acumulado += frac;
    return arco;
  });
}

/** A qué arco pertenece la marca `k` de `n` del bisel: cada marca vale 1/n del total. */
export function arcoDeMarca(arcos: readonly ArcoDona[], k: number, n: number): number {
  const u = (k + 0.5) / n;
  let fin = 0;
  for (let i = 0; i < arcos.length; i++) {
    fin += arcos[i]!.frac;
    if (u < fin) return i;
  }
  return arcos.length - 1;
}
