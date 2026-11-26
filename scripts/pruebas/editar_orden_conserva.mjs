#!/usr/bin/env node
/**
 * Prueba de «Editar orden» que no pierde lo de cada línea (`20261124181000_editar_orden_conserva_lo_de_la_linea.sql`, ADR-0700).
 *
 * EL CASO REAL. Quien compra anota en «Compré ropa» tres prendas: una nueva con precio sugerido, casillas y precio visto afuera; una que
 * ya está en el catálogo; y una «a la espera de precio». Antes del comprobante y del envío, alguien corrige la orden en el escritorio
 * («Editar orden» borra las líneas y las vuelve a escribir). Lo que la pantalla devuelve tiene que volver a quedar en cada línea.
 *
 * QUÉ CUBRE
 *   · el detalle trae lo de cada línea (prenda, «a la espera», casillas, precio visto afuera, además del sugerido);
 *   · editar la cantidad de una línea devolviendo lo que trae deja todo en su lugar, en una versión nueva;
 *   · guardar sin cambiar nada no sube la versión (lo devuelto no cuenta como un cambio);
 *   · una orden nueva del escritorio, que no trae nada de eso, queda como siempre;
 *   · cambiarle la categoría a la línea de una prenda del catálogo la suelta de esa prenda, sin error y sin tocar las otras;
 *   · con precio sugerido, la línea deja de estar «a la espera» (sin chocar con el candado de la tabla);
 *   · una prenda que no se entiende o que ya fue rechazada no se guarda (la línea sigue, sin prenda);
 *   · una casilla que no existe frena la edición entera: la orden queda como estaba.
 *
 * CÓMO. Cada escenario en su transacción con ROLLBACK; la sesión es la de Felipe (líder) simulada con `request.jwt.claim.sub` y el rol
 * `authenticated`, con la ronda de compras abierta y sin exigir responsable. Nada queda escrito.
 *
 * USO
 *   pnpm pruebas:editar-orden-conserva    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR = process.env.RETAIL_CONTENEDOR_PG || "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
insert into retail.configuracion_empresa (id, ruc, razon_social, exige_responsable) values (true, '20000000001', 'Prueba', false)
  on conflict (id) do update set exige_responsable = false;
insert into retail.compra_rondas (persona_id, abierta_por)
select distinct c.persona_id, c.persona_id from retail.colaboradores c
 where not exists (select 1 from retail.compra_rondas r where r.persona_id = c.persona_id and r.cerrada_en is null);
insert into retail.proveedores (nombre) values ('Proveedor Editar') returning id as prov \\gset
insert into retail.marcas (nombre) values ('Marca Editar') returning id as marca \\gset
insert into retail.marca_proveedores (marca_id, proveedor_id) values (:'marca', :'prov');
insert into retail.categorias (nombre, familia) values ('Blusas Editar', 'accesorios') returning id as cat \\gset
insert into retail.categorias (nombre, familia) values ('Casacas Editar', 'accesorios') returning id as cat2 \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('Blusa del catálogo Editar', :'cat', :'marca', :'prov')
  returning id as prod \\gset
-- Una prenda rechazada: nace pendiente y solo un líder la rechaza (la sesión de Felipe solo para esto).
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id)
  values ('Blusa rechazada Editar', :'cat', :'marca', :'prov') returning id as rechazado \\gset
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
update retail.productos set estado_alta = 'rechazado' where id = :'rechazado';
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select set_config('t.prov', :'prov', true), set_config('t.marca', :'marca', true), set_config('t.cat', :'cat', true),
       set_config('t.cat2', :'cat2', true), set_config('t.tru', :'tru', true), set_config('t.prod', :'prod', true),
       set_config('t.rechazado', :'rechazado', true) \\g /dev/null

-- La orden de la compra (su id lo deja COMPRA en \`t.orden\`: la tabla no se lee directo con la sesión): el detalle tal como lo lee el escritorio.
create function pg_temp.detalle() returns jsonb language sql as $f$
  select retail.fn_orden_compra_detalle(nullif(current_setting('t.orden', true), '')::uuid)
$f$;
-- Lo que manda «Editar orden»: cada línea del detalle con lo que trae, y encima lo que se cambió en esa posición.
create function pg_temp.lineas(p_cambios jsonb default '{}') returns jsonb language sql as $f$
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'categoria_id', l ->> 'categoria_id', 'marca_id', l ->> 'marca_id', 'descripcion', l ->> 'descripcion',
           'cantidad', l ->> 'cantidad', 'precio_unitario', l ->> 'precio_unitario',
           'precio_venta_sugerido', l -> 'precio_venta_sugerido', 'sugerido_motivos', l -> 'sugerido_motivos',
           'producto_id', l -> 'producto_id', 'precio_por_definir', l -> 'precio_por_definir',
           'rasgos', l -> 'rasgos', 'precio_visto_afuera', l -> 'precio_visto_afuera'))
         || coalesce(p_cambios -> (l ->> 'posicion'), '{}')
         order by (l ->> 'posicion')::integer)
    from jsonb_array_elements(pg_temp.detalle() -> 'lineas') l
$f$;
-- Editar con esas líneas: «OK|versión» o el hint de lo que la frenó.
create function pg_temp.editar(p_lineas jsonb) returns text language plpgsql as $f$
declare v_d jsonb := pg_temp.detalle(); v_version integer; v_hint text; v_estado text;
begin
  select e.version into v_version
    from retail.editar_orden_compra((v_d ->> 'id')::uuid, (v_d ->> 'version')::integer, (v_d -> 'proveedor' ->> 'id')::uuid,
                                    (v_d -> 'destino' ->> 'id')::uuid, null, null, p_lineas) e;
  return 'OK|' || v_version;
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_estado = returned_sqlstate;
  return coalesce(nullif(v_hint, ''), v_estado);
end;
$f$;
grant execute on function pg_temp.detalle() to authenticated;
grant execute on function pg_temp.lineas(jsonb) to authenticated;
grant execute on function pg_temp.editar(jsonb) to authenticated;
`;
const COMO_FELIPE = `reset role;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
set local role authenticated;
`;
/** La compra de «Compré ropa»: una prenda nueva con todo, una del catálogo y una a la espera de precio, las tres para Trujillo. */
const COMPRA = `${COMO_FELIPE}
select (retail.registrar_compra_rapida(gen_random_uuid(), current_setting('t.prov')::uuid, 'nota_venta', 300, 'papeles/editar.jpg',
  jsonb_build_array(
    jsonb_build_object('categoria_id', current_setting('t.cat'), 'marca_id', current_setting('t.marca'), 'descripcion', 'Blusa nueva Editar',
                       'cantidad', 3, 'costo', 30.9, 'precio_venta', 57.9, 'destino_id', current_setting('t.tru'),
                       'rasgos', jsonb_build_array('nadie_la_tiene', 'en_tendencia'), 'precio_visto_afuera', 79.9),
    jsonb_build_object('producto_id', current_setting('t.prod'), 'cantidad', 2, 'costo', 28, 'destino_id', current_setting('t.tru')),
    jsonb_build_object('categoria_id', current_setting('t.cat'), 'marca_id', current_setting('t.marca'), 'descripcion', 'Blusa en espera Editar',
                       'cantidad', 4, 'costo', 25, 'destino_id', current_setting('t.tru'), 'precio_por_definir', true,
                       'rasgos', jsonb_build_array('tela_que_se_nota'))),
  300, 'yape', null, null)) is not null as compro;
reset role;
select set_config('t.orden', (select o.id::text from retail.ordenes_compra o where o.proveedor_id = current_setting('t.prov')::uuid), true) \\g /dev/null
${COMO_FELIPE}`;
/** Lo guardado de cada línea de la orden: cantidad|sugerido|prenda|a la espera|casillas|visto, en orden de posición. */
const GUARDADO = `reset role;
select i.cantidad || '|' || coalesce(i.precio_venta_sugerido::text, '-') || '|'
       || case when i.producto_id is null then '-' when i.producto_id = current_setting('t.prod')::uuid then 'prenda' else 'otra' end || '|'
       || i.precio_por_definir || '|' || coalesce(array_to_string(i.rasgos, ','), '-') || '|' || coalesce(i.precio_visto_afuera::text, '-')
  from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
 where o.proveedor_id = current_setting('t.prov')::uuid
 order by i.posicion;`;

function correr(sql) {
  try {
    return { ok: true, salida: psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const filas = (r) => (r.ok ? r.salida.split("\n").filter((l) => l !== "") : []);

let casos = 0;
let fallos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 900)}`);
  }
}

const COMO_QUEDO = ["3|57.90|-|false|nadie_la_tiene,en_tendencia|79.90", "2|-|prenda|false|-|-", "4|-|-|true|tela_que_se_nota|-"];

// 1. La compra queda como se anotó, y el detalle trae lo de cada línea.
{
  const r = correr(`${COMPRA}
select string_agg(concat_ws('|', coalesce(l ->> 'producto_id', '-') = current_setting('t.prod'), l ->> 'precio_por_definir',
                            coalesce(l -> 'rasgos', 'null'::jsonb)::text, coalesce(l ->> 'precio_visto_afuera', '-')), ' / ' order by (l ->> 'posicion')::integer)
  from jsonb_array_elements(pg_temp.detalle() -> 'lineas') l;
${GUARDADO}`);
  const [compro, detalle, ...guardado] = filas(r);
  esperar("la compra de «Compré ropa» se registra", r.ok && compro === "t", r);
  esperar("y cada línea queda con lo suyo", r.ok && JSON.stringify(guardado) === JSON.stringify(COMO_QUEDO), r);
  esperar(
    "el detalle trae la prenda, «a la espera», las casillas y el precio visto de cada línea",
    r.ok && detalle === 'f|false|["nadie_la_tiene", "en_tendencia"]|79.90 / t|false|null|- / f|true|["tela_que_se_nota"]|-',
    r,
  );
}

// 2. Editar la cantidad devolviendo lo de cada línea: todo sigue en su lugar, en una versión nueva.
{
  const r = correr(`${COMPRA}
select pg_temp.editar(pg_temp.lineas('{"1": {"cantidad": "5"}}'));
${GUARDADO}
select count(*) from retail.orden_compra_versiones v where v.orden_compra_id = (pg_temp.detalle() ->> 'id')::uuid;`);
  const [, editada, a, b, c, versiones] = filas(r);
  esperar("editar la cantidad se guarda en una versión nueva", r.ok && editada === "OK|2", r);
  esperar("la línea editada conserva su sugerido, sus casillas y el precio visto", r.ok && a === "5|57.90|-|false|nadie_la_tiene,en_tendencia|79.90", r);
  esperar("la del catálogo sigue apuntando a su prenda", r.ok && b === COMO_QUEDO[1], r);
  esperar("la que espera precio sigue a la espera, con su casilla", r.ok && c === COMO_QUEDO[2], r);
  esperar("lo de antes queda en el archivo de versiones", r.ok && versiones === "1", r);
}

// 3. Guardar sin cambiar nada no sube la versión: lo devuelto no cuenta como un cambio.
{
  const r = correr(`${COMPRA}
select pg_temp.editar(pg_temp.lineas());
${GUARDADO}`);
  const [, editada, ...guardado] = filas(r);
  esperar("guardar sin cambios deja la versión 1", r.ok && editada === "OK|1", r);
  esperar("y la orden como estaba", r.ok && JSON.stringify(guardado) === JSON.stringify(COMO_QUEDO), r);
}

// 4. Una orden nueva del escritorio no trae nada de eso y queda como siempre.
{
  const r = correr(`${COMO_FELIPE}
select (select o.numero from retail.crear_orden_compra(gen_random_uuid(), current_setting('t.prov')::uuid, current_setting('t.tru')::uuid, null, null,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat'), 'marca_id', current_setting('t.marca'), 'cantidad', '2', 'precio_unitario', '20'))) o)
  is not null as creada;
${GUARDADO}`);
  const [creada, linea] = filas(r);
  esperar("una orden del escritorio se crea", r.ok && creada === "t", r);
  esperar("sin prenda, sin espera, sin casillas ni precio visto", r.ok && linea === "2|-|-|false|-|-", r);
}

// 5. Cambiarle la categoría a la línea de una prenda del catálogo: ya no es esa prenda.
{
  const r = correr(`${COMPRA}
select pg_temp.editar(pg_temp.lineas(jsonb_build_object('2', jsonb_build_object('categoria_id', current_setting('t.cat2')))));
${GUARDADO}`);
  const [, editada, a, b, c] = filas(r);
  esperar("cambiar la categoría se guarda sin error", r.ok && editada === "OK|2", r);
  esperar("la línea queda sin la prenda del catálogo", r.ok && b === "2|-|-|false|-|-", r);
  esperar("y las otras dos no cambian", r.ok && a === COMO_QUEDO[0] && c === COMO_QUEDO[2], r);
}

// 6. Con precio sugerido, la línea deja de estar «a la espera» (la tabla no deja las dos cosas juntas).
{
  const r = correr(`${COMPRA}
select pg_temp.editar(pg_temp.lineas('{"3": {"precio_venta_sugerido": 49.9}}'));
${GUARDADO}`);
  const [, editada, , , c] = filas(r);
  esperar("ponerle precio a la que esperaba se guarda", r.ok && editada === "OK|2", r);
  esperar("y deja de esperar, con su precio y su casilla", r.ok && c === "4|49.90|-|false|tela_que_se_nota|-", r);
}

// 7. Una prenda que no se entiende, o que ya fue rechazada, no se guarda: la línea sigue sin prenda.
const PRENDA_DE_LA_LINEA_2 = `reset role;
select coalesce(i.producto_id::text, '-') from retail.orden_compra_items i
 where i.orden_compra_id = current_setting('t.orden')::uuid and i.posicion = 2;`;
{
  const r = correr(`${COMPRA}
select pg_temp.editar(pg_temp.lineas('{"2": {"producto_id": "no-es-un-id", "cantidad": "3"}}'));
${PRENDA_DE_LA_LINEA_2}
${COMO_FELIPE}
select pg_temp.editar(pg_temp.lineas(jsonb_build_object('2', jsonb_build_object('producto_id', current_setting('t.rechazado'), 'cantidad', '4'))));
${PRENDA_DE_LA_LINEA_2}`);
  const [, basura, sinPrenda, rechazada, sinPrenda2] = filas(r);
  esperar("un id que no se entiende no frena la edición", r.ok && basura === "OK|2", r);
  esperar("y la línea queda sin prenda", r.ok && sinPrenda === "-", r);
  esperar("una prenda rechazada tampoco frena", r.ok && rechazada === "OK|3", r);
  esperar("ni se guarda", r.ok && sinPrenda2 === "-", r);
}

// 8. Una casilla que no existe frena toda la edición: la orden queda como estaba.
{
  const r = correr(`${COMPRA}
select pg_temp.editar(pg_temp.lineas('{"1": {"cantidad": "9", "rasgos": ["de_moda"]}}'));
${GUARDADO}
select pg_temp.detalle() ->> 'version';`);
  const [, frenada, ...resto] = filas(r);
  esperar("una casilla que no existe frena con su motivo", r.ok && frenada === "compra_rapida_rasgos", r);
  esperar("y la orden sigue igual, en su versión 1", r.ok && JSON.stringify(resto) === JSON.stringify([...COMO_QUEDO, "1"]), r);
}

console.log(`\n${casos - fallos} de ${casos} casos bien.`);
process.exit(fallos ? 1 : 0);
