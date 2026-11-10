// Una lectura cara de la base, pedida por muchas visitas a la vez, se hace UNA vez por proceso; y si falla, el proceso no la vuelve a pedir
// hasta que pase una pausa corta (2026-11-07). Nació de la avalancha del probador: `tienda_probador` cuesta 1,25 s de CPU, la base tiene 2
// núcleos y el corte de la tienda es de 5 s. Al vencer su copia en la caché de datos, cada visita lanzaba su propia relectura; con ~5 a la vez
// todas pasaban de 5 s y se cortaban, ninguna llenaba la caché, y cada visita nueva sumaba otra: 139 cortes en 25 minutos, el tope de
// conexiones lleno y el ERP cortado de rebote, hasta que bajaron las visitas.
//
// Aquí no hay nada de Next ni de la base: recibe la lectura y devuelve la misma lectura, con las dos defensas. Cuando está en pausa, la
// lectura se rechaza al instante con `EnPausaTrasFallo`: quien la llama ya sabe qué hacer con un fallo (la caché de datos sigue sirviendo la
// copia vieja; la página, su respaldo), y la base no recibe nada.

/** Cuánto no se vuelve a pedir una lectura que falló, por proceso: lo bastante para que la base respire, poco para una visita. */
export const PAUSA_TRAS_FALLO_MS = 15_000;

/** El rechazo de una lectura que no se intentó porque la anterior falló hace menos de `pausaMs`. */
export class EnPausaTrasFallo extends Error {
  constructor(clave: string, faltanMs: number) {
    super(`${clave}: falló hace poco; no se vuelve a pedir a la base por ${Math.ceil(faltanMs / 1000)} s`);
    this.name = "EnPausaTrasFallo";
  }
}

/** La lectura `consulta`, con una sola petición en vuelo por argumentos (las demás esperan la misma) y, tras un fallo, `pausaMs` sin
 *  pedirla. `ahora` se pasa solo en las pruebas. */
export function unaALaVez<A extends readonly unknown[], R>(
  clave: string,
  consulta: (...args: A) => Promise<R>,
  { pausaMs, ahora = Date.now }: { pausaMs: number; ahora?: () => number },
): (...args: A) => Promise<R> {
  const enVuelo = new Map<string, Promise<R>>();
  const pausaHasta = new Map<string, number>();
  return (...args: A) => {
    const llave = JSON.stringify(args);
    const enCurso = enVuelo.get(llave);
    if (enCurso) return enCurso;
    const hasta = pausaHasta.get(llave) ?? 0;
    if (ahora() < hasta) return Promise.reject(new EnPausaTrasFallo(clave, hasta - ahora()));
    const pedido = consulta(...args).then(
      (valor) => {
        pausaHasta.delete(llave);
        return valor;
      },
      (error: unknown) => {
        pausaHasta.set(llave, ahora() + pausaMs);
        throw error;
      },
    );
    enVuelo.set(llave, pedido);
    // Se suelta al terminar, salga bien o mal; `catch` para que soltarla no deje un rechazo sin atender.
    pedido.finally(() => enVuelo.delete(llave)).catch(() => undefined);
    return pedido;
  };
}
