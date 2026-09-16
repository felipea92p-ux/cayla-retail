#!/usr/bin/env node
/**
 * Pruebas del candado del historial de movimientos (D-22) contra el Postgres local — CAYLA V2.
 *
 * EL PROBLEMA QUE RESUELVE. `movimientos` es la única fuente desde la que se reconstruye
 * el stock de TRU, AQP y el Taller. 20260916200000_historial_candado_completo.sql cierra
 * las puertas que quedaban (TRUNCATE, modo réplica, aplicar stock a mano, escribir stock
 * directo). Un candado que nadie prueba se borra el día que "estorba": esto demuestra
 * qué cierra y que las RPC legítimas siguen funcionando.
 *
 * Mismo patrón que ADR-0066: psql vía `docker exec`, cada caso en su transacción con
 * ROLLBACK implícito (nunca se commitea), fuera de vitest porque CI no tiene Postgres.
 * A diferencia de las otras pruebas, acá importa QUIÉN ejecuta: los casos de tienda
 * corren con `set local role authenticated`, que es el rol real de una sesión de la app.
 *
 * USO
 *   pnpm pruebas:candado-historial    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder en supabase/seed.sql

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(`begin;\n${sql}\nrollback;`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const DATOS = `
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as variante from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'entrada') as sub \\gset
select id as mov from retail.movimientos order by created_at limit 1 \\gset
`;

const COMO_TIENDA = `
set local role authenticated;
set local request.jwt.claim.sub = '${FELIPE}';
`;

const CASOS = [
  {
    nombre: "Tienda: registrar un movimiento por la RPC sigue funcionando (aplica stock por dentro)",
    tipo: "exito",
    sql: `${DATOS}
select coalesce((select cantidad from retail.stock where variante_id = :'variante' and ubicacion_id = :'ubic' and sububicacion_id = :'sub'), 0) as antes \\gset
${COMO_TIENDA}
select retail.registrar_movimiento(:'variante', :'ubic', 'entrada', 3, 'recepcion', 'prueba candado', :'sub') as _m \\gset
select (select cantidad from retail.stock where variante_id = :'variante' and ubicacion_id = :'ubic' and sububicacion_id = :'sub') - :'antes'::int;`,
    verificar: ([delta]) => delta === "3",
  },
  {
    nombre: "Tienda: volver a aplicar un movimiento a mano está prohibido",
    tipo: "error",
    contiene: "permission denied for function fn_aplicar_movimiento",
    sql: `${DATOS}${COMO_TIENDA}select retail.fn_aplicar_movimiento(:'mov');`,
  },
  {
    nombre: "Tienda: reconstruir el stock a mano está prohibido",
    tipo: "error",
    contiene: "permission denied for function recalcular_stock",
    sql: `${COMO_TIENDA}select retail.recalcular_stock();`,
  },
  {
    nombre: "Tienda: cambiar la cifra de stock sin movimiento está prohibido",
    tipo: "error",
    contiene: "permission denied for table stock",
    sql: `${COMO_TIENDA}update retail.stock set cantidad = cantidad + 100;`,
  },
  {
    nombre: "service_role: escribir en el libro directo está prohibido",
    tipo: "error",
    contiene: "permission denied for table movimientos",
    sql: `${DATOS}
set local role service_role;
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'variante', :'ubic', :'sub', 'entrada', 5, 'sin RPC');`,
  },
  {
    nombre: "service_role: vaciar el libro está prohibido",
    tipo: "error",
    contiene: "permission denied for table movimientos",
    sql: `set local role service_role; truncate retail.movimientos cascade;`,
  },
  {
    nombre: "Dueño: TRUNCATE directo del libro rechazado",
    tipo: "error",
    contiene: "no se vacía",
    sql: `truncate retail.movimientos cascade;`,
  },
  {
    nombre: "Dueño: TRUNCATE en cascada desde variantes también rechazado",
    tipo: "error",
    contiene: "no se vacía",
    sql: `truncate retail.variantes cascade;`,
  },
  {
    nombre: "Modo réplica: borrar una fila del libro sigue rechazado",
    tipo: "error",
    contiene: "no se edita ni se borra",
    sql: `${DATOS}
set local session_replication_role = replica;
delete from retail.movimientos where id = :'mov';`,
  },
];

function main() {
  try {
    psql("select 1;");
  } catch {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
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
      console.log(`✗ ${caso.nombre}\n    valores inesperados: ${r.salida}`);
    } else {
      console.log(`✓ ${caso.nombre}`);
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
