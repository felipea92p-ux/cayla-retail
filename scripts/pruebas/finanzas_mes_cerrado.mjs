#!/usr/bin/env node
/**
 * Prueba de «un mes cerrado se queda cerrado» — auditoría de Finanzas 2026-10-16, hallazgo G09 (ADR-0433, actividad 9).
 *
 * EL PROBLEMA. Cerrar un mes congela su diario (`diario_cerrado`) y le saca una huella. Pero el Estado de resultados seguía leyendo el
 * diario VIVO (`fn_asientos`), así que el número de un mes que el contador ya recibió podía cambiar después; `archivar_caja_prueba` y
 * `guardar_parametro_tributario` (IGV, tope de planilla) cambiaban el diario vivo de un mes cerrado sin pasar por el candado; y el
 * candado (`fn_exigir_mes_abierto`) leía `periodos` con la foto de la sentencia, sin ningún cerrojo compartido con `cerrar_periodo`: un
 * gasto con fecha del mes que se cierra podía colarse mientras el cierre se confirmaba y quedar FUERA del diario congelado.
 *
 * QUÉ CUBRE
 *   · el Estado de resultados de un mes cerrado lee lo congelado: una línea que aparece después en el diario vivo (la deriva que deja
 *     un cambio fuera del sistema) no mueve ni una cifra;
 *   · archivar como prueba una caja de un mes cerrado se rechaza (y una caja de un mes abierto sigue pudiéndose archivar);
 *   · una vigencia retroactiva del IGV o del tope de la planilla de movilidad que cae en un mes cerrado se rechaza (y una futura, no);
 *   · DOS SESIONES: un registro con fecha de un mes espera a que termine el cierre de ese mes, y el cierre espera a quien está
 *     registrando (así el registro queda dentro de lo congelado o es rechazado: nunca queda afuera sin que nadie lo sepa).
 *
 * CÓMO. Las partes de una sesión terminan en ROLLBACK. Las de dos sesiones también: nada se confirma en el Postgres local, y se prueba
 * el ENTRELAZADO (quién espera a quién, con `lock_timeout`), no el resultado de una confirmación. Se usa un mes que ninguna otra suite
 * usa (noviembre de 2024) porque el cerrojo de cierre es por mes.
 *
 * USO
 *   pnpm pruebas:finanzas-mes-cerrado                       → contra el Postgres local del contenedor
 *   node scripts/pruebas/finanzas_mes_cerrado.mjs --base otra → contra otra base del mismo contenedor
 */

import { execFileSync, spawn } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", [...ARGS_PSQL.slice(0, -2), "-v", "ON_ERROR_STOP=1", ...ARGS_PSQL.slice(-2)], { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const cambiaA = (id) => `set local request.jwt.claim.sub = '${id}';\n`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
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
        const k = l.lastIndexOf("|");
        return [l.slice(0, k), l.slice(k + 1)];
      })
  );
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-600) });
}
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

const AYUDANTES = `
-- Devuelve «SQLSTATE|mensaje|hint» de lo que falla ('SIN_ERROR' si no falla).
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || v_msg || '|' || coalesce(v_hint, '');
end;
$f$;
`;

// Marzo de 2025 CERRADO para Trujillo y la empresa, con un gasto en cada uno. La planilla de Dynamic se enciende solo para cerrar la empresa.
const ESCENA = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
-- Finanzas cuenta desde siempre (si no, el Estado de resultados de un mes de 2025 sale vacío).
update retail.parametros_finanzas set inicio_finanzas = null where id;
create function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$ select coalesce(current_setting('prueba.planilla', true), 'no') = 'si' $f$;
insert into public.sedes (codigo, nombre, tipo) values ('ZTAL', 'Taller de ensayo G09', 'taller'), ('ZCCO', 'Central de ensayo G09', 'central');
create view retail.planilla_por_sede as
select * from (values ('TRU'::text, 'tienda'::text, 'f5f5f5f5-0000-4000-8000-0000000000c2'::uuid, '2030-08-29'::date, '2030-09-28'::date, 13::bigint, 12642.37, 1914.47, 14556.84))
v (sede_codigo, sede_tipo, periodo_id, fecha_ini, fecha_fin, personas, pagado, provisiones, costo_total);
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio TRU G09', '2025-03-10', 150, null, 'yape') as g1 \\gset
select retail.registrar_gasto(null, 'publicidad', 'Anuncio general G09', '2025-03-06', 70, null, 'yape') as g2 \\gset
select set_config('prueba.planilla', 'si', true);
select retail.cerrar_periodo('2025-03-01', 'empresa') as r1 \\gset
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') as r2 \\gset
select set_config('prueba.planilla', 'no', true);
create temp table er_antes as
  select ubicacion_id, unidad, ventas_netas, costo_ventas, mermas, gastos_operacion, resultado, detalle_gastos::text as detalle
    from retail.fn_estado_resultados('2025-03-01', '2025-03-31');
create temp table diario_antes as select * from retail.fn_diario('2025-03-01', '2025-03-31');
`;

// ── A · El Estado de resultados de un mes cerrado lee lo congelado ───────────────────────────────────────────────────────────
const CASOS_FOTO = `
select 'A0 la escena: marzo cerrado trae el gasto de Trujillo (150) y el de la empresa en la foto',
  (select gastos_operacion = 150 from er_antes where ubicacion_id = :'tru')
  and exists (select 1 from er_antes where unidad = 'empresa' and gastos_operacion = 70)
  and (select count(*) filter (where congelado) = count(*) from diario_antes);
-- La deriva: un cambio que llega por fuera del sistema (con los disparadores apagados, como lo haría un cambio en la base o en Dynamic).
set local session_replication_role = replica;
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado)
  values (:'tru', 'publicidad', 'Deriva G09', '2025-03-20', 500, 0, 'yape', 'vigente');
set local session_replication_role = origin;
select 'A1 el diario VIVO sí trae la línea nueva (la deriva existe)',
  (select count(*) from retail.fn_asientos('2025-03-01', '2025-03-31', :'tru')) > (select count(*) from diario_antes where ubicacion_id = :'tru');
select 'A2 el diario del mes cerrado no se mueve: son las mismas líneas de la foto',
  (select count(*) from (select fecha, ubicacion_id, asiento, regla, cuenta, debe, haber from diario_antes
                         except select fecha, ubicacion_id, asiento, regla, cuenta, debe, haber from retail.fn_diario('2025-03-01', '2025-03-31')) f) = 0
  and (select count(*) from retail.fn_diario('2025-03-01', '2025-03-31')) = (select count(*) from diario_antes);
select 'A3 el Estado de resultados de marzo NO cambia una cifra después de la deriva (lee lo congelado)',
  (select count(*) from (
     select ubicacion_id, unidad, ventas_netas, costo_ventas, mermas, gastos_operacion, resultado, detalle_gastos::text from retail.fn_estado_resultados('2025-03-01', '2025-03-31')
     except select ubicacion_id, unidad, ventas_netas, costo_ventas, mermas, gastos_operacion, resultado, detalle from er_antes) f) = 0
  and (select gastos_operacion from retail.fn_estado_resultados('2025-03-01', '2025-03-31', :'tru') where ubicacion_id = :'tru') = 150;
select 'A4 un mes ABIERTO sigue leyendo el diario vivo (el mes en curso trae su gasto de hoy)',
  (select gastos_operacion from retail.fn_estado_resultados(retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'tru') where ubicacion_id = :'tru') is not null
  and (select pg_temp.intento(format('select * from retail.fn_estado_resultados(%L, %L, %L)', retail.fn_hoy_lima(), retail.fn_hoy_lima(), :'tru'))) = 'SIN_ERROR';
`;

// ── B · Lo que cambia el diario vivo de un mes cerrado pasa por el candado ──────────────────────────────────────────────────
const CASOS_CAJA = `
-- Una caja real, cerrada hoy, con su fecha llevada a marzo de 2025 (cerrado) y otra que se queda en el mes abierto.
select count(*) as _previa from (select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba G09') as caja_vieja \\gset
select count(*) as _c1 from retail.cerrar_caja(:'caja_vieja', 100) \\gset
select retail.abrir_caja(:'tru', 100.00, 'prueba G09 2') as caja_nueva \\gset
select count(*) as _c2 from retail.cerrar_caja(:'caja_nueva', 100) \\gset
set local session_replication_role = replica;
update retail.cajas set abierta_en = '2025-03-12 09:00-05', cerrada_en = '2025-03-12 20:00-05' where id = :'caja_vieja';
set local session_replication_role = origin;
select 'B1 archivar como prueba una caja de un mes cerrado se rechaza, con el aviso de reabrir',
  (select pg_temp.intento(format('select retail.archivar_caja_prueba(%L)', :'caja_vieja'))) like '%|Marzo 2025 de Tienda Trujillo está cerrado%|periodo_cerrado';
select 'B2 y la caja no quedó archivada',
  (select not es_prueba from retail.cajas where id = :'caja_vieja');
select 'B3 una caja de un mes abierto sí se archiva',
  (select pg_temp.intento(format('select retail.archivar_caja_prueba(%L)', :'caja_nueva'))) = 'SIN_ERROR';
`;

const CASOS_PARAMETROS = `
select 'C1 una vigencia retroactiva del IGV que cae en un mes cerrado se rechaza',
  (select pg_temp.intento($$select retail.guardar_parametro_tributario('igv', date '2025-03-01', 0.18)$$)) like '%|%cerrado%|periodo_cerrado';
select 'C2 también si cae ANTES de un mes cerrado (rige desde entonces, y marzo está cerrado)',
  (select pg_temp.intento($$select retail.guardar_parametro_tributario('igv', date '2025-01-01', 0.18)$$)) like '%|%cerrado%|periodo_cerrado';
select 'C3 y el tope de la planilla de movilidad, igual',
  (select pg_temp.intento($$select retail.guardar_parametro_tributario('tope_planilla_movilidad', date '2025-03-15', 45.20)$$)) like '%|%cerrado%|periodo_cerrado';
select 'C4 una vigencia posterior al último mes cerrado se acepta',
  (select pg_temp.intento(format('select retail.guardar_parametro_tributario(%L, %L, 0.18)', 'igv', (date_trunc('month', retail.fn_hoy_lima()) + interval '1 month')::date))) = 'SIN_ERROR';
select 'C5 y no se escribió nada de lo rechazado en la historia de parámetros',
  (select count(*) from retail.parametros_tributarios where nombre = 'igv' and vigente_desde in (date '2025-03-01', date '2025-01-01')) = 0;
`;

verificar("El Estado de resultados lee lo congelado", correr(`${ESCENA}${CASOS_FOTO}`), casosDe(CASOS_FOTO));
verificar("Archivar una caja de prueba", correr(`${ESCENA}${CASOS_CAJA}`), casosDe(CASOS_CAJA));
verificar("Parámetros tributarios retroactivos", correr(`${ESCENA}${CASOS_PARAMETROS}`), casosDe(CASOS_PARAMETROS));

// ── D · DOS SESIONES: quién espera a quién ───────────────────────────────────────────────────────────────────────────────────
// Se prueba el entrelazado, no una confirmación: las dos sesiones terminan en ROLLBACK. La que «sostiene» imprime LISTO cuando ya tiene
// su cerrojo y se queda dormida; la otra empieza entonces con `lock_timeout` corto y cuenta si espera (55P03) o pasa de largo.
const MES = "2024-11-01";
const PREAMBULO = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
`;

function sesion(sql) {
  const p = spawn("docker", ARGS_PSQL.slice(0, -2).concat(["-v", "ON_ERROR_STOP=0"], ARGS_PSQL.slice(-2)), { stdio: ["pipe", "pipe", "pipe"] });
  let salida = "";
  let aviso;
  const listo = new Promise((r) => (aviso = r));
  p.stdout.on("data", (d) => {
    salida += d.toString();
    if (salida.includes("LISTO")) aviso();
  });
  p.stderr.on("data", (d) => (salida += d.toString()));
  const fin = new Promise((r) => p.on("close", () => r(salida)));
  p.stdin.end(sql);
  // Si la sesión muere antes de decir LISTO, que la prueba no se cuelgue.
  fin.then(() => aviso());
  return { listo, fin };
}
const resultado = (salida, clave) => (salida.split("\n").find((l) => l.startsWith(`${clave}|`)) ?? "").slice(clave.length + 1).trim();

// D1 · quien REGISTRA tiene su cerrojo compartido: el cierre del mes espera.
{
  const registra = sesion(`${PREAMBULO}
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado)
  values (:'tru', 'publicidad', 'Carrera D1', '${MES.slice(0, 8)}10', 50, 0, 'yape', 'vigente');
select 'LISTO';
select pg_sleep(6);
rollback;`);
  await registra.listo;
  const cierra = sesion(`${PREAMBULO}
set local lock_timeout = '1500ms';
select 'D1|' || pg_temp.intento(format('select retail.cerrar_periodo(%L, ''ubicacion'', %L)', '${MES}', :'tru'));
rollback;`);
  const [sal] = await Promise.all([cierra.fin, registra.fin]);
  const r = resultado(sal, "D1");
  esperar("D1 mientras alguien registra un gasto de noviembre, el cierre de noviembre ESPERA (no pasa de largo)", r.startsWith("55P03"), { visto: r || sal.slice(-400) });
}

// D2 · quien CIERRA tiene su cerrojo exclusivo: el registro con fecha de ese mes espera.
{
  const cierra = sesion(`${PREAMBULO}
select retail.cerrar_periodo('${MES}', 'ubicacion', :'tru');
select 'LISTO';
select pg_sleep(6);
rollback;`);
  await cierra.listo;
  const registra = sesion(`${PREAMBULO}
set local lock_timeout = '1500ms';
select 'D2|' || pg_temp.intento($$insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado)
  select id, 'publicidad', 'Carrera D2', date '${MES.slice(0, 8)}12', 50, 0, 'yape', 'vigente' from retail.ubicaciones where nombre = 'Tienda Trujillo'$$);
rollback;`);
  const [, sal] = await Promise.all([cierra.fin, registra.fin]);
  const r = resultado(sal, "D2");
  esperar("D2 mientras se cierra noviembre, un gasto con fecha de noviembre ESPERA (no se cuela)", r.startsWith("55P03"), { visto: r || sal.slice(-400) });
}

// D3 · un registro del MES EN CURSO no espera a nadie (el cerrojo no frena la operación de todos los días).
{
  const cierra = sesion(`${PREAMBULO}
select retail.cerrar_periodo('${MES}', 'ubicacion', :'tru');
select 'LISTO';
select pg_sleep(4);
rollback;`);
  await cierra.listo;
  const registra = sesion(`${PREAMBULO}
set local lock_timeout = '1500ms';
select 'D3|' || pg_temp.intento($$insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado)
  select id, 'publicidad', 'Hoy D3', retail.fn_hoy_lima(), 50, 0, 'yape', 'vigente' from retail.ubicaciones where nombre = 'Tienda Trujillo'$$);
rollback;`);
  const [, sal] = await Promise.all([cierra.fin, registra.fin]);
  const r = resultado(sal, "D3");
  esperar("D3 mientras se cierra noviembre, un gasto de HOY entra sin esperar", r === "SIN_ERROR", { visto: r || sal.slice(-400) });
}

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);
