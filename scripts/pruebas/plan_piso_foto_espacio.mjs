#!/usr/bin/env node
/**
 * Pruebas de la foto del espacio del piso (ADR-0329; ADR-0328, actividad 12, primera entrega; migración
 * `20261006110000_plan_del_piso_foto_del_espacio.sql`) — CAYLA V2.
 *
 * QUÉ PRUEBA.
 *   · LA FOTO. `fn_registrar_espacio_piso` toma, de hoy, UNA fila por (tienda con piso de venta × categoría activa): el Taller, una tienda
 *     apagada y una tienda sin piso de venta no entran; una categoría sin nada colgado queda en 0 (no se omite); y lo colgado es EXACTAMENTE
 *     lo que muestra la pantalla (`fn_piso_plan_lectura`) y lo que cuenta `fn_existencias_base` (ADR-0270), con sus modelos distintos.
 *   · IDEMPOTENCIA. Correr la foto dos veces el mismo día no duplica ni cambia nada: queda la primera, aunque el stock se haya movido en medio.
 *   · «PISO CUADRADO». Falso sin cuadre; verdadero solo para la sede que cuadró (la otra sigue falsa).
 *   · QUIÉN. Solo el servidor toma la foto (ni `authenticated` ni `anon`); la lectura es de quien opera esa sede (el líder, todas; una colaboradora,
 *     la suya), con 42501 —nunca cero filas— para otra sede, una cuenta de afuera o una sede nula. Las ventanas de `p_desde` y el orden.
 *   · EL ESQUEMA. Ni por fuera de la función: modelos > prendas, prendas negativas, una foto de 2025, dos fotos del mismo día, una categoría o
 *     una sede que no existen.
 *
 * CÓMO. Mismo patrón que `plan_piso_grupos.mjs`: cada caso en su transacción con ROLLBACK; el stock del piso se arma DENTRO del caso con
 * `bajar_al_piso` (la función real). La sesión se simula con `request.jwt.claim.sub`. La foto la toma el dueño de la base (como el rol de servicio).
 *
 * USO
 *   pnpm pruebas:plan-piso-foto                 → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:plan-piso-foto --base otra     → contra otra base del mismo contenedor
 *   … --en-seco                                  → carga la migración dentro de cada caso (base sin ella)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const EN_SECO = process.argv.includes("--en-seco");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261006110000_plan_del_piso_foto_del_espacio.sql"), "utf8");

// Seed local: Felipe (líder) y Micaela (colaboradora de Trujillo).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const T_VENTAS_TRU = "33333333-3333-4333-8333-0000000000a1";
const AFUERA = "33333333-3333-4333-8333-0000000000d1"; // cuenta de Auth sin persona, sin colaborador, sin terminal

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Dentro de cada caso: `pg_temp.intento`, las sedes (`:tru`, `:lim`, `:taller`), una terminal de TRU y una cuenta de afuera. */
const PRELUDIO = `
begin;
${EN_SECO ? MIGRACION : ""}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;

select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select id as p_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS_TRU}', 'authenticated', 'authenticated', 't-ventas-tru@prueba.local'),
  ('${AFUERA}', 'authenticated', 'authenticated', 'afuera@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values
  (:'tru', 'Terminal Ventas TRU', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS_TRU}');
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const COMO_POSTGRES = `reset role;\nset local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n`;

let fallas = 0;
let casos = 0;
function registrar(nombre, obtenido, esperado) {
  casos++;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  registrar(nombre, obtenido, esperado);
}

/** Baja al piso de Trujillo 3 de cada una de las tallas que tienen 3 o más en el almacén (la función real, como Felipe). */
const COLGAR_EN_TRU = `${como(FELIPE)}
select retail.bajar_al_piso(:'tru',
  (select jsonb_agg(jsonb_build_object('variante_id', t->>'variante_id', 'cantidad', 3))
     from jsonb_array_elements(retail.fn_piso_plan_lectura(:'tru') -> 'tallas') t where (t->>'almacen_libre')::int >= 3),
  gen_random_uuid()) is not null;
${COMO_POSTGRES}`;
/** La foto, tomada por el dueño de la base (el rol de servicio que usa el cron). Silenciosa: su respuesta no se imprime. */
const FOTO = `select retail.fn_registrar_espacio_piso() as _foto \\gset`;
/** La misma foto, pero imprime la respuesta (para los casos que la leen). */
const FOTO_VISIBLE = `select retail.fn_registrar_espacio_piso()::text;`;

// ===========================================================================
// 1. LA FOTO
// ===========================================================================

caso(
  "toma UNA fila por (tienda con piso × categoría activa): 2 tiendas × las categorías activas; el Taller no entra",
  `${FOTO}
   select (select count(distinct ubicacion_id) from retail.espacio_piso) || ',' ||
          (select count(*) from retail.espacio_piso) = (2 * (select count(*) from retail.categorias where activo))::text || '' as x;
   select count(*) filter (where ubicacion_id = :'taller') from retail.espacio_piso;
   select count(*) = (select count(*) from retail.categorias where activo) from retail.espacio_piso where ubicacion_id = :'tru';`,
  (s) => s.split("\n").slice(-2).join("|") === "0|t"
);
caso(
  "devuelve {fecha, sedes, filas, ya_registradas}: la fecha es la de HOY en Lima",
  `${FOTO_VISIBLE}`,
  (s) => /^\{"fecha": "\d{4}-\d{2}-\d{2}", "filas": \d+, "sedes": 2, "ya_registradas": 0\}$/.test(s)
);
caso(
  "lo colgado de cada categoría es EXACTAMENTE lo que muestra la pantalla (fn_piso_plan_lectura) y lo que cuenta fn_existencias_base",
  `${COLGAR_EN_TRU}
   ${FOTO}
   ${como(FELIPE)}
   -- Lo de la pantalla: la lectura del motor del piso, por categoría.
   create temp table pantalla as
     select (t->>'categoria_id')::uuid as categoria_id, sum(greatest((t->>'piso_libre')::int, 0)) as prendas
       from jsonb_array_elements(retail.fn_piso_plan_lectura(:'tru') -> 'tallas') t group by 1;
   ${COMO_POSTGRES}
   -- Lo de la fórmula de stock, directo, con los modelos distintos.
   create temp table formula as
     select p.categoria_id, sum(greatest(e.piso_libre, 0)) as prendas, count(distinct e.producto_id) filter (where e.piso_libre > 0) as modelos
       from retail.fn_existencias_base(:'tru', null) e join retail.productos p on p.id = e.producto_id group by 1;
   select 'prendas distintas de la pantalla:', count(*) from retail.espacio_piso f left join pantalla p on p.categoria_id = f.categoria_id
     where f.ubicacion_id = :'tru' and f.prendas is distinct from coalesce(p.prendas, 0);
   select 'prendas distintas de la fórmula:', count(*) from retail.espacio_piso f left join formula p on p.categoria_id = f.categoria_id
     where f.ubicacion_id = :'tru' and f.prendas is distinct from coalesce(p.prendas, 0);
   select 'modelos distintos de la fórmula:', count(*) from retail.espacio_piso f left join formula p on p.categoria_id = f.categoria_id
     where f.ubicacion_id = :'tru' and f.modelos is distinct from coalesce(p.modelos, 0);
   select 'hay algo colgado:', coalesce(sum(prendas), 0) > 0 from retail.espacio_piso where ubicacion_id = :'tru';`,
  (s) => s.split("\n").filter((l) => l.includes(":")).map((l) => l.split("|")[1]).join(",") === "0,0,0,t"
);
caso(
  "una categoría sin nada colgado queda en 0 (no se omite): «se acabó» no es lo mismo que «no se fotografió»",
  `${FOTO}
   select count(*) filter (where prendas = 0 and modelos = 0) > 0, count(*) = (select count(*) from retail.categorias where activo)
     from retail.espacio_piso where ubicacion_id = :'lim';`,
  "t|t"
);
caso(
  "no fotografía una tienda apagada, una tienda sin piso de venta ni el Taller",
  `insert into retail.ubicaciones (nombre, tipo, activo) values ('Tienda apagada', 'tienda', false), ('Tienda sin piso', 'tienda', true);
   select id as apagada from retail.ubicaciones where nombre = 'Tienda apagada' \\gset
   select id as sin_piso from retail.ubicaciones where nombre = 'Tienda sin piso' \\gset
   ${FOTO}
   select count(*) from retail.espacio_piso where ubicacion_id in (:'apagada', :'sin_piso', :'taller');
   select count(distinct ubicacion_id) from retail.espacio_piso;`,
  (s) => s.split("\n").slice(-2).join("|") === "0|2"
);

// ===========================================================================
// 2. IDEMPOTENCIA
// ===========================================================================

caso(
  "correrla dos veces el mismo día no duplica nada: ya_registradas = filas, y no cambia ni una fila",
  `${FOTO}
   create temp table antes as select ubicacion_id, categoria_id, prendas, modelos, tomada_en from retail.espacio_piso;
   ${FOTO_VISIBLE}
   select (select count(*) from retail.espacio_piso) = (select count(*) from antes),
          (select count(*) from retail.espacio_piso e join antes a using (ubicacion_id, categoria_id) where e.tomada_en = a.tomada_en and e.prendas = a.prendas);`,
  (s) => {
    const l = s.split("\n");
    const resp = JSON.parse(l[0]);
    return resp.ya_registradas === resp.filas && resp.filas > 0 && l[1].startsWith("t|");
  }
);
caso(
  "si el stock se mueve entre las dos corridas, queda la PRIMERA foto del día (no hay dos fotos «buenas»)",
  `${FOTO}
   select coalesce(sum(prendas), 0) from retail.espacio_piso where ubicacion_id = :'tru';
   ${COLGAR_EN_TRU}
   ${FOTO}
   select coalesce(sum(prendas), 0) from retail.espacio_piso where ubicacion_id = :'tru';
   select coalesce(sum(greatest(piso_libre, 0)), 0) from retail.fn_existencias_base(:'tru', null);`,
  (s) => {
    const [foto1, colgo, foto2, vivo] = s.split("\n");
    // La foto no cambió (la primera del día) aunque el piso real sí (se colgó más después).
    return colgo === "t" && foto1 === foto2 && Number(vivo) > Number(foto1);
  }
);

// ===========================================================================
// 3. «PISO CUADRADO»
// ===========================================================================

{
  // La tabla de cuadres es de la actividad 3 de ADR-0328 (PR #792). Si esta base todavía no la tiene, el caso pone una con las columnas que usa
  // (dentro de la transacción: el ROLLBACK la borra), así el mismo caso vale antes y después.
  const MESA = `
do $$ begin
  if to_regclass('retail.cuadres_piso') is null then
    create table retail.cuadres_piso (id uuid primary key default gen_random_uuid(), ubicacion_id uuid not null, persona_id uuid not null,
      token_cliente uuid not null, huella text not null, escaneo_desde timestamptz not null, resumen jsonb not null,
      nota text, created_at timestamptz not null default now());
  end if;
end $$;
insert into retail.cuadres_piso (ubicacion_id, persona_id, token_cliente, huella, escaneo_desde, resumen, nota, created_at)
  values (:'tru', :'p_felipe', gen_random_uuid(), md5('a'), '2026-10-01 09:00-05', '{}', null, '2026-10-01 10:00-05');
`;
  caso("sin ningún cuadre, la foto sale «sin cuadrar» en todas las sedes", `${FOTO}\nselect bool_or(piso_cuadrado) from retail.espacio_piso;`, (s) => s.split("\n").pop() === "f");
  caso(
    "la sede que ya cuadró su piso sale «cuadrada» y la otra sigue «sin cuadrar»",
    `${MESA}\n${FOTO}
     select bool_and(piso_cuadrado) from retail.espacio_piso where ubicacion_id = :'tru';
     select bool_or(piso_cuadrado) from retail.espacio_piso where ubicacion_id = :'lim';`,
    (s) => s.split("\n").slice(-2).join("|") === "t|f"
  );
}

// ===========================================================================
// 4. QUIÉN
// ===========================================================================

caso(
  "ni `authenticated` ni `anon` pueden tomar la foto (es del servidor), y la tabla directo no se lee ni por el líder",
  `${como(FELIPE)} set local role authenticated;
   select split_part(pg_temp.intento('select retail.fn_registrar_espacio_piso()'), '|', 1);
   select split_part(pg_temp.intento('select count(*) from retail.espacio_piso'), '|', 1);
   reset role; set local role anon;
   select split_part(pg_temp.intento('select retail.fn_registrar_espacio_piso()'), '|', 1);`,
  "42501\n42501\n42501"
);
caso(
  "el LÍDER lee las fotos de cualquier sede; la COLABORADORA de Trujillo lee la suya y NO la de Lima (42501, no cero filas)",
  `${FOTO}
   ${como(FELIPE)}
   select (select count(*) from retail.fn_espacio_piso(:'tru')) = (select count(*) from retail.categorias where activo), (select count(*) from retail.fn_espacio_piso(:'lim')) > 0;
   ${como(MICAELA)}
   select (select count(*) from retail.fn_espacio_piso(:'tru')) > 0;
   select split_part(pg_temp.intento(format('select * from retail.fn_espacio_piso(%L)', :'lim')), '|', 1);`,
  "t|t\nt\n42501"
);
caso(
  "una TERMINAL lee la de su tienda; una cuenta de AFUERA o una sede nula reciben 42501",
  `${FOTO}
   ${como(T_VENTAS_TRU)}
   select count(*) > 0 from retail.fn_espacio_piso(:'tru');
   ${como(AFUERA)}
   select split_part(pg_temp.intento(format('select * from retail.fn_espacio_piso(%L)', :'tru')), '|', 1);
   ${como(FELIPE)}
   select split_part(pg_temp.intento('select * from retail.fn_espacio_piso(null)'), '|', 1);`,
  "t\n42501\n42501"
);
caso(
  "la lectura trae por defecto las últimas 26 semanas, de la más reciente a la más antigua; `p_desde` abre la ventana",
  `insert into retail.espacio_piso (ubicacion_id, fecha, categoria_id, prendas, modelos, piso_cuadrado)
     select :'tru', retail.fn_hoy_lima() - d, (select id from retail.categorias where activo order by nombre limit 1), 5, 2, true from unnest(array[200, 10, 0]) d;
   ${como(FELIPE)}
   select count(*) from retail.fn_espacio_piso(:'tru');
   select count(*) from retail.fn_espacio_piso(:'tru', retail.fn_hoy_lima() - 365);
   select string_agg((retail.fn_hoy_lima() - fecha)::text, ',' order by fecha desc) from retail.fn_espacio_piso(:'tru', retail.fn_hoy_lima() - 365);`,
  "2\n3\n0,10,200"
);

// ===========================================================================
// 5. EL ESQUEMA (ni siquiera por fuera de la función)
// ===========================================================================

{
  const probar = (sql) => `select rtrim(array_to_string((string_to_array(pg_temp.intento($q$${sql}$q$), '|'))[1:2], '|'), '|');`;
  caso(
    "candados de la tabla: más modelos que prendas, prendas negativas, una foto de 2025, dos fotos del mismo día, una categoría o una sede que no existen",
    [
      probar(`insert into retail.espacio_piso (ubicacion_id, fecha, categoria_id, prendas, modelos, piso_cuadrado) values ('__TRU__', date '2026-10-01', '__CAT__', 2, 3, true)`),
      probar(`insert into retail.espacio_piso (ubicacion_id, fecha, categoria_id, prendas, modelos, piso_cuadrado) values ('__TRU__', date '2026-10-01', '__CAT__', -1, 0, true)`),
      probar(`insert into retail.espacio_piso (ubicacion_id, fecha, categoria_id, prendas, modelos, piso_cuadrado) values ('__TRU__', date '2025-12-31', '__CAT__', 1, 1, true)`),
      probar(`insert into retail.espacio_piso (ubicacion_id, fecha, categoria_id, prendas, modelos, piso_cuadrado) values ('__TRU__', date '2026-10-01', gen_random_uuid(), 1, 1, true)`),
      probar(`insert into retail.espacio_piso (ubicacion_id, fecha, categoria_id, prendas, modelos, piso_cuadrado) values (gen_random_uuid(), date '2026-10-01', '__CAT__', 1, 1, true)`),
    ]
      .join("\n")
      .replaceAll("'__TRU__'", "$q$ || quote_literal(:'tru') || $q$")
      .replaceAll("'__CAT__'", "$q$ || quote_literal((select id from retail.categorias where activo order by nombre limit 1)) || $q$"),
    ["23514", "23514", "23514", "23503", "23503"].join("\n")
  );
  caso(
    "dos fotos del mismo día para la misma sede y categoría: llave primaria (23505)",
    [
      `insert into retail.espacio_piso (ubicacion_id, fecha, categoria_id, prendas, modelos, piso_cuadrado)
         select :'tru', date '2026-10-01', id, 1, 1, true from retail.categorias where activo order by nombre limit 1;`,
      `select split_part(pg_temp.intento($q$insert into retail.espacio_piso (ubicacion_id, fecha, categoria_id, prendas, modelos, piso_cuadrado) select ubicacion_id, fecha, categoria_id, 9, 1, false from retail.espacio_piso$q$), '|', 1);`,
    ].join("\n"),
    "23505"
  );
}

// ===========================================================================
// 6. LA MIGRACIÓN
// ===========================================================================

caso(
  "la migración se puede pegar dos veces seguidas: misma tabla, mismas funciones, y no toca las fotos ya tomadas",
  `${FOTO}
   select count(*) from retail.espacio_piso \\gset
   ${MIGRACION}
   select (select count(*) from retail.espacio_piso) = (select count(*) from retail.categorias where activo) * 2;`,
  (s) => s.split("\n").pop() === "t"
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas > 0) process.exit(1);
