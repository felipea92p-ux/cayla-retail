#!/usr/bin/env node
/**
 * Pruebas de la orden de producción con sus fases, quién hace cada una y su tela (ADR-0400, actividad 1) — migración
 * `20261014154000_produccion_fases_y_tela_de_la_orden.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que una orden nazca con su ruta de fases (Corte · Costura · Acabado siempre; Bordado, Estampado y Lavandería si se
 * encienden), con UN quién por fase (el Taller o un servicio con proveedor y tarifa congelados) y con su tela por color y su plan en metros;
 * que lo que el ADR dice que se rechaza, se rechace con su motivo y SIN abrir la orden; que el estado de una fase se derive de lo anotado y
 * nunca se guarde; que lo anotado no se edite ni se borre; que quién hace una fase se pueda cambiar solo antes de que empiece; que las
 * firmas vivas (`abrir_produccion`, `abrir_produccion_con_modelo_nuevo`) sigan siendo las que llama la envoltura; y que solo quien ve el
 * módulo `produccion` parado en ese Taller (o el líder) lea y escriba.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga dentro de cada caso: así se prueba que se puede pegar otra
 * vez y corre igual con la base al día o sin ella).
 *   E  EL ESQUEMA: las 9 tablas nuevas con RLS encendido, sin políticas y sin permisos para la API; la migración dos veces sin error.
 *   N  EL NÚMERO: lo que ya existía se numeró por fecha, el nuevo sale del contador, OP-000012 en texto.
 *   A  ABRIR: la orden con sus 3 fases (costura afuera) y su lino por color; la espina obligatoria; servicio sin proveedor, con proveedor de
 *      tela, inactivo, sin tarifa y sin lista de precios; la tarifa copiada de la lista; fecha de entrega y prometida pasadas; el mismo token
 *      no duplica fases; tela de un color que la orden no fabrica, archivada o con consumo 0; bordado sin posición y posición en costura; la
 *      secuencia de bordado sobre pieza y sobre prenda; lo declarado en el modelo no pisa lo medido; el modelo nuevo por la misma puerta.
 *   P  PUERTAS: sin el módulo `produccion` → 42501; con el módulo pero parada en Trujillo → 42501; lectura ajena → NULL.
 *   L  LEER: las fases con su estado derivado (entrada, hechas, afuera, actual, días), el devengado del servicio tras una vuelta.
 *   C  CAMBIAR QUIÉN: antes de empezar sí (a Taller y a servicio con tarifa); después de un avance, no.
 *   I  INMUTABLE: un avance no se edita ni se borra.
 *   S  LA FORMA: las 4 de escritura/lectura de la web son security definer con search_path, `authenticated` sí y `anon` no; las internas,
 *      cerradas.
 *
 * USO
 *   node scripts/pruebas/produccion_fases.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_fases.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_fases.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = sinCandadosDePegado(
  readFileSync(join(RAIZ, "supabase", "migrations", "20261014154000_produccion_fases_y_tela_de_la_orden.sql"), "utf8"),
);

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

// Envolturas que nunca abortan el caso: devuelven «OK:…» o «<sqlstate>|<hint>|<mensaje>».
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
-- Abre y devuelve «OK:<numero>» o el error. Deja el id en pg_temp.ultima para los casos que siguen leyendo.
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK:' || v_fila.numero;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.cambia(p_fase uuid, p_quien text, p_prov uuid, p_tarifa numeric, p_fijo numeric, p_min integer, p_fecha date) returns text
language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := retail.cambiar_quien_fase(p_fase, p_quien, p_prov, p_tarifa, p_fijo, p_min, p_fecha);
  return 'OK:' || (v_r ->> 'quien') || ':' || coalesce(v_r ->> 'tarifa_prenda', '-');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: un proveedor de tela, uno de maquila (y uno inactivo), lino (tela, 5 % de merma: `merma_pct` 0.05) y botones; el modelo del seed con sus
// variantes (dos colores distintos si los hay) y su categoría para el camino del modelo nuevo.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Textiles Fases Prueba', 'tela') returning id as prov_tela \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Fases Prueba', 'maquila') returning id as maquila \\gset
insert into retail.proveedores_produccion (nombre, rubro, activo) values ('Bordados Fases Prueba', 'otro', false) returning id as inactivo \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('FP-LINO', 'Lino Fases Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('FP-BOTON', 'Botón Fases Prueba', 'avio', 'unidad') returning id as boton \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, archivado_at) values ('FP-VIEJO', 'Tela Vieja Fases Prueba', 'tela', 'metro', now()) returning id as viejo \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
-- El modelo: el que tenga dos colores distintos entre sus variantes activas (el seed trae varios).
select p.id as prod, p.categoria_id as cat from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1, v.talla_id as t1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;

// La apertura de siempre: el modelo del seed, 30 del primer color y 20 del segundo, entrega en 10 días.
const APERTURA = (extra = "") => `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20'))
  ${extra})`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const COSTURA_AFUERA = (extra = {}) =>
  FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'4.50'`, cantidad_minima: `'50'`,
    fecha_prometida: `(retail.fn_hoy_lima() + 7)::text`, ...extra });
const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA()}, ${TALLER("acabado")})`;
const LINO = (extra = "") => `jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.2' ${extra}))`;

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

const TABLAS = `('produccion_fases','produccion_avances','produccion_salidas','produccion_salida_lineas','produccion_vueltas','produccion_vuelta_lineas','produccion_insumos','producto_consumos','proveedor_tarifas')`;

// E. EL ESQUEMA ----------------------------------------------------------------------------------------------------------------
caso(
  "E1 las 9 tablas nuevas existen con RLS encendido, sin políticas y sin permisos para authenticated ni anon",
  `reset role;
   select concat_ws(',',
     (select count(*) from pg_tables where schemaname = 'retail' and tablename in ${TABLAS}),
     (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'retail' and c.relname in ${TABLAS}),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename in ${TABLAS}),
     (select bool_or(has_table_privilege('authenticated', 'retail.' || t, 'select') or has_table_privilege('anon', 'retail.' || t, 'select'))
        from unnest(array['produccion_fases','produccion_avances','produccion_insumos','producto_consumos','proveedor_tarifas']) t));`,
  "9,t,0,f"
);
caso(
  "E2 la migración se vuelve a cargar sin error (idempotente): las tablas, el número y los disparadores siguen siendo uno",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',',
     (select count(*) from pg_tables where schemaname = 'retail' and tablename in ${TABLAS}),
     (select count(*) from pg_trigger where tgname = 'produccion_avances_inmutable'),
     (select count(*) from pg_indexes where schemaname = 'retail' and indexname = 'producciones_numero_unico'));`,
  "9,1,1"
);

// N. EL NÚMERO -----------------------------------------------------------------------------------------------------------------
caso(
  "N1 lo que ya existía quedó numerado por fecha sin huecos ni repetidos, y el número en texto es OP-000012",
  `select concat_ws(',',
     (select count(*) = count(distinct numero) and coalesce(min(numero), 1) = 1 from retail.producciones),
     (select coalesce(bool_and(numero is not null), true) from retail.producciones),
     retail.fn_produccion_numero_texto(12));`,
  "t,t,OP-000012"
);

// N2: el candado de columnas del dinero deja leer el número, no el costo.
caso(
  "N2 una cuenta de la API (authenticated) lee el número de la orden por columna, pero no los costos: el candado de dinero sigue en pie",
  `reset role;
   select concat_ws(',',
     has_column_privilege('authenticated', 'retail.producciones', 'numero', 'select'),
     has_column_privilege('authenticated', 'retail.producciones', 'costo_tela', 'select'),
     has_column_privilege('authenticated', 'retail.producciones', 'costo_unitario', 'select'));`,
  "t,f,f"
);

// A. ABRIR ----------------------------------------------------------------------------------------------------------------------
caso(
  "A1 abre con Corte (Taller), Costura (afuera, S/ 4.50, mínimo 50, prometida +7) y Acabado, y lino 1.2 m por prenda del primer color: 3 fases en su secuencia, tarifa congelada, plan = 1.2 × 30 × 1.05",
  `select pg_temp.abre(${APERTURA(", 'token', gen_random_uuid()::text")}, ${ESPINA}, ${LINO()}) as r \\gset
   select concat_ws(',', :'r',
     (select string_agg(clave || ':' || secuencia || ':' || quien, ' ' order by secuencia) from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima)),
     (select proveedor_id = :'maquila' and tarifa_prenda = 4.50 and cantidad_minima = 50 and fecha_prometida = retail.fn_hoy_lima() + 7 and fijo_orden = 0
        from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'costura'),
     (select count(*) from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave <> 'costura' and proveedor_id is null and tarifa_prenda is null),
     (select color_codigo = :'c1' and consumo_por_prenda = 1.200 and cantidad_plan = 37.800 from retail.produccion_insumos where produccion_id = (select id from pg_temp.ultima)),
     (select cantidad_plan from retail.producciones where id = (select id from pg_temp.ultima)),
     (select tela_por_prenda || ':' || fuente from retail.producto_consumos where producto_id = :'prod'));`,
  (o) => /^OK:\d+,corte:10:taller costura:30:servicio acabado:60:taller,t,2,t,50,1\.200:declarado$/.test(o)
);
caso(
  "A2 sin Costura no abre (la espina es Corte · Costura · Acabado) y no gasta número ni crea la orden",
  `select last_value as antes from retail.producciones_numero_seq \\gset
   select pg_temp.eh(pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${TALLER("acabado")}))) as r \\gset
   select concat_ws(',', :'r',
     (select count(*) from retail.producciones where producto_id = :'prod' and created_at > now() - interval '5 seconds'),
     (select last_value = :'antes' from retail.producciones_numero_seq));`,
  "P0001|fases_espina,0,t"
);
caso(
  "A3 un servicio sin proveedor, con proveedor de tela, inactivo o sin tarifa (y sin lista de precios): cada uno con su motivo",
  `select concat_ws(',',
     pg_temp.eh(pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${FASE({ clave: `'costura'`, quien: `'servicio'`, tarifa_prenda: `'4'` })}, ${TALLER("acabado")}))),
     pg_temp.eh(pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA({ proveedor_id: `:'prov_tela'` })}, ${TALLER("acabado")}))),
     pg_temp.eh(pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA({ proveedor_id: `:'inactivo'` })}, ${TALLER("acabado")}))),
     pg_temp.eh(pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'` })}, ${TALLER("acabado")}))));`,
  "P0001|fase_sin_proveedor,P0001|fase_proveedor_rubro,P0001|fase_proveedor_inactivo,P0001|fase_sin_tarifa"
);
caso(
  "A4 con la lista de precios del proveedor y sin tarifa escrita, la fase copia la tarifa, el mínimo y el fijo vigentes (la más reciente)",
  `insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, cantidad_minima, fijo_orden, vigente_desde)
     values (:'maquila', 'costura', 3.80, 100, 0, retail.fn_hoy_lima() - 30), (:'maquila', 'costura', 4.20, 150, 25, retail.fn_hoy_lima() - 1);
   select pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'` })}, ${TALLER("acabado")})) as r \\gset
   select :'r' || ',' || (select tarifa_prenda || ':' || cantidad_minima || ':' || fijo_orden from retail.produccion_fases
     where produccion_id = (select id from pg_temp.ultima) and clave = 'costura');`,
  (o) => /^OK:\d+,4\.20:150:25\.00$/.test(o)
);
caso(
  "A5 una fecha de entrega pasada o una fecha prometida pasada no abren la orden",
  `select concat_ws(',',
     pg_temp.eh(pg_temp.abre(${APERTURA()} || jsonb_build_object('fecha_entrega', (retail.fn_hoy_lima() - 1)::text), ${ESPINA})),
     pg_temp.eh(pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA({ fecha_prometida: `(retail.fn_hoy_lima() - 1)::text` })}, ${TALLER("acabado")}))));`,
  "P0001|entrega_pasada,P0001|fase_fecha_pasada"
);
caso(
  "A6 el mismo token dos veces (doble clic o reintento) devuelve la misma orden y NO duplica fases ni tela",
  `select gen_random_uuid()::text as tok \\gset
   select pg_temp.abre(${APERTURA(", 'token', :'tok'")}, ${ESPINA}, ${LINO()}) as r1 \\gset
   select pg_temp.abre(${APERTURA(", 'token', :'tok'")}, ${ESPINA}, ${LINO()}) as r2 \\gset
   select concat_ws(',', :'r1' = :'r2',
     (select count(*) from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima)),
     (select count(*) from retail.produccion_insumos where produccion_id = (select id from pg_temp.ultima)),
     (select count(*) from retail.producciones where token_cliente = :'tok'::uuid));`,
  "t,3,1,1"
);
caso(
  "A7 la tela de un color que la orden no fabrica, una archivada o con consumo 0 no entran, y la orden no se abre",
  `select concat_ws(',',
     pg_temp.eh(pg_temp.abre(${APERTURA()}, ${ESPINA}, jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', 'ZZZ', 'consumo_por_prenda', '1')))),
     pg_temp.eh(pg_temp.abre(${APERTURA()}, ${ESPINA}, jsonb_build_array(jsonb_build_object('insumo_id', :'viejo', 'consumo_por_prenda', '1')))),
     pg_temp.eh(pg_temp.abre(${APERTURA()}, ${ESPINA}, ${LINO().replace("'1.2'", "'0'")})),
     (select count(*) from retail.producciones where producto_id = :'prod' and created_at > now() - interval '5 seconds'));`,
  "P0001|insumo_color_ajeno,P0001|insumo_archivado,P0001|insumo_consumo_invalido,0"
);
caso(
  "A8 un avío sin color se aplica a toda la orden (plan = consumo × 50 prendas), y la misma tela dos veces por color se rechaza",
  `select pg_temp.abre(${APERTURA()}, ${ESPINA}, jsonb_build_array(
       jsonb_build_object('insumo_id', :'boton', 'consumo_por_prenda', '6'),
       jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.2'),
       jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c2', 'consumo_por_prenda', '1.3'))) as r \\gset
   select concat_ws(',', :'r',
     (select cantidad_plan from retail.produccion_insumos where produccion_id = (select id from pg_temp.ultima) and insumo_id = :'boton'),
     (select cantidad_plan from retail.produccion_insumos where produccion_id = (select id from pg_temp.ultima) and insumo_id = :'lino' and color_codigo = :'c2'),
     pg_temp.eh(pg_temp.abre(${APERTURA()}, ${ESPINA}, jsonb_build_array(
       jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.2'),
       jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.4')))));`,
  (o) => /^OK:\d+,300\.000,27\.300,P0001\|insumo_repetido$/.test(o)
);
caso(
  "A9 bordado sin decir sobre qué va, o costura con posición, no abren; bordado sobre pieza va antes de costura (20) y sobre prenda después (40)",
  `select pg_temp.eh(pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA()}, ${TALLER("acabado")}, ${FASE({ clave: `'bordado'`, quien: `'taller'` })}))) as e1 \\gset
   select pg_temp.eh(pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA({ posicion: `'pieza'` })}, ${TALLER("acabado")}))) as e2 \\gset
   select pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA()}, ${TALLER("acabado")},
       ${FASE({ clave: `'bordado'`, quien: `'taller'`, posicion: `'pieza'` })}, ${FASE({ clave: `'lavanderia'`, quien: `'taller'` })})) as r1 \\gset
   select string_agg(clave || ':' || secuencia, ' ' order by secuencia) as s1 from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) \\gset
   select pg_temp.abre(${APERTURA()}, jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA()}, ${TALLER("acabado")}, ${FASE({ clave: `'estampado'`, quien: `'taller'`, posicion: `'prenda'` })})) as r2 \\gset
   select string_agg(clave || ':' || secuencia, ' ' order by secuencia) as s2 from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) \\gset
   select concat_ws(',', :'e1', :'e2', left(:'r1', 3), :'s1', left(:'r2', 3), :'s2');`,
  "P0001|fase_sin_posicion,P0001|fase_con_posicion,OK:,corte:10 bordado:20 costura:30 lavanderia:50 acabado:60,OK:,corte:10 costura:30 estampado:45 acabado:60"
);
caso(
  "A10 lo declarado desde la orden no pisa un consumo medido que el modelo ya tenía",
  `insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente) values (:'prod', 1.350, 'medido');
   select pg_temp.abre(${APERTURA()}, ${ESPINA}, ${LINO()}) as r \\gset
   select :'r' || ',' || (select tela_por_prenda || ':' || fuente from retail.producto_consumos where producto_id = :'prod');`,
  (o) => /^OK:\d+,1\.350:medido$/.test(o)
);
caso(
  "A12 «Dejar este consumo como el del modelo» (fijar_consumo_modelo): quien edita el catálogo corrige lo que el modelo ya decía, aun lo medido, con el consumo de la primera tela de la orden",
  `insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente) values (:'prod', 1.350, 'medido');
   select pg_temp.abre(${APERTURA(", 'fijar_consumo_modelo', true")}, ${ESPINA}, ${LINO()}) as r \\gset
   select :'r' || ',' || (select tela_por_prenda || ':' || fuente from retail.producto_consumos where producto_id = :'prod');`,
  (o) => /^OK:\d+,1\.200:declarado$/.test(o)
);
caso(
  "A13 quien no edita el catálogo no corrige lo que el modelo ya dice: 42501 con su motivo, el consumo queda igual y NO se gasta número (se comprueba antes de abrir)",
  `insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente) values (:'prod', 1.350, 'declarado');
   reset role;
   update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = :'micaela_p';
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   -- Que su rol NO edite el catálogo (el seed le da Productos y Atributos): fn_puede_editar_catalogo es líder o esos módulos.
   delete from retail.rol_modulos where modulo in ('productos', 'atributos') and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   select last_value as antes from retail.producciones_numero_seq \\gset
   ${como(MICAELA)}
   select pg_temp.eh(pg_temp.abre(${APERTURA(", 'fijar_consumo_modelo', true")}, ${ESPINA}, ${LINO()})) as r \\gset
   ${como(FELIPE)}
   select concat_ws(',', :'r', (select tela_por_prenda from retail.producto_consumos where producto_id = :'prod'), (select last_value = :'antes' from retail.producciones_numero_seq));`,
  "42501|consumo_modelo_sin_permiso,1.350,t"
);
caso(
  "A14 donde el modelo todavía no dice nada no hace falta permiso: quien opera el Taller abre la orden con el interruptor y la primera tela deja el consumo declarado",
  `reset role;
   update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = :'micaela_p';
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   select pg_temp.abre(${APERTURA(", 'fijar_consumo_modelo', true")}, ${ESPINA}, ${LINO()}) as r \\gset
   ${como(FELIPE)}
   select :'r' || ',' || (select tela_por_prenda || ':' || fuente from retail.producto_consumos where producto_id = :'prod');`,
  (o) => /^OK:\d+,1\.200:declarado$/.test(o)
);
caso(
  "A11 el modelo nuevo entra por la misma puerta (envuelve a abrir_produccion_con_modelo_nuevo): nace el modelo, la orden y sus fases",
  `select pg_temp.abre(jsonb_build_object(
       'modelo_nuevo', true, 'ubicacion_id', :'taller', 'referencia', 'Zz Fases Prueba Modelo', 'categoria_id', :'cat', 'precio', '89',
       'variantes', jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'cantidad', '12'))),
     ${ESPINA}) as r \\gset
   select concat_ws(',', :'r',
     (select count(*) from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima)),
     (select p.referencia || ':' || pr.cantidad_plan from retail.producciones pr join retail.productos p on p.id = pr.producto_id where pr.id = (select id from pg_temp.ultima)));`,
  (o) => /^OK:\d+,3,Zz Fases Prueba Modelo:12$/.test(o)
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin el módulo «produccion» en el rol no se abre (42501); con el módulo pero parada en Trujillo tampoco (42501); y Felipe sí",
  `reset role;
   delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select pg_temp.eh(pg_temp.abre(${APERTURA()}, ${ESPINA})) as sin_modulo \\gset
   reset role;
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   select pg_temp.eh(pg_temp.abre(${APERTURA()}, ${ESPINA})) as en_trujillo \\gset
   ${como(FELIPE)}
   select :'sin_modulo' || ',' || :'en_trujillo' || ',' || left(pg_temp.abre(${APERTURA()}, ${ESPINA}), 3);`,
  "42501|produccion_sin_modulo,42501|produccion_sin_taller,OK:"
);
caso(
  "P2 fn_fases_de_orden de una orden del Taller: el líder la lee; una integrante de Trujillo recibe NULL",
  `select pg_temp.abre(${APERTURA()}, ${ESPINA}) as r \\gset
   select jsonb_array_length(retail.fn_fases_de_orden((select id from pg_temp.ultima))) as lider \\gset
   ${como(MICAELA)}
   select :'lider' || ',' || coalesce(retail.fn_fases_de_orden((select id from pg_temp.ultima))::text, 'NULL');`,
  "3,NULL"
);

// L. LEER ----------------------------------------------------------------------------------------------------------------------
caso(
  "L1 recién abierta: Corte es la actual (pendiente, entrada = 50, 0 días), las otras esperan; el servicio tiene devengado 0 y el Taller ninguno",
  `select pg_temp.abre(${APERTURA()}, ${ESPINA}) as r \\gset
   select string_agg(
       (f ->> 'clave') || ':' || (f ->> 'estado') || ':' || (f ->> 'actual') || ':' || (f ->> 'entrada') || ':' || (f ->> 'hechas') || ':'
         || coalesce(f ->> 'dias_en_fase', '-') || ':' || coalesce(f ->> 'devengado', '-') || ':' || coalesce(f ->> 'proveedor_nombre', '-'),
       ' ' order by (f ->> 'secuencia')::int)
     from jsonb_array_elements(retail.fn_fases_de_orden((select id from pg_temp.ultima))) f;`,
  "corte:pendiente:true:50:0:0:-:- costura:pendiente:false:0:0:-:0:Confecciones Fases Prueba acabado:pendiente:false:0:0:-:-:-"
);
caso(
  "L2 con el corte terminado, 10 afuera y una vuelta de 8 buenas + 2 faltantes: Corte hecha, Costura actual y en curso, 8 hechas, 0 afuera, devengado 8 × 4.50 = 36",
  `select pg_temp.abre(${APERTURA()}, ${ESPINA}) as r \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'costura' \\gset
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, hecho_por) values (:'f_corte', :'v1', 30, 'taller', :'felipe_p'), (:'f_corte', :'v2', 20, 'taller', :'felipe_p');
   insert into retail.produccion_salidas (fase_id, hecho_por) values (:'f_cost', :'felipe_p') returning id as sal \\gset
   insert into retail.produccion_salida_lineas (salida_id, variante_id, cantidad) values (:'sal', :'v1', 10);
   insert into retail.produccion_vueltas (fase_id, hecho_por) values (:'f_cost', :'felipe_p') returning id as vue \\gset
   insert into retail.produccion_vuelta_lineas (vuelta_id, variante_id, buenas, faltantes, motivo) values (:'vue', :'v1', 8, 2, 'se perdieron en el taller');
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, vuelta_id, hecho_por) values (:'f_cost', :'v1', 8, 'vuelta', :'vue', :'felipe_p');
   select string_agg(
       (f ->> 'clave') || ':' || (f ->> 'estado') || ':' || (f ->> 'actual') || ':' || (f ->> 'entrada') || ':' || (f ->> 'hechas') || ':' || (f ->> 'afuera')
         || ':' || (f ->> 'faltantes') || ':' || coalesce(f ->> 'devengado', '-'),
       ' ' order by (f ->> 'secuencia')::int)
     from jsonb_array_elements(retail.fn_fases_de_orden((select id from pg_temp.ultima))) f;`,
  "corte:hecha:false:50:50:0:0:- costura:en_curso:true:50:8:0:2:36.00 acabado:pendiente:false:8:0:0:0:-"
);

// C. CAMBIAR QUIÉN -------------------------------------------------------------------------------------------------------------
caso(
  "C1 antes de empezar, la costura pasa al Taller (sin proveedor ni tarifa) y vuelve a un servicio con su tarifa; sin tarifa no",
  `select pg_temp.abre(${APERTURA()}, ${ESPINA}) as r \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'costura' \\gset
   select pg_temp.cambia(:'f_cost', 'taller', null, null, null, null, null) as c1 \\gset
   select (proveedor_id is null and tarifa_prenda is null and fecha_prometida is null) as q1 from retail.produccion_fases where id = :'f_cost' \\gset
   select pg_temp.cambia(:'f_cost', 'servicio', :'maquila', 5.10, 20, 60, null) as c2 \\gset
   select (proveedor_id = :'maquila' and tarifa_prenda = 5.10 and fijo_orden = 20 and cantidad_minima = 60) as q2 from retail.produccion_fases where id = :'f_cost' \\gset
   select concat_ws(',', :'c1', :'q1', :'c2', :'q2', pg_temp.eh(pg_temp.cambia(:'f_cost', 'servicio', :'maquila', null, null, null, null)));`,
  "OK:taller:-,t,OK:servicio:5.10,t,P0001|fase_sin_tarifa"
);
caso(
  "C2 con un avance anotado, quién hace la fase ya no se cambia (fase_empezada); y una orden cerrada tampoco (orden_cerrada)",
  `select pg_temp.abre(${APERTURA()}, ${ESPINA}) as r \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'costura' \\gset
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, hecho_por) values (:'f_corte', :'v1', 5, 'taller', :'felipe_p');
   select pg_temp.eh(pg_temp.cambia(:'f_corte', 'servicio', :'maquila', 1, null, null, null)) as empezada \\gset
   update retail.producciones set estado = 'anulada' where id = (select id from pg_temp.ultima);
   select :'empezada' || ',' || pg_temp.eh(pg_temp.cambia(:'f_cost', 'taller', null, null, null, null, null));`,
  "P0001|fase_empezada,P0001|orden_cerrada"
);

// I. INMUTABLE -----------------------------------------------------------------------------------------------------------------
caso(
  "I1 un avance, una salida y una vuelta no se editan ni se borran (42501); lo que se escribe mal se deshace con otra fila",
  `select pg_temp.abre(${APERTURA()}, ${ESPINA}) as r \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = (select id from pg_temp.ultima) and clave = 'corte' \\gset
   insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, hecho_por) values (:'f_corte', :'v1', 5, 'taller', :'felipe_p') returning id as av \\gset
   select split_part(pg_temp.intento('update retail.produccion_avances set cantidad = 6 where id = ''' || :'av' || ''''), '|', 1) as u \\gset
   select split_part(pg_temp.intento('delete from retail.produccion_avances where id = ''' || :'av' || ''''), '|', 1) as d \\gset
   select split_part(pg_temp.intento('insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, deshace_id, hecho_por) values (''' || :'f_corte' || ''', ''' || :'v1' || ''', -5, ''deshacer'', ''' || :'av' || ''', ''' || :'felipe_p' || ''')'), '|', 1) as i \\gset
   select concat_ws(',', :'u', :'d', :'i', (select coalesce(sum(cantidad), 0) from retail.produccion_avances where fase_id = :'f_corte'));`,
  "42501,42501,SIN_ERROR,0"
);

// O. LO QUE LA HOJA OFRECE ------------------------------------------------------------------------------------------------------
caso(
  "O1 fn_nueva_orden_opciones: solo los proveedores de servicio activos (con su lista de precios), el consumo del modelo y la tela comprometida por las órdenes en proceso (plan − descontado); una integrante de Trujillo recibe NULL",
  `insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, cantidad_minima) values (:'maquila', 'costura', 4.20, 150);
   select pg_temp.abre(${APERTURA()}, ${ESPINA}, ${LINO()}) as r \\gset
   select concat_ws(',',
     (select string_agg(p ->> 'nombre', '|' order by p ->> 'nombre') from jsonb_array_elements(o -> 'proveedores') p where p ->> 'nombre' like '%Fases Prueba'),
     (select (p -> 'tarifas' -> 0 ->> 'tarifa_prenda') || ':' || (p -> 'tarifas' -> 0 ->> 'cantidad_minima') from jsonb_array_elements(o -> 'proveedores') p where p ->> 'nombre' = 'Confecciones Fases Prueba'),
     (select (c ->> 'tela_por_prenda') || ':' || (c ->> 'fuente') from jsonb_array_elements(o -> 'consumos') c where (c ->> 'producto_id')::uuid = :'prod'),
     (select c ->> 'cantidad' from jsonb_array_elements(o -> 'comprometido') c where (c ->> 'insumo_id')::uuid = :'lino'))
   from retail.fn_nueva_orden_opciones(:'taller') o \\gset
   select :'concat_ws' as lider \\gset
   ${como(MICAELA)}
   select :'lider' || ',' || coalesce(retail.fn_nueva_orden_opciones(:'taller')::text, 'NULL');`,
  "Confecciones Fases Prueba,4.20:150,1.200:declarado,37.800,NULL"
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------------
const DE = (nombres) => `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in (${nombres})`;
const PUBLICAS = `'abrir_orden_produccion','fn_fases_de_orden','cambiar_quien_fase','fn_nueva_orden_opciones'`;
const INTERNAS = `'fn_fase_secuencia','fn_fase_nombre','fn_produccion_exigir_operar','fn_produccion_puede_leer','fn_produccion_fases_normalizar','fn_produccion_insumos_normalizar','fn_produccion_anotado_inmutable'`;
caso(
  "S1 la forma: las 4 de la web son security definer con search_path, authenticated sí y anon no; las 7 internas, cerradas a la API y con search_path",
  `reset role;
   select concat_ws(',',
     (select count(*) ${DE(PUBLICAS)}),
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') ${DE(PUBLICAS)}),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) ${DE(PUBLICAS)}),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) ${DE(PUBLICAS)}),
     (select count(*) ${DE(INTERNAS)}),
     (select bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) ${DE(INTERNAS)}),
     (select bool_and(array_to_string(p.proconfig, ',') like '%search_path%') ${DE(INTERNAS)}));`,
  "4,t,t,f,7,f,t"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
