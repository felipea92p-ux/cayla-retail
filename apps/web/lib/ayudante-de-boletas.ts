/**
 * ¿Esta Mac es la caja? Lo es si su ayudante (ADR-0304, `public/mac-etiquetas/servidor.sh`) tiene la ticketera: entonces la boleta sale
 * sin cuadro desde el Chrome de siempre y la estación imprime lo que se vende en el piso (ADR-0670). Aquí vive la pregunta al ayudante y
 * su respuesta, compartida por la estación, «Venta registrada» e `imprimirBoleta` (`components/impresion/imprimirBoleta.ts`).
 *
 * Solo corre en el navegador. Sale de `imprimirBoleta.ts` (2026-11-24) para poder probar que la caja vuelve sola
 * (`lib/boletas-por-ayudante.test.ts`): las pruebas no resuelven el atajo `@/` de ese archivo.
 */
import { sistemaDelEquipo } from "./guia-impresion-reglas";
import { ayudanteImprimeBoletas, URL_AYUDANTE } from "./mac-etiquetas";

/** Cuánto se espera al ayudante al preguntarle si está. En una Mac sin él la respuesta llega al instante (conexión rechazada); lo que
 *  tarda es el aviso de Chrome «acceso a la red local» la primera vez, mientras la persona elige Permitir. */
const ESPERA_ESTADO_MS = 5000;
/** Cada cuánto se vuelve a preguntar mientras alguien escucha (la estación, «Venta registrada»). Instalar el ayudante o conectar la
 *  ticketera se nota sin recargar, y una respuesta fallida (el ayudante tardó más de 5 s, la ticketera estaba dormida) no deja a la
 *  caja apagada para siempre: el 2026-11-24 la estación de TRU se apagó así entre dos ventas del piso y dos boletas quedaron en la
 *  cola hasta recargar, porque solo se preguntaba al abrir la página. */
const VIGENCIA_MS = 30_000;

let conocido: boolean | null = null;
let cuando = 0;
let enCurso: Promise<boolean> | null = null;
const oyentes = new Set<() => void>();

export const esMac = () => typeof navigator !== "undefined" && sistemaDelEquipo(navigator.userAgent, navigator.platform) === "mac";

/** ¿Esta Mac imprime la boleta por el ayudante? Pregunta a lo más cada 30 s (`fresca`: ya, sin mirar la última respuesta); en otro
 *  sistema, no pregunta. */
export function comprobarBoletasPorAyudante(fresca = false): Promise<boolean> {
  if (!esMac()) return Promise.resolve(false);
  if (!fresca && conocido !== null && Date.now() - cuando < VIGENCIA_MS) return Promise.resolve(conocido);
  enCurso ??= fetch(`${URL_AYUDANTE}/estado`, { cache: "no-store", signal: AbortSignal.timeout(ESPERA_ESTADO_MS) })
    .then((r) => r.json())
    .then(ayudanteImprimeBoletas)
    // relleno-a-proposito: sin respuesta del ayudante esta Mac no imprime boletas sin cuadro; el reloj vuelve a preguntar en 30 s
    .catch(() => false)
    .then((si) => {
      const cambio = si !== conocido;
      conocido = si;
      cuando = Date.now();
      enCurso = null;
      if (cambio) oyentes.forEach((f) => f());
      return si;
    });
  return enCurso;
}

let reloj: number | undefined;
/** Al volver a la pestaña (o al despertar la Mac), se pregunta de nuevo sin esperar al reloj: es cuando la persona mira la insignia. */
const alVolverALaPestana = () => {
  if (document.visibilityState === "visible") void comprobarBoletasPorAyudante(true);
};

/** Un solo reloj y un solo oyente de la pestaña para todos los que escuchan; nacen con el primero y se van con el último. Solo en una Mac:
 *  en otro sistema no hay ayudante a quien preguntar. */
function vigilarAlAyudante(activo: boolean): void {
  if (activo && reloj === undefined && esMac()) {
    reloj = window.setInterval(() => void comprobarBoletasPorAyudante(true), VIGENCIA_MS);
    document.addEventListener("visibilitychange", alVolverALaPestana);
  } else if (!activo && reloj !== undefined) {
    window.clearInterval(reloj);
    reloj = undefined;
    document.removeEventListener("visibilitychange", alVolverALaPestana);
  }
}

/** Para `useSyncExternalStore`: esta Mac es «la caja» porque su ayudante tiene la ticketera (la estación y «Venta registrada»). Mientras
 *  alguien escucha, se vuelve a preguntar cada 30 s y al volver a la pestaña. */
export const boletasPorAyudante = {
  suscribir(alCambiar: () => void) {
    oyentes.add(alCambiar);
    void comprobarBoletasPorAyudante();
    vigilarAlAyudante(true);
    return () => {
      oyentes.delete(alCambiar);
      if (oyentes.size === 0) vigilarAlAyudante(false);
    };
  },
  leer: () => conocido === true,
  leerEnServidor: () => false,
};

/**
 * Un envío al ayudante falló: algo cambió en esta Mac (se desconectó la ticketera, se detuvo el ayudante). Se pregunta de nuevo ya y,
 * hasta que conteste, vale la última respuesta. Antes se borraba la respuesta sin avisar a nadie: la caja se apagaba en el siguiente
 * dibujo de la pantalla y nadie volvía a preguntar hasta recargar.
 */
export function repreguntarAlAyudante(): void {
  void comprobarBoletasPorAyudante(true);
}
