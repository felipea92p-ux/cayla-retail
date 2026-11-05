#!/usr/bin/env node
/**
 * Prueba de ADR-0585, actividad 2 — el estado de cambios en el patrimonio (`20261030235100_estados_financieros_cambios_en_el_patrimonio.sql`).
 *
 * QUÉ CUBRE
 *   · Lo tuyo al empezar y al cerrar el mes es la sección «patrimonio» del Balance a esas dos fechas (el mismo diario).
 *   · Lo que lo movió: la ganancia es el «Resultado del mes» del Balance, los aportes son la plata que puso el dueño y los retiros, la
 *     que sacó; y `otros` (lo que esos tres no explican) es 0.
 *   · Un mes no se mezcla con el siguiente: el retiro de abril no está en marzo, y lo tuyo al empezar abril es lo de cerrar marzo.
 *   · La serie: lo tuyo al cierre de cada mes, sin los meses anteriores al arranque.
 *   · Un mes anterior al arranque dice «sin arranque»; un mes que no empezó se rechaza.
 *   · Permisos: lo ve quien ve los Estados financieros de CAYLA entera (el líder o quien tiene el módulo); sin el módulo, 42501; anon no.
 *
 * LA ESCENA vive en MARZO Y ABRIL DE 2024 (la base local no tiene datos de nadie ahí): todo lo de antes queda dentro de los saldos de
 * arranque del 1-mar (la propuesta del sistema, utilidades 1,000 y el capital que cuadra, como `balance.mjs`). Marzo: el dueño aporta
 * 1,000 (12-mar), se paga internet de la empresa 100 por transferencia (15-mar) y retira 300 (25-mar). Abril: retira 50 (5-abr).
 *
 * CÓMO. Cada escena en su transacción con ROLLBACK (la base la comparten otras sesiones), sesión simulada con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:patrimonio-cambios    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}');\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1500)}`);
  }
}
/** Cada verificación sale como una línea `caso|t`. Se exige que estén TODAS y en verdadero. */
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const i = l.lastIndexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
  for (const caso of esperados)
    esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-900) });
}
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

const ESCENA = `
begin;
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
${cambiaA(FELIPE)}
-- Finanzas cuenta desde siempre (si no, una base con «cuenta desde» puesto no dejaría anotar en 2024).
update retail.parametros_finanzas set inicio_finanzas = null where id;
select retail.crear_cuenta_dinero('BCP prueba patrimonio', 'banco', 5000, '2024-03-01') as bcp \\gset

-- EL ARRANQUE: la propuesta del sistema para el 1-mar + utilidades 1,000; el capital, lo que falta para cuadrar.
create temp table prop_sis as select * from retail.fn_saldos_iniciales_propuesta('2024-03-01') where origen = 'sistema';
select (select jsonb_agg(jsonb_build_object('cuenta', cuenta, 'monto', monto, 'origen', 'sistema')) from prop_sis)
    || jsonb_build_array(
         jsonb_build_object('cuenta', '591', 'monto', 1000),
         jsonb_build_object('cuenta', '50', 'monto',
           (select sum(case when tipo = 'activo' and cuenta not like '39%' then monto when cuenta like '39%' then -monto
                            when tipo = 'pasivo' then -monto else 0 end) from prop_sis) - 1000)) as lineas \\gset
select retail.registrar_saldo_inicial('2024-03-01', :'lineas'::jsonb) as filas_arranque \\gset

-- Marzo y abril.
select retail.registrar_movimiento_dinero('aporte', 1000, null, :'bcp', '2024-03-12', 'Aporte patrimonio') as aporte \\gset
select retail.registrar_gasto(null, 'servicios_basicos', 'Internet patrimonio', '2024-03-15', 100, null, 'transferencia') as gasto \\gset
select retail.registrar_movimiento_dinero('retiro', 300, :'bcp', null, '2024-03-25', 'Retiro patrimonio') as retiro \\gset
select retail.registrar_movimiento_dinero('retiro', 50, :'bcp', null, '2024-04-05', 'Retiro de abril') as retiro_abril \\gset

create temp table mar as select retail.fn_patrimonio_cambios('2024-03-01', 3) as j;
create temp table abr as select retail.fn_patrimonio_cambios('2024-04-01', 2) as j;
create temp table pat_feb as select coalesce(sum(monto), 0) as t from retail.fn_balance_general('2024-02-29') where seccion = 'patrimonio';
create temp table pat_mar as select coalesce(sum(monto), 0) as t from retail.fn_balance_general('2024-03-31') where seccion = 'patrimonio';
create temp table res_mar as select monto as t from retail.fn_balance_general('2024-03-31') where cuenta = 'resultado_mes';
`;

const CASOS_MES = `
select 'M1 los aportes de marzo son los 1,000 que puso el dueño', (select (j ->> 'aportes')::numeric = 1000 from mar);
select 'M2 los retiros de marzo son los 300 (el retiro de abril no entra)', (select (j ->> 'retiros')::numeric = 300 from mar);
select 'M3 cuadra: lo que no explican la ganancia, los aportes y los retiros es 0', (select (j ->> 'otros')::numeric = 0 from mar);
select 'M4 lo tuyo al cerrar marzo es la sección «patrimonio» del Balance al 31-mar', (select (j -> 'fin' ->> 'total')::numeric = (select t from pat_mar) from mar);
select 'M5 lo tuyo al empezar marzo es la del Balance al 29-feb (el arranque)', (select (j -> 'inicio' ->> 'total')::numeric = (select t from pat_feb) from mar);
select 'M6 la ganancia es el «Resultado del mes» del Balance (y el internet la deja en negativo)',
  (select (j ->> 'ganancia')::numeric = (select t from res_mar) and (j ->> 'ganancia')::numeric < 0 from mar);
select 'M7 al empezar: las utilidades del arranque (1,000) y ningún aporte; al cerrar, la 52 trae el aporte',
  (select (j -> 'inicio' ->> 'utilidades')::numeric = 1000 and (j -> 'inicio' ->> 'aportes')::numeric = 0
          and (j -> 'fin' ->> 'aportes')::numeric = 1000 from mar);
select 'M8 el total es capital + aportes + utilidades',
  (select (j -> 'fin' ->> 'total')::numeric = (j -> 'fin' ->> 'capital')::numeric + (j -> 'fin' ->> 'aportes')::numeric + (j -> 'fin' ->> 'utilidades')::numeric from mar);
select 'A1 abril empieza donde cerró marzo', (select (a.j -> 'inicio' ->> 'total')::numeric = (m.j -> 'fin' ->> 'total')::numeric from abr a, mar m);
select 'A2 los retiros de abril son los 50, sin los de marzo', (select (j ->> 'retiros')::numeric = 50 and (j ->> 'aportes')::numeric = 0 from abr);
select 'S1 la serie de marzo (3 meses) empieza en el arranque: febrero (lo de arrancar) y marzo, sin enero',
  (select jsonb_array_length(j -> 'serie') = 2 and (j -> 'serie' -> 0 ->> 'mes') = '2024-02-01' and (j -> 'serie' -> 1 ->> 'mes') = '2024-03-01' from mar);
select 'S2 el último punto de la serie es lo tuyo al cerrar el mes', (select (j -> 'serie' -> -1 ->> 'total')::numeric = (j -> 'fin' ->> 'total')::numeric from mar);
select 'S3 la serie de abril (2 meses) trae marzo y abril, con los mismos números', (select jsonb_array_length(a.j -> 'serie') = 2
  and (a.j -> 'serie' -> 0 ->> 'total')::numeric = (m.j -> 'fin' ->> 'total')::numeric from abr a, mar m);
select 'L1 un mes anterior al arranque dice «sin arranque»', (select (retail.fn_patrimonio_cambios('2024-01-01') ->> 'sin_arranque')::boolean);
select 'L2 un mes que todavía no empieza se rechaza', (select pg_temp.intento($$select retail.fn_patrimonio_cambios('2099-01-01')$$) like '%todavía no empieza%');
`;

const CASOS_PERMISOS = `
${cambiaA(MICAELA)}
select 'P1 sin el módulo no lo ve (42501, con su motivo)', (select pg_temp.intento($$select retail.fn_patrimonio_cambios('2024-03-01')$$) like '%Estados financieros%');
${conModulo("reportes_financieros")}
select 'P2 con el módulo ve lo mismo que el líder', (select retail.fn_patrimonio_cambios('2024-03-01', 3) = j from mar);
reset role;
select 'P3 anon no la llama; una sesión sí', not has_function_privilege('anon', 'retail.fn_patrimonio_cambios(date, integer)', 'execute')
  and has_function_privilege('authenticated', 'retail.fn_patrimonio_cambios(date, integer)', 'execute');
select 'P4 solo lee (STABLE)', (select provolatile = 's' from pg_proc where oid = 'retail.fn_patrimonio_cambios(date, integer)'::regprocedure);
`;

verificar("Un mes y el siguiente", correr(`${ESCENA}${CASOS_MES}`), casosDe(CASOS_MES));
verificar("Permisos", correr(`${ESCENA}${CASOS_PERMISOS}`), casosDe(CASOS_PERMISOS));

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);
