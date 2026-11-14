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

import { DESHACER_DIA_VENTA, DESHACER_DOS_OFERTAS } from "./registrar-venta-antes-de-precio-sede.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR = process.argv.includes("--contenedor") ? process.argv[process.argv.indexOf("--contenedor") + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261114011000_caja_cobra_ofertas_de_grupo.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001";
const DOS_OFERTAS = "20261114155000_dos_ofertas_la_que_mas_ahorra";

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
  // Auditoría final (20261114064000): Finanzas ▸ Campañas suma lo que regaló la oferta de grupo a su campaña.
  falta("select position('oferta_grupo_id' in pg_get_functiondef('retail.fn_campanas_reporte(uuid)'::regprocedure)) = 0;")
    ? leer("20261114064000_finanzas_campanas_con_ofertas_de_grupo")
    : "",
  // Felipe 2026-11-14 (20261114132000): una venta sin conexión se mide con las ofertas de la hora en que se hizo.
  falta("select to_regprocedure('retail.fn_dia_de_la_venta()') is null;") ? leer("20261114132000_venta_sin_conexion_con_las_ofertas_de_su_hora") : "",
  // Felipe 2026-11-14 (20261114131000): Frescura cuenta la parte del 3x2, del monto y del Club como campaña, no como liquidación.
  falta("select position('descuento_grupo_unitario' in pg_get_functiondef('retail.fn_frescura_decisiones(uuid, integer)'::regprocedure)) = 0;")
    ? leer("20261114131000_frescura_ofertas_y_club_como_campana")
    : "",
  // Felipe 2026-11-14 (20261114155000): una prenda con rebaja y 3x2 lleva la que más le ahorra al cliente, nunca las dos. Pide antes la
  // tienda web (20261114041000) y el monto (20261114044000), que la base local puede no tener.
  falta("select to_regprocedure('retail.tienda_bolsa_grupos(jsonb, uuid)') is null;") ? leer("20261114041000_tienda_web_ofertas_de_grupo") : "",
  falta("select to_regprocedure('retail.fn_escalones_validos(jsonb, text)') is null;") ? leer("20261114044000_monto_con_escalones") : "",
  falta("select to_regprocedure('retail.fn_cuenta_de_grupos(jsonb)') is null;") ? leer(DOS_OFERTAS) : "",
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

console.log("\n— Finanzas ▸ Campañas —");
esperarValor(
  "lo que regaló el 3x2 se le carga a su campaña: el descuento del informe es la prenda más barata, sin IGV",
  correr(`${PARTIDA()}${venta(TRES, COBRO)}select (select descuento from retail.fn_campanas_reporte(null) where etiqueta_id = :'camp')
    = round(least(:'p1'::numeric, :'p2'::numeric, :'p3'::numeric) / (1 + retail.fn_tasa_igv(${HOY})), 2);\nrollback;`),
  "t",
);
esperar(
  "la migración del informe se puede pegar dos veces",
  correr(`begin;\n${ANTES}\n${leer("20261114064000_finanzas_campanas_con_ofertas_de_grupo")}\n${leer("20261114064000_finanzas_campanas_con_ofertas_de_grupo")}\nrollback;`).ok,
);

console.log("\n— Una venta sin conexión (20261114132000) —");
// El 3x2 empieza HOY. Una venta hecha sin red AYER (la cola manda su hora en `x-momento`) que no lo dio entra; la misma sin hora, se rechaza.
const HORA = (intervalo) =>
  `select set_config('request.headers', json_build_object('x-momento', to_char(now() - interval '${intervalo}', 'YYYY-MM-DD"T"HH24:MI:SSOF'))::text, true) as _h \\gset\n`;
const SIN_3X2 = [linea("a1", "p1", "0"), linea("a2", "p2", "0"), linea("a3", "p3", "0")].join(", ");
const COBRO_SIN = "(:'p1'::numeric + :'p2'::numeric + :'p3'::numeric)";
esperarValor(
  "hecha ayer sin red, sin el 3x2 que empezó hoy: entra con lo que se cobró",
  correr(`${PARTIDA()}${HORA("1 day")}${venta(SIN_3X2, COBRO_SIN)}select count(*) from retail.venta_items where venta_id = :'venta';\nrollback;`),
  "3",
);
esperarError(
  "con una hora de hace más de 3 días se mide con hoy, y se rechaza como una venta en línea",
  correr(`${PARTIDA()}${HORA("4 days")}${venta(SIN_3X2, COBRO_SIN)}rollback;`),
  "venta_grupo_omitido",
);
// Lo mismo con el % de siempre: una campaña de −20 % en la categoría de «fuera» que empieza hoy.
const CAMPANA_DE_HOY = `select p.categoria_id as cat_fuera from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = :'fuera' \\gset
select retail.fn_precio_en_sede(:'fuera', :'u') as pf \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña de hoy (prueba)', 'campana') returning id as camp2 \\gset
select retail.actualizar_campana_etiqueta(:'camp2', 20, ${HOY}, ${HOY} + 10, array[:'cat_fuera']::uuid[]);
`;
const SIN_RABAJA = `select retail.registrar_venta(:'u', jsonb_build_array(jsonb_build_object('variante_id', :'fuera', 'cantidad', 1, 'precio_unitario', :'pf'::numeric,
  'descuento_unitario', 0)), jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'pf'::numeric)), null, gen_random_uuid()) as venta \\gset\n`;
esperarValor(
  "y con la campaña de siempre: hecha ayer sin red, sin el −20 % que empezó hoy, entra",
  correr(`${PARTIDA()}${CAMPANA_DE_HOY}${HORA("1 day")}${SIN_RABAJA}select count(*) from retail.venta_items where venta_id = :'venta';\nrollback;`),
  "1",
);
esperarError(
  "…y en línea, sin hora, la misma venta se rechaza (la caja tenía que darlo)",
  correr(`${PARTIDA()}${CAMPANA_DE_HOY}${SIN_RABAJA}rollback;`),
  "venta_campana_omitida",
);
esperarError(
  "CONTROL: sin la migración, la venta de ayer sin red se rechaza: la prueba ve la diferencia",
  correr(`${PARTIDA()}${DESHACER_DIA_VENTA}\n${HORA("1 day")}${venta(SIN_3X2, COBRO_SIN)}rollback;`),
  "venta_grupo_omitido",
);
esperar(
  "la migración de la venta sin conexión se puede pegar dos veces",
  correr(`begin;\n${ANTES}\n${leer("20261114132000_venta_sin_conexion_con_las_ofertas_de_su_hora")}\n${leer("20261114132000_venta_sin_conexion_con_las_ofertas_de_su_hora")}\nrollback;`).ok,
);

console.log("\n— Frescura (20261114131000) —");
// Una «La rebajé» de ayer sobre el modelo y el color de a1; hoy se vende a1 en el 3x2 (su parte del grupo, sin motivo) y otra a1 con solo
// la parte del Club. Lo que Frescura dice de cada venta: «campana» en las dos, nunca «otro» (que la web cuenta como liquidación).
const FRESCURA = `select id as pers from public.personas where auth_user_id = '${FELIPE}' \\gset
select color_codigo as col from retail.variantes where id = :'a1' \\gset
insert into retail.frescura_decisiones (ubicacion_id, producto_id, color_codigo, accion, plazo_dias, persona_id, token_cliente, creado_en)
  values (:'u', :'modelo', :'col', 'rebaje', 15, :'pers', gen_random_uuid(), now() - interval '1 day');
insert into retail.ventas (ubicacion_id, estado, created_at) values (:'u', 'completada', now()) returning id as vclub \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario, descuento_unitario, descuento_club_unitario)
  values (:'vclub', :'a1', 1, 100, 40, 5, 5);
-- Solo las ventas de esta prueba (las de la transacción llevan now()): la base del CI trae otras del mismo modelo.
select (count(*) >= 2) || ':' || string_agg(distinct coalesce(v ->> 2, 'sin_descuento'), ',')
  from jsonb_array_elements(retail.fn_frescura_decisiones(:'u', 30) -> 'decisiones') e, jsonb_array_elements(e -> 'ventas') v
 where e ->> 'producto_id' = :'modelo' and (v ->> 0)::timestamptz = now();
`;
esperarValor(
  "«La rebajé» cuenta la parte del 3x2 y la del Club como campaña, no como liquidación",
  correr(`${PARTIDA()}${venta(TRES, COBRO)}${FRESCURA}rollback;`),
  // a1 y las otras tallas de su color en el 3x2, más la del Club: todas «campana».
  "true:campana",
);
const DESHACER_FRESCURA = (() => {
  const m = leer("20261114131000_frescura_ofertas_y_club_como_campana").match(/\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$/);
  if (!m) throw new Error("No se pudo leer el reemplazo de 20261114131000.");
  return `do $d$ declare d text := pg_get_functiondef('retail.fn_frescura_decisiones(uuid, integer)'::regprocedure); begin
  execute replace(d, $n$${m[2]}$n$, $v$${m[1]}$v$); end $d$;\n`;
})();
esperarValor(
  "CONTROL: sin la migración, las mismas ventas salen como «otro» (liquidación): la prueba ve la diferencia",
  correr(`${PARTIDA()}${DESHACER_FRESCURA}${venta(TRES, COBRO)}${FRESCURA}rollback;`),
  "true:otro",
);
esperar(
  "la migración de Frescura se puede pegar dos veces",
  correr(`begin;\n${ANTES}\n${leer("20261114131000_frescura_ofertas_y_club_como_campana")}\n${leer("20261114131000_frescura_ofertas_y_club_como_campana")}\nrollback;`).ok,
);

console.log("\n— Una rebaja y un 3x2 en la misma prenda: la que más ahorra, nunca las dos (20261114155000) —");
// La rebaja llega por fuera de la hoja de la oferta: el descuento de siempre de otra campaña sobre la misma categoría (como al sumarle una
// categoría o reactivarla). El candado de los choques es diferido: dentro de la transacción no alcanza a mirar, como pasa en producción.
const REBAJA = (pct = 20) => `insert into retail.etiquetas (nombre, estilo) values ('ZZ Rebaja (prueba)', 'campana') returning id as reb \\gset
select retail.actualizar_campana_etiqueta(:'reb', ${pct}, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
select retail.fn_descuento_campana(:'p1'::numeric, ${pct}) as c1, retail.fn_descuento_campana(:'p2'::numeric, ${pct}) as c2,
       retail.fn_descuento_campana(:'p3'::numeric, ${pct}) as c3 \\gset
select coalesce(max(descuento) filter (where linea = 1), 0) as h1, coalesce(max(descuento) filter (where linea = 2), 0) as h2,
       coalesce(max(descuento) filter (where linea = 3), 0) as h3
  from retail.fn_ofertas_de_grupo(${HOY}, :'u', jsonb_build_array(
    jsonb_build_object('variante_id', :'a1', 'precio_unitario', :'p1'::numeric, 'cantidad', 1),
    jsonb_build_object('variante_id', :'a2', 'precio_unitario', :'p2'::numeric, 'cantidad', 1),
    jsonb_build_object('variante_id', :'a3', 'precio_unitario', :'p3'::numeric, 'cantidad', 1)), 0) \\gset
`;
const conRebaja = (v, p, c) =>
  `jsonb_build_object('variante_id', :'${v}', 'cantidad', 1, 'precio_unitario', :'${p}'::numeric, 'descuento_unitario', :'${c}'::numeric, 'motivo_descuento', 'campana', 'descuento_etiqueta_id', :'reb')`;
const lasDos = (v, p, h, c) =>
  `jsonb_build_object('variante_id', :'${v}', 'cantidad', 1, 'precio_unitario', :'${p}'::numeric, 'descuento_unitario', :'${h}'::numeric + :'${c}'::numeric, 'descuento_grupo_unitario', :'${h}'::numeric, 'oferta_grupo_id', :'r', 'motivo_descuento', 'campana', 'descuento_etiqueta_id', :'reb')`;
const TRES_H = [linea("a1", "p1", ":'h1'::numeric"), linea("a2", "p2", ":'h2'::numeric"), linea("a3", "p3", ":'h3'::numeric")].join(", ");
const COBRO_H = "(:'p1'::numeric + :'p2'::numeric + :'p3'::numeric - :'h1'::numeric - :'h2'::numeric - :'h3'::numeric)";
const TRES_REBAJA = [conRebaja("a1", "p1", "c1"), conRebaja("a2", "p2", "c2"), conRebaja("a3", "p3", "c3")].join(", ");
const COBRO_REBAJA = "(:'p1'::numeric + :'p2'::numeric + :'p3'::numeric - :'c1'::numeric - :'c2'::numeric - :'c3'::numeric)";
const TRES_LAS_DOS = [lasDos("a1", "p1", "h1", "c1"), lasDos("a2", "p2", "h2", "c2"), lasDos("a3", "p3", "h3", "c3")].join(", ");
const COBRO_LAS_DOS = `(${COBRO_H} - :'c1'::numeric - :'c2'::numeric - :'c3'::numeric)`;

esperarValor(
  "con una prenda, gana su rebaja: la regla no le da parte del 3x2 y la venta con su −20 % se guarda",
  correr(`${PARTIDA()}${REBAJA()}select coalesce(sum(descuento), -1) as uno from retail.fn_ofertas_de_grupo(${HOY}, :'u',
    jsonb_build_array(jsonb_build_object('variante_id', :'a1', 'precio_unitario', :'p1'::numeric, 'cantidad', 1)), 0) \\gset
${venta(conRebaja("a1", "p1", "c1"), "(:'p1'::numeric - :'c1'::numeric)")}select concat_ws('|', :'uno'::numeric = 0,
  (select vi.descuento_unitario = :'c1'::numeric and vi.descuento_grupo_unitario = 0 and vi.motivo_descuento = 'campana' from retail.venta_items vi where vi.venta_id = :'venta'));\nrollback;`),
  "t|t",
);
esperarValor(
  "con tres, gana el 3x2 (regala la más barata, más que tres −20 %): cada prenda va con su parte, sin su rebaja ni su campaña",
  correr(`${PARTIDA()}${REBAJA()}${venta(TRES_H, COBRO_H)}select concat_ws('|', :'h1'::numeric = :'g1'::numeric and :'h2'::numeric = :'g2'::numeric and :'h3'::numeric = :'g3'::numeric,
  count(*), sum(vi.descuento_grupo_unitario) = least(:'p1'::numeric, :'p2'::numeric, :'p3'::numeric),
  bool_and(vi.descuento_unitario = vi.descuento_grupo_unitario and vi.motivo_descuento is null and vi.descuento_etiqueta_id is null))
  from retail.venta_items vi where vi.venta_id = :'venta';\nrollback;`),
  "t|3|t|t",
);
esperarError(
  "… y la caja no puede mandar las dos: la parte del 3x2 más la rebaja se rechaza (venta_dos_ofertas)",
  correr(`${PARTIDA()}${REBAJA()}${venta(TRES_LAS_DOS, COBRO_LAS_DOS)}rollback;`),
  "venta_dos_ofertas",
);
esperarError(
  "… ni solo las rebajas: el 3x2 le ahorra más al cliente y la caja tiene que darlo (venta_grupo_omitido)",
  correr(`${PARTIDA()}${REBAJA()}${venta(TRES_REBAJA, COBRO_REBAJA)}rollback;`),
  "venta_grupo_omitido",
);
esperarValor(
  "con una rebaja mayor (−50 %), gana la rebaja aunque sean tres: la regla no da parte del 3x2 y la venta con sus rebajas se guarda",
  correr(`${PARTIDA()}${REBAJA(50)}${venta(TRES_REBAJA, COBRO_REBAJA)}select concat_ws('|', :'h1'::numeric + :'h2'::numeric + :'h3'::numeric,
  sum(vi.descuento_grupo_unitario), bool_and(vi.motivo_descuento = 'campana'))
  from retail.venta_items vi where vi.venta_id = :'venta';\nrollback;`),
  "0|0.00|t",
);
// Cuatro prendas: tres arman el 3x2 y la que no completa otro grupo conserva su rebaja (la caja la manda con su campaña).
const CUATRO = `with l(n, v, p) as (values (1, :'a1'::uuid, :'p1'::numeric), (2, :'a2'::uuid, :'p2'::numeric), (3, :'a3'::uuid, :'p3'::numeric), (4, :'a1'::uuid, :'p1'::numeric)),
g as (select * from retail.fn_ofertas_de_grupo(${HOY}, :'u', (select jsonb_agg(jsonb_build_object('variante_id', l.v, 'precio_unitario', l.p, 'cantidad', 1) order by l.n) from l), 0))
select jsonb_agg(case when g.descuento > 0
                      then jsonb_build_object('variante_id', l.v, 'cantidad', 1, 'precio_unitario', l.p, 'descuento_unitario', g.descuento,
                                              'descuento_grupo_unitario', g.descuento, 'oferta_grupo_id', g.regla_id)
                      else jsonb_build_object('variante_id', l.v, 'cantidad', 1, 'precio_unitario', l.p, 'descuento_unitario', retail.fn_descuento_campana(l.p, 20),
                                              'motivo_descuento', 'campana', 'descuento_etiqueta_id', :'reb') end order by l.n) as items,
       sum(l.p - case when g.descuento > 0 then g.descuento else retail.fn_descuento_campana(l.p, 20) end) as cobro,
       count(*) filter (where g.descuento = 0) as sueltas
  from l join g on g.linea = l.n \\gset
select retail.registrar_venta(:'u', :'items'::jsonb, jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'cobro'::numeric)), null, gen_random_uuid()) as venta \\gset
`;
esperarValor(
  "de cuatro, tres van en el 3x2 y la cuarta conserva su −20 %: la venta se guarda con una línea de campaña y tres del grupo",
  correr(`${PARTIDA()}${REBAJA()}${CUATRO}select concat_ws('|', :'sueltas',
  (select count(*) from retail.venta_items vi where vi.venta_id = :'venta' and vi.motivo_descuento = 'campana' and vi.descuento_grupo_unitario = 0),
  (select count(*) from retail.venta_items vi where vi.venta_id = :'venta' and vi.descuento_grupo_unitario > 0 and vi.motivo_descuento is null));\nrollback;`),
  "1|1|3",
);
// Sin la migración: la cuenta de siempre y registrar_venta sin el candado. Las dos ofertas en la misma prenda pasaban.
const SIN_DOS_OFERTAS = `${DESHACER_DOS_OFERTAS}
create or replace function retail.fn_repartir_grupos(p_unidades jsonb)
returns table (linea integer, regla_id uuid, descuento numeric, faltan integer) language sql stable
as $f$ select * from retail.fn_cuenta_de_grupos(p_unidades) $f$;
`;
esperar(
  "CONTROL: sin la migración, la parte del 3x2 más la rebaja pasaban (el regalo doble): la prueba ve la diferencia",
  correr(`${PARTIDA()}${REBAJA()}${SIN_DOS_OFERTAS}${venta(TRES_LAS_DOS, COBRO_LAS_DOS)}rollback;`).ok,
);
esperar(
  "la migración de las dos ofertas se puede pegar dos veces",
  correr(`begin;\n${ANTES}\n${leer(DOS_OFERTAS)}\n${leer(DOS_OFERTAS)}\nrollback;`).ok,
);

console.log("\n— La migración —");
esperar("se puede pegar dos veces", correr(`begin;\n${ANTES}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}\nrollback;`).ok);

console.log(`\n${total - fallos}/${total} pasaron${sinCaja ? " (con las migraciones metidas en cada transacción: la base local no las tiene)" : ""}.`);
process.exit(fallos ? 1 : 0);
