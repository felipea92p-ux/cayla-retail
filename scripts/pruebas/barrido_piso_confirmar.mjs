#!/usr/bin/env node
/**
 * Prueba de ADR-0690 «El barrido del piso», actividad 5 — `previsualizar_barrido_piso`, `confirmar_barrido_piso` y
 * `cancelar_barrido_piso` (`20261122193000_barrido_piso_confirmar.sql`).
 *
 * LA CUENTA, por prenda y con unidades LIBRES (P piso, A almacén, S escaneado sin lo quitado):
 *   vuelve al almacén = max(0, P − S) · pasa al piso = min(max(0, S − P), A) · no cargada = max(0, S − P − A) (no se aplica)
 *
 * EL ESCENARIO (sede nueva «ZZ Tienda Barrido»): siete tallas de un producto nuevo y una de prueba.
 *   almacén: va 5, vb 4, vd 2, vx 2 · piso: va 1, vb 2, vc 3 (1 apartada), ve 2, vx 1, vm 2 · vf no está en la sede (Trujillo tiene 2)
 *   escaneado: va 3, vb 2, vf 1, vp 1 (de prueba), vm 2 · vx está archivada · vm se vendió DESPUÉS de abrir el barrido
 *   → va pasa 2 al piso · vc vuelve 2 (la apartada no) · ve vuelve 2 · vf es no cargada (con Trujillo 2) · vb, vd quedan · vx, vm no se tocan
 *
 * QUÉ CUBRE
 *   F1 forma: una sola versión de cada puerta; anon no; las internas, nadie de afuera; la migración sin políticas ni drop trigger, solo
 *      altera cuadres_piso y sin «select … into» en comillas.
 *   F2 la cuenta: previsualizar dice EXACTAMENTE lo que confirmar aplica; el total libre no cambia; lo apartado, lo archivado, lo de
 *      prueba y lo que se movió durante el barrido no se mueven; la no cargada trae dónde la tiene el sistema; lo quitado no cuenta.
 *   F3 confirmar: una fila traslado/movimiento_interno por prenda movida con la nota «Barrido del piso» y su ítem en cuadre_piso_items;
 *      el cuadre queda con lado piso, el barrido y la nota; el barrido queda confirmado con quién y cuándo; después no entra nada.
 *   F4 candados: sin «todo escaneado», barrido_falta_todo; con un conteo abierto, barrido_conteo_abierto; sin Existencias u otra sede,
 *      no; nada se escribe en ninguno.
 *   F5 idempotencia: la misma marca devuelve el mismo resultado sin mover nada; la marca de otro barrido, barrido_token_reusado.
 *   F6 cancelar: no mueve nada, el barrido queda cancelado y ya no se confirma; se puede abrir otro.
 *   F7 los relojes (actividad 6, `20261122194000_barrido_piso_relojes.sql`): el primer cuadre de la sede reinicia aunque sea un barrido;
 *      el segundo barrido no; un cuadre del almacén sí; y siempre por sede.
 *   R  «Por resolver» (actividad 8, `20261122195000_barrido_piso_por_resolver.sql`): la lista sale solo de barridos confirmados; «encontrada»
 *      entra por las funciones de siempre (stock inicial al piso con la carga abierta; «Encontré prendas» + bajada con la carga cerrada) y
 *      se rechaza si viene en camino; «colgada» baja del almacén y frena sin stock; «no_era» no mueve nada; se resuelve por partes sin
 *      pasarse; la marca no repite; los candados de módulo, sede y estado; lo resuelto no se edita ni se borra.
 *   C  las correcciones de la revisión adversarial (`20261122194500_barrido_piso_correcciones.sql`): la apartada colgada y escaneada no
 *      se mueve; en una sede con dos dueños, la línea cuya fila de origen mezcla dueños no se mueve (dos_duenos) y el resto sí; un barrido
 *      sin lecturas no se confirma (barrido_vacio); si alguien escaneó mientras se revisaba, confirmar rechaza (barrido_cambio) sin mover
 *      nada; la no cargada dice lo que la sede tiene en cuarentena; lo del barrido es historia al eliminar; la fusión frena.
 *
 * CÓMO. Igual que `barrido_piso.mjs`: cada caso en ROLLBACK, sesión simulada, sede nueva.
 *
 * USO
 *   pnpm pruebas:barrido-piso-confirmar    → con las migraciones ya aplicadas en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const leerMigracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
const MIGRACION_CONFIRMAR = "20261122193000_barrido_piso_confirmar.sql";
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_ALMACEN = "33333333-3333-4333-8333-0000000000c5"; // cuenta de una terminal administrativa (esta prueba)
const ROSA = "33333333-3333-4333-8333-0000000000e5"; // integrante sin cuenta, marcó entrada: la responsable

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

const PRELUDIO = `
begin;
create function pg_temp.r(p_sql text) returns jsonb language plpgsql as $f$
declare v jsonb; v_estado text; v_msg text; v_hint text;
begin
  execute p_sql into v;
  return jsonb_build_object('ok', true, 'res', v);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
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
-- La sede de la prueba: nueva, con piso y almacén, ligada a la sede de Dynamic de Trujillo (para la asistencia).
insert into retail.ubicaciones (nombre, tipo, sede_dynamic_id) values ('ZZ Tienda Barrido', 'tienda', :'sede_tru') returning id as bar \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'bar', 'Piso de venta', 'piso_venta'), (:'bar', 'Almacén de tienda', 'almacen_tienda');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
-- Tres tallas de un producto nuevo.
insert into retail.productos (referencia, marca_id, proveedor_id)
  select 'Blusa Barrido Prueba', marca_id, proveedor_id from retail.productos order by created_at limit 1 returning id as prod \\gset
select codigo as color from retail.colores order by codigo limit 1 \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prod', t.id, :'color', 'BAR-PRUEBA-' || t.n, 50
    from (select id, row_number() over (order by valor, id) as n from retail.tallas) t where t.n <= 8;
insert into retail.productos (referencia, marca_id, proveedor_id, es_prueba)
  select 'Blusa Barrido De Prueba', marca_id, proveedor_id, true from retail.productos order by created_at limit 1 returning id as prodp \\gset
insert into retail.variantes (producto_id, talla_id, color_codigo, sku, precio)
  select :'prodp', t.id, :'color', 'BAR-PRUEBA-P', 50 from retail.tallas t order by valor, id limit 1;
select id as va from retail.variantes where sku = 'BAR-PRUEBA-1' \\gset
select id as vb from retail.variantes where sku = 'BAR-PRUEBA-2' \\gset
select id as vc from retail.variantes where sku = 'BAR-PRUEBA-3' \\gset
select id as vd from retail.variantes where sku = 'BAR-PRUEBA-4' \\gset
select id as ve from retail.variantes where sku = 'BAR-PRUEBA-5' \\gset
select id as vf from retail.variantes where sku = 'BAR-PRUEBA-6' \\gset
select id as vx from retail.variantes where sku = 'BAR-PRUEBA-7' \\gset
select id as vm from retail.variantes where sku = 'BAR-PRUEBA-8' \\gset
select id as vp from retail.variantes where sku = 'BAR-PRUEBA-P' \\gset
select id as piso from retail.sububicaciones where ubicacion_id = :'bar' and tipo = 'piso_venta' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'bar' and tipo = 'almacen_tienda' \\gset
select id as tru_piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  select x.v, x.u, x.s, 'entrada', x.n, 'prueba barrido: colchón'
    from (values (:'va'::uuid, :'bar'::uuid, :'alm'::uuid, 5), (:'vb', :'bar', :'alm', 4), (:'vd', :'bar', :'alm', 2), (:'vx', :'bar', :'alm', 2),
                 (:'va', :'bar', :'piso', 1), (:'vb', :'bar', :'piso', 2), (:'vc', :'bar', :'piso', 3), (:'ve', :'bar', :'piso', 2),
                 (:'vx', :'bar', :'piso', 1), (:'vm', :'bar', :'piso', 2), (:'vp', :'bar', :'piso', 1), (:'vf', :'tru', :'tru_piso', 2)) x(v, u, s, n);
select count(*) as _colchon from (select retail.fn_aplicar_movimiento(m.id) from retail.movimientos m
  where m.motivo = 'prueba barrido: colchón' order by m.id) x \\gset
set local session_replication_role = replica;
update retail.variantes set activo = false where id = :'vx';
set local session_replication_role = origin;
select retail.apartar_stock(:'vc', :'bar', 1, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'piso', null) as _ap \\gset
\\set centinela '22222222-2222-4222-8222-222222222222'
-- La terminal del almacén de Trujillo y una integrante sin cuenta que marcó entrada.
insert into auth.users (id, aud, role, email) values ('${T_ALMACEN}', 'authenticated', 'authenticated', 'terminal-almacen-barrido@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, tipo, auth_user_id)
  values (:'tru', 'Terminal Almacén TRU (prueba barrido)', 'administrativa', '${T_ALMACEN}') returning id as t_almacen \\gset
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values ('${ROSA}', 'Rosa', 'Barrido', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca, fecha_jornada)
  values ('${ROSA}', :'sede_tru', 'entrada', now() - interval '1 second', (now() at time zone 'America/Lima')::date);
\\set rosa '${ROSA}'
select id as felipe_p from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela_p from public.personas where auth_user_id = '${MICAELA}' \\gset
`;

/** Cambia de sesión (como `postgres`). `resp`: variable psql que va en el encabezado x-responsable. */
const sesion = (auth, { resp = null } = {}) => {
  const campos = resp ? `'x-responsable', :'${resp}'` : "";
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
const MICAELA_EN_LA_SEDE = `${COMO_POSTGRES}update retail.colaboradores set ubicacion_asignada_id = :'bar' where persona_id = :'micaela_p';\n`;

const estado = (ubic = "bar") => `pg_temp.r(format('select retail.fn_barrido_piso_estado(%L)', :'${ubic}'))`;
/** Un lote de lecturas: [["va", 1], ["vb", 3]] → cada una con un id nuevo; o el jsonb ya armado. */
const lote = (...pares) =>
  `jsonb_build_array(${pares.map(([v, n = 1, id = "gen_random_uuid()"]) => `jsonb_build_object('id', ${id}, 'variante_id', :'${v}', 'cantidad', ${n})`).join(", ")})`;
const registrar = (items, barrido = ":'barrido'") => `pg_temp.r(format('select retail.registrar_lecturas_barrido(%L, %L::jsonb)', ${barrido}, ${items}))`;
/** Abre el barrido como Felipe y deja su id en :barrido. */
const ABIERTO = `${sesion(FELIPE)}${COMO_API}select (retail.abrir_barrido_piso(:'bar') -> 'estado' -> 'barrido' ->> 'id') as barrido \\gset
`;

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

const PREVIA = `pg_temp.r(format('select retail.previsualizar_barrido_piso(%L)', :'barrido'))`;
/** Confirmar con la huella de lo que muestra «Revisar» en ese instante (lo que haría la pantalla); `huella` la fija a mano. */
const CONFIRMAR = (tok = ":'tok'", todo = "true", barrido = ":'barrido'", huella = null) =>
  huella
    ? `pg_temp.r(format('select retail.confirmar_barrido_piso(%L, %L, %L, %L)', ${barrido}, ${tok}, ${todo}::boolean, ${huella}))`
    : `pg_temp.r(format('select retail.confirmar_barrido_piso(%L, %L, %L, retail.previsualizar_barrido_piso(%L) ->> %L)', ${barrido}, ${tok}, ${todo}::boolean, ${barrido}, 'huella'))`;
/** El escenario: el barrido abierto y escaneado (va 3, vb 2, vf 1, vp 1, vm 2, una lectura de va quitada) y vm vendida DESPUÉS. */
const ESCANEADO = `${ABIERTO}select gen_random_uuid() as tok \\gset
select gen_random_uuid() as lq \\gset
select ${registrar(lote(["va", 3], ["vb", 2], ["vf"], ["vp"], ["vm", 2], ["va", 1, ":'lq'"]))} as _r \\gset
select retail.anular_lecturas_barrido(:'barrido', array[:'lq']::uuid[], 'repetida') as _q \\gset
${COMO_POSTGRES}insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
  values (:'vm', :'bar', :'piso', 'salida', 1, 'prueba barrido: vendida durante', now() + interval '1 second') returning id as mov_vm \\gset
select retail.fn_aplicar_movimiento(:'mov_vm') as _vm \\gset
${sesion(FELIPE)}${COMO_API}`;
const st = (v, sub) => `coalesce((select cantidad || '/' || cantidad_apartada from retail.stock where variante_id = :'${v}' and ubicacion_id = :'bar' and sububicacion_id = :'${sub}'), '0/0')`;
const TOTAL_LIBRE = `(select coalesce(sum(cantidad - cantidad_apartada), 0) from retail.stock where ubicacion_id = :'bar' and sububicacion_id in (:'piso', :'alm'))`;
const CONTADORES = `concat_ws(',', (select count(*) from retail.movimientos), (select count(*) from retail.cuadres_piso), (select count(*) from retail.cuadre_piso_items),
  (select coalesce(sum(cantidad * 7 + cantidad_apartada), 0) from retail.stock where ubicacion_id = :'bar'), (select estado from retail.barridos_piso where id = :'barrido'))`;
const linea = (j, v) => `(select x from jsonb_array_elements((${j})::jsonb -> 'lineas') x where x ->> 'variante_id' = :'${v}')`;

// ===========================================================================
// F1 · Forma
// ===========================================================================

caso(
  "F1 · una sola versión de cada puerta; anon no y authenticated sí; las internas, nadie de afuera",
  `select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')=' || concat_ws(',', has_function_privilege('anon', p.oid, 'execute'),
                    has_function_privilege('authenticated', p.oid, 'execute'), p.prosecdef), ';' order by p.proname)
     from pg_proc p where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('previsualizar_barrido_piso', 'confirmar_barrido_piso', 'cancelar_barrido_piso', 'fn_barrido_piso_calculo', 'fn_barrido_piso_vista', 'fn_barrido_piso_respuesta');`,
  "cancelar_barrido_piso(p_barrido_id uuid)=f,t,t;confirmar_barrido_piso(p_barrido_id uuid, p_token uuid, p_todo_escaneado boolean, p_huella text)=f,t,t;fn_barrido_piso_calculo(p_barrido_id uuid)=f,f,t;fn_barrido_piso_respuesta(p_cuadre_id uuid)=f,f,t;fn_barrido_piso_vista(p_barrido_id uuid)=f,f,t;previsualizar_barrido_piso(p_barrido_id uuid)=f,t,t"
);
{
  const sin = leerMigracion(MIGRACION_CONFIRMAR).replace(/--[^\n]*/g, "");
  esperar(
    "F1 · la migración no crea políticas ni quita disparadores (ADR-0195), solo altera cuadres_piso y no trae «select … into» en comillas (ADR-0288)",
    !/\bdrop\s+trigger\b|\b(create|drop)\s+policy\b/i.test(sin) &&
      (sin.match(/\balter\s+table\s+([\w.]+)/gi) ?? []).every((a) => /retail\.cuadres_piso\b/.test(a)) &&
      [...sin.matchAll(/'(?:[^']|'')*'/g)].every((x) => !/select[\s\S]*\binto\b/i.test(x[0]))
  );
}

// ===========================================================================
// F2 · La cuenta
// ===========================================================================

caso(
  "F2 · revisar: va pasa 2, vc vuelve 2 (la apartada no), ve vuelve 2, vf no cargada (Trujillo 2), vx archivada, vm se movió; lo quitado no cuenta",
  `${ESCANEADO}select ${PREVIA} -> 'res' as p \\gset
${COMO_POSTGRES}select concat_ws(',',
  (:'p')::jsonb -> 'resumen' ->> 'prendas_al_piso', (:'p')::jsonb -> 'resumen' ->> 'prendas_al_almacen', (:'p')::jsonb -> 'resumen' ->> 'prendas_no_cargadas',
  (:'p')::jsonb -> 'resumen' ->> 'lineas_se_movieron', (:'p')::jsonb -> 'resumen' ->> 'escaneadas',
  ${linea(":'p'", "va")} ->> 'al_piso', ${linea(":'p'", "vc")} ->> 'al_almacen', ${linea(":'p'", "ve")} ->> 'al_almacen',
  ${linea(":'p'", "vf")} ->> 'no_cargadas', ${linea(":'p'", "vf")} -> 'otras_sedes' -> 0 ->> 'cantidad',
  ${linea(":'p'", "vx")} ->> 'motivo', ${linea(":'p'", "vm")} ->> 'motivo', ${linea(":'p'", "vp")} ->> 'motivo', ${linea(":'p'", "vb")} is null, ${linea(":'p'", "vd")} is null,
  ((:'p')::jsonb -> 'resumen' -> 'antes' ->> 'piso')::int + ((:'p')::jsonb -> 'resumen' -> 'antes' ->> 'almacen')::int
    = ((:'p')::jsonb -> 'resumen' -> 'despues' ->> 'piso')::int + ((:'p')::jsonb -> 'resumen' -> 'despues' ->> 'almacen')::int);`,
  "2,4,1,1,9,2,2,2,1,2,archivada,se_movio,no_es_inventario,t,t,t"
);

// ===========================================================================
// F3 · Confirmar
// ===========================================================================

caso(
  "F3 · confirmar aplica EXACTAMENTE lo revisado: stock, una fila del libro por prenda movida, sus ítems, el total igual y el cuadre de lado piso",
  `${ESCANEADO}${COMO_POSTGRES}select ${TOTAL_LIBRE} as antes \\gset
select (select count(*) from retail.movimientos) as movs \\gset
${sesion(FELIPE)}${COMO_API}select ${PREVIA} -> 'res' -> 'resumen' as previo \\gset
select ${CONFIRMAR()} -> 'res' as c \\gset
${COMO_POSTGRES}select concat_ws(',', ${st("va", "piso")}, ${st("va", "alm")}, ${st("vc", "piso")}, ${st("vc", "alm")}, ${st("ve", "piso")}, ${st("ve", "alm")},
  ${st("vx", "piso")}, ${st("vm", "piso")}, ${st("vb", "piso")}, ${TOTAL_LIBRE} = :'antes'::int,
  (select count(*) from retail.movimientos) - :'movs'::int,
  (select count(*) from retail.movimientos m join retail.cuadre_piso_items i on i.movimiento_id = m.id
    where i.cuadre_id = ((:'c')::jsonb ->> 'cuadre_id')::uuid and m.tipo = 'traslado' and m.motivo = 'movimiento_interno' and m.nota = 'Barrido del piso'),
  (select string_agg(sentido || ':' || cantidad, ' ' order by sentido, cantidad) from retail.cuadre_piso_items where cuadre_id = ((:'c')::jsonb ->> 'cuadre_id')::uuid),
  (:'c')::jsonb -> 'resumen' = (:'previo')::jsonb,
  (select lado || ':' || (barrido_id = :'barrido') || ':' || nota || ':' || (persona_id = :'felipe_p') from retail.cuadres_piso where id = ((:'c')::jsonb ->> 'cuadre_id')::uuid),
  (select estado || ':' || (cerrado_por = :'felipe_p') from retail.barridos_piso where id = :'barrido'),
  jsonb_array_length((:'c')::jsonb -> 'no_cargado'));`,
  "3/0,3/0,1/1,2/0,0/0,2/0,1/0,1/0,2/0,t,3,3,al_almacen:2 al_almacen:2 al_piso:2,t,piso:true:Barrido del piso:true,confirmado:true,1"
);
caso(
  "F3 · confirmado el barrido, ya no entra una lectura ni se quita nada (barrido_cerrado); abrir de nuevo crea otro",
  `${ESCANEADO}select ${CONFIRMAR()} as _c \\gset
select ${registrar(lote(["va"]))};
select pg_temp.r(format('select retail.anular_lecturas_barrido(%L, array[%L]::uuid[], %L)', :'barrido', :'lq', 'repetida'));
select (pg_temp.r(format('select retail.abrir_barrido_piso(%L)', :'bar'))) -> 'res' ->> 'nuevo';`,
  (l) => error(l.at(-3), "barrido_cerrado") && error(l.at(-2), "barrido_cerrado") && l.at(-1) === "true"
);

// ===========================================================================
// F4 · Candados
// ===========================================================================

caso(
  "F4 · sin «se escaneó todo lo colgado» → barrido_falta_todo y nada se escribe",
  `${ESCANEADO}${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${CONFIRMAR(":'tok'", "false")};
select ${CONFIRMAR(":'tok'", "null")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-3), "barrido_falta_todo") && error(l.at(-2), "barrido_falta_todo") && l.at(-1) === "t"
);
caso(
  "F4 · con un conteo abierto en la sede → barrido_conteo_abierto y nada se escribe",
  `${ESCANEADO}select retail.abrir_conteo(:'bar', :'piso', 'todo', null) as _conteo \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${CONFIRMAR()};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "barrido_conteo_abierto") && l.at(-1) === "t"
);
caso(
  "F4 · sin Existencias → barrido_sin_modulo; en otra sede → barrido_sin_tienda; nada se escribe",
  `${ESCANEADO}${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${soloModulos("integrante", ["vender"])}${MICAELA_EN_LA_SEDE}${sesion(MICAELA)}${COMO_API}select ${CONFIRMAR(":'tok'", "true", ":'barrido'", "'x'")};
${soloModulos("integrante", ["existencias"])}${COMO_POSTGRES}update retail.colaboradores set ubicacion_asignada_id = :'tru' where persona_id = :'micaela_p';
${sesion(MICAELA)}${COMO_API}select ${CONFIRMAR(":'tok'", "true", ":'barrido'", "'x'")};
select ${PREVIA};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-4), "barrido_sin_modulo", "42501") && error(l.at(-3), "barrido_sin_tienda", "42501") && error(l.at(-2), "barrido_sin_permiso", "42501") && l.at(-1) === "t"
);

// ===========================================================================
// F5 · Idempotencia
// ===========================================================================

caso(
  "F5 · la misma marca otra vez devuelve el mismo resultado (ya_registrado) sin mover nada; con otro barrido → barrido_token_reusado",
  `${ESCANEADO}select ${CONFIRMAR()} -> 'res' as c1 \\gset
${COMO_POSTGRES}select ${CONTADORES} as despues \\gset
${sesion(FELIPE)}${COMO_API}select ${CONFIRMAR()} -> 'res' as c2 \\gset
select (retail.abrir_barrido_piso(:'bar') -> 'estado' -> 'barrido' ->> 'id') as otro \\gset
select ${CONFIRMAR(":'tok'", "true", ":'otro'")};
${COMO_POSTGRES}select concat_ws(',', (:'c2')::jsonb ->> 'ya_registrado', (:'c1')::jsonb ->> 'cuadre_id' = (:'c2')::jsonb ->> 'cuadre_id',
  ${CONTADORES} = :'despues');`,
  (l) => error(l.at(-2), "barrido_token_reusado") && l.at(-1) === "true,t,t"
);

// ===========================================================================
// F6 · Cancelar
// ===========================================================================

caso(
  "F6 · cancelar no mueve nada; el barrido queda cancelado y ya no se confirma (barrido_cerrado)",
  `${ESCANEADO}${COMO_POSTGRES}select (select count(*) from retail.movimientos) as movs \\gset
${sesion(FELIPE)}${COMO_API}select (pg_temp.r(format('select retail.cancelar_barrido_piso(%L)', :'barrido'))) -> 'res' ->> 'cancelado';
select ${CONFIRMAR()};
${COMO_POSTGRES}select concat_ws(',', (select count(*) from retail.movimientos) = :'movs'::int, (select estado from retail.barridos_piso where id = :'barrido'),
  (select count(*) from retail.barrido_piso_lecturas where barrido_id = :'barrido') > 0);`,
  (l) => l.at(-3) === "true" && error(l.at(-2), "barrido_cerrado") && l.at(-1) === "t,cancelado,t"
);

// ===========================================================================
// F7 · Los relojes (actividad 6): solo el primer cuadre de la sede reinicia
// ===========================================================================

const ULTIMO = `(select retail.fn_ultimo_cuadre_piso(:'bar'))`;
/** Deja el cuadre de este barrido «hace 3 días» (la tabla es inmutable: solo dentro de esta transacción, sin disparadores). */
const HACE_3_DIAS = `${COMO_POSTGRES}set local session_replication_role = replica;
update retail.barridos_piso set abierto_en = abierto_en - interval '3 days', cerrado_en = cerrado_en - interval '3 days' where id = :'barrido';
update retail.cuadres_piso set created_at = created_at - interval '3 days', escaneo_desde = escaneo_desde - interval '3 days' where barrido_id = :'barrido';
set local session_replication_role = origin;
`;
const SEGUNDO_BARRIDO = `${sesion(FELIPE)}${COMO_API}select (retail.abrir_barrido_piso(:'bar') -> 'estado' -> 'barrido' ->> 'id') as barrido2 \\gset
select ${registrar(lote(["va", 3]), ":'barrido2'")} as _r2 \\gset
select ${CONFIRMAR("gen_random_uuid()", "true", ":'barrido2'")} ->> 'ok' as ok2 \\gset
`;

caso(
  "F7 · el PRIMER cuadre de la sede, aunque sea un barrido, reinicia los relojes: fn_ultimo_cuadre_piso es su fecha",
  `${ESCANEADO}${COMO_POSTGRES}select ${ULTIMO} is null as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${CONFIRMAR()} -> 'res' ->> 'cuadre_id' as cuadre \\gset
${COMO_POSTGRES}select concat_ws(',', :'antes', ${ULTIMO} = (select created_at from retail.cuadres_piso where id = :'cuadre'));`,
  "t,t"
);
caso(
  "F7 · el SEGUNDO barrido no los reinicia: la fecha sigue siendo la del primero (pero «cuándo se cuadró» sí es la del último)",
  `${ESCANEADO}select ${CONFIRMAR()} as _c \\gset
${HACE_3_DIAS}select ${ULTIMO} as primero \\gset
${SEGUNDO_BARRIDO}${COMO_POSTGRES}select concat_ws(',', :'ok2', ${ULTIMO} = :'primero'::timestamptz,
  (select count(*) from retail.cuadres_piso where ubicacion_id = :'bar'),
  (select max(created_at) from retail.cuadres_piso where ubicacion_id = :'bar') > :'primero'::timestamptz,
  (${sesion(FELIPE)}select (retail.fn_cuadre_piso_estado(:'bar') ->> 'cuadrado_en')::timestamptz) > :'primero'::timestamptz);`.replace(`(${sesion(FELIPE)}select`, "(select"),
  "true,t,2,t,t"
);
caso(
  "F7 · un cuadre del ALMACÉN (cuadrar_piso) después de un barrido SÍ reinicia, como siempre",
  `${ESCANEADO}select ${CONFIRMAR()} as _c \\gset
${HACE_3_DIAS}select ${ULTIMO} as primero \\gset
${sesion(FELIPE)}${COMO_API}select (pg_temp.r(format('select retail.cuadrar_piso(%L, %L::jsonb, now(), %L, gen_random_uuid())', :'bar', '[]', 'se rehace desde el almacén'))) ->> 'ok' as okc \\gset
${COMO_POSTGRES}select concat_ws(',', :'okc', ${ULTIMO} > :'primero'::timestamptz, (select lado from retail.cuadres_piso where ubicacion_id = :'bar' order by created_at desc limit 1));`,
  "true,t,almacen"
);
caso(
  "F7 · el barrido de OTRA sede no mueve la fecha de esta (se busca por sede)",
  `${ESCANEADO}select ${CONFIRMAR()} as _c \\gset
${COMO_POSTGRES}select concat_ws(',', ${ULTIMO} is not null, retail.fn_ultimo_cuadre_piso(:'taller') is null);`,
  "t,t"
);

// ===========================================================================
// R · «Por resolver» (actividad 8)
// ===========================================================================

const MIGRACION_RESOLVER = "20261122195000_barrido_piso_por_resolver.sql";
/** El barrido escaneado, con 2 prendas sin etiqueta apartadas, y CONFIRMADO: deja vf no cargada (1) y el apartado (2). */
const CONFIRMADO = `${ESCANEADO}select gen_random_uuid() as hall \\gset
select retail.registrar_hallazgo_barrido(:'barrido', :'hall', 'sin_etiqueta', null, 2, 'polo gris de rayas', null) as _h \\gset
select ${CONFIRMAR()} as _c \\gset
`;
const POR_RESOLVER = `pg_temp.r(format('select retail.fn_barrido_piso_por_resolver(%L)', :'bar'))`;
/** resolver(id, hallazgo|null, variante|null, como, cantidad) — ids y prendas como variables psql o expresiones SQL. */
const RESOLVER = (id, hallazgo, variante, como, cantidad, barrido = ":'barrido'") =>
  `pg_temp.r(format('select retail.resolver_pendiente_barrido(%L, %L, %L, %L, %L, %L, %L)', ${id}, ${barrido}, ${hallazgo}, ${variante}, '${como}', ${cantidad}, 'se revisó'))`;
const NO_CARGADA = (j, v = "vf") => `(select x from jsonb_array_elements((${j})::jsonb -> 'no_cargadas') x where x ->> 'variante_id' = :'${v}')`;
const CUENTA_R = `concat_ws(',', (select count(*) from retail.movimientos), (select count(*) from retail.barrido_piso_resueltos),
  (select coalesce(sum(cantidad * 7 + cantidad_apartada), 0) from retail.stock where ubicacion_id = :'bar'))`;
const CARGA_CERRADA = `${COMO_POSTGRES}update retail.ubicaciones set carga_inicial_hasta = retail.fn_hoy_lima() - 1 where id = :'bar';
${sesion(FELIPE)}${COMO_API}`;

caso(
  "R · forma: las dos puertas para authenticated (no anon); la tabla con RLS y sin políticas; la migración sin políticas, sin drop trigger, sin alter table y sin «select … into» en comillas",
  `select string_agg(p.proname || '=' || concat_ws(',', has_function_privilege('anon', p.oid, 'execute'),
                    has_function_privilege('authenticated', p.oid, 'execute'), p.prosecdef), ';' order by p.proname)
     || '|' || (select relrowsecurity::text from pg_class where oid = 'retail.barrido_piso_resueltos'::regclass)
     || '|' || (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'barrido_piso_resueltos')
     || '|' || has_table_privilege('authenticated', 'retail.barrido_piso_resueltos', 'select')
     from pg_proc p where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('fn_barrido_piso_por_resolver', 'resolver_pendiente_barrido');`,
  "fn_barrido_piso_por_resolver=f,t,t;resolver_pendiente_barrido=f,t,t|true|0|false"
);
{
  const sin = leerMigracion(MIGRACION_RESOLVER).replace(/--[^\n]*/g, "");
  esperar(
    "R · la migración no crea políticas, no quita disparadores, no altera tablas en uso (solo la suya) y no trae «select … into» en comillas",
    !/\bdrop\s+trigger\b|\b(create|drop)\s+policy\b/i.test(sin) &&
      (sin.match(/\balter\s+table\s+([\w.]+)/gi) ?? []).every((a) => /retail\.barrido_piso_resueltos\b/.test(a)) &&
      [...sin.matchAll(/'(?:[^']|'')*'/g)].every((x) => !/select[\s\S]*\binto\b/i.test(x[0]))
  );
}
caso(
  "R · la lista: vf no cargada (1, Trujillo tiene 2, nada en camino) y el apartado (2, con su nota); un barrido abierto o descartado no deja nada",
  `${CONFIRMADO}select (retail.abrir_barrido_piso(:'bar') -> 'estado' -> 'barrido' ->> 'id') as abierto \\gset
select retail.registrar_hallazgo_barrido(:'abierto', gen_random_uuid(), 'sin_etiqueta', null, 1, 'otro', null) as _h2 \\gset
select ${POR_RESOLVER} -> 'res' as l \\gset
${COMO_POSTGRES}select concat_ws(',', jsonb_array_length((:'l')::jsonb -> 'no_cargadas'), ${NO_CARGADA(":'l'")} ->> 'pendientes',
  ${NO_CARGADA(":'l'")} -> 'otras_sedes' -> 0 ->> 'cantidad', ${NO_CARGADA(":'l'")} ->> 'en_camino',
  jsonb_array_length((:'l')::jsonb -> 'apartados'), (:'l')::jsonb -> 'apartados' -> 0 ->> 'pendientes', (:'l')::jsonb -> 'apartados' -> 0 ->> 'nota');`,
  "1,1,2,0,1,2,polo gris de rayas"
);
caso(
  "R · «encontrada» con la carga ABIERTA y sin historia: stock inicial directo al piso; sale de la lista y queda con quién",
  `${CONFIRMADO}select gen_random_uuid() as rid \\gset
select ${RESOLVER(":'rid'", "null", ":'vf'", "encontrada", 1)} -> 'res' as l \\gset
${COMO_POSTGRES}select concat_ws(',', ${st("vf", "piso")}, ${st("vf", "alm")}, ${NO_CARGADA(":'l'")} is null, (:'l')::jsonb ->> 'ya_registrado',
  (select como || ':' || cantidad || ':' || (persona_id = :'felipe_p') || ':' || (variante_id = :'vf') from retail.barrido_piso_resueltos where id = :'rid'));`,
  "1/0,0/0,t,false,encontrada:1:true:true"
);
caso(
  "R · «encontrada» con la carga CERRADA: «Encontré prendas» al almacén con su nota y bajada al piso, en una sola operación",
  `${CONFIRMADO}${CARGA_CERRADA}select ${RESOLVER("gen_random_uuid()", "null", ":'vf'", "encontrada", 1)} ->> 'ok' as ok \\gset
${COMO_POSTGRES}select concat_ws(',', :'ok', ${st("vf", "piso")}, ${st("vf", "alm")},
  (select string_agg(m.tipo || ':' || m.motivo || ':' || m.cantidad || ':' || (m.nota like 'Barrido del piso%'), ' ' order by m.created_at, m.tipo)
     from retail.movimientos m where m.variante_id = :'vf' and m.ubicacion_id = :'bar'));`,
  "true,1/0,0/0,ajuste:reposicion:1:true traslado:movimiento_interno:1:true"
);
caso(
  "R · «encontrada» la hace quien ve Existencias en la sede (como «Encontré prendas», ADR-0306), firmada por quien la hizo",
  `${CONFIRMADO}${COMO_POSTGRES}update retail.ubicaciones set carga_inicial_hasta = retail.fn_hoy_lima() - 1 where id = :'bar';
${soloModulos("integrante", ["existencias"])}${MICAELA_EN_LA_SEDE}${sesion(MICAELA)}${COMO_API}select gen_random_uuid() as rid \\gset
select ${RESOLVER(":'rid'", "null", ":'vf'", "encontrada", 1)} ->> 'ok';
${COMO_POSTGRES}select concat_ws(',', ${st("vf", "piso")}, (select persona_id = :'micaela_p' from retail.barrido_piso_resueltos where id = :'rid'));`,
  (l) => l.at(-2) === "true" && l.at(-1) === "1/0,t"
);
caso(
  "R · «encontrada» de una prenda que viene en un traslado hacia la sede → barrido_en_camino; la lista dice cuántas vienen",
  `${CONFIRMADO}${COMO_POSTGRES}set local session_replication_role = replica;
insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado) values (:'tru', :'bar', 'en_transito') returning id as tr \\gset
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'tr', :'vf', 1);
set local session_replication_role = origin;
select ${CUENTA_R} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${RESOLVER("gen_random_uuid()", "null", ":'vf'", "encontrada", 1)};
select ${NO_CARGADA(`${POR_RESOLVER} -> 'res'`)} ->> 'en_camino';
${COMO_POSTGRES}select ${CUENTA_R} = :'antes';`,
  (l) => error(l.at(-3), "barrido_en_camino") && l.at(-2) === "1" && l.at(-1) === "t"
);
caso(
  "R · «colgada»: el apartado era vd (en el almacén): baja 1 al piso; sin stock en el almacén (vf) → barrido_sin_almacen; pasarse → barrido_ya_resuelto",
  `${CONFIRMADO}select ${RESOLVER("gen_random_uuid()", ":'hall'", ":'vd'", "colgada", 1)} -> 'res' as l \\gset
select ${RESOLVER("gen_random_uuid()", "null", ":'vf'", "colgada", 1)};
select ${RESOLVER("gen_random_uuid()", ":'hall'", ":'vd'", "colgada", 2)};
${COMO_POSTGRES}select concat_ws(',', ${st("vd", "piso")}, ${st("vd", "alm")}, (:'l')::jsonb -> 'apartados' -> 0 ->> 'pendientes');`,
  (l) => error(l.at(-3), "barrido_sin_almacen") && error(l.at(-2), "barrido_ya_resuelto") && l.at(-1) === "1/0,1/0,1"
);
caso(
  "R · «no_era» no mueve nada y cierra lo que falta; el apartado sale de la lista",
  `${CONFIRMADO}${COMO_POSTGRES}select (select count(*) from retail.movimientos) as movs \\gset
${sesion(FELIPE)}${COMO_API}select ${RESOLVER("gen_random_uuid()", ":'hall'", "null", "no_era", 2)} -> 'res' as l \\gset
select ${RESOLVER("gen_random_uuid()", "null", ":'vf'", "no_era", 1)} -> 'res' as l2 \\gset
${COMO_POSTGRES}select concat_ws(',', (select count(*) from retail.movimientos) = :'movs'::int, jsonb_array_length((:'l')::jsonb -> 'apartados'),
  jsonb_array_length((:'l2')::jsonb -> 'no_cargadas'), (select count(*) from retail.barrido_piso_resueltos where barrido_id = :'barrido' and variante_id is null));`,
  "t,0,0,1"
);
caso(
  "R · la misma marca otra vez → ya_registrado sin mover nada; la misma marca con otra cantidad → barrido_token_reusado",
  `${CONFIRMADO}select gen_random_uuid() as rid \\gset
select ${RESOLVER(":'rid'", ":'hall'", ":'vd'", "colgada", 1)} as _1 \\gset
${COMO_POSTGRES}select ${CUENTA_R} as despues \\gset
${sesion(FELIPE)}${COMO_API}select ${RESOLVER(":'rid'", ":'hall'", ":'vd'", "colgada", 1)} -> 'res' ->> 'ya_registrado';
select ${RESOLVER(":'rid'", ":'hall'", ":'vd'", "colgada", 2)};
${COMO_POSTGRES}select ${CUENTA_R} = :'despues';`,
  (l) => l.at(-3) === "true" && error(l.at(-2), "barrido_token_reusado") && l.at(-1) === "t"
);
caso(
  "R · candados: sin Existencias → barrido_sin_modulo; otra sede → barrido_sin_tienda; barrido abierto → barrido_no_confirmado; apartado sin prenda → barrido_resolver_prenda",
  `${CONFIRMADO}${COMO_POSTGRES}select ${CUENTA_R} as antes \\gset
${soloModulos("integrante", ["vender"])}${MICAELA_EN_LA_SEDE}${sesion(MICAELA)}${COMO_API}select ${RESOLVER("gen_random_uuid()", ":'hall'", "null", "no_era", 1)};
${soloModulos("integrante", ["existencias"])}${COMO_POSTGRES}update retail.colaboradores set ubicacion_asignada_id = :'tru' where persona_id = :'micaela_p';
${sesion(MICAELA)}${COMO_API}select ${RESOLVER("gen_random_uuid()", ":'hall'", "null", "no_era", 1)};
${sesion(FELIPE)}${COMO_API}select (retail.abrir_barrido_piso(:'bar') -> 'estado' -> 'barrido' ->> 'id') as abierto \\gset
select ${RESOLVER("gen_random_uuid()", "null", ":'va'", "no_era", 1, ":'abierto'")};
select ${RESOLVER("gen_random_uuid()", ":'hall'", "null", "colgada", 1)};
${COMO_POSTGRES}select ${CUENTA_R} = :'antes';`,
  (l) =>
    error(l.at(-5), "barrido_sin_modulo", "42501") && error(l.at(-4), "barrido_sin_tienda", "42501") &&
    error(l.at(-3), "barrido_no_confirmado") && error(l.at(-2), "barrido_resolver_prenda") && l.at(-1) === "t"
);
caso(
  "R · lo resuelto no se edita ni se borra (barrido_inmutable), tampoco como postgres",
  `${CONFIRMADO}select ${RESOLVER("gen_random_uuid()", ":'hall'", "null", "no_era", 1)} as _r \\gset
${COMO_POSTGRES}select pg_temp.intento('update retail.barrido_piso_resueltos set cantidad = 2') ->> 'hint';
select pg_temp.intento('delete from retail.barrido_piso_resueltos') ->> 'hint';`,
  (l) => l.at(-2) === "barrido_inmutable" && l.at(-1) === "barrido_inmutable"
);

// ===========================================================================
// C · Correcciones de la revisión adversarial (20261122194500)
// ===========================================================================

caso(
  "C · una prenda APARTADA que sigue colgada y se escanea no «pasa al piso»: el stock no cambia",
  `${COMO_POSTGRES}select retail.apartar_stock(:'va', :'bar', 1, 'Ana Torres', '999111222', retail.fn_hoy_lima() + 3, null, :'piso', null) as _apva \\gset
${ABIERTO}select gen_random_uuid() as tok \\gset
select ${registrar(lote(["va", 1], ["vb", 2]))} as _r \\gset
select ${PREVIA} -> 'res' as p \\gset
select ${CONFIRMAR()} ->> 'ok' as ok \\gset
${COMO_POSTGRES}select concat_ws(',', :'ok', ${linea(":'p'", "va")} is null, ${st("va", "piso")}, ${st("va", "alm")});`,
  "true,t,1/1,5/0"
);
caso(
  "C · Lima con dos dueños: la línea cuya fila de origen mezcla CAYLA y CLAURE no se mueve (dos_duenos); las demás sí y el barrido se confirma",
  `${COMO_POSTGRES}insert into retail.empresa_sedes (empresa_id, ubicacion_id)
  select e.id, :'bar' from retail.empresas e where e.clave in ('cayla', 'claure') on conflict do nothing;
set local session_replication_role = replica;
insert into retail.stock_dueno (variante_id, ubicacion_id, sububicacion_id, empresa_id, cantidad)
  select :'vb', :'bar', :'piso', e.id, 1 from retail.empresas e where e.clave = 'claure';
set local session_replication_role = origin;
${ABIERTO}select gen_random_uuid() as tok \\gset
select ${registrar(lote(["va", 3], ["vb", 1], ["vc", 1], ["ve", 2]))} as _r \\gset
select ${PREVIA} -> 'res' as p \\gset
select ${CONFIRMAR()} ->> 'ok' as ok \\gset
${COMO_POSTGRES}select concat_ws(',', :'ok', ${linea(":'p'", "vb")} ->> 'motivo', ${linea(":'p'", "vb")} ->> 'al_almacen', (:'p')::jsonb -> 'resumen' ->> 'lineas_dos_duenos',
  ${st("vb", "piso")}, ${st("va", "piso")}, ${st("vc", "piso")});`,
  "true,dos_duenos,0,1,2/0,3/0,2/1"
);
caso(
  "C · un barrido sin ninguna lectura vigente no se confirma (barrido_vacio) y no mueve nada",
  `${ABIERTO}select gen_random_uuid() as tok \\gset
select gen_random_uuid() as lq \\gset
select ${registrar(lote(["va", 1, ":'lq'"]))} as _r \\gset
select retail.anular_lecturas_barrido(:'barrido', array[:'lq']::uuid[], 'repetida') as _q \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${CONFIRMAR()};
${COMO_POSTGRES}select ${CONTADORES} = :'antes';`,
  (l) => error(l.at(-2), "barrido_vacio") && l.at(-1) === "t"
);
caso(
  "C · alguien escanea mientras otro revisa: confirmar con la huella vieja rechaza (barrido_cambio) sin mover nada; con la nueva, confirma",
  `${ESCANEADO}select ${PREVIA} -> 'res' ->> 'huella' as vieja \\gset
select ${registrar(lote(["vd"]))} as _r2 \\gset
${COMO_POSTGRES}select ${CONTADORES} as antes \\gset
${sesion(FELIPE)}${COMO_API}select ${CONFIRMAR(":'tok'", "true", ":'barrido'", ":'vieja'")};
select ${CONFIRMAR(":'tok'", "true", ":'barrido'", "null")};
${COMO_POSTGRES}select ${CONTADORES} = :'antes' as igual \\gset
${sesion(FELIPE)}${COMO_API}select ${CONFIRMAR()} ->> 'ok';
select :'igual';`,
  (l) => error(l.at(-4), "barrido_cambio") && error(l.at(-3), "barrido_cambio") && l.at(-2) === "true" && l.at(-1) === "t"
);
caso(
  "C · una no cargada dice cuántas tiene la sede en cuarentena (no las mueve)",
  `${COMO_POSTGRES}insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'bar', 'Cuarentena', 'cuarentena') returning id as cua \\gset
set local session_replication_role = replica;
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values (:'vf', :'bar', :'cua', 1);
set local session_replication_role = origin;
${ESCANEADO}select ${PREVIA} -> 'res' as p \\gset
select ${CONFIRMAR()} as _c \\gset
select ${POR_RESOLVER} -> 'res' as l \\gset
${COMO_POSTGRES}select concat_ws(',', ${linea(":'p'", "vf")} ->> 'en_cuarentena', ${NO_CARGADA(":'l'")} ->> 'en_cuarentena',
  coalesce((select cantidad from retail.stock where variante_id = :'vf' and sububicacion_id = :'cua'), 0));`,
  "1,1,1"
);
caso(
  "C · lo escaneado y lo resuelto de un barrido es historia: «Eliminar producto» lo nombra y no lo deja borrar",
  `${CONFIRMADO}select ${RESOLVER("gen_random_uuid()", "null", ":'vf'", "no_era", 1)} as _r \\gset
${COMO_POSTGRES}select string_agg(orden || ':' || concepto || ':' || borrable, ' ' order by orden)
  from retail.fn_producto_historia(:'prod') where orden in (27, 28);`,
  "27:lecturas de un barrido del piso:false 28:prendas resueltas de un barrido del piso:false"
);
caso(
  "C · fusionar frena si la talla que se junta está en un barrido ABIERTO (junta_barrido), como un conteo abierto",
  `select position('junta_barrido' in pg_get_functiondef('retail.fn_fusion_productos_plan(uuid,uuid[],jsonb)'::regprocedure)) > 0;`,
  "t"
);

console.log(`\n${fallos === 0 ? "✓" : "✗"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
