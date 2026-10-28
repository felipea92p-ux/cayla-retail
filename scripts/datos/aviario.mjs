#!/usr/bin/env node
/**
 * El aviario — de qué pájaro es cada tabla del schema `retail`. LA ÚNICA LISTA.
 *
 * EL PROBLEMA QUE RESUELVE. Hasta el 2026-09-18 "¿de quién es esta tabla?" tenía dos
 * respuestas escritas a mano: la tabla de `docs/datos/07-GOBIERNO.md` §1 (escrita contra
 * V1 el 2026-09-12) y la lista de `generar.mjs` (puesta al día a V2 el 2026-09-15). No
 * coincidían entre sí ni con producción: 39 de las 60 tablas reales no tenían pájaro en
 * GOBIERNO, y 21 salían «sin módulo» en el diccionario. La regla «si nace una tabla nueva,
 * nace con dueño o no nace» existía, pero nada avisaba cuando se rompía (ADR-0104).
 *
 * QUÉ PROMETE. Cada tabla o vista de `retail` en producción tiene exactamente un pájaro.
 * `pnpm datos:aviario` lo comprueba contra el volcado de producción
 * (`docs/datos/generado/retail_columnas.json`) y contra los 14 pájaros de GOBIERNO §1,
 * y escribe `docs/datos/generado/AVIARIO.md`. Con `--verificar` —así corre en CI— no
 * escribe nada: falla si algo de eso no se cumple o si `AVIARIO.md` quedó viejo.
 *
 * QUÉ ASUME. Que el volcado describe producción: la alarma es tan fresca como ese volcado
 * (cómo refrescarlo: `docs/datos/generado/COMO-REFRESCAR.md`). Y que quién LLEVA cada
 * pájaro se escribe en GOBIERNO §1, no acá: el pájaro es el puesto; la persona se apunta
 * allá, editando una línea, sin correr nada.
 *
 * DARLE PÁJARO A UNA TABLA NUEVA: agregar su nombre a la lista del pájaro que corresponde,
 * correr `pnpm datos:aviario` y commitear el `AVIARIO.md` que resulta.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// El porqué de cada reparto que no es obvio está en GOBIERNO §1, «Repartos que no son
// obvios». Acá solo queda la lista.
export const AVIARIO = [
  { n: "01", pajaro: "Ganso", modulo: "Identidad y acceso",
    tablas: ["colaboradores", "ubicaciones",
      // Altas, suspensiones y su historia (ADR-0157, D-70).
      "colaboradores_historial", "colaboradores_suspendidos",
      // ADR-0161/0162: roles «ve / no ve» por módulo y terminales sin persona. Qué ve cada cuenta es identidad y acceso,
      // no el módulo que se abre. Asignadas en el refresco del volcado del 2026-09-23.
      "roles", "modulos", "rol_modulos", "roles_historial", "terminales",
      // ADR-0253: lo que se le quitó al rol Líder de equipo (el resto lo ve). Refresco del 2026-09-28.
      "lider_modulos_ocultos",
      // Qué guías de uso ya se le ofrecieron a cada cuenta y cuáles completó (`quien`, `guia`, `ofrecida_en`, `completada_en`;
      // la leen `fn_guias_vistas` y `marcar_guia_vista`). Es una preferencia por cuenta, como `lider_modulos_ocultos`. Nació
      // en otra rama y ya está en producción; su migración no está en este repo al 2026-10-09. Refresco del 2026-10-09.
      "guias_vistas",
      // Las acciones que Felipe soltó del combo «Responsable» (ADR-0162): es qué firma cada cuenta, o sea identidad y acceso.
      // Refresco del volcado del 2026-10-02.
      "acciones_sin_responsable",
      // Lo que cada colaborador prefiere de su cuenta (hoy el mensaje que manda a los pedidos web): una preferencia por cuenta, como
      // `guias_vistas`. Asignada en el refresco del volcado del 2026-10-21.
      "preferencias_colaborador"] },
  { n: "02", pajaro: "Loro", modulo: "Catálogo y vocabulario",
    tablas: [
      "productos", "variantes", "precios_sede", "categorias", "familias", "producto_fotos", "historial_producto_cambios",
      // ADR-0370: el precio propio de una tienda es de la PRENDA, uno por prenda y tienda (`precios_sede` por variante quedó como historia).
      // Está en producción desde el 2026-10-11 (20261011100000-100300). Refresco del volcado del 2026-10-11.
      "precios_sede_prenda",
      // De quién es cada producto (ADR-0109): la marca y qué proveedores la traen. Sin proponer/aprobar, como familias.
      "marcas", "marca_proveedores",
      "codigos_barras", "codigos_correlativos",
      // El vocabulario cerrado: los cinco usan el mismo proponer/aprobar/rechazar (ADR-0070, ADR-0095).
      "colores", "tallas", "categoria_tallas", "tejidos", "categoria_tejidos",
      "patrones", "categoria_patrones", "etiquetas", "etiqueta_categorias", "variante_etiquetas",
      // ADR-0181: la versión del catálogo que suben los disparadores de las tablas de arriba. Refresco del 2026-09-23.
      "catalogo_version",
      // ADR-0246 (Frescura, paso 3a): la temporada como atributo del producto — el calendario de fechas por año/estación,
      // la lista cerrada de temporadas y a qué temporada quedó cada color de cada producto. La cambia quien puede editar
      // el catálogo (ADR-0246 §"quién decide"), igual que colores/tallas/tejidos arriba. Asignadas en el refresco del
      // volcado del 2026-09-27.
      "temporada_fechas", "temporadas", "producto_color_temporadas",
      // ADR-0292: en qué sede se registró cada producto. Es un dato del producto (el catálogo es global), no de la sede.
      // Refresco del volcado del 2026-10-02.
      "producto_origen",
      // ADR-0408 (tienda online): qué modelos se ven en la web y cómo entran a Lo nuevo, y los looks de «Arma tu look» con sus
      // prendas. Se manejan desde Catálogo ▸ Vitrina web: son de quien responde por el catálogo. Refresco del volcado del 2026-10-16.
      "vitrina_productos", "vitrina_looks", "vitrina_look_piezas",
      // ADR-0434 («Arma el tuyo»): el recorte de cada foto para el probador y el largo típico por categoría. Se manejan desde Tienda web ▸
      // Vitrina ▸ Probador, como `vitrina_productos` (el largo propio vive ahí). Están en producción desde el 2026-10-17 (PR #1151);
      // las asignó el refresco del volcado de ese día.
      "foto_recortes", "vitrina_largos_tipicos",
      // El diseño de la portada de una campaña en la tienda online (una por etiqueta de campaña: borrador, publicado, anterior):
      // es de la misma vitrina y de la etiqueta, que son de Loro. En producción desde el 2026-10-17 (migraciones `campanas_*` de
      // otra sesión, todavía fuera de main); la asignó el refresco del volcado de ese día.
      "campana_disenos",
      // Refresco del 2026-10-21: los diseños y las vistas previas de la campaña de la tienda web (migraciones de otra sesión): son del
      // mismo cuaderno de campañas que `campana_disenos`.
      "campana_web_disenos", "campana_web_previas",
      // ADR-0486 (campañas por sede, 2026-10-23): las tiendas donde rige el descuento de una campaña (una fila de `etiquetas`). Sin filas
      // rige en todas. Se edita desde la pantalla de Campañas, junto a la etiqueta y su diseño, que son de Loro; la caja solo la lee por
      // `campanas_vigentes(sede)`, como lee `etiquetas`. Asignada en el refresco del volcado del 2026-10-23.
      "campana_sedes",
      // ADR-0488 (Configuración de una campaña, 20261023232000): las ofertas de una campaña (un % menos con fechas, días y, si se quiere, solo
      // algunas categorías o sedes) y cómo estaban antes de cada cambio. Se manejan desde la hoja «Configuración» de Catálogo ▸ Insignias, junto
      // a la etiqueta y su diseño, que son de Loro. Asignadas en el refresco del volcado del 2026-10-26.
      "campana_reglas", "campana_regla_categorias", "campana_regla_sedes", "campana_regla_historial",
      // ADR-0463: la empresa a la que pertenece cada prenda (CAYLA o CLAURE) y en qué sedes opera cada una. La empresa es un dato del producto,
      // no de la marca ni de la factura (que sale siempre con el RUC de CAYLA): lo maneja quien responde por el catálogo. En producción desde
      // el 2026-10-20; las asignó el refresco del volcado del 2026-10-21.
      "empresas", "empresa_sedes",
    ] },
  // Tucán es la traducción al estándar de Shopify (ADR-0030); sus tablas no existen en V2.
  { n: "03", pajaro: "Tucán", modulo: "Taxonomía universal", tablas: [] },
  { n: "04", pajaro: "Golondrina", modulo: "Importación de catálogo", tablas: [] },
  { n: "05", pajaro: "Halcón", modulo: "Inventario y movimientos",
    tablas: [
      "movimientos", "stock", "lotes", "sububicaciones", "costo_historial", "prendas_danadas",
      "transferencias", "transferencia_items", "transferencia_recepciones",
      // ADR-0404: lo que una sede contó de MÁS al recibir un traslado, a revisar antes de entrar al stock. Es parte del traslado: mismo
      // pájaro. Está en producción desde el 2026-10-14; la asignó el refresco del volcado del 2026-10-15.
      "traslado_sobrantes",
      // Lo que una sede deja listo para enviar a otra y de qué traslado salió (pedidos entre sedes, ADR-0242). Es parte del
      // traslado: mismo pájaro. Asignadas en el refresco del 2026-10-05.
      "prendas_para_enviar", "prendas_para_enviar_salidas",
      // ADR-0113: el envío es el padre de los lotes (`lotes.envio_id`); sus extras son movimientos y sus
      // traslados, transferencias — el mismo pájaro que las tablas que agrupa, no el de Compras.
      "envios", "envio_extras", "envio_traslados",
      // ADR-0362 (fases 3 y 4): el envío de una orden de compra a una sede (ENV-…), sus líneas y lo que se contó al recibirlo. Como
      // `envios`, es el padre de sus lotes (`lotes.despacho_id`) y cada fila recibida lleva su movimiento: el pájaro del stock, no el de
      // Compras. Asignadas en el refresco del 2026-10-13, al pegarse en producción.
      "despachos", "despacho_items", "despacho_recibidos",
      // La cara A de Recibir (decisiones de Felipe del 2026-10-13): lo contado de cada línea de un envío, lo contado que todavía no está
      // en el stock (pendientes), cada «Hacer ahora» que lo mete, el rastro de cada cierre y reapertura, y los envíos que una sede abre sin
      // aviso. Son de la recepción del envío, como `despacho_recibidos`: el pájaro del stock. Están en producción desde el 2026-10-14; las
      // asignó el refresco del volcado del 2026-10-15.
      "despacho_conteos", "despacho_pendientes", "despacho_separaciones", "despacho_cierres", "despachos_sin_aviso",
      // ADR-0507: lo que la persona vio al contar un envío (prenda rota, faltante, manchada…): es de la recepción del envío, como
      // `despacho_conteos`. Asignada en el refresco del volcado del 2026-10-26.
      "despacho_observaciones",
      // ADR-0515: la corrección que un líder hace al costo de lo que llegó en la ÚLTIMA compra de una prenda (solo se agrega). Cuelga de una
      // fila de `costo_historial` —el libro del costo de lo que entró al stock, de este mismo pájaro— y no la reemplaza: la lee
      // `fn_costo_historial_efectivo`. Se corrige desde la pestaña «Costo» del Historial de la prenda (Catálogo), pero el dato es del costo
      // del stock, como `costo_historial`. En producción desde el 2026-10-26.
      "costo_correcciones",
      // ADR-0208: el documento de «Bajar prendas al piso» y sus líneas; cada línea es un movimiento almacén→piso.
      "bajadas_piso", "bajada_piso_items",
      // Análisis v4 (ADR-0357, 20261006216000): «Liquidar desde», un número para toda la red (lo mueve quien ve Análisis).
      "parametros_analisis",
      // La prenda que se bajó al piso en la mano, con el ajuste que la cuadró (ADR-0328). Es parte de la bajada. Refresco del 2026-10-05.
      "bajadas_en_mano",
      // ADR-0328 (actividad 3): el cuadre del piso de una sede y sus líneas; cada línea es un movimiento piso↔almacén. Nace con
      // dueño (20261004195000); hasta que se pegue y se refresque el volcado, el aviario lo avisa como «no en el volcado».
      "cuadres_piso", "cuadre_piso_items",
      // Cuántas prendas caben en el piso de cada sede (ADR-0329, 20261005103000). Es del piso, como el cuadre. Refresco del 2026-10-05.
      "capacidad_piso",
      // Plan del piso (20261006110000): la foto diaria de cuánto espacio ocupa cada categoría en el piso de cada sede. Es del piso, como su
      // capacidad. Asignada en el refresco del volcado del 2026-10-11.
      "espacio_piso",
      // Plan del piso (ADR-0329, commit 1532264f): los grupos del mix y a qué grupo va cada categoría. Es del piso, como su
      // capacidad. Asignadas en el refresco del volcado del 2026-10-06 (ADR-0354), al aparecer en producción.
      "grupos_mix", "categoria_grupo_mix",
      // La llave de reintento de `mover_interno` (token del cliente + huella): un pase piso↔almacén repetido por la red no
      // mueve dos veces. Es parte del movimiento, no una tabla aparte de nadie. Asignada en el refresco del 2026-09-26.
      "movimientos_internos_intentos",
      // La marca de reintento de `ajustar_inventario` (ADR-0240): un ajuste reenviado tras un corte no se aplica dos veces.
      // Misma razón que la de arriba: es parte del movimiento. Asignada en el refresco del 2026-09-26 (noche).
      "ajustes_inventario_intentos",
      // Frescura del piso (ADR-0208, paso 4b): la libreta de «Ya decidí» por prenda y sede. Vive en Inventario ▸ Frescura y
      // responde por lo que pasa con la ropa en el piso. Refresco del volcado del 2026-10-02.
      "frescura_decisiones",
      // La vara de CAYLA de Frescura (ADR-0208, act. 2026-10-07; 20261008120000): la curva de cada categoría con las tres tiendas,
      // calculada por el cron y leída como respaldo. Es del piso, como la libreta. Nace con dueño; hasta que se pegue y se refresque
      // el volcado, el aviario la avisa como «no en el volcado».
      "frescura_vara_cayla",
    ] },
  { n: "06", pajaro: "Lechuza", modulo: "Conteo y censo físico",
    tablas: ["conteos", "conteo_items"] },
  { n: "07", pajaro: "Colibrí", modulo: "Ventas y caja",
    tablas: [
      "ventas", "venta_items", "venta_pagos", "venta_anulacion_items", "cajas", "caja_movimientos",
      // ADR-0365: la corrección del medio de pago de una venta con la caja abierta (20261009120000). Refresco del 2026-10-09.
      "venta_pagos_correcciones",
      // `clientes` pasó a llamarse `clientas` (D-48, vocabulario obligatorio); el refresco del 2026-09-23 lo confirmó.
      "clientas", "codigos_descuento", "cambios", "devoluciones", "devolucion_items",
      // ADR-0470 (2026-10-21): las prendas que se lleva la clienta en un cambio por VARIAS prendas; hijas de `cambios`.
      "cambio_salidas",
      // ADR-0249: qué ficha de clienta se unió a cuál (unir fichas repetidas). Refresco del 2026-09-28.
      "clientas_fusiones",
      // Separaciones (apartar prendas con adelanto) y lo que la clienta pidió y no había: nacen en el mostrador.
      "apartados", "separaciones", "separacion_items", "separacion_pagos", "separacion_correlativos",
      "pedidos_no_atendidos",
      // Refresco del volcado del 2026-09-23: a dónde fue el efectivo al cerrar (ADR-0186) y las prendas vendidas sin
      // registrar (ADR-0179) — las dos nacen en la caja; almacén regulariza las segundas, pero el hecho es la venta.
      "caja_traslados", "prendas_por_regularizar", "prendas_por_regularizar_correcciones",
      // El cierre de arranque de esas ventas sin registrar (ADR-0334): el registro de cada cierre y el plazo por tienda. Mismo pájaro
      // que la cola que cierran: nacen de la misma venta. Entran al volcado cuando se pegue la migración 20261005100000.
      "cierres_cola_arranque", "cola_arranque_plazo",
      // Configuración de la caja (ADR-0195 F1): la meta de venta de cada día por tienda, lo que cada campaña cambia en la caja
      // (meta y fondo) y la bitácora de esos cambios. Los lee `fn_parametros_caja` —lo que ve el mostrador—, por eso son de
      // Colibrí. La bitácora la escriben también las pantallas de Finanzas (parámetros, cuentas, presupuesto, impuestos):
      // escribir en ella no la hace de Garza, igual que escribir en `movimientos` no hace a nadie dueño de Halcón.
      // Asignadas en el refresco del volcado del 2026-09-25.
      "ubicacion_metas_dia", "campana_efecto_caja", "configuracion_historial",
      // Apartados (ADR-0236, ADR-0233): abonos, avisos a la clienta, ediciones y prendas retiradas de una separación, las
      // opciones que cada tienda apaga y el pedido a otra sede para una clienta. Todo nace en el mostrador, igual que
      // `separaciones`. Asignadas en el refresco del volcado del 2026-09-26.
      "separacion_abonos", "separacion_avisos", "separacion_ediciones", "separacion_items_retirados", "separacion_pedidos",
      "apartados_opciones",
      // El club de clientas (ADR-0288, tandas 1b–1g): sus permisos de la Ley 29733, los textos aprobados, invitaciones,
      // canjes de cumpleaños y aniversario con su escala, avisos enviados, intentos de registro y las listas de preferencias
      // de la ficha. Son de quien responde por `clientas`. Refresco del volcado del 2026-10-02.
      "club_permisos", "club_textos", "club_invitaciones", "club_canjes", "club_aniversario_escala", "club_avisos_enviados",
      "club_intentos_registro", "club_etiquetas",
      // La meta de cada persona por mes y sus ajustes, junto a la de la tienda (`ubicacion_metas_dia`). Cada cambio a la meta del mes de
      // una persona queda como fila (solo se agregan; ADR-0325). Está en producción desde el 2026-09-29 (la parte 1 de `20260930050200`).
      // Refresco del 2026-10-02.
      "metas_persona_ajustes",
      // Piezas de liquidación (rama claude/liquidacion-prendas-unicas-55bbee, PR #940): prendas sueltas que se etiquetan, se rebajan y se
      // venden sin entrar al catálogo, y el precio mínimo con que se aceptan. Se venden por `venta_items`, así que son de quien responde por
      // la venta. Ya están en producción (la migración se pegó antes de fusionar); asignadas en el refresco del volcado del 2026-10-11.
      "piezas_liquidacion", "piezas_liquidacion_etiquetas", "parametros_liquidacion",
      // La huella de cada envío con token de Ventas y Caja (ADR-0398): un mismo token con otro contenido se rechaza. La escriben las
      // funciones que guardan en el mostrador y `fn_resolver_intento`. Asignada en el refresco del volcado del 2026-10-13.
      "intentos_con_token",
      // ADR-0408 (tienda online): la venta y el cliente que entran por otra puerta. Los pedidos web con sus líneas y sus pagos (Ventas ▸
      // Pedidos web); la cuenta web de cada cliente, con el correo que confirma, sus cambios de correo, sus intentos de clave y sus
      // visitas; sus favoritos, sus «Avísame cuando llegue» y sus recomendaciones (Clientes ▸ Recomendaciones); y los plazos de los
      // pedidos web y lo que la web muestra de cada tienda. Son del pájaro que responde por `ventas`, `separaciones` y `clientas`.
      // Refresco del volcado del 2026-10-16.
      "pedidos_web", "pedido_web_lineas", "pedido_web_pagos",
      "cuentas_web", "cuentas_web_pendientes", "cuentas_web_cambios_correo", "cuentas_web_intentos_clave", "cuentas_web_visitas",
      "favoritos_web", "esperas_web", "recomendaciones_web", "configuracion_tienda_web", "ubicacion_datos_web",
      // ADR-0518 (Tienda web ▸ Conf. Tienda): el horario por días de cada tienda en la web y los días que no abre. Son de la tienda web, como
      // `ubicacion_datos_web`. Asignadas en el refresco del volcado del 2026-10-26.
      "ubicacion_horario_web", "ubicacion_cierres_web",
      // ADR-0495 (Tienda web ▸ Tráfico): cada paso anónimo de una persona en la tienda online (entró, vio prenda, eligió talla, bolsa,
      // separó), solo se agrega. Cuenta el embudo de los pedidos web: el mismo pájaro. Asignada en el refresco del volcado del 2026-10-26.
      "trafico_web",
      // ADR-0511 (paso 2): los tickets de Vender compartidos por la tienda (de una MacBook a un celular). Son del mostrador, como `ventas`.
      // Asignada en el refresco del volcado del 2026-10-26.
      "tickets_abiertos",
      // ADR-0008: la huella de las lecturas del padrón de la última hora, con que la base exige que el nombre de una ficha con DNI sea
      // el del padrón (20261015133000). Cuida `clientas.nombre`. Refresco del volcado del 2026-10-16.
      "padron_lecturas",
      // ADR-0414: cada vez que se aplazó el vencimiento de un apartado, de qué fecha a cuál y quién. Refresco del volcado del 2026-10-16.
      "separacion_aplazamientos",
      // ADR-0434 (actividad 8): los looks que una cuenta web guarda desde el probador y sus prendas. Son de la cuenta, como sus
      // `favoritos_web`, y el cierre de la cuenta los quita igual. En producción desde el 2026-10-17 (PR #1157). Refresco de ese día.
      "looks_web", "look_web_piezas",
      // ADR-0435: la meta de cada tienda para un mes (su semana) y para una fecha puntual (23, 24 y 31 de diciembre, un feriado). Las lee
      // `fn_parametros_caja` —lo que ve el mostrador—, como `ubicacion_metas_dia`: el mismo pájaro. En producción desde el 2026-10-17
      // (PR #1152). Refresco del volcado de ese día.
      "ubicacion_metas_mes", "ubicacion_metas_fecha",
      // Tienda online (2026-10-19 y 20): la bandeja de notificaciones de cada cuenta y su historial, y los aparatos que pidieron avisos en el
      // celular con su cola de envíos. Son de la cuenta de la tienda, como `favoritos_web`. Asignadas en el refresco del volcado del 2026-10-21.
      "avisos_bandeja", "avisos_tienda", "tienda_push_suscripciones", "tienda_push_envios",
      // Programa de puntos del Club: su configuración por versiones, cada movimiento y el saldo, los cupones que se canjean y sus intentos, y
      // los mensajes de aviso que cada sede edita (Clientas ▸ Avisos). Son del Club: el mismo pájaro que `club_canjes`. Asignadas en el
      // refresco del volcado del 2026-10-21.
      "club_puntos_config", "club_puntos_movimientos", "club_puntos_saldos", "club_cupones", "club_cupon_intentos", "club_avisos_textos_sede",
      // ADR-0469: cada vez que una cuenta de Google se unió a la ficha que ya tenía ese correo (a quién se le avisó, y si un líder lo deshizo).
      // Es de la cuenta de la tienda, como `cuentas_web`. En producción desde el 2026-10-21.
      "cuentas_web_vinculos_google",
    ] },
  { n: "08", pajaro: "Cuervo", modulo: "Facturación SUNAT",
    tablas: ["comprobantes", "series_comprobantes", "proformas", "configuracion_empresa", "ubicacion_datos_fiscales",
      // Qué comprobantes de anticipo descuenta una boleta o factura final (ADR-0236: el apartado se cobra en abonos). Es
      // una relación entre comprobantes, así que responde quien responde por ellos. Refresco del 2026-09-26.
      "comprobante_anticipos",
      // Respaldo de las boletas B002 que se renumeraron a la serie 04 de AQP (ADR-0310,
      // `pegar-en-produccion-aqp-serie-04-lima-serie-05-2026-10-02.sql`): la serie, el número y lo que SUNAT respondió
      // ANTES, para poder rehacerlo. Solo se lee a mano. Refresco del 2026-10-03.
      "respaldo_b002_renumeradas_20261002",
      // Respaldo de las boletas B001 y facturas F001 que se renumeraron a la serie 05 de TRU y la 06 de Lima
      // (`pegar-en-produccion-tru-serie-05-lima-serie-06-2026-10-07.sql`): serie, número y respuesta de SUNAT de ANTES, para
      // poder rehacerlo. Solo se lee a mano. Refresco del 2026-10-09.
      "respaldo_b001_f001_renumeradas_20261007"] },
  { n: "09", pajaro: "Pelícano", modulo: "Compras y proveedores",
    tablas: ["proveedores", "compras", "compra_items", "compra_pagos", "compra_adjuntos", "compras_resumen", "compra_items_resumen",
      // ADR-0349 (Plan de campaña): cuánto comprar por categoría para una campaña. Nace con dueño; refresco del 2026-10-05.
      "planes_compra", "planes_compra_lineas",
      // ADR-0372 (Plan de campaña, 2026-10-12): el mínimo de cada tienda en el reparto del plan, y la historia de ventas de antes del ERP
      // (soles por tienda y día, desde los Excel «Sinatra»; solo la lee `fn_historial_ventas`, que pide el módulo del plan). Refresco del
      // 2026-10-12.
      "planes_compra_reparto", "ventas_historicas",
      // Órdenes de compra: el pedido que se le manda a un proveedor (generada o anulada), sus líneas y la versión anterior de cada edición, que
      // nunca se cambia. Están en producción y su migración TODAVÍA NO ESTÁ en el repo (ni en `main` ni en una rama): se encontraron en el
      // refresco del volcado del 2026-10-11 (docs/backlog/2026-10-11-diccionario-precios-tienda.md).
      "ordenes_compra", "orden_compra_items", "orden_compra_versiones",
      // ADR-0362 (fases 4 y 5a): lo que faltó o sobró al recibir un envío de orden y lo resuelto de cada deuda del proveedor («Nos
      // debe»): es lo que el proveedor le debe a CAYLA, el pájaro de Compras. Asignadas en el refresco del 2026-10-13.
      "despacho_diferencias", "proveedor_deuda_resoluciones",
      // Las diferencias que todavía valen (reabrir un envío deja las viejas como historia, 20261013180000): es la misma deuda del
      // proveedor, el mismo pájaro que `despacho_diferencias`. La asignó el refresco del volcado del 2026-10-15.
      "despacho_diferencias_vigentes",
      // ADR-0184 (Compras por tienda): la parte de cada tienda en un comprobante y quién compra por cada tienda.
      // Asignadas en el refresco del volcado del 2026-09-23.
      "compra_parte_por_tienda", "compradores_de_tienda",
      // ADR-0111 (Compras): cierres de línea por faltante, notas de crédito del proveedor y su saldo a favor.
      // Ya están en producción (ADR-0111, comprobado en el refresco completo del volcado del 2026-09-21).
      "compra_item_cierres", "compra_notas_credito", "proveedor_creditos",
      // ADR-0139 (Compras): el reparto de un comprobante entre tiendas (`compra_item_destinos`: línea × tienda × cantidad),
      // su bitácora de reasignaciones y la vista que cruza el plan con lo recibido y cerrado por tienda. Ya están en
      // producción (172000/173000 pegadas el 2026-09-20).
      "compra_item_destinos", "compra_reasignaciones", "compra_item_reparto_resumen",
      // ADR-0362 (fase 5b): la nota de crédito del proveedor (la 07) que respalda los documentos internos de una factura, y qué
      // documentos respalda. Son del mismo pájaro que `compra_notas_credito`. Refresco del volcado del 2026-10-16.
      "compra_notas_proveedor", "compra_notas_proveedor_documentos",
      // Cada cambio del CCI, la cuenta, el Yape o el titular de un proveedor (20261013161000): antes, después, quién y cuándo.
      // Refresco del volcado del 2026-10-16.
      "proveedores_cambios_bancarios",
      // ADR-0480 (Compras simple, 2026-10-22 y 23): lo que la compradora anota desde el celular y Compras revisa. La compra rápida (`compra_papeles`:
      // boleta, factura o nota con su foto), el gasto de envío (`compra_gastos`), el cierre de lo que quedó sin resolver (`compra_cierres`), lo
      // que ya se había recibido antes de registrar la factura (`compra_item_recibido_antes`) y la plata que le dieron para comprar
      // (`fondo_plata_anotada`: nace «por confirmar» y Compras la confirma en «Revisar compras»). Todas se leen y escriben desde las pantallas de
      // Compras. Al confirmar una plata, la entrega al fondo pasa por `entregar_fondo` y escribe en los libros de Garza, pero escribir allí no
      // hace a Compras dueño de ellos (como escribir en `movimientos`). Asignadas en el refresco del volcado del 2026-10-23.
      "compra_papeles", "compra_gastos", "compra_cierres", "compra_item_recibido_antes", "fondo_plata_anotada",
      // ADR-0480: la ronda de compras de una compradora (RC-000001): la abre, anota sus compras y gastos y la cierra. Se maneja desde
      // Compras. Asignada en el refresco del volcado del 2026-10-26.
      "compra_rondas"] },
  { n: "10", pajaro: "Gallito", modulo: "Producción del Taller",
    tablas: ["producciones", "produccion_lineas", "insumos", "insumo_lotes", "movimientos_insumo", "v_insumo_saldos",
      // ADR-0133 (Producción, D-H): su propio directorio de proveedores y sus comprobantes de tela/avíos/maquila, aparte de los de
      // Compras. Ya están en producción (F4a/F4b); las asignó a Gallito el refresco completo del volcado del 2026-09-21 porque
      // sin pájaro el CI cae en rojo. La sesión de Producción confirma la asignación en el PR de ese refresco.
      "proveedores_produccion", "comprobantes_produccion", "comprobantes_produccion_items", "comprobantes_produccion_pagos",
      // ADR-0133 (F5–F6): recepción y cierre de esos comprobantes, y la cotización de maquila por categoría. Asignadas en el
      // refresco del volcado del 2026-09-23.
      "comprobantes_produccion_recepciones", "comprobantes_produccion_cierres", "cotizaciones_maquila",
      // ADR-0161 (act. d): quién movió cada orden de etapa; solo la escribe `set_etapa_produccion`. Asignada en el refresco
      // del volcado del 2026-09-25.
      "produccion_etapas_historial",
      // ADR-0362 (fase 7): las órdenes de insumos del Taller (OI-…), sus líneas y sus versiones. La compra del Taller no se mezcla con la
      // de tienda (otros proveedores, otro destino, otro correlativo), así que son de Gallito, no de Pelícano. Están en producción desde
      // el 2026-10-13; las asignó el refresco del volcado de ese día. La sesión de Producción confirma la asignación.
      "ordenes_insumo", "orden_insumo_items", "orden_insumo_versiones",
      // ADR-0362 (fase 7, parte 2): lo que se recibió en el Taller contra una orden de insumos y lo que se anotó como que no va a llegar
      // («el proveedor nos debe»). Son de la orden del Taller, como sus líneas. Están en producción desde el 2026-10-15; las asignó el
      // refresco del volcado de ese día.
      "orden_insumo_recepciones", "orden_insumo_cierres",
      // ADR-0400 (el rediseño de Producción): las fases de cada orden y sus avances, la tela y los avíos de la orden, lo que sale a un
      // servicio y lo que vuelve (con sus líneas), cuánta tela lleva cada modelo y la lista de precios de los servicios por fase. Todo se
      // maneja desde Producción. En producción desde el 2026-10-17 (20261014154000); las asignó el refresco del volcado de ese día.
      "produccion_fases", "produccion_avances", "produccion_insumos", "produccion_salidas", "produccion_salida_lineas",
      // ADR-0400 (act. k y l): lo que se marcó «hecho» en una fase que no cuenta prendas (Ploteo). Es de las fases: el mismo pájaro.
      // Asignada en el refresco del volcado del 2026-10-21.
      "produccion_fase_marcas",
      "produccion_vueltas", "produccion_vuelta_lineas", "producto_consumos", "proveedor_tarifas",
      // ADR-0513: los avíos de un modelo y lo que de verdad se gastó por orden cerrada (lo declarado vive en `producto_consumos`). Los propone
      // «Nueva orden» y los escribe `cerrar_produccion`: Producción. Asignadas en el refresco del volcado del 2026-10-26.
      "producto_avios", "producto_consumo_medido",
      // ADR-0554: la TELA (qué es y cómo se compra); sus colores son filas de `insumos`, que ya son de Gallito. La escriben `crear_material`, `agregar_colores_a_material`
      // y `editar_material` desde Producción ▸ Insumos. En producción desde el 2026-10-28 (20261028175000); el volcado se refresca después, y hasta entonces el aviario solo avisa
      // «en el aviario, pero no en el volcado». Asignada con el resto de Producción.
      "materiales"] },
  // `planilla_por_sede` (vista, ADR-0133 F7 / D-33): la planilla YA PAGADA por sede y período, leída de Dynamic. Es costo
  // operativo de la sede —Producción la usa para costear la mano de obra, pero no es suya—, por eso va con los gastos.
  // Finanzas F1–F10 (ADR-0195, ADR-0198), repartidas con el criterio de GOBIERNO §1 «Repartos que no son obvios»: Garza es la
  // plata del día —qué se gastó, dónde está la plata, si cuadra con el banco—; Urraca es el libro —plan de cuentas, tributos,
  // balance y el cierre del mes—. Asignadas en el refresco del volcado del 2026-09-25; Finanzas (Felipe) las confirma en el
  // PR de ese refresco, porque ningún ADR de Finanzas nombra pájaro.
  { n: "11", pajaro: "Garza", modulo: "Finanzas operativas",
    tablas: ["gastos", "planilla_por_sede",
      // Gastos (F2): la lista cerrada de lo que se registra como gasto, los que se repiten cada mes (y las sugerencias que
      // alguien dijo que no lo son), los egresos de caja que NO son gasto, y `gastos_legado_2026_09` —la `gastos` de antes de
      // la unificación, renombrada, con 0 filas—, que sigue siendo de quien responde por `gastos` hasta que se decida quitarla.
      "categorias_gasto", "gastos_fijos", "gastos_fijos_descartados", "egresos_no_gasto", "gastos_legado_2026_09",
      // Cuentas y dinero (F3/F3b): dónde tiene plata CAYLA, a qué cuenta entra cada medio de cobro, cómo se mueve la plata
      // entre cuentas (depósitos, abonos de tarjeta), lo que dijo el banco, lo ya revisado y de qué cuenta fue un pago que
      // se guardó sin decirlo. Es el cuadre de efectivo de GOBIERNO §1, ahora con banco.
      "cuentas_dinero", "medios_de_cobro", "movimientos_dinero", "conciliaciones", "dinero_revisados", "cuentas_asignadas",
      // Caja y avisos: el mínimo de caja que vigilan el Flujo y el Resumen. Y el presupuesto: el tope de gasto de cada mes,
      // que se compara contra `gastos` —el mismo dueño que lo gastado responde por lo que se pensaba gastar—.
      "parametros_finanzas", "presupuestos",
      // Los gastos de un viaje (con sus órdenes y fotos) y los fondos por rendir con su rendición: plata entregada a una persona que
      // vuelve como gastos o como devolución. Es plata del día, como `gastos`. Están en producción desde el 2026-10-13 (sus migraciones
      // aún no están en main); las asignó el refresco del volcado de ese día. Finanzas (Felipe) confirma la asignación.
      "gastos_viaje", "gastos_viaje_ordenes", "gasto_viaje_fotos", "rendiciones_fondo", "rendicion_fondo_items",
      // ADR-0429: las máquinas con que se cobra con tarjeta o QR (con su cuenta «por depositar»), en qué tienda opera cada una, su
      // tarifa, qué días cubrió cada depósito y cada cobro que se reselló a su máquina. Es Cuentas y dinero, como `medios_de_cobro` y
      // `movimientos_dinero`. Están en producción desde el 2026-10-16 (sus migraciones aún no están en main: PR #1138); las asignó el
      // refresco del volcado del 2026-10-17. Finanzas (Felipe) confirma la asignación.
      // ADR-0452: lo que se sabe de un gasto fijo para poder pagarlo sin quien lo cargó (a quién, cómo, el recibo, el contrato) y su historia de
      // cambios. Es de los gastos fijos: el mismo pájaro. Asignadas en el refresco del volcado del 2026-10-21.
      "gastos_fijos_ficha", "gastos_fijos_ficha_cambios",
      "pos_maquinas", "pos_maquinas_sedes", "pos_tarifas", "pos_abonos_lotes", "cobros_resellados"] },
  { n: "12", pajaro: "Urraca", modulo: "Contabilidad",
    tablas: ["activos_fijos",
      // El plan de cuentas (PCGE, F2a) y la lista cerrada de tipos de activo, que trae su cuenta y su vida útil (F2b).
      "cuentas", "tipos_activo",
      // Tasa de IGV (F2a) y, desde Impuestos (F8), UIT y régimen con vigencia. Solo las leen las pantallas y funciones de
      // Finanzas —ni comprobantes ni facturación—, por eso no son de Cuervo.
      "parametros_tributarios",
      // Balance y cierre de mes (F7/F9, ADR-0198): el punto de partida del Balance, el estado de cada mes, su historia de
      // cierres y el diario congelado al cerrar.
      "saldos_iniciales", "periodos", "periodo_cierres", "diario_cerrado"] },
  // Águila lee lo de los demás; el día que escriba sus propios resúmenes, nacen acá. `actividad` (ADR-0207) es el primero:
  // «quién hizo qué» de cada módulo, escrito por disparadores sobre ventas, caja, cambios y apartados, sin que ningún
  // módulo lo escriba a mano. Asignada en el refresco del volcado del 2026-09-26.
  { n: "13", pajaro: "Águila", modulo: "Inteligencia y reportes", tablas: ["actividad"] },
  // ADR-0251: la llave de la revisión diaria de deriva (`huellas_catalogo`); no es dato del negocio. Refresco del 2026-09-28.
  { n: "14", pajaro: "Gorrión", modulo: "Plataforma y esquema", tablas: ["huellas_llave"] },
];

/**
 * Cruza el aviario contra las tablas que existen de verdad.
 *   sinPajaro — existe y no tiene pájaro                  → rompe la regla
 *   dobles    — aparece más de una vez en el aviario       → rompe la regla
 *   ausentes  — está en el aviario y no en la base         → solo aviso: puede ser SQL que
 *               todavía no se pegó en producción, un volcado viejo que todavía no la
 *               conoce, o una tabla que ya no existe y sobra acá
 */
export function revisar(nombresReales, aviario = AVIARIO) {
  const reales = new Set(nombresReales);
  const vistas = new Map();
  for (const p of aviario) for (const t of p.tablas) vistas.set(t, [...(vistas.get(t) ?? []), p.pajaro]);
  return {
    sinPajaro: [...reales].filter(t => !vistas.has(t)).sort(),
    dobles: [...vistas].filter(([, ps]) => ps.length > 1).map(([t, ps]) => `${t} (${ps.join(", ")})`).sort(),
    ausentes: [...vistas.keys()].filter(t => !reales.has(t)).sort(),
  };
}

/**
 * Los pájaros tal como los escribe la tabla «| # | Pájaro | Módulo | Lo lleva |» de GOBIERNO
 * §1. Tolera negritas; no lee la columna «Lo lleva» a propósito: apuntarse a un pájaro no
 * tiene que obligar a nadie a correr un script.
 */
export function pajarosDeGobierno(texto) {
  const lineas = texto.split("\n");
  const inicio = lineas.findIndex(l => /^\|\s*#\s*\|\s*Pájaro\s*\|\s*Módulo\s*\|/.test(l));
  if (inicio < 0) return [];
  const pajaros = [];
  for (const l of lineas.slice(inicio + 2)) {
    if (!l.startsWith("|")) break;
    const [, n, pajaro, modulo] = l.split("|").map(c => c.replace(/\*/g, "").trim());
    pajaros.push({ n, pajaro: pajaro.normalize("NFC"), modulo: modulo.normalize("NFC") });
  }
  return pajaros;
}

/** Diferencias entre los 14 de acá y los 14 de GOBIERNO §1, en palabras. */
export function diferenciasConGobierno(deGobierno, aviario = AVIARIO) {
  const allá = new Map(deGobierno.map(p => [p.n, p]));
  const dif = [];
  for (const p of aviario) {
    const g = allá.get(p.n);
    if (!g) dif.push(`${p.n} · ${p.pajaro}: no está en GOBIERNO §1`);
    else if (g.pajaro !== p.pajaro.normalize("NFC") || g.modulo !== p.modulo.normalize("NFC")) {
      dif.push(`${p.n}: acá «${p.pajaro} — ${p.modulo}», en GOBIERNO «${g.pajaro} — ${g.modulo}»`);
    }
  }
  for (const g of deGobierno) if (!aviario.some(p => p.n === g.n)) dif.push(`${g.n} · ${g.pajaro}: está en GOBIERNO §1 y no acá`);
  return dif;
}

/** El índice de ruteo en Markdown. Sin fecha adentro, para que `--verificar` pueda comparar. */
export function aviarioMd(nombresReales, aviario = AVIARIO) {
  const reales = new Set(nombresReales);
  const { sinPajaro, ausentes } = revisar(nombresReales, aviario);
  const codigo = t => `\`${t}\``;
  const L = [
    "# Aviario — de qué pájaro es cada tabla",
    "",
    "> ⚠️ **ARCHIVO GENERADO. No lo edites a mano** — lo reescribe `pnpm datos:aviario`.",
    "> Para darle pájaro a una tabla se edita `scripts/datos/aviario.mjs`. Para apuntarte a un",
    "> pájaro, `docs/datos/07-GOBIERNO.md` §1: el pájaro es el puesto, quién lo lleva se dice allá.",
    ">",
    `> **Origen:** volcado de producción (\`retail_columnas.json\`) · **Tablas y vistas:** ${reales.size} · **Sin pájaro:** ${sinPajaro.length}`,
    "",
    "## Por pájaro",
    "",
    "| # | Pájaro | Módulo | Tablas |",
    "|---|---|---|---|",
  ];
  for (const p of aviario) {
    const suyas = p.tablas.filter(t => reales.has(t)).sort();
    L.push(`| ${p.n} | **${p.pajaro}** | ${p.modulo} | ${suyas.length ? suyas.map(codigo).join(" · ") : "*sin tablas hoy*"} |`);
  }
  L.push("", "## Por tabla", "", "Tienes un nombre de tabla, quieres el pájaro.", "", "| Tabla | Pájaro |", "|---|---|");
  for (const t of [...reales].sort()) {
    const p = aviario.find(x => x.tablas.includes(t));
    L.push(`| ${codigo(t)} | ${p ? `${p.n} · ${p.pajaro}` : "⚠️ **sin pájaro**"} |`);
  }
  if (sinPajaro.length) {
    L.push("", "## ⚠️ Sin pájaro", "", "Existen en producción y nadie responde por ellas. Se les da pájaro en `scripts/datos/aviario.mjs`.", "");
    for (const t of sinPajaro) L.push(`- ${codigo(t)}`);
  }
  if (ausentes.length) {
    L.push("", "## En el aviario, pero no en el volcado de producción", "",
      "Puede ser SQL que todavía no se pegó allá, o un volcado viejo que todavía no la conoce (cómo refrescarlo:",
      "`COMO-REFRESCAR.md`). Si la tabla ya no existe, sobra en `scripts/datos/aviario.mjs`.", "");
    for (const t of ausentes) L.push(`- ${codigo(t)}`);
  }
  return L.join("\n") + "\n";
}

// ── Ejecución ───────────────────────────────────────────────────────────────
// Solo cuando se corre directo; `generar.mjs` importa este archivo por la lista.

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const GENERADO = join(RAIZ, "docs", "datos", "generado");
  const verificar = process.argv.includes("--verificar");

  const reales = Object.keys(JSON.parse(readFileSync(join(GENERADO, "retail_columnas.json"), "utf8")));
  const deGobierno = pajarosDeGobierno(readFileSync(join(RAIZ, "docs", "datos", "07-GOBIERNO.md"), "utf8"));
  const { sinPajaro, dobles, ausentes } = revisar(reales);
  const difGobierno = deGobierno.length ? diferenciasConGobierno(deGobierno) : ["no encuentro la tabla «| # | Pájaro | Módulo | Lo lleva |» en 07-GOBIERNO.md §1"];

  const errores = [];
  if (sinPajaro.length) errores.push(`${sinPajaro.length} tabla(s) de producción sin pájaro: ${sinPajaro.join(", ")}\n    → Dales pájaro en scripts/datos/aviario.mjs. Si nace una tabla nueva, nace con dueño o no nace.`);
  if (dobles.length) errores.push(`${dobles.length} tabla(s) con más de un pájaro: ${dobles.join("; ")}\n    → Cada tabla tiene un solo dueño; deja una.`);
  if (difGobierno.length) errores.push(`Los pájaros de acá y los de 07-GOBIERNO.md §1 no coinciden:\n    - ${difGobierno.join("\n    - ")}`);
  // El diccionario se ordena con este mapa: si se generó antes de darle pájaro a una tabla, ella sigue en «Sin módulo
  // asignado» aunque aquí ya tenga dueño, y nada más lo notaba (pasó el 2026-10-17 con 20 tablas).
  const diccionario = join(GENERADO, "DICCIONARIO-RETAIL.md");
  if (!sinPajaro.length && existsSync(diccionario) && readFileSync(diccionario, "utf8").includes("\n## Sin módulo asignado\n")) {
    errores.push("DICCIONARIO-RETAIL.md tiene tablas en «Sin módulo asignado» que ya tienen pájaro.\n    → Corre `pnpm datos:generar:produccion` y commitea el diccionario que sale.");
  }

  const md = aviarioMd(reales);
  const ruta = join(GENERADO, "AVIARIO.md");
  if (verificar) {
    if (!existsSync(ruta) || readFileSync(ruta, "utf8") !== md) {
      errores.push("docs/datos/generado/AVIARIO.md quedó viejo.\n    → Corre `pnpm datos:aviario` y commitea el archivo que sale.");
    }
  } else {
    writeFileSync(ruta, md);
  }

  console.log(`\n  Aviario — ${reales.length} tablas y vistas de producción, ${AVIARIO.length} pájaros`);
  if (ausentes.length) console.log(`  · ${ausentes.length} en el aviario pero no en el volcado de producción (aviso, no error: SQL sin pegar o volcado viejo): ${ausentes.join(", ")}`);
  if (errores.length) {
    for (const e of errores) console.error(`  ✗ ${e}`);
    console.error("");
    process.exit(1);
  }
  console.log(`  ✓ Ninguna tabla sin pájaro, ninguna con dos, y los ${deGobierno.length} pájaros coinciden con 07-GOBIERNO.md §1`);
  console.log(verificar ? "  ✓ AVIARIO.md al día\n" : "  ✓ AVIARIO.md escrito — commitéalo junto con el cambio\n");
}
