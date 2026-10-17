#!/usr/bin/env node
/**
 * Prueba de «una sola regla de alcance» en Finanzas — auditoría de Finanzas 2026-10-16, hallazgo G16 (ADR-0433, actividad 8).
 *
 * EL PROBLEMA. ADR-0253 (Felipe, 2026-09-28) decidió que quien tiene Configuración, Cierre de mes o CAYLA Global ve las finanzas
 * «todo, como el líder» (`fn_ve_finanzas_de_todo()`). La migración 20260928220000 lo aplicó a unas funciones (`fn_asientos`,
 * `fn_diario_ubicaciones`, `fn_campanas_reporte`, `fn_presupuesto_vs_real`…) pero no a sus vecinas: `fn_diario`,
 * `fn_estado_resultados`, `fn_balance_por_tienda` y `fn_balance_general` siguieron con `fn_es_lider()`. Resultado: quien cierra el
 * mes congela el diario ENTERO (empresa incluida) pero al abrir el Estado de resultados o el Balance de ese mes no ve «De la empresa»
 * ni el consolidado, y el Balance por tienda mide la utilidad de UNA sola tienda. Números distintos para el mismo mes según quién
 * mira, sin ningún error.
 *
 * QUÉ CUBRE
 *   · el candado estructural: ninguna función que reparta el alcance con `fn_diario_ubicaciones()` pregunta `fn_es_lider()` por su
 *     cuenta (lista de excepciones vacía a propósito: una futura función hermana no puede volver a decidir sola);
 *   · una cuenta con SOLO «Cierre de mes» ve lo mismo que el líder en el diario, el Estado de resultados, el Balance por tienda y el
 *     Balance de una tienda (filas con ubicación nula incluidas);
 *   · un encargado (Reportes financieros, sin ninguno de los tres) sigue topado a SU tienda en cada una de esas funciones y recibe
 *     42501 al pedir otra;
 *   · una cuenta sin el módulo no ve nada.
 *
 * CÓMO. Todo dentro de una transacción con ROLLBACK (nada se confirma en el Postgres local compartido). La planilla de Dynamic se
 * apaga (`prueba.planilla = 'no'`) para que la comparación entre cuentas no dependa de quién puede ver sueldos.
 *
 * USO
 *   pnpm pruebas:finanzas-alcance                         → contra el Postgres local del contenedor
 *   node scripts/pruebas/finanzas_alcance_coherente.mjs --base otra → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
  }
}
/** Cada verificación de la escena sale como una línea `caso|t`. Se exige que estén TODAS y en verdadero. */
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
/** Saca los nombres de caso de un bloque SQL: cada `select 'NOMBRE',` de verificación. */
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

const AYUDANTES = `
-- Devuelve el SQLSTATE de lo que falla ('SIN_ERROR' si no falla): lo que se exige es el 42501, no el texto.
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate;
  return v_estado;
end;
$f$;
-- La planilla de Dynamic, de ensayo (apagada): sin ella la comparación entre cuentas no depende de quién ve sueldos.
create function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$
  select coalesce(current_setting('prueba.planilla', true), 'no') = 'si'
$f$;
insert into public.sedes (codigo, nombre, tipo) values ('ZTAL', 'Taller de ensayo G16', 'taller'), ('ZCCO', 'Central de ensayo G16', 'central');
create view retail.planilla_por_sede as
select * from (values
  ('TRU'::text,  'tienda'::text,  'f5f5f5f5-0000-4000-8000-0000000000b2'::uuid, '2030-08-29'::date, '2030-09-28'::date, 13::bigint, 12642.37, 1914.47, 14556.84),
  ('ZCCO',       'central',       'f5f5f5f5-0000-4000-8000-0000000000b2'::uuid, '2030-08-29'::date, '2030-09-28'::date, 5::bigint,  6585.64, 435.42, 7021.06)
) v (sede_codigo, sede_tipo, periodo_id, fecha_ini, fecha_fin, personas, pagado, provisiones, costo_total);
`;

// Septiembre de 2030: un gasto de la EMPRESA (sin tienda: la fila que el predicado viejo dejaba fuera) y uno por tienda.
const ESCENA = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select set_config('prueba.planilla', 'no', true);
-- Finanzas cuenta desde siempre (si no, la escena del mes cerrado, de 2025, saldría vacía en una base con «cuenta desde» puesto).
update retail.parametros_finanzas set inicio_finanzas = null where id;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado) values
  (null,    'servicios_basicos', 'Internet oficina G16', '2030-09-15', 300, 0, 'transferencia', 'vigente'),
  (:'tru',  'alquileres',        'Alquiler TRU G16',     '2030-09-10', 1000, 0, 'transferencia', 'vigente'),
  (:'lim',  'alquileres',        'Alquiler LIM G16',     '2030-09-10', 700, 0, 'transferencia', 'vigente');

-- Lo que ve el líder, guardado para comparar contra las otras cuentas (la planilla ya está apagada para todas).
create temp table lider_diario as select * from retail.fn_diario('2030-09-01', '2030-09-30');
create temp table lider_er as
  select ubicacion_id, unidad, ventas_netas, costo_ventas, mermas, gastos_operacion, resultado
    from retail.fn_estado_resultados('2030-09-01', '2030-09-30');
create temp table lider_ppto as
  select ubicacion_id, unidad, linea, a_la_fecha from retail.fn_presupuesto_vs_real('2030-09-01', null, '2030-09-30');
create temp table lider_bpt as
  select ubicacion_id, nombre, mercaderia, activos_fijos, facturas_por_pagar, ventas_mes, utilidad_mes
    from retail.fn_balance_por_tienda('2030-09-30');
`;

// Marzo de 2025 CERRADO: lo congelado es otra rama de `fn_diario` (lee `diario_cerrado`), y es donde el predicado viejo dejaba fuera
// las líneas de la empresa. Se cierran la empresa y las dos tiendas, como cierra un mes la suite de Cierre de mes.
const ESCENA_CERRADA = `
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio TRU G16', '2025-03-10', 150, null, 'yape') as g1 \\gset
select retail.registrar_gasto(:'lim', 'publicidad', 'Anuncio LIM G16', '2025-03-11', 90, null, 'yape') as g2 \\gset
select retail.registrar_gasto(null, 'publicidad', 'Anuncio general G16', '2025-03-06', 70, null, 'yape') as g3 \\gset
-- La empresa solo se cierra con una cuenta que ve la planilla en Dynamic: se enciende para cerrar y se apaga después.
select set_config('prueba.planilla', 'si', true);
select retail.cerrar_periodo('2025-03-01', 'empresa') as r1 \\gset
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') as r2 \\gset
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'lim') as r3 \\gset
select set_config('prueba.planilla', 'no', true);
create temp table lider_diario_cerrado as select * from retail.fn_diario('2025-03-01', '2025-03-31');
`;

// Lo que pregunta una función, sin sus comentarios (un «fn_es_lider()» escrito en un comentario no cuenta ni como culpa ni como prueba).
const SIN_COMENTARIOS = "regexp_replace(p.prosrc, '--[^\\n]*', '', 'g')";
const HERMANAS = ["fn_diario", "fn_estado_resultados", "fn_balance_por_tienda", "fn_balance_general", "fn_gastos_fuera_de_lo_normal"];
const CASOS_ESTRUCTURA = `
begin;
-- Toda función que reparta el alcance con fn_diario_ubicaciones() lo decide con fn_ve_finanzas_de_todo(), nunca con fn_es_lider().
-- (Las funciones de «solo el líder» de verdad —como fn_flujo_exigir_lider o fn_exigir_lider_balance— no reparten alcance, y esta lista no las toca.)
select 'A1 ninguna función que reparte el alcance por tienda pregunta fn_es_lider() por su cuenta',
  (select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.prokind = 'f'
      and ${SIN_COMENTARIOS} ~ 'fn_diario_ubicaciones' and ${SIN_COMENTARIOS} ~ 'fn_es_lider\\s*\\(');
${HERMANAS.map((f) => `select 'A2 ${f} pregunta fn_ve_finanzas_de_todo()',
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'retail' and p.proname = '${f}' and ${SIN_COMENTARIOS} ~ 'fn_ve_finanzas_de_todo\\s*\\(');`).join("\n")}
`;

const CASOS_CIERRE_DE_MES = `
${cambiaA(MICAELA)}
${conModulo("cierre_mes")}
select 'B1 control (ya pasaba sin el arreglo): con solo «Cierre de mes» el diario de un mes ABIERTO trae las mismas líneas que el del líder (las de la empresa incluidas)',
  (select count(*) from retail.fn_diario('2030-09-01', '2030-09-30')) = (select count(*) from lider_diario)
  and (select count(*) from lider_diario where ubicacion_id is null) > 0
  and (select count(*) from retail.fn_diario('2030-09-01', '2030-09-30') where ubicacion_id is null) = (select count(*) from lider_diario where ubicacion_id is null);
select 'B2 el Estado de resultados trae las mismas unidades que el del líder: tiendas, la empresa y el consolidado',
  (select count(*) from (
     select ubicacion_id, unidad from lider_er
     except select ubicacion_id, unidad from retail.fn_estado_resultados('2030-09-01', '2030-09-30')) f) = 0
  and (select count(*) from retail.fn_estado_resultados('2030-09-01', '2030-09-30')) = (select count(*) from lider_er)
  and exists (select 1 from retail.fn_estado_resultados('2030-09-01', '2030-09-30') where unidad = 'empresa')
  and exists (select 1 from retail.fn_estado_resultados('2030-09-01', '2030-09-30') where unidad = 'consolidado');
select 'B3 y con los mismos números, columna por columna',
  (select count(*) from (
     select ubicacion_id, unidad, ventas_netas, costo_ventas, mermas, gastos_operacion, resultado from lider_er
     except select ubicacion_id, unidad, ventas_netas, costo_ventas, mermas, gastos_operacion, resultado
              from retail.fn_estado_resultados('2030-09-01', '2030-09-30')) f) = 0;
select 'B4 el Balance por tienda mide cada tienda igual que el líder (antes medía la utilidad de UNA sola tienda)',
  (select count(*) from (
     select ubicacion_id, nombre, mercaderia, activos_fijos, facturas_por_pagar, ventas_mes, utilidad_mes from lider_bpt
     except select ubicacion_id, nombre, mercaderia, activos_fijos, facturas_por_pagar, ventas_mes, utilidad_mes
              from retail.fn_balance_por_tienda('2030-09-30')) f) = 0
  and (select count(*) from retail.fn_balance_por_tienda('2030-09-30')) = (select count(*) from lider_bpt);
select 'B5 control (ya pasaba sin el arreglo): puede pedir el Balance de cualquier tienda',
  (select pg_temp.intento(format('select * from retail.fn_balance_general(%L, %L)', '2030-09-30', :'lim'))) = 'SIN_ERROR';
select 'B5b Presupuesto vs real (lo llama al Estado de resultados): el gasto REAL de la empresa y de CAYLA es el mismo que ve el líder (antes salía en cero)',
  (select count(*) from lider_ppto where unidad in ('empresa', 'consolidado') and a_la_fecha > 0) > 0
  and (select count(*) from (
     select ubicacion_id, unidad, linea, a_la_fecha from lider_ppto
     except select ubicacion_id, unidad, linea, a_la_fecha from retail.fn_presupuesto_vs_real('2030-09-01', null, '2030-09-30')) f) = 0;
select 'B6 NO cambia: el Balance de CAYLA entera sigue siendo solo del líder (puerta explícita de Felipe), aun con Cierre de mes',
  (select pg_temp.intento($$select * from retail.fn_balance_general('2030-09-30')$$)) = '42501';
-- Esta función lee además un parámetro de Configuración (fn_parametros_finanzas), que Cierre de mes solo no abre: se le suma Configuración.
${conModulo("configuracion")}
select 'B7 gastos fuera de lo normal: quien ve todo (con Configuración) puede pedir lo de la empresa',
  (select pg_temp.intento($$select * from retail.fn_gastos_fuera_de_lo_normal(null, true)$$)) = 'SIN_ERROR';
`;

const CASOS_ENCARGADO = `
${cambiaA(MICAELA)}
${conModulo("reportes_financieros")}
select 'C1 el encargado ve el Estado de resultados de SU tienda y nada más: ni otras tiendas, ni la empresa, ni el consolidado',
  (select count(*) = 1 and bool_and(ubicacion_id = :'tru' and unidad = 'tienda') from retail.fn_estado_resultados('2030-09-01', '2030-09-30'));
select 'C2 su diario es solo de su tienda (sin las líneas de la empresa)',
  (select count(*) > 0 and bool_and(ubicacion_id is not distinct from :'tru') from retail.fn_diario('2030-09-01', '2030-09-30'));
select 'C3 su Balance por tienda trae solo su tienda',
  (select count(*) = 1 and bool_and(ubicacion_id = :'tru') from retail.fn_balance_por_tienda('2030-09-30'));
select 'C4 pedir el diario de Lima falla con 42501',
  (select pg_temp.intento(format('select * from retail.fn_diario(%L, %L, %L)', '2030-09-01', '2030-09-30', :'lim'))) = '42501';
select 'C5 pedir el Estado de resultados de Lima falla con 42501',
  (select pg_temp.intento(format('select * from retail.fn_estado_resultados(%L, %L, %L)', '2030-09-01', '2030-09-30', :'lim'))) = '42501';
select 'C6 pedir los asientos de Lima falla con 42501',
  (select pg_temp.intento(format('select * from retail.fn_asientos(%L, %L, %L)', '2030-09-01', '2030-09-30', :'lim'))) = '42501';
select 'C7 pedir el Balance de Lima falla con 42501',
  (select pg_temp.intento(format('select * from retail.fn_balance_general(%L, %L)', '2030-09-30', :'lim'))) = '42501';
select 'C8 pedir el presupuesto real de Lima falla con 42501',
  (select pg_temp.intento(format('select * from retail.fn_presupuesto_vs_real(%L, %L)', '2030-09-01', :'lim'))) = '42501';
select 'C9 pedir lo de toda la empresa (sin tienda) en el diario devuelve solo lo suyo, y ninguna línea sin tienda',
  (select count(*) from retail.fn_diario('2030-09-01', '2030-09-30')) < (select count(*) from lider_diario)
  and (select count(*) from retail.fn_diario('2030-09-01', '2030-09-30') where ubicacion_id is null) = 0;
select 'C10 gastos fuera de lo normal: lo de la empresa NO es del encargado',
  (select pg_temp.intento($$select * from retail.fn_gastos_fuera_de_lo_normal(null, true)$$)) = '42501';
`;

const CASOS_MES_CERRADO = `
select 'E0 el mes cerrado de la escena tiene líneas congeladas de la empresa y de las dos tiendas',
  (select count(*) filter (where congelado) > 0 and count(*) filter (where ubicacion_id is null) > 0
          and count(distinct ubicacion_id) filter (where ubicacion_id is not null) >= 2 from lider_diario_cerrado);
${cambiaA(MICAELA)}
${conModulo("cierre_mes")}
select 'E1 con solo «Cierre de mes» el diario CONGELADO trae las mismas líneas que el del líder (antes dejaba fuera las de la empresa)',
  (select count(*) from retail.fn_diario('2025-03-01', '2025-03-31')) = (select count(*) from lider_diario_cerrado)
  and (select count(*) from retail.fn_diario('2025-03-01', '2025-03-31') where ubicacion_id is null) = (select count(*) from lider_diario_cerrado where ubicacion_id is null);
select 'E2 y son las mismas líneas, una por una',
  (select count(*) from (
     select fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, congelado from lider_diario_cerrado
     except select fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, congelado from retail.fn_diario('2025-03-01', '2025-03-31')) f) = 0;
`;

const CASOS_MES_CERRADO_ENCARGADO = `
${cambiaA(MICAELA)}
${conModulo("reportes_financieros")}
select 'F1 el encargado ve del mes cerrado solo las líneas de SU tienda',
  (select count(*) > 0 and bool_and(ubicacion_id is not distinct from :'tru') from retail.fn_diario('2025-03-01', '2025-03-31'));
select 'F2 pedir el mes cerrado de Lima falla con 42501',
  (select pg_temp.intento(format('select * from retail.fn_diario(%L, %L, %L)', '2025-03-01', '2025-03-31', :'lim'))) = '42501';
select 'F3 pedirlo sin tienda no le suma las líneas de la empresa congeladas',
  (select count(*) from retail.fn_diario('2025-03-01', '2025-03-31') where ubicacion_id is null) = 0;
`;

const CASOS_SIN_MODULO = `
${cambiaA(MICAELA)}
select 'D1 sin Reportes financieros ni los módulos de alcance, el Estado de resultados se rechaza con 42501',
  (select pg_temp.intento($$select * from retail.fn_estado_resultados('2030-09-01', '2030-09-30')$$)) = '42501';
select 'D2 ni el diario',
  (select pg_temp.intento($$select * from retail.fn_diario('2030-09-01', '2030-09-30')$$)) = '42501';
`;

verificar("Candado estructural", correr(CASOS_ESTRUCTURA), casosDe(CASOS_ESTRUCTURA));
verificar("Cuenta con solo «Cierre de mes»", correr(`${ESCENA}${CASOS_CIERRE_DE_MES}`), casosDe(CASOS_CIERRE_DE_MES));
verificar("Encargado de una tienda", correr(`${ESCENA}${CASOS_ENCARGADO}`), casosDe(CASOS_ENCARGADO));
verificar("Cuenta sin módulo", correr(`${ESCENA}${CASOS_SIN_MODULO}`), casosDe(CASOS_SIN_MODULO));
verificar("Mes cerrado (cuenta con Cierre de mes)", correr(`${ESCENA}${ESCENA_CERRADA}${CASOS_MES_CERRADO}`), casosDe(CASOS_MES_CERRADO));
verificar("Mes cerrado (encargado)", correr(`${ESCENA}${ESCENA_CERRADA}${CASOS_MES_CERRADO_ENCARGADO}`), casosDe(CASOS_MES_CERRADO_ENCARGADO));

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);
