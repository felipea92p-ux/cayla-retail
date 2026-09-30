#!/usr/bin/env node
/**
 * Pruebas de la tanda 1d del club de clientas (ADR-0288 D-6 y D-7; acta CL-7, CL-14 y D-101; migración en cuatro partes:
 * `20260930240000_club_paso1d_parte1_pedidos.sql`, `20260930240100_club_paso1d_parte2_se_probo.sql` y, EN ESPERA hasta que
 * Felipe decida si «es para regalo» se queda, `20260930240200_club_paso1d_parte3_regalo_venta_items.sql` y
 * `20260930240300_club_paso1d_parte4_regalo_ficha.sql`).
 *
 * EL PROBLEMA. «Se la probó y no la llevó» no quedaba en ningún lado, y una prenda comprada para regalar se volvía «su
 * talla» en la ficha. La base tiene que hacer cumplir, no la pantalla:
 *   D-6  `pedidos_no_atendidos` guarda las dos señales con su `motivo` (`no_habia_talla`, el de siempre, o
 *        `se_probo_no_llevo`) y una `razon` opcional que SOLO existe con «se la probó» (`no_le_quedo`, `precio`, `color`,
 *        `lo_piensa`). Todo lo anotado antes queda «buscó y no había». La llamada vieja (5 parámetros) sigue igual.
 *   D-7  `venta_items.es_regalo` (false por defecto) y `fn_clienta_compras` lo devuelve, para que `deducirTallas` salte
 *        esa prenda (la regla de la talla es TypeScript: la prueba lib/clienta-actividad-reglas.test.ts).
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`
 * para que los permisos se evalúen de verdad; cuentas del seed: Felipe, líder; Micaela, integrante de Trujillo):
 *   a. `registrar_pedido_no_atendido`: la llamada vieja anota `no_habia_talla` sin razón y firmada por quien anota;
 *      «se la probó» con y sin razón, con y sin clienta, con producto del catálogo o descripción; los rechazos
 *      (`pedido_razon_sin_se_probo`, `pedido_motivo_invalido`, `pedido_razon_invalida`) no dejan fila; el candado de
 *      ubicación sigue; `anon` no la ejecuta.
 *   b. El esquema, sin la función: un insert directo con razón y sin «se la probó», con un motivo inventado o sin motivo.
 *   c. Lo de antes: filas anotadas antes de la tanda 1d quedan `no_habia_talla` al correr la PARTE 1.
 *   d. (PARTES 3 y 4, en espera) `venta_items.es_regalo` (not null, default false); una venta de hoy guarda false;
 *      `fn_clienta_compras` trae `es_regalo` (una prenda de regalo y una suya), sigue exigiendo el módulo «Clientas» y sigue
 *      sin EXECUTE para `anon`.
 *   e. Estructura y pegado: una sola firma de cada función, los md5 «después» de cada sección 0 son los de las funciones
 *      vivas, pegar las cuatro partes dos veces deja lo mismo, con una función cambiada en vivo aborta sin pisar, cada parte
 *      aborta si falta la anterior, cada parte toma a lo más UNA tabla con `alter` (así no se traba en cruz con una venta,
 *      como encontró la 1c), sin la PARTE 3 una venta funciona igual (la marca de regalo puede salir entera), y ningún
 *      archivo tiene políticas, `drop trigger` ni `select … into` en un texto entre comillas (CLAUDE.md, ADR-0195, ADR-0288).
 *
 * FUERA A PROPÓSITO: que `registrar_venta` guarde `es_regalo` desde `p_items` (en espera de Felipe). La pregunta «¿Se la
 * probó y no la llevó?» de Cobrar es web: su regla pura la prueba apps/web/lib/se-probo-reglas.test.ts.
 *
 * USO
 *   pnpm pruebas:club-regalo-y-se-probo                  → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-regalo-y-se-probo --base cayla_x   → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const PARTES = [
  "20260930240000_club_paso1d_parte1_pedidos.sql",
  "20260930240100_club_paso1d_parte2_se_probo.sql",
  "20260930240200_club_paso1d_parte3_regalo_venta_items.sql",
  "20260930240300_club_paso1d_parte4_regalo_ficha.sql",
].map((nombre) => ({ nombre, sql: readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8") }));
const [PARTE_1, PARTE_2, PARTE_3, PARTE_4] = PARTES.map((p) => p.sql);
/** Las cuatro partes seguidas, como corren en local y en el CI. */
const MIGRACION = PARTES.map((p) => p.sql).join("\n");

// La tabla del candado de versión de la sección 0: firma → md5 normalizado «antes» (producción) y «después» (null = la firma
// no existe de ese lado).
const VERSIONES = [
  ...MIGRACION.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+(null|'([0-9a-f]{32})'),\s+(null|'([0-9a-f]{32})')\)/g),
].map((m) => ({ firma: m[1], antes: m[3] ?? null, despues: m[5] ?? null }));
if (VERSIONES.length !== 3) {
  console.error(`✗ La tabla de versiones de la migración debería tener 3 filas y tiene ${VERSIONES.length}.`);
  process.exit(1);
}
const FIRMA_PEDIDO = "retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid,text,text)";
const FIRMA_PEDIDO_VIEJA = "retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid)";
const FIRMA_COMPRAS = "retail.fn_clienta_compras(uuid)";


// Seed local: Felipe (líder y Admin), Micaela (integrante de Trujillo).
const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

try {
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
} catch {
  console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
  process.exit(1);
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Lo que todo caso necesita, dentro de su transacción. */
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
-- Intenta una sentencia y devuelve «SQLSTATE|hint» si el hint es uno de los nuestros (un identificador estable), o
-- «SQLSTATE|mensaje» si no, o SIN_ERROR. No es security definer: corre con los permisos de quien la llama.
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

-- Vende las prendas de p_items (jsonb de registrar_venta) con o sin clienta. Devuelve el id de la venta, o «ERROR|hint» (o
-- «ERROR|mensaje»). No es security definer: la llama la cuenta del caso.
create function pg_temp.vender(p_ubic uuid, p_items jsonb, p_total numeric, p_clienta uuid) returns text language plpgsql as $f$
declare v_id uuid; v_msg text; v_hint text;
begin
  v_id := retail.registrar_venta(
    p_ubicacion_id => p_ubic,
    p_items => p_items,
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', p_total)),
    p_cliente_id => p_clienta,
    p_token => gen_random_uuid(),
    p_cliente_tipo_doc => 'sin_documento'
  );
  return v_id::text;
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
  return 'ERROR|' || case when v_hint ~ '^[a-z][a-z0-9_]*$' then v_hint else v_msg end;
end;
$f$;
grant execute on function pg_temp.vender(uuid, jsonb, numeric, uuid) to authenticated;

-- Una persona firma a su nombre, como hoy en el mostrador; y la integrante, con Clientas (así están en producción).
update retail.configuracion_empresa set exige_responsable = false;
insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), 'clientas' on conflict do nothing;

select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as prod from retail.productos where referencia = 'Blusa Emma' \\gset
select id as felipe_id from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela_id from public.personas where auth_user_id = '${MICAELA}' \\gset
`;

/** Cambia de cuenta (sin responsable en el combo). */
const como = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
`;
/** Como `pg_temp.intento`, con variables de psql: psql no las reemplaza entre $q$, así que van por `format` (%L). */
const intentoCon = (sql, ...vars) => `select pg_temp.intento(format($q$${sql}$q$${vars.length ? ", " + vars.join(", ") : ""}));\n`;
/** Cuántas filas de pedidos hay en la sede (para ver que un rechazo no dejó nada). */
const CUANTOS = (alias) => `reset role;\nselect count(*) as ${alias} from retail.pedidos_no_atendidos \\gset\n`;

/**
 * Una sede lista para vender (como en club_venta_ligada.mjs): piso y almacén si faltaran, su caja abierta por el líder y
 * 100 unidades de BLU-EMMA-NEG-M y BLU-EMMA-BEI-S en el piso. Deja :ubic, :v1, :v1_precio, :v2 y :v2_precio.
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
select retail.abrir_caja(:'ubic', 100.00, 'prueba club_regalo_y_se_probo') as caja_id \\gset
select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v2, precio as v2_precio from retail.variantes where sku = 'BLU-EMMA-BEI-S' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 100, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v2', :'ubic', :'sub_piso', 'entrada', 100, 'colchón de prueba') returning id as mov2 \\gset
select retail.fn_aplicar_movimiento(:'mov2') as _d2 \\gset
`;
/** Una línea de `p_items`, a precio de lista (`es_regalo`: null = no se manda la llave). */
const ITEM = (variante, precio, esRegalo = null) =>
  `jsonb_build_object('variante_id', :'${variante}', 'cantidad', 1, 'precio_unitario', :'${precio}'::numeric, 'descuento_unitario', 0${
    esRegalo === null ? "" : `, 'es_regalo', ${esRegalo}`
  })`;
/** `select pg_temp.vender(...) as <alias> \gset` con las líneas dadas y el total que suman. */
const VENDER = (alias, items, total, clienta = "null") =>
  `select pg_temp.vender(:'ubic', jsonb_build_array(${items.join(", ")}), ${total}, ${clienta}) as ${alias} \\gset\n`;
/** Alta de ficha por la RPC (la cuenta ya elegida). */
const ALTA = (alias, numero, nombre) =>
  `select retail.registrar_clienta(p_documento_tipo => 'dni', p_documento_numero => '${numero}', p_nombre => '${nombre}') as ${alias} \\gset\n`;

const md5Norm = (expr) =>
  `md5(regexp_replace(regexp_replace(regexp_replace(${expr}, '/\\*.*?\\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\\s+', '', 'g'))`;
/** Una línea por firma de la tabla de versiones: el md5 normalizado vivo (NO_EXISTE si no existe). */
const MD5_VIVOS = VERSIONES.map(
  (v) => `select coalesce((select ${md5Norm("p.prosrc")} from pg_proc p where p.oid = to_regprocedure('${v.firma}')), 'NO_EXISTE');\n`
).join("");
const MD5_ESPERADOS = VERSIONES.map((v) => v.despues ?? "NO_EXISTE").join("\n");

let fallas = 0;
let casos = 0;
/** Un caso que termina en ROLLBACK. `esperado`: el texto exacto que imprime, o una función que lo juzga. */
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    const e = typeof esperado === "function" ? "(condición)" : esperado.split("\n").join("\n              ");
    console.log(`✗ ${nombre}\n    esperado: ${e}\n    obtenido: ${obtenido.split("\n").join("\n              ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
/** Un caso que DEBE fallar la conexión entera (el pegado que aborta): el mensaje tiene que contener `contiene`. */
function casoQueAborta(nombre, sql, contiene) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (r.ok) {
    fallas++;
    console.log(`✗ ${nombre}\n    se esperaba un error («${contiene}») y no hubo ninguno`);
  } else if (!r.mensaje.includes(contiene)) {
    fallas++;
    console.log(`✗ ${nombre}\n    se esperaba un error con «${contiene}», salió:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
/** Un chequeo del archivo, sin base. */
function estatico(nombre, bien, detalle = "") {
  casos++;
  if (bien) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}${detalle ? `\n    ${detalle}` : ""}`);
  }
}

/** La fila recién anotada: motivo|razón (∅ = sin razón)|¿con clienta?|¿firmada por quien anotó? */
const FILA = (pedido, firmante = "felipe_id") => `reset role;
select motivo, coalesce(razon, '∅'), clienta_id is not null, atendido_por = :'${firmante}'
  from retail.pedidos_no_atendidos where id = :'${pedido}';
`;

// =====================================================================================================================
// a. registrar_pedido_no_atendido: motivo y razón (D-6)
// =====================================================================================================================
caso(
  "(a) la llamada vieja (5 parámetros, como «Anotar que no había» y Cambios) anota «buscó y no había», sin razón, firmada por quien anota",
  como(FELIPE) +
    `select retail.registrar_pedido_no_atendido(:'lima', null::uuid, 'Blusa Carlita · Blanco', 'M', null::uuid) as p \\gset\n` +
    FILA("p") +
    `select talla, descripcion_libre from retail.pedidos_no_atendidos where id = :'p';\n`,
  "no_habia_talla|∅|f|t\nM|Blusa Carlita · Blanco"
);
caso(
  "(a) «se la probó y no la llevó» con razón, producto del catálogo y clienta: guarda todo",
  como(FELIPE) +
    ALTA("clienta", "90881401", "Se Probo Prueba") +
    `select retail.registrar_pedido_no_atendido(p_ubicacion_id => :'lima', p_producto_id => :'prod', p_talla => 'S',
       p_clienta_id => :'clienta', p_motivo => 'se_probo_no_llevo', p_razon => 'no_le_quedo') as p \\gset\n` +
    FILA("p") +
    `select producto_id = :'prod', talla, clienta_id = :'clienta' from retail.pedidos_no_atendidos where id = :'p';\n`,
  "se_probo_no_llevo|no_le_quedo|t|t\nt|S|t"
);
caso(
  "(a) «se la probó» sin razón (es opcional) y sin clienta (sigue siendo demanda para Compras)",
  como(FELIPE) +
    `select retail.registrar_pedido_no_atendido(p_ubicacion_id => :'lima', p_descripcion_libre => 'Falda plisada',
       p_motivo => 'se_probo_no_llevo') as p \\gset\n` +
    FILA("p"),
  "se_probo_no_llevo|∅|f|t"
);
caso(
  "(a) cada razón de la lista entra (no_le_quedo, precio, color, lo_piensa), recortada de espacios",
  como(FELIPE) +
    ["no_le_quedo", "  precio ", "color", "lo_piensa"]
      .map(
        (r, n) =>
          `select retail.registrar_pedido_no_atendido(p_ubicacion_id => :'lima', p_descripcion_libre => 'Prenda ${n}', p_motivo => 'se_probo_no_llevo', p_razon => '${r}') as p${n} \\gset\n`
      )
      .join("") +
    `reset role;\nselect string_agg(razon, ',' order by descripcion_libre) from retail.pedidos_no_atendidos where id in (:'p0', :'p1', :'p2', :'p3');\n`,
  "no_le_quedo,precio,color,lo_piensa"
);
caso(
  "(a) un motivo vacío o nulo es «buscó y no había» (lo de siempre)",
  como(FELIPE) +
    `select retail.registrar_pedido_no_atendido(p_ubicacion_id => :'lima', p_descripcion_libre => 'Vacío', p_motivo => '  ') as p1 \\gset
select retail.registrar_pedido_no_atendido(p_ubicacion_id => :'lima', p_descripcion_libre => 'Nulo', p_motivo => null) as p2 \\gset
reset role;
select string_agg(motivo, ',' order by descripcion_libre) from retail.pedidos_no_atendidos where id in (:'p1', :'p2');
`,
  "no_habia_talla,no_habia_talla"
);
caso(
  "(a) los rechazos: razón sin «se la probó» (sin motivo o con «no había»), motivo inventado, razón inventada; ninguno deja fila",
  CUANTOS("antes") +
    como(FELIPE) +
    intentoCon(`select retail.registrar_pedido_no_atendido(p_ubicacion_id => %L, p_descripcion_libre => 'X', p_razon => 'precio')`, ":'lima'") +
    intentoCon(
      `select retail.registrar_pedido_no_atendido(p_ubicacion_id => %L, p_descripcion_libre => 'X', p_motivo => 'no_habia_talla', p_razon => 'color')`,
      ":'lima'"
    ) +
    intentoCon(`select retail.registrar_pedido_no_atendido(p_ubicacion_id => %L, p_descripcion_libre => 'X', p_motivo => 'se_lo_llevo')`, ":'lima'") +
    intentoCon(
      `select retail.registrar_pedido_no_atendido(p_ubicacion_id => %L, p_descripcion_libre => 'X', p_motivo => 'se_probo_no_llevo', p_razon => 'le_quedo_grande')`,
      ":'lima'"
    ) +
    `reset role;\nselect count(*) = :antes from retail.pedidos_no_atendidos;\n`,
  "P0001|pedido_razon_sin_se_probo\nP0001|pedido_razon_sin_se_probo\nP0001|pedido_motivo_invalido\nP0001|pedido_razon_invalida\nt"
);
caso(
  "(a) «se la probó» sin producto ni descripción: el rechazo de siempre",
  como(FELIPE) +
    intentoCon(`select retail.registrar_pedido_no_atendido(p_ubicacion_id => %L, p_motivo => 'se_probo_no_llevo', p_razon => 'precio')`, ":'lima'"),
  "P0001|Anota el modelo del catálogo o describe lo que pidió la clienta"
);
caso(
  "(a) el candado de ubicación sigue: Micaela (Trujillo) no anota «se la probó» en Lima, y sí en su tienda, firmado por ella",
  como(MICAELA) +
    intentoCon(
      `select retail.registrar_pedido_no_atendido(p_ubicacion_id => %L, p_descripcion_libre => 'X', p_motivo => 'se_probo_no_llevo')`,
      ":'lima'"
    ) +
    `select retail.registrar_pedido_no_atendido(p_ubicacion_id => :'trujillo', p_descripcion_libre => 'Chompa', p_motivo => 'se_probo_no_llevo', p_razon => 'lo_piensa') as p \\gset\n` +
    FILA("p", "micaela_id"),
  "P0001|No tienes permiso para anotar pedidos en esa ubicación\nse_probo_no_llevo|lo_piensa|f|t"
);
caso(
  "(a) `anon` no ejecuta la firma nueva; `authenticated` sí",
  `reset role;\nset local role anon;\n` +
    intentoCon(`select retail.registrar_pedido_no_atendido(%L::uuid, null::uuid, 'X', null, null::uuid, 'se_probo_no_llevo', null)`, ":'lima'") +
    `reset role;\nselect has_function_privilege('authenticated', '${FIRMA_PEDIDO}', 'execute'), has_function_privilege('anon', '${FIRMA_PEDIDO}', 'execute');\n`,
  "42501|permission denied for function registrar_pedido_no_atendido\nt|f"
);

// =====================================================================================================================
// b. El esquema, sin la función (defensa en profundidad)
// =====================================================================================================================
caso(
  "(b) un insert directo (superusuario) no puede dejar razón sin «se la probó», un motivo inventado, un motivo nulo ni una razón inventada; sin motivo, es «buscó y no había»",
  `reset role;\n` +
    intentoCon(`insert into retail.pedidos_no_atendidos (ubicacion_id, descripcion_libre, razon) values (%L, 'X', 'precio')`, ":'lima'") +
    intentoCon(
      `insert into retail.pedidos_no_atendidos (ubicacion_id, descripcion_libre, motivo, razon) values (%L, 'X', 'no_habia_talla', 'color')`,
      ":'lima'"
    ) +
    intentoCon(`insert into retail.pedidos_no_atendidos (ubicacion_id, descripcion_libre, motivo) values (%L, 'X', 'otro')`, ":'lima'") +
    intentoCon(`insert into retail.pedidos_no_atendidos (ubicacion_id, descripcion_libre, motivo) values (%L, 'X', null)`, ":'lima'") +
    intentoCon(
      `insert into retail.pedidos_no_atendidos (ubicacion_id, descripcion_libre, motivo, razon) values (%L, 'X', 'se_probo_no_llevo', 'inventada')`,
      ":'lima'"
    ) +
    `insert into retail.pedidos_no_atendidos (ubicacion_id, descripcion_libre) values (:'lima', 'Sin motivo') returning motivo, coalesce(razon, '∅');\n`,
  (s) => {
    const l = s.split("\n");
    return (
      l.length === 6 &&
      l[0].includes("pedidos_no_atendidos_razon_solo_si_se_probo") &&
      l[1].includes("pedidos_no_atendidos_razon_solo_si_se_probo") &&
      l[2].includes("pedidos_no_atendidos_motivo_valido") &&
      l[3].startsWith("23502|") &&
      l[4].includes("pedidos_no_atendidos_razon_solo_si_se_probo") &&
      l[5] === "no_habia_talla|∅"
    );
  }
);
caso(
  "(b) un usuario autenticado sigue sin poder insertar directo (solo la función)",
  como(FELIPE) +
    intentoCon(
      `insert into retail.pedidos_no_atendidos (ubicacion_id, descripcion_libre, motivo) values (%L, 'X', 'se_probo_no_llevo')`,
      ":'lima'"
    ),
  "42501|permission denied for table pedidos_no_atendidos"
);

// =====================================================================================================================
// c. Lo anotado antes de la tanda 1d queda «buscó y no había»
// =====================================================================================================================
caso(
  "(c) filas de antes (la tabla sin motivo ni razón) quedan «buscó y no había» y sin razón al pegar la PARTE 1",
  `reset role;
alter table retail.pedidos_no_atendidos drop column motivo, drop column razon;
insert into retail.pedidos_no_atendidos (ubicacion_id, descripcion_libre, talla) values (:'lima', 'Vieja uno', 'M');
insert into retail.pedidos_no_atendidos (ubicacion_id, producto_id, resuelto, resuelto_en) values (:'lima', :'prod', true, now());
${PARTE_1}
select count(*), count(*) filter (where motivo = 'no_habia_talla' and razon is null)
  from retail.pedidos_no_atendidos where descripcion_libre = 'Vieja uno' or (producto_id = :'prod' and resuelto);
select column_default, is_nullable from information_schema.columns
 where table_schema = 'retail' and table_name = 'pedidos_no_atendidos' and column_name = 'motivo';
`,
  "2|2\n'no_habia_talla'::text|NO"
);

// =====================================================================================================================
// d. «Es para regalo» (D-7): la columna y fn_clienta_compras
// =====================================================================================================================
caso(
  "(d) venta_items.es_regalo: boolean, not null, false por defecto",
  `reset role;
select data_type, is_nullable, column_default from information_schema.columns
 where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'es_regalo';
`,
  "boolean|NO|false"
);
caso(
  "(d) fn_clienta_compras trae es_regalo por prenda: una venta marcada como regalo y otra para ella",
  SEDE() +
    como(FELIPE) +
    ALTA("f1", "90881402", "Regalo Prueba") +
    VENDER("regalo", [ITEM("v2", "v2_precio")], ":'v2_precio'", ":'f1'") +
    VENDER("suya", [ITEM("v1", "v1_precio")], ":'v1_precio'", ":'f1'") +
    // La FASE B hará que registrar_venta la guarde desde p_items; mientras tanto se marca aquí, como superusuario.
    `reset role;
update retail.venta_items set es_regalo = true where venta_id::text = :'regalo';
set local role authenticated;
select talla, es_regalo from retail.fn_clienta_compras(:'f1') order by talla;
`,
  "M|f\nS|t"
);
caso(
  "(d) una venta de hoy (sin la marca) guarda es_regalo = false",
  SEDE() + como(FELIPE) + VENDER("venta", [ITEM("v1", "v1_precio")], ":'v1_precio'") + `reset role;\nselect bool_or(es_regalo) from retail.venta_items where venta_id::text = :'venta';\n`,
  "f"
);
caso(
  "(d) fn_clienta_compras sigue exigiendo el módulo «Clientas» (Micaela sin él en su rol → clientas_sin_modulo)",
  `delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'clientas';\n` +
    `insert into retail.clientas (documento_numero, nombre) values ('90881403', 'Sin Modulo Prueba') returning id as f1 \\gset\n` +
    como(MICAELA) +
    intentoCon(`select * from retail.fn_clienta_compras(%L)`, ":'f1'"),
  "42501|clientas_sin_modulo"
);
caso(
  "(d) fn_clienta_compras: una sola firma, security definer, devuelve es_regalo al final; EXECUTE para authenticated y no para anon",
  `reset role;
select count(*), bool_and(prosecdef), bool_and(pg_get_function_result(oid) like '%subtotal numeric, es_regalo boolean)')
  from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_clienta_compras';
select has_function_privilege('authenticated', '${FIRMA_COMPRAS}', 'execute'), has_function_privilege('anon', '${FIRMA_COMPRAS}', 'execute');
`,
  "1|t|t\nt|f"
);

// =====================================================================================================================
// e. Estructura y pegado
// =====================================================================================================================
caso(
  "(e) una sola firma de registrar_pedido_no_atendido (la de 7 parámetros): la vieja ya no existe",
  `reset role;
select count(*), bool_and(oid = to_regprocedure('${FIRMA_PEDIDO}')) from pg_proc
 where pronamespace = 'retail'::regnamespace and proname = 'registrar_pedido_no_atendido';
select to_regprocedure('${FIRMA_PEDIDO_VIEJA}') is null;
`,
  "1|t\nt"
);
caso("(e) los md5 «después» de las secciones 0 (PARTES 2 y 4) son los de las funciones vivas", `reset role;\n${MD5_VIVOS}`, MD5_ESPERADOS);
caso(
  "(e) pegar las cuatro partes otra vez deja lo mismo (idempotente)",
  `reset role;\n${MIGRACION}\nreset role;\n${MD5_VIVOS}select count(*) from pg_constraint where conrelid = 'retail.pedidos_no_atendidos'::regclass and conname in ('pedidos_no_atendidos_motivo_valido', 'pedidos_no_atendidos_razon_solo_si_se_probo');\n`,
  `${MD5_ESPERADOS}\n2`
);
casoQueAborta(
  "(e) con fn_clienta_compras cambiada en vivo, la PARTE 4 aborta sin pisar",
  `reset role;
create or replace function retail.fn_clienta_compras(p_id uuid)
returns table (venta_id uuid, fecha timestamptz, ubicacion text, categoria text, talla text, cantidad integer, subtotal numeric, es_regalo boolean)
language sql stable security definer set search_path = retail, public, extensions
as $$ select retail.fn_exigir_modulo('clientas'); select v.id, v.created_at, 'otra'::text, null::text, null::text, 1, 0::numeric, false from retail.ventas v where v.cliente_id = p_id; $$;
${MIGRACION}`,
  "retail.fn_clienta_compras(uuid) cambió desde que se escribió esta migración"
);

casoQueAborta(
  "(e) la PARTE 2 sin la PARTE 1 aborta y no toca la función",
  `reset role;\nalter table retail.pedidos_no_atendidos drop column motivo, drop column razon;\n${PARTE_2}`,
  "Falta la PARTE 1 de esta migración"
);
casoQueAborta(
  "(e) la PARTE 4 sin la PARTE 3 aborta y no toca la función",
  `reset role;\nalter table retail.venta_items drop column es_regalo;\n${PARTE_4}`,
  "Falta la PARTE 3 de esta migración"
);
caso(
  "(e) «es para regalo» puede salir entera: sin la columna de la PARTE 3, una venta (la registrar_venta de la 1c) y «se la probó» funcionan igual",
  SEDE() +
    `alter table retail.venta_items drop column es_regalo;\n` +
    como(FELIPE) +
    VENDER("venta", [ITEM("v1", "v1_precio")], ":'v1_precio'") +
    `select retail.registrar_pedido_no_atendido(p_ubicacion_id => :'lima', p_descripcion_libre => 'Blusa', p_motivo => 'se_probo_no_llevo', p_razon => 'precio') as p \\gset
reset role;
select (select count(*) from retail.ventas where id::text = :'venta'), (select motivo || '|' || razon from retail.pedidos_no_atendidos where id = :'p');
`,
  "1|se_probo_no_llevo|precio"
);

// Cada parte toma a lo más UNA tabla con `alter` (la 1c encontró el cruce: una venta que ya leyó una tabla y espera
// `venta_items`, contra una migración que tiene `venta_items` y espera la otra, se traban con 40P01). Las funciones van en
// su propia parte, después de sus columnas.
const tablasAlteradas = (sql) => [...new Set([...sql.replace(/--[^\n]*/g, "").matchAll(/\balter\s+table\s+retail\.(\w+)/gi)].map((m) => m[1]))];
estatico(
  "(e) cada parte toma a lo más una tabla con `alter`: PARTE 1 pedidos_no_atendidos, PARTE 2 ninguna, PARTE 3 venta_items, PARTE 4 ninguna",
  JSON.stringify(PARTES.map((p) => tablasAlteradas(p.sql))) === JSON.stringify([["pedidos_no_atendidos"], [], ["venta_items"], []]),
  JSON.stringify(PARTES.map((p) => [p.nombre, tablasAlteradas(p.sql)]))
);

// Los archivos se pegan a mano en el SQL Editor (CLAUDE.md): nada que choque con el Asesor de seguridad ni que el Editor
// confunda con un SELECT INTO que crea una tabla.
const sinCuerposNiComentarios = MIGRACION.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/g, "").replace(/--[^\n]*/g, "");
estatico(
  "(e) sin políticas ni `drop trigger` (ADR-0195)",
  !/\b(create|drop|alter)\s+policy\b/i.test(sinCuerposNiComentarios) && !/\bdrop\s+trigger\b/i.test(sinCuerposNiComentarios)
);
const textos = [...sinCuerposNiComentarios.matchAll(/'(?:[^']|'')*'/g)].map((m) => m[0]);
estatico(
  "(e) ningún `select … into` dentro de un texto entre comillas (el SQL Editor le agregaría un `alter table … enable row level security`)",
  !textos.some((t) => /\bselect\b[\s\S]*\binto\b/i.test(t)),
  textos.filter((t) => /\bselect\b[\s\S]*\binto\b/i.test(t)).join(" | ")
);

// ---------------------------------------------------------------------------------------------------------------------

console.log(`\n${casos - fallas}/${casos} pruebas en verde.`);
process.exit(fallas > 0 ? 1 : 0);
