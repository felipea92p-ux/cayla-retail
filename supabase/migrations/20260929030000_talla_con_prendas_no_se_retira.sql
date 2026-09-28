-- ============================================================================
-- 20260929030000 — Una talla con prendas no se retira (ADR-0262, decisión 13, tarea #7)
--
-- EL PROBLEMA (visto en producción el 2026-09-28)
--   A las 11:08 entraron 20 u. de «Prueba Pantalon» en 4 tallas. Después alguien desactivó 2 de esas tallas desde
--   Editar, con 6 prendas adentro. Existencias bajó de 381 a 375: las 6 prendas seguían colgadas en TRU, pero ninguna
--   pantalla de operación las mostraba (todas filtran `variantes.activo`), Vender no las dejaba cobrar y el Catálogo sí
--   las sumaba. Unidades fantasma: existen en la tienda y no en el sistema, o al revés según la pantalla.
--
-- QUÉ HACE
--   Rechaza pasar una talla de activa a retirada (`variantes.activo` true → false) mientras tenga prendas en
--   cualquier sede (Cuarentena y apartadas incluidas: están en `cantidad`) o viniendo en un traslado `en_transito`.
--   El mensaje dice dónde están, para que quien edita sepa qué hacer: venderlas, trasladarlas o ajustarlas.
--   Reactivar una talla (false → true) siempre se puede. Una talla YA retirada con prendas (el caso de hoy) no
--   bloquea nada: el candado mira el cambio, no el estado; se resuelve ajustando o eliminando la prueba.
--
-- POR QUÉ UN DISPARADOR Y NO UNA REGLA EN LA FUNCIÓN QUE EDITA
--   Hoy solo `catalogo_actualizar_producto` apaga tallas, pero es una regla sobre la TABLA: cualquier función futura
--   que la apague tiene que respetarla sin acordarse. `create or replace trigger`, nunca `drop trigger` (ADR-0195).
--
-- SE ROMPE SI
--   Alguien retira la talla en el mismo instante en que otra persona recibe prendas de ella: el disparador leyó 0 y la
--   recepción inserta después. La ventana es de milisegundos; la cierra el candado de estado de la tarea #6, que hace
--   que las escrituras de stock bloqueen la fila de la variante.
--
-- PRODUCCIÓN
--   Una función y un `create or replace trigger` sobre `variantes`: sin políticas (ADR-0195). Una sola parte. No
--   depende de 20260929010000 ni de 20260929020000.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_talla_con_prendas_no_se_retira()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_donde text;
begin
  if not (old.activo and not new.activo) then
    return new;
  end if;

  select string_agg(format('%s %s', x.n, x.lugar), ', ' order by x.orden, x.lugar)
    into v_donde
  from (
    select 1 as orden, 'en ' || regexp_replace(u.nombre, '^Tienda\s+', '') as lugar, sum(s.cantidad)::integer as n
    from retail.stock s
    join retail.ubicaciones u on u.id = s.ubicacion_id
    where s.variante_id = new.id
    group by u.nombre
    having sum(s.cantidad) > 0
    union all
    select 2, 'en camino a ' || regexp_replace(u.nombre, '^Tienda\s+', ''), sum(ti.cantidad)::integer
    from retail.transferencia_items ti
    join retail.transferencias t on t.id = ti.transferencia_id
    join retail.ubicaciones u on u.id = t.ubicacion_destino_id
    where ti.variante_id = new.id and t.estado = 'en_transito'
    group by u.nombre
  ) x;

  if v_donde is not null then
    raise exception 'La talla % todavía tiene prendas (%). Véndelas, trasládalas o ajústalas antes de retirarla.',
      coalesce(new.sku, new.codigo, new.id::text), v_donde
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function retail.fn_talla_con_prendas_no_se_retira() is
  'ADR-0262 decisión 13: una talla (variante) con prendas en alguna sede o en camino no pasa a retirada; el mensaje '
  'dice dónde están. Reactivar siempre se puede.';

revoke all on function retail.fn_talla_con_prendas_no_se_retira() from public, anon, authenticated;

create or replace trigger variantes_talla_con_prendas_no_se_retira
  before update of activo on retail.variantes
  for each row
  when (old.activo and not new.activo)
  execute function retail.fn_talla_con_prendas_no_se_retira();
