/**
 * Textos de la confirmación que abren los botones de un clic del Catálogo (Aprobar, Desactivar, Reactivar), con el
 * combo «Responsable» adentro (Felipe, 2026-09-23 — maqueta `docs/maquetas/catalogo-responsable-confirmacion-2026-09/`).
 *
 * EL PROBLEMA. Esos botones guardan sin abrir ninguna ventana, así que el combo vivía arriba de la lista: con la
 * cuenta de una persona ya trae su nombre y solo ocupaba espacio, y al agregar o editar aparecía dos veces. Ahora
 * cada acción de un clic pide confirmar en una ventana corta, y el combo sale solo ahí.
 *
 * Neutros en género a propósito: sirven igual para «la talla», «el color» o «la marca».
 */
export type AccionCatalogo = "aprobar" | "desactivar" | "reactivar" | "eliminar";

export type Confirmacion = {
  titulo: string;
  bajada: string;
  /** El texto del botón que confirma. */
  verbo: string;
  /** Lo que se guarda al confirmar. La ventana se cierra cuando termina (salga bien o mal: el aviso ya lo dice). */
  accion: () => Promise<unknown>;
};

const VERBO: Record<AccionCatalogo, string> = { aprobar: "Aprobar", desactivar: "Desactivar", reactivar: "Reactivar", eliminar: "Eliminar" };

const BAJADA: Record<AccionCatalogo, string> = {
  aprobar: "Queda disponible para cualquier prenda nueva.",
  desactivar: "Deja de aparecer al crear prendas nuevas. Las prendas que ya existen no cambian.",
  reactivar: "Vuelve a aparecer al crear prendas nuevas.",
  // Solo se ofrece cuando ninguna prenda la tiene (`sePuedeEliminarMarca`); con prendas, lo que corresponde es desactivar.
  eliminar: "Se borra para siempre y no se puede deshacer. Si solo quieres que no aparezca al crear prendas nuevas, desactívala.",
};

export function confirmacionCatalogo(que: AccionCatalogo, nombre: string, accion: () => Promise<unknown>, bajada?: string): Confirmacion {
  return { titulo: `¿${VERBO[que]} «${nombre}»?`, bajada: bajada ?? BAJADA[que], verbo: VERBO[que], accion };
}
