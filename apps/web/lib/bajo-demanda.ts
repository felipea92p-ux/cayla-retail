// Código que se descarga recién cuando hace falta (ADR-0674, Fase 2 · actividad 7).
//
// EL PROBLEMA. Una pantalla pesada baja y lee TODO su JavaScript antes de poder usarse, también el de las hojas que se abren una vez al
// día (cerrar la caja) o casi nunca. En un teléfono de 2–4 GB eso es lo que tarda en «despertar».
//
// QUÉ PROMETE. `cargar()` se llama una sola vez aunque se pida muchas veces a la vez; cuando termina, la pieza queda en memoria y pedirla
// de nuevo no toca la red.
//
// LO QUE NO PUEDE PASAR. Que un corte de internet en el momento de abrir deje la pieza rota para siempre: un fallo NO se recuerda. La
// siguiente vez que se pida, se intenta de nuevo. (`next/dynamic` y `React.lazy` recuerdan el fallo y tumban la pantalla con él: por eso
// las hojas bajo demanda no los usan.)

export type BajoDemanda<T> = {
  /** La pieza si ya está en memoria; si no, `null` (no dispara la descarga). */
  lista: () => T | null;
  /** Pide la pieza. Varias llamadas a la vez comparten una sola descarga; si falla, la promesa falla y la próxima llamada reintenta. */
  pedir: () => Promise<T>;
};

export function bajoDemanda<T>(cargar: () => Promise<T>): BajoDemanda<T> {
  let pieza: { valor: T } | null = null;
  let enCurso: Promise<T> | null = null;
  return {
    lista: () => (pieza ? pieza.valor : null),
    pedir: () => {
      if (pieza) return Promise.resolve(pieza.valor);
      enCurso ??= cargar().then(
        (valor) => {
          pieza = { valor };
          enCurso = null;
          return valor;
        },
        (error: unknown) => {
          enCurso = null;
          throw error;
        },
      );
      return enCurso;
    },
  };
}
