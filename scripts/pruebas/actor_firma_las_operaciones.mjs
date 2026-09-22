#!/usr/bin/env node
/**
 * Pruebas de la fase F3 del ADR-0162 (migración `20260923020000_actor_firma_las_operaciones.sql`) — CAYLA V2.
 *
 * QUÉ PRUEBA.
 *   (a) Estructura: ninguna función de `retail` conserva `select id into … from personas where auth_user_id = auth.uid();`
 *       salvo las de permiso/identidad listadas; el conjunto COMPLETO de funciones que miran `auth_user_id = auth.uid()`
 *       es exactamente el esperado (una nueva obliga a clasificarla); cuántas firman con el actor de tienda y cuántas no;
 *       la migración se puede pegar dos veces y ABORTA ante una función con el patrón que no está clasificada.
 *   (b) Comportamiento sobre las más importantes — venta, caja (abrir, mover, cerrar), ajuste de stock, traslado (iniciar,
 *       recibir, confirmar), Catálogo por la API y Compras:
 *         · terminal + responsable presente → firma el responsable (`usuario_id`/`*_por`) y queda `terminal_id`;
 *         · terminal sin responsable → 42501 (`responsable_requerido`), nada se escribe;
 *         · persona sin encabezado → firma ella (interruptor `fn_exige_responsable()` apagado), `terminal_id` vacío;
 *         · Compras (`false`): la persona firma a su nombre aunque llegue `x-responsable`.
 *   (c) Las dos A MANO: el permiso sigue en la CUENTA — el tope de descuento de venta de una terminal es 0 (aunque
 *       la responsable sea líder) y una terminal no libera apartados; la persona conserva su comportamiento de hoy.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (la base local la comparten ~20 sesiones). Las terminales (con su
 * `auth.users`, SIN persona), Rosa (integrante de Trujillo, la responsable) y la asistencia de Dynamic
 * (`public.marcajes`, que la base local no tiene) se crean DENTRO del caso. El encabezado HTTP se simula con
 * `request.headers`, que es lo que PostgREST hace con cada petición.
 *
 * USO
 *   pnpm pruebas:actor-firma                  → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:actor-firma --base cayla_f3  → contra otra base del mismo contenedor
 *   … --en-seco                                → carga la migración F3 dentro de cada caso (la F2 ya aplicada)
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260923020000_actor_firma_las_operaciones.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora de Trujillo (seed), tope de descuento 10 %
const T_VENTAS = "33333333-3333-4333-8333-0000000000a1"; // cuenta de la terminal de ventas de Trujillo
const T_ADMIN = "33333333-3333-4333-8333-0000000000a2"; // cuenta de la terminal administrativa de Trujillo
const ROSA = "33333333-3333-4333-8333-0000000000b1"; // integrante de Trujillo, sin cuenta: la responsable

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

const PRELUDIO = `
begin;
${EN_SECO ? MIGRACION : ""}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(nullif(v_hint, ''), v_msg);
end;
$f$;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS}', 'authenticated', 'authenticated', 'terminal-ventas-tru@prueba.local'),
  ('${T_ADMIN}', 'authenticated', 'authenticated', 'terminal-admin-tru@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id) values (:'tru', 'Terminal Ventas TRU', 'ventas', '${T_VENTAS}') returning id as t_ventas \\gset
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id) values (:'tru', 'Terminal Administrativa TRU', 'administrativa', '${T_ADMIN}') returning id as t_admin \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values ('${ROSA}', 'Rosa', 'Prueba', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru');
-- Rosa y Felipe marcaron entrada en Trujillo hace un segundo (fecha de la jornada explícita: sin carrera de medianoche).
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada) values
  ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date),
  (:'felipe', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
-- Inventario: piso y almacén en las dos tiendas, y stock de sobra de BLU-EMMA-NEG-M.
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'almacen_tienda');
select id as v1, precio as v1_precio, producto_id as prod from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'tru', 'venta') as sub_tru \\gset
select retail.fn_sububicacion_por_defecto(:'lim', 'venta') as sub_lim \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'tru', :'sub_tru', 'entrada', 1000, 'colchón de prueba') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'lim', :'sub_lim', 'entrada', 1000, 'colchón de prueba') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m2') as _a2 \\gset
-- El traslado sale de otra sububicación (almacén): colchón también ahí.
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'tru', retail.fn_sububicacion_por_defecto(:'tru', 'traslado_salida'), 'entrada', 1000, 'colchón de prueba') returning id as m3 \\gset
select retail.fn_aplicar_movimiento(:'m3') as _a3 \\gset
`;

/** Cambia de sesión. `resp`: variable psql con el uuid del responsable (o null = sin encabezado). */
const sesion = (auth, { resp = null, ubicacion = null } = {}) => {
  const campos = [resp ? `'x-responsable', :'${resp}'` : null, ubicacion ? `'x-ubicacion', :'${ubicacion}'` : null].filter(Boolean).join(", ");
  return `set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', json_build_object(${campos})::text, true) as _h \\gset
`;
};
// psql no deja `:'rosa'` sin definirla: la dejamos como variable.
const ROSA_VAR = `\\set rosa '${ROSA}'\n`;
const COMO_API = `set local role authenticated;\n`;

/** Caja abierta en Trujillo, abierta por Felipe sin encabezado (cierra la que hubiera). */
const CAJA_TRU = `${sesion(FELIPE)}select count(*) as _c from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x \\gset
select retail.abrir_caja(:'tru', 100.00) as caja \\gset
`;
const venta = (extra = "") => `select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric)),
  null, gen_random_uuid()${extra})`;
const firmaVenta = `select concat_ws(',', v.usuario_id = :'rosa', v.usuario_id = :'micaela', coalesce(v.terminal_id = :'t_ventas', false), v.terminal_id is null,
  (select bool_and(m.usuario_id = v.usuario_id) from retail.venta_items vi join retail.movimientos m on m.venta_item_id = vi.id where vi.venta_id = v.id))
  from retail.ventas v where v.id = :'venta';`;

let fallas = 0;
let casos = 0;
function caso(nombre, cuerpo, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${ROSA_VAR}${cuerpo}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").filter((l) => l.includes("ERROR")).join(" / ") || r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
const rechazo = (hint) => (s) => s.startsWith(`42501|${hint}`);

/* ------------------------------------------------------------------ */
/* (a) Estructura                                                      */
/* ------------------------------------------------------------------ */

const PATRON = String.raw`select\s+id\s+into\s+\w+\s+from\s+(public\.)?personas\s+where\s+auth_user_id\s*=\s*auth\.uid\(\)`;
caso(
  "ninguna función conserva la búsqueda mecánica, salvo la de identidad (actualizar_mi_foto_perfil)",
  `select coalesce(string_agg(distinct proname, ',' order by proname), '-') from pg_proc
    where pronamespace = 'retail'::regnamespace and pg_get_functiondef(oid) ~* $p$${PATRON}$p$;`,
  "actualizar_mi_foto_perfil"
);

// Todas las que siguen mirando la CUENTA (auth_user_id = auth.uid()), en cualquier forma. Si aparece una nueva, este
// caso se pone rojo: hay que decidir si firma (→ lista de la migración) o si es un permiso (→ esta lista).
const MIRAN_LA_CUENTA = [
  "actualizar_mi_foto_perfil", "desactivar_terminal", "fn_actor_persona_id", "fn_colaboradores", "fn_compras_ubicaciones",
  "fn_es_lider", "fn_historial_colaborador", "fn_mi_perfil", "fn_persona_actual_resumen", "fn_persona_nueva_resumen",
  "fn_stock_por_sede", "fn_terminal_actual", "fn_tiene_acceso_retail", "fn_ubicacion_actual_persona",
  "liberar_apartado", "listar_apartados", "registrar_venta",
].sort();
caso(
  `las únicas que miran la cuenta con auth.uid() son las ${MIRAN_LA_CUENTA.length} de permiso/identidad (y los permisos de las 2 a mano)`,
  `select string_agg(distinct proname, ',' order by proname) from pg_proc
    where pronamespace = 'retail'::regnamespace and pg_get_functiondef(oid) ~* 'auth_user_id\\s*=\\s*auth\\.uid\\(\\)';`,
  MIRAN_LA_CUENTA.join(",")
);

caso(
  "firman con el actor: 36 de tienda (true) y 29 que no (false), una sola vez cada una",
  `select concat_ws(',',
     count(*) filter (where d ~ 'fn_actor_persona_id\\(true\\)'),
     count(*) filter (where d ~ 'fn_actor_persona_id\\(false\\)'),
     count(*) filter (where (length(d) - length(replace(d, 'fn_actor_persona_id(', ''))) / length('fn_actor_persona_id(') > 1))
   from (select pg_get_functiondef(oid) d from pg_proc where pronamespace = 'retail'::regnamespace and proname <> 'fn_actor_persona_id') x;`,
  "36,29,0"
);

caso(
  "la migración se puede pegar otra vez (no reemplaza nada, no duplica los guardias)",
  `${MIGRACION}
select concat_ws(',',
  (select (length(d) - length(replace(d, 'fn_terminal_actual()', ''))) / length('fn_terminal_actual()') from (select pg_get_functiondef('retail.registrar_venta'::regproc) d) x),
  (select (length(d) - length(replace(d, 'coalesce(a.creado_por', ''))) / length('coalesce(a.creado_por') from (select pg_get_functiondef('retail.liberar_apartado'::regproc) d) x));`,
  (s) => s.trim().endsWith("1,1")
);

caso(
  "FALLA CERRADA: una función nueva con el patrón y sin clasificar aborta la migración",
  `create function retail.zz_funcion_sin_clasificar() returns uuid language plpgsql as $f$
declare v_persona uuid;
begin
  select id into v_persona from personas where auth_user_id = auth.uid();
  return v_persona;
end;
$f$;
select pg_temp.intento($m$${MIGRACION}$m$);`,
  (s) => s.includes("no están clasificadas") && s.includes("zz_funcion_sin_clasificar")
);

/* ------------------------------------------------------------------ */
/* (b) Comportamiento                                                  */
/* ------------------------------------------------------------------ */

// ---- Venta ----
caso(
  "registrar_venta — terminal + responsable presente: firma Rosa, venta y movimiento, con terminal_id",
  `${CAJA_TRU}${sesion(T_VENTAS, { resp: "rosa" })}${venta()} as venta \\gset
${firmaVenta}`,
  "t,f,t,f,t"
);
const VENTA_FORMAT = `format($q$select retail.registrar_venta(%L,
  jsonb_build_array(jsonb_build_object('variante_id', %L, 'cantidad', 1, 'precio_unitario', %L::numeric, 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', %L::numeric)), null, gen_random_uuid())$q$, :'tru', :'v1', :'v1_precio', :'v1_precio')`;
caso(
  "registrar_venta — terminal SIN responsable: 42501 y no se crea la venta",
  `${CAJA_TRU}select count(*) as antes from retail.ventas \\gset
${sesion(T_VENTAS)}select pg_temp.intento(${VENTA_FORMAT}) as r \\gset
select :'r' || ';' || ((select count(*) from retail.ventas) = :antes);`,
  (s) => s.startsWith("42501|responsable_requerido") && s.endsWith(";true")
);
caso(
  "registrar_venta — persona (Micaela) sin encabezado: firma ella, sin terminal_id",
  `${CAJA_TRU}${sesion(MICAELA)}${venta()} as venta \\gset
${firmaVenta}`,
  "f,t,f,t,t"
);

// ---- Caja ----
caso(
  "abrir_caja — terminal de ventas + Rosa: la abre Rosa, desde la terminal",
  `${CAJA_TRU}${sesion(FELIPE)}select retail.cerrar_caja(:'caja', 100) as _x \\gset
${sesion(T_VENTAS, { resp: "rosa" })}select retail.abrir_caja(:'tru', 50) as caja2 \\gset
select concat_ws(',', abierta_por = :'rosa', terminal_id = :'t_ventas') from retail.cajas where id = :'caja2';`,
  "t,t"
);
caso(
  "registrar_movimiento_caja y cerrar_caja — terminal de ventas + Rosa: firma Rosa (movimiento con terminal_id)",
  `${CAJA_TRU}${sesion(T_VENTAS, { resp: "rosa" })}select retail.registrar_movimiento_caja(:'caja', 'ingreso', 30, 'Ingreso de prueba') as mc \\gset
select retail.cerrar_caja(:'caja', 130) as _r \\gset
select concat_ws(',', (select usuario_id = :'rosa' and terminal_id = :'t_ventas' from retail.caja_movimientos where id = :'mc'),
  (select cerrada_por = :'rosa' and estado = 'cerrada' from retail.cajas where id = :'caja'));`,
  "t,t"
);
caso(
  "cerrar_caja — terminal de ventas SIN responsable: 42501 y la caja sigue abierta",
  `${CAJA_TRU}${sesion(T_VENTAS)}select pg_temp.intento(format('select retail.cerrar_caja(%L, 100)', :'caja')) as r \\gset
select :'r' || ';' || (select estado from retail.cajas where id = :'caja');`,
  (s) => s.startsWith("42501|responsable_requerido") && s.endsWith(";abierta")
);
caso(
  "registrar_movimiento_caja — Felipe (persona) sin encabezado: firma él",
  `${CAJA_TRU}select retail.registrar_movimiento_caja(:'caja', 'ingreso', 30, 'Ingreso de prueba') as mc \\gset
select (usuario_id = :'felipe' and terminal_id is null)::text from retail.caja_movimientos where id = :'mc';`,
  "true"
);

// ---- Ajuste de stock ----
const AJUSTE = `retail.registrar_movimiento(:'v1', :'tru', 'ajuste', 1, 'prueba actor', 'nota', :'sub_tru')`;
caso(
  "registrar_movimiento (ajuste) — terminal administrativa + Rosa: firma Rosa, con terminal_id",
  `${sesion(T_ADMIN, { resp: "rosa" })}select ${AJUSTE} as mov \\gset
select concat_ws(',', usuario_id = :'rosa', terminal_id = :'t_admin') from retail.movimientos where id = :'mov';`,
  "t,t"
);
caso(
  "registrar_movimiento (ajuste) — terminal administrativa SIN responsable: 42501",
  `${sesion(T_ADMIN)}select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', 1, ''x'', ''nota'', %L)', :'v1', :'tru', :'sub_tru'));`,
  rechazo("responsable_requerido")
);
caso(
  "registrar_movimiento (ajuste) — terminal con responsable AUSENTE (sin marcas): 42501",
  `delete from public.marcajes where persona_id = '${ROSA}';
${sesion(T_ADMIN, { resp: "rosa" })}select pg_temp.intento(format('select retail.registrar_movimiento(%L, %L, ''ajuste'', 1, ''x'', ''nota'', %L)', :'v1', :'tru', :'sub_tru'));`,
  rechazo("responsable_no_presente")
);
caso(
  "registrar_movimiento (ajuste) — Felipe sin encabezado: firma él",
  `${sesion(FELIPE)}select ${AJUSTE} as mov \\gset
select (usuario_id = :'felipe' and terminal_id is null)::text from retail.movimientos where id = :'mov';`,
  "true"
);

// ---- Traslados ----
const ITEMS_TRASLADO = `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 2))`;
caso(
  "iniciar_traslado — terminal + Rosa (Trujillo → Lima): lo crea Rosa, con terminal_id; la salida la firma Rosa",
  `${sesion(T_ADMIN, { resp: "rosa" })}select retail.iniciar_traslado(:'tru', :'lim', ${ITEMS_TRASLADO}, now() + interval '1 day') as tr \\gset
select concat_ws(',', t.creado_por = :'rosa', t.terminal_id = :'t_admin',
  (select bool_and(m.usuario_id = :'rosa') from retail.transferencia_items ti join retail.movimientos m on m.id = ti.movimiento_id where ti.transferencia_id = t.id))
  from retail.transferencias t where t.id = :'tr';`,
  "t,t,t"
);
caso(
  "recepción y confirmar_traslado — terminal + Rosa (Lima → Trujillo): recibe, confirma y cierra Rosa",
  `${sesion(FELIPE)}select retail.iniciar_traslado(:'lim', :'tru', ${ITEMS_TRASLADO}, now() + interval '1 day') as tr \\gset
${sesion(T_ADMIN, { resp: "rosa" })}select retail.registrar_recepcion_traslado(:'tr', :'v1', 2) as rec \\gset
select retail.confirmar_traslado(:'tr') as _c \\gset
select concat_ws(',', t.creado_por = :'felipe', t.confirmado_por = :'rosa', t.cerrado_por = :'rosa', t.estado,
  (select bool_and(r.registrado_por = :'rosa' and m.usuario_id = :'rosa' and m.terminal_id = :'t_admin')
     from retail.transferencia_recepciones r join retail.movimientos m on m.id = r.movimiento_id where r.transferencia_id = t.id))
  from retail.transferencias t where t.id = :'tr';`,
  "t,t,t,cerrada,t"
);
caso(
  "confirmar_traslado — terminal SIN responsable: 42501 y el traslado sigue en tránsito",
  `${sesion(FELIPE)}select retail.iniciar_traslado(:'lim', :'tru', ${ITEMS_TRASLADO}, now() + interval '1 day') as tr \\gset
${sesion(T_ADMIN, { resp: "rosa" })}select retail.registrar_recepcion_traslado(:'tr', :'v1', 2) as rec \\gset
${sesion(T_ADMIN)}select pg_temp.intento(format('select retail.confirmar_traslado(%L)', :'tr')) as r \\gset
select :'r' || ';' || (select estado from retail.transferencias where id = :'tr');`,
  (s) => s.startsWith("42501|responsable_requerido") && s.endsWith(";en_transito")
);

// ---- Catálogo (disparador, por la API directa) ----
const COLOR = `insert into retail.colores (codigo, nombre) values ('zz9', 'Color de prueba') returning concat_ws(',', estado, propuesto_por = :'rosa', coalesce(aprobado_por = :'rosa', false));`;
caso(
  "catálogo — terminal administrativa + Rosa crea un color: APROBADO y firmado por Rosa",
  `${sesion(T_ADMIN, { resp: "rosa" })}${COMO_API}${COLOR}`,
  (s) => s.startsWith("aprobado,") && s.endsWith(",t")
);
caso(
  "catálogo — terminal de ventas + Rosa propone un color: PENDIENTE, propuesto por Rosa",
  `${sesion(T_VENTAS, { resp: "rosa" })}${COMO_API}${COLOR}`,
  "pendiente,t,f"
);
caso(
  "catálogo — terminal administrativa SIN responsable: el disparador rechaza (42501)",
  `${sesion(T_ADMIN)}${COMO_API}insert into retail.colores (codigo, nombre) values ('zz9', 'Color de prueba');`,
  (s) => s.includes("ERROR_DE_SCRIPT") && s.includes("Elige quién hace esta operación")
);

// ---- Compras (no de tienda) ----
caso(
  "Compras (registrar_compra, false): Felipe firma a su nombre AUNQUE llegue x-responsable; una de tienda con los mismos encabezados firma Rosa",
  `insert into retail.proveedores (nombre, activo) values ('ZZ Prueba actor ' || substr(md5(random()::text), 1, 8), true) returning id as prov \\gset
${sesion(FELIPE, { resp: "rosa", ubicacion: "tru" })}select retail.registrar_compra(:'prov', 'TST', 'N' || substr(md5(random()::text), 1, 10), 'credito', :'tru',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'v1', 'cantidad', 3, 'costo_unitario', 10)),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as compra \\gset
select ${AJUSTE} as mov \\gset
select concat_ws(',', (select usuario_id = :'felipe' from retail.compras where id = :'compra'), (select usuario_id = :'rosa' from retail.movimientos where id = :'mov'));`,
  "t,t"
);

/* ------------------------------------------------------------------ */
/* (c) Las dos A MANO: el permiso sigue en la cuenta                   */
/* ------------------------------------------------------------------ */

const VENTA_5 = `, p_descuento_pct => 5, p_motivo_descuento => 'prueba'`;
caso(
  "registrar_venta con 5 % de descuento — terminal con la LÍDER Felipe de responsable: igual pide autorización (tope de la cuenta = 0)",
  `${CAJA_TRU}${sesion(T_VENTAS, { resp: "felipe" })}select pg_temp.intento(format($q$select retail.registrar_venta(%L,
  jsonb_build_array(jsonb_build_object('variante_id', %L, 'cantidad', 1, 'precio_unitario', %L::numeric, 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', %L::numeric)), null, gen_random_uuid()${VENTA_5})$q$, :'tru', :'v1', :'v1_precio', :'v1_precio'));`,
  (s) => s.startsWith("42501|") && s.includes("supera tu tope")
);
caso(
  "registrar_venta con 5 % de descuento — Micaela (tope 10 %) sin encabezado: pasa, como hoy",
  `${CAJA_TRU}${sesion(MICAELA)}${venta(VENTA_5)} as venta \\gset
select (usuario_id = :'micaela')::text from retail.ventas where id = :'venta';`,
  "true"
);
const APARTAR = `retail.apartar_stock(:'v1', :'tru', 1, 'Clienta de prueba', '999999999', (now() + interval '3 days')::date, null, null)`;
caso(
  "apartar_stock — terminal + Rosa: lo aparta Rosa (creado_por y movimiento)",
  `${sesion(T_VENTAS, { resp: "rosa" })}select ${APARTAR} as ap \\gset
select (creado_por = :'rosa')::text from retail.apartados where id = :'ap';`,
  "true"
);
caso(
  "liberar_apartado — terminal + Rosa (la que apartó): NO libera, solo una líder (permiso de la cuenta, falla cerrado)",
  `${sesion(T_VENTAS, { resp: "rosa" })}select ${APARTAR} as ap \\gset
select pg_temp.intento(format('select retail.liberar_apartado(%L, ''entregada'')', :'ap'));`,
  (s) => s.includes("Solo quien apartó la prenda o una líder")
);
caso(
  "liberar_apartado — Micaela libera el suyo (como hoy); el movimiento lo firma ella",
  `${sesion(MICAELA)}select ${APARTAR} as ap \\gset
select retail.liberar_apartado(:'ap', 'entregada') as _l \\gset
select concat_ws(',', a.estado, a.cerrado_por = :'micaela') from retail.apartados a where a.id = :'ap';`,
  "liberado,t"
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}${EN_SECO ? ", en seco" : ""})`);
process.exit(fallas ? 1 : 0);
