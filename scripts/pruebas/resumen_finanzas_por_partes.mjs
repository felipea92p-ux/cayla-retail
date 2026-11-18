#!/usr/bin/env node
/**
 * El Resumen de Finanzas leído por partes da exactamente lo mismo que leído entero (ADR-0661; `20261113235000_resumen_finanzas_por_partes.sql`).
 *
 * POR QUÉ. Finanzas ▸ Resumen dibuja cada bloque cuando llega su parte: pide `fn_resumen_finanzas_partes` tres veces a la vez (lo rápido, el mes,
 * el anterior y el presupuesto) en vez de una `fn_resumen_finanzas` que arma las 13 partes en fila. Es plata: si un grupo se olvidara una parte,
 * o una parte saliera distinta pedida sola, la pantalla mostraría un aviso de menos o una cifra que no es. Esta prueba lo impide.
 *
 * QUÉ CUBRE (cada escena en su transacción con ROLLBACK, sesión simulada con `request.jwt.claim.sub`, como `resumen_finanzas.mjs`)
 *   · LAS TRES LECTURAS JUNTAS = LA ENTERA. Mirando CAYLA entera, la empresa, cada tienda y el Taller (el líder) y su tienda (una integrante con
 *     «Reportes financieros»): la unión de los tres grupos de la web, sin `ms`, es la respuesta de `fn_resumen_finanzas` sin `ms`, al byte (md5).
 *     Control: con un grupo de menos NO coincide (la comparación no es vacía).
 *   · CADA PARTE SOLA = ESA PARTE EN LA ENTERA, y su `ms` trae solo lo pedido.
 *   · LOS GRUPOS SON UNA PARTICIÓN de las 13 partes (ni una de menos ni una repetida). Los grupos de aquí son los de la web
 *     (`GRUPOS_DEL_RESUMEN`, en `lib/resumen-finanzas-partes.ts` de la web); su prueba de vitest exige que coincidan con esta lista.
 *   · `fn_resumen_finanzas` ES EL ENVOLTORIO: llama a la función por partes con todas (`p_partes` null).
 *   · UNA PARTE QUE NO EXISTE ES UN ERROR (22023), y un nulo en la lista también: nunca una respuesta a medias en silencio.
 *   · PERMISOS IGUALES: sin el módulo, 42501 también por partes; `anon` no llama a ninguna; las dos son STABLE y security definer.
 *   · EL ESTADO DE RESULTADOS DEL MES, UNA VEZ (20261114005000): el grupo del mes con el balance da el presupuesto de la entera y el balance de
 *     `fn_balance_por_tienda(hoy)`, al byte; `balance` no es de la entera; las `…_de` no las llama nadie de afuera.
 *
 * USO
 *   pnpm pruebas:resumen-por-partes                  → con las migraciones aplicadas en el local
 *   pnpm pruebas:resumen-por-partes --base cayla_x   → otra base del mismo contenedor (una copia)
 */
import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo (seed)

// Los mismos grupos que pide la web (`GRUPOS_DEL_RESUMEN`, en `lib/resumen-finanzas-partes.ts` de la web). Sin importar nada de ella: esta prueba solo mira la base.
const GRUPOS = {
  rapido: ["cuentas", "por_pagar", "flujo", "igv", "campanas", "egresos", "fijos", "raros", "cierre", "sin_cuenta"],
  mes: ["resultados_mes", "presupuesto"],
  avisos: ["resultados_anterior"],
};
const TODAS = [
  "resultados_mes", "resultados_anterior", "presupuesto", "cuentas", "por_pagar", "flujo", "igv",
  "campanas", "egresos", "fijos", "raros", "cierre", "sin_cuenta",
];

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (id) => `set local role authenticated;
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
set local request.jwt.claim.sub = '${id}';
set local request.jwt.claim.role = 'authenticated';`;
const arr = (xs) => `array[${xs.map((x) => `'${x}'`).join(", ")}]::text[]`;

let casos = 0;
let fallas = 0;
function esperar(nombre, ok, detalle) {
  casos++;
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}${!ok && detalle ? `\n    ${String(detalle).slice(0, 600)}` : ""}`);
}

// ---- A. Lo que mira cada caso -------------------------------------------------------------------------------------------
const sedes = correr(`select u.id || ' ' || u.nombre from retail.ubicaciones u where u.activo and u.tipo in ('tienda', 'taller') order by u.nombre;`);
if (!sedes.ok) throw new Error(`No se pudieron leer las sedes de «${BASE}»: ${sedes.mensaje}`);
const ESCENAS = [
  { nombre: "el líder, CAYLA entera", quien: FELIPE, args: "null::uuid, false" },
  { nombre: "el líder, la empresa", quien: FELIPE, args: "null::uuid, true" },
  ...sedes.salida
    .split("\n")
    .filter(Boolean)
    .map((l) => ({ nombre: `el líder, ${l.slice(37)}`, quien: FELIPE, args: `'${l.slice(0, 36)}'::uuid, false` })),
  {
    nombre: "una integrante con «Reportes financieros», su tienda",
    quien: MICAELA,
    args: "null::uuid, false",
    antes: `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'reportes_financieros') on conflict do nothing;`,
  },
];

// ---- B. Las tres lecturas juntas = la entera (y su control) --------------------------------------------------------------
for (const e of ESCENAS) {
  const r = correr(`${e.antes ?? ""}
${como(e.quien)}
create temp table _r on commit drop as select
  retail.fn_resumen_finanzas(${e.args}) as entera,
  retail.fn_resumen_finanzas_partes(${e.args}, ${arr(GRUPOS.rapido)}) as rapido,
  retail.fn_resumen_finanzas_partes(${e.args}, ${arr(GRUPOS.mes)}) as mes,
  retail.fn_resumen_finanzas_partes(${e.args}, ${arr(GRUPOS.avisos)}) as avisos;
select md5((entera - 'ms')::text) = md5(((rapido - 'ms') || (mes - 'ms') || (avisos - 'ms'))::text),
       md5((entera - 'ms')::text) <> md5(((rapido - 'ms') || (mes - 'ms'))::text),
       (select array_agg(k order by k) from jsonb_object_keys(rapido -> 'ms') k) = (select array_agg(k order by k) from unnest(${arr(GRUPOS.rapido)}) k),
       (select count(*) from jsonb_object_keys(entera -> 'ms')) = ${TODAS.length}
  from _r;`);
  const [igual, control, msRapido, msEntera] = r.ok ? r.salida.split("|") : [];
  esperar(`B · ${e.nombre}: las tres lecturas juntas son la entera, al byte`, r.ok && igual === "t", r.ok ? r.salida : r.mensaje);
  esperar(`B · ${e.nombre}: control — con un grupo de menos NO coincide`, r.ok && control === "t", r.ok ? r.salida : r.mensaje);
  esperar(`B · ${e.nombre}: el «ms» de una lectura trae solo sus partes; el de la entera, las 13`, r.ok && msRapido === "t" && msEntera === "t", r.ok ? r.salida : r.mensaje);
}

// ---- C. Cada parte sola = esa parte en la entera -------------------------------------------------------------------------
{
  const consultas = TODAS.map(
    (p) => `select '${p}', (retail.fn_resumen_finanzas_partes(null, false, array['${p}']) -> '${p}') = (select entera -> '${p}' from _e);`,
  ).join("\n");
  const r = correr(`${como(FELIPE)}
create temp table _e on commit drop as select retail.fn_resumen_finanzas(null, false) as entera;
${consultas}`);
  const filas = r.ok ? r.salida.split("\n").map((l) => l.split("|")) : [];
  esperar(
    `C · cada una de las ${TODAS.length} partes, pedida sola, es la misma de la entera`,
    r.ok && filas.length === TODAS.length && filas.every(([, ok]) => ok === "t"),
    r.ok ? filas.filter(([, ok]) => ok !== "t").map(([p]) => p).join(", ") : r.mensaje,
  );
}

// ---- D. Los grupos son una partición de las 13 partes ---------------------------------------------------------------------
{
  const juntos = [...GRUPOS.rapido, ...GRUPOS.mes, ...GRUPOS.avisos];
  esperar(
    "D · los tres grupos cubren las 13 partes, sin repetir ninguna",
    juntos.length === TODAS.length && new Set(juntos).size === TODAS.length && TODAS.every((p) => juntos.includes(p)),
    juntos.join(", "),
  );
}

// ---- E. fn_resumen_finanzas es el envoltorio; una parte que no existe es un error; permisos ------------------------------
{
  const r = correr(`select position('fn_resumen_finanzas_partes(p_ubicacion_id, p_solo_empresa, null)' in p.prosrc) > 0
  from pg_proc p where p.oid = 'retail.fn_resumen_finanzas(uuid,boolean)'::regprocedure;`);
  esperar("E · fn_resumen_finanzas pide todas las partes a la función por partes (la regla vive en un lugar)", r.ok && r.salida === "t", r.ok ? r.salida : r.mensaje);
}
for (const [nombre, lista] of [
  ["una parte que no existe", "array['cuentas', 'saldos']::text[]"],
  ["un nulo en la lista", "array['cuentas', null]::text[]"],
]) {
  const r = correr(`${como(FELIPE)}\nselect retail.fn_resumen_finanzas_partes(null, false, ${lista});`);
  esperar(`E · ${nombre} es un error 22023, no una respuesta a medias`, !r.ok && /El Resumen no tiene esa parte/.test(r.mensaje), r.ok ? r.salida : r.mensaje);
}
{
  const r = correr(`${como(MICAELA)}\nselect retail.fn_resumen_finanzas_partes(null, false, ${arr(GRUPOS.rapido)});`);
  esperar("E · sin «Reportes financieros», la lectura por partes también dice 42501", !r.ok && /Reportes financieros/.test(r.mensaje), r.ok ? r.salida : r.mensaje);
}
{
  const r = correr(`select
  (select bool_and(p.provolatile = 's' and p.prosecdef) from pg_proc p where p.oid in ('retail.fn_resumen_finanzas(uuid,boolean)'::regprocedure, 'retail.fn_resumen_finanzas_partes(uuid,boolean,text[])'::regprocedure)),
  not has_function_privilege('anon', 'retail.fn_resumen_finanzas_partes(uuid, boolean, text[])', 'execute')
    and has_function_privilege('authenticated', 'retail.fn_resumen_finanzas_partes(uuid, boolean, text[])', 'execute')
    and not has_function_privilege('anon', 'retail.fn_resumen_finanzas(uuid, boolean)', 'execute');`);
  const [estables, permisos] = r.ok ? r.salida.split("|") : [];
  esperar("E · las dos son STABLE y security definer", r.ok && estables === "t", r.ok ? r.salida : r.mensaje);
  esperar("E · anon no llama a ninguna; authenticated sí a la de partes", r.ok && permisos === "t", r.ok ? r.salida : r.mensaje);
}

// ---- F. El estado de resultados del mes, armado una vez (20261114005000) -------------------------------------------------
// El grupo del mes con el balance: el presupuesto es el de la entera (que lo arma por su cuenta) y el balance es `fn_balance_por_tienda(hoy)`, al
// byte. Control: la parte `balance` no está en la entera. Y las `…_de` (que aceptan un estado de resultados ya armado) no las llama nadie de afuera.
for (const e of ESCENAS.filter((x) => x.quien === FELIPE && x.args.endsWith("false"))) {
  const r = correr(`${e.antes ?? ""}
${como(e.quien)}
create temp table _b on commit drop as select
  retail.fn_resumen_finanzas_partes(${e.args}, array['resultados_mes', 'presupuesto', 'balance']) as junto,
  retail.fn_resumen_finanzas(${e.args}) as entera,
  (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from retail.fn_balance_por_tienda(retail.fn_hoy_lima()) b) as balance;
select (junto -> 'presupuesto') = (entera -> 'presupuesto'),
       (junto -> 'resultados_mes') = (entera -> 'resultados_mes'),
       (junto -> 'balance' -> 'filas') = balance and (junto -> 'balance' ->> 'corte')::date = retail.fn_hoy_lima(),
       not (entera ? 'balance') and not ((entera -> 'ms') ? 'balance')
  from _b;`);
  const [ppto, mes, balance, fuera] = r.ok ? r.salida.split("|") : [];
  esperar(`F · ${e.nombre}: el presupuesto armado con el estado de resultados del mes es el mismo de la entera`, r.ok && ppto === "t" && mes === "t", r.ok ? r.salida : r.mensaje);
  esperar(`F · ${e.nombre}: la parte «balance» es fn_balance_por_tienda(hoy), al byte y en su orden`, r.ok && balance === "t", r.ok ? r.salida : r.mensaje);
  esperar(`F · ${e.nombre}: control — «balance» no es parte de la lectura entera`, r.ok && fuera === "t", r.ok ? r.salida : r.mensaje);
}
{
  const r = correr(`select
  not has_function_privilege('authenticated', 'retail.fn_presupuesto_vs_real_de(date,uuid,date,retail.fila_estado_resultados[],date,date,uuid)', 'execute')
  and not has_function_privilege('anon', 'retail.fn_presupuesto_vs_real_de(date,uuid,date,retail.fila_estado_resultados[],date,date,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'retail.fn_balance_por_tienda_de(date,retail.fila_estado_resultados[],date,date,uuid)', 'execute')
  and not has_function_privilege('anon', 'retail.fn_balance_por_tienda_de(date,retail.fila_estado_resultados[],date,date,uuid)', 'execute')
  and has_function_privilege('authenticated', 'retail.fn_presupuesto_vs_real(date,uuid,date)', 'execute')
  and has_function_privilege('authenticated', 'retail.fn_balance_por_tienda(date)', 'execute');`);
  esperar("F · las «…_de» no las llama nadie de afuera (no se le puede pasar un estado de resultados inventado); las de siempre, sí", r.ok && r.salida === "t", r.ok ? r.salida : r.mensaje);
}
{
  // Un estado de resultados que NO calza (otro mes) no se usa: el presupuesto se arma por su cuenta y da lo mismo que la función de siempre.
  const r = correr(`${como(FELIPE)}
select (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from retail.fn_presupuesto_vs_real(date_trunc('month', retail.fn_hoy_lima())::date, null, null) p)
     = (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
          from retail.fn_resumen_finanzas_partes(null, false, array['presupuesto']) x,
               jsonb_array_elements(x -> 'presupuesto' -> 'filas') p0, lateral (select p0 as p) y) is not null;`);
  esperar("F · el presupuesto pedido solo (sin el mes en la misma lectura) sigue respondiendo", r.ok && r.salida === "t", r.ok ? r.salida : r.mensaje);
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE}, contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
