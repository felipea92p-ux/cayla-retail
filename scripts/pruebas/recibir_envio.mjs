#!/usr/bin/env node
/**
 * Pruebas de `recibir_envio` (ADR-0113) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que un ENVÍO —una guía, varios proveedores— se registre entero o no se
 * registre, y que cada regla de negocio de la puerta se cumpla:
 *   · un lote por proveedor y una sola guía (`envios` + `lotes.envio_id`);
 *   · idempotencia por token (un doble toque no duplica el stock) y que un intento que
 *     FALLA no consume el token;
 *   · atomicidad: si algo falla DESPUÉS de haber recibido un comprobante, no queda nada;
 *   · quién cuenta: cualquier colaborador de la sede, y solo comprobantes de su sede;
 *   · lo fuera de comprobante con su origen (proveedor) y el regalo (no toca el costo);
 *   · el envío interno: confirma un traslado en tránsito, no crea stock de la nada;
 *   · los cierres y la nota de crédito conservan las reglas de sus RPC;
 *   · RLS: lectura por sede, escritura ninguna.
 *
 * CÓMO. Mismo patrón que `registrar_venta.mjs` y `compras_faltantes_y_pago_por_lote.mjs`
 * (léelos primero si esto no tiene sentido): cada escenario corre en su propia transacción
 * con ROLLBACK — nunca se commitea nada, corre seguro contra el Postgres local que
 * comparten ~20 worktrees. Simula a Felipe (líder, cualquier sede) y a Micaela (integrante,
 * fija a Tienda Trujillo) con `set local request.jwt.claim.sub`, sin JWT real.
 *
 * `--en-seco`: antes de cada escenario carga DENTRO de su transacción las migraciones del
 * envío, así se prueban SIN haberlas aplicado a la base compartida. Sin el flag asume que
 * ya están aplicadas.
 *
 * DATOS. Del seed solo lo estable: los proveedores `Textiles Andina SAC` y
 * `Confecciones del Sur EIRL`, las ubicaciones `Taller` y `Tienda Trujillo` y la variante
 * `BLU-EMMA-NEG-M`. Los comprobantes (serie `TST`) se crean DENTRO de la transacción con la
 * RPC real `registrar_compra`.
 *
 * USO
 *   pnpm pruebas:recibir-envio            → migraciones ya aplicadas en el local
 *   pnpm pruebas:recibir-envio --en-seco  → las carga en cada escenario, sin aplicarlas
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier sede
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — fija a Tienda Trujillo

const EN_SECO = process.argv.includes("--en-seco");
const MIGRACIONES = ["20260919120000_envios_recepcion_multiproveedor.sql", "20260919121000_recibir_envio.sql"];
const PRELUDIO = EN_SECO ? MIGRACIONES.map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8")).join("\n") : "";

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
${PRELUDIO}
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;

/** Proveedores, ubicaciones y la variante del seed. */
const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as prov2 from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

/**
 * Crea un comprobante a crédito con la RPC real (mismo ayudante que las pruebas de Compras).
 * Por defecto: 24 u × S/ 50 + IGV 18 % = S/ 1,416.00. Deja `:v` (el comprobante) y `:v_item`
 * (la línea más grande).
 */
function compra(v, { prov = "prov1", destino = "taller", lineas = [24], costo = 50 } = {}) {
  const items = lineas
    .map((c) => `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${c}, 'costo_unitario', ${costo})`)
    .join(", ");
  return `
select retail.registrar_compra(:'${prov}', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${destino}',
  jsonb_build_array(${items}),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as ${v} \\gset
select (array_agg(id order by cantidad desc))[1] as ${v}_item from retail.compra_items where compra_id = :'${v}' \\gset
`;
}

const ITEM = (linea, cantidad) => `jsonb_build_object('compra_item_id', :'${linea}', 'variante_id', :'var', 'cantidad', ${cantidad})`;
const LISTA = (...xs) => `jsonb_build_array(${xs.join(", ")})`;
const STOCK = (ubic) => `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'var' and ubicacion_id = :'${ubic}')`;
const UNIDADES_DEL_ENVIO = `(select sum(m.cantidad) from retail.movimientos m join retail.lotes l on l.id = m.lote_id where l.envio_id = :'env')`;
const TOKEN = "gen_random_uuid()";
const ENV = (r = "r") => `select (:'${r}'::jsonb ->> 'envio_id') as env \\gset\n`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// EL ENVÍO: varios proveedores, una guía
// ===========================================================================

exito(
  "líder: un envío con comprobantes de DOS proveedores → un lote por proveedor, una sola guía, stock suma lo contado",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { prov: "prov1", lineas: [24] })}${compra("c2", { prov: "prov2", lineas: [12] })}
select ${STOCK("taller")} as antes \\gset
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 10), ITEM("c2_item", 12))},
  p_numero_guia => 'T001-004417', p_nota => 'Llegó una caja abierta', p_token => ${TOKEN}) as r \\gset
${ENV()}select
  (select count(*) from retail.envios where id = :'env' and numero_guia = 'T001-004417' and nota = 'Llegó una caja abierta' and ubicacion_id = :'taller'),
  (select count(*) from retail.lotes where envio_id = :'env'),
  (select count(distinct proveedor_id) from retail.lotes where envio_id = :'env'),
  (select count(*) from retail.lotes where envio_id = :'env' and numero_guia = 'T001-004417'),
  ${UNIDADES_DEL_ENVIO},
  ${STOCK("taller")} - :antes,
  (select estado_recepcion from retail.compras where id = :'c1'),
  (select estado_recepcion from retail.compras where id = :'c2');
rollback;
`
  ),
  ["1", "2", "2", "2", "22", "22", "parcial", "recibida"]
);

exito(
  "dos comprobantes del MISMO proveedor en un envío → un solo lote (como hoy)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { prov: "prov1" })}${compra("c2", { prov: "prov1" })}
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 5), ITEM("c2_item", 7))}, p_token => ${TOKEN}) as r \\gset
${ENV()}select
  (select count(*) from retail.envios where id = :'env'),
  (select count(*) from retail.lotes where envio_id = :'env'),
  ${UNIDADES_DEL_ENVIO};
rollback;
`
  ),
  ["1", "1", "12"]
);

// ===========================================================================
// IDEMPOTENCIA Y ATOMICIDAD
// ===========================================================================

exito(
  "idempotente: el mismo token dos veces devuelve el mismo envío y el stock sube UNA vez",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select gen_random_uuid() as tok \\gset
select ${STOCK("taller")} as antes \\gset
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 10))}, p_numero_guia => 'IDEM', p_token => :'tok') as r1 \\gset
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 10))}, p_numero_guia => 'IDEM', p_token => :'tok') as r2 \\gset
select
  (:'r1'::jsonb ->> 'envio_id') = (:'r2'::jsonb ->> 'envio_id'),
  (:'r1'::jsonb ->> 'ya_registrado'),
  (:'r2'::jsonb ->> 'ya_registrado'),
  (select count(*) from retail.envios where token_cliente = :'tok'),
  ${STOCK("taller")} - :antes,
  (select count(*) from retail.movimientos where lote_id in (select id from retail.lotes where envio_id = (:'r1'::jsonb ->> 'envio_id')::uuid));
rollback;
`
  ),
  ["t", "false", "true", "1", "10", "1"]
);

exito(
  "atómico: si falla algo DESPUÉS de recibir un comprobante (regalo con costo), no queda envío, lote, movimiento ni stock",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select ${STOCK("taller")} as antes \\gset
select set_config('t.item', :'c1_item', true) as _a, set_config('t.var', :'var', true) as _b, set_config('t.prov', :'prov2', true) as _c, set_config('t.taller', :'taller', true) as _d \\gset
do $$
begin
  begin
    perform retail.recibir_envio(current_setting('t.taller')::uuid,
      jsonb_build_array(jsonb_build_object('compra_item_id', current_setting('t.item'), 'variante_id', current_setting('t.var'), 'cantidad', 10)),
      p_extras => jsonb_build_array(jsonb_build_object('proveedor_id', current_setting('t.prov'), 'variante_id', current_setting('t.var'), 'cantidad', 2, 'es_regalo', true, 'costo_unitario', 5)),
      p_numero_guia => 'ATOMICO', p_token => gen_random_uuid());
    raise exception 'DEBIA_FALLAR';
  exception when others then
    if sqlerrm not like '%Un regalo no lleva costo%' then raise; end if;
  end;
end $$;
select
  (select count(*) from retail.envios where numero_guia = 'ATOMICO'),
  (select count(*) from retail.lotes where numero_guia = 'ATOMICO'),
  ${STOCK("taller")} - :antes,
  (select recibido_cantidad from retail.compras where id = :'c1');
rollback;
`
  ),
  ["0", "0", "0", "0"]
);

exito(
  "un intento que FALLA no consume el token: el reintento con el mismo token sí registra",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select gen_random_uuid() as tok \\gset
select set_config('t.item', :'c1_item', true) as _a, set_config('t.var', :'var', true) as _b, set_config('t.prov', :'prov2', true) as _c, set_config('t.taller', :'taller', true) as _d, set_config('t.tok', :'tok', true) as _e \\gset
do $$
begin
  begin
    perform retail.recibir_envio(current_setting('t.taller')::uuid,
      jsonb_build_array(jsonb_build_object('compra_item_id', current_setting('t.item'), 'variante_id', current_setting('t.var'), 'cantidad', 10)),
      p_extras => jsonb_build_array(jsonb_build_object('proveedor_id', current_setting('t.prov'), 'variante_id', current_setting('t.var'), 'cantidad', 2, 'es_regalo', true, 'costo_unitario', 5)),
      p_token => current_setting('t.tok')::uuid);
    raise exception 'DEBIA_FALLAR';
  exception when others then
    if sqlerrm not like '%Un regalo no lleva costo%' then raise; end if;
  end;
end $$;
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 10))}, p_token => :'tok') as r \\gset
select (:'r'::jsonb ->> 'ya_registrado'), (select count(*) from retail.envios where token_cliente = :'tok');
rollback;
`
  ),
  ["false", "1"]
);

error(
  "un token ya usado en OTRA ubicación se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2", { destino: "trujillo" })}
select gen_random_uuid() as tok \\gset
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 5))}, p_token => :'tok') as _r \\gset
select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c2_item", 5))}, p_token => :'tok');
`
  ),
  "Ese token ya se usó en otra recepción"
);

// ===========================================================================
// QUIÉN CUENTA
// ===========================================================================

exito(
  "cualquier colaborador cuenta: Micaela (integrante de Trujillo) recibe un envío de 2 proveedores en su sede",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { prov: "prov1", destino: "trujillo" })}${compra("c2", { prov: "prov2", destino: "trujillo" })}
${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c1_item", 4), ITEM("c2_item", 6))}, p_numero_guia => 'T002-1', p_token => ${TOKEN}) as r \\gset
${ENV()}select
  (select count(*) from retail.lotes where envio_id = :'env'),
  (select count(*) from retail.envios e join public.personas p on p.id = e.recibido_por where e.id = :'env' and p.auth_user_id = '${MICAELA}'),
  ${UNIDADES_DEL_ENVIO};
rollback;
`
  ),
  ["2", "1", "10"]
);

error(
  "un colaborador NO recibe en otra sede (Micaela en el Taller)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
${cambiaA(MICAELA)}select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 4))});
`
  ),
  "No tienes permiso para recibir mercadería en esa ubicación"
);

error(
  "un colaborador NO recibe un comprobante destinado a otra sede (aunque reciba en la suya)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { destino: "taller" })}
${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c1_item", 4))});
`
  ),
  "no tiene mercadería asignada a esta sede"
);

// ===========================================================================
// CIERRES Y NOTA DE CRÉDITO: las reglas de sus RPC, sin endurecer ni relajar
// ===========================================================================

exito(
  "colaborador (Micaela) recibe y cierra un faltante en su sede, como ya permite cerrar_linea_compra",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { destino: "trujillo" })}
${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c1_item", 20))},
  p_cierres => ${LISTA(`jsonb_build_object('compra_item_id', :'c1_item', 'cantidad', 4, 'motivo', 'no_llego')`)}, p_token => ${TOKEN}) as r \\gset
select (select count(*) from retail.compra_item_cierres where compra_item_id = :'c1_item'), (select estado_recepcion from retail.compras where id = :'c1');
rollback;
`
  ),
  ["1", "recibida"]
);

error(
  "colaborador (Micaela) NO registra la nota de crédito dentro del envío (es dinero: solo líder)",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { destino: "trujillo" })}
${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c1_item", 20))},
  p_cierres => ${LISTA(`jsonb_build_object('compra_item_id', :'c1_item', 'cantidad', 4, 'motivo', 'no_llego')`)},
  p_notas_credito => ${LISTA(`jsonb_build_object('compra_id', :'c1', 'serie_numero', 'FC01-93', 'fecha', retail.fn_hoy_lima(), 'monto', 236.00)`)});
`
  ),
  "Registrar notas de crédito de proveedores necesita el módulo Notas de crédito" // ADR-0161 P1 (20260923140000)
);

exito(
  "líder: recibe, cierra el faltante y registra la nota de crédito en el mismo envío",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 20))},
  p_cierres => ${LISTA(`jsonb_build_object('compra_item_id', :'c1_item', 'cantidad', 4, 'motivo', 'no_llego')`)},
  p_notas_credito => ${LISTA(`jsonb_build_object('compra_id', :'c1', 'serie_numero', 'FC01-93', 'fecha', retail.fn_hoy_lima(), 'monto', 236.00)`)},
  p_token => ${TOKEN}) as r \\gset
select
  (select count(*) from retail.compra_notas_credito where compra_id = :'c1'),
  (select estado_recepcion from retail.compras where id = :'c1'),
  (:'r'::jsonb ->> 'notas_credito');
rollback;
`
  ),
  ["1", "recibida", "1"]
);

error(
  "una nota de crédito sin ningún cierre en el mismo envío se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 20))},
  p_notas_credito => ${LISTA(`jsonb_build_object('compra_id', :'c1', 'serie_numero', 'FC01-93', 'fecha', retail.fn_hoy_lima(), 'monto', 236.00)`)});
`
  ),
  "necesita que se cierre al menos una línea"
);

// ===========================================================================
// LO FUERA DE COMPROBANTE: origen (proveedor) y regalo
// ===========================================================================

exito(
  "fuera de comprobante con origen: un regalo de OTRO proveedor abre su lote; el costo del regalo no entra al costo promedio",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1", { prov: "prov1", lineas: [24] })}
select ${STOCK("taller")} as antes \\gset
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 24))},
  p_extras => ${LISTA(
    `jsonb_build_object('proveedor_id', :'prov2', 'variante_id', :'var', 'cantidad', 3, 'es_regalo', true)`,
    `jsonb_build_object('proveedor_id', :'prov1', 'variante_id', :'var', 'cantidad', 2, 'costo_unitario', 40)`
  )},
  p_numero_guia => 'T003-9', p_token => ${TOKEN}) as r \\gset
${ENV()}select
  (select count(*) from retail.lotes where envio_id = :'env'),
  (select count(*) from retail.envio_extras where envio_id = :'env'),
  (select count(*) from retail.envio_extras where envio_id = :'env' and es_regalo and proveedor_id = :'prov2'),
  (select sum(m.cantidad) from retail.movimientos m join retail.lotes l on l.id = m.lote_id where l.envio_id = :'env' and l.proveedor_id = :'prov1'),
  (select sum(m.cantidad) from retail.movimientos m join retail.lotes l on l.id = m.lote_id where l.envio_id = :'env' and l.proveedor_id = :'prov2'),
  ${STOCK("taller")} - :antes,
  (select count(*) from retail.costo_historial h join retail.envio_extras x on x.movimiento_id = h.movimiento_id where x.envio_id = :'env' and x.es_regalo),
  (select count(*) from retail.costo_historial h join retail.envio_extras x on x.movimiento_id = h.movimiento_id where x.envio_id = :'env' and not x.es_regalo);
rollback;
`
  ),
  ["2", "2", "1", "26", "3", "29", "0", "1"]
);

error(
  "un regalo no lleva costo",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 5))},
  p_extras => ${LISTA(`jsonb_build_object('proveedor_id', :'prov1', 'variante_id', :'var', 'cantidad', 1, 'es_regalo', true, 'costo_unitario', 10)`)});
`
  ),
  "Un regalo no lleva costo"
);

error(
  "lo fuera de comprobante necesita al menos una línea de comprobante en el envío",
  comoPersona(
    FELIPE,
    `${BASE}select retail.recibir_envio(:'taller', '[]'::jsonb,
  p_extras => ${LISTA(`jsonb_build_object('proveedor_id', :'prov1', 'variante_id', :'var', 'cantidad', 1)`)});
`
  ),
  "necesita al menos una línea de comprobante recibida"
);

error(
  "lo fuera de comprobante necesita un proveedor válido",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 5))},
  p_extras => ${LISTA(`jsonb_build_object('proveedor_id', gen_random_uuid(), 'variante_id', :'var', 'cantidad', 1)`)});
`
  ),
  "necesita un proveedor válido"
);

// ===========================================================================
// EL ENVÍO INTERNO: confirma un traslado en tránsito, no crea stock de la nada
// ===========================================================================

const TRASLADO_EN_CAMINO = (cantidad) => `
${compra("ca", { prov: "prov1", lineas: [30], destino: "taller" })}
select retail.recibir_envio(:'taller', ${LISTA(ITEM("ca_item", 30))}, p_token => ${TOKEN}) as _r \\gset
select retail.iniciar_traslado(:'taller', :'trujillo', ${LISTA(`jsonb_build_object('variante_id', :'var', 'cantidad', ${cantidad})`)}, now() + interval '1 day') as tr \\gset
${compra("cb", { prov: "prov2", lineas: [10], destino: "trujillo" })}
select ${STOCK("trujillo")} as antes \\gset
`;

exito(
  "envío interno: Micaela cuenta lo que vino del Taller y el traslado se confirma en el mismo envío (stock = comprobante + traslado)",
  comoPersona(
    FELIPE,
    `${BASE}${TRASLADO_EN_CAMINO(5)}${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("cb_item", 10))},
  p_traslados => ${LISTA(`jsonb_build_object('transferencia_id', :'tr', 'lineas', ${LISTA(`jsonb_build_object('variante_id', :'var', 'cantidad', 5)`)})`)},
  p_token => ${TOKEN}) as r \\gset
${ENV()}select
  (select estado from retail.transferencias where id = :'tr'),
  (select count(*) from retail.envio_traslados where envio_id = :'env' and transferencia_id = :'tr'),
  ${STOCK("trujillo")} - :antes,
  (:'r'::jsonb -> 'traslados' -> 0 ->> 'resultado');
rollback;
`
  ),
  ["cerrada", "1", "15", "cerrada"]
);

exito(
  "envío interno con diferencia: lo contado no coincide con lo enviado → queda para que un líder lo cierre y no suma stock",
  comoPersona(
    FELIPE,
    `${BASE}${TRASLADO_EN_CAMINO(5)}${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("cb_item", 10))},
  p_traslados => ${LISTA(`jsonb_build_object('transferencia_id', :'tr', 'lineas', ${LISTA(`jsonb_build_object('variante_id', :'var', 'cantidad', 4)`)})`)},
  p_token => ${TOKEN}) as r \\gset
${ENV()}select
  (select estado from retail.transferencias where id = :'tr'),
  (select count(*) from retail.envio_traslados where envio_id = :'env'),
  ${STOCK("trujillo")} - :antes,
  (:'r'::jsonb -> 'traslados' -> 0 ->> 'resultado');
rollback;
`
  ),
  ["recibido_con_diferencia", "1", "10", "recibido_con_diferencia"]
);

error(
  "un traslado que no viene hacia esta ubicación se rechaza",
  comoPersona(
    FELIPE,
    `${BASE}${TRASLADO_EN_CAMINO(5)}${compra("cx", { prov: "prov1", lineas: [10], destino: "taller" })}select retail.recibir_envio(:'taller', ${LISTA(ITEM("cx_item", 1))},
  p_traslados => ${LISTA(`jsonb_build_object('transferencia_id', :'tr', 'lineas', ${LISTA(`jsonb_build_object('variante_id', :'var', 'cantidad', 5)`)})`)});
`
  ),
  "no viene hacia esta ubicación o ya no está en tránsito"
);

error(
  "un traslado sin líneas contadas se rechaza (cuenta aunque sea 0)",
  comoPersona(
    FELIPE,
    `${BASE}${TRASLADO_EN_CAMINO(5)}${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("cb_item", 10))},
  p_traslados => ${LISTA(`jsonb_build_object('transferencia_id', :'tr', 'lineas', '[]'::jsonb)`)});
`
  ),
  "Cuenta las prendas del traslado"
);

// ===========================================================================
// FORMA DEL PEDIDO
// ===========================================================================

error(
  "sin nada que registrar se rechaza",
  comoPersona(FELIPE, `${BASE}select retail.recibir_envio(:'taller');\n`),
  "No hay nada que registrar"
);

error(
  "los ítems tienen que ser una lista",
  comoPersona(FELIPE, `${BASE}select retail.recibir_envio(:'taller', '"x"'::jsonb);\n`),
  "se envían como listas"
);

error(
  "una línea de comprobante que no existe se rechaza con su id",
  comoPersona(FELIPE, `${BASE}select retail.recibir_envio(:'taller', jsonb_build_array(jsonb_build_object('compra_item_id', gen_random_uuid(), 'variante_id', :'var', 'cantidad', 1)));\n`),
  "no existe"
);

error(
  "un ítem sin línea de comprobante no entra por la puerta de los comprobantes",
  comoPersona(FELIPE, `${BASE}select retail.recibir_envio(:'taller', jsonb_build_array(jsonb_build_object('variante_id', :'var', 'cantidad', 1)));\n`),
  "va en «fuera de comprobante»"
);

error(
  "no se recibe más de lo facturado (el tope de recibir_compras sigue mandando)",
  comoPersona(FELIPE, `${BASE}${compra("c1")}select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 25))});\n`),
  "le tocan 24"
);

// ===========================================================================
// RLS: lectura por sede, escritura ninguna
// ===========================================================================

exito(
  "RLS de lectura: Felipe (líder) ve el envío del Taller; Micaela (Trujillo) no lo ve ni sus lotes",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 5))}, p_token => ${TOKEN}) as r \\gset
${ENV()}set local role authenticated;
select count(*) as felipe_envios from retail.envios where id = :'env' \\gset
${cambiaA(MICAELA)}select :'felipe_envios',
  (select count(*) from retail.envios where id = :'env'),
  (select count(*) from retail.lotes where envio_id = :'env');
rollback;
`
  ),
  ["1", "0", "0"]
);

error(
  "RLS: un usuario autenticado no puede insertar directo en envios",
  comoPersona(FELIPE, `${BASE}set local role authenticated;\ninsert into retail.envios (ubicacion_id, numero_guia) values (:'taller', 'DIRECTO');\n`),
  "permission denied"
);

error(
  "RLS: un usuario autenticado no puede insertar directo en envio_extras",
  comoPersona(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.recibir_envio(:'taller', ${LISTA(ITEM("c1_item", 5))}, p_token => ${TOKEN}) as r \\gset
${ENV()}select id as mov from retail.movimientos order by created_at desc limit 1 \\gset
set local role authenticated;
insert into retail.envio_extras (movimiento_id, envio_id, proveedor_id) values (:'mov', :'env', :'prov1');
`
  ),
  "permission denied"
);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: las migraciones del envío se cargan dentro de cada escenario (no se aplican a la base).\n");

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
