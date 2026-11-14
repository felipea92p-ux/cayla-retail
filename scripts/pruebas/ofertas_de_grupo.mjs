#!/usr/bin/env node
/**
 * Pruebas de «Llevar varias y pagar menos» (`20261114003000_ofertas_de_grupo.sql`, ADR-0655 actividad 6, parte 1) contra el Postgres local.
 *
 * QUÉ PRUEBA.
 *   · `fn_ofertas_de_grupo`, LA regla: el 3x2 con la más barata gratis y el ahorro repartido en proporción al precio en céntimos exactos
 *     (el ejemplo de la maqueta: 79.90 · 49.90 · 39.90 → ahorran 18.79 · 11.73 · 9.38); varios grupos de la más cara a la más barata
 *     (Felipe 2026-11-13); lo que no completa un grupo paga su precio y dice cuántas faltan; «N por S/»; «la N.ª al X %» con el redondeo de la
 *     caja; agrupar por modelo o con cualquier prenda de la campaña; una línea con varias unidades; que no se cuelen un borrador, otra tienda,
 *     una prenda que la oferta no alcanza ni una oferta de «un % menos»;
 *   · `guardar_oferta_completa`: valida cada forma, la guarda y deja la forma de antes en la historia; los candados de la tabla;
 *   · el candado de «una prenda, una oferta por tienda y por día» (20261113223000) también frena un 3x2 que pisa un % menos;
 *   · `campana_reglas()` devuelve la forma, y la migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK. Si la base local no tiene las migraciones de las ofertas (prenda por prenda, una por
 * prenda y su arreglo), las aplica dentro de cada escenario.
 *
 * DA POR SENTADO: `Tienda Lima`, `Tienda Trujillo` y la variante `BLU-EMMA-NEG-M` del seed, con al menos 3 modelos en su categoría.
 *
 * USO
 *   pnpm pruebas:ofertas-de-grupo
 *   pnpm pruebas:ofertas-de-grupo -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261114003000_ofertas_de_grupo.sql";
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
const sinCesiones = falta("select to_regclass('retail.campana_regla_cesiones') is null;");
const sinDeUnaVez = falta("select to_regprocedure('retail.fn_variantes_de_oferta(uuid, uuid[], uuid[], uuid[], boolean)') is null;");
const sinGrupo = falta("select to_regprocedure('retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)') is null;");
const ANTES = [
  sinProductos && sinFusion
    ? ["20261112204000_fusionar_productos_base", "20261112205000_fusionar_productos_previsualizar", "20261112210000_fusionar_productos",
        "20261112211000_fusionar_productos_lecturas", "20261113175000_fusionar_productos_tallas_vacias"].map(leer).join("\n")
    : "",
  sinProductos ? leer("20261113210000_oferta_prenda_por_prenda") : "",
  sinCesiones ? leer("20261113223000_una_oferta_por_prenda_tienda_y_dia") : "",
  sinDeUnaVez ? leer("20261113230000_choques_de_oferta_de_una_vez") : "",
  sinGrupo ? readFileSync(MIGRACION, "utf8") : "",
].filter(Boolean).join("\n");

const HOY = "retail.fn_hoy_lima()";
// Una campaña «ZZ» de ayer a dentro de 10 días con la categoría de la Blusa Emma; tres prendas del modelo A y una del modelo B.
const PARTIDA = `begin;
${ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select v.id as a1, p.id as modelo_a, p.categoria_id as cat from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select v.id as a2 from retail.variantes v where v.producto_id = :'modelo_a' and v.id <> :'a1' and v.activo order by v.id limit 1 \\gset
select v.id as a3 from retail.variantes v where v.producto_id = :'modelo_a' and v.id not in (:'a1', :'a2') and v.activo order by v.id limit 1 \\gset
select v.id as b1 from retail.variantes v join retail.productos p on p.id = v.producto_id where p.categoria_id = :'cat' and p.id <> :'modelo_a' and v.activo order by v.id limit 1 \\gset
select v.id as fuera from retail.variantes v join retail.productos p on p.id = v.producto_id where p.categoria_id <> :'cat' and v.activo order by v.id limit 1 \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña de grupo (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[:'cat']::uuid[]);
`;
const FORMA = (f) => `'${JSON.stringify(f)}'::jsonb`;
const OFERTA = ({ forma = { tipo: "nxm", lleva: 3, paga: 2 }, activar = "true", sedes = "'{}'::uuid[]", nombre = "ZZ 3x2", v = "r" } = {}) =>
  `select retail.guardar_oferta_completa(null, :'camp', '${nombre}', ${FORMA(forma)}, ${HOY}, ${HOY} + 3, null, '{}'::uuid[], '{}'::uuid[], false, ${sedes}, '{}'::uuid[], '{}'::uuid[], ${activar}) as ${v} \\gset\n`;
const L = (v, precio, cantidad = 1) => `jsonb_build_object('variante_id', :'${v}', 'precio_unitario', ${precio}, 'cantidad', ${cantidad})`;
const GRUPO = (lineas, sede = ":'lima'") =>
  `select coalesce(string_agg(linea || ':' || descuento || ':' || faltan, ',' order by linea), 'nada') from retail.fn_ofertas_de_grupo(${HOY}, ${sede}, jsonb_build_array(${lineas.join(", ")}));\n`;
const caso = (cuerpo) => correr(`${PARTIDA}${cuerpo}rollback;`);

console.log("\n— La regla de los grupos —");
esperarValor(
  "3x2: la más barata gratis, el ahorro repartido en proporción al precio (79.90 · 49.90 · 39.90 → 18.79 · 11.73 · 9.38)",
  caso(`${OFERTA()}${GRUPO([L("a1", 79.9), L("a2", 49.9), L("a3", 39.9)])}`),
  "1:18.79:0,2:11.73:0,3:9.38:0",
);
esperarValor(
  "el reparto suma exacto lo que regala el grupo (39.90)",
  caso(`${OFERTA()}select sum(descuento) from retail.fn_ofertas_de_grupo(${HOY}, :'lima', jsonb_build_array(${L("a1", 79.9)}, ${L("a2", 49.9)}, ${L("a3", 39.9)}));\n`),
  "39.90",
);
esperarValor(
  "dos grupos, de la más cara a la más barata: tres de S/ 50 y tres de S/ 30 → gratis una de 50 y una de 30",
  caso(`${OFERTA()}${GRUPO([L("a1", 50, 3), L("a2", 30, 3)])}`),
  "1:50.00:0,2:30.00:0",
);
esperarValor("con dos, todavía no hay grupo: pagan su precio y falta una", caso(`${OFERTA()}${GRUPO([L("a1", 50), L("a2", 40)])}`), "1:0.00:1,2:0.00:1");
esperarValor(
  "con cuatro, un grupo (las tres más caras) y la cuarta paga su precio; al grupo siguiente le faltan dos",
  caso(`${OFERTA()}${GRUPO([L("a1", 40), L("a2", 30), L("a3", 20), L("b1", 10)])}`),
  "1:8.89:2,2:6.67:2,3:4.44:2,4:0.00:2",
);
esperarValor("«3 por S/ 100»: 50 + 40 + 30 = 120 → ahorran 20, repartidos", caso(`${OFERTA({ forma: { tipo: "n_por_monto", lleva: 3, monto: 100 } })}${GRUPO([L("a1", 50), L("a2", 40), L("a3", 30)])}`), "1:8.33:0,2:6.67:0,3:5.00:0");
esperarValor("«3 por S/ 100» con un grupo que ya cuesta menos: no ahorra", caso(`${OFERTA({ forma: { tipo: "n_por_monto", lleva: 3, monto: 100 } })}${GRUPO([L("a1", 30), L("a2", 30), L("a3", 30)])}`), "1:0.00:0,2:0.00:0,3:0.00:0");
esperarValor(
  "«la 2.ª al 50 %»: la más barata (60) lleva 30 menos (el redondeo de la caja), repartido",
  caso(`${OFERTA({ forma: { tipo: "nesima_pct", lleva: 2, porcentaje: 50 } })}${GRUPO([L("a1", 80), L("a2", 60)])}`),
  "1:17.14:0,2:12.86:0",
);
esperarValor(
  "por modelo: dos del modelo A y una del B no arman grupo (a cada uno le faltan)",
  caso(`${OFERTA({ forma: { tipo: "nxm", lleva: 3, paga: 2, agrupa: "modelo" } })}${GRUPO([L("a1", 50), L("a2", 50), L("b1", 50)])}`),
  "1:0.00:1,2:0.00:1,3:0.00:2",
);
esperarValor(
  "…con cualquier prenda de la campaña, sí",
  caso(`${OFERTA()}${GRUPO([L("a1", 50), L("a2", 50), L("b1", 50)])}`),
  "1:16.67:0,2:16.67:0,3:16.66:0",
);
esperarValor("una prenda que la oferta no alcanza no sale (y no cuenta para el grupo)", caso(`${OFERTA()}${GRUPO([L("a1", 50), L("a2", 50), L("fuera", 50)])}`), "1:0.00:1,2:0.00:1");
esperarValor("un borrador no arma grupos", caso(`${OFERTA({ activar: "false" })}${GRUPO([L("a1", 50), L("a2", 50), L("a3", 50)])}`), "nada");
esperarValor("una oferta solo de Trujillo no rige en Lima", caso(`${OFERTA({ sedes: "array[:'tru']::uuid[]" })}${GRUPO([L("a1", 50), L("a2", 50), L("a3", 50)])}`), "nada");
esperarValor("…y en Trujillo sí", caso(`${OFERTA({ sedes: "array[:'tru']::uuid[]" })}${GRUPO([L("a1", 50), L("a2", 50), L("a3", 50)], ":'tru'")}`), "1:16.67:0,2:16.67:0,3:16.66:0");
esperarValor("una oferta de «un % menos» no es de grupo", caso(`${OFERTA({ forma: { tipo: "pct", porcentaje: 20 } })}${GRUPO([L("a1", 50), L("a2", 50), L("a3", 50)])}`), "nada");

esperarValor(
  "300 tickets al azar (semilla fija): el ahorro total es siempre «la más barata de cada grupo de 3» contada de otra forma, y ninguna prenda ahorra más de lo que cuesta",
  caso(`${OFERTA()}select setseed(0.42);
do $$
declare
  v_vars uuid[] := array[(select id from retail.variantes where sku = 'BLU-EMMA-NEG-M')] ||
    (select array_agg(v.id order by v.id) from retail.variantes v join retail.productos p on p.id = v.producto_id
      where p.categoria_id = (select p2.categoria_id from retail.variantes v2 join retail.productos p2 on p2.id = v2.producto_id where v2.sku = 'BLU-EMMA-NEG-M') and v.activo);
  v_lineas jsonb;
  v_precios numeric[];
  v_n integer;
  v_got numeric;
  v_esperado numeric;
  v_mal integer := 0;
  v_pasado integer;
begin
  for t in 1 .. 300 loop
    v_n := 1 + floor(random() * 8)::integer;
    v_lineas := '[]'::jsonb;
    v_precios := '{}';
    for i in 1 .. v_n loop
      v_precios := v_precios || (10 + floor(random() * 900)::numeric / 10);
      v_lineas := v_lineas || jsonb_build_array(jsonb_build_object('variante_id', v_vars[1 + floor(random() * array_length(v_vars, 1))::integer], 'precio_unitario', v_precios[i], 'cantidad', 1));
    end loop;
    select coalesce(sum(descuento), 0) into v_got from retail.fn_ofertas_de_grupo(retail.fn_hoy_lima(), null, v_lineas);
    -- De la más cara a la más barata, en grupos de 3 completos: la 3.ª de cada grupo es gratis.
    select coalesce(sum(p) filter (where (rn % 3) = 0), 0) into v_esperado
      from (select p, row_number() over (order by p desc) as rn from unnest(v_precios) p) x
     where rn <= (v_n / 3) * 3;
    select count(*) into v_pasado from retail.fn_ofertas_de_grupo(retail.fn_hoy_lima(), null, v_lineas) g
      where g.descuento > (v_lineas -> (g.linea - 1) ->> 'precio_unitario')::numeric;
    if v_got <> v_esperado or v_pasado > 0 then v_mal := v_mal + 1; end if;
  end loop;
  raise notice 'mal=%', v_mal;
  perform set_config('pg.mal', v_mal::text, true);
end;
$$;
select current_setting('pg.mal');\n`),
  "0",
);

console.log("\n— Guardar una oferta de grupo —");
esperarValor(
  "se guarda con su forma, y campana_reglas() la devuelve",
  caso(`${OFERTA()}select concat_ws('|', tipo, lleva, paga, coalesce(porcentaje::text, 'sin %'), agrupa, estado) from retail.campana_reglas() where id = :'r';\n`),
  "nxm|3|2|sin %|campana|activa",
);
esperarError("«lleva 3, paga 3» no es una oferta", caso(`${OFERTA({ forma: { tipo: "nxm", lleva: 3, paga: 3 } })}`), "M tiene que ser de 1 a 2");
esperarError("un grupo de una prenda no es un grupo", caso(`${OFERTA({ forma: { tipo: "nxm", lleva: 1, paga: 1 } })}`), "con 2 a 10 prendas");
esperarError("«N por S/» sin monto", caso(`${OFERTA({ forma: { tipo: "n_por_monto", lleva: 3 } })}`), "cuánto cuesta el grupo");
esperarError("una forma que no existe", caso(`${OFERTA({ forma: { tipo: "4x1x2" } })}`), "no existe");
esperarError(
  "la tabla tampoco deja un 3x2 sin su N",
  caso(`${OFERTA()}update retail.campana_reglas set lleva = null where id = :'r';\n`),
  "campana_reglas_forma",
);
esperarValor(
  "cambiar la forma (3x2 → 4x3) deja la de antes en la historia",
  caso(`${OFERTA()}select retail.guardar_oferta_completa(:'r', :'camp', 'ZZ 4x3', ${FORMA({ tipo: "nxm", lleva: 4, paga: 3 })}, ${HOY}, ${HOY} + 3, null, '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], true);
select (select lleva || 'x' || paga from retail.campana_reglas where id = :'r') || '|' || (select h.antes -> 'forma' ->> 'lleva' from retail.campana_regla_historial h where h.regla_id = :'r' and h.antes ? 'forma');\n`),
  "4x3|3",
);
esperarError(
  "un 3x2 que pisa un % menos en las mismas prendas, tienda y día: el candado no lo deja",
  caso(`${OFERTA({ forma: { tipo: "pct", porcentaje: 20 }, nombre: "ZZ 20", v: "r1" })}${OFERTA()}set constraints all immediate;\n`),
  "dos ofertas el mismo día",
);

console.log("\n— La migración —");
esperar("se puede pegar dos veces", correr(`begin;\n${ANTES}\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}\nrollback;`).ok);

console.log(`\n${total - fallos}/${total} pasaron${sinGrupo ? " (con la migración metida en cada transacción: la base local no la tiene)" : ""}.`);
process.exit(fallos ? 1 : 0);
