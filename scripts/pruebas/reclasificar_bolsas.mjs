#!/usr/bin/env node
/**
 * Pruebas del script de UNA SOLA VEZ que pasa a «Bolsas» las ventas de bolsa anotadas como otra cosa (Bolsas de despacho, actividad 5),
 * contra el Postgres local — CAYLA V2. Script: `supabase/migrations/pegar-en-produccion-bolsas-reclasificar-aqp-2026-10-10.sql`.
 *
 * LO QUE VIGILA. El script cambia lo anotado de 62 ventas con la MISMA función del botón «Corregir lo anotado» (ADR-0369) y, en producción, no
 * se puede ensayar dos veces. Aquí se ensaya con filas de mentira: que cambie SOLO categoría, talla y la descripción automática; que no toque
 * precio, estado ni la venta; que deje su foto de antes y después y su línea en Actividad; que sea todo o nada ante una lista mala o un
 * destino que todavía cuenta en los motores; que volver a pegarlo no haga nada; y que después de correrlo el motor ya no cuente esas ventas.
 *
 * El script se lee del archivo y solo se le cambian tres cosas dentro de la transacción de cada caso (que termina en ROLLBACK): el correo, la
 * categoría de destino y los ids (más la cantidad esperada). El stub local de `public.personas` no trae `email` (producción sí): se agrega ahí.
 *
 * USO
 *   pnpm pruebas:reclasificar-bolsas              → contra la base `postgres` del stack local
 *   pnpm pruebas:reclasificar-bolsas --base otra  → contra otra base del mismo contenedor
 * Necesita la base AL DÍA (`corregir_prenda_sin_registrar` y las tres migraciones de las familias apagadas): como la del CI.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const leer = (n) => readFileSync(join(RAIZ, "supabase", "migrations", n), "utf8");
const MARCA = leer("20261010231000_familias_entran_a_motores.sql");
const MOTORES = leer("20261010232000_piso_demanda_y_plan_ignoran_familias_apagadas.sql");
const ANALISIS_FRESCURA = leer("20261010233000_analisis_y_frescura_ignoran_familias_apagadas.sql");
const SCRIPT = leer("pegar-en-produccion-bolsas-reclasificar-aqp-2026-10-10.sql");
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y administrador del seed
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora (no administradora)
const CENTINELA = "22222222-2222-4222-8222-222222222222";
const CORREO = "admin@prueba.local";
const MARCADOR = "__IDS__";

/** El script con su correo, su categoría de destino y la cantidad esperada puestos; los ids se enchufan en el marcador. */
function scriptConMarcador({ correo = CORREO, categoria = "ZZ Bolsas", esperadas }) {
  const [antes, resto] = SCRIPT.split("-- IDS-INICIO");
  const despues = resto.split("-- IDS-FIN")[1];
  const cabecera = antes
    .replace("'PON-AQUI-TU-CORREO'::text", `'${correo}'::text`)
    .replace("'Bolsas'::text as categoria", `'${categoria}'::text as categoria`)
    .replace("62::integer as esperadas", `${esperadas}::integer as esperadas`);
  return `${cabecera}create temp table _bolsas_ids as select x.id from unnest(array[${MARCADOR}]) as x(id);\n${despues}`;
}

/**
 * Deja en la variable psql `:'<nombre>'` el script armado con los ids de ESTE caso (las variables psql `r1`, `r2`…, que ya trae el preludio):
 * el texto del script va entre `$tx$…$tx$` y los ids se escriben con `quote_literal`, así la prueba no teclea ningún uuid.
 */
function armarScript(nombre, opciones, ...idVars) {
  const [antes, despues] = scriptConMarcador({ ...opciones, esperadas: idVars.length }).split(MARCADOR);
  const ids = idVars.map((v) => `quote_literal(:'${v}') || '::uuid'`).join(" || ', ' || ");
  return `select $tx$${antes}$tx$ || ${ids} || $tx$${despues}$tx$ as ${nombre} \\gset`;
}

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
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

// Cuatro ventas «sin registrar» de mentira en una sede nueva:
//   r1 pendiente «BOLSA COMPRAS» S/ 0.50 anotada en Bolsos y Carteras · r2 cerrada «Bolsos y Carteras · Beige · Talla Única» S/ 0.50 (la automática)
//   r3 anulada «bolsa papel» S/ 0.50 (no se corrige) · r4 pendiente «Blusa lino» S/ 79.90 en una categoría de ropa (NO es de la lista: testigo)
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinControl(MARCA)}
set local search_path = retail, public, extensions;
${sinControl(MOTORES)}
set local search_path = retail, public, extensions;
${sinControl(ANALISIS_FRESCURA)}
set local search_path = retail, public, extensions;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
-- El stub local de Dynamic no trae el correo (producción sí): se agrega aquí, dentro de la transacción.
alter table public.personas add column if not exists email text;
update public.personas set email = '${CORREO}' where auth_user_id = '${FELIPE}';

-- Corre un texto SQL (el script entero) y devuelve «SIN_ERROR» o «sqlstate|mensaje». Antes borra las tablas temporales de una corrida anterior.
create function pg_temp.corre(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute 'drop table if exists pg_temp._bolsas_param, pg_temp._bolsas_ids, pg_temp._bolsas_resumen';
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;

insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede RB', 'tienda', true);
select id as sede from retail.ubicaciones where nombre = 'Sede RB' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'sede', 'Piso de venta', 'piso_venta'), (:'sede', 'Almacén de tienda', 'almacen_tienda');

insert into retail.familias (codigo, nombre, entra_a_motores) values ('zz_empaque_rb', 'ZZ Empaque RB', false), ('zz_cuenta_rb', 'ZZ Cuenta RB', true);
insert into retail.categorias (nombre, familia) values ('ZZ Bolsas', 'zz_empaque_rb'), ('ZZ Bolsas que cuentan', 'zz_cuenta_rb');
select id as cat_bolsas from retail.categorias where nombre = 'ZZ Bolsas' \\gset
select id as cat_bolsos from retail.categorias where nombre = 'Bolsos y Carteras' \\gset
select id as cat_camisas from retail.categorias where nombre <> 'Bolsos y Carteras' and activo and familia = 'indumentaria' order by nombre limit 1 \\gset
select id as t_unica from retail.tallas where lower(valor) = 'única' and activo and estado = 'aprobado' \\gset
select id as t_m from retail.tallas where valor = 'M' \\gset

-- Una venta «sin registrar» de la sede: venta + línea de la centinela + su fila en la cola.
create function pg_temp.anota(p_desc text, p_cat uuid, p_talla uuid, p_precio numeric, p_estado text default 'pendiente') returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := (select id from retail.ubicaciones where nombre = 'Sede RB'); p uuid;
begin
  insert into retail.ventas (ubicacion_id, estado, created_at) values (u, 'completada', now() - interval '2 days') returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, '${CENTINELA}', 1, p_precio, 0) returning id into li;
  insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_en)
    values (li, u, p_desc, p_cat, p_talla, (select codigo from retail.colores where familia_color = 'neutro' and activo order by codigo limit 1), p_precio, now() - interval '2 days')
    returning id into p;
  if p_estado = 'cerrada_sin_prenda' then
    insert into retail.cierres_cola_arranque (id, ubicacion_id, corte, motivo, filas, soles, cerrado_por)
      values (gen_random_uuid(), u, now() - interval '1 day', 'no_se_sabe', 1, p_precio, (select id from public.personas limit 1));
    update retail.prendas_por_regularizar
       set estado = p_estado, cierre_id = (select c.id from retail.cierres_cola_arranque c where c.ubicacion_id = u order by c.cerrado_en desc limit 1) where id = p;
  elsif p_estado <> 'pendiente' then
    update retail.prendas_por_regularizar set estado = p_estado where id = p;
  end if;
  return p;
end $$;
select pg_temp.anota('BOLSA COMPRAS', :'cat_bolsos', :'t_unica', 0.50) as r1 \\gset
select pg_temp.anota('Bolsos y Carteras · Beige · Talla Única', :'cat_bolsos', :'t_unica', 0.50, 'cerrada_sin_prenda') as r2 \\gset
select pg_temp.anota('bolsa papel', :'cat_bolsos', :'t_unica', 0.50, 'anulada') as r3 \\gset
select pg_temp.anota('Blusa lino', :'cat_camisas', :'t_m', 79.90) as r4 \\gset
-- El rastro y el dinero de la sede, antes.
select count(*) as correcciones_antes from retail.prendas_por_regularizar_correcciones \\gset
select coalesce(sum(vi.cantidad * vi.precio_unitario), 0) as dinero_antes from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id where v.ubicacion_id = :'sede' \\gset
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

// «r1, r2» a mover; «r3» (anulada) a omitir. Lo dejado sin tocar se mide con esta consulta.
const SIGUEN_ANOTADAS_COMO_BOLSOS = `(select count(*) from retail.prendas_por_regularizar where id in (:'r1', :'r2') and categoria_id = :'cat_bolsos')`;

// A. LO QUE HACE ---------------------------------------------------------------------------------------------------------
caso(
  "A1 mueve la pendiente y la cerrada a «ZZ Bolsas» con talla Única; la anulada se omite y la blusa (fuera de la lista) no se toca",
  `${armarScript("script", {}, "r1", "r2", "r3")}
   select pg_temp.corre(:'script') as res \\gset
   select concat_ws(',', :'res',
     (select count(*) from retail.prendas_por_regularizar where id in (:'r1', :'r2') and categoria_id = :'cat_bolsas' and talla_id = :'t_unica'),
     (select categoria_id = :'cat_bolsos' from retail.prendas_por_regularizar where id = :'r3'),
     (select categoria_id = :'cat_camisas' from retail.prendas_por_regularizar where id = :'r4'));`,
  "SIN_ERROR,2,t,t",
);
caso(
  "A2 cambia SOLO lo anotado: la descripción de caja se conserva, la automática pasa a «Bolsa»; precio, estado y dinero de la sede quedan igual",
  `${armarScript("script", {}, "r1", "r2", "r3")}
   select pg_temp.corre(:'script') as res \\gset
   select concat_ws(',', :'res',
     (select descripcion from retail.prendas_por_regularizar where id = :'r1'),
     (select descripcion from retail.prendas_por_regularizar where id = :'r2'),
     (select estado from retail.prendas_por_regularizar where id = :'r1'),
     (select estado from retail.prendas_por_regularizar where id = :'r2'),
     (select precio_cobrado from retail.prendas_por_regularizar where id = :'r2'),
     (select coalesce(sum(vi.cantidad * vi.precio_unitario), 0) = :'dinero_antes'::numeric from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id where v.ubicacion_id = :'sede'));`,
  "SIN_ERROR,BOLSA COMPRAS,Bolsa,pendiente,cerrada_sin_prenda,0.50,t",
);
caso(
  "A3 deja la foto de antes y después de cada una (y solo de las movidas) y su línea en Actividad",
  `${armarScript("script", {}, "r1", "r2", "r3")}
   select count(*) as actividad_antes from retail.actividad where accion = 'prenda_sin_registrar_corregida' \\gset
   select pg_temp.corre(:'script') as res \\gset
   select concat_ws(',', :'res',
     ((select count(*) from retail.prendas_por_regularizar_correcciones) - :'correcciones_antes'::int),
     (select (antes ->> 'categoria_id') = :'cat_bolsos' and (despues ->> 'categoria_id') = :'cat_bolsas' from retail.prendas_por_regularizar_correcciones where prenda_id = :'r1'),
     (select (antes ->> 'descripcion') || ' -> ' || (despues ->> 'descripcion') from retail.prendas_por_regularizar_correcciones where prenda_id = :'r2'),
     (select count(*) from retail.prendas_por_regularizar_correcciones where prenda_id = :'r3'),
     ((select count(*) from retail.actividad where accion = 'prenda_sin_registrar_corregida') - :'actividad_antes'::int));`,
  "SIN_ERROR,2,t,Bolsos y Carteras · Beige · Talla Única -> Bolsa,0,2",
);
caso(
  "A4 pegarlo otra vez no hace nada: las dos ya estaban, ninguna foto nueva",
  `${armarScript("script", {}, "r1", "r2", "r3")}
   select pg_temp.corre(:'script') as uno \\gset
   select count(*) as rastro_1 from retail.prendas_por_regularizar_correcciones \\gset
   select pg_temp.corre(:'script') as dos \\gset
   select concat_ws(',', :'uno', :'dos', ((select count(*) from retail.prendas_por_regularizar_correcciones) - :'rastro_1'::int),
     (select ya_estaban || '/' || movidas || '/' || omitidas from _bolsas_resumen));`,
  "SIN_ERROR,SIN_ERROR,0,2/0/1",
);

// B. TODO O NADA ----------------------------------------------------------------------------------------------------------
caso(
  "B1 sin cambiar el correo de ejemplo se detiene y no cambia nada",
  `${armarScript("script", { correo: "PON-AQUI-TU-CORREO" }, "r1", "r2", "r3")}
   select pg_temp.corre(:'script') as res \\gset
   select concat_ws(',', split_part(:'res', '|', 1), (:'res' like '%Falta poner tu correo%'), ${SIGUEN_ANOTADAS_COMO_BOLSOS},
     ((select count(*) from retail.prendas_por_regularizar_correcciones) - :'correcciones_antes'::int));`,
  "P0001,t,2,0",
);
caso(
  "B2 el correo de alguien que no es administrador se rechaza y no cambia nada",
  `update public.personas set email = 'colab@prueba.local' where auth_user_id = '${MICAELA}' and rol <> 'admin';
   ${armarScript("script", { correo: "colab@prueba.local" }, "r1", "r2", "r3")}
   select pg_temp.corre(:'script') as res \\gset
   select concat_ws(',', (:'res' like '%no es el de un administrador activo%'), ${SIGUEN_ANOTADAS_COMO_BOLSOS});`,
  "t,2",
);
caso(
  "B3 una categoría que no existe, o cuya familia todavía cuenta en los motores, detiene todo y lo dice",
  `${armarScript("sin_categoria", { categoria: "ZZ No existe" }, "r1", "r2", "r3")}
   ${armarScript("que_cuenta", { categoria: "ZZ Bolsas que cuentan" }, "r1", "r2", "r3")}
   select pg_temp.corre(:'sin_categoria') as a \\gset
   select pg_temp.corre(:'que_cuenta') as b \\gset
   select concat_ws(',', (:'a' like '%No hay una categoría activa llamada%'), (:'b' like '%todavía cuenta en los motores%'), ${SIGUEN_ANOTADAS_COMO_BOLSOS});`,
  "t,t,2",
);
caso(
  "B4 una lista que no cuadra (cantidad distinta, un id inexistente o uno repetido) detiene todo y no cambia nada",
  `${armarScript("script", {}, "r1", "r2", "r3")}
   select pg_temp.corre(replace(:'script', '3::integer as esperadas', '4::integer as esperadas')) as cantidad \\gset
   select pg_temp.corre(replace(:'script', :'r1', '00000000-0000-4000-8000-0000000000aa')) as inexistente \\gset
   select pg_temp.corre(replace(:'script', :'r3', :'r2')) as repetido \\gset
   select concat_ws(',', (:'cantidad' like '%La lista no cuadra%'), (:'inexistente' like '%La lista no cuadra%'), (:'repetido' like '%La lista no cuadra%'),
     ${SIGUEN_ANOTADAS_COMO_BOLSOS});`,
  "t,t,t,2",
);
caso(
  "B5 una venta que ya no cumple la regla (la blusa de S/ 79.90 metida en la lista) frena todo: ni siquiera las buenas se mueven",
  `${armarScript("script", {}, "r1", "r2", "r4")}
   select pg_temp.corre(:'script') as res \\gset
   select concat_ws(',', (:'res' like '%ya no cumple la regla de la lista%'), ${SIGUEN_ANOTADAS_COMO_BOLSOS},
     ((select count(*) from retail.prendas_por_regularizar_correcciones) - :'correcciones_antes'::int));`,
  "t,2,0",
);

// C. EL MOTOR YA NO LAS CUENTA ---------------------------------------------------------------------------------------------
caso(
  "C1 antes del script el motor del piso cuenta la pendiente en Bolsos y Carteras; después ya no la cuenta ahí ni en «ZZ Bolsas»",
  `${armarScript("script", {}, "r1", "r2", "r3")}
   ${como(FELIPE)}
   select (select count(*) from jsonb_array_elements(retail.fn_piso_plan_lectura(:'sede') -> 'ventas') v where v ->> 'categoria_id' = :'cat_bolsos') as antes_piso \\gset
   select pg_temp.corre(:'script') as res \\gset
   ${como(FELIPE)}
   select concat_ws(',', :'res', :'antes_piso',
     (select count(*) from jsonb_array_elements(retail.fn_piso_plan_lectura(:'sede') -> 'ventas') v where v ->> 'categoria_id' = :'cat_bolsos'),
     (select count(*) from jsonb_array_elements(retail.fn_piso_plan_lectura(:'sede') -> 'ventas') v where v ->> 'categoria_id' = :'cat_bolsas'));`,
  "SIN_ERROR,1,0,0",
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
