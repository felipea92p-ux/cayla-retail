import type { Apartado } from "./separaciones-reglas";

/**
 * Las pestañas de Apartados (ADR-0720): «Apartar», «Pendientes» e «Historial». Cada apartado sale en un solo lugar: «Pendientes» es lo que
 * sigue vivo y su número es el de filas de la lista (antes, la pestaña decía 4 y ninguna lista tenía 4 filas).
 */

/** Lo que va en «Pendientes»: lo que sigue abierto, se venza hoy, mañana o más adelante. */
export const enPendientes = (a: Pick<Apartado, "estado">) => a.estado === "abierta";

/** El número de la pestaña «Pendientes»: el de filas de su lista. */
export const cuantosPendientes = (apartados: readonly Pick<Apartado, "estado">[]) => apartados.filter(enPendientes).length;
