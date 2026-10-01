#!/usr/bin/env node
/**
 * Prueba de ida y vuelta de `estado.mjs`: ¿de verdad se puede deshacer lo que un caso escribe?
 *
 * CÓMO. A diferencia de las pruebas de `scripts/pruebas/`, esta CONFIRMA los cambios (COMMIT) en el Postgres local, porque
 * lo que se prueba es justamente volver atrás lo que un caso hecho desde el navegador deja guardado. Usa una venta real
 * (caja, stock, movimientos, actividad: el mismo escenario de `actividad.mjs`), no un dato inventado. Deja la base como la
 * encontró aunque falle a mitad.
 *
 * QUÉ COMPRUEBA
 *   1. Guardar y comparar sin tocar nada: idéntico.
 *   2. Una venta confirmada cambia tablas, y `comparar` las nombra (incluido el libro inmutable `movimientos`).
 *   3. Sin `--si`, restaurar solo muestra: no cambia nada.
 *   4. Con `--si`, la base vuelve EXACTAMENTE a la foto (mismas huellas, no solo mismo número de filas).
 *   5. Las guardas de `movimientos` siguen siendo `ENABLE ALWAYS` y siguen bloqueando DELETE y TRUNCATE.
 *   6. Una restauración que falla a la mitad se REVIERTE por completo: la base queda como estaba antes de intentarla.
 *   7. Una foto de otra migración se rechaza.
 *
 * USO   node scripts/flujo-de-negocio/estado.prueba.mjs      (necesita el Postgres local con las migraciones de main)
 */

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const ESTADO = join(RAIZ, "scripts/flujo-de-negocio/estado.mjs");
const DIR = join(RAIZ, ".flujo-de-negocio/estado");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const FOTO = "prueba-ida-y-vuelta";
const ROTA = "prueba-rota";

const estado = (...args) => spawnSync("node", [ESTADO, ...args], { encoding: "utf8", cwd: RAIZ });
const psql = (sql) =>
  execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-f", "-"], {
    input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  }).trim();
const huella = () => estado("huella").stdout;
/** Nombra las tablas cuyo contenido difiere entre dos huellas: «no coinciden» sin decir cuál no sirve para diagnosticar. */
const cualesDifieren = (a, b) => {
  const x = JSON.parse(a), y = JSON.parse(b);
  return Object.keys({ ...x, ...y }).filter((t) => x[t]?.h !== y[t]?.h).map((t) => `${t} (${x[t]?.n}→${y[t]?.n})`).join(", ");
};

let fallos = 0;
function esperar(nombre, ok, detalle = "") {
  console.log(`${ok ? "✓" : "✗"} ${nombre}${!ok && detalle ? `\n    ${detalle}` : ""}`);
  if (!ok) fallos++;
}

/** Una venta real, CONFIRMADA: Tienda Lima con caja abierta, stock cargado y dos prendas vendidas (como `actividad.mjs`). */
const VENTA_CONFIRMADA = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'lima', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'lima', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'lima' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'lima' and estado = 'abierta'
) x) as _previa \\gset
select retail.abrir_caja(:'lima', 100.00, 'prueba de ida y vuelta') as caja \\gset
select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'lima', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'lima', :'sub_piso', 'entrada', 50, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select retail.registrar_venta(:'lima',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 2, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric * 2)),
  null, gen_random_uuid()) as venta \\gset
set constraints all immediate;
commit;
`;

const siempre = () => psql(`select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='retail' and not t.tgisinternal and t.tgenabled='A';`);

function intentaProhibido(sql) {
  try { psql(`begin;\n${sql}\nrollback;`); return null; } catch (e) { return String(e.stderr ?? e.message).split("\n").find((l) => l.includes("ERROR")) ?? "error"; }
}

try {
  // 0. Punto de partida: si ya hay diferencia con la última foto real, no se prueba sobre una base sucia.
  const alInicio = huella();
  const alInicio2 = huella();
  esperar("0. La base está quieta antes de empezar (dos lecturas seguidas iguales)", alInicio === alInicio2,
    `otra sesión escribió mientras arrancaba la prueba: ${alInicio === alInicio2 ? "" : cualesDifieren(alInicio, alInicio2)}`);
  esperar("Guardar una foto", estado("guardar", FOTO, "--reemplazar").status === 0);
  esperar("1. Sin tocar nada, comparar dice «idéntico»", estado("comparar", FOTO).status === 0);
  const siempreAntes = siempre();

  // 2. Una venta real y confirmada
  try { psql(VENTA_CONFIRMADA); } catch (e) { esperar("2. Registrar una venta real (escenario de actividad.mjs)", false, String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" | ")); throw e; }
  const c = estado("comparar", FOTO);
  esperar("2. La venta cambió tablas y `comparar` las nombra", c.status === 1 && /movimientos/.test(c.stdout) && /stock/.test(c.stdout), c.stdout);
  console.log(c.stdout.split("\n").map((l) => "    " + l).join("\n"));
  const trasVenta = huella();

  // 3. Sin --si solo muestra
  const seco = estado("restaurar", FOTO);
  esperar("3. Sin --si solo muestra lo que desharía y no cambia nada", seco.status === 0 && /agrega --si/.test(seco.stdout) && huella() === trasVenta, seco.stdout + seco.stderr);

  // 6. Una restauración que falla a la mitad se revierte por completo (foto rota a propósito)
  copyFileSync(join(DIR, `${FOTO}.json`), join(DIR, `${ROTA}.json`));
  copyFileSync(join(DIR, `${FOTO}.sql`), join(DIR, `${ROTA}.sql`));
  appendFileSync(join(DIR, `${ROTA}.sql`), "\nselect 1/0; -- falla DESPUÉS de vaciar y recargar todo\n");
  const mala = estado("restaurar", ROTA, "--si");
  esperar("6. Una restauración que falla a la mitad sale con error", mala.status === 1, mala.stdout + mala.stderr);
  esperar("6. …y se REVIERTE por completo: la base queda como antes de intentarla", huella() === trasVenta, "las huellas cambiaron: la restauración fallida dejó la base a medias");

  // 7. Una foto de otra migración se rechaza
  const meta = JSON.parse(readFileSync(join(DIR, `${ROTA}.json`), "utf8"));
  meta.ultima_migracion = "20200101000000";
  writeFileSync(join(DIR, `${ROTA}.json`), JSON.stringify(meta));
  const otra = estado("restaurar", ROTA, "--si");
  esperar("7. Una foto de otra migración se rechaza sin tocar la base", otra.status === 2 && huella() === trasVenta, otra.stderr);

  // 4. Ida y vuelta de verdad
  const r = estado("restaurar", FOTO, "--si");
  esperar("4. Con --si, la restauración termina con éxito", r.status === 0 && /idéntica a la foto/.test(r.stdout), r.stdout + r.stderr);
  esperar("4. La base quedó EXACTAMENTE como en la foto (mismas huellas, tabla por tabla)", huella() === alInicio2, `difieren: ${cualesDifieren(alInicio2, huella())}`);
  esperar("4. `comparar` confirma «idéntico»", estado("comparar", FOTO).status === 0);

  // 5. Las guardas del libro inmutable siguen en pie
  esperar("5. Los disparadores ENABLE ALWAYS siguen siendo los mismos", siempre() === siempreAntes, `antes ${siempreAntes}, ahora ${siempre()}`);
  const del = intentaProhibido("delete from retail.movimientos;");
  esperar("5. `movimientos` sigue bloqueando DELETE", del !== null, "el DELETE se permitió: la guarda quedó apagada");
  const trunc = intentaProhibido("truncate retail.movimientos;");
  esperar("5. `movimientos` sigue bloqueando TRUNCATE", trunc !== null, "el TRUNCATE se permitió: la guarda quedó apagada");
} catch (e) {
  esperar("La prueba terminó sin excepciones", false, String(e.message).split("\n")[0]);
} finally {
  // Pase lo que pase, la base vuelve a como estaba y no quedan fotos de prueba.
  const limpieza = estado("restaurar", FOTO, "--si");
  const ok = limpieza.status === 0;
  console.log(`\nLimpieza: ${ok ? "la base quedó como antes de la prueba" : "NO pude devolver la base a la foto — revisar a mano"}`);
  if (!ok) { fallos++; console.log(limpieza.stdout + limpieza.stderr); }
  for (const n of [FOTO, ROTA]) for (const ext of ["json", "sql"]) rmSync(join(DIR, `${n}.${ext}`), { force: true });
}

console.log(fallos ? `\n${fallos} comprobación(es) fallaron.` : "\nTodo bien: lo que un caso escribe se puede deshacer, todo o nada.");
process.exit(fallos ? 1 : 0);
