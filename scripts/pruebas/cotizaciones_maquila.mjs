#!/usr/bin/env node
/**
 * Pruebas de `retail.cotizaciones_maquila` y `retail.fn_cotizacion_maquila_vigente()` (D-82,
 * `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`; migración
 * `20260922160000_cotizaciones_maquila.sql`) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA.
 *   · Un líder (Felipe) carga una cotización nueva; una colaboradora (Micaela) NO puede —
 *     RLS `cotizaciones_maquila_insert` exige `fn_es_lider()`, igual que `codigos_descuento`.
 *   · `fn_cotizacion_maquila_vigente()` devuelve la MÁS RECIENTE de las que no vencieron —
 *     con dos cotizaciones vigentes de distinta fecha para la misma categoría, gana la más
 *     nueva, nunca la primera que se cargó.
 *   · Una cotización YA VENCIDA no se devuelve — sin ninguna vigente, la función da null, no
 *     inventa un valor (D-31: "nunca un precio que Felipe invente").
 *   · Sin ninguna cotización para una categoría, también null (nunca un error, nunca un 0).
 *   · Cualquier persona con sesión LEE la tabla (Micaela incluida) — D-80: la tienda ve la
 *     misma cifra que el Taller como su costo de referencia.
 *   · Sin sesión (rol `anon`, sin el grant de ejecución) el RPC no corre: "permission denied".
 *   · Los dos estados imposibles del esquema: `vigente_hasta < fecha_cotizacion` y
 *     `precio_maquila < 0` — ninguno de los dos llega a existir como fila.
 *
 * CÓMO. Mismo patrón que `candado_lider_caja_y_ajuste.mjs` (léelo primero si esto no tiene
 * sentido): cada escenario corre en su propia transacción con ROLLBACK — nunca se commitea
 * nada, corre seguro contra el Postgres local que comparten ~20 worktrees. Simula a Felipe
 * (líder) y a Micaela (colaboradora) con `set local request.jwt.claims` (el JSON completo,
 * no solo `.sub`: las políticas de esta tabla también miran `auth.role()`, que sale del JWT
 * completo — ver `fn_movimientos_busqueda_especial.mjs`).
 *
 * Cada escenario crea su PROPIA categoría de prueba (prefijo `ZZQ`) dentro de la misma
 * transacción — nunca reutiliza "Blusas" ni ninguna categoría real: dos escenarios corriendo
 * a la vez (u otra sesión probando lo mismo) no deben pisarse, y una categoría real puede ya
 * tener cotizaciones cargadas por otra sesión antes de que esta corra.
 *
 * `--en-seco`: antes de cada escenario carga DENTRO de su transacción la migración
 * `20260922160000_cotizaciones_maquila.sql`, así se prueba SIN haberla aplicado a la base
 * compartida. Sin el flag asume que ya está aplicada.
 *
 * USO
 *   pnpm pruebas:cotizaciones-maquila            → migración ya aplicada en el local
 *   pnpm pruebas:cotizaciones-maquila --en-seco  → la carga en cada escenario, sin aplicarla
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

const MSG_RLS_INSERT = "new row violates row-level security policy";

const EN_SECO = process.argv.includes("--en-seco");
const SQL_MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260922160000_cotizaciones_maquila.sql"), "utf8");
const PRELUDIO = EN_SECO ? SQL_MIGRACION : "";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const jwt = (authUserId, role = "authenticated") => `{"sub":"${authUserId}","role":"${role}"}`;
const comoPersona = (authUserId, sql, role = "authenticated") => `
begin;
${PRELUDIO}
set local request.jwt.claims = '${jwt(authUserId, role)}';
${sql}
`;
const SIN_SESION_ANON = `set local request.jwt.claims = '{}';\nset local role anon;\n`;

/**
 * `pg_temp.intento(sql)`: ejecuta la sentencia en un sub-bloque y devuelve «SQLSTATE|mensaje»
 * del error, o «SIN_ERROR» si no falló — sin abortar la transacción del escenario.
 */
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
`;

/**
 * Una categoría de prueba propia, nunca una real: `ZZQ` no es un prefijo que el catálogo real
 * use (las 3 letras son de indumentaria real — BLU, VES, FAL...). Deja `:cat_id` y `:felipe`.
 */
const CATEGORIA_DE_PRUEBA = `
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
insert into retail.categorias (nombre, prefijo, familia)
  values ('Prenda de prueba (cotizaciones_maquila.mjs)', 'ZZQ', 'indumentaria')
  returning id as cat_id \\gset
`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. Cargar una cotización — solo el líder
// ===========================================================================

exito(
  "líder: carga una cotización nueva para una categoría — queda guardada con su fecha, vigencia y quién la cargó",
  comoPersona(
    FELIPE,
    `${CATEGORIA_DE_PRUEBA}insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta, proveedor_referencia, creado_por)
  values (:'cat_id', 22.50, current_date, current_date + interval '6 months', 'Taller Confecciones del Norte', :'felipe')
  returning precio_maquila::numeric(12,2), proveedor_referencia, creado_por = :'felipe';
rollback;
`
  ),
  ["22.50", "Taller Confecciones del Norte", "t"]
);

error(
  "colaboradora: NO puede cargar una cotización — RLS la bloquea (misma regla que codigos_descuento: crear precios de referencia es cosa de líder)",
  comoPersona(
    FELIPE,
    `${CATEGORIA_DE_PRUEBA}set local role authenticated;
${comoPersonaEnLaMismaTx(MICAELA)}insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta)
  values (:'cat_id', 22.50, current_date, current_date + interval '6 months');
`
  ),
  MSG_RLS_INSERT
);

// ===========================================================================
// 2. fn_cotizacion_maquila_vigente — la más reciente que no venció
// ===========================================================================

exito(
  "vigente: con dos cotizaciones sin vencer (una de hace 4 meses, otra de ayer), devuelve la de AYER — la más reciente, no la primera que se cargó",
  comoPersona(
    FELIPE,
    `${CATEGORIA_DE_PRUEBA}insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta, proveedor_referencia)
  values
    (:'cat_id', 18.00, current_date - interval '4 months', current_date + interval '2 months', 'Cotización vieja'),
    (:'cat_id', 25.00, current_date - interval '1 day', current_date + interval '6 months', 'Cotización nueva');
select precio_maquila::numeric(12,2), proveedor_referencia from retail.fn_cotizacion_maquila_vigente(:'cat_id');
rollback;
`
  ),
  ["25.00", "Cotización nueva"]
);

exito(
  "vigente: una cotización YA VENCIDA no cuenta — sin ninguna vigente, devuelve null, no la vencida",
  comoPersona(
    FELIPE,
    `${CATEGORIA_DE_PRUEBA}insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta)
  values (:'cat_id', 18.00, current_date - interval '8 months', current_date - interval '2 months');
select retail.fn_cotizacion_maquila_vigente(:'cat_id') is null;
rollback;
`
  ),
  ["t"]
);

exito(
  "vigente: sin NINGUNA cotización cargada para la categoría, devuelve null — nunca un error, nunca un precio inventado (D-31)",
  comoPersona(
    FELIPE,
    `${CATEGORIA_DE_PRUEBA}select retail.fn_cotizacion_maquila_vigente(:'cat_id') is null;
rollback;
`
  ),
  ["t"]
);

exito(
  "vigente: vence HOY todavía cuenta como vigente (>=, no >) — el mismo día que Felipe la revisa, sigue mostrando el precio de referencia",
  comoPersona(
    FELIPE,
    `${CATEGORIA_DE_PRUEBA}insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta)
  values (:'cat_id', 30.00, current_date - interval '6 months', current_date);
select precio_maquila::numeric(12,2) from retail.fn_cotizacion_maquila_vigente(:'cat_id');
rollback;
`
  ),
  ["30.00"]
);

// ===========================================================================
// 3. Cualquier sesión lee; sin sesión, ni el RPC corre
// ===========================================================================

exito(
  "colaboradora: SÍ puede leer la tabla y llamar al RPC — D-80: la tienda ve la misma cifra que el Taller como su costo de referencia",
  comoPersona(
    FELIPE,
    `${CATEGORIA_DE_PRUEBA}insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta)
  values (:'cat_id', 22.00, current_date, current_date + interval '6 months');
set local role authenticated;
${comoPersonaEnLaMismaTx(MICAELA)}select
  (select count(*) from retail.cotizaciones_maquila where categoria_id = :'cat_id'),
  (select precio_maquila::numeric(12,2) from retail.fn_cotizacion_maquila_vigente(:'cat_id'));
rollback;
`
  ),
  ["1", "22.00"]
);

error(
  "sin sesión (rol anon, sin el grant de ejecución): el RPC ni corre — «permission denied»",
  comoPersona(FELIPE, `${CATEGORIA_DE_PRUEBA}${SIN_SESION_ANON}select retail.fn_cotizacion_maquila_vigente(:'cat_id');\n`),
  "permission denied"
);

// ===========================================================================
// 4. Estados imposibles — el esquema los cierra, no una validación después
// ===========================================================================

exito(
  "esquema: una cotización que vence ANTES de empezar (vigente_hasta < fecha_cotizacion) no llega a existir — check_violation, 23514",
  comoPersona(
    FELIPE,
    `${INTENTO}${CATEGORIA_DE_PRUEBA}select pg_temp.intento(format(
  'insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta) values (%L, 10, current_date, current_date - interval ''1 day'')',
  :'cat_id'
)) as r \\gset
select split_part(:'r', '|', 1);
rollback;
`
  ),
  ["23514"]
);

exito(
  "esquema: un precio de maquila negativo no llega a existir — check_violation, 23514",
  comoPersona(
    FELIPE,
    `${INTENTO}${CATEGORIA_DE_PRUEBA}select pg_temp.intento(format(
  'insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta) values (%L, -0.01, current_date, current_date + interval ''6 months'')',
  :'cat_id'
)) as r \\gset
select split_part(:'r', '|', 1);
rollback;
`
  ),
  ["23514"]
);

exito(
  "esquema: una cotización sin categoría real (id inventado) no llega a existir — foreign_key_violation, 23503",
  comoPersona(
    FELIPE,
    `${INTENTO}select pg_temp.intento(
  'insert into retail.cotizaciones_maquila (categoria_id, precio_maquila, fecha_cotizacion, vigente_hasta) values (gen_random_uuid(), 10, current_date, current_date + interval ''6 months'')'
) as r \\gset
select split_part(:'r', '|', 1);
rollback;
`
  ),
  ["23503"]
);

// ---------------------------------------------------------------------------
// Cambiar de persona a mitad de un escenario que ya está `begin`/`set local jwt` — sin volver
// a `begin` (rompería la transacción abierta). Solo cambia el JWT simulado.
// ---------------------------------------------------------------------------
function comoPersonaEnLaMismaTx(authUserId, role = "authenticated") {
  return `set local request.jwt.claims = '${jwt(authUserId, role)}';\n`;
}

// ===========================================================================
// Corredor — mismo que candado_lider_caja_y_ajuste.mjs
// ===========================================================================

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: la migración se carga dentro de cada escenario (no se aplica a la base).\n");

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    if (caso.tipo === "error") {
      if (resultado.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!resultado.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error con "${caso.contiene}", salió:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").join("\n    ")}`);
    } else {
      // La última línea de salida es la fila de verificación.
      const ultima = resultado.salida.split("\n").filter(Boolean).pop() ?? "";
      const columnas = ultima.split("|");
      const igual = columnas.length === caso.esperado.length && columnas.every((v, i) => v === caso.esperado[i]);
      if (!igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado)}\n    salió:    ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
