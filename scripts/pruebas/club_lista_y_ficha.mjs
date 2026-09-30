#!/usr/bin/env node
/**
 * Pruebas de la tanda 1f del club de clientas (ADR-0288, «Actualización 2026-09-30 (f)»; migración
 * `20260930210000_club_paso1f_lista_y_ficha.sql`): la lista de /clientas y la ficha, como el spike del club.
 *
 * EL PROBLEMA. La lista eran las últimas 50 fichas y sus filtros miraban solo esas 50. «Su sede» (CL-6), «última compra» y
 * «frecuente» (D-103) salen de las ventas de cada clienta, con compra NETA (CL-25: una venta devuelta entera no cuenta; un
 * cambio sí). La ficha suma la historia del permiso (CL-26) y las preferencias (CL-5), solo de una socia y solo con valores
 * del catálogo. La base tiene que hacerlo cumplir, no la pantalla.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`;
 * cuentas del seed: Felipe, líder y Admin; Micaela, integrante de Trujillo). Las fichas de prueba llevan «Zlf» en el nombre,
 * así cada caso mira solo las suyas aunque el seed traiga otras:
 *   a. Su sede: la de más compras netas en 12 meses (2 en Trujillo y 1 en Lima → Trujillo, «2 de 3»); con empate, la de su
 *      compra más reciente (en los dos sentidos); una compra de hace más de 12 meses no cuenta para la sede pero sí es su
 *      última compra si no hay otra; sin compras, sin sede y en cero; una ficha que no existe, sin fila.
 *   b. Frecuente (3 compras netas en 6 meses): con una devuelta entera (aprobada) ya no; con una devolución parcial, una
 *      pendiente o un cambio, sí; dos devoluciones parciales aprobadas que suman todo, no; anulada, de prueba o de hace 7
 *      meses, no cuentan.
 *   c. Cada filtro de la lista (todas, socias, frecuentes, con_publicidad, sin_publicidad, sin_celular, cumplen_este_mes,
 *      archivadas) y un filtro desconocido (22023 filtro_invalido).
 *   d. Paginado: páginas de 2 sin repetir ni saltar, `total` en cada fila, de la compra más reciente a la más vieja; límites
 *      fuera de rango se acotan.
 *   e. El término busca como `buscar_clienta` (documento, celular con +51 y espacios, código de socia, parte del nombre).
 *   f. `fn_cifras_clientas` = el `total` de la lista en cada filtro, sobre toda la base.
 *   g. Sin el módulo «Clientas»: las seis funciones → 42501 clientas_sin_modulo; `anon` no las ejecuta; la API no lee
 *      `club_etiquetas` ni ejecuta los ayudantes.
 *   h. Preferencias: se guardan en el orden del catálogo y sin repetidos, suben la versión y dejan rastro; fuera del
 *      catálogo, grupo desconocido o forma rara → preferencia_invalida; versión vieja → PT409; no socia, archivada,
 *      anonimizada, unida o inexistente → su hint; sin cambios, la misma versión y sin rastro; un valor apagado no se agrega
 *      pero se conserva si ya estaba; anonimizar y unir las vacían; el esquema rechaza preferencias en una no socia o que
 *      no son un objeto; un valor del catálogo no se renombra ni se borra (club_etiqueta_fija) y `fn_club_etiquetas` trae
 *      solo los activos, en orden.
 *   i. Historia del permiso: en orden, con tienda, quién («Felipe A.»), texto y versión; el legado sin quién; los eventos
 *      de una ficha que se le unió, marcados `de_otra_ficha`.
 *   j. Estructura y pegado: md5 «después» de la sección 0 = vivos y cuerpos = archivo; pegar dos veces deja lo mismo; con
 *      una función cambiada en vivo aborta sin tocar nada; sin la tanda 1b aborta; ningún `into` en un texto entre
 *      comillas fuera de `$…$`, ni `drop trigger`, ni políticas; las lecturas empiezan por el módulo, la que guarda además
 *      firma con el responsable del combo.
 *
 * USO
 *   pnpm pruebas:club-lista-y-ficha                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-lista-y-ficha --base cayla_x    → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260930210000_club_paso1f_lista_y_ficha.sql"), "utf8");

// La tabla del candado de versión de la sección 0: firma → md5 normalizado «antes» (null: no existía) y «después».
const VERSIONES = [
  ...MIGRACION.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+(null::text|'([0-9a-f]{32})'),\s+'([0-9a-f]{32})'\)/g),
].map((m) => ({ firma: m[1], antes: m[3] ?? null, despues: m[4] }));
if (VERSIONES.length !== 11) {
  console.error(`✗ La tabla de versiones de la migración debería tener 11 filas y tiene ${VERSIONES.length}.`);
  process.exit(1);
}

// Las funciones que crea el archivo (cuerpo entre `$$` y `$$`), para comparar con las vivas.
const CREADAS = [...MIGRACION.matchAll(/create or replace function (retail\.[a-z_]+)\(/g)].map((m) => m[1]);
/** El cuerpo (lo que queda entre `$$` y `$$`) con que el archivo crea una función: es su `prosrc` vivo. */
const cuerpoDe = (nombre) => {
  const ini = MIGRACION.indexOf(`create or replace function ${nombre}(`);
  const a = MIGRACION.indexOf("$$", ini) + 2;
  return MIGRACION.slice(a, MIGRACION.indexOf("$$", a));
};

// Las que llama la web (EXECUTE solo para authenticated) y los ayudantes internos (sin EXECUTE para la API).
const LISTA = "retail.fn_clientas_lista(text,text,integer,integer)";
const DE_LA_WEB = [
  LISTA,
  "retail.fn_cifras_clientas()",
  "retail.fn_clienta_su_sede(uuid)",
  "retail.fn_clienta_permisos(uuid)",
  "retail.fn_club_etiquetas()",
  "retail.guardar_preferencias_clienta(uuid,jsonb,integer)",
];
const AYUDANTES = [
  "retail.fn_venta_devuelta_entera(uuid)",
  "retail.fn_club_compras_netas(uuid)",
  "retail.fn_club_resumen_compras(uuid)",
  "retail.fn_clientas_preferencias_sin_club()",
  "retail.fn_club_etiquetas_fijas()",
];
const FILTROS = ["todas", "socias", "frecuentes", "con_publicidad", "sin_publicidad", "sin_celular", "cumplen_este_mes", "archivadas"];

// Seed local: Felipe (líder y Admin), Micaela (integrante de Trujillo; con Clientas en su rol, como en producción).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Lo que todo caso necesita, dentro de su transacción: ayudantes para armar compras (como postgres) y las cuentas. */
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
-- Intenta una sentencia y devuelve «SQLSTATE|hint» si el hint es uno de los nuestros, o «SQLSTATE|mensaje» si no, o
-- SIN_ERROR. No es security definer: corre con los permisos de quien la llama.
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_msg end;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated, anon;

-- Una compra de la clienta en una sede, hace tanto tiempo, con \`p_cant\` unidades de una prenda (y otra línea si
-- \`p_lineas\` = 2). Directo en las tablas: esta prueba mira cómo se CUENTAN las compras, no cómo se cobran.
create function pg_temp.venta(p_cli uuid, p_ubic uuid, p_hace interval, p_cant integer default 1, p_lineas integer default 1,
                              p_estado text default 'completada', p_prueba boolean default false) returns uuid
language plpgsql as $f$
declare v uuid;
begin
  insert into retail.ventas (ubicacion_id, cliente_id, created_at, estado, anulado_en, motivo_anulacion, es_prueba)
  values (p_ubic, p_cli, now() - p_hace, p_estado,
          case when p_estado = 'anulada' then now() end, case when p_estado = 'anulada' then 'prueba' end, p_prueba)
  returning id into v;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
  select v, va.id, p_cant, 100, 50 from retail.variantes va order by va.id limit p_lineas;
  return v;
end;
$f$;
-- Devuelve \`p_cant\` unidades de CADA línea de la venta, en una devolución con ese estado.
create function pg_temp.devolver(p_venta uuid, p_cant integer, p_estado text default 'aprobada') returns uuid
language plpgsql as $f$
declare d uuid;
begin
  insert into retail.devoluciones (venta_id, ubicacion_id, estado, motivo, aprobado_en)
  select p_venta, v.ubicacion_id, p_estado, 'prueba', case when p_estado <> 'pendiente' then now() end
    from retail.ventas v where v.id = p_venta
  returning id into d;
  insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion)
  select d, vi.id, p_cant, 'vendible' from retail.venta_items vi where vi.venta_id = p_venta;
  return d;
end;
$f$;
-- Un cambio de talla de la primera prenda de la venta (la venta sigue).
create function pg_temp.cambiar(p_venta uuid) returns void language sql as $f$
  insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, motivo, condicion)
  select vi.id, v.ubicacion_id, (select va.id from retail.variantes va where va.id <> vi.variante_id order by va.id limit 1), 1, 0, 'talla_chica', 'vendible'
    from retail.venta_items vi join retail.ventas v on v.id = vi.venta_id
   where vi.venta_id = p_venta order by vi.id limit 1;
$f$;

-- Una persona firma a su nombre, como hoy en el mostrador; y la integrante, con Clientas (así están en producción).
update retail.configuracion_empresa set exige_responsable = false;
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'clientas' on conflict do nothing;
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select extract(month from (now() at time zone 'America/Lima'))::int as mes_lima \\gset
select case when extract(month from (now() at time zone 'America/Lima'))::int = 12 then 1 else extract(month from (now() at time zone 'America/Lima'))::int + 1 end as otro_mes \\gset
`;

/** Cambia de cuenta (sin responsable en el combo). */
const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const comoAnon = `reset role;\nset local request.jwt.claim.role = 'anon';\nset local request.jwt.claims = '{"role":"anon"}';\nset local role anon;\n`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;
/** Como `intento`, con variables de psql: psql no las reemplaza entre $q$, así que van por `format` (%L). */
const intentoCon = (sql, ...vars) => `select pg_temp.intento(format($q$${sql}$q$, ${vars.join(", ")}));\n`;
const lit = (v) => (v === null ? "null" : `'${v}'`);
/** Alta de ficha por la RPC (la cuenta ya elegida). */
const ALTA = (alias, { numero = null, nombre = null, celular = null } = {}) =>
  `select retail.registrar_clienta(p_documento_tipo => 'dni', p_documento_numero => ${lit(numero)}, p_nombre => ${lit(nombre)}, p_telefono_whatsapp => ${lit(celular)}) as ${alias} \\gset\n`;
/** Unirla al club (la cuenta ya elegida): deja :<alias>_codigo. */
const UNIR = (alias, celular, sede = "ubic") =>
  `select codigo_club as ${alias}_codigo from retail.unirse_al_club(p_clienta_id => :'${alias}', p_telefono_whatsapp => '${celular}', p_ubicacion_id => :'${sede}') \\gset\n`;
/** Una socia lista: alta con DNI, nombre y celular, y su «sí» en caja. */
const SOCIA = (alias, numero, nombre, celular) => ALTA(alias, { numero, nombre, celular }) + UNIR(alias, celular);
/** Una compra (como postgres; vuelve a la cuenta que estaba no hace falta: los casos arman todo antes de leer). */
const COMPRA = (alias, sede, hace, extra = "") => `select pg_temp.venta(:'${alias}', :'${sede}', '${hace}'${extra}) as _v \\gset\n`;
/** Los nombres que devuelve la lista para un término y un filtro, ordenados alfabéticamente, en una línea. */
/** Corre un día hacia atrás los eventos que ya tienen estas fichas: así lo que se registre después es «más reciente» (en
 *  una transacción todos tienen la misma hora, now()). Con el disparador de solo agregar apagado dentro de la transacción. */
const ESPACIAR_TODOS = (alias) => `reset role;
alter table retail.club_permisos disable trigger club_permisos_solo_agregar;
update retail.club_permisos e set created_at = e.created_at - make_interval(days => x.dias)
  from (select id, (count(*) over (partition by clienta_id) - row_number() over (partition by clienta_id order by case when finalidad = 'club' then 0 when accion = 'otorga' then 1 else 2 end, id) + 1)::int as dias
          from retail.club_permisos where clienta_id in (${alias.map((a) => `:'${a}'`).join(", ")})) x
 where x.id = e.id;
alter table retail.club_permisos enable trigger club_permisos_solo_agregar;
`;
const NOMBRES = (termino, filtro) =>
  `select coalesce(string_agg(nombre, ',' order by nombre), '(ninguna)') from retail.fn_clientas_lista('${termino}', '${filtro}', 200, 0);\n`;

const md5Norm = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;

let fallas = 0;
let casos = 0;
function registrar(nombre, bien, obtenido, esperadoTexto) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperadoTexto.split("\n").join("\n              ")}\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperadoCaso) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperadoCaso === "function" ? esperadoCaso(obtenido) : obtenido === esperadoCaso;
  registrar(nombre, bien, obtenido, typeof esperadoCaso === "function" ? "(condición)" : esperadoCaso);
}
/** Un chequeo sin base de datos (lee el archivo). */
function chequeo(nombre, obtenido, esperado) {
  registrar(nombre, obtenido === esperado, obtenido, esperado);
}

// =====================================================================================================================
// a. Su sede (CL-6)
// =====================================================================================================================
const SU_SEDE = (alias) =>
  `select coalesce(su_sede, '—'), compras_sede, compras_12m, compras_6m, es_frecuente from retail.fn_clienta_su_sede(:'${alias}');\n`;
caso(
  "(a) 2 compras en Trujillo y 1 en Lima → su sede es Trujillo, «2 de 3»; su última compra es la más reciente (la de Lima)",
  como(FELIPE) + ALTA("c", { numero: "71550101", nombre: "Zlf Sede Dos" }) +
    `reset role;\n` +
    COMPRA("c", "tru", "10 days") + COMPRA("c", "tru", "40 days") + COMPRA("c", "ubic", "2 days") +
    como(FELIPE) + SU_SEDE("c") +
    `select ultima_compra::date = (now() - interval '2 days')::date from retail.fn_clienta_su_sede(:'c');\n`,
  "Tienda Trujillo|2|3|3|t\nt"
);
caso(
  "(a) empate (1 y 1): gana la sede de su compra MÁS RECIENTE, en los dos sentidos (no el nombre de la tienda)",
  como(FELIPE) + ALTA("c1", { numero: "71550102", nombre: "Zlf Empate Uno" }) + ALTA("c2", { numero: "71550103", nombre: "Zlf Empate Dos" }) +
    `reset role;\n` +
    COMPRA("c1", "tru", "20 days") + COMPRA("c1", "ubic", "5 days") +
    COMPRA("c2", "ubic", "20 days") + COMPRA("c2", "tru", "5 days") +
    como(FELIPE) + SU_SEDE("c1") + SU_SEDE("c2"),
  "Tienda Lima|1|2|2|f\nTienda Trujillo|1|2|2|f"
);
caso(
  "(a) 12 meses: 2 compras en Lima hace 13 meses y 1 en Trujillo hace un mes → Trujillo «1 de 1»; sin compras recientes, sin sede pero con su última compra",
  como(FELIPE) + ALTA("c", { numero: "71550104", nombre: "Zlf Doce Meses" }) + ALTA("v", { numero: "71550105", nombre: "Zlf Solo Vieja" }) +
    `reset role;\n` +
    COMPRA("c", "ubic", "13 months") + COMPRA("c", "ubic", "13 months 3 days") + COMPRA("c", "tru", "1 month") +
    COMPRA("v", "ubic", "14 months") +
    como(FELIPE) + SU_SEDE("c") + SU_SEDE("v") +
    `select su_sede is null, ultima_compra::date = (now() - interval '14 months')::date from retail.fn_clienta_su_sede(:'v');\n`,
  "Tienda Trujillo|1|1|1|f\n—|0|0|0|f\nt|t"
);
caso(
  "(a) sin compras: sin sede, todo en cero y sin última compra; una ficha que no existe no trae fila",
  como(FELIPE) + ALTA("c", { numero: "71550106", nombre: "Zlf Sin Compras" }) + SU_SEDE("c") +
    `select ultima_compra is null from retail.fn_clienta_su_sede(:'c');
select count(*) from retail.fn_clienta_su_sede(gen_random_uuid());\n`,
  "—|0|0|0|f\nt\n0"
);

// =====================================================================================================================
// b. Frecuente con compra neta (CL-25)
// =====================================================================================================================
caso(
  "(b) 3 compras en 6 meses → frecuente; si una se devuelve ENTERA (aprobada) ya no cuenta: 2 y deja de ser frecuente (la ficha y la lista dicen lo mismo)",
  como(FELIPE) + ALTA("c", { numero: "71550201", nombre: "Zlf Frecuente Devuelta" }) + `reset role;\n` +
    COMPRA("c", "ubic", "5 days") + COMPRA("c", "ubic", "20 days") + `select pg_temp.venta(:'c', :'ubic', '40 days', 2) as v3 \\gset\n` +
    como(FELIPE) + SU_SEDE("c") +
    `reset role;\nselect pg_temp.devolver(:'v3', 2) as _d \\gset\n` +
    como(FELIPE) + SU_SEDE("c") +
    `select compras_6m, es_frecuente from retail.fn_clientas_lista('Zlf Frecuente Devuelta', 'todas', 10, 0);\n` +
    `select count(*) from retail.fn_clientas_lista('Zlf Frecuente Devuelta', 'frecuentes', 10, 0);\n`,
  "Tienda Lima|3|3|3|t\nTienda Lima|2|2|2|f\n2|f\n0"
);
caso(
  "(b) sigue frecuente con una devolución PARCIAL, una devolución PENDIENTE o un CAMBIO (la venta sigue siendo suya)",
  como(FELIPE) + ALTA("p", { numero: "71550202", nombre: "Zlf Parcial" }) + ALTA("q", { numero: "71550203", nombre: "Zlf Pendiente" }) +
    ALTA("r", { numero: "71550204", nombre: "Zlf Cambio" }) + `reset role;\n` +
    COMPRA("p", "ubic", "3 days") + COMPRA("p", "ubic", "9 days") + `select pg_temp.venta(:'p', :'ubic', '30 days', 2) as vp \\gset\nselect pg_temp.devolver(:'vp', 1) as _d \\gset\n` +
    COMPRA("q", "ubic", "3 days") + COMPRA("q", "ubic", "9 days") + `select pg_temp.venta(:'q', :'ubic', '30 days', 1) as vq \\gset\nselect pg_temp.devolver(:'vq', 1, 'pendiente') as _d \\gset\n` +
    COMPRA("r", "ubic", "3 days") + COMPRA("r", "ubic", "9 days") + `select pg_temp.venta(:'r', :'ubic', '30 days', 1) as vr \\gset\nselect pg_temp.cambiar(:'vr');\n` +
    como(FELIPE) + SU_SEDE("p") + SU_SEDE("q") + SU_SEDE("r"),
  "Tienda Lima|3|3|3|t\nTienda Lima|3|3|3|t\nTienda Lima|3|3|3|t"
);
caso(
  "(b) dos devoluciones parciales APROBADAS que suman toda la venta (2 líneas) → devuelta entera, no cuenta; una RECHAZADA no devuelve nada",
  como(FELIPE) + ALTA("c", { numero: "71550205", nombre: "Zlf Dos Parciales" }) + ALTA("x", { numero: "71550206", nombre: "Zlf Rechazada" }) + `reset role;\n` +
    COMPRA("c", "ubic", "3 days") + COMPRA("c", "ubic", "9 days") +
    `select pg_temp.venta(:'c', :'ubic', '30 days', 2, 2) as v3 \\gset
select pg_temp.devolver(:'v3', 1) as _d1 \\gset
select retail.fn_venta_devuelta_entera(:'v3');
select pg_temp.devolver(:'v3', 1) as _d2 \\gset
select retail.fn_venta_devuelta_entera(:'v3');
` +
    COMPRA("x", "ubic", "3 days") + COMPRA("x", "ubic", "9 days") + `select pg_temp.venta(:'x', :'ubic', '30 days', 1) as vx \\gset\nselect pg_temp.devolver(:'vx', 1, 'rechazada') as _d \\gset\n` +
    como(FELIPE) + SU_SEDE("c") + SU_SEDE("x"),
  "f\nt\nTienda Lima|2|2|2|f\nTienda Lima|3|3|3|t"
);
caso(
  "(b) una venta ANULADA, una de PRUEBA y una de hace 7 meses no cuentan para frecuente (la de 7 meses sí para los 12 meses)",
  como(FELIPE) + ALTA("c", { numero: "71550207", nombre: "Zlf No Cuentan" }) + `reset role;\n` +
    COMPRA("c", "ubic", "3 days") + COMPRA("c", "ubic", "9 days") +
    COMPRA("c", "ubic", "10 days", ", 1, 1, 'anulada'") + COMPRA("c", "ubic", "11 days", ", 1, 1, 'completada', true") +
    COMPRA("c", "ubic", "7 months") +
    como(FELIPE) + SU_SEDE("c"),
  "Tienda Lima|3|3|2|f"
);

// =====================================================================================================================
// c. Filtros de la lista
// =====================================================================================================================
// Cinco fichas: A socia con publicidad, frecuente y cumple este mes; B socia sin publicidad (cumple otro mes); C sin
// celular; D identificada con celular y frecuente (no socia); E archivada.
const GRUPO_FILTROS =
  como(FELIPE) +
  SOCIA("a", "71550301", "Zlf Filtro A", "966550301") +
  `select retail.registrar_mensaje_publicidad(:'a', '966550301', :'ubic') as _p \\gset\n` +
  SOCIA("b", "71550302", "Zlf Filtro B", "966550302") +
  ALTA("c", { numero: "71550303", nombre: "Zlf Filtro C" }) +
  ALTA("d", { numero: "71550304", nombre: "Zlf Filtro D", celular: "966550304" }) +
  ALTA("e", { numero: "71550305", nombre: "Zlf Filtro E", celular: "966550305" }) +
  `select retail.archivar_clienta(:'e', 'prueba', false, null) as _x \\gset\n` +
  `reset role;
update retail.clientas set cumple_dia = 5, cumple_mes = :mes_lima where id = :'a';
update retail.clientas set cumple_dia = 5, cumple_mes = :otro_mes where id = :'b';
` +
  COMPRA("a", "ubic", "2 days") + COMPRA("a", "ubic", "12 days") + COMPRA("a", "tru", "22 days") +
  COMPRA("d", "tru", "2 days") + COMPRA("d", "tru", "12 days") + COMPRA("d", "tru", "22 days") +
  como(FELIPE);
caso(
  "(c) cada filtro trae justo las suyas: todas (activas), socias, frecuentes (compra neta, socia o no), con y sin publicidad, sin celular, cumplen este mes (Lima) y archivadas",
  GRUPO_FILTROS + FILTROS.map((f) => NOMBRES("Zlf Filtro", f)).join(""),
  [
    "Zlf Filtro A,Zlf Filtro B,Zlf Filtro C,Zlf Filtro D",
    "Zlf Filtro A,Zlf Filtro B",
    "Zlf Filtro A,Zlf Filtro D",
    "Zlf Filtro A",
    "Zlf Filtro B",
    "Zlf Filtro C",
    "Zlf Filtro A",
    "Zlf Filtro E",
  ].join("\n")
);
caso(
  "(c) «Pidió BAJA» (baja_en): una socia cuya última palabra sobre la publicidad fue su BAJA; no si la recuperó, ni si la perdió por cambiar de celular, ni si nunca la pidió",
  como(FELIPE) +
    SOCIA("b1", "71550311", "Zlf Baja Uno", "966550311") + SOCIA("b2", "71550312", "Zlf Baja Dos", "966550312") +
    SOCIA("b3", "71550313", "Zlf Baja Tres", "966550313") + SOCIA("b4", "71550314", "Zlf Baja Cuatro", "966550314") +
    `select retail.registrar_mensaje_publicidad(:'b1', '966550311', :'ubic') as _1 \\gset
select retail.registrar_baja_whatsapp('966550311', :'ubic') as _2 \\gset
select retail.registrar_mensaje_publicidad(:'b2', '966550312', :'ubic') as _3 \\gset
select retail.registrar_baja_whatsapp('966550312', :'ubic') as _4 \\gset
select retail.registrar_mensaje_publicidad(:'b3', '966550313', :'ubic') as _5 \\gset
select retail.editar_clienta(:'b3', 'dni', '71550313', 'Zlf Baja Tres', '966550399', null, null, null, null, null) as _6 \\gset
` + ESPACIAR_TODOS(["b1", "b2", "b3", "b4"]) + como(FELIPE) +
    `select retail.registrar_mensaje_publicidad(:'b2', '966550312', :'ubic') as _7 \\gset\n` +
    `select string_agg(nombre || ':' || (baja_en is not null), ',' order by nombre) from retail.fn_clientas_lista('Zlf Baja', 'todas', 10, 0);\n`,
  "Zlf Baja Cuatro:false,Zlf Baja Dos:false,Zlf Baja Tres:false,Zlf Baja Uno:true"
);
caso(
  "(c) un filtro desconocido → 22023 filtro_invalido; vacío o null = todas",
  GRUPO_FILTROS +
    intento(`select * from retail.fn_clientas_lista('Zlf Filtro', 'vip', 10, 0)`) +
    `select count(*) from retail.fn_clientas_lista('Zlf Filtro', '', 10, 0);
select count(*) from retail.fn_clientas_lista('Zlf Filtro', null, 10, 0);\n`,
  "22023|filtro_invalido\n4\n4"
);
caso(
  "(c) la fila trae lo que pinta la tabla: su sede, compras, frecuente y última compra (A: Lima 2 de 3; D: Trujillo 3 de 3)",
  GRUPO_FILTROS +
    `select nombre, coalesce(su_sede, '—'), compras_sede, compras_12m, es_frecuente, ultima_compra::date = (now() - interval '2 days')::date
       from retail.fn_clientas_lista('Zlf Filtro', 'frecuentes', 10, 0) order by nombre;\n`,
  "Zlf Filtro A|Tienda Lima|2|3|t|t\nZlf Filtro D|Tienda Trujillo|3|3|t|t"
);

// =====================================================================================================================
// d. Paginado
// =====================================================================================================================
const CINCO =
  como(FELIPE) +
  [1, 2, 3, 4, 5].map((n) => ALTA(`p${n}`, { numero: `7155040${n}`, nombre: `Zlf Pagina ${n}` })).join("") +
  `reset role;\n` +
  [1, 2, 3, 4, 5].map((n) => COMPRA(`p${n}`, "ubic", `${n} days`)).join("") +
  como(FELIPE);
caso(
  "(d) páginas de 2: 1-2, 3-4, 5 (de la compra más reciente a la más vieja), sin repetir ni saltar, con total 5 en cada fila",
  CINCO +
    [0, 2, 4].map((desde) => `select string_agg(nombre || ':' || total, ',' order by coalesce(ultima_compra, created_at) desc) from retail.fn_clientas_lista('Zlf Pagina', 'todas', 2, ${desde});\n`).join("") +
    `select count(*) from retail.fn_clientas_lista('Zlf Pagina', 'todas', 2, 6);\n`,
  "Zlf Pagina 1:5,Zlf Pagina 2:5\nZlf Pagina 3:5,Zlf Pagina 4:5\nZlf Pagina 5:5\n0"
);
caso(
  "(d) límites fuera de rango se acotan: límite 0 o negativo → 1 fila; desde negativo → desde 0; límite 1000 → hasta 200",
  CINCO +
    `select count(*) from retail.fn_clientas_lista('Zlf Pagina', 'todas', 0, 0);
select count(*) from retail.fn_clientas_lista('Zlf Pagina', 'todas', -5, 0);
select string_agg(nombre, ',') from retail.fn_clientas_lista('Zlf Pagina', 'todas', 1, -3);
select count(*) from retail.fn_clientas_lista(null, 'todas', 1000, 0) having count(*) <= 200;\n`,
  (s) => {
    const l = s.split("\n");
    return l[0] === "1" && l[1] === "1" && l[2] === "Zlf Pagina 1" && /^\d+$/.test(l[3] ?? "");
  }
);
caso(
  "(d) las que nunca compraron van después, por su fecha de registro (la más nueva primero)",
  como(FELIPE) + ALTA("v1", { numero: "71550411", nombre: "Zlf Orden Vieja" }) + ALTA("n1", { numero: "71550412", nombre: "Zlf Orden Nueva" }) +
    ALTA("k1", { numero: "71550413", nombre: "Zlf Orden Compra" }) +
    `reset role;
update retail.clientas set created_at = now() - interval '30 days' where id = :'v1';
update retail.clientas set created_at = now() - interval '1 day' where id = :'n1';
update retail.clientas set created_at = now() - interval '60 days' where id = :'k1';
` + COMPRA("k1", "ubic", "3 hours") + como(FELIPE) +
    `select string_agg(nombre, ',' order by ord) from (select nombre, row_number() over () as ord from retail.fn_clientas_lista('Zlf Orden', 'todas', 10, 0)) x;\n`,
  "Zlf Orden Compra,Zlf Orden Nueva,Zlf Orden Vieja"
);

// =====================================================================================================================
// e. El término busca como buscar_clienta
// =====================================================================================================================
caso(
  "(e) el término encuentra lo mismo que buscar_clienta: documento, celular con +51 y espacios, código de socia (en minúscula) y parte del nombre",
  como(FELIPE) + SOCIA("s", "71550501", "Zlf Busca Uno", "966550501") + ALTA("t", { numero: "71550502", nombre: "Zlf Busca Dos", celular: "966550502" }) +
    `select lower(:'s_codigo') as codigo_min \\gset\n` +
    ["'71550501'", "'+51 966 550 502'", ":'codigo_min'", "'busca'"]
      .map(
        (t) =>
          `select coalesce((select string_agg(id::text, ',' order by id) from retail.fn_clientas_lista(${t}, 'todas', 200, 0)), '-')
                = coalesce((select string_agg(id::text, ',' order by id) from retail.buscar_clienta(${t})), '-'),
                  (select count(*) from retail.fn_clientas_lista(${t}, 'todas', 200, 0));\n`
      )
      .join(""),
  (s) => {
    const l = s.split("\n");
    return l.length === 4 && l.every((x) => x.startsWith("t|")) && l[0] === "t|1" && l[1] === "t|1" && l[2] === "t|1" && Number(l[3].split("|")[1]) >= 2;
  }
);

// =====================================================================================================================
// f. Las cifras son el total de la lista en cada filtro
// =====================================================================================================================
caso(
  "(f) fn_cifras_clientas = el total de fn_clientas_lista en cada filtro, sobre toda la base (con las fichas del caso c)",
  GRUPO_FILTROS +
    `select identificadas || '|' || socias || '|' || frecuentes || '|' || con_publicidad || '|' || sin_publicidad || '|' || sin_celular || '|' || cumplen_este_mes || '|' || archivadas from retail.fn_cifras_clientas();\n` +
    `select ${FILTROS.map((f) => `coalesce((select max(total) from retail.fn_clientas_lista(null, '${f}', 1, 0)), 0)`).join(" || '|' || ")};\n`,
  (s) => {
    const [cifras, lista] = s.split("\n");
    return Boolean(cifras) && cifras === lista && cifras.split("|").every((x) => /^\d+$/.test(x));
  }
);
caso(
  "(f) una ficha nueva suma a identificadas y sin celular; hacerla socia la pasa a socias y sin publicidad",
  como(FELIPE) +
    `select identificadas as i0, socias as s0, sin_publicidad as sp0, sin_celular as sc0 from retail.fn_cifras_clientas() \\gset\n` +
    ALTA("c", { numero: "71550601", nombre: "Zlf Cifras" }) +
    `select identificadas - :i0, socias - :s0, sin_celular - :sc0 from retail.fn_cifras_clientas();\n` +
    UNIR("c", "966550601") +
    `select identificadas - :i0, socias - :s0, sin_publicidad - :sp0, sin_celular - :sc0 from retail.fn_cifras_clientas();\n`,
  "1|0|1\n1|1|1|0"
);

// =====================================================================================================================
// g. Permisos
// =====================================================================================================================
caso(
  "(g) sin el módulo «Clientas» (Micaela, sin él en su rol) → 42501 clientas_sin_modulo en las seis funciones, antes que nada",
  `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    como(MICAELA) +
    [
      `select * from retail.fn_clientas_lista(null, 'todas', 10, 0)`,
      `select * from retail.fn_cifras_clientas()`,
      `select * from retail.fn_clienta_su_sede(gen_random_uuid())`,
      `select * from retail.fn_clienta_permisos(gen_random_uuid())`,
      `select * from retail.fn_club_etiquetas()`,
      `select retail.guardar_preferencias_clienta(gen_random_uuid(), '{}'::jsonb, null)`,
    ]
      .map(intento)
      .join(""),
  Array(6).fill("42501|clientas_sin_modulo").join("\n")
);
caso(
  "(g) con el módulo, Micaela (integrante) lee la lista, las cifras y el catálogo",
  como(MICAELA) +
    `select count(*) >= 0 from retail.fn_clientas_lista(null, 'todas', 10, 0);
select count(*) from retail.fn_cifras_clientas();
select count(*) from retail.fn_club_etiquetas();\n`,
  "t\n1\n11"
);
caso(
  "(g) `anon` no ejecuta ninguna; `authenticated` no ejecuta los ayudantes ni lee `club_etiquetas`",
  `reset role;
select string_agg(f || ':' || has_function_privilege('anon', f, 'execute'), ',' order by f) from unnest(array[${DE_LA_WEB.map((f) => `'${f}'`).join(", ")}]) f;
select string_agg(f || ':' || has_function_privilege('authenticated', f, 'execute'), ',' order by f) from unnest(array[${AYUDANTES.map((f) => `'${f}'`).join(", ")}]) f;
select has_table_privilege('authenticated', 'retail.club_etiquetas', 'select'), has_table_privilege('anon', 'retail.club_etiquetas', 'select');
select relrowsecurity, (select count(*) from pg_policy where polrelid = 'retail.club_etiquetas'::regclass) from pg_class where oid = 'retail.club_etiquetas'::regclass;
` + como(MICAELA) + intento(`select count(*) from retail.club_etiquetas`),
  [
    [...DE_LA_WEB].sort().map((f) => `${f}:false`).join(","),
    [...AYUDANTES].sort().map((f) => `${f}:false`).join(","),
    "f|f",
    "t|0",
    "42501|permission denied for table club_etiquetas",
  ].join("\n")
);

// =====================================================================================================================
// h. Preferencias (CL-5)
// =====================================================================================================================
const PREF = (alias) => `select preferencias::text from retail.clientas where id = :'${alias}';\n`;
const VERSION = (alias, variable) => `select version as ${variable} from retail.clientas where id = :'${alias}' \\gset\n`;
caso(
  "(h) se guardan en el orden del catálogo, sin repetidos y sin grupos vacíos; suben la versión en 1 y dejan rastro (sin los valores)",
  como(FELIPE) + SOCIA("s", "71550701", "Zlf Pref Uno", "966550701") + VERSION("s", "v0") +
    `select retail.guardar_preferencias_clienta(:'s', '{"evita": ["Lana", "Fucsia", "Lana"], "ocasion": ["Evento", "Trabajo"], "estilo": []}'::jsonb, :v0) - :v0;
reset role;
` + PREF("s") +
    `select count(*), bool_and(detalle = '{"marcadas": 4}'::jsonb), bool_and(persona_id = :'persona_felipe') from retail.actividad where registro_id = :'s' and accion = 'preferencias';\n`,
  '1\n{"evita": ["Fucsia", "Lana"], "ocasion": ["Trabajo", "Evento"]}\n1|t|t'
);
caso(
  "(h) fuera del catálogo, un grupo que no existe, un valor que no es texto o algo que no es un objeto → preferencia_invalida (y no cambia nada)",
  como(FELIPE) + SOCIA("s", "71550702", "Zlf Pref Dos", "966550702") +
    [
      `{"evita": ["Rosado"]}`,
      `{"talla": ["M"]}`,
      `{"estilo": [1]}`,
      `{"estilo": "Clásico"}`,
      `["Clásico"]`,
    ]
      .map((j) => intentoCon(`select retail.guardar_preferencias_clienta(%L, '${j}'::jsonb, null)`, ":'s'"))
      .join("") +
    `reset role;\n` + PREF("s"),
  "P0001|preferencia_invalida\nP0001|preferencia_invalida\nP0001|preferencia_invalida\nP0001|preferencia_invalida\nP0001|preferencia_invalida\n{}"
);
caso(
  "(h) con la versión que ya cambió → PT409 version_cambiada; sin cambios → la misma versión y sin rastro nuevo",
  como(FELIPE) + SOCIA("s", "71550703", "Zlf Pref Tres", "966550703") + VERSION("s", "v0") +
    `select retail.guardar_preferencias_clienta(:'s', '{"estilo": ["Relajado"]}'::jsonb, :v0) as v1 \\gset\n` +
    intentoCon(`select retail.guardar_preferencias_clienta(%L, '{"estilo": ["Clásico"]}'::jsonb, %s)`, ":'s'", ":v0") +
    `select retail.guardar_preferencias_clienta(:'s', '{"estilo": ["Relajado"], "evita": []}'::jsonb, :v1) = :v1;
reset role;
select count(*) from retail.actividad where registro_id = :'s' and accion = 'preferencias';\n`,
  "PT409|version_cambiada\nt\n1"
);
caso(
  "(h) solo una socia activa: no socia → preferencias_solo_socia; archivada → clienta_archivada; anonimizada → clienta_anonimizada; unida → clienta_unida; no existe → clienta_no_existe",
  como(FELIPE) + ALTA("n", { numero: "71550704", nombre: "Zlf Pref No Socia", celular: "966550704" }) +
    SOCIA("ar", "71550705", "Zlf Pref Archivada", "966550705") + SOCIA("an", "71550706", "Zlf Pref Anonima", "966550706") +
    ALTA("queda", { numero: "71550707", nombre: "Zlf Pref Queda" }) + ALTA("seva", { nombre: "Zlf Pref Se Va", celular: "966550708" }) +
    `select retail.archivar_clienta(:'ar', 'prueba', false, null) as _a \\gset
select retail.archivar_clienta(:'an', 'prueba', true, null) as _b \\gset
select (retail.unir_clientas(:'queda', :'seva', null, null)).id as _u \\gset
` +
    ["n", "ar", "an", "seva"].map((a) => intentoCon(`select retail.guardar_preferencias_clienta(%L, '{"estilo": ["Clásico"]}'::jsonb, null)`, `:'${a}'`)).join("") +
    intento(`select retail.guardar_preferencias_clienta(gen_random_uuid(), '{"estilo": ["Clásico"]}'::jsonb, null)`),
  "P0001|preferencias_solo_socia\nP0001|clienta_archivada\nP0001|clienta_anonimizada\nP0001|clienta_unida\nP0001|clienta_no_existe"
);
caso(
  "(h) un valor que se apagó no se puede agregar, pero quien ya lo tenía lo conserva al guardar otra cosa; fn_club_etiquetas ya no lo trae",
  como(FELIPE) + SOCIA("t", "71550709", "Zlf Pref Tenia", "966550709") + SOCIA("u", "71550710", "Zlf Pref Nueva", "966550710") +
    `select retail.guardar_preferencias_clienta(:'t', '{"evita": ["Negro"]}'::jsonb, null) as _t \\gset
reset role;
update retail.club_etiquetas set activa = false where grupo = 'evita' and valor = 'Negro';
` + como(FELIPE) +
    intentoCon(`select retail.guardar_preferencias_clienta(%L, '{"evita": ["Negro"]}'::jsonb, null)`, ":'u'") +
    `select retail.guardar_preferencias_clienta(:'t', '{"evita": ["Negro", "Lana"]}'::jsonb, null) > 0;
select count(*) filter (where valor = 'Negro'), count(*) from retail.fn_club_etiquetas();
reset role;
` + PREF("t"),
  'P0001|preferencia_invalida\nt\n0|10\n{"evita": ["Negro", "Lana"]}'
);
caso(
  "(h) anonimizar las vacía (con los revoca del club), y unir vacía las de la ficha que se va; la que queda conserva las suyas",
  como(FELIPE) + SOCIA("an", "71550711", "Zlf Pref Anonimizar", "966550711") + SOCIA("queda", "71550712", "Zlf Pref Unir Queda", "966550712") +
    SOCIA("seva", "71550713", "Zlf Pref Unir Seva", "966550713") +
    `select retail.guardar_preferencias_clienta(:'an', '{"ocasion": ["Trabajo"]}'::jsonb, null) as _1 \\gset
select retail.guardar_preferencias_clienta(:'queda', '{"estilo": ["Clásico"]}'::jsonb, null) as _2 \\gset
select retail.guardar_preferencias_clienta(:'seva', '{"estilo": ["Tendencia"]}'::jsonb, null) as _3 \\gset
select retail.archivar_clienta(:'an', 'prueba', true, null) as _a \\gset
select (retail.unir_clientas(:'queda', :'seva', null, null)).id as _u \\gset
reset role;
` + PREF("an") + PREF("seva") + PREF("queda"),
  '{}\n{}\n{"estilo": ["Clásico"]}'
);
caso(
  "(h) el esquema: preferencias en una ficha que no es socia → clientas_preferencias_solo_socia; algo que no es un objeto → clientas_preferencias_forma",
  como(FELIPE) + ALTA("n", { numero: "71550714", nombre: "Zlf Pref Directo" }) + `reset role;\n` +
    intentoCon(`update retail.clientas set preferencias = '{"estilo": ["Clásico"]}' where id = %L`, ":'n'") +
    intentoCon(`update retail.clientas set preferencias = '[]' where id = %L`, ":'n'"),
  (s) => {
    const l = s.split("\n");
    return l.length === 2 && l[0].startsWith("23514|") && l[0].includes("clientas_preferencias_solo_socia") && l[1].startsWith("23514|") && l[1].includes("clientas_preferencias_forma");
  }
);
caso(
  "(h) el catálogo: 11 valores de trabajo en su orden; un valor no se renombra, no cambia de grupo ni se borra (club_etiqueta_fija); apagarlo y reordenarlo sí",
  `reset role;
select string_agg(grupo || ':' || valor, ',' order by case grupo when 'ocasion' then 1 when 'estilo' then 2 else 3 end, orden) from retail.club_etiquetas;
` +
    intento(`update retail.club_etiquetas set valor = 'Oficina' where grupo = 'ocasion' and valor = 'Trabajo'`) +
    intento(`update retail.club_etiquetas set grupo = 'estilo' where grupo = 'ocasion' and valor = 'Trabajo'`) +
    intento(`delete from retail.club_etiquetas where grupo = 'evita' and valor = 'Lana'`) +
    intento(`update retail.club_etiquetas set activa = false, orden = 9 where grupo = 'evita' and valor = 'Lana'`),
  "ocasion:Trabajo,ocasion:Evento,ocasion:Día a día,estilo:Clásico,estilo:Tendencia,estilo:Relajado,evita:Fucsia,evita:Amarillo,evita:Negro,evita:Lana,evita:Poliéster\nP0001|club_etiqueta_fija\nP0001|club_etiqueta_fija\nP0001|club_etiqueta_fija\nSIN_ERROR"
);

// =====================================================================================================================
// i. Historia del permiso (CL-26)
// =====================================================================================================================
const HISTORIA = (alias) =>
  `select string_agg(finalidad || ':' || accion || ':' || medio || ':' || coalesce(texto_tipo, '-') || ':' || coalesce(texto_version::text, '-') || ':' || coalesce(sede, '-') || ':' || coalesce(registrado_por, '-') || ':' || de_otra_ficha, E'\\n' order by created_at, id) from retail.fn_clienta_permisos(:'${alias}');\n`;
/** Corre en el tiempo los eventos de la ficha para que cada paso tenga su hora (en una transacción todos tienen now()). */
const ESPACIAR = (alias) => `reset role;
alter table retail.club_permisos disable trigger club_permisos_solo_agregar;
update retail.club_permisos e set created_at = e.created_at - make_interval(days => x.dias)
  from (select id, (count(*) over () - row_number() over (order by case when finalidad = 'club' then 0 when accion = 'otorga' then 1 else 2 end, id))::int as dias
          from retail.club_permisos where clienta_id = :'${alias}') x
 where x.id = e.id;
alter table retail.club_permisos enable trigger club_permisos_solo_agregar;
`;
caso(
  "(i) en orden: se unió (caja, Lima, Felipe A., texto club v2) → pidió la publicidad (su mensaje, Trujillo) → BAJA",
  como(FELIPE) + SOCIA("s", "71550801", "Zlf Historia", "966550801") +
    `select retail.registrar_mensaje_publicidad(:'s', '966550801', :'tru') as _p \\gset
select retail.registrar_baja_whatsapp('966550801', :'tru') as _b \\gset
` + ESPACIAR("s") + como(FELIPE) + HISTORIA("s"),
  [
    "club:otorga:caja_palabra:club:2:Tienda Lima:Felipe A.:false",
    "publicidad_whatsapp:otorga:whatsapp_propio:mensaje_personal:2:Tienda Trujillo:Felipe A.:false",
    "publicidad_whatsapp:revoca:baja_whatsapp:-:-:Tienda Trujillo:Felipe A.:false",
  ].join("\n")
);
caso(
  "(i) el legado no dice quién (null) ni texto; los eventos de la ficha que se le unió salen marcados de_otra_ficha",
  como(FELIPE) + ALTA("queda", { numero: "71550802", nombre: "Zlf Historia Queda" }) + SOCIA("seva", "71550803", "Zlf Historia Seva", "966550803") +
    `select (retail.unir_clientas(:'queda', :'seva', null, null)).id as _u \\gset
reset role;
insert into retail.club_permisos (clienta_id, finalidad, accion, medio, nota, created_at)
values (:'queda', 'club', 'otorga', 'legado', 'marcado en caja antes de ADR-0288', now() + interval '1 minute');
` + como(FELIPE) + HISTORIA("queda"),
  "club:otorga:caja_palabra:club:2:Tienda Lima:Felipe A.:true\nclub:otorga:legado:-:-:-:-:false"
);
caso(
  "(i) una ficha sin eventos no trae filas",
  como(FELIPE) + ALTA("c", { numero: "71550804", nombre: "Zlf Historia Vacia" }) + `select count(*) from retail.fn_clienta_permisos(:'c');\n`,
  "0"
);

// =====================================================================================================================
// j. Estructura y pegado
// =====================================================================================================================
caso(
  "(j) los md5 «después» de la sección 0 son los de las funciones vivas",
  VERSIONES.map((v) => `select coalesce((select ${md5Norm("p.prosrc")} from pg_proc p where p.oid = to_regprocedure('${v.firma}')), 'NO_EXISTE');\n`).join(""),
  VERSIONES.map((v) => v.despues).join("\n")
);
caso(
  `(j) las ${CREADAS.length} funciones que crea el archivo están vivas con el cuerpo del archivo (una sola firma cada una)`,
  CREADAS.map(
    (f) =>
      `select '${f}' || ':' || count(*) || ':' || bool_and(${md5Norm("p.prosrc")} = ${md5Norm(`$cuerpo_1f$${cuerpoDe(f)}$cuerpo_1f$`)}) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = '${f.slice(7)}';\n`
  ).join(""),
  CREADAS.map((f) => `${f}:1:true`).join("\n")
);
// Una foto de todo lo que la migración toca: funciones (cuerpo, permisos, security definer, search_path), la columna y los
// candados de clientas, la tabla del catálogo, sus disparadores, RLS y permisos, y sus filas. Una línea: su md5.
const FOTO = `reset role;
select md5(string_agg(x, '|' order by x)) from (
  select p.oid::regprocedure::text || '=' || md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), '') || ':' || p.prosecdef || ':' || coalesce(array_to_string(p.proconfig, ','), '') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '')
    from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in (${CREADAS.map((f) => `'${f.slice(7)}'`).join(", ")})
  union all
  select 'col:' || a.attrelid::regclass || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':'
         || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ':' || coalesce(col_description(a.attrelid, a.attnum), '')
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid in ('retail.clientas'::regclass, 'retail.club_etiquetas'::regclass) and a.attnum > 0 and not a.attisdropped
  union all
  select 'con:' || conrelid::regclass || ':' || conname || ':' || pg_get_constraintdef(oid) || ':' || convalidated from pg_constraint
   where conrelid in ('retail.clientas'::regclass, 'retail.club_etiquetas'::regclass)
  union all
  select 'idx:' || indexdef from pg_indexes where schemaname = 'retail' and tablename in ('clientas', 'club_etiquetas')
  union all
  select 'trg:' || pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text from pg_trigger t
   where not t.tgisinternal and t.tgrelid in ('retail.clientas'::regclass, 'retail.club_etiquetas'::regclass)
  union all
  select 'rel:' || relname || ':' || relrowsecurity::text || ':' || coalesce(array_to_string(relacl, ','), '') || ':' || coalesce(obj_description(oid, 'pg_class'), '')
    from pg_class where oid = 'retail.club_etiquetas'::regclass
  union all
  select 'etq:' || grupo || ':' || valor || ':' || orden || ':' || activa from retail.club_etiquetas
) f(x);
`;
const PEGAR = `reset role;\n${MIGRACION}\nset local search_path = retail, public, extensions;\n`;
caso(
  "(j) pegarla otra vez deja todo igual: funciones, permisos, columna, candados, índices, disparadores, RLS y catálogo",
  FOTO + PEGAR + FOTO,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 2 && l[0] === l[1];
  }
);
caso(
  "(j) pegarla otra vez no revive un valor apagado ni le cambia el orden (on conflict do nothing)",
  `reset role;
update retail.club_etiquetas set activa = false, orden = 7 where grupo = 'estilo' and valor = 'Tendencia';
` + PEGAR + `select activa, orden from retail.club_etiquetas where grupo = 'estilo' and valor = 'Tendencia';\n`,
  "f|7"
);
// Una función cambiada en vivo (md5 que no es ni «antes» ni «después»): la migración aborta con un mensaje claro y no pisa.
const CAMBIADA_EN_VIVO = `reset role;
create or replace function retail.fn_cifras_clientas()
returns table (identificadas integer, socias integer, con_publicidad integer, sin_publicidad integer, frecuentes integer,
               sin_celular integer, cumplen_este_mes integer, archivadas integer)
language sql stable security definer set search_path = retail, public, extensions as $q$
  select 0, 0, 0, 0, 0, 0, 0, 0; -- cambiada en vivo
$q$;
`;
caso(
  "(j) candado de versión: con fn_cifras_clientas cambiada en vivo, la migración aborta con un mensaje claro…",
  CAMBIADA_EN_VIVO + PEGAR,
  (o) => o.startsWith("ERROR_DE_SCRIPT") && o.includes("retail.fn_cifras_clientas() cambió desde que se escribió esta migración")
);
caso(
  "(j) …y no pisa NADA: la función sigue con su cambio y lo demás queda como estaba",
  CAMBIADA_EN_VIVO + FOTO +
    `\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${MIGRACION}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\n` +
    `set local search_path = retail, public, extensions;\n` +
    FOTO +
    `select position('cambiada en vivo' in prosrc) > 0 from pg_proc where oid = 'retail.fn_cifras_clientas()'::regprocedure;\n`,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 3 && l[0] === l[1] && l[2] === "t";
  }
);
caso(
  "(j) sin la tanda 1b (sin clientas.club_desde), la migración aborta y lo dice",
  `reset role;\nalter table retail.clientas rename column club_desde to club_desde_x;\n` + PEGAR,
  (o) => o.startsWith("ERROR_DE_SCRIPT") && o.includes("Falta la tanda 1b del club")
);
caso(
  "(j) las lecturas empiezan por el módulo «Clientas»; la que guarda, además, firma con el responsable del combo (fn_actor_persona_id(true))",
  `select string_agg(p.proname || ':' || (${md5Norm("p.prosrc").replace(/^md5\((.*)\)$/, "$1")}
            ~ '^(#variable_conflictuse_column)?(declare.*?begin)?(select|perform)retail\\.fn_exigir_modulo\\(''clientas''\\);'), ',' order by p.proname)
  from pg_proc p where p.pronamespace = 'retail'::regnamespace
   and p.proname in ('fn_clientas_lista', 'fn_cifras_clientas', 'fn_clienta_su_sede', 'fn_clienta_permisos', 'fn_club_etiquetas', 'guardar_preferencias_clienta');
select ${md5Norm("prosrc").replace(/^md5\((.*)\)$/, "$1")} ~ '^declare.*?beginperformretail\\.fn_exigir_modulo\\(''clientas''\\);v_persona:=retail\\.fn_actor_persona_id\\(true\\);'
  from pg_proc where oid = 'retail.guardar_preferencias_clienta(uuid,jsonb,integer)'::regprocedure;
select string_agg(proname, ',' order by proname) from pg_proc where pronamespace = 'retail'::regnamespace and prosecdef
   and proname in (${CREADAS.map((f) => `'${f.slice(7)}'`).join(", ")});
`,
  "fn_cifras_clientas:true,fn_clienta_permisos:true,fn_clienta_su_sede:true,fn_clientas_lista:true,fn_club_etiquetas:true,guardar_preferencias_clienta:true\nt\nfn_cifras_clientas,fn_clienta_permisos,fn_clienta_su_sede,fn_clientas_lista,fn_club_etiquetas,guardar_preferencias_clienta"
);

// Sin base de datos: lo que el SQL Editor ve del archivo. Fuera de los cuerpos `$…$` y de los comentarios: los textos entre
// comillas simples y el código suelto.
function fueraDeDolares(sql) {
  const textos = [];
  let codigo = "";
  let k = 0;
  while (k < sql.length) {
    const c = sql[k];
    if (c === "-" && sql[k + 1] === "-") {
      const fin = sql.indexOf("\n", k);
      k = fin < 0 ? sql.length : fin;
      continue;
    }
    if (c === "/" && sql[k + 1] === "*") {
      const fin = sql.indexOf("*/", k + 2);
      k = fin < 0 ? sql.length : fin + 2;
      continue;
    }
    if (c === "'") {
      let j = k + 1;
      let t = "";
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          t += "'";
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        t += sql[j];
        j++;
      }
      textos.push(t);
      codigo += " '' ";
      k = j + 1;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(k));
      if (m) {
        const fin = sql.indexOf(m[0], k + m[0].length);
        k = fin < 0 ? sql.length : fin + m[0].length;
        codigo += " $cuerpo$ ";
        continue;
      }
    }
    codigo += c;
    k++;
  }
  return { textos, codigo };
}
const conInto = (sql) => {
  const { textos, codigo } = fueraDeDolares(sql);
  return [
    ...textos.filter((t) => /\binto\b/i.test(t)).map((t) => `texto: ${t.slice(0, 60)}`),
    ...codigo.split(";").filter((s) => /\bselect\b[\s\S]*\binto\b/i.test(s)).map((s) => `suelto: ${s.trim().slice(0, 60)}`),
  ];
};
chequeo(
  "(j) ningún `into` dentro de un texto entre comillas fuera de `$…$`, ni un `select … into` suelto (el SQL Editor lo toma por un SELECT INTO y agrega un `alter table … enable row level security`)",
  conInto(MIGRACION).join(" · ") || "ninguno",
  "ninguno"
);
chequeo(
  "(j) …y el vigilante muerde: un texto con `select … into` y un `select … into` suelto salen nombrados",
  conInto(`select pg_temp.reemplazar('x', 'v := 1;', 'select c.id into v_id from retail.clientas c;');\nselect 1 into tabla_x;\ndo $$ begin select 1 into v; end $$;`).length,
  2
);
{
  const sinComentarios = MIGRACION.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  chequeo(
    "(j) sin `drop trigger` ni `create policy` / `drop policy` (CLAUDE.md, «Políticas y deadlocks»)",
    [/drop\s+trigger/i, /create\s+policy/i, /drop\s+policy/i].filter((r) => r.test(sinComentarios)).length,
    0
  );
  chequeo("(j) espera como mucho 3 s un candado (`set lock_timeout = '3s'`)", /set lock_timeout = '3s';/.test(sinComentarios), true);
  chequeo(
    "(j) no toma `ubicaciones`, `ventas` ni `venta_items` con un `alter` (solo `clientas`, y la tabla nueva)",
    [...sinComentarios.matchAll(/alter\s+table\s+retail\.([a-z_]+)/gi)].map((m) => m[1]).filter((t) => t !== "clientas" && t !== "club_etiquetas").join(",") || "ninguna",
    "ninguna"
  );
  chequeo(
    "(j) las lecturas que llama la web empiezan por `fn_` (no abren el loader, espera-reglas.ts)",
    DE_LA_WEB.filter((f) => !f.startsWith("retail.guardar_")).every((f) => f.startsWith("retail.fn_")),
    true
  );
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
