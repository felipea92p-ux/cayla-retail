#!/usr/bin/env node
/**
 * Pruebas de «Por pagar muestra la parte de MI tienda» (ADR-0187) contra el Postgres local, pasadas a «el módulo es la llave»
 * (ADR-0387, Felipe 2026-10-12: quien tiene un módulo de plata de Compras ve la deuda de la EMPRESA, todas las tiendas, como
 * el líder). El nombre del archivo se queda (lo llaman el CI y `package.json`); cada caso que se invirtió lo dice en su nombre.
 *
 * EL CASO (Felipe, 2026-09-23; deshecho en Compras el 2026-10-12): una factura repartida mitad Trujillo, mitad Lima. Antes, en
 * Por pagar Trujillo veía SU mitad y Lima la suya; hoy quien tiene Por pagar ve la factura entera, gestione quien la gestione,
 * igual que el líder. Lo que le queda a la parte de cada tienda (`fn_saldo_de_tienda`, que no cambió) sigue bajando solo con
 * los pagos hechos desde esa tienda.
 *
 * QUÉ PRUEBA
 *   · `fn_deuda_visible`: con Por pagar, la factura entera y gestionada (`gestionada` = t), la gestione su tienda u otra, y aunque
 *     no traiga nada para su tienda; el líder, igual; sin módulo, nada; al pagar su mitad desde Trujillo, la factura sigue en la
 *     deuda (la mitad de Lima) para ella y para el líder, y la parte de Trujillo queda en cero;
 *   · las cifras (`resumen_compras`, `deuda_por_vencimiento`, `salidas_caja_30d`, `resumen_compras_extra`, `fn_proveedores`,
 *     `por_pagar_tramos`) suben el total de las facturas, para ella como para el líder; la concentración es la de la empresa;
 *   · una sola firma y nada abierto a anon; el candado de dinero intacto.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. Las cifras se comparan ANTES y DESPUÉS de registrar las facturas de
 * prueba (la base local tiene datos de otras sesiones). 24 u a S/ 50 + 18 % = 1,416.00; 12/12 → 708.00 cada tienda.
 *
 * USO   pnpm pruebas:por-pagar-parte-de-mi-tienda
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

const esperar = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// No lanza: un escenario que DEBE fallar es el resultado que se prueba. Un deadlock con otra sesión se reintenta.
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

const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const COMO_POSTGRES = "reset role;\n";
const COMO_FELIPE = `${COMO_POSTGRES}${cambiaA(FELIPE)}`;
const COMO_MICAELA = `${COMO_POSTGRES}${cambiaA(MICAELA)}set local role authenticated;\nset local request.jwt.claim.role = 'authenticated';\n`;

/** Le da (dentro de la transacción) esos módulos al rol «integrante», que es el de Micaela. */
const MODULOS = (...claves) =>
  `${COMO_POSTGRES}delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo in ('facturas_compra', 'por_pagar', 'notas_credito');
${claves.length ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('integrante'), m from unnest(array[${claves.map((c) => `'${c}'`).join(", ")}]) m;` : ""}
`;

const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

/** Abre la transacción como Felipe (líder), con los ids a mano. Termina en ROLLBACK. */
const escenario = (sql) => `begin;\n${COMO_FELIPE}${BASE}${sql}\nrollback;\n`;

/**
 * Registra una factura con la RPC real, como quien esté puesto. `gestora` va en el 5º parámetro; `dest` el reparto. 24 u a
 * S/ 50 + 18 % = 1,416.00; con 12/12 cada tienda debe 708.00. Deja `:v`.
 */
function compra(v, { gestora, dest, pago = null }) {
  const destinos = Object.entries(dest).map(([ub, c]) => `jsonb_build_object('ubicacion_id', :'${ub}', 'cantidad', ${c})`).join(", ");
  const total = Object.values(dest).reduce((a, b) => a + b, 0);
  return `
select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), ${pago ? "'contado'" : "'credito'"}, :'${gestora}',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${total}, 'costo_unitario', 50, 'destinos', jsonb_build_array(${destinos}))),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => ${pago ? "null" : "retail.fn_hoy_lima() + 10"}, p_igv_porcentaje => 18${pago ? `, p_pago => ${pago}` : ""}) as ${v} \\gset
`;
}

const PAGAR = (compraVar, monto, ubicacion) =>
  `select retail.registrar_pagos_compra(:'${compraVar}', jsonb_build_array(jsonb_build_object('monto', ${monto}, 'metodo', 'transferencia')), null, null, ${
    ubicacion ? `:'${ubicacion}'` : "null"
  })`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });


// Las cifras de Por pagar de quien esté puesto, en una línea: deuda|con saldo|vencido-por-vencimiento|salidas 30 d|concentración base|proveedor|tramos
const CIFRAS = (sufijo) => `
select (select deuda from retail.resumen_compras()) as deuda_${sufijo},
       (select con_saldo from retail.resumen_compras()) as con_saldo_${sufijo},
       (select sum(monto) from retail.deuda_por_vencimiento()) as venc_${sufijo},
       (select sum(monto) from retail.salidas_caja_30d()) as caja_${sufijo},
       (select coalesce(saldo, 0) from retail.fn_proveedores() where id = :'prov1') as prov_${sufijo},
       (select sum(saldo) from retail.por_pagar_tramos()) as tramos_${sufijo} \\gset
`;
const DIFERENCIA = `select :deuda_d - :deuda_a, :con_saldo_d - :con_saldo_a, :venc_d - :venc_a, :caja_d - :caja_a, :prov_d - :prov_a, :tramos_d - :tramos_a;`;

// ===================================================================== 1. cuánto debo en cada comprobante
exito(
  "ADR-0387 (Felipe 2026-10-12): con Por pagar, la gestora (Trujillo) ve la factura ENTERA, como el líder (antes: solo su mitad, 708.00)",
  escenario(`${compra("f1", { gestora: "trujillo", dest: { trujillo: 12, lima: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}
select total, pagado, saldo, gestionada from retail.fn_deuda_visible(array[:'f1']::uuid[]);`),
  ["1416.00|0.00|1416.00|t"]
);
exito(
  "ADR-0387 (Felipe 2026-10-12): la factura que gestiona Lima, Trujillo también la ve entera y gestionada; ya no va a «Mis partes» (antes: su mitad, no gestionada)",
  escenario(`${compra("f1", { gestora: "lima", dest: { trujillo: 12, lima: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}
select total, saldo, gestionada from retail.fn_deuda_visible(array[:'f1']::uuid[]);
select count(*) from retail.fn_mis_partes_de_compras() where compra_id = :'f1';`),
  ["1416.00|1416.00|t", "0"]
);
exito(
  "el líder ve la factura entera",
  escenario(`${compra("f1", { gestora: "trujillo", dest: { trujillo: 12, lima: 12 } })}
select total, saldo, gestionada from retail.fn_deuda_visible(array[:'f1']::uuid[]);`),
  ["1416.00|1416.00|t"]
);
exito(
  "ADR-0387 (Felipe 2026-10-12): una factura que no trae nada para Trujillo también aparece en su deuda, entera: la deuda es de la empresa (antes: no aparecía)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${MODULOS("por_pagar")}${COMO_MICAELA}
select total, saldo, gestionada from retail.fn_deuda_visible(array[:'f1']::uuid[]);`),
  ["1416.00|1416.00|t"]
);
exito(
  "sin módulo de Compras no ve ninguna deuda",
  escenario(`${compra("f1", { gestora: "trujillo", dest: { trujillo: 12, lima: 12 } })}${MODULOS()}${COMO_MICAELA}
select count(*) from retail.fn_deuda_visible();`),
  ["0"]
);
exito(
  "ADR-0387 (Felipe 2026-10-12): Trujillo paga su mitad desde Trujillo: la factura sigue en su deuda con la mitad de Lima (708.00), igual que la ve el líder, y la parte de Trujillo queda en 0.00 (antes: salía de SU deuda)",
  escenario(`${compra("f1", { gestora: "trujillo", dest: { trujillo: 12, lima: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}
${PAGAR("f1", "708.00", "trujillo")} as _p \\gset
select saldo, gestionada from retail.fn_deuda_visible(array[:'f1']::uuid[]);
${COMO_FELIPE}select saldo, retail.fn_saldo_de_tienda(:'f1', :'trujillo'), retail.fn_saldo_de_tienda(:'f1', :'lima') from retail.fn_deuda_visible(array[:'f1']::uuid[]);`),
  ["708.00|t", "708.00|0.00|708.00"]
);
exito(
  "ADR-0387 (Felipe 2026-10-12): un pago parcial desde Trujillo baja la factura entera que ve (1,416.00 → 1,216.00) y, por tienda, solo la parte de Trujillo (508.00; Lima sigue en 708.00) (antes: veía solo su parte, 708.00 → 508.00)",
  escenario(`${compra("f1", { gestora: "trujillo", dest: { trujillo: 12, lima: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}
${PAGAR("f1", "200.00", "trujillo")} as _p \\gset
select total, pagado, saldo from retail.fn_deuda_visible(array[:'f1']::uuid[]);
${COMO_FELIPE}select retail.fn_saldo_de_tienda(:'f1', :'trujillo'), retail.fn_saldo_de_tienda(:'f1', :'lima');`),
  ["1416.00|200.00|1216.00", "508.00|708.00"]
);

// ===================================================================== 2. las cifras
exito(
  "ADR-0387 (Felipe 2026-10-12): Trujillo (gestora de una, con parte en otra de Lima), con Por pagar: las cifras y los subtotales de la lista suben las dos facturas enteras (2,832.00), igual que para el líder (antes: su parte de las dos, 1,416.00, y en la lista solo la que gestiona, 708.00)",
  escenario(`${MODULOS("por_pagar")}${COMO_MICAELA}${CIFRAS("a")}
${COMO_FELIPE}${compra("f1", { gestora: "trujillo", dest: { trujillo: 12, lima: 12 } })}${compra("f2", { gestora: "lima", dest: { trujillo: 12, lima: 12 } })}
${COMO_MICAELA}${CIFRAS("d")}${DIFERENCIA}`),
  ["2832.00|2|2832.00|2832.00|2832.00|2832.00"]
);
exito(
  "el líder: las mismas dos facturas suben el total entero, como siempre",
  escenario(`${CIFRAS("a")}
${compra("f1", { gestora: "trujillo", dest: { trujillo: 12, lima: 12 } })}${compra("f2", { gestora: "lima", dest: { trujillo: 12, lima: 12 } })}
${CIFRAS("d")}${DIFERENCIA}`),
  ["2832.00|2|2832.00|2832.00|2832.00|2832.00"]
);
exito(
  "ADR-0387 (Felipe 2026-10-12): la concentración de Trujillo sale de la deuda que ve —la de la EMPRESA, con la factura que gestiona Lima entera— y es la misma que ve el líder (antes: de SU deuda, con su parte de la de Lima)",
  escenario(`${compra("f1", { gestora: "trujillo", dest: { trujillo: 12, lima: 12 } })}${compra("f2", { gestora: "lima", dest: { trujillo: 12, lima: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}
select top_proveedor_id as top, top_proveedor_pct as pct from retail.resumen_compras_extra() \\gset
-- La cuenta se rehace con la misma deuda de Micaela y leyendo \`compras\` CON su RLS: desde ADR-0387 ve también la factura de Lima.
select :pct = round(100 * (select sum(v.saldo) from retail.fn_deuda_visible() v join retail.compras c on c.id = v.compra_id where c.proveedor_id = :'top')
                    / (select sum(saldo) from retail.fn_deuda_visible()), 1);
${COMO_FELIPE}select top_proveedor_id = :'top', top_proveedor_pct = :pct from retail.resumen_compras_extra();`),
  ["t", "t|t"]
);

// ===================================================================== 3. firmas y permisos
exito(
  "una sola firma por función tocada y fn_deuda_visible cerrada a anon",
  `select (select count(*) = count(distinct proname) from pg_proc where pronamespace = 'retail'::regnamespace
            and proname in ('fn_deuda_visible', 'resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos', 'fn_proveedores')),
          has_function_privilege('anon', 'retail.fn_deuda_visible(uuid[])', 'execute');`,
  ["t|f"]
);
exito("el candado de dinero de los indicadores no tiene nada que arreglar", `select retail.fn_aplicar_candado_de_dinero();`, ["{}"]);

// ===================================================================== correr
let bien = 0;
const fallas = [];
for (const c of CASOS) {
  const r = correr(c.sql);
  let ok;
  let detalle = "";
  if (c.tipo === "exito") {
    const lineas = r.ok ? r.salida.split("\n").map((l) => l.trim()).filter(Boolean) : [];
    ok = r.ok && JSON.stringify(lineas) === JSON.stringify(c.esperado);
    detalle = r.ok ? `esperado: ${JSON.stringify(c.esperado)}\n    salió:    ${JSON.stringify(lineas)}` : r.mensaje.split("\n").slice(0, 4).join("\n    ");
  } else {
    ok = !r.ok && r.mensaje.includes(c.contiene);
    detalle = r.ok ? `se esperaba un error («${c.contiene}») y no hubo ninguno` : `se esperaba «${c.contiene}»; salió:\n    ${r.mensaje.split("\n").slice(0, 3).join("\n    ")}`;
  }
  console.log(`${ok ? "✓" : "✗"} ${c.nombre}`);
  if (ok) bien++;
  else {
    console.log(`    ${detalle}`);
    fallas.push(c.nombre);
  }
}
console.log(`\n${bien}/${CASOS.length} pruebas en verde.`);
process.exit(fallas.length ? 1 : 0);
