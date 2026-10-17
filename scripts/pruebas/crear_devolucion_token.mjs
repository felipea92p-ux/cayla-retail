#!/usr/bin/env node
/**
 * `retail.crear_devolucion` con marca (`p_token`) — migración `20261015162000_crear_devolucion_con_token.sql`.
 *
 * EL PROBLEMA. Chrome reenvía un POST por su cuenta si la conexión se corta antes de la respuesta y ya estaba usada
 * (`docs/investigacion/2026-10-15-reintento-de-post-cortado.md`). Con una línea vendida de 2 o más unidades, ese reenvío
 * creaba OTRA devolución pendiente; aprobadas las dos, la prenda reingresaba dos veces, el reembolso salía dos veces y se
 * iban dos notas de crédito a SUNAT. Y si solo se cortaba el primer envío, la pantalla decía «listo».
 *
 * QUÉ VERIFICA (cada caso en su propia transacción, que termina en ROLLBACK; la de concurrencia también):
 *   1. El mismo token dos veces (el reenvío) devuelve la MISMA devolución: una sola, con una sola unidad.
 *   2. El mismo token con otro contenido se rechaza (`token_reusado`) y no escribe nada.
 *   3. Un token nuevo con el mismo contenido sí crea otra devolución (dos pedidos de verdad, si quedan unidades).
 *   4. Sin token (una pantalla vieja) sigue funcionando como antes.
 *   5. Una sola versión de la función (sin sobrecarga) y los mismos permisos: `authenticated` sí, `anon` no.
 *   6. El reenvío que llega MIENTRAS la primera todavía guarda la espera (no pasa de largo): dos sesiones de psql, la
 *      primera guarda y se queda quieta sin confirmar; la segunda, con el mismo token y `lock_timeout` corto, se corta
 *      esperando el intento de la primera (`fn_intento_con_huella`).
 *   7. La migración se pega dos veces sin romper nada (re-pegable).
 *
 * Mismo mecanismo que `crear_devolucion_motivo.mjs` (`docker exec … psql` + `request.jwt.claim.sub` + ROLLBACK) y, para
 * el caso 6, que `concurrencia_linea_de_venta.mjs`.
 *
 * USO
 *   pnpm pruebas:crear-devolucion-token    → necesita el stack local levantado y la migración aplicada
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = join(RAIZ, "supabase", "migrations", "20261015162000_crear_devolucion_con_token.sql");

const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function psqlEnParalelo(sql) {
  return new Promise((resolver) => {
    const p = spawn("docker", ARGS);
    let salida = "";
    let error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (codigo) => resolver({ codigo, salida: salida.trim(), error }));
    p.stdin.end(sql);
  });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Una venta de DOS unidades de BLU-EMMA-NEG-M en una sola línea, en Tienda Lima, con caja fresca: deja `:venta_id`,
 * `:venta_item` y `:ubic`, y los copia a `prueba.*` para los bloques `do` (donde psql no reemplaza variables).
 */
const FIXTURE = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';

select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');

select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba automatizada') as caja_id \\gset

select id as v_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select precio as precio_viejo from retail.variantes where id = :'v_old' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset

insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_old', :'ubic', :'sub_piso', 'entrada', 10, 'colchón de prueba') returning id as mov_old \\gset
select retail.fn_aplicar_movimiento(:'mov_old') as _d1 \\gset

select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 2, 'precio_unitario', :'precio_viejo', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', 2 * :'precio_viejo'::numeric)),
  null, gen_random_uuid()) as venta_id \\gset

select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset
select set_config('prueba.venta', :'venta_id', true) as _p1, set_config('prueba.item', :'venta_item', true) as _p2,
       set_config('prueba.ubic', :'ubic', true) as _p3 \\gset
`;

const UNA = `jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'cantidad', 1, 'condicion', 'vendible'))`;
const TOKEN = "7b1f6a52-0d1e-4c55-9a7e-2f0c3d4b5a61";
const OTRO_TOKEN = "0c9e8d7f-6a5b-4c3d-8e2f-1a0b9c8d7e6f";

/** Cuántas devoluciones tiene la venta y cuántas unidades suman, en una línea «n|unidades». */
const CUENTA = `select (select count(*) from retail.devoluciones where venta_id = :'venta_id') || '|' ||
  (select coalesce(sum(di.cantidad), 0) from retail.devolucion_items di join retail.devoluciones d on d.id = di.devolucion_id
    where d.venta_id = :'venta_id');`;

let fallos = 0;
let total = 0;

function esperar(nombre, ok, resultado) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 500)}`);
  }
}

async function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  // ---- 1. el reenvío: mismo token, mismo contenido → la misma devolución ----
  const reenvio = correr(`${FIXTURE}
select retail.crear_devolucion(:'venta_id', :'ubic', ${UNA}, 'no le quedó', 'talla', '${TOKEN}') as d1 \\gset
select retail.crear_devolucion(:'venta_id', :'ubic', ${UNA}, 'no le quedó', 'talla', '${TOKEN}') as d2 \\gset
select (:'d1' = :'d2')::text;
${CUENTA}
rollback;
`);
  const [mismaId, cuentaReenvio] = reenvio.ok ? reenvio.salida.split("\n").slice(-2) : [];
  esperar(
    "el mismo token dos veces (el reenvío de Chrome) devuelve la misma devolución: una sola, con una unidad",
    reenvio.ok && mismaId === "true" && cuentaReenvio === "1|1",
    reenvio,
  );

  // ---- 2. mismo token, otro contenido → token_reusado, sin escribir ----
  const otroContenido = correr(`${FIXTURE}
select retail.crear_devolucion(:'venta_id', :'ubic', ${UNA}, 'no le quedó', 'talla', '${TOKEN}') as d1 \\gset
create temp table _r (x text) on commit drop;
do $$
declare v_hint text; v_msg text;
begin
  perform retail.crear_devolucion(current_setting('prueba.venta')::uuid, current_setting('prueba.ubic')::uuid,
    jsonb_build_array(jsonb_build_object('venta_item_id', current_setting('prueba.item'), 'cantidad', 1, 'condicion', 'vendible')),
    'no le quedó', 'calce', '${TOKEN}'::uuid);
  insert into _r values ('SIN_ERROR');
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
  insert into _r values ('ERROR|' || coalesce(v_hint, '') || '|' || v_msg);
end $$;
select x from _r;
${CUENTA}
rollback;
`);
  const [veredicto, cuentaOtro] = otroContenido.ok ? otroContenido.salida.split("\n").slice(-2) : [];
  esperar(
    "el mismo token con otro contenido se rechaza (token_reusado) y no escribe una segunda devolución",
    otroContenido.ok && veredicto?.startsWith("ERROR|token_reusado|") && cuentaOtro === "1|1",
    otroContenido,
  );

  // ---- 3. token nuevo, mismo contenido → otra devolución (quedan unidades) ----
  const dosPedidos = correr(`${FIXTURE}
select retail.crear_devolucion(:'venta_id', :'ubic', ${UNA}, 'no le quedó', 'talla', '${TOKEN}') as d1 \\gset
select retail.crear_devolucion(:'venta_id', :'ubic', ${UNA}, 'no le quedó', 'talla', '${OTRO_TOKEN}') as d2 \\gset
${CUENTA}
rollback;
`);
  esperar(
    "un token nuevo con el mismo contenido sí crea otra devolución (dos pedidos de verdad con unidades libres)",
    dosPedidos.ok && dosPedidos.salida.split("\n").at(-1) === "2|2",
    dosPedidos,
  );

  // ---- 4. sin token: como una pantalla vieja ----
  const sinToken = correr(`${FIXTURE}
select retail.crear_devolucion(:'venta_id', :'ubic', ${UNA}, 'no le quedó', 'talla') as d1 \\gset
select estado from retail.devoluciones where id = :'d1';
rollback;
`);
  esperar("sin token (una pantalla vieja) sigue funcionando como antes", sinToken.ok && sinToken.salida.split("\n").at(-1) === "pendiente", sinToken);

  // ---- 5. una sola versión y los mismos permisos ----
  const firma = correr(`
select count(*) from pg_proc where proname = 'crear_devolucion' and pronamespace = 'retail'::regnamespace;
select has_function_privilege('authenticated', 'retail.crear_devolucion(uuid, uuid, jsonb, text, text, uuid)', 'execute')::text
  || '|' || has_function_privilege('anon', 'retail.crear_devolucion(uuid, uuid, jsonb, text, text, uuid)', 'execute')::text;
`);
  esperar(
    "una sola versión de crear_devolucion (sin sobrecarga): authenticated la ejecuta, anon no",
    firma.ok && firma.salida === "1\ntrue|false",
    firma,
  );

  // ---- 6. el reenvío que llega mientras la primera todavía guarda, espera ----
  const primera = psqlEnParalelo(`${FIXTURE}
select retail.crear_devolucion(:'venta_id', :'ubic', ${UNA}, 'no le quedó', 'talla', '${TOKEN}') as d1 \\gset
select pg_sleep(4);
rollback;
`);
  await dormir(1500);
  // La segunda no ve la venta de la primera (no está confirmada), pero no llega a mirarla: se queda esperando el intento.
  const segunda = await psqlEnParalelo(`
begin;
set local request.jwt.claim.sub = '${FELIPE}';
set local lock_timeout = '1500ms';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.crear_devolucion(gen_random_uuid(), :'ubic',
  jsonb_build_array(jsonb_build_object('venta_item_id', gen_random_uuid(), 'cantidad', 1, 'condicion', 'vendible')),
  'no le quedó', 'talla', '${TOKEN}');
rollback;
`);
  const resultadoPrimera = await primera;
  esperar(
    "un reenvío simultáneo con el mismo token espera a que la primera termine (se corta por lock_timeout esperando el intento)",
    resultadoPrimera.codigo === 0 && segunda.codigo !== 0 && /lock timeout/i.test(segunda.error) && /fn_intento_con_huella|intentos_con_token/.test(segunda.error),
    { primera: resultadoPrimera.error.slice(0, 200), segunda: segunda.error.slice(0, 300) },
  );

  // ---- 7. la migración se pega dos veces ----
  const sql = readFileSync(MIGRACION, "utf8");
  const repegar = correr(`begin;
${sql}
${sql}
select count(*) from pg_proc where proname = 'crear_devolucion' and pronamespace = 'retail'::regnamespace;
rollback;
`);
  esperar("la migración se pega dos veces sin duplicar nada", repegar.ok && repegar.salida.split("\n").at(-1) === "1", repegar);

  console.log(`\n${total - fallos}/${total} pasaron.`);
  if (fallos) process.exit(1);
}

main();
