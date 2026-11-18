#!/usr/bin/env node
/**
 * Pruebas del corte con su tela, todo o nada (ADR-0587) — migración `20261031014000_produccion_corte_con_su_tela_todo_o_nada.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que «Terminé» y la tela que quedó se guarden juntos o no se guarde nada; que un reintento con el mismo token no anote dos
 * veces (y otro contenido con el mismo token se rechace); que «Deshacer» devuelva las prendas, las fallas y la tela a su mismo lote, una
 * sola vez y sin dejar a la orden con más tela devuelta que consumida; que la Salida y la tela que sale con ella vayan juntas; y que la
 * regla de la tela tome el candado del estante (tela, sede) ANTES de leer cuánto había.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez).
 *
 * QUÉ PRUEBA
 *   T  «TERMINÉ» CON TELA: juntos; todo o nada; el token (repetido y reusado); sin token anota cada vez; la puerta vieja sigue igual.
 *   D  «DESHACER»: prendas y tela de vuelta a su lote; dos veces no; con parte ya devuelta a mano no; lo de otra orden no; los CHECK.
 *   O  LA SALIDA: con su tela; si la tela no alcanza, no sale nada; el token.
 *   S  LA FORMA: permisos, el candado del estante antes de leer, que se pueda pegar otra vez.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos sesiones a la vez de verdad (necesitaría COMMIT, y las pruebas del CI no lo hacen): el candado se comprueba
 * por su forma (S2). La carrera real se corrió a mano en una base desechable el 2026-10-30 (ADR-0587, «Cómo se verificó»).
 *
 * USO
 *   node scripts/pruebas/produccion_corte_con_su_tela.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_corte_con_su_tela.mjs --contenedor supabase_db_x  → contra otro stack
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261031014000_produccion_corte_con_su_tela_todo_o_nada.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Envolturas que nunca abortan el caso: devuelven «SIN_ERROR» u «OK…», o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create table pg_temp.ultima (id uuid);
create table pg_temp.resp (r jsonb);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_fila record;
begin
  for v_fila in select r.id from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
end;
$f$;
-- Corre una función que devuelve jsonb y guarda la respuesta en pg_temp.resp; si falla, devuelve «<sqlstate>|<hint>|…».
create function pg_temp.guarda(p_sql text) returns text language plpgsql as $f$
declare v_r jsonb; v_estado text; v_hint text; v_msg text;
begin
  execute p_sql into v_r;
  delete from pg_temp.resp; insert into pg_temp.resp values (v_r);
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.termina(p_fase uuid, p_lineas jsonb, p_tela jsonb default null, p_token uuid default null, p_fallas jsonb default null) returns text language sql as $f$
  select pg_temp.guarda(format('select retail.anotar_termine_con_tela(%L, %L::jsonb, null, null, %L::jsonb, %L::jsonb, %L::uuid)', p_fase, p_lineas, p_fallas, p_tela, p_token)) $f$;
create function pg_temp.sale(p_fase uuid, p_lineas jsonb, p_tela jsonb default null, p_token uuid default null) returns text language sql as $f$
  select pg_temp.guarda(format('select retail.registrar_salida_con_tela(%L, %L::jsonb, null, null, %L::jsonb, %L::uuid)', p_fase, p_lineas, p_tela, p_token)) $f$;
create function pg_temp.deshace(p_r jsonb) returns text language sql as $f$
  select pg_temp.intento(format('select retail.deshacer_termine(%L::uuid[], %L::uuid[], %L::uuid[])',
    (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_r -> 'avance_ids') x),
    (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_r -> 'falla_ids') x),
    (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_r -> 'consumo_ids') x))) $f$;
create function pg_temp.usa(p_oid uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.anotar_insumos_de_la_orden(%L, %L::jsonb, null)', p_oid, p_lineas)) $f$;
`;

// Datos propios: lino en dos lotes (20 m a S/ 10 de anteayer y 30 m a S/ 12 de hoy) y pima 40 m, con el modelo del seed y sus dos colores.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CT-LINO', 'Lino Corte Junto Prueba', 'tela', 'metro') returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CT-PIMA', 'Pima Corte Junto Prueba', 'tela', 'metro') returning id as pima \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Corte de Afuera Prueba', 'maquila') returning id as cortador \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
update retail.variantes set costo = 4.50 where id in (:'v1', :'v2');
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen, fecha_ingreso) values (:'lino', :'taller', 20, 10, 'compra', current_date - 2) returning id as lino_1 \\gset
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'lino', :'taller', 30, 12, 'compra') returning id as lino_2 \\gset
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'pima', :'taller', 40, 11, 'compra') returning id as pima_1 \\gset
insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id)
  select l.insumo_id, l.id, l.ubicacion_id, 'compra', l.cantidad_ingresada, l.costo_unitario, :'felipe_p' from retail.insumo_lotes l where l.id in (:'lino_1', :'lino_2', :'pima_1');
${como(FELIPE)}
`;

const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const TALLER = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const AFUERA = `jsonb_build_object('clave', 'corte', 'quien', 'servicio', 'proveedor_id', :'cortador', 'tarifa_prenda', '1.00', 'fecha_prometida', (retail.fn_hoy_lima() + 5)::text)`;
const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const ESPINA_AFUERA = `jsonb_build_array(${AFUERA}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const FILA = (insumo, color) => `jsonb_build_object('insumo_id', :'${insumo}', 'color_codigo', :'${color}', 'consumo_por_prenda', '1.2', 'complemento', false)`;
const LISTA = `jsonb_build_array(${FILA("lino", "c1")}, ${FILA("pima", "c2")})`;
const ABRE = (espina = ESPINA) => `select pg_temp.abre(${APERTURA}, ${espina}, ${LISTA}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset`;
// Una segunda orden del mismo modelo y la misma tela, para los casos «de otra orden».
const ABRE_OTRA = `select pg_temp.abre(${APERTURA}, ${ESPINA}, ${LISTA}) as r2 \\gset
   select id as oid2 from pg_temp.ultima \\gset
   select id as f_corte2 from retail.produccion_fases where produccion_id = :'oid2' and clave = 'corte' \\gset`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
const QUEDO = (...pares) => `jsonb_build_array(${pares.map(([i, q]) => `jsonb_build_object('insumo_id', :'${i}', 'quedo', '${q}')`).join(", ")})`;
const USADO = (i, n) => `jsonb_build_array(jsonb_build_object('insumo_id', :'${i}', 'usado', '${n}'))`;
const RESP = `(select r from pg_temp.resp)`;
const HECHAS = (fase = "f_corte") => `(select coalesce(sum(cantidad), 0) from retail.produccion_avances where fase_id = :'${fase}')`;
const CONSUMO = (insumo, oid = "oid") => `(select coalesce(sum(case when tipo = 'consumo' then cantidad else -cantidad end), 0)::numeric(12,0) from retail.movimientos_insumo where produccion_id = :'${oid}' and insumo_id = :'${insumo}' and tipo in ('consumo', 'devolucion'))`;
const SALDO = (insumo) => `retail.fn_insumo_saldo_en(:'${insumo}', :'taller')::numeric(12,0)`;
const COSTO = `(select round(costo_tela, 2) from retail.producciones where id = :'oid')`;
const TOKEN = "'7a6b0c1d-0000-4000-8000-000000000587'";

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  casos++;
  if (obtenido !== esperado) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// T. «TERMINÉ» CON TELA ---------------------------------------------------------------------------------------------------------
caso(
  "T1 «Terminé» 30+20 con «quedaron 10 m de lino y 4 de pima»: las prendas, la tela (40 + 36 m) y el costo (S/ 836) en una llamada, con los ids para deshacer",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 30], ["v2", 20])}, ${QUEDO(["lino", 10], ["pima", 4])}) as t \\gset
   select concat_ws(',', :'t', ${HECHAS()}, ${CONSUMO("lino")}, ${CONSUMO("pima")}, ${COSTO},
     jsonb_array_length(${RESP} -> 'avance_ids'), jsonb_array_length(${RESP} -> 'consumo_ids'), ${RESP} ->> 'repetido', ${RESP} ? 'fases');`,
  "SIN_ERROR,50,40,36,836.00,2,3,false,t"
);
caso(
  "T2 todo o nada: si de la pima «quedó» más de lo que había, no se anota NI el corte NI el lino",
  `${ABRE()}
   select concat_ws(',', pg_temp.eh(pg_temp.termina(:'f_corte', ${L(["v1", 30], ["v2", 20])}, ${QUEDO(["lino", 10], ["pima", 41])})),
     ${HECHAS()}, ${CONSUMO("lino")}, ${SALDO("lino")});`,
  "P0001|uso_quedo_de_mas,0,0,50"
);
caso(
  "T3 el token: el mismo envío dos veces (corte de red y reintento) anota UNA vez; el segundo dice «repetido» y devuelve la orden",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 30])}, ${QUEDO(["lino", 10])}, ${TOKEN}) as a \\gset
   select pg_temp.termina(:'f_corte', ${L(["v1", 30])}, ${QUEDO(["lino", 10])}, ${TOKEN}) as b \\gset
   select concat_ws(',', :'a', :'b', ${RESP} ->> 'repetido', ${RESP} ? 'fases', ${HECHAS()}, ${CONSUMO("lino")});`,
  "SIN_ERROR,SIN_ERROR,true,t,30,40"
);
caso(
  "T4 el mismo token con OTRO contenido se rechaza (token_reusado) y no anota nada más",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 30])}, ${QUEDO(["lino", 10])}, ${TOKEN}) as a \\gset
   select concat_ws(',', :'a', pg_temp.eh(pg_temp.termina(:'f_corte', ${L(["v1", 25])}, ${QUEDO(["lino", 10])}, ${TOKEN})), ${HECHAS()}, ${CONSUMO("lino")});`,
  "SIN_ERROR,P0001|token_reusado,30,40"
);
caso(
  "T5 sin token, dos envíos son dos anotaciones (lo que protege es el token): 20 + 10 de v1",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 20])}) as a \\gset
   select pg_temp.termina(:'f_corte', ${L(["v1", 10])}) as b \\gset
   select concat_ws(',', :'a', :'b', ${HECHAS()}, ${CONSUMO("lino")});`,
  "SIN_ERROR,SIN_ERROR,30,0"
);
caso(
  "T6 la puerta vieja sigue igual: anotar_termine y registrar_avance anotan y devuelven las fases de la orden (un arreglo)",
  `${ABRE()}
   select pg_temp.intento(format('select retail.anotar_termine(%L, %L::jsonb)', :'f_corte', ${L(["v1", 10])})) as a \\gset
   select pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', :'f_corte', ${L(["v1", 5])})) as b \\gset
   select concat_ws(',', :'a', :'b', ${HECHAS()}, jsonb_typeof(retail.anotar_termine(:'f_corte', ${L(["v2", 1])})));`,
  "SIN_ERROR,SIN_ERROR,15,array"
);
caso(
  "T7 una integrante de otra sede no anota, ni repitiendo un token ya usado (42501)",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 30])}, null, ${TOKEN}) as a \\gset
   ${como(MICAELA)}
   select concat_ws(',', :'a', split_part(pg_temp.termina(:'f_corte', ${L(["v1", 30])}, null, ${TOKEN}), '|', 1));`,
  "SIN_ERROR,42501"
);

// D. «DESHACER» ----------------------------------------------------------------------------------------------------------------
caso(
  "D1 «Deshacer» devuelve las prendas y la tela a su MISMO lote, al mismo costo: el estante vuelve a 50 y 40, y el costo de tela a S/ 0",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 30], ["v2", 20])}, ${QUEDO(["lino", 10], ["pima", 4])}) as t \\gset
   select pg_temp.deshace(${RESP}) as d \\gset
   select concat_ws(',', :'t', :'d', ${HECHAS()}, ${SALDO("lino")}, ${SALDO("pima")}, ${CONSUMO("lino")}, ${COSTO},
     (select count(*) from retail.movimientos_insumo d join retail.movimientos_insumo c on c.id = d.deshace_id
       where d.produccion_id = :'oid' and d.tipo = 'devolucion' and d.insumo_lote_id = c.insumo_lote_id and d.cantidad = c.cantidad and d.costo_unitario = c.costo_unitario));`,
  "SIN_ERROR,SIN_ERROR,0,50,40,0,0.00,3"
);
caso(
  "D2 «Deshacer» dos veces no: la segunda se rechaza y no devuelve tela de más",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 30])}, ${QUEDO(["lino", 10])}) as t \\gset
   select pg_temp.deshace(${RESP}) as d \\gset
   select concat_ws(',', :'d', pg_temp.eh(pg_temp.deshace(${RESP})), ${SALDO("lino")}, ${HECHAS()});`,
  "SIN_ERROR,P0001|deshacer_ya_hecho,50,0"
);
caso(
  "D3 si ya se devolvió a mano parte de esa tela, «Deshacer» se frena ENTERO (deshacer_tela_ya_devuelta): ni las prendas se deshacen",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 30])}, ${QUEDO(["lino", 10])}) as t \\gset
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, nota)
     values (:'lino', :'lino_2', :'taller', 'devolucion', 5, 12, :'oid', :'felipe_p', 'sobró');
   select concat_ws(',', pg_temp.eh(pg_temp.deshace(${RESP})), ${HECHAS()}, ${CONSUMO("lino")});`,
  "P0001|deshacer_tela_ya_devuelta,30,35"
);
caso(
  "D4 no se deshace con la tela de OTRA orden (deshacer_ajeno), y nada cambia",
  `${ABRE()}
   ${ABRE_OTRA}
   select pg_temp.termina(:'f_corte2', ${L(["v1", 10])}, ${QUEDO(["lino", 40])}) as otra \\gset
   select (select r -> 'consumo_ids' from pg_temp.resp) as ajenos \\gset
   select pg_temp.termina(:'f_corte', ${L(["v1", 30])}) as t \\gset
   select concat_ws(',', pg_temp.eh(pg_temp.deshace(jsonb_set(${RESP}, '{consumo_ids}', :'ajenos'::jsonb))), ${HECHAS()}, ${CONSUMO("lino", "oid2")});`,
  "P0001|deshacer_ajeno,30,10"
);
caso(
  "D5 los candados de la tabla: solo una devolución dice qué consumo deshace, y cada consumo una sola vez",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 30])}, ${QUEDO(["lino", 10])}) as t \\gset
   select (select r -> 'consumo_ids' ->> 0 from pg_temp.resp) as c1 \\gset
   select concat_ws(',',
     split_part(pg_temp.intento(format($q$insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, deshace_id)
       values (%L, %L, %L, 'consumo', 1, 10, %L, %L)$q$, :'lino', :'lino_1', :'taller', :'oid', :'c1')), '|', 1),
     pg_temp.intento(format($q$insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, deshace_id)
       values (%L, %L, %L, 'devolucion', 1, 10, %L, %L)$q$, :'lino', :'lino_1', :'taller', :'oid', :'c1')),
     split_part(pg_temp.intento(format($q$insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, deshace_id)
       values (%L, %L, %L, 'devolucion', 1, 10, %L, %L)$q$, :'lino', :'lino_1', :'taller', :'oid', :'c1')), '|', 1));`,
  "23514,SIN_ERROR,23505"
);
caso(
  "D6 una orden ya cerrada o anulada no se deshace (orden_cerrada), y sin nada que deshacer tampoco (deshacer_vacio)",
  `${ABRE()}
   select pg_temp.termina(:'f_corte', ${L(["v1", 30])}, ${QUEDO(["lino", 10])}) as t \\gset
   update retail.producciones set estado = 'anulada' where id = :'oid';
   select concat_ws(',', pg_temp.eh(pg_temp.deshace(${RESP})), pg_temp.eh(pg_temp.intento('select retail.deshacer_termine(''{}'', ''{}'', ''{}'')')));`,
  "P0001|orden_cerrada,P0001|deshacer_vacio"
);

// O. LA SALIDA CON SU TELA ---------------------------------------------------------------------------------------------------------
caso(
  "O1 mandar 30 al corte de afuera con 25 m de lino: la salida y la tela en una llamada",
  `${ABRE(ESPINA_AFUERA)}
   select pg_temp.sale(:'f_corte', ${L(["v1", 30])}, ${USADO("lino", 25)}) as s \\gset
   select concat_ws(',', :'s', (select coalesce(sum(sl.cantidad), 0) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = :'f_corte'),
     ${CONSUMO("lino")}, jsonb_array_length(${RESP} -> 'consumo_ids'), ${RESP} ->> 'repetido');`,
  "SIN_ERROR,30,25,2,false"
);
caso(
  "O2 si la tela no alcanza (uso_no_alcanza), no sale ninguna prenda",
  `${ABRE(ESPINA_AFUERA)}
   select concat_ws(',', pg_temp.eh(pg_temp.sale(:'f_corte', ${L(["v1", 30])}, ${USADO("lino", 51)})),
     (select count(*) from retail.produccion_salidas where fase_id = :'f_corte'), ${CONSUMO("lino")});`,
  "P0001|uso_no_alcanza,0,0"
);
caso(
  "O3 el token: la misma salida reenviada se manda UNA vez",
  `${ABRE(ESPINA_AFUERA)}
   select pg_temp.sale(:'f_corte', ${L(["v1", 30])}, ${USADO("lino", 25)}, ${TOKEN}) as a \\gset
   select pg_temp.sale(:'f_corte', ${L(["v1", 30])}, ${USADO("lino", 25)}, ${TOKEN}) as b \\gset
   select concat_ws(',', :'a', :'b', ${RESP} ->> 'repetido', (select count(*) from retail.produccion_salidas where fase_id = :'f_corte'), ${CONSUMO("lino")});`,
  "SIN_ERROR,SIN_ERROR,true,1,25"
);
caso(
  "O4 la hoja «Tela» sigue igual sobre la regla única: quedaron 10 de 50 de lino, del lote más antiguo primero",
  `${ABRE()}
   select pg_temp.usa(:'oid', ${QUEDO(["lino", 10])}) as u \\gset
   select concat_ws(',', :'u', ${CONSUMO("lino")},
     (select coalesce(sum(cantidad), 0)::numeric(12,0) from retail.movimientos_insumo where produccion_id = :'oid' and insumo_lote_id = :'lino_1'), ${COSTO});`,
  "SIN_ERROR,40,20,440.00"
);

// S. LA FORMA ------------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la forma: las tres de la pantalla, security definer con search_path, authenticated sí y anon no; las de adentro, ni authenticated",
  `select concat_ws(',',
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
        and p.proname in ('anotar_termine_con_tela', 'registrar_salida_con_tela', 'deshacer_termine')
        and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%' and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
        and p.proname in ('fn_produccion_anotar_tela', 'fn_produccion_envio_repetido')));`,
  "3,f"
);
caso(
  "S2 el candado del estante (tela, sede) se toma ANTES de leer cuánto había, y la hoja «Tela» y «Terminé» usan la misma regla",
  `select concat_ws(',',
     position('estante:' in pg_get_functiondef('retail.fn_produccion_anotar_tela(uuid,uuid,jsonb,text,uuid,integer)'::regprocedure))
       < position('fn_insumo_saldo_en' in pg_get_functiondef('retail.fn_produccion_anotar_tela(uuid,uuid,jsonb,text,uuid,integer)'::regprocedure)),
     pg_get_functiondef('retail.anotar_insumos_de_la_orden(uuid,jsonb,text)'::regprocedure) like '%fn_produccion_anotar_tela%',
     pg_get_functiondef('retail.anotar_termine(uuid,jsonb,text,date,jsonb)'::regprocedure) like '%anotar_termine_con_tela%');`,
  "t,t,t"
);
caso(
  "S3 la migración se vuelve a cargar encima sin error y no duplica nada",
  `${MIGRACION}
   select (select count(*) from pg_indexes where schemaname = 'retail' and indexname = 'movimientos_insumo_deshace_una_vez');`,
  "1"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);
