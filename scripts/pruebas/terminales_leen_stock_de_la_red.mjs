#!/usr/bin/env node
/**
 * Pruebas de «Dónde más hay» y las terminales (ADR-0289, segunda tanda; migración
 * `20261004110000_stock_por_sede_pasa_la_puerta_de_lectura.sql`) — CAYLA V2.
 *
 * EL BUG QUE VIGILA. `fn_stock_por_sede()` (ADR-0270) conservaba su PROPIA puerta —«persona activa con colaborador activo»,
 * escrita a mano en un `exists (…)`— en vez de `fn_tiene_acceso_retail()`, que desde ADR-0289 también deja pasar a una
 * terminal. Para una terminal la función devolvía CERO FILAS SIN ERROR y `fn_stock_por_sede_json()` devolvía `[]`: Vender
 * («Dónde más hay»), Cambios, Apartados y «Pedir a otra sede» lo leían como «ninguna otra sede tiene stock».
 *
 * QUÉ PRUEBA.
 *   · PRUEBA DE LA PRUEBA. Con el cuerpo ANTERIOR de la función (el de `20260929020000`, md5 de producción) la terminal
 *     recibe 0 filas y `[]`, mientras el líder recibe toda la red: así se ve que el arnés reproduce el bug.
 *   · LA PUERTA DEL DATO. Reciben la red: un líder, una colaboradora, una terminal administrativa, una terminal de ventas.
 *     NO reciben nada: una terminal desactivada, una terminal de una sede desactivada, una cuenta de Auth sin persona ni
 *     terminal, una persona de Dynamic sin colaborador, una colaboradora con el alta pendiente, y quien no tiene sesión.
 *   · LA MISMA RED. Lo que recibe una terminal no es «algo»: son exactamente las mismas filas que recibe el líder (mismo
 *     md5), e incluyen stock de OTRAS sedes (lo que «Dónde más hay» necesita). Y por la vía real de Vender
 *     (`fn_stock_por_sede_json()` con el rol `authenticated`, como PostgREST) la terminal recibe la red y la cuenta de afuera `[]`.
 *   · COSTO. La puerta se evalúa UNA vez por consulta, no una vez por fila de stock (`pg_stat_xact_user_functions`).
 *   · LA MIGRACIÓN. Se puede pegar dos veces; su guardia se detiene sin tocar nada si la función tiene otro cuerpo o si la
 *     puerta todavía no conoce la terminal; deja UNA firma con los mismos permisos; y SOLO cambió la puerta (el resto del
 *     cuerpo es el de ADR-0270 línea por línea).
 *   · EL INVENTARIO DE PUERTAS PROPIAS. Toda función de `retail` que arma su propia puerta «persona + colaborador» sin
 *     conocer la terminal y sin usar `fn_tiene_acceso_retail()` está en una lista cerrada, cada una con su porqué. Una
 *     función NUEVA que copie la puerta pone esta prueba en rojo: o se cambia a la puerta única, o se agrega a la lista
 *     diciendo por qué una terminal no debe entrar. Es lo que habría atrapado este bug y atrapa el de la próxima.
 *
 * CÓMO. Mismo patrón que `terminales_leen_proveedores_y_existencias.mjs`: cada escenario en su transacción con ROLLBACK;
 * las terminales, sus cuentas de Auth y lo que haga falta se crean DENTRO del escenario y desaparecen con él. La sesión se
 * simula con `request.jwt.claim.sub` (lo que PostgREST hace con cada petición).
 *
 * USO
 *   pnpm pruebas:terminales-red                 → contra la base `postgres` del stack local
 *   pnpm pruebas:terminales-red --base otra     → contra otra base del mismo contenedor
 *   … --en-seco                                  → carga la migración dentro de cada escenario (base sin ella)
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
const leerMigracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
const MIGRACION = leerMigracion("20261004110000_stock_por_sede_pasa_la_puerta_de_lectura.sql");

// El cuerpo ANTERIOR de la función, tal cual lo dejó ADR-0270 (el de producción hasta esta migración, md5 19273e62…).
const CUERPO_ANTERIOR = leerMigracion("20260929020000_catalogo_y_otras_sedes_leen_la_cifra_unica.sql").match(
  /create or replace function retail\.fn_stock_por_sede\(\)[\s\S]*?\$\$;/
)?.[0];
if (!CUERPO_ANTERIOR) throw new Error("No encontré fn_stock_por_sede() en 20260929020000: la prueba parte de ese cuerpo.");
const MD5_ANTERIOR = "19273e623fa7554c4cf8c0b3986fbb0e";
// La puerta ANTES de que ADR-0289 le enseñara la terminal (20260922170000): para probar la segunda guardia.
const PUERTA_SIN_TERMINAL = leerMigracion("20260922170000_alta_colaborador_requiere_aprobacion.sql").match(
  /create or replace function retail\.fn_tiene_acceso_retail\(\)[\s\S]*?\$\$;/
)?.[0];
if (!PUERTA_SIN_TERMINAL) throw new Error("No encontré fn_tiene_acceso_retail() en 20260922170000.");

// Seed local: Felipe (líder) y Micaela (colaboradora de Trujillo).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
// Creados en cada escenario.
const T_ADMIN_TRU = "33333333-3333-4333-8333-0000000000a2";
const T_VENTAS_TRU = "33333333-3333-4333-8333-0000000000a1";
const T_APAGADA = "33333333-3333-4333-8333-0000000000a4";
const T_SEDE_APAGADA = "33333333-3333-4333-8333-0000000000a5";
const AFUERA = "33333333-3333-4333-8333-0000000000d1"; // cuenta de Auth sin persona, sin colaborador, sin terminal
const SOLO_DYNAMIC = "33333333-3333-4333-8333-0000000000d2"; // persona de Dynamic activa, sin colaborador
const PENDIENTE = "33333333-3333-4333-8333-0000000000d3"; // colaboradora con el alta pendiente de aprobación
const P_SOLO_DYNAMIC = "33333333-3333-4333-8333-0000000000e2";
const P_PENDIENTE = "33333333-3333-4333-8333-0000000000e3";

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

/** Todo lo que un escenario necesita, dentro de su transacción. */
const PRELUDIO = `
begin;
${EN_SECO ? MIGRACION : ""}
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

select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
-- Lo que la red DEBE mostrar, contado sin puerta (el núcleo no la tiene): disponible > 0, sin tallas retiradas, en sedes activas.
select count(*) as n_red from retail.fn_existencias_base(null, null) e
  join retail.ubicaciones u on u.id = e.ubicacion_id and u.activo where not e.talla_retirada and e.disponible > 0 \\gset

-- Las cuentas de Auth: dos terminales de Trujillo, una desactivada, una en una sede que se apaga, y las que NO son actores de retail.
insert into auth.users (id, aud, role, email) values
  ('${T_ADMIN_TRU}', 'authenticated', 'authenticated', 't-admin-tru@prueba.local'),
  ('${T_VENTAS_TRU}', 'authenticated', 'authenticated', 't-ventas-tru@prueba.local'),
  ('${T_APAGADA}', 'authenticated', 'authenticated', 't-apagada@prueba.local'),
  ('${T_SEDE_APAGADA}', 'authenticated', 'authenticated', 't-sede-apagada@prueba.local'),
  ('${AFUERA}', 'authenticated', 'authenticated', 'afuera@prueba.local'),
  ('${SOLO_DYNAMIC}', 'authenticated', 'authenticated', 'solo-dynamic@prueba.local'),
  ('${PENDIENTE}', 'authenticated', 'authenticated', 'pendiente@prueba.local');
-- Una sede que después se desactiva, para probar la terminal de una sede apagada sin tocar Trujillo ni Lima.
insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede de prueba', 'tienda', true);
select id as sede_prueba from retail.ubicaciones where nombre = 'Sede de prueba' \\gset
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values
  (:'tru', 'Terminal Almacén TRU', retail.fn_rol_por_clave('terminal_administrativa'), '${T_ADMIN_TRU}'),
  (:'tru', 'Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS_TRU}'),
  (:'tru', 'Terminal Apagada TRU', retail.fn_rol_por_clave('terminal_administrativa'), '${T_APAGADA}'),
  (:'sede_prueba', 'Terminal de sede de prueba', retail.fn_rol_por_clave('terminal_administrativa'), '${T_SEDE_APAGADA}');
-- Una persona de Dynamic sin retail y una colaboradora con el alta sin aprobar.
insert into public.personas (id, auth_user_id, nombres, apellidos, estado, sede_base_id)
  select '${P_SOLO_DYNAMIC}'::uuid, '${SOLO_DYNAMIC}'::uuid, 'Solo', 'Dynamic', 'activo', sede_dynamic_id from retail.ubicaciones where id = :'tru'
  union all select '${P_PENDIENTE}'::uuid, '${PENDIENTE}'::uuid, 'Alta', 'Pendiente', 'activo', sede_dynamic_id from retail.ubicaciones where id = :'tru';
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, estado) values ('${P_PENDIENTE}', 'colaborador', :'tru', 'pendiente_aprobacion');
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const SIN_SESION = `set local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n`;
/** Apaga la terminal / la sede: se hace como postgres, antes de cambiar de sesión. */
const APAGAR_TERMINAL = `update retail.terminales set activo = false, desactivada_at = now() where auth_user_id = '${T_APAGADA}';\n`;
const APAGAR_SEDE = `update retail.ubicaciones set activo = false where id = :'sede_prueba';\n`;

let fallas = 0;
let casos = 0;
function registrar(nombre, obtenido, esperado) {
  casos++;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  registrar(nombre, obtenido, esperado);
}

/** «¿cuántas filas recibe esta cuenta, y son todas las de la red?» → «n,t» (t = coincide con lo que la red debe mostrar). */
const filas = `select count(*) || ',' || (count(*) = :n_red and :n_red > 0) from retail.fn_stock_por_sede();`;
/** Cuántas filas recibe, sin comparar con la red (para las cuentas que no deben recibir nada). */
const cuantas = `select count(*) from retail.fn_stock_por_sede();`;

// ===========================================================================
// 0. LA PRUEBA DE LA PRUEBA: con el cuerpo anterior, el bug de producción
// ===========================================================================

caso(
  "PRUEBA DE LA PRUEBA: con el cuerpo ANTERIOR la terminal recibe 0 filas y `[]` en silencio — el bug (y la base tiene red que mostrar)",
  `${CUERPO_ANTERIOR}\n` + como(T_ADMIN_TRU) +
    `select concat_ws(',', (select count(*) from retail.fn_stock_por_sede()), retail.fn_stock_por_sede_json()::text, :n_red > 0);`,
  "0,[],t"
);
caso(
  "PRUEBA DE LA PRUEBA: con el cuerpo ANTERIOR el líder sí recibe toda la red (la diferencia es solo la terminal)",
  `${CUERPO_ANTERIOR}\n` + como(FELIPE) + filas,
  (s) => /^\d+,true$/.test(s) // n varía con el seed: lo que importa es la forma «n,true»
);

// ===========================================================================
// 1. LA PUERTA DEL DATO: quién recibe la red y quién no
// ===========================================================================

caso("el LÍDER (Felipe) recibe toda la red", como(FELIPE) + filas, (s) => /^\d+,true$/.test(s));
caso("la COLABORADORA (Micaela) recibe toda la red", como(MICAELA) + filas, (s) => /^\d+,true$/.test(s));
caso("la terminal ADMINISTRATIVA activa recibe toda la red (el bug: antes, nada)", como(T_ADMIN_TRU) + filas, (s) => /^\d+,true$/.test(s));
caso("la terminal de VENTAS activa recibe toda la red (es quien más pregunta «¿dónde más hay?»)", como(T_VENTAS_TRU) + filas, (s) => /^\d+,true$/.test(s));
caso("una terminal DESACTIVADA no recibe nada", APAGAR_TERMINAL + como(T_APAGADA) + cuantas, "0");
caso("una terminal de una sede DESACTIVADA no recibe nada", APAGAR_SEDE + como(T_SEDE_APAGADA) + cuantas, "0");
caso("una cuenta de Auth sin persona, sin colaborador y sin terminal no recibe nada", como(AFUERA) + cuantas, "0");
caso("una persona de Dynamic activa SIN colaborador no recibe nada (la puerta no se ensancha a Dynamic)", como(SOLO_DYNAMIC) + cuantas, "0");
caso("una colaboradora con el alta pendiente de aprobación no recibe nada", como(PENDIENTE) + cuantas, "0");
caso("sin sesión (auth.uid() nulo) no recibe nada", SIN_SESION + cuantas, "0");

// ===========================================================================
// 2. LA MISMA RED, no solo el mismo conteo
// ===========================================================================

/** La huella de lo que una cuenta recibe: mismas filas ⇒ mismo md5. */
const HUELLA = `md5(coalesce(string_agg(variante_id::text || ubicacion_id::text || cantidad::text, ',' order by variante_id, ubicacion_id), ''))`;
const GUARDAR_HUELLA = (alias) => `select ${HUELLA} as ${alias} from retail.fn_stock_por_sede() \\gset\n`;
caso(
  "la terminal ADMINISTRATIVA recibe EXACTAMENTE las mismas filas que el líder (mismo md5, y no vacío)",
  como(FELIPE) + GUARDAR_HUELLA("m_lider") + como(T_ADMIN_TRU) +
    `select concat_ws(',', (select ${HUELLA} from retail.fn_stock_por_sede()) = :'m_lider', :'m_lider' <> md5(''));`,
  "t,t"
);
caso(
  "la terminal de VENTAS recibe EXACTAMENTE las mismas filas que el líder",
  como(FELIPE) + GUARDAR_HUELLA("m_lider") + como(T_VENTAS_TRU) + `select (select ${HUELLA} from retail.fn_stock_por_sede()) = :'m_lider';`,
  "t"
);
caso(
  "la terminal de Trujillo recibe stock de OTRAS sedes (lo que «Dónde más hay» necesita), no solo el de la suya",
  como(T_VENTAS_TRU) + `select count(*) filter (where ubicacion_id <> :'tru') > 0 from retail.fn_stock_por_sede();`,
  "t"
);
caso(
  "VÍA DE VENDER: `fn_stock_por_sede_json()` con el rol `authenticated` (como PostgREST) le da la red a la terminal de ventas",
  como(T_VENTAS_TRU) + `set local role authenticated;\nselect jsonb_array_length(retail.fn_stock_por_sede_json()) = :n_red and :n_red > 0;`,
  "t"
);
caso(
  "VÍA DE VENDER: la cuenta de afuera recibe `[]` con el rol `authenticated`",
  como(AFUERA) + `set local role authenticated;\nselect retail.fn_stock_por_sede_json()::text;`,
  "[]"
);

// ===========================================================================
// 3. COSTO: la puerta se evalúa una vez por consulta, no una vez por fila de stock
// ===========================================================================

caso(
  "COSTO: la puerta se llama UNA vez por consulta aunque haya decenas de filas (filtro de una sola vez, no por fila)",
  `set local track_functions = 'all';\n` + como(FELIPE) +
    `select count(*) as n from retail.fn_stock_por_sede() \\gset\n` +
    `select concat_ws(',', :n > 1, (select calls from pg_stat_xact_user_functions where schemaname = 'retail' and funcname = 'fn_tiene_acceso_retail'));`,
  "t,1"
);

// ===========================================================================
// 4. LA MIGRACIÓN
// ===========================================================================

const OID = `'retail.fn_stock_por_sede()'::regprocedure`;
caso(
  "la migración se puede pegar dos veces: el cuerpo no cambia",
  `${MIGRACION}\nselect md5(prosrc) as m1 from pg_proc where oid = ${OID} \\gset\n${MIGRACION}\n` +
    `select (md5(prosrc) = :'m1')::text from pg_proc where oid = ${OID};`,
  "true"
);
caso(
  "la guardia se detiene sin tocar nada si la función tiene otro cuerpo (alguien la cambió en vivo)",
  `create or replace function retail.fn_stock_por_sede() returns table (variante_id uuid, ubicacion_id uuid, cantidad integer)
     language sql stable security definer set search_path = retail, public, extensions as $$ select null::uuid, null::uuid, 0 where false $$;
   select md5(prosrc) as m0 from pg_proc where oid = ${OID} \\gset
   select pg_temp.intento($migracion$${MIGRACION}$migracion$) as intento \\gset
   select (:'intento' like 'P0001|fn_stock_por_sede() tiene otro cuerpo (md5 %') || ',' || (select md5(prosrc) = :'m0' from pg_proc where oid = ${OID});`,
  "true,true"
);
caso(
  "la guardia se detiene sin tocar nada si la puerta todavía NO conoce la terminal (si no, la función seguiría vacía para ella)",
  `${PUERTA_SIN_TERMINAL}\n${CUERPO_ANTERIOR}\n` +
    `select md5(prosrc) as m0 from pg_proc where oid = ${OID} \\gset
   select pg_temp.intento($migracion$${MIGRACION}$migracion$) as intento \\gset
   select (:'intento' like 'P0001|La puerta fn_tiene_acceso_retail() todavía no reconoce a las terminales%') || ',' || (select md5(prosrc) = :'m0' from pg_proc where oid = ${OID});`,
  "true,true"
);
caso(
  "la función sigue siendo UNA firma, SECURITY DEFINER, STABLE, con el search_path fijado y el mismo tipo de retorno",
  `select concat_ws(',', (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_stock_por_sede'),
     (select prosecdef from pg_proc where oid = ${OID}),
     (select provolatile = 's' from pg_proc where oid = ${OID}),
     (select coalesce(array_to_string(proconfig, ';') like '%search_path=%', false) from pg_proc where oid = ${OID}),
     (select pg_get_function_result(oid) from pg_proc where oid = ${OID}));`,
  "1,t,t,t,TABLE(variante_id uuid, ubicacion_id uuid, cantidad integer)"
);
caso(
  "los permisos no cambian: el ACL es el mismo antes y después (parte del cuerpo anterior, así que también prueba que su guardia lo acepta)",
  `${CUERPO_ANTERIOR}
   select coalesce(proacl::text, 'default') as acl0, md5(prosrc) as m0 from pg_proc where oid = ${OID} \\gset
   ${MIGRACION}
   select concat_ws(',', :'m0' = '${MD5_ANTERIOR}', coalesce(proacl::text, 'default') = :'acl0', md5(prosrc) <> :'m0', prosrc ~ 'fn_tiene_acceso_retail')
     from pg_proc where oid = ${OID};`,
  "t,t,t,t"
);
caso(
  "el cuerpo nuevo ya no arma su propia puerta: no menciona `colaboradores` ni `personas`, y sí la puerta única",
  `select concat_ws(',', prosrc !~ 'colaboradores', prosrc !~ 'personas', prosrc ~ 'retail\\.fn_tiene_acceso_retail\\(\\)') from pg_proc where oid = ${OID};`,
  "t,t,t"
);
caso(
  "RADIO DEL CAMBIO: quien llama a fn_stock_por_sede() es solo `fn_stock_por_sede_json` (si aparece otra, hay que revisar qué ve ahora una terminal); ninguna política ni vista depende de ella",
  `select concat_ws(',',
     (select string_agg(proname, ';' order by proname) from pg_proc where pronamespace = 'retail'::regnamespace and prokind = 'f' and proname <> 'fn_stock_por_sede' and prosrc ~ 'fn_stock_por_sede\\('),
     (select count(*) from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ~ 'fn_stock_por_sede'),
     (select count(*) from pg_views where definition ~ 'fn_stock_por_sede'));`,
  "fn_stock_por_sede_json,0,0"
);

// «Solo cambió la puerta»: sin base de datos. El cuerpo anterior y el nuevo, sin comentarios ni espacios de más, son iguales
// salvo el `exists (…colaboradores…)` ↔ `retail.fn_tiene_acceso_retail()`.
{
  const cuerpo = (sql) => sql.match(/as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
  const plano = (t) => t.split("\n").filter((l) => !l.trim().startsWith("--")).join(" ").replace(/\s+/g, " ").trim();
  const viejo = plano(cuerpo(CUERPO_ANTERIOR));
  const nuevo = plano(cuerpo(MIGRACION.slice(MIGRACION.indexOf("create or replace function retail.fn_stock_por_sede()"))));
  const [antesV, restoV] = viejo.split(" and exists (");
  const [antesN, restoN] = nuevo.split(" and retail.fn_tiene_acceso_retail()");
  registrar(
    "SOLO CAMBIÓ LA PUERTA: el cuerpo nuevo es el de ADR-0270 salvo el `exists (…colaboradores…)` ↔ `retail.fn_tiene_acceso_retail()`",
    `${antesV === antesN && antesV.includes("fn_existencias_base(null, null)")},${restoV?.includes("p.auth_user_id = auth.uid()")},${restoN}`,
    "true,true,;"
  );
}

// ===========================================================================
// 5. EL INVENTARIO DE PUERTAS PROPIAS
// ===========================================================================

/**
 * Las funciones de `retail` que arman su propia puerta «persona + colaborador» (auth_user_id = auth.uid()) y NO conocen la
 * terminal ni usan `fn_tiene_acceso_retail()`. Medido en producción y en la base con todas las migraciones el 2026-10-04
 * (mismos md5). Cada una queda fuera A PROPÓSITO:
 *   · fn_es_lider, fn_es_admin: una terminal no es líder ni admin (ADR-0161/0178).
 *   · fn_colaboradores: solo la lee quien gestiona colaboradores (`fn_puede_gestionar_colaboradores`).
 *   · fn_mi_perfil: el perfil de una PERSONA; la terminal no tiene.
 *   · fn_compras_ubicaciones: la rama de la terminal la trae `fn_ubicacion_actual_persona()` (ADR-0184).
 * Si aparece otra: o usa `fn_tiene_acceso_retail()` (lo normal), o se agrega aquí con su porqué.
 */
const PUERTAS_PROPIAS_A_PROPOSITO = ["fn_colaboradores", "fn_compras_ubicaciones", "fn_es_admin", "fn_es_lider", "fn_mi_perfil"];
caso(
  "INVENTARIO: las únicas funciones de retail con puerta propia «persona + colaborador» que no conocen la terminal son las 5 de la lista (ninguna lectura de la red)",
  `select coalesce(string_agg(proname, ',' order by proname), '') from pg_proc p
    where p.pronamespace = 'retail'::regnamespace and p.prokind = 'f'
      and p.prosrc ~ 'colaboradores' and p.prosrc ~ 'auth_user_id\\s*=\\s*auth\\.uid\\(\\)'
      and p.prosrc !~ 'fn_terminal_actual' and p.prosrc !~ 'fn_tiene_acceso_retail';`,
  PUERTAS_PROPIAS_A_PROPOSITO.join(",")
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}${EN_SECO ? ", en seco" : ""})`);
process.exit(fallas ? 1 : 0);
