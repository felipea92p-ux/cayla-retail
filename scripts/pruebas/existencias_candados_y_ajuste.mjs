#!/usr/bin/env node
/**
 * Prueba de ADR-0240 y ADR-0250 contra el Postgres LOCAL:
 *   · «Una puerta, un candado» (20260927180000 y 20260927180200): `mover_entre_piso_y_almacen` pide el módulo de reponer
 *     y `apartar_prenda` pide «Apartados»; `mover_interno` y `apartar_stock` ya no se llaman desde el navegador, pero las
 *     funciones que las usan por dentro (`bajar_al_piso`) siguen funcionando. Desde ADR-0306 (20261002120000) el módulo
 *     de reponer es Existencias: «Bajada al piso» ya no existe como módulo.
 *   · «Ajustar de una vez» (20260927180100): `ajustar_inventario` es todo o nada y con marca de reintento.
 *   · «Ajustar stock» (ADR-0250 lo hizo módulo propio; ADR-0306, 20261002120000, lo devolvió a función de los módulos de
 *     inventario): ajusta el líder o quien ve Existencias, Conteos o Traslados — cualquiera de los tres alcanza solo —,
 *     y quien no ve ninguno (p. ej. solo Caja) no.
 *
 * CÓMO. Como `ajuste_no_es_primera_carga.mjs`: cada caso en su transacción con ROLLBACK (no deja nada en el Postgres
 * compartido), sesión simulada con `request.jwt.claim(s)`, y `pg_temp.intento` que devuelve el resultado o el error
 * (estado, hint) como JSON. Los módulos del rol integrante se fijan en cada caso (`soloModulos`), así la prueba no
 * depende de cómo esté la siembra.
 *
 * USO
 *   pnpm pruebas:existencias-candados-y-ajuste    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const INTEGRANTE = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const sesion = (auth) => `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;
const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
const soloModulos = (clave, modulos) =>
  `${COMO_POSTGRES}delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');\n` +
  (modulos.length
    ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]);\n`
    : "");

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
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Cuarentena', 'cuarentena' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena');
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as cuar from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' \\gset

-- Tres prendas nuevas (un producto cada una). v1 y v2 reciben historia en TRU: 5 en el almacén cada una. v3 queda sin
-- ningún movimiento (para la carga inicial).
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Candados y ajuste 1', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p1 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Candados y ajuste 2', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p2 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Candados y ajuste 3', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p3 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p1', 'ZZ-CYA-1', 100, 40, true) returning id as v1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p2', 'ZZ-CYA-2', 100, 40, true) returning id as v2 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p3', 'ZZ-CYA-3', 100, 40, true) returning id as v3 \\gset
${sesion(FELIPE)}${COMO_API}select retail.cargar_stock_inicial(:'tru', jsonb_build_array(
  jsonb_build_object('variante_id', :'v1', 'cantidad', 5), jsonb_build_object('variante_id', :'v2', 'cantidad', 5))) as _carga \\gset
${COMO_POSTGRES}
`;

const K = (clave, expresion) => `select 'K|${clave}|' || (${expresion})::text;`;
const stock = (v, sub) => `coalesce((select sum(cantidad) from retail.stock where variante_id = :'${v}' and ubicacion_id = :'tru' and sububicacion_id = :'${sub}'), 0)`;
const movs = (v) => `(select count(*) from retail.movimientos where variante_id = :'${v}')`;
const mover = (v, n, de, a, token = "null") =>
  `pg_temp.intento(format('select retail.mover_entre_piso_y_almacen(%L::uuid, %L::uuid, ${n}, %L::uuid, %L::uuid, null, ${token === "null" ? "null" : "%L::uuid"})::text', :'tru', :'${v}', :'${de}', :'${a}'${token === "null" ? "" : `, :'${token}'`}))`;
const apartar = (v) =>
  `pg_temp.intento(format('select retail.apartar_prenda(%L::uuid, %L::uuid, 1, ''Clienta de prueba'', ''999999999'', retail.fn_hoy_lima() + 2, null, %L::uuid, null)::text', :'${v}', :'tru', :'alm'))`;
const directo = (sql) => `pg_temp.intento($q$${sql}$q$)`;
const items = (...pares) => `jsonb_build_array(${pares.map(([v, c]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${c})`).join(", ")})::text`;
const ajustar = ({ ajustes = "'[]'", cargas = "'[]'", motivo = "'conteo_fisico'", sub = "alm", alPiso = "false", token = "tok" }) =>
  `pg_temp.intento(format('select retail.ajustar_inventario(%L::uuid, %L::uuid, %L::jsonb, %s, %L::jsonb, ${alPiso}, null, %L::uuid)::text', :'tru', :'${sub}', ${ajustes}, ${motivo === "null" ? "'null'" : `quote_literal(${motivo})`}, ${cargas}, :'${token}'))`;

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

// ---------------------------------------------------------------------------------------------------------------------
// Una puerta, un candado
// ---------------------------------------------------------------------------------------------------------------------

correr(
  "1. Con SOLO Existencias: «Reponer» pasa, «Apartar» frena (pide «Apartados»), y las piezas internas no se alcanzan",
  `${soloModulos("integrante", ["existencias"])}${sesion(INTEGRANTE)}${COMO_API}${K("bajar", mover("v1", 1, "alm", "piso"))}
${K("apartar", apartar("v1"))}
${K("interno", directo("select retail.mover_interno('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000000', 1, null, null)::text"))}
${K("apartar_stock", directo("select retail.apartar_stock('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000000', 1, 'x', 'x', current_date)::text"))}
${COMO_POSTGRES}${K("piso", stock("v1", "piso"))}`,
  (d) => {
    afirmar("«Reponer al piso» pasa (es una función de Existencias, ADR-0306)", j(d.bajar)?.ok === true, d.bajar);
    const a = j(d.apartar);
    afirmar("«Apartar» se rechaza con `apartar_sin_modulo`", a?.ok === false && a.hint === "apartar_sin_modulo", d.apartar);
    afirmar("mover_interno ya no se llama desde el navegador (42501)", j(d.interno)?.estado === "42501", d.interno);
    afirmar("apartar_stock tampoco (42501)", j(d.apartar_stock)?.estado === "42501", d.apartar_stock);
    afirmar("y el piso quedó en 1 (lo que repuso la puerta, nada más)", d.piso === "1", `piso=${d.piso}`);
  },
);

correr(
  "1b. SIN Existencias (solo Caja y Apartados): «Reponer» y bajar_al_piso frenan con `bajada_sin_modulo`, nada se mueve",
  `${soloModulos("integrante", ["caja", "apartados"])}${sesion(INTEGRANTE)}${COMO_API}${K("bajar", mover("v1", 1, "alm", "piso"))}
${K("bajada", `pg_temp.intento(format('select retail.bajar_al_piso(%L::uuid, %L::jsonb, gen_random_uuid())::text', :'tru', ${items(["v1", 1])}))`)}
${COMO_POSTGRES}${K("piso", stock("v1", "piso"))}`,
  (d) => {
    afirmar("«Reponer» se rechaza con `bajada_sin_modulo`", j(d.bajar)?.ok === false && j(d.bajar).hint === "bajada_sin_modulo", d.bajar);
    afirmar("bajar_al_piso también", j(d.bajada)?.ok === false && j(d.bajada).hint === "bajada_sin_modulo", d.bajada);
    afirmar("y el piso quedó en 0", d.piso === "0", `piso=${d.piso}`);
  },
);

correr(
  "2. Con Existencias y Apartados, las puertas hacen lo mismo que antes",
  `${soloModulos("integrante", ["existencias", "apartados"])}${sesion(INTEGRANTE)}${COMO_API}${K("bajar", mover("v1", 2, "alm", "piso"))}
${K("retirar", mover("v1", 1, "piso", "alm"))}
${K("apartar", apartar("v2"))}
${COMO_POSTGRES}${K("piso", stock("v1", "piso"))}
${K("alm", stock("v1", "alm"))}
${K("apartada", "(select coalesce(sum(cantidad_apartada), 0) from retail.stock where variante_id = :'v2' and ubicacion_id = :'tru')")}`,
  (d) => {
    afirmar("bajar 2 al piso pasa", j(d.bajar)?.ok === true, d.bajar);
    afirmar("retirar 1 del piso pasa", j(d.retirar)?.ok === true, d.retirar);
    afirmar("piso 1 y almacén 4", d.piso === "1" && d.alm === "4", `piso=${d.piso} alm=${d.alm}`);
    afirmar("apartar 1 pasa y queda apartada", j(d.apartar)?.ok === true && d.apartada === "1", `${d.apartar} apartada=${d.apartada}`);
  },
);

correr(
  "3. La puerta de piso solo mueve entre el piso y el almacén de la misma tienda",
  `${soloModulos("integrante", ["existencias"])}${sesion(INTEGRANTE)}${COMO_API}${K("cuarentena", mover("v1", 1, "alm", "cuar"))}
${COMO_POSTGRES}${K("alm", stock("v1", "alm"))}`,
  (d) => {
    const r = j(d.cuarentena);
    afirmar("almacén → cuarentena se rechaza (`mover_fuera_de_piso_almacen`)", r?.ok === false && r.hint === "mover_fuera_de_piso_almacen", d.cuarentena);
    afirmar("y el almacén sigue en 5", d.alm === "5", `alm=${d.alm}`);
  },
);

correr(
  "4. Las funciones que usan mover_interno por dentro no perdieron nada: bajar_al_piso sigue bajando",
  `${soloModulos("integrante", ["existencias"])}${sesion(INTEGRANTE)}${COMO_API}${K("bajada", `pg_temp.intento(format('select retail.bajar_al_piso(%L::uuid, %L::jsonb, gen_random_uuid())::text', :'tru', ${items(["v1", 3])}))`)}
${COMO_POSTGRES}${K("piso", stock("v1", "piso"))}`,
  (d) => {
    afirmar("bajar_al_piso pasa", j(d.bajada)?.ok === true, d.bajada);
    afirmar("y dejó 3 en el piso", d.piso === "3", `piso=${d.piso}`);
  },
);

correr(
  "5. Permisos",
  `${K("mover_auth", "has_function_privilege('authenticated', 'retail.mover_entre_piso_y_almacen(uuid, uuid, integer, uuid, uuid, text, uuid)'::regprocedure, 'EXECUTE')")}
${K("mover_anon", "has_function_privilege('anon', 'retail.mover_entre_piso_y_almacen(uuid, uuid, integer, uuid, uuid, text, uuid)'::regprocedure, 'EXECUTE')")}
${K("apartar_auth", "has_function_privilege('authenticated', 'retail.apartar_prenda(uuid, uuid, integer, text, text, date, text, uuid, uuid)'::regprocedure, 'EXECUTE')")}
${K("interno_auth", "has_function_privilege('authenticated', 'retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid)'::regprocedure, 'EXECUTE')")}
${K("apartar_stock_auth", "has_function_privilege('authenticated', 'retail.apartar_stock(uuid, uuid, integer, text, text, date, text, uuid, uuid)'::regprocedure, 'EXECUTE')")}
${K("ajustar_auth", "has_function_privilege('authenticated', 'retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid)'::regprocedure, 'EXECUTE')")}
${K("ajustar_anon", "has_function_privilege('anon', 'retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid)'::regprocedure, 'EXECUTE')")}
${K("intentos_auth", "has_table_privilege('authenticated', 'retail.ajustes_inventario_intentos', 'SELECT')")}`,
  (d) => {
    afirmar("las puertas: authenticated sí, anon no", d.mover_auth === "true" && d.mover_anon === "false" && d.apartar_auth === "true");
    afirmar("las piezas internas: authenticated no", d.interno_auth === "false" && d.apartar_stock_auth === "false");
    afirmar("ajustar_inventario: authenticated sí, anon no", d.ajustar_auth === "true" && d.ajustar_anon === "false");
    afirmar("la tabla de marcas no se lee desde afuera", d.intentos_auth === "false");
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// Ajustar de una vez
// ---------------------------------------------------------------------------------------------------------------------

correr(
  "6. Todo o nada: si una línea no pasa, no queda ninguna",
  `select gen_random_uuid() as tok \\gset
${sesion(FELIPE)}${COMO_API}${K("r", ajustar({ ajustes: items(["v1", 2], ["v2", -9]) }))}
${COMO_POSTGRES}${K("alm1", stock("v1", "alm"))}
${K("movs1", movs("v1"))}
${K("marcas", "(select count(*) from retail.ajustes_inventario_intentos where token_cliente = :'tok')")}`,
  (d) => {
    const r = j(d.r);
    afirmar("el ajuste que dejaría v2 en negativo se rechaza entero", r?.ok === false, d.r);
    afirmar("y v1 no se ajustó (sigue en 5, sin movimiento nuevo)", d.alm1 === "5" && d.movs1 === "1", `alm=${d.alm1} movs=${d.movs1}`);
    afirmar("y la marca quedó libre", d.marcas === "0", `marcas=${d.marcas}`);
  },
);

correr(
  "7. La marca: el mismo envío dos veces ajusta una sola vez; con otros datos no repite nada",
  `select gen_random_uuid() as tok \\gset
${sesion(FELIPE)}${COMO_API}${K("r1", ajustar({ ajustes: items(["v1", 2], ["v2", -1]), cargas: items(["v3", 4]) }))}
${K("r2", ajustar({ ajustes: items(["v2", -1], ["v1", 2]), cargas: items(["v3", 4]) }))}
${K("r3", ajustar({ ajustes: items(["v1", 3]) }))}
${COMO_POSTGRES}${K("alm1", stock("v1", "alm"))}
${K("alm2", stock("v2", "alm"))}
${K("alm3", stock("v3", "alm"))}
${K("movs1", movs("v1"))}
${K("carga3", "(select string_agg(tipo || ':' || coalesce(motivo, ''), ',') from retail.movimientos where variante_id = :'v3')")}`,
  (d) => {
    const r1 = j(d.r1);
    const res1 = r1?.ok ? JSON.parse(r1.res) : null;
    afirmar("el primer envío guarda 2 ajustes y 1 carga", res1?.ajustes === 2 && res1?.cargas === 1 && res1?.ya_registrado === false, d.r1);
    const r2 = j(d.r2);
    const res2 = r2?.ok ? JSON.parse(r2.res) : null;
    afirmar("el reintento (mismas líneas, otro orden) devuelve lo ya guardado", res2?.ya_registrado === true, d.r2);
    afirmar("y no ajustó de nuevo: v1 = 7, v2 = 4, v3 = 4", d.alm1 === "7" && d.alm2 === "4" && d.alm3 === "4", `v1=${d.alm1} v2=${d.alm2} v3=${d.alm3}`);
    afirmar("v1 tiene 2 movimientos (la carga del preludio y UN ajuste)", d.movs1 === "2", `movs=${d.movs1}`);
    afirmar("v3 entró como stock inicial, no como ajuste", /carga_inicial/.test(d.carga3 ?? "") && !/ajuste/.test(d.carga3 ?? ""), d.carga3);
    const r3 = j(d.r3);
    afirmar("la misma marca con otros datos se rechaza (`ajuste_token_reusado`)", r3?.ok === false && r3.hint === "ajuste_token_reusado", d.r3);
  },
);

correr(
  "8. Los candados de siempre siguen puestos: una carga con historia, un ajuste sin historia, sin motivo, vacío",
  `select gen_random_uuid() as tok \\gset
${sesion(FELIPE)}${COMO_API}${K("carga_con_historia", ajustar({ cargas: items(["v1", 1]) }))}
${K("ajuste_sin_historia", ajustar({ ajustes: items(["v3", 1]) }))}
${K("sin_motivo", ajustar({ ajustes: items(["v1", 1]), motivo: "null" }))}
${K("vacio", ajustar({}))}
${K("repetida", ajustar({ ajustes: items(["v1", 1]), cargas: items(["v1", 1]) }))}`,
  (d) => {
    afirmar("una carga de una prenda con historia: `carga_con_historia`", j(d.carga_con_historia)?.hint === "carga_con_historia", d.carga_con_historia);
    afirmar("un ajuste de una prenda sin historia: `ajuste_sin_historia`", j(d.ajuste_sin_historia)?.hint === "ajuste_sin_historia", d.ajuste_sin_historia);
    afirmar("un ajuste sin motivo: `ajuste_sin_motivo`", j(d.sin_motivo)?.hint === "ajuste_sin_motivo", d.sin_motivo);
    afirmar("nada que ajustar: `ajuste_vacio`", j(d.vacio)?.hint === "ajuste_vacio", d.vacio);
    afirmar("la misma prenda dos veces: `ajuste_linea_invalida`", j(d.repetida)?.hint === "ajuste_linea_invalida", d.repetida);
  },
);

correr(
  "9. Quien no puede ajustar, no ajusta (el candado de registrar_movimiento: fn_puede_ajustar_stock, ADR-0306)",
  `select gen_random_uuid() as tok \\gset
${soloModulos("integrante", ["vender"])}${sesion(INTEGRANTE)}${COMO_API}${K("r", ajustar({ ajustes: items(["v1", 1]) }))}
${COMO_POSTGRES}${K("alm1", stock("v1", "alm"))}`,
  (d) => {
    afirmar("se rechaza", j(d.r)?.ok === false, d.r);
    afirmar("y v1 sigue en 5", d.alm1 === "5", `alm=${d.alm1}`);
  },
);

// ADR-0306: «Ajustar stock» es una función de Existencias/Conteos/Traslados, ya no un módulo propio (ADR-0250)
// ---------------------------------------------------------------------------------------------------------------------

for (const modulos of [["existencias", "conteos", "traslados"], ["existencias"], ["conteos"], ["traslados"]]) {
  correr(
    `10a. Con ${modulos.join(" + ")} alcanza para ajustar (fn_puede_ajustar_stock: líder o Existencias/Conteos/Traslados)`,
    `select gen_random_uuid() as tok \\gset
${soloModulos("integrante", modulos)}${sesion(INTEGRANTE)}${COMO_API}${K("r", ajustar({ ajustes: items(["v1", 1]) }))}
${COMO_POSTGRES}${K("alm1", stock("v1", "alm"))}`,
    (d) => {
      afirmar("pasa", j(d.r)?.ok === true, d.r);
      afirmar("y v1 quedó en 6", d.alm1 === "6", `alm=${d.alm1}`);
    },
  );
}

correr(
  "10b. Sin Existencias, Conteos ni Traslados (solo Caja y Apartados) NO alcanza para ajustar",
  `select gen_random_uuid() as tok \\gset
${soloModulos("integrante", ["caja", "apartados"])}${sesion(INTEGRANTE)}${COMO_API}${K("r", ajustar({ ajustes: items(["v1", 1]) }))}
${COMO_POSTGRES}${K("alm1", stock("v1", "alm"))}`,
  (d) => {
    afirmar("se rechaza con `ajuste_sin_modulo` y el mensaje ya no nombra un módulo «Ajustar stock»", j(d.r)?.ok === false && j(d.r).hint === "ajuste_sin_modulo" && !String(j(d.r).msg).includes("«Ajustar stock»"), d.r);
    afirmar("y v1 sigue en 5", d.alm1 === "5", `alm=${d.alm1}`);
  },
);

correr(
  "10c. Cerrar conteo y cerrar traslado con diferencia siguen pidiendo Existencias/Conteos/Traslados: con solo Caja se rechazan",
  `${soloModulos("integrante", ["caja"])}${sesion(INTEGRANTE)}${COMO_API}${K("conteo", directo("select retail.cerrar_conteo('00000000-0000-4000-8000-000000000000')::text"))}
${K("traslado", directo("select retail.cerrar_traslado_con_diferencia('00000000-0000-4000-8000-000000000000', null)::text"))}`,
  (d) => {
    // Con solo Caja las dos deben frenar ANTES de buscar el id — mismo mensaje de siempre («Solo un líder puede
    // cerrar…»), no `ajuste_sin_modulo`: es el candado de fn_puede_ajustar_inventario(), la misma capacidad.
    afirmar("cerrar_conteo se rechaza (no por `ajuste_sin_modulo`)", j(d.conteo)?.ok === false && j(d.conteo).hint !== "ajuste_sin_modulo", d.conteo);
    afirmar("cerrar_traslado_con_diferencia se rechaza (no por `ajuste_sin_modulo`)", j(d.traslado)?.ok === false && j(d.traslado).hint !== "ajuste_sin_modulo", d.traslado);
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
