// El modo liviano (ADR-0674): lo que SÍ toca el navegador —el atributo de <html>, el almacenamiento—. La lógica vive en
// `liviano-reglas.ts` (pura y con pruebas).

import { leerEquipo } from "./clase-de-equipo";
import { ATRIBUTO_LIVIANO, CLAVE_LIVIANO, resolverLiviano, type Liviano } from "./liviano-reglas";

function equipoDeEsteAparato() {
  if (typeof navigator === "undefined") return leerEquipo(null);
  return leerEquipo(navigator, window.matchMedia?.("(pointer: coarse)").matches === true);
}

/** Lo que está puesto AHORA: lo dice el atributo de <html>, que el script del `<head>` fijó antes de pintar. */
export function livianoDelDocumento(): Liviano {
  if (typeof document === "undefined") return "no";
  return document.documentElement.getAttribute(ATRIBUTO_LIVIANO) === "si" ? "si" : "no";
}

function ponerAtributo(liviano: Liviano): void {
  document.documentElement.setAttribute(ATRIBUTO_LIVIANO, liviano);
}

/** Lo que eligió la persona: se pone ya y se recuerda en este aparato. Sin almacenamiento (ventana privada) vale para esta carga. */
export function cambiarLiviano(liviano: Liviano): void {
  ponerAtributo(liviano);
  try {
    localStorage.setItem(CLAVE_LIVIANO, liviano);
  } catch {
    // Ventana privada o datos bloqueados: no es un error que mostrar.
  }
}

/**
 * Para `useSyncExternalStore`: avisa cuando cambia el atributo (por el botón o por otra pestaña). Si OTRA pestaña del aparato cambia,
 * esta lo adopta; si allá se borró lo guardado, vuelve a decidir el equipo.
 */
export function suscribirLiviano(avisar: () => void): () => void {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: [ATRIBUTO_LIVIANO] });
  const alCambiarOtraPestana = (e: StorageEvent) => {
    if (e.key === CLAVE_LIVIANO || e.key === null) ponerAtributo(resolverLiviano(e.newValue, equipoDeEsteAparato()));
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    observador.disconnect();
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}
