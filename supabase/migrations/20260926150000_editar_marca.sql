-- ============================================================================
-- 20260926150000_editar_marca.sql — CAYLA V2 (Catálogo ▸ Marcas)
--
-- EL PROBLEMA. En Catálogo ▸ Marcas una marca solo se podía «Renombrar» y «sumarle otro proveedor»; no había cómo
-- corregir un proveedor mal puesto (la carga de 75 marcas del 2026-09 asignó uno por marca, y si era el equivocado no
-- había salida). Felipe no encontraba «cómo editar la marca» (captura del 2026-09-25): pidió UNA ventana «Editar» con el
-- nombre y los proveedores.
--
-- LA DECISIÓN (Felipe, 2026-09-25):
--   · Editar = nombre + proveedores en un solo guardado. Se suman proveedores (de la lista, o uno nuevo que se registra
--     en el mismo paso) y se quitan los que se pusieron por error.
--   · Un proveedor se quita SOLO si ningún producto (activo o descontinuado) tiene esa pareja: quitar borra la fila
--     de `marca_proveedores`, que no guarda historia propia; mientras un producto la use, la llave compuesta de
--     `productos` la protege igual, esto solo dice el porqué en castellano. Un producto que cambió de proveedor dejó su
--     rastro en `historial_producto_cambios`, así que la pareja vacía no se lleva nada consigo.
--   · Una marca activa nunca queda sin proveedor: sin él no se puede usar en ningún producto. Si ya nadie la trae,
--     se desactiva.
--
-- POR QUÉ UNA FUNCIÓN Y NO TRES LLAMADAS. Renombrar, quitar y sumar tocan dos tablas (y hasta tres, con un proveedor
-- nuevo). Desde la pantalla serían llamadas sueltas: si la segunda falla, la marca queda renombrada pero con el proveedor
-- viejo, o con un proveedor registrado que no trae nada. Aquí es todo o nada.
--
-- POR QUÉ «SUMAR/QUITAR» Y NO «LA LISTA FINAL». Si dos personas editan la misma marca a la vez, con la lista final la
-- segunda borraría en silencio el proveedor que acaba de sumar la primera (su pantalla no lo tenía). Con sumar/quitar
-- cada una aplica solo lo que pidió.
--
-- CONCURRENCIA. La fila de la marca se toma `for update` (dos ediciones de la misma marca van una tras otra) y las
-- parejas a quitar también, ANTES de contar sus productos: un alta de producto con esa pareja espera o ya se ve.
--
-- PRODUCCIÓN. Solo crea una función: sin `alter` ni políticas (ADR-0195), se pega en UNA parte. Prefijo `retail.` ya
-- escrito. Re-ejecutable. Prueba: `pnpm pruebas:editar-marca`.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.editar_marca(
  p_marca_id uuid,
  p_nombre text,
  p_sumar uuid[] default '{}',
  p_quitar uuid[] default '{}',
  -- Proveedores que todavía no existen: [{"nombre": "…", "ruc": "…"}]. Se registran aquí, en la misma transacción.
  p_sumar_nuevos jsonb default '[]'
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_marca retail.marcas;
  v_otra text;
  v_nuevo jsonb;
  v_sumar uuid[] := coalesce(p_sumar, '{}');
  v_quitar uuid[] := coalesce(p_quitar, '{}');
  v_en_uso record;
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No tienes permiso para editar marcas.';
  end if;
  -- El candado del combo «Responsable» (ADR-0161): alguien presente en la tienda hace la operación.
  perform retail.fn_actor_persona_id(true);

  select * into v_marca from retail.marcas where id = p_marca_id for update;
  if v_marca.id is null then
    raise exception 'Esa marca ya no existe. Recarga la pantalla.' using hint = 'marca_invalida';
  end if;
  if v_nombre = '' then
    raise exception 'Escribe el nombre de la marca.' using hint = 'marca_obligatoria';
  end if;
  -- Mismo criterio que el índice único `marcas_nombre_unico`: el índice es el candado; esto dice cuál es la otra.
  select nombre into v_otra from retail.marcas
   where retail.fn_clave_texto(nombre) = retail.fn_clave_texto(v_nombre) and id <> p_marca_id
   limit 1;
  if v_otra is not null then
    raise exception 'Ya existe la marca «%». Si es la misma, deja una sola: desactiva la que sobra.', v_otra
      using hint = 'marca_duplicada';
  end if;

  -- Proveedores nuevos: con la MISMA función de Compras (sus reglas de nombre, RUC y permiso valen igual). Si algo falla
  -- más abajo, el proveedor recién registrado se deshace con todo lo demás: no queda un proveedor huérfano.
  for v_nuevo in select * from jsonb_array_elements(coalesce(p_sumar_nuevos, '[]')) loop
    v_sumar := v_sumar || retail.registrar_proveedor(p_nombre => v_nuevo ->> 'nombre', p_ruc => v_nuevo ->> 'ruc');
  end loop;

  -- Solo se exige «activo» a lo que se SUMA: una pareja que ya estaba se queda aunque el proveedor esté hoy desactivado.
  if exists (
    select 1 from unnest(v_sumar) s(id)
     where not exists (select 1 from retail.marca_proveedores mp where mp.marca_id = p_marca_id and mp.proveedor_id = s.id)
       and not exists (select 1 from retail.proveedores p where p.id = s.id and p.activo)
  ) then
    raise exception 'Uno de los proveedores elegidos no existe o está desactivado. Recarga la pantalla.' using hint = 'proveedor_invalido';
  end if;

  -- Quitar: primero se bloquean las parejas, después se cuentan sus productos (ver CONCURRENCIA arriba).
  perform 1 from retail.marca_proveedores where marca_id = p_marca_id and proveedor_id = any (v_quitar) for update;
  select pr.nombre, count(x.id) as productos into v_en_uso
    from retail.marca_proveedores mp
    join retail.proveedores pr on pr.id = mp.proveedor_id
    join retail.productos x on x.marca_id = mp.marca_id and x.proveedor_id = mp.proveedor_id
   where mp.marca_id = p_marca_id and mp.proveedor_id = any (v_quitar) and not (mp.proveedor_id = any (v_sumar))
   group by pr.nombre
   order by pr.nombre
   limit 1;
  if v_en_uso.nombre is not null then
    raise exception '«%» no se puede quitar de %: % producto(s) lo tienen como proveedor. Cámbiales el proveedor en Productos primero.',
      v_en_uso.nombre, v_nombre, v_en_uso.productos
      using hint = 'pareja_en_uso';
  end if;

  update retail.marcas set nombre = v_nombre where id = p_marca_id and nombre is distinct from v_nombre;
  delete from retail.marca_proveedores
   where marca_id = p_marca_id and proveedor_id = any (v_quitar) and not (proveedor_id = any (v_sumar));
  insert into retail.marca_proveedores (marca_id, proveedor_id)
    select p_marca_id, s.id from unnest(v_sumar) s(id)
    on conflict do nothing;

  if v_marca.activo and not exists (select 1 from retail.marca_proveedores where marca_id = p_marca_id) then
    raise exception 'La marca necesita al menos un proveedor: sin él no se puede usar en ningún producto. Si ya nadie la trae, desactívala.'
      using hint = 'marca_sin_proveedor';
  end if;

  -- Lo que quedó de verdad (con lo que otra persona haya sumado mientras tanto): la pantalla pinta esto, no su borrador.
  return jsonb_build_object(
    'nombre', v_nombre,
    'proveedores', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre) order by p.nombre), '[]'::jsonb)
        from retail.marca_proveedores mp join retail.proveedores p on p.id = mp.proveedor_id
       where mp.marca_id = p_marca_id
    )
  );
end;
$$;

comment on function retail.editar_marca(uuid, text, uuid[], uuid[], jsonb) is
  'Catálogo ▸ Marcas ▸ Editar: renombra la marca y le suma o quita proveedores (y registra los nuevos) todo o nada. Quitar solo si ningún producto usa la pareja; una marca activa nunca queda sin proveedor. Devuelve {nombre, proveedores:[{id, nombre}]} como quedó guardado.';

revoke execute on function retail.editar_marca(uuid, text, uuid[], uuid[], jsonb) from public, anon;
grant execute on function retail.editar_marca(uuid, text, uuid[], uuid[], jsonb) to authenticated;
