#!/usr/bin/env node
/**
 * Prueba de ADR-0713 — Un retiro dice quién se lleva la plata y para qué (`20261127150000_retiro_dice_quien_y_para_que.sql`).
 *
 * EL PROBLEMA. «Plata del dueño» contaba lo que salió de CAYLA por quien lo ANOTÓ: dos retiros de la caja fuerte de AQP que anotó una encargada
 * salían como plata que ella sacó, aunque uno se lo llevó Felipe y el otro era un ajuste del cuadre, sin motivo escrito.
 *
 * QUÉ CUBRE
 *   · un retiro sin quién, con alguien que no es colaborador o sin para qué no se guarda, y una devolución sin quién tampoco;
 *   · nada queda a medias: un retiro del cajón rechazado no deja su egreso de caja;
 *   · el retiro completo guarda a quien se la llevó (no a quien lo anotó) y `fn_quien_se_la_llevo` lo nombra, solo para el líder;
 *   · un aporte no pide quién y no lo guarda; la tabla no acepta quién en un movimiento que no saca plata.
 *
 * CÓMO. Como `cuentas_dinero.mjs`: cada escenario en su transacción con ROLLBACK, sesión simulada con `request.jwt.claim.sub`, y la persona
 * que se lleva la plata en `request.headers` (lo que manda la pantalla en `x-se-la-lleva`).
 *
 * USO
 *   pnpm pruebas:retiro-quien-y-para-que
 *   pnpm pruebas:retiro-quien-y-para-que -- --con-migracion supabase/migrations/20261127150000_retiro_dice_quien_y_para_que.sql
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_MIGRACION = process.argv.indexOf("--con-migracion");
const MIGRACION_EN_LA_TRANSACCION = ARG_MIGRACION > 0 ? readFileSync(process.argv[ARG_MIGRACION + 1], "utf8") : "";
const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
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
// Lo que manda la pantalla: quién se lleva la plata (o nada).
const seLaLleva = (expr) => `select set_config('request.headers', ${expr === null ? "'{}'" : `json_build_object('x-se-la-lleva', ${expr})::text`}, true) as _h \\gset\n`;

/** Felipe registra; la plata se la lleva OTRA persona (un colaborador que no es él), para probar que se guarda quién se la llevó y no quién anotó.
 *  Un banco con S/ 1,000 y la caja de Trujillo abierta con S/ 1,000. */
const ESCENA = `
begin;
${MIGRACION_EN_LA_TRANSACCION}
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
select retail.fn_actor_persona_id(false) as yo \\gset
select c.persona_id as otro, trim(concat_ws(' ', p.nombres, p.apellidos)) as otro_nombre
  from retail.colaboradores c join public.personas p on p.id = c.persona_id
 where c.persona_id <> :'yo' order by c.persona_id limit 1 \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as cajon_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'cajon' \\gset
select retail.crear_cuenta_dinero('BCP prueba ADR-0713', 'banco', 1000, retail.fn_hoy_lima() - 20) as bcp \\gset
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Sin quién, con quien no es colaborador o sin para qué: no se guarda.
{
  const r = correr(`${ESCENA}
select retail.registrar_movimiento_dinero('prestamo', 10, null, :'bcp') is not null as _pr \\gset
${seLaLleva(null)}
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''retiro'', 100, %L, null, null, ''Para la casa'')', :'bcp'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''devolucion_prestamo'', 1, %L)', :'bcp'));
${seLaLleva("gen_random_uuid()")}
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''retiro'', 100, %L, null, null, ''Para la casa'')', :'bcp'));
${seLaLleva(":'otro'")}
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''retiro'', 100, %L)', :'bcp'));
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''retiro'', 100, %L, null, null, ''   '')', :'bcp'));
select count(*) from retail.movimientos_dinero where cuenta_origen_id = :'bcp';`);
  const [sinQuien, devolucionSinQuien, noColaborador, sinParaQue, paraQueVacio, guardados] = lineas(r);
  esperar("un retiro sin quién se lleva la plata no se guarda", r.ok && sinQuien === "Di quién se lleva la plata.", r);
  esperar("una devolución sin quién tampoco", r.ok && devolucionSinQuien === "Di quién se lleva la plata.", r);
  esperar("quien se la lleva tiene que ser un colaborador", r.ok && noColaborador.includes("tiene que ser un colaborador"), r);
  esperar("un retiro sin para qué no se guarda", r.ok && sinParaQue === "Di para qué es el retiro.", r);
  esperar("un para qué en blanco cuenta como sin para qué", r.ok && paraQueVacio === "Di para qué es el retiro.", r);
  esperar("ninguno de los rechazados dejó un movimiento", r.ok && guardados === "0", r);
}

// 2. Nada a medias: un retiro del cajón rechazado no deja su egreso de caja.
{
  const r = correr(`${ESCENA}
${seLaLleva(null)}
select count(*) as antes from retail.caja_movimientos where caja_id = :'caja' \\gset
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''retiro'', 50, %L, null, null, ''Para la casa'', 0, %L)', :'cajon_tru', :'caja'));
select count(*) - :antes from retail.caja_movimientos where caja_id = :'caja';
${seLaLleva(":'otro'")}
select retail.registrar_movimiento_dinero('retiro', 50, :'cajon_tru', null, null, 'Para la casa', 0, :'caja') as r \\gset
select count(*) - :antes from retail.caja_movimientos where caja_id = :'caja';
select se_la_lleva_persona_id = :'otro' from retail.movimientos_dinero where id = :'r';`);
  const [rechazo, egresosTrasRechazo, egresosTrasGuardar, quien] = lineas(r);
  esperar("el retiro del cajón sin quién se rechaza", r.ok && rechazo === "Di quién se lleva la plata.", r);
  esperar("y no deja su egreso de caja", r.ok && egresosTrasRechazo === "0", r);
  esperar("completo, guarda el movimiento con su único egreso y su quién", r.ok && egresosTrasGuardar === "1" && quien === "t", r);
}

// 3. El retiro completo guarda a quien se la llevó, no a quien lo anotó; la lectura lo nombra, solo para el líder.
{
  const r = correr(`${ESCENA}
${seLaLleva(":'otro'")}
select retail.registrar_movimiento_dinero('retiro', 300, :'bcp', null, null, 'Para la casa') as r \\gset
select se_la_lleva_persona_id = :'otro', registrado_por = :'yo', referencia from retail.movimientos_dinero where id = :'r';
select nombre = :'otro_nombre' from retail.fn_quien_se_la_llevo() where movimiento_id = :'r';
${cambiaA(MICAELA)}
select pg_temp.intento('select * from retail.fn_quien_se_la_llevo()');`);
  const [fila, nombre, noLider] = lineas(r);
  esperar("guarda quién se la llevó (no quién la anotó) y el para qué", r.ok && fila === "t|t|Para la casa", r);
  esperar("fn_quien_se_la_llevo la nombra", r.ok && nombre === "t", r);
  esperar("ver quién se la llevó es del líder", r.ok && noLider.includes("es del líder"), r);
}

// 4. Lo que no saca plata no pide quién y la tabla no lo acepta.
{
  const r = correr(`${ESCENA}
${seLaLleva(":'otro'")}
select retail.registrar_movimiento_dinero('aporte', 100, null, :'bcp') as a \\gset
select se_la_lleva_persona_id is null from retail.movimientos_dinero where id = :'a';
${seLaLleva(null)}
select pg_temp.intento(format('select retail.registrar_movimiento_dinero(''aporte'', 100, null, %L)', :'bcp'));
select pg_temp.intento(format('update retail.movimientos_dinero set se_la_lleva_persona_id = %L where id = %L', :'otro', :'a'));
select count(*) from pg_constraint where conname = 'movimientos_dinero_se_la_lleva_solo_al_sacar' and contype = 'c';`);
  const [nulo, aporteSinQuien, , candado] = lineas(r);
  esperar("un aporte no guarda quién, aunque la pantalla lo mande", r.ok && nulo === "t", r);
  esperar("un aporte sin quién se guarda", r.ok && aporteSinQuien === "SIN_ERROR", r);
  esperar("la tabla tiene el candado «quién, solo al sacar»", r.ok && candado === "1", r);
}

console.log(fallos ? `\n${fallos} de ${casos} casos fallaron` : `\nTodo en orden (${casos} casos)`);
process.exit(fallos ? 1 : 0);
