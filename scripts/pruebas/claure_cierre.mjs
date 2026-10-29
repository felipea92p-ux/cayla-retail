#!/usr/bin/env node
/**
 * Prueba de `20261029013000_cierre_de_caja_con_claudia.sql` (ADR-0560, actividad 3): lo que el cierre de caja de Tienda LIM dice sobre CLAURE:
 * el saldo con Claudia al terminar el día, lo del día por medio y el efectivo de las ventas de la caja partido entre CAYLA y CLAURE. Solo lee.
 *
 * Lo que importa: (1) el saldo, lo del día y el saldo de antes (con lo ya pagado); (2) el efectivo de CAYLA + el de CLAURE es EXACTAMENTE
 * `ventas_efectivo` de `fn_calcular_esperado_caja`, y una venta anulada no cuenta; (3) una caja de otra sede (o de un día pasado) lee lo suyo;
 * (4) quien no puede cerrar esa caja no la lee; el líder puede pagar, quien solo cierra no; (5) `anon` no ejecuta; (6) la migración se puede volver
 * a pegar. Cada caso corre en su transacción con las migraciones aplicadas dentro y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:claure-cierre   (necesita el stack local: `npx supabase start`, con las migraciones de ADR-0542 y de la cuenta con CLAURE)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
// La cuenta con CLAURE (actividad 1) se repega antes: la función de esta actividad lee `fn_claure_filas`.
const MIGRACIONES = `${leer("20261029004000_cuenta_con_claure.sql")}\n${leer("20261029013000_cierre_de_caja_con_claudia.sql")}`;
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed)
const LUCIA = "22222222-2222-4222-8222-0000000000b1"; // cierra la caja de Tienda Lima y no es líder (seed)
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
// Tres cajas cerradas: la de hoy y la de ayer en Lima, y una de Trujillo. A = prenda de CLAURE, B = de CAYLA.
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
  (${ID("a4")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a6")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a5")}, ${LIMA}, now() - interval '1 day 2 hours', 'completada', false, ${ID("e2")}),
  (${ID("a7")}, ${TRUJILLO}, now() - interval '2 hours', 'completada', false, ${ID("e3")});
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba' where id = ${ID("a6")};
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("a1")}, :'va_a', 1, 100, 10), (${ID("a1")}, :'va_b', 1, 100, 10),
  (${ID("a2")}, :'va_a', 1, 118, 10),
  (${ID("a3")}, :'va_b', 1, 100, 10),
  (${ID("a4")}, :'va_a', 1, 100, 10),
  (${ID("a6")}, :'va_a', 1, 100, 10),
  (${ID("a5")}, :'va_a', 1, 59, 10),
  (${ID("a7")}, :'va_b', 1, 100, 10);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values
  (${ID("a1")}, 'tarjeta', 100, :'izipay'), (${ID("a1")}, 'efectivo', 100, null),
  (${ID("a2")}, 'yape', 118, :'interbank'),
  (${ID("a3")}, 'yape', 100, :'interbank'),
  (${ID("a4")}, 'efectivo', 100, null),
  (${ID("a6")}, 'efectivo', 100, null),
  (${ID("a5")}, 'yape', 59, :'interbank'),
  (${ID("a7")}, 'efectivo', 100, null);
-- Lo ya pagado a Claudia: S/ 40 hoy y S/ 10 ayer (a la hora de Lima).
insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, monto, estado)
  values ('pago_claure', (now() at time zone 'America/Lima')::date, :'interbank', 40, 'vigente'),
         ('pago_claure', (now() at time zone 'America/Lima')::date - 1, :'interbank', 10, 'vigente');
set local session_replication_role = origin;
`;

const dentro = (consulta, { sesionDe = FELIPE, antes = "" } = {}) =>
  psql(`begin;\n\\o /dev/null\n${MIGRACIONES}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${antes}\n${sesionDe ? sesion(sesionDe) : ""}\n${consulta}\nrollback;`);
const igual = (obtenido, esperado) => (obtenido === String(esperado) ? null : `se esperaba\n${esperado}\ny salió\n${obtenido}`);
const falla = (consulta, { texto, sesionDe = FELIPE } = {}) => {
  try {
    dentro(consulta, { sesionDe });
    return "no falló y debía fallar";
  } catch (e) {
    const err = String(e.stderr ?? e.message);
    return texto && !err.includes(texto) ? `falló por otra razón: ${err.split("\n")[0]}` : null;
  }
};

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

const CIERRE = (caja) => `select retail.fn_claure_cierre(${ID(caja)});`;
// Los campos de un cierre, en una línea, para compararlos.
const RESUMEN = (caja) => `select (j->>'hay_claure') || '|' || (j->>'saldo') || '|' || (j->>'saldo_anterior') || '|' || (j->'hoy'->>'cobrado') || '|' || (j->'hoy'->>'comision') || '|' || (j->'hoy'->>'pagado') || '|' || (j->'efectivo'->>'cayla') || '|' || (j->'efectivo'->>'claure') || '|' || (j->>'puede_pagar')
  from (select retail.fn_claure_cierre(${ID(caja)}) as j) x;`;

caso("el cierre de hoy: saldo, saldo de antes, lo del día, lo pagado y el efectivo partido", () =>
  // Cobrado hoy 168 (tarjeta 50 + Yape 118), comisión 1.40, pagado hoy 40; ayer entró 59 y se pagó 10 → saldo de antes 49.00;
  // saldo = 168 + 59 − 1.40 − 50 = 175.60. Efectivo: 200 en la caja = CAYLA 50 + CLAURE 150 (la mitad de la venta mixta y toda la de CLAURE).
  igual(dentro(RESUMEN("e1")), "true|175.60|49.00|168.00|1.40|40.00|50.00|150.00|true"),
);

caso("el efectivo de CAYLA + el de CLAURE es exactamente lo que espera la caja (y la venta anulada no cuenta)", () =>
  igual(
    dentro(
      `select ((j->'efectivo'->>'cayla')::numeric + (j->'efectivo'->>'claure')::numeric) = (select ventas_efectivo from retail.fn_esperado_caja(${ID("e1")}))
         from (select retail.fn_claure_cierre(${ID("e1")}) as j) x;`,
    ),
    "t",
  ),
);

caso("lo cobrado de hoy sale por medio, con su comisión", () =>
  igual(
    dentro(`select string_agg(m->>'medio' || ':' || (m->>'monto') || ':' || (m->>'comision'), ' ' order by m->>'medio') from retail.fn_claure_cierre(${ID("e1")}) j, jsonb_array_elements(j->'por_medio') m;`),
    "tarjeta:50.00:1.40 yape:118.00:0.00",
  ),
);

caso("una caja de ayer lee su día: el saldo es el de entonces, sin lo de hoy", () =>
  // Ayer: cobró 59 y se pagaron 10 ese día → saldo 49.00; antes de ese día, nada; lo de hoy (168 cobrado, 40 pagado) no entra.
  igual(dentro(RESUMEN("e2")), "true|49.00|0.00|59.00|0.00|10.00|0.00|0.00|true"),
);

caso("quien cierra la caja de Lima y no es líder ve lo mismo (aunque no tenga el módulo Finanzas), pero no puede pagar", () =>
  igual(dentro(RESUMEN("e1"), { sesionDe: LUCIA }), "true|175.60|49.00|168.00|1.40|40.00|50.00|150.00|false"),
);

caso("una caja de otra sede (donde CLAURE no opera) solo dice que no hay", () =>
  igual(dentro(`select (retail.fn_claure_cierre(${ID("e3")}))::text;`), '{"hay_claure": false}'),
);

caso("quien no puede cerrar esa caja no la lee", () => falla(CIERRE("e1"), { sesionDe: MICAELA, texto: "No tienes permiso sobre esa caja" }) ?? falla(CIERRE("e1"), { sesionDe: MICAELA }));

caso("una caja que no existe se dice", () =>
  falla(`select retail.fn_claure_cierre('00000000-0000-4000-8000-0000000000ff'::uuid);`, { texto: "no existe" }),
);

caso("anon no ejecuta", () => {
  try {
    dentro(`set local role anon;\n${CIERRE("e1")}`, { sesionDe: null });
    return "anon pudo ejecutar fn_claure_cierre";
  } catch (e) {
    return String(e.stderr).includes("permission denied") ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
  }
});

caso("las migraciones se pueden volver a pegar: mismo cierre", () =>
  igual(
    psql(`begin;\n\\o /dev/null\n${MIGRACIONES}\n${MIGRACIONES}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${sesion(FELIPE)}\n${RESUMEN("e1")}\nrollback;`).split("\n").pop(),
    "true|175.60|49.00|168.00|1.40|40.00|50.00|150.00|true",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");
