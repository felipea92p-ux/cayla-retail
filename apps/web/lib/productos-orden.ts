// Cómo se ordena el listado de Productos (`/productos?orden=`). Lo comparten el servidor (que valida la URL y se la pasa a
// `fn_productos`) y el cliente (el desplegable «Ordenar por» y su chip), para que una opción nueva se escriba una sola vez.
//
// Felipe, 2026-09-29: «en los filtros… productos recientes, viejos, más comprados». Sin `orden` el listado va por nombre
// (A–Z), como siempre; las seis de abajo son las que se piden en la URL. Las cuatro nuevas viven en la base
// (`20260929180000_productos_orden_recientes_y_vendidos.sql`): el orden se decide antes de cortar la página, no en la pantalla.

export const ORDENES_PRODUCTOS = ["recientes", "antiguos", "vendidos_desc", "vendidos_asc", "precio_asc", "precio_desc"] as const;
export type OrdenProductos = (typeof ORDENES_PRODUCTOS)[number];

/** Lo que se elige en el único «Ordenar por» de la pantalla (Felipe, 2026-10-02): las seis de la base más «nombre», que
 *  en la base es «sin orden» (por referencia). Antes había dos controles para el mismo dato (flechas de precio + desplegable)
 *  dentro del panel de filtros; ahora es uno, fuera del panel, junto al conteo. En el orden en que se leen en la lista. */
export const ORDENES_MENU = ["recientes", "nombre", "precio_asc", "precio_desc", "antiguos", "vendidos_desc", "vendidos_asc"] as const;
export type OrdenListado = (typeof ORDENES_MENU)[number];

/** Con qué abre la lista (Felipe, 2026-10-02: «Más recientes primero»): la carga del catálogo sigue y quien carga ve
 *  enseguida lo que acaba de crear. Va SIN escribirse en la URL, así que «Nombre (A–Z)» sí se escribe (`orden=nombre`). */
export const ORDEN_POR_DEFECTO: OrdenListado = "recientes";

/** Lo que dice cada opción en el desplegable y en el chip. «Más vendidos» son las unidades que salieron por venta en los
 *  últimos 30 días, en toda la red: es la misma ventana que usa «Pedir a proveedor», así que las dos pantallas hablan igual. */
export const ROTULO_ORDEN_PRODUCTOS: Record<OrdenListado, string> = {
  recientes: "Más recientes",
  nombre: "Nombre (A–Z)",
  antiguos: "Más antiguos",
  vendidos_desc: "Más vendidos (30 días)",
  vendidos_asc: "Menos vendidos (30 días)",
  // Sin «Precio: …»: en la píldora se lee «Ordenar por: Precio más bajo», no «Ordenar por: Precio: menor a mayor».
  precio_asc: "Precio más bajo",
  precio_desc: "Precio más alto",
};

/** El orden que pide la URL; si falta o no es una opción (una URL a mano), el de fábrica: la pantalla no se rompe. */
export function ordenDeUrl(valor: string | null | undefined): OrdenListado {
  return (ORDENES_MENU as readonly string[]).includes(valor ?? "") ? (valor as OrdenListado) : ORDEN_POR_DEFECTO;
}

/** Lo que entiende `fn_productos`: «nombre» es su orden sin parámetro (por referencia). */
export function ordenParaBase(orden: OrdenListado): OrdenProductos | undefined {
  return orden === "nombre" ? undefined : orden;
}

/** El orden de la URL tal como lo pide la base (`undefined` = por nombre). */
export function leerOrdenProductos(valor: string | null | undefined): OrdenProductos | undefined {
  return ordenParaBase(ordenDeUrl(valor));
}

/** Las de ventas piden a la base sumar movimientos; las demás salen de columnas del producto. Sirve a quien quiera avisar
 *  «esto tarda un poco más» o medir. */
export function ordenPorVentas(orden: OrdenProductos | undefined): boolean {
  return orden === "vendidos_desc" || orden === "vendidos_asc";
}
