// Modo oscuro (ADR-0336, Felipe 2026-10-05): las reglas PURAS del tema. Nada de DOM ni de almacenamiento aquí: eso vive en
// `tema-cliente.ts`. Esto es lo que se prueba sin navegador.
//
// El tema es una preferencia del APARATO, no de la cuenta: las cuentas de mostrador son compartidas por tienda (una tablet de
// TRU puede quedarse en oscuro de noche) y guardarla por cuenta exigiría una migración en producción por un gusto visual.
// Arranca en claro: nadie se encuentra el ERP distinto el día del despliegue. Solo cambia cuando alguien pulsa el botón.

export const TEMAS = ["claro", "oscuro"] as const;
export type Tema = (typeof TEMAS)[number];

export const TEMA_POR_DEFECTO: Tema = "claro";

/** Dónde se guarda lo que la persona eligió (localStorage del aparato). */
export const CLAVE_TEMA = "cayla-tema";

/** El atributo de `<html>` del que cuelgan los tokens oscuros (`app/estilos/tema.css`). Es el nombre que reservó ADR-0169. */
export const ATRIBUTO_TEMA = "data-tema";

export function esTema(valor: unknown): valor is Tema {
  return valor === "claro" || valor === "oscuro";
}

/** Lo guardado puede estar ausente, viejo o corrupto: todo lo que no sea un tema conocido cae al claro. */
export function resolverTema(guardado: unknown): Tema {
  return esTema(guardado) ? guardado : TEMA_POR_DEFECTO;
}

export function alternarTema(actual: Tema): Tema {
  return actual === "oscuro" ? "claro" : "oscuro";
}

/**
 * Los textos del botón. El NOMBRE accesible no cambia («Modo oscuro») y el estado va en `aria-pressed`: un lector de pantalla
 * dice «Modo oscuro, activado», no un nombre distinto cada vez. El `title` sí dice qué hará el clic.
 */
export function textosDelBoton(actual: Tema): { etiqueta: string; titulo: string } {
  return {
    etiqueta: "Modo oscuro",
    titulo: actual === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
  };
}

/**
 * El script que corre ANTES de la primera pintura (va en el `<head>` de `app/layout.tsx`): lee lo guardado y pone el atributo en
 * `<html>`. Sin él, una persona en oscuro vería un destello claro en cada carga. Siempre deja un valor puesto (nunca «sin
 * atributo»), y si el almacenamiento falla —ventana privada, datos bloqueados— cae al claro sin romper la página.
 * Es una cadena a propósito: se inyecta tal cual, y `tema-reglas.test.ts` la ejecuta contra un documento falso.
 */
export const SCRIPT_TEMA_ANTES_DE_PINTAR =
  `(function(){var d=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});` +
  `d.setAttribute(${JSON.stringify(ATRIBUTO_TEMA)},t==="oscuro"?"oscuro":"claro")}` +
  `catch(e){d.setAttribute(${JSON.stringify(ATRIBUTO_TEMA)},"claro")}})();`;
