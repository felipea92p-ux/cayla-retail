#!/usr/bin/env node
/**
 * Prueba de ADR-0435 — metas por mes y por fecha (`20261017020000_metas_por_mes_y_por_fecha.sql`).
 *
 * QUÉ CUBRE
 *   · `fn_parametros_caja` es un ENVOLTORIO: sin filas de mes ni de fecha responde exactamente lo mismo que el cuerpo de
 *     siempre (`fn_parametros_caja_normal`), así que un mes sin cargar no cambia nada;
 *   · el orden de la base del día: fecha (final, sin % de campaña, 0 = sin meta) > semana del mes > semana tipo;
 *   · la campaña sigue subiendo la base del mes, y `fn_meta_mes` es la suma de los días con todo eso;
 *   · `guardar_metas_mes` y `guardar_meta_fecha`: un día vacío usa la semana tipo, quitar borra, cada cambio queda en el
 *     historial, y los candados (solo tiendas, ni mes ni fecha pasados, 18 meses de horizonte, NaN, negativos, 10
 *     millones, nota de 140 letras, tienda inexistente, la tabla escrita directo);
 *   · quién puede: el líder o quien tenga Configuración; la colaboradora sin el módulo no guarda ni lee la configuración,
 *     pero sí la meta de hoy (la caja la necesita); las tablas no se leen ni se escriben por fuera de las funciones;
 *   · `fn_configuracion_metas` (lo que lee la pantalla) y que el envoltorio sigue vivo: la base está renombrada, no es
 *     llamable por la API, y una cuenta que no es del equipo se rechaza.
 *
 * CÓMO. Igual que `configuracion_caja_campanas.mjs`: cada escenario en su transacción con ROLLBACK (nunca se commitea nada
 * en el Postgres local compartido), sesión simulada con `request.jwt.claim.sub`. Las fechas se calculan en la base a
 * partir de «hoy» (mes que viene, en dos meses…): ningún caso envejece.
 *
 * USO
 *   pnpm pruebas:metas-mes-y-fecha    → con la migración ya aplicada en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora sin el módulo Configuración
const AJENA = "99999999-9999-4999-8999-999999999999"; // una cuenta con sesión que no es del equipo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
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
const INTENTO = `
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
`;

/** Trujillo con su semana tipo (lun–dom 1500, 1500, 1600, 1700, 2000, 2500, 2000) y fondo 300. Deja `:tru`, `:taller`,
 *  `:gato`, `:hoy`, `:mes0` (este mes), `:mes1` (el que viene) y `:mes2` (en dos meses). */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select id as gato from retail.etiquetas where nombre = 'Día Internacional del Gato' \\gset
select (now() at time zone 'America/Lima')::date as hoy,
       date_trunc('month', now() at time zone 'America/Lima')::date as mes0,
       (date_trunc('month', now() at time zone 'America/Lima') + interval '1 month')::date as mes1,
       (date_trunc('month', now() at time zone 'America/Lima') + interval '2 months')::date as mes2 \\gset
select retail.guardar_metas_tienda(:'tru', array[1500,1500,1600,1700,2000,2500,2000]::numeric[], 300) as _t \\gset
`;
/** La semana del mes que viene: lunes 2000, martes 2100 … domingo 2600. Lo que debe valer el día `f` según esa semana. */
const SEMANA_MES1 = `select retail.guardar_metas_mes(:'tru', :'mes1'::date + 17, array[2000,2100,2200,2300,2400,2500,2600]::numeric[]) as _m \\gset`;
const baseMes = (f) => `(2000 + 100 * (extract(isodow from ${f})::int - 1))`;
const baseTipo = (f) => `((array[1500,1500,1600,1700,2000,2500,2000])[extract(isodow from ${f})::int])`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 700)}`);
  }
}

// 1. El envoltorio no cambia nada mientras no haya filas.
{
  const r = correr(`${ESCENA}
select (select concat_ws('|', meta, meta_base, meta_pct, fondo, fondo_base, campanas) from retail.fn_parametros_caja(:'tru', :'mes1'::date + 5))
     = (select concat_ws('|', meta, meta_base, meta_pct, fondo, fondo_base, campanas) from retail.fn_parametros_caja_normal(:'tru', :'mes1'::date + 5));
select (select meta from retail.fn_parametros_caja(:'tru', :'mes1'::date + 5)) = ${baseTipo(`(:'mes1'::date + 5)`)};`);
  const [igual, tipo] = r.ok ? r.salida.split("\n") : [];
  esperar("sin meses ni fechas cargados, la función responde lo mismo que su base", r.ok && igual === "t", r);
  esperar("…y es la semana tipo de siempre", r.ok && tipo === "t", r);
}

// 2. La semana de un mes reemplaza la semana tipo solo en ese mes; cualquier día del mes sirve para nombrarlo.
{
  const r = correr(`${ESCENA}
${SEMANA_MES1}
select count(*) from retail.ubicacion_metas_mes where ubicacion_id = :'tru' and mes = :'mes1';
select (select meta from retail.fn_parametros_caja(:'tru', :'mes1'::date + 5)) = ${baseMes(`(:'mes1'::date + 5)`)};
select (select meta_base from retail.fn_parametros_caja(:'tru', :'mes1'::date + 5)) = ${baseMes(`(:'mes1'::date + 5)`)};
select (select meta from retail.fn_parametros_caja(:'tru', :'mes2'::date + 5)) = ${baseTipo(`(:'mes2'::date + 5)`)};
select (select meta from retail.fn_parametros_caja(:'tru', :'mes0'::date + 5)) = ${baseTipo(`(:'mes0'::date + 5)`)};`);
  const [filas, delMes, base, otroMes, esteMes] = r.ok ? r.salida.split("\n") : [];
  esperar("guardar la semana pone 7 filas en el día 1 del mes aunque se nombre con el 18", r.ok && Number(filas) === 7, r);
  esperar("ese mes manda su semana (lunes 2000 … domingo 2600)", r.ok && delMes === "t" && base === "t", r);
  esperar("el mes siguiente y el actual siguen con la semana tipo", r.ok && otroMes === "t" && esteMes === "t", r);
}

// 3. Un día vacío usa la semana tipo; quitar la semana la borra.
{
  const r = correr(`${ESCENA}
select retail.guardar_metas_mes(:'tru', :'mes2', array[null,3000,null,0,null,null,null]::numeric[]) as _p \\gset
select count(*) from retail.ubicacion_metas_mes where ubicacion_id = :'tru' and mes = :'mes2';
select (select meta from retail.fn_parametros_caja(:'tru', :'mes2'::date + (8 - extract(isodow from :'mes2'::date)::int) % 7)) = 1500;
select (select meta from retail.fn_parametros_caja(:'tru', :'mes2'::date + (9 - extract(isodow from :'mes2'::date)::int) % 7)) = 3000;
select retail.guardar_metas_mes(:'tru', :'mes2', array[null,null,null,null,null,null,null]::numeric[]) as _q \\gset
select count(*) from retail.ubicacion_metas_mes where ubicacion_id = :'tru' and mes = :'mes2';
select (select meta from retail.fn_parametros_caja(:'tru', :'mes2'::date + 1)) = ${baseTipo(`(:'mes2'::date + 1)`)};`);
  const [filas, lunes, martes, tras, vuelve] = r.ok ? r.salida.split("\n") : [];
  esperar("con solo el martes cargado queda 1 fila (null y 0 no guardan nada)", r.ok && Number(filas) === 1, r);
  esperar("el lunes de ese mes sigue en la semana tipo (1500) y el martes en 3000", r.ok && lunes === "t" && martes === "t", r);
  esperar("mandar todo vacío borra el mes y vuelve la semana tipo", r.ok && Number(tras) === 0 && vuelve === "t", r);
}

// 4. La campaña sube la base del mes; la fecha manda y es final; 0 = sin meta; fn_meta_mes lo suma todo.
{
  const r = correr(`${ESCENA}
${SEMANA_MES1}
update retail.etiquetas set vigente_desde = :'mes1'::date + 9, vigente_hasta = :'mes1'::date + 11 where id = :'gato';
select retail.guardar_efecto_campana(:'gato', :'tru', 10, null) as _c \\gset
select (select meta from retail.fn_parametros_caja(:'tru', :'mes1'::date + 9)) = round(${baseMes(`(:'mes1'::date + 9)`)} * 1.1)
   and (select meta_base from retail.fn_parametros_caja(:'tru', :'mes1'::date + 9)) = ${baseMes(`(:'mes1'::date + 9)`)};
select retail.guardar_meta_fecha(:'tru', :'mes1'::date + 10, 9999, '  Dia del gato  ') as _f \\gset
select retail.guardar_meta_fecha(:'tru', :'mes1'::date + 11, 0, null) as _g \\gset
select concat_ws('|', meta, meta_base, meta_pct, fondo) from retail.fn_parametros_caja(:'tru', :'mes1'::date + 10);
select meta is null and meta_base is null from retail.fn_parametros_caja(:'tru', :'mes1'::date + 11);
select nota from retail.ubicacion_metas_fecha where ubicacion_id = :'tru' and fecha = :'mes1'::date + 10;
select retail.fn_meta_mes(:'tru', :'mes1') = (
  select sum(case when d = :'mes1'::date + 10 then 9999
                  when d = :'mes1'::date + 11 then null
                  when d = :'mes1'::date + 9 then round(${baseMes("d")} * 1.1)
                  else ${baseMes("d")} end)
    from generate_series(:'mes1'::date, (:'mes1'::date + interval '1 month - 1 day')::date, interval '1 day') x(d));`);
  const [campana, fecha, cero, nota, suma] = r.ok ? r.salida.split("\n") : [];
  esperar("la campaña (+10 %) sube la base del mes: meta = base × 1,1 y meta_base = la del mes", r.ok && campana === "t", r);
  esperar("una fecha manda sobre mes y campaña y es final: 9999, sin % y con el fondo normal 300", r.ok && fecha === "9999.00|9999.00|0|300.00", r);
  esperar("una fecha con 0 no tiene meta ese día", r.ok && cero === "t", r);
  esperar("la nota se guarda sin espacios sobrantes", r.ok && nota === "Dia del gato", r);
  esperar("la meta del mes es la suma de los días con mes, campaña, fecha y día sin meta", r.ok && suma === "t", r);
}

// 5. Quitar una fecha (null) devuelve el mes; todo queda en el historial.
{
  const r = correr(`${ESCENA}
${SEMANA_MES1}
select retail.guardar_meta_fecha(:'tru', :'mes1'::date + 10, 9999, null) as _a \\gset
select retail.guardar_meta_fecha(:'tru', :'mes1'::date + 10, 8888, 'cambio') as _b \\gset
select retail.guardar_meta_fecha(:'tru', :'mes1'::date + 10, null) as _c \\gset
select count(*) from retail.ubicacion_metas_fecha where ubicacion_id = :'tru';
select (select meta from retail.fn_parametros_caja(:'tru', :'mes1'::date + 10)) = ${baseMes(`(:'mes1'::date + 10)`)};
select count(*) from retail.configuracion_historial where que = 'meta_fecha' and hecho_en = now();
select count(*) from retail.configuracion_historial where que = 'metas_mes' and hecho_en = now();
select detalle->'antes'->>'meta' from retail.configuracion_historial where que = 'meta_fecha' and hecho_en = now() and detalle->'despues' = 'null'::jsonb;`);
  const [filas, vuelve, hFecha, hMes, antes] = r.ok ? r.salida.split("\n") : [];
  esperar("quitar la fecha borra la fila y vuelve la semana del mes", r.ok && Number(filas) === 0 && vuelve === "t", r);
  esperar("los 3 cambios de fecha y el del mes quedan en el historial", r.ok && Number(hFecha) === 3 && Number(hMes) === 1, r);
  esperar("el historial de quitar guarda lo que valía antes (8888)", r.ok && Number(antes) === 8888, r);
}

// 6. Candados de las funciones.
{
  const f = (cuerpo) => `select pg_temp.intento(format('${cuerpo}', :'tru', :'mes0', :'mes1', :'hoy', :'taller'));`;
  const r = correr(`${ESCENA}
${f("select retail.guardar_metas_mes(%5$L, %3$L::date, array[1,1,1,1,1,1,1]::numeric[])")}
${f("select retail.guardar_meta_fecha(%5$L, %4$L::date + 5, 100)")}
${f("select retail.guardar_metas_mes(%1$L, %2$L::date - 1, array[1,1,1,1,1,1,1]::numeric[])")}
${f("select retail.guardar_metas_mes(%1$L, (%2$L::date + interval ''19 months'')::date, array[1,1,1,1,1,1,1]::numeric[])")}
${f("select retail.guardar_metas_mes(%1$L, %3$L::date, array[1,1,1]::numeric[])")}
${f("select retail.guardar_metas_mes(%1$L, %3$L::date, array[1,1,1,1,1,1,-5]::numeric[])")}
${f("select retail.guardar_metas_mes(%1$L, %3$L::date, array[1,1,1,1,1,1,''NaN'']::numeric[])")}
${f("select retail.guardar_metas_mes(%1$L, %3$L::date, array[1,1,1,1,1,1,10000000]::numeric[])")}
${f("select retail.guardar_meta_fecha(%1$L, %4$L::date - 1, 100)")}
${f("select retail.guardar_meta_fecha(%1$L, (%4$L::date + interval ''19 months'')::date, 100)")}
${f("select retail.guardar_meta_fecha(%1$L, %4$L::date + 5, ''NaN'')")}
${f("select retail.guardar_meta_fecha(%1$L, %4$L::date + 5, -1)")}
${f("select retail.guardar_meta_fecha(%1$L, %4$L::date + 5, 10000000)")}
select pg_temp.intento(format('select retail.guardar_meta_fecha(%L, %L::date + 5, 100, %L)', :'tru', :'hoy', repeat('a', 141)));
select pg_temp.intento(format('select retail.guardar_meta_fecha(%L, %L::date + 5, 100)', '00000000-0000-4000-8000-000000000000', :'hoy'));
select pg_temp.intento(format('select retail.guardar_metas_mes(%L, %L::date, array[1,1,1,1,1,1,1]::numeric[])', :'tru', :'hoy'::date));`);
  const s = r.ok ? r.salida.split("\n") : [];
  const [tallerMes, tallerFecha, pasado, lejano, seis, negativo, nan, tope, fPasada, fLejana, fNan, fNeg, fTope, nota, inexistente, hoyOk] = s;
  esperar("el Taller no tiene metas por mes (solo tiendas)", r.ok && tallerMes.startsWith("La meta y el fondo de caja son solo de tiendas"), r);
  esperar("ni metas por fecha", r.ok && tallerFecha.startsWith("La meta y el fondo de caja son solo de tiendas"), r);
  esperar("un mes que ya pasó no se reescribe", r.ok && pasado.startsWith("No se cambia la meta de un mes que ya pasó"), r);
  esperar("más de 18 meses adelante: rechazado", r.ok && lejano.startsWith("La meta puede ponerse hasta 18 meses"), r);
  esperar("menos de 7 metas: rechazado", r.ok && seis.startsWith("Faltan las metas de los 7 días"), r);
  esperar("negativa, NaN y 10 millones: rechazadas en el mes", r.ok && [negativo, nan, tope].every((m) => m.startsWith("Una meta tiene que ser un monto positivo")), r);
  esperar("una fecha pasada o a más de 18 meses: rechazada", r.ok && fPasada.startsWith("No se cambia la meta de una fecha que ya pasó") && fLejana.startsWith("La meta puede ponerse hasta 18 meses"), r);
  esperar("NaN, negativa y 10 millones: rechazadas en la fecha", r.ok && [fNan, fNeg, fTope].every((m) => m.startsWith("La meta tiene que ser un monto positivo")), r);
  esperar("una nota de 141 letras: rechazada", r.ok && nota.startsWith("La nota puede tener hasta 140 letras"), r);
  esperar("una tienda que no existe: rechazada", r.ok && inexistente.startsWith("Esa tienda no existe"), r);
  esperar("el mes de hoy sí se puede cambiar", r.ok && hoyOk === "SIN_ERROR", r);
}

// 7. Candados de la tabla: lo que la base impide aunque alguien escriba directo (como el dueño de la base).
{
  const ins = (sql) => `select pg_temp.intento(format('${sql}', :'tru', :'mes1', :'hoy'));`;
  const r = correr(`${ESCENA}
${ins("insert into retail.ubicacion_metas_mes (ubicacion_id, mes, dia_semana, meta) values (%1$L, %2$L::date + 3, 0, 100)")}
${ins("insert into retail.ubicacion_metas_mes (ubicacion_id, mes, dia_semana, meta) values (%1$L, %2$L, 7, 100)")}
${ins("insert into retail.ubicacion_metas_mes (ubicacion_id, mes, dia_semana, meta) values (%1$L, %2$L, 0, ''NaN'')")}
${ins("insert into retail.ubicacion_metas_mes (ubicacion_id, mes, dia_semana, meta) values (%1$L, %2$L, 0, 0)")}
${ins("insert into retail.ubicacion_metas_fecha (ubicacion_id, fecha, meta) values (%1$L, %3$L, ''NaN'')")}
${ins("insert into retail.ubicacion_metas_fecha (ubicacion_id, fecha, meta) values (%1$L, %3$L, -1)")}
${ins("insert into retail.ubicacion_metas_fecha (ubicacion_id, fecha, meta, nota) values (%1$L, %3$L, 10, '''')")}`);
  const [primero, dia, nan, cero, fNan, fNeg, fNota] = r.ok ? r.salida.split("\n") : [];
  esperar("el mes tiene que ser día 1", r.ok && primero.includes("ubicacion_metas_mes_primer_dia"), r);
  esperar("el día de la semana va de 0 a 6", r.ok && dia.includes("ubicacion_metas_mes_dia"), r);
  esperar("la meta de un mes no puede ser NaN ni 0", r.ok && nan.includes("ubicacion_metas_mes_monto") && cero.includes("ubicacion_metas_mes_monto"), r);
  esperar("la de una fecha no puede ser NaN ni negativa", r.ok && fNan.includes("ubicacion_metas_fecha_monto") && fNeg.includes("ubicacion_metas_fecha_monto"), r);
  esperar("la nota de una fecha no puede estar vacía", r.ok && fNota.includes("ubicacion_metas_fecha_nota"), r);
}

// 8. Quién puede: el líder guarda; la colaboradora sin Configuración ni guarda ni lee la configuración, pero sí la meta de hoy.
{
  const r = correr(`${ESCENA}
${SEMANA_MES1}
${cambiaA(MICAELA)}
select pg_temp.intento(format('select retail.guardar_metas_mes(%L, %L::date, array[1,1,1,1,1,1,1]::numeric[])', :'tru', :'mes1'));
select pg_temp.intento(format('select retail.guardar_meta_fecha(%L, %L::date + 5, 100)', :'tru', :'hoy'));
select pg_temp.intento('select retail.fn_configuracion_metas()');
select (select meta from retail.fn_parametros_caja(:'tru', :'mes1'::date + 5)) = ${baseMes(`(:'mes1'::date + 5)`)};
set local role authenticated;
select pg_temp.intento('select count(*) from retail.ubicacion_metas_mes');
select pg_temp.intento('select count(*) from retail.ubicacion_metas_fecha');
select pg_temp.intento('update retail.ubicacion_metas_mes set meta = 1');
select pg_temp.intento('select * from retail.fn_parametros_caja_normal(null, null)');`);
  const [mes, fecha, conf, lee, dMes, dFecha, dEscribe, dNormal] = r.ok ? r.salida.split("\n") : [];
  esperar("la colaboradora sin el módulo no cambia metas por mes ni por fecha", r.ok && mes.includes("necesita el módulo «Configuración»") && fecha.includes("necesita el módulo «Configuración»"), r);
  esperar("ni lee la configuración de metas", r.ok && conf.includes("necesita el módulo «Configuración»"), r);
  esperar("pero sí la meta de hoy con el mes aplicado (la ve en Caja)", r.ok && lee === "t", r);
  esperar("nadie lee ni escribe las tablas directo (permiso denegado)", r.ok && [dMes, dFecha, dEscribe].every((m) => m.includes("permission denied")), r);
  esperar("la base renombrada no se llama desde la API", r.ok && dNormal.includes("permission denied"), r);
}

// 9. Lo que lee la pantalla.
{
  const base = `retail.fn_configuracion_metas(:'hoy'::date, 3)`;
  const r = correr(`${ESCENA}
${SEMANA_MES1}
select retail.guardar_meta_fecha(:'tru', :'mes1'::date + 10, 9999, 'Prueba') as _f \\gset
select jsonb_array_length(${base}->'meses');
select jsonb_array_length(retail.fn_configuracion_metas(:'hoy'::date, 99)->'meses');
select jsonb_array_length(retail.fn_configuracion_metas(:'hoy'::date, 0)->'meses');
select t->'meses'->to_char(:'mes1'::date, 'YYYY-MM-DD')->'metas'->>0 from jsonb_array_elements(${base}->'tiendas') t where t->>'id' = :'tru';
select t->'meses'->to_char(:'mes2'::date, 'YYYY-MM-DD')->'metas'->>0 is null from jsonb_array_elements(${base}->'tiendas') t where t->>'id' = :'tru';
select t->'tipica'->>3 from jsonb_array_elements(${base}->'tiendas') t where t->>'id' = :'tru';
select (t->'meses'->to_char(:'mes1'::date, 'YYYY-MM-DD')->>'total')::numeric = retail.fn_meta_mes(:'tru', :'mes1') from jsonb_array_elements(${base}->'tiendas') t where t->>'id' = :'tru';
select count(*) from jsonb_array_elements(${base}->'fechas') f where f->>'ubicacion_id' = :'tru' and f->>'nota' = 'Prueba' and (f->>'meta')::numeric = 9999;
select count(*) from jsonb_array_elements(${base}->'tiendas') t where t->>'nombre' = 'Taller';`);
  const [tres, tope, uno, lunes, vacio, tipica, total, fechas, taller] = r.ok ? r.salida.split("\n") : [];
  esperar("pide 3 meses y devuelve 3 (tope 18, mínimo 1)", r.ok && Number(tres) === 3 && Number(tope) === 18 && Number(uno) === 1, r);
  esperar("la semana del mes cargado llega con sus 7 valores (lunes 2000) y el mes sin cargar llega vacío", r.ok && Number(lunes) === 2000 && vacio === "t", r);
  esperar("la semana tipo llega aparte (jueves 1700)", r.ok && Number(tipica) === 1700, r);
  esperar("el total de cada mes es el de fn_meta_mes", r.ok && total === "t", r);
  esperar("las fechas con meta llegan con su nota", r.ok && Number(fechas) === 1, r);
  esperar("el Taller no aparece (solo tiendas)", r.ok && Number(taller) === 0, r);
}

// 10. El envoltorio sigue vivo y cerrado.
{
  const r = correr(`${ESCENA}
select to_regprocedure('retail.fn_parametros_caja_normal(uuid,date)') is not null;
select has_function_privilege('authenticated', 'retail.fn_parametros_caja(uuid,date)', 'execute');
select has_function_privilege('authenticated', 'retail.fn_parametros_caja_normal(uuid,date)', 'execute');
select has_function_privilege('anon', 'retail.fn_parametros_caja(uuid,date)', 'execute');
select position('ubicacion_metas_fecha' in prosrc) > 0 and position('ubicacion_metas_mes' in prosrc) > 0
  from pg_proc where oid = 'retail.fn_parametros_caja(uuid,date)'::regprocedure;
${cambiaA(AJENA)}
select pg_temp.intento(format('select * from retail.fn_parametros_caja(%L, %L::date)', :'tru', :'hoy'));`);
  const [existe, api, normalApi, anon, vivo, ajena] = r.ok ? r.salida.split("\n") : [];
  esperar("la base de siempre sigue ahí, renombrada", r.ok && existe === "t", r);
  esperar("el envoltorio lo llama la API; la base renombrada y anon, no", r.ok && api === "t" && normalApi === "f" && anon === "f", r);
  esperar("el envoltorio todavía lee meses y fechas (si otra migración lo pisa, esto falla)", r.ok && vivo === "t", r);
  esperar("una cuenta con sesión que no es del equipo se rechaza", r.ok && ajena.startsWith("Esta cuenta no es del equipo de retail"), r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
