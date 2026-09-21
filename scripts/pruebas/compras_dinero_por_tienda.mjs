#!/usr/bin/env node
/**
 * Pruebas de la LECTURA por tienda del dinero de Compras (ADR-0151, F1 paso 2) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. Que un comprador de tienda lea el dinero de las facturas de SU tienda y de ninguna otra, y que
 * abrir esa puerta no deje escapar nada más:
 *   · un comprador ve una factura solo si TODA ella va a tiendas suyas: la de su tienda sí; la de otra no; la
 *     repartida con una tienda que no es suya tampoco (se abre en F2/F3). Da igual en qué sede esté FIJO:
 *     Micaela está fija en Trujillo y comprando para Lima no ve Trujillo;
 *   · lo mismo en las 5 tablas (`compras`, `compra_items`, `compra_pagos`, `compra_adjuntos`,
 *     `compra_notas_credito`), en el bucket de escaneos (por la carpeta `<compra_id>/`) y en la vista `compras_resumen`;
 *   · las 5 funciones de indicadores le suman SOLO lo suyo (la deuda de una factura de otra tienda no la mueve);
 *   · escribir sigue siendo solo del líder (registrar, pagar) y las notas de crédito también: no filtran por tienda;
 *   · el líder ve exactamente lo de siempre; un integrante sin fila, nada; un colaborador quitado o una tienda
 *     inactiva, nada;
 *   · `fn_aplicar_candado_de_dinero` repone el filtro por tienda si otra migración recrea una función con el viejo;
 *   · las migraciones se pueden pegar dos veces.
 *
 * CÓMO. Mismo patrón que `dinero_compras_solo_lider.mjs`: cada escenario en su transacción con ROLLBACK, las
 * facturas se crean DENTRO con la RPC real, y las migraciones se cargan dentro de cada escenario (re-pegables),
 * así se prueban sin aplicarlas a la base compartida. `set local role authenticated` para que RLS aplique de verdad.
 *
 * USO   pnpm pruebas:compras-dinero-por-tienda
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
const PRELUDIO = `${M1}\n${M2}`;

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

const esperar = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
// El Postgres local lo usan ~20 sesiones a la vez y estas migraciones hacen DDL sobre tablas de Compras: un
// deadlock con el trabajo de otra sesión no es un fallo del escenario, se reintenta.
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

/** Abre la transacción, carga las dos migraciones y se pone como esa persona. Termina en ROLLBACK. */
const como = (authUserId, sql) => `
begin;
${PRELUDIO}
create temp table nombres_ubic as select id, nombre from retail.ubicaciones;
grant select on nombres_ubic to authenticated, anon;
set local request.jwt.claim.sub = '${authUserId}';
set local request.jwt.claim.role = 'authenticated';
${sql}
rollback;
`;
const cambiaA = (authUserId) => `set local request.jwt.claim.sub = '${authUserId}';\n`;
const COMO_AUTENTICADO = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
/** De vuelta a superusuario y de líder, para crear más facturas en medio de un escenario. */
const COMO_FELIPE = `${COMO_POSTGRES}${cambiaA(FELIPE)}`;
/** De vuelta a autenticado y de Micaela. */
const COMO_MICAELA = `${cambiaA(MICAELA)}${COMO_AUTENTICADO}`;

const BASE = `
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

/**
 * Crea una factura a crédito con la RPC real: 24 u × S/ 50 + IGV 18 % = S/ 1,416.00. `dest` es el reparto
 * { lima: 24 } o { lima: 12, trujillo: 12 }. Deja `:v` (la factura) y `:v_l1` (su línea).
 */
function compra(v, dest) {
  const partes = Object.entries(dest)
    .map(([ub, c]) => `jsonb_build_object('ubicacion_id', :'${ub}', 'cantidad', ${c})`)
    .join(", ");
  const destino = Object.keys(dest)[0];
  return `
select retail.registrar_compra(:'prov1', 'TST', 'N' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${destino}',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'descripcion', 'L1', 'cantidad', 24, 'costo_unitario', 50,
    'destinos', jsonb_build_array(${partes}))),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as ${v} \\gset
select id as ${v}_l1 from retail.compra_items where compra_id = :'${v}' and descripcion = 'L1' \\gset
`;
}

/** Cuatro facturas: una para Trujillo, una para el Taller, una para Lima y una repartida Lima+Trujillo. Como Felipe. */
const ESCENA = `${BASE}${compra("c1", { trujillo: 24 })}${compra("c2", { taller: 24 })}${compra("c3", { lima: 24 })}${compra("c4", { lima: 12, trujillo: 12 })}`;

/** Le da a Micaela el permiso de comprar para esas tiendas (como Felipe, por la RPC). */
const COMPRADORA_DE = (...tiendas) => `${tiendas.map((t) => `select retail.agregar_comprador_de_tienda(:'micaela', :'${t}');`).join("\n")}\n`;

/** Con dinero en la factura de Lima (c3): un pago, una nota de crédito, un escaneo de esa factura y otro de Trujillo. */
const CON_DINERO = `select retail.registrar_pago_compra(:'c3', 100, 'transferencia') as _p \\gset
select retail.registrar_nota_credito_compra(:'c3', 'FC01-9', retail.fn_hoy_lima(), 10.00, 'descuento') as _n \\gset
select retail.registrar_adjunto_compra(:'c3', :'c3' || '/c3.pdf', 'c3.pdf', 'application/pdf', 1000) as _a \\gset
select retail.registrar_adjunto_compra(:'c1', :'c1' || '/c1.pdf', 'c1.pdf', 'application/pdf', 1000) as _b \\gset
insert into storage.objects (bucket_id, name) values ('retail-compras-adjuntos', :'c3' || '/c3.pdf'), ('retail-compras-adjuntos', :'c1' || '/c1.pdf'), ('retail-compras-adjuntos', 'prueba/suelto.pdf');
`;

/** Cuáles de mis cuatro facturas veo (c1..c4 en orden), o «-» si ninguna. */
const VEO = `(select coalesce(nullif(string_agg(x.n, '' order by x.n), ''), '-') from (
  select 'c1' as n, id from retail.compras where id = :'c1'
  union all select 'c2', id from retail.compras where id = :'c2'
  union all select 'c3', id from retail.compras where id = :'c3'
  union all select 'c4', id from retail.compras where id = :'c4') x)`;

const CASOS = [];
const exito = (nombre, sql, esperado, verifica) => CASOS.push({ nombre, tipo: "exito", sql, esperado, verifica });
const error = (nombre, sql, contiene) => CASOS.push({ nombre, tipo: "error", sql, contiene });

// ===========================================================================
// 1. Qué facturas ve un comprador
// ===========================================================================

exito(
  "comprador de Lima (fijo en Trujillo): ve SOLO la factura de Lima — no la de Trujillo (su sede), ni la del Taller, ni la repartida con Trujillo",
  como(FELIPE, `${ESCENA}${COMPRADORA_DE("lima")}${COMO_MICAELA}select ${VEO};`),
  ["c3"]
);

exito(
  "comprador de Lima y Taller: ve las dos suyas (c2, c3); la de Trujillo y la repartida siguen cerradas",
  como(FELIPE, `${ESCENA}${COMPRADORA_DE("lima", "taller")}${COMO_MICAELA}select ${VEO};`),
  ["c2c3"]
);

exito(
  "comprador de Lima y Trujillo: además ve la repartida Lima+Trujillo (c4), porque TODA ella va a tiendas suyas",
  como(FELIPE, `${ESCENA}${COMPRADORA_DE("lima", "trujillo")}${COMO_MICAELA}select ${VEO};`),
  ["c1c3c4"]
);

exito(
  "integrante sin fila de comprador: no ve ninguna (ADR-0126 sigue en pie)",
  como(FELIPE, `${ESCENA}${COMO_MICAELA}select ${VEO};`),
  ["-"]
);

exito(
  "líder: ve las cuatro, como siempre",
  como(FELIPE, `${ESCENA}${COMO_AUTENTICADO}select ${VEO};`),
  ["c1c2c3c4"]
);

exito(
  "una fila de alguien que ya no es colaborador no da acceso al dinero",
  como(FELIPE, `${ESCENA}${COMPRADORA_DE("lima")}delete from retail.colaboradores where persona_id = :'micaela';\n${COMO_MICAELA}select ${VEO};`),
  ["-"]
);

exito(
  "una tienda desactivada deja de dar acceso a sus facturas",
  como(FELIPE, `${ESCENA}${COMPRADORA_DE("lima")}update retail.ubicaciones set activo = false where id = :'lima';\n${COMO_MICAELA}select ${VEO};`),
  ["-"]
);

// ===========================================================================
// 2. Todo lo que cuelga de la factura hereda el mismo filtro
// ===========================================================================

exito(
  "líneas, pagos, notas de crédito y escaneos: el comprador de Lima ve los de c3 (1 de cada uno) y nada de c1",
  como(
    FELIPE,
    `${ESCENA}${CON_DINERO}${COMPRADORA_DE("lima")}${COMO_MICAELA}select
  (select count(*) from retail.compra_items where compra_id = :'c3'),
  (select count(*) from retail.compra_items where compra_id = :'c1'),
  (select count(*) from retail.compra_pagos where compra_id = :'c3'),
  (select count(*) from retail.compra_notas_credito where compra_id = :'c3'),
  (select count(*) from retail.compra_adjuntos where compra_id = :'c3'),
  (select count(*) from retail.compra_adjuntos where compra_id = :'c1');`
  ),
  ["1", "0", "1", "1", "1", "0"]
);

exito(
  "el comprador del Taller NO ve el pago, la nota ni el escaneo de la factura de Lima",
  como(
    FELIPE,
    `${ESCENA}${CON_DINERO}${COMPRADORA_DE("taller")}${COMO_MICAELA}select
  (select count(*) from retail.compra_pagos where compra_id = :'c3'),
  (select count(*) from retail.compra_notas_credito where compra_id = :'c3'),
  (select count(*) from retail.compra_adjuntos where compra_id = :'c3');`
  ),
  ["0", "0", "0"]
);

exito(
  "el bucket de escaneos: el comprador de Lima lista el archivo de SU factura, no el de Trujillo ni uno suelto sin carpeta de factura",
  como(
    FELIPE,
    `${ESCENA}${CON_DINERO}${COMPRADORA_DE("lima")}${COMO_MICAELA}select
  (select count(*) from storage.objects where bucket_id = 'retail-compras-adjuntos' and name = :'c3' || '/c3.pdf'),
  (select count(*) from storage.objects where bucket_id = 'retail-compras-adjuntos' and name = :'c1' || '/c1.pdf'),
  (select count(*) from storage.objects where bucket_id = 'retail-compras-adjuntos' and name = 'prueba/suelto.pdf');`
  ),
  ["1", "0", "0"]
);

exito(
  "el líder ve los tres escaneos del bucket (incluido el de carpeta suelta)",
  como(
    FELIPE,
    `${ESCENA}${CON_DINERO}${COMO_AUTENTICADO}select count(*) from storage.objects where bucket_id = 'retail-compras-adjuntos' and name in (:'c3' || '/c3.pdf', :'c1' || '/c1.pdf', 'prueba/suelto.pdf');`
  ),
  ["3"]
);

exito(
  "la vista compras_resumen y el reparto: el comprador de Lima (fijo en Trujillo) ve SU factura con su reparto, y solo esa",
  como(
    FELIPE,
    `${ESCENA}${COMPRADORA_DE("lima")}${COMO_MICAELA}select
  (select count(*) from retail.compras_resumen where id in (:'c1', :'c2', :'c3', :'c4')),
  (select count(*) from retail.compras_resumen where id = :'c3'),
  (select count(*) from retail.compra_item_destinos where compra_item_id = :'c3_l1' and ubicacion_id = :'lima');`
  ),
  ["1", "1", "1"]
);

// ===========================================================================
// 3. Las funciones de indicadores suman solo lo suyo
// ===========================================================================

exito(
  "resumen_compras: la deuda del comprador de Lima sube S/ 1,416.00 con una factura de Lima y NO se mueve con las de Trujillo, Taller ni la repartida",
  como(
    FELIPE,
    `${BASE}${compra("c3", { lima: 24 })}${COMPRADORA_DE("lima")}${COMO_MICAELA}select deuda as d0 from retail.resumen_compras() \\gset
${COMO_FELIPE}${compra("c1", { trujillo: 24 })}${compra("c2", { taller: 24 })}${compra("c4", { lima: 12, trujillo: 12 })}${COMO_MICAELA}select deuda as d1 from retail.resumen_compras() \\gset
${COMO_FELIPE}${compra("c5", { lima: 24 })}${COMO_MICAELA}select :d0, (:d1 - :d0)::numeric(12,2), ((select deuda from retail.resumen_compras()) - :d1)::numeric(12,2);`
  ),
  // La base compartida puede traer facturas de otras sesiones: se compara solo por diferencia. Salen d0 | d1-d0 | d2-d1.
  null,
  (c) => c[1] === "0.00" && c[2] === "1416.00"
);

exito(
  "las 5 funciones de indicadores responden al comprador (sin error) y siguen respondiendo al líder",
  como(
    FELIPE,
    `${ESCENA}${COMPRADORA_DE("lima")}${COMO_MICAELA}select count(*) as a from retail.resumen_compras() \\gset
select count(*) as b from retail.resumen_compras_extra() \\gset
select count(*) as c from retail.deuda_por_vencimiento() \\gset
select count(*) as d from retail.salidas_caja_30d() \\gset
select count(*) as e from retail.por_pagar_tramos() \\gset
${cambiaA(FELIPE)}select count(*) as f from retail.resumen_compras() \\gset
select count(*) as g from retail.por_pagar_tramos() \\gset
select :a > 0 and :b > 0 and :c > 0 and :e > 0 and :f > 0 and :g > 0;`
  ),
  ["t"]
);

exito(
  "por_pagar_tramos: con solo la factura de Lima abierta, el comprador de Lima ve una fila que cuadra con lo que ve en compras (no la del Taller)",
  como(
    FELIPE,
    `${BASE}${compra("c3", { lima: 24 })}${compra("c2", { taller: 24 })}${COMPRADORA_DE("lima")}${COMO_MICAELA}select
  (select coalesce(sum(saldo), 0) from retail.compras where estado = 'vigente' and saldo > 0)::numeric(12,2) as suma_rls \\gset
select (select coalesce(sum(saldo), 0) from retail.por_pagar_tramos())::numeric(12,2) = :suma_rls;`
  ),
  null
);

// ===========================================================================
// 4. Lo que sigue cerrado al comprador
// ===========================================================================

exito(
  "las dos puertas: el comprador PASA la de lectura pero NO la de escritura; el integrante sin fila no pasa ninguna",
  como(
    FELIPE,
    `${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}select retail.fn_puede_ver_dinero_de_compras(), retail.fn_puede_registrar_compras(), retail.fn_es_lider();`
  ),
  ["t", "f", "f"]
);

error(
  "un comprador NO paga (escribir sigue siendo del líder hasta F4): registrar_pago_compra falla",
  como(FELIPE, `${ESCENA}${COMPRADORA_DE("lima")}${COMO_MICAELA}select retail.registrar_pago_compra(:'c3', 100, 'transferencia');`),
  "No tienes permiso para registrar pagos a proveedores"
);

error(
  "un comprador NO registra una factura (hasta F3)",
  como(
    FELIPE,
    `${ESCENA}${COMPRADORA_DE("lima")}${COMO_MICAELA}select retail.registrar_compra(:'prov1', 'TST', 'NX1', 'credito', :'lima',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 1, 'costo_unitario', 1)));`
  ),
  "No tienes permiso para registrar compras"
);

error(
  "notas_credito_tablero sigue siendo solo del líder: al comprador le responde «Solo un líder puede ver las notas de crédito de proveedores.»",
  como(FELIPE, `${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}select * from retail.notas_credito_tablero();`),
  "Solo un líder puede ver las notas de crédito de proveedores."
);

error(
  "fn_facturas_para_nota_credito sigue siendo solo del líder",
  como(FELIPE, `${BASE}${COMPRADORA_DE("lima")}${COMO_MICAELA}select * from retail.fn_facturas_para_nota_credito();`),
  "Solo un líder puede ver las facturas de proveedores."
);

exito(
  "las funciones de proveedores no le enseñan dinero al comprador: fn_proveedores le devuelve montos NULL (siguen atados a fn_es_lider)",
  como(FELIPE, `${ESCENA}${COMPRADORA_DE("lima")}${COMO_MICAELA}select count(*) filter (where saldo is not null or total_facturado is not null) from retail.fn_proveedores();`),
  ["0"]
);

exito(
  "recepciones_sin_comprobante: el costo promedio depende de comprar para ESA tienda (el candado apunta a la tienda del ingreso)",
  como(FELIPE, `select position('fn_puede_comprar_en(l.ubicacion_id)' in pg_get_functiondef('retail.recepciones_sin_comprobante(uuid,integer)'::regprocedure)) > 0;`),
  ["t"]
);

// ===========================================================================
// 5. La red de seguridad y las migraciones
// ===========================================================================

exito(
  "fn_aplicar_candado_de_dinero repone el filtro por tienda si otra migración recrea resumen_compras con el filtro viejo por sede",
  como(
    FELIPE,
    `do $$
declare v text;
begin
  v := replace(pg_get_functiondef('retail.resumen_compras()'::regprocedure), 'fn_compra_es_de_mis_tiendas(', 'fn_puede_ver_compra(');
  execute v;
end;
$$;
select position('fn_puede_ver_compra(' in pg_get_functiondef('retail.resumen_compras()'::regprocedure)) > 0 as roto \\gset
select retail.fn_aplicar_candado_de_dinero() as arregladas \\gset
select :'roto', :'arregladas' like '%resumen_compras()%', position('fn_puede_ver_compra(' in pg_get_functiondef('retail.resumen_compras()'::regprocedure)) = 0, retail.fn_aplicar_candado_de_dinero() = '{}';`
  ),
  ["t", "t", "t", "t"]
);

exito(
  "las 5 políticas de lectura y las del reparto quedan con el filtro por tienda",
  como(
    FELIPE,
    `select
  (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('compras','compra_items','compra_pagos','compra_adjuntos','compra_notas_credito') and cmd = 'SELECT' and qual like '%fn_compra_es_de_mis_tiendas%'),
  (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('compra_item_destinos','compra_item_cierres') and qual like '%fn_puede_comprar_en%'),
  (select count(*) from pg_policies where schemaname = 'storage' and policyname = 'retail_compras_adjuntos_select' and qual like '%fn_puede_ver_adjunto_de_compra%');`
  ),
  ["5", "2", "1"]
);

exito(
  "las migraciones se pueden pegar DOS veces sin romper nada (la segunda pasada no arregla nada)",
  `begin;
${PRELUDIO}
${M2}
select retail.fn_aplicar_candado_de_dinero() = '{}';
select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('resumen_compras','resumen_compras_extra','deuda_por_vencimiento','salidas_caja_30d','por_pagar_tramos');
rollback;`,
  ["5"]
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
    } else if (caso.esperado === null) {
      // Escenarios que comparan por diferencia: la propia consulta termina en `t`/`f` o en cifras que se revisan abajo.
      const ultima = resultado.salida.split("\n").filter(Boolean).pop() ?? "";
      const columnas = ultima.split("|");
      const bien = caso.verifica ? caso.verifica(columnas) : columnas.every((c) => c === "t");
      if (!bien) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    salió: ${JSON.stringify(columnas)}`);
      } else {
        console.log(`✓ ${caso.nombre}`);
      }
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
