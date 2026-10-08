// Cómo entra el recorredor (`guias/recorrer.mjs`) a cada pantalla con guía cuando no basta su ruta (ADR-0362):
//   · `url`: una ruta con `[id]` necesita un id real de la base LOCAL (una consulta de solo lectura).
//   · `cuenta`: la cuenta de `tema/cuentas.mjs` que ve esa pantalla (Producción solo se ve parado en el Taller).
// Una pantalla que no está aquí se recorre con su ruta tal cual y la cuenta de `--cuenta` (por defecto, admin).

import { consultarLocal } from "../tema/motor/sesion.mjs";

const id = (sql) => {
  const v = consultarLocal(sql).split("\n")[0]?.trim();
  if (!v) throw new Error(`Sin dato en la base local para: ${sql}`);
  return v;
};

export const EJEMPLOS = {
  "/compras/factura/[compraId]": { url: () => `/compras/factura/${id("select id from retail.compras order by created_at desc limit 1")}` },
  "/compras/parte/[compraId]": { url: () => `/compras/parte/${id("select id from retail.compras order by created_at desc limit 1")}` },
  "/compras/proveedores/[id]": { url: () => `/compras/proveedores/${id("select id from retail.proveedores order by created_at desc limit 1")}` },
  // Abierto (se cuenta) y, si no hay, uno cerrado (el resultado), antes que uno cancelado: es la cara que más hay que enseñar.
  "/inventario/conteo/[id]": { url: () => `/inventario/conteo/${id("select id from retail.conteos order by (estado = 'abierto') desc, (estado = 'cerrado') desc, created_at desc limit 1")}` },
  "/inventario/conteo/[id]/confirmar": { url: () => `/inventario/conteo/${id("select id from retail.conteos order by (estado = 'abierto') desc, created_at desc limit 1")}/confirmar` },
  "/inventario/conteo/[id]/revisar": { url: () => `/inventario/conteo/${id("select id from retail.conteos order by created_at desc limit 1")}/revisar` },
  "/inventario/traslados/(billetera)/[id]": { url: () => `/inventario/traslados/${id("select id from retail.transferencias order by created_at desc limit 1")}` },
  "/productos/[id]/editar": { url: () => `/productos/${id("select id from retail.productos where estado = 'activo' order by created_at desc limit 1")}/editar` },
  "/productos/[id]/historial": { url: () => `/productos/${id("select id from retail.productos where estado = 'activo' order by created_at desc limit 1")}/historial` },
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
