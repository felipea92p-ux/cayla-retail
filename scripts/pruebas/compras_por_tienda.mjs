#!/usr/bin/env node
/**
 * Pruebas de Compras POR TIENDA (ADR-0179, reescrito sobre los roles por módulo de ADR-0161) contra el Postgres local.
 *
 * QUÉ PRUEBA (decisión de Felipe, 2026-09-23: con un módulo de Compras se ve y se paga SOLO lo de su tienda; el líder, todo):
 *   · QUIÉN: sin módulo de Compras no se llega a ninguna tienda, aunque haya fila en `compradores_de_tienda`;
 *   · DÓNDE: con módulo, su tienda; con fila extra, además esa; el líder, todas;
 *   · lectura: una factura que gestiona OTRA tienda no se ve (ni cabecera, ni líneas, ni pagos) aunque tenga parte en ella;
 *     la que gestiona su tienda, sí; la serie de 12 meses de proveedores solo suma las suyas;
 *   · F3-b: la parte en una factura ajena sale por `fn_mis_partes_de_compras` / `fn_mi_parte_de_compra` con SU monto y SU
 *     saldo, nunca el total de la factura;
 *   · pagar: desde su tienda, hasta su parte; sin tienda o con tienda ajena, no; el líder puede pagar sin tienda y ninguna
 *     tienda queda con deuda fantasma; el candado de esquema no deja pagar más que la parte ni escribiendo directo;
 *   · escribir: anular / registrar sobre la gestora ajena, no; registrar exige gestora propia y con parte; pagar al
 *     registrar exige el módulo Por pagar; la gestora no puede quedarse sin parte; cambiarla es del líder;
 *   · una sola firma por función y nada abierto a anon.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK: los módulos del rol «integrante» y las facturas se crean dentro, así
 * que nunca se commitea nada. Las migraciones 20260923180000–180400 tienen que estar aplicadas (el CI las aplica con
 * `supabase start`; en local, con `migration up`).
 *
 * USO   pnpm pruebas:compras-por-tienda
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

// ===================================================================== 1. quién y dónde
exito(
  "sin módulo de Compras Micaela no llega a ninguna tienda, ni con fila en compradores_de_tienda (la tabla no da acceso)",
  escenario(`${MODULOS()}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');
${COMO_MICAELA}select cardinality(retail.fn_compras_ubicaciones()), retail.fn_puede_comprar_en(:'trujillo');`),
  ["0|f"]
);
exito(
  "con Por pagar llega a SU tienda (Trujillo) y a ninguna otra",
  escenario(`${MODULOS("por_pagar")}${COMO_MICAELA}select retail.fn_puede_comprar_en(:'trujillo'), retail.fn_puede_comprar_en(:'lima'), cardinality(retail.fn_compras_ubicaciones());`),
  ["t|f|1"]
);
exito(
  "con una fila extra (R-10) llega también a Lima",
  escenario(`${MODULOS("facturas_compra")}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');
${COMO_MICAELA}select retail.fn_puede_comprar_en(:'trujillo'), retail.fn_puede_comprar_en(:'lima');`),
  ["t|t"]
);
exito(
  "el líder llega a todas las ubicaciones activas",
  escenario(`select cardinality(retail.fn_compras_ubicaciones()) = (select count(*) from retail.ubicaciones where activo);`),
  ["t"]
);
error(
  "sumar tiendas extra es solo del líder",
  escenario(`${MODULOS("facturas_compra")}${COMO_MICAELA}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');`),
  "Solo un líder"
);

// ===================================================================== 2. lectura
exito(
  "una factura que gestiona Lima (con parte de Trujillo) NO se ve desde Trujillo: ni cabecera, ni líneas, ni pagos; la que gestiona Trujillo sí",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${compra("f2", { gestora: "trujillo", dest: { trujillo: 5 } })}
${PAGAR("f1", "100.00", "lima")} as _p \\gset
${MODULOS("facturas_compra", "por_pagar")}${COMO_MICAELA}
select (select count(*) from retail.compras where id = :'f1'), (select count(*) from retail.compra_items where compra_id = :'f1'),
       (select count(*) from retail.compra_pagos where compra_id = :'f1'), (select count(*) from retail.compras where id = :'f2'),
       retail.fn_compra_es_de_mis_tiendas(:'f1'), retail.fn_compra_es_de_mis_tiendas(:'f2');`),
  ["0|0|0|1|f|t"]
);
exito(
  "la gestora se guarda al registrar (Lima) y el líder ve todo",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}
select ubicacion_gestion_id = :'lima', retail.fn_compra_es_de_mis_tiendas(:'f1') from retail.compras where id = :'f1';`),
  ["t|t"]
);
exito(
  "la serie de 12 meses de proveedores desde Trujillo no suma la factura que gestiona Lima; sí la que gestiona Trujillo (590.00)",
  escenario(`${MODULOS("facturas_compra")}${COMO_MICAELA}
select coalesce(sum(monto), 0) as antes from retail.fn_proveedores_serie_12m() where proveedor_id = :'prov1' \\gset
${COMO_FELIPE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${compra("f2", { gestora: "trujillo", dest: { trujillo: 10 } })}
${COMO_MICAELA}select coalesce(sum(monto), 0) - :'antes' from retail.fn_proveedores_serie_12m() where proveedor_id = :'prov1';`),
  ["590.00"]
);
exito(
  "sin módulo, el indicador de Compras sigue cerrado (candado de dinero)",
  escenario(`${MODULOS()}${COMO_MICAELA}select count(*) from retail.compras;`),
  ["0"]
);

// ===================================================================== 3. F3-b: mi parte
exito(
  "Trujillo ve SU parte de la factura que gestiona Lima: 12 u, 708.00, saldo 708.00, «parte nueva», gestiona Tienda Lima",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${PAGAR("f1", "708.00", "lima")} as _p \\gset
${MODULOS("por_pagar")}${COMO_MICAELA}
select unidades, total, pagado, saldo, parte_nueva, gestora_nombre from retail.fn_mis_partes_de_compras() where compra_id = :'f1';`),
  ["12|708.00|0.00|708.00|t|Tienda Lima"]
);
exito(
  "el detalle de la parte trae SUS líneas (12 u) y ningún monto de la factura entera",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}
${MODULOS("por_pagar")}${COMO_MICAELA}
select retail.fn_mi_parte_de_compra(:'f1') as d \\gset
select (:'d'::jsonb -> 'partes' -> 0 ->> 'total'), (:'d'::jsonb -> 'lineas' -> 0 ->> 'cantidad'), jsonb_array_length(:'d'::jsonb -> 'lineas'),
       (:'d'::jsonb -> 'compra') ? 'total', (:'d'::jsonb -> 'compra') ? 'saldo', (:'d'::jsonb -> 'compra' ->> 'gestora_nombre');`),
  ["708.00|12|1|f|f|Tienda Lima"]
);
exito(
  "la parte de una factura que gestiona su propia tienda no sale como «ajena»; al líder no le sale ninguna",
  escenario(`${compra("f2", { gestora: "trujillo", dest: { trujillo: 6, lima: 6 } })}
select count(*) from retail.fn_mis_partes_de_compras();
${MODULOS("por_pagar")}${COMO_MICAELA}select count(*) from retail.fn_mis_partes_de_compras() where compra_id = :'f2';`),
  ["0", "0"]
);
error(
  "el detalle de una factura en la que su tienda no tiene parte se rechaza",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${MODULOS("por_pagar")}${COMO_MICAELA}select retail.fn_mi_parte_de_compra(:'f1');`),
  "Ninguna de tus tiendas tiene parte"
);

// ===================================================================== 4. pagar por tienda
exito(
  "Trujillo paga exactamente su parte de la factura que gestiona Lima y su saldo queda en 0; el de Lima sigue en 708.00",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}${PAGAR("f1", "708.00", "trujillo")} as _p \\gset
${COMO_FELIPE}select retail.fn_saldo_de_tienda(:'f1', :'trujillo'), retail.fn_saldo_de_tienda(:'f1', :'lima'), saldo from retail.compras where id = :'f1';`),
  ["0.00|708.00|708.00"]
);
error(
  "Trujillo no puede pagar más que su parte, aunque la factura entera tenga saldo",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}${PAGAR("f1", "708.01", "trujillo")} as _p \\gset`),
  "supera lo que le queda por pagar a esa tienda"
);
error(
  "quien no es líder no puede pagar sin decir desde qué tienda",
  escenario(`${compra("f1", { gestora: "trujillo", dest: { trujillo: 24 } })}${MODULOS("por_pagar")}${COMO_MICAELA}${PAGAR("f1", "10.00", null)} as _p \\gset`),
  "Elige desde qué tienda pagas"
);
error(
  "tampoco desde una tienda que no es suya",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}${PAGAR("f1", "10.00", "lima")} as _p \\gset`),
  "Solo puedes pagar desde una de tus tiendas"
);
error(
  "sin el módulo Por pagar no paga (la puerta de ADR-0161 sigue)",
  escenario(`${compra("f1", { gestora: "trujillo", dest: { trujillo: 24 } })}${MODULOS("facturas_compra")}${COMO_MICAELA}${PAGAR("f1", "10.00", "trujillo")} as _p \\gset`),
  "necesita el módulo Por pagar"
);
error(
  "desde su tienda, pero en una factura donde su tienda no tiene parte, no",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 24 } })}${MODULOS("por_pagar")}${COMO_MICAELA}${PAGAR("f1", "10.00", "trujillo")} as _p \\gset`),
  "Esa tienda no tiene parte"
);
exito(
  "si el líder paga la factura entera sin tienda, ninguna tienda queda con deuda fantasma",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${PAGAR("f1", "1416.00", null)} as _p \\gset
select retail.fn_saldo_de_tienda(:'f1', :'trujillo'), retail.fn_saldo_de_tienda(:'f1', :'lima');`),
  ["0.00|0.00"]
);
error(
  "el candado de esquema: escribir directo un pago de Trujillo mayor que su parte falla al cerrar",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}
insert into retail.compra_pagos (compra_id, fecha, monto, metodo, ubicacion_id) values (:'f1', retail.fn_hoy_lima(), 709.00, 'transferencia', :'trujillo');
set constraints all immediate;`),
  "supera su parte del comprobante"
);
exito(
  "pagar juntos con tienda: el pago queda a nombre de Trujillo",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}
select retail.registrar_pago_compras(:'prov1', 'transferencia', jsonb_build_array(jsonb_build_object('compra_id', :'f1', 'monto', 300)), null, null, null, 0, :'trujillo') as g \\gset
${COMO_FELIPE}select count(*), sum(monto) from retail.compra_pagos where pago_grupo_id = :'g' and ubicacion_id = :'trujillo';`),
  ["1|300.00"]
);

// ===================================================================== 5. escribir sobre la factura
error(
  "Trujillo no anula la factura que gestiona Lima",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("facturas_compra")}${COMO_MICAELA}select retail.anular_compra(:'f1', 'prueba');`),
  "la gestiona otra tienda"
);
exito(
  "Trujillo sí anula la que gestiona su tienda",
  escenario(`${compra("f2", { gestora: "trujillo", dest: { trujillo: 5 } })}${MODULOS("facturas_compra")}${COMO_MICAELA}select retail.anular_compra(:'f2', 'prueba');
${COMO_FELIPE}select estado from retail.compras where id = :'f2';`),
  ["anulada"]
);
error(
  "Trujillo no registra una factura con Lima como gestora",
  escenario(`${MODULOS("facturas_compra")}${COMO_MICAELA}${compra("f3", { gestora: "lima", dest: { lima: 5 } })}`),
  "tiene que ser una de las tuyas"
);
error(
  "la gestora tiene que recibir parte de la mercadería",
  escenario(`${MODULOS("facturas_compra")}${COMO_MICAELA}${compra("f3", { gestora: "trujillo", dest: { lima: 5 } })}`),
  "tiene que recibir parte de la mercadería"
);
exito(
  "Trujillo registra con su tienda como gestora y reparte también a Lima",
  escenario(`${MODULOS("facturas_compra")}${COMO_MICAELA}${compra("f3", { gestora: "trujillo", dest: { trujillo: 3, lima: 2 } })}
${COMO_FELIPE}select ubicacion_gestion_id = :'trujillo' from retail.compras where id = :'f3';`),
  ["t"]
);
error(
  "pagar al registrar necesita el módulo Por pagar",
  escenario(`${MODULOS("facturas_compra")}${COMO_MICAELA}${compra("f3", { gestora: "trujillo", dest: { trujillo: 5 }, pago: "jsonb_build_array(jsonb_build_object('monto', 295, 'metodo', 'efectivo'))" })}`),
  "Pagar al registrar necesita el módulo Por pagar"
);
exito(
  "con los dos módulos, el pago al contado queda a nombre de la gestora (Trujillo)",
  escenario(`${MODULOS("facturas_compra", "por_pagar")}${COMO_MICAELA}${compra("f3", { gestora: "trujillo", dest: { trujillo: 5 }, pago: "jsonb_build_array(jsonb_build_object('monto', 295, 'metodo', 'efectivo'))" })}
${COMO_FELIPE}select count(*) from retail.compra_pagos where compra_id = :'f3' and ubicacion_id = :'trujillo';`),
  ["1"]
);
error(
  "la gestora no puede quedarse sin parte (reasignar todo lo de Lima a Trujillo falla al cerrar)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}
select i.id as item from retail.compra_items i where i.compra_id = :'f1' \\gset
select retail.reasignar_reparto_compra(:'item', :'lima', :'trujillo', 12, 'otro', 'prueba');
set constraints all immediate;`),
  "tiene que conservar parte de la mercadería"
);
error(
  "cambiar la tienda gestora es solo del líder",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("facturas_compra")}${COMO_MICAELA}select retail.cambiar_tienda_gestora_compra(:'f1', :'trujillo');`),
  "Solo un líder"
);
exito(
  "el líder cambia la gestora a Trujillo y desde ese momento Trujillo la ve entera",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}select retail.cambiar_tienda_gestora_compra(:'f1', :'trujillo');
${MODULOS("facturas_compra")}${COMO_MICAELA}select count(*) from retail.compras where id = :'f1';`),
  ["1"]
);

// ===================================================================== 6. firmas y permisos
exito(
  "una sola firma por función tocada y nada nuevo abierto a anon",
  `select (select count(*) = count(distinct proname) from pg_proc where pronamespace = 'retail'::regnamespace
            and proname in ('registrar_compra', 'registrar_pagos_compra', 'registrar_pago_compras', 'registrar_pago_compras_medios', 'anular_compra')),
          (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'retail'::regnamespace
            and p.proname in ('fn_compras_ubicaciones', 'fn_mis_partes_de_compras', 'fn_mi_parte_de_compra', 'fn_saldo_de_tienda',
                              'registrar_pagos_compra', 'registrar_pago_compras', 'registrar_pago_compras_medios', 'cambiar_tienda_gestora_compra'));`,
  ["t|f"]
);
exito("la red de seguridad de los indicadores no tiene nada que arreglar", `select retail.fn_aplicar_candado_de_dinero();`, ["{}"]);

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
