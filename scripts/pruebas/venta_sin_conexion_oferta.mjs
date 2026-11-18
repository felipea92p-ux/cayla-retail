#!/usr/bin/env node
/**
 * Pruebas de 20261116174000 (ADR-0655, Felipe 2026-11-16: «Se acepta y queda marcada») contra el Postgres local.
 *
 * QUÉ PRUEBA. Una venta con un 3x2 cobrada sin conexión (la cola manda `x-momento`) cuya oferta cambió antes de subirla:
 *   · retirada antes de subir: entra con lo que cobró la caja y queda marcada en `ventas.oferta_cambiada` («no_coincide»);
 *   · activada después del cobro sin red (la caja no la dio): entra y queda marcada («omitido»);
 *   · la misma venta EN LÍNEA (sin `x-momento`) se sigue rechazando: el control;
 *   · una venta sin conexión normal no queda marcada, y la marca no se hereda a la venta siguiente de la misma transacción;
 *   · sin conexión siguen valiendo los candados: una parte mayor que el descuento de la línea, o con una oferta que no existe, se rechaza.
 *   · La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. Tienda Lima con caja abierta y stock de sobra, como `caja_ofertas_de_grupo.mjs`.
 *
 * USO
 *   pnpm pruebas:venta-sin-conexion-oferta
 *   pnpm pruebas:venta-sin-conexion-oferta -- --base otra --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const arg = (n, d) => (process.argv.indexOf(n) > 0 ? process.argv[process.argv.indexOf(n) + 1] : d);
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const MIGRACIONES = [
  "supabase/migrations/20261116172000_ofertas_candados_ciclo_y_campana.sql",
  "supabase/migrations/20261116173000_ofertas_tope_bolsas_y_monto_pagado.sql",
  "supabase/migrations/20261116174000_venta_sin_conexion_oferta_que_cambio.sql",
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
if (correr("select to_regprocedure('retail.fn_cuenta_de_grupos(jsonb)') is null;").salida === "t") {
  console.error("La base no tiene las ofertas de grupo de ADR-0655 (hasta 20261114155000): aplica las migraciones antes.");
  process.exit(2);
}
const leer = (p) => readFileSync(p, "utf8");
const FALTA = [
  correr("select to_regprocedure('retail.fn_cesion_hace_ciclo(uuid, uuid)') is null;").salida === "t" ? leer(MIGRACIONES[0]) : "",
  correr("select not exists (select 1 from pg_constraint where conname = 'campana_reglas_tope_70');").salida === "t" ? leer(MIGRACIONES[1]) : "",
  correr("select to_regprocedure('retail.fn_venta_sin_conexion()') is null;").salida === "t" ? leer(MIGRACIONES[2]) : "",
].join("\n");

const HOY = "retail.fn_hoy_lima()";
const PARTIDA = `begin;
${FALTA}
set local request.jwt.claim.sub = '${FELIPE}';
-- Solo la oferta de la prueba rige dentro del escenario.
update retail.campana_reglas set estado = 'desactivada' where estado <> 'desactivada';
update retail.etiquetas set descuento_pct = null where descuento_pct is not null;
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as a1, p.id as modelo, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select v.id as a2 from retail.variantes v where v.producto_id = :'modelo' and v.id <> :'a1' and v.activo order by v.id limit 1 \\gset
select v.id as a3 from retail.variantes v where v.producto_id = :'modelo' and v.id not in (:'a1', :'a2') and v.activo order by v.id limit 1 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'u', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'u' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'u' and estado = 'abierta') x) as _cerro \\gset
select retail.abrir_caja(:'u', 100.00, 'prueba automatizada') as caja \\gset
select retail.fn_sububicacion_por_defecto(:'u', 'venta') as sub \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x, :'u', :'sub', 'entrada', 100, 'colchón de prueba' from unnest(array[:'a1', :'a2', :'a3']::uuid[]) x;
select count(retail.fn_aplicar_movimiento(m.id)) as _ap from retail.movimientos m where m.motivo = 'colchón de prueba' and m.ubicacion_id = :'u' and m.created_at >= now() - interval '1 minute' \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Sin conexión (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
select retail.guardar_oferta_completa(null, :'camp', 'ZZ 3x2', '{"tipo":"nxm","lleva":3,"paga":2}'::jsonb, ${HOY}, ${HOY} + 3, null,
  '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true) as r \\gset
select retail.fn_precio_en_sede(:'a1', :'u') as p1, retail.fn_precio_en_sede(:'a2', :'u') as p2, retail.fn_precio_en_sede(:'a3', :'u') as p3 \\gset
select coalesce(max(descuento) filter (where linea = 1), 0) as g1, coalesce(max(descuento) filter (where linea = 2), 0) as g2,
       coalesce(max(descuento) filter (where linea = 3), 0) as g3
  from retail.fn_ofertas_de_grupo(${HOY}, :'u', jsonb_build_array(
    jsonb_build_object('variante_id', :'a1', 'precio_unitario', :'p1'::numeric, 'cantidad', 1),
    jsonb_build_object('variante_id', :'a2', 'precio_unitario', :'p2'::numeric, 'cantidad', 1),
    jsonb_build_object('variante_id', :'a3', 'precio_unitario', :'p3'::numeric, 'cantidad', 1)), 0) \\gset
`;
const linea = (v, p, g, oferta = ":'r'") =>
  `jsonb_build_object('variante_id', :'${v}', 'cantidad', 1, 'precio_unitario', :'${p}'::numeric, 'descuento_unitario', ${g}, 'descuento_grupo_unitario', ${g}, 'oferta_grupo_id', ${g === "0" ? "null" : oferta})`;
const venta = (items, cobro, v = "venta") =>
  `select retail.registrar_venta(:'u', jsonb_build_array(${items}), jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${cobro})), null, gen_random_uuid()) as ${v} \\gset\n`;
const CON_3X2 = [linea("a1", "p1", ":'g1'::numeric"), linea("a2", "p2", ":'g2'::numeric"), linea("a3", "p3", ":'g3'::numeric")].join(", ");
const COBRO_3X2 = "(:'p1'::numeric + :'p2'::numeric + :'p3'::numeric - :'g1'::numeric - :'g2'::numeric - :'g3'::numeric)";
const SIN_3X2 = [linea("a1", "p1", "0"), linea("a2", "p2", "0"), linea("a3", "p3", "0")].join(", ");
const COBRO_SIN = "(:'p1'::numeric + :'p2'::numeric + :'p3'::numeric)";
const SIN_RED = `select set_config('request.headers', json_build_object('x-momento', to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:SSOF'))::text, true) as _h \\gset\n`;
const RETIRAR = "select retail.retirar_campana_regla(:'r');\n";
const MARCA = (v = "venta") =>
  `select coalesce((select string_agg(x ->> 'motivo', ',' order by (x ->> 'linea')::int) from jsonb_array_elements(oferta_cambiada) x), 'sin marca') from retail.ventas where id = :'${v}';\n`;
const caso = (cuerpo) => correr(`${PARTIDA}${cuerpo}rollback;`);

console.log("\n— La oferta cambió entre el cobro sin red y la subida —");
esperarValor(
  "un 3x2 retirado antes de subir: la venta entra con lo que cobró la caja y queda marcada en sus tres líneas",
  caso(`${RETIRAR}${SIN_RED}${venta(CON_3X2, COBRO_3X2)}${MARCA()}`),
  "no_coincide,no_coincide,no_coincide",
);
esperarValor(
  "…y la venta guarda lo que cobró de cada prenda (la parte del 3x2 sigue en sus líneas)",
  caso(`${RETIRAR}${SIN_RED}${venta(CON_3X2, COBRO_3X2)}select sum(descuento_grupo_unitario) = (:'g1'::numeric + :'g2'::numeric + :'g3'::numeric) from retail.venta_items where venta_id = :'venta';\n`),
  "t",
);
esperarValor(
  "un 3x2 activo que la caja no dio (lo activaron después del cobro sin red): entra marcada como «omitido»",
  caso(`${SIN_RED}${venta(SIN_3X2, COBRO_SIN)}${MARCA()}`),
  "omitido,omitido,omitido",
);
esperarError("CONTROL: la misma venta EN LÍNEA con el 3x2 retirado se rechaza", caso(`${RETIRAR}${venta(CON_3X2, COBRO_3X2)}`), "venta_grupo_no_coincide");
esperarError("CONTROL: en línea sin dar el 3x2 activo, también", caso(venta(SIN_3X2, COBRO_SIN)), "venta_grupo_omitido");

console.log("\n— Lo normal no se marca —");
esperarValor("una venta sin conexión con la oferta igual entra sin marca", caso(`${SIN_RED}${venta(CON_3X2, COBRO_3X2)}${MARCA()}`), "sin marca");
esperarValor(
  "la marca no pasa a la venta siguiente de la misma transacción",
  caso(`${RETIRAR}${SIN_RED}${venta(CON_3X2, COBRO_3X2)}select set_config('request.headers', '{}', true) as _h \\gset
${venta(linea("a1", "p1", "0"), ":'p1'::numeric", "otra")}${MARCA("otra")}`),
  "sin marca",
);

console.log("\n— Sin conexión, los candados siguen —");
esperarError(
  "una parte mayor que el descuento de la línea se rechaza",
  caso(`${RETIRAR}${SIN_RED}${venta(`jsonb_build_object('variante_id', :'a1', 'cantidad', 1, 'precio_unitario', :'p1'::numeric, 'descuento_unitario', 1, 'descuento_grupo_unitario', 5, 'oferta_grupo_id', :'r')`, ":'p1'::numeric - 1")}`),
  "venta_grupo_invalido",
);
esperarError(
  "una parte con una oferta que no existe se rechaza",
  caso(`${SIN_RED}${venta(`jsonb_build_object('variante_id', :'a1', 'cantidad', 1, 'precio_unitario', :'p1'::numeric, 'descuento_unitario', 5, 'descuento_grupo_unitario', 5, 'oferta_grupo_id', gen_random_uuid())`, ":'p1'::numeric - 5")}`),
  "venta_grupo_no_coincide",
);

console.log("\n— La migración —");
esperarValor("se puede pegar dos veces", correr(`begin;\n${leer(MIGRACIONES[2])}\n${leer(MIGRACIONES[2])}\nselect 'ok';\nrollback;`), "ok");

console.log(`\n${total - fallos} de ${total} en verde.`);
process.exit(fallos ? 1 : 0);
