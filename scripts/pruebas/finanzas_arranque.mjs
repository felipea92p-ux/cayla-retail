#!/usr/bin/env node
/**
 * Prueba de «Finanzas cuenta desde una fecha» — ADR-0332 (`20261004190000_finanzas_cuenta_desde.sql`).
 *
 * QUÉ CUBRE
 *   · SIN CORTE NADA CAMBIA: con `inicio_finanzas` nulo (como queda al pegar la migración) septiembre sigue mostrando su
 *     gasto y su planilla de Dynamic, igual que hoy.
 *   · CON CORTE, LO ANTERIOR NO ENTRA: el Estado de resultados de un mes anterior al corte no devuelve filas; el de un
 *     rango que lo cruza arranca en el corte (el gasto del 20-sep no suma, el de octubre sí); el diario (`fn_asientos`)
 *     tampoco trae nada anterior; el mes de después del corte queda igual que sin corte.
 *   · LO QUE NO SE CORTA: la PROYECCIÓN de caja sigue contando la última planilla pagada aunque sea anterior al corte (la
 *     planilla de octubre se pagará igual; sin ella el aviso de caja de la semana 26-oct desaparecería), y «lo que ya pasó» del
 *     Flujo solo deja de LISTAR la planilla anterior.
 *   · LAS REGLAS DE `guardar_inicio_finanzas`: solo con el módulo «Configuración»; solo día 1; no en el futuro; no si hay un
 *     mes cerrado; deja antes/después en `configuracion_historial`; repetir el mismo valor no escribe; quitarlo (nulo)
 *     devuelve septiembre. `anon` no llama; la pregunta interna no es pública.
 *   · LA MIGRACIÓN: pegarla dos veces no cambia ninguna función (misma huella); `fn_parametros_finanzas` trae el corte.
 *
 * CÓMO. Como `estado_resultados.mjs`: cada escena aplica la migración y se siembra dentro de UNA transacción con ROLLBACK
 * (la base local la comparten otras sesiones); fechas de 2020 para no cruzarse con datos reales; Dynamic se simula con una vista
 * y una `public.fn_es_admin_o_lider()` de ensayo. Sesión simulada con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:finanzas-arranque    → con las migraciones ya aplicadas en el local (esta se aplica sola, dentro del ROLLBACK)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261004190000_finanzas_cuenta_desde.sql"), "utf8");

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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
const conModulo = (m) => `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${m}') on conflict do nothing;\n`;

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
/** Cada verificación de la escena sale como una línea `caso|valor`. Se exige que estén TODAS y con el valor esperado. */
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
        const i = l.indexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
  for (const [caso, valor] of Object.entries(esperados))
    esperar(caso, lineas.get(caso) === valor, lineas.has(caso) ? { valor: lineas.get(caso), esperado: valor } : { falta: caso, salida: r.salida.slice(-800) });
}

// La migración, aplicada DENTRO de la escena (su ROLLBACK la deshace): así la prueba corre aunque la base local aún no la tenga.
// Va primero, antes de sembrar nada (un `alter table` después de sembrar una tabla con disparadores diferidos da 55006).
const APLICAR = `\n${MIGRACION}\n`;

const AYUDANTES = `
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
-- La planilla de Dynamic, de ensayo: la vista puente y la puerta de Dynamic (se abre con prueba.planilla = 'si').
-- Dos períodos de TRU: el que termina el 28-sep-2020 (costo 1,000) y el que termina el 28-oct-2020 (costo 1,100).
create function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$
  select coalesce(current_setting('prueba.planilla', true), 'no') = 'si'
$f$;
create view retail.planilla_por_sede as
select * from (values
  ('TRU'::text, 'tienda'::text, 'a0a0a0a0-0000-4000-8000-0000000000b1'::uuid, '2020-08-29'::date, '2020-09-28'::date, 13::bigint, 880.00::numeric, 120.00::numeric, 1000.00::numeric),
  ('TRU',       'tienda',       'a0a0a0a0-0000-4000-8000-0000000000b2'::uuid, '2020-09-29'::date, '2020-10-28'::date, 13::bigint, 970.00,        130.00,        1100.00)
) v (sede_codigo, sede_tipo, periodo_id, fecha_ini, fecha_fin, personas, pagado, provisiones, costo_total);
`;

// TRU: un gasto el 20-sep-2020 (500) y otro el 5-oct-2020 (300), sin ventas ni activos.
//   sin corte: septiembre = alquiler 500 + planilla 1,000 → resultado −1,500 · octubre = 300 + 1,100 → −1,400
const SIEMBRA = `
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago) values
  (:'tru', 'alquileres', 'Alquiler sept (ensayo)', '2020-09-20', 500, 0, 'transferencia'),
  (:'tru', 'alquileres', 'Alquiler oct (ensayo)',  '2020-10-05', 300, 0, 'transferencia');
`;

const ESCENA = `
begin;
${APLICAR}
${AYUDANTES}
${cambiaA(FELIPE)}
${SIEMBRA}
select set_config('prueba.planilla', 'si', true);
`;

const ER = (desde, hasta) =>
  `(select * from retail.fn_estado_resultados('${desde}', '${hasta}', :'tru'))`;

// ---- 1. Sin corte: nada cambia ---------------------------------------------------------------------------------------------
{
  const r = correr(`${ESCENA}
select 'sin_corte: la columna nace nula', (retail.fn_finanzas_desde() is null)::text;
select 'sin_corte: septiembre trae su planilla (1,000)', (select planilla::text from ${ER("2020-09-01", "2020-09-30")} e);
select 'sin_corte: septiembre = alquiler 500 + planilla 1,000', (select (-resultado)::text from ${ER("2020-09-01", "2020-09-30")} e);
select 'sin_corte: octubre = 300 + 1,100', (select (-resultado)::text from ${ER("2020-10-01", "2020-10-31")} e);
select 'sin_corte: el diario de septiembre trae líneas', (select (count(*) > 0)::text from retail.fn_asientos('2020-09-01', '2020-09-30', :'tru'));
select 'sin_corte: fn_parametros_finanzas trae la clave', ((retail.fn_parametros_finanzas()) ? 'inicio_finanzas')::text;`);
  verificar("1 · sin corte", r, {
    "sin_corte: la columna nace nula": "true",
    "sin_corte: septiembre trae su planilla (1,000)": "1000.00",
    "sin_corte: septiembre = alquiler 500 + planilla 1,000": "1500.00",
    "sin_corte: octubre = 300 + 1,100": "1400.00",
    "sin_corte: el diario de septiembre trae líneas": "true",
    "sin_corte: fn_parametros_finanzas trae la clave": "true",
  });
}

// ---- 2. Con corte el 1-oct-2020: lo anterior no entra ------------------------------------------------------------------------
{
  const r = correr(`${ESCENA}
select retail.guardar_inicio_finanzas('2020-10-01');
select 'corte: queda guardado y se lee', (retail.fn_parametros_finanzas() ->> 'inicio_finanzas');
select 'corte: la pregunta interna lo da', retail.fn_finanzas_desde()::text;
select 'corte: septiembre ya no devuelve filas', (select count(*)::text from ${ER("2020-09-01", "2020-09-30")} e);
select 'corte: el diario de septiembre queda vacío', (select count(*)::text from retail.fn_asientos('2020-09-01', '2020-09-30', null));
select 'corte: octubre queda igual (300 + 1,100)', (select (-resultado)::text from ${ER("2020-10-01", "2020-10-31")} e);
select 'corte: un rango que lo cruza no suma lo de antes (solo octubre)', (select (-resultado)::text from ${ER("2020-09-15", "2020-10-31")} e);
select 'corte: el diario de ese rango no trae nada anterior', (select (min(fecha) >= '2020-10-01')::text from retail.fn_asientos('2020-09-15', '2020-10-31', :'tru'));
select 'corte: sin la planilla de septiembre en el rango que cruza', (select planilla::text from ${ER("2020-09-15", "2020-10-31")} e);
select 'corte: el historial guarda el antes y el después', (select (detalle -> 'antes' = 'null'::jsonb and detalle ->> 'despues' = '2020-10-01')::text
                                                             from retail.configuracion_historial where que = 'inicio_finanzas' order by id desc limit 1);
select 'corte: un rango inválido sigue siendo inválido', (pg_temp.intento($$select * from retail.fn_estado_resultados('2020-10-31', '2020-10-01', null)$$) like '%rango de fechas%')::text;`);
  verificar("2 · con corte", r, {
    "corte: queda guardado y se lee": "2020-10-01",
    "corte: la pregunta interna lo da": "2020-10-01",
    "corte: septiembre ya no devuelve filas": "0",
    "corte: el diario de septiembre queda vacío": "0",
    "corte: octubre queda igual (300 + 1,100)": "1400.00",
    "corte: un rango que lo cruza no suma lo de antes (solo octubre)": "1400.00",
    "corte: el diario de ese rango no trae nada anterior": "true",
    "corte: sin la planilla de septiembre en el rango que cruza": "1100.00",
    "corte: el historial guarda el antes y el después": "true",
    "corte: un rango inválido sigue siendo inválido": "true",
  });
}

// ---- 3. «Lo que ya pasó» del Flujo: solo deja de LISTAR la planilla anterior al corte --------------------------------------------
{
  const r = correr(`${ESCENA}
select (retail.fn_flujo_caja_real('2020-09-01', '2020-10-31') -> 'planilla') as p_sin \\gset
select retail.guardar_inicio_finanzas('2020-10-01');
select (retail.fn_flujo_caja_real('2020-09-01', '2020-10-31') -> 'planilla') as p_con \\gset
select 'flujo: sin corte lista las dos planillas pagadas', jsonb_array_length(:'p_sin'::jsonb)::text;
select 'flujo: con corte solo lista la de octubre', jsonb_array_length(:'p_con'::jsonb)::text;
select 'flujo: y es la que termina el 28-oct', (:'p_con'::jsonb -> 0 ->> 'fecha_fin');`);
  verificar("3 · flujo real", r, {
    "flujo: sin corte lista las dos planillas pagadas": "2",
    "flujo: con corte solo lista la de octubre": "1",
    "flujo: y es la que termina el 28-oct": "2020-10-28",
  });
}

// ---- 4. LO QUE NO SE CORTA: la última planilla pagada es de ANTES del corte y la proyección de caja debe seguir contándola -------
//   (el caso real de CAYLA: septiembre pagada, octubre aún no). El corte es el día 1 del mes de hoy y la planilla termina el día anterior.
{
  const r = correr(`${ESCENA}
select date_trunc('month', retail.fn_hoy_lima())::date as corte \\gset
select (:'corte'::date - 1) as fin \\gset
drop view retail.planilla_por_sede;
create view retail.planilla_por_sede as
select * from (values
  ('TRU'::text, 'tienda'::text, 'a0a0a0a0-0000-4000-8000-0000000000b1'::uuid, (:'fin'::date - 30), :'fin'::date, 13::bigint, 22000.00::numeric, 3000.00::numeric, 25000.00::numeric)
) v (sede_codigo, sede_tipo, periodo_id, fecha_ini, fecha_fin, personas, pagado, provisiones, costo_total);
select retail.fn_flujo_caja_proyeccion(6) as proy_sin \\gset
select retail.guardar_inicio_finanzas(:'corte');
select retail.fn_flujo_caja_proyeccion(6) as proy_con \\gset
select 'proyeccion: sin corte cuenta la planilla pagada (22,000)', ((:'proy_sin'::jsonb -> 'salidas_30' ->> 'planilla')::numeric = 22000)::text;
select 'proyeccion: con el corte DESPUÉS de esa planilla, la sigue contando (22,000)', ((:'proy_con'::jsonb -> 'salidas_30' ->> 'planilla')::numeric = 22000)::text;
select 'proyeccion: con corte sigue proyectando las salidas de planilla que vienen', ((select count(*) from jsonb_array_elements(:'proy_con'::jsonb -> 'salidas') s where s ->> 'tipo' = 'planilla') > 0)::text;
select 'proyeccion: y son las mismas que sin corte', ((select count(*) from jsonb_array_elements(:'proy_con'::jsonb -> 'salidas') s where s ->> 'tipo' = 'planilla')
       = (select count(*) from jsonb_array_elements(:'proy_sin'::jsonb -> 'salidas') s where s ->> 'tipo' = 'planilla'))::text;
select 'proyeccion: los días de caja no cambian con el corte', ((:'proy_sin'::jsonb ->> 'dias_de_caja') is not distinct from (:'proy_con'::jsonb ->> 'dias_de_caja'))::text;
select 'real: esa planilla ya no aparece en resultados del mes anterior', (select count(*)::text from retail.fn_estado_resultados(:'fin'::date - 10, :'fin'::date, null) e);`);
  verificar("4 · la proyección no se corta", r, {
    "proyeccion: sin corte cuenta la planilla pagada (22,000)": "true",
    "proyeccion: con el corte DESPUÉS de esa planilla, la sigue contando (22,000)": "true",
    "proyeccion: con corte sigue proyectando las salidas de planilla que vienen": "true",
    "proyeccion: y son las mismas que sin corte": "true",
    "proyeccion: los días de caja no cambian con el corte": "true",
    "real: esa planilla ya no aparece en resultados del mes anterior": "0",
  });
}

// ---- 5. Las reglas de guardar_inicio_finanzas --------------------------------------------------------------------------------
{
  const r = correr(`${ESCENA}
select 'regla: un día que no es 1 se rechaza', (pg_temp.intento($$select retail.guardar_inicio_finanzas('2020-10-15')$$) like '%día 1 de un mes%')::text;
select 'regla: el futuro se rechaza', (pg_temp.intento($$select retail.guardar_inicio_finanzas((date_trunc('month', retail.fn_hoy_lima()) + interval '2 months')::date)$$) like '%en el futuro%')::text;
select 'regla: el check de la columna también lo impide', (pg_temp.intento($$update retail.parametros_finanzas set inicio_finanzas = '2020-10-15'$$) like '%parametros_finanzas_inicio_primer_dia%')::text;
select retail.guardar_inicio_finanzas('2020-10-01');
select count(*) as n1 from retail.configuracion_historial where que = 'inicio_finanzas' \\gset
select retail.guardar_inicio_finanzas('2020-10-01');
select 'regla: repetir el mismo valor no escribe otra fila', ((select count(*) from retail.configuracion_historial where que = 'inicio_finanzas') = :n1)::text;
select retail.guardar_inicio_finanzas(null);
select 'regla: quitar el corte devuelve septiembre', (select count(*)::text from ${ER("2020-09-01", "2020-09-30")} e);
select 'regla: y la pregunta interna vuelve a nulo', (retail.fn_finanzas_desde() is null)::text;
select 'regla: anon no puede guardar', (not has_function_privilege('anon', 'retail.guardar_inicio_finanzas(date)', 'execute'))::text;
select 'regla: la pregunta interna no es pública', (not has_function_privilege('authenticated', 'retail.fn_finanzas_desde()', 'execute'))::text;`);
  verificar("5 · reglas", r, {
    "regla: un día que no es 1 se rechaza": "true",
    "regla: el futuro se rechaza": "true",
    "regla: el check de la columna también lo impide": "true",
    "regla: repetir el mismo valor no escribe otra fila": "true",
    "regla: quitar el corte devuelve septiembre": "1",
    "regla: y la pregunta interna vuelve a nulo": "true",
    "regla: anon no puede guardar": "true",
    "regla: la pregunta interna no es pública": "true",
  });
}

// ---- 6. Permisos y mes cerrado ------------------------------------------------------------------------------------------------
{
  const r = correr(`${ESCENA}
${cambiaA(MICAELA)}
select 'permiso: una colaboradora sin Configuración no lo cambia', (pg_temp.intento($$select retail.guardar_inicio_finanzas('2020-10-01')$$) like '%módulo «Configuración»%')::text;
${conModulo("configuracion")}
select 'permiso: con el módulo Configuración sí', pg_temp.intento($$select retail.guardar_inicio_finanzas('2020-10-01')$$);
${cambiaA(FELIPE)}
select retail.guardar_inicio_finanzas(null);
select retail.cerrar_periodo('2020-09-01', 'ubicacion', :'tru');
select 'cerrado: con un mes cerrado el corte no se mueve', (pg_temp.intento($$select retail.guardar_inicio_finanzas('2020-10-01')$$) like '%Ya hay meses cerrados%')::text;`);
  verificar("6 · permisos y mes cerrado", r, {
    "permiso: una colaboradora sin Configuración no lo cambia": "true",
    "permiso: con el módulo Configuración sí": "SIN_ERROR",
    "cerrado: con un mes cerrado el corte no se mueve": "true",
  });
}

// ---- 7. La migración: pegarla dos veces no cambia nada -------------------------------------------------------------------------
{
  const huella = `select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.proname)) from pg_proc p where p.pronamespace = 'retail'::regnamespace
                   and p.proname in ('fn_asientos', 'fn_estado_resultados', 'fn_flujo_caja_real', 'fn_parametros_finanzas', 'fn_finanzas_desde', 'guardar_inicio_finanzas')`;
  const r = correr(`begin;
${APLICAR}
select (${huella}) as h1 \\gset
${MIGRACION}
select 'migracion: pegarla dos veces deja las funciones igual', ((${huella}) = :'h1')::text;
select 'migracion: el corte está en las dos funciones del estado', ((select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
        and p.proname in ('fn_asientos', 'fn_estado_resultados') and pg_get_functiondef(p.oid) like '%fn_finanzas_desde()%') = 2)::text;
select 'migracion: no deja funciones temporales', (not exists (select 1 from pg_proc p where p.proname = 'reemplazar_arranque'))::text;`);
  verificar("7 · migración", r, {
    "migracion: pegarla dos veces deja las funciones igual": "true",
    "migracion: el corte está en las dos funciones del estado": "true",
    "migracion: no deja funciones temporales": "true",
  });
}

console.log(`\n${casos - fallos}/${casos} casos en verde.`);
process.exit(fallos ? 1 : 0);
