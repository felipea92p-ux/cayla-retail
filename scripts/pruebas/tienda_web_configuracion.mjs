#!/usr/bin/env node
/**
 * Configuración ▸ Tienda web (ADR-0408, actividad 6) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA. `20261014231000_tienda_web_sedes_y_plazos.sql`:
 *   1. LA regla (`fn_sede_web_falta`): a una tienda le falta el nombre web, el WhatsApp (9 dígitos que empiezan en 9) o la
 *      dirección; el horario es opcional.
 *   2. `tienda_sedes()` (lo que lee la web): solo tiendas encendidas, abiertas y completas, por nombre web, con su WhatsApp
 *      leído de `ubicaciones.whatsapp_numero` —el mismo número del QR del club—: cambiarlo en Tiendas y caja cambia la web, y
 *      quitarlo saca a la tienda de la web en vez de dejarla sin dónde mandar el pedido.
 *   3. `guardar_sede_tienda_web`: no enciende una tienda incompleta (y dice qué le falta), no repite un nombre web, limpia
 *      espacios, rechaza textos largos, el Taller y una tienda cerrada, y anota cada cambio (y solo los cambios), firmado.
 *   4. `guardar_parametros_tienda_web` y la tabla: 24/48/7/3 de fábrica; nada en cero, negativo ni fuera de rango, tampoco
 *      escribiendo la tabla por fuera; el umbral nunca pasa de 3 (la cifra de 4 o más no sale a la web, ADR-0408 DECIDÍ 6).
 *   5. Quién: el líder, o quien tenga el módulo «Datos y plazos de la tienda web» (`ajustes_web`, 20261016223000); Configuración ya
 *      NO abre estas funciones (sí el WhatsApp, que comparte con Tiendas y caja); la colaboradora sin el módulo no lee ni guarda;
 *      nadie lee las tablas directo; `tienda_web` solo llama a `tienda_sedes` (ni las tablas ni las funciones del ERP), y
 *      `tienda_sedes` está cerrada a public, anon y authenticated.
 *   6. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada escenario corre en su transacción con ROLLBACK: borra los datos web y deja los plazos de fábrica DENTRO de la
 * transacción, así que nunca se commitea nada en el Postgres local que comparten los worktrees. La sesión se simula con
 * `request.jwt.claim.sub`; para actuar como `tienda_web`, quien corre la prueba se da el rol dentro de la transacción.
 *
 * PROBAR ANTES DE APLICAR. `APLICAR_ANTES=<migración>[,<migración>…]` (las dos, separadas por coma: la de las sedes y plazos y la de
 * su módulo, `20261016223000_tienda_web_modulo_ajustes.sql`) mete las migraciones dentro de cada transacción (que se revierte). Sin la variable, prueba lo que la base ya tiene (lo que hace el CI).
 *
 * DA POR SENTADO (el seed): dos tiendas abiertas, el Taller, a Felipe como líder y a Micaela como colaboradora sin el módulo
 * «Datos y plazos de la tienda web», y el rol `tienda_web` (20261014220000).
 *
 * USO
 *   pnpm pruebas:tienda-web-configuracion    → necesita el stack local (`npx supabase start`)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const MIGRACION = "supabase/migrations/20261014231000_tienda_web_sedes_y_plazos.sql";
const MIGRACION_MODULO = "supabase/migrations/20261016223000_tienda_web_modulo_ajustes.sql";
const APLICAR_ANTES = process.env.APLICAR_ANTES
  ? process.env.APLICAR_ANTES.split(",").map((f) => readFileSync(f.trim(), "utf8")).join("\n")
  : "";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora de Tienda Trujillo, sin Configuración

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

/** Cada escenario parte igual: sin datos web, los plazos de fábrica, sin WhatsApp en las tiendas; deja `:t1`, `:t2` (dos
 *  tiendas abiertas, por nombre) y `:taller`, y la sesión de Felipe. Todo dentro de la transacción: se revierte. */
const ESCENA = `
begin;
${APLICAR_ANTES}
${INTENTO}
delete from retail.ubicacion_datos_web;
delete from retail.configuracion_tienda_web;
insert into retail.configuracion_tienda_web (id) values (true);
select id as t1 from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
select id as t2 from retail.ubicaciones where tipo = 'tienda' and activo order by nombre offset 1 limit 1 \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' limit 1 \\gset
update retail.ubicaciones set whatsapp_numero = null where tipo = 'tienda' and whatsapp_numero is not null;
${como(FELIPE)}
`;
const SEDES = `select retail.tienda_sedes()::text;`;
const guardar = (t, nombre, direccion, horario, mostrar) => {
  const lit = (v) => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);
  return `select retail.guardar_sede_tienda_web(:'${t}', ${lit(nombre)}, ${lit(direccion)}, ${lit(horario)}, ${mostrar}) as _g \\gset\n`;
};
const intentarGuardar = (t, nombre, direccion, horario, mostrar) => {
  const lit = (v) => (v === null ? "null" : `''${v.replace(/'/g, "''''")}''`);
  return `select pg_temp.intento(format('select retail.guardar_sede_tienda_web(%L, ${lit(nombre)}, ${lit(direccion)}, ${lit(horario)}, ${mostrar})', :'${t}'));\n`;
};
const whatsapp = (t, numero) => `select retail.guardar_whatsapp_tienda(:'${t}', '${numero}') as _w \\gset\n`;

function main() {
  const base = correr("select 1;");
  if (!base.ok) {
    console.error(`No hay Postgres local en el contenedor ${CONTENEDOR_LOCAL}. Levántalo con: npx supabase start`);
    process.exit(2);
  }
  if (!APLICAR_ANTES) {
    const hay = correr("select to_regclass('retail.ubicacion_datos_web') is not null and to_regprocedure('retail.tienda_sedes()') is not null and to_regprocedure('retail.fn_puede_ajustes_tienda_web()') is not null;");
    if (hay.salida !== "t") {
      console.error(`Falta la migración: aplica ${MIGRACION} y ${MIGRACION_MODULO} o corre con APLICAR_ANTES=${MIGRACION},${MIGRACION_MODULO}`);
      process.exit(2);
    }
  }

  console.log("— La regla: qué le falta a una tienda para verse en la web —");
  {
    const r = correr(`begin;\n${APLICAR_ANTES}
select retail.fn_sede_web_falta(null, null, null)::text;
select retail.fn_sede_web_falta('Trujillo', 'Jr. Pizarro 512', '987654321')::text;
select retail.fn_sede_web_falta('   ', 'Jr. Pizarro 512', '987654321')::text;
select retail.fn_sede_web_falta('Trujillo', 'Jr. Pizarro 512', '812345678')::text;
select retail.fn_sede_web_falta('Trujillo', 'Jr. Pizarro 512', '98765432')::text;
select retail.fn_sede_web_falta('Trujillo', '', '987654321')::text;`);
    const [nada, completa, soloEspacios, noEmpieza9, ochoDigitos, sinDireccion] = lineas(r);
    esperar("sin nada, le falta todo, en el orden de la pantalla: nombre web, WhatsApp, dirección", nada === "{nombre_web,whatsapp,direccion}", r);
    esperar("con nombre web, dirección y WhatsApp está completa (el horario es opcional)", completa === "{}", r);
    esperar("un nombre de puros espacios no cuenta", soloEspacios === "{nombre_web}", r);
    esperar("un WhatsApp que no empieza en 9 no cuenta", noEmpieza9 === "{whatsapp}", r);
    esperar("un WhatsApp de 8 dígitos no cuenta", ochoDigitos === "{whatsapp}", r);
    esperar("una dirección vacía no cuenta", sinDireccion === "{direccion}", r);
  }

  console.log("— Lo que lee la web (tienda_sedes) —");
  esperar("sin tiendas encendidas, la web no muestra ninguna", correr(`${ESCENA}${SEDES}`).salida === '{"sedes": []}');
  {
    const r = correr(`${ESCENA}${whatsapp("t1", "987654321")}${guardar("t1", "Trujillo", "Jr. Pizarro 512, Centro", "Lunes a sábado, de 10 a. m. a 9 p. m.", true)}
-- Las cinco claves de siempre, exactas. Lo que sumó Conf. Tienda (mapa, foto, días y cierres, 20261026162000) se quita antes de comparar: lo vigila
-- pruebas:tienda-web-conf, y esta prueba sigue valiendo con o sin esa migración.
select (select jsonb_build_object('sedes', coalesce(jsonb_agg(s - 'mapa' - 'foto' - 'dias' - 'cierres'), '[]'::jsonb)) from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') s) = jsonb_build_object('sedes', jsonb_build_array(jsonb_build_object(
  'id', :'t1', 'nombre', 'Trujillo', 'direccion', 'Jr. Pizarro 512, Centro', 'horario', 'Lunes a sábado, de 10 a. m. a 9 p. m.', 'whatsapp', '987654321')));`);
    esperar("una tienda completa y encendida sale con su nombre web, dirección, horario y WhatsApp", r.ok && r.salida === "t", r);
  }
  {
    const r = correr(`${ESCENA}${whatsapp("t1", "987654321")}${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, false)}${SEDES}`);
    esperar("apagada, no sale en la web aunque esté completa", r.ok && r.salida === '{"sedes": []}', r);
  }
  {
    const r = correr(`${ESCENA}${whatsapp("t1", "987654321")}${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, true)}
select jsonb_typeof(retail.tienda_sedes() #> '{sedes,0,horario}');`);
    esperar("sin horario también sale (el horario es opcional y llega vacío)", r.ok && r.salida === "null", r);
  }
  {
    const r = correr(`${ESCENA}${whatsapp("t1", "987654321")}${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, true)}${whatsapp("t1", "912345678")}
select retail.tienda_sedes() #>> '{sedes,0,whatsapp}';`);
    esperar("cambiar el WhatsApp en Tiendas y caja lo cambia en la web: es un solo número", r.ok && r.salida === "912345678", r);
  }
  {
    const r = correr(`${ESCENA}${whatsapp("t1", "987654321")}${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, true)}
select retail.guardar_whatsapp_tienda(:'t1', '') as _q \\gset
${SEDES}
select (s ->> 'mostrar') || '|' || coalesce(s ->> 'whatsapp', 'sin') from jsonb_array_elements(retail.fn_configuracion_tienda_web() -> 'sedes') s where s ->> 'id' = :'t1';`);
    const [web, erp] = lineas(r);
    esperar("si le quitan el WhatsApp, la tienda sale sola de la web (no queda sin dónde mandar el pedido)", web === '{"sedes": []}', r);
    esperar("…y el ERP la sigue viendo encendida y sin WhatsApp, para avisarlo", erp === "true|sin", r);
  }
  {
    const r = correr(`${ESCENA}${whatsapp("t1", "987654321")}${whatsapp("t2", "912345678")}
${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, true)}${guardar("t2", "Arequipa", "Calle Mercaderes 210", null, true)}
select string_agg(s ->> 'nombre', ',') from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') s;`);
    esperar("van por nombre web: Arequipa antes que Trujillo", r.ok && r.salida === "Arequipa,Trujillo", r);
  }
  {
    const r = correr(`${ESCENA}${whatsapp("t1", "987654321")}${whatsapp("t2", "912345678")}
${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, true)}${guardar("t2", "Arequipa", "Calle Mercaderes 210", null, true)}
reset role;
update retail.ubicaciones set activo = false where id = :'t2';
${como(FELIPE)}
select string_agg(s ->> 'nombre', ',') from jsonb_array_elements(retail.tienda_sedes() -> 'sedes') s;
select count(*) from jsonb_array_elements(retail.fn_configuracion_tienda_web() -> 'sedes') s where s ->> 'id' = :'t2';
${intentarGuardar("t2", "Arequipa", "Calle Mercaderes 210", null, true)}`);
    const [web, erp, guardarCerrada] = lineas(r);
    esperar("una tienda que se cierra sale de la web aunque estuviera encendida", web === "Trujillo", r);
    esperar("…y deja de aparecer en Configuración", erp === "0", r);
    esperar("…y no se puede guardar", (guardarCerrada ?? "").includes("Solo una tienda abierta"), r);
  }

  console.log("— Guardar una tienda —");
  {
    const r = correr(`${ESCENA}
${intentarGuardar("t1", "Trujillo", "Jr. Pizarro 512", null, true)}
${whatsapp("t1", "987654321")}
${intentarGuardar("t1", null, null, "Lunes a sábado", true)}
${intentarGuardar("t1", "Trujillo", null, null, true)}`);
    const [sinWsp, sinNombreNiDireccion, sinDireccion] = lineas(r);
    esperar("sin WhatsApp no se puede encender, y lo dice", (sinWsp ?? "").startsWith("Para que se vea en la web todavía falta: el WhatsApp"), r);
    esperar("sin nombre web ni dirección tampoco, y nombra las dos", (sinNombreNiDireccion ?? "").includes("el nombre que ve el cliente, la dirección"), r);
    esperar("sin dirección, solo la dirección", sinDireccion === "Para que se vea en la web todavía falta: la dirección.", r);
  }
  {
    const r = correr(`${ESCENA}${guardar("t1", "Lima", "Av. Larco 345", null, false)}
${intentarGuardar("t2", "lima", "Jr. de la Unión 100", null, false)}
${intentarGuardar("t2", "LIMA ", "Jr. de la Unión 100", null, false)}`);
    const [minusculas, mayusculas] = lineas(r);
    esperar("dos tiendas no se llaman igual en la web, aunque cambien las mayúsculas o sobren espacios", [minusculas, mayusculas].every((m) => (m ?? "").startsWith("Otra tienda ya se llama")), r);
  }
  {
    const r = correr(`${ESCENA}${guardar("t1", "  Trujillo  ", "  Jr.   Pizarro   512 ", "", false)}
select concat_ws('|', nombre_web, direccion, coalesce(horario, 'sin horario'), mostrar) from retail.ubicacion_datos_web where ubicacion_id = :'t1';`);
    esperar("los espacios de más se limpian y un texto vacío es «sin dato»", r.ok && r.salida === "Trujillo|Jr. Pizarro 512|sin horario|f", r);
  }
  {
    const largo = (n) => "a".repeat(n);
    const r = correr(`${ESCENA}
${intentarGuardar("t1", largo(41), null, null, false)}
${intentarGuardar("t1", "Trujillo", largo(161), null, false)}
${intentarGuardar("t1", "Trujillo", null, largo(121), false)}
${intentarGuardar("t1", largo(40), largo(160), largo(120), false)}`);
    const [nombre, direccion, horario, justo] = lineas(r);
    esperar("un nombre web de más de 40 letras se rechaza", (nombre ?? "").startsWith("El nombre en la web va hasta 40"), r);
    esperar("una dirección de más de 160 letras se rechaza", (direccion ?? "").startsWith("La dirección va hasta 160"), r);
    esperar("un horario de más de 120 letras se rechaza", (horario ?? "").startsWith("El horario va hasta 120"), r);
    esperar("en el tope justo se guarda", justo === "SIN_ERROR", r);
  }
  {
    const r = correr(`${ESCENA}${intentarGuardar("taller", "Taller", "Calle 1", null, false)}
select pg_temp.intento('select retail.guardar_sede_tienda_web(gen_random_uuid(), ''X'', null, null, false)');`);
    const [taller, noExiste] = lineas(r);
    esperar("el Taller no es una tienda: se rechaza", (taller ?? "").startsWith("Solo una tienda abierta"), r);
    esperar("una sede que no existe se rechaza", noExiste === "Esa tienda no existe.", r);
  }
  {
    const persona = `(select p.id::text from public.personas p where p.auth_user_id = '${FELIPE}')`;
    const r = correr(`${ESCENA}${whatsapp("t1", "987654321")}
${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, false)}${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, false)}
${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, true)}
${guardar("t1", null, null, null, false)}
${guardar("t2", null, null, null, false)}
select count(*) from retail.configuracion_historial where que = 'tienda_web_sede' and detalle ->> 'ubicacion_id' = :'t1' and hecho_en >= now();
select bool_and(hecho_por::text = ${persona}) from retail.configuracion_historial where que = 'tienda_web_sede' and hecho_en >= now();
select concat_ws('|', detalle #>> '{antes,mostrar}', detalle #>> '{despues,mostrar}') from retail.configuracion_historial where que = 'tienda_web_sede' and hecho_en >= now() order by id offset 1 limit 1;
select count(*) from retail.ubicacion_datos_web where ubicacion_id = :'t2';`);
    const [anotados, firma, encendio, filaVacia] = lineas(r);
    esperar("guardar lo mismo dos veces no anota nada la segunda: 3 cambios, 3 anotaciones", anotados === "3", r);
    esperar("cada anotación la firma el responsable (Felipe, sin combo, firma él)", firma === "t", r);
    esperar("la anotación dice lo de antes y lo de después (apagada → encendida)", encendio === "false|true", r);
    esperar("guardar todo vacío en una tienda que nunca se tocó no crea una fila vacía", filaVacia === "0", r);
  }

  console.log("— Los plazos y el umbral —");
  {
    const r = correr(`${ESCENA}
select concat_ws('|', p ->> 'horas_para_confirmar', p ->> 'horas_aviso_sin_pagar', p ->> 'dias_aviso_sin_recoger', p ->> 'quedan_pocas_desde') from (select retail.fn_configuracion_tienda_web() -> 'parametros' p) x;
select retail.guardar_parametros_tienda_web(12, 72, 10, 2) as _p \\gset
select concat_ws('|', p ->> 'horas_para_confirmar', p ->> 'horas_aviso_sin_pagar', p ->> 'dias_aviso_sin_recoger', p ->> 'quedan_pocas_desde') from (select retail.fn_configuracion_tienda_web() -> 'parametros' p) x;
select retail.guardar_parametros_tienda_web(12, 72, 10, 2) as _p2 \\gset
select count(*) from retail.configuracion_historial where que = 'tienda_web_general' and hecho_en >= now();`);
    const [fabrica, cambiados, anotados] = lineas(r);
    esperar("de fábrica: 24 h para confirmar, aviso a las 48 h sin pagar y a los 7 días sin recoger, número desde 3", fabrica === "24|48|7|3", r);
    esperar("el líder los cambia y se leen iguales", cambiados === "12|72|10|2", r);
    esperar("cada cambio queda en la historia, y repetirlo no anota otra vez", anotados === "1", r);
  }
  {
    const casos = [
      ["0, 48, 7, 3", "Las horas para confirmar van de 1 a 168"],
      ["-24, 48, 7, 3", "Las horas para confirmar van de 1 a 168"],
      ["169, 48, 7, 3", "Las horas para confirmar van de 1 a 168"],
      ["null, 48, 7, 3", "Las horas para confirmar van de 1 a 168"],
      ["24, 0, 7, 3", "El aviso si no paga va de 1 a 720"],
      ["24, -48, 7, 3", "El aviso si no paga va de 1 a 720"],
      ["24, 721, 7, 3", "El aviso si no paga va de 1 a 720"],
      ["24, 48, 0, 3", "El aviso si no recoge va de 1 a 60"],
      ["24, 48, -7, 3", "El aviso si no recoge va de 1 a 60"],
      ["24, 48, 61, 3", "El aviso si no recoge va de 1 a 60"],
      ["24, 48, 7, 0", "El número se muestra desde 1, 2 o 3"],
      ["24, 48, 7, 4", "El número se muestra desde 1, 2 o 3"],
    ];
    const r = correr(`${ESCENA}${casos.map(([args]) => `select pg_temp.intento('select retail.guardar_parametros_tienda_web(${args})');`).join("\n")}
select concat_ws('|', horas_para_confirmar, horas_aviso_sin_pagar, dias_aviso_sin_recoger, quedan_pocas_desde) from retail.configuracion_tienda_web;`);
    const salidas = lineas(r);
    const malos = casos.flatMap(([args, msg], i) => ((salidas[i] ?? "").startsWith(msg) ? [] : [`(${args}) → ${salidas[i]}`]));
    esperar(`los ${casos.length} plazos imposibles (cero, negativos, vacíos o fuera de rango) los rechaza la función`, r.ok && malos.length === 0, malos.join("\n") || r);
    esperar("…y no cambió nada", salidas[casos.length] === "24|48|7|3", r);
  }
  {
    const r = correr(`${ESCENA}reset role;
select pg_temp.intento('update retail.configuracion_tienda_web set horas_para_confirmar = 0');
select pg_temp.intento('update retail.configuracion_tienda_web set horas_aviso_sin_pagar = -1');
select pg_temp.intento('update retail.configuracion_tienda_web set dias_aviso_sin_recoger = 0');
select pg_temp.intento('update retail.configuracion_tienda_web set quedan_pocas_desde = 4');
select pg_temp.intento('insert into retail.configuracion_tienda_web (id) values (false)');
select pg_temp.intento(format('insert into retail.ubicacion_datos_web (ubicacion_id, mostrar) values (%L, true)', :'t1'));
select pg_temp.intento(format('insert into retail.ubicacion_datos_web (ubicacion_id, nombre_web) values (%L, '' Lima'')', :'t1'));`);
    const [confirmar, pagar, recoger, umbral, otraFila, mostrarVacia, conEspacios] = lineas(r);
    esperar("la tabla también rechaza 0 horas para confirmar", (confirmar ?? "").includes("configuracion_tienda_web_horas_para_confirmar_rango"), r);
    esperar("…horas negativas para el aviso de pago", (pagar ?? "").includes("configuracion_tienda_web_horas_aviso_sin_pagar_rango"), r);
    esperar("…0 días para recoger", (recoger ?? "").includes("configuracion_tienda_web_dias_aviso_sin_recoger_rango"), r);
    esperar("…un umbral de 4 (la cifra de 4 o más no sale a la web)", (umbral ?? "").includes("configuracion_tienda_web_quedan_pocas_desde_rango"), r);
    esperar("…y una segunda fila de plazos", (otraFila ?? "").includes("configuracion_tienda_web_una_fila"), r);
    esperar("una tienda encendida sin nombre ni dirección no puede existir ni escribiendo la tabla a mano", (mostrarVacia ?? "").includes("ubicacion_datos_web_mostrar_completa"), r);
    esperar("un nombre web con espacios en las puntas tampoco", (conEspacios ?? "").includes("ubicacion_datos_web_nombre_valido"), r);
  }
  {
    const r = correr(`${ESCENA}reset role;
select pg_temp.intento(format('update retail.ubicaciones set whatsapp_numero = ''87654321'' where id = %L', :'t1'));
${como(FELIPE)}
select pg_temp.intento(format('select retail.guardar_whatsapp_tienda(%L, ''12345'')', :'t1'));`);
    const [directo, porFuncion] = lineas(r);
    esperar("un WhatsApp mal escrito lo rechaza la tabla (ubicaciones_whatsapp_numero_formato)", (directo ?? "").includes("ubicaciones_whatsapp_numero_formato"), r);
    esperar("…y la función que lo guarda desde las dos pestañas", (porFuncion ?? "").includes("9 dígitos"), r);
  }

  console.log("— Quién lee y quién guarda —");
  {
    const r = correr(`${ESCENA}${como(MICAELA)}
select pg_temp.intento('select retail.fn_configuracion_tienda_web()');
${intentarGuardar("t1", "Trujillo", null, null, false)}
select pg_temp.intento('select retail.guardar_parametros_tienda_web(12, 48, 7, 3)');
reset role;
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'configuracion');
${como(MICAELA)}
select pg_temp.intento('select retail.fn_configuracion_tienda_web()');
${intentarGuardar("t1", "Trujillo", null, null, false)}
select pg_temp.intento('select retail.guardar_parametros_tienda_web(12, 48, 7, 3)');
reset role;
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'configuracion';
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'ajustes_web');
${como(MICAELA)}
select pg_temp.intento('select retail.fn_configuracion_tienda_web()');
${intentarGuardar("t1", "Trujillo", null, null, false)}
select pg_temp.intento('select retail.guardar_parametros_tienda_web(12, 48, 7, 3)');`);
    const [leer, guardarSede, guardarPlazos, leerConConfig, guardarSedeConConfig, guardarPlazosConConfig, leerConModulo, guardarConModulo, guardarPlazosConModulo] = lineas(r);
    const sinModulo = (m) => (m ?? "").includes("necesita el módulo «Datos y plazos de la tienda web»");
    esperar("la colaboradora sin el módulo no lee la tienda web", sinModulo(leer), r);
    esperar("…ni guarda una tienda", sinModulo(guardarSede), r);
    esperar("…ni los plazos", sinModulo(guardarPlazos), r);
    esperar(
      "con «Configuración» (que ya no abre esta pantalla) tampoco lee ni guarda",
      sinModulo(leerConConfig) && sinModulo(guardarSedeConConfig) && sinModulo(guardarPlazosConConfig),
      r,
    );
    esperar(
      "con el módulo «Datos y plazos de la tienda web» en su rol, lee y guarda",
      leerConModulo === "SIN_ERROR" && guardarConModulo === "SIN_ERROR" && guardarPlazosConModulo === "SIN_ERROR",
      r,
    );
  }
  {
    // El WhatsApp lo comparten Tiendas y caja (módulo Configuración) y esta pantalla (módulo ajustes_web): sirve cualquiera de los dos.
    const wa = `select pg_temp.intento(format('select retail.guardar_whatsapp_tienda(%L, ''987654321'')', :'t1'));\n`;
    const r = correr(`${ESCENA}${como(MICAELA)}${wa}reset role;
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'configuracion');
${como(MICAELA)}${wa}reset role;
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante') and modulo = 'configuracion';
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'ajustes_web');
${como(MICAELA)}${wa}`);
    const [sin, conConfiguracion, conAjustes] = lineas(r);
    esperar("el WhatsApp no lo cambia quien no tiene ninguno de los dos módulos", (sin ?? "").includes("«Datos y plazos de la tienda web»"), r);
    esperar("…lo cambia quien tiene «Configuración» (Tiendas y caja)", conConfiguracion === "SIN_ERROR", r);
    esperar("…y quien tiene «Datos y plazos de la tienda web»", conAjustes === "SIN_ERROR", r);
  }
  {
    const r = correr(`${ESCENA}set local role authenticated;
select pg_temp.intento('select (retail.fn_configuracion_tienda_web() ? ''sedes'')::text');
select pg_temp.intento(format('select retail.guardar_sede_tienda_web(%L, ''Trujillo'', null, null, false)', :'t1'));
select pg_temp.intento('select count(*) from retail.ubicacion_datos_web');
select pg_temp.intento('select count(*) from retail.configuracion_tienda_web');
select pg_temp.intento('update retail.configuracion_tienda_web set horas_para_confirmar = 12');
select pg_temp.intento('select retail.tienda_sedes()');
reset role;
set local role anon;
select pg_temp.intento('select retail.fn_configuracion_tienda_web()');`);
    const [leer, guardarSede, tabla, plazos, escribir, sedesWeb, anonimo] = lineas(r);
    esperar("el líder con su sesión lee y guarda por las funciones", leer === "SIN_ERROR" && guardarSede === "SIN_ERROR", r);
    esperar("nadie lee las tablas directo, ni el líder (todo pasa por las funciones)", [tabla, plazos].every((m) => (m ?? "").includes("permission denied")), r);
    esperar("…ni las escribe", (escribir ?? "").includes("permission denied"), r);
    esperar("una cuenta del ERP no llama a tienda_sedes (es de la tienda)", (sedesWeb ?? "").includes("permission denied"), r);
    esperar("un visitante anónimo no lee la configuración", (anonimo ?? "").includes("permission denied"), r);
  }
  {
    const COMO_TIENDA = `reset role;\ngrant tienda_web to current_user with set true;\nset local role tienda_web;\n`;
    const r = correr(`${ESCENA}${whatsapp("t1", "987654321")}${guardar("t1", "Trujillo", "Jr. Pizarro 512", null, true)}${COMO_TIENDA}
select retail.tienda_sedes() #>> '{sedes,0,nombre}';
select pg_temp.intento('select count(*) from retail.ubicacion_datos_web');
select pg_temp.intento('select count(*) from retail.configuracion_tienda_web');
select pg_temp.intento('select retail.fn_configuracion_tienda_web()');
select pg_temp.intento(format('select retail.guardar_sede_tienda_web(%L, ''X'', null, null, false)', :'t1'));
select pg_temp.intento('select retail.guardar_parametros_tienda_web(12, 48, 7, 3)');
select pg_temp.intento('select retail.fn_sede_web_falta(null, null, null)');`);
    const [nombre, ...negados] = lineas(r);
    esperar("como tienda_web, la web lee sus tiendas", nombre === "Trujillo", r);
    esperar("…pero no las tablas, ni las funciones del ERP, ni la regla suelta", negados.length === 6 && negados.every((m) => m.includes("permission denied")), r);
  }
  {
    const r = correr(`begin;\n${APLICAR_ANTES}
select concat_ws('|', p.prosecdef, exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search\\_path=%'),
  has_function_privilege('public', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'),
  has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('tienda_web', p.oid, 'EXECUTE'))
from pg_proc p where p.oid = 'retail.tienda_sedes()'::regprocedure;`);
    esperar("tienda_sedes es security definer, fija su search_path y solo la llama tienda_web", r.ok && r.salida === "t|t|f|f|f|t", r);
  }

  console.log("— La migración —");
  {
    const sql = [MIGRACION, MIGRACION_MODULO].map((f) => readFileSync(f, "utf8")).join("\n");
    const r = correr(`begin;\n${sql}\n${sql}
select concat_ws('|', (select count(*) from retail.configuracion_tienda_web), (select horas_para_confirmar from retail.configuracion_tienda_web), (retail.tienda_sedes() ? 'sedes'));`);
    esperar("se puede volver a correr (dos veces seguidas, como un segundo pegado), con una sola fila de plazos", r.ok && /^1\|\d+\|t$/.test(r.salida), r);
  }

  console.log(`\n${total - fallos}/${total} escenarios en verde.`);
  if (fallos > 0) process.exit(1);
}

main();
