-- Órdenes de compra, fase 1 · actividad 2 (ADR-0362): crear una orden.
--
-- EL PROBLEMA PRIMERO. La lista ya existe (20261010214500), pero nadie puede escribir en ella. Quien crea una orden suele estar en
-- Gamarra, con su celular y su propia cuenta, lejos del kiosco de asistencia: si la orden pidiera el combo «Responsable» con la marca
-- de entrada en una tienda, no podría crearla. Y en el puesto se toca dos veces «Guardar» o se cae la señal a mitad: eso no puede
-- dejar dos órdenes iguales.
--
-- QUÉ CREA.
--   1. La clave `orden_compra_crear` en `acciones_sin_responsable` (decisión 39, Felipe 2026-10-10): con la cuenta de una PERSONA la
--      orden la firma ella, sin combo ni marca de entrada. Desde una TERMINAL la web sigue pidiendo el combo; y si una terminal mandara
--      la clave igual, `fn_actor_persona_id` devolvería NULL y esta función lo rechaza: una orden siempre tiene quién la creó, porque
--      quien la crea no la recibe (decisión 17).
--   2. `fn_ordenes_compra_siguiente()`: el número que le tocaría a la próxima orden, para mostrarlo bloqueado en el formulario
--      (decisión de Felipe: «correlativo automático y bloqueado»). Es una vista previa: si dos personas guardan a la vez, la segunda
--      toma el siguiente y la pantalla se lo dice.
--   3. `crear_orden_compra(...)`: valida y guarda la cabecera y sus líneas en una transacción. El número sale del contador recién al
--      insertar, después de validar todo, para no gastar números en órdenes que no se guardan. `p_id` lo genera la pantalla una vez
--      por formulario: si llega dos veces (doble clic, reintento sin red), devuelve la orden que ya existe en vez de crear otra.
--      El descuento: si la línea trae porcentaje, los soles se CALCULAN aquí (`round(cantidad × precio × % / 100, 2)`), así el
--      candado `orden_compra_items_descuento_cuadra` se cumple por construcción; si trae soles, se guardan tal cual.
--
-- REGLAS que valida (en palabras de la pantalla): proveedor activo; destino = una tienda o almacén activo, o ninguno («por repartir»,
-- nunca el Taller: sus insumos van por otra orden, decisión 25); entrega estimada desde hoy y hasta un año; de 1 a 100 líneas, cada una
-- con categoría y marca activas, cantidad entera de 1 a 99 999, precio de 0 a 99 999.99 con hasta dos decimales, y un descuento que
-- no pase de lo que cuesta la línea. Lo que se rechaza dice cuál línea y qué le falta (hint `orden_compra_*`).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, después de 20261010214500: no crea tablas ni políticas ni
-- `drop trigger`, sin `select … into` dentro de textos entre comillas (ADR-0288). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Con la cuenta de una persona, sin combo (decisión 39) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('orden_compra_crear', 'Crear una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 2. El número que le tocaría a la próxima orden ----------
create or replace function retail.fn_ordenes_compra_siguiente()
returns integer
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ultimo bigint;
  v_llamado boolean;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Crear una orden de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  -- Leer el contador no lo gasta: `last_value` y `is_called` dicen cuál fue el último entregado.
  for v_ultimo, v_llamado in select s.last_value, s.is_called from retail.ordenes_compra_numero_seq s loop
    exit;
  end loop;
  return case when v_llamado then v_ultimo + 1 else v_ultimo end;
end;
$$;
comment on function retail.fn_ordenes_compra_siguiente() is
  'ADR-0362: el número que le tocaría a la próxima orden de compra, sin gastarlo (vista previa del formulario). Exige el módulo.';
revoke all on function retail.fn_ordenes_compra_siguiente() from public, anon;
grant execute on function retail.fn_ordenes_compra_siguiente() to authenticated, service_role;

-- ---------- 3. Crear la orden ----------
create or replace function retail.crear_orden_compra(
  p_id uuid,
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb
)
returns table (id uuid, numero integer)
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_existente record;
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
  v_id uuid;
  v_numero integer;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Crear una orden de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  -- Quién la crea: con la cuenta de una persona, ella (`orden_compra_crear` está soltada del combo); desde una terminal, el responsable
  -- elegido, presente en la tienda. NULL solo pasa si una terminal manda la clave sin elegir a nadie: una orden sin autor no se guarda.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador de la orden: vuelve a abrir el formulario' using hint = 'orden_compra_sin_id';
  end if;

  -- Doble clic o reintento: la misma orden ya se guardó. Se devuelve tal cual (no se crea otra ni se cambia nada).
  for v_existente in select o.id, o.numero, o.creada_por from retail.ordenes_compra o where o.id = p_id loop
    if v_existente.creada_por is distinct from v_actor then
      raise exception 'Esa orden ya existe' using hint = 'orden_compra_ya_existe';
    end if;
    return query select v_existente.id, v_existente.numero;
    return;
  end loop;

  -- Cabecera.
  if p_proveedor_id is null or not exists (select 1 from retail.proveedores pr where pr.id = p_proveedor_id and pr.activo) then
    raise exception 'Elige un proveedor activo' using hint = 'orden_compra_proveedor';
  end if;
  if p_destino_id is not null and not exists (
    select 1 from retail.ubicaciones u where u.id = p_destino_id and u.activo and u.tipo in ('tienda', 'almacen')
  ) then
    raise exception 'La mercadería llega a una tienda activa o se reparte desde Lima' using hint = 'orden_compra_destino';
  end if;
  if p_fecha_entrega_estimada is not null and (p_fecha_entrega_estimada < v_hoy or p_fecha_entrega_estimada > v_hoy + 365) then
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

  -- Líneas: se validan TODAS antes de insertar nada, así el número del contador se toma solo si la orden se va a guardar.
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
    if v_categoria is null or not exists (select 1 from retail.categorias c where c.id = v_categoria and c.activo) then
      raise exception 'La línea % necesita una categoría activa', v_pos using hint = 'orden_compra_categoria';
    end if;
    if v_marca is null or not exists (select 1 from retail.marcas m where m.id = v_marca and m.activo) then
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

  -- Todo bien: recién ahora se toma el número.
  insert into retail.ordenes_compra (id, proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, nota, creada_por)
  values (p_id, p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, v_actor)
  on conflict on constraint ordenes_compra_pkey do nothing
  returning ordenes_compra.id, ordenes_compra.numero into v_id, v_numero;
  -- Dos pedidos con el mismo `p_id` al mismo tiempo: el segundo no inserta y devuelve el del primero.
  if v_id is null then
    for v_existente in select o.id, o.numero, o.creada_por from retail.ordenes_compra o where o.id = p_id loop
      if v_existente.creada_por is distinct from v_actor then
        raise exception 'Esa orden ya existe' using hint = 'orden_compra_ya_existe';
      end if;
      return query select v_existente.id, v_existente.numero;
      return;
    end loop;
  end if;

  insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario, descuento, descuento_pct)
  select v_id,
         l.posicion,
         (l.valor ->> 'categoria_id')::uuid,
         (l.valor ->> 'marca_id')::uuid,
         nullif(btrim(coalesce(l.valor ->> 'descripcion', '')), ''),
         (l.valor ->> 'cantidad')::numeric::integer,
         (l.valor ->> 'precio_unitario')::numeric,
         case
           when nullif(btrim(l.valor ->> 'descuento_pct'), '') is not null
             then round((l.valor ->> 'cantidad')::numeric * (l.valor ->> 'precio_unitario')::numeric
                        * (l.valor ->> 'descuento_pct')::numeric / 100, 2)
           else coalesce(nullif(btrim(l.valor ->> 'descuento'), '')::numeric, 0)
         end,
         nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric
    from jsonb_array_elements(p_lineas) with ordinality as l(valor, posicion);

  return query select v_id, v_numero;
end;
$$;
comment on function retail.crear_orden_compra(uuid, uuid, uuid, date, text, jsonb) is
  'ADR-0362: crea una orden de compra con sus líneas (generada). p_id lo genera la pantalla: repetido devuelve la misma orden. '
  'Destino NULL = por repartir desde Lima. Firma fn_actor_persona_id(true) (orden_compra_crear: persona sin combo, terminal con combo).';
revoke all on function retail.crear_orden_compra(uuid, uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function retail.crear_orden_compra(uuid, uuid, uuid, date, text, jsonb) to authenticated, service_role;

reset lock_timeout;
