#!/usr/bin/env node
/**
 * Prueba de `20261026160000_corregir_costo_de_compra.sql`: corregir el costo de la ÚLTIMA compra de una prenda (ADR-0515).
 *
 * QUÉ CUBRE
 *   · solo un líder corrige (sin sesión: `costo_no_es_lider`), con un costo entre 0.01 y 5000 y un motivo de 3 a 300 letras;
 *   · solo la ÚLTIMA compra: una anterior falla con `costo_no_es_la_ultima`; el costo de un cierre del Taller, con `costo_del_taller`;
 *   · una variante que llegó dos veces en la misma compra (dos facturas) encadena: el costo anterior de su segunda línea es lo que
 *     dejó la primera ya corregida, con la misma fórmula de `fn_recalcular_costo_variante`;
 *   · `variantes.costo` pasa a ser lo que dejó la última línea corregida de cada variante, y las demás variantes no se tocan;
 *   · `costo_historial` queda IDÉNTICO (misma huella antes y después) y la corrección queda en `costo_correcciones`, que no se edita
 *     ni se borra; las ventas ya hechas no cambian;
 *   · `fn_costo_de_la_prenda` usa el costo corregido en la compra y trae la corrección (antes, después, motivo, quién);
 *   · una segunda corrección parte de la primera; el mismo costo otra vez cae en `costo_sin_cambios` (un doble clic);
 *   · si el costo de una variante no es el que dejó su última compra, no se pisa (`costo_desalineado`);
 *   · la vista previa dice lo mismo que quedó al guardar (`previsualizar_correccion_de_costo`);
 *   · la corrección deja su línea en Actividad, sin montos.
 *
 * CÓMO. Una transacción con ROLLBACK. Toma una prenda con dos variantes sin compras con costo, deja su stock en cero antes de 2030 y
 * escribe las compras en 2030 directo en `movimientos` y `costo_historial` (como superusuario), con las cifras que habría dejado
 * `fn_recalcular_costo_variante`. Lo que se mide es la corrección.
 *
 * USO
 *   node scripts/pruebas/costo_corregir_compra.mjs    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const ESCENARIO = `
begin;
-- Corre una sentencia y devuelve 'ok' o el mensaje del error (un error dentro de la transacción no la aborta).
create function pg_temp.intentar(sentencia text) returns text language plpgsql as $f$
begin
  execute sentencia;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$f$;
-- La huella de costo_historial: no debe cambiar nunca.
create function pg_temp.huella(p uuid) returns text language sql as $f$
  select md5(coalesce(string_agg(ch.id::text || ch.costo_anterior || ch.costo_unitario_nuevo || ch.costo_resultante || ch.stock_previo,
                                 ',' order by ch.id), ''))
    from retail.costo_historial ch join retail.variantes v on v.id = ch.variante_id where v.producto_id = p
$f$;

select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
-- Una prenda con dos variantes y sin compras con costo.
-- La prenda de la prueba se crea aquí (dos variantes, sin compras): no depende de lo que dejen otras pruebas en la base.
with p as (
  insert into retail.productos (categoria_id, referencia, descripcion)
  select id, 'Prueba costo ' || substr(gen_random_uuid()::text, 1, 8), 'prenda propia de la prueba' from retail.categorias order by nombre limit 1
  returning id)
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, (select codigo from retail.colores where activo order by codigo limit 1), t.id, 'PRUEBA-COSTO-' || substr(gen_random_uuid()::text, 1, 8), 59.90, 18
  from p cross join (select id from retail.tallas where activo and estado = 'aprobado' order by valor limit 2) t;
select producto_id as p1 from retail.variantes where sku like 'PRUEBA-COSTO-%' order by created_at desc limit 1 \\gset
select id as v1 from retail.variantes where producto_id = :'p1' order by sku limit 1 \\gset
select id as v2 from retail.variantes where producto_id = :'p1' order by sku offset 1 limit 1 \\gset
update retail.variantes set costo = 18 where producto_id = :'p1';
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
select v.id, :'tru', 'ajuste', -n.neto, 'prueba', '2029-12-31'
  from retail.variantes v
  cross join lateral (select coalesce(sum(case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad
                                               when 'ajuste' then m.cantidad else 0 end), 0) as neto
                        from retail.movimientos m where m.variante_id = v.id) n
 where v.producto_id = :'p1' and n.neto <> 0;
-- Ni una venta de antes: el stock de las dos variantes arranca en cero a propósito.

-- 12 prendas de v1 que ya estaban (carga inicial, sin costo_historial).
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values (:'v1', :'tru', 'entrada', 12, 'prueba', '2030-09-12');

-- ① 5 oct: llegan 30 de v1 a 18.00 (había 12 a 18.00).
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v1', :'tru', 'entrada', 30, 'prueba', '2030-10-05') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v1', 12, 18, 30, 18, 18, 'compra', id, '2030-10-05' from m;
delete from retail.stock where variante_id in (:'v1', :'v2');
insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'v1', :'tru', 42);

-- Se venden 20 de v1.
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values (:'v1', :'tru', 'salida', 20, 'prueba', '2030-10-10');
update retail.stock set cantidad = 22 where variante_id = :'v1' and ubicacion_id = :'tru';

-- ② 14 oct: llegan 40 de v2 a 20.50 (de v2 no había ninguna). v2.costo queda en 20.50.
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v2', :'tru', 'entrada', 40, 'prueba', '2030-10-14') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v2', 0, 18, 40, 20.50, 20.50, 'compra', id, '2030-10-14' from m;
insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'v2', :'tru', 40);
update retail.variantes set costo = 20.50 where id = :'v2';

-- ③ 22 oct: v1 llega dos veces en la misma compra: 10 a 19.00 y 14 a 20.00 (había 22 a 18.00). v1.costo queda en 18.82.
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v1', :'tru', 'entrada', 10, 'prueba', '2030-10-22') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v1', 22, 18, 10, 19, 18.31, 'compra', id, '2030-10-22' from m;
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v1', :'tru', 'entrada', 14, 'prueba', '2030-10-22') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v1', 32, 18.31, 14, 20, 18.82, 'compra', id, '2030-10-22' from m;
update retail.stock set cantidad = 46 where variante_id = :'v1' and ubicacion_id = :'tru';
update retail.variantes set costo = 18.82 where id = :'v1';

select max(ch.created_at) as ult from retail.costo_historial ch join retail.variantes v on v.id = ch.variante_id where v.producto_id = :'p1' \\gset
select min(ch.created_at) as primera from retail.costo_historial ch join retail.variantes v on v.id = ch.variante_id where v.producto_id = :'p1' \\gset
select pg_temp.huella(:'p1') as huella_antes \\gset

-- Corre una sentencia COMO LA WEB (rol authenticated) y devuelve su resultado o el mensaje del error.
create function pg_temp.web(sentencia text) returns text language plpgsql as $f$
declare r text; d text;
begin
  set local role authenticated;
  execute sentencia into r;
  reset role;
  return r;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  reset role;
  -- El mensaje, y su detalle (JSON) si lo trae: así se ve lo que lee la web.
  return sqlerrm || case when d is not null and d <> '' then '#' || d else '' end;
end;
$f$;

-- Sin sesión: nadie corrige.
select 'sin_sesion|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,19.5,%L)::text', :'p1', :'ult', 'precio mal tecleado'));

set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';

-- Pedidos que no valen.
select 'costo_cero|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,0,%L)::text', :'p1', :'ult', 'precio mal tecleado'));
select 'costo_enorme|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,5000.01,%L)::text', :'p1', :'ult', 'precio mal tecleado'));
select 'motivo_corto|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,19.5,%L)::text', :'p1', :'ult', 'ab'));
select 'no_es_la_ultima|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,19.5,%L)::text', :'p1', :'primera', 'precio mal tecleado'));
select 'otra_fecha|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,19.5,%L)::text', :'p1', '2031-01-01', 'precio mal tecleado'));

-- Un costo fuera de lo normal (ADR-0298) pide confirmación, como en Recibir y en el Taller: sin ella no se escribe nada.
savepoint banda;
select 'atipico_sin_confirmar|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,1950,%L)::text', :'p1', :'ult', 'un cero de más'));
select 'atipico_nada_escrito|' || (select count(*) from retail.costo_correcciones where producto_id = :'p1') || '|' || (select costo from retail.variantes where id = :'v1');
select 'atipico_confirmado|' || left(pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,1950,%L,true)::text', :'p1', :'ult', 'un cero de más')), 20);
select 'atipico_marca|' || (select string_agg(distinct costo_atipico_confirmado::text, ',') from retail.costo_correcciones where producto_id = :'p1');
rollback to banda;
select 'normal_marca|' || left(pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,19.5,%L)::text', :'p1', :'ult', 'precio mal tecleado')), 20);
select 'normal_sin_marca|' || (select string_agg(distinct costo_atipico_confirmado::text, ',') from retail.costo_correcciones where producto_id = :'p1');
rollback to banda;

-- Lo que pasaría: la vista previa.
select 'previa|' || coalesce(pg_temp.web(format('select retail.previsualizar_correccion_de_costo(%L,%L,19.50)::text', :'p1', :'ult')), 'null');
select 'previa_no_ultima|' || coalesce(pg_temp.web(format('select retail.previsualizar_correccion_de_costo(%L,%L,19.50)::text', :'p1', :'primera')), 'null');

-- Corregir ③: lo que llegó en la compra costaba 19.50 en las dos líneas (no 19.00 y 20.00).
select 'corregir|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,19.50,%L)::text', :'p1', :'ult', 'precio mal tecleado'));
select 'v1_costo|' || costo from retail.variantes where id = :'v1';
select 'v2_costo|' || costo from retail.variantes where id = :'v2';
select 'huella_despues|' || (pg_temp.huella(:'p1') = :'huella_antes');
select 'lineas|' || (select jsonb_agg(jsonb_build_object('stock', stock_previo, 'cant', cantidad, 'u_antes', costo_unitario_antes, 'u_despues', costo_unitario_despues, 'ant', costo_anterior_despues, 'res_antes', costo_resultante_antes, 'res', costo_resultante_despues) order by stock_previo)::text from retail.costo_correcciones where producto_id = :'p1');
select 'tabla|' || pg_temp.web(format('select retail.fn_costo_de_la_prenda(%L)::text', :'p1'));
select 'actividad|' || coalesce((select descripcion from retail.actividad where modulo = 'productos' and accion = 'costo_corregido' and registro_id = :'p1' order by ocurrio_at desc limit 1), 'null');

-- El mismo costo otra vez (doble clic).
select 'doble_clic|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,19.5,%L)::text', :'p1', :'ult', 'precio mal tecleado'));
-- Una segunda corrección parte de la primera.
select 'segunda|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,18.50,%L)::text', :'p1', :'ult', 'era 18.50'));
select 'v1_costo2|' || costo from retail.variantes where id = :'v1';
select 'correcciones2|' || (pg_temp.web(format('select (retail.fn_costo_de_la_prenda(%L) -> %L)::text', :'p1', 'correcciones')));

-- Solo se agrega.
select 'inmutable_update|' || pg_temp.intentar(format('update retail.costo_correcciones set motivo = %L where producto_id = %L', 'x', :'p1'));
select 'inmutable_delete|' || pg_temp.intentar(format('delete from retail.costo_correcciones where producto_id = %L', :'p1'));
select 'historial_update|' || pg_temp.intentar(format('update retail.costo_historial set costo_resultante = 1 where variante_id = %L', :'v1'));
-- La web no lee la tabla ni llama a las funciones auxiliares.
select 'tabla_directa|' || pg_temp.web('select count(*)::text from retail.costo_correcciones');
select 'helper_directo|' || pg_temp.web(format('select count(*)::text from retail.fn_costo_historial_efectivo(%L)', :'p1'));
select 'calculo_directo|' || pg_temp.web(format('select count(*)::text from retail.fn_costo_correccion_calculo(%L,%L,5)', :'p1', :'ult'));
select 'corregible_directo|' || pg_temp.web(format('select retail.fn_costo_compra_corregible(%L,%L)', :'p1', :'ult'));

-- Un costo que ya no es el de su última compra no se pisa.
select costo as v1_ok from retail.variantes where id = :'v1' \\gset
update retail.variantes set costo = 9 where id = :'v1';
select 'desalineado|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,17,%L)::text', :'p1', :'ult', 'precio mal tecleado'));
update retail.variantes set costo = :'v1_ok' where id = :'v1';

-- Un cierre del Taller no se corrige.
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v2', :'tru', 'entrada', 5, 'prueba', '2030-10-25') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v2', 40, 20.5, 5, 22, 20.67, 'produccion', id, '2030-10-25' from m;
update retail.variantes set costo = 20.67 where id = :'v2';
select max(ch.created_at) as ult2 from retail.costo_historial ch join retail.variantes v on v.id = ch.variante_id where v.producto_id = :'p1' \\gset
select 'taller|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,17,%L)::text', :'p1', :'ult2', 'precio mal tecleado'));
select 'ya_no_es_la_ultima|' || pg_temp.web(format('select retail.corregir_costo_de_compra(%L,%L,17,%L)::text', :'p1', :'ult', 'precio mal tecleado'));
select 'previa_taller|' || coalesce(pg_temp.web(format('select retail.previsualizar_correccion_de_costo(%L,%L,17)::text', :'p1', :'ult2')), 'null');
rollback;
`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}

let salida = "";
try {
  salida = psql(ESCENARIO);
} catch (e) {
  console.log(`✗ el escenario no corrió\n    ${e.stderr ?? e.message}`);
  process.exit(1);
}
const linea = (clave) => salida.split("\n").find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1) ?? "";
const json = (clave) => JSON.parse(linea(clave) || "null");
const redondeo = (n) => Math.round(n * 100) / 100;

// La cuenta de `fn_recalcular_costo_variante`, para comparar con lo que guardó la corrección.
const sube = (stock, anterior, cant, costo) => (stock === 0 ? costo : redondeo((stock * anterior + cant * costo) / (stock + cant)));
const l1 = sube(22, 18, 10, 19.5); // 18.47
const l2 = sube(32, l1, 14, 19.5); // la segunda línea parte de lo que dejó la primera ya corregida
const m1 = sube(22, 18, 10, 18.5);
const m2 = sube(32, m1, 14, 18.5);

esperar("sin sesión nadie corrige", linea("sin_sesion") === "costo_no_es_lider", linea("sin_sesion"));
esperar("un costo de cero no vale", linea("costo_cero") === "costo_invalido", linea("costo_cero"));
esperar("un costo de más de S/ 5000 no vale", linea("costo_enorme") === "costo_invalido", linea("costo_enorme"));
esperar("el motivo de 2 letras no vale", linea("motivo_corto") === "costo_motivo", linea("motivo_corto"));
esperar("una compra que no es la última no se corrige", linea("no_es_la_ultima") === "costo_no_es_la_ultima", linea("no_es_la_ultima"));
esperar("una fecha que no es de ninguna compra tampoco", linea("otra_fecha") === "costo_no_es_la_ultima", linea("otra_fecha"));

const previa = json("previa");
const atipico = linea("atipico_sin_confirmar").split("#");
const detalleAtipico = (() => { try { return JSON.parse(atipico[1] ?? "null"); } catch { return null; } })();
esperar("un costo fuera de lo normal pide confirmar (`costo_atipico` con el dato en JSON, como en Recibir)",
  atipico[0] === "costo_atipico" && Array.isArray(detalleAtipico?.items) && detalleAtipico.items.length >= 1 && ["sube", "mayor_que_precio"].includes(detalleAtipico.items[0].motivo)
  && detalleAtipico.items.every((i) => i.costo_unitario === 1950 && i.costo_vigente > 0 && i.precio > 0), atipico);
esperar("…y sin la confirmación no se escribe nada", linea("atipico_nada_escrito").startsWith("0|"), linea("atipico_nada_escrito"));
esperar("con la confirmación se guarda y queda anotado que se confirmó", /^\{/.test(linea("atipico_confirmado")) && linea("atipico_marca") === "true", [linea("atipico_confirmado"), linea("atipico_marca")]);
esperar("un costo normal no pide nada y no lleva la marca", /^\{/.test(linea("normal_marca")) && linea("normal_sin_marca") === "false", [linea("normal_marca"), linea("normal_sin_marca")]);

esperar("la vista previa dice cuánto llegó y a cuánto costaba (24 prendas a 19.50)", previa && previa.llegaron === 24 && previa.costo_llegaron_despues === 19.5, previa);
esperar("la vista previa de una compra que no es la última es null", linea("previa_no_ultima") === "null", linea("previa_no_ultima"));

const corregir = json("corregir");
esperar("corregir devuelve cuántas líneas y el costo de lo que llegó antes y después",
  corregir && corregir.lineas === 2 && corregir.variantes === 1 && corregir.costo_llegaron_antes === 19.58 && corregir.costo_llegaron_despues === 19.5, corregir);
esperar("la variante que llegó dos veces encadena: 22 a 18 + 10 a 19.50, y la segunda línea parte de esa", Number(linea("v1_costo")) === l2, [linea("v1_costo"), l2]);
esperar("las demás variantes no se tocan", Number(linea("v2_costo")) === 20.5, linea("v2_costo"));
esperar("la vista previa dijo lo mismo que quedó al guardar",
  previa && corregir && previa.hoy_despues === corregir.hoy_despues && previa.hoy_antes === corregir.hoy_antes, [previa, corregir]);
esperar("costo_historial queda idéntico (misma huella)", linea("huella_despues") === "true", linea("huella_despues"));

const lineas = json("lineas") ?? [];
esperar("cada fila corregida guarda su antes, su después y lo que dejó",
  lineas.length === 2 && lineas[0].u_antes === 19 && lineas[0].u_despues === 19.5 && lineas[0].res_antes === 18.31 && lineas[0].res === l1
  && lineas[1].u_antes === 20 && lineas[1].ant === l1 && lineas[1].res === l2, lineas);

const tabla = json("tabla");
const compras = (tabla?.compras ?? []).filter((c) => c.fecha >= "2030");
const ultima = compras.at(-1);
esperar("fn_costo_de_la_prenda usa el costo corregido: 24 a 19.50", ultima && ultima.llegaron === 24 && ultima.costo_llegaron === 19.5, ultima);
esperar("…y la compra queda en lo que dejó la cuenta corregida (la prenda mezcla las dos variantes)",
  ultima && Math.abs(ultima.costo_despues - redondeo((l2 * 46 + 20.5 * 40) / 86)) <= 0.01, [ultima, l2]);
esperar("la corrección sale con su antes, su después, el motivo y la compra a la que pertenece",
  tabla?.correcciones?.length === 1 && tabla.correcciones[0].antes === 19.58 && tabla.correcciones[0].despues === 19.5
  && tabla.correcciones[0].motivo === "precio mal tecleado" && tabla.correcciones[0].compra === ultima?.fecha && tabla.puede_corregir === true,
  tabla?.correcciones);
esperar("deja su línea en Actividad, con 1 variante (las dos líneas son de la misma) y sin montos", /corrigió el costo de la última compra de «.+» \(1 variante\)/.test(linea("actividad")) && !/\d\.\d\d/.test(linea("actividad")) && !/S\//.test(linea("actividad")), linea("actividad"));

esperar("el mismo costo otra vez (doble clic) cae en costo_sin_cambios", linea("doble_clic") === "costo_sin_cambios", linea("doble_clic"));
const segunda = json("segunda");
esperar("una segunda corrección parte de la primera", segunda && segunda.costo_llegaron_antes === 19.5 && segunda.costo_llegaron_despues === 18.5, segunda);
esperar("y recalcula la variante desde el costo de antes de la compra", Number(linea("v1_costo2")) === m2, [linea("v1_costo2"), m2]);
esperar("las dos correcciones quedan, la más nueva al final", json("correcciones2")?.length === 2, json("correcciones2"));

esperar("costo_correcciones no se edita", /solo se agrega/.test(linea("inmutable_update")), linea("inmutable_update"));
esperar("costo_correcciones no se borra", /solo se agrega/.test(linea("inmutable_delete")), linea("inmutable_delete"));
esperar("costo_historial sigue siendo de solo lectura", /solo lectura/.test(linea("historial_update")), linea("historial_update"));
esperar("la tabla no se lee directo", /permission denied/.test(linea("tabla_directa")), linea("tabla_directa"));
esperar("las funciones auxiliares no las llama la web: solo las `security definer`",
  ["helper_directo", "calculo_directo", "corregible_directo"].every((k) => /permission denied/.test(linea(k))), ["helper_directo", "calculo_directo", "corregible_directo"].map(linea));

esperar("un costo que no es el de su última compra no se pisa", linea("desalineado") === "costo_desalineado", linea("desalineado"));
esperar("el costo de un cierre del Taller no se corrige", linea("taller") === "costo_del_taller", linea("taller"));
esperar("y la compra de antes ya no es la última", linea("ya_no_es_la_ultima") === "costo_no_es_la_ultima", linea("ya_no_es_la_ultima"));
esperar("la vista previa de un cierre del Taller es null", linea("previa_taller") === "null", linea("previa_taller"));

console.log(fallos ? `\n${fallos} falló` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
