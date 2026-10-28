#!/usr/bin/env node
/**
 * Pruebas de `retail.agregar_celular_clienta` contra el Postgres local — CAYLA V2
 * (migración `20261004100000_agregar_celular_clienta.sql`; ADR-0288, «Actualización 2026-10-03 (o)», actividad 2).
 *
 * EL PROBLEMA QUE RESUELVE. El cobro pide el celular para mandarle la boleta por WhatsApp; para guardarlo en la ficha de quien
 * no lo tenía, ni `editar_clienta` (reemplaza TODOS los campos: borraría el cumpleaños) ni `registrar_clienta` (sobrescribe el
 * celular y, si era socia con publicidad, se la quita) sirven. La función nueva SOLO AGREGA. Lo que la base tiene que hacer
 * cumplir, no la pantalla:
 *   · agrega a quien no tenía, normalizado, y deja rastro en la actividad SIN datos personales;
 *   · a quien ya tenía uno (el mismo u otro) no lo toca: responde false, sin subir la versión ni anotar nada;
 *   · una socia con publicidad conserva su celular y su publicidad (no hay `revoca`);
 *   · lo inválido, una ficha archivada o inexistente, y una cuenta sin el módulo «Clientas» se rechazan con su hint estable;
 *   · `anon` no puede ejecutarla;
 *   · dos cajas a la vez se turnan (la segunda espera en `for update`);
 *   · el candado muerde: con la guarda quitada, el ataque PASA (control).
 *
 * QUÉ HACE. Mismo patrón que `clientas.mjs`: cada caso en su transacción con ROLLBACK, con claims reales, sin dejar rastro.
 * La carrera de la sección 8 usa dos conexiones y también termina en ROLLBACK.
 *
 * USO
 *   pnpm pruebas:agregar-celular
 *   pnpm pruebas:agregar-celular --base cayla_x         → otra base del mismo contenedor
 *   CONTENEDOR_DB=supabase_db_otro pnpm pruebas:agregar-celular
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR = process.env.CONTENEDOR_DB ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
function enParalelo(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL);
    let salida = "";
    let err = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (codigo) => resolve(codigo === 0 ? { ok: true, salida: salida.trim() } : { ok: false, mensaje: `${err}${salida}` }));
    p.stdin.end(sql);
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Una transacción como esa persona (claims reales, igual que `supabase/seed.sql`), más lo que se pida. */
const como = (authUserId, resto) => `begin;
set local search_path = retail, public, extensions;
set local request.jwt.claim.sub = '${authUserId}';
set local request.jwt.claim.role = 'authenticated';
${resto}`;

/** `pg_temp.intentar(sql)` → «SIN_ERROR» o «sqlstate|hint»: el caso sigue vivo después de un error (subtransacción). */
const INTENTAR = `create function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(v_hint, '');
end $f$;
`;

/** Una ficha de prueba (en la transacción) y su id en `:id`; `extra` son columnas más: «, telefono_whatsapp» y su valor aparte. */
const ficha = (dni, columnas = "", valores = "") => `insert into retail.clientas (documento_tipo, documento_numero, nombre${columnas})
  values ('dni', '${dni}', 'Prueba Celular ${dni}'${valores}) returning id as id \\gset
select version as v0 from retail.clientas where id = :'id'::uuid \\gset
`;

const AGREGAR = (id, celular) => `select retail.agregar_celular_clienta(${id}::uuid, ${celular === null ? "null" : `'${celular}'`})`;
const FILA = `select telefono_whatsapp, version - :v0, club_desde is null and publicidad_desde is null,
       (select count(*) from retail.actividad a where a.modulo = 'clientas' and a.accion = 'agregar_celular' and a.registro_id = :'id')
  from retail.clientas where id = :'id'::uuid;
`;

let casos = 0;
let fallas = 0;
function reportar(nombre, bien, obtenido) {
  casos++;
  if (!bien) fallas++;
  console.log(`${bien ? "✓" : "✗"} ${nombre}${bien ? "" : `\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`}`);
}
/** Compara la salida entera (filas separadas por «\n») con lo esperado. */
function caso(nombre, sql, esperado) {
  const r = correr(sql);
  const obtenido = r.ok ? r.salida : `ERROR ${r.mensaje}`;
  reportar(nombre, obtenido === esperado, obtenido);
}

// =====================================================================================================================
// 1. Agrega a quien no tenía celular
// =====================================================================================================================
caso(
  "(1) una ficha sin celular lo recibe, normalizado (9 dígitos), con la versión +1 y sin tocar el club ni la publicidad",
  como(FELIPE, `${ficha("90222101")}select retail.agregar_celular_clienta(:'id'::uuid, '987 654 321') as r \\gset
select :'r' || '|' || telefono_whatsapp || '|' || (version - :v0) || '|' || (club_desde is null and publicidad_desde is null) from retail.clientas where id = :'id'::uuid;
rollback;
`),
  "t|987654321|1|true"
);

caso(
  "(1) deja UNA línea en la actividad de Clientas y ni el celular, ni el DNI, ni el nombre están en ella (ADR-0249)",
  como(FELIPE, `${ficha("90222102")}${AGREGAR(":'id'", "987654321")} as r \\gset
select count(*) filter (where a.accion = 'agregar_celular') || '|' ||
       count(*) filter (where (a.descripcion || ' ' || a.detalle::text) ~ '987654321|90222102|Prueba')
  from retail.actividad a where a.registro_id = :'id';
rollback;
`),
  "1|0"
);

caso(
  "(1) el celular se acepta con +51 y espacios, como lo escribe quien cobra",
  como(FELIPE, `${ficha("90222103")}select retail.agregar_celular_clienta(:'id'::uuid, '+51 987 654 321') \\gset
select telefono_whatsapp from retail.clientas where id = :'id'::uuid;
rollback;
`),
  "987654321"
);

// =====================================================================================================================
// 2. Nunca cambia un celular que ya está
// =====================================================================================================================
caso(
  "(2) una ficha que YA tiene celular no se toca con otro: false, el celular sigue siendo el primero, la versión no sube y no hay línea de actividad",
  como(FELIPE, `${ficha("90222104", ", telefono_whatsapp", ", '987111222'")}select retail.agregar_celular_clienta(:'id'::uuid, '987999888') as r \\gset
select :'r' || '|' || telefono_whatsapp || '|' || (version - :v0) || '|' || (select count(*) from retail.actividad a where a.accion = 'agregar_celular' and a.registro_id = :'id')
  from retail.clientas where id = :'id'::uuid;
rollback;
`),
  "f|987111222|0|0"
);

caso(
  "(2) con el MISMO celular también responde false y no anota nada: repetir la llamada no cambia nada (idempotente)",
  como(FELIPE, `${ficha("90222105")}${AGREGAR(":'id'", "987654321")} as r1 \\gset
${AGREGAR(":'id'", "987654321")} as r2 \\gset
select :'r1' || '|' || :'r2' || '|' || (version - :v0) || '|' || (select count(*) from retail.actividad a where a.accion = 'agregar_celular' and a.registro_id = :'id')
  from retail.clientas where id = :'id'::uuid;
rollback;
`),
  "t|f|1|1"
);

caso(
  "(2) una SOCIA con publicidad conserva su celular y su publicidad: false, sin «revoca» en club_permisos (cambiarlo desde caja se la quitaría: ajuste d)",
  como(FELIPE, `insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, club_desde, codigo_club, publicidad_desde)
  values ('dni', '90222106', 'Prueba Socia', '987111333', now(), 'C-9906', now()) returning id as id \\gset
select version as v0 from retail.clientas where id = :'id'::uuid \\gset
select retail.agregar_celular_clienta(:'id'::uuid, '987222444') as r \\gset
select :'r' || '|' || telefono_whatsapp || '|' || (publicidad_desde is not null) || '|' || (version - :v0) ||
       '|' || (select count(*) from retail.club_permisos p where p.clienta_id = :'id'::uuid and p.accion = 'revoca')
  from retail.clientas where id = :'id'::uuid;
rollback;
`),
  "f|987111333|true|0|0"
);

// =====================================================================================================================
// 3. Lo inválido y lo que no se puede, con su hint estable (y la ficha queda como estaba)
// =====================================================================================================================
const RECHAZOS = [
  ["un celular de menos de 9 dígitos", "'12345'", "22023|celular_invalido"],
  ["un celular que no empieza en 9", "'887654321'", "22023|celular_invalido"],
  ["un celular vacío", "''", "22023|celular_invalido"],
  ["un celular nulo", "null", "22023|celular_invalido"],
];
for (const [que, valor, esperado] of RECHAZOS) {
  caso(
    `(3) ${que}: ${esperado}, y la ficha sigue sin celular ni versión nueva`,
    como(FELIPE, `${INTENTAR}${ficha("90222107")}select pg_temp.intentar(format('select retail.agregar_celular_clienta(%L::uuid, %s)', :'id', $v$${valor}$v$)) as e \\gset
select :'e' || '|' || coalesce(telefono_whatsapp, 'sin celular') || '|' || (version - :v0) from retail.clientas where id = :'id'::uuid;
rollback;
`),
    `${esperado}|sin celular|0`
  );
}

caso(
  "(3) una ficha ARCHIVADA no recibe celular (ficha_archivada) y una que no existe tampoco (clienta_no_existe)",
  como(FELIPE, `${INTENTAR}insert into retail.clientas (documento_tipo, documento_numero, nombre, archivada_en, motivo_archivo)
  values ('dni', '90222108', 'Prueba Archivada', now(), 'prueba') returning id as id \\gset
select pg_temp.intentar(format('select retail.agregar_celular_clienta(%L::uuid, %L)', :'id', '987654321')) as a \\gset
select pg_temp.intentar(format('select retail.agregar_celular_clienta(%L::uuid, %L)', gen_random_uuid(), '987654321')) as b \\gset
select :'a' || ' / ' || :'b' || ' / ' || coalesce((select telefono_whatsapp from retail.clientas where id = :'id'::uuid), 'sin celular');
rollback;
`),
  "P0001|ficha_archivada / P0001|clienta_no_existe / sin celular"
);

// =====================================================================================================================
// 4. Quién puede: el módulo «Clientas» (antes que el responsable) y nunca anon
// =====================================================================================================================
caso(
  "(4) una persona a la que se le quitó el módulo «Clientas» recibe 42501 clientas_sin_modulo (y es lo primero que se pregunta: ni el celular ni la ficha se miran)",
  `begin;
set local search_path = retail, public, extensions;
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';
set local request.jwt.claim.sub = '${MICAELA}';
set local request.jwt.claim.role = 'authenticated';
${INTENTAR}select pg_temp.intentar(format('select retail.agregar_celular_clienta(%L::uuid, %L)', gen_random_uuid(), 'no es un celular')) as e \\gset
select :'e';
rollback;
`,
  "42501|clientas_sin_modulo"
);

caso(
  "(4) una integrante CON el módulo (Micaela) sí puede agregar",
  como(MICAELA, `${ficha("90222110")}select retail.agregar_celular_clienta(:'id'::uuid, '987654321') as r \\gset
select :'r';
rollback;
`),
  "t"
);

{
  const r = correr(`begin;
set local role anon;
select retail.agregar_celular_clienta(gen_random_uuid(), '987654321');
rollback;
`);
  reportar("(4) anon no puede ejecutarla: permission denied for function", !r.ok && /permission denied for function agregar_celular_clienta/.test(r.mensaje), r.ok ? r.salida : r.mensaje);
}

// =====================================================================================================================
// 5. Dos cajas a la vez (dos conexiones reales, las dos terminan en ROLLBACK)
// =====================================================================================================================
// La caja A llama sobre una ficha y se queda dormida con la transacción abierta; la caja B espera a verla dormida y llama sobre
// la misma. La función toma la ficha con `for update` ANTES de mirar si ya tenía celular: B tiene que esperar en ESA lectura.
// Sin ese candado, las dos leerían «sin celular» y la última pisaría a la primera.
await (async () => {
  const nombre = "(5) dos cajas a la vez sobre la misma ficha: la segunda ESPERA en la lectura de la ficha (`for update`) antes de decidir si ya tenía celular";
  try {
    const ficha0 = correr(`select id from retail.clientas where archivada_en is null and not anonimizada order by created_at limit 1;`);
    if (!ficha0.ok || !ficha0.salida) return reportar(nombre, false, `no hay ninguna ficha activa en la base: ${ficha0.mensaje ?? ""}`);
    const id = ficha0.salida;
    const app = `agregar_celular_a_${Date.now()}`;
    const a = enParalelo(`set application_name = '${app}';
${como(FELIPE, `select retail.agregar_celular_clienta('${id}'::uuid, '987654321');
select pg_sleep(3);
rollback;
`)}`);
    await dormir(100);
    const b = await enParalelo(`do $espera$ begin
  for i in 1..200 loop
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
    perform pg_sleep(0.05);
  end loop;
end $espera$;
${como(FELIPE, `create function pg_temp.donde_espera(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_contexto text;
begin
  execute p_sql;
  return 'SIN_ESPERA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_contexto = pg_exception_context;
  return v_estado || '|' || case when v_contexto ~* 'for update' then 'en la lectura de la ficha' else 'en otra sentencia' end;
end $f$;
set local lock_timeout = '1s';
select pg_temp.donde_espera($q$select retail.agregar_celular_clienta('${id}'::uuid, '987222444')$q$);
rollback;
`)}`);
    const ra = await a;
    const obtenido = `${ra.ok ? "A ok" : `A falló: ${ra.mensaje}`}\n${b.ok ? b.salida : `B falló: ${b.mensaje}`}`;
    reportar(nombre, obtenido === "A ok\n55P03|en la lectura de la ficha", obtenido);
  } catch (e) {
    reportar(nombre, false, `ERROR_DE_SCRIPT ${e.message}`);
  }
})();

// =====================================================================================================================
// 6. Estructura: lo que no se ve en un caso suelto
// =====================================================================================================================
{
  const r = correr(`select p.prosecdef || '|' ||
       (strpos(p.prosrc, 'fn_exigir_modulo(''clientas'')') between 1 and strpos(p.prosrc, 'fn_actor_persona_id') - 1
        and strpos(p.prosrc, 'for update') > strpos(p.prosrc, 'fn_actor_persona_id')) || '|' ||
       has_function_privilege('authenticated', p.oid, 'execute') || '|' || has_function_privilege('anon', p.oid, 'execute') || '|' ||
       p.prorettype::regtype
  from pg_proc p where p.oid = 'retail.agregar_celular_clienta(uuid,text)'::regprocedure;`);
  reportar(
    "(6) es security definer, el candado del módulo «Clientas» corre ANTES de resolver al responsable (y el `for update` después), `authenticated` la ejecuta, `anon` no, y devuelve boolean",
    r.ok && r.salida === "true|true|true|false|boolean",
    r.ok ? r.salida : r.mensaje
  );
}
{
  const migracion = readFileSync(join(RAIZ, "supabase", "migrations", "20261004100000_agregar_celular_clienta.sql"), "utf8");
  const escrita = /→ t \| t \| f \| ([0-9a-f]{32})/.exec(migracion)?.[1] ?? "NO_ESCRITA";
  const viva = correr(`select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))
  from pg_proc p where p.oid = 'retail.agregar_celular_clienta(uuid,text)'::regprocedure;`);
  reportar(
    "(6) la huella escrita en la VERIFICACIÓN de la migración es la de la función viva (lo que se compara en producción después de pegar)",
    viva.ok && viva.salida === escrita,
    viva.ok ? `escrita ${escrita} · viva ${viva.salida}` : viva.mensaje
  );
}

// =====================================================================================================================
// 7. CONTROL: sin la guarda, el ataque PASA (el caso (2) muerde)
// =====================================================================================================================
// Se reescribe la función viva —en la transacción— sin su `return false` (la guarda de «ya tenía celular»): el celular de una
// ficha que ya tenía uno SE PISA. Si esta prueba no lo viera, el caso (2) no detectaría la regresión.
caso(
  "(7) CONTROL: con la guarda quitada, un celular ya guardado SE PISA (el caso (2) muerde: aquí cambiaría)",
  como(FELIPE, `do $m$ declare v_def text; begin
  select replace(pg_get_functiondef('retail.agregar_celular_clienta(uuid,text)'::regprocedure), 'return false;', 'null;') into v_def;
  execute v_def;
end $m$;
${ficha("90222111", ", telefono_whatsapp", ", '987111222'")}select retail.agregar_celular_clienta(:'id'::uuid, '987999888') \\gset
select telefono_whatsapp from retail.clientas where id = :'id'::uuid;
rollback;
`),
  "987999888"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}, contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
