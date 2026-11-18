-- ============================================================================
-- 20261030221000_editar_apartado_con_descuento.sql — CAYLA V2 (ADR-0584, actividad 3, Felipe 2026-10-30)
--
-- EL PROBLEMA. Desde 20261030220000 se puede apartar con un descuento a mano, con las reglas de la venta. Pero al SUMAR una prenda a
-- un apartado ya hecho (`editar_separacion`) la base seguía aceptando solo el de la campaña: la clienta que vuelve por una blusa
-- más, con el 10 % que se le dio a la primera, no podía llevárselo. Felipe (2026-10-30) eligió que al agregar también se pueda
-- descontar, y que las prendas que ya estaban conserven el suyo.
--
-- ANALOGÍA CAYLA. A la bolsa con el nombre de la clienta se le mete otra prenda: esa prenda nueva lleva escrito su propio precio y,
-- si se le hizo un descuento, su motivo. Las que ya estaban en la bolsa no se vuelven a etiquetar.
--
-- QUÉ TOCA
--   1. `separacion_items_retirados`: las tres columnas del descuento a mano (motivo, detalle, argumento). Una prenda que se quita
--      del apartado pasa al archivo con su motivo, igual que con su etiqueta de campaña.
--   2. `editar_separacion`, cinco reemplazos ANCLADOS sobre la definición viva (ADR-0288; la función lleva parches de 20261016003000
--      y copiar un cuerpo viejo los pisaría):
--      a) una variable para saber si la prenda que entra trae descuento a mano;
--      b) cada prenda de `p_agregar` trae su motivo, su detalle y su argumento (vacíos si no hay);
--      c) un descuento MAYOR que la campaña se exige con `fn_exigir_descuento_manual` (la regla de la venta y de `separar_prendas`);
--         si no, el chequeo de campaña de siempre (`separacion_descuento_no_coincide`);
--      d) la línea se guarda con el descuento a mano y su motivo, o con la campaña como siempre;
--      e) el retiro copia el motivo, el detalle y el argumento al archivo.
--   Las prendas que ya estaban en el apartado no se tocan ni se revalidan: su precio y su descuento son los que se acordaron al
--   apartarlas (si hoy la campaña cambió o la regla se endureció, el acuerdo con la clienta sigue en pie).
--
-- DESCARTÉ: revalidar las prendas que ya estaban. Rompería apartados vivos por algo que nadie tocó (una campaña que terminó, un costo
--   que subió) y Felipe pidió que conserven su descuento.
--
-- CÓMO SE PEGA. Una sola parte: `alter` de `separacion_items_retirados` (que solo escribe `editar_separacion`) y funciones, SIN
-- políticas (ADR-0195). Idempotente, `lock_timeout` 3 s. Dentro de los textos de reemplazo no hay ningún `select … into` (ADR-0288).
-- PRODUCCIÓN: pegar SOLO con OK de Felipe, DESPUÉS de 20261030220000 (usa su `fn_exigir_descuento_manual`) y ANTES de publicar la
-- web: con la base nueva y la web vieja nada cambia (la web vieja no manda motivo); con la web nueva y la base vieja, sumar una prenda
-- con descuento a mano se rechaza (`separacion_descuento_no_coincide`) sin guardar nada.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. El archivo de prendas retiradas guarda por qué se había descontado
-- ----------------------------------------------------------------------------
alter table retail.separacion_items_retirados add column if not exists motivo_descuento text;
alter table retail.separacion_items_retirados add column if not exists motivo_descuento_detalle text;
alter table retail.separacion_items_retirados add column if not exists argumento_descuento text;

comment on column retail.separacion_items_retirados.motivo_descuento is
  'ADR-0584. El motivo del descuento a mano que tenía la prenda cuando se quitó del apartado (copia de separacion_items).';
comment on column retail.separacion_items_retirados.motivo_descuento_detalle is 'ADR-0584. El detalle de un motivo «otro».';
comment on column retail.separacion_items_retirados.argumento_descuento is 'ADR-0584. El argumento de un descuento a mano que pasaba el 15 %.';

-- ----------------------------------------------------------------------------
-- 2. `editar_separacion` acepta el descuento a mano en lo que se suma (reemplazos anclados)
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

create or replace function pg_temp.firma(p_nombre text) returns text language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre
$f$;

-- 2a. Si la prenda que entra trae descuento a mano (se decide en la validación y se usa al guardar, en la misma vuelta).
select pg_temp.reemplazar(pg_temp.firma('editar_separacion'),
$v$  v_minimo numeric;
$v$,
$v$  v_minimo numeric;
  v_manual boolean;  -- ADR-0584: la prenda que entra trae un descuento a mano, ya exigido
$v$, 1);

-- 2b. Cada prenda que se suma trae su motivo, su detalle y su argumento.
select pg_temp.reemplazar(pg_temp.firma('editar_separacion'),
$v$           max(coalesce((e ->> 'descuento_unitario')::numeric, 0)) as descuento_unitario
      from jsonb_array_elements(coalesce(p_agregar, '[]'::jsonb)) e$v$,
$v$           max(coalesce((e ->> 'descuento_unitario')::numeric, 0)) as descuento_unitario,
           max(btrim(coalesce(e ->> 'motivo_descuento', ''))) as motivo_descuento,
           max(btrim(coalesce(e ->> 'motivo_descuento_detalle', ''))) as motivo_descuento_detalle,
           max(btrim(coalesce(e ->> 'argumento_descuento', ''))) as argumento_descuento
      from jsonb_array_elements(coalesce(p_agregar, '[]'::jsonb)) e$v$, 1);

-- 2c. Un descuento MAYOR que la campaña es a mano: se exige con la regla de la venta. Lo demás, como siempre (la campaña).
select pg_temp.reemplazar(pg_temp.firma('editar_separacion'),
$v$    if abs(v_item.descuento_unitario - v_c_unit) > 0.011 then
      raise exception 'separacion_descuento_no_coincide'
        using detail = v_ref || ' (' || coalesce(v_sku, '') || ')',
              hint = format('Hoy corresponde S/%s de descuento (campaña) y la caja mandó S/%s', v_c_unit, v_item.descuento_unitario);
    end if;$v$,
$v$    v_manual := v_item.motivo_descuento <> 'campana' and v_item.descuento_unitario > v_c_unit + 0.011;
    if v_manual then
      -- ADR-0584: descuento a mano, con las reglas de la venta (las mismas de `separar_prendas`).
      perform retail.fn_exigir_descuento_manual(v_item.variante_id, v_precio, round(v_item.descuento_unitario, 2), v_c_unit,
        v_item.motivo_descuento, v_item.motivo_descuento_detalle, v_item.argumento_descuento, v_ref || ' (' || coalesce(v_sku, '') || ')');
    elsif abs(v_item.descuento_unitario - v_c_unit) > 0.011 then
      raise exception 'separacion_descuento_no_coincide'
        using detail = v_ref || ' (' || coalesce(v_sku, '') || ')',
              hint = format('Hoy corresponde S/%s de descuento (campaña) y la caja mandó S/%s', v_c_unit, v_item.descuento_unitario);
    end if;$v$, 1);

-- 2d. La línea se guarda con el descuento a mano y su motivo, o con la campaña como siempre.
select pg_temp.reemplazar(pg_temp.firma('editar_separacion'),
$v$    insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id)
      values (s.id, v_item.variante_id, v_item.cantidad, v_precio, v_c_unit, case when v_c_unit > 0 then v_c_etq end, v_apartado);$v$,
$v$    if v_manual then
      -- ADR-0584: el descuento a mano ya exigido arriba, con su motivo.
      insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id,
                                    motivo_descuento, motivo_descuento_detalle, argumento_descuento)
        values (s.id, v_item.variante_id, v_item.cantidad, v_precio, round(v_item.descuento_unitario, 2), null, v_apartado,
                v_item.motivo_descuento,
                case when v_item.motivo_descuento = 'otro' then nullif(v_item.motivo_descuento_detalle, '') end,
                nullif(v_item.argumento_descuento, ''));
    else
    insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id)
      values (s.id, v_item.variante_id, v_item.cantidad, v_precio, v_c_unit, case when v_c_unit > 0 then v_c_etq end, v_apartado);
    end if;$v$, 1);

-- 2e. Lo que se quita pasa al archivo con su motivo (la fila viaja entera en `v_quitados`, por `to_jsonb`).
select pg_temp.reemplazar(pg_temp.firma('editar_separacion'),
$v$  insert into separacion_items_retirados (id, separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario,
                                          descuento_etiqueta_id, apartado_id, edicion_id, retirado_por)
    select (q ->> 'id')::uuid, s.id, (q ->> 'variante_id')::uuid, (q ->> 'cantidad')::integer, (q ->> 'precio_unitario')::numeric,
           (q ->> 'descuento_unitario')::numeric, nullif(q ->> 'descuento_etiqueta_id', '')::uuid, (q ->> 'apartado_id')::uuid,
           v_edicion, v_persona$v$,
$v$  insert into separacion_items_retirados (id, separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario,
                                          descuento_etiqueta_id, apartado_id, edicion_id, retirado_por,
                                          motivo_descuento, motivo_descuento_detalle, argumento_descuento)
    select (q ->> 'id')::uuid, s.id, (q ->> 'variante_id')::uuid, (q ->> 'cantidad')::integer, (q ->> 'precio_unitario')::numeric,
           (q ->> 'descuento_unitario')::numeric, nullif(q ->> 'descuento_etiqueta_id', '')::uuid, (q ->> 'apartado_id')::uuid,
           v_edicion, v_persona,
           -- ADR-0584: el motivo del descuento a mano viaja al archivo.
           q ->> 'motivo_descuento', q ->> 'motivo_descuento_detalle', q ->> 'argumento_descuento'$v$, 1);

-- ----------------------------------------------------------------------------
-- 3. Comprobación: quedó todo, o no se aplica nada
-- ----------------------------------------------------------------------------
do $$
declare
  v_ed text := pg_get_functiondef(pg_temp.firma('editar_separacion')::regprocedure);
begin
  if position('fn_exigir_descuento_manual' in v_ed) = 0
     or position('as argumento_descuento' in v_ed) = 0
     or position('v_item.motivo_descuento,' in v_ed) = 0 then
    raise exception 'ADR-0584: editar_separacion no quedó con el descuento a mano';
  end if;
  if position($t$q ->> 'motivo_descuento', q ->> 'motivo_descuento_detalle', q ->> 'argumento_descuento'$t$ in v_ed) = 0 then
    raise exception 'ADR-0584: el retiro no copia el motivo al archivo';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'retail' and table_name = 'separacion_items_retirados'
         and column_name in ('motivo_descuento', 'motivo_descuento_detalle', 'argumento_descuento')) <> 3 then
    raise exception 'ADR-0584: separacion_items_retirados no tiene las columnas del descuento a mano';
  end if;
end;
$$;
