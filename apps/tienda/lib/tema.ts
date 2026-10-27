// El tema de la tienda: claro, oscuro o el del aparato (automático). Lo que decide el CSS es el atributo `data-theme` de `<html>` («light» o «dark»;
// sin atributo manda `prefers-color-scheme`, `app/globals.css`). Aquí vive la parte pura: qué se guarda, qué atributo le toca a cada elección y el script que lo
// pone ANTES de que la página se pinte (sin él, quien eligió oscuro vería un destello blanco en cada visita). Con su prueba.

export type Tema = "auto" | "claro" | "oscuro";

/** Dónde se guarda la elección, en el navegador de esa persona (nunca viaja a ningún servidor). */
export const CLAVE_DEL_TEMA = "cayla-tema";

/** Lo guardado, leído con cuidado: cualquier cosa que no sea «claro» u «oscuro» es automático (un valor viejo o un almacén roto no rompen nada). */
export function temaGuardado(valor: string | null | undefined): Tema {
  return valor === "claro" || valor === "oscuro" ? valor : "auto";
}

/** El atributo de `<html>` para una elección: ninguno si es automático (manda el aparato). */
export function atributoDelTema(tema: Tema): "light" | "dark" | null {
  return tema === "claro" ? "light" : tema === "oscuro" ? "dark" : null;
}

/** La elección que sigue al tocar el botón: automático → claro → oscuro → automático. */
export function temaSiguiente(tema: Tema): Tema {
  return tema === "auto" ? "claro" : tema === "claro" ? "oscuro" : "auto";
}

/** Corre en el `<head>` antes de pintar: lee la elección y, si hay, marca `<html>`. Sin almacén (ventana privada), no hace nada: manda el aparato. */
export const SCRIPT_DEL_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(CLAVE_DEL_TEMA)});var d=document.documentElement;if(t==="claro")d.setAttribute("data-theme","light");else if(t==="oscuro")d.setAttribute("data-theme","dark");}catch(e){}`;
