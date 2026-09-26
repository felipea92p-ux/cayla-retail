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
-- Roles por módulo (ADR-0161 B2d): extender, liberar y devolver los hace quien puede gestionar la caja, y con la
-- decisión B2d eso es «líder o un rol que VE Caja». Para seguir probando D5 (una colaboradora SIN Caja no puede),
-- Micaela recibe dentro de esta transacción un rol de prueba que solo ve el Punto de venta. En una base sin roles no hace nada.
do $r$ begin
  if to_regclass('retail.rol_modulos') is not null then
    insert into retail.roles (id, nombre, descripcion) values ('44444444-4444-4444-8444-000000000003', 'Solo vender (prueba de apartados)', 'temporal');
    insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-000000000003', 'vender');
    update retail.colaboradores set rol_id = '44444444-4444-4444-8444-000000000003'
      where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
  end if;
end $r$;
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta') x) as _c \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja \\gset
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
select s.codigo ~ '^APT-TRU-[0-9]{4}$', s.estado, s.total = :'precio'::numeric, s.adelanto, s.vence_el = retail.fn_hoy_lima() + 7,
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
// Recordar en lote (20260926233000_separacion_avisos.sql): cada aviso es una fila que no se edita
// ---------------------------------------------------------------------------
const FELIPE_PERSONA = `(select id from public.personas where auth_user_id = '${FELIPE}')`;
const conApartados = `do $m$ begin
  if to_regclass('retail.rol_modulos') is not null then
    insert into retail.rol_modulos (rol_id, modulo) values ('44444444-4444-4444-8444-000000000003', 'apartados');
  end if;
end $m$;
`;
exito("aviso: la líder deja constancia, firma ella y la lectura lo cuenta",
  `${preparar(FELIPE)}${separar()}
select retail.registrar_aviso_separacion(:'sep') is not null as _r \\gset
select (select count(*) from retail.separacion_avisos where separacion_id = :'sep' and avisado_por = ${FELIPE_PERSONA}),
       (select avisos || ':' || (ultimo_aviso_en is not null) || ':' || (ultimo_por is not null) from retail.fn_avisos_separaciones(:'ubic') where separacion_id = :'sep');`,
  (s) => s === "1|1:true:true");
exito("aviso: dos avisos quedan los dos (append-only), la lectura dice 2",
  `${preparar(FELIPE)}${separar()}
select retail.registrar_aviso_separacion(:'sep') as _a \\gset
select retail.registrar_aviso_separacion(:'sep') as _b \\gset
select avisos from retail.fn_avisos_separaciones(:'ubic') where separacion_id = :'sep';`,
  (s) => s === "2");
error("aviso: sin el módulo Apartados en su rol, no se registra",
  `${preparar(FELIPE)}${separar()}
set local request.jwt.claim.sub = '${MICAELA}';
select retail.registrar_aviso_separacion(:'sep');`, "no tiene el módulo Apartados");
exito("aviso: con el módulo Apartados en su rol, la colaboradora sí lo registra",
  `${preparar(FELIPE)}${separar()}${conApartados}
set local request.jwt.claim.sub = '${MICAELA}';
select retail.registrar_aviso_separacion(:'sep') is not null;`,
  (s) => s === "t");
error("aviso: un apartado liberado ya no se avisa",
  `${preparar(FELIPE)}${separar()}
select retail.liberar_separacion(:'sep', 'clienta_desistio') as _l \\gset
select retail.registrar_aviso_separacion(:'sep');`, "Solo se avisa un apartado abierto");
exito("aviso: un liberado sale de la lectura (solo cuenta lo abierto)",
  `${preparar(FELIPE)}${separar()}
select retail.registrar_aviso_separacion(:'sep') as _a \\gset
select retail.liberar_separacion(:'sep', 'clienta_desistio') as _l \\gset
select count(*) from retail.fn_avisos_separaciones(:'ubic') where separacion_id = :'sep';`,
  (s) => s === "0");
error("aviso: authenticated no lee ni escribe la tabla directo", `${preparar()}
set local role authenticated;
select count(*) from retail.separacion_avisos;`, "permission denied");

// ---------------------------------------------------------------------------
// Abonos (20260927100000): un pago más del mismo apartado, con su anticipo
// ---------------------------------------------------------------------------
const abonar = (monto, { metodo = "yape", esperar = false, token = null, como = "ab" } = {}) =>
  `select retail.abonar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', '${metodo}', 'monto', ${monto})), ${esperar}${token ? `, '${token}'` : ""}) as ${como} \\gset\n`;
exito("abono: sube lo pagado, deja el plazo igual, sale su boleta de anticipo y el invariante cuadra",
  `${preparar(FELIPE)}${separar()}${abonar(10)}
select s.adelanto, s.vence_el = retail.fn_hoy_lima() + 7,
       (select count(*) from retail.separacion_pagos where separacion_id = s.id and abono_id is not null),
       (select c.es_anticipo || ':' || c.total from retail.comprobantes c where c.id = (:'ab'::jsonb ->> 'comprobante_id')::uuid),
       (select count(*) from retail.comprobantes where separacion_id = s.id and es_anticipo),
       (select count(*) from retail.fn_verificar_separaciones())
  from retail.separaciones s where s.id = :'sep';`,
  (x) => x === "60.00|t|1|true:10.00|2|0");
exito("abono en efectivo: entra al cajón como ingreso del apartado",
  `${preparar(FELIPE)}${separar()}${abonar(15, { metodo: "efectivo" })}
select count(*), sum(monto) from retail.caja_movimientos where separacion_id = :'sep' and tipo = 'ingreso';`,
  (x) => x === "2|65.00");
error("abono: no puede pasar lo que falta pagar",
  `${preparar(FELIPE)}${separar()}
select retail.abonar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric)));`,
  "pasa lo que falta pagar");
exito("abono con espera: 2 días si es menos de la mitad de lo que faltaba, 3 si es la mitad o más",
  `${preparar(FELIPE)}${separar()}${abonar(1, { esperar: true, como: "a1" })}
select (:'a1'::jsonb ->> 'dias_espera') as d1, (select vence_el - retail.fn_hoy_lima() from retail.separaciones where id = :'sep') as v1 \\gset
select retail.abonar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', round((:'precio'::numeric - 51) / 2, 2) + 0.01)), true) as a2 \\gset
select :'d1', :'v1', (:'a2'::jsonb ->> 'dias_espera'), (select vence_el - retail.fn_hoy_lima() from retail.separaciones where id = :'sep');`,
  (x) => x === "2|9|3|12");
exito("abono: el mismo token dos veces abona una sola vez",
  `${preparar(FELIPE)}${separar()}${abonar(5, { token: "55555555-5555-4555-8555-000000000001", como: "x1" })}${abonar(5, { token: "55555555-5555-4555-8555-000000000001", como: "x2" })}
select (select count(*) from retail.separacion_abonos where separacion_id = :'sep'), (select adelanto from retail.separaciones where id = :'sep');`,
  (x) => x === "1|55.00");
error("abono: sin el módulo Apartados en su rol, no se registra",
  `${preparar(FELIPE)}${separar()}
set local request.jwt.claim.sub = '${MICAELA}';
select retail.abonar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 5)));`, "no tiene el módulo Apartados");
exito("entregar tras un abono: cobra solo lo que falta y la boleta final lista LOS DOS anticipos",
  `${preparar(FELIPE)}${separar()}${abonar(10)}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 60))) as venta \\gset
select (select c.anticipo_deducido from retail.comprobantes c where c.venta_id = :'venta'),
       (select count(*) || ':' || sum(ca.monto) from retail.comprobante_anticipos ca join retail.comprobantes c on c.id = ca.comprobante_id where c.venta_id = :'venta'),
       (select sum(monto) = :'precio'::numeric from retail.venta_pagos where venta_id = :'venta'),
       (select count(*) from retail.fn_verificar_separaciones());`,
  (x) => x === "60.00|2:60.00|t|0");
exito("devolver tras un abono: devuelve todo lo pagado e intenta una nota de crédito por cada anticipo",
  `${preparar(FELIPE)}${separar()}${abonar(10)}
select retail.liberar_separacion(:'sep', 'vencio') as _l \\gset
select retail.registrar_devolucion_separacion(:'sep', 'yape', 'OP-1') as r \\gset
select s.estado, s.adelanto,
       (select count(*) from regexp_matches(coalesce(:'r'::jsonb ->> 'aviso', ''), 'queda pendiente', 'g'))
         + (select count(*) from retail.comprobantes where separacion_id = s.id and tipo = 'nota_credito')
  from retail.separaciones s where s.id = :'sep';`,
  (x) => x === "devuelta|60.00|2");

// ---------------------------------------------------------------------------
// Estante (20260927110000): un lugar por apartado abierto, el más bajo libre
// ---------------------------------------------------------------------------
exito("estante: dos apartados abiertos, dos lugares distintos; al entregar uno, su lugar lo toma el siguiente",
  `${preparar(FELIPE)}${separar({ como: "s1" })}${separar({ como: "s2" })}
select estante as e1 from retail.separaciones where id = :'s1' \\gset
select estante as e2 from retail.separaciones where id = :'s2' \\gset
select retail.entregar_separacion(:'s1', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 50))) as _v \\gset
${separar({ como: "s3" })}
select :'e1' ~ '^A-[0-9]{2}$', :'e1' <> :'e2', (select estante from retail.separaciones where id = :'s3') = :'e1',
       (select estante from retail.buscar_separaciones(:'ubic', :'s2'::text)) = :'e2';`,
  (x) => x === "t|t|t|t");

// ---------------------------------------------------------------------------
// Editar (20260927120000): quitar y sumar en una sola transacción
// ---------------------------------------------------------------------------
exito("editar: sumar una prenda aparta otra unidad, sube el total y el invariante cuadra",
  `${preparar(FELIPE)}${separar()}
select retail.editar_separacion(:'sep', '{}'::uuid[], ${items(1)}) as ed \\gset
select s.total = :'precio'::numeric * 2, (select count(*) from retail.separacion_items where separacion_id = s.id),
       (select cantidad_apartada = :apart0 + 2 from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso'),
       (select count(*) from retail.separacion_ediciones where separacion_id = s.id),
       (select count(*) from retail.fn_verificar_separaciones()), (select count(*) from retail.fn_verificar_apartados())
  from retail.separaciones s where s.id = :'sep';`,
  (x) => x === "t|2|t|1|0|0");
exito("editar: quitar una prenda la devuelve a la tienda y su fila queda archivada, no borrada",
  `${preparar(FELIPE)}${separar()}
select retail.editar_separacion(:'sep', '{}'::uuid[], ${items(1)}) as _e1 \\gset
select id as quitar from retail.separacion_items where separacion_id = :'sep' order by id limit 1 \\gset
select retail.editar_separacion(:'sep', array[:'quitar'::uuid], '[]'::jsonb) as _e2 \\gset
select (select count(*) from retail.separacion_items where separacion_id = :'sep'),
       (select count(*) from retail.separacion_items_retirados where id = :'quitar'),
       (select cantidad_apartada = :apart0 + 1 from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso'),
       (select total = :'precio'::numeric from retail.separaciones where id = :'sep'),
       (select count(*) from retail.fn_verificar_separaciones());`,
  (x) => x === "1|1|t|t|0");
error("editar: no se deja un apartado sin prendas",
  `${preparar(FELIPE)}${separar()}
select id as quitar from retail.separacion_items where separacion_id = :'sep' \\gset
select retail.editar_separacion(:'sep', array[:'quitar'::uuid], '[]'::jsonb);`, "se queda sin prendas");
error("editar: el precio lo manda el catálogo, no la pantalla",
  `${preparar(FELIPE)}${separar()}
select retail.editar_separacion(:'sep', '{}'::uuid[], jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', 1)));`,
  "venta_precio_cambiado");

// ---------------------------------------------------------------------------
// Actividad (20260927120000): lo que pasó en Apartados, en el diario de siempre
// ---------------------------------------------------------------------------
exito("actividad: apartar, abonar, avisar y editar dejan su línea en el módulo Apartados",
  `${preparar(FELIPE)}${separar()}${abonar(5)}
select retail.registrar_aviso_separacion(:'sep') as _av \\gset
select retail.editar_separacion(:'sep', '{}'::uuid[], ${items(1)}) as _ed \\gset
set constraints all immediate;
select string_agg(accion, ',' order by accion) from retail.actividad
 where modulo = 'apartados' and (registro_id like :'sep' || '%' or detalle ->> 'codigo' = (select codigo from retail.separaciones where id = :'sep'));`,
  (x) => x === "abono_registrado,apartado_editado,apartado_registrado,aviso_whatsapp");
exito("actividad: liberar deja «liberó» con quién lo hizo",
  `${preparar(FELIPE)}${separar()}
select retail.liberar_separacion(:'sep', 'clienta_desistio') as _l \\gset
select accion || ':' || (persona_id is not null) from retail.actividad where modulo = 'apartados' and registro_id = :'sep' || ':apartado_liberado';`,
  (x) => x === "apartado_liberado:true");

// ---------------------------------------------------------------------------
// Opciones (20260927130000): cada tienda apaga lo que no usa; de fábrica, todo encendido
// ---------------------------------------------------------------------------
exito("opciones: sin guardar, nada está apagado (Completo); el líder apaga abonos y queda guardado",
  `${preparar(FELIPE)}
delete from retail.apartados_opciones where ubicacion_id = :'ubic';
select array_length(retail.fn_opciones_apartados(:'ubic'), 1) is null as vacio \\gset
select retail.guardar_opciones_apartados(:'ubic', array['abonos', 'abonos']) as _g \\gset
select :'vacio', retail.fn_opciones_apartados(:'ubic')::text;`,
  (x) => x === "t|{abonos}");
error("opciones: solo el líder las cambia",
  `${preparar()}
select retail.guardar_opciones_apartados(:'ubic', array['abonos']);`, "Solo el líder");
error("opciones: una función que no existe no se guarda",
  `${preparar(FELIPE)}
select retail.guardar_opciones_apartados(:'ubic', array['vuela']);`, "violates check constraint");

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
