-- Órdenes de compra, fase 1 (ADR-0362): editar una orden SIN entrega estimada ya no deja guardar una fecha fuera de rango.
--
-- EL PROBLEMA PRIMERO. `/chaos` (2026-10-10, semilla 20261010) editó la OC-000465, que no tenía entrega estimada, y le puso el 01/01/2999:
-- la base lo guardó. La regla de siempre («desde hoy y hasta dentro de un año») tiene una excepción al editar —lo que no se tocó no se vuelve
-- a juzgar: una entrega que ya venció no impide corregir la nota—, escrita como
--     and not (v_editando and p_fecha_entrega_estimada::text = p_anterior ->> 'fecha_entrega_estimada')
-- Con la fecha anterior NULL, `=` da NULL, `not (true and NULL)` da NULL y el IF entero no se dispara: la regla quedaba APAGADA para
-- cualquier fecha (pasada o del año 2999). Es la lógica de tres valores de SQL: un NULL en una condición no es «falso», es «no sé».
--
-- QUÉ CAMBIA. Solo `fn_orden_compra_validar`: la comparación pasa a `is not distinct from`, que con NULL responde sí o no. Una fecha que
-- no cambió (también NULL → NULL) sigue sin juzgarse; una fecha NUEVA siempre se juzga. Lo demás de la función queda igual, letra por letra.
-- La prueba es E7b de `pnpm pruebas:ordenes-compra` (fallaba antes de este archivo).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, 2026-10-10). Después de 20261010235500, que ya está en producción: corrige una función
-- que corre allá. Una parte, sin tablas ni políticas ni `drop trigger`, sin `select … into` dentro de textos entre comillas. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_orden_compra_validar(
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb,
  p_anterior jsonb default null
) returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_editando boolean := p_anterior is not null;
  v_linea jsonb;
  v_pos integer := 0;
  v_categoria uuid;
  v_marca uuid;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_pct numeric;
  v_descuento numeric;
  v_bruto numeric;
begin
  -- Cabecera.
  if p_proveedor_id is null
     or not exists (
       select 1 from retail.proveedores pr
        where pr.id = p_proveedor_id
          and (pr.activo or (v_editando and pr.id::text = p_anterior -> 'proveedor' ->> 'id'))
     ) then
    raise exception 'Elige un proveedor activo' using hint = 'orden_compra_proveedor';
  end if;
  if p_destino_id is not null and not exists (
    select 1 from retail.ubicaciones u
     where u.id = p_destino_id
       and u.tipo in ('tienda', 'almacen')
       and (u.activo or (v_editando and u.id::text = p_anterior -> 'destino' ->> 'id'))
  ) then
    raise exception 'La mercadería llega a una tienda activa o se reparte desde Lima' using hint = 'orden_compra_destino';
  end if;
  if p_fecha_entrega_estimada is not null
     and (p_fecha_entrega_estimada < v_hoy or p_fecha_entrega_estimada > v_hoy + 365)
     and not (v_editando and p_fecha_entrega_estimada::text is not distinct from (p_anterior ->> 'fecha_entrega_estimada')) then
    raise exception 'La entrega estimada va desde hoy y hasta dentro de un año' using hint = 'orden_compra_entrega';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'orden_compra_nota';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos una prenda a la orden' using hint = 'orden_compra_sin_lineas';
  end if;
  if jsonb_array_length(p_lineas) > 100 then
    raise exception 'Una orden lleva hasta 100 líneas: parte el pedido en dos órdenes' using hint = 'orden_compra_muchas_lineas';
  end if;

  -- Líneas: TODAS antes de escribir nada (al crear, el número del contador se toma recién si la orden se va a guardar).
  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'La línea % no se entiende', v_pos using hint = 'orden_compra_linea';
    end if;
    begin
      v_categoria := nullif(v_linea ->> 'categoria_id', '')::uuid;
      v_marca := nullif(v_linea ->> 'marca_id', '')::uuid;
      v_cantidad := nullif(btrim(v_linea ->> 'cantidad'), '')::numeric;
      v_precio := nullif(btrim(v_linea ->> 'precio_unitario'), '')::numeric;
      v_pct := nullif(btrim(v_linea ->> 'descuento_pct'), '')::numeric;
      v_descuento := nullif(btrim(v_linea ->> 'descuento'), '')::numeric;
    exception when others then
      raise exception 'La línea % tiene un número o un dato que no se entiende', v_pos using hint = 'orden_compra_linea';
    end;
    v_descripcion := nullif(btrim(coalesce(v_linea ->> 'descripcion', '')), '');
    -- Al editar, una categoría o marca que la orden ya tenía vale aunque hoy esté inactiva (no se obliga a cambiarla para tocar otra cosa).
    if v_categoria is null or not exists (
      select 1 from retail.categorias c
       where c.id = v_categoria
         and (c.activo or (v_editando and exists (
               select 1 from jsonb_array_elements(p_anterior -> 'lineas') a where a ->> 'categoria_id' = v_categoria::text)))
    ) then
      raise exception 'La línea % necesita una categoría activa', v_pos using hint = 'orden_compra_categoria';
    end if;
    if v_marca is null or not exists (
      select 1 from retail.marcas m
       where m.id = v_marca
         and (m.activo or (v_editando and exists (
               select 1 from jsonb_array_elements(p_anterior -> 'lineas') a where a ->> 'marca_id' = v_marca::text)))
    ) then
      raise exception 'La línea % necesita una marca activa', v_pos using hint = 'orden_compra_marca';
    end if;
    if v_descripcion is not null and length(v_descripcion) > 200 then
      raise exception 'La descripción de la línea % es muy larga: hasta 200 letras', v_pos using hint = 'orden_compra_descripcion';
    end if;
    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 1 or v_cantidad > 99999 then
      raise exception 'La cantidad de la línea % va de 1 a 99 999 unidades, sin decimales', v_pos using hint = 'orden_compra_cantidad';
    end if;
    if v_precio is null or v_precio < 0 or v_precio > 99999.99 or v_precio <> round(v_precio, 2) then
      raise exception 'El precio de la línea % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_pos using hint = 'orden_compra_precio';
    end if;
    v_bruto := v_cantidad * v_precio;
    if v_pct is not null and (v_pct < 0 or v_pct > 100 or v_pct <> round(v_pct, 4)) then
      raise exception 'El descuento de la línea % va de 0 %% a 100 %%', v_pos using hint = 'orden_compra_descuento';
    end if;
    if v_pct is null and v_descuento is not null and (v_descuento < 0 or v_descuento <> round(v_descuento, 2) or v_descuento > v_bruto) then
      raise exception 'El descuento de la línea % no puede pasar de lo que cuesta la línea', v_pos using hint = 'orden_compra_descuento';
    end if;
  end loop;
end;
$$;

revoke all on function retail.fn_orden_compra_validar(uuid, uuid, date, text, jsonb, jsonb) from public, anon, authenticated;

reset lock_timeout;
