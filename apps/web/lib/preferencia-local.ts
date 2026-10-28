/**
 * Una preferencia de ESTE equipo (no de la cuenta), guardada en `localStorage`: el sonido de «confirmado», si los atajos de filtro
 * se ven solo con iconos o con texto. Es de cada dispositivo porque lo decide el lugar (una boutique con música baja, una tablet
 * del piso), y porque no vale una columna en la base ni un viaje al servidor para un gusto.
 *
 * Todo es opcional: sin almacenamiento (ventana privada, bloqueado) se usa el valor de fábrica y no se puede cambiar de forma
 * persistente; la pantalla funciona igual. Solo corre en el navegador (en el servidor, el valor de fábrica).
 * Se usa con `useSyncExternalStore(p.suscribir, p.leer, p.leerEnServidor)`.
 */

export type PreferenciaLocal<T extends string> = {
  leer: () => T;
  /** El valor de fábrica, para el render del servidor (el navegador corrige al hidratar). */
  leerEnServidor: () => T;
  fijar: (valor: T) => void;
  suscribir: (alCambiar: () => void) => () => void;
};

/** Lo guardado, validado: un valor que no es de la lista (guardado por una versión vieja, o a mano) cae en el de fábrica. */
export function valorValido<T extends string>(guardado: string | null | undefined, validos: readonly T[], deFabrica: T): T {
  return (validos as readonly string[]).includes(guardado ?? "") ? (guardado as T) : deFabrica;
}

export function preferenciaLocal<T extends string>(clave: string, validos: readonly T[], deFabrica: T): PreferenciaLocal<T> {
  const oyentes = new Set<() => void>();
  const leer = (): T => {
    if (typeof window === "undefined") return deFabrica;
    try {
      return valorValido(window.localStorage.getItem(clave), validos, deFabrica);
    } catch {
      return deFabrica;
    }
  };
  return {
    leer,
    leerEnServidor: () => deFabrica,
    fijar: (valor) => {
      try {
        window.localStorage.setItem(clave, valor);
      } catch {
        // No se pudo guardar: vale para esta visita.
      }
      oyentes.forEach((o) => o());
    },
    suscribir: (alCambiar) => {
      oyentes.add(alCambiar);
      const entre = (e: StorageEvent) => {
        if (e.key === clave) alCambiar();
      };
      window.addEventListener("storage", entre);
      return () => {
        oyentes.delete(alCambiar);
        window.removeEventListener("storage", entre);
      };
    },
  };
}
