#!/usr/bin/env node
/**
 * Prueba de Productos ▸ Eliminar (`20260926220000_eliminar_producto.sql`).
 *
 * QUÉ CUBRE
 *   · un producto que nunca se movió se elimina completo —variantes, códigos de barras, fotos— sin tocar al resto del
 *     catálogo, deja UNA fila de rastro (quién y cómo se llamaba) y libera su nombre; uno descontinuado también;
 *   · un producto con historia NO se elimina —movimientos de stock, líneas de venta, un pedido que no se pudo atender…—,
 *     lo dice con palabras del negocio, sugiere desactivar, y no se lleva nada consigo (todo o nada);
 *   · la pieza «Monto manual» del punto de venta NO se elimina aunque no tenga historia (así está en producción);
 *   · solo un líder: sin persona, un integrante —aunque vea Productos y pueda editar el catálogo— y `anon` no eliminan; un Admin sí;
 *   · un producto que ya no existe (doble clic, otra persona lo eliminó) lo dice;
 *   · la red de seguridad: si otra tabla cita al producto y la función no la conoce, la llave lo frena y no queda nada a medias;
 *   · DERIVA: si mañana nace una tabla que cita `productos`/`variantes`, esta prueba falla hasta que alguien decida si es «suya»
 *     (se borra con la ficha) o «historia» (frena el borrado y hay que enseñársela a `fn_producto_se_puede_eliminar`).
 *
 * CÓMO. Igual que `eliminar_marca.mjs`: cada escenario en su transacción con ROLLBACK y sesión simulada con
 * `request.jwt.claim.sub`. La base local la usan otras sesiones: nada queda escrito.
 *
 * USO
 *   pnpm pruebas:eliminar-producto    → con las migraciones ya aplicadas en el local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante
const NADIE = "99999999-9999-4999-8999-000000000009"; // sesión sin persona en retail
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
-- Lo que hay hoy de un producto, en una línea: producto|variantes|códigos de barras|fotos|filas de stock.
create function pg_temp.huella(p_producto uuid) returns text language sql as $f$
  select (select count(*) from retail.productos where id = p_producto) || '|'
      || (select count(*) from retail.variantes where producto_id = p_producto) || '|'
      || (select count(*) from retail.codigos_barras cb join retail.variantes v on v.id = cb.variante_id where v.producto_id = p_producto) || '|'
      || (select count(*) from retail.producto_fotos where producto_id = p_producto) || '|'
      || (select count(*) from retail.stock s join retail.variantes v on v.id = s.variante_id where v.producto_id = p_producto);
$f$;
create function pg_temp.puede(p_producto uuid) returns text language sql as $f$
  select puede::text || '|' || coalesce(razon, '') from retail.fn_producto_se_puede_eliminar(p_producto);
$f$;
`;

/**
 * «Virgen A»: un producto sin ninguna historia, con 2 variantes (a las que un disparador les asigna código de barras) y 1 foto,
 * copiando categoría, marca, proveedor, talla y color de «Blusa Emma» del seed. «Virgen B» es otro igual, para comprobar que
 * eliminar uno no toca al otro.
 */
const ESCENA = `
begin;
${INTENTO}
${AYUDAS}
${sesion(FELIPE)}
select id as base, categoria_id as cat, marca_id as marca, proveedor_id as prov from retail.productos where referencia = 'Blusa Emma' \\gset
select talla_id as t1, color_codigo as c1 from retail.variantes where producto_id = :'base' order by sku limit 1 \\gset
select talla_id as t2, color_codigo as c2 from retail.variantes where producto_id = :'base' order by sku offset 1 limit 1 \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('Virgen A', :'cat', :'marca', :'prov') returning id as va \\gset
insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values ('Virgen B', :'cat', :'marca', :'prov') returning id as vb \\gset
insert into retail.variantes (producto_id, sku, precio, talla_id, color_codigo)
  values (:'va', 'VIRGEN-A-1', 50, :'t1', :'c1'), (:'va', 'VIRGEN-A-2', 50, :'t2', :'c2'),
         (:'vb', 'VIRGEN-B-1', 50, :'t1', :'c1');
insert into retail.producto_fotos (producto_id, url, orden, es_principal) values (:'va', 'https://ejemplo.pe/virgen-a.jpg', 1, true);
`;

let fallos = 0;
let casos = 0;
function esperar(nombre, ok, resultado) {
  casos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    if (resultado) console.log(`    ${JSON.stringify(resultado).slice(0, 1400)}`);
  }
}
const lineas = (r) => (r.ok ? r.salida.split("\n") : []);

// 1. Un producto que nunca se movió se elimina completo; el resto del catálogo no se toca.
{
  const r = correr(`${ESCENA}
select count(*) as antes from retail.productos \\gset
select pg_temp.puede(:'va');
select pg_temp.huella(:'va');
select retail.eliminar_producto(:'va');
select pg_temp.huella(:'va');
select pg_temp.huella(:'vb');
select (select count(*) from retail.productos) = :antes - 1;`);
  const [puede, antes, devuelto, despues, otro, resto] = lineas(r);
  esperar("antes de eliminar: la función dice que se puede, sin razón", r.ok && puede === "true|", r);
  // Los códigos de barras los asigna un disparador al crear la variante: aquí importa que existan, no cuántos.
  esperar("antes de eliminar: existen el producto, sus 2 variantes, sus códigos de barras y 1 foto", r.ok && /^1\|2\|[1-9]\d*\|1\|0$/.test(antes), r);
  esperar("eliminar devuelve la referencia del producto eliminado", r.ok && devuelto === "Virgen A", r);
  esperar("después no queda nada suyo: ni producto, ni variantes, ni códigos de barras, ni fotos", r.ok && despues === "0|0|0|0|0", r);
  esperar("el otro producto sin historia sigue completo (1 variante y sus códigos)", r.ok && /^1\|1\|[1-9]\d*\|0\|0$/.test(otro), r);
  esperar("el catálogo perdió exactamente un producto", r.ok && resto === "t", r);
}

// 2. Deja rastro: una fila con quién lo eliminó y cómo se llamaba; y libera el nombre.
{
  const r = correr(`${ESCENA}
select persona_id as yo from retail.colaboradores c join public.personas p on p.id = c.persona_id where p.auth_user_id = '${FELIPE}' \\gset
select retail.eliminar_producto(:'va') as _e \\gset
select count(*) || '|' || coalesce(max(valor_anterior), '?') || '|' || coalesce(max(valor_nuevo), 'NULO') || '|' || (max(usuario_id::text) = :'yo')::text
  from retail.historial_producto_cambios where entidad = 'producto' and entidad_id = :'va' and campo = 'eliminado';
select pg_temp.intento(format('insert into retail.productos (referencia, categoria_id, marca_id, proveedor_id) values (%L, %L, %L, %L)', 'Virgen A', :'cat', :'marca', :'prov'));`);
  const [rastro, nombreLibre] = lineas(r);
  // El rastro guarda la referencia y, si el sistema ya le había asignado uno, su código (p. ej. «Virgen A · CMS-0003»).
  esperar("queda UNA fila de rastro: cómo se llamaba (y su código), sin valor nuevo, y quién lo eliminó", r.ok && /^1\|Virgen A( · \S+)?\|NULO\|true$/.test(rastro), r);
  esperar("el nombre queda libre: se puede crear otro producto «Virgen A»", r.ok && nombreLibre === "SIN_ERROR", r);
}

// 3. Uno descontinuado también se elimina (lo desactivaron por error o se rechazó su alta: nunca se movió).
{
  const r = correr(`${ESCENA}
update retail.productos set estado = 'descontinuado' where id = :'va';
select retail.eliminar_producto(:'va');
select pg_temp.huella(:'va');`);
  const [devuelto, despues] = lineas(r);
  esperar("un producto descontinuado sin historia se elimina igual", r.ok && devuelto === "Virgen A" && despues === "0|0|0|0|0", r);
}

// 4. Con un movimiento de stock ya no: lo dice con palabras del negocio, sugiere desactivar y no se lleva nada (todo o nada).
{
  const r = correr(`${ESCENA}
select id as tienda from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as vv from retail.variantes where sku = 'VIRGEN-A-1' \\gset
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo) values (:'vv', :'tienda', 'entrada', 5, 'carga_inicial') returning id as mov \\gset
select retail.fn_aplicar_movimiento(:'mov') as _m \\gset
select pg_temp.huella(:'va');
select pg_temp.puede(:'va');
select pg_temp.intento(format('select retail.eliminar_producto(%L)', :'va'));
select pg_temp.huella(:'va');`);
  const [antes, puede, mensaje, despues] = lineas(r);
  esperar("con un movimiento la función dice que no, con la razón", r.ok && /^false\|tiene movimientos de stock \(1\), unidades en stock \(5\)$/.test(puede), r);
  esperar("eliminar se rechaza con el nombre, la razón y la salida (desactivar), con su hint", r.ok && /^P0001\|producto_con_historia\|No se puede eliminar «Virgen A»: tiene movimientos de stock \(1\)/.test(mensaje) && /Desactívalo/.test(mensaje), r);
  esperar("todo o nada: el producto, sus variantes, sus códigos, su foto y su stock siguen ahí", r.ok && antes === despues && /^1\|2\|[1-9]\d*\|1\|1$/.test(despues), r);
}

// 5. Con historia real (el seed): líneas de venta, compras, traslados…
{
  const r = correr(`${ESCENA}
select id as emma from retail.productos where referencia = 'Blusa Emma' \\gset
select pg_temp.huella(:'emma');
select pg_temp.intento(format('select retail.eliminar_producto(%L)', :'emma'));
select pg_temp.huella(:'emma');`);
  const [antes, mensaje, despues] = lineas(r);
  esperar("un producto con ventas, compras y traslados se rechaza y menciona las líneas de venta", r.ok && /^P0001\|producto_con_historia\|No se puede eliminar «Blusa Emma»: tiene líneas de venta \(1\)/.test(mensaje), r);
  esperar("y no se lleva nada consigo", r.ok && antes === despues && antes.startsWith("1|"), r);
}

// 6. Un pedido que la clienta hizo y no se pudo atender también cuenta como historia (un renglón que el seed no cubre).
{
  const r = correr(`${ESCENA}
select id as tienda from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.pedidos_no_atendidos (ubicacion_id, producto_id) values (:'tienda', :'va');
select pg_temp.huella(:'va');
select pg_temp.puede(:'va');
select pg_temp.intento(format('select retail.eliminar_producto(%L)', :'va'));
select pg_temp.huella(:'va');`);
  const [antes, puede, mensaje, despues] = lineas(r);
  esperar("un pedido no atendido frena el borrado y se nombra", r.ok && puede === "false|tiene pedidos que no se pudieron atender (1)" && /producto_con_historia/.test(mensaje), r);
  esperar("y el producto sigue completo", r.ok && antes === despues && antes.startsWith("1|2|"), r);
}

// 7. La pieza «Monto manual» no se elimina, ni aunque no tenga historia (como está HOY en producción: 0 movimientos).
{
  const r = correr(`${ESCENA}
-- Producción no tiene los movimientos de siembra del seed local: se los quito (solo en esta transacción) para reproducirlo.
alter table retail.movimientos disable trigger movimientos_inmutables;
delete from retail.movimientos where variante_id = '22222222-2222-4222-8222-222222222222';
delete from retail.stock where variante_id = '22222222-2222-4222-8222-222222222222';
alter table retail.movimientos enable trigger movimientos_inmutables;
select count(*) from retail.movimientos where variante_id = '22222222-2222-4222-8222-222222222222';
select pg_temp.puede('${CENTINELA}');
select pg_temp.intento(format('select retail.eliminar_producto(%L)', '${CENTINELA}'));
select pg_temp.huella('${CENTINELA}');`);
  const [movs, puede, mensaje, despues] = lineas(r);
  esperar("(preparación) la pieza no tiene ningún movimiento, como en producción", r.ok && movs === "0", r);
  esperar("sin historia igual dice que no: es una pieza del sistema", r.ok && puede === "false|es una pieza del sistema: el cobro de «Monto manual» del punto de venta la necesita", r);
  esperar("eliminar la rechaza con su hint", r.ok && /^P0001\|producto_con_historia\|No se puede eliminar «.+»: es una pieza del sistema/.test(mensaje), r);
  esperar("y sigue existiendo con su variante", r.ok && despues.startsWith("1|1|"), r);
}

// 8. Permisos: solo un líder (y un Admin es un líder). Es más estricto que editar el catálogo.
{
  const r = correr(`${ESCENA}
update retail.roles set limitado_como_hoy = false where clave = 'integrante';
delete from retail.rol_modulos where rol_id = retail.fn_rol_por_clave('integrante');
insert into retail.rol_modulos (rol_id, modulo) values (retail.fn_rol_por_clave('integrante'), 'productos');
select pg_temp.huella(:'va');
${sesion(NADIE)}
select pg_temp.intento(format('select retail.eliminar_producto(%L)', :'va'));
select pg_temp.intento(format('select * from retail.fn_producto_se_puede_eliminar(%L)', :'va'));
${sesion(MICAELA)}
select retail.fn_puede_editar_catalogo()::text;
select pg_temp.intento(format('select retail.eliminar_producto(%L)', :'va'));
select pg_temp.intento(format('select * from retail.fn_producto_se_puede_eliminar(%L)', :'va'));
reset role;
set local role anon;
select pg_temp.intento(format('select retail.eliminar_producto(%L)', :'va'));
reset role;
${sesion(FELIPE)}
select pg_temp.huella(:'va');`);
  const [antes, nadie, nadieLee, puedeEditar, micaela, micaelaLee, anon, sigue] = lineas(r);
  esperar("una sesión sin persona no elimina (42501)", r.ok && nadie === "42501|-|Solo un líder puede eliminar productos.", r);
  esperar("ni siquiera consulta si se puede", r.ok && nadieLee === "42501|-|Solo un líder puede eliminar productos.", r);
  esperar("(contraste) una integrante con Productos SÍ puede editar el catálogo", r.ok && puedeEditar === "true", r);
  esperar("…y aun así no elimina: borrar un producto es solo del líder", r.ok && micaela === "42501|-|Solo un líder puede eliminar productos.", r);
  esperar("…ni consulta si se puede", r.ok && micaelaLee === "42501|-|Solo un líder puede eliminar productos.", r);
  esperar("anon ni siquiera puede llamar la función", r.ok && anon.includes("permission denied for function eliminar_producto"), r);
  esperar("y el producto sigue completo", r.ok && sigue === antes && antes.startsWith("1|2|"), r);
}

// 9. Un Admin (Líder activo con rol admin en Dynamic) elimina: «adm y líderes» = quienes pasan fn_es_lider().
{
  const r = correr(`${ESCENA}
update public.personas set rol = 'admin' where auth_user_id = '${FELIPE}';
select retail.fn_es_admin()::text || '|' || retail.fn_es_lider()::text;
select retail.eliminar_producto(:'va');
select pg_temp.huella(:'va');`);
  const [admin, devuelto, despues] = lineas(r);
  esperar("la cuenta es Admin y Líder a la vez (un Admin es un Líder activo)", r.ok && admin === "true|true", r);
  esperar("un Admin elimina el producto", r.ok && devuelto === "Virgen A" && despues === "0|0|0|0|0", r);
}

// 10. Un producto que ya no existe (doble clic; otra persona lo eliminó con la pantalla abierta).
{
  const r = correr(`${ESCENA}
select retail.eliminar_producto(:'va') as _e \\gset
select pg_temp.intento(format('select retail.eliminar_producto(%L)', :'va'));
select pg_temp.intento(format('select retail.eliminar_producto(%L)', gen_random_uuid()));`);
  const [otraVez, fantasma] = lineas(r);
  esperar("eliminar dos veces el mismo producto: la segunda lo dice", r.ok && otraVez === "P0001|producto_invalido|Ese producto ya no existe. Recarga la pantalla.", r);
  esperar("eliminar un producto que nunca existió, igual", r.ok && fantasma === "P0001|producto_invalido|Ese producto ya no existe. Recarga la pantalla.", r);
}

// 11. Red de seguridad: una tabla nueva cita a la variante y la función no la conoce → la llave frena y no queda nada a medias.
{
  const r = correr(`${ESCENA}
create table retail.zz_cita_variante (variante_id uuid references retail.variantes (id));
insert into retail.zz_cita_variante select id from retail.variantes where sku = 'VIRGEN-A-1';
select pg_temp.huella(:'va');
select pg_temp.puede(:'va');
select pg_temp.intento(format('select retail.eliminar_producto(%L)', :'va'));
select pg_temp.huella(:'va');`);
  const [antes, puede, mensaje, despues] = lineas(r);
  esperar("la función todavía no conoce esa tabla: dice que se puede", r.ok && puede === "true|", r);
  esperar("pero eliminar lo frena la llave y lo dice en castellano, con su hint", r.ok && /^P0001\|producto_con_historia\|No se puede eliminar «Virgen A»: otra parte del sistema todavía lo usa/.test(mensaje), r);
  esperar("todo o nada: no se borró ni la foto ni el código de la variante que sí se podía", r.ok && antes === despues && antes.startsWith("1|2|"), r);
}

// 12. DERIVA. Toda tabla que cite `productos` o `variantes` tiene que estar clasificada. Si esta prueba falla es que
// nació una tabla nueva: decide si es SUYA (se borra con la ficha: agrégala a `eliminar_producto`) o HISTORIA (frena el
// borrado: agrégala a `fn_producto_se_puede_eliminar` y a la lista de abajo).
{
  const SUYAS = ["variantes", "stock", "codigos_barras", "producto_fotos", "variante_etiquetas"];
  const HISTORIA = [
    "venta_items", "movimientos", "compra_items", "producciones", "transferencia_items", "apartados", "separacion_items",
    "conteo_items", "cambios", "prendas_danadas", "prendas_por_regularizar", "bajada_piso_items", "costo_historial",
    "pedidos_no_atendidos",
  ];
  // Las cuenta su tabla madre: una línea de producción cuelga de una orden del MISMO producto; una recepción de traslado, de
  // una línea de traslado de la misma prenda.
  const POR_SU_MADRE = ["produccion_lineas", "transferencia_recepciones"];
  const conocidas = [...SUYAS, ...HISTORIA, ...POR_SU_MADRE].map((t) => `'retail.${t}'`).join(", ");
  const r = correr(`select coalesce(string_agg(distinct c.conrelid::regclass::text, ', '), 'NINGUNA')
    from pg_constraint c
   where c.contype = 'f' and c.confrelid in ('retail.productos'::regclass, 'retail.variantes'::regclass)
     and c.conrelid::regclass::text not in (${conocidas});`);
  esperar(
    `toda tabla que cita a productos o variantes está clasificada (suya, historia, o contada por su madre)${r.ok && r.salida !== "NINGUNA" ? ` — SIN CLASIFICAR: ${r.salida}` : ""}`,
    r.ok && r.salida === "NINGUNA",
    r
  );
}

console.log(`\n${casos - fallos}/${casos} casos pasaron.`);
if (fallos > 0) process.exit(1);
