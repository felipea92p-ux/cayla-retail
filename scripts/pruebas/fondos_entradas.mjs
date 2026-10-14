#!/usr/bin/env node
/**
 * Prueba de lo que la base del fondo NO acepta (ADR-0362, fase 6; /chaos 2026-10-14, semilla 1014): `20261014192000` y `193000`
 * (montos y datos válidos), `194000` (el token sigue al contenido), `200000` (la sede del gasto del viaje) y `212000` (el tope de una
 * devolución con la rendición por aprobar, /formidable 2026-10-14), sobre las del fondo (181000 … 20261014170000).
 *
 * QUÉ PROMETE
 *   · Un monto que no es un número (NaN, infinito) no entra a la plata: ni por las funciones del fondo (que lo dicen con
 *     `monto_invalido`) ni directo a la tabla (el candado `*_montos_finitos`), tampoco por «Cuentas y dinero».
 *   · Céntimos y tamaño: más de 2 decimales se rechaza en entregar y devolver (antes se redondeaba en silencio); diez mil millones o
 *     más es «demasiado grande».
 *   · Fechas: la plata de un fondo y un gasto del viaje no son de antes del 13/10/2026 (`fecha_antes_de_los_fondos`).
 *   · Textos: un «para qué», una nota de «Otro» o un motivo hecho solo de caracteres invisibles es un texto vacío; el motivo de anular
 *     una entrega tiene 200 letras como máximo.
 *   · El token sigue al contenido en las cinco funciones del fondo: el mismo token con lo mismo devuelve lo mismo; con otra cosa,
 *     `token_reusado`. `fn_resolver_intento` revisa esas cinco: `hecho` a quien tiene el módulo o es la persona del fondo, `intento_ajeno`
 *     a otra, y un envío dado por no llegado ya no entra (`intento_descartado`).
 *   · Con una rendición por aprobar, una devolución no pasa de lo que la persona tiene en la mano (el saldo menos su faltante): devolver
 *     «lo de los libros» y aprobar después dejaba el fondo debiendo y debido por la misma plata.
 *
 * CÓMO. Como `deuda_fondo.mjs`: carga sus migraciones dentro de cada caso (dos veces: se pueden pegar dos veces), sesión simulada con
 * `request.jwt.claim.sub` y ROLLBACK siempre: nada queda escrito. `--sin-arreglo` corre los mismos casos SIN cargar las migraciones,
 * para ver que la prueba atrapa lo que /chaos encontró (tiene que fallar).
 *
 * USO
 *   pnpm pruebas:fondos-entradas                                    → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/fondos_entradas.mjs --contenedor <otro>    → contra otro contenedor (el banco de pruebas, por ejemplo)
 *   node scripts/pruebas/fondos_entradas.mjs --sin-arreglo          → sin las migraciones (tiene que fallar)
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
const SIN_ARREGLO = process.argv.includes("--sin-arreglo");
const MIGRACIONES = SIN_ARREGLO
  ? []
  : [
      "20261014192000_fondos_montos_validos_parte1.sql",
      "20261014193000_fondos_montos_validos_parte2.sql",
      "20261014194000_fondos_token_sigue_al_contenido.sql",
      "20261014200000_gasto_viaje_sede_para_la_caja.sql",
      "20261014212000_devolucion_tope_rendicion_por_aprobar.sql",
    ].map(
      (f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8"),
    );

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo (seed), sin Fondos por rendir
// Solo de esta prueba: Ana compra (integrante con su cuenta) y Beto le entrega la plata (líder, no Admin).
const ANA = "44444444-4444-4444-8444-0000000000a8";
const BETO = "44444444-4444-4444-8444-0000000000b8";

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
const firma = (clave) => `select set_config('request.headers', '${JSON.stringify({ "x-responsable-omitido": clave })}', true) \\g /dev/null\n`;
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");

const persona = (auth, nombre, email, { rolColab = "colaborador", clave = "integrante" } = {}) => `
insert into auth.users (id, aud, role, email) values ('${auth}', 'authenticated', 'authenticated', '${email}');
insert into public.personas (nombres, apellidos, sede_base_id, auth_user_id, rol) values ('${nombre}', 'Prueba Entradas', :'sede_base', '${auth}', 'integrante') returning id as ${nombre.toLowerCase()}_p \\gset
insert into retail.colaboradores (persona_id, rol, rol_id, ubicacion_asignada_id, estado)
  values (:'${nombre.toLowerCase()}_p', '${rolColab}', retail.fn_rol_por_clave('${clave}'), :'tru', 'activo');
`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${MIGRACIONES.map((m) => `${sinCandadosDePegado(m)}\n${sinCandadosDePegado(m)}`).join("\n")}
set local search_path = retail, public, extensions;

-- «SIN_ERROR|<lo que devolvió>» o «<sqlstate>|<hint>|<mensaje>».
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r text;
begin
  execute p_sql into v_r;
  return 'SIN_ERROR|' || coalesce(v_r, '');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.sede_base_id as sede_base from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden)
  values ('BCP prueba entradas', 'banco', '104', 9000, retail.fn_hoy_lima() - 30, 63) returning id as bcp \\gset
${persona(ANA, "Ana", "ana-entradas@prueba.local")}
${persona(BETO, "Beto", "beto-entradas@prueba.local", { rolColab: "lider", clave: "lider" })}
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'ordenes_compra') on conflict do nothing;
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
insert into retail.ordenes_compra (proveedor_id, ubicacion_destino_id, creada_por) values (:'prov', :'tru', :'ana_p') returning id as oc \\gset
-- Beto le entrega S/ 500 a Ana.
${como(BETO)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 500, 'Compras Gamarra', null, null) as entrega \\gset
select c.id as fondo from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p' \\gset
`;

// Ana rinde S/ 400 de 500 (le faltan 100, sin explicación) y Felipe aprueba: queda como deuda. Beto registra un pago de 5.
const CON_DEUDA = `
${como(ANA)}${firma("fondo_rendir")}
select retail.rendir_fondo(400, null, null) as r1 \\gset
${como(FELIPE)}${firma("fondo_rendicion_aprobar")}
select retail.aprobar_rendicion_fondo(:'r1', null, null) \\g /dev/null
${como(BETO)}${firma("fondo_deuda_pagar")}
select retail.pagar_deuda_fondo(:'ana_p', 5, :'bcp', null, null, null) as pago \\gset
`;

// Una consulta con variables de psql dentro: se arma con format(%L) fuera de las comillas y se manda a pg_temp.intento.
const prueba = (clave, plantilla, ...vars) =>
  `select '${clave}|' || pg_temp.intento(format($q$${plantilla}$q$${vars.map((v) => `, :'${v}'`).join("")}));`;

const linea = (clave) => (s) => s.match(new RegExp(`^${clave}\\|.*$`, "m"))?.[0] ?? `${clave}: (sin salida)`;
const espera = (s, clave, patron, e, que) => {
  if (!patron.test(linea(clave)(s))) e.push(`${que} — ${linea(clave)(s)}`);
};

const CASOS = [
  {
    nombre: "un monto que no es un número no entra a la plata: ni por las funciones del fondo, ni por «Cuentas y dinero», ni directo a la tabla",
    sql: `${como(BETO)}${firma("fondo_entregar")}
${prueba("e_nan", "select retail.entregar_fondo(%L, %L, 'NaN', 'x', null, null)::text", "ana_p", "bcp")}
${prueba("e_inf", "select retail.entregar_fondo(%L, %L, 'Infinity', 'x', null, null)::text", "ana_p", "bcp")}
${firma("fondo_devolver")}
${prueba("d_nan", "select retail.devolver_fondo(%L, %L, 'NaN', null, null, null)::text", "ana_p", "bcp")}
${firma("fondo_deuda_pagar")}
${prueba("p_nan", "select retail.pagar_deuda_fondo(%L, 'NaN', %L, null, null, null)::text", "ana_p", "bcp")}
${como(ANA)}${firma("gasto_viaje_registrar")}
${prueba("g_nan", "select retail.registrar_gasto_viaje('viaje', 'taxi', 'NaN', retail.fn_hoy_lima(), 'planilla_movilidad', 'efectivo', %L, array[%L]::uuid[], null, null, null, null)::text", "fondo", "oc")}
${firma("fondo_rendir")}
${prueba("r_nan", "select retail.rendir_fondo('NaN', null, null)::text")}
${como(FELIPE)}${firma("dinero_registrar")}
${prueba("m_nan", "select retail.registrar_movimiento_dinero('aporte', 'NaN', null, %L, retail.fn_hoy_lima(), 'x', 0, null, null, null)::text", "bcp")}
${prueba("t_nan", "insert into retail.movimientos_dinero (tipo, fecha, cuenta_destino_id, monto, registrado_por) values ('aporte', retail.fn_hoy_lima(), %L, 'NaN', %L) returning id::text", "bcp", "beto_p")}
select 'candados|' || count(*) filter (where convalidated) || '/' || count(*) from pg_constraint
 where conname in ('movimientos_dinero_montos_finitos', 'gastos_montos_finitos', 'compra_pagos_montos_finitos',
                   'gastos_viaje_ordenes_montos_finitos', 'rendiciones_fondo_montos_finitos', 'rendicion_fondo_items_montos_finitos');
select 'nan_guardado|' || count(*) from retail.movimientos_dinero where monto::text = 'NaN';`,
    revisar: (s) => {
      const e = [];
      for (const [c, que] of [["e_nan", "entregar NaN"], ["e_inf", "entregar infinito"], ["d_nan", "devolver NaN"], ["p_nan", "pagar deuda NaN"], ["g_nan", "gasto del viaje NaN"]])
        espera(s, c, /^\w+\|P0001\|monto_invalido\|El monto tiene que ser mayor que cero\./, e, `${que} se rechaza con monto_invalido`);
      espera(s, "r_nan", /^r_nan\|P0001\|\|Escribe cuánto tienes en la mano/, e, "rendir con NaN pide escribir cuánto tiene");
      espera(s, "m_nan", /^m_nan\|23514\|/, e, "un aporte NaN de «Cuentas y dinero» rebota en el candado de la tabla");
      espera(s, "t_nan", /^t_nan\|23514\|.*movimientos_dinero_montos_finitos/, e, "un NaN directo a la tabla rebota en movimientos_dinero_montos_finitos");
      espera(s, "candados", /^candados\|6\/6$/, e, "los seis candados existen y están validados");
      espera(s, "nan_guardado", /^nan_guardado\|0$/, e, "no quedó ningún monto NaN");
      return e;
    },
  },
  {
    nombre: "céntimos y tamaño: más de 2 decimales se rechaza (antes se redondeaba en silencio) y diez mil millones es «demasiado grande»",
    sql: `${como(BETO)}${firma("fondo_entregar")}
${prueba("e_3dec", "select retail.entregar_fondo(%L, %L, 10.005, 'x', null, null)::text", "ana_p", "bcp")}
${prueba("e_enorme", "select retail.entregar_fondo(%L, %L, 10000000000, 'x', null, null)::text", "ana_p", "bcp")}
select retail.entregar_fondo(:'ana_p', :'bcp', 10.50, 'x', null, null) as eok \\gset
select 'e_ok|SIN_ERROR|' || m.monto from retail.movimientos_dinero m where m.id = :'eok';
${firma("fondo_devolver")}
${prueba("d_3dec", "select retail.devolver_fondo(%L, %L, 10.005, null, null, null)::text", "ana_p", "bcp")}
${como(ANA)}${firma("gasto_viaje_registrar")}
${prueba("g_enorme", "select retail.registrar_gasto_viaje('viaje', 'hotel', 10000000000, retail.fn_hoy_lima(), 'boleta', 'efectivo', %L, array[%L]::uuid[], 'B001-1', null, null, null)::text", "fondo", "oc")}`,
    revisar: (s) => {
      const e = [];
      espera(s, "e_3dec", /^e_3dec\|P0001\|monto_invalido\|El monto admite como máximo 2 decimales\./, e, "entregar 10.005 dice «máximo 2 decimales»");
      espera(s, "d_3dec", /^d_3dec\|P0001\|monto_invalido\|El monto admite como máximo 2 decimales\./, e, "devolver 10.005 dice «máximo 2 decimales»");
      espera(s, "e_enorme", /^e_enorme\|P0001\|monto_invalido\|El monto es demasiado grande/, e, "entregar 10 000 000 000 es demasiado grande");
      espera(s, "g_enorme", /^g_enorme\|P0001\|monto_invalido\|El monto es demasiado grande/, e, "un gasto de 10 000 000 000 es demasiado grande");
      espera(s, "e_ok", /^e_ok\|SIN_ERROR\|10\.50$/, e, "entregar 10.50 sigue entrando");
      return e;
    },
  },
  {
    nombre: "fechas: la plata de un fondo y un gasto del viaje no son de antes del 13/10/2026; ese día sí",
    sql: `${como(BETO)}${firma("fondo_entregar")}
${prueba("e_12", "select retail.entregar_fondo(%L, %L, 10, 'x', '2026-10-12', null)::text", "ana_p", "bcp")}
${prueba("e_1900", "select retail.entregar_fondo(%L, %L, 10, 'x', '1900-01-01', null)::text", "ana_p", "bcp")}
select retail.entregar_fondo(:'ana_p', :'bcp', 10, 'x', '2026-10-13', null) as e13 \\gset
select 'e_13|SIN_ERROR|' || m.fecha from retail.movimientos_dinero m where m.id = :'e13';
${firma("fondo_devolver")}
${prueba("d_12", "select retail.devolver_fondo(%L, %L, 10, null, '2026-10-12', null)::text", "ana_p", "bcp")}
${como(ANA)}${firma("gasto_viaje_registrar")}
${prueba("g_12", "select retail.registrar_gasto_viaje('viaje', 'taxi', 20, '2026-10-12', 'planilla_movilidad', 'efectivo', %L, array[%L]::uuid[], null, null, null, null)::text", "fondo", "oc")}`,
    revisar: (s) => {
      const e = [];
      for (const [c, que] of [["e_12", "entregar del 12/10"], ["e_1900", "entregar de 1900"], ["d_12", "devolver del 12/10"], ["g_12", "un gasto del viaje del 12/10"]])
        espera(s, c, /^\w+\|P0001\|fecha_antes_de_los_fondos\|.*13\/10\/2026/, e, `${que} se rechaza (fecha_antes_de_los_fondos)`);
      espera(s, "e_13", /^e_13\|SIN_ERROR\|2026-10-13$/, e, "entregar del 13/10/2026 entra");
      return e;
    },
  },
  {
    nombre: "textos: solo caracteres invisibles es un texto vacío, y el motivo de anular una entrega tiene 200 letras como máximo",
    sql: `${CON_DEUDA}
${como(BETO)}${firma("fondo_entregar")}
${prueba("e_zw", "select retail.entregar_fondo(%L, %L, 10, E'\\u200b\\u200b', null, null)::text", "ana_p", "bcp")}
${como(ANA)}${firma("gasto_viaje_registrar")}
${prueba("g_zw", "select retail.registrar_gasto_viaje('viaje', 'otro', 20, retail.fn_hoy_lima(), 'boleta', 'efectivo', %L, array[%L]::uuid[], 'B001-2', null, E'\\u200b', null)::text", "fondo", "oc")}
${como(FELIPE)}${firma("fondo_anular")}
select retail.entregar_fondo(:'ana_p', :'bcp', 30, 'Para anular', null, null) as otra \\gset
${prueba("a_zw", "select retail.anular_movimiento_fondo(%L, E'\\u200b')::text", "otra")}
${prueba("a_201", "select retail.anular_movimiento_fondo(%L, repeat('m', 201))::text", "otra")}
${firma("fondo_deuda_anular")}
${prueba("ap_zw", "select retail.anular_pago_deuda_fondo(%L, E'\\ufeff ')::text", "pago")}
${prueba("a_ok", "select retail.anular_movimiento_fondo(%L, 'Me equivoqué de persona')::text", "otra")}`,
    revisar: (s) => {
      const e = [];
      espera(s, "e_zw", /^e_zw\|P0001\|\|Di para qué es la plata/, e, "un «para qué» invisible pide decir para qué es la plata");
      espera(s, "g_zw", /^g_zw\|P0001\|\|Con «Otro», escribe qué se pagó\./, e, "una nota de «Otro» invisible pide escribir qué se pagó");
      espera(s, "a_zw", /^a_zw\|P0001\|\|Di por qué se anula\./, e, "un motivo invisible al anular una entrega pide el motivo");
      espera(s, "a_201", /^a_201\|P0001\|\|El motivo es muy largo \(máximo 200 letras\)\./, e, "un motivo de 201 letras es muy largo");
      espera(s, "ap_zw", /^ap_zw\|P0001\|\|Di por qué se anula\./, e, "un motivo invisible al anular un pago de deuda pide el motivo");
      espera(s, "a_ok", /^a_ok\|SIN_ERROR\|/, e, "un motivo de verdad anula");
      return e;
    },
  },
  {
    nombre: "el token sigue al contenido en las cinco funciones del fondo, y fn_resolver_intento las revisa",
    sql: `${CON_DEUDA}
select gen_random_uuid() as t1 \\gset
select gen_random_uuid() as t2 \\gset
select gen_random_uuid() as t3 \\gset
select gen_random_uuid() as t4 \\gset
select gen_random_uuid() as t5 \\gset
select gen_random_uuid() as perdido \\gset
${como(BETO)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 100, 'Compra A', null, :'t1') as e1 \\gset
select 'e_mismo|' || (retail.entregar_fondo(:'ana_p', :'bcp', 100, 'Compra A', null, :'t1') = :'e1')::text;
${prueba("e_otro", "select retail.entregar_fondo(%L, %L, 150, 'Compra A', null, %L)::text", "ana_p", "bcp", "t1")}
${firma("fondo_devolver")}
select retail.devolver_fondo(:'ana_p', :'bcp', 10, null, null, :'t2') \\g /dev/null
${prueba("d_otro", "select retail.devolver_fondo(%L, %L, 20, null, null, %L)::text", "ana_p", "bcp", "t2")}
${firma("fondo_deuda_pagar")}
select retail.pagar_deuda_fondo(:'ana_p', 5, :'bcp', null, null, :'t3') \\g /dev/null
${prueba("p_otro", "select retail.pagar_deuda_fondo(%L, 6, %L, null, null, %L)::text", "ana_p", "bcp", "t3")}
${como(ANA)}${firma("gasto_viaje_registrar")}
select retail.registrar_gasto_viaje('viaje', 'taxi', 20, retail.fn_hoy_lima(), 'planilla_movilidad', 'efectivo', :'fondo', array[:'oc']::uuid[], null, null, null, :'t4') \\g /dev/null
${prueba("g_otro", "select retail.registrar_gasto_viaje('viaje', 'hotel', 30, retail.fn_hoy_lima(), 'boleta', 'efectivo', %L, array[%L]::uuid[], 'B001-3', null, null, %L)::text", "fondo", "oc", "t4")}
${firma("fondo_rendir")}
select retail.rendir_fondo(retail.fn_fondo_saldo(:'fondo'), null, :'t5') \\g /dev/null
${prueba("r_otro", "select retail.rendir_fondo(1, 'otra cosa', %L)::text", "t5")}
${como(BETO)}
select 'res_beto|' || (retail.fn_resolver_intento('entregar_fondo', :'t1') ->> 'estado') || '|' || ((retail.fn_resolver_intento('entregar_fondo', :'t1') ->> 'id') = :'e1')::text;
${como(ANA)}
select 'res_ana|' || (retail.fn_resolver_intento('rendir_fondo', :'t5') ->> 'estado');
${como(MICAELA)}
${prueba("res_otra", "select (retail.fn_resolver_intento('rendir_fondo', %L) ->> 'estado')", "t5")}
${como(BETO)}${firma("fondo_entregar")}
select 'res_perdido|' || (retail.fn_resolver_intento('entregar_fondo', :'perdido') ->> 'estado');
${prueba("e_descartado", "select retail.entregar_fondo(%L, %L, 100, 'Compra B', null, %L)::text", "ana_p", "bcp", "perdido")}`,
    revisar: (s) => {
      const e = [];
      espera(s, "e_mismo", /^e_mismo\|true$/, e, "el mismo token con lo mismo devuelve la misma entrega");
      for (const [c, que] of [["e_otro", "entregar"], ["d_otro", "devolver"], ["p_otro", "pagar una deuda"], ["g_otro", "un gasto del viaje"], ["r_otro", "rendir"]])
        espera(s, c, /^\w+\|P0001\|token_reusado\|/, e, `${que}: el mismo token con otro contenido es token_reusado`);
      espera(s, "res_beto", /^res_beto\|hecho\|true$/, e, "quien tiene Fondos por rendir revisa la entrega: hecho, con su id");
      espera(s, "res_ana", /^res_ana\|hecho$/, e, "la persona del fondo revisa su rendición: hecho");
      espera(s, "res_otra", /^res_otra\|42501\|intento_ajeno\|/, e, "otra persona sin el módulo no revisa una rendición ajena");
      espera(s, "res_perdido", /^res_perdido\|no_llego$/, e, "un token que nunca llegó se da por no llegado");
      espera(s, "e_descartado", /^e_descartado\|P0001\|intento_descartado\|/, e, "y ese envío ya no entra (intento_descartado)");
      return e;
    },
  },
  {
    // /formidable 2026-10-14 (E2): devolver «lo de los libros» con la rendición por aprobar y aprobar después dejaba el fondo en −S/ 20 y,
    // a la vez, una deuda de S/ 20: la misma plata debida en los dos sentidos.
    nombre: "con una rendición por aprobar, la devolución no pasa de lo que la persona tiene en la mano (saldo − su faltante)",
    sql: `${como(ANA)}${firma("fondo_rendir")}
select retail.rendir_fondo(480, null, null) as r1 \\gset
${como(BETO)}${firma("fondo_devolver")}
${prueba("d_libros", "select retail.devolver_fondo(%L, %L, 500, null, null, null)::text", "ana_p", "bcp")}
${prueba("d_mano", "select retail.devolver_fondo(%L, %L, 480, null, null, null)::text", "ana_p", "bcp")}
select 'tras_devolver|' || retail.fn_fondo_saldo(:'fondo');
${como(FELIPE)}${firma("fondo_rendicion_aprobar")}
select retail.aprobar_rendicion_fondo(:'r1', null, null) \\g /dev/null
select 'tras_aprobar|' || retail.fn_fondo_saldo(:'fondo');
-- Sin una rendición por aprobar, el tope vuelve a ser el saldo de siempre.
${como(BETO)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 100, 'Compra C', null, null) \\g /dev/null
${firma("fondo_devolver")}
${prueba("d_sin_rendicion", "select retail.devolver_fondo(%L, %L, 100, null, null, null)::text", "ana_p", "bcp")}`,
    revisar: (s) => {
      const e = [];
      espera(s, "d_libros", /^d_libros\|P0001\|fondo_insuficiente\|Con su rendición por aprobar, tiene S\/ 480\.00 en la mano/, e,
        "devolver lo de los libros (500) con S/ 480 declarados se rechaza y dice cuánto tiene en la mano");
      espera(s, "d_mano", /^d_mano\|SIN_ERROR\|/, e, "devolver lo que tiene en la mano (480) se acepta");
      espera(s, "tras_devolver", /^tras_devolver\|20(\.00)?$/, e, "tras devolver, el fondo guarda solo el faltante (S/ 20)");
      espera(s, "tras_aprobar", /^tras_aprobar\|0(\.00)?$/, e, "al aprobar, el faltante sale y el fondo queda en cero: nunca en negativo");
      espera(s, "d_sin_rendicion", /^d_sin_rendicion\|SIN_ERROR\|/, e, "sin rendición por aprobar, se devuelve hasta el saldo, como siempre");
      return e;
    },
  },
  {
    nombre: "la sede de un gasto del viaje (la caja que propone la hoja): la de quien lo registra; si no tiene, la de su orden",
    sql: `${como(ANA)}
select 'ana|' || (retail.fn_gasto_viaje_sede(array[:'oc']::uuid[]) = :'tru')::text;
${como(FELIPE)}
select coalesce((select u.id from retail.colaboradores co join retail.ubicaciones u on u.id = co.ubicacion_asignada_id
                  join public.personas p on p.id = co.persona_id where p.auth_user_id = '${FELIPE}' and u.activo limit 1), :'tru') as esperada \\gset
select 'felipe|' || (retail.fn_gasto_viaje_sede(array[:'oc']::uuid[]) = :'esperada')::text;
select 'nada|' || coalesce(retail.fn_gasto_viaje_sede(array[]::uuid[])::text, 'sin sede') || '|' || coalesce((select 'con sede' from retail.colaboradores co join public.personas p on p.id = co.persona_id where p.auth_user_id = '${FELIPE}' and co.ubicacion_asignada_id is not null), 'sin sede');`,
    revisar: (s) => {
      const e = [];
      espera(s, "ana", /^ana\|true$/, e, "Ana (con sede) registra en la suya");
      espera(s, "felipe", /^felipe\|true$/, e, "Felipe: su sede si tiene una; si no, la de la orden");
      const nada = linea("nada")(s);
      if (/\|sin sede$/.test(nada) && !/^nada\|sin sede\|/.test(nada)) e.push(`sin sede ni orden, ninguna — ${nada}`);
      return e;
    },
  },
];

let fallas = 0;
for (const caso of CASOS) {
  const r = correr(`${PRELUDIO}\n${caso.sql}\nrollback;\n`);
  if (!r.ok) {
    fallas++;
    console.log(`✗ ${caso.nombre}\n    el guion falló: ${r.mensaje.split("\n").filter((l) => /ERROR|error/.test(l)).slice(0, 3).join(" · ")}`);
    continue;
  }
  const errores = caso.revisar(r.salida);
  if (errores.length) {
    fallas++;
    console.log(`✗ ${caso.nombre}`);
    for (const e of errores) console.log(`    · ${e}`);
  } else console.log(`✓ ${caso.nombre}`);
}
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos de lo que la base del fondo no acepta pasan${SIN_ARREGLO ? " (SIN las migraciones: tienen que fallar)" : ""}.`);
process.exit(fallas ? 1 : 0);
