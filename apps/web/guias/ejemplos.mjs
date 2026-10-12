// Cómo entra el recorredor (`guias/recorrer.mjs`) a cada pantalla con guía cuando no basta su ruta (ADR-0362):
//   · `url`: una ruta con `[id]` necesita un id real de la base LOCAL (una consulta de solo lectura).
//   · `cuenta`: la cuenta de `tema/cuentas.mjs` que ve esa pantalla (Producción solo se ve parado en el Taller).
//   · `sinDatos`: una consulta de solo lectura que dice si la base local NO tiene con qué mostrar la pantalla (devuelve el motivo,
//     o vacío si sí hay). Entonces el recorredor la informa como «sin datos locales» en vez de darla por rota: no se crean datos.
// Una pantalla que no está aquí se recorre con su ruta tal cual y la cuenta de `--cuenta` (por defecto, admin).

import { consultarLocal } from "../tema/motor/sesion.mjs";

const id = (sql) => {
  const v = consultarLocal(sql).split("\n")[0]?.trim();
  if (!v) throw new Error(`Sin dato en la base local para: ${sql}`);
  return v;
};

export const EJEMPLOS = {
  // La factura con más que enseñar: con saldo y mercadería por llegar (así se ven «Cerrar con faltante», «Ir a recibir» y «Registrar pago»).
  "/compras/factura/[compraId]": {
    url: () => `/compras/factura/${id("select id from retail.compras where estado = 'vigente' order by (saldo > 0) desc, (estado_recepcion <> 'recibida') desc, created_at desc limit 1")}`,
  },
  "/compras/parte/[compraId]": {
    // La ve una cuenta que NO es líder y tiene una parte en una factura de otra tienda: ni esa cuenta ni esa factura existen en local.
    sinDatos: "select 'ninguna compra local está repartida entre tiendas y no hay cuenta de prueba que no sea líder con una parte'",
    url: () => `/compras/parte/${id("select id from retail.compras order by created_at desc limit 1")}` },
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
  "/inventario/plan-del-piso": {
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
