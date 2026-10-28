#!/usr/bin/env node
/**
 * Pruebas de «Afuera, por definir» (ADR-0550) — migración `20261028034000_produccion_fase_afuera_por_definir.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que una fase pueda salir afuera SIN proveedor ni tarifa todavía (quien = servicio con proveedor nulo), y que eso no abra un hueco:
 * no se opera mientras esté por definir (nada de avance, salida, vuelta ni marca, o nacería una deuda sin nombre); el esquema sigue prohibiendo la
 * deuda sin nombre (tarifa sin proveedor) y el proveedor sin precio; completarla pasa por «Cambiar quién» con las validaciones de siempre; y lo que ya
 * existía (Taller, servicio con proveedor y tarifa, ploteo por fijo) valida y opera igual.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK).
 *   E  EL ESQUEMA: la migración dos veces sin error y cada reemplazo anclado entró una vez; el CHECK acepta lo nuevo y rechaza los estados imposibles.
 *   A  ABRIR: una orden con Corte por definir nace con la fase sin proveedor ni tarifa; lo que se mande de más se ignora; «servicio» sin proveedor
 *      sigue rechazado; la actividad de apertura nombra la fase en vez de decir «todo en el Taller».
 *   Q  CAMBIAR QUIÉN: Taller → por definir → servicio completo → por definir → Taller; completarlo sin proveedor o sin tarifa se rechaza.
 *   B  EL BLOQUEO: avance, salida, vuelta y marca se rechazan con `fase_por_definir`; al definirla, la salida pasa; el Taller opera como siempre.
 *   L  LA LECTURA: la fase sale como servicio con proveedor nulo (la pantalla la lee así).
 *
 * USO
 *   node scripts/pruebas/produccion_fase_por_definir.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_fase_por_definir.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_fase_por_definir.mjs --base otra                 → contra otra base del mismo contenedor
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
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261028034000_produccion_fase_afuera_por_definir.sql"), "utf8"));

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

// Envolturas que nunca abortan el caso: devuelven «OK…» o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
create function pg_temp.llama(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
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
create function pg_temp.cambia(p_fase uuid, p_quien text, p_prov uuid, p_tarifa numeric, p_fijo numeric, p_min integer, p_fecha date) returns text
language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := retail.cambiar_quien_fase(p_fase, p_quien, p_prov, p_tarifa, p_fijo, p_min, p_fecha);
  return 'OK:' || (v_r ->> 'quien') || ':' || coalesce(v_r ->> 'proveedor_id', '-') || ':' || coalesce(v_r ->> 'tarifa_prenda', '-');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.marca(p_fase uuid) returns text language sql as $f$ select pg_temp.llama(format('select retail.marcar_fase_hecha(%L)', p_fase)) $f$;
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.llama(format('select retail.registrar_avance(%L, %L::jsonb)', p_fase, p_lineas)) $f$;
create function pg_temp.sale(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.llama(format('select retail.registrar_salida(%L, %L::jsonb)', p_fase, p_lineas)) $f$;
create function pg_temp.vuelve(p_fase uuid, p_lineas jsonb) returns text language sql as $f$ select pg_temp.llama(format('select retail.registrar_vuelta(%L, %L::jsonb)', p_fase, p_lineas)) $f$;
`;

// Datos propios: un proveedor de maquila y el modelo del seed con sus variantes (dos colores distintos).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Taller de Corte Prueba', 'maquila') returning id as maquila \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
${como(FELIPE)}
`;

const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const POR_DEFINIR = (clave, extra = {}) => FASE({ clave: `'${clave}'`, quien: `'por_definir'`, ...extra });
const ARREGLO = (...fases) => `jsonb_build_array(${fases.join(", ")})`;
const RESTO = [TALLER("habilitado"), TALLER("costura"), TALLER("limpieza_revision"), TALLER("planchado"), TALLER("etiquetado_embolsado")];
const RUTA = (ploteo, corte) => ARREGLO(ploteo, corte, ...RESTO);

// La orden abierta y los ids que los casos usan: :oid, :f_plot, :f_corte.
const ORDEN = (ploteo = TALLER("ploteo"), corte = POR_DEFINIR("corte")) => `
select pg_temp.abre(${APERTURA}, ${RUTA(ploteo, corte)}) as r \\gset
select id as oid from pg_temp.ultima \\gset
select id as f_plot from retail.produccion_fases where produccion_id = :'oid' and clave = 'ploteo' \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
// «quien:proveedor:tarifa:fijo» de una fase, tal como quedó guardada.
const GUARDADA = (clave) =>
  `(select concat_ws(':', f.quien, coalesce(f.proveedor_id::text, '-'), coalesce(f.tarifa_prenda::text, '-'), trim_scale(f.fijo_orden)::text) from retail.produccion_fases f where f.produccion_id = :'oid' and f.clave = '${clave}')`;
const CODIGO = (expr) => `split_part(${expr}, '|', 1)`;
const OCURRENCIAS = (firma, texto) =>
  `((length(pg_get_functiondef('${firma}'::regprocedure)) - length(replace(pg_get_functiondef('${firma}'::regprocedure), $q$${texto}$q$, ''))) / length($q$${texto}$q$))`;

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

// E. EL ESQUEMA ----------------------------------------------------------------------------------------------------------------
caso(
  "E1 la migración se vuelve a cargar sin error (idempotente): el CHECK sigue siendo uno y cada reemplazo anclado entró una sola vez",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws(',',
     (select count(*) from pg_constraint where conname = 'produccion_fases_quien'),
     ${OCURRENCIAS("retail.fn_produccion_fases_normalizar(jsonb)", "'servicio', 'por_definir'")},
     ${OCURRENCIAS("retail.fn_produccion_fases_normalizar(jsonb)", "if v_quien = 'por_definir' then")},
     ${OCURRENCIAS("retail.fn_produccion_operar_fase(uuid)", "using hint = 'fase_por_definir'")},
     ${OCURRENCIAS("retail.abrir_orden_produccion(jsonb, jsonb, jsonb)", "' (por definir)'")});`,
  "1,1,1,1,1"
);
caso(
  "E2 el CHECK acepta una fase por definir limpia y rechaza los estados imposibles: tarifa sin proveedor (deuda sin nombre), proveedor sin tarifa, y una por definir con tarifa, fijo, mínimo o fecha",
  `${ORDEN()}
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fases set tarifa_prenda = 5 where id = %L', :'f_corte'))`)} as a \\gset
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fases set fijo_orden = 10 where id = %L', :'f_corte'))`)} as b \\gset
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fases set cantidad_minima = 10 where id = %L', :'f_corte'))`)} as c \\gset
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fases set fecha_prometida = retail.fn_hoy_lima() + 3 where id = %L', :'f_corte'))`)} as d \\gset
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fases set proveedor_id = %L where id = %L', :'maquila', :'f_corte'))`)} as e \\gset
   select ${CODIGO(`pg_temp.llama(format('update retail.produccion_fases set proveedor_id = %L, tarifa_prenda = 4 where id = %L', :'maquila', :'f_corte'))`)} as f \\gset
   select concat_ws(',', :'a', :'b', :'c', :'d', :'e', :'f');`,
  "23514,23514,23514,23514,23514,OK"
);

// A. ABRIR ---------------------------------------------------------------------------------------------------------------------
caso(
  "A1 abrir con Corte por definir: la orden se abre y Corte queda como servicio sin proveedor, sin tarifa y sin fijo; las demás fases quedan en el Taller",
  `${ORDEN()}
   select concat_ws(',', (:'r' ~ '^OK:')::text, ${GUARDADA("corte")}, (${GUARDADA("costura")} like 'taller:-:-:0')::text);`,
  "true,servicio:-:-:0,true"
);
caso(
  "A2 lo que se mande de más con «por definir» (proveedor, tarifa, fijo, mínimo, fecha) se ignora: queda todo en nulo, nunca una deuda a medias",
  `${ORDEN(
    TALLER("ploteo"),
    POR_DEFINIR("corte", { proveedor_id: `:'maquila'`, tarifa_prenda: `'7'`, fijo_orden: `'30'`, cantidad_minima: `'100'`, fecha_prometida: `(retail.fn_hoy_lima() + 5)::text` })
  )}
   select concat_ws(',', (:'r' ~ '^OK:')::text, ${GUARDADA("corte")},
     (select concat_ws(':', coalesce(f.cantidad_minima::text, '-'), coalesce(f.fecha_prometida::text, '-')) from retail.produccion_fases f where f.id = :'f_corte'));`,
  "true,servicio:-:-:0,-:-"
);
caso(
  "A3 un «servicio» sin proveedor sigue rechazado (fase_sin_proveedor) y uno sin tarifa también (fase_sin_tarifa): por definir es una decisión explícita, no un campo vacío",
  `select pg_temp.abre(${APERTURA}, ${RUTA(TALLER("ploteo"), FASE({ clave: `'corte'`, quien: `'servicio'` }))}) as a \\gset
   select pg_temp.abre(${APERTURA}, ${RUTA(TALLER("ploteo"), FASE({ clave: `'corte'`, quien: `'servicio'`, proveedor_id: `:'maquila'` }))}) as b \\gset
   select concat_ws(',', pg_temp.eh(:'a'), pg_temp.eh(:'b'), (select count(*) from retail.produccion_fases f where f.proveedor_id = :'maquila'));`,
  "P0001|fase_sin_proveedor,P0001|fase_sin_tarifa,0"
);
caso(
  "A4 la actividad de apertura nombra la fase («Corte (por definir)») y no dice «todo en el Taller» ni inventa un proveedor",
  `${ORDEN()}
   select concat_ws(',',
     (select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'orden_produccion_abierta' and a.descripcion like '%afuera: Corte (por definir)%'),
     (select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = 'orden_produccion_abierta' and a.descripcion like '%todo en el Taller%'));`,
  "1,0"
);
caso(
  "A5 un ploteo por definir también se abre (sin fijo ni proveedor) y una orden con TODO por definir se abre: las siete fases quedan en nulo salvo Taller",
  `${ORDEN(POR_DEFINIR("ploteo"), POR_DEFINIR("corte"))}
   select concat_ws(',', (:'r' ~ '^OK:')::text, ${GUARDADA("ploteo")}, ${GUARDADA("corte")});`,
  "true,servicio:-:-:0,servicio:-:-:0"
);

// Q. CAMBIAR QUIÉN -------------------------------------------------------------------------------------------------------------
caso(
  "Q1 el camino completo: Taller → por definir → servicio con proveedor y tarifa → por definir (limpia lo del proveedor) → Taller",
  `${ORDEN(TALLER("ploteo"), TALLER("corte"))}
   select pg_temp.cambia(:'f_corte', 'por_definir', null, null, null, null, null) as a \\gset
   select ${GUARDADA("corte")} as ga \\gset
   select pg_temp.cambia(:'f_corte', 'servicio', :'maquila', 4.5, null, 100, null) as b \\gset
   select ${GUARDADA("corte")} as gb \\gset
   select pg_temp.cambia(:'f_corte', 'por_definir', :'maquila', 4.5, 10, 100, null) as c \\gset
   select ${GUARDADA("corte")} as gc \\gset
   select pg_temp.cambia(:'f_corte', 'taller', null, null, null, null, null) as d \\gset
   select ${GUARDADA("corte")} as gd \\gset
   select concat_ws(',', replace(:'a', :'maquila', 'M'), :'ga', replace(replace(:'b', :'maquila', 'M'), '-:4.50', '-:4.50'), replace(:'gb', :'maquila', 'M'), :'gc', :'gd');`,
  "OK:servicio:-:-,servicio:-:-:0,OK:servicio:M:4.50,servicio:M:4.50:0,servicio:-:-:0,taller:-:-:0"
);
caso(
  "Q2 completar una fase por definir con las validaciones de siempre: sin proveedor (fase_sin_proveedor), sin tarifa (fase_sin_tarifa), con un proveedor de tela (fase_proveedor_rubro)",
  `insert into retail.proveedores_produccion (nombre, rubro) values ('Telas Prueba', 'tela') returning id as telas \\gset
   ${ORDEN()}
   select pg_temp.cambia(:'f_corte', 'servicio', null, 4, null, null, null) as a \\gset
   select pg_temp.cambia(:'f_corte', 'servicio', :'maquila', null, null, null, null) as b \\gset
   select pg_temp.cambia(:'f_corte', 'servicio', :'telas', 4, null, null, null) as c \\gset
   select concat_ws(',', pg_temp.eh(:'a'), pg_temp.eh(:'b'), pg_temp.eh(:'c'), ${GUARDADA("corte")});`,
  "P0001|fase_sin_proveedor,P0001|fase_sin_tarifa,P0001|fase_proveedor_rubro,servicio:-:-:0"
);
caso(
  "Q3 una fase que ya empezó no se pasa a «por definir» (fase_empezada): quién la hace no se cambia con prendas anotadas",
  `${ORDEN(TALLER("ploteo"), TALLER("corte"))}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 5])}) as a \\gset
   select pg_temp.cambia(:'f_corte', 'por_definir', null, null, null, null, null) as b \\gset
   select concat_ws(',', :'a', pg_temp.eh(:'b'), ${GUARDADA("corte")});`,
  "OK,P0001|fase_empezada,taller:-:-:0"
);

// B. EL BLOQUEO ----------------------------------------------------------------------------------------------------------------
caso(
  "B1 mientras Corte está por definir no hay avance, salida ni vuelta (fase_por_definir) y no queda nada anotado",
  `${ORDEN()}
   select pg_temp.avanza(:'f_corte', ${L(["v1", 5])}) as a \\gset
   select pg_temp.sale(:'f_corte', ${L(["v1", 5])}) as b \\gset
   select pg_temp.vuelve(:'f_corte', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'buenas', '5', 'segundas', '0', 'faltantes', '0'))) as c \\gset
   select concat_ws(',', pg_temp.eh(:'a'), pg_temp.eh(:'b'), pg_temp.eh(:'c'),
     (select count(*) from retail.produccion_avances where fase_id = :'f_corte'),
     (select count(*) from retail.produccion_salidas where fase_id = :'f_corte'),
     (select count(*) from retail.produccion_vueltas where fase_id = :'f_corte'));`,
  "P0001|fase_por_definir,P0001|fase_por_definir,P0001|fase_por_definir,0,0,0"
);
caso(
  "B2 un ploteo por definir tampoco se marca «hecho» (fase_por_definir); al pasarlo a un servicio con su fijo ya se marca",
  `${ORDEN(POR_DEFINIR("ploteo"), TALLER("corte"))}
   select pg_temp.marca(:'f_plot') as a \\gset
   select pg_temp.cambia(:'f_plot', 'servicio', :'maquila', null, 40, null, null) as b \\gset
   select pg_temp.marca(:'f_plot') as c \\gset
   select concat_ws(',', pg_temp.eh(:'a'), (left(:'b', 20) = 'OK:servicio:' || left(:'maquila', 8))::text, :'c');`,
  "P0001|fase_por_definir,true,OK"
);
caso(
  "B3 al definirla, la salida pasa: Corte con proveedor y tarifa deja mandar prendas, y lo mandado queda anotado",
  `${ORDEN()}
   select pg_temp.sale(:'f_corte', ${L(["v1", 5])}) as a \\gset
   select pg_temp.cambia(:'f_corte', 'servicio', :'maquila', 4.5, null, null, null) as b \\gset
   select pg_temp.sale(:'f_corte', ${L(["v1", 5])}) as c \\gset
   select concat_ws(',', pg_temp.eh(:'a'), :'c', (select coalesce(sum(sl.cantidad), 0) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = :'f_corte'));`,
  "P0001|fase_por_definir,OK,5"
);
caso(
  "B4 lo que ya funcionaba sigue igual: una fase del Taller avanza y una con proveedor y tarifa deja mandar, con la migración puesta",
  `${ORDEN(TALLER("ploteo"), FASE({ clave: `'corte'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'4.5'` }))}
   select pg_temp.sale(:'f_corte', ${L(["v1", 5])}) as a \\gset
   select id as f_hab from retail.produccion_fases where produccion_id = :'oid' and clave = 'habilitado' \\gset
   select pg_temp.avanza(:'f_hab', ${L(["v1", 1])}) as b \\gset
   select concat_ws(',', :'a', pg_temp.eh(:'b'));`,
  // Habilitado sin lo que le entra del corte se rechaza por su propia regla (no es de esta migración): lo que importa es que NO sea fase_por_definir.
  (o) => o.startsWith("OK,") && !o.includes("fase_por_definir")
);

// L. LA LECTURA ----------------------------------------------------------------------------------------------------------------
caso(
  "L1 la lectura de la orden entrega la fase por definir como servicio con proveedor nulo y sin tarifa; Taller sigue como taller (la pantalla la distingue por eso)",
  `${ORDEN()}
   select concat_ws(',',
     (select (f ->> 'quien') || ':' || coalesce(f ->> 'proveedor_id', '-') || ':' || coalesce(f ->> 'tarifa_prenda', '-')
        from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' = 'corte'),
     (select (f ->> 'quien') from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' = 'costura'),
     (select ((f ->> 'devengado') is null or (f ->> 'devengado')::numeric = 0)::text from jsonb_array_elements(retail.fn_fases_de_orden(:'oid')) f where f ->> 'clave' = 'corte'));`,
  "servicio:-:-,taller,true"
);

// P. PUERTAS -------------------------------------------------------------------------------------------------------------------
caso(
  "P1 una integrante de Trujillo (sin el módulo, o parada en otra sede) no puede pasar una fase a «por definir» (42501) y la fase queda como estaba",
  `${ORDEN(TALLER("ploteo"), TALLER("corte"))}
   ${como(MICAELA)}
   select pg_temp.cambia(:'f_corte', 'por_definir', null, null, null, null, null) as a \\gset
   reset role;
   select concat_ws(',', ${CODIGO(":'a'")}, ${GUARDADA("corte")});`,
  "42501,taller:-:-:0"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
