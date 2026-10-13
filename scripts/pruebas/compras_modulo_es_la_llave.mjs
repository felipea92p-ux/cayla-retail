#!/usr/bin/env node
/**
 * Pruebas de «el módulo es la llave en Compras» (ADR-0387, actividad 1 de la fase 2 de ADR-0362, Felipe 2026-10-12) — migración
 * `20261012202000_compras_el_modulo_es_la_llave.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que en Compras ya no haya un «solo un líder» donde la persona tiene el módulo: quien tiene Facturas de proveedor cambia
 * la tienda que gestiona un comprobante, y quien tiene Recibir ve los costos AL RECIBIR (decisión 18 de ADR-0362) sin que se abra la
 * regla general de la plata de Compras (que también cuida los tableros de Facturas y Por pagar y los costos de Catálogo). Lo del Plan
 * de campaña lo vigila `plan_compra.mjs` (E3, T3, C4) y el costo atípico, `lote_costo_atipico.mjs` y `envio_costo_atipico.mjs`.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga dentro de cada caso, así corre con la base al día o sin
 * ella, y de paso se prueba que se puede pegar dos veces).
 *   G  LA TIENDA GESTORA: Micaela (no es líder) con Facturas de proveedor en su rol pasa el permiso (la compra inventada no existe:
 *      ese es el error que le toca); con un rol sin ese módulo, 42501 que nombra «Facturas de proveedor»; el líder, como siempre.
 *   R  LOS COSTOS AL RECIBIR: `fn_ve_costos_al_recibir()` es verdad con Recibir solo y con Facturas, Por pagar o Notas de crédito; falsa
 *      con Proveedores, Plan de campaña, Órdenes de compra o un rol sin módulos de Compras; verdad para el líder.
 *   D  LA REGLA GENERAL NO SE ABRIÓ: con Recibir solo, `fn_puede_ver_dinero_de_compras()` sigue falsa.
 *   P  PROVEEDORES VE SUS MONTOS (actividad 2; Felipe 2026-10-12, revierte ADR-0161 P3): con Proveedores solo, `fn_ve_plata_de_proveedores()`
 *      es verdad, la lista trae los montos (no nulos) y las métricas de un proveedor no dan 42501; con la plata de Compras, también; sin
 *      ninguno de los dos, el aviso de las métricas nombra Proveedores. La regla general sigue cerrada para Proveedores solo.
 *   T  TODAS LAS TIENDAS (actividad 2; Felipe 2026-10-12, deshace ADR-0184 y ADR-0187): Micaela es de Trujillo y no es líder. Con un
 *      módulo de plata de Compras ve (por la lectura de la tabla) la factura que gestiona Lima y su deuda entera; con Por pagar la
 *      paga a nombre de la empresa (sin tienda), y si nombra una tienda se valida como siempre; con Facturas registra un comprobante
 *      que gestiona Lima, y su contado repartido Lima/Trujillo queda de la empresa (antes lo rechazaba el candado por tienda); con
 *      Proveedores solo, el saldo y lo facturado de un proveedor son los de la empresa (antes, cero); ya no hay «partes ajenas»; sin
 *      módulos de plata no ve nada; con Recibir sigue viendo solo los destinos de su sede; los escaneos se leen igual que las facturas.
 *      Y en Finanzas (decisión 45: la deuda es de la tienda que hizo el pedido), una boleta repartida Lima/Trujillo con un pago de la
 *      empresa se debe entera en Lima, por lo que falta, en Por pagar y en el Balance por tienda; Trujillo no debe nada.
 *   F  LA FORMA: las cinco funciones del Plan y la de la tienda gestora ya no preguntan si es líder; las dos de recibir confirman el
 *      costo atípico con `fn_ve_costos_al_recibir` y su nota ya no dice «por un líder»; una sola función de cada nombre, `authenticated`
 *      las sigue ejecutando y `anon` no ejecuta la nueva; ninguna lectura de Compras arma ya la lista de «mis facturas», y pagar o
 *      registrar ya no exige una tienda.
 *
 * USO
 *   pnpm pruebas:compras-llave                                → contra la base `postgres` del stack local
 *   pnpm pruebas:compras-llave --contenedor supabase_db_x     → contra otro stack (un banco de pruebas propio)
 *   pnpm pruebas:compras-llave --sin-migracion                → sin cargar la migración: contra una base sin el cambio, la prueba
 *                                                                tiene que FALLAR (así se ve que vigila algo)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
// En orden: cada actividad de ADR-0387 suma la suya (la 1, las acciones; la 2, lo que se ve).
const MIGRACION = SIN_MIGRACION
  ? ""
  : ["20261012202000_compras_el_modulo_es_la_llave.sql", "20261012204000_compras_todas_las_tiendas.sql"]
      .map((f) => readFileSync(join(RAIZ, "supabase", "migrations", f), "utf8").replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, ""))
      .join("\n");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;

const PRELUDIO = `
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as prov1 from retail.proveedores where nombre = 'Textiles Andina SAC' \\gset
select v.id as var, v.producto_id as prod from retail.variantes v where v.sku = 'BLU-EMMA-NEG-M' \\gset
`;

// Una factura al crédito que registra el líder: 24 u a S/ 50 + 18 % (S/ 1,416.00), con la gestora y el reparto pedidos. Deja `:v`.
const FACTURA = (v, { gestora = "lima", dest = { lima: 24 } } = {}) => `
reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select retail.registrar_compra(:'prov1', 'TST', 'L' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'${gestora}',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', ${Object.values(dest).reduce((a, b) => a + b, 0)},
    'costo_unitario', 50, 'destinos', jsonb_build_array(${Object.entries(dest).map(([u, c]) => `jsonb_build_object('ubicacion_id', :'${u}', 'cantidad', ${c})`).join(", ")}))),
  p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) as ${v} \\gset
set constraints all immediate;
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba ADR-0387') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

// G. LA TIENDA GESTORA --------------------------------------------------------------------------------------------------
const GESTORA = `split_part(pg_temp.intento(format('select retail.cambiar_tienda_gestora_compra(%L, %L)', gen_random_uuid(), :'tru')), '|', 2)`;
caso(
  "G1 Micaela, sin ser líder y con Facturas de proveedor, pasa el permiso (la compra inventada no existe: ese es su error)",
  `${rolDeMicaela("facturas_compra")}
   ${como(MICAELA)}
   select ${GESTORA} like 'La compra % no existe';`,
  "t"
);
caso(
  "G2 con un rol sin Facturas de proveedor, 42501 que nombra el módulo (ya no dice «solo un líder»)",
  `${rolDeMicaela("existencias")}
   ${como(MICAELA)}
   select pg_temp.intento(format('select retail.cambiar_tienda_gestora_compra(%L, %L)', gen_random_uuid(), :'tru'));`,
  "42501|Cambiar la tienda que gestiona un comprobante necesita el módulo «Facturas de proveedor» en tu rol"
);
caso(
  "G3 el líder, como siempre",
  `${como(FELIPE)}
   select ${GESTORA} like 'La compra % no existe';`,
  "t"
);

// R. LOS COSTOS AL RECIBIR (y D: la regla general no se abrió) ----------------------------------------------------------
for (const [modulo, esperado] of [["recibir", "t"], ["facturas_compra", "t"], ["por_pagar", "t"], ["notas_credito", "t"],
  ["proveedores", "f"], ["plan_compra", "f"], ["ordenes_compra", "f"], ["existencias", "f"]]) {
  caso(
    `R con «${modulo}» solo, sin ser líder, ${esperado === "t" ? "ve" : "NO ve"} los costos al recibir`,
    `${rolDeMicaela(modulo)}
     ${como(MICAELA)}
     select retail.fn_ve_costos_al_recibir();`,
    esperado
  );
}
caso(
  "R el líder los ve",
  `${como(FELIPE)}
   select retail.fn_ve_costos_al_recibir();`,
  "t"
);
caso(
  "D con Recibir solo, la regla general de la plata de Compras sigue cerrada (no abre los tableros de Facturas y Por pagar)",
  `${rolDeMicaela("recibir")}
   ${como(MICAELA)}
   select retail.fn_puede_ver_dinero_de_compras();`,
  "f"
);

// P. PROVEEDORES VE SUS MONTOS (actividad 2) -----------------------------------------------------------------------------
const MONTOS_DE_LA_LISTA = `(select count(*) filter (where p.total_facturado is not null) || '/' || count(*) from retail.fn_proveedores() p)`;
const METRICAS = `split_part(pg_temp.intento(format('select * from retail.fn_proveedor_metricas_compras(%L)', (select id from retail.proveedores order by nombre limit 1))), '|', 1)`;
caso(
  "P1 con Proveedores solo, sin ser líder: ve la plata de Proveedores, la lista trae los montos y las métricas no dan 42501",
  `${rolDeMicaela("proveedores")}
   ${como(MICAELA)}
   select retail.fn_ve_plata_de_proveedores() || ',' || ${METRICAS} || ',' ||
     (select split_part(${MONTOS_DE_LA_LISTA}, '/', 1) = split_part(${MONTOS_DE_LA_LISTA}, '/', 2) and split_part(${MONTOS_DE_LA_LISTA}, '/', 2)::int > 0);`,
  "true,SIN_ERROR,true"
);
caso(
  "P2 con Proveedores solo, la regla general de la plata de Compras sigue cerrada",
  `${rolDeMicaela("proveedores")}
   ${como(MICAELA)}
   select retail.fn_puede_ver_dinero_de_compras();`,
  "f"
);
caso(
  "P3 con Facturas de proveedor (la plata de Compras), también ve la de Proveedores",
  `${rolDeMicaela("facturas_compra")}
   ${como(MICAELA)}
   select retail.fn_ve_plata_de_proveedores();`,
  "t"
);
caso(
  "P4 sin Proveedores ni la plata de Compras: no la ve, la lista viene sin montos y el aviso de las métricas nombra Proveedores",
  `${rolDeMicaela("existencias")}
   ${como(MICAELA)}
   select retail.fn_ve_plata_de_proveedores() || ',' || (select count(*) filter (where p.total_facturado is not null) from retail.fn_proveedores() p) || ',' ||
     pg_temp.intento(format('select * from retail.fn_proveedor_metricas_compras(%L)', (select id from retail.proveedores order by nombre limit 1)));`,
  "false,0,42501|Los montos de compras de un proveedor necesitan Proveedores, Facturas de compra, Por pagar o Notas de crédito en tu rol."
);

// T. TODAS LAS TIENDAS (actividad 2) --------------------------------------------------------------------------------------
// Micaela es de Tienda Trujillo; la factura de la mayoría de los casos la gestiona Tienda Lima y va entera a Lima.
const PAGO_DE_MICAELA = (ubicacion) =>
  `pg_temp.intento(format('select retail.registrar_pagos_compra(%L, %L::jsonb, null, null, %L)', :'compra_lima', '[{"monto": 100, "metodo": "efectivo"}]', ${ubicacion}))`;
caso(
  "T1 con Facturas de proveedor, sin ser líder, ve la factura que gestiona otra tienda (Lima) y su deuda entera",
  `${FACTURA("compra_lima")}
   ${rolDeMicaela("facturas_compra")}
   ${como(MICAELA)}
   select (select count(*) from retail.compras where id = :'compra_lima') || ',' || retail.fn_compra_es_de_mis_tiendas(:'compra_lima') || ',' ||
     (select d.saldo || '/' || d.gestionada from retail.fn_deuda_visible(array[:'compra_lima']::uuid[]) d);`,
  "1,true,1416.00/true"
);
caso(
  "T2 con Por pagar paga esa factura a nombre de la empresa (sin tienda)",
  `${FACTURA("compra_lima")}
   ${rolDeMicaela("por_pagar")}
   ${como(MICAELA)}
   select ${PAGO_DE_MICAELA("null")} as r \\gset
   reset role;
   select :'r' || ',' || (select count(*) from retail.compra_pagos where compra_id = :'compra_lima' and ubicacion_id is null and monto = 100);`,
  "SIN_ERROR,1"
);
caso(
  "T3 si la pantalla nombra una tienda sin parte en la factura, se rechaza como siempre",
  `${FACTURA("compra_lima")}
   ${rolDeMicaela("por_pagar")}
   ${como(MICAELA)}
   select split_part(${PAGO_DE_MICAELA(":'tru'")}, '|', 2) like 'Esa tienda no tiene parte en el comprobante%';`,
  "t"
);
caso(
  "T4 y una tienda que no existe, con su aviso nuevo",
  `${FACTURA("compra_lima")}
   ${rolDeMicaela("por_pagar")}
   ${como(MICAELA)}
   select ${PAGO_DE_MICAELA("gen_random_uuid()")};`,
  "42501|Esa tienda no existe o no está activa"
);
caso(
  "T5 sin Por pagar (solo Facturas), pagar sigue pidiendo el módulo",
  `${FACTURA("compra_lima")}
   ${rolDeMicaela("facturas_compra")}
   ${como(MICAELA)}
   select ${PAGO_DE_MICAELA("null")};`,
  "42501|Registrar pagos a proveedores necesita el módulo Por pagar en tu rol"
);
caso(
  "T6 con Facturas registra un comprobante que gestiona Lima, aunque su sede es Trujillo",
  `${rolDeMicaela("facturas_compra")}
   ${como(MICAELA)}
   select retail.registrar_compra(:'prov1', 'TST', 'M' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'lima',
     jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 5, 'costo_unitario', 50,
       'destinos', jsonb_build_array(jsonb_build_object('ubicacion_id', :'lima', 'cantidad', 5)))),
     p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 18) is not null;`,
  "t"
);
caso(
  "T7 con Facturas y Por pagar, el contado de un comprobante repartido Lima/Trujillo queda de la empresa (antes lo rechazaba el candado por tienda)",
  `${rolDeMicaela("facturas_compra", "por_pagar")}
   ${como(MICAELA)}
   select retail.registrar_compra(:'prov1', 'TST', 'M' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'contado', :'lima',
     jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 5, 'costo_unitario', 50,
       'destinos', jsonb_build_array(jsonb_build_object('ubicacion_id', :'lima', 'cantidad', 3), jsonb_build_object('ubicacion_id', :'tru', 'cantidad', 2)))),
     p_tipo => 'factura', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => null, p_igv_porcentaje => 18,
     p_pago => jsonb_build_array(jsonb_build_object('monto', 295, 'metodo', 'efectivo'))) as f \\gset
   set constraints all immediate;
   reset role;
   select count(*) || ',' || sum(monto) from retail.compra_pagos where compra_id = :'f' and ubicacion_id is null;`,
  "1,295.00"
);
caso(
  "T8 con Proveedores solo, el saldo y lo facturado de un proveedor son los de la empresa, los mismos que ve el líder (antes, cero)",
  `${FACTURA("compra_lima")}
   select saldo as saldo_lider, total_facturado as total_lider from retail.fn_proveedores() where id = :'prov1' \\gset
   ${rolDeMicaela("proveedores")}
   ${como(MICAELA)}
   select (saldo = :'saldo_lider' and total_facturado = :'total_lider' and saldo >= 1416) from retail.fn_proveedores() where id = :'prov1';`,
  "t"
);
caso(
  "T9 ya no hay «partes ajenas»: una factura de Lima con parte de Trujillo no aparece como parte, se ve entera",
  `${FACTURA("compra_mixta", { dest: { lima: 12, tru: 12 } })}
   ${rolDeMicaela("facturas_compra")}
   ${como(MICAELA)}
   select (select count(*) from retail.fn_mis_partes_de_compras()) || ',' || (select count(*) from retail.compras where id = :'compra_mixta');`,
  "0,1"
);
caso(
  "T10 sin módulos de plata de Compras no ve la factura, ni su deuda, ni es «suya»",
  `${FACTURA("compra_lima")}
   ${rolDeMicaela("existencias")}
   ${como(MICAELA)}
   select (select count(*) from retail.compras where id = :'compra_lima') || ',' ||
     (select count(*) from retail.fn_deuda_visible(array[:'compra_lima']::uuid[])) || ',' || retail.fn_compra_es_de_mis_tiendas(:'compra_lima');`,
  "0,0,false"
);
caso(
  "T11 con Recibir solo, sigue viendo los destinos de su sede (Trujillo) y no los de Lima",
  `${FACTURA("compra_mixta", { dest: { lima: 12, tru: 12 } })}
   select id as item from retail.compra_items where compra_id = :'compra_mixta' \\gset
   ${rolDeMicaela("recibir")}
   ${como(MICAELA)}
   select count(*) filter (where ubicacion_id = :'tru') || ',' || count(*) from retail.compra_item_destinos where compra_item_id = :'item';`,
  "1,1"
);
// Decisión 45 (Felipe 2026-10-12): la deuda es de la tienda que hizo el pedido. Una boleta de S/ 1,000 que gestiona Lima: Lima recibe
// 12 u (S/ 600) y Trujillo 8 u (S/ 400); la empresa paga S/ 500. Antes, Finanzas decía Lima 500 + Trujillo 400 = 900.
const BOLETA_REPARTIDA_Y_PAGO = `
reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select coalesce(sum(saldo) filter (where ubicacion_id = :'lima'), 0)::numeric(12, 2) as lima0,
       coalesce(sum(saldo) filter (where ubicacion_id = :'tru'), 0)::numeric(12, 2) as tru0
  from retail.fn_bal_facturas_de_tienda(retail.fn_hoy_lima()) \\gset
select retail.registrar_compra(:'prov1', 'TST', 'D' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'credito', :'lima',
  jsonb_build_array(jsonb_build_object('producto_id', :'prod', 'variante_id', :'var', 'cantidad', 20, 'costo_unitario', 50,
    'destinos', jsonb_build_array(jsonb_build_object('ubicacion_id', :'lima', 'cantidad', 12), jsonb_build_object('ubicacion_id', :'tru', 'cantidad', 8)))),
  p_tipo => 'boleta', p_fecha_emision => retail.fn_hoy_lima(), p_fecha_vencimiento => retail.fn_hoy_lima() + 10, p_igv_porcentaje => 0) as boleta \\gset
set constraints all immediate;
select retail.registrar_pagos_compra(:'boleta', '[{"monto": 500, "metodo": "efectivo"}]'::jsonb) is not null as pagada \\gset
`;
caso(
  "T13 Finanzas (decisión 45): mirando Lima, Por pagar muestra la boleta entera con lo que falta (S/ 500); mirando Trujillo, nada (solo recibió)",
  `${BOLETA_REPARTIDA_Y_PAGO}
   select coalesce((select d.total || '/' || d.saldo || '/' || d.parte from retail.fn_por_pagar_consolidado(:'lima', null, false) d where d.id = :'boleta'), 'sin fila') || ',' ||
          (select count(*) from retail.fn_por_pagar_consolidado(:'tru', null, false) d where d.id = :'boleta');`,
  "1000.00/500.00/false,0"
);
caso(
  "T14 Finanzas (decisión 45): en el Balance por tienda, la boleta suma S/ 500 a Lima y nada a Trujillo (antes, 500 + 400)",
  `${BOLETA_REPARTIDA_Y_PAGO}
   select (coalesce(sum(saldo) filter (where ubicacion_id = :'lima'), 0) - :'lima0')::numeric(12, 2) || ',' ||
          (coalesce(sum(saldo) filter (where ubicacion_id = :'tru'), 0) - :'tru0')::numeric(12, 2)
     from retail.fn_bal_facturas_de_tienda(retail.fn_hoy_lima());`,
  "500.00,0.00"
);
for (const [modulo, esperado] of [["facturas_compra", "1"], ["existencias", "0"]]) {
  caso(
    `T12 el escaneo de una factura de Lima ${esperado === "1" ? "lo lee quien tiene Facturas de proveedor" : "no lo lee quien no tiene la plata de Compras"}`,
    `${FACTURA("compra_lima")}
     insert into storage.objects (bucket_id, name) values ('retail-compras-adjuntos', :'compra_lima' || '/papel.pdf');
     ${rolDeMicaela(modulo)}
     ${como(MICAELA)}
     select count(*) from storage.objects where bucket_id = 'retail-compras-adjuntos' and name = :'compra_lima' || '/papel.pdf';`,
    esperado
  );
}

// F. LA FORMA -----------------------------------------------------------------------------------------------------------
caso(
  "F1 ni el Plan (seis funciones, con el % de lo que sobra) ni la tienda gestora preguntan ya si es líder",
  `select count(*) from unnest(array['retail.crear_plan_compra(uuid,text,date,date)', 'retail.editar_plan_compra(uuid,text,date,date)',
     'retail.quitar_plan_compra(uuid)', 'retail.restaurar_plan_compra(uuid)', 'retail.guardar_plan_compra_tope(uuid,numeric)',
     'retail.guardar_plan_compra_recupero(uuid,integer)', 'retail.cambiar_tienda_gestora_compra(uuid,uuid)']) f
    where position('fn_es_lider' in pg_get_functiondef(f::regprocedure)) > 0;`,
  "0"
);
caso(
  "F2 recibir_envio y recibir_lote confirman el costo atípico con fn_ve_costos_al_recibir y su nota ya no dice «por un líder»",
  `select string_agg((position('fn_ve_costos_al_recibir() then' in d) > 0)::text || '/' || (position('confirmado por un líder' in d) = 0)::text, ',')
     from (select pg_get_functiondef(f::regprocedure) as d from unnest(array['retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)',
       'retail.recibir_lote(uuid,uuid,jsonb,text,text,uuid)']) f) x;`,
  "true/true,true/true"
);
caso(
  "F3 una sola función de cada nombre, authenticated las sigue ejecutando, y anon no ejecuta la nueva",
  `select (select string_agg(p.proname || ':' || has_function_privilege('authenticated', p.oid, 'execute'), ',' order by p.proname)
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'retail' and p.proname in ('crear_plan_compra', 'editar_plan_compra', 'quitar_plan_compra', 'restaurar_plan_compra',
              'guardar_plan_compra_tope', 'cambiar_tienda_gestora_compra', 'recibir_envio', 'recibir_lote', 'fn_ve_costos_al_recibir'))
          || ',anon:' || has_function_privilege('anon', 'retail.fn_ve_costos_al_recibir()', 'execute');`,
  "cambiar_tienda_gestora_compra:true,crear_plan_compra:true,editar_plan_compra:true,fn_ve_costos_al_recibir:true,guardar_plan_compra_tope:true,quitar_plan_compra:true,recibir_envio:true,recibir_lote:true,restaurar_plan_compra:true,anon:false"
);

caso(
  "F4 ninguna lectura de Compras arma ya la lista de «mis facturas» (fn_compras_visibles)",
  `select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
    where ((n.nspname = 'retail' and c.relname like 'compra%') or (n.nspname = 'storage' and p.polname like 'retail_compras_adjuntos%'))
      and position('fn_compras_visibles' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0;`,
  "0"
);
caso(
  "F5 pagar y registrar ya no exigen una tienda de quien no es líder",
  `select count(*) from unnest(array['retail.registrar_pago_compras(uuid,text,jsonb,text,date,uuid,numeric,uuid)',
     'retail.registrar_pago_compras_medios(uuid,jsonb,jsonb,date,uuid,numeric,uuid)', 'retail.registrar_pagos_compra(uuid,jsonb,date,uuid,uuid)',
     'retail.registrar_compra(uuid,text,text,text,uuid,jsonb,text,date,date,numeric,jsonb,text,numeric,uuid,date)']) f
    where position('Elige desde qué tienda' in pg_get_functiondef(f::regprocedure)) > 0
       or position('else p_ubicacion_destino_id end' in pg_get_functiondef(f::regprocedure)) > 0;`,
  "0"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
