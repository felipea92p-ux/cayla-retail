-- ============================================================================
-- 20261106004000_tres_etapas_de_una_prenda.sql — CAYLA V2 (Felipe, 2026-11-05; ADR-0614, actividad 14; decisión 8 y D de ADR-0551)
-- Una prenda del Taller no sale a la venta antes de llegar a una tienda
--
-- EL PROBLEMA PRIMERO. Un modelo nace al abrir su orden. Hoy, desde ese minuto aparece en Productos, en el buscador de Vender y, si alguien
-- lo enciende, en la tienda web, aunque todavía sea tela. Ya pasó con las órdenes abiertas de producción: la colaboradora lo ve, no hay
-- ninguna prenda y no sabe por qué.
--
-- LA REGLA. La etapa se DERIVA, nunca se guarda (principio 4): mira la orden, el stock y los movimientos.
--   null           nunca tuvo una orden viva (solo anuladas o ninguna), o se acabó sin decir nada: todo sigue como hoy.
--   en_produccion  orden abierta, stock 0 y nunca estuvo en una tienda. No aparece en ningún lado.
--   terminada      stock solo en el Taller y nunca estuvo en una tienda. Se ve en Existencias y Análisis.
--   en_tienda      hay stock en una tienda, o alguna vez lo hubo. Se ve en todas partes.
-- El stock manda sobre la orden (el Chaleco: 66 en tienda y una orden abierta sigue a la venta).
--
-- «ALGUNA VEZ LO HUBO» se agregó a ADR-0551 al construirlo: un modelo vendido hasta cero con una orden de reposición volvería a
-- «en_produccion» y desaparecería de Productos justo cuando se está reponiendo. Llegar a una tienda no tiene vuelta. Al dudar, se muestra.
--
-- DÓNDE SE PREGUNTA. Productos (`fn_productos_filtro`, que usan su listado y sus conteos) y la tienda web (`fn_vitrina_por_que_no`, la regla
-- única de lo que se muestra: un nuevo porqué, `no_llega_a_tienda`). Vender, Apartados, Cambios, Buscar y Existencias leen
-- `fn_productos_aun_no_en_tienda()` desde la web; si esa lectura falla, se muestra la prenda. Análisis no cambia: su universo ya es lo que
-- tiene stock, ventas o llegadas en la sede (lo exige la suite). Recibir, Conteos, Traslados y Ajustar no preguntan: tienen que ver lo que hay.
--
-- CONTRATO (Liskov)
--   PROMETE: lo ocultado nunca tiene stock en una tienda: esto no puede frenar una venta real. Una sola definición de la etapa.
--   ASUME:   `ubicaciones.tipo` es 'tienda' o 'taller'.
--   NO HACE: no guarda nada, no toca stock ni órdenes. Quien sabe el enlace de la ficha la sigue abriendo: la orden la enlaza.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin políticas ni `drop trigger`. Pegar ANTES de publicar la web; la web vieja funciona igual,
-- con Productos y la tienda web ya filtrados. Es una lectura: pasa a verse menos, sin tocar un dato.
--
-- VERIFICACIÓN (solo lectura):
--   select position('no_llega_a_tienda' in pg_get_functiondef('retail.fn_vitrina_por_que_no(uuid)'::regprocedure)) > 0,
--          position('fn_productos_por_etapa' in pg_get_functiondef('retail.fn_productos_filtro'::regproc)) > 0;  → t | t
-- CÓMO SE DESHACE: los dos reemplazos al revés y `drop function` de las tres funciones nuevas (no dejan datos).
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_productos_por_etapa(p_ids uuid[] default null)
returns table (producto_id uuid, etapa text)
language sql
stable
security definer
set search_path = retail, public
as $$
  with con_orden as (
    -- Una orden anulada no cuenta: nunca hubo prenda.
    select o.producto_id, bool_or(o.estado = 'en_proceso') as abierta
    from retail.producciones o
    where o.estado <> 'anulada'
      and (p_ids is null or o.producto_id = any (p_ids))
    group by o.producto_id
  ),
  leida as (
    select c.producto_id, c.abierta,
           exists (select 1 from retail.variantes v
                     join retail.stock s on s.variante_id = v.id and s.cantidad > 0
                     join retail.ubicaciones u on u.id = s.ubicacion_id and u.tipo = 'taller'
                    where v.producto_id = c.producto_id) as en_taller,
           exists (select 1 from retail.variantes v
                     join retail.stock s on s.variante_id = v.id and s.cantidad > 0
                     join retail.ubicaciones u on u.id = s.ubicacion_id and u.tipo = 'tienda'
                    where v.producto_id = c.producto_id)
           or exists (select 1 from retail.variantes v
                        join retail.movimientos m on m.variante_id = v.id
                        join retail.ubicaciones u on u.id in (m.ubicacion_id, m.ubicacion_destino_id) and u.tipo = 'tienda'
                       where v.producto_id = c.producto_id) as llego_a_tienda
    from con_orden c
  )
  select l.producto_id,
         case when l.llego_a_tienda then 'en_tienda'
              when l.en_taller then 'terminada'
              else 'en_produccion' end
  from leida l
  where l.llego_a_tienda or l.en_taller or l.abierta;
$$;

create or replace function retail.fn_producto_etapa(p_producto_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public
as $$
  select e.etapa from retail.fn_productos_por_etapa(array[p_producto_id]) e;
$$;

-- Lo que la web esconde de sus catálogos en memoria: Vender, Apartados, Cambios y Buscar quitan las dos etapas; Existencias, solo `en_produccion`.
create or replace function retail.fn_productos_aun_no_en_tienda()
returns table (producto_id uuid, etapa text)
language sql
stable
security definer
set search_path = retail, public
as $$
  select e.producto_id, e.etapa
  from retail.fn_productos_por_etapa() e
  where e.etapa <> 'en_tienda' and retail.fn_tiene_acceso_retail();
$$;

revoke all on function retail.fn_productos_por_etapa(uuid[]) from public, anon, authenticated;
revoke all on function retail.fn_producto_etapa(uuid) from public, anon, authenticated;
revoke all on function retail.fn_productos_aun_no_en_tienda() from public, anon;
grant execute on function retail.fn_productos_aun_no_en_tienda() to authenticated;

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Productos: su listado y sus conteos salen de aquí. La lista se calcula una vez por consulta, no por fila.
select pg_temp.reemplazar_anclado(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_productos_filtro'),
  $v$and (v.activo or not exists (select 1 from retail.variantes va where va.producto_id = v.producto_id and va.activo))$v$,
  $n$and (v.activo or not exists (select 1 from retail.variantes va where va.producto_id = v.producto_id and va.activo))
      -- ADR-0614: lo del Taller que no llegó a una tienda todavía no es del catálogo.
      and p.id <> all (array(select e.producto_id from retail.fn_productos_por_etapa() e where e.etapa <> 'en_tienda'))$n$
);

-- Tienda web: la regla única de lo que se muestra. `vitrina_mostrar` ya nombra este porqué entre los «no publicables».
select pg_temp.reemplazar_anclado(
  'retail.fn_vitrina_por_que_no(uuid)',
  $v$when not retail.fn_categoria_entra_a_motores(p.categoria_id) then 'empaque'$v$,
  $n$when retail.fn_producto_etapa(p.id) in ('en_produccion', 'terminada') then 'no_llega_a_tienda' -- ADR-0614: la web vende lo que está en una tienda
    when not retail.fn_categoria_entra_a_motores(p.categoria_id) then 'empaque'$n$
);

reset lock_timeout;
