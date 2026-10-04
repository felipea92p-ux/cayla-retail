#!/usr/bin/env node
/**
 * Prueba de ADR-0328 (decisión técnica 4) «Cuadre del piso, una vez por sede» — `cuadrar_piso`, `previsualizar_cuadre_piso`
 * y `fn_cuadre_piso_estado` (`20261004200000_cuadre_piso_tablas.sql`, `20261004200100_cuadre_piso_funciones.sql`), su
 * efecto en Frescura (`20261004200050_cuadre_piso_frescura.sql`) y el orden de pegado que exige Eliminar con historia
 * (`20261004200070_cuadre_piso_en_eliminar.sql`; Eliminar se prueba en eliminar_producto_con_historia.mjs, caso 15).
 *
 * LA CUENTA, por prenda y con unidades LIBRES (A almacén, P piso, S escaneado como guardado):
 *   pasa al piso = max(0, A − S) · sube al almacén = min(max(0, S − A), P) · no cargada = max(0, S − A − P) (no se aplica)
 *
 * QUÉ CUBRE
 *   C1 forma: una sola versión de cada puerta con la firma del contrato; anon no y authenticated sí; las internas, nadie de
 *      afuera; las tablas con RLS y sin políticas ni privilegios; las migraciones sin políticas ni `drop trigger` (la de
 *      tablas sin `alter` de tablas viejas; las otras dos sin ningún `alter table`); y el MISMO filtro en las dos: la
 *      previsualización y el cuadre llaman a fn_cuadre_piso_vista una vez cada una, y la vista a fn_cuadre_piso_calculo.
 *   C2 permisos: solo un líder confirma (integrante con Existencias y terminal Almacén con Existencias: cuadre_solo_lider,
 *      nada se escribe); revisar sí lo puede quien ve Existencias en su sede, no sin el módulo ni en otra sede; anon no; el
 *      Taller (sin piso ni almacén) no se cuadra.
 *   C3 firma: con responsable presente firma ella (cabecera y cada fila del libro); con uno ausente, 42501 y nada se escribe.
 *   C4 la cuenta y todo o nada: el escenario completo (bajan, suben, no cargadas, apartadas, cuarentena, archivada, producto
 *      de prueba, la «Prenda sin registrar»); la previsualización dice EXACTAMENTE lo que el cuadre aplica; si una línea
 *      falla a mitad, no queda nada (ni cabecera, ni ítems, ni movimientos, ni stock movido).
 *   C5 el libro: una fila traslado/movimiento_interno por prenda movida, con la nota «Cuadre del piso», cada prenda en UNA
 *      dirección, el total libre de la sede igual; el ítem de cada fila con su sentido; Actividad escribe sus dos líneas.
 *   C6 idempotencia: la misma marca y la misma lista (en otro orden, repetidas) devuelve el mismo cuadre sin mover nada; con
 *      otra lista, otra nota u otra sede, cuadre_token_reusado y nada se mueve.
 *   C7 el escaneo: si el ALMACÉN se movió después de escaneo_desde, se rechaza todo y dice qué prendas (solo las del almacén,
 *      sin la centinela ni los productos de prueba) con revisado_hasta; un movimiento solo del piso no invalida; la hora del
 *      escaneo futura o de hace más de 3 días no vale; si la sede se cuadró después de tu escaneo, cuadre_ya_hecho.
 *   C8 volver a cuadrar: sin nota, cuadre_nota_requerida (lo dice el disparador); con nota, entra y el estado cuenta 2.
 *   C9 la forma de la lista: sin marca, nula, línea inválida, un código que no es de ninguna prenda, nota de más de 300; la
 *      lista vacía SÍ vale (nada guardado: todo lo libre del almacén pasa al piso).
 *   C10 estado: sin cuadre, cuadrado_en nulo; con cuadre, la fecha, quién y cuántas.
 *   C11 Frescura: el cuadre no es bajada ni retiro (el núcleo no lo ve; la confianza del registro no cambia; una bajada real
 *      de la misma prenda sigue contando); lo bajado llega con la marca 14 (interno, edad desconocida y cuadre) y lo subido
 *      con la 10 (interno y cuadre): con la 8, la web corta ahí la medida de «Ya decidí».
 *   C12 la migración de Frescura: desde los cuerpos de antes (los de producción) entra y deja los md5 de su guarda; pegada
 *      otra vez no cambia nada; con un parche en vivo en cualquiera de las dos aborta y no pisa nada; el paso 4 de
 *      Frescura pegado después aborta y no deshace nada. Y el orden de pegado (tablas → Frescura → Eliminar → funciones)
 *      lo hace cumplir la base: sin la protección de Frescura o de Eliminar, la parte de funciones aborta sin tocar nada.
 *   C13 tamaño: 550 tallas y ~800 prendas en una sede cuadran dentro del statement_timeout de 8 s de authenticated.
 *   C14 un conteo abierto en la sede frena el cuadre (cuadre_conteo_abierto, nada se escribe): su cierre corregiría otra vez
 *      lo mismo. Revisar y el estado lo avisan; cancelado el conteo, el cuadre entra.
 *
 * CÓMO. Igual que `retirar_del_piso.mjs`: cada caso en su transacción con ROLLBACK (nunca se commitea nada), sesión simulada
 * con `request.jwt.claim.sub` y el encabezado de PostgREST con `request.headers`. La sede es NUEVA en cada caso («ZZ Tienda
 * Cuadre», con piso, almacén y cuarentena): así la cuenta no depende del stock del seed. Todo lo del preludio ocurre en el
 * instante `now()` de la transacción: un escaneo «desde now()» no ve movimientos posteriores; uno «desde now() − 1 s», sí.
 *
 * USO
 *   pnpm pruebas:cuadrar-piso    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leerMigracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
const MIGRACION_TABLAS = "20261004200000_cuadre_piso_tablas.sql";
const MIGRACION_FUNCIONES = "20261004200100_cuadre_piso_funciones.sql";
const MIGRACION_FRESCURA = "20261004200050_cuadre_piso_frescura.sql";
const MIGRACION_ELIMINAR = "20261004200070_cuadre_piso_en_eliminar.sql";
const MIGRACION_P4_FRESCURA = "20260929100000_frescura_modulo_y_candado.sql";
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_ALMACEN = "33333333-3333-4333-8333-0000000000c4"; // cuenta de una terminal administrativa de Trujillo (esta prueba)
const ROSA = "33333333-3333-4333-8333-0000000000e3"; // integrante de Trujillo sin cuenta, marcó entrada: la responsable
const LUZ = "33333333-3333-4333-8333-0000000000e4"; // integrante de Trujillo sin cuenta, NO marcó entrada

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, lineas: psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Una migración entera como literal de SQL (entre $m$), para ejecutarla con pg_temp.intento dentro del caso. */
const comoLiteral = (sql) => `${"$"}m$${sql.replace(/\\/g, "\\\\")}${"$"}m$`;

/** Deshace el reemplazo anclado de una migración (sus anclas, leídas del archivo, en orden inverso): deja los cuerpos de
 *  antes, los de producción. Para probar la migración «desde producción» dentro de un caso. */
const deshacer = (migracion) =>
  [...leerMigracion(migracion).matchAll(/reemplazar_anclado\(\s*'([^']+)',\s*\$v\$([\s\S]*?)\$v\$,\s*\$n\$([\s\S]*?)\$n\$\s*\)/g)]
    .reverse()
    .map(([, firma, viejo, nuevo]) => `do $dd$ begin execute replace(pg_get_functiondef('${firma}'::regprocedure), $nn$${nuevo}$nn$, $vv$${viejo}$vv$); end $dd$;`)
    .join("\n");
const DESHACER_FRESCURA = deshacer(MIGRACION_FRESCURA);
const DESHACER_ELIMINAR = deshacer(MIGRACION_ELIMINAR);

const PRELUDIO = `
begin;
create function pg_temp.r(p_sql text) returns jsonb language plpgsql as $f$
declare v jsonb; v_estado text; v_msg text; v_hint text; v_detail text;
begin
  execute p_sql into v;
  return jsonb_build_object('ok', true, 'res', v);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint, v_detail = pg_exception_detail;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg, 'detail', nullif(v_detail, ''));
end;
$f$;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
set local request.jwt.claim.sub = '${FELIPE}';
select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset
-- La sede de la prueba: nueva, con piso, almacén y cuarentena, ligada a la sede de Dynamic de Trujillo (para la asistencia).
insert into retail.ubicaciones (nombre, tipo, sede_dynamic_id) values ('ZZ Tienda Cuadre', 'tienda', :'sede_tru') returning id as cua \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values
  (:'cua', 'Piso de venta', 'piso_venta'), (:'cua', 'Almacén de tienda', 'almacen_tienda'), (:'cua', 'Cuarentena', 'cuarentena');
select id as piso from retail.sububicaciones where ubicacion_id = :'cua' and tipo = 'piso_venta' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'cua' and tipo = 'almacen_tienda' \\gset
select id as cuar from retail.sububicaciones where ubicacion_id = :'cua' and tipo = 'cuarentena' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
-- Prendas propias: siete tallas de un producto nuevo (vx se archiva) y un producto de PRUEBA con una talla (vp).
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Cuadre Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
insert into retail.productos (referencia, marca_id, proveedor_id, es_prueba)
  select 'Blusa Cuadre De Prueba', marca_id, proveedor_id, true from retail.productos order by created_at limit 1 returning id as prodp \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'CUA-PRUEBA-' || t.n, 50
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 7;
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prodp', t.id, :'color', 'CUA-PRUEBA-P', 50 from retail.tallas t order by valor, id limit 1;
select id as va from retail.variantes where sku = 'CUA-PRUEBA-1' \\gset
select id as vb from retail.variantes where sku = 'CUA-PRUEBA-2' \\gset
select id as vc from retail.variantes where sku = 'CUA-PRUEBA-3' \\gset
select id as vd from retail.variantes where sku = 'CUA-PRUEBA-4' \\gset
select id as ve from retail.variantes where sku = 'CUA-PRUEBA-5' \\gset
select id as vf from retail.variantes where sku = 'CUA-PRUEBA-6' \\gset
select id as vx from retail.variantes where sku = 'CUA-PRUEBA-7' \\gset
select id as vp from retail.variantes where sku = 'CUA-PRUEBA-P' \\gset
\\set centinela '22222222-2222-4222-8222-222222222222'
-- ALMACÉN: va 5, vb 4, vc 3, vd 2, vx 2, vp 3, y 7 de la «Prenda sin registrar». PISO: va 1, vb 2, vd 3, ve 2.
-- CUARENTENA: va 1. (vf no tiene nada en la sede.)
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x.v, :'cua', x.s, 'entrada', x.n, 'prueba cuadre del piso: colchón'
    from (values (:'va'::uuid, :'alm'::uuid, 5), (:'vb', :'alm', 4), (:'vc', :'alm', 3), (:'vd', :'alm', 2), (:'vx', :'alm', 2),
                 (:'vp', :'alm', 3), (:'centinela', :'alm', 7),
                 (:'va', :'piso', 1), (:'vb', :'piso', 2), (:'vd', :'piso', 3), (:'ve', :'piso', 2),
                 (:'va', :'cuar', 1)) x(v, s, n);
select count(*) as _colchon from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.ubicacion_id = :'cua' and m.tipo = 'entrada' order by m.id) x \\gset
-- Talla archivada CON prendas en el almacén: se arma sin disparadores, solo dentro de esta transacción.
set local session_replication_role = replica;
update retail.variantes set activo = false where id = :'vx';
set local session_replication_role = origin;
-- Apartadas para clientes: vb 1 en el ALMACÉN y vd 1 en el PISO.
select retail.apartar_stock(:'vb', :'cua', 1, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'alm', null) as _ap1 \\gset
select retail.apartar_stock(:'vd', :'cua', 1, 'Eva Ruiz', '999111333', retail.fn_hoy_lima() + 3, null, :'piso', null) as _ap2 \\gset
-- La terminal del almacén de Trujillo y dos integrantes sin cuenta: Rosa marcó entrada, Luz no.
insert into auth.users (id, aud, role, email) values ('${T_ALMACEN}', 'authenticated', 'authenticated', 'terminal-almacen-cuadre@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Almacén TRU (prueba cuadre)', 'administrativa', '${T_ALMACEN}') returning id as t_almacen \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values
  ('${ROSA}', 'Rosa', 'Cuadre', 'activo', :'sede_tru'), ('${LUZ}', 'Luz', 'Cuadre', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru'), ('${LUZ}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
\\set luz '${LUZ}'
select id as felipe_p from public.personas where auth_user_id = '${FELIPE}' \\gset
select gen_random_uuid() as tok1 \\gset
select gen_random_uuid() as tok2 \\gset
select gen_random_uuid() as tok3 \\gset
`;

/** Cambia de sesión (como `postgres`). `resp`/`ubicacion`: variables psql que van en el encabezado. */
const sesion = (auth, { resp = null, ubicacion = null } = {}) => {
  const campos = [resp ? `'x-responsable', :'${resp}'` : null, ubicacion ? `'x-ubicacion', :'${ubicacion}'` : null].filter(Boolean).join(", ");
  return `reset role;
set local request.jwt.claim.sub = '${auth}';
set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';
select set_config('request.headers', json_build_object(${campos})::text, true) as _h \\gset
`;
};
const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
const soloModulos = (clave, modulos) =>
  `${COMO_POSTGRES}delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('${clave}');\n` +
  (modulos.length
    ? `insert into retail.rol_modulos (rol_id, modulo) select retail.fn_rol_por_clave('${clave}'), unnest(array[${modulos.map((m) => `'${m}'`).join(", ")}]);\n`
    : "");
const TERMINAL_CON_EXISTENCIAS = `${COMO_POSTGRES}insert into retail.rol_modulos (rol_id, modulo)
  select retail.fn_rol_por_clave('terminal_administrativa'), 'existencias'
  where not exists (select 1 from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('terminal_administrativa') and modulo = 'existencias');\n`;

/** [["va", 3], ["vb", 2]] → la lista jsonb (lo escaneado como guardado). */
const lista = (...pares) =>
  pares.length === 0 ? "'[]'::jsonb" : `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${n})`).join(", ")})`;
/** Lo escaneado del escenario completo (C4): va 2, vb 5, vc 3, vd 6, ve 3, vf 1 y el producto de prueba vp 1. */
const ESCANEO = lista(["va", 2], ["vb", 5], ["vc", 3], ["vd", 6], ["ve", 3], ["vf", 1], ["vp", 1]);
/** cuadrar_piso a través de pg_temp.r: {ok, res} o {ok:false, estado, hint, msg, detail}. */
const cuadrar = (items, { tok = ":'tok1'", desde = "now()", nota = "null", ubic = "cua" } = {}) =>
  `pg_temp.r(format('select retail.cuadrar_piso(%L, %L::jsonb, %L::timestamptz, %L, %L)', :'${ubic}', ${items}, ${desde}, ${nota}, ${tok}))`;
const previa = (items, { ubic = "cua" } = {}) => `pg_temp.r(format('select retail.previsualizar_cuadre_piso(%L, %L::jsonb)', :'${ubic}', ${items}))`;
const estado = (ubic = "cua") => `pg_temp.r(format('select retail.fn_cuadre_piso_estado(%L)', :'${ubic}'))`;
/** cantidad|apartada de una prenda en una sububicación de la sede de prueba. */
const st = (v, sub) =>
  `coalesce((select cantidad || '/' || cantidad_apartada from retail.stock where variante_id = :'${v}' and ubicacion_id = :'cua' and sububicacion_id = :'${sub}'), '0/0')`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.movimientos), (select count(*) from retail.cuadres_piso), (select count(*) from retail.cuadre_piso_items),
  (select coalesce(sum(cantidad * 7 + cantidad_apartada), 0) from retail.stock where ubicacion_id = :'cua'))`;
/** Lo libre de piso + almacén de la sede, de todas las prendas. */
const TOTAL_LIBRE = `(select coalesce(sum(cantidad - cantidad_apartada), 0) from retail.stock where ubicacion_id = :'cua' and sububicacion_id in (:'piso', :'alm'))`;

let fallos = 0;
let total = 0;
function esperar(nombre, ok, detalle = "") {
  total++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (detalle) console.log(`    ${String(detalle).slice(0, 2500).replace(/\n/g, "\n    ")}`);
  }
}
/** Corre el caso y le pasa sus líneas de salida a `verificar` (string = la última línea exacta; función = libre). */
function caso(nombre, sql, verificar) {
  const r = correr(sql);
  if (!r.ok) return esperar(nombre, false, r.mensaje);
  let ok = false;
  try {
    ok = typeof verificar === "string" ? r.lineas[r.lineas.length - 1] === verificar : !!verificar(r.lineas);
  } catch {
    ok = false;
  }
  esperar(nombre, ok, typeof verificar === "string" ? `esperaba «${verificar}», salió:\n${r.lineas.join("\n")}` : r.lineas.join("\n"));
}
const json = (linea) => JSON.parse(linea);
const error = (linea, hint, estado = "P0001") => {
  const j = json(linea);
  return j.ok === false && j.estado === estado && j.hint === hint;
};

// ===========================================================================
// C1 · Forma
// ===========================================================================

caso(
  "C1 · una sola versión de cada puerta, con la firma del contrato",
  `select string_agg(proname || '(' || pg_get_function_identity_arguments(oid) || ')', ';' order by proname)
     from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('cuadrar_piso', 'previsualizar_cuadre_piso', 'fn_cuadre_piso_estado');`,
  "cuadrar_piso(p_ubicacion_id uuid, p_guardado jsonb, p_escaneo_desde timestamp with time zone, p_nota text, p_token uuid);fn_cuadre_piso_estado(p_ubicacion_id uuid);previsualizar_cuadre_piso(p_ubicacion_id uuid, p_guardado jsonb)"
);
caso(
  "C1 · las tres puertas: anon no, authenticated sí, security definer con el search_path de la casa; las cuatro internas: nadie de afuera",
  `select string_agg(p.proname || '=' || concat_ws(',', has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
                    p.prosecdef, coalesce(p.proconfig::text like '%search_path=retail, public, extensions%', false)), ';' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('cuadrar_piso', 'previsualizar_cuadre_piso', 'fn_cuadre_piso_estado', 'fn_cuadre_piso_lista', 'fn_cuadre_piso_calculo',
                        'fn_cuadre_piso_vista', 'fn_cuadre_piso_respuesta', 'fn_cuadre_piso_conteo_abierto');`,
  "cuadrar_piso=f,t,t,t;fn_cuadre_piso_calculo=f,f,t,t;fn_cuadre_piso_conteo_abierto=f,f,t,t;fn_cuadre_piso_estado=f,t,t,t;fn_cuadre_piso_lista=f,f,t,t;fn_cuadre_piso_respuesta=f,f,t,t;fn_cuadre_piso_vista=f,f,t,t;previsualizar_cuadre_piso=f,t,t,t"
);
caso(
  "C1 · las dos tablas: RLS encendido, CERO políticas y sin privilegios para authenticated (solo las tocan las funciones)",
  `select concat_ws(',',
    (select bool_and(relrowsecurity) from pg_class where oid in ('retail.cuadres_piso'::regclass, 'retail.cuadre_piso_items'::regclass)),
    (select count(*) from pg_policies where schemaname = 'retail' and tablename in ('cuadres_piso', 'cuadre_piso_items')),
    has_table_privilege('authenticated', 'retail.cuadres_piso', 'select'), has_table_privilege('authenticated', 'retail.cuadre_piso_items', 'insert'));`,
  "t,0,f,f"
);
{
  // Sin los comentarios: la cabecera puede explicar la regla sin romperla.
  const sin = (m) => leerMigracion(m).replace(/--[^\n]*/g, "");
  esperar(
    "C1 · ninguna de las cuatro crea políticas ni quita disparadores (ADR-0195); la de funciones, la de Frescura y la de Eliminar no alteran tablas; la de tablas solo enciende RLS en las suyas",
    [MIGRACION_TABLAS, MIGRACION_FUNCIONES, MIGRACION_FRESCURA, MIGRACION_ELIMINAR].every((m) => !/\bdrop\s+trigger\b|\b(create|drop)\s+policy\b/i.test(sin(m))) &&
      [MIGRACION_FUNCIONES, MIGRACION_FRESCURA, MIGRACION_ELIMINAR].every((m) => !/\balter\s+table\b/i.test(sin(m))) &&
      (sin(MIGRACION_TABLAS).match(/\balter\s+table\s+([\w.]+)/gi) ?? []).every((a) => /retail\.(cuadres_piso|cuadre_piso_items)\b/.test(a))
  );
  // ADR-0288: dentro de un texto entre comillas simples, el SQL Editor toma un `select … into` por una tabla nueva.
  const comillas = (m) => [...sin(m).matchAll(/'(?:[^']|'')*'/g)].map((x) => x[0]);
  esperar(
    "C1 · ningún texto entre comillas simples de las cuatro trae «select … into» (ADR-0288)",
    [MIGRACION_TABLAS, MIGRACION_FUNCIONES, MIGRACION_FRESCURA, MIGRACION_ELIMINAR].every((m) => comillas(m).every((t) => !/select[\s\S]*\binto\b/i.test(t)))
  );
}
caso(
  "C1 · el MISMO filtro: previsualizar_cuadre_piso y cuadrar_piso llaman cada una UNA vez a fn_cuadre_piso_vista, y la vista UNA vez a fn_cuadre_piso_calculo",
  `select string_agg(f || '=' || ((length(d) - length(replace(d, t, ''))) / length(t)), ',' order by f)
     from (values ('cuadrar_piso', 'retail.cuadrar_piso(uuid, jsonb, timestamptz, text, uuid)', 'fn_cuadre_piso_vista('),
                  ('previsualizar', 'retail.previsualizar_cuadre_piso(uuid, jsonb)', 'fn_cuadre_piso_vista('),
                  ('vista', 'retail.fn_cuadre_piso_vista(uuid, jsonb)', 'fn_cuadre_piso_calculo(')) x(f, firma, t)
     cross join lateral (select pg_get_functiondef(firma::regprocedure) as d) y;`,
  "cuadrar_piso=1,previsualizar=1,vista=1"
);

// ===========================================================================
// C2 · Permisos
// ===========================================================================

caso(
  "C2 · integrante CON Existencias en su sede → cuadre_solo_lider, y nada se escribe",
  `${soloModulos("integrante", ["existencias"])}select ${CONTADORES} as antes \\gset
${sesion(MICAELA)}${COMO_API}select ${cuadrar(lista(["va", 1]), { ubic: "tru" })};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "cuadre_solo_lider") && json(l.at(-2)).msg.startsWith("Solo un líder confirma el cuadre del piso.") && l.at(-1) === "t"
);
caso(
  "C2 · terminal Almacén de TRU con Existencias y responsable presente → cuadre_solo_lider (confirmar es de la cuenta de un líder)",
  `${TERMINAL_CON_EXISTENCIAS}${sesion(T_ALMACEN, { resp: "rosa" })}${COMO_API}select ${cuadrar(lista(["va", 1]), { ubic: "tru" })};`,
  (l) => error(l.at(-1), "cuadre_solo_lider")
);
caso(
  "C2 · revisar: la integrante con Existencias sí en su sede; sin el módulo o en otra sede, cuadre_sin_permiso; la terminal con Existencias, sí",
  `${soloModulos("integrante", ["existencias"])}${sesion(MICAELA)}${COMO_API}select (${previa(lista(["va", 1]), { ubic: "tru" })}) ->> 'ok';
select ${previa(lista(["va", 1]))};
${soloModulos("integrante", ["vender"])}${sesion(MICAELA)}${COMO_API}select ${previa(lista(["va", 1]), { ubic: "tru" })};
select ${estado("tru")};
${TERMINAL_CON_EXISTENCIAS}${sesion(T_ALMACEN)}${COMO_API}select (${previa(lista(["va", 1]), { ubic: "tru" })}) ->> 'ok';`,
  (l) => l.at(-5) === "true" && error(l.at(-4), "cuadre_sin_permiso") && error(l.at(-3), "cuadre_sin_permiso") && error(l.at(-2), "cuadre_sin_permiso") && l.at(-1) === "true"
);
caso(
  "C2 · anon no ejecuta ninguna de las tres (42501)",
  `${COMO_POSTGRES}set local role anon;
select pg_temp.intento(format('select retail.cuadrar_piso(%L, ''[]''::jsonb, now(), null, gen_random_uuid())', :'cua')) ->> 'estado';
select pg_temp.intento(format('select retail.previsualizar_cuadre_piso(%L, ''[]''::jsonb)', :'cua')) ->> 'estado';
select pg_temp.intento(format('select retail.fn_cuadre_piso_estado(%L)', :'cua')) ->> 'estado';`,
  (l) => l.slice(-3).every((x) => x === "42501")
);
caso(
  "C2 · el Taller (no separa piso y almacén) no se cuadra ni se revisa: cuadre_tienda_sin_piso",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar("'[]'::jsonb", { ubic: "taller" })};
select ${previa("'[]'::jsonb", { ubic: "taller" })};`,
  (l) => error(l.at(-2), "cuadre_tienda_sin_piso") && error(l.at(-1), "cuadre_tienda_sin_piso")
);

// ===========================================================================
// C3 · Firma
// ===========================================================================

caso(
  "C3 · el líder con Rosa (presente) como responsable: firma Rosa la cabecera y cada fila del libro",
  `${sesion(FELIPE, { resp: "rosa", ubicacion: "cua" })}${COMO_API}select ${cuadrar(ESCANEO)} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', (:'r')::jsonb -> 'res' ->> 'por',
  (select persona_id = :'rosa' from retail.cuadres_piso where token_cliente = :'tok1'),
  (select count(*) || ':' || bool_and(m.usuario_id = :'rosa') from retail.cuadre_piso_items i join retail.movimientos m on m.id = i.movimiento_id
    join retail.cuadres_piso c on c.id = i.cuadre_id where c.token_cliente = :'tok1'));`,
  "true,Rosa Cuadre,t,4:true"
);
caso(
  "C3 · el líder sin responsable (la casa no lo exige): firma él mismo",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', (select persona_id = :'felipe_p' from retail.cuadres_piso where token_cliente = :'tok1'));`,
  "true,t"
);
caso(
  "C3 · con Luz (no marcó entrada) como responsable → 42501 responsable_no_presente, y nada se escribe",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE, { resp: "luz", ubicacion: "cua" })}${COMO_API}select ${cuadrar(ESCANEO)};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "responsable_no_presente", "42501") && l.at(-1) === "t"
);

// ===========================================================================
// C4 · La cuenta, lo que queda fuera, y todo o nada
// ===========================================================================

// A = almacén libre, P = piso libre, S = escaneado:
//   va A5 P1 S2 → 3 al piso · vb A3 (+1 apartada) P2 S5 → 2 al almacén · vc A3 P0 S3 → nada · vd A2 P2 (+1 apartada) S6 → 2 al
//   almacén y 2 no cargadas · ve A0 P2 S3 → 2 al almacén y 1 no cargada · vf A0 P0 S1 → 1 no cargada · vx archivada (A2) → no se
//   mueve · vp de prueba (A3, S1) → no se mueve · la centinela (7 en el almacén) → no existe para el cuadre.
const RESUMEN_ESPERADO = {
  lineas_al_piso: 1,
  prendas_al_piso: 3,
  lineas_al_almacen: 3,
  prendas_al_almacen: 6,
  lineas_no_cargadas: 3,
  prendas_no_cargadas: 4,
  prendas_escaneadas: 21,
  antes: { piso: 7, almacen: 13 },
  despues: { piso: 4, almacen: 16 },
  total: 20,
  apartadas: 2,
  archivadas: { lineas: 1, almacen: 2, piso: 0 },
  escaneadas_fuera: 1,
  danadas: 1,
};
/** Igualdad sin importar el orden de las claves (jsonb las ordena a su manera). */
const ordenado = (v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenado(v[k])])) : v);
const igualResumen = (r) => Object.entries(RESUMEN_ESPERADO).every(([k, v]) => JSON.stringify(ordenado(r[k])) === JSON.stringify(ordenado(v)));

caso(
  "C4 · la previsualización: el resumen exacto y una línea por prenda con algo que decir (sin vc, que ya cuadra, ni la centinela)",
  `${sesion(FELIPE)}${COMO_API}select ${previa(ESCANEO)} as p \\gset
${COMO_POSTGRES}select (:'p')::jsonb -> 'res' -> 'resumen';
select string_agg(retail.fn_prenda_corta((l ->> 'variante_id')::uuid) || ':' || (l ->> 'motivo') || ':' || (l ->> 'al_piso') || '/' || (l ->> 'al_almacen') || '/' || (l ->> 'no_cargadas'), ';'
                  order by l ->> 'variante_id')
       = (select string_agg(retail.fn_prenda_corta(v) || ':' || x, ';' order by v::text)
            from (values (:'va'::uuid, 'cuadra:3/0/0'), (:'vb', 'cuadra:0/2/0'), (:'vd', 'cuadra:0/2/2'), (:'ve', 'cuadra:0/2/1'),
                         (:'vf', 'cuadra:0/0/1'), (:'vx', 'archivada:0/0/0'), (:'vp', 'no_es_inventario:0/0/0')) y(v, x))
  from jsonb_array_elements((:'p')::jsonb -> 'res' -> 'lineas') l;
select coalesce((:'p')::jsonb -> 'res' ->> 'ultimo_cuadre', 'sin cuadre');`,
  (l) => igualResumen(json(l.at(-3))) && l.at(-2) === "t" && l.at(-1) === "sin cuadre"
);
caso(
  "C4 · el cuadre aplica EXACTAMENTE lo que la previsualización mostró (mismo resumen), y el stock queda como dice la cuenta",
  `${sesion(FELIPE)}${COMO_API}select ${previa(ESCANEO)} as p \\gset
select ${cuadrar(ESCANEO)} as r \\gset
${COMO_POSTGRES}select (:'r')::jsonb -> 'res';
select ((:'p')::jsonb -> 'res' -> 'resumen') = (select resumen from retail.cuadres_piso where token_cliente = :'tok1');
select concat_ws(' ', 'va', ${st("va", "alm")}, ${st("va", "piso")}, ${st("va", "cuar")}, 'vb', ${st("vb", "alm")}, ${st("vb", "piso")},
  'vc', ${st("vc", "alm")}, ${st("vc", "piso")}, 'vd', ${st("vd", "alm")}, ${st("vd", "piso")}, 've', ${st("ve", "alm")}, ${st("ve", "piso")},
  'vf', ${st("vf", "alm")}, ${st("vf", "piso")}, 'vx', ${st("vx", "alm")}, ${st("vx", "piso")}, 'vp', ${st("vp", "alm")}, ${st("vp", "piso")},
  'centinela', ${st("centinela", "alm")}, ${st("centinela", "piso")});`,
  (l) => {
    const r = json(l.at(-3));
    return (
      igualResumen(r) &&
      r.ya_registrado === false &&
      r.no_cargado.length === 3 &&
      l.at(-2) === "t" &&
      l.at(-1) === "va 2/0 4/0 1/0 vb 6/1 0/0 vc 3/0 0/0 vd 4/0 1/1 ve 2/0 0/0 vf 0/0 0/0 vx 2/0 0/0 vp 3/0 0/0 centinela 7/0 0/0"
    );
  }
);
caso(
  "C4 · no cargadas: se guardan en la cabecera (vd 2, ve 1, vf 1) y NO se aplican (vf sigue sin stock en la sede)",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r \\gset
${COMO_POSTGRES}select string_agg(retail.fn_prenda_corta((n ->> 'variante_id')::uuid) || '=' || (n ->> 'no_cargadas'), ',' order by n ->> 'variante_id')
       = (select string_agg(retail.fn_prenda_corta(v) || '=' || x, ',' order by v::text) from (values (:'vd'::uuid, '2'), (:'ve', '1'), (:'vf', '1')) y(v, x))
  from retail.cuadres_piso c, jsonb_array_elements(c.no_cargado) n where c.token_cliente = :'tok1';
select count(*) from retail.stock where variante_id = :'vf' and ubicacion_id = :'cua';`,
  (l) => l.at(-2) === "t" && l.at(-1) === "0"
);
caso(
  "C4 · TODO O NADA: si la última línea falla a mitad del cuadre, no queda nada (ni cabecera, ni ítems, ni filas del libro, ni stock movido)",
  `select ${CONTADORES} as antes \\gset
-- La ÚLTIMA línea que se mueve (en orden de prenda, el mismo del cuadre) falla después de que las otras tres ya se movieron.
create function pg_temp.falla_ultima() returns trigger language plpgsql as $f$
begin
  if new.variante_id = current_setting('prueba.ultima')::uuid then raise exception 'falla a propósito'; end if;
  return new;
end $f$;
select set_config('prueba.ultima', (select x from unnest(array[:'va', :'vb', :'vd', :'ve']::uuid[]) x order by x desc limit 1)::text, true) as _s \\gset
create trigger zz_falla_ultima before insert on retail.cuadre_piso_items for each row execute function pg_temp.falla_ultima();
${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', (:'r')::jsonb ->> 'msg', ${CONTADORES} = :'antes');`,
  "false,falla a propósito,t"
);
caso(
  "C4 · lista vacía (nada guardado): todo lo libre del almacén pasa al piso; lo apartado, la cuarentena, lo archivado, lo de prueba y la centinela no",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar("'[]'::jsonb")} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', (:'r')::jsonb -> 'res' ->> 'prendas_al_piso', (:'r')::jsonb -> 'res' ->> 'prendas_al_almacen');
select concat_ws(' ', ${st("va", "alm")}, ${st("va", "piso")}, ${st("va", "cuar")}, ${st("vb", "alm")}, ${st("vb", "piso")}, ${st("vc", "alm")}, ${st("vc", "piso")},
  ${st("vd", "alm")}, ${st("vd", "piso")}, ${st("vx", "alm")}, ${st("vp", "alm")}, ${st("centinela", "alm")});`,
  (l) => l.at(-2) === "true,13,0" && l.at(-1) === "0/0 6/0 1/0 1/1 5/0 0/0 3/0 0/0 5/1 2/0 3/0 7/0"
);

// ===========================================================================
// C5 · El libro
// ===========================================================================

caso(
  "C5 · una fila traslado/movimiento_interno por prenda movida, con «Cuadre del piso», su ítem con su sentido, una sola dirección por prenda y el total libre igual",
  `select ${TOTAL_LIBRE} as total_antes \\gset
${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'ok', ${TOTAL_LIBRE} = :total_antes,
  (select count(*) from retail.movimientos m where m.ubicacion_id = :'cua' and m.motivo = 'movimiento_interno'),
  (select bool_and(m.tipo = 'traslado' and m.ubicacion_destino_id = :'cua' and m.nota = 'Cuadre del piso')
     from retail.movimientos m where m.ubicacion_id = :'cua' and m.motivo = 'movimiento_interno'),
  (select string_agg(retail.fn_prenda_corta(i.variante_id) || '>' || i.sentido || ':' || i.cantidad, ';' order by i.variante_id::text)
     = (select string_agg(retail.fn_prenda_corta(v) || '>' || x, ';' order by v::text)
          from (values (:'va'::uuid, 'al_piso:3'), (:'vb', 'al_almacen:2'), (:'vd', 'al_almacen:2'), (:'ve', 'al_almacen:2')) y(v, x))
     from retail.cuadre_piso_items i join retail.cuadres_piso c on c.id = i.cuadre_id where c.token_cliente = :'tok1'),
  (select bool_and((i.sentido = 'al_piso' and m.sububicacion_id = :'alm' and m.sububicacion_destino_id = :'piso')
                or (i.sentido = 'al_almacen' and m.sububicacion_id = :'piso' and m.sububicacion_destino_id = :'alm'))
     from retail.cuadre_piso_items i join retail.movimientos m on m.id = i.movimiento_id
     join retail.cuadres_piso c on c.id = i.cuadre_id where c.token_cliente = :'tok1'),
  -- Solo lo de ESTE caso: una base compartida puede traer cuadres confirmados de otras pruebas o pantallas.
  (select count(*) = count(distinct i.variante_id) from retail.cuadre_piso_items i join retail.cuadres_piso c on c.id = i.cuadre_id where c.token_cliente = :'tok1'));`,
  "true,t,4,t,t,t,t"
);
caso(
  "C5 · el esquema no deja guardar un ítem que no es su movimiento (otra cantidad, o el sentido al revés): cuadre_item_incoherente",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r \\gset
${COMO_POSTGRES}select id as cid from retail.cuadres_piso where token_cliente = :'tok1' \\gset
select m.id as mid from retail.movimientos m join retail.cuadre_piso_items i on i.movimiento_id = m.id where i.variante_id = :'va' \\gset
-- Un movimiento del libro almacén→piso suelto, sin ítem: el ítem no puede decir 2 si el movimiento dice 1, ni «al_almacen».
select retail.mover_interno(:'cua', :'vc', 1, :'alm', :'piso', 'suelto', null) as suelto \\gset
select pg_temp.intento(format('insert into retail.cuadre_piso_items (movimiento_id, cuadre_id, variante_id, sentido, cantidad) values (%L, %L, %L, %L, 2)', :'suelto', :'cid', :'vc', 'al_piso')) ->> 'hint';
select pg_temp.intento(format('insert into retail.cuadre_piso_items (movimiento_id, cuadre_id, variante_id, sentido, cantidad) values (%L, %L, %L, %L, 1)', :'suelto', :'cid', :'vc', 'al_almacen')) ->> 'hint';
select pg_temp.intento(format('update retail.cuadres_piso set nota = %L where id = %L', 'otra', :'cid')) ->> 'ok';
select pg_temp.intento(format('delete from retail.cuadre_piso_items where movimiento_id = %L', :'mid')) ->> 'ok';`,
  (l) => l.at(-4) === "cuadre_item_incoherente" && l.at(-3) === "cuadre_item_incoherente" && l.at(-2) === "false" && l.at(-1) === "false"
);
caso(
  "C5 · Actividad escribe sola sus dos líneas: «bajó al piso … · Cuadre del piso» y «subió al almacén … · Cuadre del piso»",
  `-- Los productos de la prueba nacieron en ESTA transacción: Actividad tomaría el cuadre por la carga de un producto nuevo
-- (misma hora exacta) y no lo anotaría. Se corren un día atrás, solo aquí.
set local session_replication_role = replica;
update retail.productos set created_at = created_at - interval '1 day' where id in (:'prod', :'prodp');
set local session_replication_role = origin;
${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r \\gset
${COMO_POSTGRES}set constraints all immediate;
select string_agg(case when a.descripcion like 'bajó al piso %Cuadre del piso' then 'baja' when a.descripcion like 'subió al almacén %Cuadre del piso' then 'sube' else a.descripcion end,
                  ',' order by a.descripcion)
  from retail.actividad a where a.ubicacion_id = :'cua' and a.modulo = 'existencias';`,
  "baja,sube"
);

// ===========================================================================
// C6 · Idempotencia
// ===========================================================================

caso(
  "C6 · misma marca y misma lista (otro orden, repetidas partidas) → ya_registrado con el MISMO cuadre, y nada se mueve otra vez",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${cuadrar(lista(["vp", 1], ["vf", 1], ["ve", 3], ["vd", 4], ["vd", 2], ["vc", 3], ["vb", 5], ["va", 1], ["va", 1]))} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r1')::jsonb -> 'res' ->> 'ya_registrado', (:'r2')::jsonb -> 'res' ->> 'ya_registrado',
  (:'r1')::jsonb -> 'res' ->> 'cuadre_id' = (:'r2')::jsonb -> 'res' ->> 'cuadre_id',
  ((:'r1')::jsonb -> 'res') - 'ya_registrado' = ((:'r2')::jsonb -> 'res') - 'ya_registrado',
  ${CONTADORES} = :'antes');`,
  "false,true,t,t,t"
);
caso(
  "C6 · la misma marca con otra lista, otra nota u otra sede → cuadre_token_reusado, y nada se mueve",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${cuadrar(lista(["va", 1]))};
select ${cuadrar(ESCANEO, { nota: "'otra nota'" })};
select ${cuadrar(ESCANEO, { ubic: "tru" })};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-4), "cuadre_token_reusado") && error(l.at(-3), "cuadre_token_reusado") && error(l.at(-2), "cuadre_token_reusado") && l.at(-1) === "t"
);

// ===========================================================================
// C7 · El escaneo: lo que se movió mientras tanto
// ===========================================================================

caso(
  "C7 · el almacén se movió después de escaneo_desde → cuadre_almacen_movido con las prendas del ALMACÉN (sin ve, que solo se movió en el piso, ni la de prueba ni la centinela) y revisado_hasta; nada se mueve",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO, { desde: "now() - interval '1 second'" })} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint',
  (select string_agg(retail.fn_prenda_corta((p ->> 'variante_id')::uuid), ';' order by p ->> 'variante_id')
     = (select string_agg(retail.fn_prenda_corta(v), ';' order by v::text) from unnest(array[:'va', :'vb', :'vc', :'vd', :'vx']::uuid[]) v)
     from jsonb_array_elements(((:'r')::jsonb ->> 'detail')::jsonb -> 'prendas') p),
  (((:'r')::jsonb ->> 'detail')::jsonb ->> 'revisado_hasta')::timestamptz >= now(),
  ((:'r')::jsonb ->> 'msg') like 'Mientras escaneabas se movieron 5 prendas en el almacén.%',
  ${CONTADORES} = :'antes');`,
  "cuadre_almacen_movido,t,t,t,t"
);
caso(
  // Revisión adversarial: la rama «entra al almacén» del chequeo no la vigilaba nadie (quitarla dejaba 35/35 en verde). Un
  // «Subir a almacén» mientras se escanea es un traslado piso → almacén: su origen es el PISO y solo su destino es el
  // almacén. El colchón del preludio se corre una hora atrás para que el escaneo «desde hace 1 s» vea solo esta subida.
  "C7 · un «Subir a almacén» (piso → almacén) después de escaneo_desde también invalida el escaneo: cuadre_almacen_movido con esa prenda sola, y nada se mueve",
  `${COMO_POSTGRES}set constraints all immediate;
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '1 hour' where ubicacion_id = :'cua' or ubicacion_destino_id = :'cua';
alter table retail.movimientos enable trigger movimientos_inmutables;
${sesion(FELIPE)}${COMO_API}select retail.mover_entre_piso_y_almacen(:'cua', :'ve', 1, :'piso', :'alm', null, gen_random_uuid()) as subida \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO, { desde: "now() - interval '1 second'" })} as r \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint',
  (select string_agg(p ->> 'variante_id', ';') from jsonb_array_elements(((:'r')::jsonb ->> 'detail')::jsonb -> 'prendas') p) = :'ve',
  ((:'r')::jsonb ->> 'msg') like 'Mientras escaneabas se movió 1 prenda en el almacén.%',
  ${CONTADORES} = :'antes');`,
  "cuadre_almacen_movido,t,t,t"
);
caso(
  // Un minuto en el futuro: antes la función lo dejaba pasar y el esquema lo rechazaba con un error crudo en inglés
  // (cuadres_piso_escaneo_antes, sin pista) que la pantalla mostraba tal cual (revisión adversarial).
  "C7 · la hora del escaneo en el futuro (aunque sea un minuto) o de hace más de 3 días → cuadre_escaneo_invalido, con su pista",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO, { desde: "now() + interval '1 hour'" })};
select ${cuadrar(ESCANEO, { desde: "now() + interval '1 minute'", tok: ":'tok3'" })};
select ${cuadrar(ESCANEO, { desde: "now() - interval '4 days'", tok: ":'tok2'" })};`,
  (l) => error(l.at(-3), "cuadre_escaneo_invalido") && error(l.at(-2), "cuadre_escaneo_invalido") && error(l.at(-1), "cuadre_escaneo_invalido")
);
caso(
  // La cuenta se toma ANTES de mirar el libro (revisión adversarial): lo confirmado después de la cuenta lo atrapa el
  // chequeo; al revés, una recepción de una prenda nueva para la sede entre el chequeo y la cuenta pasaba al piso.
  "C7 · el orden: la cuenta (fn_cuadre_piso_vista) va antes del chequeo de lo que se movió en el almacén",
  `select position('fn_cuadre_piso_vista(' in d) < position('m.created_at > p_escaneo_desde' in d)
     from (select pg_get_functiondef('retail.cuadrar_piso(uuid, jsonb, timestamptz, text, uuid)'::regprocedure) as d) x;`,
  "t"
);
caso(
  "C7 · otra persona cuadró la sede después de que empezaste a escanear → cuadre_ya_hecho, con lo que hizo la otra en el detail",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r1 \\gset
select ${cuadrar(lista(["va", 1]), { desde: "now() - interval '1 second'", tok: ":'tok2'", nota: "'segundo'" })} as r2 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb ->> 'hint', ((:'r2')::jsonb ->> 'detail')::jsonb ->> 'cuadre_id' = (:'r1')::jsonb -> 'res' ->> 'cuadre_id',
  (select count(*) from retail.cuadres_piso where ubicacion_id = :'cua'));`,
  "cuadre_ya_hecho,t,1"
);

// ===========================================================================
// C8 · Volver a cuadrar
// ===========================================================================

caso(
  "C8 · un segundo cuadre SIN nota → cuadre_nota_requerida (lo dice el esquema); con nota entra, y el estado cuenta 2 y muestra el último",
  `${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO)} as r1 \\gset
select ${cuadrar(lista(["va", 4]), { tok: ":'tok2'" })} as r2 \\gset
select ${cuadrar(lista(["va", 4]), { tok: ":'tok3'", nota: "'  Faltaba el estante del fondo  '" })} as r3 \\gset
select ${estado()} as e \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r2')::jsonb ->> 'hint', ((:'r2')::jsonb ->> 'msg') like 'Esta sede ya cuadró su piso el %. Para volver a cuadrarlo, escribe por qué.',
  (:'r3')::jsonb ->> 'ok', (:'r3')::jsonb -> 'res' ->> 'nota', (:'e')::jsonb -> 'res' ->> 'cuadres',
  (:'e')::jsonb -> 'res' ->> 'cuadrado_en' = (:'r3')::jsonb -> 'res' ->> 'cuadrado_en');`,
  "cuadre_nota_requerida,t,true,Faltaba el estante del fondo,2,t"
);

// ===========================================================================
// C9 · Forma de la lista
// ===========================================================================

caso(
  "C9 · sin marca, lista nula, línea inválida, código que no es de ninguna prenda o nota de más de 300 → rechazados con su pista, y nada se escribe",
  `select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${cuadrar(ESCANEO, { tok: "null" })};
select pg_temp.r(format('select retail.cuadrar_piso(%L, null, now(), null, %L)', :'cua', :'tok1'));
select ${cuadrar(`jsonb_build_array(jsonb_build_object('variante_id', :'va', 'cantidad', 0))`)};
select ${cuadrar(`jsonb_build_array(jsonb_build_object('variante_id', gen_random_uuid(), 'cantidad', 1))`)};
select ${cuadrar(ESCANEO, { nota: "repeat('x', 301)" })};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) =>
    error(l.at(-6), "cuadre_sin_token") &&
    error(l.at(-5), "cuadre_lista_invalida") &&
    error(l.at(-4), "cuadre_lista_invalida") &&
    error(l.at(-3), "cuadre_lista_invalida") &&
    error(l.at(-2), "cuadre_nota_larga") &&
    l.at(-1) === "t"
);

// ===========================================================================
// C10 · Estado
// ===========================================================================

caso(
  "C10 · fn_cuadre_piso_estado: sin cuadre, cuadrado_en nulo y 0; con cuadre, la fecha, quién y cuántas al piso y al almacén",
  `${sesion(FELIPE)}${COMO_API}select ${estado()} as e0 \\gset
select ${cuadrar(ESCANEO)} as r \\gset
select ${estado()} as e1 \\gset
${COMO_POSTGRES}select concat_ws(',', (:'e0')::jsonb -> 'res' ->> 'cuadrado_en' is null, (:'e0')::jsonb -> 'res' ->> 'cuadres',
  (:'e1')::jsonb -> 'res' ->> 'cuadrado_en' = (:'r')::jsonb -> 'res' ->> 'cuadrado_en', (:'e1')::jsonb -> 'res' ->> 'por',
  (:'e1')::jsonb -> 'res' ->> 'prendas_al_piso', (:'e1')::jsonb -> 'res' ->> 'prendas_al_almacen', (:'e1')::jsonb -> 'res' ->> 'cuadres');`,
  (l) => /^t,0,t,.+,3,6,1$/.test(l.at(-1))
);

// ===========================================================================
// C11 · Frescura
// ===========================================================================

caso(
  // Una bajada REAL de vc, y el cuadre le sube 1 de vc al almacén (con la bajada, A = 2, P = 1, S = 3). Dentro de la prueba
  // todo ocurre en el mismo instante; se corre al pasado para separarlo como en la tienda: la bajada (y el colchón) hace
  // 1 h 05 min y el cuadre hace 1 h, CINCO minutos después (dentro de la ventana de 10 de los retiros), y las bajadas ya
  // «cerradas» cuentan en la confianza. Sin la exclusión, el núcleo vería 5 filas del cuadre, la confianza contaría 2
  // bajadas y la real de vc quedaría «corregida» por la subida del cuadre de 5 minutos después.
  "C11 · el cuadre no es bajada ni retiro: el núcleo no ve sus filas, la confianza cuenta solo la bajada real, y esa bajada real no queda «corregida» por la subida del cuadre",
  `${sesion(FELIPE)}${COMO_API}select retail.bajar_al_piso(:'cua', ${lista(["vc", 1])}, gen_random_uuid()) as b \\gset
select ${cuadrar(ESCANEO)} as r \\gset
${COMO_POSTGRES}set constraints all immediate;
alter table retail.movimientos disable trigger movimientos_inmutables;
update retail.movimientos set created_at = created_at - interval '1 hour' where ubicacion_id = :'cua' or ubicacion_destino_id = :'cua';
update retail.movimientos set created_at = created_at - interval '5 minutes'
 where (ubicacion_id = :'cua' or ubicacion_destino_id = :'cua') and id not in (select movimiento_id from retail.cuadre_piso_items);
alter table retail.movimientos enable trigger movimientos_inmutables;
set local session_replication_role = replica;
update retail.cuadres_piso set created_at = created_at - interval '1 hour', escaneo_desde = escaneo_desde - interval '65 minutes' where ubicacion_id = :'cua';
update retail.bajadas_piso set created_at = created_at - interval '65 minutes' where ubicacion_id = :'cua';
set local session_replication_role = origin;
-- Como postgres con la sesión de Felipe (el líder lee Frescura); las tablas del cuadre no se leen desde la API.
select concat_ws(',', (:'r')::jsonb ->> 'ok',
  (select count(*) from retail.cuadre_piso_items i join retail.cuadres_piso c on c.id = i.cuadre_id where c.ubicacion_id = :'cua'),
  (select count(*) from retail.fn_bajadas_del_piso(:'cua') n where n.movimiento_id in (select movimiento_id from retail.cuadre_piso_items)),
  (select string_agg(n.estado || ':' || n.cantidad_efectiva, ';') from retail.fn_bajadas_del_piso(:'cua') n),
  (select sum(filas) || ':' || sum(unidades) from retail.fn_confianza_registro(:'cua')));`,
  "true,5,0,normal:1,1:1"
);
caso(
  "C11 · fn_frescura_sede: lo que el cuadre bajó llega con la marca 14 (interno + edad desconocida + cuadre), lo que subió con la 10 (interno + cuadre), y la bajada real con la 2",
  `${sesion(FELIPE)}${COMO_API}select retail.bajar_al_piso(:'cua', ${lista(["vc", 1])}, gen_random_uuid()) as b \\gset
select ${cuadrar(ESCANEO)} as r \\gset
select retail.fn_frescura_sede(:'cua') as j \\gset
${COMO_POSTGRES}select string_agg(x, ' ' order by x) from (
  select retail.fn_prenda_corta(i.variante_id) || ':' || i.sentido || ':' || (e ->> 2) as x
    from retail.cuadre_piso_items i
    join retail.cuadres_piso c on c.id = i.cuadre_id and c.token_cliente = :'tok1'
    cross join lateral jsonb_array_elements((:'j')::jsonb -> 'eventos' -> (i.variante_id::text)) e
   where (e ->> 3)::uuid = i.movimiento_id
  union all
  select 'bajada_real:' || (e ->> 2)
    from jsonb_array_elements((:'j')::jsonb -> 'eventos' -> (:'vc')) e
   where (e ->> 3)::uuid in (select movimiento_id from retail.bajada_piso_items)) q;
select string_agg(x, ' ' order by x) from (
  select retail.fn_prenda_corta(:'va') || ':al_piso:14' as x union all select retail.fn_prenda_corta(:'vb') || ':al_almacen:10'
  union all select retail.fn_prenda_corta(:'vc') || ':al_almacen:10'
  union all select retail.fn_prenda_corta(:'vd') || ':al_almacen:10' union all select retail.fn_prenda_corta(:'ve') || ':al_almacen:10'
  union all select 'bajada_real:2') q;`,
  (l) => l.at(-2) === l.at(-1)
);

// ===========================================================================
// C12 · La migración de Frescura (reemplazo anclado con guarda de md5)
// ===========================================================================

const MD5_DOS = `(select string_agg(proname || '=' || md5(prosrc), ',' order by proname) from pg_proc
  where pronamespace = 'retail'::regnamespace and proname in ('fn_bajadas_del_piso_nucleo', 'fn_frescura_sede'))`;
{
  const texto = leerMigracion(MIGRACION_FRESCURA);
  const [, nucleoAntes] = /c_nucleo_antes constant text := '([0-9a-f]{32})'/.exec(texto) ?? [];
  const [, nucleoDespues] = /c_nucleo_despues constant text := '([0-9a-f]{32})'/.exec(texto) ?? [];
  const [, sedeAntes] = /c_sede_antes constant text := '([0-9a-f]{32})'/.exec(texto) ?? [];
  const [, sedeDespues] = /c_sede_despues constant text := '([0-9a-f]{32})'/.exec(texto) ?? [];
  const ANTES = `fn_bajadas_del_piso_nucleo=${nucleoAntes},fn_frescura_sede=${sedeAntes}`;
  const DESPUES = `fn_bajadas_del_piso_nucleo=${nucleoDespues},fn_frescura_sede=${sedeDespues}`;
  caso(
    "C12 · la migración de Frescura: la base de hoy tiene los md5 «después» de su guarda; desde los de «antes» (producción) entra y llega a ellos; otra vez, nada cambia",
    `select ${MD5_DOS};
${DESHACER_FRESCURA}
select ${MD5_DOS};
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_FRESCURA))}) ->> 'ok';
select ${MD5_DOS};
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_FRESCURA))}) ->> 'ok';
select ${MD5_DOS};`,
    (l) => {
      const filas = l.filter((x) => x.startsWith("fn_") || x === "true" || x === "false");
      return filas.join("|") === [DESPUES, ANTES, "true", DESPUES, "true", DESPUES].join("|");
    }
  );
  caso(
    "C12 · con un parche en vivo en el núcleo o en fn_frescura_sede, la migración aborta nombrándola y no pisa nada; el paso 4 de Frescura pegado DESPUÉS aborta y no deshace nada",
    `${DESHACER_FRESCURA}
savepoint s1;
do $p$ begin execute replace(pg_get_functiondef('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)'::regprocedure), E'\\n$function$', E'\\n-- parche en vivo\\n$function$'); end $p$;
select ${MD5_DOS} as parchado \\gset
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_FRESCURA))}) ->> 'msg' like 'fn_bajadas_del_piso_nucleo tiene otro cuerpo%';
select ${MD5_DOS} = :'parchado';
rollback to savepoint s1;
savepoint s2;
do $p$ begin execute replace(pg_get_functiondef('retail.fn_frescura_sede(uuid, integer)'::regprocedure), E'\\n$function$', E'\\n-- parche en vivo\\n$function$'); end $p$;
select ${MD5_DOS} as parchado2 \\gset
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_FRESCURA))}) ->> 'msg' like 'fn_frescura_sede tiene otro cuerpo%';
select ${MD5_DOS} = :'parchado2';
rollback to savepoint s2;
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_FRESCURA))}) ->> 'ok';
select ${MD5_DOS} as hoy \\gset
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_P4_FRESCURA))}) ->> 'msg' like 'fn_frescura_sede tiene otro cuerpo%';
select ${MD5_DOS} = :'hoy';`,
    // aborta por el núcleo, sin tocar · aborta por fn_frescura_sede, sin tocar · entra · el paso 4 después aborta, sin tocar
    (l) => l.slice(-7).join(",") === "t,t,t,t,true,t,t"
  );
  // El orden de pegado lo hace cumplir la base, no una regla humana (revisión adversarial): si Frescura no quedó con su
  // protección (su parte abortó por un cuerpo vivo distinto), la parte de funciones aborta y cuadrar_piso no se toca.
  const FUNCIONES = `(select string_agg(proname || '=' || md5(prosrc), ',' order by proname) from pg_proc
    where pronamespace = 'retail'::regnamespace and proname in ('cuadrar_piso', 'previsualizar_cuadre_piso', 'fn_cuadre_piso_estado'))`;
  caso(
    "C12 · el orden de pegado: tablas → Frescura → Eliminar → funciones; sin la protección de Frescura o de Eliminar, la parte de funciones aborta y no toca nada; con las dos, entra",
    `select ${FUNCIONES} as antes \\gset
${DESHACER_FRESCURA}
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_FUNCIONES))}) ->> 'msg' like 'Frescura todavía no conoce el cuadre del piso: pega antes ${MIGRACION_FRESCURA}%';
select ${FUNCIONES} = :'antes';
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_FRESCURA))}) ->> 'ok';
${DESHACER_ELIMINAR}
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_FUNCIONES))}) ->> 'msg' like 'Eliminar con historia todavía no conoce el cuadre del piso: pega antes ${MIGRACION_ELIMINAR}%';
select ${FUNCIONES} = :'antes';
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_ELIMINAR))}) ->> 'ok';
select pg_temp.intento(${comoLiteral(leerMigracion(MIGRACION_FUNCIONES))}) ->> 'ok';
select ${FUNCIONES} = :'antes';`,
    (l) => {
      const orden = [MIGRACION_TABLAS, MIGRACION_FRESCURA, MIGRACION_ELIMINAR, MIGRACION_FUNCIONES];
      // aborta sin Frescura, sin tocar · Frescura entra · aborta sin Eliminar, sin tocar · Eliminar entra · funciones entra, igual
      return orden.join() === [...orden].sort().join() && l.slice(-8).join(",") === "t,t,true,t,t,true,true,t";
    }
  );
}

// ===========================================================================
// C13 · Tamaño: una sede grande cabe en los 8 s de authenticated
// ===========================================================================

caso(
  "C13 · 550 tallas y ~800 prendas (≈ 400 al piso y 30 al almacén) cuadran dentro del statement_timeout de 8 s de authenticated",
  `-- 550 tallas nuevas (11 productos × 50, con las tallas del seed repetidas por color no hace falta: una talla por producto y color).
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Grande Cuadre ' || g, (select marca_id from retail.productos order by created_at limit 1), (select proveedor_id from retail.productos order by created_at limit 1)
    from generate_series(1, 22) g;
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select p.id, t.id, :'color', 'CUA-GRANDE-' || row_number() over (), 50
    from retail.productos p cross join (select id from retail.tallas order by valor, id limit 25) t
   where p.referencia like 'Grande Cuadre %';
-- Cada talla: 1 en el almacén y 0 o 1 en el piso; las primeras 30 se escanean dos veces (suben), el resto no (bajan).
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select v.id, :'cua', s.sub, 'entrada', 1, 'prueba cuadre del piso: grande'
    from retail.variantes v
    cross join lateral (select :'alm'::uuid as sub union all select :'piso'::uuid where right(v.sku, 1) in ('1', '3', '5')) s
   where v.sku like 'CUA-GRANDE-%';
select count(*) as _grande from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.ubicacion_id = :'cua' and m.motivo = 'prueba cuadre del piso: grande' order by m.id) x \\gset
select (select count(*) from retail.variantes where sku like 'CUA-GRANDE-%') || ':' || (select sum(cantidad) from retail.stock where ubicacion_id = :'cua') as tam \\gset
select jsonb_agg(jsonb_build_object('variante_id', v.id, 'cantidad', 2)) as escaneo
  from (select id from retail.variantes where sku like 'CUA-GRANDE-%' order by sku limit 30) v \\gset
${sesion(FELIPE)}${COMO_API}set local statement_timeout = '8s';
select clock_timestamp() as t0 \\gset
select pg_temp.r(format('select retail.cuadrar_piso(%L, %L::jsonb, now(), null, %L)', :'cua', :'escaneo', :'tok1')) as r \\gset
select clock_timestamp() as t1 \\gset
${COMO_POSTGRES}select concat_ws(',', :'tam', (:'r')::jsonb ->> 'ok', (:'r')::jsonb -> 'res' ->> 'prendas_al_piso', (:'r')::jsonb -> 'res' ->> 'lineas_al_almacen',
  round(extract(epoch from (:'t1'::timestamptz - :'t0'::timestamptz))::numeric, 2));`,
  (l) => {
    const [tam, ok, alPiso, alAlmacen, segundos] = l.at(-1).split(",");
    console.log(`    (medido: ${tam} tallas:prendas en la sede, ${alPiso} al piso, ${alAlmacen} líneas al almacén, ${segundos} s)`);
    return ok === "true" && Number(segundos) < 8 && Number(alPiso) >= 400;
  }
);

// ===========================================================================
// C14 · Un conteo abierto en la sede frena el cuadre (revisión adversarial, 2026-10-04)
// ===========================================================================

// El escenario de la revisión: un conteo del PISO ya contó vc (el sistema dice 0 colgadas, hay 3). Si el cuadre bajara las
// 3 de vc del almacén y después se cerrara el conteo, su ajuste (+3) sumaría otra vez lo mismo: 6 colgadas donde hay 3.
caso(
  "C14 · con un conteo abierto (y ya contado) en la sede → cuadre_conteo_abierto con el conteo en el detail, y nada se escribe; Revisar y el estado lo avisan",
  `${sesion(FELIPE)}${COMO_API}select retail.abrir_conteo(:'cua', :'piso', 'todo', null) as conteo \\gset
select retail.conteo_contar(:'conteo', :'vc', 3, false) as _contado \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
select numero as numero from retail.conteos where id = :'conteo' \\gset
${sesion(FELIPE)}${COMO_API}select ${cuadrar("'[]'::jsonb")} as r \\gset
select ${previa("'[]'::jsonb")} as p \\gset
select ${estado()} as e \\gset
${COMO_POSTGRES}select concat_ws(',', (:'r')::jsonb ->> 'hint',
  ((:'r')::jsonb ->> 'msg') like 'Hay un conteo abierto en esta sede (Conteo ' || :'numero' || ' del piso, abierto el %). Ciérralo o cancélalo en Conteo antes de cuadrar%No se movió nada.',
  ((:'r')::jsonb ->> 'detail')::jsonb ->> 'conteo_id' = :'conteo',
  ((:'r')::jsonb ->> 'detail')::jsonb ->> 'lugar',
  (:'p')::jsonb -> 'res' -> 'conteo_abierto' ->> 'conteo_id' = :'conteo',
  (:'p')::jsonb -> 'res' -> 'resumen' ->> 'prendas_al_piso',
  (:'e')::jsonb -> 'res' -> 'conteo_abierto' ->> 'numero' = :'numero',
  ${CONTADORES} = :'antes');`,
  "cuadre_conteo_abierto,t,t,piso,t,13,t,t"
);
caso(
  "C14 · cancelado el conteo, el mismo cuadre entra (y Revisar y el estado ya no lo traen); sin conteo, conteo_abierto es nulo",
  `${sesion(FELIPE)}${COMO_API}select ${estado()} as e0 \\gset
select retail.abrir_conteo(:'cua', :'alm', 'todo', null) as conteo \\gset
select ${cuadrar("'[]'::jsonb")} as r1 \\gset
select retail.anular_conteo(:'conteo') as _anulado \\gset
select ${previa("'[]'::jsonb")} as p \\gset
select ${cuadrar("'[]'::jsonb")} as r2 \\gset
select ${estado()} as e \\gset
${COMO_POSTGRES}select concat_ws(',', (:'e0')::jsonb -> 'res' ->> 'conteo_abierto' is null, (:'r1')::jsonb ->> 'hint',
  ((:'r1')::jsonb ->> 'msg') like '%(Conteo % del almacén, abierto el %',
  (:'p')::jsonb -> 'res' ->> 'conteo_abierto' is null, (:'r2')::jsonb ->> 'ok', (:'r2')::jsonb -> 'res' ->> 'prendas_al_piso',
  (:'e')::jsonb -> 'res' ->> 'conteo_abierto' is null);`,
  "t,cuadre_conteo_abierto,t,t,true,13,t"
);

console.log(`\n${fallos === 0 ? "✓" : "✗"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
