"use client";

import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";
import {
  ESPERA_MAXIMA_DEL_TOQUE_MS,
  MEDIDAS_POR_ENVIO,
  redondearAncho,
  redondearValor,
  RUTA_DE_MEDICION,
  rutaDeMedicion,
  SELECTOR_ESQUELETO,
  METRICAS_DE_ENTRADA,
  type Conexion,
  CONEXIONES,
  type Envio,
  type Medida,
  type MetricaDeEntrada,
} from "@/lib/medicion";

/**
 * La medición de una visita que entró a la muestra (ADR-0447; qué se mide y qué nunca viaja, en `lib/medicion.ts`). La carga `Medicion`
 * solo en esas visitas, en un archivo aparte que pide al hidratar (no lo espera nada): las demás no bajan ni web-vitals. No dibuja nada. Todo se junta en la pestaña y
 * sale en UN envío (`sendBeacon`) cuando la pestaña se oculta o se cierra: así llegan los valores finales de CLS e INP y no hay una
 * petición por cada toque. Si la ruta no responde, el navegador lo descarta y la tienda sigue igual (principio 9): nada espera al envío.
 */
export function MedicionActiva() {
  // Primero los oyentes de web-vitals: al ocultarse la pestaña, sus valores finales tienen que entrar a la cola antes de enviarla.
  useReportWebVitals(alMedir);

  useEffect(() => {
    entrada = location.pathname;
    anotarAncho();
    const quitarToques = medirToques();
    const alOcultar = () => {
      if (document.visibilityState === "hidden") enviar();
    };
    // En `window` y sin captura: corre después de los de web-vitals (que están en la captura), con CLS e INP ya en la cola.
    window.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("pagehide", enviar);
    return () => {
      quitarToques();
      window.removeEventListener("visibilitychange", alOcultar);
      window.removeEventListener("pagehide", enviar);
    };
  }, []);

  return null;
}

/** La página por la que entró la visita (para las métricas de entrada de un navegador que no dice la suya). */
let entrada: string | null = null;
/** Lo medido que todavía no salió. Las de entrada, por métrica y carga: CLS e INP pueden volver a llegar con un valor mayor. */
const cola = new Map<string, Medida>();
let toques = 0;
/** El ancho de la ventana mientras se mide: al cerrarse la página, algunos navegadores ya dicen 0. */
let ancho: number | null = null;

function anotarAncho() {
  const actual = window.innerWidth;
  if (actual >= 200 && actual <= 5000) ancho = redondearAncho(actual);
}

/** Lo que manda web-vitals, con los campos que se usan (`navigationURL` y el tipo los trae el Next de la tienda, que mide navegaciones
 *  internas en el Chrome que las reconoce). */
interface MetricaDeNext {
  name: string;
  value: number;
  id: string;
  navigationType?: string;
  navigationURL?: string;
}

const esMetricaDeEntrada = (n: string): n is MetricaDeEntrada => (METRICAS_DE_ENTRADA as readonly string[]).includes(n);

function alMedir(metrica: MetricaDeNext) {
  if (!esMetricaDeEntrada(metrica.name) || !Number.isFinite(metrica.value)) return;
  anotarAncho();
  let ruta = entrada ?? location.pathname;
  try {
    if (metrica.navigationURL) ruta = new URL(metrica.navigationURL, location.href).pathname;
  } catch {
    // Se queda con la de entrada.
  }
  cola.set(`${metrica.name}|${metrica.id}`, {
    n: metrica.name,
    v: redondearValor(metrica.name, metrica.value),
    r: rutaDeMedicion(ruta),
    id: metrica.id,
    suave: metrica.navigationType === "soft-navigation",
  });
}

/**
 * Del toque a la página: al tocar un enlace de la tienda se anota la hora del toque y, cuadro a cuadro, se mira cuándo cambió la
 * dirección o salió el esqueleto (lo primero que la persona ve que pasó) y cuándo se fue el esqueleto (llegó la página). Si se toca una
 * prenda antes de que llegue su precarga, Next espera esa precarga para cambiar algo (ADR-0445): esa espera queda en `respuesta`, y si la
 * persona vuelve a tocar el mismo enlace porque no vio nada, se sigue midiendo desde el primer toque (`repetido`). Un toque que la persona
 * deja (vuelve atrás, toca otro enlace, cambia de pestaña) no se cuenta: no se sabe cuánto habría tardado.
 */
function medirToques(): () => void {
  let viaje: {
    t0: number;
    desde: string;
    origen: string;
    destino: string;
    hacia: string;
    respuesta: number | null;
    esqueleto: boolean;
    repetido: boolean;
  } | null = null;
  let cuadro = 0;

  const anotar = (pagina: number) => {
    if (!viaje) return;
    anotarAncho();
    cola.set(`toque|${(toques += 1)}`, {
      n: "toque",
      desde: viaje.desde,
      hacia: viaje.hacia,
      respuesta: Math.round(viaje.respuesta ?? pagina),
      pagina: Math.round(pagina),
      esqueleto: viaje.esqueleto,
      repetido: viaje.repetido,
    });
  };

  const mirar = () => {
    if (!viaje) return;
    const ahora = performance.now();
    if (document.visibilityState === "hidden") {
      viaje = null;
      return;
    }
    if (ahora - viaje.t0 > ESPERA_MAXIMA_DEL_TOQUE_MS) {
      anotar(ESPERA_MAXIMA_DEL_TOQUE_MS);
      viaje = null;
      return;
    }
    const cambio = location.pathname + location.search !== viaje.origen;
    const conEsqueleto = document.querySelector(SELECTOR_ESQUELETO) !== null;
    if (viaje.respuesta === null && (cambio || conEsqueleto)) {
      viaje.respuesta = ahora - viaje.t0;
      viaje.esqueleto = conEsqueleto;
    }
    if (viaje.respuesta !== null && cambio && !conEsqueleto) {
      anotar(ahora - viaje.t0);
      viaje = null;
      return;
    }
    cuadro = requestAnimationFrame(mirar);
  };

  // Volver atrás (o adelante) a mitad de camino: la persona dejó ese toque.
  const alVolver = () => {
    viaje = null;
  };

  const alTocar = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const enlace = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!(enlace instanceof HTMLAnchorElement) || (enlace.target && enlace.target !== "_self") || enlace.hasAttribute("download")) return;
    let destino: URL;
    try {
      destino = new URL(enlace.href, location.href);
    } catch {
      return;
    }
    const origen = location.pathname + location.search;
    if (destino.origin !== location.origin || destino.pathname + destino.search === origen) return;
    // Otra vez el mismo enlace sin haber visto nada: el primer toque no respondió. Se sigue midiendo desde ese.
    if (viaje && viaje.respuesta === null && viaje.destino === destino.pathname + destino.search) {
      viaje.repetido = true;
      return;
    }
    // Si la página de antes todavía mostraba su esqueleto, no hay desde dónde medir.
    if (document.querySelector(SELECTOR_ESQUELETO)) return;
    // La hora del toque (la del evento, que cuenta la espera hasta que el navegador lo atendió); si no es creíble, la de ahora.
    const ahora = performance.now();
    const t0 = e.timeStamp > 0 && e.timeStamp <= ahora ? e.timeStamp : ahora;
    viaje = {
      t0,
      desde: rutaDeMedicion(location.pathname),
      origen,
      destino: destino.pathname + destino.search,
      hacia: rutaDeMedicion(destino.pathname),
      respuesta: null,
      esqueleto: false,
      repetido: false,
    };
    cancelAnimationFrame(cuadro);
    cuadro = requestAnimationFrame(mirar);
  };

  // En la captura: antes de que el enlace de Next lo detenga y empiece a navegar.
  document.addEventListener("click", alTocar, true);
  window.addEventListener("popstate", alVolver);
  return () => {
    document.removeEventListener("click", alTocar, true);
    window.removeEventListener("popstate", alVolver);
    cancelAnimationFrame(cuadro);
  };
}

function conexion(): Conexion | null {
  const tipo = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  return (CONEXIONES as readonly (string | undefined)[]).includes(tipo) ? (tipo as Conexion) : null;
}

function idDeEnvio(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Manda lo que hay en la cola, en tandas, y la vacía. Nunca lanza: medir no puede romper nada. */
function enviar() {
  if (cola.size === 0) return;
  const medidas = [...cola.values()];
  cola.clear();
  try {
    anotarAncho();
    for (let i = 0; i < medidas.length; i += MEDIDAS_POR_ENVIO) {
      const envio: Envio = { envio: idDeEnvio(), conexion: conexion(), ancho, m: medidas.slice(i, i + MEDIDAS_POR_ENVIO) };
      const cuerpo = JSON.stringify(envio);
      // `sendBeacon` sale aunque la pestaña se esté cerrando y no espera respuesta. Si el navegador no lo tiene o lo rechaza, un fetch
      // que tampoco espera a nadie (sin cookies: la ruta no las necesita).
      if (navigator.sendBeacon?.(RUTA_DE_MEDICION, cuerpo)) continue;
      void fetch(RUTA_DE_MEDICION, { method: "POST", body: cuerpo, keepalive: true, credentials: "omit" }).catch(() => {});
    }
  } catch {
    // Lo medido se pierde y la tienda sigue igual.
  }
}
