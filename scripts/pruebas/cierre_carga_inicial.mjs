#!/usr/bin/env node
/**
 * Prueba de ADR-0328 (actividad 4) «La carga inicial se cierra por sede, y lo que aparece entra por "Encontré prendas"»
 * contra el Postgres LOCAL: migraciones 20261004210000 (la fecha de la sede y su guardián), 20261004210100 (el candado,
 * la lectura y `fijar_cierre_carga_inicial`) y 20261004210200 («Encontré prendas» con nota).
 *
 * QUÉ CUBRE
 *   1. Las TRES puertas de carga inicial (Nuevo producto, `cargar_stock_inicial`, Ajustar con prendas nuevas) cargan con la
 *      sede sin fecha y el último día (hoy = la fecha), y se cierran desde el día siguiente con la frase y el hint
 *      `carga_inicial_cerrada`, sin dejar nada a medias (ni el producto del alta). Por sede: TRU cerrada no cierra Lima.
 *   2. La cuarta puerta escondida: `registrar_movimiento` no escribe el motivo `carga_inicial`; y ninguna función fuera de
 *      `fn_cargar_stock_inicial` lo escribe como texto fijo (recorre `pg_proc`). Lo mismo con `reposicion`: solo
 *      `registrar_movimiento` lo escribe, con sus reglas.
 *   3. «Encontré prendas» (código interno `reposicion`): es un AJUSTE (ni entrada ni salida suelta), pide nota de 3 letras o
 *      más, solo suma, y con la carga cerrada es la entrada de una prenda que nunca estuvo en la sede; con otro motivo, o
 *      como ENTRADA suelta, se rechaza; con la carga abierta todo sigue como ADR-0235 (`ajuste_sin_historia`). Actividad dice
 *      «encontré prendas».
 *   4. `fijar_cierre_carga_inicial`: el líder aprieta (pone fecha, adelanta); aflojar (reabrir, quitar, correr más
 *      adelante) es del Admin; nunca una fecha pasada; la misma fecha no escribe; deja historia y una línea en Actividad.
 *      Y dos sesiones a la vez se ponen en fila: la función toma la fila de la sede ANTES de leer la fecha (carrera de dos
 *      `psql`, ninguna confirma nada).
 *   5. El guardián: la fecha no se cambia escribiendo la fila desde la API, aunque la política deje al líder escribirla.
 *   6. La lectura `fn_carga_inicial_sedes` y los permisos; la frase exacta («15-oct»); y que las tres migraciones se pegan
 *      dos veces sin duplicar nada.
 *
 * EL RELOJ. Todo se mide contra `retail.fn_hoy_lima()` de la base: «cerrada» es una fecha de AYER, «último día» es HOY.
 * Así la prueba da lo mismo cualquier día del año (sin bomba de calendario). La frontera de Lima contra UTC (de 7 pm a
 * medianoche de Lima ya es mañana en UTC) la cubre `fn_hoy_lima()`; se verificó aparte con el reloj falso (PR).
 *
 * CÓMO. Como `ajuste_no_es_primera_carga.mjs`: cada caso en su transacción con ROLLBACK (no deja nada en el Postgres
 * compartido), sesión simulada con `request.jwt.claim(s)`, y `pg_temp.intento` que devuelve el resultado o el error.
 *
 * USO
 *   pnpm pruebas:cierre-carga-inicial    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed: personas.rol = 'admin')
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo
const SANDRA = "22222222-2222-4222-8222-000000000005"; // líder; en cada caso se la deja SIN Admin

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
const MIGRACIONES = [
  "20261004210000_carga_inicial_cierre_por_sede_parte1_columna.sql",
  "20261004210100_carga_inicial_cierre_por_sede_parte2_candado.sql",
  "20261004210200_encontre_prendas_con_nota.sql",
];

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const PRELUDIO = `
begin;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_res text;
begin
  execute p_sql into v_res;
  return jsonb_build_object('ok', true, 'res', v_res);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = u and s.tipo = 'almacen_tienda');
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as sandra from public.personas where auth_user_id = '${SANDRA}' \\gset
-- Sandra queda líder SIN Admin (el Admin se lee de Dynamic, ADR-0178): es el líder que aprieta pero no afloja.
update public.personas set rol = 'integrante' where auth_user_id = '${SANDRA}';

-- La fecha de las dos tiendas arranca vacía (abierta sin fecha), aunque la base local la haya sembrado.
update retail.ubicaciones set carga_inicial_hasta = null where id in (:'tru', :'lim');

-- Tres prendas nuevas, sin ningún movimiento en ninguna tienda (un producto cada una), y una CON historia en el almacén.
-- (La base guarda la referencia con mayúscula inicial: «Zz Cierre Carga 1»; por eso se busca con ilike.)
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Cierre carga ' || n, 'activo', mp.marca_id, mp.proveedor_id
    from generate_series(1, 4) n, (select marca_id, proveedor_id from retail.marca_proveedores order by created_at limit 1) mp;
insert into retail.variantes (producto_id, sku, precio, costo, activo)
  select p.id, 'ZZ-CCI-' || right(p.referencia, 1), 100, 40, true from retail.productos p where p.referencia ilike 'ZZ Cierre carga %';
select v.id as v1 from retail.variantes v where v.sku = 'ZZ-CCI-1' \\gset
select v.id as v2 from retail.variantes v where v.sku = 'ZZ-CCI-2' \\gset
select v.id as v3 from retail.variantes v where v.sku = 'ZZ-CCI-3' \\gset
select v.id as vh from retail.variantes v where v.sku = 'ZZ-CCI-4' \\gset
with m as (
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'vh', :'tru', :'alm', 'entrada', 5, 'recepcion') returning id)
select count(retail.fn_aplicar_movimiento(m.id)::text) as _aplicado from m \\gset

-- Para el alta: una categoría que no exige tejido ni patrón, una de sus tallas, una pareja marca-proveedor y un color.
select c.id as cat from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and exists (select 1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id)
  order by c.nombre limit 1 \\gset
select t.id as t1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo
  where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select marca_id as marca, proveedor_id as prov from retail.marca_proveedores order by created_at limit 1 \\gset
select codigo as c1 from retail.colores where activo order by codigo limit 1 \\gset

select gen_random_uuid() as tok \\gset
select gen_random_uuid() as tok2 \\gset

-- Lo que ya había en el historial y en Actividad: la prueba lee SOLO lo que escribe su caso. En una base compartida alguien
-- pudo haber guardado un cierre de verdad (Actividad no se borra), y leer «el primero de la tabla» daba rojo falso.
select coalesce(max(id), 0) as hist0 from retail.configuracion_historial \\gset
select coalesce(max(id), 0) as act0 from retail.actividad \\gset

-- La sesión de Felipe (líder y Admin), como la arma PostgREST.
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;

const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
/** Cambia de persona (como `postgres`, y vuelve a la API). */
const como = (auth) => `${COMO_POSTGRES}set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
${COMO_API}`;
const K = (clave, expresion) => `select 'K|${clave}|' || coalesce((${expresion})::text, '∅');`;
/** La fecha de TRU, escrita como `postgres` (el guardián lo deja: no es la API). `expr` es SQL: «hoy - 1», «null». */
const fechaTru = (expr) => `${COMO_POSTGRES}update retail.ubicaciones set carga_inicial_hasta = ${expr} where id = :'tru';\n`;
const AYER = "retail.fn_hoy_lima() - 1";
const HOY = "retail.fn_hoy_lima()";

const items = (...pares) => `jsonb_build_array(${pares.map(([v, c]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${c})`).join(", ")})::text`;
const carga = (sede, it) => `pg_temp.intento(format('select retail.cargar_stock_inicial(%L::uuid, %L::jsonb, null, false)::text', :'${sede}', ${it}))`;
const alta = (ref, cantidad) =>
  `pg_temp.intento(format('select retail.crear_producto_con_stock_inicial(%L, %L::uuid, %L::jsonb, null, null, null, null, false, null, %L::uuid, %L::uuid, %L::uuid, false)::text',
     '${ref}', :'cat', jsonb_build_array(jsonb_build_object('talla_id', :'t1', 'color_codigo', :'c1', 'precio', 59, 'costo', 20, 'cantidad', ${cantidad}))::text,
     :'marca', :'prov', :'tru'))`;
const ajustar = ({ ajustes = "'[]'", cargas = "'[]'", motivo = "null", nota = "null", token = "tok" }) =>
  `pg_temp.intento(format('select retail.ajustar_inventario(%L::uuid, %L::uuid, %L::jsonb, %L, %L::jsonb, false, %L, %L::uuid)::text', :'tru', :'alm', ${ajustes}, ${motivo}, ${cargas}, ${nota}, :'${token}'))`;
const mov = (v, cant, motivo, nota = "null", sub = "alm", tipo = "ajuste") =>
  `pg_temp.intento(format('select retail.registrar_movimiento(%L::uuid, %L::uuid, %L, ${cant}, %L, %L, %L::uuid)::text', :'${v}', :'tru', '${tipo}', '${motivo}', ${nota}, :'${sub}'))`;
/** Un movimiento suelto SIN motivo (la API lo permite: `p_motivo` es opcional). */
const movSinMotivo = (v, cant, tipo) =>
  `pg_temp.intento(format('select retail.registrar_movimiento(%L::uuid, %L::uuid, %L, ${cant}, null, null, %L::uuid)::text', :'${v}', :'tru', '${tipo}', :'alm'))`;
const fijar = (sede, fecha) => `pg_temp.intento(format('select retail.fijar_cierre_carga_inicial(%L::uuid, %s)::text', :'${sede}', quote_nullable(${fecha})))`;
const movs = (v) => `(select count(*) from retail.movimientos where variante_id = :'${v}')`;
const stockAlm = (v) => `coalesce((select sum(cantidad) from retail.stock where variante_id = :'${v}' and ubicacion_id = :'tru' and sububicacion_id = :'alm'), 0)`;
const definicion = (firma) => `pg_get_functiondef('${firma}'::regprocedure)`;
const veces = (firma, texto) => `(select (length(d) - length(replace(d, '${texto}', ''))) / length('${texto}') from (select ${definicion(firma)} as d) z)`;
const RM = "retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)";
const CSI = "retail.fn_cargar_stock_inicial(uuid, jsonb, text)";

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
function parsear(salida) {
  const d = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("K|")) continue;
    const [, clave, ...resto] = linea.split("|");
    d[clave] = resto.join("|");
  }
  return d;
}
function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
    return;
  }
  verificar(parsear(salida));
}
const j = (texto) => JSON.parse(texto ?? "null");
const okDe = (texto) => j(texto)?.ok === true;
const hintDe = (texto) => j(texto)?.hint ?? null;
const FRASE_CERRADA = /^La carga inicial de Tienda Trujillo se cerró el \d{1,2}-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\. Lo que encuentres entra por «Encontré prendas»\.$/;

// ---------------------------------------------------------------------------------------------------------------------
// 1. Las tres puertas
// ---------------------------------------------------------------------------------------------------------------------
correr(
  "1a. Sin fecha (abierta): las tres puertas cargan",
  `${COMO_API}${K("carga", carga("tru", items(["v1", 2])))}
${K("alta", alta("ZZ Alta abierta", 3))}
${K("ajuste", ajustar({ cargas: items(["v2", 1]) }))}
${COMO_POSTGRES}${K("libro", "(select count(*) from retail.movimientos where motivo = 'carga_inicial' and ubicacion_id = :'tru' and (variante_id in (:'v1', :'v2') or variante_id in (select v.id from retail.variantes v join retail.productos p on p.id = v.producto_id where p.referencia ilike 'ZZ Alta abierta')))")}`,
  (d) => {
    afirmar("cargar_stock_inicial carga", okDe(d.carga), d.carga);
    afirmar("Nuevo producto con su stock carga", okDe(d.alta), d.alta);
    afirmar("Ajustar con una prenda nueva carga", okDe(d.ajuste), d.ajuste);
    afirmar("las tres dejaron su entrada «carga_inicial»", d.libro === "3", `entradas=${d.libro}`);
  },
);

correr(
  "1b. Hoy es el último día (la fecha = hoy): sigue abierta",
  `${fechaTru(HOY)}${COMO_API}${K("carga", carga("tru", items(["v1", 2])))}
${K("alta", alta("ZZ Alta ultimo dia", 1))}
${K("ajuste", ajustar({ cargas: items(["v2", 1]) }))}
${K("lectura", "(select e ->> 'abierta' from jsonb_array_elements(retail.fn_carga_inicial_sedes() -> 'sedes') e where e ->> 'ubicacion_id' = :'tru')")}`,
  (d) => {
    afirmar("las tres puertas cargan el último día", okDe(d.carga) && okDe(d.alta) && okDe(d.ajuste), `${d.carga} ${d.alta} ${d.ajuste}`);
    afirmar("la lectura la da por abierta", d.lectura === "true", d.lectura);
  },
);

correr(
  "1c. Pasada la fecha (ayer): las tres puertas se cierran con la salida dicha y sin dejar nada",
  `${fechaTru(AYER)}${COMO_API}${K("carga", carga("tru", items(["v1", 2])))}
${K("alta", alta("ZZ Alta cerrada", 3))}
${K("ajuste", ajustar({ cargas: items(["v2", 1]) }))}
${COMO_POSTGRES}${K("v1", movs("v1"))}
${K("v2", movs("v2"))}
${K("producto", "(select count(*) from retail.productos where referencia ilike 'ZZ Alta cerrada')")}
${K("lectura", "(select e ->> 'abierta' from jsonb_array_elements(retail.fn_carga_inicial_sedes() -> 'sedes') e where e ->> 'ubicacion_id' = :'tru')")}
${K("orden", `(select position('fn_exigir_carga_inicial_abierta' in d) > position('fn_puede_operar_ubicacion' in d) and position('fn_exigir_carga_inicial_abierta' in d) < position('fn_actor_persona_id(true)' in d) and position('fn_exigir_carga_inicial_abierta' in d) < position('fn_bloquear_en_orden' in d) from (select ${definicion(CSI)} as d) z)`)}`,
  (d) => {
    for (const [nombre, clave] of [["cargar_stock_inicial", "carga"], ["Nuevo producto con su stock", "alta"], ["Ajustar con una prenda nueva", "ajuste"]]) {
      const r = j(d[clave]);
      afirmar(`${nombre}: se rechaza con \`carga_inicial_cerrada\``, r?.ok === false && r.hint === "carga_inicial_cerrada", d[clave]);
      afirmar(`${nombre}: la frase dice la fecha y la salida`, FRASE_CERRADA.test(r?.msg ?? ""), r?.msg);
    }
    afirmar("ningún movimiento de las prendas", d.v1 === "0" && d.v2 === "0", `v1=${d.v1} v2=${d.v2}`);
    afirmar("todo o nada: el producto del alta tampoco se creó", d.producto === "0", `productos=${d.producto}`);
    afirmar("la lectura la da por cerrada", d.lectura === "false", d.lectura);
    afirmar("el candado va después de «puedes operar la tienda» y antes del responsable y de los candados de stock", d.orden === "true", d.orden);
  },
);

correr(
  "1d. Por sede: TRU cerrada no cierra Lima",
  `${fechaTru(AYER)}${COMO_API}${K("lima", carga("lim", items(["v1", 2])))}
${K("tru", carga("tru", items(["v2", 2])))}`,
  (d) => {
    afirmar("Lima (sin fecha) sigue cargando", okDe(d.lima), d.lima);
    afirmar("TRU (cerrada) no", hintDe(d.tru) === "carga_inicial_cerrada", d.tru);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// 2. Una sola puerta
// ---------------------------------------------------------------------------------------------------------------------
// Las funciones que insertan en `movimientos` y nombran un motivo como texto fijo. `registrar_movimiento` inserta el motivo
// que recibe (`p_motivo`) y nombra los dos solo para ponerles sus reglas.
const escritorasDe = (motivo) => `(select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.prosrc ~* 'insert\\s+into\\s+(retail\\.)?movimientos' and p.prosrc like '%''${motivo}''%')`;

correr(
  "2. El motivo «carga_inicial» lo escribe UNA función (ni registrar_movimiento ni otra), y «reposicion» solo registrar_movimiento",
  `${COMO_API}${K("entrada", mov("vh", 3, "carga_inicial", "null", "alm", "entrada"))}
${K("ajuste", mov("vh", 3, "carga_inicial"))}
${K("mayus", mov("vh", 3, " Carga_Inicial "))}
${COMO_POSTGRES}${K("vh", movs("vh"))}
${K("escritoras", escritorasDe("carga_inicial"))}
${K("escritoras_encontre", escritorasDe("reposicion"))}`,
  (d) => {
    afirmar("registrar_movimiento rechaza una ENTRADA «carga_inicial» (`carga_inicial_por_su_puerta`)", hintDe(d.entrada) === "carga_inicial_por_su_puerta", d.entrada);
    afirmar("y un AJUSTE «carga_inicial»", hintDe(d.ajuste) === "carga_inicial_por_su_puerta", d.ajuste);
    afirmar("escrito de otra forma, igual", hintDe(d.mayus) === "carga_inicial_por_su_puerta", d.mayus);
    afirmar("no se escribió nada (la prenda sigue con su único movimiento)", d.vh === "1", `movimientos=${d.vh}`);
    // registrar_movimiento nombra el motivo solo para RECHAZARLO (los tres casos de arriba lo prueban). Cualquier otra función que
    // aparezca aquí es una puerta nueva de carga inicial sin el candado por sede.
    afirmar(
      "solo fn_cargar_stock_inicial escribe «carga_inicial» en movimientos (registrar_movimiento lo nombra para rechazarlo)",
      d.escritoras === "fn_cargar_stock_inicial,registrar_movimiento",
      d.escritoras,
    );
    // «Encontré prendas» es la única entrada sin papeles después del cierre: si otra función la escribe directo, se salta la nota
    // y el «solo suma». Una función que la necesite llama a registrar_movimiento (como bajar_en_mano, ADR-0328 act. 9).
    afirmar("solo registrar_movimiento escribe «reposicion» («Encontré prendas») en movimientos", d.escritoras_encontre === "registrar_movimiento", d.escritoras_encontre);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// 3. «Encontré prendas»
// ---------------------------------------------------------------------------------------------------------------------
correr(
  "3a. «Encontré prendas» es un ajuste: pide dónde o por qué (3 letras o más) y solo suma",
  `${COMO_API}${K("sin_nota", mov("vh", 2, "reposicion"))}
${K("nota_corta", mov("vh", 2, "reposicion", "'  ab '"))}
${K("resta", mov("vh", -1, "reposicion", "'se dañó'"))}
${K("entrada_sin_nota", mov("vh", 5, "reposicion", "null", "alm", "entrada"))}
${K("entrada_con_nota", mov("vh", 5, "Reposición", "'en una caja'", "alm", "entrada"))}
${K("salida", mov("vh", 1, "reposicion", "'en una caja'", "alm", "salida"))}
${K("con_nota", mov("vh", 2, "reposicion", "'en una caja del almacén'"))}
${COMO_POSTGRES}${K("alm", stockAlm("vh"))}
${K("libro", "(select concat_ws(':', tipo, cantidad, motivo, nota) from retail.movimientos where variante_id = :'vh' and motivo = 'reposicion')")}
-- Actividad anota los movimientos al confirmar (disparador diferido): se adelanta aquí para leerla antes del ROLLBACK.
set constraints all immediate;
${K("actividad", "(select descripcion from retail.actividad where tabla = 'movimientos' and registro_id = (select id::text from retail.movimientos where variante_id = :'vh' and motivo = 'reposicion'))")}`,
  (d) => {
    afirmar("sin nota se rechaza (`encontre_prendas_sin_nota`)", hintDe(d.sin_nota) === "encontre_prendas_sin_nota", d.sin_nota);
    afirmar("una nota de 2 letras tampoco", hintDe(d.nota_corta) === "encontre_prendas_sin_nota", d.nota_corta);
    afirmar("restar se rechaza (`encontre_prendas_resta`)", hintDe(d.resta) === "encontre_prendas_resta", d.resta);
    // Revisión adversarial: por `p_tipo = 'entrada'` «Encontré prendas» entraba sin nota (las reglas solo miraban 'ajuste').
    afirmar("como ENTRADA suelta sin nota no entra (`encontre_prendas_es_ajuste`)", hintDe(d.entrada_sin_nota) === "encontre_prendas_es_ajuste", d.entrada_sin_nota);
    afirmar("ni con nota y escrito de otra forma («Reposición»)", hintDe(d.entrada_con_nota) === "encontre_prendas_es_ajuste", d.entrada_con_nota);
    afirmar("ni como SALIDA suelta", hintDe(d.salida) === "encontre_prendas_es_ajuste", d.salida);
    afirmar("con nota entra", okDe(d.con_nota), d.con_nota);
    afirmar("el almacén pasó de 5 a 7", d.alm === "7", `alm=${d.alm}`);
    afirmar("queda como ajuste +2 con el código de siempre y la nota", d.libro === "ajuste:2:reposicion:en una caja del almacén", d.libro);
    afirmar("Actividad dice «motivo: encontré prendas»", /motivo: encontré prendas · en una caja del almacén/.test(d.actividad ?? ""), d.actividad);
  },
);

correr(
  "3b. «Encontré prendas» en el piso sigue cerrado, con el nombre nuevo",
  `${COMO_API}${K("piso", mov("vh", 1, "reposicion", "'en el probador'", "piso"))}`,
  (d) => {
    const r = j(d.piso);
    afirmar("se rechaza con `reposicion_piso_cerrada` (el candado de ADR-0208 va primero)", r?.hint === "reposicion_piso_cerrada", d.piso);
    afirmar("y el mensaje habla de «Encontré prendas», no de «Reposición»", /^«Encontré prendas» se registra en el almacén/.test(r?.msg ?? ""), r?.msg);
  },
);

correr(
  "3c. Carga CERRADA: la prenda que nunca estuvo en la sede entra con «Encontré prendas», y con otro motivo no",
  `${fechaTru(AYER)}${COMO_API}${K("conteo", mov("v3", 2, "conteo_fisico"))}
${K("otro", mov("v3", 2, "otro", "'apareció'"))}
${K("entrada_otro", mov("v3", 7, "otro", "null", "alm", "entrada"))}
${K("entrada_sin_motivo", movSinMotivo("v3", 3, "entrada"))}
${K("encontre", mov("v3", 2, "reposicion", "'en una bolsa sin etiqueta'"))}
${COMO_POSTGRES}${K("alm", stockAlm("v3"))}
${K("libro", "(select string_agg(concat_ws(':', tipo, cantidad, motivo), ',') from retail.movimientos where variante_id = :'v3')")}`,
  (d) => {
    const c = j(d.conteo);
    afirmar("«Conteo físico» se rechaza con `carga_inicial_cerrada`", c?.hint === "carga_inicial_cerrada", d.conteo);
    afirmar(
      "y la frase dice que nunca estuvo en la tienda y cuál es la salida",
      /^Esta prenda nunca estuvo en Tienda Trujillo y su carga inicial se cerró el \d{1,2}-[a-z]{3}: si la encontraste, regístrala con «Encontré prendas» y cuenta dónde estaba\.$/.test(c?.msg ?? ""),
      c?.msg,
    );
    afirmar("«Otro» también se rechaza", hintDe(d.otro) === "carga_inicial_cerrada", d.otro);
    // Revisión adversarial: una ENTRADA suelta metía la prenda nueva sin papeles después del cierre.
    afirmar("una ENTRADA suelta («Otro») tampoco la mete", hintDe(d.entrada_otro) === "carga_inicial_cerrada", d.entrada_otro);
    afirmar("ni una ENTRADA suelta sin motivo", hintDe(d.entrada_sin_motivo) === "carga_inicial_cerrada", d.entrada_sin_motivo);
    afirmar("«Encontré prendas» con nota entra al almacén", okDe(d.encontre) && d.alm === "2", `${d.encontre} alm=${d.alm}`);
    afirmar("queda un solo movimiento: ajuste +2 «reposicion» (no una carga inicial)", d.libro === "ajuste:2:reposicion", d.libro);
  },
);

correr(
  "3d. Carga ABIERTA: sigue ADR-0235 (la primera carga es stock inicial, no un ajuste)",
  `${COMO_API}${K("encontre", mov("v3", 2, "reposicion", "'en una bolsa'"))}
${K("conteo", mov("v3", 2, "conteo_fisico"))}`,
  (d) => {
    afirmar("«Encontré prendas» sobre una prenda sin historia se rechaza con `ajuste_sin_historia`", hintDe(d.encontre) === "ajuste_sin_historia", d.encontre);
    afirmar("«Conteo físico» igual", hintDe(d.conteo) === "ajuste_sin_historia", d.conteo);
  },
);

correr(
  "3e. Ajustar de una vez (ajustar_inventario) pasa por las mismas reglas",
  `${COMO_API}${K("sin_nota", ajustar({ ajustes: items(["vh", 1]), motivo: "'reposicion'" }))}
${K("con_nota", ajustar({ ajustes: items(["vh", 1]), motivo: "'reposicion'", nota: "'detrás del mostrador'" }))}
${fechaTru(AYER)}${COMO_API}${K("cerrada_carga", ajustar({ cargas: items(["v3", 1]), token: "tok2" }))}
${K("cerrada_encontre", ajustar({ ajustes: items(["v3", 1]), motivo: "'reposicion'", nota: "'en una caja'", token: "tok2" }))}
${COMO_POSTGRES}${K("v3", stockAlm("v3"))}`,
  (d) => {
    afirmar("sin nota, todo el ajuste se rechaza", hintDe(d.sin_nota) === "encontre_prendas_sin_nota", d.sin_nota);
    afirmar("con nota, entra", okDe(d.con_nota), d.con_nota);
    afirmar("cerrada: la prenda nueva ya no entra como carga", hintDe(d.cerrada_carga) === "carga_inicial_cerrada", d.cerrada_carga);
    afirmar("cerrada: entra como «Encontré prendas» (la misma marca sirve: el intento rechazado no se guardó)", okDe(d.cerrada_encontre) && d.v3 === "1", `${d.cerrada_encontre} v3=${d.v3}`);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// 4. Quién mueve la fecha
// ---------------------------------------------------------------------------------------------------------------------
// Solo lo que escribió el caso (`id > :hist0`, `id > :act0`; ver el PRELUDIO).
const historial = "(select count(*) from retail.configuracion_historial where que = 'cierre_carga_inicial' and detalle ->> 'ubicacion_id' = :'tru' and id > :hist0)";
const fechaActual = "(select carga_inicial_hasta from retail.ubicaciones where id = :'tru')";

correr(
  "4a. El líder (sin Admin) aprieta: pone fecha y la adelanta; queda historia y una línea en Actividad",
  `${como(SANDRA)}${K("es_lider", "retail.fn_es_lider() and not retail.fn_es_admin()")}
${K("poner", fijar("tru", `${HOY} + 10`))}
${K("despues_poner", `${fechaActual} = ${HOY} + 10`)}
${K("adelantar", fijar("tru", `${HOY} + 5`))}
${K("misma", fijar("tru", `${HOY} + 5`))}
${COMO_POSTGRES}${K("fecha", `${fechaActual} = ${HOY} + 5`)}
${K("historial", historial)}
${K("firma", "(select string_agg((hecho_por = :'sandra')::text, ',' order by id) from retail.configuracion_historial where que = 'cierre_carga_inicial' and id > :hist0)")}
${K("antes_despues", `(select (detalle ->> 'antes') is null and (detalle ->> 'despues')::date = ${HOY} + 10 from retail.configuracion_historial where que = 'cierre_carga_inicial' and id > :hist0 order by id limit 1)`)}
${K("actividad", "(select descripcion from retail.actividad where modulo = 'configuracion' and accion = 'config_cierre_carga_inicial' and id > :act0 order by id limit 1)")}`,
  (d) => {
    afirmar("Sandra es líder y no Admin", d.es_lider === "true", d.es_lider);
    afirmar("pone fecha donde no había", okDe(d.poner) && d.despues_poner === "true", d.poner);
    const r = j(j(d.poner)?.res ?? "null");
    afirmar("devuelve la fecha y que sigue abierta", r?.abierta === true && typeof r?.hasta === "string", JSON.stringify(r));
    afirmar("la adelanta", okDe(d.adelantar), d.adelantar);
    afirmar("la misma fecha no escribe nada", okDe(d.misma) && d.historial === "2", `historial=${d.historial}`);
    afirmar("la fecha quedó en hoy + 5", d.fecha === "true", d.fecha);
    afirmar("cada cambio firmado por Sandra", d.firma === "true,true", d.firma);
    afirmar("el primero anota «sin fecha → hoy + 10»", d.antes_despues === "true", d.antes_despues);
    afirmar("Actividad: «fijó el cierre de la carga inicial de Tienda Trujillo: sin fecha → dd/mm/aaaa»", /^fijó el cierre de la carga inicial de Tienda Trujillo: sin fecha → \d{2}\/\d{2}\/\d{4}$/.test(d.actividad ?? ""), d.actividad);
  },
);

correr(
  "4b. El líder no afloja: ni corre la fecha, ni la quita, ni reabre; y nadie pone una fecha pasada",
  `${fechaTru(`${HOY} + 5`)}${como(SANDRA)}${K("correr", fijar("tru", `${HOY} + 20`))}
${K("quitar", fijar("tru", "null"))}
${K("pasada", fijar("tru", `${HOY} - 1`))}
${fechaTru(AYER)}${como(SANDRA)}${K("reabrir", fijar("tru", `${HOY} + 3`))}
${K("reabrir_sin", fijar("tru", "null"))}
${como(FELIPE)}${K("admin_pasada", fijar("tru", `${HOY} - 2`))}
${COMO_POSTGRES}${K("fecha", `${fechaActual} = ${AYER}`)}
${K("historial", historial)}`,
  (d) => {
    afirmar("correr el cierre más adelante: solo Admin", hintDe(d.correr) === "carga_inicial_solo_admin", d.correr);
    afirmar("quitar la fecha: solo Admin", hintDe(d.quitar) === "carga_inicial_solo_admin", d.quitar);
    afirmar("una fecha pasada: nunca (`carga_inicial_fecha_pasada`)", hintDe(d.pasada) === "carga_inicial_fecha_pasada", d.pasada);
    afirmar("reabrir una sede cerrada con fecha nueva: solo Admin", hintDe(d.reabrir) === "carga_inicial_solo_admin", d.reabrir);
    afirmar("reabrirla sin fecha: solo Admin", hintDe(d.reabrir_sin) === "carga_inicial_solo_admin", d.reabrir_sin);
    afirmar("ni el Admin pone una fecha pasada", hintDe(d.admin_pasada) === "carga_inicial_fecha_pasada", d.admin_pasada);
    afirmar("la fecha no se movió y no quedó historia", d.fecha === "true" && d.historial === "0", `fecha=${d.fecha} historial=${d.historial}`);
  },
);

correr(
  "4c. El Admin afloja (reabre y quita); una integrante no fija nada",
  `${fechaTru(AYER)}${como(FELIPE)}${K("es_admin", "retail.fn_es_admin()")}
${K("reabrir", fijar("tru", `${HOY} + 3`))}
${K("abierta", "retail.fn_carga_inicial_sedes()")}
${K("carga", carga("tru", items(["v1", 1])))}
${K("quitar", fijar("tru", "null"))}
${como(MICAELA)}${K("integrante", fijar("tru", `${HOY} + 30`))}
${COMO_POSTGRES}${K("fecha", fechaActual)}
${K("actividad", "(select descripcion from retail.actividad where accion = 'config_cierre_carga_inicial' and id > :act0 order by id desc limit 1)")}`,
  (d) => {
    afirmar("Felipe es Admin", d.es_admin === "true", d.es_admin);
    afirmar("reabre una sede cerrada", okDe(d.reabrir), d.reabrir);
    const tru = (j(d.abierta)?.sedes ?? []).find((s) => s.nombre === "Tienda Trujillo");
    afirmar("la lectura ya la da por abierta", tru?.abierta === true, JSON.stringify(tru));
    afirmar("y la carga vuelve a entrar", okDe(d.carga), d.carga);
    afirmar("quita la fecha", okDe(d.quitar) && d.fecha === "∅", `${d.quitar} fecha=${d.fecha}`);
    afirmar("Actividad: «quitó la fecha de cierre de la carga inicial…»", /^quitó la fecha de cierre de la carga inicial de Tienda Trujillo: \d{2}\/\d{2}\/\d{4} → sin fecha$/.test(d.actividad ?? ""), d.actividad);
    afirmar("una integrante no fija la fecha (`carga_inicial_solo_lider`)", hintDe(d.integrante) === "carga_inicial_solo_lider", d.integrante);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// 5. El guardián
// ---------------------------------------------------------------------------------------------------------------------
correr(
  "5. La fecha no se cambia escribiendo la fila desde la API (aunque la política deje al líder escribir sedes)",
  `${fechaTru(AYER)}${COMO_API}${K("reabrir_a_mano", "pg_temp.intento(format('update retail.ubicaciones set carga_inicial_hasta = null where id = %L returning 1', :'tru'))")}
${K("otra_columna", "pg_temp.intento(format('update retail.ubicaciones set hora_cierre = %L where id = %L returning 1', '21:00', :'tru'))")}
${K("insertar", "pg_temp.intento($q$insert into retail.ubicaciones (nombre, tipo, carga_inicial_hasta) values ('ZZ Sede de prueba', 'tienda', current_date + 30) returning 1$q$)")}
${COMO_POSTGRES}${K("fecha", `${fechaActual} = ${AYER}`)}
${K("postgres", "pg_temp.intento(format('update retail.ubicaciones set carga_inicial_hasta = %s where id = %L returning 1', 'retail.fn_hoy_lima()', :'tru'))")}`,
  (d) => {
    const r = j(d.reabrir_a_mano);
    afirmar("el líder no la reabre a mano (42501, `carga_inicial_por_funcion`)", r?.ok === false && r.estado === "42501" && r.hint === "carga_inicial_por_funcion", d.reabrir_a_mano);
    afirmar("las otras columnas se siguen escribiendo como siempre", okDe(d.otra_columna), d.otra_columna);
    afirmar("una sede nueva no nace con fecha desde la API", hintDe(d.insertar) === "carga_inicial_por_funcion", d.insertar);
    afirmar("la fecha no se movió", d.fecha === "true", d.fecha);
    afirmar("como `postgres` (SQL Editor, migraciones) sí", okDe(d.postgres), d.postgres);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// 6. Lectura, permisos, frase y re-pegado
// ---------------------------------------------------------------------------------------------------------------------
correr(
  "6a. La lectura y los permisos",
  `${fechaTru(AYER)}${COMO_API}${K("lectura", "retail.fn_carga_inicial_sedes()")}
${K("hoy", "(retail.fn_carga_inicial_sedes() ->> 'hoy')::date = retail.fn_hoy_lima()")}
${COMO_POSTGRES}${K("anon_lee", "has_function_privilege('anon', 'retail.fn_carga_inicial_sedes()', 'EXECUTE')")}
${K("auth_lee", "has_function_privilege('authenticated', 'retail.fn_carga_inicial_sedes()', 'EXECUTE')")}
${K("anon_fija", "has_function_privilege('anon', 'retail.fijar_cierre_carga_inicial(uuid, date)', 'EXECUTE')")}
${K("auth_fija", "has_function_privilege('authenticated', 'retail.fijar_cierre_carga_inicial(uuid, date)', 'EXECUTE')")}
${K("internas", "not has_function_privilege('authenticated', 'retail.fn_carga_inicial_abierta(uuid)', 'EXECUTE') and not has_function_privilege('authenticated', 'retail.fn_exigir_carga_inicial_abierta(uuid)', 'EXECUTE') and not has_function_privilege('authenticated', 'retail.fn_texto_carga_inicial_cerrada(uuid, text)', 'EXECUTE')")}
${K("busca", "(select p.prosecdef from pg_proc p where p.oid = 'retail.fn_ubicaciones_cierre_carga_por_funcion()'::regprocedure)")}`,
  (d) => {
    const l = j(d.lectura);
    const tru = (l?.sedes ?? []).find((s) => s.nombre === "Tienda Trujillo");
    const lim = (l?.sedes ?? []).find((s) => s.nombre === "Tienda Lima");
    afirmar("trae cada sede con su fecha y si está abierta", tru?.abierta === false && typeof tru?.hasta === "string" && lim?.abierta === true && lim?.hasta === null, JSON.stringify(l));
    afirmar("las tiendas van primero", l?.sedes?.[0]?.tipo === "tienda", JSON.stringify(l?.sedes?.map((s) => s.tipo)));
    afirmar("el «hoy» es el de la base", d.hoy === "true", d.hoy);
    afirmar("anon no lee ni fija; authenticated sí", d.anon_lee === "false" && d.auth_lee === "true" && d.anon_fija === "false" && d.auth_fija === "true", JSON.stringify(d));
    afirmar("las piezas internas no se llaman de afuera", d.internas === "true", d.internas);
    afirmar("el guardián NO es security definer (tiene que ver quién escribe)", d.busca === "false", d.busca);
  },
);

correr(
  "6b. La frase exacta, con la fecha corta",
  `${fechaTru("date '2026-10-15'")}${K("oct", "retail.fn_texto_carga_inicial_cerrada(:'tru')")}
${fechaTru("date '2026-09-05'")}${K("sep", "retail.fn_texto_carga_inicial_cerrada(:'tru', 'ajuste')")}`,
  (d) => {
    afirmar(
      "«La carga inicial de Tienda Trujillo se cerró el 15-oct. Lo que encuentres entra por «Encontré prendas».»",
      d.oct === "La carga inicial de Tienda Trujillo se cerró el 15-oct. Lo que encuentres entra por «Encontré prendas».",
      d.oct,
    );
    afirmar("un día de un dígito sin cero delante («5-sep»)", (d.sep ?? "").includes("se cerró el 5-sep:"), d.sep);
  },
);

correr(
  "6c. Las tres migraciones se pegan dos veces sin duplicar nada (y no rompen el parche de ADR-0208)",
  `${MIGRACIONES.map(migracion).join("\n")}
${MIGRACIONES.map(migracion).join("\n")}
${COMO_POSTGRES}${K("candado", veces(CSI, "fn_exigir_carga_inicial_abierta"))}
${K("puerta", veces(RM, "carga_inicial_por_su_puerta"))}
${K("nota", veces(RM, "encontre_prendas_sin_nota"))}
${K("es_ajuste", veces(RM, "encontre_prendas_es_ajuste"))}
${K("cerrada", veces(RM, "fn_texto_carga_inicial_cerrada"))}
${K("sin_historia", veces(RM, "ajuste_sin_historia"))}
${K("adr0208", veces(RM, "ADR-0208: «Reposición» no sube"))}
${K("actividad", veces("retail.fn_actividad_configuracion(bigint, text)", "cierre_carga_inicial"))}
${K("motivo", veces("retail.fn_actividad_inventario(uuid, text)", "encontré prendas"))}
${K("disparador", "(select count(*) from pg_trigger where tgname = 'ubicaciones_cierre_carga_inicial_por_funcion')")}`,
  (d) => {
    afirmar("el candado está UNA vez en fn_cargar_stock_inicial", d.candado === "1", d.candado);
    afirmar("la puerta de registrar_movimiento, una vez (comentario + hint)", d.puerta === "2", d.puerta);
    afirmar("la nota de «Encontré prendas», una vez", d.nota === "1", d.nota);
    afirmar("«Encontré prendas» es un ajuste, una vez (comentario + hint)", d.es_ajuste === "2", d.es_ajuste);
    afirmar("la salida con la carga cerrada, una vez", d.cerrada === "1", d.cerrada);
    afirmar("ADR-0235 sigue igual (comentario + hint)", d.sin_historia === "2", d.sin_historia);
    afirmar("el parche de ADR-0208 sigue una vez", d.adr0208 === "1", d.adr0208);
    afirmar("la línea de Actividad de la fecha, una vez", d.actividad === "1", d.actividad);
    afirmar("«encontré prendas» en Actividad, una vez", d.motivo === "1", d.motivo);
    afirmar("un solo disparador guardián", d.disparador === "1", d.disparador);
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// 7. Dos sesiones a la vez: `fijar_cierre_carga_inicial` toma la fila de la sede ANTES de leer su fecha
// ---------------------------------------------------------------------------------------------------------------------
// Sin ese candado, dos líderes a la vez leían la MISMA fecha vieja: el segundo pasaba la regla «aflojar es del Admin» contra
// una fecha que ya no era la de la base y el historial anotaba un «antes» falso (revisión adversarial, con COMMIT: el cierre
// terminaba UN día más tarde, puesto por un líder sin Admin). Con ROLLBACK eso no se ve, y aquí NADA se confirma (el Postgres
// local es compartido): la sesión A toma la fila de TRU y la retiene; la B, un segundo después, fija la MISMA fecha que ya
// tiene — el camino que no escribe nada. Con el candado, B espera la fila y su `lock_timeout` la corta (55P03); sin él, B
// leería sin esperar y respondería «ok» al instante.
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const p = spawn(
      "docker",
      ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr }));
    p.stdin.write(sql);
    p.stdin.end();
  });
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("\n7. Dos sesiones a la vez: la segunda espera la fila de la sede (nada se confirma)");
{
  const sedeTru = "select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset";
  const sesionA = `begin;
${sedeTru}
select 1 from retail.ubicaciones where id = :'tru' for update;
select pg_sleep(3);
rollback;
`;
  const sesionB = `begin;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_res text;
begin
  execute p_sql into v_res;
  return jsonb_build_object('ok', true, 'res', v_res);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'msg', v_msg);
end;
$f$;
${sedeTru}
select coalesce(carga_inicial_hasta::text, '') as hasta from retail.ubicaciones where id = :'tru' \\gset
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local lock_timeout = '1s';
${COMO_API}select 'K|b|' || pg_temp.intento(format('select retail.fijar_cierre_carga_inicial(%L::uuid, %s)::text', :'tru', quote_nullable(nullif(:'hasta', '')::date)))::text;
rollback;
`;
  const a = psqlAsync(sesionA);
  await dormir(1000);
  const inicioB = Date.now();
  const b = await psqlAsync(sesionB);
  const msB = Date.now() - inicioB;
  const ra = await a;
  const rb = j(parsear(b.stdout).b);
  afirmar("la sesión A tomó la fila y la soltó sin confirmar nada", ra.code === 0, ra.stderr);
  afirmar(
    "la sesión B esperó la fila de la sede (lock_timeout, 55P03): fijar la toma ANTES de leer la fecha",
    rb?.ok === false && rb.estado === "55P03",
    `${JSON.stringify(rb)} ${b.stderr}`.trim(),
  );
  afirmar("y esperó de verdad (≥ 0,9 s), no falló por otra cosa", msB >= 900, `${msB} ms`);
}

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
