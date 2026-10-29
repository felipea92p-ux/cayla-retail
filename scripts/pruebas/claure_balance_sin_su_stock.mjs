#!/usr/bin/env node
/**
 * Prueba de `20261029155000_claure_balance_sin_su_stock.sql` (ADR-0560, actividad 15): el Balance no cuenta la mercadería de CLAURE como inventario de CAYLA. `fn_bal_stock` resta de cada
 * sede donde opera CLAURE las unidades suyas al corte (hoy en `stock_dueno`, deshaciendo lo movido después con su dueño) y `fn_bal_causas_mercaderia` no cuenta sus movimientos.
 *
 * Lo que importa: (1) hoy, el inventario de Lima baja en las unidades de CLAURE y en su costo; (2) a una fecha pasada, la resta es la de ESA fecha (se deshace lo que CLAURE movió después);
 * (3) las causas de la mercadería no cuentan una entrada de CLAURE; (4) sin prendas de CLAURE, las dos funciones devuelven lo de antes; (5) la migración se puede volver a pegar y, con un
 * texto distinto en una función, aborta sin cambiar nada. Cada caso corre en su transacción y TERMINA EN ROLLBACK. Parte del estado de ANTES (deshace sus reemplazos dentro de la transacción)
 * y luego la aplica: sin ella, los casos fallan. Se mide como DIFERENCIA entre la escena con las prendas de CLAURE y la misma sin su dueño.
 *
 * USO: pnpm pruebas:claure-balance-sin-su-stock   (necesita el stack local: `npx supabase start`, con las migraciones de ADR-0542 y de la cuenta con CLAURE)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlDeshacer } from "./_deshacer_claure.mjs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const ARCHIVO = "20261029155000_claure_balance_sin_su_stock.sql";
// `fn_movimiento_es_de_claure` (la regla del libro) viene de la actividad 14; la cuenta con CLAURE, de la 1.
const PREVIAS = [leer("20261029004000_cuenta_con_claure.sql"), leer("20261029154000_claure_perdidas_y_danadas.sql")].join("\n");
const FIRMAS = ["retail.fn_bal_stock(date)", "retail.fn_bal_causas_mercaderia(date, date)"];
const ANTES = sqlDeshacer(ARCHIVO, FIRMAS, { reverso: true });
const MIGRACION = leer(ARCHIVO);
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
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

// Una prenda (A) con costo 25 y 10 unidades en Lima, 4 de ellas de CLAURE (`stock_dueno`); hoy entraron 3 de CLAURE (movimiento de hoy con su dueño), que ya están en las 10.
// `conClaure = false` deja la MISMA escena sin su dueño (nada en `stock_dueno`, el movimiento de CAYLA): la diferencia es lo que CLAURE aporta.
const escena = (conClaure) => `
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
reset role;
set local session_replication_role = replica;
update retail.productos set empresa_id = ${conClaure ? CLAURE : CAYLA} where id = :'p_a';
update retail.variantes set costo = 25 where id = :'va_a';
delete from retail.costo_historial where variante_id = :'va_a';
delete from retail.stock where variante_id = :'va_a' and ubicacion_id = ${LIMA};
delete from retail.stock_dueno where variante_id = :'va_a' and ubicacion_id = ${LIMA};
insert into retail.stock (variante_id, ubicacion_id, cantidad) values (:'va_a', ${LIMA}, 10);
${conClaure ? `insert into retail.stock_dueno (variante_id, ubicacion_id, empresa_id, cantidad, cantidad_apartada) values (:'va_a', ${LIMA}, ${CLAURE}, 4, 0);` : ""}
insert into retail.movimientos (id, variante_id, ubicacion_id, tipo, cantidad, motivo, empresa_id, created_at)
  values (${ID("c1")}, :'va_a', ${LIMA}, 'entrada', 3, 'otra', ${conClaure ? CLAURE : CAYLA}, now());
set local session_replication_role = origin;
`;

const medir = (consulta, { conClaure = true, sinMigracion = false } = {}) =>
  psql(`begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n${sinMigracion ? "" : MIGRACION}\n${ESCENA_EMPRESAS}\n${escena(conClaure)}\n\\o\n${consulta}\nrollback;`).split("\n").pop();
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
const STOCK = (corte) => `select unidades || '|' || valor from retail.fn_bal_stock(${corte}) where ubicacion_id = ${LIMA};`;
const CAUSAS = `select coalesce(sum(monto), 0) from retail.fn_bal_causas_mercaderia(${HOY}, ${HOY});`;
// La diferencia entre dos mediciones de «unidades|valor».
const resta = (a, b) => {
  const [ua, va] = a.split("|").map(Number);
  const [ub, vb] = b.split("|").map(Number);
  return `${ua - ub}|${Math.round((va - vb) * 100) / 100}`;
};

caso("hoy: el inventario de Lima baja en las 4 unidades de CLAURE y en su costo (4 × 25 = 100)", () =>
  igual(resta(medir(STOCK(HOY)), medir(STOCK(HOY), { conClaure: false })), "-4|-100"),
);

caso("a una fecha pasada (ayer): la resta es la de ayer, deshaciendo lo que CLAURE movió hoy (entraron 3: ayer había 1)", () =>
  igual(resta(medir(STOCK(`${HOY} - 1`)), medir(STOCK(`${HOY} - 1`), { conClaure: false })), "-1|-25"),
);

caso("las causas de la mercadería no cuentan la entrada de CLAURE (3 × 25 = 75 que el Balance ya no tiene)", () =>
  igual(String(Math.round((Number(medir(CAUSAS)) - Number(medir(CAUSAS, { conClaure: false }))) * 100) / 100), 75),
);

caso("sin prendas de CLAURE las dos funciones dan lo de antes: lo mismo con y sin la migración", () =>
  igual(medir(STOCK(HOY), { conClaure: false }), medir(STOCK(HOY), { conClaure: false, sinMigracion: true })) ??
  igual(medir(CAUSAS, { conClaure: false }), medir(CAUSAS, { conClaure: false, sinMigracion: true })),
);

caso("sin la migración (el Balance de antes) las 4 unidades de CLAURE sí contaban", () =>
  igual(resta(medir(STOCK(HOY), { sinMigracion: true }), medir(STOCK(HOY), { conClaure: false, sinMigracion: true })), "0|0"),
);

caso("la migración se puede volver a pegar: mismo inventario", () =>
  igual(
    psql(`begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n${MIGRACION}\n${MIGRACION}\n${ESCENA_EMPRESAS}\n${escena(true)}\n\\o\n${STOCK(HOY)}\nrollback;`).split("\n").pop(),
    medir(STOCK(HOY)),
  ),
);

caso("si una función de producción no tiene el texto esperado, la migración aborta sin cambiar nada y dice cuál", () => {
  try {
    psql(
      `begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n` +
        `do $$ begin execute replace(pg_get_functiondef('retail.fn_bal_stock(date)'::regprocedure), 'anulado_web) a join', 'anulado_web ) a join'); end $$;\n${MIGRACION}\nrollback;`,
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
