#!/usr/bin/env node
/**
 * Prueba de lo «no deducible» (ADR-0362, fase 6 · actividad 6): `20261014002000_no_deducible.sql`, sobre las del fondo, los gastos del
 * viaje y la rendición (181000 … 235000, que la base ya tiene que tener).
 *
 * QUÉ PROMETE
 *   · Bancarización (decisiones 56, 57 y 70): en un comprobante de S/ 2 000 o más (su total), el pago en efectivo y todo lo que sale de un
 *     fondo (aunque sea por Yape) es no deducible, entero; la transferencia desde el banco no. Con S/ 1 999.99 no hay nada que marcar;
 *     con S/ 2 000 justos, sí. Igual con los pagos del Taller y con un gasto del viaje (su monto es el total de su papel).
 *   · Planilla de movilidad (decisiones 55 y 68): sin tope no se marca nada. Con tope, se suman las planillas de la misma persona en el
 *     mismo día, en el orden en que se anotaron: la que cruza el tope, en parte; las que siguen, enteras. Otra persona u otro día no suman,
 *     una anulada tampoco, y antes de que rija el tope no hay tope.
 *   · El tope se guarda como parámetro tributario desde cualquier fecha (no solo el 1 de enero), en soles y mayor que cero.
 *   · La lectura de la web: claves que no son del libro no responden; más de 1,000 no; sin módulo ni fondo, no.
 *
 * CÓMO. Como `rendicion_fondo.mjs`: carga su migración dentro de cada caso (se puede pegar dos veces), sesión simulada con
 * `request.jwt.claim.sub` y ROLLBACK siempre: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:no-deducible                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/no_deducible.mjs --contenedor <otro>   → contra otro contenedor (el banco de pruebas, por ejemplo)
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
// Solo la suya, dos veces: las del fondo, los gastos del viaje y la rendición (181000 … 235000) ya están aplicadas en la base (en el CI,
// todas; en local, actualízala). Volver a pegar la 181000 sobre una base que ya tiene faltantes de una rendición choca con su restricción
// de tipos, que es anterior a ellos.
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261014002000_no_deducible.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
// Solo de esta prueba: Ana y Eva compran (integrantes con su cuenta; Ana tiene fondo, Eva no).
const ANA = "44444444-4444-4444-8444-0000000000a6";
const EVA = "44444444-4444-4444-8444-0000000000e6";

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
const sinFirma = `select set_config('request.headers', '{}', true) \\g /dev/null\n`;
const comoPostgres = `reset request.jwt.claim.sub;\nreset request.jwt.claims;\n${sinFirma}`;
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");

const persona = (auth, nombre, email) => `
insert into auth.users (id, aud, role, email) values ('${auth}', 'authenticated', 'authenticated', '${email}');
insert into public.personas (nombres, apellidos, sede_base_id, auth_user_id, rol) values ('${nombre}', 'Prueba Deducible', :'sede_base', '${auth}', 'integrante') returning id as ${nombre.toLowerCase()}_p \\gset
insert into retail.colaboradores (persona_id, rol, rol_id, ubicacion_asignada_id, estado)
  values (:'${nombre.toLowerCase()}_p', 'colaborador', retail.fn_rol_por_clave('integrante'), :'tru', 'activo');
`;

// Un comprobante de proveedor con su total y, como postgres, sus pagos (la regla solo lee las tablas; registrar los pagos es de otras pruebas).
const compra = (alias, total) => `
insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, naturaleza, ubicacion_gestion_id)
  values (:'prov', 'factura', 'FND', substr(replace(gen_random_uuid()::text, '-', ''), 1, 8), retail.fn_hoy_lima() - 2, 'credito',
          retail.fn_hoy_lima() + 20, round(${total} / 1.18, 2), ${total} - round(${total} / 1.18, 2), ${total}, 'mercaderia', :'tru') returning id as ${alias} \\gset
`;
const pago = (alias, compraAlias, monto, metodo, cuenta) => `
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, ubicacion_id, cuenta_dinero_id)
  values (:'${compraAlias}', retail.fn_hoy_lima() - 1, ${monto}, '${metodo}', :'tru', ${cuenta ? `:'${cuenta}'` : "null"}) returning id as ${alias} \\gset
`;

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
-- Lo no deducible de unas claves, en una línea: «clave_corta:motivo:monto:total:tope», en orden de clave corta.
create function pg_temp.nd(p_claves text[], p_nombres text[]) returns text language sql as $f$
  select coalesce(string_agg(n.nombre || ':' || d.motivo || ':' || d.monto::numeric(12, 2) || ':' || d.total::numeric(12, 2) || ':' || d.tope::numeric(12, 2),
                             ',' order by n.nombre), '-')
    from retail.fn_no_deducibles_de(p_claves) d join unnest(p_claves, p_nombres) n(clave, nombre) on n.clave = d.clave;
$f$;

insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.sede_base_id as sede_base from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden)
  values ('BCP prueba deducible', 'banco', '104', 90000, retail.fn_hoy_lima() - 30, 61) returning id as bcp \\gset
${persona(ANA, "Ana", "ana-deducible@prueba.local")}
${persona(EVA, "Eva", "eva-deducible@prueba.local")}
-- Las integrantes anotan gastos del viaje (Órdenes de compra) y nada más; Micaela queda sin esos módulos (el seed no se los da).
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'ordenes_compra') on conflict do nothing;
${como(FELIPE)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 6000, 'Compras Gamarra', null, null) as entrega \\gset
select c.id as fondo from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p' \\gset
${comoPostgres}
`;

const linea = (clave) => (s) => s.match(new RegExp(`^${clave}\\|.*$`, "m"))?.[0] ?? `${clave}: (sin salida)`;

const CASOS = [
  {
    nombre: "bancarización en un comprobante: efectivo y fondo (aunque sea Yape) son no deducibles enteros; la transferencia no; el umbral es el total",
    sql: `${compra("grande", 2360)}${pago("p_trf", "grande", 1000, "transferencia", "bcp")}${pago("p_efe", "grande", 500, "efectivo", null)}${como(ANA)}${pago("p_fon", "grande", 860, "yape", "fondo")}${comoPostgres}
${compra("justo", 2000)}${pago("p_justo", "justo", 2000, "efectivo", null)}
${compra("chico", 1999.99)}${pago("p_chico", "chico", 1999.99, "efectivo", null)}
select 'grande|' || pg_temp.nd(array['pago:' || :'p_trf', 'pago:' || :'p_efe', 'pago:' || :'p_fon'], array['trf', 'efe', 'fon']);
select 'umbral|' || pg_temp.nd(array['pago:' || :'p_justo', 'pago:' || :'p_chico'], array['justo', 'chico']);`,
    revisa: (s) => [
      !/^grande\|efe:bancarizacion:500\.00:2360\.00:2000\.00,fon:bancarizacion:860\.00:2360\.00:2000\.00$/m.test(s) &&
        `en un comprobante de S/ 2 360, el efectivo (500) y el Yape desde el fondo (860) son no deducibles; la transferencia no — ${linea("grande")(s)}`,
      !/^umbral\|justo:bancarizacion:2000\.00:2000\.00:2000\.00$/m.test(s) && `S/ 2 000 justos sí; S/ 1 999.99 no — ${linea("umbral")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "bancarización en el Taller y en un gasto del viaje (su monto es el total del papel)",
    sql: `insert into retail.proveedores_produccion (nombre, rubro) values ('Taller Prueba Deducible', 'maquila') returning id as pprov \\gset
insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, condicion, subtotal, igv, total)
  values (:'pprov', 'factura', 'TPD', '1', 'contado', 2118.64, 381.36, 2500) returning id as cprod \\gset
insert into retail.comprobantes_produccion_pagos (comprobante_id, monto, metodo) values (:'cprod', 2500, 'efectivo') returning id as pp_efe \\gset
${como(ANA)}${firma("gasto_viaje_registrar")}
select retail.registrar_gasto_viaje('viaje', 'hotel', 2100, retail.fn_hoy_lima(), 'factura', 'transferencia', :'fondo', null, 'F001-9', '20111111111', null, null) as g_fondo \\gset
select retail.registrar_gasto_viaje('viaje', 'hotel', 1500, retail.fn_hoy_lima(), 'factura', 'transferencia', :'fondo', null, 'F001-10', '20111111111', null, null) as g_chico \\gset
${como(FELIPE)}${firma("gasto_viaje_registrar")}
select retail.registrar_gasto_viaje('viaje', 'pasaje', 2400, retail.fn_hoy_lima(), 'boleta', 'transferencia', :'bcp', null, 'B001-1', null, null, null) as g_banco \\gset
${comoPostgres}
select 'taller|' || pg_temp.nd(array['pagoprod:' || :'pp_efe'], array['efe']);
select 'viaje|' || pg_temp.nd(array['gasto:' || :'g_fondo', 'gasto:' || :'g_chico', 'gasto:' || :'g_banco'], array['fondo', 'chico', 'banco']);`,
    revisa: (s) => [
      !/^taller\|efe:bancarizacion:2500\.00:2500\.00:2000\.00$/m.test(s) && `el pago en efectivo de una factura del Taller de S/ 2 500 — ${linea("taller")(s)}`,
      !/^viaje\|fondo:bancarizacion:2100\.00:2100\.00:2000\.00$/m.test(s) &&
        `un hotel de S/ 2 100 desde el fondo es no deducible; uno de S/ 1 500 desde el fondo, y uno de S/ 2 400 desde el banco, no — ${linea("viaje")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "planilla de movilidad: sin tope nada; con tope, por persona y por día en el orden en que se anotó; otra persona, otro día y lo anulado no suman",
    sql: `${como(ANA)}${firma("gasto_viaje_registrar")}
select retail.registrar_gasto_viaje('viaje', 'taxi', 30, retail.fn_hoy_lima(), 'planilla_movilidad', 'efectivo', :'fondo', null, null, null, null, null) as t30 \\gset
select retail.registrar_gasto_viaje('mercaderia', 'cargador', 50, retail.fn_hoy_lima(), 'planilla_movilidad', 'efectivo', :'fondo', null, null, null, null, null) as c50 \\gset
select retail.registrar_gasto_viaje('viaje', 'taxi', 20, retail.fn_hoy_lima(), 'planilla_movilidad', 'efectivo', :'fondo', null, null, null, null, null) as t20 \\gset
select retail.registrar_gasto_viaje('viaje', 'taxi', 60, retail.fn_hoy_lima() - 1, 'planilla_movilidad', 'efectivo', :'fondo', null, null, null, null, null) as ayer60 \\gset
select retail.registrar_gasto_viaje('viaje', 'taxi', 70, retail.fn_hoy_lima() - 5, 'planilla_movilidad', 'efectivo', :'fondo', null, null, null, null, null) as antes70 \\gset
select retail.registrar_gasto_viaje('viaje', 'comida', 90, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fondo', null, 'B002-5', null, null, null) as boleta90 \\gset
${como(FELIPE)}${firma("gasto_viaje_registrar")}
select retail.registrar_gasto_viaje('viaje', 'taxi', 40, retail.fn_hoy_lima(), 'planilla_movilidad', 'transferencia', :'bcp', null, null, null, null, null) as felipe40 \\gset
${comoPostgres}
-- Cada planilla en su momento (en esta transacción todas tendrían la misma hora): el orden en que se anotaron. Un gasto solo cambia para
-- anularse (su disparador): aquí se apaga solo para esta transacción.
set local session_replication_role = replica;
update retail.gastos g set created_at = now() + make_interval(secs => x.n)
  from (values (:'t30'::uuid, 1), (:'c50'::uuid, 2), (:'t20'::uuid, 3), (:'ayer60'::uuid, 4), (:'antes70'::uuid, 5), (:'felipe40'::uuid, 6)) x(id, n)
 where g.id = x.id;
set local session_replication_role = origin;
select array['gasto:' || :'t30', 'gasto:' || :'c50', 'gasto:' || :'t20', 'gasto:' || :'ayer60', 'gasto:' || :'antes70', 'gasto:' || :'boleta90',
              'gasto:' || :'felipe40']::text as claves,
       array['1_t30', '2_c50', '3_t20', '4_ayer60', '5_antes70', '6_boleta90', '7_felipe40']::text as nombres \\gset
select 'sin_tope|' || pg_temp.nd(:'claves'::text[], :'nombres'::text[]);
${como(FELIPE)}${firma("parametro_tributario")}
select 'guarda|' || pg_temp.intento(format('select retail.guardar_parametro_tributario(%L, %L, %s)', 'tope_planilla_movilidad', retail.fn_hoy_lima() - 3, 45.20));
${comoPostgres}
select 'con_tope|' || pg_temp.nd(:'claves'::text[], :'nombres'::text[]);
set local session_replication_role = replica;
update retail.gastos set estado = 'anulado', motivo_anulacion = 'Prueba', anulado_en = now() where id = :'t30';
set local session_replication_role = origin;
select 'anulado|' || pg_temp.nd(:'claves'::text[], :'nombres'::text[]);`,
    revisa: (s) => [
      !/^sin_tope\|-$/m.test(s) && `sin tope no se marca ninguna planilla — ${linea("sin_tope")(s)}`,
      !/^guarda\|SIN_ERROR$/m.test(s) && `el tope se guarda desde cualquier fecha — ${linea("guarda")(s)}`,
      !/^con_tope\|2_c50:planilla_tope:34\.80:100\.00:45\.20,3_t20:planilla_tope:20\.00:100\.00:45\.20,4_ayer60:planilla_tope:14\.80:60\.00:45\.20$/m.test(s) &&
        `con tope 45.20: hoy 30 entra, el cargador (50) cruza el tope en 34.80 y el taxi de 20 va entero; ayer 60 pasa en 14.80; antes del tope, nada; la boleta y la planilla de Felipe, nada — ${linea("con_tope")(s)}`,
      !/^anulado\|2_c50:planilla_tope:4\.80:70\.00:45\.20,3_t20:planilla_tope:20\.00:70\.00:45\.20,4_ayer60:planilla_tope:14\.80:60\.00:45\.20$/m.test(s) &&
        `anulado el taxi de 30, el cargador pasa en 4.80 — ${linea("anulado")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "el tope como parámetro: en soles, mayor que cero y hasta 1,000; desde cualquier fecha; la UIT sigue siendo por año",
    sql: `${como(FELIPE)}${firma("parametro_tributario")}
select 'cero|' || pg_temp.intento(format('select retail.guardar_parametro_tributario(%L, %L, %s)', 'tope_planilla_movilidad', '2026-05-01', 0));
select 'mucho|' || pg_temp.intento(format('select retail.guardar_parametro_tributario(%L, %L, %s)', 'tope_planilla_movilidad', '2026-05-01', 1500));
select 'mayo|' || pg_temp.intento(format('select retail.guardar_parametro_tributario(%L, %L, %s)', 'tope_planilla_movilidad', '2026-05-01', 45.20));
select 'uit_mayo|' || pg_temp.intento(format('select retail.guardar_parametro_tributario(%L, %L, %s)', 'uit', '2027-05-01', 5600));
select 'lee|' || t.valor || '|' || t.vigente_desde from retail.fn_parametro_tributario('tope_planilla_movilidad', '2026-06-15') t;
select 'antes|' || count(*) from retail.fn_parametro_tributario('tope_planilla_movilidad', '2026-04-30');
${comoPostgres}
select 'directo|' || pg_temp.intento($q$insert into retail.parametros_tributarios (nombre, vigente_desde, valor) values ('tope_planilla_movilidad', '2026-07-09', -1)$q$);`,
    revisa: (s) => [
      !/^cero\|P0001\|\|El tope de la planilla/m.test(s) && `cero — ${linea("cero")(s)}`,
      !/^mucho\|P0001\|\|El tope de la planilla/m.test(s) && `más de 1,000 — ${linea("mucho")(s)}`,
      !/^mayo\|SIN_ERROR$/m.test(s) && `desde el 1 de mayo — ${linea("mayo")(s)}`,
      !/^uit_mayo\|P0001\|\|La UIT, el régimen/m.test(s) && `la UIT sigue rigiendo desde el 1 de enero — ${linea("uit_mayo")(s)}`,
      !/^lee\|45\.2000\|2026-05-01$/m.test(s) && `lee — ${linea("lee")(s)}`,
      !/^antes\|0$/m.test(s) && `antes de mayo no hay tope — ${linea("antes")(s)}`,
      !/^directo\|23514\|/m.test(s) && `la tabla misma rechaza un tope negativo — ${linea("directo")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "la lectura de la web: quién la ve, claves que no son del libro, y el máximo",
    sql: `${compra("grande", 3000)}${pago("p_efe", "grande", 3000, "efectivo", null)}
${como(ANA)}${sinFirma}
select 'ana|' || string_agg(d.motivo || ':' || d.monto, ',') from retail.fn_no_deducibles(array['pago:' || :'p_efe', 'pago:basura', 'mov:' || :'p_efe', 'gasto:', null]) d;
${como(EVA)}${sinFirma}
select 'eva|' || count(*) from retail.fn_no_deducibles(array['pago:' || :'p_efe']);
${comoPostgres}
-- Sin ninguno de los módulos donde se ve esa plata (el seed le da Producción a las integrantes).
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante')
   and modulo in ('ordenes_compra', 'fondos', 'facturas_compra', 'por_pagar', 'produccion', 'gastos', 'cuentas_dinero', 'impuestos');
${como(EVA)}${sinFirma}
select 'eva_sin|' || pg_temp.intento(format('select * from retail.fn_no_deducibles(array[%L])', 'pago:' || :'p_efe'));
${como(ANA)}${sinFirma}
select 'ana_fondo|' || count(*) from retail.fn_no_deducibles(array['pago:' || :'p_efe']);
${como(FELIPE)}${sinFirma}
select 'mil|' || pg_temp.intento('select * from retail.fn_no_deducibles(array(select ''pago:'' || gen_random_uuid() from generate_series(1, 1001)))');`,
    revisa: (s) => [
      !/^ana\|bancarizacion:3000\.00$/m.test(s) && `con el módulo responde solo la clave del libro que es no deducible — ${linea("ana")(s)}`,
      !/^eva\|1$/m.test(s) && `eva con Órdenes de compra — ${linea("eva")(s)}`,
      !/^eva_sin\|42501\|/m.test(s) && `sin módulo ni fondo, no — ${linea("eva_sin")(s)}`,
      !/^ana_fondo\|1$/m.test(s) && `sin módulo pero con su fondo, sí — ${linea("ana_fondo")(s)}`,
      !/^mil\|P0001\|\|Se preguntan 1,000/m.test(s) && `más de 1,000 claves — ${linea("mil")(s)}`,
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
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos de lo no deducible pasan.`);
process.exit(fallas ? 1 : 0);
