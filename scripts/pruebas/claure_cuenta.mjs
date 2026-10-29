#!/usr/bin/env node
/**
 * Prueba de `20261029004000_cuenta_con_claure.sql` (ADR-0560, actividad 1): lo que CLAURE cobró en cuentas de CAYLA, que es lo que CAYLA le debe a
 * Claudia. Solo lee; el saldo no se guarda.
 *
 * Lo que importa: (1) la columna `cuentas_dinero.empresa_id` nace en CAYLA y `empresas.cuenta_corriente_desde` de CLAURE es el 2026-10-23;
 * (2) una venta con prendas de las dos empresas reparte cada pago en proporción al valor de las líneas; (3) el efectivo no entra; (4) tampoco
 * entra una venta anterior al arranque, anulada, de prueba, solo de CAYLA, ni lo que cae en una cuenta de CLAURE; (5) la cuenta de un pago es la
 * sellada o, si no hay, la que rige ese día; sin cuenta asignada se cuenta; (6) la comisión es la tarifa de la máquina (nula sin tarifa) y el IGV
 * sale incluido; (7) una devolución pagada desde una cuenta de CAYLA resta (en proporción a lo devuelto); en efectivo o pendiente no; (8) un
 * cambio con prendas de CLAURE se lista sin contar; (9) el saldo que sale de las filas; (10) quién puede leer; (11) la migración se aplica dos
 * veces. Cada caso corre en su transacción con la migración aplicada dentro y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:claure-cuenta   (necesita el stack local: `npx supabase start`, con las migraciones de ADR-0542 aplicadas)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261029004000_cuenta_con_claure.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo, sin el módulo Cuentas y dinero (seed)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

const sesion = (id) =>
  `set local request.jwt.claim.sub = '${id}';\nset local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';\nset local role authenticated;`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
// La sede se busca por su nombre («Tienda LIM» en producción, «Tienda Lima» en el seed). La base limpia del CI corre las migraciones ANTES de que
// el seed cree las sedes, así que cada transacción arma `empresa_sedes` (CLAURE solo en Lima), como en producción.
const LIMA = (() => {
  const id = psql(`select id from retail.ubicaciones where nombre in ('Tienda LIM', 'Tienda Lima') order by nombre limit 1;`);
  if (!id) throw new Error("La base local no tiene la sede Tienda LIM / Tienda Lima.");
  return `'${id}'`;
})();
const ESCENA_EMPRESAS = `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;`;

// Las ventas de la prueba. A = una prenda de CLAURE, B = una de CAYLA. Todo se escribe como postgres, sin disparadores (la prueba solo lee).
const V = (n) => `'00000000-0000-4000-8000-0000000000${n}'`; // venta n
const ESCENA_VENTAS = `
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b, va.producto_id as p_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
select id as izipay from retail.cuentas_dinero where nombre = 'Por depositar Izipay' \\gset
select id as interbank from retail.cuentas_dinero where nombre = 'Interbank' \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
update retail.productos set empresa_id = ${CAYLA} where id = :'p_b';
insert into retail.cuentas_dinero (id, nombre, tipo, cuenta_contable, empresa_id) values ('00000000-0000-4000-8000-0000000000c1', 'Yape de Claudia', 'banco', '104', ${CLAURE});
insert into retail.pos_maquinas (nombre, cuenta_id) select 'Izipay prueba', :'izipay' where not exists (select 1 from retail.pos_maquinas m where m.cuenta_id = :'izipay');
-- Tarifas y destinos de cobro en limpio (la base local trae los suyos): tarjeta con tarifa, QR sin tarifa y sin destino.
delete from retail.pos_tarifas where maquina_id in (select id from retail.pos_maquinas where cuenta_id = :'izipay');
delete from retail.medios_de_cobro where ubicacion_id = ${LIMA};
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde)
  select m.id, 'tarjeta', 2.38, true, 0, 0, date '2026-01-01' from retail.pos_maquinas m where m.cuenta_id = :'izipay';
insert into retail.medios_de_cobro (ubicacion_id, medio, cuenta_id, vigente_desde) values (${LIMA}, 'yape', :'interbank', date '2026-01-01');
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba) values
  (${V("a1")}, ${LIMA}, now(), 'completada', false),
  (${V("a2")}, ${LIMA}, now(), 'completada', false),
  (${V("a3")}, ${LIMA}, now(), 'completada', false),
  (${V("a4")}, ${LIMA}, now(), 'completada', false),
  (${V("a5")}, ${LIMA}, timestamptz '2026-10-20 12:00-05', 'completada', false),
  (${V("a6")}, ${LIMA}, now(), 'completada', false),
  (${V("a7")}, ${LIMA}, now(), 'completada', true),
  (${V("a8")}, ${LIMA}, now(), 'completada', false),
  (${V("a9")}, ${LIMA}, now(), 'completada', false),
  (${V("b0")}, ${LIMA}, now(), 'completada', false);
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba' where id = ${V("a6")};
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  ('00000000-0000-4000-8000-0000000001a1', ${V("a1")}, :'va_a', 1, 100, 10),
  ('00000000-0000-4000-8000-0000000001b1', ${V("a1")}, :'va_b', 1, 100, 10),
  ('00000000-0000-4000-8000-0000000001a2', ${V("a2")}, :'va_a', 1, 118, 10),
  (gen_random_uuid(), ${V("a3")}, :'va_b', 1, 100, 10),
  (gen_random_uuid(), ${V("a4")}, :'va_a', 1, 100, 10),
  (gen_random_uuid(), ${V("a5")}, :'va_a', 1, 100, 10),
  (gen_random_uuid(), ${V("a6")}, :'va_a', 1, 100, 10),
  (gen_random_uuid(), ${V("a7")}, :'va_a', 1, 100, 10),
  (gen_random_uuid(), ${V("a8")}, :'va_a', 1, 59, 10),
  (gen_random_uuid(), ${V("a9")}, :'va_a', 1, 100, 10),
  (gen_random_uuid(), ${V("b0")}, :'va_a', 1, 40, 10);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values
  (${V("a1")}, 'tarjeta', 100, :'izipay'),
  (${V("a1")}, 'efectivo', 100, null),
  (${V("a2")}, 'yape', 118, :'interbank'),
  (${V("a3")}, 'yape', 100, :'interbank'),
  (${V("a4")}, 'efectivo', 100, null),
  (${V("a5")}, 'yape', 100, :'interbank'),
  (${V("a6")}, 'yape', 100, :'interbank'),
  (${V("a7")}, 'yape', 100, :'interbank'),
  (${V("a8")}, 'yape', 59, null),
  (${V("a9")}, 'yape', 100, '00000000-0000-4000-8000-0000000000c1'),
  (${V("b0")}, 'qr', 40, null);
-- Devoluciones: (1) todo lo de la venta 2 (solo prenda de CLAURE) por Yape desde Interbank; (2) en efectivo; (3) pendiente; (4) de una prenda de CAYLA;
-- (5) las dos prendas de la venta 1 (mitad CLAURE) con 100 de reembolso por Yape: restan la mitad.
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, reembolso_cuenta_id, aprobado_en) values
  ('00000000-0000-4000-8000-0000000002d1', ${V("a2")}, ${LIMA}, 'prueba', 'aprobada', 118, 'yape', :'interbank', now()),
  ('00000000-0000-4000-8000-0000000002d2', ${V("a4")}, ${LIMA}, 'prueba', 'aprobada', 100, 'efectivo', null, now()),
  ('00000000-0000-4000-8000-0000000002d3', ${V("a8")}, ${LIMA}, 'prueba', 'pendiente', 59, 'yape', :'interbank', null),
  ('00000000-0000-4000-8000-0000000002d4', ${V("a3")}, ${LIMA}, 'prueba', 'aprobada', 100, 'yape', :'interbank', now()),
  ('00000000-0000-4000-8000-0000000002d5', ${V("a1")}, ${LIMA}, 'prueba', 'aprobada', 100, 'yape', :'interbank', now());
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion)
  select '00000000-0000-4000-8000-0000000002d1'::uuid, id, 1, 'vendible' from retail.venta_items where venta_id = ${V("a2")}
  union all select '00000000-0000-4000-8000-0000000002d2', id, 1, 'vendible' from retail.venta_items where venta_id = ${V("a4")}
  union all select '00000000-0000-4000-8000-0000000002d3', id, 1, 'vendible' from retail.venta_items where venta_id = ${V("a8")}
  union all select '00000000-0000-4000-8000-0000000002d4', id, 1, 'vendible' from retail.venta_items where venta_id = ${V("a3")}
  union all select '00000000-0000-4000-8000-0000000002d5', id, 1, 'vendible' from retail.venta_items where venta_id = ${V("a1")};
-- Un cambio de la prenda de CLAURE de la venta 1 por la de CAYLA, con 20 de diferencia por Yape.
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad, diferencia, metodo_pago_diferencia, cuenta_dinero_id, motivo, condicion)
  values ('00000000-0000-4000-8000-0000000001a1', ${LIMA}, :'va_b', 1, 20, 'yape', :'interbank', 'otro', 'vendible');
set local session_replication_role = origin;
`;

const dentro = (consulta, { escena = true, sesionDe = FELIPE, antes = "" } = {}) =>
  psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${ESCENA_EMPRESAS}\n${escena ? ESCENA_VENTAS : ""}\n\\o\n${antes}\n${sesionDe ? sesion(sesionDe) : ""}\n${consulta}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);

let fallas = 0;
function caso(nombre, fn) {
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 14).join("\n    ")}`);
  }
}

// Lo que devuelve la función, ordenado y con los números en dos decimales; «-» es nulo.
const FILAS = `select origen, medio, coalesce(cuenta_nombre, '(sin cuenta)'), n_pagos, monto::numeric(12,2), coalesce(igv::numeric(12,2)::text, '-'),
       coalesce(comision::numeric(12,2)::text, '-'), case when contado then 't' else 'f' end
  from retail.fn_claure_cuenta() order by origen, medio, cuenta_nombre nulls last;`;

caso("la cuenta de dinero nace de CAYLA y la cuenta corriente con CLAURE arranca el 23-oct", () =>
  igual(
    dentro(
      `select (select count(*) from retail.cuentas_dinero where empresa_id <> ${CAYLA}::uuid)::text || '|' ||
              (select cuenta_corriente_desde::text from retail.empresas where clave = 'claure') || '|' ||
              coalesce((select cuenta_corriente_desde::text from retail.empresas where clave = 'cayla'), 'nulo');`,
      { escena: false, sesionDe: null },
    ),
    "0|2026-10-23|nulo",
  ));

caso("las filas: venta mixta repartida, Yape sellado + inferido, QR sin cuenta, devoluciones que restan y un cambio sin contar", () =>
  igual(
    dentro(FILAS),
    [
      "cambio|yape|Interbank|1|20.00|-|-|f",
      "devolucion|yape|Interbank|2|-168.00|-25.63|0.00|t",
      "venta|qr|(sin cuenta)|1|40.00|6.10|-|t",
      "venta|tarjeta|Por depositar Izipay|1|50.00|7.63|1.40|t",
      "venta|yape|Interbank|2|177.00|27.00|0.00|t",
    ].join("\n"),
  ));

caso("el saldo que sale de las filas: lo cobrado menos lo devuelto menos la comisión estimada", () =>
  igual(
    dentro(
      `select (sum(monto) filter (where contado))::numeric(12,2) || '|' || (sum(coalesce(comision, 0)) filter (where contado))::numeric(12,2) ||
              '|' || (sum(monto - coalesce(comision, 0)) filter (where contado))::numeric(12,2) from retail.fn_claure_cuenta();`,
    ),
    "99.00|1.40|97.60",
  ));

caso("sin tarifa, la comisión del POS es nula (no se inventa) y el Yape no lleva comisión", () =>
  igual(
    dentro(
      `select origen || ' ' || medio || ' ' || coalesce(comision::numeric(12,2)::text, 'nula') from retail.fn_claure_cuenta() where origen = 'venta' order by medio;`,
      { antes: `set local session_replication_role = replica; delete from retail.pos_tarifas where maquina_id in (select id from retail.pos_maquinas m where m.cuenta_id = (select id from retail.cuentas_dinero where nombre = 'Por depositar Izipay'));` },
    ),
    "venta qr nula\nventa tarjeta nula\nventa yape 0.00",
  ));

caso("lo que cae en una cuenta de CLAURE no genera deuda, ni el efectivo, ni lo anterior al arranque, anulado, de prueba o solo de CAYLA", () =>
  igual(
    dentro(
      `select count(*) filter (where cuenta_nombre = 'Yape de Claudia' or medio = 'efectivo')::text || '|' ||
              (sum(monto) filter (where origen = 'venta'))::numeric(12,2) from retail.fn_claure_cuenta();`,
    ),
    "0|267.00",
  )); // 267 = 50 (la mitad de la tarjeta de la venta mixta) + 177 (Yape sellado 118 + inferido 59) + 40 (QR sin cuenta)

caso("si la cuenta cambia de dueño, su plata deja de ser de CAYLA (el saldo cambia hacia atrás, a propósito)", () =>
  igual(
    dentro(`select count(*) from retail.fn_claure_cuenta() where cuenta_nombre = 'Interbank' and origen = 'venta';`, {
      antes: `update retail.cuentas_dinero set empresa_id = ${CLAURE} where nombre = 'Interbank';`,
    }),
    "0",
  ));

caso("la fecha de arranque se lee por su función (el líder la ve; quien no tiene el módulo, no)", () => {
  const ok = igual(dentro(`select retail.fn_claure_cuenta_desde()::text;`, { escena: false }), "2026-10-23");
  if (ok) return ok;
  try {
    dentro(`select retail.fn_claure_cuenta_desde();`, { escena: false, sesionDe: MICAELA });
    return "Micaela (sin el módulo) pudo leer la fecha de arranque";
  } catch (e) {
    return String(e.stderr).includes("necesita el módulo Cuentas y dinero") ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

caso("quien no tiene el módulo Cuentas y dinero no la lee", () => {
  try {
    dentro(`select * from retail.fn_claure_cuenta();`, { sesionDe: MICAELA });
    return "Micaela (sin el módulo) pudo leer la cuenta con CLAURE";
  } catch (e) {
    return String(e.stderr).includes("necesita el módulo Cuentas y dinero") ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

caso("anon no ejecuta", () => {
  try {
    dentro(`select * from retail.fn_claure_cuenta();`, { sesionDe: null, antes: "set local role anon;" });
    return "anon pudo ejecutar fn_claure_cuenta";
  } catch (e) {
    return String(e.stderr).includes("permission denied") ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

caso("sin CLAURE activa o sin fecha de arranque no devuelve nada (y no falla)", () =>
  igual(
    dentro(`select count(*) from retail.fn_claure_cuenta();`, { antes: `update retail.empresas set cuenta_corriente_desde = null where clave = 'claure';` }),
    "0",
  ));

caso("la migración se puede volver a pegar: mismas filas", () =>
  igual(
    psql(`begin;\n\\o /dev/null\n${MIGRACION}\n${MIGRACION}\n${ESCENA_EMPRESAS}\n${ESCENA_VENTAS}\n\\o\n${sesion(FELIPE)}\nselect count(*) from retail.fn_claure_cuenta();\nrollback;`),
    "5",
  ));

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");
