#!/usr/bin/env node
/**
 * Prueba de ADR-0690 «El barrido del piso», actividad 1 — `abrir_barrido_piso`, `registrar_lecturas_barrido` y
 * `fn_barrido_piso_estado` (`20261122190000_barrido_piso_tablas.sql`, `20261122191000_barrido_piso_funciones.sql`).
 *
 * LA IDEA. Entre una y cinco personas escanean lo colgado de una tienda a la vez. Cada lectura es UNA fila con quién y a qué
 * hora; el total de una prenda es la suma de sus lecturas. Nada de esto mueve stock (mover llega al confirmar, actividad 5).
 *
 * QUÉ CUBRE
 *   B1 forma: una sola versión de cada puerta con la firma del contrato; anon no y authenticated sí; las tablas con RLS y sin
 *      políticas ni privilegios; las migraciones sin políticas ni `drop trigger`, sin `alter` de tablas ajenas y sin
 *      «select … into» dentro de un texto entre comillas (ADR-0195, ADR-0288).
 *   B2 permisos: sin Existencias, barrido_sin_modulo; en otra sede, barrido_sin_tienda; la integrante con Existencias en su
 *      sede abre y escanea y queda firmada ella; la terminal con Existencias firma la responsable; anon no; el Taller no se barre.
 *   B3 abrir: el primero crea (nuevo), el segundo se suma al mismo; nunca dos abiertos en la sede.
 *   B4 sumar, no pisar: dos personas en la misma prenda se suman; el estado dice lo de cada prenda y cada persona.
 *   B5 idempotencia: el mismo lote reenviado no cuenta dos veces; el mismo id con otro contenido no guarda nada.
 *   B6 la forma del lote: vacío, de más de 300, cantidad fuera de 1..500, id repetido, prenda que no existe, la «Prenda sin
 *      registrar», código de más de 120.
 *   B7 historia: una lectura no se edita ni se borra; un barrido no se borra; nada se vacía.
 *   B8 cerrado: un barrido que ya no está abierto no recibe lecturas (ni por la función ni por un insert directo).
 *   B9 nada de stock: abrir y escanear no escriben en movimientos ni en stock.
 *   B10 tamaño: 1.200 lecturas en 4 lotes entran y el estado responde dentro del statement_timeout de authenticated.
 *
 * CÓMO. Igual que `cuadrar_piso.mjs`: cada caso en su transacción con ROLLBACK (nunca se commitea nada), sesión simulada con
 * `request.jwt.claim.sub` y el encabezado de PostgREST con `request.headers`. La sede es NUEVA en cada caso.
 *
 * USO
 *   pnpm pruebas:barrido-piso    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leerMigracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
const MIGRACION_TABLAS = "20261122190000_barrido_piso_tablas.sql";
const MIGRACION_FUNCIONES = "20261122191000_barrido_piso_funciones.sql";
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_ALMACEN = "33333333-3333-4333-8333-0000000000c5"; // cuenta de una terminal administrativa (esta prueba)
const ROSA = "33333333-3333-4333-8333-0000000000e5"; // integrante sin cuenta, marcó entrada: la responsable

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, lineas: psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const PRELUDIO = `
begin;
create function pg_temp.r(p_sql text) returns jsonb language plpgsql as $f$
declare v jsonb; v_estado text; v_msg text; v_hint text;
begin
  execute p_sql into v;
  return jsonb_build_object('ok', true, 'res', v);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
-- La sede de la prueba: nueva, con piso y almacén, ligada a la sede de Dynamic de Trujillo (para la asistencia).
insert into retail.ubicaciones (nombre, tipo, sede_dynamic_id) values ('ZZ Tienda Barrido', 'tienda', :'sede_tru') returning id as bar \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'bar', 'Piso de venta', 'piso_venta'), (:'bar', 'Almacén de tienda', 'almacen_tienda');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
-- Tres tallas de un producto nuevo.
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Barrido Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'BAR-PRUEBA-' || t.n, 50
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 3;
select id as va from retail.variantes where sku = 'BAR-PRUEBA-1' \\gset
select id as vb from retail.variantes where sku = 'BAR-PRUEBA-2' \\gset
select id as vc from retail.variantes where sku = 'BAR-PRUEBA-3' \\gset
\\set centinela '22222222-2222-4222-8222-222222222222'
-- La terminal del almacén de Trujillo y una integrante sin cuenta que marcó entrada.
insert into auth.users (id, aud, role, email) values ('${T_ALMACEN}', 'authenticated', 'authenticated', 'terminal-almacen-barrido@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Almacén TRU (prueba barrido)', 'administrativa', '${T_ALMACEN}') returning id as t_almacen \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values ('${ROSA}', 'Rosa', 'Barrido', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
select id as felipe_p from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela_p from public.personas where auth_user_id = '${MICAELA}' \\gset
`;

/** Cambia de sesión (como `postgres`). `resp`: variable psql que va en el encabezado x-responsable. */
const sesion = (auth, { resp = null } = {}) => {
  const campos = resp ? `'x-responsable', :'${resp}'` : "";
  return `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', json_build_object(${campos})::text, true) as _h \\gset
`;
};
const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
const soloModulos = (clave, modulos) =>
  `${COMO_POSTGRES}delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');\n` +
  (modulos.length
    ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]);\n`
    : "");
const TERMINAL_CON_EXISTENCIAS = `${COMO_POSTGRES}insert into retail.rol_modulos (rol_id, modulo)
  select retail.fn_rol_por_clave('terminal_administrativa'), 'existencias'
  where not exists (select 1 from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('terminal_administrativa') and modulo = 'existencias');\n`;
const MICAELA_EN_LA_SEDE = `${COMO_POSTGRES}update retail.colaboradores set ubicacion_asignada_id = :'bar' where persona_id = :'micaela_p';\n`;

const abrir = (ubic = "bar") => `pg_temp.r(format('select retail.abrir_barrido_piso(%L)', :'${ubic}'))`;
const estado = (ubic = "bar") => `pg_temp.r(format('select retail.fn_barrido_piso_estado(%L)', :'${ubic}'))`;
/** Un lote de lecturas: [["va", 1], ["vb", 3]] → cada una con un id nuevo; o el jsonb ya armado. */
const lote = (...pares) =>
  `jsonb_build_array(${pares.map(([v, n = 1, id = "gen_random_uuid()"]) => `jsonb_build_object('id', ${id}, 'variante_id', :'${v}', 'cantidad', ${n})`).join(", ")})`;
const registrar = (items, barrido = ":'barrido'") => `pg_temp.r(format('select retail.registrar_lecturas_barrido(%L, %L::jsonb)', ${barrido}, ${items}))`;
/** Abre el barrido como Felipe y deja su id en :barrido. */
const ABIERTO = `${sesion(FELIPE)}${COMO_API}select (retail.abrir_barrido_piso(:'bar') -> 'estado' -> 'barrido' ->> 'id') as barrido \\gset
`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.movimientos), (select coalesce(sum(cantidad * 7 + cantidad_apartada), 0) from retail.stock),
  (select count(*) from retail.barridos_piso), (select count(*) from retail.barrido_piso_lecturas))`;

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle = "") {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 2500).replace(/\n/g, "\n    ")}`);
  }
}
function caso(nombre, sql, verificar) {
  const r = correr(sql);
  if (!r.ok) return esperar(nombre, false, r.mensaje);
  let ok = false;
  try {
    ok = typeof verificar === "string" ? r.lineas[r.lineas.length - 1] === verificar : !!verificar(r.lineas);
  } catch {
    ok = false;
  }
  esperar(nombre, ok, typeof verificar === "string" ? `esperaba «${verificar}», salió:\n${r.lineas.join("\n")}` : r.lineas.join("\n"));
}
const json = (linea) => JSON.parse(linea);
const error = (linea, hint, estado = "P0001") => {
  const j = json(linea);
  return j.ok === false && j.estado === estado && j.hint === hint;
};

// ===========================================================================
// B1 · Forma
// ===========================================================================

caso(
  "B1 · una sola versión de cada puerta, con la firma del contrato",
  `select string_agg(proname || '(' || pg_get_function_identity_arguments(oid) || ')', ';' order by proname)
     from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('abrir_barrido_piso', 'registrar_lecturas_barrido', 'fn_barrido_piso_estado');`,
  "abrir_barrido_piso(p_ubicacion_id uuid);fn_barrido_piso_estado(p_ubicacion_id uuid);registrar_lecturas_barrido(p_barrido_id uuid, p_lecturas jsonb)"
);
caso(
  "B1 · las tres puertas: anon no, authenticated sí, security definer con el search_path de la casa; los disparadores: nadie de afuera",
  `select string_agg(p.proname || '=' || concat_ws(',', has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
                    p.prosecdef, coalesce(p.proconfig::text like '%search_path=retail, public, extensions%', false)), ';' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('abrir_barrido_piso', 'registrar_lecturas_barrido', 'fn_barrido_piso_estado', 'fn_barrido_piso_es_historia', 'fn_barrido_piso_lectura_valida');`,
  "abrir_barrido_piso=f,t,t,t;fn_barrido_piso_es_historia=f,f,f,t;fn_barrido_piso_estado=f,t,t,t;fn_barrido_piso_lectura_valida=f,f,f,t;registrar_lecturas_barrido=f,t,t,t"
);
caso(
  "B1 · las dos tablas: RLS encendido, CERO políticas y sin privilegios para authenticated (solo las tocan las funciones)",
  `select concat_ws(',',
    (select bool_and(relrowsecurity) from pg_class where oid in ('retail.barridos_piso'::regclass, 'retail.barrido_piso_lecturas'::regclass)),
    (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('barridos_piso', 'barrido_piso_lecturas')),
    has_table_privilege('authenticated', 'retail.barridos_piso', 'select'), has_table_privilege('authenticated', 'retail.barrido_piso_lecturas', 'insert'));`,
  "t,0,f,f"
);
{
  const sin = (m) => leerMigracion(m).replace(/--[^\n]*/g, "");
  esperar(
    "B1 · ninguna crea políticas ni quita disparadores (ADR-0195); la de funciones no altera tablas; la de tablas solo enciende RLS en las suyas",
    [MIGRACION_TABLAS, MIGRACION_FUNCIONES].every((m) => !/\bdrop\s+trigger\b|\b(create|drop)\s+policy\b/i.test(sin(m))) &&
      !/\balter\s+table\b/i.test(sin(MIGRACION_FUNCIONES)) &&
      (sin(MIGRACION_TABLAS).match(/\balter\s+table\s+([\w.]+)/gi) ?? []).every((a) => /retail\.(barridos_piso|barrido_piso_lecturas)\b/.test(a))
  );
  const comillas = (m) => [...sin(m).matchAll(/'(?:[^']|'')*'/g)].map((x) => x[0]);
  esperar(
    "B1 · ningún texto entre comillas simples trae «select … into» (ADR-0288)",
    [MIGRACION_TABLAS, MIGRACION_FUNCIONES].every((m) => comillas(m).every((t) => !/select[\s\S]*\binto\b/i.test(t)))
  );
}

// ===========================================================================
// B2 · Permisos
// ===========================================================================

caso(
  "B2 · integrante SIN Existencias → barrido_sin_modulo (42501) al abrir y al escanear; el estado, barrido_sin_permiso; nada se escribe",
  `${ABIERTO}${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${soloModulos("integrante", ["vender"])}${MICAELA_EN_LA_SEDE}${sesion(MICAELA)}${COMO_API}select ${abrir()};
select ${registrar(lote(["va"]))};
select ${estado()};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-4), "barrido_sin_modulo", "42501") && error(l.at(-3), "barrido_sin_modulo", "42501") && error(l.at(-2), "barrido_sin_permiso", "42501") && l.at(-1) === "t"
);
caso(
  "B2 · integrante CON Existencias en OTRA sede → barrido_sin_tienda al abrir y al escanear, y nada se escribe",
  `${ABIERTO}${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${soloModulos("integrante", ["existencias"])}${sesion(MICAELA)}${COMO_API}select ${abrir()};
select ${registrar(lote(["va"]))};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-3), "barrido_sin_tienda", "42501") && error(l.at(-2), "barrido_sin_tienda", "42501") && l.at(-1) === "t"
);
caso(
  "B2 · integrante CON Existencias en su sede abre y escanea, sin cuenta de líder, y todo queda firmado por ella",
  `${soloModulos("integrante", ["existencias"])}${MICAELA_EN_LA_SEDE}${sesion(MICAELA)}${COMO_API}select (retail.abrir_barrido_piso(:'bar') -> 'estado' -> 'barrido' ->> 'id') as barrido \\gset
select (${registrar(lote(["va"], ["vb", 2]))}) -> 'res' ->> 'unidades';
${COMO_POSTGRES}select concat_ws(',', (select abierto_por = :'micaela_p' from retail.barridos_piso where id = :'barrido'),
  (select bool_and(persona_id = :'micaela_p') from retail.barrido_piso_lecturas where barrido_id = :'barrido'));`,
  (l) => l.at(-2) === "3" && l.at(-1) === "t,t"
);
caso(
  "B2 · la terminal con Existencias y la responsable presente escanea en su tienda, firmado por la responsable",
  `${TERMINAL_CON_EXISTENCIAS}update retail.terminales set ubicacion_id = :'bar' where id = :'t_almacen';
update retail.colaboradores set ubicacion_asignada_id = :'bar' where persona_id = :'rosa';
${sesion(T_ALMACEN, { resp: "rosa" })}${COMO_API}select (retail.abrir_barrido_piso(:'bar') -> 'estado' -> 'barrido' ->> 'id') as barrido \\gset
select (${registrar(lote(["vc"]))}) ->> 'ok';
${COMO_POSTGRES}select (select persona_id = :'rosa' from retail.barrido_piso_lecturas where barrido_id = :'barrido');`,
  (l) => l.at(-2) === "true" && l.at(-1) === "t"
);
caso(
  "B2 · anon no ejecuta ninguna de las tres (42501)",
  `${COMO_POSTGRES}set local role anon;
select pg_temp.intento(format('select retail.abrir_barrido_piso(%L)', :'bar')) ->> 'estado';
select pg_temp.intento(format('select retail.registrar_lecturas_barrido(gen_random_uuid(), ''[]''::jsonb)')) ->> 'estado';
select pg_temp.intento(format('select retail.fn_barrido_piso_estado(%L)', :'bar')) ->> 'estado';`,
  (l) => l.slice(-3).every((x) => x === "42501")
);
caso(
  "B2 · el Taller (no separa piso y almacén) no se barre: barrido_tienda_sin_piso; su estado dice separa = false",
  `${sesion(FELIPE)}${COMO_API}select ${abrir("taller")};
select (${estado("taller")}) -> 'res' ->> 'separa';`,
  (l) => error(l.at(-2), "barrido_tienda_sin_piso") && l.at(-1) === "false"
);

// ===========================================================================
// B3 · Abrir: uno por sede, quien llega se suma
// ===========================================================================

caso(
  "B3 · el primero abre (nuevo) y el segundo, de otra persona, se suma al MISMO barrido; nunca dos abiertos (ni a mano)",
  `${sesion(FELIPE)}${COMO_API}select ${abrir()} as a1 \\gset
${soloModulos("integrante", ["existencias"])}${MICAELA_EN_LA_SEDE}${sesion(MICAELA)}${COMO_API}select ${abrir()} as a2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'a1')::jsonb -> 'res' ->> 'nuevo', (:'a2')::jsonb -> 'res' ->> 'nuevo',
  (:'a1')::jsonb -> 'res' -> 'estado' -> 'barrido' ->> 'id' = (:'a2')::jsonb -> 'res' -> 'estado' -> 'barrido' ->> 'id',
  (select count(*) from retail.barridos_piso where ubicacion_id = :'bar'),
  (:'a1')::jsonb -> 'res' -> 'estado' -> 'barrido' ->> 'unidades',
  pg_temp.intento(format('insert into retail.barridos_piso (ubicacion_id, abierto_por) values (%L, %L)', :'bar', :'felipe_p')) ->> 'estado');`,
  "true,false,t,1,0,23505"
);
caso(
  "B3 · sin barrido abierto, el estado dice barrido = null y separa = true",
  `${sesion(FELIPE)}${COMO_API}select concat_ws(',', (${estado()}) -> 'res' ->> 'separa', (${estado()}) -> 'res' -> 'barrido' = 'null'::jsonb);`,
  "true,t"
);

// ===========================================================================
// B4 · Sumar, no pisar
// ===========================================================================

caso(
  "B4 · dos personas en la misma prenda se SUMAN (Felipe 2 + Micaela 1 = 3); el estado trae cada prenda y cada persona",
  `${ABIERTO}select (${registrar(lote(["va", 2], ["vb"]))}) -> 'res' as r1 \\gset
${soloModulos("integrante", ["existencias"])}${MICAELA_EN_LA_SEDE}${sesion(MICAELA)}${COMO_API}select (${registrar(lote(["va"]))}) -> 'res' as r2 \\gset
select (${estado()}) -> 'res' -> 'barrido' as e \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'guardadas', (:'r2')::jsonb ->> 'unidades',
  ((:'r2')::jsonb -> 'por_prenda' -> 0 ->> 'cantidad'), jsonb_array_length((:'r2')::jsonb -> 'por_prenda'),
  (:'e')::jsonb ->> 'unidades', (:'e')::jsonb ->> 'lecturas', (:'e')::jsonb ->> 'prendas',
  (select x ->> 'cantidad' from jsonb_array_elements((:'e')::jsonb -> 'por_prenda') x where x ->> 'variante_id' = :'va'),
  jsonb_array_length((:'e')::jsonb -> 'personas'),
  (:'e')::jsonb -> 'personas' -> 0 ->> 'persona_id' = :'micaela_p',
  (select x ->> 'unidades' from jsonb_array_elements((:'e')::jsonb -> 'personas') x where x ->> 'persona_id' = :'felipe_p'),
  (select count(*) from retail.barrido_piso_lecturas where barrido_id = :'barrido' and leida_en is not null));`,
  "2,4,3,1,4,3,2,3,2,t,3,3"
);
caso(
  "B4 · la hora del aparato se guarda tal cual, aparte de la del servidor",
  `${ABIERTO}select ${registrar(`jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'variante_id', :'va', 'leida_en_aparato', '2026-11-22T10:07:00-05:00', 'codigo', 'BAR-PRUEBA-1'))`)} as _r \\gset
${COMO_POSTGRES}select concat_ws(',', (select leida_en_aparato = '2026-11-22T10:07:00-05:00'::timestamptz from retail.barrido_piso_lecturas where barrido_id = :'barrido'),
  (select codigo from retail.barrido_piso_lecturas where barrido_id = :'barrido'));`,
  "t,BAR-PRUEBA-1"
);

// ===========================================================================
// B5 · Idempotencia
// ===========================================================================

caso(
  "B5 · el mismo lote reenviado (corte de red) no cuenta dos veces: guardadas 0, ya_estaban 2, el total igual",
  `${ABIERTO}select gen_random_uuid() as l1 \\gset
select gen_random_uuid() as l2 \\gset
select (${registrar(lote(["va", 1, ":'l1'"], ["vb", 2, ":'l2'"]))}) -> 'res' as r1 \\gset
select (${registrar(lote(["vb", 2, ":'l2'"], ["va", 1, ":'l1'"]))}) -> 'res' as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb ->> 'guardadas', (:'r2')::jsonb ->> 'guardadas', (:'r2')::jsonb ->> 'ya_estaban', (:'r2')::jsonb ->> 'unidades',
  (select count(*) from retail.barrido_piso_lecturas where barrido_id = :'barrido'));`,
  "2,0,2,3,2"
);
caso(
  "B5 · el mismo id con OTRA prenda u otra cantidad → barrido_lectura_reusada y no se guarda nada del lote",
  `${ABIERTO}select gen_random_uuid() as l1 \\gset
select ${registrar(lote(["va", 1, ":'l1'"]))} as _r \\gset
select ${registrar(lote(["vc"], ["vb", 1, ":'l1'"]))};
select ${registrar(lote(["va", 2, ":'l1'"]))};
${COMO_POSTGRES}select count(*) from retail.barrido_piso_lecturas where barrido_id = :'barrido';`,
  (l) => error(l.at(-3), "barrido_lectura_reusada") && error(l.at(-2), "barrido_lectura_reusada") && l.at(-1) === "1"
);

// ===========================================================================
// B6 · La forma del lote
// ===========================================================================

caso(
  "B6 · lote vacío, de 301, con cantidad 0 o 501, con un id repetido, sin prenda o código de más de 120 → barrido_lecturas_invalidas; nada entra",
  `${ABIERTO}select gen_random_uuid() as l1 \\gset
select ${registrar("'[]'::jsonb")};
select ${registrar(`(select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'variante_id', :'va')) from generate_series(1, 301))`)};
select ${registrar(lote(["va", 0]))};
select ${registrar(lote(["va", 501]))};
select ${registrar(lote(["va", 1, ":'l1'"], ["vb", 1, ":'l1'"]))};
select ${registrar(`jsonb_build_array(jsonb_build_object('id', gen_random_uuid()))`)};
select ${registrar(`jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'variante_id', :'va', 'codigo', repeat('x', 121)))`)};
select ${registrar(`jsonb_build_array(jsonb_build_object('id', 'no-es-uuid', 'variante_id', :'va'))`)};
${COMO_POSTGRES}select count(*) from retail.barrido_piso_lecturas where barrido_id = :'barrido';`,
  (l) => l.slice(-9, -1).every((x) => error(x, "barrido_lecturas_invalidas", "22023")) && l.at(-1) === "0"
);
caso(
  "B6 · una prenda que no existe → barrido_prenda_desconocida; la «Prenda sin registrar» → barrido_no_es_inventario; nada entra",
  `${ABIERTO}select ${registrar(`jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'variante_id', gen_random_uuid()))`)};
select ${registrar(lote(["va"], ["centinela"]))};
${COMO_POSTGRES}select count(*) from retail.barrido_piso_lecturas where barrido_id = :'barrido';`,
  (l) => error(l.at(-3), "barrido_prenda_desconocida") && error(l.at(-2), "barrido_no_es_inventario") && l.at(-1) === "0"
);

// ===========================================================================
// B7 · Historia
// ===========================================================================

caso(
  "B7 · una lectura no se edita ni se borra; un barrido no se borra; nada se vacía (barrido_inmutable)",
  `${ABIERTO}select ${registrar(lote(["va"]))} as _r \\gset
${COMO_POSTGRES}select pg_temp.intento(format('update retail.barrido_piso_lecturas set cantidad = 9 where barrido_id = %L', :'barrido')) ->> 'hint';
select pg_temp.intento(format('delete from retail.barrido_piso_lecturas where barrido_id = %L', :'barrido')) ->> 'hint';
select pg_temp.intento(format('delete from retail.barridos_piso where id = %L', :'barrido')) ->> 'hint';
select pg_temp.intento('truncate retail.barrido_piso_lecturas') ->> 'hint';
select (select cantidad from retail.barrido_piso_lecturas where barrido_id = :'barrido');`,
  (l) => l.slice(-5, -1).every((x) => x === "barrido_inmutable") && l.at(-1) === "1"
);

// ===========================================================================
// B8 · Un barrido cerrado no recibe lecturas
// ===========================================================================

caso(
  "B8 · cancelado el barrido, registrar → barrido_cerrado y un insert directo también; abrir de nuevo crea OTRO",
  `${ABIERTO}${COMO_POSTGRES}update retail.barridos_piso set estado = 'cancelado', cerrado_en = now(), cerrado_por = :'felipe_p' where id = :'barrido';
${sesion(FELIPE)}${COMO_API}select ${registrar(lote(["va"]))};
${COMO_POSTGRES}select pg_temp.intento(format('insert into retail.barrido_piso_lecturas (id, barrido_id, variante_id, persona_id) values (gen_random_uuid(), %L, %L, %L)', :'barrido', :'va', :'felipe_p')) ->> 'hint';
${sesion(FELIPE)}${COMO_API}select (${abrir()}) -> 'res' ->> 'nuevo';`,
  (l) => error(l.at(-3), "barrido_cerrado") && l.at(-2) === "barrido_cerrado" && l.at(-1) === "true"
);
caso(
  "B8 · un barrido que no existe → barrido_no_existe",
  `${sesion(FELIPE)}${COMO_API}select ${registrar(lote(["va"]), "gen_random_uuid()")};`,
  (l) => error(l.at(-1), "barrido_no_existe")
);

// ===========================================================================
// B9 · Nada de stock
// ===========================================================================

caso(
  "B9 · abrir y escanear no escriben en movimientos ni en stock (solo suman el barrido y sus lecturas)",
  `${COMO_POSTGRES}select (select count(*) from retail.movimientos) || '/' || (select coalesce(sum(cantidad * 7 + cantidad_apartada), 0) from retail.stock) as antes \\gset
${ABIERTO}select ${registrar(lote(["va", 3], ["vb"], ["vc", 2]))} as _r \\gset
${COMO_POSTGRES}select (select count(*) from retail.movimientos) || '/' || (select coalesce(sum(cantidad * 7 + cantidad_apartada), 0) from retail.stock) = :'antes';`,
  "t"
);

// ===========================================================================
// B10 · Tamaño
// ===========================================================================

caso(
  "B10 · 1.200 lecturas en 4 lotes de 300 entran y el estado responde, con el statement_timeout de authenticated",
  `${ABIERTO}set local statement_timeout = '8s';
${["va", "vb", "vc", "va"]
  .map(
    (v) =>
      `select (${registrar(`(select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'variante_id', :'${v}')) from generate_series(1, 300))`)}) -> 'res' ->> 'guardadas';`
  )
  .join("\n")}
select (${estado()}) -> 'res' -> 'barrido' ->> 'unidades';`,
  (l) => l.slice(-5, -1).every((x) => x === "300") && l.at(-1) === "1200"
);

console.log(`\n${fallos === 0 ? "✓" : "✗"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
