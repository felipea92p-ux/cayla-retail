#!/usr/bin/env node
/**
 * Pruebas del PASO 2 del Plan de campaña (ADR-0526) — migración `20261026204000_plan_compra_paso_2_modelos.sql`: la tabla `planes_compra_paso_2` (fotos del reparto que solo se agregan) y las
 * funciones `fn_plan_compra_modelos` (la lectura), `fn_plan_compra_pasos_2` (qué categorías ya tienen su paso 2) y `guardar_plan_compra_paso_2` (guardar una foto nueva).
 *
 * LO QUE VIGILA. Que la lectura cuente lo mismo que `fn_plan_compra` (una venta completada y no de prueba, dentro de los 90 días; el stock libre de apartados y sin Cuarentena; sin modelos de prueba);
 * que guardar rechace lo imposible (un reparto que se pasa del total del paso 1, un modelo de otra categoría, una talla ajena, la misma celda dos veces, un color que no existe) sin escribir nada; que
 * una foto idéntica a la última no cree otra (un doble clic, un reintento) y que quien edita sobre una versión vieja no pise lo que otra persona guardó; que la tabla no se edite ni se borre; que
 * cada puerta responda a la sesión de la tienda (el rol `authenticated`, no el dueño: ADR-0496 rompió a toda la tienda 16 h por probar solo como dueño) y se cierre sin el módulo y a `anon`; que la
 * migración se pueda pegar dos veces; y que cuatro personas guardando a la vez la MISMA categoría dejen una sola foto vigente y nadie reciba un error que no sea el de «otra persona guardó».
 *
 * USO
 *   pnpm pruebas:plan-compra-paso-2              → contra la base `postgres` del stack local (cada caso en su transacción con ROLLBACK; la concurrencia, con filas reales que borra al terminar:
 *                                                  solo toca lo que ella creó, «ZZ Paso2 …»)
 *   pnpm pruebas:plan-compra-paso-2 --base otra  → contra otra base del mismo contenedor
 */

import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");
const MIGRACION = sinControl(readFileSync(join(RAIZ, "supabase", "migrations", "20261026204000_plan_compra_paso_2_modelos.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    const salida = execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Los datos de la prueba: una marca, tres categorías (una con tallas, una sin tallas, una fuera de los motores) y sus modelos, variantes, ventas y stock. Todo lleva «ZZ Paso2».
//   Modelo UNO (marca «Zz Marca P2»): NEGRO vendió 1 en t1 y 5 en t2; BLANCO vendió 2 en t2. Hay: NEGRO t2 3 (1 apartada → libre 2), NEGRO t1 4 en CUARENTENA (no cuenta), BLANCO t2 6.
//     Una venta ANULADA de 9, una de PRUEBA de 7 y una de hace 120 días de 4 NO cuentan. Resultado: vendió 8, hay 8.
//   Modelo DOS (sin marca): ROSA vendió 1 en t2; hay ROSA t1 3. Resultado: vendió 1, hay 3.
//   Modelo TRES es de prueba (vendió 7 y tiene 9): no aparece. Modelo CUATRO no vendió ni tiene stock: no aparece. Modelo OTRO es de otra categoría.
//   Dos prendas «sin registrar» pendientes en la categoría y una anulada: sin modelo = 2.
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
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
create function pg_temp.ok(p text) returns text language plpgsql as $$
begin
  if p <> 'SIN_ERROR' then raise exception 'la preparación del caso falló: %', p; end if;
  return p;
end $$;
-- Un modelo «de prueba» solo lo marca un líder de equipo (Felipe): los datos de la prueba los crea él.
${como(FELIPE)}
-- Las tres tallas de la categoría con tallas, y las de la que no las tiene (ninguna).
insert into retail.tallas (valor) values ('ZZP2-S'), ('ZZP2-M'), ('ZZP2-L') returning id;
select set_config('p2.t1', (select id::text from retail.tallas where valor = 'ZZP2-S'), true) as _a,
       set_config('p2.t2', (select id::text from retail.tallas where valor = 'ZZP2-M'), true) as _b,
       set_config('p2.t3', (select id::text from retail.tallas where valor = 'ZZP2-L'), true) as _c \\gset
insert into retail.marcas (nombre) values ('Zz Marca P2') returning id as marca \\gset
insert into retail.familias (codigo, nombre, entra_a_motores) values ('zzp2fuera', 'ZZ Paso2 Fuera', false) on conflict (codigo) do update set entra_a_motores = false;
insert into retail.categorias (nombre) values ('ZZ Paso2 Con Tallas') returning id as cat1 \\gset
insert into retail.categorias (nombre) values ('ZZ Paso2 Sin Tallas') returning id as cat2 \\gset
insert into retail.categorias (nombre, familia) values ('ZZ Paso2 Fuera De Motores', 'zzp2fuera') returning id as cat3 \\gset
select set_config('p2.cat1', :'cat1', true) as _1, set_config('p2.cat2', :'cat2', true) as _2, set_config('p2.cat3', :'cat3', true) as _3 \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat1', current_setting('p2.t1')::uuid), (:'cat1', current_setting('p2.t2')::uuid), (:'cat1', current_setting('p2.t3')::uuid);
insert into retail.productos (referencia, categoria_id, marca_id) values ('Zz Modelo Uno', :'cat1', :'marca') returning id as uno \\gset
insert into retail.productos (referencia, categoria_id) values ('Zz Modelo Dos', :'cat1') returning id as dos \\gset
insert into retail.productos (referencia, categoria_id, es_prueba) values ('Zz Modelo Tres', :'cat1', true) returning id as tres \\gset
insert into retail.productos (referencia, categoria_id) values ('Zz Modelo Cuatro', :'cat1') returning id as cuatro \\gset
insert into retail.productos (referencia, categoria_id) values ('Zz Modelo Otro', :'cat2') returning id as otro \\gset
select set_config('p2.uno', :'uno', true) as _1, set_config('p2.dos', :'dos', true) as _2, set_config('p2.tres', :'tres', true) as _3, set_config('p2.otro', :'otro', true) as _4, set_config('p2.cuatro', :'cuatro', true) as _5 \\gset
-- Las variantes: modelo × color × talla.
create function pg_temp.variante(p_producto uuid, p_color text, p_talla text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into retail.variantes (producto_id, precio, color_codigo, talla_id) values (p_producto, 100, p_color, case when p_talla is null then null else current_setting('p2.' || p_talla)::uuid end) returning id into v_id;
  return v_id;
end $$;
select set_config('p2.v_uno_neg_t1', pg_temp.variante(:'uno', 'NEG', 't1')::text, true) as _1, set_config('p2.v_uno_neg_t2', pg_temp.variante(:'uno', 'NEG', 't2')::text, true) as _2,
       set_config('p2.v_uno_neg_t3', pg_temp.variante(:'uno', 'NEG', 't3')::text, true) as _3, set_config('p2.v_uno_bla_t2', pg_temp.variante(:'uno', 'BLA', 't2')::text, true) as _4,
       set_config('p2.v_dos_ros_t1', pg_temp.variante(:'dos', 'ROS', 't1')::text, true) as _5, set_config('p2.v_dos_ros_t2', pg_temp.variante(:'dos', 'ROS', 't2')::text, true) as _6,
       set_config('p2.v_tres_neg_t1', pg_temp.variante(:'tres', 'NEG', 't1')::text, true) as _7, set_config('p2.v_cuatro_neg_t1', pg_temp.variante(:'cuatro', 'NEG', 't1')::text, true) as _8,
       set_config('p2.v_otro_neg', pg_temp.variante(:'otro', 'NEG', null)::text, true) as _9 \\gset
-- Una venta de la tienda con sus prendas: (estado, es_prueba, hace cuántos días, variante, cantidad).
create function pg_temp.venta(p_estado text, p_prueba boolean, p_hace integer, p_variante text, p_cantidad integer) returns uuid language plpgsql as $$
declare v_venta uuid;
begin
  insert into retail.ventas (ubicacion_id, estado, es_prueba, created_at, anulado_en, motivo_anulacion)
  values ((select id from retail.ubicaciones where nombre = 'Tienda Lima'), p_estado, p_prueba, now() - make_interval(days => p_hace),
          case when p_estado = 'anulada' then now() end, case when p_estado = 'anulada' then 'ZZ prueba del paso 2' end) returning id into v_venta;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (v_venta, current_setting('p2.' || p_variante)::uuid, p_cantidad, 100, 40);
  return v_venta;
end $$;
select pg_temp.venta('completada', false, 2, 'v_uno_neg_t1', 1) as _1, pg_temp.venta('completada', false, 3, 'v_uno_neg_t2', 5) as _2, pg_temp.venta('completada', false, 4, 'v_uno_bla_t2', 2) as _3,
       pg_temp.venta('completada', false, 5, 'v_dos_ros_t2', 1) as _4, pg_temp.venta('anulada', false, 2, 'v_uno_neg_t3', 9) as _5, pg_temp.venta('completada', true, 2, 'v_uno_neg_t3', 7) as _6,
       pg_temp.venta('completada', false, 120, 'v_uno_neg_t2', 4) as _7, pg_temp.venta('completada', false, 2, 'v_tres_neg_t1', 7) as _8 \\gset
-- El stock: libre de apartados y sin Cuarentena.
-- Cada tienda tiene una sola Cuarentena: se usa la que haya y, si no hay, se crea.
do $$
begin
  if not exists (select 1 from retail.sububicaciones where ubicacion_id = (select id from retail.ubicaciones where nombre = 'Tienda Lima') and tipo = 'cuarentena') then
    insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values ((select id from retail.ubicaciones where nombre = 'Tienda Lima'), 'ZZ Paso2 Cuarentena', 'cuarentena');
  end if;
end $$;
select id as cuarentena from retail.sububicaciones where ubicacion_id = (select id from retail.ubicaciones where nombre = 'Tienda Lima') and tipo = 'cuarentena' limit 1 \\gset
insert into retail.stock (variante_id, ubicacion_id, cantidad, cantidad_apartada) values
  (current_setting('p2.v_uno_neg_t2')::uuid, (select id from retail.ubicaciones where nombre = 'Tienda Lima'), 3, 1),
  (current_setting('p2.v_uno_bla_t2')::uuid, (select id from retail.ubicaciones where nombre = 'Tienda Lima'), 6, 0),
  (current_setting('p2.v_dos_ros_t1')::uuid, (select id from retail.ubicaciones where nombre = 'Tienda Trujillo'), 3, 0),
  (current_setting('p2.v_tres_neg_t1')::uuid, (select id from retail.ubicaciones where nombre = 'Tienda Lima'), 9, 0);
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
  values (current_setting('p2.v_uno_neg_t1')::uuid, (select id from retail.ubicaciones where nombre = 'Tienda Lima'), :'cuarentena', 4, 0);
-- Las prendas «sin registrar» de la categoría: dos pendientes y una anulada. Cada una cuelga de una venta con la prenda centinela.
create function pg_temp.sin_registrar(p_estado text) returns void language plpgsql as $$
declare v_venta uuid; v_item uuid;
begin
  -- Ayer, no «ahora»: la lectura cuenta lo que pasó ANTES de este instante, y dentro de una transacción now() es el mismo para todo.
  insert into retail.ventas (ubicacion_id, created_at) values ((select id from retail.ubicaciones where nombre = 'Tienda Lima'), now() - interval '1 day') returning id into v_venta;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (v_venta, '22222222-2222-4222-8222-222222222222', 1, 80, 30) returning id into v_item;
  insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, estado)
  values (v_item, (select id from retail.ubicaciones where nombre = 'Tienda Lima'), 'ZZ prenda', current_setting('p2.cat1')::uuid, current_setting('p2.t2')::uuid, 'NEG', 80, p_estado);
end $$;
select pg_temp.sin_registrar('pendiente') as _1, pg_temp.sin_registrar('pendiente') as _2, pg_temp.sin_registrar('anulada') as _3 \\gset
-- Un plan de prueba (el de la campaña) para colgar el paso 2.
select id as plan from retail.planes_compra order by desde limit 1 \\gset
select set_config('p2.plan', :'plan', true) as _p \\gset
-- Las filas del reparto, en una línea: (modelo, color, talla, prendas).
create function pg_temp.celda(p_modelo text, p_color text, p_talla text, p_n integer) returns jsonb language sql as $$
  select jsonb_build_object('p', current_setting('p2.' || p_modelo), 'c', p_color, 't', case when p_talla is null then null else current_setting('p2.' || p_talla) end, 'n', p_n) $$;
-- Guarda con todos los argumentos (null = sin él) y dice cómo salió: 'SIN_ERROR' o 'estado|mensaje'.
create function pg_temp.guarda(p_categoria text, p_pct integer, p_total integer, p_items jsonb, p_esperada integer default 0) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.guardar_plan_compra_paso_2(%L::uuid, %L::uuid, %L::integer, %L::integer, %L::jsonb, %L::integer)',
    current_setting('p2.plan'), current_setting('p2.' || p_categoria), p_pct, p_total, p_items, p_esperada));
end $$;
-- Cuántas fotos hay de una categoría, y la versión más alta.
create function pg_temp.fotos(p_categoria text) returns text language sql as $$
  select count(*) || ':' || coalesce(max(version), 0) from retail.planes_compra_paso_2 where plan_id = current_setting('p2.plan')::uuid and categoria_id = current_setting('p2.' || p_categoria)::uuid $$;
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
const codigo = (r) => `split_part(${r}, '|', 1)`;
// La lectura de una categoría, como la ve la tienda.
const LEE = (categoria) => `retail.fn_plan_compra_modelos(current_setting('p2.plan')::uuid, current_setting('p2.${categoria}')::uuid)`;
// Un modelo de la lectura: «nombre:vendidas:hay:marca» (marca «-» si no tiene).
const MODELOS = (categoria) => `(select string_agg((m->>'nombre') || ':' || (m->>'vendidas') || ':' || (m->>'hay') || ':' || coalesce(m->>'marca', '-'), ',' order by (m->>'vendidas')::int desc, m->>'nombre') from jsonb_array_elements(${LEE(categoria)}->'modelos') m)`;

console.log("— La lectura —");
caso(
  "L1 los modelos que vendieron o tienen stock, con su marca y del que más vendió al que menos; sin ventas anuladas, de prueba ni de hace más de 90 días, sin el stock apartado ni el de Cuarentena, y sin modelos de prueba",
  `select ${MODELOS("cat1")};`,
  "Zz Modelo Uno:8:8:Zz Marca P2,Zz Modelo Dos:1:3:-",
);
caso(
  "L2 de un modelo, sus colores (del que más vendió) y de cada color sus tallas, con lo vendido y lo que hay",
  `select string_agg((c->>'codigo') || ':' || (c->>'vendidas') || ':' || (c->>'hay') || '[' || (select string_agg(coalesce((select t.valor from retail.tallas t where t.id = (x->>'id')::uuid), '-') || '=' || (x->>'vendidas') || '/' || (x->>'hay'), ',' order by (select t.valor from retail.tallas t where t.id = (x->>'id')::uuid)) from jsonb_array_elements(c->'tallas') x) || ']', ';' order by (c->>'vendidas')::int desc, c->>'codigo')
     from jsonb_array_elements((select m->'colores' from jsonb_array_elements(${LEE("cat1")}->'modelos') m where m->>'nombre' = 'Zz Modelo Uno')) c;`,
  "NEG:6:2[ZZP2-M=5/2,ZZP2-S=1/0];BLA:2:6[ZZP2-M=2/6]",
);
caso(
  "L3 las ventas de la categoría SIN modelo (anotadas «sin registrar»): solo las pendientes; los colores de toda la categoría van del que más vendió; las tallas son las de la categoría",
  `select (${LEE("cat1")}->>'sin_modelo') || ',' || (select string_agg((c->>'codigo') || ':' || (c->>'vendidas'), ';' order by (c->>'vendidas')::int desc, c->>'codigo') from jsonb_array_elements(${LEE("cat1")}->'colores_categoria') c)
     || ',' || jsonb_array_length(${LEE("cat1")}->'tallas');`,
  "2,NEG:6;BLA:2;ROS:1,3",
);
caso(
  "L4 una categoría fuera de los motores (bolsas, empaque) no se reparte en modelos; una que no existe, o desactivada, se rechaza",
  `select (${LEE("cat3")}->>'entra') || ',' || ${codigo(`pg_temp.intento(format('select retail.fn_plan_compra_modelos(%L::uuid, %L::uuid)', current_setting('p2.plan'), '00000000-0000-0000-0000-000000000000'))`)};`,
  "false,P0001",
);
caso(
  "L5 sin nada guardado dice «guardado: null»; con un paso 2 guardado trae la última foto con quién y cuándo",
  `select ((${LEE("cat1")}->'guardado') = 'null'::jsonb)::text as a \\gset
   ${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda('cat1', 60, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5)))) as _1 \\gset
   select :'a' || ',' || (${LEE("cat1")}->'guardado'->>'version') || ',' || (${LEE("cat1")}->'guardado'->>'unidades') || ',' || (${LEE("cat1")}->'guardado'->>'por' is not null);`,
  "true,1,5,true",
);

caso(
  "L6 lo que ya se eligió aparece SIEMPRE, aunque ese modelo ya no tenga ventas en 90 días ni stock (si no, la pantalla no lo vería y al guardar de nuevo se perdería en silencio)",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda('cat1', 60, 20, jsonb_build_array(pg_temp.celda('cuatro', 'ROS', 't2', 3)))) as _1 \\gset
   select (select string_agg((m->>'nombre') || ':' || (m->>'vendidas') || ':' || (m->>'hay'), ',' order by m->>'nombre') from jsonb_array_elements(${LEE("cat1")}->'modelos') m);`,
  "Zz Modelo Cuatro:0:0,Zz Modelo Dos:1:3,Zz Modelo Uno:8:8",
);

console.log("\n— Guardar —");
caso(
  "G1 guardar crea la versión 1; con cambios y la versión que se leyó (1) crea la 2; la lectura trae la última y las dos quedan guardadas",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda('cat1', 60, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5), pg_temp.celda('uno', 'BLA', 't2', 2)), 0)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda('cat1', 70, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 6), pg_temp.celda('uno', 'NEG', 't1', 1), pg_temp.celda('dos', 'ROS', 't2', 3)), 1)) as _2 \\gset
   select pg_temp.fotos('cat1') || ',' || (${LEE("cat1")}->'guardado'->>'version') || ',' || (${LEE("cat1")}->'guardado'->>'pct') || ',' || (${LEE("cat1")}->'guardado'->>'unidades');`,
  "2:2,2,70,10",
);
caso(
  "G2 lo idéntico a lo ya guardado (un doble clic, un reintento tras un corte de red) no crea otra foto y responde con la misma versión; las mismas filas en otro orden también son lo mismo",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda('cat1', 60, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5), pg_temp.celda('uno', 'BLA', 't2', 2)), 0)) as _1 \\gset
   select retail.guardar_plan_compra_paso_2(current_setting('p2.plan')::uuid, current_setting('p2.cat1')::uuid, 60, 20,
     jsonb_build_array(pg_temp.celda('uno', 'BLA', 't2', 2), pg_temp.celda('uno', 'NEG', 't2', 5)), 0)->>'sin_cambios' as r \\gset
   select :'r' || ',' || pg_temp.fotos('cat1');`,
  "true,1:1",
);
caso(
  "G3 quien edita sobre una versión vieja NO pisa lo que otra persona guardó: se rechaza con «guardó otro paso 2» (PT409) y no se escribe nada; con la versión al día sí se guarda",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda('cat1', 60, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5)), 0)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda('cat1', 50, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 4)), 1)) as _2 \\gset
   select pg_temp.guarda('cat1', 80, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 9)), 1) as r \\gset
   select ${codigo(":'r'")} || ',' || (:'r' like '%guardó otro paso 2%') || ',' || pg_temp.fotos('cat1') || ',' || ${codigo(`pg_temp.guarda('cat1', 80, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 9)), 2)`)};`,
  "PT409,true,2:2,SIN_ERROR",
);
caso(
  "G4 un reparto que se pasa del total del paso 1 se rechaza diciendo cuánto, y no escribe nada; justo el total, sí; sin prendas (todo a modelos nuevos) también vale",
  `${como(FELIPE)}
   select pg_temp.guarda('cat1', 60, 6, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5), pg_temp.celda('uno', 'BLA', 't2', 2))) as r \\gset
   select ${codigo(":'r'")} || ',' || (:'r' like '%te pasas por 1%') || ',' || pg_temp.fotos('cat1') || ',' || pg_temp.guarda('cat1', 60, 7, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5), pg_temp.celda('uno', 'BLA', 't2', 2))) || ',' || pg_temp.guarda('cat1', 0, 0, '[]'::jsonb, 1);`,
  "P0001,true,0:0,SIN_ERROR,SIN_ERROR",
);
caso(
  "G5 lo imposible se rechaza sin escribir: un modelo de otra categoría, de prueba o que no existe; un color que no existe; una talla que no es de la categoría o que falta; la misma celda dos veces; 0 o demasiadas prendas",
  `${como(FELIPE)}
   select ${codigo("pg_temp.guarda('cat1', 60, 50, jsonb_build_array(pg_temp.celda('otro', 'NEG', 't1', 1)))")} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 60, 50, jsonb_build_array(pg_temp.celda('tres', 'NEG', 't1', 1)))")} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 60, 50, jsonb_build_array(pg_temp.celda('uno', 'ZZZ', 't1', 1)))")} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 60, 50, jsonb_build_array(pg_temp.celda('uno', 'NEG', null, 1)))")} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 60, 50, jsonb_build_array(jsonb_build_object('p', current_setting('p2.uno'), 'c', 'NEG', 't', gen_random_uuid(), 'n', 1)))")} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 60, 50, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't1', 1), pg_temp.celda('uno', 'NEG', 't1', 2)))")} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 60, 50, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't1', 0)))")} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 60, 500000, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't1', 100001)))")} || ',' || pg_temp.fotos('cat1');`,
  "P0001,P0001,P0001,P0001,P0001,P0001,P0001,P0001,0:0",
);
caso(
  "G6 lo que no se entiende se dice con claridad (no con el error crudo de Postgres): un texto donde va el id, una fila que no es un objeto, un % fuera de 0 a 100, un total negativo, algo que no es una lista",
  `${como(FELIPE)}
   select pg_temp.guarda('cat1', 60, 50, jsonb_build_array(jsonb_build_object('p', 'no-es-un-id', 'c', 'NEG', 't', current_setting('p2.t1'), 'n', 1))) as a \\gset
   select ${codigo(":'a'")} || ',' || (:'a' like '%no se entiende%') || ',' ||
          ${codigo("pg_temp.guarda('cat1', 60, 50, jsonb_build_array(5, 'x'))")} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 101, 50, '[]'::jsonb)")} || ',' || ${codigo("pg_temp.guarda('cat1', -1, 50, '[]'::jsonb)")} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 50, -3, '[]'::jsonb)")} || ',' || ${codigo("pg_temp.guarda('cat1', 50, 10, '{}'::jsonb)")} || ',' || pg_temp.fotos('cat1');`,
  "P0001,true,P0001,P0001,P0001,P0001,P0001,0:0",
);
caso(
  "G7 una categoría SIN tallas guarda con la talla vacía y rechaza una talla; una CON tallas rechaza la talla vacía",
  `${como(FELIPE)}
   select pg_temp.celda('otro', 'NEG', null, 3) as fila \\gset
   select pg_temp.guarda('cat2', 50, 10, jsonb_build_array(:'fila'::jsonb)) || ',' || ${codigo("pg_temp.guarda('cat2', 50, 10, jsonb_build_array(pg_temp.celda('otro', 'NEG', 't1', 3)))")} || ',' || ${codigo("pg_temp.guarda('cat1', 50, 10, jsonb_build_array(pg_temp.celda('uno', 'NEG', null, 3)))")} || ',' || pg_temp.fotos('cat2') || ',' || pg_temp.fotos('cat1');`,
  "SIN_ERROR,P0001,P0001,1:1,0:0",
);
caso(
  "G8 la tabla no se edita ni se borra, ni con el dueño: una foto guardada es la que fue",
  `${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda('cat1', 60, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5)))) as _1 \\gset
   select ${codigo("pg_temp.intento('update retail.planes_compra_paso_2 set pct = 1')")} || ',' || ${codigo("pg_temp.intento('delete from retail.planes_compra_paso_2')")} || ',' || pg_temp.fotos('cat1');`,
  (o) => /^(P0001|23000|[0-9A-Z]{5}),(P0001|23000|[0-9A-Z]{5}),1:1$/.test(o) && !o.startsWith("SIN_ERROR"),
);
caso(
  "G9 qué categorías ya tienen su paso 2: la última foto de cada una, con la versión, el %, el total y las prendas; sin nada guardado, una lista vacía",
  `select jsonb_array_length(retail.fn_plan_compra_pasos_2(current_setting('p2.plan')::uuid)->'repartos' ) as antes \\gset
   ${como(FELIPE)}
   select pg_temp.ok(pg_temp.guarda('cat1', 60, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5)))) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda('cat1', 70, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 8)), 1)) as _2 \\gset
   select pg_temp.ok(pg_temp.guarda('cat2', 10, 5, jsonb_build_array(pg_temp.celda('otro', 'NEG', null, 2)))) as _3 \\gset
   select :'antes' || ',' || (select string_agg((r->>'version') || ':' || (r->>'pct') || ':' || (r->>'total') || ':' || (r->>'unidades'), ';' order by (r->>'pct')::int desc)
            from jsonb_array_elements(retail.fn_plan_compra_pasos_2(current_setting('p2.plan')::uuid)->'repartos') r
           where (r->>'categoria_id')::uuid in (current_setting('p2.cat1')::uuid, current_setting('p2.cat2')::uuid));`,
  "0,2:70:20:8;1:10:5:2",
);

console.log("\n— Puertas —");
caso(
  "P1 con el rol de la tienda (authenticated, no el dueño) las tres funciones responden y guardan",
  `${como(FELIPE)}
   set local role authenticated;
   select (retail.fn_plan_compra_modelos(current_setting('p2.plan')::uuid, current_setting('p2.cat1')::uuid)->>'entra') || ',' || (retail.fn_plan_compra_pasos_2(current_setting('p2.plan')::uuid)->>'soportado') || ',' ||
          (retail.guardar_plan_compra_paso_2(current_setting('p2.plan')::uuid, current_setting('p2.cat1')::uuid, 60, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5)), 0)->>'version');`,
  "true,true,1",
);
caso(
  "P2 sin el módulo (Micaela) las tres dan 42501 y no escriben nada",
  `${como(MICAELA)}
   select ${codigo(`pg_temp.intento(format('select retail.fn_plan_compra_modelos(%L::uuid, %L::uuid)', current_setting('p2.plan'), current_setting('p2.cat1')))`)} || ',' ||
          ${codigo(`pg_temp.intento(format('select retail.fn_plan_compra_pasos_2(%L::uuid)', current_setting('p2.plan')))`)} || ',' ||
          ${codigo("pg_temp.guarda('cat1', 60, 20, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't2', 5)))")} || ',' || pg_temp.fotos('cat1');`,
  "42501,42501,42501,0:0",
);
caso(
  "P3 anon no ejecuta ninguna y la tabla no se lee ni se escribe desde la web (sin permisos de tabla y con RLS sin políticas)",
  `select (has_function_privilege('anon', 'retail.fn_plan_compra_modelos(uuid, uuid)', 'execute') or has_function_privilege('anon', 'retail.fn_plan_compra_pasos_2(uuid)', 'execute') or has_function_privilege('anon', 'retail.guardar_plan_compra_paso_2(uuid, uuid, integer, integer, jsonb, integer)', 'execute'))::text || ',' ||
          (has_function_privilege('authenticated', 'retail.fn_plan_compra_modelos(uuid, uuid)', 'execute') and has_function_privilege('authenticated', 'retail.guardar_plan_compra_paso_2(uuid, uuid, integer, integer, jsonb, integer)', 'execute'))::text || ',' ||
          (has_table_privilege('authenticated', 'retail.planes_compra_paso_2', 'select') or has_table_privilege('authenticated', 'retail.planes_compra_paso_2', 'insert'))::text || ',' ||
          (select c.relrowsecurity::text from pg_class c where c.oid = 'retail.planes_compra_paso_2'::regclass) || ',' ||
          (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'planes_compra_paso_2');`,
  "false,true,false,true,0",
);
caso(
  "P4 las tres públicas son security definer con search_path fijo (una función con permisos del dueño sin esto se podría engañar con otro esquema)",
  `select count(*) filter (where p.prosecdef) || ',' || count(*) filter (where p.proconfig::text like '%search_path=retail, public, extensions%')
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_plan_compra_modelos', 'fn_plan_compra_pasos_2', 'guardar_plan_compra_paso_2');`,
  "3,3",
);

console.log("\n— La migración —");
caso(
  "M1 pegarla dos veces deja lo mismo: sin error, una sola de cada función, un solo disparador y una sola tabla",
  `${MIGRACION}
   select (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_plan_compra_modelos', 'fn_plan_compra_pasos_2', 'guardar_plan_compra_paso_2')) || ',' ||
          (select count(*) from pg_trigger where tgrelid = 'retail.planes_compra_paso_2'::regclass and tgname = 'planes_compra_paso_2_inmutable' and not tgisinternal) || ',' ||
          (select count(*) from pg_class where relname = 'planes_compra_paso_2' and relnamespace = 'retail'::regnamespace);`,
  "3,1,1",
);

// Concurrencia con sesiones reales: cuatro personas guardan a la vez la MISMA categoría desde la versión 0. Se crean los datos de verdad (con commit), se corre y se borra todo al terminar.
console.log("\n— Dos personas a la vez —");
const SEMILLA_REAL = `
set search_path = retail, public, extensions;
${MIGRACION}
insert into retail.tallas (valor) values ('ZZP2R-S') on conflict do nothing;
insert into retail.categorias (nombre) values ('ZZ Paso2 Concurrencia') returning id as cat \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) select :'cat', id from retail.tallas where valor = 'ZZP2R-S';
insert into retail.productos (referencia, categoria_id) values ('Zz Paso2 Modelo Real', :'cat') returning id as prod \\gset
select id as plan from retail.planes_compra order by desde limit 1 \\gset
select id as talla from retail.tallas where valor = 'ZZP2R-S' \\gset
select :'cat' || '|' || :'prod' || '|' || :'plan' || '|' || :'talla';
`;
const LIMPIEZA_REAL = `
set session_replication_role = replica;
delete from retail.planes_compra_paso_2 where categoria_id in (select id from retail.categorias where nombre = 'ZZ Paso2 Concurrencia');
delete from retail.productos where referencia ilike 'ZZ Paso2 Modelo Real';
delete from retail.categoria_tallas where categoria_id in (select id from retail.categorias where nombre = 'ZZ Paso2 Concurrencia');
delete from retail.categorias where nombre = 'ZZ Paso2 Concurrencia';
delete from retail.tallas where valor = 'ZZP2R-S';
`;
function concurrencia() {
  casos++;
  // Quita cualquier resto de una corrida anterior que se cortó a medias.
  correr(LIMPIEZA_REAL);
  const sem = correr(SEMILLA_REAL);
  if (!sem.ok) {
    fallas++;
    console.log(`✗ C1 la preparación falló: ${sem.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? sem.mensaje}`);
    return Promise.resolve();
  }
  const [cat, prod, plan, talla] = sem.salida.split("\n").at(-1).split("|");
  const una = (n) =>
    new Promise((resolver) => {
      const sql = `${como(FELIPE)}select coalesce((select retail.guardar_plan_compra_paso_2('${plan}', '${cat}', ${50 + n}, 40, jsonb_build_array(jsonb_build_object('p', '${prod}', 'c', 'NEG', 't', '${talla}', 'n', ${n + 1})), 0))::text, 'x');`;
      const h = execFile("docker", ARGS_PSQL, { maxBuffer: 1 << 20 }, (err, salida, stderr) => resolver(err ? `ERR ${((stderr ?? "").split("\n").find((l) => l.includes("ERROR")) ?? stderr).trim()}` : `OK ${salida.trim()}`));
      h.stdin.end(`begin;\n${sql}\ncommit;`);
    });
  return Promise.all([1, 2, 3, 4].map(una)).then((res) => {
    const filas = correr(`select count(*) || ':' || coalesce(max(version), 0) || ':' || count(distinct version) from retail.planes_compra_paso_2 where categoria_id = '${cat}';`);
    correr(LIMPIEZA_REAL);
    const ganaron = res.filter((r) => r.startsWith("OK")).length;
    const perdieron = res.filter((r) => /guardó otro paso 2/.test(r)).length;
    const bien = filas.ok && filas.salida === "1:1:1" && ganaron === 1 && perdieron === 3;
    if (!bien) {
      fallas++;
      console.log(`✗ C1 cuatro personas guardan a la vez la misma categoría desde la versión 0: gana UNA y las otras tres reciben «guardó otro paso 2», sin fotos repetidas\n    obtenido: ganaron ${ganaron}, perdieron ${perdieron}, fotos ${filas.ok ? filas.salida : filas.mensaje}\n    ${res.join("\n    ")}`);
    } else {
      console.log("✓ C1 cuatro personas guardan a la vez la misma categoría desde la versión 0: gana UNA y las otras tres reciben «guardó otro paso 2», sin fotos repetidas");
    }
  });
}

await concurrencia();
console.log(`\n${casos - fallas}/${casos} casos bien.`);
process.exit(fallas ? 1 : 0);
