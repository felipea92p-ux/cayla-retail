#!/usr/bin/env node
/**
 * Prueba del candado "solo por RPC" sobre ventas y devoluciones — CAYLA V2.
 *
 * EL PROBLEMA QUE PRUEBA. `supabase/migrations/20260918190000_ventas_devoluciones_solo_rpc.sql`
 * le quita a `authenticated` el permiso de escribir directo en ventas, venta_items,
 * devoluciones, devolucion_items y venta_anulacion_items (ADR-0112). Dos cosas tienen que ser
 * ciertas a la vez, y cada una sola no sirve:
 *
 *   1. El ataque deja de funcionar: una colaboradora con la consola del navegador abierta
 *      recibe "permission denied" al fabricar una venta o aprobarse una devolución.
 *   2. Nada legítimo se rompe: vender, devolver, rechazar y anular siguen funcionando, porque
 *      las funciones security definer corren con los permisos de su dueña.
 *
 * LA PRUEBA DE CONTROL (la más importante). Un test que nunca ha fallado no prueba nada. Los
 * dos primeros casos corren el MISMO ataque SIN la migración y esperan que FUNCIONE: eso
 * demuestra que el hueco existía en este Postgres y que el harness es capaz de verlo. Si esos
 * dos casos empiezan a fallar, alguien cerró el hueco por otro camino (o el Postgres local
 * dejó de reproducir el problema) y los demás resultados ya no significan lo mismo.
 *
 * CÓMO CORRE. Mismo patrón que `registrar_venta.mjs` y `aprobar_devolucion_caja.mjs` (ADR-0066):
 * cada caso en su propia transacción que TERMINA EN ROLLBACK — la migración se aplica DENTRO
 * de esa transacción (en Postgres el DDL es transaccional), así que el Postgres local que
 * comparten ~27 worktrees no cambia nunca. Habla con `docker exec ... psql`, sin PostgREST.
 * Para que el permiso de tabla se evalúe de verdad, el caso hace `set local role
 * authenticated`: sin eso corre como `postgres` (dueña) y se salta todo.
 *
 * LO QUE NO CUBRE. `liquidar_prenda_danada` (la sexta función que escribe en estas tablas)
 * no tiene caso propio: su fixture exige una prenda en cuarentena. Es security definer con
 * dueña `postgres` (verificado en local y producción), y los 4 casos de regresión ya prueban
 * el mecanismo que la protege. Tampoco prueba PostgREST real: prueba el permiso de Postgres,
 * que es la puerta que PostgREST cruza.
 *
 * USO
 *   pnpm pruebas:candado-ventas    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(
  join(RAIZ, "supabase/migrations/20260918190000_ventas_devoluciones_solo_rpc.sql"),
  "utf8"
);

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// No lanza: un caso que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Una transacción que siempre termina en ROLLBACK, con la persona simulada y (o no) el candado. */
function dentro(authUserId, cuerpo, { conCandado = true } = {}) {
  return `
begin;
${conCandado ? MIGRACION : "-- (control: SIN la migración)"}
set local request.jwt.claim.sub = '${authUserId}';
${cuerpo}
rollback;
`;
}

/** Sede con piso/almacén, caja abierta y stock de sobra — lo que registrar_venta exige. */
function fixture(ubicacionNombre = "Tienda Lima") {
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
  values (:'v1', :'ubic', :'sub_piso', 'entrada', 1000, 'colchón de prueba') returning id as mov1 \\gset
select retail.fn_aplicar_movimiento(:'mov1') as _d1 \\gset
`;
}

/** Una venta de 1 unidad hecha por la RPC real, ya como `authenticated` (como en producción). */
const VENDER_UNA = `
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'v1_precio', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', :'v1_precio')),
  null, gen_random_uuid()) as venta_id \\gset
select id as venta_item from retail.venta_items where venta_id = :'venta_id' \\gset
`;

const CASOS = [];
const exito = (nombre, sql, verificar) => CASOS.push({ nombre, tipo: "exito", sql, verificar });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ---------------------------------------------------------------------------
// A. CONTROL — sin la migración el ataque FUNCIONA (si esto falla, nada de abajo vale)
// ---------------------------------------------------------------------------

exito(
  "CONTROL sin candado: una colaboradora SÍ puede fabricar una venta desde la consola",
  dentro(
    MICAELA,
    `select id as ub from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
set local role authenticated;
insert into retail.ventas (ubicacion_id) values (:'ub') returning id;`,
    { conCandado: false }
  ),
  (c) => /^[0-9a-f-]{36}$/.test(c[0])
);

exito(
  "CONTROL sin candado: una colaboradora SÍ puede tocar el estado de una devolución directo",
  dentro(
    MICAELA,
    `set local role authenticated;
update retail.devoluciones set estado = 'aprobada' where false;`,
    { conCandado: false }
  ),
  () => true
);

// ---------------------------------------------------------------------------
// B. CON EL CANDADO — el mismo ataque, y los demás caminos, se rechazan
// ---------------------------------------------------------------------------

const DENEGADO = (t) => `permission denied for table ${t}`;

error(
  "una colaboradora ya NO puede fabricar una venta (INSERT en ventas)",
  dentro(MICAELA, `select id as ub from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
set local role authenticated;
insert into retail.ventas (ubicacion_id) values (:'ub');`),
  DENEGADO("ventas")
);
error(
  "ni siquiera un líder puede anular una venta a mano (UPDATE en ventas): debe usar anular_venta",
  dentro(FELIPE, `set local role authenticated;\nupdate retail.ventas set estado = 'anulada' where false;`),
  DENEGADO("ventas")
);
error(
  "nadie borra líneas de venta directo (DELETE en venta_items)",
  dentro(MICAELA, `set local role authenticated;\ndelete from retail.venta_items where false;`),
  DENEGADO("venta_items")
);
error(
  "nadie inserta líneas de venta sueltas (INSERT en venta_items)",
  dentro(MICAELA, `set local role authenticated;
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario) values (gen_random_uuid(), gen_random_uuid(), 1, 1);`),
  DENEGADO("venta_items")
);
error(
  "una colaboradora ya NO puede aprobarse su propia devolución (UPDATE en devoluciones)",
  dentro(MICAELA, `set local role authenticated;\nupdate retail.devoluciones set estado = 'aprobada', reembolso_metodo = 'efectivo', reembolso_monto = 500 where false;`),
  DENEGADO("devoluciones")
);
error(
  "nadie crea devoluciones sueltas (INSERT en devoluciones)",
  dentro(MICAELA, `set local role authenticated;
insert into retail.devoluciones (venta_id, ubicacion_id, motivo) values (gen_random_uuid(), gen_random_uuid(), 'x');`),
  DENEGADO("devoluciones")
);
error(
  "nadie edita líneas de devolución directo (UPDATE en devolucion_items)",
  dentro(MICAELA, `set local role authenticated;\nupdate retail.devolucion_items set cantidad = 99 where false;`),
  DENEGADO("devolucion_items")
);
error(
  "nadie inserta líneas de devolución sueltas (INSERT en devolucion_items)",
  dentro(MICAELA, `set local role authenticated;
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (gen_random_uuid(), gen_random_uuid(), 1, 'vendible');`),
  DENEGADO("devolucion_items")
);
error(
  "nadie escribe la condición de una anulación a mano (INSERT en venta_anulacion_items)",
  dentro(MICAELA, `set local role authenticated;
insert into retail.venta_anulacion_items (venta_id, venta_item_id, condicion) values (gen_random_uuid(), gen_random_uuid(), 'vendible');`),
  DENEGADO("venta_anulacion_items")
);

// ---------------------------------------------------------------------------
// C. NADA LEGÍTIMO SE ROMPE — las RPC siguen funcionando, ya como `authenticated`
// ---------------------------------------------------------------------------

exito(
  "leer sigue permitido: authenticated puede seleccionar de ventas",
  dentro(FELIPE, `set local role authenticated;\nselect count(*) >= 0 from retail.ventas;`),
  (c) => c[0] === "t"
);

exito(
  "vender por registrar_venta sigue funcionando y deja su venta con sus líneas",
  dentro(
    FELIPE,
    `${fixture()}
set local role authenticated;
${VENDER_UNA}
select (select estado from retail.ventas where id = :'venta_id'),
       (select count(*) from retail.venta_items where venta_id = :'venta_id');`
  ),
  (c) => c[0] === "completada" && c[1] === "1"
);

exito(
  "devolver y aprobar (crear_devolucion + aprobar_devolucion) siguen funcionando",
  dentro(
    FELIPE,
    `${fixture()}
set local role authenticated;
${VENDER_UNA}
select retail.crear_devolucion(:'venta_id', :'ubic',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'cantidad', 1, 'condicion', 'vendible')),
  'prueba automatizada') as dev \\gset
select retail.aprobar_devolucion(:'dev', null, null) as _ok \\gset
select estado from retail.devoluciones where id = :'dev';`
  ),
  (c) => c[0] === "aprobada"
);

exito(
  "rechazar_devolucion sigue funcionando",
  dentro(
    FELIPE,
    `${fixture()}
set local role authenticated;
${VENDER_UNA}
select retail.crear_devolucion(:'venta_id', :'ubic',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'cantidad', 1, 'condicion', 'vendible')),
  'prueba automatizada') as dev \\gset
select retail.rechazar_devolucion(:'dev', 'prueba automatizada') as _ok \\gset
select estado from retail.devoluciones where id = :'dev';`
  ),
  (c) => c[0] === "rechazada"
);

exito(
  "anular_venta sigue funcionando (escribe en ventas y en venta_anulacion_items)",
  dentro(
    FELIPE,
    `${fixture()}
set local role authenticated;
${VENDER_UNA}
select retail.anular_venta(:'venta_id', 'prueba automatizada',
  jsonb_build_array(jsonb_build_object('venta_item_id', :'venta_item', 'condicion', 'vendible'))) as _ok \\gset
select (select estado from retail.ventas where id = :'venta_id'),
       (select count(*) from retail.venta_anulacion_items where venta_id = :'venta_id');`
  ),
  (c) => c[0] === "anulada" && c[1] === "1"
);

// ---------------------------------------------------------------------------

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const r = correr(caso.sql);
    if (caso.tipo === "error") {
      if (r.ok) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba un error ("${caso.contiene}") y no hubo ninguno`);
      } else if (!r.mensaje.includes(caso.contiene)) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    se esperaba "${caso.contiene}", salió:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    } else if (!r.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${r.mensaje.trim().split("\n").join("\n    ")}`);
    } else if (!caso.verificar(r.salida.split("\n").pop().split("|"))) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    valores inesperados: ${JSON.stringify(r.salida)}`);
    } else {
      console.log(`✓ ${caso.nombre}`);
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
