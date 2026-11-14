#!/usr/bin/env node
/**
 * Pruebas de «la caja cobra Llevar varias y pagar menos» (`20261114011000_caja_cobra_ofertas_de_grupo.sql`, ADR-0655 actividad 6, parte 3)
 * contra el Postgres local, con ventas de verdad por `registrar_venta`.
 *
 * QUÉ PRUEBA.
 *   · una venta con un 3x2 activo y la parte de cada prenda que da LA regla: se guarda, cada línea con su `descuento_grupo_unitario` y su
 *     oferta, y lo regalado es la prenda más barata;
 *   · la caja no puede omitir la parte del grupo (`venta_grupo_omitido`) ni mandar más (`venta_grupo_no_coincide`), ni ponerla en una
 *     línea de varias unidades que quedan en partes distintas, ni con una oferta en borrador;
 *   · un descuento a mano se SUMA a la parte del grupo (Felipe 2026-11-13) y sus topes miran solo lo suyo;
 *   · una venta sin ofertas de grupo sigue igual;
 *   · `ofertas_de_grupo_vigentes(sede)` dice la oferta de cada prenda; la migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. Si la base local no tiene las migraciones de las ofertas, las aplica dentro.
 *
 * DA POR SENTADO: `Tienda Lima` y la variante `BLU-EMMA-NEG-M` del seed, con al menos 3 variantes en su modelo.
 *
 * USO
 *   pnpm pruebas:caja-ofertas-de-grupo
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR = process.argv.includes("--contenedor") ? process.argv[process.argv.indexOf("--contenedor") + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261114011000_caja_cobra_ofertas_de_grupo.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
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
  console.error(`No hay Postgres local en el contenedor ${CONTENEDOR}. Levántalo con: npx supabase start`);
  process.exit(2);
}
const falta = (sql) => correr(sql).salida === "t";
const leer = (n) => readFileSync(`supabase/migrations/${n}.sql`, "utf8");
const sinFusion = falta("select to_regprocedure('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)') is null;");
const sinProductos = falta("select to_regclass('retail.campana_regla_productos') is null;");
const sinCesiones = falta("select to_regclass('retail.campana_regla_cesiones') is null;");
const sinDeUnaVez = falta("select to_regprocedure('retail.fn_variantes_de_oferta(uuid, uuid[], uuid[], uuid[], boolean)') is null;");
const sinGrupo = falta("select to_regprocedure('retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)') is null;");
const sinCaja = falta("select to_regprocedure('retail.fn_exigir_ofertas_de_grupo(jsonb, uuid, date)') is null;");
const ANTES = [
  sinProductos && sinFusion
    ? ["20261112204000_fusionar_productos_base", "20261112205000_fusionar_productos_previsualizar", "20261112210000_fusionar_productos",
        "20261112211000_fusionar_productos_lecturas", "20261113175000_fusionar_productos_tallas_vacias"].map(leer).join("\n")
    : "",
  sinProductos ? leer("20261113210000_oferta_prenda_por_prenda") : "",
  sinCesiones ? leer("20261113223000_una_oferta_por_prenda_tienda_y_dia") : "",
  sinDeUnaVez ? leer("20261113230000_choques_de_oferta_de_una_vez") : "",
  sinGrupo ? leer("20261114003000_ofertas_de_grupo") : "",
  sinCaja ? readFileSync(MIGRACION, "utf8") : "",
  // Parte 4 (20261114032000): la cuenta de los grupos pasó a `fn_repartir_grupos`; la caja tiene que cobrar lo mismo con ella.
  falta("select to_regprocedure('retail.fn_repartir_grupos(jsonb)') is null;") ? leer("20261114032000_apartados_con_ofertas_de_grupo") : "",
].filter(Boolean).join("\n");

const HOY = "retail.fn_hoy_lima()";
// Tienda Lima lista para vender (caja abierta, stock de sobra) y una campaña «ZZ» con la categoría de la Blusa Emma; tres variantes de su modelo.
const PARTIDA = (activar = "true") => `begin;
${ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as a1, p.id as modelo, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select v.id as a2 from retail.variantes v where v.producto_id = :'modelo' and v.id <> :'a1' and v.activo order by v.id limit 1 \\gset
select v.id as a3 from retail.variantes v where v.producto_id = :'modelo' and v.id not in (:'a1', :'a2') and v.activo order by v.id limit 1 \\gset
select v.id as fuera from retail.variantes v join retail.productos p on p.id = v.producto_id where p.categoria_id <> :'cat' and v.activo and retail.fn_precio_en_sede(v.id, :'u') > 0 order by v.id limit 1 \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'u', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'u' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'u' and estado = 'abierta') x) as _cerro \\gset
select retail.abrir_caja(:'u', 100.00, 'prueba automatizada') as caja \\gset
select retail.fn_sububicacion_por_defecto(:'u', 'venta') as sub \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x, :'u', :'sub', 'entrada', 100, 'colchón de prueba' from unnest(array[:'a1', :'a2', :'a3', :'fuera']::uuid[]) x;
select count(retail.fn_aplicar_movimiento(m.id)) as _ap from retail.movimientos m where m.motivo = 'colchón de prueba' and m.ubicacion_id = :'u' and m.created_at >= now() - interval '1 minute' \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña 3x2 (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
select retail.guardar_oferta_completa(null, :'camp', 'ZZ 3x2', '{"tipo":"nxm","lleva":3,"paga":2}'::jsonb, ${HOY}, ${HOY} + 3, null,
  '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], ${activar}) as r \\gset
select retail.fn_precio_en_sede(:'a1', :'u') as p1, retail.fn_precio_en_sede(:'a2', :'u') as p2, retail.fn_precio_en_sede(:'a3', :'u') as p3 \\gset
-- Las partes que da LA regla: lo mismo que calcula la caja (lib/ofertas-de-grupo.ts).
select coalesce(max(descuento) filter (where linea = 1), 0) as g1, coalesce(max(descuento) filter (where linea = 2), 0) as g2,
       coalesce(max(descuento) filter (where linea = 3), 0) as g3
  from retail.fn_ofertas_de_grupo(${HOY}, :'u', jsonb_build_array(
    jsonb_build_object('variante_id', :'a1', 'precio_unitario', :'p1'::numeric, 'cantidad', 1),
    jsonb_build_object('variante_id', :'a2', 'precio_unitario', :'p2'::numeric, 'cantidad', 1),
    jsonb_build_object('variante_id', :'a3', 'precio_unitario', :'p3'::numeric, 'cantidad', 1)), 0) \\gset
`;
const linea = (v, p, g, extra = "") =>
  `jsonb_build_object('variante_id', :'${v}', 'cantidad', 1, 'precio_unitario', :'${p}'::numeric, 'descuento_unitario', ${g}, 'descuento_grupo_unitario', ${g}, 'oferta_grupo_id', :'r'${extra})`;
const venta = (items, cobro) =>
  `select retail.registrar_venta(:'u', jsonb_build_array(${items}), jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${cobro})), null, gen_random_uuid()) as venta \\gset\n`;
const COBRO = "(:'p1'::numeric + :'p2'::numeric + :'p3'::numeric - :'g1'::numeric - :'g2'::numeric - :'g3'::numeric)";
const TRES = [linea("a1", "p1", ":'g1'::numeric"), linea("a2", "p2", ":'g2'::numeric"), linea("a3", "p3", ":'g3'::numeric")].join(", ");

console.log("\n— La caja cobra un 3x2 —");
esperarValor(
  "una venta con el 3x2 y la parte de cada prenda se guarda: cada línea con su parte y su oferta, y lo regalado es la prenda más barata",
  correr(`${PARTIDA()}${venta(TRES, COBRO)}select concat_ws('|', count(*), sum(vi.descuento_grupo_unitario) = least(:'p1'::numeric, :'p2'::numeric, :'p3'::numeric),
  bool_and(vi.oferta_grupo_id = :'r'), bool_and(vi.descuento_unitario = vi.descuento_grupo_unitario))
  from retail.venta_items vi where vi.venta_id = :'venta';\nrollback;`),
  "3|t|t|t",
);
esperarError(
  "la caja no puede omitir el 3x2",
  correr(`${PARTIDA()}${venta([linea("a1", "p1", "0"), linea("a2", "p2", "0"), linea("a3", "p3", "0")].join(", "), "(:'p1'::numeric + :'p2'::numeric + :'p3'::numeric)")}rollback;`),
  "venta_grupo_omitido",
);
esperarError(
  "ni mandar más de lo que da",
  correr(`${PARTIDA()}${venta([linea("a1", "p1", ":'g1'::numeric + 1"), linea("a2", "p2", ":'g2'::numeric"), linea("a3", "p3", ":'g3'::numeric")].join(", "), `${COBRO} - 1`)}rollback;`),
  "venta_grupo_no_coincide",
);
esperarError(
  "tres prendas iguales en una línea de cantidad 3 no caben en un descuento por unidad: cada una va en su línea",
  correr(`${PARTIDA()}select round(:'p1'::numeric / 3, 2) as g \\gset
${venta(`jsonb_build_object('variante_id', :'a1', 'cantidad', 3, 'precio_unitario', :'p1'::numeric, 'descuento_unitario', :'g'::numeric, 'descuento_grupo_unitario', :'g'::numeric, 'oferta_grupo_id', :'r')`, "(3 * (:'p1'::numeric - :'g'::numeric))")}rollback;`),
  "venta_grupo",
);
esperarError(
  "con la oferta en borrador, la caja no puede mandar la parte del grupo",
  correr(`${PARTIDA("false")}${venta([linea("a1", "p1", "10"), linea("a2", "p2", "0"), linea("a3", "p3", "0")].join(", "), "(:'p1'::numeric + :'p2'::numeric + :'p3'::numeric - 10)")}rollback;`),
  "venta_grupo_no_coincide",
);
esperarValor(
  "un descuento a mano se SUMA a la parte del grupo, con su motivo (Felipe 2026-11-13)",
  correr(`${PARTIDA()}select retail.fn_descuento_campana(:'p1'::numeric, 5) as m \\gset
${venta(
  [
    `jsonb_build_object('variante_id', :'a1', 'cantidad', 1, 'precio_unitario', :'p1'::numeric, 'descuento_unitario', :'g1'::numeric + :'m'::numeric, 'descuento_grupo_unitario', :'g1'::numeric, 'oferta_grupo_id', :'r', 'motivo_descuento', 'prenda_con_desperfecto')`,
    linea("a2", "p2", ":'g2'::numeric"),
    linea("a3", "p3", ":'g3'::numeric"),
  ].join(", "),
  `${COBRO} - :'m'::numeric`,
)}select (descuento_unitario = :'g1'::numeric + :'m'::numeric)::text || '|' || motivo_descuento from retail.venta_items where venta_id = :'venta' and variante_id = :'a1';\nrollback;`),
  "true|prenda_con_desperfecto",
);
esperarError(
  "…pero el descuento a mano sin motivo sigue rechazándose",
  correr(`${PARTIDA()}select retail.fn_descuento_campana(:'p1'::numeric, 5) as m \\gset
${venta(
  [
    `jsonb_build_object('variante_id', :'a1', 'cantidad', 1, 'precio_unitario', :'p1'::numeric, 'descuento_unitario', :'g1'::numeric + :'m'::numeric, 'descuento_grupo_unitario', :'g1'::numeric, 'oferta_grupo_id', :'r')`,
    linea("a2", "p2", ":'g2'::numeric"),
    linea("a3", "p3", ":'g3'::numeric"),
  ].join(", "),
  `${COBRO} - :'m'::numeric`,
)}rollback;`),
  "venta_descuento_requiere_motivo",
);
esperarValor(
  "una venta de una prenda sin oferta de grupo sigue igual",
  correr(`${PARTIDA()}select retail.fn_precio_en_sede(:'fuera', :'u') as pf \\gset
${venta(`jsonb_build_object('variante_id', :'fuera', 'cantidad', 1, 'precio_unitario', :'pf'::numeric, 'descuento_unitario', 0)`, ":'pf'::numeric")}select descuento_grupo_unitario || '|' || coalesce(oferta_grupo_id::text, 'sin oferta') from retail.venta_items where venta_id = :'venta';\nrollback;`),
  "0.00|sin oferta",
);
esperarValor(
  "dos prendas de un 3x2 no arman grupo: pagan su precio sin parte",
  correr(`${PARTIDA()}${venta([linea("a1", "p1", "0"), linea("a2", "p2", "0")].join(", "), "(:'p1'::numeric + :'p2'::numeric)")}select count(*) from retail.venta_items where venta_id = :'venta';\nrollback;`),
  "2",
);

console.log("\n— Lo que lee la caja —");
esperarValor(
  "ofertas_de_grupo_vigentes(Lima) dice el 3x2 de cada prenda que alcanza",
  correr(`${PARTIDA()}select concat_ws('|', (select tipo || lleva || 'x' || paga from retail.ofertas_de_grupo_vigentes(:'u') where variante_id = :'a1'),
  (select count(*) from retail.ofertas_de_grupo_vigentes(:'u') where variante_id = :'fuera'));\nrollback;`),
  "nxm3x2|0",
);

console.log("\n— La migración —");
esperar("se puede pegar dos veces", correr(`begin;\n${ANTES}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}\nrollback;`).ok);

console.log(`\n${total - fallos}/${total} pasaron${sinCaja ? " (con las migraciones metidas en cada transacción: la base local no las tiene)" : ""}.`);
process.exit(fallos ? 1 : 0);
