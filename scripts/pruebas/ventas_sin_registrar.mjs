#!/usr/bin/env node
/**
 * Pruebas de la limpieza de las ventas «sin registrar» (ADR-0328, actividad 5) contra el Postgres local — CAYLA V2.
 *
 * QUÉ PRUEBA
 *   B · `retail.fn_candidatas_por_regularizar` (20261004203000): por cada venta pendiente, solo las prendas del stock que pueden
 *       ser ella —misma categoría y talla, mismo color o de su familia, con stock DISPONIBLE en la sede de la venta (ni Cuarentena,
 *       ni apartadas, ni otra sede)—, con su piso y almacén libres y la PRIMERA ENTRADA de esa prenda a esa sede
 *       (la de esa sede, y sin contar el «ingreso_regularizado»); solo para quien puede operar la sede.
 *   D · Que contestar mal DESCUENTA DOS VECES: con la venta antes de la carga inicial, «ya estaba registrada» deja el stock una
 *       prenda por debajo de lo contado; con la venta después, «llegó nueva» deja una prenda fantasma. La respuesta que deduce la
 *       web (`lib/por-regularizar-candidatas.ts`: venta antes de la primera entrada ⇒ llegó nueva) es la que cuadra en los dos.
 *   C · Nadie regulariza su propia venta, salvo el líder firmando él mismo (20261004204000): ni con su cuenta, ni eligiéndose en
 *       la terminal, ni nombrando a otra persona desde su propia cuenta, ni elegida en el combo con la sesión de un líder abierta
 *       (R1); otra integrante sí; el líder sí, la suya; desde una terminal hay que elegir quién firma (la clave
 *       'regularizar_prenda' ya no está en `acciones_sin_responsable`).
 *   R · Lo que encontró la revisión adversarial: «ya estaba registrada» descuenta de lo DISPONIBLE (ni Cuarentena ni apartadas,
 *       R2/R3) y una prenda sin ningún movimiento en la sede no se regulariza: primero su carga inicial (R6).
 *   P · La migración 20261004204000 se aplica sobre el cuerpo ORIGINAL de `regularizar_prenda` (20260923162300, lo que producción
 *       tiene antes de pegar) y se puede volver a pegar; la sonda de solo lectura que se corre en producción antes de pegar
 *       encuentra cada ancla UNA vez. `node scripts/pruebas/ventas_sin_registrar.mjs --sonda` imprime esa sonda.
 *
 * CÓMO. Mismo patrón que `responsable_omitido.mjs`: cada caso en su transacción con ROLLBACK, como Felipe (líder) o Micaela
 * (integrante de Tienda Trujillo) con `request.jwt.claim(s)`. Las prendas son nuevas (`ZZ VSR …`), con su historia sembrada
 * con la hora fijada: así la primera entrada y la venta tienen el orden que cada caso necesita.
 *
 * USO
 *   pnpm pruebas:ventas-sin-registrar    → necesita el stack local (`npx supabase start`) con todas las migraciones
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const LUCIA_AUTH = "44444444-4444-4444-8444-0000000000c1"; // otra integrante de Trujillo, con su cuenta (se crea en el caso)
const LUCIA = "44444444-4444-4444-8444-0000000000c2"; // su persona
const T_VENTAS_AUTH = "44444444-4444-4444-8444-0000000000a1"; // la cuenta de la terminal de ventas de Trujillo
const ROSA = "44444444-4444-4444-8444-0000000000b1"; // integrante de Trujillo sin cuenta: firma desde la terminal
const CENTINELA = "22222222-2222-4222-8222-222222222222"; // «prenda sin registrar» en una venta

// La migración que parcha `regularizar_prenda` por ancla y el cuerpo original que parcha (lo que producción tiene antes de pegar).
const MIG_REGLAS = readFileSync(new URL("../../supabase/migrations/20261004204000_nadie_regulariza_su_propia_venta.sql", import.meta.url), "utf8");
const MIG_ORIGINAL = readFileSync(new URL("../../supabase/migrations/20260923162300_regularizar_prenda.sql", import.meta.url), "utf8");
/** Los textos ancla de cada `pg_temp.reemplazar_unico(…)` de la migración, tal cual (con su sangría y su salto de línea). */
const ANCLAS = [...MIG_REGLAS.matchAll(/reemplazar_unico\(\s*'[^']+',\s*\$v\$([\s\S]*?)\$v\$/g)].map((m) => m[1]);
/**
 * La sonda de SOLO LECTURA para producción: cuántas veces aparece cada ancla en el cuerpo vivo. Todas tienen que dar 1; si una da
 * 0 o más, el cuerpo vivo es otro y la migración abortaría (sin tocar nada): hay que regenerar el reemplazo desde la definición
 * real. Ningún texto trae `select … into` (ADR-0288: el SQL Editor lo confundiría con un SELECT INTO).
 */
function sonda() {
  const filas = ANCLAS.map((t, i) => `(${i + 1}, $a${i + 1}$${t}$a${i + 1}$)`).join(",\n       ");
  return `-- Sonda de solo lectura (20261004204000): cada ancla tiene que aparecer UNA vez en el cuerpo vivo de regularizar_prenda.
select a.n as ancla, (length(f.d) - length(replace(f.d, a.t, ''))) / length(a.t) as veces
  from (select pg_get_functiondef('retail.regularizar_prenda(uuid, uuid, text)'::regprocedure) as d) f,
       (values ${filas}) as a(n, t)
 order by a.n;`;
}
if (process.argv.includes("--sonda")) {
  console.log(sonda());
  process.exit(0);
}

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// Todo lo que cada caso necesita: las sedes, sus lugares, una categoría con talla y color, cajas abiertas y las piezas para
// sembrar prendas con historia fechada. Corre como Felipe (líder): crea productos y abre cajas.
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${como(FELIPE)}
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return v_estado || '|' || coalesce(nullif(v_hint, ''), v_msg);
end;
$f$;
-- Lo mismo, pero devuelve el MENSAJE (lo que lee la persona), no el hint.
create function pg_temp.intento_mensaje(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$f$;
create temp table ids as
  select (select id from retail.ubicaciones where nombre = 'Tienda Trujillo') as tru,
         (select id from retail.ubicaciones where nombre = 'Tienda Lima') as lima,
         (select id from retail.categorias where prefijo = 'CMS') as cat,
         (select id from retail.categorias where prefijo = 'PAN') as otra_cat,
         (select id from retail.tallas where valor = 'M' and estado = 'aprobado') as talla_m,
         (select id from retail.tallas where valor = 'L' and estado = 'aprobado') as talla_l,
         (select codigo from retail.colores where activo and familia_color is distinct from 'neutro' order by codigo limit 1) as otro_color,
         (select id from public.personas where auth_user_id = '${FELIPE}') as felipe,
         (select id from public.personas where auth_user_id = '${MICAELA}') as micaela;
grant select on ids to authenticated;
-- Cada sede de tienda con su piso, su almacén y su Cuarentena.
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select u, n, t from ids, lateral (values (tru), (lima)) x(u),
         lateral (values ('Piso de venta', 'piso_venta'), ('Almacén de tienda', 'almacen_tienda'), ('Cuarentena', 'cuarentena')) y(n, t)
  where not exists (select 1 from retail.sububicaciones s where s.ubicacion_id = x.u and s.tipo = y.t);
create function pg_temp.sub(u uuid, t text) returns uuid language sql as $f$
  select id from retail.sububicaciones where ubicacion_id = u and tipo = t order by created_at limit 1
$f$;
-- Cajas abiertas en las dos tiendas (registrar_venta las exige).
select count(*) from (select retail.cerrar_caja(c.id, 0) from retail.cajas c, ids where c.ubicacion_id in (ids.tru, ids.lima) and c.estado = 'abierta') x \\g /dev/null
select retail.abrir_caja(tru, 100, 'prueba automatizada') from ids \\g /dev/null
select retail.abrir_caja(lima, 100, 'prueba automatizada') from ids \\g /dev/null
-- Una prenda nueva (modelo propio): categoría, talla, color y precio.
create function pg_temp.prenda(p_nombre text, p_talla uuid, p_color text, p_cat uuid default null, p_precio numeric default 80) returns uuid language plpgsql as $f$
declare p uuid; v uuid;
begin
  insert into retail.productos (referencia, marca_id, proveedor_id, categoria_id)
    select 'ZZ VSR ' || p_nombre, mp.marca_id, mp.proveedor_id, coalesce(p_cat, (select cat from ids))
      from retail.marca_proveedores mp order by mp.created_at limit 1
    returning id into p;
  insert into retail.variantes (producto_id, sku, codigo, precio, costo, color_codigo, talla_id)
    values (p, 'ZZ-VSR-' || p_nombre, 'ZZ-VSR-' || p_nombre, p_precio, 30, p_color, p_talla)
    returning id into v;
  return v;
end $f$;
-- Una fila del libro con la hora fijada, aplicada al stock en el acto.
create function pg_temp.mov(v uuid, u uuid, sub uuid, p_tipo text, n int, p_motivo text, cuando timestamptz, sub_destino uuid default null)
returns uuid language plpgsql as $f$
declare m uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id,
                                  tipo, cantidad, motivo, created_at)
  values (v, u, sub, case when p_tipo = 'traslado' then u end, sub_destino, p_tipo, n, p_motivo, cuando)
  returning id into m;
  perform retail.fn_aplicar_movimiento(m);
  return m;
end $f$;
-- La carga inicial de una prenda en una sede, al almacén, con su hora.
create function pg_temp.carga(v uuid, u uuid, n int, cuando timestamptz) returns uuid language sql as $f$
  select pg_temp.mov(v, u, pg_temp.sub(u, 'almacen_tienda'), 'entrada', n, 'carga_inicial', cuando)
$f$;
-- Una venta «sin registrar» en la sede, con lo que anotó la caja, fechada a 'cuando'. Devuelve la fila de la cola.
create function pg_temp.vender_libre(u uuid, p_talla uuid, p_color text, cuando timestamptz, p_precio numeric default 80,
                                     p_descripcion text default 'Blusa negra sin etiqueta') returns uuid language plpgsql as $f$
declare v_venta uuid; v_pp uuid;
begin
  v_venta := retail.registrar_venta(u,
    jsonb_build_array(jsonb_build_object('variante_id', '${CENTINELA}', 'cantidad', 1, 'precio_unitario', p_precio,
      'descuento_unitario', 0, 'descripcion_libre', p_descripcion, 'categoria_id', (select cat from ids),
      'talla_id', p_talla, 'color_codigo', p_color)),
    jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', p_precio)),
    null, gen_random_uuid());
  select p.id into v_pp from retail.prendas_por_regularizar p join retail.venta_items vi on vi.id = p.venta_item_id
   where vi.venta_id = v_venta;
  update retail.prendas_por_regularizar set vendido_en = cuando where id = v_pp;
  return v_pp;
end $f$;
create function pg_temp.stock(v uuid, u uuid) returns integer language sql as $f$
  select coalesce(sum(cantidad), 0)::integer from retail.stock where variante_id = v and ubicacion_id = u
$f$;
-- Las candidatas de una venta, solo de las prendas de la prueba, en una línea: «nombre:color_exacto».
create function pg_temp.candidatas(p_pp uuid) returns text language sql as $f$
  select coalesce(string_agg(replace(v.sku, 'ZZ-VSR-', '') || ':' || c.color_exacto, ',' order by v.sku), '—')
    from retail.fn_candidatas_por_regularizar() c
    join retail.variantes v on v.id = c.variante_id
   where c.prenda_id = p_pp and v.sku like 'ZZ-VSR-%'
$f$;
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida.split("\n").pop() : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

// La siembra de B: una venta de TRU anotada «Camisas y Blusas · M · Negro» hace un día, y prendas que calzan y que no.
const SIEMBRA_B = `
select pg_temp.prenda('A-NEGRA-M', talla_m, 'NEG') as va from ids \\gset
select pg_temp.carga(:'va', tru, 3, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.mov(:'va', tru, pg_temp.sub(tru, 'almacen_tienda'), 'traslado', 1, 'movimiento_interno', now() - interval '4 days', pg_temp.sub(tru, 'piso_venta')) from ids \\g /dev/null
-- Familia «neutro», a la vista parecido (Gris antracita) y a la vista opuesto (Blanco): la base trae los dos; la web mide.
select pg_temp.prenda('B-ANTRACITA-M', talla_m, 'GRA') as vb from ids \\gset
select pg_temp.carga(:'vb', tru, 2, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.prenda('W-BLANCA-M', talla_m, 'BLA') as vw from ids \\gset
select pg_temp.carga(:'vw', tru, 1, now() - interval '5 days') from ids \\g /dev/null
-- No calzan: otra talla, otro color (otra familia), otra categoría.
select pg_temp.prenda('C-NEGRA-L', talla_l, 'NEG') as vc from ids \\gset
select pg_temp.carga(:'vc', tru, 1, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.prenda('D-OTRO-COLOR-M', talla_m, otro_color) as vd from ids \\gset
select pg_temp.carga(:'vd', tru, 1, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.prenda('E-PANTALON-M', talla_m, 'NEG', otra_cat) as ve from ids \\gset
select pg_temp.carga(:'ve', tru, 1, now() - interval '5 days') from ids \\g /dev/null
-- No se pueden vender: en Cuarentena, apartada entera, en otra sede. (Una talla archivada no puede tener stock: la base no deja retirarla con prendas.)
select pg_temp.prenda('F-CUARENTENA-M', talla_m, 'NEG') as vf from ids \\gset
select pg_temp.mov(:'vf', tru, pg_temp.sub(tru, 'cuarentena'), 'entrada', 1, 'cambio', now() - interval '5 days') from ids \\g /dev/null
select pg_temp.prenda('H-APARTADA-M', talla_m, 'NEG') as vh from ids \\gset
select pg_temp.carga(:'vh', tru, 1, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.mov(:'vh', tru, pg_temp.sub(tru, 'almacen_tienda'), 'apartado', 1, 'apartado', now() - interval '4 days') from ids \\g /dev/null
select pg_temp.prenda('G-EN-LIMA-M', talla_m, 'NEG') as vg from ids \\gset
select pg_temp.carga(:'vg', lima, 2, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.vender_libre(tru, talla_m, 'NEG', now() - interval '1 day') as pp from ids \\gset
`;

// ---------------- B · las candidatas ----------------
caso(
  "B1 · solo las que pueden ser la venta: misma categoría y talla, color exacto o de su familia, con stock libre en esa sede",
  `${SIEMBRA_B}select pg_temp.candidatas(:'pp');`,
  "A-NEGRA-M:true,B-ANTRACITA-M:false,W-BLANCA-M:false",
);
caso(
  "B2 · trae el piso y el almacén libres, y el hex de los dos colores para que la web mida si se confunden",
  `${SIEMBRA_B}select c.piso_libre || '/' || c.almacen_libre || '/' || c.disponible || '/' || (c.color_hex is not null) || '/' || (c.color_hex_anotado is not null)
     from retail.fn_candidatas_por_regularizar() c where c.prenda_id = :'pp' and c.variante_id = :'va';`,
  "1/2/3/true/true",
);
caso(
  "B3 · la primera entrada es la carga inicial de ESA sede (no la de otra sede ni la bajada al piso)",
  `${SIEMBRA_B}select pg_temp.carga(:'va', lima, 4, now() - interval '20 days') from ids \\g /dev/null
select (c.primera_entrada = now() - interval '5 days') || '/' || c.primera_entrada_motivo
     from retail.fn_candidatas_por_regularizar() c where c.prenda_id = :'pp' and c.variante_id = :'va';`,
  "true/carga_inicial",
);
caso(
  "B4 · el «ingreso_regularizado» de una venta ya regularizada no cuenta como que la sede la tenía: manda la recepción",
  // El par entrada+venta de una regularización «llegó nueva» hecha ANTES de la regla R6 (hoy una prenda sin cargar en la sede ya
  // no se regulariza): se siembra directo en el libro, como quedó en los datos de antes.
  `select pg_temp.prenda('J-NEGRA-M', talla_m, 'NEG') as vj from ids \\gset
select pg_temp.mov(:'vj', tru, pg_temp.sub(tru, 'piso_venta'), 'entrada', 1, 'ingreso_regularizado', now() - interval '3 days') from ids \\g /dev/null
select pg_temp.mov(:'vj', tru, pg_temp.sub(tru, 'piso_venta'), 'salida', 1, 'venta', now() - interval '3 days') from ids \\g /dev/null
select pg_temp.mov(:'vj', tru, pg_temp.sub(tru, 'almacen_tienda'), 'entrada', 2, 'recepcion', now() + interval '1 hour') from ids \\g /dev/null
select pg_temp.vender_libre(tru, talla_m, 'NEG', now() - interval '1 day') as pp from ids \\gset
select (c.primera_entrada = now() + interval '1 hour') || '/' || c.primera_entrada_motivo
     from retail.fn_candidatas_por_regularizar() c where c.prenda_id = :'pp' and c.variante_id = :'vj';`,
  "true/recepcion",
);
caso(
  "B5 · una venta ya regularizada deja de tener candidatas (solo las pendientes)",
  `${SIEMBRA_B}select retail.regularizar_prenda(:'pp', :'va', 'ya_registrada') \\g /dev/null
select pg_temp.candidatas(:'pp');`,
  "—",
);
caso(
  "B6 · una integrante ve las de SU sede y no las de otra; el líder, las dos",
  `${SIEMBRA_B}select pg_temp.vender_libre(lima, talla_m, 'NEG', now() - interval '1 day') as pp_lima from ids \\gset
select (select count(*) from retail.fn_candidatas_por_regularizar() where prenda_id = :'pp_lima') as lider_lima \\gset
${como(MICAELA)}
select (select count(*) > 0 from retail.fn_candidatas_por_regularizar() where prenda_id = :'pp') || '/' ||
       (select count(*) from retail.fn_candidatas_por_regularizar() where prenda_id = :'pp_lima') || '/' ||
       (select count(*) from retail.fn_candidatas_por_regularizar((select tru from ids)) where prenda_id = :'pp_lima') || '/' ||
       (:lider_lima > 0);`,
  "true/0/0/true",
);
caso(
  "B7 · sin sesión no ve nada, y la API anónima ni siquiera la puede llamar",
  `${SIEMBRA_B}set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';
select (select count(*) from retail.fn_candidatas_por_regularizar()) || ',' ||
       pg_temp.intento('set local role anon; select * from retail.fn_candidatas_por_regularizar()');`,
  (s) => s.startsWith("0,42501|"),
);

// ---------------- D · contestar mal descuenta dos veces ----------------
// La sala: la prenda K se vendió SIN etiqueta hace 3 días; ayer se hizo su carga inicial y se contaron 3 (la vendida ya no estaba).
const VENTA_ANTES = `
select pg_temp.prenda('K-NEGRA-M', talla_m, 'NEG') as vk from ids \\gset
select pg_temp.vender_libre(tru, talla_m, 'NEG', now() - interval '3 days') as pp from ids \\gset
select pg_temp.carga(:'vk', tru, 3, now() - interval '1 day') from ids \\g /dev/null
select (c.primera_entrada > p.vendido_en)::text as venta_antes from retail.fn_candidatas_por_regularizar() c
  join retail.prendas_por_regularizar p on p.id = c.prenda_id where c.prenda_id = :'pp' and c.variante_id = :'vk' \\gset
`;
// La prenda L tuvo su carga inicial hace 5 días (3 contadas); ayer una se vendió sin etiqueta: en la percha quedan 2.
const VENTA_DESPUES = `
select pg_temp.prenda('L-NEGRA-M', talla_m, 'NEG') as vl from ids \\gset
select pg_temp.carga(:'vl', tru, 3, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.vender_libre(tru, talla_m, 'NEG', now() - interval '1 day') as pp from ids \\gset
select (c.primera_entrada > p.vendido_en)::text as venta_antes from retail.fn_candidatas_por_regularizar() c
  join retail.prendas_por_regularizar p on p.id = c.prenda_id where c.prenda_id = :'pp' and c.variante_id = :'vl' \\gset
`;
caso(
  "D1 · vendida ANTES de la carga → la sugerida es «llegó nueva» y deja el stock en lo contado (3)",
  `${VENTA_ANTES}select retail.regularizar_prenda(:'pp', :'vk', 'llego_nueva') \\g /dev/null
select :'venta_antes' || '/' || pg_temp.stock(:'vk', tru) from ids;`,
  "true/3",
);
caso(
  "D2 · …y contestar «ya estaba registrada» la descuenta OTRA vez: 2 en el sistema, 3 en la percha",
  `${VENTA_ANTES}select retail.regularizar_prenda(:'pp', :'vk', 'ya_registrada') \\g /dev/null
select :'venta_antes' || '/' || pg_temp.stock(:'vk', tru) from ids;`,
  "true/2",
);
caso(
  "D3 · vendida DESPUÉS de la carga → la sugerida es «ya estaba registrada» y deja lo que queda en la percha (2)",
  `${VENTA_DESPUES}select retail.regularizar_prenda(:'pp', :'vl', 'ya_registrada') \\g /dev/null
select :'venta_antes' || '/' || pg_temp.stock(:'vl', tru) from ids;`,
  "false/2",
);
caso(
  "D4 · …y contestar «llegó nueva» deja una prenda fantasma: 3 en el sistema, 2 en la percha",
  `${VENTA_DESPUES}select retail.regularizar_prenda(:'pp', :'vl', 'llego_nueva') \\g /dev/null
select :'venta_antes' || '/' || pg_temp.stock(:'vl', tru) from ids;`,
  "false/3",
);

// ---------------- C · nadie regulariza su propia venta, salvo el líder ----------------
// Lucía (con cuenta) y Rosa (sin cuenta) son de Trujillo; la terminal de ventas de Trujillo; Rosa, Lucía y Micaela con la
// jornada abierta hoy (presentes para el combo «Responsable»). Una prenda de la tienda con 2 unidades para descontar.
const EQUIPO = `
create table if not exists public.marcajes (persona_id uuid, sede_id uuid, tipo text, timestamp_marca timestamptz, fecha_jornada date, anulada_at timestamptz);
create table if not exists public.jornadas (persona_id uuid, sede_id uuid, fecha date, estado text);
delete from public.marcajes;
delete from public.jornadas;
insert into auth.users (id, aud, role, email) values ('${LUCIA_AUTH}', 'authenticated', 'authenticated', 'lucia-vsr@prueba.local'),
  ('${T_VENTAS_AUTH}', 'authenticated', 'authenticated', 'terminal-vsr@prueba.local');
insert into public.personas (id, nombres, apellidos, estado, sede_base_id, auth_user_id)
  select '${LUCIA}', 'Lucía', 'Prueba', 'activo', u.sede_dynamic_id, '${LUCIA_AUTH}' from retail.ubicaciones u, ids where u.id = ids.tru;
insert into public.personas (id, nombres, apellidos, estado, sede_base_id)
  select '${ROSA}', 'Rosa', 'Prueba', 'activo', u.sede_dynamic_id from retail.ubicaciones u, ids where u.id = ids.tru;
insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id, rol_id)
  select x.p, 'colaborador', ids.tru, c.rol_id from ids, retail.colaboradores c, (values ('${LUCIA}'::uuid), ('${ROSA}'::uuid)) x(p)
   where c.persona_id = ids.micaela;
insert into retail.terminales (ubicacion_id, nombre, rol_id, auth_user_id)
  select tru, 'Terminal Ventas TRU (prueba)', retail.fn_rol_por_clave('terminal_ventas'), '${T_VENTAS_AUTH}'::uuid from ids;
insert into public.jornadas (persona_id, sede_id, fecha, estado)
  select x.p, u.sede_dynamic_id, (now() at time zone 'America/Lima')::date, 'abierta'
    from ids join retail.ubicaciones u on u.id = ids.tru cross join lateral (values ('${LUCIA}'::uuid), ('${ROSA}'::uuid), (ids.micaela)) x(p);
select pg_temp.prenda('M-NEGRA-M', talla_m, 'NEG') as vm from ids \\gset
select pg_temp.carga(:'vm', tru, 2, now() - interval '5 days') from ids \\g /dev/null
`;
const conEncabezados = (obj) => `select set_config('request.headers', '${JSON.stringify(obj)}', true) \\g /dev/null\n`;
// Micaela vende (con su cuenta) una prenda sin registrar: :pp es suya.
const VENDE_MICAELA = `${como(MICAELA)}select pg_temp.vender_libre(tru, talla_m, 'NEG', now() - interval '1 day') as pp from ids \\gset\n`;
const regulariza = `select pg_temp.intento(format('select retail.regularizar_prenda(%L, %L, %L)', :'pp', :'vm', 'ya_registrada'));`;
const firmo = `select coalesce((select regularizado_por::text from retail.prendas_por_regularizar where id = :'pp'), 'NADIE');`;

caso(
  "C1 · Micaela, con su cuenta, no regulariza la prenda que ella vendió",
  `${EQUIPO}${VENDE_MICAELA}${regulariza}`,
  "42501|regularizar_propia_venta",
);
caso(
  "C2 · otra integrante de la tienda (Lucía, con su cuenta) sí la regulariza, y firma ella",
  `${EQUIPO}${VENDE_MICAELA}${como(LUCIA_AUTH)}${regulariza}\n${firmo}`,
  LUCIA,
);
caso(
  "C3 · el líder sí regulariza su propia venta",
  `${EQUIPO}select pg_temp.vender_libre(tru, talla_m, 'NEG', now() - interval '1 day') as pp from ids \\gset
select (vendido_por = (select felipe from ids))::text as suya from retail.prendas_por_regularizar where id = :'pp' \\gset
select :'suya' || '/' || pg_temp.intento(format('select retail.regularizar_prenda(%L, %L, %L)', :'pp', :'vm', 'ya_registrada'));`,
  "true/SIN_ERROR",
);
caso(
  "C4 · desde la terminal, eligiéndose a sí misma en el combo, Micaela tampoco puede",
  `${EQUIPO}${VENDE_MICAELA}${como(T_VENTAS_AUTH)}select set_config('request.headers', json_build_object('x-responsable', micaela)::text, true) from ids \\g /dev/null
${regulariza}`,
  "42501|regularizar_propia_venta",
);
caso(
  "C5 · desde la terminal, con Rosa (presente) en el combo, se regulariza y queda firmado por Rosa",
  `${EQUIPO}${VENDE_MICAELA}${como(T_VENTAS_AUTH)}${conEncabezados({ "x-responsable": ROSA })}${regulariza}\n${firmo}`,
  ROSA,
);
caso(
  "C6 · desde la terminal ya no se regulariza «sin responsable»: la clave dejó de estar soltada",
  `${EQUIPO}${VENDE_MICAELA}${como(T_VENTAS_AUTH)}${conEncabezados({ "x-responsable-omitido": "regularizar_prenda" })}${regulariza}`,
  "42501|responsable_requerido",
);
caso(
  "C7 · con su propia cuenta, nombrar a Lucía en el combo no le sirve a Micaela: la venta sigue siendo suya",
  `${EQUIPO}${VENDE_MICAELA}insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;
select set_config('request.headers', json_build_object('x-responsable', '${LUCIA}', 'x-ubicacion', tru)::text, true) from ids \\g /dev/null
select (retail.fn_actor_persona_id(true) = '${LUCIA}'::uuid)::text || '/' || ${regulariza.slice(7, -1)};`,
  "true/42501|regularizar_propia_venta",
);
caso(
  "C8 · una venta sin vendedora registrada (no hay con quién comparar) la regulariza cualquiera de la tienda",
  `${EQUIPO}${VENDE_MICAELA}update retail.prendas_por_regularizar set vendido_por = null where id = :'pp';
${regulariza}`,
  "SIN_ERROR",
);
caso(
  "C9 · 'regularizar_prenda' ya no está entre las acciones sin responsable",
  `select count(*) from retail.acciones_sin_responsable where clave = 'regularizar_prenda';`,
  "0",
);
caso(
  "C11 · si alguien vuelve a pegar 20260929230000 (la clave vuelve a la lista), la terminal igual tiene que elegir quién firma",
  `${EQUIPO}${VENDE_MICAELA}insert into retail.acciones_sin_responsable (clave, descripcion) values ('regularizar_prenda', 'Regularizar una prenda por regularizar')
  on conflict (clave) do nothing;
${como(T_VENTAS_AUTH)}${conEncabezados({ "x-responsable-omitido": "regularizar_prenda" })}select (retail.fn_actor_persona_id() is null)::text || '/' || ${"select pg_temp.intento(format('select retail.regularizar_prenda(%L, %L, %L)', :'pp', :'vm', 'ya_registrada'));".slice(7, -1)};`,
  "true/42501|responsable_requerido",
);
// R1 (revisión adversarial): la excepción del líder es el líder FIRMANDO ÉL MISMO, no la cuenta. Las líderes de equipo cobran
// en caja con su cuenta (15-COMO-OPERA-CAYLA R-23): con esa sesión abierta, la asesora que vendió se elegía en el combo.
const EXIGE_RESPONSABLE = `insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', true)
  on conflict (id) do update set exige_responsable = true;\n`;
caso(
  "C12 · R1 · con la cuenta de un líder abierta, Micaela (la que vendió) elegida en el combo NO regulariza su propia venta",
  `${EQUIPO}${VENDE_MICAELA}${como(FELIPE)}${EXIGE_RESPONSABLE}select set_config('request.headers', json_build_object('x-responsable', micaela, 'x-ubicacion', tru)::text, true) from ids \\g /dev/null
select (retail.fn_actor_persona_id(true) = (select micaela from ids))::text || '/' || ${regulariza.slice(7, -1)} || '/' ||
       (select estado from retail.prendas_por_regularizar where id = :'pp');`,
  "true/42501|regularizar_propia_venta/pendiente",
);
caso(
  "C13 · el líder que vendió, desde su cuenta, sí puede nombrar a Lucía como responsable (y firma ella)",
  `${EQUIPO}select pg_temp.vender_libre(tru, talla_m, 'NEG', now() - interval '1 day') as pp from ids \\gset
${EXIGE_RESPONSABLE}select set_config('request.headers', json_build_object('x-responsable', '${LUCIA}', 'x-ubicacion', tru)::text, true) from ids \\g /dev/null
${regulariza}
${firmo}`,
  LUCIA,
);
caso(
  "C14 · desde la terminal, elegir el nombre del líder que vendió (presente) no presta la excepción",
  `${EQUIPO}insert into public.jornadas (persona_id, sede_id, fecha, estado)
  select ids.felipe, u.sede_dynamic_id, (now() at time zone 'America/Lima')::date, 'abierta' from ids join retail.ubicaciones u on u.id = ids.tru;
select pg_temp.vender_libre(tru, talla_m, 'NEG', now() - interval '1 day') as pp from ids \\gset
${como(T_VENTAS_AUTH)}select set_config('request.headers', json_build_object('x-responsable', felipe)::text, true) from ids \\g /dev/null
select (retail.fn_actor_persona_id(true) = (select felipe from ids))::text || '/' || ${regulariza.slice(7, -1)};`,
  "true/42501|regularizar_propia_venta",
);
caso(
  "C10 · lo de siempre sigue: la segunda regularización de la misma venta se rechaza",
  `${EQUIPO}${VENDE_MICAELA}${como(LUCIA_AUTH)}${regulariza}\n${regulariza}`,
  (s) => s.includes("prenda_ya_regularizada") || s.endsWith("ya la regularizó, o la venta se anuló"),
);

// ---------------- R · lo que encontró la revisión adversarial ----------------
// Micaela vende; Lucía (otra integrante, con su cuenta) regulariza con la respuesta que se pida. :pp es la venta.
// Es una EXPRESIÓN (sin `select` ni `;`): cada caso la pone en su propia sentencia, porque lo que la regularización escribe no lo
// ve otra parte de la MISMA sentencia (y un `;` seguido de `\g` volvería a correr la consulta anterior).
const regularizaComo = (variable, forma) =>
  `pg_temp.intento(format('select retail.regularizar_prenda(%L, %L, %L)', :'pp', :'${variable}', '${forma}'))`;
const dondeQueda = (variable) =>
  `(select string_agg(coalesce(sb.tipo, 'sin_lugar') || '=' || s.cantidad || '/' || s.cantidad_apartada, ',' order by sb.tipo)
     from retail.stock s left join retail.sububicaciones sb on sb.id = s.sububicacion_id
    where s.variante_id = :'${variable}' and s.ubicacion_id = (select tru from ids))`;
caso(
  "R2 · candidata con 1 libre en el almacén y 1 en Cuarentena: «ya estaba registrada» descuenta del almacén, no de Cuarentena",
  `${EQUIPO}select pg_temp.prenda('Q-CUAR-M', talla_m, 'NEG') as vq from ids \\gset
select pg_temp.mov(:'vq', tru, pg_temp.sub(tru, 'cuarentena'), 'entrada', 1, 'cambio', now() - interval '6 days') from ids \\g /dev/null
select pg_temp.carga(:'vq', tru, 1, now() - interval '5 days') from ids \\g /dev/null
${VENDE_MICAELA}
select (select c.disponible || '/' || c.almacen_libre from retail.fn_candidatas_por_regularizar() c where c.prenda_id = :'pp' and c.variante_id = :'vq') as cand \\gset
${como(LUCIA_AUTH)}select ${regularizaComo("vq", "ya_registrada")} as r \\gset
select :'cand' || ' → ' || :'r' || ' → ' || ${dondeQueda("vq")};`,
  "1/1 → SIN_ERROR → almacen_tienda=0/0,cuarentena=1/0",
);
caso(
  "R3 · la del piso apartada para otro cliente y 1 libre en el almacén: descuenta del almacén y la apartada sigue apartada",
  `${EQUIPO}select pg_temp.prenda('P-APART-M', talla_m, 'NEG') as vp from ids \\gset
select pg_temp.carga(:'vp', tru, 2, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.mov(:'vp', tru, pg_temp.sub(tru, 'almacen_tienda'), 'traslado', 1, 'movimiento_interno', now() - interval '4 days', pg_temp.sub(tru, 'piso_venta')) from ids \\g /dev/null
select pg_temp.mov(:'vp', tru, pg_temp.sub(tru, 'piso_venta'), 'apartado', 1, 'apartado', now() - interval '3 days') from ids \\g /dev/null
${VENDE_MICAELA}
select (select c.disponible || '/' || c.piso_libre || '/' || c.almacen_libre from retail.fn_candidatas_por_regularizar() c where c.prenda_id = :'pp' and c.variante_id = :'vp') as cand \\gset
${como(LUCIA_AUTH)}select ${regularizaComo("vp", "ya_registrada")} as r \\gset
select :'cand' || ' → ' || :'r' || ' → ' || ${dondeQueda("vp")};`,
  "1/0/1 → SIN_ERROR → almacen_tienda=0/0,piso_venta=1/1",
);
caso(
  "R3b · con el piso libre y el almacén libre, sigue saliendo del piso (lo de siempre)",
  `${EQUIPO}select pg_temp.prenda('P-PISO-M', talla_m, 'NEG') as vp from ids \\gset
select pg_temp.carga(:'vp', tru, 2, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.mov(:'vp', tru, pg_temp.sub(tru, 'almacen_tienda'), 'traslado', 1, 'movimiento_interno', now() - interval '4 days', pg_temp.sub(tru, 'piso_venta')) from ids \\g /dev/null
${VENDE_MICAELA}${como(LUCIA_AUTH)}select ${regularizaComo("vp", "ya_registrada")} as r \\gset
select :'r' || ' → ' || ${dondeQueda("vp")};`,
  "SIN_ERROR → almacen_tienda=1/0,piso_venta=0/0",
);
caso(
  "R3c · si lo único que hay está apartado o en Cuarentena, «ya estaba registrada» dice que no hay de dónde descontar",
  `${EQUIPO}select pg_temp.prenda('P-NADA-LIBRE-M', talla_m, 'NEG') as vp from ids \\gset
select pg_temp.carga(:'vp', tru, 1, now() - interval '5 days') from ids \\g /dev/null
select pg_temp.mov(:'vp', tru, pg_temp.sub(tru, 'almacen_tienda'), 'apartado', 1, 'apartado', now() - interval '4 days') from ids \\g /dev/null
${VENDE_MICAELA}${como(LUCIA_AUTH)}select ${regularizaComo("vp", "ya_registrada")};`,
  (s) => s.startsWith("P0001|") && s.includes("no tiene stock"),
);
caso(
  "R3d · si lo único que hay está en Cuarentena, tampoco: no intenta sacarla de ahí (dice que no hay unidades libres)",
  `${EQUIPO}select pg_temp.prenda('P-SOLO-CUAR-M', talla_m, 'NEG') as vp from ids \\gset
select pg_temp.mov(:'vp', tru, pg_temp.sub(tru, 'cuarentena'), 'entrada', 1, 'cambio', now() - interval '5 days') from ids \\g /dev/null
${VENDE_MICAELA}${como(LUCIA_AUTH)}select pg_temp.intento_mensaje(format('select retail.regularizar_prenda(%L, %L, %L)', :'pp', :'vp', 'ya_registrada'));`,
  "prenda_sin_stock_para_descontar",
);
caso(
  "R6 · una prenda SIN ningún movimiento en la sede no se regulariza con ninguna respuesta, y su carga inicial sigue posible",
  `${EQUIPO}select pg_temp.prenda('N-SIN-CARGAR-M', talla_m, 'NEG') as vn from ids \\gset
${VENDE_MICAELA}${como(LUCIA_AUTH)}
select ${regularizaComo("vn", "llego_nueva")} as r1 \\gset
select ${regularizaComo("vn", "ya_registrada")} as r2 \\gset
select :'r1' || ' / ' || :'r2' || ' / ' || (select count(*) from retail.movimientos where variante_id = :'vn') || ' / ' ||
       coalesce(retail.fn_prenda_cargada_en_sede(:'vn', (select tru from ids))::text, 'null');`,
  "P0001|prenda_sin_cargar_en_sede / P0001|prenda_sin_cargar_en_sede / 0 / false",
);
caso(
  "R6b · el mensaje nombra la sede y dice qué hacer",
  `${EQUIPO}select pg_temp.prenda('N-SIN-CARGAR-M', talla_m, 'NEG') as vn from ids \\gset
${VENDE_MICAELA}${como(LUCIA_AUTH)}
select pg_temp.intento_mensaje(format('select retail.regularizar_prenda(%L, %L, %L)', :'pp', :'vn', 'llego_nueva'));`,
  (s) => s.startsWith("Esta prenda todavía no está cargada en Tienda Trujillo: primero cárgala con su stock inicial"),
);
caso(
  "R6c · cargada su carga inicial (sin la vendida), ya se regulariza como «llegó nueva» y el stock queda en lo contado",
  `${EQUIPO}select pg_temp.prenda('N-SIN-CARGAR-M', talla_m, 'NEG') as vn from ids \\gset
${VENDE_MICAELA}
select pg_temp.carga(:'vn', tru, 2, now()) from ids \\g /dev/null
${como(LUCIA_AUTH)}select ${regularizaComo("vn", "llego_nueva")} as r \\gset
select :'r' || '/' || retail.fn_prenda_cargada_en_sede(:'vn', tru)::text || '/' || pg_temp.stock(:'vn', tru) from ids;`,
  "SIN_ERROR/true/2",
);
caso(
  "R6d · una prenda que solo llegó por un traslado de otra sede sí cuenta como cargada",
  `${EQUIPO}select pg_temp.prenda('T-TRASLADO-M', talla_m, 'NEG') as vt from ids \\gset
select pg_temp.carga(:'vt', lima, 2, now() - interval '5 days') from ids \\g /dev/null
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  select :'vt', lima, pg_temp.sub(lima, 'almacen_tienda'), tru, pg_temp.sub(tru, 'almacen_tienda'), 'traslado', 1, 'transferencia', now() - interval '4 days' from ids;
select (select count(*) from retail.movimientos where variante_id = :'vt' and ubicacion_id = (select tru from ids))::text || '/' ||
       retail.fn_prenda_cargada_en_sede(:'vt', tru)::text || '/' || retail.fn_prenda_cargada_en_sede(:'vt', lima)::text from ids;`,
  "0/true/true",
);
caso(
  "R6e · fn_prenda_cargada_en_sede no dice nada de una sede que la cuenta no opera (Micaela, de Trujillo, pregunta por Lima)",
  `${EQUIPO}select pg_temp.prenda('T-LIMA-M', talla_m, 'NEG') as vt from ids \\gset
select pg_temp.carga(:'vt', lima, 1, now() - interval '5 days') from ids \\g /dev/null
${como(MICAELA)}select coalesce(retail.fn_prenda_cargada_en_sede(:'vt', (select lima from ids))::text, 'null');`,
  "null",
);

// ---------------- P · la migración contra el cuerpo que tiene producción antes de pegar ----------------
// Dentro de la transacción (se deshace al final): se repone `regularizar_prenda` de 20260923162300 y la clave soltada, se corre la
// sonda, se aplica 20261004204000 DOS veces y se mira que cada regla quedó una sola vez.
const REPONER_ORIGINAL = `${MIG_ORIGINAL}
insert into retail.acciones_sin_responsable (clave, descripcion) values ('regularizar_prenda', 'Regularizar una prenda por regularizar')
  on conflict (clave) do nothing;
`;
caso(
  "P1 · la sonda de solo lectura encuentra cada ancla UNA vez en el cuerpo original (y hay tres anclas)",
  `${REPONER_ORIGINAL}${sonda().replace(/;\s*$/, "")} \\g /dev/null
select string_agg(ancla || ':' || veces, ',' order by ancla) from (${sonda().replace(/^--.*\n/, "").replace(/;\s*$/, "")}) s;`,
  "1:1,2:1,3:1",
);
caso(
  "P2 · la migración se aplica sobre el cuerpo original, se vuelve a pegar sin duplicar nada y deja las cuatro reglas",
  `${REPONER_ORIGINAL}${MIG_REGLAS}\n${MIG_REGLAS}
select (select count(*) from retail.acciones_sin_responsable where clave = 'regularizar_prenda') || '/' ||
       (select string_agg(((length(prosrc) - length(replace(prosrc, m, ''))) / length(m))::text, ',' order by m)
          from pg_proc, unnest(array['regularizar_propia_venta', 'prenda_sin_cargar_en_sede', 'cantidad - cantidad_apartada >= 1',
                                     'fn_bloquear_en_orden(v_p.ubicacion_id']) m
         where pg_proc.oid = 'retail.regularizar_prenda(uuid, uuid, text)'::regprocedure);`,
  "0/1,1,1,1",
);
caso(
  "P3 · si el cuerpo vivo es otro (un ancla no está), la migración aborta sin tocar nada",
  `${REPONER_ORIGINAL}select pg_temp.intento(format('create or replace function retail.regularizar_prenda(p_id uuid, p_variante_id uuid, p_forma text) returns numeric language plpgsql as %L', 'begin return 0; end;')) \\g /dev/null
select pg_temp.intento(${"$m$"}${MIG_REGLAS.replace(/notify pgrst, 'reload schema';\s*$/, "")}${"$m$"}) as r \\gset
select :'r' || ' / clave=' || (select count(*) from retail.acciones_sin_responsable where clave = 'regularizar_prenda');`,
  (s) => s.includes("cambió desde que se escribió esta migración") && s.endsWith(" / clave=1"),
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""}`);
process.exit(fallas ? 1 : 0);
