#!/usr/bin/env node
/**
 * Pruebas de Compras POR TIENDA (ADR-0184, reescrito sobre los roles por módulo de ADR-0161) contra el Postgres local, pasadas a
 * «el módulo es la llave» (ADR-0387, Felipe 2026-10-12): quien tiene un módulo de plata de Compras (Facturas de proveedor, Por
 * pagar o Notas de crédito) ve y paga las facturas de TODAS las tiendas, como el líder. Deshace en Compras la decisión del
 * 2026-09-23 («con un módulo de Compras se ve y se paga SOLO lo de su tienda»); cada caso que se invirtió lo dice en su nombre
 * (misma situación, el resultado nuevo).
 *
 * QUÉ PRUEBA
 *   · QUIÉN: sin módulo de plata de Compras no se llega a ninguna tienda, aunque haya fila en `compradores_de_tienda`;
 *   · DÓNDE: con módulo, cualquier tienda activa (no una que no existe ni una inactiva); la fila extra ya no hace falta
 *     (`fn_compras_ubicaciones`, que no cambió, la sigue sumando, pero en Compras ya no decide nada); el líder, todas; sumar
 *     tiendas extra sigue siendo del líder;
 *   · lectura: con módulo, la factura que gestiona OTRA tienda se ve entera (cabecera, líneas y pagos), igual que la de su
 *     tienda; sin módulo, nada; la serie de 12 meses de proveedores suma las de todas las tiendas;
 *   · F3-b: ya no hay «partes ajenas» (`fn_mis_partes_de_compras` sale vacía para quien tiene el módulo: la deuda la ve
 *     entera); `fn_mi_parte_de_compra`, que no cambió y queda sin efecto en Compras hasta que se retire, sigue dando SU parte
 *     con SU monto, nunca el total de la factura;
 *   · pagar (con Por pagar): sin tienda, a nombre de la EMPRESA; o desde cualquier tienda activa con parte, hasta lo que le
 *     queda a esa tienda; desde una tienda inactiva o sin parte, no; sin el módulo, no; si el líder paga la factura entera sin
 *     tienda, ninguna tienda queda con deuda fantasma; el candado de esquema no deja pagar más que la parte ni escribiendo directo;
 *   · escribir: con Facturas de proveedor anula y registra con cualquier gestora activa (no una inactiva); anular sigue
 *     pidiendo Facturas de proveedor; la gestora tiene que recibir parte y no puede quedarse sin ella; pagar al registrar exige
 *     el módulo Por pagar y el contado queda a nombre de la empresa; cambiar la gestora, de quien tiene Facturas de proveedor
 *     (ADR-0387; antes, del líder);
 *   · una sola firma por función y nada abierto a anon.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK: los módulos del rol «integrante» y las facturas se crean dentro, así
 * que nunca se commitea nada. Las migraciones 20260923180000–180400, 20261012202000 y 20261012204000 (ADR-0387) tienen que
 * estar aplicadas (el CI las aplica con `supabase start`; en local, con `migration up`).
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
  "ADR-0387 (Felipe 2026-10-12): con Por pagar llega a cualquier tienda activa (Trujillo y también Lima), no a una que no existe ni a Lima inactiva; fn_compras_ubicaciones, que no cambió, sigue siendo solo la suya (antes: solo Trujillo)",
  escenario(`${MODULOS("por_pagar")}${COMO_MICAELA}select retail.fn_puede_comprar_en(:'trujillo'), retail.fn_puede_comprar_en(:'lima'), retail.fn_puede_comprar_en(gen_random_uuid()), cardinality(retail.fn_compras_ubicaciones());
${COMO_POSTGRES}update retail.ubicaciones set activo = false where id = :'lima';
${COMO_MICAELA}select retail.fn_puede_comprar_en(:'lima');`),
  ["t|t|f|1", "f"]
);
exito(
  "ADR-0387 (Felipe 2026-10-12): la fila extra (R-10) ya no hace falta para llegar a Lima — sin ella llega igual; con ella, fn_compras_ubicaciones (que no cambió) la suma, sin cambiar nada en Compras (antes: solo con la fila)",
  escenario(`${MODULOS("facturas_compra")}${COMO_MICAELA}select retail.fn_puede_comprar_en(:'lima'), cardinality(retail.fn_compras_ubicaciones());
${COMO_FELIPE}select retail.agregar_comprador_de_tienda(:'micaela', :'lima');
${COMO_MICAELA}select retail.fn_puede_comprar_en(:'trujillo'), retail.fn_puede_comprar_en(:'lima'), cardinality(retail.fn_compras_ubicaciones());`),
  ["t|1", "t|t|2"]
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
  "ADR-0387 (Felipe 2026-10-12): una factura que gestiona Lima (con parte de Trujillo) SÍ se ve entera desde Trujillo con Facturas de proveedor y Por pagar —cabecera, líneas y pagos—, igual que la que gestiona Trujillo; sin módulo de plata, ninguna de las tres (antes: no se veía)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${compra("f2", { gestora: "trujillo", dest: { trujillo: 5 } })}
${PAGAR("f1", "100.00", "lima")} as _p \\gset
${MODULOS("facturas_compra", "por_pagar")}${COMO_MICAELA}
select (select count(*) from retail.compras where id = :'f1'), (select count(*) from retail.compra_items where compra_id = :'f1'),
       (select count(*) from retail.compra_pagos where compra_id = :'f1'), (select count(*) from retail.compras where id = :'f2'),
       retail.fn_compra_es_de_mis_tiendas(:'f1'), retail.fn_compra_es_de_mis_tiendas(:'f2');
${COMO_FELIPE}${MODULOS()}${COMO_MICAELA}
select (select count(*) from retail.compras where id = :'f1'), (select count(*) from retail.compra_items where compra_id = :'f1'),
       (select count(*) from retail.compra_pagos where compra_id = :'f1'), retail.fn_compra_es_de_mis_tiendas(:'f1');`),
  ["1|1|1|1|t|t", "0|0|0|f"]
);
exito(
  "la gestora se guarda al registrar (Lima) y el líder ve todo",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}
select ubicacion_gestion_id = :'lima', retail.fn_compra_es_de_mis_tiendas(:'f1') from retail.compras where id = :'f1';`),
  ["t|t"]
);
exito(
  "ADR-0387 (Felipe 2026-10-12): la serie de 12 meses de proveedores desde Trujillo suma también la factura que gestiona Lima: 1,416.00 + 590.00 = 2,006.00 (antes: solo la de Trujillo, 590.00)",
  escenario(`${MODULOS("facturas_compra")}${COMO_MICAELA}
select coalesce(sum(monto), 0) as antes from retail.fn_proveedores_serie_12m() where proveedor_id = :'prov1' \\gset
${COMO_FELIPE}${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${compra("f2", { gestora: "trujillo", dest: { trujillo: 10 } })}
${COMO_MICAELA}select coalesce(sum(monto), 0) - :'antes' from retail.fn_proveedores_serie_12m() where proveedor_id = :'prov1';`),
  ["2006.00"]
);
exito(
  "sin módulo, el indicador de Compras sigue cerrado (candado de dinero)",
  escenario(`${MODULOS()}${COMO_MICAELA}select count(*) from retail.compras;`),
  ["0"]
);

// ===================================================================== 3. F3-b: mi parte (ADR-0387: ya no hay partes ajenas)
exito(
  "ADR-0387 (Felipe 2026-10-12): con Por pagar, la factura que gestiona Lima ya no sale como «parte ajena» (fn_mis_partes_de_compras, vacía): Trujillo la ve entera en su deuda (1,416.00, 708.00 pagados por Lima, saldo 708.00) y lo que le queda a su parte sigue siendo 708.00 (antes: solo su parte, 12 u y 708.00)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${PAGAR("f1", "708.00", "lima")} as _p \\gset
${MODULOS("por_pagar")}${COMO_MICAELA}
select count(*) from retail.fn_mis_partes_de_compras() where compra_id = :'f1';
select total, pagado, saldo, gestionada, retail.fn_saldo_de_tienda(:'f1', :'trujillo') from retail.fn_deuda_visible(array[:'f1']::uuid[]);`),
  ["0", "1416.00|708.00|708.00|t|708.00"]
);
exito(
  "el detalle de la parte (fn_mi_parte_de_compra, que ADR-0387 no cambió) trae SUS líneas (12 u) y ningún monto de la factura entera",
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

// ===================================================================== 4. pagar: a nombre de la empresa, o por tienda si se nombra una
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
exito(
  "ADR-0387 (Felipe 2026-10-12): quien no es líder, con Por pagar, paga SIN decir desde qué tienda: el pago queda a nombre de la EMPRESA (sin tienda) y baja el saldo de la factura (antes: «Elige desde qué tienda pagas»)",
  escenario(`${compra("f1", { gestora: "trujillo", dest: { trujillo: 24 } })}${MODULOS("por_pagar")}${COMO_MICAELA}${PAGAR("f1", "10.00", null)} as _p \\gset
${COMO_FELIPE}select count(*) filter (where ubicacion_id is null), count(*) filter (where ubicacion_id is not null), sum(monto) from retail.compra_pagos where compra_id = :'f1';
select saldo from retail.compras where id = :'f1';`),
  ["1|0|10.00", "1406.00"]
);
exito(
  "ADR-0387 (Felipe 2026-10-12): también paga desde Lima, que no es su tienda: el pago queda a nombre de Lima (está activa, tiene parte y no pasa de lo que le queda) y baja solo la parte de Lima (antes: «Solo puedes pagar desde una de tus tiendas»)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}${PAGAR("f1", "10.00", "lima")} as _p \\gset
${COMO_FELIPE}select count(*), sum(monto) from retail.compra_pagos where compra_id = :'f1' and ubicacion_id = :'lima';
select retail.fn_saldo_de_tienda(:'f1', :'lima'), retail.fn_saldo_de_tienda(:'f1', :'trujillo');`),
  ["1|10.00", "698.00|708.00"]
);
error(
  "ADR-0387 (Felipe 2026-10-12): pero no desde una tienda inactiva, aunque tenga parte (Lima, cerrada después de registrar la factura)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}update retail.ubicaciones set activo = false where id = :'lima';
${MODULOS("por_pagar")}${COMO_MICAELA}${PAGAR("f1", "10.00", "lima")} as _p \\gset`),
  "Esa tienda no existe o no está activa"
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
exito(
  "ADR-0387 (Felipe 2026-10-12): con Facturas de proveedor, Trujillo anula también la factura que gestiona Lima (antes: «la gestiona otra tienda»)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("facturas_compra")}${COMO_MICAELA}select retail.anular_compra(:'f1', 'prueba');
${COMO_FELIPE}select estado from retail.compras where id = :'f1';`),
  ["anulada"]
);
error(
  "ADR-0387 (Felipe 2026-10-12): con solo Por pagar no la anula: anular sigue pidiendo Facturas de proveedor",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}select retail.anular_compra(:'f1', 'prueba');`),
  "necesita el módulo Facturas de compra"
);
exito(
  "Trujillo sí anula la que gestiona su tienda",
  escenario(`${compra("f2", { gestora: "trujillo", dest: { trujillo: 5 } })}${MODULOS("facturas_compra")}${COMO_MICAELA}select retail.anular_compra(:'f2', 'prueba');
${COMO_FELIPE}select estado from retail.compras where id = :'f2';`),
  ["anulada"]
);
exito(
  "ADR-0387 (Felipe 2026-10-12): Trujillo registra una factura con Lima como gestora: sirve cualquier tienda activa (antes: «tiene que ser una de las tuyas»)",
  escenario(`${MODULOS("facturas_compra")}${COMO_MICAELA}${compra("f3", { gestora: "lima", dest: { lima: 5 } })}
${COMO_FELIPE}select ubicacion_gestion_id = :'lima' from retail.compras where id = :'f3';`),
  ["t"]
);
error(
  "ADR-0387 (Felipe 2026-10-12): pero no con una gestora inactiva (Lima cerrada)",
  escenario(`update retail.ubicaciones set activo = false where id = :'lima';
${MODULOS("facturas_compra")}${COMO_MICAELA}${compra("f3", { gestora: "lima", dest: { trujillo: 5 } })}`),
  "La tienda que gestiona el comprobante no existe o no está activa"
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
  "ADR-0387 (Felipe 2026-10-12): con los dos módulos, el pago al contado queda a nombre de la EMPRESA (sin tienda), como el del líder (antes: de la gestora, Trujillo)",
  escenario(`${MODULOS("facturas_compra", "por_pagar")}${COMO_MICAELA}${compra("f3", { gestora: "trujillo", dest: { trujillo: 5 }, pago: "jsonb_build_array(jsonb_build_object('monto', 295, 'metodo', 'efectivo'))" })}
${COMO_FELIPE}select count(*) filter (where ubicacion_id is null), count(*) filter (where ubicacion_id is not null), sum(monto) from retail.compra_pagos where compra_id = :'f3';`),
  ["1|0|295.00"]
);
error(
  "la gestora no puede quedarse sin parte (reasignar todo lo de Lima a Trujillo falla al cerrar)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}
select i.id as item from retail.compra_items i where i.compra_id = :'f1' \\gset
select retail.reasignar_reparto_compra(:'item', :'lima', :'trujillo', 12, 'otro', 'prueba');
set constraints all immediate;`),
  "tiene que conservar parte de la mercadería"
);
exito(
  "cambiar la tienda gestora: quien tiene Facturas de proveedor la cambia sin ser líder (ADR-0387: el módulo es la llave), y Trujillo la ve",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("facturas_compra")}${COMO_MICAELA}select retail.cambiar_tienda_gestora_compra(:'f1', :'trujillo');
select count(*) from retail.compras where id = :'f1';`),
  ["1"]
);
error(
  "sin Facturas de proveedor no se cambia la tienda gestora (el error nombra el módulo)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("por_pagar")}${COMO_MICAELA}select retail.cambiar_tienda_gestora_compra(:'f1', :'trujillo');`),
  "Facturas de proveedor"
);
exito(
  "el líder cambia la gestora a Trujillo y queda guardada; ADR-0387 (Felipe 2026-10-12): Trujillo la ve entera antes y después, la gestora ya no decide quién la ve (antes: la veía «desde ese momento»)",
  escenario(`${compra("f1", { gestora: "lima", dest: { lima: 12, trujillo: 12 } })}${MODULOS("facturas_compra")}${COMO_MICAELA}select count(*) from retail.compras where id = :'f1';
${COMO_FELIPE}select retail.cambiar_tienda_gestora_compra(:'f1', :'trujillo');
${COMO_MICAELA}select count(*), bool_and(ubicacion_gestion_id = :'trujillo') from retail.compras where id = :'f1';`),
  ["1", "1|t"]
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
