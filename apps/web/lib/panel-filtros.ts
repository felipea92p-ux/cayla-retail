// Si el panel de filtros de Productos se ve abierto o cerrado al entrar (Felipe, 2026-10-02): abierto por defecto en la
// computadora, y si alguien lo cierra, en ESE equipo vuelve cerrado (la tablet del mostrador que solo busca no carga con él).
// En el celular no aplica: ahí los filtros viven en una hoja que se abre con el botón «Filtros».
//
// Cookie y no localStorage, igual que `tamano-grilla.ts`: el servidor la lee y la primera pintura ya sale como la persona
// la dejó, sin que el panel aparezca y desaparezca al hidratar. Es una preferencia de pantalla de esta máquina.

export const COOKIE_PANEL_FILTROS = "cayla_filtros_panel";
export type EstadoPanelFiltros = "abierto" | "cerrado";

/** Solo «cerrado» lo cierra: una cookie que falta o trae otra cosa deja el de fábrica, abierto. */
export function leerPanelFiltros(valor: string | null | undefined): EstadoPanelFiltros {
  return valor === "cerrado" ? "cerrado" : "abierto";
}

/** Guarda la preferencia (solo desde el navegador). Un año; `SameSite=Lax` alcanza: el servidor solo la lee al pintar. */
export function guardarPanelFiltros(estado: EstadoPanelFiltros) {
  document.cookie = `${COOKIE_PANEL_FILTROS}=${estado}; path=/; max-age=31536000; samesite=lax`;
}
