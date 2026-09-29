/**
 * Las acciones que Felipe soltó del combo «Responsable» (2026-09-29) — la lista viva de lo que la web deja de preguntar.
 *
 * EL PROBLEMA. El combo «Responsable» (ADR-0161) se pedía en 149 lugares de la web. Felipe los repasó uno por uno y
 * marcó 30 donde estorba más de lo que ayuda (28 quedaron sueltas: ver ADR-0279): el alta de producto lo pedía hasta 9 veces seguidas, aprobar o rechazar un
 * valor del Catálogo, adjuntar un archivo a una factura, cerrar un conteo, recibir un traslado…
 *
 * LA REGLA. Esas acciones se guardan sin elegir a nadie. La pantalla ya no pinta el combo y manda el encabezado
 * `x-responsable-omitido: <clave>`; la base (`retail.acciones_sin_responsable`, migración 20260929230000) lo respeta SOLO
 * si la clave está en su lista. Con la cuenta de una persona firma ella; con una terminal, la acción queda sin persona.
 * Una acción que NO está aquí sigue con su combo y su candado.
 *
 * ESTE ARCHIVO ES ESPEJO de la lista de esa migración (`responsable-omitido.test.ts` los compara): sumar una acción es
 * sumarla en las dos, o la base rechaza con «Elige quién hace esta operación».
 *
 * PARA VOLVER: `git revert` del commit «quita 30 combos» (las pantallas vuelven a pedir al responsable) y, en la base,
 * `delete from retail.acciones_sin_responsable;`. Los pasos completos, en la cabecera de la migración.
 */

/** Clave → lo que hace, en palabras del negocio. Las claves son las de `retail.acciones_sin_responsable`. */
export const ACCIONES_SIN_RESPONSABLE = {
  apartar_prenda: "Apartar una prenda para una clienta (desde Existencias)",
  aviso_apartado: "Dejar el aviso o recordatorio a la clienta de un apartado",
  traslado_recibir: "Recibir, confirmar o cerrar con diferencia un traslado",
  conteo_cerrar: "Cerrar el conteo y aplicar las diferencias",
  regularizar_prenda: "Regularizar una prenda por regularizar",
  compra_adjunto_subir: "Adjuntar un archivo a una factura de compra",
  compra_adjunto_quitar: "Quitar un adjunto de una factura de compra",
  alta_producto_categoria: "Configurar una categoría dentro del alta de producto",
  alta_producto_tejido: "Proponer un tejido nuevo dentro del alta de producto",
  alta_producto_talla: "Proponer una talla nueva dentro del alta de producto",
  alta_producto_etiqueta: "Crear una etiqueta dentro del alta de producto",
  alta_producto_color: "Crear un color dentro del alta de producto",
  alta_producto_marca: "Crear una marca dentro del alta de producto",
  alta_producto_muestra: "Elegir la muestra de un valor dentro del alta de producto",
  alta_producto_valor: "Proponer otro valor de atributo dentro del alta de producto",
  producto_confirmar_cambios: "Confirmar los cambios de la ficha de un producto",
  producto_revisar_alta: "Aprobar o rechazar una prenda dada de alta al vuelo en un conteo",
  color_rechazar: "Rechazar un color propuesto",
  talla_aprobar: "Aprobar una talla propuesta",
  talla_rechazar: "Rechazar una talla propuesta",
  tejido_rechazar: "Rechazar un tejido propuesto",
  patron_rechazar: "Rechazar un patrón propuesto",
  muestra_foto: "Subir o quitar la foto de muestra de un tejido o patrón",
  temporada_fechas_anio: "Guardar las fechas del año de las temporadas",
  etiqueta_estado: "Aprobar, desactivar o reactivar una etiqueta",
  etiqueta_rechazar: "Rechazar una etiqueta propuesta",
  etiqueta_campana: "Ponerle campaña a una etiqueta",
  catalogo_confirmar_estado: "Aprobar, desactivar o reactivar un valor del Catálogo con un solo clic",
} as const;

export type ClaveSinResponsable = keyof typeof ACCIONES_SIN_RESPONSABLE;

/** El encabezado que lee `fn_actor_persona_id`. */
export const ENCABEZADO_OMITIDO = "x-responsable-omitido";

/** Firma de una acción soltada del combo: no lleva persona ni tienda, solo cuál acción es. */
export type FirmaOmitida = { omitida: ClaveSinResponsable };

/** `firmar(consulta, firmaOmitida("conteo_cerrar"))` — la acción sale sin responsable, con su clave. */
export function firmaOmitida(clave: ClaveSinResponsable): FirmaOmitida {
  return { omitida: clave };
}

/** Lo mismo para un `fetch` a una ruta `/api/*` (que reenvía los encabezados a la base). */
export function encabezadosOmitidos(clave: ClaveSinResponsable): Record<string, string> {
  return { [ENCABEZADO_OMITIDO]: clave };
}
