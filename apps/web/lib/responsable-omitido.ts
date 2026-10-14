/**
 * Las acciones que Felipe soltó del combo «Responsable» (2026-09-29) — la lista viva de lo que la web deja de preguntar.
 *
 * EL PROBLEMA. El combo «Responsable» (ADR-0161) se pedía en 149 lugares de la web. Felipe los repasó uno por uno y
 * marcó 30 donde estorba más de lo que ayuda (28 quedaron sueltas: ver ADR-0280): el alta de producto lo pedía hasta 9 veces seguidas, aprobar o rechazar un
 * valor del Catálogo, adjuntar un archivo a una factura, cerrar un conteo, recibir un traslado…
 *
 * LA REGLA. Esas acciones se guardan sin elegir a nadie. La pantalla ya no pinta el combo y manda el encabezado
 * `x-responsable-omitido: <clave>`; la base (`retail.acciones_sin_responsable`, migración 20260929230000) lo respeta SOLO
 * si la clave está en su lista. Con la cuenta de una persona firma ella; con una terminal, la acción queda sin persona.
 * Una acción que NO está aquí sigue con su combo y su candado.
 *
 * EXCEPCIÓN — el alta de producto (ADR-0285, Felipe 2026-09-29). Las ocho claves `alta_producto_*` ya no se mandan DENTRO de «Nueva
 * prenda»: ahí quien la inició se identifica una vez (`QuienRegistra`) y firma la prenda y todo lo que crea a mitad de camino
 * (`useFirmaDeMitad`, `lib/identidad-alta-reglas.ts`). Solo se usan como respaldo cuando esos componentes se montan FUERA del
 * alta (la marca nueva desde Marcas, la ficha o el conteo; el color desde «Agregar colores» de la ficha).
 *
 * ESTE ARCHIVO ES ESPEJO de la lista de esa migración (`responsable-omitido.test.ts` los compara): sumar una acción es
 * sumarla en las dos, o la base rechaza con «Elige quién hace esta operación».
 *
 * PARA VOLVER: `git revert` del commit «quita 30 combos» (las pantallas vuelven a pedir al responsable) y, en la base,
 * `delete from retail.acciones_sin_responsable;`. Los pasos completos, en la cabecera de la migración.
 */

/** Clave → lo que hace, en palabras del negocio. Las claves son las de `retail.acciones_sin_responsable`. */
export const ACCIONES_SIN_RESPONSABLE = {
  apartar_prenda: "Apartar una prenda para un cliente (desde Existencias)",
  aviso_apartado: "Dejar el aviso o recordatorio al cliente de un apartado",
  // ADR-0328 (actividad 15): estas dos no piden el combo, pero tampoco quedan sin nombre: la base hereda la firma de la operación del
  // mismo día si esa persona sigue de turno (`fn_firma_heredada`) y, si no, pide el nombre una vez (la pantalla muestra el combo).
  traslado_recibir: "Recibir, confirmar o cerrar con diferencia un traslado (firma quien firmó la recepción hoy, si sigue de turno; si no, se pregunta una vez)",
  conteo_cerrar: "Cerrar el conteo y aplicar las diferencias (firma quien lo abrió hoy, si sigue de turno; si no, se pregunta una vez)",
  // `regularizar_prenda` salió de la lista con 20261004204000 (ADR-0328, en producción desde el 2026-10-05; 20261006200000 repite el
  // borrado): regularizar vuelve a pedir «Responsable», para que la venta sin registrar quede a nombre de la colaboradora que la
  // identificó y no de la terminal de la tienda, y para que la base pueda comparar con quien la vendió (nadie regulariza su propia venta).
  cola_arranque_cerrar: "Cerrar la cola de arranque de ventas sin registrar de una tienda",
  cola_arranque_reabrir: "Reabrir una venta sin registrar que se cerró sin prenda",
  cola_arranque_identificar: "Identificar con sugerencias las ventas sin registrar de una tienda (varias a la vez)",
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
  // `producto_confirmar_cambios` salió el 2026-10-06 (ADR-0354, 20261006180100): Editar producto vuelve a pedir «Responsable»,
  // porque el historial de la prenda tiene que decir quién cambió cada cosa.
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
  // Avisos del club (Felipe, 2026-10-02; migración 20261002170000): con la cuenta de una persona no se elige quién envía.
  aviso_club_enviar: "Anotar un aviso del club como enviado por WhatsApp",
  aviso_club_deshacer: "Deshacer un aviso del club anotado como enviado",
  aviso_club_baja: "Registrar que un cliente pidió BAJA de los mensajes del club",
  // Órdenes de compra (ADR-0362, decisión 39; migración 20261010223500): quien compra suele estar en Gamarra, lejos del kiosco. Con su
  // cuenta firma ella; una terminal sigue eligiendo quién (la base no deja una orden sin autor: quien la crea no la recibe, decisión 17).
  orden_compra_crear: "Crear una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Editarla, igual (actividad 4, migración 20261010235000).
  orden_compra_editar: "Editar una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Y anularla (actividad 5, migración 20261010235500).
  orden_compra_anular: "Anular una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Registrar el comprobante de una orden y anularlo (fase 2, migración 20261012211000): una sola clave para las dos acciones.
  orden_compra_comprobante: "Registrar o anular el comprobante de una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Enviar lo de una orden a una sede y anular el envío (fase 3, migración 20261012225000): una sola clave para las dos acciones.
  orden_compra_envio: "Enviar a una sede lo de una orden de compra, o anular ese envío (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Órdenes de insumos del Taller (ADR-0362, fase 7; migración 20261013040000): la decisión 39 extendida al Taller, por la misma razón
  // (quien compra tela tampoco está en el kiosco). Una terminal sigue eligiendo quién: la base no deja una orden sin autor.
  orden_insumo_crear: "Crear una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  orden_insumo_editar: "Editar una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  orden_insumo_anular: "Anular una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Fondos por rendir (ADR-0362, fase 6; migración 20261013182000): quien entrega plata, recibe lo devuelto o anula un error firma con su
  // cuenta; una terminal elige quién. La base además impide que la persona mueva su propio fondo desde ahí.
  fondo_entregar: "Entregar plata al fondo de una persona (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  fondo_devolver: "Registrar lo que una persona devuelve de su fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  fondo_anular: "Anular una entrega o una devolución de fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Gastos del viaje (ADR-0362, fase 6 · actividad 3; migración 20261013222000): quien compra anota lo que pagó con su cuenta.
  gasto_viaje_registrar: "Registrar un gasto del viaje de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // La rendición del fondo (ADR-0362, fase 6 · actividad 5; migraciones 20261013233000 y 20261013235000): la foto del papel de un gasto del
  // viaje (evidencia, como el adjunto de una factura), rendir el propio fondo (solo con la cuenta de su dueña) y aprobar o devolver una
  // rendición (quien la revisa firma con su cuenta; una terminal elige quién).
  gasto_viaje_foto: "Sumar o quitar la foto del papel de un gasto del viaje (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  fondo_rendir: "Rendir el propio fondo (solo con la cuenta de su dueña: desde una terminal no se rinde)",
  fondo_rendicion_aprobar: "Aprobar la rendición de un fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  fondo_rendicion_devolver: "Devolver para corregir la rendición de un fondo, o retirar la propia (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
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
