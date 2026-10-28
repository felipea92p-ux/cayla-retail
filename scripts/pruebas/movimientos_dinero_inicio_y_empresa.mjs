#!/usr/bin/env node
/**
 * Prueba del piso de fecha de un movimiento de dinero y de lo de la empresa en la lista de una tienda — ADR-0417, act. 2026-10-17
 * (`20261017143000_movimientos_dinero_desde_el_inicio_y_la_empresa_en_toda_vista.sql`: la mitad en la base de los dos hallazgos
 * de /chaos del 2026-10-16 sobre «Registrar movimiento»).
 *
 * QUÉ CUBRE
 *   · EL PISO DE FECHA: con inicio de Finanzas, un pago de planilla de 1900 y una transferencia entre bancos del día anterior al inicio
 *     se rechazan con P0001, la pista `movimiento_antes_del_inicio` y el mismo mensaje que un gasto; el día del inicio entra; sin inicio
 *     elegido nada frena (como el gasto, ADR-0412); un depósito del cajón por un egreso ya registrado sigue entrando.
 *   · LO DE LA EMPRESA EN TODA VISTA: el líder, mirando Trujillo, ve el pago de la planilla, el pago a SUNAT y lo entre bancos (sin
 *     tienda) además de lo de Trujillo; mirando Lima los ve también y no ve lo de Trujillo; sin tienda pedida ve todo, y puede anular
 *     lo de la empresa. La colaboradora con el módulo sigue viendo solo lo de su tienda: ni la planilla ni SUNAT ni lo entre bancos.
 *   · PEGAR DOS VECES no cambia ninguna función; el piso queda antes del candado de la fecha futura; y las anclas de los parches
 *     vecinos (el `puede_anular` del fondo por rendir, el token de ADR-0412, los tipos de la 002000) siguen enteras.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK; fechas de 2019; sesión simulada con `request.jwt.claim.sub`.
 * La lista se pide con un límite enorme: la base de prueba puede tener más de 100 movimientos más nuevos que los de 2019.
 *
 * USO
 *   pnpm pruebas:movimientos-dinero-inicio-y-empresa
 *   node scripts/pruebas/movimientos_dinero_inicio_y_empresa.mjs --contenedor <otro>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20261017143000_movimientos_dinero_desde_el_inicio_y_la_empresa_en_toda_vista.sql"),
  "utf8"
);
const PUERTA = "retail.registrar_movimiento_dinero(text, numeric, uuid, uuid, date, text, numeric, uuid, uuid, uuid)";
const LISTA = "retail.fn_movimientos_dinero(uuid, integer)";
const MENSAJE = "Finanzas cuenta desde el 01/07/2019: un movimiento anterior no entraría a ningún reporte. Si lo pagaste ahora, ponle la fecha del pago.";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
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
function verificar(titulo, r, esperados) {
  if (!r.ok) {
    esperar(`${titulo}: la escena corre`, false, r);
    return;
  }
  const lineas = Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => l.split("|")));
  for (const [caso, valor] of Object.entries(esperados)) {
    esperar(`${titulo}: ${caso}`, lineas[caso] === valor, { esperado: valor, salio: lineas[caso], todo: lineas });
  }
}
/** Un bloque que tiene que fallar con el código, la pista y el mensaje dados; si no, la escena entera cae. */
const debeFallarCon = (nombre, sql, codigo, pista, mensaje) => `
do $$
declare v_pista text; v_msg text;
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado';
exception when others then
  get stacked diagnostics v_pista = pg_exception_hint, v_msg = message_text;
  if sqlstate <> '${codigo}' then raise; end if;
  if coalesce(v_pista, '') <> '${pista}' then raise exception '${nombre}: pista «%», se esperaba «${pista}»', coalesce(v_pista, ''); end if;
  if v_msg <> '${mensaje}' then raise exception '${nombre}: mensaje «%»', v_msg; end if;
end $$;
select '${nombre}|ok';`;

// Dos bancos de la empresa (sin tienda), Trujillo y Lima con su caja fuerte y su cajón.
const SEMILLA = `
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco A de prueba', 'banco', '104') returning id as banco_a \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable) values ('Banco B de prueba', 'banco', '104') returning id as banco_b \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as cajon_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'cajon' \\gset
select id as fuerte_tru from retail.cuentas_dinero where ubicacion_id = :'tru' and tipo = 'caja_fuerte' \\gset
`;
const BANCO_A = `(select id from retail.cuentas_dinero where nombre = 'Banco A de prueba')`;
const BANCO_B = `(select id from retail.cuentas_dinero where nombre = 'Banco B de prueba')`;

// ---------- Escena 1: el piso de fecha ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACION}
${SEMILLA}
update retail.parametros_finanzas set inicio_finanzas = '2019-07-01' where id;
${debeFallarCon("planilla_de_1900", `perform retail.registrar_movimiento_dinero('pago_planilla', 100, ${BANCO_A}, null, '1900-01-01', 'Planilla de 1900')`, "P0001", "movimiento_antes_del_inicio", MENSAJE)}
${debeFallarCon("entre_bancos_el_dia_anterior", `perform retail.registrar_movimiento_dinero('entre_cuentas', 100, ${BANCO_A}, ${BANCO_B}, '2019-06-30', null)`, "P0001", "movimiento_antes_del_inicio", MENSAJE)}
select 'nada_entro|' || count(*) from retail.movimientos_dinero where cuenta_origen_id = :'banco_a';
-- El día del inicio entra.
select retail.registrar_movimiento_dinero('pago_planilla', 100, :'banco_a', null, '2019-07-01', 'Planilla de junio 2019') as en_el_inicio \\gset
select 'en_el_inicio|' || fecha || ',' || estado from retail.movimientos_dinero where id = :'en_el_inicio';
-- Sin inicio elegido nada frena (como el gasto, ADR-0412).
update retail.parametros_finanzas set inicio_finanzas = null where id;
select 'sin_inicio|' || (retail.registrar_movimiento_dinero('pago_sunat', 50, :'banco_a', null, '2019-01-31', 'IGV de diciembre 2018') is not null);
-- Un depósito del cajón por un egreso ya registrado sigue entrando (la fecha la pone la caja, no la persona).
update retail.parametros_finanzas set inicio_finanzas = date_trunc('month', retail.fn_hoy_lima())::date where id;
select (select count(*) from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select retail.registrar_movimiento_caja(:'caja', 'egreso', 300, 'Depósito bancario', 'Voucher 7788', false, null::uuid) as egreso \\gset
select retail.registrar_movimiento_dinero('deposito', 300, :'cajon_tru', :'banco_a', null, null, 0, null, :'egreso') as dep \\gset
select 'cajon_sigue|' || (fecha = retail.fn_hoy_lima()) || ',' || (caja_movimiento_id = :'egreso') from retail.movimientos_dinero where id = :'dep';
`);
  verificar("piso de fecha", r, {
    planilla_de_1900: "ok",
    entre_bancos_el_dia_anterior: "ok",
    nada_entro: "0",
    en_el_inicio: "2019-07-01,vigente",
    sin_inicio: "true",
    cajon_sigue: "true,true",
  });
}

// ---------- Escena 2: lo de la empresa en la lista de una tienda ----------
{
  const CUATRO = `(:'planilla', :'sunat', :'entre', :'de_tru')`;
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACION}
${SEMILLA}
select retail.registrar_movimiento_dinero('pago_planilla', 1000, :'banco_a', null, '2019-07-20', 'Planilla de junio 2019') as planilla \\gset
select retail.registrar_movimiento_dinero('pago_sunat', 500, :'banco_a', null, '2019-07-20', 'IGV de junio 2019') as sunat \\gset
select retail.registrar_movimiento_dinero('entre_cuentas', 70, :'banco_a', :'banco_b', '2019-07-20', 'Entre bancos') as entre \\gset
select retail.registrar_movimiento_dinero('aporte', 200, null, :'fuerte_tru', '2019-07-20', 'Aporte a la caja fuerte de Trujillo') as de_tru \\gset
select 'sin_tienda|' || string_agg((ubicacion_id is null)::text, ',' order by tipo) from retail.movimientos_dinero where id in (:'planilla', :'sunat', :'entre');
select 'de_tru_con_tienda|' || (ubicacion_id = :'tru') from retail.movimientos_dinero where id = :'de_tru';
-- El líder mirando Trujillo: lo de Trujillo y lo de la empresa.
select 'tru_ve|' || string_agg(tipo, ',' order by tipo) from retail.fn_movimientos_dinero(:'tru', 1000000) where id in ${CUATRO};
-- Mirando Lima: lo de la empresa, no lo de Trujillo.
select 'lim_ve|' || string_agg(tipo, ',' order by tipo) from retail.fn_movimientos_dinero(:'lim', 1000000) where id in ${CUATRO};
-- Sin tienda pedida: todo, como siempre.
select 'todas_ve|' || string_agg(tipo, ',' order by tipo) from retail.fn_movimientos_dinero(null, 1000000) where id in ${CUATRO};
select 'lider_anula_lo_de_la_empresa|' || bool_and(puede_anular) from retail.fn_movimientos_dinero(:'tru', 1000000) where id in (:'planilla', :'sunat', :'entre');
-- La colaboradora con el módulo: solo lo de su tienda, nada de la empresa.
${cambiaA(MICAELA)}
${conModulo("cuentas_dinero")}
select 'colaboradora_ve|' || coalesce(string_agg(tipo || ':' || puede_anular, ',' order by tipo), 'nada') from retail.fn_movimientos_dinero(:'tru', 1000000) where id in ${CUATRO};
select 'colaboradora_sin_tienda_ve|' || coalesce(string_agg(tipo, ',' order by tipo), 'nada') from retail.fn_movimientos_dinero(null, 1000000) where id in ${CUATRO};
`);
  verificar("lo de la empresa en toda vista", r, {
    sin_tienda: "true,true,true",
    de_tru_con_tienda: "true",
    tru_ve: "aporte,entre_cuentas,pago_planilla,pago_sunat",
    lim_ve: "entre_cuentas,pago_planilla,pago_sunat",
    todas_ve: "aporte,entre_cuentas,pago_planilla,pago_sunat",
    lider_anula_lo_de_la_empresa: "true",
    colaboradora_ve: "aporte:false",
    colaboradora_sin_tienda_ve: "aporte",
  });
}

// ---------- Escena 3: pegar dos veces, el orden del piso y las anclas vecinas ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACION}
select md5(pg_get_functiondef('${PUERTA}'::regprocedure) || pg_get_functiondef('${LISTA}'::regprocedure)) as huella_1 \\gset
${MIGRACION}
select 'misma_huella|' || (md5(pg_get_functiondef('${PUERTA}'::regprocedure) || pg_get_functiondef('${LISTA}'::regprocedure)) = :'huella_1');
select 'piso_una_vez|' || (length(d) - length(replace(d, 'movimiento_antes_del_inicio', ''))) / length('movimiento_antes_del_inicio')
  from pg_get_functiondef('${PUERTA}'::regprocedure) d;
select 'piso_antes_del_futuro|' || (position('if v_fecha < retail.fn_finanzas_desde() then' in d) < position('if v_fecha > v_hoy then' in d))
  from pg_get_functiondef('${PUERTA}'::regprocedure) d;
select 'empresa_una_vez|' || (length(d) - length(replace(d, 'or d.ubicacion_id is null))', ''))) / length('or d.ubicacion_id is null))')
  from pg_get_functiondef('${LISTA}'::regprocedure) d;
-- Las anclas de los parches vecinos siguen enteras: el puede_anular del fondo (182000, 235000, 145000), el token (003000), los tipos (002000).
select 'ancla_fondo|' || (position($x$           and (v_lider or (d.tipo = 'deposito' and d.ubicacion_id = any (v_ubics)))
           and d.tipo not in ('faltante_fondo_asumido', 'faltante_fondo_deuda')
           and d.tipo <> 'pago_deuda_fondo'$x$ in pg_get_functiondef('${LISTA}'::regprocedure)) > 0);
select 'ancla_no_lider|' || (position($x$or (not v_lider and d.ubicacion_id = any (v_ubics))$x$ in pg_get_functiondef('${LISTA}'::regprocedure)) > 0);
select 'ancla_token|' || (position($x$fn_intento_con_huella('registrar_movimiento_dinero'$x$ in pg_get_functiondef('${PUERTA}'::regprocedure)) > 0);
select 'ancla_tipos|' || (position($x$'abono_tarjeta', 'pago_tarjeta', 'entre_cuentas', 'pago_planilla', 'pago_sunat') then$x$ in pg_get_functiondef('${PUERTA}'::regprocedure)) > 0);
`);
  verificar("idempotente y anclas", r, {
    misma_huella: "true",
    piso_una_vez: "1",
    piso_antes_del_futuro: "true",
    empresa_una_vez: "1",
    ancla_fondo: "true",
    ancla_no_lider: "true",
    ancla_token: "true",
    ancla_tipos: "true",
  });
}

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);
