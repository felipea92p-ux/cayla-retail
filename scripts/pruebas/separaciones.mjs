#!/usr/bin/env node
/**
 * Pruebas de «Separaciones» (`20260923090000_separaciones.sql`, ADR-0166) contra el Postgres local.
 *
 * EL PROBLEMA QUE PRUEBA. Una clienta separa una prenda con un adelanto: la prenda no se puede vender
 * a nadie más, el adelanto es dinero EN CUSTODIA (no es venta) y sale una boleta de anticipo. Al
 * recoger, se cobra el saldo y nace la venta por el total con el precio congelado. Si no recoge, la
 * prenda vuelve a la tienda y el adelanto se le devuelve entero. Este archivo rompe cada paso a
 * propósito: pagos que no cuadran, sin caja, sin permisos, dos veces lo mismo, el precio que cambió
 * en el catálogo, el vencimiento y su gracia de 2 días, la devolución sin prueba, y que el arqueo
 * de la caja cuadre al céntimo con todo eso adentro.
 *
 * MISMO PATRÓN que `apartar_stock.mjs`/`registrar_venta.mjs` (ADR-0066): `docker exec ... psql`,
 * `set local request.jwt.claim.sub` y ROLLBACK siempre — nunca se commitea nada.
 *
 * QUÉ DA POR SENTADO. `Tienda Trujillo` y la variante `BLU-EMMA-NEG-M` del seed; Felipe (líder) y
 * Micaela (colaboradora fija en Trujillo). La preparación (caja propia, stock de sobra) corre como
 * Felipe; cada escenario cambia a la persona que se prueba con otro `set local`.
 *
 * USO
 *   pnpm pruebas:separaciones    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql + "\nrollback;\n").trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Preparación como Felipe: caja propia en Trujillo (se cierra la que hubiera con la RPC real), stock
// de sobra en el piso y una segunda variante a precio conocido. Al final, `quien` pasa a ser la sesión.
function preparar(quien = MICAELA, { colchon = 50 } = {}) {
  return `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00) as caja \\gset
-- En el seed local Lima y Trujillo comparten la serie B001 (en producción cada tienda tiene la suya):
-- sin esto el primer comprobante de Trujillo choca con uno de Lima. Solo dentro de esta transacción.
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT99' when 'factura' then 'FT99' else serie end, siguiente_numero = 1
 where ubicacion_id = :'ubic' and tipo in ('boleta', 'factura');
select id as v, precio as precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'entrada', ${colchon}, 'colchón de prueba') returning id as m0 \\gset
select retail.fn_aplicar_movimiento(:'m0') as _a \\gset
select cantidad as cant0, cantidad_apartada as apart0 from retail.stock
 where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso' \\gset
select coalesce((select siguiente from retail.separacion_correlativos where ubicacion_id = :'ubic'), 1) as corr0 \\gset
set local request.jwt.claim.sub = '${quien}';
`;
}

const items = (cantidad = 1) => `jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', ${cantidad}, 'precio_unitario', :'precio'::numeric))`;
const pagos = (...ps) => `jsonb_build_array(${ps.map(([m, monto, rec]) => `jsonb_build_object('metodo', '${m}', 'monto', ${monto}${rec ? `, 'recibido', ${rec}` : ""})`).join(", ")})`;

// Llamada completa a separar_prendas con valores válidos; cada escenario pisa lo que quiere romper.
function separar({ cantidad = 1, pagosSql = pagos(["efectivo", 50, 60]), extra = "", como = "sep" } = {}) {
  return `select retail.separar_prendas(
    p_ubicacion_id => :'ubic', p_items => ${items(cantidad)}, p_pagos => ${pagosSql},
    p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Lozano Vera', p_clienta_celular => '987 111 222',
    p_devolucion_medio => 'yape'${extra}) as ${como} \\gset
`;
}

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });
const filas = (salida) => salida.split("\n").filter(Boolean);

// ---------------------------------------------------------------------------
// Separar
// ---------------------------------------------------------------------------
exito(
  "separar: aparta la prenda, deja el adelanto en custodia, emite la boleta de anticipo y el invariante cuadra",
  `${preparar()}${separar()}
select s.codigo ~ '^SEP-TRU-[0-9]{4}$', s.estado, s.total = :'precio'::numeric, s.adelanto, s.vence_el = retail.fn_hoy_lima() + 7,
       s.devolucion_numero, s.clienta_celular,
       (select cantidad = :cant0 and cantidad_apartada = :apart0 + 1 from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso'),
       (select count(*) from retail.caja_movimientos where separacion_id = s.id and tipo = 'ingreso' and monto = 50),
       (select c.tipo || ':' || c.es_anticipo || ':' || c.total || ':' || (c.venta_id is null) from retail.comprobantes c where c.id = s.comprobante_anticipo_id),
       (select count(*) from retail.fn_verificar_separaciones()), (select count(*) from retail.fn_verificar_apartados())
  from retail.separaciones s where s.id = :'sep';`,
  (s) => s === "t|abierta|t|50.00|t|987111222|987111222|t|1|boleta:true:50.00:true|0|0"
);

exito(
  "separar con Yape + efectivo: solo el efectivo entra al cajón; el vuelto no",
  `${preparar()}${separar({ pagosSql: pagos(["yape", 30], ["efectivo", 20, 50]) })}
select (select string_agg(metodo || ':' || monto || ':' || coalesce(recibido::text, '-') || ':' || (caja_movimiento_id is not null), ',' order by metodo) from retail.separacion_pagos where separacion_id = :'sep'),
       (select sum(monto) from retail.caja_movimientos where separacion_id = :'sep');`,
  (s) => s === "efectivo:20.00:50.00:true,yape:30.00:-:false|20.00"
);

exito(
  "separar pagando el 100%: se acepta (saldo cero)",
  `${preparar()}${separar({ pagosSql: pagos(["tarjeta", ":'precio'::numeric"]) })}
select total = adelanto from retail.separaciones where id = :'sep';`,
  (s) => s === "t"
);

exito(
  "dos separaciones seguidas en la misma tienda sacan correlativos consecutivos",
  `${preparar()}${separar({ como: "s1" })}${separar({ como: "s2" })}
select (select right(codigo, 4)::int from retail.separaciones where id = :'s2') - (select right(codigo, 4)::int from retail.separaciones where id = :'s1');`,
  (s) => s === "1"
);

exito(
  "idempotencia: el mismo token devuelve la misma separación, sin segundo apartado ni segunda boleta",
  `${preparar()}
select gen_random_uuid() as tok \\gset
${separar({ extra: ", p_token => :'tok'", como: "s1" })}${separar({ extra: ", p_token => :'tok'", como: "s2" })}
select :'s1' = :'s2', (select count(*) from retail.separacion_items where separacion_id = :'s1'),
       (select count(*) from retail.comprobantes where separacion_id = :'s1');`,
  (s) => s === "t|1|1"
);

exito(
  "factura de anticipo: lleva RUC y razón social en el comprobante",
  `${preparar()}${separar({ extra: ", p_comprobante_tipo => 'factura', p_cliente_ruc => '20123456789', p_cliente_razon_social => 'Moda Norte SAC'" })}
select c.tipo, c.cliente_tipo_doc, c.cliente_num_doc, c.cliente_nombre from retail.comprobantes c join retail.separaciones s on s.comprobante_anticipo_id = c.id where s.id = :'sep';`,
  (s) => s === "factura|ruc|20123456789|Moda Norte SAC"
);

exito(
  "devolución por transferencia: guarda el CCI y no un número de Yape",
  `${preparar()}${separar({ extra: ", p_devolucion_medio => 'transferencia', p_devolucion_cci => '002-193-00123456789012'" }).replace("p_devolucion_medio => 'yape', ", "")}
select devolucion_medio, devolucion_cci, devolucion_numero is null from retail.separaciones where id = :'sep';`,
  (s) => s === "transferencia|00219300123456789012|t"
);

error("sin caja abierta no se separa",
  `${preparar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.cerrar_caja(:'caja', 100) as _x \\gset
set local request.jwt.claim.sub = '${MICAELA}';
${separar()}`, "No hay una caja abierta");
error("el adelanto no puede pasar el total", `${preparar()}${separar({ pagosSql: pagos(["yape", 999]) })}`, "no puede pasar el total");
error("un medio con monto cero se rechaza", `${preparar()}${separar({ pagosSql: pagos(["yape", 0]) })}`, "monto mayor a cero");
error("sin pagos no se separa", `${preparar()}${separar({ pagosSql: "'[]'::jsonb" })}`, "Falta indicar cómo dejó el adelanto");
error("celular de 8 dígitos se rechaza", `${preparar()}${separar().replace("'987 111 222'", "'98711122'")}`, "9 dígitos");
error("transferencia sin CCI se rechaza",
  `${preparar()}${separar().replace("p_devolucion_medio => 'yape'", "p_devolucion_medio => 'transferencia'")}`, "CCI");
error("factura sin RUC se rechaza", `${preparar()}${separar({ extra: ", p_comprobante_tipo => 'factura'" })}`, "RUC");
error("una boleta de más de S/700 exige DNI", `${preparar(MICAELA, { colchon: 20 })}${separar({ cantidad: 10 })}`, "lleva el DNI");
exito("con DNI, la boleta de más de S/700 sí se separa",
  `${preparar(MICAELA, { colchon: 20 })}${separar({ cantidad: 10, extra: ", p_clienta_dni => '70124598'" })}
select c.cliente_tipo_doc || ':' || c.cliente_num_doc from retail.comprobantes c join retail.separaciones s on s.comprobante_anticipo_id = c.id where s.id = :'sep';`,
  (s) => s === "dni:70124598");
error("el precio de la caja distinto al del catálogo se rechaza",
  `${preparar()}${separar().replace("'precio_unitario', :'precio'::numeric", "'precio_unitario', 1.00")}`, "venta_precio_cambiado");
error("un descuento manual se rechaza (solo vale la campaña del día)",
  `${preparar()}${separar().replace("'precio_unitario', :'precio'::numeric", "'precio_unitario', :'precio'::numeric, 'descuento_unitario', 5")}`,
  "separacion_descuento_no_coincide");
error("no se puede separar más de lo disponible (y no queda nada a medias)",
  `${preparar(MICAELA, { colchon: 1 })}
select greatest(1, :cant0 - :apart0 + 1) as pedir \\gset
${separar({ cantidad: ":pedir", extra: ", p_clienta_dni => '70124598'" })}`, "No hay stock disponible para apartar");
error("anon no puede separar",
  `${preparar()}
set local role anon;
${separar()}`, "permission denied");

exito(
  "una venta normal ya no puede llevarse la unidad separada",
  `${preparar()}
select :cant0 - :apart0 as disp \\gset
${separar({ cantidad: ":disp", extra: ", p_clienta_dni => '70124598'" })}
select case when (:cant0 - :apart0) * :'precio'::numeric > 0 then 1 end as _ \\gset
savepoint antes;
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'ubic', :'piso', 'salida', 1, 'venta') returning id as mv \\gset
\\set ON_ERROR_STOP 0
select retail.fn_aplicar_movimiento(:'mv');
\\set ON_ERROR_STOP 1
rollback to savepoint antes;
select (select cantidad - cantidad_apartada from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso');`,
  (s) => filas(s).at(-1) === "0"
);

// ---------------------------------------------------------------------------
// Entregar
// ---------------------------------------------------------------------------
exito(
  "entregar: cobra el saldo, nace la venta por el total, el apartado se cierra y sale la prenda — en una transacción",
  `${preparar()}${separar()}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'precio'::numeric - 50, 'recibido', 200))) as venta \\gset
select s.estado, s.venta_id = :'venta',
       (select string_agg(metodo || ':' || monto, ',' order by metodo) from retail.venta_pagos where venta_id = :'venta'),
       (select sum((precio_unitario - descuento_unitario) * cantidad) = :'precio'::numeric from retail.venta_items where venta_id = :'venta'),
       (select cantidad = :cant0 - 1 and cantidad_apartada = :apart0 from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso'),
       (select a.estado || ':' || a.cierre_motivo from retail.apartados a join retail.separacion_items si on si.apartado_id = a.id where si.separacion_id = s.id),
       (select c.total = :'precio'::numeric - 50 and c.anticipo_deducido = 50 and c.anticipo_comprobante_id = s.comprobante_anticipo_id
          from retail.comprobantes c where c.venta_id = :'venta'),
       (select count(*) from retail.fn_verificar_separaciones()), (select count(*) from retail.fn_verificar_apartados())
  from retail.separaciones s where s.id = :'sep';`,
  (s) => /^entregada\|t\|anticipo:50\.00,efectivo:\d+\.\d+\|t\|t\|liberado:entregada\|t\|0\|0$/.test(s)
);

exito(
  "el precio queda congelado: si el catálogo sube, la entrega cobra lo separado",
  `${preparar()}${separar()}
update retail.variantes set precio = precio + 40 where id = :'v';
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 50))) as venta \\gset
select (select precio_unitario = :'precio'::numeric from retail.venta_items where venta_id = :'venta');`,
  (s) => s === "t"
);

exito(
  "adelanto del 100%: se entrega sin pagos y sin segundo comprobante",
  `${preparar()}${separar({ pagosSql: pagos(["yape", ":'precio'::numeric"]) })}
select retail.entregar_separacion(:'sep') as venta \\gset
select (select string_agg(metodo, ',') from retail.venta_pagos where venta_id = :'venta'),
       (select count(*) from retail.comprobantes where venta_id = :'venta');`,
  (s) => s === "anticipo|0"
);

error("entregar con pagos que no cuadran con el saldo se rechaza",
  `${preparar()}${separar()}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 1)));`, "no cuadran con el saldo");
error("entregar dos veces se rechaza",
  `${preparar()}${separar({ pagosSql: pagos(["yape", ":'precio'::numeric"]) })}
select retail.entregar_separacion(:'sep') as _v \\gset
select retail.entregar_separacion(:'sep');`, "ya se entregó");
exito("entregar con el mismo token dos veces devuelve la misma venta",
  `${preparar()}${separar({ pagosSql: pagos(["yape", ":'precio'::numeric"]) })}
select gen_random_uuid() as tok \\gset
select retail.entregar_separacion(:'sep', '[]'::jsonb, :'tok') as v1 \\gset
select retail.entregar_separacion(:'sep', '[]'::jsonb, :'tok') as v2 \\gset
select :'v1' = :'v2';`, (s) => s === "t");

// ---------------------------------------------------------------------------
// Extender, liberar, vencer
// ---------------------------------------------------------------------------
error("una colaboradora no puede extender (D5)", `${preparar()}${separar()}
select retail.extender_separacion(:'sep');`, "Solo una líder");
exito("la líder extiende una vez: +7 días en la separación y en su apartado",
  `${preparar()}${separar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.extender_separacion(:'sep') as nueva \\gset
select :'nueva'::date = retail.fn_hoy_lima() + 14,
       (select vence_el = :'nueva'::date from retail.apartados a join retail.separacion_items si on si.apartado_id = a.id where si.separacion_id = :'sep'),
       (select extensiones from retail.separaciones where id = :'sep');`, (s) => s === "t|t|1");
error("no se extiende dos veces",
  `${preparar()}${separar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.extender_separacion(:'sep') as _a \\gset
select retail.extender_separacion(:'sep');`, "ya se extendió una vez");

error("una colaboradora no puede liberar (D5)", `${preparar()}${separar()}
select retail.liberar_separacion(:'sep', 'clienta_desistio');`, "Solo una líder");
exito("liberar: la prenda vuelve a estar disponible y el adelanto queda por devolver",
  `${preparar()}${separar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.liberar_separacion(:'sep', 'clienta_desistio') as _l \\gset
select s.estado, s.liberada_motivo,
       (select cantidad_apartada = :apart0 from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso'),
       (select por_devolver || ':' || monto_por_devolver from retail.resumen_separaciones(:'ubic')),
       (select count(*) from retail.fn_verificar_separaciones())
  from retail.separaciones s where s.id = :'sep';`,
  (s) => /^liberada\|clienta_desistio\|t\|\d+:\d+\.\d+\|0$/.test(s));
error("una separación liberada ya no se entrega",
  `${preparar()}${separar({ pagosSql: pagos(["yape", ":'precio'::numeric"]) })}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.liberar_separacion(:'sep', 'clienta_desistio') as _l \\gset
select retail.entregar_separacion(:'sep');`, "venció y se liberó");

exito("vencimiento: en la gracia (vencida hace 2 días) NO se libera; al tercer día sí, sola y una sola vez",
  `${preparar()}${separar()}
update retail.separaciones set vence_el = retail.fn_hoy_lima() - 2 where id = :'sep';
select retail.fn_vencer_separaciones(:'ubic') as n1 \\gset
update retail.separaciones set vence_el = retail.fn_hoy_lima() - 3 where id = :'sep';
select retail.fn_vencer_separaciones(:'ubic') as n2 \\gset
select retail.fn_vencer_separaciones(:'ubic') as n3 \\gset
select :n1, :n2 >= 1, :n3, s.estado, s.liberada_por is null, s.liberada_motivo,
       (select cantidad_apartada = :apart0 from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso'),
       (select count(*) from retail.fn_verificar_separaciones())
  from retail.separaciones s where s.id = :'sep';`,
  (s) => s === "0|t|0|liberada|t|vencio|t|0");

// ---------------------------------------------------------------------------
// Devolver
// ---------------------------------------------------------------------------
const liberada = (pagosSql) => `${preparar()}${separar(pagosSql ? { pagosSql } : {})}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.liberar_separacion(:'sep', 'vencio') as _l \\gset
`;
error("no se devuelve lo que sigue abierto", `${preparar()}${separar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.registrar_devolucion_separacion(:'sep', 'yape', '123');`, "Primero libera");
error("devolver por Yape exige el N.º de operación", `${liberada()}
select retail.registrar_devolucion_separacion(:'sep', 'yape');`, "N.º de operación");
exito("devolver por Yape: queda devuelta; la nota de crédito se difiere con aviso si el anticipo aún no fue aceptado",
  `${liberada()}
select retail.registrar_devolucion_separacion(:'sep', 'yape', 'OP-778812') as r \\gset
select s.estado, s.devolucion_medio_real, s.devolucion_operacion, s.nota_credito_id is null,
       (:'r'::jsonb ->> 'aviso') like 'La nota de crédito queda pendiente%',
       (select count(*) from retail.caja_movimientos where separacion_id = s.id and tipo = 'egreso')
  from retail.separaciones s where s.id = :'sep';`,
  (s) => s === "devuelta|yape|OP-778812|t|t|0");
exito("con el anticipo aceptado por SUNAT y serie de notas, la devolución emite la nota de crédito",
  `${liberada()}
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox'
 where id = (select comprobante_anticipo_id from retail.separaciones where id = :'sep');
insert into retail.series_comprobantes (ubicacion_id, tipo, serie)
  select :'ubic', 'nota_credito', 'BC01' where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito');
select retail.registrar_devolucion_separacion(:'sep', 'plin', 'OP-1') as r \\gset
select c.tipo, c.total = s.adelanto, c.comprobante_original_id = s.comprobante_anticipo_id, (:'r'::jsonb ->> 'aviso') is null
  from retail.separaciones s join retail.comprobantes c on c.id = s.nota_credito_id where s.id = :'sep';`,
  (s) => s === "nota_credito|t|t|t");
exito("devolver en efectivo: sale del cajón como egreso ligado",
  `${liberada()}
select retail.registrar_devolucion_separacion(:'sep', 'efectivo') as r \\gset
select (select monto from retail.caja_movimientos where id = s.devolucion_caja_movimiento_id and tipo = 'egreso') = s.adelanto
  from retail.separaciones s where s.id = :'sep';`, (s) => s === "t");
error("una colaboradora no registra la devolución (D5)", `${liberada()}
set local request.jwt.claim.sub = '${MICAELA}';
select retail.registrar_devolucion_separacion(:'sep', 'yape', 'OP-1');`, "Solo una líder");

// ---------------------------------------------------------------------------
// Caja, lectura y seguridad
// ---------------------------------------------------------------------------
exito("el arqueo cuadra: adelanto en efectivo + saldo en efectivo + devolución en efectivo, al céntimo",
  `${preparar()}
${separar({ como: "s1", pagosSql: pagos(["efectivo", 50, 100]) })}
select retail.entregar_separacion(:'s1', jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'precio'::numeric - 50, 'recibido', 100))) as _v \\gset
${separar({ como: "s2", pagosSql: pagos(["efectivo", 30]) })}
${separar({ como: "s3", pagosSql: pagos(["yape", 20]) })}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.liberar_separacion(:'s2', 'clienta_desistio') as _l \\gset
select retail.registrar_devolucion_separacion(:'s2', 'efectivo') as _r \\gset
select monto_sistema - 100 = :'precio'::numeric from retail.cerrar_caja(:'caja', 0);`,
  // apertura 100 + 50 (adelanto s1) + (precio-50) (saldo s1) + 30 (adelanto s2) − 30 (devolución s2); s3 fue Yape.
  (s) => s === "t");
exito("buscar por DNI, celular, código y boleta; el resumen suma la custodia",
  `${preparar()}${separar({ extra: ", p_clienta_dni => '70124598'" })}
select codigo as cod from retail.separaciones where id = :'sep' \\gset
select comprobante_anticipo as bol from retail.buscar_separaciones(:'ubic', :'cod') \\gset
select (select count(*) from retail.buscar_separaciones(:'ubic', '70124598') where id = :'sep'),
       (select count(*) from retail.buscar_separaciones(:'ubic', '987111222') where id = :'sep'),
       (select count(*) from retail.buscar_separaciones(:'ubic', :'bol') where id = :'sep'),
       (select count(*) from retail.buscar_separaciones(:'ubic', 'lozano') where id = :'sep'),
       (select en_custodia >= 50 and en_custodia_efectivo >= 50 from retail.resumen_separaciones(:'ubic'));`,
  (s) => s === "1|1|1|1|t");
error("authenticated no escribe directo en separaciones", `${preparar()}
set local role authenticated;
insert into retail.separaciones (codigo) values ('X');`, "permission denied");
exito("authenticated lee su separación por RLS",
  `${preparar()}${separar()}
set local role authenticated;
select count(*) from retail.separaciones where id = :'sep';`, (s) => s === "1");
error("fn_verificar_separaciones no está abierta a authenticated", `${preparar()}
set local role authenticated;
select * from retail.fn_verificar_separaciones();`, "permission denied");
error("el ayudante interno no está abierto a authenticated", `${preparar()}
set local role authenticated;
select retail.fn_cerrar_apartado_de_separacion(gen_random_uuid(), 'otro', null);`, "permission denied");

// ---------------------------------------------------------------------------
let ok = 0;
const fallos = [];
try { execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]); } catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(2);
}
for (const c of CASOS) {
  const r = correr(c.sql);
  let pasa, detalle;
  if (c.tipo === "exito") {
    const ultima = r.ok ? filas(r.salida).at(-1) ?? "" : "";
    pasa = r.ok && c.verificar(ultima);
    detalle = r.ok ? `salida: ${ultima}` : r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje;
  } else {
    pasa = !r.ok && r.mensaje.includes(c.contiene);
    detalle = r.ok ? "no falló" : r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje;
  }
  console.log(`${pasa ? "✓" : "✗"} ${c.nombre}${pasa ? "" : `\n    ${detalle}`}`);
  if (pasa) ok++; else fallos.push(c.nombre);
}
console.log(`\n${ok}/${CASOS.length} pruebas en verde.`);
process.exit(fallos.length ? 1 : 0);
