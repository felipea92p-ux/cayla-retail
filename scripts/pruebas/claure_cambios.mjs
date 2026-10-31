#!/usr/bin/env node
/**
 * Prueba de `20261029162000_claure_cambios_la_plata_sigue_a_la_prenda.sql` (ADR-0560, actividad 13): un cambio con prendas de CLAURE mueve lo que se le debe a Claudia, y el Diario, según la regla de
 * Felipe (2026-10-29): la plata sigue a la prenda que se lleva la clienta. Antes la pestaña CLAURE listaba el cambio «por revisar» y no movía nada.
 *
 * Lo que importa: (1) CLAURE → CAYLA: lo que se le debe baja lo que se pagó por la prenda devuelta (en cuentas de CAYLA); (2) CAYLA → CLAURE: sube esa plata más la diferencia que se pagó; (3) CLAURE → CLAURE:
 * solo la diferencia; (4) una venta pagada en efectivo, o un cambio entre prendas de CAYLA, no mueve nada; (5) la pantalla (`fn_claure_filas`), la proyección (`fn_claure_saldo_a`) y el aviso del cierre dicen
 * lo mismo; (6) el Diario mueve la parte sin IGV entre 7011 y 479, cuadrado por cambio; (7) la migración se puede volver a pegar y, con un texto distinto, aborta sin cambiar nada.
 * Cada caso corre en su transacción y TERMINA EN ROLLBACK. Parte de las funciones como estaban antes (las migraciones anteriores las reescriben dentro de la transacción) y aplica la de esta actividad.
 *
 * USO: pnpm pruebas:claure-cambios   (necesita el stack local: `npx supabase start`, con las migraciones de ADR-0542 y de la cuenta con CLAURE)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ELEGIR_A, ELEGIR_B } from "./_claure_prendas.mjs";
import { haceHoras } from "./_reloj_lima.mjs";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
// La cadena que deja las funciones de CLAURE como estaban antes de esta actividad: cada migración reescribe o parcha la suya dentro de la transacción.
const PREVIAS = [
  leer("20261029004000_cuenta_con_claure.sql"),
  leer("20261029013000_cierre_de_caja_con_claudia.sql"),
  leer("20261029020000_claure_fuera_de_las_cifras_de_cayla.sql"),
  leer("20261029043000_claure_apartados_y_pedidos_web.sql"),
  leer("20261029044000_claure_gastos_por_empresa.sql"),
  leer("20261029142000_claure_igv_se_descuenta.sql"),
  leer("20261029144000_claure_efectivo_se_queda_con_claudia.sql"),
].join("\n");
const MIGRACION = leer("20261029162000_claure_cambios_la_plata_sigue_a_la_prenda.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

const sesion = (id) =>
  `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", process.env.BASE_PG ?? "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const sede = (nombres) => {
  const id = psql(`select id from retail.ubicaciones where nombre in (${nombres}) order by nombre limit 1;`);
  if (!id) throw new Error(`La base local no tiene la sede ${nombres}.`);
  return `'${id}'`;
};
const LIMA = sede("'Tienda LIM', 'Tienda Lima'");
const ESCENA_EMPRESAS = `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;
update retail.empresas set cuenta_corriente_desde = ((now() at time zone 'America/Lima')::date - 10) where clave = 'claure';`;
const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;

// A = prenda de CLAURE, B = de CAYLA; todo hoy en Lima, pagado con Yape (Interbank) salvo C4 (efectivo). Cada cambio devuelve 1 prenda de S/ 100 sin descuento:
//   C1 devuelve A y se lleva B (CAYLA), sin diferencia → CLAURE pierde 100 (igv 15.25, base 84.75)
//   C2 devuelve B y se lleva A (CLAURE) con 20 más por Yape (la prenda nueva vale 120) → CLAURE gana 120 (igv 18.31, base 101.69)
//   C3 devuelve A y se lleva A (CLAURE) con 20 más por Yape → CLAURE gana solo la diferencia: 20 (igv 3.05, base 16.95)
//   C4 devuelve A pagada en EFECTIVO y se lleva B → no mueve nada (el efectivo lo tiene Claudia)
//   C5 devuelve B y se lleva B → CAYLA con CAYLA: nada
const ESCENA = `
${ELEGIR_A}
${ELEGIR_B}
select id as interbank from retail.cuentas_dinero where nombre = 'Interbank' \\gset
reset role;
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
insert into retail.cajas (id, ubicacion_id, estado, monto_apertura, abierta_en, cerrada_en)
  values (${ID("e1")}, ${LIMA}, 'cerrada', 100, ${haceHoras(3)}, ${haceHoras(1)});
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, caja_id) values
  (${ID("a1")}, ${LIMA}, ${haceHoras(2)}, 'completada', false, ${ID("e1")}), (${ID("a2")}, ${LIMA}, ${haceHoras(2)}, 'completada', false, ${ID("e1")}),
  (${ID("a3")}, ${LIMA}, ${haceHoras(2)}, 'completada', false, ${ID("e1")}), (${ID("a4")}, ${LIMA}, ${haceHoras(2)}, 'completada', false, ${ID("e1")}),
  (${ID("a5")}, ${LIMA}, ${haceHoras(2)}, 'completada', false, ${ID("e1")});
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario) values
  (${ID("b1")}, ${ID("a1")}, :'va_a', 1, 100, 0, 10), (${ID("b2")}, ${ID("a2")}, :'va_b', 1, 100, 0, 10), (${ID("b3")}, ${ID("a3")}, :'va_a', 1, 100, 0, 10),
  (${ID("b4")}, ${ID("a4")}, :'va_a', 1, 100, 0, 10), (${ID("b5")}, ${ID("a5")}, :'va_b', 1, 100, 0, 10);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values
  (${ID("a1")}, 'yape', 100, :'interbank'), (${ID("a2")}, 'yape', 100, :'interbank'), (${ID("a3")}, 'yape', 100, :'interbank'), (${ID("a4")}, 'efectivo', 100, null), (${ID("a5")}, 'yape', 100, :'interbank');
insert into retail.cambios (id, venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, cuenta_dinero_id, motivo, condicion) values
  (${ID("c1")}, ${ID("b1")}, ${LIMA}, :'va_b', 1, 0, null, null, 'otro', 'vendible'),
  (${ID("c2")}, ${ID("b2")}, ${LIMA}, :'va_a', 1, 20, 'yape', :'interbank', 'otro', 'vendible'),
  (${ID("c3")}, ${ID("b3")}, ${LIMA}, :'va_a', 1, 20, 'yape', :'interbank', 'otro', 'vendible'),
  (${ID("c4")}, ${ID("b4")}, ${LIMA}, :'va_b', 1, 0, null, null, 'otro', 'vendible'),
  (${ID("c5")}, ${ID("b5")}, ${LIMA}, :'va_b', 1, 0, null, null, 'otro', 'vendible');
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, cambio_id, empresa_id) values
  (:'va_b', ${LIMA}, 'salida', 1, 'cambio', ${ID("c1")}, ${CAYLA}), (:'va_a', ${LIMA}, 'salida', 1, 'cambio', ${ID("c2")}, ${CLAURE}),
  (:'va_a', ${LIMA}, 'salida', 1, 'cambio', ${ID("c3")}, ${CLAURE}), (:'va_b', ${LIMA}, 'salida', 1, 'cambio', ${ID("c4")}, ${CAYLA}),
  (:'va_b', ${LIMA}, 'salida', 1, 'cambio', ${ID("c5")}, ${CAYLA});
set local session_replication_role = origin;
`;

const medir = (consulta, { sinMigracion = false, previas = PREVIAS } = {}) =>
  psql(`begin;\n\\o /dev/null\n${previas}\n${sinMigracion ? "" : MIGRACION}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${consulta}\nrollback;`).split("\n").pop();
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);

let fallas = 0;
function caso(nombre, fn) {
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 12).join("\n    ")}`);
  }
}

const HOY = `(now() at time zone 'America/Lima')::date`;
const CAMBIOS = `reset role;
select coalesce(string_agg(right(cambio_id::text, 2) || ':' || delta || ':' || igv || ':' || base, ' ' order by cambio_id), 'ninguno')
  from retail.fn_claure_cambios(${HOY} - 1, ${HOY}, array[${LIMA}::uuid]);`;

caso("cada cambio mueve lo que se le debe según la prenda que se lleva: C1 −100, C2 +120, C3 +20; el pagado en efectivo y CAYLA con CAYLA no mueven nada", () =>
  igual(medir(CAMBIOS), "c1:-100.00:-15.25:-84.75 c2:120.00:18.31:101.69 c3:20.00:3.05:16.95"),
);

caso("la pestaña CLAURE los lista CONTADOS (antes «por revisar»), por día y medio", () =>
  igual(
    medir(`reset role;
select coalesce(sum(n_pagos), 0) || '|' || coalesce(sum(monto), 0) || '|' || coalesce(sum(igv), 0) || '|' || bool_and(contado)::text
  from retail.fn_claure_filas(array[${LIMA}::uuid]) where origen = 'cambio';`),
    "3|40.00|6.11|true",
  ),
);

caso("lo que se le debe a hoy sube lo mismo que la suma de sus bases: −84.75 + 101.69 + 16.95 = 33.89", () =>
  igual(
    medir(`reset role;
select round(retail.fn_claure_saldo_a(${HOY}) - (select coalesce(sum(f.monto - coalesce(f.igv, 0) - coalesce(f.comision, 0)), 0) from retail.fn_claure_filas(array[${LIMA}::uuid]) f where f.contado and f.origen <> 'cambio'), 2);`),
    "33.89",
  ),
);

caso("el aviso del cierre dice lo mismo que la pantalla: el saldo del cierre es el de `fn_claure_saldo_a`", () =>
  igual(
    medir(`reset role;
select retail.fn_claure_saldo_a(${HOY}) as s \\gset
${sesion(FELIPE)}
select (retail.fn_claure_cierre(${ID("e1")})->>'saldo')::numeric = :s::numeric;`),
    "t",
  ),
);

caso("el Diario mueve la parte sin IGV entre las ventas de CAYLA (7011) y lo que se le debe (479), cuadrado por cambio", () =>
  igual(
    medir(`${sesion(FELIPE)}
select (select count(*) from (select asiento from retail.fn_asientos(${HOY}, ${HOY}, null) where regla = 'claure_cambio' group by asiento having round(sum(debe), 2) <> round(sum(haber), 2)) x) || '|' ||
       (select string_agg(right(origen_id::text, 2) || ':' || cuenta || ':' || debe::numeric(12,2) || ':' || haber::numeric(12,2), ' ' order by origen_id, cuenta)
          from retail.fn_asientos(${HOY}, ${HOY}, null) where regla = 'claure_cambio');`),
    "0|c1:479:84.75:0.00 c1:7011:0.00:84.75 c2:479:0.00:101.69 c2:7011:101.69:0.00 c3:479:0.00:16.95 c3:7011:16.95:0.00",
  ),
);

caso("sin la migración, los cambios no movían nada (el control de que la prueba es sensible)", () =>
  igual(
    medir(`reset role;
select coalesce(sum(monto), 0) || '|' || count(*) filter (where contado) from retail.fn_claure_filas(array[${LIMA}::uuid]) where origen = 'cambio';`, { sinMigracion: true }),
    "40.00|0",
  ),
);

caso("la migración se puede volver a pegar: mismos cambios", () =>
  igual(
    psql(`begin;\n\\o /dev/null\n${PREVIAS}\n${MIGRACION}\n${MIGRACION}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${CAMBIOS}\nrollback;`).split("\n").pop(),
    "c1:-100.00:-15.25:-84.75 c2:120.00:18.31:101.69 c3:20.00:3.05:16.95",
  ),
);

caso("si una función de producción no tiene el texto esperado, la migración aborta sin cambiar nada y dice cuál", () => {
  try {
    psql(
      `begin;\n\\o /dev/null\n${PREVIAS}\n` +
        `do $$ begin execute replace(pg_get_functiondef('retail.fn_claure_filas(uuid[])'::regprocedure), 'from cambiados k left join', 'from cambiados k  left join'); end $$;\n${MIGRACION}\nrollback;`,
    );
    return "la migración no abortó con una función distinta a la esperada";
  } catch (e) {
    return String(e.stderr).includes("cambió desde que se escribió esta migración") ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");
