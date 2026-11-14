#!/usr/bin/env node
/**
 * Pruebas de «Gastar un monto y ahorrar» con escalones (`20261114044000_monto_con_escalones.sql`, ADR-0655 actividad 8, parte 1) contra el
 * Postgres local.
 *
 * QUÉ PRUEBA.
 *   · LA cuenta: el escalón más alto al que llega la compra, en soles o en % (con el redondeo de la caja), repartido entre sus prendas en
 *     proporción al precio y en céntimos exactos; «toda la compra» o solo las prendas de la campaña;
 *   · la regla de Felipe (decisión 3): una prenda con un «% menos», un descuento de siempre o una oferta de grupo no cuenta para el monto;
 *   · los choques: un monto choca con lo que pisa, salvo que «las prendas con otra oferta no cuenten»; dos montos chocan siempre;
 *   · los dos arreglos: una oferta de grupo que cedió a un «% menos» se calla, y con la tolerancia de una venta sin conexión gana la de hoy;
 *   · `guardar_oferta_completa` valida los escalones, la tabla no deja un monto a medias, y `campana_reglas()` lo devuelve con su historia;
 *   · la caja (`registrar_venta`) y un apartado (`separar_prendas` y su edición) cobran el monto sin tocar sus funciones;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. Lo que la base local no tenga de las ofertas, lo aplica dentro de cada escenario.
 *
 * DA POR SENTADO: `Tienda Lima` y la variante `BLU-EMMA-NEG-M` del seed, con al menos 3 variantes en su modelo y una prenda de otra categoría.
 *
 * USO
 *   pnpm pruebas:monto-con-escalones
 *   pnpm pruebas:monto-con-escalones -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261114044000_monto_con_escalones.sql";
const UNA_FIRMA = "supabase/migrations/20261114054000_choques_con_forma_una_sola_firma.sql";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
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
  console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
  process.exit(2);
}

// Lo que la base local todavía no tenga, dentro de cada escenario.
const falta = (sql) => correr(sql).salida === "t";
const leer = (n) => readFileSync(`supabase/migrations/${n}.sql`, "utf8");
const sinFusion = falta("select to_regprocedure('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)') is null;");
const sinProductos = falta("select to_regclass('retail.campana_regla_productos') is null;");
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
  falta("select to_regprocedure('retail.fn_repartir_grupos(jsonb)') is null;") ? leer("20261114032000_apartados_con_ofertas_de_grupo") : "",
  falta("select to_regprocedure('retail.tienda_bolsa_grupos(jsonb, uuid)') is null;") ? leer("20261114041000_tienda_web_ofertas_de_grupo") : "",
  falta("select to_regprocedure('retail.fn_escalones_validos(jsonb, text)') is null;") ? readFileSync(MIGRACION, "utf8") : "",
  // Los choques con la forma, con su propio nombre (una sola firma por función).
  falta("select to_regprocedure('retail.fn_choques_de_oferta_con_forma(uuid, uuid, date, date, smallint[], uuid[], uuid[], uuid[], boolean, uuid[], text, text, boolean)') is null;")
    ? readFileSync(UNA_FIRMA, "utf8")
    : "",
].filter(Boolean).join("\n");

const HOY = "retail.fn_hoy_lima()";
// Tienda Lima lista para vender (caja abierta, stock de sobra) y una campaña «ZZ» con la categoría de la Blusa Emma: tres variantes de su
// modelo (a1, a2, a3) y una prenda de otra categoría (fuera), con sus precios en Lima (p1, p2, p3, pf).
const PARTIDA = `begin;
${ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as u from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as a1, p.id as modelo, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select v.id as a2 from retail.variantes v where v.producto_id = :'modelo' and v.id <> :'a1' and v.activo order by v.id limit 1 \\gset
select v.id as a3 from retail.variantes v where v.producto_id = :'modelo' and v.id not in (:'a1', :'a2') and v.activo order by v.id limit 1 \\gset
select v.id as fuera from retail.variantes v join retail.productos p on p.id = v.producto_id
 where p.categoria_id <> :'cat' and v.activo and retail.fn_precio_en_sede(v.id, :'u') > 0
   and p.empresa_id is distinct from (select em.id from retail.empresas em where em.clave = 'claure') order by v.id limit 1 \\gset
select retail.fn_precio_en_sede(:'a1', :'u') as p1, retail.fn_precio_en_sede(:'a2', :'u') as p2, retail.fn_precio_en_sede(:'a3', :'u') as p3,
       retail.fn_precio_en_sede(:'fuera', :'u') as pf \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña monto (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
`;
// La caja y los apartados: caja abierta, piso de venta y stock de sobra.
const TIENDA = `insert into retail.sububicaciones (ubicacion_id, nombre, tipo) select :'u', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'u' and tipo = 'piso_venta');
select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'u' and estado = 'abierta') x) as _cerro \\gset
select retail.abrir_caja(:'u', 100.00, 'prueba automatizada') as caja \\gset
update retail.series_comprobantes set serie = case tipo when 'boleta' then 'BL98' when 'factura' then 'FL98' else serie end, siguiente_numero = 1
 where ubicacion_id = :'u' and tipo in ('boleta', 'factura');
select retail.fn_sububicacion_por_defecto(:'u', 'venta') as sub \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x, :'u', :'sub', 'entrada', 100, 'colchón de prueba' from unnest(array[:'a1', :'a2', :'a3', :'fuera']::uuid[]) x;
select count(retail.fn_aplicar_movimiento(m.id)) as _ap from retail.movimientos m where m.motivo = 'colchón de prueba' and m.ubicacion_id = :'u' and m.created_at >= now() - interval '1 minute' \\gset
`;

/** Un monto: escalones [[desde, ahorra], …] (números o expresiones SQL), en soles o en %, de toda la compra o de la campaña. */
const MONTO = ({ escalones = [[300, 30]], en = "soles", cuenta = "compra", cede = false, nombre = "ZZ Monto", v = "m", solo = "'{}'::uuid[]", cedenA = "'{}'::uuid[]" } = {}) =>
  `select retail.guardar_oferta_completa(null, :'camp', '${nombre}', jsonb_build_object('tipo', 'monto', 'ahorro_en', '${en}', 'cuenta', '${cuenta}',
     'cede_a_otras', ${cede}, 'escalones', jsonb_build_array(${escalones.map(([d, a]) => `jsonb_build_object('desde', ${d}, 'ahorra', ${a})`).join(", ")})),
     ${HOY}, ${HOY} + 3, null, ${solo}, '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], ${cedenA}, true) as ${v} \\gset\n`;
const OFERTA = ({ forma = { tipo: "nxm", lleva: 3, paga: 2 }, nombre = "ZZ 3x2", v = "r", cedenA = "'{}'::uuid[]" } = {}) =>
  `select retail.guardar_oferta_completa(null, :'camp', '${nombre}', '${JSON.stringify(forma)}'::jsonb, ${HOY}, ${HOY} + 3, null, '{}'::uuid[], '{}'::uuid[], false,
     '{}'::uuid[], '{}'::uuid[], ${cedenA}, true) as ${v} \\gset\n`;
const L = (v, precio, cantidad = 1) => `jsonb_build_object('variante_id', :'${v}', 'precio_unitario', ${precio}, 'cantidad', ${cantidad})`;
const GRUPO = (lineas, tolerancia = 0) =>
  `select coalesce(string_agg(linea || ':' || descuento || ':' || faltan, ',' order by linea), 'nada') from retail.fn_ofertas_de_grupo(${HOY}, :'u', jsonb_build_array(${lineas.join(", ")}), ${tolerancia});\n`;
const caso = (cuerpo) => correr(`${PARTIDA}${cuerpo}rollback;`);

console.log("\n— La cuenta del monto —");
esperarValor(
  "toda la compra, S/ 30 desde S/ 300: 200 + 150 = 350 → ahorran 30, repartidos en proporción (17.14 · 12.86)",
  caso(`${MONTO()}${GRUPO([L("a1", 200), L("fuera", 150)])}`),
  "1:17.14:0,2:12.86:0",
);
esperarValor("sin llegar al monto (250), no ahorra", caso(`${MONTO()}${GRUPO([L("a1", 200), L("fuera", 50)])}`), "1:0.00:0,2:0.00:0");
esperarValor(
  "tres escalones (300 → 30, 500 → 60, 800 → 120): con 550 vale el de 500, repartido al céntimo (32.73 · 27.27)",
  caso(`${MONTO({ escalones: [[300, 30], [500, 60], [800, 120]] })}${GRUPO([L("a1", 300), L("fuera", 250)])}`),
  "1:32.73:0,2:27.27:0",
);
esperarValor(
  "…y con 800 justo, el de 800 (75 · 45)",
  caso(`${MONTO({ escalones: [[300, 30], [500, 60], [800, 120]] })}${GRUPO([L("a1", 500), L("fuera", 300)])}`),
  "1:75.00:0,2:45.00:0",
);
esperarValor(
  "en %, con el redondeo de la caja: 10 % desde S/ 300 sobre 350 → 35 (20 · 15)",
  caso(`${MONTO({ escalones: [[300, 10]], en: "pct" })}${GRUPO([L("a1", 200), L("fuera", 150)])}`),
  "1:20.00:0,2:15.00:0",
);
esperarValor(
  "una línea con varias unidades cuenta cada una (2 × 160 = 320 → 30)",
  caso(`${MONTO()}${GRUPO([L("a1", 160, 2)])}`),
  "1:30.00:0",
);
esperarValor(
  "solo las prendas de la campaña: la prenda de otra categoría no cuenta ni ahorra (200 + 150 de la campaña → 30)",
  caso(`${MONTO({ cuenta: "campana" })}${GRUPO([L("a1", 200), L("a2", 150), L("fuera", 500)])}`),
  "1:17.14:0,2:12.86:0",
);
esperarValor(
  "…y con lo de la campaña bajo el monto, la otra no ayuda a llegar",
  caso(`${MONTO({ cuenta: "campana" })}${GRUPO([L("a1", 200), L("fuera", 500)])}`),
  "1:0.00:0",
);
esperarValor(
  "500 tickets al azar (semilla fija): el ahorro es siempre el del escalón alcanzado, y ninguna prenda ahorra más de lo que cuesta",
  caso(`${MONTO({ escalones: [[150, 15], [400, 50], [700, 100]] })}select setseed(0.31);
do $$
declare
  v_vars uuid[] := array[(select id from retail.variantes where sku = 'BLU-EMMA-NEG-M')] ||
    (select array_agg(v.id order by v.id) from (select v.id from retail.variantes v where v.activo order by v.id limit 40) v);
  v_lineas jsonb;
  v_suma numeric;
  v_got numeric;
  v_esperado numeric;
  v_mal integer := 0;
  v_pasado integer;
  v_p numeric;
begin
  for t in 1 .. 500 loop
    v_lineas := '[]'::jsonb;
    v_suma := 0;
    for i in 1 .. 1 + floor(random() * 6)::integer loop
      v_p := 10 + floor(random() * 2500)::numeric / 10;
      v_suma := v_suma + v_p;
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('variante_id', v_vars[1 + floor(random() * array_length(v_vars, 1))::integer], 'precio_unitario', v_p, 'cantidad', 1));
    end loop;
    select coalesce(sum(descuento), 0) into v_got from retail.fn_ofertas_de_grupo(retail.fn_hoy_lima(), (select id from retail.ubicaciones where nombre = 'Tienda Lima'), v_lineas);
    v_esperado := case when v_suma >= 700 then 100 when v_suma >= 400 then 50 when v_suma >= 150 then 15 else 0 end;
    select count(*) into v_pasado from retail.fn_ofertas_de_grupo(retail.fn_hoy_lima(), (select id from retail.ubicaciones where nombre = 'Tienda Lima'), v_lineas) g
      where g.descuento > (v_lineas -> (g.linea - 1) ->> 'precio_unitario')::numeric;
    if v_got <> v_esperado or v_pasado > 0 then v_mal := v_mal + 1; end if;
  end loop;
  perform set_config('pg.mal', v_mal::text, true);
end;
$$;
select current_setting('pg.mal');\n`),
  "0",
);

console.log("\n— El monto no se junta con otra oferta (decisión 3) —");
const PCT = `select retail.guardar_oferta_completa(null, :'camp', 'ZZ 20 %', '{"tipo":"pct","porcentaje":20}'::jsonb, ${HOY}, ${HOY} + 3, null, '{}'::uuid[], '{}'::uuid[], false,
  '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true) as pct \\gset\n`;
esperarError("un monto de toda la compra choca con una rebaja de esas tiendas y días", caso(`${PCT}${MONTO()}`), "choca");
esperarValor(
  "con «que las prendas con otra oferta no cuenten», se guarda; la prenda con −20 % no cuenta ni ahorra (solo la otra: 350 → 30)",
  caso(`${PCT}${MONTO({ cede: true })}${GRUPO([L("a1", 200), L("fuera", 350)])}`),
  "2:30.00:0",
);
const SIEMPRE = `insert into retail.etiquetas (nombre, estilo) values ('ZZ Siempre 10 % (prueba)', 'campana') returning id as siempre \\gset
select retail.actualizar_campana_etiqueta(:'siempre', 10, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
`;
esperarError("un monto de toda la compra choca con el descuento de siempre de una campaña", caso(`${SIEMPRE}${MONTO()}`), "choca");
esperarValor(
  "…y si cede a las otras, la prenda con ese descuento no cuenta ni ahorra",
  caso(`${SIEMPRE}${MONTO({ cede: true })}${GRUPO([L("a1", 200), L("fuera", 350)])}`),
  "2:30.00:0",
);
esperarValor(
  "…ni una prenda que va en un 3x2: el grupo se arma igual y el monto cuenta solo lo demás",
  caso(`${OFERTA()}${MONTO({ cede: true })}select (${GRUPO([L("a1", 100), L("a2", 100), L("a3", 100), L("fuera", 350)]).replace(/;\n$/, "")}) || '|' ||
  (select sum(descuento) from retail.fn_ofertas_de_grupo(${HOY}, :'u', jsonb_build_array(${L("a1", 100)}, ${L("a2", 100)}, ${L("a3", 100)})));\n`),
  "1:33.34:0,2:33.33:0,3:33.33:0,4:30.00:0|100.00",
);
esperarValor(
  "una rebaja que le cedió al monto se calla en sus prendas, que sí cuentan (200 + 350 → 30, repartido)",
  caso(`${PCT}${MONTO({ cedenA: "array[:'pct']::uuid[]" })}select concat_ws('|', (select count(*) from retail.fn_campanas_en_sede(${HOY}, 0, array[:'a1']::uuid[], :'u') where descuento_pct > 0),
  (${GRUPO([L("a1", 200), L("fuera", 350)]).replace(/;\n$/, "")}));\n`),
  "0|1:10.91:0,2:19.09:0",
);
esperarError(
  "dos montos chocan aunque los dos cedan a las otras",
  caso(`${MONTO({ cede: true })}${MONTO({ cede: true, cuenta: "campana", nombre: "ZZ Monto 2", v: "m2" })}`),
  "choca",
);
esperarValor(
  "fn_choques_de_oferta_con_forma: un monto de toda la compra ve la rebaja; si cede a las otras, no ve nada",
  caso(`${PCT}select concat_ws('|',
  (select count(distinct c.otra_id) from retail.fn_choques_de_oferta_con_forma(null, :'camp', ${HOY}, ${HOY} + 3, array[1,2,3,4,5,6,7]::smallint[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], 'monto', 'compra', false) c where c.otra_id = :'pct'),
  (select count(*) from retail.fn_choques_de_oferta_con_forma(null, :'camp', ${HOY}, ${HOY} + 3, array[1,2,3,4,5,6,7]::smallint[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], 'monto', 'compra', true) c));\n`),
  "1|0",
);
esperarValor(
  "…y dice si la otra es un monto y cuántas prendas alcanza esta (la rebaja de la categoría no las tiene todas)",
  caso(`${PCT}select concat_ws('|', bool_and(not c.otra_es_monto), bool_and(c.mias > c.prendas))
  from retail.fn_choques_de_oferta_con_forma(null, :'camp', ${HOY}, ${HOY} + 3, array[1,2,3,4,5,6,7]::smallint[], '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], 'monto', 'compra', false) c
  where c.otra_id = :'pct';\n`),
  "t|t",
);
esperarValor(
  "la de 10 datos (la pantalla de antes) no ve como choque un monto que cede a las otras",
  caso(`${MONTO({ cede: true })}select count(*) from retail.fn_choques_de_oferta(null, :'camp', ${HOY}, ${HOY} + 3, array[1,2,3,4,5,6,7]::smallint[], array[:'cat']::uuid[], '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[]) c where c.otra_id = :'m';\n`),
  "0",
);

console.log("\n— Los dos arreglos —");
esperarValor(
  "un 3x2 que le cedió a una rebaja se calla donde la rebaja rige (antes cobraba los dos)",
  caso(`${OFERTA()}${OFERTA({ forma: { tipo: "pct", porcentaje: 20 }, nombre: "ZZ 20 % que gana", v: "gana", cedenA: "array[:'r']::uuid[]" })}select concat_ws('|',
  (${GRUPO([L("a1", 100), L("a2", 100), L("a3", 100)]).replace(/;\n$/, "")}),
  (select count(*) from retail.ofertas_de_grupo_vigentes(:'u') o where o.variante_id = :'a1'));\n`),
  "nada|0",
);
esperarValor(
  "con la tolerancia de una venta sin conexión, la oferta de hoy le gana a una que terminó ayer (la caja cobra la de hoy)",
  caso(`${OFERTA({ nombre: "ZZ 3x2 de ayer", v: "ayer" })}update retail.campana_reglas set desde = ${HOY} - 5, hasta = ${HOY} - 1, creada_en = now() - interval '6 days' where id = :'ayer';
${OFERTA({ forma: { tipo: "nesima_pct", lleva: 2, porcentaje: 50 }, nombre: "ZZ 2.ª al 50 %", v: "hoy" })}select (${GRUPO([L("a1", 80), L("a2", 60)], 3).replace(/;\n$/, "")}) || ' = ' || (${GRUPO([L("a1", 80), L("a2", 60)], 0).replace(/;\n$/, "")});\n`),
  "1:17.14:0,2:12.86:0 = 1:17.14:0,2:12.86:0",
);

console.log("\n— Guardar un monto —");
esperarValor(
  "se guarda con su forma, y campana_reglas() la devuelve",
  caso(`${MONTO({ escalones: [[300, 30], [500, 60]], cede: true })}select concat_ws('|', tipo, cuenta, ahorro_en, cede_a_otras, jsonb_array_length(escalones), coalesce(porcentaje::text, 'sin %'), coalesce(lleva::text, 'sin N'))
  from retail.campana_reglas() where id = :'m';\n`),
  "monto|compra|soles|t|2|sin %|sin N",
);
esperarValor(
  "toda la compra no guarda categorías ni prendas aunque la pantalla las mande",
  caso(`${MONTO({ solo: "array[:'cat']::uuid[]" })}select count(*) from retail.campana_regla_categorias where regla_id = :'m' and modo = 'solo';\n`),
  "0",
);
esperarValor(
  "editar los escalones deja la forma de antes en la historia",
  caso(`${MONTO()}select retail.guardar_oferta_completa(:'m', :'camp', 'ZZ Monto', jsonb_build_object('tipo', 'monto', 'ahorro_en', 'soles', 'cuenta', 'compra',
     'escalones', jsonb_build_array(jsonb_build_object('desde', 400, 'ahorra', 50))), ${HOY}, ${HOY} + 3, null, '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true);
select (select h.antes -> 'forma' -> 'escalones' -> 0 ->> 'desde' from retail.campana_regla_historial h where h.regla_id = :'m' and h.antes ? 'forma') || '|' ||
       (select escalones -> 0 ->> 'desde' from retail.campana_reglas where id = :'m');\n`),
  "300|400",
);
esperarValor(
  "un monto que vuelve a ser rebaja queda sin escalones",
  caso(`${MONTO()}select retail.guardar_oferta_completa(:'m', :'camp', 'ZZ Monto', '{"tipo":"pct","porcentaje":15}'::jsonb, ${HOY}, ${HOY} + 3, null,
     '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], false);
select concat_ws('|', tipo, porcentaje, coalesce(escalones::text, 'sin'), coalesce(cuenta, 'sin'), cede_a_otras) from retail.campana_reglas where id = :'m';\n`),
  "pct|15.00|sin|sin|f",
);
for (const [nombre, escalones, en, error] of [
  ["cuatro escalones", [[100, 10], [200, 20], [300, 30], [400, 40]], "soles", "De 1 a 3 escalones"],
  ["un escalón que no sube", [[300, 30], [300, 40]], "soles", "De 1 a 3 escalones"],
  ["un escalón que ahorra menos que el anterior", [[300, 30], [500, 20]], "soles", "De 1 a 3 escalones"],
  ["en soles, un ahorro igual al monto", [[100, 100]], "soles", "el ahorro menor que su monto"],
  ["en %, más de 70 %", [[300, 80]], "pct", "hasta 70 %"],
  ["céntimos de más", [[300.005, 30]], "soles", "De 1 a 3 escalones"],
]) {
  esperarError(`no se guarda: ${nombre}`, caso(MONTO({ escalones, en })), error);
}
esperarError(
  "no se guarda un monto que no dice qué cuenta",
  caso(`select retail.guardar_oferta_completa(null, :'camp', 'ZZ', '{"tipo":"monto","ahorro_en":"soles","escalones":[{"desde":300,"ahorra":30}]}'::jsonb, ${HOY}, ${HOY} + 3, null,
     '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], false);\n`),
  "Elige qué cuenta",
);
esperarError("la tabla no deja un monto sin escalones", caso(`${MONTO()}update retail.campana_reglas set escalones = null where id = :'m';\n`), "campana_reglas_forma");
esperarError(
  "ni una rebaja que «cede a las otras»",
  caso(`${PCT}update retail.campana_reglas set cede_a_otras = true where id = :'pct';\n`),
  "campana_reglas_solo_el_monto",
);

console.log("\n— La caja y los apartados cobran el monto —");
// Un monto de toda la compra que se alcanza justo con a1 + fuera: S/ 10 menos, repartido.
const MONTO_JUSTO = `${TIENDA}${MONTO({ escalones: [["(:'p1'::numeric + :'pf'::numeric)", 10]] })}
with l as (select * from (values (1, :'a1'::uuid, :'p1'::numeric), (2, :'fuera'::uuid, :'pf'::numeric)) t(linea, v, p))
select coalesce(max(g.descuento) filter (where g.linea = 1), 0) as g1, coalesce(max(g.descuento) filter (where g.linea = 2), 0) as gf
  from retail.fn_ofertas_de_grupo(${HOY}, :'u', (select jsonb_agg(jsonb_build_object('variante_id', l.v, 'precio_unitario', l.p, 'cantidad', 1) order by l.linea) from l), 0) g \\gset
`;
const lineaVenta = (v, p, g) =>
  `jsonb_build_object('variante_id', :'${v}', 'cantidad', 1, 'precio_unitario', :'${p}'::numeric, 'descuento_unitario', ${g}, 'descuento_grupo_unitario', ${g}, 'oferta_grupo_id', :'m')`;
const venta = (g1, gf) => `select retail.registrar_venta(:'u', jsonb_build_array(${lineaVenta("a1", "p1", g1)}, ${lineaVenta("fuera", "pf", gf)}),
  jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', :'p1'::numeric + :'pf'::numeric - ${g1} - ${gf})), null, gen_random_uuid()) as venta \\gset\n`;
esperarValor(
  "la caja cobra el monto: cada línea con su parte y su oferta, y suman los S/ 10",
  caso(`${MONTO_JUSTO}${venta(":'g1'::numeric", ":'gf'::numeric")}select concat_ws('|', count(*), sum(vi.descuento_grupo_unitario), bool_and(vi.oferta_grupo_id = :'m'))
  from retail.venta_items vi where vi.venta_id = :'venta';\n`),
  "2|10.00|t",
);
esperarError("la caja no puede omitir el monto", caso(`${MONTO_JUSTO}${venta("0", "0")}`), "venta_grupo_omitido");

const separar = `select retail.separar_prendas(
    p_ubicacion_id => :'u', p_items => jsonb_build_array(
      jsonb_build_object('variante_id', :'a1', 'cantidad', 1, 'precio_unitario', :'p1'::numeric, 'descuento_unitario', 0, 'descuento_grupo', :'g1'::numeric),
      jsonb_build_object('variante_id', :'fuera', 'cantidad', 1, 'precio_unitario', :'pf'::numeric, 'descuento_unitario', 0, 'descuento_grupo', :'gf'::numeric)),
    p_pagos => jsonb_build_array(jsonb_build_object('metodo', 'yape', 'monto', ceil((:'p1'::numeric + :'pf'::numeric) * 0.35))),
    p_clienta_nombres => 'Ana', p_clienta_apellidos => 'Prueba Monto', p_clienta_celular => '955065501',
    p_devolucion_medio => 'yape') as sep \\gset
`;
esperarValor(
  "un apartado guarda el monto con sus escalones, y cada prenda su parte",
  caso(`${MONTO_JUSTO}${separar}select concat_ws('|', (select tipo || ':' || jsonb_array_length(escalones) || ':' || cuenta from retail.separacion_ofertas_grupo where separacion_id = :'sep'),
  (select sum(descuento_grupo_unitario) from retail.separacion_items where separacion_id = :'sep'));\n`),
  "monto:1:compra|10.00",
);
esperarValor(
  "quitar la más barata lo deja bajo el monto: la otra vuelve a su precio (con el trato guardado)",
  caso(`${MONTO_JUSTO}${separar}select id as quita from retail.separacion_items where separacion_id = :'sep' order by precio_unitario, id limit 1 \\gset
select retail.previsualizar_edicion_separacion(:'sep', array[:'quita']::uuid[], '[]'::jsonb) as pv \\gset
select retail.editar_separacion_con_total(:'sep', array[:'quita']::uuid[], '[]'::jsonb, gen_random_uuid(), (:'pv'::jsonb ->> 'total')::numeric);
select concat_ws('|', count(*), sum(descuento_grupo_unitario), (select count(*) from retail.fn_verificar_separaciones()))
  from retail.separacion_items where separacion_id = :'sep';\n`),
  "1|0.00|0",
);

console.log("\n— Lo que leen la caja y la tienda web —");
esperarValor(
  "ofertas_de_monto_vigentes: uno de la campaña dice qué prendas alcanza (a1 sí, la de otra categoría no)",
  caso(`${MONTO({ cuenta: "campana" })}select concat_ws('|', cuenta, :'a1' = any (variantes), :'fuera' = any (variantes), cardinality(excluidas), jsonb_array_length(escalones), ahorro_en)
  from retail.ofertas_de_monto_vigentes(:'u') where regla_id = :'m';\n`),
  "campana|t|f|0|1|soles",
);
esperarValor(
  "…uno de toda la compra dice cuáles NO (ni a1 ni la otra están fuera; una prenda de Claurè sí, si la hay)",
  caso(`${MONTO()}select concat_ws('|', cuenta, variantes is null, :'a1' = any (excluidas), :'fuera' = any (excluidas),
  coalesce((select bool_and(v.id = any (o.excluidas)) from retail.variantes v join retail.productos p on p.id = v.producto_id
             where p.empresa_id = (select em.id from retail.empresas em where em.clave = 'claure')), true))
  from retail.ofertas_de_monto_vigentes(:'u') o where regla_id = :'m';\n`),
  "compra|t|f|f|t",
);
esperarValor(
  "…y una prenda donde el monto cedió a otra oferta queda fuera",
  caso(`${MONTO()}${OFERTA({ forma: { tipo: "pct", porcentaje: 20 }, nombre: "ZZ 20 % que gana", v: "gana", cedenA: "array[:'m']::uuid[]" })}select concat_ws('|', :'a1' = any (excluidas), :'fuera' = any (excluidas))
  from retail.ofertas_de_monto_vigentes(:'u') where regla_id = :'m';\n`),
  "t|f",
);
esperarValor(
  "tienda_bolsa_grupos: en un monto, la bolsa recibe sus escalones y lo que ya suman sus prendas",
  caso(`${MONTO({ escalones: [["(:'p1'::numeric + :'pf'::numeric)", 10]] })}select retail.tienda_bolsa_grupos(jsonb_build_array(jsonb_build_object('variante_id', :'a1', 'cantidad', 1),
  jsonb_build_object('variante_id', :'fuera', 'cantidad', 1)), :'u') as bg \\gset
select concat_ws('|', :'bg'::jsonb -> 'lineas' -> :'a1' ->> 'tipo', jsonb_array_length(:'bg'::jsonb -> 'lineas' -> :'a1' -> 'escalones'),
  (:'bg'::jsonb -> 'lineas' -> :'a1' ->> 'cuenta'), (:'bg'::jsonb ->> 'ahorro')::numeric >= 0, (:'bg'::jsonb -> 'lineas' -> :'a1' ->> 'base') is not null);\n`),
  "monto|1|compra|t|t",
);

console.log("\n— Pegar —");
esperarValor(
  "la migración se puede pegar dos veces",
  correr(`begin;\n${ANTES}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}\nselect count(*) from pg_constraint where conrelid = 'retail.campana_reglas'::regclass and conname in ('campana_reglas_forma', 'campana_reglas_solo_el_monto');\nrollback;`),
  "2",
);

esperarValor(
  "la de una sola firma también se pega dos veces, y cada función de choques queda con una firma",
  correr(`begin;\n${ANTES}\n${readFileSync(UNA_FIRMA, "utf8")}\n${readFileSync(UNA_FIRMA, "utf8")}\nselect string_agg(proname || ':' || n, ',' order by proname) from (
  select p.proname, count(*) as n from pg_proc p where p.pronamespace = 'retail'::regnamespace
   and p.proname in ('fn_choques_de_oferta', 'fn_choques_de_oferta_sin_llave', 'fn_choques_de_oferta_con_forma', 'fn_choques_de_oferta_con_forma_sin_llave')
  group by p.proname) x;\nrollback;`),
  "fn_choques_de_oferta:1,fn_choques_de_oferta_con_forma:1,fn_choques_de_oferta_con_forma_sin_llave:1,fn_choques_de_oferta_sin_llave:1",
);

console.log(`\n${total - fallos} de ${total} en verde.`);
process.exit(fallos ? 1 : 0);
