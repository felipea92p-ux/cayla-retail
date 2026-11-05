#!/usr/bin/env node
/**
 * Prueba del ADR-0429 (decisión 3 del ADR-0417), actividad 1 — Interbank, las cuentas «por depositar» y la máquina que
 * cobra (`20261016173000_pos_maquinas_interbank_y_por_depositar.sql`).
 *
 * QUÉ CUBRE
 *   · la siembra: Interbank, «Por depositar Izipay» y «Por depositar Vendemás»; Izipay cobra tarjeta y QR en todas las tiendas,
 *     Vendemás tarjeta en Trujillo; desde el 2026-09-30 la tarjeta de Trujillo entra a Vendemás, el QR a Izipay y la tarjeta de
 *     Lima a Izipay; «A qué cuenta entra cada cobro» lista el QR;
 *   · Vender: una venta con tarjeta, QR y efectivo sella cada cobro en su máquina sin que nadie elija; los saldos de las puentes
 *     suben; en Lima la tarjeta va a Izipay; el diario asienta tarjeta y QR en la 105;
 *   · la máquina ELEGIDA (lo que mandará la hoja de cobro, actividad 2): vale si opera en esa tienda con ese medio; si no, el
 *     sello no tumba la venta (queda «sin cuenta») y la función lo dice en palabras; un banco también sirve para el QR;
 *   · lo que ve la hoja (`fn_pos_maquinas_de_sede`): por medio, con la de defecto marcada; vacío sin acceso a retail;
 *   · Configuración (`fn_pos_maquinas`, solo el líder; `guardar_medio_de_cobro` con QR y con el candado de la tienda);
 *   · los candados de las máquinas: no se borran; no se les quita una tienda mientras sean su destino por defecto; su cuenta es
 *     una «por depositar» y no cambia; operan en tiendas;
 *   · permisos: las lecturas para `authenticated`, nada para `anon`; la interna cerrada.
 *
 * CÓMO. Igual que `cuenta_sellada.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:pos-maquinas                                    → contra el local compartido
 *   pnpm pruebas:pos-maquinas -- --contenedor supabase_db_<pila> → contra una pila propia
 *   pnpm pruebas:pos-maquinas -- --con-migracion supabase/migrations/<archivo>.sql
 *                                  → prueba una migración que el local aún no tiene, dentro de cada transacción (se deshace)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// `--con-migracion <archivo>`: se aplica DENTRO de la transacción de cada escenario y se deshace con su ROLLBACK (como en
// `cuentas_dinero.mjs`, ADR-0548). Sirve para comprobar que una migración posterior no rompe lo que prometen las máquinas.
const ARG_MIGRACION = process.argv.indexOf("--con-migracion");
const MIGRACION_EN_LA_TRANSACCION = ARG_MIGRACION > 0 ? readFileSync(process.argv[ARG_MIGRACION + 1], "utf8") : "";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo
const NADIE = "99999999-9999-4999-8999-999999999999"; // una sesión que no es de retail

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", ...(process.env.DEPURAR ? ["-a"] : []), "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${process.env.DEPURAR ? `${e.stdout ?? ""}\n` : ""}${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
`;
const AYUDAS = `
create function pg_temp.saldo(p_id uuid) returns numeric language sql as $f$
  select saldo from retail.fn_cuentas_dinero_saldos() where id = p_id;
$f$;
create function pg_temp.cta(p_id uuid) returns text language sql as $f$
  select coalesce((select nombre from retail.cuentas_dinero where id = p_id), '-');
$f$;
`;

/** Las tiendas, las tres cuentas y las dos máquinas que sembró la migración; la caja de Trujillo abierta con S/ 1,000, stock
 *  de sobra y una variante `:v` a S/ 100. */
const ESCENA = `
begin;
${MIGRACION_EN_LA_TRANSACCION}
${INTENTO}
${AYUDAS}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as cajon_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'cajon' \\gset
select id as ibk from retail.cuentas_dinero where nombre = 'Interbank' and archivada_en is null \\gset
select id as izipay_cta from retail.cuentas_dinero where nombre = 'Por depositar Izipay' and archivada_en is null \\gset
select id as vendemas_cta from retail.cuentas_dinero where nombre = 'Por depositar Vendemás' and archivada_en is null \\gset
select id as izipay from retail.pos_maquinas where nombre = 'Izipay' and archivada_en is null \\gset
select id as vendemas from retail.pos_maquinas where nombre = 'Vendemás' and archivada_en is null \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT97' when 'factura' then 'FT97' else serie end, siguiente_numero = 1
 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id in (:'tru', :'lim') and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
update retail.variantes set precio = 100 where id = :'v';
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select :'v', u, retail.fn_sububicacion_por_defecto(u, 'venta'), 'entrada', 50, 'colchón de prueba' from unnest(array[:'tru', :'lim']::uuid[]) u;
select count(*) as _st from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
 where m.variante_id = :'v' and m.motivo = 'colchón de prueba' and m.created_at = now()) x \\gset
`;
const venta = (nombre, ubic, pagos) => `
select retail.registrar_venta(:'${ubic}',
  jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', 100, 'descuento_unitario', 0)),
  jsonb_build_array(${pagos.map(([m, monto]) => `jsonb_build_object('metodo', '${m}', 'monto', ${monto})`).join(", ")}),
  null, gen_random_uuid(), p_descuento_pct => 0) as ${nombre} \\gset
`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(2);
}

// 1. La siembra: cuentas, máquinas, dónde operan y a qué cuenta entra cada cobro desde el 2026-09-30.
{
  const r = correr(`${ESCENA}
select count(*) filter (where tipo = 'banco' and nombre = 'Interbank'), count(*) filter (where tipo = 'por_abonar' and nombre like 'Por depositar %')
  from retail.cuentas_dinero where archivada_en is null;
select string_agg(m.nombre || ':' || u.nombre || ':' || ms.medio, ',' order by m.nombre, u.nombre, ms.medio)
  from retail.pos_maquinas m join retail.pos_maquinas_sedes ms on ms.maquina_id = m.id join retail.ubicaciones u on u.id = ms.ubicacion_id;
select pg_temp.cta(retail.fn_cuenta_de_cobro(:'tru', 'tarjeta', retail.fn_hoy_lima())), pg_temp.cta(retail.fn_cuenta_de_cobro(:'tru', 'qr', retail.fn_hoy_lima())),
       pg_temp.cta(retail.fn_cuenta_de_cobro(:'lim', 'tarjeta', retail.fn_hoy_lima())), pg_temp.cta(retail.fn_cuenta_de_cobro(:'tru', 'tarjeta', date '2026-09-29'));
select count(*) filter (where medio = 'qr') = (select count(*) from retail.ubicaciones where activo and tipo = 'tienda'),
       string_agg(distinct medio, ',' order by medio) from retail.fn_medios_de_cobro();
select count(*) from retail.configuracion_historial where detalle ->> 'migracion' = '20261016173000';`);
  const [cuentas, maquinas, destinos, medios, historial] = lineas(r);
  esperar("nacen Interbank (banco) y las dos cuentas «por depositar»", r.ok && cuentas === "1|2", r);
  esperar("Izipay cobra tarjeta y QR en las dos tiendas; Vendemás, tarjeta solo en Trujillo",
    r.ok && maquinas === "Izipay:Tienda Lima:qr,Izipay:Tienda Lima:tarjeta,Izipay:Tienda Trujillo:qr,Izipay:Tienda Trujillo:tarjeta,Vendemás:Tienda Trujillo:tarjeta", r);
  esperar("desde el 2026-09-30: la tarjeta de Trujillo entra a Vendemás, el QR a Izipay, la tarjeta de Lima a Izipay; el día antes, a nada",
    r.ok && destinos === "Por depositar Vendemás|Por depositar Izipay|Por depositar Izipay|-", r);
  esperar("«A qué cuenta entra cada cobro» lista el QR en cada tienda, junto a los otros cuatro medios", r.ok && medios === "t|plin,qr,tarjeta,transferencia,yape", r);
  esperar("cada fila sembrada dejó su rastro en la historia de Configuración (3 cuentas + 2 tiendas × 2 medios)", r.ok && historial === "7", r);
}

// 2. Vender: cada cobro se sella en su máquina sin que nadie elija; los saldos suben en la puente; el diario asienta en la 105.
{
  const r = correr(`${ESCENA}
select pg_temp.saldo(:'vendemas_cta') as s0v, pg_temp.saldo(:'izipay_cta') as s0i, pg_temp.saldo(:'ibk') as s0b \\gset
${venta("v1", "tru", [["tarjeta", 25], ["qr", 35], ["efectivo", 40]])}
select string_agg(metodo || ':' || pg_temp.cta(cuenta_dinero_id), ',' order by metodo) from retail.venta_pagos where venta_id = :'v1';
select pg_temp.saldo(:'vendemas_cta') - :s0v, pg_temp.saldo(:'izipay_cta') - :s0i, pg_temp.saldo(:'ibk') - :s0b;
select retail.abrir_caja(:'lim', 100.00, 'prueba automatizada') as caja_lim \\gset
${venta("v2", "lim", [["tarjeta", 100]])}
select pg_temp.cta(cuenta_dinero_id) from retail.venta_pagos where venta_id = :'v2';
select coalesce(sum(debe) filter (where cuenta = '105'), 0), coalesce(sum(debe) filter (where cuenta = '104'), 0), coalesce(sum(debe) filter (where cuenta = '101'), 0)
  from retail.fn_asientos(retail.fn_hoy_lima(), retail.fn_hoy_lima(), null) where asiento = 'venta:' || :'v1';
select retail.fn_asiento_cuenta_de_medio('qr', 'entra'), retail.fn_asiento_cuenta_de_medio('qr', 'sale'), retail.fn_asiento_cuenta_de_medio('tarjeta', 'entra'),
       retail.fn_asiento_cuenta_de_medio('yape', 'entra'), retail.fn_asiento_cuenta_de_medio('redondeo', 'entra');`);
  const [sellos, saldos, lima, diario, cuentasDiario] = lineas(r);
  esperar("en Trujillo la tarjeta se sella en Vendemás, el QR en Izipay y el efectivo en el cajón, sin que el mostrador elija",
    r.ok && sellos === "efectivo:Cajón · Tienda Trujillo,qr:Por depositar Izipay,tarjeta:Por depositar Vendemás", r);
  esperar("lo cobrado sube en la puente de cada máquina y no toca el banco", r.ok && saldos === "25.00|35.00|0.00", r);
  esperar("en Lima, con una sola máquina, la tarjeta va a Izipay sin preguntar", r.ok && lima === "Por depositar Izipay", r);
  esperar("el diario asienta la tarjeta y el QR en la 105 (esperan en la máquina), nada en la 104, y el efectivo en la 101", r.ok && diario === "60.00|0|40.00", r);
  esperar("fn_asiento_cuenta_de_medio: QR que entra → 105; QR que sale, Yape → 104; tarjeta → 105; redondeo sigue en 6598", r.ok && cuentasDiario === "105|104|105|104|6598", r);
}

// 3. La máquina elegida (lo que mandará la hoja de cobro): vale donde opera; donde no, el sello no tumba la venta.
{
  const r = correr(`${ESCENA}
${venta("v1", "tru", [["efectivo", 100]])}
select retail.abrir_caja(:'lim', 100.00, 'prueba automatizada') as caja_lim \\gset
${venta("v2", "lim", [["efectivo", 100]])}
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values (:'v1', 'tarjeta', 1, :'izipay_cta') returning pg_temp.cta(cuenta_dinero_id);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values (:'v2', 'tarjeta', 1, :'vendemas_cta') returning pg_temp.cta(cuenta_dinero_id);
select pg_temp.intento(format('select retail.fn_cuenta_sellada(''cobro'', ''tarjeta'', %L, retail.fn_hoy_lima(), %L)', :'lim', :'vendemas_cta'));
select pg_temp.cta(retail.fn_cuenta_sellada('cobro', 'qr', :'tru', retail.fn_hoy_lima(), :'ibk'));
select pg_temp.intento(format('select retail.fn_cuenta_sellada(''cobro'', ''qr'', %L, retail.fn_hoy_lima(), %L)', :'tru', :'cajon_tru'));
select pg_temp.intento(format('select retail.fn_cuenta_sellada(''cobro'', ''tarjeta'', %L, retail.fn_hoy_lima(), %L)', :'tru', :'cajon_tru'));
select pg_temp.intento(format('update retail.venta_pagos set cuenta_dinero_id = %L where venta_id = %L and metodo = ''tarjeta''', :'vendemas_cta', :'v1'));`);
  const [izipayEnTru, vendemasEnLim, motivo, qrAlBanco, qrAlCajon, tarjetaAlCajon, cambiar] = lineas(r);
  esperar("en Trujillo la cajera puede marcar Izipay para la tarjeta: se sella ahí", r.ok && izipayEnTru === "Por depositar Izipay", r);
  esperar("Vendemás no opera en Lima: el sello nunca tumba la venta, el cobro queda «sin cuenta»", r.ok && vendemasEnLim === "-", r);
  esperar("…y la función lo dice en palabras", r.ok && motivo.includes("no cobra con tarjeta en esta tienda"), r);
  esperar("un banco también sirve para el QR (la regla de F3b sigue)", r.ok && qrAlBanco === "Interbank", r);
  esperar("un cajón no sirve ni para el QR ni para la tarjeta", r.ok && qrAlCajon.includes("por depositar") && tarjetaAlCajon.includes("por depositar"), r);
  esperar("la cuenta de un cobro sigue sin cambiar después", r.ok && cambiar.includes("se sella al cobrar"), r);
}

// 3b. Actividad 2 (20261016182000): lo que la hoja marca viaja en `p_pagos[].cuenta_id` y `registrar_venta` lo guarda; lo que
//     no sirve no tumba la venta.
{
  const ventaCon = (nombre, ubic, pagos) => `
select retail.registrar_venta(:'${ubic}',
  jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', 100, 'descuento_unitario', 0)),
  jsonb_build_array(${pagos.map(([m, monto, cuenta]) => `jsonb_build_object('metodo', '${m}', 'monto', ${monto}${cuenta ? `, 'cuenta_id', ${cuenta}` : ""})`).join(", ")}),
  null, gen_random_uuid(), p_descuento_pct => 0) as ${nombre} \\gset
`;
  const r = correr(`${ESCENA}
${ventaCon("v1", "tru", [["tarjeta", 100, ":'izipay_cta'"]])}
select pg_temp.cta(cuenta_dinero_id) from retail.venta_pagos where venta_id = :'v1';
${ventaCon("v2", "tru", [["tarjeta", 60, ":'vendemas_cta'"], ["qr", 40, ":'izipay_cta'"]])}
select string_agg(metodo || ':' || pg_temp.cta(cuenta_dinero_id), ',' order by metodo) from retail.venta_pagos where venta_id = :'v2';
select retail.abrir_caja(:'lim', 100.00, 'prueba automatizada') as caja_lim \\gset
${ventaCon("v3", "lim", [["tarjeta", 100, ":'vendemas_cta'"]])}
select pg_temp.cta(cuenta_dinero_id), (select estado from retail.ventas where id = :'v3') from retail.venta_pagos where venta_id = :'v3';
${ventaCon("v4", "tru", [["tarjeta", 100, "'no-es-un-uuid'"]])}
select pg_temp.cta(cuenta_dinero_id), (select estado from retail.ventas where id = :'v4') from retail.venta_pagos where venta_id = :'v4';
${ventaCon("v5", "tru", [["yape", 100, ":'izipay_cta'"]])}
select pg_temp.cta(cuenta_dinero_id) from retail.venta_pagos where venta_id = :'v5';
${ventaCon("v6", "tru", [["tarjeta", 100, ":'cajon_tru'"]])}
select pg_temp.cta(cuenta_dinero_id), (select estado from retail.ventas where id = :'v6') from retail.venta_pagos where venta_id = :'v6';`);
  const [izipay, dos, limVendemas, basura, yape, cajon] = lineas(r);
  esperar("la hoja marcó Izipay para la tarjeta en Trujillo: se sella en Izipay (no en la de defecto)", r.ok && izipay === "Por depositar Izipay", r);
  esperar("tarjeta en Vendemás y QR en Izipay en la misma venta, cada uno en su puente", r.ok && dos === "qr:Por depositar Izipay,tarjeta:Por depositar Vendemás", r);
  esperar("Vendemás marcada en Lima (donde no opera): la venta se completa y el cobro queda «sin cuenta»", r.ok && limVendemas === "-|completada", r);
  esperar("un `cuenta_id` que no es un uuid no tumba la venta: se sella la máquina por defecto", r.ok && basura === "Por depositar Vendemás|completada", r);
  esperar("con Yape el `cuenta_id` se ignora (no es de una máquina)", r.ok && yape === "-", r);
  esperar("un cajón como «máquina» no pasa el sello: «sin cuenta», venta completa", r.ok && cajon === "-|completada", r);
}

// 4. Lo que ve la hoja de cobro y lo que ve Configuración.
{
  const r = correr(`${ESCENA}
select string_agg(medio || ':' || nombre || ':' || por_defecto, ',' order by medio, nombre) from retail.fn_pos_maquinas_de_sede(:'tru');
select string_agg(medio || ':' || nombre || ':' || por_defecto, ',' order by medio, nombre) from retail.fn_pos_maquinas_de_sede(:'lim');
${cambiaA(MICAELA)}
select count(*) from retail.fn_pos_maquinas_de_sede(:'tru');
select pg_temp.intento('select count(*) from retail.fn_pos_maquinas()');
${cambiaA(NADIE)}
select count(*) from retail.fn_pos_maquinas_de_sede(:'tru');
${cambiaA(FELIPE)}
select count(*), count(distinct maquina_id), count(*) filter (where por_defecto) from retail.fn_pos_maquinas();
select has_function_privilege('authenticated', 'retail.fn_pos_maquinas_de_sede(uuid)', 'execute'), has_function_privilege('anon', 'retail.fn_pos_maquinas_de_sede(uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_pos_maquinas()', 'execute'), has_function_privilege('anon', 'retail.fn_pos_maquinas()', 'execute'),
       has_function_privilege('authenticated', 'retail.fn_pos_cuenta_sirve_en_sede(uuid, uuid, text)', 'execute');`);
  const [tru, lim, micaela, micaelaConfig, nadie, config, permisos] = lineas(r);
  esperar("la hoja de Trujillo ve dos máquinas para la tarjeta (Vendemás de defecto) y una para el QR", r.ok && tru === "qr:Izipay:true,tarjeta:Izipay:false,tarjeta:Vendemás:true", r);
  esperar("la hoja de Lima ve una sola máquina por medio: no hay nada que preguntar", r.ok && lim === "qr:Izipay:true,tarjeta:Izipay:true", r);
  esperar("una colaboradora activa la ve (la hoja de cobro es de quien vende)", r.ok && micaela === "3", r);
  esperar("pero la lista de Configuración es del líder (o de quien tiene Configuración), no de una colaboradora", r.ok && micaelaConfig.includes("del líder"), r);
  esperar("quien no es de retail no ve nada (y la función no se cae)", r.ok && nadie === "0", r);
  esperar("Configuración: una fila por máquina, tienda y medio; 4 de ellas son hoy el destino por defecto", r.ok && config === "5|2|4", r);
  esperar("las lecturas son para `authenticated` y no para `anon`; la interna está cerrada", r.ok && permisos === "t|f|t|f|f", r);
}

// 5. «A qué cuenta entra cada cobro» aprende el QR y respeta dónde opera cada máquina.
{
  const r = correr(`${ESCENA}
select retail.guardar_medio_de_cobro(:'tru', 'qr', :'ibk') as _m1 \\gset
select pg_temp.cta(retail.fn_cuenta_de_cobro(:'tru', 'qr', retail.fn_hoy_lima())), pg_temp.cta(retail.fn_cuenta_de_cobro(:'tru', 'qr', date '2026-10-01'));
select pg_temp.intento(format('select retail.guardar_medio_de_cobro(%L, ''tarjeta'', %L)', :'lim', :'vendemas_cta'));
select pg_temp.intento(format('select retail.guardar_medio_de_cobro(%L, ''qr'', %L)', :'tru', :'cajon_tru'));
select pg_temp.intento(format('select retail.guardar_medio_de_cobro(%L, ''otro'', %L)', :'tru', :'ibk'));
select retail.guardar_medio_de_cobro(:'tru', 'tarjeta', :'izipay_cta') as _m2 \\gset
select string_agg(medio || ':' || nombre || ':' || por_defecto, ',' order by medio, nombre) from retail.fn_pos_maquinas_de_sede(:'tru');`);
  const [qrAlBanco, lim, cajon, otro, hoja] = lineas(r);
  esperar("el QR de una tienda puede ir a un banco desde hoy; lo de antes sigue en su máquina", r.ok && qrAlBanco === "Interbank|Por depositar Izipay", r);
  esperar("no se manda la tarjeta de Lima a Vendemás, que no opera ahí", r.ok && lim.includes("no cobra con tarjeta en esa tienda"), r);
  esperar("ni el QR a un cajón", r.ok && cajon.includes("por depositar"), r);
  esperar("el aviso de medios nombra al QR", r.ok && otro.includes("QR"), r);
  esperar("si Trujillo cambia su tarjeta a Izipay, la hoja marca Izipay de entrada", r.ok && hoja === "qr:Izipay:false,tarjeta:Izipay:true,tarjeta:Vendemás:false", r);
}

// 6. Los candados de las máquinas.
{
  const r = correr(`${ESCENA}
select pg_temp.intento(format('delete from retail.pos_maquinas where id = %L', :'vendemas'));
select pg_temp.intento(format('delete from retail.pos_maquinas_sedes where maquina_id = %L and ubicacion_id = %L and medio = ''tarjeta''', :'vendemas', :'tru'));
select retail.guardar_medio_de_cobro(:'tru', 'tarjeta', :'izipay_cta') as _m \\gset
select pg_temp.intento(format('delete from retail.pos_maquinas_sedes where maquina_id = %L and ubicacion_id = %L and medio = ''tarjeta''', :'vendemas', :'tru'));
select pg_temp.intento(format('insert into retail.pos_maquinas (nombre, cuenta_id) values (''Niubiz'', %L)', :'ibk'));
select retail.crear_cuenta_dinero('Por depositar Prueba', 'por_abonar', 0, retail.fn_hoy_lima()) as nueva \\gset
select pg_temp.intento(format('update retail.pos_maquinas set cuenta_id = %L where id = %L', :'nueva', :'vendemas'));
select pg_temp.intento(format('update retail.pos_maquinas set nombre = ''Vendemás 2'', archivada_en = now() where id = %L', :'vendemas'));
select pg_temp.intento(format('insert into retail.pos_maquinas_sedes (maquina_id, ubicacion_id, medio) values (%L, %L, ''tarjeta'')', :'izipay', :'taller'));
select pg_temp.intento(format('insert into retail.pos_maquinas_sedes (maquina_id, ubicacion_id, medio) values (%L, %L, ''yape'')', :'izipay', :'tru'));
select string_agg(medio || ':' || nombre, ',' order by medio, nombre) from retail.fn_pos_maquinas_de_sede(:'tru');`);
  const [borrar, quitarDefecto, quitar, cuentaBanco, cambiarCuenta, archivar, taller, yape, hoja] = lineas(r);
  esperar("una máquina no se borra: se archiva", r.ok && borrar.includes("se archiva"), r);
  esperar("no se le quita una tienda mientras sea ahí el destino de la tarjeta", r.ok && quitarDefecto.includes("primero cambia"), r);
  esperar("cambiado el destino, sí se le quita", r.ok && quitar === "SIN_ERROR", r);
  esperar("su cuenta tiene que ser una «por depositar»: un banco no", r.ok && cuentaBanco.includes("por depositar"), r);
  esperar("y no cambia después: solo el nombre, el orden o archivarla", r.ok && cambiarCuenta.includes("solo cambia") && archivar === "SIN_ERROR", r);
  esperar("una máquina opera en tiendas, no en el Taller", r.ok && taller.includes("en una tienda"), r);
  esperar("y solo con tarjeta o QR", r.ok && yape.includes("pos_maquinas_sedes_medio_check"), r);
  esperar("archivada, la hoja ya no la ofrece", r.ok && hoja === "qr:Izipay,tarjeta:Izipay", r);
}

// 7. Actividad 3 (20261016190000): el depósito de la máquina se cruza contra los días pendientes y la comisión es la diferencia.
//    (En el local el día de hoy puede traer cobros del seed sin sellar que la vigencia deduce: todo se mide RELATIVO a lo que ya había.)
{
  const r = correr(`${ESCENA}
select coalesce((select bruto from retail.fn_pos_pendientes(:'vendemas_cta') where fecha = retail.fn_hoy_lima()), 0) as bv0 \\gset
${venta("v1", "tru", [["tarjeta", 60], ["qr", 40]])}
select pg_temp.saldo(:'vendemas_cta') as s0v, pg_temp.saldo(:'ibk') as s0b \\gset
select count(*), sum(bruto) - :bv0 from retail.fn_pos_pendientes(:'vendemas_cta') where fecha = retail.fn_hoy_lima();
select clave as cv, bruto as bv from retail.fn_pos_pendientes(:'vendemas_cta') where fecha = retail.fn_hoy_lima() \\gset
select clave as ci, bruto as bi from retail.fn_pos_pendientes(:'izipay_cta') where fecha = retail.fn_hoy_lima() and medio = 'qr' \\gset
select gen_random_uuid() as tok \\gset
select pg_temp.intento(format('select retail.registrar_abono_pos(%L, %L, retail.fn_hoy_lima(), %s, array[%L])', :'vendemas_cta', :'ibk', :bv + 10, :'cv'));
select pg_temp.intento(format('select retail.registrar_abono_pos(%L, %L, retail.fn_hoy_lima() - 1, %s, array[%L])', :'vendemas_cta', :'ibk', :bv - 1.80, :'cv'));
select pg_temp.intento(format('select retail.registrar_abono_pos(%L, %L, retail.fn_hoy_lima(), %s, array[]::text[])', :'vendemas_cta', :'ibk', :bv - 1.80));
select pg_temp.intento(format('select retail.registrar_abono_pos(%L, %L, retail.fn_hoy_lima(), %s, array[%L])', :'vendemas_cta', :'cajon_tru', :bv - 1.80, :'cv'));
select retail.registrar_abono_pos(:'vendemas_cta', :'ibk', retail.fn_hoy_lima(), :bv - 1.80, array[:'cv'], 'Liq. Vendemás', :'tok') as ab \\gset
select (:'ab'::jsonb ->> 'comision'), (:'ab'::jsonb ->> 'dias'), (:'ab'::jsonb ->> 'bruto')::numeric = :bv, (:'ab'::jsonb ->> 'neto')::numeric = :bv - 1.80;
select (retail.registrar_abono_pos(:'vendemas_cta', :'ibk', retail.fn_hoy_lima(), :bv - 1.80, array[:'cv'], 'Liq. Vendemás', :'tok')) ->> 'dias';
select count(*) from retail.movimientos_dinero where token_cliente = :'tok';
select pg_temp.saldo(:'vendemas_cta') - :s0v = -:bv, pg_temp.saldo(:'ibk') - :s0b = :bv - 1.80;
select g.categoria, g.monto_total from retail.gastos g join retail.movimientos_dinero d on d.gasto_comision_id = g.id where d.token_cliente = :'tok';
select count(*) from retail.fn_pos_pendientes(:'vendemas_cta') where clave = :'cv';
select pg_temp.intento(format('select retail.registrar_abono_pos(%L, %L, retail.fn_hoy_lima(), 50, array[%L])', :'vendemas_cta', :'ibk', :'cv'));
select retail.registrar_abono_pos(:'izipay_cta', :'ibk', retail.fn_hoy_lima(), :bi, array[:'ci']) as abi \\gset
select :'abi'::jsonb ->> 'comision';
select count(*) from retail.movimientos_dinero d where d.id = (:'abi'::jsonb ->> 'movimiento_id')::uuid and d.gasto_comision_id is not null;
select ((retail.fn_conciliacion(:'vendemas_cta')) ->> 'saldo_sistema')::numeric = :s0v - :bv, jsonb_array_length((retail.fn_conciliacion(:'vendemas_cta')) -> 'lineas') >= 2;
select id as mov from retail.movimientos_dinero where token_cliente = :'tok' \\gset
select pg_temp.intento(format('delete from retail.pos_abonos_lotes where movimiento_dinero_id = %L', :'mov'));
select retail.anular_movimiento_dinero(:'mov', 'El banco no lo abonó: era de otra máquina') as _an \\gset
select count(*) from retail.fn_pos_pendientes(:'vendemas_cta') where clave = :'cv';
select pg_temp.saldo(:'vendemas_cta') - :s0v;
select :s0v;
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.registrar_abono_pos(%L, %L, retail.fn_hoy_lima(), %s, array[%L])', :'vendemas_cta', :'ibk', :bv - 1.80, :'cv'));
select pg_temp.intento(format('select count(*) from retail.fn_pos_pendientes(%L)', :'vendemas_cta'));
${cambiaA(FELIPE)}
select retail.fn_texto_movimiento_dinero('abono_tarjeta');`);
  const [pendiente, mayor, anterior, sinDias, aCajon, abono, repetido, unoSolo, saldos, gasto, yaNo, otraVez, qrSinComision, sinGasto, concilia, borrarLote, libre, saldoVuelve, s0v, micaela, micaelaVe, texto] = lineas(r);
  esperar("la venta de hoy suma S/ 60 al día pendiente de Vendemás (un solo renglón por día, tienda y medio)", r.ok && pendiente === "1|60.00", r);
  esperar("un depósito mayor que lo cobrado se rechaza (comisión negativa = días sin marcar)", r.ok && mayor.includes("no puede ser mayor que lo cobrado"), r);
  esperar("un depósito anterior al último día que cubre se rechaza", r.ok && anterior.includes("anterior al último día"), r);
  esperar("sin días marcados no hay nada que cruzar", r.ok && sinDias.includes("Marca qué días"), r);
  esperar("el depósito llega a un banco, no a un cajón", r.ok && aCajon.includes("llega a un banco"), r);
  esperar("llegó S/ 1.80 menos de lo cobrado ese día: la comisión real es S/ 1.80, en un solo día", r.ok && abono === "1.80|1|t|t", r);
  esperar("el mismo token devuelve el mismo abono (doble clic) y no hay dos", r.ok && repetido === "1" && unoSolo === "1", r);
  esperar("la puente de Vendemás baja todo lo cobrado ese día e Interbank sube lo que llegó", r.ok && saldos === "t|t", r);
  esperar("la comisión queda como gasto bancario (639) de la empresa", r.ok && gasto === "gastos_bancarios|1.80", r);
  esperar("ese día ya no está pendiente y no se liquida dos veces", r.ok && yaNo === "0" && otraVez.includes("ya se liquidó"), r);
  esperar("el QR de Izipay llegó completo: comisión 0 y ningún gasto", r.ok && qrSinComision === "0.00" && sinGasto === "0", r);
  esperar("Conciliación de la puente cuadra: el saldo del sistema bajó exactamente lo liquidado, con el cobro y el depósito a la vista", r.ok && concilia === "t|t", r);
  esperar("los días que cubrió un depósito no se borran", r.ok && borrarLote.includes("no se editan ni se borran"), r);
  esperar("anular el depósito libera el día (vuelve a pendiente) y la puente recupera su saldo", r.ok && libre === "1" && saldoVuelve === "0.00", r);
  esperar("registrar y ver lo pendiente es del líder", r.ok && micaela.includes("del líder") && micaelaVe.includes("del líder"), r);
  esperar("el movimiento se llama «Depósito de la máquina»", r.ok && texto === "Depósito de la máquina", r);
}

// 8. Actividad 4 (20261016191000): la tarifa solo estima y avisa.
{
  const r = correr(`${ESCENA}
select retail.fn_dias_habiles(date '2026-10-16', date '2026-10-19'), retail.fn_dias_habiles(date '2026-10-17', date '2026-10-18'), retail.fn_dias_habiles(date '2026-10-17', date '2026-10-19'), retail.fn_dias_habiles(date '2026-10-16', date '2026-10-16');
select tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono from retail.fn_pos_tarifa(:'izipay', 'qr', retail.fn_hoy_lima());
select (retail.fn_pos_tarifa(:'vendemas', 'tarjeta', retail.fn_hoy_lima())).id is null;
select pg_temp.intento(format('select retail.guardar_pos_tarifa(%L, ''tarjeta'', 101, true, 0, 2)', :'vendemas'));
select pg_temp.intento(format('select retail.guardar_pos_tarifa(%L, ''tarjeta'', 3, true, 51, 2)', :'vendemas'));
select pg_temp.intento(format('select retail.guardar_pos_tarifa(%L, ''tarjeta'', 3, true, 0, 16)', :'vendemas'));
select pg_temp.intento(format('select retail.guardar_pos_tarifa(%L, ''yape'', 3, true, 0, 2)', :'vendemas'));
select pg_temp.intento(format('select retail.guardar_pos_tarifa(%L, ''qr'', 3, true, 0, 2)', :'vendemas'));
select pg_temp.intento(format('select retail.guardar_pos_tarifa(%L, ''tarjeta'', ''NaN''::numeric, true, 0, 2)', :'vendemas'));
select retail.guardar_pos_tarifa(:'vendemas', 'tarjeta', 3.5, true, 0.20, 2) as t1 \\gset
select retail.guardar_pos_tarifa(:'vendemas', 'tarjeta', 3.5, true, 0.20, 2) = :'t1', (select count(*) from retail.pos_tarifas where maquina_id = :'vendemas');
select vigente_desde from retail.pos_tarifas where id = :'t1';
select coalesce((select esperado from retail.fn_pos_pendientes(:'vendemas_cta') where fecha = retail.fn_hoy_lima()), 0) as e0 \\gset
${venta("v1", "tru", [["tarjeta", 60], ["qr", 40]])}
select n_pagos > 0, esperado - :e0, dias_habiles, atrasado from retail.fn_pos_pendientes(:'vendemas_cta') where fecha = retail.fn_hoy_lima();
select retail.fn_pos_comision_estimada(:'vendemas', 'tarjeta', 60, 1, retail.fn_hoy_lima()), retail.fn_pos_comision_estimada(:'izipay', 'qr', 40, 1, retail.fn_hoy_lima()), retail.fn_pos_comision_estimada(:'izipay', 'tarjeta', 40, 1, retail.fn_hoy_lima()), retail.fn_pos_comision_estimada(:'izipay', 'qr', 40, 1, date '2026-10-09'), retail.fn_pos_comision_estimada(:'izipay', 'qr', 40, 1, date '2026-09-30'), retail.fn_pos_comision_estimada(:'izipay', 'qr', 40, 1, date '2026-09-10');
select retail.guardar_pos_tarifa(:'vendemas', 'tarjeta', 3, true, 0.20, 2) as t2 \\gset
select vigente_desde = retail.fn_hoy_lima(), (select count(*) from retail.pos_tarifas where maquina_id = :'vendemas') from retail.pos_tarifas where id = :'t2';
select count(*) from retail.configuracion_historial where que = 'pos_tarifa' and detalle ->> 'maquina_id' = :'vendemas';
select pg_temp.intento(format('update retail.pos_tarifas set tasa_pct = 1 where id = %L', :'t1'));
select pg_temp.intento(format('update retail.ventas set created_at = created_at - interval ''9 days'' where id = %L', :'v1'));
select count(*) filter (where atrasados >= 1), count(*) filter (where pendientes >= 1), bool_or(sin_tarifa) from retail.fn_pos_alertas() where nombre in ('Izipay', 'Vendemás');
select count(*) filter (where tasa_pct is not null), count(*) from retail.fn_pos_maquinas() where nombre = 'Vendemás';
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.guardar_pos_tarifa(%L, ''tarjeta'', 3, true, 0, 2)', :'vendemas'));
select pg_temp.intento('select count(*) from retail.fn_pos_alertas()');`);
  const [habiles, izipayQr, vendemasSin, t101, c51, d16, yape, qrNoOpera, nan, repetida, desde, pendiente, estimadas, cambio, historial, editar, retroceder, alertas, maquinas, micaela, micaelaVe] = lineas(r);
  esperar("días hábiles: el sábado cuenta y el domingo no; el día de partida no", r.ok && habiles === "2|0|1|0", r);
  esperar("el QR de Izipay hoy cobra 2.38 % + IGV y deposita el mismo día (20261017174000: cobró 0 % hasta el 2026-10-09); Vendemás nace sin tarifa", r.ok && izipayQr === "2.38|t|0.00|0" && vendemasSin === "t", r);
  esperar("la base rechaza una tasa de 101, un cargo de 51, 16 días, un medio que no es de máquina, un medio con el que no cobra y NaN",
    r.ok && t101.includes("0 a 100") && c51.includes("0 a S/ 50") && d16.includes("0 a 15") && yape.includes("tarjeta o del QR") && qrNoOpera.includes("no cobra con QR") && nan.includes("0 a 100"), r);
  esperar("la misma tarifa dos veces no abre una fila nueva; la primera vale para todo lo anterior", r.ok && repetida === "t|1" && desde === "1900-01-01", r);
  esperar("con la tarifa, el día pendiente trae la comisión esperada (3,5 % + IGV sobre S/ 60 + S/ 0.20 = S/ 2.68) y no está atrasado", r.ok && pendiente === "t|2.68|0|f", r);
  esperar("la estimación: S/ 2.68 para la tarjeta de Vendemás; S/ 1.12 (2.38 % + IGV sobre S/ 40) para el QR y la tarjeta de Izipay; el QR de Izipay sigue la historia: 0 el 2026-10-09 (primeros días gratis de octubre), 1.12 el 2026-09-30 y 0 el 2026-09-10 (primeros días gratis de septiembre)", r.ok && estimadas === "2.68|1.12|1.12|0.00|1.12|0.00", r);
  esperar("cambiarla abre una fila desde hoy y deja su rastro en la historia de Configuración", r.ok && cambio === "t|2" && historial === "2", r);
  esperar("una tarifa no se edita", r.ok && editar.includes("no se edita ni se borra"), r);
  esperar("una venta de hace 9 días sin depósito aparece ATRASADA en las dos máquinas (su tarjeta en Vendemás, su QR en Izipay)",
    r.ok && retroceder === "SIN_ERROR" && alertas.startsWith("2|2|"), r);
  esperar("Configuración ve la tarifa vigente en cada fila de la máquina", r.ok && maquinas === "1|1", r);
  esperar("cambiar la tarifa y ver las alertas es del líder", r.ok && micaela.includes("del líder") && micaelaVe.includes("del líder"), r);
}

// 9. Actividad 5 (20261016193000): los cobros con tarjeta y QR sellados en un banco pasan a la puente de su máquina, con rastro.
//    (Los cobros «viejos» se sellan a mano en el banco: el sello acepta un banco elegido para tarjeta y QR, como en F3b.)
{
  const r = correr(`${ESCENA}
select retail.crear_cuenta_dinero('BCP prueba resello', 'banco', 0, retail.fn_hoy_lima()) as bcp \\gset
${venta("v1", "tru", [["tarjeta", 100]])}
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values (:'v1', 'tarjeta', 50, :'bcp') returning pg_temp.cta(cuenta_dinero_id);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values (:'v1', 'qr', 20, :'bcp');
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values (:'v1', 'yape', 10, :'bcp');
select pg_temp.saldo(:'bcp') as b0, pg_temp.saldo(:'vendemas_cta') as s0v, pg_temp.saldo(:'izipay_cta') as s0i \\gset
select pg_temp.intento(format('update retail.venta_pagos set cuenta_dinero_id = %L where venta_id = %L and metodo = ''qr''', :'izipay_cta', :'v1'));
select has_function_privilege('authenticated', 'retail.fn_resellar_cobros_a_maquinas(date, text)', 'execute');
select pg_temp.intento('select retail.fn_resellar_cobros_a_maquinas(retail.fn_hoy_lima(), '''')');
select (retail.fn_resellar_cobros_a_maquinas(retail.fn_hoy_lima(), 'prueba automatizada')) - 'detalle' - 'no_tocados' - 'desde';
select string_agg(metodo || ':' || monto || ':' || pg_temp.cta(cuenta_dinero_id), ',' order by metodo, monto) from retail.venta_pagos where venta_id = :'v1';
select pg_temp.saldo(:'bcp') - :b0, pg_temp.saldo(:'vendemas_cta') - :s0v, pg_temp.saldo(:'izipay_cta') - :s0i;
select count(*), bool_and(pg_temp.cta(cuenta_antes) = 'BCP prueba resello' and motivo = 'prueba automatizada'), string_agg(pg_temp.cta(cuenta_despues), ',' order by pg_temp.cta(cuenta_despues))
  from retail.cobros_resellados r where r.origen_id in (select id from retail.venta_pagos where venta_id = :'v1');
select (retail.fn_resellar_cobros_a_maquinas(retail.fn_hoy_lima(), 'otra vez')) ->> 'movidos';
select pg_temp.intento(format('delete from retail.cobros_resellados where origen_id in (select id from retail.venta_pagos where venta_id = %L)', :'v1'));
select pg_temp.intento(format('update retail.venta_pagos set cuenta_dinero_id = %L where venta_id = %L and metodo = ''qr''', :'bcp', :'v1'));
select count(*) from retail.fn_pos_pendientes(:'izipay_cta') where fecha = retail.fn_hoy_lima() and medio = 'qr';`);
  const [antes, aMano, privilegio, sinMotivo, resultado, despues, saldos, rastro, otraVez, borrarRastro, aManoDespues, pendiente] = lineas(r);
  esperar("un cobro con tarjeta sellado en el banco (como estaba producción)", r.ok && antes === "BCP prueba resello", r);
  esperar("desde una pantalla el sello sigue sin cambiar", r.ok && aMano.includes("se sella al cobrar"), r);
  esperar("la corrección no la puede llamar la web (`authenticated` sin permiso) y exige un motivo", r.ok && privilegio === "f" && sinMotivo.includes("Di por qué"), r);
  // En una base recién sembrada también se corrige el cobro con tarjeta del seed (sin cuenta): por eso «al menos 2».
  const res = r.ok ? JSON.parse(resultado) : {};
  esperar("mueve la tarjeta y el QR del banco a su máquina, y nada queda sin destino", r.ok && res.movidos >= 2 && res.sin_destino === 0, r);
  esperar("la tarjeta va a Vendemás, el QR a Izipay; el Yape no se toca y lo que ya estaba en una puente tampoco",
    r.ok && despues === "qr:20.00:Por depositar Izipay,tarjeta:50.00:Por depositar Vendemás,tarjeta:100.00:Por depositar Vendemás,yape:10.00:BCP prueba resello", r);
  esperar("el banco baja S/ 70 y las puentes suben S/ 50 y S/ 20", r.ok && saldos === "-70.00|50.00|20.00", r);
  esperar("queda el rastro de cada uno: de qué cuenta a cuál y por qué", r.ok && rastro === "2|t|Por depositar Izipay,Por depositar Vendemás", r);
  esperar("la segunda vez no mueve nada (idempotente)", r.ok && otraVez === "0", r);
  esperar("el rastro no se borra, y el sello sigue cerrado después de la corrección", r.ok && borrarRastro.includes("no se edita ni se borra") && aManoDespues.includes("se sella al cobrar"), r);
  esperar("el QR corregido aparece como día pendiente de depósito en Izipay", r.ok && Number(pendiente) >= 1, r);
}

console.log(fallos === 0 ? `\nTodo en orden (${casos} casos) · contenedor: ${CONTENEDOR_LOCAL}` : `\n${fallos} de ${casos} caso(s) fallaron · contenedor: ${CONTENEDOR_LOCAL}`);
process.exit(fallos === 0 ? 0 : 1);
