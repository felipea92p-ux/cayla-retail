#!/usr/bin/env node
/**
 * Prueba de `20261016211000_caja_cerrada_cuadra_su_fondo.sql` — auditoría de Finanzas 2026-10-16, causa raíz G01.
 *
 * QUÉ CUBRE
 *   · una caja cerrada real cumple contado = fondo + trasladado: un cierre normal con traslado (que escribe la caja y el
 *     traslado en el orden que quiera `cerrar_caja`) sigue pasando;
 *   · lo que NO pasa: regularizar a mano un traslado sin corregir el fondo (el caso real de Trujillo, 977.20 en vez de
 *     277.20), tocar solo `monto_fondo`, y borrar un traslado. Con la corrección completa en la misma operación, sí pasa;
 *   · una caja de prueba o abierta no se mira;
 *   · `archivar_caja_prueba` recalcula lo esperado por la primera caja real posterior (el caso de Arequipa): conserva el
 *     motivo que ya tenía y, si no tenía, deja uno para no romper `caja_apertura_explica_diferencia`;
 *   · archivar una caja ABIERTA (que se cierra por dentro y cambia su contado) sigue andando con el candado puesto.
 *
 * CÓMO. El candado es DIFERIDO (se mira al confirmar), y estas pruebas terminan en ROLLBACK: por eso cada caso fuerza
 * `set constraints all immediate` dentro de `pg_temp.intento`. Nunca se confirma nada en el Postgres local compartido.
 * Las fechas de las cajas se mueven al futuro lejano (+100 días) para que ninguna caja del seed cambie «el último cierre».
 *
 * USO
 *   pnpm pruebas:caja-fondo-coherente                         → contra el Postgres local del contenedor
 *   node scripts/pruebas/caja_fondo_coherente.mjs --base otra → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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

// El candado diferido se mira aquí, no al confirmar (que el ROLLBACK de la prueba nunca alcanza).
const MIRAR = `select pg_temp.intento('set constraints all immediate');`;

/** Trujillo, con lo que hubiera abierto cerrado: Felipe es la sesión. Deja `:trujillo`, `:persona`. */
const ESCENA = `
begin;
${INTENTO}
${cambiaA(FELIPE)}
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select (select count(*) from (
  select retail.cerrar_caja(id, 100) from retail.cajas where ubicacion_id = :'trujillo' and estado = 'abierta'
) x) as _previa \\gset
select id as persona from public.personas where auth_user_id = '${FELIPE}' \\gset
`;

/** Una caja real cerrada: contado 90 y 50 al banco → deja 40. Deja `:caja`. */
const CAJA_CON_TRASLADO = `
select retail.abrir_caja(:'trujillo', 100.00, 'prueba automatizada') as caja \\gset
select monto_trasladado from retail.cerrar_caja(:'caja', 90, 50, 'banco', ' ') \\gset
`;

/** Una caja real cerrada sin traslado: contado 977.20 → deja 977.20, como la de Trujillo del 8-oct. Deja `:caja`. */
const CAJA_SIN_TRASLADO = `
select retail.abrir_caja(:'trujillo', 100.00, 'prueba automatizada') as caja \\gset
select count(*) as _c from retail.cerrar_caja(:'caja', 977.20) \\gset
`;

let fallos = 0;
function esperar(nombre, ok, resultado) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 600)}`);
  }
}

// 1. Un cierre normal con traslado sigue pasando el candado, y el fondo es contado − trasladado.
{
  const r = correr(`${ESCENA}${CAJA_CON_TRASLADO}
${MIRAR}
select monto_fondo from retail.cajas where id = :'caja';`);
  const [mirar, fondo] = r.ok ? r.salida.split("\n") : [];
  esperar("un cierre con traslado pasa el candado (90 contados − 50 al banco = 40 en el cajón)", r.ok && mirar === "SIN_ERROR" && Number(fondo) === 40, r);
}

// 2. El caso real de Trujillo: se regulariza a mano un traslado de 700 y el fondo se queda en 977.20.
{
  const r = correr(`${ESCENA}${CAJA_SIN_TRASLADO}
insert into retail.caja_traslados (caja_id, destino, monto, referencia, registrado_por)
  values (:'caja', 'caja_fuerte', 700, 'Regularización', :'persona');
${MIRAR}`);
  esperar(
    "regularizar a mano un traslado sin corregir el fondo se rechaza, y el mensaje dice qué corregir",
    r.ok && r.salida.includes("La caja cerrada no cuadra") && r.salida.includes("977.20") && r.salida.includes("700.00") && r.salida.includes("corrige"),
    r
  );
}

// 3. La misma regularización, completa: el traslado Y el fondo (contado − trasladado) en la misma operación.
{
  const r = correr(`${ESCENA}${CAJA_SIN_TRASLADO}
insert into retail.caja_traslados (caja_id, destino, monto, referencia, registrado_por)
  values (:'caja', 'caja_fuerte', 700, 'Regularización', :'persona');
update retail.cajas set monto_fondo = 277.20 where id = :'caja';
${MIRAR}`);
  esperar("la regularización completa (traslado + fondo corregido) pasa", r.ok && r.salida === "SIN_ERROR", r);
}

// 4. Tocar solo el fondo de una caja cerrada.
{
  const r = correr(`${ESCENA}${CAJA_CON_TRASLADO}
update retail.cajas set monto_fondo = monto_fondo + 10 where id = :'caja';
${MIRAR}`);
  esperar("cambiar solo el fondo de una caja cerrada se rechaza", r.ok && r.salida.includes("La caja cerrada no cuadra"), r);
}

// 5. Borrar un traslado sin corregir el fondo.
{
  const r = correr(`${ESCENA}${CAJA_CON_TRASLADO}
delete from retail.caja_traslados where caja_id = :'caja';
${MIRAR}`);
  esperar("borrar un traslado sin corregir el fondo se rechaza", r.ok && r.salida.includes("La caja cerrada no cuadra"), r);
}

// 6. Una caja de prueba no se mira (es un dato administrativo, no efectivo).
{
  const r = correr(`${ESCENA}${CAJA_SIN_TRASLADO}
update retail.cajas set es_prueba = true where id = :'caja';
insert into retail.caja_traslados (caja_id, destino, monto, referencia, registrado_por)
  values (:'caja', 'caja_fuerte', 700, 'Regularización', :'persona');
${MIRAR}`);
  esperar("una caja de prueba no se mira", r.ok && r.salida === "SIN_ERROR", r);
}

/**
 * La cadena de Arequipa en Trujillo: A (real, deja 300) → T (la que se archivará, deja 0) → R (real, abre mirando a T).
 * Las fechas van al futuro lejano para que `abrir_caja` encuentre «el último cierre» entre estas y no entre las del seed.
 * `:r_apertura` y `:r_motivo` se eligen por escenario.
 */
function cadena(aperturaR, motivoR) {
  return `${ESCENA}
select retail.abrir_caja(:'trujillo', 100.00, 'prueba automatizada') as a \\gset
select count(*) as _c from retail.cerrar_caja(:'a', 300) \\gset
update retail.cajas set abierta_en = now() + interval '100 days', cerrada_en = now() + interval '100 days 1 hour' where id = :'a';
select retail.abrir_caja(:'trujillo', 300.00, null) as t \\gset
select count(*) as _c from retail.cerrar_caja(:'t', 0) \\gset
update retail.cajas set abierta_en = now() + interval '101 days', cerrada_en = now() + interval '101 days 1 hour' where id = :'t';
select retail.abrir_caja(:'trujillo', ${aperturaR}, ${motivoR}) as r \\gset
select count(*) as _c from retail.cerrar_caja(:'r', ${aperturaR}) \\gset
update retail.cajas set abierta_en = now() + interval '102 days', cerrada_en = now() + interval '102 days 1 hour' where id = :'r';
`;
}

// 7. Arequipa: R abrió con 118.90 cuando T (que dejó 0) contaba como el último cierre → esperaba 0.00. Al archivar T, lo
// esperado pasa a 300.00 (lo que dejó A) y el motivo que R ya traía se conserva.
{
  const r = correr(`${cadena("118.90", "'se dejó en caja chica'")}
select monto_apertura_esperado, motivo_diferencia_apertura from retail.cajas where id = :'r';
select count(*) as _c from (select retail.archivar_caja_prueba(:'t')) q \\gset
select monto_apertura_esperado, motivo_diferencia_apertura from retail.cajas where id = :'r';
${MIRAR}`);
  const l = r.ok ? r.salida.split("\n") : [];
  const antes = (l[0] ?? "").split("|");
  const despues = (l[1] ?? "").split("|");
  esperar(
    "archivar la caja de prueba recalcula lo esperado de la caja real siguiente (0.00 → 300.00) y conserva su motivo",
    r.ok && Number(antes[0]) === 0 && Number(despues[0]) === 300 && despues[1] === "se dejó en caja chica" && l[l.length - 1] === "SIN_ERROR",
    r
  );
}

// 8. Sin motivo previo: R abrió con 0.00 = lo esperado en su momento (no pidió motivo). Al cambiar lo esperado a 300.00 la
// apertura queda con diferencia, y el candado `caja_apertura_explica_diferencia` exige un motivo: se deja uno.
{
  const r = correr(`${cadena("0.00", "null")}
select count(*) as _c from (select retail.archivar_caja_prueba(:'t')) q \\gset
select monto_apertura_esperado, motivo_diferencia_apertura from retail.cajas where id = :'r';
${MIRAR}`);
  const l = r.ok ? r.salida.split("\n") : [];
  const [esperado, motivo] = (l[0] ?? "").split("|");
  esperar(
    "si la caja real no traía motivo, archivar deja uno (el candado de la apertura lo exige)",
    r.ok && Number(esperado) === 300 && (motivo ?? "").startsWith("Se archivó la caja de prueba anterior") && l[l.length - 1] === "SIN_ERROR",
    r
  );
}

// 9. Archivar una caja ABIERTA: se cierra por dentro con `cerrar_caja`, le cambia el contado y la marca de prueba.
{
  const r = correr(`${ESCENA}
select retail.abrir_caja(:'trujillo', 100.00, 'prueba automatizada') as caja \\gset
select count(*) as _c from (select retail.archivar_caja_prueba(:'caja')) q \\gset
select estado, es_prueba from retail.cajas where id = :'caja';
${MIRAR}`);
  const l = r.ok ? r.salida.split("\n") : [];
  esperar("archivar una caja abierta sigue andando con el candado puesto", r.ok && l[0] === "cerrada|t" && l[l.length - 1] === "SIN_ERROR", r);
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
