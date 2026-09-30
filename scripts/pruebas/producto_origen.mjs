#!/usr/bin/env node
/**
 * Prueba de ADR-0292 «dónde se registró cada producto» — `producto_origen`, `fn_ubicacion_de_la_operacion`,
 * `trg_producto_anota_origen` y `fn_producto_origen` (`supabase/migrations/20260930170000_producto_anota_donde_se_registro.sql`).
 *
 * QUÉ CUBRE
 *   · una persona que opera en una sede (encabezado `x-ubicacion`) deja esa sede como origen, con quien propuso el producto;
 *   · sin encabezado, o con la sede de otro donde no puede operar, vale su sede de partida;
 *   · una terminal anota la tienda a la que está fija, y cuál terminal fue;
 *   · sin sesión (SQL Editor, scripts) el producto queda con origen pero SIN sede: se sabe QUE se registró, no DÓNDE;
 *   · si anotar falla, el producto se crea igual (principio 9);
 *   · la tabla no se lee ni se escribe desde la web; `fn_producto_origen` sí, y solo devuelve los productos que tienen origen;
 *   · borrar el producto (prueba) se lleva su origen; la migración se puede pegar dos veces.
 *
 * CÓMO. Mismo patrón que `actividad.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea nada en el
 * Postgres local compartido), sesión simulada con `request.jwt.claim(s)` y el encabezado de PostgREST con `request.headers`.
 *
 * USO
 *   pnpm pruebas:producto-origen    → con la migración ya aplicada en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = "20260930170000_producto_anota_donde_se_registro.sql";
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed): parte en Tienda Lima
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_CAJA = "33333333-3333-4333-8333-0000000000f1"; // cuenta de una terminal de Trujillo
const ROSA = "33333333-3333-4333-8333-0000000000f2"; // integrante de Trujillo que marcó entrada: la responsable

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${PRELUDIO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const ultima = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) : null);

const PRELUDIO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select c.id as cat from retail.categorias c where c.activo order by c.nombre limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
`;

/** Sesión simulada (como `postgres`); `header` = texto JSON del encabezado, o null. */
const sesion = (auth, header = "{}") => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '${header}', true) as _h \\gset
`;
const SIN_SESION = `reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
select set_config('request.headers', '{}', true) as _h \\gset
`;
/** Da de alta un producto mínimo con el id dado y `propuesto_por` (variable psql o null). */
const ALTA = (idVar, propuestoPor) => `insert into retail.productos (id, categoria_id, referencia, marca_id, proveedor_id, es_prueba, propuesto_por)
  values (:'${idVar}', :'cat', 'prueba-origen-' || :'${idVar}', :'marca', :'prov', false, ${propuestoPor ? `:'${propuestoPor}'` : "null"});
`;
const IDS = `select gen_random_uuid() as p1 \\gset
select gen_random_uuid() as p2 \\gset
select gen_random_uuid() as p3 \\gset
`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1200)}`);
  }
}

// 1. Forma: la tabla tiene RLS encendido y NINGUNA política; hay un solo disparador y la migración no crea políticas.
{
  const r = correr(`select (select relrowsecurity from pg_class where oid = 'retail.producto_origen'::regclass)
  || '|' || (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'producto_origen')
  || '|' || (select count(*) from pg_trigger where tgrelid = 'retail.productos'::regclass and tgname = 'trg_producto_anota_origen' and not tgisinternal)
  || '|' || (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_producto_origen');`);
  const [rls, politicas, disparadores, funciones] = (ultima(r) ?? "").split("|");
  esperar("la tabla tiene RLS y ninguna política; un disparador en productos y una sola función de lectura", r.ok && rls === "true" && politicas === "0" && disparadores === "1" && funciones === "1", r);
  const sql = readFileSync(join(RAIZ, "supabase", "migrations", MIGRACION), "utf8");
  esperar("la migración no crea políticas ni borra disparadores (se pega sola en el SQL Editor)", !/create\s+policy/i.test(sql) && !/drop\s+(policy|trigger)/i.test(sql), "");
}

// 2. Un líder que opera en OTRA sede que la suya: vale la del encabezado, y queda quien propuso el producto.
{
  const r = correr(`${IDS}${sesion(FELIPE, '{"x-ubicacion":"' + "' || :'tru' || '" + '"}')}${ALTA("p1", "felipe")}
select (o.ubicacion_id = :'tru') || '|' || (o.persona_id = :'felipe') || '|' || (o.terminal_id is null)
  from retail.producto_origen o where o.producto_id = :'p1';`);
  esperar("con x-ubicacion, el origen es esa sede (no la de partida de quien opera) y queda quien lo propuso", r.ok && ultima(r) === "true|true|true", r);
}

// 3. Sin encabezado: la sede de partida de la persona.
{
  const r = correr(`${IDS}${sesion(MICAELA)}${ALTA("p1", "micaela")}
select (o.ubicacion_id = :'tru') || '|' || (o.persona_id = :'micaela') from retail.producto_origen o where o.producto_id = :'p1';`);
  esperar("sin encabezado, el origen es la sede de partida de la persona", r.ok && ultima(r) === "true|true", r);
}

// 4. Una sede donde la persona NO puede operar no se acepta: cae a su sede de partida.
{
  const r = correr(`${IDS}${sesion(MICAELA, '{"x-ubicacion":"' + "' || :'lima' || '" + '"}')}${ALTA("p1", "micaela")}
select (o.ubicacion_id = :'tru')::text from retail.producto_origen o where o.producto_id = :'p1';`);
  esperar("un encabezado con una sede donde no puede operar no cuela: vale su sede de partida", r.ok && ultima(r) === "true", r);
}

// 5. Un encabezado que no es un uuid no rompe el alta.
{
  const r = correr(`${IDS}${sesion(MICAELA, '{"x-ubicacion":"no-es-un-uuid"}')}${ALTA("p1", "micaela")}
select (o.ubicacion_id = :'tru')::text from retail.producto_origen o where o.producto_id = :'p1';`);
  esperar("un x-ubicacion mal escrito no rompe el alta: vale la sede de partida", r.ok && ultima(r) === "true", r);
}

// 6. Terminal: anota la tienda a la que está fija y cuál terminal fue.
{
  const r = correr(`${IDS}
insert into auth.users (id, aud, role, email) values ('${T_CAJA}', 'authenticated', 'authenticated', 'terminal-origen@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal prueba origen', 'administrativa', '${T_CAJA}') returning id as term \\gset
-- La responsable: una integrante de Trujillo que marcó entrada (una terminal siempre firma una persona presente).
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values ('${ROSA}', 'Rosa', 'Prueba Origen', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
${sesion(T_CAJA, '{"x-ubicacion":"' + "' || :'lima' || '" + '","x-responsable":"' + ROSA + '"}')}${ALTA("p1", null)}
select (o.ubicacion_id = :'tru') || '|' || (o.terminal_id = :'term') || '|' || (o.persona_id = '${ROSA}') from retail.producto_origen o where o.producto_id = :'p1';`);
  esperar("una terminal anota su tienda (aunque mande otra en x-ubicacion) y cuál terminal fue", r.ok && ultima(r) === "true|true|true", r);
}

// 7. Sin sesión: queda el origen, sin sede. Jamás se inventa.
{
  const r = correr(`${IDS}${SIN_SESION}${ALTA("p1", null)}
select count(*) || '|' || coalesce(max(o.ubicacion_id::text), 'sin sede') from retail.producto_origen o where o.producto_id = :'p1';`);
  esperar("sin sesión queda la fila con sede vacía: se sabe que se registró, no dónde", r.ok && ultima(r) === "1|sin sede", r);
}

// 8. Si anotar falla, el producto se crea igual (principio 9).
{
  const r = correr(`${IDS}
alter table retail.producto_origen add constraint prueba_origen_siempre_falla check (false) not valid;
${sesion(MICAELA)}${ALTA("p1", "micaela")}
select (select count(*) from retail.productos where id = :'p1') || '|' || (select count(*) from retail.producto_origen where producto_id = :'p1');`);
  esperar("si anotar el origen falla, el producto se crea igual (sin origen)", r.ok && ultima(r) === "1|0", r);
}

// 9. La web (authenticated) no toca la tabla, pero lee con la función; solo devuelve los que tienen origen.
{
  const r = correr(`${IDS}${sesion(MICAELA)}${ALTA("p1", "micaela")}
reset role;
select id as p_viejo from retail.productos where id not in (select producto_id from retail.producto_origen) limit 1 \\gset
${sesion(MICAELA)}set local role authenticated;
select pg_temp.intento($$select count(*) from retail.producto_origen$$) || '|' ||
       pg_temp.intento($$insert into retail.producto_origen (producto_id) values (gen_random_uuid())$$) || '|' ||
       (select count(*) from retail.fn_producto_origen(array[:'p1'::uuid, :'p2'::uuid])) || '|' ||
       (select coalesce(max(ubicacion_nombre), '') from retail.fn_producto_origen(array[:'p1'::uuid])) || '|' ||
       (select count(*) from retail.fn_producto_origen(array[:'p_viejo'::uuid]));`);
  const [lee, escribe, cuantos, nombre, viejo] = (ultima(r) ?? "").split("|");
  esperar("authenticated no lee ni escribe la tabla", r.ok && /permission denied/.test(lee) && /permission denied/.test(escribe), r);
  esperar("fn_producto_origen devuelve solo los que tienen origen, con el nombre de la sede", r.ok && cuantos === "1" && nombre === "Tienda Trujillo" && viejo === "0", r);
}

// 10. anon no llama a la función de lectura.
{
  const r = correr(`${IDS}${SIN_SESION}set local role anon;
select pg_temp.intento($$select * from retail.fn_producto_origen(array[gen_random_uuid()])$$);`);
  esperar("anon no puede llamar a fn_producto_origen", r.ok && /permission denied/.test(ultima(r) ?? ""), r);
}

// 11. Borrar el producto (solo una prueba lo hace) se lleva su origen; y nadie puede llamar al disparador.
{
  const r = correr(`${IDS}${sesion(MICAELA)}${ALTA("p1", "micaela")}
reset role;
delete from retail.productos where id = :'p1';
select (select count(*) from retail.producto_origen where producto_id = :'p1')
  || '|' || has_function_privilege('authenticated', 'retail.fn_producto_anota_origen()', 'execute');`);
  esperar("el origen se va con el producto, y la web no puede llamar al disparador", r.ok && ultima(r) === "0|false", r);
}

// 12. La migración se puede pegar dos veces (idempotente) y deja una sola función y un solo disparador.
{
  const sql = readFileSync(join(RAIZ, "supabase", "migrations", MIGRACION), "utf8");
  const r = correr(`${sql}\n${sql}\nselect (select count(*) from pg_trigger where tgrelid = 'retail.productos'::regclass and tgname = 'trg_producto_anota_origen') || '|' ||
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_producto_origen', 'fn_ubicacion_de_la_operacion', 'fn_producto_anota_origen'));`);
  esperar("la migración se pega dos veces sin error y no duplica nada", r.ok && ultima(r) === "1|3", r);
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
