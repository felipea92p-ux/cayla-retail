-- ============================================================================
-- 20260928235500_corregir_talla_color_de_variante_sin_historia.sql (ADR-0258)
-- Color y talla de una variante se corrigen mientras la variante no tenga historia (Felipe, 2026-09-28)
--
-- EL PROBLEMA PRIMERO. Al editar una prenda, color y talla de una variante que ya existe no se podían cambiar
-- (`ProductoForm.tsx`, «Identidad de variante»; hueco 3 de docs/datos/modulos/02-catalogo-y-vocabulario.md). La regla
-- protege lo correcto —una variante con stock, ventas o traslados tiene prendas colgadas con su etiqueta y un historial
-- que habla de ESA talla— pero también bloqueaba el caso más común: alguien crea «Blusa Aurora» con M donde iba L, se
-- da cuenta antes de recibirla, y la única salida era desactivar la fila equivocada y agregar otra (86 de las 207
-- variantes de producción no tienen ni un movimiento, 2026-09-28).
-- Y la regla vivía solo en la pantalla y en la RPC: la política `variantes_write_lider` deja a quien edita catálogo
-- hacer un `update variantes set talla_id = …` directo por la API sobre una variante con ventas. Ese es el hueco 3.
--
-- LA DECISIÓN (Felipe, 2026-09-28): permitirlo solo en variantes SIN HISTORIA.
--
-- QUÉ ES «SIN HISTORIA». Ninguna fila en ninguna tabla que apunte a la variante con llave foránea (movimientos, stock,
-- venta_items, compra_items, apartados, traslados, conteos, producción, cambios, costo_historial…), salvo dos que son
-- parte de la propia ficha y viajan con ella: `codigos_barras` (sus códigos, se renombran abajo) y
-- `variante_etiquetas` (etiquetas de catálogo). La lista se lee de `pg_constraint` en cada llamada, no se escribe a
-- mano: una tabla nueva que apunte a variantes (una devolución, un pedido) cuenta como historia sin tocar esta
-- función. Medido en producción: toda fila de `stock` tiene su movimiento, así que no hay stock «huérfano» que la
-- regla deje pasar.
--
-- QUÉ PROMETE.
--   1. `fn_variantes_con_historia(uuid[])`: de esas variantes, cuáles ya tienen historia. SECURITY DEFINER: las
--      tablas de operación tienen RLS por sede y quien edita puede no ver la venta de otra tienda (el mismo motivo que
--      `fn_variantes_con_costo_oficial`). Solo dice SÍ/NO por variante.
--   2. Candado en la tabla `variantes_identidad_sin_historia`: una sesión de la API (`authenticated`/`anon`) no cambia
--      color, talla ni código de una variante con historia — ni por la ficha ni por un update directo. Cierra el
--      hueco 3. Las funciones SECURITY DEFINER (el trigger que asigna el código al crear) corren como su dueño y pasan.
--   3. `fn_corregir_identidad_variante`: la usa `catalogo_actualizar_producto` por cada variante existente. Si el
--      formulario trae otro color u otra talla y la variante no tiene historia, los cambia, recalcula `codigo` con el
--      mismo formato que `fn_asignar_codigo_variante` y renombra su fila en `codigos_barras` (no se borra ninguna). Si
--      tiene historia, lo dice con palabras (hint `variante_con_historia`) en vez de ignorar el cambio en silencio.
--   4. `fn_registrar_cambio_producto` anota color, talla y código en `historial_producto_cambios`.
--
-- QUÉ NO HACE.
--   - El SKU no se toca por su cuenta: 205 de 207 variantes no tienen, y la ficha manda uno sugerido para todas. Si se
--     guardara, un guardado de solo precio escribiría SKU en decenas de variantes y dos sugeridos iguales chocarían con
--     `variantes_sku_key`. Una variante que SÍ tiene SKU lo conserva al corregirle color o talla.
--   - No sabe si alguien ya imprimió la etiqueta: no hay registro de impresiones. Una variante sin movimientos nunca
--     entró a una sede, así que no hay prenda colgada con ella; si la etiqueta se imprimió igual, se vuelve a imprimir
--     (la pantalla lo dice).
--   - No cambia ninguna fila existente al pegarse.
--
-- CÓMO. `catalogo_actualizar_producto` y `fn_registrar_cambio_producto` se parchan por ANCLA sobre la definición VIVA
-- (`pg_get_functiondef`), el mismo patrón que 20260927190000: producción puede tener un cuerpo distinto del repo. Cada
-- ancla tiene que aparecer EXACTAMENTE una vez o la migración aborta sin tocar nada. Re-pegable: si ya está el parche,
-- no hace nada.
--
-- ORDEN PARA PRODUCCIÓN: primero ESTA migración, después la web. La web vieja con la base nueva sigue igual (manda el
-- color y la talla que leyó, no cambia nada). La web nueva con la base vieja no puede saber qué variantes no tienen
-- historia y las muestra todas fijas, como hoy.
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path` y el prefijo `retail.`; sin políticas ni `drop trigger` (usa
-- `create or replace trigger`), así que va en una sola parte.
--
-- CÓMO SE DESHACE.
--   `drop trigger if exists variantes_identidad_sin_historia on retail.variantes;` pegado SOLO, en su propia
--   transacción (un drop trigger toma auth/storage: CLAUDE.md «Políticas y deadlocks»).
--   En `catalogo_actualizar_producto`, quitar la línea `perform retail.fn_corregir_identidad_variante(…)`.
--   drop function if exists retail.fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb);
--   drop function if exists retail.fn_identidad_variante_sin_historia();
--   drop function if exists retail.fn_variantes_con_historia(uuid[]);
--   Las filas ya escritas en `historial_producto_cambios` se quedan: el historial no se edita.
-- ============================================================================

set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- 1. Qué variantes ya tienen historia
-- ----------------------------------------------------------------------------
create or replace function retail.fn_variantes_con_historia(p_ids uuid[])
returns uuid[]
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_fk record;
  v_parcial uuid[];
  v_resultado uuid[] := '{}'::uuid[];
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return v_resultado;
  end if;
  -- Toda llave foránea de una sola columna que apunta a retail.variantes, salvo las dos que son parte de la ficha.
  for v_fk in
    select c.conrelid::regclass as tabla, a.attname as columna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'retail.variantes'::regclass
       and cardinality(c.conkey) = 1
       and c.conrelid not in ('retail.codigos_barras'::regclass, 'retail.variante_etiquetas'::regclass)
  loop
    execute format('select array_agg(distinct %1$I) from %2$s where %1$I = any ($1)', v_fk.columna, v_fk.tabla)
      into v_parcial using p_ids;
    if v_parcial is not null then
      v_resultado := array(select distinct unnest(v_resultado || v_parcial));
    end if;
  end loop;
  return v_resultado;
end;
$$;
revoke all on function retail.fn_variantes_con_historia(uuid[]) from public, anon;
grant execute on function retail.fn_variantes_con_historia(uuid[]) to authenticated;

comment on function retail.fn_variantes_con_historia(uuid[]) is
  'De las variantes pedidas, las que ya tienen historia: alguna fila en una tabla que las referencia (movimientos, ventas, compras, traslados…), salvo codigos_barras y variante_etiquetas. Color y talla solo se corrigen sin historia (20260928235500).';

-- ----------------------------------------------------------------------------
-- 2. El candado en la tabla
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER a propósito: `current_user` tiene que ser quien escribe (mismo patrón que
-- fn_costo_hasta_la_primera_compra). El código que se ASIGNA por primera vez (null → valor, trigger de alta) no cuenta.
create or replace function retail.fn_identidad_variante_sin_historia()
returns trigger
language plpgsql
set search_path to 'retail', 'public', 'extensions'
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.color_codigo is distinct from old.color_codigo
          or new.talla_id is distinct from old.talla_id
          or (old.codigo is not null and new.codigo is distinct from old.codigo))
     and new.id = any (retail.fn_variantes_con_historia(array[new.id])) then
    raise exception 'La variante % ya tiene movimientos (stock, ventas o traslados): su color y su talla no se cambian. Desactívala y agrega la correcta.',
      coalesce(old.codigo, old.sku, 'esta')
      using hint = 'variante_con_historia';
  end if;
  return new;
end;
$$;

-- `create or replace trigger`, nunca `drop trigger` + `create trigger` (CLAUDE.md, «Políticas y deadlocks», ADR-0195).
create or replace trigger variantes_identidad_sin_historia
  before update of color_codigo, talla_id, codigo on retail.variantes
  for each row execute function retail.fn_identidad_variante_sin_historia();

-- ----------------------------------------------------------------------------
-- 3. La corrección, desde la ficha
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER: escribe `variantes` y `codigos_barras` con los permisos de quien edita (política
-- `*_write_lider` → fn_puede_editar_catalogo); el candado de arriba repite la regla por si alguien la llama suelta.
create or replace function retail.fn_corregir_identidad_variante(
  p_variante_id uuid,
  p_producto_id uuid,
  p_categoria_id uuid,
  p_variante jsonb
)
returns void
language plpgsql
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_actual record;
  v_color text;
  v_talla uuid;
  v_base text;
  v_codigo text;
begin
  -- `for update`: una venta o un traslado que entra a la vez toma un candado de llave sobre esta fila; así uno espera
  -- al otro y la pregunta de «¿tiene historia?» ve lo que el otro dejó.
  select id, color_codigo, talla_id, codigo into v_actual
    from retail.variantes
   where id = p_variante_id and producto_id = p_producto_id
   for update;
  if not found then
    return;  -- el update de catalogo_actualizar_producto tampoco la encuentra: mismo comportamiento que antes
  end if;

  -- Un formulario que no manda la llave no pide cambiarla.
  v_color := case when p_variante ? 'color_codigo' then nullif(p_variante->>'color_codigo', '') else v_actual.color_codigo end;
  v_talla := case when p_variante ? 'talla_id' then nullif(p_variante->>'talla_id', '')::uuid else v_actual.talla_id end;
  if v_color is not distinct from v_actual.color_codigo and v_talla is not distinct from v_actual.talla_id then
    return;
  end if;

  if p_variante_id = any (retail.fn_variantes_con_historia(array[p_variante_id])) then
    raise exception 'La variante % ya tiene movimientos (stock, ventas o traslados): su color y su talla no se cambian. Desactívala y agrega la correcta.',
      coalesce(v_actual.codigo, 'esta')
      using hint = 'variante_con_historia';
  end if;

  if v_talla is not null and not exists (
    select 1 from retail.categoria_tallas where categoria_id = p_categoria_id and talla_id = v_talla
  ) then
    raise exception 'Esa talla no está habilitada para la categoría elegida.';
  end if;

  -- Mismo formato que fn_asignar_codigo_variante (base del producto - color - token de talla). Si esa función
  -- cambia de formato, este también.
  select p.codigo into v_base from retail.productos p where p.id = p_producto_id;
  if v_base is null then
    v_base := retail.fn_asignar_codigo_producto(p_producto_id);
  end if;
  v_codigo := v_base
    || case when v_color is null then '' else '-' || v_color end
    || '-' || retail.fn_token_talla((select t.valor from retail.tallas t where t.id = v_talla));

  update retail.variantes
     set color_codigo = v_color, talla_id = v_talla, codigo = v_codigo
   where id = p_variante_id;

  -- El código viejo deja de leer esta variante: su fila se RENOMBRA (no se borra). Si no tenía, se crea.
  update retail.codigos_barras
     set codigo = v_codigo
   where variante_id = p_variante_id and origen = 'propio' and codigo = v_actual.codigo
     and v_actual.codigo is distinct from v_codigo;
  insert into retail.codigos_barras (codigo, variante_id, origen)
  values (v_codigo, p_variante_id, 'propio')
  on conflict (codigo) do nothing;
end;
$$;
revoke all on function retail.fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function retail.fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb) to authenticated;

comment on function retail.fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb) is
  'Cambia color y talla de una variante existente si no tiene historia, recalcula su código y renombra su código de barras propio. La llama catalogo_actualizar_producto (20260928235500).';

-- ----------------------------------------------------------------------------
-- 4. catalogo_actualizar_producto la llama por cada variante existente (ancla sobre la definición viva)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_veces int;
  v_ancla constant text := $a$    if v_id is not null then
      if v_ve_costo then$a$;
  v_nuevo constant text := $n$    if v_id is not null then
      -- 20260928235500: color y talla se corrigen si la variante no tiene historia; si tiene, lo dice.
      perform retail.fn_corregir_identidad_variante(v_id, p_producto_id, p_categoria_id, v_variante);
      if v_ve_costo then$n$;
  v_firma constant regprocedure :=
    'retail.catalogo_actualizar_producto(uuid,text,text,jsonb,uuid,text,integer,text,boolean,jsonb,uuid,uuid,uuid,uuid,boolean,integer)'::regprocedure;
begin
  v_def := pg_get_functiondef(v_firma);
  if position('fn_corregir_identidad_variante' in v_def) > 0 then
    raise notice '20260928235500: catalogo_actualizar_producto ya llamaba a fn_corregir_identidad_variante (se volvió a pegar)';
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '20260928235500: catalogo_actualizar_producto no tiene el ancla esperada (aparece % veces). Revisar su definición antes de pegar.', v_veces;
  end if;
  execute replace(v_def, v_ancla, v_nuevo);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. El historial anota color, talla y código (ancla sobre la definición viva)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_veces int;
  v_ancla constant text := $a$elsif TG_TABLE_NAME = 'variantes' then$a$;
  v_nuevo constant text := $n$elsif TG_TABLE_NAME = 'variantes' then
    -- 20260928235500: corregir color o talla de una variante sin historia queda anotado.
    if new.color_codigo is distinct from old.color_codigo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'color_codigo', old.color_codigo, new.color_codigo, v_usuario_id);
    end if;
    if new.talla_id is distinct from old.talla_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'talla_id', old.talla_id::text, new.talla_id::text, v_usuario_id);
    end if;
    if old.codigo is not null and new.codigo is distinct from old.codigo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'codigo', old.codigo, new.codigo, v_usuario_id);
    end if;$n$;
begin
  v_def := pg_get_functiondef('retail.fn_registrar_cambio_producto()'::regprocedure);
  if position('20260928235500' in v_def) > 0 then
    raise notice '20260928235500: fn_registrar_cambio_producto ya anotaba color y talla (se volvió a pegar)';
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '20260928235500: fn_registrar_cambio_producto no tiene el ancla esperada (aparece % veces). Revisar su definición antes de pegar.', v_veces;
  end if;
  execute replace(v_def, v_ancla, v_nuevo);
end;
$$;
