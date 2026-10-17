#!/usr/bin/env node
/**
 * Prueba de `20261015154000_personas_montos_y_clientas_parte1.sql` y `20261015155000_clientas_anonimizar_lider_y_cumple_parte2.sql`
 * (/chaos de Clientes, Colaboradores y Configuración, ADR-0416).
 *
 * EL PROBLEMA QUE PRUEBA. Por la API entraban una meta diaria y un fondo de caja en `NaN`, una ficha de cliente vacía, un cumpleaños
 * el 31 de febrero, un año de nacimiento futuro y un nombre de 5000 letras; y anonimizar una ficha (borra sus datos sin vuelta atrás) lo
 * hacía cualquiera con el módulo de Clientes. Aquí cada caso se rechaza con su candado o su `hint`, lo válido pasa igual y hay control:
 * sin las migraciones, todo entraba.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK. USO: pnpm pruebas:clientas-y-metas-candados
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTE1 = readFileSync(join(RAIZ, "supabase/migrations/20261015154000_personas_montos_y_clientas_parte1.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ, "supabase/migrations/20261015155000_clientas_anonimizar_lider_y_cumple_parte2.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante con el módulo de Clientes
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

const CANDADOS = [...PARTE1.matchAll(/select pg_temp\.candado\('([a-z_]+)', '([a-z_]+)'/g)].map((m) => ({ tabla: m[1], nombre: m[2] }));
if (CANDADOS.length !== 22) throw new Error(`esperaba 22 candados y encontré ${CANDADOS.length}`);
const sinCandados = CANDADOS.map((c) => `alter table retail.${c.tabla} drop constraint if exists ${c.nombre};`).join("\n");
const BLOQUE = PARTE2.match(/\$v\$  if p_anonimizar then\$v\$, 1,\s*\$v\$([\s\S]*?)\$v\$,/)?.[1];
if (!BLOQUE) throw new Error("no encontré el bloque de anonimizar");
const sinParte2 = `do $d$ begin execute replace(pg_get_functiondef('retail.archivar_clienta(uuid, text, boolean, integer)'::regprocedure), $n$${BLOQUE}$n$, ''); end $d$;
drop trigger if exists clientas_cumple_no_futuro on retail.clientas;`;

/** Como una cuenta de verdad (rol `authenticated`): así corren los permisos de cada función. */
const como = (quien) => `set local role authenticated;\nset local request.jwt.claim.sub = '${quien}';\nset local request.jwt.claims = '{"sub":"${quien}","role":"authenticated"}';\n`;

function preparar({ sinMontos = false, sinFunciones = false, quien = FELIPE } = {}) {
  return `
begin;
${PARTE1}
${PARTE2}
${sinMontos ? sinCandados : ""}
${sinFunciones ? sinParte2 : ""}
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as valeria, version as version_valeria from retail.clientas where nombre ilike 'Valeria%' and archivada_en is null order by created_at limit 1 \\gset
${como(quien)}`;
}

let fallas = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(detalle ?? "").split("\n").filter(Boolean).slice(0, 5).join("\n    ")}`);
  }
}
const rechaza = (r, marca) => !r.ok && r.error.includes(marca);
const registrar = (args) => `select retail.registrar_clienta(${args});`;

// --- 1. Montos y fichas: rechazados por la tabla, con control ---
const ATAQUES = [
  ["una meta diaria en NaN", `select retail.guardar_metas_tienda(:'lima', array['NaN'::numeric, 100, 100, 100, 100, 100, 100], 50);`, "_montos_finitos"],
  ["un fondo de caja en NaN", `select retail.guardar_metas_tienda(:'lima', array[100, 100, 100, 100, 100, 100, 100], 'NaN'::numeric);`, "ubicaciones_montos_finitos"],
  ["una ficha de cliente vacía", registrar("'dni', null, null, null, null, null, null"), "clientas_con_algun_dato"],
  ["un cumpleaños el 31 de febrero", registrar("'dni', null, 'Ana Prueba', null, 31::smallint, 2::smallint, null"), "clientas_cumple_fecha_real"],
  ["un 29 de febrero de 2023 (no bisiesto)", registrar("'dni', null, 'Ana Prueba', null, 29::smallint, 2::smallint, 2023::smallint"), "clientas_cumple_fecha_real"],
  ["un nombre de cliente de 121 letras", registrar("'dni', null, repeat('a', 121), null, null, null, null"), "clientas_textos_con_tope"],
];
for (const [nombre, sql, candado] of ATAQUES) {
  const sin = correr(`${preparar({ sinMontos: true })}${sql}`);
  esperar(`CONTROL sin la migración: ${nombre} entraba`, sin.ok, sin.error);
  esperar(`${nombre} se rechaza (${candado})`, rechaza(correr(`${preparar()}${sql}`), candado), "pasó");
}
{
  const r = correr(`${preparar()}${registrar("'dni', null, repeat('b', 120), null, 29::smallint, 2::smallint, 2024::smallint")}
${registrar("'dni', null, 'Ana Prueba', null, 29::smallint, 2::smallint, null")}
${registrar("'dni', null, 'Bea Prueba', null, 30::smallint, 4::smallint, null")}
select retail.guardar_metas_tienda(:'lima', array[100, 100, 100, 100, 100, 100, 100], 50);
select 'ok|bordes';`);
  esperar("lo válido entra igual: 120 letras, el 29 de febrero de 2024 y sin año, el 30 de abril, metas normales", r.ok && r.salida.includes("ok|bordes"), r.error);
}

// --- 2. El año de nacimiento no es futuro ---
{
  const futuro = registrar("'dni', null, 'Ana Prueba', null, 10::smallint, 5::smallint, (extract(year from now())::integer + 4)::smallint");
  const sin = correr(`${preparar({ sinFunciones: true })}${futuro}`);
  esperar("CONTROL sin la migración: un año de nacimiento futuro entraba", sin.ok, sin.error);
  esperar("un año de nacimiento futuro se rechaza (cumple_anio_futuro)", rechaza(correr(`${preparar()}${futuro}`), "cumple_anio_futuro"), "pasó");
  const esteAnio = correr(`${preparar()}${registrar("'dni', null, 'Ana Prueba', null, 10::smallint, 5::smallint, extract(year from now())::smallint")}`);
  esperar("el año de hoy sí (un bebé puede ser cliente)", esteAnio.ok, esteAnio.error);
}

// --- 3. Anonimizar es de un líder; archivar sigue siendo de quien ve Clientes ---
{
  const anonimizar = `select retail.archivar_clienta(:'valeria', 'prueba', true);\nselect 'anonimizada|' || anonimizada from retail.clientas where id = :'valeria';`;
  const sin = correr(`${preparar({ sinFunciones: true, quien: MICAELA })}${anonimizar}`);
  esperar("CONTROL sin la migración: una integrante con Clientes anonimizaba una ficha", sin.ok, sin.error);
  esperar("una integrante no anonimiza (anonimizar_solo_lider)", rechaza(correr(`${preparar({ quien: MICAELA })}${anonimizar}`), "anonimizar_solo_lider"), "pasó");
  const archivar = correr(`${preparar({ quien: MICAELA })}select retail.archivar_clienta(:'valeria', 'prueba', false);\nselect 'archivada|ok';`);
  esperar("una integrante sí archiva sin anonimizar", archivar.ok && archivar.salida.includes("archivada|ok"), archivar.error);
  const lider = correr(`${preparar()}${anonimizar}`);
  esperar("un líder anonimiza", lider.ok && lider.salida.includes("anonimizada|t"), lider.salida || lider.error);
}

// --- 4. Las dos partes se pueden pegar dos veces ---
{
  const r = correr(`begin;\n${PARTE1}\n${PARTE1}\n${PARTE2}\n${PARTE2}
select 'validados|' || count(*) filter (where convalidated) || '/' || count(*) from pg_constraint where conname in (${CANDADOS.map((c) => `'${c.nombre}'`).join(", ")});
select 'marca|' || (length(d) - length(replace(d, 'hint = ''anonimizar_solo_lider''', ''))) / length('hint = ''anonimizar_solo_lider''')
  from (select pg_get_functiondef('retail.archivar_clienta(uuid, text, boolean, integer)'::regprocedure) d) x;
select 'disparador|' || count(*) from pg_trigger where tgname = 'clientas_cumple_no_futuro';`);
  esperar("las dos partes se pueden pegar dos veces: 22 candados validados, el candado de anonimizar y el disparador una sola vez",
    r.ok && r.salida.includes("validados|22/22") && r.salida.includes("marca|1") && r.salida.includes("disparador|1"), r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
