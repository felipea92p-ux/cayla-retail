// Animaciones encendidas o quietas (ADR-0625): lo que SÍ toca el navegador —el atributo de <html>, el almacenamiento—. La lógica vive
// en `movimiento-reglas.ts` (pura y con pruebas).
//
// `prefiereQuieto()` es LA pregunta de toda pieza que anima desde JavaScript (una cifra que cuenta, un vuelo, un scroll suave, la
// salida de una hoja). Nadie pregunta `matchMedia("(prefers-reduced-motion: reduce)")` por su cuenta: no vería el botón. Lo vigila
// `lib/movimiento-reglas.test.ts`.

import {
  ATRIBUTO_MOVIMIENTO,
  CLAVE_MOVIMIENTO,
  quedaQuieto,
  resolverMovimiento,
  type Movimiento,
} from "./movimiento-reglas";

const PIDE_MENOS = "(prefers-reduced-motion: reduce)";

/** Lo que está puesto AHORA: lo dice el atributo de <html>, que el script del `<head>` fijó antes de pintar. */
export function movimientoDelDocumento(): Movimiento {
  if (typeof document === "undefined") return resolverMovimiento(null);
  return resolverMovimiento(document.documentElement.getAttribute(ATRIBUTO_MOVIMIENTO));
}

function sistemaPideMenos(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(PIDE_MENOS).matches === true;
}

/** ¿Esta pieza se queda quieta? Sí si la persona no encendió las animaciones o si el aparato pide menos movimiento. */
export function prefiereQuieto(): boolean {
  if (typeof window === "undefined") return true;
  return quedaQuieto(movimientoDelDocumento(), sistemaPideMenos());
}

function ponerAtributo(movimiento: Movimiento): void {
  document.documentElement.setAttribute(ATRIBUTO_MOVIMIENTO, movimiento);
}

/** Cambia y lo recuerda en este aparato. Sin almacenamiento (ventana privada) vale para esta carga. */
export function cambiarMovimiento(movimiento: Movimiento): void {
  ponerAtributo(movimiento);
  try {
    localStorage.setItem(CLAVE_MOVIMIENTO, movimiento);
  } catch {
    // Ventana privada o datos bloqueados: no es un error que mostrar.
  }
}

/**
 * Para `useSyncExternalStore`: avisa cuando cambia el atributo (por el botón o por otra pestaña) o la preferencia del sistema. Si
 * OTRA pestaña del aparato cambia, esta lo adopta (el evento `storage` solo llega a las demás pestañas).
 */
export function suscribirMovimiento(avisar: () => void): () => void {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: [ATRIBUTO_MOVIMIENTO] });
  const sistema = window.matchMedia?.(PIDE_MENOS);
  sistema?.addEventListener?.("change", avisar);
  const alCambiarOtraPestana = (e: StorageEvent) => {
    if (e.key === CLAVE_MOVIMIENTO || e.key === null) ponerAtributo(resolverMovimiento(e.newValue));
  };
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    observador.disconnect();
    sistema?.removeEventListener?.("change", avisar);
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}
