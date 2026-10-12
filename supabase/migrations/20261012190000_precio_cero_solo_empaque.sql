-- ============================================================================
-- 20261012190000_precio_cero_solo_empaque.sql — CAYLA V2 (ADR-0380, Felipe 2026-10-12)
--
-- EL PROBLEMA PRIMERO. Una prenda con precio S/ 0 se podía crear, aprobar y vender. Una celda de la tabla de precios de Nuevo
-- producto con «0», o una prenda que alguien propuso en el conteo con el precio en 0 («déjalo en 0 y lo completa el Líder»), llegaba
-- a la caja a S/ 0.00. `registrar_venta` solo comparaba el precio de la caja con el del catálogo (0 = 0 pasaba): con otra prenda en
-- el mismo ticket, la prenda en 0 salía de la tienda, descontaba stock y —porque `itemsParaLucode` salta una línea de precio 0, que
-- es la bolsa de obsequio— ni siquiera se declaraba a SUNAT. Nadie se enteraba.
--
-- LA REGLA YA EXISTÍA, PERO SOLO EN UNA PANTALLA. Felipe decidió el 2026-10-11 (ADR-0377): «el 0 vale solo en una categoría cuya
-- familia está fuera de los motores» (Empaque: la bolsa de obsequio). Editar producto la aplica (`precioValido`,
-- apps/web/lib/variantes-ficha-reglas.ts). Esta migración la lleva a la base, a las cuatro puertas por donde una prenda en 0 pasaba:
--
--   1. `fn_categoria_admite_precio_cero(categoría)` — la regla, en un solo lugar: sí solo si la familia de la categoría está fuera
--      de los motores; sin categoría o sin dato, NO (una prenda que no sabemos qué es se trata como mercadería).
--   2. `registrar_venta` — una prenda de mercadería con precio 0 no se vende (`venta_sin_precio`). Se mira el precio que SE COBRA
--      (`fn_precio_en_sede`: el de la tienda, si tiene). La centinela (Prenda sin registrar, pieza de liquidación) vale 0 en el
--      catálogo y lleva su precio en la línea: no entra.
--   3. `revisar_producto_censo` — aprobar una prenda con una variante ACTIVA en 0 se niega (`sin_precio`). PROPONERLA en 0 sigue
--      pudiendo (el conteo, la muestra del Taller de ADR-0361): aprobar es decir «está lista», y en S/ 0 no lo está. Rechazarla sí se
--      puede. Esto ajusta el «Aprobar nunca se bloquea» del ADR-0371, que se escribió para los candados del RECHAZO.
--   4. `crear_producto_con_variantes` (Nuevo producto) y `catalogo_actualizar_producto` (Editar producto) — una variante activa no
--      nace ni queda en 0 fuera de Empaque (`sin_precio`). Una desactivada sí (no se vende).
--
-- POR QUÉ NO UN DISPARADOR EN `variantes`. Sería un solo candado para todas las puertas, pero rompería dos caminos que usan el 0 a
-- propósito (el conteo y la muestra del Taller, cuando los hace un líder la prenda nace aprobada) y toca el núcleo (principio 1). El
-- candado que importa es el de la VENTA: ese no tiene excepciones de flujo.
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna venta cobra S/ 0 por una prenda de mercadería; ninguna prenda en 0 se aprueba, nace por Nuevo producto ni queda
--            así al editarla, salvo en una familia fuera de los motores. Lo que ya estaba en 0 no se toca (en producción, el
--            2026-10-12: solo la Bolsa de Obsequio, que es de Empaque).
--   ASUME:   `fn_categoria_entra_a_motores` (20261010231000) y la `registrar_venta` con las piezas de liquidación (20261010195000).
--   NO HACE: no toca `censo_crear_variante` ni `abrir_produccion_con_modelo_nuevo` (proponer en 0 sigue siendo válido), ni tablas,
--            ni políticas, ni disparadores.
--
-- CÓMO SE PEGA. Una sola parte: solo funciones (sin `alter` de tablas ni políticas, ADR-0195). Los cuatro cambios son reemplazos
-- ANCLADOS sobre la definición VIVA (ADR-0288; `registrar_venta` ya se redefinió muchas veces y copiar un cuerpo viejo pisaría lo
-- que vino después): si un trozo no está exactamente una vez, la migración se detiene sin tocar nada. Es idempotente: pegarla dos
-- veces no duplica nada. Dentro de los textos entre comillas no hay ningún `select … into` (ADR-0288: el SQL Editor lo confunde con
-- un SELECT INTO). Verificado el 2026-10-12: las cuatro funciones de producción tienen los trozos anclados, igual que el local.
-- ============================================================================
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. La regla
-- ----------------------------------------------------------------------------
create or replace function retail.fn_categoria_admite_precio_cero(p_categoria_id uuid)
returns boolean
language sql
stable
set search_path = retail, public
as $$
  -- ADR-0377/0380: el precio 0 solo vale donde lo que se vende no es mercadería (bolsas, cajas, empaque). Es la misma frontera que
  -- la de los motores, a propósito: Felipe la definió así. Sin categoría o sin dato, `fn_categoria_entra_a_motores` dice «sí entra»
  -- y esto dice «no admite 0».
  select p_categoria_id is not null and not retail.fn_categoria_entra_a_motores(p_categoria_id);
$$;

comment on function retail.fn_categoria_admite_precio_cero(uuid) is
  'ADR-0380: ¿una variante de esta categoría puede tener precio 0? Solo si su familia está fuera de los motores (Empaque). Sin categoría o sin dato: no.';

revoke all on function retail.fn_categoria_admite_precio_cero(uuid) from public, anon;
grant execute on function retail.fn_categoria_admite_precio_cero(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- El reemplazo anclado (el mismo de 20261010220100): si el texto nuevo ya está, no hace nada; si el ancla no aparece exactamente
-- `p_veces` veces, se detiene sin tocar nada.
-- ----------------------------------------------------------------------------
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ----------------------------------------------------------------------------
-- 2. La venta
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$    -- ADR-0371: una pieza de liquidación se cobra al precio de su etiqueta vigente, sin descuentos, en su sede.$v$,
  $v$    -- ADR-0380: una prenda de mercadería sin precio no se vende: el 0 solo vale en una familia fuera de los motores (la bolsa de
    -- obsequio). Se mira el precio que se cobra (el de la tienda, si tiene). La centinela —prenda sin registrar, pieza de
    -- liquidación— vale 0 en el catálogo y lleva el suyo en la línea: no entra aquí.
    if (v_item ->> 'variante_id')::uuid <> c_cargo_especial
       and v_precio_catalogo <= 0
       and not retail.fn_categoria_admite_precio_cero(
             (select pv.categoria_id from retail.variantes vv join retail.productos pv on pv.id = vv.producto_id
               where vv.id = (v_item ->> 'variante_id')::uuid)) then
      raise exception 'venta_sin_precio'
        using detail = v_referencia || ' (' || v_sku || ')',
              hint = 'La prenda no tiene precio en el catálogo: ponle precio en su ficha antes de venderla.';
    end if;

    -- ADR-0371: una pieza de liquidación se cobra al precio de su etiqueta vigente, sin descuentos, en su sede.$v$,
  1);

-- ----------------------------------------------------------------------------
-- 3. La aprobación
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar(
  'retail.revisar_producto_censo(uuid, boolean)',
  $v$  -- El disparador `productos_estado_alta_biut` valida la transición, firma `aprobado_por` y, al rechazar, apaga `estado`.$v$,
  $v$  -- ADR-0380: una prenda sin precio no se aprueba. Proponerla en 0 sí se puede (el conteo: «déjalo en 0 y lo completa el Líder»;
  -- la muestra del Taller, ADR-0361); aprobarla es decir «está lista», y en S/ 0 no lo está. Cuentan las variantes ACTIVAS (una
  -- desactivada no se vende) y el 0 solo vale en una familia fuera de los motores (la bolsa de obsequio, ADR-0377). Rechazar no mira
  -- el precio. La prenda ya está bloqueada (`for update`, arriba): Editar producto, que también la bloquea, espera a que esto termine.
  if p_aprobar
     and not retail.fn_categoria_admite_precio_cero((select pc.categoria_id from retail.productos pc where pc.id = p_producto_id))
     and exists (select 1 from retail.variantes vc where vc.producto_id = p_producto_id and vc.activo and vc.precio <= 0) then
    raise exception 'No se puede aprobar «%»: tiene % en S/ 0. Ponle precio en su ficha y vuelve a aprobarla; mientras tanto, la caja no la deja vender.',
      v_ref,
      (select case when count(*) = 1 then 'una variante' else count(*) || ' variantes' end
         from retail.variantes vc where vc.producto_id = p_producto_id and vc.activo and vc.precio <= 0)
      using hint = 'sin_precio';
  end if;

  -- El disparador `productos_estado_alta_biut` valida la transición, firma `aprobado_por` y, al rechazar, apaga `estado`.$v$,
  1);

-- ----------------------------------------------------------------------------
-- 4a. Nuevo producto
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar(
  'retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid)',
  $v$    if v_precio is null or v_precio < 0 then
      raise exception 'Cada variante necesita un precio de venta (0 o más)';
    end if;$v$,
  $v$    if v_precio is null or v_precio < 0 then
      raise exception 'Cada variante necesita un precio de venta mayor que S/ 0.';
    end if;
    -- ADR-0380: el 0 solo vale en una familia fuera de los motores (la bolsa de obsequio). Nuevo producto pide además un precio
    -- mayor que 0 siempre (ADR-0377): esta es la red de la base, por si un camino se salta la pantalla.
    if v_precio = 0 and not retail.fn_categoria_admite_precio_cero(p_categoria_id) then
      raise exception 'Cada variante necesita un precio de venta mayor que S/ 0. En la tabla de precios, una celda vacía toma el precio de todas.'
        using hint = 'sin_precio';
    end if;$v$,
  1);

-- ----------------------------------------------------------------------------
-- 4b. Editar producto
-- ----------------------------------------------------------------------------
select pg_temp.reemplazar(
  'retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid, uuid, uuid, boolean, integer)',
  $v$    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;$v$,
  $v$    if v_variante->>'precio' is null then
      raise exception 'Cada variante necesita un precio.';
    end if;
    -- ADR-0380: una variante ACTIVA no queda en S/ 0, salvo en una familia fuera de los motores (la bolsa de obsequio, ADR-0377).
    -- La ficha ya lo frenaba (`precioValido`); esta es la red de la base. Una desactivada sí puede (no se vende). La categoría es
    -- la de este guardado: si la bolsa pasa a una categoría de mercadería, el 0 vuelve a frenarse.
    if (v_variante->>'precio')::numeric <= 0
       and coalesce((v_variante->>'activo')::boolean, true)
       and not retail.fn_categoria_admite_precio_cero(p_categoria_id) then
      raise exception 'Una variante activa no puede quedar en S/ 0: ponle precio o desactívala.'
        using hint = 'sin_precio';
    end if;$v$,
  1);

-- ----------------------------------------------------------------------------
-- Comprobación: las cuatro quedaron con su candado. Si no, nada de lo de arriba queda (todo va en una transacción).
-- ----------------------------------------------------------------------------
do $$
begin
  if position('venta_sin_precio' in pg_get_functiondef('retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)'::regprocedure)) = 0
     or position('sin_precio' in pg_get_functiondef('retail.revisar_producto_censo(uuid, boolean)'::regprocedure)) = 0
     or position('fn_categoria_admite_precio_cero' in pg_get_functiondef('retail.crear_producto_con_variantes(text, uuid, jsonb, text, uuid, uuid, uuid, boolean, uuid[], uuid, uuid)'::regprocedure)) = 0
     or position('fn_categoria_admite_precio_cero' in pg_get_functiondef('retail.catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid, uuid, uuid, boolean, integer)'::regprocedure)) = 0 then
    raise exception 'ADR-0380: alguna de las cuatro funciones no quedó con su candado del precio 0';
  end if;
end;
$$;
