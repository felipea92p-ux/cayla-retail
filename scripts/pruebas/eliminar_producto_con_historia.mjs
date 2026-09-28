#!/usr/bin/env node
/**
 * Prueba de Productos ▸ Eliminar con su historia (`20260928230000_eliminar_producto_con_historia.sql`, ADR-0252).
 *
 * QUÉ CUBRE
 *   · un Admin elimina un producto cuya historia es SOLO de stock —carga, ajuste, bajada al piso (con su marca de reintento),
 *     línea de conteo con su ajuste (se citan entre sí), apartado ya cerrado sin dinero, pedido que no se pudo atender—
 *     completo, sin tocar a otro producto; el libro de movimientos cuadra con el stock antes y después; queda UNA fila de
 *     rastro y UNA línea de Actividad; y los candados de historial vuelven a su modo (movimientos en ALWAYS) y siguen
 *     frenando a cualquier otro;
 *   · el RESPALDO es real: `scripts/purga/restaurar-purga.sql` lo devuelve fila por fila, idéntico;
 *   · lo que pregunta la ventana (`fn_producto_como_eliminar`): nivel, si ESTA cuenta puede, la razón, cuántas prendas y
 *     movimientos se van, y quién lo cargó;
 *   · solo un Admin: un Líder que no es Admin ve «con historia» pero no puede; una integrante y `anon` ni preguntan;
 *     `fn_producto_historia` no se puede llamar desde la API;
 *   · DOCUMENTOS frenan hasta al Admin, sin llevarse nada: una venta (el seed), un apartado abierto, un ingreso de proveedor;
 *   · sin historia también funciona (es un superconjunto de `eliminar_producto`); la pieza «Monto manual» nunca; un
 *     producto que ya no existe lo dice;
 *   · red de seguridad: si una tabla nueva cita un movimiento y la función no la conoce, la llave lo frena, no queda nada a
 *     medias y los candados siguen como estaban;
 *   · DERIVA: toda tabla que cite `movimientos` está clasificada (la función la borra, o su historia frena el borrado).
 *
 * CÓMO. Igual que `eliminar_producto.mjs`: cada escenario en su transacción con ROLLBACK y sesión simulada con
 * `request.jwt.claim.sub`. Nada queda escrito.
 *
 * USO
 *   pnpm pruebas:eliminar-producto-con-historia    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RESTAURAR = readFileSync(join(RAIZ, "scripts/purga/restaurar-purga.sql"), "utf8").replace(/^(begin|commit);.*\[\[transaccion\]\].*$/gm, "");

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (y Admin en el seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante
const CENTINELA = "11111111-1111-4111-8111-111111111111"; // el producto de «Monto manual»

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(`${sql}\nrollback;\n`).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const sesion = (id) => `reset role;
set local request.jwt.claim.sub = '${id}';
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
`;
const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_hint text; v_estado text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint, v_estado = returned_sqlstate;
  return v_estado || '|' || coalesce(nullif(v_hint, ''), '-') || '|' || v_msg;
end;
$f$;
`;
const AYUDAS = `
-- Todo lo de un producto, en una línea: producto|variantes|códigos|fotos|stock|movimientos|conteo|bajadas|apartados|pedidos|reintentos.
create function pg_temp.huella(p_producto uuid) returns text language sql as $f$
  with vs as (select id from retail.variantes where producto_id = p_producto),
       ms as (select id from retail.movimientos where variante_id in (select id from vs))
  select (select count(*) from retail.productos where id = p_producto) || '|'
      || (select count(*) from vs) || '|'
      || (select count(*) from retail.codigos_barras where variante_id in (select id from vs)) || '|'
      || (select count(*) from retail.producto_fotos where producto_id = p_producto) || '|'
      || (select count(*) from retail.stock where variante_id in (select id from vs)) || '|'
      || (select count(*) from ms) || '|'
      || (select count(*) from retail.conteo_items where variante_id in (select id from vs)) || '|'
      || (select count(*) from retail.bajada_piso_items where variante_id in (select id from vs)) || '|'
      || (select count(*) from retail.apartados where variante_id in (select id from vs)) || '|'
      || (select count(*) from retail.pedidos_no_atendidos where producto_id = p_producto) || '|'
      || (select count(*) from retail.movimientos_internos_intentos where movimiento_id in (select id from ms));
$f$;
-- Las filas mismas (no solo cuántas): para comprobar que restaurar devuelve cada una idéntica.
create function pg_temp.filas(p_producto uuid) returns text language sql as $f$
  with vs as (select id from retail.variantes where producto_id = p_producto),
       ms as (select id from retail.movimientos where variante_id in (select id from vs))
  select md5(concat_ws('#',
    (select string_agg(to_jsonb(t)::text, ',' order by t.id) from retail.productos t where t.id = p_producto),
    (select string_agg(to_jsonb(t)::text, ',' order by t.id) from retail.variantes t where t.id in (select id from vs)),
    (select string_agg(to_jsonb(t)::text, ',' order by t.codigo) from retail.codigos_barras t where t.variante_id in (select id from vs)),
    (select string_agg(to_jsonb(t)::text, ',' order by t.id) from retail.producto_fotos t where t.producto_id = p_producto),
    (select string_agg(to_jsonb(t)::text, ',' order by t.variante_id, t.sububicacion_id) from retail.stock t where t.variante_id in (select id from vs)),
    (select string_agg(to_jsonb(t)::text, ',' order by t.id) from retail.movimientos t where t.id in (select id from ms)),
    (select string_agg(to_jsonb(t)::text, ',' order by t.id) from retail.conteo_items t where t.variante_id in (select id from vs)),
    (select string_agg(to_jsonb(t)::text, ',' order by t.movimiento_id) from retail.bajada_piso_items t where t.variante_id in (select id from vs)),
    (select string_agg(to_jsonb(t)::text, ',' order by t.id) from retail.apartados t where t.variante_id in (select id from vs)),
    (select string_agg(to_jsonb(t)::text, ',' order by t.id) from retail.pedidos_no_atendidos t where t.producto_id = p_producto),
    (select string_agg(to_jsonb(t)::text, ',' order by t.movimiento_id) from retail.movimientos_internos_intentos t where t.movimiento_id in (select id from ms))));
$f$;
create function pg_temp.como(p_producto uuid) returns text language sql as $f$
  select nivel || '|' || puedes || '|' || coalesce(razon, '') || '|' || prendas || '|' || movimientos || '|'
      || coalesce(cargado_por, '') || '|' || (cargado_el is not null)::text
    from retail.fn_producto_como_eliminar(p_producto);
$f$;
-- Los candados de historial, en una línea (A = ALWAYS, O = normal).
create function pg_temp.candados() returns text language sql as $f$
  select string_agg(tgname::text || '=' || tgenabled::text, ',' order by tgname) from pg_trigger
   where tgname in ('movimientos_inmutables', 'movimientos_sin_truncate', 'bajada_piso_items_inmutables', 'costo_historial_sin_update',
                    'movimientos_internos_intentos_inmutables');
$f$;
-- El libro de movimientos contra el stock, en toda la base (la misma fórmula de scripts/purga).
create function pg_temp.libro_cuadra_no() returns bigint language sql as $f$
  with efecto as (
    select variante_id, ubicacion_id, sububicacion_id,
           case tipo when 'entrada' then cantidad when 'ajuste' then cantidad when 'salida' then -cantidad
                     when 'traslado' then -cantidad else 0 end as d
      from retail.movimientos
    union all
    select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad from retail.movimientos where tipo = 'traslado'
  ), libro as (
    select variante_id, ubicacion_id, sububicacion_id, sum(d) as esperado from efecto group by 1, 2, 3
  )
  select count(*) filter (where coalesce(l.esperado, 0) <> coalesce(s.cantidad, 0))
    from libro l full join retail.stock s
      on s.variante_id = l.variante_id and s.ubicacion_id = l.ubicacion_id and s.sububicacion_id is not distinct from l.sububicacion_id
$f$;
-- Un movimiento aplicado al stock, a nombre de quien se diga; devuelve su id.
create function pg_temp.mov(p_variante uuid, p_ubic uuid, p_sub uuid, p_tipo text, p_cant int, p_motivo text, p_persona uuid,
                            p_sub_destino uuid default null, p_conteo_item uuid default null, p_lote uuid default null)
returns uuid language plpgsql as $f$
declare v_id uuid;
begin
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id,
                                  ubicacion_destino_id, sububicacion_destino_id, conteo_item_id, lote_id)
  values (p_variante, p_ubic, p_sub, p_tipo, p_cant, p_motivo, p_persona,
          case when p_tipo = 'traslado' then p_ubic end, p_sub_destino, p_conteo_item, p_lote)
  returning id into v_id;
  perform retail.fn_aplicar_movimiento(v_id);
  return v_id;
end;
$f$;
`;

/**
 * «Prueba A»: 2 variantes y 1 foto, con TODA la historia de stock que un Admin puede borrar (7 movimientos, 13 prendas):
 *   A1: entrada 10 al almacén → ajuste −1 → bajada de 3 al piso (con su bajada y su marca de reintento) → conteo en el piso
 *       (sistema 3, contadas 2) con su ajuste −1 → apartado de 1 y su liberación (apartado cerrado, sin adelanto);
 *   A2: entrada 5 al piso. Además, un pedido que no se pudo atender.
 * «Prueba B»: 1 variante con una entrada de 4. No se toca nunca.
 */
const ESCENA = `
begin;
${INTENTO}
${AYUDAS}
${sesion(FELIPE)}
select p.id as yo from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as base, categoria_id as cat, marca_id as marca, proveedor_id as prov from retail.productos where referencia = 'Blusa Emma' \\gset
select talla_id as t1, color_codigo as c1 from retail.variantes where producto_id = :'base' order by sku limit 1 \\gset
select talla_id as t2, color_codigo as c2 from retail.variantes where producto_id = :'base' order by sku offset 1 limit 1 \\gset
select id as tienda from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as almacen from retail.sububicaciones where ubicacion_id = :'tienda' and tipo = 'almacen_tienda' \\gset
select id as piso from retail.sububicaciones where ubicacion_id = :'tienda' and tipo = 'piso_venta' \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('Prueba A', :'cat', :'marca', :'prov') returning id as pa \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('Prueba B', :'cat', :'marca', :'prov') returning id as pb \\gset
insert into retail.variantes (producto_id, sku, precio, talla_id, color_codigo)
  values (:'pa', 'PRUEBA-A-1', 50, :'t1', :'c1'), (:'pa', 'PRUEBA-A-2', 50, :'t2', :'c2'), (:'pb', 'PRUEBA-B-1', 50, :'t1', :'c1');
select id as a1 from retail.variantes where sku = 'PRUEBA-A-1' \\gset
select id as a2 from retail.variantes where sku = 'PRUEBA-A-2' \\gset
select id as b1 from retail.variantes where sku = 'PRUEBA-B-1' \\gset
insert into retail.producto_fotos (producto_id, url, orden, es_principal) values (:'pa', 'https://ejemplo.pe/prueba-a.jpg', 1, true);

select pg_temp.mov(:'a1', :'tienda', :'almacen', 'entrada', 10, 'carga_inicial', :'yo') as m_entrada \\gset
select pg_temp.mov(:'a1', :'tienda', :'almacen', 'ajuste', -1, 'reposicion', :'yo') as _m \\gset
select pg_temp.mov(:'a1', :'tienda', :'almacen', 'traslado', 3, 'bajada_piso', :'yo', :'piso') as m_bajada \\gset
insert into retail.bajadas_piso (token_cliente, ubicacion_id, persona_id, huella) values (gen_random_uuid(), :'tienda', :'yo', md5('prueba')) returning id as bajada \\gset
insert into retail.bajada_piso_items (movimiento_id, bajada_id, variante_id, cantidad) values (:'m_bajada', :'bajada', :'a1', 3);
insert into retail.movimientos_internos_intentos (token_cliente, movimiento_id, huella) values (gen_random_uuid(), :'m_bajada', md5('prueba'));
insert into retail.conteos (ubicacion_id, sububicacion_id) values (:'tienda', :'piso') returning id as conteo \\gset
insert into retail.conteo_items (conteo_id, variante_id, cantidad_sistema, cantidad_contada) values (:'conteo', :'a1', 3, 2) returning id as ci \\gset
select pg_temp.mov(:'a1', :'tienda', :'piso', 'ajuste', -1, 'conteo_fisico', :'yo', null, :'ci') as m_conteo \\gset
update retail.conteo_items set movimiento_id = :'m_conteo' where id = :'ci';
select pg_temp.mov(:'a1', :'tienda', :'piso', 'apartado', 1, 'apartado', :'yo') as m_ap \\gset
select pg_temp.mov(:'a1', :'tienda', :'piso', 'liberacion_apartado', 1, 'apartado', :'yo') as m_lib \\gset
insert into retail.apartados (variante_id, ubicacion_id, sububicacion_id, cantidad, clienta_nombre, clienta_contacto, vence_el,
                              estado, movimiento_id, movimiento_cierre_id, cerrado_en, cierre_motivo)
  values (:'a1', :'tienda', :'piso', 1, 'Ana', '999000111', current_date + 3, 'liberado', :'m_ap', :'m_lib', now(), 'clienta_no_vino');
select pg_temp.mov(:'a2', :'tienda', :'piso', 'entrada', 5, 'carga_inicial', :'yo') as _m \\gset
insert into retail.pedidos_no_atendidos (ubicacion_id, producto_id) values (:'tienda', :'pa');
select pg_temp.mov(:'b1', :'tienda', :'almacen', 'entrada', 4, 'carga_inicial', :'yo') as m_b \\gset
`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 500)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);
const HISTORIA_A =
  "tiene movimientos de stock (7), unidades en stock (13), apartados ya cerrados (1), líneas de conteo (1), bajadas al piso (1), pedidos que no se pudieron atender (1)";
const HUELLA_A = /^1\|2\|[1-9]\d*\|1\|3\|7\|1\|1\|1\|1\|1$/; // producto, 2 variantes, sus códigos, 1 foto, 3 filas de stock, 7 mov…
const CANDADOS =
  "bajada_piso_items_inmutables=O,costo_historial_sin_update=O,movimientos_inmutables=A,movimientos_internos_intentos_inmutables=O,movimientos_sin_truncate=A";

// 1. Lo que ve la ventana de un Admin: con historia de stock, puede, qué se va y quién lo cargó.
{
  const r = correr(`${ESCENA}
select pg_temp.huella(:'pa');
select pg_temp.como(:'pa');`);
  const [huella, como] = lineas(r);
  esperar("(preparación) Prueba A tiene su ficha, 2 variantes, foto, 3 filas de stock, 7 movimientos, conteo, bajada, apartado, pedido y reintento", r.ok && HUELLA_A.test(huella), r);
  esperar(
    "la ventana dice: con historia, esta cuenta (Admin) puede, la historia completa, 13 prendas, 7 movimientos y lo cargó Felipe Alvarez",
    r.ok && como === `con_historia|true|${HISTORIA_A}|13|7|Felipe Alvarez|true`,
    r
  );
}

// 2. El Admin lo elimina: nada suyo queda, el otro producto no se toca, el libro cuadra, rastro, Actividad y candados.
{
  const r = correr(`${ESCENA}
select pg_temp.huella(:'pb') as huella_b \\gset
select pg_temp.libro_cuadra_no();
select pg_temp.candados();
select retail.eliminar_producto_con_historia(:'pa');
select pg_temp.huella(:'pa');
select pg_temp.huella(:'pb') = :'huella_b';
select pg_temp.libro_cuadra_no();
select pg_temp.candados();
select count(*) || '|' || max(valor_anterior) || '|' || (max(valor_nuevo) like 'con su historia · respaldo «eliminado % 20__-__-__ __:__:__»')::text || '|' || (max(usuario_id::text) = :'yo')::text
  from retail.historial_producto_cambios where entidad = 'producto' and entidad_id = :'pa' and campo = 'eliminado';
select count(*) || '|' || max(modulo) || '|' || max(accion) || '|' || max(descripcion) || '|' || (max(persona_id::text) = :'yo')::text || '|' || max(detalle ->> 'movimientos')
  from retail.actividad where tabla = 'productos' and registro_id = :'pa';`);
  const [libroAntes, candAntes, devuelto, despues, bIgual, libroDespues, candDespues, rastro, actividad] = lineas(r);
  esperar("(preparación) el libro cuadra con el stock antes de empezar", r.ok && libroAntes === "0", r);
  esperar("(preparación) los candados de historial están como en producción", r.ok && candAntes === CANDADOS, r);
  esperar("eliminar con su historia devuelve la referencia", r.ok && devuelto === "Prueba A", r);
  esperar("no queda nada suyo: ficha, variantes, códigos, foto, stock, movimientos, conteo, bajada, apartado, pedido, reintento", r.ok && despues === "0|0|0|0|0|0|0|0|0|0|0", r);
  esperar("el otro producto sigue exactamente igual", r.ok && bIgual === "t", r);
  esperar("el libro de movimientos sigue cuadrando con el stock en TODA la base", r.ok && libroDespues === "0", r);
  esperar("cada candado volvió a su modo (movimientos en ALWAYS)", r.ok && candDespues === CANDADOS, r);
  esperar("queda UNA fila de rastro: cómo se llamaba, «con su historia · respaldo «…»» y quién", r.ok && /^1\|Prueba A( · \S+)?\|true\|true$/.test(rastro), r);
  esperar(
    "y UNA línea en Actividad, del módulo Productos, a nombre de quien lo hizo, con lo que se fue",
    r.ok && /^1\|productos\|producto_eliminado\|eliminó «Prueba A»( \(\S+\))? con su historia: 13 prendas en stock y 7 movimientos\|true\|7$/.test(actividad),
    r
  );
}

// 3. Los candados siguen frenando a cualquier otro después del borrado (no quedó una puerta abierta).
{
  const r = correr(`${ESCENA}
select pg_temp.mov(:'b1', :'tienda', :'almacen', 'traslado', 1, 'bajada_piso', :'yo', :'piso') as m_bajada_b \\gset
insert into retail.bajada_piso_items (movimiento_id, bajada_id, variante_id, cantidad) values (:'m_bajada_b', :'bajada', :'b1', 1);
select retail.eliminar_producto_con_historia(:'pa') as _e \\gset
select pg_temp.intento(format('delete from retail.movimientos where id = %L', :'m_b'));
select pg_temp.intento(format('update retail.movimientos set cantidad = 99 where id = %L', :'m_b'));
select pg_temp.intento(format('delete from retail.bajada_piso_items where movimiento_id = %L', :'m_bajada_b'));`);
  const [borrar, editar, bajada] = lineas(r);
  esperar("borrar un movimiento de otro producto sigue prohibido", r.ok && /El historial de movimientos no se edita ni se borra/.test(borrar), r);
  esperar("editarlo también", r.ok && /El historial de movimientos no se edita ni se borra/.test(editar), r);
  esperar("y la bajada al piso de otro producto tampoco se borra a mano", r.ok && /Una bajada registrada no se edita ni se borra/.test(bajada), r);
}

// 4. El respaldo es real: restaurar-purga.sql devuelve cada fila idéntica y el libro sigue cuadrando.
{
  const r = correr(`${ESCENA}
select pg_temp.filas(:'pa') as filas_antes \\gset
select pg_temp.huella(:'pa') as huella_antes \\gset
select retail.eliminar_producto_con_historia(:'pa') as _e \\gset
select purga from respaldo_purgas.filas where purga like 'eliminado %' order by id desc limit 1 \\gset
select string_agg(tabla || '=' || n, ',' order by tabla) from (select tabla, count(*) n from respaldo_purgas.filas where purga = :'purga' group by 1) x;
select pg_temp.huella(:'pa');
reset role;
select set_config('cayla_purga.nombre', :'purga', true) as _c \\gset
${RESTAURAR}
select pg_temp.huella(:'pa') = :'huella_antes';
select pg_temp.filas(:'pa') = :'filas_antes';
select pg_temp.libro_cuadra_no();
select pg_temp.candados();
select count(*) || '|' || max(modulo) from retail.actividad where accion = 'purga_restaurada' and registro_id = :'pa';`);
  const [respaldo, borrado, huellaIgual, filasIguales, libro, cand, actividad] = lineas(r);
  esperar(
    "el respaldo guarda cada fila, por tabla (7 movimientos, 3 de stock, la bajada, el conteo, el apartado, el pedido, el reintento…)",
    r.ok && /^apartados=1,bajada_piso_items=1,codigos_barras=[1-9]\d*,conteo_items=1,movimientos=7,movimientos_internos_intentos=1,pedidos_no_atendidos=1,producto_fotos=1,productos=1,stock=3,variantes=2$/.test(respaldo),
    r
  );
  esperar("(entre medio) no quedaba nada", r.ok && borrado === "0|0|0|0|0|0|0|0|0|0|0", r);
  esperar("restaurar devuelve lo mismo que había (cuántas)", r.ok && huellaIgual === "t", r);
  esperar("y cada fila idéntica, columna por columna", r.ok && filasIguales === "t", r);
  esperar("el libro cuadra después de restaurar", r.ok && libro === "0", r);
  esperar("los candados quedaron como estaban", r.ok && cand === CANDADOS, r);
  esperar("Actividad cuenta la restauración en el módulo Productos", r.ok && actividad === "1|productos", r);
}

// 5. Un Líder que NO es Admin: la ventana le dice que hay historia y que él no puede; la función lo frena.
{
  const r = correr(`${ESCENA}
update public.personas set rol = 'integrante' where auth_user_id = '${FELIPE}';
select retail.fn_es_lider()::text || '|' || retail.fn_es_admin()::text;
select pg_temp.como(:'pa');
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'pa'));
select pg_temp.huella(:'pa');`);
  const [perfil, como, intento, despues] = lineas(r);
  esperar("(preparación) la cuenta es Líder y no Admin", r.ok && perfil === "true|false", r);
  esperar("la ventana: con historia, pero esta cuenta NO puede", r.ok && como === `con_historia|false|${HISTORIA_A}|13|7|Felipe Alvarez|true`, r);
  esperar("eliminar con su historia: 42501, solo una cuenta Admin", r.ok && intento === "42501|-|Solo una cuenta Admin puede eliminar un producto con su historia.", r);
  esperar("y no se llevó nada", r.ok && HUELLA_A.test(despues), r);
}

// 6. Una integrante y anon ni preguntan; la definición de historia no se llama desde la API.
{
  const r = correr(`${ESCENA}
${sesion(MICAELA)}
select pg_temp.intento(format('select * from retail.fn_producto_como_eliminar(%L)', :'pa'));
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'pa'));
set local role authenticated;
select pg_temp.intento(format('select * from retail.fn_producto_historia(%L)', :'pa'));
reset role;
set local role anon;
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'pa'));
reset role;
select pg_temp.huella(:'pa');`);
  const [como, eliminar, historia, anon, despues] = lineas(r);
  esperar("una integrante no consulta la ventana (42501)", r.ok && como === "42501|-|Solo un líder puede eliminar productos.", r);
  esperar("ni elimina con historia (42501)", r.ok && eliminar === "42501|-|Solo una cuenta Admin puede eliminar un producto con su historia.", r);
  esperar("fn_producto_historia no se puede llamar desde la API", r.ok && historia.includes("permission denied for function fn_producto_historia"), r);
  esperar("anon ni siquiera puede llamar la función", r.ok && anon.includes("permission denied for function eliminar_producto_con_historia"), r);
  esperar("y el producto sigue completo", r.ok && HUELLA_A.test(despues), r);
}

// 7. Un producto con ventas (el seed): ni el Admin; se nombra el documento y no se lleva nada.
{
  const r = correr(`${ESCENA}
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select pg_temp.huella(:'emma') as antes \\gset
select pg_temp.como(:'emma');
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'emma'));
select pg_temp.huella(:'emma') = :'antes';
select count(*) from respaldo_purgas.filas where purga like 'eliminado %';`);
  const [como, intento, igual, respaldo] = lineas(r);
  esperar("la ventana: con documentos, nadie puede, y la razón empieza por las líneas de venta", r.ok && /^con_documentos\|false\|tiene líneas de venta \(\d+\)/.test(como), r);
  esperar("eliminar lo rechaza con su hint, nombra la venta y ofrece desactivar", r.ok && /^P0001\|producto_con_documentos\|No se puede eliminar «Blusa Emma»: tiene líneas de venta \(\d+\).*Desactívalo/.test(intento), r);
  esperar("todo o nada: el producto sigue igual y no quedó respaldo a medias", r.ok && igual === "t" && respaldo === "0", r);
}

// 8. Un apartado ABIERTO (una clienta lo espera) frena hasta al Admin.
{
  const r = correr(`${ESCENA}
select pg_temp.mov(:'a2', :'tienda', :'piso', 'apartado', 1, 'apartado', :'yo') as m_ap2 \\gset
insert into retail.apartados (variante_id, ubicacion_id, sububicacion_id, cantidad, clienta_nombre, clienta_contacto, vence_el, estado, movimiento_id)
  values (:'a2', :'tienda', :'piso', 1, 'Rosa', '999000222', current_date + 3, 'abierto', :'m_ap2');
select pg_temp.huella(:'pa') as antes \\gset
select pg_temp.como(:'pa');
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'pa'));
select pg_temp.huella(:'pa') = :'antes';`);
  const [como, intento, igual] = lineas(r);
  esperar("la ventana: con documentos por el apartado abierto", r.ok && /^con_documentos\|false\|tiene apartados abiertos o con adelanto \(1\)\|/.test(como), r);
  esperar("eliminar lo rechaza y nombra el apartado abierto", r.ok && /^P0001\|producto_con_documentos\|No se puede eliminar «Prueba A»: tiene apartados abiertos o con adelanto \(1\)/.test(intento), r);
  esperar("y no se lleva nada", r.ok && igual === "t", r);
}

// 9. Lo que llegó de un proveedor (un lote de Recibir) frena hasta al Admin.
{
  const r = correr(`${ESCENA}
insert into retail.lotes (ubicacion_id, proveedor_id) values (:'tienda', :'prov') returning id as lote \\gset
select pg_temp.mov(:'a2', :'tienda', :'almacen', 'entrada', 2, 'recepcion', :'yo', null, null, :'lote') as _m \\gset
select pg_temp.como(:'pa');
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'pa'));`);
  const [como, intento] = lineas(r);
  esperar("la ventana: con documentos por el ingreso de un proveedor", r.ok && /^con_documentos\|false\|tiene ingresos recibidos de un proveedor \(1\)\|/.test(como), r);
  esperar("eliminar lo rechaza", r.ok && /^P0001\|producto_con_documentos\|No se puede eliminar «Prueba A»: tiene ingresos recibidos de un proveedor \(1\)/.test(intento), r);
}

// 9b. Un costo registrado es documento por sí solo (la base solo acepta costos de una compra o una producción), aunque la
// compra no estuviera a la vista.
{
  const r = correr(`${ESCENA}
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, usuario_id)
  values (:'a2', 0, 0, 5, 20, 20, 'compra', (select id from retail.movimientos where variante_id = :'a2' limit 1), :'yo');
select pg_temp.como(:'pa');
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'pa'));
select pg_temp.huella(:'pa');`);
  const [como, intento, despues] = lineas(r);
  esperar("la ventana: con documentos por el costo registrado", r.ok && /^con_documentos\|false\|tiene costos registrados \(1\)\|/.test(como), r);
  esperar("eliminar lo rechaza, nombra el costo y no se lleva nada", r.ok && /^P0001\|producto_con_documentos\|No se puede eliminar «Prueba A»: tiene costos registrados \(1\)/.test(intento) && HUELLA_A.test(despues), r);
}

// 10. Sin historia: la ventana dice «libre» y la función con historia también lo borra (es un superconjunto).
{
  const r = correr(`${ESCENA}
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('Virgen', :'cat', :'marca', :'prov') returning id as vg \\gset
insert into retail.variantes (producto_id, sku, precio, talla_id, color_codigo) values (:'vg', 'VIRGEN-1', 50, :'t1', :'c1');
select pg_temp.como(:'vg');
select retail.eliminar_producto_con_historia(:'vg');
select pg_temp.huella(:'vg');`);
  const [como, devuelto, despues] = lineas(r);
  esperar("la ventana: libre, puede, sin razón, nada que se vaya y nadie lo cargó", r.ok && como === "libre|true||0|0||false", r);
  esperar("y se elimina igual", r.ok && devuelto === "Virgen" && despues === "0|0|0|0|0|0|0|0|0|0|0", r);
}

// 11. La pieza «Monto manual» nunca; un producto que ya no existe lo dice.
{
  const r = correr(`${ESCENA}
select pg_temp.como('${CENTINELA}');
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', '${CENTINELA}'));
select count(*) from retail.productos where id = '${CENTINELA}';
select retail.eliminar_producto_con_historia(:'pa') as _e \\gset
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'pa'));
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', gen_random_uuid()));`);
  const [como, intento, sigue, otraVez, fantasma] = lineas(r);
  esperar("la ventana: pieza del sistema, nadie puede", r.ok && como === "sistema|false|es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita|0|0||false", r);
  esperar("eliminar la rechaza", r.ok && /^P0001\|producto_con_documentos\|No se puede eliminar «.+»: es una pieza del sistema/.test(intento) && sigue === "1", r);
  esperar("eliminar dos veces: la segunda lo dice", r.ok && otraVez === "P0001|producto_invalido|Ese producto ya no existe. Recarga la pantalla.", r);
  esperar("un producto que nunca existió, igual", r.ok && fantasma === "P0001|producto_invalido|Ese producto ya no existe. Recarga la pantalla.", r);
}

// 12. Red de seguridad: una tabla nueva cita un movimiento y la función no la conoce → nada a medias, candados intactos.
{
  const r = correr(`${ESCENA}
create table retail.zz_cita_movimiento (movimiento_id uuid references retail.movimientos (id));
insert into retail.zz_cita_movimiento values (:'m_entrada');
select pg_temp.huella(:'pa') as antes \\gset
select pg_temp.intento(format('select retail.eliminar_producto_con_historia(%L)', :'pa'));
select pg_temp.huella(:'pa') = :'antes';
select pg_temp.candados();
select count(*) from respaldo_purgas.filas where purga like 'eliminado %';`);
  const [intento, igual, cand, respaldo] = lineas(r);
  esperar("la llave lo frena y lo dice en castellano", r.ok && /^P0001\|producto_con_documentos\|No se puede eliminar «Prueba A»: otra parte del sistema todavía lo usa/.test(intento), r);
  esperar("todo o nada: el producto sigue completo", r.ok && igual === "t", r);
  esperar("los candados quedaron como estaban", r.ok && cand === CANDADOS, r);
  esperar("y no quedó respaldo de un borrado que no pasó", r.ok && respaldo === "0", r);
}

// 13. DERIVA. Toda tabla que cite `movimientos` está clasificada. Si falla, nació una tabla nueva: decide si la función la
// BORRA con el producto (agrégala a `eliminar_producto_con_historia` y a su respaldo, y a restaurar-purga.sql) o si su
// historia FRENA el borrado (agrégala a `fn_producto_historia` con borrable = false).
{
  const LAS_BORRA = ["conteo_items", "bajada_piso_items", "apartados", "movimientos_internos_intentos"];
  // Frenan: devoluciones y cambios (vienen de una venta), traslados entre sedes, prendas dañadas, envíos de proveedor, costos.
  const FRENAN = ["devolucion_items", "transferencia_items", "transferencia_recepciones", "prendas_danadas", "envio_extras", "costo_historial"];
  const conocidas = [...LAS_BORRA, ...FRENAN].map((t) => `'retail.${t}'`).join(", ");
  const r = correr(`select coalesce(string_agg(distinct c.conrelid::regclass::text, ', '), 'NINGUNA')
    from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'retail.movimientos'::regclass
     and c.conrelid::regclass::text not in (${conocidas});`);
  esperar(
    `toda tabla que cita a movimientos está clasificada (la borra, o frena)${r.ok && r.salida !== "NINGUNA" ? ` — SIN CLASIFICAR: ${r.salida}` : ""}`,
    r.ok && r.salida === "NINGUNA",
    r
  );
}

// 14. DERIVA de candados. Toda tabla de la que la función borra y que tiene un disparador que frena el DELETE (un candado de
// historial) tiene que estar en su lista `c_candados`: si no, el borrado falla entero en producción con «no se borra».
// Si esta prueba falla, nació un candado nuevo: agrégalo a `c_candados` (y a CANDADOS arriba) o saca esa tabla del borrado.
{
  const BORRA = ["movimientos", "movimientos_internos_intentos", "bajada_piso_items", "conteo_items", "apartados", "pedidos_no_atendidos",
    "stock", "codigos_barras", "producto_fotos", "variantes", "variante_etiquetas", "producto_color_temporadas", "productos"];
  const APAGA = ["movimientos_inmutables", "movimientos_internos_intentos_inmutables", "bajada_piso_items_inmutables"];
  // Los que no frenan: cuentan la versión del catálogo (después de la sentencia) o solo miran inserciones y ediciones.
  const r = correr(`select coalesce(string_agg(t.tgrelid::regclass::text || '.' || t.tgname::text, ', ' order by 1), 'NINGUNO')
    from pg_trigger t
   where not t.tgisinternal and (t.tgtype & 2) <> 0 and (t.tgtype & 8) <> 0   -- BEFORE ... DELETE
     and t.tgrelid::regclass::text in (${BORRA.map((x) => `'retail.${x}'`).join(", ")})
     and t.tgname::text not in (${APAGA.map((x) => `'${x}'`).join(", ")});`);
  esperar(
    `ninguna tabla que la función borra tiene un candado de DELETE que no sepa apagar${r.ok && r.salida !== "NINGUNO" ? ` — SIN APAGAR: ${r.salida}` : ""}`,
    r.ok && r.salida === "NINGUNO",
    r
  );
}

console.log(`\n${casos - fallos}/${casos} casos pasaron.`);
if (fallos > 0) process.exit(1);
