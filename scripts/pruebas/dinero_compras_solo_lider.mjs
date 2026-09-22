#!/usr/bin/env node
/**
 * Pruebas del cierre «el dinero de Compras es solo del líder» (ADR-0126) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que un integrante (Micaela, fija a Tienda Trujillo) NO pueda enterarse de un solo monto de
 * Compras —ni por una función, ni por una tabla, ni por el bucket de escaneos— y que aun así reciba
 * mercadería como siempre; y que el líder (Felipe) siga viendo exactamente lo mismo:
 *   · las 5 funciones que devolvían dinero con solo el candado de sede ahora fallan para el integrante y
 *     para quien no tiene sesión (42501 «Solo un líder o un rol con Facturas de compra, Por pagar o Notas de crédito
 *     puede ver …»; hasta 20260923110000 decía «Solo un líder puede ver …»). Micaela es Integrante: su rol NO ve ninguno
 *     de esos tres módulos, así que sigue sin ver un monto (la regla nueva la prueba `pnpm pruebas:roles`);
 *   · `listar_compras_operativo` y `lineas_compra_operativo` le dan lo que necesita para recibir —solo su
 *     sede, mismo orden, filtros y cursor que `listar_compras`— sin una sola columna de dinero;
 *   · las tablas `compras`, `compra_items`, `compra_pagos`, `compra_adjuntos`, `compra_notas_credito`, las
 *     dos vistas y la lista `listar_compras` le salen VACÍAS por RLS, y el bucket de escaneos no lo lista;
 *   · el costo promedio de un ingreso sin comprobante le sale NULL (`sin_costo` no);
 *   · recibir (`recibir_envio`) le sigue funcionando con las tablas cerradas;
 *   · las migraciones: la B se niega a correr sin la A, y las dos se pueden pegar dos veces.
 *
 * CÓMO. Mismo patrón que `recibir_envio.mjs` (léelo primero si esto no tiene sentido): cada escenario corre
 * en su propia transacción con ROLLBACK — nunca se commitea nada, corre seguro contra el Postgres local que
 * comparten ~20 worktrees. Simula a Felipe (líder) y a Micaela con `set local request.jwt.claim.sub`; para
 * probar RLS de verdad cambia a `set local role authenticated` (como superusuario RLS no aplica).
 *
 * `--en-seco`: antes de cada escenario carga DENTRO de su transacción las dos migraciones, así se prueban SIN
 * haberlas aplicado a la base compartida. Sin el flag asume que ya están aplicadas.
 *
 * USO
 *   pnpm pruebas:dinero-compras            → migraciones ya aplicadas en el local
 *   pnpm pruebas:dinero-compras --en-seco  → las carga en cada escenario, sin aplicarlas
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
const leer = (f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8");
const SQL_A = leer("20260919160000_dinero_de_compras_lectura_operativa.sql");
const SQL_B = leer("20260919161000_dinero_de_compras_tablas_solo_lider.sql");
// A ENTERA ya no se puede re-pegar encima del reparto por tienda (ADR-0139): su sección 4 recrea las funciones
// operativas de antes, que leían el destino de la factura, y ese destino ya no existe. Las secciones 1-3 (la
// regla, el candado y el costo enmascarado) no dependen de él y siguen siendo re-pegables.
const SQL_A_HASTA_LA_SECCION_3 = SQL_A.slice(0, SQL_A.indexOf("-- 4. Lo que un integrante necesita para RECIBIR"));
const PRELUDIO = EN_SECO ? `${SQL_A}\n${SQL_B}` : "";

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
const COMO_AUTENTICADO = "set local role authenticated;\n";

/** Proveedores, ubicaciones y la variante del seed. */
const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as prov2 from retail.proveedores where nombre = 'Confecciones del Sur EIRL' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

/**
 * Crea un comprobante a crédito con la RPC real. Por defecto: 24 u × S/ 50 + IGV 18 % = S/ 1,416.00.
 * Deja `:v` (el comprobante) y `:v_item` (su línea).
 */
function compra(v, { prov = "prov1", destino = "trujillo", lineas = [24], costo = 50 } = {}) {
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

/** Cuatro comprobantes: dos para Trujillo (de proveedores distintos), uno para Taller y uno para Lima. */
const ESCENA = `${BASE}${compra("c1", { prov: "prov1", destino: "trujillo" })}${compra("c2", { prov: "prov2", destino: "trujillo" })}${compra("c3", { prov: "prov1", destino: "taller" })}${compra("c4", { prov: "prov2", destino: "lima" })}`;

const LAS_CINCO = [
  ["resumen_compras()", "las cifras de dinero de Compras"],
  ["resumen_compras_extra()", "las cifras de dinero de Compras"],
  ["deuda_por_vencimiento()", "la deuda por vencimiento"],
  ["salidas_caja_30d()", "las salidas de caja de Compras"],
  ["por_pagar_tramos()", "lo que hay por pagar"],
];

/** Los nombres de las cinco, para las consultas de catálogo. */
const CINCO = "'resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos'";

/**
 * Deja las cinco SIN el candado, como llegan de producción o después de que otra migración las recrea:
 * lee la definición vigente y le quita las dos líneas que inyecta `fn_aplicar_candado_de_dinero`. Sirve para
 * probar el camino de INYECCIÓN de verdad (si ya estuvieran guardadas, la rutina no haría nada y la prueba
 * pasaría sin probar nada).
 */
const QUITAR_CANDADO = `
do $$
declare f record; v text;
begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in (${CINCO}) loop
    v := pg_get_functiondef(f.oid);
    v := regexp_replace(v, '\\n  -- CANDADO \\(ADR-\\d+\\).*\\n  (select|perform) retail\\.fn_exige_dinero_de_compras\\(.*\\);', '', 'n');
    execute v;
  end loop;
end;
$$;
`;

/** Cuántas firmas de las cinco NO llevan el candado en este momento. */
const SIN_CANDADO = `(select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in (${CINCO}) and pg_get_functiondef(p.oid) not like '%fn_exige_dinero_de_compras%')`;

/** Falla si alguna de las cinco deja pasar a Micaela; si todas la rechazan con 42501, deja un `select 'ok'`. */
const TODAS_RECHAZAN_A_MICAELA = `${cambiaA(MICAELA)}do $$
declare n integer := 0; f text;
begin
  foreach f in array array['resumen_compras()', 'resumen_compras_extra()', 'deuda_por_vencimiento()', 'salidas_caja_30d()', 'por_pagar_tramos()'] loop
    begin
      execute 'select * from retail.' || f;
    exception when insufficient_privilege then
      n := n + 1;
    end;
  end loop;
  if n <> 5 then raise exception 'solo % de 5 la rechazaron', n; end if;
end;
$$;
`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, tipo: "exito", sql, esperado });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. Las 5 funciones que devolvían dinero: solo el líder
// ===========================================================================

for (const [fn, que] of LAS_CINCO) {
  // Desde 20260923110000 el mensaje dice también quién más la ve (un rol con Facturas de compra, Por pagar o Notas de crédito).
  error(`integrante: retail.${fn} le responde «… puede ver ${que}.» — ni una cifra`, comoPersona(MICAELA, `select * from retail.${fn};`), `puede ver ${que}.`);
}

exito(
  "sin sesión (auth.uid() nulo): las 5 funciones de dinero fallan con «insufficient_privilege», ninguna devuelve filas",
  comoPersona(
    FELIPE,
    `set local request.jwt.claim.sub = '';
do $$
declare n integer := 0; f text;
begin
  foreach f in array array['resumen_compras()', 'resumen_compras_extra()', 'deuda_por_vencimiento()', 'salidas_caja_30d()', 'por_pagar_tramos()'] loop
    begin
      execute 'select * from retail.' || f;
    exception when insufficient_privilege then
      n := n + 1;
    end;
  end loop;
  if n <> 5 then raise exception 'solo % de 5 fallaron', n; end if;
end;
$$;
select 'ok';
rollback;
`
  ),
  ["ok"]
);

exito(
  "líder: las 5 siguen funcionando y ven el dinero — un comprobante de S/ 1,416.00 mueve la deuda exactamente eso",
  comoPersona(
    FELIPE,
    `${BASE}select deuda as d0 from retail.resumen_compras() \\gset
${compra("c1", { destino: "trujillo" })}
select
  (select count(*) from retail.resumen_compras()),
  (select count(*) from retail.resumen_compras_extra()),
  (select count(*) from retail.deuda_por_vencimiento()),
  (select count(*) > 0 from retail.salidas_caja_30d()),
  (select count(*) > 0 from retail.por_pagar_tramos()),
  (select (deuda - :d0)::numeric(12,2) from retail.resumen_compras());
rollback;
`
  ),
  ["1", "1", "4", "t", "t", "1416.00"]
);

exito(
  "ninguna firma de las 5 quedó sin candado, y cada una lo lleva UNA sola vez (nadie lo duplicó ni lo perdió)",
  comoPersona(
    FELIPE,
    `select ${SIN_CANDADO}, count(*) >= 5,
  bool_and((length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), 'fn_exige_dinero_de_compras', ''))) / length('fn_exige_dinero_de_compras') = 1)
from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in (${CINCO});
rollback;
`
  ),
  ["0", "t", "t"]
);

// ===========================================================================
// 2. Lo que un integrante necesita para recibir — sin dinero
// ===========================================================================

exito(
  "integrante: `listar_compras_operativo` le da los comprobantes de SU sede y ninguno de Taller ni Lima",
  comoPersona(
    FELIPE,
    `${ESCENA}${cambiaA(MICAELA)}select
  (select count(*) from retail.listar_compras_operativo(200) where id in (:'c1', :'c2', :'c3', :'c4')),
  (select count(*) from retail.listar_compras_operativo(200) where id in (:'c3', :'c4')),
  (select bool_and(ubicaciones_destino = array[:'trujillo'::uuid]) from retail.listar_compras_operativo(200));
rollback;
`
  ),
  ["2", "0", "t"]
);

exito(
  "líder: la misma función le da los de TODAS las sedes",
  comoPersona(FELIPE, `${ESCENA}select count(*) from retail.listar_compras_operativo(200) where id in (:'c1', :'c2', :'c3', :'c4');\nrollback;\n`),
  ["4"]
);

exito(
  "mismo orden que `listar_compras`: emisión, lo más reciente primero — la pantalla pagina igual",
  comoPersona(
    FELIPE,
    `${ESCENA}create temp table t_ref as
  select id, row_number() over () as rn from retail.listar_compras(p_limite => 200, p_busqueda => 'TST-N') where :'trujillo'::uuid = any(ubicaciones_destino);
${cambiaA(MICAELA)}create temp table t_op as
  select id, row_number() over () as rn from retail.listar_compras_operativo(200, p_busqueda => 'TST-N');
select (select count(*) from t_ref), (select count(*) from t_op), (select bool_and(o.id = r.id) from t_op o join t_ref r using (rn));
rollback;
`
  ),
  ["2", "2", "t"]
);

exito(
  "filtros: por recibir, documento, nombre del proveedor, proveedor, estado de recepción, fechas y tipo dan lo mismo que `listar_compras`",
  comoPersona(
    FELIPE,
    `${ESCENA}select retail.recibir_compras(:'trujillo', ${LISTA(ITEM("c1_item", 10))}, null) as _r \\gset
select documento as c1_doc from retail.compras where id = :'c1' \\gset
${cambiaA(MICAELA)}${(() => {
      const parejas = [
        "p_por_recibir => true",
        "p_busqueda => :'c1_doc'",
        "p_busqueda => 'Andina'",
        "p_busqueda => 'Sur EIRL'",
        "p_proveedor_id => :'prov2'",
        "p_estado_recepcion => 'parcial'",
        "p_estado_recepcion => 'sin_recibir'",
        "p_desde => retail.fn_hoy_lima() + 1",
        "p_hasta => retail.fn_hoy_lima() - 1",
        "p_desde => retail.fn_hoy_lima(), p_hasta => retail.fn_hoy_lima()",
        "p_tipo => 'factura'",
        "p_tipo => 'boleta'",
      ];
      const iguales = parejas.map(
        (p) =>
          `(select count(*) from retail.listar_compras_operativo(200, ${p}) where id in (:'c1', :'c2')) = (select count(*) from retail.listar_compras(p_limite => 200, ${p}) where id in (:'c1', :'c2'))`
      );
      return `select ${iguales.join(",\n  ")};\n`;
    })()}rollback;
`
  ),
  Array(12).fill("t")
);

exito(
  "cursor: la página 2 arranca justo después de la 1, sin repetir ni saltarse un comprobante",
  comoPersona(
    FELIPE,
    `${ESCENA}${compra("c5", { prov: "prov1", destino: "trujillo" })}${compra("c6", { prov: "prov2", destino: "trujillo" })}
${cambiaA(MICAELA)}create temp table p_full as select id, row_number() over () as rn from retail.listar_compras_operativo(200, p_busqueda => 'TST-N');
create temp table p1 as select *, row_number() over () as rn from retail.listar_compras_operativo(2, p_busqueda => 'TST-N');
select fecha_emision as cf, created_at as cc, id as ci from p1 where rn = 2 \\gset
create temp table p2 as select id, row_number() over () as rn
  from retail.listar_compras_operativo(2, p_cursor_fecha => :'cf', p_cursor_creado_en => :'cc', p_cursor_id => :'ci', p_busqueda => 'TST-N');
select (select count(*) from p_full), (select count(*) from p1), (select count(*) from p2),
  (select id from p2 where rn = 1) = (select id from p_full where rn = 3),
  (select id from p2 where rn = 2) = (select id from p_full where rn = 4);
rollback;
`
  ),
  ["4", "3", "2", "t", "t"]
);

exito(
  "lista de permitidos: ninguna de las dos funciones operativas tiene una columna de dinero (subtotal, igv, total, pagado, saldo, notas, banco, cuenta, costo)",
  comoPersona(
    FELIPE,
    `select
  pg_get_function_result('retail.listar_compras_operativo(integer, date, timestamptz, uuid, text, uuid, text, boolean, date, date, text, uuid)'::regprocedure) !~* '(subtotal|igv|total|pagado|saldo|credito|banco|cuenta|costo|monto|precio)',
  pg_get_function_result('retail.lineas_compra_operativo(uuid[], uuid)'::regprocedure) !~* '(subtotal|igv|total|pagado|saldo|credito|banco|cuenta|costo|monto|precio)';
rollback;
`
  ),
  ["t", "t"]
);

exito(
  "líneas: el integrante recibe lo recibido, lo cerrado y lo que falta de SU comprobante — y nada de Taller aunque pida el id",
  comoPersona(
    FELIPE,
    `${ESCENA}select retail.recibir_compras(:'trujillo', ${LISTA(ITEM("c1_item", 10))}, null) as _r \\gset
select retail.cerrar_linea_compra(:'c1_item', 4, 'no_llego') as _k \\gset
${cambiaA(MICAELA)}select
  (select recibido || '/' || cerrado || '/' || pendiente from retail.lineas_compra_operativo(array[:'c1'::uuid])),
  (select recibido || '/' || cerrado || '/' || pendiente from retail.compra_items_resumen where id = :'c1_item'),
  (select count(*) from retail.lineas_compra_operativo(array[:'c1'::uuid, :'c3'::uuid, :'c4'::uuid])),
  (select count(*) from retail.lineas_compra_operativo(array[:'c3'::uuid]));
rollback;
`
  ),
  ["10/4/10", "10/4/10", "1", "0"]
);

exito(
  "sin sesión: las dos funciones operativas devuelven 0 filas (y no fallan)",
  comoPersona(
    FELIPE,
    `${ESCENA}set local request.jwt.claim.sub = '';
select (select count(*) from retail.listar_compras_operativo(200)), (select count(*) from retail.lineas_compra_operativo(array[:'c1'::uuid, :'c3'::uuid]));
rollback;
`
  ),
  ["0", "0"]
);

exito(
  "permisos de ejecución: las 4 funciones nuevas las ejecuta authenticated y NO anon (ni PUBLIC)",
  comoPersona(
    FELIPE,
    `select count(*) filter (where has_function_privilege('anon', p.oid, 'execute')), count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute')), count(*)
from pg_proc p where p.pronamespace = 'retail'::regnamespace
  and p.proname in ('fn_puede_ver_dinero_de_compras', 'fn_exige_dinero_de_compras', 'listar_compras_operativo', 'lineas_compra_operativo');
rollback;
`
  ),
  ["0", "4", "4"]
);

// ===========================================================================
// 3. Las tablas, las vistas y el bucket: vacíos para el integrante (RLS de verdad)
// ===========================================================================

/** Un comprobante con un pago, una nota de crédito y un escaneo, para que TODAS las tablas tengan filas. */
const CON_DINERO_EN_TODAS = `${ESCENA}select retail.registrar_pago_compra(:'c1', 100, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c1', 'FC01-9', retail.fn_hoy_lima(), 10.00, 'descuento') as _n \\gset
select retail.registrar_adjunto_compra(:'c1', :'c1' || '/c1.pdf', 'c1.pdf', 'application/pdf', 1000) as _a \\gset
insert into storage.objects (bucket_id, name) values ('retail-compras-adjuntos', 'prueba/dinero-' || gen_random_uuid() || '.pdf');
`;

exito(
  "integrante (RLS): compras, líneas, pagos, escaneos, notas de crédito, las dos vistas y `listar_compras` le salen VACÍOS — aunque sean de SU sede",
  comoPersona(
    FELIPE,
    `${CON_DINERO_EN_TODAS}${COMO_AUTENTICADO}${cambiaA(MICAELA)}select
  (select count(*) from retail.compras),
  (select count(*) from retail.compra_items),
  (select count(*) from retail.compra_pagos),
  (select count(*) from retail.compra_adjuntos),
  (select count(*) from retail.compra_notas_credito),
  (select count(*) from retail.compras_resumen),
  (select count(*) from retail.compra_items_resumen),
  (select count(*) from retail.listar_compras(p_limite => 200));
rollback;
`
  ),
  Array(8).fill("0")
);

exito(
  "líder (RLS): las mismas tablas y vistas le siguen saliendo completas",
  comoPersona(
    FELIPE,
    `${CON_DINERO_EN_TODAS}${COMO_AUTENTICADO}${cambiaA(FELIPE)}select
  (select count(*) from retail.compras where id in (:'c1', :'c2', :'c3', :'c4')),
  (select count(*) from retail.compra_items where compra_id in (:'c1', :'c2', :'c3', :'c4')),
  (select count(*) from retail.compra_pagos where compra_id = :'c1'),
  (select count(*) from retail.compra_adjuntos where compra_id = :'c1'),
  (select count(*) from retail.compra_notas_credito where compra_id = :'c1'),
  (select count(*) from retail.compras_resumen where id in (:'c1', :'c2', :'c3', :'c4')),
  (select count(*) from retail.listar_compras(p_limite => 200) where id in (:'c1', :'c2', :'c3', :'c4'));
rollback;
`
  ),
  ["4", "4", "1", "1", "1", "4", "4"]
);

exito(
  "bucket de escaneos: el integrante no lista ni un archivo; el líder sí",
  comoPersona(
    FELIPE,
    `${CON_DINERO_EN_TODAS}${COMO_AUTENTICADO}${cambiaA(MICAELA)}select count(*) as m from storage.objects where bucket_id = 'retail-compras-adjuntos' \\gset
${cambiaA(FELIPE)}select :m, (select count(*) > 0 from storage.objects where bucket_id = 'retail-compras-adjuntos');
rollback;
`
  ),
  ["0", "t"]
);

exito(
  "RECIBIR NO SE ROMPE: con las tablas cerradas el integrante sigue recibiendo el comprobante de SU sede con `recibir_envio`",
  comoPersona(
    FELIPE,
    `${ESCENA}${COMO_AUTENTICADO}${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c1_item", 5))}, p_token => gen_random_uuid()) as r \\gset
reset role;
select (:'r'::jsonb ->> 'envio_id') is not null, (select estado_recepcion from retail.compras where id = :'c1'), (select recibido_cantidad from retail.compras where id = :'c1');
rollback;
`
  ),
  ["t", "parcial", "5"]
);

error(
  "RECIBIR NO SE ROMPE (candado de sede): el integrante sigue sin poder recibir un comprobante de Taller",
  comoPersona(FELIPE, `${ESCENA}${COMO_AUTENTICADO}${cambiaA(MICAELA)}select retail.recibir_envio(:'trujillo', ${LISTA(ITEM("c3_item", 5))}, p_token => gen_random_uuid());\n`),
  "no tiene mercadería asignada a esta sede"
);

// ===========================================================================
// 4. El costo de un ingreso sin comprobante también es dinero
// ===========================================================================

const DOS_LOTES_SIN_COMPROBANTE = `${BASE}select retail.recibir_lote(:'trujillo', :'prov1', jsonb_build_array(jsonb_build_object('variante_id', :'var', 'cantidad', 5, 'costo_unitario', 40)), 'GZ-SC-1', null) as l1 \\gset
select retail.recibir_lote(:'trujillo', :'prov1', jsonb_build_array(jsonb_build_object('variante_id', :'var', 'cantidad', 3)), 'GZ-SC-2', null) as l2 \\gset
`;

exito(
  "líder: en «sin comprobante» ve el costo promedio (S/ 40.00) y si un ingreso quedó sin costo",
  comoPersona(
    FELIPE,
    `${DOS_LOTES_SIN_COMPROBANTE}select
  (select costo_unitario_promedio::text from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l1'),
  (select sin_costo from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l1'),
  (select costo_unitario_promedio::text from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l2'),
  (select sin_costo from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l2');
rollback;
`
  ),
  ["40.00", "f", "", "t"]
);

exito(
  "integrante: el costo promedio le sale NULL, pero `sin_costo` (el aviso de que falta el costo) lo sigue viendo",
  comoPersona(
    FELIPE,
    `${DOS_LOTES_SIN_COMPROBANTE}${cambiaA(MICAELA)}select
  (select costo_unitario_promedio is null from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l1'),
  (select sin_costo from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l1'),
  (select costo_unitario_promedio is null from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l2'),
  (select sin_costo from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l2'),
  (select count(*) from retail.recepciones_sin_comprobante(:'taller') where lote_id in (:'l1', :'l2'));
rollback;
`
  ),
  ["t", "f", "t", "t", "0"]
);

// ===========================================================================
// 5. Las migraciones: en orden, y re-pegables
// ===========================================================================

error(
  "la parte B se niega a correr si la A no está: aborta con «Pega primero …» en vez de dejar al integrante sin ver lo que tiene que recibir",
  `begin;\n${SQL_A}\ndrop function retail.lineas_compra_operativo(uuid[]);\n${SQL_B}\n`,
  "Pega primero 20260919160000"
);

exito(
  "las dos migraciones se pueden pegar DOS veces (el SQL Editor no avisa si ya estaban): la segunda no rompe nada",
  `begin;\n${SQL_A}\n${SQL_B}\n${SQL_A}\n${SQL_B}\nselect 'ok';\nrollback;\n`,
  ["ok"]
);

// ===========================================================================
// 6. La inyección del candado: funciona sobre lo que haya en la base, y se puede volver a correr
// ===========================================================================
// La parte A no copia cuerpos: lee la definición vigente y le agrega UNA línea (otra migración en vuelo
// recrea `por_pagar_tramos` con otra firma; en producción se pegan en el orden que toque). Por eso estas
// pruebas primero le QUITAN el candado a las cinco —como llegan de producción— y recién ahí corren la rutina.

exito(
  "inyección: sobre las 5 SIN candado (como llegan de producción) se lo pone a todas, devuelve sus 5 firmas — y Micaela pasa de leer a ser rechazada",
  comoPersona(
    FELIPE,
    `${QUITAR_CANDADO}select ${SIN_CANDADO} as sin_antes \\gset
${cambiaA(MICAELA)}select (select count(*) from retail.resumen_compras()) as m_leia \\gset
${cambiaA(FELIPE)}select cardinality(retail.fn_aplicar_candado_de_dinero()) as n \\gset
${TODAS_RECHAZAN_A_MICAELA}select :sin_antes, :m_leia, :n, ${SIN_CANDADO};
rollback;
`
  ),
  ["5", "1", "5", "0"]
);

exito(
  "inyección con SOBRECARGA: si otra migración deja viva la firma de 4 parámetros de `por_pagar_tramos`, también queda con candado — no se rodea llamando a la vieja",
  comoPersona(
    FELIPE,
    `create or replace function retail.por_pagar_tramos(p_proveedor_id uuid, p_condicion text, p_solo_vencidas boolean, p_busqueda text)
returns table (tramo text, comprobantes integer, saldo numeric)
language sql stable security definer set search_path = retail, public, extensions
as $$ select 'vencidas'::text, 0, 0::numeric $$;
select cardinality(retail.fn_aplicar_candado_de_dinero()) as n \\gset
select :n, ${SIN_CANDADO}, pg_get_functiondef('retail.por_pagar_tramos(uuid, text, boolean, text)'::regprocedure) like '%fn_exige_dinero_de_compras%';
rollback;
`
  ),
  ["1", "0", "t"]
);

exito(
  "inyección idempotente: una segunda pasada no toca nada ({}) y no duplica el candado",
  comoPersona(
    FELIPE,
    `${QUITAR_CANDADO}select cardinality(retail.fn_aplicar_candado_de_dinero()) as a \\gset
select cardinality(retail.fn_aplicar_candado_de_dinero()) as b \\gset
select :a, :b, (select bool_and((length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), 'fn_exige_dinero_de_compras', ''))) / length('fn_exige_dinero_de_compras') = 1)
  from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in (${CINCO}));
rollback;
`
  ),
  ["5", "0", "t"]
);

error(
  "la rutina que ejecuta DDL no la puede llamar la app: un integrante recibe «permission denied»",
  comoPersona(FELIPE, `${COMO_AUTENTICADO}${cambiaA(MICAELA)}select retail.fn_aplicar_candado_de_dinero();`),
  "permission denied"
);

/** Deja `recepciones_sin_comprobante` como estaba en producción: el costo promedio sin envolver. */
const QUITAR_ENMASCARADO = `
do $$
declare v text; o oid;
begin
  select p.oid into strict o from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'recepciones_sin_comprobante';
  v := regexp_replace(pg_get_functiondef(o), 'case when retail\\.fn_puede_ver_dinero_de_compras\\(\\) then\\s+(round\\(.*?\\))\\s+end', '\\1');
  execute v;
end;
$$;
`;

exito(
  "el costo oculto se REAPLICA: si alguien recrea `recepciones_sin_comprobante` sin el enmascarado, volver a pegar la parte A lo deja como antes (el integrante ve NULL)",
  comoPersona(
    FELIPE,
    `${DOS_LOTES_SIN_COMPROBANTE}${QUITAR_ENMASCARADO}${cambiaA(MICAELA)}select costo_unitario_promedio::text as antes from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l1' \\gset
${SQL_A_HASTA_LA_SECCION_3}
${cambiaA(MICAELA)}select :'antes', (select costo_unitario_promedio is null from retail.recepciones_sin_comprobante(:'trujillo') where lote_id = :'l1');
rollback;
`
  ),
  ["40.00", "t"]
);

error(
  "si el cálculo del costo promedio ya no tiene la forma que se revisó, la parte A se DETIENE con un mensaje claro — no adivina ni lo deja a medias",
  comoPersona(
    FELIPE,
    `${QUITAR_ENMASCARADO}
do $$
declare v text; o oid;
begin
  select p.oid into strict o from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'recepciones_sin_comprobante';
  v := regexp_replace(pg_get_functiondef(o), 'round\\(', 'round(0 + ');
  execute v;
end;
$$;
${SQL_A}
`
  ),
  "No encontré el cálculo del costo promedio"
);

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  if (EN_SECO) console.log("Modo --en-seco: las dos migraciones se cargan dentro de cada escenario (no se aplican a la base).\n");

  // Tras el reparto (ADR-0139), A y B son historia ya aplicada: no se re-pegan encima (A recrea funciones que el
  // reparto reemplazó y B exige la firma vieja de `lineas_compra_operativo`). Sus pruebas de orden y de re-pegado
  // solo tienen sentido en una base anterior al reparto.
  const HAY_REPARTO = psql("select to_regclass('retail.compra_item_destinos') is not null;").trim() === "t";
  const SOLO_ANTES_DEL_REPARTO = ["la parte B se niega a correr si la A no está", "las dos migraciones se pueden pegar DOS veces"];
  let saltadas = 0;

  let fallos = 0;
  for (const caso of CASOS) {
    if (HAY_REPARTO && SOLO_ANTES_DEL_REPARTO.some((p) => caso.nombre.startsWith(p))) {
      saltadas++;
      console.log(`↷ (se salta: A y B ya están aplicadas y el reparto reemplazó lo que recrean) ${caso.nombre}`);
      continue;
    }
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

  const corridas = CASOS.length - saltadas;
  console.log(`\n${corridas - fallos}/${corridas} pruebas en verde${saltadas ? ` (${saltadas} se saltan: solo aplican antes del reparto).` : "."}`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
