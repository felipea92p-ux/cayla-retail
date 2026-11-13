// Las animaciones del ERP, encendidas o quietas (ADR-0625, Felipe 2026-11-07): las reglas PURAS. Nada de DOM ni de almacenamiento
// aquí: eso vive en `movimiento-cliente.ts`. Esto es lo que se prueba sin navegador.
//
// Es una preferencia del APARATO, como el modo oscuro (ADR-0336): las cuentas de mostrador son compartidas por tienda y una terminal
// no tiene «Mi perfil». ARRANCA QUIETO: el ERP corre en equipos modestos y lo que se mueve cuesta; quien quiera las animaciones las
// enciende con el botón de la cabecera. Quieto apaga todo lo decorativo, pero NO las señales de espera (el hilo de «Guardando…» y el
// del loader): sin ellas un guardado lento parece colgado y la persona aprieta dos veces. Y si el aparato pide menos movimiento
// (`prefers-reduced-motion`), eso gana siempre: el botón no puede encender lo que el sistema operativo apagó.

export type Movimiento = "quieto" | "vivo";

export const MOVIMIENTO_POR_DEFECTO: Movimiento = "quieto";

/** Dónde se guarda lo que la persona eligió (localStorage del aparato). */
export const CLAVE_MOVIMIENTO = "cayla-movimiento";

/** El atributo de `<html>` del que cuelga el CSS que aquieta todo (`app/estilos/movimiento.css`). */
export const ATRIBUTO_MOVIMIENTO = "data-movimiento";

function esMovimiento(valor: unknown): valor is Movimiento {
  return valor === "quieto" || valor === "vivo";
}

/** Lo guardado puede estar ausente, viejo o corrupto: todo lo que no sea «vivo» cae a quieto. */
export function resolverMovimiento(guardado: unknown): Movimiento {
  return esMovimiento(guardado) ? guardado : MOVIMIENTO_POR_DEFECTO;
}

export function alternarMovimiento(actual: Movimiento): Movimiento {
  return actual === "vivo" ? "quieto" : "vivo";
}

/**
 * ¿Se anima? Solo si la persona lo encendió Y el aparato no pide menos movimiento. Es la pregunta que hacen todas las piezas que
 * animan desde JavaScript (`prefiereQuieto()` la responde con lo que hay en la página).
 */
export function quedaQuieto(movimiento: Movimiento, sistemaPideMenos: boolean): boolean {
  return sistemaPideMenos || movimiento === "quieto";
}

/**
 * Los textos del botón. El NOMBRE accesible no cambia («Animaciones») y el estado va en `aria-pressed`, como el del modo oscuro. El
 * `title` dice qué hará el clic.
 */
export function textosDelBotonMovimiento(actual: Movimiento): { etiqueta: string; titulo: string } {
  return {
    etiqueta: "Animaciones",
    titulo: actual === "vivo" ? "Apagar las animaciones" : "Encender las animaciones",
  };
}

/**
 * El script que corre ANTES de la primera pintura (va en el `<head>` de `app/layout.tsx`, junto al del tema): lee lo guardado y pone
 * el atributo en `<html>`. Sin él, una hoja o una cascada alcanzarían a animarse antes de que React se entere. Siempre deja un valor
 * puesto y, si el almacenamiento falla, cae a quieto. Es una cadena a propósito: `movimiento-reglas.test.ts` la ejecuta.
 */
export const SCRIPT_MOVIMIENTO_ANTES_DE_PINTAR =
  `(function(){var d=document.documentElement;try{var m=localStorage.getItem(${JSON.stringify(CLAVE_MOVIMIENTO)});` +
  `d.setAttribute(${JSON.stringify(ATRIBUTO_MOVIMIENTO)},m==="vivo"?"vivo":"quieto")}` +
  `catch(e){d.setAttribute(${JSON.stringify(ATRIBUTO_MOVIMIENTO)},"quieto")}})();`;
