#!/usr/bin/env node
/**
 * Prueba de ADR-0542: el stock de una sede con dos empresas (Lima) se parte por dueño — migración
 * `20261027222000_stock_dueno_en_sedes_con_dos_empresas.sql`, contra el Postgres local.
 *
 * La escena: Lima con CAYLA y CLAURE, Trujillo solo con CAYLA (`empresa_sedes`, como en producción), una blusa de CAYLA con 3 de
 * stock inicial en el almacén de Lima y otra con 3 en el de Trujillo. Cada caso corre en su transacción que TERMINA EN ROLLBACK, con
 * la migración aplicada dentro: el Postgres local compartido no cambia.
 *
 * EL MODELO QUE SE PRUEBA. `stock_dueno` guarda SOLO lo que no es de la casa (CLAURE); CAYLA es el resto (`stock − lo de CLAURE`).
 * Un descuadre es imposible de representar, y la red al cierre atrapa el que un camino futuro intentara armar.
 *
 * QUÉ CUBRE
 *   · Entrada: sin dueño elegido toma el de la ficha (transitorio); con CLAURE elegida, suma al reparto y CAYLA sigue siendo el resto.
 *   · Salida: el dueño elegido baja lo suyo; sin elegir y con un solo dueño con unidades, toma ese; con unidades de los dos, se
 *     rechaza («elige de cuál es»); pedir más de lo que tiene un dueño se rechaza y dice cuántas hay; si el stock total no alcanza
 *     habla `fn_aplicar_movimiento` con su mensaje de siempre.
 *   · Traslados: de Lima a otra sede solo van unidades de las empresas que operan allá (CLAURE no sale de Lima); a Lima desde otra sede
 *     entra como CAYLA; dentro de Lima (almacén → piso) el reparto viaja con las prendas.
 *   · Apartados, liberaciones y ajustes de un dueño elegido.
 *   · Trujillo (una empresa) no cambia: el movimiento queda sin dueño y sin reparto; elegir CLAURE allí se rechaza.
 *   · La red al cierre: bajar el stock por debajo de lo de CLAURE, dos salidas de CAYLA en un solo INSERT que lo dejarían por debajo,
 *     y repartir donde no operan dos empresas NO hacen commit.
 *   · La carga inicial (cada prenda con el dueño con que se dio de alta), la migración pegada dos veces, y los permisos.
 *
 * USO: pnpm pruebas:stock-dueno   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261027222000_stock_dueno_en_sedes_con_dos_empresas.sql"), "utf8");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Una prenda nueva por el camino real; `ubic` es donde cae el stock inicial (la sede que se valida es la que se pasa en `sede`). */
const CREAR = (ref, empresa, ubic) =>
  `retail.crear_producto_con_empresa('${ref}', :'cat',
     jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', 26, 'cantidad', 3)),
     :'${empresa}', :'${ubic}', null, gen_random_uuid(), null, null, false, null, :'marca', :'prov', :'${ubic}', false)`;

/** Las sedes, las dos empresas, los lugares de cada sede, una categoría con talla, un color y una marca con su proveedor. Sin prendas. */
const SEDES = `
set local request.jwt.claim.sub = '${FELIPE}';
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as cayla from retail.empresas where clave = 'cayla' \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
insert into retail.empresa_sedes (empresa_id, ubicacion_id)
  values (:'cayla', :'lim'), (:'cayla', :'tru'), (:'claure', :'lim') on conflict do nothing;
update retail.ubicaciones set carga_inicial_hasta = null where id in (:'lim', :'tru');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'lim', :'tru']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda');
select id as piso_lim from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select id as alm_lim from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
select id as alm_tru from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and exists (select 1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id)
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
`;

/** La blusa de Lima (`v`, 3 en el almacén de Lima) y la de Trujillo (`vt`, 3 en el almacén de Trujillo), las dos de CAYLA. */
const PRENDAS = `
select ${CREAR("Prueba Dueño Lima", "cayla", "lim")} as p \\gset
select id as v from retail.variantes where producto_id = :'p' limit 1 \\gset
select ${CREAR("Prueba Dueño Trujillo", "cayla", "tru")} as pt \\gset
select id as vt from retail.variantes where producto_id = :'pt' limit 1 \\gset
`;

/** Con la migración primero (el caso normal) y la escena de siempre. */
const dentro = (cuerpo) => psql(`begin;\n${MIGRACION}\n${SEDES}\n${PRENDAS}\n${cuerpo}\nrollback;`);

/** Un movimiento directo de `variante` (lo que escriben todas las funciones) y su efecto en el stock. `empresa` es el dueño elegido. */
const MOVER = (variante, tipo, ubic, sub, cantidad, { destino = null, empresa = null } = {}) => `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, empresa_id)
  values (:'${variante}', :'${ubic}', :'${sub}', ${destino ? `:'${destino[0]}'` : "null"}, ${destino ? `:'${destino[1]}'` : "null"}, '${tipo}', ${cantidad}, 'otro', ${empresa ? `:'${empresa}'` : "null"})
  returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
`;

/** Lo que dice `fn_stock_por_dueno` de una prenda en una sede (0 si el dueño no tiene). */
const DUENO = (v, clave, sede = "lim") =>
  `coalesce((select x.cantidad from retail.fn_stock_por_dueno(:'${sede}') x where x.variante_id = :'${v}' and x.clave = '${clave}'), 0)`;
const TOTAL = (v, sede = "lim") => `(select coalesce(sum(cantidad), 0) from retail.stock where variante_id = :'${v}' and ubicacion_id = :'${sede}')`;
/** Lo de CLAURE escrito en `stock_dueno` para una prenda en un lugar. */
const CLAURE_EN = (v, sub) => `coalesce((select cantidad from retail.stock_dueno where variante_id = :'${v}' and sububicacion_id = :'${sub}' and empresa_id = :'claure'), 0)`;

let fallas = 0;
let total = 0;
function caso(nombre, fn) {
  total++;
  try {
    const detalle = fn();
    if (detalle) throw new Error(detalle);
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallas++;
    console.log(`✗ ${nombre}\n    ${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n    ")}`);
  }
}
/** Pasa si la ÚLTIMA línea de la salida es `t` (cada caso termina en una sola afirmación) y ninguna es `f`. */
const pasa = (sql, ejecutar = dentro) => () => {
  const lineas = ejecutar(sql).split("\n");
  if (lineas.includes("f") || lineas.at(-1) !== "t") return `salida inesperada: ${lineas.join(" | ")}`;
};
/** Debe rechazarse con ese texto Y, si se pide, con ese hint; cualquier otro error (o que pase) es una falla. */
const rechaza = (sql, texto, hint) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql)}`;
  } catch (e) {
    const err = String(e.stderr);
    if (!texto.test(err) || (hint && !new RegExp(hint).test(err))) throw e;
  }
};

console.log("— Entrar stock —");
caso(
  "una entrada sin elegir dueño toma el de la ficha (CAYLA) y no escribe en stock_dueno",
  pasa(`select (select count(*) from retail.movimientos where variante_id = :'v' and ubicacion_id = :'lim' and empresa_id is distinct from :'cayla') = 0
   and not exists (select 1 from retail.stock_dueno where variante_id = :'v')
   and ${TOTAL("v")} = 3
   -- una prenda toda de CAYLA no sale en el reparto: no hay nada que repartir ni que decir
   and not exists (select 1 from retail.fn_stock_por_dueno(:'lim') x where x.variante_id = :'v');`),
);
caso(
  "una entrada de CLAURE elegida suma al reparto y CAYLA sigue siendo el resto",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}
select ${DUENO("v", "cayla")} = 3 and ${DUENO("v", "claure")} = 2 and ${TOTAL("v")} = 5 and ${CLAURE_EN("v", "alm_lim")} = 2
   and (select empresa_id from retail.movimientos where id = :'m') = :'claure';`),
);
caso(
  "un ajuste + de CLAURE elegido suma, uno − lo baja, y uno + sin elegir toma la ficha",
  pasa(`${MOVER("v", "ajuste", "lim", "alm_lim", 2, { empresa: "claure" })}
${MOVER("v", "ajuste", "lim", "alm_lim", -1, { empresa: "claure" })}
${MOVER("v", "ajuste", "lim", "alm_lim", 1)}
select ${DUENO("v", "claure")} = 1 and ${DUENO("v", "cayla")} = 4 and ${TOTAL("v")} = 5;`),
);

console.log("\n— El dueño que elige la pantalla viaja en un encabezado —");
/** Lo que manda la web con `.setHeader("x-dueno", …)`: PostgREST lo deja en `request.headers` y el disparador lo lee. */
const ENCABEZADOS = (json) => `select set_config('request.headers', ${json}::text, true) as _h \\gset`;
caso(
  "x-dueno hace de CLAURE todo lo que mueve la llamada, sin tocar la función que escribe el movimiento",
  pasa(`${ENCABEZADOS(`json_build_object('x-dueno', :'claure')`)}
${MOVER("v", "entrada", "lim", "alm_lim", 2)}
select ${DUENO("v", "claure")} = 2 and ${DUENO("v", "cayla")} = 3 and (select empresa_id from retail.movimientos where id = :'m') = :'claure';`),
);
caso(
  "x-dueno-lineas pone el dueño de cada prenda y le gana al x-dueno general",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}
${ENCABEZADOS(`json_build_object('x-dueno', :'claure', 'x-dueno-lineas', json_build_object(:'v'::text, :'cayla'))`)}
${MOVER("v", "salida", "lim", "alm_lim", 1)}
select ${DUENO("v", "cayla")} = 2 and ${DUENO("v", "claure")} = 2 and (select empresa_id from retail.movimientos where id = :'m') = :'cayla';`),
);
caso(
  "el alta de una prenda de CLAURE desde Lima (crear_producto_con_empresa) deja su stock inicial como de CLAURE",
  pasa(`${ENCABEZADOS(`json_build_object('x-dueno', :'claure')`)}
select ${CREAR("Prueba Dueño Alta", "claure", "lim")} as pa \\gset
select id as va from retail.variantes where producto_id = :'pa' limit 1 \\gset
select ${DUENO("va", "claure")} = 3 and ${DUENO("va", "cayla")} = 0 and ${CLAURE_EN("va", "alm_lim")} = 3
   and (select empresa_id from retail.productos where id = :'pa') = :'claure';`),
);
caso(
  "un dueño inválido en el encabezado se rechaza",
  rechaza(`${ENCABEZADOS(`json_build_object('x-dueno', 'no-es-un-uuid')`)}${MOVER("v", "entrada", "lim", "alm_lim", 1)}`, /El dueño enviado no es válido/),
);

console.log("\n— Sacar stock —");
caso(
  "una salida sin elegir, con unidades de las dos empresas, se rechaza: elige de cuál es",
  rechaza(
    `${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "salida", "lim", "alm_lim", 1)}`,
    /Prueba Dueño Lima tiene 3 de CAYLA y 2 de CLAURE en Tienda Lima: elige de cuál es\./,
    "elegir_dueno",
  ),
);
caso(
  "una venta de CLAURE elegida baja lo de CLAURE y deja a CAYLA igual",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "salida", "lim", "alm_lim", 1, { empresa: "claure" })}
select ${DUENO("v", "claure")} = 1 and ${DUENO("v", "cayla")} = 3 and ${TOTAL("v")} = 4 and (select empresa_id from retail.movimientos where id = :'m') = :'claure';`),
);
caso(
  "una venta de CAYLA elegida baja lo de CAYLA y deja a CLAURE igual",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "salida", "lim", "alm_lim", 1, { empresa: "cayla" })}
select ${DUENO("v", "claure")} = 2 and ${DUENO("v", "cayla")} = 2 and ${TOTAL("v")} = 4 and (select empresa_id from retail.movimientos where id = :'m') = :'cayla';`),
);
caso(
  "pedir más de lo que tiene un dueño, habiendo en total, se rechaza y dice cuántas hay",
  rechaza(
    `${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "salida", "lim", "alm_lim", 3, { empresa: "claure" })}`,
    /hay 3 de CAYLA y 2 de CLAURE, y de CLAURE solo 2: no alcanza para 3\./,
    "dueno_sin_unidades",
  ),
);
caso(
  "sin elegir y con unidades de un solo dueño, la salida toma a ese dueño",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "salida", "lim", "alm_lim", 3, { empresa: "cayla" })}${MOVER("v", "salida", "lim", "alm_lim", 1)}
select ${DUENO("v", "claure")} = 1 and ${DUENO("v", "cayla")} = 0 and (select empresa_id from retail.movimientos where id = :'m') = :'claure';`),
);
caso(
  "si el stock total no alcanza, habla fn_aplicar_movimiento con su mensaje de siempre",
  rechaza(`${MOVER("v", "salida", "lim", "alm_lim", 99)}`, /Stock insuficiente: hay 3 y se pide sacar 99/),
);
caso(
  "con un dueño elegido y el stock total corto, tampoco inventa otro mensaje",
  rechaza(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "salida", "lim", "alm_lim", 99, { empresa: "claure" })}`, /Stock insuficiente: hay 5 y se pide sacar 99/),
);

console.log("\n— Cuando nadie puede elegir —");
caso(
  "lo que se entrega de un apartado sale del dueño al que se le liberó (misma transacción), aunque haya de los dos",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "apartado", "lim", "alm_lim", 1, { empresa: "claure" })}
${MOVER("v", "liberacion_apartado", "lim", "alm_lim", 1)}${MOVER("v", "salida", "lim", "alm_lim", 1)}
select ${DUENO("v", "claure")} = 1 and ${DUENO("v", "cayla")} = 3 and (select empresa_id from retail.movimientos where id = :'m') = :'claure';`),
);
caso(
  "soltar un apartado con apartadas de los dos dueños saca primero de la casa, en vez de rechazar",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "apartado", "lim", "alm_lim", 1, { empresa: "cayla" })}${MOVER("v", "apartado", "lim", "alm_lim", 1, { empresa: "claure" })}
${MOVER("v", "liberacion_apartado", "lim", "alm_lim", 1)}
select (select empresa_id from retail.movimientos where id = :'m') = :'cayla'
   and (select cantidad_apartada from retail.stock_dueno where variante_id = :'v' and empresa_id = :'claure') = 1;`),
);
caso(
  "quien llama no es personal de la tienda (la tienda online): con unidades de los dos, sale de la casa en vez de rechazar",
  pasa(`select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true) as _s \\gset
${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "apartado", "lim", "alm_lim", 1)}
select (select empresa_id from retail.movimientos where id = :'m') = :'cayla';`),
);

console.log("\n— Devoluciones y cambios vuelven al dueño de la venta —");
/** Una venta de `v` (movimiento de salida enlazado a su línea) del dueño dado, y su devolución, por las tablas reales. */
const VENDIDA = (empresa) => `
insert into retail.ventas (ubicacion_id) values (:'lim') returning id as vta \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'vta', :'v', 1, 59, 26) returning id as vi \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, empresa_id)
  values (:'v', :'lim', :'alm_lim', 'salida', 1, 'venta', :'vi', ${empresa ? `:'${empresa}'` : "null"}) returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
`;
const DEVOLUCION = `
insert into retail.devoluciones (venta_id, ubicacion_id, motivo) values (:'vta', :'lim', 'prueba') returning id as dev \\gset
insert into retail.devolucion_items (devolucion_id, venta_item_id, cantidad, condicion) values (:'dev', :'vi', 1, 'vendible') returning id as di \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, devolucion_item_id)
  values (:'v', :'lim', :'alm_lim', 'entrada', 1, 'devolucion', :'di') returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
`;
caso(
  "una devolución de una venta de CLAURE vuelve a CLAURE, sin que nadie lo marque",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${VENDIDA("claure")}${DEVOLUCION}
select (select empresa_id from retail.movimientos where id = :'m') = :'claure' and ${DUENO("v", "claure")} = 2 and ${DUENO("v", "cayla")} = 3;`),
);
caso(
  "una devolución de una venta de CAYLA vuelve a CAYLA aunque haya unidades de CLAURE",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${VENDIDA("cayla")}${DEVOLUCION}
select (select empresa_id from retail.movimientos where id = :'m') = :'cayla' and ${DUENO("v", "claure")} = 2 and ${DUENO("v", "cayla")} = 3;`),
);
caso(
  "un cambio: lo devuelto vuelve a su dueño y la prenda nueva sale del mismo dueño aunque haya de los dos",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${VENDIDA("claure")}
insert into retail.cambios (venta_item_id, ubicacion_id, variante_nueva_id, cantidad) values (:'vi', :'lim', :'v', 1) returning id as cam \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id) values (:'v', :'lim', :'alm_lim', 'entrada', 1, 'cambio', :'cam') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, cambio_id) values (:'v', :'lim', :'alm_lim', 'salida', 1, 'cambio', :'cam') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m2') as _a2 \\gset
select (select empresa_id from retail.movimientos where id = :'m1') = :'claure' and (select empresa_id from retail.movimientos where id = :'m2') = :'claure'
   and ${DUENO("v", "claure")} = 1 and ${DUENO("v", "cayla")} = 3;`),
);

caso(
  "anular una venta de CLAURE devuelve la unidad a CLAURE, sin que nadie lo marque",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${VENDIDA("claure")}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id) values (:'v', :'lim', :'alm_lim', 'entrada', 1, 'anulacion_venta', :'vi') returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
select (select empresa_id from retail.movimientos where id = :'m') = :'claure' and ${DUENO("v", "claure")} = 2;`),
);
caso(
  "lo que llega de un traslado (o vuelve de uno anulado) es de la casa: CLAURE solo existe en Lima",
  pasa(`select retail.fn_dueno_de_una_entrada(:'v', null, null, null, gen_random_uuid(), null, null) = :'cayla'
   and retail.fn_dueno_de_una_entrada(:'v', null, null, null, null, gen_random_uuid(), null) = :'cayla';`),
);
caso(
  "un ingreso sin dueño que llega de la app (con encabezados de PostgREST) se rechaza: elige si es de CAYLA o de CLAURE",
  rechaza(`${ENCABEZADOS(`json_build_object('x-responsable', gen_random_uuid())`)}${MOVER("v", "entrada", "lim", "alm_lim", 1)}`, /elige si lo que entra es de CAYLA o de CLAURE\./, "elegir_dueno"),
);
caso(
  "el mismo ingreso desde un proceso interno (sin encabezados: un script, el SQL Editor) toma el de la ficha, como antes del libro",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 1)}select (select empresa_id from retail.movimientos where id = :'m') = :'cayla';`),
);

caso(
  "regularizar una prenda vendida sin registrar (entrada ligada a la línea + su salida) funciona aunque haya unidades de los dos, desde la app",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}
insert into retail.ventas (ubicacion_id) values (:'lim') returning id as vta \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'vta', :'v', 1, 59, 26) returning id as vi \\gset
${ENCABEZADOS(`json_build_object('x-responsable', gen_random_uuid())`)}
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id) values (:'v', :'lim', :'alm_lim', 'entrada', 1, 'ingreso_regularizado', :'vi') returning id as m1 \\gset
select retail.fn_aplicar_movimiento(:'m1') as _a1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id) values (:'v', :'lim', :'alm_lim', 'salida', 1, 'venta', :'vi') returning id as m2 \\gset
select retail.fn_aplicar_movimiento(:'m2') as _a2 \\gset
select (select empresa_id from retail.movimientos where id = :'m1') = :'cayla' and (select empresa_id from retail.movimientos where id = :'m2') = :'cayla'
   and ${DUENO("v", "cayla")} = 3 and ${DUENO("v", "claure")} = 2;`),
);
caso(
  "un cambio cuya venta original no tiene movimiento (de otra sede, o anterior al libro) usa la ficha de la prenda en vez de rechazar",
  pasa(`insert into retail.ventas (ubicacion_id) values (:'tru') returning id as vta \\gset
insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (:'vta', :'v', 1, 59, 26) returning id as vi \\gset
select retail.fn_dueno_de_lo_vendido(null, null, :'vi') = :'cayla';`),
);

console.log("\n— Traslados —");
caso(
  "un traslado de Lima a Trujillo, con unidades de las dos, lleva las de CAYLA y no toca a CLAURE",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "traslado", "lim", "alm_lim", 1, { destino: ["tru", "alm_tru"] })}
select (select empresa_id from retail.movimientos where id = :'m') = :'cayla'
   and ${DUENO("v", "cayla")} = 2 and ${DUENO("v", "claure")} = 2 and ${TOTAL("v", "tru")} = 1
   and not exists (select 1 from retail.stock_dueno where ubicacion_id = :'tru');`),
);
caso(
  "un traslado que solo se podría cubrir con unidades de CLAURE se rechaza y dice cuántas sí pueden ir",
  rechaza(
    `${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "traslado", "lim", "alm_lim", 4, { destino: ["tru", "alm_tru"] })}`,
    /solo 3 pueden ir a Tienda Trujillo\. El resto es de CLAURE, que no opera allí/,
    "empresa_fuera_de_sede",
  ),
);
caso(
  "un traslado de CLAURE elegido a Trujillo se rechaza: CLAURE no opera allí",
  rechaza(
    `${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "traslado", "lim", "alm_lim", 1, { destino: ["tru", "alm_tru"], empresa: "claure" })}`,
    /CLAURE no opera en Tienda Trujillo: sus unidades solo se venden, se reciben y se trasladan en Tienda Lima\./,
    "empresa_fuera_de_sede",
  ),
);
caso(
  "un traslado de Trujillo a Lima entra como CAYLA",
  pasa(`${MOVER("vt", "traslado", "tru", "alm_tru", 1, { destino: ["lim", "alm_lim"] })}
select (select empresa_id from retail.movimientos where id = :'m') = :'cayla' and ${TOTAL("vt")} = 1
   and not exists (select 1 from retail.stock_dueno where variante_id = :'vt')
   and not exists (select 1 from retail.fn_stock_por_dueno(:'lim') x where x.variante_id = :'vt');`),
);
caso(
  "pasar unidades de CLAURE del almacén al piso, dentro de Lima, mueve el reparto con ellas",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "traslado", "lim", "alm_lim", 1, { destino: ["lim", "piso_lim"], empresa: "claure" })}
select ${CLAURE_EN("v", "alm_lim")} = 1 and ${CLAURE_EN("v", "piso_lim")} = 1 and ${DUENO("v", "cayla")} = 3 and ${DUENO("v", "claure")} = 2 and ${TOTAL("v")} = 5;`),
);
caso(
  "pasar al piso sin elegir dueño, con unidades de las dos, se rechaza igual que una venta",
  rechaza(
    `${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "traslado", "lim", "alm_lim", 1, { destino: ["lim", "piso_lim"] })}`,
    /elige de cuál es\./,
    "elegir_dueno",
  ),
);

console.log("\n— Apartar y liberar —");
caso(
  "apartar y liberar unidades de CLAURE mueve lo apartado de CLAURE y no lo de CAYLA",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "apartado", "lim", "alm_lim", 1, { empresa: "claure" })}
select ((select cantidad_apartada from retail.stock_dueno where variante_id = :'v' and empresa_id = :'claure') = 1
   and (select cantidad_apartada from retail.stock where variante_id = :'v' and ubicacion_id = :'lim') = 1
   and (select x.cantidad_apartada from retail.fn_stock_por_dueno(:'lim') x where x.variante_id = :'v' and x.clave = 'cayla') = 0) as apartado_ok \\gset
${MOVER("v", "liberacion_apartado", "lim", "alm_lim", 1, { empresa: "claure" })}
select :'apartado_ok'::boolean
   and (select cantidad_apartada from retail.stock_dueno where variante_id = :'v' and empresa_id = :'claure') = 0
   and (select cantidad_apartada from retail.stock where variante_id = :'v' and ubicacion_id = :'lim') = 0;`),
);
caso(
  "apartar sin elegir dueño, con unidades disponibles de las dos, se rechaza",
  rechaza(
    `${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}${MOVER("v", "apartado", "lim", "alm_lim", 1)}`,
    /elige de cuál es\./,
    "elegir_dueno",
  ),
);

console.log("\n— Donde no hay dos empresas nada cambia —");
caso(
  "en Trujillo el movimiento queda sin dueño y no hay reparto",
  pasa(`${MOVER("vt", "entrada", "tru", "alm_tru", 1)}
select (select empresa_id from retail.movimientos where id = :'m') is null and not exists (select 1 from retail.stock_dueno where ubicacion_id = :'tru')
   and ${TOTAL("vt", "tru")} = 4 and not exists (select 1 from retail.fn_stock_por_dueno(:'tru'));`),
);
caso(
  "elegir CLAURE en Trujillo se rechaza",
  rechaza(`${MOVER("vt", "entrada", "tru", "alm_tru", 1, { empresa: "claure" })}`, /CLAURE no opera en Tienda Trujillo/, "empresa_fuera_de_sede"),
);

console.log("\n— La red al cerrar la transacción —");
caso(
  "bajar el stock de una fila por debajo de lo de CLAURE no hace commit",
  rechaza(
    `${MOVER("v", "entrada", "lim", "alm_lim", 2, { empresa: "claure" })}
update retail.stock set cantidad = 1 where variante_id = :'v' and ubicacion_id = :'lim';
set constraints all immediate;`,
    /El reparto por dueño de Prueba Dueño Lima en Tienda Lima no cuadra con su stock/,
    "stock_dueno_descuadre",
  ),
);
caso(
  "dos salidas de CAYLA en un solo INSERT que dejarían el stock por debajo de lo de CLAURE no hacen commit",
  rechaza(
    // Las dos filas entran en UN solo INSERT, antes de que fn_aplicar_movimiento toque el stock: la segunda no puede ver lo de la primera.
    `${MOVER("v", "entrada", "lim", "alm_lim", 3, { empresa: "claure" })}
create temp table _ids (id uuid) on commit drop;
with ins as (
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, empresa_id)
  values (:'v', :'lim', :'alm_lim', 'salida', 2, 'otro', :'cayla'), (:'v', :'lim', :'alm_lim', 'salida', 2, 'otro', :'cayla')
  returning id)
insert into _ids select id from ins;
select retail.fn_aplicar_movimiento(id) from _ids;
set constraints all immediate;`,
    /no cuadra con su stock/,
    "stock_dueno_descuadre",
  ),
);
caso(
  "repartir por dueño donde no operan dos empresas no hace commit",
  rechaza(
    `insert into retail.stock_dueno (variante_id, ubicacion_id, sububicacion_id, empresa_id, cantidad) values (:'vt', :'tru', :'alm_tru', :'claure', 1);
set constraints all immediate;`,
    /no cuadra con su stock|donde ya no operan dos empresas/,
    "stock_dueno_descuadre",
  ),
);
caso(
  "la casa nunca se escribe en stock_dueno: es el resto",
  rechaza(
    `insert into retail.stock_dueno (variante_id, ubicacion_id, sububicacion_id, empresa_id, cantidad) values (:'v', :'lim', :'alm_lim', :'cayla', 1);`,
    /stock_dueno_no_es_la_casa/,
  ),
);
caso(
  "después de una secuencia de entradas, ventas, traslados y apartados no queda ningún descuadre",
  pasa(`${MOVER("v", "entrada", "lim", "alm_lim", 4, { empresa: "claure" })}${MOVER("v", "salida", "lim", "alm_lim", 1, { empresa: "claure" })}
${MOVER("v", "traslado", "lim", "alm_lim", 2, { destino: ["tru", "alm_tru"], empresa: "cayla" })}${MOVER("v", "traslado", "lim", "alm_lim", 1, { destino: ["lim", "piso_lim"], empresa: "claure" })}
${MOVER("v", "apartado", "lim", "alm_lim", 1, { empresa: "claure" })}
set constraints all immediate;
select not exists (select 1 from retail.fn_stock_dueno_descuadres());`),
);

console.log("\n— La carga inicial y la migración —");
caso("cada prenda arranca con el dueño con que se dio de alta: la de CLAURE parte con sus 3; la de CAYLA, sin filas", () => {
  const salida = psql(`begin;\n${SEDES}\n${PRENDAS}
select ${CREAR("Prueba Dueño Claure", "claure", "lim")} as pc \\gset
select id as vc from retail.variantes where producto_id = :'pc' limit 1 \\gset
set constraints all immediate;
${MIGRACION}
select ${CLAURE_EN("vc", "alm_lim")} = 3 and ${DUENO("vc", "claure")} = 3 and ${DUENO("vc", "cayla")} = 0
   and not exists (select 1 from retail.stock_dueno where variante_id = :'v') and ${TOTAL("v")} = 3
   and not exists (select 1 from retail.fn_stock_dueno_descuadres());
rollback;`);
  if (salida.split("\n").at(-1) !== "t") return `salida inesperada: ${salida}`;
});
caso("pegada dos veces: no duplica ni pisa la carga, y deja un disparador de cada uno", () => {
  const salida = psql(`begin;\n${SEDES}\n${PRENDAS}
select ${CREAR("Prueba Dueño Claure", "claure", "lim")} as pc \\gset
select id as vc from retail.variantes where producto_id = :'pc' limit 1 \\gset
set constraints all immediate;
${MIGRACION}
${MOVER("vc", "salida", "lim", "alm_lim", 1, { empresa: "claure" })}
${MIGRACION}
select ${CLAURE_EN("vc", "alm_lim")} = 2 and ${TOTAL("vc")} = 2
   and (select count(*) from pg_trigger where not tgisinternal and tgname in ('trg_movimientos_libro_por_dueno', 'stock_cuadra_con_dueno', 'stock_dueno_cuadra_con_stock')) = 3;
rollback;`);
  if (salida.split("\n").at(-1) !== "t") return `salida inesperada: ${salida}`;
});
caso("sus funciones internas y la tabla no las toca nadie por la API; solo fn_stock_por_dueno es de authenticated", () => {
  const salida = psql(`begin;\n${MIGRACION}
select not has_function_privilege('anon', 'retail.fn_movimiento_libro_por_dueno()', 'execute')
   and not has_function_privilege('authenticated', 'retail.fn_movimiento_libro_por_dueno()', 'execute')
   and not has_function_privilege('authenticated', 'retail.fn_dueno_de_una_salida(uuid, uuid, uuid, text, integer, uuid, uuid, uuid)', 'execute')
   and not has_function_privilege('authenticated', 'retail.fn_stock_dueno_descuadres()', 'execute')
   and not has_function_privilege('authenticated', 'retail.fn_stock_dueno_cuadra()', 'execute')
   and not has_function_privilege('anon', 'retail.fn_stock_por_dueno(uuid)', 'execute')
   and has_function_privilege('authenticated', 'retail.fn_stock_por_dueno(uuid)', 'execute')
   and not has_table_privilege('authenticated', 'retail.stock_dueno', 'select')
   and not has_table_privilege('anon', 'retail.stock_dueno', 'select')
   and (select relrowsecurity from pg_class where oid = 'retail.stock_dueno'::regclass);
rollback;`);
  if (salida.split("\n").at(-1) !== "t") return `salida inesperada: ${salida}`;
});
caso("al borrar una prenda se va con su reparto (la llave a variantes es en cascada)", () => {
  const salida = psql(`begin;\n${MIGRACION}
select confdeltype = 'c' from pg_constraint where conrelid = 'retail.stock_dueno'::regclass and confrelid = 'retail.variantes'::regclass;
rollback;`);
  if (salida.split("\n").at(-1) !== "t") return `salida inesperada: ${salida}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
