#!/usr/bin/env node
/**
 * Pruebas de `20260922130000_archivar_datos_de_prueba.sql` (D-54, ADR-0159) contra el Postgres
 * local — CAYLA V2.
 *
 * QUÉ PRUEBA
 *   · Las cuatro funciones (`archivar_venta_prueba`, `archivar_caja_prueba`,
 *     `archivar_conteo_prueba`, `archivar_producto_prueba`) exigen líder PRIMERO — una
 *     colaboradora (Micaela, fija a Tienda Trujillo) no archiva ni en su propia sede, y sin
 *     sesión tampoco; el líder (Felipe) sí, y la fila queda `es_prueba = true`.
 *   · `archivar_caja_prueba` sobre una caja ABIERTA la CIERRA primero (mismo cálculo que
 *     `cerrar_caja`) — y, lo más importante: DESPUÉS de archivarla se puede abrir una caja
 *     REAL nueva en esa misma sede (el índice único que antes lo bloqueaba queda libre). Sobre
 *     una caja ya cerrada, solo la marca.
 *   · `archivar_conteo_prueba` RECHAZA un conteo todavía `abierto` (22023) — hay que anularlo o
 *     cerrarlo primero — y archiva sin problema uno `anulado`.
 *   · El trigger `conteos_es_prueba_solo_lider`: una colaboradora que SÍ puede editar su propio
 *     conteo (`conteos_write` la deja) NO puede tocar `es_prueba` por ese mismo camino, con un
 *     UPDATE directo a la tabla, sin pasar por la función.
 *   · `productos`: una colaboradora no puede tocar `es_prueba` de ningún modo (RLS ya exige
 *     líder para CUALQUIER escritura en `productos`, antes de llegar a la función).
 *   · Una fila `es_prueba = true` desaparece de una lectura filtrada por `es_prueba = false`
 *     (lo que hacen Existencias/Historial de ventas/Caja▸Historial por defecto) y reaparece sin
 *     el filtro — la parte de la web se prueba con TypeScript/UI, esto prueba la base.
 *   · La migración se puede pegar dos veces.
 *
 * CÓMO. Mismo patrón que `candado_lider_caja_y_ajuste.mjs`: cada escenario en su propia
 * transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el Postgres local que
 * comparten ~20 worktrees. Simula a Felipe (líder) y a Micaela (integrante, Tienda Trujillo) con
 * `set local request.jwt.claim.sub`.
 *
 * `--en-seco`: carga la migración dentro de cada escenario, sin aplicarla a la base compartida.
 *
 * USO
 *   pnpm pruebas:archivar-datos-prueba            → migración ya aplicada en el local
 *   pnpm pruebas:archivar-datos-prueba --en-seco  → la carga en cada escenario, sin aplicarla
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

const MSG_LIDER = "Solo un líder de equipo puede archivar un dato de prueba";
const MSG_LIDER_CONTEO = "Solo un líder de equipo puede marcar un conteo como dato de prueba";

const EN_SECO = process.argv.includes("--en-seco");
const SQL_MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260922130000_archivar_datos_de_prueba.sql"), "utf8");
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

const comoPersona = (authUserId, sql) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const SIN_SESION = "set local request.jwt.claim.sub = '';\n";
// `set local role` cambia el rol real de Postgres (lo que hace que RLS se aplique de verdad, en
// vez de que `postgres` la bypasee); `request.jwt.claim.role` es lo que lee `auth.role()`
// (`productos_select` la usa) — los dos hacen falta para que la lectura posterior no se quede
// en cero filas por su cuenta.
const COMO_AUTENTICADO = "set local role authenticated;\nset local request.jwt.claim.role = 'authenticated';\n";

/** `pg_temp.intento(sql)`: ver `candado_lider_caja_y_ajuste.mjs` — devuelve «SQLSTATE|mensaje» o «SIN_ERROR». */
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

/** Trujillo, sus dos sububicaciones y la persona de Felipe. Deja `:trujillo`, `:sub_piso`, `:persona_felipe`. */
const BASE = `
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'trujillo', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta');
select id as sub_piso from retail.sububicaciones where ubicacion_id = :'trujillo' and tipo = 'piso_venta' \\gset
select id as persona_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
`;

/** Una venta de prueba mínima en Trujillo (INSERT directo — postgres bypasea RLS, no hace falta
 *  `registrar_venta` completo para esto; el pago vive en `venta_pagos`, no en `ventas`). Deja `:venta`. */
const VENTA_DE_PRUEBA = `${BASE}insert into retail.ventas (ubicacion_id) values (:'trujillo') returning id as venta \\gset
`;

/** Una caja ABIERTA por Micaela en Trujillo, con un ingreso de S/ 30 — igual que
 *  `candado_lider_caja_y_ajuste.mjs`, cierra primero cualquier caja que haya quedado abierta de
 *  otro escenario. Deja `:caja`; termina con la sesión en Felipe. Sistema esperado: 100 + 30 = 130. */
const CAJA_ABIERTA_POR_MICAELA = `${BASE}${cambiaA(FELIPE)}select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'trujillo' and estado = 'abierta'
) x) as _cerro_previa \\gset
${cambiaA(MICAELA)}select retail.abrir_caja(:'trujillo', 100.00) as caja \\gset
${cambiaA(FELIPE)}select retail.registrar_movimiento_caja(:'caja', 'ingreso', 30, 'Otro', 'Ingreso vario de prueba') as _i \\gset
`;

/** Un conteo en el estado pedido (`abierto` o `anulado`) en Trujillo. Deja `:conteo`. */
const CONTEO_DE_PRUEBA = (estado) => `${BASE}insert into retail.conteos (ubicacion_id, estado) values (:'trujillo', '${estado}') returning id as conteo \\gset
`;

/** Un producto de prueba para archivar (marca/proveedor: el primer par que ya existe en el
 *  seed — `productos` los exige NOT NULL con FK compuesta a `marca_proveedores`). Deja `:producto`. */
const PRODUCTO_DE_PRUEBA = `select marca_id, proveedor_id from retail.marca_proveedores limit 1 \\gset
insert into retail.productos (referencia, marca_id, proveedor_id) values ('Producto de prueba D-54', :'marca_id', :'proveedor_id') returning id as producto \\gset
`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. archivar_venta_prueba — solo líder
// ===========================================================================

exito(
  "colaboradora: NO archiva una venta de Trujillo (su propia sede) — 42501, y la venta sigue sin marcar",
  comoPersona(
    FELIPE,
    `${INTENTO}${VENTA_DE_PRUEBA}${cambiaA(MICAELA)}select pg_temp.intento(format('select archivar_venta_prueba(%L)', :'venta')) as r \\gset
${cambiaA(FELIPE)}select split_part(:'r', '|', 1), split_part(:'r', '|', 2), (select es_prueba from ventas where id = :'venta');
rollback;
`
  ),
  ["42501", MSG_LIDER, "f"]
);

exito(
  "sin sesión: archivar_venta_prueba falla con 42501",
  comoPersona(
    FELIPE,
    `${INTENTO}${VENTA_DE_PRUEBA}${SIN_SESION}select pg_temp.intento(format('select archivar_venta_prueba(%L)', :'venta')) as r \\gset
${cambiaA(FELIPE)}select split_part(:'r', '|', 1), split_part(:'r', '|', 2);
rollback;
`
  ),
  ["42501", MSG_LIDER]
);

exito(
  "líder: archiva la venta — queda `es_prueba = true` y desaparece de una lectura filtrada por `es_prueba = false` (lo que hace Historial de ventas por defecto), pero sigue con el filtro apagado",
  comoPersona(
    FELIPE,
    `${VENTA_DE_PRUEBA}select archivar_venta_prueba(:'venta') as _a \\gset
select (select es_prueba from ventas where id = :'venta'),
  (select count(*) from ventas where id = :'venta' and es_prueba = false),
  (select count(*) from ventas where id = :'venta');
rollback;
`
  ),
  ["t", "0", "1"]
);

error(
  "venta inexistente: archivar_venta_prueba dice que no existe (el candado de líder no tapa este rechazo)",
  comoPersona(FELIPE, `select archivar_venta_prueba(gen_random_uuid());\n`),
  "no existe"
);

// ===========================================================================
// 2. archivar_caja_prueba — solo líder, cierra si sigue abierta
// ===========================================================================

exito(
  "colaboradora: NO archiva la caja abierta de su propia tienda — 42501, y la caja sigue abierta sin marcar",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_ABIERTA_POR_MICAELA}${cambiaA(MICAELA)}select pg_temp.intento(format('select archivar_caja_prueba(%L)', :'caja')) as r \\gset
${cambiaA(FELIPE)}select split_part(:'r', '|', 1), split_part(:'r', '|', 2), (select estado from cajas where id = :'caja'), (select es_prueba from cajas where id = :'caja');
rollback;
`
  ),
  ["42501", MSG_LIDER, "abierta", "f"]
);

exito(
  "líder: archiva la caja ABIERTA de Micaela en Trujillo — la CIERRA con el mismo cálculo que cerrar_caja (sistema 130 = 100 + 30, contado también 130, diferencia 0) y queda `es_prueba = true` con la nota",
  comoPersona(
    FELIPE,
    `${CAJA_ABIERTA_POR_MICAELA}select archivar_caja_prueba(:'caja') as _a \\gset
select estado, monto_cierre_sistema::numeric(12,2), monto_cierre_real::numeric(12,2), diferencia::numeric(12,2), es_prueba, nota like '%Archivada como dato de prueba (D-54)%', cerrada_por = :'persona_felipe'
from cajas where id = :'caja';
rollback;
`
  ),
  ["cerrada", "130.00", "130.00", "0.00", "t", "t", "t"]
);

exito(
  "líder: DESPUÉS de archivar la caja de prueba abierta, se puede abrir una caja REAL nueva en la misma sede — el índice único que antes lo bloqueaba queda libre (D-54: el hallazgo que la tarea no pedía explícitamente)",
  comoPersona(
    FELIPE,
    `${INTENTO}${CAJA_ABIERTA_POR_MICAELA}select archivar_caja_prueba(:'caja') as _a \\gset
${cambiaA(MICAELA)}select pg_temp.intento(format('select retail.abrir_caja(%L, 50.00)', :'trujillo')) as r \\gset
${cambiaA(FELIPE)}select split_part(:'r', '|', 1), (select count(*) from cajas where ubicacion_id = :'trujillo' and estado = 'abierta');
rollback;
`
  ),
  ["SIN_ERROR", "1"]
);

exito(
  "líder: archiva una caja YA cerrada — solo la marca `es_prueba`, no le toca el cierre que ya tenía",
  comoPersona(
    FELIPE,
    `${CAJA_ABIERTA_POR_MICAELA}select monto_sistema from retail.cerrar_caja(:'caja', 999) \\gset
select archivar_caja_prueba(:'caja') as _a \\gset
select estado, monto_cierre_real::numeric(12,2), es_prueba from cajas where id = :'caja';
rollback;
`
  ),
  ["cerrada", "999.00", "t"]
);

// ===========================================================================
// 3. archivar_conteo_prueba — solo líder, rechaza uno abierto
// ===========================================================================

exito(
  "líder: RECHAZA archivar un conteo todavía abierto (22023) — anularlo o cerrarlo va primero, y sigue sin marcar",
  comoPersona(
    FELIPE,
    `${INTENTO}${CONTEO_DE_PRUEBA("abierto")}select pg_temp.intento(format('select archivar_conteo_prueba(%L)', :'conteo')) as r \\gset
select split_part(:'r', '|', 1), (select es_prueba from conteos where id = :'conteo');
rollback;
`
  ),
  ["22023", "f"]
);

exito(
  "líder: archiva sin problema un conteo anulado — queda `es_prueba = true`",
  comoPersona(
    FELIPE,
    `${CONTEO_DE_PRUEBA("anulado")}select archivar_conteo_prueba(:'conteo') as _a \\gset
select es_prueba from conteos where id = :'conteo';
rollback;
`
  ),
  ["t"]
);

exito(
  "colaboradora: NO archiva el conteo anulado de su propia sede vía la función — 42501",
  comoPersona(
    FELIPE,
    `${INTENTO}${CONTEO_DE_PRUEBA("anulado")}${cambiaA(MICAELA)}select pg_temp.intento(format('select archivar_conteo_prueba(%L)', :'conteo')) as r \\gset
${cambiaA(FELIPE)}select split_part(:'r', '|', 1), split_part(:'r', '|', 2);
rollback;
`
  ),
  ["42501", MSG_LIDER]
);

exito(
  "colaboradora: puede editar su propio conteo (conteos_write la deja) pero el TRIGGER le bloquea tocar `es_prueba` con un UPDATE directo, sin pasar por la función — 42501, y sigue sin marcar",
  comoPersona(
    FELIPE,
    `${INTENTO}${CONTEO_DE_PRUEBA("anulado")}${cambiaA(MICAELA)}select pg_temp.intento(format('update conteos set es_prueba = true where id = %L', :'conteo')) as r_prueba \\gset
select pg_temp.intento(format('update conteos set cerrado_en = now() where id = %L', :'conteo')) as r_otra \\gset
${cambiaA(FELIPE)}select split_part(:'r_prueba', '|', 1), split_part(:'r_prueba', '|', 2), :'r_otra', (select es_prueba from conteos where id = :'conteo');
rollback;
`
  ),
  ["42501", MSG_LIDER_CONTEO, "SIN_ERROR", "f"]
);

// ===========================================================================
// 4. archivar_producto_prueba — solo líder (RLS de productos ya lo exige para TODO)
// ===========================================================================

exito(
  "líder: archiva un producto de prueba — queda `es_prueba = true`",
  comoPersona(
    FELIPE,
    `${PRODUCTO_DE_PRUEBA}select archivar_producto_prueba(:'producto') as _a \\gset
select es_prueba from productos where id = :'producto';
rollback;
`
  ),
  ["t"]
);

exito(
  "colaboradora: NO archiva un producto por la función — 42501",
  comoPersona(
    FELIPE,
    `${INTENTO}${PRODUCTO_DE_PRUEBA}${cambiaA(MICAELA)}select pg_temp.intento(format('select archivar_producto_prueba(%L)', :'producto')) as r_fn \\gset
${cambiaA(FELIPE)}select split_part(:'r_fn', '|', 1), split_part(:'r_fn', '|', 2), (select es_prueba from productos where id = :'producto');
rollback;
`
  ),
  ["42501", MSG_LIDER, "f"]
);

exito(
  "colaboradora con el rol real de la API (authenticated): tampoco archiva un producto con un UPDATE directo — `productos_write_lider` (RLS) ya exige líder para CUALQUIER escritura en `productos`, antes de que la fila llegue a la función",
  comoPersona(
    FELIPE,
    `${PRODUCTO_DE_PRUEBA}${COMO_AUTENTICADO}${cambiaA(MICAELA)}update productos set es_prueba = true where id = :'producto';
select (select es_prueba from productos where id = :'producto');
rollback;
`
  ),
  ["f"]
);

// ===========================================================================
// 5. La migración se puede pegar dos veces
// ===========================================================================

exito(
  "la migración se puede pegar DOS veces: la segunda no rompe nada y el candado de líder sigue funcionando",
  comoPersona(
    FELIPE,
    `${INTENTO}${SQL_MIGRACION}
${SQL_MIGRACION}
${cambiaA(MICAELA)}select pg_temp.intento(format('select archivar_venta_prueba(%L)', gen_random_uuid())) as r \\gset
${cambiaA(FELIPE)}select split_part(:'r', '|', 1), (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname like 'archivar_%_prueba');
rollback;
`
  ),
  ["42501", "4"]
);

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
