#!/usr/bin/env node
/**
 * Los dos arreglos (octubre) que vivían solo en producción y ahora están en `main` — CAYLA V2. Hermana de
 * `arreglos_en_vivo.mjs` (ADR-0255, los de septiembre), que usa otro armazón de casos; esta mira el comportamiento y la huella.
 *
 *   · `20261022200000_cuentas_con_rol_solo_personas_activas.sql`  → `retail.fn_cuentas_con_rol()` (Roles y accesos)
 *   · `20261022201000_observatorio_tienda_prenda_sin_registrar_en_su_categoria.sql` → `retail.fn_observatorio_tienda(uuid)`
 *
 * QUÉ PRUEBA, por cada una.
 *   · LO QUE HACE EL ARREGLO. Roles: una persona dada de baja en Dynamic (`public.personas.estado <> 'activo'`) no aparece en la
 *     lista, ni como colaboradora ni como suspendida; la activa sí. Observatorio: una prenda sin registrar cuenta en la categoría
 *     que se declaró en caja al venderla y no en «Sin categoría»; la categoría del catálogo sigue mandando; la unión no duplica
 *     ventas (el total por categorías no cambia).
 *   · EL CONTROL. Cada caso se repite con la versión de `main` de ANTES (la sacada del archivo que la definió) y tiene que dar
 *     lo contrario: si la prueba no ve la diferencia, no vigila nada.
 *   · LOS PERMISOS. `anon` y PUBLIC no las ejecutan; `authenticated` sí (y la función decide); quien no es líder / Admin recibe
 *     42501.
 *   · LOS ATRIBUTOS. `security definer`, `stable` y el `search_path` son los de producción: sin `security definer` la función
 *     leería `public.personas` y las ventas con los permisos de quien llama, y la huella del cuerpo no lo vería.
 *   · LA HUELLA. El cuerpo que deja `main` normalizado como en `scripts/migraciones/deriva.sql` (sin comentarios ni espacios)
 *     tiene el md5 del cuerpo de producción leído el 2026-10-22. Si una migración posterior cambia a propósito una de estas
 *     funciones, esa migración actualiza el md5 de aquí en el mismo PR: es la misma deriva que la revisión diaria ve.
 *
 * CÓMO. Mismo patrón que `frescura_vara_cayla.mjs`: cada caso en su transacción con ROLLBACK (la base local la comparten varias
 * sesiones); la sesión se simula con `request.jwt.claim.*`; las ventas se siembran con los disparadores apagados
 * (`session_replication_role = replica`): aquí se prueba la lectura, no la venta.
 *
 * USO
 *   pnpm pruebas:arreglos-en-vivo-roles-observatorio → contra la base `postgres` del stack local (la del CI)
 *   … --base otra                                 → contra otra base del mismo contenedor
 *   … --en-seco                                   → carga las dos migraciones dentro de cada caso (base sin ellas)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const EN_SECO = process.argv.includes("--en-seco");

const leer = (archivo) => readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8");
const MIG_ROL = leer("20261022200000_cuentas_con_rol_solo_personas_activas.sql");
const MIG_OBS = leer("20261022201000_observatorio_tienda_prenda_sin_registrar_en_su_categoria.sql");

// La versión de `main` de ANTES de cada arreglo, sacada del archivo que la definió: el control de cada caso.
const ROL_DE_ANTES = leer("20260923030000_roles_por_modulo.sql").match(
  /create or replace function retail\.fn_cuentas_con_rol\(\)[\s\S]*?\nend;\n\$fn\$;/,
)?.[0];
const OBS_DE_ANTES = leer("20261004020000_observatorio_inicio_del_admin.sql").match(
  /create or replace function retail\.fn_observatorio_tienda\(p_ubicacion_id uuid\)[\s\S]*?\nend;\n\$\$;/,
)?.[0];
if (!ROL_DE_ANTES) throw new Error("No encontré fn_cuentas_con_rol en 20260923030000: el control no puede armarse.");
if (!OBS_DE_ANTES) throw new Error("No encontré fn_observatorio_tienda en 20261004020000: el control no puede armarse.");

// md5 del cuerpo normalizado de producción (consulta de solo lectura del 2026-10-22).
const HUELLA_ROL = "b6a16dec874857d57ce37305df3d9af5";
const HUELLA_OBS = "7fdc1bb21942eda1b93a3b014b31e6e7";

// Seed local: Felipe (líder, y Admin una vez que se le sube el rol en Dynamic) y Micaela (colaboradora de Trujillo).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// La variante centinela de «Prenda sin registrar» (20260923161700): su producto no tiene categoría.
const CENTINELA = "22222222-2222-4222-8222-222222222222";
const VENTA_A = "55555555-5555-4555-8555-0000000000a1";
const ITEM_A = "55555555-5555-4555-8555-0000000000b1";

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

/** Todo lo que un caso necesita, dentro de su transacción. */
const PRELUDIO = `
begin;
${EN_SECO ? `${MIG_ROL}\n${MIG_OBS}` : ""}
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
create temp table s as select
  (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru,
  (select id from public.personas where auth_user_id = '${FELIPE}') as felipe,
  (select id from public.personas where auth_user_id = '${MICAELA}') as micaela,
  ((now() at time zone 'America/Lima')::date) as hoy;
`;

// La sesión simulada: lo que PostgREST hace con cada petición. Las tres variables se fijan siempre.
const como = (auth) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claim.role = 'authenticated';\n` +
  `set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Lo de abajo normaliza el cuerpo igual que `scripts/migraciones/deriva.sql`: sin comentarios (los textos entre comillas se conservan) y sin espacios.
const HUELLA_DEL_CUERPO = (firma) => String.raw`
select md5(regexp_replace(regexp_replace(p.prosrc, $re$('(?:[^']|'')*')|--[^$re$ || chr(10) || $re$]*|/\*(?:[^*]|\*+[^*/])*\*+/$re$, '\1', 'g'), '\s+', '', 'g'))
  from pg_proc p where p.oid = '${firma}'::regprocedure;`;

// Los numéricos de Postgres salen con sus dos decimales (-70.00): se comparan sin ellos.
const sinDecimales = (esperado) => (s) => s.replace(/\.00/g, "") === esperado;

let fallas = 0;
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok
    ? (r.salida.split("\n").pop() ?? "")
    : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (bien) {
    console.log(`✓ ${nombre}`);
  } else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

// ═══════════════ fn_cuentas_con_rol ═══════════════
const CUENTAS_DE = (quien) => `retail.fn_cuentas_con_rol() c where c.id = (select ${quien} from s)`;

caso(
  "Roles: una persona activa aparece en la lista, y el líder también",
  `${como(FELIPE)}\nselect (select count(*) from ${CUENTAS_DE("micaela")}) || '|' || (select count(*) from ${CUENTAS_DE("felipe")});`,
  "1|1",
);
caso(
  "Roles: una persona dada de baja en Dynamic NO aparece (y el líder, que sigue activo, sí)",
  `update public.personas set estado = 'inactivo' where id = (select micaela from s);
${como(FELIPE)}
select (select count(*) from ${CUENTAS_DE("micaela")}) || '|' || (select count(*) from ${CUENTAS_DE("felipe")});`,
  "0|1",
);
const SUSPENDER_A_MICAELA = `select rol_id as rol_de_micaela from retail.colaboradores where persona_id = (select micaela from s) \\gset
set local session_replication_role = replica;
delete from retail.colaboradores where persona_id = (select micaela from s);
insert into retail.colaboradores_suspendidos (persona_id, rol, rol_id, ubicacion_asignada_id, agregado_en, suspendido_por)
  select micaela, 'colaborador', :'rol_de_micaela', tru, now(), felipe from s;
set local session_replication_role = origin;`;
caso(
  "Roles: una persona suspendida activa aparece como suspendida; si Dynamic la dio de baja, deja de aparecer",
  `${SUSPENDER_A_MICAELA}
${como(FELIPE)}
select count(*) as antes from ${CUENTAS_DE("micaela")} and c.estado = 'suspendido' \\gset
update public.personas set estado = 'inactivo' where id = (select micaela from s);
select :antes || '|' || (select count(*) from ${CUENTAS_DE("micaela")});`,
  "1|0",
);
caso(
  "Roles (control): con la versión de `main` de antes, la persona dada de baja SÍ aparecía — la prueba ve la diferencia",
  `${ROL_DE_ANTES}
update public.personas set estado = 'inactivo' where id = (select micaela from s);
${como(FELIPE)}
select count(*) from ${CUENTAS_DE("micaela")};`,
  "1",
);
caso(
  "Roles: quien no es líder recibe 42501",
  // Si Micaela no existiera en la semilla, el 42501 saldría por otra razón (sin persona): se avisa en vez de pasar en verde.
  `${como(MICAELA)}\nselect case when (select micaela from s) is null then 'SIN_MICAELA'
    else pg_temp.intento('select * from retail.fn_cuentas_con_rol()') end;`,
  (s) => s.startsWith("42501|"),
);
caso(
  "Roles: anon y PUBLIC no la ejecutan; authenticated sí",
  `select has_function_privilege('anon', 'retail.fn_cuentas_con_rol()', 'execute') || '|' ||
         has_function_privilege('authenticated', 'retail.fn_cuentas_con_rol()', 'execute') || '|' ||
         exists (select 1 from aclexplode((select proacl from pg_proc where oid = 'retail.fn_cuentas_con_rol()'::regprocedure)) a where a.grantee = 0);`,
  "false|true|false",
);
const ATRIBUTOS_DE = (firma) =>
  `select prosecdef::text || '|' || provolatile::text || '|' || array_to_string(proconfig, ';') from pg_proc where oid = '${firma}'::regprocedure;`;
const ATRIBUTOS_DE_PRODUCCION = "true|s|search_path=retail, public, extensions";
caso(
  "Roles: es `security definer`, `stable` y con su search_path, como en producción",
  ATRIBUTOS_DE("retail.fn_cuentas_con_rol()"),
  ATRIBUTOS_DE_PRODUCCION,
);
caso(
  "Roles: el cuerpo que deja `main` es el de producción (huella del 2026-10-22)",
  HUELLA_DEL_CUERPO("retail.fn_cuentas_con_rol()"),
  HUELLA_ROL,
);

// ═══════════════ fn_observatorio_tienda ═══════════════
// Una venta de hoy en Trujillo de S/ 70 con una línea a nombre de `variante`, y un medidor de lo que el panel reparte por categoría.
const VENTA_DE_HOY = (variante) => `
update public.personas set rol = 'admin' where id = (select felipe from s);
select id as cat1 from retail.categorias order by nombre limit 1 \\gset
set local session_replication_role = replica;
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, usuario_id)
  select '${VENTA_A}', tru, (hoy + time '00:05')::timestamp at time zone 'America/Lima', 'completada', false, felipe from s;
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  values ('${ITEM_A}', '${VENTA_A}', ${variante}, 1, 70, 0);
set local session_replication_role = origin;
create function pg_temp.suma_cat(p_nombre text) returns numeric language sql as $f$
  select coalesce(sum((c->>'s')::numeric), 0)
    from jsonb_array_elements(retail.fn_observatorio_tienda((select tru from s))->'categorias'->'hoy') c
   where c->>'cat' = p_nombre $f$;
create function pg_temp.suma_total() returns numeric language sql as $f$
  select coalesce(sum((c->>'s')::numeric), 0)
    from jsonb_array_elements(retail.fn_observatorio_tienda((select tru from s))->'categorias'->'hoy') c $f$;
${como(FELIPE)}
create temp table antes as select pg_temp.suma_cat('Sin categoría') as sin_cat,
  pg_temp.suma_cat((select nombre from retail.categorias where id = :'cat1')) as en_cat1, pg_temp.suma_total() as total;`;

const DECLARAR_EN_CAJA = (categoriaSql) => `
reset role;
set local session_replication_role = replica;
insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_en)
  select '${ITEM_A}', tru, 'Blusa de prueba', ${categoriaSql}, (select id from retail.tallas order by id limit 1),
         (select codigo from retail.colores order by codigo limit 1), 70, now() from s;
set local session_replication_role = origin;
${como(FELIPE)}`;

// El cuarto campo prueba que la venta sembrada SE VE en el panel antes de declararla (S/ 70 en «Sin categoría»): sin él, un panel
// ciego a la venta daría los mismos ceros y el control pasaría por una razón distinta a la que dice.
const DELTAS = `select (pg_temp.suma_cat('Sin categoría') - a.sin_cat) || '|' ||
  (pg_temp.suma_cat((select nombre from retail.categorias where id = :'cat1')) - a.en_cat1) || '|' ||
  (pg_temp.suma_total() - a.total) || '|' || (a.sin_cat >= 70) from antes a;`;

caso(
  "Observatorio: una prenda sin registrar cuenta en la categoría que se declaró en caja, no en «Sin categoría» (y el total no cambia)",
  `${VENTA_DE_HOY(`'${CENTINELA}'`)}
${DECLARAR_EN_CAJA(":'cat1'")}
${DELTAS}`,
  sinDecimales("-70|70|0|true"),
);
caso(
  "Observatorio (control): con la versión de `main` de antes, esa venta se queda en «Sin categoría» — la prueba ve la diferencia",
  `${OBS_DE_ANTES}
${VENTA_DE_HOY(`'${CENTINELA}'`)}
${DECLARAR_EN_CAJA(":'cat1'")}
${DELTAS}`,
  sinDecimales("0|0|0|true"),
);
caso(
  "Observatorio: la categoría del catálogo sigue mandando — la declarada en caja no la pisa",
  `${VENTA_DE_HOY("(select v.id from retail.variantes v join retail.productos p on p.id = v.producto_id where p.categoria_id is not null and v.id <> '" + CENTINELA + "' order by v.id limit 1)")}
create temp table propia as
  select c.nombre as de_catalogo, (select nombre from retail.categorias o where o.id <> p.categoria_id order by o.nombre limit 1) as otra,
         (select o.id from retail.categorias o where o.id <> p.categoria_id order by o.nombre limit 1) as otra_id
    from retail.venta_items vi join retail.variantes v on v.id = vi.variante_id join retail.productos p on p.id = v.producto_id
    join retail.categorias c on c.id = p.categoria_id where vi.id = '${ITEM_A}';
create temp table antes2 as select pg_temp.suma_cat((select de_catalogo from propia)) as catalogo, pg_temp.suma_cat((select otra from propia)) as otra from (select 1) x;
${DECLARAR_EN_CAJA("(select otra_id from propia)")}
select (pg_temp.suma_cat((select de_catalogo from propia)) - a.catalogo) || '|' || (pg_temp.suma_cat((select otra from propia)) - a.otra) || '|' || (a.catalogo >= 70) from antes2 a;`,
  sinDecimales("0|0|true"),
);
caso(
  "Observatorio: quien no es Admin recibe 42501; una ubicación que no es tienda, 22023",
  `update public.personas set rol = 'admin' where id = (select felipe from s);
${como(FELIPE)}
select pg_temp.intento('select retail.fn_observatorio_tienda((select id from retail.ubicaciones where tipo = ''taller'' limit 1))') as taller \\gset
update public.personas set rol = 'integrante' where id = (select felipe from s);
select :'taller' || ' // ' || pg_temp.intento('select retail.fn_observatorio_tienda((select tru from s))');`,
  (s) => s.startsWith("22023|") && s.includes(" // 42501|"),
);
caso(
  "Observatorio: anon y PUBLIC no la ejecutan; authenticated sí",
  `select has_function_privilege('anon', 'retail.fn_observatorio_tienda(uuid)', 'execute') || '|' ||
         has_function_privilege('authenticated', 'retail.fn_observatorio_tienda(uuid)', 'execute') || '|' ||
         exists (select 1 from aclexplode((select proacl from pg_proc where oid = 'retail.fn_observatorio_tienda(uuid)'::regprocedure)) a where a.grantee = 0);`,
  "false|true|false",
);
caso(
  "Observatorio: es `security definer`, `stable` y con su search_path, como en producción",
  ATRIBUTOS_DE("retail.fn_observatorio_tienda(uuid)"),
  ATRIBUTOS_DE_PRODUCCION,
);
caso(
  "Observatorio: el cuerpo que deja `main` es el de producción (huella del 2026-10-22)",
  HUELLA_DEL_CUERPO("retail.fn_observatorio_tienda(uuid)"),
  HUELLA_OBS,
);

console.log(fallas ? `\n${fallas} falla(s)` : "\nTodo bien");
process.exit(fallas ? 1 : 0);
