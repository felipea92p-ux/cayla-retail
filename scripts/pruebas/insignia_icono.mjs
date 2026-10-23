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
 *   · La migración se puede pegar dos veces y deja UNA sola firma de `fijar_icono_etiqueta`.
 *
 * CÓMO. Cada escenario en su propia transacción con ROLLBACK (como `campanas_llave_unica.mjs`): la base compartida queda igual. Los
 * permisos se prueban como Micaela (integrante de Trujillo, sin Insignias ni Campañas en el seed): el módulo se le da DENTRO de la
 * transacción.
 *
 * DA POR SENTADO: el seed (Felipe líder, Micaela integrante, «Blusa Emma» con precio y tallas, Tienda Trujillo y Tienda Lima) y las
 * migraciones 20261022203000 (ADR-0476) y 20261023182000 (ADR-0489).
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261023203000_insignia_con_dibujo_elegido.sql` mete la migración dentro
 * de cada transacción (que se revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
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
const APLICAR_ANTES = process.env.APLICAR_ANTES ? readFileSync(process.env.APLICAR_ANTES, "utf8") : "";
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
    const hay = correr("select to_regprocedure('retail.fijar_icono_etiqueta(uuid, text)') is not null;");
    if (!hay.ok || hay.salida !== "t") {
      console.error(`Falta retail.fijar_icono_etiqueta: aplica ${MIGRACION} o corre con APLICAR_ANTES=${MIGRACION}`);
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
      const r = correr(`${PREPARAR}select concat_ws('|', has_function_privilege('tienda_web', 'retail.fijar_icono_etiqueta(uuid, text)', 'EXECUTE'), has_function_privilege('anon', 'retail.fijar_icono_etiqueta(uuid, text)', 'EXECUTE'), has_function_privilege('authenticated', 'retail.fijar_icono_etiqueta(uuid, text)', 'EXECUTE'));\nrollback;`);
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

  // ---- 6. La migración se puede pegar dos veces, y queda UNA firma ----
  {
    const sql = readFileSync(MIGRACION, "utf8");
    const r = correr(`begin;\n${sql}\n${sql}\nselect (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fijar_icono_etiqueta')::text || '|' ||
  (select count(*) from pg_constraint where conname = 'etiquetas_icono_forma' and conrelid = 'retail.etiquetas'::regclass)::text;\nrollback;`);
    esperarLinea("la migración se puede pegar dos veces: una sola firma de fijar_icono_etiqueta y un solo candado de forma", r, "1|1");
  }

  console.log(`\n${total - fallos}/${total} pruebas pasaron`);
  process.exit(fallos ? 1 : 0);
}

main();
