#!/usr/bin/env node
/**
 * Tienda web ▸ Conf. Tienda (ADR-0518) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261026162000_tienda_web_conf_tienda.sql`, una sección por actividad:
 *   ACTIVIDAD 2 · el orden de las tiendas: `guardar_orden_tiendas_web` guarda la lista tal cual; la web (`tienda_sedes`) y el ERP
 *      (`fn_configuracion_tienda_web`) la respetan, y una tienda sin orden va al final por nombre; no repite, no acepta una tienda
 *      cerrada ni el Taller ni una lista vacía; si nada cambió no escribe ni anota; solo el líder o quien tenga el módulo; firma
 *      el responsable y deja rastro.
 *   ACTIVIDAD 3 · el mapa: `guardar_mapa_tienda_web` acepta solo enlaces de Google Maps (los de «Compartir», los largos y los viejos), nada
 *      de `http`, otros sitios, `javascript:`, espacios ni más de 400 letras; vacío lo quita; la web y el ERP lo traen; si nada cambió no
 *      anota; la tabla también lo exige por fuera; solo el líder o quien tenga el módulo.
 *   ACTIVIDAD 4 · la foto: el almacén `retail-tiendas` (público, 1 MB, JPG y WebP), `guardar_foto_tienda_web` solo acepta una ruta de SU
 *      carpeta con nombre de uuid y JPG o WebP; vacío la quita; la web y el ERP la traen; si nada cambió no anota; la tabla también lo exige;
 *      el líder o quien tenga el módulo sube al almacén (y solo a ese) y nadie borra lo subido.
 *   ACTIVIDAD 5 · el horario por días: `guardar_horario_tienda_web` guarda los días y el texto corto en un solo paso, reemplaza lo anterior,
 *      rechaza todo lo que no sea una hora de a 15 minutos dentro del día (20261026205000) (y no deja nada a medias), la tabla también lo exige, nadie la
 *      lee ni escribe directo, la web y el ERP traen los días, y solo el líder o quien tenga el módulo.
 *   ACTIVIDAD 6 · los cierres por fecha: `guardar_cierres_tienda_web` deja exactamente las fechas que llegan de hoy en adelante (hora de Lima),
 *      reemplaza lo anterior, no toca los días pasados, rechaza fechas que no existen, pasadas, repetidas o a más de dos años sin dejar nada a
 *      medias, la tabla no repite un día ni se toca por fuera, la web y el ERP los traen, y solo el líder o quien tenga el módulo.
 *   La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK y mete la migración DENTRO de ella: nunca se commitea nada en el Postgres
 * local que comparten los worktrees. La sesión se simula con `request.jwt.claim.sub`.
 *
 * DA POR SENTADO (el seed): dos tiendas abiertas, el Taller, a Felipe como líder y a Micaela como colaboradora sin el módulo
 * «Datos y plazos de la tienda web», y las migraciones 20261014231000 y 20261016223000 ya aplicadas.
 *
 * USO
 *   pnpm pruebas:tienda-web-conf    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = process.env.CONTENEDOR_LOCAL ?? "supabase_db_cayla-retail";
// Las dos migraciones de Conf. Tienda, en orden: la grande (20261026162000) y la que pasa el horario de a 30 a de a 15 minutos (20261026205000).
const MIGRACION = ["20261026162000_tienda_web_conf_tienda.sql", "20261026205000_tienda_web_horario_de_a_15_minutos.sql"]
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora de Tienda Trujillo, sin el módulo

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
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
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
    if (detalle) console.log(`    ${String(typeof detalle === "string" ? detalle : JSON.stringify(detalle)).trim().split("\n").slice(0, 8).join("\n    ")}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

const como = (id) => `reset role;\nset local request.jwt.claim.sub = '${id}';\n`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
`;

/** Cada escenario parte igual: la migración dentro de la transacción, sin datos web, las dos tiendas abiertas completas y encendidas
 *  (`:t1`, `:t2`, por nombre), el Taller (`:taller`) y la sesión de Felipe. Todo se revierte. */
const ESCENA = `
begin;
${MIGRACION}
${INTENTO}
delete from retail.ubicacion_datos_web;
select id as t1 from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
select id as t2 from retail.ubicaciones where tipo = 'tienda' and activo order by nombre offset 1 limit 1 \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
update retail.ubicaciones set whatsapp_numero = '987654321' where id in (:'t1', :'t2');
insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web, direccion, mostrar) values
  (:'t1', 'Arequipa', 'Calle Mercaderes 300', true), (:'t2', 'Trujillo', 'Av. España 1250', true);
${como(FELIPE)}
`;
const NOMBRES_WEB = `select string_agg(s ->> 'nombre', ',' order by o) from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') with ordinality as x (s, o);`;
const NOMBRES_ERP = `select string_agg(s ->> 'nombre_web', ',' order by o) from jsonb_array_elements(retail.fn_configuracion_tienda_web() -> 'sedes') with ordinality as x (s, o);`;
const MAPA = (t, url) => `select retail.guardar_mapa_tienda_web(:'${t}', '${url.replace(/'/g, "''")}') as _m \\gset\n`;
const ORDEN = (...ids) => `select retail.guardar_orden_tiendas_web(array[${ids.map((i) => `:'${i}'::uuid`).join(", ")}]) as _o \\gset\n`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  const hay = correr("select to_regclass('retail.ubicacion_datos_web') is not null and to_regprocedure('retail.fn_puede_ajustes_tienda_web()') is not null;");
  if (hay.salida !== "t") {
    console.error("Faltan las migraciones 20261014231000 y 20261016223000 en el Postgres local: ponlo al día antes (sin `db reset`).");
    process.exit(2);
  }

  console.log("— El orden de las tiendas —");
  {
    const r = correr(`${ESCENA}${NOMBRES_WEB}`);
    esperar("sin orden, la web las lista por nombre, como hasta hoy", r.ok && r.salida === "Arequipa,Trujillo", r);
  }
  {
    const r = correr(`${ESCENA}${ORDEN("t2", "t1")}${NOMBRES_WEB}\n${NOMBRES_ERP}`);
    const [web, erp] = lineas(r);
    esperar("la web respeta el orden guardado: la primera de la lista es la primera", web === "Trujillo,Arequipa", r);
    esperar("el ERP lista las tiendas en el mismo orden", erp === "Trujillo,Arequipa", r);
  }
  {
    const r = correr(`${ESCENA}${ORDEN("t2", "t1")}${ORDEN("t1", "t2")}${NOMBRES_WEB}`);
    esperar("volver a ordenar vuelve a cambiarlo", r.ok && r.salida === "Arequipa,Trujillo", r);
  }
  {
    const r = correr(`${ESCENA}${ORDEN("t2")}${NOMBRES_WEB}`);
    esperar("una tienda sin orden va después de las que lo tienen", r.ok && r.salida === "Trujillo,Arequipa", r);
  }
  {
    const r = correr(`${ESCENA}delete from retail.ubicacion_datos_web where ubicacion_id = :'t2';
${ORDEN("t2", "t1")}
select (select count(*) from retail.ubicacion_datos_web where ubicacion_id = :'t2' and orden = 1 and not mostrar and nombre_web is null);`);
    esperar("ordenar una tienda que aún no tenía datos web le crea su fila, apagada y vacía", r.ok && r.salida === "1", r);
  }
  {
    const r = correr(`${ESCENA}${ORDEN("t2", "t1")}
select count(*) from retail.configuracion_historial where que = 'tienda_web_orden';
select jsonb_array_length(detalle -> 'antes') || '|' || jsonb_array_length(detalle -> 'despues') || '|' || (hecho_por is not null)
  from retail.configuracion_historial where que = 'tienda_web_orden';`);
    const [anotados, detalle] = lineas(r);
    esperar("cada cambio de orden queda anotado, con antes, después y quién lo hizo", anotados === "1" && detalle === "2|2|true", r);
  }
  {
    const r = correr(`${ESCENA}${ORDEN("t2", "t1")}${ORDEN("t2", "t1")}
select count(*) from retail.configuracion_historial where que = 'tienda_web_orden';`);
    esperar("guardar el mismo orden otra vez no escribe ni anota nada", r.ok && r.salida === "1", r);
  }
  {
    const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.guardar_orden_tiendas_web(array[%L::uuid, %L::uuid])', :'t1', :'t1'));
select pg_temp.intento(format('select retail.guardar_orden_tiendas_web(array[%L::uuid])', :'taller'));
select pg_temp.intento('select retail.guardar_orden_tiendas_web(array[]::uuid[])');
select pg_temp.intento('select retail.guardar_orden_tiendas_web(null)');
select pg_temp.intento('select retail.guardar_orden_tiendas_web(array[gen_random_uuid()])');`);
    const [repetida, taller, vacia, nula, ajena] = lineas(r);
    esperar("no deja repetir una tienda", (repetida ?? "").includes("dos veces"), r);
    esperar("no deja ordenar el Taller (solo tiendas abiertas)", (taller ?? "").includes("tienda abierta"), r);
    esperar("no acepta una lista vacía ni nula", (vacia ?? "").includes("Falta la lista") && (nula ?? "").includes("Falta la lista"), r);
    esperar("no acepta una tienda que no existe", (ajena ?? "").includes("tienda abierta"), r);
  }
  {
    const r = correr(`${ESCENA}update retail.ubicaciones set activo = false where id = :'t2';
select pg_temp.intento(format('select retail.guardar_orden_tiendas_web(array[%L::uuid, %L::uuid])', :'t1', :'t2'));`);
    esperar("una tienda cerrada no se ordena", r.ok && r.salida.includes("tienda abierta"), r);
  }
  {
    const r = correr(`${ESCENA}${como(MICAELA)}
select pg_temp.intento(format('select retail.guardar_orden_tiendas_web(array[%L::uuid, %L::uuid])', :'t2', :'t1'));
reset role;
set local role anon;
select pg_temp.intento('select retail.guardar_orden_tiendas_web(array[gen_random_uuid()])');`);
    const [sinModulo, anonimo] = lineas(r);
    esperar("una colaboradora sin el módulo no ordena", (sinModulo ?? "").includes("necesita el módulo"), r);
    esperar("un visitante anónimo no ordena", (anonimo ?? "").includes("permission denied"), r);
  }
  {
    const r = correr(`${ESCENA}${ORDEN("t2")}
set local role authenticated;
select pg_temp.intento('select * from retail.ubicacion_datos_web');`);
    esperar("nadie lee la tabla directo, ni el líder: todo pasa por las funciones", r.ok && r.salida.includes("permission denied"), r);
  }

  console.log("— El mapa de cada tienda —");
  {
    const buenos = [
      "https://maps.app.goo.gl/AbC123xyz",
      "https://www.google.com/maps/place/Jr.+Pizarro+512,+Trujillo/@-8.1117,-79.0288,17z",
      "https://google.com/maps?q=-8.1117,-79.0288",
      "https://maps.google.com/?q=Trujillo",
      "https://goo.gl/maps/abc123",
      "HTTPS://WWW.GOOGLE.COM/MAPS/place/X",
    ];
    for (const url of buenos) {
      const r = correr(`${ESCENA}${MAPA("t1", url)}select (s ->> 'mapa') from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') s where s ->> 'id' = :'t1';`);
      esperar(`acepta ${url.slice(0, 48)}…`, r.ok && r.salida === url, r);
    }
  }
  {
    const malos = [
      ["http://maps.app.goo.gl/AbC123", "sin https"],
      ["https://www.google.com.evil.com/maps/x", "otro sitio con google.com en el nombre"],
      ["https://evil.com/?https://www.google.com/maps", "otro sitio"],
      ["javascript:alert(1)", "un javascript:"],
      ["https://maps.app.goo.gl/ab cd", "con un espacio"],
      ["https://www.google.com/mapsx/abc", "otra carpeta que empieza igual"],
      [`https://maps.app.goo.gl/${"a".repeat(400)}`, "más de 400 letras"],
      ["https://www.facebook.com/tienda", "una red social"],
    ];
    for (const [url, que] of malos) {
      const r = correr(`${ESCENA}select pg_temp.intento(format('select retail.guardar_mapa_tienda_web(%L, %L)', :'t1', '${url}'));`);
      esperar(`rechaza ${que}`, r.ok && r.salida.includes("enlace de Google Maps"), r);
    }
  }
  {
    const r = correr(`${ESCENA}${MAPA("t1", "https://maps.app.goo.gl/AbC123")}${MAPA("t1", "   ")}
select coalesce((select mapa_url from retail.ubicacion_datos_web where ubicacion_id = :'t1'), 'sin mapa');
select jsonb_typeof(retail.tienda_sedes() #> '{sedes,0,mapa}');`);
    const [fila, web] = lineas(r);
    esperar("un enlace vacío lo quita (la web vuelve a buscar la dirección)", fila === "sin mapa" && web === "null", r);
  }
  {
    const r = correr(`${ESCENA}${MAPA("t1", "https://maps.app.goo.gl/AbC123")}
select s ->> 'mapa_url' from jsonb_array_elements(retail.fn_configuracion_tienda_web() -> 'sedes') s where s ->> 'id' = :'t1';`);
    esperar("el ERP trae el mapa guardado de cada tienda", r.ok && r.salida === "https://maps.app.goo.gl/AbC123", r);
  }
  {
    const r = correr(`${ESCENA}${MAPA("t1", "https://maps.app.goo.gl/AbC123")}${MAPA("t1", "https://maps.app.goo.gl/AbC123")}${MAPA("t2", "")}
select count(*) from retail.configuracion_historial where que = 'tienda_web_mapa';
select (detalle ->> 'despues') || '|' || (hecho_por is not null) from retail.configuracion_historial where que = 'tienda_web_mapa';`);
    const [anotados, detalle] = lineas(r);
    esperar("solo se anota el cambio de verdad (repetir el enlace o quitar uno que no hay, no)", anotados === "1" && detalle === "https://maps.app.goo.gl/AbC123|true", r);
  }
  {
    const r = correr(`${ESCENA}set local role authenticated;
select pg_temp.intento('update retail.ubicacion_datos_web set mapa_url = ''http://x.com''');`);
    esperar("la tabla tampoco deja escribirlo por fuera (permiso)", r.ok && r.salida.includes("permission denied"), r);
  }
  {
    const r = correr(`${ESCENA}reset role;
select pg_temp.intento('update retail.ubicacion_datos_web set mapa_url = ''http://x.com'' where mostrar');`);
    esperar("ni quien administra la base puede guardar un enlace que no sea de Google Maps (CHECK de la fila)", r.ok && r.salida.includes("ubicacion_datos_web_mapa_valido"), r);
  }
  {
    const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.guardar_mapa_tienda_web(%L, %L)', :'taller', 'https://maps.app.goo.gl/AbC123'));
select pg_temp.intento(format('select retail.guardar_mapa_tienda_web(%L, %L)', gen_random_uuid(), 'https://maps.app.goo.gl/AbC123'));
${como(MICAELA)}
select pg_temp.intento(format('select retail.guardar_mapa_tienda_web(%L, %L)', :'t1', 'https://maps.app.goo.gl/AbC123'));
reset role;
set local role anon;
select pg_temp.intento('select retail.guardar_mapa_tienda_web(gen_random_uuid(), null)');`);
    const [taller, ajena, sinModulo, anonimo] = lineas(r);
    esperar("no guarda el mapa del Taller ni de una tienda que no existe", (taller ?? "").includes("tienda abierta") && (ajena ?? "").includes("no existe"), r);
    esperar("una colaboradora sin el módulo no cambia el mapa", (sinModulo ?? "").includes("necesita el módulo"), r);
    esperar("un visitante anónimo tampoco", (anonimo ?? "").includes("permission denied"), r);
  }

  console.log("— La foto de la fachada —");
  const FOTO = (t, ruta) => `select retail.guardar_foto_tienda_web(:'${t}', ${ruta === null ? "null" : `format('tiendas/%s/%s', :'${t}', '${ruta}')`}) as _f \\gset\n`;
  const ARCHIVO = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  {
    const r = correr(`${ESCENA}select concat_ws('|', public, file_size_limit, allowed_mime_types::text) from storage.buckets where id = 'retail-tiendas';`);
    esperar("existe el almacén público retail-tiendas: 1 MB, JPG y WebP", r.ok && r.salida === "t|1048576|{image/jpeg,image/webp}", r);
  }
  {
    const r = correr(`${ESCENA}${FOTO("t1", `${ARCHIVO}.webp`)}
select s ->> 'foto' from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') s where s ->> 'id' = :'t1';
select s ->> 'foto_ruta' from jsonb_array_elements(retail.fn_configuracion_tienda_web() -> 'sedes') s where s ->> 'id' = :'t1';
select 'tiendas/' || :'t1' || '/${ARCHIVO}.webp';`);
    const [web, erp, esperada] = lineas(r);
    esperar("guarda la foto de su carpeta y la traen la web y el ERP", r.ok && web === esperada && erp === esperada, r);
  }
  {
    const r = correr(`${ESCENA}${FOTO("t1", `${ARCHIVO}.jpg`)}select count(*) from retail.ubicacion_datos_web where foto_ruta like '%.jpg';`);
    esperar("acepta una foto JPG", r.ok && r.salida === "1", r);
  }
  {
    const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.guardar_foto_tienda_web(%L, %L)', :'t1', 'tiendas/' || :'t2' || '/${ARCHIVO}.webp'));
select pg_temp.intento(format('select retail.guardar_foto_tienda_web(%L, %L)', :'t1', 'campanas/' || :'t1' || '/${ARCHIVO}.webp'));
select pg_temp.intento(format('select retail.guardar_foto_tienda_web(%L, %L)', :'t1', 'tiendas/' || :'t1' || '/../${ARCHIVO}.webp'));
select pg_temp.intento(format('select retail.guardar_foto_tienda_web(%L, %L)', :'t1', 'https://evil.com/${ARCHIVO}.webp'));
select pg_temp.intento(format('select retail.guardar_foto_tienda_web(%L, %L)', :'t1', 'tiendas/' || :'t1' || '/${ARCHIVO.toUpperCase()}.webp'));
select pg_temp.intento(format('select retail.guardar_foto_tienda_web(%L, %L)', :'t1', 'tiendas/' || :'t1' || '/${ARCHIVO}.png'));
select pg_temp.intento(format('select retail.guardar_foto_tienda_web(%L, %L)', :'t1', 'tiendas/' || :'t1' || '/fachada.webp'));`);
    const m = lineas(r);
    esperar("no guarda la foto de otra tienda, de otro almacén, con «..», una dirección completa, mayúsculas, un PNG ni un nombre cualquiera", m.length === 7 && m.every((x) => x.includes("no es de esta tienda")), r);
  }
  {
    const r = correr(`${ESCENA}${FOTO("t1", `${ARCHIVO}.webp`)}${FOTO("t1", null)}
select coalesce((select foto_ruta from retail.ubicacion_datos_web where ubicacion_id = :'t1'), 'sin foto');
select jsonb_typeof(retail.tienda_sedes() #> '{sedes,0,foto}');`);
    const [fila, web] = lineas(r);
    esperar("vacío quita la foto (vuelve el dibujo de la fachada)", fila === "sin foto" && web === "null", r);
  }
  {
    const r = correr(`${ESCENA}${FOTO("t1", `${ARCHIVO}.webp`)}${FOTO("t1", `${ARCHIVO}.webp`)}${FOTO("t2", null)}
select count(*) from retail.configuracion_historial where que = 'tienda_web_foto';`);
    esperar("solo se anota el cambio de verdad", r.ok && r.salida === "1", r);
  }
  {
    const r = correr(`${ESCENA}reset role;
select pg_temp.intento(format('update retail.ubicacion_datos_web set foto_ruta = %L where ubicacion_id = %L', 'tiendas/' || :'t2' || '/${ARCHIVO}.webp', :'t1'));`);
    esperar("ni quien administra la base puede dejar en una tienda la foto de otra (CHECK de la fila)", r.ok && r.salida.includes("ubicacion_datos_web_foto_valida"), r);
  }
  {
    const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.guardar_foto_tienda_web(%L, %L)', :'taller', 'tiendas/' || :'taller' || '/${ARCHIVO}.webp'));
${como(MICAELA)}
select pg_temp.intento(format('select retail.guardar_foto_tienda_web(%L, %L)', :'t1', 'tiendas/' || :'t1' || '/${ARCHIVO}.webp'));
reset role;
set local role anon;
select pg_temp.intento('select retail.guardar_foto_tienda_web(gen_random_uuid(), null)');`);
    const [taller, sinModulo, anonimo] = lineas(r);
    esperar("no guarda la foto del Taller", (taller ?? "").includes("tienda abierta"), r);
    esperar("una colaboradora sin el módulo no cambia la foto", (sinModulo ?? "").includes("necesita el módulo"), r);
    esperar("un visitante anónimo tampoco", (anonimo ?? "").includes("permission denied"), r);
  }
  {
    // Subir el archivo al almacén: el líder sí, quien no tiene el módulo no, y nadie borra ni cambia lo subido.
    const subir = (como_, nombre) => `${como_}set local role authenticated;
select pg_temp.intento(format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, auth.uid())', 'retail-tiendas', ${nombre}));`;
    const lider = correr(`${ESCENA}${subir("", "'tiendas/x/y.webp'")}`);
    esperar("el líder sube una foto al almacén", lider.ok && lider.salida === "SIN_ERROR", lider);
    const sin = correr(`${ESCENA}${subir(como(MICAELA), "'tiendas/x/y.webp'")}`);
    esperar("quien no tiene el módulo no sube nada al almacén", sin.ok && sin.salida.includes("row-level security"), sin);
    const pol = correr(`${ESCENA}reset role;
select p.cmd || '|' || p.roles::text || '|' || (p.with_check like '%retail-tiendas%') || '|' || (p.with_check like '%fn_puede_ajustes_tienda_web%')
  from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'retail_tiendas_insert';
select count(*) from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
  and p.cmd in ('UPDATE', 'DELETE', 'ALL') and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%retail-tiendas%';`);
    const [insert, otras] = lineas(pol);
    esperar("la política de subida es solo de retail-tiendas y pide el módulo (la misma llave de las funciones)", insert === "INSERT|{authenticated}|true|true", pol);
    esperar("y no hay política de borrar ni de cambiar lo subido: nadie lo toca desde el ERP", otras === "0", pol);
  }

  console.log("— El horario por días —");
  const LUNES_A_SABADO = "[" + [0, 1, 2, 3, 4, 5].map((d) => `{"dia":${d},"abre":600,"cierra":1260}`).join(",") + ',{"dia":6,"abre":660,"cierra":1140}]';
  const HORARIO = (t, dias, resumen) =>
    `select retail.guardar_horario_tienda_web(:'${t}', '${dias}'::jsonb, ${resumen === null ? "null" : `'${resumen}'`}) as _h \\gset\n`;
  const RESUMEN = "Lun–Sáb 10 a. m.–9 p. m. · Dom 11 a. m.–7 p. m.";
  {
    const r = correr(`${ESCENA}${HORARIO("t1", LUNES_A_SABADO, RESUMEN)}
select count(*) from retail.ubicacion_horario_web where ubicacion_id = :'t1';
select (select count(*) from jsonb_array_elements(s -> 'dias')) || '|' || (s ->> 'horario') from jsonb_array_elements(retail.fn_configuracion_tienda_web() -> 'sedes') s where s ->> 'id' = :'t1';
select (select count(*) from jsonb_array_elements(s -> 'dias')) || '|' || (s ->> 'horario') || '|' || (s #>> '{dias,6,abre}') from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') s where s ->> 'id' = :'t1';`);
    const [filas, erp, web] = lineas(r);
    esperar("guarda los 7 días y su texto corto en un solo paso", filas === "7", r);
    esperar("el ERP trae los días y el texto", erp === `7|${RESUMEN}`, r);
    esperar("la web trae los mismos días y el texto (lo que ya leía sigue igual)", web === `7|${RESUMEN}|660`, r);
  }
  {
    const r = correr(`${ESCENA}${HORARIO("t1", LUNES_A_SABADO, RESUMEN)}${HORARIO("t1", '[{"dia":2,"abre":570,"cierra":1080}]', "Mié 9:30 a. m.–6 p. m.")}
select count(*) from retail.ubicacion_horario_web where ubicacion_id = :'t1';
select dia || '|' || abre || '|' || cierra from retail.ubicacion_horario_web where ubicacion_id = :'t1';`);
    const [filas, fila] = lineas(r);
    esperar("guardar otra vez reemplaza los días (no se acumulan)", filas === "1" && fila === "2|570|1080", r);
  }
  {
    const r = correr(`${ESCENA}${HORARIO("t1", LUNES_A_SABADO, RESUMEN)}${HORARIO("t1", "[]", "")}
select count(*) from retail.ubicacion_horario_web where ubicacion_id = :'t1';
select coalesce((select horario from retail.ubicacion_datos_web where ubicacion_id = :'t1'), 'sin horario');`);
    const [filas, texto] = lineas(r);
    esperar("una lista vacía y sin texto quita el horario (todos los días cerrados)", filas === "0" && texto === "sin horario", r);
  }
  {
    const r = correr(`${ESCENA}${HORARIO("t1", LUNES_A_SABADO, RESUMEN)}${HORARIO("t1", LUNES_A_SABADO, RESUMEN)}${HORARIO("t2", "[]", null)}
select count(*) from retail.configuracion_historial where que = 'tienda_web_horario';
select (detalle -> 'antes' -> 'dias') = '[]'::jsonb and jsonb_array_length(detalle -> 'despues' -> 'dias') = 7 and (hecho_por is not null) from retail.configuracion_historial where que = 'tienda_web_horario';`);
    const [anotados, detalle] = lineas(r);
    esperar("solo se anota el cambio de verdad, con antes, después y quién lo hizo", anotados === "1" && detalle === "t", r);
  }
  {
    const CUARTOS = '[{"dia":0,"abre":495,"cierra":1260},{"dia":1,"abre":510,"cierra":1305},{"dia":2,"abre":525,"cierra":1275}]';
    const r = correr(`${ESCENA}${HORARIO("t1", CUARTOS, "Lun 8:15 a. m.–9 p. m.")}
select string_agg(dia || ':' || abre || '-' || cierra, ',' order by dia) from retail.ubicacion_horario_web where ubicacion_id = :'t1';
select (s #>> '{dias,0,abre}') || '|' || (s ->> 'horario') from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') s where s ->> 'id' = :'t1';`);
    const [filas, web] = lineas(r);
    esperar("guarda horas de a 15 minutos (8:15, 8:30, 8:45, 9:15 p. m., 9:45 p. m.) y la web las trae", filas === "0:495-1260,1:510-1305,2:525-1275" && web === "495|Lun 8:15 a. m.–9 p. m.", r);
  }
  {
    // Lo que ya estaba guardado de a 30 sigue valiendo con la regla nueva (la migración se pega sobre una tabla con datos).
    const r = correr(`begin;\n${readFileSync("supabase/migrations/20261026162000_tienda_web_conf_tienda.sql", "utf8")}
${INTENTO}
select id as t1 from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
insert into retail.ubicacion_horario_web values (:'t1', 0, 600, 1260);
${readFileSync("supabase/migrations/20261026205000_tienda_web_horario_de_a_15_minutos.sql", "utf8")}
select count(*) from retail.ubicacion_horario_web where ubicacion_id = :'t1' and abre = 600 and cierra = 1260;
select pg_temp.intento(format('insert into retail.ubicacion_horario_web values (%L, 1, 615, 1260)', :'t1'));
select pg_temp.intento(format('insert into retail.ubicacion_horario_web values (%L, 2, 610, 1260)', :'t1'));`);
    const [queda, cuarto, diez] = lineas(r);
    esperar("pegar la migración sobre horas ya guardadas de a 30 no las toca; el CHECK nuevo deja 10:15 y sigue rechazando 10:10", queda === "1" && cuarto === "SIN_ERROR" && (diez ?? "").includes("ubicacion_horario_web_horas"), r);
  }
  {
    const malos = [
      ['[{"dia":7,"abre":600,"cierra":1260}]', "un día que no existe (7)"],
      ['[{"dia":-1,"abre":600,"cierra":1260}]', "un día negativo"],
      ['[{"dia":0,"abre":600,"cierra":1260},{"dia":0,"abre":700,"cierra":800}]', "el mismo día dos veces"],
      ['[{"dia":0,"abre":1260,"cierra":600}]', "abrir después de cerrar"],
      ['[{"dia":0,"abre":600,"cierra":600}]', "abrir y cerrar a la misma hora"],
      ['[{"dia":0,"abre":610,"cierra":1260}]', "una hora que no es de a 15 minutos (10:10)"],
      ['[{"dia":0,"abre":600,"cierra":1265}]', "un cierre que no es de a 15 minutos (9:05 p. m.)"],
      ['[{"dia":0,"abre":600,"cierra":1470}]', "cerrar pasado el día (más de 24 h)"],
      ['[{"dia":0,"abre":600.5,"cierra":1260}]', "una hora con decimales"],
      ['[{"dia":0,"abre":"600","cierra":1260}]', "una hora escrita como texto"],
      ['[{"dia":0,"abre":600}]', "sin hora de cierre"],
      ['["lunes"]', "un día que no es un objeto"],
      ['{"dia":0,"abre":600,"cierra":1260}', "un objeto suelto en vez de una lista"],
    ];
    for (const [dias, que] of malos) {
      const r = correr(`${ESCENA}select pg_temp.intento(format('select retail.guardar_horario_tienda_web(%L, %L::jsonb, null)', :'t1', '${dias}'));`);
      esperar(`rechaza ${que}`, r.ok && (r.salida.includes("de a 15 minutos") || r.salida.includes("lista de días")), r);
    }
    const nula = correr(`${ESCENA}select pg_temp.intento(format('select retail.guardar_horario_tienda_web(%L, null, null)', :'t1'));`);
    esperar("rechaza un horario nulo (para quitarlo se manda una lista vacía)", nula.ok && nula.salida.includes("lista de días"), nula);
    const largo = correr(`${ESCENA}select pg_temp.intento(format('select retail.guardar_horario_tienda_web(%L, ''[]''::jsonb, %L)', :'t1', repeat('x', 121)));`);
    esperar("rechaza un texto de más de 120 letras", largo.ok && largo.salida.includes("120 letras"), largo);
    const sinEscribir = correr(`${ESCENA}select pg_temp.intento(format('select retail.guardar_horario_tienda_web(%L, %L::jsonb, null)', :'t1', '[{"dia":0,"abre":600,"cierra":1260},{"dia":1,"abre":1260,"cierra":600}]'));
select count(*) from retail.ubicacion_horario_web where ubicacion_id = :'t1';`);
    esperar("un horario a medias no deja nada escrito: todo o nada", sinEscribir.ok && sinEscribir.salida.endsWith("0"), sinEscribir);
  }
  {
    const r = correr(`${ESCENA}reset role;
select pg_temp.intento(format('insert into retail.ubicacion_horario_web values (%L, 0, 610, 1260)', :'t1'));
select pg_temp.intento(format('insert into retail.ubicacion_horario_web values (%L, 7, 600, 1260)', :'t1'));
select pg_temp.intento(format('insert into retail.ubicacion_horario_web values (%L, 0, 600, 1470)', :'t1'));
set local role authenticated;
select pg_temp.intento('select count(*) from retail.ubicacion_horario_web');
select pg_temp.intento(format('insert into retail.ubicacion_horario_web values (%L, 0, 600, 1260)', :'t1'));`);
    const [media, dia7, pasada, leer, escribir] = lineas(r);
    esperar("la tabla tampoco deja una hora a las 10:10, un día 7 ni cerrar pasado el día, aunque se escriba por fuera (CHECK)", [media, dia7, pasada].every((m) => (m ?? "").includes("ubicacion_horario_web_")), r);
    esperar("nadie lee ni escribe la tabla directo, ni el líder: todo pasa por las funciones", (leer ?? "").includes("permission denied") && (escribir ?? "").includes("permission denied"), r);
  }
  {
    const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.guardar_horario_tienda_web(%L, ''[]''::jsonb, null)', :'taller'));
select pg_temp.intento(format('select retail.guardar_horario_tienda_web(%L, ''[]''::jsonb, null)', gen_random_uuid()));
${como(MICAELA)}
select pg_temp.intento(format('select retail.guardar_horario_tienda_web(%L, ''[]''::jsonb, null)', :'t1'));
reset role;
set local role anon;
select pg_temp.intento('select retail.guardar_horario_tienda_web(gen_random_uuid(), ''[]''::jsonb, null)');`);
    const [taller, ajena, sinModulo, anonimo] = lineas(r);
    esperar("no guarda el horario del Taller ni de una tienda que no existe", (taller ?? "").includes("tienda abierta") && (ajena ?? "").includes("no existe"), r);
    esperar("una colaboradora sin el módulo no cambia el horario", (sinModulo ?? "").includes("necesita el módulo"), r);
    esperar("un visitante anónimo tampoco", (anonimo ?? "").includes("permission denied"), r);
  }

  console.log("— Los cierres por fecha —");
  const HOY = "(now() at time zone 'America/Lima')::date";
  const dia = (n) => `(${HOY} + ${n})::text`;
  const CIERRES = (t, ...offsets) => `select retail.guardar_cierres_tienda_web(:'${t}', jsonb_build_array(${offsets.map(dia).join(", ")})) as _c \\gset\n`;
  const FECHAS_ERP = `select string_agg(c ->> 'fecha', ',' order by o) from jsonb_array_elements(s -> 'cierres') with ordinality as x (c, o);`;
  const ERP_DE = (t) => `select string_agg(c ->> 'fecha', ',' order by o) from retail.fn_configuracion_tienda_web() r, jsonb_array_elements(r -> 'sedes') s, jsonb_array_elements(s -> 'cierres') with ordinality as x (c, o) where s ->> 'id' = :'${t}';`;
  const WEB_DE = (t) => `select string_agg(c ->> 'fecha', ',' order by o) from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') s, jsonb_array_elements(s -> 'cierres') with ordinality as x (c, o) where s ->> 'id' = :'${t}';`;
  const ESPERADAS = (...offsets) => `select string_agg((${HOY} + n)::text, ',' order by n) from unnest(array[${offsets.join(",")}]) n;`;
  void FECHAS_ERP;
  {
    const r = correr(`${ESCENA}${CIERRES("t1", 0, 3)}${ERP_DE("t1")}\n${WEB_DE("t1")}\n${ESPERADAS(0, 3)}`);
    const [erp, web, esperadas] = lineas(r);
    esperar("guarda hoy y dentro de 3 días: el ERP y la web los traen, en orden", r.ok && erp === esperadas && web === esperadas, r);
  }
  {
    const r = correr(`${ESCENA}${CIERRES("t1", 3)}${CIERRES("t1", 5)}${ERP_DE("t1")}\n${ESPERADAS(5)}`);
    const [erp, esperadas] = lineas(r);
    esperar("guardar otra vez reemplaza los cierres de antes (no se acumulan)", r.ok && erp === esperadas, r);
  }
  {
    const r = correr(`${ESCENA}${CIERRES("t1", 0, 3)}${CIERRES("t1")}
select count(*) from retail.ubicacion_cierres_web where ubicacion_id = :'t1';
select jsonb_array_length(s -> 'cierres') from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') s where s ->> 'id' = :'t1';`);
    const [filas, web] = lineas(r);
    esperar("una lista vacía quita todos los cierres", filas === "0" && web === "0", r);
  }
  {
    const r = correr(`${ESCENA}reset role;
insert into retail.ubicacion_cierres_web (ubicacion_id, fecha) values (:'t1', ${HOY} - 5);
${como(FELIPE)}${CIERRES("t1", 2)}${CIERRES("t1")}
select count(*) from retail.ubicacion_cierres_web where ubicacion_id = :'t1' and fecha < ${HOY};
${ERP_DE("t1")}`);
    const [pasados, erp] = lineas(r);
    esperar("los cierres de días que ya pasaron no se tocan, y ni el ERP ni la web los traen", pasados === "1" && (erp ?? "") === "", r);
  }
  {
    const r = correr(`${ESCENA}${CIERRES("t1", 0, 3)}${CIERRES("t1", 3, 0)}${CIERRES("t2")}
select count(*) from retail.configuracion_historial where que = 'tienda_web_cierres';
select jsonb_array_length(detalle -> 'antes') || '|' || jsonb_array_length(detalle -> 'despues') || '|' || (hecho_por is not null) from retail.configuracion_historial where que = 'tienda_web_cierres';`);
    const [anotados, detalle] = lineas(r);
    esperar("solo se anota el cambio de verdad (el mismo orden de siempre o quitar lo que no hay, no)", anotados === "1" && detalle === "0|2|true", r);
  }
  {
    const malos = [
      [`jsonb_build_array((${HOY} - 1)::text)`, "un día que ya pasó", "ya pasó"],
      [`jsonb_build_array((${HOY} + 731)::text)`, "una fecha a más de dos años", "dos años"],
      [`jsonb_build_array('2026-02-30')`, "el 30 de febrero", "no existe"],
      [`jsonb_build_array('2026-13-01')`, "el mes 13", "no existe"],
      [`jsonb_build_array('28/10/2026')`, "una fecha con otro formato", "Cada cierre es una fecha"],
      [`jsonb_build_array(20261028)`, "un número en vez de una fecha", "Cada cierre es una fecha"],
      [`jsonb_build_array(null)`, "un vacío en la lista", "Cada cierre es una fecha"],
      [`jsonb_build_array((${HOY} + 1)::text, (${HOY} + 1)::text)`, "la misma fecha dos veces", "repetida"],
      [`(select jsonb_agg((${HOY} + n)::text) from generate_series(1, 61) n)`, "61 cierres", "hasta 60"],
      [`'{"fecha": "2030-01-01"}'::jsonb`, "un objeto suelto en vez de una lista", "lista de fechas"],
      [`'null'::jsonb`, "un null", "lista de fechas"],
    ];
    for (const [expr, que, frase] of malos) {
      const r = correr(`${ESCENA}select pg_temp.intento(format('select retail.guardar_cierres_tienda_web(%L, %L::jsonb)', :'t1', (select ${expr}::text)));`);
      esperar(`rechaza ${que}`, r.ok && r.salida.includes(frase), r);
    }
    const justo = correr(`${ESCENA}${CIERRES("t1", 730)}select count(*) from retail.ubicacion_cierres_web where ubicacion_id = :'t1';`);
    esperar("acepta justo dos años", justo.ok && justo.salida === "1", justo);
    const sesenta = correr(`${ESCENA}select retail.guardar_cierres_tienda_web(:'t1', (select jsonb_agg((${HOY} + n)::text) from generate_series(1, 60) n)) as _c \\gset
select count(*) from retail.ubicacion_cierres_web where ubicacion_id = :'t1';`);
    esperar("acepta 60 cierres", sesenta.ok && sesenta.salida === "60", sesenta);
    const a_medias = correr(`${ESCENA}${CIERRES("t1", 1)}select pg_temp.intento(format('select retail.guardar_cierres_tienda_web(%L, %L::jsonb)', :'t1', jsonb_build_array((${HOY} + 4)::text, '2026-02-30')::text));
${ERP_DE("t1")}
${ESPERADAS(1)}`);
    const [msg, erp, esperadas] = lineas(a_medias);
    esperar("una lista con una fecha mala no deja nada a medias: lo de antes sigue", (msg ?? "").includes("no existe") && erp === esperadas, a_medias);
  }
  {
    const r = correr(`${ESCENA}reset role;
select pg_temp.intento(format('insert into retail.ubicacion_cierres_web values (%L, %L)', :'t1', ${HOY} + 1));
select pg_temp.intento(format('insert into retail.ubicacion_cierres_web values (%L, %L)', :'t1', ${HOY} + 1));
set local role authenticated;
select pg_temp.intento('select count(*) from retail.ubicacion_cierres_web');
select pg_temp.intento(format('insert into retail.ubicacion_cierres_web values (%L, %L)', :'t1', ${HOY} + 2));`);
    const [primera, repetida, leer, escribir] = lineas(r);
    esperar("la tabla no deja el mismo día dos veces por tienda, aunque se escriba por fuera (llave primaria)", primera === "SIN_ERROR" && (repetida ?? "").includes("duplicate key"), r);
    esperar("nadie lee ni escribe la tabla directo, ni el líder: todo pasa por las funciones", (leer ?? "").includes("permission denied") && (escribir ?? "").includes("permission denied"), r);
  }
  {
    const r = correr(`${ESCENA}
select pg_temp.intento(format('select retail.guardar_cierres_tienda_web(%L, ''[]''::jsonb)', :'taller'));
select pg_temp.intento(format('select retail.guardar_cierres_tienda_web(%L, ''[]''::jsonb)', gen_random_uuid()));
${como(MICAELA)}
select pg_temp.intento(format('select retail.guardar_cierres_tienda_web(%L, ''[]''::jsonb)', :'t1'));
reset role;
set local role anon;
select pg_temp.intento('select retail.guardar_cierres_tienda_web(gen_random_uuid(), ''[]''::jsonb)');`);
    const [taller, ajena, sinModulo, anonimo] = lineas(r);
    esperar("no guarda cierres del Taller ni de una tienda que no existe", (taller ?? "").includes("tienda abierta") && (ajena ?? "").includes("no existe"), r);
    esperar("una colaboradora sin el módulo no cambia los cierres", (sinModulo ?? "").includes("necesita el módulo"), r);
    esperar("un visitante anónimo tampoco", (anonimo ?? "").includes("permission denied"), r);
  }

  console.log("— La migración —");
  {
    const r = correr(`begin;\n${MIGRACION}\n${MIGRACION}\n${como(FELIPE)}select (retail.tienda_sedes() ? 'sedes') and (retail.fn_configuracion_tienda_web() ? 'sedes');`);
    esperar("se puede volver a correr (dos veces seguidas, como un segundo pegado)", r.ok && r.salida === "t", r);
  }

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();
