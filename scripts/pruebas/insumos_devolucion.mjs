/**
 * Prueba de `devolver_insumo_de_produccion` y de los dos cambios que la acompañan
 * (`registrar_consumo_insumo` con costo neto, `anular_produccion` que devuelve lo
 * descontado) — ADR-0133, F3b. Migración 20260920100000.
 *
 * Qué garantiza (cada caso termina en ROLLBACK, así que no deja rastro en el Postgres
 * local compartido):
 *   1. Devolver parte de un consumo sube el saldo del lote y BAJA el costo de tela de la orden.
 *   2. No se devuelve más de lo que la orden tiene descontado.
 *   3. Sin consumo previo no hay nada que devolver.
 *   4. La cantidad vuelve al ÚLTIMO lote del que salió la orden, no al primero.
 *   5. Devolver todo y volver a descontar deja el costo en el neto (no arrastra lo devuelto).
 *   6. Con la orden cerrada no se devuelve.
 *   7. Anular la orden devuelve TODO al estante y deja el costo de la orden en 0.
 *   8. Anular una orden sin consumos se comporta como siempre.
 *   9. Quien no opera el Taller no puede devolver.
 *  10. El ledger nunca se borra: la devolución es una fila nueva, motivo explícito.
 *
 * USO
 *   pnpm pruebas:insumos-devolucion   → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Taller, un modelo con orden abierta de 10 prendas y un insumo de tela con un lote de 100 m a S/ 20. */
const PREPARAR = `
begin;
set local request.jwt.claim.sub = '${FELIPE}';
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
select id as v1, producto_id as prod from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('T-DEV-LINO', 'Lino de prueba', 'tela', 'metro') returning id as ins \\gset
select retail.recibir_insumo(:'ins', :'taller', 100, 2000, 'L-A') as _recibio \\gset
select retail.abrir_produccion(:'taller', :'prod', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 10))) as ord \\gset
`;

const SALDO_LOTE = (codigo) => `
  (select l.cantidad_ingresada
     - coalesce((select sum(cantidad) from retail.movimientos_insumo where insumo_lote_id = l.id and tipo in ('consumo','merma')), 0)
     + coalesce((select sum(cantidad) from retail.movimientos_insumo where insumo_lote_id = l.id and tipo = 'devolucion'), 0)
   from retail.insumo_lotes l where l.insumo_id = :'ins' and l.codigo_lote = '${codigo}')`;

const CASOS = [
  {
    nombre: "1. devolver parte sube el saldo del lote y baja el costo de tela de la orden",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_consumo_insumo(:'ord', :'ins', 40) as _c \\gset
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 15) as _d \\gset
select (select costo_tela from retail.producciones where id = :'ord'), ${SALDO_LOTE("L-A")};
rollback;`,
    verificar: (c) => Number(c[0]) === 500 && Number(c[1]) === 75,
  },
  {
    nombre: "2. no se devuelve más de lo que la orden tiene descontado",
    tipo: "error",
    contiene: "solo tiene descontado",
    sql: `${PREPARAR}
select retail.registrar_consumo_insumo(:'ord', :'ins', 40) as _c \\gset
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 41);
rollback;`,
  },
  {
    nombre: "3. sin consumo previo no hay nada que devolver",
    tipo: "error",
    contiene: "no tiene este insumo descontado",
    sql: `${PREPARAR}
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 1);
rollback;`,
  },
  {
    nombre: "4. la cantidad vuelve al ÚLTIMO lote del que salió la orden",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.recibir_insumo(:'ins', :'taller', 50, 1250, 'L-B') as _b \\gset
select retail.registrar_consumo_insumo(:'ord', :'ins', 100) as _c1 \\gset
select retail.registrar_consumo_insumo(:'ord', :'ins', 20) as _c2 \\gset
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 5) as _d \\gset
select ${SALDO_LOTE("L-A")}, ${SALDO_LOTE("L-B")}, (select costo_tela from retail.producciones where id = :'ord');
rollback;`,
    // El consumo de 100 m vacía L-A y el de 20 m sale de L-B.
    // L-A quedó en 0; L-B: 50 − 20 + 5 = 35. Costo: 100×20 + 20×25 − 5×25 = 2375.
    verificar: (c) => Number(c[0]) === 0 && Number(c[1]) === 35 && Number(c[2]) === 2375,
  },
  {
    nombre: "5. devolver todo y volver a descontar deja el costo en el neto",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_consumo_insumo(:'ord', :'ins', 40) as _c1 \\gset
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 40) as _d \\gset
select costo_tela as tras_devolver from retail.producciones where id = :'ord' \\gset
select retail.registrar_consumo_insumo(:'ord', :'ins', 10) as _c2 \\gset
select :'tras_devolver', (select costo_tela from retail.producciones where id = :'ord');
rollback;`,
    verificar: (c) => Number(c[0]) === 0 && Number(c[1]) === 200,
  },
  {
    nombre: "6. con la orden cerrada no se devuelve",
    tipo: "error",
    contiene: "antes de cerrar la orden",
    sql: `${PREPARAR}
select retail.registrar_consumo_insumo(:'ord', :'ins', 40) as _c \\gset
select retail.cerrar_produccion(:'ord', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 10)), null, null, null) as _cierre \\gset
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 5);
rollback;`,
  },
  {
    nombre: "7. anular devuelve TODO al estante y deja el costo de la orden en 0",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_consumo_insumo(:'ord', :'ins', 40) as _c1 \\gset
select retail.registrar_consumo_insumo(:'ord', :'ins', 20) as _c2 \\gset
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 10) as _d \\gset
select retail.anular_produccion(:'ord', 'prueba') as _a \\gset
select ${SALDO_LOTE("L-A")}, (select costo_tela from retail.producciones where id = :'ord'), (select estado from retail.producciones where id = :'ord'),
  (select count(*) from retail.movimientos_insumo where produccion_id = :'ord' and motivo = 'anulacion_orden');
rollback;`,
    verificar: (c) => Number(c[0]) === 100 && Number(c[1]) === 0 && c[2] === "anulada" && Number(c[3]) === 1,
  },
  {
    nombre: "8. anular una orden sin consumos se comporta como siempre",
    tipo: "exito",
    sql: `${PREPARAR}
update retail.producciones set costo_tela = 300 where id = :'ord';
select retail.anular_produccion(:'ord', 'sin uso') as _a \\gset
select (select estado from retail.producciones where id = :'ord'), (select costo_tela from retail.producciones where id = :'ord'),
  (select count(*) from retail.movimientos_insumo where produccion_id = :'ord');
rollback;`,
    // El costo tecleado no se toca (no hubo insumos) y no aparece ningún movimiento.
    verificar: (c) => c[0] === "anulada" && Number(c[1]) === 300 && Number(c[2]) === 0,
  },
  {
    nombre: "9. quien no opera el Taller no puede devolver",
    tipo: "error",
    contiene: "No tienes permiso",
    sql: `${PREPARAR}
select retail.registrar_consumo_insumo(:'ord', :'ins', 40) as _c \\gset
set local request.jwt.claim.sub = '${MICAELA}';
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 5);
rollback;`,
  },
  {
    nombre: "10. el ledger no se borra: la devolución es una fila nueva con su motivo",
    tipo: "exito",
    sql: `${PREPARAR}
select retail.registrar_consumo_insumo(:'ord', :'ins', 40) as _c \\gset
select retail.devolver_insumo_de_produccion(:'ord', :'ins', 15, 'se cortó de menos') as _d \\gset
select (select count(*) from retail.movimientos_insumo where produccion_id = :'ord' and tipo = 'consumo'),
  (select count(*) from retail.movimientos_insumo where produccion_id = :'ord' and tipo = 'devolucion' and motivo = 'devolucion_a_estante' and nota = 'se cortó de menos');
rollback;`,
    verificar: (c) => Number(c[0]) === 1 && Number(c[1]) === 1,
  },
];

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
      // La última línea con datos es la del select final; `rollback` no imprime filas.
      const filas = resultado.salida.split("\n").filter((l) => l.trim() !== "" && l.trim().toUpperCase() !== "ROLLBACK");
      const columnas = filas[filas.length - 1].split("|");
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
