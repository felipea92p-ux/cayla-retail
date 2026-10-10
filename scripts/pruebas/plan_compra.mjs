#!/usr/bin/env node
/**
 * Pruebas del plan de campaña (ADR-0349) — migración `20261005220000_plan_de_campana.sql`: `retail.fn_plan_compra`,
 * `retail.guardar_plan_compra_linea`, las tablas `planes_compra` / `planes_compra_lineas` y el módulo `plan_compra`. CAYLA V2.
 *
 * LO QUE VIGILA. Que un supuesto incoherente no se pueda guardar (escenarios desordenados, costo ≥ precio, recupero fuera de 0-100,
 * una curva con tallas ajenas o que no suma 100): la compra de diciembre se calcularía sobre él. Que solo quien tiene el módulo lo lea
 * y lo escriba, firmado por el responsable. Y que la hoja traiga el stock, la curva vendida y lo vendido DENTRO de la campaña.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK).
 *   M  EL MÓDULO: existe en Compras, orden 195, delegable, y nace SIN rol (ningún `rol_modulos`). La campaña «Diciembre 2026» existe.
 *   P  PUERTAS: Felipe (líder) lee y guarda; Micaela (sin el módulo) recibe 42501 en las dos; nadie lee las tablas directo.
 *   G  GUARDAR: rechaza lo incoherente con su mensaje; guardar dos veces la misma categoría deja UNA línea con lo último; firma.
 *   V  VERSIÓN (B4): una hoja vieja no pisa lo que otra persona guardó entre medio; un reintento con lo mismo pasa; sin versión, como antes.
 *   L  LEER: la línea guardada, el stock libre de la red (sin apartados ni Cuarentena), lo vendido por talla en 90 días y lo vendido
 *      dentro de las fechas de la campaña (lo de antes no cuenta).
 *
 * USO
 *   pnpm pruebas:plan-compra              → contra la base `postgres` del stack local
 *   pnpm pruebas:plan-compra --base otra  → contra otra base del mismo contenedor
 * La migración se carga dentro de cada caso (idempotente): corre igual con la base al día o sin ella.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261005220000_plan_de_campana.sql"), "utf8");
// ADR-0372, entrega 2: la lectura ampliada (B1) redefine `fn_plan_compra` sumándole claves; cada caso la carga después de la original.
const MIGRACION_B1 = readFileSync(join(RAIZ, "supabase", "migrations", "20261010190000_plan_compra_lectura_ampliada.sql"), "utf8");
// ADR-0372, entrega 2 · B2: el tope de inversión (columna + `guardar_plan_compra_tope`; vuelve a definir `fn_plan_compra` para traerlo).
const MIGRACION_B2 = readFileSync(join(RAIZ, "supabase", "migrations", "20261010191000_plan_compra_tope_de_inversion.sql"), "utf8");
// ADR-0372, entrega 2 · B3: crear una campaña desde una etiqueta (`crear_plan_compra`) y la lectura del selector (`fn_planes_compra`).
const MIGRACION_B3 = readFileSync(join(RAIZ, "supabase", "migrations", "20261010192000_plan_compra_crear_campana.sql"), "utf8");
// ADR-0372 · B4 (ADR-0193 aplicada al plan): la versión de cada línea; `guardar_plan_compra_linea` gana `p_version_esperada` (cambia su firma).
const MIGRACION_B4 = readFileSync(join(RAIZ, "supabase", "migrations", "20261010200000_plan_compra_version_de_linea.sql"), "utf8");
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinControl(MIGRACION)}
set local search_path = retail, public, extensions;
${sinControl(MIGRACION_B1)}
set local search_path = retail, public, extensions;
${sinControl(MIGRACION_B2)}
set local search_path = retail, public, extensions;
${sinControl(MIGRACION_B3)}
set local search_path = retail, public, extensions;
${sinControl(MIGRACION_B4)}
set local search_path = retail, public, extensions;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);

create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;

select id as plan from retail.planes_compra where nombre = 'Diciembre 2026' \\gset
insert into retail.categorias (nombre, familia) values ('PC Polos', 'indumentaria');
select id as cat from retail.categorias where nombre = 'PC Polos' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) select :'cat', t.id from retail.tallas t where t.valor in ('S', 'M', 'L');
select id as t_s from retail.tallas where valor = 'S' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset
select id as t_l from retail.tallas where valor = 'L' \\gset
select id as t_xl from retail.tallas where valor = 'XL' \\gset
select set_config('pc.plan', :'plan', true) as _1, set_config('pc.cat', :'cat', true) as _2 \\gset
-- Una línea válida con la curva dada.
create function pg_temp.guarda(p_curva jsonb, p_normal int default 120) returns text language sql as $$
  select pg_temp.intento(format('select retail.guardar_plan_compra_linea(%L, %L, 80, %s, 180, 79.90, 32, 50, %L)',
    current_setting('pc.plan'), current_setting('pc.cat'), p_normal, p_curva))
$$;
${como(FELIPE)}
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
const curva = (o) => JSON.stringify(o).replace(/'/g, "''");

// Una prenda de «PC Polos» con stock en Trujillo (7 en el piso con 2 apartadas = 5 libres; 5 en Cuarentena, que no cuentan), una venta
// de hace 10 días (3) y otra el 5 de diciembre (4, dentro de la campaña). Termina con la hoja leída como Felipe en `:'h'`.
const FIXTURE_PRENDA = `
   create function pg_temp.prenda(p_cat uuid, p_talla uuid) returns uuid language plpgsql as $f$
   declare p uuid; v uuid;
   begin
     insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
       select 'ZZ PC polo', p_cat, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
       returning id into p;
     insert into retail.variantes (producto_id, sku, precio, costo, talla_id) values (p, 'ZZ-PC-M', 80, 30, p_talla) returning id into v;
     return v;
   end $f$;
   select pg_temp.prenda(:'cat', :'t_m') as v \\gset
   select id as tienda from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
   insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
     values (:'v', :'tienda', (select id from retail.sububicaciones where ubicacion_id = :'tienda' and tipo = 'piso_venta'), 7, 2),
            (:'v', :'tienda', (select id from retail.sububicaciones where ubicacion_id = :'tienda' and tipo = 'cuarentena'), 5, 0);
   -- Vendida hace 10 días (curva) y una el 5 de diciembre (campaña).
   with v1 as (insert into retail.ventas (ubicacion_id, estado, created_at) values (:'tienda', 'completada', now() - interval '10 days') returning id)
   insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) select id, :'v', 3, 80, 30 from v1;
   with v2 as (insert into retail.ventas (ubicacion_id, estado, created_at) values (:'tienda', 'completada', timestamptz '2026-12-05 12:00-05') returning id)
   insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) select id, :'v', 4, 80, 30 from v2;
   ${como(FELIPE)}
   select retail.fn_plan_compra() as h \\gset
`;

// M. MÓDULO ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 el módulo está en Compras (orden 195, delegable), nace SIN rol; la campaña Diciembre 2026 existe",
  `reset role;
   select concat_ws(',', (select grupo || ':' || orden || ':' || delegable || ':' || solo_lider from retail.modulos where clave = 'plan_compra'),
     (select count(*) from retail.rol_modulos where modulo = 'plan_compra'),
     (select desde || '/' || hasta from retail.planes_compra where nombre = 'Diciembre 2026'));`,
  "Compras:195:true:false,0,2026-12-01/2026-12-31"
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------
caso(
  "P1 Felipe lee; Micaela, sin el módulo, recibe 42501 al leer y al guardar",
  `select (retail.fn_plan_compra() -> 'plan' ->> 'nombre') as nombre \\gset
   ${como(MICAELA)}
   select :'nombre' || ',' ||
     split_part(pg_temp.intento('select retail.fn_plan_compra()'), '|', 1) || ',' ||
     split_part(pg_temp.guarda('{}'::jsonb), '|', 1);`,
  "Diciembre 2026,42501,42501"
);
caso(
  "P2 nadie lee las tablas directo (RLS sin políticas) ni ejecuta como anon",
  `set local role authenticated;
   select concat_ws(',', (select count(*) from retail.planes_compra), (select count(*) from retail.planes_compra_lineas)) as directo \\gset
   reset role;
   select :'directo' || ',' || concat_ws(',', (select count(*) from retail.planes_compra) > 0,
     has_function_privilege('anon', 'retail.fn_plan_compra(uuid)', 'execute'),
     has_function_privilege('anon', 'retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer)', 'execute'));`,
  "0,0,t,f,f"
);

// G. GUARDAR --------------------------------------------------------------------------------------------------------------
caso(
  "G1 rechaza escenarios desordenados, costo ≥ precio, recupero > 100, talla ajena y curva que no suma 100",
  `select concat_ws(' / ',
     split_part(pg_temp.guarda('{}'::jsonb, 60), '|', 2),
     split_part(pg_temp.intento(format('select retail.guardar_plan_compra_linea(%L, %L, 1, 2, 3, 30, 30, 50)', :'plan', :'cat')), '|', 2),
     split_part(pg_temp.intento(format('select retail.guardar_plan_compra_linea(%L, %L, 1, 2, 3, 50, 30, 101)', :'plan', :'cat')), '|', 2),
     split_part(pg_temp.guarda(jsonb_build_object(:'t_xl', 100)), '|', 2),
     split_part(pg_temp.guarda(jsonb_build_object(:'t_s', 50, :'t_m', 60)), '|', 2));`,
  "Los escenarios van de menor a mayor: flojo, normal y bueno (flojo puede ser 0). / El costo tiene que ser menor que el precio de venta. / Lo que sobra se vende entre el 0 % y el 100 % del precio. / La curva tiene una talla que no es de esta categoría o un porcentaje que no es entero entre 0 y 100. / La curva de tallas suma 110 %: tiene que sumar 100 %."
);
caso(
  "G2 guardar dos veces deja UNA línea con lo último, firmada; la curva vacía vale",
  `select pg_temp.guarda('{}'::jsonb);
   select pg_temp.guarda(jsonb_build_object(:'t_s', 20, :'t_m', 50, :'t_l', 30), 130);
   reset role;
   select concat_ws(',', count(*), max(normal), max(curva ->> :'t_m'), bool_and(actualizado_por is not null))
     from retail.planes_compra_lineas where plan_id = :'plan' and categoria_id = :'cat';`,
  "1,130,50,t"
);

// V. VERSIÓN (B4: dos personas no se pisan) ---------------------------------------------------------------------------------
caso(
  "V1 con la versión: crea la línea en 1; guardar con la que leyó la sube; una hoja vieja con OTRA cosa recibe PT409 con quién y a qué hora; con lo MISMO, pasa",
  `select (retail.guardar_plan_compra_linea(:'plan', :'cat', 80, 120, 180, 79.90, 32, 50, '{}'::jsonb, null, 0) ->> 'version') as v1 \\gset
   select (retail.guardar_plan_compra_linea(:'plan', :'cat', 10, 20, 30, 79.90, 32, 50, '{}'::jsonb, null, :v1) ->> 'version') as v2 \\gset
   select pg_temp.intento(format('select retail.guardar_plan_compra_linea(%L, %L, 80, 120, 180, 79.90, 32, 50, ''{}''::jsonb, null, %s)', :'plan', :'cat', :'v1')) as choque \\gset
   select (retail.guardar_plan_compra_linea(:'plan', :'cat', 10, 20, 30, 79.90, 32, 50, '{}'::jsonb, null, :v1) ->> 'version') as v3 \\gset
   reset role;
   select concat_ws(' / ', :'v1', :'v2', split_part(:'choque', '|', 1), split_part(:'choque', '|', 2) like '% guardó otro plan de PC Polos a las %: lo tuyo no se guardó.%', :'v3',
     (select normal from retail.planes_compra_lineas where plan_id = :'plan' and categoria_id = :'cat'));`,
  "1 / 2 / PT409 / t / 3 / 20"
);
caso(
  "V2 sin la versión guarda como siempre (la web de antes); la hoja trae la versión de cada línea y con_version",
  `select pg_temp.guarda('{}'::jsonb);
   select pg_temp.guarda('{}'::jsonb, 130);
   select retail.fn_plan_compra(:'plan') as h \\gset
   select concat_ws(',', :'h'::jsonb ->> 'con_version',
     (select l ->> 'version' from jsonb_array_elements(:'h'::jsonb -> 'lineas') l where l ->> 'categoria_id' = :'cat'),
     (select l ->> 'normal' from jsonb_array_elements(:'h'::jsonb -> 'lineas') l where l ->> 'categoria_id' = :'cat'));`,
  "true,2,130"
);
caso(
  "V3 una hoja que se abrió sin plan (0) cuando otra persona ya lo creó: con otra cosa, PT409; con lo mismo, pasa sin duplicar",
  `select pg_temp.guarda('{}'::jsonb);
   select split_part(pg_temp.intento(format('select retail.guardar_plan_compra_linea(%L, %L, 5, 6, 7, 79.90, 32, 50, ''{}''::jsonb, null, 0)', :'plan', :'cat')), '|', 1) as otra \\gset
   select (retail.guardar_plan_compra_linea(:'plan', :'cat', 80, 120, 180, 79.90, 32, 50, '{}'::jsonb, null, 0) ->> 'version') as misma \\gset
   reset role;
   select concat_ws(',', :'otra', :'misma', (select count(*) from retail.planes_compra_lineas where plan_id = :'plan' and categoria_id = :'cat'));`,
  "PT409,2,1"
);

// L. LEER -----------------------------------------------------------------------------------------------------------------
caso(
  "L1 la hoja trae la línea, el stock libre de la red, la curva vendida en 90 días y lo vendido dentro de la campaña",
  `select pg_temp.guarda(jsonb_build_object(:'t_s', 20, :'t_m', 50, :'t_l', 30));
   reset role;
${FIXTURE_PRENDA}
   select concat_ws(',',
     (select l ->> 'normal' from jsonb_array_elements((:'h')::jsonb -> 'lineas') l where l ->> 'categoria_id' = :'cat'),
     (select s ->> 'unidades' from jsonb_array_elements((:'h')::jsonb -> 'stock') s where s ->> 'categoria_id' = :'cat'),
     (select c ->> 'unidades' from jsonb_array_elements((:'h')::jsonb -> 'curvas') c where c ->> 'categoria_id' = :'cat' and c ->> 'talla_id' = :'t_m'),
     (select w ->> 'unidades' from jsonb_array_elements((:'h')::jsonb -> 'vendido') w where w ->> 'categoria_id' = :'cat'),
     (select jsonb_array_length(c -> 'tallas') from jsonb_array_elements((:'h')::jsonb -> 'categorias') c where c ->> 'id' = :'cat'));`,
  "120,5,3,4,3"
);

caso(
  "L2 la lectura ampliada suma `catalogo`, `stock_sedes`, `vendido_30` y `con_version` (B4) sin quitar ninguna clave de antes",
  `select pg_temp.guarda(jsonb_build_object(:'t_s', 20, :'t_m', 50, :'t_l', 30));
   ${FIXTURE_PRENDA}
   select concat_ws(',',
     (select (c ->> 'precio') || '/' || (c ->> 'costo') from jsonb_array_elements((:'h')::jsonb -> 'catalogo') c where c ->> 'categoria_id' = :'cat'),
     (select (s ->> 'ubicacion') || ':' || (s ->> 'unidades') from jsonb_array_elements((:'h')::jsonb -> 'stock_sedes') s where s ->> 'categoria_id' = :'cat'),
     (select w ->> 'unidades' from jsonb_array_elements((:'h')::jsonb -> 'vendido_30') w where w ->> 'categoria_id' = :'cat'),
     (select string_agg(k, '+' order by k) from jsonb_object_keys((:'h')::jsonb) k));`,
  "80.00/30.00,Tienda Trujillo:5,3,catalogo+categorias+con_version+curvas+hoy+lineas+plan+planes+stock+stock_sedes+vendido+vendido_30"
);

// T. TOPE DE INVERSIÓN (ADR-0372 · B2) ------------------------------------------------------------------------------------
caso(
  "T1 un líder fija el tope, la hoja lo trae con su autor, y quitarlo lo deja en NULL sin perder quién lo tocó",
  `select retail.guardar_plan_compra_tope(:'plan', 12000.456);
   select (retail.fn_plan_compra() -> 'plan' ->> 'tope_inversion') as con \\gset
   select retail.guardar_plan_compra_tope(:'plan', null);
   select :'con' || ',' || coalesce((retail.fn_plan_compra() -> 'plan' ->> 'tope_inversion'), 'sin') || ',' ||
     (select (tope_actualizado_por is not null)::text from retail.planes_compra where id = :'plan');`,
  "12000.46,sin,true"
);
caso(
  "T2 rechaza un tope de cero, negativo o absurdo, con su mensaje",
  `select concat_ws(' / ',
     split_part(pg_temp.intento(format('select retail.guardar_plan_compra_tope(%L, 0)', :'plan')), '|', 2),
     split_part(pg_temp.intento(format('select retail.guardar_plan_compra_tope(%L, -5)', :'plan')), '|', 2),
     split_part(pg_temp.intento(format('select retail.guardar_plan_compra_tope(%L, 99999999999)', :'plan')), '|', 2));`,
  "El tope tiene que ser mayor que cero (o déjalo vacío para quitarlo). / El tope tiene que ser mayor que cero (o déjalo vacío para quitarlo). / El tope tiene que ser mayor que cero (o déjalo vacío para quitarlo)."
);
caso(
  "T3 sin el módulo, 42501; con el módulo pero sin ser líder, 42501 con su motivo; y nadie escribe la tabla directo",
  `reset role;
   select colab.rol_id as rol from retail.colaboradores colab join public.personas pe on pe.id = colab.persona_id where pe.auth_user_id = '${MICAELA}' \\gset
   ${como(MICAELA)}
   select split_part(pg_temp.intento(format('select retail.guardar_plan_compra_tope(%L, 100)', :'plan')), '|', 1) as sin_modulo \\gset
   reset role;
   insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'plan_compra') on conflict do nothing;
   ${como(MICAELA)}
   select :'sin_modulo' || ',' || pg_temp.intento(format('select retail.guardar_plan_compra_tope(%L, 100)', :'plan')) || ',' ||
     has_function_privilege('anon', 'retail.guardar_plan_compra_tope(uuid,numeric)', 'execute');`,
  "42501,42501|Solo un líder fija cuánto invertir en una campaña,false"
);
caso(
  "T4 el esquema hace imposible un tope sin autor o no positivo (aunque alguien escriba la tabla a mano)",
  `reset role;
   select concat_ws(' / ',
     split_part(pg_temp.intento(format('update retail.planes_compra set tope_inversion = 100, tope_actualizado_por = null, tope_actualizado_en = null where id = %L', :'plan')), '|', 1),
     split_part(pg_temp.intento(format('update retail.planes_compra set tope_inversion = 0, tope_actualizado_por = (select id from public.personas limit 1), tope_actualizado_en = now() where id = %L', :'plan')), '|', 1));`,
  "23514 / 23514"
);

// C. CREAR UNA CAMPAÑA (ADR-0372 · B3) ------------------------------------------------------------------------------------
const ETIQUETA_CAMPANA = `insert into retail.etiquetas (nombre, estilo, estado, activo, vigente_desde, vigente_hasta)
     values ('ZZ Campaña de prueba', 'campana', 'aprobado', true, date '2027-05-01', date '2027-05-10');
   select id as et from retail.etiquetas where nombre = 'ZZ Campaña de prueba' \\gset`;
caso(
  "C1 un líder crea el plan de una etiqueta: arranca con sus fechas y su nombre, queda ligado y firmado, y el selector lo ve",
  `${ETIQUETA_CAMPANA}
   select retail.crear_plan_compra(:'et') ->> 'nombre' as nombre \\gset
   select :'nombre' || ',' || (select p.desde || '/' || p.hasta || '/' || (p.etiqueta_id = :'et') || '/' || (p.creado_por is not null) from retail.planes_compra p where p.etiqueta_id = :'et') || ',' ||
     (select (e ->> 'plan_id') is not null from jsonb_array_elements(retail.fn_planes_compra() -> 'etiquetas') e where e ->> 'id' = :'et') || ',' ||
     -- El selector ve TODAS las campañas: las que ya había en la base y la nueva (sin depender de cuántas había: la base local es compartida).
     ((select count(*) from jsonb_array_elements(retail.fn_planes_compra() -> 'planes')) = (select count(*) from retail.planes_compra));`,
  "ZZ Campaña de prueba 2027,2027-05-01/2027-05-10/true/true,true,true"
);
caso(
  "C2 las fechas del plan se pueden ajustar (una ventana de compra más ancha que la de la etiqueta) y el nombre se puede poner",
  `${ETIQUETA_CAMPANA}
   select retail.crear_plan_compra(:'et', '  Mamá 2027 ', date '2027-04-20', date '2027-05-12');
   select (select p.nombre || ',' || p.desde || '/' || p.hasta from retail.planes_compra p where p.etiqueta_id = :'et');`,
  "Mamá 2027,2027-04-20/2027-05-12"
);
caso(
  "C3 rechaza una etiqueta que no es campaña aprobada con fechas, fechas al revés, el mismo plan dos veces y un nombre repetido",
  `${ETIQUETA_CAMPANA}
   insert into retail.etiquetas (nombre, estilo, estado, activo) values ('ZZ Positivo', 'positivo', 'aprobado', true);
   insert into retail.etiquetas (nombre, estilo, estado, activo) values ('ZZ Sin fechas', 'campana', 'aprobado', true);
   select concat_ws(' / ',
     split_part(pg_temp.intento(format('select retail.crear_plan_compra(%L)', (select id from retail.etiquetas where nombre = 'ZZ Positivo'))), '|', 2),
     split_part(pg_temp.intento(format('select retail.crear_plan_compra(%L)', (select id from retail.etiquetas where nombre = 'ZZ Sin fechas'))), '|', 2),
     split_part(pg_temp.intento(format('select retail.crear_plan_compra(%L, null, date ''2027-06-01'', date ''2027-05-01'')', :'et')), '|', 2),
     split_part(pg_temp.intento(format('select retail.crear_plan_compra(%L, ''Diciembre 2026'')', :'et')), '|', 2),
     (select retail.crear_plan_compra(:'et') ->> 'id' is not null),
     split_part(pg_temp.intento(format('select retail.crear_plan_compra(%L)', :'et')), '|', 2));`,
  "Elige una campaña de Catálogo ▸ Etiquetas que esté aprobada y tenga sus fechas. / Elige una campaña de Catálogo ▸ Etiquetas que esté aprobada y tenga sus fechas. / La campaña no puede terminar antes de empezar. / Ya hay un plan con ese nombre: ponle otro. / t / Esa campaña ya tiene su plan: ábrelo desde el selector."
);
caso(
  "C4 sin el módulo, 42501; con el módulo pero sin ser líder, 42501 con su motivo; y nadie ejecuta como anon",
  `${ETIQUETA_CAMPANA}
   reset role;
   select colab.rol_id as rol from retail.colaboradores colab join public.personas pe on pe.id = colab.persona_id where pe.auth_user_id = '${MICAELA}' \\gset
   ${como(MICAELA)}
   select split_part(pg_temp.intento(format('select retail.crear_plan_compra(%L)', :'et')), '|', 1) || '/' || split_part(pg_temp.intento('select retail.fn_planes_compra()'), '|', 1) as sin_modulo \\gset
   reset role;
   insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'plan_compra') on conflict do nothing;
   ${como(MICAELA)}
   select :'sin_modulo' || ',' || split_part(pg_temp.intento(format('select retail.crear_plan_compra(%L)', :'et')), '|', 2) || ',' ||
     has_function_privilege('anon', 'retail.crear_plan_compra(uuid,text,date,date)', 'execute') || ',' ||
     has_function_privilege('anon', 'retail.fn_planes_compra()', 'execute');`,
  "42501/42501,Solo un líder crea una campaña del plan,false,false"
);
caso(
  "C5 el esquema impide dos planes de la misma etiqueta (aunque alguien escriba la tabla a mano)",
  `${ETIQUETA_CAMPANA}
   reset role;
   insert into retail.planes_compra (nombre, desde, hasta, etiqueta_id) values ('ZZ A', date '2027-01-01', date '2027-01-02', :'et');
   select split_part(pg_temp.intento(format('insert into retail.planes_compra (nombre, desde, hasta, etiqueta_id) values (''ZZ B'', date ''2027-01-01'', date ''2027-01-02'', %L)', :'et')), '|', 1);`,
  "23505"
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
