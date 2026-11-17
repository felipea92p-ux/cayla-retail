// El modo liviano (ADR-0674): lo que SÍ toca el navegador —el atributo de <html>, el almacenamiento—. La lógica vive en
// `liviano-reglas.ts` (pura y con pruebas).

import { leerEquipo } from "./clase-de-equipo";
import { ATRIBUTO_LIVIANO, CLAVE_LIVIANO, livianoEsAutomatico, resolverLiviano, type Liviano } from "./liviano-reglas";

/** Aviso entre las piezas de ESTA pestaña: volver a automático puede no cambiar el atributo (el equipo pide lo mismo que había) y aun así
 *  la hoja «Apariencia» tiene que pasar de «Volver a automático» a «Automático». */
const EVENTO_LIVIANO = "cayla-liviano";

/** Lo que se eligió en una ventana privada, donde no se puede guardar: vale para esta carga y no se muestra como «Automático». */
let eleccionSinGuardar: Liviano | null = null;

function equipoDeEsteAparato() {
  if (typeof navigator === "undefined") return leerEquipo(null);
  return leerEquipo(navigator, window.matchMedia?.("(pointer: coarse)").matches === true);
}

/** Lo que está puesto AHORA: lo dice el atributo de <html>, que el script del `<head>` fijó antes de pintar. */
export function livianoDelDocumento(): Liviano {
  if (typeof document === "undefined") return "no";
  return document.documentElement.getAttribute(ATRIBUTO_LIVIANO) === "si" ? "si" : "no";
}

function leerGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_LIVIANO);
  } catch {
    return null;
  }
}

/** ¿Lo está decidiendo el equipo? Mientras nadie lo cambió a mano en este aparato (`livianoEsAutomatico`). */
export function livianoEsAutomaticoAqui(): boolean {
  if (typeof window === "undefined") return true;
  return eleccionSinGuardar === null && livianoEsAutomatico(leerGuardado());
}

function ponerAtributo(liviano: Liviano): void {
  document.documentElement.setAttribute(ATRIBUTO_LIVIANO, liviano);
}

function avisarCambio(): void {
  window.dispatchEvent(new Event(EVENTO_LIVIANO));
}

/** Lo que eligió la persona: se pone ya y se recuerda en este aparato. Sin almacenamiento (ventana privada) vale para esta carga. */
export function cambiarLiviano(liviano: Liviano): void {
  ponerAtributo(liviano);
  try {
    localStorage.setItem(CLAVE_LIVIANO, liviano);
    eleccionSinGuardar = null;
  } catch {
    // Ventana privada o datos bloqueados: no es un error que mostrar.
    eleccionSinGuardar = liviano;
  }
  avisarCambio();
}

/** «Volver a automático»: se olvida lo elegido y decide el equipo, ahora y en cada carga (el script del `<head>` ve que no hay nada). */
export function volverLivianoAutomatico(): void {
  try {
    localStorage.removeItem(CLAVE_LIVIANO);
  } catch {
    // Sin almacenamiento no había nada guardado que borrar.
  }
  eleccionSinGuardar = null;
  ponerAtributo(resolverLiviano(null, equipoDeEsteAparato()));
  avisarCambio();
}

/**
 * Para `useSyncExternalStore`: avisa cuando cambia el atributo, cuando se elige o se vuelve a automático, y cuando otra pestaña del
 * aparato cambia algo. Si OTRA pestaña cambia, esta lo adopta; si allá se volvió a automático, aquí vuelve a decidir el equipo.
 */
export function suscribirLiviano(avisar: () => void): () => void {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: [ATRIBUTO_LIVIANO] });
  const alCambiarOtraPestana = (e: StorageEvent) => {
    if (e.key !== CLAVE_LIVIANO && e.key !== null) return;
    ponerAtributo(resolverLiviano(e.newValue, equipoDeEsteAparato()));
    avisar();
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  window.addEventListener(EVENTO_LIVIANO, avisar);
  return () => {
    observador.disconnect();
    window.removeEventListener("storage", alCambiarOtraPestana);
    window.removeEventListener(EVENTO_LIVIANO, avisar);
  };
}
