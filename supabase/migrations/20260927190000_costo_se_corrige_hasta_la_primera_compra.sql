-- ============================================================================
-- 20260927190000_costo_se_corrige_hasta_la_primera_compra.sql
-- El costo de una prenda se corrige a mano solo hasta su primera compra (Felipe, 2026-09-26)
--
-- EL PROBLEMA PRIMERO. `variantes.costo` es el costo promedio ponderado (ADR-0067): lo mueven la recepción de una
-- compra y el cierre de una orden del Taller, con `fn_recalcular_costo_variante`, que deja cada paso en
-- `costo_historial`. Pero había dos caminos más que lo escribían sin pasar por ahí, ya medidos y anotados en
-- `20260919141804_resumen_inventario_v2.sql` («Esta función NO lo cierra —eso exige decidir cómo se corrige un costo
-- mal cargado—»):
--   1. La ficha del producto (`catalogo_actualizar_producto`, INVOKER) guardaba el costo que trajera el formulario, o
--      0 si el campo quedaba vacío. Un 0 así convierte la prenda en «sin costo» y le da un margen de 100 %.
--   2. La política `variantes_write_lider` deja a un líder actualizar `variantes` directo por la API.
-- Y un costo escrito a mano, aunque fuera para corregir un error de la carga inicial, quedaba para siempre como
-- «alterado» en Resumen: cualquier fila de `historial_producto_cambios` con campo 'costo' en una prenda sin compras lo
-- marca así, y con una sola prenda alterada con stock la pantalla deja de mostrar el «Capital en inventario».
--
-- LA DECISIÓN (Felipe, 2026-09-26, entre tres opciones). Mientras la prenda nunca entró por Compras ni por el Taller,
-- su costo es DECLARADO —el que alguien anotó al darla de alta o en la carga inicial— y se puede corregir a mano. Desde
-- su primera entrada con costo (la primera fila de `costo_historial`) el costo sale del promedio ponderado y ya no se
-- toca a mano. Descartadas: «nunca a mano» (un costo mal declarado en la carga inicial no se podría corregir desde
-- ninguna pantalla) y «siempre, con aviso» (el costo oficial se seguiría pudiendo pisar).
--
-- QUÉ PROMETE.
--   1. `fn_variantes_con_costo_oficial(uuid[])`: de esas variantes, cuáles ya tienen costo de compras o del Taller.
--      La usa la ficha (para mostrar el costo de solo lectura) y el candado de abajo.
--   2. Candado `variantes_costo_hasta_la_primera_compra`: una sesión de la API (rol `authenticated` o `anon`) no puede
--      cambiar el costo de una variante que ya tiene costo oficial — ni por la ficha ni por un update directo. Las
--      funciones SECURITY DEFINER (recibir_compras, recibir_lote, cerrar_produccion → `fn_recalcular_costo_variante`)
--      corren como su dueño y no pasan por esta regla: son el camino oficial.
--   3. `fn_registrar_cambio_producto` anota la corrección de un costo DECLARADO con campo 'costo_declarado' en vez de
--      'costo'. Resumen (`fn_resumen_variantes`, `fn_resumen_comparacion`) solo mira 'costo' para decir «alterado»,
--      así que corregir un costo antes de la primera compra deja la prenda como «declarado», que es lo que es.
--
-- QUÉ NO HACE.
--   - No cambia ningún costo ni ninguna fila existente. `historial_producto_cambios` es inmutable: una corrección
--     manual que ya quedó anotada como 'costo' en una prenda sin compras sigue contando como «alterado» hasta que esa
--     prenda tenga su primera compra (desde ahí manda `costo_historial`). Para ver cuántas son, al final hay una
--     consulta de solo lectura.
--   - No toca `catalogo_actualizar_producto`: el candado vive en la tabla, que es por donde pasan los dos caminos. La
--     ficha nueva manda, para las variantes con costo oficial, el mismo costo que leyó (no cambia nada y el candado no
--     salta); una ficha abierta ANTES de esta migración que intente cambiarlo recibe el mensaje del candado.
--
-- CÓMO (punto 3). Mismo patrón de anclas que 20260924110000 y 20260924160000: se parte de la definición VIVA
-- (`pg_get_functiondef`) —producción puede tener un cuerpo distinto del repo; 20260923100000 ya la parchó por anclas— y
-- se reemplaza una sola ancla. Tiene que aparecer EXACTAMENTE una vez o la migración aborta sin tocar nada. Re-pegable:
-- si ya dice 'costo_declarado', no hace nada.
--
-- ORDEN PARA PRODUCCIÓN: primero ESTA migración, después la web. La web vieja con la base nueva sigue funcionando (solo
-- que al cambiar un costo oficial recibe el mensaje del candado); la web nueva con la base vieja no puede saber qué
-- costos son oficiales y los muestra todos de solo lectura.
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`, no hace falta el prefijo `retail.`.
--
-- CÓMO SE DESHACE.
--   drop trigger if exists variantes_costo_hasta_la_primera_compra on retail.variantes;
--   drop function if exists retail.fn_costo_hasta_la_primera_compra();
--   drop function if exists retail.fn_variantes_con_costo_oficial(uuid[]);
--   y en `fn_registrar_cambio_producto`, volver el `case … 'costo_declarado' end` a 'costo' (las filas ya escritas con
--   'costo_declarado' se quedan: el historial no se edita).
-- ============================================================================

set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- 1. Qué variantes ya tienen costo oficial
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER porque `costo_historial` tiene RLS por sede y el candado corre como quien escribe: sin esto, un líder
-- que no ve esa sede no vería la fila y el candado lo dejaría pasar. Solo dice SÍ/NO por variante, nunca el monto.
create or replace function retail.fn_variantes_con_costo_oficial(p_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select coalesce(array_agg(distinct ch.variante_id), '{}'::uuid[])
  from retail.costo_historial ch
  where ch.variante_id = any (p_ids);
$$;
revoke all on function retail.fn_variantes_con_costo_oficial(uuid[]) from public, anon;
grant execute on function retail.fn_variantes_con_costo_oficial(uuid[]) to authenticated;

comment on function retail.fn_variantes_con_costo_oficial(uuid[]) is
  'De las variantes pedidas, las que ya tienen costo de compras o del Taller (alguna fila en costo_historial). Su costo ya no se corrige a mano (20260927190000).';

-- ----------------------------------------------------------------------------
-- 2. El candado
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER a propósito: `current_user` tiene que ser quien escribe. Por la API es `authenticated`; dentro de
-- recibir_compras / recibir_lote / cerrar_produccion (SECURITY DEFINER) es el dueño de la función, y pasan.
create or replace function retail.fn_costo_hasta_la_primera_compra()
returns trigger
language plpgsql
set search_path to 'retail', 'public', 'extensions'
as $$
begin
  if new.costo is distinct from old.costo
     and current_user in ('authenticated', 'anon')
     and new.id = any (retail.fn_variantes_con_costo_oficial(array[new.id])) then
    raise exception 'El costo de % ya sale de sus compras y del Taller (promedio ponderado): no se cambia a mano.',
      coalesce(new.codigo, new.sku, 'esta prenda')
      using hint = 'costo_oficial';
  end if;
  return new;
end;
$$;

drop trigger if exists variantes_costo_hasta_la_primera_compra on retail.variantes;
create trigger variantes_costo_hasta_la_primera_compra
  before update of costo on retail.variantes
  for each row execute function retail.fn_costo_hasta_la_primera_compra();

-- ----------------------------------------------------------------------------
-- 3. La corrección de un costo declarado se anota aparte (parche con ancla sobre la definición viva)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_veces int;
  v_ancla constant text := $a$'costo', old.costo::text, new.costo::text$a$;
  v_nuevo constant text := $n$
        -- 20260927190000: antes de la primera compra el costo es declarado y corregirlo no es «alterarlo».
        case when exists (select 1 from retail.costo_historial ch where ch.variante_id = new.id) then 'costo' else 'costo_declarado' end,
        old.costo::text, new.costo::text$n$;
begin
  v_def := pg_get_functiondef('retail.fn_registrar_cambio_producto()'::regprocedure);
  if position('costo_declarado' in v_def) > 0 then
    raise notice '20260927190000: fn_registrar_cambio_producto ya anotaba costo_declarado (se volvió a pegar)';
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 1 then
    raise exception '20260927190000: fn_registrar_cambio_producto no tiene el ancla esperada (aparece % veces). Revisar su definición antes de pegar.', v_veces;
  end if;
  execute replace(v_def, v_ancla, v_nuevo);
end;
$$;

-- ----------------------------------------------------------------------------
-- Consulta de solo lectura, para después de pegar: prendas SIN compras cuyo costo ya se corrigió a mano antes de esta
-- migración (quedan «alteradas» hasta su primera compra — ver QUÉ NO HACE).
--
--   select v.codigo, v.costo, count(*) as correcciones
--     from retail.variantes v
--     join retail.historial_producto_cambios h on h.entidad = 'variante' and h.entidad_id = v.id and h.campo = 'costo'
--    where not exists (select 1 from retail.costo_historial ch where ch.variante_id = v.id)
--    group by v.codigo, v.costo order by v.codigo;
-- ----------------------------------------------------------------------------
