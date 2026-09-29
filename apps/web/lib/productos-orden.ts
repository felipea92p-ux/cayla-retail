// Cómo se ordena el listado de Productos (`/productos?orden=`). Lo comparten el servidor (que valida la URL y se la pasa a
// `fn_productos`) y el cliente (el desplegable «Ordenar por» y su chip), para que una opción nueva se escriba una sola vez.
//
// Felipe, 2026-09-29: «en los filtros… productos recientes, viejos, más comprados». Sin `orden` el listado va por nombre
// (A–Z), como siempre; las seis de abajo son las que se piden en la URL. Las cuatro nuevas viven en la base
// (`20260929180000_productos_orden_recientes_y_vendidos.sql`): el orden se decide antes de cortar la página, no en la pantalla.

export const ORDENES_PRODUCTOS = ["recientes", "antiguos", "vendidos_desc", "vendidos_asc", "precio_asc", "precio_desc"] as const;
export type OrdenProductos = (typeof ORDENES_PRODUCTOS)[number];

/** Las que van en el desplegable «Ordenar». Las de precio siguen siendo las dos flechas del panel (Felipe, 2026-09-17: «nada
 *  de texto tipo Relevancia»): una sola URL (`orden`), dos controles, nunca las dos a la vez. */
export const ORDENES_DESPLEGABLE = ["recientes", "antiguos", "vendidos_desc", "vendidos_asc"] as const satisfies readonly OrdenProductos[];

/** Lo que dice cada opción en el desplegable y en el chip. «Más vendidos» son las unidades que salieron por venta en los
 *  últimos 30 días, en toda la red: es la misma ventana que usa «Pedir a proveedor», así que las dos pantallas hablan igual. */
export const ROTULO_ORDEN_PRODUCTOS: Record<OrdenProductos, string> = {
  recientes: "Más recientes",
  antiguos: "Más antiguos",
  vendidos_desc: "Más vendidos (30 días)",
  vendidos_asc: "Menos vendidos (30 días)",
  precio_asc: "Precio: menor a mayor",
  precio_desc: "Precio: mayor a menor",
};

/** El orden de la URL, o `undefined` (por nombre) si falta o no es una opción: una URL a mano no rompe la pantalla. */
export function leerOrdenProductos(valor: string | null | undefined): OrdenProductos | undefined {
  return (ORDENES_PRODUCTOS as readonly string[]).includes(valor ?? "") ? (valor as OrdenProductos) : undefined;
}

/** Las de ventas piden a la base sumar movimientos; las demás salen de columnas del producto. Sirve a quien quiera avisar
 *  «esto tarda un poco más» o medir. */
export function ordenPorVentas(orden: OrdenProductos | undefined): boolean {
  return orden === "vendidos_desc" || orden === "vendidos_asc";
}
