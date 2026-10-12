#!/usr/bin/env node
/**
 * Pruebas de la tanda 1d del club de clientas: «se la probó y no la llevó» (ADR-0288 D-6; acta CL-7 y CL-14; migración en
 * dos partes: `20260930240000_club_paso1d_parte1_pedidos.sql` y `20260930240100_club_paso1d_parte2_se_probo.sql`).
 *
 * EL PROBLEMA. «Se la probó y no la llevó» no quedaba en ningún lado: Compras solo veía «buscó y no había». La base tiene
 * que hacer cumplir, no la pantalla: `pedidos_no_atendidos` guarda las dos señales con su `motivo` (`no_habia_talla`, el de
 * siempre, o `se_probo_no_llevo`) y una `razon` opcional que SOLO existe con «se la probó» (`no_le_quedo`, `precio`,
 * `color`, `lo_piensa`). Todo lo anotado antes queda «buscó y no había». La llamada vieja (5 parámetros) sigue igual.
 *
 * «ES PARA REGALO» NO VA (Felipe, 2026-09-30, sigue el spike aprobado): esta tanda no toca `venta_items`,
 * `fn_clienta_compras` ni `registrar_venta`, y la sección (d) lo vigila.
 *
 * QUÉ PRUEBA (cada caso en su transacción, que termina en ROLLBACK; con claims reales y `set local role authenticated`
 * para que los permisos se evalúen de verdad; cuentas del seed: Felipe, líder; Micaela, integrante de Trujillo):
 *   a. `registrar_pedido_no_atendido`: la llamada vieja anota `no_habia_talla` sin razón y firmada por quien anota;
 *      «se la probó» con y sin razón, con y sin clienta, con producto del catálogo o descripción; los rechazos
 *      (`pedido_razon_sin_se_probo`, `pedido_motivo_invalido`, `pedido_razon_invalida`) no dejan fila; el candado de
 *      ubicación sigue; `anon` no la ejecuta.
 *   b. El esquema, sin la función: un insert directo con razón y sin «se la probó», con un motivo inventado o sin motivo.
 *   c. Lo de antes: filas anotadas antes de la tanda 1d quedan `no_habia_talla` al correr la PARTE 1.
 *   d. Sin «es para regalo»: los archivos de la 1d no nombran `venta_items`, `fn_clienta_compras` ni `registrar_venta`.
 *   e. Estructura y pegado: una sola firma de la función, los md5 «después» de la sección 0 son los de la función viva,
 *      pegar las dos partes dos veces deja lo mismo, con la función cambiada en vivo la PARTE 2 aborta sin pisar, la PARTE 2
 *      aborta sin la PARTE 1, cada parte toma a lo más UNA tabla con `alter` (así no se traba en cruz con una venta, como
 *      encontró la 1c), y ningún archivo tiene políticas, `drop trigger` ni `select … into` en un texto entre comillas
 *      (CLAUDE.md, ADR-0195, ADR-0288).
 *
 * FUERA A PROPÓSITO: la pregunta «¿Se la probó y no la llevó?» de Cobrar es web; su regla pura la prueba
 * apps/web/lib/se-probo-reglas.test.ts.
 *
 * USO
 *   pnpm pruebas:club-se-probo                  → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:club-se-probo --base cayla_x   → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";

const PARTES = ["20260930240000_club_paso1d_parte1_pedidos.sql", "20260930240100_club_paso1d_parte2_se_probo.sql"].map((nombre) => ({
  nombre,
  sql: readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8"),
}));
const [PARTE_1, PARTE_2] = PARTES.map((p) => p.sql);
/** Las dos partes seguidas, como corren en local y en el CI. */
const MIGRACION = PARTES.map((p) => p.sql).join("\n");

// La tabla del candado de versión de la sección 0: firma → md5 normalizado «antes» (producción) y «después» (null = la firma
// no existe de ese lado).
const VERSIONES = [
  ...MIGRACION.matchAll(/\('(retail\.[a-z_]+\([^']*\))',\s+(null|'([0-9a-f]{32})'),\s+(null|'([0-9a-f]{32})')\)/g),
].map((m) => ({ firma: m[1], antes: m[3] ?? null, despues: m[5] ?? null }));
if (VERSIONES.length !== 2) {
  console.error(`✗ La tabla de versiones de la migración debería tener 2 filas y tiene ${VERSIONES.length}.`);
  process.exit(1);
}
const FIRMA_PEDIDO = "retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid,text,text)";
const FIRMA_PEDIDO_VIEJA = "retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid)";
// ADR-0348 (20261005212000, venta perdida con la prenda exacta) reemplazó la firma de 7 parámetros por una de 8 (+ p_variante_id,
// opcional): lo que esta migración dejó sigue igual, pero la función VIVA ya es la de ADR-0348. Los casos que miran la base tal como
// quedó hoy usan esta firma; los que vuelven a pegar esta migración siguen mirando la suya.
const FIRMA_PEDIDO_VIGENTE = "retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid,text,text,uuid)";


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
    `reset role;\nselect has_function_privilege('authenticated', '${FIRMA_PEDIDO_VIGENTE}', 'execute'), has_function_privilege('anon', '${FIRMA_PEDIDO_VIGENTE}', 'execute');\n`,
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
// d. Sin «es para regalo» (Felipe, 2026-09-30): la 1d no toca la venta ni la ficha
// =====================================================================================================================
const sinComentarios = (sql) => sql.replace(/--[^\n]*/g, "");
estatico(
  "(d) los archivos de la 1d no nombran venta_items, fn_clienta_compras ni registrar_venta (fuera de los comentarios)",
  PARTES.every((p) => !/\b(venta_items|fn_clienta_compras|registrar_venta)\b/.test(sinComentarios(p.sql))),
  PARTES.filter((p) => /\b(venta_items|fn_clienta_compras|registrar_venta)\b/.test(sinComentarios(p.sql))).map((p) => p.nombre).join(", ")
);
caso(
  "(d) venta_items no tiene una columna de regalo y fn_clienta_compras devuelve lo de siempre",
  `reset role;
select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'venta_items' and column_name ~ 'regalo';
select pg_get_function_result('retail.fn_clienta_compras(uuid)'::regprocedure) ~ 'regalo';
`,
  "0\nf"
);

// =====================================================================================================================
// e. Estructura y pegado
// =====================================================================================================================
caso(
  "(e) una sola firma de registrar_pedido_no_atendido (hoy la de 8 parámetros de ADR-0348): la de 5 y la de 7 ya no existen",
  `reset role;
select count(*), bool_and(oid = to_regprocedure('${FIRMA_PEDIDO_VIGENTE}')) from pg_proc
 where pronamespace = 'retail'::regnamespace and proname = 'registrar_pedido_no_atendido';
select to_regprocedure('${FIRMA_PEDIDO_VIEJA}') is null and to_regprocedure('${FIRMA_PEDIDO}') is null;
`,
  "1|t\nt"
);
caso(
  "(e) los md5 «después» de la sección 0 (PARTE 2) son los de la función viva (la de 7 parámetros, reemplazada por ADR-0348, ya no existe)",
  `reset role;\n${MD5_VIVOS}`,
  VERSIONES.map((v) => (v.firma.replace(/\s/g, "") === FIRMA_PEDIDO ? "NO_EXISTE" : (v.despues ?? "NO_EXISTE"))).join("\n")
);
caso(
  "(e) pegar las dos partes otra vez deja lo mismo (idempotente)",
  `reset role;\n${MIGRACION}\nreset role;\n${MD5_VIVOS}select count(*) from pg_constraint where conrelid = 'retail.pedidos_no_atendidos'::regclass and conname in ('pedidos_no_atendidos_motivo_valido', 'pedidos_no_atendidos_razon_solo_si_se_probo');\n`,
  `${MD5_ESPERADOS}\n2`
);
casoQueAborta(
  "(e) con registrar_pedido_no_atendido cambiada en vivo, la PARTE 2 aborta sin pisar",
  `reset role;
create or replace function retail.registrar_pedido_no_atendido(p_ubicacion_id uuid, p_producto_id uuid default null,
  p_descripcion_libre text default null, p_talla text default null, p_clienta_id uuid default null,
  p_motivo text default 'no_habia_talla', p_razon text default null)
returns uuid language plpgsql security definer set search_path = retail, public, extensions
as $$ begin return null; end; $$;
${MIGRACION}`,
  "retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid,text,text) cambió desde que se escribió esta migración"
);
casoQueAborta(
  "(e) la PARTE 2 sin la PARTE 1 aborta y no toca la función",
  `reset role;\nalter table retail.pedidos_no_atendidos drop column motivo, drop column razon;\n${PARTE_2}`,
  "Falta la PARTE 1 de esta migración"
);
// Cada parte toma a lo más UNA tabla con `alter` (la 1c encontró el cruce: una venta que ya leyó una tabla y espera
// `venta_items`, contra una migración que tiene `venta_items` y espera la otra, se traban con 40P01). Las funciones van en
// su propia parte, después de sus columnas.
const tablasAlteradas = (sql) => [...new Set([...sql.replace(/--[^\n]*/g, "").matchAll(/\balter\s+table\s+retail\.(\w+)/gi)].map((m) => m[1]))];
estatico(
  "(e) cada parte toma a lo más una tabla con `alter`: PARTE 1 pedidos_no_atendidos, PARTE 2 ninguna",
  JSON.stringify(PARTES.map((p) => tablasAlteradas(p.sql))) === JSON.stringify([["pedidos_no_atendidos"], []]),
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
