#!/usr/bin/env node
/**
 * Prueba de `20261015174000_gestion_adjuntos_con_tope_parte1.sql` y `20261015175000_gestion_meta_y_adjunto_parte2.sql`
 * (/chaos de Gestión e Inicio 2026-10-15, ADR-0423).
 *
 * EL PROBLEMA QUE PRUEBA. Por la API, `fijar_meta_persona` aceptaba la meta de una persona para 2999 y respondía un motivo de 81 letras
 * con el texto crudo del candado; `registrar_adjunto_compra` aceptaba un nombre de 5000 letras, una ruta con más carpetas que la de su
 * factura, y el mismo archivo dos veces respondía con el error del índice único. Aquí cada caso se rechaza con su `hint` (o su candado, si
 * se escribe la tabla directo), lo que mandan Rendimiento y Compras entra igual, y hay control: sin las migraciones, todo entraba.
 *
 * Cada caso corre en una transacción que termina en ROLLBACK. USO: pnpm pruebas:gestion-meta-y-adjunto
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const PARTE1 = readFileSync(join(RAIZ, "supabase/migrations/20261015174000_gestion_adjuntos_con_tope_parte1.sql"), "utf8");
const PARTE2 = readFileSync(join(RAIZ, "supabase/migrations/20261015175000_gestion_meta_y_adjunto_parte2.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001";
const A_AUTH = "66666666-6666-4666-8666-00000000c4a1"; // integrante de prueba (Trujillo)
const L_AUTH = "66666666-6666-4666-8666-00000000c4a3"; // líder de la sede de prueba (Trujillo)
const ARGS = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function correr(sql) {
  try {
    return { ok: true, salida: execFileSync("docker", ARGS, { input: `${sql}\nrollback;\n`, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, salida: String(e.stdout ?? "").trim(), error: String(e.stderr ?? e.message) };
  }
}

const CANDADOS = [...PARTE1.matchAll(/select pg_temp\.candado\('([a-z_]+)', '([a-z_]+)'/g)].map((m) => ({ tabla: m[1], nombre: m[2] }));
if (CANDADOS.length !== 2) throw new Error(`esperaba 2 candados y encontré ${CANDADOS.length}`);
const BLOQUES = [...PARTE2.matchAll(/select pg_temp\.insertar_antes\(\s*'(retail\.[^']+)',\s*\$v\$[\s\S]*?\$v\$, \d+,\s*\$v\$([\s\S]*?)\$v\$,/g)].map((m) => ({ firma: m[1], bloque: m[2] }));
if (BLOQUES.length !== 2) throw new Error(`esperaba 2 bloques y encontré ${BLOQUES.length}`);
const sinMigracion = [
  ...CANDADOS.map((c) => `alter table retail.${c.tabla} drop constraint if exists ${c.nombre};`),
  ...BLOQUES.map((b) => `do $d$ begin execute replace(pg_get_functiondef('${b.firma}'::regprocedure), $n$${b.bloque}$n$, ''); end $d$;`),
].join("\n");

/**
 * Trujillo con meta de S/ 1 800 por día y dos personas con horario (la integrante Ana y la líder Lidia), y una factura de compra en el
 * Taller (`:c`). Las tablas de Dynamic que la meta necesita (horarios, turnos, jornadas) se crean aquí si la base no las trae.
 */
function preparar({ sin = false } = {}) {
  return `
begin;
${PARTE1}
${PARTE2}
${sin ? sinMigracion : ""}
create table if not exists public.horarios_asignados (id uuid primary key default gen_random_uuid(), persona_id uuid not null, vigente_desde date not null,
  vigente_hasta date, hora_entrada time, hora_salida time, almuerzo_min_minutos integer, almuerzo_max_minutos integer, dias_laborables integer[],
  horas_semana_objetivo numeric, created_at timestamptz not null default now(), horario_por_dia jsonb);
create table if not exists public.turnos (id uuid primary key default gen_random_uuid(), persona_id uuid not null, fecha date not null, hora_entrada time,
  hora_salida time, origen text, es_descanso boolean not null default false, created_at timestamptz not null default now(), creado_por uuid);
create table if not exists public.jornadas (id uuid primary key default gen_random_uuid(), persona_id uuid not null, fecha date not null, sede_id uuid,
  estado text default 'cerrada');
set local request.jwt.claim.sub = '${FELIPE}';
select id as trujillo, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select date_trunc('month', (now() at time zone 'America/Lima')::date)::date as mes \\gset
insert into auth.users (id, aud, role, email) values ('${A_AUTH}', 'authenticated', 'authenticated', 'adr0423-ana@prueba.local'),
  ('${L_AUTH}', 'authenticated', 'authenticated', 'adr0423-lidia@prueba.local');
insert into public.personas (auth_user_id, nombres, apellidos, rol, estado, sede_base_id) values
  ('${A_AUTH}', 'Ana', 'Prueba', 'integrante', 'activo', :'sede_tru'), ('${L_AUTH}', 'Lidia', 'Encargada', 'supervisor_sede', 'activo', :'sede_tru');
select id as pa from public.personas where auth_user_id = '${A_AUTH}' \\gset
select id as pl from public.personas where auth_user_id = '${L_AUTH}' \\gset
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, estado, rol_id) values
  (:'pa', 'colaborador', :'trujillo', 'activo', retail.fn_rol_por_clave('integrante')), (:'pl', 'lider', :'trujillo', 'activo', retail.fn_rol_por_clave('lider'));
insert into public.horarios_asignados (persona_id, vigente_desde, horario_por_dia)
select x.p, date '2000-01-01', (select jsonb_object_agg(d::text, jsonb_build_object('e', x.e, 's', x.s, 'r', x.r)) from generate_series(0, 6) d)
  from (values (:'pa'::uuid, '09:00', '18:00', 60), (:'pl'::uuid, '09:00', '17:00', 0)) as x(p, e, s, r);
insert into retail.ubicacion_metas_dia (ubicacion_id, dia_semana, meta) select :'trujillo'::uuid, g::smallint, 1800 from generate_series(0, 6) g
  on conflict do nothing;
select id as prov from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
select retail.registrar_compra(:'prov', 'F001', 'G' || substr(md5(random()::text), 1, 8), 'credito', :'taller',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 2, 'costo_unitario', 30, 'confirma_costo', true)),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as c \\gset
`;
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
const comoLider = `set local request.jwt.claim.sub = '${L_AUTH}';\n`;
const meta = (m, { motivo = "'cambia_horario'", detalle = "null", mes = ":'mes'" } = {}) =>
  `${comoLider}select 'meta|' || retail.fijar_meta_persona(:'pa', :'trujillo', ${mes}, ${m}, ${motivo}, ${detalle});`;
const adjunto = ({ ruta = "(:'c' || '/' || gen_random_uuid() || '-factura_2026.pdf')", nombre = "'factura 2026.pdf'" } = {}) =>
  `select 'adj|' || retail.registrar_adjunto_compra(:'c', ${ruta}, ${nombre}, 'application/pdf', 1000);`;

// --- 1. La meta de una persona ---
const META = [
  ["la meta de enero de 2999", meta(20000, { mes: "date '2999-01-01'" }), "meta_mes_lejano"],
  ["la meta de dentro de 13 meses", meta(20000, { mes: "(:'mes'::date + interval '13 months')::date" }), "meta_mes_lejano"],
];
for (const [nombre, sql, hint] of META) {
  const sin = correr(`${preparar({ sin: true })}${sql}`);
  esperar(`CONTROL sin la migración: ${nombre} entraba`, sin.ok && sin.salida.includes("meta|"), sin.error);
  esperar(`${nombre} se rechaza (${hint})`, rechaza(correr(`${preparar()}${sql}`), hint), "pasó");
}
{
  const sql = meta(20000, { motivo: "'otro'", detalle: "repeat('a', 81)" });
  const sin = correr(`${preparar({ sin: true })}${sql}`);
  esperar("CONTROL sin la migración: un motivo de 81 letras respondía con el candado crudo de la tabla", rechaza(sin, "metas_persona_ajustes_detalle_check"), sin.salida || sin.error);
  const con = correr(`${preparar()}${sql}`);
  esperar("un motivo de 81 letras se rechaza con su frase (meta_detalle_largo)", rechaza(con, "meta_detalle_largo") && con.error.includes("80 letras"), con.salida || con.error);
}
{
  const r = correr(`${preparar()}${meta(20000)}\n${meta(15000, { mes: "(:'mes'::date + interval '12 months')::date" })}\n${meta(12000, { motivo: "'otro'", detalle: "repeat('a', 80)", mes: "(:'mes'::date + interval '1 month')::date" })}`);
  const filas = r.salida.split("\n").filter((l) => l.startsWith("meta|"));
  esperar("lo válido entra igual: el mes en curso, el de dentro de 12 meses y un motivo de 80 letras", r.ok && filas.length === 3, r.salida || r.error);
}

// --- 2. El adjunto de una factura ---
const ADJUNTOS = [
  ["un nombre de archivo de 5000 letras", adjunto({ nombre: "repeat('ñ', 5000)" }), "adjunto_nombre_largo"],
  ["una ruta con otra carpeta («../»)", adjunto({ ruta: "(:'c' || '/../otra/f.pdf')" }), "adjunto_ruta_invalida"],
  ["una ruta de 5000 letras", adjunto({ ruta: "(:'c' || '/' || repeat('a', 5000) || '.pdf')" }), "adjunto_ruta_invalida"],
];
for (const [nombre, sql, hint] of ADJUNTOS) {
  const sin = correr(`${preparar({ sin: true })}${sql}`);
  esperar(`CONTROL sin la migración: ${nombre} entraba`, sin.ok && sin.salida.includes("adj|"), sin.error);
  esperar(`${nombre} se rechaza (${hint})`, rechaza(correr(`${preparar()}${sql}`), hint), "pasó");
}
{
  const dos = `${adjunto({ ruta: "(:'c' || '/f.pdf')" })}\n${adjunto({ ruta: "(:'c' || '/f.pdf')" })}`;
  const sin = correr(`${preparar({ sin: true })}${dos}`);
  esperar("CONTROL sin la migración: el mismo archivo dos veces respondía con el índice único", rechaza(sin, "compra_adjuntos_ruta_key"), sin.salida || sin.error);
  const con = correr(`${preparar()}${dos}`);
  esperar("el mismo archivo dos veces se dice con palabras (adjunto_repetido)", rechaza(con, "adjunto_repetido") && con.error.includes("ya está adjunto"), con.salida || con.error);
}
{
  // La tabla es el último guardián: escribirla directo con una ruta de otra carpeta o un nombre de 256 letras choca con su candado.
  const directo = (ruta, nombre) =>
    `insert into retail.compra_adjuntos (compra_id, ruta, nombre, tipo, bytes) values (:'c', ${ruta}, ${nombre}, 'application/pdf', 1000);`;
  esperar("la tabla rechaza una ruta con otra carpeta (compra_adjuntos_ruta_un_archivo)",
    rechaza(correr(`${preparar()}${directo("(:'c' || '/x/f.pdf')", "'f.pdf'")}`), "compra_adjuntos_ruta_un_archivo"), "pasó");
  esperar("la tabla rechaza un nombre de 256 letras (compra_adjuntos_textos_con_tope)",
    rechaza(correr(`${preparar()}${directo("(:'c' || '/f.pdf')", "repeat('n', 256)")}`), "compra_adjuntos_textos_con_tope"), "pasó");
}
{
  // Lo que arma `rutaPara` (lib/adjuntos-compra.ts): `<compra>/<uuid>-<nombre en ASCII, hasta 80>`, y un nombre de 255 letras.
  const r = correr(`${preparar()}${adjunto({ ruta: `(:'c' || '/' || gen_random_uuid() || '-' || repeat('a', 80))`, nombre: "repeat('ñ', 255)" })}\n${adjunto()}\n${adjunto({ ruta: "(:'c' || '/factura..final.pdf')" })}`);
  esperar("lo válido entra igual: la ruta que arma la pantalla, un nombre de 255 letras y «factura..final.pdf»",
    r.ok && r.salida.split("\n").filter((l) => l.startsWith("adj|")).length === 3, r.salida || r.error);
}

console.log(fallas ? `\n${fallas} de ${total} pruebas fallaron.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
