#!/usr/bin/env node
/**
 * Prueba de `20261107174000_igv_de_las_ventas_regla_pareja.sql` (ADR-0624, «regla pareja»): el IGV de las ventas es de SUNAT y Ganancias y
 * pérdidas lo resta siempre; `fn_igv_de_las_ventas` solo lo lee para mostrar lo cobrado sobre «Lo que vendiste».
 *
 * QUÉ PROMETE
 *   · Ventas con IGV = ventas netas + 4011 de venta, anulación, devolución y cambio, también con adelanto: el adelanto ya está fuera
 *     de las netas y su IGV no se cuenta dos veces.
 *   · Por unidad y por mes; un rango parcial cuenta solo lo de sus días; antes del inicio de Finanzas no hay filas.
 *   · Solo lee: el diario, el Estado de resultados y el Balance quedan iguales.
 *   · Quien ve toda CAYLA lee todo; con «Reportes financieros» en una sede, la suya; sin nada, 42501.
 *   · El «IGV que dice el líder» (ADR-0620) ya no existe: ni `decir_igv_del_mes`, ni `fn_igv_de_gestion`, ni (vacía) `igv_del_mes`.
 *   · Una regla nueva de `fn_asientos*` que mueva la 4011 o la 7011 hace fallar esta suite: la lista de `fn_igv_de_las_ventas` hay que revisarla.
 *
 * LOS NÚMEROS ESPERADOS ESTÁN CALCULADOS A MANO (comentarios de la escena), no salen de las funciones.
 *
 * CÓMO. Cada escena en su transacción con ROLLBACK (la base la comparten otras sesiones) y sesión simulada con
 * `request.jwt.claim.sub`. Los meses son de 2025, que ninguna otra escena toca, con Finanzas contando desde siempre.
 *
 * USO
 *   pnpm pruebas:igv-ventas
 *   RETAIL_CONTENEDOR_PG=<contenedor> pnpm pruebas:igv-ventas   → contra otra pila local
 */
import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo
const TERMINAL = "22222222-2222-4222-8222-0000000000f8";

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
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1200)}`);
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
  for (const caso of esperados) {
    esperar(caso, lineas.get(caso) === "t", lineas.has(caso) ? { valor: lineas.get(caso) } : { falta: caso, salida: r.salida.slice(-600) });
  }
}
const casosDe = (sql) => [...sql.matchAll(/^select '([^']+)',/gm)].map((m) => m[1]);

const AYUDANTES = `
-- «SQLSTATE|mensaje|hint» de lo que falla ('SIN_ERROR' si no falla).
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
create temp table k (n text primary key, id uuid not null default gen_random_uuid());
create function pg_temp.k(p text) returns uuid language sql as $f$
  insert into k (n) values (p) on conflict (n) do update set n = excluded.n returning id
$f$;
-- Una venta de UNA línea con sus cobros (jsonb [{m, v}]); si viene anulada, la prenda vuelve vendible.
create function pg_temp.vender(p_n text, p_ubic uuid, p_cuando timestamptz, p_var uuid, p_cant int, p_precio numeric, p_pagos jsonb,
                               p_anulada timestamptz default null) returns void language plpgsql as $f$
declare x jsonb;
begin
  insert into retail.ventas (id, ubicacion_id, estado, anulado_en, motivo_anulacion, created_at)
  values (pg_temp.k(p_n), p_ubic, case when p_anulada is null then 'completada' else 'anulada' end, p_anulada,
          case when p_anulada is null then null else 'prueba IGV' end, p_cuando);
  insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (pg_temp.k(p_n || 'i'), pg_temp.k(p_n), p_var, p_cant, p_precio, 0, 40);
  for x in select * from jsonb_array_elements(p_pagos) loop
    insert into retail.venta_pagos (venta_id, metodo, monto) values (pg_temp.k(p_n), x ->> 'm', (x ->> 'v')::numeric);
  end loop;
  if p_anulada is not null then
    insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (pg_temp.k(p_n), pg_temp.k(p_n || 'i'), 'vendible');
  end if;
end $f$;
-- Lo que suma la lectura en un rango (todas las filas que esta sesión ve).
create function pg_temp.suma(p_desde date, p_hasta date) returns numeric language sql as $f$
  select coalesce(sum(igv), 0) from retail.fn_igv_de_las_ventas(p_desde, p_hasta)
$f$;
create function pg_temp.de(p_desde date, p_hasta date, p_ubic uuid) returns numeric language sql as $f$
  select igv from retail.fn_igv_de_las_ventas(p_desde, p_hasta) where ubicacion_id is not distinct from p_ubic
$f$;
`;

const BASE = `
begin;
${AYUDANTES}
${cambiaA(FELIPE)}
update retail.parametros_finanzas set inicio_finanzas = null where id;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tal from retail.ubicaciones where tipo = 'taller' order by activo desc, created_at limit 1 \\gset
select p.id as felipe from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select (select id from retail.cajas order by abierta_en desc nulls last limit 1) as caja \\gset
select v.id as va from retail.variantes v where v.id <> '22222222-2222-4222-8222-222222222222' order by v.id limit 1 \\gset
select v.id as vn from retail.variantes v where v.id not in ('22222222-2222-4222-8222-222222222222', :'va') order by v.id limit 1 \\gset
`;

// ============================================================================================================================
// AGOSTO DE 2025, precios CON IGV al 18 % (236 → 36 + 200 · 118 → 18 + 100 · 590 → 90 + 500 · 59 → 9 + 50).
//   TRU: V1 236 (día 3) · V2 118 (día 20) · V3 236 con adelanto de 118 (día 18; el adelanto se pagó el 2).
//        Netas 500, IGV 90: el debe de 18 del adelanto NO resta, y la boleta de anticipo NO suma.
//   LIM: V4 118 (día 5) · V5 118 vendida el 6 y anulada el 7 (0) · V6 2 × 118 (día 8) con una devolución de 118 el 12 (+36 −18)
//        · V7 236 (día 9) con un cambio de +59 el 13 (+36 +9).  Netas 100 + 0 + 200 − 100 + 200 + 50 = 450, IGV 81.
//   Taller: V8 590 (día 25). Netas 500, IGV 90.
//   Mes: IGV 261. Tramo del 1 al 10: TRU 36 · LIM 18 + 0 + 36 + 36 = 90 · Taller 0 → 126.
// ============================================================================================================================
const AGOSTO = `
select pg_temp.vender('V1', :'tru', '2025-08-03 12:00-05', :'va', 1, 236, '[{"m":"efectivo","v":236}]');
select pg_temp.vender('V2', :'tru', '2025-08-20 12:00-05', :'va', 1, 118, '[{"m":"yape","v":118}]');
insert into retail.separaciones (id, codigo, ubicacion_id, caja_id, clienta_nombres, clienta_apellidos, clienta_celular, comprobante_tipo,
       creado_por, total, adelanto, vence_el, devolucion_medio, devolucion_numero, estado, created_at)
values (pg_temp.k('SEP'), 'IG-' || left(pg_temp.k('SEP')::text, 8), :'tru', :'caja', 'Ana', 'Prueba', '999888777', 'boleta',
        :'felipe', 236, 118, '2025-08-20', 'yape', '999888777', 'abierta', '2025-08-02 10:00-05');
insert into retail.separacion_pagos (separacion_id, metodo, monto, created_at) values (pg_temp.k('SEP'), 'yape', 118, '2025-08-02 10:00-05');
select pg_temp.vender('V3', :'tru', '2025-08-18 12:00-05', :'va', 1, 236, '[{"m":"anticipo","v":118},{"m":"efectivo","v":118}]');
update retail.separaciones set estado = 'entregada', venta_id = pg_temp.k('V3'), entregada_en = '2025-08-18 12:00-05' where id = pg_temp.k('SEP');
select pg_temp.vender('V4', :'lim', '2025-08-05 12:00-05', :'va', 1, 118, '[{"m":"efectivo","v":118}]');
select pg_temp.vender('V5', :'lim', '2025-08-06 12:00-05', :'va', 1, 118, '[{"m":"efectivo","v":118}]', '2025-08-07 12:00-05');
select pg_temp.vender('V6', :'lim', '2025-08-08 12:00-05', :'va', 2, 118, '[{"m":"efectivo","v":236}]');
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, aprobado_en)
values (pg_temp.k('D1'), pg_temp.k('V6'), :'lim', 'talla', 'aprobada', null, 'efectivo', '2025-08-12 10:00-05');
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (pg_temp.k('D1'), pg_temp.k('V6i'), 1, 'vendible');
select pg_temp.vender('V7', :'lim', '2025-08-09 12:00-05', :'va', 1, 236, '[{"m":"efectivo","v":236}]');
insert into retail.cambios (id, venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, motivo, condicion, created_at)
values (pg_temp.k('C1'), pg_temp.k('V7i'), :'lim', :'vn', 1, 59, 'efectivo', 'talla_chica', 'vendible', '2025-08-13 12:00-05');
select pg_temp.vender('V8', :'tal', '2025-08-25 12:00-05', :'va', 1, 590, '[{"m":"efectivo","v":590}]');
`;

const VENTAS_CON_IGV = `
create temp table g as select * from retail.fn_igv_de_las_ventas('2025-08-01', '2025-08-31');
create temp table er as select * from retail.fn_estado_resultados('2025-08-01', '2025-08-31');
select 'A1 Trujillo, con adelanto: netas 500 + IGV 90 = 590', (select ventas_netas from er where ubicacion_id = :'tru') = 500 and (select igv from g where ubicacion_id = :'tru') = 90;
select 'A2 Lima, con anulación, devolución y cambio: netas 450 + IGV 81 = 531', (select ventas_netas from er where ubicacion_id = :'lim') = 450 and (select igv from g where ubicacion_id = :'lim') = 81;
select 'A3 el adelanto sí está en la 4011: si se sumara, Trujillo daría otra cifra', (select sum(haber - debe) from retail.fn_diario('2025-08-01', '2025-08-31', :'tru') where cuenta = '4011') = 90 and (select sum(haber) from retail.fn_diario('2025-08-01', '2025-08-31', :'tru') where cuenta = '4011') = 108;
select 'A4 una fila por unidad, y el mes suma 261 (90 · 81 · 90)', (select count(*) from g) = 3 and (select sum(igv) from g) = 261 and (select igv from g where ubicacion_id = :'tal') = 90 and (select bool_and(mes = '2025-08-01') from g);
select 'A5 un rango que no toca el mes no devuelve filas', not exists (select 1 from retail.fn_igv_de_las_ventas('2025-01-01', '2025-01-31'));
select 'A6 un rango parcial cuenta solo sus días: del 1 al 10, 126 (36 · 90) y el Taller sin fila', pg_temp.suma('2025-08-01', '2025-08-10') = 126 and pg_temp.de('2025-08-01', '2025-08-10', :'lim') = 90 and pg_temp.de('2025-08-01', '2025-08-10', :'tal') is null;

-- Septiembre: una venta de 118 en Trujillo. Un rango de dos meses los dice por separado.
select pg_temp.vender('V9', :'tru', '2025-09-02 12:00-05', :'va', 1, 118, '[{"m":"efectivo","v":118}]');
select 'A7 dos meses van por separado', (select count(*) = 4 from retail.fn_igv_de_las_ventas('2025-08-01', '2025-09-30')) and (select igv from retail.fn_igv_de_las_ventas('2025-08-01', '2025-09-30') where mes = '2025-09-01') = 18;

-- Junio: una venta de mayo anulada en junio deja el IGV de Lima en −36.
select pg_temp.vender('V10', :'lim', '2025-05-20 12:00-05', :'va', 1, 236, '[{"m":"efectivo","v":236}]', '2025-06-03 12:00-05');
select 'A8 una anulación de otro mes deja el IGV negativo, y se dice', pg_temp.de('2025-06-01', '2025-06-30', :'lim') = -36 and pg_temp.de('2025-05-01', '2025-05-31', :'lim') = 36;
`;

const LIBRO = `
create temp table antes as
  select (select count(*) from retail.fn_diario('2025-01-01', '2025-12-31')) as lineas,
         (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_diario('2025-01-01', '2025-12-31') t) as diario,
         (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_estado_resultados('2025-08-01', '2025-08-31') t) as er;
select count(*) from retail.fn_igv_de_las_ventas('2025-01-01', '2025-12-31');
select 'L1 leer no agrega líneas al diario', (select lineas from antes) = (select count(*) from retail.fn_diario('2025-01-01', '2025-12-31'));
select 'L2 el diario queda idéntico', (select diario from antes) = (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_diario('2025-01-01', '2025-12-31') t);
select 'L3 el Estado de resultados queda idéntico', (select er from antes) = (select md5(string_agg(t::text, ',' order by t::text)) from retail.fn_estado_resultados('2025-08-01', '2025-08-31') t);
`;

const RETIRADO = `
select 'X1 decir_igv_del_mes ya no existe', to_regprocedure('retail.decir_igv_del_mes(date,numeric,text)') is null;
select 'X2 fn_igv_de_gestion ya no existe', to_regprocedure('retail.fn_igv_de_gestion(date,date)') is null;
select 'X3 la tabla vacía igv_del_mes se fue con su disparador y sus funciones internas', to_regclass('retail.igv_del_mes') is null
  and to_regprocedure('retail.fn_igv_del_mes_candado()') is null and to_regprocedure('retail.fn_exigir_igv_mes_abierto(date)') is null;
`;

const REGLAS_DEL_RANGO = `
select 'M1 un rango al revés se rechaza', pg_temp.intento($q$select * from retail.fn_igv_de_las_ventas('2025-08-31', '2025-08-01')$q$) like 'P0001|El rango de fechas%';
select 'M2 un rango sin fecha se rechaza', pg_temp.intento($q$select * from retail.fn_igv_de_las_ventas(null, '2025-08-01')$q$) like 'P0001|El rango de fechas%';
select pg_temp.vender('V9', :'tru', '2025-09-02 12:00-05', :'va', 1, 118, '[{"m":"efectivo","v":118}]');
update retail.parametros_finanzas set inicio_finanzas = '2025-09-01' where id;
select 'M3 la lectura arranca con Finanzas: agosto no entra y septiembre sí', (select count(*) = 1 and bool_and(mes = '2025-09-01' and ubicacion_id = :'tru' and igv = 18) from retail.fn_igv_de_las_ventas('2025-08-01', '2025-09-30'));
select 'M4 un rango que termina antes del inicio no devuelve nada', not exists (select 1 from retail.fn_igv_de_las_ventas('2025-08-01', '2025-08-31'));
`;

const PERMISOS_COLABORADORA = `
${cambiaA(MICAELA)}
select 'P1 sin el módulo no lee', pg_temp.intento($q$select * from retail.fn_igv_de_las_ventas('2025-08-01', '2025-08-31')$q$) like '42501|Ver el IGV de las ventas%';
${conModulo("reportes_financieros")}
select 'P2 con «Reportes financieros» lee lo mismo que el líder', pg_temp.suma('2025-08-01', '2025-08-31') = 261 and (select count(*) from retail.fn_igv_de_las_ventas('2025-08-01', '2025-08-31')) = 3;
`;

const PERMISOS_TERMINAL = `
insert into auth.users (id, email) values ('${TERMINAL}', 'terminal-igv@cayla.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id, rol_id)
  values (:'tru', 'Caja IGV', 'ventas', '${TERMINAL}', retail.fn_rol_por_clave('integrante'));
${conModulo("reportes_financieros")}
${cambiaA(TERMINAL)}
select 'T1 la terminal con el módulo ve solo su tienda', (select count(*) = 1 and bool_and(ubicacion_id = :'tru' and igv = 90) from retail.fn_igv_de_las_ventas('2025-08-01', '2025-08-31'));
`;

const ACCESO_DIRECTO = `
select 'H1 anon no la llama', not has_function_privilege('anon', 'retail.fn_igv_de_las_ventas(date,date)', 'execute');
select 'H2 una sesión sí la llama', has_function_privilege('authenticated', 'retail.fn_igv_de_las_ventas(date,date)', 'execute');
`;

// La lista de reglas de `fn_igv_de_las_ventas` depende de quién escribe la 4011 y la 7011. Si este conteo cambia, alguien agregó una regla:
// mírala, decide si entra a la lista y recién ahí sube el número aquí.
const ESCRIBEN_LA_4011_Y_LA_7011 = {
  fn_asientos: { igv: 13, ventas: 5 },
  fn_asientos_claure: { igv: 0, ventas: 5 },
  fn_asientos_dinero_y_caja: { igv: 1, ventas: 0 },
  fn_asientos_igv_perdido: { igv: 1, ventas: 0 },
  fn_asientos_nota_proveedor: { igv: 1, ventas: 0 },
};
const REGLAS_DE_LA_VENTA = ["venta", "anulacion", "devolucion", "cambio"];
const REGLAS_FUERA = ["anticipo", "anticipo_devuelto", "gasto", "compra", "activo", "nota_credito_prov"];

function vigilarLasReglas() {
  const r = correr(`begin;
select p.proname || '|' || (length(p.prosrc) - length(replace(p.prosrc, '''4011''', ''))) / 6 || '|' || (length(p.prosrc) - length(replace(p.prosrc, '''7011''', ''))) / 6 || '|' || (position('''7012''' in p.prosrc) > 0)::text
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname like 'fn_asientos%' order by 1;`);
  if (!r.ok) {
    esperar("R0 se puede leer quién escribe la 4011", false, r);
    return;
  }
  const hallado = {};
  let la7012 = false;
  for (const linea of r.salida.split("\n")) {
    const [fn, igv, ventas, s7012] = linea.split("|");
    if (s7012 === "true") la7012 = true;
    if (Number(igv) > 0 || Number(ventas) > 0) hallado[fn] = { igv: Number(igv), ventas: Number(ventas) };
  }
  esperar(
    "R1 ninguna regla nueva escribe la 4011 ni la 7011 (si falla: revisa la lista de fn_igv_de_las_ventas)",
    JSON.stringify(hallado, Object.keys(hallado).sort()) === JSON.stringify(ESCRIBEN_LA_4011_Y_LA_7011, Object.keys(ESCRIBEN_LA_4011_Y_LA_7011).sort()) &&
      Object.keys(hallado).sort().join() === Object.keys(ESCRIBEN_LA_4011_Y_LA_7011).sort().join(),
    hallado
  );
  esperar("R2 nadie escribe la 7012: sus ventas no traerían IGV a la lista", !la7012);

  const d = correr(`begin;
select pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure);`);
  const reglas = new Set(d.ok ? [...d.salida.matchAll(/'([a-z_]+)'(?:::text as regla)?,\s*(?:case when [^\n]*? else )?'4011'/g)].map((m) => m[1]) : []);
  const esperadas = [...REGLAS_DE_LA_VENTA, ...REGLAS_FUERA];
  esperar(
    "R3 las reglas de fn_asientos que escriben la 4011 son las conocidas",
    [...reglas].sort().join() === esperadas.sort().join(),
    { halladas: [...reglas].sort() }
  );
}

const ESCENA = `${BASE}${AGOSTO}`;
verificar("Ventas con IGV", correr(`${ESCENA}${VENTAS_CON_IGV}`), casosDe(VENTAS_CON_IGV));
verificar("El libro no cambia", correr(`${ESCENA}${LIBRO}`), casosDe(LIBRO));
verificar("Lo de ADR-0620 se fue", correr(`begin;\n${RETIRADO}`), casosDe(RETIRADO));
verificar("Reglas del rango", correr(`${ESCENA}${REGLAS_DEL_RANGO}`), casosDe(REGLAS_DEL_RANGO));
verificar("Permisos de una colaboradora", correr(`${ESCENA}${PERMISOS_COLABORADORA}`), casosDe(PERMISOS_COLABORADORA));
verificar("Permisos de una terminal", correr(`${ESCENA}${PERMISOS_TERMINAL}`), casosDe(PERMISOS_TERMINAL));
verificar("Acceso directo", correr(`begin;\n${ACCESO_DIRECTO}`), casosDe(ACCESO_DIRECTO));
vigilarLasReglas();

console.log(`\n${casos - fallos} de ${casos} casos pasaron.`);
if (fallos > 0) process.exit(1);
