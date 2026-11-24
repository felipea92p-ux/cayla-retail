#!/usr/bin/env node
/**
 * Prueba de ADR-0701 «Tickets compartidos» (ADR-0511 paso 2), actividad 1 — `enviar_ticket_a_caja`, `fn_tickets_compartidos`,
 * `tomar_ticket_compartido` y `descartar_ticket_compartido` (`20261124172000_tickets_compartidos.sql`).
 *
 * LA IDEA. La asesora arma el ticket en su celular, en el piso, y lo manda a la caja de su sede. La caja ve la lista de los que esperan
 * y abre uno: pasa a ser un ticket de ese equipo y se cobra como siempre. Un ticket compartido termina UNA vez (tomado o descartado),
 * nunca se borra, y de dos equipos que lo abren a la vez solo uno se lo lleva.
 *
 * QUÉ CUBRE
 *   T1 forma: una sola versión de cada puerta; anon no y authenticated sí; los ayudantes, nadie de afuera; la tabla con RLS, sin
 *      políticas ni privilegios; la migración sin políticas, sin `drop trigger`, sin `alter` de tablas ajenas y sin «select … into» entre
 *      comillas (ADR-0195, ADR-0288).
 *   T2 permisos: sin Vender, ticket_sin_modulo; en otra sede, ticket_otra_sede; el Taller no es tienda; anon no; con Vender en su sede
 *      manda, ve, abre y descarta, y queda firmada ella.
 *   T3 la cuenta: prendas y total como la web (`totalDeLineas`, en céntimos); la lista no trae el contenido; del más antiguo al más nuevo.
 *   T4 idempotencia: el mismo id reenviado no crea otro ni lo pisa; el mismo id hacia otra sede se rechaza.
 *   T5 la forma del contenido: sin carrito, carrito vacío, cantidad 0 o rara, más de 60 líneas → nada se escribe.
 *   T6 abrir: devuelve el contenido, firma quién y cuándo, sale de la lista; abrirlo otra vez dice quién lo abrió; no se descarta después.
 *   T7 descartar: queda escrito, sale de la lista; dos veces no falla; ya descartado no se abre.
 *   T8 historia: ni editar, ni borrar, ni vaciar, ni volver a «esperando», ni insertar un estado imposible.
 *   T9 tope: 20 esperando en una caja; el 21 se rechaza.
 *   T10 carrera REAL (con COMMIT): dos equipos abren el mismo ticket a la vez → uno se lo lleva y el otro recibe ticket_ya_tomado.
 *   T11 la medida (actividad 5): un ticket tomado anota con qué venta de SU tienda se cobró, una vez; la misma otra vez no falla; uno
 *       que espera, una venta de otra tienda o una segunda venta se rechazan; a mano solo se puede escribir esa columna, y solo en un tomado.
 *
 * CÓMO. Como `barrido_piso.mjs`: cada caso en su transacción con ROLLBACK, sesión simulada con `request.jwt.claim.sub` y el encabezado
 * de PostgREST en `request.headers`. Solo T10 confirma (en una sede de prueba propia, «ZZ Tickets carrera»): un ROLLBACK no ve un bloqueo.
 *
 * USO
 *   pnpm pruebas:tickets-compartidos    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = "20261124172000_tickets_compartidos.sql";
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", PSQL, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
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
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
insert into retail.ubicaciones (nombre, tipo, sede_dynamic_id) values ('ZZ Tienda Tickets', 'tienda', :'sede_tru') returning id as sede \\gset
select id as felipe_p from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela_p from public.personas where auth_user_id = '${MICAELA}' \\gset
`;

const sesion = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;
const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
const soloModulos = (clave, modulos) =>
  `${COMO_POSTGRES}delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');\n` +
  (modulos.length
    ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]);\n`
    : "");
const MICAELA_EN_LA_SEDE = `${COMO_POSTGRES}update retail.colaboradores set ubicacion_asignada_id = :'sede' where persona_id = :'micaela_p';\n`;

/** Una línea del carrito como la arma la web. */
const linea = (cantidad, precio, descuento = 0) =>
  `jsonb_build_object('varianteId', gen_random_uuid(), 'cantidad', ${cantidad}, 'precioUnitario', ${precio}, 'descuentoUnitario', ${descuento})`;
const contenido = (...lineas) => `jsonb_build_object('carrito', jsonb_build_array(${lineas.join(", ")}), 'nota', 'probador 2')`;
const BLUSAS = contenido(linea(2, 59.9, 10), linea(1, 100));
const enviar = (id, cont = BLUSAS, sede = ":'sede'", nombre = "'Cliente 1'") =>
  `pg_temp.r(format('select retail.enviar_ticket_a_caja(%L, %L, %L, %L::jsonb)', ${id}, ${sede}, ${nombre}, ${cont}))`;
const lista = (sede = ":'sede'") => `pg_temp.r(format('select retail.fn_tickets_compartidos(%L)', ${sede}))`;
const tomar = (id) => `pg_temp.r(format('select retail.tomar_ticket_compartido(%L)', ${id}))`;
const descartar = (id) => `pg_temp.r(format('select retail.descartar_ticket_compartido(%L)', ${id}))`;
const IDS = `select gen_random_uuid() as t1, gen_random_uuid() as t2, gen_random_uuid() as t3 \\gset\n`;
/** Felipe manda un ticket (:t1) a la sede de prueba. */
const MANDADO = `${IDS}${sesion(FELIPE)}${COMO_API}select ${enviar(":'t1'")} ->> 'ok';\n`;
const CUANTOS = "(select count(*) from retail.tickets_compartidos)";

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
const json = (l) => JSON.parse(l);
const error = (l, hint, estado = "22023") => {
  const j = json(l);
  return j.ok === false && j.estado === estado && j.hint === hint;
};

// ===========================================================================
// T1 · Forma
// ===========================================================================

caso(
  "T1 · una sola versión de cada puerta, con la firma del contrato",
  `select string_agg(proname || '(' || pg_get_function_identity_arguments(oid) || ')', ';' order by proname)
     from pg_proc where pronamespace = 'retail'::regnamespace
      and proname in ('enviar_ticket_a_caja', 'fn_tickets_compartidos', 'tomar_ticket_compartido', 'descartar_ticket_compartido', 'marcar_ticket_compartido_cobrado');`,
  "descartar_ticket_compartido(p_id uuid);enviar_ticket_a_caja(p_id uuid, p_ubicacion_id uuid, p_nombre text, p_contenido jsonb);fn_tickets_compartidos(p_ubicacion_id uuid);marcar_ticket_compartido_cobrado(p_id uuid, p_venta_id uuid);tomar_ticket_compartido(p_id uuid)"
);
caso(
  "T1 · las cuatro puertas: anon no, authenticated sí, security definer con el search_path de la casa; los ayudantes: nadie de afuera",
  `select string_agg(p.proname || '=' || concat_ws(',', has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
                    p.prosecdef, coalesce(p.proconfig::text like '%search_path=retail, public, extensions%', false)), ';' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('enviar_ticket_a_caja', 'fn_tickets_compartidos', 'tomar_ticket_compartido', 'descartar_ticket_compartido', 'marcar_ticket_compartido_cobrado',
                        'fn_exigir_tickets_de_sede', 'fn_ticket_compartido_fila', 'fn_ticket_compartido_transicion');`,
  "descartar_ticket_compartido=f,t,t,t;enviar_ticket_a_caja=f,t,t,t;fn_exigir_tickets_de_sede=f,f,t,t;fn_ticket_compartido_fila=f,f,t,t;fn_ticket_compartido_transicion=f,f,f,t;fn_tickets_compartidos=f,t,t,t;marcar_ticket_compartido_cobrado=f,t,t,t;tomar_ticket_compartido=f,t,t,t"
);
caso(
  "T1 · la tabla: RLS encendido, CERO políticas y sin privilegios para authenticated (solo la tocan las funciones)",
  `select concat_ws(',', (select relrowsecurity from pg_class where oid = 'retail.tickets_compartidos'::regclass),
    (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'tickets_compartidos'),
    has_table_privilege('authenticated', 'retail.tickets_compartidos', 'select'), has_table_privilege('authenticated', 'retail.tickets_compartidos', 'insert'),
    has_table_privilege('anon', 'retail.tickets_compartidos', 'select'));`,
  "t,0,f,f,f"
);
{
  const sin = readFileSync(join(RAIZ, "supabase", "migrations", MIGRACION), "utf8").replace(/--[^\n]*/g, "");
  esperar(
    "T1 · la migración no crea políticas ni quita disparadores (ADR-0195) y solo altera su propia tabla",
    !/\bdrop\s+trigger\b|\b(create|drop)\s+policy\b/i.test(sin) &&
      (sin.match(/\balter\s+table\s+([\w.]+)/gi) ?? []).every((a) => /retail\.tickets_compartidos\b/.test(a))
  );
  esperar(
    "T1 · ningún texto entre comillas simples trae «select … into» (ADR-0288)",
    [...sin.matchAll(/'(?:[^']|'')*'/g)].every((x) => !/select[\s\S]*\binto\b/i.test(x[0]))
  );
}

// ===========================================================================
// T2 · Permisos
// ===========================================================================

caso(
  "T2 · integrante SIN Vender → ticket_sin_modulo (42501) al mandar, listar, abrir y descartar; nada se escribe",
  `${MANDADO}${COMO_POSTGRES}select ${CUANTOS} as antes \\gset
${soloModulos("integrante", ["existencias"])}${MICAELA_EN_LA_SEDE}${sesion(MICAELA)}${COMO_API}select ${enviar(":'t2'")};
select ${lista()};
select ${tomar(":'t1'")};
select ${descartar(":'t1'")};
${COMO_POSTGRES}select concat_ws(',', ${CUANTOS} = :'antes', (select estado from retail.tickets_compartidos where id = :'t1'));`,
  (l) =>
    ["ticket_sin_modulo"].every(() => [-5, -4, -3, -2].every((i) => error(l.at(i), "ticket_sin_modulo", "42501"))) && l.at(-1) === "t,esperando"
);
caso(
  "T2 · integrante CON Vender en OTRA sede → ticket_otra_sede al mandar, listar y abrir",
  `${MANDADO}${soloModulos("integrante", ["vender"])}${sesion(MICAELA)}${COMO_API}select ${enviar(":'t2'")};
select ${lista()};
select ${tomar(":'t1'")};`,
  (l) => [-3, -2, -1].every((i) => error(l.at(i), "ticket_otra_sede", "42501"))
);
caso(
  "T2 · el Taller no es una tienda → ticket_sin_tienda",
  `${IDS}${sesion(FELIPE)}${COMO_API}select ${enviar(":'t1'", BLUSAS, ":'taller'")};`,
  (l) => error(l.at(-1), "ticket_sin_tienda")
);
caso(
  "T2 · anon no puede llamar a ninguna puerta",
  `${MANDADO}${COMO_POSTGRES}set local role anon;
select pg_temp.intento(format('select retail.fn_tickets_compartidos(%L)', :'sede')) ->> 'estado';
select pg_temp.intento(format('select retail.tomar_ticket_compartido(%L)', :'t1')) ->> 'estado';`,
  (l) => l.at(-2) === "42501" && l.at(-1) === "42501"
);
caso(
  "T2 · integrante CON Vender en su sede: manda, ve, abre y descarta sin cuenta de líder, y todo queda firmado por ella",
  `${IDS}${soloModulos("integrante", ["vender"])}${MICAELA_EN_LA_SEDE}${sesion(MICAELA)}${COMO_API}select ${enviar(":'t1'")} ->> 'ok';
select ${enviar(":'t2'")} ->> 'ok';
select jsonb_array_length(${lista()} -> 'res');
select ${tomar(":'t1'")} ->> 'ok';
select ${descartar(":'t2'")} ->> 'ok';
${COMO_POSTGRES}select string_agg(concat_ws(':', estado, enviado_por = :'micaela_p', coalesce(tomado_por, descartado_por) = :'micaela_p'), ';' order by estado)
  from retail.tickets_compartidos where id in (:'t1', :'t2');`,
  (l) => l.slice(-6, -1).join(",") === "true,true,2,true,true" && l.at(-1) === "descartado:t:t;tomado:t:t"
);

// ===========================================================================
// T3 · La cuenta y la lista
// ===========================================================================

caso(
  "T3 · prendas y total como la web: 2 × (59,90 − 10,00) + 1 × 100,00 = 3 prendas y S/ 199,80; el nombre y quién lo mandó",
  `${MANDADO}select ${lista()} -> 'res' -> 0;`,
  (l) => {
    const t = json(l.at(-1));
    return t.prendas === 3 && Number(t.total) === 199.8 && t.nombre === "Cliente 1" && t.estado === "esperando" && typeof t.enviado_por === "string" && t.enviado_por.length > 0;
  }
);
caso(
  "T3 · la lista NO trae el contenido, y va del más antiguo al más nuevo",
  `${IDS}${sesion(FELIPE)}${COMO_API}select ${enviar(":'t1'", BLUSAS, ":'sede'", "'Primero'")} ->> 'ok';
select pg_sleep(0.01);
select ${enviar(":'t2'", BLUSAS, ":'sede'", "'Segundo'")} ->> 'ok';
select ${lista()} -> 'res';`,
  (l) => {
    const r = json(l.at(-1));
    return r.length === 2 && r[0].nombre === "Primero" && r[1].nombre === "Segundo" && r.every((t) => !("contenido" in t));
  }
);
caso(
  "T3 · los céntimos no se pierden: 3 × 33,33 con 0,01 de descuento = S/ 99,96",
  `${IDS}${sesion(FELIPE)}${COMO_API}select ${enviar(":'t1'", contenido(linea(3, 33.33, 0.01)))} -> 'res' ->> 'total';`,
  (l) => Number(l.at(-1)) === 99.96
);

// ===========================================================================
// T4 · Idempotencia
// ===========================================================================

caso(
  "T4 · el mismo id reenviado (doble toque) no crea otro ni pisa el primero",
  `${MANDADO}select ${enviar(":'t1'", contenido(linea(9, 1)), ":'sede'", "'Otro nombre'")} -> 'res';
${COMO_POSTGRES}select concat_ws(',', (select count(*) from retail.tickets_compartidos where id = :'t1'),
  (select nombre || '/' || prendas from retail.tickets_compartidos where id = :'t1'));`,
  (l) => json(l.at(-2)).nombre === "Cliente 1" && l.at(-1) === "1,Cliente 1/3"
);
caso(
  "T4 · el mismo id hacia otra sede → ticket_otra_sede",
  `${MANDADO}select ${enviar(":'t1'", BLUSAS, ":'tru'")};`,
  (l) => error(l.at(-1), "ticket_otra_sede")
);

// ===========================================================================
// T5 · La forma del contenido
// ===========================================================================

caso(
  "T5 · sin carrito, carrito vacío, cantidad 0, cantidad rara, precio raro y más de 60 líneas: se rechazan y nada se escribe",
  `${IDS}${COMO_POSTGRES}select ${CUANTOS} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${enviar("gen_random_uuid()", "'{}'::jsonb")};
select ${enviar("gen_random_uuid()", "jsonb_build_object('carrito', '[]'::jsonb)")};
select ${enviar("gen_random_uuid()", contenido(linea(0, 50)))};
select ${enviar("gen_random_uuid()", "jsonb_build_object('carrito', jsonb_build_array(jsonb_build_object('cantidad', 'dos', 'precioUnitario', 10)))")};
select ${enviar("gen_random_uuid()", "jsonb_build_object('carrito', jsonb_build_array(jsonb_build_object('cantidad', 1, 'precioUnitario', 'caro')))")};
select ${enviar("gen_random_uuid()", "jsonb_build_object('carrito', (select jsonb_agg(jsonb_build_object('cantidad', 1, 'precioUnitario', 1)) from generate_series(1, 61)))")};
${COMO_POSTGRES}select ${CUANTOS} = :'antes';`,
  (l) =>
    error(l.at(-7), "ticket_vacio") &&
    error(l.at(-6), "ticket_vacio") &&
    error(l.at(-5), "ticket_vacio") &&
    error(l.at(-4), "ticket_linea_invalida") &&
    error(l.at(-3), "ticket_linea_invalida") &&
    error(l.at(-2), "ticket_muy_grande") &&
    l.at(-1) === "t"
);

// ===========================================================================
// T6 · Abrir
// ===========================================================================

caso(
  "T6 · abrir devuelve el contenido completo, firma quién y cuándo, y el ticket sale de la lista",
  `${MANDADO}select ${tomar(":'t1'")} -> 'res';
select jsonb_array_length(${lista()} -> 'res');
${COMO_POSTGRES}select concat_ws(',', estado, tomado_por = :'felipe_p', tomado_en is not null) from retail.tickets_compartidos where id = :'t1';`,
  (l) => {
    const r = json(l.at(-3));
    return r.contenido?.nota === "probador 2" && r.contenido?.carrito?.length === 2 && r.estado === "tomado" && l.at(-2) === "0" && l.at(-1) === "tomado,t,t";
  }
);
caso(
  "T6 · abrirlo otra vez dice quién lo abrió (ticket_ya_tomado), y uno ya abierto no se descarta",
  `${MANDADO}select ${tomar(":'t1'")} ->> 'ok';
select ${tomar(":'t1'")};
select ${descartar(":'t1'")};`,
  (l) => error(l.at(-2), "ticket_ya_tomado") && json(l.at(-2)).msg.includes("ya lo abrió") && error(l.at(-1), "ticket_ya_tomado")
);
caso(
  "T6 · un id que no existe → ticket_no_existe",
  `${IDS}${sesion(FELIPE)}${COMO_API}select ${tomar(":'t3'")};
select ${descartar(":'t3'")};`,
  (l) => error(l.at(-2), "ticket_no_existe", "P0002") && error(l.at(-1), "ticket_no_existe", "P0002")
);

// ===========================================================================
// T7 · Descartar
// ===========================================================================

caso(
  "T7 · descartar lo deja escrito con quién y cuándo, sale de la lista, dos veces no falla, y ya no se abre",
  `${MANDADO}select ${descartar(":'t1'")} ->> 'ok';
select ${descartar(":'t1'")} ->> 'ok';
select jsonb_array_length(${lista()} -> 'res');
select ${tomar(":'t1'")};
${COMO_POSTGRES}select concat_ws(',', estado, descartado_por = :'felipe_p', descartado_en is not null) from retail.tickets_compartidos where id = :'t1';`,
  (l) => l.at(-5) === "true" && l.at(-4) === "true" && l.at(-3) === "0" && error(l.at(-2), "ticket_descartado") && l.at(-1) === "descartado,t,t"
);

// ===========================================================================
// T8 · Historia
// ===========================================================================

caso(
  "T8 · ni editar el contenido, ni borrar, ni vaciar, ni volver a «esperando», ni editar uno cerrado",
  `${MANDADO}${COMO_POSTGRES}select pg_temp.intento(format('update retail.tickets_compartidos set contenido = ''{}'' where id = %L', :'t1')) ->> 'msg';
select pg_temp.intento(format('delete from retail.tickets_compartidos where id = %L', :'t1')) ->> 'ok';
select pg_temp.intento('truncate retail.tickets_compartidos') ->> 'ok';
${sesion(FELIPE)}${COMO_API}select ${tomar(":'t1'")} ->> 'ok';
${COMO_POSTGRES}select pg_temp.intento(format('update retail.tickets_compartidos set estado = ''esperando'', tomado_por = null, tomado_en = null where id = %L', :'t1')) ->> 'ok';
select ${CUANTOS} >= 1;`,
  (l) => l.at(-6).includes("solo cambia") && l.slice(-5).join(",") === "false,false,true,false,t"
);
caso(
  "T8 · un estado imposible no entra ni a mano: «tomado» sin quién, o «esperando» con fecha de descarte",
  `${IDS}${COMO_POSTGRES}select pg_temp.intento(format($q$insert into retail.tickets_compartidos (id, ubicacion_id, nombre, contenido, prendas, total, enviado_por, estado)
  values (%L, %L, 'X', '{}', 1, 1, %L, 'tomado')$q$, :'t1', :'sede', :'felipe_p')) ->> 'estado';
select pg_temp.intento(format($q$insert into retail.tickets_compartidos (id, ubicacion_id, nombre, contenido, prendas, total, enviado_por, descartado_en)
  values (%L, %L, 'X', '{}', 1, 1, %L, now())$q$, :'t2', :'sede', :'felipe_p')) ->> 'estado';`,
  (l) => l.at(-2) === "23514" && l.at(-1) === "23514"
);

// ===========================================================================
// T9 · Tope
// ===========================================================================

caso(
  "T9 · 20 esperando en una caja; el 21 → ticket_tope; abrir uno libera el lugar",
  `${IDS}${sesion(FELIPE)}${COMO_API}select count(*) filter (where (${enviar("gen_random_uuid()")}) ->> 'ok' = 'true') from generate_series(1, 20);
select ${enviar(":'t1'")};
select (retail.fn_tickets_compartidos(:'sede') -> 0 ->> 'id') as primero \\gset
select ${tomar(":'primero'")} ->> 'ok';
select ${enviar(":'t1'")} ->> 'ok';`,
  (l) => l.at(-4) === "20" && error(l.at(-3), "ticket_tope") && l.at(-2) === "true" && l.at(-1) === "true"
);

// ===========================================================================
// T11 · La medida: con qué venta se cobró
// ===========================================================================

const marcar = (id, venta) => `pg_temp.r(format('select retail.marcar_ticket_compartido_cobrado(%L, %L)', ${id}, ${venta}))`;
const VENTAS = `${COMO_POSTGRES}insert into retail.ventas (ubicacion_id, es_prueba) values (:'sede', true) returning id as venta \\gset
insert into retail.ventas (ubicacion_id, es_prueba) values (:'sede', true) returning id as venta2 \\gset
insert into retail.ventas (ubicacion_id, es_prueba) values (:'tru', true) returning id as ajena \\gset
`;

caso(
  "T11 · un ticket tomado anota su venta una vez (la misma otra vez no falla); la caja puede medir enviado → tomado → cobrado",
  `${MANDADO}${VENTAS}${sesion(FELIPE)}${COMO_API}select ${tomar(":'t1'")} ->> 'ok';
select ${marcar(":'t1'", ":'venta'")} ->> 'ok';
select ${marcar(":'t1'", ":'venta'")} ->> 'ok';
${COMO_POSTGRES}select concat_ws(',', t.venta_id = :'venta', t.tomado_en >= t.enviado_en, v.id is not null)
  from retail.tickets_compartidos t left join retail.ventas v on v.id = t.venta_id where t.id = :'t1';`,
  (l) => l.slice(-4, -1).join(",") === "true,true,true" && l.at(-1) === "t,t,t"
);
caso(
  "T11 · se rechaza: el que espera (ticket_no_tomado), una venta de otra tienda (ticket_venta_ajena), una segunda venta (ticket_ya_cobrado)",
  `${MANDADO}${VENTAS}${sesion(FELIPE)}${COMO_API}select ${marcar(":'t1'", ":'venta'")};
select ${tomar(":'t1'")} ->> 'ok';
select ${marcar(":'t1'", ":'ajena'")};
select ${marcar(":'t1'", ":'venta'")} ->> 'ok';
select ${marcar(":'t1'", ":'venta2'")};`,
  (l) => error(l.at(-5), "ticket_no_tomado") && error(l.at(-3), "ticket_venta_ajena") && l.at(-2) === "true" && error(l.at(-1), "ticket_ya_cobrado")
);
caso(
  "T11 · a mano: en un tomado solo entra la venta (una vez y sin tocar nada más); en uno que espera, ni eso",
  `${MANDADO}${VENTAS}${COMO_POSTGRES}select pg_temp.intento(format('update retail.tickets_compartidos set venta_id = %L where id = %L', :'venta', :'t1')) ->> 'ok';
${sesion(FELIPE)}${COMO_API}select ${tomar(":'t1'")} ->> 'ok';
${COMO_POSTGRES}select pg_temp.intento(format('update retail.tickets_compartidos set venta_id = %L, nombre = ''Otro'' where id = %L', :'venta', :'t1')) ->> 'ok';
select pg_temp.intento(format('update retail.tickets_compartidos set venta_id = %L where id = %L', :'venta', :'t1')) ->> 'ok';
select pg_temp.intento(format('update retail.tickets_compartidos set venta_id = %L where id = %L', :'venta2', :'t1')) ->> 'ok';`,
  (l) => l.slice(-5).join(",") === "false,true,false,true,false"
);

// ===========================================================================
// T10 · Carrera real: dos equipos abren el mismo ticket a la vez
// ===========================================================================

function lanzar(sql) {
  return new Promise((resolver) => {
    const p = spawn("docker", PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolver({ code, out: out.trim(), err }));
    p.stdin.end(sql);
  });
}
const sesionConfirmada = (auth) => `set request.jwt.claim.sub = '${auth}';
set request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
set request.headers = '{}';
set role authenticated;
`;
{
  let preparado;
  try {
    preparado = psql(`
set request.jwt.claim.sub = '${FELIPE}';
select sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.ubicaciones (nombre, tipo, sede_dynamic_id)
  select 'ZZ Tickets carrera', 'tienda', :'sede_tru' where not exists (select 1 from retail.ubicaciones where nombre = 'ZZ Tickets carrera');
select id as sede from retail.ubicaciones where nombre = 'ZZ Tickets carrera' \\gset
${sesionConfirmada(FELIPE)}select retail.enviar_ticket_a_caja(gen_random_uuid(), :'sede', 'Carrera', ${BLUSAS}) ->> 'id';
`).trim();
  } catch (e) {
    preparado = null;
    esperar("T10 · preparar la carrera", false, `${e.stderr ?? ""}${e.message ?? ""}`);
  }
  if (preparado) {
    const id = preparado.split("\n").at(-1);
    const abre = (espera) => `${sesionConfirmada(FELIPE)}begin;
select (retail.tomar_ticket_compartido('${id}') ->> 'estado');
select pg_sleep(${espera});
commit;
`;
    const [a, b] = await Promise.all([lanzar(abre(1.2)), new Promise((r) => setTimeout(r, 300)).then(() => lanzar(abre(0)))]);
    const ganaron = [a, b].filter((x) => x.code === 0 && x.out.split("\n")[0] === "tomado").length;
    const perdio = [a, b].find((x) => x.code !== 0);
    esperar(
      "T10 · carrera con COMMIT: de dos equipos que abren el mismo ticket a la vez, uno se lo lleva y el otro recibe «ya lo abrió»",
      ganaron === 1 && !!perdio && /ya lo abri/.test(perdio.err),
      JSON.stringify({ a, b })
    );
  }
}

console.log(`\n${total - fallos}/${total} casos en verde.`);
process.exit(fallos ? 1 : 0);
