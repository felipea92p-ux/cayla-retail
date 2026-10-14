#!/usr/bin/env node
/**
 * Prueba de saldar la deuda de un faltante (ADR-0362, fase 6 · actividad 7): `20261014145000_saldar_deuda_de_fondo.sql`, sobre las del
 * fondo y la rendición (181000 … 235000 y 002000, que la base ya tiene que tener).
 *
 * QUÉ PROMETE
 *   · Lo que la persona devuelve de su deuda lo registra quien recibe la plata (con Fondos por rendir; nunca ella misma), entra a un banco,
 *     a una caja fuerte o al líder, y la deuda baja: en Fondos por rendir y en «Tu fondo». El Diario lo asienta contra la 1419. El mismo
 *     token no duplica.
 *   · No se paga más de lo que debe, ni a un cajón o a un fondo, ni a quien no debe nada, ni sin el módulo.
 *   · Con dos deudas se paga primero la más vieja. Un pago mal registrado se anula con su motivo (no lo anula la persona que debe, ni
 *     «Cuentas y dinero»), y la deuda vuelve.
 *   · El Balance compara por dos caminos la 1419 (lo que falta pagar de cada rendición) y la 1413 (lo que tiene cada fondo).
 *
 * CÓMO. Como `rendicion_fondo.mjs`: carga su migración dentro de cada caso (se puede pegar dos veces), sesión simulada con
 * `request.jwt.claim.sub` y ROLLBACK siempre: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:deuda-fondo                                   → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/deuda_fondo.mjs --contenedor <otro>   → contra otro contenedor (el banco de pruebas, por ejemplo)
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
// Solo la suya, dos veces: las del fondo y la rendición ya están aplicadas en la base (en el CI, todas; en local, actualízala).
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261014145000_saldar_deuda_de_fondo.sql"), "utf8");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo
// Solo de esta prueba: Ana compra (integrante con su cuenta) y Beto le entrega la plata (líder, no Admin).
const ANA = "44444444-4444-4444-8444-0000000000a7";
const BETO = "44444444-4444-4444-8444-0000000000b7";

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
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");

const persona = (auth, nombre, email, { rolColab = "colaborador", clave = "integrante" } = {}) => `
insert into auth.users (id, aud, role, email) values ('${auth}', 'authenticated', 'authenticated', '${email}');
insert into public.personas (nombres, apellidos, sede_base_id, auth_user_id, rol) values ('${nombre}', 'Prueba Deuda', :'sede_base', '${auth}', 'integrante') returning id as ${nombre.toLowerCase()}_p \\gset
insert into retail.colaboradores (persona_id, rol, rol_id, ubicacion_asignada_id, estado)
  values (:'${nombre.toLowerCase()}_p', '${rolColab}', retail.fn_rol_por_clave('${clave}'), :'tru', 'activo');
`;

// Ana rinde con menos plata de la que dice el sistema y sin explicación: Felipe aprueba y queda como deuda (decisión 54).
const rendicionConDeuda = (alias, efectivo) => `
${como(ANA)}${firma("fondo_rendir")}
select retail.rendir_fondo(${efectivo}, null, null) as ${alias} \\gset
${como(FELIPE)}${firma("fondo_rendicion_aprobar")}
select retail.aprobar_rendicion_fondo(:'${alias}', null, null) \\g /dev/null
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
-- Lo que debe una persona hoy, de la misma lectura que usa todo.
create function pg_temp.debe(p_persona uuid) returns numeric language sql as $f$
  select coalesce(sum(x.debe), 0) from retail.fn_deudas_fondo_de(retail.fn_hoy_lima()) x where x.persona_id = p_persona;
$f$;
-- El asiento del Diario de un movimiento de dinero: «cuenta:debe:haber», en orden de cuenta.
create function pg_temp.asiento(p_mov uuid) returns text language sql as $f$
  select string_agg(a.cuenta || ':' || a.debe::numeric(12, 2) || ':' || a.haber::numeric(12, 2), ',' order by a.cuenta)
    from retail.fn_asientos(retail.fn_hoy_lima() - 3, retail.fn_hoy_lima(), null) a where a.asiento = 'dinero:' || p_mov;
$f$;

insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.sede_base_id as sede_base from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, saldo_inicial, saldo_desde, orden)
  values ('BCP prueba deuda', 'banco', '104', 9000, retail.fn_hoy_lima() - 30, 62) returning id as bcp \\gset
${persona(ANA, "Ana", "ana-deuda@prueba.local")}
${persona(BETO, "Beto", "beto-deuda@prueba.local", { rolColab: "lider", clave: "lider" })}
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'ordenes_compra') on conflict do nothing;
-- Beto le entrega S/ 500 a Ana; Ana paga un flete de S/ 80 desde su fondo (tiene 420) y rinde S/ 400: le faltan 20, sin explicación.
${como(BETO)}${firma("fondo_entregar")}
select retail.entregar_fondo(:'ana_p', :'bcp', 500, 'Compras Gamarra', null, null) \\g /dev/null
select c.id as fondo from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = :'ana_p' \\gset
${como(ANA)}${firma("gasto_viaje_registrar")}
select retail.registrar_gasto_viaje('mercaderia', 'flete', 80, retail.fn_hoy_lima(), 'boleta', 'efectivo', :'fondo', null, null, null, null, null) \\g /dev/null
${rendicionConDeuda("r1", 400)}
select c.id as caja_fuerte from retail.cuentas_dinero c where c.tipo = 'caja_fuerte' order by c.orden limit 1 \\gset
select c.id as cajon from retail.cuentas_dinero c where c.tipo = 'cajon' order by c.orden limit 1 \\gset
`;

const linea = (clave) => (s) => s.match(new RegExp(`^${clave}\\|.*$`, "m"))?.[0] ?? `${clave}: (sin salida)`;

const CASOS = [
  {
    nombre: "quien recibe la plata registra el pago: la deuda baja en Fondos y en «Tu fondo», el Diario va contra la 1419 y el token no duplica",
    sql: `select 'antes|' || pg_temp.debe(:'ana_p');
${como(FELIPE)}${firma("fondo_deuda_pagar")}
select gen_random_uuid() as token \\gset
select retail.pagar_deuda_fondo(:'ana_p', 15, :'bcp', 'Devolvió en efectivo', null, :'token') as pago \\gset
select 'otra_vez|' || (retail.pagar_deuda_fondo(:'ana_p', 15, :'bcp', 'Devolvió en efectivo', null, :'token') = :'pago')::text
  || '|' || (select count(*) from retail.movimientos_dinero d where d.tipo = 'pago_deuda_fondo' and d.rendicion_id = :'r1');
${sinFirma}
select 'fondos|' || string_agg(d.faltante || ':' || d.pagado || ':' || d.debe || ':' || d.es_mio, ',') from retail.fn_deudas_fondo() d where d.persona_id = :'ana_p';
select 'lista|' || m.tipo || '|' || m.persona_nombre || '|' || m.cuenta_nombre || '|' || m.monto || '|' || m.motivo || '|' || m.puede_anular
  from retail.fn_fondos_movimientos(:'ana_p', 50) m where m.id = :'pago';
select 'diario|' || pg_temp.asiento(:'pago');
${como(ANA)}${sinFirma}
select 'tu_fondo|' || t.deuda from retail.fn_mi_fondo_rendicion() t;`,
    revisa: (s) => [
      !/^antes\|20\.00$/m.test(s) && `Ana debía 20 (500 − 80 − 400) — ${linea("antes")(s)}`,
      !/^otra_vez\|true\|1$/m.test(s) && `el mismo token devuelve el mismo pago y no lo duplica — ${linea("otra_vez")(s)}`,
      !/^fondos\|20\.00:15\.00:5\.00:false$/m.test(s) && `Fondos por rendir: faltante 20, pagado 15, debe 5 — ${linea("fondos")(s)}`,
      !/^lista\|pago_deuda_fondo\|Ana Prueba Deuda\|BCP prueba deuda\|15\.00\|Devolvió en efectivo\|true$/m.test(s) &&
        `la lista de Fondos muestra el pago, anulable por Felipe — ${linea("lista")(s)}`,
      !/^diario\|104:15\.00:0\.00,1419:0\.00:15\.00$/m.test(s) && `el Diario: entra al banco (104) y baja la 1419 — ${linea("diario")(s)}`,
      !/^tu_fondo\|5\.00$/m.test(s) && `«Tu fondo» dice que debe 5, no 20 — ${linea("tu_fondo")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "no se paga: más de lo que debe, la propia deuda, a un cajón o a un fondo, a quien no debe, sin el módulo",
    sql: `${como(FELIPE)}${firma("fondo_deuda_pagar")}
select 'mucho|' || pg_temp.intento(format('select retail.pagar_deuda_fondo(%L, 21, %L)', :'ana_p', :'bcp'));
select 'cajon|' || pg_temp.intento(format('select retail.pagar_deuda_fondo(%L, 5, %L)', :'ana_p', :'cajon'));
select 'a_su_fondo|' || pg_temp.intento(format('select retail.pagar_deuda_fondo(%L, 5, %L)', :'ana_p', :'fondo'));
select 'sin_deuda|' || pg_temp.intento(format('select retail.pagar_deuda_fondo(%L, 5, %L)', :'beto_p', :'bcp'));
select 'cero|' || pg_temp.intento(format('select retail.pagar_deuda_fondo(%L, 0, %L)', :'ana_p', :'bcp'));
select 'futura|' || pg_temp.intento(format('select retail.pagar_deuda_fondo(%L, 5, %L, null, %L)', :'ana_p', :'bcp', retail.fn_hoy_lima() + 1));
-- Con Fondos por rendir en su rol, Ana tampoco registra el pago de su propia deuda.
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'fondos') on conflict do nothing;
${como(ANA)}${firma("fondo_deuda_pagar")}
select 'propia|' || pg_temp.intento(format('select retail.pagar_deuda_fondo(%L, 5, %L)', :'ana_p', :'bcp'));
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'fondos';
${como(MICAELA)}${firma("fondo_deuda_pagar")}
select 'micaela|' || pg_temp.intento(format('select retail.pagar_deuda_fondo(%L, 5, %L)', :'ana_p', :'bcp'));
select 'micaela_lee|' || pg_temp.intento('select * from retail.fn_deudas_fondo()');
select 'quedo|' || pg_temp.debe(:'ana_p');`,
    revisa: (s) => [
      !/^mucho\|P0001\|fondo_deuda_excedida\|Debe S\/ 20\.00/m.test(s) && `más de lo que debe — ${linea("mucho")(s)}`,
      !/^cajon\|P0001\|\|Lo que se paga de una deuda entra a un banco/m.test(s) && `a un cajón no — ${linea("cajon")(s)}`,
      !/^a_su_fondo\|P0001\|\|Lo que se paga de una deuda entra a un banco/m.test(s) && `a su propio fondo no — ${linea("a_su_fondo")(s)}`,
      !/^sin_deuda\|P0001\|fondo_sin_deuda\|/m.test(s) && `a quien no debe nada — ${linea("sin_deuda")(s)}`,
      !/^cero\|P0001\|\|El monto tiene que ser mayor que cero/m.test(s) && `cero — ${linea("cero")(s)}`,
      !/^futura\|P0001\|\|La fecha no puede ser futura/m.test(s) && `fecha futura — ${linea("futura")(s)}`,
      !/^propia\|42501\|fondo_propio\|/m.test(s) && `la persona que debe no registra su propio pago — ${linea("propia")(s)}`,
      !/^micaela\|42501\|/m.test(s) && `sin el módulo no se registra — ${linea("micaela")(s)}`,
      !/^micaela_lee\|42501\|/m.test(s) && `ni se lee — ${linea("micaela_lee")(s)}`,
      !/^quedo\|20\.00$/m.test(s) && `nada de eso tocó la deuda — ${linea("quedo")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "dos deudas: se paga primero la más vieja; anular devuelve la deuda; ni la persona ni «Cuentas y dinero» lo anulan",
    sql: `-- Una segunda rendición con deuda: Ana tiene 400, paga un taxi de 10 y rinde 380.
${como(ANA)}${firma("gasto_viaje_registrar")}
select retail.registrar_gasto_viaje('viaje', 'taxi', 10, retail.fn_hoy_lima(), 'planilla_movilidad', 'efectivo', :'fondo', null, null, null, null, null) \\g /dev/null
${rendicionConDeuda("r2", 380)}
-- En esta transacción las dos se aprobaron a la misma hora: la primera, una hora antes (su disparador no deja tocarla: se apaga aquí).
set local session_replication_role = replica;
update retail.rendiciones_fondo set aprobada_en = aprobada_en - interval '1 hour' where id = :'r1';
set local session_replication_role = origin;
select 'deudas|' || pg_temp.debe(:'ana_p');
${como(FELIPE)}${firma("fondo_deuda_pagar")}
select retail.pagar_deuda_fondo(:'ana_p', 25, :'caja_fuerte', null, null, null) \\g /dev/null
select 'reparto|' || string_agg(case d.rendicion_id when :'r1' then 'r1' else 'r2' end || ':' || d.monto, ',' order by d.monto desc)
  from retail.movimientos_dinero d where d.tipo = 'pago_deuda_fondo' and d.rendicion_id in (:'r1', :'r2');
select d.id as pago_r2 from retail.movimientos_dinero d where d.tipo = 'pago_deuda_fondo' and d.rendicion_id = :'r2' \\gset
select 'cuentas|' || pg_temp.intento(format('select retail.anular_movimiento_dinero(%L, %L)', :'pago_r2', 'Prueba'));
select 'cuentas_ofrece|' || m.puede_anular from retail.fn_movimientos_dinero(null, 500) m where m.id = :'pago_r2';
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'fondos') on conflict do nothing;
${como(ANA)}${firma("fondo_deuda_anular")}
select 'ana_anula|' || pg_temp.intento(format('select retail.anular_pago_deuda_fondo(%L, %L)', :'pago_r2', 'Me equivoqué'));
${como(FELIPE)}${firma("fondo_deuda_anular")}
select 'sin_motivo|' || pg_temp.intento(format('select retail.anular_pago_deuda_fondo(%L, %L)', :'pago_r2', ' '));
select 'anula|' || pg_temp.intento(format('select retail.anular_pago_deuda_fondo(%L, %L)', :'pago_r2', 'Se registró dos veces'));
select 'otra_vez|' || pg_temp.intento(format('select retail.anular_pago_deuda_fondo(%L, %L)', :'pago_r2', 'Otra vez'));
select 'despues|' || pg_temp.debe(:'ana_p') || '|' || string_agg(x.debe::text, ',' order by x.aprobada_en)
  from retail.fn_deudas_fondo_de(retail.fn_hoy_lima()) x where x.persona_id = :'ana_p';`,
    revisa: (s) => [
      !/^deudas\|30\.00$/m.test(s) && `debe 20 de la primera y 10 de la segunda — ${linea("deudas")(s)}`,
      !/^reparto\|r1:20\.00,r2:5\.00$/m.test(s) && `25 pagan los 20 de la más vieja y 5 de la otra — ${linea("reparto")(s)}`,
      !/^cuentas\|P0001\|\|El pago de una deuda de fondo se anula en Compras ▸ Fondos por rendir/m.test(s) && `Cuentas y dinero no lo anula — ${linea("cuentas")(s)}`,
      !/^cuentas_ofrece\|false$/m.test(s) && `ni lo ofrece para anular — ${linea("cuentas_ofrece")(s)}`,
      !/^ana_anula\|42501\|fondo_propio\|/m.test(s) && `la persona que debe no lo anula — ${linea("ana_anula")(s)}`,
      !/^sin_motivo\|P0001\|\|Di por qué se anula/m.test(s) && `sin motivo no — ${linea("sin_motivo")(s)}`,
      !/^anula\|SIN_ERROR$/m.test(s) && `Felipe lo anula con su motivo — ${linea("anula")(s)}`,
      !/^otra_vez\|P0001\|\|Ese pago ya estaba anulado/m.test(s) && `no se anula dos veces — ${linea("otra_vez")(s)}`,
      !/^despues\|10\.00\|0\.00,10\.00$/m.test(s) && `anulado, la segunda vuelve a deber 10 — ${linea("despues")(s)}`,
    ].filter(Boolean),
  },
  {
    nombre: "el Balance: la 1419 y la 1413 por dos caminos, y «¿Cuadra?» las compara",
    sql: `${como(FELIPE)}${firma("fondo_deuda_pagar")}
select retail.pagar_deuda_fondo(:'ana_p', 8, :'bcp') \\g /dev/null
${sinFirma}
-- El Diario de todo lo de la prueba (y lo que la base ya tenía), contra el otro camino del Balance.
select 'c1419|' || (select coalesce(sum(a.debe - a.haber), 0) from retail.fn_asientos(date '2000-01-01', retail.fn_hoy_lima(), null) a where a.cuenta = '1419')
  || '|' || (select coalesce(sum(o.saldo), 0) from retail.fn_bal_otro_camino(retail.fn_hoy_lima()) o where o.cuenta = '1419');
select 'c1413|' || ((select coalesce(sum(a.debe - a.haber), 0) from retail.fn_asientos(date '2000-01-01', retail.fn_hoy_lima(), null) a where a.cuenta = '1413')
  = (select coalesce(sum(o.saldo), 0) from retail.fn_bal_otro_camino(retail.fn_hoy_lima()) o where o.cuenta = '1413'))::text;
select 'filas|' || (position($q$(14, '1413'$q$ in pg_get_functiondef('retail.fn_conciliacion_contable(date)'::regprocedure)) > 0)::text
  || '|' || (position($q$(15, '1419'$q$ in pg_get_functiondef('retail.fn_conciliacion_contable(date)'::regprocedure)) > 0)::text;`,
    revisa: (s) => {
      const m = s.match(/^c1419\|(-?[\d.]+)\|(-?[\d.]+)$/m);
      return [
        !m && `c1419 — ${linea("c1419")(s)}`,
        m && Number(m[1]) !== Number(m[2]) && `la 1419 del Diario (${m[1]}) y lo que falta pagar (${m[2]}) no son iguales`,
        m && !(Number(m[2]) >= 12) && `lo que falta pagar incluye los 12 de Ana (20 − 8) — ${linea("c1419")(s)}`,
        !/^c1413\|true$/m.test(s) && `la 1413 del Diario y lo que tienen los fondos tienen que ser iguales — ${linea("c1413")(s)}`,
        !/^filas\|true\|true$/m.test(s) && `«¿Cuadra?» compara la 1413 y la 1419 — ${linea("filas")(s)}`,
      ].filter(Boolean);
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
console.log(`\n${CASOS.length - fallas}/${CASOS.length} casos de la deuda de un fondo pasan.`);
process.exit(fallas ? 1 : 0);
