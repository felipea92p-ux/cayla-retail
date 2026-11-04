#!/usr/bin/env node
/**
 * Datos INVENTADOS para mirar Rendimiento en local (ADR-0610): tres tiendas con su gente, sus horarios, sus metas y ventas del mes pasado y de este.
 *
 * PROMETE: que Trujillo y Arequipa reparten por horas y Lima no tiene horarios (partes iguales, D-158); que hay quien va adelante, quien va en
 * ritmo, quien va por debajo y quien recién tiene pocas ventas; y que `quitar` lo saca todo: lo reconoce por sus ids fijos.
 * NO HACE: no pasa por `registrar_venta` (no mueve stock ni caja), así que esas ventas solo tienen sentido para mirar Rendimiento. Nunca toca producción.
 * ASUME: una base local que YA tiene el seed.
 *
 * SOLO CORRE con el contenedor dicho a mano: la base local de siempre la comparten otras sesiones, y esto no debe caerle encima por descuido.
 *
 *   CAYLA_CONTENEDOR_DB=supabase_db_cayla-rendimiento node scripts/demo/rendimiento-local.mjs cargar
 *   CAYLA_CONTENEDOR_DB=supabase_db_cayla-rendimiento node scripts/demo/rendimiento-local.mjs quitar
 *
 * Entra con `elena@cayla.local` (encargada de Trujillo) o `felipe@cayla.local` (Admin), clave `cayla-local`.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const CONTENEDOR = process.env.CAYLA_CONTENEDOR_DB;
const orden = process.argv[2];
if (!CONTENEDOR || !["cargar", "quitar"].includes(orden)) {
  console.error("Uso: CAYLA_CONTENEDOR_DB=<contenedor> node scripts/demo/rendimiento-local.mjs cargar|quitar");
  process.exit(1);
}

const psql = (sql) =>
  execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

if (psql("select count(*) from auth.users where email = 'felipe@cayla.local';").trim() !== "1") {
  console.error("No parece una base local con el seed (falta felipe@cayla.local): no toco nada.");
  process.exit(1);
}

const id = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;
const SEDE_AQP = id(1);
const UBIC_AQP = id(2);

// [nombre, apellido, cuánto de su meta vende, ticket, turno]
const M = ["10:00", "18:00"];
const T = ["13:00", "21:00"];
const GENTE = {
  "Tienda Trujillo": [
    ["Ana", "Torres", 1.32, 96, M],
    ["Carla", "Ruiz", 1.02, 88, M],
    ["Diana", "Paz", 0.74, 81, T],
    ["Elena", "Vera", 1.16, 102, T],
    ["Bruno", "Salas", 0.96, 79, M],
  ],
  "Tienda Arequipa": [
    ["Gaby", "Núñez", 1.01, 92, M],
    ["Hilda", "Quispe", 1.2, 85, T],
    ["Irene", "Soto", 0.8, 77, M],
    ["Julia", "Mamani", 1.04, 90, T],
  ],
  "Tienda Lima": [
    ["Karen", "Díaz", 1.1, 110, M],
    ["Lidia", "Flores", 0.9, 98, M],
    ["Mónica", "Reyes", 1.02, 104, T],
  ],
};
// Meta de cada día de la semana (0 domingo … 6 sábado).
const METAS = {
  "Tienda Trujillo": [1500, 1500, 1500, 1600, 1700, 2000, 2800],
  "Tienda Arequipa": [1100, 1100, 1100, 1200, 1300, 1500, 2100],
  "Tienda Lima": [1200, 1200, 1300, 1300, 1400, 1700, 2300],
};

// Una sola persona por id: el número sale de su lugar en la lista.
const PERSONAS = Object.entries(GENTE).flatMap(([tienda, gente], t) =>
  gente.map(([nombre, apellido, factor, ticket, turno], i) => ({
    auth: id(100 + t * 10 + i),
    identidad: id(200 + t * 10 + i),
    tienda,
    nombre,
    apellido,
    factor,
    ticket,
    turno,
    descanso: (i + t) % 7, // su día libre
    correo: `${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}@cayla.local`,
  })),
);

const lista = (xs) => xs.map((x) => `'${x}'`).join(",");
const IDS_AUTH = lista(PERSONAS.map((p) => p.auth));
// Micaela ya es de Trujillo en el seed: recién empieza y tiene pocas ventas (no se crea ni se borra, solo sus ventas y su horario).
const MICAELA = { auth: "22222222-2222-4222-8222-000000000003", tienda: "Tienda Trujillo", factor: 0.22, ticket: 70, turno: ["14:00", "18:00"], descanso: 0 };
const IDS_VENTAS = lista([...PERSONAS.map((p) => p.auth), MICAELA.auth]);

const QUITAR = `
delete from retail.venta_items where venta_id in (select v.id from retail.ventas v join public.personas p on p.id = v.asesora_id where p.auth_user_id in (${IDS_VENTAS}));
delete from retail.ventas where asesora_id in (select id from public.personas where auth_user_id in (${IDS_VENTAS}));
delete from retail.ubicacion_metas_dia where ubicacion_id = '${UBIC_AQP}';
do $$ begin
  if to_regclass('public.horarios_asignados') is not null then
    delete from public.horarios_asignados where persona_id in (select id from public.personas where auth_user_id in (${IDS_VENTAS}));
    delete from public.jornadas where persona_id in (select id from public.personas where auth_user_id in (${IDS_AUTH}));
  end if;
end $$;
delete from retail.metas_persona_ajustes where persona_id in (select id from public.personas where auth_user_id in (${IDS_AUTH}));
delete from retail.colaboradores where persona_id in (select id from public.personas where auth_user_id in (${IDS_AUTH}));
delete from public.personas where auth_user_id in (${IDS_AUTH});
delete from auth.identities where user_id in (${IDS_AUTH});
delete from auth.users where id in (${IDS_AUTH});
update retail.ubicaciones set activo = false where id = '${UBIC_AQP}'; -- una tienda con su cuenta no se borra: se apaga
`;

if (orden === "quitar") {
  psql(`begin;\n${QUITAR}\ncommit;`);
  console.log("✓ Datos inventados de Rendimiento fuera.");
  process.exit(0);
}

// ---------- cargar ----------
const ahora = new Date(Date.now() - 5 * 3600 * 1000); // el reloj de Lima
const hoy = ahora.toISOString().slice(0, 10);
const ahoraMin = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
const iso = (d) => d.toISOString().slice(0, 10);
const inicioMesPasado = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 1, 1));

let semilla = 20261104;
const azar = () => {
  semilla = (semilla + 0x6d2b79f5) >>> 0;
  let t = semilla;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const min = ([h, m]) => Number(h) * 60 + Number(m);
const aMin = (hhmm) => min(hhmm.split(":"));
const PRECIOS = [39, 49, 59, 69, 79, 89, 99, 119, 139, 159, 189];

const ventas = [];
const items = [];
const jornadas = [];

for (const p of [...PERSONAS, MICAELA]) {
  const metaDia = METAS[p.tienda];
  // Trujillo reparte también con Micaela, que hace menos horas: cuenta como media persona.
  const personasTienda = PERSONAS.filter((x) => x.tienda === p.tienda).length + (p.tienda === MICAELA.tienda ? 0.5 : 0);
  for (let d = new Date(inicioMesPasado); iso(d) <= hoy; d = new Date(d.getTime() + 86400000)) {
    const dia = iso(d);
    const dow = d.getUTCDay();
    if (dow === p.descanso) continue;
    if (p.tienda === "Tienda Lima") jornadas.push({ auth: p.auth, dia });
    const entrada = aMin(p.turno[0]);
    const salida = aMin(p.turno[1]);
    const esHoy = dia === hoy;
    if (esHoy && ahoraMin <= entrada) continue;
    const corrio = esHoy ? Math.min(1, (ahoraMin - entrada) / (salida - entrada)) : 1;
    const objetivo = (metaDia[dow] / personasTienda) * p.factor * corrio * (0.65 + 0.7 * azar());
    let vendido = 0;
    while (vendido + p.ticket / 2 < objetivo) {
      const venta = randomUUID();
      const m = entrada + Math.floor(azar() * (salida - entrada) * corrio);
      const hora = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      ventas.push(`('${venta}', (select id from retail.ubicaciones where nombre = '${p.tienda}'), _p('${p.auth}'), _p('${p.auth}'), 'completada', false, timestamptz '${dia} ${hora}-05')`);
      const lineas = azar() < 0.72 ? 1 : azar() < 0.8 ? 2 : 3;
      for (let l = 0; l < lineas; l++) {
        const base = PRECIOS[Math.floor(azar() * PRECIOS.length)];
        const precio = Math.max(29, Math.round(base * (p.ticket / 100) / (lineas > 1 ? 1.25 : 1)));
        items.push(`('${venta}', _var(${Math.floor(azar() * 40)}), 1, ${precio}, 0)`);
        vendido += precio;
      }
    }
  }
}

const usuario = (p) => `
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '${p.auth}', 'authenticated', 'authenticated', '${p.correo}', extensions.crypt('cayla-local', extensions.gen_salt('bf')), now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('${p.identidad}', '${p.auth}', '${p.auth}', '{"sub":"${p.auth}","email":"${p.correo}","email_verified":true}'::jsonb, 'email', now(), now(), now());
insert into public.personas (auth_user_id, nombres, apellidos, rol, estado, sede_base_id)
values ('${p.auth}', '${p.nombre}', '${p.apellido}', 'integrante', 'activo', (select sede_dynamic_id from retail.ubicaciones where nombre = '${p.tienda}'));
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, estado, rol_id)
values (_p('${p.auth}'), ${p.nombre === "Elena" ? "'lider'" : "'colaborador'"}, (select id from retail.ubicaciones where nombre = '${p.tienda}'), 'activo', retail.fn_rol_por_clave(${p.nombre === "Elena" ? "'lider'" : "'integrante'"}));
`;

// Por tramos: un `insert` con miles de filas funciona, pero así un error dice dónde.
const trozos = (filas, n) => Array.from({ length: Math.ceil(filas.length / n) }, (_, i) => filas.slice(i * n, i * n + n));

const SQL = `
begin;
${QUITAR}
insert into public.sedes (id, codigo, nombre, activa, tipo, ciudad) values ('${SEDE_AQP}', 'AQP', 'Tienda AQP', true, 'tienda', 'Arequipa') on conflict (id) do nothing;
insert into retail.ubicaciones (id, nombre, tipo, activo, sede_dynamic_id) values ('${UBIC_AQP}', 'Tienda Arequipa', 'tienda', true, '${SEDE_AQP}') on conflict (id) do update set activo = true;

create table if not exists public.horarios_asignados (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null, vigente_desde date not null, vigente_hasta date,
  hora_entrada time, hora_salida time, almuerzo_min_minutos integer, almuerzo_max_minutos integer, dias_laborables integer[],
  horas_semana_objetivo numeric, created_at timestamptz not null default now(), horario_por_dia jsonb);
create table if not exists public.turnos (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null, fecha date not null, hora_entrada time, hora_salida time,
  origen text, es_descanso boolean not null default false, created_at timestamptz not null default now(), creado_por uuid);
create table if not exists public.jornadas (
  id uuid primary key default gen_random_uuid(), persona_id uuid not null, fecha date not null, sede_id uuid, estado text default 'cerrada');

create schema if not exists demo_tmp;
create function demo_tmp._p(a uuid) returns uuid language sql stable as $f$ select id from public.personas where auth_user_id = a $f$;
create temp table _variantes as select row_number() over (order by id) - 1 as n, id from retail.variantes;
create function demo_tmp._var(n int) returns uuid language sql stable as $f$ select id from _variantes where _variantes.n = (_var.n % (select count(*) from _variantes)) $f$;
set local search_path = demo_tmp, public, extensions;

${PERSONAS.map(usuario).join("\n")}

insert into public.horarios_asignados (persona_id, vigente_desde, horario_por_dia)
select _p('${MICAELA.auth}'), date '2000-01-01',
       (select jsonb_object_agg(d::text, jsonb_build_object('e', '14:00', 's', '18:00', 'r', 0)) from generate_series(0, 6) d);

-- Horarios de Trujillo y Arequipa; Lima no tiene: reparte en partes iguales entre quienes marcaron (D-158).
${PERSONAS.filter((p) => p.tienda !== "Tienda Lima")
  .map(
    (p) => `insert into public.horarios_asignados (persona_id, vigente_desde, horario_por_dia)
select _p('${p.auth}'), date '2000-01-01', (select jsonb_object_agg(d::text, jsonb_build_object('e', '${p.turno[0]}', 's', '${p.turno[1]}', 'r', 60)) from generate_series(0, 6) d where d <> ${p.descanso});`,
  )
  .join("\n")}
${jornadas.length ? `insert into public.jornadas (persona_id, fecha, sede_id) values ${jornadas.map((j) => `(_p('${j.auth}'), date '${j.dia}', (select sede_dynamic_id from retail.ubicaciones where nombre = 'Tienda Lima'))`).join(",\n")};` : ""}

${Object.entries(METAS)
  .map(([tienda, m]) =>
    m
      .map(
        (meta, dow) => `insert into retail.ubicacion_metas_dia (ubicacion_id, dia_semana, meta) values ((select id from retail.ubicaciones where nombre = '${tienda}'), ${dow}, ${meta})
on conflict (ubicacion_id, dia_semana) do update set meta = excluded.meta;`,
      )
      .join("\n"),
  )
  .join("\n")}

alter table retail.ventas disable trigger user;
alter table retail.venta_items disable trigger user;
${trozos(ventas, 500)
  .map((t) => `insert into retail.ventas (id, ubicacion_id, asesora_id, usuario_id, estado, es_prueba, created_at) values ${t.join(",\n")};`)
  .join("\n")}
${trozos(items, 500)
  .map((t) => `insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values ${t.join(",\n")};`)
  .join("\n")}
alter table retail.ventas enable trigger user;
alter table retail.venta_items enable trigger user;
drop schema demo_tmp cascade;
commit;
`;

psql(SQL);
console.log(`✓ ${PERSONAS.length} personas, ${ventas.length} ventas y ${items.length} líneas, del ${iso(inicioMesPasado)} a hoy (${hoy}).`);
