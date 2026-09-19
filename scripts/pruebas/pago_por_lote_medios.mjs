#!/usr/bin/env node
/**
 * Pruebas de `registrar_pago_compras_medios` (pago por lote con VARIOS medios, ADR-0132) contra el
 * Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que un pago de varios comprobantes de un proveedor pueda repartirse en varios medios
 * (transferencia + efectivo…) sin perder lo que ya garantizaba `registrar_pago_compras`:
 *   · la cascada: los medios se gastan EN ORDEN entre los comprobantes (el primero consume el primer medio hasta
 *     agotarlo, luego el siguiente) y cada comprobante conserva su propio historial;
 *   · Σ medios = total − saldo a favor, al centavo; el saldo a favor entra por `p_credito`, nunca como medio;
 *   · todo o nada, un solo proveedor, tope por saldo, candado por comprobante, idempotencia por `p_token`;
 *   · que con UN solo medio escribe EXACTAMENTE lo mismo que la función de siempre (por eso la pantalla puede
 *     seguir llamando a la vieja en ese caso).
 *
 * CÓMO. Mismo patrón que `compras_faltantes_y_pago_por_lote.mjs` (léelo primero si esto no tiene sentido): cada
 * escenario corre en su propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el Postgres
 * local que comparten los worktrees. Simula a Felipe (líder) y a Micaela (integrante) con
 * `set local request.jwt.claim.sub`, hablando con Postgres directo vía `docker exec ... psql`.
 *
 * DATOS. Del seed solo lo estable (proveedores `Textiles Andina SAC` y `Confecciones del Sur EIRL`, ubicación
 * `Taller`, variante `BLU-EMMA-NEG-M`); los comprobantes (serie `TST`) se crean DENTRO de la transacción con la RPC
 * real `registrar_compra`. Factura estándar: 24 u × S/ 50 + IGV 18 % = S/ 1,416.00.
 *
 * USO
 *   pnpm pruebas:pago-por-lote-medios   → necesita el stack local (`npx supabase start`) con la migración
 *                                          `20260919190000_pago_por_lote_varios_medios.sql` aplicada
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const comoPersona = (authUserId, sql) => `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;

const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as prov2 from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

/** Comprobante a crédito con la RPC real: 24 u × S/ 50 + IGV = S/ 1,416.00, vence en 10 días. */
function compra(v, { prov = "prov1", lineas = [24], costo = 50 } = {}) {
  const items = lineas
    .map((c) => `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${c}, 'costo_unitario', ${costo})`)
    .join(", ");
  return `
select retail.registrar_compra(:'${prov}', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'taller',
  jsonb_build_array(${items}),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as ${v} \\gset
`;
}

/** Deja 236.00 de saldo a favor con `prov1`: factura AL CONTADO con 4 unidades que no llegaron y su nota de crédito. */
const CON_SALDO = `
select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'contado', :'taller',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 24, 'costo_unitario', 50)),
  p_fecha_emision => retail.fn_hoy_lima(),
  p_pago => jsonb_build_array(jsonb_build_object('monto', 1416.00, 'metodo', 'transferencia'))) as c0 \\gset
select (array_agg(id order by cantidad desc))[1] as c0_item from retail.compra_items where compra_id = :'c0' \\gset
select retail.recibir_compras(:'taller', jsonb_build_array(jsonb_build_object('compra_item_id', :'c0_item', 'variante_id', :'var', 'cantidad', 20))) as _lote \\gset
select retail.cerrar_linea_compra(:'c0_item', 4, 'no_llego') as _k0 \\gset
select retail.registrar_nota_credito_compra(:'c0', 'FC01-80', retail.fn_hoy_lima(), 236.00, 'faltante') as _n0 \\gset
`;

const aplic = (v, monto) => `jsonb_build_object('compra_id', :'${v}', 'monto', ${monto})`;
/** Un medio para `p_medios`. */
const medio = (metodo, monto, referencia = null) =>
  `jsonb_build_object('metodo', '${metodo}', 'monto', ${monto}${referencia ? `, 'referencia', '${referencia}'` : ""})`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// La cascada
// ===========================================================================

exito(
  "cascada: 2 comprobantes de 1,416 pagados con 2,000 por transferencia + 832 en efectivo → 3 filas, cada medio por su monto, ambos en 0",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1',
  jsonb_build_array(${aplic("c1", "1416.00")}, ${aplic("c2", "1416.00")}),
  jsonb_build_array(${medio("transferencia", "2000.00", "OP-1")}, ${medio("efectivo", "832.00")})) as g \\gset
select
  (select count(*) from retail.compra_pagos where pago_grupo_id = :'g'),
  (select sum(monto) from retail.compra_pagos where pago_grupo_id = :'g' and metodo = 'transferencia'),
  (select sum(monto) from retail.compra_pagos where pago_grupo_id = :'g' and metodo = 'efectivo'),
  (select count(*) from retail.compras where id in (:'c1', :'c2') and estado_pago = 'pagada' and saldo = 0),
  (select count(*) from retail.compra_pagos where compra_id = :'c1'),
  (select count(*) from retail.compra_pagos where compra_id = :'c2'),
  (select bool_and(referencia = 'OP-1') from retail.compra_pagos where pago_grupo_id = :'g' and metodo = 'transferencia'),
  (select bool_and(referencia is null) from retail.compra_pagos where pago_grupo_id = :'g' and metodo = 'efectivo');
rollback;
`
  ),
  ["3", "2000.00", "832.00", "2", "1", "2", "t", "t"]
);

exito(
  "cascada exacta: el primer medio cubre justo al primer comprobante y el segundo al segundo (sin filas de más)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1',
  jsonb_build_array(${aplic("c1", "1416.00")}, ${aplic("c2", "1416.00")}),
  jsonb_build_array(${medio("transferencia", "1416.00")}, ${medio("yape", "1416.00")})) as g \\gset
select
  (select count(*) from retail.compra_pagos where pago_grupo_id = :'g'),
  (select metodo from retail.compra_pagos where compra_id = :'c1'),
  (select metodo from retail.compra_pagos where compra_id = :'c2');
rollback;
`
  ),
  ["2", "transferencia", "yape"]
);

exito(
  "un comprobante partido en dos medios y con pago PARCIAL: 1,000 = 400 yape + 600 plin, queda parcial con saldo 416",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "1000.00")}),
  jsonb_build_array(${medio("yape", "400.00", "Y-1")}, ${medio("plin", "600.00", "P-1")})) as g \\gset
select
  (select count(*) from retail.compra_pagos where compra_id = :'c1'),
  (select monto from retail.compra_pagos where compra_id = :'c1' and metodo = 'yape'),
  (select monto from retail.compra_pagos where compra_id = :'c1' and metodo = 'plin'),
  (select saldo from retail.compras where id = :'c1'),
  (select estado_pago from retail.compras where id = :'c1');
rollback;
`
  ),
  ["2", "400.00", "600.00", "416.00", "parcial"]
);

exito(
  "la fecha del pago es la que se manda y, sin ella, hoy en Lima",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "100.00")}),
  jsonb_build_array(${medio("efectivo", "100.00")}), retail.fn_hoy_lima() - 1) as g1 \\gset
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c2", "100.00")}),
  jsonb_build_array(${medio("efectivo", "100.00")})) as g2 \\gset
select
  (select fecha = retail.fn_hoy_lima() - 1 from retail.compra_pagos where pago_grupo_id = :'g1'),
  (select fecha = retail.fn_hoy_lima() from retail.compra_pagos where pago_grupo_id = :'g2');
rollback;
`
  ),
  ["t", "t"]
);

// ===========================================================================
// Paridad con la función de siempre (un solo medio)
// ===========================================================================

exito(
  "con UN solo medio escribe EXACTAMENTE lo mismo que registrar_pago_compras (mismo medio, monto y referencia)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compras(:'prov1', 'yape', jsonb_build_array(${aplic("c1", "700.00")}), 'REF-7') as gv \\gset
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c2", "700.00")}), jsonb_build_array(${medio("yape", "700.00", "REF-7")})) as gn \\gset
select
  (select count(*) from retail.compra_pagos where pago_grupo_id = :'gv'),
  (select count(*) from retail.compra_pagos where pago_grupo_id = :'gn'),
  (select metodo || monto || coalesce(referencia, '') from retail.compra_pagos where pago_grupo_id = :'gv'),
  (select metodo || monto || coalesce(referencia, '') from retail.compra_pagos where pago_grupo_id = :'gn'),
  (select saldo from retail.compras where id = :'c1') = (select saldo from retail.compras where id = :'c2');
rollback;
`
  ),
  ["1", "1", "yape700.00REF-7", "yape700.00REF-7", "t"]
);

// ===========================================================================
// Saldo a favor
// ===========================================================================

exito(
  "con saldo a favor: 236 a favor + 1,000 transferencia + 180 efectivo pagan 1,416; el saldo a favor queda en 0",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c2", "1416.00")}),
  jsonb_build_array(${medio("transferencia", "1000.00")}, ${medio("efectivo", "180.00")}), null, null, 236.00) as g \\gset
select
  (select count(*) from retail.compra_pagos where pago_grupo_id = :'g'),
  (select monto from retail.compra_pagos where pago_grupo_id = :'g' and metodo = 'saldo_a_favor'),
  (select sum(monto) from retail.compra_pagos where pago_grupo_id = :'g' and metodo <> 'saldo_a_favor'),
  (select saldo from retail.compras where id = :'c2'),
  retail.fn_saldo_favor_proveedor(:'prov1');
rollback;
`
  ),
  ["3", "236.00", "1180.00", "0.00", "0.00"]
);

exito(
  "el saldo a favor cubre TODO el pago: sin medios (nulo) escribe solo la fila de saldo a favor",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c2", "236.00")}), null, null, null, 236.00) as g \\gset
select
  (select count(*) from retail.compra_pagos where pago_grupo_id = :'g'),
  (select metodo from retail.compra_pagos where pago_grupo_id = :'g'),
  (select saldo from retail.compras where id = :'c2'),
  retail.fn_saldo_favor_proveedor(:'prov1');
rollback;
`
  ),
  ["1", "saldo_a_favor", "1180.00", "0.00"]
);

error(
  "el saldo a favor cubre todo pero se mandan medios: se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c2", "236.00")}), jsonb_build_array(${medio("efectivo", "10.00")}), null, null, 236.00);
`
  ),
  "no lleva medios de pago"
);

error(
  "usar más saldo a favor del que hay (236 disponibles, se piden 300) se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c2", "1416.00")}), jsonb_build_array(${medio("efectivo", "1116.00")}), null, null, 300.00);
`
  ),
  "El saldo a favor con este proveedor es"
);

error(
  "el saldo a favor NO es un medio: mandarlo en p_medios se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c2", "236.00")}), jsonb_build_array(${medio("saldo_a_favor", "236.00")}));
`
  ),
  "Medio de pago no reconocido"
);

// ===========================================================================
// Las reglas de los medios
// ===========================================================================

error(
  "los medios deben sumar el total (2,000 + 800 ≠ 2,832): se rechaza y dice cuánto suman",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "1416.00")}, ${aplic("c2", "1416.00")}),
  jsonb_build_array(${medio("transferencia", "2000.00")}, ${medio("efectivo", "800.00")}));
`
  ),
  "suman S/ 2800.00 y hay que cubrir S/ 2832.00"
);

error(
  "sin medios y con total por cubrir se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "100.00")}), '[]'::jsonb);`),
  "necesita al menos un medio de pago"
);

error(
  "un medio que no existe se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "100.00")}), jsonb_build_array(${medio("bitcoin", "100.00")}));`),
  "Medio de pago no reconocido"
);

error(
  "un medio con monto 0 se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "100.00")}), jsonb_build_array(${medio("efectivo", "100.00")}, ${medio("yape", "0")}));`),
  "un monto mayor a cero"
);

error(
  "un medio con 3 decimales se rechaza",
  comoPersona(FELIPE, `${BASE}${compra("c1")}\nselect retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "100.00")}), jsonb_build_array(${medio("efectivo", "100.005")}));`),
  "máximo 2 decimales"
);

error(
  "más de 8 medios en un pago se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "9.00")}),
  (select jsonb_agg(jsonb_build_object('metodo', 'efectivo', 'monto', 1.00)) from generate_series(1, 9)));
`
  ),
  "máximo 8 medios"
);

exito(
  "hasta 8 medios sí se acepta y cada uno queda con su fila",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "8.00")}),
  (select jsonb_agg(jsonb_build_object('metodo', 'efectivo', 'monto', 1.00)) from generate_series(1, 8))) as g \\gset
select (select count(*) from retail.compra_pagos where pago_grupo_id = :'g'), (select saldo from retail.compras where id = :'c1');
rollback;
`
  ),
  ["8", "1408.00"]
);

// ===========================================================================
// Lo heredado de la función de siempre
// ===========================================================================

error(
  "mismo proveedor obligatorio: un comprobante de otro proveedor se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2", { prov: "prov2" })}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "100")}, ${aplic("c2", "100")}), jsonb_build_array(${medio("efectivo", "200.00")}));
`
  ),
  "comprobantes de un solo proveedor"
);

error(
  "monto mayor al saldo se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "100")}, ${aplic("c2", "1416.01")}), jsonb_build_array(${medio("efectivo", "1516.01")}));
`
  ),
  "supera su saldo pendiente"
);

exito(
  "todo o nada: tras un rechazo por saldo con varios medios, ningún comprobante quedó pagado",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
savepoint antes;
\\set ON_ERROR_STOP off
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "100")}, ${aplic("c2", "1416.01")}), jsonb_build_array(${medio("efectivo", "500.00")}, ${medio("yape", "1016.01")}));
\\set ON_ERROR_STOP on
rollback to savepoint antes;
select (select count(*) from retail.compra_pagos where compra_id in (:'c1', :'c2')), (select sum(pagado) from retail.compras where id in (:'c1', :'c2'));
rollback;
`
  ),
  ["0", "0.00"]
);

exito(
  "idempotencia por token: reintentar el mismo pago con varios medios devuelve el mismo grupo y no paga dos veces",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select gen_random_uuid() as tk \\gset
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "1416.00")}), jsonb_build_array(${medio("transferencia", "1000.00")}, ${medio("efectivo", "416.00")}), null, :'tk') as g1 \\gset
select retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "1416.00")}), jsonb_build_array(${medio("transferencia", "1000.00")}, ${medio("efectivo", "416.00")}), null, :'tk') as g2 \\gset
select (:'g1' = :'g2'), (:'g1' = :'tk'), (select count(*) from retail.compra_pagos where compra_id = :'c1'), (select pagado from retail.compras where id = :'c1');
rollback;
`
  ),
  ["t", "t", "2", "1416.00"]
);

error(
  "un integrante (Micaela) no puede registrar pagos a proveedores",
  comoPersona(MICAELA, `${BASE}${compra("c1")}\nselect retail.registrar_pago_compras_medios(:'prov1', jsonb_build_array(${aplic("c1", "100")}), jsonb_build_array(${medio("efectivo", "100.00")}));`),
  "No tienes permiso"
);

exito(
  "la función vieja NO cambió: sigue pagando con un medio y con saldo a favor",
  comoPersona(
    FELIPE,
    `${BASE}${CON_SALDO}${compra("c2")}
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(${aplic("c2", "1416.00")}), null, null, null, 236.00) as g \\gset
select (select count(*) from retail.compra_pagos where pago_grupo_id = :'g'), (select saldo from retail.compras where id = :'c2');
rollback;
`
  ),
  ["2", "0.00"]
);

// ===========================================================================
// Una sola firma (la lección de registrar_compra: una sobrecarga rompe la llamada)
// ===========================================================================

exito(
  "hay UNA sola firma de cada función de pago (sin sobrecargas)",
  `select proname, count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and proname in ('registrar_pago_compras', 'registrar_pago_compras_medios', 'registrar_pagos_compra') group by 1 having count(*) > 1
   union all select 'sin_repetidas', 0 order by 1;`,
  ["sin_repetidas", "0"]
);

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
      // La última línea de salida es la fila de verificación.
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
