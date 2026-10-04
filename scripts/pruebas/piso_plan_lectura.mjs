#!/usr/bin/env node
/**
 * Pruebas de la lectura del motor del piso (ADR-0328, actividad 7) — `retail.fn_piso_plan_lectura(p_ubicacion_id)`,
 * migración `20261004213000_piso_plan_lectura.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. La lectura junta, en UN jsonb, lo que el motor puro de la web (`apps/web/lib/piso-plan.ts`) necesita de una sede:
 * lo libre en piso y almacén de cada talla, lo vendido escaneado de cada prenda (hoy, ayer, 14 días) y lo vendido en 14 días por
 * categoría × talla × familia de color, contando también las ventas «sin registrar» que siguen pendientes. El error caro es
 * contar una venta dos veces —en la cola y como escaneada— o en el día en que se regularizó: Polos parecería vender el doble esa
 * semana y el Taller produciría de más (ADR-0328, decisión técnica 1, «SE ROMPE SI»).
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; una sede NUEVA por caso, así nada del seed se mezcla).
 *   F   FORMA: una sola firma, SECURITY DEFINER, STABLE, search_path fijo, devuelve jsonb; anon sin EXECUTE y authenticated con
 *       EXECUTE; las claves del contrato; `hoy` es el día de Lima y `desde` 13 días antes (14 días, hoy incluido).
 *   P   PUERTAS: la de todas las lecturas (`fn_tiene_acceso_retail()`; el PR #781 enseñó que una copia dejaba afuera a las
 *       terminales) y la de la sede (`fn_puede_operar_ubicacion`, revisión adversarial): el líder lee cualquier sede; una
 *       integrante y una terminal de ventas ACTIVA leen la suya y reciben NULL de otra; reciben NULL —nunca un jsonb vacío que
 *       diga «al día»— una terminal apagada, una cuenta de Auth sin persona y quien no tiene sesión. La puerta se evalúa UNA vez.
 *   S   STOCK: lo libre en piso y almacén y lo en camino de cada talla es EXACTAMENTE lo de `fn_existencias_base` (ADR-0270),
 *       con su categoría, talla, color y familia; lo apartado no cuenta; la talla retirada con unidades sale marcada.
 *   E   ESCANEADAS por prenda: hoy, ayer, 14 días (el día 13 entra, el 14 no) en días de LIMA (las 20:00 de ayer en Lima ya
 *       son hoy en UTC); anulada, de prueba o de otra sede no cuentan, ni un producto de prueba vendido en una venta normal.
 *   A   ANOTADAS: la «sin registrar» pendiente suma en su categoría × talla × familia y no en ninguna talla de la sede; anulada
 *       o fuera de la ventana, no.
 *   U   UNA SOLA VEZ: al regularizarla con la función real (`regularizar_prenda`), la venta pasa de «anotada» a «escaneada» en el
 *       día en que se COBRÓ (hace 5 días), no hoy: el total de la sede no cambia, `vendidas_hoy` tampoco. Y la lectura asume
 *       que `regularizar_prenda` mueve la línea de venta a la prenda real: si alguien lo cambia, el caso lo dice.
 *   C   CURVAS: las tallas de cada categoría que aparece (por stock o por ventas), y ninguna categoría de más.
 *   K   CUADRE: `cuadrado_en` es el último cuadre del piso de SU sede (actividad 3, `retail.cuadres_piso`), NULL si nunca se
 *       cuadró o la base todavía no guarda cuadres; y es la misma fecha que `fn_cuadre_piso_estado` cuando las dos existen.
 *   T   TALLER: sin piso ni almacén → `separa_piso` falso. Sede nula → error 22004.
 *   V   TALLAS DE LA BASE = la lista que recorre `apps/web/lib/piso-plan.test.ts` (TALLAS_DE_LA_BASE): si una migración o el seed
 *       agregan una talla, esta prueba pide sumarla allí, y así la regla de talla central la clasifica antes de que llegue a
 *       una tienda.
 *   M   LA MIGRACIÓN: se puede pegar dos veces; su guarda se detiene si la puerta todavía no conoce a las terminales; y la
 *       huella (md5) que su cabecera manda verificar en producción es la del cuerpo.
 *   N   NÚMEROS: ~800 unidades y ~150 ventas en una sede; se mide la lectura (mediana de 7) y `fn_existencias_base` se llama
 *       UNA sola vez por lectura (la CTE materializada; memoria «CTE con función cara»).
 *
 * USO
 *   pnpm pruebas:piso-plan                 → contra la base `postgres` del stack local
 *   pnpm pruebas:piso-plan --base otra     → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const leerMigracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8");
const MIGRACION = leerMigracion("20261004213000_piso_plan_lectura.sql");
// La puerta ANTES de que ADR-0289 le enseñara la terminal (20260922170000): para probar la guarda.
const PUERTA_SIN_TERMINAL = leerMigracion("20260922170000_alta_colaborador_requiere_aprobacion.sql").match(
  /create or replace function retail\.fn_tiene_acceso_retail\(\)[\s\S]*?\$\$;/
)?.[0];
if (!PUERTA_SIN_TERMINAL) throw new Error("No encontré fn_tiene_acceso_retail() en 20260922170000.");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const T_VENTAS = "33333333-3333-4333-8333-0000000007a1";
const T_APAGADA = "33333333-3333-4333-8333-0000000007a2";
const AFUERA = "33333333-3333-4333-8333-0000000007d1"; // cuenta de Auth sin persona ni terminal
const CENTINELA = "22222222-2222-4222-8222-222222222222"; // «Prenda sin registrar» (ADR-0179)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/**
 * Todo caso empieza igual: una sede NUEVA («Sede PP», tienda con piso y almacén), una categoría con tallas S/M/L/XL, dos colores
 * de familias distintas, Felipe en sesión, y las piezas para armar stock y ventas con hora fijada. Nada del seed entra en las
 * cifras: la sede no tiene historia.
 */
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
-- fn_actor_persona_id (regularizar_prenda) consulta la asistencia de Dynamic: en un Postgres sin Dynamic esas tablas no existen.
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);

create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;

insert into retail.ubicaciones (nombre, tipo, activo) values ('Sede PP', 'tienda', true), ('Sede PP Lejos', 'tienda', true);
select id as sede from retail.ubicaciones where nombre = 'Sede PP' \\gset
select id as otra from retail.ubicaciones where nombre = 'Sede PP Lejos' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values
  (:'sede', 'Piso de venta', 'piso_venta'), (:'sede', 'Almacén de tienda', 'almacen_tienda'), (:'sede', 'Cuarentena', 'cuarentena'),
  (:'otra', 'Piso de venta', 'piso_venta'), (:'otra', 'Almacén de tienda', 'almacen_tienda');
select id as taller from retail.ubicaciones where tipo = 'taller' order by nombre limit 1 \\gset

-- Una categoría propia con su curva S · M · L · XL, y otra sin stock que solo aparece por una venta anotada.
insert into retail.categorias (nombre, familia) values ('PP Polos', 'indumentaria'), ('PP Faldas', 'indumentaria');
select id as cat from retail.categorias where nombre = 'PP Polos' \\gset
select id as cat2 from retail.categorias where nombre = 'PP Faldas' \\gset
insert into retail.categoria_tallas (categoria_id, talla_id)
  select :'cat', t.id from retail.tallas t where t.valor in ('S', 'M', 'L', 'XL');
insert into retail.categoria_tallas (categoria_id, talla_id)
  select :'cat2', t.id from retail.tallas t where t.valor in ('S', 'M');
select id as t_m from retail.tallas where valor = 'M' \\gset
select id as t_s from retail.tallas where valor = 'S' \\gset
-- Dos colores de familias distintas (el seed trae Negro neutro y Rosado).
select codigo as neutro from retail.colores where familia_color = 'neutro' order by codigo limit 1 \\gset
select codigo as otro_color from retail.colores where familia_color = 'rosado' order by codigo limit 1 \\gset

-- psql no sustituye variables dentro de cuerpos entre $$: la sede y sus lugares viajan como parámetros de sesión.
select set_config('pp.sede', :'sede', true) as _1,
       set_config('pp.piso', (select id::text from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'piso_venta'), true) as _2,
       set_config('pp.almacen', (select id::text from retail.sububicaciones where ubicacion_id = :'sede' and tipo = 'almacen_tienda'), true) as _3 \\gset

-- Una prenda nueva (su propio producto, en la categoría y con talla y color).
create function pg_temp.prenda(p_sku text, p_cat uuid, p_talla text, p_color text) returns uuid language plpgsql as $$
declare p uuid; v uuid;
begin
  insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
    select 'ZZ PP ' || p_sku, p_cat, mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id into p;
  insert into retail.variantes (producto_id, sku, precio, costo, talla_id, color_codigo)
    values (p, p_sku, 100, 40, (select id from retail.tallas where valor = p_talla), p_color)
    returning id into v;
  return v;
end $$;
-- Stock por el libro (entradas aplicadas): lo que el sistema cree que hay colgado y guardado en la Sede PP.
create function pg_temp.stock(v uuid, p_piso int, p_almacen int, p_sede uuid default null) returns void language plpgsql as $$
declare m uuid; u uuid := coalesce(p_sede, current_setting('pp.sede')::uuid);
begin
  if p_piso > 0 then
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
      values (v, u, (select id from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta'), 'entrada', p_piso, 'prueba') returning id into m;
    perform retail.fn_aplicar_movimiento(m);
  end if;
  if p_almacen > 0 then
    insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
      values (v, u, (select id from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda'), 'entrada', p_almacen, 'prueba') returning id into m;
    perform retail.fn_aplicar_movimiento(m);
  end if;
end $$;
-- Las 12:00 de Lima de hace k días (0 = hoy).
create function pg_temp.dia(k int) returns timestamptz language sql stable as $$
  select ((retail.fn_hoy_lima() - k) + time '12:00') at time zone 'America/Lima'
$$;
-- Una venta escaneada de una línea, con su hora; devuelve la línea. No mueve stock (la lectura no lo necesita).
create function pg_temp.vende(v uuid, n int, cuando timestamptz, p_estado text default 'completada', p_sede uuid default null,
                              p_prueba boolean default false) returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := coalesce(p_sede, current_setting('pp.sede')::uuid);
begin
  if p_estado = 'anulada' then
    insert into retail.ventas (ubicacion_id, estado, anulado_en, motivo_anulacion, created_at, es_prueba)
      values (u, 'anulada', cuando + interval '1 hour', 'prueba', cuando, p_prueba) returning id into vt;
  else
    insert into retail.ventas (ubicacion_id, estado, created_at, es_prueba) values (u, 'completada', cuando, p_prueba) returning id into vt;
  end if;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario) values (vt, v, n, 100, 40) returning id into li;
  return li;
end $$;
-- Una venta «sin registrar» como la deja registrar_venta (ADR-0179): la línea de la centinela y su fila pendiente en la cola.
create function pg_temp.anota(p_cat uuid, p_talla uuid, p_color text, cuando timestamptz) returns uuid language plpgsql as $$
declare vt uuid; li uuid; u uuid := current_setting('pp.sede')::uuid;
begin
  insert into retail.ventas (ubicacion_id, estado, created_at) values (u, 'completada', cuando) returning id into vt;
  insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, costo_unitario)
    values (vt, '${CENTINELA}', 1, 60, 0) returning id into li;
  insert into retail.prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id, color_codigo, precio_cobrado, vendido_en)
    values (li, u, 'Polo anotado a mano', p_cat, p_talla, p_color, 60, cuando);
  return li;
end $$;

-- La lectura, y sus pedazos.
create function pg_temp.lee(u uuid) returns jsonb language sql as $$ select retail.fn_piso_plan_lectura(u) $$;
create function pg_temp.talla(u uuid, v uuid) returns jsonb language sql as $$
  select t from jsonb_array_elements(retail.fn_piso_plan_lectura(u) -> 'tallas') t where t ->> 'variante_id' = v::text
$$;
create function pg_temp.atributo(u uuid, p_cat uuid, p_talla text, p_familia text) returns text language sql as $$
  select coalesce((select (x ->> 'escaneadas') || ',' || (x ->> 'anotadas')
                     from jsonb_array_elements(retail.fn_piso_plan_lectura(u) -> 'ventas') x
                    where x ->> 'categoria_id' = p_cat::text and x ->> 'talla' = p_talla
                      and x ->> 'familia_color' is not distinct from p_familia), 'nada')
$$;
create function pg_temp.total_ventas(u uuid) returns int language sql as $$
  select coalesce(sum((x ->> 'escaneadas')::int + (x ->> 'anotadas')::int), 0)::int
    from jsonb_array_elements(retail.fn_piso_plan_lectura(u) -> 'ventas') x
$$;

set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
`;

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const SIN_SESION = `set local request.jwt.claim.sub = '';\nset local request.jwt.claims = '{}';\n`;

let fallas = 0;
let casos = 0;
function registrar(nombre, obtenido, esperado) {
  casos++;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  registrar(nombre, obtenido, esperado);
  return obtenido;
}

const OID = `'retail.fn_piso_plan_lectura(uuid)'::regprocedure`;

// ===========================================================================
// F. FORMA
// ===========================================================================

caso(
  "F1 una sola firma, SECURITY DEFINER, STABLE, con search_path fijo y devuelve jsonb",
  `select concat_ws(',', (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_piso_plan_lectura'),
     (select prosecdef from pg_proc where oid = ${OID}),
     (select provolatile = 's' from pg_proc where oid = ${OID}),
     (select coalesce(array_to_string(proconfig, ';') like '%search_path=retail, public, extensions%', false) from pg_proc where oid = ${OID}),
     (select pg_get_function_result(oid) from pg_proc where oid = ${OID}));`,
  "1,t,t,t,jsonb"
);
caso(
  "F2 anon sin EXECUTE, authenticated con EXECUTE, y un comentario que dice qué es",
  `select concat_ws(',', has_function_privilege('anon', ${OID}, 'execute'), has_function_privilege('authenticated', ${OID}, 'execute'),
     coalesce(obj_description(${OID}, 'pg_proc'), '') like 'ADR-0328 act. 7%');`,
  "f,t,t"
);
caso(
  "F3 las claves del contrato; hoy = día de Lima, desde = hoy − 13 (14 días, hoy incluido), separa_piso y tipo de la sede",
  `select concat_ws(',',
     (select string_agg(k, ';' order by k) from jsonb_object_keys(pg_temp.lee(:'sede')) k),
     (pg_temp.lee(:'sede') ->> 'hoy')::date = retail.fn_hoy_lima(),
     (pg_temp.lee(:'sede') ->> 'desde')::date = retail.fn_hoy_lima() - 13,
     pg_temp.lee(:'sede') ->> 'dias', pg_temp.lee(:'sede') ->> 'separa_piso', pg_temp.lee(:'sede') ->> 'ubicacion_tipo');`,
  "cuadrado_en;curvas;desde;dias;hoy;separa_piso;tallas;ubicacion_id;ubicacion_tipo;ventas,t,t,14,true,tienda"
);
caso(
  "F4 una sede sin historia: tallas, ventas y curvas son listas vacías (no NULL: NULL es «no se pudo leer»)",
  `select concat_ws(',', pg_temp.lee(:'sede') -> 'tallas', pg_temp.lee(:'sede') -> 'ventas', pg_temp.lee(:'sede') -> 'curvas');`,
  "[],[],[]"
);
caso(
  "F5 cada talla trae las claves que el motor lee (y ninguna cifra en soles)",
  `select pg_temp.prenda('PP-F5', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 2);
   select string_agg(k, ';' order by k) from jsonb_object_keys(pg_temp.talla(:'sede', :'v')) k;`,
  "almacen_libre;categoria_id;color;color_codigo;en_camino;familia_color;foto_url;piso_libre;producto_id;referencia;retirada;talla;talla_id;variante_id;vendidas_14;vendidas_ayer;vendidas_hoy"
);

// ===========================================================================
// P. PUERTA
// ===========================================================================

const CON_TERMINALES = `
insert into auth.users (id, aud, role, email) values
  ('${T_VENTAS}', 'authenticated', 'authenticated', 'pp-t-ventas@prueba.local'),
  ('${T_APAGADA}', 'authenticated', 'authenticated', 'pp-t-apagada@prueba.local'),
  ('${AFUERA}', 'authenticated', 'authenticated', 'pp-afuera@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id) values
  (:'sede', 'Terminal Ventas PP', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS}'),
  (:'sede', 'Terminal Apagada PP', retail.fn_rol_por_clave('terminal_ventas'), '${T_APAGADA}');
update retail.terminales set activo = false, desactivada_at = now() where auth_user_id = '${T_APAGADA}';
`;
const LEE_ALGO = `select (pg_temp.lee(:'sede') is not null)::text;`;
const TRU = `(select id from retail.ubicaciones where nombre = 'Tienda Trujillo')`;
const LEE_OTRA = `select (pg_temp.lee(:'otra') is not null)::text;`;
caso("P1 el LÍDER lee su sede y cualquier otra (comparar sedes es suyo)", `select (pg_temp.lee(:'sede') is not null and pg_temp.lee(:'otra') is not null)::text;`, "true");
caso("P2 una INTEGRANTE activa lee SU sede (Micaela, Tienda Trujillo)", como(MICAELA) + `select (pg_temp.lee(${TRU}) is not null)::text;`, "true");
caso(
  "P2b una INTEGRANTE de otra sede recibe NULL: lo vendido por prenda y por día no se salta el RLS de ventas (revisión, caso R1)",
  `select pg_temp.prenda('PP-P2b', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 1);
   select pg_temp.vende(:'v', 3, pg_temp.dia(1)) as _ \\gset
` +
    como(MICAELA) +
    `set local role authenticated;
     select concat_ws(',', (select count(*) from retail.ventas where ubicacion_id = :'sede'), retail.fn_puede_operar_ubicacion(:'sede'),
                      retail.fn_piso_plan_lectura(:'sede') is null);`,
  "0,f,t"
);
caso("P3 una TERMINAL de ventas activa lee su sede (lo que el PR #781 arregló en fn_stock_por_sede)", CON_TERMINALES + como(T_VENTAS) + LEE_ALGO, "true");
caso("P3b una TERMINAL de ventas activa recibe NULL de OTRA sede", CON_TERMINALES + como(T_VENTAS) + LEE_OTRA, "false");
caso("P4 una terminal DESACTIVADA recibe NULL", CON_TERMINALES + como(T_APAGADA) + LEE_ALGO, "false");
caso("P5 una cuenta de Auth sin persona ni terminal recibe NULL", CON_TERMINALES + como(AFUERA) + LEE_ALGO, "false");
caso("P6 sin sesión recibe NULL (nunca un jsonb vacío que diga «al día»)", SIN_SESION + LEE_ALGO, "false");
caso(
  "P7 con el rol `authenticated` (como PostgREST) la terminal de ventas lee lo mismo que el líder",
  CON_TERMINALES +
    `select pg_temp.prenda('PP-P7', :'cat', 'M', :'neutro') as v \\gset
     select pg_temp.stock(:'v', 2, 1);
     select md5(pg_temp.lee(:'sede')::text) as m_lider \\gset\n` +
    como(T_VENTAS) +
    `set local role authenticated;\nselect (md5(retail.fn_piso_plan_lectura(:'sede')::text) = :'m_lider')::text;`,
  "true"
);
caso(
  "P8 la puerta se evalúa UNA vez por lectura, no una vez por talla",
  `select pg_temp.prenda('PP-P8a', :'cat', 'M', :'neutro') as a \\gset
   select pg_temp.prenda('PP-P8b', :'cat', 'L', :'neutro') as b \\gset
   select pg_temp.stock(:'a', 1, 1); select pg_temp.stock(:'b', 1, 1);
   set local track_functions = 'all';
   select retail.fn_piso_plan_lectura(:'sede') is not null as _l \\gset
   select (select calls from pg_stat_xact_user_functions where schemaname = 'retail' and funcname = 'fn_tiene_acceso_retail');`,
  "1"
);

// ===========================================================================
// S. STOCK
// ===========================================================================

caso(
  "S1 lo libre en piso y almacén sale tal cual: piso 2, almacén 3, en camino 0; con su categoría, talla, color y familia",
  `select pg_temp.prenda('PP-S1', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 2, 3);
   select concat_ws(',', t ->> 'piso_libre', t ->> 'almacen_libre', t ->> 'en_camino', t ->> 'categoria_id' = :'cat', t ->> 'talla',
                    t ->> 'color_codigo' = :'neutro', t ->> 'familia_color', t ->> 'retirada')
     from pg_temp.talla(:'sede', :'v') t;`,
  "2,3,0,t,M,t,neutro,false"
);
caso(
  "S2 lo apartado para un cliente no está libre: 3 en el piso con 1 apartada → piso_libre 2",
  `select pg_temp.prenda('PP-S2', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 3, 0);
   update retail.stock set cantidad_apartada = 1 where variante_id = :'v' and sububicacion_id = current_setting('pp.piso')::uuid;
   select pg_temp.talla(:'sede', :'v') ->> 'piso_libre';`,
  "2"
);
caso(
  "S3 la talla retirada sale marcada: retirada sin unidades y con algo en camino hacia la sede (lo que todavía puede llegar)",
  `select pg_temp.prenda('PP-S3', :'cat', 'XL', :'neutro') as v \\gset
   update retail.variantes set activo = false where id = :'v';
   insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado) values (:'otra', :'sede', 'en_transito') returning id as tr \\gset
   insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) values (:'tr', :'v', 2);
   select concat_ws(',', t ->> 'retirada', t ->> 'en_camino', t ->> 'piso_libre') from pg_temp.talla(:'sede', :'v') t;`,
  "true,2,0"
);
caso(
  "S4 LA MISMA CIFRA: para TODA talla de Tienda Trujillo (el seed), piso, almacén y en camino son los de fn_existencias_base",
  `select count(*) as n from retail.fn_existencias_base((select id from retail.ubicaciones where nombre = 'Tienda Trujillo'), null) \\gset
   select concat_ws(',', :n > 0, (
     select count(*) = 0 from (
       select e.variante_id::text, e.piso_libre, e.almacen_libre, e.en_camino
         from retail.fn_existencias_base((select id from retail.ubicaciones where nombre = 'Tienda Trujillo'), null) e
       except
       select t ->> 'variante_id', (t ->> 'piso_libre')::int, (t ->> 'almacen_libre')::int, (t ->> 'en_camino')::int
         from jsonb_array_elements(pg_temp.lee((select id from retail.ubicaciones where nombre = 'Tienda Trujillo')) -> 'tallas') t
     ) faltan),
     (select jsonb_array_length(pg_temp.lee((select id from retail.ubicaciones where nombre = 'Tienda Trujillo')) -> 'tallas')) = :n);`,
  "t,t,t"
);

// ===========================================================================
// E. ESCANEADAS POR PRENDA
// ===========================================================================

caso(
  "E1 hoy 2, ayer 1, hace 13 días 1 (entra), hace 14 días 1 (no entra) → hoy 2, ayer 1, 14 días 4",
  `select pg_temp.prenda('PP-E1', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 1);
   select pg_temp.vende(:'v', 2, pg_temp.dia(0)) as _ \\gset
   select pg_temp.vende(:'v', 1, pg_temp.dia(1)) as _ \\gset
   select pg_temp.vende(:'v', 1, pg_temp.dia(13)) as _ \\gset
   select pg_temp.vende(:'v', 1, pg_temp.dia(14)) as _ \\gset
   select concat_ws(',', t ->> 'vendidas_hoy', t ->> 'vendidas_ayer', t ->> 'vendidas_14') from pg_temp.talla(:'sede', :'v') t;`,
  "2,1,4"
);
caso(
  "E2 el borde de la ventana es la medianoche de LIMA: 00:00:01 del día 13 entra, 23:59:59 del día 14 no",
  `select pg_temp.prenda('PP-E2', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 1);
   select pg_temp.vende(:'v', 1, ((retail.fn_hoy_lima() - 13) + time '00:00:01') at time zone 'America/Lima') as _ \\gset
   select pg_temp.vende(:'v', 5, ((retail.fn_hoy_lima() - 14) + time '23:59:59') at time zone 'America/Lima') as _ \\gset
   select pg_temp.talla(:'sede', :'v') ->> 'vendidas_14';`,
  "1"
);
caso(
  "E2b el DÍA es el de Lima, no el de UTC: una venta de ayer a las 20:00 de Lima (01:00 UTC de hoy) es de AYER (revisión, caso R2)",
  `select pg_temp.prenda('PP-E2b', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 1);
   select pg_temp.vende(:'v', 1, ((retail.fn_hoy_lima() - 1) + time '20:00') at time zone 'America/Lima') as _ \\gset
   select pg_temp.vende(:'v', 2, ((retail.fn_hoy_lima() - 1) + time '00:30') at time zone 'America/Lima') as _ \\gset
   select concat_ws(',', t ->> 'vendidas_hoy', t ->> 'vendidas_ayer') from pg_temp.talla(:'sede', :'v') t;`,
  "0,3"
);
caso(
  "E3b un PRODUCTO de prueba vendido (en una venta normal) no cuenta en ninguna cifra: ni en sus tallas ni en su categoría × talla × familia",
  `select pg_temp.prenda('PP-E3b', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 1);
   select pg_temp.vende(:'v', 2, pg_temp.dia(1)) as _ \\gset
   update retail.productos set es_prueba = true where id = (select producto_id from retail.variantes where id = :'v');
   select concat_ws(',', coalesce(pg_temp.talla(:'sede', :'v')::text, 'sin fila'), pg_temp.atributo(:'sede', :'cat', 'M', 'neutro'),
                    pg_temp.total_ventas(:'sede'));`,
  "sin fila,nada,0"
);
caso(
  "E3 una venta anulada, una de prueba y una de OTRA sede no cuentan",
  `select pg_temp.prenda('PP-E3', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 1);
   select pg_temp.vende(:'v', 1, pg_temp.dia(2), 'anulada') as _ \\gset
   select pg_temp.vende(:'v', 1, pg_temp.dia(2), 'completada', null, true) as _ \\gset
   select pg_temp.vende(:'v', 1, pg_temp.dia(2), 'completada', :'otra') as _ \\gset
   select concat_ws(',', t ->> 'vendidas_14', pg_temp.atributo(:'sede', :'cat', 'M', 'neutro')) from pg_temp.talla(:'sede', :'v') t;`,
  "0,nada"
);
caso(
  "E4 lo escaneado también suma en su categoría × talla × familia (dos colores neutros de dos modelos se juntan)",
  `select pg_temp.prenda('PP-E4a', :'cat', 'M', :'neutro') as a \\gset
   select pg_temp.prenda('PP-E4b', :'cat', 'M', :'neutro') as b \\gset
   select pg_temp.prenda('PP-E4c', :'cat', 'M', :'otro_color') as c \\gset
   select pg_temp.stock(:'a', 1, 0); select pg_temp.stock(:'b', 1, 0); select pg_temp.stock(:'c', 1, 0);
   select pg_temp.vende(:'a', 2, pg_temp.dia(3)) as _ \\gset
   select pg_temp.vende(:'b', 1, pg_temp.dia(4)) as _ \\gset
   select pg_temp.vende(:'c', 1, pg_temp.dia(4)) as _ \\gset
   select concat_ws(';', pg_temp.atributo(:'sede', :'cat', 'M', 'neutro'), pg_temp.atributo(:'sede', :'cat', 'M', 'rosado'));`,
  "3,0;1,0"
);
caso(
  "E5 una prenda que ya no tiene stock pero se vendió sigue en la lista con lo vendido (su fila de stock queda en 0)",
  `select pg_temp.prenda('PP-E5', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 0);
   insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id)
     values (:'v', :'sede', current_setting('pp.piso')::uuid, 'salida', 1, 'venta', pg_temp.vende(:'v', 1, pg_temp.dia(0))) returning id as m \\gset
   select retail.fn_aplicar_movimiento(:'m');
   select concat_ws(',', t ->> 'piso_libre', t ->> 'almacen_libre', t ->> 'vendidas_hoy') from pg_temp.talla(:'sede', :'v') t;`,
  "0,0,1"
);

// ===========================================================================
// A. ANOTADAS «SIN REGISTRAR»
// ===========================================================================

caso(
  "A1 la anotada pendiente suma en su categoría × talla × familia como «anotada», y no aparece como talla de la sede",
  `select pg_temp.anota(:'cat', :'t_m', :'neutro', pg_temp.dia(2)) as _ \\gset
   select concat_ws(',', pg_temp.atributo(:'sede', :'cat', 'M', 'neutro'),
     (select count(*) from jsonb_array_elements(pg_temp.lee(:'sede') -> 'tallas') t where t ->> 'variante_id' = '${CENTINELA}'));`,
  "0,1,0"
);
caso(
  "A2 escaneadas y anotadas de la misma llave van en UNA fila (2 escaneadas + 1 anotada)",
  `select pg_temp.prenda('PP-A2', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 0);
   select pg_temp.vende(:'v', 2, pg_temp.dia(1)) as _ \\gset
   select pg_temp.anota(:'cat', :'t_m', :'neutro', pg_temp.dia(1)) as _ \\gset
   select concat_ws(',', pg_temp.atributo(:'sede', :'cat', 'M', 'neutro'),
     (select count(*) from jsonb_array_elements(pg_temp.lee(:'sede') -> 'ventas') x where x ->> 'categoria_id' = :'cat'));`,
  "2,1,1"
);
caso(
  "A3 anular la venta saca la anotada de la cola y de la cuenta",
  `select pg_temp.anota(:'cat', :'t_m', :'neutro', pg_temp.dia(2)) as li \\gset
   update retail.ventas set estado = 'anulada', anulado_en = now(), motivo_anulacion = 'prueba'
     where id = (select venta_id from retail.venta_items where id = :'li');
   select concat_ws(',', (select estado from retail.prendas_por_regularizar where venta_item_id = :'li'), pg_temp.atributo(:'sede', :'cat', 'M', 'neutro'));`,
  "anulada,nada"
);
caso(
  "A4 la anotada de hace 14 días queda fuera de la ventana; la de hace 13, dentro",
  `select pg_temp.anota(:'cat', :'t_m', :'neutro', pg_temp.dia(14)) as _ \\gset
   select pg_temp.anota(:'cat', :'t_s', :'neutro', pg_temp.dia(13)) as _ \\gset
   select concat_ws(';', pg_temp.atributo(:'sede', :'cat', 'M', 'neutro'), pg_temp.atributo(:'sede', :'cat', 'S', 'neutro'));`,
  "nada;0,1"
);
caso(
  "A5 una categoría que solo aparece por una anotada trae su curva (para decidir sus tallas centrales)",
  `select pg_temp.anota(:'cat2', :'t_s', :'otro_color', pg_temp.dia(1)) as _ \\gset
   select string_agg(c ->> 'categoria' || ':' || (select string_agg(x ->> 'talla', '·' order by x ->> 'talla') from jsonb_array_elements(c -> 'tallas') x), ';')
     from jsonb_array_elements(pg_temp.lee(:'sede') -> 'curvas') c;`,
  "PP Faldas:M·S"
);

// ===========================================================================
// U. UNA SOLA VEZ (lo que ADR-0328 pide que «una prueba vigile»)
// ===========================================================================

const ANTES_DE_REGULARIZAR = `
select pg_temp.prenda('PP-U', :'cat', 'M', :'neutro') as v \\gset
select pg_temp.stock(:'v', 1, 1);
select pg_temp.vende(:'v', 1, pg_temp.dia(0)) as _ \\gset
select pg_temp.anota(:'cat', :'t_m', :'neutro', pg_temp.dia(5)) as li \\gset
select pg_temp.total_ventas(:'sede') as total_antes, pg_temp.atributo(:'sede', :'cat', 'M', 'neutro') as attr_antes \\gset
select (pg_temp.talla(:'sede', :'v') ->> 'vendidas_hoy') as hoy_antes, (pg_temp.talla(:'sede', :'v') ->> 'vendidas_14') as v14_antes \\gset
`;
caso(
  "U1 al regularizarla HOY con la función real, la venta de hace 5 días pasa de anotada a escaneada: el total no cambia y hoy tampoco",
  ANTES_DE_REGULARIZAR +
    `select retail.regularizar_prenda((select id from retail.prendas_por_regularizar where venta_item_id = :'li'), :'v', 'llego_nueva') as _dif \\gset
     select concat_ws(';', :'attr_antes', pg_temp.atributo(:'sede', :'cat', 'M', 'neutro'),
       :total_antes || '→' || pg_temp.total_ventas(:'sede'),
       'hoy ' || :'hoy_antes' || '→' || (pg_temp.talla(:'sede', :'v') ->> 'vendidas_hoy'),
       '14 días ' || :'v14_antes' || '→' || (pg_temp.talla(:'sede', :'v') ->> 'vendidas_14'),
       (select estado from retail.prendas_por_regularizar where venta_item_id = :'li'));`,
  "1,1;2,0;2→2;hoy 1→1;14 días 1→2;regularizada"
);
caso(
  "U2 la regularizada no se cuenta otra vez por su salida del libro (que lleva la fecha de HOY): la lectura no mira movimientos",
  ANTES_DE_REGULARIZAR +
    `select retail.regularizar_prenda((select id from retail.prendas_por_regularizar where venta_item_id = :'li'), :'v', 'llego_nueva') as _dif \\gset
     select concat_ws(',', (select count(*) from retail.movimientos where venta_item_id = :'li' and motivo = 'venta' and created_at::date >= retail.fn_hoy_lima() - 1),
       pg_temp.talla(:'sede', :'v') ->> 'vendidas_ayer', pg_temp.talla(:'sede', :'v') ->> 'vendidas_hoy');`,
  "1,0,1"
);
caso(
  "U3 LO QUE LA LECTURA ASUME de regularizar_prenda: mueve la línea de venta de la centinela a la prenda real (si deja de hacerlo, las regularizadas desaparecen de la cuenta)",
  `select concat_ws(',',
     (select prosrc ~ 'update venta_items set variante_id = p_variante_id' from pg_proc where oid = 'retail.regularizar_prenda(uuid, uuid, text)'::regprocedure),
     (select prosrc !~ 'insert into venta_items' from pg_proc where oid = 'retail.regularizar_prenda(uuid, uuid, text)'::regprocedure));`,
  "t,t"
);
caso(
  "U4 contar una sola vez, en grande: 20 anotadas de distintos días, se regularizan 12; el total de la ventana no se mueve",
  `select pg_temp.prenda('PP-U4', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 1, 1);
   select count(pg_temp.anota(:'cat', :'t_m', :'neutro', pg_temp.dia(k % 14))) as _n from generate_series(1, 20) k \\gset
   select pg_temp.total_ventas(:'sede') as antes \\gset
   select count(retail.regularizar_prenda(p.id, :'v', 'llego_nueva')) as _r from (
     select id from retail.prendas_por_regularizar where ubicacion_id = :'sede' order by vendido_en, id limit 12) p \\gset
   select concat_ws(',', :antes, pg_temp.total_ventas(:'sede'), pg_temp.atributo(:'sede', :'cat', 'M', 'neutro'),
                    pg_temp.talla(:'sede', :'v') ->> 'vendidas_14');`,
  "20,20,12,8,12"
);

// ===========================================================================
// C, T. CURVAS, TALLER Y SEDE NULA
// ===========================================================================

caso(
  "C1 la curva de la categoría con stock trae sus 4 tallas y no aparece ninguna categoría de más",
  `select pg_temp.prenda('PP-C1', :'cat', 'M', :'neutro') as v \\gset
   select pg_temp.stock(:'v', 0, 1);
   select string_agg(c ->> 'categoria' || ':' || (select string_agg(x ->> 'talla', '·' order by x ->> 'talla') from jsonb_array_elements(c -> 'tallas') x), ';')
     from jsonb_array_elements(pg_temp.lee(:'sede') -> 'curvas') c;`,
  "PP Polos:L·M·S·XL"
);
caso("T1 el Taller no separa piso y almacén", `select pg_temp.lee(:'taller') ->> 'separa_piso';`, "false");
caso(
  "T2 la sede nula es un error del que llama (22004), no un estado",
  `select pg_temp.intento($q$select retail.fn_piso_plan_lectura(null)$q$);`,
  (s) => s.startsWith("22004|")
);

// ===========================================================================
// K. LA FECHA DEL CUADRE DEL PISO (actividad 3; sin ella el motor pausa «Por colgar», ADR-0328 decisión 5)
// ===========================================================================

// Los cuadres se guardan en `retail.cuadres_piso` (actividad 3). Si la base todavía no la tiene, cada caso crea, dentro de su
// transacción, una tabla con las columnas que la lectura usa; si ya la tiene, inserta filas válidas en la real (con sus candados).
const CON_CUADRES = `
create table if not exists retail.cuadres_piso (id uuid primary key default gen_random_uuid(), ubicacion_id uuid not null,
  persona_id uuid, token_cliente uuid, huella text, escaneo_desde timestamptz, resumen jsonb, nota text,
  created_at timestamptz not null default now());
create function pg_temp.cuadra(u uuid, cuando timestamptz) returns void language sql as $$
  insert into retail.cuadres_piso (ubicacion_id, persona_id, token_cliente, huella, escaneo_desde, resumen, nota, created_at)
  values (u, (select id from public.personas where auth_user_id = '${FELIPE}'), gen_random_uuid(), md5(random()::text),
          cuando - interval '20 minutes', '{}'::jsonb, 'Prueba del motor del piso', cuando)
$$;
`;
caso(
  "K1 una sede que nunca se cuadró (o una base sin cuadres todavía) trae cuadrado_en NULL: para el motor, «sin cuadrar»",
  `select coalesce(pg_temp.lee(:'sede') ->> 'cuadrado_en', 'NULL') || ',' || (pg_temp.lee(:'sede') ? 'cuadrado_en')::text;`,
  "NULL,true"
);
caso(
  "K2 con cuadres, trae el ÚLTIMO de SU sede (no el de otra sede)",
  CON_CUADRES +
    `select pg_temp.cuadra(:'sede', '2026-09-30 10:05-05');
     select pg_temp.cuadra(:'sede', '2026-10-02 09:30-05');
     select pg_temp.cuadra(:'otra', '2026-10-03 18:00-05');
     select concat_ws(',', (pg_temp.lee(:'sede') ->> 'cuadrado_en')::timestamptz = '2026-10-02 09:30-05'::timestamptz,
                      (pg_temp.lee(:'otra') ->> 'cuadrado_en')::timestamptz = '2026-10-03 18:00-05'::timestamptz,
                      coalesce(pg_temp.lee(:'taller') ->> 'cuadrado_en', 'NULL'));`,
  "t,t,NULL"
);
caso(
  "K3 la fecha es la MISMA que la de fn_cuadre_piso_estado (actividad 3) en cuanto las dos viven en la misma base",
  CON_CUADRES +
    `create function pg_temp.k3(u uuid) returns text language plpgsql as $f$
     declare e timestamptz;
     begin
       if to_regprocedure('retail.fn_cuadre_piso_estado(uuid)') is null then return 'sin actividad 3'; end if;
       execute 'select (retail.fn_cuadre_piso_estado($1) ->> ''cuadrado_en'')::timestamptz' into e using u;
       return (e is not distinct from (retail.fn_piso_plan_lectura(u) ->> 'cuadrado_en')::timestamptz)::text;
     end $f$;
     select pg_temp.cuadra(:'sede', '2026-10-02 09:30-05');
     select pg_temp.k3(:'sede') || ',' || pg_temp.k3(:'otra');`,
  (s) => s === "sin actividad 3,sin actividad 3" || s === "true,true"
);

// ===========================================================================
// V. LAS TALLAS DE LA BASE = LAS QUE RECORRE LA PRUEBA DEL MOTOR
// ===========================================================================

{
  let prueba = "";
  try {
    prueba = readFileSync(join(RAIZ, "apps", "web", "lib", "piso-plan.test.ts"), "utf8");
  } catch {
    // Sin el archivo, la lista queda vacía y el caso sale en rojo con el aviso de abajo.
  }
  const lista = prueba.match(/TALLAS_DE_LA_BASE\s*=\s*\[([\s\S]*?)\]/)?.[1];
  const enLaPrueba = lista ? [...lista.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort().join("·") : "(no encontré TALLAS_DE_LA_BASE)";
  caso(
    "V1 las tallas de la base (migraciones + seed) son EXACTAMENTE las que recorre piso-plan.test.ts: una talla nueva se clasifica antes de llegar a una tienda",
    `select string_agg(valor, '·' order by valor collate "C") from retail.tallas;`,
    (s) => {
      const base = s.split("·").sort().join("·");
      if (base !== enLaPrueba) console.log(`    base:   ${base}\n    prueba: ${enLaPrueba}`);
      return base === enLaPrueba;
    }
  );
}

// ===========================================================================
// M. LA MIGRACIÓN
// ===========================================================================

caso(
  "M1 se puede pegar dos veces: el cuerpo no cambia",
  `${MIGRACION}\nselect md5(prosrc) as m1 from pg_proc where oid = ${OID} \\gset\n${MIGRACION}\n` +
    `select (md5(prosrc) = :'m1')::text from pg_proc where oid = ${OID};`,
  "true"
);
caso(
  "M2 la guarda se detiene si la puerta todavía NO conoce a las terminales (la lectura les daría NULL), sin tocar la función",
  `${PUERTA_SIN_TERMINAL}
   select md5(prosrc) as m0 from pg_proc where oid = ${OID} \\gset
   select pg_temp.intento($migracion$${MIGRACION}$migracion$) as intento \\gset
   select (:'intento' like 'P0001|La puerta retail.fn_tiene_acceso_retail() todavía no reconoce a las terminales%') || ',' ||
          (select md5(prosrc) = :'m0' from pg_proc where oid = ${OID});`,
  "true,true"
);

{
  const md5Cabecera = MIGRACION.match(/→ `([0-9a-f]{32})` \(el cuerpo de este archivo/)?.[1] ?? "(sin md5 en la cabecera)";
  caso(
    "M3 la huella que la cabecera manda verificar en producción es la del cuerpo de la función (si cambia el cuerpo, cambia la cabecera)",
    `select md5(prosrc) from pg_proc where oid = ${OID};`,
    md5Cabecera
  );
}

// ===========================================================================
// N. NÚMEROS: ~800 unidades y ~150 ventas
// ===========================================================================

const medicion = caso(
  "N1 ~800 unidades (160 tallas × 5) y 150 ventas (110 escaneadas + 40 anotadas): una lectura completa, fn_existencias_base una vez, y el tiempo (mediana de 7)",
  `select count(pg_temp.prenda('PP-N-' || k, :'cat', (array['S','M','L','XL'])[1 + k % 4], case when k % 3 = 0 then :'otro_color' else :'neutro' end))
     as _p from generate_series(1, 160) k \\gset
   create temp table pp_vs as select id from retail.variantes where sku like 'PP-N-%';
   select count(pg_temp.stock(id, 2, 3)) as _s from pp_vs \\gset
   select count(pg_temp.vende(v.id, 1, pg_temp.dia(k % 14)))
     as _v from generate_series(1, 110) k cross join lateral (select id from pp_vs order by id offset (k * 7) % 160 limit 1) v \\gset
   select count(pg_temp.anota(:'cat', (select id from retail.tallas where valor = (array['S','M','L','XL'])[1 + k % 4]),
                              case when k % 2 = 0 then :'otro_color' else :'neutro' end, pg_temp.dia(k % 14)))
     as _a from generate_series(1, 40) k \\gset
   set local track_functions = 'all';
   select retail.fn_piso_plan_lectura(:'sede') is not null as _1 \\gset
   select (select calls from pg_stat_xact_user_functions where schemaname = 'retail' and funcname = 'fn_existencias_base') as llamadas \\gset
   create temp table pp_t (ms numeric);
   do $$ declare t0 timestamptz; j jsonb; begin
     for k in 1..7 loop
       t0 := clock_timestamp();
       j := retail.fn_piso_plan_lectura(current_setting('pp.sede')::uuid);
       insert into pp_t values (extract(epoch from clock_timestamp() - t0) * 1000);
     end loop; end $$;
   select concat_ws(',',
     (select sum((t ->> 'piso_libre')::int + (t ->> 'almacen_libre')::int) from jsonb_array_elements(pg_temp.lee(:'sede') -> 'tallas') t),
     pg_temp.total_ventas(:'sede'), :llamadas,
     (select round(percentile_cont(0.5) within group (order by ms)::numeric, 1) from pp_t));`,
  (s) => {
    const [unidades, ventas, llamadas, ms] = s.split(",");
    console.log(`    → ${unidades} unidades, ${ventas} ventas, fn_existencias_base ${llamadas} vez, mediana ${ms} ms`);
    return unidades === "800" && ventas === "150" && llamadas === "1" && Number(ms) < 2000;
  }
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
