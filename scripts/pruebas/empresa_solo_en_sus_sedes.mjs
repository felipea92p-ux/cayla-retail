#!/usr/bin/env node
/**
 * Prueba de ADR-0505: una prenda solo se mueve en las sedes donde opera su empresa (CLAURE, solo en Lima) — migración
 * `20261024232000_empresa_solo_mueve_stock_en_sus_sedes.sql`, contra el Postgres local.
 *
 * La escena: Lima con CAYLA y CLAURE, Trujillo y el Taller solo con CAYLA (`empresa_sedes`, como en producción), y una blusa de
 * CLAURE creada desde Lima por el camino real (`crear_producto_con_empresa`) con 3 prendas de stock inicial. Cada caso corre en su
 * transacción que TERMINA EN ROLLBACK, con la migración aplicada dentro: el Postgres local compartido no cambia.
 *
 * QUÉ CUBRE
 *   · CONTROL: sin el candado, una entrada de la blusa de CLAURE en Trujillo SÍ pasa (el hueco existía; la prueba lo demuestra).
 *   · Con el candado (`movimientos`): la entrada, el traslado Lima → Trujillo, la venta (salida) en Trujillo y el ajuste en el Taller
 *     se rechazan con el mensaje que dice dónde sí y el hint `empresa_fuera_de_sede`; en Lima, todo sigue funcionando.
 *   · Lo que NO debe romper: crear una prenda de CLAURE en Lima con su stock inicial; una prenda de CAYLA se mueve igual en las tres sedes.
 *   · La otra mitad (`productos`, diferido al cierre): crear una de CLAURE desde Lima con el stock en Trujillo se rechaza; pasar a CLAURE
 *     una prenda con stock en Trujillo se rechaza; una con stock solo en Lima, sí.
 *   · La sonda: con stock de CLAURE fuera de Lima, la migración no se aplica y dice qué prenda y dónde.
 *   · La migración se puede pegar dos veces y sus funciones no las ejecuta nadie por la API.
 *
 * USO: pnpm pruebas:empresa-solo-en-sus-sedes   (necesita el stack local: `npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = readFileSync(join(RAIZ, "supabase/migrations/20261024232000_empresa_solo_mueve_stock_en_sus_sedes.sql"), "utf8");
const DESHACER = `drop trigger if exists movimientos_solo_en_sedes_de_su_empresa on retail.movimientos;
drop trigger if exists productos_empresa_respeta_su_stock on retail.productos;`;
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

/** Una prenda nueva por el camino real; `ubic` es donde cae el stock inicial (la sede que se valida es Lima). */
const CREAR = (ref, empresa, ubic) =>
  `retail.crear_producto_con_empresa('${ref}', :'cat',
     jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', 26, 'cantidad', 3)),
     :'${empresa}', :'lim', null, gen_random_uuid(), null, null, false, null, :'marca', :'prov', :'${ubic}', false)`;

/**
 * Las sedes, las dos empresas, una categoría con talla, un color, una marca con su proveedor y una prenda de CAYLA con 3 de stock en
 * Trujillo (`emma`, `v_emma`), creada aquí: la base limpia del CI no trae stock del seed en Trujillo. Deja la escena sin la blusa de CLAURE.
 */
const SEDES = `
set local request.jwt.claim.sub = '${FELIPE}';
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select id as cayla from retail.empresas where clave = 'cayla' \\gset
select id as claure from retail.empresas where clave = 'claure' \\gset
insert into retail.empresa_sedes (empresa_id, ubicacion_id)
  values (:'cayla', :'lim'), (:'cayla', :'tru'), (:'cayla', :'taller'), (:'claure', :'lim') on conflict do nothing;
-- El alta con stock inicial exige la carga inicial abierta en la sede (en la base local, Trujillo ya la cerró).
update retail.ubicaciones set carga_inicial_hasta = null where id in (:'lim', :'tru');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'lim', :'tru']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda');
select id as piso_lim from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select id as piso_tru from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select coalesce((select id from retail.sububicaciones where ubicacion_id = :'taller' order by nombre limit 1), :'piso_tru') as sub_taller \\gset
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and exists (select 1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id)
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset
select ${CREAR("Blusa Prueba Trujillo", "cayla", "tru")} as emma \\gset
select id as v_emma from retail.variantes where producto_id = :'emma' limit 1 \\gset
`;

const BLUSA = `
select ${CREAR("Blusa Prueba Claurè", "claure", "lim")} as blusa \\gset
select id as v from retail.variantes where producto_id = :'blusa' limit 1 \\gset
`;

/** Transacción con ROLLBACK: migración (o su reversa) → sedes → blusa → cuerpo. */
const dentro = (cuerpo, { conCandado = true, conBlusa = true } = {}) =>
  psql(`begin;\n${MIGRACION}\n${conCandado ? "" : DESHACER}\n${SEDES}\n${conBlusa ? BLUSA : ""}\n${cuerpo}\nrollback;`);

/** Un movimiento directo de `variante` (lo que escriben todas las funciones) y su efecto en el stock. */
const MOVER = (variante, tipo, ubic, sub, cantidad, destino = null) => `
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo)
  values (:'${variante}', :'${ubic}', :'${sub}', ${destino ? `:'${destino[0]}'` : "null"}, ${destino ? `:'${destino[1]}'` : "null"}, '${tipo}', ${cantidad}, 'otro')
  returning id as m \\gset
select retail.fn_aplicar_movimiento(:'m') as _ap \\gset
select true;`;

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
const pasa = (sql, opciones) => () => {
  const salida = dentro(sql, opciones);
  if (!salida.split("\n").includes("t")) return `salida inesperada: ${salida}`;
};
/** Debe rechazarse con ese texto Y el hint de la regla; cualquier otro error (o que pase) es una falla. */
const rechaza = (sql, texto, opciones) => () => {
  try {
    return `pasó y debía rechazarse: ${dentro(sql, opciones)}`;
  } catch (e) {
    const err = String(e.stderr);
    if (!texto.test(err) || !/empresa_fuera_de_sede/.test(err)) throw e;
  }
};

const FUERA_TRU = /Blusa Prueba Claurè es de CLAURE, y CLAURE no está en Tienda Trujillo: esta prenda solo se vende, se recibe y se traslada en Tienda Lima\./;

console.log("— El candado de movimientos —");
caso(
  "CONTROL: sin el candado, una entrada de la blusa de CLAURE en Trujillo SÍ pasa (el hueco existía)",
  pasa(MOVER("v", "entrada", "tru", "piso_tru", 2), { conCandado: false }),
);
caso("crear una prenda de CLAURE en Lima con su stock inicial sigue funcionando, y su stock queda en Lima", pasa(`set constraints all immediate;
select (select empresa_id from retail.productos where id = :'blusa') = :'claure'
   and (select sum(cantidad) from retail.stock where variante_id = :'v' and ubicacion_id = :'lim') = 3;`));
caso("una entrada de la blusa de CLAURE en Lima pasa", pasa(MOVER("v", "entrada", "lim", "piso_lim", 2)));
caso("una entrada de la blusa de CLAURE en Trujillo se rechaza y dice dónde sí", rechaza(MOVER("v", "entrada", "tru", "piso_tru", 2), FUERA_TRU));
caso(
  "un traslado de la blusa de CLAURE de Lima a Trujillo se rechaza",
  rechaza(MOVER("v", "traslado", "lim", "piso_lim", 1, ["tru", "piso_tru"]), FUERA_TRU),
);
caso("una venta (salida) de la blusa de CLAURE en Trujillo se rechaza", rechaza(MOVER("v", "salida", "tru", "piso_tru", 1), FUERA_TRU));
caso(
  "un ajuste de la blusa de CLAURE en el Taller se rechaza",
  rechaza(MOVER("v", "ajuste", "taller", "sub_taller", 1), /no está en Taller: esta prenda solo se vende, se recibe y se traslada en Tienda Lima\./),
);
caso(
  "una venta (salida) de la blusa de CLAURE en Lima pasa",
  pasa(`${MOVER("v", "entrada", "lim", "piso_lim", 2)}${MOVER("v", "salida", "lim", "piso_lim", 1)}`),
);
caso(
  "una prenda de CAYLA se mueve igual en Trujillo, Lima y el Taller",
  pasa(`${MOVER("v_emma", "entrada", "tru", "piso_tru", 1)}${MOVER("v_emma", "traslado", "tru", "piso_tru", 1, ["lim", "piso_lim"])}${MOVER("v_emma", "ajuste", "taller", "sub_taller", 1)}`),
);

console.log("\n— La otra mitad: la empresa de una prenda con stock —");
caso(
  "crear una prenda de CLAURE desde Lima con el stock inicial en Trujillo se rechaza al cerrar",
  rechaza(
    `select ${CREAR("Blusa Prueba Torcida", "claure", "tru")} as torcida \\gset\nset constraints all immediate;\nselect true;`,
    /Blusa Prueba Torcida no puede ser de CLAURE: tiene prendas en Tienda Trujillo, donde CLAURE no está\./,
    { conBlusa: false },
  ),
);
caso(
  "pasar a CLAURE una prenda de CAYLA con stock en Trujillo se rechaza al cerrar",
  rechaza(`update retail.productos set empresa_id = :'claure' where id = :'emma';\nset constraints all immediate;\nselect true;`, /Blusa Prueba Trujillo no puede ser de CLAURE: tiene prendas en Tienda Trujillo, donde CLAURE no está\./, {
    conBlusa: false,
  }),
);
caso(
  "pasar a CLAURE una prenda de CAYLA con stock solo en Lima pasa",
  pasa(
    `select ${CREAR("Blusa Prueba Solo Lima", "cayla", "lim")} as solo_lima \\gset
update retail.productos set empresa_id = :'claure' where id = :'solo_lima';
set constraints all immediate;
select (select empresa_id from retail.productos where id = :'solo_lima') = :'claure';`,
    { conBlusa: false },
  ),
);

console.log("\n— La migración —");
caso("la sonda: con stock de CLAURE fuera de Lima, la migración no se aplica y dice qué prenda y dónde", () => {
  try {
    const salida = psql(`begin;\n${MIGRACION}\n${DESHACER}\n${SEDES}
update retail.productos set empresa_id = :'claure' where id = :'emma';
${MIGRACION}
rollback;`);
    return `pasó y debía rechazarse: ${salida}`;
  } catch (e) {
    if (!/No se aplicó nada: ya hay prendas con stock en una sede donde su empresa no opera: .*Blusa Prueba Trujillo \(CLAURE\) en Tienda Trujillo/.test(String(e.stderr))) throw e;
  }
});
caso("la migración se puede pegar dos veces (un disparador de cada uno)", () => {
  const n = psql(`begin;\n${MIGRACION}\n${MIGRACION}
select count(*) filter (where tgname = 'movimientos_solo_en_sedes_de_su_empresa') || '|' || count(*) filter (where tgname = 'productos_empresa_respeta_su_stock')
  from pg_trigger where not tgisinternal;
rollback;`);
  if (!n.split("\n").includes("1|1")) return `disparadores: ${n}`;
});
caso("sus funciones no las ejecuta nadie por la API (ni anon ni authenticated)", () => {
  const salida = psql(`begin;\n${MIGRACION}
select not has_function_privilege('anon', 'retail.fn_movimiento_respeta_empresa_de_sede()', 'execute')
   and not has_function_privilege('authenticated', 'retail.fn_movimiento_respeta_empresa_de_sede()', 'execute')
   and not has_function_privilege('anon', 'retail.fn_producto_empresa_respeta_su_stock()', 'execute')
   and not has_function_privilege('authenticated', 'retail.fn_producto_empresa_respeta_su_stock()', 'execute');
rollback;`);
  if (!salida.split("\n").includes("t")) return `salida inesperada: ${salida}`;
});

console.log(fallas ? `\n${fallas} de ${total} en rojo.` : `\n${total}/${total} pruebas en verde.`);
process.exit(fallas ? 1 : 0);
