#!/usr/bin/env node
/**
 * Pruebas de la lista de Órdenes del Taller (ADR-0400, actividad 5) — migración `20261015005000_produccion_lista_de_ordenes.sql`, sobre 154000, 155000 y
 * 160000. CAYLA V2.
 *
 * LO QUE VIGILA. Que `fn_ordenes_produccion_lista` traiga de cada orden LO MISMO que la página (`fn_orden_produccion`): la orden, el modelo, las líneas,
 * las fases y la tela, para que la lista y la página no se contradigan; que no lleve los costos del Taller (null) ni más de la última entrada de la línea
 * de tiempo; que las órdenes en proceso vengan siempre todas y las terminadas o anuladas solo las más recientes; que «al stock este mes» cuente solo lotes
 * de este mes de Lima, sin muestras; que solo quien ve `produccion` parado en el Taller la lea; y que sea de solo lectura.
 *
 * USO
 *   node scripts/pruebas/produccion_lista.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_lista.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_lista.mjs --base otra                 → contra otra base del mismo contenedor
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
const leer = (nombre) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8"));
const MIGRACION_FASES = leer("20261014154000_produccion_fases_y_tela_de_la_orden.sql");
const MIGRACION_AVANCES = leer("20261014155000_produccion_avance_salida_y_vuelta.sql");
const MIGRACION_ANULAR = leer("20261015160000_produccion_anular_salida_y_vuelta.sql");
const MIGRACION_LISTA = leer("20261015005000_produccion_lista_de_ordenes.sql");

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

// Envolturas que nunca abortan el caso: devuelven «OK» o «<sqlstate>|<hint>|<mensaje>». Un error dentro de una envoltura deshace lo que
// esa llamada escribió (es una subtransacción), igual que lo haría la transacción propia de una RPC.
const ENVOLTURAS = `
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
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_avance(p_fase, p_lineas, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.deshace(p_avance uuid) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.deshacer_avance(p_avance);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.sale(p_fase uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_salida(p_fase, p_lineas, p_guia, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.vuelve(p_fase uuid, p_lineas jsonb, p_guia text default null, p_nota text default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_vuelta(p_fase, p_lineas, p_guia, p_nota);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.anula_s(p_id uuid, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.anular_salida(p_id, p_motivo);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.anula_v(p_id uuid, p_motivo text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.anular_vuelta(p_id, p_motivo);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.cambia(p_fase uuid, p_quien text, p_prov uuid, p_tarifa numeric) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.cambiar_quien_fase(p_fase, p_quien, p_prov, p_tarifa, null, null, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: un proveedor de maquila, lino (tela, 5 % de merma) y el modelo del seed con sus variantes (dos colores distintos).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION_FASES}
set local search_path = retail, public, extensions;
${MIGRACION_AVANCES}
set local search_path = retail, public, extensions;
${MIGRACION_ANULAR}
set local search_path = retail, public, extensions;
${MIGRACION_LISTA}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.proveedores_produccion (nombre, rubro) values ('Confecciones Lista Prueba', 'maquila') returning id as maquila \\gset
insert into retail.proveedores_produccion (nombre, rubro) values ('Otro Taller Lista Prueba', 'maquila') returning id as otro \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('LI-LINO', 'Lino Lista Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select p.id as micaela_p from public.personas p where p.auth_user_id = '${MICAELA}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
select v.id as v_ajena from retail.variantes v where v.producto_id <> :'prod' and v.activo order by v.id limit 1 \\gset
${como(FELIPE)}
`;

// La apertura de siempre: 30 del primer color (v1) y 20 del segundo (v2), entrega en 10 días.
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const FASE = (o) => `jsonb_build_object(${Object.entries(o).map(([k, v]) => `'${k}', ${v}`).join(", ")})`;
const TALLER = (clave) => FASE({ clave: `'${clave}'`, quien: `'taller'` });
const COSTURA_AFUERA = FASE({ clave: `'costura'`, quien: `'servicio'`, proveedor_id: `:'maquila'`, tarifa_prenda: `'4.50'`, cantidad_minima: `'50'`,
  fecha_prometida: `(retail.fn_hoy_lima() + 7)::text` });
const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${COSTURA_AFUERA}, ${TALLER("acabado")})`;
const ESPINA_TALLER = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const LINO = `jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.2'))`;

// La orden abierta y los ids que todos los casos usan: :oid, :f_corte, :f_cost, :f_acab.
const ORDEN = (fases = ESPINA, insumos = "null") => `
select pg_temp.abre(${APERTURA}, ${fases}, ${insumos}) as r \\gset
select id as oid from pg_temp.ultima \\gset
select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset
`;
// [[variante, cantidad], …] → [{variante_id, cantidad}, …]
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;
// Una línea de Vuelta.
const VL = (v, buenas, segundas, faltantes, motivo) =>
  `jsonb_build_object('variante_id', :'${v}', 'buenas', '${buenas}', 'segundas', '${segundas}', 'faltantes', '${faltantes}', 'motivo', ${motivo ? `'${motivo}'` : "null"})`;
// Un campo de una fase de un jsonb de fases (lo que devuelven las funciones de escritura): FASE_DE(:'j'::jsonb, 'corte', ['estado', 'hechas']).
const FASE_DE = (j, clave, campos) =>
  `(select ${campos.map((c) => `coalesce(f ->> '${c}', '-')`).join(" || ':' || ")} from jsonb_array_elements(${j}) f where f ->> 'clave' = '${clave}')`;
// Un campo de una fase DE LA LECTURA ÚNICA, por variante.
const POR_VARIANTE = (clave, v, campos) =>
  `(select ${campos.map((c) => `coalesce(pv ->> '${c}', '-')`).join(" || ':' || ")} from jsonb_array_elements(retail.fn_orden_produccion(:'oid') -> 'fases') f, jsonb_array_elements(f -> 'por_variante') pv
     where f ->> 'clave' = '${clave}' and (pv ->> 'variante_id')::uuid = :'${v}')`;
const ACTIVIDAD = (accion, patron) =>
  `(select count(*) from retail.actividad a where a.registro_id = :'oid' and a.accion = '${accion}' and a.descripcion like '${patron}')`;
const FILAS_AVANCE = (fase, extra = "") => `(select count(*) from retail.produccion_avances where fase_id = :'${fase}' ${extra})`;

// El corte hecho y una salida mínima de Costura, para que la orden tenga fases, avance y movimiento.
const CORTE_Y_SALIDA_MINIMA = `select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a0 \\gset
   select pg_temp.sale(:'f_cost', ${L(["v1", 10])}, '001-1') as s0 \\gset`;

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

// La lista de una orden por su id, y cuántas filas trae con un tope de históricas.
const FILA = (id) => `(select e from jsonb_array_elements(retail.fn_ordenes_produccion_lista(:'taller', 1000) -> 'ordenes') e where e -> 'orden' ->> 'id' = :'${id}')`;
const CUANTAS = (tope) => `jsonb_array_length(retail.fn_ordenes_produccion_lista(:'taller', ${tope}) -> 'ordenes')`;
const OTRA_ORDEN = (nombre) => `
   select pg_temp.abre(${APERTURA}, ${ESPINA}) as r_${nombre} \\gset
   select id as ${nombre} from pg_temp.ultima \\gset`;

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se vuelve a cargar sin error (idempotente) y la función sigue siendo una",
  `${MIGRACION_LISTA}
   set local search_path = retail, public, extensions;
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_ordenes_produccion_lista';`,
  "1"
);

// L. LO MISMO QUE LA PÁGINA -----------------------------------------------------------------------------------------------------
caso(
  "L1 la lista trae, de cada orden, lo MISMO que la página (la orden, el modelo, las líneas, las fases y la tela) para que nunca se contradigan",
  `${ORDEN(ESPINA, LINO)}
   ${CORTE_Y_SALIDA_MINIMA}
   select retail.fn_orden_produccion(:'oid') as pagina \\gset
   select ${FILA("oid")}::text as fila \\gset
   select concat_ws(',',
     (:'fila'::jsonb -> 'orden') = (:'pagina'::jsonb -> 'orden'),
     (:'fila'::jsonb -> 'lineas') = (:'pagina'::jsonb -> 'lineas'),
     (:'fila'::jsonb -> 'fases') = (:'pagina'::jsonb -> 'fases'),
     (:'fila'::jsonb -> 'insumos') = (:'pagina'::jsonb -> 'insumos'),
     (:'fila'::jsonb -> 'permisos') = (:'pagina'::jsonb -> 'permisos'));`,
  "t,t,t,t,t"
);
caso(
  "L2 la lista no lleva los costos del Taller (null, aunque la página sí se los dé al líder) y de la línea de tiempo trae solo lo último, igual al primero de la página",
  `${ORDEN(ESPINA, LINO)}
   ${CORTE_Y_SALIDA_MINIMA}
   select retail.fn_orden_produccion(:'oid') as pagina \\gset
   select ${FILA("oid")}::text as fila \\gset
   select concat_ws(',',
     jsonb_typeof(:'pagina'::jsonb -> 'costos'),
     jsonb_typeof(:'fila'::jsonb -> 'costos'),
     jsonb_array_length(:'pagina'::jsonb -> 'linea_de_tiempo') > 1,
     jsonb_array_length(:'fila'::jsonb -> 'linea_de_tiempo'),
     (:'fila'::jsonb -> 'linea_de_tiempo' -> 0) = (:'pagina'::jsonb -> 'linea_de_tiempo' -> 0));`,
  "object,null,t,1,t"
);
caso(
  "L3 una orden recién abierta trae su única entrada en la línea de tiempo (la apertura), no una lista vacía",
  `${ORDEN()}
   select ${FILA("oid")}::text as fila \\gset
   select (:'fila'::jsonb -> 'linea_de_tiempo' -> 0 ->> 'tipo') || ',' || jsonb_array_length(:'fila'::jsonb -> 'linea_de_tiempo');`,
  "apertura,1"
);

// H. LAS HISTÓRICAS -------------------------------------------------------------------------------------------------------------
caso(
  "H1 las órdenes en proceso vienen SIEMPRE todas; de las terminadas o anuladas, solo las N más recientes (con 0, ninguna; con tope grande, todas)",
  `${ORDEN()}
   ${OTRA_ORDEN("oid2")}
   ${OTRA_ORDEN("oid3")}
   update retail.producciones set estado = 'anulada' where id in (:'oid2', :'oid3');
   select count(*) filter (where estado = 'en_proceso') as en_proceso, count(*) as todas from retail.producciones where ubicacion_id = :'taller' \\gset
   select concat_ws(',',
     ${CUANTAS(0)} = :en_proceso,
     ${CUANTAS(1)} = :en_proceso + 1,
     ${CUANTAS(1000)} = :todas,
     ${CUANTAS("null")} = :en_proceso,
     :todas > :en_proceso);`,
  "t,t,t,t,t"
);
caso(
  "H2 vienen de la más nueva a la más vieja (la de hace una hora, después de la recién abierta), y las anuladas conservan su estado",
  `${ORDEN()}
   ${OTRA_ORDEN("oid2")}
   update retail.producciones set estado = 'anulada' where id = :'oid2';
   update retail.producciones set created_at = now() - interval '1 hour' where id = :'oid';
   select retail.fn_ordenes_produccion_lista(:'taller', 5) -> 'ordenes' as lista \\gset
   select concat_ws(',',
     (:'lista'::jsonb -> 0 -> 'orden' ->> 'id') = :'oid2',
     (:'lista'::jsonb -> 0 -> 'orden' ->> 'estado'),
     (select min(i) from jsonb_array_elements(:'lista'::jsonb) with ordinality t(e, i) where e -> 'orden' ->> 'id' = :'oid2')
       < (select min(i) from jsonb_array_elements(:'lista'::jsonb) with ordinality t(e, i) where e -> 'orden' ->> 'id' = :'oid'),
     (select bool_and((a -> 'orden' ->> 'created_at')::timestamptz >= (b -> 'orden' ->> 'created_at')::timestamptz)
        from jsonb_array_elements(:'lista'::jsonb) with ordinality t1(a, i) join jsonb_array_elements(:'lista'::jsonb) with ordinality t2(b, j) on j = i + 1));`,
  "t,anulada,t,t"
);

// M. AL STOCK ESTE MES ----------------------------------------------------------------------------------------------------------
caso(
  "S1 «al stock este mes» cuenta los lotes que pasaron al stock este mes de Lima, sin muestras ni los de otro mes, y suma sus buenas",
  `${ORDEN()}
   ${OTRA_ORDEN("oid2")}
   ${OTRA_ORDEN("oid3")}
   select (retail.fn_ordenes_produccion_lista(:'taller', 0) -> 'al_stock_mes' ->> 'lotes')::int as lotes0, (retail.fn_ordenes_produccion_lista(:'taller', 0) -> 'al_stock_mes' ->> 'prendas')::int as prendas0 \\gset
   update retail.producciones set estado = 'terminada', cantidad_buenas = 45, inventariado_at = now() where id = :'oid';
   update retail.producciones set estado = 'terminada', cantidad_buenas = 7, inventariado_at = now(), es_muestra = true where id = :'oid2';
   update retail.producciones set estado = 'terminada', cantidad_buenas = 9, inventariado_at = date_trunc('month', retail.fn_hoy_lima()::timestamp) at time zone 'America/Lima' - interval '1 day' where id = :'oid3';
   select concat_ws(',',
     (retail.fn_ordenes_produccion_lista(:'taller', 0) -> 'al_stock_mes' ->> 'lotes')::int - :lotes0,
     (retail.fn_ordenes_produccion_lista(:'taller', 0) -> 'al_stock_mes' ->> 'prendas')::int - :prendas0);`,
  "1,45"
);

// P. PUERTAS --------------------------------------------------------------------------------------------------------------------
caso(
  "P1 sin el módulo «produccion» en el rol, parada en Trujillo, o sin Taller, la lectura recibe NULL; el líder en el Taller recibe la lista",
  `${ORDEN()}
   delete from retail.rol_modulos where modulo = 'produccion' and rol_id = (select c.rol_id from retail.colaboradores c where c.persona_id = :'micaela_p');
   ${como(MICAELA)}
   select coalesce(retail.fn_ordenes_produccion_lista(:'taller')::text, 'NULL') as sin_modulo \\gset
   insert into retail.rol_modulos (rol_id, modulo) select c.rol_id, 'produccion' from retail.colaboradores c where c.persona_id = :'micaela_p' on conflict do nothing;
   ${como(MICAELA)}
   select coalesce(retail.fn_ordenes_produccion_lista(:'taller')::text, 'NULL') as en_trujillo \\gset
   ${como(FELIPE)}
   select concat_ws(',', :'sin_modulo', :'en_trujillo', coalesce(retail.fn_ordenes_produccion_lista(null)::text, 'NULL'), jsonb_typeof(retail.fn_ordenes_produccion_lista(:'taller') -> 'ordenes'));`,
  "NULL,NULL,NULL,array"
);

// F. LA FORMA -------------------------------------------------------------------------------------------------------------------
caso(
  "F1 la forma: security definer con search_path, de solo lectura (stable), authenticated sí y anon no; no escribe en ninguna tabla",
  `reset role;
   select concat_ws(',',
     p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%',
     p.provolatile = 's',
     has_function_privilege('authenticated', p.oid, 'execute'),
     has_function_privilege('anon', p.oid, 'execute'),
     p.prosrc ~* '(insert|update|delete)\\s+(into|from)?\\s*retail\\.')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_ordenes_produccion_lista';`,
  "t,t,t,f,f"
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
