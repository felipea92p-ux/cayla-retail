-- «Combina bien con» deja huella en la venta (Felipe, 2026-10-10). PARTE 2 de 2: `registrar_venta` escribe `venta_items.origen_sugerencia`
-- desde la clave `origen_sugerencia` de cada ítem del jsonb (la caja la manda solo en la línea que entró desde la sugerencia).
--
-- Se pega SOLA, después de la parte 1 (20261010220000). Reemplazo ANCLADO sobre la definición VIVA de la función (ADR-0288: la
-- función se redefinió 7 veces y copiar el cuerpo de una migración vieja pisaría lo que vino después): se busca el trozo exacto del
-- `insert into venta_items` y se le agrega la columna; si el trozo no está una sola vez, la migración se detiene sin tocar nada.
-- Dentro del texto entre comillas no hay ningún `select … into` (el SQL Editor lo confundiría con un SELECT INTO, ADR-0288).
set lock_timeout = '3s';

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

-- 1. La columna en la lista del insert.
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$      descuento_club_unitario
    )
      values ($v$,
  $v$      descuento_club_unitario, origen_sugerencia
    )
      values ($v$,
  1);

-- 2. El valor: la clave del ítem, o NULL si no viene o viene vacía.
select pg_temp.reemplazar(
  'retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)',
  $v$        coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0)
      )
      returning id into v_item_id;$v$,
  $v$        coalesce((v_item ->> 'descuento_club_unitario')::numeric, 0),
        nullif(btrim(coalesce(v_item ->> 'origen_sugerencia', '')), '')
      )
      returning id into v_item_id;$v$,
  1);

-- Comprobación: la función viva ya escribe la columna.
do $$
begin
  if position('origen_sugerencia' in pg_get_functiondef('retail.registrar_venta(uuid, jsonb, jsonb, uuid, uuid, text, text, text, text, text, text, uuid, text, numeric, uuid, text, boolean, boolean)'::regprocedure)) = 0 then
    raise exception 'registrar_venta no quedó escribiendo origen_sugerencia';
  end if;
end $$;
