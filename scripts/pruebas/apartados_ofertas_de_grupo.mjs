#!/usr/bin/env node
/**
 * Pruebas de «los apartados con Llevar varias y pagar menos» (`20261114032000_apartados_con_ofertas_de_grupo.sql`, ADR-0655 actividad 6,
 * parte 4) contra el Postgres local, con apartados de verdad por `separar_prendas`, `editar_separacion_con_total` y `entregar_separacion`.
 *
 * QUÉ PRUEBA (la regla: cada prenda entra con la oferta de SU día y los grupos se arman con el trato que el apartado guardó).
 *   · apartar tres prendas de un 3x2: una fila por prenda con su oferta, la más barata gratis, el trato guardado, el total sin la
 *     regalada y `fn_verificar_separaciones` sin hallazgos; la pantalla no puede omitir ni inflar la parte del grupo;
 *   · quitar una del 3x2: las que quedan pagan completo; la vista previa lo dice antes y el archivo guarda la parte que tenía;
 *   · sumar la que faltaba completa el grupo; el total esperado que no cuadra no guarda nada;
 *   · el trato guardado manda aunque la oferta cambie después, y si la oferta terminó lo que se suma entra a su precio de hoy;
 *   · entregar: cada prenda va a la venta con su parte, sin motivo y con su oferta; un descuento a mano se SUMA a la parte;
 *   · `buscar_separaciones` dice la parte y el trato; la migración se pega dos veces, y las migraciones viejas de los apartados que sus
 *     pruebas vuelven a pegar (ADR-0584, ADR-0399) siguen pegándose sin cambiar nada.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. Si la base local no tiene las migraciones de las ofertas, las aplica dentro.
 *
 * DA POR SENTADO: `Tienda Lima` y la variante `BLU-EMMA-NEG-M` del seed, con al menos 3 variantes en su modelo.
 *
 * USO
 *   pnpm pruebas:apartados-ofertas-de-grupo
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR = process.argv.includes("--contenedor") ? process.argv[process.argv.indexOf("--contenedor") + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261114032000_apartados_con_ofertas_de_grupo.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").filter((l) => !l.startsWith("psql:") || l.includes("ERROR")).slice(0, 6).join("\n    ")}`);
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
const sinApartados = falta("select to_regprocedure('retail.fn_repartir_grupos(jsonb)') is null;");
const ANTES = [
  sinProductos && sinFusion
    ? ["20261112204000_fusionar_productos_base", "20261112205000_fusionar_productos_previsualizar", "20261112210000_fusionar_productos",
        "20261112211000_fusionar_productos_lecturas", "20261113175000_fusionar_productos_tallas_vacias"].map(leer).join("\n")
    : "",
  sinProductos ? leer("20261113210000_oferta_prenda_por_prenda") : "",
  falta("select to_regclass('retail.campana_regla_cesiones') is null;") ? leer("20261113223000_una_oferta_por_prenda_tienda_y_dia") : "",
  falta("select to_regprocedure('retail.fn_variantes_de_oferta(uuid, uuid[], uuid[], uuid[], boolean)') is null;") ? leer("20261113230000_choques_de_oferta_de_una_vez") : "",
  falta("select to_regprocedure('retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)') is null;") ? leer("20261114003000_ofertas_de_grupo") : "",
  falta("select to_regprocedure('retail.fn_exigir_ofertas_de_grupo(jsonb, uuid, date)') is null;") ? leer("20261114011000_caja_cobra_ofertas_de_grupo") : "",
  sinApartados ? readFileSync(MIGRACION, "utf8") : "",
].filter(Boolean).join("\n");

const HOY = "retail.fn_hoy_lima()";
// Tienda Lima lista (caja abierta, stock de sobra), una campaña «ZZ» con la categoría de la Blusa Emma y su 3x2; tres variantes del modelo y
// una prenda de otra categoría. s1, s2, s3: la parte de cada prenda en el orden de los apartados (de la más cara; empate, por prenda).
const PARTIDA = `begin;
${ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as a1, p.id as modelo, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select v.id as a2 from retail.variantes v where v.producto_id = :'modelo' and v.id <> :'a1' and v.activo order by v.id limit 1 \\gset
select v.id as a3 from retail.variantes v where v.producto_id = :'modelo' and v.id not in (:'a1', :'a2') and v.activo order by v.id limit 1 \\gset
-- La prenda de otra categoría, fija del seed (el Vestido Sofía, S/ 149.90): elegirla «por id» tomaba la que otra prueba de la misma tanda
-- hubiera dejado, y con una de S/ 179.90 el adelanto de S/ 100 ya no llegaba al 30 % (CI de #1856).
select v.id as fuera from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'VES-SOFI-NEG-M' and p.categoria_id <> :'cat' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'u', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'u' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'u' and estado = 'abierta') x) as _cerro \\gset
select retail.abrir_caja(:'u', 100.00, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BL99' when 'factura' then 'FL99' else serie end, siguiente_numero = 1
 where ubicacion_id = :'u' and tipo in ('boleta', 'factura');
select retail.fn_sububicacion_por_defecto(:'u', 'venta') as sub \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x, :'u', :'sub', 'entrada', 100, 'colchón de prueba' from unnest(array[:'a1', :'a2', :'a3', :'fuera']::uuid[]) x;
select count(retail.fn_aplicar_movimiento(m.id)) as _ap from retail.movimientos m where m.motivo = 'colchón de prueba' and m.ubicacion_id = :'u' and m.created_at >= now() - interval '1 minute' \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña 3x2 (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
select retail.guardar_oferta_completa(null, :'camp', 'ZZ 3x2', '{"tipo":"nxm","lleva":3,"paga":2}'::jsonb, ${HOY}, ${HOY} + 3, null,
  '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true) as r \\gset
select retail.fn_precio_en_sede(:'a1', :'u') as p1, retail.fn_precio_en_sede(:'a2', :'u') as p2, retail.fn_precio_en_sede(:'a3', :'u') as p3,
       retail.fn_precio_en_sede(:'fuera', :'u') as pf \\gset
select least(:'p1'::numeric, :'p2'::numeric, :'p3'::numeric) as minimo \\gset
with l as (
  select row_number() over (order by t.p desc, t.v)::integer as linea, t.v, t.p
  from (values (:'a1'::uuid, :'p1'::numeric), (:'a2'::uuid, :'p2'::numeric), (:'a3'::uuid, :'p3'::numeric)) t(v, p)
),
g as (select * from retail.fn_ofertas_de_grupo(${HOY}, :'u',
        (select jsonb_agg(jsonb_build_object('variante_id', l.v, 'precio_unitario', l.p, 'cantidad', 1) order by l.linea) from l), 0))
select coalesce(max(g.descuento) filter (where l.v = :'a1'::uuid), 0) as s1, coalesce(max(g.descuento) filter (where l.v = :'a2'::uuid), 0) as s2,
       coalesce(max(g.descuento) filter (where l.v = :'a3'::uuid), 0) as s3
  from l join g on g.linea = l.linea \\gset
`;
/** Una prenda como la manda la pantalla de Apartar: su precio, su descuento (campaña o a mano) y la parte de su oferta de grupo. */
const prenda = (v, p, grupo = "0", extra = "") =>
  `jsonb_build_object('variante_id', :'${v}', 'cantidad', 1, 'precio_unitario', :'${p}'::numeric, 'descuento_unitario', 0, 'descuento_grupo', ${grupo}${extra})`;
const TRES = [prenda("a1", "p1", ":'s1'::numeric"), prenda("a2", "p2", ":'s2'::numeric"), prenda("a3", "p3", ":'s3'::numeric")].join(", ");
const separar = (items, adelanto = 50, como = "sep") => `select retail.separar_prendas(
    p_ubicacion_id => :'u', p_items => jsonb_build_array(${items}),
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', ${adelanto})),
    p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Prueba Grupo', p_clienta_celular => '955065500',
    p_devolucion_medio => 'yape') as ${como} \\gset
`;
const fila = (v, como) => `select id as ${como} from retail.separacion_items where separacion_id = :'sep' and variante_id = :'${v}' limit 1 \\gset\n`;
const vistaPrevia = (quitar, agregar) =>
  `select retail.previsualizar_edicion_separacion(:'sep', ${quitar}, ${agregar}) as pv \\gset
select (:'pv'::jsonb ->> 'total')::numeric as pt \\gset
`;
const editar = (quitar, agregar, esperado = ":'pt'::numeric") =>
  `select retail.editar_separacion_con_total(:'sep', ${quitar}, ${agregar}, gen_random_uuid(), ${esperado}) as ed \\gset\n`;
const VERIFICAR = "(select count(*) from retail.fn_verificar_separaciones())";

console.log("\n— Apartar con un 3x2 —");
esperarValor(
  "apartar tres del 3x2: una fila por prenda con su oferta, la más barata gratis, el trato guardado y el total sin la regalada",
  correr(`${PARTIDA}${separar(TRES)}select concat_ws('|', count(*), bool_and(si.cantidad = 1 and si.oferta_grupo_id = :'r'),
    sum(si.descuento_grupo_unitario) = :'minimo'::numeric,
    bool_and(si.descuento_grupo_unitario = case si.variante_id when :'a1' then :'s1'::numeric when :'a2' then :'s2'::numeric else :'s3'::numeric end),
    (select total from retail.separaciones where id = :'sep') = :'p1'::numeric + :'p2'::numeric + :'p3'::numeric - :'minimo'::numeric,
    (select count(*) || ':' || min(tipo || lleva || 'x' || paga) from retail.separacion_ofertas_grupo where separacion_id = :'sep'),
    ${VERIFICAR})
  from retail.separacion_items si where si.separacion_id = :'sep';\nrollback;`),
  "3|t|t|t|t|1:nxm3x2|0",
);
esperarError(
  "la pantalla no puede omitir la parte del 3x2",
  correr(`${PARTIDA}${separar([prenda("a1", "p1"), prenda("a2", "p2"), prenda("a3", "p3")].join(", "))}rollback;`),
  "separacion_grupo_no_coincide",
);
esperarError(
  "ni mandar más de lo que da",
  correr(`${PARTIDA}${separar([prenda("a1", "p1", ":'s1'::numeric + 1"), prenda("a2", "p2", ":'s2'::numeric"), prenda("a3", "p3", ":'s3'::numeric")].join(", "))}rollback;`),
  "separacion_grupo_no_coincide",
);
esperarValor(
  "dos del 3x2 no arman grupo: pagan completo, pero quedan con su oferta para completarlo",
  correr(`${PARTIDA}${separar([prenda("a1", "p1"), prenda("a2", "p2")].join(", "))}select concat_ws('|', count(*), bool_and(si.oferta_grupo_id = :'r'),
    sum(si.descuento_grupo_unitario), (select total from retail.separaciones where id = :'sep') = :'p1'::numeric + :'p2'::numeric)
  from retail.separacion_items si where si.separacion_id = :'sep';\nrollback;`),
  "2|t|0.00|t",
);
esperarValor(
  "una prenda sin oferta de grupo se aparta como siempre",
  correr(`${PARTIDA}${separar(prenda("fuera", "pf"), 60)}select si.descuento_grupo_unitario || '|' || coalesce(si.oferta_grupo_id::text, 'sin oferta') || '|' || ${VERIFICAR}
  from retail.separacion_items si where si.separacion_id = :'sep';\nrollback;`),
  "0.00|sin oferta|0",
);
esperarValor(
  "un descuento a mano se SUMA a la parte del grupo, con su motivo y sin campaña (Felipe 2026-11-13)",
  correr(`${PARTIDA}select retail.fn_descuento_campana(:'p1'::numeric, 5) as m \\gset
${separar([prenda("a1", "p1", ":'s1'::numeric", ", 'descuento_unitario', :'m'::numeric, 'motivo_descuento', 'prenda_con_desperfecto'"), prenda("a2", "p2", ":'s2'::numeric"), prenda("a3", "p3", ":'s3'::numeric")].join(", "))}
select concat_ws('|', si.descuento_unitario = :'m'::numeric + :'s1'::numeric, si.motivo_descuento, si.descuento_etiqueta_id is null,
    (select total from retail.separaciones where id = :'sep') = :'p1'::numeric + :'p2'::numeric + :'p3'::numeric - :'minimo'::numeric - :'m'::numeric, ${VERIFICAR})
  from retail.separacion_items si where si.separacion_id = :'sep' and si.variante_id = :'a1';\nrollback;`),
  "t|prenda_con_desperfecto|t|t|0",
);

console.log("\n— Editar un apartado con un 3x2 —");
esperarValor(
  "quitar una de las tres: las que quedan pagan completo, la vista previa lo dijo antes y el archivo guarda la parte que tenía",
  correr(`${PARTIDA}${separar(TRES)}${fila("a3", "q3")}${vistaPrevia("array[:'q3']::uuid[]", "'[]'::jsonb")}${editar("array[:'q3']::uuid[]", "'[]'::jsonb")}
select concat_ws('|', :'pt'::numeric = :'p1'::numeric + :'p2'::numeric, (:'ed'::jsonb ->> 'total')::numeric = :'pt'::numeric,
    (select sum(descuento_grupo_unitario) from retail.separacion_items where separacion_id = :'sep'),
    (select descuento_grupo_unitario = :'s3'::numeric and oferta_grupo_id = :'r' from retail.separacion_items_retirados where id = :'q3'), ${VERIFICAR});\nrollback;`),
  "t|t|0.00|t|0",
);
esperarValor(
  "sumar la que faltaba completa el grupo, con el total que dijo la vista previa",
  correr(`${PARTIDA}${separar([prenda("a1", "p1"), prenda("a2", "p2")].join(", "))}${vistaPrevia("'{}'::uuid[]", `jsonb_build_array(${prenda("a3", "p3")})`)}${editar("'{}'::uuid[]", `jsonb_build_array(${prenda("a3", "p3")})`)}
select concat_ws('|', :'pt'::numeric = :'p1'::numeric + :'p2'::numeric + :'p3'::numeric - :'minimo'::numeric,
    (select total from retail.separaciones where id = :'sep') = :'pt'::numeric,
    (select count(*) from retail.separacion_items where separacion_id = :'sep' and oferta_grupo_id = :'r'), ${VERIFICAR});\nrollback;`),
  "t|t|3|0",
);
esperarError(
  "el total esperado que no cuadra no guarda nada",
  correr(`${PARTIDA}${separar(TRES)}${fila("a3", "q3")}${editar("array[:'q3']::uuid[]", "'[]'::jsonb", ":'p1'::numeric + :'p2'::numeric + 1")}rollback;`),
  "separacion_total_cambio",
);
esperarValor(
  "el trato guardado manda aunque la oferta cambie después: con el 3x2 pasado a 4x3, sumar otra prenda deja el 3x2 de ese día",
  correr(`${PARTIDA}${separar(TRES, 100)}update retail.campana_reglas set lleva = 4, paga = 3 where id = :'r';
${vistaPrevia("'{}'::uuid[]", `jsonb_build_array(${prenda("fuera", "pf")})`)}${editar("'{}'::uuid[]", `jsonb_build_array(${prenda("fuera", "pf")})`)}
select concat_ws('|', (select total from retail.separaciones where id = :'sep') = :'p1'::numeric + :'p2'::numeric + :'p3'::numeric - :'minimo'::numeric + :'pf'::numeric,
    (select sum(descuento_grupo_unitario) from retail.separacion_items where separacion_id = :'sep') = :'minimo'::numeric, ${VERIFICAR});\nrollback;`),
  "t|t|0",
);
esperarValor(
  "si la oferta terminó, la prenda que se suma entra a su precio de hoy y no completa el grupo",
  correr(`${PARTIDA}${separar([prenda("a1", "p1"), prenda("a2", "p2")].join(", "), 100)}update retail.campana_reglas set estado = 'desactivada' where id = :'r';
${vistaPrevia("'{}'::uuid[]", `jsonb_build_array(${prenda("a3", "p3")})`)}${editar("'{}'::uuid[]", `jsonb_build_array(${prenda("a3", "p3")})`)}
select concat_ws('|', (select total from retail.separaciones where id = :'sep') = :'p1'::numeric + :'p2'::numeric + :'p3'::numeric,
    (select coalesce(oferta_grupo_id::text, 'sin oferta') from retail.separacion_items where separacion_id = :'sep' and variante_id = :'a3'), ${VERIFICAR});\nrollback;`),
  "t|sin oferta|0",
);

console.log("\n— Entregar y leer —");
esperarValor(
  "entregar: cada prenda va a la venta con su parte, sin motivo y con su oferta, y lo cobrado cuadra con el apartado",
  correr(`${PARTIDA}${separar(TRES)}select total - adelanto as saldo from retail.separaciones where id = :'sep' \\gset
select retail.entregar_separacion(:'sep', jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', :'saldo'::numeric))) as venta \\gset
select concat_ws('|', count(*), sum(vi.descuento_grupo_unitario) = :'minimo'::numeric, bool_and(vi.motivo_descuento is null and vi.descuento_etiqueta_id is null),
    bool_and(vi.oferta_grupo_id = :'r'), sum((vi.precio_unitario - vi.descuento_unitario) * vi.cantidad) = (select total from retail.separaciones where id = :'sep'),
    (select sum(monto) from retail.venta_pagos where venta_id = :'venta') = (select total from retail.separaciones where id = :'sep'))
  from retail.venta_items vi where vi.venta_id = :'venta';\nrollback;`),
  "3|t|t|t|t|t",
);
esperarValor(
  "buscar_separaciones dice la parte de cada prenda y el trato de su oferta",
  correr(`${PARTIDA}${separar(TRES)}select concat_ws('|', (select sum((i ->> 'descuento_grupo_unitario')::numeric) = :'minimo'::numeric
      from retail.buscar_separaciones(:'u', 'Prueba Grupo') b, jsonb_array_elements(b.items) i where b.id = :'sep'),
    (select min(i -> 'oferta_grupo' ->> 'nombre') || ':' || min(i -> 'oferta_grupo' ->> 'lleva')
      from retail.buscar_separaciones(:'u', 'Prueba Grupo') b, jsonb_array_elements(b.items) i where b.id = :'sep'));\nrollback;`),
  "t|ZZ 3x2:3",
);

console.log("\n— Las migraciones —");
esperar("se puede pegar dos veces", correr(`begin;\n${ANTES}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}\nrollback;`).ok);
// Las pruebas de ADR-0584 y ADR-0399 vuelven a pegar sus migraciones sobre la función viva: con esta encima tienen que seguir sin cambiar nada.
const VIEJAS = ["20261030220000_apartar_con_descuento_manual", "20261030221000_editar_apartado_con_descuento", "20261030234000_apartado_dice_su_descuento",
  "20261014150000_apartados_entregar_boleta_por_el_total", "20261014151000_apartados_constancia_sin_comprobante"];
const HUELLAS = `(select string_agg(p.proname || '=' || md5(pg_get_functiondef(p.oid)), ',' order by p.proname) from pg_proc p
   where p.pronamespace = 'retail'::regnamespace and p.proname in ('separar_prendas', 'editar_separacion', 'entregar_separacion', 'buscar_separaciones'))`;
esperarValor(
  "las migraciones viejas de los apartados (ADR-0584, ADR-0399) se vuelven a pegar encima sin cambiar nada",
  correr(`begin;\n${ANTES}\n${sinApartados ? "" : readFileSync(MIGRACION, "utf8")}\nselect ${HUELLAS} as h0 \\gset\n${VIEJAS.map(leer).join("\n")}\nselect :'h0' = ${HUELLAS};\nrollback;`),
  "t",
);

console.log(`\n${total - fallos}/${total} pasaron${sinApartados ? " (con las migraciones metidas en cada transacción: la base local no las tiene)" : ""}.`);
process.exit(fallos ? 1 : 0);
