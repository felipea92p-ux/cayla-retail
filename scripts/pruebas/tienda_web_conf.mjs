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
const MIGRACION = readFileSync("supabase/migrations/20261026162000_tienda_web_conf_tienda.sql", "utf8");
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

  console.log("— La migración —");
  {
    const r = correr(`begin;\n${MIGRACION}\n${MIGRACION}\n${como(FELIPE)}select (retail.tienda_sedes() ? 'sedes') and (retail.fn_configuracion_tienda_web() ? 'sedes');`);
    esperar("se puede volver a correr (dos veces seguidas, como un segundo pegado)", r.ok && r.salida === "t", r);
  }

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();
