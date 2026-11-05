// Guías interactivas (ADR-0389): cuándo arranca la guía que pidió un `?demo=1`. Sin React ni DOM: se prueba en
// `arranque-demo.test.ts`, también el doble montaje de StrictMode, que una prueba de render sin navegador no ve.

/** Cuánto espera la guía pedida: que la pantalla termine de dibujarse antes de encender la primera pieza. */
const ESPERA_ARRANQUE_MS = 700;

/** @internal La prueba la cruza: un `?demo=1` de la misma guía que vuelve antes de esto no la reinicia. */
export const VENTANA_REPETIDA_MS = 60_000;

/**
 * El arranque de la demo, uno por motor. `pedir` programa la guía y `desmontar` cancela lo programado.
 *
 * La demo se anota recién al ARRANCAR, no al programarla: en desarrollo, StrictMode monta el motor, lo desmonta y lo vuelve a
 * montar. Anotada al programar, el desmontaje borraba el arranque y el segundo montaje la tomaba por repetida: la URL se limpiaba
 * y la guía nunca arrancaba (`guias:recorrer` fallaba en todas, 2026-10-22). Lo que no arrancó no cuenta como vista.
 */
export function crearArranqueDemo() {
  let pendiente: ReturnType<typeof setTimeout> | null = null;
  let ultima: { id: string; cuando: number } | null = null;
  return {
    /**
     * Llegó `?demo=1` para esta guía. Un enlace de la pantalla que conserva los parámetros de la URL (las píldoras de Facturas)
     * puede traerlo de vuelta: si la demo de esta guía ya está corriendo o arrancó hace menos de un minuto, no se vuelve a
     * empezar. Devuelve si quedó programada.
     */
    pedir(guiaId: string, corriendoId: string | null, arrancar: () => void): boolean {
      const repetida = corriendoId === guiaId || (ultima?.id === guiaId && Date.now() - ultima.cuando < VENTANA_REPETIDA_MS);
      if (repetida) return false;
      if (pendiente) clearTimeout(pendiente);
      pendiente = setTimeout(() => {
        pendiente = null;
        ultima = { id: guiaId, cuando: Date.now() };
        arrancar();
      }, ESPERA_ARRANQUE_MS);
      return true;
    },
    /** El motor se desmonta (también el desmontaje que simula StrictMode): lo programado no arrancó. */
    desmontar() {
      if (pendiente) clearTimeout(pendiente);
      pendiente = null;
    },
  };
}
