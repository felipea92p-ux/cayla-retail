#!/usr/bin/env node
/**
 * Pruebas del módulo «Notas de crédito» (/compras/notas-credito) contra el Postgres local — CAYLA V2.
 * Migración: `supabase/migrations/20260919211000_notas_credito_modulo.sql`.
 *
 * QUÉ PRUEBA. Las cuatro piezas de la base que el módulo necesita, y sobre todo que el dinero no
 * pueda quedar a medias:
 *   · `notas_credito_tablero()`            — una fila por nota registrada y una por faltante cerrado sin
 *                                            nota; `monto_esperado` del pendiente, `a_favor` de la nota
 *                                            que superó la deuda, `resuelto` cuando todavía falta cerrar.
 *   · `registrar_nota_credito_compra`      — con `p_destino = 'a_favor'` deja EXACTAMENTE el mismo estado
 *                                            que la función de hoy (se compara contra una copia de su
 *                                            cuerpo viejo, creada dentro de la misma transacción); con
 *                                            `'reembolso'` nacen nota y devolución juntas o no nace nada.
 *   · `fn_facturas_para_nota_credito()`    — busca por documento, por proveedor y POR MONTO (con coma,
 *                                            sin coma, con decimales y por prefijo), respeta los tres
 *                                            filtros y no muestra comprobantes anulados.
 *   · `compra_adjuntos.nota_credito_id`    — se guarda por la RPC, y la FK compuesta impide colgar el
 *                                            adjunto de una nota de OTRA factura.
 *   · Permisos (ADR-0126): Micaela (integrante) no lee ni escribe nada; `anon` no tiene EXECUTE.
 *   · Una sola firma de cada función tocada (ADR-0009) y la migración se puede pegar dos veces.
 *
 * CÓMO. Mismo patrón que `compras_faltantes_y_pago_por_lote.mjs` y `pagos_compras_endurecimiento.mjs`:
 * cada escenario corre en su propia transacción con ROLLBACK — nunca se commitea nada, corre seguro
 * contra el Postgres local que comparten ~20 worktrees. Simula a Felipe (líder) y a Micaela
 * (integrante) con `set local request.jwt.claim.sub`; para probar permisos de verdad cambia a
 * `set local role authenticated`. Los comprobantes (serie `TST`) se crean DENTRO de la transacción
 * con la RPC real `registrar_compra`.
 *
 * NO PRUEBA la carrera de dos devoluciones simultáneas del mismo saldo (un solo psql no lanza dos
 * transacciones a la vez): esa garantía sale del `for update` sobre `proveedores` dentro de
 * `fn_insertar_reembolso_proveedor`, heredado tal cual de `registrar_reembolso_proveedor`.
 *
 * USO
 *   pnpm pruebas:notas-credito   → necesita el stack local (`npx supabase start`) y la migración aplicada
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260919211000_notas_credito_modulo.sql"), "utf8");

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

const como = (authUserId, sql) => `
begin;
set local request.jwt.claim.sub = '${authUserId}';
${sql}
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const COMO_AUTENTICADO = "set local role authenticated;\n";

/** Proveedores, ubicaciones y la variante del seed. */
const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as prov2 from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

const HOY = "retail.fn_hoy_lima()";

/**
 * Crea un comprobante a crédito con la RPC real. Por defecto: 24 u × S/ 50 + IGV 18 % = S/ 1,416.00
 * (subtotal 1,200 + IGV 216), emitido hoy y vence en 10 días. Deja `:v` y `:v_item`.
 */
function compra(v, { prov = "prov1", lineas = [24], costo = 50, emision = HOY } = {}) {
  const items = lineas
    .map((c) => `jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${c}, 'costo_unitario', ${costo})`)
    .join(", ");
  return `
select retail.registrar_compra(:'${prov}', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'taller',
  jsonb_build_array(${items}),
  p_tipo => 'factura', p_fecha_emision => ${emision}, p_fecha_vencimiento => ${HOY} + 10, p_igv_porcentaje => 18) as ${v} \\gset
select (array_agg(id order by cantidad desc))[1] as ${v}_item from retail.compra_items where compra_id = :'${v}' \\gset
select documento as ${v}_doc from retail.compras where id = :'${v}' \\gset
`;
}

/** Recibe `cantidad` unidades de una línea, en el Taller. */
const recibe = (linea, cantidad) => `
select retail.recibir_compras(:'taller', jsonb_build_array(jsonb_build_object('compra_item_id', :'${linea}', 'variante_id', :'var', 'cantidad', ${cantidad}))) as _lote \\gset
`;

/** La fila del tablero de un comprobante, de una clase. */
const fila = (v, clase, columnas) =>
  `select ${columnas} from retail.notas_credito_tablero() where compra_id = :'${v}' and clase = '${clase}';`;

/** `registrar_nota_credito_compra` tal como estaba ANTES de esta migración, con otro nombre. */
const RPC_VIEJA = `
create function retail.registrar_nota_credito_compra_vieja(p_compra_id uuid, p_serie_numero text, p_fecha date, p_monto numeric, p_motivo text, p_nota text default null, p_cierre_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'retail', 'public', 'extensions' as $viejo$
declare
  v_persona uuid;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar notas de crédito de proveedores';
  end if;
  perform 1 from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  return fn_insertar_nota_credito_compra(p_compra_id, p_serie_numero, p_fecha, p_monto, p_motivo, p_nota, p_cierre_id, v_persona);
end;
$viejo$;
`;

// ADR-0195 F3b (20260925150000): la nota y el reembolso suman «Entra a» (un parámetro opcional al final, la firma vieja
// se quitó). La migración de este módulo, anterior, crea las firmas de entonces (`FIRMA_NOTA_ORIGINAL`).
const FIRMA_NOTA = "'retail.registrar_nota_credito_compra(uuid,text,date,numeric,text,text,uuid,text,text,date,text,uuid)'::regprocedure";
const FIRMA_NOTA_ORIGINAL = "'retail.registrar_nota_credito_compra(uuid,text,date,numeric,text,text,uuid,text,text,date,text)'::regprocedure";
const FIRMA_TABLERO = "'retail.notas_credito_tablero()'::regprocedure";
const FIRMA_FACTURAS = "'retail.fn_facturas_para_nota_credito(text,uuid,text,integer)'::regprocedure";
const FIRMA_ADJUNTO = "'retail.registrar_adjunto_compra(uuid,text,text,text,integer,uuid)'::regprocedure";
const FIRMA_REEMBOLSO = "'retail.registrar_reembolso_proveedor(uuid,numeric,text,text,date,text,uuid)'::regprocedure";
const FIRMA_INSERTAR_REEMBOLSO = "'retail.fn_insertar_reembolso_proveedor(uuid,numeric,text,text,date,text,uuid,uuid,uuid)'::regprocedure";
// Para volver a pegar la migración del módulo sobre la base que ella conocía (todo dentro del ROLLBACK), como hace
// `candado_lider_caja_y_ajuste.mjs` con `cerrar_caja` desde ADR-0186.
const SIN_FIRMAS_F3B = `drop function if exists retail.registrar_nota_credito_compra(uuid,text,date,numeric,text,text,uuid,text,text,date,text,uuid);
drop function if exists retail.registrar_reembolso_proveedor(uuid,numeric,text,text,date,text,uuid);
drop function if exists retail.fn_insertar_reembolso_proveedor(uuid,numeric,text,text,date,text,uuid,uuid,uuid);`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. El tablero
// ===========================================================================

exito(
  "tablero · faltante cerrado sin nota: sale como «pendiente» con 4 uds y monto_esperado 236.00 (4 × 50 × 1.18)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as cierre \\gset
${fila("c1", "pendiente", "unidades_cerradas, monto_esperado, resuelto, id = :'cierre', cierre_id = :'cierre', serie_numero is null, fecha is null, monto is null, motivo, documento = :'c1_doc', compra_total, compra_saldo")}
rollback;`
  ),
  ["4", "236.00", "t", "t", "t", "t", "t", "t", "faltante", "t", "1416.00", "1416.00"]
);

exito(
  "tablero · si todavía faltan unidades por resolver el pendiente sale igual, pero con resuelto = f",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${recibe("c1_item", 10)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _k \\gset
${fila("c1", "pendiente", "unidades_cerradas, monto_esperado, resuelto")}
rollback;`
  ),
  ["4", "236.00", "f"]
);

// Los dos cierres nacen en la MISMA transacción, así que comparten `created_at`: el desempate es por
// id, igual que en la función. Por eso se compara contra el último cierre calculado con el mismo
// criterio, no contra «el segundo que escribí».
exito(
  "tablero · dos cierres del mismo comprobante son UNA fila: suma las unidades y apunta al último cierre",
  como(
    FELIPE,
    `${BASE}${compra("c1", { lineas: [14, 10] })}
select (array_agg(id order by cantidad desc))[1] as it1, (array_agg(id order by cantidad desc))[2] as it2 from retail.compra_items where compra_id = :'c1' \\gset
select retail.cerrar_linea_compra(:'it1', 14, 'no_llego') as k1 \\gset
select retail.cerrar_linea_compra(:'it2', 10, 'danada') as k2 \\gset
select ultimo as ultimo_cierre from (
  select k.id as ultimo from retail.compra_item_cierres k join retail.compra_items i on i.id = k.compra_item_id
  where i.compra_id = :'c1' order by k.created_at desc, k.id desc limit 1
) z \\gset
select count(*), max(unidades_cerradas), max(monto_esperado), bool_and(id = :'ultimo_cierre'),
  bool_and(id in (:'k1', :'k2')), bool_and(resuelto), bool_and(cerrado_en is not null)
  from retail.notas_credito_tablero() where compra_id = :'c1' and clase = 'pendiente';
rollback;`
  ),
  ["1", "24", "1416.00", "t", "t", "t", "t"]
);

exito(
  "tablero · al registrar la nota por faltante el pendiente desaparece y queda la nota (a_favor 0.00)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as cierre \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-000018', ${HOY}, 236.00, 'faltante', null, :'cierre') as nc \\gset
select (select count(*) from retail.notas_credito_tablero() where compra_id = :'c1' and clase = 'pendiente'),
  (select count(*) from retail.notas_credito_tablero() where compra_id = :'c1' and clase = 'nota'),
  t.id = :'nc', t.serie_numero, t.monto, t.aplicado, t.a_favor, t.igv, t.motivo, t.unidades_cerradas, t.cierre_id = :'cierre', t.compra_saldo
from retail.notas_credito_tablero() t where t.compra_id = :'c1' and t.clase = 'nota';
rollback;`
  ),
  ["0", "1", "t", "FC01-000018", "236.00", "236.00", "0.00", "36.00", "faltante", "4", "t", "1180.00"]
);

exito(
  "tablero · nota mayor a la deuda: a_favor = monto − aplicado (pagado 1000, nota 416.01 → a favor 0.01)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1000.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-1', ${HOY}, 416.01, 'descuento') as _n \\gset
${fila("c1", "nota", "monto, aplicado, a_favor, compra_saldo, proveedor_nombre, compra_estado")}
rollback;`
  ),
  ["416.01", "416.00", "0.01", "0.00", "Textiles Andina SAC", "vigente"]
);

exito(
  "tablero · una nota que NO es por faltante no tapa el pendiente del mismo comprobante (salen las dos filas)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${recibe("c1_item", 20)}
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _k \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-9', ${HOY}, 100.00, 'descuento') as _n \\gset
select count(*) filter (where clase = 'pendiente'), count(*) filter (where clase = 'nota')
  from retail.notas_credito_tablero() where compra_id = :'c1';
rollback;`
  ),
  ["1", "1"]
);

// Un comprobante con faltantes cerrados NO se puede anular (la base lo impide), así que un
// «pendiente» del tablero siempre es de una factura vigente. Se prueban las dos mitades: que la base
// lo impida, y que una factura anulada no asome por ningún lado del tablero.
error(
  "tablero · un comprobante con faltantes cerrados no se puede anular: el pendiente nunca queda huérfano",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.cerrar_linea_compra(:'c1_item', 24, 'no_llego') as _k \\gset
select retail.anular_compra(:'c1', 'prueba');`
  ),
  "líneas cerradas por faltante: no se puede anular"
);

exito(
  "tablero · una factura anulada no aparece ni como pendiente ni como nota",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.anular_compra(:'c1', 'prueba') as _a \\gset
select (select estado from retail.compras where id = :'c1'),
  (select count(*) from retail.notas_credito_tablero() where compra_id = :'c1');
rollback;`
  ),
  ["anulada", "0"]
);

// ===========================================================================
// 2. Permisos (ADR-0126)
// ===========================================================================

error(
  "permisos · Micaela (integrante) no puede leer el tablero",
  como(FELIPE, `${BASE}${cambiaA(MICAELA)}${COMO_AUTENTICADO}select * from retail.notas_credito_tablero();`),
  "puede ver las notas de crédito de proveedores"
);

error(
  "permisos · Micaela no puede buscar facturas para la nota",
  como(FELIPE, `${BASE}${cambiaA(MICAELA)}${COMO_AUTENTICADO}select * from retail.fn_facturas_para_nota_credito('TST');`),
  "puede ver las facturas de proveedores"
);

error(
  "permisos · Micaela no puede registrar una nota de crédito",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${cambiaA(MICAELA)}${COMO_AUTENTICADO}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-1', ${HOY}, 100.00, 'descuento');`
  ),
  "Registrar notas de crédito de proveedores necesita el módulo Notas de crédito" // ADR-0161 P1 (20260923140000)
);

error(
  "permisos · Micaela no puede adjuntar el PDF de una nota",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${cambiaA(MICAELA)}${COMO_AUTENTICADO}
select retail.registrar_adjunto_compra(:'c1', :'c1' || '/nota.pdf', 'nota.pdf', 'application/pdf', 1000);`
  ),
  "Adjuntar documentos necesita el módulo Facturas de compra" // ADR-0161 P1 (20260923140000)
);

exito(
  "permisos · `anon` no tiene EXECUTE en ninguna de las funciones nuevas o tocadas",
  `select has_function_privilege('anon', ${FIRMA_TABLERO}, 'execute'),
     has_function_privilege('anon', ${FIRMA_FACTURAS}, 'execute'),
     has_function_privilege('anon', ${FIRMA_NOTA}, 'execute'),
     has_function_privilege('anon', ${FIRMA_ADJUNTO}, 'execute'),
     has_function_privilege('anon', ${FIRMA_REEMBOLSO}, 'execute'),
     has_function_privilege('anon', ${FIRMA_INSERTAR_REEMBOLSO}, 'execute'),
     has_function_privilege('authenticated', ${FIRMA_INSERTAR_REEMBOLSO}, 'execute');`,
  ["f", "f", "f", "f", "f", "f", "f"]
);

exito(
  "permisos · `authenticated` sí tiene EXECUTE en las tres funciones del módulo",
  `select has_function_privilege('authenticated', ${FIRMA_TABLERO}, 'execute'),
     has_function_privilege('authenticated', ${FIRMA_FACTURAS}, 'execute'),
     has_function_privilege('authenticated', ${FIRMA_NOTA}, 'execute'),
     has_function_privilege('authenticated', ${FIRMA_ADJUNTO}, 'execute');`,
  ["t", "t", "t", "t"]
);

// ===========================================================================
// 3. Destino «a_favor»: byte a byte lo de hoy
// ===========================================================================

exito(
  "destino a_favor · deja EXACTAMENTE el mismo estado que la RPC de hoy (saldo, nota y saldo a favor)",
  como(
    FELIPE,
    `${BASE}${RPC_VIEJA}${compra("a", { prov: "prov1" })}${compra("b", { prov: "prov2" })}
select retail.registrar_pago_compra(:'a', 1000.00, 'transferencia') as _pa \\gset
select retail.registrar_pago_compra(:'b', 1000.00, 'transferencia') as _pb \\gset
select retail.registrar_nota_credito_compra_vieja(:'a', 'FC01-7', ${HOY}, 500.00, 'descuento', 'igual') as na \\gset
select retail.registrar_nota_credito_compra(:'b', 'FC01-7', ${HOY}, 500.00, 'descuento', 'igual', null, 'a_favor') as nb \\gset
select (select saldo from retail.compras where id = :'a') = (select saldo from retail.compras where id = :'b'),
  (select notas_credito from retail.compras where id = :'a') = (select notas_credito from retail.compras where id = :'b'),
  (select (subtotal, igv, monto, aplicado, motivo, nota, serie_numero, fecha, cierre_id) from retail.compra_notas_credito where id = :'na')
    is not distinct from
  (select (subtotal, igv, monto, aplicado, motivo, nota, serie_numero, fecha, cierre_id) from retail.compra_notas_credito where id = :'nb'),
  retail.fn_saldo_favor_proveedor(:'prov1') = retail.fn_saldo_favor_proveedor(:'prov2'),
  (select count(*) from retail.proveedor_creditos where nota_credito_id = :'na'),
  (select count(*) from retail.proveedor_creditos where nota_credito_id = :'nb'),
  (select (tipo, monto, metodo, referencia) from retail.proveedor_creditos where nota_credito_id = :'na')::text,
  (select (tipo, monto, metodo, referencia) from retail.proveedor_creditos where nota_credito_id = :'nb')::text;
rollback;`
  ),
  ["t", "t", "t", "t", "1", "1", "(nota_credito,84.00,,)", "(nota_credito,84.00,,)"]
);

exito(
  "destino a_favor · llamarla con 7 argumentos (como hoy) sigue funcionando: el defecto es «queda a favor»",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1400.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-8', ${HOY}, 100.00, 'descuento', null, null) as nc \\gset
select (select monto || '/' || aplicado from retail.compra_notas_credito where id = :'nc'),
  retail.fn_saldo_favor_proveedor(:'prov1'),
  (select count(*) from retail.proveedor_creditos where nota_credito_id = :'nc' and tipo = 'reembolso');
rollback;`
  ),
  ["100.00/16.00", "84.00", "0"]
);

// ===========================================================================
// 4. Destino «reembolso»: nota + devolución en UNA transacción
// ===========================================================================

exito(
  "destino reembolso · factura ya pagada: la nota entera se devuelve y el saldo a favor queda en 0.00",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1416.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-10', ${HOY}, 188.80, 'devolucion', null, null,
  'reembolso', 'transferencia', ${HOY}, 'Op. 00912345') as nc \\gset
select (select monto || '/' || aplicado from retail.compra_notas_credito where id = :'nc'),
  retail.fn_saldo_favor_proveedor(:'prov1'),
  (select count(*) from retail.proveedor_creditos where nota_credito_id = :'nc'),
  (select (tipo, monto, metodo, referencia, fecha = ${HOY}) from retail.proveedor_creditos where nota_credito_id = :'nc' and tipo = 'reembolso')::text,
  (select saldo from retail.compras where id = :'c1');
rollback;`
  ),
  ["188.80/0.00", "0.00", "2", "(reembolso,188.80,transferencia,\"Op. 00912345\",t)", "0.00"]
);

exito(
  "destino reembolso · mixto: la nota baja la deuda (216) y solo se devuelve el sobrante (84)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1200.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-11', ${HOY}, 300.00, 'descuento', null, null,
  'reembolso', 'yape') as nc \\gset
select (select monto || '/' || aplicado from retail.compra_notas_credito where id = :'nc'),
  (select saldo || '/' || notas_credito from retail.compras where id = :'c1'),
  (select monto from retail.proveedor_creditos where nota_credito_id = :'nc' and tipo = 'nota_credito'),
  (select monto from retail.proveedor_creditos where nota_credito_id = :'nc' and tipo = 'reembolso'),
  retail.fn_saldo_favor_proveedor(:'prov1');
rollback;`
  ),
  ["300.00/216.00", "0.00/216.00", "84.00", "84.00", "0.00"]
);

exito(
  "destino reembolso · el N.° de operación es opcional y la fecha por defecto es hoy (Lima)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1416.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-12', ${HOY}, 50.00, 'devolucion', null, null,
  'reembolso', 'efectivo') as nc \\gset
select referencia is null, fecha = ${HOY}, metodo from retail.proveedor_creditos where nota_credito_id = :'nc' and tipo = 'reembolso';
rollback;`
  ),
  ["t", "t", "efectivo"]
);

exito(
  "destino reembolso · el movimiento queda enganchado a SU nota (fn_proveedor_creditos muestra la serie)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1416.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-13', ${HOY}, 60.00, 'devolucion', null, null,
  'reembolso', 'plin') as nc \\gset
select tipo, nota_serie_numero, monto from retail.fn_proveedor_creditos(:'prov1', 10) where tipo = 'reembolso';
rollback;`
  ),
  ["reembolso", "FC01-13", "60.00"]
);

error(
  "destino reembolso · sin sobrante (la nota solo baja la deuda) se rechaza con un mensaje claro",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-14', ${HOY}, 236.00, 'descuento', null, null, 'reembolso', 'transferencia');`
  ),
  "no sobra nada que el proveedor pueda devolver"
);

exito(
  "destino reembolso · tras ese error NO queda ni la nota ni el movimiento (todo o nada)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
do $t$
declare v_msg text;
begin
  begin
    perform retail.registrar_nota_credito_compra(current_setting('t.compra')::uuid, 'FC01-15', retail.fn_hoy_lima(), 236.00, 'descuento', null, null, 'reembolso', 'transferencia');
  exception when others then
    v_msg := sqlerrm;
  end;
  perform set_config('t.msg', coalesce(v_msg, '(sin error)'), true);
end
$t$;
select current_setting('t.msg') like '%no sobra nada%',
  (select count(*) from retail.compra_notas_credito where compra_id = :'c1'),
  (select count(*) from retail.proveedor_creditos where proveedor_id = :'prov1'),
  (select notas_credito || '/' || saldo from retail.compras where id = :'c1');
rollback;`.replace("do $t$", "select set_config('t.compra', :'c1', true) as _s \\gset\ndo $t$")
  ),
  ["t", "0", "0", "0.00/1416.00"]
);

error(
  "destino inválido · «devolver» no existe (solo a_favor o reembolso)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-16', ${HOY}, 100.00, 'descuento', null, null, 'devolver');`
  ),
  "Destino del dinero de la nota no reconocido"
);

error(
  "destino inválido · cadena vacía se rechaza igual",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-17', ${HOY}, 100.00, 'descuento', null, null, '');`
  ),
  "Destino del dinero de la nota no reconocido"
);

error(
  "destino reembolso · fecha de la devolución futura se rechaza",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1416.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-18', ${HOY}, 50.00, 'devolucion', null, null,
  'reembolso', 'transferencia', ${HOY} + 1);`
  ),
  "no puede ser futura"
);

error(
  "destino reembolso · fecha de la devolución anterior a la nota se rechaza",
  como(
    FELIPE,
    `${BASE}${compra("c1", { emision: `${HOY} - 20` })}
select retail.registrar_pago_compra(:'c1', 1416.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-19', ${HOY} - 3, 50.00, 'devolucion', null, null,
  'reembolso', 'transferencia', ${HOY} - 5);`
  ),
  "no puede ser anterior a la de la nota de crédito"
);

error(
  "destino reembolso · sin medio de devolución se rechaza (no se registra plata sin decir cómo llegó)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1416.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-20', ${HOY}, 50.00, 'devolucion', null, null, 'reembolso');`
  ),
  "Medio de devolución no reconocido"
);

exito(
  "reembolso suelto · `registrar_reembolso_proveedor` sigue funcionando igual tras mudarse al helper",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1416.00, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-21', ${HOY}, 100.00, 'devolucion') as _n \\gset
select retail.registrar_reembolso_proveedor(:'prov1', 40.00, 'transferencia', 'Op. 1', ${HOY}, 'parcial') as r \\gset
select retail.fn_saldo_favor_proveedor(:'prov1'),
  (select (tipo, monto, metodo, referencia, nota, nota_credito_id is null) from retail.proveedor_creditos where id = :'r')::text;
rollback;`
  ),
  ["60.00", "(reembolso,40.00,transferencia,\"Op. 1\",parcial,t)"]
);

error(
  "reembolso suelto · sigue sin poder pasarse del saldo a favor",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_reembolso_proveedor(:'prov1', 10.00, 'transferencia');`
  ),
  "El saldo a favor con este proveedor es S/ 0.00"
);

// ===========================================================================
// 5. El buscador de facturas
// ===========================================================================

const BUSCA = (texto, extra = "null, 'todas', 200") =>
  `select exists (select 1 from retail.fn_facturas_para_nota_credito(${texto}, ${extra}) where id = :'c1');`;

exito(
  "buscador · encuentra por documento, por nombre del proveedor y por RUC",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select exists (select 1 from retail.fn_facturas_para_nota_credito(:'c1_doc', null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('Textiles Andina', null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito((select ruc from retail.proveedores where id = :'prov1'), null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('Confecciones del Sur', null, 'todas', 200) where id = :'c1');
rollback;`
  ),
  ["t", "t", "t", "f"]
);

exito(
  "buscador · encuentra por MONTO: 1416, 1,416, 1416.00, S/ 1,416.00 y el prefijo 141",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select exists (select 1 from retail.fn_facturas_para_nota_credito('1416', null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('1,416', null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('1416.00', null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('S/ 1,416.00', null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('141', null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('9999999', null, 'todas', 200) where id = :'c1');
rollback;`
  ),
  ["t", "t", "t", "t", "t", "f"]
);

exito(
  "buscador · encuentra también por el SALDO (pagado 1200 de 1416 → «216» la trae)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_pago_compra(:'c1', 1200.00, 'transferencia') as _p \\gset
select exists (select 1 from retail.fn_facturas_para_nota_credito('216', null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('216.00', null, 'todas', 200) where id = :'c1');
rollback;`
  ),
  ["t", "t"]
);

exito(
  "buscador · los tres filtros: con_saldo trae la que debe, pagadas la saldada, todas las dos",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_pago_compra(:'c2', 1416.00, 'transferencia') as _p \\gset
select exists (select 1 from retail.fn_facturas_para_nota_credito('TST', null, 'con_saldo', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('TST', null, 'con_saldo', 200) where id = :'c2'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('TST', null, 'pagadas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('TST', null, 'pagadas', 200) where id = :'c2'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('TST', null, 'todas', 200) where id = :'c1'),
  exists (select 1 from retail.fn_facturas_para_nota_credito('TST', null, 'todas', 200) where id = :'c2');
rollback;`
  ),
  ["t", "f", "f", "t", "t", "t"]
);

exito(
  "buscador · filtra por proveedor, devuelve el estado de pago y las notas ya emitidas",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-22', ${HOY}, 100.00, 'descuento') as _n \\gset
select f.estado, f.tiene_nota, f.notas_monto, f.total, f.pagado, f.saldo, f.proveedor_nombre,
  exists (select 1 from retail.fn_facturas_para_nota_credito(:'c1_doc', :'prov2', 'todas', 200) where id = :'c1')
from retail.fn_facturas_para_nota_credito(:'c1_doc', :'prov1', 'todas', 200) f where f.id = :'c1';
rollback;`
  ),
  ["pendiente", "t", "100.00", "1416.00", "0.00", "1316.00", "Textiles Andina SAC", "f"]
);

exito(
  "buscador · una factura anulada no aparece (no acepta notas de crédito)",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select exists (select 1 from retail.fn_facturas_para_nota_credito(:'c1_doc', null, 'todas', 200) where id = :'c1') as antes \\gset
select retail.anular_compra(:'c1', 'prueba') as _a \\gset
select :'antes', exists (select 1 from retail.fn_facturas_para_nota_credito(:'c1_doc', null, 'todas', 200) where id = :'c1');
rollback;`
  ),
  ["t", "f"]
);

exito(
  "buscador · sin texto devuelve las últimas facturas, ordenadas por emisión descendente",
  como(
    FELIPE,
    `${BASE}
select bool_and(ordenada) from (
  select fecha_emision <= lag(fecha_emision) over (order by ord) as ordenada
  from (select fecha_emision, row_number() over () as ord from retail.fn_facturas_para_nota_credito(null, null, 'todas', 50)) x
) y where ordenada is not null;
rollback;`
  ),
  ["t"]
);

error(
  "buscador · filtro desconocido se rechaza",
  como(FELIPE, `${BASE}select * from retail.fn_facturas_para_nota_credito('TST', null, 'vencidas', 20);`),
  "Filtro de búsqueda no reconocido"
);

// ===========================================================================
// 6. El adjunto de la nota (D5)
// ===========================================================================

exito(
  "adjunto · el PDF se guarda colgado de SU nota, y sin nota_credito_id sigue colgando del comprobante",
  como(
    FELIPE,
    `${BASE}${compra("c1")}
select retail.registrar_nota_credito_compra(:'c1', 'FC01-23', ${HOY}, 100.00, 'descuento') as nc \\gset
select retail.registrar_adjunto_compra(:'c1', :'c1' || '/nota.pdf', 'nota.pdf', 'application/pdf', 2048, :'nc') as a1 \\gset
select retail.registrar_adjunto_compra(:'c1', :'c1' || '/factura.pdf', 'factura.pdf', 'application/pdf', 2048) as a2 \\gset
select (select nota_credito_id = :'nc' from retail.compra_adjuntos where id = :'a1'),
  (select nota_credito_id is null from retail.compra_adjuntos where id = :'a2');
rollback;`
  ),
  ["t", "t"]
);

error(
  "adjunto · una nota de OTRA factura se rechaza con mensaje claro",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_nota_credito_compra(:'c2', 'FC01-24', ${HOY}, 100.00, 'descuento') as nc2 \\gset
select retail.registrar_adjunto_compra(:'c1', :'c1' || '/nota.pdf', 'nota.pdf', 'application/pdf', 2048, :'nc2');`
  ),
  "no es de la factura"
);

error(
  "adjunto · la FK compuesta lo vuelve a impedir aunque se escriba la tabla directo",
  como(
    FELIPE,
    `${BASE}${compra("c1")}${compra("c2")}
select retail.registrar_nota_credito_compra(:'c2', 'FC01-25', ${HOY}, 100.00, 'descuento') as nc2 \\gset
insert into retail.compra_adjuntos (compra_id, ruta, nombre, tipo, bytes, nota_credito_id)
  values (:'c1', :'c1' || '/x.pdf', 'x.pdf', 'application/pdf', 100, :'nc2');`
  ),
  "compra_adjuntos_nota_de_su_compra"
);

// ===========================================================================
// 7. Firmas únicas y migración re-ejecutable
// ===========================================================================

exito(
  "firmas · una sola de cada función tocada (ADR-0009), y las de siempre conservan security definer",
  `select (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_nota_credito_compra'),
     (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_reembolso_proveedor'),
     (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_insertar_reembolso_proveedor'),
     (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrar_adjunto_compra'),
     (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'notas_credito_tablero'),
     (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_facturas_para_nota_credito'),
     (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_insertar_nota_credito_compra'),
     (select bool_and(prosecdef) from pg_proc where pronamespace = 'retail'::regnamespace
        and proname in ('registrar_nota_credito_compra', 'registrar_reembolso_proveedor', 'fn_insertar_reembolso_proveedor',
                        'registrar_adjunto_compra', 'notas_credito_tablero', 'fn_facturas_para_nota_credito')),
     (select bool_and(proconfig @> array['search_path=retail, public, extensions']) from pg_proc where pronamespace = 'retail'::regnamespace
        and proname in ('registrar_nota_credito_compra', 'fn_insertar_reembolso_proveedor', 'notas_credito_tablero', 'fn_facturas_para_nota_credito'));`,
  ["1", "1", "1", "1", "1", "1", "1", "t", "t"]
);

exito(
  "migración · pegarla dos veces deja exactamente lo mismo (mismos md5, una sola firma, un solo índice)",
  `begin;
${SIN_FIRMAS_F3B}
${MIGRACION}
select md5(pg_get_functiondef(${FIRMA_NOTA_ORIGINAL})) as m1 \\gset
select md5(pg_get_functiondef(${FIRMA_TABLERO})) as t1 \\gset
select md5(pg_get_functiondef(${FIRMA_FACTURAS})) as f1 \\gset
${MIGRACION}
select :'m1' = md5(pg_get_functiondef(${FIRMA_NOTA_ORIGINAL})),
  :'t1' = md5(pg_get_functiondef(${FIRMA_TABLERO})),
  :'f1' = md5(pg_get_functiondef(${FIRMA_FACTURAS})),
  (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('registrar_nota_credito_compra', 'notas_credito_tablero', 'fn_facturas_para_nota_credito', 'registrar_adjunto_compra', 'fn_insertar_reembolso_proveedor')),
  (select count(*) from pg_constraint where conname = 'compra_adjuntos_nota_de_su_compra'),
  (select count(*) from pg_constraint where conname = 'compra_notas_credito_id_compra_key'),
  (select count(*) from pg_class where relname = 'compra_adjuntos_nota_credito_idx');
rollback;`,
  ["t", "t", "t", "5", "1", "1", "1"]
);

// ---------------------------------------------------------------------------

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
