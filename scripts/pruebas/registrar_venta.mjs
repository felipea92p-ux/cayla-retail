#!/usr/bin/env node
/**
 * Pruebas de `retail.registrar_venta` contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. `registrar_venta` (0003_funciones.sql, extendida por
 * 0008_caja_y_pagos, 0011_venta_con_comprobante, candado_precio_venta, codigos_descuento,
 * nota_en_ventas, inventario_piso_almacen y descuento_motivo_y_escalonado — hoy 11
 * parámetros) es la función más tocada del repo: cada venta real de las 3 tiendas pasa
 * por acá. Valida precio, sede, descuento y pagos ANTES de tocar stock, todo en una sola
 * transacción todo-o-nada — y tenía CERO pruebas automatizadas (BACKLOG, sección
 * "Cambios: primeras pruebas automatizadas de registrar_cambio", 2026-09-16).
 *
 * QUÉ HACE. Mismo patrón que `scripts/pruebas/registrar_cambio.mjs` (léelo primero si
 * esto no tiene sentido): corre los escenarios de abajo contra la RPC real, cada uno en
 * su propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el
 * Postgres local que comparten ~27 worktrees, sin dejar rastro ni pisar datos de otra
 * sesión. Simula a Felipe (líder, opera cualquier sede) o Micaela (colaboradora, fija a
 * Tienda Trujillo) con `set local request.jwt.claim.sub`, igual que `supabase/seed.sql` —
 * sin JWT real, PostgREST ni `@supabase/supabase-js`: habla con Postgres directo vía
 * `docker exec ... psql`.
 *
 * POR QUÉ NO ES UN `*.test.ts` DE VITEST. `pnpm test` (CI incluido) corre sobre un
 * checkout limpio sin Postgres ni Docker — si esto viviera donde vitest lo descubre
 * solo, CI se pondría rojo por una razón ajena al código. Por eso vive en `scripts/` y
 * se corre a mano, nunca desde `pnpm test` (mismo criterio que documenta la cabecera de
 * `registrar_cambio.mjs`).
 *
 * QUÉ DA POR SENTADO. Que `Tienda Lima`, `Tienda Trujillo` y la variante
 * `BLU-EMMA-NEG-M` (precio 79.90, costo 32.00 en el seed) existen (`supabase/seed.sql`).
 * Cada escenario deja su propia sububicación de piso/almacén si faltara (autocuración,
 * mismo motivo que ya documenta `registrar_cambio.mjs`: este Postgres compartido puede
 * no tenerlas para alguna sede) y su propia caja limpia (cierra cualquiera abierta con la
 * RPC real `cerrar_caja`, nunca un UPDATE crudo, y abre una con `abrir_caja`) — todo
 * dentro de la misma transacción que se revierte.
 *
 * EL CANDADO DE SEDE QUE SÍ EXISTE (y el que no). La consigna original pedía probar que
 * "una variante restringida a otra sede" no se puede vender — ese concepto no existe en
 * el código hoy (grep sobre `supabase/migrations/*.sql`: cero columnas/tablas de
 * restricción de variante por sede; el stock simplemente es 0 en las sedes que no la
 * tienen, lo que ya cubre el escenario 4 de abajo). El candado de sede que SÍ existe es
 * de PERSONA, no de variante: `fn_puede_operar_ubicacion` (líder u ubicación asignada) —
 * el mismo mecanismo que ya prueba `registrar_cambio.mjs` (escenario 10, "Micaela no
 * puede cambiar en Lima"). Escenario 2 de abajo es su equivalente para Vender.
 *
 * USO
 *   pnpm pruebas:registrar-venta    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

// Mismas credenciales obvias que supabase/seed.sql y registrar_cambio.mjs.
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado
// que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function comoPersona(authUserId, sqlDespues) {
  return `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sqlDespues}
`;
}

/**
 * Deja lista una sede con piso/almacén, caja abierta y stock de sobra de
 * BLU-EMMA-NEG-M (precio 79.90, costo 32.00 en el seed) — todo lo que
 * `registrar_venta` exige antes de aceptar una venta real.
 *
 * `colchon` es el stock que se siembra (independiente de la `cantidad` que cada
 * escenario venda): por defecto alcanza de sobra; el escenario de "sin stock
 * suficiente" lo pasa bajo a propósito.
 */
function fixture({ ubicacionNombre = "Tienda Lima", colchon = 1000 } = {}) {
  return `
select id as ubic from retail.ubicaciones where nombre = '${ubicacionNombre}' \\gset

-- Autocuración: este Postgres compartido puede no tener piso/almacén para esta sede
-- (mismo motivo que documenta la cabecera de registrar_cambio.mjs).
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');

-- Caja limpia y propia: cierra cualquiera abierta con la RPC real (nunca un UPDATE
-- crudo a estado) y abre una nueva.
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset

select id as v1, precio as v1_precio, costo as v1_costo from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', ${colchon}, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset

select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic'),0) as stock_v1_antes \\gset
`;
}

const CASOS = [];
function exito(nombre, sql, verificar) {
  CASOS.push({ nombre, tipo: "exito", sql, verificar });
}
function error(nombre, sql, contiene) {
  CASOS.push({ nombre, tipo: "error", sql, contiene });
}

// ---------------------------------------------------------------------------
// 1: la venta simple mueve el stock exacto, en la sede correcta
// ---------------------------------------------------------------------------

exito(
  "una venta simple baja el stock de la variante correcta en la sede correcta",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 2, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric * 2)),
  null, gen_random_uuid()) as venta_id \\gset
select
  (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic'),0) - :'stock_v1_antes'),
  (select count(*) from retail.venta_items where venta_id = :'venta_id'),
  (select ubicacion_id from retail.movimientos where venta_item_id = (select id from retail.venta_items where venta_id = :'venta_id')) = :'ubic'::uuid;
rollback;
`
  ),
  ([deltaStock, items, sedeCorrecta]) => Number(deltaStock) === -2 && Number(items) === 1 && sedeCorrecta === "t"
);

// ---------------------------------------------------------------------------
// 1b: el efectivo recibido (`venta_pagos.recibido`, 20260919210000) — para reimprimir el vuelto
// ---------------------------------------------------------------------------

exito(
  "el efectivo entregado se guarda en venta_pagos.recibido (el vuelto sale de recibido − monto)",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', (:'v1_precio')::numeric, 'recibido', (:'v1_precio')::numeric + 20)),
  null, gen_random_uuid()) as venta_id \\gset
select recibido = (:'v1_precio')::numeric + 20 from retail.venta_pagos where venta_id = :'venta_id';
rollback;
`
  ),
  ([guardado]) => guardado === "t"
);

exito(
  "un medio que no es efectivo no guarda recibido, aunque el navegador lo mande",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', (:'v1_precio')::numeric, 'recibido', (:'v1_precio')::numeric + 20)),
  null, gen_random_uuid()) as venta_id \\gset
select recibido is null from retail.venta_pagos where venta_id = :'venta_id';
rollback;
`
  ),
  ([esNulo]) => esNulo === "t"
);

error(
  "un efectivo recibido menor que lo que cubre se rechaza (candado venta_pagos_recibido_coherente)",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', (:'v1_precio')::numeric, 'recibido', (:'v1_precio')::numeric - 1)),
  null, gen_random_uuid());
rollback;
`
  ),
  "venta_pagos_recibido_coherente"
);

// ---------------------------------------------------------------------------
// 2: el candado de sede — mismo mecanismo que ya prueba registrar_cambio.mjs
// ---------------------------------------------------------------------------

error(
  "una colaboradora de otra sede (Micaela, fija a Trujillo) no puede vender en Lima",
  comoPersona(
    MICAELA,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.registrar_venta(:'ubic', '[]'::jsonb, '[]'::jsonb);
`
  ),
  "No tienes permiso para vender en esa ubicación"
);

// ---------------------------------------------------------------------------
// 3-9: los candados estructurales — carrito, pago, comprobante, precio, catálogo, caja
// ---------------------------------------------------------------------------

error(
  "el carrito está vacío",
  comoPersona(
    FELIPE,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.registrar_venta(:'ubic', '[]'::jsonb, '[]'::jsonb);
`
  ),
  "El carrito está vacío"
);

error(
  "falta indicar el método de pago",
  comoPersona(
    FELIPE,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.registrar_venta(:'ubic', '[{"variante_id":"00000000-0000-0000-0000-000000000000"}]'::jsonb, '[]'::jsonb);
`
  ),
  "Falta indicar cómo se pagó la venta"
);

error(
  "un tipo de comprobante que no es boleta ni factura",
  comoPersona(
    FELIPE,
    `select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.registrar_venta(:'ubic',
  '[{"variante_id":"00000000-0000-0000-0000-000000000000"}]'::jsonb,
  '[{"metodo":"tarjeta","monto":1}]'::jsonb,
  null, null, 'recibo_magico');
`
  ),
  "solo puede facturarse como boleta o factura"
);

error(
  "sin caja abierta en la ubicación",
  comoPersona(
    FELIPE,
    `${fixture()}
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_de_nuevo \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :'v1_precio')),
  null, gen_random_uuid());
`
  ),
  "No hay una caja abierta en esta ubicación"
);

error(
  "los pagos no cuadran con el total de la venta",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 5)),
  null, gen_random_uuid());
`
  ),
  "no cuadran con el total de la venta"
);

error(
  "el precio que manda la caja ya no es el del catálogo (candado ADR-0048)",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', (:'v1_precio')::numeric - 5, 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 5)),
  null, gen_random_uuid());
`
  ),
  "venta_precio_cambiado"
);

error(
  "la variante no existe",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1, 'precio_unitario', 50, 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 50)),
  null, gen_random_uuid());
`
  ),
  "no existe"
);

error(
  "sin stock suficiente: nunca deja el stock negativo",
  comoPersona(
    FELIPE,
    `${fixture({ colchon: 2 })}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 999999, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric * 999999)),
  null, gen_random_uuid());
`
  ),
  "Stock insuficiente"
);

// ---------------------------------------------------------------------------
// 10: idempotencia — el mismo doble clic que ADR-0032/0033 ya cerraron en Vender
// ---------------------------------------------------------------------------

exito(
  "el mismo token dos veces no duplica la venta ni sus movimientos",
  comoPersona(
    FELIPE,
    `${fixture()}
select gen_random_uuid() as token_fijo \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :'v1_precio')),
  null, :'token_fijo') as venta_id_1 \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :'v1_precio')),
  null, :'token_fijo') as venta_id_2 \\gset
select
  (:'venta_id_1' = :'venta_id_2'),
  (select count(*) from retail.ventas where token_cliente = :'token_fijo'),
  (select count(*) from retail.venta_items where venta_id = :'venta_id_1'::uuid),
  (select count(*) from retail.movimientos where venta_item_id in (select id from retail.venta_items where venta_id = :'venta_id_1'::uuid));
rollback;
`
  ),
  ([mismoId, ventas, items, movs]) => mismoId === "t" && Number(ventas) === 1 && Number(items) === 1 && Number(movs) === 1
);

// ---------------------------------------------------------------------------
// 11-16: descuentos de un Líder — el escalonado de R-45
// (20260915140000_descuento_motivo_y_escalonado.sql — BLU-EMMA-NEG-M: precio 79.90,
// costo 32.00, así que 20% ≈ 15.98/35% ≈ 27.97 y "bajo costo" empieza en 47.90)
// ---------------------------------------------------------------------------

exito(
  "líder: descuento chico (dentro del 20%) con motivo válido pasa",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 10, 'motivo_descuento', 'liquidacion_temporada')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 10)),
  null, gen_random_uuid()) as venta_id \\gset
select descuento_unitario, motivo_descuento from retail.venta_items where venta_id = :'venta_id';
rollback;
`
  ),
  ([descuento, motivo]) => Number(descuento) === 10 && motivo === "liquidacion_temporada"
);

error(
  "líder: descuento sin motivo se rechaza",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 10)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 10)),
  null, gen_random_uuid());
`
  ),
  "venta_descuento_requiere_motivo"
);

error(
  "líder: motivo «otro» sin explicar el detalle se rechaza",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 10, 'motivo_descuento', 'otro')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 10)),
  null, gen_random_uuid());
`
  ),
  "venta_descuento_otro_sin_detalle"
);

error(
  "líder: ningún descuento puede dejar el precio bajo el costo (R-45, candado 1)",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 48, 'motivo_descuento', 'liquidacion_temporada')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 48)),
  null, gen_random_uuid());
`
  ),
  "venta_descuento_bajo_costo"
);

error(
  "líder: banda 20-35% sin argumento escrito se rechaza",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 25, 'motivo_descuento', 'liquidacion_temporada')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 25)),
  null, gen_random_uuid());
`
  ),
  "venta_descuento_requiere_argumento"
);

exito(
  "líder: banda 20-35% con argumento escrito pasa",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 25, 'motivo_descuento', 'liquidacion_temporada', 'argumento_descuento', 'Clienta frecuente, autorizado')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 25)),
  null, gen_random_uuid()) as venta_id \\gset
select descuento_unitario, argumento_descuento from retail.venta_items where venta_id = :'venta_id';
rollback;
`
  ),
  ([descuento, argumento]) => Number(descuento) === 25 && argumento === "Clienta frecuente, autorizado"
);

error(
  "líder: más de 35% nadie puede aplicarlo, ni con argumento (decisión de Felipe, 2026-09-15)",
  comoPersona(
    FELIPE,
    `${fixture()}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 30, 'motivo_descuento', 'liquidacion_temporada', 'argumento_descuento', 'Autorizado igual')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 30)),
  null, gen_random_uuid());
`
  ),
  "venta_descuento_supera_autorizacion"
);

// ---------------------------------------------------------------------------
// 17-20: descuentos de una Colaboradora — el tope es el código (ADR-0048), no el
// escalonado; Micaela opera en SU sede (Trujillo), nunca en Lima (ver escenario 2)
// ---------------------------------------------------------------------------

error(
  "colaboradora: descuento sin código se rechaza",
  comoPersona(
    MICAELA,
    `${fixture({ ubicacionNombre: "Tienda Trujillo" })}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 10, 'motivo_descuento', 'liquidacion_temporada')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 10)),
  null, gen_random_uuid());
`
  ),
  "venta_descuento_requiere_codigo"
);

error(
  "colaboradora: código que no existe (o venció, o es de otra sede) se rechaza",
  comoPersona(
    MICAELA,
    `${fixture({ ubicacionNombre: "Tienda Trujillo" })}
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 10, 'motivo_descuento', 'liquidacion_temporada')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 10)),
  null, gen_random_uuid(), null, 'sin_documento', null, null, 'NOEXISTE123');
`
  ),
  "venta_codigo_descuento_invalido"
);

exito(
  "colaboradora: código válido con descuento dentro de su tope pasa",
  comoPersona(
    MICAELA,
    `${fixture({ ubicacionNombre: "Tienda Trujillo" })}
insert into retail.codigos_descuento (codigo, porcentaje, activo, ubicacion_id)
  values ('PRUEBAVENTA20', 20, true, :'ubic');
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 15, 'motivo_descuento', 'liquidacion_temporada')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 15)),
  null, gen_random_uuid(), null, 'sin_documento', null, null, 'PRUEBAVENTA20') as venta_id \\gset
select descuento_unitario from retail.venta_items where venta_id = :'venta_id';
rollback;
`
  ),
  ([descuento]) => Number(descuento) === 15
);

error(
  "colaboradora: código válido pero el descuento supera el % del código se rechaza",
  comoPersona(
    MICAELA,
    `${fixture({ ubicacionNombre: "Tienda Trujillo" })}
insert into retail.codigos_descuento (codigo, porcentaje, activo, ubicacion_id)
  values ('PRUEBAVENTA20', 20, true, :'ubic');
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 20, 'motivo_descuento', 'liquidacion_temporada')),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric - 20)),
  null, gen_random_uuid(), null, 'sin_documento', null, null, 'PRUEBAVENTA20');
`
  ),
  "venta_descuento_supera_codigo"
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(
      `No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`
    );
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(
          `✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`
        );
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else {
      if (!resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        const columnas = resultado.salida.split("|");
        if (!caso.verificar(columnas)) {
          fallos++;
          console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
        } else {
          console.log(`✓ ${caso.nombre}`);
        }
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
