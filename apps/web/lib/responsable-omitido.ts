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
  // Registrar un proveedor nuevo desde la orden (2026-10-21, migración 20261021202000): la compradora, en Gamarra, no puede esperar a quien administra
  // proveedores. Con su cuenta firma ella; una terminal sigue eligiendo quién, como en las demás acciones de la orden.
  proveedor_de_orden: "Registrar un proveedor nuevo desde una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Enviar lo de una orden a una sede y anular el envío (fase 3, migración 20261012225000): una sola clave para las dos acciones.
  orden_compra_envio: "Enviar a una sede lo de una orden de compra, o anular ese envío (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Órdenes de insumos del Taller (ADR-0362, fase 7; migración 20261013040000): la decisión 39 extendida al Taller, por la misma razón
  // (quien compra tela tampoco está en el kiosco). Una terminal sigue eligiendo quién: la base no deja una orden sin autor.
  orden_insumo_crear: "Crear una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  orden_insumo_editar: "Editar una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  orden_insumo_anular: "Anular una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // ADR-0362 fase 7 parte 2 (20261015020000): el papel del proveedor de una orden de insumos.
  orden_insumo_comprobante: "Registrar el comprobante de una orden de insumos del Taller (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
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
  // Compras simple (ADR-0480, actividad 2; migración 20261022235000): la compradora anota su plata y Compras la confirma.
  plata_anotar: "Anotar la plata que te dieron para comprar (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  plata_confirmar: "Confirmar la plata que anotó una compradora (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // La compra desde el celular (ADR-0480, actividad 3; migración 20261023005000), como crear una orden de compra.
  compra_rapida: "Registrar una compra desde el celular (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Corregir una compra ya anotada (ADR-0561; migración 20261029012000): lo hace quien la anotó, mientras Compras no la complete.
  compra_corregir: "Corregir una compra que anotaste desde el celular (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // El resto del día de compras (ADR-0480, actividad 5; migración 20261023114000).
  gasto_rapido: "Anotar un gasto que no es ropa desde el celular (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  compra_mandar: "Mandar a una tienda lo que compraste para ella (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  compra_terminar_dia: "Cerrar tu ronda de compras (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // La ronda de compras (ADR-0480; migración 20261023183000): la abre la compradora desde su celular. Cerrarla sigue con `compra_terminar_dia`.
  compra_ronda_abrir: "Abrir tu ronda de compras (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // Revisar compras (ADR-0480, actividad 7; migración 20261023143000): completar el papel y recibir lo del cierre del día.
  papel_completar: "Completar el papel de una compra anotada desde el celular (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  compra_cierre_recibir: "Recibir lo que devuelve una compradora al terminar el día, o pagarle lo que puso (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  gasto_revisar: "Pasar a los gastos lo que una compradora gastó en otra cosa (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  fondo_rendir: "Rendir el propio fondo (solo con la cuenta de su dueña: desde una terminal no se rinde)",
  fondo_rendicion_aprobar: "Aprobar la rendición de un fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  fondo_rendicion_devolver: "Devolver para corregir la rendición de un fondo, o retirar la propia (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // ADR-0362 fase 6 · actividad 7 (20261014145000): la deuda de un faltante se salda cuando la persona devuelve la plata.
  fondo_deuda_pagar: "Registrar lo que una persona paga de la deuda de un faltante de su fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  fondo_deuda_anular: "Anular el pago de la deuda de un faltante de fondo (con la cuenta de una persona firma ella, desde una terminal se elige quién)",
  // «Arma el tuyo» (ADR-0434, actividad 2; migración 20261017013000; Felipe 2026-10-16): el recorte que el ERP guarda solo al subir una
  // foto, para el probador de la tienda online. Nadie hace una operación aparte: solo subió la foto.
  recorte_foto: "Guardar el recorte de una foto para el probador de la tienda online al subirla (lo hace el ERP solo, y con la cuenta de una persona firma ella)",
  // Tienda online (ADR-0469; migración 20261021170000): un líder deshace la unión de una cuenta de Google con un miembro. Un líder siempre
  // entra con su cuenta de persona (una terminal nunca es líder): firma él mismo.
  vinculo_google_desvincular: "Deshacer la unión de una cuenta de Google con un miembro de la tienda online (solo un líder, y firma con su propia cuenta)",
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
