// Modo oscuro (ADR-0336): lo que SÍ toca el navegador —el atributo de <html>, el almacenamiento, la transición—. La lógica que
// decide qué tema es cada cosa vive en `tema-reglas.ts` (pura y con pruebas). Solo se importa desde componentes cliente.

import { ATRIBUTO_TEMA, CLAVE_TEMA, resolverTema, type Tema } from "./tema-reglas";

/** El tema que está puesto AHORA: lo dice el atributo de <html>, que el script del `<head>` fijó antes de pintar. */
export function temaDelDocumento(): Tema {
  return resolverTema(document.documentElement.getAttribute(ATRIBUTO_TEMA));
}

function ponerAtributo(tema: Tema): void {
  document.documentElement.setAttribute(ATRIBUTO_TEMA, tema);
}

function guardarTema(tema: Tema): void {
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Ventana privada o datos bloqueados: el tema vale para esta carga y no se recuerda. No es un error que mostrar.
  }
}

/**
 * Cambia el tema y lo recuerda. Con la API de transiciones del navegador, la página entera se funde en ~280 ms (la regla de
 * movimiento de ADR-0136: corto, sin rebote, nunca decorativo); sin ella, o con `prefers-reduced-motion`, el cambio es instantáneo.
 */
export function cambiarTema(tema: Tema): void {
  if (tema === temaDelDocumento()) return;
  const aplicar = () => {
    ponerAtributo(tema);
    guardarTema(tema);
  };
  const sinMovimiento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const conTransicion = document as Document & { startViewTransition?: (cuando: () => void) => unknown };
  if (sinMovimiento || typeof conTransicion.startViewTransition !== "function") {
    aplicar();
    return;
  }
  conTransicion.startViewTransition(aplicar);
}

/**
 * Para `useSyncExternalStore`: avisa cuando cambia el atributo de <html> (por el botón o por otra pestaña). Además, si OTRA
 * pestaña del mismo aparato cambia el tema, esta lo adopta —el evento `storage` solo llega a las demás pestañas—.
 */
export function suscribirTema(avisar: () => void): () => void {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: [ATRIBUTO_TEMA] });
  const alCambiarOtraPestana = (e: StorageEvent) => {
    if (e.key === CLAVE_TEMA || e.key === null) ponerAtributo(resolverTema(e.newValue));
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    observador.disconnect();
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}
