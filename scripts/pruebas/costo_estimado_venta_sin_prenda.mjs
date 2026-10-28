#!/usr/bin/env node
/**
 * Prueba del costo estimado de la venta sin prenda — ADR-0417, decisión 1 (`20261015233000_costo_estimado_venta_sin_prenda.sql`).
 *
 * QUÉ CUBRE
 *   · NACE CON COSTO: una prenda sin registrar (variante «Cargo especial», costo 0) recibe al instante el promedio de costo de las
 *     prendas de su categoría, y la línea queda marcada `costo_estimado`.
 *   · SIN CATEGORÍA CON COSTO: cae a la razón costo/precio de todo el catálogo sobre el precio cobrado.
 *   · LO QUE YA EXISTÍA se rellena al pegar la migración, y pegarla dos veces no cambia ninguna función.
 *   · AL REGULARIZAR manda el costo real: cambiar la variante apaga la marca (lo que hace `regularizar_prenda`).
 *   · EL DIARIO LO TOMA SOLO: `fn_asientos` asienta 691 | 201 por el estimado sin que ninguna regla cambie.
 *   · `fn_costo_estimado_resumen`: cuenta lo estimado contra el total; sin el módulo Reportes financieros, `insufficient_privilege`;
 *     `anon` no la puede llamar.
 *
 * CÓMO. Como `finanzas_arranque.mjs`: cada escena corre dentro de UNA transacción con ROLLBACK; fechas de 2019 para no cruzarse
 * con datos reales; sesión simulada con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:costo-estimado-venta-sin-prenda
 *   node scripts/pruebas/costo_estimado_venta_sin_prenda.mjs --contenedor <otro>   → contra otra base local (una pila propia)
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
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo, sin Reportes financieros
const CENTINELA = "22222222-2222-4222-8222-222222222222";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261015233000_costo_estimado_venta_sin_prenda.sql"), "utf8");

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
/** Cada verificación sale como una línea `caso|valor`. Se exige que estén TODAS y con el valor esperado. */
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

// La semilla común: una sede, una talla y un color del seed, la categoría con más prendas con costo (y su promedio) y una variante
// real con costo para «regularizar». Todo con \gset, dentro de la misma transacción.
const SEMILLA = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as talla from retail.tallas limit 1 \\gset
select codigo as color from retail.colores limit 1 \\gset
select p.categoria_id as cat, round(avg(v.costo), 2) as esperado
  from retail.variantes v join retail.productos p on p.id = v.producto_id
 where v.costo > 0 and v.precio > 0 and v.id <> '${CENTINELA}'
 group by 1 order by count(*) desc limit 1 \\gset
select round((select sum(costo) / sum(precio) from retail.variantes where costo > 0 and precio > 0 and id <> '${CENTINELA}') * 200, 2) as esperado_razon \\gset
select v.id as real_var, v.costo as real_costo from retail.variantes v where v.costo > 0 and v.id <> '${CENTINELA}' limit 1 \\gset
`;
const ventaSinPrenda = (nombre, fecha, precio, cat) => `
insert into retail.ventas (ubicacion_id, created_at) values (:'ubic', '${fecha}') returning id as venta_${nombre} \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (:'venta_${nombre}', '${CENTINELA}', 1, ${precio}, 0, 0) returning id as item_${nombre} \\gset
insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_por)
  values (:'item_${nombre}', :'ubic', 'Blusa de prueba', ${cat}, :'talla', :'color', ${precio}, null);
`;

// ---------- Escena 1: relleno de lo existente, nace con costo, sin categoría con costo, regularizar, diario, resumen ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${SEMILLA}
-- A nace ANTES de la migración (como las 755 de producción): costo 0 y sin marca.
${ventaSinPrenda("a", "2019-07-10 15:00-05", 100, ":'cat'")}
${MIGRACION}
select 'relleno_costo|' || (costo_unitario = :'esperado'::numeric) from retail.venta_items where id = :'item_a';
select 'relleno_marca|' || costo_estimado from retail.venta_items where id = :'item_a';

-- B nace DESPUÉS: el disparador la sella al instante.
${ventaSinPrenda("b", "2019-07-11 15:00-05", 100, ":'cat'")}
select 'nace_costo|' || (costo_unitario = :'esperado'::numeric) from retail.venta_items where id = :'item_b';
select 'nace_marca|' || costo_estimado from retail.venta_items where id = :'item_b';

-- C: categoría sin ninguna prenda con costo → razón del catálogo sobre el precio cobrado (200).
insert into retail.categorias (nombre) values ('Prueba sin costo 2019') returning id as cat0 \\gset
${ventaSinPrenda("c", "2019-07-12 15:00-05", 200, ":'cat0'")}
select 'razon_costo|' || (costo_unitario = :'esperado_razon'::numeric) from retail.venta_items where id = :'item_c';

-- Una prenda real nunca recibe estimado (el disparador solo mira al centinela).
insert into retail.ventas (ubicacion_id, created_at) values (:'ubic', '2019-07-13 15:00-05') returning id as venta_d \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario)
  values (:'venta_d', :'real_var', 1, 100, 0, :'real_costo') returning id as item_d \\gset
select 'real_sin_marca|' || (not costo_estimado) from retail.venta_items where id = :'item_d';

-- Regularizar B: lo que hace regularizar_prenda (cambia la variante y pone el costo real) apaga la marca.
update retail.venta_items set variante_id = :'real_var', costo_unitario = :'real_costo' where id = :'item_b';
select 'regularizada_costo|' || (costo_unitario = :'real_costo'::numeric) from retail.venta_items where id = :'item_b';
select 'regularizada_marca|' || (not costo_estimado) from retail.venta_items where id = :'item_b';

-- El diario toma el estimado solo: 691 | 201 por A, sin tocar ninguna regla.
select 'diario_691|' || (sum(debe) = :'esperado'::numeric) from retail.fn_asientos('2019-07-10', '2019-07-10', null) where regla = 'venta' and cuenta = '691';
select 'diario_201|' || (sum(haber) = :'esperado'::numeric) from retail.fn_asientos('2019-07-10', '2019-07-10', null) where regla = 'venta' and cuenta = '201';

-- El resumen: A y C son estimadas (B ya es real, D es real), ninguna sigue en 0, 4 unidades en total.
select 'resumen_estimadas|' || unidades_estimadas || ',' || (costo_estimado = :'esperado'::numeric + :'esperado_razon'::numeric)
  from retail.fn_costo_estimado_resumen('2019-07-01', '2019-07-31', null);
select 'resumen_sin_costo|' || unidades_sin_costo from retail.fn_costo_estimado_resumen('2019-07-01', '2019-07-31', null);
select 'resumen_total|' || unidades_total || ',' || (venta_total = 500) from retail.fn_costo_estimado_resumen('2019-07-01', '2019-07-31', null);
select 'resumen_sede|' || unidades_total from retail.fn_costo_estimado_resumen('2019-07-01', '2019-07-31', :'ubic');
`);
  verificar("costo estimado", r, {
    relleno_costo: "true", relleno_marca: "true",
    nace_costo: "true", nace_marca: "true",
    razon_costo: "true",
    real_sin_marca: "true",
    regularizada_costo: "true", regularizada_marca: "true",
    diario_691: "true", diario_201: "true",
    resumen_estimadas: "2,true", resumen_sin_costo: "0", resumen_total: "4,true", resumen_sede: "4",
  });
}

// ---------- Escena 2: permisos ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACION}
select 'anon_no_llama|' || (not has_function_privilege('anon', 'retail.fn_costo_estimado_resumen(date, date, uuid)', 'execute'));
select 'authenticated_llama|' || has_function_privilege('authenticated', 'retail.fn_costo_estimado_resumen(date, date, uuid)', 'execute');
select 'anon_no_estima|' || (not has_function_privilege('anon', 'retail.fn_costo_estimado_prenda(uuid, numeric)', 'execute'));
${cambiaA(MICAELA)}
do $$
begin
  perform * from retail.fn_costo_estimado_resumen('2019-07-01', '2019-07-31', null);
  raise exception 'sin el módulo tendría que fallar';
exception when insufficient_privilege then
  null;
end $$;
select 'sin_modulo_falla|ok';
`);
  verificar("permisos", r, { anon_no_llama: "true", authenticated_llama: "true", anon_no_estima: "true", sin_modulo_falla: "ok" });
}

// ---------- Escena 3: pegar dos veces no cambia nada ----------
{
  const r = correr(`
begin;
${cambiaA(FELIPE)}
${MIGRACION}
select md5(string_agg(pg_get_functiondef(p.oid), '' order by p.proname)) as huella_1
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_costo_estimado_prenda', 'trg_prenda_sin_registrar_costo_estimado', 'trg_venta_item_costo_real', 'fn_costo_estimado_resumen') \\gset
${MIGRACION}
select 'misma_huella|' || (md5(string_agg(pg_get_functiondef(p.oid), '' order by p.proname)) = :'huella_1')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname in ('fn_costo_estimado_prenda', 'trg_prenda_sin_registrar_costo_estimado', 'trg_venta_item_costo_real', 'fn_costo_estimado_resumen');
select 'dos_disparadores|' || count(*) from pg_trigger where tgname in ('prendas_por_regularizar_costo_estimado', 'venta_items_costo_real');
`);
  verificar("idempotente", r, { misma_huella: "true", dos_disparadores: "2" });
}

console.log(`\n${casos - fallos} de ${casos} · contenedor: ${CONTENEDOR}`);
process.exit(fallos ? 1 : 0);
