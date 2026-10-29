#!/usr/bin/env node
/**
 * Prueba de `20261029142000_claure_igv_se_descuenta.sql` (ADR-0560, actividad 10): el IGV de lo vendido de CLAURE se le descuenta a Claudia en el
 * aviso del cierre de caja. La boleta sale con el RUC de CAYLA, así que CAYLA declara y paga ese IGV: lo que se le debe es lo cobrado SIN IGV.
 * Solo lee (`fn_claure_cierre`).
 *
 * Lo que importa: (1) el saldo del día y el de antes bajan por el IGV, y `hoy.igv` lo dice; (2) una devolución resta su IGV (el IGV es neto de
 * ventas y devoluciones); (3) el saldo del cierre es EXACTAMENTE cobrado − IGV − comisión − pagado de las mismas filas que lee la pantalla CLAURE;
 * (4) una caja de otra sede sigue diciendo que no hay; (5) la migración se puede volver a pegar y, si la función de producción no tiene el texto esperado,
 * aborta sin cambiar nada. Cada caso corre en su transacción con las migraciones aplicadas dentro y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:claure-igv   (necesita el stack local: `npx supabase start`, con las migraciones de ADR-0542 y de la cuenta con CLAURE)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
// La cadena que deja `fn_claure_cierre` como estaba antes de esta actividad (con los gastos de la actividad 8) y, encima, la migración que se prueba.
const PREVIAS = [
  leer("20261029004000_cuenta_con_claure.sql"),
  leer("20261029011000_pagar_a_claure.sql"),
  leer("20261029013000_cierre_de_caja_con_claudia.sql"),
  leer("20261029020000_claure_fuera_de_las_cifras_de_cayla.sql"),
  leer("20261029044000_claure_gastos_por_empresa.sql"),
].join("\n");
const MIGRACION = leer("20261029142000_claure_igv_se_descuenta.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const LUCIA = "22222222-2222-4222-8222-0000000000b1"; // cierra la caja de Tienda Lima y no es líder (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

const sesion = (id) =>
  `reset role;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

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
const TRUJILLO = sede("'Tienda TRU', 'Tienda Trujillo'");
const ESCENA_EMPRESAS = `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;`;

const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;
// La escena del cierre de la actividad 3: la caja de hoy y la de ayer en Lima, y una de Trujillo. A = prenda de CLAURE, B = de CAYLA.
//   Hoy: tarjeta 50 (la mitad de la venta mixta a1) y Yape 118 (a2, de CLAURE) → cobrado 168, IGV 7.63 + 18.00 = 25.63, comisión 1.40, pagado 40.
//   Ayer: Yape 59 (a5) → cobrado 59, IGV 9.00, pagado 10.
const ESCENA = `
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
select id as izipay from retail.cuentas_dinero where nombre = 'Por depositar Izipay' \\gset
select id as interbank from retail.cuentas_dinero where nombre = 'Interbank' \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
delete from retail.pos_tarifas where maquina_id in (select id from retail.pos_maquinas where cuenta_id = :'izipay');
delete from retail.medios_de_cobro where ubicacion_id = ${LIMA};
insert into retail.pos_maquinas (nombre, cuenta_id) select 'Izipay prueba', :'izipay' where not exists (select 1 from retail.pos_maquinas m where m.cuenta_id = :'izipay');
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde)
  select m.id, 'tarjeta', 2.38, true, 0, 0, date '2026-01-01' from retail.pos_maquinas m where m.cuenta_id = :'izipay';
insert into retail.cajas (id, ubicacion_id, estado, monto_apertura, abierta_en, cerrada_en) values
  (${ID("e1")}, ${LIMA}, 'cerrada', 100, now() - interval '3 hours', now()),
  (${ID("e2")}, ${LIMA}, 'cerrada', 100, now() - interval '1 day 3 hours', now() - interval '1 day'),
  (${ID("e3")}, ${TRUJILLO}, 'cerrada', 100, now() - interval '3 hours', now());
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, caja_id) values
  (${ID("a1")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a2")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a3")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a5")}, ${LIMA}, now() - interval '1 day 2 hours', 'completada', false, ${ID("e2")}),
  (${ID("a7")}, ${TRUJILLO}, now() - interval '2 hours', 'completada', false, ${ID("e3")});
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("a1")}, :'va_a', 1, 100, 10), (${ID("a1")}, :'va_b', 1, 100, 10),
  (${ID("a2")}, :'va_a', 1, 118, 10),
  (${ID("a3")}, :'va_b', 1, 100, 10),
  (${ID("a5")}, :'va_a', 1, 59, 10),
  (${ID("a7")}, :'va_b', 1, 100, 10);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values
  (${ID("a1")}, 'tarjeta', 100, :'izipay'), (${ID("a1")}, 'efectivo', 100, null),
  (${ID("a2")}, 'yape', 118, :'interbank'),
  (${ID("a3")}, 'yape', 100, :'interbank'),
  (${ID("a5")}, 'yape', 59, :'interbank'),
  (${ID("a7")}, 'efectivo', 100, null);
-- Lo ya pagado a Claudia: S/ 40 hoy y S/ 10 ayer (a la hora de Lima).
insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, monto, estado)
  values ('pago_claure', (now() at time zone 'America/Lima')::date, :'interbank', 40, 'vigente'),
         ('pago_claure', (now() at time zone 'America/Lima')::date - 1, :'interbank', 10, 'vigente');
set local session_replication_role = origin;
`;
// Una devolución aprobada hoy de la venta de CLAURE a2 (Yape 118, reembolsada desde Interbank): su IGV (−18.00) resta del IGV de hoy.
const DEVOLUCION = `
reset role;
select id as it_a2 from retail.venta_items where venta_id = ${ID("a2")} \\gset
select id as interbank from retail.cuentas_dinero where nombre = 'Interbank' \\gset
set local session_replication_role = replica;
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, reembolso_cuenta_id, aprobado_en)
  values (${ID("d1")}, ${ID("a2")}, ${LIMA}, 'prueba de IGV', 'aprobada', 118, 'yape', :'interbank', now());
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (${ID("d1")}, :'it_a2', 1, 'vendible');
set local session_replication_role = origin;
`;

const dentro = (consulta, { sesionDe = FELIPE, antes = "", sinMigracion = false } = {}) =>
  psql(
    `begin;\n\\o /dev/null\n${PREVIAS}\n${sinMigracion ? "" : MIGRACION}\n${ESCENA_EMPRESAS}\n${ESCENA}\n${antes}\n\\o\n${sesionDe ? sesion(sesionDe) : ""}\n${consulta}\nrollback;`,
  );
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

// Saldo, saldo de antes, lo cobrado y el IGV de hoy, la comisión y lo pagado, en una línea.
const RESUMEN = (caja) => `select (j->>'saldo') || '|' || (j->>'saldo_anterior') || '|' || (j->'hoy'->>'cobrado') || '|' || (j->'hoy'->>'devuelto') || '|' || (j->'hoy'->>'igv') || '|' || (j->'hoy'->>'comision') || '|' || (j->'hoy'->>'pagado')
  from (select retail.fn_claure_cierre(${ID(caja)}) as j) x;`;

caso("el cierre de hoy descuenta el IGV: saldo, saldo de antes y el IGV de hoy", () =>
  // Cobrado 168 + 59 de ayer = 227; IGV 25.63 (hoy) + 9.00 (ayer) = 34.63; comisión 1.40; pagado 50 → 227 − 34.63 − 1.40 − 50 = 140.97.
  // Saldo de antes de hoy: 59 − 9.00 − 10 = 40.00.
  igual(dentro(RESUMEN("e1")), "140.97|40.00|168.00|0.00|25.63|1.40|40.00"),
);

caso("una caja de ayer lee su día: el IGV es el de entonces", () =>
  // Ayer: cobró 59 (IGV 9.00) y se pagaron 10 ese día → saldo 59 − 9 − 10 = 40.00; antes de ese día, nada.
  igual(dentro(RESUMEN("e2")), "40.00|0.00|59.00|0.00|9.00|0.00|10.00"),
);

caso("una devolución resta su IGV: el IGV es neto de ventas y devoluciones", () =>
  // Hoy se devolvió 118 (IGV 18.00): IGV de hoy 25.63 − 18.00 = 7.63. Saldo: 168 + 59 − 118 − (7.63 + 9.00) − 1.40 − 50 = 40.97.
  igual(dentro(RESUMEN("e1"), { antes: DEVOLUCION }), "40.97|40.00|168.00|118.00|7.63|1.40|40.00"),
);

caso("el saldo del cierre es exactamente cobrado − IGV − comisión − pagado de las filas que lee la pantalla CLAURE", () =>
  igual(
    dentro(
      // `fn_claure_filas` es interna (solo la ven las otras funciones): se lee como dueño de la base y el cierre, como la cuenta.
      `reset role;
       select round(sum(f.monto) - sum(coalesce(f.igv, 0)) - sum(coalesce(f.comision, 0)) - 50, 2) as base
         from retail.fn_claure_filas(array[${LIMA}::uuid]) f where f.contado and f.fecha <= (now() at time zone 'America/Lima')::date \\gset
       ${sesion(FELIPE)}
       select (retail.fn_claure_cierre(${ID("e1")})->>'saldo')::numeric = :'base'::numeric;`,
      { antes: DEVOLUCION },
    ),
    "t",
  ),
);

caso("quien cierra la caja de Lima y no es líder ve el mismo saldo", () => igual(dentro(RESUMEN("e1"), { sesionDe: LUCIA }), "140.97|40.00|168.00|0.00|25.63|1.40|40.00"));

caso("una caja de otra sede (donde CLAURE no opera) solo dice que no hay", () =>
  igual(dentro(`select (retail.fn_claure_cierre(${ID("e3")}))::text;`), '{"hay_claure": false}'),
);

caso("la migración se puede volver a pegar: mismo cierre", () =>
  igual(
    psql(`begin;\n\\o /dev/null\n${PREVIAS}\n${MIGRACION}\n${MIGRACION}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${sesion(FELIPE)}\n${RESUMEN("e1")}\nrollback;`).split("\n").pop(),
    "140.97|40.00|168.00|0.00|25.63|1.40|40.00",
  ),
);

caso("si la función de producción no tiene el texto esperado, la migración aborta sin cambiar nada y dice cuál", () => {
  try {
    psql(
      `begin;\n\\o /dev/null\n${PREVIAS}\n` +
        // Se le saca a la función el texto que el reemplazo 3 espera: la migración no debe adivinar.
        `do $$ begin execute replace(pg_get_functiondef('retail.fn_claure_cierre(uuid)'::regprocedure), '- v_comision - v_pagado - v_gastos, 2)', '- v_pagado - v_comision - v_gastos, 2)'); end $$;\n${MIGRACION}\nrollback;`,
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
