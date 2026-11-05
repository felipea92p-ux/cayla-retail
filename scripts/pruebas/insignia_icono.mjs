#!/usr/bin/env node
/**
 * Pruebas del dibujo elegido de una insignia (`20261023203000_insignia_con_dibujo_elegido.sql`, ADR-0490, Felipe 2026-10-23: «poder elegir
 * el ícono de una insignia al crearla») contra el Postgres local.
 *
 * QUÉ PRUEBA.
 *   · La columna `etiquetas.icono` existe, nace vacía (todas las insignias de antes siguen «según el nombre») y solo exige su FORMA
 *     (minúsculas, 3 a 20 letras): una clave que el código no conoce se guarda y se ignora al leer, nunca rompe.
 *   · `fijar_icono_etiqueta`: fija, cambia y quita (null o vacío) el dibujo de una insignia y de una campaña; rechaza una forma
 *     inválida (`icono_no_valido`) y una insignia que ya no existe (`etiqueta_no_existe`).
 *   · La llave es la de cada etiqueta (ADR-0476): sin ningún módulo, ninguna de las dos; con Insignias, las dos; con Campañas, solo la
 *     campaña, no una insignia suelta. `tienda_web` y `anon` no la llaman.
 *   · Crear una insignia CON su dibujo (el alta directa de siempre) funciona y no cambia cómo nace (aprobada para quien tiene la llave).
 *   · La tienda lo recibe: `tienda_ficha` trae `{id, nombre, icono}` de cada insignia (icono null = según el nombre), y como `tienda_web`.
 *   · La imagen propia (`icono_imagen`, la ruta de su archivo en `retail-insignias`): se fija y se quita con la misma función, no convive con un
 *     dibujo de la lista (fijar uno borra la otra), solo acepta la ruta de ESTA insignia con la forma que sube el ERP (nunca la de otra, un `..` o
 *     una dirección), y la tienda la recibe en `{id, nombre, icono, imagen, descuento}`.
 *   · La silueta (`20261023221000_insignia_imagen_como_silueta.sql`, ADR-0490 act. b): `icono_imagen_silueta` nace falso, solo existe con una
 *     imagen (la función dice `silueta_sin_imagen` y la tabla lo exige con su CHECK), fijar un dibujo o quitar la imagen la apaga, la llamada de
 *     antes (tres datos) sigue valiendo, y la tienda la recibe en `{id, nombre, icono, imagen, silueta, descuento}`.
 *   · El almacén: solo quien configura una insignia o una campaña puede SUBIR al bucket `retail-insignias` (si este Postgres tiene Storage).
 *   · Las migraciones se pueden pegar dos veces y dejan UNA sola firma de `fijar_icono_etiqueta` (la de cuatro datos).
 *
 * CÓMO. Cada escenario en su propia transacción con ROLLBACK (como `campanas_llave_unica.mjs`): la base compartida queda igual. Los
 * permisos se prueban como Micaela (integrante de Trujillo, sin Insignias ni Campañas en el seed): el módulo se le da DENTRO de la
 * transacción.
 *
 * DA POR SENTADO: el seed (Felipe líder, Micaela integrante, «Blusa Emma» con precio y tallas, Tienda Trujillo y Tienda Lima) y las
 * migraciones 20261022203000 (ADR-0476) y 20261023182000 (ADR-0489).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<archivo>[,<archivo>…]` mete esas migraciones, en ese orden, dentro de cada transacción (que se
 * revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * USO
 *   pnpm pruebas:insignia-icono                                  → con las migraciones ya aplicadas en el Postgres local
 *   pnpm pruebas:insignia-icono -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261023203000_insignia_con_dibujo_elegido.sql";
const MIGRACION_SILUETA = "supabase/migrations/20261023221000_insignia_imagen_como_silueta.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",").map((f) => readFileSync(f.trim(), "utf8")).join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante, sin Insignias ni Campañas en el seed

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
    if (detalle) console.log(`    ${String(detalle).trim().split("\n").slice(0, 6).join("\n    ")}`);
  }
}
const ultimaLinea = (r) => (r.ok ? r.salida.split("\n").filter(Boolean).at(-1) ?? "" : "");
const esperarLinea = (nombre, r, esperado) => esperar(nombre, ultimaLinea(r) === esperado, r.ok ? `dio «${ultimaLinea(r)}», se esperaba «${esperado}»` : r.mensaje);
const esperarError = (nombre, r, contiene) => esperar(nombre, !r.ok && r.mensaje.includes(contiene), r.ok ? `pasó y debía fallar con «${contiene}»: ${r.salida}` : r.mensaje);

// Como Felipe, con una insignia suelta y una campaña de prueba (nacen aprobadas) y sin dibujo elegido.
const PREPARAR = `begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
insert into retail.etiquetas (nombre) values ('ZZ Insignia de prueba') returning id as ins \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña de prueba', 'campana') returning id as camp \\gset
`;
const COMO_MICAELA = `set local request.jwt.claim.sub = '${MICAELA}';\n`;
const MODULO_A_INTEGRANTE = (clave) =>
  `insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable)
  values ('${clave}', 'Catálogo', '${clave}', 'prueba', 135, false, true) on conflict (clave) do nothing;
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), '${clave}') on conflict do nothing;\n`;
const ICONO = (id) => `(select coalesce(icono, '-') from retail.etiquetas where id = :'${id}')`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regprocedure('retail.fijar_icono_etiqueta(uuid, text, text, boolean)') is not null;");
    if (!hay.ok || hay.salida !== "t") {
      console.error(`Falta retail.fijar_icono_etiqueta(uuid, text, text, boolean): aplica ${MIGRACION} y ${MIGRACION_SILUETA} o corre con APLICAR_ANTES=${MIGRACION},${MIGRACION_SILUETA}`);
      process.exit(2);
    }
  }

  // ---- 1. La columna: vacía, y solo exige la forma ----
  esperarLinea(
    "ninguna insignia de antes tiene dibujo elegido (todas siguen «según el nombre»), y la columna admite vacío",
    correr(`${PREPARAR}select concat_ws('|', (select count(*) from retail.etiquetas where icono is not null), (select is_nullable from information_schema.columns where table_schema = 'retail' and table_name = 'etiquetas' and column_name = 'icono'));\nrollback;`),
    "0|YES",
  );
  for (const [clave, bien] of [
    ["halloween", true],
    ["zzzz", true], // una clave bien formada que el código no conoce: se guarda y se ignora al leer
    ["Halloween", false],
    ["ab", false],
    ["con espacio", false],
    ["con-guion", false],
    ["abcdefghijklmnopqrstu", false], // 21 letras
  ]) {
    const r = correr(`${PREPARAR}update retail.etiquetas set icono = '${clave}' where id = :'ins';\nselect ${ICONO("ins")};\nrollback;`);
    esperar(
      bien ? `la clave «${clave}» se guarda` : `la clave «${clave}» no se guarda (forma inválida)`,
      bien ? ultimaLinea(r) === clave : !r.ok && r.mensaje.includes("etiquetas_icono_forma"),
      r.ok ? r.salida : r.mensaje,
    );
  }

  // ---- 2. Fijar, cambiar y quitar el dibujo ----
  esperarLinea(
    "fija el dibujo de una insignia, lo cambia, y con null o vacío lo quita (vuelve a «según el nombre»)",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', 'halloween');
select ${ICONO("ins")} as a \\gset
select retail.fijar_icono_etiqueta(:'ins', 'gato');
select ${ICONO("ins")} as b \\gset
select retail.fijar_icono_etiqueta(:'ins', '   ');
select ${ICONO("ins")} as c \\gset
select retail.fijar_icono_etiqueta(:'ins', 'tierra');
select retail.fijar_icono_etiqueta(:'ins', null);
select concat_ws('|', :'a', :'b', :'c', ${ICONO("ins")});\nrollback;`),
    "halloween|gato|-|-",
  );
  esperarLinea(
    "lo mismo con una campaña (otra llave, la misma puerta)",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'camp', 'aniversario');\nselect ${ICONO("camp")};\nrollback;`),
    "aniversario",
  );
  esperarError(
    "una forma inválida se rechaza con su pista (icono_no_valido) y no cambia nada",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', 'Con Mayúsculas');\nrollback;`),
    "icono_no_valido",
  );
  esperarError(
    "una insignia que no existe se rechaza con su pista (etiqueta_no_existe)",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(gen_random_uuid(), 'gato');\nrollback;`),
    "Esa insignia ya no existe",
  );
  esperarLinea(
    "fijar el mismo dibujo dos veces no escribe de nuevo",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', 'gato');
select xmin::text as antes from retail.etiquetas where id = :'ins' \\gset
select retail.fijar_icono_etiqueta(:'ins', 'gato');
select (xmin::text = :'antes')::text from retail.etiquetas where id = :'ins';\nrollback;`),
    "true",
  );

  // ---- 3. La llave es la de cada etiqueta (ADR-0476) ----
  esperarError(
    "sin ningún módulo, una integrante no cambia el dibujo de una insignia",
    correr(`${PREPARAR}${COMO_MICAELA}select retail.fijar_icono_etiqueta(:'ins', 'gato');\nrollback;`),
    "necesita el módulo",
  );
  esperarError(
    "ni el de una campaña",
    correr(`${PREPARAR}${COMO_MICAELA}select retail.fijar_icono_etiqueta(:'camp', 'gato');\nrollback;`),
    "necesita el módulo",
  );
  esperarLinea(
    "con Insignias, cambia el de una insignia y el de una campaña",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE("etiquetas")}${COMO_MICAELA}select retail.fijar_icono_etiqueta(:'ins', 'gato');
select retail.fijar_icono_etiqueta(:'camp', 'navidad');
select concat_ws('|', ${ICONO("ins")}, ${ICONO("camp")});\nrollback;`),
    "gato|navidad",
  );
  esperarLinea(
    "con Campañas, cambia el de una campaña…",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE("campanas")}${COMO_MICAELA}select retail.fijar_icono_etiqueta(:'camp', 'navidad');\nselect ${ICONO("camp")};\nrollback;`),
    "navidad",
  );
  esperarError(
    "…pero no el de una insignia suelta (eso es de Insignias)",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE("campanas")}${COMO_MICAELA}select retail.fijar_icono_etiqueta(:'ins', 'gato');\nrollback;`),
    "necesita el módulo",
  );
  esperar(
    "tienda_web y anon no llaman a fijar_icono_etiqueta",
    (() => {
      const r = correr(`${PREPARAR}select concat_ws('|', has_function_privilege('tienda_web', 'retail.fijar_icono_etiqueta(uuid, text, text, boolean)', 'EXECUTE'), has_function_privilege('anon', 'retail.fijar_icono_etiqueta(uuid, text, text, boolean)', 'EXECUTE'), has_function_privilege('authenticated', 'retail.fijar_icono_etiqueta(uuid, text, text, boolean)', 'EXECUTE'));\nrollback;`);
      return ultimaLinea(r) === "f|f|t";
    })(),
  );

  // ---- 4. Crear con su dibujo (el alta directa de siempre) ----
  esperarLinea(
    "una insignia que se crea con su dibujo nace aprobada y con él (quien tiene Insignias)",
    correr(`${PREPARAR}${MODULO_A_INTEGRANTE("etiquetas")}${COMO_MICAELA}insert into retail.etiquetas (nombre, icono) values ('ZZ Con su dibujo', 'pastel') returning id as nueva \\gset
select estado || '|' || icono from retail.etiquetas where id = :'nueva';\nrollback;`),
    "aprobado|pastel",
  );

  // ---- 5. La tienda lo recibe: tienda_ficha trae {id, nombre, icono} ----
  // El punto de partida de `tienda_insignias.mjs`: la vitrina del seed está vacía, se publica «Blusa Emma» (Trujillo y Lima en la web).
  const PUBLICAR = `${PREPARAR}update retail.vitrina_productos set publicado = false where publicado;
update retail.ubicacion_datos_web set mostrar = false where mostrar;
select id as pid from retail.productos where referencia = 'Blusa Emma' \\gset
select categoria_id as cat from retail.productos where id = :'pid' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
update retail.ubicaciones set whatsapp_numero = '987000001' where id = :'tru';
update retail.ubicaciones set whatsapp_numero = '987000002' where id = :'lim';
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar)
values (:'tru', 'ZZ Trujillo', 'Av. de prueba 1', true), (:'lim', 'ZZ Lima', 'Av. de prueba 2', true)
on conflict (ubicacion_id) do update set nombre_web = excluded.nombre_web, direccion = excluded.direccion, mostrar = true;
select retail.vitrina_mostrar(array[:'pid']::uuid[], true) \\gset
select id as v from retail.variantes where producto_id = :'pid' and activo order by id limit 1 \\gset
delete from retail.variante_etiquetas where variante_id in (select id from retail.variantes where producto_id = :'pid');
delete from retail.etiqueta_categorias where categoria_id = :'cat';
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v', :'ins');
`;
  esperarLinea(
    "la ficha trae la insignia con su dibujo elegido, y con icono null si no se eligió (según el nombre)",
    correr(`${PUBLICAR}select concat_ws('|',
  coalesce((retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0 ->> 'icono'), 'NULL'),
  (retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0) ? 'icono') as sin_elegir \\gset
select retail.fijar_icono_etiqueta(:'ins', 'halloween');
select concat_ws('|', :'sin_elegir', retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0 ->> 'icono');\nrollback;`),
    "NULL|t|halloween",
  );
  esperarLinea(
    "una campaña con descuento viene marcada (descuento true) y con su dibujo elegido: de ahí lo toma el chip del descuento",
    correr(`${PUBLICAR}insert into retail.etiquetas (nombre, estilo, descuento_pct, icono, vigente_desde, vigente_hasta) values ('ZZ Con descuento', 'campana', 25, 'gato', retail.fn_hoy_lima(), retail.fn_hoy_lima() + 3) returning id as desc_id \\gset
insert into retail.variante_etiquetas (variante_id, etiqueta_id) values (:'v', :'desc_id');
select concat_ws('|', x ->> 'descuento', x ->> 'icono', retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'campana' ->> 'id' = :'desc_id')
  from jsonb_array_elements(retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias') x where x ->> 'id' = :'desc_id';\nrollback;`),
    "true|gato|t",
  );
  esperarLinea(
    "…también como tienda_web",
    correr(`${PUBLICAR}select retail.fijar_icono_etiqueta(:'ins', 'gato');
grant tienda_web to current_user with set true;
set local role tienda_web;
select retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0 ->> 'icono';\nrollback;`),
    "gato",
  );

  // ---- 5b. La imagen propia: su ruta, que es de ESTA insignia, y que no convive con un dibujo de la lista ----
  const RUTA = (id = "ins") => `'insignias/' || :'${id}' || '/aaaaaaaa-1111-4222-8333-444444444444.webp'`;
  esperarLinea(
    "fija la imagen propia (su ruta) y la quita con null",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', null, ${RUTA()});
select coalesce(icono_imagen, '-') as a from retail.etiquetas where id = :'ins' \\gset
select retail.fijar_icono_etiqueta(:'ins', null, null);
select concat_ws('|', :'a' = 'insignias/' || :'ins' || '/aaaaaaaa-1111-4222-8333-444444444444.webp', (select coalesce(icono_imagen, '-') from retail.etiquetas where id = :'ins'));\nrollback;`),
    "t|-",
  );
  esperarLinea(
    "una imagen y un dibujo de la lista no conviven: fijar uno borra el otro",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', 'gato');
select retail.fijar_icono_etiqueta(:'ins', null, ${RUTA()});
select concat_ws('|', coalesce(icono, '-'), (icono_imagen is not null)::text) as con_imagen from retail.etiquetas where id = :'ins' \\gset
select retail.fijar_icono_etiqueta(:'ins', 'tierra');
select concat_ws('|', :'con_imagen', coalesce(icono, '-'), coalesce(icono_imagen, '-')) from retail.etiquetas where id = :'ins';\nrollback;`),
    "-|true|tierra|-",
  );
  esperarError("pedir las dos a la vez se rechaza (icono_o_imagen)", correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', 'gato', ${RUTA()});\nrollback;`), "icono_o_imagen");
  esperarError(
    "la imagen de OTRA insignia se rechaza (imagen_no_valida)",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', null, 'insignias/' || :'camp' || '/aaaaaaaa-1111-4222-8333-444444444444.webp');\nrollback;`),
    "imagen_no_valida",
  );
  for (const [nombre, ruta, contiene] of [
    ["una ruta que no es .webp", "'insignias/' || :'ins' || '/aaaaaaaa-1111-4222-8333-444444444444.png'", "imagen_no_valida"],
    ["una dirección completa", "'https://x.test/insignias/' || :'ins' || '/aaaaaaaa-1111-4222-8333-444444444444.webp'", "imagen_no_valida"],
    ["un «..» en la ruta", "'insignias/' || :'ins' || '/../aaaaaaaa-1111-4222-8333-444444444444.webp'", "etiquetas_icono_imagen_forma"],
    ["un archivo con nombre que no es de la carpeta", "'insignias/' || :'ins' || '/foto.webp'", "etiquetas_icono_imagen_forma"],
  ]) {
    esperarError(`${nombre} se rechaza`, correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', null, ${ruta});\nrollback;`), contiene);
  }
  esperarError(
    "el candado de la tabla también: dos columnas a la vez, o la imagen de otra, no se guardan por un UPDATE directo",
    correr(`${PREPARAR}update retail.etiquetas set icono = 'gato', icono_imagen = ${RUTA()} where id = :'ins';\nrollback;`),
    "etiquetas_icono_o_imagen",
  );
  esperarError(
    "…ni la ruta de otra insignia por UPDATE directo",
    correr(`${PREPARAR}update retail.etiquetas set icono_imagen = 'insignias/' || :'camp' || '/aaaaaaaa-1111-4222-8333-444444444444.webp' where id = :'ins';\nrollback;`),
    "etiquetas_icono_imagen_es_suya",
  );
  esperarLinea(
    "la ficha trae la imagen (su ruta) de la insignia, y null si no tiene",
    correr(`${PUBLICAR}select ((retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0) ? 'imagen' and (retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0 ->> 'imagen') is null) as sin \\gset
select retail.fijar_icono_etiqueta(:'ins', null, ${RUTA()});
select concat_ws('|', :'sin', retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0 ->> 'imagen' = 'insignias/' || :'ins' || '/aaaaaaaa-1111-4222-8333-444444444444.webp');\nrollback;`),
    "t|t",
  );

  // ---- 5d. La silueta: la imagen propia se pinta con el color del lugar (ADR-0490, act. b) ----
  esperarLinea(
    "la silueta nace falsa: ninguna insignia de antes la tiene",
    correr(`select (select count(*) filter (where icono_imagen_silueta) from retail.etiquetas)::text || '|' || (select is_nullable from information_schema.columns where table_schema = 'retail' and table_name = 'etiquetas' and column_name = 'icono_imagen_silueta');`),
    "0|NO",
  );
  esperarLinea(
    "fija la imagen como silueta y la deja de ser al quitarla o al elegir un dibujo",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', null, ${RUTA()}, true);
select icono_imagen_silueta::text as a from retail.etiquetas where id = :'ins' \\gset
select retail.fijar_icono_etiqueta(:'ins', 'gato');
select icono_imagen_silueta::text as b from retail.etiquetas where id = :'ins' \\gset
select retail.fijar_icono_etiqueta(:'ins', null, ${RUTA()}, true);
select retail.fijar_icono_etiqueta(:'ins', null, null);
select concat_ws('|', :'a', :'b', (select icono_imagen_silueta::text from retail.etiquetas where id = :'ins'));\nrollback;`),
    "true|false|false",
  );
  esperarLinea(
    "cambiar de silueta a imagen a todo color es una escritura más (la misma imagen, sin silueta)",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', null, ${RUTA()}, true);
select retail.fijar_icono_etiqueta(:'ins', null, ${RUTA()}, false);
select (icono_imagen is not null)::text || '|' || icono_imagen_silueta::text from retail.etiquetas where id = :'ins';\nrollback;`),
    "true|false",
  );
  esperarError("una silueta sin imagen se rechaza (silueta_sin_imagen)", correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', 'gato', null, true);\nrollback;`), "silueta_sin_imagen");
  esperarError(
    "el candado de la tabla también: una silueta sin imagen no se guarda por un UPDATE directo",
    correr(`${PREPARAR}update retail.etiquetas set icono_imagen_silueta = true where id = :'ins';\nrollback;`),
    "etiquetas_icono_silueta_con_imagen",
  );
  esperarLinea(
    "la llamada de antes (tres datos) sigue valiendo y es «sin silueta»",
    correr(`${PREPARAR}select retail.fijar_icono_etiqueta(:'ins', null, ${RUTA()});
select icono_imagen_silueta::text from retail.etiquetas where id = :'ins';\nrollback;`),
    "false",
  );
  esperarLinea(
    "la ficha trae la silueta de la insignia (falsa si no la tiene)",
    correr(`${PUBLICAR}select (retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0 ->> 'silueta') as sin \\gset
select retail.fijar_icono_etiqueta(:'ins', null, ${RUTA()}, true);
select concat_ws('|', :'sin', retail.tienda_ficha(:'pid', null) -> 'prenda' -> 'insignias' -> 0 ->> 'silueta');\nrollback;`),
    "false|true",
  );

  // ---- 5c. El almacén: solo quien configura una insignia o una campaña puede SUBIR (si este Postgres tiene Storage) ----
  const conStorage = correr("select to_regclass('storage.objects') is not null and exists (select 1 from storage.buckets where id = 'retail-insignias');");
  if (conStorage.ok && conStorage.salida === "t") {
    const SUBIR = (id = "ins") => `set local role authenticated;\ninsert into storage.objects (bucket_id, name) values ('retail-insignias', 'insignias/' || :'${id}' || '/aaaaaaaa-1111-4222-8333-444444444444.webp');\nselect 'subido';`;
    esperarLinea("el líder sube una imagen de insignia", correr(`${PREPARAR}${SUBIR()}\nrollback;`), "subido");
    esperarError("una integrante sin ningún módulo no puede subir", correr(`${PREPARAR}${COMO_MICAELA}${SUBIR()}\nrollback;`), "row-level security");
    esperarLinea("con Insignias, sí", correr(`${PREPARAR}${MODULO_A_INTEGRANTE("etiquetas")}${COMO_MICAELA}${SUBIR()}\nrollback;`), "subido");
    esperarLinea("con Campañas, sí (una campaña también lleva su imagen)", correr(`${PREPARAR}${MODULO_A_INTEGRANTE("campanas")}${COMO_MICAELA}${SUBIR("camp")}\nrollback;`), "subido");
    esperarError(
      "en otro almacén esta política no sirve: subir a retail-campanas sigue pidiendo su propio módulo",
      correr(`${PREPARAR}${MODULO_A_INTEGRANTE("etiquetas")}${COMO_MICAELA}set local role authenticated;\ninsert into storage.objects (bucket_id, name) values ('retail-campanas', 'campanas/x/y.webp');\nrollback;`),
      "row-level security",
    );
  } else {
    console.log("— (sin Storage en este Postgres: la política de subida de retail-insignias no se prueba aquí) —");
  }

  // ---- 6. La migración se puede pegar dos veces, y queda UNA firma ----
  {
    // En ese orden: la 203000 crea la firma de tres datos y la 221000 la reemplaza por la de cuatro; la 221000 pegada otra vez no cambia nada. (La 203000
    // no se repite DESPUÉS de la 221000: volvería a crear la firma de tres datos. En producción cada una se pega una vez, en su orden.)
    const sql = `${readFileSync(MIGRACION, "utf8")}\n${readFileSync(MIGRACION_SILUETA, "utf8")}\n${readFileSync(MIGRACION_SILUETA, "utf8")}`;
    // Se parte del estado «solo 203000» (la base de prueba ya tiene la 221000): se quita lo que ella agrega y se pegan en orden.
    const ANTES_DE_LA_221000 = `drop function if exists retail.fijar_icono_etiqueta(uuid, text, text, boolean);
alter table retail.etiquetas drop constraint if exists etiquetas_icono_silueta_con_imagen, drop column if exists icono_imagen_silueta;\n`;
    const r = correr(`begin;\n${ANTES_DE_LA_221000}${sql}\nselect (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fijar_icono_etiqueta')::text || '|' ||
  (select count(*) from pg_constraint where conname like 'etiquetas_icono%' and conrelid = 'retail.etiquetas'::regclass)::text;\nrollback;`);
    esperarLinea("las migraciones se pegan en su orden y la última se puede repetir: una sola firma de fijar_icono_etiqueta y cinco candados (forma, forma de la imagen, la imagen es suya, o dibujo o imagen, la silueta es de una imagen)", r, "1|5");
  }

  console.log(`\n${total - fallos}/${total} pruebas pasaron`);
  process.exit(fallos ? 1 : 0);
}

main();
