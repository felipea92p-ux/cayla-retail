"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { MARCA_HOJA, conservaMarca, cualesPoner, cuantasRetirar, decidirAlVolver, type HojaEnPila } from "@/lib/hojas-atras";

/* ====================================================================
   useAtrasCierraLaHoja · «atrás» cierra la hoja de arriba, no la pantalla (ADR-0528, Felipe 2026-10-26)

   En el teléfono, el botón «atrás» y el gesto desde el borde son la forma natural de quitarse una hoja de encima. Sin esto,
   «atrás» dejaba la hoja abierta y llevaba a la pantalla anterior. `<Modal>` y `<Cajon>` lo piden solos bajo 640 px; ninguna
   pantalla hace nada. Cómo:
     · UNA pila para todo el ERP (este módulo): cada hoja abierta, en orden, con una entrada de historial con la MISMA URL y su
       marca. Solo la de arriba responde: un «atrás» = una hoja (la foto sobre la prenda, el «¿Salir sin guardar?» sobre el
       formulario, el cajón sobre la lista).
     · «Atrás» consume la entrada de la hoja de arriba y pide su cierre por la puerta de la ✕ (`antesDeCerrar` de `<Modal>`): con
       cambios pregunta, y si la persona sigue editando, la entrada se vuelve a poner sola.
     · Una hoja que se cierra por otro lado (la ✕, Escape, el dedo, guardar) deja de estar en la pila y su entrada se retira con
       un «atrás» propio; si cerraron varias, uno solo (`history.go(-n)`). Todo se reconcilia en `sincronizar`, una vez por tarea.
     · Si se navegó desde una hoja, su entrada queda enterrada bajo la pantalla nueva: volver a ella desde esa pantalla la salta
       (`decidirAlVolver` → «saltar»), así un «atrás» lleva a la pantalla de antes y no a una entrada vacía.
   El `popstate` de la persona sobre una hoja y el de cada retiro propio se cortan en la CAPTURA de `window`: la URL no cambió y el
   router de Next, si restaurara el árbol de la entrada de abajo, podría volver a montar la pantalla entera (ver
   `useSalidaSinGuardar`, 2026-10-08). La lógica sin navegador, con su prueba: `lib/hojas-atras.ts`.
   ==================================================================== */

type Hoja = HojaEnPila & { pedirCierre: () => void };

/** Distinto en cada carga: una entrada que sobrevive a una recarga no se confunde con la de una hoja nueva. */
const SESION = `-${Date.now().toString(36)}`;

/** Las hojas abiertas que cierran con «atrás», en el orden en que se abrieron. */
let pila: Hoja[] = [];
/** Las entradas nuestras que siguen en el historial, de abajo arriba (ids). */
let entradas: string[] = [];
/** Un «atrás» propio en camino (retirar o saltar): su `popstate` se corta y, al llegar, se vuelve a sincronizar. */
let enCamino = false;
/** Saltando entradas huérfanas: se sigue mientras se caiga en otra. */
let saltando = false;
let respaldo: number | undefined;
let programado = false;
/** La última URL vista: la registran `pushState`, `replaceState` y cada `popstate` (para saber desde qué página se volvió). */
let urlConocida = typeof window === "undefined" ? "" : window.location.href;

const avisar = new Set<() => void>();
const notificar = () => avisar.forEach((f) => f());

const paginaDe = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};
const paginaActual = () => window.location.pathname;
const marcaActual = (): string | null => {
  const m = (window.history.state as Record<string, unknown> | null)?.[MARCA_HOJA];
  return typeof m === "string" ? m : null;
};
const abiertas = () => pila.map((h) => h.id);

/** El estado de la entrada nueva: el de Next (para que su router no pierda el árbol) con la marca de la hoja. Sin la marca de la
 *  guardia de «¿Salir sin guardar?»: copiada, su retiro se llevaría esta entrada en vez de la suya. */
function estadoConMarca(id: string) {
  const estado: Record<string, unknown> = { ...(window.history.state ?? {}), [MARCA_HOJA]: id };
  delete estado.__guardiaSalida;
  return estado;
}

function irAtras(n: number) {
  enCamino = true;
  window.clearTimeout(respaldo);
  // Si el navegador no estaba en condiciones de volver (el primer paso del historial), el `popstate` no llega: no se espera para siempre.
  respaldo = window.setTimeout(() => {
    if (!enCamino) return;
    enCamino = false;
    saltando = false;
    programar();
  }, 1000);
  window.history.go(-n);
}

function sincronizar() {
  programado = false;
  if (enCamino) return;
  const ultima = entradas[entradas.length - 1];
  if (ultima !== undefined && marcaActual() !== ultima) {
    // Encima de nuestras entradas hay otra: se navegó con hojas abiertas (o se abrió una página encima de una hoja). Con la pila
    // vacía, las que quedaron debajo son huérfanas y se olvidan (el `popstate` las salta si se vuelve a ellas); con hojas
    // abiertas, no se toca nada hasta volver.
    if (pila.length === 0) entradas = [];
    notificar();
    return;
  }
  const n = cuantasRetirar(entradas, abiertas());
  if (n > 0) {
    entradas = entradas.slice(0, entradas.length - n);
    notificar();
    irAtras(n);
    return;
  }
  for (const h of cualesPoner(pila, entradas, paginaActual())) {
    window.history.pushState(estadoConMarca(h.id), "", window.location.href);
    entradas.push(h.id);
  }
  notificar();
}

/** Una vez por tarea: abrir y cerrar en el mismo instante (una hoja que reemplaza a otra) se resuelve junto. */
function programar() {
  if (programado) return;
  programado = true;
  window.setTimeout(sincronizar, 0);
}

function alVolver(e: PopStateEvent) {
  const paginaAntes = paginaDe(urlConocida);
  urlConocida = window.location.href;
  if (enCamino) {
    enCamino = false;
    window.clearTimeout(respaldo);
    e.stopImmediatePropagation();
    // Se cayó en otra huérfana: se sigue saltando.
    const m = marcaActual();
    if (saltando && m && !abiertas().includes(m)) return irAtras(1);
    saltando = false;
    programar();
    return;
  }
  const arriba = pila[pila.length - 1] ?? null;
  const marca = marcaActual();
  const decision = decidirAlVolver({ marca, pagina: paginaActual(), paginaAntes, arriba, abiertas: abiertas() });
  if (decision === "cerrar" && arriba) {
    e.stopImmediatePropagation();
    // La entrada de la hoja quedó adelante: se descuenta. Si la hoja no se cierra (pregunta, o está guardando), `sincronizar` se la devuelve.
    const i = marca ? entradas.indexOf(marca) : -1;
    entradas = entradas.slice(0, i + 1);
    arriba.pedirCierre();
    programar();
  } else if (decision === "saltar") {
    // Esta vuelta es de verdad (otra pantalla): el router la dibuja. Después se salta la entrada vacía, hacia atrás.
    window.setTimeout(() => {
      if (enCamino) return;
      saltando = true;
      irAtras(1);
    }, 0);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", alVolver, { capture: true });
  /* Se envuelven `pushState` y `replaceState` para dos cosas: saber la última URL vista (desde qué página se vuelve) y que un
     `replaceState` de la misma página no le borre la marca a la entrada de una hoja (Next la reescribe sin copiar lo ajeno en
     cada `router.refresh()`: `conservaMarca`). Funciona en cualquier orden con el parche que Next pone a los mismos métodos. */
  const empujar = window.history.pushState.bind(window.history);
  const reemplazar = window.history.replaceState.bind(window.history);
  window.history.pushState = function pushState(data, unused, url) {
    const r = empujar(data, unused, url);
    urlConocida = window.location.href;
    return r;
  };
  window.history.replaceState = function replaceState(data, unused, url) {
    const marca = marcaActual();
    const destino = url == null ? window.location.href : new URL(String(url), window.location.href).href;
    if (marca && data && typeof data === "object" && !(MARCA_HOJA in data) && conservaMarca(paginaActual(), paginaDe(destino))) {
      data = { ...data, [MARCA_HOJA]: marca };
    }
    const r = reemplazar(data, unused, url);
    urlConocida = window.location.href;
    return r;
  };
}

/** ¿Hay hojas con «atrás» abiertas, o entradas suyas todavía en el historial? Mientras tanto la guardia de «¿Salir sin
 *  guardar?» no pone ni retira la suya (`useSalidaSinGuardar`): dos dueños del mismo «atrás» se pisaban. */
export function hojasEnElHistorial(): boolean {
  return pila.length > 0 || entradas.length > 0 || enCamino;
}

/** Hace `hacer` cuando ya no queda ninguna hoja ni entrada suya (en el momento, si no hay). Para quien va a recorrer el historial
 *  después de cerrar una hoja: la guardia sale con «atrás» cuando su pregunta («¿Salir sin guardar?», otra hoja) retiró su entrada;
 *  si no, su `go(-2)` contaba la entrada de la pregunta y la persona se quedaba en la pantalla. */
export function cuandoSinHojas(hacer: () => void) {
  if (!hojasEnElHistorial()) return hacer();
  const alAsentarse = () => {
    if (hojasEnElHistorial()) return;
    avisar.delete(alAsentarse);
    hacer();
  };
  avisar.add(alAsentarse);
}

export function useHojasEnElHistorial(): boolean {
  return useSyncExternalStore(
    (f) => {
      avisar.add(f);
      return () => avisar.delete(f);
    },
    hojasEnElHistorial,
    () => false
  );
}

/**
 * La hoja entra a la pila mientras `activo` (abierta y sin estar cerrándose) y `pedirCierre` es su puerta de la ✕. Al dejar de
 * estar activa (se cierra, o se desmonta) sale de la pila y su entrada se retira.
 */
export function useAtrasCierraLaHoja(activo: boolean, pedirCierre: () => void) {
  const id = `hoja${useId()}${SESION}`;
  const pedirCierreActual = useRef(pedirCierre);
  useEffect(() => {
    pedirCierreActual.current = pedirCierre;
  }, [pedirCierre]);

  useEffect(() => {
    if (!activo) return;
    pila = [...pila.filter((h) => h.id !== id), { id, pagina: paginaActual(), pedirCierre: () => pedirCierreActual.current() }];
    programar();
    return () => {
      pila = pila.filter((h) => h.id !== id);
      programar();
    };
  }, [activo, id]);
}
