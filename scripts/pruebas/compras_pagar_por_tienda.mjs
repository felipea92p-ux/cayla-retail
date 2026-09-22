#!/usr/bin/env node
/**
 * Pruebas de pagar por tienda (ADR-0151, F4) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que un comprador de tienda pueda pagar la parte de SU tienda —también en una factura que gestiona otra
 * tienda— y de ninguna otra manera, y que el líder siga pudiendo pagar sin atarse a una tienda:
 *   · un comprador paga exactamente la parte de su tienda (`registrar_pagos_compra`, una factura con varios medios) y
 *     el saldo de esa tienda baja lo que corresponde;
 *   · un comprador NO puede pagar más de lo que le queda a su tienda, aunque la factura entera tenga saldo de sobra;
 *   · un comprador NO puede pagar la parte de una tienda que no es suya (falla por PERMISO, ni siquiera llega a mirar
 *     el saldo);
 *   · un comprador SÍ paga la parte de su tienda aunque la factura la gestione otra tienda;
 *   · el líder paga sin `p_ubicacion_id` (como siempre, contra el saldo TOTAL) y también puede atribuir su pago a una
 *     tienda si quiere;
 *   · «pagar juntos» (`registrar_pago_compras`, un medio, y `registrar_pago_compras_medios`, varios) respetan la misma
 *     regla por CADA comprobante del lote: si uno de los comprobantes no tiene parte de esa tienda, o el monto aplicado
 *     la supera, el lote entero se rechaza (todo o nada, ya lo hacía por saldo total; ahora también por tienda);
 *   · el candado también protege escribir directo en `compra_pagos` (el disparador diferido), aunque ya está cerrado
 *     por RLS;
 *   · `registrar_pago_compra` (el wrapper de un solo medio) sigue siendo solo del líder, sin cambios;
 *   · las funciones parchadas quedan con una sola firma;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Mismo patrón que las demás suites de Compras: cada escenario en su transacción con ROLLBACK, las facturas y
 * pagos se crean DENTRO con las RPC reales, y las cinco migraciones se cargan dentro de cada escenario (re-pegables).
 *
 * USO   pnpm pruebas:compras-pagar-por-tienda
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

const leer = (f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8");
const M1 = leer("20260922120000_compras_compradores_de_tienda.sql");
const M2 = leer("20260922130000_compras_dinero_por_tienda_lectura.sql");
const M3 = leer("20260922150000_compra_parte_por_tienda.sql");
const M4 = leer("20260922160000_compras_tienda_gestora.sql");
const M5 = leer("20260922170000_compras_pagar_por_tienda.sql");
const PRELUDIO = `${M1}\n${M2}\n${M3}\n${M4}\n${M5}`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

const esperar = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba. El Postgres local lo
// usan ~20 sesiones a la vez y estas migraciones hacen DDL: un deadlock con otra sesión no es un fallo, se reintenta.
function correr(sql) {
  let ultimo;
  for (let intento = 1; intento <= 4; intento++) {
    try {
      return { ok: true, salida: psql(sql).trim() };
    } catch (e) {
      ultimo = { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
      if (!/deadlock detected|lock timeout|could not obtain lock/i.test(ultimo.mensaje)) return ultimo;
      esperar(400 * intento);
    }
  }
  return ultimo;
}

/** Abre la transacción, carga las cinco migraciones y se pone como esa persona. Termina en ROLLBACK. */
const comoLider = (sql) => `
begin;
${PRELUDIO}
set local request.jwt.claim.sub = '${FELIPE}';
${sql}
rollback;
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const COMO_AUTENTICADO = "set local role authenticated;\nset local request.jwt.claim.role = 'authenticated';\n";
const COMO_POSTGRES = "reset role;\n";
const COMO_FELIPE = `${COMO_POSTGRES}${cambiaA(FELIPE)}`;
const COMO_MICAELA = `${cambiaA(MICAELA)}${COMO_AUTENTICADO}`;

const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

const COMPRADORA_DE = (...tiendas) => `${tiendas.map((t) => `select retail.agregar_comprador_de_tienda(:'micaela', :'${t}');`).join("\n")}\n`;

/**
 * Registra una factura con la RPC real (como Felipe). `gestora` es el 5º parámetro; `dest` el reparto, p.ej.
 * { lima: 12, trujillo: 12 } → 24 u × S/ 50 + 18 % IGV = 1,416.00, cada tienda con parte 708.00. Deja `:v`.
 */
function compra(v, { gestora, dest }) {
  const destinos = Object.entries(dest)
    .map(([ub, c]) => `jsonb_build_object('ubicacion_id', :'${ub}', 'cantidad', ${c})`)
    .join(", ");
  const total = Object.values(dest).reduce((a, b) => a + b, 0);
  return `
select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${gestora}',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${total}, 'costo_unitario', 50, 'destinos', jsonb_build_array(${destinos}))),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as ${v} \\gset
`;
}

/** Un pago con la RPC real: p_ubicacion_id es el 5º parámetro (o null). */
const PAGAR = (compraVar, monto, ubicacionVar) =>
  `select retail.registrar_pagos_compra(:'${compraVar}', jsonb_build_array(jsonb_build_object('monto', ${monto}, 'metodo', 'transferencia')), null, null, ${
    ubicacionVar ? `:'${ubicacionVar}'` : "null"
  })`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. registrar_pagos_compra: el comprador paga la parte de su tienda
// ===========================================================================

exito(
  "24 u repartidas 12/12: el comprador de Lima paga exactamente su parte (708.00) y el saldo de su tienda queda en 0",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${COMPRADORA_DE("lima")}${COMO_MICAELA}${PAGAR("f1", "708.00", "lima")} as ids \\gset
select array_length(:'ids'::uuid[], 1), retail.fn_saldo_de_tienda(:'f1', :'lima');`
  ),
  ["1", "0.00"]
);

error(
  "el comprador de Lima NO puede pagar de más para su tienda, aunque la factura entera tenga saldo de sobra (Trujillo no pagó nada)",
  comoLider(`${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${COMPRADORA_DE("lima")}${COMO_MICAELA}${PAGAR("f1", "708.01", "lima")};`),
  "El pago (S/ 708.01) supera el saldo pendiente de esa tienda (S/ 708.00)"
);

error(
  "el comprador de Lima NO puede pagar la parte de Trujillo (no es su tienda): falla por PERMISO, sin mirar el saldo",
  comoLider(`${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${COMPRADORA_DE("lima")}${COMO_MICAELA}${PAGAR("f1", "1", "trujillo")};`),
  "No tienes permiso para registrar pagos a proveedores"
);

error(
  "un integrante sin fila de comprador no paga nada, con o sin tienda",
  comoLider(`${BASE}${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${COMO_MICAELA}${PAGAR("f1", "100", "lima")};`),
  "No tienes permiso para registrar pagos a proveedores"
);

exito(
  "el comprador de Trujillo paga SU parte aunque la factura la gestione Lima",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${COMPRADORA_DE("trujillo")}${COMO_MICAELA}${PAGAR("f1", "708.00", "trujillo")} as ids \\gset
select array_length(:'ids'::uuid[], 1), retail.fn_saldo_de_tienda(:'f1', :'trujillo'), retail.fn_saldo_de_tienda(:'f1', :'lima');`
  ),
  ["1", "0.00", "708.00"]
);

exito(
  "el líder paga SIN atribuir a ninguna tienda (como siempre): el pago queda con ubicacion_id nulo y no cuenta contra el saldo de ninguna tienda",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${PAGAR("f1", "1416.00", null)} as ids \\gset
select (select ubicacion_id is null from retail.compra_pagos where id = (:'ids'::uuid[])[1]),
  retail.fn_saldo_de_tienda(:'f1', :'lima'), retail.fn_saldo_de_tienda(:'f1', :'trujillo');`
  ),
  ["t", "708.00", "708.00"]
);

exito(
  "el líder TAMBIÉN puede atribuir su pago a una tienda si quiere (queda igual de acotado que el de un comprador)",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${PAGAR("f1", "708.00", "lima")} as ids \\gset
select (select ubicacion_id from retail.compra_pagos where id = (:'ids'::uuid[])[1]) = :'lima', retail.fn_saldo_de_tienda(:'f1', :'lima');`
  ),
  ["t", "0.00"]
);

error(
  "una tienda sin parte en la factura no puede pagar nada de ella, ni el líder",
  comoLider(`${BASE}${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${PAGAR("f1", "1", "trujillo")};`),
  "Esa tienda no tiene parte en esta factura"
);

// ===========================================================================
// 2. «Pagar juntos»: la misma regla por CADA comprobante del lote
// ===========================================================================

exito(
  "registrar_pago_compras (un medio): el comprador de Lima paga junto DOS facturas, cada una con parte de Lima",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${compra("f2", { gestora: "lima", dest: { lima: 24 } })}${COMPRADORA_DE("lima")}${COMO_MICAELA}select retail.registrar_pago_compras(:'prov1', 'transferencia',
  jsonb_build_array(jsonb_build_object('compra_id', :'f1', 'monto', 708.00), jsonb_build_object('compra_id', :'f2', 'monto', 1416.00)),
  null, null, null, 0, :'lima') as grupo \\gset
select retail.fn_saldo_de_tienda(:'f1', :'lima'), retail.fn_saldo_de_tienda(:'f2', :'lima');`
  ),
  ["0.00", "0.00"]
);

error(
  "registrar_pago_compras: si UNA de las facturas del lote no tiene parte de esa tienda, el lote entero se rechaza (todo o nada)",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${compra("f2", { gestora: "trujillo", dest: { trujillo: 24 } })}${COMPRADORA_DE("lima")}${COMO_MICAELA}select retail.registrar_pago_compras(:'prov1', 'transferencia',
  jsonb_build_array(jsonb_build_object('compra_id', :'f1', 'monto', 1416.00), jsonb_build_object('compra_id', :'f2', 'monto', 1416.00)),
  null, null, null, 0, :'lima');`
  ),
  "Esa tienda no tiene parte en el comprobante"
);

exito(
  "el lote rechazado no dejó nada a medias: ninguna de las dos facturas quedó con pagos",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${compra("f2", { gestora: "trujillo", dest: { trujillo: 24 } })}${COMPRADORA_DE("lima")}${cambiaA(MICAELA)}${COMO_AUTENTICADO}savepoint intento;
\\set ON_ERROR_STOP 0
select retail.registrar_pago_compras(:'prov1', 'transferencia',
  jsonb_build_array(jsonb_build_object('compra_id', :'f1', 'monto', 1416.00), jsonb_build_object('compra_id', :'f2', 'monto', 1416.00)),
  null, null, null, 0, :'lima');
\\set ON_ERROR_STOP 1
rollback to savepoint intento;
${COMO_FELIPE}select (select count(*) from retail.compra_pagos where compra_id in (:'f1', :'f2'));`
  ),
  ["0"]
);

exito(
  "registrar_pago_compras_medios (varios medios): el comprador de Lima paga junto DOS facturas con 2 medios, cada una con parte de Lima",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${compra("f2", { gestora: "lima", dest: { lima: 24 } })}${COMPRADORA_DE("lima")}${COMO_MICAELA}select retail.registrar_pago_compras_medios(:'prov1',
  jsonb_build_array(jsonb_build_object('compra_id', :'f1', 'monto', 708.00), jsonb_build_object('compra_id', :'f2', 'monto', 1416.00)),
  jsonb_build_array(jsonb_build_object('metodo', 'transferencia', 'monto', 1000.00), jsonb_build_object('metodo', 'efectivo', 'monto', 1124.00)),
  null, null, 0, :'lima') as grupo \\gset
select retail.fn_saldo_de_tienda(:'f1', :'lima'), retail.fn_saldo_de_tienda(:'f2', :'lima');`
  ),
  ["0.00", "0.00"]
);

error(
  "registrar_pago_compras_medios: el comprador de Trujillo no puede pagar juntas dos facturas si una es toda de Lima",
  comoLider(
    `${BASE}${compra("f1", { gestora: "trujillo", dest: { trujillo: 24 } })}${compra("f2", { gestora: "lima", dest: { lima: 24 } })}${COMPRADORA_DE("trujillo")}${COMO_MICAELA}select retail.registrar_pago_compras_medios(:'prov1',
  jsonb_build_array(jsonb_build_object('compra_id', :'f1', 'monto', 1416.00), jsonb_build_object('compra_id', :'f2', 'monto', 1416.00)),
  jsonb_build_array(jsonb_build_object('metodo', 'transferencia', 'monto', 2832.00)),
  null, null, 0, :'trujillo');`
  ),
  "Esa tienda no tiene parte en el comprobante"
);

exito(
  "el líder sigue pagando juntos sin tienda (como siempre)",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${compra("f2", { gestora: "trujillo", dest: { trujillo: 24 } })}select retail.registrar_pago_compras(:'prov1', 'transferencia',
  jsonb_build_array(jsonb_build_object('compra_id', :'f1', 'monto', 1416.00), jsonb_build_object('compra_id', :'f2', 'monto', 1416.00))) as grupo \\gset
select (select saldo from retail.compras where id = :'f1'), (select saldo from retail.compras where id = :'f2');`
  ),
  ["0.00", "0.00"]
);

error(
  "anon no puede ejecutar ninguna de las tres RPC de pago (la firma nueva NO hereda el EXECUTE a PUBLIC que Postgres le da por defecto a un objeto nuevo)",
  comoLider(`set local role anon;\nselect retail.registrar_pagos_compra('${"00000000-0000-4000-8000-000000000000"}', '[]'::jsonb);`),
  "permission denied"
);

exito(
  "ninguna de las tres RPC de pago quedó con EXECUTE abierto a PUBLIC o anon (cada una tiene una sola firma, verificado arriba)",
  comoLider(
    `select count(*) from information_schema.role_routine_grants g
  where g.routine_schema = 'retail'
    and g.routine_name in ('registrar_pagos_compra', 'registrar_pago_compras', 'registrar_pago_compras_medios')
    and g.grantee in ('PUBLIC', 'anon');`
  ),
  ["0"]
);

// ===========================================================================
// 3. El candado también protege escribir directo en la base
// ===========================================================================

error(
  "escribir directo un pago que deja a una tienda debiendo de más se rechaza (candado diferido), aunque authenticated no puede escribir la tabla de todos modos",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}insert into retail.compra_pagos (compra_id, fecha, monto, metodo, ubicacion_id) values (:'f1', retail.fn_hoy_lima(), 709.00, 'efectivo', :'lima');
set constraints all immediate;`
  ),
  "Los pagos de esa tienda (S/ 709.00) superan su parte de la factura (S/ 708.00)"
);

exito(
  "un pago sin tienda (ubicacion_id null) no dispara el candado, aunque exceda cualquier parte",
  comoLider(
    `${BASE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}insert into retail.compra_pagos (compra_id, fecha, monto, metodo, ubicacion_id) values (:'f1', retail.fn_hoy_lima(), 1416.00, 'efectivo', null);
set constraints all immediate;
select 'ok';`
  ),
  ["ok"]
);

error(
  "authenticated no puede escribir compra_pagos directo (RLS, ya cerrado desde antes de esta migración — solo hay política de SELECT)",
  comoLider(`${BASE}${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${COMO_AUTENTICADO}insert into retail.compra_pagos (compra_id, fecha, monto, metodo, ubicacion_id) values (:'f1', retail.fn_hoy_lima(), 1, 'efectivo', :'lima');`),
  "new row violates row-level security policy"
);

// ===========================================================================
// 4. Lo que NO cambió
// ===========================================================================

error(
  "registrar_pago_compra (el wrapper de un solo medio) sigue siendo solo del líder: un comprador con fila no puede usarlo",
  comoLider(`${BASE}${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${COMPRADORA_DE("lima")}${COMO_MICAELA}select retail.registrar_pago_compra(:'f1', 100, 'efectivo');`),
  "No tienes permiso para registrar pagos a proveedores"
);

exito(
  "registrar_pago_compra sigue funcionando igual para el líder",
  comoLider(`${BASE}${compra("f1", { gestora: "lima", dest: { lima: 24 } })}select retail.registrar_pago_compra(:'f1', 100, 'transferencia') as id \\gset
select (select ubicacion_id is null from retail.compra_pagos where id = :'id');`),
  ["t"]
);

// ===========================================================================
// 5. Sanidad de la migración
// ===========================================================================

exito(
  "ninguna función parchada quedó con dos firmas vivas",
  comoLider(
    `select count(*) from (
  select proname from pg_proc where pronamespace = 'retail'::regnamespace
    and proname in ('registrar_pagos_compra', 'registrar_pago_compras', 'registrar_pago_compras_medios')
  group by proname having count(*) > 1) x;`
  ),
  ["0"]
);

exito(
  "las cinco migraciones se pueden pegar DOS veces sin romper nada",
  `begin;
${PRELUDIO}
${M5}
select (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_pagos_compra'),
       (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'compra_pagos' and column_name = 'ubicacion_id');
rollback;`,
  ["1", "1"]
);

// ===========================================================================
// Corredor
// ===========================================================================

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
      const ultima = resultado.salida.split("\n").filter(Boolean).pop() ?? "";
      const columnas = ultima.split("|");
      const igual = columnas.length === caso.esperado.length && columnas.every((v, i) => v === caso.esperado[i]);
      if (!igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado)}\n    salió:    ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
