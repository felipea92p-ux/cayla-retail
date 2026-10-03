-- ============================================================================
-- 20261003232000_eliminar_producto_quien_edita_catalogo.sql — CAYLA V2 · ADR-0252 (actualización 2026-10-03)
-- Eliminar un producto deja de ser «solo Líder / solo Admin»: lo hace quien edita el catálogo.
--
-- EL PROBLEMA PRIMERO. El 2026-10-03 la cuenta de almacén registró productos que no eran. Puede crear productos (ve
-- Productos y edita el catálogo), pero no deshacerlos: la tarjeta del catálogo no le mostraba «Eliminar» y la base
-- tampoco la habría dejado. Eliminar sin historia era solo del Líder (ADR-0218) y con historia de stock, solo del Admin
-- (ADR-0252). Un producto que nace con stock ya tiene historia (la carga inicial es un movimiento), así que lo que
-- registra almacén solo lo podía borrar un Admin.
--
-- LA DECISIÓN (Felipe, 2026-10-03, entre tres opciones: «lo que tu cuenta registró», «quien edita el catálogo» y «no
-- cambiar»): **quien edita el catálogo** (`fn_puede_editar_catalogo()`: Líder, o un rol que ve Productos o
-- Categorías/atributos) elimina cualquier producto que no tenga documentos, con su historia de stock y con respaldo. No se
-- nombra ningún rol: la cuenta de almacén entra porque ya edita el catálogo (ADR-0161: nunca se asigna un permiso a un rol
-- desde el código). Es la opción que ADR-0218 descartó («borrar un producto es más grave que borrar una marca»); Felipe la
-- elige sabiendo que una cuenta de tienda puede borrar inventario que cargó otra sede, y que lo mitigan la ventana (dice
-- quién lo cargó y cuándo), el respaldo y la línea en Actividad.
--
-- LO QUE NO CAMBIA. Qué se puede borrar: con ventas, compras, producción, costos, traslados, separaciones o lo recibido de
-- un proveedor, nadie lo elimina desde la web (`fn_producto_historia`, sin tocar). La pieza «Monto manual», nunca. El
-- respaldo, los candados de historial y el rastro, igual. Firma el responsable del combo (`fn_actor_persona_id(true)`).
--
-- QUÉ HACE. Cuatro candados cambian de `fn_es_lider()` / `fn_es_admin()` a `fn_puede_editar_catalogo()`:
--   · `fn_producto_se_puede_eliminar` y `eliminar_producto` (sin historia; antes, Líder);
--   · `fn_producto_como_eliminar` (lo que pregunta la ventana; antes, Líder) — y `puedes` en «con historia» ya no es
--     `fn_es_admin()`: quien pasa el candado puede;
--   · `eliminar_producto_con_historia` (antes, Admin).
-- Un Admin es un Líder y un Líder edita el catálogo: nadie que podía antes deja de poder.
--
-- ESTADO QUE DEJA DE SER POSIBLE: una cuenta que crea productos y no puede deshacer uno que registró por error.
--
-- POR QUÉ POR ANCLA. Las cuatro funciones viven en producción con parches posteriores (la libreta de Frescura en
-- `eliminar_producto_con_historia` y `fn_producto_historia`, 20261001100200). Reescribirlas desde su archivo los borraría.
-- `pg_temp.reemplazar_unico` cambia un texto que debe aparecer UNA sola vez y aborta si no; si el texto nuevo ya está, no
-- hace nada (re-pegable). Sin `select … into` dentro de los textos entre comillas (ADR-0288).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor (ya trae `retail.`), ANTES de publicar la web (si la web llega
-- antes, la ventana de una cuenta sin rango de Líder dice «No se pudo comprobar» y no ofrece borrar). Una sola parte: sin
-- políticas ni `alter` de tablas (ADR-0195 no aplica). Idempotente.
--
-- SE ROMPE SI alguien vuelve a pegar 20260926220000_eliminar_producto.sql o 20260928230000_eliminar_producto_con_historia.sql
-- (recrean las funciones desde el archivo y devuelven «solo Líder» / «solo Admin»). Lo vigilan las pruebas
-- `pnpm pruebas:eliminar-producto` y `pnpm pruebas:eliminar-producto-con-historia`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.eliminar_producto_con_historia(uuid)') is null
     or to_regprocedure('retail.fn_producto_como_eliminar(uuid)') is null
     or to_regprocedure('retail.eliminar_producto(uuid)') is null
     or to_regprocedure('retail.fn_producto_se_puede_eliminar(uuid)') is null then
    raise exception 'Faltan las funciones de Eliminar: pega antes 20260926220000_eliminar_producto.sql y 20260928230000_eliminar_producto_con_historia.sql.';
  end if;
  if to_regprocedure('retail.fn_puede_editar_catalogo()') is null then
    raise exception 'Falta retail.fn_puede_editar_catalogo(): pega antes 20260923030000_roles_por_modulo.sql.';
  end if;
end $$;

create or replace function pg_temp.reemplazar_unico(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_viejo in v_def) = 0 and position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ==================== 1. Sin historia: ¿se puede? y eliminar ====================
select pg_temp.reemplazar_unico(
  'retail.fn_producto_se_puede_eliminar(uuid)',
  $v$if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede eliminar productos.' using errcode = '42501';$v$,
  $n$if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes eliminar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.' using errcode = '42501';$n$
);

select pg_temp.reemplazar_unico(
  'retail.eliminar_producto(uuid)',
  $v$if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede eliminar productos.' using errcode = '42501';$v$,
  $n$if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes eliminar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.' using errcode = '42501';$n$
);

-- ==================== 2. Lo que pregunta la ventana ====================
select pg_temp.reemplazar_unico(
  'retail.fn_producto_como_eliminar(uuid)',
  $v$if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede eliminar productos.' using errcode = '42501';$v$,
  $n$if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes eliminar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.' using errcode = '42501';$n$
);

-- Con historia de stock: quien pasó el candado de arriba puede (antes: solo un Admin).
select pg_temp.reemplazar_unico(
  'retail.fn_producto_como_eliminar(uuid)',
  $v$return query select 'con_historia'::text, retail.fn_es_admin(), $v$,
  $n$return query select 'con_historia'::text, true, $n$
);

-- ==================== 3. Eliminar con su historia de stock ====================
select pg_temp.reemplazar_unico(
  'retail.eliminar_producto_con_historia(uuid)',
  $v$if not retail.fn_es_admin() then
    raise exception 'Solo una cuenta Admin puede eliminar un producto con su historia.' using errcode = '42501';
  end if;
  -- El responsable del combo (ADR-0161/0162): un Admin firma a su nombre.$v$,
  $n$if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes eliminar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.' using errcode = '42501';
  end if;
  -- El responsable del combo (ADR-0161/0162): quien está en la tienda firma a su nombre (en una terminal, el del combo).$n$
);

-- ==================== 4. Lo que dice cada función de sí misma ====================
comment on function retail.fn_producto_se_puede_eliminar(uuid) is
  'Productos ▸ Eliminar: ¿se puede sin historia? (puede, razon). Quien edita el catálogo (fn_puede_editar_catalogo; ADR-0252, act. 2026-10-03). No se puede si el producto ya se usó (fn_producto_historia) o si es la pieza «Monto manual» del punto de venta. La razón viene lista para mostrar. La usa eliminar_producto.';
comment on function retail.eliminar_producto(uuid) is
  'Productos ▸ Eliminar: borra un producto y lo que nació con su ficha (variantes, códigos de barras, fotos, stock en cero), todo o nada, SOLO si nunca se movió (fn_producto_se_puede_eliminar). Quien edita el catálogo (fn_puede_editar_catalogo; ADR-0252, act. 2026-10-03). Con historia se usa eliminar_producto_con_historia. Deja una fila en historial_producto_cambios (campo eliminado). Devuelve la referencia del producto eliminado.';
comment on function retail.fn_producto_como_eliminar(uuid) is
  'Productos ▸ Eliminar (ventana): (nivel, puedes, razon, prendas, movimientos, cargado_por, cargado_el). nivel libre = sin historia (eliminar_producto); con_historia = solo historia de stock (eliminar_producto_con_historia, con respaldo); con_documentos = ventas, compras, traslados, separaciones… (nadie desde la web); sistema = pieza «Monto manual». Quien edita el catálogo (fn_puede_editar_catalogo); antes Líder / Admin. ADR-0252, act. 2026-10-03.';
comment on function retail.eliminar_producto_con_historia(uuid) is
  'Productos ▸ Eliminar con su historia (ADR-0252, act. 2026-10-03): quien edita el catálogo (fn_puede_editar_catalogo; antes, solo Admin). Borra, todo o nada, un producto cuya historia es solo de stock (movimientos, conteos, bajadas al piso, pedidos no atendidos, apartados cerrados sin dinero, decisiones de Frescura) junto con su ficha. Con ventas, compras, producción, costos, traslados, separaciones o lo recibido de un proveedor se rechaza. Respalda cada fila en respaldo_purgas.filas (scripts/purga/restaurar-purga.sql la devuelve), deja rastro en historial_producto_cambios y en Actividad, y deja los candados de historial como estaban. Devuelve la referencia.';
