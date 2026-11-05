#!/usr/bin/env node
/**
 * Pruebas de las ofertas de una campaña (`20261023232000_campana_reglas_de_precio.sql`, «Tres preguntas», Felipe 2026-10-23) contra el
 * Postgres local.
 *
 * QUÉ PRUEBA. Una campaña tiene varias ofertas (`retail.campana_reglas`): un % menos con fechas propias, días de la semana y, si se
 * quiere, solo algunas categorías de la campaña. La caja las lee por `fn_campanas_en_sede`.
 *   · la regla: una oferta rige solo si está ACTIVA, hoy cae en sus fechas y en uno de sus días, la prenda es de la campaña (marcada o
 *     por categoría) —o, con «solo estas categorías», de esas categorías aunque la campaña no las tenga— sin lo que «deja fuera» y no es
 *     de Claurè (salvo que se incluya); y hereda la sede de la campaña;
 *   · UNA fila por prenda y campaña, con el mayor % entre el descuento de siempre de la campaña y sus ofertas;
 *   · la tolerancia de las ventas sin conexión (3 días) también cuenta los días de la semana;
 *   · `registrar_venta` de punta a punta: exige el descuento de la oferta (`venta_campana_omitida`), lo acepta con su monto, rechaza un
 *     % que no es y NO lo exige un día en que la oferta no rige;
 *   · permisos: sin la llave de las campañas no se guarda, activa ni retira nada; con la llave (sin ser líder) se guarda un borrador, se
 *     activa, se cambia una que ya rige y se retira (ADR-0534, 20261027164000: antes, activar, cambiar y retirar eran de un líder);
 *   · validaciones: %, fechas (hoy o después, dentro de la campaña), días (al menos uno, y que alguno caiga en las fechas), categorías;
 *   · el historial, `campana_reglas()` para la pantalla, las tablas que no se leen directo y la migración re-ejecutable.
 *
 * CÓMO. Cada escenario en su propia transacción con ROLLBACK (como `campanas_por_sede.mjs`): la base compartida queda igual.
 *
 * DA POR SENTADO: `Tienda Lima`, `Tienda Trujillo` y la variante `BLU-EMMA-NEG-M` del seed.
 *
 * USO
 *   pnpm pruebas:campana-reglas                       → con las migraciones ya aplicadas en la base `postgres` del local
 *   APLICAR_ANTES=supabase/migrations/20261023232000_campana_reglas_de_precio.sql pnpm pruebas:campana-reglas   → la ensaya dentro de cada escenario
 *   pnpm pruebas:campana-reglas -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const iBase = process.argv.indexOf("--base");
const BASE = iBase > 0 ? process.argv[iBase + 1] : "postgres";
const MIGRACION = "supabase/migrations/20261023232000_campana_reglas_de_precio.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder — opera cualquier ubicación
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed): no es líder

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es lo que se está probando.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 900)}`);
  }
}
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»: ${r.salida}` : r.mensaje);
const ultimaLinea = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) ?? "" : "");
const esperarValor = (nombre, r, esperado) => esperar(nombre, ultimaLinea(r) === esperado, r.ok ? `dio «${ultimaLinea(r)}», se esperaba «${esperado}»` : r.mensaje);

// ---- El punto de partida: como el líder, con una campaña «ZZ …» de hoy (ayer a dentro de 10 días) con la talla BLU-EMMA-NEG-M marcada ----
const HOY = "retail.fn_hoy_lima()";
const PREPARAR = `begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select v.id as v1, v.precio, p.categoria_id as cat, p.id as prod1 from retail.variantes v join retail.productos p on p.id = v.producto_id where v.sku = 'BLU-EMMA-NEG-M' \\gset
select id as cat_otra from retail.categorias where id <> :'cat' and activo order by id limit 1 \\gset
select v.id as v2 from retail.variantes v join retail.productos p on p.id = v.producto_id where p.categoria_id <> :'cat' and v.activo order by v.id limit 1 \\gset
select extract(isodow from ${HOY})::smallint as dow_hoy, extract(isodow from ${HOY} + 1)::smallint as dow_manana \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña con ofertas (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[]);
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v1', :'camp');
`;
const COMO_MICAELA = `set local request.jwt.claim.sub = '${MICAELA}';\n`;
const MODULO_A_INTEGRANTE = `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'etiquetas');\n`;

// Una oferta por la función de siempre. `dias` es SQL (un arreglo o null = todos); `solo` y `fuera`, SQL de uuid[].
const OFERTA = ({ nombre = "ZZ oferta", pct = 30, desde = HOY, hasta = `${HOY} + 3`, dias = "null", solo = "'{}'::uuid[]", fuera = "'{}'::uuid[]", claure = "false", sedes = "'{}'::uuid[]", activar = "true", var: v = "r" } = {}) =>
  `select retail.guardar_campana_regla(null, :'camp', '${nombre}', ${pct}, ${desde}, ${hasta}, ${dias}, ${solo}, ${fuera}, ${claure}, ${sedes}, ${activar}) as ${v} \\gset\n`;
// Una oferta puesta a mano (para fechas pasadas, que la función no deja crear).
const OFERTA_A_MANO = ({ desde, hasta, dias = "array[1,2,3,4,5,6,7]::smallint[]", pct = 30, var: v = "rm" }) =>
  `insert into retail.campana_reglas (etiqueta_id, nombre, porcentaje, desde, hasta, dias_semana, estado, creada_por, activada_por, activada_en)
     values (:'camp', 'ZZ a mano', ${pct}, ${desde}, ${hasta}, ${dias}, 'activa', gen_random_uuid(), gen_random_uuid(), now()) returning id as ${v} \\gset\n`;
const VE = (hoy = HOY, tol = 0, variante = ":'v1'", sede = "null") =>
  `(select count(*) || '|' || coalesce(max(descuento_pct), 0) from retail.fn_campanas_en_sede(${hoy}, ${tol}, array[${variante}]::uuid[], ${sede}) where etiqueta_id = :'camp')`;

// Las dos tiendas listas para vender (caja propia, stock de sobra), como en `campanas_por_sede.mjs`.
const preparar = (u) => `
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${u}', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${u}' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'${u}', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'${u}' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'${u}' and estado = 'abierta'
) x) as _cerro_${u} \\gset
select retail.abrir_caja(:'${u}', 100.00, 'prueba automatizada') as caja_${u} \\gset
select retail.fn_sububicacion_por_defecto(:'${u}', 'venta') as sub_${u} \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'${u}', :'sub_${u}', 'entrada', 1000, 'colchón de prueba') returning id as mov_${u} \\gset
select retail.fn_aplicar_movimiento(:'mov_${u}') as _d_${u} \\gset
`;
const linea = (descuento, motivo, etq = true) =>
  `jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1, 'precio_unitario', :'precio', 'descuento_unitario', ${descuento}` +
  `${motivo ? `, 'motivo_descuento', '${motivo}'` : ""}${etq ? ", 'descuento_etiqueta_id', :'camp'" : ""}))`;
const venta = (u, descuento, motivo, cobro, etq = true) =>
  `select retail.registrar_venta(:'${u}', ${linea(descuento, motivo, etq)},
     jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', ${cobro})), null, gen_random_uuid()) as venta \\gset`;
const DESCUENTO = (pct) => `select retail.fn_descuento_campana(:'precio'::numeric, ${pct}) as d \\gset\nselect (:'precio'::numeric - :'d'::numeric) as cobro \\gset\n`;

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regclass('retail.campana_reglas') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta la tabla de ofertas: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
      process.exit(2);
    }
  }

  // ---------------------------------------------------------------- 1. Cuándo rige una oferta
  console.log("\n— Cuándo rige una oferta —");
  esperarValor("una oferta ACTIVA rige: una fila con su %", correr(`${PREPARAR}${OFERTA({ pct: 30 })}select ${VE()};\nrollback;`), "1|30.00");
  esperarValor(
    "un borrador NO rige; al activarlo, sí",
    correr(`${PREPARAR}${OFERTA({ activar: "false" })}select ${VE()} as antes \\gset
select retail.activar_campana_regla(:'r');
select :'antes' || ' → ' || ${VE()};
rollback;`),
    "0|0 → 1|30.00",
  );
  esperarValor(
    "una oferta retirada deja de regir",
    correr(`${PREPARAR}${OFERTA()}select retail.retirar_campana_regla(:'r');\nselect ${VE()};\nrollback;`),
    "0|0",
  );
  esperarValor(
    "una oferta que empieza mañana NO rige hoy, y mañana sí",
    correr(`${PREPARAR}${OFERTA({ desde: `${HOY} + 1`, hasta: `${HOY} + 5` })}select ${VE()} || ' → ' || ${VE(`${HOY} + 1`)};\nrollback;`),
    "0|0 → 1|30.00",
  );
  esperarValor(
    "solo MAÑANA de la semana: hoy NO rige, mañana sí",
    correr(`${PREPARAR}${OFERTA({ hasta: `${HOY} + 7`, dias: "array[:dow_manana]::smallint[]" })}select ${VE()} || ' → ' || ${VE(`${HOY} + 1`)} || ' → ' || ${VE(`${HOY} + 2`)};\nrollback;`),
    "0|0 → 1|30.00 → 0|0",
  );
  esperarValor(
    "todos los días MENOS hoy: no rige hoy y sí cualquier otro día",
    correr(`${PREPARAR}${OFERTA({ hasta: `${HOY} + 7`, dias: "(select array_agg(d::smallint) from generate_series(1,7) d where d <> :dow_hoy)" })}select ${VE()} || ' → ' || ${VE(`${HOY} + 1`)};\nrollback;`),
    "0|0 → 1|30.00",
  );
  esperarValor(
    "la tolerancia de las ventas sin conexión también mira los días: una oferta de ayer vale con 3 días de gracia y no sin ellos",
    correr(`${PREPARAR}${OFERTA_A_MANO({ desde: `${HOY} - 5`, hasta: `${HOY} - 1` })}select ${VE(HOY, 0)} || ' → ' || ${VE(HOY, 3)};\nrollback;`),
    "0|0 → 1|30.00",
  );
  esperarValor(
    "la tolerancia respeta el día de la semana: con gracia vale si alguno de los días de la ventana es el de la oferta",
    correr(`${PREPARAR}${OFERTA_A_MANO({ desde: `${HOY} - 5`, hasta: `${HOY} - 1`, dias: "array[(((:dow_hoy - 3) % 7 + 7) % 7) + 1]::smallint[]" })}select ${VE(HOY, 3)};\nrollback;`),
    "1|30.00",
  );
  esperarValor(
    "…y no vale si el día de la oferta no cae en ninguno de los días de la ventana",
    correr(`${PREPARAR}${OFERTA_A_MANO({ desde: `${HOY} - 5`, hasta: `${HOY} - 1`, dias: "array[:dow_manana]::smallint[]" })}select ${VE(HOY, 3)};\nrollback;`),
    "0|0",
  );
  esperarValor(
    "una oferta no rige fuera de las fechas de su campaña (campaña que ya terminó)",
    correr(`${PREPARAR}${OFERTA()}select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 20, ${HOY} - 10, '{}'::uuid[]);\nselect ${VE()};\nrollback;`),
    "0|0",
  );
  esperarValor(
    "una campaña desactivada no da sus ofertas",
    correr(`${PREPARAR}${OFERTA()}update retail.etiquetas set activo = false where id = :'camp';\nselect ${VE()};\nrollback;`),
    "0|0",
  );

  // ---------------------------------------------------------------- 2. A qué prendas llega
  console.log("\n— A qué prendas llega —");
  esperarValor(
    "una prenda que no es de la campaña (ni marcada ni por categoría) no recibe la oferta",
    correr(`${PREPARAR}${OFERTA()}select ${VE(HOY, 0, ":'v2'")};\nrollback;`),
    "0|0",
  );
  esperarValor(
    "una prenda de una categoría de la campaña la recibe aunque no esté marcada",
    correr(`${PREPARAR}select retail.actualizar_campana_etiqueta(:'camp', null, ${HOY} - 1, ${HOY} + 10, array[(select categoria_id from retail.productos p join retail.variantes v on v.producto_id = p.id where v.id = :'v2')]);\n${OFERTA()}select ${VE(HOY, 0, ":'v2'")};\nrollback;`),
    "1|30.00",
  );
  esperarValor("«solo estas categorías» con la categoría de la prenda: rige", correr(`${PREPARAR}${OFERTA({ solo: "array[:'cat']::uuid[]" })}select ${VE()};\nrollback;`), "1|30.00");
  esperarValor("«solo estas categorías» con OTRA categoría: no rige", correr(`${PREPARAR}${OFERTA({ solo: "array[:'cat_otra']::uuid[]" })}select ${VE()};\nrollback;`), "0|0");
  // La hoja de la oferta lista TODAS las categorías (como la de la campaña): «solo estas» rige donde la oferta dice, esté o no en la campaña.
  const CAT_DE_V2 = "array[(select p.categoria_id from retail.productos p join retail.variantes v on v.producto_id = p.id where v.id = :'v2')]::uuid[]";
  esperarValor("«solo estas categorías» con una que la campaña NO tiene: rige igual (la oferta dice dónde)", correr(`${PREPARAR}${OFERTA({ solo: CAT_DE_V2 })}select ${VE(HOY, 0, ":'v2'")};\nrollback;`), "1|30.00");
  esperarValor("…pero como borrador no cobra", correr(`${PREPARAR}${OFERTA({ solo: CAT_DE_V2, activar: "false" })}select ${VE(HOY, 0, ":'v2'")};\nrollback;`), "0|0");
  esperarValor(
    "…y no suma esa categoría a la campaña: otra oferta «de toda la campaña» no llega a esa prenda y la campaña sigue sin esa categoría",
    correr(`${PREPARAR}${OFERTA({ solo: CAT_DE_V2 })}${OFERTA({ pct: 50, nombre: "ZZ toda la campaña", var: "r2" })}select ${VE(HOY, 0, ":'v2'")} || '|' || (select count(*) from retail.etiqueta_categorias where etiqueta_id = :'camp');\nrollback;`),
    "1|30.00|0",
  );
  esperarValor("«dejar fuera» la categoría de la prenda: no rige", correr(`${PREPARAR}${OFERTA({ fuera: "array[:'cat']::uuid[]" })}select ${VE()};\nrollback;`), "0|0");
  esperarValor("«dejar fuera» otra categoría: rige", correr(`${PREPARAR}${OFERTA({ fuera: "array[:'cat_otra']::uuid[]" })}select ${VE()};\nrollback;`), "1|30.00");
  esperarValor(
    "las prendas de Claurè no entran, salvo que la oferta las incluya a propósito",
    correr(`${PREPARAR}update retail.productos set empresa_id = (select id from retail.empresas where clave = 'claure') where id = :'prod1';
${OFERTA()}${OFERTA({ claure: "true", nombre: "ZZ con Claurè", var: "r2", pct: 25 })}select retail.retirar_campana_regla(:'r2') as _x \\gset
select ${VE()} as sin \\gset
select retail.activar_campana_regla(:'r2');
select :'sin' || ' → ' || ${VE()};
rollback;`),
    "0|0 → 1|25.00",
  );

  // ---------------------------------------------------------------- 3. Cuál gana y cuántas filas
  console.log("\n— Una fila por prenda y campaña: gana la de mayor % —");
  esperarValor(
    "dos ofertas activas y el descuento de siempre de la campaña: una sola fila, con el mayor",
    correr(`${PREPARAR}select retail.actualizar_campana_etiqueta(:'camp', 10, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[]);
${OFERTA({ pct: 25 })}${OFERTA({ pct: 15, var: "r2", nombre: "ZZ otra" })}select ${VE()};
rollback;`),
    "1|25.00",
  );
  esperarValor(
    "si la oferta mayor se retira, gana la siguiente (el descuento de siempre sigue valiendo)",
    correr(`${PREPARAR}select retail.actualizar_campana_etiqueta(:'camp', 10, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[]);
${OFERTA({ pct: 25 })}${OFERTA({ pct: 15, var: "r2", nombre: "ZZ otra" })}select retail.retirar_campana_regla(:'r');\nselect ${VE()} || ' → ';
select retail.retirar_campana_regla(:'r2');\nselect ${VE()};
rollback;`),
    "1|10.00",
  );
  esperarValor(
    "campanas_vigentes(sede) la da a la caja de la tienda",
    correr(`${PREPARAR}${OFERTA()}select count(*) || '|' || max(descuento_pct) from retail.campanas_vigentes(:'tru') where etiqueta_id = :'camp' and variante_id = :'v1';\nrollback;`),
    "1|30.00",
  );

  // ---------------------------------------------------------------- 4. La sede es de la campaña
  console.log("\n— La sede es la de la campaña —");
  esperarValor(
    "una campaña solo de Trujillo: sus ofertas rigen en Trujillo y en ninguna otra parte (tampoco sin sede)",
    correr(`${PREPARAR}select retail.actualizar_campana_etiqueta_con_sedes(:'camp', null, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[], array[:'tru']::uuid[]);
${OFERTA()}select ${VE(HOY, 0, ":'v1'", ":'tru'")} || ' → ' || ${VE(HOY, 0, ":'v1'", ":'lima'")} || ' → ' || ${VE()};
rollback;`),
    "1|30.00 → 0|0 → 0|0",
  );


  // ---------------------------------------------------------------- 4b. Las tiendas de la oferta
  console.log("\n— Las tiendas de la oferta (dentro de las de su campaña) —");
  const TODAS_LAS_TIENDAS = "array(select id from retail.ubicaciones where tipo = 'tienda' and activo)";
  esperarValor(
    "una oferta solo de Trujillo rige en Trujillo y en ninguna otra parte (tampoco sin sede)",
    correr(`${PREPARAR}${OFERTA({ sedes: "array[:'tru']::uuid[]" })}select ${VE(HOY, 0, ":'v1'", ":'tru'")} || ' → ' || ${VE(HOY, 0, ":'v1'", ":'lima'")} || ' → ' || ${VE()};
rollback;`),
    "1|30.00 → 0|0 → 0|0",
  );
  esperarValor(
    "una oferta sin tiendas rige en todas las de la campaña (y sin sede, como la campaña de todas)",
    correr(`${PREPARAR}${OFERTA()}select ${VE(HOY, 0, ":'v1'", ":'tru'")} || ' → ' || ${VE(HOY, 0, ":'v1'", ":'lima'")} || ' → ' || ${VE()};
rollback;`),
    "1|30.00 → 1|30.00 → 1|30.00",
  );
  esperarValor(
    "elegir TODAS las tiendas es no limitar: no queda ninguna fila (una tienda nueva no queda fuera)",
    correr(`${PREPARAR}${OFERTA({ sedes: TODAS_LAS_TIENDAS + "::uuid[]" })}select count(*) from retail.campana_regla_sedes where regla_id = :'r';
rollback;`),
    "0",
  );
  esperarError(
    "una oferta no puede regir en una tienda donde su campaña no rige",
    correr(`${PREPARAR}select retail.actualizar_campana_etiqueta_con_sedes(:'camp', null, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[], array[:'tru']::uuid[]);
${OFERTA({ sedes: "array[:'lima']::uuid[]" })}rollback;`),
    "una oferta no puede regir en una tienda donde la campaña no rige",
  );
  esperarError(
    "el taller (o cualquier sede que no sea una tienda activa) no es una tienda para una oferta",
    correr(`${PREPARAR}${OFERTA({ sedes: "array[(select id from retail.ubicaciones where tipo <> 'tienda' order by id limit 1)]::uuid[]" })}rollback;`),
    "ya no está activa",
  );
  esperarValor(
    "si la campaña se limita después, la oferta nunca llega más lejos que su campaña",
    correr(`${PREPARAR}${OFERTA({ sedes: "array[:'lima']::uuid[]" })}select retail.actualizar_campana_etiqueta_con_sedes(:'camp', null, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[], array[:'tru']::uuid[]);
select ${VE(HOY, 0, ":'v1'", ":'tru'")} || ' → ' || ${VE(HOY, 0, ":'v1'", ":'lima'")};
rollback;`),
    "0|0 → 0|0",
  );
  esperarValor(
    "campana_reglas() trae las tiendas de cada oferta, y cambiarla las cambia y guarda cómo estaban",
    correr(`${PREPARAR}${OFERTA({ sedes: "array[:'tru']::uuid[]" })}select array_length(sedes, 1) as n1 from retail.campana_reglas() where id = :'r' \\gset
select retail.guardar_campana_regla(:'r', :'camp', 'ZZ ahora en todas', 30, ${HOY}, ${HOY} + 3, null, '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], false);
select :'n1' || '|' || (select array_length(sedes, 1) is null from retail.campana_reglas() where id = :'r') || '|' || (select jsonb_array_length(antes -> 'sedes') from retail.campana_regla_historial where regla_id = :'r');
rollback;`),
    "1|true|1",
  );

  // ---------------------------------------------------------------- 5. La venta de punta a punta
  console.log("\n— registrar_venta con una oferta —");
  const TIENDAS = `${PREPARAR}${preparar("tru")}${preparar("lima")}`;
  esperarError(
    "un descuento MENOR al de la oferta también se rechaza: la caja debe dar el de la oferta (venta_campana_omitida)",
    correr(`${TIENDAS}${OFERTA({ pct: 30 })}${DESCUENTO(20)}${venta("tru", ":d", "campana", ":cobro")}\nrollback;`),
    "venta_campana_omitida",
  );
  esperarError(
    "con la oferta activa, cobrar sin el descuento se rechaza (venta_campana_omitida)",
    correr(`${TIENDAS}${OFERTA({ pct: 30 })}${venta("tru", 0, null, ":'precio'", false)}\nrollback;`),
    "venta_campana_omitida",
  );
  esperarValor(
    "con la oferta activa, la venta con su descuento pasa, cobra con el redondeo de siempre y apunta a la campaña",
    correr(`${TIENDAS}${OFERTA({ pct: 30 })}${DESCUENTO(30)}${venta("tru", ":d", "campana", ":cobro")}
select 'linea|' || descuento_unitario || '|' || subtotal || '|' || motivo_descuento || '|' || (descuento_etiqueta_id = :'camp')::text from retail.venta_items where venta_id = :'venta';
rollback;`),
    // 79.90 con 30 % = 55.93, que baja a 55.90: descuenta 24.00
    "linea|24.00|55.90|campana|true",
  );
  esperarError(
    "un descuento MAYOR al de la oferta se rechaza (venta_campana_monto_no_coincide)",
    correr(`${TIENDAS}${OFERTA({ pct: 30 })}${DESCUENTO(40)}${venta("tru", ":d", "campana", ":cobro")}\nrollback;`),
    "venta_campana_monto_no_coincide",
  );
  esperarValor(
    "una oferta que hoy no es su día NO se exige: se vende a precio normal",
    correr(`${TIENDAS}${OFERTA({ hasta: `${HOY} + 7`, dias: "array[:dow_manana]::smallint[]" })}${venta("tru", 0, null, ":'precio'", false)}
select 'linea|' || descuento_unitario || '|' || subtotal from retail.venta_items where venta_id = :'venta';
rollback;`),
    "linea|0.00|79.90",
  );
  esperarError(
    "…ni se acepta el descuento de una oferta que hoy no es su día (venta_campana_no_vigente)",
    correr(`${TIENDAS}${OFERTA({ hasta: `${HOY} + 7`, dias: "array[:dow_manana]::smallint[]" })}${DESCUENTO(30)}${venta("tru", ":d", "campana", ":cobro")}\nrollback;`),
    "venta_campana_no_vigente",
  );
  esperarError(
    "campaña solo de Trujillo: en Lima el descuento de la oferta no se acepta",
    correr(`${TIENDAS}select retail.actualizar_campana_etiqueta_con_sedes(:'camp', null, ${HOY} - 1, ${HOY} + 10, '{}'::uuid[], array[:'tru']::uuid[]);
${OFERTA({ pct: 30 })}${DESCUENTO(30)}${venta("lima", ":d", "campana", ":cobro")}\nrollback;`),
    "venta_campana_no_vigente",
  );

  // ---------------------------------------------------------------- 6. Permisos
  console.log("\n— Permisos —");
  esperarError(
    "quien no tiene la llave de las campañas no guarda una oferta (integrante sin módulo)",
    correr(`${PREPARAR}${COMO_MICAELA}${OFERTA({ activar: "false" })}\nrollback;`),
    "módulo «Campañas»",
  );
  esperarValor(
    "quien no tiene la llave no ve ninguna oferta en campana_reglas()",
    correr(`${PREPARAR}${OFERTA()}${COMO_MICAELA}select count(*) from retail.campana_reglas();\nrollback;`),
    "0",
  );
  esperarValor(
    "con Insignias guarda un BORRADOR y la caja no lo cobra",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE}${COMO_MICAELA}${OFERTA({ activar: "false" })}select estado || '|' || (select count(*) from retail.fn_campanas_en_sede(${HOY}, 0, array[:'v1']::uuid[], null) where etiqueta_id = :'camp') from retail.campana_reglas where id = :'r';\nrollback;`),
    "borrador|0",
  );
  esperarValor(
    "con Insignias ACTIVA al guardar sin ser líder (ADR-0534) y la caja ya la cobra",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE}${COMO_MICAELA}${OFERTA({ activar: "true" })}select estado || '|' || ${VE()} from retail.campana_reglas where id = :'r';\nrollback;`),
    "activa|1|30.00",
  );
  esperarValor(
    "con Insignias activa un borrador (activar_campana_regla) sin ser líder (ADR-0534)",
    correr(`${PREPARAR}${OFERTA({ activar: "false" })}${MODULO_A_INTEGRANTE}${COMO_MICAELA}select retail.activar_campana_regla(:'r');\nselect estado from retail.campana_reglas where id = :'r';\nrollback;`),
    "activa",
  );
  esperarValor(
    "con Insignias cambia una oferta que ya rige sin ser líder (ADR-0534)",
    correr(`${PREPARAR}${OFERTA()}${MODULO_A_INTEGRANTE}${COMO_MICAELA}select retail.guardar_campana_regla(:'r', :'camp', 'ZZ cambio', 10, ${HOY}, ${HOY} + 3, null, '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], false);\nselect nombre || '|' || porcentaje from retail.campana_reglas where id = :'r';\nrollback;`),
    "ZZ cambio|10.00",
  );
  esperarValor(
    "con Insignias retira una oferta que ya rige sin ser líder (ADR-0534)",
    correr(`${PREPARAR}${OFERTA()}${MODULO_A_INTEGRANTE}${COMO_MICAELA}select retail.retirar_campana_regla(:'r');\nselect estado from retail.campana_reglas where id = :'r';\nrollback;`),
    "desactivada",
  );
  esperarError(
    "sin la llave de las campañas no activa un borrador (integrante sin módulo)",
    correr(`${PREPARAR}${OFERTA({ activar: "false" })}${COMO_MICAELA}select retail.activar_campana_regla(:'r');\nrollback;`),
    "módulo «Campañas»",
  );
  esperarError(
    "sin la llave de las campañas no retira una oferta que ya rige (integrante sin módulo)",
    correr(`${PREPARAR}${OFERTA()}${COMO_MICAELA}select retail.retirar_campana_regla(:'r');\nrollback;`),
    "módulo «Campañas»",
  );
  esperarValor(
    "con Insignias descarta su propio borrador",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE}${COMO_MICAELA}${OFERTA({ activar: "false" })}select retail.retirar_campana_regla(:'r');\nselect estado from retail.campana_reglas where id = :'r';\nrollback;`),
    "desactivada",
  );
  esperarValor(
    "con Insignias edita su borrador (sigue borrador)",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE}${COMO_MICAELA}${OFERTA({ activar: "false" })}select retail.guardar_campana_regla(:'r', :'camp', 'ZZ editada', 20, ${HOY}, ${HOY} + 3, null, '{}'::uuid[], '{}'::uuid[], false, '{}'::uuid[], false);\nselect estado || '|' || porcentaje from retail.campana_reglas where id = :'r';\nrollback;`),
    "borrador|20.00",
  );

  // ---------------------------------------------------------------- 7. Validaciones
  console.log("\n— Validaciones —");
  esperarError("un % de 0 se rechaza", correr(`${PREPARAR}${OFERTA({ pct: 0 })}rollback;`), "de 1 a 70");
  esperarError("un % de 71 se rechaza (tope de las ofertas)", correr(`${PREPARAR}${OFERTA({ pct: 71 })}rollback;`), "de 1 a 70");
  esperarError("el fin antes del inicio se rechaza", correr(`${PREPARAR}${OFERTA({ desde: `${HOY} + 3`, hasta: `${HOY} + 1` })}rollback;`), "empieza y cuándo termina");
  esperarError("empezar antes de hoy se rechaza", correr(`${PREPARAR}${OFERTA({ desde: `${HOY} - 1`, hasta: `${HOY} + 1` })}rollback;`), "antes de hoy");
  esperarError("salirse de las fechas de la campaña se rechaza", correr(`${PREPARAR}${OFERTA({ hasta: `${HOY} + 30` })}rollback;`), "dentro de las de la campaña");
  esperarError("sin ningún día se rechaza", correr(`${PREPARAR}${OFERTA({ dias: "'{}'::smallint[]" })}rollback;`), "al menos un día");
  esperarError("un día fuera de 1 a 7 se rechaza", correr(`${PREPARAR}${OFERTA({ dias: "array[8]::smallint[]" })}rollback;`), "del 1 (lunes) al 7");
  esperarError(
    "una oferta cuyos días nunca caen en sus fechas se rechaza (no regiría nunca)",
    correr(`${PREPARAR}${OFERTA({ desde: HOY, hasta: HOY, dias: "array[:dow_manana]::smallint[]" })}rollback;`),
    "no regiría nunca",
  );
  esperarError(
    "una categoría a la vez «solo» y «fuera» se rechaza",
    correr(`${PREPARAR}${OFERTA({ solo: "array[:'cat']::uuid[]", fuera: "array[:'cat']::uuid[]" })}rollback;`),
    "a la vez",
  );
  esperarError("una campaña que no es campaña se rechaza", correr(`${PREPARAR}insert into retail.etiquetas (nombre) values ('ZZ sello') returning id as sello \\gset
select retail.guardar_campana_regla(null, :'sello', 'ZZ', 10, ${HOY}, ${HOY} + 1, null, '{}', '{}', false, '{}'::uuid[], false);\nrollback;`), "ya no existe");
  esperarError(
    "una oferta retirada no se edita",
    correr(`${PREPARAR}${OFERTA()}select retail.retirar_campana_regla(:'r');\nselect retail.guardar_campana_regla(:'r', :'camp', 'ZZ', 10, ${HOY}, ${HOY} + 1, null, '{}', '{}', false, '{}'::uuid[], false);\nrollback;`),
    "ya se retiró",
  );

  // ---------------------------------------------------------------- 8. Candados de la tabla
  console.log("\n— Lo que la tabla no deja —");
  esperarError("la tabla rechaza un % de 80", correr(`${PREPARAR}insert into retail.campana_reglas (etiqueta_id, nombre, porcentaje, desde, hasta) values (:'camp', 'x', 80, ${HOY}, ${HOY});\nrollback;`), "campana_reglas_porcentaje");
  esperarError("la tabla rechaza días repetidos", correr(`${PREPARAR}insert into retail.campana_reglas (etiqueta_id, nombre, porcentaje, desde, hasta, dias_semana) values (:'camp', 'x', 20, ${HOY}, ${HOY}, array[2,2]::smallint[]);\nrollback;`), "campana_reglas_dias");
  esperarError("la tabla rechaza una oferta activa sin quién y cuándo la activó", correr(`${PREPARAR}insert into retail.campana_reglas (etiqueta_id, nombre, porcentaje, desde, hasta, estado) values (:'camp', 'x', 20, ${HOY}, ${HOY}, 'activa');\nrollback;`), "campana_reglas_activa_firmada");
  esperarError("la tabla rechaza un fin anterior al inicio", correr(`${PREPARAR}insert into retail.campana_reglas (etiqueta_id, nombre, porcentaje, desde, hasta) values (:'camp', 'x', 20, ${HOY}, ${HOY} - 1);\nrollback;`), "campana_reglas_fechas");
  esperar(
    "las tablas no se leen directo desde una sesión (solo por funciones)",
    (() => {
      const r = correr(`${PREPARAR}set local role authenticated;\nselect count(*) from retail.campana_reglas;\nrollback;`);
      return !r.ok && r.mensaje.includes("permission denied");
    })(),
  );
  // Lo que esta prueba NO miraba y costó una caída en producción (2026-10-23 a 24, 14 177 errores 42501): las tablas de arriba se cierran
  // a `authenticated`, así que quien las lee tiene que correr con permisos de dueño (`security definer`). Las demás pruebas llaman a
  // `fn_campanas_en_sede` como dueño de la base (solo cambian el `sub` del JWT), y como dueño siempre funciona: hay que preguntar con
  // el ROL de la sesión de la tienda, el mismo que usan Vender, Etiquetas de precio y Productos desde la web.
  esperarValor(
    "fn_campanas_en_sede responde a la sesión de la tienda (rol authenticated) y trae la oferta",
    correr(`${PREPARAR}${OFERTA()}${COMO_MICAELA}set local role authenticated;\nselect ${VE()};\nrollback;`),
    "1|30.00",
  );
  esperarValor(
    "fn_campanas_por_variante (que delega en ella) también responde con el rol authenticated",
    correr(`${PREPARAR}${OFERTA()}${COMO_MICAELA}set local role authenticated;
select count(*) || '|' || coalesce(max(descuento_pct), 0) from retail.fn_campanas_por_variante(${HOY}, 0, array[:'v1']::uuid[]) where etiqueta_id = :'camp';\nrollback;`),
    "1|30.00",
  );
  esperar(
    "ninguna función de la caja y la pantalla de ofertas depende de leer las tablas cerradas como invoker",
    (() => {
      const r = correr(`select string_agg(proname, ',' order by proname) from pg_proc p
        where p.pronamespace = 'retail'::regnamespace and not p.prosecdef
          and p.proname in ('fn_campanas_en_sede', 'campana_reglas', 'guardar_campana_regla', 'activar_campana_regla', 'retirar_campana_regla')
          and (pg_get_functiondef(p.oid) ~ 'campana_reglas|campana_regla_categorias|campana_regla_sedes|campana_regla_historial');`);
      return r.ok && ultimaLinea(r) === "";
    })(),
    "alguna función que lee las tablas de ofertas es security invoker",
  );

  // ---------------------------------------------------------------- 9. El historial y la pantalla
  console.log("\n— El historial y la pantalla —");
  esperarValor(
    "cambiar una oferta guarda cómo estaba y campana_reglas() lo dice",
    correr(`${PREPARAR}${OFERTA({ pct: 30 })}select retail.guardar_campana_regla(:'r', :'camp', 'ZZ nueva', 20, ${HOY}, ${HOY} + 3, null, '{}'::uuid[], array[:'cat_otra']::uuid[], false, '{}'::uuid[], false);
select cambios || '|' || (ultimo_cambio ->> 'porcentaje') || '|' || porcentaje || '|' || cardinality(categorias_fuera) from retail.campana_reglas() where id = :'r';
rollback;`),
    "1|30.00|20.00|1",
  );
  esperarValor(
    "campana_reglas() trae los días, el estado y las categorías «solo»",
    correr(`${PREPARAR}${OFERTA({ dias: "array[2,4]::smallint[]", hasta: `${HOY} + 9`, solo: "array[:'cat']::uuid[]", activar: "false" })}select estado || '|' || dias_semana::text || '|' || cardinality(categorias_solo) from retail.campana_reglas() where id = :'r';\nrollback;`),
    "borrador|{2,4}|1",
  );
  esperarValor(
    "activar_campana_regla guarda quién y cuándo, y una activa no se activa dos veces",
    correr(`${PREPARAR}${OFERTA({ activar: "false" })}select retail.activar_campana_regla(:'r');\nselect retail.activar_campana_regla(:'r');\nselect estado || '|' || (activada_por is not null)::text || '|' || (select count(*) from retail.campana_regla_historial where regla_id = :'r') from retail.campana_reglas where id = :'r';\nrollback;`),
    "activa|true|1",
  );

  // ---------------------------------------------------------------- 10. La migración
  console.log("\n— La migración —");
  esperar(
    "la migración se puede pegar dos veces",
    (() => {
      const r = correr(`begin;\n${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION, "utf8")}\nrollback;`);
      return r.ok;
    })(),
  );

  console.log(`\n${total - fallos} de ${total} bien.`);
  process.exit(fallos ? 1 : 0);
}

main();
