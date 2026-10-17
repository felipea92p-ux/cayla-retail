#!/usr/bin/env node
/**
 * «Arma el tuyo» en la tienda (ADR-0434, actividad 4) contra el Postgres local — CAYLA V2: lo que el probador lee de la base.
 *
 * QUÉ PRUEBA. `20261017025000_tienda_probador.sql`:
 *   1. Permisos: `tienda_probador` es security definer, con su search_path, y solo de `tienda_web` (ni anon ni authenticated).
 *   2. Quién entra: lo publicado y vendible con largo (el propio manda sobre el típico; sin típico, solo con el propio) y al menos un
 *      recorte LISTO de una foto del almacén público. No entra lo que no está publicado, lo que la Vitrina ya no deja mostrar, lo que
 *      solo tiene recortes por revisar o descartados, ni el recorte de una foto que vive en otro lado.
 *   3. Los recortes: solo los listos, en el orden de sus fotos (la principal primero), con el color de su foto (o null) y su nombre, su
 *      dirección en el almacén y su proporción.
 *   4. El precio de cada COLOR, con la regla única de la tienda: sin y con precio propio de la tienda (con «Todas», el mayor), y con una
 *      campaña solo en el negro: el negro baja y la beige NO («Desde» no aparece en ninguna). Es EXACTAMENTE el del look de CAYLA para la
 *      misma prenda en el mismo color y la misma tienda (`tienda_look`). Una tienda que no se ve en la web es «Todas».
 *   5. El stock de cada color: el nivel en cada tienda de la web y en todas, sin Cuarentena, sin lo apartado, sin el Taller y sin las
 *      tallas retiradas; nunca la cifra de 4 o más; un color que no se ofrece no aparece.
 *   6. `combina`: con qué colores se lleva cada color de las prendas (`colores.combina_con`), solo de esos colores.
 *   7. Un mutante (el precio del MODELO en vez del de cada color) hace fallar el escenario del negro: la prueba lo ve.
 *   8. La migración se puede volver a correr.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder): nunca se commitea nada en el Postgres local que
 * comparten los worktrees. Cada uno parte con la vitrina vacía, sin campañas, sin recortes, con Trujillo y Lima en la web, el umbral en
 * 3 y el stock de «Blusa Emma» en cero; después pone lo que mira. Los archivos del almacén no hacen falta: la lectura no los mira.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261017025000_tienda_probador.sql` mete la migración dentro de cada
 * transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: el seed (Felipe líder; «Blusa Emma» CMS en BEI y NEG, tallas S/M/L a S/ 79.90; «Pantalón Carla» PAN; «Falda
 * Renata» FAL; Tienda Trujillo y Tienda Lima con piso, almacén y Cuarentena; el Taller), la tienda (20261014220000, 20261015012000),
 * los looks (20261015031000, 20261015032000) y el probador del ERP (20261017003000, 20261017015000: CMS 65 y PAN 100 de típico, FAL sin).
 *
 * USO
 *   pnpm pruebas:tienda-probador    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-probador -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261017025000_tienda_probador.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)

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

const BASE = "http://127.0.0.1:54321/storage/v1/object/public/retail-productos-fotos/";
const FOTO_A = "fotos/bbbbbbbb-0000-4000-8000-000000000001.jpg"; // de Emma, beige, la principal
const FOTO_B = "fotos/bbbbbbbb-0000-4000-8000-000000000002.jpg"; // de Emma, sin color
const FOTO_N = "fotos/bbbbbbbb-0000-4000-8000-000000000003.jpg"; // de Emma, negra: su recorte está por revisar
const FOTO_C = "fotos/bbbbbbbb-0000-4000-8000-000000000004.jpg"; // de Carla, sin color
const FOTO_F = "fotos/bbbbbbbb-0000-4000-8000-000000000005.jpg"; // de Renata, beige (Faldas no tiene largo típico)
const recorte = (foto) => foto.replace(/^fotos\//, "recortes/").replace(/\.jpg$/, "-1.png");

// ---- El punto de partida: Emma, Carla y Renata publicadas con sus fotos y recortes; sin campañas; Trujillo y Lima en la web ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.vitrina_productos set publicado = false where publicado;
update retail.etiquetas set activo = false where activo and descuento_pct is not null;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
update retail.configuracion_tienda_web set quedan_pocas_desde = 3 where id;
delete from retail.foto_recortes;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as carla from retail.productos where referencia = 'Pantalón Carla' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
select id as tru_piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as tru_alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as tru_cua from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' \\gset
select id as lim_piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
${["NEG", "BEI"]
  .flatMap((c) =>
    ["S", "M", "L"].map(
      (t) =>
        `select v.id as ${c.toLowerCase()}_${t.toLowerCase()} from retail.variantes v join retail.tallas ta on ta.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = '${c}' and ta.valor = '${t}' \\gset`,
    ),
  )
  .join("\n")}
update retail.stock set cantidad = 0, cantidad_apartada = 0
 where variante_id in (select id from retail.variantes where producto_id = :'emma') and (cantidad <> 0 or cantidad_apartada <> 0);
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
select retail.vitrina_mostrar(array[:'emma', :'carla', :'falda']::uuid[], true) \\gset
update retail.vitrina_productos set largo_cm = null where producto_id in (:'emma', :'carla', :'falda');
delete from retail.producto_fotos where producto_id in (:'emma', :'carla', :'falda');
insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo) values
  (:'emma', '${BASE}${FOTO_N}', 2, false, 'NEG'),
  (:'emma', '${BASE}${FOTO_B}', 1, false, null),
  (:'emma', '${BASE}${FOTO_A}', 0, true, 'BEI'),
  (:'carla', '${BASE}${FOTO_C}', 0, true, null),
  (:'falda', '${BASE}${FOTO_F}', 0, true, 'BEI');
insert into retail.foto_recortes (foto, recorte, proporcion, estado, motivo) values
  ('${FOTO_A}', '${recorte(FOTO_A)}', 0.8, 'listo', null),
  ('${FOTO_B}', '${recorte(FOTO_B)}', 0.9, 'listo', null),
  ('${FOTO_N}', '${recorte(FOTO_N)}', 1.1, 'por_revisar', 'huecos'),
  ('${FOTO_C}', '${recorte(FOTO_C)}', 0.45, 'listo', null),
  ('${FOTO_F}', '${recorte(FOTO_F)}', 0.7, 'listo', null);
`;
const FIN = "rollback;\n";
const COMO_TIENDA = `grant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
/** Deja EXACTAMENTE `cantidad` (y `apartada`) de una talla en un lugar (`lugar`: una variable de psql, o null = sin lugar). */
const poner = (variante, sede, lugar, cantidad, apartada = 0) =>
  `insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada)
   values (:'${variante}', :'${sede}', ${lugar ? `:'${lugar}'` : "null"}, ${cantidad}, ${apartada})
   on conflict on constraint stock_variante_ubicacion_sububicacion_key
   do update set cantidad = excluded.cantidad, cantidad_apartada = excluded.cantidad_apartada;\n`;
/** Las prendas del probador: «nombre=largo», por nombre. */
const QUIENES = (sede = "null") => `select coalesce(string_agg(p.referencia || '=' || (x ->> 'largo'), ',' order by p.referencia), '—')
  from jsonb_array_elements(retail.tienda_probador(${sede}) -> 'prendas') x join retail.productos p on p.id = (x ->> 'id')::uuid;\n`;
/** Una prenda del probador (por su variable de psql) como fila jsonb `x`. */
const PRENDA = (producto, sede = "null") =>
  `(select x from jsonb_array_elements(retail.tienda_probador(${sede}) -> 'prendas') x where x ->> 'id' = :'${producto}')`;
/** El precio de cada color de Emma: «BEI=lista/final/desde/campaña,NEG=…». */
const PRECIOS = (sede = "null") => `select string_agg(c ->> 'codigo' || '=' || concat_ws('/', c ->> 'precio', c ->> 'precio_final', c ->> 'desde',
         coalesce(c -> 'campana' ->> 'nombre', '-')), ',' order by c ->> 'codigo')
  from jsonb_array_elements(${PRENDA("emma", sede)} -> 'colores') c;\n`;
/** El stock de cada color de Emma: «BEI=tru|lim|total,NEG=…». */
const NIVELES = (sede = "null") => `select string_agg(c ->> 'codigo' || '=' || concat_ws('|', coalesce(c -> 'stock' -> 'sedes' ->> :'tru', '·'),
         coalesce(c -> 'stock' -> 'sedes' ->> :'lim', '·'), c -> 'stock' ->> 'total'), ',' order by c ->> 'codigo')
  from jsonb_array_elements(${PRENDA("emma", sede)} -> 'colores') c;\n`;
// El stock de la mayoría de escenarios: en Trujillo, NEG M 5 · NEG S 2+1 · BEI S 1 · BEI M 3 con 3 apartadas (0) · BEI L 4 en
// Cuarentena (0); en Lima, NEG M 4 con 2 apartadas (2); en el Taller, NEG M 84 (no es tienda).
const STOCK = [
  poner("neg_m", "tru", "tru_piso", 5),
  poner("neg_s", "tru", "tru_alm", 2),
  poner("neg_s", "tru", "tru_piso", 1),
  poner("bei_s", "tru", "tru_alm", 1),
  poner("bei_m", "tru", "tru_piso", 3, 3),
  poner("bei_l", "tru", "tru_cua", 4),
  poner("neg_m", "lim", "lim_piso", 4, 2),
  poner("neg_m", "taller", null, 84),
].join("");

const hayFuncion = correr("select to_regprocedure('retail.tienda_probador(uuid)') is not null;");
if (!APLICAR_ANTES && !(hayFuncion.ok && hayFuncion.salida === "t")) {
  console.error(`Falta retail.tienda_probador: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
  process.exit(1);
}

console.log("1. Permisos");
esperarValor(
  "tienda_probador: security definer con su search_path, y solo de tienda_web",
  correr(`${PREPARAR}select concat_ws('|', p.prosecdef, exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'),
      has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
    from pg_proc p where p.oid = 'retail.tienda_probador(uuid)'::regprocedure;\n${FIN}`),
  "t|t|f|f|t",
);
esperarValor(
  "como tienda_web, responde con sus prendas",
  correr(`${PREPARAR}${COMO_TIENDA}select jsonb_array_length(retail.tienda_probador() -> 'prendas');\n${FIN}`),
  "2",
);
esperarError(
  "como tienda_web, leer los recortes directo se niega",
  correr(`${PREPARAR}${COMO_TIENDA}select count(*) from retail.foto_recortes;\n${FIN}`),
  "permission denied",
);

console.log("2. Quién entra al probador");
esperarValor(
  "con largo típico y un recorte listo, sí (Emma 65, Carla 100); sin típico ni largo propio, no (Renata)",
  correr(`${PREPARAR}${QUIENES()}${FIN}`),
  "Blusa Emma=65,Pantalón Carla=100",
);
esperarValor(
  "el largo propio manda sobre el típico, y con él entra una categoría sin típico (Renata 55, Emma 70)",
  correr(`${PREPARAR}update retail.vitrina_productos set largo_cm = case producto_id when :'falda' then 55 else 70 end where producto_id in (:'falda', :'emma');
${QUIENES()}${FIN}`),
  "Blusa Emma=70,Falda Renata=55,Pantalón Carla=100",
);
esperarValor(
  "con su único recorte por revisar o descartado, no entra (Carla)",
  correr(`${PREPARAR}update retail.foto_recortes set estado = 'por_revisar', motivo = 'huecos' where foto = '${FOTO_C}';
${QUIENES()}update retail.foto_recortes set estado = 'descartado' where foto = '${FOTO_C}';
${QUIENES()}${FIN}`),
  "Blusa Emma=65\nBlusa Emma=65",
);
esperarValor(
  "lo que no está publicado, o la Vitrina ya no deja mostrar, no entra",
  correr(`${PREPARAR}select retail.vitrina_mostrar(array[:'carla']::uuid[], false) \\gset
${QUIENES()}select retail.vitrina_mostrar(array[:'carla']::uuid[], true) \\gset
update retail.productos set es_prueba = true where id = :'emma';
${QUIENES()}${FIN}`),
  "Blusa Emma=65\nPantalón Carla=100",
);
esperarValor(
  "el recorte de una foto que vive fuera del almacén público no cuenta",
  correr(`${PREPARAR}update retail.producto_fotos set url = replace(url, '/retail-productos-fotos/', '/otro-almacen/') where producto_id = :'carla';
${QUIENES()}${FIN}`),
  "Blusa Emma=65",
);

console.log("3. Los recortes");
esperarValor(
  "solo los listos, la principal primero, con el color de su foto (o null), su nombre y su proporción",
  correr(`${PREPARAR}select string_agg(concat_ws('/', coalesce(r ->> 'color', '·'), coalesce(r ->> 'color_nombre', '·'), r ->> 'proporcion'), ',' order by n)
  from jsonb_array_elements(${PRENDA("emma")} -> 'recortes') with ordinality as t (r, n);
select (${PRENDA("emma")} -> 'recortes' -> 0 ->> 'url') = '${BASE}${recorte(FOTO_A)}';
${FIN}`),
  "BEI/Beige/0.8000,·/·/0.9000\nt",
);

console.log("4. El precio de cada color");
esperarValor(
  "sin precio propio ni campaña: cada color a 79.90, sin «Desde»",
  correr(`${PREPARAR}${PRECIOS()}${FIN}`),
  "BEI=79.90/79.90/false/-,NEG=79.90/79.90/false/-",
);
esperarValor(
  "con precio propio de la tienda: el de esa tienda; con «Todas», el mayor (Trujillo 99.90, Lima 69.90); y dice qué tienda usó",
  correr(`${PREPARAR}select retail.poner_precio_sede(:'emma', :'tru', 99.90, 'Prueba del probador') \\gset
select retail.poner_precio_sede(:'emma', :'lim', 69.90, 'Prueba del probador') \\gset
${PRECIOS()}${PRECIOS(":'lim'")}select coalesce(retail.tienda_probador(:'lim') ->> 'sede', '·') = :'lim', coalesce(retail.tienda_probador() ->> 'sede', '·');
${FIN}`),
  "BEI=99.90/99.90/false/-,NEG=99.90/99.90/false/-\nBEI=69.90/69.90/false/-,NEG=69.90/69.90/false/-\nt|·",
);
const CAMPANA_NEGRO = `insert into retail.etiquetas (nombre, estilo, activo, descuento_pct) values ('ZZ Negro', 'campana', true, 20) returning id as etq \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) select v.id, :'etq' from retail.variantes v where v.producto_id = :'emma' and v.activo and v.color_codigo = 'NEG';
-- Lo que cobra la caja con −20 % sobre 79.90 (fn_descuento_campana, ADR-0403) se escribe «C20»: la prueba no copia el redondeo.
select (79.90 - retail.fn_descuento_campana(79.90, 20))::text as c20 \\gset
`;
const NEGRO_ESPERADO = "BEI=79.90/79.90/false/-,NEG=79.90/C20/false/ZZ Negro";
esperarValor(
  "con una campaña solo en el negro: el negro baja a su precio de campaña y la beige NO; ninguna dice «Desde»",
  correr(`${PREPARAR}${CAMPANA_NEGRO}select replace((${PRECIOS().trim().replace(/;$/, "")}), :'c20', 'C20');\n${FIN}`),
  NEGRO_ESPERADO,
);
esperarValor(
  "es EXACTAMENTE el precio del look de CAYLA de la misma prenda en el mismo color y la misma tienda (con «Todas» y en Trujillo)",
  correr(`${PREPARAR}${CAMPANA_NEGRO}select color_codigo as carla_color from retail.variantes where producto_id = :'carla' and activo order by color_codigo limit 1 \\gset
select retail.vitrina_guardar_look(null, 'ZZ Look del probador', null, true,
         jsonb_build_array(jsonb_build_object('producto_id', :'emma', 'color', 'NEG'), jsonb_build_object('producto_id', :'carla', 'color', :'carla_color')),
         null, null) ->> 'id' as look \\gset
create function pg_temp.del_look(p_sede uuid) returns text language sql as $f$
  select concat_ws('/', pz -> 'prenda' ->> 'precio', pz -> 'prenda' ->> 'precio_final', pz -> 'prenda' ->> 'desde', coalesce(pz -> 'prenda' -> 'campana' ->> 'nombre', '-'))
    from jsonb_array_elements(retail.tienda_look((select id from retail.vitrina_looks where nombre = 'ZZ Look del probador'), p_sede) -> 'look' -> 'piezas') pz
   where pz -> 'color' ->> 'codigo' = 'NEG' and pz -> 'prenda' ->> 'id' = (select id::text from retail.productos where referencia = 'Blusa Emma')
$f$;
create function pg_temp.del_probador(p_sede uuid) returns text language sql as $f$
  select concat_ws('/', c ->> 'precio', c ->> 'precio_final', c ->> 'desde', coalesce(c -> 'campana' ->> 'nombre', '-'))
    from jsonb_array_elements(retail.tienda_probador(p_sede) -> 'prendas') x, jsonb_array_elements(x -> 'colores') c
   where x ->> 'id' = (select id::text from retail.productos where referencia = 'Blusa Emma') and c ->> 'codigo' = 'NEG'
$f$;
select retail.poner_precio_sede(:'emma', :'tru', 99.90, 'Prueba del probador') \\gset
select concat_ws('|', pg_temp.del_look(null) = pg_temp.del_probador(null), pg_temp.del_look(:'tru') = pg_temp.del_probador(:'tru'),
                 pg_temp.del_probador(:'tru') like '99.90/%');
${FIN}`),
  "t|t|t",
);
esperarValor(
  "una tienda que no se ve en la web es «Todas»: su precio y ningún stock suyo",
  correr(`${PREPARAR}select retail.poner_precio_sede(:'emma', :'tru', 99.90, 'Prueba del probador') \\gset
select retail.poner_precio_sede(:'emma', :'lim', 69.90, 'Prueba del probador') \\gset
${STOCK}update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';
select concat_ws('|', coalesce(retail.tienda_probador(:'lim') ->> 'sede', '·'),
                 (select string_agg(k, ',') from jsonb_array_elements(${PRENDA("emma", ":'lim'")} -> 'colores') c, jsonb_object_keys(c -> 'stock' -> 'sedes') k where c ->> 'codigo' = 'NEG') = :'tru');
${PRECIOS(":'lim'")}${FIN}`),
  "·|t\nBEI=99.90/99.90/false/-,NEG=99.90/99.90/false/-",
);

console.log("5. El stock de cada color");
esperarValor(
  "por color y tienda: sin Cuarentena, sin lo apartado y sin el Taller (NEG: Trujillo 8 → hay, Lima 2; BEI: Trujillo 1, Lima 0)",
  correr(`${PREPARAR}${STOCK}${NIVELES()}${FIN}`),
  "BEI=1|0|1,NEG=hay|2|hay",
);
esperarValor(
  // Una talla con prendas no se puede retirar (ADR-0270, decisión 13): se retiran las tallas vacías de un color.
  "un color sin tallas que se ofrezcan no aparece, ni en el precio ni en el stock",
  correr(`${PREPARAR}${poner("neg_m", "tru", "tru_piso", 5)}update retail.variantes set activo = false where producto_id = :'emma' and color_codigo = 'BEI';
${NIVELES()}${PRECIOS()}${FIN}`),
  "NEG=hay|0|hay\nNEG=79.90/79.90/false/-",
);
esperarValor(
  "la cifra de 4 o más nunca sale (37 unidades con el umbral en 3, 2 y 1)",
  correr(`${PREPARAR}${STOCK}${poner("neg_m", "tru", "tru_piso", 37)}update retail.configuracion_tienda_web set quedan_pocas_desde = 3 where id;
${NIVELES()}update retail.configuracion_tienda_web set quedan_pocas_desde = 2 where id;
${NIVELES()}update retail.configuracion_tienda_web set quedan_pocas_desde = 1 where id;
${NIVELES()}select count(*) from jsonb_path_query(retail.tienda_probador(), 'lax $.prendas[*].colores[*].stock.**') v
 where jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric > 3;
${FIN}`),
  "BEI=1|0|1,NEG=hay|2|hay\nBEI=1|0|1,NEG=hay|2|hay\nBEI=1|0|1,NEG=hay|hay|hay\n0",
);

console.log("6. Los colores que combinan");
esperarValor(
  "solo de los colores de las prendas del probador, tal como los guarda Colores",
  correr(`${PREPARAR}select concat_ws('|',
  (select coalesce(string_agg(k, ',' order by k), '') from jsonb_object_keys(retail.tienda_probador() -> 'combina') k)
    = (select coalesce(string_agg(distinct co.codigo, ',' order by co.codigo), '') from retail.colores co
        where cardinality(co.combina_con) > 0
          and co.codigo in (select v.color_codigo from retail.variantes v where v.producto_id in (:'emma', :'carla') and v.activo)),
  (select bool_and(retail.tienda_probador() -> 'combina' -> co.codigo = to_jsonb(co.combina_con)) from retail.colores co
    where co.codigo in (select k from jsonb_object_keys(retail.tienda_probador() -> 'combina') k)));
${FIN}`),
  "t|t",
);

console.log("7. Un mutante: el precio del modelo en vez del de cada color");
{
  const MUTANTE = `do $m$
declare d text := pg_get_functiondef('retail.tienda_probador(uuid)'::regprocedure);
begin
  if position('fn_tienda_precios(v_ids, v_sede, true)' in d) = 0 then raise exception 'mutante vacío: tienda_probador cambió'; end if;
  execute replace(d, 'fn_tienda_precios(v_ids, v_sede, true)', 'fn_tienda_precios(v_ids, v_sede, false)');
end $m$;
`;
  const r = correr(`${PREPARAR}${CAMPANA_NEGRO}${MUTANTE}select replace((${PRECIOS().trim().replace(/;$/, "")}), :'c20', 'C20');\n${FIN}`);
  esperar("con el resumen del modelo, la beige diría el precio del negro: el escenario del negro lo ve", r.ok && r.salida !== NEGRO_ESPERADO, r.ok ? `dio «${r.salida}»` : r.mensaje);
}

console.log("8. La migración se puede volver a correr");
{
  const texto = readFileSync(MIGRACION, "utf8");
  esperarValor("aplicada dos veces seguidas, responde igual", correr(`${PREPARAR}${texto}\n${texto}\n${QUIENES()}${FIN}`), "Blusa Emma=65,Pantalón Carla=100");
}

console.log(`\n${total - fallos}/${total} escenarios`);
process.exit(fallos ? 1 : 0);
