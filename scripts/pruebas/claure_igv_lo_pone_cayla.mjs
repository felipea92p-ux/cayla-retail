#!/usr/bin/env node
/**
 * Prueba de `20261115122000_claure_el_igv_lo_pone_cayla.sql` (ADR-0638, regla 5): el IGV de lo vendido de CLAURE ya no se le descuenta a Claudia;
 * lo pone CAYLA y, en el Diario, queda por acreditar en la 1673 hasta que CLAURE lo devuelva con sus facturas de compra.
 *
 * Lo que importa: (1) lo que se le debe es cobrado − devuelto − comisión − pagado (sin restar el IGV) en el aviso del cierre de caja y en la proyección,
 * y las dos dicen lo mismo; `hoy.igv` sigue saliendo, solo informa; (2) en el Diario, la 479 recibe lo cobrado CON IGV y la 1673 el IGV, en la venta, la
 * anulación y la devolución, y cada asiento cuadra solo (7011 + 1673 = 479); (3) el control: sin la migración, el cierre resta el IGV y la 479 va sin él
 * (la prueba no está ciega); (4) la migración se puede volver a pegar y, si una función de producción no tiene el texto esperado, aborta y dice cuál.
 *
 * Prueba el ESTADO FINAL de la base (en el CI, con todas las migraciones). Para el control, deshace dentro de la transacción los mismos reemplazos de la
 * migración (los lee del archivo: el texto viejo vuelve donde estaba el nuevo), que es exactamente como estaba producción antes de pegarla.
 * Cada caso corre en su transacción y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:claure-igv-lo-pone-cayla   (necesita el stack local con todas las migraciones)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAJERA_AUTH, escenaCajera } from "./_claure_cajera.mjs";
import { ELEGIR_A, ELEGIR_B } from "./_claure_prendas.mjs";
import { haceHoras } from "./_reloj_lima.mjs";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261115122000_claure_el_igv_lo_pone_cayla.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const LUCIA = CAJERA_AUTH; // cierra la caja de Tienda Lima y no es líder (la crea cada caso: `_claure_cajera.mjs`)
const CAYLA = "'ca71a000-0000-4000-8000-000000000001'";
const CLAURE = "'c1a07e00-0000-4000-8000-000000000002'";

// Los reemplazos de la migración, en orden: firma, texto viejo y texto nuevo. Deshacerlos (nuevo → viejo, del último al primero) deja las funciones
// como estaban en producción antes de pegarla.
const REEMPLAZOS = [...MIGRACION.matchAll(/select pg_temp\.reemplazar\('([^']+)',\n\$v\$([\s\S]*?)\$v\$,\n\$n\$([\s\S]*?)\$n\$,\n1\);/g)].map((m) => ({
  firma: m[1],
  viejo: m[2],
  nuevo: m[3],
}));
if (REEMPLAZOS.length !== 8) throw new Error(`La migración debería tener 8 reemplazos (5 del Diario, 2 del cierre, 1 de la proyección) y la prueba leyó ${REEMPLAZOS.length}: revisa el formato.`);
// ADR-0683 (20261121160000), posterior a esta migración: el Diario lee lo de todas las aliadas. Se devuelve a leer lo de CLAURE (sus envolturas dan lo
// mismo) antes de deshacer los reemplazos de esta, que esperan el texto con `fn_claure_ventas` / `fn_claure_cambios`.
const DESHACER_ALIADAS = `do $deshacer$ begin execute replace(replace(pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure),
  'retail.fn_aliadas_ventas(', 'retail.fn_claure_ventas('), 'retail.fn_aliadas_cambios(', 'retail.fn_claure_cambios('); end $deshacer$;`;
const DESHACER = DESHACER_ALIADAS + "\n" + [...REEMPLAZOS]
  .reverse()
  .map(
    (r) =>
      `do $deshacer$ begin execute replace(pg_get_functiondef('${r.firma}'::regprocedure), $n$${r.nuevo}$n$, $v$${r.viejo}$v$); end $deshacer$;`,
  )
  .join("\n");

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
const TRUJILLO = sede("'Tienda TRU', 'Tienda Trujillo'");
const ESCENA_EMPRESAS = `insert into retail.empresa_sedes (empresa_id, ubicacion_id) select ${CAYLA}, u.id from retail.ubicaciones u on conflict do nothing;
insert into retail.empresa_sedes (empresa_id, ubicacion_id) values (${CLAURE}, ${LIMA}) on conflict do nothing;` + escenaCajera(LIMA, FELIPE);

const ID = (n) => `'00000000-0000-4000-8000-0000000000${n}'`;
// La escena de la suite del IGV viejo (claure_igv.mjs). A = prenda de CLAURE, B = de CAYLA.
//   Hoy: a1 mixta (A 100 + B 100, pagada con tarjeta 100 + efectivo 100) y a2 de CLAURE (Yape 118) → cobrado en cuentas de CAYLA 168 (tarjeta 50, la
//   mitad que es de CLAURE, y Yape 118), IGV 7.63 + 18.00 = 25.63, comisión 1.40; pagado 40.
//   Ayer: a5 de CLAURE (Yape 59) → cobrado 59, IGV 9.00; pagado 10.
const ESCENA = `
${ELEGIR_A}
${ELEGIR_B}
select id as izipay from retail.cuentas_dinero where nombre = 'Por depositar Izipay' \\gset
select id as interbank from retail.cuentas_dinero where nombre = 'Interbank' \\gset
set local session_replication_role = replica;
-- Lo que otra prueba o el seed dejó no entra a estas cuentas: la prueba mide SOLO su escena. Todo termina en ROLLBACK.
update retail.ventas set es_prueba = true where not coalesce(es_prueba, false);
update retail.devoluciones set estado = 'rechazada' where estado = 'aprobada';
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
delete from retail.pos_tarifas where maquina_id in (select id from retail.pos_maquinas where cuenta_id = :'izipay');
delete from retail.medios_de_cobro where ubicacion_id = ${LIMA};
insert into retail.pos_maquinas (nombre, cuenta_id) select 'Izipay prueba', :'izipay' where not exists (select 1 from retail.pos_maquinas m where m.cuenta_id = :'izipay');
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde)
  select m.id, 'tarjeta', 2.38, true, 0, 0, date '2026-01-01' from retail.pos_maquinas m where m.cuenta_id = :'izipay';
insert into retail.cajas (id, ubicacion_id, estado, monto_apertura, abierta_en, cerrada_en) values
  (${ID("e1")}, ${LIMA}, 'cerrada', 100, ${haceHoras(3)}, now()),
  (${ID("e2")}, ${LIMA}, 'cerrada', 100, ${haceHoras(3, { diasAtras: 1 })}, now() - interval '1 day'),
  (${ID("e3")}, ${TRUJILLO}, 'cerrada', 100, ${haceHoras(3)}, now());
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba, caja_id) values
  (${ID("a1")}, ${LIMA}, ${haceHoras(2)}, 'completada', false, ${ID("e1")}),
  (${ID("a2")}, ${LIMA}, ${haceHoras(2)}, 'completada', false, ${ID("e1")}),
  (${ID("a3")}, ${LIMA}, ${haceHoras(2)}, 'completada', false, ${ID("e1")}),
  (${ID("a5")}, ${LIMA}, ${haceHoras(2, { diasAtras: 1 })}, 'completada', false, ${ID("e2")}),
  (${ID("a7")}, ${TRUJILLO}, ${haceHoras(2)}, 'completada', false, ${ID("e3")});
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
insert into retail.movimientos_dinero (tipo, fecha, cuenta_origen_id, monto, estado)
  values ('pago_claure', (now() at time zone 'America/Lima')::date, :'interbank', 40, 'vigente'),
         ('pago_claure', (now() at time zone 'America/Lima')::date - 1, :'interbank', 10, 'vigente');
set local session_replication_role = origin;
`;
// Una devolución aprobada hoy de a2 (Yape 118, reembolsada desde Interbank).
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
// La venta de ayer de CLAURE (a5, 59) se anula hoy.
const ANULACION = `
reset role;
set local session_replication_role = replica;
update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba de IGV' where id = ${ID("a5")};
set local session_replication_role = origin;
`;

const dentro = (consulta, { sesionDe = FELIPE, antes = "", sinMigracion = false } = {}) =>
  psql(
    `begin;\n\\o /dev/null\n${sinMigracion ? DESHACER : ""}\n${ESCENA_EMPRESAS}\n${ESCENA}\n${antes}\n\\o\n${sesionDe ? sesion(sesionDe) : ""}\n${consulta}\nrollback;`,
  )
    .split("\n")
    .pop();
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
// Saldo, saldo de antes, lo cobrado, lo devuelto, el IGV de hoy, la comisión y lo pagado, en una línea.
const RESUMEN = (caja) => `select (j->>'saldo') || '|' || (j->>'saldo_anterior') || '|' || (j->'hoy'->>'cobrado') || '|' || (j->'hoy'->>'devuelto') || '|' || (j->'hoy'->>'igv') || '|' || (j->'hoy'->>'comision') || '|' || (j->'hoy'->>'pagado')
  from (select retail.fn_claure_cierre(${ID(caja)}) as j) x;`;
// Lo que el Diario de hoy lleva a cada cuenta por las reclasificaciones de CLAURE (debe − haber), y cuántos asientos de CLAURE no cuadran.
const DIARIO = `reset role;
select (select count(*) from (select asiento from retail.fn_asientos(${HOY}, ${HOY}, null) where regla like 'claure%' group by asiento having round(sum(debe), 2) <> round(sum(haber), 2)) x) || '|' ||
       (select string_agg(cuenta || ':' || neto, ' ' order by cuenta) from (
          select cuenta, round(sum(debe - haber), 2) as neto from retail.fn_asientos(${HOY}, ${HOY}, null)
           where regla in ('claure_venta', 'claure_anulacion', 'claure_devolucion') and cuenta in ('479', '1673', '7011') group by cuenta) c);`;

console.log("— Lo que se le debe a Claudia —");

caso("el cierre de hoy ya no resta el IGV: 227 cobrado − 1.40 de comisión − 50 pagado = 175.60; antes de hoy, 59 − 10 = 49; el IGV de hoy solo informa", () =>
  igual(dentro(RESUMEN("e1")), "175.60|49.00|168.00|0.00|25.63|1.40|40.00"),
);

caso("una devolución resta lo devuelto con su IGV: 227 − 118 − 1.40 − 50 = 57.60", () =>
  igual(dentro(RESUMEN("e1"), { antes: DEVOLUCION }), "57.60|49.00|168.00|118.00|7.63|1.40|40.00"),
);

caso("quien cierra la caja de Lima y no es líder ve el mismo saldo", () =>
  igual(dentro(RESUMEN("e1"), { sesionDe: LUCIA }), "175.60|49.00|168.00|0.00|25.63|1.40|40.00"),
);

caso("la proyección dice lo mismo que el cierre: hoy 175.60 y ayer 49.00", () =>
  igual(dentro(`reset role;\nselect retail.fn_claure_saldo_a(${HOY}) || '|' || retail.fn_claure_saldo_a(${HOY} - 1);`), "175.60|49.00"),
);

caso("el saldo es exactamente cobrado − comisión − pagado de las filas que lee la pantalla CLAURE (la misma cuenta que `resumenClaure`)", () =>
  igual(
    dentro(
      `reset role;
       select round(sum(f.monto) - sum(coalesce(f.comision, 0)) - 50, 2) as base
         from retail.fn_claure_filas(array[${LIMA}::uuid]) f where f.contado and f.fecha <= ${HOY} \\gset
       ${sesion(FELIPE)}
       select (retail.fn_claure_cierre(${ID("e1")})->>'saldo')::numeric = :'base'::numeric;`,
      { antes: DEVOLUCION },
    ),
    "t",
  ),
);

console.log("— El Diario —");

caso("una venta lleva a la 479 lo cobrado con IGV (100 + 118 = 218) y a la 1673 el IGV (15.25 + 18.00); 7011 + 1673 = 479 y cada asiento cuadra", () =>
  igual(dentro(DIARIO), "0|1673:33.25 479:-218.00 7011:184.75"),
);

caso("una devolución lo deshace con su IGV: la 479 baja 118 y la 1673 baja 18", () =>
  igual(dentro(DIARIO, { antes: DEVOLUCION }), "0|1673:15.25 479:-100.00 7011:84.75"),
);

caso("una anulación también: la venta de ayer (59) anulada hoy baja la 479 en 59 y la 1673 en 9", () =>
  igual(dentro(DIARIO, { antes: ANULACION }), "0|1673:24.25 479:-159.00 7011:134.75"),
);

caso("la cuenta 1673 existe, es un activo y no es de resultados", () =>
  igual(dentro(`reset role;\nselect tipo || '|' || coalesce(seccion_resultados, '-') from retail.cuentas where codigo = '1673';`), "activo|-"),
);

console.log("— Control: sin la migración —");

caso("sin la migración el cierre restaba el IGV (140.97) y la 479 iba sin él (184.75), sin 1673: la prueba no está ciega", () =>
  igual(dentro(RESUMEN("e1"), { sinMigracion: true }), "140.97|40.00|168.00|0.00|25.63|1.40|40.00") ??
  igual(dentro(DIARIO, { sinMigracion: true }), "0|479:-184.75 7011:184.75"),
);

console.log("— Pegar —");

caso("se puede volver a pegar sobre sí misma y sobre el estado de antes: mismo cierre y mismo Diario", () =>
  igual(
    psql(
      `begin;\n\\o /dev/null\n${DESHACER}\n${MIGRACION}\n${MIGRACION}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${sesion(FELIPE)}\n${RESUMEN("e1")}\n${DIARIO}\nrollback;`,
    )
      .split("\n")
      .slice(-2)
      .join(" / "),
    "175.60|49.00|168.00|0.00|25.63|1.40|40.00 / 0|1673:33.25 479:-218.00 7011:184.75",
  ),
);

caso("si una función de producción no tiene el texto esperado, la migración aborta sin cambiar nada y dice cuál", () => {
  try {
    psql(
      `begin;\n\\o /dev/null\n${DESHACER}\n` +
        // Se le cambia a la proyección el texto que el reemplazo 4 espera: la migración no debe adivinar.
        `do $$ begin execute replace(pg_get_functiondef('retail.fn_claure_saldo_a(date)'::regprocedure), 'coalesce(f.igv, 0) - coalesce(f.comision, 0)', 'coalesce(f.comision, 0) - coalesce(f.igv, 0)'); end $$;\n${MIGRACION}\nrollback;`,
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
