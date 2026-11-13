#!/usr/bin/env node
/**
 * «Quién eres» en un solo viaje, con las mismas respuestas (ADR-0657; migraciones 20261113195000 y 20261113200000).
 *
 * QUÉ PRUEBA
 *   · `fn_mi_sesion()` devuelve, para cada cuenta, EXACTAMENTE lo que devuelven hoy las seis preguntas del marco
 *     (`fn_persona_actual_resumen`, `fn_mi_terminal`, `fn_mis_modulos`, `fn_mi_persona_id`, `fn_es_admin`,
 *     `fn_mi_pantalla_principal`), que siguen existiendo y son el oráculo: si alguien cambia una de ellas y no la sesión, esto
 *     sale en rojo.
 *   · `fn_mis_modulos()` (reescrita con la identidad en un CTE) da los mismos módulos que la regla de antes, escrita aquí como
 *     consulta con sus tres preguntas por fila (el cuerpo de 20260929140000).
 *   · Permisos: `fn_mi_sesion` es puerta (security definer, la llama `authenticated`, no `anon`); `fn_modulos_de` es regla (nadie
 *     de afuera la ejecuta).
 *
 * LAS CUENTAS. Las cuentas de prueba del tema de la web (`tema/cuentas.mjs`: admin, integrante, terminal de ventas, terminal administrativa, rol
 * personalizado) y las raras que la web también tiene que leer bien: un líder que no es Admin, un líder sin sede asignada, una
 * terminal desactivada, una terminal en una sede cerrada, una cuenta sin fila, sin sesión, una persona cesada en Dynamic, un
 * colaborador pendiente de aprobación, un rol archivado, un rol «limitado como hoy» y una cuenta que es persona y terminal a la vez.
 *
 * CÓMO. Mismo patrón que `roles_por_modulo.mjs`: todo en UNA transacción con ROLLBACK (las cuentas se crean dentro y
 * desaparecen); la sesión se simula con `set local request.jwt.claims` y `set local role authenticated`.
 *
 * USO
 *   pnpm pruebas:mi-sesion                 → contra la base `postgres` del stack local
 *   pnpm pruebas:mi-sesion --base cayla_x  → contra otra base del mismo contenedor
 *   … --huellas                            → solo el md5 de las seis respuestas por cuenta (corre antes y después de migrar)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const HUELLAS = process.argv.includes("--huellas");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// Seed local: Felipe y Sandra (Admin y Líder), Micaela (integrante de Trujillo). Las demás cuentas se crean dentro.
const SEED = {
  felipe: "22222222-2222-4222-8222-000000000001",
  micaela: "22222222-2222-4222-8222-000000000003",
  sandra: "22222222-2222-4222-8222-000000000005",
};
const id = (n) => `44444444-4444-4444-8444-0000000000${n}`;
const NUEVAS = {
  terminalVentas: id("01"),
  terminalAdmin: id("02"),
  terminalApagada: id("03"),
  terminalSedeCerrada: id("04"),
  rolPropio: id("05"),
  liderSinAdmin: id("06"),
  liderSinSede: id("07"),
  sinFila: id("08"),
  cesada: id("09"),
  pendiente: id("10"),
  rolArchivado: id("11"),
  rolLimitado: id("12"),
  personaYTerminal: id("13"),
};

const authUser = (uid, correo) =>
  `insert into auth.users (id, aud, role, email) values ('${uid}', 'authenticated', 'authenticated', '${correo}');`;
// Una persona de Dynamic con su colaborador de retail. `rolDynamic` es `public.personas.rol` (decide el Admin); `rolRetail` el nivel.
// `sinSede`: un líder sin sede asignada cuya sede de Dynamic no tiene tienda en retail (el resumen cae a la primera tienda).
const persona = (uid, { nombre, rolDynamic = "integrante", estado = "activo", rolRetail = "colaborador", estadoRetail = "activo", rolId = null, sinSede = false }) => `
${authUser(uid, `${nombre.toLowerCase().replace(/\W+/g, "-")}@prueba-mi-sesion.local`)}
insert into public.personas (id, auth_user_id, nombres, apellidos, rol, estado, sede_base_id)
  values ('${uid}', '${uid}', '${nombre}', 'Prueba', '${rolDynamic}', '${estado}',
          ${sinSede ? "(select sede_sin_tienda from ids)" : "(select u.sede_dynamic_id from retail.ubicaciones u where u.id = (select tru from ids))"});
insert into retail.colaboradores (persona_id, rol, estado, ubicacion_asignada_id, rol_id)
  values ('${uid}', '${rolRetail}', '${estadoRetail}', ${sinSede ? "null" : "(select tru from ids)"},
          coalesce(${rolId ?? "null"}, ${rolRetail === "lider" ? "(select r_lider from ids)" : "(select r_integ from ids)"}));`;
const terminal = (uid, nombre, rol, { activo = true, sede = "tru" } = {}) => `
${authUser(uid, `${nombre.toLowerCase().replace(/\W+/g, "-")}@prueba-mi-sesion.local`)}
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id, activo) select ${sede}, '${nombre}', ${rol}, '${uid}', ${activo} from ids;`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
create temp table ids as
  select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru,
         retail.fn_rol_por_clave('lider') as r_lider,
         retail.fn_rol_por_clave('integrante') as r_integ,
         retail.fn_rol_por_clave('terminal_ventas') as r_tv,
         retail.fn_rol_por_clave('terminal_administrativa') as r_ta;
-- Una sede cerrada (para la terminal que vive en ella) y tres roles propios: uno de 5 módulos, uno archivado y uno limitado.
-- Una terminal solo nace en una tienda activa: la sede se cierra después de crearla (más abajo).
insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede cerrada (prueba mi_sesion)', 'tienda', true);
insert into public.sedes (codigo, nombre) values ('ZZM', 'Sede sin tienda (prueba mi_sesion)');
alter table ids add column cerrada uuid, add column sede_sin_tienda uuid;
update ids set cerrada = (select id from retail.ubicaciones where nombre = 'Sede cerrada (prueba mi_sesion)'),
               sede_sin_tienda = (select id from public.sedes where codigo = 'ZZM');
insert into retail.roles (id, nombre, descripcion) values
  ('${id("21")}', 'Prueba mi_sesion: ventas y stock', 'Rol propio de 5 módulos'),
  ('${id("22")}', 'Prueba mi_sesion: archivado', 'Rol archivado'),
  ('${id("23")}', 'Prueba mi_sesion: limitado', 'Rol limitado como hoy');
insert into retail.rol_modulos (rol_id, modulo)
  select r, m from unnest(array['${id("21")}', '${id("22")}', '${id("23")}']::uuid[]) r,
                   unnest(array['inicio', 'vender', 'caja', 'existencias', 'productos']) m
   where exists (select 1 from retail.modulos where clave = m);
update retail.roles set archivado_at = now() where id = '${id("22")}';
update retail.roles set limitado_como_hoy = true where id = '${id("23")}';
-- Lo que se le quitó al Líder de equipo: CAYLA Global, que es del Admin (20260929140000). Se deja explícito.
insert into retail.lider_modulos_ocultos (modulo) select 'cayla_global' where exists (select 1 from retail.modulos where clave = 'cayla_global')
  on conflict do nothing;
update public.personas set rol = 'admin' where auth_user_id in ('${SEED.felipe}', '${SEED.sandra}');
update public.personas set rol = 'integrante' where auth_user_id = '${SEED.micaela}';
${terminal(NUEVAS.terminalVentas, "Terminal Ventas TRU", "r_tv")}
${terminal(NUEVAS.terminalAdmin, "Terminal Administrativa TRU", "r_ta")}
${terminal(NUEVAS.terminalApagada, "Terminal apagada TRU", "r_tv", { activo: false })}
${terminal(NUEVAS.terminalSedeCerrada, "Terminal de sede cerrada", "r_tv", { sede: "cerrada" })}
update retail.ubicaciones set activo = false where id = (select cerrada from ids);
${persona(NUEVAS.rolPropio, { nombre: "Lucía", rolId: `'${id("21")}'::uuid` })}
${persona(NUEVAS.liderSinAdmin, { nombre: "Líder sin admin", rolRetail: "lider" })}
${persona(NUEVAS.liderSinSede, { nombre: "Líder sin sede", rolRetail: "lider", rolDynamic: "admin", sinSede: true })}
${authUser(NUEVAS.sinFila, "sin-fila@prueba-mi-sesion.local")}
${persona(NUEVAS.cesada, { nombre: "Cesada", estado: "cesado" })}
${persona(NUEVAS.pendiente, { nombre: "Pendiente", estadoRetail: "pendiente_aprobacion" })}
${persona(NUEVAS.rolArchivado, { nombre: "Archivado", rolId: `'${id("22")}'::uuid` })}
${persona(NUEVAS.rolLimitado, { nombre: "Limitado", rolId: `'${id("23")}'::uuid` })}
${persona(NUEVAS.personaYTerminal, { nombre: "Persona y terminal" })}
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) select tru, 'Terminal de una persona', r_tv, '${NUEVAS.personaYTerminal}' from ids;
-- Una pantalla principal en el rol propio, para que esa respuesta no sea siempre vacía.
update retail.roles set pantalla_principal = 'vender' where id = '${id("21")}';
`;

const CUENTAS = [
  ["admin (Felipe)", SEED.felipe],
  ["admin (Sandra)", SEED.sandra],
  ["integrante (Micaela)", SEED.micaela],
  ["terminal de ventas", NUEVAS.terminalVentas],
  ["terminal administrativa", NUEVAS.terminalAdmin],
  ["rol personalizado (Lucía)", NUEVAS.rolPropio],
  ["líder que no es Admin", NUEVAS.liderSinAdmin],
  ["líder sin sede asignada", NUEVAS.liderSinSede],
  ["terminal desactivada", NUEVAS.terminalApagada],
  ["terminal de una sede cerrada", NUEVAS.terminalSedeCerrada],
  ["cuenta sin fila", NUEVAS.sinFila],
  ["persona cesada en Dynamic", NUEVAS.cesada],
  ["colaborador pendiente de aprobación", NUEVAS.pendiente],
  ["rol archivado", NUEVAS.rolArchivado],
  ["rol limitado como hoy", NUEVAS.rolLimitado],
  ["persona y terminal a la vez", NUEVAS.personaYTerminal],
  ["sin sesión", null],
];

const sesionDe = (uid) =>
  uid
    ? `set local request.jwt.claim.sub = '${uid}';\nset local request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';\n`
    : `set local request.jwt.claim.sub = '';\nset local request.jwt.claims = '';\n`;

// Los módulos en un orden fijo: la web no depende del orden (leerModulos lo conserva, nadie lo usa), y así la comparación no
// depende del plan que elija Postgres.
const MODULOS_ORDENADOS = (expr) =>
  `coalesce((select jsonb_agg(x order by x->>'clave', x->>'completo') from jsonb_array_elements(${expr}) x), '[]'::jsonb)`;
const LAS_SEIS = `jsonb_build_object(
    'resumen', coalesce((select jsonb_agg(to_jsonb(r)) from retail.fn_persona_actual_resumen() r), '[]'::jsonb),
    'terminal', to_jsonb(retail.fn_mi_terminal()),
    'modulos', coalesce((select jsonb_agg(jsonb_build_object('clave', m.clave, 'completo', m.completo) order by m.clave, m.completo) from retail.fn_mis_modulos() m), '[]'::jsonb),
    'persona_id', to_jsonb(retail.fn_mi_persona_id()),
    'es_admin', to_jsonb(retail.fn_es_admin()),
    'pantalla_principal', to_jsonb(retail.fn_mi_pantalla_principal()))`;
const LA_SESION = `(select s || jsonb_build_object('modulos', ${MODULOS_ORDENADOS("s->'modulos'")}) from retail.fn_mi_sesion() s)`;
// La regla de antes (cuerpo de fn_mis_modulos en 20260929140000), con sus tres preguntas dentro de la consulta: el oráculo.
const REGLA_DE_ANTES = `
  select m.clave, true as completo from retail.modulos m
   where retail.fn_es_lider()
     and (not exists (select 1 from retail.lider_modulos_ocultos o where o.modulo = m.clave) or (m.del_admin and retail.fn_es_admin()))
  union all
  select m.clave, not r.limitado_como_hoy
    from retail.rol_modulos rm
    join retail.roles r on r.id = rm.rol_id and r.archivado_at is null and not r.fijo
    join retail.modulos m on m.clave = rm.modulo and m.delegable and not m.solo_lider
   where not retail.fn_es_lider() and rm.rol_id = retail.fn_mi_rol_id()`;
const ORDENADOS = (from) => `(select coalesce(string_agg(q.clave || ':' || q.completo, ',' order by q.clave, q.completo), '') from (${from}) q)`;

let fallas = 0;
let casos = 0;
const bien = (nombre) => {
  casos++;
  console.log(`✓ ${nombre}`);
};
const mal = (nombre, detalle) => {
  casos++;
  fallas++;
  console.log(`✗ ${nombre}\n    ${detalle}`);
};

// `--huellas`: el md5 de las seis respuestas de cada cuenta, sin mirar fn_mi_sesion. Corre igual ANTES de las migraciones de
// ADR-0657 y después: si las huellas no cambian, reescribir fn_mis_modulos no le cambió nada a nadie.
if (HUELLAS) {
  const sql = CUENTAS.map(([, uid]) => `${sesionDe(uid)}set local role authenticated;\nselect md5((${LAS_SEIS})::text);\nreset role;`).join("\n");
  const md5s = psql(`${PRELUDIO}\n${sql}\nrollback;`).trim().split("\n");
  CUENTAS.forEach(([nombre], k) => console.log(`${md5s[k]}  ${nombre}`));
  process.exit(0);
}

// Una sola transacción para todas las cuentas: por cada una, cuatro líneas.
const porCuenta = CUENTAS.map(
  ([, uid]) => `${sesionDe(uid)}set local role authenticated;
select ${LAS_SEIS};
select ${LA_SESION};
select ${ORDENADOS("select clave, completo from retail.fn_mis_modulos()")};
reset role;
select ${ORDENADOS(REGLA_DE_ANTES)};`
).join("\n");

let salida;
try {
  salida = psql(`${PRELUDIO}\n${porCuenta}\nrollback;`).trim().split("\n");
} catch (e) {
  console.log(`✗ no se pudo correr la prueba\n    ${(e.stderr ?? e.message).split("\n").find((l) => l.includes("ERROR")) ?? e.message}`);
  process.exit(1);
}

CUENTAS.forEach(([nombre], k) => {
  const [seis, sesion, modulos, oraculo] = salida.slice(k * 4, k * 4 + 4);
  if (seis === sesion) bien(`${nombre}: fn_mi_sesion = las seis preguntas de hoy`);
  else mal(`${nombre}: fn_mi_sesion = las seis preguntas de hoy`, `las seis: ${seis}\n    sesión:   ${sesion}`);
  if (modulos === oraculo) bien(`${nombre}: fn_mis_modulos = la regla de antes (${modulos ? modulos.split(",").length : 0} módulos)`);
  else mal(`${nombre}: fn_mis_modulos = la regla de antes`, `ahora: ${modulos}\n    antes: ${oraculo}`);
});

// Que la prueba muerda: las cuentas no pueden dar todas lo mismo (si fn_mi_sesion devolviera siempre vacío y las seis también por
// un error del preludio, todo saldría «igual»).
{
  const distintas = new Set(CUENTAS.map((_, k) => salida[k * 4])).size;
  if (distintas >= 10) bien(`las cuentas dan respuestas distintas entre sí (${distintas} distintas de ${CUENTAS.length}): la comparación muerde`);
  else mal("las cuentas dan respuestas distintas entre sí", `solo ${distintas} respuestas distintas de ${CUENTAS.length}: ¿el preludio creó las cuentas?`);
}

// Permisos: la sesión es puerta; la regla no la ejecuta nadie de afuera.
{
  const r = psql(`
select p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ';'), '-') || '|'
       || has_function_privilege('authenticated', p.oid, 'execute')::text || '|' || has_function_privilege('anon', p.oid, 'execute')::text
  from pg_proc p where p.oid = 'retail.fn_mi_sesion()'::regprocedure;
select has_function_privilege('authenticated', p.oid, 'execute')::text || '|' || has_function_privilege('anon', p.oid, 'execute')::text
  from pg_proc p where p.oid = 'retail.fn_modulos_de(boolean,boolean,uuid)'::regprocedure;`)
    .trim()
    .split("\n");
  if (r[0] === "true|search_path=retail, public, extensions|true|false") bien("fn_mi_sesion es puerta: security definer con su search_path, la llama authenticated y no anon");
  else mal("fn_mi_sesion es puerta", `obtenido: ${r[0]}`);
  if (r[1] === "false|false") bien("fn_modulos_de no la ejecuta nadie de afuera (ni authenticated ni anon)");
  else mal("fn_modulos_de no la ejecuta nadie de afuera", `obtenido: ${r[1]}`);
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
