import "server-only";
import { monitorEventLoopDelay } from "node:perf_hooks";

/**
 * Cuánto se trabó el servidor mientras armaba una pantalla (2026-11-14, la medición de Existencias). El servidor atiende de a un trabajo:
 * si una respuesta de la base ya llegó mientras él calculaba otra cosa (el ritmo de 3.000 tallas, el armado de una página de 2 MB), esa
 * respuesta espera su turno y su tramo crece aunque la base haya tardado poco. Producción lo mostró el 2026-11-13: el ritmo tarda 90 ms en
 * la base y 0,9–1,6 s en la página. Esta medida dice cuánto fue: la espera más larga de un reloj de 10 ms (`max_ms`) y la del 1 % peor.
 *
 * Mide el proceso entero: si la misma máquina atiende otra petición a la vez, su trabajo también cuenta. Es un indicio, no un cronómetro
 * por pantalla. `cerrar()` siempre apaga el reloj: lo llama el `after()` de la página, que corre también si la pantalla redirige o falla.
 */
export function vigilarBucle(): { cerrar(): { maxMs: number; p99Ms: number } | null } {
  let h: ReturnType<typeof monitorEventLoopDelay> | null = null;
  try {
    h = monitorEventLoopDelay({ resolution: 10 });
    h.enable();
  } catch {
    h = null;
  }
  return {
    cerrar() {
      if (!h) return null;
      h.disable();
      const medida = { maxMs: h.max / 1e6, p99Ms: h.percentile(99) / 1e6 };
      h = null;
      return Number.isFinite(medida.maxMs) ? medida : null;
    },
  };
}
