#!/usr/bin/env node
/**
 * Prueba de ADR-0585, actividad 8 — los saldos por cuenta de un mes (`20261031120000_estados_financieros_saldos_por_cuenta.sql`),
 * la «balanza de comprobación» que se descarga para el contador.
 *
 * QUÉ CUBRE
 *   · Cuadra: la suma de los saldos al cerrar de todas las cuentas es 0, y cada fila cumple saldo inicial + debe − haber = saldo final.
 *   · Es el mismo diario que el Balance: lo que tiene (activo) y lo tuyo (patrimonio) al 31-mar coinciden con `fn_balance_general`.
 *   · Las cuentas de ingreso y gasto del mes dan la ganancia de `fn_patrimonio_cambios`.
 *   · Lo de cada cuenta: el arranque en el saldo inicial (utilidades 1,000), el aporte (1,000 al haber de la 52) y el retiro (300 al
 *     debe de la 591) dentro de marzo; abril empieza donde cerró marzo, con su propio retiro.
 *   · Un mes anterior al arranque y uno que no empezó se rechazan.
 *   · Permisos: lo ve quien ve los Estados financieros de CAYLA entera (el líder o quien tiene el módulo); sin el módulo, 42501; anon no.
 *
 * LA ESCENA vive en MARZO Y ABRIL DE 2024 (la base local no tiene datos de nadie ahí): todo lo de antes queda dentro de los saldos de
 * arranque del 1-mar (la propuesta del sistema, utilidades 1,000 y el capital que cuadra, como `balance.mjs`). Marzo: el dueño aporta
 * 1,000 (12-mar), se paga internet de la empresa 100 por transferencia (15-mar) y retira 300 (25-mar). Abril: retira 50 (5-abr).
 *
 * CÓMO. Cada escena en su transacción con ROLLBACK (la base la comparten otras sesiones), sesión simulada con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:saldos-por-cuenta     → con las migraciones ya aplicadas en el local
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
select retail.crear_cuenta_dinero('BCP prueba saldos', 'banco', 5000, '2024-03-01') as bcp \\gset

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

create temp table mar as select * from retail.fn_saldos_por_cuenta('2024-03-01');
create temp table abr as select * from retail.fn_saldos_por_cuenta('2024-04-01');
create temp table pat as select retail.fn_patrimonio_cambios('2024-03-01', 1) as j;
create temp table bal as select seccion, coalesce(sum(monto), 0) as t from retail.fn_balance_general('2024-03-31') group by seccion;
`;

const CASOS_MES = `
select 'C1 cuadra: la suma de los saldos al cerrar de todas las cuentas es 0', (select round(sum(saldo_final), 2) = 0 from mar);
select 'C2 cada fila: saldo inicial + debe − haber = saldo final', (select bool_and(saldo_inicial + debe - haber = saldo_final) from mar)
  and (select bool_and(saldo_inicial + debe - haber = saldo_final) from abr);
select 'C3 cada cuenta trae su nombre y su tipo del plan de cuentas', (select bool_and(nombre is not null and tipo is not null) from mar);
select 'B1 lo que tiene al 31-mar es el activo del Balance', (select round(sum(saldo_final), 2) from mar where tipo = 'activo') = (select t from bal where seccion = 'activo');
select 'B2 lo tuyo al 31-mar es el patrimonio del Balance (patrimonio + resultados sin cerrar, con el signo del haber)',
  (select round(-sum(saldo_final), 2) from mar where tipo in ('patrimonio', 'ingreso', 'gasto')) = (select t from bal where seccion = 'patrimonio');
select 'G1 ingresos y gastos del mes dan la ganancia de ¿Lo tuyo creció?',
  (select round(-sum(debe - haber), 2) from mar where tipo in ('ingreso', 'gasto')) = (select (j ->> 'ganancia')::numeric from pat);
select 'U1 el arranque va en el saldo inicial: utilidades 1,000 (al haber)', (select saldo_inicial = -1000 from mar where cuenta = '591');
select 'U2 el retiro de marzo es el debe de la 591 (300), sin el de abril', (select debe = 300 from mar where cuenta = '591');
select 'U3 el aporte de marzo es el haber de la 52 (1,000)', (select haber = 1000 and saldo_inicial = 0 and saldo_final = -1000 from mar where cuenta = '52');
select 'A1 abril empieza donde cerró marzo, cuenta por cuenta',
  (select bool_and(coalesce(a.saldo_inicial, 0) = m.saldo_final) from mar m left join abr a on a.cuenta = m.cuenta);
select 'A2 el retiro de abril es el debe de la 591 en abril (50)', (select debe = 50 from abr where cuenta = '591');
select 'L1 un mes anterior al arranque se rechaza', (select pg_temp.intento($$select * from retail.fn_saldos_por_cuenta('2024-01-01')$$) like '%anterior al arranque%');
select 'L2 un mes que todavía no empieza se rechaza', (select pg_temp.intento($$select * from retail.fn_saldos_por_cuenta('2099-01-01')$$) like '%todavía no empieza%');
`;

const CASOS_PERMISOS = `
${cambiaA(MICAELA)}
select 'P1 sin el módulo no lo ve (42501, con su motivo)', (select pg_temp.intento($$select * from retail.fn_saldos_por_cuenta('2024-03-01')$$) like '%Estados financieros%');
${conModulo("reportes_financieros")}
create temp table modulo as select * from retail.fn_saldos_por_cuenta('2024-03-01');
select 'P2 con el módulo ve lo mismo que el líder',
  not exists (select * from modulo except select * from mar) and not exists (select * from mar except select * from modulo);
reset role;
select 'P3 anon no la llama; una sesión sí', not has_function_privilege('anon', 'retail.fn_saldos_por_cuenta(date)', 'execute')
  and has_function_privilege('authenticated', 'retail.fn_saldos_por_cuenta(date)', 'execute');
select 'P4 solo lee (STABLE)', (select provolatile = 's' from pg_proc where oid = 'retail.fn_saldos_por_cuenta(date)'::regprocedure);
`;

verificar("Un mes y el siguiente", correr(`${ESCENA}${CASOS_MES}`), casosDe(CASOS_MES));
verificar("Permisos", correr(`${ESCENA}${CASOS_PERMISOS}`), casosDe(CASOS_PERMISOS));

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);
