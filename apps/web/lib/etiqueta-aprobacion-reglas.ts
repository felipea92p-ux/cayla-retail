// Aprobar (o reactivar) una etiqueta: lo que la pantalla le promete a la base y lo que le dice a quien lo hace.
//
// CONTRATO. Pasar una etiqueta a 'aprobado' —desde pendiente, o reactivando una rechazada— exige un comentario en
// `etiquetas.notas`: el trigger `retail.fn_etiquetas_estado_trigger` lo hace cumplir (20260917230000, Felipe 2026-09-17:
// «exigir motivo siempre»). La pantalla nació antes de esa regla y mandaba `{ id, estado: "aprobado" }` a secas: la base
// contestaba «Aprobar una etiqueta exige un comentario breve…» y ninguna propuesta pendiente se podía aprobar
// (verificado con las cuentas del seed, 2026-09-26). Por eso el cuerpo que aprueba se arma SOLO aquí: sin comentario no
// hay cuerpo, y la pantalla no tiene forma de mandar la petición coja.
//
// Dos cosas que tampoco se ven de un vistazo:
//  · Reactivar una rechazada es la misma transición estado → 'aprobado', así que pide comentario nuevo. Antes «pasaba»
//    cuando el rechazo había dejado su motivo en `notas` (p. ej. «Ya existe Oferta»): ese motivo quedaba de descripción
//    de una etiqueta ya aprobada, y se mostraba como su ayuda.
//  · Mientras una propuesta está pendiente NO se puede usar: el alta de producto solo acepta etiquetas aprobadas y activas
//    (`crear_producto_con_variantes`), «Prendas» también (`etiquetar_variantes`), y las listas de la web solo ofrecen
//    aprobadas. Por eso el aviso de una propuesta no promete «ya la puedes usar».

export type EstadoEtiqueta = "pendiente" | "aprobado" | "rechazado";

export type CuerpoAprobarEtiqueta = { id: string; estado: "aprobado"; notas: string };

/** El cuerpo del PATCH que aprueba o reactiva; `null` mientras el comentario esté vacío (la pantalla no deja enviarlo). */
export function cuerpoAprobarEtiqueta(id: string, comentario: string): CuerpoAprobarEtiqueta | null {
  const notas = comentario.trim();
  return notas ? { id, estado: "aprobado", notas } : null;
}

/** «Reactivar» solo para una rechazada; lo demás es aprobar una propuesta. */
export function verboAprobacion(estado: EstadoEtiqueta): "Aprobar" | "Reactivar" {
  return estado === "rechazado" ? "Reactivar" : "Aprobar";
}

/** Para qué se pide el comentario, en palabras del negocio (la base solo dice «exige un comentario breve»). */
export const AYUDA_COMENTARIO_APROBAR =
  "Una línea para quien etiquete después: para qué sirve y en qué se distingue de las etiquetas que ya existen. Se muestra como ayuda junto al nombre.";

/** El aviso al agregar una etiqueta. Una propuesta (pendiente) dice la verdad: hasta que un Líder la apruebe, no se puede usar. */
export function avisoEtiquetaAgregada(nombre: string, estado: EstadoEtiqueta): { titulo: string; detalle?: string } {
  if (estado === "pendiente") {
    return { titulo: `${nombre} propuesta`, detalle: "Un Líder tiene que aprobarla antes de que la puedas poner en una prenda." };
  }
  return { titulo: `Etiqueta ${nombre} agregada` };
}
