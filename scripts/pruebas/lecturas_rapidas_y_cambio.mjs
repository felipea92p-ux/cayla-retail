#!/usr/bin/env node
/**
 * Prueba de ADR-0194 — lecturas rápidas con un año de datos y cambio con candados en orden
 * (`20260924180000_varios_usuarios_lecturas_rapidas_y_cambio_en_orden.sql`).
 *
 * QUÉ CUBRE
 *   · La forma: una sola versión de fn_ventas_del_dia, fn_productos y registrar_cambio; registrar_cambio pre-bloquea en
 *     orden; ninguna política evalúa auth.* fila por fila; los dos índices nuevos existen.
 *   · fn_ventas_del_dia: una integrante ve SOLO las ventas de hoy de su tienda (ni ayer, ni otra tienda); el líder, las
 *     de hoy de todas o de la que pida; y la lectura usa un índice (no recorre la historia).
 *   · fn_productos: la página trae exactamente `por_pagina` productos, dos páginas no se pisan, `total_productos` es el
 *     mismo en todas las páginas y coincide con el recuento sin paginar, el stock total es la suma del stock real, y el
 *     filtro «reponer» solo devuelve lo que cumple su regla.
 *   · El bloqueo mutuo cambio × venta: una sesión toma el stock de las dos prendas EN ORDEN (como registrar_venta) con
 *     una pausa en medio; la otra hace registrar_cambio de la prenda mayor por la menor. Antes de ADR-0194 Postgres
 *     cancelaba una de las dos (40P01); ahora el cambio espera y ambas terminan.
 *
 * DÓNDE CORRE. Necesita volumen y colaboradoras con asistencia: la base `cayla_carga` que arma `pnpm carga:preparar`
 * (igual a producción + un año sintético). Otra base con `BASE=… pnpm pruebas:lecturas-rapidas-y-cambio`.
 * Todo en transacciones con ROLLBACK: no deja nada escrito.
 */

import { execFileSync, spawn } from "node:child_process";

const CONTENEDOR = "supabase_db_cayla-retail";
const BASE = process.env.BASE ?? "cayla_carga";
const LIDER = "22222222-2222-4222-8222-000000000001";

const args = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function psqlAsync(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr, ms: Date.now() - inicio }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}

let total = 0;
let fallos = 0;
function esperar(nombre, ok, detalle = "") {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 1500).replace(/\n/g, "\n    ")}`);
  }
}

function caso(nombre, sql, esperado) {
  try {
    const salida = psql(`begin;\n${sql}\nrollback;\n`).trim().split("\n").pop();
    esperar(nombre, salida === esperado, `esperaba «${esperado}», salió «${salida}»`);
  } catch (e) {
    esperar(nombre, false, `${e.stderr ?? ""}${e.message ?? ""}`);
  }
}

// Una integrante sintética (la 3) y su tienda.
const COMO_INTEGRANTE = `select set_config('request.jwt.claim.sub', auth_user_id::text, true),
  set_config('request.headers', json_build_object('x-responsable', persona_id, 'x-ubicacion', ubicacion_id)::text, true),
  set_config('carga.ub', ubicacion_id::text, true) from public._carga_actores where i = 3;
set local role authenticated;`;
const COMO_LIDER = `select set_config('request.jwt.claim.sub', '${LIDER}', true);`;

// ---------------------------------------------------------------------------
// 0. ¿Hay volumen?
// ---------------------------------------------------------------------------
try {
  const n = psql(`select count(*) from public._carga_actores;`).trim();
  if (n !== "60") throw new Error(`_carga_actores tiene ${n} filas`);
} catch (e) {
  console.log(`✗ La base «${BASE}» no tiene el volumen de carga (${e.message.split("\n")[0]}). Corre antes: pnpm carga:preparar`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. La forma
// ---------------------------------------------------------------------------
caso(
  "fn_ventas_del_dia, fn_productos y registrar_cambio tienen UNA sola versión",
  `select string_agg(proname || '=' || n, ',' order by proname) from (select proname, count(*) n from pg_proc
     where pronamespace = 'retail'::regnamespace and proname in ('fn_ventas_del_dia','fn_productos','registrar_cambio') group by 1) x;`,
  "fn_productos=1,fn_ventas_del_dia=1,registrar_cambio=1"
);
caso(
  "registrar_cambio pre-bloquea las dos prendas en orden, después de leer la caja",
  `select pg_get_functiondef('retail.registrar_cambio'::regproc) ~ 'for share;\\s*\\n\\s*-- ADR-0194[^\\n]*\\n[^\\n]*\\n\\s*perform fn_bloquear_en_orden\\(p_ubicacion_id, array\\[v_item.variante_id, p_variante_nueva_id\\]\\);';`,
  "t"
);
caso(
  "ninguna política de retail evalúa auth.role()/uid()/jwt() fila por fila",
  `select count(*) from pg_policies where schemaname = 'retail'
     and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(^|[^.a-z_])(role|uid|jwt)\\(\\)'
     and (coalesce(qual,'') || coalesce(with_check,'')) !~ 'SELECT (auth\\.)?(role|uid|jwt)\\(\\) AS';`,
  "0"
);
caso(
  "fn_productos planifica SIEMPRE con los filtros reales (sin plan genérico desde la 6ª llamada)",
  `select 'plan_cache_mode=force_custom_plan' = any(proconfig) from pg_proc where oid = 'retail.fn_productos'::regproc;`,
  "t"
);
caso(
  "existen los índices de ventas por prenda y por clienta",
  `select count(*) from pg_indexes where schemaname = 'retail' and indexname in ('venta_items_variante_idx', 'ventas_cliente_idx');`,
  "2"
);

// ---------------------------------------------------------------------------
// 2. fn_ventas_del_dia
// ---------------------------------------------------------------------------
// Una venta de hoy en la tienda de la integrante y otra en OTRA tienda (con la integrante de allá), dentro de la
// transacción: la función tiene que ver la suya y no la otra, y no traer nada de ayer.
const DOS_VENTAS_HOY = `
select set_config('request.jwt.claim.sub', auth_user_id::text, true),
  set_config('request.headers', json_build_object('x-responsable', persona_id, 'x-ubicacion', ubicacion_id)::text, true)
  from public._carga_actores where i = 50;
select set_config('carga.otra', retail.registrar_venta(a.ubicacion_id,
  jsonb_build_array(jsonb_build_object('variante_id', v.id, 'cantidad', 1, 'precio_unitario', v.precio)),
  jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', v.precio)))::text, true)
  from public._carga_actores a, public._carga_variantes v where a.i = 50 and v.i = 11;
${COMO_INTEGRANTE}
select set_config('carga.mia', retail.registrar_venta(current_setting('carga.ub')::uuid,
  jsonb_build_array(jsonb_build_object('variante_id', v.id, 'cantidad', 1, 'precio_unitario', v.precio)),
  jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', v.precio)))::text, true)
  from public._carga_variantes v where v.i = 12;
`;
caso(
  "integrante: ve su venta de hoy y no la de otra tienda",
  `${DOS_VENTAS_HOY}
select bool_or(venta_id::text = current_setting('carga.mia')) and not bool_or(venta_id::text = current_setting('carga.otra'))
  from retail.fn_ventas_del_dia(null);`,
  "t"
);
caso(
  "integrante: todo lo que ve es de hoy (Lima) y de su tienda",
  `${DOS_VENTAS_HOY}
select bool_and((v.created_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
                and v.ubicacion_id = current_setting('carga.ub')::uuid)
  from retail.fn_ventas_del_dia(null) f join retail.ventas v on v.id = f.venta_id;`,
  "t"
);
caso(
  "líder: sin tienda ve las dos; pidiendo la de la integrante, solo esa",
  `${DOS_VENTAS_HOY}
reset role;
${COMO_LIDER}
select (select count(*) from retail.fn_ventas_del_dia(null) where venta_id::text in (current_setting('carga.mia'), current_setting('carga.otra')))
    || '/' ||
       (select count(*) from retail.fn_ventas_del_dia(current_setting('carga.ub')::uuid) where venta_id::text in (current_setting('carga.mia'), current_setting('carga.otra')));`,
  "2/1"
);
caso(
  "fn_ventas_del_dia filtra «hoy» como rango (usa índice) y pregunta quién es UNA vez (CTE materializada)",
  `select d ~ 'with quien as materialized' and d ~ 'v\\.created_at >= q\\.ini and v\\.created_at < q\\.ini \\+ interval ''1 day'''
          and d !~ '\\(v\\.created_at at time zone ''America/Lima''\\)::date ='
   from (select pg_get_functiondef('retail.fn_ventas_del_dia'::regproc) as d) x;`,
  "t"
);
caso(
  "con ese filtro, la lectura de ventas de hoy va por índice (no recorre la historia)",
  `create function pg_temp.plan() returns setof text language plpgsql as $f$
begin
  return query execute $q$explain select v.id from retail.ventas v
    where v.created_at >= ((now() at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima')
      and v.created_at < ((now() at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima') + interval '1 day'$q$;
end $f$;
select bool_or(l ~ 'Index|Bitmap') and not bool_or(l ~ 'Seq Scan on ventas') from pg_temp.plan() l;`,
  "t"
);

// ---------------------------------------------------------------------------
// 3. fn_productos
// ---------------------------------------------------------------------------
caso(
  "la página 1 trae 24 productos y el total coincide con el recuento sin paginar",
  `${COMO_INTEGRANTE}
select (select count(distinct producto_id) from retail.fn_productos(null,null,null,null,null,null,null,1,24,null,null,null))
  || '/' || ((select max(total_productos) from retail.fn_productos(null,null,null,null,null,null,null,1,24,null,null,null))
             = (select count(*) from retail.productos p where p.id <> '11111111-1111-4111-8111-111111111111'
                  and exists (select 1 from retail.variantes v where v.producto_id = p.id)));`,
  "24/true"
);
caso(
  "páginas 1 y 2 no se pisan y dicen el mismo total",
  `${COMO_INTEGRANTE}
with p1 as (select distinct producto_id, total_productos from retail.fn_productos(null,null,null,null,null,null,null,1,24,null,null,null)),
     p2 as (select distinct producto_id, total_productos from retail.fn_productos(null,null,null,null,null,null,null,2,24,null,null,null))
select (select count(*) from p1 join p2 using (producto_id)) || '/' || ((select max(total_productos) from p1) = (select max(total_productos) from p2));`,
  "0/true"
);
// Sin `set role`: la integrante solo VE el stock de su tienda (RLS), pero la cifra de la función es de todas las sedes.
caso(
  "el stock total de cada producto es la suma de su stock en todas las sedes",
  `select set_config('request.jwt.claim.sub', auth_user_id::text, true) from public._carga_actores where i = 3;
select bool_and(f.stock_total = coalesce((select sum(s.cantidad) from retail.stock s join retail.variantes v on v.id = s.variante_id
                                           where v.producto_id = f.producto_id), 0))
  from (select distinct producto_id, stock_total from retail.fn_productos(null,null,null,null,null,null,null,3,24,'precio_desc',null,null)) f;`,
  "t"
);
caso(
  "orden por precio ascendente: la página sigue el precio mínimo de cada producto",
  `${COMO_INTEGRANTE}
with f as (select producto_id, min(precio) as pmin, min(ord) as ord from (
  select producto_id, precio, row_number() over () as ord from retail.fn_productos(null,null,null,null,null,null,null,2,24,'precio_asc',null,null)) x group by producto_id)
select bool_and(pmin >= coalesce(prev, 0)) from (select pmin, lag(pmin) over (order by ord) prev from f) y;`,
  "t"
);
caso(
  "«reponer» solo devuelve productos activos con demanda y stock en o bajo su punto de reorden",
  `${COMO_INTEGRANTE}
select coalesce(bool_and(estado = 'activo' and demanda_diaria > 0 and stock_total <= punto_reorden and reponer_de_proveedor), true)
  from retail.fn_productos(null,null,null,null,null,null,'reponer',1,50,null,null,null);`,
  "t"
);

// ---------------------------------------------------------------------------
// 4. Cambio × venta a la vez: sin bloqueo mutuo
// ---------------------------------------------------------------------------
// Una línea de venta YA guardada (del volumen) en la tienda de la integrante 3: su prenda es «la vieja». La nueva es
// otra prenda de la misma tienda con id MENOR, para que el orden por id (el de registrar_venta) la tome primero.
async function cambioContraVenta() {
  const datos = psql(`
with mia as (select ubicacion_id from public._carga_actores where i = 3)
select vi.id, vi.variante_id, (select v2.id from retail.variantes v2
         join retail.stock s on s.variante_id = v2.id and s.ubicacion_id = (select ubicacion_id from mia) and s.cantidad > 10
         where v2.id < vi.variante_id and v2.activo order by v2.id desc limit 1), (select ubicacion_id from mia)
from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id
where v.ubicacion_id = (select ubicacion_id from mia) and v.estado = 'completada' and vi.cantidad = 1
  and not exists (select 1 from retail.cambios c where c.venta_item_id = vi.id)
  and not exists (select 1 from retail.devolucion_items di where di.venta_item_id = vi.id)
  and v.created_at < now() - interval '2 days'
order by v.created_at desc limit 1;`).trim();
  const [item, vieja, nueva, ubicacion] = datos.split("|");
  if (!item || !nueva) {
    esperar("cambio × venta: hay una línea de venta y una prenda de id menor para probar", false, datos);
    return;
  }

  // Sesión «venta»: toma la prenda NUEVA (id menor) primero, espera, y después pide la VIEJA — el orden de registrar_venta.
  const venta = psqlAsync(`
begin;
set local lock_timeout = '15s';
select 1 from retail.stock where ubicacion_id = '${ubicacion}' and variante_id = '${nueva}' for update;
select pg_sleep(1.5);
select 1 from retail.stock where ubicacion_id = '${ubicacion}' and variante_id = '${vieja}' for update;
select pg_sleep(0.5);
rollback;
select 'venta-ok';`);

  // Sesión «cambio»: arranca a mitad de la pausa y cambia la vieja por la nueva.
  await new Promise((r) => setTimeout(r, 700));
  const cambio = psqlAsync(`
begin;
set local lock_timeout = '15s';
${COMO_INTEGRANTE}
select retail.registrar_cambio('${item}', '${ubicacion}', '${nueva}', 1, 'yape', gen_random_uuid(), 'otro_color', 'vendible') is not null;
rollback;
select 'cambio-ok';`);

  const [rv, rc] = await Promise.all([venta, cambio]);
  const bloqueoMutuo = /deadlock|40P01|bloqueo mutuo/i.test(rv.stderr + rc.stderr);
  esperar(
    "cambio × venta de las mismas dos prendas: ninguna se cancela por bloqueo mutuo",
    !bloqueoMutuo && rv.stdout.includes("venta-ok") && rc.stdout.includes("cambio-ok"),
    `venta: ${rv.stderr || rv.stdout} | cambio: ${rc.stderr || rc.stdout}`
  );
  esperar(
    "el cambio ESPERÓ a la venta (tomó sus candados después), en vez de adelantarse con la prenda vieja",
    rc.ms >= 1000,
    `el cambio tardó ${rc.ms} ms`
  );
}

await cambioContraVenta();

console.log(`\n${total - fallos}/${total} pruebas en verde (base: ${BASE}).`);
process.exit(fallos === 0 ? 0 : 1);
