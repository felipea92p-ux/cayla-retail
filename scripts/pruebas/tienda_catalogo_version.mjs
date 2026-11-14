#!/usr/bin/env node
/**
 * La huella del catálogo web (`20261113202000_tienda_catalogo_version.sql`, cambiar-de-modulo#11) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. La tienda vuelve a pedir `tienda_catalogo`, `tienda_filtros` y `tienda_probador` SOLO si cambió
 * `retail.tienda_catalogo_version()`. Si la huella no cambiara con algo que esas lecturas muestran, la tienda mostraría un precio o un stock
 * viejo hasta el tope de 10 minutos. Por eso:
 *   1. Permisos: security definer con su search_path y solo de `tienda_web`; como `tienda_web` responde 32 letras, siempre las mismas.
 *   2. Lo que pidió Felipe que se vea igual que hoy: una VENTA (registrar_venta), un CAMBIO DE PRECIO (poner_precio_sede), una CAMPAÑA QUE
 *      EMPIEZA MAÑANA (sin escribir nada: solo cambia el día) y una FOTO NUEVA cambian la huella Y lo que muestra el catálogo.
 *   3. El resto de lo que la tienda lee: quitar de la Vitrina, una insignia, una familia que sale de los motores, «quedan pocas», una tienda
 *      que deja de mostrarse, un recorte listo del probador, una orden del Taller que cambia de estado y una función que se reemplaza.
 *   4. Lo que la tienda no muestra NO la mueve: una caja que se abre, un cliente nuevo y el avance de una orden del Taller.
 *   5. COBERTURA (el candado contra el olvido): recorre en la base todas las funciones que llaman esas tres lecturas, y falla si alguna
 *      lee una tabla que la huella no mira (ni por su suma de hashes, ni por el contador del catálogo, ni por los movimientos) o si una de
 *      esas funciones falta en la lista de la huella. Quien agregue una tabla al catálogo la tiene que sumar a la huella.
 *   6. MUTANTES: la huella sin la Vitrina y sin los movimientos (cada una rompe un caso) hacen fallar su caso; una prueba que no mata
 *      a ningún mutante no está probando nada.
 *   7. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder): nunca se commitea nada en el Postgres local que comparten
 * los worktrees. Si la base local todavía no tiene la migración, la mete dentro de cada transacción.
 *
 * DA POR SENTADO: el seed (Felipe líder; «Blusa Emma» CMS en BEI y NEG, tallas S/M/L; Tienda Trujillo y Tienda Lima con piso, almacén y
 * Cuarentena; órdenes del Taller), la tienda online (20261014220000 y siguientes) y el contador del catálogo (20260923184300).
 *
 * USO
 *   pnpm pruebas:tienda-catalogo-version                 → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:tienda-catalogo-version -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261113202000_tienda_catalogo_version.sql";
// Las migraciones que vinieron después y tocan lo que la huella cubre (ADR-0655): las ofertas prenda por prenda, las cesiones y la huella
// que las suma. «Cobertura» lee sus listas de la ÚLTIMA (HUELLA_ACTUAL) y, si la base local no las tiene, las aplica en su transacción.
// La última que define la huella (20261114142000 suma fn_insignia_viva, de 20261114130000).
const HUELLA_ACTUAL = "supabase/migrations/20261114142000_huella_tienda_con_insignia_viva.sql";
const DESPUES = [
  ["retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)", "procedure", ["20261112204000_fusionar_productos_base", "20261112205000_fusionar_productos_previsualizar",
    "20261112210000_fusionar_productos", "20261112211000_fusionar_productos_lecturas", "20261113175000_fusionar_productos_tallas_vacias"]],
  ["retail.campana_regla_productos", "class", ["20261113210000_oferta_prenda_por_prenda"]],
  ["retail.campana_regla_cesiones", "class", ["20261113223000_una_oferta_por_prenda_tienda_y_dia"]],
  ["retail.fn_variantes_de_oferta(uuid, uuid[], uuid[], uuid[], boolean)", "procedure", ["20261113230000_choques_de_oferta_de_una_vez"]],
  // Las ofertas de grupo, el monto y las ofertas por insignia (ADR-0655): la caja lee `campana_regla_insignias` desde 20261114060000.
  ["retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)", "procedure", ["20261114003000_ofertas_de_grupo"]],
  ["retail.fn_exigir_ofertas_de_grupo(jsonb, uuid, date)", "procedure", ["20261114011000_caja_cobra_ofertas_de_grupo"]],
  ["retail.fn_repartir_grupos(jsonb)", "procedure", ["20261114032000_apartados_con_ofertas_de_grupo"]],
  ["retail.tienda_bolsa_grupos(jsonb, uuid)", "procedure", ["20261114041000_tienda_web_ofertas_de_grupo"]],
  ["retail.fn_escalones_validos(jsonb, text)", "procedure", ["20261114044000_monto_con_escalones"]],
  ["retail.campana_regla_insignias", "class", ["20261114054000_choques_con_forma_una_sola_firma", "20261114060000_ofertas_por_insignia"]],
  // Una oferta no llega por una insignia desactivada (20261114130000): la regla pregunta fn_insignia_viva.
  ["retail.fn_insignia_viva(uuid)", "procedure", ["20261114130000_oferta_no_llega_por_insignia_desactivada"]],
];
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin): publica en la Vitrina

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 128 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
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

let total = 0;
let fallos = 0;
function esperar(nombre, ok, detalle) {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
function esperarValor(nombre, r, esperado) {
  const ultima = r.ok ? r.salida.split("\n").at(-1) : null;
  esperar(nombre, r.ok && ultima === esperado, r.ok ? `dio «${ultima}», se esperaba «${esperado}»` : r.mensaje);
}

if (!correr("select 1;").ok) {
  console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
  process.exit(2);
}
if (correr("select to_regprocedure('retail.tienda_catalogo(uuid)') is not null;").salida !== "t") {
  console.error("Falta la tienda online en la base local: aplica las migraciones de supabase/migrations.");
  process.exit(2);
}

const TEXTO_MIGRACION = readFileSync(MIGRACION, "utf8");
const YA_ESTA = correr("select to_regprocedure('retail.tienda_catalogo_version()') is not null;").salida === "t";
const MIGRACION_EN_LA_TRANSACCION = YA_ESTA ? "" : TEXTO_MIGRACION;
const TEXTO_HUELLA = readFileSync(HUELLA_ACTUAL, "utf8");
const FALTA_DESPUES = DESPUES.filter(([que, tipo]) => correr(`select to_reg${tipo}('${que}') is null;`).salida === "t")
  .flatMap(([, , archivos]) => archivos.map((a) => readFileSync(`supabase/migrations/${a}.sql`, "utf8")))
  .join("\n");
const HUELLA_AL_DIA = correr("select position('fn_insignia_viva' in coalesce(pg_get_functiondef(to_regprocedure('retail.tienda_catalogo_version()')), '')) > 0;").salida === "t";
const PARA_COBERTURA = `${MIGRACION_EN_LA_TRANSACCION}\n${FALTA_DESPUES}\n${HUELLA_AL_DIA ? "" : TEXTO_HUELLA}`;

/** La migración sin la línea de la huella que contiene `marca` (una de sus tablas): un mutante. */
function sinLaLinea(marca) {
  const lineas = TEXTO_MIGRACION.split("\n");
  const quedan = lineas.filter((l) => !l.includes(marca) || l.trimStart().startsWith("--"));
  if (quedan.length !== lineas.length - 1) {
    throw new Error(`el mutante «${marca}» no encontró UNA línea que quitar (encontró ${lineas.length - quedan.length})`);
  }
  return quedan.join("\n");
}
// La cuenta de movimientos son dos líneas (la cuenta y su `where`): el mutante las quita juntas.
const SIN_MOVIMIENTOS = TEXTO_MIGRACION.replace(
  /\(select count\(\*\) from retail\.movimientos m\n\s+where m\.created_at >= [^\n]+\n/,
  "",
);
if (SIN_MOVIMIENTOS === TEXTO_MIGRACION) throw new Error("el mutante de los movimientos no encontró la cuenta que quitar");

/** El punto de partida, en su transacción: Trujillo y Lima en la web, umbral 3, Emma publicada con 2 NEG M en el piso de Lima y nada más. */
function preparar(aplicar = MIGRACION_EN_LA_TRANSACCION) {
  return `
begin;
${aplicar}
set local request.jwt.claim.sub = '${FELIPE}';
update retail.vitrina_productos set publicado = false where publicado;
update retail.configuracion_tienda_web set quedan_pocas_desde = 3 where id;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
select id as emma, categoria_id as emma_cat from retail.productos where referencia = 'Blusa Emma' \\gset
select familia as emma_fam from retail.categorias where id = :'emma_cat' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as lim_piso from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'piso_venta' \\gset
select v.id as neg_m from retail.variantes v join retail.tallas ta on ta.id = v.talla_id where v.producto_id = :'emma' and v.color_codigo = 'NEG' and ta.valor = 'M' \\gset
update retail.stock set cantidad = 0, cantidad_apartada = 0
 where variante_id in (select id from retail.variantes where producto_id = :'emma') and (cantidad <> 0 or cantidad_apartada <> 0);
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad, cantidad_apartada) values (:'neg_m', :'lim', :'lim_piso', 2, 0)
on conflict on constraint stock_variante_ubicacion_sububicacion_key do update set cantidad = 2, cantidad_apartada = 0;
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
select retail.vitrina_mostrar(array[:'emma']::uuid[], true) \\gset
`;
}

/** La foto de antes del cambio: la huella y lo que muestra cada lectura. */
const FOTO = `select retail.tienda_catalogo_version() as h0,
       md5(retail.tienda_catalogo(null)::text) as c0, md5(retail.tienda_catalogo(:'tru')::text) as c0_tru,
       md5(retail.tienda_catalogo(:'lim')::text) as c0_lim, md5(retail.tienda_probador(null)::text) as p0,
       md5(retail.tienda_filtros(:'lim')::text) as f0_lim \\gset
`;
/** «¿cambió la huella? | ¿cambió lo que se ve?» en `lectura` (c0 = catálogo con «Todas», c0_lim, c0_tru, p0 = probador, f0_lim = filtros). */
const CAMBIO = (lectura = "c0") => {
  const expr = {
    c0: "md5(retail.tienda_catalogo(null)::text)",
    c0_tru: "md5(retail.tienda_catalogo(:'tru')::text)",
    c0_lim: "md5(retail.tienda_catalogo(:'lim')::text)",
    p0: "md5(retail.tienda_probador(null)::text)",
    f0_lim: "md5(retail.tienda_filtros(:'lim')::text)",
  }[lectura];
  return `select concat_ws('|', retail.tienda_catalogo_version() <> :'h0', ${expr} <> :'${lectura}');\nrollback;`;
};

/** Vende una unidad en Lima con una caja abierta de prueba (lo mismo que tienda_filtros.mjs). */
const VENDER_EN_LIMA = (variante) =>
  `select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'lim' and estado = 'abierta') c) as _cerro \\gset
select retail.abrir_caja(:'lim', 100.00, 'prueba de la huella de la tienda') as _caja \\gset
select retail.registrar_venta(:'lim',
  jsonb_build_array(jsonb_build_object('variante_id', :'${variante}', 'cantidad', 1, 'precio_unitario', retail.fn_precio_en_sede(:'${variante}', :'lim'), 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', retail.fn_precio_en_sede(:'${variante}', :'lim'))),
  null, gen_random_uuid()) as _venta \\gset
`;

/** `fn_hoy_lima` que mira un día de prueba (`prueba.hoy`) o, sin él, el de verdad. Se pone ANTES de la foto: así la huella solo cambia por la fecha. */
const RELOJ_DE_PRUEBA = `create or replace function retail.fn_hoy_lima() returns date language sql stable as $f$
  select coalesce(nullif(current_setting('prueba.hoy', true), '')::date, (now() at time zone 'America/Lima')::date)
$f$;
`;
const MANANA = `select set_config('prueba.hoy', ((now() at time zone 'America/Lima')::date + 1)::text, true) as _hoy \\gset\n`;

/** Una orden del Taller propia de la prueba (en proceso, de Emma): la base del CI puede no tener ninguna. Se arma ANTES de la foto. */
const ORDEN_DEL_TALLER = `select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
insert into retail.producciones (ubicacion_id, producto_id, estado, cantidad_plan) values (:'taller', :'emma', 'en_proceso', 12) returning id as orden \\gset
`;

const FOTO_PROBADOR = `
update retail.vitrina_productos set largo_cm = 62 where producto_id = :'emma';
insert into retail.producto_fotos (producto_id, url, color_codigo, es_principal, orden)
values (:'emma', 'https://prueba.supabase.co/storage/v1/object/public/retail-productos-fotos/productos/prueba-huella.webp', 'NEG', true, 0);
`;

// ---------------------------------------------------------------- 1. Permisos
esperarValor(
  "tienda_catalogo_version: security definer con su search_path, y solo de tienda_web",
  correr(`begin;\n${MIGRACION_EN_LA_TRANSACCION}\nselect concat_ws('|', p.prosecdef, exists (select 1 from unnest(p.proconfig) x where x like 'search\\_path=%'),
      has_function_privilege('public', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'),
      has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
    from pg_proc p where p.oid = 'retail.tienda_catalogo_version()'::regprocedure;\nrollback;`),
  "t|t|f|f|f|t",
);
esperarValor(
  "como tienda_web responde 32 letras, dos veces seguidas la misma, y la misma que junto al catálogo (la misma foto de la base)",
  correr(`${preparar()}grant tienda_web to current_user with set true;\nset local role tienda_web;
    select concat_ws('|', length(retail.tienda_catalogo_version()), retail.tienda_catalogo_version() = retail.tienda_catalogo_version(),
      (select x.h = retail.tienda_catalogo_version() from (select retail.tienda_catalogo_version() as h, retail.tienda_catalogo(null) as c) x));\nrollback;`),
  "32|t|t",
);

// ---------------------------------------------------------------- 2. Lo que se tiene que ver igual que hoy
esperarValor(
  "una VENTA en Lima (registrar_venta, la última de 2 NEG M): cambia la huella y el nivel de Emma en Lima",
  correr(`${preparar()}${FOTO}${VENDER_EN_LIMA("neg_m")}${CAMBIO("c0_lim")}`),
  "t|t",
);
esperarValor(
  "la misma VENTA también cambia los filtros de Lima cuando se va la última (vender las 2)",
  correr(`${preparar()}${FOTO}${VENDER_EN_LIMA("neg_m")}select retail.registrar_venta(:'lim',
      jsonb_build_array(jsonb_build_object('variante_id', :'neg_m', 'cantidad', 1, 'precio_unitario', retail.fn_precio_en_sede(:'neg_m', :'lim'), 'descuento_unitario', 0)),
      jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', retail.fn_precio_en_sede(:'neg_m', :'lim'))), null, gen_random_uuid()) as _venta2 \\gset
    ${CAMBIO("f0_lim")}`),
  "t|t",
);
esperarValor(
  "un CAMBIO DE PRECIO en Trujillo (poner_precio_sede): cambia la huella y el precio de Emma en Trujillo",
  correr(`${preparar()}${FOTO}select retail.poner_precio_sede(:'emma', :'tru', 123.40, 'prueba de la huella') as _p \\gset\n${CAMBIO("c0_tru")}`),
  "t|t",
);
esperarValor(
  "una CAMPAÑA QUE EMPIEZA MAÑANA: hoy no se ve; mañana, sin escribir nada, cambian la huella y el precio, y Emma lleva la campaña",
  correr(`${preparar()}${RELOJ_DE_PRUEBA}
    insert into retail.etiquetas (nombre, estado, activo, descuento_pct, vigente_desde, estilo)
    values ('ZZ Campaña de la huella', 'aprobado', true, 20, (now() at time zone 'America/Lima')::date + 1, 'campana') returning id as camp \\gset
    insert into retail.etiqueta_categorias (etiqueta_id, categoria_id) values (:'camp', :'emma_cat');
    ${FOTO}${MANANA}
    select concat_ws('|', retail.tienda_catalogo_version() <> :'h0', md5(retail.tienda_catalogo(null)::text) <> :'c0',
      (select x -> 'campana' ->> 'nombre' from jsonb_array_elements(retail.tienda_catalogo(null) -> 'prendas') x where x ->> 'id' = :'emma'));
    rollback;`),
  "t|t|ZZ Campaña de la huella",
);
esperarValor(
  "una FOTO NUEVA de Emma: cambia la huella y las fotos del catálogo",
  correr(`${preparar()}${FOTO}insert into retail.producto_fotos (producto_id, url, color_codigo, es_principal, orden)
    values (:'emma', 'https://prueba.supabase.co/storage/v1/object/public/retail-productos-fotos/productos/prueba-huella.webp', 'NEG', true, 0);\n${CAMBIO("c0")}`),
  "t|t",
);

// ---------------------------------------------------------------- 3. Todo lo demás que la tienda lee
const CASOS = [
  ["quitar a Emma de la Vitrina", "select retail.vitrina_mostrar(array[:'emma']::uuid[], false) as _v \\gset", "c0"],
  [
    "una insignia (sin descuento) en una talla de Emma",
    `insert into retail.etiquetas (nombre, estado, activo, estilo) values ('ZZ Insignia de la huella', 'aprobado', true, 'positivo') returning id as ins \\gset
     insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'neg_m', :'ins');`,
    "c0",
  ],
  ["la familia de Emma sale de los motores (bolsas, empaque)", "update retail.familias set entra_a_motores = false where codigo = :'emma_fam';", "c0"],
  ["«quedan pocas» desde 1 (el nivel de 2 pasa a «hay»)", "update retail.configuracion_tienda_web set quedan_pocas_desde = 1 where id;", "c0_lim"],
  ["Lima deja de mostrarse en la web", "update retail.ubicacion_datos_web set mostrar = false where ubicacion_id = :'lim';", "c0"],
];
for (const [nombre, cambio, lectura] of CASOS) {
  esperarValor(`${nombre}: cambia la huella y lo que se ve`, correr(`${preparar()}${FOTO}${cambio}\n${CAMBIO(lectura)}`), "t|t");
}
esperarValor(
  "un recorte LISTO de la foto de Emma: cambia la huella y Emma entra al probador",
  correr(`${preparar()}${FOTO_PROBADOR}${FOTO}insert into retail.foto_recortes (foto, recorte, proporcion, estado)
    values ('productos/prueba-huella.webp', 'recortes/prueba-huella.png', 0.5, 'listo');
    select concat_ws('|', retail.tienda_catalogo_version() <> :'h0', md5(retail.tienda_probador(null)::text) <> :'p0',
      exists (select 1 from jsonb_array_elements(retail.tienda_probador(null) -> 'prendas') x where x ->> 'id' = :'emma'));\nrollback;`),
  "t|t|t",
);
esperarValor(
  "una orden del Taller cambia de estado: cambia la huella (la etapa de la prenda depende de ella)",
  correr(`${preparar()}${ORDEN_DEL_TALLER}${FOTO}update retail.producciones set estado = 'anulada' where id = :'orden';
    select concat_ws('|', (select count(*) from retail.producciones where id = :'orden' and estado = 'anulada'), retail.tienda_catalogo_version() <> :'h0');\nrollback;`),
  "1|t",
);
esperarValor(
  "una función de las lecturas se reemplaza (una migración que cambia una regla): cambia la huella",
  correr(`${preparar()}${FOTO}select pg_get_functiondef('retail.fn_tienda_nivel(integer,integer)'::regprocedure) \\gexec
    select retail.tienda_catalogo_version() <> :'h0';\nrollback;`),
  "t",
);

// ---------------------------------------------------------------- 4. Lo que la tienda no muestra no la mueve
esperarValor(
  "una caja que se cierra y se abre, un cliente nuevo y el AVANCE de una orden del Taller (su nota, su costo) no mueven la huella",
  correr(`${preparar()}${ORDEN_DEL_TALLER}${FOTO}
    select (select count(*) from (select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'lim' and estado = 'abierta') c) as _cerro \\gset
    select retail.abrir_caja(:'lim', 100.00, 'prueba de la huella de la tienda') as _caja \\gset
    insert into retail.clientas (documento_tipo, documento_numero, nombre) values ('dni', '49999991', 'ZZ Cliente de la huella');
    update retail.producciones set nota = 'avance de prueba de la huella', costo_maquila = costo_maquila + 1 where id = :'orden';
    select concat_ws('|', (select count(*) from retail.producciones where id = :'orden' and nota is not null), retail.tienda_catalogo_version() = :'h0');\nrollback;`),
  "1|t",
);

// ---------------------------------------------------------------- 5. Cobertura: nada de lo que leen las lecturas queda fuera de la huella
{
  // En una transacción con lo que a la base local le falte (y se deshace): la cobertura mira la base como la deja el repo.
  const r = correr(
    `begin;\n${PARA_COBERTURA}\n` +
      "select json_agg(json_build_object('n', p.proname, 's', p.prosrc)) from pg_proc p where p.pronamespace = 'retail'::regnamespace;" +
      "\nselect json_agg(c.relname) from pg_class c where c.relnamespace = 'retail'::regnamespace and c.relkind in ('r', 'v', 'm', 'p');" +
      "\nselect json_agg(distinct c.relname) from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgfoid = 'retail.fn_catalogo_cambio()'::regprocedure;" +
      "\nrollback;",
  );
  if (!r.ok) {
    esperar("cobertura: leer las funciones y tablas de la base", false, r.mensaje);
  } else {
    // Las tres últimas líneas son las de las consultas (las migraciones aplicadas antes pueden imprimir alguna).
    const [funcionesJson, tablasJson, contadorJson] = r.salida.split("\n").filter((l) => l.trim()).slice(-3);
    const fuentes = new Map();
    for (const { n, s } of JSON.parse(funcionesJson)) fuentes.set(n, `${fuentes.get(n) ?? ""} ${s}`);
    const tablas = new Set(JSON.parse(tablasJson));
    // Sin comentarios ni textos entre comillas: nombrar una función en un comentario no es llamarla.
    const limpia = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/'(?:[^']|'')*'/g, " ");
    const vistas = new Set();
    const leidas = new Set();
    const pendientes = ["tienda_catalogo", "tienda_filtros", "tienda_probador"];
    while (pendientes.length) {
      const f = pendientes.pop();
      if (vistas.has(f)) continue;
      vistas.add(f);
      for (const id of new Set(limpia(fuentes.get(f) ?? "").match(/\b[a-z_][a-z0-9_]*\b/g) ?? [])) {
        if (tablas.has(id)) leidas.add(id);
        else if (fuentes.has(id) && id !== f) pendientes.push(id);
      }
    }
    const listaDeFunciones = new Set(TEXTO_HUELLA.match(/p\.proname = any \(array\[([\s\S]*?)\]::name\[\]\)/)[1].match(/'([a-z_0-9]+)'/g).map((x) => x.slice(1, -1)));
    const conHash = new Set([...TEXTO_HUELLA.matchAll(/from retail\.([a-z_]+) t\)::text/g)].map((m) => m[1]));
    const porElContador = new Set(JSON.parse(contadorJson));
    // `stock` es el snapshot de `movimientos` (principio 4, INV-01): los cubre la cuenta de movimientos.
    const porLosMovimientos = new Set(["movimientos", "stock"]);
    // Lo que se lee pero no cambia lo que se muestra (cada motivo, verificado en su función).
    const FUERA_A_PROPOSITO = new Map([
      ["transferencias", "fn_existencias_base: solo «en camino», que la tienda no muestra (filtra lo libre > 0 de tallas activas)"],
      ["transferencia_items", "lo mismo que transferencias"],
      ["ubicacion_horario_web", "tienda_sedes: el horario va al JSON de las sedes; el catálogo solo usa sus id (fn_tienda_sedes_web)"],
      ["ubicacion_cierres_web", "lo mismo que el horario"],
    ]);
    const sinCubrir = [...leidas].filter(
      (t) => !conHash.has(t) && !porElContador.has(t) && !porLosMovimientos.has(t) && !FUERA_A_PROPOSITO.has(t),
    );
    esperar(
      `cobertura: las ${leidas.size} tablas que leen las tres lecturas están en la huella (hash, contador del catálogo o movimientos)`,
      leidas.size > 20 && sinCubrir.length === 0,
      `sin cubrir: ${sinCubrir.join(", ") || "—"} · leídas: ${[...leidas].sort().join(", ")}`,
    );
    const faltan = [...vistas].filter((f) => !listaDeFunciones.has(f));
    esperar(
      `cobertura: las ${vistas.size} funciones que arman las lecturas están en la lista de la huella (un reemplazo la cambia)`,
      vistas.size > 20 && faltan.length === 0,
      `faltan en la lista: ${faltan.join(", ")}`,
    );
    const ociosas = [...FUERA_A_PROPOSITO.keys()].filter((t) => !leidas.has(t));
    esperar("cobertura: lo que se deja fuera a propósito todavía se lee (si no, sobra en la lista)", ociosas.length === 0, `ya no se leen: ${ociosas.join(", ")}`);
  }
}

// ---------------------------------------------------------------- 6. Mutantes: cada uno tiene que hacer fallar su caso
esperarValor(
  "MUTANTE sin la Vitrina en la huella: quitar a Emma cambia lo que se ve pero NO la huella (la prueba lo ve)",
  correr(`${preparar(sinLaLinea("from retail.vitrina_productos t)"))}${FOTO}select retail.vitrina_mostrar(array[:'emma']::uuid[], false) as _v \\gset\n${CAMBIO("c0")}`),
  "f|t",
);
esperarValor(
  "MUTANTE sin los movimientos en la huella: la venta cambia lo que se ve pero NO la huella (la prueba lo ve)",
  correr(`${preparar(SIN_MOVIMIENTOS)}${FOTO}${VENDER_EN_LIMA("neg_m")}${CAMBIO("c0_lim")}`),
  "f|t",
);

// ---------------------------------------------------------------- 7. Se puede pegar dos veces
esperarValor(
  "la migración se puede pegar dos veces y la huella sigue respondiendo",
  correr(`begin;\n${TEXTO_MIGRACION}\n${TEXTO_MIGRACION}\nselect length(retail.tienda_catalogo_version());\nrollback;`),
  "32",
);

console.log(`\n${total - fallos}/${total} pasaron${YA_ESTA ? "" : " (con la migración metida en cada transacción: la base local no la tiene)"}.`);
process.exit(fallos ? 1 : 0);
