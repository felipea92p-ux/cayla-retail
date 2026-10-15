#!/usr/bin/env node
/**
 * Los looks de la tienda online (ADR-0408, actividad 11) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261015031000_vitrina_looks.sql` (Vitrina web ▸ Looks, el ERP) y `20261015032000_tienda_looks.sql` («Arma tu look»):
 *   1. Permisos: es el módulo `vitrina_web` (no otro): sin él no se lee, no se guarda ni se muestra; con él, una integrante guarda y
 *      firma ella. Las tablas no las lee nadie directo; las funciones del ERP son de las cuentas del ERP; `tienda_looks` y `tienda_look`,
 *      solo de `tienda_web`; las internas, de nadie.
 *   2. Guardar: 2 a 4 prendas sin repetir modelo, de un modelo que se vende y en un color con tallas activas; para mostrarlo, cada prenda
 *      tiene que verse en la web; el nombre no se repite; la versión frena a la segunda persona; sin cambios no escribe; cambiar las
 *      prendas las reemplaza en su lámina y deja en la Actividad cómo eran; el lugar se reparte de 1 a N sin huecos.
 *   3. Mostrar u ocultar desde la lista (ocultar no borra) y qué pasa cuando una prenda deja de verse o se elimina del catálogo.
 *   4. La tienda: solo los looks encendidos y completos, en su orden; el precio de CADA prenda es EXACTAMENTE el de `tienda_catalogo`
 *      para esa tienda (la de la sede elegida, el mayor con «Todas», la campaña encima) y el total es la suma; las tallas en su orden,
 *      con «hay» y nunca la cifra; nada del ERP.
 *   5. Mutantes: la prueba se pone roja si alguien cambia el precio por el de la grilla, si la tienda ignora la sede elegida o si se le
 *      quita a guardar o a mostrar el candado del módulo (cada mutante vive solo dentro de su transacción).
 *   6. Las migraciones se pueden volver a correr.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder) o Micaela (integrante de Trujillo): nunca se commitea
 * nada en el Postgres local que comparten los worktrees. Cada uno parte con la vitrina y los looks vacíos, sin campañas y sin tiendas en
 * la web; los que miran el precio por tienda muestran Trujillo y Lima.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261015031000_vitrina_looks.sql,supabase/migrations/20261015032000_tienda_looks.sql`
 * mete las migraciones (separadas por coma) dentro de cada transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: el seed («Blusa Emma» S/ 79.90 en BEI y NEG, S·M·L; «Falda Renata» S/ 74.90; «Vestido Sofía» S/ 149.90; «Pantalón Carla»
 * S/ 99.90 en 28·30·32·34; Felipe líder, Micaela integrante; Tienda Trujillo y Tienda Lima abiertas, con su almacén, piso y cuarentena), la
 * Vitrina web (20261014225000), las tiendas de la web (20261014231000) y el precio por tienda (`poner_precio_sede`).
 *
 * USO
 *   pnpm pruebas:vitrina-looks    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:vitrina-looks -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = ["supabase/migrations/20261015031000_vitrina_looks.sql", "supabase/migrations/20261015032000_tienda_looks.sql"];
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante, fija a Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  esperar(nombre, r.ok && r.salida === esperado, r.ok ? `dio «${r.salida}», se esperaba «${esperado}»` : r.mensaje);
}
function esperarError(nombre, r, contiene) {
  esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `no falló: ${r.salida}` : `falló distinto: ${r.mensaje}`);
}

// ---- El punto de partida de cada escenario: vitrina y looks vacíos, sin campañas, sin tiendas en la web y como Felipe ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
delete from retail.vitrina_looks;
delete from retail.vitrina_productos;
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select id as vestido from retail.productos where referencia = 'Vestido Sofía' \\gset
select id as carla from retail.productos where referencia = 'Pantalón Carla' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select retail.fn_hoy_lima() as hoy \\gset
`;
/** Las cuatro prendas del seed se ven en la web (el lote de la Vitrina: no pide versión). */
const EN_LA_VITRINA = `select retail.vitrina_mostrar(array[:'emma', :'falda', :'vestido', :'carla']::uuid[], true) \\gset\n`;
/** Trujillo y Lima se ven en la web (nombre, dirección y WhatsApp: lo que pide `fn_sede_web_falta`). */
const SEDES_EN_LA_WEB = `
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
`;
const EN_LA_BASE = `begin;\n${APLICAR_ANTES}\n`;
const COMO_MICAELA = `set local request.jwt.claim.sub = '${MICAELA}';\n`;
const COMO_FELIPE = `set local request.jwt.claim.sub = '${FELIPE}';\n`;
const MODULO_A_INTEGRANTE = `insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'vitrina_web');\n`;
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;

/** Las prendas de un look: [[variable psql del modelo, color], …]. */
const piezas = (...ps) => `jsonb_build_array(${ps.map(([p, c]) => `jsonb_build_object('producto_id', :'${p}', 'color', '${c}')`).join(", ")})`;
const TRES = piezas(["emma", "BEI"], ["falda", "NEG"], ["vestido", "AZM"]);
/** Guardar un look (la hoja). `id` y `version`: expresiones SQL («null», «:'look'», «(select …)»). */
const guardar = ({ id = "null", nombre = "ZZ Fin de semana", frase = "'Denim liviano y un básico blanco'", publicado = true, ps = TRES, lugar = "null", version = "null" } = {}) =>
  `retail.vitrina_guardar_look(${id}, '${nombre}', ${frase}, ${publicado}, ${ps}, ${lugar}, ${version})`;
/** Crea un look y deja su id en la variable psql `var`. */
const crear = (variable, opciones = {}) => `select (${guardar(opciones)}) ->> 'id' as ${variable} \\gset\n`;
const VERSION = (look) => `(select version from retail.vitrina_looks where id = :'${look}')`;
const mostrar = (look, publicado, version = VERSION(look)) => `retail.vitrina_mostrar_look(:'${look}', ${publicado}, ${version})`;
/** El precio propio de una tienda, por la única puerta (`poner_precio_sede`). */
const precioEnTienda = (prod, sede, precio) => `select retail.poner_precio_sede(:'${prod}', :'${sede}', ${precio}, 'Prueba de los looks') \\gset\n`;
/** Una campaña de prueba a nombre de Felipe (la base aprueba sola la etiqueta de un líder). Deja :etq. */
const campana = (nombre, pct) =>
  `insert into retail.etiquetas (nombre, estilo, activo, descuento_pct) values ('${nombre}', 'campana', true, ${pct}) returning id as etq \\gset\n`;
const aTodasLasTallas = (prod) =>
  `insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'${prod}' and v.activo;\n`;
const aUnColor = (prod, color) =>
  `insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'${prod}' and v.activo and v.color_codigo = '${color}';\n`;
/** Un look de la tienda (con «Todas» o con la tienda `sede`, una variable psql). */
const EN_TIENDA = (look, sede = null) =>
  `(select x from jsonb_array_elements(retail.tienda_looks(${sede ? `:'${sede}'` : "null"}) -> 'looks') x where x ->> 'id' = :'${look}')`;
/** La pieza de un modelo dentro de un look de la tienda. */
const PIEZA = (look, prod, sede = null) =>
  `(select pz from jsonb_array_elements(${EN_TIENDA(look, sede)} -> 'piezas') pz where pz -> 'prenda' ->> 'id' = :'${prod}')`;
const ACTIVIDAD = `(select count(*) from retail.actividad where modulo = 'vitrina_web' and tabla = 'vitrina_looks')`;

/**
 * EL CANDADO DEL PRECIO: cuántas prendas de los looks de la tienda NO valen exactamente lo que dice `tienda_catalogo` para esa misma tienda
 * (precio, precio final, «desde» y campaña), más los looks cuyo total no es la suma. Tiene que dar 0. `|N` al final: cuántas prendas se
 * compararon (si fueran 0 la prueba no probaría nada).
 */
const DIFERENCIAS = (sede = null) => {
  const s = sede ? `:'${sede}'` : "null";
  return `(select concat_ws('|',
      (select count(*) from jsonb_array_elements(retail.tienda_looks(${s}) -> 'looks') l
         cross join jsonb_array_elements(l -> 'piezas') pz
         left join lateral (select c from jsonb_array_elements(retail.tienda_catalogo(${s}) -> 'prendas') c where c ->> 'id' = pz -> 'prenda' ->> 'id') k on true
        where k.c is null
           or (pz -> 'prenda' -> 'precio') is distinct from (k.c -> 'precio')
           or (pz -> 'prenda' -> 'precio_final') is distinct from (k.c -> 'precio_final')
           or (pz -> 'prenda' -> 'desde') is distinct from (k.c -> 'desde')
           or (pz -> 'prenda' -> 'campana') is distinct from (k.c -> 'campana'))
      + (select count(*) from jsonb_array_elements(retail.tienda_looks(${s}) -> 'looks') l
          where (l ->> 'total_final')::numeric <> (select sum((pz -> 'prenda' ->> 'precio_final')::numeric) from jsonb_array_elements(l -> 'piezas') pz)
             or (l ->> 'total')::numeric <> (select sum((pz -> 'prenda' ->> 'precio')::numeric) from jsonb_array_elements(l -> 'piezas') pz)),
      (select count(*) from jsonb_array_elements(retail.tienda_looks(${s}) -> 'looks') l cross join jsonb_array_elements(l -> 'piezas') pz)))`;
};
/** El escenario del precio: Lima cobra más la blusa, Trujillo menos la falda, el vestido con campaña y la falda negra con otra. */
const ESCENA_PRECIOS = `${SEDES_EN_LA_WEB}${EN_LA_VITRINA}
${precioEnTienda("emma", "lim", "89.90")}${precioEnTienda("falda", "tru", "69.90")}
${campana("ZZ Aniversario", 10)}${aTodasLasTallas("vestido")}${campana("ZZ Negro", 20)}${aUnColor("falda", "NEG")}
${crear("look")}${crear("look2", { nombre: "ZZ Noche", ps: piezas(["vestido", "NEG"], ["carla", "BEI"]) })}`;

/** Reemplaza un texto en la definición viva de una función, dentro de la transacción (un mutante). Falla si no encuentra el texto. */
const MUTAR = (firma, de, a) => `
do $m$
declare d text;
begin
  d := pg_get_functiondef('${firma}'::regprocedure);
  if position($q$${de}$q$ in d) = 0 then
    raise exception 'mutante: no encontré el texto a cambiar en ${firma}';
  end if;
  execute replace(d, $q$${de}$q$, $q$${a}$q$);
end $m$;
`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.tienda_look(uuid, uuid)') is not null and to_regprocedure('retail.fn_vitrina_looks()') is not null;");
    if (hay.salida !== "t") {
      console.error(`Faltan los looks: aplica ${MIGRACIONES.join(" y ")} o corre con APLICAR_ANTES=${MIGRACIONES.join(",")}`);
      process.exit(2);
    }
  }

  // ---------------------------------------------------------------- 1. Permisos
  console.log("— Permisos —");
  for (const [que, sql] of [
    ["leer los looks", `select retail.fn_vitrina_looks();`],
    ["guardar un look", `select ${guardar()};`],
    ["mostrar un look", `${COMO_FELIPE}${crear("look")}${COMO_MICAELA}select ${mostrar("look", false)};`],
  ]) {
    esperarError(`sin el módulo «Vitrina web» no se puede ${que}`, correr(`${PREPARAR}${EN_LA_VITRINA}${COMO_MICAELA}${sql}\nrollback;`), "vitrina_web_sin_modulo");
  }
  esperarValor(
    "con el módulo en su rol, la integrante guarda y firma ella (en el look y en la Actividad)",
    correr(`${PREPARAR}${EN_LA_VITRINA}${MODULO_A_INTEGRANTE}${COMO_MICAELA}${crear("look")}
      select concat_ws('|', (select p.nombres from public.personas p join retail.vitrina_looks l on l.actualizado_por = p.id where l.id = :'look'),
          (select p.nombres from retail.actividad a join public.personas p on p.id = a.persona_id where a.tabla = 'vitrina_looks' and a.registro_id = :'look'));
      rollback;`),
    "Micaela|Micaela",
  );
  esperarValor(
    "nadie lee ni escribe las tablas directo (ni el ERP, ni un visitante, ni la tienda)",
    correr(`${EN_LA_BASE}select concat_ws('|',
        has_table_privilege('authenticated', 'retail.vitrina_looks', 'SELECT'), has_table_privilege('authenticated', 'retail.vitrina_look_piezas', 'SELECT'),
        has_table_privilege('anon', 'retail.vitrina_looks', 'SELECT'), has_table_privilege('tienda_web', 'retail.vitrina_looks', 'SELECT'),
        has_table_privilege('tienda_web', 'retail.vitrina_look_piezas', 'SELECT'),
        has_table_privilege('authenticated', 'retail.vitrina_looks', 'INSERT, UPDATE, DELETE'),
        has_table_privilege('authenticated', 'retail.vitrina_look_piezas', 'INSERT, UPDATE, DELETE'),
        (select bool_and(relrowsecurity) from pg_class where oid in ('retail.vitrina_looks'::regclass, 'retail.vitrina_look_piezas'::regclass)));\nrollback;`),
    "f|f|f|f|f|f|f|t",
  );
  esperarValor(
    "las funciones del ERP son de las cuentas del ERP: ni un visitante ni la tienda las llaman",
    correr(`${EN_LA_BASE}select concat_ws('|',
        bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')), bool_or(has_function_privilege('tienda_web', p.oid, 'EXECUTE')),
        bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')), count(*))
      from pg_proc p where p.oid in ('retail.fn_vitrina_looks()'::regprocedure,
        'retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer)'::regprocedure,
        'retail.vitrina_mostrar_look(uuid, boolean, integer)'::regprocedure);\nrollback;`),
    "f|f|t|3",
  );
  esperarValor(
    "«Arma tu look» es solo de tienda_web (security definer, con su search_path), y las piezas internas no las llama nadie",
    correr(`${EN_LA_BASE}select concat_ws('|',
        (select bool_and(has_function_privilege('tienda_web', p.oid, 'EXECUTE') and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                         and not has_function_privilege('anon', p.oid, 'EXECUTE') and p.prosecdef
                         and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\\_path=%'))
           from pg_proc p where p.oid in ('retail.tienda_looks(uuid)'::regprocedure, 'retail.tienda_look(uuid, uuid)'::regprocedure)),
        (select bool_or(has_function_privilege(r, p.oid, 'EXECUTE'))
           from pg_proc p cross join unnest(array['authenticated', 'anon', 'tienda_web']) r
          where p.oid in ('retail.fn_vitrina_looks_json(uuid[], jsonb)'::regprocedure, 'retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean)'::regprocedure,
                          'retail.fn_vitrina_look_se_ve(jsonb, uuid, text)'::regprocedure, 'retail.fn_vitrina_look_lamina(integer, integer)'::regprocedure,
                          'retail.fn_vitrina_look_anotar(text, text, uuid, uuid, jsonb)'::regprocedure)));\nrollback;`),
    "t|f",
  );
  esperarValor(
    "el módulo sigue siendo uno solo (Vitrina web), nace sin rol y ahora dice que arma los looks",
    correr(`${EN_LA_BASE}select concat_ws('|', (select count(*) from retail.modulos where clave like '%look%'),
        (select incluye like '%«Arma tu look»%' from retail.modulos where clave = 'vitrina_web'));\nrollback;`),
    "0|t",
  );

  // ---------------------------------------------------------------- 2. Guardar
  console.log("— Crear y editar —");
  esperarValor(
    "un look nuevo: 3 prendas en su orden, la lámina de 3 de la maqueta, al final de la lista, versión 1, se ve y su total con «Todas»",
    correr(`${PREPARAR}${EN_LA_VITRINA}select (${guardar()}) as l \\gset
      select concat_ws('|', :'l'::jsonb ->> 'nombre', :'l'::jsonb ->> 'frase', :'l'::jsonb ->> 'lugar', :'l'::jsonb ->> 'version',
          :'l'::jsonb ->> 'publicado', :'l'::jsonb ->> 'se_ve', :'l'::jsonb ->> 'faltan', :'l'::jsonb ->> 'total',
          (select string_agg(p ->> 'nombre' || ':' || (p -> 'color' ->> 'codigo'), ',' order by (p ->> 'posicion')::int) from jsonb_array_elements(:'l'::jsonb -> 'piezas') p));
      select string_agg(concat_ws(',', posicion, x::text, y::text, ancho::text, giro::text), ' ' order by posicion)
        from retail.vitrina_look_piezas where look_id = (:'l'::jsonb ->> 'id')::uuid;
      rollback;`),
    "ZZ Fin de semana|Denim liviano y un básico blanco|1|1|true|true|0|304.70|Blusa Emma:BEI,Falda Renata:NEG,Vestido Sofía:AZM\n1,6.00,4.00,50.00,-5.0 2,46.00,15.00,47.00,4.0 3,13.00,57.00,35.00,-6.0",
  );
  esperarValor(
    "la lámina de 2 y la de 4 también son las de la maqueta",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("dos", { nombre: "ZZ Dos", ps: piezas(["emma", "NEG"], ["carla", "BEI"]) })}
      ${crear("cuatro", { nombre: "ZZ Cuatro", ps: piezas(["emma", "NEG"], ["falda", "BEI"], ["vestido", "NEG"], ["carla", "NEG"]) })}
      select string_agg(concat_ws(',', posicion, x::int, y::int, ancho::int, giro::int), ' ' order by posicion) from retail.vitrina_look_piezas where look_id = :'dos';
      select string_agg(concat_ws(',', posicion, x::int, y::int, ancho::int, giro::int), ' ' order by posicion) from retail.vitrina_look_piezas where look_id = :'cuatro';
      rollback;`),
    "1,8,4,56,-4 2,54,44,40,7\n1,4,3,46,-6 2,50,3,42,5 3,34,37,44,-2 4,5,60,33,6",
  );
  esperarValor(
    "el nombre y la frase se guardan limpios (sin espacios de más); sin frase queda vacía",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look", { nombre: "  ZZ   Café   con amigas ", frase: "null" })}
      select concat_ws('|', nombre, coalesce(frase, 'sin frase')) from retail.vitrina_looks where id = :'look';
      rollback;`),
    "ZZ Café con amigas|sin frase",
  );
  for (const [caso, opciones, contiene] of [
    ["sin nombre", { nombre: "   " }, "vitrina_look_datos_invalidos"],
    ["con un nombre de más de 60 letras", { nombre: "Z".repeat(61) }, "vitrina_look_datos_invalidos"],
    ["con una frase de más de 200 letras", { frase: `'${"z".repeat(201)}'` }, "vitrina_look_datos_invalidos"],
    ["con una sola prenda", { ps: piezas(["emma", "BEI"]) }, "Un look lleva de 2 a 4 prendas"],
    ["con cinco prendas", { ps: piezas(["emma", "BEI"], ["falda", "NEG"], ["vestido", "AZM"], ["carla", "BEI"], ["emma", "NEG"]) }, "Un look lleva de 2 a 4 prendas"],
    ["con el mismo modelo dos veces (aunque sea en otro color)", { ps: piezas(["emma", "BEI"], ["emma", "NEG"]) }, "Cada modelo va una sola vez"],
    ["con una prenda sin color", { ps: `jsonb_build_array(jsonb_build_object('producto_id', :'emma'), jsonb_build_object('producto_id', :'falda', 'color', 'NEG'))` }, "llegó incompleta"],
    ["con prendas que no son una lista", { ps: `'{"a": 1}'::jsonb` }, "Un look lleva de 2 a 4 prendas"],
    ["en el lugar 0", { lugar: 0 }, "vitrina_look_datos_invalidos"],
    ["con una prenda que no existe", { ps: `jsonb_build_array(jsonb_build_object('producto_id', gen_random_uuid(), 'color', 'NEG'), jsonb_build_object('producto_id', :'falda', 'color', 'NEG'))` }, "vitrina_look_prenda_no_existe"],
    ["con un color que la prenda no tiene", { ps: piezas(["emma", "ROS"], ["falda", "NEG"]) }, "vitrina_look_prenda_invalida"],
    ["nuevo con una versión (otra pantalla)", { version: 3 }, "vitrina_look_cambio_otro"],
  ]) {
    esperarError(`no se guarda un look ${caso}`, correr(`${PREPARAR}${EN_LA_VITRINA}select ${guardar(opciones)};\nrollback;`), contiene);
  }
  esperarError(
    "no se guarda un look con una prenda descontinuada",
    correr(`${PREPARAR}${EN_LA_VITRINA}update retail.productos set estado = 'descontinuado' where id = :'falda';\nselect ${guardar()};\nrollback;`),
    "vitrina_look_prenda_invalida",
  );
  esperarError(
    "no se muestra un look con una prenda que no se ve en la web (oculta en la Vitrina)",
    correr(`${PREPARAR}${EN_LA_VITRINA}select retail.vitrina_mostrar(array[:'falda']::uuid[], false) \\gset\nselect ${guardar()};\nrollback;`),
    "vitrina_look_prenda_no_se_ve",
  );
  esperarValor(
    "…pero se puede guardar oculto (para mostrarlo cuando la prenda se vea), y la pantalla dice cuál no se ve",
    correr(`${PREPARAR}${EN_LA_VITRINA}select retail.vitrina_mostrar(array[:'falda']::uuid[], false) \\gset
      select (${guardar({ publicado: false })}) as l \\gset
      select concat_ws('|', :'l'::jsonb ->> 'publicado', :'l'::jsonb ->> 'se_ve', coalesce(:'l'::jsonb ->> 'total', 'sin total'),
          (select string_agg(p ->> 'nombre', ',') from jsonb_array_elements(:'l'::jsonb -> 'piezas') p where not (p ->> 'se_ve')::boolean));
      rollback;`),
    "false|false|sin total|Falda Renata",
  );
  esperarError(
    "dos looks no se llaman igual (sin mayúsculas ni tildes)",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("a", { nombre: "ZZ Café" })}select ${guardar({ nombre: "zz  cafe" })};\nrollback;`),
    "vitrina_look_nombre_repetido",
  );
  esperarError(
    "renombrar a un nombre que ya tiene otro look tampoco",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("a", { nombre: "ZZ Café" })}${crear("b", { nombre: "ZZ Noche" })}
      select ${guardar({ id: ":'b'", nombre: "ZZ CAFÉ", version: VERSION("b") })};\nrollback;`),
    "vitrina_look_nombre_repetido",
  );
  esperarError(
    "dos personas con el mismo look abierto: la segunda (con la versión vieja) no pisa a la primera",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      select ${guardar({ id: ":'look'", nombre: "ZZ Primera", version: 1 })} \\gset
      select ${guardar({ id: ":'look'", nombre: "ZZ Segunda", version: 1 })};\nrollback;`),
    "vitrina_look_cambio_otro",
  );
  esperarError(
    "editar un look que ya no existe",
    correr(`${PREPARAR}${EN_LA_VITRINA}select ${guardar({ id: "gen_random_uuid()", version: 1 })};\nrollback;`),
    "vitrina_look_no_existe",
  );
  esperarValor(
    "guardar sin cambios no escribe ni anota nada",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}select ${ACTIVIDAD} as antes \\gset
      select ${guardar({ id: ":'look'", version: 1 })} \\gset
      select concat_ws('|', ${VERSION("look")}, ${ACTIVIDAD} - :antes);
      rollback;`),
    "1|0",
  );
  esperarValor(
    "cambiar las prendas las reemplaza en la lámina de su nuevo número, sube la versión y la Actividad guarda cómo eran",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      select ${guardar({ id: ":'look'", ps: piezas(["carla", "NEG"], ["emma", "NEG"]), version: 1 })} \\gset
      select concat_ws('|', ${VERSION("look")}, (select piezas from retail.vitrina_looks where id = :'look'),
          (select string_agg(pz.posicion || ':' || p.referencia || ':' || pz.color_codigo || ':' || pz.x::int, ',' order by pz.posicion)
             from retail.vitrina_look_piezas pz join retail.productos p on p.id = pz.producto_id where pz.look_id = :'look'));
      select concat_ws('|', a.accion, a.descripcion, jsonb_array_length(a.detalle -> 'piezas_antes'), jsonb_array_length(a.detalle -> 'piezas'))
        from retail.actividad a where a.tabla = 'vitrina_looks' and a.registro_id = :'look' order by a.id desc limit 1;
      rollback;`),
    "2|2|1:Pantalón Carla:NEG:8,2:Blusa Emma:NEG:54\nvitrina_look_guardado|«ZZ Fin de semana»: cambió sus prendas (2)|3|2",
  );
  esperarValor(
    "crear deja su línea en la Actividad con quién y qué",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      select concat_ws('|', a.accion, a.descripcion, (select p.nombres from public.personas p where p.id = a.persona_id))
        from retail.actividad a where a.tabla = 'vitrina_looks' and a.registro_id = :'look';
      rollback;`),
    "vitrina_look_creado|creó el look «ZZ Fin de semana» con 3 prendas · se ve en la web|Felipe",
  );

  console.log("— El lugar en «Arma tu look» —");
  esperarValor(
    "los nuevos van al final; pedir el lugar 1 corre a los demás sin huecos y no les sube la versión",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("a", { nombre: "ZZ A" })}${crear("b", { nombre: "ZZ B" })}${crear("c", { nombre: "ZZ C" })}
      select string_agg(nombre || '=' || orden, ',' order by orden) from retail.vitrina_looks;
      select ${guardar({ id: ":'c'", nombre: "ZZ C", lugar: 1, version: 1 })} \\gset
      select string_agg(nombre || '=' || orden || 'v' || version, ',' order by orden) from retail.vitrina_looks;
      select descripcion from retail.actividad where tabla = 'vitrina_looks' and registro_id = :'c' order by id desc limit 1;
      rollback;`),
    "ZZ A=1,ZZ B=2,ZZ C=3\nZZ C=1v1,ZZ A=2v1,ZZ B=3v1\n«ZZ C»: pasó al lugar 1",
  );
  esperarValor(
    "un lugar más allá del último queda último; nuevo en el lugar 2 entra ahí",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("a", { nombre: "ZZ A" })}${crear("b", { nombre: "ZZ B" })}
      select ${guardar({ id: ":'a'", nombre: "ZZ A", lugar: 9, version: 1 })} \\gset
      ${crear("c", { nombre: "ZZ C", lugar: 2 })}
      select string_agg(nombre || '=' || orden, ',' order by orden) from retail.vitrina_looks;
      select string_agg(x ->> 'nombre' || '=' || (x ->> 'lugar'), ',' order by (x ->> 'lugar')::int) from jsonb_array_elements(retail.fn_vitrina_looks() -> 'looks') x;
      rollback;`),
    "ZZ B=1,ZZ C=2,ZZ A=3\nZZ B=1,ZZ C=2,ZZ A=3",
  );

  // ---------------------------------------------------------------- 3. Mostrar u ocultar
  console.log("— Mostrar u ocultar —");
  esperarValor(
    "ocultar no borra (el look y sus prendas siguen), sube la versión y lo anota; volver a mostrarlo también",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      select ${mostrar("look", false)} \\gset
      select concat_ws('|', (select publicado from retail.vitrina_looks where id = :'look'), (select count(*) from retail.vitrina_look_piezas where look_id = :'look'), ${VERSION("look")});
      select ${mostrar("look", true)} \\gset
      select concat_ws('|', (select publicado from retail.vitrina_looks where id = :'look'), ${VERSION("look")},
          (select string_agg(accion, ',' order by id) from retail.actividad where tabla = 'vitrina_looks' and registro_id = :'look'));
      rollback;`),
    "f|3|2\nt|3|vitrina_look_creado,vitrina_look_ocultado,vitrina_look_mostrado",
  );
  esperarValor(
    "mostrar lo que ya se ve no escribe nada",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}select ${ACTIVIDAD} as antes \\gset
      select ${mostrar("look", true)} \\gset
      select concat_ws('|', ${VERSION("look")}, ${ACTIVIDAD} - :antes);
      rollback;`),
    "1|0",
  );
  esperarError(
    "mostrar con la versión vieja: otra persona ya lo cambió",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look", { publicado: false })}select ${mostrar("look", true)} \\gset\nselect ${mostrar("look", false, 1)};\nrollback;`),
    "vitrina_look_cambio_otro",
  );
  esperarError(
    "no se muestra si una prenda dejó de verse en la web",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look", { publicado: false })}
      select retail.vitrina_mostrar(array[:'vestido']::uuid[], false) \\gset
      select ${mostrar("look", true)};\nrollback;`),
    "vitrina_look_prenda_no_se_ve",
  );
  esperarValor(
    "una prenda que se oculta en la Vitrina saca el look de la tienda; el ERP dice cuál; al volver a mostrarla, el look vuelve",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      select retail.vitrina_mostrar(array[:'vestido']::uuid[], false) \\gset
      select concat_ws('|', jsonb_array_length(retail.tienda_looks() -> 'looks'), coalesce(retail.tienda_look(:'look') ->> 'look', 'null'),
          (select concat_ws(',', x ->> 'publicado', x ->> 'se_ve', (select string_agg(p ->> 'nombre', '+') from jsonb_array_elements(x -> 'piezas') p where not (p ->> 'se_ve')::boolean))
             from jsonb_array_elements(retail.fn_vitrina_looks() -> 'looks') x where x ->> 'id' = :'look'));
      select retail.vitrina_mostrar(array[:'vestido']::uuid[], true) \\gset
      select jsonb_array_length(retail.tienda_looks() -> 'looks');
      rollback;`),
    "0|null|true,false,Vestido Sofía\n1",
  );
  esperarValor(
    "un color que se apaga (sus tallas inactivas) también saca el look; un modelo descontinuado, igual",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      delete from retail.stock where variante_id in (select id from retail.variantes where producto_id = :'falda' and color_codigo = 'NEG');
      update retail.variantes set activo = false where producto_id = :'falda' and color_codigo = 'NEG';
      select jsonb_array_length(retail.tienda_looks() -> 'looks');
      update retail.variantes set activo = true where producto_id = :'falda' and color_codigo = 'NEG';
      update retail.productos set estado = 'descontinuado' where id = :'emma';
      select jsonb_array_length(retail.tienda_looks() -> 'looks');
      rollback;`),
    "0\n0",
  );
  // «ZZ Virgen»: una prenda sin historia (nunca se movió), la única que `eliminar_producto` deja eliminar.
  const CON_VIRGEN_ELIMINADA = `${PREPARAR}${EN_LA_VITRINA}
      select categoria_id as cat, marca_id as marca, proveedor_id as prov from retail.productos where id = :'emma' \\gset
      select talla_id as t1 from retail.variantes where producto_id = :'emma' order by sku limit 1 \\gset
      insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('ZZ Virgen', :'cat', :'marca', :'prov') returning id as virgen \\gset
      insert into retail.variantes (producto_id, sku, precio, talla_id, color_codigo) values (:'virgen', 'ZZ-VIRGEN-1', 50, :'t1', 'NEG');
      select retail.vitrina_mostrar(array[:'virgen']::uuid[], true) \\gset
      ${crear("look", { ps: piezas(["virgen", "NEG"], ["falda", "NEG"]) })}
      select retail.eliminar_producto(:'virgen') \\gset
  `;
  esperarValor(
    "una prenda eliminada del catálogo se va con su ficha: al look le falta una y la tienda no lo muestra",
    correr(`${CON_VIRGEN_ELIMINADA}
      select concat_ws('|', (select count(*) from retail.vitrina_look_piezas where look_id = :'look'),
          (select concat_ws(',', x ->> 'faltan', x ->> 'se_ve', x ->> 'publicado') from jsonb_array_elements(retail.fn_vitrina_looks() -> 'looks') x where x ->> 'id' = :'look'),
          jsonb_array_length(retail.tienda_looks() -> 'looks'));
      rollback;`),
    "1|1,false,true|0",
  );
  esperarError(
    "…y no se puede volver a mostrar hasta que le pongan otra prenda",
    correr(`${CON_VIRGEN_ELIMINADA}
      select ${mostrar("look", false)} \\gset
      select ${mostrar("look", true)};
      rollback;`),
    "vitrina_look_incompleto",
  );

  // ---------------------------------------------------------------- 4. La tienda
  console.log("— «Arma tu look» en la tienda —");
  esperarValor(
    "solo los looks encendidos y completos, en su orden, con «Look N de M»",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("a", { nombre: "ZZ A" })}${crear("b", { nombre: "ZZ B", publicado: false })}${crear("c", { nombre: "ZZ C" })}
      select string_agg(x ->> 'nombre' || ':' || (x ->> 'numero') || '/' || (x ->> 'de'), ',' order by o) from jsonb_array_elements(retail.tienda_looks() -> 'looks') with ordinality t(x, o);
      select concat_ws('|', retail.tienda_look(:'c') -> 'look' ->> 'numero', retail.tienda_look(:'c') -> 'look' ->> 'de', coalesce(retail.tienda_look(:'b') ->> 'look', 'null'),
          coalesce(retail.tienda_look(gen_random_uuid()) ->> 'look', 'null'), coalesce(retail.tienda_look(null) ->> 'look', 'null'));
      rollback;`),
    "ZZ A:1/2,ZZ C:2/2\n2|2|null|null|null",
  );
  esperarValor(
    "EL PRECIO: cada prenda vale exactamente lo de tienda_catalogo en esa tienda, con «Todas», con Trujillo y con Lima, y el total es la suma",
    correr(`${PREPARAR}${ESCENA_PRECIOS}
      select ${DIFERENCIAS()};
      select ${DIFERENCIAS("tru")};
      select ${DIFERENCIAS("lim")};
      rollback;`),
    "0|5\n0|5\n0|5",
  );
  esperarValor(
    "…y el escenario sí distingue las tiendas: la blusa vale más en Lima (y con «Todas»), la falda menos en Trujillo",
    correr(`${PREPARAR}${ESCENA_PRECIOS}
      select concat_ws('|', ${PIEZA("look", "emma")} -> 'prenda' ->> 'precio', ${PIEZA("look", "emma", "tru")} -> 'prenda' ->> 'precio',
          ${PIEZA("look", "emma", "lim")} -> 'prenda' ->> 'precio', ${PIEZA("look", "falda")} -> 'prenda' ->> 'precio',
          ${PIEZA("look", "falda", "tru")} -> 'prenda' ->> 'precio', ${PIEZA("look", "falda", "lim")} -> 'prenda' ->> 'precio');
      select concat_ws('|', retail.tienda_looks(:'tru') ->> 'sede' = :'tru', coalesce(retail.tienda_looks() ->> 'sede', 'todas'),
          coalesce(retail.tienda_looks(gen_random_uuid()) ->> 'sede', 'todas'));
      rollback;`),
    "89.90|79.90|89.90|74.90|69.90|74.90\nt|todas|todas",
  );
  esperarValor(
    "la campaña va encima con la regla de la caja (el vestido −10 %), la de un solo color dice «desde» y el total también",
    correr(`${PREPARAR}${ESCENA_PRECIOS}
      select concat_ws('|', (${PIEZA("look", "vestido")} -> 'prenda' ->> 'precio_final')::numeric = 149.90 - retail.fn_descuento_campana(149.90, 10),
          ${PIEZA("look", "vestido")} -> 'prenda' -> 'campana' ->> 'nombre', ${PIEZA("look", "falda")} -> 'prenda' ->> 'desde',
          ${EN_TIENDA("look")} ->> 'desde', ${EN_TIENDA("look2")} ->> 'desde');
      rollback;`),
    "t|ZZ Aniversario|true|true|false",
  );
  esperarValor(
    "la lámina viaja a la tienda (x, y, ancho, giro) con el color de cada prenda y su foto (la de su color o la principal)",
    correr(`${PREPARAR}${EN_LA_VITRINA}
      insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo) values
        (:'emma', 'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/emma-neg.jpg', 1, true, 'NEG'),
        (:'falda', 'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/falda-neg.jpg', 1, false, 'NEG'),
        (:'falda', 'https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/falda.jpg', 0, true, null);
      ${crear("look")}
      select string_agg(concat_ws(',', pz ->> 'posicion', (pz ->> 'x')::numeric::int, (pz ->> 'giro')::numeric::int, pz -> 'color' ->> 'codigo',
            pz -> 'color' ->> 'nombre', regexp_replace(coalesce(pz ->> 'foto', 'sin foto'), '^.*/', '')), ' ' order by (pz ->> 'posicion')::int)
        from jsonb_array_elements(${EN_TIENDA("look")} -> 'piezas') pz;
      rollback;`),
    "1,6,-5,BEI,Beige,emma-neg.jpg 2,46,4,NEG,Negro,falda-neg.jpg 3,13,-6,AZM,Azul marino,sin foto",
  );
  esperarValor(
    "las tallas de cada prenda en su orden (letras y números), con «hay» según lo disponible en las tiendas de la web",
    correr(`${PREPARAR}${SEDES_EN_LA_WEB}${EN_LA_VITRINA}
      select id as sub_alm_tru from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
      select id as sub_piso_lim from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
      select id as sub_cua_lim from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'cuarentena' \\gset
      select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
      delete from retail.stock where variante_id in (select id from retail.variantes where producto_id in (:'emma', :'carla'));
      -- Blusa Emma beige: S libre en el almacén de Trujillo; M toda apartada en el piso de Lima; L solo en la cuarentena de Lima y en el Taller.
      insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
        select v.id, :'tru'::uuid, :'sub_alm_tru'::uuid, 1, 0 from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = 'BEI' and t.valor = 'S'
        union all select v.id, :'lim'::uuid, :'sub_piso_lim'::uuid, 2, 2 from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = 'BEI' and t.valor = 'M'
        union all select v.id, :'lim'::uuid, :'sub_cua_lim'::uuid, 3, 0 from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = 'BEI' and t.valor = 'L'
        union all select v.id, :'taller'::uuid, null::uuid, 5, 0 from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = 'BEI' and t.valor = 'L'
        union all select v.id, :'lim'::uuid, :'sub_piso_lim'::uuid, 1, 0 from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'carla' and v.color_codigo = 'BEI' and t.valor = '32';
      ${crear("look", { ps: piezas(["emma", "BEI"], ["carla", "BEI"]) })}
      select string_agg((select string_agg(ta ->> 'talla' || '=' || (ta ->> 'hay'), ',' order by o) from jsonb_array_elements(pz -> 'tallas') with ordinality u(ta, o)), ' ' order by (pz ->> 'posicion')::int)
        from jsonb_array_elements(retail.tienda_look(:'look') -> 'look' -> 'piezas') pz;
      -- Lima sale de la web: lo de Lima ya no cuenta.
      update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
      select (select string_agg(ta ->> 'talla' || '=' || (ta ->> 'hay'), ',' order by o) from jsonb_array_elements(pz -> 'tallas') with ordinality u(ta, o))
        from jsonb_array_elements(retail.tienda_look(:'look') -> 'look' -> 'piezas') pz where (pz ->> 'posicion')::int = 2;
      rollback;`),
    "S=true,M=false,L=false 28=false,30=false,32=true,34=false\n28=false,30=false,32=false,34=false",
  );
  esperarValor(
    "cada talla trae su variante (la de ese modelo, color y talla) para que la bolsa sepa qué agregar",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      select count(*) filter (where v.id is null) || '|' || count(*)
        from jsonb_array_elements(retail.tienda_look(:'look') -> 'look' -> 'piezas') pz
        cross join jsonb_array_elements(pz -> 'tallas') ta
        left join retail.variantes v on v.id = (ta ->> 'variante_id')::uuid and v.producto_id = (pz -> 'prenda' ->> 'id')::uuid
             and v.color_codigo = pz -> 'color' ->> 'codigo' and v.activo;
      rollback;`),
    "0|9",
  );
  esperarValor(
    "nada del ERP ni la cifra del stock en lo que ve la tienda",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      select string_agg(k, ',' order by k) from jsonb_object_keys(retail.tienda_look(:'look') -> 'look') k;
      select string_agg(distinct k, ',' order by k) from jsonb_array_elements(retail.tienda_look(:'look') -> 'look' -> 'piezas') pz, jsonb_object_keys(pz) k;
      select string_agg(distinct k, ',' order by k) from jsonb_array_elements(retail.tienda_look(:'look') -> 'look' -> 'piezas') pz, jsonb_object_keys(pz -> 'prenda') k;
      select string_agg(distinct k, ',' order by k) from jsonb_array_elements(retail.tienda_look(:'look') -> 'look' -> 'piezas') pz, jsonb_array_elements(pz -> 'tallas') ta, jsonb_object_keys(ta) k;
      select string_agg(distinct k, ',' order by k) from jsonb_array_elements(retail.tienda_looks() -> 'looks') l, jsonb_array_elements(l -> 'piezas') pz, jsonb_object_keys(pz) k;
      rollback;`),
    [
      "de,desde,frase,id,nombre,numero,piezas,total,total_final",
      "ancho,color,foto,giro,posicion,prenda,tallas,x,y",
      "campana,categoria,desde,id,nombre,precio,precio_final",
      "hay,talla,variante_id",
      "ancho,color,foto,giro,posicion,prenda,x,y",
    ].join("\n"),
  );
  esperarValor(
    "como tienda_web: los looks responden (con «Todas» y con una tienda) y las tablas y el guardar se niegan",
    correr(`${PREPARAR}${SEDES_EN_LA_WEB}${EN_LA_VITRINA}${crear("look")}
      ${COMO_TIENDA}select concat_ws('|', jsonb_array_length(retail.tienda_looks() -> 'looks'), jsonb_array_length(retail.tienda_looks(:'tru') -> 'looks'),
          retail.tienda_look(:'look', :'lim') -> 'look' ->> 'nombre');
      rollback;`),
    "1|1|ZZ Fin de semana",
  );
  for (const [que, sql] of [
    ["leer los looks directo", "select count(*) from retail.vitrina_looks;"],
    ["leer las prendas directo", "select count(*) from retail.vitrina_look_piezas;"],
    ["guardar un look", `select ${guardar()};`],
  ]) {
    esperarError(`como tienda_web, ${que} se niega`, correr(`${PREPARAR}${EN_LA_VITRINA}${COMO_TIENDA}${sql}\nrollback;`), "permission denied");
  }

  // ---------------------------------------------------------------- 5. Mutantes: la prueba no está ciega
  console.log("— Mutantes (si la prueba no los ve, no prueba nada) —");
  {
    const r = correr(`${PREPARAR}${ESCENA_PRECIOS}
      ${MUTAR("retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean)", "'precio', x.prenda -> 'precio',", "'precio', (select to_jsonb(max(va.precio)) from retail.variantes va where va.producto_id = x.producto_id and va.activo),")}
      select ${DIFERENCIAS("lim")};
      rollback;`);
    esperar("el precio de la grilla en vez del de la tienda: el candado del precio lo ve", r.ok && !r.salida.startsWith("0|"), r.ok ? r.salida : r.mensaje);
  }
  {
    const r = correr(`${PREPARAR}${ESCENA_PRECIOS}
      ${MUTAR("retail.tienda_looks(uuid)", "retail.tienda_catalogo(p_sede)", "retail.tienda_catalogo(null)")}
      select ${DIFERENCIAS("tru")};
      rollback;`);
    esperar("la tienda que ignora la sede elegida (siempre «Todas»): el candado del precio lo ve", r.ok && !r.salida.startsWith("0|"), r.ok ? r.salida : r.mensaje);
  }
  {
    const r = correr(`${PREPARAR}${EN_LA_VITRINA}
      ${MUTAR("retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer)", "perform retail.fn_exigir_modulo('vitrina_web');", "")}
      ${COMO_MICAELA}select (${guardar()}) ->> 'nombre';
      rollback;`);
    esperar("guardar sin el candado del módulo: sin módulo GUARDA (la prueba de permisos lo vería)", r.ok && r.salida === "ZZ Fin de semana", r.ok ? r.salida : r.mensaje);
  }
  {
    const r = correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      ${MUTAR("retail.vitrina_mostrar_look(uuid, boolean, integer)", "perform retail.fn_exigir_modulo('vitrina_web');", "")}
      ${COMO_MICAELA}select (${mostrar("look", false)}) ->> 'publicado';
      rollback;`);
    esperar("mostrar sin el candado del módulo: sin módulo OCULTA (la prueba de permisos lo vería)", r.ok && r.salida === "false", r.ok ? r.salida : r.mensaje);
  }

  // ---------------------------------------------------------------- 6. Las migraciones
  console.log("— Las migraciones —");
  const sql = MIGRACIONES.map((f) => readFileSync(f, "utf8")).join("\n");
  esperarValor(
    "se pueden volver a correr (dos veces seguidas, como un segundo pegado), sin perder los looks",
    correr(`${PREPARAR}${EN_LA_VITRINA}${crear("look")}
      ${sql}
      ${sql}
      select concat_ws('|', (select count(*) from retail.vitrina_looks), (select count(*) from retail.vitrina_look_piezas), jsonb_array_length(retail.tienda_looks() -> 'looks'));
      rollback;`),
    "1|3|1",
  );

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();
