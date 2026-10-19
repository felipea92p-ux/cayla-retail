/**
 * Que una acción que escribe corra UNA vez aunque se la llame varias en el mismo instante (diez clics en un botón).
 *
 * EL PROBLEMA. `cargando` de un botón es un estado de React: se actualiza después del clic, y diez clics en el mismo instante lo ven todavía
 * en «no». En «Publicar el diseño» y «Volver al anterior» (/chaos DC-02, 2026-10-17) eso mandaba diez llamadas a la base; volver al anterior
 * intercambia el publicado y el anterior en cada una, así que un número par lo deja todo igual mientras la pantalla dice que volvió.
 *
 * LA REGLA. Una variable de memoria (no de estado) que se toma al empezar y se suelta al terminar —también si falla—. Una por acción.
 */
export function unaSolaPasada(): <T>(trabajo: () => Promise<T>) => Promise<T | undefined> {
  let corriendo = false;
  return async (trabajo) => {
    if (corriendo) return undefined;
    corriendo = true;
    try {
      return await trabajo();
    } finally {
      corriendo = false;
    }
  };
}
