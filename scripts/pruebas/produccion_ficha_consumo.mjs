#!/usr/bin/env node
/**
 * Pruebas de la FICHA DE CONSUMO del modelo (ADR-0513, actividad 4) — migración `20261026153000_produccion_ficha_de_consumo.sql`, sobre `20261026035000`, `20261026150000`,
 * `20261026151000` y `20261026152000`. CAYLA V2.
 *
 * LO QUE VIGILA. Que quien tiene Producción parado en el Taller escriba la ficha del modelo (tela por talla o una cifra, y avíos) sin abrir ninguna orden; que sea todo o nada
 * (una ficha con un avío malo no deja la tela a medias); que guardar lo MISMO no cambie nada (ni reinicie la cuenta de lo medido ni archive avíos otra vez) y guardar otra cosa
 * sí; que lo malo se rechace con su motivo; que Catálogo la lea pero no la escriba; y que la lectura en una sola llamada diga todo lo que la hoja necesita.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las migraciones se cargan dentro de cada caso: así se prueba que se pueden pegar otra vez).
 *   G  GUARDAR: tela por talla y avíos; una sola cifra; solo los avíos; solo la tela (los avíos no se tocan); repetir lo mismo; quitar todos los avíos con [].
 *   R  REINICIO: declarar otra tela reinicia la cuenta de lo medido; guardar lo mismo o solo avíos no.
 *   V  VALIDAR: falta una talla, talla ajena, texto roto, cero, tope, color ajeno, avío que es tela, archivado, no es lista; nada queda a medias.
 *   P  PUERTAS: sin módulo, parada en otra sede, sin responsable; Catálogo la lee y no la escribe; un desconocido no la lee.
 *   L  LEER: la ficha en una lectura (tallas, colores, tela, avíos, medido y órdenes cerradas con su «cuenta»).
 *   F  LA FORMA: security definer con search_path, authenticated sí y anon no.
 *   M  LA MIGRACIÓN: se vuelve a cargar sin error.
 *
 * USO
 *   node scripts/pruebas/produccion_ficha_consumo.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_ficha_consumo.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_ficha_consumo.mjs --base otra                 → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const leerMig = (nombre) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8"));
const MIGRACION_EDITAR = leerMig("20261026035000_produccion_editar_tela_y_avios_de_la_orden.sql");
const MIGRACION_MEDIDO = leerMig("20261026150000_produccion_lo_medido_no_pisa_lo_declarado.sql");
const MIGRACION_TALLA = leerMig("20261026151000_produccion_consumo_por_talla.sql");
const MIGRACION_AVIOS = leerMig("20261026152000_produccion_avios_del_modelo.sql");
const MIGRACION = leerMig("20261026153000_produccion_ficha_de_consumo.sql");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Envolturas que nunca abortan el caso: devuelven «OK:…» o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK:' || v_fila.numero;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
-- Guarda la lista sobre la última orden abierta: «OK:agregadas,corregidas,quitadas» o «<sqlstate>|<hint>|<mensaje>».
create function pg_temp.guarda(p_insumos jsonb, p_orden uuid default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := retail.guardar_insumos_orden(coalesce(p_orden, (select id from pg_temp.ultima)), p_insumos);
  return 'OK:' || (v_r ->> 'agregadas') || ',' || (v_r ->> 'corregidas') || ',' || (v_r ->> 'quitadas');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: lino (tela), botones (avío) e hilo (avío), y un modelo del seed con al menos dos colores y dos tallas.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION_EDITAR}
set local search_path = retail, public, extensions;
${MIGRACION_MEDIDO}
set local search_path = retail, public, extensions;
${MIGRACION_TALLA}
set local search_path = retail, public, extensions;
${MIGRACION_AVIOS}
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
create function pg_temp.guarda_ficha(p_tela jsonb, p_avios jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := retail.guardar_ficha_consumo((select id from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1), (select id from pg_temp.modelo), p_tela, p_avios);
  return 'OK:' || (v_r ->> 'tela') || ',' || (v_r ->> 'avios') || ',' || (v_r ->> 'avios_vigentes');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create table pg_temp.modelo (id uuid);
-- Una orden cerrada de este modelo con lo que de verdad gastó (la fila de lo medido, como la escribe cerrar_produccion).
create function pg_temp.cerrada(p_buenas integer, p_metros numeric) returns void language plpgsql as $f$
declare v_id uuid;
begin
  insert into retail.producciones (ubicacion_id, producto_id, estado, cantidad_plan, cantidad_buenas)
  values ((select id from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1), (select id from pg_temp.modelo), 'terminada', p_buenas, p_buenas) returning id into v_id;
  insert into retail.producto_consumo_medido (produccion_id, producto_id, buenas, metros) values (v_id, (select id from pg_temp.modelo), p_buenas, p_metros);
end;
$f$;
create function pg_temp.reinicia() returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  return 'OK:' || retail.reiniciar_consumo_medido((select id from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1), (select id from pg_temp.modelo));
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('FC-LINO', 'Lino Ficha Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('FC-BOTON', 'Botón Ficha Prueba', 'avio', 'unidad') returning id as boton \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('FC-HILO', 'Hilo Ficha Prueba', 'avio', 'cono', 0.05) returning id as hilo \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, archivado_at) values ('FC-VIEJO', 'Avío Viejo Ficha Prueba', 'avio', 'unidad', now()) returning id as viejo \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
    and (select count(distinct v.talla_id) from retail.variantes v where v.producto_id = p.id and v.activo) >= 2
  order by p.created_at limit 1 \\gset
insert into pg_temp.modelo values (:'prod');
select v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null group by 1 order by 1 limit 1 \\gset
select t.valor as t1 from retail.tallas t where t.id in (select talla_id from retail.variantes where producto_id = :'prod' and activo) order by t.valor limit 1 \\gset
select t.valor as t2 from retail.tallas t where t.id in (select talla_id from retail.variantes where producto_id = :'prod' and activo) and t.valor <> :'t1' order by t.valor limit 1 \\gset
select array_length(array(select distinct t.valor from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'prod' and v.activo), 1) as ntallas \\gset
${como(FELIPE)}
`;

// La tela de la ficha: `[a, b]` = una cifra por las dos primeras tallas (con modelos de tres tallas, la tercera se rellena con b: el seed trae tres); un texto = una sola cifra.
const TELA = (consumo) =>
  Array.isArray(consumo)
    ? `jsonb_build_object('por_talla', (select jsonb_object_agg(x.valor, (case when x.valor = :'t1' then '${consumo[0]}' else '${consumo[1]}' end)) from (select distinct t.valor from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = :'prod' and v.activo) x))`
    : `jsonb_build_object('por_prenda', '${consumo}')`;
const FILA = (insumo, color, cantidad) => `jsonb_build_object('insumo_id', :'${insumo}', 'color_codigo', ${color === null ? "null::text" : color.startsWith("'") ? color : `:'${color}'`}, 'consumo_por_prenda', '${cantidad}')`;
const LISTA = (...filas) => `jsonb_build_array(${filas.map((f) => FILA(...f)).join(", ")})`;
const GUARDA = (tela, avios) => `select pg_temp.guarda_ficha(${tela}, ${avios}) as g \\gset`;
const MODELO = `(select c.tela_por_prenda || ':' || coalesce((c.por_talla ->> :'t1') || '/' || (c.por_talla ->> :'t2'), '-') || ':' || c.fuente from retail.producto_consumos c where c.producto_id = :'prod')`;
const VIGENTES = `(select coalesce(string_agg(i.codigo || ':' || case when a.color_codigo = :'c1' then 'c1' else '-' end || ':' || a.cantidad_por_prenda, ' ' order by i.codigo, a.color_codigo), 'ninguno')
   from retail.producto_avios a join retail.insumos i on i.id = a.insumo_id where a.producto_id = :'prod' and a.archivado_at is null)`;
const ARCHIVADOS = `(select count(*) from retail.producto_avios a where a.producto_id = :'prod' and a.archivado_at is not null)`;
const ACTIVIDADES = `(select count(*) from retail.actividad a where a.accion = 'ficha_consumo_guardada' and a.registro_id = :'prod')`;
const MICAELA_SIN_CATALOGO = `reset role;
   update retail.colaboradores set ubicacion_asignada_id = :'taller' where persona_id = :'micaela_p';
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   delete from retail.rol_modulos where modulo in ('productos', 'atributos') and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');`;

let fallas = 0;
let casos = 0;
function anotar(nombre, bien, esperado, obtenido) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  anotar(nombre, bien, typeof esperado === "function" ? "(condición)" : esperado, obtenido);
}

// G. GUARDAR --------------------------------------------------------------------------------------------------------------------
caso(
  "G1 la ficha por talla (t1 1.0, el resto 1.5) y dos avíos (botones para toda la orden y el hilo de un color): el modelo queda con la cifra por talla y su promedio, los avíos vigentes y UNA actividad",
  `${GUARDA(TELA(["1.0", "1.5"]), LISTA(["boton", null, "4"], ["hilo", "c1", "0.03"]))}
   select concat_ws('|', :'g', ${MODELO}, ${VIGENTES}, ${ACTIVIDADES});`,
  (o) => /^OK:true,true,2\|[0-9.]+:1\.000\/1\.500:declarado\|FC-BOTON:-:4\.000 FC-HILO:c1:0\.030\|1$/.test(o)
);
caso(
  "G2 una sola cifra para todas las tallas (1.2): el modelo queda sin cifra por talla, con 1.200",
  `${GUARDA(TELA("1.2"), "null::jsonb")}
   select concat_ws('|', :'g', ${MODELO});`,
  "OK:true,false,0|1.200:-:declarado"
);
caso(
  "G3 guardar solo la tela no toca los avíos del modelo, y guardar solo los avíos no toca la tela (un parámetro nulo no toca esa parte)",
  `${GUARDA(TELA("1.2"), LISTA(["boton", null, "4"]))}
   select :'g' as g1 \\gset
   ${GUARDA(TELA("1.3"), "null::jsonb")}
   select :'g' as g2 \\gset
   ${GUARDA("null::jsonb", LISTA(["boton", null, "6"]))}
   select concat_ws('|', :'g1', :'g2', :'g', ${MODELO}, ${VIGENTES});`,
  "OK:true,true,1|OK:true,false,1|OK:false,true,1|1.300:-:declarado|FC-BOTON:-:6.000"
);
caso(
  "G4 enviar dos veces la misma ficha no cambia nada: la segunda dice «sin cambios», no archiva avíos otra vez y la línea de tiempo anota UNA vez",
  `${GUARDA(TELA(["1.0", "1.5"]), LISTA(["boton", null, "4"]))}
   select :'g' as g1 \\gset
   ${GUARDA(TELA(["1.0", "1.5"]), LISTA(["boton", null, "4"]))}
   select concat_ws('|', :'g1', :'g', ${ARCHIVADOS}, ${ACTIVIDADES});`,
  "OK:true,true,1|OK:false,false,1|0|1"
);
caso(
  "G5 la lista vacía quita todos los avíos del modelo (quedan archivados, no borrados); un parámetro nulo no los quita",
  `${GUARDA("null::jsonb", LISTA(["boton", null, "4"], ["hilo", "c1", "0.03"]))}
   ${GUARDA("null::jsonb", "null::jsonb")}
   select :'g' as g_nulo \\gset
   ${GUARDA("null::jsonb", "'[]'::jsonb")}
   select concat_ws('|', :'g_nulo', :'g', ${VIGENTES}, ${ARCHIVADOS});`,
  "OK:false,false,2|OK:false,true,0|ninguno|2"
);

// R. REINICIO DE LO MEDIDO -----------------------------------------------------------------------------------------------------
caso(
  "R1 declarar OTRA tela reinicia la cuenta de lo medido; declarar los mismos números, o solo avíos, no (la fecha de la declaración no se mueve)",
  `${GUARDA(TELA("1.2"), "null::jsonb")}
   -- Todo es una sola transacción (now() no avanza): se manda la fecha de la declaración un día atrás para poder ver si algo la mueve.
   update retail.producto_consumos set updated_at = updated_at - interval '1 day' where producto_id = :'prod';
   select (select updated_at from retail.producto_consumos where producto_id = :'prod') as t1 \\gset
   ${GUARDA(TELA("1.2"), LISTA(["boton", null, "4"]))}
   select (select updated_at = :'t1' from retail.producto_consumos where producto_id = :'prod') as igual1 \\gset
   ${GUARDA(TELA("1.2"), "null::jsonb")}
   select (select updated_at = :'t1' from retail.producto_consumos where producto_id = :'prod') as igual2 \\gset
   ${GUARDA(TELA("1.4"), "null::jsonb")}
   select concat_ws('|', :'igual1', :'igual2', (select updated_at > :'t1' from retail.producto_consumos where producto_id = :'prod'));`,
  "t|t|t"
);

// O. VOLVER A LO DECLARADO ----------------------------------------------------------------------------------------------------
const EFECTIVO = `(select manda || ':' || ordenes_medidas from retail.fn_consumo_efectivo(:'prod'))`;
caso(
  "O1 con 3 órdenes cerradas manda lo medido; «volver a lo declarado» las deja de contar (0 de 3, manda lo declarado) sin borrarlas ni tocar lo declarado; repetirlo no cambia nada; la siguiente orden cuenta 1",
  `${GUARDA(TELA(["1.0", "1.5"]), "null::jsonb")}
   select pg_temp.cerrada(10, 12) as _a \\gset
   select pg_temp.cerrada(10, 13) as _b \\gset
   select pg_temp.cerrada(10, 14) as _c \\gset
   select ${EFECTIVO} as antes \\gset
   select ${MODELO} as modelo_antes \\gset
   select pg_temp.reinicia() as r1 \\gset
   select ${EFECTIVO} as despues \\gset
   select (select updated_at from retail.producto_consumos where producto_id = :'prod') as fecha1 \\gset
   select pg_temp.reinicia() as r2 \\gset
   select (select updated_at = :'fecha1' from retail.producto_consumos where producto_id = :'prod') as igual \\gset
   select pg_temp.cerrada(10, 15) as _d \\gset
   select concat_ws('|', :'antes', :'r1', :'despues', :'r2', :'igual', ${EFECTIVO},
     (select count(*) from retail.producto_consumo_medido where producto_id = :'prod'), (:'modelo_antes' = ${MODELO}),
     (select count(*) from retail.actividad a where a.accion = 'consumo_medido_reiniciado' and a.registro_id = :'prod'),
     (select count(*) filter (where (o ->> 'cuenta')::boolean) from jsonb_array_elements(retail.fn_ficha_consumo(:'taller', :'prod') -> 'ordenes_cerradas') o));`,
  "medido:3|OK:3|declarado:0|OK:0|t|declarado:1|4|t|1|1"
);
caso(
  "O2 «volver a lo declarado»: sin ficha declarada → sin_ficha; sin el módulo de Producción → produccion_sin_modulo; parada en otra sede → produccion_sin_taller; sin responsable → responsable_requerido",
  `select pg_temp.reinicia() as sin_ficha \\gset
   ${GUARDA(TELA("1.2"), "null::jsonb")}
   select pg_temp.cerrada(10, 12) as _a \\gset
   reset role;
   delete from retail.rol_modulos where modulo in ('produccion') and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select pg_temp.reinicia() as sin_modulo \\gset
   reset role;
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   select pg_temp.reinicia() as otra_sede \\gset
   select concat_ws('||', pg_temp.eh(:'sin_ficha'), pg_temp.eh(:'sin_modulo'), pg_temp.eh(:'otra_sede'), (select count(*) from retail.producto_consumo_medido where producto_id = :'prod'));`,
  "P0001|sin_ficha||42501|produccion_sin_modulo||42501|produccion_sin_taller||1"
);

// V. VALIDAR --------------------------------------------------------------------------------------------------------------------
const VAL = (tela, avios) => `pg_temp.eh(pg_temp.guarda_ficha(${tela}, ${avios}))`;
caso(
  "V1 falta la cifra de una talla del modelo → consumo_invalido; una talla que el modelo no tiene → talla_ajena; ninguno deja nada escrito",
  `select concat_ws(',',
     ${VAL("jsonb_build_object('por_talla', jsonb_build_object(:'t1', '1.0'))", "null::jsonb")},
     ${VAL("jsonb_build_object('por_talla', jsonb_build_object(:'t1', '1.0', :'t2', '1.5', 'XXL9', '2'))", "null::jsonb")},
     (select count(*) from retail.producto_consumos where producto_id = :'prod'));`,
  (o) => o === "P0001|consumo_invalido,P0001|talla_ajena,0" || /^P0001\|consumo_invalido,P0001\|talla_ajena,\d+$/.test(o)
);
caso(
  "V2 una cifra que no es número, un cero, el tope pasado y una sola cifra vacía → consumo_invalido",
  `select concat_ws(',',
     ${VAL(TELA("abc"), "null::jsonb")}, ${VAL(TELA("0"), "null::jsonb")}, ${VAL(TELA("10000"), "null::jsonb")}, ${VAL("jsonb_build_object('por_prenda', '')", "null::jsonb")},
     ${VAL(TELA(["abc", "1.5"]), "null::jsonb")});`,
  "P0001|consumo_invalido,P0001|consumo_invalido,P0001|consumo_invalido,P0001|consumo_invalido,P0001|consumo_invalido"
);
caso(
  "V3 la tela y los avíos que no son lo que dicen → ficha_invalida (la tela no es un objeto, los avíos no son una lista)",
  `select concat_ws(',', ${VAL("'[1]'::jsonb", "null::jsonb")}, ${VAL("null::jsonb", "'{}'::jsonb")}, ${VAL("jsonb_build_object('por_talla', '[1]'::jsonb)", "null::jsonb")});`,
  "P0001|ficha_invalida,P0001|ficha_invalida,P0001|ficha_invalida"
);
caso(
  "V4 un avío que es una tela → no_es_avio; uno archivado → insumo_archivado; un color que el modelo no tiene → insumo_color_ajeno; repetido → insumo_repetido; cantidad cero → insumo_consumo_invalido",
  `select concat_ws(',',
     ${VAL("null::jsonb", LISTA(["lino", null, "1"]))},
     ${VAL("null::jsonb", LISTA(["viejo", null, "1"]))},
     ${VAL("null::jsonb", LISTA(["hilo", "'ZZZ'", "0.03"]))},
     ${VAL("null::jsonb", LISTA(["boton", null, "4"], ["boton", null, "5"]))},
     ${VAL("null::jsonb", LISTA(["boton", null, "0"]))});`,
  "P0001|no_es_avio,P0001|insumo_archivado,P0001|insumo_color_ajeno,P0001|insumo_repetido,P0001|insumo_consumo_invalido"
);
caso(
  "V5 todo o nada: una tela buena con un avío malo no deja la tela guardada ni el avío; un modelo que no existe → modelo_inexistente",
  `${GUARDA(TELA("1.2"), LISTA(["viejo", null, "1"]))}
   select :'g' as g \\gset
   insert into pg_temp.modelo values ('00000000-0000-4000-8000-000000000000');
   select concat_ws('|', pg_temp.eh(:'g'), (select count(*) from retail.producto_consumos where producto_id = :'prod'), ${VIGENTES},
     pg_temp.eh(pg_temp.intento(format('select retail.guardar_ficha_consumo(%L, %L, null, null)', :'taller', '00000000-0000-4000-8000-000000000000'))));`,
  "P0001|insumo_archivado|0|ninguno|P0001|modelo_inexistente"
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------------
caso(
  "P1 quien opera el Taller aunque NO edite el catálogo guarda la ficha (Producción edita); quien no tiene el módulo, 42501 produccion_sin_modulo",
  `${MICAELA_SIN_CATALOGO}
   ${como(MICAELA)}
   ${GUARDA(TELA("1.2"), LISTA(["boton", null, "4"]))}
   select :'g' as g_con \\gset
   reset role;
   delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   ${GUARDA(TELA("1.3"), "null::jsonb")}
   select concat_ws('|', :'g_con', pg_temp.eh(:'g'));`,
  "OK:true,true,1|42501|produccion_sin_modulo"
);
caso(
  "P2 parada en otra sede (Trujillo), 42501 produccion_sin_taller; y sin elegir responsable la cuenta de la terminal no firma por nadie",
  `reset role;
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   ${GUARDA(TELA("1.2"), "null::jsonb")}
   select pg_temp.eh(:'g');`,
  "42501|produccion_sin_taller"
);
caso(
  "P3 Catálogo la LEE (ve Productos) pero no la escribe; quien no ve Producción ni Catálogo no la lee (null)",
  `${GUARDA(TELA("1.2"), LISTA(["boton", null, "4"]))}
   reset role;
   delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'productos' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   select (retail.fn_ficha_consumo(:'taller', :'prod') ->> 'puede_editar') || ':' || jsonb_array_length(retail.fn_ficha_consumo(:'taller', :'prod') -> 'avios') as catalogo \\gset
   reset role;
   delete from retail.rol_modulos where modulo in ('productos', 'produccion', 'atributos') and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select concat_ws('|', :'catalogo', coalesce((retail.fn_ficha_consumo(:'taller', :'prod'))::text, 'null'));`,
  "false:1|null"
);

// L. LEER -----------------------------------------------------------------------------------------------------------------------
caso(
  "L1 la lectura en una sola llamada trae las tallas y los colores del modelo, la tela declarada, los avíos con su nombre y unidad, lo medido (0 órdenes) y que quien lee puede editar",
  `${GUARDA(TELA(["1.0", "1.5"]), LISTA(["boton", null, "4"], ["hilo", "c1", "0.03"]))}
   select retail.fn_ficha_consumo(:'taller', :'prod') as f \\gset
   select concat_ws('|',
     (:'f'::jsonb ->> 'puede_editar'),
     jsonb_array_length(:'f'::jsonb -> 'tallas') >= 2,
     jsonb_array_length(:'f'::jsonb -> 'colores') >= 2,
     (:'f'::jsonb -> 'tela' ->> 'por_talla') is not null,
     (select string_agg((a ->> 'nombre') || ':' || (a ->> 'unidad'), ',' order by a ->> 'nombre') from jsonb_array_elements(:'f'::jsonb -> 'avios') a),
     (:'f'::jsonb -> 'medido' ->> 'manda') || ':' || (:'f'::jsonb -> 'medido' ->> 'ordenes'),
     jsonb_array_length(:'f'::jsonb -> 'ordenes_cerradas'));`,
  "true|t|t|t|Botón Ficha Prueba:unidad,Hilo Ficha Prueba:cono|declarado:0|0"
);
caso(
  "L2 un modelo sin ficha devuelve la tela en null y sin avíos (la hoja la muestra vacía), y un modelo que no existe devuelve null",
  `select concat_ws('|', (retail.fn_ficha_consumo(:'taller', :'prod') -> 'tela')::text, jsonb_array_length(retail.fn_ficha_consumo(:'taller', :'prod') -> 'avios'),
     coalesce(retail.fn_ficha_consumo(:'taller', '00000000-0000-4000-8000-000000000000')::text, 'null'));`,
  "null|0|null"
);

// F. LA FORMA --------------------------------------------------------------------------------------------------------------------
caso(
  "F1 las dos funciones son security definer con search_path, authenticated sí y anon no",
  `reset role;
   select concat_ws(',',
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') from pg_proc p where p.oid in ('retail.guardar_ficha_consumo(uuid, uuid, jsonb, jsonb)'::regprocedure, 'retail.fn_ficha_consumo(uuid, uuid)'::regprocedure, 'retail.reiniciar_consumo_medido(uuid, uuid)'::regprocedure)),
     has_function_privilege('authenticated', 'retail.guardar_ficha_consumo(uuid, uuid, jsonb, jsonb)', 'execute'), has_function_privilege('anon', 'retail.guardar_ficha_consumo(uuid, uuid, jsonb, jsonb)', 'execute'),
     has_function_privilege('authenticated', 'retail.fn_ficha_consumo(uuid, uuid)', 'execute'), has_function_privilege('anon', 'retail.fn_ficha_consumo(uuid, uuid)', 'execute'));`,
  "t,t,f,t,f"
);

caso(
  "F2 la ficha se va con su modelo: producto_consumos y producto_avios tienen su llave a productos con borrado en cascada (un modelo sin órdenes con la ficha escrita se puede eliminar)",
  `reset role;
   select concat_ws(',', (select confdeltype from pg_constraint where conrelid = 'retail.producto_consumos'::regclass and contype = 'f' and confrelid = 'retail.productos'::regclass),
     (select confdeltype from pg_constraint where conrelid = 'retail.producto_avios'::regclass and contype = 'f' and confrelid = 'retail.productos'::regclass));`,
  "c,c"
);

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se puede pegar otra vez sin error y la ficha sigue guardándose",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   ${GUARDA(TELA("1.2"), LISTA(["boton", null, "4"]))}
   select :'g';`,
  "OK:true,true,1"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
