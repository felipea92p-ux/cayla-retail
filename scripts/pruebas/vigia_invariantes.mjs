#!/usr/bin/env node
/**
 * Prueba del vigía diario de invariantes (`20261109152000_vigia_de_invariantes.sql`, ADR-0632).
 *
 * EL PROBLEMA. Un vigía que dice «todo bien» sin haber mirado da una calma falsa, y uno que grita cada mañana por lo mismo se
 * aprende a ignorar. Esta prueba exige las dos cosas: que vea lo que se rompe y que no repita lo que ya se sabía.
 *
 * QUÉ CUBRE
 *   A. Primera corrida en una base sana: nada nuevo, nada con error, y las tres que no puede mirar (dos sospechas apagadas y la que
 *      necesita sesión) salen «omitida», nunca «limpia».
 *   B. Lo que ya estaba roto ANTES de empezar a mirar es heredado: no cuenta como nuevo.
 *   C. Lo que se rompe DESPUÉS es nuevo, y lo sigue siendo al día siguiente si nadie lo arregla.
 *   D. El Admin lo acepta con su motivo: deja de contar como nuevo. Sin motivo, no se acepta.
 *   E. Se arregla y se vuelve a romper: cuenta otra vez como nuevo (lo conocido se retira cuando desaparece).
 *   F. Una consulta que falla, o una clave que nombra una columna que no existe, sale «error» con su motivo, nunca «limpia».
 *   G. Quién puede: la llave de servicio y el SQL Editor la corren; una colaboradora no corre, no ve ni acepta; el Admin ve y acepta,
 *      pero no corre; sin sesión, ni siquiera se puede llamar.
 *   H. Volver a pegar la migración no reenciende una invariante que alguien apagó.
 *   I. Dos corridas a la vez: la segunda vuelve sin hacer nada (`ya_corriendo`).
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK, con la migración pegada antes (en local la prueba aunque no esté aplicada; en el CI,
 * donde ya está, prueba además que se puede volver a pegar). El caso I abre una segunda conexión que solo toma el candado y se deshace.
 * La violación se provoca con la misma corrupción de INV-02 que usa `/chaos` (un precio de una línea vendida que sube 5 soles).
 *
 * USO
 *   pnpm pruebas:vigia-invariantes
 *   RETAIL_CONTENEDOR_PG=<otra pila> pnpm pruebas:vigia-invariantes   (si la base compartida va atrás de main)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261109152000_vigia_de_invariantes.sql"), "utf8");
const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo (seed)

const argsPsql = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", argsPsql, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

// `pg_temp.intento(sql)` devuelve «ok» o el mensaje del error sin abortar la transacción.
const PRELUDIO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end $f$;
grant execute on function pg_temp.intento(text) to authenticated, anon, service_role;
`;

/** Corre `sql` en una transacción que siempre se deshace, con la migración pegada antes. */
function correr(sql) {
  try {
    const salida = psql(`begin;\n${PRELUDIO}\n${MIGRACION}\nreset search_path;\nreset lock_timeout;\n${sql}\nrollback;\n`);
    return { ok: true, lineas: salida.trim().split("\n").filter((x) => x !== "") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const comoCuenta = (id) =>
  `set local role authenticated;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claim.role = 'authenticated';\n`;
const comoServicio = "set local role service_role;\nset local request.jwt.claim.role = 'service_role';\n";
const comoNadie = "reset role;\nreset request.jwt.claim.sub;\nreset request.jwt.claim.role;\n";

// La línea vendida que se rompe y se arregla: siempre la misma (por id), para poder deshacerla.
const LINEA = `(select vi.id from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id where v.estado = 'completada' order by vi.id limit 1)`;
const ROMPER = `update retail.venta_items set precio_unitario = precio_unitario + 5 where id = ${LINEA};\n`;
const ARREGLAR = `update retail.venta_items set precio_unitario = precio_unitario - 5 where id = ${LINEA};\n`;
// Corre el vigía sin imprimir nada: así cada línea de la salida es de un `select` del caso.
const CORRER = "do $c$ begin perform retail.fn_correr_invariantes(); end $c$;\n";
// Una línea de la última corrida para INV-02: estado|total|nuevas.
const INV02 = `select c.estado || '|' || c.total || '|' || c.nuevas from retail.invariantes_corridas c
  where c.invariante_id = 'INV-02' order by c.corrida_en desc, c.id desc limit 1;\n`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`   ${JSON.stringify(detalle).slice(0, 900)}`);
  }
}
const ultima = (r) => (r.ok ? r.lineas[r.lineas.length - 1] : undefined);
const json = (r) => {
  try {
    return JSON.parse(ultima(r) ?? "null");
  } catch {
    return null;
  }
};

// A. Primera corrida en una base sana.
{
  const r = correr(`select retail.fn_correr_invariantes()::text;`);
  const e = json(r);
  esperar("primera corrida en una base sana: nada nuevo, nada con error", e?.nuevas_graves === 0 && e?.nuevas_leves === 0 && e?.errores === 0, r);
  esperar("…las dos sospechas apagadas y la que necesita sesión salen «omitida», nunca «limpia»", e?.omitidas === 3 && e?.limpias === e?.invariantes - 3, e);
  const base = correr(`${CORRER}select count(*) filter (where linea_base_en is not null) || '|' || count(*) filter (where activa and not requiere_sesion)
    from retail.invariantes;`);
  const [conBase, mirables] = (ultima(base) ?? "").split("|");
  esperar("…y cada una de las que sí mira quedó con su línea base", conBase === mirables && Number(conBase) > 0, base);
}

// B. Lo que ya estaba roto antes de empezar a mirar.
{
  const r = correr(`${ROMPER}${CORRER}${INV02}`);
  esperar("lo roto ANTES de la primera corrida es heredado: viola, pero no es nuevo", ultima(r) === "viola|1|0", r);
}

// C. Lo que se rompe después, y al día siguiente.
{
  const r = correr(`${CORRER}${ROMPER}${CORRER}${INV02}${CORRER}${INV02}
select (retail.fn_invariantes_estado() ->> 'nuevas_graves');`);
  const [hoy, manana, graves] = r.ok ? r.lineas.slice(-3) : [];
  esperar("lo que se rompe DESPUÉS de la línea base es nuevo", hoy === "viola|1|1", r);
  esperar("…sigue siendo nuevo al día siguiente si nadie lo arregla", manana === "viola|1|1", r);
  esperar("…y el resumen lo cuenta entre las nuevas graves", Number(graves) >= 1, r);
}

// D. El Admin lo acepta, con su motivo.
{
  const sinMotivo = correr(`${CORRER}${ROMPER}${CORRER}${comoCuenta(FELIPE)}
select pg_temp.intento($$select retail.fn_invariantes_aceptar('INV-02', 'corto')$$);`);
  esperar("aceptar sin un motivo de 10 letras se rechaza", ultima(sinMotivo)?.includes("por qué es así a propósito"), sinMotivo);

  const r = correr(`${CORRER}${ROMPER}${CORRER}
select retail.fn_invariantes_aceptar('INV-02', 'Precio corregido a mano en la boleta, ya conversado');
${CORRER}${INV02}
select count(*) from retail.invariantes_conocidas where invariante_id = 'INV-02' and motivo = 'aceptada' and resuelta_en is null;`);
  const [aceptadas, despues, vigentes] = r.ok ? r.lineas.slice(-3) : [];
  esperar("el Admin acepta lo encontrado: devuelve cuántas aceptó", aceptadas === "1", r);
  esperar("…y desde la corrida siguiente ya no cuenta como nuevo", despues === "viola|1|0" && vigentes === "1", r);
}

// E. Se arregla y se vuelve a romper.
{
  const r = correr(`${CORRER}${ROMPER}${CORRER}
select retail.fn_invariantes_aceptar('INV-02', 'Aceptada para probar que vuelve si se rompe de nuevo');
${ARREGLAR}${CORRER}${INV02}
select count(*) from retail.invariantes_conocidas where invariante_id = 'INV-02' and resuelta_en is null;
${ROMPER}${CORRER}${INV02}`);
  const [arreglada, vigentes, otraVez] = r.ok ? r.lineas.slice(-3) : [];
  esperar("arreglada, la invariante vuelve a estar limpia y lo conocido se retira", arreglada === "limpia|0|0" && vigentes === "0", r);
  esperar("…y si se rompe otra vez, cuenta otra vez como NUEVA (no queda escondida como conocida)", otraVez === "viola|1|1", r);
}

// F. Una consulta que falla o una clave mal escrita.
{
  // Una clave mal escrita solo se nota cuando hay algo que identificar (sin filas no hay columnas que mirar): por eso se rompe
  // INV-02 de verdad. Que cada clave salga de su consulta lo vigila antes, en el CI, scripts/chaos/vigia-semilla.test.mjs.
  const r = correr(`update retail.invariantes set clave = array['no_existe'] where id = 'INV-02';
update retail.invariantes set sql = 'select 1 / 0 as venta_item_id' where id = 'INV-03';
${ROMPER}${CORRER}
select string_agg(invariante_id || '|' || estado || '|' || (mensaje is not null), ',' order by invariante_id)
  from retail.invariantes_corridas where invariante_id in ('INV-02', 'INV-03');
select retail.fn_invariantes_estado() ->> 'errores';`);
  const [filas, errores] = r.ok ? r.lineas.slice(-2) : [];
  esperar("una consulta que falla y una clave que nombra una columna inexistente salen «error» con su motivo, nunca «limpia»",
    filas === "INV-02|error|true,INV-03|error|true" && errores === "2", r);
}

// G. Quién puede.
{
  const r = correr(`
${comoCuenta(MICAELA)}
select pg_temp.intento('select retail.fn_correr_invariantes()') || '#' ||
       pg_temp.intento('select retail.fn_invariantes_estado()') || '#' ||
       pg_temp.intento($$select retail.fn_invariantes_aceptar('INV-02', 'una colaboradora no acepta')$$) || '#' ||
       pg_temp.intento('select count(*) from retail.invariantes_corridas');
reset role;
${comoCuenta(FELIPE)}
select pg_temp.intento('select retail.fn_correr_invariantes()') || '#' || pg_temp.intento('select retail.fn_invariantes_estado()');
reset role;
${comoServicio}
select pg_temp.intento('select retail.fn_correr_invariantes()');
reset role;
${comoNadie}
set local role anon;
select pg_temp.intento('select retail.fn_invariantes_estado()');
reset role;
${comoNadie}
select pg_temp.intento('select retail.fn_correr_invariantes()');`);
  const [colab, admin, servicio, anon, editor] = r.ok ? r.lineas.slice(-5).map((x) => x.split("#")) : [];
  esperar("una colaboradora no corre, no ve ni acepta el vigía, y no lee sus tablas",
    colab?.length === 4 && colab[0].includes("permission denied") && colab.slice(1, 3).every((m) => m.includes("Admin")) &&
      colab[3].includes("permission denied"), colab ?? r);
  esperar("el Admin ve el resumen pero no corre el vigía (no es suyo: es del trabajo programado)",
    admin?.[0]?.includes("permission denied") && admin?.[1] === "ok", admin ?? r);
  esperar("la llave de servicio (el trabajo programado de Vercel) lo corre", servicio?.[0] === "ok", servicio ?? r);
  esperar("sin sesión (anon) ni siquiera se puede llamar", anon?.[0]?.includes("permission denied"), anon ?? r);
  esperar("postgres sin sesión de nadie (el SQL Editor) lo corre", editor?.[0] === "ok", editor ?? r);
}

// H. Volver a pegar no reenciende lo apagado.
{
  const r = correr(`update retail.invariantes set activa = false where id = 'INV-01';
${MIGRACION}
reset search_path;
reset lock_timeout;
select activa from retail.invariantes where id = 'INV-01';
${CORRER}
select estado from retail.invariantes_corridas where invariante_id = 'INV-01' order by corrida_en desc, id desc limit 1;`);
  const [activa, estado] = r.ok ? r.lineas.slice(-2) : [];
  esperar("volver a pegar la migración no reenciende una invariante apagada, y la apagada sale «omitida»", activa === "f" && estado === "omitida", r);
}

// I. Dos corridas a la vez: una conexión toma el candado (y se deshace), la otra corre mientras tanto.
{
  const tenedor = spawn("docker", argsPsql, { stdio: ["pipe", "pipe", "pipe"] });
  tenedor.stdin.end(`begin;\nselect pg_advisory_xact_lock(hashtext('retail.fn_correr_invariantes'));\nselect pg_sleep(4);\nrollback;\n`);
  await new Promise((listo) => setTimeout(listo, 1500));
  const r = correr(`select retail.fn_correr_invariantes() ->> 'motivo';`);
  await new Promise((listo) => tenedor.on("close", listo));
  esperar("si otra corrida ya está en curso, la segunda vuelve sin hacer nada", ultima(r) === "ya_corriendo", r);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
