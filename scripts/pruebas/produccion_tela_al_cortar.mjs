#!/usr/bin/env node
/**
 * Pruebas de la tela al cortar (ADR-0570, actividad 4) — migración `20261029190000_produccion_tela_al_cortar.sql` (sobre `20261029173000`). CAYLA V2.
 *
 * LO QUE VIGILA. Que la tela se anote con lo que QUEDÓ en el estante (lo usado es lo que había menos eso), en una sola llamada para todos los colores, descontando de los lotes del más
 * antiguo al más nuevo, todo o nada; que lo que quedó nunca pase de lo que había. Que «Encontré tela» entre como un lote con su origen a la vista, al precio escrito o al último. Y el
 * candado: una orden con tela declarada (también un forro) no pasa al stock con una tela sin anotar, salvo el permiso escrito de un líder; una muestra y una orden sin tela declarada sí.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y las migraciones de esta obra se cargan dentro de cada caso (así se prueba que se pueden pegar otra vez).
 *
 * QUÉ PRUEBA
 *   Q  «QUEDÓ»: un color que cruza de lote (PEPS) y el costo; todo o nada; los rechazos; un avío con «usado»; orden cerrada y otra sede.
 *   E  «ENCONTRÉ TELA»: con precio, al último precio, sin precio anterior, un avío, la cantidad, el doble clic, otra sede.
 *   C  EL CANDADO: sin tela no pasa; un forro sin anotar tampoco; anotada pasa; con el permiso de un líder pasa y queda en la historia; el permiso pide motivo y ser líder; una
 *      muestra y una orden sin tela declarada pasan.
 *   S  LA FORMA: permisos, el CHECK del origen, el ancla en `cerrar_produccion` y que se pueda pegar otra vez.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos sesiones a la vez (los lotes se toman `for update`, como `registrar_consumo_insumo`), ni la pantalla.
 *
 * USO
 *   node scripts/pruebas/produccion_tela_al_cortar.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_tela_al_cortar.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_tela_al_cortar.mjs --base otra                 → contra otra base del mismo contenedor
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
const leer = (nombre) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8"));
// La de los cambios (crea `produccion_cambios`) y la de esta actividad, en el orden en que se pegan.
const MIGRACION = `${leer("20261029173000_produccion_corregir_y_eliminar_con_historia.sql")}\n${leer("20261029190000_produccion_tela_al_cortar.sql")}`;

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
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
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK';
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.registrar_avance(%L, %L::jsonb, null)', p_fase, p_lineas)) $f$;
create function pg_temp.usa(p_oid uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.intento(format('select retail.anotar_insumos_de_la_orden(%L, %L::jsonb, null)', p_oid, p_lineas)) $f$;
create function pg_temp.encuentra(p_insumo uuid, p_ubicacion uuid, p_cantidad numeric, p_costo numeric default null, p_token uuid default null) returns text language sql as $f$
  select pg_temp.intento(format('select retail.encontre_tela(%L, %L, %L, %L, %L, %L)', p_insumo, p_ubicacion, p_cantidad, p_costo, 'en el depósito', p_token)) $f$;
create function pg_temp.permite(p_oid uuid, p_motivo text) returns text language sql as $f$ select pg_temp.intento(format('select retail.permitir_pasar_sin_tela(%L, %L)', p_oid, p_motivo)) $f$;
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb) returns text language sql as $f$
  select pg_temp.intento(format('select retail.cerrar_produccion(%L, %L::jsonb, null, null, null, true)', p_oid, p_buenas)) $f$;
`;

// Datos propios: dos telas de un color cada una (lino y pima), un forro (tela) y botones (avío), con el modelo del seed y sus dos colores.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
${MIGRACION}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('TC-LINO', 'Lino Corte Prueba', 'tela', 'metro') returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('TC-PIMA', 'Pima Corte Prueba', 'tela', 'metro') returning id as pima \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('TC-FORRO', 'Forro Corte Prueba', 'tela', 'metro') returning id as forro \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('TC-BOTON', 'Botón Corte Prueba', 'avio', 'unidad') returning id as boton \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('TC-NUEVA', 'Tela Nunca Comprada', 'tela', 'metro') returning id as nueva \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
update retail.variantes set costo = 4.50 where id in (:'v1', :'v2');
-- El estante del Taller: lino en dos lotes (20 m a S/ 10 de anteayer y 30 m a S/ 12 de hoy), pima 40 m, forro 50 m y 500 botones.
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen, fecha_ingreso) values (:'lino', :'taller', 20, 10, 'compra', current_date - 2) returning id as lino_1 \\gset
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'lino', :'taller', 30, 12, 'compra') returning id as lino_2 \\gset
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'pima', :'taller', 40, 11, 'compra') returning id as pima_1 \\gset
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'forro', :'taller', 50, 8, 'compra') returning id as forro_1 \\gset
insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'boton', :'taller', 500, 0.2, 'compra') returning id as boton_1 \\gset
insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id)
  select l.insumo_id, l.id, l.ubicacion_id, 'compra', l.cantidad_ingresada, l.costo_unitario, :'felipe_p' from retail.insumo_lotes l where l.id in (:'lino_1', :'lino_2', :'pima_1', :'forro_1', :'boton_1');
${como(FELIPE)}
`;

const APERTURA = (muestra = false) => `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', ${muestra}, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const TALLER = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
const FILA = (insumo, color, consumo, complemento = false) =>
  `jsonb_build_object('insumo_id', :'${insumo}', 'color_codigo', ${color === null ? "null::text" : `:'${color}'`}, 'consumo_por_prenda', '${consumo}', 'complemento', ${complemento})`;
// La lista de siempre: lino para el primer color, pima para el segundo, el forro para toda la orden y dos botones por prenda.
const LISTA = `jsonb_build_array(${FILA("lino", "c1", "1.2")}, ${FILA("pima", "c2", "1.2")}, ${FILA("forro", null, "0.5", true)}, ${FILA("boton", null, "2")})`;
const ABRE = (lista = LISTA, muestra = false) => `select pg_temp.abre(${APERTURA(muestra)}, ${ESPINA}, ${lista}) as r \\gset
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
   select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset`;
const TERMINA_TODO = `select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a0 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset`;
const QUEDO = (...pares) => `jsonb_build_array(${pares.map(([i, q]) => `jsonb_build_object('insumo_id', :'${i}', 'quedo', '${q}')`).join(", ")})`;
const USADO = (i, n) => `jsonb_build_array(jsonb_build_object('insumo_id', :'${i}', 'usado', '${n}'))`;
const CIERRA = `select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset`;
const MOVS = (insumo) => `(select count(*) || ':' || coalesce(sum(cantidad), 0) from retail.movimientos_insumo where produccion_id = :'oid' and insumo_id = :'${insumo}' and tipo = 'consumo')`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;
const SALDO = (insumo) => `retail.fn_insumo_saldo_en(:'${insumo}', :'taller')`;

let fallas = 0;
let casos = 0;
function anotar(nombre, bien, esperado, obtenido) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  anotar(nombre, bien, typeof esperado === "function" ? "(condición)" : esperado, obtenido);
}

// Q. «QUEDÓ» ------------------------------------------------------------------------------------------------------------------------
caso(
  "Q1 de 50 m de lino quedaron 10: se usaron 40, del lote más antiguo primero (20 de anteayer a S/ 10 y 20 de hoy a S/ 12), y el costo de tela de la orden es S/ 440",
  `${ABRE()}
   select pg_temp.usa(:'oid', ${QUEDO(["lino", 10])}) as u \\gset
   select concat_ws(',', :'u', ${MOVS("lino")},
     (select string_agg(cantidad::numeric(12,0)::text, '+' order by created_at) from retail.movimientos_insumo where produccion_id = :'oid' and insumo_id = :'lino'),
     (select coalesce(sum(cantidad), 0)::numeric(12,0) from retail.movimientos_insumo where produccion_id = :'oid' and insumo_lote_id = :'lino_1'),
     (select round(costo_tela, 2) from retail.producciones where id = :'oid'), ${SALDO("lino")}::numeric(12,0));`,
  "SIN_ERROR,2:40.000,20+20,20,440.00,10"
);
caso(
  "Q2 todo o nada: si a un color le «quedó» más de lo que había (uso_quedo_de_mas), no se anota NINGUNO",
  `${ABRE()}
   select concat_ws(',', pg_temp.eh(pg_temp.usa(:'oid', ${QUEDO(["lino", 10], ["pima", 41])})), ${MOVS("lino")}, ${MOVS("pima")});`,
  "P0001|uso_quedo_de_mas,0:0,0:0"
);
caso(
  "Q3 los rechazos: quedó lo mismo que había (uso_nada), algo que no es de la orden (uso_ajeno), repetido, «quedo» y «usado» juntos, negativo, sin líneas; un avío con «usado» sí, y de más no",
  `${ABRE()}
   select pg_temp.usa(:'oid', ${USADO("boton", 100)}) as boton_ok \\gset
   select concat_ws(',',
     pg_temp.eh(pg_temp.usa(:'oid', ${QUEDO(["lino", 50])})),
     pg_temp.eh(pg_temp.usa(:'oid', ${QUEDO(["nueva", 0])})),
     pg_temp.eh(pg_temp.usa(:'oid', ${QUEDO(["lino", 10], ["lino", 5])})),
     pg_temp.eh(pg_temp.usa(:'oid', jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'quedo', '1', 'usado', '2')))),
     pg_temp.eh(pg_temp.usa(:'oid', ${QUEDO(["lino", -1])})),
     pg_temp.eh(pg_temp.usa(:'oid', '[]'::jsonb)),
     :'boton_ok',
     pg_temp.eh(pg_temp.usa(:'oid', ${USADO("boton", 401)})),
     ${MOVS("boton")});`,
  "P0001|uso_nada,P0001|uso_ajeno,P0001|uso_repetido,P0001|uso_cantidad_invalida,P0001|uso_cantidad_invalida,P0001|uso_sin_lineas,SIN_ERROR,P0001|uso_no_alcanza,1:100.000"
);
caso(
  "Q4 una orden ya en el stock no anota tela (orden_cerrada) y una integrante de otra sede tampoco (42501)",
  `${ABRE()}
   ${TERMINA_TODO}
   select pg_temp.usa(:'oid', ${QUEDO(["lino", 10], ["pima", 10], ["forro", 30])}) as u \\gset
   ${CIERRA}
   select pg_temp.eh(pg_temp.usa(:'oid', ${QUEDO(["lino", 5])})) as cerrada \\gset
   ${como(MICAELA)}
   select concat_ws(',', :'u', :'c', :'cerrada', split_part(pg_temp.usa(:'oid', ${QUEDO(["lino", 5])}), '|', 1));`,
  "SIN_ERROR,SIN_ERROR,P0001|orden_cerrada,42501"
);

// E. «ENCONTRÉ TELA» ---------------------------------------------------------------------------------------------------------------
caso(
  "E1 con precio: entra un lote «encontrada» de 2,5 m a S/ 9 y el estante sube a 52,5 m",
  `select pg_temp.encuentra(:'lino', :'taller', 2.5, 9) as e \\gset
   select concat_ws(',', :'e', (select origen || ':' || cantidad_ingresada || ':' || round(costo_unitario, 2) from retail.insumo_lotes where insumo_id = :'lino' and origen = 'encontrada'), ${SALDO("lino")});`,
  "SIN_ERROR,encontrada:2.500:9.00,52.500"
);
caso(
  "E2 sin precio: va el del último lote de esa tela (S/ 12, el de hoy)",
  `select retail.encontre_tela(:'lino', :'taller', 3, null, null, null) as r \\gset
   select concat_ws(',', (:'r'::jsonb ->> 'precio'), round((:'r'::jsonb ->> 'costo_unitario')::numeric, 2));`,
  "ultimo,12.00"
);
caso(
  "E3 sin un precio anterior lo pide (encontre_sin_precio); un avío no (encontre_no_es_tela); la cantidad, mayor que cero; el mismo token devuelve el mismo lote",
  `select gen_random_uuid() as tok \\gset
   select pg_temp.encuentra(:'lino', :'taller', 2, 9, :'tok') as e1 \\gset
   select pg_temp.encuentra(:'lino', :'taller', 2, 9, :'tok') as e2 \\gset
   select concat_ws(',',
     pg_temp.eh(pg_temp.encuentra(:'nueva', :'taller', 2)),
     pg_temp.encuentra(:'nueva', :'taller', 2, 15),
     pg_temp.eh(pg_temp.encuentra(:'boton', :'taller', 10)),
     pg_temp.eh(pg_temp.encuentra(:'lino', :'taller', 0)),
     :'e1', :'e2', (select count(*) from retail.insumo_lotes where insumo_id = :'lino' and origen = 'encontrada'));`,
  "P0001|encontre_sin_precio,SIN_ERROR,P0001|encontre_no_es_tela,P0001|encontre_cantidad_invalida,SIN_ERROR,SIN_ERROR,1"
);
caso(
  "E4 una integrante de otra sede no anota tela en el Taller (42501)",
  `${como(MICAELA)}
   select split_part(pg_temp.encuentra(:'lino', :'taller', 2, 9), '|', 1);`,
  "42501"
);

// C. EL CANDADO DE «PASAR AL STOCK» ------------------------------------------------------------------------------------------------
caso(
  "C1 con la tela declarada y sin nada anotado, no pasa al stock (cierre_sin_tela) y la orden sigue en proceso",
  `${ABRE()}
   ${TERMINA_TODO}
   ${CIERRA}
   select concat_ws(',', pg_temp.eh(:'c'), ${ESTADO});`,
  "P0001|cierre_sin_tela,en_proceso"
);
caso(
  "C2 con el lino y la pima anotados pero el forro no, tampoco pasa (el mensaje lo nombra); con el forro anotado, pasa",
  `${ABRE()}
   ${TERMINA_TODO}
   select pg_temp.usa(:'oid', ${QUEDO(["lino", 10], ["pima", 10])}) as u \\gset
   ${CIERRA}
   select :'c' like '%Forro Corte Prueba%' as nombra \\gset
   select pg_temp.eh(:'c') as c1 \\gset
   select pg_temp.usa(:'oid', ${QUEDO(["forro", 25])}) as u2 \\gset
   ${CIERRA}
   select concat_ws(',', :'u', :'c1', :'nombra', :'u2', :'c', ${ESTADO});`,
  "SIN_ERROR,P0001|cierre_sin_tela,t,SIN_ERROR,SIN_ERROR,terminada"
);
caso(
  "C3 con el permiso de un líder pasa sin tela, y el permiso queda en la historia con su motivo",
  `${ABRE()}
   ${TERMINA_TODO}
   select pg_temp.permite(:'oid', 'Es una orden de antes del sistema') as p \\gset
   ${CIERRA}
   select concat_ws(',', :'p', :'c', ${ESTADO},
     (select x ->> 'texto' from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'cambios') x where x ->> 'accion' = 'sin_tela'));`,
  "SIN_ERROR,SIN_ERROR,terminada,Es una orden de antes del sistema"
);
caso(
  "C4 el permiso pide motivo (cambio_sin_motivo) y, desde otra sede, se rechaza (42501)",
  `${ABRE()}
   select pg_temp.eh(pg_temp.permite(:'oid', '  ')) as sin_motivo \\gset
   ${como(MICAELA)}
   select concat_ws(',', :'sin_motivo', split_part(pg_temp.permite(:'oid', 'porque sí'), '|', 1));`,
  "P0001|cambio_sin_motivo,42501"
);
caso(
  "C5 una muestra no toca el stock: se termina sin tela anotada",
  `${ABRE(LISTA, true)}
   ${TERMINA_TODO}
   ${CIERRA}
   select concat_ws(',', :'c', ${ESTADO});`,
  "SIN_ERROR,terminada"
);
caso(
  "C6 una orden que no declaró ninguna tela no tiene candado: sigue con el aviso de la pantalla (ver DESCARTÉ)",
  `${ABRE("null::jsonb")}
   ${TERMINA_TODO}
   ${CIERRA}
   select concat_ws(',', :'c', ${ESTADO});`,
  "SIN_ERROR,terminada"
);

// S. LA FORMA -----------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la forma: las tres funciones de la pantalla, security definer con search_path, authenticated sí y anon no; las piezas de adentro, ni authenticated; el origen acepta «encontrada»",
  `select concat_ws(',',
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
        and p.proname in ('anotar_insumos_de_la_orden', 'encontre_tela', 'permitir_pasar_sin_tela')
        and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%' and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
        and p.proname in ('fn_insumo_saldo_en', 'fn_insumo_consumir_peps', 'fn_produccion_tela_sin_anotar', 'fn_produccion_exigir_tela')),
     pg_get_constraintdef((select oid from pg_constraint where conname = 'insumo_lotes_origen_check')) like '%encontrada%');`,
  "3,f,t"
);
caso(
  "S2 las migraciones se vuelven a cargar encima sin error, y `cerrar_produccion` pide la tela una sola vez",
  `${MIGRACION}
   select (select count(*) from regexp_matches(pg_get_functiondef('retail.cerrar_produccion(uuid,jsonb,numeric,numeric,numeric,boolean)'::regprocedure), 'fn_produccion_exigir_tela', 'g'));`,
  "1"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);
