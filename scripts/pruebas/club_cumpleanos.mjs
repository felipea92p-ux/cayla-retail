#!/usr/bin/env node
/**
 * Pruebas de la tanda 1c del club de clientas: el cumpleaños con un canje por año (ADR-0288 D-5 y «Contrato de la tanda
 * 1c»; migraciones `20260930230000_club_paso1c_parte1_venta_items.sql`, `…230100_…parte2_configuracion.sql` y
 * `…230200_…parte3_cumpleanos.sql`).
 *
 * EL PROBLEMA. El regalo de cumpleaños solo se podía dar como un descuento a mano: la base le creía a la pantalla el monto
 * y a quién, nada impedía darlo dos veces en el año ni fuera de su mes, y el candado de costo lo frenaba aunque Felipe
 * decidió regalarlo completo. La base tiene que hacer cumplir, no la pantalla:
 *   · Cobrar solo dice «canjear» (`p_canjear_cumpleanos`) y manda la parte del club por línea; la base la recalcula
 *     (`round((precio − descuento_sin_club) × pct / 100, 2)`, en cascada) y la rechaza si no coincide;
 *   · solo una socia, en su mes de Lima, una vez por año (el único parcial de `club_canjes`);
 *   · los candados de la venta miden el descuento SIN la parte del club; anular libera el canje; una devolución no.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`, para
 * que los permisos se evalúen de verdad; cuentas del seed: Felipe, líder y Admin; Micaela, integrante de Trujillo con tope
 * de descuento de venta de 10 %; Sandra, para aprobar una devolución que no registró):
 *   0. La tabla de paridad de `apps/web/lib/club-cumple-canje-reglas.test.ts` (se lee de ese archivo): Postgres da, caso por
 *      caso, lo mismo que la regla de la web (medio céntimo hacia arriba).
 *   a. Canje correcto: la línea guarda el total y la parte del club, el pago cuadra, `club_canjes` anota el canje (tipo,
 *      año de Lima, %, monto, quién) y la actividad lo cuenta sin datos de la clienta; la cascada (campaña de 20 % → 28 %)
 *      con dos unidades y una prenda sin registrar; el medio céntimo de la base; el % configurable.
 *   b. Bajo costo por la parte del club → PASA; bajo costo por un descuento normal → sigue fallando, con canje o sin él.
 *   c. Segundo canje del año → `cumple_ya_canjeado`, y no queda la segunda venta.
 *   d. Fuera de su mes o sin mes → `cumple_fuera_de_mes`; no socia o archivada → `cumple_no_socia`; anonimizada →
 *      `clienta_anonimizada`; sin clienta → `cumple_sin_clienta`. En ningún rechazo queda venta, canje ni stock movido.
 *   e. El monto: manipulado → `cumple_descuento_distinto` (1 céntimo de holgura, 2 no); una parte del club sin canjear →
 *      `cumple_sin_canje`; un canje sin nada que descontar → `cumple_sin_monto`.
 *   f. Los candados miden SIN el club: el tope de la asesora (D-67), el código de descuento, el 35 % del líder y el
 *      argumento sobre el 15 %.
 *   g. Anular la venta libera el canje (con la hora y la persona de la anulación) y se puede volver a canjear; una
 *      devolución NO lo libera.
 *   h. `resumen_clienta_caja`: disponible, % y canjeado, antes y después del canje y de anularlo.
 *   i. Estructura: una sola firma de `registrar_venta` (la de 17) y la llamada de la web resuelve; los md5 «después» de la
 *      sección 0 son los vivos (y su «antes» de `registrar_venta` es el «después» de la 1a); permisos; `club_canjes` con
 *      RLS sin políticas y sin permisos; pegar las tres partes otra vez deja todo igual; con una función cambiada en vivo,
 *      la PARTE 3 aborta sin tocar nada; pegar HOY la tanda 1b por error aborta sin tocar nada (no puede devolverle a
 *      `resumen_clienta_caja` su forma vieja); y ningún `select … into` dentro de un texto entre comillas fuera de `$…$` (el SQL
 *      Editor de Supabase lo toma por un SELECT INTO: CLAUDE.md, ADR-0288), con un vigilante que muerde.
 *   j. Dos cajas a la vez (dos conexiones reales): (j1) una canjea y la otra, que canjea a la misma socia, ESPERA en la
 *      lectura de la ficha (sin COMMIT). Con BASE_DESECHABLE=1, además y con COMMIT: (j2) dos canjes a la misma socia →
 *      pasa uno y el otro recibe `cumple_ya_canjeado`; (j3) una venta SIN canje a esa socia no espera al canje; (j4) la
 *      misma venta reintentada (mismo token) mientras se guarda → la misma venta y un solo canje.
 *
 * USO
 *   pnpm pruebas:club-cumpleanos                   → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-cumpleanos --base cayla_x    → contra otra base del mismo contenedor
 *   BASE_DESECHABLE=1 pnpm pruebas:club-cumpleanos → además (j2), (j3) y (j4), que commitean: SOLO contra un Postgres desechable
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const leer = (...partes) => readFileSync(join(RAIZ, ...partes), "utf8");
const ARCHIVOS = [
  "20260930230000_club_paso1c_parte1_venta_items.sql",
  "20260930230100_club_paso1c_parte2_configuracion.sql",
  "20260930230200_club_paso1c_parte3_cumpleanos.sql",
];
const PARTES = ARCHIVOS.map((n) => leer("supabase", "migrations", n));
const PARTE3 = PARTES[2];

// La tabla del candado de versión de la PARTE 3: firma → md5 «antes» y «después» (null = que la firma no exista).
const VERSIONES = [...PARTE3.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+(null|'([0-9a-f]{32})'),\s+(null|'([0-9a-f]{32})')\)/g)].map((m) => ({
  firma: m[1],
  antes: m[3] ?? null,
  despues: m[5] ?? null,
}));
if (VERSIONES.length !== 4) {
  console.error(`✗ La tabla de versiones de la PARTE 3 debería tener 4 filas y tiene ${VERSIONES.length}.`);
  process.exit(1);
}
const RV_VIEJA = "retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text)";
const RV_NUEVA = "retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text,boolean)";
// La cadena no se corta: el «antes» de registrar_venta aquí es el «después» de la tanda 1a (el que está en producción).
const DESPUES_1A = /\('retail\.registrar_venta\([^']*\)',\s+'[0-9a-f]{32}',\s+'([0-9a-f]{32})'\)/.exec(
  leer("supabase", "migrations", "20260930160000_club_paso1a_venta_ligada_y_documento.sql")
)?.[1];

// La tabla de paridad de la web (la MISMA que prueba la regla en vitest): [precio, descuento sin club, %, Postgres].
const TEST_WEB = leer("apps", "web", "lib", "club-cumple-canje-reglas.test.ts");
const BLOQUE_PARIDAD = TEST_WEB.slice(TEST_WEB.indexOf("MEDIDO_EN_POSTGRES"), TEST_WEB.indexOf("];", TEST_WEB.indexOf("MEDIDO_EN_POSTGRES")));
const PARIDAD = [...BLOQUE_PARIDAD.matchAll(/\[([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\]/g)].map((m) => m.slice(1, 5));

// Seed local: Felipe (líder y Admin), Micaela (integrante de Trujillo, tope de descuento de venta 10 %), Sandra.
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";
const SANDRA = "22222222-2222-4222-8222-000000000005";
// Tokens fijos: para contar, después de un rechazo, que no quedó ninguna venta con ese token.
const TOKEN_A = "99999999-9999-4999-8999-0000000c0001";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

/** Una sesión de psql que corre en paralelo con las demás (para las carreras de la sección j). */
function psqlEnParalelo(sql) {
  return new Promise((resolve) => {
    const p = spawn("docker", ARGS_PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (codigo) => resolve({ ok: codigo === 0, salida: salida.trim(), mensaje: error }));
    p.stdin.end(sql);
  });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Las funciones de prueba (en `pg_temp`, se van con la sesión). No son security definer: corren como quien las llama. */
const FUNCIONES_DE_PRUEBA = `
-- Intenta una sentencia y devuelve «SQLSTATE|hint» si el hint es uno de los nuestros, «SQLSTATE|mensaje» si no, o SIN_ERROR.
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

-- Vende las líneas de p_items y paga exactamente su total (Σ (precio − descuento_unitario) × cantidad), con o sin canje.
-- Devuelve el id de la venta, o «ERROR|hint» (o «ERROR|SQLSTATE|mensaje» si no hay hint nuestro): el rechazo deshace todo lo
-- que la venta hizo.
create function pg_temp.vender(p_ubic uuid, p_items jsonb, p_clienta uuid, p_canjear boolean, p_token uuid,
  p_codigo text default null, p_descuento_pct numeric default 0) returns text language plpgsql as $f$
declare v_id uuid; v_estado text; v_msg text; v_hint text; v_total numeric;
begin
  v_total := (select sum(((e ->> 'precio_unitario')::numeric - coalesce((e ->> 'descuento_unitario')::numeric, 0)) * (e ->> 'cantidad')::integer)
                from jsonb_array_elements(p_items) e);
  v_id := retail.registrar_venta(
    p_ubicacion_id => p_ubic,
    p_items => p_items,
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', v_total)),
    p_cliente_id => p_clienta,
    p_token => p_token,
    p_codigo_descuento => p_codigo,
    p_descuento_pct => p_descuento_pct,
    p_canjear_cumpleanos => p_canjear
  );
  return v_id::text;
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return 'ERROR|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_estado || '|' || v_msg end;
end;
$f$;
grant execute on function pg_temp.vender(uuid, jsonb, uuid, boolean, uuid, text, numeric) to authenticated;
`;

/** Lo que toda sesión necesita, dentro de su transacción (también las de las carreras: no escribe nada compartido). */
const PRELUDIO_BASE = `
begin;
set local search_path = retail, public, extensions;
${FUNCIONES_DE_PRUEBA}
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select extract(month from retail.fn_hoy_lima())::smallint as mes_hoy,
       (extract(month from retail.fn_hoy_lima())::int % 12 + 1)::smallint as otro_mes,
       extract(year from retail.fn_hoy_lima())::int as anio_hoy \\gset
`;
/** Lo que todo caso necesita: además, una persona firma a su nombre, como hoy en el mostrador; y la integrante, con
 *  Clientas (así están en producción). */
const PRELUDIO = `${PRELUDIO_BASE}
update retail.configuracion_empresa set exige_responsable = false;
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'clientas' on conflict do nothing;
`;

/** Cambia de cuenta (sin responsable en el combo). */
const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
const intento = (sql) => `select pg_temp.intento($q$${sql}$q$);\n`;
/** Como `intento`, con variables de psql: psql no las reemplaza entre $q$, así que van por `format` (%L). */
const intentoCon = (sql, ...vars) => `select pg_temp.intento(format($q$${sql}$q$, ${vars.join(", ")}));\n`;

/**
 * Una sede lista para vender: piso y almacén si faltaran, su caja abierta por el líder y 100 unidades de BLU-EMMA-NEG-M
 * (precio 79.90, costo 32.00) en el piso. Deja :ubic, :v1, :v1_precio, :stock0, y :cat, :talla, :color para una prenda
 * sin registrar. Corre como `postgres` con los claims del líder (abrir_caja firma con él).
 */
const SEDE = (nombre = "Tienda Lima") => `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select id as ubic from retail.ubicaciones where nombre = '${nombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00, 'prueba club_cumpleanos') as caja_id \\gset
select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 100, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
select coalesce(sum(cantidad), 0) as stock0 from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic' \\gset
select id as cat from retail.categorias where activo order by nombre limit 1 \\gset
select id as talla from retail.tallas where activo and estado = 'aprobado' order by valor limit 1 \\gset
select codigo as color from retail.colores where activo order by codigo limit 1 \\gset
`;

/** Una campaña de 20 % vigente hoy sobre BLU-EMMA-NEG-M (79.90 → 63.90: descuento 16.00). Deja :etq. Como postgres. */
const CAMPANA_20 = `reset role;
insert into retail.etiquetas (nombre, estado, activo, descuento_pct, vigente_desde, vigente_hasta)
  values ('ZZ Cumple Campaña (prueba)', 'aprobado', true, 20, retail.fn_hoy_lima() - 1, retail.fn_hoy_lima() + 5)
  returning id as etq \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'etq');
select (select etiqueta_id from retail.campanas_vigentes() where variante_id = :'v1' order by descuento_pct desc limit 1) = :'etq' as es_la_nuestra \\gset
\\if :es_la_nuestra
\\else
  select 1 / 0 as otra_campana_gana;
\\endif
`;

const lit = (v) => (v === null ? "null" : `'${v}'`);
/** Alta de ficha por la RPC (la cuenta ya elegida). */
const ALTA = (alias, { numero = null, nombre = null, celular = null } = {}) =>
  `select retail.registrar_clienta(p_documento_tipo => 'dni', p_documento_numero => ${lit(numero)}, p_nombre => ${lit(nombre)}, p_telefono_whatsapp => ${lit(celular)}) as ${alias} \\gset\n`;
/**
 * Una socia (alta con DNI, nombre y celular, y su «sí» en caja) con su cumpleaños el 15 de `mes` (una expresión SQL:
 * :'mes_hoy', :'otro_mes' o null). La cuenta ya elegida.
 */
const SOCIA = (alias, numero, nombre, celular, mes = ":'mes_hoy'") =>
  ALTA(alias, { numero, nombre, celular }) +
  `select codigo_club as ${alias}_codigo from retail.unirse_al_club(p_clienta_id => :'${alias}', p_telefono_whatsapp => '${celular}', p_cumple_dia => ${mes === "null" ? "null" : "15::smallint"}, p_cumple_mes => ${mes}::smallint, p_ubicacion_id => :'ubic') \\gset\n`;

/** Una línea de `p_items`: `sinClub` es el descuento sin el cumpleaños y `club` su parte (null = la clave no viaja). */
const item = ({ v = ":'v1'", precio = ":'v1_precio'", sinClub = 0, club = null, cant = 1, motivo = null, etq = null, argumento = null, libre = false } = {}) => {
  const total = (Math.round((sinClub + (club ?? 0)) * 100) / 100).toFixed(2);
  return (
    `jsonb_build_object('variante_id', ${v}, 'cantidad', ${cant}, 'precio_unitario', ${precio}::numeric, 'descuento_unitario', ${total}` +
    (club === null ? "" : `, 'descuento_club_unitario', ${club.toFixed(2)}`) +
    (motivo ? `, 'motivo_descuento', '${motivo}'` : "") +
    (etq ? `, 'descuento_etiqueta_id', ${etq}` : "") +
    (argumento ? `, 'argumento_descuento', '${argumento}'` : "") +
    (libre ? `, 'descripcion_libre', 'Blusa sin registrar club', 'categoria_id', :'cat', 'talla_id', :'talla', 'color_codigo', :'color'` : "") +
    ")"
  );
};
const items = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
/** El centinela de la prenda sin registrar (ADR-0179). */
const LIBRE = "'22222222-2222-4222-8222-222222222222'";
/** `select pg_temp.vender(...) as <alias> \gset`. */
const VENDER = (alias, { lineas = items(item()), clienta = "null", canjear = "false", token = "gen_random_uuid()", codigo = "null", pct = "0" } = {}) =>
  `select pg_temp.vender(:'ubic', ${lineas}, ${clienta}, ${canjear}, ${token}, ${codigo}, ${pct}) as ${alias} \\gset\n`;

/** Después de un rechazo: ¿quedó alguna venta con ese token, algún canje de la ficha, o se movió el stock? «ventas|canjes|stock». */
const NADA_SE_GUARDO = (token, ficha = null) => `reset role;
select (select count(*) from retail.ventas where token_cliente = '${token}')
    || '|' || (select count(*) from retail.club_canjes where clienta_id = ${ficha ? `:'${ficha}'` : "null"})
    || '|' || ((select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic') - :stock0);
`;

const md5Norm = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;

let fallas = 0;
let casos = 0;
function registrar(nombre, bien, obtenido, esperadoTexto) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${String(esperadoTexto).split("\n").join("\n              ")}\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`);
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
/** Un chequeo sin base de datos (lee los archivos). */
function chequeo(nombre, obtenido, esperado) {
  registrar(nombre, obtenido === esperado, obtenido, esperado);
}

try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"], { stdio: "ignore" });
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
  process.exit(1);
}

// =====================================================================================================================
// 0. La paridad con la web
// =====================================================================================================================
{
  const r = correr(
    `select string_agg(format('%s|%s|%s|%s', p, d, pct, round((p - d) * pct / 100, 2)), E'\\n' order by n) from (values ${PARIDAD.map(
      ([p, d, pct], n) => `(${n}, ${p}::numeric, ${d}::numeric, ${pct}::numeric)`
    ).join(", ")}) t(n, p, d, pct);`
  );
  const malos = r.ok
    ? r.salida
        .split("\n")
        .map((l, n) => [l.split("|"), PARIDAD[n]])
        .filter(([[, , , dio], [, , , web]]) => Number(dio) !== Number(web))
        .map(([[p, d, pct, dio], [, , , web]]) => `${p} − ${d} al ${pct} %: Postgres ${dio}, la web ${web}`)
    : [r.mensaje];
  registrar(
    `(0) Postgres da lo mismo que la regla de la web en los ${PARIDAD.length} casos de su tabla (medio céntimo hacia arriba, cascada)`,
    PARIDAD.length >= 25 && malos.length === 0,
    malos.join(" · ") || `${PARIDAD.length} casos`,
    "ninguna diferencia (y al menos 25 casos)"
  );
}

// =====================================================================================================================
// a. Canje correcto
// =====================================================================================================================
caso(
  "(a) canje de 10 % en una prenda a precio de lista: la línea guarda el total (7.99) y la parte del club (7.99) sin motivo, el pago cuadra en 71.91, y club_canjes anota tipo, año de Lima, %, monto y quién",
  SEDE() + como(FELIPE) + SOCIA("f", "90990101", "Cumple Uno Prueba", "966990101") +
    VENDER("venta", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    `reset role;
select descuento_unitario, descuento_club_unitario, coalesce(motivo_descuento, '-'), subtotal from retail.venta_items where venta_id::text = :'venta';
select sum(monto) from retail.venta_pagos where venta_id::text = :'venta';
select tipo, anio = :anio_hoy, pct, monto, registrado_por = :'persona_felipe', anulado_en is null, clienta_id = :'f'
  from retail.club_canjes where venta_id::text = :'venta';
select cliente_id = :'f'::uuid from retail.ventas where id::text = :'venta';
`,
  "7.99|7.99|-|71.91\n71.91\ncumpleanos|t|10.00|7.99|t|t|t\nt"
);
caso(
  "(a) …y la actividad lo cuenta (vender · cumpleanos_canjeado, sobre la venta) sin nada de la clienta: ni su nombre, ni su DNI, ni su celular, ni su código, ni su id",
  SEDE() + como(FELIPE) + SOCIA("f", "90990102", "Cumple Actividad Prueba", "966990102") +
    VENDER("venta", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    `reset role;
select a.modulo, a.accion, a.tabla, a.registro_id = :'venta', a.persona_id = :'persona_felipe', a.detalle ->> 'pct', a.detalle ->> 'monto',
       (a.descripcion || a.detalle::text) !~* ('(cumple actividad|90990102|966990102|' || :'f_codigo' || '|' || :'f' || ')')
  from retail.actividad a where a.accion = 'cumpleanos_canjeado' and a.registro_id = :'venta';
`,
  "vender|cumpleanos_canjeado|ventas|t|t|10.00|7.99|t"
);
caso(
  "(a) la cascada (CL-11): la prenda con campaña de 20 % (16.00) suma 6.39 y queda en 28 %; dos unidades y una prenda sin registrar de 45.00 (4.50) entran en el mismo canje: monto 17.28",
  SEDE() + CAMPANA_20 + como(FELIPE) + SOCIA("f", "90990103", "Cumple Cascada Prueba", "966990103") +
    VENDER("venta", {
      lineas: items(item({ sinClub: 16, club: 6.39, cant: 2, motivo: "campana", etq: ":'etq'" }), item({ v: LIBRE, precio: "45", club: 4.5, libre: true })),
      clienta: ":'f'",
      canjear: "true",
    }) +
    `reset role;
select string_agg(descuento_unitario || '/' || descuento_club_unitario || '/' || coalesce(motivo_descuento, '-') || '/' || round(descuento_unitario / precio_unitario * 100), ' ' order by precio_unitario desc)
  from retail.venta_items where venta_id::text = :'venta';
select monto from retail.club_canjes where venta_id::text = :'venta';
select sum(monto) from retail.venta_pagos where venta_id::text = :'venta';
select precio_cobrado from retail.prendas_por_regularizar p join retail.venta_items vi on vi.id = p.venta_item_id where vi.venta_id::text = :'venta';
`,
  "22.39/6.39/campana/28 4.50/4.50/-/10\n17.28\n155.52\n40.50"
);
caso(
  "(a) el medio céntimo de la base sube (75.45 × 10 % = 7.545 → 7.55, como la web), y el % sale de configuracion_empresa (12.5 %: 79.90 → 9.9875 → 9.99)",
  SEDE() + como(FELIPE) + SOCIA("f", "90990104", "Cumple Medio Prueba", "966990104") + SOCIA("g", "90990105", "Cumple Doce Prueba", "966990105") +
    VENDER("v_medio", { lineas: items(item({ sinClub: 4.45, club: 7.55, motivo: "cerrar_venta" })), clienta: ":'f'", canjear: "true" }) +
    `reset role;
insert into retail.configuracion_empresa (ruc, razon_social, club_cumple_pct) values ('20000000001', 'Prueba Club SAC', 12.5)
  on conflict (id) do update set club_cumple_pct = 12.5;
` +
    como(FELIPE) +
    VENDER("v_doce", { lineas: items(item({ club: 9.99 })), clienta: ":'g'", canjear: "true" }) +
    `reset role;
select descuento_club_unitario from retail.venta_items where venta_id::text = :'v_medio';
select pct, monto from retail.club_canjes where venta_id::text = :'v_doce';
`,
  "7.55\n12.50|9.99"
);

// =====================================================================================================================
// b. Bajo costo
// =====================================================================================================================
const COSTO_75 = `reset role;\nupdate retail.variantes set costo = 75 where id = :'v1';\n`;
caso(
  "(b) con costo 75: el cumpleaños la deja en 71.91, bajo el costo, y PASA (Felipe: es un regalo del club)",
  SEDE() + COSTO_75 + como(FELIPE) + SOCIA("f", "90990201", "Cumple Costo Prueba", "966990201") +
    VENDER("venta", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    `reset role;\nselect subtotal, costo_unitario from retail.venta_items where venta_id::text = :'venta';\n`,
  "71.91|75.00"
);
caso(
  "(b) …pero un descuento normal que la deja bajo el costo sigue fallando, con canje (5.00 + 7.49) o sin él (5.00)",
  SEDE() + COSTO_75 + como(FELIPE) + SOCIA("f", "90990202", "Cumple Costo Dos", "966990202") +
    VENDER("con", { lineas: items(item({ sinClub: 5, club: 7.49, motivo: "cerrar_venta" })), clienta: ":'f'", canjear: "true", token: `'${TOKEN_A}'` }) +
    VENDER("sin", { lineas: items(item({ sinClub: 5, motivo: "cerrar_venta" })) }) +
    `select :'con', :'sin';\n` + NADA_SE_GUARDO(TOKEN_A, "f"),
  "ERROR|P0001|venta_descuento_bajo_costo|ERROR|P0001|venta_descuento_bajo_costo\n0|0|0"
);

// =====================================================================================================================
// c. Un canje por año
// =====================================================================================================================
caso(
  "(c) el segundo canje del año: cumple_ya_canjeado, y no queda la segunda venta (el primero sigue vivo)",
  SEDE() + como(FELIPE) + SOCIA("f", "90990301", "Cumple Dos Veces", "966990301") +
    VENDER("primera", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    VENDER("segunda", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true", token: `'${TOKEN_A}'` }) +
    `select :'segunda';
reset role;
select (select count(*) from retail.ventas where token_cliente = '${TOKEN_A}'),
       (select count(*) from retail.club_canjes where clienta_id = :'f' and anulado_en is null),
       (select venta_id::text = :'primera' from retail.club_canjes where clienta_id = :'f');
`,
  "ERROR|cumple_ya_canjeado\n0|1|t"
);
caso(
  "(c) …y el único parcial lo hace imposible aunque alguien escriba directo en la tabla (23505)",
  SEDE() + como(FELIPE) + SOCIA("f", "90990302", "Cumple Directo Prueba", "966990302") +
    VENDER("venta", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    `reset role;\n` +
    `select pg_temp.intento(format($q$insert into retail.club_canjes (clienta_id, venta_id, tipo, anio, pct, monto) values (%L, %L, 'cumpleanos', %s, 10, 1)$q$, :'f', :'venta', :anio_hoy));\n`,
  (s) => s.startsWith("23505|") && s.includes("club_canjes_uno_vivo_por_anio")
);

// =====================================================================================================================
// d. Quién puede canjear
// =====================================================================================================================
caso(
  "(d) fuera de su mes, o socia sin mes de cumpleaños: cumple_fuera_de_mes; no socia: cumple_no_socia; sin clienta: cumple_sin_clienta — y no queda nada",
  SEDE() + como(FELIPE) +
    SOCIA("otro", "90990401", "Cumple Otro Mes", "966990401", ":'otro_mes'") +
    SOCIA("sin_mes", "90990402", "Cumple Sin Mes", "966990402", "null") +
    ALTA("no_socia", { numero: "90990403", nombre: "Cumple No Socia", celular: "966990403" }) +
    VENDER("r1", { lineas: items(item({ club: 7.99 })), clienta: ":'otro'", canjear: "true", token: `'${TOKEN_A}'` }) +
    VENDER("r2", { lineas: items(item({ club: 7.99 })), clienta: ":'sin_mes'", canjear: "true", token: `'${TOKEN_A}'` }) +
    VENDER("r3", { lineas: items(item({ club: 7.99 })), clienta: ":'no_socia'", canjear: "true", token: `'${TOKEN_A}'` }) +
    VENDER("r4", { lineas: items(item({ club: 7.99 })), canjear: "true", token: `'${TOKEN_A}'` }) +
    `select :'r1', :'r2', :'r3', :'r4';\n` +
    `reset role;\nselect (select count(*) from retail.ventas where token_cliente = '${TOKEN_A}'), (select count(*) from retail.club_canjes where clienta_id in (:'otro', :'sin_mes', :'no_socia')), (select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'v1' and ubicacion_id = :'ubic') - :stock0;\n`,
  "ERROR|cumple_fuera_de_mes|ERROR|cumple_fuera_de_mes|ERROR|cumple_no_socia|ERROR|cumple_sin_clienta\n0|0|0"
);
caso(
  "(d) archivada (sin anonimizar): cumple_no_socia; anonimizada: clienta_anonimizada (la frena la D-1, antes del club) — y no queda nada",
  SEDE() + como(FELIPE) +
    SOCIA("arch", "90990411", "Cumple Archivada", "966990411") +
    SOCIA("anon", "90990412", "Cumple Anonimizada", "966990412") +
    `select retail.archivar_clienta(:'arch', 'se mudó', false, null) as _a \\gset
select retail.archivar_clienta(:'anon', 'pidió que la borren', true, null) as _b \\gset
` +
    VENDER("r1", { lineas: items(item({ club: 7.99 })), clienta: ":'arch'", canjear: "true", token: `'${TOKEN_A}'` }) +
    VENDER("r2", { lineas: items(item({ club: 7.99 })), clienta: ":'anon'", canjear: "true", token: `'${TOKEN_A}'` }) +
    `select :'r1', :'r2';\n` + NADA_SE_GUARDO(TOKEN_A, "arch"),
  "ERROR|cumple_no_socia|ERROR|clienta_anonimizada\n0|0|0"
);

// =====================================================================================================================
// e. El monto lo decide la base
// =====================================================================================================================
caso(
  "(e) la web manda un monto que no es el de la regla: cumple_descuento_distinto (5.00, y 7.97 a 2 céntimos); a 1 céntimo (7.98) pasa y se guarda lo que mandó",
  SEDE() + como(FELIPE) +
    SOCIA("f", "90990501", "Cumple Manipulado", "966990501") + SOCIA("g", "90990502", "Cumple Holgura", "966990502") +
    VENDER("r1", { lineas: items(item({ club: 5 })), clienta: ":'f'", canjear: "true", token: `'${TOKEN_A}'` }) +
    VENDER("r2", { lineas: items(item({ club: 7.97 })), clienta: ":'f'", canjear: "true", token: `'${TOKEN_A}'` }) +
    VENDER("ok", { lineas: items(item({ club: 7.98 })), clienta: ":'g'", canjear: "true" }) +
    `select :'r1', :'r2';
reset role;
select descuento_club_unitario, (select monto from retail.club_canjes where venta_id::text = :'ok') from retail.venta_items where venta_id::text = :'ok';
` + NADA_SE_GUARDO(TOKEN_A, "f"),
  // Stock −1: es la venta de 7.98, que sí pasó; las rechazadas no dejaron venta ni canje.
  "ERROR|cumple_descuento_distinto|ERROR|cumple_descuento_distinto\n7.98|7.98\n0|0|-1"
);
caso(
  "(e) una parte del club sin canjear: cumple_sin_canje (aunque sea socia en su mes); canjear con la parte del club en 0: cumple_descuento_distinto",
  SEDE() + como(FELIPE) + SOCIA("f", "90990511", "Cumple Sin Canje", "966990511") +
    VENDER("r1", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "false", token: `'${TOKEN_A}'` }) +
    VENDER("r2", { lineas: items(item({ club: 0 })), clienta: ":'f'", canjear: "true", token: `'${TOKEN_A}'` }) +
    VENDER("r3", { lineas: items(item()), clienta: ":'f'", canjear: "true", token: `'${TOKEN_A}'` }) +
    `select :'r1', :'r2', :'r3';\n` + NADA_SE_GUARDO(TOKEN_A, "f"),
  "ERROR|cumple_sin_canje|ERROR|cumple_descuento_distinto|ERROR|cumple_descuento_distinto\n0|0|0"
);
caso(
  "(e) un canje que no regala nada (una prenda sin registrar de S/ 0.04: el 10 % redondea a 0.00): cumple_sin_monto, no se gasta el cumpleaños",
  SEDE() + como(FELIPE) + SOCIA("f", "90990521", "Cumple Sin Monto", "966990521") +
    VENDER("r1", { lineas: items(item({ v: LIBRE, precio: "0.04", club: 0, libre: true })), clienta: ":'f'", canjear: "true", token: `'${TOKEN_A}'` }) +
    `select :'r1';\n` + NADA_SE_GUARDO(TOKEN_A, "f"),
  "ERROR|cumple_sin_monto\n0|0|0"
);

// =====================================================================================================================
// f. Los candados de la venta miden SIN la parte del club
// =====================================================================================================================
caso(
  "(f) D-67: Micaela (tope de descuento de venta 10 %) declara 10 % y canjea el cumpleaños → pasa; declara 15 % sin autorización, con o sin canje → 42501, igual que antes",
  SEDE("Tienda Trujillo") + como(FELIPE) + SOCIA("f", "90990601", "Cumple Tope Prueba", "966990601") + como(MICAELA) +
    VENDER("ok", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true", pct: "10" }) +
    VENDER("r1", { lineas: items(item()), pct: "15" }) +
    `select :'r1';
reset role;
select v.descuento_pct, k.monto from retail.ventas v join retail.club_canjes k on k.venta_id = v.id where v.id::text = :'ok';
`,
  (s) => {
    const l = s.split("\n");
    return l.length === 2 && l[0].startsWith("ERROR|42501|") && l[1] === "10.00|7.99";
  }
);
caso(
  "(f) el código de Micaela (10 %) cubre su descuento a mano de 10 % (7.99) aunque con el cumpleaños (7.19) la prenda quede en 19 %; sin el canje, un 19 % a mano sigue pasándose del código",
  SEDE("Tienda Trujillo") + `reset role;
insert into retail.codigos_descuento (codigo, porcentaje, activo) values ('ZZCUMPLE10', 10, true);
` + como(FELIPE) + SOCIA("f", "90990611", "Cumple Codigo Prueba", "966990611") + como(MICAELA) +
    VENDER("ok", { lineas: items(item({ sinClub: 7.99, club: 7.19, motivo: "cerrar_venta" })), clienta: ":'f'", canjear: "true", codigo: "'ZZCUMPLE10'" }) +
    VENDER("r1", { lineas: items(item({ sinClub: 15.18, motivo: "cerrar_venta", argumento: "Clienta frecuente" })), codigo: "'ZZCUMPLE10'" }) +
    `select :'r1';
reset role;
select descuento_unitario, descuento_club_unitario from retail.venta_items where venta_id::text = :'ok';
`,
  "ERROR|P0001|venta_descuento_supera_codigo\n15.18|7.19"
);
caso(
  "(f) el líder: 35 % a mano (27.96, con argumento) + cumpleaños (5.19) = 41 % → pasa; y 12 % a mano (9.59) + cumpleaños (7.03) = 21 % → pasa SIN argumento escrito",
  SEDE() + como(FELIPE) + SOCIA("f", "90990621", "Cumple Lider Prueba", "966990621") + SOCIA("g", "90990622", "Cumple Argumento", "966990622") +
    VENDER("v35", { lineas: items(item({ sinClub: 27.96, club: 5.19, motivo: "liquidacion_temporada", argumento: "Fin de temporada" })), clienta: ":'f'", canjear: "true" }) +
    VENDER("v12", { lineas: items(item({ sinClub: 9.59, club: 7.03, motivo: "cerrar_venta" })), clienta: ":'g'", canjear: "true" }) +
    `reset role;
select string_agg(vi.descuento_unitario || '/' || vi.descuento_club_unitario || '/' || coalesce(vi.argumento_descuento, '-'), ' ' order by vi.descuento_unitario desc)
  from retail.venta_items vi where vi.venta_id::text in (:'v35', :'v12');
`,
  "33.15/5.19/Fin de temporada 16.62/7.03/-"
);

// =====================================================================================================================
// g. Anular libera; una devolución no
// =====================================================================================================================
caso(
  "(g) anular la venta libera el canje (con la hora y la persona de la anulación) y la socia vuelve a canjear este año: un canje vivo, dos en la historia",
  SEDE() + como(FELIPE) + SOCIA("f", "90990701", "Cumple Anulada Prueba", "966990701") +
    VENDER("venta", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    `reset role;
select id as item from retail.venta_items where venta_id::text = :'venta' \\gset
` + como(FELIPE) +
    `select retail.anular_venta(:'venta', 'prueba club_cumpleanos', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))) as _an \\gset
reset role;
select k.anulado_en = v.anulado_en, k.anulado_por = v.anulado_por, k.anulado_por = :'persona_felipe'
  from retail.club_canjes k join retail.ventas v on v.id = k.venta_id where k.venta_id::text = :'venta';
` + como(FELIPE) +
    VENDER("otra", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    `reset role;
select (select count(*) from retail.club_canjes where clienta_id = :'f' and anulado_en is null),
       (select count(*) from retail.club_canjes where clienta_id = :'f'),
       (select venta_id::text = :'otra' from retail.club_canjes where clienta_id = :'f' and anulado_en is null);
`,
  "t|t|t\n1|2|t"
);
caso(
  "(g) una devolución (registrada y aprobada) NO libera el canje: el siguiente canje del año sigue siendo cumple_ya_canjeado",
  SEDE() + como(FELIPE) + SOCIA("f", "90990711", "Cumple Devuelta Prueba", "966990711") +
    VENDER("venta", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    `reset role;
select id as item from retail.venta_items where venta_id::text = :'venta' \\gset
` + como(FELIPE) +
    `select retail.crear_devolucion(:'venta', :'ubic', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'cantidad', 1, 'condicion', 'vendible')), 'prueba club_cumpleanos', 'otro') as dev \\gset
` + como(SANDRA) + intentoCon(`select retail.aprobar_devolucion(%L, null, null)`, ":'dev'") +
    como(FELIPE) +
    VENDER("otra", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    `select :'otra';
reset role;
select (select estado from retail.devoluciones where id = :'dev'), (select count(*) from retail.club_canjes where clienta_id = :'f' and anulado_en is null);
`,
  "SIN_ERROR\nERROR|cumple_ya_canjeado\naprobada|1"
);

// =====================================================================================================================
// h. resumen_clienta_caja
// =====================================================================================================================
const RESUMEN = (f) => `select cumple_disponible, cumple_pct, cumple_canjeado_este_anio from retail.resumen_clienta_caja(:'${f}');\n`;
caso(
  "(h) resumen_clienta_caja: en su mes y sin canje → disponible (t, 10, f); después del canje → (f, 10, t); anulada la venta → otra vez (t, 10, f); otro mes y no socia → (f, 10, f)",
  SEDE() + como(FELIPE) +
    SOCIA("f", "90990801", "Cumple Resumen Prueba", "966990801") +
    SOCIA("otro", "90990802", "Cumple Resumen Otro", "966990802", ":'otro_mes'") +
    ALTA("no_socia", { numero: "90990803", nombre: "Cumple Resumen No", celular: "966990803" }) +
    RESUMEN("f") +
    VENDER("venta", { lineas: items(item({ club: 7.99 })), clienta: ":'f'", canjear: "true" }) +
    RESUMEN("f") +
    `reset role;
select id as item from retail.venta_items where venta_id::text = :'venta' \\gset
` + como(FELIPE) +
    `select retail.anular_venta(:'venta', 'prueba resumen', jsonb_build_array(jsonb_build_object('venta_item_id', :'item', 'condicion', 'vendible'))) as _an \\gset
` +
    RESUMEN("f") + RESUMEN("otro") + RESUMEN("no_socia"),
  "t|10.00|f\nf|10.00|t\nt|10.00|f\nf|10.00|f\nf|10.00|f"
);
caso(
  "(h) …y el % es el de configuracion_empresa (12.5)",
  SEDE() + `reset role;
insert into retail.configuracion_empresa (ruc, razon_social, club_cumple_pct) values ('20000000001', 'Prueba Club SAC', 12.5)
  on conflict (id) do update set club_cumple_pct = 12.5;
` + como(FELIPE) + SOCIA("f", "90990811", "Cumple Resumen Doce", "966990811") + RESUMEN("f"),
  "t|12.50|f"
);

// =====================================================================================================================
// i. Estructura
// =====================================================================================================================
caso(
  "(i) una sola firma de registrar_venta (la de 17, con p_canjear_cumpleanos) y la llamada de la web resuelve (explain por nombre, sin «is not unique»)",
  `select count(*), to_regprocedure('${RV_NUEVA}') is not null, to_regprocedure('${RV_VIEJA}') is null
  from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_venta';
explain select retail.registrar_venta(p_ubicacion_id => gen_random_uuid(), p_items => '[]'::jsonb, p_pagos => '[]'::jsonb,
  p_token => gen_random_uuid(), p_tipo_comprobante => 'boleta', p_cliente_tipo_doc => 'dni', p_cliente_id => null,
  p_asesora_id => null, p_canjear_cumpleanos => true);
`,
  (s) => s.startsWith("1|t|t\n") && s.includes("Result")
);
caso(
  `(i) los md5 «después» de la sección 0 son los de las funciones vivas; el «antes» de registrar_venta es el «después» de la tanda 1a (${DESPUES_1A})`,
  VERSIONES.map(
    (v) => `select coalesce((select ${md5Norm("p.prosrc")} from pg_proc p where p.oid = to_regprocedure('${v.firma}')), 'NO_EXISTE');\n`
  ).join(""),
  (s) =>
    s === VERSIONES.map((v) => v.despues ?? "NO_EXISTE").join("\n") &&
    VERSIONES.find((v) => v.firma === RV_VIEJA)?.antes === DESPUES_1A
);
caso(
  "(i) permisos: registrar_venta y resumen_clienta_caja solo para authenticated (sin PUBLIC ni anon); el disparador no lo ejecuta la API",
  `select proacl::text from pg_proc where oid = '${RV_NUEVA}'::regprocedure;
select proacl::text from pg_proc where oid = 'retail.resumen_clienta_caja(uuid)'::regprocedure;
select has_function_privilege('authenticated', 'retail.fn_club_canje_libera_al_anular()', 'execute'),
       has_function_privilege('anon', 'retail.fn_club_canje_libera_al_anular()', 'execute');
`,
  "{postgres=X/postgres,authenticated=X/postgres}\n{postgres=X/postgres,authenticated=X/postgres}\nf|f"
);
caso(
  "(i) club_canjes: RLS encendido sin políticas y sin permisos para la API; el único parcial por (clienta, tipo, año) vivo; el disparador sobre ventas",
  `select relrowsecurity, (select count(*) from pg_policy where polrelid = 'retail.club_canjes'::regclass),
       has_table_privilege('authenticated', 'retail.club_canjes', 'select'), has_table_privilege('anon', 'retail.club_canjes', 'select'),
       has_table_privilege('authenticated', 'retail.club_canjes', 'insert')
  from pg_class where oid = 'retail.club_canjes'::regclass;
select replace(indexdef, 'retail.', '') from pg_indexes where schemaname = 'retail' and indexname = 'club_canjes_uno_vivo_por_anio';
select tgname || ':' || tgenabled::text from pg_trigger where tgrelid = 'retail.ventas'::regclass and tgname = 'trg_club_canje_libera_al_anular';
`,
  "t|0|f|f|f\nCREATE UNIQUE INDEX club_canjes_uno_vivo_por_anio ON club_canjes USING btree (clienta_id, tipo, anio) WHERE (anulado_en IS NULL)\ntrg_club_canje_libera_al_anular:O"
);
caso(
  "(i) las columnas: venta_items.descuento_club_unitario (0, con su candado validado; el del motivo sigue «not valid») y configuracion_empresa.club_cumple_pct (10, entre 1 y 50)",
  `select column_default, is_nullable from information_schema.columns where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'descuento_club_unitario';
select string_agg(conname || ':' || convalidated, ',' order by conname) from pg_constraint
 where conrelid = 'retail.venta_items'::regclass and conname in ('venta_items_descuento_club_valido', 'venta_items_motivo_coherente_con_descuento');
select column_default, is_nullable from information_schema.columns where table_schema = 'retail' and table_name = 'configuracion_empresa' and column_name = 'club_cumple_pct';
select pg_get_constraintdef(oid) from pg_constraint where conname = 'configuracion_empresa_club_cumple_pct_valido';
`,
  "0|NO\nventa_items_descuento_club_valido:true,venta_items_motivo_coherente_con_descuento:false\n10|NO\nCHECK (((club_cumple_pct >= (1)::numeric) AND (club_cumple_pct <= (50)::numeric)))"
);

// Una foto de todo lo que tocan las tres partes: cuerpo y permisos de las funciones, columnas (con default y comentario),
// candados e índices de venta_items, configuracion_empresa y club_canjes, los disparadores de ventas y el RLS. Una línea: su
// md5. Y aparte, las firmas de registrar_venta.
const TABLAS = ["retail.venta_items", "retail.configuracion_empresa", "retail.club_canjes"];
const FOTO = `reset role;
select md5(string_agg(x, '|' order by x)) from (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')=' || md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), '')
    || ':' || coalesce(obj_description(p.oid, 'pg_proc'), '')
    from pg_proc p where p.pronamespace = 'retail'::regnamespace
     and p.proname in ('registrar_venta', 'resumen_clienta_caja', 'fn_club_canje_libera_al_anular', 'anular_venta')
  union all
  select 'col:' || a.attrelid::regclass || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':'
         || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ':' || coalesce(col_description(a.attrelid, a.attnum), '')
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid in (${TABLAS.map((t) => `'${t}'::regclass`).join(", ")}) and a.attnum > 0 and not a.attisdropped
  union all
  select 'con:' || conrelid::regclass || ':' || conname || ':' || pg_get_constraintdef(oid) || ':' || convalidated
    from pg_constraint where conrelid in (${TABLAS.map((t) => `'${t}'::regclass`).join(", ")})
  union all
  select 'idx:' || indexdef from pg_indexes where schemaname = 'retail' and tablename in ('venta_items', 'configuracion_empresa', 'club_canjes')
  union all
  select 'trg:' || pg_get_triggerdef(t.oid) from pg_trigger t where t.tgrelid = 'retail.ventas'::regclass and not t.tgisinternal
  union all
  select 'rls:' || relname || ':' || relrowsecurity || ':' || coalesce(array_to_string(relacl, ','), '') from pg_class
   where oid in (${TABLAS.map((t) => `'${t}'::regclass`).join(", ")})
) f(x);
select string_agg(p.oid::regprocedure::text, ',') from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta';
`;
const PEGAR_TODO = PARTES.map((p) => `${p}\n`).join("") + "set local search_path = retail, public, extensions;\n";
caso(
  "(i) pegar las tres partes OTRA VEZ deja todo igual (funciones, permisos, columnas, candados, índices, disparadores, RLS) y una sola firma",
  FOTO + PEGAR_TODO + FOTO,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 4 && l[0] === l[2] && l[1] === l[3] && l[1].endsWith("numeric,uuid,text,boolean)") && !l[1].includes("),");
  }
);
// Con una función cambiada en vivo (alguien la corrigió en producción después de escribir esto), la PARTE 3 no la pisa:
// aborta en el candado y no toca nada. Sin ON_ERROR_STOP y dentro de un savepoint: si abortara a medias, la foto lo delata.
caso(
  "(i) con registrar_venta cambiada en vivo, la PARTE 3 aborta con un mensaje claro y no toca nada",
  `reset role;
do $cambio$ begin
  execute replace(pg_get_functiondef('${RV_NUEVA}'::regprocedure), 'El carrito está vacío', 'El carrito está vacío (cambiado en vivo)');
end $cambio$;
` +
    FOTO +
    `\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${PARTE3}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\n` +
    `set local search_path = retail, public, extensions;\n` +
    FOTO,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 4 && l[0] === l[2] && l[1] === l[3];
  }
);
// Pegar HOY la tanda 1b por error (con la 1c encima) no puede devolverle a resumen_clienta_caja su forma vieja (la caja
// dejaría de ver el cumpleaños): aborta al querer cambiarle el tipo de retorno, y como el SQL Editor corre todo en una
// transacción, no queda nada a medias.
const PASO_1B = ["20260930200000_club_paso1b_parte1_whatsapp_tienda.sql", "20260930200100_club_paso1b_parte2_permisos_y_qr.sql"]
  .map((n) => leer("supabase", "migrations", n))
  .join("\n");
caso(
  "(i) pegar HOY la tanda 1b (con la 1c encima) aborta y no pisa nada: resumen_clienta_caja sigue con el cumpleaños",
  FOTO +
    `\\set ON_ERROR_STOP off\nsavepoint antes_de_pegar;\n${PASO_1B}\n\\if :ERROR\nrollback to savepoint antes_de_pegar;\n\\endif\n\\set ON_ERROR_STOP on\n` +
    `set local search_path = retail, public, extensions;\n` +
    FOTO,
  (s) => {
    const l = s.split("\n").filter(Boolean);
    return l.length === 4 && l[0] === l[2] && l[1] === l[3];
  }
);
{
  const r = correr(`${PRELUDIO}reset role;\n${PASO_1B}\nrollback;`);
  registrar(
    "(i) …porque no puede cambiarle el tipo de retorno a resumen_clienta_caja",
    !r.ok && r.mensaje.includes("cannot change return type of existing function"),
    r.ok ? "no abortó" : r.mensaje.split("\n").find((x) => x.includes("ERROR")),
    "ERROR: cannot change return type of existing function"
  );
}
{
  // El mensaje del candado (el caso «con registrar_venta cambiada en vivo» lo corre sin ON_ERROR_STOP: aquí se lee aparte).
  const r = correr(`${PRELUDIO}reset role;
do $cambio$ begin
  execute replace(pg_get_functiondef('${RV_NUEVA}'::regprocedure), 'El carrito está vacío', 'El carrito está vacío (cambiado en vivo)');
end $cambio$;
${PARTE3}
rollback;`);
  registrar(
    "(i) con registrar_venta cambiada en vivo, el mensaje dice qué función cambió y que se rehaga sobre la versión viva",
    !r.ok && r.mensaje.includes(`${RV_NUEVA} cambió desde que se escribió esta migración`) && r.mensaje.includes("lee su definición viva"),
    r.ok ? "no abortó" : r.mensaje.split("\n").find((x) => x.includes("ERROR")),
    "ERROR: … cambió desde que se escribió esta migración … lee su definición viva …"
  );
}

/**
 * Los textos entre comillas simples FUERA de un cuerpo `$…$` y fuera de comentarios, con su `select … into` si lo tienen. El
 * SQL Editor de Supabase toma un `select … into <nombre>` dentro de ese texto por un SELECT INTO que crea una tabla, agrega
 * un `alter table <nombre> enable row level security` y el pegado falla (CLAUDE.md, «El SQL Editor agrega líneas por su
 * cuenta»; ADR-0288). Dentro de un `$…$` no lo mira.
 */
function intoEnTextos(sql) {
  const hallados = [];
  let k = 0;
  while (k < sql.length) {
    if (sql.startsWith("--", k)) {
      const fin = sql.indexOf("\n", k);
      k = fin < 0 ? sql.length : fin + 1;
    } else if (sql.startsWith("/*", k)) {
      const fin = sql.indexOf("*/", k + 2);
      k = fin < 0 ? sql.length : fin + 2;
    } else if (sql[k] === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(k));
      if (!m) {
        k++;
        continue;
      }
      const fin = sql.indexOf(m[0], k + m[0].length);
      k = fin < 0 ? sql.length : fin + m[0].length;
    } else if (sql[k] === "'") {
      let j = k + 1;
      let texto = "";
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          texto += "'";
          j += 2;
        } else if (sql[j] === "'") {
          break;
        } else {
          texto += sql[j++];
        }
      }
      if (/\bselect\b[\s\S]*?\binto\b/i.test(texto)) hallados.push(texto.replace(/\s+/g, " ").slice(0, 80));
      k = j + 1;
    } else {
      k++;
    }
  }
  return hallados;
}
chequeo(
  "(i) ningún `select … into` dentro de un texto entre comillas fuera de `$…$` en las tres partes (el SQL Editor lo confunde con un SELECT INTO)",
  ARCHIVOS.map((n, x) => intoEnTextos(PARTES[x]).map((t) => `${n}: ${t}`)).flat().join(" · ") || "ninguno",
  "ninguno"
);
chequeo(
  "(i) …y el vigilante muerde: lo ve en un texto entre comillas (también con '' adentro), no dentro de $…$ ni en un comentario",
  JSON.stringify([
    intoEnTextos(`select pg_temp.r('x', 'begin select a into v_a from t; end');`).length,
    intoEnTextos(`select pg_temp.r('x', 'raise ''hola''; select a into v_a from t');`).length,
    intoEnTextos(`do $d$ begin select a into v_a from t; end $d$; select 'hola';`).length,
    intoEnTextos(`-- select 'select a into b'\nselect 1;`).length,
  ]),
  "[1,1,0,0]"
);

// =====================================================================================================================
// j. Dos cajas a la vez (dos conexiones reales)
// =====================================================================================================================
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** Antes de la sesión B: espera (hasta 10 s) a que A esté dormida con su transacción abierta, y dice si la vio. */
const esperarA = (app) => `do $espera$ begin
  for i in 1..200 loop
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
    perform pg_sleep(0.05);
  end loop;
end $espera$;
select exists (select 1 from pg_stat_activity where application_name = '${app}' and wait_event = 'PgSleep');
`;
/** Una venta con canje que dice DÓNDE esperó si no pudo tomar un candado en 1 s (lock_timeout). */
const DONDE_ESPERA = `
create function pg_temp.donde_espera(p_ubic uuid, p_items jsonb, p_clienta uuid, p_canjear boolean, p_token uuid) returns text
language plpgsql as $f$
declare v_estado text; v_contexto text; v_id uuid; v_hint text;
begin
  v_id := retail.registrar_venta(p_ubicacion_id => p_ubic, p_items => p_items,
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto',
      (select sum(((e ->> 'precio_unitario')::numeric - (e ->> 'descuento_unitario')::numeric) * (e ->> 'cantidad')::integer) from jsonb_array_elements(p_items) e))),
    p_cliente_id => p_clienta, p_token => p_token, p_canjear_cumpleanos => p_canjear);
  return 'SIN_ESPERA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_contexto = pg_exception_context, v_hint = pg_exception_hint;
  return v_estado || '|' || case when v_estado <> '55P03' then coalesce(v_hint, '')
                                 when v_contexto ~* 'from retail\\.clientas c where c\\.id = p_cliente_id'
                                   or (v_contexto ~* 'locking tuple .* in relation "clientas"' and v_contexto ~* 'at FOR over SELECT rows')
                                   then 'en la lectura de la ficha'
                                 else 'en otra sentencia: ' || regexp_replace(v_contexto, '\\s+', ' ', 'g') end;
end $f$;
grant execute on function pg_temp.donde_espera(uuid, jsonb, uuid, boolean, uuid) to authenticated;
`;
async function carrera(nombre, fn) {
  casos++;
  let obtenido;
  let bien;
  try {
    [bien, obtenido] = await fn();
  } catch (e) {
    [bien, obtenido] = [false, `ERROR_DE_SCRIPT ${e.message}`];
  }
  if (!bien) fallas++;
  console.log(`${bien ? "✓" : "✗"} ${nombre}${bien ? "" : `\n    obtenido: ${String(obtenido).split("\n").join("\n              ")}`}`);
}
const LINEA_CUMPLE = items(item({ club: 7.99 }));

await carrera(
  "(j1) una caja canjea el cumpleaños de una socia y, mientras guarda, otra caja canjea a la MISMA socia: la segunda ESPERA en la lectura de la ficha (sin COMMIT: las dos terminan en ROLLBACK)",
  async () => {
    const ficha = correr(`select id from retail.clientas where not anonimizada and archivada_en is null and fusionada_en_id is null
  and documento_numero is not null and nombre is not null order by documento_numero limit 1;`);
    if (!ficha.ok || !ficha.salida) return [false, `no hay fichas en la base (el seed trae 8): ${ficha.mensaje ?? ""}`];
    const app = `club_cumpleanos_a_${Date.now()}`;
    // A: la hace socia en su mes (dentro de su transacción), canjea y duerme sin confirmar.
    const a = psqlEnParalelo(`set application_name = '${app}';
${PRELUDIO_BASE}${SEDE()}${como(FELIPE)}
select codigo_club as _c from retail.unirse_al_club(p_clienta_id => '${ficha.salida}', p_telefono_whatsapp => '966999001', p_cumple_dia => 15::smallint, p_cumple_mes => :'mes_hoy'::smallint) \\gset
${VENDER("venta", { lineas: LINEA_CUMPLE, clienta: `'${ficha.salida}'`, canjear: "true" })}select :'venta' ~ '^[0-9a-f-]{36}$';
select pg_sleep(3);
rollback;
`);
    await dormir(100);
    const b = await psqlEnParalelo(`${PRELUDIO_BASE}${DONDE_ESPERA}${SEDE("Tienda Trujillo")}${esperarA(app)}set local lock_timeout = '1s';
${como(FELIPE)}select pg_temp.donde_espera(:'ubic', ${LINEA_CUMPLE}, '${ficha.salida}', true, gen_random_uuid());
rollback;
`);
    const ra = await a;
    const obtenido = `${ra.ok ? `A: ${ra.salida}` : `A falló: ${ra.mensaje}`}\n${b.ok ? b.salida : `B falló: ${b.mensaje}`}`;
    return [ra.ok && ra.salida.endsWith("t") && b.ok && b.salida === "t\n55P03|en la lectura de la ficha", obtenido];
  }
);

// (j2)–(j4) commitean (dejan una socia y sus ventas de prueba): solo contra un Postgres desechable, como las carreras con
// COMMIT de club_venta_ligada. En el CI no corren; ahí vigila (j1).
if (process.env.BASE_DESECHABLE === "1") {
  /** Una socia nueva, en su mes, CONFIRMADA (visible para las dos cajas). Devuelve su id. */
  const socia = () => {
    const dni = `7${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const cel = `96${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const r = correr(`begin;
set local search_path = retail, public, extensions;
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
${como(FELIPE)}${ALTA("f", { numero: dni, nombre: "Prueba Carrera Cumple", celular: cel })}
select codigo_club as _c from retail.unirse_al_club(p_clienta_id => :'f', p_telefono_whatsapp => '${cel}', p_cumple_dia => 15::smallint,
  p_cumple_mes => extract(month from retail.fn_hoy_lima())::smallint) \\gset
select :'f';
commit;`);
    return r.ok ? r.salida.split("\n").pop() : null;
  };
  /** Una caja (sesión propia, en su tienda) que vende con o sin canje, duerme `dormirS` s con la transacción abierta y
   *  confirma. Cada caja en su tienda: así no se esperan por la caja ni por el stock, solo por la ficha. */
  const caja = (app, ficha, { canjear = true, token = "gen_random_uuid()", dormirS = 0, lineas = LINEA_CUMPLE, tienda = "Tienda Lima" } = {}) => `set application_name = '${app}';
${PRELUDIO_BASE}${SEDE(tienda)}${como(FELIPE)}${VENDER("venta", { lineas, clienta: `'${ficha}'`, canjear: String(canjear), token })}select :'venta';
${dormirS ? `select pg_sleep(${dormirS});` : ""}
commit;
`;

  await carrera(
    "(j2) con COMMIT: dos cajas canjean a la vez a la misma socia → pasa UNA y la otra recibe cumple_ya_canjeado; un solo canje vivo",
    async () => {
      const f = socia();
      if (!f) return [false, "no pude crear la socia"];
      const app = `club_cumpleanos_j2_${Date.now()}`;
      const a = psqlEnParalelo(caja(app, f, { dormirS: 3 }));
      await dormir(100);
      const b = await psqlEnParalelo(`${esperarA(app)}${caja(`${app}_b`, f, { tienda: "Tienda Trujillo" })}`);
      const ra = await a;
      const vivos = correr(`select count(*) from retail.club_canjes where clienta_id = '${f}' and anulado_en is null;`);
      const idA = ra.ok ? ra.salida.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l)) : null;
      const obtenido = `A: ${ra.ok ? ra.salida : ra.mensaje}\nB: ${b.ok ? b.salida : b.mensaje}\nvivos: ${vivos.salida ?? vivos.mensaje}`;
      return [Boolean(idA) && b.ok && b.salida.endsWith("ERROR|cumple_ya_canjeado") && vivos.salida === "1", obtenido];
    }
  );

  await carrera(
    "(j3) sobre una socia confirmada: mientras una caja canjea (sin confirmar), una venta SIN canje a la misma socia no espera (su `for key share` no choca con el canje)",
    async () => {
      const f = socia();
      if (!f) return [false, "no pude crear la socia"];
      const app = `club_cumpleanos_j3_${Date.now()}`;
      const a = psqlEnParalelo(caja(app, f, { dormirS: 3 }).replace("commit;", "rollback;"));
      await dormir(100);
      const c = await psqlEnParalelo(`${PRELUDIO_BASE}${DONDE_ESPERA}${SEDE("Tienda Trujillo")}${esperarA(app)}set local lock_timeout = '1s';
${como(FELIPE)}select pg_temp.donde_espera(:'ubic', ${items(item())}, '${f}', false, gen_random_uuid());
rollback;
`);
      const ra = await a;
      const obtenido = `A: ${ra.ok ? "ok" : ra.mensaje}\nC: ${c.ok ? c.salida : c.mensaje}`;
      return [ra.ok && c.ok && c.salida === "t\nSIN_ESPERA", obtenido];
    }
  );

  await carrera(
    "(j4) con COMMIT: la MISMA venta reintentada (mismo token) mientras la primera se guarda → las dos reciben la misma venta, y hay un solo canje",
    async () => {
      const f = socia();
      if (!f) return [false, "no pude crear la socia"];
      const token = `'${crypto.randomUUID()}'`;
      const app = `club_cumpleanos_j4_${Date.now()}`;
      const a = psqlEnParalelo(caja(app, f, { dormirS: 3, token }));
      await dormir(100);
      const b = await psqlEnParalelo(`${esperarA(app)}${caja(`${app}_b`, f, { token, tienda: "Tienda Trujillo" })}`);
      const ra = await a;
      const idA = ra.ok ? ra.salida.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l)) : null;
      const idB = b.ok ? b.salida.split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l)) : null;
      const canjes = correr(`select count(*) from retail.club_canjes where clienta_id = '${f}';`);
      const obtenido = `A: ${ra.ok ? ra.salida : ra.mensaje}\nB: ${b.ok ? b.salida : b.mensaje}\ncanjes: ${canjes.salida ?? canjes.mensaje}`;
      return [Boolean(idA) && idA === idB && canjes.salida === "1", obtenido];
    }
  );
} else {
  console.log("· (j2), (j3) y (j4), las carreras con COMMIT, no corrieron: solo corren con BASE_DESECHABLE=1 (dejan socias de prueba)");
}

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
