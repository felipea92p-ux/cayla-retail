#!/usr/bin/env node
/**
 * Pruebas de 20261116173000 (ADR-0655, decisiones de Felipe del 2026-11-16) contra el Postgres local.
 *
 * QUÉ PRUEBA.
 *   · El tope de 70 %: «lleva N, paga M» hasta 70 % (3 x 1 y 10 x 3 sí; 4 x 1 y 10 x 2 no), también escribiendo directo en la tabla; un escalón en
 *     soles ahorra hasta el 70 % de su «desde».
 *   · Las bolsas (una familia con «Cuenta en Análisis…» apagado) no cuentan para un monto de toda la compra ni reciben su parte.
 *   · El monto se mide sobre lo que la prenda paga: con un descuento a mano que la deja bajo el monto, no ahorra; sin la clave, como antes (el
 *     control). Y `fn_exigir_ofertas_de_grupo` (lo que pide registrar_venta) lo deduce de la línea: rechaza la parte del monto que la caja
 *     mandaría a precio de lista.
 *   · La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK.
 *
 * USO
 *   pnpm pruebas:ofertas-tope-y-monto
 *   pnpm pruebas:ofertas-tope-y-monto -- --base otra --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const arg = (n, d) => (process.argv.indexOf(n) > 0 ? process.argv[process.argv.indexOf(n) + 1] : d);
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const MIGRACIONES = [
  "supabase/migrations/20261116172000_ofertas_candados_ciclo_y_campana.sql",
  "supabase/migrations/20261116173000_ofertas_tope_bolsas_y_monto_pagado.sql",
];
const FELIPE = "22222222-2222-4222-8222-000000000001";

function correr(sql) {
  try {
    const salida = execFileSync(
      "docker",
      ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
      { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
    );
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
let total = 0;
let fallos = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 6).join("\n    ")}`);
  }
}
const ultima = (r) => (r.ok ? (r.salida.split("\n").filter(Boolean).at(-1) ?? "") : "");
const esperarValor = (nombre, r, esperado) => esperar(nombre, r.ok && ultima(r) === esperado, r.ok ? `dio «${ultima(r)}», se esperaba «${esperado}»` : r.mensaje);
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»` : r.mensaje);

if (!correr("select 1;").ok) {
  console.error(`No hay Postgres local en ${CONTENEDOR}/${BASE}. Levántalo con: npx supabase start`);
  process.exit(2);
}
if (correr("select to_regprocedure('retail.fn_escalones_validos(jsonb, text)') is null;").salida === "t") {
  console.error("La base no tiene el monto con escalones (20261114044000 en adelante): aplica las migraciones antes.");
  process.exit(2);
}
const leer = (p) => readFileSync(p, "utf8");
const FALTA = [
  correr("select to_regprocedure('retail.fn_cesion_hace_ciclo(uuid, uuid)') is null;").salida === "t" ? leer(MIGRACIONES[0]) : "",
  correr("select not exists (select 1 from pg_constraint where conname = 'campana_reglas_tope_70');").salida === "t" ? leer(MIGRACIONES[1]) : "",
].join("\n");

const HOY = "retail.fn_hoy_lima()";
const PARTIDA = `begin;
${FALTA}
set local request.jwt.claim.sub = '${FELIPE}';
-- Un monto de toda la compra choca con cualquier otra oferta o descuento de siempre de la base: dentro del escenario, nada más rige.
update retail.campana_reglas set estado = 'desactivada' where estado <> 'desactivada';
update retail.etiquetas set descuento_pct = null where descuento_pct is not null;
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as a1, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select v.id as fuera, p.categoria_id as cat_fuera from retail.variantes v join retail.productos p on p.id = v.producto_id
 where p.categoria_id <> :'cat' and v.activo and retail.fn_categoria_entra_a_motores(p.categoria_id)
   and p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure') order by v.id limit 1 \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Tope y monto (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 30, array[:'cat']::uuid[]);
`;
const FORMA = (forma, v = "r") =>
  `select retail.guardar_oferta_completa(null, :'camp', 'ZZ forma', '${JSON.stringify(forma)}'::jsonb, ${HOY}, ${HOY} + 3, null,
     '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true) as ${v} \\gset\n`;
const MONTO = (escalones = [{ desde: 300, ahorra: 30 }]) =>
  FORMA({ tipo: "monto", ahorro_en: "soles", cuenta: "compra", cede_a_otras: false, escalones }, "m");
const L = (v, precio, manual) =>
  `jsonb_build_object('variante_id', :'${v}', 'precio_unitario', ${precio}, 'cantidad', 1${manual == null ? "" : `, 'descuento_manual', ${manual}`})`;
const GRUPO = (lineas) =>
  `select coalesce(string_agg(linea || ':' || descuento, ',' order by linea), 'nada') from retail.fn_ofertas_de_grupo(${HOY}, :'u', jsonb_build_array(${lineas.join(", ")}), 0);\n`;
const caso = (cuerpo) => correr(`${PARTIDA}${cuerpo}rollback;`);

console.log("\n— El tope de 70 % —");
esperarValor("«3 x 1» (66 %) se guarda", caso(`${FORMA({ tipo: "nxm", lleva: 3, paga: 1 })}select 'ok';`), "ok");
esperarValor("«10 x 3» (70 % justo) se guarda", caso(`${FORMA({ tipo: "nxm", lleva: 10, paga: 3 })}select 'ok';`), "ok");
esperarError("«4 x 1» (75 %) no: dice cuánto regala y cuánto debe pagar", caso(FORMA({ tipo: "nxm", lleva: 4, paga: 1 })), "regala el 75 %");
esperarError("«10 x 2» (80 %) no", caso(FORMA({ tipo: "nxm", lleva: 10, paga: 2 })), "que pague al menos 3");
esperarError(
  "escribiendo directo en la tabla, el candado lo frena",
  caso(`insert into retail.campana_reglas (etiqueta_id, nombre, tipo, lleva, paga, desde, hasta) values (:'camp', 'ZZ 10x1', 'nxm', 10, 1, ${HOY}, ${HOY} + 3);`),
  "campana_reglas_tope_70",
);
esperarValor("«la 2.ª al 100 %» (50 % del grupo) se sigue guardando", caso(`${FORMA({ tipo: "nesima_pct", lleva: 2, porcentaje: 100 })}select 'ok';`), "ok");
esperarValor("un escalón en soles de S/ 210 desde S/ 300 (70 %) se guarda", caso(`${MONTO([{ desde: 300, ahorra: 210 }])}select 'ok';`), "ok");
esperarError("…uno de S/ 211 no", caso(MONTO([{ desde: 300, ahorra: 211 }])), "hasta el 70 % de su monto");

console.log("\n— Las bolsas no cuentan para el monto —");
esperarValor(
  "una prenda de piso sí cuenta: 200 + 150 llega a S/ 300 (17.14 · 12.86)",
  caso(`${MONTO()}${GRUPO([L("a1", 200), L("fuera", 150)])}`),
  "1:17.14,2:12.86",
);
esperarValor(
  "la misma prenda en una familia fuera de los motores no cuenta ni recibe parte: 200 no llega",
  caso(`insert into retail.familias (codigo, nombre, entra_a_motores) values ('zz_bolsas', 'ZZ Bolsas (prueba)', false);
update retail.categorias set familia = 'zz_bolsas' where id = :'cat_fuera';
${MONTO()}${GRUPO([L("a1", 200), L("fuera", 150)])}`),
  "1:0.00",
);

console.log("\n— El monto sobre lo que la prenda paga —");
esperarValor("CONTROL: sin descuento a mano, 400 llega a S/ 300 y ahorra 30", caso(`${MONTO()}${GRUPO([L("a1", 400)])}`), "1:30.00");
esperarValor("con −S/ 140 a mano paga 260: no llega", caso(`${MONTO()}${GRUPO([L("a1", 400, 140)])}`), "1:0.00");
esperarValor("con −S/ 50 a mano paga 350: llega y ahorra 30", caso(`${MONTO()}${GRUPO([L("a1", 400, 50)])}`), "1:30.00");
esperarValor(
  "el reparto también va sobre lo pagado: 400 (−100 a mano) + 150 → 300 y 150 reparten 30 en 20 · 10",
  caso(`${MONTO()}${GRUPO([L("a1", 400, 100), L("fuera", 150)])}`),
  "1:20.00,2:10.00",
);
const VENTA = (descuento, grupo) =>
  `select retail.fn_exigir_ofertas_de_grupo(jsonb_build_array(jsonb_build_object('variante_id', :'a1', 'precio_unitario', 400, 'cantidad', 1,
     'descuento_unitario', ${descuento}, 'descuento_club_unitario', 0, 'descuento_grupo_unitario', ${grupo}, 'oferta_grupo_id', ${grupo > 0 ? ":'m'" : "null"})), :'u', ${HOY});
select 'aceptada';\n`;
esperarValor("la venta: −140 a mano sin parte del monto se acepta", caso(`${MONTO()}${VENTA(140, 0)}`), "aceptada");
esperarError(
  "…y si la caja le pusiera la parte a precio de lista (−140 a mano + 30), se rechaza",
  caso(`${MONTO()}${VENTA(170, 30)}`),
  "venta_grupo_no_coincide",
);
esperarValor("la venta: −50 a mano con su parte de 30 se acepta", caso(`${MONTO()}${VENTA(80, 30)}`), "aceptada");

console.log("\n— La migración —");
esperarValor("se puede pegar dos veces", correr(`begin;\n${leer(MIGRACIONES[1])}\n${leer(MIGRACIONES[1])}\nselect 'ok';\nrollback;`), "ok");

console.log(`\n${total - fallos} de ${total} en verde.`);
process.exit(fallos ? 1 : 0);
