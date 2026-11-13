import {
  armarLote,
  destinoDeLaNavegacion,
  pasoDelCronometro,
  patronDeRuta,
  type CronometroEnCurso,
  type ParametrosDeRuta,
  type TiempoDePantalla,
  type TipoDeNavegacion,
} from "./tiempos-de-pantalla-reglas";

// ADR-0654 · El cronómetro del clic, del lado del navegador. Las reglas (qué se mide, cuándo llegó, el patrón, el lote) están en
// `tiempos-de-pantalla-reglas.ts`; aquí solo se mira la página y se manda. Lo arranca `onRouterTransitionStart`
// (`instrumentation-client.ts`) y lo alimenta y despacha `CronometroDelClic`, montado una vez en el marco del ERP.
//
// Todo puede fallar (principio 9): si el envío no llega, esas mediciones se pierden en silencio y la pantalla sigue igual. Nunca reintenta,
// nunca guarda nada en el aparato y nunca enciende el loader (ADR-0149).

/** Cada cuánto se mandan las mediciones juntas (y siempre al ocultar la pestaña). */
export const CADA_MS_MANDAR = 30_000;
/** Si el servidor no las recibe por un buen rato, la cola no crece sin fin: se quedan las últimas. */
const MAX_EN_COLA = 200;
const RUTA = "/api/tiempos";
/** Con qué versión se armó esta pestaña (`next.config.ts`): así se compara el antes y el después de una publicación. */
const VERSION = (process.env.NEXT_PUBLIC_BUILD_ID || "desarrollo").slice(0, 12);

/** Dónde está la pestaña según el marco del ERP (`null` fuera de él: el login, el club). */
let marco: { pathname: string; params: ParametrosDeRuta; sedeId: string } | null = null;
let enCurso: CronometroEnCurso | null = null;
let cuadro = 0;
const cola: TiempoDePantalla[] = [];

/** El marco anota en qué ruta está y en qué sede (lo llama `CronometroDelClic` en cada cambio de ruta, al montarse la pantalla nueva). */
export function anotarMarco(pathname: string, params: ParametrosDeRuta, sedeId: string) {
  marco = { pathname, params, sedeId };
}

/** Se salió del ERP: lo que se esté midiendo ya no llega a un módulo. */
export function soltarMarco() {
  marco = null;
}

function mirar(ahora: number) {
  cuadro = 0;
  if (!enCurso) return;
  const paso = pasoDelCronometro(enCurso, {
    ahora,
    pathname: location.pathname,
    hayEsqueleto: document.querySelector("[data-esqueleto-pantalla]") !== null,
    pathnameDelMarco: marco?.pathname ?? null,
  });
  if (paso.estado === "sigue") {
    enCurso = paso.cronometro;
    cuadro = requestAnimationFrame(mirar);
    return;
  }
  enCurso = null;
  if (paso.estado === "llego" && marco) {
    cola.push({ ruta: patronDeRuta(marco.pathname, marco.params), ms: paso.ms, sedeId: marco.sedeId, sinEsqueleto: paso.sinEsqueleto, version: VERSION });
    if (cola.length > MAX_EN_COLA) cola.splice(0, cola.length - MAX_EN_COLA);
  }
}

/**
 * Empieza a medir una navegación (`onRouterTransitionStart`). Solo dentro del ERP y solo si cambia de pantalla: un filtro, una búsqueda o
 * «atrás» no se miden, y «atrás» además corta lo que se estaba midiendo (ya no va a llegar). Una navegación nueva reemplaza a la anterior
 * que no llegó: quien cambió de idea a mitad de camino no tiene una pantalla lenta.
 */
export function empezarCronometro(url: string, tipo: TipoDeNavegacion, inicio: number) {
  if (typeof window === "undefined" || !marco) return;
  const destino = destinoDeLaNavegacion(url, tipo, location);
  if (!destino) {
    if (tipo === "traverse") enCurso = null;
    return;
  }
  enCurso = { inicio, desde: location.pathname, vioEsqueleto: false };
  if (!cuadro) cuadro = requestAnimationFrame(mirar);
}

/**
 * Manda lo medido, sin esperar respuesta. `sendBeacon` sale aunque la pestaña se esté cerrando y no pasa por el `fetch` que vigila el
 * loader; si el navegador no lo acepta, un `fetch` con `keepalive` y `x-espera: no` (ADR-0149: no tapa la pantalla).
 */
export function mandarTiempos() {
  const lote = armarLote(cola);
  if (!lote) return;
  cola.splice(0, lote.cuantas);
  const salio = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(RUTA, lote.cuerpo);
  if (!salio) {
    void fetch(RUTA, { method: "POST", body: lote.cuerpo, keepalive: true, headers: { "x-espera": "no", "content-type": "text/plain;charset=UTF-8" } }).catch(() => {});
  }
}

/**
 * La pestaña se ocultó: lo que se estaba midiendo se descarta (el navegador deja de dibujar y el tiempo escondido no es de la pantalla)
 * y lo medido se manda ya, por si no vuelve.
 */
export function alOcultarse() {
  enCurso = null;
  if (cuadro) cancelAnimationFrame(cuadro);
  cuadro = 0;
  mandarTiempos();
}
