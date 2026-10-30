#!/usr/bin/env node
/**
 * Prueba de «las lecturas de Finanzas que escalan» — ADR-0583 (Felipe 2026-10-30: «si ahora está lento con poca información, cuando exista
 * mucho más será muchísimo más lento»), migración 20261030170000.
 *
 * EL PROBLEMA. Dos piezas que se llaman miles de veces hacían trabajo de más: `fn_item_es_de_claure` buscaba el dueño de cada línea de venta
 * aunque la sede no fuera de CLAURE (31 lecturas la usan, una vez por línea), y `fn_diario` rearmaba el diario vivo de TODO el rango aunque
 * los meses cerrados se leyeran de lo congelado (el Balance, desde el arranque hasta hoy, crecía con toda la historia).
 *
 * QUÉ CUBRE. Que las dos funciones nuevas responden EXACTAMENTE lo mismo que las de antes (copiadas aquí, en `pg_temp`, desde
 * 20261029023000 y 20260925180000 con el alcance de 20261017033000):
 *   A · el diario de un mes cerrado para la sede, de un rango que cruza un mes cerrado y uno abierto, de CAYLA entera con el mes cerrado a medias
 *       y cerrado entero, y después de una deriva en el diario vivo; y que con el rango cerrado entero el diario vivo NI SE LLAMA (se reemplaza
 *       `fn_asientos` por una que falla: el mes cerrado se sigue leyendo, el abierto no);
 *   B · `fn_item_es_de_claure` contra la regla de antes para cada línea de venta × cada sede × fechas antes, en y después del arranque de
 *       CLAURE, con CLAURE activa e inactiva: ni un solo caso distinto, y hay casos «sí» y «no» (la comparación no es vacía).
 *
 * CÓMO. Todo termina en ROLLBACK. Usa marzo de 2025 (lo usa también finanzas_mes_cerrado: no corras las dos a la vez contra la misma base).
 *
 * USO
 *   pnpm pruebas:finanzas-lecturas-que-escalan                       → contra el Postgres local del contenedor
 *   node scripts/pruebas/finanzas_lecturas_que_escalan.mjs --base otra → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}`.slice(-1500) };
  }
}

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
  const lineas = new Map(
    r.salida
      .split("\n")
      .filter((l) => l.includes("|"))
      .map((l) => {
        const k = l.lastIndexOf("|");
        return [l.slice(0, k), l.slice(k + 1)];
      }),
  );
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-800) });
}
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

// Las dos funciones de ANTES, tal cual estaban en producción el 2026-10-30 (solo cambia el nombre).
const DE_ANTES = `
create function pg_temp.diario_antes(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (fecha date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, origen_tabla text, origen_id uuid, glosa text, congelado boolean)
language plpgsql stable as $f$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_ve_finanzas_de_todo();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
  v_planilla boolean := retail.fn_planilla_visible();
begin
  if p_ubicacion_id is not null then
    v_ubics := array[p_ubicacion_id];
  end if;
  v_todo := v_lider and p_ubicacion_id is null;
  return query
  with cerr as materialized (
    select p.mes, p.alcance, p.ubicacion_id, p.cierre_id from retail.periodos p
     where p.estado = 'cerrado' and p.alcance <> 'consolidado' and p.mes between date_trunc('month', p_desde)::date and p_hasta
  )
  select d.fecha, d.ubicacion_id, d.asiento, d.regla, d.cuenta, d.debe, d.haber, d.origen_tabla, d.origen_id, d.glosa, true
    from cerr c join retail.diario_cerrado d on d.cierre_id = c.cierre_id
   where d.fecha between p_desde and p_hasta and (v_todo or d.ubicacion_id = any (v_ubics)) and (v_planilla or d.regla <> 'planilla')
  union all
  select a.fecha, a.ubicacion_id, a.asiento, a.regla, a.cuenta, a.debe, a.haber, a.origen_tabla, a.origen_id, a.glosa, false
    from retail.fn_asientos(p_desde, p_hasta, p_ubicacion_id) a
   where not exists (
     select 1 from cerr c where c.mes = date_trunc('month', a.fecha)::date
        and ((a.ubicacion_id is null and c.alcance = 'empresa') or (c.alcance = 'ubicacion' and c.ubicacion_id = a.ubicacion_id)));
end $f$;

create function pg_temp.claure_antes(p_venta_item_id uuid, p_ubicacion_id uuid, p_creada timestamptz)
returns boolean language sql stable as $f$
  select exists (
    select 1 from retail.empresas e
      join retail.empresa_sedes es on es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id
     where e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null
       and (p_creada at time zone 'America/Lima')::date >= e.cuenta_corriente_desde
       and retail.fn_dueno_de_la_linea(p_venta_item_id) = e.id)
$f$;

-- Cuántas filas difieren entre el diario nuevo y el de antes (en los dos sentidos, contando repetidas).
create function pg_temp.dif(p_desde date, p_hasta date, p_ubicacion_id uuid default null) returns bigint language sql as $f$
  select (select count(*) from (select * from retail.fn_diario(p_desde, p_hasta, p_ubicacion_id) except all select * from pg_temp.diario_antes(p_desde, p_hasta, p_ubicacion_id)) a)
       + (select count(*) from (select * from pg_temp.diario_antes(p_desde, p_hasta, p_ubicacion_id) except all select * from retail.fn_diario(p_desde, p_hasta, p_ubicacion_id)) b)
$f$;
`;

// ── A · El diario ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Marzo de 2025 con un gasto de Trujillo, uno de Lima y uno de la empresa; abril con uno de Trujillo. Marzo se cierra para la empresa y Trujillo.
const ESCENA_DIARIO = `
begin;
${DE_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.parametros_finanzas set inicio_finanzas = null where id;
create or replace function public.fn_es_admin_o_lider() returns boolean language sql stable as $f$ select coalesce(current_setting('prueba.planilla', true), 'no') = 'si' $f$;
create or replace view retail.planilla_por_sede as
select * from (values ('TRU'::text, 'tienda'::text, 'f5f5f5f5-0000-4000-8000-0000000000c2'::uuid, '2030-08-29'::date, '2030-09-28'::date, 13::bigint, 12642.37, 1914.47, 14556.84))
v (sede_codigo, sede_tipo, periodo_id, fecha_ini, fecha_fin, personas, pagado, provisiones, costo_total);
select id as tru from retail.ubicaciones where nombre in ('Tienda Trujillo', 'Tienda TRU') order by nombre limit 1 \\gset
select id as lim from retail.ubicaciones where nombre in ('Tienda Lima', 'Tienda LIM') order by nombre limit 1 \\gset
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio TRU 0583', '2025-03-10', 150, null, 'yape') as g1 \\gset
select retail.registrar_gasto(:'lim', 'publicidad', 'Anuncio LIM 0583', '2025-03-08', 30, null, 'yape') as g2 \\gset
select retail.registrar_gasto(null, 'publicidad', 'Anuncio general 0583', '2025-03-06', 70, null, 'yape') as g3 \\gset
select retail.registrar_gasto(:'tru', 'publicidad', 'Anuncio TRU abril 0583', '2025-04-12', 40, null, 'yape') as g4 \\gset
select set_config('prueba.planilla', 'si', true);
select retail.cerrar_periodo('2025-03-01', 'empresa') as r1 \\gset
select retail.cerrar_periodo('2025-03-01', 'ubicacion', :'tru') as r2 \\gset
select set_config('prueba.planilla', 'no', true);
create temp table tru_marzo as select * from retail.fn_diario('2025-03-01', '2025-03-31', :'tru');
`;

const CASOS_DIARIO = `
select 'A1 Trujillo, marzo cerrado: el diario nuevo es el de antes, fila por fila, y todo viene de lo congelado',
  pg_temp.dif('2025-03-01', '2025-03-31', :'tru') = 0
  and (select count(*) > 0 and bool_and(congelado) from tru_marzo);
select 'A2 Trujillo, del 15 de marzo al 30 de abril (cerrado + abierto): igual que antes, y abril sale del diario vivo',
  pg_temp.dif('2025-03-15', '2025-04-30', :'tru') = 0
  and exists (select 1 from retail.fn_diario('2025-03-15', '2025-04-30', :'tru') where not congelado and fecha = '2025-04-12');
select 'A3 CAYLA entera con marzo cerrado a medias (Lima abierta): igual que antes, y el gasto de Lima sigue vivo',
  pg_temp.dif('2025-02-01', '2025-04-30') = 0
  and exists (select 1 from retail.fn_diario('2025-02-01', '2025-04-30') where not congelado and fecha = '2025-03-08');
-- Una deriva: algo cambia el diario vivo de un mes cerrado por fuera del sistema.
set local session_replication_role = replica;
insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado)
  values (:'tru', 'publicidad', 'Deriva 0583', '2025-03-20', 500, 0, 'yape', 'vigente');
set local session_replication_role = origin;
select 'A4 tras una deriva en el diario vivo de marzo, Trujillo sigue igual que antes y que su foto',
  pg_temp.dif('2025-03-01', '2025-04-30', :'tru') = 0
  and (select count(*) from retail.fn_diario('2025-03-01', '2025-03-31', :'tru')) = (select count(*) from tru_marzo);
-- Marzo se cierra para todas las demás ubicaciones (activas o no): queda cerrado entero.
select set_config('prueba.planilla', 'si', true);
select count(*) as _cerradas from (select retail.cerrar_periodo('2025-03-01', 'ubicacion', u.id) from retail.ubicaciones u where u.id <> :'tru') x \\gset
select set_config('prueba.planilla', 'no', true);
select 'A5 CAYLA entera con marzo cerrado entero: igual que antes, y marzo viene todo de lo congelado',
  pg_temp.dif('2025-02-01', '2025-04-30') = 0 and pg_temp.dif('2025-03-01', '2025-03-31') = 0
  and (select bool_and(congelado) from retail.fn_diario('2025-03-01', '2025-03-31'));
-- Ahora el diario vivo FALLA si alguien lo llama: un rango cerrado entero no debe llamarlo.
create or replace function retail.fn_asientos(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table(fecha date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, origen_tabla text, origen_id uuid, glosa text)
language plpgsql stable as $f$ begin raise exception 'rearmó el diario vivo de % a %', p_desde, p_hasta; end $f$;
select 'A6 con marzo cerrado entero, su diario se lee SIN rearmar el vivo (para CAYLA entera y para una sede)',
  (select count(*) > 0 from retail.fn_diario('2025-03-01', '2025-03-31')) and (select count(*) > 0 from retail.fn_diario('2025-03-05', '2025-03-25', :'lim'));
-- El error del vivo dice desde qué fecha se rearmó: se atrapa con un bloque para leerlo.
do $a7$ declare v text; begin
  perform 1 from retail.fn_diario('2025-03-01', '2025-04-30');
  perform set_config('prueba.a7', 'no rearmó nada', true);
exception when others then
  perform set_config('prueba.a7', sqlerrm, true);
end $a7$;
select 'A7 control: un rango que llega a abril sí rearma el vivo, y desde el 1 de abril (no desde marzo)',
  current_setting('prueba.a7', true) = 'rearmó el diario vivo de 2025-04-01 a 2025-04-30';
`;

// ── B · ¿Esta línea es de CLAURE? ────────────────────────────────────────────────────────────────────────────────────────────
// CLAURE opera Lima desde hace 10 días; la prenda A es de CLAURE y la B de CAYLA; ventas en Lima y en Trujillo, hoy y hace 12 días.
const ID = (n) => `'00000000-0000-4000-8000-00000005830${n}'`;
const ESCENA_CLAURE = `
begin;
${DE_ANTES}
select id as tru from retail.ubicaciones where nombre in ('Tienda Trujillo', 'Tienda TRU') order by nombre limit 1 \\gset
select id as lim from retail.ubicaciones where nombre in ('Tienda Lima', 'Tienda LIM') order by nombre limit 1 \\gset
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, :'lim') on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10), activo = true where clave = 'claure';
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, asesora_id, usuario_id) values
  (${ID(1)}, :'lim', now(), 'completada', false, :'yo', :'yo'),
  (${ID(2)}, :'tru', now(), 'completada', false, :'yo', :'yo'),
  (${ID(3)}, :'lim', now() - interval '12 days', 'completada', false, :'yo', :'yo');
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID(4)}, ${ID(1)}, :'va_a', 1, 118, 10), (${ID(5)}, ${ID(1)}, :'va_b', 1, 118, 10),
  (${ID(6)}, ${ID(2)}, :'va_a', 1, 100, 10), (${ID(7)}, ${ID(3)}, :'va_a', 1, 59, 10);
set local session_replication_role = origin;
-- Cada línea de venta de la base × cada sede × un instante antes, en y después del arranque.
create temp table combinaciones as
select vi.id as item, u.id as sede, c.cuando
  from retail.venta_items vi
  cross join retail.ubicaciones u
  cross join (values (now() - interval '12 days'), (now() - interval '10 days'), (now())) c(cuando);
create temp table comparacion as
select item, sede, cuando, retail.fn_item_es_de_claure(item, sede, cuando) as nueva, pg_temp.claure_antes(item, sede, cuando) as antes from combinaciones;
`;

const CASOS_CLAURE = `
select 'B1 con CLAURE activa: la regla nueva responde lo mismo que la de antes en cada línea × sede × fecha',
  (select count(*) from comparacion where nueva is distinct from antes) = 0;
select 'B2 y la comparación no es vacía: hay casos «es de CLAURE» y casos «no»',
  (select count(*) filter (where nueva) > 0 and count(*) filter (where not nueva) > 0 from comparacion);
select 'B3 la línea de la prenda de CLAURE vendida hoy en Lima es de CLAURE; la de CAYLA, no; y la de Trujillo, tampoco',
  retail.fn_item_es_de_claure(${ID(4)}, :'lim', now()) and not retail.fn_item_es_de_claure(${ID(5)}, :'lim', now())
  and not retail.fn_item_es_de_claure(${ID(6)}, :'tru', now());
select 'B4 una venta de antes del arranque no es de CLAURE',
  not retail.fn_item_es_de_claure(${ID(7)}, :'lim', now() - interval '12 days');
update retail.empresas set activo = false where clave = 'claure';
select 'B5 con CLAURE inactiva: lo mismo que antes, y ninguna línea es suya',
  (select count(*) from combinaciones where retail.fn_item_es_de_claure(item, sede, cuando) is distinct from pg_temp.claure_antes(item, sede, cuando)) = 0
  and not exists (select 1 from combinaciones where retail.fn_item_es_de_claure(item, sede, cuando));
update retail.empresas set activo = true, cuenta_corriente_desde = null where clave = 'claure';
select 'B6 sin fecha de arranque: lo mismo que antes, y ninguna línea es suya',
  (select count(*) from combinaciones where retail.fn_item_es_de_claure(item, sede, cuando) is distinct from pg_temp.claure_antes(item, sede, cuando)) = 0
  and not exists (select 1 from combinaciones where retail.fn_item_es_de_claure(item, sede, cuando));
`;

verificar("El diario lee lo congelado sin rearmarlo", correr(`${ESCENA_DIARIO}${CASOS_DIARIO}`), casosDe(CASOS_DIARIO));
verificar("¿Esta línea es de CLAURE?", correr(`${ESCENA_CLAURE}${CASOS_CLAURE}`), casosDe(CASOS_CLAURE));

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);
