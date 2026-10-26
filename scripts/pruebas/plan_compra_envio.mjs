#!/usr/bin/env node
/**
 * Pruebas de ENVIAR A COMPRAS (ADR-0530) — migración `20261026222000_plan_compra_enviar_a_compras.sql`: las tablas `pedidos_campana` (un pedido PENDIENTE por campaña, categoría y proveedor, con la fecha
 * en que la persona piensa pedirlo) y `pedidos_campana_lineas` (la foto de lo enviado), y las funciones `fn_plan_compra_envio` / `fn_plan_compra_envios` (la lectura del Plan), `enviar_plan_compra_a_compras`,
 * `cambiar_fecha_pedido_campana`, `rectificar_pedido_campana`, `confirmar_pedido_campana` (el único paso que crea la orden de compra), `fn_pedidos_campana` y `fn_pedido_campana_lineas` (lo que lee Compras).
 *
 * LO QUE VIGILA. Que la lectura agrupe el paso 2 guardado por proveedor y diga lo que NO se envía (sin proveedor, sin marca, lo del Taller, los modelos nuevos); que enviar deje pendientes sin pedir nada,
 * rechace lo imposible (otra versión del paso 2, un proveedor sin nada en el reparto, el Taller, una fecha pasada o de más de un año, un proveedor o una marca inactivos) SIN escribir nada, y que repetirlo idéntico
 * (un doble clic) no cree otro; que cambiar la fecha y rectificar solo valgan mientras está pendiente; que confirmar cree LA orden de compra (con sus líneas por modelo, el costo del plan y la entrega para
 * el inicio de la campaña, de modo que el Plan la cuente como pedida) y la deje ligada, una sola vez aunque se confirme dos veces; que si la orden no se puede crear el pedido siga pendiente; que el esquema
 * haga imposibles los estados que nunca deben existir (la restricción de la tabla, no la pantalla); que cada puerta responda a la sesión de la tienda (el rol `authenticated`, no el dueño) y se cierre sin
 * el módulo que le toca (enviar: «Plan de campaña»; confirmar: «Órdenes de compra») y a `anon`; que la migración se pueda pegar dos veces; y que sesiones reales a la vez (cuatro que envían lo mismo, cuatro
 * que confirman lo mismo, una que confirma contra una que rectifica) dejen un solo pedido, una sola orden y nunca un pedido «pedido» sin orden ni una orden de un pedido rectificado.
 *
 * USO
 *   pnpm pruebas:plan-compra-envio              → contra la base `postgres` del stack local (cada caso en su transacción con ROLLBACK; la concurrencia, con filas reales que borra al terminar:
 *                                                 solo toca lo que ella creó, «ZZ Envio Real …»)
 *   pnpm pruebas:plan-compra-envio --base otra  → contra otra base del mismo contenedor
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
const MIGRACION = sinControl(readFileSync(join(RAIZ, "supabase", "migrations", "20261026222000_plan_compra_enviar_a_compras.sql"), "utf8"));

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

// Los datos de la prueba, en psql (:'plan', :'cat', :'pa'…) y en la sesión (current_setting('pe.plan')…). Una campaña (del hoy + 40 al hoy + 60), una categoría con tres tallas, un costo de 40 en el plan y siete modelos:
//   Uno y Dos del proveedor A (marca 1) · Tres del proveedor B (marca 2) · Taller del propio taller (CAYLA SAC) · SinProv sin proveedor · SinMarca con proveedor pero sin marca.
// `n` es el nombre de la prueba y `p` el prefijo de los modelos: la prueba de sesiones reales usa otros para no tocar nunca lo de las demás.
const DATOS = ({ n, p }) => `
select retail.fn_actor_persona_id(true) as persona \\gset
insert into retail.tallas (valor) select v from (values ('S'), ('M'), ('L')) t(v) where not exists (select 1 from retail.tallas x where x.valor = t.v);
select (select id from retail.tallas where valor = 'S' limit 1) as t1, (select id from retail.tallas where valor = 'M' limit 1) as t2, (select id from retail.tallas where valor = 'L' limit 1) as t3 \\gset
insert into retail.marcas (nombre) values ('${n} Marca 1') returning id as m1 \\gset
insert into retail.marcas (nombre) values ('${n} Marca 2') returning id as m2 \\gset
insert into retail.proveedores (nombre) values ('${n} Prov A') returning id as pa \\gset
insert into retail.proveedores (nombre) values ('${n} Prov B') returning id as pb \\gset
insert into retail.proveedores (nombre) select 'CAYLA SAC' where not exists (select 1 from retail.proveedores x where retail.fn_clave_texto(x.nombre) = 'cayla sac');
insert into retail.marcas (nombre) select 'CAYLA' where not exists (select 1 from retail.marcas x where x.nombre = 'CAYLA');
select (select id from retail.proveedores where retail.fn_clave_texto(nombre) = 'cayla sac' limit 1) as pt, (select id from retail.marcas where nombre = 'CAYLA' limit 1) as mt \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) select :'mt', :'pt' where not exists (select 1 from retail.marca_proveedores x where x.marca_id = :'mt' and x.proveedor_id = :'pt');
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'m1', :'pa'), (:'m2', :'pb');
insert into retail.categorias (nombre) values ('${n} Categoria') returning id as cat \\gset
insert into retail.categoria_tallas (categoria_id, talla_id) values (:'cat', :'t1'), (:'cat', :'t2'), (:'cat', :'t3');
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('${p} Uno', :'cat', :'m1', :'pa') returning id as uno \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('${p} Dos', :'cat', :'m1', :'pa') returning id as dos \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('${p} Tres', :'cat', :'m2', :'pb') returning id as tres \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('${p} Taller', :'cat', :'mt', :'pt') returning id as taller \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('${p} SinProv', :'cat', :'m1', null) returning id as sinprov \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('${p} SinMarca', :'cat', null, :'pa') returning id as sinmarca \\gset
insert into retail.planes_compra (nombre, desde, hasta) values ('${n} Plan', current_date + 40, current_date + 60) returning id as plan \\gset
insert into retail.planes_compra_lineas (plan_id, categoria_id, flojo, normal, bueno, precio, costo, recupero_pct, actualizado_por) values (:'plan', :'cat', 10, 20, 30, 100.00, 40.00, 50, :'persona');
select set_config('pe.plan', :'plan', true) as _1, set_config('pe.cat', :'cat', true) as _2, set_config('pe.persona', :'persona', true) as _3,
       set_config('pe.pa', :'pa', true) as _4, set_config('pe.pb', :'pb', true) as _5, set_config('pe.pt', :'pt', true) as _6,
       set_config('pe.m1', :'m1', true) as _7, set_config('pe.m2', :'m2', true) as _8,
       set_config('pe.t1', :'t1', true) as _9, set_config('pe.t2', :'t2', true) as _10, set_config('pe.t3', :'t3', true) as _11,
       set_config('pe.uno', :'uno', true) as _12, set_config('pe.dos', :'dos', true) as _13, set_config('pe.tres', :'tres', true) as _14,
       set_config('pe.taller', :'taller', true) as _15, set_config('pe.sinprov', :'sinprov', true) as _16, set_config('pe.sinmarca', :'sinmarca', true) as _17 \\gset
`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_pista text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_pista = pg_exception_hint;
  return v_estado || '|' || v_msg || '|' || coalesce(v_pista, '');
end;
$f$;
create function pg_temp.ok(p text) returns text language plpgsql as $$
begin
  if p <> 'SIN_ERROR' then raise exception 'la preparación del caso falló: %', p; end if;
  return p;
end $$;
-- La pista de un error (lo que la pantalla lee para decidir qué decir) y su código.
create function pg_temp.pista(p text) returns text language sql as $$ select split_part(p, '|', 3) $$;
create function pg_temp.codigo(p text) returns text language sql as $$ select split_part(p, '|', 1) $$;
-- Dice 'ok' si el SQL falló con ese código y nombrando eso; si no, devuelve lo que pasó (para ver qué fue).
create function pg_temp.falla(p_sql text, p_codigo text, p_texto text) returns text language plpgsql as $$
declare r text := pg_temp.intento(p_sql);
begin
  if pg_temp.codigo(r) = p_codigo and position(p_texto in r) > 0 then return 'ok'; end if;
  return r;
end $$;
${como(FELIPE)}
${DATOS({ n: "ZZ Envio", p: "Zz Env" })}
-- Una celda del reparto: (modelo, color, talla, prendas).
create function pg_temp.celda(p_modelo text, p_color text, p_talla text, p_n integer) returns jsonb language sql as $$
  select jsonb_build_object('p', current_setting('pe.' || p_modelo), 'c', p_color, 't', case when p_talla is null then null else current_setting('pe.' || p_talla) end, 'n', p_n) $$;
-- Guarda el paso 2 de la categoría (60 % de lo que ya vendió, el total del paso 1 que se diga).
create function pg_temp.guarda_p2(p_total integer, p_items jsonb, p_esperada integer default 0) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.guardar_plan_compra_paso_2(%L::uuid, %L::uuid, 60, %L::integer, %L::jsonb, %L::integer)', current_setting('pe.plan'), current_setting('pe.cat'), p_total, p_items, p_esperada));
end $$;
-- Un envío: (proveedor, cuándo, fecha).
create function pg_temp.envio(p_prov text, p_cuando text default 'ya', p_fecha text default null) returns jsonb language sql as $$
  select jsonb_build_object('proveedor_id', current_setting('pe.' || p_prov), 'cuando', p_cuando, 'fecha', p_fecha) $$;
create function pg_temp.envia(p_version integer, p_envios jsonb) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.enviar_plan_compra_a_compras(%L::uuid, %L::uuid, %L::integer, %L::jsonb)', current_setting('pe.plan'), current_setting('pe.cat'), p_version, p_envios));
end $$;
create function pg_temp.rect(p_pedido uuid, p_motivo text) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.rectificar_pedido_campana(%L::uuid, %L)', p_pedido, p_motivo));
end $$;
create function pg_temp.cambia(p_pedido uuid, p_cuando text, p_fecha date default null) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.cambiar_fecha_pedido_campana(%L::uuid, %L, %L::date)', p_pedido, p_cuando, p_fecha));
end $$;
create function pg_temp.conf(p_pedido uuid) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.confirmar_pedido_campana(%L::uuid)', p_pedido));
end $$;
create function pg_temp.lee() returns jsonb language sql as $$
  select retail.fn_plan_compra_envio(current_setting('pe.plan')::uuid, current_setting('pe.cat')::uuid) $$;
create function pg_temp.grupo(p_prov text) returns jsonb language sql as $$
  select g from jsonb_array_elements(pg_temp.lee() -> 'base' -> 'grupos') g where g ->> 'proveedor_id' = current_setting('pe.' || p_prov) $$;
-- Cuántos pedidos hay en la categoría (en un estado, o todos).
create function pg_temp.cuantos(p_estado text default null) returns integer language sql as $$
  select count(*)::integer from retail.pedidos_campana where plan_id = current_setting('pe.plan')::uuid and categoria_id = current_setting('pe.cat')::uuid and (p_estado is null or estado = p_estado) $$;
-- El pedido vigente (pendiente o pedido) de un proveedor.
create function pg_temp.pedido(p_prov text) returns uuid language sql as $$
  select id from retail.pedidos_campana where plan_id = current_setting('pe.plan')::uuid and categoria_id = current_setting('pe.cat')::uuid
     and proveedor_id = current_setting('pe.' || p_prov)::uuid and estado in ('pendiente', 'pedido') $$;
-- Una columna del pedido de un proveedor: el vigente, y si no hay, el último rectificado.
create function pg_temp.col(p_prov text, p_col text) returns text language sql as $$
  select to_jsonb(pe) ->> p_col from retail.pedidos_campana pe
   where pe.plan_id = current_setting('pe.plan')::uuid and pe.categoria_id = current_setting('pe.cat')::uuid and pe.proveedor_id = current_setting('pe.' || p_prov)::uuid
   order by (pe.estado = 'rectificado'), pe.enviado_en desc limit 1 $$;
-- Cuántas órdenes de compra nacieron de pedidos de campaña de esta prueba.
create function pg_temp.ordenes() returns integer language sql as $$
  select count(*)::integer from retail.ordenes_compra where nota like 'Pedido de campaña: ZZ Envio Plan%' $$;
`;

// El paso 2 de la categoría, ya guardado (versión 1): 14 prendas del proveedor A (Uno 10 + Dos 4), 6 del B, 7 del Taller, 2 sin proveedor y 3 sin marca. El total del paso 1 es 40: quedan 8 por elegir.
const CON_PASO_2 = `select pg_temp.ok(pg_temp.guarda_p2(40, jsonb_build_array(
  pg_temp.celda('uno', 'NEG', 't1', 5), pg_temp.celda('uno', 'NEG', 't2', 3), pg_temp.celda('uno', 'BLA', 't2', 2), pg_temp.celda('dos', 'ROS', 't3', 4),
  pg_temp.celda('tres', 'NEG', 't1', 6), pg_temp.celda('taller', 'NEG', 't2', 7), pg_temp.celda('sinprov', 'NEG', 't1', 2), pg_temp.celda('sinmarca', 'NEG', 't1', 3)))) as _p2 \\gset`;
const ENVIA_A = `select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa')))) as _ea \\gset`;
const ENVIAR = (version, envios) => `retail.enviar_plan_compra_a_compras(current_setting('pe.plan')::uuid, current_setting('pe.cat')::uuid, ${version}, ${envios})`;
const ENVIOS = `retail.fn_plan_compra_envios(current_setting('pe.plan')::uuid)`;
const CAMBIAR = (pedido, cuando, fecha) => `retail.cambiar_fecha_pedido_campana(${pedido}, '${cuando}', ${fecha})`;
const RECTIFICAR = (pedido, motivo) => `retail.rectificar_pedido_campana(${pedido}, '${motivo}')`;
const CONFIRMAR = (pedido) => `retail.confirmar_pedido_campana(${pedido})`;

// Micaela (no es líder) con un rol de prueba que ve SOLO esos módulos. Se va con el ROLLBACK.
const ROL_MICAELA = (...modulos) => `
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
insert into retail.roles (nombre) values ('ZZ Envio Rol') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
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

console.log("— La lectura —");
caso(
  "L1 sin el paso 2 guardado la lectura dice «base: null» y ningún pedido (no inventa un reparto)",
  `select ((pg_temp.lee() -> 'base') = 'null'::jsonb)::text || ',' || jsonb_array_length(pg_temp.lee() -> 'pedidos');`,
  "true,0",
);
caso(
  "L2 con el paso 2 guardado agrupa por proveedor (A: 2 modelos y 14 prendas; B: 1 y 6), marca el Taller (7), cuenta lo que no se envía (2 sin proveedor, 3 sin marca), lo que falta elegir (8) y trae el costo del plan",
  `${CON_PASO_2}
   select jsonb_array_length(pg_temp.lee() -> 'base' -> 'grupos') || ',' ||
          (pg_temp.grupo('pa') ->> 'modelos') || '/' || (pg_temp.grupo('pa') ->> 'unidades') || ',' ||
          (pg_temp.grupo('pb') ->> 'modelos') || '/' || (pg_temp.grupo('pb') ->> 'unidades') || ',' ||
          (pg_temp.grupo('pt') ->> 'es_taller') || '/' || (pg_temp.grupo('pt') ->> 'unidades') || ',' ||
          (pg_temp.lee() -> 'base' ->> 'sin_proveedor') || ',' || (pg_temp.lee() -> 'base' ->> 'sin_marca') || ',' || (pg_temp.lee() -> 'base' ->> 'modelos_nuevos') || ',' ||
          (pg_temp.lee() -> 'base' ->> 'costo') || ',' || (pg_temp.lee() -> 'base' -> 'paso_2' ->> 'version');`,
  "3,2/14,1/6,true/7,2,3,8,40.00,1",
);
caso(
  "L3 las líneas de un grupo salen por modelo, color y talla en el orden de las tallas (S, M, L), con los nombres que la persona lee",
  `${CON_PASO_2}
   select string_agg((l ->> 'modelo') || '/' || (l ->> 'color_nombre') || '/' || (l ->> 'talla') || '/' || (l ->> 'n'), ' ' order by o)
     from jsonb_array_elements(pg_temp.grupo('pa') -> 'lineas') with ordinality as x(l, o);`,
  "Zz Env Dos/Rosado/L/4 Zz Env Uno/Blanco/M/2 Zz Env Uno/Negro/S/5 Zz Env Uno/Negro/M/3",
);
caso(
  "L4 una campaña o una categoría que no existen se dicen (no devuelven un vacío que parezca «nada que enviar»)",
  `select pg_temp.pista(pg_temp.intento(format('select retail.fn_plan_compra_envio(%L::uuid, %L::uuid)', '00000000-0000-0000-0000-000000000000', current_setting('pe.cat')))) || ',' ||
          pg_temp.pista(pg_temp.intento(format('select retail.fn_plan_compra_envio(%L::uuid, %L::uuid)', current_setting('pe.plan'), '00000000-0000-0000-0000-000000000000')));`,
  "plan_compra_inexistente,plan_compra_inexistente",
);
caso(
  "L5 el resumen por categoría: sin envíos no hay filas; con dos pendientes dice 2/0/0 sin «desactualizado»; si alguien guarda otro paso 2 después de enviar, dice que cambió",
  `${CON_PASO_2}
   select jsonb_array_length(${ENVIOS} -> 'categorias') as a \\gset
   select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa'), pg_temp.envio('pb', 'fecha', (current_date + 5)::text)))) as _e \\gset
   select (${ENVIOS} -> 'categorias' -> 0 ->> 'pendientes') || '/' || (${ENVIOS} -> 'categorias' -> 0 ->> 'pedidos') || '/' || (${ENVIOS} -> 'categorias' -> 0 ->> 'rectificados') || '/' || (${ENVIOS} -> 'categorias' -> 0 ->> 'desactualizado') as antes \\gset
   select pg_temp.ok(pg_temp.guarda_p2(41, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't1', 6)), 1)) as _p \\gset
   select :'a' || ',' || :'antes' || ',' || (${ENVIOS} -> 'categorias' -> 0 ->> 'desactualizado');`,
  "0,2/0/0/false,true",
);

console.log("\n— Enviar (deja pendiente; no pide nada) —");
caso(
  "E1 enviar al proveedor A «ya» crea UN pedido pendiente con sus 14 prendas, el costo del plan, la versión del paso 2 y la foto de sus 4 celdas, sin orden de compra",
  `${CON_PASO_2}
   select (${ENVIAR(1, "jsonb_build_array(pg_temp.envio('pa'))")} ->> 'creados') as r \\gset
   select :'r' || ',' || pg_temp.cuantos() || ',' || pg_temp.col('pa', 'estado') || ',' || pg_temp.col('pa', 'cuando') || ',' || (pg_temp.col('pa', 'fecha_prevista') is null) || ',' ||
          pg_temp.col('pa', 'unidades') || ',' || pg_temp.col('pa', 'costo_unitario') || ',' || pg_temp.col('pa', 'paso_2_version') || ',' ||
          (select count(*) || '/' || sum(cantidad) from retail.pedidos_campana_lineas where pedido_id = pg_temp.pedido('pa')) || ',' || (pg_temp.col('pa', 'orden_compra_id') is null) || ',' || pg_temp.ordenes();`,
  "1,1,pendiente,ya,true,14,40.00,1,4/14,true,0",
);
caso(
  "E2 enviar a dos proveedores a la vez, uno en una fecha y otro «ya», deja los dos pendientes con lo que se dijo de cada uno",
  `${CON_PASO_2}
   select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa', 'fecha', (current_date + 5)::text), pg_temp.envio('pb')))) as _e \\gset
   select pg_temp.cuantos('pendiente') || ',' || pg_temp.col('pa', 'cuando') || ',' || (pg_temp.col('pa', 'fecha_prevista')::date = current_date + 5) || ',' || pg_temp.col('pb', 'cuando') || ',' ||
          pg_temp.col('pb', 'unidades');`,
  "2,fecha,true,ya,6",
);
caso(
  "E3 enviar lo MISMO otra vez (un doble clic, un reintento tras un corte de red) no crea otro pedido ni da error: responde que ya estaba",
  `${CON_PASO_2}
   select (${ENVIAR(1, "jsonb_build_array(pg_temp.envio('pa'))")})::text as r1 \\gset
   select (${ENVIAR(1, "jsonb_build_array(pg_temp.envio('pa'))")})::text as r2 \\gset
   select (:'r1'::jsonb ->> 'creados') || '/' || (:'r1'::jsonb ->> 'ya_enviados') || ',' || (:'r2'::jsonb ->> 'creados') || '/' || (:'r2'::jsonb ->> 'ya_enviados') || ',' || pg_temp.cuantos();`,
  "1/0,0/1,1",
);
caso(
  "E4 enviar al mismo proveedor con OTRA fecha cuando ya está pendiente no se pisa en silencio: se rechaza diciendo que ya está enviado (para cambiarla hay una acción propia)",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa', 'fecha', (current_date + 5)::text)))) || ',' || pg_temp.cuantos() || ',' || pg_temp.col('pa', 'cuando');`,
  "pedido_campana_ya_enviado,1,ya",
);
caso(
  "E5 si otra persona guardó otro paso 2 mientras mirabas, enviar se rechaza (PT409) y no escribe nada: lo que se manda es lo que la persona VIO",
  `${CON_PASO_2}
   select pg_temp.ok(pg_temp.guarda_p2(41, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't1', 6)), 1)) as _p \\gset
   select pg_temp.codigo(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa')))) || ',' || pg_temp.cuantos();`,
  "PT409,0",
);
caso(
  "E6 lo del Taller no se envía a Compras (es una orden de producción): se rechaza y no escribe nada",
  `${CON_PASO_2}
   select pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pt')))) || ',' || pg_temp.cuantos();`,
  "pedido_campana_taller,0",
);
caso(
  "E7 lo imposible se rechaza con su razón, sin escribir nada: nadie a quien enviar, un «cuándo» que no existe, una fecha pasada o de más de un año, un proveedor repetido, uno sin nada en el reparto, una fecha que falta, un dato ilegible, más de 50 a la vez",
  `${CON_PASO_2}
   select pg_temp.pista(pg_temp.envia(1, '[]'::jsonb)) || ',' ||
          pg_temp.pista(pg_temp.envia(1, jsonb_build_array(jsonb_build_object('proveedor_id', current_setting('pe.pa'), 'cuando', 'mañana')))) || ',' ||
          pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa', 'fecha', (current_date - 3)::text)))) || ',' ||
          pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa', 'fecha', (current_date + 400)::text)))) || ',' ||
          pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa'), pg_temp.envio('pa')))) || ',' ||
          pg_temp.pista(pg_temp.envia(1, jsonb_build_array(jsonb_build_object('proveedor_id', gen_random_uuid(), 'cuando', 'ya')))) || ',' ||
          pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa', 'fecha', null)))) || ',' ||
          pg_temp.pista(pg_temp.envia(1, jsonb_build_array(jsonb_build_object('proveedor_id', 'no-es-un-uuid', 'cuando', 'ya')))) || ',' ||
          pg_temp.pista(pg_temp.envia(1, jsonb_build_array('hola'::text))) || ',' ||
          pg_temp.pista(pg_temp.envia(1, (select jsonb_agg(pg_temp.envio('pa')) from generate_series(1, 51)))) || ',' || pg_temp.cuantos();`,
  "pedido_campana_sin_envios,pedido_campana_formato,pedido_campana_fecha,pedido_campana_fecha,pedido_campana_repetido,pedido_campana_proveedor,pedido_campana_fecha,pedido_campana_formato,pedido_campana_formato,pedido_campana_muchos,0",
);
caso(
  "E8 si UNO de los envíos del lote es inválido no queda ninguno: el lote es todo-o-nada (A «ya» + B con fecha pasada no deja a A pendiente)",
  `${CON_PASO_2}
   select pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa'), pg_temp.envio('pb', 'fecha', (current_date - 3)::text)))) || ',' || pg_temp.cuantos();`,
  "pedido_campana_fecha,0",
);
caso(
  "E9 una categoría sin paso 2 guardado no tiene qué enviar: se dice, no se envía nada",
  `select pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa')))) || ',' || pg_temp.cuantos();`,
  "pedido_campana_sin_paso_2,0",
);
caso(
  "E10 un proveedor o una marca inactivos se dicen al ENVIAR (la orden de compra no los acepta), no recién al confirmar",
  `${CON_PASO_2}
   update retail.proveedores set activo = false where id = current_setting('pe.pa')::uuid;
   select pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa')))) as a \\gset
   update retail.proveedores set activo = true where id = current_setting('pe.pa')::uuid;
   -- La app no deja desactivar una marca con modelos activos; el dato ya así (un arreglo a mano, un camino viejo) sí puede llegar: se prueba sin el disparador.
   set local session_replication_role = replica;
   update retail.marcas set activo = false where id = current_setting('pe.m1')::uuid;
   set local session_replication_role = origin;
   select :'a' || ',' || pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa')))) || ',' || pg_temp.cuantos();`,
  "pedido_campana_proveedor_inactivo,pedido_campana_marca_inactiva,0",
);
caso(
  "E11 una categoría cuyo plan ya no tiene costo no se envía (no hay a qué precio pedir), y una campaña archivada tampoco",
  `${CON_PASO_2}
   delete from retail.planes_compra_lineas where plan_id = current_setting('pe.plan')::uuid;
   select pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa')))) as a \\gset
   update retail.planes_compra set archivado_en = now(), archivado_por = current_setting('pe.persona')::uuid where id = current_setting('pe.plan')::uuid;
   select :'a' || ',' || pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa')))) || ',' || pg_temp.cuantos();`,
  "pedido_campana_sin_costo,plan_compra_inexistente,0",
);

console.log("\n— Cambiar la fecha y rectificar (solo mientras está pendiente) —");
caso(
  "R1 cambiar la fecha de «ya» a una fecha y de vuelta a «ya» firma quién y cuándo; pedir lo mismo que ya hay no cambia nada",
  `${CON_PASO_2}
   ${ENVIA_A}
   select (${CAMBIAR("pg_temp.pedido('pa')", "fecha", "current_date + 10")} ->> 'sin_cambios') as c1 \\gset
   select pg_temp.col('pa', 'cuando') || ',' || (pg_temp.col('pa', 'fecha_prevista')::date = current_date + 10) || ',' || (pg_temp.col('pa', 'actualizado_por') is not null) || ',' || (pg_temp.col('pa', 'actualizado_en') is not null) as despues \\gset
   select (${CAMBIAR("pg_temp.pedido('pa')", "fecha", "current_date + 10")} ->> 'sin_cambios') as c2 \\gset
   select (${CAMBIAR("pg_temp.pedido('pa')", "ya", "null::date")} ->> 'sin_cambios') as c3 \\gset
   select :'c1' || ',' || :'despues' || ',' || :'c2' || ',' || :'c3' || ',' || pg_temp.col('pa', 'cuando') || ',' || (pg_temp.col('pa', 'fecha_prevista') is null);`,
  "false,fecha,true,true,true,true,false,ya,true",
);
caso(
  "R2 rectificar deja el pedido «rectificado» con quién, cuándo y por qué; repetirlo no cambia nada (ni el motivo); y se puede volver a enviar al mismo proveedor (el rectificado es historia)",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pedido('pa') as ped \\gset
   select (${RECTIFICAR(":'ped'", "Cambié de idea")} ->> 'sin_cambios') as r1 \\gset
   select (${RECTIFICAR(":'ped'", "Otra razón distinta")} ->> 'sin_cambios') as r2 \\gset
   select pg_temp.col('pa', 'estado') || ',' || pg_temp.col('pa', 'motivo') || ',' || (pg_temp.col('pa', 'rectificado_por') is not null) || ',' || (pg_temp.col('pa', 'rectificado_en') is not null) as hecho \\gset
   select (${ENVIAR(1, "jsonb_build_array(pg_temp.envio('pa'))")} ->> 'creados') as nuevo \\gset
   select :'r1' || ',' || :'r2' || ',' || :'hecho' || ',' || :'nuevo' || ',' || pg_temp.cuantos() || ',' || pg_temp.cuantos('rectificado') || ',' || pg_temp.cuantos('pendiente');`,
  "false,true,rectificado,Cambié de idea,true,true,1,2,1,1",
);
caso(
  "R3 rectificar pide la razón (de 3 a 200 letras): vacía, de dos letras, de 201 o ausente se rechaza y el pedido sigue pendiente",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pedido('pa') as ped \\gset
   select pg_temp.pista(pg_temp.rect(:'ped', '')) || ',' || pg_temp.pista(pg_temp.rect(:'ped', 'ab')) || ',' || pg_temp.pista(pg_temp.rect(:'ped', repeat('x', 201))) || ',' || pg_temp.pista(pg_temp.rect(:'ped', null)) || ',' || pg_temp.col('pa', 'estado');`,
  "pedido_campana_motivo,pedido_campana_motivo,pedido_campana_motivo,pedido_campana_motivo,pendiente",
);
caso(
  "R4 un pedido que YA es orden de compra no se rectifica ni cambia de fecha desde aquí (la orden y el plan no pueden quedar contradiciéndose: se anula en Órdenes), y sigue siendo «pedido»",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pedido('pa') as ped \\gset
   select pg_temp.ok(pg_temp.conf(:'ped')) as _c \\gset
   select pg_temp.pista(pg_temp.rect(:'ped', 'No lo quiero')) || ',' || pg_temp.pista(pg_temp.cambia(:'ped', 'ya')) || ',' || pg_temp.col('pa', 'estado');`,
  "pedido_campana_ya_es_orden,pedido_campana_terminal,pedido",
);
caso(
  "R5 un pedido rectificado no cambia de fecha; uno que no existe se dice en las tres acciones; y una fecha pasada o un «cuándo» que no existe se rechazan",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pedido('pa') as ped \\gset
   select pg_temp.ok(pg_temp.rect(:'ped', 'Cambié de idea')) as _r \\gset
   select pg_temp.pista(pg_temp.cambia(:'ped', 'ya')) || ',' || pg_temp.pista(pg_temp.cambia(gen_random_uuid(), 'ya')) || ',' ||
          pg_temp.pista(pg_temp.rect(gen_random_uuid(), 'Cambié de idea')) || ',' || pg_temp.pista(pg_temp.conf(gen_random_uuid())) as a \\gset
   ${ENVIA_A}
   select :'a' || ',' || pg_temp.pista(pg_temp.cambia(pg_temp.pedido('pa'), 'fecha', current_date - 3)) || ',' || pg_temp.pista(pg_temp.cambia(pg_temp.pedido('pa'), 'mañana'));`,
  "pedido_campana_terminal,pedido_campana_inexistente,pedido_campana_inexistente,pedido_campana_inexistente,pedido_campana_fecha,pedido_campana_formato",
);

console.log("\n— Confirmar y pedir (el único paso que crea la orden) —");
caso(
  "C1 confirmar crea LA orden de compra del proveedor (generada, para el inicio de la campaña, sin tienda destino, con su nota), una línea por modelo con el costo del plan, y deja el pedido «pedido» ligado a ella y firmado",
  `${CON_PASO_2}
   select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa', 'fecha', (current_date + 5)::text)))) as _e \\gset
   select pg_temp.pedido('pa') as ped \\gset
   select ${CONFIRMAR(":'ped'")}::text as r \\gset
   select (:'r'::jsonb ->> 'orden_id') as oid \\gset
   select pg_temp.col('pa', 'estado') || ',' || (pg_temp.col('pa', 'orden_compra_id') = :'oid') || ',' || (pg_temp.col('pa', 'pedido_por') is not null) || ',' || (:'r'::jsonb ->> 'sin_cambios') || ',' ||
          (select o.estado || '/' || (o.proveedor_id = current_setting('pe.pa')::uuid) || '/' || (o.fecha_entrega_estimada = (select pl.desde from retail.planes_compra pl where pl.id = current_setting('pe.plan')::uuid)) || '/' ||
                  (o.ubicacion_destino_id is null) || '/' || (o.nota like 'Pedido de campaña: ZZ Envio Plan · ZZ Envio Categoria.%') from retail.ordenes_compra o where o.id = :'oid') || ',' ||
          (select count(*) || '/' || sum(i.cantidad) || '/' || sum(i.subtotal) from retail.orden_compra_items i where i.orden_compra_id = :'oid');`,
  "pedido,true,true,false,generada/true/true/true/true,2/14/560.00",
);
caso(
  "C2 cada línea de la orden es un modelo, con sus colores y tallas dichos en la descripción (la orden no guarda color ni talla), la marca del modelo, la categoría y el costo del plan",
  `${CON_PASO_2}
   ${ENVIA_A}
   select (${CONFIRMAR("pg_temp.pedido('pa')")} ->> 'orden_id') as oid \\gset
   select string_agg(i.descripcion || '=' || i.cantidad || '@' || i.precio_unitario, ' | ' order by i.posicion) || ',' ||
          bool_and(i.marca_id = current_setting('pe.m1')::uuid and i.categoria_id = current_setting('pe.cat')::uuid)
     from retail.orden_compra_items i where i.orden_compra_id = :'oid';`,
  "Zz Env Dos · Rosado L×4=4@40.00 | Zz Env Uno · Blanco M×2; Negro S×5 M×3=10@40.00,true",
);
caso(
  "C3 el círculo se cierra: el Plan cuenta la orden como pedida de ESTA campaña (14 prendas, 560 sin IGV en la categoría) y su número aparece entre las órdenes de la campaña",
  `${CON_PASO_2}
   ${ENVIA_A}
   select (${CONFIRMAR("pg_temp.pedido('pa')")} ->> 'orden_id') as oid \\gset
   select retail.fn_plan_compra_pedido(current_setting('pe.plan')::uuid)::text as ped \\gset
   select (select c ->> 'unidades' || '/' || (c ->> 'soles') from jsonb_array_elements((:'ped'::jsonb) -> 'categorias') c where c ->> 'c' = current_setting('pe.cat')) || ',' ||
          (select count(*) from jsonb_array_elements((:'ped'::jsonb) -> 'ordenes') o where o ->> 'id' = :'oid');`,
  "14/560.00,1",
);
caso(
  "C4 confirmar dos veces el mismo pedido (doble clic, dos personas) devuelve LA MISMA orden y no crea otra",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pedido('pa') as ped \\gset
   select ${CONFIRMAR(":'ped'")}::text as r1 \\gset
   select ${CONFIRMAR(":'ped'")}::text as r2 \\gset
   select ((:'r1'::jsonb ->> 'orden_id') = (:'r2'::jsonb ->> 'orden_id')) || ',' || (:'r1'::jsonb ->> 'sin_cambios') || ',' || (:'r2'::jsonb ->> 'sin_cambios') || ',' || pg_temp.ordenes();`,
  "true,false,true,1",
);
caso(
  "C5 un pedido rectificado ya no se pide: confirmar se rechaza y no nace ninguna orden",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pedido('pa') as ped \\gset
   select pg_temp.ok(pg_temp.rect(:'ped', 'Cambié de idea')) as _r \\gset
   select pg_temp.pista(pg_temp.conf(:'ped')) || ',' || pg_temp.ordenes() || ',' || pg_temp.col('pa', 'estado');`,
  "pedido_campana_rectificado,0,rectificado",
);
caso(
  "C6 lo que la orden de compra no acepta se dice con el nombre de la cosa y el pedido sigue pendiente sin orden: proveedor inactivo, categoría inactiva, marca inactiva, y un modelo al que se le quitó la marca después de enviar; al arreglarlo, confirma",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pedido('pa') as ped \\gset
   update retail.proveedores set activo = false where id = current_setting('pe.pa')::uuid;
   select pg_temp.pista(pg_temp.conf(:'ped')) as a \\gset
   update retail.proveedores set activo = true where id = current_setting('pe.pa')::uuid;
   -- La app no deja desactivar una categoría ni una marca con modelos activos; el dato ya así (un arreglo a mano, un camino viejo) sí puede llegar: se prueba sin el disparador.
   set local session_replication_role = replica;
   update retail.categorias set activo = false where id = current_setting('pe.cat')::uuid;
   set local session_replication_role = origin;
   select pg_temp.pista(pg_temp.conf(:'ped')) as b \\gset
   set local session_replication_role = replica;
   update retail.categorias set activo = true where id = current_setting('pe.cat')::uuid;
   update retail.marcas set activo = false where id = current_setting('pe.m1')::uuid;
   set local session_replication_role = origin;
   select pg_temp.pista(pg_temp.conf(:'ped')) as c \\gset
   set local session_replication_role = replica;
   update retail.marcas set activo = true where id = current_setting('pe.m1')::uuid;
   set local session_replication_role = origin;
   update retail.productos set marca_id = null, proveedor_id = null where id = current_setting('pe.uno')::uuid;
   select pg_temp.pista(pg_temp.conf(:'ped')) as d \\gset
   select pg_temp.col('pa', 'estado') as e \\gset
   update retail.productos set marca_id = current_setting('pe.m1')::uuid, proveedor_id = current_setting('pe.pa')::uuid where id = current_setting('pe.uno')::uuid;
   select :'a' || ',' || :'b' || ',' || :'c' || ',' || :'d' || ',' || :'e' || ',' || pg_temp.ordenes() || ',' || pg_temp.codigo(pg_temp.conf(:'ped')) || ',' || pg_temp.col('pa', 'estado');`,
  "pedido_campana_proveedor_inactivo,pedido_campana_categoria_inactiva,pedido_campana_marca_inactiva,pedido_campana_marca_inactiva,pendiente,0,SIN_ERROR,pedido",
);
caso(
  "C7 si la campaña ya empezó la orden llega para HOY (no para una fecha pasada, que la orden de compra rechazaría) y el Plan la sigue contando",
  `${CON_PASO_2}
   update retail.planes_compra set desde = current_date - 5, hasta = current_date + 15 where id = current_setting('pe.plan')::uuid;
   ${ENVIA_A}
   select (${CONFIRMAR("pg_temp.pedido('pa')")} ->> 'orden_id') as oid \\gset
   select (o.fecha_entrega_estimada = retail.fn_hoy_lima())::text from retail.ordenes_compra o where o.id = :'oid';`,
  "true",
);
caso(
  "C8 si la orden de compra rechaza algo que ni el pedido ni el paso 2 ven (un modelo con más de 99 999 prendas) el pedido SIGUE pendiente y no nace ninguna orden: todo-o-nada",
  `select pg_temp.ok(pg_temp.guarda_p2(100000, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't1', 100000)))) as _p \\gset
   ${ENVIA_A}
   select pg_temp.pista(pg_temp.conf(pg_temp.pedido('pa'))) || ',' || pg_temp.cuantos('pendiente') || ',' || pg_temp.ordenes();`,
  "orden_compra_cantidad,1,0",
);
caso(
  "C9 un pedido de más de 100 modelos pide UNA línea por marca (una orden lleva hasta 100) con el total de prendas, y dice cuántos modelos son",
  `insert into retail.categorias (nombre) values ('ZZ Envio Categoria Masiva') returning id as catm \\gset
   insert into retail.planes_compra_lineas (plan_id, categoria_id, flojo, normal, bueno, precio, costo, recupero_pct, actualizado_por) values (:'plan', :'catm', 10, 20, 30, 100.00, 25.00, 50, :'persona');
   insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) select 'Zz Env Masivo ' || g, :'catm', :'m1', :'pa' from generate_series(1, 101) g;
   select jsonb_agg(jsonb_build_object('p', pr.id, 'c', 'NEG', 't', null, 'n', 2)) as items from retail.productos pr where pr.categoria_id = :'catm' \\gset
   select retail.guardar_plan_compra_paso_2(:'plan', :'catm', 60, 300, :'items'::jsonb, 0) as _p \\gset
   select retail.enviar_plan_compra_a_compras(:'plan', :'catm', 1, jsonb_build_array(pg_temp.envio('pa'))) as _e \\gset
   select (retail.confirmar_pedido_campana((select id from retail.pedidos_campana where plan_id = :'plan' and categoria_id = :'catm' and estado = 'pendiente')) ->> 'orden_id') as oid \\gset
   select count(*) || '/' || sum(i.cantidad) || '/' || bool_and(i.descripcion like '101 modelos de la campaña%') || '/' || sum(i.subtotal)
     from retail.orden_compra_items i where i.orden_compra_id = :'oid';`,
  "1/202/true/5050.00",
);

caso(
  "C10 las prendas que YA son orden desde que se guardó el paso 2 se dicen aparte (la lista del Plan las suma a «Comprar» para no llamar «por revisar» a un paso 2 que solo se confirmó): una orden generada cuenta; si se anula deja de contar; y una orden anterior a un paso 2 nuevo ya está descontada de su total",
  `${CON_PASO_2}
   ${ENVIA_A}
   select (${CONFIRMAR("pg_temp.pedido('pa')")} ->> 'orden_id') as oid \\gset
   select (pg_temp.lee() -> 'base' ->> 'confirmadas') || '/' || (${ENVIOS} -> 'categorias' -> 0 ->> 'confirmadas') as con_orden \\gset
   update retail.ordenes_compra set estado = 'anulada', anulada_por = current_setting('pe.persona')::uuid, anulada_en = now(), motivo_anulacion = 'ZZ prueba de envío' where id = :'oid';
   select (pg_temp.lee() -> 'base' ->> 'confirmadas') || '/' || (${ENVIOS} -> 'categorias' -> 0 ->> 'confirmadas') as anulada \\gset
   update retail.ordenes_compra set estado = 'generada', anulada_por = null, anulada_en = null, motivo_anulacion = null where id = :'oid';
   -- Dentro de una transacción «ahora» es el mismo para todo: la orden se confirmó ANTES del paso 2 nuevo, así que se retrocede una hora.
   set local session_replication_role = replica;
   update retail.pedidos_campana set pedido_en = now() - interval '1 hour' where id = pg_temp.pedido('pa');
   set local session_replication_role = origin;
   select pg_temp.ok(pg_temp.guarda_p2(26, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't1', 6)), 1)) as _p \\gset
   select :'con_orden' || ',' || :'anulada' || ',' || (pg_temp.lee() -> 'base' ->> 'confirmadas') || '/' || (${ENVIOS} -> 'categorias' -> 0 ->> 'confirmadas');`,
  "14/14,0/0,0/0",
);

console.log("\n— Lo que lee Compras —");
caso(
  "P1 los pendientes van primero, cada pedido con su campaña, categoría, proveedor, prendas y modelos; el pedido trae su orden y la persona que lo envió",
  `${CON_PASO_2}
   select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa', 'fecha', (current_date + 9)::text), pg_temp.envio('pb')))) as _e \\gset
   select pg_temp.ok(pg_temp.conf(pg_temp.pedido('pa'))) as _c \\gset
   select string_agg((x.v ->> 'estado') || ':' || (x.v -> 'proveedor' ->> 'nombre') || ':' || (x.v ->> 'unidades') || ':' || (x.v ->> 'modelos') || ':' || ((x.v -> 'orden') = 'null'::jsonb) || ':' || (x.v ->> 'desactualizado') || ':' ||
                     (x.v -> 'categoria' ->> 'nombre') || ':' || ((x.v ->> 'enviado_por') is not null), ' ' order by x.o)
     from jsonb_array_elements(retail.fn_pedidos_campana() -> 'pedidos') with ordinality as x(v, o) where x.v -> 'plan' ->> 'nombre' = 'ZZ Envio Plan';`,
  "pendiente:ZZ Envio Prov B:6:1:true:false:ZZ Envio Categoria:true pedido:ZZ Envio Prov A:14:2:false:false:ZZ Envio Categoria:true",
);
caso(
  "P2 un pedido que ya se pidió hace más de 30 días o se rectificó hace más de 14 sale de la lista (queda en la tabla); un pendiente nunca sale",
  `${CON_PASO_2}
   select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa'), pg_temp.envio('pb')))) as _e \\gset
   select pg_temp.pedido('pa') as pda \\gset
   select pg_temp.pedido('pb') as pdb \\gset
   select pg_temp.ok(pg_temp.conf(:'pda')) as _c \\gset
   select pg_temp.ok(pg_temp.rect(:'pdb', 'Cambié de idea')) as _r \\gset
   select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pb')))) as _e2 \\gset
   select count(*) as antes from jsonb_array_elements(retail.fn_pedidos_campana() -> 'pedidos') x where x -> 'plan' ->> 'nombre' = 'ZZ Envio Plan' \\gset
   set local session_replication_role = replica;
   update retail.pedidos_campana set pedido_en = now() - interval '40 days' where id = :'pda';
   update retail.pedidos_campana set rectificado_en = now() - interval '20 days' where id = :'pdb';
   set local session_replication_role = origin;
   select :'antes' || ',' || (select count(*) from jsonb_array_elements(retail.fn_pedidos_campana() -> 'pedidos') x where x -> 'plan' ->> 'nombre' = 'ZZ Envio Plan');`,
  "3,1",
);
caso(
  "P3 si el paso 2 cambió después de enviar, el pedido lo dice («desactualizado») sin tocarlo: sigue siendo lo que se envió",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.ok(pg_temp.guarda_p2(41, jsonb_build_array(pg_temp.celda('uno', 'NEG', 't1', 6)), 1)) as _p \\gset
   select (select x ->> 'desactualizado' from jsonb_array_elements(retail.fn_pedidos_campana() -> 'pedidos') x where x ->> 'id' = pg_temp.pedido('pa')::text) || ',' || pg_temp.col('pa', 'unidades') || ',' || pg_temp.col('pa', 'paso_2_version');`,
  "true,14,1",
);
caso(
  "P4 las líneas de un pedido salen por modelo, color y talla en el orden de las tallas, con los nombres de la persona; uno que no existe da null",
  `${CON_PASO_2}
   ${ENVIA_A}
   select string_agg((l ->> 'modelo') || '/' || (l ->> 'color_nombre') || '/' || (l ->> 'talla') || '/' || (l ->> 'n'), ' ' order by o) || ',' || (retail.fn_pedido_campana_lineas(gen_random_uuid()) is null)
     from jsonb_array_elements(retail.fn_pedido_campana_lineas(pg_temp.pedido('pa')) -> 'lineas') with ordinality as x(l, o);`,
  "Zz Env Dos/Rosado/L/4 Zz Env Uno/Blanco/M/2 Zz Env Uno/Negro/S/5 Zz Env Uno/Negro/M/3,true",
);

caso(
  "P5 si a un modelo le cambian el proveedor DESPUÉS de enviar, la bandeja lo dice y confirmar se rechaza con su razón (no se le pide al proveedor equivocado); el pedido sigue pendiente",
  `${CON_PASO_2}
   ${ENVIA_A}
   insert into retail.marca_proveedores (marca_id, proveedor_id) values (current_setting('pe.m1')::uuid, current_setting('pe.pb')::uuid);
   update retail.productos set proveedor_id = current_setting('pe.pb')::uuid where id = current_setting('pe.uno')::uuid;
   select (select x ->> 'cambio_el_proveedor' from jsonb_array_elements(retail.fn_pedidos_campana() -> 'pedidos') x where x ->> 'id' = pg_temp.pedido('pa')::text) || ',' ||
          pg_temp.pista(pg_temp.conf(pg_temp.pedido('pa'))) || ',' || pg_temp.col('pa', 'estado') || ',' || pg_temp.ordenes();`,
  "true,pedido_campana_proveedor_cambio,pendiente,0",
);

console.log("\n— Los estados que nunca deben existir (los cierra el esquema) —");
// Un pedido directo en la tabla (como lo haría alguien con acceso a la base): (estado, cuándo, fecha, motivo, rectificado, orden, pedido).
const INS = ({ estado = "pendiente", cuando = "ya", fecha = "null", motivo = "null", rect = false, orden = "null", pedido = false, unidades = "5", costo = "40", prov = "pa" } = {}) =>
  `insert into retail.pedidos_campana (plan_id, categoria_id, proveedor_id, estado, cuando, fecha_prevista, paso_2_version, unidades, costo_unitario, enviado_por, motivo, rectificado_por, rectificado_en, orden_compra_id, pedido_por, pedido_en)
   values (current_setting('pe.plan')::uuid, current_setting('pe.cat')::uuid, current_setting('pe.${prov}')::uuid, '${estado}', '${cuando}', ${fecha}, 1, ${unidades}, ${costo}, current_setting('pe.persona')::uuid, ${motivo},
           ${rect ? "current_setting('pe.persona')::uuid, now()" : "null, null"}, ${orden}, ${pedido ? "current_setting('pe.persona')::uuid, now()" : "null, null"})`;
const FALLA = (sql, codigo, texto) => `pg_temp.falla($q$${sql}$q$, '${codigo}', '${texto}')`;
caso(
  "S1 «ya» con fecha, una fecha sin decir «fecha», un «cuándo» que no existe, un estado que no existe, 0 prendas, un costo negativo y un motivo de más de 200 letras los rechaza la TABLA (aunque nadie pase por la función)",
  `select ${FALLA(INS({ cuando: "ya", fecha: "current_date + 3" }), "23514", "pedidos_campana_cuando_coherente")} || ',' ||
          ${FALLA(INS({ cuando: "fecha", fecha: "null" }), "23514", "pedidos_campana_cuando_coherente")} || ',' ||
          ${FALLA(INS({ cuando: "mañana" }), "23514", "pedidos_campana_cuando_coherente")} || ',' ||
          ${FALLA(INS({ estado: "otro" }), "23514", "pedidos_campana_estado_valido")} || ',' ||
          ${FALLA(INS({ unidades: "0" }), "23514", "unidades_check")} || ',' ||
          ${FALLA(INS({ costo: "-1" }), "23514", "costo_unitario_check")} || ',' ||
          ${FALLA(INS({ estado: "rectificado", rect: true, motivo: "repeat('x', 201)" }), "23514", "pedidos_campana_motivo_con_tope")};`,
  "ok,ok,ok,ok,ok,ok,ok",
);
caso(
  "S2 un «pedido» sin orden de compra, un «rectificado» sin motivo (o con el motivo en blanco) o sin quién, y un «pendiente» con motivo u orden no pueden existir",
  `select ${FALLA(INS({ estado: "pedido", pedido: true }), "23514", "pedidos_campana_estado_coherente")} || ',' ||
          ${FALLA(INS({ estado: "rectificado", rect: true }), "23514", "pedidos_campana_estado_coherente")} || ',' ||
          ${FALLA(INS({ estado: "rectificado", rect: true, motivo: "'   '" }), "23514", "pedidos_campana_estado_coherente")} || ',' ||
          ${FALLA(INS({ estado: "rectificado", motivo: "'Cambié de idea'" }), "23514", "pedidos_campana_estado_coherente")} || ',' ||
          ${FALLA(INS({ estado: "pendiente", motivo: "'Cambié de idea'" }), "23514", "pedidos_campana_estado_coherente")} || ',' ||
          ${FALLA(INS({ estado: "pendiente", pedido: true }), "23514", "pedidos_campana_estado_coherente")};`,
  "ok,ok,ok,ok,ok,ok",
);
caso(
  "S3 dos envíos activos de lo mismo (campaña, categoría y proveedor) no pueden existir; un rectificado y un pendiente del mismo sí (el rectificado es historia)",
  `select pg_temp.ok(pg_temp.intento($q$${INS()}$q$)) as _a \\gset
   select ${FALLA(INS(), "23505", "pedidos_campana_uno_activo")} as dos \\gset
   select pg_temp.intento($q$${INS({ estado: "rectificado", rect: true, motivo: "'Cambié de idea'" })}$q$) as hist \\gset
   select :'dos' || ',' || :'hist' || ',' || pg_temp.cuantos();`,
  "ok,SIN_ERROR,2",
);
caso(
  "S4 una orden de compra no puede cubrir dos pedidos: pasar un segundo pedido a «pedido» con la orden de otro lo rechaza la tabla",
  `${CON_PASO_2}
   select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa'), pg_temp.envio('pb')))) as _e \\gset
   select (${CONFIRMAR("pg_temp.pedido('pa')")} ->> 'orden_id') as oid \\gset
   select pg_temp.falla(format('update retail.pedidos_campana set estado = %L, orden_compra_id = %L::uuid, pedido_por = %L::uuid, pedido_en = now() where id = %L::uuid', 'pedido', :'oid', current_setting('pe.persona'), pg_temp.pedido('pb')),
                        '23505', 'pedidos_campana_una_orden');`,
  "ok",
);
caso(
  "S5 lo enviado no se edita (plan, proveedor, prendas…), un pedido que ya se pidió o se rectificó no cambia, ningún pedido se borra, y las líneas enviadas no se editan ni se borran",
  `${CON_PASO_2}
   select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa'), pg_temp.envio('pb')))) as _e \\gset
   select pg_temp.pedido('pa') as pda \\gset
   select pg_temp.pedido('pb') as pdb \\gset
   select pg_temp.ok(pg_temp.conf(:'pda')) as _c \\gset
   select pg_temp.pista(pg_temp.intento(format('update retail.pedidos_campana set unidades = 99 where id = %L::uuid', :'pdb'))) || ',' ||
          pg_temp.pista(pg_temp.intento(format('update retail.pedidos_campana set proveedor_id = %L::uuid where id = %L::uuid', current_setting('pe.pa'), :'pdb'))) || ',' ||
          pg_temp.pista(pg_temp.intento(format('update retail.pedidos_campana set cuando = %L, fecha_prevista = current_date + 3 where id = %L::uuid', 'fecha', :'pda'))) || ',' ||
          pg_temp.pista(pg_temp.intento(format('delete from retail.pedidos_campana where id = %L::uuid', :'pdb'))) || ',' ||
          pg_temp.codigo(pg_temp.intento(format('update retail.pedidos_campana_lineas set cantidad = 99 where pedido_id = %L::uuid', :'pdb'))) || ',' ||
          pg_temp.codigo(pg_temp.intento(format('delete from retail.pedidos_campana_lineas where pedido_id = %L::uuid', :'pdb')));`,
  "pedido_campana_no_se_edita,pedido_campana_no_se_edita,pedido_campana_terminal,pedido_campana_no_se_borra,42501,42501",
);
caso(
  "S6 una línea repetida (mismo modelo, color y talla en un mismo pedido) o con 0 prendas no puede existir",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pedido('pa') as ped \\gset
   select pg_temp.falla(format('insert into retail.pedidos_campana_lineas (pedido_id, producto_id, color_codigo, talla_id, cantidad) values (%L::uuid, %L::uuid, %L, %L::uuid, 1)', :'ped', current_setting('pe.uno'), 'NEG', current_setting('pe.t1')), '23505', 'pedidos_campana_lineas_unica') || ',' ||
          pg_temp.falla(format('insert into retail.pedidos_campana_lineas (pedido_id, producto_id, color_codigo, talla_id, cantidad) values (%L::uuid, %L::uuid, %L, %L::uuid, 0)', :'ped', current_setting('pe.uno'), 'ROS', current_setting('pe.t1')), '23514', 'cantidad_check');`,
  "ok,ok",
);

console.log("\n— Puertas —");
caso(
  "U1 con el rol de la tienda (authenticated, no el dueño) TODO el recorrido responde: leer, enviar, cambiar la fecha, confirmar y leer lo de Compras",
  `${CON_PASO_2}
   select jsonb_build_array(pg_temp.envio('pa')) as ea \\gset
   set local role authenticated;
   select (retail.fn_plan_compra_envio(:'plan'::uuid, :'cat'::uuid) ->> 'soportado') as a \\gset
   select (retail.enviar_plan_compra_a_compras(:'plan'::uuid, :'cat'::uuid, 1, :'ea'::jsonb) ->> 'creados') as b \\gset
   select (retail.fn_plan_compra_envio(:'plan'::uuid, :'cat'::uuid) -> 'pedidos' -> 0 ->> 'id') as ped \\gset
   select (retail.fn_plan_compra_envios(:'plan'::uuid) -> 'categorias' -> 0 ->> 'pendientes') as c \\gset
   select (retail.cambiar_fecha_pedido_campana(:'ped'::uuid, 'fecha', current_date + 7) ->> 'sin_cambios') as d \\gset
   select (retail.confirmar_pedido_campana(:'ped'::uuid) ->> 'numero') is not null as e \\gset
   select (select x ->> 'estado' from jsonb_array_elements(retail.fn_pedidos_campana() -> 'pedidos') x where x ->> 'id' = :'ped') as f \\gset
   select jsonb_array_length(retail.fn_pedido_campana_lineas(:'ped'::uuid) -> 'lineas') as g \\gset
   select :'a' || ',' || :'b' || ',' || :'c' || ',' || :'d' || ',' || :'e' || ',' || :'f' || ',' || :'g';`,
  "true,1,1,false,t,pedido,4",
);
caso(
  "U2 sin ningún módulo de Compras las ocho puertas responden 42501 y no escriben nada",
  `${CON_PASO_2}
   ${ROL_MICAELA("proveedores")}
   ${como(MICAELA)}
   select concat_ws(',',
     pg_temp.codigo(pg_temp.intento(format('select retail.fn_plan_compra_envio(%L::uuid, %L::uuid)', current_setting('pe.plan'), current_setting('pe.cat')))),
     pg_temp.codigo(pg_temp.intento(format('select retail.fn_plan_compra_envios(%L::uuid)', current_setting('pe.plan')))),
     pg_temp.codigo(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa')))),
     pg_temp.codigo(pg_temp.intento(format('select retail.cambiar_fecha_pedido_campana(%L::uuid, %L, null)', gen_random_uuid(), 'ya'))),
     pg_temp.codigo(pg_temp.rect(gen_random_uuid(), 'Cambié de idea')),
     pg_temp.codigo(pg_temp.conf(gen_random_uuid())),
     pg_temp.codigo(pg_temp.intento('select retail.fn_pedidos_campana()')),
     pg_temp.codigo(pg_temp.intento(format('select retail.fn_pedido_campana_lineas(%L::uuid)', gen_random_uuid()))),
     pg_temp.cuantos());`,
  "42501,42501,42501,42501,42501,42501,42501,42501,0",
);
caso(
  "U3 con SOLO «Plan de campaña» se lee y se envía, se cambia la fecha y se rectifica, pero NO se confirma ni se lee la bandeja de Compras (la orden es de quien tiene «Órdenes de compra»); se puede ver las líneas de un pedido",
  `${CON_PASO_2}
   ${ENVIA_A}
   select pg_temp.pedido('pa') as ped \\gset
   ${ROL_MICAELA("plan_compra")}
   ${como(MICAELA)}
   select pg_temp.codigo(pg_temp.intento(format('select retail.fn_plan_compra_envio(%L::uuid, %L::uuid)', current_setting('pe.plan'), current_setting('pe.cat')))) || ',' ||
          pg_temp.codigo(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pb')))) || ',' ||
          pg_temp.codigo(pg_temp.intento(format('select retail.cambiar_fecha_pedido_campana(%L::uuid, %L, current_date + 4)', :'ped', 'fecha'))) || ',' ||
          pg_temp.codigo(pg_temp.intento(format('select retail.fn_pedido_campana_lineas(%L::uuid)', :'ped'))) || ',' ||
          pg_temp.pista(pg_temp.conf(:'ped')) || ',' || pg_temp.pista(pg_temp.intento('select retail.fn_pedidos_campana()')) || ',' ||
          pg_temp.codigo(pg_temp.rect(pg_temp.pedido('pb'), 'Cambié de idea')) || ',' || pg_temp.col('pa', 'estado');`,
  "SIN_ERROR,SIN_ERROR,SIN_ERROR,SIN_ERROR,ordenes_compra_sin_modulo,ordenes_compra_sin_modulo,SIN_ERROR,pendiente",
);
caso(
  "U4 con SOLO «Órdenes de compra» se lee la bandeja, se confirma, se cambia la fecha y se rectifica, pero NO se lee ni se envía desde el Plan (enviar es de quien arma el plan)",
  `${CON_PASO_2}
   select pg_temp.ok(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pa'), pg_temp.envio('pb')))) as _e \\gset
   select pg_temp.pedido('pa') as pda \\gset
   select pg_temp.pedido('pb') as pdb \\gset
   ${ROL_MICAELA("ordenes_compra")}
   ${como(MICAELA)}
   select pg_temp.pista(pg_temp.intento(format('select retail.fn_plan_compra_envio(%L::uuid, %L::uuid)', current_setting('pe.plan'), current_setting('pe.cat')))) || ',' ||
          pg_temp.pista(pg_temp.envia(1, jsonb_build_array(pg_temp.envio('pt')))) || ',' ||
          pg_temp.codigo(pg_temp.intento('select retail.fn_pedidos_campana()')) || ',' ||
          pg_temp.codigo(pg_temp.intento(format('select retail.cambiar_fecha_pedido_campana(%L::uuid, %L, current_date + 4)', :'pdb', 'fecha'))) || ',' ||
          pg_temp.codigo(pg_temp.conf(:'pda')) || ',' || pg_temp.codigo(pg_temp.rect(:'pdb', 'Cambié de idea')) || ',' || pg_temp.col('pa', 'estado') || ',' || pg_temp.col('pb', 'estado');`,
  "plan_compra_sin_modulo,plan_compra_sin_modulo,SIN_ERROR,SIN_ERROR,SIN_ERROR,SIN_ERROR,pedido,rectificado",
);
caso(
  "U5 anon no ejecuta ninguna puerta, la web sí (authenticated); nadie de la web lee ni escribe las tablas (sin permisos de tabla, RLS encendido y SIN políticas); las funciones internas no las ejecuta nadie de la web",
  `select (has_function_privilege('anon', 'retail.fn_plan_compra_envio(uuid, uuid)', 'execute') or has_function_privilege('anon', 'retail.fn_plan_compra_envios(uuid)', 'execute') or
           has_function_privilege('anon', 'retail.enviar_plan_compra_a_compras(uuid, uuid, integer, jsonb)', 'execute') or has_function_privilege('anon', 'retail.cambiar_fecha_pedido_campana(uuid, text, date)', 'execute') or
           has_function_privilege('anon', 'retail.rectificar_pedido_campana(uuid, text)', 'execute') or has_function_privilege('anon', 'retail.confirmar_pedido_campana(uuid)', 'execute') or
           has_function_privilege('anon', 'retail.fn_pedidos_campana()', 'execute') or has_function_privilege('anon', 'retail.fn_pedido_campana_lineas(uuid)', 'execute'))::text || ',' ||
          (has_function_privilege('authenticated', 'retail.fn_plan_compra_envio(uuid, uuid)', 'execute') and has_function_privilege('authenticated', 'retail.fn_plan_compra_envios(uuid)', 'execute') and
           has_function_privilege('authenticated', 'retail.enviar_plan_compra_a_compras(uuid, uuid, integer, jsonb)', 'execute') and has_function_privilege('authenticated', 'retail.cambiar_fecha_pedido_campana(uuid, text, date)', 'execute') and
           has_function_privilege('authenticated', 'retail.rectificar_pedido_campana(uuid, text)', 'execute') and has_function_privilege('authenticated', 'retail.confirmar_pedido_campana(uuid)', 'execute') and
           has_function_privilege('authenticated', 'retail.fn_pedidos_campana()', 'execute') and has_function_privilege('authenticated', 'retail.fn_pedido_campana_lineas(uuid)', 'execute'))::text || ',' ||
          (has_table_privilege('authenticated', 'retail.pedidos_campana', 'select') or has_table_privilege('authenticated', 'retail.pedidos_campana', 'insert') or
           has_table_privilege('authenticated', 'retail.pedidos_campana_lineas', 'select') or has_table_privilege('authenticated', 'retail.pedidos_campana_lineas', 'insert'))::text || ',' ||
          (select count(*) filter (where c.relrowsecurity) from pg_class c where c.oid in ('retail.pedidos_campana'::regclass, 'retail.pedidos_campana_lineas'::regclass)) || ',' ||
          (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('pedidos_campana', 'pedidos_campana_lineas')) || ',' ||
          (has_function_privilege('anon', 'retail.fn_plan_compra_envio_base(uuid, uuid)', 'execute') or has_function_privilege('authenticated', 'retail.fn_plan_compra_envio_base(uuid, uuid)', 'execute') or
           has_function_privilege('anon', 'retail.fn_es_proveedor_taller(uuid)', 'execute') or has_function_privilege('authenticated', 'retail.fn_es_proveedor_taller(uuid)', 'execute') or
           has_function_privilege('anon', 'retail.fn_pedido_campana_guardia()', 'execute') or has_function_privilege('authenticated', 'retail.fn_pedido_campana_guardia()', 'execute'))::text;`,
  "false,true,false,2,0,false",
);
caso(
  "U6 las ocho puertas y la lectura interna son security definer con search_path fijo (una función con permisos del dueño sin esto se podría engañar con otro esquema); las dos auxiliares también lo fijan",
  `select count(*) filter (where p.prosecdef) || ',' || count(*) filter (where p.proconfig::text like '%search_path=retail, public, extensions%')
     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_plan_compra_envio', 'fn_plan_compra_envios', 'enviar_plan_compra_a_compras', 'cambiar_fecha_pedido_campana', 'rectificar_pedido_campana',
       'confirmar_pedido_campana', 'fn_pedidos_campana', 'fn_pedido_campana_lineas', 'fn_plan_compra_envio_base', 'fn_es_proveedor_taller', 'fn_pedido_campana_guardia');`,
  "9,11",
);

console.log("\n— La migración —");
caso(
  "M1 pegarla dos veces deja lo mismo: sin error, una sola de cada función, un solo disparador por tabla, una sola de cada tabla y de cada índice",
  `${MIGRACION}
   select (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_plan_compra_envio', 'fn_plan_compra_envios', 'enviar_plan_compra_a_compras', 'cambiar_fecha_pedido_campana',
             'rectificar_pedido_campana', 'confirmar_pedido_campana', 'fn_pedidos_campana', 'fn_pedido_campana_lineas', 'fn_plan_compra_envio_base', 'fn_es_proveedor_taller', 'fn_pedido_campana_guardia')) || ',' ||
          (select count(*) from pg_trigger where tgrelid in ('retail.pedidos_campana'::regclass, 'retail.pedidos_campana_lineas'::regclass) and not tgisinternal) || ',' ||
          (select count(*) from pg_class where relname in ('pedidos_campana', 'pedidos_campana_lineas') and relnamespace = 'retail'::regnamespace) || ',' ||
          (select count(*) from pg_indexes where schemaname = 'retail' and indexname in ('pedidos_campana_uno_activo', 'pedidos_campana_pendientes', 'pedidos_campana_lineas_unica'));`,
  "11,2,2,3",
);

// Concurrencia con sesiones reales. Se crean los datos de verdad (con commit), se corre y se borra todo al terminar.
//   K1  cuatro personas envían a la vez al mismo proveedor (dos «ya» y dos con fecha): queda UN pedido; las que pedían lo mismo que ganó responden «ya estaba»; las otras, que ya está enviado.
//   K2  cuatro personas confirman a la vez el mismo pedido: nace UNA orden, las cuatro ven la misma.
//   K3  cuatro veces, alguien confirma y otra persona rectifica el mismo pedido a la vez: gana UNA de las dos, nunca las dos, y nunca un «pedido» sin orden ni una orden de un pedido rectificado.
console.log("\n— Dos personas a la vez —");
const SEMILLA_REAL = `
set search_path = retail, public, extensions;
${MIGRACION}
begin;
${como(FELIPE)}
${DATOS({ n: "ZZ Envio Real", p: "Zz Real" })}
-- Cuatro proveedores más (uno por vuelta de K3), cada uno con su modelo.
insert into retail.proveedores (nombre) select 'ZZ Envio Real Prov Q' || g from generate_series(1, 4) g;
insert into retail.marca_proveedores (marca_id, proveedor_id) select :'m1', id from retail.proveedores where nombre like 'ZZ Envio Real Prov Q%';
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) select 'Zz Real Q' || right(pv.nombre, 1), :'cat', :'m1', pv.id from retail.proveedores pv where pv.nombre like 'ZZ Envio Real Prov Q%';
select retail.guardar_plan_compra_paso_2(:'plan', :'cat', 60, 100, (
  select jsonb_agg(jsonb_build_object('p', x.id, 'c', 'NEG', 't', :'t1', 'n', x.n) order by x.id)
    from (select id, 5 as n from retail.productos where referencia in ('Zz Real Uno', 'Zz Real Dos', 'Zz Real Tres') or referencia like 'Zz Real Q%') x), 0) as _p2 \\gset
commit;
select :'plan' || ',' || :'cat' || ',' || :'pa' || ',' || :'pb' || ',' || (select string_agg(id::text, ',' order by nombre) from retail.proveedores where nombre like 'ZZ Envio Real Prov Q%');
`;
const LIMPIEZA_REAL = `
set session_replication_role = replica;
delete from retail.actividad where tabla = 'ordenes_compra' and registro_id in (select id::text from retail.ordenes_compra where nota like 'Pedido de campaña: ZZ Envio Real Plan%');
delete from retail.orden_compra_versiones where orden_compra_id in (select id from retail.ordenes_compra where nota like 'Pedido de campaña: ZZ Envio Real Plan%');
delete from retail.orden_compra_items where orden_compra_id in (select id from retail.ordenes_compra where nota like 'Pedido de campaña: ZZ Envio Real Plan%');
delete from retail.ordenes_compra where nota like 'Pedido de campaña: ZZ Envio Real Plan%';
delete from retail.pedidos_campana_lineas where pedido_id in (select id from retail.pedidos_campana where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Envio Real Plan'));
delete from retail.pedidos_campana where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Envio Real Plan');
delete from retail.planes_compra_paso_2 where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Envio Real Plan');
delete from retail.planes_compra_lineas_historial where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Envio Real Plan');
delete from retail.planes_compra_lineas where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Envio Real Plan');
delete from retail.planes_compra_versiones where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Envio Real Plan');
delete from retail.planes_compra_pagos where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Envio Real Plan');
delete from retail.planes_compra_reparto where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Envio Real Plan');
delete from retail.planes_compra where nombre = 'ZZ Envio Real Plan';
delete from retail.productos where referencia like 'Zz Real %';
delete from retail.categoria_tallas where categoria_id in (select id from retail.categorias where nombre = 'ZZ Envio Real Categoria');
delete from retail.categorias where nombre = 'ZZ Envio Real Categoria';
delete from retail.marca_proveedores where proveedor_id in (select id from retail.proveedores where nombre like 'ZZ Envio Real Prov%');
delete from retail.proveedores where nombre like 'ZZ Envio Real Prov%';
delete from retail.marcas where nombre like 'ZZ Envio Real Marca%';
`;
const enParalelo = (sqls) =>
  Promise.all(
    sqls.map(
      (sql) =>
        new Promise((resolver) => {
          const h = execFile("docker", ARGS_PSQL, { maxBuffer: 1 << 20 }, (err, salida, stderr) =>
            resolver(err ? `ERR ${((stderr ?? "").split("\n").find((l) => l.includes("ERROR")) ?? stderr).trim()}` : `OK ${salida.trim()}`),
          );
          h.stdin.end(`begin;\n${como(FELIPE)}${sql}\ncommit;`);
        }),
    ),
  );
const comoFelipe = (sql) => correr(`begin;\n${como(FELIPE)}${sql}\ncommit;`);
function anotar(nombre, bien, detalle) {
  if (bien) {
    console.log(`✓ ${nombre}`);
  } else {
    fallas++;
    console.log(`✗ ${nombre}\n    obtenido: ${detalle}`);
  }
}
async function concurrencia() {
  casos += 3;
  // Quita cualquier resto de una corrida anterior que se cortó a medias.
  correr(LIMPIEZA_REAL);
  const sem = correr(SEMILLA_REAL);
  if (!sem.ok) {
    fallas += 3;
    console.log(`✗ K1/K2/K3 la preparación falló: ${sem.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? sem.mensaje}`);
    return;
  }
  try {
    const [plan, cat, pa, pb, ...q] = sem.salida.split("\n").at(-1).split(",");
    const envio = (prov, cuando, fecha) => `{"proveedor_id": "${prov}", "cuando": "${cuando}"${fecha ? `, "fecha": "${fecha}"` : ""}}`;
    const enviar = (envios) => `select retail.enviar_plan_compra_a_compras('${plan}', '${cat}', 1, '[${envios.join(",")}]'::jsonb)::text;`;
    const ped = (prov) => correr(`select id from retail.pedidos_campana where plan_id = '${plan}' and proveedor_id = '${prov}' and estado in ('pendiente', 'pedido');`).salida;
    const ordenes = () => Number(correr(`select count(*) from retail.ordenes_compra where nota like 'Pedido de campaña: ZZ Envio Real Plan%';`).salida);
    const json = (r) => {
      try {
        return JSON.parse(r.slice(3));
      } catch {
        return null;
      }
    };

    // K1: dos «ya» y dos con fecha, a la vez, al mismo proveedor.
    const manana = correr(`select (current_date + 7)::text;`).salida;
    const k1 = await enParalelo([enviar([envio(pa, "ya")]), enviar([envio(pa, "ya")]), enviar([envio(pa, "fecha", manana)]), enviar([envio(pa, "fecha", manana)])]);
    const filas1 = correr(`select count(*) || ':' || count(*) filter (where estado = 'pendiente') from retail.pedidos_campana where plan_id = '${plan}' and proveedor_id = '${pa}';`);
    const ok1 = k1.filter((r) => r.startsWith("OK"));
    const ganadoras = ok1.filter((r) => json(r)?.creados === 1).length;
    const rechazadas = k1.filter((r) => r.startsWith("ERR") && /ya está enviado a Compras/.test(r)).length;
    anotar(
      "K1 cuatro personas envían a la vez al mismo proveedor, dos «ya» y dos con fecha: queda UN pedido, gana UNA, y las demás reciben «ya estaba» (si pedían lo mismo) o «ya está enviado» (si pedían otra cosa), sin ningún otro error",
      filas1.ok && filas1.salida === "1:1" && ganadoras === 1 && ok1.length + rechazadas === 4,
      `${filas1.ok ? filas1.salida : filas1.mensaje}; ganaron ${ganadoras}; ok ${ok1.length}; rechazadas ${rechazadas}\n    ${k1.join("\n    ")}`,
    );

    // K2: cuatro personas confirman a la vez el mismo pedido (el del proveedor B).
    const e2 = comoFelipe(enviar([envio(pb, "ya")]));
    const pedB = ped(pb);
    const k2 = await enParalelo([1, 2, 3, 4].map(() => `select retail.confirmar_pedido_campana('${pedB}')::text;`));
    const ids = new Set(k2.map((r) => json(r)?.orden_id));
    const nuevas = k2.filter((r) => json(r)?.sin_cambios === false).length;
    const filaB = correr(`select estado || ':' || (orden_compra_id is not null) from retail.pedidos_campana where id = '${pedB}';`);
    anotar(
      "K2 cuatro personas confirman a la vez el mismo pedido: nace UNA orden de compra, las cuatro ven la misma y solo una dice haberla creado",
      e2.ok && k2.every((r) => r.startsWith("OK")) && ids.size === 1 && !ids.has(undefined) && nuevas === 1 && ordenes() === 1 && filaB.ok && filaB.salida === "pedido:true",
      `${e2.ok ? "" : e2.mensaje} órdenes ${ordenes()}; distintas ${ids.size}; nuevas ${nuevas}; fila ${filaB.ok ? filaB.salida : filaB.mensaje}\n    ${k2.join("\n    ")}`,
    );

    // K3: cuatro vueltas, cada una con su proveedor: alguien confirma y otra persona rectifica el mismo pedido a la vez.
    const e3 = comoFelipe(enviar(q.map((p) => envio(p, "ya"))));
    const antes = ordenes();
    let vueltasBien = 0;
    const detalle = [];
    for (const prov of q) {
      const p = ped(prov);
      const r = await enParalelo([`select retail.confirmar_pedido_campana('${p}')::text;`, `select retail.rectificar_pedido_campana('${p}', 'Cambié de idea')::text;`]);
      const fila = correr(`select estado || ':' || (orden_compra_id is not null) from retail.pedidos_campana where id = '${p}';`).salida;
      const confirmo = r[0].startsWith("OK");
      const rectifico = r[1].startsWith("OK");
      // Gana una sola de las dos; la que pierde recibe la razón de su rechazo, no un error crudo.
      const razon = confirmo ? /ya es una orden de compra/.test(r[1]) : /se rectificó/.test(r[0]);
      const coherente = confirmo ? fila === "pedido:true" : fila === "rectificado:false";
      if (confirmo !== rectifico && razon && coherente) vueltasBien++;
      detalle.push(`${fila} · confirmar: ${r[0].slice(0, 90)} · rectificar: ${r[1].slice(0, 90)}`);
    }
    const nPedidos = Number(correr(`select count(*) from retail.pedidos_campana where plan_id = '${plan}' and proveedor_id = any (array[${q.map((x) => `'${x}'::uuid`).join(",")}]) and estado = 'pedido';`).salida);
    anotar(
      "K3 cuatro veces alguien confirma y otra persona rectifica el mismo pedido a la vez: gana UNA, la otra recibe su razón, y las órdenes que nacen son exactamente los pedidos «pedido» (nunca un «pedido» sin orden ni una orden de un rectificado)",
      e3.ok && vueltasBien === 4 && ordenes() - antes === nPedidos,
      `${e3.ok ? "" : e3.mensaje} vueltas bien ${vueltasBien}/4; órdenes nuevas ${ordenes() - antes}; pedidos «pedido» ${nPedidos}\n    ${detalle.join("\n    ")}`,
    );
  } finally {
    const lim = correr(LIMPIEZA_REAL);
    if (!lim.ok) console.log(`(!) la limpieza de «ZZ Envio Real» falló, bórralo a mano: ${lim.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? lim.mensaje}`);
  }
}

await concurrencia();
console.log(`\n${casos - fallas}/${casos} casos bien.`);
process.exit(fallas ? 1 : 0);
