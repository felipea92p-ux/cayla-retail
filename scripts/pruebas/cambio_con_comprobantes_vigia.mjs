#!/usr/bin/env node
/**
 * Prueba de ADR-0671, parte 3 (`supabase/migrations/20261116214000_cambio_con_comprobantes_parte3_vigia_y_metas.sql`): el vigía de los
 * documentos de un cambio (INV-30) y la fuente única de lo que un cambio le suma o le resta a cada persona en las metas.
 *
 * EL PROBLEMA. Los documentos de un cambio cuelgan de `cambio_id`, no de una venta: INV-06 e INV-07 no los ven. Si el comprobante nuevo suma
 * de más, si la nota se pierde o se queda esperando, o si SUNAT acepta uno y rechaza el otro, el IGV sale mal en silencio. Y la regla de
 * metas de Felipe (la diferencia positiva la suma quien atendió, la negativa se le resta a quien vendió, sin diferencia nada y la venta
 * original no se toca) no existía en ninguna función.
 *
 * QUÉ CUBRE (la venta de partida: BLU-EMMA-NEG-M de lista con S/ 10 de descuento en Tienda Lima, vendida por Sandra; los cambios los hace Felipe):
 *   EL VIGÍA (INV-30, la consulta de `scripts/chaos/invariantes.mjs`, la misma que se siembra)
 *    1. Callado con lo sano: más cara con la original aceptada, más barata, la nota por emitir recién guardada y una nota de venta.
 *    2. Sin comprobante nuevo vivo (liberado a mano): grita «sin_comprobante_nuevo». Uno RECHAZADO calla el primer día (se corrige y se
 *       reenvía) y grita al día siguiente, aunque su nota siga por emitir.
 *    3. La corrupción de la autoprueba de /chaos (el comprobante nuevo cobra S/ 5 más): grita «nuevo_no_da_la_diferencia».
 *    4. La nota (emitida o por emitir) que no es lo pagado: grita «nota_no_es_lo_pagado».
 *    5. Par roto: el comprobante nuevo aceptado y la nota rechazada, o al revés: grita «par_roto».
 *   5b. La nota del cambio ya emitida sobre una original anulada o con la baja en trámite: grita «nota_sobre_original_muerta».
 *    6. La nota por emitir: callada el primer día; a los dos días con la original aceptada, o en el acto si la original se liberó, grita
 *       «nota_se_quedo_por_emitir»; el barrido la emite y se calla.
 *    7. El corte: un cambio de antes del primer documento no se mira; uno de después sin documentos sí («sin_comprobante_nuevo»).
 *    8. Una venta de prueba no se mira, aunque su comprobante esté roto.
 *    9. MUTANTE de la emisión: si la nota se pierde al guardar el cambio, grita «falta_la_nota».
 *   10. El vigía de producción (`fn_correr_invariantes`) corre INV-30 con su clave y la marca «viola», nunca «error»; y lo sembrado es la
 *       misma consulta del detector.
 *   10b. INV-30 nace con su línea base puesta: lo que ya esté roto la primera vez que corre sale NUEVO, no heredado (con el control: sin
 *       la línea base, la primera corrida lo habría tapado).
 *   10c. INV-22 no grita por un cambio por varias con el MISMO modelo que conserva su descuento (ADR-0655; con el control: la consulta de
 *       antes sí gritaba), y su corrupción de /chaos sigue viéndose en uno sin el mismo modelo.
 *   LA FUENTE DE LAS METAS (`fn_diferencias_de_cambio`)
 *   11. Más cara: la diferencia la suma quien atendió (Felipe), en la sede del cambio. Sandra no cambia.
 *   12. Más barata: se le resta a quien vendió (Sandra), en la sede de la venta.
 *   13. Una venta sin asesora: la resta queda sin persona (nadie la sumó en las metas). PROVISIONAL: lo decide Felipe.
 *   14. El corte: sin ningún documento todavía, nada; un cambio de antes del corte, nada.
 *   15. Los filtros: otro día u otra sede, nada.
 *   15b. La sede: vendida en Trujillo y cambiada en Lima, lo de más va a Lima (quien atendió) y lo de menos a Trujillo (la venta), y el
 *       filtro de cada sede ve solo lo suyo.
 *   16. CLAURE en Lima (PROVISIONAL, lo decide Felipe): nunca más que la diferencia ni en su contra, sin diferencia nada, y lo de CLAURE no
 *       suma a CAYLA; un cambio por varias del mismo modelo con una prenda de CLAURE se valora con lo cobrado, no con la lista.
 *   17. MUTANTE de la fuente: si todo se le diera a quien atendió, el caso 12 lo ve.
 *   18. La fuente no la llama una cuenta (es interna).
 *   19. La parte 3 se puede pegar dos veces.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (nunca se commitea nada), como Felipe (líder) con `request.jwt.claim.sub`. Si la base no
 * tiene las partes 1 a 3, se aplican dentro de cada transacción (el CI ya las tiene).
 *
 * USO
 *   pnpm pruebas:cambio-con-comprobantes-vigia
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { INVARIANTES } from "../chaos/invariantes.mjs";
import { filasDelVigia } from "../chaos/vigia-semilla.mjs";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8");
const PARTE1 = leer("20261116212000_cambio_con_comprobantes_parte1_columnas.sql");
const PARTE2 = leer("20261116213000_cambio_con_comprobantes_parte2_funciones.sql");
const PARTE3 = leer("20261116214000_cambio_con_comprobantes_parte3_vigia_y_metas.sql");
const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CAYLA = "ca71a000-0000-4000-8000-000000000001";
const CLAURE = "c1a07e00-0000-4000-8000-000000000002";

// Las consultas de INV-30 e INV-22 tal como se siembran en producción (sin el `;` final).
const INV30 = filasDelVigia().find((f) => f.id === "INV-30");
const CORROMPE = INVARIANTES.find((i) => i.id === "INV-30").corrompe;
const INV22 = filasDelVigia().find((f) => f.id === "INV-22");
const CORROMPE22 = INVARIANTES.find((i) => i.id === "INV-22").corrompe;
for (const f of [INV30, INV22]) {
  if (!f || f.sql.includes("$f$") || f.sql.includes("$q$")) throw new Error("INV-30 o INV-22 no está en el detector, o trae una comilla de esta prueba.");
}
// El control de 10c: INV-22 como era antes de esta parte (comparaba la diferencia también con el mismo modelo).
const EXENCION22 = "\n        and not bool_or(vs.producto_id = vo.producto_id))";
if (!INV22.sql.includes(EXENCION22)) throw new Error("INV-22 ya no trae la exención del mismo modelo: rehace el control de 10c.");
const INV22_ANTES = INV22.sql.replace(EXENCION22, ")");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const TIENE_12 =
  psql("select to_regprocedure('retail.registrar_cambio(uuid,uuid,uuid,integer,text,uuid,text,text,jsonb)') is not null;").trim() === "t";
const TIENE_3 = psql("select to_regprocedure('retail.fn_diferencias_de_cambio(date,date,uuid[])') is not null;").trim() === "t";

/** La migración que falte, sin imprimir nada (la parte 3 termina con un `select` de «quedó bien»). */
const MIGRACION = `\\o /dev/null\n${TIENE_12 ? "" : `${PARTE1}\n${PARTE2}\n`}${TIENE_3 && TIENE_12 ? "" : `${PARTE3}\n`}\\o\n`;

function correr(sql, { venta = "boleta", antes = MIGRACION } = {}) {
  try {
    const salida = psql(`begin;\n${antes}${PRELUDIO}\n${VENTA(venta)}\n${sql}\nrollback;\n`);
    return { ok: true, lineas: salida.trim().split("\n").filter((x) => x !== "") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// `pg_temp.intentar(sql)`: «ok» o «mensaje :: pista» sin abortar. `pg_temp.inv30(línea)`: los problemas de INV-30 de los cambios de esa
// línea de venta («limpia» si no hay). `pg_temp.inv30_total()`: cuántas filas da INV-30 en toda la base. `pg_temp.fuente(sedes, desde,
// hasta)`: lo que da la fuente de metas, como «Persona@Sede:monto» (de hoy, todas las sedes, si no se dice otra cosa).
const PRELUDIO = `
create function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_hint text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
  return v_msg || ' :: ' || coalesce(nullif(v_hint, ''), '-');
end $f$;
create function pg_temp.inv30(p_item uuid) returns text language sql as $f$
  select coalesce(string_agg(x.problema, ',' order by x.problema), 'limpia')
    from (${INV30.sql}) x
   where x.cambio_id in (select c.id from retail.cambios c where c.venta_item_id = p_item);
$f$;
create function pg_temp.inv30_total() returns bigint language sql as $f$
  select count(*) from (${INV30.sql}) x;
$f$;
create function pg_temp.inv22(p_item uuid) returns text language sql as $f$
  select case when count(*) = 0 then 'limpia' else 'grita' end
    from (${INV22.sql}) x
   where x.cambio_id in (select c.id from retail.cambios c where c.venta_item_id = p_item);
$f$;
create function pg_temp.inv22_antes(p_item uuid) returns text language sql as $f$
  select case when count(*) = 0 then 'limpia' else 'grita' end
    from (${INV22_ANTES}) x
   where x.cambio_id in (select c.id from retail.cambios c where c.venta_item_id = p_item);
$f$;
create function pg_temp.inv22_total() returns bigint language sql as $f$
  select count(*) from (${INV22.sql}) x;
$f$;
create function pg_temp.fuente(p_ubics uuid[] default null, p_desde date default null, p_hasta date default null) returns text language sql as $f$
  select coalesce(string_agg(coalesce(p.nombres, 'nadie') || '@' || coalesce(u.nombre, '-') || ':' || f.monto, ' ' order by p.nombres, f.monto), 'nada')
    from retail.fn_diferencias_de_cambio(coalesce(p_desde, (now() at time zone 'America/Lima')::date),
                                         coalesce(p_hasta, (now() at time zone 'America/Lima')::date), p_ubics) f
    left join public.personas p on p.id = f.persona_id
    left join retail.ubicaciones u on u.id = f.ubicacion_id;
$f$;
create function pg_temp.fuente_de(p_persona uuid, p_ubics uuid[] default null) returns text language sql as $f$
  select coalesce(string_agg(coalesce(u.nombre, '-') || ':' || f.monto, ' ' order by f.monto), 'nada')
    from retail.fn_diferencias_de_cambio((now() at time zone 'America/Lima')::date, (now() at time zone 'America/Lima')::date, p_ubics) f
    left join retail.ubicaciones u on u.id = f.ubicacion_id
   where f.persona_id = p_persona;
$f$;
-- La base puede traer cambios con documentos de antes (una base local en la que alguien probó un cambio de verdad): sin soltarlos, el
-- corte ya estaría puesto y la fuente de hoy sumaría también los suyos. Dentro de esta transacción, que se deshace al terminar, se sueltan
-- sus documentos y sus notas por emitir: quedan como cambios de antes del corte, que ni el vigía ni la fuente miran.
update retail.comprobantes set cambio_id = null where cambio_id is not null;
delete from retail.cambio_notas;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as sandra from public.personas where auth_user_id = '22222222-2222-4222-8222-000000000005' \\gset
select id as micaela from public.personas where auth_user_id = '22222222-2222-4222-8222-000000000003' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 500.00, 'prueba automatizada') as caja_id \\gset
insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
  select :'ubic', 'nota_credito', 'BC01', 1
  where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_credito' and serie like 'B%' and archivada_at is null);
insert into retail.series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
  select :'ubic', 'nota_venta', 'NV91', 1
  where not exists (select 1 from retail.series_comprobantes where ubicacion_id = :'ubic' and tipo = 'nota_venta' and archivada_at is null);
select id as v_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v_l from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
select id as v_ves from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x, :'ubic', :'sub_piso', 'entrada', 50, 'colchón de prueba' from unnest(array[:'v_old', :'v_l', :'v_ves']::uuid[]) x;
select count(*) as _aplicados from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.ubicacion_id = :'ubic' and m.motivo = 'colchón de prueba' and m.created_at = now()) a \\gset
select retail.fn_precio_en_sede(:'v_old', :'ubic') as precio_old \\gset
select retail.fn_precio_en_sede(:'v_ves', :'ubic') as precio_ves \\gset
`;

/** La venta de partida, vendida por Sandra: una blusa con S/ 10 de descuento y, si se pide, una segunda línea (otra talla, sin descuento). */
const VENTA = (tipo) => `
select retail.registrar_venta(
  p_ubicacion_id => :'ubic',
  p_items => jsonb_build_array(
    jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', (:'precio_old')::numeric, 'descuento_unitario', 10, 'motivo_descuento', 'liquidacion_temporada'),
    jsonb_build_object('variante_id', :'v_l', 'cantidad', 1, 'precio_unitario', (:'precio_old')::numeric, 'descuento_unitario', 0)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 2 * (:'precio_old')::numeric - 10)),
  p_token => gen_random_uuid(),
  p_tipo_comprobante => '${tipo}',
  p_asesora_id => :'sandra') as venta_id \\gset
select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset
select id as venta_item2 from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_l' \\gset
select id as original from retail.comprobantes where venta_id = :'venta_id' \\gset
`;

const ACEPTAR = `update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where id = :'original';`;
/** Cambia la línea (1 o 2) por la variante; cada cambio con su token. */
const CAMBIAR = (variante, linea = "venta_item") =>
  `select pg_temp.intentar(format('select retail.registrar_cambio(%L, %L, %L, 1, %L, %L)', :'${linea}', :'ubic', :'${variante}', 'tarjeta', gen_random_uuid()));`;
const INV = (linea = "venta_item") => `select pg_temp.inv30(:'${linea}');`;
const DOC = (rol) => `(select n.id from retail.comprobantes n join retail.cambios c on c.id = n.cambio_id
   where c.venta_item_id = :'venta_item' and n.tipo ${rol === "nota" ? "=" : "<>"} 'nota_credito')`;
const REPLICA = "set local session_replication_role = replica;";
const ORIGEN = "set local session_replication_role = origin;";
const BARATA = "update retail.variantes set precio = 50 where id = :'v_ves';";
const PAGADO = "((:'precio_old')::numeric - 10)";
const DIF = `(select round(diferencia, 2) from retail.cambios where venta_item_id = :'venta_item')`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}
const lineas = (r) => (r.ok ? r.lineas : []);

// ===================== El vigía (INV-30) =====================

// 1 · lo sano
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${INV()}`);
  const r2 = correr(`${BARATA}\n${ACEPTAR}\n${CAMBIAR("v_ves")}\n${INV()}`);
  const r3 = correr(`${CAMBIAR("v_ves")}\n${INV()}\nselect count(*) from retail.cambio_notas cn join retail.cambios c on c.id = cn.cambio_id where c.venta_item_id = :'venta_item';`);
  const r4 = correr(`${CAMBIAR("v_ves")}\n${INV()}`, { venta: "nota_venta" });
  esperar("1 · INV-30 calla con lo sano: más cara con la original aceptada, más barata, la nota por emitir recién guardada y una nota de venta",
    [r, r2, r3, r4].every((x) => lineas(x)[0] === "ok" && lineas(x)[1] === "limpia") && lineas(r3)[2] === "1",
    [r, r2, r3, r4].map((x) => (x.ok ? x.lineas : x.mensaje)));
}

// 2 · sin comprobante nuevo vivo
{
  const r = correr(`${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set estado = 'no_emitido', motivo_no_emitido = 'prueba automatizada' where id = ${DOC("nuevo")};
${ORIGEN}\n${INV()}`);
  const l = lineas(r);
  esperar("2 · el comprobante nuevo liberado a mano: «sin_comprobante_nuevo»", l[0] === "ok" && l[1] === "sin_comprobante_nuevo", r.ok ? l : r.mensaje);
  // Con la original sin aceptar (la nota sigue por emitir): sin el plazo del rechazo, nada de INV-30 lo veía (par_roto pide un aceptado).
  const r2 = correr(`${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set estado = 'rechazado', entorno_transmision = 'sandbox', motivo_rechazo = 'prueba automatizada' where id = ${DOC("nuevo")};
${ORIGEN}\n${INV()}\n${REPLICA}
update retail.comprobantes set created_at = now() - interval '2 days' where id = ${DOC("nuevo")};
${ORIGEN}\n${INV()}
select count(*) from retail.cambio_notas cn join retail.cambios c on c.id = cn.cambio_id where c.venta_item_id = :'venta_item';`);
  const l2 = lineas(r2);
  esperar("    …uno RECHAZADO calla el día en que se emitió (se corrige y se reenvía) y grita al día siguiente, aunque su nota siga por emitir",
    l2[0] === "ok" && l2[1] === "limpia" && l2[2] === "sin_comprobante_nuevo" && l2[3] === "1", r2.ok ? l2 : r2.mensaje);
}

// 3 · la corrupción de la autoprueba de /chaos
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\nselect pg_temp.inv30_total();\n${CORROMPE}\nselect pg_temp.inv30_total();\n${INV()}`);
  const l = lineas(r);
  esperar("3 · la corrupción de /chaos (el comprobante nuevo cobra S/ 5 más) suma una violación: «nuevo_no_da_la_diferencia»",
    l[0] === "ok" && Number(l[2]) === Number(l[1]) + 1 && l[3] === "nuevo_no_da_la_diferencia", r.ok ? l : r.mensaje);
}

// 4 · la nota no es lo pagado (emitida, y por emitir)
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set total = total - 1, subtotal = subtotal - 1 where id = ${DOC("nota")};
${ORIGEN}\n${INV()}`);
  const r2 = correr(`${CAMBIAR("v_ves")}
update retail.cambio_notas set total = total + 1 where cambio_id = (select id from retail.cambios where venta_item_id = :'venta_item');
${INV()}`);
  esperar("4 · la nota emitida, o la que está por emitir, que no es lo pagado: «nota_no_es_lo_pagado»",
    lineas(r)[1] === "nota_no_es_lo_pagado" && lineas(r2)[1] === "nota_no_es_lo_pagado", [r.ok ? r.lineas : r.mensaje, r2.ok ? r2.lineas : r2.mensaje]);
}

// 5 · par roto
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where id = ${DOC("nuevo")};
update retail.comprobantes set estado = 'rechazado', entorno_transmision = 'sandbox', motivo_rechazo = 'prueba automatizada' where id = ${DOC("nota")};
${ORIGEN}\n${INV()}`);
  const r2 = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set estado = 'rechazado', entorno_transmision = 'sandbox', motivo_rechazo = 'prueba automatizada' where id = ${DOC("nuevo")};
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where id = ${DOC("nota")};
${ORIGEN}\n${INV()}`);
  const r3 = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where id in (${DOC("nuevo")}, ${DOC("nota")});
${ORIGEN}\n${INV()}`);
  esperar("5 · el comprobante nuevo aceptado y la nota rechazada, o al revés: «par_roto»; los dos aceptados: limpia",
    lineas(r)[1] === "par_roto" && lineas(r2)[1] === "par_roto" && lineas(r3)[1] === "limpia",
    [r, r2, r3].map((x) => (x.ok ? x.lineas : x.mensaje)));
}

// 5b · la nota del cambio ya emitida sobre una original que después quedó anulada (la carrera R3 de /chaos, 2026-11-16): ni
// «nota_se_quedo_por_emitir» (la nota existe) ni «par_roto» (mira el nuevo contra la nota) la veían.
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set estado = 'anulado', motivo_anulacion = 'prueba automatizada', anulado_at = now() where id = :'original';
${ORIGEN}\n${INV()}`);
  const r2 = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set anulacion_solicitada_at = now(), motivo_anulacion = 'prueba automatizada' where id = :'original';
${ORIGEN}\n${INV()}`);
  esperar("5b · la nota del cambio, emitida, sobre una original anulada o con la baja en trámite: «nota_sobre_original_muerta»",
    lineas(r)[1] === "nota_sobre_original_muerta" && lineas(r2)[1] === "nota_sobre_original_muerta",
    [r, r2].map((x) => (x.ok ? x.lineas : x.mensaje)));
}

// 6 · la nota por emitir
{
  const r = correr(`${CAMBIAR("v_ves")}\n${ACEPTAR}\n${INV()}
update retail.cambio_notas set created_at = now() - interval '2 days' where cambio_id = (select id from retail.cambios where venta_item_id = :'venta_item');
${INV()}
select retail.fn_emitir_notas_de_cambios_pendientes();
${INV()}`);
  const l = lineas(r);
  esperar("6 · la nota por emitir con la original recién aceptada calla; a los dos días grita «nota_se_quedo_por_emitir»; el barrido la emite y calla",
    l[0] === "ok" && l[1] === "limpia" && l[2] === "nota_se_quedo_por_emitir" && l[3] === "1" && l[4] === "limpia", r.ok ? l : r.mensaje);
  const r2 = correr(`${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set estado = 'no_emitido', motivo_no_emitido = 'prueba automatizada' where id = :'original';
${ORIGEN}\n${INV()}`);
  esperar("    …y si la original se liberó (ya no se puede aceptar), grita en el acto",
    lineas(r2)[1] === "nota_se_quedo_por_emitir", r2.ok ? r2.lineas : r2.mensaje);
}

// 7 · el corte (con la emisión vaciada: un cambio sin documentos antes y después del corte)
{
  const VACIA = `create or replace function retail.fn_documentos_del_cambio(p_cambio_id uuid, p_items_nuevo jsonb, p_total_nuevo numeric, p_cliente jsonb)
returns void language plpgsql as $m$ begin return; end $m$;`;
  const r = correr(`${ACEPTAR}\n${VACIA}\n${CAMBIAR("v_ves", "venta_item2")}\nselect retail.fn_cambios_con_documentos_desde() is null;\n${INV("venta_item2")}`);
  esperar("7 · sin ningún documento todavía no hay corte: el cambio sin documentos no se mira",
    lineas(r)[0] === "ok" && lineas(r)[1] === "t" && lineas(r)[2] === "limpia", r.ok ? r.lineas : r.mensaje);
  const r2 = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${VACIA}\n${CAMBIAR("v_ves", "venta_item2")}\n${INV("venta_item2")}
${REPLICA}
update retail.cambios set created_at = now() - interval '2 days' where venta_item_id = :'venta_item2';
${ORIGEN}
${INV("venta_item2")}`);
  esperar("    …con el corte puesto, un cambio de después sin documentos grita (sin comprobante nuevo y sin su nota); uno de antes del corte, no",
    lineas(r2)[0] === "ok" && lineas(r2)[1] === "ok" && lineas(r2)[2] === "falta_la_nota,sin_comprobante_nuevo" && lineas(r2)[3] === "limpia",
    r2.ok ? r2.lineas : r2.mensaje);
}

// 8 · venta de prueba
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\nupdate retail.comprobantes set total = total + 5 where id = ${DOC("nuevo")};\n${INV()}
update retail.ventas set es_prueba = true where id = :'venta_id';\n${INV()}`);
  esperar("8 · una venta de prueba no se mira, aunque su comprobante esté roto",
    lineas(r)[1] === "nuevo_no_da_la_diferencia" && lineas(r)[2] === "limpia", r.ok ? r.lineas : r.mensaje);
}

// 9 · MUTANTE: la emisión pierde la nota
{
  const r = correr(`${ACEPTAR}
create or replace function retail.fn_emitir_nota_del_cambio(p_cambio_id uuid) returns uuid language plpgsql
set search_path to 'retail', 'public', 'extensions' as $m$
begin delete from retail.cambio_notas where cambio_id = p_cambio_id; return null; end $m$;
${CAMBIAR("v_ves")}\n${INV()}`);
  esperar("9 · MUTANTE: si la nota se pierde al guardar el cambio, INV-30 grita «falta_la_nota»",
    lineas(r)[0] === "ok" && lineas(r)[1] === "falta_la_nota", r.ok ? r.lineas : r.mensaje);
}

// 10 · el vigía de producción
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${CORROMPE}
select sql = $q$${INV30.sql}$q$ and clave = array['cambio_id', 'problema']::text[] and activa and not requiere_sesion from retail.invariantes where id = 'INV-30';
do $c$ begin perform retail.fn_correr_invariantes(); end $c$;
select estado || '|' || (total >= 1) || '|' || coalesce(mensaje, '-') from retail.invariantes_corridas
 where invariante_id = 'INV-30' order by corrida_en desc, id desc limit 1;`);
  const l = lineas(r);
  esperar("10 · lo sembrado es la consulta del detector, y fn_correr_invariantes marca INV-30 «viola» con su clave (nunca «error»)",
    l[0] === "ok" && l[1] === "t" && l[2] === "viola|true|-", r.ok ? l : r.mensaje);
}

// 10b · la línea base: INV-30 como recién sembrada (línea base en null) y la parte 3 pegada encima; el día del riesgo que nombra el ADR
// (SUNAT acepta la boleta nueva y rechaza la nota 07) ya está roto cuando el vigía corre por primera vez.
{
  const PAR_ROTO = `${ACEPTAR}\n${CAMBIAR("v_ves")}\n${REPLICA}
update retail.comprobantes set estado = 'aceptado', entorno_transmision = 'sandbox' where id = ${DOC("nuevo")};
update retail.comprobantes set estado = 'rechazado', entorno_transmision = 'sandbox', motivo_rechazo = 'prueba automatizada' where id = ${DOC("nota")};
${ORIGEN}
update retail.invariantes set linea_base_en = null where id = 'INV-30';
\\o /dev/null
${PARTE3}
\\o`;
  const CORRER = `do $c$ begin perform retail.fn_correr_invariantes(); end $c$;
select estado || '|' || total || '|' || nuevas from retail.invariantes_corridas
 where invariante_id = 'INV-30' order by corrida_en desc, id desc limit 1;
select count(*) from retail.invariantes_conocidas where invariante_id = 'INV-30' and resuelta_en is null;`;
  const r = correr(`${PAR_ROTO}\n${CORRER}`);
  const r0 = correr(`${PAR_ROTO}\nupdate retail.invariantes set linea_base_en = null where id = 'INV-30';\n${CORRER}`);
  esperar("10b · INV-30 nace con su línea base: lo que ya está roto la primera vez que corre sale NUEVO (control: sin ella, quedaba heredado y callado)",
    lineas(r)[0] === "ok" && lineas(r)[1] === "viola|1|1" && lineas(r)[2] === "0"
      && lineas(r0)[0] === "ok" && lineas(r0)[1] === "viola|1|0" && lineas(r0)[2] === "1",
    [r.ok ? r.lineas : r.mensaje, r0.ok ? r0.lineas : r0.mensaje]);
}

// 10c · INV-22 y el mismo modelo (ADR-0655): la blusa M con S/ 10 de descuento por la L (mismo modelo: conserva el descuento) y un vestido.
// La lista del cambio guarda la L a precio de lista; la diferencia, a lo pagado. Y la línea 2 (sin descuento) por dos vestidos: otro modelo.
{
  const VARIAS = (linea, salidas) =>
    `select pg_temp.intentar(format('select retail.registrar_cambio_varias(%L, %L, %L::jsonb, 1, %L, %L)', :'${linea}', :'ubic', ${salidas}, 'tarjeta', gen_random_uuid()));`;
  const r = correr(`${ACEPTAR}
${VARIAS("venta_item", "jsonb_build_array(jsonb_build_object('variante_id', :'v_l', 'cantidad', 1), jsonb_build_object('variante_id', :'v_ves', 'cantidad', 1))")}
select pg_temp.inv22(:'venta_item');
select pg_temp.inv22_antes(:'venta_item');
${INV()}
${VARIAS("venta_item2", "jsonb_build_array(jsonb_build_object('variante_id', :'v_ves', 'cantidad', 2))")}
select pg_temp.inv22(:'venta_item2');
select pg_temp.inv22_total();
${CORROMPE22}
select pg_temp.inv22_total();`);
  const l = lineas(r);
  esperar("10c · INV-22 calla con un cambio por varias del mismo modelo que conserva su descuento (control: la consulta de antes gritaba; INV-30 lo cuadra), y su corrupción de /chaos se sigue viendo",
    l[0] === "ok" && l[1] === "limpia" && l[2] === "grita" && l[3] === "limpia" && l[4] === "ok" && l[5] === "limpia"
      && Number(l[7]) === Number(l[6]) + 1,
    r.ok ? l : r.mensaje);
}

// ===================== La fuente de las metas =====================

// 11 · más cara
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\nselect pg_temp.fuente();\nselect 'Felipe@Tienda Lima:' || ${DIF};`);
  const l = lineas(r);
  esperar("11 · más cara: la diferencia la suma quien atendió (Felipe), en la sede del cambio; Sandra no cambia",
    l[0] === "ok" && l[1] === l[2] && Number(l[2].split(":")[1]) > 0, r.ok ? l : r.mensaje);
}

// 12 · más barata (y 17 · su mutante)
const MAS_BARATA = `${BARATA}\n${ACEPTAR}\n${CAMBIAR("v_ves")}\nselect pg_temp.fuente();\nselect 'Sandra@Tienda Lima:' || ${DIF};`;
const bienRepartida = (r) => lineas(r)[0] === "ok" && lineas(r)[1] === lineas(r)[2] && Number((lineas(r)[2] ?? ":").split(":")[1]) < 0;
{
  const r = correr(MAS_BARATA);
  esperar("12 · más barata: se le resta a quien vendió (Sandra), en la sede de la venta", bienRepartida(r), r.ok ? r.lineas : r.mensaje);
}

// 13 · venta sin asesora. PROVISIONAL (pendiente de Felipe): Rendimiento, Metas y «Mis ventas» le cuentan una venta solo a su asesora, así
// que una sin asesora no se le sumó a nadie y su resta queda sin persona (cuenta para la sede). El Observatorio sí se la cuenta a quien la
// registró; si Felipe elige eso, cambia este caso.
{
  const r = correr(`${BARATA}\n${REPLICA}\nupdate retail.ventas set asesora_id = null, usuario_id = :'micaela' where id = :'venta_id';\n${ORIGEN}
${ACEPTAR}\n${CAMBIAR("v_ves")}\nselect pg_temp.fuente();\nselect 'nadie@Tienda Lima:' || ${DIF};`);
  const l = lineas(r);
  esperar("13 · una venta sin asesora: la resta queda sin persona, solo en la sede (nadie la sumó en las metas) · PROVISIONAL, pendiente de Felipe",
    l[0] === "ok" && l[1] === l[2] && Number(l[2].split(":")[1]) < 0, r.ok ? l : r.mensaje);
}

// 14 · el corte
{
  const VACIA = `create or replace function retail.fn_documentos_del_cambio(p_cambio_id uuid, p_items_nuevo jsonb, p_total_nuevo numeric, p_cliente jsonb)
returns void language plpgsql as $m$ begin return; end $m$;`;
  const r = correr(`${ACEPTAR}\n${VACIA}\n${CAMBIAR("v_ves")}\nselect pg_temp.fuente();`);
  esperar("14 · sin ningún documento todavía (sin corte), la fuente no da nada", lineas(r)[0] === "ok" && lineas(r)[1] === "nada", r.ok ? r.lineas : r.mensaje);
  const r2 = correr(`${ACEPTAR}\n${CAMBIAR("v_ves", "venta_item2")}\n${REPLICA}
update retail.cambios set created_at = now() - interval '1 hour' where venta_item_id = :'venta_item2';
${ORIGEN}\n${CAMBIAR("v_ves")}
update retail.comprobantes set cambio_id = null where cambio_id = (select id from retail.cambios where venta_item_id = :'venta_item2');
select pg_temp.fuente();\nselect 'Felipe@Tienda Lima:' || ${DIF};`);
  esperar("    …y un cambio de antes del corte (el primer documento) no cuenta: solo el de después",
    lineas(r2)[0] === "ok" && lineas(r2)[1] === "ok" && lineas(r2)[2] === lineas(r2)[3], r2.ok ? r2.lineas : r2.mensaje);
}

// 15 · los filtros
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}
select pg_temp.fuente(array[:'trujillo']::uuid[]);
select pg_temp.fuente(array[:'ubic']::uuid[]) <> 'nada';
select pg_temp.fuente(null, (now() at time zone 'America/Lima')::date + 1, (now() at time zone 'America/Lima')::date + 1);
select pg_temp.fuente(null, (now() at time zone 'America/Lima')::date - 1, (now() at time zone 'America/Lima')::date - 1);`);
  const l = lineas(r);
  esperar("15 · otra sede u otro día: nada; la sede del cambio: su fila",
    l[0] === "ok" && l[1] === "nada" && l[2] === "t" && l[3] === "nada" && l[4] === "nada", r.ok ? l : r.mensaje);
}

// 15b y 16 · el cambio armado a mano. El historial de movimientos no se edita (ni con los disparadores apagados), así que la venta y su
// cambio se arman a mano (como en pruebas:claure-cambios): una venta de Sandra y su cambio, atendido por Micaela en Tienda Lima, cada salida
// con su dueño y, si se pide, su comprobante nuevo con lo cobrado. Un cambio sano de verdad, antes, pone el corte (a Felipe: no se mezcla
// con lo que se mide). Dice «Sandra / Micaela» con lo que la fuente le da a cada una, «sede:monto».
//   vieja: el dueño de lo devuelto · lista y pagado: su precio y lo que se pagó por ella · sedeVenta: dónde se vendió (variable de psql)
//   salidas: [{ v, dueno, lista, cobrado }] (una sola: uno por uno; más: por varias, con su precio de lista en `cambio_salidas`)
//   comprobante: si lleva el comprobante nuevo (lo cobrado de cada salida) · claure: si Tienda Lima opera con CLAURE · extra: más selects
const ID = (n) => `'00000000-0000-4000-8000-00000000c${n}'`;
const n2 = (x) => x.toFixed(2);
const ESCENA = ({ vieja = CAYLA, lista = 100, pagado = lista, sedeVenta = "ubic", salidas, comprobante = true, claure = true, extra = "" }) => {
  const total = salidas.reduce((t, s) => t + s.cobrado, 0);
  const dif = Math.round((total - pagado) * 100) / 100;
  const items = salidas
    .map((s) => `jsonb_build_object('variante_id', :'${s.v}', 'cantidad', 1, 'precio_unitario', ${n2(s.lista ?? s.cobrado)}, 'descuento_unitario', ${n2((s.lista ?? s.cobrado) - s.cobrado)})`)
    .join(", ");
  return `${ACEPTAR}\n${CAMBIAR("v_ves")}
${claure ? `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select '${CAYLA}', u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values ('${CLAURE}', :'ubic') on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';` : ""}
${REPLICA}
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, caja_id, asesora_id, usuario_id)
  values (${ID("0a1")}, :'${sedeVenta}', now(), 'completada', false, :'caja_id', :'sandra', :'sandra');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario, motivo_descuento)
  values (${ID("0b1")}, ${ID("0a1")}, :'v_old', 1, ${n2(lista)}, ${n2(lista - pagado)}, 10, ${lista > pagado ? "'liquidacion_temporada'" : "null"});
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, venta_item_id, empresa_id)
  values (:'v_old', :'${sedeVenta}', 'salida', 1, 'venta', ${ID("0b1")}, '${vieja}');
insert into retail.cambios (id, venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, usuario_id, motivo, condicion)
  values (${ID("0c1")}, ${ID("0b1")}, :'ubic', :'${salidas[0].v}', 1, ${n2(dif)}, 'tarjeta', :'micaela', 'otro', 'vendible');
${salidas
  .map(
    (s) => `insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, cambio_id, empresa_id)
  values (:'${s.v}', :'ubic', 'salida', 1, 'cambio', ${ID("0c1")}, '${s.dueno}');${
      salidas.length > 1
        ? `\ninsert into retail.cambio_salidas (cambio_id, variante_id, cantidad, precio_unitario) values (${ID("0c1")}, :'${s.v}', 1, ${n2(s.lista ?? s.cobrado)});`
        : ""
    }`,
  )
  .join("\n")}
${comprobante && dif !== 0 ? `insert into retail.comprobantes (ubicacion_id, tipo, serie, numero, subtotal, igv, total, estado, items, cambio_id)
  values (:'ubic', 'boleta', 'BZ99', 1, round(${n2(total)} / 1.18, 2), ${n2(total)} - round(${n2(total)} / 1.18, 2), ${n2(total)}, 'pendiente', jsonb_build_array(${items}), ${ID("0c1")});` : ""}
${ORIGEN}
select pg_temp.fuente_de(:'sandra') || ' / ' || pg_temp.fuente_de(:'micaela');${extra}`;
};
const lineaDe = (r) => (r.ok ? r.lineas : r.mensaje);

// 15b · la sede: vendida en Trujillo y cambiada en Lima (sin CLAURE). Lo de más es de quien atendió, en Lima; lo de menos se le resta a la
// asesora en Trujillo, donde contó su venta. Y el filtro de sedes ve a cada uno solo en la suya.
{
  const FILTROS = `
select pg_temp.fuente_de(:'micaela', array[:'trujillo']::uuid[]) || ' / ' || pg_temp.fuente_de(:'sandra', array[:'ubic']::uuid[]);
select pg_temp.fuente_de(:'micaela', array[:'ubic']::uuid[]) || ' / ' || pg_temp.fuente_de(:'sandra', array[:'trujillo']::uuid[]);`;
  const r = correr(ESCENA({ sedeVenta: "trujillo", salidas: [{ v: "v_ves", dueno: CAYLA, cobrado: 120 }], claure: false, extra: FILTROS }));
  const r2 = correr(ESCENA({ sedeVenta: "trujillo", salidas: [{ v: "v_ves", dueno: CAYLA, cobrado: 80 }], claure: false, extra: FILTROS }));
  esperar("15b · vendida en Trujillo y cambiada en Lima: lo de más a quien atendió, en Lima; lo de menos a la asesora, en Trujillo; cada filtro ve lo suyo",
    lineaDe(r)[0] === "ok" && lineaDe(r)[1] === "nada / Tienda Lima:20.00" && lineaDe(r)[2] === "nada / nada" && lineaDe(r)[3] === "Tienda Lima:20.00 / nada"
      && lineaDe(r2)[0] === "ok" && lineaDe(r2)[1] === "Tienda Trujillo:-20.00 / nada" && lineaDe(r2)[2] === "nada / nada"
      && lineaDe(r2)[3] === "nada / Tienda Trujillo:-20.00",
    [lineaDe(r), lineaDe(r2)]);
}

// 16 · CLAURE en Lima. PROVISIONAL (pendiente de Felipe): la decisión 7 no contempla dos dueños. La fuente cuenta la diferencia solo en lo
// que movió de la cifra de CAYLA, nunca más que la diferencia ni en su contra, y sin diferencia nada (decisión 1). Si Felipe elige otra
// regla (por ejemplo, que la plata siga a la prenda también en las metas, ADR-0560 decisión 4), cambian estos casos.
{
  const casos = [
    ["sin CLAURE, de CAYLA por una de CAYLA de S/ 120 (+20): la suma quien atendió", { salidas: [{ v: "v_ves", dueno: CAYLA, cobrado: 120 }], claure: false }, "nada / Tienda Lima:20.00"],
    ["de CAYLA por una de CLAURE de S/ 120 (+20): lo de más es de CLAURE y la venta original no se toca", { salidas: [{ v: "v_ves", dueno: CLAURE, cobrado: 120 }] }, "nada / nada"],
    ["de CAYLA por una de CLAURE de S/ 80 (−20): se le resta a la asesora la diferencia, no la venta", { salidas: [{ v: "v_ves", dueno: CLAURE, cobrado: 80 }] }, "Tienda Lima:-20.00 / nada"],
    ["de CAYLA por una de CLAURE del mismo precio (sin diferencia): nada", { salidas: [{ v: "v_ves", dueno: CLAURE, cobrado: 100 }] }, "nada / nada"],
    ["de CLAURE por otra de CLAURE de S/ 120 (+20): nada", { vieja: CLAURE, salidas: [{ v: "v_ves", dueno: CLAURE, cobrado: 120 }] }, "nada / nada"],
    ["de CLAURE por una de CAYLA de S/ 120 (+20): la suma quien atendió", { vieja: CLAURE, salidas: [{ v: "v_ves", dueno: CAYLA, cobrado: 120 }] }, "nada / Tienda Lima:20.00"],
    ["de CLAURE por una de CAYLA de S/ 80 (−20): nada (esa venta nunca se le contó a la asesora)", { vieja: CLAURE, salidas: [{ v: "v_ves", dueno: CAYLA, cobrado: 80 }] }, "nada / nada"],
  ];
  casos.forEach(([nombre, escena, espera], i) => {
    const r = correr(ESCENA(escena));
    esperar(`${i === 0 ? "16 · CLAURE en Lima (PROVISIONAL, pendiente de Felipe): " : "    …"}${nombre}`,
      lineaDe(r)[0] === "ok" && lineaDe(r)[1] === espera, lineaDe(r));
  });
  // La blusa con S/ 10 de descuento por la otra talla (mismo modelo, de CAYLA: conserva el descuento, ADR-0655) y un vestido de CLAURE.
  // Lo de CAYLA no se movió (69.90 por 69.90): nada. Valorado a precio de lista (sin el comprobante, como antes), salía +6.53.
  const MISMO_MODELO = {
    lista: 79.9, pagado: 69.9,
    salidas: [{ v: "v_l", dueno: CAYLA, lista: 79.9, cobrado: 69.9 }, { v: "v_ves", dueno: CLAURE, cobrado: 149.9 }],
  };
  const r = correr(ESCENA(MISMO_MODELO));
  const r0 = correr(ESCENA({ ...MISMO_MODELO, comprobante: false }));
  esperar("    …por varias, la otra talla de CAYLA con su descuento y un vestido de CLAURE: nada, valorado con lo cobrado (control: a precio de lista salía algo)",
    lineaDe(r)[0] === "ok" && lineaDe(r)[1] === "nada / nada" && lineaDe(r0)[0] === "ok" && lineaDe(r0)[1] !== "nada / nada",
    [lineaDe(r), lineaDe(r0)]);
}

// 17 · MUTANTE de la fuente: todo a quien atendió
{
  const MUTANTE = `\\o /dev/null
create or replace function retail.fn_diferencias_de_cambio(p_desde date, p_hasta date, p_ubics uuid[])
returns table(persona_id uuid, ubicacion_id uuid, dia date, monto numeric) language sql stable as $m$
  select c.usuario_id, c.ubicacion_id, (c.created_at at time zone 'America/Lima')::date, sum(c.diferencia)
    from retail.cambios c
   where c.created_at >= retail.fn_cambios_con_documentos_desde() and c.diferencia <> 0
     and (c.created_at at time zone 'America/Lima')::date between p_desde and p_hasta
   group by 1, 2, 3
$m$;
\\o
`;
  const r = correr(MAS_BARATA, { antes: `${MIGRACION}${MUTANTE}` });
  esperar("17 · MUTANTE: si la fuente le diera todo a quien atendió, el caso 12 lo ve", r.ok && !bienRepartida(r), r.ok ? r.lineas : r.mensaje);
}

// 18 · interna
{
  const r = correr(`grant execute on function pg_temp.intentar(text) to authenticated;
set local role authenticated;
select pg_temp.intentar('select * from retail.fn_diferencias_de_cambio(current_date, current_date, null)');`);
  esperar("18 · la fuente no la llama una cuenta: es interna (la leen los lectores de metas)",
    /permission denied|permiso denegado/.test(lineas(r)[0] ?? ""), r.ok ? r.lineas : r.mensaje);
}

// 19 · pegar dos veces
{
  const r = correr(`${ACEPTAR}\n${CAMBIAR("v_ves")}\n${INV()}\nselect pg_temp.fuente() <> 'nada';
select count(*) || '|' || bool_and(linea_base_en is not null) from retail.invariantes where id = 'INV-30';`,
    { antes: `${MIGRACION}\\o /dev/null\n${PARTE3}\n${PARTE3}\n\\o\n` });
  esperar("19 · la parte 3 se puede pegar dos veces: INV-30 una sola vez y con su línea base, y todo sigue igual",
    lineas(r)[0] === "ok" && lineas(r)[1] === "limpia" && lineas(r)[2] === "t" && lineas(r)[3] === "1|true", r.ok ? r.lineas : r.mensaje);
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} caso(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
