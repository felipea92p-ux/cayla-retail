#!/usr/bin/env node
/**
 * Pruebas de «quién vendió» contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que la venta guarde a quien atendió (`ventas.asesora_id`, parámetro `p_asesora_id` de
 * `registrar_venta`, desde 20260922150000) SIN perder a la sesión que cobró (`usuario_id`), que «Ventas de
 * hoy» la firme con quien atendió (20260922213700), que quede UNA sola versión de `registrar_venta`, y que
 * la lectura de turno (`fn_asesoras_de_turno`) no rompa nada donde no hay asistencia de Dynamic. ADR-0163.
 *
 * CÓMO. Mismo patrón que `registrar_venta.mjs` (léelo primero si algo no se entiende): cada escenario
 * corre en su propia transacción con ROLLBACK, hablando con Postgres por `docker exec … psql`, y simula
 * a Felipe (líder) o Micaela (colaboradora fija a Tienda Trujillo) con `set local request.jwt.claim.sub`.
 * Nunca commitea: corre seguro contra el Postgres local que comparten varios worktrees.
 *
 * NO ES un `*.test.ts` de vitest a propósito: `pnpm test` (CI incluido) corre sin Postgres ni Docker.
 *
 * USO
 *   pnpm pruebas:vendedora-en-venta    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

function comoPersona(authUserId, sqlDespues) {
  return `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sqlDespues}
`;
}

/** Ids que casi todos los escenarios usan. */
const PERSONAS = `
select id as p_felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as p_mica from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
`;

/** Sede con piso/almacén, caja propia abierta y stock de sobra de BLU-EMMA-NEG-M (mismo fixture que
 *  `registrar_venta.mjs`). Deja `:'ubic'`, `:'v1'` y `:'v1_precio'` listos. Se corre como líder. */
function fixture({ ubicacionNombre = "Tienda Trujillo", colchon = 1000 } = {}) {
  return `
select id as ubic from retail.ubicaciones where nombre = '${ubicacionNombre}' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 100.00) as caja_id \\gset
select id as v1, precio as v1_precio from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'ubic', :'sub_piso', 'entrada', ${colchon}, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
`;
}

/** Una venta de 1 prenda en `:'ubic'`; `asesora` es una expresión psql (`:'p_mica'`) o null. Deja `:'venta_id'`. */
function venta(asesora) {
  return `select retail.registrar_venta(
  p_ubicacion_id => :'ubic',
  p_items => jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'v1_precio')::numeric)),
  p_token => gen_random_uuid()${asesora ? `,\n  p_asesora_id => ${asesora}` : ""}
) as venta_id \\gset`;
}

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ---------------------------------------------------------------------------
// registrar_venta: guarda a quien atendió Y a la sesión
// ---------------------------------------------------------------------------

exito(
  "la venta guarda quién atendió Y quién operó el equipo (dos cosas distintas)",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
${venta(":'p_mica'")}
select asesora_id = :'p_mica', usuario_id = :'p_felipe' from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([asesora, sesion]) => asesora === "t" && sesion === "t"
);

exito(
  "también cuando quien cobra es una colaboradora (la función valida como dueña, no con la RLS de ella)",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
set local request.jwt.claim.sub = '${MICAELA}';
${venta(":'p_mica'")}
select asesora_id = :'p_mica', usuario_id = :'p_mica' from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([asesora, sesion]) => asesora === "t" && sesion === "t"
);

exito(
  "sin quien atendió la venta sigue igual: la fila vacía y la cola offline vieja no la mandan",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
${venta(null)}
select asesora_id is null, usuario_id = :'p_felipe' from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([sinAsesora, sesion]) => sinAsesora === "t" && sesion === "t"
);

exito(
  "una colaboradora suspendida DESPUÉS de guardar una venta sin red todavía puede subirla",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
select retail.suspender_colaborador(:'p_mica') as _s \\gset
${venta(":'p_mica'")}
select asesora_id = :'p_mica' from retail.ventas where id = :'venta_id';
rollback;
`
  ),
  ([guardada]) => guardada === "t"
);

// ---------------------------------------------------------------------------
// Lo que se lee después: «Ventas de hoy» y las sobrecargas
// ---------------------------------------------------------------------------

exito(
  "«Ventas de hoy» firma la venta con quien atendió, no con la sesión",
  comoPersona(
    FELIPE,
    `${PERSONAS}${fixture()}
${venta(":'p_mica'")}
select vendedor = (select nombres || ' ' || apellidos from public.personas where id = :'p_mica')
  from retail.fn_ventas_del_dia(:'ubic') where venta_id = :'venta_id';
rollback;
`
  ),
  ([esLaVendedora]) => esLaVendedora === "t"
);

exito(
  "queda UNA sola sobrecarga de registrar_venta y con los permisos de siempre",
  `begin;
select count(*), bool_and(p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname = 'registrar_venta';
rollback;
`,
  ([cuantas, permisosIguales]) => Number(cuantas) === 1 && permisosIguales === "t"
);

exito(
  "la lectura de turno no rompe donde no hay asistencia de Dynamic (local: tabla vacía, sin error)",
  comoPersona(FELIPE, `${PERSONAS}select count(*) from retail.fn_asesoras_de_turno(:'tru');
rollback;
`),
  ([filas]) => Number(filas) >= 0
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

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
      const columnas = resultado.salida.split("|");
      if (!caso.verificar(columnas)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
