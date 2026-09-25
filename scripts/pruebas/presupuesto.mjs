#!/usr/bin/env node
/**
 * Prueba del Presupuesto (ADR-0195, capa «para decidir»; `20260925190000_finanzas_presupuesto.sql`).
 *
 * QUÉ CUBRE
 *   · guardar y leer: una casilla por mes, unidad y rubro; el mes se normaliza al día 1; cambiar deja el antes y el
 *     después en `configuracion_historial`, firmado; sin cambio no deja nada; vaciar deja la fila sin tope (no se borra);
 *     «de la empresa» (ubicación nula) es una sola casilla; solo rubros de gasto (ni ventas ni planilla) y solo tiendas,
 *     Taller o empresa; negativos no; la tabla no se borra ni se muda de casilla;
 *   · UNA SOLA META: la meta de ventas es `fn_meta_mes` (la suma de las metas del día con sus campañas) sin IGV, no se
 *     escribe en el presupuesto, y si cambia una meta del día cambia la del presupuesto;
 *   · presupuesto contra lo real: lo real es el del Estado de resultados (F5) a la fecha; anulados, lo de después del corte
 *     y lo de otro mes no cuentan; CAYLA es la suma exacta de las unidades;
 *   · la proyección al cierre: ventas al % de la meta que se lleva (una campaña que viene pesa), sin meta al ritmo de los
 *     días; gastos con lo fijo entero (el que llegó, y el que falta sin el IGV de su factura) y lo demás al ritmo de hoy;
 *     un fijo archivado no cuenta; mes cerrado = lo real; mes por venir = sin proyección; los estados (se pasa, al filo,
 *     dentro, bajo la meta, en camino, cumplida, sin tope, sin meta, por empezar);
 *   · proponer sin guardar: copiar del mes anterior y el promedio de los 3 últimos meses completos (redondeado hacia arriba
 *     a la decena); aplicar la propuesta de una vez, con una fila de historial; todo o nada;
 *   · permisos: solo el líder escribe, lee la configuración y propone (aunque otra cuenta tenga el módulo Configuración);
 *     con «Reportes financieros», su tienda y nada más; sin él, nada; nadie lee la tabla directo.
 *
 * LOS NÚMEROS ESPERADOS ESTÁN CALCULADOS A MANO (comentarios de la escena), no salen de las funciones.
 *
 * CÓMO. Igual que `estado_resultados.mjs`: cada escena en su transacción con ROLLBACK (la base la comparten otras sesiones),
 * sesión simulada con `request.jwt.claim.sub`. Todo pasa en MARZO DE 2032 (31 días), un mes sin datos de nadie; el «hoy»
 * se fija con `p_hoy` (el 10 de marzo: día 10 de 31).
 *
 * USO
 *   pnpm pruebas:presupuesto    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo

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
        const i = l.lastIndexOf("|");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
  for (const caso of esperados) esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-600) });
}
/** Saca los nombres de caso de un bloque SQL: cada `select 'NOMBRE',` de verificación. */
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

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
create temp table k (n text primary key, id uuid not null default gen_random_uuid());
create function pg_temp.k(p text) returns uuid language sql as $f$
  insert into k (n) values (p) on conflict (n) do update set n = excluded.n returning id
$f$;
-- Una venta de UNA línea cobrada en efectivo (total CON IGV).
create function pg_temp.vender(p_n text, p_ubic uuid, p_cuando timestamptz, p_var uuid, p_total numeric) returns void language plpgsql as $f$
begin
  insert into retail.ventas (id, ubicacion_id, estado, created_at) values (pg_temp.k(p_n), p_ubic, 'completada', p_cuando);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (pg_temp.k(p_n || 'i'), pg_temp.k(p_n), p_var, 1, p_total, 0, 10);
  insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k(p_n), 'efectivo', p_total);
end $f$;
`;

// ============================================================================================================================
// LA ESCENA: MARZO DE 2032 (31 días), «hoy» = 10 de marzo (día 10 de 31). Precios CON IGV al 18 %.
//   TRU = Tienda Trujillo, LIM = Tienda Lima, TAL = Taller, EMP = de la empresa.
//   Metas de TRU: 1,180 todos los días (1,000 sin IGV); una campaña del 20 al 29 sube la meta 50 % (1,770 = 1,500 sin
//   IGV). Meta del mes = 21 × 1,180 + 10 × 1,770 = 42,480 con IGV = 36,000 sin IGV. Meta de los días 1–10 = 10,000.
//   LIM sin metas. Ventas: TRU 10,620 el 4 (9,000 sin IGV) y 1,180 el 12 (después del corte); LIM 1,180 el 6 (1,000).
//   Gastos fijos: alquiler TRU 4,500 (día 5, YA registrado el 5), luz TRU 600 con factura (día 19, falta: 508.47 sin IGV),
//   internet TRU 129 ARCHIVADO, alquiler del Taller 1,800 (día 25, falta).
//   Gastos de marzo: TRU agua 100 (3), bolsas 100 (8), mototaxis 50 (9), bolsas 70 el 15 (después del corte), bolsas 500
//   ANULADO, 999 de abril; EMP publicidad 1,000 (2).
//   Gastos para el promedio (dic–feb): TRU bolsas 100 · 200 · 290 (y 5,000 en noviembre, fuera); EMP publicidad 1,000 en
//   enero.
//   Presupuesto de febrero: TRU alquiler 4,000 · TRU bolsas 250 · EMP publicidad 2,000.
//   Presupuesto de marzo: TRU alquiler 4,500 · TRU servicios 650 · TRU suministros 300 · TAL alquiler 1,800 · EMP
//   publicidad 2,500.
// ============================================================================================================================
const ESCENA = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tal from retail.ubicaciones where tipo = 'taller' order by activo desc, created_at limit 1 \\gset
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select v.id as va from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1 \\gset

-- Metas del día (la ÚNICA meta) y la campaña.
update retail.ubicaciones set meta_venta_diaria = null where id in (:'tru', :'lim');
select retail.guardar_metas_tienda(:'tru', array[1180,1180,1180,1180,1180,1180,1180]::numeric[], null) as _m1 \\gset
select retail.guardar_metas_tienda(:'lim', array[null,null,null,null,null,null,null]::numeric[], null) as _m2 \\gset
insert into retail.etiquetas (id, nombre, estilo, activo, estado, vigente_desde, vigente_hasta)
values (pg_temp.k('CAMP'), 'Campaña de prueba del presupuesto', 'campana', true, 'aprobado', '2032-03-20', '2032-03-29');
select retail.guardar_efecto_campana(pg_temp.k('CAMP'), :'tru', 50, null) as _c \\gset

-- Ventas
select pg_temp.vender('S1', :'tru', '2032-03-04 12:00-05', :'va', 10620);
select pg_temp.vender('S2', :'lim', '2032-03-06 12:00-05', :'va', 1180);
select pg_temp.vender('S3', :'tru', '2032-03-12 12:00-05', :'va', 1180);

-- Gastos fijos (cualquier otro fijo activo de la base local se archiva aquí, dentro de la transacción).
update retail.gastos_fijos set activo = false where activo;
insert into retail.gastos_fijos (id, ubicacion_id, categoria, descripcion, comprobante_tipo, monto, dia_del_mes, activo) values
  (pg_temp.k('F1'), :'tru', 'alquileres',        'Alquiler TRU',        'sin_comprobante', 4500, 5,  true),
  (pg_temp.k('F2'), :'tru', 'servicios_basicos', 'Luz TRU',             'factura',          600, 19, true),
  (pg_temp.k('F3'), :'tru', 'servicios_basicos', 'Internet archivado',  'sin_comprobante',  129, 25, false),
  (pg_temp.k('F4'), :'tal', 'alquileres',        'Alquiler del Taller', 'sin_comprobante', 1800, 25, true);

-- Gastos
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, gasto_fijo_id) values
  (pg_temp.k('G1'), :'tru', 'alquileres',        'Alquiler de marzo', '2032-03-05', 4500, 0, 'transferencia', pg_temp.k('F1')),
  (pg_temp.k('G2'), :'tru', 'servicios_basicos', 'Agua',              '2032-03-03',  100, 0, 'yape', null),
  (pg_temp.k('G3'), :'tru', 'suministros',       'Bolsas',            '2032-03-08',  100, 0, 'yape', null),
  (pg_temp.k('G4'), :'tru', 'transporte',        'Mototaxis',         '2032-03-09',   50, 0, 'yape', null),
  (pg_temp.k('G5'), null,   'publicidad',        'Anuncios',          '2032-03-02', 1000, 0, 'transferencia', null),
  (pg_temp.k('G7'), :'tru', 'suministros',       'Después del corte', '2032-03-15',   70, 0, 'yape', null),
  (pg_temp.k('G8'), :'tru', 'suministros',       'De abril',          '2032-04-02',  999, 0, 'yape', null),
  (pg_temp.k('H1'), :'tru', 'suministros',       'Bolsas dic',        '2031-12-10',  100, 0, 'yape', null),
  (pg_temp.k('H2'), :'tru', 'suministros',       'Bolsas ene',        '2032-01-10',  200, 0, 'yape', null),
  (pg_temp.k('H3'), :'tru', 'suministros',       'Bolsas feb',        '2032-02-10',  290, 0, 'yape', null),
  (pg_temp.k('H4'), null,   'publicidad',        'Anuncios ene',      '2032-01-15', 1000, 0, 'transferencia', null),
  (pg_temp.k('H5'), :'tru', 'suministros',       'Bolsas nov',        '2031-11-10', 5000, 0, 'yape', null);
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado, motivo_anulacion, anulado_en)
values (pg_temp.k('G6'), :'tru', 'suministros', 'Anulado', '2032-03-07', 500, 0, 'yape', 'anulado', 'registrado por error', '2032-03-07 18:00-05');

-- Presupuestos de febrero y de marzo (como el líder)
select retail.guardar_presupuesto('2032-02-01', :'tru', '635', 4000);
select retail.guardar_presupuesto('2032-02-01', :'tru', '656', 250);
select retail.guardar_presupuesto('2032-02-01', null,   '637', 2000);
select retail.guardar_presupuesto('2032-03-01', :'tru', '635', 4500);
select retail.guardar_presupuesto('2032-03-01', :'tru', '636', 650);
select retail.guardar_presupuesto('2032-03-01', :'tru', '656', 300);
select retail.guardar_presupuesto('2032-03-01', :'tal', '635', 1800);
select retail.guardar_presupuesto('2032-03-01', null,   '637', 2500);
`;

// Presupuesto contra lo real, «hoy» = 10 de marzo (d = 10, n = 31).
//   TRU ventas: meta 36,000; real 9,000; al cierre 9,000 ÷ 10,000 × 36,000 = 32,400 (al ritmo de los días serían 27,900)
//     → 90 %: «bajo la meta».
//   TRU alquiler 635: real 4,500 = el fijo ya registrado; nada más → 4,500 de 4,500: «dentro».
//   TRU servicios 636: real 100 (agua); falta la luz: 600 − IGV 91.53 = 508.47 (el internet archivado no); lo demás
//     100 × 31 ÷ 10 = 310 → 818.47 de 650 (125.92 %): «se pasa».
//   TRU suministros 656: real 100 (el anulado, el del 15 y el de abril no) → 310 de 300 (103.33 %): «al filo».
//   TRU transporte 631: 50 sin tope → 155: «sin tope».
//   LIM ventas: sin meta; 1,000 → 3,100 al ritmo de los días: «sin meta».
//   Taller alquiler 635: real 0 + fijo que falta 1,800 → 1,800 de 1,800: «dentro».
//   EMP publicidad 637: 1,000 → 3,100 de 2,500 (124 %): «se pasa».
//   CAYLA: ventas 36,000 · 10,000 · 35,500 (98.61 %) «en camino»; alquiler 6,300 · 4,500 · 6,300; servicios 650 · 100 ·
//     818.47; suministros 300 · 100 · 310; transporte — · 50 · 155; publicidad 2,500 · 1,000 · 3,100.
const CASOS_REAL = `
create temp table r as select * from retail.fn_presupuesto_vs_real('2032-03-01', null, '2032-03-10');
select 'R1 marzo va en curso, al día 10 de 31', (select bool_and(momento = 'en_curso' and dia = 10 and dias = 31) from r);
select 'R1 TRU ventas: la meta es fn_meta_mes sin IGV = 36,000 (con la campaña que viene)',
  (select presupuesto = 36000 and presupuesto = round(retail.fn_meta_mes(:'tru', '2032-03-01') / 1.18, 2) from r where ubicacion_id = :'tru' and linea = 'ventas');
select 'R1 TRU ventas: real 9,000 (sin IGV; la del 12 es después del corte)', (select a_la_fecha = 9000 from r where ubicacion_id = :'tru' and linea = 'ventas');
select 'R1 TRU ventas: al cierre 32,400 al % de la meta que se lleva (no 27,900 al ritmo de los días)', (select proyeccion = 32400 and avance = 0.9 from r where ubicacion_id = :'tru' and linea = 'ventas');
select 'R1 TRU ventas: bajo la meta', (select estado = 'bajo_meta' and tipo = 'meta' and not se_pasa from r where ubicacion_id = :'tru' and linea = 'ventas');
select 'R1 lo real de TRU es el del Estado de resultados a la fecha (ventas y servicios)',
  (select v.a_la_fecha = e.ventas_netas and s.a_la_fecha = (select (x ->> 'monto')::numeric from jsonb_array_elements(e.detalle_gastos) x where x ->> 'cuenta' = '636')
     from r v, r s, retail.fn_estado_resultados('2032-03-01', '2032-03-10', :'tru') e
    where v.ubicacion_id = :'tru' and v.linea = 'ventas' and s.ubicacion_id = :'tru' and s.linea = '636');
select 'R2 TRU alquiler: el fijo registrado entra entero y nada más → 4,500 de 4,500, dentro', (select presupuesto = 4500 and a_la_fecha = 4500 and proyeccion = 4500 and fijo = 4500 and estado = 'dentro' from r where ubicacion_id = :'tru' and linea = '635');
select 'R2 TRU servicios: 100 al ritmo (310) + la luz que falta sin su IGV (508.47) = 818.47; el fijo archivado no', (select a_la_fecha = 100 and proyeccion = 818.47 and fijo = 508.47 from r where ubicacion_id = :'tru' and linea = '636');
select 'R2 TRU servicios se pasa (125.92 %) y queda marcada', (select avance = 1.2592 and se_pasa and estado = 'se_pasa' from r where ubicacion_id = :'tru' and linea = '636');
select 'R2 TRU suministros: 100 (sin el anulado, el del 15 ni el de abril) → 310 de 300, al filo y no marcada', (select a_la_fecha = 100 and proyeccion = 310 and estado = 'al_filo' and not se_pasa from r where ubicacion_id = :'tru' and linea = '656');
select 'R2 TRU transporte sin tope: se ve con su proyección (155)', (select presupuesto is null and a_la_fecha = 50 and proyeccion = 155 and estado = 'sin_tope' from r where ubicacion_id = :'tru' and linea = '631');
select 'R2 un rubro sin tope ni gasto no aparece (mantenimiento)', (select count(*) = 0 from r where linea = '634');
select 'R3 LIM sin meta: al ritmo de los días, 1,000 → 3,100', (select presupuesto is null and a_la_fecha = 1000 and proyeccion = 3100 and estado = 'sin_meta' from r where ubicacion_id = :'lim' and linea = 'ventas');
select 'R3 Taller: sin gasto todavía, el alquiler que falta ya cuenta → 1,800 de 1,800', (select a_la_fecha = 0 and proyeccion = 1800 and estado = 'dentro' from r where ubicacion_id = :'tal' and linea = '635');
select 'R3 el Taller no tiene línea de ventas (no vende ni tiene meta)', (select count(*) = 0 from r where ubicacion_id = :'tal' and linea = 'ventas');
select 'R3 de la empresa: publicidad 1,000 → 3,100 de 2,500, se pasa', (select unidad = 'empresa' and a_la_fecha = 1000 and proyeccion = 3100 and estado = 'se_pasa' from r where ubicacion_id is null and unidad = 'empresa' and linea = '637');
select 'R4 CAYLA ventas: 36,000 · 10,000 · 35,500, en camino', (select presupuesto = 36000 and a_la_fecha = 10000 and proyeccion = 35500 and estado = 'en_camino' from r where unidad = 'consolidado' and linea = 'ventas');
select 'R4 CAYLA alquiler 6,300 · 4,500 · 6,300; servicios 650 · 100 · 818.47; publicidad 2,500 · 1,000 · 3,100',
  (select bool_and(case linea when '635' then presupuesto = 6300 and a_la_fecha = 4500 and proyeccion = 6300
                              when '636' then presupuesto = 650 and a_la_fecha = 100 and proyeccion = 818.47
                              when '637' then presupuesto = 2500 and a_la_fecha = 1000 and proyeccion = 3100 else true end)
     from r where unidad = 'consolidado');
select 'R4 CAYLA es la suma EXACTA de las unidades en cada línea (tope, real y proyección)',
  (select bool_and(c.presupuesto is not distinct from s.p and c.a_la_fecha = s.a and c.proyeccion is not distinct from s.y)
     from r c join (select linea, sum(presupuesto) p, sum(a_la_fecha) a, sum(proyeccion) y from r where unidad <> 'consolidado' group by linea) s using (linea)
    where c.unidad = 'consolidado');
select 'R4 una fila de CAYLA por línea y ninguna de otra cosa', (select count(*) = count(distinct linea) from r where unidad = 'consolidado');
select 'R5 cada línea sale en orden: la unidad, primero las ventas', (select (array_agg(linea order by orden, nombre, orden_linea))[1] = 'ventas' from r where ubicacion_id = :'tru');
`;

// El mismo marzo mirado DESPUÉS (5 de abril: cerrado) y ANTES (20 de febrero: por venir).
//   Cerrado: al cierre = lo real. TRU ventas 10,000 (con la del 12) de 36,000: bajo la meta; TRU suministros 170 (100 + 70
//   del 15) de 300: dentro; TRU servicios 100 (la luz que no llegó ya no se suma): dentro.
const CASOS_MOMENTOS = `
create temp table c as select * from retail.fn_presupuesto_vs_real('2032-03-01', null, '2032-04-05');
select 'M1 mes cerrado: al día 31 de 31', (select bool_and(momento = 'cerrado' and dia = 31 and dias = 31) from c);
select 'M1 mes cerrado: al cierre = lo real en todas las líneas', (select bool_and(proyeccion = a_la_fecha and fijo is null) from c);
select 'M1 cerrado TRU ventas 10,000 de 36,000: bajo la meta', (select a_la_fecha = 10000 and estado = 'bajo_meta' from c where ubicacion_id = :'tru' and linea = 'ventas');
select 'M1 cerrado TRU suministros 170 de 300: dentro', (select a_la_fecha = 170 and estado = 'dentro' from c where ubicacion_id = :'tru' and linea = '656');
select 'M1 cerrado TRU servicios 100: la luz que no llegó no se suma', (select proyeccion = 100 and estado = 'dentro' from c where ubicacion_id = :'tru' and linea = '636');
create temp table v as select * from retail.fn_presupuesto_vs_real('2032-03-01', null, '2032-02-20');
select 'M2 mes por venir: nada real, sin proyección, por empezar', (select bool_and(momento = 'por_venir' and dia = 0 and a_la_fecha = 0 and proyeccion is null) from v);
select 'M2 por venir: los topes y la meta ya se ven', (select presupuesto = 4500 and estado = 'por_empezar' from v where ubicacion_id = :'tru' and linea = '635') and (select presupuesto = 36000 and estado = 'por_empezar' from v where ubicacion_id = :'tru' and linea = 'ventas');
-- UNA SOLA META: si cambia la meta del día, cambia la del presupuesto (y nada se escribió en presupuestos).
select retail.guardar_metas_tienda(:'tru', array[118,118,118,118,118,118,118]::numeric[], null) as _m3 \\gset
select 'M3 cambiar la meta del día cambia la del presupuesto: (21 × 118 + 10 × 177) ÷ 1.18 = 3,600', (select presupuesto = 3600 from retail.fn_presupuesto_vs_real('2032-03-01', null, '2032-03-10') where ubicacion_id = :'tru' and linea = 'ventas');
select 'M3 la meta no vive en presupuestos (ninguna fila de ventas)', (select count(*) = 0 from retail.presupuestos where cuenta in ('7011', '7012'));
select 'M3 cerrado y pasada la meta: cumplida', (select estado = 'cumplida' from retail.fn_presupuesto_vs_real('2032-03-01', null, '2032-04-05') where ubicacion_id = :'tru' and linea = 'ventas');
`;

// Guardar y leer, en mayo de 2032 (sin nada de la escena).
const CASOS_GUARDAR = `
create temp view ultimo as select * from retail.configuracion_historial where que like 'presupuesto%' order by id desc limit 1;
select retail.guardar_presupuesto('2032-05-15', :'tru', '635', 4500);
select 'G1 el mes se guarda como su día 1 y se lee en la configuración',
  (select (retail.fn_presupuesto_configuracion('2032-05-20') -> 'montos') @> jsonb_build_array(jsonb_build_object('ubicacion_id', :'tru', 'cuenta', '635', 'monto', 4500)));
select 'G1 deja el antes (nada) y el después (4,500) en el historial, firmado por el responsable',
  (select h.que = 'presupuesto' and h.detalle ->> 'antes' is null and (h.detalle ->> 'despues')::numeric = 4500 and h.detalle ->> 'mes' = '2032-05-01' and h.hecho_por = :'felipe'
     from ultimo h);
select 'G1 la casilla queda firmada', (select creado_por = :'felipe' and actualizado_por = :'felipe' from retail.presupuestos where mes = '2032-05-01' and ubicacion_id = :'tru' and cuenta = '635');
select retail.guardar_presupuesto('2032-05-01', :'tru', '635', 4800);
select 'G2 cambiarla deja 4,500 → 4,800 y sigue siendo UNA casilla',
  (select (h.detalle ->> 'antes')::numeric = 4500 and (h.detalle ->> 'despues')::numeric = 4800 from ultimo h)
  and (select count(*) = 1 and max(monto) = 4800 from retail.presupuestos where mes = '2032-05-01' and ubicacion_id = :'tru' and cuenta = '635');
select count(*) as hist_antes from retail.configuracion_historial where que like 'presupuesto%' \\gset
select retail.guardar_presupuesto('2032-05-01', :'tru', '635', 4800);
select 'G3 guardar lo mismo no deja historial', (select count(*) = :hist_antes from retail.configuracion_historial where que like 'presupuesto%');
select retail.guardar_presupuesto('2032-05-01', :'tru', '635', 0);
select 'G4 vaciar (0) deja la fila SIN tope, no la borra', (select count(*) = 1 and bool_and(monto is null) from retail.presupuestos where mes = '2032-05-01' and ubicacion_id = :'tru' and cuenta = '635');
select 'G4 y lo anota: 4,800 → sin tope', (select (h.detalle ->> 'antes')::numeric = 4800 and h.detalle ->> 'despues' is null from ultimo h);
select 'G4 una casilla vacía no sale en la configuración', (select jsonb_array_length(retail.fn_presupuesto_configuracion('2032-05-01') -> 'montos') = 0);
select retail.guardar_presupuesto('2032-05-01', :'lim', '656', null);
select 'G5 vaciar lo que no existe no crea nada', (select count(*) = 0 from retail.presupuestos where mes = '2032-05-01' and ubicacion_id = :'lim');
select retail.guardar_presupuesto('2032-05-01', null, '637', 2000);
select retail.guardar_presupuesto('2032-05-01', null, '637', 2200);
select 'G6 «de la empresa» (sin ubicación) es UNA sola casilla', (select count(*) = 1 and max(monto) = 2200 from retail.presupuestos where mes = '2032-05-01' and ubicacion_id is null and cuenta = '637');
select 'G7 un tope negativo no', (select pg_temp.intento(format('select retail.guardar_presupuesto(%L, %L, %L, -5)', '2032-05-01', :'tru', '656')) like '%negativo%');
select 'G8 las ventas no llevan tope: la meta es la de las metas del día', (select pg_temp.intento(format('select retail.guardar_presupuesto(%L, %L, %L, 1000)', '2032-05-01', :'tru', '7011')) like '%meta de ventas no se escribe%');
select 'G8 la planilla tampoco (la decide Dynamic)', (select pg_temp.intento(format('select retail.guardar_presupuesto(%L, %L, %L, 1000)', '2032-05-01', :'tru', '62')) like '%Solo los rubros de gasto%');
insert into retail.ubicaciones (id, nombre, tipo, activo) values (pg_temp.k('ALM'), 'Almacén de prueba presupuesto', 'almacen', true);
select 'G9 un almacén no lleva presupuesto', (select pg_temp.intento(format('select retail.guardar_presupuesto(%L, %L, %L, 100)', '2032-05-01', pg_temp.k('ALM'), '656')) like '%tienda, del Taller o de la empresa%');
select 'G10 una casilla no se borra', (select pg_temp.intento('delete from retail.presupuestos where mes = ''2032-05-01''') like '%no se borra%');
select 'G11 una casilla no se muda de rubro', (select pg_temp.intento('update retail.presupuestos set cuenta = ''656'' where mes = ''2032-05-01'' and cuenta = ''637''') like '%no cambia de mes%');
select 'G12 no hay dos casillas de la empresa para el mismo rubro', (select pg_temp.intento('insert into retail.presupuestos (mes, ubicacion_id, cuenta, monto) values (''2032-05-01'', null, ''637'', 1)') like '%presupuestos_una_casilla%');
select 'G13 un mes que no empieza en 1 no entra por fuera de las funciones', (select pg_temp.intento('insert into retail.presupuestos (mes, ubicacion_id, cuenta, monto) values (''2032-05-02'', null, ''656'', 1)') like '%check%');
select 'G14 la configuración trae las unidades (tiendas, Taller y la empresa) y un rubro por cuenta de gasto',
  (select jsonb_array_length(c -> 'unidades') >= 3 and (c -> 'unidades') @> '[{"unidad":"empresa","id":null}]'::jsonb
      and (select count(*) from jsonb_array_elements(c -> 'lineas')) = (select count(distinct cuenta_pcge) from retail.categorias_gasto where activo)
      and not (c -> 'lineas') @> '[{"cuenta":"62"}]'::jsonb
     from retail.fn_presupuesto_configuracion('2032-05-01') c);
select 'G14 la meta de ventas de la configuración es la del día sin IGV (TRU)',
  (select (u ->> 'meta_ventas')::numeric = round(retail.fn_meta_mes(:'tru', '2032-03-01') / 1.18, 2)
     from jsonb_array_elements(retail.fn_presupuesto_configuracion('2032-03-01') -> 'unidades') u where u ->> 'id' = :'tru');
`;

// Proponer (no guarda) y aplicar lo propuesto.
//   Copiar de febrero: TRU alquiler 4,500 → 4,000 · TRU suministros 300 → 250 · EMP publicidad 2,500 → 2,000.
//   Promedio de dic–feb (los 3 completos antes de marzo): TRU suministros (100 + 200 + 290) ÷ 3 = 196.67 → 200 · EMP
//   publicidad 1,000 ÷ 3 = 333.33 → 340. Noviembre no entra; marzo (en curso) tampoco.
const CASOS_PROPUESTA = `
create temp table pa as select * from retail.fn_presupuesto_propuesta('2032-03-01', 'mes_anterior', '2032-03-10');
select 'P1 copiar de febrero propone sus 3 topes, con lo que hay hoy al lado', (select count(*) = 3 from pa)
  and (select actual = 4500 and propuesto = 4000 from pa where ubicacion_id = :'tru' and cuenta = '635')
  and (select actual = 300 and propuesto = 250 from pa where ubicacion_id = :'tru' and cuenta = '656')
  and (select actual = 2500 and propuesto = 2000 from pa where ubicacion_id is null and cuenta = '637');
select 'P1 dice de qué mes sale', (select bool_and(desde = '2032-02-01' and hasta = '2032-02-29') from pa);
select 'P2 proponer NO guarda nada', (select monto = 4500 from retail.presupuestos where mes = '2032-03-01' and ubicacion_id = :'tru' and cuenta = '635');
create temp table pp as select * from retail.fn_presupuesto_propuesta('2032-03-01', 'promedio_3_meses', '2032-03-10');
select 'P3 promedio de 3 meses: TRU suministros 196.67 → 200 (noviembre fuera)', (select actual = 300 and propuesto = 200 from pp where ubicacion_id = :'tru' and cuenta = '656');
select 'P3 promedio de 3 meses: empresa publicidad 333.33 → 340', (select actual = 2500 and propuesto = 340 from pp where ubicacion_id is null and cuenta = '637');
select 'P3 el mes en curso no entra (el agua de marzo no propone servicios)', (select count(*) = 0 from pp where ubicacion_id = :'tru' and cuenta = '636');
select 'P3 son los 3 meses completos antes de marzo', (select bool_and(desde = '2031-12-01' and hasta = '2032-02-29') from pp);
select 'P4 para abril (con marzo en curso) también dic–feb: nunca el mes que corre', (select bool_and(desde = '2031-12-01' and hasta = '2032-02-29') and count(*) > 0 from retail.fn_presupuesto_propuesta('2032-04-01', 'promedio_3_meses', '2032-03-10'));
select count(*) as hist_antes from retail.configuracion_historial where que = 'presupuesto_propuesta' \\gset
select retail.guardar_presupuesto_lote('2032-03-01', (select jsonb_agg(jsonb_build_object('ubicacion_id', ubicacion_id, 'cuenta', cuenta, 'monto', propuesto)) from pa), 'mes_anterior') as aplicadas \\gset
select 'P5 aplicar lo copiado cambia las 3 casillas', (select :aplicadas = 3)
  and (select monto = 4000 from retail.presupuestos where mes = '2032-03-01' and ubicacion_id = :'tru' and cuenta = '635')
  and (select monto = 2000 from retail.presupuestos where mes = '2032-03-01' and ubicacion_id is null and cuenta = '637');
select 'P5 con UNA fila de historial que lista cada cambio y de dónde salió',
  (select count(*) = :hist_antes + 1 from retail.configuracion_historial where que = 'presupuesto_propuesta')
  and (select jsonb_array_length(h.detalle -> 'cambios') = 3 and h.detalle ->> 'origen' = 'mes_anterior' and h.hecho_por = :'felipe'
         from retail.configuracion_historial h where h.que = 'presupuesto_propuesta' order by h.id desc limit 1);
select 'P5 lo que la propuesta no trae se queda como estaba (servicios 650, Taller 1,800)',
  (select monto = 650 from retail.presupuestos where mes = '2032-03-01' and ubicacion_id = :'tru' and cuenta = '636')
  and (select monto = 1800 from retail.presupuestos where mes = '2032-03-01' and ubicacion_id = :'tal' and cuenta = '635');
select retail.guardar_presupuesto_lote('2032-03-01', (select jsonb_agg(jsonb_build_object('ubicacion_id', ubicacion_id, 'cuenta', cuenta, 'monto', propuesto)) from pa), 'mes_anterior') as otra \\gset
select 'P6 aplicarla otra vez no cambia nada ni deja historial', (select :otra = 0) and (select count(*) = :hist_antes + 1 from retail.configuracion_historial where que = 'presupuesto_propuesta');
select 'P7 todo o nada: una casilla mala (ventas) no deja pasar a las buenas',
  (select pg_temp.intento(format('select retail.guardar_presupuesto_lote(%L, %L::jsonb, %L)', '2032-03-01',
     jsonb_build_array(jsonb_build_object('ubicacion_id', :'tru', 'cuenta', '656', 'monto', 999), jsonb_build_object('ubicacion_id', :'tru', 'cuenta', '7011', 'monto', 5)), 'promedio_3_meses')) like '%meta de ventas%')
  and (select monto = 250 from retail.presupuestos where mes = '2032-03-01' and ubicacion_id = :'tru' and cuenta = '656');
select 'P8 sin origen conocido o sin filas no aplica', (select pg_temp.intento('select retail.guardar_presupuesto_lote(''2032-03-01'', ''[{"cuenta":"656","monto":1}]'', ''a_ojo'')') like '%de dónde sale%')
  and (select pg_temp.intento('select retail.guardar_presupuesto_lote(''2032-03-01'', ''[]'', ''mes_anterior'')') like '%nada que aplicar%');
select 'P9 una forma de proponer que no existe', (select pg_temp.intento('select * from retail.fn_presupuesto_propuesta(''2032-03-01'', ''adivinar'')') like '%mes anterior o desde el promedio%');
`;

// Permisos: MICAELA (colaboradora de TRU), sin y con «Reportes financieros»; nadie lee la tabla directo.
const CASOS_PERMISOS = `
${cambiaA(MICAELA)}
select 'X1 sin «Reportes financieros» no ve el presupuesto', (select pg_temp.intento('select * from retail.fn_presupuesto_vs_real(''2032-03-01'', null, ''2032-03-10'')') like '%Reportes financieros%');
${conModulo("reportes_financieros")}
create temp table m as select * from retail.fn_presupuesto_vs_real('2032-03-01', null, '2032-03-10');
select 'X2 con el módulo ve SU tienda y nada más (ni la empresa, ni el Taller, ni CAYLA)', (select count(*) > 0 and bool_and(ubicacion_id = :'tru') from m);
select 'X2 y ve los mismos números que el líder (servicios 818.47, se pasa)', (select proyeccion = 818.47 and estado = 'se_pasa' from m where linea = '636');
select 'X3 pedir otra tienda falla', (select pg_temp.intento(format('select * from retail.fn_presupuesto_vs_real(%L, %L, %L)', '2032-03-01', :'lim', '2032-03-10')) like '%No puedes ver%');
select 'X4 no escribe una casilla (Configuración es solo del líder y la base lo vuelve a pedir)', (select pg_temp.intento(format('select retail.guardar_presupuesto(%L, %L, %L, 1)', '2032-03-01', :'tru', '656')) like '%Solo el líder%');
select 'X4 no aplica una propuesta', (select pg_temp.intento('select retail.guardar_presupuesto_lote(''2032-03-01'', ''[{"cuenta":"656","monto":1}]'', ''mes_anterior'')') like '%Solo el líder%');
select 'X4 no propone ni lee la configuración', (select pg_temp.intento('select * from retail.fn_presupuesto_propuesta(''2032-03-01'', ''mes_anterior'')') like '%Solo el líder%')
  and (select pg_temp.intento('select retail.fn_presupuesto_configuracion(''2032-03-01'')') like '%Solo el líder%');
select 'X4 y su casilla sigue igual', (select monto = 300 from retail.presupuestos where mes = '2032-03-01' and ubicacion_id = :'tru' and cuenta = '656');
select 'X5 nadie lee ni escribe la tabla directo (sin permisos para authenticated ni anon)',
  (select not has_table_privilege('authenticated', 'retail.presupuestos', 'select') and not has_table_privilege('authenticated', 'retail.presupuestos', 'insert')
      and not has_table_privilege('authenticated', 'retail.presupuestos', 'update') and not has_table_privilege('authenticated', 'retail.presupuestos', 'delete')
      and not has_table_privilege('anon', 'retail.presupuestos', 'select'));
select 'X5 la tabla tiene RLS encendido y sin políticas', (select c.relrowsecurity and not exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = 'presupuestos') from pg_class c where c.oid = 'retail.presupuestos'::regclass);
select 'X6 anon no llama a las funciones', (select not has_function_privilege('anon', 'retail.fn_presupuesto_vs_real(date, uuid, date)', 'execute') and not has_function_privilege('anon', 'retail.guardar_presupuesto(date, uuid, text, numeric)', 'execute'));
`;

// Cuánto tarda con los datos reales de la base local (el mes de hoy, como el líder).
const TIEMPO = `
begin;
${cambiaA(FELIPE)}
create function pg_temp.medir(p_sql text) returns numeric language plpgsql as $f$
declare t timestamptz := clock_timestamp();
begin
  execute p_sql;
  return round(extract(epoch from clock_timestamp() - t) * 1000);
end $f$;
select 'ms_vs_real', pg_temp.medir($$select count(*) from retail.fn_presupuesto_vs_real(date_trunc('month', retail.fn_hoy_lima())::date)$$);
select 'ms_config', pg_temp.medir($$select retail.fn_presupuesto_configuracion(retail.fn_hoy_lima())$$);
`;

// ---------------------------------------------------------------------------------------------------------------------------
verificar("Contra lo real", correr(`${ESCENA}${CASOS_REAL}`), casosDe(CASOS_REAL));
verificar("Cerrado, por venir y una sola meta", correr(`${ESCENA}${CASOS_MOMENTOS}`), casosDe(CASOS_MOMENTOS));
verificar("Guardar y leer", correr(`${ESCENA}${CASOS_GUARDAR}`), casosDe(CASOS_GUARDAR));
verificar("Proponer y aplicar", correr(`${ESCENA}${CASOS_PROPUESTA}`), casosDe(CASOS_PROPUESTA));
verificar("Permisos", correr(`${ESCENA}${CASOS_PERMISOS}`), casosDe(CASOS_PERMISOS));
{
  const r = correr(TIEMPO);
  const v = new Map((r.ok ? r.salida.split("\n") : []).map((l) => l.split("|")));
  if (r.ok) console.log(`  tiempos (base local, mes de hoy): presupuesto contra lo real ${v.get("ms_vs_real")} ms · configuración ${v.get("ms_config")} ms`);
  esperar("T1 el presupuesto contra lo real del mes tarda menos de 2 s", r.ok && Number(v.get("ms_vs_real")) < 2000, r.ok ? v.get("ms_vs_real") : r);
}

console.log(fallos ? `\n${fallos} de ${casos} verificaciones fallaron` : `\nLas ${casos} verificaciones pasaron`);
process.exit(fallos ? 1 : 0);
