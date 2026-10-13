#!/usr/bin/env node
/**
 * Prueba de los fondos por rendir (ADR-0362, fase 6 · actividad 1): `20261013181000_fondos_por_rendir_esquema.sql` y
 * `20261013182000_fondos_por_rendir_funciones.sql`.
 *
 * QUÉ PROMETE
 *   · El módulo es la llave: sin «Fondos por rendir» no se lee ni se escribe nada (42501).
 *   · Entregar plata crea el fondo de la persona la primera vez (tipo `fondo`, cuenta contable 1413) y después suma en el mismo;
 *     el saldo sale del mismo libro que «Cuentas y dinero»; el banco baja lo mismo que el fondo sube.
 *   · Nadie se entrega plata a sí mismo (con la cuenta con la que entró ni eligiéndose en el combo); nadie registra su propia
 *     devolución ni anula la plata de su propio fondo.
 *   · La plata sale de un banco, una caja fuerte o lo que tiene el líder (esto último, solo el líder) y vuelve a esas mismas.
 *   · Una devolución no supera lo que la persona tiene; anular una entrega no deja el fondo en negativo.
 *   · El mismo token no duplica; sin «para qué», monto cero o fecha futura, no se guarda.
 *   · Las funciones de dinero de siempre: el validador rechaza mover un fondo con otro tipo de movimiento; `registrar_movimiento_dinero`
 *     no acepta los tipos nuevos; «Cuentas y dinero» no anula la plata de un fondo; el fondo no aparece en «¿De dónde sale la plata?»;
 *     la dueña y el tipo de un fondo no cambian y no se archiva.
 *   · La firma de la decisión 39: con la cuenta de una persona y el responsable obligatorio encendido, sin la clave de la acción no se
 *     guarda (responsable_requerido); con la clave, firma ella.
 *
 * CÓMO. Igual que `ordenes_compra.mjs`: carga las dos migraciones dentro de cada caso (se pueden pegar dos veces), sesión simulada con
 * `request.jwt.claim.sub` y ROLLBACK siempre: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:fondos                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/fondos.mjs --contenedor <otro>   → contra otro contenedor (el banco de pruebas, por ejemplo)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const MIGRACION = ["20261013181000_fondos_por_rendir_esquema.sql", "20261013182000_fondos_por_rendir_funciones.sql"]
  .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
  .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
// La clave de la acción que la pantalla manda cuando una persona firma sin combo (decisión 39).
const firma = (clave) => `select set_config('request.headers', '${JSON.stringify({ "x-responsable-omitido": clave })}', true) \\g /dev/null\n`;
const sinFirma = `select set_config('request.headers', '{}', true) \\g /dev/null\n`;
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinCandadosDePegado(MIGRACION)}
${sinCandadosDePegado(MIGRACION)}
set local search_path = retail, public, extensions;

-- «SIN_ERROR» o «<sqlstate>|<hint>|<mensaje>».
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
-- Lo que tiene una cuenta hoy, del mismo libro que «Cuentas y dinero».
create function pg_temp.saldo(p_id uuid) returns numeric language sql as $f$
  select coalesce((select c.saldo_inicial from retail.cuentas_dinero c where c.id = p_id), 0)
       + coalesce((select sum(l.monto) from retail.fn_dinero_libro(retail.fn_hoy_lima()) l
                    where l.cuenta_id = p_id
                      and l.fecha >= coalesce((select c.saldo_desde from retail.cuentas_dinero c where c.id = p_id), '1900-01-01')), 0);
$f$;

-- Las tres acciones, con sus valores como parámetros: «OK» o «<sqlstate>|<hint>|<mensaje>» (lo fallido no deja nada).
create function pg_temp.entrega(p_persona uuid, p_origen uuid, p_monto numeric, p_motivo text default 'Compras Gamarra',
                                p_fecha date default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.entregar_fondo(p_persona, p_origen, p_monto, p_motivo, p_fecha, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.devuelve(p_persona uuid, p_destino uuid, p_monto numeric, p_nota text default null) returns text
language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.devolver_fondo(p_persona, p_destino, p_monto, p_nota, null, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.anula(p_id uuid, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.anular_movimiento_fondo(p_id, p_motivo);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

-- Como en producción (20260923160000): el responsable obligatorio encendido.
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select p.id as sandra_p from public.personas p where p.auth_user_id = '${SANDRA}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as fuerte_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'caja_fuerte' \\gset
select id as cajon_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'cajon' \\gset
select id as rendir from retail.cuentas_dinero where tipo = 'por_rendir' \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden)
  values ('BCP prueba fondos', 'banco', '104', 5000, retail.fn_hoy_lima() - 30, 60) returning id as bcp \\gset
-- Dos personas del equipo solo de esta prueba (Ana y Beto, de Trujillo): reciben la plata. Así nada depende de los fondos que ya
-- tenga la base (una prueba en el navegador deja fondos de verdad en el banco). Felipe entrega; Micaela, con el módulo, también.
select p.sede_base_id as sede_base from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
insert into public.personas (nombres, apellidos, sede_base_id) values ('Ana', 'Prueba Fondos', :'sede_base') returning id as ana_p \\gset
insert into public.personas (nombres, apellidos, sede_base_id) values ('Beto', 'Prueba Fondos', :'sede_base') returning id as beto_p \\gset
insert into retail.colaboradores (persona_id, rol, rol_id, ubicacion_asignada_id, estado)
  select x, 'colaborador', retail.fn_rol_por_clave('integrante'), :'tru', 'activo' from unnest(array[:'ana_p', :'beto_p']::uuid[]) x;
-- Micaela con el módulo Fondos en su rol, para los casos de una persona que no es líder.
create function pg_temp.dar_fondos_a_micaela() returns void language sql as $f$
  insert into retail.rol_modulos (rol_id, modulo)
  select c.rol_id, 'fondos' from retail.colaboradores c join public.personas p on p.id = c.persona_id
   where p.auth_user_id = '${MICAELA}'
  on conflict do nothing;
$f$;
`;

// Una entrega directa (cuando el caso necesita el id que devuelve). Por defecto, de Felipe a Ana desde el BCP de la prueba.
const entrega = (monto, { persona = ":'ana_p'", origen = ":'bcp'", motivo = "'Compras Gamarra'", token = "null", fecha = "null" } = {}) =>
  `retail.entregar_fondo(${persona}, ${origen}, ${monto}, ${motivo}, ${fecha}, ${token})`;
const linea = (clave) => (s) => s.match(new RegExp(`^${clave}\\|.*$`, "m"))?.[0] ?? `${clave}: (sin salida)`;
// Los movimientos de dinero escritos en ESTE caso (dentro de la transacción `now()` no cambia).
const NUEVOS = "(select count(*) from retail.movimientos_dinero d where d.created_at = now())";

const CASOS = [
  {
    nombre: "sin el módulo Fondos no se lee ni se entrega (42501)",
    sql: `${como(MICAELA)}${firma("fondo_entregar")}
select 'leer|' || pg_temp.intento('select * from retail.fn_fondos()');
select 'mov|' || pg_temp.intento('select * from retail.fn_fondos_movimientos()');
select 'opc|' || pg_temp.intento('select retail.fn_fondos_opciones()');
select 'dar|' || pg_temp.entrega(:'beto_p', :'bcp', 100);`,
    revisa: (s) => ["leer", "mov", "opc", "dar"].filter((k) => !new RegExp(`^${k}\\|42501\\|`, "m").test(s)).map((k) => `${k}: se esperaba 42501 — ${linea(k)(s)}`),
  },
  {
    nombre: "la primera entrega crea el fondo (1413) y la segunda suma en el mismo; el banco baja lo que el fondo sube",
    sql: `${como(FELIPE)}${firma("fondo_entregar")}
select pg_temp.saldo(:'bcp') as bcp_antes \\gset
select coalesce((select o.saldo from retail.fn_bal_otro_camino(retail.fn_hoy_lima()) o where o.cuenta = '1413'), 0) as camino_antes \\gset
-- La primera, ayer: dos entregas de la misma transacción tienen la misma hora y «la última» quedaría empatada.
select ${entrega(500, { fecha: "retail.fn_hoy_lima() - 1" })} as m1 \\gset
select ${entrega(300, { motivo: "'Viaje a Lima'" })} as m2 \\gset
select 'fondos|' || count(*) from retail.cuentas_dinero where tipo = 'fondo' and persona_id = :'ana_p';
select 'cuenta|' || c.tipo || '|' || c.cuenta_contable || '|' || c.nombre from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p';
select 'tablero|' || f.saldo || '|' || f.entregado || '|' || f.devuelto || '|' || f.gastado || '|' || f.ultimo_motivo || '|' || f.es_mio || '|' || f.primera_entrega || '|' || f.ultima_entrega
  from retail.fn_fondos() f where f.persona_id = :'ana_p';
select 'esperado_fechas|' || (retail.fn_hoy_lima() - 1) || '|' || retail.fn_hoy_lima();
select 'banco|' || (:'bcp_antes'::numeric - pg_temp.saldo(:'bcp'));
select 'movs|' || count(*) || '|' || string_agg(m.tipo || ':' || m.monto || ':' || m.cuenta_nombre || ':' || m.puede_anular, ',' order by m.monto)
  from retail.fn_fondos_movimientos(:'ana_p') m;
select 'libro|' || string_agg(distinct l.detalle, ',') from retail.fn_dinero_libro(retail.fn_hoy_lima()) l
 where l.cuenta_id = (select c.id from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p');
select 'otro_camino|' || (coalesce((select o.saldo from retail.fn_bal_otro_camino(retail.fn_hoy_lima()) o where o.cuenta = '1413'), 0) - :'camino_antes'::numeric);`,
    revisa: (s) => {
      const e = [];
      const fechas = linea("esperado_fechas")(s).split("|");
      if (!/^fondos\|1$/m.test(s)) e.push(`se esperaba un solo fondo para Ana — ${linea("fondos")(s)}`);
      if (!/^cuenta\|fondo\|1413\|Fondo · Ana Prueba Fondos$/m.test(s)) e.push(`el fondo debía ser tipo fondo, cuenta 1413 y llamarse «Fondo · Ana Prueba Fondos» — ${linea("cuenta")(s)}`);
      if (linea("tablero")(s) !== `tablero|800.00|800.00|0|0.00|Viaje a Lima|false|${fechas[1]}|${fechas[2]}`) e.push(`tablero inesperado — ${linea("tablero")(s)}`);
      if (!/^banco\|800\.00$/m.test(s)) e.push(`el BCP debía bajar 800 — ${linea("banco")(s)}`);
      if (!/^movs\|2\|entrega_fondo:300\.00:BCP prueba fondos:true,entrega_fondo:500\.00:BCP prueba fondos:true$/m.test(s))
        e.push(`movimientos inesperados — ${linea("movs")(s)}`);
      if (!/^libro\|Entrega de fondo · Compras Gamarra,Entrega de fondo · Viaje a Lima$/m.test(s)) e.push(`el libro debía decir «Entrega de fondo» — ${linea("libro")(s)}`);
      if (!/^otro_camino\|800\.00$/m.test(s)) e.push(`el Balance (otro camino) debía subir 800 en la 1413 — ${linea("otro_camino")(s)}`);
      return e;
    },
  },
  {
    nombre: "el mismo token no duplica la entrega",
    sql: `${como(FELIPE)}${firma("fondo_entregar")}
select gen_random_uuid() as tok \\gset
select ${entrega(250, { token: ":'tok'" })} as a \\gset
select ${entrega(250, { token: ":'tok'" })} as b \\gset
select 'igual|' || (:'a' = :'b')::text;
select 'cuantos|' || count(*) from retail.movimientos_dinero where token_cliente = :'tok';`,
    revisa: (s) => [
      !/^igual\|true$/m.test(s) && `el segundo intento debía devolver el mismo movimiento — ${linea("igual")(s)}`,
      !/^cuantos\|1$/m.test(s) && `debía haber un solo movimiento — ${linea("cuantos")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "nadie se entrega plata a sí mismo: ni con su cuenta ni eligiéndose en el combo",
    sql: `${como(FELIPE)}${firma("fondo_entregar")}
select 'propia|' || pg_temp.entrega(:'felipe_p', :'bcp', 100);
select set_config('request.headers', json_build_object('x-responsable', :'ana_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null
select 'combo|' || pg_temp.entrega(:'ana_p', :'bcp', 100);
select 'nuevos|' || ${NUEVOS};`,
    revisa: (s) => {
      const e = [];
      if (!/^propia\|42501\|fondo_propio\|Nadie se entrega plata a sí mismo/m.test(s)) e.push(`propia — ${linea("propia")(s)}`);
      // Con Ana elegida en el combo: o el candado del fondo propio, o el de asistencia (no marcó su entrada); nunca «OK».
      if (/^combo\|OK$/m.test(s)) e.push("eligiendo a la dueña en el combo, la entrega no debía pasar");
      if (!/^nuevos\|0$/m.test(s)) e.push(`no debía escribirse ningún movimiento — ${linea("nuevos")(s)}`);
      return e;
    },
  },
  {
    nombre: "lo que no se guarda: sin para qué, monto cero, fecha futura, desde el cajón o desde otro fondo, a quien no es del equipo",
    sql: `${como(FELIPE)}${firma("fondo_entregar")}
select ${entrega(100, { persona: ":'beto_p'" })} as _s \\gset
select c.id as fondo_beto from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'beto_p' \\gset
select 'motivo|' || pg_temp.entrega(:'ana_p', :'bcp', 100, '   ');
select 'cero|' || pg_temp.entrega(:'ana_p', :'bcp', 0);
select 'futura|' || pg_temp.entrega(:'ana_p', :'bcp', 100, 'Compras', retail.fn_hoy_lima() + 1);
select 'cajon|' || pg_temp.entrega(:'ana_p', :'cajon_tru', 100);
select 'otro_fondo|' || pg_temp.entrega(:'ana_p', :'fondo_beto', 100);
select 'nadie|' || pg_temp.entrega(gen_random_uuid(), :'bcp', 100);
select 'ana|' || count(*) from retail.cuentas_dinero where tipo = 'fondo' and persona_id = :'ana_p';`,
    revisa: (s) => {
      const espera = {
        motivo: "Di para qué es la plata",
        cero: "El monto tiene que ser mayor que cero",
        futura: "La fecha no puede ser futura",
        cajon: "sale de un banco, de una caja fuerte o de lo que tiene el líder",
        otro_fondo: "sale de un banco, de una caja fuerte o de lo que tiene el líder",
        nadie: "una persona activa del equipo",
      };
      const e = Object.entries(espera).filter(([k, txt]) => !linea(k)(s).includes(txt)).map(([k]) => linea(k)(s));
      if (!/^ana\|0$/m.test(s)) e.push(`ningún intento fallido debía crear el fondo de Ana — ${linea("ana")(s)}`);
      return e;
    },
  },
  {
    nombre: "lo que tiene el líder solo lo entrega el líder; una persona con el módulo entrega desde el banco o la caja fuerte",
    sql: `select pg_temp.dar_fondos_a_micaela();
${como(FELIPE)}${firma("fondo_entregar")}
select 'lider_rendir|' || pg_temp.entrega(:'beto_p', :'rendir', 50);
${como(MICAELA)}${firma("fondo_entregar")}
select 'mica_rendir|' || pg_temp.entrega(:'beto_p', :'rendir', 50);
select 'mica_fuerte|' || pg_temp.entrega(:'beto_p', :'fuerte_tru', 50);
select 'mica_propia|' || pg_temp.entrega(:'micaela_p', :'bcp', 50);
select 'opc_rendir|' || ((retail.fn_fondos_opciones() -> 'cuentas')::text like '%por_rendir%')::text;
select 'opc_yo|' || ((retail.fn_fondos_opciones() ->> 'yo') = :'micaela_p')::text;`,
    revisa: (s) => {
      const e = [];
      if (!/^lider_rendir\|OK$/m.test(s)) e.push(`el líder debía poder entregar lo que tiene — ${linea("lider_rendir")(s)}`);
      if (!/^mica_rendir\|42501\|\|Lo que tiene el líder solo lo mueve el líder/m.test(s)) e.push(`mica_rendir — ${linea("mica_rendir")(s)}`);
      if (!/^mica_fuerte\|OK$/m.test(s)) e.push(`con el módulo se entrega desde una caja fuerte — ${linea("mica_fuerte")(s)}`);
      if (!/^mica_propia\|42501\|fondo_propio\|/m.test(s)) e.push(`mica_propia — ${linea("mica_propia")(s)}`);
      if (!/^opc_rendir\|false$/m.test(s)) e.push(`quien no es líder no debía ver «lo que tiene el líder» — ${linea("opc_rendir")(s)}`);
      if (!/^opc_yo\|true$/m.test(s)) e.push(`las opciones debían decir quién es «yo» — ${linea("opc_yo")(s)}`);
      return e;
    },
  },
  {
    nombre: "devolver: hasta lo que tiene, a un banco o una caja fuerte, y la registra quien recibe, no la dueña",
    sql: `select pg_temp.dar_fondos_a_micaela();
${como(FELIPE)}${firma("fondo_entregar")}
select ${entrega(500)} as _e \\gset
${firma("fondo_devolver")}
select 'devuelve|' || pg_temp.devuelve(:'ana_p', :'fuerte_tru', 120, 'Lo que sobró');
select 'demas|' || pg_temp.devuelve(:'ana_p', :'bcp', 400);
select 'sin_fondo|' || pg_temp.devuelve(:'beto_p', :'bcp', 10);
select 'al_cajon|' || pg_temp.devuelve(:'ana_p', :'cajon_tru', 10);
select 'tablero|' || f.saldo || '|' || f.entregado || '|' || f.devuelto || '|' || f.gastado from retail.fn_fondos() f where f.persona_id = :'ana_p';
${como(MICAELA)}${firma("fondo_devolver")}
select 'la_duena|' || pg_temp.devuelve(:'micaela_p', :'bcp', 10);`,
    revisa: (s) => {
      const e = [];
      if (!/^devuelve\|OK$/m.test(s)) e.push(`devuelve — ${linea("devuelve")(s)}`);
      if (!/^demas\|P0001\|fondo_insuficiente\|Tiene S\/ 380\.00 en su fondo/m.test(s)) e.push(`demas — ${linea("demas")(s)}`);
      if (!/^sin_fondo\|P0001\|\|Esa persona no tiene fondo/m.test(s)) e.push(`sin_fondo — ${linea("sin_fondo")(s)}`);
      if (!/^al_cajon\|P0001\|\|Lo que se devuelve de un fondo vuelve a un banco/m.test(s)) e.push(`al_cajon — ${linea("al_cajon")(s)}`);
      if (!/^tablero\|380\.00\|500\.00\|120\.00\|0\.00$/m.test(s)) e.push(`tablero — ${linea("tablero")(s)}`);
      if (!/^la_duena\|42501\|fondo_propio\|/m.test(s)) e.push(`la_duena — ${linea("la_duena")(s)}`);
      return e;
    },
  },
  {
    nombre: "anular: con motivo, en Fondos (no en Cuentas y dinero), no la dueña, y una entrega de la que ya salió plata no se des-entrega",
    sql: `select pg_temp.dar_fondos_a_micaela();
${como(FELIPE)}${firma("fondo_entregar")}
select ${entrega(500)} as e1 \\gset
select ${entrega(200)} as e2 \\gset
select ${entrega(50, { persona: ":'micaela_p'" })} as em \\gset
${firma("fondo_devolver")}
select retail.devolver_fondo(:'ana_p', :'bcp', 450) as d1 \\gset
${firma("fondo_anular")}
select 'sin_motivo|' || pg_temp.anula(:'e2', ' ');
select 'usada|' || pg_temp.anula(:'e1', 'Fue a otra persona');
select 'en_dinero|' || pg_temp.intento($$select retail.anular_movimiento_dinero('$$ || :'e2' || $$', 'Error')$$);
select 'puede_dinero|' || (select m.puede_anular from retail.fn_movimientos_dinero(null, 500) m where m.id = :'e2')::text;
select 'anula_dev|' || pg_temp.anula(:'d1', 'No llegó al banco');
select 'anula_e1|' || pg_temp.anula(:'e1', 'Fue a otra persona');
select 'otra_vez|' || pg_temp.anula(:'e1', 'Fue a otra persona');
select 'tablero|' || f.saldo || '|' || f.entregado || '|' || f.devuelto from retail.fn_fondos() f where f.persona_id = :'ana_p';
${como(MICAELA)}${firma("fondo_anular")}
select 'la_duena|' || pg_temp.anula(:'em', 'Me equivoqué');
select 'mov_duena|' || m.puede_anular from retail.fn_fondos_movimientos(:'micaela_p') m where m.id = :'em';`,
    revisa: (s) => {
      const e = [];
      if (!/^sin_motivo\|P0001\|\|Di por qué se anula/m.test(s)) e.push(`sin_motivo — ${linea("sin_motivo")(s)}`);
      if (!/^usada\|P0001\|fondo_insuficiente\|De esa entrega ya salieron S\/ 250\.00 \(lo que se devolvió o se pagó con ella\)/m.test(s)) e.push(`usada — ${linea("usada")(s)}`);
      if (!/^en_dinero\|P0001\|\|La plata de un fondo se anula en Compras/m.test(s)) e.push(`en_dinero — ${linea("en_dinero")(s)}`);
      if (!/^puede_dinero\|false$/m.test(s)) e.push(`Cuentas y dinero no debía ofrecer anular la plata de un fondo — ${linea("puede_dinero")(s)}`);
      if (!/^anula_dev\|OK$/m.test(s)) e.push(`anula_dev — ${linea("anula_dev")(s)}`);
      if (!/^anula_e1\|OK$/m.test(s)) e.push(`con la devolución anulada, la entrega ya se podía anular — ${linea("anula_e1")(s)}`);
      if (!/^otra_vez\|P0001\|\|Ese movimiento ya estaba anulado/m.test(s)) e.push(`otra_vez — ${linea("otra_vez")(s)}`);
      if (!/^tablero\|200\.00\|200\.00\|0$/m.test(s)) e.push(`tablero — ${linea("tablero")(s)}`);
      if (!/^la_duena\|42501\|fondo_propio\|/m.test(s)) e.push(`la_duena — ${linea("la_duena")(s)}`);
      if (!/^mov_duena\|false$/m.test(s)) e.push(`la dueña no debía ver «anular» en su propio fondo — ${linea("mov_duena")(s)}`);
      return e;
    },
  },
  {
    nombre: "las funciones de siempre: el validador, el registro genérico, «¿De dónde sale la plata?» y el candado de la cuenta",
    sql: `${como(FELIPE)}${firma("fondo_entregar")}
select ${entrega(300)} as _e \\gset
select c.id as fondo from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p' \\gset
select 'deposito|' || pg_temp.intento($$insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto)
  values ('deposito', retail.fn_hoy_lima(), '$$ || :'fondo' || $$', '$$ || :'bcp' || $$', 10)$$);
select 'entre|' || pg_temp.intento($$insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, cuenta_destino_id, monto)
  values ('entrega_fondo', retail.fn_hoy_lima(), '$$ || :'bcp' || $$', '$$ || :'fuerte_tru' || $$', 10)$$);
select 'dueno|' || pg_temp.intento($$insert into retail.movimientos_dinero (tipo, fecha, cuenta_destino_id, monto)
  values ('aporte', retail.fn_hoy_lima(), '$$ || :'fondo' || $$', 10)$$);
select 'generico|' || pg_temp.intento($$select retail.registrar_movimiento_dinero('entrega_fondo', 10, '$$ || :'bcp' || $$', '$$ || :'fondo' || $$')$$);
select 'elegir|' || count(*) from retail.fn_cuentas_para_elegir('pago', :'tru') e where e.tipo = 'fondo';
select 'duena|' || pg_temp.intento($$update retail.cuentas_dinero set persona_id = '$$ || :'beto_p' || $$' where id = '$$ || :'fondo' || $$'$$);
select 'archivar|' || pg_temp.intento($$update retail.cuentas_dinero set archivada_en = now() where id = '$$ || :'fondo' || $$'$$);
select 'a_banco|' || pg_temp.intento($$select set_config('retail.editando_cuenta', 'si', true); update retail.cuentas_dinero set tipo = 'banco', cuenta_contable = '104', persona_id = null where id = '$$ || :'fondo' || $$'$$);
select 'otro_fondo|' || pg_temp.intento($$insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, persona_id) values ('Fondo doble', 'fondo', '1413', '$$ || :'ana_p' || $$')$$);
select 'fondo_101|' || pg_temp.intento($$insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, persona_id) values ('Fondo caja', 'fondo', '101', '$$ || :'beto_p' || $$')$$);
select 'sin_duena|' || pg_temp.intento($$insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Fondo huérfano', 'fondo', '1413')$$);`,
    revisa: (s) => {
      const e = [];
      for (const k of ["deposito", "entre", "dueno"]) if (!new RegExp(`^${k}\\|P0001\\|\\|Ese movimiento no va entre esas cuentas`, "m").test(s)) e.push(`${k} — ${linea(k)(s)}`);
      if (!/^generico\|P0001\|\|Di qué pasó con la plata/m.test(s)) e.push(`generico — ${linea("generico")(s)}`);
      if (!/^elegir\|0$/m.test(s)) e.push(`el fondo no debía aparecer en «¿De dónde sale la plata?» — ${linea("elegir")(s)}`);
      if (!/^duena\|P0001\|\|Un fondo es de una persona/m.test(s)) e.push(`duena — ${linea("duena")(s)}`);
      if (!/^archivar\|P0001\|\|Un fondo no se archiva desde aquí/m.test(s)) e.push(`archivar — ${linea("archivar")(s)}`);
      if (!/^a_banco\|P0001\|\|Un fondo es de una persona/m.test(s)) e.push(`a_banco — ${linea("a_banco")(s)}`);
      if (!/^otro_fondo\|23505\|/m.test(s)) e.push(`una persona no tiene dos fondos vivos — ${linea("otro_fondo")(s)}`);
      if (!/^fondo_101\|23514\|/m.test(s)) e.push(`un fondo va a la 1413 — ${linea("fondo_101")(s)}`);
      if (!/^sin_duena\|23514\|/m.test(s)) e.push(`un fondo sin dueña no existe — ${linea("sin_duena")(s)}`);
      return e;
    },
  },
  {
    nombre: "la firma (decisión 39): con el responsable obligatorio, una persona sin la clave de la acción no guarda; con ella, firma ella",
    sql: `${como(MICAELA)}
select pg_temp.dar_fondos_a_micaela();
${sinFirma}
select 'sin_clave|' || pg_temp.entrega(:'beto_p', :'bcp', 100);
${firma("fondo_entregar")}
select ${entrega(100, { persona: ":'beto_p'" })} as m \\gset
select 'firma|' || (registrado_por = :'micaela_p')::text from retail.movimientos_dinero where id = :'m';
select 'clave|' || count(*) from retail.acciones_sin_responsable where clave in ('fondo_entregar', 'fondo_devolver', 'fondo_anular');`,
    revisa: (s) => {
      const e = [];
      if (!/^sin_clave\|42501\|responsable_requerido\|/m.test(s)) e.push(`sin la clave debía pedir el responsable — ${linea("sin_clave")(s)}`);
      if (!/^firma\|true$/m.test(s)) e.push(`la entrega debía quedar firmada por quien entró — ${linea("firma")(s)}`);
      if (!/^clave\|3$/m.test(s)) e.push(`faltan claves en acciones_sin_responsable — ${linea("clave")(s)}`);
      return e;
    },
  },
];

let fallas = 0;
for (const caso of CASOS) {
  const r = correr(`${PRELUDIO}\n${caso.sql}\nrollback;\n`);
  if (!r.ok) {
    fallas++;
    console.log(`✗ ${caso.nombre}\n    la base respondió con error:\n    ${r.mensaje.split("\n").slice(0, 6).join("\n    ")}`);
    continue;
  }
  const errores = caso.revisa(r.salida);
  if (errores.length) {
    fallas++;
    console.log(`✗ ${caso.nombre}\n    ${errores.join("\n    ")}`);
  } else {
    console.log(`✓ ${caso.nombre}`);
  }
}
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos de fondos por rendir pasan.`);
process.exit(fallas ? 1 : 0);
