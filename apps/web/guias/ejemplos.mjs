// Cómo entra el recorredor (`guias/recorrer.mjs`) a cada pantalla con guía cuando no basta su ruta (ADR-0389):
//   · `url`: una ruta con `[id]` necesita un id real de la base LOCAL (una consulta de solo lectura).
//   · `cuenta`: la cuenta de `tema/cuentas.mjs` que ve esa pantalla (Producción solo se ve parado en el Taller).
//   · `sinDatos`: una consulta de solo lectura que dice si la base local NO tiene con qué mostrar la pantalla (devuelve el motivo,
//     o vacío si sí hay). Entonces el recorredor la informa como «sin datos locales» en vez de darla por rota: no se crean datos.
// Una pantalla que no está aquí se recorre con su ruta tal cual y la cuenta de `--cuenta` (por defecto, admin).

import { consultarLocal } from "../tema/motor/sesion.mjs";
import { porClave } from "../tema/cuentas.mjs";

const id = (sql) => {
  const v = consultarLocal(sql).split("\n")[0]?.trim();
  if (!v) throw new Error(`Sin dato en la base local para: ${sql}`);
  return v;
};

/** Una consulta preferida y, si la base local es más vieja y no entiende alguna de sus tablas o columnas, la que sigue (la última, la
 *  más simple). */
const idConRespaldo = (...consultas) => {
  for (const [i, sql] of consultas.entries()) {
    try {
      return id(sql);
    } catch (e) {
      if (i === consultas.length - 1) throw e;
    }
  }
};
/** La orden más reciente, «generada» primero: la consulta simple de las pantallas de orden. */
const SIMPLE_ORDEN = "select id from retail.ordenes_compra order by (estado = 'generada') desc, creada_en desc limit 1";
/** Un texto SQL dentro de otro, entre comillas simples (para `query_to_xml`, que solo lo lee si llega a correr). */
const entreComillas = (sql) => `'${sql.replace(/'/g, "''")}'`;

// Fase 3 (envíos): lo que le queda por enviar a una línea pedida es lo pedido o lo facturado (comprobantes vigentes), lo mayor, menos lo
// que va en envíos no anulados: la misma cuenta que `fn_ordenes_compra_por_enviar`, que desde aquí no se puede llamar (pide el módulo a
// una sesión). Solo se lee en una base que ya tiene `despachos` (si no, `sinDatos` lo dice antes).
const QUEDA_POR_ENVIAR =
  "greatest(i.cantidad, coalesce((select sum(ci.cantidad) from retail.compra_items ci join retail.compras c on c.id = ci.compra_id and c.estado = 'vigente' where ci.orden_compra_item_id = i.id), 0)) - coalesce((select sum(di.cantidad) from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id and d.estado <> 'anulado' where di.orden_compra_item_id = i.id), 0)";
const CON_ALGO_POR_ENVIAR = `o.estado = 'generada' and exists (select 1 from retail.orden_compra_items i where i.orden_compra_id = o.id and ${QUEDA_POR_ENVIAR} > 0)`;
const CON_ENVIO_VIVO =
  "exists (select 1 from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id and d.estado <> 'anulado' join retail.orden_compra_items i on i.id = di.orden_compra_item_id where i.orden_compra_id = o.id)";
const CON_COMPROBANTE_VIGENTE = "exists (select 1 from retail.compras c where c.orden_compra_id = o.id and c.estado = 'vigente')";

// Sin la tabla de órdenes de compra (o sin una orden), sus pantallas no tienen qué mostrar.
const SIN_ORDENES =
  "select case when count(*) = 0 then 'la base local no tiene el módulo ordenes_compra (faltan las migraciones 20261010214500 y siguientes): la cuenta cae en «Sin acceso»' end from retail.modulos where clave = 'ordenes_compra'";
const SIN_ORDENES_O_NINGUNA =
  "select case when to_regclass('retail.ordenes_compra') is null or not exists (select 1 from retail.modulos where clave = 'ordenes_compra') then 'la base local no tiene el módulo ordenes_compra (faltan las migraciones 20261010214500 y siguientes): la cuenta cae en «Sin acceso»' when query_to_xml('select 1 from retail.ordenes_compra limit 1', false, true, '')::text = '' then 'no hay ninguna orden de compra en la base local' end";

// Registrar el comprobante de una orden pide la función `registrar_comprobante_orden` (fase 2) y una orden generada con «Llega a».
const SIN_COMPROBANTE_DE_ORDEN =
  "select case when to_regclass('retail.ordenes_compra') is null or not exists (select 1 from retail.modulos where clave = 'ordenes_compra') then 'la base local no tiene el módulo ordenes_compra (faltan las migraciones 20261010214500 y siguientes): la cuenta cae en «Sin acceso»' when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'registrar_comprobante_orden') then 'la base local no tiene registrar_comprobante_orden (migraciones de los comprobantes de orden, fase 2): la pantalla avisa que todavía no está lista' when query_to_xml('select 1 from retail.ordenes_compra where estado = ''generada'' and ubicacion_destino_id is not null limit 1', false, true, '')::text = '' then 'no hay una orden generada con «Llega a» en la base local' end";

// Enviar una orden a una sede pide la función `crear_envio` (fase 3) y una orden generada a la que le quede algo por enviar.
const SIN_ENVIO_DE_ORDEN = `select case when to_regclass('retail.ordenes_compra') is null or not exists (select 1 from retail.modulos where clave = 'ordenes_compra') then 'la base local no tiene el módulo ordenes_compra (faltan las migraciones 20261010214500 y siguientes): la cuenta cae en «Sin acceso»' when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'crear_envio') then 'la base local no tiene crear_envio (migración 20261012225000, los envíos de la fase 3): la pantalla avisa que todavía no está lista' when query_to_xml(${entreComillas(`select 1 from retail.ordenes_compra o where ${CON_ALGO_POR_ENVIAR} limit 1`)}, false, true, '')::text = '' then 'no hay una orden generada con algo por enviar en la base local' end`;

// Fase 4 (recibir un envío en la sede): quien hizo la orden no la recibe (decisión 17), y la cuenta `admin` del recorredor es Felipe, que hace
// las órdenes de prueba: para él la pantalla dice «La recibe otra persona». Se recorre con `integrante` (Micaela, de Tienda Trujillo, con el
// módulo Recibir) y se prefiere un envío a SU sede: abierto (el formulario, la cara que más enseña), si no en camino y si no ya cerrado.
const QUIEN_RECIBE = "integrante";
const CORREO_QUIEN_RECIBE = porClave(QUIEN_RECIBE)?.correo ?? "";
const SEDE_DE_QUIEN_RECIBE = `(select c.ubicacion_asignada_id from retail.colaboradores c join public.personas p on p.id = c.persona_id join auth.users u on u.id = p.auth_user_id where u.email = '${CORREO_QUIEN_RECIBE}' limit 1)`;
const ORDEN_DE_ENVIO = "case d.estado when 'abierto' then 0 when 'en_camino' then 1 when 'cerrado' then 2 else 3 end, d.despachado_en desc";
const SIN_RECEPCION_DE_ENVIO = `select case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'recibir_despacho') then 'la base local no tiene recibir_despacho (migraciones 20261013001000 y 20261013002000, la recepción de la fase 4): la pantalla no puede recibir' when query_to_xml('select 1 from retail.despachos limit 1', false, true, '')::text = '' then 'no hay ningún envío de orden de compra en la base local' when not exists (select 1 from retail.rol_modulos m join retail.colaboradores c on c.rol_id = m.rol_id join public.personas p on p.id = c.persona_id join auth.users u on u.id = p.auth_user_id where u.email = '${CORREO_QUIEN_RECIBE}' and m.modulo = 'recibir') then 'la cuenta de prueba «${QUIEN_RECIBE}» no tiene el módulo Recibir en la base local: cae en «Sin acceso»' end`;

export const EJEMPLOS = {
  // La factura con más que enseñar: con saldo y mercadería por llegar (así se ven «Cerrar con faltante», «Ir a recibir» y «Registrar pago»).
  "/compras/factura/[compraId]": {
    url: () => `/compras/factura/${id("select id from retail.compras where estado = 'vigente' order by (saldo > 0) desc, (estado_recepcion <> 'recibida') desc, created_at desc limit 1")}`,
  },
  "/compras/parte/[compraId]": {
    // La ve una cuenta que NO es líder y tiene una parte en una factura de otra tienda: ni esa cuenta ni esa factura existen en local.
    sinDatos: "select 'ninguna compra local está repartida entre tiendas y no hay cuenta de prueba que no sea líder con una parte'",
    url: () => `/compras/parte/${id("select id from retail.compras order by created_at desc limit 1")}` },
  // Órdenes de compra: su módulo y sus tablas nacen en 20261010214500 y las siguientes (2026-10-10); sin ellas la cuenta cae en «Sin
  // acceso». Una orden «generada» es la que más enseña (con «Editar» y «Anular orden»). No se aplican migraciones por esto.
  "/compras/ordenes": { sinDatos: SIN_ORDENES },
  "/compras/ordenes/nueva": { sinDatos: SIN_ORDENES },
  // Fase 2 (comprobantes de orden): la que más enseña al verla es una generada con un comprobante vigente (se ven «Llegó en papel», la lista
  // de comprobantes y su «Anular»); al editarla, una generada SIN comprobante (con él, solo se ve el aviso de que ya no se edita); y al registrar
  // su comprobante, una generada con «Llega a» y sin papel todavía (todo el formulario precargado). Si la base local es más vieja y no tiene
  // `compras.orden_compra_id`, se cae a la orden generada más reciente.
  // Fase 3 (envíos): al verla gana la que además tiene un envío vivo (se ven «Enviado», la lista de envíos y su «Anular envío»); una base
  // sin `despachos` se queda con la consulta de la fase 2.
  "/compras/ordenes/ver/[id]": {
    sinDatos: SIN_ORDENES_O_NINGUNA,
    url: () =>
      `/compras/ordenes/ver/${idConRespaldo(
        `select o.id from retail.ordenes_compra o order by (${CON_COMPROBANTE_VIGENTE})::int + (${CON_ENVIO_VIVO})::int desc, ${CON_COMPROBANTE_VIGENTE} desc, (o.estado = 'generada') desc, o.creada_en desc limit 1`,
        `select o.id from retail.ordenes_compra o order by ${CON_COMPROBANTE_VIGENTE} desc, (o.estado = 'generada') desc, o.creada_en desc limit 1`,
        SIMPLE_ORDEN,
      )}`,
  },
  "/compras/ordenes/editar/[id]": {
    sinDatos: SIN_ORDENES_O_NINGUNA,
    url: () =>
      `/compras/ordenes/editar/${idConRespaldo(
        "select o.id from retail.ordenes_compra o order by (o.estado = 'generada' and not exists (select 1 from retail.compras c where c.orden_compra_id = o.id)) desc, o.creada_en desc limit 1",
        SIMPLE_ORDEN,
      )}`,
  },
  "/compras/ordenes/comprobante/[id]": {
    sinDatos: SIN_COMPROBANTE_DE_ORDEN,
    url: () =>
      `/compras/ordenes/comprobante/${idConRespaldo(
        "select o.id from retail.ordenes_compra o where o.estado = 'generada' and o.ubicacion_destino_id is not null order by (not exists (select 1 from retail.compras c where c.orden_compra_id = o.id)) desc, o.creada_en desc limit 1",
        "select o.id from retail.ordenes_compra o where o.estado = 'generada' and o.ubicacion_destino_id is not null order by o.creada_en desc limit 1",
      )}`,
  },
  // Enviar a una sede (fase 3): la que más enseña es una que ya tuvo un envío y todavía tiene algo por enviar (se ven el aviso «Esta orden ya
  // tuvo envíos» y «ya salieron» en cada línea); después, una «Por repartir» (se elige la sede, con «Todo lo que queda» y «Dejar todas en 0»
  // si trae varias líneas); si no, la más reciente con algo por enviar.
  "/compras/ordenes/envio/[id]": {
    sinDatos: SIN_ENVIO_DE_ORDEN,
    url: () =>
      `/compras/ordenes/envio/${idConRespaldo(
        `select o.id from retail.ordenes_compra o where ${CON_ALGO_POR_ENVIAR} order by ${CON_ENVIO_VIVO} desc, (o.ubicacion_destino_id is null) desc, o.creada_en desc limit 1`,
        SIMPLE_ORDEN,
      )}`,
  },
  // Resultados e Historial del Plan de campaña leen funciones de las migraciones del 2026-10-12 (campañas y ventas de Sinatra): sin ellas
  // Resultados dice «Todavía no hay campañas» e Historial, que no pudo leer.
  "/compras/plan/resultados": {
    sinDatos:
      "select case when count(*) = 0 then 'la base local no tiene fn_planes_compra ni fn_plan_compra_resultados (migraciones del 2026-10-12): Resultados no tiene campaña que mostrar' end from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_plan_compra_resultados'",
  },
  "/compras/plan/historial": {
    sinDatos:
      "select case when count(*) = 0 then 'la base local no tiene fn_historial_ventas (migración 20261012160000, ventas de Sinatra): el Historial no se puede leer' end from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_historial_ventas'",
  },
  "/compras/proveedores/[id]": { url: () => `/compras/proveedores/${id("select id from retail.proveedores order by created_at desc limit 1")}` },
  // Abierto (se cuenta) y, si no hay, uno cerrado (el resultado), antes que uno cancelado: es la cara que más hay que enseñar.
  "/inventario/conteo/[id]": { url: () => `/inventario/conteo/${id("select id from retail.conteos order by (estado = 'abierto') desc, (estado = 'cerrado') desc, created_at desc limit 1")}` },
  "/inventario/conteo/[id]/confirmar": {
    sinDatos: "select case when count(*) = 0 then 'no hay un conteo abierto (Confirmar solo existe mientras se cuenta)' end from retail.conteos where estado = 'abierto'",
    url: () => `/inventario/conteo/${id("select id from retail.conteos order by (estado = 'abierto') desc, created_at desc limit 1")}/confirmar` },
  "/inventario/conteo/[id]/revisar": {
    sinDatos: "select case when count(*) = 0 then 'no hay un conteo abierto (Revisar solo existe mientras se cuenta)' end from retail.conteos where estado = 'abierto'",
    url: () => `/inventario/conteo/${id("select id from retail.conteos order by created_at desc limit 1")}/revisar` },
  "/inventario/traslados/(billetera)/[id]": { url: () => `/inventario/traslados/${id("select id from retail.transferencias order by created_at desc limit 1")}` },
  "/recibir/envio/[id]": {
    cuenta: QUIEN_RECIBE,
    sinDatos: SIN_RECEPCION_DE_ENVIO,
    url: () =>
      `/recibir/envio/${idConRespaldo(
        `select d.id from retail.despachos d order by (d.ubicacion_destino_id = ${SEDE_DE_QUIEN_RECIBE}) desc nulls last, ${ORDEN_DE_ENVIO} limit 1`,
        `select d.id from retail.despachos d order by ${ORDEN_DE_ENVIO} limit 1`,
      )}`,
  },
  // Editar producto y Familias leen columnas que entraron con las migraciones del 2026-10-10/11 (familias que entran a los
  // motores, precio de tienda): con la base local atrasada, la página no carga. No se aplican migraciones por esto.
  "/productos/familias": {
    sinDatos:
      "select case when count(*) = 0 then 'la base local no tiene las migraciones del 2026-10-10 (familias.entra_a_motores): la página no carga' end from information_schema.columns where table_schema = 'retail' and table_name = 'familias' and column_name = 'entra_a_motores'",
  },
  "/productos/[id]/editar": {
    sinDatos:
      "select case when count(*) = 0 then 'la base local no tiene las migraciones del 2026-10-10 (familias.entra_a_motores, precio de tienda): la página no carga' end from information_schema.columns where table_schema = 'retail' and table_name = 'familias' and column_name = 'entra_a_motores'",
    url: () => `/productos/${id("select id from retail.productos where estado = 'activo' order by created_at desc limit 1")}/editar` },
  // La prenda con más movimientos: así el Historial tiene qué mostrar (filtros, varias tarjetas).
  "/productos/[id]/historial": {
    url: () =>
      `/productos/${id("select v.producto_id from retail.movimientos m join retail.variantes v on v.id = m.variante_id join retail.productos p on p.id = v.producto_id where p.estado = 'activo' group by v.producto_id order by count(*) desc limit 1")}/historial`,
  },
  // El buscador con una búsqueda que encuentra algo de verdad: así se ven los pasos de resultados.
  "/buscar": { url: () => `/buscar?q=${encodeURIComponent(id("select split_part(referencia, ' ', 1) from retail.productos where estado = 'activo' and referencia ~ '^[A-Za-zÁÉÍÓÚáéíóúñÑ]{3,}' and referencia not ilike 'prenda%' order by created_at limit 1"))}` },
  // Plan del piso: su módulo y sus lecturas nacen en 20261006100000/20261006110000; sin ellas la cuenta cae en «Sin acceso».
  "/gestion/plan-del-piso": {
    sinDatos: "select case when count(*) = 0 then 'la base local no tiene el módulo plan_piso (faltan las migraciones 20261006100000 y 20261006110000)' end from retail.modulos where clave = 'plan_piso'",
  },
  // Rótulos con dos modelos (como llega desde Productos con dos marcados): así se ven «Cómo salen», la vista previa y las copias.
  "/rotulos": { url: () => `/rotulos?productos=${id("select string_agg(id::text, ',') from (select id from retail.productos where estado = 'activo' order by created_at desc limit 2) p")}` },
  "/produccion": { cuenta: "admin-taller" },
  "/produccion/comprobantes": { cuenta: "admin-taller" },
  "/produccion/cotizaciones-maquila": { cuenta: "admin-taller" },
  "/produccion/eficiencia": { cuenta: "admin-taller" },
  "/produccion/insumos": { cuenta: "admin-taller" },
  "/produccion/ordenes": { cuenta: "admin-taller" },
  "/produccion/por-pagar": { cuenta: "admin-taller" },
  "/produccion/proveedores": { cuenta: "admin-taller" },
  "/produccion/recibir": { cuenta: "admin-taller" },
  "/global": { cuenta: "admin-global" },
};
