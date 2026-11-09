#!/usr/bin/env node
/**
 * Prueba de la foto del diario (ADR-0633). Parte 1 (`20261109180000_foto_del_diario_tomar.sql`): tomar la foto de un mes. Parte 2
 * (`20261109182000_foto_del_diario_leer.sql`): `fn_diario` la lee, con su interruptor.
 *
 * QUÉ CUBRE
 *   · LA FOTO ES EL DIARIO: las líneas que guarda `tomar_foto_diario(mes)` son EXACTAMENTE las de `fn_asientos(mes)` que ve el líder
 *     (las mismas filas, en las dos direcciones), con ventas reales del mes pasado; y su huella es la de esas líneas.
 *   · SOLO EL TRABAJO PROGRAMADO: una persona (aunque sea líder) no puede tomarla; el mes en curso no tiene foto.
 *   · REHACER reemplaza: tomarla dos veces deja las mismas líneas, no el doble.
 *   · LEER LA FOTO NO CAMBIA NADA: `fn_diario` da las mismas filas con el interruptor encendido y apagado (todas las sedes, una sede, un
 *     mes cerrado de por medio). Encendido, de verdad la lee (una línea testigo aparece); deja de leerla si cambió la planilla de Dynamic;
 *     a quien no ve la planilla no se la muestra; apagado, nunca la lee.
 *   · VENCE SOLA (parte 3, `20261109183000_foto_del_diario_vence.sql`): una venta del mes pasado vence ese mes y el anterior sigue valiendo;
 *     la configuración y el costo de una prenda vencen todo; una venta de hoy y un precio nuevo no anotan nada.
 *   · EL CANDADO: toda tabla que el diario lee tiene su disparador o está exenta con su motivo.
 *   · PEGAR DOS VECES no cambia nada.
 *
 * CÓMO. Cada escena corre dentro de UNA transacción con ROLLBACK, y pega la migración adentro (si la base ya la tiene, no hace nada).
 *
 * USO
 *   pnpm pruebas:foto-diario
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const a = process.argv.indexOf("--contenedor");
const CONTENEDOR = a > 0 ? process.argv[a + 1] : "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACIONES = ["20261109180000_foto_del_diario_tomar.sql", "20261109182000_foto_del_diario_leer.sql", "20261109183000_foto_del_diario_vence.sql"].map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8")).join("\n");

function correr(sql) {
  try {
    const salida = execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
      input: `${sql}\nrollback;\n`,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let casos = 0;
function verificar(titulo, r, esperados) {
  const lineas = r.ok ? Object.fromEntries(r.salida.split("\n").filter((l) => l.includes("|")).map((l) => [l.slice(0, l.indexOf("|")), l.slice(l.indexOf("|") + 1)])) : {};
  for (const [caso, valor] of Object.entries(esperados)) {
    casos++;
    const ok = r.ok && (typeof valor === "function" ? valor(lineas[caso]) : lineas[caso] === valor);
    console.log(`${ok ? "✓" : "✗"} ${titulo}: ${caso}`);
    if (!ok) {
      fallos++;
      console.log(r.ok ? `    esperado ${typeof valor === "function" ? "(condición)" : valor}, salió ${lineas[caso]}` : `    ${r.mensaje.slice(0, 1500)}`);
    }
  }
}

// El aviso «tendría que haber fallado» lleva su propio código (XX999) para que un freno esperado no se lo trague.
const debeFallar = (nombre, sql, codigo) => `
do $$
begin
  ${sql};
  raise exception '${nombre}: tendría que haber fallado' using errcode = 'XX999';
exception when others then
  if sqlstate <> '${codigo}' then raise; end if;
end $$;
select '${nombre}|ok';`;

const comoLider = `set local request.jwt.claim.sub = '${FELIPE}'; set local request.jwt.claim.role = 'authenticated';`;
const comoServicio = `set local request.jwt.claim.sub = ''; set local request.jwt.claim.role = 'service_role';`;

// Tres ventas del mes pasado en Trujillo (dos medios), para que la foto tenga ventas, costo, IGV y cobros.
const venta = (nombre, dia, pagos, mes = "mes") => {
  const total = pagos.reduce((x, [, m]) => x + m, 0);
  return `
update retail.variantes set precio = ${total} where id = :'v';
select retail.registrar_venta(:'tru',
  jsonb_build_array(jsonb_build_object('variante_id', :'v', 'cantidad', 1, 'precio_unitario', ${total}, 'descuento_unitario', 0)),
  jsonb_build_array(${pagos.map(([m, monto]) => `jsonb_build_object('metodo', '${m}', 'monto', ${monto})`).join(", ")}),
  null, gen_random_uuid(), p_descuento_pct => 0) as ${nombre} \\gset
update retail.ventas set created_at = ((:'${mes}'::date + ${dia - 1}) + time '12:00') at time zone 'America/Lima' where id = :'${nombre}';
`;
};

const ESCENA = `
begin;
${comoLider}
${MIGRACIONES}
update retail.parametros_finanzas set inicio_finanzas = '2019-01-01';
select (date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date as mes \\gset
select (date_trunc('month', retail.fn_hoy_lima()) - interval '2 month')::date as mes2 \\gset
select date_trunc('month', retail.fn_hoy_lima())::date as hoymes \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = :'tru' and s.tipo = 'piso_venta');
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BT98' when 'factura' then 'FT98' else serie end, siguiente_numero = 1 where ubicacion_id = :'tru' and tipo in ('boleta', 'factura');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'tru' and estado = 'abierta') x) as _previa \\gset
select retail.abrir_caja(:'tru', 1000.00, 'prueba automatizada') as caja \\gset
select id as v from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v', :'tru', retail.fn_sububicacion_por_defecto(:'tru', 'venta'), 'entrada', 50, 'colchón de prueba');
select count(*) as _st from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m where m.variante_id = :'v' and m.motivo = 'colchón de prueba' and m.created_at = now()) x \\gset
${venta("v1", 5, [["efectivo", 120]])}
${venta("v2", 12, [["tarjeta", 89.9]])}
${venta("v3", 20, [["efectivo", 50], ["yape", 30]])}
${venta("v4", 8, [["efectivo", 75]], "mes2")}
${venta("v5", 1, [["tarjeta", 64]], "hoymes")}
`;

const FIN = `(:'mes'::date + interval '1 month - 1 day')::date`;
const LINEAS_FOTO = `select fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, origen_tabla, origen_id, glosa from retail.diario_foto_lineas where mes = :'mes'::date`;
const DIARIO_LIDER = `select fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, origen_tabla, origen_id, glosa from retail.fn_asientos(:'mes'::date, ${FIN}, null)`;

verificar("la foto es el diario", correr(`${ESCENA}
${comoServicio}
select 'tomada|' || ((retail.tomar_foto_diario(:'mes') ->> 'lineas')::int > 0);
${comoLider}
create temp table lider as ${DIARIO_LIDER};
select 'ventas_en_el_diario|' || ((select count(*) from lider where regla ilike '%venta%') > 0);
select 'solo_en_la_foto|' || count(*) from ((${LINEAS_FOTO}) except all (select * from lider)) x;
select 'solo_en_el_diario|' || count(*) from ((select * from lider) except all (${LINEAS_FOTO})) x;
select 'cuenta_las_lineas|' || ((select lineas from retail.diario_fotos where mes = :'mes'::date) = (select count(*) from lider));
select 'huella|' || ((select huella from retail.diario_fotos where mes = :'mes'::date) =
  (select encode(sha256(convert_to(coalesce(string_agg(t, E'\\n' order by t), ''), 'UTF8')), 'hex')
     from (select retail.fn_diario_linea_texto(fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, origen_tabla, origen_id, glosa) t from lider) z));
${comoServicio}
select retail.tomar_foto_diario(:'mes') as _otra \\gset
select 'rehacer_no_duplica|' || ((select count(*) from retail.diario_foto_lineas where mes = :'mes'::date) = (select count(*) from lider));
`), {
  tomada: "true",
  ventas_en_el_diario: "true",
  solo_en_la_foto: "0",
  solo_en_el_diario: "0",
  cuenta_las_lineas: "true",
  huella: "true",
  rehacer_no_duplica: "true",
});

verificar("solo el trabajo programado, solo meses que terminaron", correr(`${ESCENA}
${debeFallar("el_lider_no_la_toma", "perform retail.tomar_foto_diario((date_trunc('month', retail.fn_hoy_lima()) - interval '1 month')::date)", "42501")}
${comoServicio}
${debeFallar("el_mes_en_curso_no", "perform retail.tomar_foto_diario(retail.fn_hoy_lima())", "P0001")}
select 'nadie_desde_la_web|' || (not has_function_privilege('authenticated', 'retail.tomar_foto_diario(date)', 'execute') and not has_function_privilege('anon', 'retail.tomar_foto_diario(date)', 'execute'));
`), { el_lider_no_la_toma: "ok", el_mes_en_curso_no: "ok", nadie_desde_la_web: "true" });

// Lo que devuelve fn_diario, como texto por fila, para comparar con el interruptor encendido y apagado.
const DIARIO = (ubic) => `select concat_ws('|', fecha, ubicacion_id, asiento, regla, cuenta, trim_scale(debe), trim_scale(haber), origen_tabla, origen_id, glosa, congelado) t
  from retail.fn_diario(:'mes2'::date, retail.fn_hoy_lima(), ${ubic})`;
const IGUALES = (a, b) => `(select count(*) from ((select t from ${a}) except all (select t from ${b})) x) + (select count(*) from ((select t from ${b}) except all (select t from ${a})) x)`;
const FOTOS = `${comoServicio}
select retail.tomar_foto_diario(:'mes2') as _f2 \\gset
select retail.tomar_foto_diario(:'mes') as _f1 \\gset
${comoLider}
-- Como lo deja el trabajo programado al terminar una vuelta: nada vencido (sin la parte 3, la tabla no existe y no hace falta).
do $$ begin if to_regclass('retail.diario_vencido_marcas') is not null then delete from retail.diario_vencido_marcas; end if; end $$;`;
const ENCENDER = `update retail.parametros_finanzas set usar_foto_diario = true;`;
const APAGAR = `update retail.parametros_finanzas set usar_foto_diario = false;`;

verificar("leer la foto no cambia nada", correr(`${ESCENA}
${FOTOS}
${APAGAR}
create temp table apagado as ${DIARIO("null")};
create temp table apagado_tru as ${DIARIO(":'tru'::uuid")};
${ENCENDER}
create temp table encendido as ${DIARIO("null")};
create temp table encendido_tru as ${DIARIO(":'tru'::uuid")};
select 'hay_filas_de_los_tres_meses|' || ((select count(distinct left(t, 7)) from apagado) >= 3);
select 'todas_las_sedes_igual|' || ${IGUALES("apagado", "encendido")};
select 'una_sede_igual|' || ${IGUALES("apagado_tru", "encendido_tru")};
`), { hay_filas_de_los_tres_meses: "true", todas_las_sedes_igual: "0", una_sede_igual: "0" });

verificar("un mes cerrado de por medio sigue ganando", correr(`${ESCENA}
${FOTOS}
select retail.cerrar_periodo(:'mes2'::date, 'ubicacion', :'tru'::uuid) as _cierre \\gset
${APAGAR}
create temp table apagado as ${DIARIO("null")};
${ENCENDER}
create temp table encendido as ${DIARIO("null")};
select 'hay_congeladas|' || ((select count(*) from apagado where t like '%|t') > 0);
select 'igual_con_el_cierre|' || ${IGUALES("apagado", "encendido")};
`), { hay_congeladas: "true", igual_con_el_cierre: "0" });

const TESTIGO = (regla) => `insert into retail.diario_foto_lineas (mes, fecha, ubicacion_id, asiento, regla, cuenta, debe, haber, origen_tabla, origen_id, glosa)
  values (:'mes'::date, :'mes'::date + 3, null, 'testigo:${regla}', '${regla}', '99', 1, 0, null, null, 'testigo de la prueba');`;
const VE_TESTIGO = (regla) => `(select count(*) from retail.fn_diario(:'mes2'::date, retail.fn_hoy_lima(), null) where asiento = 'testigo:${regla}')`;

verificar("de verdad lee la foto, y solo cuando vale", correr(`${ESCENA}
${FOTOS}
${TESTIGO("prueba_foto")}
${TESTIGO("planilla")}
${APAGAR}
select 'apagado_no_la_lee|' || ${VE_TESTIGO("prueba_foto")};
${ENCENDER}
select 'encendido_la_lee|' || ${VE_TESTIGO("prueba_foto")};
select 'la_planilla_no_a_quien_no_la_ve|' || ${VE_TESTIGO("planilla")};
select 'una_sede_no_la_lee|' || (select count(*) from retail.fn_diario(:'mes2'::date, retail.fn_hoy_lima(), :'tru'::uuid) where asiento = 'testigo:prueba_foto');
update retail.diario_fotos set huella_planilla = 'otra' where mes = :'mes'::date;
select 'si_cambio_la_planilla_no_la_lee|' || ${VE_TESTIGO("prueba_foto")};
`), { apagado_no_la_lee: "0", encendido_la_lee: "1", la_planilla_no_a_quien_no_la_ve: "0", una_sede_no_la_lee: "0", si_cambio_la_planilla_no_la_lee: "0" });

const AL_DIA = `delete from retail.diario_vencido_marcas;`;
const MARCA = `(select count(*) from retail.diario_vencido_marcas)`;
const DESDE = `(select coalesce(min(fecha)::text, 'nada') from retail.diario_vencido_marcas)`;

verificar("la foto vence sola", correr(`${ESCENA}
${FOTOS}
${TESTIGO("prueba_foto")}
${ENCENDER}
${AL_DIA}
select 'al_dia_la_lee|' || ${VE_TESTIGO("prueba_foto")};
create temp table m0 as select ${MARCA} m;
${venta("v6", 9, [["efectivo", 33]], "hoymes")}
select 'una_venta_de_hoy_no_anota|' || (${MARCA} = (select m from m0)) || ',' || ${DESDE};
update retail.variantes set precio = precio + 1 where id = :'v';
select 'un_precio_no_anota|' || ${DESDE};
update retail.ventas set es_prueba = true where id = :'v1';
select 'una_venta_del_mes_pasado_vence_ese_mes|' || (${DESDE} = (:'mes'::date + 4)::text);
select 'ya_no_la_lee|' || ${VE_TESTIGO("prueba_foto")};
select 'el_mes_anterior_sigue_valiendo|' || retail.fn_foto_diario_vale(:'mes2'::date);
${AL_DIA}
update retail.categorias_gasto set nombre = nombre where ctid = (select ctid from retail.categorias_gasto limit 1);
select 'la_configuracion_vence_todo|' || ${DESDE};
${AL_DIA}
update retail.variantes set costo = coalesce(costo, 0) + 1 where id = :'v';
select 'el_costo_de_una_prenda_vence_todo|' || ${DESDE};
${AL_DIA}
${APAGAR}
${ENCENDER}
select 'prender_el_interruptor_no_vence|' || ${DESDE};
update retail.parametros_finanzas set minimo_caja = coalesce(minimo_caja, 0) + 1;
select 'otro_parametro_vence_todo|' || ${DESDE};
`), {
  al_dia_la_lee: "1",
  una_venta_de_hoy_no_anota: "true,nada",
  un_precio_no_anota: "nada",
  una_venta_del_mes_pasado_vence_ese_mes: "true",
  ya_no_la_lee: "0",
  el_mes_anterior_sigue_valiendo: "true",
  la_configuracion_vence_todo: "1900-01-01",
  el_costo_de_una_prenda_vence_todo: "1900-01-01",
  prender_el_interruptor_no_vence: "nada",
  otro_parametro_vence_todo: "1900-01-01",
});

// El candado: toda tabla que el diario lee (recorriendo fn_asientos y lo que llama) tiene su disparador o está exenta con su motivo.
const FUENTES = `with recursive f(oid, nivel) as (
    select 'retail.fn_asientos(date,date,uuid)'::regprocedure::oid, 0
    union
    select p2.oid, f.nivel + 1 from f join pg_proc p on p.oid = f.oid
      cross join lateral regexp_matches(p.prosrc, '(fn_[a-z_0-9]+)\\s*\\(', 'g') m
      join pg_proc p2 on p2.proname = m[1] and p2.pronamespace = 'retail'::regnamespace
     where f.nivel < 6)
  select distinct tb.schemaname || '.' || x[1] tabla
    from f join pg_proc p on p.oid = f.oid
    cross join lateral regexp_matches(p.prosrc, '(?:from|join)\\s+(?:retail\\.|public\\.)?([a-z_]+)', 'gi') x
    join pg_tables tb on tb.tablename = x[1] and tb.schemaname in ('retail', 'public')`;
verificar("ninguna tabla del diario sin vigilar", correr(`begin;
${MIGRACIONES}
create temp table fuentes as ${FUENTES};
select 'fuentes_encontradas|' || ((select count(*) from fuentes) >= 40);
select 'sin_clasificar|' || coalesce((select string_agg(f.tabla, ',' order by f.tabla) from fuentes f
   where not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname || '.' || c.relname = f.tabla and t.tgname = 'diario_vence')
     and not exists (select 1 from retail.diario_fuentes_exentas e where e.tabla = f.tabla)), 'ninguna');
select 'exentas_sin_disparador|' || coalesce((select string_agg(e.tabla, ',') from retail.diario_fuentes_exentas e
   where exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname || '.' || c.relname = e.tabla and t.tgname = 'diario_vence')), 'ninguna');
`), { fuentes_encontradas: "true", sin_clasificar: "ninguna", exentas_sin_disparador: "ninguna" });

verificar("pegar dos veces", correr(`begin;
${MIGRACIONES}
create temp table antes as select md5(pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure)) a, md5(pg_get_functiondef('retail.fn_planilla_periodos(date,date)'::regprocedure)) p, md5(pg_get_functiondef('retail.fn_diario(date,date,uuid)'::regprocedure)) d;
${MIGRACIONES}
select 'igual|' || (x.a = md5(pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure)) and x.p = md5(pg_get_functiondef('retail.fn_planilla_periodos(date,date)'::regprocedure)) and x.d = md5(pg_get_functiondef('retail.fn_diario(date,date,uuid)'::regprocedure))) from antes x;
`), { igual: "true" });

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);
