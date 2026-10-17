#!/usr/bin/env node
/**
 * Vitrina ▸ Probador (ADR-0434, actividades 1 a 3) contra el Postgres local — CAYLA V2: los recortes de las fotos de prenda, los
 * largos y la lista viva.
 *
 * QUÉ PRUEBA. `20261017003000_foto_recortes.sql`, `20261017013000_recorte_foto_sin_responsable.sql` y
 * `20261017015000_vitrina_largos_del_probador.sql`:
 *   1. Permisos: leer y revisar es del módulo `vitrina_web`; anotar un recorte, de quien ve la Vitrina o edita el catálogo (Micaela edita
 *      el catálogo y no ve la Vitrina: anota, pero no lee ni revisa); alguien sin nada de eso no anota. La tabla no la lee nadie directo;
 *      las funciones son de las cuentas del ERP y no de `anon` ni de `tienda_web`.
 *   2. La lectura: solo las fotos de modelos publicados en la web y dentro del bucket, con su original solo si está en el almacén, y el
 *      recorte con su estado cuando existe.
 *   3. Anotar: el PNG tiene que estar en el almacén y la foto existir (en el almacén o en una ficha); nombres, proporción y motivo
 *      válidos; volver a anotar reemplaza; con motivo queda `por_revisar`; firma quien lo hace.
 *   4. Revisar: usar o descartar cambia el estado y deja UNA fila en la Actividad; repetir lo mismo no escribe; sin recorte no se revisa.
 *   5. Las migraciones se pueden volver a correr.
 *   6. Al subir una foto (actividad 2): con el responsable obligatorio, el recorte se anota sin elegir a nadie con la clave
 *      `recorte_foto` y queda a nombre de la cuenta; sin la clave, el candado de siempre lo frena.
 *   7. Los largos (actividad 3): la siembra trae típicos y NO para vestidos, conjuntos, enterizos ni faldas (Felipe, 2026-10-16); el
 *      largo propio va de 5 a 250 cm, solo para una prenda de la vitrina, vuelve al típico con vacío, no sube la versión de la vitrina
 *      y se anota en la Actividad con su nombre; los típicos se cambian y se quitan, y lo que no cambia no escribe; es de la Vitrina.
 *   8. La lista viva: cada prenda publicada con su largo y su típico, sus colores con o sin foto propia, cómo van sus recortes y su
 *      miniatura (el recorte listo antes que la foto).
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK, como Felipe (líder), Micaela (integrante) o una cuenta sin colaborador:
 * nunca se commitea nada. Los archivos del almacén se simulan con filas en `storage.objects` dentro de la misma transacción.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=supabase/migrations/20261017003000_foto_recortes.sql,supabase/migrations/20261017013000_recorte_foto_sin_responsable.sql,supabase/migrations/20261017015000_vitrina_largos_del_probador.sql`
 * mete las migraciones dentro de cada transacción. Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO: el seed («Blusa Emma» y «Falda Renata»; Felipe líder, Micaela integrante que edita el catálogo) y la Vitrina web
 * (20261014225000).
 *
 * USO
 *   pnpm pruebas:vitrina-probador    → necesita el stack local (`npx supabase start`)
 *   pnpm pruebas:vitrina-probador -- --contenedor supabase_db_<mi-pila>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ARG_CONTENEDOR = process.argv.indexOf("--contenedor");
const CONTENEDOR_LOCAL = ARG_CONTENEDOR > 0 ? process.argv[ARG_CONTENEDOR + 1] : "supabase_db_cayla-retail";
const MIGRACIONES = [
  "supabase/migrations/20261017003000_foto_recortes.sql",
  "supabase/migrations/20261017013000_recorte_foto_sin_responsable.sql",
  "supabase/migrations/20261017015000_vitrina_largos_del_probador.sql",
];
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",")
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => readFileSync(f, "utf8"))
      .join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante: edita el catálogo, no ve la Vitrina
const NADIE = "22222222-2222-4222-8222-0000000000ff"; // una cuenta sin colaborador

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
const FOTO_A = "fotos/aaaaaaaa-0000-4000-8000-000000000001.jpg"; // de Emma, con su original en el almacén
const FOTO_B = "fotos/aaaaaaaa-0000-4000-8000-000000000002.jpg"; // de Emma, sin original
const FOTO_C = "fotos/aaaaaaaa-0000-4000-8000-000000000003.jpg"; // de Renata, que NO está publicada
const FOTO_SUBIDA = "fotos/aaaaaaaa-0000-4000-8000-000000000004.jpg"; // recién subida: está en el almacén, todavía sin ficha
const RECORTE_A = "recortes/aaaaaaaa-0000-4000-8000-000000000001.png";
const RECORTE_A2 = "recortes/aaaaaaaa-0000-4000-8000-000000000001-2.png";
const RECORTE_SUBIDA = "recortes/aaaaaaaa-0000-4000-8000-000000000004.png";

// ---- El punto de partida de cada escenario: Emma publicada con dos fotos (una con su original), Renata sin publicar, como Felipe ----
const PREPARAR = `
begin;
${APLICAR_ANTES}
set local request.jwt.claim.sub = '${FELIPE}';
delete from retail.foto_recortes;
delete from retail.vitrina_productos;
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select id as falda from retail.productos where referencia = 'Falda Renata' \\gset
select retail.vitrina_mostrar(array[:'emma']::uuid[], true) \\gset
delete from retail.producto_fotos where producto_id in (:'emma', :'falda');
insert into retail.producto_fotos (producto_id, url, orden, es_principal, color_codigo) values
  (:'emma', '${BASE}${FOTO_A}', 0, true, 'BEI'),
  (:'emma', '${BASE}${FOTO_B}', 1, false, null),
  (:'emma', 'https://otro.sitio/foto.jpg', 2, false, null),
  (:'falda', '${BASE}${FOTO_C}', 0, true, null);
insert into storage.objects (bucket_id, name) values
  ('retail-productos-fotos', '${FOTO_A}'),
  ('retail-productos-fotos', 'originales/aaaaaaaa-0000-4000-8000-000000000001.jpg'),
  ('retail-productos-fotos', '${FOTO_B}'),
  ('retail-productos-fotos', '${FOTO_SUBIDA}'),
  ('retail-productos-fotos', '${RECORTE_A}'),
  ('retail-productos-fotos', '${RECORTE_A2}'),
  ('retail-productos-fotos', '${RECORTE_SUBIDA}');
`;
const COMO = (sub) => `set local request.jwt.claim.sub = '${sub}';\n`;
const FIN = "rollback;\n";

console.log("1. Permisos");
esperarError("sin la Vitrina no se lee (Micaela)", correr(`${PREPARAR}${COMO(MICAELA)}select retail.fn_vitrina_recortes();\n${FIN}`), "vitrina_web_sin_modulo");
esperarValor(
  "quien edita el catálogo anota un recorte (Micaela, al subir una foto)",
  correr(`${PREPARAR}${COMO(MICAELA)}select retail.registrar_recorte('${FOTO_SUBIDA}', '${RECORTE_SUBIDA}', 0.8) ->> 'estado';\n${FIN}`),
  "listo",
);
esperarError(
  "sin la Vitrina ni el catálogo no se anota",
  correr(`${PREPARAR}${COMO(NADIE)}select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A}', 0.8);\n${FIN}`),
  "recorte_sin_permiso",
);
esperarError(
  "sin la Vitrina no se revisa (Micaela)",
  correr(`${PREPARAR}select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A}', 0.8);\n${COMO(MICAELA)}select retail.revisar_recorte('${FOTO_A}', false);\n${FIN}`),
  "vitrina_web_sin_modulo",
);
esperarValor(
  "la tabla no la lee nadie directo y las funciones no son de anon ni de la tienda",
  correr(`select
     has_table_privilege('authenticated', 'retail.foto_recortes', 'SELECT')
  or has_table_privilege('anon', 'retail.foto_recortes', 'SELECT')
  or has_table_privilege('tienda_web', 'retail.foto_recortes', 'SELECT')
  or has_function_privilege('anon', 'retail.registrar_recorte(text, text, numeric, text)', 'EXECUTE')
  or has_function_privilege('tienda_web', 'retail.registrar_recorte(text, text, numeric, text)', 'EXECUTE')
  or has_function_privilege('tienda_web', 'retail.fn_vitrina_recortes()', 'EXECUTE')
  or has_function_privilege('tienda_web', 'retail.revisar_recorte(text, boolean)', 'EXECUTE')
  or has_function_privilege('authenticated', 'retail.fn_vitrina_recorte_anotar(text, text, uuid, text, jsonb)', 'EXECUTE');\n`),
  "f",
);

console.log("2. La lectura de Vitrina ▸ Probador");
esperarValor(
  "solo las fotos de modelos publicados y dentro del bucket",
  correr(`${PREPARAR}select string_agg(f ->> 'foto', ',' order by f ->> 'foto') from jsonb_array_elements(retail.fn_vitrina_recortes() -> 'fotos') f;\n${FIN}`),
  `${FOTO_A},${FOTO_B}`,
);
esperarValor(
  "el original solo si está en el almacén",
  correr(`${PREPARAR}select string_agg(coalesce(f ->> 'original', '—'), ',' order by f ->> 'foto') from jsonb_array_elements(retail.fn_vitrina_recortes() -> 'fotos') f;\n${FIN}`),
  `${BASE}originales/aaaaaaaa-0000-4000-8000-000000000001.jpg,—`,
);
esperarValor(
  "el recorte, con su dirección completa y su estado, cuando existe",
  correr(`${PREPARAR}select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A}', 0.81234, 'huecos') is not null;
select (f -> 'recorte' ->> 'url') || '|' || (f -> 'recorte' ->> 'proporcion') || '|' || (f -> 'recorte' ->> 'estado') || '|' || (f -> 'recorte' ->> 'motivo')
  from jsonb_array_elements(retail.fn_vitrina_recortes() -> 'fotos') f where f ->> 'foto' = '${FOTO_A}';\n${FIN}`),
  `t\n${BASE}${RECORTE_A}|0.8123|por_revisar|huecos`,
);

console.log("3. Anotar un recorte");
esperarValor(
  "firma quien lo hace",
  correr(`${PREPARAR}select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A}', 0.8) is not null;
select (select nombres from public.personas where id = r.creado_por) from retail.foto_recortes r where r.foto = '${FOTO_A}';\n${FIN}`),
  "t\nFelipe",
);
esperarValor(
  "volver a anotar reemplaza el recorte y su estado",
  correr(`${PREPARAR}select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A}', 0.8, 'con_fondo') is not null;
select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A2}', 0.7) is not null;
select recorte || '|' || estado || '|' || coalesce(motivo, '—') || '|' || proporcion from retail.foto_recortes where foto = '${FOTO_A}';
select count(*) from retail.foto_recortes;\n${FIN}`),
  `t\nt\n${RECORTE_A2}|listo|—|0.7000\n1`,
);
esperarError(
  "el PNG tiene que estar en el almacén",
  correr(`${PREPARAR}select retail.registrar_recorte('${FOTO_A}', 'recortes/no-esta.png', 0.8);\n${FIN}`),
  "recorte_archivo_no_existe",
);
esperarError(
  "la foto tiene que existir",
  correr(`${PREPARAR}select retail.registrar_recorte('fotos/no-esta.jpg', '${RECORTE_A}', 0.8);\n${FIN}`),
  "recorte_foto_no_existe",
);
for (const [nombre, foto, recorte, proporcion, motivo] of [
  ["una foto que es un recorte", RECORTE_A, RECORTE_A, "0.8", "null"],
  ["una foto que es un original", "originales/aaaaaaaa-0000-4000-8000-000000000001.jpg", RECORTE_A, "0.8", "null"],
  ["un recorte que no es PNG", FOTO_A, FOTO_B, "0.8", "null"],
  ["una proporción imposible", FOTO_A, RECORTE_A, "0", "null"],
  ["un motivo que no existe", FOTO_A, RECORTE_A, "0.8", "'otro'"],
]) {
  esperarError(
    `no se anota ${nombre}`,
    correr(`${PREPARAR}select retail.registrar_recorte('${foto}', '${recorte}', ${proporcion}, ${motivo});\n${FIN}`),
    "recorte_datos_invalidos",
  );
}

console.log("4. Usar o descartar");
esperarValor(
  "usar uno por revisar lo deja listo y lo anota una vez",
  correr(`${PREPARAR}select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A}', 0.8, 'huecos') is not null;
select retail.revisar_recorte('${FOTO_A}', true) ->> 'estado';
select retail.revisar_recorte('${FOTO_A}', true) ->> 'estado';
select count(*) from retail.actividad where tabla = 'foto_recortes' and registro_id = '${FOTO_A}' and accion = 'vitrina_recorte_usado';
select descripcion from retail.actividad where tabla = 'foto_recortes' and registro_id = '${FOTO_A}';\n${FIN}`),
  "t\nlisto\nlisto\n1\nusó en el probador el recorte de una foto de «Blusa Emma»",
);
esperarValor(
  "descartar lo saca del probador sin tocar la foto",
  correr(`${PREPARAR}select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A}', 0.8) is not null;
select retail.revisar_recorte('${FOTO_A}', false) ->> 'estado';
select count(*) from retail.producto_fotos where url = '${BASE}${FOTO_A}';
select count(*) from retail.actividad where tabla = 'foto_recortes' and registro_id = '${FOTO_A}' and accion = 'vitrina_recorte_descartado';\n${FIN}`),
  "t\ndescartado\n1\n1",
);
esperarError(
  "sin recorte no hay nada que revisar",
  correr(`${PREPARAR}select retail.revisar_recorte('${FOTO_B}', true);\n${FIN}`),
  "recorte_no_existe",
);

console.log("5. Las migraciones se pueden volver a correr");
const TODAS = MIGRACIONES.map((m) => readFileSync(m, "utf8")).join("\n");
esperarValor("dos veces seguidas, sin error", correr(`begin;\n${TODAS}\n${TODAS}\nselect 'ok';\nrollback;\n`), "ok");

console.log("6. Al subir una foto: sin el combo (recorte_foto)");
const EXIGE_RESPONSABLE = `insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;\n`;
const SIN_COMBO = `select set_config('request.headers', '{"x-responsable-omitido": "recorte_foto"}', true) \\g /dev/null\n`;
esperarValor(
  "con el responsable obligatorio, quien sube la foto anota su recorte sin elegir a nadie y queda a su nombre",
  correr(`${PREPARAR}${EXIGE_RESPONSABLE}${COMO(MICAELA)}${SIN_COMBO}select retail.registrar_recorte('${FOTO_SUBIDA}', '${RECORTE_SUBIDA}', 0.8) ->> 'estado';
select (select nombres from public.personas where id = r.creado_por) from retail.foto_recortes r where r.foto = '${FOTO_SUBIDA}';\n${FIN}`),
  "listo\nMicaela",
);
esperarError(
  "sin la clave, el responsable obligatorio lo frena",
  correr(`${PREPARAR}${EXIGE_RESPONSABLE}${COMO(MICAELA)}select retail.registrar_recorte('${FOTO_SUBIDA}', '${RECORTE_SUBIDA}', 0.8);\n${FIN}`),
  "responsable_requerido",
);

console.log("7. Los largos");
const PRENDA = (campo) => `(select p -> '${campo}' from jsonb_array_elements(retail.fn_vitrina_probador() -> 'prendas') p where p ->> 'producto_id' = :'emma')`;
const PRENDA_TEXTO = (campo) => `(select p ->> '${campo}' from jsonb_array_elements(retail.fn_vitrina_probador() -> 'prendas') p where p ->> 'producto_id' = :'emma')`;
esperarValor(
  "la siembra trae típicos, pero no para vestidos, conjuntos, enterizos ni faldas",
  correr(`select string_agg(c.prefijo, ',' order by c.prefijo) from retail.vitrina_largos_tipicos lt join retail.categorias c on c.id = lt.categoria_id
  where c.prefijo in ('VES', 'CON', 'ENT', 'FAL', 'CMS', 'PAN');\n`),
  "CMS,PAN",
);
esperarValor(
  "el largo propio se anota, se lee en la lista y vuelve al típico con vacío, sin subir la versión de la vitrina",
  correr(`${PREPARAR}select version as v0 from retail.vitrina_productos where producto_id = :'emma' \\gset
select retail.vitrina_guardar_largo(:'emma', 62) ->> 'largo';
select ${PRENDA_TEXTO("largo")} || '|' || ${PRENDA_TEXTO("tipico")};
select retail.vitrina_guardar_largo(:'emma', null) ->> 'largo';
select coalesce(${PRENDA_TEXTO("largo")}, '—') || '|' || ((select version from retail.vitrina_productos where producto_id = :'emma') - :v0);\n${FIN}`),
  "62\n62|65\n\n—|0",
);
esperarValor(
  "cada cambio queda en la Actividad con el nombre de la prenda; repetir el mismo largo no escribe",
  correr(`${PREPARAR}select retail.vitrina_guardar_largo(:'emma', 62) is not null;
select retail.vitrina_guardar_largo(:'emma', 62) is not null;
select count(*) || '|' || max(descripcion) from retail.actividad where accion = 'vitrina_largo' and registro_id = :'emma' and anotado_at >= now();\n${FIN}`),
  "t\nt\n1|anotó el largo de «Blusa Emma» para el probador: 62 cm",
);
for (const [nombre, largo] of [["menos de 5 cm", 4], ["más de 250 cm", 251]]) {
  esperarError(`no se anota un largo de ${nombre}`, correr(`${PREPARAR}select retail.vitrina_guardar_largo(:'emma', ${largo});\n${FIN}`), "vitrina_largo_invalido");
}
esperarError(
  "solo se anota el largo de una prenda de la vitrina",
  correr(`${PREPARAR}select retail.vitrina_guardar_largo(:'falda', 55);\n${FIN}`),
  "vitrina_largo_sin_vitrina",
);
esperarError(
  "es de la Vitrina: sin el módulo no se anota (Micaela)",
  correr(`${PREPARAR}${COMO(MICAELA)}select retail.vitrina_guardar_largo(:'emma', 62);\n${FIN}`),
  "vitrina_web_sin_modulo",
);
esperarValor(
  "un típico se pone y se quita; lo que no cambia no escribe; queda una fila en la Actividad por cada guardado que cambia algo",
  correr(`${PREPARAR}select id as ves from retail.categorias where prefijo = 'VES' \\gset
select id as cms from retail.categorias where prefijo = 'CMS' \\gset
select count(*) as antes from retail.actividad where accion = 'vitrina_largos_tipicos' \\gset
select retail.vitrina_guardar_largos_tipicos(jsonb_build_array(jsonb_build_object('categoria_id', :'ves', 'largo_cm', 110), jsonb_build_object('categoria_id', :'cms', 'largo_cm', 65))) ->> 'cambios';
select (select largo_cm from retail.vitrina_largos_tipicos where categoria_id = :'ves');
select retail.vitrina_guardar_largos_tipicos(jsonb_build_array(jsonb_build_object('categoria_id', :'ves', 'largo_cm', null))) ->> 'cambios';
select count(*) from retail.vitrina_largos_tipicos where categoria_id = :'ves';
select count(*) - :antes from retail.actividad where accion = 'vitrina_largos_tipicos';\n${FIN}`),
  "1\n110\n1\n0\n2",
);
esperarError(
  "un típico fuera de rango no se guarda",
  correr(`${PREPARAR}select id as ves from retail.categorias where prefijo = 'VES' \\gset
select retail.vitrina_guardar_largos_tipicos(jsonb_build_array(jsonb_build_object('categoria_id', :'ves', 'largo_cm', 300)));\n${FIN}`),
  "vitrina_largo_invalido",
);

console.log("8. La lista viva");
esperarValor(
  "cada color dice si tiene foto propia (Emma: BEI con foto, NEG sin), y los recortes cuentan por estado",
  correr(`${PREPARAR}select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A}', 0.8) is not null;
select string_agg((c ->> 'codigo') || ':' || (c ->> 'foto'), ',' order by c ->> 'codigo') from jsonb_array_elements(${PRENDA("colores")}) c;
select ${PRENDA("recortes")} ->> 'listos', ${PRENDA("recortes")} ->> 'sin', ${PRENDA_TEXTO("fotos")};\n${FIN}`),
  "t\nBEI:true,NEG:false\n1|1|2",
);
esperarValor(
  "la miniatura es el recorte listo antes que la foto",
  correr(`${PREPARAR}select ${PRENDA_TEXTO("miniatura_es_recorte")};
select retail.registrar_recorte('${FOTO_A}', '${RECORTE_A}', 0.8) is not null;
select ${PRENDA_TEXTO("miniatura")} = '${BASE}${RECORTE_A}', ${PRENDA_TEXTO("miniatura_es_recorte")};\n${FIN}`),
  "false\nt\nt|true",
);
esperarError("es de la Vitrina: sin el módulo no se lee (Micaela)", correr(`${PREPARAR}${COMO(MICAELA)}select retail.fn_vitrina_probador();\n${FIN}`), "vitrina_web_sin_modulo");

console.log(`\n${total - fallos} de ${total} bien.`);
process.exit(fallos ? 1 : 0);
