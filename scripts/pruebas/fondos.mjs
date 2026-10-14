#!/usr/bin/env node
/**
 * Prueba de los fondos por rendir (ADR-0362, fase 6 · actividades 1 y 2): `20261013181000_fondos_por_rendir_esquema.sql`,
 * `20261013182000_fondos_por_rendir_funciones.sql` y `20261013212000_fondos_pagar_desde_mi_fondo.sql`.
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
 *   · Actividad 2, pagar desde «Mi fondo»: la dueña paga un comprobante en Por pagar (y en «Pagar juntos») desde su fondo; baja su
 *     fondo, no toca ninguna caja, y el Diario lo saca de la 1413 (no de la 101). Si no alcanza, paga igual y el fondo queda en
 *     negativo: «CAYLA le debe» (decisión 32). Solo la dueña, con su cuenta y firmando ella: ni otra persona (tampoco el líder), ni
 *     eligiendo a otra en «Responsable», ni desde una terminal; con tarjeta, no. El fondo no sirve para ningún otro pago (el candado
 *     de la cuenta lo rechaza). Una entrega de la que ya se pagó no se anula, y el mensaje no pasa de lo entregado. `fn_mi_fondo`
 *     le dice a cada persona su fondo y su saldo; a quien no tiene, nada; a una terminal, nada.
 *
 * CÓMO. Igual que `ordenes_compra.mjs`: carga las migraciones dentro de cada caso (se pueden pegar dos veces), sesión simulada con
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
const MIGRACION = [
  "20261013181000_fondos_por_rendir_esquema.sql",
  "20261013182000_fondos_por_rendir_funciones.sql",
  "20261013212000_fondos_pagar_desde_mi_fondo.sql",
]
  .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"))
  .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder
// Solo de esta prueba: la cuenta de Ana (paga desde su fondo, actividad 2) y una terminal administrativa de Trujillo.
const ANA = "44444444-4444-4444-8444-0000000000a1";
const TERMINAL = "44444444-4444-4444-8444-0000000000f1";

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
-- Ana tiene cuenta propia: en la actividad 2 entra ella a pagar desde su fondo.
insert into auth.users (id, aud, role, email) values ('${ANA}', 'authenticated', 'authenticated', 'ana-fondos@prueba.local');
insert into public.personas (nombres, apellidos, sede_base_id, auth_user_id) values ('Ana', 'Prueba Fondos', :'sede_base', '${ANA}') returning id as ana_p \\gset
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

// ---------- Actividad 2: pagar desde «Mi fondo» ----------
// Felipe le entrega S/ 500 a Ana (`:fondo_ana`) y hay un comprobante a crédito de S/ 1,180 (`:compra`) de un proveedor del seed, de
// Trujillo. Ana tiene Por pagar en su rol, y el responsable obligatorio se apaga: así Ana firma con su cuenta sin marcar asistencia (el
// candado de la asistencia tiene su propia prueba). `pg_temp.paga` llama a la función de Por pagar: «OK» o «<sqlstate>|<hint>|<mensaje>».
const ESCENA_PAGO = `${como(FELIPE)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 500, 'Compras Gamarra', null, null) as entrega_ana \\gset
select c.id as fondo_ana from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p' \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
  values (:'prov', 'factura', 'FFD', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), retail.fn_hoy_lima() - 2, 'credito',
          retail.fn_hoy_lima() + 20, 1000, 180, 1180, 'mercaderia', :'tru') returning id as compra \\gset
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'por_pagar') on conflict do nothing;
update retail.configuracion_empresa set exige_responsable = false;
create function pg_temp.paga(p_compra uuid, p_cuenta uuid, p_monto numeric, p_metodo text default 'efectivo') returns text
language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_pagos_compra(p_compra, jsonb_build_array(jsonb_build_object('monto', p_monto, 'metodo', p_metodo, 'cuenta_id', p_cuenta)),
                                        null, gen_random_uuid());
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
${como(ANA)}${sinFirma}`;
// El asiento del Diario de un pago: «cuenta:debe:haber», en orden de cuenta (lo lee el líder).
const ASIENTO_DEL_PAGO = (pago) => `(select string_agg(a.cuenta || ':' || a.debe::numeric(12, 2) || ':' || a.haber::numeric(12, 2), ',' order by a.cuenta)
   from retail.fn_asientos(retail.fn_hoy_lima() - 3, retail.fn_hoy_lima(), null) a where a.asiento = 'pago_proveedor:' || ${pago})`;

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

  // ---------- Actividad 2: pagar desde «Mi fondo» ----------
  {
    nombre: "la dueña paga desde su fondo en Por pagar: baja su fondo, no toca ninguna caja y el Diario lo saca de la 1413 (no de la 101)",
    sql: `${ESCENA_PAGO}
select (retail.registrar_pagos_compra(:'compra', jsonb_build_array(jsonb_build_object('monto', 300, 'metodo', 'efectivo', 'cuenta_id', :'fondo_ana')),
                                      null, gen_random_uuid()))[1] as pago \\gset
select 'pago|' || (p.cuenta_dinero_id = :'fondo_ana')::text || '|' || (p.caja_movimiento_id is null)::text || '|' || (p.usuario_id = :'ana_p')::text
  from retail.compra_pagos p where p.id = :'pago';
select 'saldo|' || pg_temp.saldo(:'fondo_ana');
select 'mio|' || count(*) || '|' || coalesce(sum(m.saldo), 0) from retail.fn_mi_fondo() m where m.cuenta_id = :'fondo_ana';
select 'caja|' || count(*) from retail.caja_movimientos where created_at = now();
select 'debe|' || c.saldo from retail.compras c where c.id = :'compra';
${como(FELIPE)}${sinFirma}
select 'diario|' || ${ASIENTO_DEL_PAGO(":'pago'")};
select 'glosa|' || a.glosa from retail.fn_asientos(retail.fn_hoy_lima() - 3, retail.fn_hoy_lima(), null) a
 where a.asiento = 'pago_proveedor:' || :'pago' and a.haber > 0;
select 'cuadra|' || count(*) from retail.fn_asientos_descuadrados(retail.fn_hoy_lima() - 3, retail.fn_hoy_lima()) d where d.asiento = 'pago_proveedor:' || :'pago';
select 'tablero|' || f.saldo || '|' || f.entregado || '|' || f.gastado from retail.fn_fondos() f where f.persona_id = :'ana_p';`,
    revisa: (s) => {
      const e = [];
      if (!/^pago\|true\|true\|true$/m.test(s)) e.push(`el pago debía quedar sellado al fondo de Ana, sin egreso de caja y firmado por ella — ${linea("pago")(s)}`);
      if (!/^saldo\|200\.00$/m.test(s)) e.push(`al fondo le debían quedar 200 — ${linea("saldo")(s)}`);
      if (!/^mio\|1\|200\.00$/m.test(s)) e.push(`«Mi fondo» debía decir 200 — ${linea("mio")(s)}`);
      if (!/^caja\|0$/m.test(s)) e.push(`no debía tocar ninguna caja — ${linea("caja")(s)}`);
      if (!/^debe\|880\.00$/m.test(s)) e.push(`al comprobante le debían quedar 880 por pagar — ${linea("debe")(s)}`);
      if (!/^diario\|1413:0\.00:300\.00,421:300\.00:0\.00$/m.test(s)) e.push(`el Diario debía sacar el pago de la 1413 — ${linea("diario")(s)}`);
      if (!/^glosa\|Sale del fondo por rendir \(efectivo\)$/m.test(s)) e.push(`la glosa debía decir que sale del fondo — ${linea("glosa")(s)}`);
      if (!/^cuadra\|0$/m.test(s)) e.push(`el asiento del pago debía cuadrar — ${linea("cuadra")(s)}`);
      if (!/^tablero\|200\.00\|500\.00\|300\.00$/m.test(s)) e.push(`el tablero debía decir tiene 200, le entregaron 500 y gastó 300 — ${linea("tablero")(s)}`);
      return e;
    },
  },
  {
    nombre: "si no alcanza, paga igual: el fondo queda en negativo (CAYLA le debe), también en «Pagar juntos» con dos medios",
    sql: `${ESCENA_PAGO}
select 'paga|' || pg_temp.paga(:'compra', :'fondo_ana', 700);
select 'saldo|' || pg_temp.saldo(:'fondo_ana');
select 'juntos|' || (retail.registrar_pago_compras_medios(:'prov', jsonb_build_array(jsonb_build_object('compra_id', :'compra', 'monto', 180)),
  jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', 100, 'cuenta_id', :'fondo_ana'), jsonb_build_object('metodo', 'transferencia', 'monto', 80, 'cuenta_id', :'bcp')),
  null, gen_random_uuid()) is not null)::text;
select 'despues|' || pg_temp.saldo(:'fondo_ana') || '|' || pg_temp.saldo(:'bcp');
select 'mio|' || (select m.saldo from retail.fn_mi_fondo() m);
${como(FELIPE)}${sinFirma}
select 'tablero|' || f.saldo || '|' || f.gastado from retail.fn_fondos() f where f.persona_id = :'ana_p';`,
    revisa: (s) => {
      const e = [];
      if (!/^paga\|OK$/m.test(s)) e.push(`pagar más de lo que hay en el fondo no se frena (decisión 32) — ${linea("paga")(s)}`);
      if (!/^saldo\|-200\.00$/m.test(s)) e.push(`el fondo debía quedar en −200 — ${linea("saldo")(s)}`);
      if (!/^juntos\|true$/m.test(s)) e.push(`«Pagar juntos» debía aceptar un medio desde el fondo — ${linea("juntos")(s)}`);
      if (!/^despues\|-300\.00\|/m.test(s)) e.push(`con el Yape desde el fondo debía quedar en −300 — ${linea("despues")(s)}`);
      if (!/^mio\|-300\.00$/m.test(s)) e.push(`«Mi fondo» debía decir −300 (CAYLA le debe 300) — ${linea("mio")(s)}`);
      if (!/^tablero\|-300\.00\|800\.00$/m.test(s)) e.push(`el tablero debía decir −300 y gastó 800 — ${linea("tablero")(s)}`);
      return e;
    },
  },
  {
    nombre: "solo la dueña paga desde su fondo: ni otra persona (tampoco el líder), ni eligiendo a otra en «Responsable», ni desde una terminal; con tarjeta, no",
    sql: `${ESCENA_PAGO}
-- Asistencia de Dynamic: el banco de pruebas no tiene la tabla; en el CI ya existe (actor_firma la usa). Beto y Ana marcaron entrada.
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
select u.sede_dynamic_id as sede_tru from retail.ubicaciones u where u.id = :'tru' \\gset
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  select x, :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date from unnest(array[:'ana_p', :'beto_p']::uuid[]) x;
${como(SANDRA)}${sinFirma}
select 'lider|' || pg_temp.paga(:'compra', :'fondo_ana', 100);
${como(ANA)}
select set_config('request.headers', json_build_object('x-responsable', :'beto_p', 'x-ubicacion', :'tru')::text, true) \\g /dev/null
select 'otro_responsable|' || pg_temp.paga(:'compra', :'fondo_ana', 100);
insert into auth.users (id, aud, role, email) values ('${TERMINAL}', 'authenticated', 'authenticated', 'terminal-fondos@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values (:'tru', 'ZZ Terminal fondos', retail.fn_rol_por_clave('terminal_administrativa'), '${TERMINAL}');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('terminal_administrativa'), 'por_pagar') on conflict do nothing;
${como(TERMINAL)}
select set_config('request.headers', json_build_object('x-responsable', :'ana_p')::text, true) \\g /dev/null
select 'terminal|' || pg_temp.paga(:'compra', :'fondo_ana', 100);
select 'terminal_mio|' || count(*) from retail.fn_mi_fondo();
${como(ANA)}${sinFirma}
select 'tarjeta|' || pg_temp.intento(format('insert into retail.compra_pagos (compra_id, fecha, monto, metodo, cuenta_dinero_id) values (%L, retail.fn_hoy_lima(), 10, %L, %L)',
  :'compra', 'tarjeta', :'fondo_ana'));
select 'pagos|' || count(*) from retail.compra_pagos where compra_id = :'compra';`,
    revisa: (s) => {
      const e = [];
      if (!/^lider\|42501\|fondo_ajeno\|Desde un fondo paga solo su dueña: «Fondo · Ana Prueba Fondos» no es el tuyo\.$/m.test(s)) e.push(`lider — ${linea("lider")(s)}`);
      if (!/^otro_responsable\|42501\|fondo_ajeno\|Desde tu fondo pagas tú: elige tu nombre en «Responsable»\.$/m.test(s)) e.push(`otro_responsable — ${linea("otro_responsable")(s)}`);
      if (!/^terminal\|42501\|fondo_ajeno\|Desde un fondo se paga solo con la cuenta de su dueña, no desde una terminal\.$/m.test(s)) e.push(`terminal — ${linea("terminal")(s)}`);
      if (!/^terminal_mio\|0$/m.test(s)) e.push(`una terminal no tiene fondo — ${linea("terminal_mio")(s)}`);
      if (!/^tarjeta\|P0001\|\|Desde un fondo se paga en efectivo, Yape, Plin, transferencia o depósito\.$/m.test(s)) e.push(`tarjeta — ${linea("tarjeta")(s)}`);
      if (!/^pagos\|0$/m.test(s)) e.push(`ningún intento debía escribir un pago — ${linea("pagos")(s)}`);
      return e;
    },
  },
  {
    nombre: "el fondo no sirve para ningún otro pago (gastos, activos, Producción, lo pasado): el candado de la cuenta lo rechaza",
    sql: `${ESCENA_PAGO}
select 'sellada|' || pg_temp.intento(format('select retail.fn_cuenta_sellada(%L, %L, %L, retail.fn_hoy_lima(), %L)', 'pago', 'efectivo', :'tru', :'fondo_ana'));
select 'yape|' || pg_temp.intento(format('select retail.fn_cuenta_sellada(%L, %L, %L, retail.fn_hoy_lima(), %L)', 'pago', 'yape', :'tru', :'fondo_ana'));
select 'elegir|' || count(*) from retail.fn_cuentas_para_elegir('pago', :'tru') c where c.tipo = 'fondo';`,
    revisa: (s) => [
      !/^sellada\|P0001\|\|En efectivo, la plata sale o entra de un cajón, una caja fuerte o el efectivo por rendir: «Fondo · Ana Prueba Fondos» no guarda efectivo\.$/m.test(s) && `sellada — ${linea("sellada")(s)}`,
      !/^yape\|P0001\|\|Con Yape, la plata va por un banco o billetera: «Fondo · Ana Prueba Fondos» no lo es\.$/m.test(s) && `yape — ${linea("yape")(s)}`,
      !/^elegir\|0$/m.test(s) && `«¿De dónde sale la plata?» no lista fondos (los pagos de Compras lo suman con fn_mi_fondo) — ${linea("elegir")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "una entrega de la que ya se pagó no se anula, y el mensaje no pasa de lo entregado",
    sql: `${ESCENA_PAGO}
select 'paga|' || pg_temp.paga(:'compra', :'fondo_ana', 700);
${como(FELIPE)}${firma("fondo_anular")}
select 'anula|' || pg_temp.anula(:'entrega_ana', 'Fue un error');`,
    revisa: (s) => [
      !/^paga\|OK$/m.test(s) && `paga — ${linea("paga")(s)}`,
      !/^anula\|P0001\|fondo_insuficiente\|De esa entrega ya salieron S\/ 500\.00 \(lo que se devolvió o se pagó con ella\): anularla dejaría el fondo en S\/ -700\.00\.$/m.test(s) &&
        `anula — ${linea("anula")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "«Mi fondo»: cada persona ve el suyo y su saldo; quien no tiene fondo, nada",
    sql: `${ESCENA_PAGO}
select 'ana|' || count(*) || '|' || coalesce(sum(m.saldo), 0) || '|' || string_agg(m.nombre, ',') from retail.fn_mi_fondo() m;
${como(SANDRA)}${sinFirma}
select 'sandra|' || count(*) from retail.fn_mi_fondo() m where m.cuenta_id = :'fondo_ana';`,
    revisa: (s) => [
      !/^ana\|1\|500\.00\|Fondo · Ana Prueba Fondos$/m.test(s) && `ana — ${linea("ana")(s)}`,
      !/^sandra\|0$/m.test(s) && `otra persona no ve el fondo de Ana — ${linea("sandra")(s)}`,
    ].filter(Boolean),
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
