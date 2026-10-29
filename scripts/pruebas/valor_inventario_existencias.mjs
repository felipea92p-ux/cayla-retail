#!/usr/bin/env node
/**
 * Prueba de ADR-0557: «Ver el valor a costo» de Existencias — migración `20261028211000_valor_inventario_existencias.sql`
 * (`retail.fn_valor_inventario_existencias()`), contra el Postgres local.
 *
 * LO QUE VIGILA. Que el valor del inventario que ve el líder en Existencias (1) lo vea SOLO quien pasa la puerta del dinero de Compras y
 * esa puerta esté en la base, (2) cuente lo que Existencias cuenta y deje aparte lo dañado y lo de CLAURE, (3) no presente como firme
 * lo que no tiene costo, y (4) CUADRE con la Mercadería del Balance (`fn_bal_stock`) salvo las diferencias que la pantalla declara.
 *
 * LA ESCENA. Lima con CAYLA y CLAURE, Trujillo solo con CAYLA, una blusa de CAYLA con 3 de stock a S/ 26 en cada una (como
 * `stock_dueno.mjs`). Como la base local trae más prendas, cada caso mide la DIFERENCIA que produce la blusa sobre lo que ya había.
 * Cada caso corre en su transacción que TERMINA EN ROLLBACK, con las migraciones cargadas dentro: el Postgres compartido no cambia.
 *
 * QUÉ CUBRE
 *   P  La puerta: el líder ve una fila por sede activa; una colaboradora sin módulos de Compras, 0 filas (nunca una fila en cero);
 *      con Facturas de compra ve SOLO su sede; con Existencias solo, 0 filas; `anon` no puede ejecutarla.
 *   V  El valor: la blusa suma 3 unidades y S/ 78 a su sede y no a la otra; una variante inactiva o de un producto de prueba no cuenta;
 *      la centinela del «Monto manual» (999.999 unidades) tampoco.
 *   C  Sin costo: con costo 0 suma las unidades pero ni un sol, y se cuenta como prenda sin costo.
 *   D  Lo dañado va aparte y no entra al valor de CAYLA.
 *   E  Lo de CLAURE va aparte: CAYLA sigue siendo el resto, y las unidades de CLAURE no suman a su valor.
 *   H  La historia del costo: el valor de una prenda con compra/Producción se separa del que solo salió del alta.
 *   B  Cuadre con el Balance: lo que sube `fn_bal_stock` es exactamente valor + dañado + CLAURE de esta función.
 *   L  «Ver cuáles»: `fn_tallas_sin_costo` lista las tallas sin costo con las mismas reglas que la suma (sin dañadas ni CLAURE), con la
 *      misma puerta y sede (sin permiso, NULL), y su total es el mismo número que cuenta la suma.
 *   I  La migración se puede pegar dos veces.
 *
 * USO: pnpm pruebas:valor-inventario-existencias   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leer = (f) => readFileSync(join(RAIZ, "supabase/migrations", f), "utf8");
const DUENO = leer("20261027222000_stock_dueno_en_sedes_con_dos_empresas.sql");
const MIGRACION = leer("20261028211000_valor_inventario_existencias.sql");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora fija a Tienda Trujillo
const CENTINELA = "22222222-2222-4222-8222-222222222222";

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Una prenda nueva por el camino real (costo 26, 3 unidades en `ubic`). */
const CREAR = (ref, empresa, ubic) =>
  `retail.crear_producto_con_empresa('${ref}', :'cat',
     jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', 26, 'cantidad', 3)),
     :'${empresa}', :'${ubic}', null, gen_random_uuid(), null, null, false, null, :'marca', :'prov', :'${ubic}', false)`;

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
select id as alm_lim from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and exists (select 1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id)
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
`;

/** Lo que ya valía cada sede ANTES de la blusa y lo que sube `fn_bal_stock` (se lee como superusuario: la API no la puede llamar). */
const ANTES = `
create temp table antes_fn as select * from retail.fn_valor_inventario_existencias();
create temp table antes_bal as select * from retail.fn_bal_stock(retail.fn_hoy_lima());
`;

/** La blusa de Lima (`v`, 3 unidades) y la de Trujillo (`vt`, 3 unidades), las dos de CAYLA, a S/ 26. */
const PRENDAS = `
select ${CREAR("Prueba Valor Lima", "cayla", "lim")} as p \\gset
select id as v from retail.variantes where producto_id = :'p' limit 1 \\gset
select ${CREAR("Prueba Valor Trujillo", "cayla", "tru")} as pt \\gset
select id as vt from retail.variantes where producto_id = :'pt' limit 1 \\gset
`;

/** Lo que dice la función hoy menos lo que decía antes, de una sede y una columna. */
const DELTA = (sede, col) =>
  `((select ${col} from retail.fn_valor_inventario_existencias() where ubicacion_id = :'${sede}') - (select ${col} from antes_fn where ubicacion_id = :'${sede}'))`;
/** Lo que sube `fn_bal_stock` de una sede (valor). */
const DELTA_BAL = (sede) =>
  `(coalesce((select valor from retail.fn_bal_stock(retail.fn_hoy_lima()) where ubicacion_id = :'${sede}'), 0) - coalesce((select valor from antes_bal where ubicacion_id = :'${sede}'), 0))`;

const dentro = (cuerpo, { dosVeces = false } = {}) =>
  psql(`begin;\n${DUENO}\n${MIGRACION}\n${dosVeces ? MIGRACION : ""}\n${SEDES}\n${ANTES}\n${PRENDAS}\n${cuerpo}\nrollback;`);

/** Entrada de CLAURE en el almacén de Lima, por el camino real de los movimientos. */
const ENTRADA_CLAURE = (cantidad) => `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, empresa_id)
  values (:'v', :'lim', :'alm_lim', 'entrada', ${cantidad}, 'otro', :'claure') returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
`;
/** Dos unidades de la blusa de Lima en una cuarentena (lo dañado). */
const DANADAS = (cantidad) => `
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'lim', 'Cuarentena de prueba', 'cuarentena' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'cuarentena');
select id as cuar from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'cuarentena' limit 1 \\gset
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (:'v', :'lim', :'cuar', ${cantidad})
  on conflict (variante_id, ubicacion_id, sububicacion_id) do update set cantidad = retail.stock.cantidad + excluded.cantidad;
`;
/** Micaela (no es líder, de Trujillo) con un rol a medida que ve SOLO esos módulos, y la llamada ya hecha como la API (rol authenticated). */
const COMO_MICAELA = (...modulos) => `
insert into retail.roles (nombre) values ('ZZ Prueba ADR-0557') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = (select id from public.personas where auth_user_id = '${MICAELA}');
set local request.jwt.claim.sub = '${MICAELA}';
set local request.jwt.claims = '{"sub":"${MICAELA}","role":"authenticated"}';
set local role authenticated;
`;

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
/** Pasa si la ÚLTIMA línea de la salida es `t` y ninguna es `f`. */
const pasa = (sql, opciones) => () => {
  const lineas = dentro(sql, opciones).split("\n");
  if (lineas.includes("f") || lineas.at(-1) !== "t") return `salida inesperada: ${lineas.join(" | ")}`;
};

console.log("— P · La puerta —");
caso(
  "el líder ve una fila por sede activa, también las que no tienen nada",
  pasa(`select (select count(*) from retail.fn_valor_inventario_existencias()) = (select count(*) from retail.ubicaciones where activo);`),
);
caso(
  "una colaboradora sin módulos de Compras no recibe ni una fila (nunca una fila en cero)",
  pasa(`${COMO_MICAELA("existencias", "vender")}
select (select count(*) from retail.fn_valor_inventario_existencias()) = 0;`),
);
caso(
  "con Facturas de compra ve SOLO su sede (Trujillo), con la blusa de Trujillo y sin la de Lima",
  pasa(`select unidades as antes_tru from antes_fn where ubicacion_id = :'tru' \\gset
${COMO_MICAELA("facturas_compra")}
select (select count(*) from retail.fn_valor_inventario_existencias()) = 1
   and (select ubicacion_id from retail.fn_valor_inventario_existencias()) = :'tru'
   and (select unidades from retail.fn_valor_inventario_existencias()) = :antes_tru + 3;`),
);
caso(
  "con Existencias solo (sin dinero de Compras) sigue sin ver nada, aunque el módulo sea el de la pantalla",
  pasa(`${COMO_MICAELA("existencias")}
select not retail.fn_puede_ver_dinero_de_compras() and (select count(*) from retail.fn_valor_inventario_existencias()) = 0;`),
);
caso("solo authenticated la ejecuta: anon y public no", () =>
  psql(`begin;\n${DUENO}\n${MIGRACION}\nselect has_function_privilege('authenticated', 'retail.fn_valor_inventario_existencias()', 'execute')
   and not has_function_privilege('anon', 'retail.fn_valor_inventario_existencias()', 'execute')
   and has_function_privilege('authenticated', 'retail.fn_tallas_sin_costo(uuid)', 'execute')
   and not has_function_privilege('anon', 'retail.fn_tallas_sin_costo(uuid)', 'execute');\nrollback;`).split("\n").at(-1) === "t"
    ? undefined
    : "permisos distintos a los prometidos",
);

console.log("— V · El valor —");
caso(
  "la blusa de Lima suma 3 unidades y S/ 78 a Lima y nada a Trujillo",
  pasa(`select ${DELTA("lim", "unidades")} = 3 and ${DELTA("lim", "valor")} = 78
   and ${DELTA("tru", "unidades")} = 3 and ${DELTA("tru", "valor")} = 78;`),
);
caso(
  "una variante inactiva no cuenta (Existencias tampoco la cuenta)",
  // Un disparador impide retirar una talla con prendas (Existencias solo vio inactivas con stock en datos viejos): se simula como esos datos.
  pasa(`set local session_replication_role = replica;
update retail.variantes set activo = false where id = :'v';
set local session_replication_role = origin;
select ${DELTA("lim", "unidades")} = 0 and ${DELTA("lim", "valor")} = 0;`),
);
caso(
  "un producto de prueba no cuenta",
  pasa(`update retail.productos set es_prueba = true where id = :'p';
select ${DELTA("lim", "unidades")} = 0 and ${DELTA("lim", "valor")} = 0;`),
);
caso(
  "la centinela del «Monto manual» (999.999 unidades) no infla la sede",
  pasa(`insert into retail.stock (variante_id, ubicacion_id, cantidad) values ('${CENTINELA}', :'lim', 999999)
  on conflict do nothing;
select ${DELTA("lim", "unidades")} = 3 and ${DELTA("lim", "valor")} = 78;`),
);

console.log("— C · Sin costo —");
caso(
  "con costo 0 no suma ni un sol, pero cuenta las unidades y la prenda como «sin costo»",
  pasa(`update retail.variantes set costo = 0 where id = :'v';
select ${DELTA("lim", "valor")} = 0 and ${DELTA("lim", "unidades")} = 3
   and ${DELTA("lim", "unidades_sin_costo")} = 3 and ${DELTA("lim", "prendas_sin_costo")} = 1;`),
);
caso(
  "con costo, nada queda como «sin costo»",
  pasa(`select ${DELTA("lim", "unidades_sin_costo")} = 0 and ${DELTA("lim", "prendas_sin_costo")} = 0;`),
);

console.log("— D · Lo dañado va aparte —");
caso(
  "2 unidades en cuarentena no suman al valor de CAYLA: salen en «dañadas» con su valor",
  pasa(`${DANADAS(2)}
select ${DELTA("lim", "unidades")} = 3 and ${DELTA("lim", "valor")} = 78
   and ${DELTA("lim", "unidades_danadas")} = 2 and ${DELTA("lim", "valor_danadas")} = 52;`),
);

console.log("— E · Lo de CLAURE va aparte —");
caso(
  "2 unidades de CLAURE no suman al valor de CAYLA: CAYLA sigue con sus 3 y CLAURE sale aparte",
  pasa(`${ENTRADA_CLAURE(2)}
select ${DELTA("lim", "unidades")} = 3 and ${DELTA("lim", "valor")} = 78
   and ${DELTA("lim", "unidades_claure")} = 2 and ${DELTA("lim", "valor_claure")} = 52;`),
);
caso(
  "en una sede de una sola empresa (Trujillo) no hay nada de CLAURE",
  pasa(`${ENTRADA_CLAURE(2)}
select ${DELTA("tru", "unidades_claure")} = 0 and ${DELTA("tru", "valor_claure")} = 0;`),
);

console.log("— H · La historia del costo —");
caso(
  "sin una compra o Producción detrás, el valor de la blusa NO cuenta como «con costo de compra»",
  pasa(`select ${DELTA("lim", "valor")} = 78 and ${DELTA("lim", "valor_con_costo_de_compra")} = 0;`),
);
caso(
  "con una fila en costo_historial (compra), sus S/ 78 pasan a «con costo de compra»",
  pasa(`insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id)
  select :'v', 0, 26, 3, 26, 26, 'compra', m.id from retail.movimientos m where m.variante_id = :'v' limit 1;
select ${DELTA("lim", "valor")} = 78 and ${DELTA("lim", "valor_con_costo_de_compra")} = 78;`),
);

console.log("— B · Cuadre con el Balance —");
caso(
  "sin diferencias, lo que sube la Mercadería del Balance es exactamente lo que sube esta función",
  pasa(`select ${DELTA_BAL("lim")} = ${DELTA("lim", "valor")} and ${DELTA_BAL("tru")} = ${DELTA("tru", "valor")};`),
);
caso(
  "con dañadas y con CLAURE, el Balance sube justo valor + dañado + CLAURE: las diferencias son esas y no otras",
  pasa(`${DANADAS(2)}
${ENTRADA_CLAURE(2)}
select ${DELTA_BAL("lim")} = ${DELTA("lim", "valor")} + ${DELTA("lim", "valor_danadas")} + ${DELTA("lim", "valor_claure")}
   and ${DELTA("lim", "valor_danadas")} = 52 and ${DELTA("lim", "valor_claure")} = 52;`),
);

console.log("— L · Ver cuáles —");
/** ¿La talla `v` aparece en la lista de `fn_tallas_sin_costo` de una sede, con esas unidades? */
const EN_LISTA = (sede, unidades) =>
  `exists (select 1 from jsonb_array_elements(retail.fn_tallas_sin_costo(:'${sede}')->'filas') e where e->>'variante_id' = :'v' and (e->>'unidades')::int = ${unidades})`;
caso(
  "una talla con costo no sale; con costo 0 sale con sus unidades, su modelo, su color y su talla",
  pasa(`select (retail.fn_tallas_sin_costo(:'lim')->>'total')::int as tot0 \\gset
select not ${EN_LISTA("lim", 3)} as antes \\gset
update retail.variantes set costo = 0 where id = :'v';
select :'antes' = 't' and ${EN_LISTA("lim", 3)}
   and (select e->>'nombre' is not null and e->>'talla' is not null and e->>'color' is not null
          from jsonb_array_elements(retail.fn_tallas_sin_costo(:'lim')->'filas') e where e->>'variante_id' = :'v')
   and (retail.fn_tallas_sin_costo(:'lim')->>'total')::int = :tot0 + 1;`),
);
caso(
  "lo dañado y lo de CLAURE no cuentan como unidades de la talla sin costo (mismas reglas que la suma)",
  pasa(`update retail.variantes set costo = 0 where id = :'v';
${DANADAS(2)}
${ENTRADA_CLAURE(2)}
select ${EN_LISTA("lim", 3)};`),
);
caso(
  "el total de la lista es el mismo número de tallas que cuenta la suma como «sin costo»",
  pasa(`update retail.variantes set costo = 0 where id = :'v';
select (retail.fn_tallas_sin_costo(:'lim')->>'total')::int = (select prendas_sin_costo from retail.fn_valor_inventario_existencias() where ubicacion_id = :'lim');`),
);
caso(
  "una talla inactiva o de un producto de prueba no sale",
  pasa(`update retail.variantes set costo = 0 where id = :'v';
update retail.productos set es_prueba = true where id = :'p';
select not ${EN_LISTA("lim", 3)};`),
);
caso(
  "sin el dinero de Compras devuelve NULL, no una lista vacía",
  pasa(`update retail.variantes set costo = 0 where id in (:'v', :'vt');
${COMO_MICAELA("existencias")}
select retail.fn_tallas_sin_costo(:'tru') is null;`),
);
caso(
  "con Facturas de compra recibe la lista de SU sede y NULL para otra",
  pasa(`update retail.variantes set costo = 0 where id in (:'v', :'vt');
${COMO_MICAELA("facturas_compra")}
select retail.fn_tallas_sin_costo(:'tru') is not null and retail.fn_tallas_sin_costo(:'lim') is null;`),
);

console.log("— I · La migración —");
caso(
  "se puede pegar dos veces",
  pasa(`select ${DELTA("lim", "valor")} = 78;`, { dosVeces: true }),
);

console.log(`\n${total - fallas}/${total} casos pasan`);
process.exit(fallas ? 1 : 0);
