#!/usr/bin/env node
/**
 * Prueba de `20261024001000_ajuste_compara_lo_que_habia_al_contar.sql` (ADR-0494, /chaos 2026-10-23 semilla 494, CON-06).
 *
 * EL PROBLEMA QUE PRUEBA. La planilla de Existencias manda la diferencia entre lo contado y lo que leyó al abrirse. Si mientras se
 * cuenta alguien vende esa talla, la diferencia cae sobre un número viejo: con 6 leídas, 1 vendida y 5 contadas quedaban 4. Ahora
 * cada línea puede traer `esperado` (lo que había al contar) y la base, con el stock ya bloqueado, rechaza TODO el ajuste si algo
 * cambió (`ajuste_cambio_al_contar`, con lo de ahora en `detail`). Sin `esperado`, todo sigue como antes. Con controles: sin la
 * migración, el ajuste con un `esperado` viejo se guardaba.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK; la concurrencia, en dos sesiones que también terminan en ROLLBACK.
 *
 * USO: pnpm pruebas:ajuste-lo-que-habia   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261024001000_ajuste_compara_lo_que_habia_al_contar.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

function correrEnParalelo(sql) {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS, { stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (code) => resolve({ ok: code === 0, salida: salida.trim(), error, ms: Date.now() - inicio }));
    p.stdin.write(`${sql}\nrollback;\n`);
    p.stdin.end();
  });
}

/** Los bloques que inserta la migración: para deshacerlos en los controles («sin la migración»). */
const BLOQUES = [...MIGRACION.matchAll(/select pg_temp\.insertar_antes\(\s*'(retail\.[^']+)',\s*\$v\$([\s\S]*?)\$v\$, \d+,\s*\$v\$([\s\S]*?)\$v\$,/g)].map((m) => ({ firma: m[1], bloque: m[3] }));
if (BLOQUES.length !== 2) throw new Error(`esperaba 2 bloques en la migración y encontré ${BLOQUES.length}`);
const deshacer = BLOQUES.map((b) => `do $d$ begin execute replace(pg_get_functiondef('${b.firma}'::regprocedure), $n$${b.bloque}$n$, ''); end $d$;`).join("\n");

// La prenda sale del seed por su código (los ids cambian en cada base) y su stock lo pone la prueba, dentro de la transacción: 20 en
// el almacén de Lima y 20 en el piso, sobre lo que ya hubiera. `alm` y `total` son lo que hay al empezar.
function preparar({ sin = false } = {}) {
  return `
begin;
${MIGRACION}
${sin ? deshacer : ""}
set local request.jwt.claim.sub = '${FELIPE}';
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as sub_alm from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'almacen_tienda' limit 1 \\gset
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'piso_venta' limit 1 \\gset
select id as vm from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as vl from retail.variantes where sku = 'BLU-EMMA-NEG-L' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vm', :'lima', :'sub_alm', 'entrada', 20, 'colchón de prueba') returning id as m1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vm', :'lima', :'sub_piso', 'entrada', 20, 'colchón de prueba') returning id as m2 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vl', :'lima', :'sub_alm', 'entrada', 20, 'colchón de prueba') returning id as m3 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1, retail.fn_aplicar_movimiento(:'m2') as _a2, retail.fn_aplicar_movimiento(:'m3') as _a3 \\gset
select cantidad as alm from retail.stock where variante_id = :'vm' and sububicacion_id = :'sub_alm' \\gset
select cantidad as alm_l from retail.stock where variante_id = :'vl' and sububicacion_id = :'sub_alm' \\gset
select sum(cantidad) as total from retail.stock where variante_id = :'vm' and ubicacion_id = :'lima' \\gset
select count(*) as movs from retail.movimientos \\gset
`;
}

/** Una línea del ajuste en SQL (`vm`/`vl` son variables de psql). `esperado` es una expresión SQL o null (sin la clave). */
const linea = (v, cantidad, esperado = null) =>
  `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${cantidad}${esperado === null ? "" : `, 'esperado', ${esperado}`})`;
const ajuste = (lineas, { sub = ":'sub_alm'", motivo = "'conteo_fisico'", token = "gen_random_uuid()" } = {}) =>
  `retail.ajustar_inventario(:'lima', ${sub}, jsonb_build_array(${lineas.join(", ")}), ${motivo}, '[]'::jsonb, false, null, ${token})`;

/** Llama y, si la base rechaza, deja el rechazo a la vista (`hint|detail`) sin cortar la transacción: así se mira qué quedó escrito. */
const intentar = (llamada) => `
do $i$
declare v_hint text; v_detalle text;
begin
  perform ${llamada
    .replace(/:'(\w+)'/g, (_, n) => `current_setting('prueba.${n}')::uuid`)
    .replace(/(?<![:\w]):(\w+)/g, (_, n) => `current_setting('prueba.${n}')::integer`)};
  perform set_config('prueba.resultado', 'ok', true);
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_detalle = pg_exception_detail;
  perform set_config('prueba.resultado', coalesce(v_hint, '') || '|' || coalesce(v_detalle, ''), true);
end $i$;
select 'resultado|' || current_setting('prueba.resultado');`;
// Un bloque `do` no ve las variables de psql: se pasan por `set_config`, que sí lee adentro (los ids como uuid, las cifras como entero).
const pasar = (...nombres) => nombres.map((n) => `select set_config('prueba.${n}', :'${n}', true) as _${n} \\gset`).join("\n");
const leerResultado = (r) => r.salida.match(/^resultado\|(.*)$/m)?.[1] ?? "";

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 6).join("\n    ")}`);
  }
}
const rechaza = (r, hint) => !r.ok && r.error.includes(hint);
const ultima = (r) => r.salida.split("\n").filter(Boolean).pop() ?? "";

// 1. Lo que había es lo que hay: se guarda la diferencia, como siempre.
{
  const r = correr(`${preparar()}select ${ajuste([linea("vm", -2, ":alm")])} is not null as _ok \\gset
select 'queda|' || (select cantidad from retail.stock where variante_id = :'vm' and sububicacion_id = :'sub_alm') || '|' || (:alm - 2);`);
  const [, queda, esperado] = ultima(r).split("|");
  esperar("con lo que había igual a lo que hay, el conteo se guarda", r.ok && queda === esperado, r.error ?? r.salida);
}

// 2. Cambió mientras se contaba: se rechaza, se dice qué cambió y no se escribe nada.
{
  const r = correr(`${preparar()}${pasar("lima", "sub_alm", "vm", "alm")}
${intentar(ajuste([linea("vm", -1, ":alm + 1")]))}
select 'despues|' || (select cantidad from retail.stock where variante_id = :'vm' and sububicacion_id = :'sub_alm') || '|' || :alm
  || '|' || (select count(*) from retail.movimientos) || '|' || :movs;`);
  const res = leerResultado(r);
  const [, cantidad, alm, movs, movsAntes] = ultima(r).split("|");
  esperar("si el stock cambió mientras se contaba, se rechaza con ajuste_cambio_al_contar", res.startsWith("ajuste_cambio_al_contar|"), res || r.error);
  let detalle = null;
  try {
    detalle = JSON.parse(res.split("|").slice(1).join("|"));
  } catch {
    /* se informa abajo */
  }
  esperar(
    "el rechazo dice qué prenda cambió, lo que había al contar y lo de ahora (detail en JSON)",
    Array.isArray(detalle) && detalle.length === 1 && detalle[0].esperado === Number(alm) + 1 && detalle[0].ahora === Number(alm),
    res
  );
  esperar("y no se escribió nada: ni stock ni movimientos", cantidad === alm && movs === movsAntes, ultima(r));
}

// 3. Un lote con una talla que cambió y otra que no: no se guarda NINGUNA (nada a medias).
{
  const r = correr(`${preparar()}${pasar("lima", "sub_alm", "vm", "vl", "alm", "alm_l")}
${intentar(ajuste([linea("vm", -1, ":alm"), linea("vl", -1, ":alm_l + 3")]))}
select 'despues|' || (select count(*) from retail.movimientos) || '|' || :movs;`);
  const res = leerResultado(r);
  const [, movs, antes] = ultima(r).split("|");
  esperar("un lote con una talla cambiada no guarda ninguna de las dos", res.startsWith("ajuste_cambio_al_contar|") && movs === antes, `${res} · ${ultima(r)}`);
  esperar("y solo nombra la que cambió", res.includes('"esperado"') && (res.match(/variante_id/g) ?? []).length === 1, res);
}

// 4. Sin `esperado` (la ficha de Editar producto, «Ajustar inventario», el hallazgo de un conteo): igual que antes.
{
  const r = correr(`${preparar()}select ${ajuste([linea("vm", -1)])} is not null as _ok \\gset
select 'queda|' || (select cantidad from retail.stock where variante_id = :'vm' and sububicacion_id = :'sub_alm') || '|' || (:alm - 1);`);
  const [, queda, esperado] = ultima(r).split("|");
  esperar("una línea sin `esperado` se ajusta igual que antes", r.ok && queda === esperado, r.error ?? r.salida);
}
{
  const r = correr(`${preparar()}select ${ajuste([`jsonb_build_object('variante_id', :'vm', 'cantidad', -1, 'esperado', null)`])} is not null as _ok \\gset`);
  esperar("`esperado: null` cuenta como ausente", r.ok, r.error);
}

// 5. `esperado` mal armado.
for (const [que, valor] of [["negativo", "-1"], ["con decimales", "1.5"], ["con letras", "'abc'"], ["enorme", "10000000"]]) {
  const r = correr(`${preparar()}select ${ajuste([linea("vm", -1, valor)])};`);
  esperar(`un \`esperado\` ${que} se rechaza (ajuste_linea_invalida)`, rechaza(r, "ajuste_linea_invalida"), r.error ?? r.salida);
}

// 6. El reintento de un ajuste ya guardado devuelve lo guardado, aunque el stock ya no sea el `esperado` (lo movió ese ajuste).
{
  const t = "'c0ffee00-0000-4000-8000-000000049401'";
  const r = correr(`${preparar()}select ${ajuste([linea("vm", -2, ":alm")], { token: t })} is not null as _ok \\gset
select 'reintento|' || (${ajuste([linea("vm", -2, ":alm")], { token: t })} ->> 'ya_registrado')
  || '|' || (select cantidad from retail.stock where variante_id = :'vm' and sububicacion_id = :'sub_alm') || '|' || (:alm - 2);`);
  const [, ya, queda, esperado] = ultima(r).split("|");
  esperar("el reintento con la misma marca devuelve «ya registrado» y no descuenta dos veces", r.ok && ya === "true" && queda === esperado, r.error ?? r.salida);
}

// 7. Sin sububicación (una sede que no separa piso y almacén), lo que había es la suma de la sede.
{
  const r = correr(`${preparar()}${pasar("lima", "vm", "total")}
${intentar(ajuste([linea("vm", 1, ":total")], { sub: "null" }))}`);
  const res = leerResultado(r);
  esperar("sin sububicación, compara con la suma de la sede (no rechaza por cambio)", res !== "" && !res.startsWith("ajuste_cambio_al_contar"), res || r.error);
  const r2 = correr(`${preparar()}${pasar("lima", "vm", "alm")}
${intentar(ajuste([linea("vm", 1, ":alm")], { sub: "null" }))}`);
  esperar("y lo del almacén solo no es lo de la sede: se rechaza", leerResultado(r2).startsWith("ajuste_cambio_al_contar|"), leerResultado(r2) || r2.error);
}

// CONTROL: sin la migración, el conteo con un `esperado` viejo se guardaba (la prueba muerde).
{
  const r = correr(`${preparar({ sin: true })}select ${ajuste([linea("vm", -1, ":alm + 1")])} is not null as _ok \\gset
select 'control|' || (select cantidad from retail.stock where variante_id = :'vm' and sububicacion_id = :'sub_alm') || '|' || (:alm - 1);`);
  const [, queda, esperado] = ultima(r).split("|");
  esperar("CONTROL sin la migración: el conteo con lo que había viejo se guardaba", r.ok && queda === esperado, r.error ?? r.salida);
}

// 8. Concurrencia: mientras otra sesión tiene tomada la prenda (una venta, otro ajuste), la comparación ESPERA y mira lo que quedó.
//    Las dos sesiones usan una fila de stock que ya existe y terminan en ROLLBACK: nada se commitea en la base local compartida.
{
  const marca = correr(`select position('ajuste_cambio_al_contar' in pg_get_functiondef('retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid)'::regprocedure)) > 0;`);
  if (!marca.ok || !marca.salida.endsWith("t")) {
    esperar("la migración está aplicada en esta base (para la prueba de dos sesiones)", false, marca.error ?? "falta 20261024001000");
  } else {
    const fila = correr(`select s.variante_id || '|' || s.sububicacion_id || '|' || s.cantidad from retail.stock s
  join retail.sububicaciones b on b.id = s.sububicacion_id and b.tipo = 'almacen_tienda'
  join retail.ubicaciones u on u.id = s.ubicacion_id and u.nombre = 'Tienda Lima'
 where s.cantidad > 0 order by s.variante_id limit 1;`);
    const [variante, sub, cantidad] = ultima(fila).split("|");
    const llamar = (esperado) =>
      `select retail.ajustar_inventario((select id from retail.ubicaciones where nombre = 'Tienda Lima'), '${sub}',
  jsonb_build_array(jsonb_build_object('variante_id', '${variante}', 'cantidad', 1${esperado === null ? "" : `, 'esperado', ${esperado}`})),
  'conteo_fisico', '[]'::jsonb, false, null, gen_random_uuid())`;
    const a = correrEnParalelo(`begin;\nset local request.jwt.claim.sub = '${FELIPE}';\n${llamar(null)};\nselect pg_sleep(2);`);
    await new Promise((r) => setTimeout(r, 400));
    const b = correrEnParalelo(`begin;\nset local request.jwt.claim.sub = '${FELIPE}';\n${llamar(cantidad)};\nselect 'b|listo';`);
    const [ra, rb] = await Promise.all([a, b]);
    esperar("la otra sesión tomó la prenda y se deshizo", ra.ok, ra.error);
    esperar(
      "el conteo esperó a que la otra sesión soltara la prenda (la comparación va con el stock bloqueado)",
      rb.ok && rb.salida.includes("b|listo") && rb.ms >= 1400,
      `${rb.error} · ${rb.ms} ms`
    );
  }
}

console.log(`\n${total - fallas} de ${total} casos pasaron.`);
if (fallas > 0) process.exit(1);
