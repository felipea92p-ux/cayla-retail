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
 *
 * CÓMO. Mismo patrón que `responsable_omitido.mjs`: cada caso en su transacción con ROLLBACK, como Felipe (líder) o Micaela
 * (integrante de Tienda Trujillo) con `request.jwt.claim(s)`. Las prendas son nuevas (`ZZ VSR …`), con su historia sembrada
 * con la hora fijada: así la primera entrada y la venta tienen el orden que cada caso necesita.
 *
 * USO
 *   pnpm pruebas:ventas-sin-registrar    → necesita el stack local (`npx supabase start`) con todas las migraciones
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante de Tienda Trujillo (seed)
const CENTINELA = "22222222-2222-4222-8222-222222222222"; // «prenda sin registrar» en una venta

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
  `select pg_temp.prenda('J-NEGRA-M', talla_m, 'NEG') as vj from ids \\gset
select pg_temp.vender_libre(tru, talla_m, 'NEG', now() - interval '3 days') as pp0 from ids \\gset
select retail.regularizar_prenda(:'pp0', :'vj', 'llego_nueva') \\g /dev/null
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

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""}`);
process.exit(fallas ? 1 : 0);
