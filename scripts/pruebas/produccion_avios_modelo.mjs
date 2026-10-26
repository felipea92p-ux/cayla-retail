#!/usr/bin/env node
/**
 * Pruebas de los AVÍOS DEL MODELO (ADR-0513, actividad 3) — migración `20261026152000_produccion_avios_del_modelo.sql`, sobre `20261026035000`,
 * `20261026150000` y `20261026151000`. CAYLA V2.
 *
 * LO QUE VIGILA. Que los botones, el hilo y las etiquetas de un modelo se escriban una vez y la orden siguiente los encuentre: la primera orden con avíos los
 * deja como los del modelo; una orden posterior NO los pisa sola; quien edita el catálogo puede corregirlos a propósito (`fijar_avios_modelo`) y quien no, no
 * (42501 antes de abrir, sin gastar número); reemplazar archiva las filas anteriores en vez de borrarlas; Nueva orden los recibe en `avios_modelo`; y el modelo
 * nunca queda a medias ni con dos filas vigentes del mismo avío y color.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las migraciones se cargan dentro de cada caso: así se prueba que se pueden pegar otra vez).
 *   A  DECLARAR: la primera orden con avíos los deja en el modelo (toda la orden y un color); una orden sin avíos no los toca; las telas no entran.
 *   N  NO PISAR: una orden posterior con otros avíos deja intactos los del modelo.
 *   F  FIJAR:    el líder reemplaza (los anteriores quedan archivados, no borrados); quien no edita el catálogo, 42501 y sin número gastado; donde el modelo no tenía
 *                nada, quien opera el Taller lo declara sin permiso.
 *   L  LEER:     `fn_nueva_orden_opciones` devuelve los vigentes de cada modelo y no los archivados.
 *   U  UNICIDAD: el índice vigente impide dos filas del mismo avío y color; la tabla tiene RLS sin políticas y la función interna está cerrada a la API.
 *   M  LA MIGRACIÓN: se vuelve a cargar sin error.
 *
 * USO
 *   node scripts/pruebas/produccion_avios_modelo.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_avios_modelo.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_avios_modelo.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = leerMig("20261026152000_produccion_avios_del_modelo.sql");

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

// Datos propios: lino (tela), botones y dos hilos (avíos; uno del primer color y otro del segundo) y un modelo del seed con al menos dos colores.
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
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
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
create function pg_temp.opcion_avios(p_prod uuid) returns text language sql as $f$
  select coalesce(string_agg(i.codigo || ':' || coalesce(a ->> 'color_codigo', '-') || ':' || (a ->> 'cantidad_por_prenda'), ' ' order by i.codigo, a ->> 'color_codigo'), 'ninguno')
    from jsonb_array_elements(retail.fn_nueva_orden_opciones((select id from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1)) -> 'avios_modelo') a
    join retail.insumos i on i.id = (a ->> 'insumo_id')::uuid
   where (a ->> 'producto_id')::uuid = p_prod
$f$;
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('AV-LINO', 'Lino Avíos Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('AV-BOTON', 'Botón Avíos Prueba', 'avio', 'unidad') returning id as boton \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('AV-HILO-1', 'Hilo color 1 Avíos Prueba', 'avio', 'cono', 0.05) returning id as hilo1 \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('AV-HILO-2', 'Hilo color 2 Avíos Prueba', 'avio', 'cono') returning id as hilo2 \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;

// 30 del primer color y 20 del segundo.
const APERTURA = (extra = "") => `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text${extra},
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const ESPINA = `jsonb_build_array(${FASE("corte")}, ${FASE("costura")}, ${FASE("acabado")})`;
const FILA = (insumo, color, consumo) =>
  `jsonb_build_object('insumo_id', :'${insumo}', 'color_codigo', ${color === null ? "null::text" : `:'${color}'`}, 'consumo_por_prenda', '${consumo}')`;
const LISTA = (...filas) => `jsonb_build_array(${filas.map((f) => FILA(...f)).join(", ")})`;
const ABRE = (lista, extra = "") => `select pg_temp.abre(${APERTURA(extra)}, ${ESPINA}, ${lista}) as r \\gset`;
// Lo vigente del modelo, legible: «AV-BOTON:-:4.000 AV-HILO-1:<color>:0.030» (el color 1 se escribe «c1»).
const VIGENTES = `(select coalesce(string_agg(i.codigo || ':' || case when a.color_codigo = :'c1' then 'c1' when a.color_codigo = :'c2' then 'c2' else '-' end || ':' || a.cantidad_por_prenda, ' ' order by i.codigo, a.color_codigo), 'ninguno')
   from retail.producto_avios a join retail.insumos i on i.id = a.insumo_id where a.producto_id = :'prod' and a.archivado_at is null)`;
const ARCHIVADOS = `(select count(*) from retail.producto_avios a where a.producto_id = :'prod' and a.archivado_at is not null)`;
// Quien opera el Taller pero NO edita el catálogo (el seed le da Productos y Atributos: se le quitan).
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

// A. DECLARAR -------------------------------------------------------------------------------------------------------------------
caso(
  "A1 la primera orden con avíos los deja como los del modelo: botones 4 para toda la orden y el hilo 0.03 del primer color; la tela NO entra",
  `${ABRE(LISTA(["lino", "c1", "1.2"], ["boton", null, "4"], ["hilo1", "c1", "0.03"]))}
   select concat_ws('|', :'r', ${VIGENTES});`,
  (o) => /^OK:\d+\|AV-BOTON:-:4\.000 AV-HILO-1:c1:0\.030$/.test(o)
);
caso(
  "A2 una orden sin avíos (solo tela) no toca los del modelo: sigue sin tener ninguno",
  `${ABRE(LISTA(["lino", "c1", "1.2"]))}
   select concat_ws('|', :'r', ${VIGENTES});`,
  (o) => /^OK:\d+\|ninguno$/.test(o)
);
caso(
  "A3 una orden sin ninguna lista de tela ni avíos tampoco inventa nada",
  `select pg_temp.abre(${APERTURA()}, ${ESPINA}) as r \\gset
   select concat_ws('|', :'r', ${VIGENTES});`,
  (o) => /^OK:\d+\|ninguno$/.test(o)
);

// N. NO PISAR -------------------------------------------------------------------------------------------------------------------
caso(
  "N1 una orden posterior con otros avíos NO pisa los del modelo (sin pedirlo): siguen los de la primera, y nada queda archivado",
  `${ABRE(LISTA(["boton", null, "4"], ["hilo1", "c1", "0.03"]))}
   select :'r' as r1 \\gset
   ${ABRE(LISTA(["boton", null, "6"], ["hilo2", "c2", "0.05"]))}
   select concat_ws('|', :'r1', :'r', ${VIGENTES}, ${ARCHIVADOS});`,
  (o) => /^OK:\d+\|OK:\d+\|AV-BOTON:-:4\.000 AV-HILO-1:c1:0\.030\|0$/.test(o)
);

// F. FIJAR ----------------------------------------------------------------------------------------------------------------------
caso(
  "F1 el líder pide dejar los avíos de esta orden como los del modelo (fijar_avios_modelo): reemplazan a los anteriores, que quedan ARCHIVADOS (2), no borrados",
  `${ABRE(LISTA(["boton", null, "4"], ["hilo1", "c1", "0.03"]))}
   select :'r' as r1 \\gset
   ${ABRE(LISTA(["boton", null, "6"], ["hilo2", "c2", "0.05"]), ", 'fijar_avios_modelo', true")}
   select concat_ws('|', :'r1', :'r', ${VIGENTES}, ${ARCHIVADOS});`,
  (o) => /^OK:\d+\|OK:\d+\|AV-BOTON:-:6\.000 AV-HILO-2:c2:0\.050\|2$/.test(o)
);
caso(
  "F2 quien opera el Taller pero no edita el catálogo NO corrige los avíos que el modelo ya dice: 42501 antes de abrir, los avíos quedan igual y NO se gasta número",
  `${ABRE(LISTA(["boton", null, "4"]))}
   ${MICAELA_SIN_CATALOGO}
   select last_value as antes from retail.producciones_numero_seq \\gset
   ${como(MICAELA)}
   select pg_temp.eh(pg_temp.abre(${APERTURA(", 'fijar_avios_modelo', true")}, ${ESPINA}, ${LISTA(["boton", null, "9"])})) as r2 \\gset
   ${como(FELIPE)}
   select concat_ws('|', :'r2', ${VIGENTES}, (select last_value = :'antes' from retail.producciones_numero_seq));`,
  "42501|avios_modelo_sin_permiso|AV-BOTON:-:4.000|t"
);
caso(
  "F3 donde el modelo todavía no dice nada no hace falta permiso: quien opera el Taller abre la orden con el interruptor y sus avíos quedan como los del modelo",
  `${MICAELA_SIN_CATALOGO}
   ${como(MICAELA)}
   select pg_temp.abre(${APERTURA(", 'fijar_avios_modelo', true")}, ${ESPINA}, ${LISTA(["boton", null, "4"])}) as r \\gset
   ${como(FELIPE)}
   select concat_ws('|', :'r', ${VIGENTES});`,
  (o) => /^OK:\d+\|AV-BOTON:-:4\.000$/.test(o)
);

// L. LEER -----------------------------------------------------------------------------------------------------------------------
caso(
  "L1 Nueva orden recibe los avíos vigentes del modelo (insumo, color, cantidad) y no los archivados",
  `${ABRE(LISTA(["boton", null, "4"], ["hilo1", "c1", "0.03"]))}
   select pg_temp.opcion_avios(:'prod') as antes \\gset
   ${ABRE(LISTA(["hilo2", "c2", "0.05"]), ", 'fijar_avios_modelo', true")}
   select concat_ws('|', :'antes', pg_temp.opcion_avios(:'prod'));`,
  (o) => /^AV-BOTON:-:4\.000 AV-HILO-1:[A-Z0-9]+:0\.030\|AV-HILO-2:[A-Z0-9]+:0\.050$/.test(o)
);

// U. UNICIDAD Y FORMA -----------------------------------------------------------------------------------------------------------
caso(
  "U1 el índice de lo vigente impide dos filas del mismo avío y color (pero sí el mismo avío en otro color, y una archivada no cuenta)",
  `insert into retail.producto_avios (producto_id, insumo_id, color_codigo, cantidad_por_prenda) values (:'prod', :'boton', null, 4);
   select pg_temp.intento(format('insert into retail.producto_avios (producto_id, insumo_id, color_codigo, cantidad_por_prenda) values (%L, %L, null, 5)', :'prod', :'boton')) as dup \\gset
   insert into retail.producto_avios (producto_id, insumo_id, color_codigo, cantidad_por_prenda) values (:'prod', :'boton', :'c1', 5);
   update retail.producto_avios set archivado_at = now() where color_codigo is null and producto_id = :'prod';
   insert into retail.producto_avios (producto_id, insumo_id, color_codigo, cantidad_por_prenda) values (:'prod', :'boton', null, 6);
   select concat_ws('|', pg_temp.eh(:'dup'), (select count(*) from retail.producto_avios where producto_id = :'prod' and archivado_at is null));`,
  "23505||2"
);
caso(
  "U2 la cantidad tiene que ser mayor que cero y la forma es la de siempre: RLS encendido sin políticas y la función interna cerrada a la API",
  `reset role;
   select concat_ws(',',
     pg_temp.eh(pg_temp.intento(format('insert into retail.producto_avios (producto_id, insumo_id, cantidad_por_prenda) values (%L, %L, 0)', :'prod', :'boton'))),
     (select relrowsecurity from pg_class where oid = 'retail.producto_avios'::regclass),
     (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'producto_avios'),
     (select has_function_privilege('authenticated', 'retail.fn_producto_avios_reemplazar(uuid, jsonb, uuid)', 'execute') or has_function_privilege('anon', 'retail.fn_producto_avios_reemplazar(uuid, jsonb, uuid)', 'execute')));`,
  "23514|,t,0,f"
);

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se puede pegar otra vez sin error y los avíos siguen declarándose",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   ${ABRE(LISTA(["boton", null, "4"]))}
   select concat_ws('|', :'r', ${VIGENTES});`,
  (o) => /^OK:\d+\|AV-BOTON:-:4\.000$/.test(o)
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
