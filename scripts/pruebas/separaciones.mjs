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
import { readFileSync } from "node:fs";

// `--contenedor <nombre>` apunta a una base propia (una pila aparte) en vez de la compartida del equipo.
const iContenedor = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = iContenedor > -1 ? process.argv[iContenedor + 1] : "supabase_db_cayla-retail";
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

// Un apartado VIEJO (de antes de ADR-0399): ya tiene su boleta de anticipo con correlativo gastado. Se arma a mano para probar que
// el camino de antes sigue entero.
const anticipoViejo = `select retail.emitir_comprobante(:'ubic', 'boleta', round(50 / 1.18, 2), 50 - round(50 / 1.18, 2), 50, null, 'sin_documento', null,
  'Ana Lozano Vera', jsonb_build_array(jsonb_build_object('descripcion', 'Anticipo', 'cantidad', 1, 'precio_unitario', round(50 / 1.18, 2)))) as compv \\gset
update retail.comprobantes set separacion_id = :'sep', es_anticipo = true where id = :'compv';
update retail.separaciones set comprobante_anticipo_id = :'compv' where id = :'sep';`;
const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });
const filas = (salida) => salida.split("\n").filter(Boolean);

// ---------------------------------------------------------------------------
// Separar
// ---------------------------------------------------------------------------
exito(
  "separar: aparta la prenda, deja el adelanto en custodia, NO emite ningún comprobante y el invariante cuadra",
  `${preparar()}${separar()}
select s.codigo ~ '^APT-TRU-[0-9]{4}$', s.estado, s.total = :'precio'::numeric, s.adelanto, s.vence_el = retail.fn_hoy_lima() + 7,
       s.devolucion_numero, s.clienta_celular,
       (select cantidad = :cant0 and cantidad_apartada = :apart0 + 1 from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso'),
       (select count(*) from retail.caja_movimientos where separacion_id = s.id and tipo = 'ingreso' and monto = 50),
       s.comprobante_anticipo_id is null,
       (select count(*) from retail.comprobantes c where c.separacion_id = s.id),
       (select count(*) from retail.fn_verificar_separaciones()), (select count(*) from retail.fn_verificar_apartados())
  from retail.separaciones s where s.id = :'sep';`,
  (s) => s === "t|abierta|t|50.00|t|987111222|987111222|t|1|t|0|0|0"
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
  "idempotencia: el mismo token devuelve la misma separación, sin segundo apartado",
  `${preparar()}
select gen_random_uuid() as tok \\gset
${separar({ extra: ", p_token => :'tok'", como: "s1" })}${separar({ extra: ", p_token => :'tok'", como: "s2" })}
select :'s1' = :'s2', (select count(*) from retail.separacion_items where separacion_id = :'s1'),
       (select count(*) from retail.separaciones where token_cliente = :'tok');`,
  (s) => s === "t|1|1"
);

exito(
  "factura: el RUC y la razón social se guardan al apartar y la factura sale al entregar, por el total",
  `${preparar()}${separar({ extra: ", p_comprobante_tipo => 'factura', p_cliente_ruc => '20123456789', p_cliente_razon_social => 'Moda Norte SAC'" })}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 50))) as venta \\gset
select (select count(*) from retail.comprobantes where separacion_id = :'sep'),
       c.tipo, c.cliente_tipo_doc, c.cliente_num_doc, c.cliente_nombre, c.total = :'precio'::numeric
  from retail.comprobantes c where c.venta_id = :'venta';`,
  (s) => s === "1|factura|ruc|20123456789|Moda Norte SAC|t"
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
exito("con DNI, la boleta de más de S/700 sí se separa, y al entregar lleva ese DNI",
  `${preparar(MICAELA, { colchon: 20 })}${separar({ cantidad: 10, extra: ", p_clienta_dni => '70124598'" })}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric * 10 - 50))) as venta \\gset
select c.cliente_tipo_doc || ':' || c.cliente_num_doc from retail.comprobantes c where c.venta_id = :'venta';`,
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
  "entregar: cobra el saldo, nace la venta y UNA boleta por el total sin deducir el adelanto, el apartado se cierra y sale la prenda — en una transacción",
  `${preparar()}${separar()}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'precio'::numeric - 50, 'recibido', 200))) as venta \\gset
select s.estado, s.venta_id = :'venta',
       (select string_agg(metodo || ':' || monto, ',' order by metodo) from retail.venta_pagos where venta_id = :'venta'),
       (select sum((precio_unitario - descuento_unitario) * cantidad) = :'precio'::numeric from retail.venta_items where venta_id = :'venta'),
       (select cantidad = :cant0 - 1 and cantidad_apartada = :apart0 from retail.stock where variante_id = :'v' and ubicacion_id = :'ubic' and sububicacion_id = :'piso'),
       (select a.estado || ':' || a.cierre_motivo from retail.apartados a join retail.separacion_items si on si.apartado_id = a.id where si.separacion_id = s.id),
       (select c.tipo = 'boleta' and c.total = :'precio'::numeric and c.anticipo_deducido = 0 and c.anticipo_comprobante_id is null
          and not c.es_anticipo and c.separacion_id = s.id and c.estado = 'pendiente'
          and (select sum((i ->> 'cantidad')::numeric * (i ->> 'precio_unitario')::numeric) from jsonb_array_elements(c.items) i) = :'precio'::numeric
          from retail.comprobantes c where c.venta_id = :'venta'),
       (select count(*) from retail.comprobantes where separacion_id = s.id),
       (select count(*) from retail.fn_verificar_separaciones()), (select count(*) from retail.fn_verificar_apartados())
  from retail.separaciones s where s.id = :'sep';`,
  (s) => /^entregada\|t\|anticipo:50\.00,efectivo:\d+\.\d+\|t\|t\|liberado:entregada\|t\|1\|0\|0$/.test(s)
);

exito(
  "entregar un apartado VIEJO (con su boleta de anticipo): sigue por el camino de antes, la boleta final por el saldo que descuenta el anticipo",
  `${preparar()}${separar()}
${anticipoViejo}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 50))) as venta \\gset
select c.total = :'precio'::numeric - 50, c.anticipo_deducido, c.anticipo_comprobante_id = :'compv'::uuid,
       (select count(*) from retail.comprobantes where separacion_id = :'sep')
  from retail.comprobantes c where c.venta_id = :'venta';`,
  (s) => s === "t|50.00|t|2"
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
  "adelanto del 100%: se entrega sin pagos y sale la boleta por el total (el único comprobante de todo el apartado)",
  `${preparar()}${separar({ pagosSql: pagos(["yape", ":'precio'::numeric"]) })}
select retail.entregar_separacion(:'sep') as venta \\gset
select (select string_agg(metodo, ',') from retail.venta_pagos where venta_id = :'venta'),
       (select count(*) from retail.comprobantes where venta_id = :'venta'),
       (select count(*) from retail.comprobantes where separacion_id = :'sep'),
       (select total = :'precio'::numeric from retail.comprobantes where venta_id = :'venta');`,
  (s) => s === "anticipo|1|1|t"
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
// ADR-0414 (Felipe 2026-10-15): hasta 2 aplazamientos y nunca más de 30 días desde que se apartó. `extender_separacion` es
// «aplazar 7 días».
error("se aplaza hasta 2 veces: la tercera no",
  `${preparar()}${separar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.extender_separacion(:'sep') as _a \\gset
select retail.extender_separacion(:'sep') as _b \\gset
select retail.extender_separacion(:'sep');`, "ya se aplazó 2 veces");
exito("aplazar a una fecha elegida: mueve el vencimiento, cuenta 1 y anota de qué fecha a cuál y quién",
  `${preparar()}${separar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.aplazar_separacion(:'sep', retail.fn_hoy_lima() + 10) as nueva \\gset
select :'nueva'::date = retail.fn_hoy_lima() + 10,
       (select vence_el = :'nueva'::date from retail.apartados a join retail.separacion_items si on si.apartado_id = a.id where si.separacion_id = :'sep'),
       (select extensiones from retail.separaciones where id = :'sep'),
       (select count(*) || ':' || bool_and(vence_antes = retail.fn_hoy_lima() + 7 and creado_por is not null)
          from retail.separacion_aplazamientos where separacion_id = :'sep');`, (s) => s === "t|t|1|1:true");
exito("aplazar dos veces a la misma fecha (doble clic) cuenta una sola",
  `${preparar()}${separar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.aplazar_separacion(:'sep', retail.fn_hoy_lima() + 10) as _a \\gset
select retail.aplazar_separacion(:'sep', retail.fn_hoy_lima() + 10) as _b \\gset
select (select extensiones from retail.separaciones where id = :'sep'),
       (select count(*) from retail.separacion_aplazamientos where separacion_id = :'sep');`, (s) => s === "1|1");
error("no se aplaza a una fecha que no es posterior al vencimiento",
  `${preparar()}${separar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.aplazar_separacion(:'sep', retail.fn_hoy_lima() + 7);`, "tiene que ser después");
error("no se aplaza más allá de 30 días desde que se apartó",
  `${preparar()}${separar()}
set local request.jwt.claim.sub = '${FELIPE}';
select retail.aplazar_separacion(:'sep', retail.fn_hoy_lima() + 31);`, "como mucho 30 días");
error("una colaboradora sin Caja no puede aplazar (D5)", `${preparar()}${separar()}
select retail.aplazar_separacion(:'sep', retail.fn_hoy_lima() + 10);`, "Solo una líder");

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
exito("devolver por Yape: queda devuelta, sin nota de crédito, sin aviso y sin gastar ningún correlativo",
  `${liberada()}
select retail.registrar_devolucion_separacion(:'sep', 'yape', 'OP-778812') as r \\gset
select s.estado, s.devolucion_medio_real, s.devolucion_operacion, s.nota_credito_id is null,
       (:'r'::jsonb ->> 'aviso') is null,
       (select count(*) from retail.caja_movimientos where separacion_id = s.id and tipo = 'egreso'),
       (select count(*) from retail.comprobantes where separacion_id = s.id),
       (select count(*) from retail.comprobantes where created_at >= now() - interval '1 minute' and tipo <> 'nota_venta' and venta_id is null)
  from retail.separaciones s where s.id = :'sep';`,
  (s) => s === "devuelta|yape|OP-778812|t|t|0|0|0");
exito("devolver un apartado VIEJO (con su boleta de anticipo aceptada) sigue emitiendo la nota de crédito",
  `${liberada()}
${anticipoViejo}
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox'
 where id = (select comprobante_anticipo_id from retail.separaciones where id = :'sep');
insert into retail.series_comprobantes (ubicacion_id, tipo, serie)
  select :'ubic', 'nota_credito', 'BC01' where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito');
select retail.registrar_devolucion_separacion(:'sep', 'plin', 'OP-1') as r \\gset
select c.tipo, c.total = s.adelanto, c.comprobante_original_id = s.comprobante_anticipo_id, (:'r'::jsonb ->> 'aviso') is null
  from retail.separaciones s join retail.comprobantes c on c.id = s.nota_credito_id where s.id = :'sep';`,
  (s) => s === "nota_credito|t|t|t");
exito("devolver un apartado VIEJO cuya boleta de anticipo se marcó «no emitida»: no intenta una nota de crédito sobre lo que nunca salió",
  `${liberada()}
${anticipoViejo}
select retail.marcar_comprobante_no_emitido(:'compv', 'Nunca salió a SUNAT: se regulariza el apartado (ADR-0399)') as _m \\gset
select retail.registrar_devolucion_separacion(:'sep', 'yape', 'OP-9') as r \\gset
select s.estado, s.nota_credito_id is null, (:'r'::jsonb ->> 'aviso') is null,
       (select count(*) from retail.comprobantes where separacion_id = s.id and tipo = 'nota_credito')
  from retail.separaciones s where s.id = :'sep';`,
  (s) => s === "devuelta|t|t|0");
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
exito("buscar por DNI, celular, código y apellido; el resumen suma la custodia",
  `${preparar()}${separar({ extra: ", p_clienta_dni => '70124598'" })}
select codigo as cod from retail.separaciones where id = :'sep' \\gset
select (select count(*) from retail.buscar_separaciones(:'ubic', '70124598') where id = :'sep'),
       (select count(*) from retail.buscar_separaciones(:'ubic', '987111222') where id = :'sep'),
       (select count(*) from retail.buscar_separaciones(:'ubic', :'cod') where id = :'sep'),
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
exito("abono: sube lo pagado, deja el plazo igual, NO emite comprobante y el invariante cuadra",
  `${preparar(FELIPE)}${separar()}${abonar(10)}
select s.adelanto, s.vence_el = retail.fn_hoy_lima() + 7,
       (select count(*) from retail.separacion_pagos where separacion_id = s.id and abono_id is not null),
       (:'ab'::jsonb ->> 'comprobante_id') is null,
       (select count(*) from retail.comprobantes where separacion_id = s.id),
       (select count(*) from retail.separacion_abonos where separacion_id = s.id and comprobante_id is null),
       (select count(*) from retail.fn_verificar_separaciones())
  from retail.separaciones s where s.id = :'sep';`,
  (x) => x === "60.00|t|1|t|0|1|0");
exito("el detalle (ADR-0414) trae cada pago con su hora y quién lo cobró, y cada aplazamiento",
  `${preparar(FELIPE)}${separar()}${abonar(5)}
select retail.aplazar_separacion(:'sep', retail.fn_hoy_lima() + 10) as _ap \\gset
select retail.fn_detalle_separacion(:'sep') as d \\gset
select jsonb_array_length(:'d'::jsonb -> 'pagos'),
       (select bool_and(p ->> 'por' is not null and (p ->> 'fecha')::timestamptz is not null) from jsonb_array_elements(:'d'::jsonb -> 'pagos') p),
       (select count(*) filter (where (p ->> 'abono')::boolean) from jsonb_array_elements(:'d'::jsonb -> 'pagos') p),
       jsonb_array_length(:'d'::jsonb -> 'aplazamientos'),
       :'d'::jsonb ->> 'creada_por' is not null;`, (s) => s === "2|t|1|1|t");
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
exito("entregar tras un abono: cobra solo lo que falta y sale UNA boleta por el total, que no nombra ni descuenta anticipos",
  `${preparar(FELIPE)}${separar()}${abonar(10)}
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 60))) as venta \\gset
select (select c.anticipo_deducido from retail.comprobantes c where c.venta_id = :'venta'),
       (select count(*) from retail.comprobante_anticipos ca join retail.comprobantes c on c.id = ca.comprobante_id where c.venta_id = :'venta'),
       (select c.total = :'precio'::numeric from retail.comprobantes c where c.venta_id = :'venta'),
       (select count(*) from retail.comprobantes where separacion_id = :'sep'),
       (select sum(monto) = :'precio'::numeric from retail.venta_pagos where venta_id = :'venta'),
       (select count(*) from retail.fn_verificar_separaciones());`,
  (x) => x === "0.00|0|t|1|t|0");
exito("devolver tras un abono: devuelve todo lo pagado sin nota de crédito (no hay comprobante que anular)",
  `${preparar(FELIPE)}${separar()}${abonar(10)}
select retail.liberar_separacion(:'sep', 'vencio') as _l \\gset
select retail.registrar_devolucion_separacion(:'sep', 'yape', 'OP-1') as r \\gset
select s.estado, s.adelanto, (:'r'::jsonb ->> 'aviso') is null,
       (select count(*) from retail.comprobantes where separacion_id = s.id)
  from retail.separaciones s where s.id = :'sep';`,
  (x) => x === "devuelta|60.00|t|0");

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
// Historial por fecha (20261010180000): el rango acota lo cerrado; lo que espera algo sale siempre
// ---------------------------------------------------------------------------
exito("historial por fecha: lo entregado de hace 40 días queda fuera de los últimos 30; lo abierto igual de viejo, no",
  `${preparar(FELIPE)}${separar({ como: "s1" })}${separar({ como: "s2" })}${separar({ como: "s3" })}
select retail.entregar_separacion(:'s1', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 50))) as _v \\gset
select retail.entregar_separacion(:'s3', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'precio'::numeric - 50))) as _w \\gset
update retail.separaciones set created_at = now() - interval '40 days' where id in (:'s1', :'s2');
select (select count(*) from retail.buscar_separaciones(:'ubic', p_desde => retail.fn_hoy_lima() - 29) where id = :'s1'),
       (select count(*) from retail.buscar_separaciones(:'ubic', p_desde => retail.fn_hoy_lima() - 29) where id = :'s2'),
       (select count(*) from retail.buscar_separaciones(:'ubic', p_desde => retail.fn_hoy_lima() - 29) where id = :'s3'),
       (select count(*) from retail.buscar_separaciones(:'ubic', p_desde => retail.fn_hoy_lima() - 29, p_hasta => retail.fn_hoy_lima() - 1) where id = :'s3'),
       (select count(*) from retail.buscar_separaciones(:'ubic') where id in (:'s1', :'s2', :'s3'));`,
  // s1 cerrado y viejo: fuera · s2 abierto y viejo: dentro · s3 cerrado hoy: dentro, salvo si el rango termina ayer · sin rango: los tres.
  (x) => x === "0|1|1|0|3");

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
// ADR-0249 (actualización 2026-09-28, Ley 29733): la actividad no copia a la clienta. Quién es lo guarda el apartado; el
// diario dice «la clienta». Un apartado entero —apartar, abonar, avisar, editar, extender, liberar y devolver— sin que su
// nombre, sus apellidos o su celular aparezcan en ninguna línea (ni en la frase ni en el detalle).
exito("actividad: ninguna línea de un apartado copia el nombre, los apellidos ni el celular de la clienta",
  `${preparar(FELIPE)}${separar()}${abonar(5)}
select retail.registrar_aviso_separacion(:'sep') as _av \\gset
select retail.editar_separacion(:'sep', '{}'::uuid[], ${items(1)}) as _ed \\gset
select retail.extender_separacion(:'sep') as _ex \\gset
select retail.liberar_separacion(:'sep', 'clienta_desistio') as _l \\gset
select retail.registrar_devolucion_separacion(:'sep', 'efectivo') as _d \\gset
set constraints all immediate;
select count(*),
       count(*) filter (where a::text ~* '(\\mana\\M|lozano|vera|987 ?111 ?222)'),
       count(*) filter (where a.descripcion ~ ' la clienta( |:|$)'),
       string_agg(accion, ',' order by accion)
  from retail.actividad a
 where modulo = 'apartados' and (registro_id like :'sep' || '%' or detalle ->> 'codigo' = (select codigo from retail.separaciones where id = :'sep'));`,
  (x) => x === "7|0|7|abono_registrado,adelanto_devuelto,apartado_editado,apartado_extendido,apartado_liberado,apartado_registrado,aviso_whatsapp");
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
// Apartar de otra sede (20260927140000): pedir, enviar, llegar guardada, apartar con adelanto
// ---------------------------------------------------------------------------
// Lima tiene la prenda en su almacén; la clienta está en Trujillo. Todo como Felipe (líder: opera las dos tiendas).
const conLima = `select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'lima', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'almacen_tienda');
select retail.fn_sububicacion_por_defecto(:'lima', 'traslado_salida') as alm_lima \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'lima', :'alm_lima', 'entrada', 5, 'colchón de prueba Lima') returning id as ml \\gset
select retail.fn_aplicar_movimiento(:'ml') as _al \\gset
`;
const pedir = (como = "ped") => `select retail.pedir_prenda_para_apartar(:'ubic', :'lima', :'v', 1, 'Ana', 'Lozano', '987111222', 'la quiere para el sábado') as ${como} \\gset\n`;
const enviarYRecibir = `select retail.enviar_pedido_para_apartar(:'ped', now() + interval '1 day') as tr \\gset
select retail.registrar_recepcion_traslado(:'tr', :'v', 1) as _rr \\gset
select * from retail.confirmar_traslado(:'tr') \\gset
`;
// ADR-0328 act. 17 (Felipe, 2026-10-04: «allá la apartan»): pedir para un cliente APARTA la prenda en la otra tienda
// (antes no tocaba su stock y la otra caja la podía vender mientras el pedido esperaba).
exito("otra sede: pedir queda «pedido» y la aparta en la otra tienda",
  `${preparar(FELIPE)}${conLima}${pedir()}
select pe.estado, (select sum(cantidad_apartada) from retail.stock where variante_id = :'v' and ubicacion_id = :'lima'),
       (select a.estado from retail.apartados a where a.id = pe.apartado_origen_id)
  from retail.separacion_pedidos pe where pe.id = :'ped';`,
  (x) => x === "pedido|1|abierto");
exito("otra sede: al cerrar el traslado, la prenda queda guardada sola para la clienta en el almacén",
  `${preparar(FELIPE)}${conLima}${pedir()}${enviarYRecibir}
select pe.estado, a.estado, a.clienta_nombre, a.sububicacion_id = retail.fn_sububicacion_por_defecto(:'ubic', 'traslado_entrada'),
       (select count(*) from retail.fn_pedidos_con_cliente(:'ubic') f where f.id = :'ped' and f.direccion = 'pedi' and f.guardada_hasta is not null)
  from retail.separacion_pedidos pe join retail.apartados a on a.id = pe.apartado_id where pe.id = :'ped';`,
  (x) => x === "llego|abierto|Ana Lozano|t|1");
exito("otra sede: con el adelanto se suelta la reserva, pasa al piso y queda un apartado de verdad, todo junto",
  `${preparar(FELIPE)}${conLima}${pedir()}${enviarYRecibir}
select retail.separar_pedido_para_apartar(:'ped', jsonb_build_object(
  'p_ubicacion_id', :'ubic', 'p_items', ${items(1)}, 'p_pagos', ${pagos(["yape", 30])},
  'p_clienta_nombres', 'Ana', 'p_clienta_apellidos', 'Lozano', 'p_clienta_celular', '987111222', 'p_devolucion_medio', 'yape')) as sep2 \\gset
select pe.estado, pe.separacion_id = :'sep2', (select estado from retail.apartados where id = pe.apartado_id),
       (select s.estado || ':' || s.adelanto || ':' || (s.estante is not null) from retail.separaciones s where s.id = :'sep2'),
       (select count(*) from retail.fn_verificar_separaciones()), (select count(*) from retail.fn_verificar_apartados())
  from retail.separacion_pedidos pe where pe.id = :'ped';`,
  (x) => x === "apartado|t|liberado|abierta:30.00:true|0|0");
error("otra sede: no se pide lo que la otra tienda no tiene",
  `${preparar(FELIPE)}${conLima}
select retail.pedir_prenda_para_apartar(:'ubic', :'lima', :'v', 99, 'Ana', 'Lozano', '987111222');`,
  "ya no tiene disponible");
exito("otra sede: cancelar lo que ya llegó suelta la reserva",
  `${preparar(FELIPE)}${conLima}${pedir()}${enviarYRecibir}
select retail.cancelar_pedido_para_apartar(:'ped', 'ya no la quiere') as _c \\gset
select pe.estado, (select estado from retail.apartados where id = pe.apartado_id) from retail.separacion_pedidos pe where pe.id = :'ped';`,
  (x) => x === "cancelado|liberado");
// ADR-0328 act. 17: desde Vender («Dónde más hay») pide la asesora que atiende, que no siempre tiene Apartados.
exito("otra sede: con Vender (sin Apartados) se pide",
  `${preparar(FELIPE)}${conLima}
set local request.jwt.claim.sub = '${MICAELA}';
select retail.pedir_prenda_para_apartar(:'ubic', :'lima', :'v', 1, 'Ana', 'Lozano', '987111222') is not null as pidio \\gset
select :'pidio';`,
  (x) => x === "t");
error("otra sede: sin Vender ni Apartados no se pide",
  `${preparar(FELIPE)}${conLima}
delete from retail.rol_modulos where rol_id = '44444444-4444-4444-8444-000000000003';
set local request.jwt.claim.sub = '${MICAELA}';
select retail.pedir_prenda_para_apartar(:'ubic', :'lima', :'v', 1, 'Ana', 'Lozano', '987111222');`, "no tiene Vender ni Apartados");

// ---------------------------------------------------------------------------
// Las dos migraciones de ADR-0399 (20261014150000 y 20261014151000): se pegan dos veces sin cambiar nada y no pisan a ciegas
// ---------------------------------------------------------------------------
const MIG_ENTREGA = readFileSync("supabase/migrations/20261014150000_apartados_entregar_boleta_por_el_total.sql", "utf8");
const MIG_CONSTANCIA = readFileSync("supabase/migrations/20261014151000_apartados_constancia_sin_comprobante.sql", "utf8");
const FUNCIONES_0399 = `('separar_prendas', 'abonar_separacion', 'entregar_separacion', 'fn_verificar_separaciones')`;
const HUELLAS = `(select string_agg(p.proname || '=' || md5(p.prosrc), ',' order by p.proname) from pg_proc p
   where p.pronamespace = 'retail'::regnamespace and p.proname in ${FUNCIONES_0399})`;
exito("las dos migraciones de ADR-0399 son re-ejecutables: pegarlas otra vez no cambia ninguna función y no deja sobrecargas",
  `begin;
select ${HUELLAS} as h0 \\gset
${MIG_ENTREGA}
${MIG_CONSTANCIA}
${MIG_ENTREGA}
${MIG_CONSTANCIA}
select :'h0' = ${HUELLAS}, (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ${FUNCIONES_0399});`,
  (s) => s === "t|4");
error("la migración de la constancia aborta si separar_prendas cambió (no la pisa a ciegas)",
  `begin;
do $x$ begin
  execute replace(pg_get_functiondef('retail.separar_prendas(uuid,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,uuid,uuid,text,uuid)'::regprocedure),
    'ADR-0399: el adelanto es un pacto interno', 'otra cosa');
end $x$;
${MIG_CONSTANCIA}`, "cambió desde que se escribió esta migración");
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
