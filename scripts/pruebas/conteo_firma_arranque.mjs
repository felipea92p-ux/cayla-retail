#!/usr/bin/env node
/**
 * Pruebas de «Conteo I» del rediseño de Inventario (ADR-0328, actividad 15; migraciones
 * `20261004230000_conteo_firma_arranque_columnas.sql` y `20261004230100_conteo_firma_arranque_funciones.sql`) — CAYLA V2.
 *
 * QUÉ PRUEBA (todo en la BASE):
 *   · FIRMA UNA VEZ POR OPERACIÓN. Desde una terminal, un paso sin nombre (las claves soltadas del combo, ADR-0280) hereda la
 *     firma de la operación si es de HOY: el cierre de un conteo la toma de quien lo abrió; la recepción de un traslado, de la
 *     última persona que firmó la recepción (y cada paso con nombre la renueva). Otro día, o sin nadie, corta con
 *     `responsable_requerido` y no escribe nada; con el nombre elegido, firma ese. Una persona con su propia cuenta firma ella.
 *     Sin sesión (SQL Editor), nadie, como siempre.
 *   · CONTEO DE ARRANQUE, POR TRAMOS. El primer conteo de un tramo contado entero y de verdad corrige el stock con el motivo
 *     `conteo_arranque` (no es merma: `fn_es_merma` lo deja fuera; Actividad no lo anota como «ajustó stock») y queda
 *     `es_arranque`. El tramo es el ALMACÉN entero (ahí una categoría no es arranque ni lo gasta: la regla de siempre) y, en el
 *     PISO, cada CATEGORÍA: arrancar A no arranca B, y un conteo de todo el piso después de A ajusta B como arranque y A como
 *     pérdida, línea por línea. El CUADRE DEL PISO de la sede reinicia todos sus tramos (el de otra sede, no). El segundo ya es
 *     `conteo`. Un cierre parcial, uno de prueba, uno con líneas «aplicadas sin contar» o uno de antes del rediseño (sin foto) no
 *     lo son ni lo consumen; uno de toda la ubicación (sin piso ni almacén aparte) sí lo consume para los dos lugares. Corregir el
 *     de arranque antes de otro conteo completo sigue siendo de arranque, y la nota del ajuste previo lo cuenta; reabrirlo y
 *     cancelarlo NO devuelve el arranque (lo dice la marca). `cuadres_piso` es del PR #792: si la base no la tiene, la escena del
 *     cuadre crea una tabla mínima dentro de su transacción (y así prueba también que la función la lee sin depender del orden).
 *   · ATAJO HONESTO. `conteo_aplicar_completos` anota lo que hay AHORA en las pendientes pedidas (sin falsa diferencia si se
 *     vendió entre abrir y aplicar), las marca `aplicada_sin_contar`, no toca lo contado, es idempotente y `fn_conteos_resumen`
 *     las suma en `sin_contar`. Contar a mano una línea aplicada (o borrarla) le quita la marca; una línea «sin contar» con
 *     diferencia es imposible (CHECK).
 *   · CONTROLES: la misma escena contra una versión mutada a propósito (la alternativa descartada) TIENE que dar otro
 *     resultado. Si un control «pasa» igual, la prueba no muerde.
 *
 * CÓMO. Mismo patrón que `conteo_rediseno.mjs` y `responsable_omitido.mjs`: cada escena en su transacción con ROLLBACK. La
 * terminal de almacén de Trujillo, Rosa y Ana (integrantes sin cuenta, con su marca de entrada de hoy) y las prendas se crean
 * dentro; el encabezado HTTP se simula con `request.headers`, como hace PostgREST. Las escenas de arranque usan una tienda
 * propia («ZZ Conteo arranque»): no dependen de los conteos que otras sesiones dejen en el local.
 *
 * USO
 *   pnpm pruebas:conteo-firma-arranque              → contra la base `postgres` del stack local (la del CI)
 *   pnpm pruebas:conteo-firma-arranque --detalle    → además dice qué dio cada control con la función mutada
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const DETALLE = process.argv.includes("--detalle");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Trujillo con cuenta propia (seed)
const T_ALM = "33333333-3333-4333-8333-0000000000c1"; // cuenta de la terminal de almacén de Trujillo (se crea aquí)
const ROSA = "33333333-3333-4333-8333-0000000000c2"; // integrante de Trujillo, sin cuenta
const ANA = "33333333-3333-4333-8333-0000000000c3"; // integrante de Trujillo, sin cuenta

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

// No lanza: un escenario que DEBE fallar no es un error del script, es el resultado que se prueba.
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// Pasada la medianoche de Lima, «hoy 00:01» no tiene pasado: se espera (ver `responsable_omitido.mjs`).
const DIA_MS = 24 * 3600e3;
const msDelDiaLima = () => (((Date.now() - 5 * 3600e3) % DIA_MS) + DIA_MS) % DIA_MS;
if (msDelDiaLima() < 3 * 60e3 || msDelDiaLima() > DIA_MS - 60e3) {
  const espera = (3 * 60e3 - msDelDiaLima() + DIA_MS) % DIA_MS;
  console.log(`Pasada la medianoche de Lima espero ${Math.ceil(espera / 1000)} s.`);
  await new Promise((listo) => setTimeout(listo, espera));
}

const HOY = (hhmm) => `((now() at time zone 'America/Lima')::date + time '${hhmm}') at time zone 'America/Lima'`;

/** La sesión de una cuenta (como la pone PostgREST) y sus encabezados. */
const como = (auth) =>
  `select set_config('request.jwt.claim.sub', '${auth}', true) as _s1, set_config('request.jwt.claims', '{"sub":"${auth}","role":"authenticated"}', true) as _s2 \\gset\n`;
const encabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) as _h \\gset\n`;
const sinNombre = (clave) => encabezados({ "x-responsable-omitido": clave });
const conNombre = (persona) => encabezados({ "x-responsable": persona });

const PRELUDIO = `
begin;
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
create function pg_temp.mover(p_var uuid, p_ubic uuid, p_sub uuid, p_tipo text, p_cant integer, p_motivo text default 'prueba firma') returns uuid
language plpgsql as $f$
declare v_id uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
    values (p_var, p_ubic, p_sub, p_tipo, p_cant, p_motivo) returning id into v_id;
  perform retail.fn_aplicar_movimiento(v_id);
  return v_id;
end;
$f$;
create function pg_temp.stock(p_var uuid, p_ubic uuid, p_sub uuid) returns integer
language sql as $f$
  select coalesce(sum(cantidad), 0)::integer from retail.stock
   where variante_id = p_var and ubicacion_id = p_ubic and (p_sub is null or sububicacion_id = p_sub);
$f$;
create function pg_temp.linea(p_conteo uuid, p_var uuid) returns jsonb
language sql as $f$
  select l from jsonb_array_elements(retail.fn_conteo_detalle(p_conteo) -> 'lineas') l where l ->> 'variante_id' = p_var::text;
$f$;

-- La asistencia de Dynamic (la lee fn_persona_presente). En el stub puede no estar: se crea dentro de la transacción.
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz,
  fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
delete from public.marcajes;
delete from public.jornadas;

select id as tru, sede_dynamic_id as sede_tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Piso de venta', 'piso_venta' from unnest(array[:'tru', :'lim']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, 'Almacén de tienda', 'almacen_tienda' from unnest(array[:'tru', :'lim']::uuid[]) u
   where not exists (select 1 from retail.sububicaciones where ubicacion_id = u and tipo = 'almacen_tienda');
select id as tru_alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as lim_alm from retail.sububicaciones where ubicacion_id = :'lim' and tipo = 'almacen_tienda' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset

-- La terminal de almacén de Trujillo (rol con Conteos, Existencias y Traslados: puede cerrar) y dos integrantes sin cuenta.
insert into auth.users (id, aud, role, email) values ('${T_ALM}', 'authenticated', 'authenticated', 'zz-terminal-almacen-tru@prueba.local');
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  values (:'tru', 'ZZ Terminal Almacén TRU', retail.fn_rol_por_clave('terminal_administrativa'), '${T_ALM}');
insert into public.personas (id, nombres, apellidos, estado, sede_base_id) values
  ('${ROSA}', 'Rosa', 'Prueba', 'activo', :'sede_tru'), ('${ANA}', 'Ana', 'Prueba', 'activo', :'sede_tru');
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values ('${ROSA}', 'colaborador', :'tru'), ('${ANA}', 'colaborador', :'tru');
insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca) values
  ('${ROSA}', :'sede_tru', 'entrada', ${HOY("00:01")}), ('${ANA}', :'sede_tru', 'entrada', ${HOY("00:01")});

-- Dos prendas propias (un producto cada una), con stock por el libro: Trujillo almacén 5 y 3; Lima almacén 6 y 6.
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Firma arranque 1', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p1 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Firma arranque 2', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p2 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p1', 'ZZ-FA-1', 100, 40, true) returning id as v1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p2', 'ZZ-FA-2', 100, 40, true) returning id as v2 \\gset
select pg_temp.mover(:'v1', :'tru', :'tru_alm', 'entrada', 5, 'carga_inicial') as _m \\gset
select pg_temp.mover(:'v2', :'tru', :'tru_alm', 'entrada', 3, 'carga_inicial') as _m \\gset
select pg_temp.mover(:'v1', :'lim', :'lim_alm', 'entrada', 6, 'carga_inicial') as _m \\gset
select pg_temp.mover(:'v2', :'lim', :'lim_alm', 'entrada', 6, 'carga_inicial') as _m \\gset

-- Un conteo abierto de Trujillo que haya quedado en esta base no deja abrir otro (uno por sede).
${como(FELIPE)}${encabezados({})}select count(*) as _previos from (select retail.anular_conteo(id) from retail.conteos where ubicacion_id = :'tru' and estado = 'abierto') x \\gset
`;

const escena = (sql) => `${PRELUDIO}\n${sql}\nrollback;\n`;

/**
 * Un conteo del almacén de Trujillo ABIERTO por Rosa desde la terminal (Rosa elegida en el combo), con v1 contada 4 (falta 1,
 * confirmada) y v2 contada 3. Deja `:conteo`. La sesión queda en la terminal.
 */
const CONTEO_DE_ROSA = `
${como(T_ALM)}${conNombre(ROSA)}
select retail.abrir_conteo(:'tru', :'tru_alm') as conteo \\gset
select retail.conteo_contar(:'conteo', :'v1', 4) as _c \\gset
select retail.conteo_contar(:'conteo', :'v2', 3) as _c \\gset
select retail.conteo_confirmar_diferencia(:'conteo', :'v1') as _c \\gset
`;
// Cierre PARCIAL: el almacén de Trujillo puede traer más prendas del seed; lo que se prueba aquí es la firma, no el arranque.
const CERRAR = (nombre) => `select pg_temp.intento(format('select * from retail.cerrar_conteo(%L, true)', :'conteo')) as ${nombre} \\gset\n`;
const ESTADO_CONTEO = `(select estado from retail.conteos where id = :'conteo')`;
/** ¿El cierre y TODOS sus ajustes van a nombre de `persona` (una expresión SQL que da un uuid)? */
const FIRMA_CIERRE = (persona) =>
  `(select c.cerrado_por = ${persona} and bool_and(m.usuario_id = ${persona}) from retail.conteos c
     join retail.conteo_items ci on ci.conteo_id = c.id join retail.movimientos m on m.conteo_item_id = ci.id
    where c.id = :'conteo' group by c.cerrado_por)`;

/** Felipe manda un traslado de Lima a Trujillo (v1 × 2, v2 × 1) y deja `:tr`; la sesión queda en la terminal de Trujillo. */
const TRASLADO = (items = "jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 2), jsonb_build_object('variante_id', :'v2', 'cantidad', 1))") => `
${como(FELIPE)}${encabezados({})}
select retail.iniciar_traslado(:'lim', :'tru', ${items}, now() + interval '1 day') as tr \\gset
${como(T_ALM)}
`;
const REGISTRAR = (nombre, v, n) => `select pg_temp.intento(format('select retail.registrar_recepcion_traslado(%L, %L, ${n})', :'tr', :'${v}')) as ${nombre} \\gset\n`;
const CONFIRMAR_TR = (nombre) => `select pg_temp.intento(format('select * from retail.confirmar_traslado(%L)', :'tr')) as ${nombre} \\gset\n`;
const REGISTRADO_POR = (v) => `(select registrado_por::text from retail.transferencia_recepciones where transferencia_id = :'tr' and variante_id = :'${v}')`;
const FIRMA_TR = `(select coalesce(recepcion_firmada_por::text, 'NULL') || '/' || coalesce(((recepcion_firmada_en at time zone 'America/Lima')::date = retail.fn_hoy_lima())::text, 'NULL') from retail.transferencias where id = :'tr')`;

/** La escena de arranque: una tienda propia con piso y almacén, como Felipe. v1: 5 en el piso y 2 en el almacén; v2: 3 en el piso. */
const TIENDA_ARRANQUE = `
${como(FELIPE)}${encabezados({})}
insert into retail.ubicaciones (nombre, tipo) values ('ZZ Conteo arranque', 'tienda') returning id as u \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'u', 'Piso de venta', 'piso_venta') returning id as piso \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo) values (:'u', 'Almacén de tienda', 'almacen_tienda') returning id as alm \\gset
select pg_temp.mover(:'v1', :'u', :'piso', 'entrada', 5) as _m \\gset
select pg_temp.mover(:'v2', :'u', :'piso', 'entrada', 3) as _m \\gset
select pg_temp.mover(:'v1', :'u', :'alm', 'entrada', 2) as _m \\gset
`;
/** Abre un conteo de TODO el piso, cuenta v1 = n1 y v2 = n2, confirma lo que tenga diferencia y deja `:conteo`. */
const CONTEO_PISO = (n1, n2) => `
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
select retail.conteo_contar(:'conteo', :'v1', ${n1}) as _c \\gset
${n2 === null ? "" : `select retail.conteo_contar(:'conteo', :'v2', ${n2}) as _c \\gset`}
select count(*) as _conf from (select retail.conteo_confirmar_diferencia(:'conteo', variante_id) from retail.conteo_items
  where conteo_id = :'conteo' and cantidad_contada is not null and cantidad_contada <> cantidad_sistema) x \\gset
`;
const MOTIVOS_DEL_CONTEO = `(select coalesce(string_agg(m.motivo || ':' || m.cantidad, '/' order by m.motivo, m.cantidad), '-') from retail.movimientos m
  join retail.conteo_items ci on ci.id = m.conteo_item_id where ci.conteo_id = :'conteo')`;
const ARRANQUE_POR_LUGAR = `(select string_agg(x.l, '/' order by x.l) from (
  select case when a.sububicacion_id = :'piso' then 'piso' else 'alm' end || '=' || a.arranque_pendiente::text as l
    from retail.fn_conteo_arranque(:'u') a where a.categoria_id is null) x)`;

/** Dos categorías activas: A para la prenda 1 y B para la prenda 2. Deja `:cat_a` y `:cat_b`. */
const CATEGORIAS_AB = `
select id as cat_a from retail.categorias where activo order by nombre limit 1 \\gset
select id as cat_b from retail.categorias where activo order by nombre offset 1 limit 1 \\gset
update retail.productos set categoria_id = :'cat_a' where id = :'p1';
update retail.productos set categoria_id = :'cat_b' where id = :'p2';
`;
/** «A=true/B=false»: si el próximo conteo de cada categoría del piso sería el de arranque (fn_conteo_arranque). */
const ARRANQUE_CATEGORIAS = `(select string_agg(case when a.categoria_id = :'cat_a' then 'A' else 'B' end || '=' || a.arranque_pendiente::text, '/'
    order by a.categoria_id = :'cat_b') from retail.fn_conteo_arranque(:'u') a where a.categoria_id in (:'cat_a', :'cat_b'))`;
const ARRANQUE_TODO = `(${ARRANQUE_POR_LUGAR} || '|' || ${ARRANQUE_CATEGORIAS})`;
/** Abre un conteo de UNA categoría (`cat`) en `lugar`, cuenta `v` = n, confirma la diferencia y deja `:conteo`. */
const CONTEO_CAT = (lugar, cat, v, n) => `
select retail.abrir_conteo(:'u', :'${lugar}', 'categoria', :'${cat}') as conteo \\gset
select retail.conteo_contar(:'conteo', :'${v}', ${n}) as _c \\gset
select count(*) as _conf from (select retail.conteo_confirmar_diferencia(:'conteo', variante_id) from retail.conteo_items
  where conteo_id = :'conteo' and cantidad_contada is not null and cantidad_contada <> cantidad_sistema) x \\gset
`;
/** Abre un conteo de TODO el almacén, cuenta las prendas dadas ({v1: n, …}), confirma y deja `:conteo`. */
const CONTEO_ALM = (cuentas) => `
select retail.abrir_conteo(:'u', :'alm') as conteo \\gset
${Object.entries(cuentas).map(([v, n]) => `select retail.conteo_contar(:'conteo', :'${v}', ${n}) as _c \\gset`).join("\n")}
select count(*) as _conf from (select retail.conteo_confirmar_diferencia(:'conteo', variante_id) from retail.conteo_items
  where conteo_id = :'conteo' and cantidad_contada is not null and cantidad_contada <> cantidad_sistema) x \\gset
`;
const CIERRE = `(${MOTIVOS_DEL_CONTEO} || '/' || (select es_arranque from retail.conteos where id = :'conteo'))`;
const POSIBLE = `(retail.fn_conteo_detalle(:'conteo') -> 'conteo' ->> 'arranque_posible')`;
/**
 * Un cuadre del piso de la sede `ubic` a la hora `hora` (PR #792). Si la base todavía no tiene `cuadres_piso`, se crea una tabla
 * mínima dentro de la transacción: la función la lee con `to_regclass`, así que la prueba vale antes y después de pegar el cuadre.
 */
const CUADRE = (ubic, hora) => `
create table if not exists retail.cuadres_piso (id uuid primary key default gen_random_uuid(), ubicacion_id uuid not null,
  persona_id uuid, token_cliente uuid, huella text, escaneo_desde timestamptz, resumen jsonb, nota text,
  created_at timestamptz not null default now());
insert into retail.cuadres_piso (ubicacion_id, persona_id, token_cliente, huella, escaneo_desde, resumen, created_at)
  values (:'${ubic}', :'felipe', gen_random_uuid(), md5(gen_random_uuid()::text), ${hora} - interval '1 minute', '{}'::jsonb, ${hora});
`;

/** Reescribe una función viva cambiando un texto (la «alternativa descartada»). Falla si el texto no está: una mutación que no aplica no controla nada. */
const MUTAR = (firma, desde, hacia) => `
do $mut$
declare v_def text; v_nueva text;
begin
  v_def := pg_get_functiondef('${firma}'::regprocedure);
  v_nueva := replace(v_def, $a$${desde}$a$, $b$${hacia}$b$);
  if v_nueva = v_def then raise exception 'la mutación no aplicó: no se encontró el texto a cambiar'; end if;
  execute v_nueva;
end;
$mut$;
`;

const CASOS = [];
const exito = (nombre, sql, esperado) => CASOS.push({ nombre, sql: escena(sql), esperado });
const control = (nombre, sql, esperado) => CASOS.push({ nombre, sql: escena(sql), esperado, muerde: true });

// ---------------------------------------------------------------------------
// 1. Firma heredada — el conteo
// ---------------------------------------------------------------------------
exito(
  "conteo abierto HOY por Rosa desde la terminal: la terminal lo cierra sin nombre y firma Rosa (el cierre y su ajuste)",
  `${CONTEO_DE_ROSA}${sinNombre("conteo_cerrar")}${CERRAR("r")}
select concat_ws(',', :'r', ${ESTADO_CONTEO}, ${FIRMA_CIERRE(`'${ROSA}'::uuid`)});`,
  ["SIN_ERROR", "cerrado", "t"],
);

const CONTEO_DE_AYER = `${CONTEO_DE_ROSA}
update retail.conteos set created_at = now() - interval '1 day' where id = :'conteo';
${sinNombre("conteo_cerrar")}${CERRAR("r1")}
select pg_temp.stock(:'v1', :'tru', :'tru_alm') as stock_tras_r1 \\gset
`;
exito(
  "conteo abierto OTRO día: la terminal sin nombre recibe responsable_requerido y no se mueve nada; con Ana elegida cierra a nombre de Ana",
  `${CONTEO_DE_AYER}
${conNombre(ANA)}${CERRAR("r2")}
select concat_ws(',', split_part(:'r1', '|', 1), split_part(:'r1', '|', 2), split_part(:'r1', '|', 3), :'stock_tras_r1', :'r2', ${ESTADO_CONTEO}, ${FIRMA_CIERRE(`'${ANA}'::uuid`)},
  pg_temp.stock(:'v1', :'tru', :'tru_alm'));`,
  ["42501", "responsable_requerido", "Elige quién hace esta operación: se empezó otro día", "5", "SIN_ERROR", "cerrado", "t", "4"],
);

exito(
  "una persona con su cuenta cierra sin nombre: firma ELLA, no hereda (Micaela cierra el conteo que abrió Rosa)",
  `${CONTEO_DE_ROSA}${como(MICAELA)}${sinNombre("conteo_cerrar")}${CERRAR("r")}
select concat_ws(',', :'r', ${FIRMA_CIERRE(":'micaela'::uuid")});`,
  ["SIN_ERROR", "t"],
);

// Rosa abre y cuenta a la mañana y marca su salida; a la tarde la terminal cierra sin nombre (revisión adversarial, escena C).
const SALIDA_DE_ROSA = `insert into public.marcajes (persona_id, sede_id, tipo, timestamp_marca) values ('${ROSA}', :'sede_tru', 'salida', now() - interval '1 second');\n`;
const CONTEO_DE_ROSA_QUE_SALIO = `${CONTEO_DE_ROSA}
select (retail.fn_conteo_detalle(:'conteo') -> 'conteo' ->> 'abierto_por_presente') as presente_antes \\gset
${SALIDA_DE_ROSA}
select (retail.fn_conteo_detalle(:'conteo') -> 'conteo' ->> 'abierto_por_presente') as presente_despues \\gset
${sinNombre("conteo_cerrar")}${CERRAR("r1")}
select ${ESTADO_CONTEO} as estado_tras_r1 \\gset
${conNombre(ANA)}${CERRAR("r2")}
select concat_ws(',', :'presente_antes', :'presente_despues', split_part(:'r1', '|', 2), split_part(:'r1', '|', 3), :'estado_tras_r1', :'r2',
  ${FIRMA_CIERRE(`'${ANA}'::uuid`)});`;
exito(
  "conteo de HOY cuya dueña ya marcó su salida: la lectura lo dice, la terminal sin nombre recibe responsable_requerido (nada se cierra a nombre de quien no está) y con Ana elegida cierra Ana",
  CONTEO_DE_ROSA_QUE_SALIO,
  ["true", "false", "responsable_requerido", "Elige quién hace esta operación: quien la empezó ya no está de turno", "abierto", "SIN_ERROR", "t"],
);

exito(
  "fn_firma_heredada sola: actor manda; terminal hereda lo de hoy y corta con lo de ayer o sin nadie; sin sesión, NULL como siempre",
  `${como(T_ALM)}
select concat_ws(',',
  retail.fn_firma_heredada('${ANA}', '${ROSA}', now() - interval '3 days') = '${ANA}',
  retail.fn_firma_heredada(null, '${ROSA}', now()) = '${ROSA}',
  split_part(pg_temp.intento($q$select retail.fn_firma_heredada(null, '${ROSA}', now() - interval '1 day')$q$), '|', 2),
  split_part(pg_temp.intento($q$select retail.fn_firma_heredada(null, null, null)$q$), '|', 2),
  split_part(pg_temp.intento($q$select retail.fn_firma_heredada(null, null, null)$q$), '|', 3)) as terminal \\gset
select set_config('request.jwt.claim.sub', '', true) as _a, set_config('request.jwt.claims', '{}', true) as _b \\gset
select concat_ws(',', :'terminal', coalesce(retail.fn_firma_heredada(null, '${ROSA}', now() - interval '9 days')::text, 'NULL'));`,
  ["t", "t", "responsable_requerido", "responsable_requerido", "Elige quién hace esta operación", "NULL"],
);

// ---------------------------------------------------------------------------
// 2. Firma heredada — la recepción de un traslado
// ---------------------------------------------------------------------------
exito(
  "traslado: la primera casilla sin nombre pide el nombre (no guarda); con Rosa guarda; la segunda sin nombre hereda a Rosa; confirmar sin nombre firma Rosa",
  `${TRASLADO()}${sinNombre("traslado_recibir")}${REGISTRAR("r0", "v1", 2)}
select count(*) as filas_r0 from retail.transferencia_recepciones where transferencia_id = :'tr' \\gset
${conNombre(ROSA)}${REGISTRAR("r1", "v1", 2)}
${sinNombre("traslado_recibir")}${REGISTRAR("r2", "v2", 1)}${CONFIRMAR_TR("rc")}
select concat_ws(',', split_part(:'r0', '|', 2), :'filas_r0', :'r1', :'r2', :'rc',
  ${REGISTRADO_POR("v1")} = '${ROSA}', ${REGISTRADO_POR("v2")} = '${ROSA}',
  (select estado || '/' || (confirmado_por = '${ROSA}')::text || '/' || (cerrado_por = '${ROSA}')::text from retail.transferencias where id = :'tr'),
  (select bool_and(m.usuario_id = '${ROSA}') from retail.movimientos m join retail.transferencia_recepciones r on r.id = m.transferencia_recepcion_id where r.transferencia_id = :'tr'),
  ${FIRMA_TR} = '${ROSA}/true',
  (select (j ->> 'persona_id') = '${ROSA}' and (j ->> 'de_hoy')::boolean and j ->> 'nombre' = 'Rosa Prueba' from (select retail.fn_traslado_firma_recepcion(:'tr') as j) x));`,
  ["responsable_requerido", "0", "SIN_ERROR", "SIN_ERROR", "SIN_ERROR", "t", "t", "cerrada/true/true", "t", "t", "t"],
);

const TRASLADO_DE_AYER = `${TRASLADO()}${conNombre(ROSA)}${REGISTRAR("r1", "v1", 2)}${REGISTRAR("r2", "v2", 1)}
update retail.transferencias set recepcion_firmada_en = now() - interval '1 day' where id = :'tr';
${sinNombre("traslado_recibir")}${CONFIRMAR_TR("rc1")}
select estado as estado_tras_rc1 from retail.transferencias where id = :'tr' \\gset
`;
exito(
  "traslado: la firma de AYER no se hereda (confirmar sin nombre corta y no mueve nada); con Ana confirma y la firma vigente pasa a Ana, de hoy",
  `${TRASLADO_DE_AYER}
${conNombre(ANA)}${CONFIRMAR_TR("rc2")}
select concat_ws(',', split_part(:'rc1', '|', 2), :'estado_tras_rc1', :'rc2',
  (select estado || '/' || (confirmado_por = '${ANA}')::text from retail.transferencias where id = :'tr'), ${FIRMA_TR} = '${ANA}/true');`,
  ["responsable_requerido", "en_transito", "SIN_ERROR", "cerrada/true", "t"],
);

exito(
  "traslado con diferencia: el cierre del líder desde la terminal, sin nombre y el mismo día, hereda a quien recibió",
  `${TRASLADO("jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 2))")}${conNombre(ROSA)}${REGISTRAR("r1", "v1", 1)}
${sinNombre("traslado_recibir")}${CONFIRMAR_TR("rc")}
select estado as tras_confirmar from retail.transferencias where id = :'tr' \\gset
select pg_temp.intento(format('select * from retail.cerrar_traslado_con_diferencia(%L, %L)', :'tr', 'faltó una')) as rcd \\gset
select concat_ws(',', :'rc', :'tras_confirmar', :'rcd', (select estado || '/' || (cerrado_por = '${ROSA}')::text from retail.transferencias where id = :'tr'));`,
  ["SIN_ERROR", "recibido_con_diferencia", "SIN_ERROR", "cerrada/true"],
);

exito(
  "traslado: si quien firmó la recepción ya marcó su salida, la lectura lo dice (presente=false) y el paso siguiente sin nombre pregunta",
  `${TRASLADO()}${conNombre(ROSA)}${REGISTRAR("r1", "v1", 2)}
select (retail.fn_traslado_firma_recepcion(:'tr') ->> 'presente') as antes \\gset
${SALIDA_DE_ROSA}${sinNombre("traslado_recibir")}${REGISTRAR("r2", "v2", 1)}
select concat_ws(',', :'r1', :'antes', retail.fn_traslado_firma_recepcion(:'tr') ->> 'presente', split_part(:'r2', '|', 2),
  (select count(*) from retail.transferencia_recepciones where transferencia_id = :'tr'));`,
  ["SIN_ERROR", "true", "false", "responsable_requerido", "1"],
);

// Las dos lecturas nuevas solo responden a quien opera una de las sedes: Micaela (Trujillo) no lee quién recibe un traslado de
// Lima al Taller ni el arranque de Lima.
const LECTURAS_AJENAS = `${como(FELIPE)}${encabezados({})}
select id as taller from retail.ubicaciones where nombre = 'Taller' \\gset
select retail.iniciar_traslado(:'lim', :'taller', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', 1)), now() + interval '1 day') as tr \\gset
select (retail.fn_traslado_firma_recepcion(:'tr') is not null) as felipe_lee, (select count(*) > 0 from retail.fn_conteo_arranque(:'lim')) as felipe_arranque \\gset
${como(MICAELA)}
select concat_ws(',', :'felipe_lee', :'felipe_arranque', coalesce(retail.fn_traslado_firma_recepcion(:'tr')::text, 'NULL'),
  (select count(*) from retail.fn_conteo_arranque(:'lim')));`;
exito(
  "las lecturas de la firma y del arranque solo responden a quien opera la sede (Micaela, de Trujillo, no lee las de Lima)",
  LECTURAS_AJENAS,
  ["t", "t", "NULL", "0"],
);

exito(
  "traslado: una persona con su cuenta recibe sin nombre y firma ELLA; la firma vigente pasa a ella",
  `${TRASLADO()}${conNombre(ROSA)}${REGISTRAR("r1", "v1", 2)}
${como(MICAELA)}${sinNombre("traslado_recibir")}${REGISTRAR("r2", "v2", 1)}
select concat_ws(',', :'r2', ${REGISTRADO_POR("v2")} = :'micaela', ${FIRMA_TR} = :'micaela' || '/true');`,
  ["SIN_ERROR", "t", "t"],
);

// La misma persona que firmó ayer vuelve hoy y firma con su nombre: la firma se RENUEVA (hoy), y el paso siguiente sin nombre la
// hereda. Sin renovarla, cada paso sin nombre volvería a preguntar: justo lo que Felipe no quiere.
const MISMA_PERSONA_OTRO_DIA = `${TRASLADO()}${conNombre(ROSA)}${REGISTRAR("r1", "v1", 2)}
update retail.transferencias set recepcion_firmada_en = now() - interval '1 day' where id = :'tr';
${REGISTRAR("r2", "v2", 1)}
${sinNombre("traslado_recibir")}${CONFIRMAR_TR("rc")}
select concat_ws(',', :'r2', :'rc', (select estado || '/' || (confirmado_por = '${ROSA}')::text from retail.transferencias where id = :'tr'), ${FIRMA_TR} = '${ROSA}/true');`;
exito(
  "traslado: la misma persona de ayer firma hoy con su nombre → la firma se renueva y el paso siguiente sin nombre la hereda (no se pregunta en cada paso)",
  MISMA_PERSONA_OTRO_DIA,
  ["SIN_ERROR", "SIN_ERROR", "cerrada/true", "t"],
);

// ---------------------------------------------------------------------------
// 3. Conteo de arranque
// ---------------------------------------------------------------------------
exito(
  "arranque: el primer conteo de TODO el piso cerrado sin pendientes corrige el stock con motivo conteo_arranque, no es merma ni «ajustó stock», queda es_arranque; el almacén sigue pendiente",
  `${TIENDA_ARRANQUE}
select ${ARRANQUE_POR_LUGAR} as antes \\gset
${CONTEO_PISO(4, 3)}
select (retail.fn_conteo_detalle(:'conteo') -> 'conteo' ->> 'arranque_posible') as posible \\gset
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', :'antes', :'posible', ${MOTIVOS_DEL_CONTEO}, (select es_arranque from retail.conteos where id = :'conteo'),
  pg_temp.stock(:'v1', :'u', :'piso'),
  (select bool_or(retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)) from retail.movimientos m join retail.conteo_items ci on ci.id = m.conteo_item_id where ci.conteo_id = :'conteo'),
  coalesce(retail.fn_actividad_clase_inventario('ajuste', 'conteo_arranque'), 'NULL'),
  ${ARRANQUE_POR_LUGAR},
  (select es_arranque::text from retail.fn_conteos_resumen(:'u') where id = :'conteo'),
  (retail.fn_conteo_detalle(:'conteo') -> 'conteo' ->> 'es_arranque'));`,
  ["alm=true/piso=true", "true", "conteo_arranque:-1", "t", "4", "f", "NULL", "alm=true/piso=false", "true", "true"],
);

exito(
  "arranque: el SEGUNDO conteo completo del piso ya no lo es: su faltante es merma (motivo conteo) y al abrirlo ya no es posible",
  `${TIENDA_ARRANQUE}${CONTEO_PISO(4, 3)}
select * from retail.cerrar_conteo(:'conteo') \\gset
${CONTEO_PISO(3, 3)}
select (retail.fn_conteo_detalle(:'conteo') -> 'conteo' ->> 'arranque_posible') as posible \\gset
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', :'posible', ${MOTIVOS_DEL_CONTEO}, (select es_arranque from retail.conteos where id = :'conteo'),
  (select bool_and(retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)) from retail.movimientos m join retail.conteo_items ci on ci.id = m.conteo_item_id where ci.conteo_id = :'conteo'));`,
  ["false", "conteo:-1", "f", "t"],
);

const PARCIAL = `${TIENDA_ARRANQUE}${CONTEO_PISO(4, null)}
select * from retail.cerrar_conteo(:'conteo', true) \\gset
`;
exito(
  "arranque: un cierre PARCIAL no es el de arranque ni lo consume (su faltante es merma y el piso sigue pendiente)",
  `${PARCIAL}
select concat_ws(',', ${MOTIVOS_DEL_CONTEO}, (select es_arranque from retail.conteos where id = :'conteo'), ${ARRANQUE_POR_LUGAR});`,
  ["conteo:-1", "f", "alm=true/piso=true"],
);

// En el ALMACÉN el tramo es el lugar entero: la regla de siempre (Felipe, 2026-10-04). v2 suma 4 en el almacén para que el segundo
// y el tercer conteo de todo el almacén tengan algo que ajustar.
const ALMACEN_SIN_CUADRE = `${TIENDA_ARRANQUE}${CATEGORIAS_AB}
select pg_temp.mover(:'v2', :'u', :'alm', 'entrada', 4) as _m \\gset
${CONTEO_CAT("alm", "cat_a", "v1", 1)}
select ${POSIBLE} as posible_cat \\gset
select * from retail.cerrar_conteo(:'conteo') \\gset
select ${CIERRE} as cierre_cat, :'conteo' as conteo_cat \\gset
select ${ARRANQUE_POR_LUGAR} as tras_cat \\gset
${CONTEO_ALM({ v1: 1, v2: 3 })}
select * from retail.cerrar_conteo(:'conteo') \\gset
select ${CIERRE} as cierre_todo1 \\gset
select ${ARRANQUE_POR_LUGAR} as tras_todo1 \\gset
${CONTEO_ALM({ v1: 1, v2: 2 })}
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', :'posible_cat', :'cierre_cat', :'tras_cat', :'cierre_todo1', :'tras_todo1', ${CIERRE},
  pg_temp.intento(format('update retail.conteos set es_arranque = true where id = %L', :'conteo_cat')) like '23514|arranque_incoherente|%');`;
const ESPERA_ALMACEN = ["false", "conteo:-1/false", "alm=true/piso=true", "conteo_arranque:-1/true", "alm=false/piso=true", "conteo:-1/false", "t"];
exito(
  "arranque en el ALMACÉN sin cuadre (la regla de siempre): una categoría no lo es ni lo gasta; el primero de todo el almacén sí; el segundo ya es merma; y la base no deja marcar de arranque una categoría del almacén",
  ALMACEN_SIN_CUADRE,
  ESPERA_ALMACEN,
);

// En el PISO el tramo es la CATEGORÍA: el piso se cuenta por categorías a lo largo de la semana (Felipe, 2026-10-04).
const PISO_POR_CATEGORIA = `${TIENDA_ARRANQUE}${CATEGORIAS_AB}
select ${ARRANQUE_TODO} as antes \\gset
${CONTEO_CAT("piso", "cat_a", "v1", 4)}
select ${POSIBLE} || '/' || (retail.fn_conteo_detalle(:'conteo') -> 'conteo' ->> 'arranque_por_categoria') as posible_a \\gset
select * from retail.cerrar_conteo(:'conteo') \\gset
select ${CIERRE} as cierre_a \\gset
select ${ARRANQUE_TODO} as tras_a \\gset
${CONTEO_CAT("piso", "cat_b", "v2", 2)}
select * from retail.cerrar_conteo(:'conteo') \\gset
select ${CIERRE} as cierre_b \\gset
${CONTEO_CAT("piso", "cat_a", "v1", 3)}
select ${POSIBLE} as posible_a2 \\gset
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', :'antes', :'posible_a', :'cierre_a', :'tras_a', :'cierre_b', :'posible_a2', ${CIERRE}, ${ARRANQUE_TODO});`;
const ESPERA_PISO_POR_CATEGORIA = [
  "alm=true/piso=true|A=true/B=true",
  "true/true",
  "conteo_arranque:-1/true",
  "alm=true/piso=true|A=false/B=true",
  "conteo_arranque:-1/true",
  "false",
  "conteo:-1/false",
  "alm=true/piso=false|A=false/B=false",
];
exito(
  "arranque en el PISO, por categoría: el primer conteo de A es su arranque y NO arranca B (B sigue pendiente y su primer conteo también lo es); el segundo de A ya es merma",
  PISO_POR_CATEGORIA,
  ESPERA_PISO_POR_CATEGORIA,
);

const TODO_EL_PISO_TRAS_A = `${TIENDA_ARRANQUE}${CATEGORIAS_AB}
${CONTEO_CAT("piso", "cat_a", "v1", 4)}
select * from retail.cerrar_conteo(:'conteo') \\gset
${CONTEO_PISO(3, 2)}
select ${POSIBLE} as posible \\gset
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', :'posible', ${CIERRE}, ${ARRANQUE_TODO});`;
const ESPERA_TODO_EL_PISO_TRAS_A = ["true", "conteo:-1/conteo_arranque:-1/true", "alm=true/piso=false|A=false/B=false"];
exito(
  "arranque en el PISO: un conteo de TODO el piso después de arrancar A es el arranque de B, línea por línea: el faltante de B no es merma y el de A sí",
  TODO_EL_PISO_TRAS_A,
  ESPERA_TODO_EL_PISO_TRAS_A,
);

// El cuadre del piso (PR #792) reinicia TODOS los tramos de su sede: el almacén y cada categoría del piso. El de otra sede, no.
// Dentro de una transacción `now()` no avanza: los conteos de antes se corren una hora atrás y el cuadre queda a un minuto.
const CUADRE_REINICIA = `${TIENDA_ARRANQUE}${CATEGORIAS_AB}
${CONTEO_ALM({ v1: 1 })}
select * from retail.cerrar_conteo(:'conteo') \\gset
${CONTEO_CAT("piso", "cat_a", "v1", 4)}
select * from retail.cerrar_conteo(:'conteo') \\gset
select ${ARRANQUE_TODO} as antes_del_cuadre \\gset
update retail.conteos set created_at = now() - interval '1 hour' where ubicacion_id = :'u';
${CUADRE("lim", "now() - interval '1 minute'")}
select ${ARRANQUE_TODO} as tras_cuadre_ajeno \\gset
${CUADRE("u", "now() - interval '1 minute'")}
select ${ARRANQUE_TODO} as tras_cuadre \\gset
${CONTEO_ALM({ v1: 0 })}
select * from retail.cerrar_conteo(:'conteo') \\gset
select ${CIERRE} as cierre_alm \\gset
${CONTEO_CAT("piso", "cat_a", "v1", 3)}
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', :'antes_del_cuadre', :'tras_cuadre_ajeno', :'tras_cuadre', :'cierre_alm', ${CIERRE});`;
const ESPERA_CUADRE = [
  "alm=false/piso=true|A=false/B=true",
  "alm=false/piso=true|A=false/B=true",
  "alm=true/piso=true|A=true/B=true",
  "conteo_arranque:-1/true",
  "conteo_arranque:-1/true",
];
exito(
  "el CUADRE del piso reinicia el arranque de su sede: después del cuadre, el primer conteo del almacén y el primero de A vuelven a ser de arranque (un cuadre de otra sede no cambia nada)",
  CUADRE_REINICIA,
  ESPERA_CUADRE,
);

exito(
  "arranque: uno de PRUEBA no lo consume; uno de TODA la ubicación (sin piso ni almacén aparte) lo consume para los dos lugares",
  `${TIENDA_ARRANQUE}
insert into retail.conteos (ubicacion_id, sububicacion_id, estado, alcance, cerrado_en, es_prueba, foto_en) values (:'u', null, 'cerrado', 'todo', now(), true, now())
  returning id as de_prueba \\gset
insert into retail.conteo_items (conteo_id, variante_id, cantidad_foto, cantidad_sistema, cantidad_contada) values (:'de_prueba', :'v1', 5, 5, 5);
select ${ARRANQUE_POR_LUGAR} as con_prueba \\gset
update retail.conteos set es_prueba = false where id = :'de_prueba';
select concat_ws(',', :'con_prueba', ${ARRANQUE_POR_LUGAR});`,
  ["alm=true/piso=true", "alm=false/piso=false"],
);

exito(
  "arranque: corregir el de arranque (reabrir) antes de otro conteo completo sigue siendo de arranque, y la nota del ajuste previo lo cuenta",
  `${TIENDA_ARRANQUE}${CONTEO_PISO(4, 3)}
select * from retail.cerrar_conteo(:'conteo') \\gset
select retail.reabrir_conteo(:'conteo') as _r \\gset
select (pg_temp.linea(:'conteo', :'v1') ->> 'ajustado_total') as ajustado_antes_de_contar \\gset
select retail.conteo_contar(:'conteo', :'v1', 5) as _c \\gset
select retail.conteo_confirmar_diferencia(:'conteo', :'v1') as _c \\gset
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', :'ajustado_antes_de_contar', ${MOTIVOS_DEL_CONTEO}, (select es_arranque from retail.conteos where id = :'conteo'), pg_temp.stock(:'v1', :'u', :'piso'));`,
  ["-1", "conteo_arranque:-1/conteo_arranque:1", "t", "5"],
);

// Hallazgos de la revisión adversarial (2026-10-04): tres caminos que gastaban el arranque sin que nadie contara el lugar entero.
const TODO_APLICADO_Y_DESPUES_CONTADO = `${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
select retail.conteo_aplicar_completos(:'conteo', array[:'v1', :'v2']::uuid[]) as _ap \\gset
select * from retail.cerrar_conteo(:'conteo') \\gset
select (select es_arranque from retail.conteos where id = :'conteo') as primero \\gset
select ${ARRANQUE_POR_LUGAR} as tras_aplicado \\gset
${CONTEO_PISO(4, 3)}
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', :'primero', :'tras_aplicado', ${MOTIVOS_DEL_CONTEO}, (select es_arranque from retail.conteos where id = :'conteo'));`;
exito(
  "arranque: un conteo de todo el piso con todo aplicado SIN CONTAR no es el de arranque ni lo gasta; el siguiente, contado de verdad, sí (la diferencia de la carga no cae como merma)",
  TODO_APLICADO_Y_DESPUES_CONTADO,
  ["f", "alm=true/piso=true", "conteo_arranque:-1", "t"],
);

const CONTEO_VIEJO_DE_UNA_LINEA = `${TIENDA_ARRANQUE}
insert into retail.conteos (ubicacion_id, sububicacion_id, estado, alcance, cerrado_en) values (:'u', :'piso', 'cerrado', 'todo', now())
  returning id as viejo \\gset
insert into retail.conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada) values (:'viejo', :'v1', 5, 5);
select concat_ws(',', ${ARRANQUE_POR_LUGAR}, retail.fn_conteo_vale_como_arranque(:'viejo'));`;
exito(
  "arranque: un conteo de antes del rediseño (sin foto) con UNA línea no gasta el arranque: no se sabe si se contó todo",
  CONTEO_VIEJO_DE_UNA_LINEA,
  ["alm=true/piso=true", "f"],
);

const ARRANQUE_REABIERTO_Y_CANCELADO = `${TIENDA_ARRANQUE}${CONTEO_PISO(4, 3)}
select * from retail.cerrar_conteo(:'conteo') \\gset
select retail.reabrir_conteo(:'conteo') as _r \\gset
select retail.anular_conteo(:'conteo') as _a \\gset
select ${ARRANQUE_POR_LUGAR} as tras_cancelar \\gset
${CONTEO_PISO(3, 3)}
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', :'tras_cancelar', ${MOTIVOS_DEL_CONTEO}, (select es_arranque from retail.conteos where id = :'conteo'));`;
exito(
  "arranque: reabrir el de arranque y cancelarlo NO lo devuelve (lo gastado lo dice la marca): el faltante del siguiente conteo completo es merma",
  ARRANQUE_REABIERTO_Y_CANCELADO,
  ["alm=true/piso=false", "conteo:-1", "f"],
);

// ---------------------------------------------------------------------------
// 4. Atajo honesto: «Aplicar todos completos»
// ---------------------------------------------------------------------------
const APLICAR = (nombre, lista) => `select retail.conteo_aplicar_completos(:'conteo', array[${lista}]::uuid[]) as ${nombre} \\gset\n`;
const ITEM = (v, campos) => `(select ${campos} from retail.conteo_items where conteo_id = :'conteo' and variante_id = :'${v}')`;
exito(
  "aplicar todos completos: anota lo que hay AHORA en las pendientes pedidas (una venta entre abrir y aplicar no deja falsa diferencia), las marca sin contar, no toca lo contado ni inventa líneas, y devuelve las líneas",
  `${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
select retail.conteo_contar(:'conteo', :'v1', 5) as _c \\gset
select pg_temp.mover(:'v2', :'u', :'piso', 'salida', 1, 'venta') as _venta \\gset
select gen_random_uuid() as ajena \\gset
${APLICAR("r", ":'v1', :'v2', :'ajena'")}
select concat_ws(',', :'r'::jsonb ->> 'aplicadas', jsonb_array_length(:'r'::jsonb -> 'lineas'),
  ${ITEM("v1", "cantidad_contada || '/' || aplicada_sin_contar")},
  ${ITEM("v2", "cantidad_sistema || '/' || cantidad_contada || '/' || aplicada_sin_contar")},
  (select l ->> 'estado' || '/' || (l ->> 'aplicada_sin_contar') from jsonb_array_elements(:'r'::jsonb -> 'lineas') l where l ->> 'variante_id' = :'v2'),
  (select lineas || '/' || lineas_con_diferencia || '/' || sin_contar || '/' || pendientes from retail.fn_conteos_resumen(:'u') where id = :'conteo'));`,
  ["1", "2", "5/false", "2/2/true", "correcta/true", "2/0/1/0"],
);

exito(
  "aplicar todos completos es idempotente: repetirla no anota nada más ni reescribe la hora",
  `${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
${APLICAR("r1", ":'v1', :'v2'")}
select ${ITEM("v2", "verificado_en")} as hora1 \\gset
${APLICAR("r2", ":'v1', :'v2'")}
select concat_ws(',', :'r1'::jsonb ->> 'aplicadas', :'r2'::jsonb ->> 'aplicadas', ${ITEM("v2", "verificado_en")} = :'hora1'::timestamptz,
  (:'r1'::jsonb -> 'lineas') = (:'r2'::jsonb -> 'lineas'));`,
  ["2", "0", "t", "t"],
);

exito(
  "contar a mano una línea aplicada (aunque sea la misma cifra) le quita la marca; borrarle la cifra también",
  `${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
${APLICAR("r1", ":'v1', :'v2'")}
select retail.conteo_contar(:'conteo', :'v2', 3) as _c \\gset
select retail.conteo_contar(:'conteo', :'v1', null) as _c \\gset
select concat_ws(',', ${ITEM("v2", "cantidad_contada || '/' || aplicada_sin_contar")},
  ${ITEM("v1", "coalesce(cantidad_contada::text, 'NULL') || '/' || aplicada_sin_contar")});`,
  ["3/false", "NULL/false"],
);

// Una línea «en reconteo» es una diferencia que alguien YA vio (se contó 2 donde CAYLA esperaba 5): aplicar lo esperado la borraría
// sin que nadie la mirara y el stock no se corregiría (ADR-0282: se confirma o se vuelve a contar). El atajo no la toca.
const RECONTEO_Y_APLICAR = `${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
select retail.conteo_contar(:'conteo', :'v1', 2) as _c \\gset
select retail.conteo_recontar(:'conteo', :'v1') as _c \\gset
${APLICAR("r", ":'v1', :'v2'")}
select concat_ws(',', :'r'::jsonb ->> 'aplicadas',
  ${ITEM("v1", "coalesce(cantidad_contada::text, 'NULL') || '/' || contada_anterior || '/' || aplicada_sin_contar")},
  ${ITEM("v2", "cantidad_contada || '/' || aplicada_sin_contar")},
  (select l ->> 'estado' from jsonb_array_elements(:'r'::jsonb -> 'lineas') l where l ->> 'variante_id' = :'v1'));`;
exito(
  "aplicar todos completos NO toca una línea «en reconteo» (alguien ya vio una diferencia ahí): sigue sin cifra y con lo contado antes",
  RECONTEO_Y_APLICAR,
  ["1", "NULL/2/false", "3/true", "en_reconteo"],
);

exito(
  "el candado de la tabla: una línea «sin contar» sin cifra o con diferencia es imposible (CHECK)",
  `${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
select retail.conteo_contar(:'conteo', :'v1', 4) as _c \\gset
select concat_ws(',',
  split_part(pg_temp.intento(format('update retail.conteo_items set aplicada_sin_contar = true where conteo_id = %L and variante_id = %L', :'conteo', :'v1')), '|', 1),
  split_part(pg_temp.intento(format('update retail.conteo_items set aplicada_sin_contar = true where conteo_id = %L and variante_id = %L', :'conteo', :'v2')), '|', 1));`,
  ["23514", "23514"],
);

exito(
  "aplicar todos completos solo en un conteo abierto y de una sede que se opera (Micaela, de Trujillo, no aplica en otra tienda)",
  `${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
${como(MICAELA)}
select pg_temp.intento(format('select retail.conteo_aplicar_completos(%L, array[%L]::uuid[])', :'conteo', :'v1')) as ajena \\gset
${como(FELIPE)}
select retail.anular_conteo(:'conteo') as _a \\gset
select pg_temp.intento(format('select retail.conteo_aplicar_completos(%L, array[%L]::uuid[])', :'conteo', :'v1')) as anulado \\gset
select concat_ws(',', split_part(:'ajena', '|', 3), split_part(:'anulado', '|', 3));`,
  ["No tienes permiso para contar en esa ubicación", "Ese conteo ya está anulado"],
);

exito(
  "al cerrar, lo aplicado no se ajusta (no tenía diferencia), el historial dice cuántas se contaron y cuántas no, y con algo aplicado sin contar NO es el de arranque",
  `${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
select retail.conteo_contar(:'conteo', :'v1', 4) as _c \\gset
select retail.conteo_confirmar_diferencia(:'conteo', :'v1') as _c \\gset
${APLICAR("r", ":'v2'")}
select * from retail.cerrar_conteo(:'conteo') \\gset
select concat_ws(',', ${MOTIVOS_DEL_CONTEO}, (select lineas || '/' || lineas_con_diferencia || '/' || sin_contar || '/' || parcial || '/' || es_arranque from retail.fn_conteos_resumen(:'u') where id = :'conteo'));`,
  ["conteo:-1", "2/1/1/false/false"],
);

// ---------------------------------------------------------------------------
// 5. Controles: la alternativa descartada TIENE que dar otro resultado
// ---------------------------------------------------------------------------
control(
  "CONTROL · si la firma se heredara de cualquier día (sin mirar la fecha), el conteo de ayer se cerraría a nombre de Rosa: la prueba lo detecta",
  `${MUTAR("retail.fn_firma_heredada(uuid,uuid,timestamptz)", "and (p_heredable_en at time zone 'America/Lima')::date = retail.fn_hoy_lima()", "")}
${CONTEO_DE_AYER}
select concat_ws(',', split_part(:'r1', '|', 1), split_part(:'r1', '|', 2), split_part(:'r1', '|', 3), :'stock_tras_r1');`,
  ["42501", "responsable_requerido", "Elige quién hace esta operación: se empezó otro día", "5"],
);

control(
  "CONTROL · si la firma se heredara aunque su dueña ya marcó la salida, el conteo se cerraría a nombre de Rosa: la prueba lo detecta",
  `${MUTAR("retail.fn_firma_heredada(uuid,uuid,timestamptz)", "or not retail.fn_persona_presente(p_heredable, v_ubicacion, now())", "")}
${CONTEO_DE_ROSA_QUE_SALIO}`,
  ["true", "false", "responsable_requerido", "Elige quién hace esta operación: quien la empezó ya no está de turno", "abierto", "SIN_ERROR", "t"],
);

control(
  "CONTROL · sin el filtro de sedes, cualquier cuenta leería quién recibe cada traslado: la prueba lo detecta",
  `${MUTAR("retail.fn_traslado_firma_recepcion(uuid)", "and (retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id) or retail.fn_puede_operar_ubicacion(t.ubicacion_destino_id))", "")}
${LECTURAS_AJENAS}`,
  ["t", "t", "NULL", "0"],
);

control(
  "CONTROL · sin el filtro de sede, cualquier cuenta leería el arranque de otra tienda: la prueba lo detecta",
  `${MUTAR("retail.fn_conteo_arranque(uuid)", "where retail.fn_puede_operar_ubicacion(p_ubicacion_id)", "")}
${LECTURAS_AJENAS}`,
  ["t", "t", "NULL", "0"],
);

control(
  "CONTROL · si la recepción no renovara la firma de la misma persona en un día nuevo, cada paso sin nombre volvería a preguntar: la prueba lo detecta",
  `${MUTAR("retail.fn_firma_de_recepcion(uuid,uuid)", "or v_en is null or (v_en at time zone 'America/Lima')::date <> retail.fn_hoy_lima()", "or v_en is null")}
${MISMA_PERSONA_OTRO_DIA}`,
  ["SIN_ERROR", "SIN_ERROR", "cerrada/true", "t"],
);

control(
  "CONTROL · si el arranque no exigiera contar TODO (sin pendientes), un cierre parcial lo sería y lo consumiría: la prueba lo detecta",
  `${MUTAR("retail.fn_conteo_vale_como_arranque(uuid)", "or (i.cantidad_contada is null", "or (false")}
${PARCIAL}
select concat_ws(',', ${MOTIVOS_DEL_CONTEO}, (select es_arranque from retail.conteos where id = :'conteo'), ${ARRANQUE_POR_LUGAR});`,
  ["conteo:-1", "f", "alm=true/piso=true"],
);

control(
  "CONTROL · si lo aplicado sin contar valiera como contado, «Aplicar todos completos» gastaría el arranque y el siguiente conteo sería merma: la prueba lo detecta",
  `${MUTAR("retail.fn_conteo_vale_como_arranque(uuid)", "i.aplicada_sin_contar", "false")}
${TODO_APLICADO_Y_DESPUES_CONTADO}`,
  ["f", "alm=true/piso=true", "conteo_arranque:-1", "t"],
);

control(
  "CONTROL · si un conteo sin foto (de antes del rediseño) valiera, uno viejo de una línea ya habría gastado el arranque: la prueba lo detecta",
  `${MUTAR("retail.fn_conteo_puede_ser_arranque(uuid)", "and c.foto_en is not null", "")}
${CONTEO_VIEJO_DE_UNA_LINEA}`,
  ["alm=true/piso=true", "f"],
);

control(
  "CONTROL · si el arranque gastado lo dijera el estado y no la marca, reabrirlo y cancelarlo lo devolvería: la prueba lo detecta",
  `${MUTAR("retail.fn_conteo_arranque_pendiente(uuid,uuid,uuid,uuid)", "(c.es_arranque", "(false")}
${ARRANQUE_REABIERTO_Y_CANCELADO}`,
  ["alm=true/piso=false", "conteo:-1", "f"],
);

control(
  "CONTROL · si en el piso el arranque fuera solo de TODO el lugar (la primera versión), el primer conteo de A sería merma: la prueba lo detecta",
  `${MUTAR("retail.fn_conteo_puede_ser_arranque(uuid)", "or retail.fn_arranque_por_categoria(c.sububicacion_id)", "or false")}
${PISO_POR_CATEGORIA}`,
  ESPERA_PISO_POR_CATEGORIA,
);

control(
  "CONTROL · si el conteo de una categoría gastara el arranque de todas, arrancar A dejaría a B sin el suyo: la prueba lo detecta",
  `${MUTAR("retail.fn_conteo_arranque_pendiente(uuid,uuid,uuid,uuid)", "c.alcance_categoria_id = p_categoria_id", "c.alcance_categoria_id is not null")}
${PISO_POR_CATEGORIA}`,
  ESPERA_PISO_POR_CATEGORIA,
);

control(
  "CONTROL · si en el almacén una categoría pudiera ser de arranque, lo gastaría sin contar el almacén entero: la prueba lo detecta",
  `${MUTAR("retail.fn_conteo_puede_ser_arranque(uuid)", "or retail.fn_arranque_por_categoria(c.sububicacion_id)", "or true")}
${ALMACEN_SIN_CUADRE}`,
  ESPERA_ALMACEN,
);

control(
  "CONTROL · si el motivo se decidiera por conteo y no por línea, en el de todo el piso después de A el faltante de A tampoco sería merma: la prueba lo detecta",
  `${MUTAR("retail.cerrar_conteo(uuid,boolean)", "case when r.variante_id = any(v_de_arranque)", "case when cardinality(v_de_arranque) > 0")}
${TODO_EL_PISO_TRAS_A}`,
  ESPERA_TODO_EL_PISO_TRAS_A,
);

control(
  "CONTROL · si el cuadre no reiniciara el arranque, el primer conteo del almacén después del cuadre sería merma: la prueba lo detecta",
  `${MUTAR("retail.fn_conteo_arranque_pendiente(uuid,uuid,uuid,uuid)", "and c.created_at > coalesce((select retail.fn_ultimo_cuadre_piso(p_ubicacion_id)), '-infinity'::timestamptz)", "")}
${CUADRE_REINICIA}`,
  ESPERA_CUADRE,
);

control(
  "CONTROL · si el último cuadre no se buscara por sede, el cuadre de Lima reiniciaría el arranque de otra tienda: la prueba lo detecta",
  `${MUTAR("retail.fn_ultimo_cuadre_piso(uuid)", "where cp.ubicacion_id = p_ubicacion_id", "")}
${CUADRE_REINICIA}`,
  ESPERA_CUADRE,
);

control(
  "CONTROL · si aplicar todos completos no marcara las líneas, el historial diría 0 sin contar: la prueba lo detecta",
  `${MUTAR("retail.conteo_aplicar_completos(uuid,uuid[])", "aplicada_sin_contar = true", "aplicada_sin_contar = false")}
${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
${APLICAR("r", ":'v1', :'v2'")}
select concat_ws(',', :'r'::jsonb ->> 'aplicadas', (select sin_contar from retail.fn_conteos_resumen(:'u') where id = :'conteo'));`,
  ["2", "2"],
);

control(
  "CONTROL · si aplicar todos completos tomara también las «en reconteo», borraría la diferencia que alguien ya vio: la prueba lo detecta",
  `${MUTAR("retail.conteo_aplicar_completos(uuid,uuid[])", "and ci.contada_anterior is null\n       and coalesce(ci.cantidad_foto, 0) > 0", "and (coalesce(ci.cantidad_foto, 0) > 0 or ci.contada_anterior is not null)")}
${RECONTEO_Y_APLICAR}`,
  ["1", "NULL/2/false", "3/true", "en_reconteo"],
);

control(
  "CONTROL · sin el disparador que apaga la marca, contar a mano una línea aplicada la dejaría «sin contar»: la prueba lo detecta",
  `${MUTAR("retail.trg_conteo_items_sin_contar()", "new.aplicada_sin_contar := false;", "null;")}
${TIENDA_ARRANQUE}
select retail.abrir_conteo(:'u', :'piso') as conteo \\gset
${APLICAR("r1", ":'v2'")}
select retail.conteo_contar(:'conteo', :'v2', 3) as _c \\gset
select concat_ws(',', ${ITEM("v2", "cantidad_contada || '/' || aplicada_sin_contar")});`,
  ["3/false"],
);

// ---------------------------------------------------------------------------
function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\` y vuelve a intentar.`);
    process.exit(1);
  }

  let fallos = 0;
  for (const caso of CASOS) {
    const resultado = correr(caso.sql);
    // La última línea de salida es la fila de verificación: una sola columna con los valores unidos por comas.
    const ultima = resultado.ok ? (resultado.salida.split("\n").filter(Boolean).pop() ?? "") : "";
    const igual = resultado.ok && ultima === caso.esperado.join(",");

    if (caso.muerde) {
      // El control pasa cuando la versión mutada NO da el resultado bueno (o ni siquiera termina): la prueba muerde.
      if (igual) {
        fallos++;
        console.log(`✗ ${caso.nombre}\n    la mutación dio el MISMO resultado que la función buena: esta prueba no muerde`);
      } else {
        // Con `--detalle` se ve QUÉ dio la mutación: un control que «muerde» porque la mutación ni se aplicó no controla nada.
        const dio = resultado.ok ? ultima : `error: ${resultado.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? resultado.mensaje}`;
        console.log(`✓ ${caso.nombre}${DETALLE ? `\n    con la mutación salió: ${dio}` : ""}`);
      }
      continue;
    }

    if (!resultado.ok) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    se esperaba éxito, falló:\n    ${resultado.mensaje.trim().split("\n").filter((l) => !l.includes("NOTICE")).join("\n    ")}`);
      continue;
    }
    if (!igual) {
      fallos++;
      console.log(`✗ ${caso.nombre}\n    esperado: ${JSON.stringify(caso.esperado.join(","))}\n    salió:    ${JSON.stringify(ultima)}`);
    } else {
      console.log(`✓ ${caso.nombre}`);
    }
  }

  console.log(`\n${CASOS.length - fallos}/${CASOS.length} pruebas en verde.`);
  process.exit(fallos > 0 ? 1 : 0);
}

main();
