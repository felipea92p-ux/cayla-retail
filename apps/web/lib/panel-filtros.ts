// Si el panel de filtros de Productos se ve abierto o cerrado al entrar (Felipe, 2026-10-02): abierto por defecto en la
// computadora, y si alguien lo cierra, en ESE equipo vuelve cerrado (la tablet del mostrador que solo busca no carga con él).
// En el celular no aplica: ahí los filtros viven en una hoja que se abre con el botón «Filtros».
//
// Cookie y no localStorage, igual que `tamano-grilla.ts`: el servidor la lee y la primera pintura ya sale como la persona
// la dejó, sin que el panel aparezca y desaparezca al hidratar. Es una preferencia de pantalla de esta máquina.

export const COOKIE_PANEL_FILTROS = "cayla_filtros_panel";
/** Existencias tiene la misma barra (2026-10-03) pero su propia preferencia: cerrar el panel en Existencias no lo cierra en
 *  Productos (la tablet que solo busca prendas puede querer los filtros de stock a la vista). */
export const COOKIE_PANEL_FILTROS_EXISTENCIAS = "cayla_filtros_panel_existencias";
export type EstadoPanelFiltros = "abierto" | "cerrado";

/** Una cookie que falta o trae otra cosa deja el de fábrica: abierto en Productos; cerrado en Existencias desde su rediseño
 *  (2026-10-04), donde la primera pantalla es el buscador y «Para hoy», y el panel de seis píldoras abierto empujaba las
 *  prendas bajo el pliegue. Lo que alguien ya dejó guardado en su equipo manda sobre el de fábrica. */
export function leerPanelFiltros(valor: string | null | undefined, deFabrica: EstadoPanelFiltros = "abierto"): EstadoPanelFiltros {
  return valor === "cerrado" || valor === "abierto" ? valor : deFabrica;
}

/** Guarda la preferencia (solo desde el navegador). Un año; `SameSite=Lax` alcanza: el servidor solo la lee al pintar. */
export function guardarPanelFiltros(estado: EstadoPanelFiltros, cookie: string = COOKIE_PANEL_FILTROS) {
  document.cookie = `${cookie}=${estado}; path=/; max-age=31536000; samesite=lax`;
}
