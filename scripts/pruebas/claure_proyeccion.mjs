#!/usr/bin/env node
/**
 * Prueba de `20261029160000_claure_proyeccion_sin_su_plata.sql` (ADR-0560, actividad 16): «¿Me alcanza?» y la proyección de caja no cuentan la plata de Claudia. La proyección parte de lo que hay en
 * las cuentas MENOS lo que se le debe a Claudia (`fn_claure_saldo_a`, la misma cuenta que la pestaña CLAURE y el aviso del cierre) y lo dice en `de_claudia`.
 *
 * Lo que importa: (1) `fn_claure_saldo_a` suma lo cobrado − devuelto − IGV − comisión − pagado (un banco y el efectivo que se quedó con ella) − gastos suyos, a hoy y a una fecha pasada; (2) la proyección parte
 * de ese monto menos; (3) si a Claudia ya se le pagó de más, no se suma; (4) sin CLAURE todo da lo de antes; (5) la migración se puede volver a pegar y, con un texto distinto, aborta sin cambiar nada.
 * Cada caso corre en su transacción y TERMINA EN ROLLBACK. Parte del estado de ANTES de la migración (deshace sus reemplazos dentro de la transacción) y luego la aplica: sin ella, los casos fallan.
 *
 * USO: pnpm pruebas:claure-proyeccion   (necesita el stack local: `npx supabase start`, con las migraciones de ADR-0542 y de la cuenta con CLAURE)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlDeshacer } from "./_deshacer_claure.mjs";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const ARCHIVO = "20261029160000_claure_proyeccion_sin_su_plata.sql";
// La cuenta con CLAURE (A1 y A7), los gastos por empresa (A8) y el destino «claudia» del cierre (A11: su `check` ya está en la base).
// (013000 reescribe entera `fn_claure_cierre`: así el reemplazo de 044000 encuentra el texto que espera aunque la base ya tenga las migraciones posteriores.)
const PREVIAS = [
  leer("20261029004000_cuenta_con_claure.sql"),
  leer("20261029013000_cierre_de_caja_con_claudia.sql"),
  leer("20261029043000_claure_apartados_y_pedidos_web.sql"),
  leer("20261029044000_claure_gastos_por_empresa.sql"),
].join("\n");
const ANTES = sqlDeshacer(ARCHIVO, ["retail.fn_flujo_caja_proyeccion(integer)"], { reverso: true });
const MIGRACION = leer(ARCHIVO);
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

// La escena del IGV (actividad 10): hoy se cobró 168 en cuentas de CAYLA (IGV 25.63, comisión 1.40), ayer 59 (IGV 9.00); se le pagó 40 hoy y 10 ayer desde un banco.
// Más: 20 de efectivo que se quedaron con Claudia al cerrar la caja de hoy y un gasto de limpieza de 118 (100 % de CLAURE). Saldo a hoy: 227 − 34.63 − 1.40 − 50 − 20 − 118 = 2.97.
// `granGasto` agrega un alquiler de 1180 (50 % → 590): lo que se le debe pasa a negativo.
const escena = ({ granGasto = false, conClaure = true } = {}) => `
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
select id as izipay from retail.cuentas_dinero where nombre = 'Por depositar Izipay' \\gset
select id as interbank from retail.cuentas_dinero where nombre = 'Interbank' \\gset
select id as yo from public.personas where auth_user_id = '${FELIPE}' \\gset
reset role;
set local session_replication_role = replica;
-- Lo que otra prueba o el seed de la base dejó (ventas y devoluciones reales) no entra a estas cuentas: la prueba mide SOLO su escena. Va antes de crearla, y todo termina en ROLLBACK.
update retail.ventas set es_prueba = true where not coalesce(es_prueba, false);
update retail.devoluciones set estado = 'rechazada' where estado = 'aprobada';
${conClaure ? `update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';` : ""}
delete from retail.pos_tarifas where maquina_id in (select id from retail.pos_maquinas where cuenta_id = :'izipay');
insert into retail.pos_maquinas (nombre, cuenta_id) select 'Izipay prueba', :'izipay' where not exists (select 1 from retail.pos_maquinas m where m.cuenta_id = :'izipay');
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde)
  select m.id, 'tarjeta', 2.38, true, 0, 0, date '2026-01-01' from retail.pos_maquinas m where m.cuenta_id = :'izipay';
insert into retail.cajas (id, ubicacion_id, estado, monto_apertura, abierta_en, cerrada_en) values
  (${ID("e1")}, ${LIMA}, 'cerrada', 100, now() - interval '3 hours', now() - interval '2 hours'),
  (${ID("e2")}, ${LIMA}, 'cerrada', 100, now() - interval '1 day 3 hours', now() - interval '1 day');
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, caja_id) values
  (${ID("a1")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a2")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a3")}, ${LIMA}, now() - interval '2 hours', 'completada', false, ${ID("e1")}),
  (${ID("a5")}, ${LIMA}, now() - interval '1 day 2 hours', 'completada', false, ${ID("e2")});
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("a1")}, :'va_a', 1, 100, 10), (${ID("a1")}, :'va_b', 1, 100, 10), (${ID("a2")}, :'va_a', 1, 118, 10), (${ID("a3")}, :'va_b', 1, 100, 10), (${ID("a5")}, :'va_a', 1, 59, 10);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values
  (${ID("a1")}, 'tarjeta', 100, :'izipay'), (${ID("a1")}, 'efectivo', 100, null), (${ID("a2")}, 'yape', 118, :'interbank'), (${ID("a3")}, 'yape', 100, :'interbank'), (${ID("a5")}, 'yape', 59, :'interbank');
insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, monto, estado)
  values ('pago_claure', (now() at time zone 'America/Lima')::date, :'interbank', 40, 'vigente'),
         ('pago_claure', (now() at time zone 'America/Lima')::date - 1, :'interbank', 10, 'vigente');
insert into retail.caja_traslados (caja_id, destino, monto, registrado_por, creado_en) values (${ID("e1")}, 'claudia', 20, :'yo', now() - interval '1 hour');
insert into retail.gastos (id, ubicacion_id, categoria, descripcion, fecha, monto_total, igv, medio_pago, estado, registrado_por) values
  (${ID("c1")}, ${LIMA}, 'limpieza', 'Lejía', (now() at time zone 'America/Lima')::date, 118, 0, 'transferencia', 'vigente', :'yo')${granGasto ? `,
  (${ID("c2")}, ${LIMA}, 'alquileres', 'Alquiler', (now() at time zone 'America/Lima')::date, 1180, 0, 'transferencia', 'vigente', :'yo')` : ""};
set local session_replication_role = origin;
`;

const medir = (consulta, { sinMigracion = false, ...opciones } = {}) =>
  psql(`begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n${sinMigracion ? "" : MIGRACION}\n${ESCENA_EMPRESAS}\n${escena(opciones)}\n\\o\n${consulta}\nrollback;`).split("\n").pop();
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
const SALDO = (corte) => `reset role;\nselect retail.fn_claure_saldo_a(${corte});`;
const PROYECCION = `${sesion(FELIPE)}\nselect (j->>'saldo_hoy')::numeric || '|' || coalesce(j->>'de_claudia', 'sin') from (select retail.fn_flujo_caja_proyeccion(6) as j) x;`;

caso("lo que se le debe a hoy: 227 cobrado − 34.63 de IGV − 1.40 de comisión − 50 pagados − 20 de efectivo que se quedó con ella − 118 de gastos suyos = 2.97", () =>
  igual(medir(SALDO(HOY)), "2.97"),
);

caso("a una fecha pasada (ayer): 59 cobrado − 9.00 de IGV − 10 pagados = 40.00", () => igual(medir(SALDO(`${HOY} - 1`)), "40.00"));

caso("la proyección parte de lo que hay menos lo de Claudia (2.97) y lo dice; sin la migración no restaba nada", () => {
  const con = medir(PROYECCION).split("|");
  const sin = medir(PROYECCION, { sinMigracion: true }).split("|");
  return igual(`${con[1]}|${Math.round((Number(sin[0]) - Number(con[0])) * 100) / 100}|${sin[1]}`, "2.97|2.97|sin");
});

caso("si a Claudia ya se le pagó de más (lo que se le debe es negativo), no se suma a lo disponible", () => {
  const con = medir(PROYECCION, { granGasto: true }).split("|");
  const sin = medir(PROYECCION, { granGasto: true, sinMigracion: true }).split("|");
  return igual(`${con[1]}|${Math.round((Number(sin[0]) - Number(con[0])) * 100) / 100}`, "0|0");
});

caso("sin prendas de CLAURE (nada que se le deba, solo pagos y gastos) la proyección es la de antes: no resta nada", () => {
  const con = medir(PROYECCION, { conClaure: false }).split("|");
  const sin = medir(PROYECCION, { conClaure: false, sinMigracion: true }).split("|");
  return igual(`${con[0] === sin[0]}|${con[1]}`, "true|0");
});

caso("la migración se puede volver a pegar: misma proyección", () =>
  igual(
    psql(`begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n${MIGRACION}\n${MIGRACION}\n${ESCENA_EMPRESAS}\n${escena()}\n\\o\n${PROYECCION}\nrollback;`).split("\n").pop().split("|")[1],
    "2.97",
  ),
);

caso("si la función de producción no tiene el texto esperado, la migración aborta sin cambiar nada y dice cuál", () => {
  try {
    psql(
      `begin;\n\\o /dev/null\n${PREVIAS}\n${ANTES}\n` +
        `do $$ begin execute replace(pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure), 'v_saldo := retail.fn_flujo_disponible(v_hoy);', 'v_saldo := retail.fn_flujo_disponible(v_hoy) + 0;'); end $$;\n${MIGRACION}\nrollback;`,
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
