#!/usr/bin/env node
/**
 * Prueba de `20261029020000_claure_fuera_de_las_cifras_de_cayla.sql` (ADR-0560, actividad 5): lo que se vende de CLAURE no es ingreso, costo ni
 * mercadería de CAYLA. El Diario lo reclasifica a lo que se le debe (479) y todo lo que lo lee (Estado de resultados, Resumen, Balance, Cierre) deja
 * de contarlo sin cambiar.
 *
 * Lo que importa: (1) cada asiento de la reclasificación cuadra solo; (2) una venta solo de CLAURE deja 7011 en cero y una mixta deja la parte de CAYLA;
 * (3) la 479 acumula la parte sin IGV de lo vendido de CLAURE y una anulación o una devolución la deshacen en su día; (4) el costo de CLAURE sale
 * de 691 y 201; (5) lo anterior al arranque, lo de otra sede y lo de CAYLA no se tocan; (6) el IGV (4011) y los cobros NO se tocan; (7) el Estado de
 * resultados ya no suma a CLAURE; (8) `fn_claure_ventas_en` dice lo vendido de CLAURE neto de anulaciones y devoluciones; (9) quien no ve Finanzas no
 * lo lee y `anon` no ejecuta; (10) el Flujo real cuenta el pago a CLAURE como salida; (11) las migraciones se pueden volver a pegar. Cada caso corre en
 * su transacción con las migraciones aplicadas dentro y TERMINA EN ROLLBACK.
 *
 * USO: pnpm pruebas:claure-fuera-de-las-cifras   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
// Las migraciones de CLAURE se repegan en orden: la cuenta con CLAURE (fecha de arranque), el pago (la cuenta 479 y el tipo de movimiento) y esta.
const MIGRACIONES = [
  "20261029004000_cuenta_con_claure.sql",
  "20261029011000_pagar_a_claure.sql",
  "20261029020000_claure_fuera_de_las_cifras_de_cayla.sql",
]
  .map(leer)
  .join("\n");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed)
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
// A = una prenda de CLAURE (costo 10), B = una de CAYLA (costo 10). Todas las ventas son de hoy en hora de Lima, salvo la 4 (antes del arranque).
//   S1 mixta: A 118 + B 118 · S2 solo CLAURE: A 177 (luego devuelta, desde Yape) · S3 solo CAYLA: B 100 · S4 CLAURE de antes del arranque: A 59
//   S5 CLAURE anulada hoy: A 100 · S6 CAYLA en Trujillo: B 100
const ESCENA = `
select va.id as va_a, va.producto_id as p_a from retail.variantes va order by va.id limit 1 \\gset
select va.id as va_b from retail.variantes va where va.producto_id <> :'p_a' order by va.id limit 1 \\gset
select id as interbank from retail.cuentas_dinero where nombre = 'Interbank' \\gset
select (now() at time zone 'America/Lima')::date as hoy \\gset
set local session_replication_role = replica;
update retail.productos set empresa_id = ${CLAURE} where id = :'p_a';
insert into retail.ventas (id, ubicacion_id, created_at, estado, es_prueba) values
  (${ID("a1")}, ${LIMA}, now() - interval '2 hours', 'completada', false),
  (${ID("a2")}, ${LIMA}, now() - interval '2 hours', 'completada', false),
  (${ID("a3")}, ${LIMA}, now() - interval '2 hours', 'completada', false),
  (${ID("a4")}, ${LIMA}, timestamptz '2026-10-20 12:00-05', 'completada', false),
  (${ID("a5")}, ${LIMA}, now() - interval '2 hours', 'completada', false),
  (${ID("a6")}, ${TRUJILLO}, now() - interval '2 hours', 'completada', false);
update retail.ventas set estado = 'anulada', anulado_en = now() - interval '1 hour', motivo_anulacion = 'prueba' where id = ${ID("a5")};
insert into retail.venta_items (id, venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values
  (${ID("b1")}, ${ID("a1")}, :'va_a', 1, 118, 10), (${ID("b2")}, ${ID("a1")}, :'va_b', 1, 118, 10),
  (${ID("b3")}, ${ID("a2")}, :'va_a', 1, 177, 10),
  (${ID("b4")}, ${ID("a3")}, :'va_b', 1, 100, 10),
  (${ID("b5")}, ${ID("a4")}, :'va_a', 1, 59, 10),
  (${ID("b6")}, ${ID("a5")}, :'va_a', 1, 100, 10),
  (${ID("b7")}, ${ID("a6")}, :'va_b', 1, 100, 10);
insert into retail.venta_pagos (venta_id, metodo, monto, cuenta_dinero_id) values
  (${ID("a1")}, 'tarjeta', 118, null), (${ID("a1")}, 'efectivo', 118, null),
  (${ID("a2")}, 'yape', 177, :'interbank'),
  (${ID("a3")}, 'yape', 100, :'interbank'),
  (${ID("a4")}, 'yape', 59, :'interbank'),
  (${ID("a5")}, 'yape', 100, :'interbank'),
  (${ID("a6")}, 'efectivo', 100, null);
insert into retail.devoluciones (id, venta_id, ubicacion_id, motivo, estado, reembolso_monto, reembolso_metodo, reembolso_cuenta_id, aprobado_en)
  values (${ID("d1")}, ${ID("a2")}, ${LIMA}, 'prueba', 'aprobada', 177, 'yape', :'interbank', now());
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (${ID("d1")}, ${ID("b3")}, 1, 'vendible');
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
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 14).join("\n    ")}`);
  }
}

// El Diario de hoy, de las ventas de la prueba.
const DIARIO = `(select a.* from retail.fn_asientos(:'hoy'::date, :'hoy'::date, null) a where a.origen_id::text like '00000000-0000-4000-8000-0000000000%')`;
// Lo neto de una cuenta en el Diario (haber − debe), de las ventas de la prueba.
const NETO = (cuenta, filtro = "true") => `select coalesce(sum(d.haber - d.debe), 0)::numeric(12,2) from ${DIARIO} d where d.cuenta = '${cuenta}' and ${filtro}`;

caso("cada asiento de la reclasificación cuadra solo (y también los de siempre)", () =>
  igual(
    dentro(`select count(*) from (select d.asiento from ${DIARIO} d group by d.asiento having round(sum(d.debe), 2) <> round(sum(d.haber), 2)) x;`),
    "0",
  ),
);

caso("lo vendido de CLAURE sale de los ingresos: una venta solo de CLAURE deja 7011 en cero; la mixta, la parte de CAYLA", () =>
  igual(
    dentro(
      `select (${NETO("7011", "d.origen_id = " + ID("a2") + "::uuid and d.regla <> 'devolucion' and d.regla <> 'claure_devolucion'")})::text || '|' ||
              (${NETO("7011", "d.origen_id = " + ID("a1") + "::uuid")})::text;`,
    ),
    // S2: 177 → base 150 al haber de la venta y 150 al debe de la reclasificación = 0. S1 (236): base 200 − la de CLAURE (118 → 100) = 100.
    "0.00|100.00",
  ),
);

caso("lo que se le debe a CLAURE (479) es la parte sin IGV de lo vendido, neto de anulaciones y devoluciones", () =>
  // S1 100 + S2 150 + S5 84.75 − S5 anulada 84.75 − devolución de S2 150 = 100.00. La S4 (antes del arranque) no entra.
  igual(dentro(`${NETO("479")};`), "100.00"),
);

caso("una anulación y una devolución dejan CAYLA donde estaba: 7011 de esas ventas, en cero", () =>
  igual(
    dentro(`select (${NETO("7011", "d.origen_id in (" + ID("a5") + "::uuid, " + ID("d1") + "::uuid)")})::text;`),
    "0.00",
  ),
);

caso("el costo de lo de CLAURE sale de 691 y de la mercadería: queda solo el de CAYLA", () =>
  // 691: costo de S1 (20) − el de CLAURE (10) = 10 al debe → neto −10.00; la devolución, anulación y venta de CLAURE netean a cero.
  igual(
    dentro(
      `select (${NETO("691", "d.origen_id in (" + ID("a1") + "::uuid, " + ID("a2") + "::uuid, " + ID("a5") + "::uuid, " + ID("d1") + "::uuid)")})::text || '|' ||
              (${NETO("201", "d.origen_id in (" + ID("a1") + "::uuid, " + ID("a2") + "::uuid, " + ID("a5") + "::uuid, " + ID("d1") + "::uuid)")})::text;`,
    ),
    "-10.00|10.00",
  ),
);

caso("el IGV (4011) y los cobros NO se tocan: la boleta sigue siendo de CAYLA", () =>
  igual(
    dentro(
      `select (select count(*) from ${DIARIO} d where d.cuenta = '4011' and d.regla like 'claure%')::text || '|' ||
              (select count(*) from ${DIARIO} d where d.regla like 'claure%' and d.cuenta not in ('7011', '479', '691', '201', '6951'))::text || '|' ||
              (${NETO("4011", "d.origen_id = " + ID("a2") + "::uuid and d.regla = 'venta'")})::text;`,
    ),
    "0|0|27.00",
  ),
);

caso("lo anterior al arranque, lo de otra sede y lo de CAYLA no se tocan", () =>
  igual(
    dentro(
      `select count(*) from ${DIARIO} d where d.regla like 'claure%' and d.origen_id in (${ID("a4")}::uuid, ${ID("a3")}::uuid, ${ID("a6")}::uuid);`,
    ),
    "0",
  ),
);

caso("el Estado de resultados ya no suma a CLAURE: Lima trae solo lo de CAYLA", () =>
  // Lima: S1 100 (la parte de CAYLA) + S3 84.75 = 184.75; Trujillo: 84.75. La suma de las filas coincide con el Diario.
  igual(
    dentro(
      `select (select ventas_netas from retail.fn_estado_resultados(:'hoy'::date, :'hoy'::date, null) where ubicacion_id = ${LIMA})::numeric(12,2)::text || '|' ||
              (select ventas_netas from retail.fn_estado_resultados(:'hoy'::date, :'hoy'::date, null) where ubicacion_id = ${TRUJILLO})::numeric(12,2)::text;`,
    ),
    "184.75|84.75",
  ),
);

caso("fn_claure_ventas_en: lo vendido de CLAURE, neto de anulaciones y devoluciones", () =>
  // Vendido 118 (S1) + 177 (S2) + 100 (S5) − 100 (anulada) − 177 (devuelta) = 118; IGV 18; base 100; costo 10.
  igual(
    dentro(`select ventas::numeric(12,2)::text || '|' || igv::numeric(12,2)::text || '|' || base::numeric(12,2)::text || '|' || costo::numeric(12,2)::text from retail.fn_claure_ventas_en(:'hoy'::date, :'hoy'::date);`),
    "118.00|18.00|100.00|10.00",
  ),
);

caso("fn_claure_ventas_en por sede: Trujillo no tiene nada de CLAURE", () =>
  igual(dentro(`select ventas::numeric(12,2)::text from retail.fn_claure_ventas_en(:'hoy'::date, :'hoy'::date, ${TRUJILLO});`), "0.00"),
);

caso("quien no ve Finanzas no lo lee y anon no ejecuta", () =>
  falla(`select * from retail.fn_claure_ventas_en(current_date, current_date);`, { sesionDe: MICAELA, texto: "necesita el módulo" }) ??
  (() => {
    try {
      dentro(`set local role anon;\nselect * from retail.fn_claure_ventas_en(current_date, current_date);`, { sesionDe: null });
      return "anon pudo ejecutar fn_claure_ventas_en";
    } catch (e) {
      return String(e.stderr).includes("permission denied") ? null : `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
    }
  })(),
);

caso("las funciones internas no las ejecuta nadie de afuera", () => {
  for (const f of ["fn_claure_ventas(current_date, current_date, true, null)", "fn_asientos_claure(current_date, current_date, true, null)"]) {
    try {
      dentro(`select * from retail.${f};`);
      return `${f} se pudo ejecutar con la sesión del líder`;
    } catch (e) {
      if (!String(e.stderr).includes("permission denied")) return `falló por otra razón: ${String(e.stderr).split("\n")[0]}`;
    }
  }
  return null;
});

caso("el Flujo real cuenta el pago a CLAURE como una salida", () =>
  igual(
    dentro(
      `select retail.registrar_movimiento_dinero('pago_claure', 40, :'interbank', null, :'hoy'::date, 'OP-1', 0, null, null, '00000000-0000-4000-8000-0000000000ab'::uuid);
       reset role;
       select categoria || ':' || monto::numeric(12,2) || ':' || retail.fn_flujo_lado(categoria) from retail.fn_flujo_lineas(:'hoy'::date, :'hoy'::date) where categoria = 'pago_claure';`,
    )
      .split("\n")
      .pop(),
    "pago_claure:-40.00:sale",
  ),
);

caso("las migraciones se pueden volver a pegar: mismo Diario", () =>
  igual(
    psql(`begin;\n\\o /dev/null\n${MIGRACIONES}\n${MIGRACIONES}\n${ESCENA_EMPRESAS}\n${ESCENA}\n\\o\n${sesion(FELIPE)}\n${NETO("479")};\nrollback;`).split("\n").pop(),
    "100.00",
  ),
);

if (fallas) {
  console.log(`\n${fallas} caso(s) fallaron.`);
  process.exit(1);
}
console.log("\nTodos los casos pasaron.");
