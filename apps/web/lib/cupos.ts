// Cuántas lecturas pesadas corren a la vez en una pantalla (2026-11-09, el pico de memoria de Finanzas ▸ Resumen).
//
// EL PROBLEMA. La base de producción tiene 2 núcleos. Resumen lanzaba sus seis o siete lecturas pesadas a la vez (cada una arma el diario
// contable): con 2 núcleos no terminan antes que en tandas, pero cada una ocupa su memoria al mismo tiempo, y una sola carga empujaba la
// máquina a usar swap (medido el 2026-11-09 a las 09:07 y a las 11:44).
//
// LO QUE HACE. `crearCupos(n)` devuelve una función que corre tareas con a lo más `n` a la vez; las demás esperan su turno en orden de
// llegada. Una tarea que falla libera su cupo igual. Es lógica pura, sin nada de la base: la pantalla decide qué lecturas pasan por él.

/** Un turnero: corre cada tarea cuando hay cupo, con a lo más `n` a la vez, en el orden en que se pidieron. */
export function crearCupos(n: number): <T>(tarea: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(n) || n < 1) throw new Error(`crearCupos: el cupo tiene que ser un entero mayor que 0 (llegó ${n}).`);
  let libres = n;
  const fila: (() => void)[] = [];
  const soltar = () => {
    const siguiente = fila.shift();
    if (siguiente) siguiente();
    else libres++;
  };
  return async <T>(tarea: () => Promise<T>): Promise<T> => {
    if (libres > 0) libres--;
    else await new Promise<void>((pasa) => fila.push(pasa));
    try {
      return await tarea();
    } finally {
      soltar();
    }
  };
}
