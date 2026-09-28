-- ============================================================================
-- 20260928120310_frescura_lectura_revision3.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · paso 3 de Frescura 3c,
-- las correcciones de la revisión 3 a la lectura SQL de 20260928120300. Solo `create or replace function`: no crea
-- tablas ni módulos.
--
-- EL PROBLEMA PRIMERO. La revisión 3 corrigió tres errores de `fn_frescura_sede` y `fn_confianza_registro`, y la
-- primera vez se corrigieron EDITANDO 20260928120300 en su lugar. Pero esa migración ya estaba en main (PR #542) con la
-- orden de pegarla en producción. Editar una migración ya publicada rompe dos cosas (revisión 4 del paso 3, hallazgo 1):
--   · Quien pegue la versión de main deja producción con los errores, y la corregida ya no entra: su guarda ve un cuerpo
--     que no conoce y aborta con «alguien la cambió en vivo», cuando es la versión anterior del mismo archivo.
--   · Una base local que ya corrió 20260928120300 la tiene registrada y no vuelve a ejecutar el archivo editado.
-- Por eso 20260928120300 vuelve a ser la de main, sin tocar, y las correcciones viven aquí, con número propio: se pega
-- DESPUÉS de 20260928120300 y la base local la corre sola.
--
-- QUÉ CORRIGE (el detalle de cada una, en ADR-0208, «Revisión 3 del paso 3» y «Revisión 5 del paso 3»):
--   1. `fn_frescura_sede` · primera_exhibicion: la primera vez que el MODELO+COLOR (cualquiera de sus tallas, esté o no
--      en la lista) entró al piso de ESTA tienda, en toda su historia. La unidad de la novedad es el modelo+color
--      (ADR-0208, decisiones 4 y 9). Por talla dejaba fuera la talla agotada antes de la ventana, y la prenda repuesta en
--      OTRA talla volvía a ser «Nueva» (caso X9). Todas las tallas de un modelo+color traen el mismo valor.
--      ultima_llegada: la última llegada (`fn_es_llegada`) de ESA talla a ESTA tienda (la de otra tienda no cuenta).
--   2. `fn_frescura_sede` · temporada: sale de `fn_temporada_efectiva_nucleo(null, true)`, que incluye las variantes
--      INACTIVAS. Una talla descontinuada que sigue colgada conserva su temporada; con `fn_temporada_efectiva`, que solo
--      mira las activas, la perdía, y con ella el aviso «Temporada pasada».
--   3. `fn_confianza_registro`: sin las bajadas de productos `es_prueba`, como `fn_frescura_sede` (una bajada de práctica
--      no es el hábito del equipo; TRU tiene 12 variantes es_prueba con stock).
--   4. `fn_frescura_sede` · fin_estacion (decisión de Felipe del 2026-09-27, revisión 5): la temporada de una prenda
--      cuenta desde que LLEGÓ A CAYLA, no desde que llegó a esta tienda. `fin_estacion` sale de la última llegada a CAYLA
--      de su MODELO+COLOR (cualquier talla, cualquier sede): lote o recepción de compra, producción del Taller o carga
--      inicial. La recepción de un traslado NO: la chompa que llegó del proveedor en julio de 2025 y se trasladó en abril
--      de 2026 quedaba con el fin del invierno 2026, y la tienda que la recibió para liquidarla no veía «Temporada
--      pasada» hasta setiembre. Sale como campo nuevo, `ultima_llegada_cayla` (la pantalla lo dice junto al aviso);
--      `ultima_llegada` sigue siendo la de esta tienda, con la recepción de un traslado. `en_estacion_ahora` no cambia:
--      no depende de ninguna llegada.
--   Para la 2 nace `retail.fn_temporada_efectiva_nucleo(p_producto_id, p_con_inactivas)`: la regla de ADR-0246 (color →
--   producto → categoría), que vivía dentro de `fn_temporada_efectiva`, con la opción de incluir lo inactivo.
--   `fn_temporada_efectiva(p)` pasa a envolverla con `false`: misma firma, mismas filas (la prueba lo compara en todo el
--   catálogo), y la regla sigue en UNA función. Sin EXECUTE para nadie de afuera. Si alguien vuelve a pegar
--   20260928100000, `fn_temporada_efectiva` vuelve a su cuerpo original (mismas filas) y Frescura no se entera.
--   Para la 4 nace `retail.fn_es_llegada_a_cayla(tipo, motivo, lote, producción, recepción)`, immutable, sin EXECUTE para
--   nadie de afuera: `fn_es_llegada` sin la recepción de un traslado. `fn_es_llegada` no cambia (es el predicado de
--   Análisis, donde «entradas» es lo que recibió la sede, también de otra tienda): sigue siendo la de 20260928120300.
--
-- CUÁNTO CUESTA (la misma carga de 20260928120300: una tienda, 2.000 prendas en 200 modelos con temporada, 20.000
-- bajadas, 10.000 ventas; mediana de 7 corridas): fn_frescura_sede 754 ms (751-799) a 120 días y 233 ms a 30 con las
-- correcciones 1 a 3 (antes 733 y 205); con la 4, medidas el 2026-09-27 en la misma base contra la versión anterior de
-- este archivo, 763 ms (720-793) contra 759 (755-795) a 120 días y 221 (218-229) contra 229 (226-231) a 30: la llegada a
-- CAYLA es una búsqueda por índice por modelo+color, como la primera exhibición. fn_confianza_registro 128 ms de una
-- tienda y 140 ms de todas (antes 126 y 127; la 4 no la toca).
--
-- LA GUARDA. Pide 20260928120300 ya pegada (`fn_es_llegada` con su cuerpo) y, para cada función que reescribe, acepta
-- solo el cuerpo de 20260928120300 (la versión anterior de esta misma lectura), el de este archivo o, para
-- `fn_frescura_sede`, el de la primera versión de este archivo (`618e465d…`, antes de la decisión 4; vivió solo en la rama
-- y en bases locales, nunca en producción). Con otro, aborta sin tocar nada: alguien la parchó en vivo y pegar esto
-- borraría el parche (lo que rompió Análisis con el PR 397). Se puede pegar dos veces. Al revés también es seguro: con
-- esta ya pegada, volver a pegar 20260928120300 aborta (su guarda no conoce estos cuerpos) y no deshace nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.`), a cualquier hora, DESPUÉS de
-- 20260928120300. Solo `create or replace function`, comentarios, `revoke` y `grant`: sin políticas, sin
-- `drop trigger`, sin `alter` de tablas (ADR-0195). Ninguna pantalla la llama todavía.
-- Cómo se verifica después (solo lectura):
--   select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace
--    and proname in ('fn_es_llegada', 'fn_es_llegada_a_cayla', 'fn_frescura_sede', 'fn_confianza_registro',
--                    'fn_temporada_efectiva_nucleo', 'fn_temporada_efectiva');
-- da los seis md5 NUEVOS de la guarda de abajo (el de fn_es_llegada, el de 20260928120300).
--
-- SE ROMPE SI alguien vuelve a editar en su lugar una migración que ya está en main: la corrección va siempre en un
-- archivo nuevo, cuya guarda acepta el cuerpo anterior. Y lo que ya decía 20260928120300 (la carga inicial sin su
-- bajada en la misma transacción, otra forma de «llegada» en `fn_resumen_comparacion`, un traslado entre tiendas
-- escrito como `traslado` directo al piso, un cruce entre dos pasos calculados). De la decisión 4: si la mercadería que
-- llega de afuera entra por una puerta que no deja lote, producción ni `carga_inicial` (hoy los ajustes «reposicion» y
-- «conteo_fisico» de TRU), ese modelo+color no tiene llegada a CAYLA y nunca avisa «Temporada pasada», ni en la tienda
-- que lo recibe trasladado; y si el Taller repite un modelo+color en su temporada, las unidades viejas de ese
-- modelo+color en otra tienda dejan de avisar hasta el fin de la estación nueva (es la regla: el modelo está en su
-- temporada en CAYLA).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_md5 text;
begin
  if to_regprocedure('retail.fn_ledger_puntos(uuid, timestamptz, uuid[])') is null then
    raise exception 'Falta retail.fn_ledger_puntos: pega antes 20260924030000 y 20260928120010.';
  end if;
  if not coalesce((select 'es_carga_inicial' = any(p.proargnames) from pg_proc p
                    where p.oid = to_regprocedure('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)')), false) then
    raise exception 'Falta el núcleo de las bajadas con es_carga_inicial: pega antes 20260928120100 y 20260928120200.';
  end if;
  if to_regprocedure('retail.fn_ocurrencia_temporada(text, timestamptz)') is null
     or to_regprocedure('retail.fn_temporada_efectiva(uuid)') is null
     or to_regprocedure('retail.fn_temporadas()') is null then
    raise exception 'Faltan las temporadas (ADR-0246): pega antes 20260928100000_temporadas_como_atributo.sql.';
  end if;
  -- 20260928120300 ya pegada: fn_es_llegada (que esto usa y no reescribe) con su cuerpo.
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_es_llegada(text, text, uuid, uuid, uuid)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_es_llegada: pega antes 20260928120300_frescura_lectura.sql.';
  end if;
  if v_md5 <> '5089ba50874f611d96d5df751b63ed57' then
    raise exception 'fn_es_llegada tiene otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  -- Cada función que se reescribe: el cuerpo de 20260928120300 (o, para fn_temporada_efectiva, el de 20260928100000) o el
  -- de este archivo. Nunca otro.
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_frescura_sede: pega antes 20260928120300_frescura_lectura.sql.';
  end if;
  -- 618e465d…: la primera versión de este archivo (antes de la decisión 4), que corrió en bases locales de la rama.
  if v_md5 not in ('644e10126796adc1111702290c14f2bb', '618e465d586cf3193e7e8197059f4071', '51babffc09da4073691ee251882967c8') then
    raise exception 'fn_frescura_sede tiene otro cuerpo (md5 %): no es la de 20260928120300 ni la de este archivo; alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_confianza_registro(uuid, integer)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_confianza_registro: pega antes 20260928120300_frescura_lectura.sql.';
  end if;
  if v_md5 not in ('9c714f98dd2776eebb505846eb24c33a', '8c6f5e6c27916b99be10020b772bd6e0') then
    raise exception 'fn_confianza_registro tiene otro cuerpo (md5 %): no es la de 20260928120300 ni la de este archivo; alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_temporada_efectiva_nucleo(uuid, boolean)');
  if v_md5 is not null and v_md5 <> '2bf80eb239248cce88cf8062238f4dfc' then
    raise exception 'fn_temporada_efectiva_nucleo ya existe con otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_es_llegada_a_cayla(text, text, uuid, uuid, uuid)');
  if v_md5 is not null and v_md5 <> '7e1ffb6d9853027ec685fef46ec72a4c' then
    raise exception 'fn_es_llegada_a_cayla ya existe con otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_temporada_efectiva(uuid)');
  if v_md5 not in ('1cc652ba0bef3e9783a014b840cb870f', 'e96b3c6c51fd12ca712e76d63efd6448') then
    raise exception 'fn_temporada_efectiva cambió desde 20260928100000 (md5 %): alguien la parchó en vivo. Reescribe el núcleo desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. La temporada efectiva, también de lo descontinuado
-- ----------------------------------------------------------------------------

-- La regla de ADR-0246 (color → producto → categoría), tal cual vivía en fn_temporada_efectiva (20260928100000), con
-- una sola diferencia: `p_con_inactivas`. La pantalla de Temporadas lista lo que se puede completar (solo activas);
-- Frescura mira lo que está colgado, y una talla descontinuada con stock sigue colgada: sin su temporada no avisaría
-- «Temporada pasada» y pediría completar una temporada que ya tiene (revisión 3).
create or replace function retail.fn_temporada_efectiva_nucleo(p_producto_id uuid, p_con_inactivas boolean)
returns table (producto_id uuid, color_codigo text, estado text, temporada text, origen text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select pc.producto_id,
         pc.color_codigo,
         p.estado,
         coalesce(pct.temporada, p.temporada, c.temporada) as temporada,
         case when pct.temporada is not null then 'color'
              when p.temporada is not null then 'producto'
              when c.temporada is not null then 'categoria' end as origen
    from (select distinct v.producto_id, v.color_codigo
            from retail.variantes v
           where (v.activo or coalesce(p_con_inactivas, false))
             and (p_producto_id is null or v.producto_id = p_producto_id)) pc
    join retail.productos p on p.id = pc.producto_id
    left join retail.categorias c on c.id = p.categoria_id
    left join retail.producto_color_temporadas pct
           on pct.producto_id = pc.producto_id and pct.color_codigo = pc.color_codigo
   where p.id <> '11111111-1111-4111-8111-111111111111'::uuid;
$$;

comment on function retail.fn_temporada_efectiva_nucleo(uuid, boolean) is
  'ADR-0246 y ADR-0208 (paso 3 de Frescura 3c): la temporada efectiva de cada modelo+color (color → producto → categoría), la regla que antes vivía dentro de fn_temporada_efectiva; con p_con_inactivas también lo descontinuado (lo usa fn_frescura_sede). fn_temporada_efectiva(p) = este núcleo con false. Interna: la usan funciones security definer.';

revoke all on function retail.fn_temporada_efectiva_nucleo(uuid, boolean) from public, anon, authenticated;

-- Misma firma, mismas filas, mismos permisos (create or replace los conserva): solo pasa a envolver al núcleo.
create or replace function retail.fn_temporada_efectiva(p_producto_id uuid default null)
returns table (producto_id uuid, color_codigo text, estado text, temporada text, origen text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select * from retail.fn_temporada_efectiva_nucleo(p_producto_id, false);
$$;

-- ----------------------------------------------------------------------------
-- 2. La llegada A CAYLA, con nombre propio (decisión de Felipe del 2026-09-27)
-- ----------------------------------------------------------------------------

-- La temporada de una prenda cuenta desde que llegó a CAYLA: del proveedor (lote), del Taller (producción) o en la
-- carga inicial, en cualquier sede. La recepción de un traslado es una llegada a la TIENDA (`fn_es_llegada`, lo que
-- Análisis cuenta como «entradas» de la sede), no a CAYLA: la prenda ya estaba en la empresa y su estación no vuelve a
-- empezar porque cambió de tienda. Se escribe como `fn_es_llegada` menos la recepción, no como otra lista: si algún día
-- una llegada nueva entra a `fn_es_llegada` (con su prueba contra Análisis), la temporada la hereda sin que nadie se
-- acuerde de copiarla. Sin `set search_path` (lo impediría expandirse dentro de la consulta) y con el esquema escrito.
create or replace function retail.fn_es_llegada_a_cayla(
  p_tipo text,
  p_motivo text,
  p_lote_id uuid,
  p_produccion_id uuid,
  p_transferencia_recepcion_id uuid
)
returns boolean
language sql
immutable
as $$
  select retail.fn_es_llegada(p_tipo, p_motivo, p_lote_id, p_produccion_id, p_transferencia_recepcion_id)
     and p_transferencia_recepcion_id is null
$$;

comment on function retail.fn_es_llegada_a_cayla(text, text, uuid, uuid, uuid) is
  'ADR-0208 (paso 3 de Frescura 3c, revisión 5; decisión de Felipe del 2026-09-27): ¿este movimiento es una LLEGADA A CAYLA? fn_es_llegada (lote, producción, recepción de un traslado o carga inicial) SIN la recepción de un traslado: la prenda que cambia de tienda ya estaba en CAYLA. De aquí sale fin_estacion en fn_frescura_sede (la temporada cuenta desde que llegó a CAYLA). Nunca devuelve nulo. Interna: la usan funciones security definer.';

revoke all on function retail.fn_es_llegada_a_cayla(text, text, uuid, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. La lectura de una tienda (primera exhibición del modelo+color, última llegada de esta tienda, temporada de lo
--    descontinuado, fin de estación desde la última llegada a CAYLA)
-- ----------------------------------------------------------------------------

create or replace function retail.fn_frescura_sede(p_ubicacion_id uuid, p_dias integer default 120)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $fn$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';          -- «Prenda sin registrar» (variante)
  c_producto_centinela constant uuid := '11111111-1111-4111-8111-111111111111'; -- y su producto
  v_ahora timestamptz := now();
  v_desde timestamptz;
  v_piso uuid;
  v_alm uuid;
  v_ids uuid[];
  v_carga jsonb;
  v_tardias jsonb;
  v_dudosas jsonb;
  v_eventos jsonb;
  v_prendas jsonb;
begin
  if not (fn_es_lider() and fn_puede_operar_ubicacion(p_ubicacion_id)) then
    raise exception 'Solo el líder puede ver la frescura del piso de esta sede.' using hint = 'frescura_sin_permiso';
  end if;
  if p_dias is null or p_dias not between 1 and 120 then
    raise exception 'La ventana va de 1 a 120 días.';
  end if;
  v_desde := v_ahora - make_interval(days => p_dias);

  select s.id into v_piso from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta';
  select s.id into v_alm from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda';
  -- El Taller, una tienda que aún no separa piso y almacén, una inactiva (el libro no la reconstruye) o una que no existe:
  -- no hay piso que mirar, y no es un error.
  if v_piso is null or v_alm is null
     or not exists (select 1 from ubicaciones u where u.id = p_ubicacion_id and u.activo) then
    return jsonb_build_object('separa_piso', false);
  end if;

  -- QUÉ PRENDAS: stock distinto de 0 hoy fuera de la cuarentena, o algún movimiento de la tienda en la ventana. Sin la
  -- «Prenda sin registrar» ni productos de prueba. Nunca nulo: el libro con nulo lee otra cosa (solo lo que se movió).
  select coalesce(array_agg(i.variante_id), '{}'::uuid[]) into v_ids
    from (
      select s.variante_id
        from stock s
        left join sububicaciones su on su.id = s.sububicacion_id
       where s.ubicacion_id = p_ubicacion_id and s.cantidad <> 0 and su.tipo is distinct from 'cuarentena'
      union
      select m.variante_id
        from movimientos m
       where m.ubicacion_id = p_ubicacion_id and m.created_at >= v_desde
         and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado')
      union
      select m.variante_id
        from movimientos m
       where m.ubicacion_destino_id = p_ubicacion_id and m.created_at >= v_desde and m.tipo = 'traslado'
    ) i
    join variantes v on v.id = i.variante_id
    join productos p on p.id = v.producto_id
   where i.variante_id <> c_centinela and p.id <> c_producto_centinela and not p.es_prueba;

  -- UNA llamada al núcleo de las bajadas (paso 2): las de carga inicial (para la marca 4), las tardías cerradas y las
  -- prendas «dudosas». Las bajadas se leen por id (mapa jsonb), no cruzando dos conjuntos calculados.
  select coalesce(jsonb_object_agg(n.movimiento_id, true) filter (where n.es_carga_inicial), '{}'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('oid', n.movimiento_id, 'variante_id', n.variante_id,
                                               'bajada_en', n.bajada_en, 'unidades_tardias', n.unidades_tardias)
                            order by n.bajada_en, n.movimiento_id)
                    filter (where n.cerrada and n.estado not in ('dudosa', 'corregida') and n.unidades_tardias > 0),
                  '[]'::jsonb),
         coalesce(jsonb_agg(distinct n.variante_id) filter (where n.estado = 'dudosa'), '[]'::jsonb)
    into v_carga, v_tardias, v_dudosas
    from fn_bajadas_del_piso_nucleo(p_ubicacion_id, v_desde, null) n
   where n.variante_id in (select unnest(v_ids));

  -- UNA llamada al libro (ADR-0202) con la lista de prendas: sus puntos de PISO, con las marcas. La 4 de lo que no es
  -- interno se decide con una búsqueda por id en `movimientos`, solo para esos puntos (pocos: ajustes, devoluciones,
  -- llegadas directo al piso).
  select coalesce(jsonb_object_agg(e.variante_id, e.eventos), '{}'::jsonb) into v_eventos
    from (
      select p.variante_id,
             jsonb_agg(jsonb_build_array(p.ts, p.delta, p.marcas, p.oid) order by p.ts, p.ord, p.oid) as eventos
        from (
          select pt.variante_id, pt.ts, pt.ord, pt.oid, pt.delta,
                 (case when pt.es_venta then 1 else 0 end)
               + (case when pt.es_interno then 2 else 0 end)
               + (case when pt.delta <= 0 then 0
                       when pt.ord = 0 then 4                                        -- el saldo con que arranca la ventana
                       when pt.es_interno then case when v_carga ? pt.oid::text then 4 else 0 end  -- bajada de carga inicial
                       when coalesce((select not fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
                                             or coalesce(m.motivo = 'carga_inicial', false)
                                        from movimientos m where m.id = pt.oid), true) then 4
                       else 0 end) as marcas
            from fn_ledger_puntos(p_ubicacion_id, v_desde, v_ids) pt
           where pt.bucket = 'piso' and (pt.ord = 1 or pt.delta <> 0)
        ) p
       group by p.variante_id
    ) e;

  -- Las prendas: catálogo, stock de hoy e historia de la tienda por búsquedas por índice (una por prenda); la historia de
  -- cada modelo+color por búsquedas por índice (una por modelo+color); la temporada, si es clásica, el fin de su
  -- aparición y si hoy es su estación, de mapas de una fila.
  with u as (
    select v.id as variante_id, v.producto_id, p.referencia, v.codigo, v.color_codigo, co.nombre as color_nombre,
           ta.valor as talla, p.categoria_id, c.nombre as categoria_nombre
      from variantes v
      join productos p on p.id = v.producto_id
      left join categorias c on c.id = p.categoria_id
      left join tallas ta on ta.id = v.talla_id
      left join colores co on co.codigo = v.color_codigo
     where v.id in (select unnest(v_ids))
  ),
  temporada_de as (
    -- La temporada de cada modelo+color (ADR-0246: color → producto → categoría), por clave.
    select coalesce(jsonb_object_agg(t.producto_id::text || '|' || coalesce(t.color_codigo, ''),
                                     jsonb_build_array(t.temporada, t.origen)), '{}'::jsonb) as m
      from fn_temporada_efectiva_nucleo(null, true) t
     where t.temporada is not null
  ),
  catalogo as (
    select coalesce(jsonb_object_agg(t.clave, t.es_clasico), '{}'::jsonb) as clasico from fn_temporadas() t
  ),
  hoy_es_su_estacion as (
    -- Por temporada con estación (9 como mucho): ¿hoy cae dentro de alguna de sus apariciones?
    select coalesce(jsonb_object_agg(t.clave, oc.desde <= v_ahora and (oc.hasta is null or v_ahora < oc.hasta)), '{}'::jsonb) as m
      from fn_temporadas() t
      cross join lateral fn_ocurrencia_temporada(t.clave, v_ahora) oc
  ),
  modelos as (
    -- Cada modelo+color de la lista, una vez, con su clave.
    select distinct u.producto_id, u.color_codigo, u.producto_id::text || '|' || coalesce(u.color_codigo, '') as clave
      from u
  ),
  primera_de as (
    -- La primera exhibición es del MODELO+COLOR (ADR-0208, decisiones 4 y 9: la novedad es del modelo+color y es una
    -- sola vez por tienda): la primera vez que CUALQUIERA de sus tallas entró al piso de esta tienda, esté o no en la
    -- lista (una talla agotada antes de la ventana no está, y su exhibición sí cuenta). Una búsqueda por modelo+color
    -- distinto (variantes por producto, movimientos por variante), que después se lee por clave.
    select coalesce(jsonb_object_agg(x.clave, pe.primera), '{}'::jsonb) as m
      from modelos x
      cross join lateral (
        select min(m.created_at) as primera
          from variantes v2
          join movimientos m on m.variante_id = v2.id
         where v2.producto_id = x.producto_id
           and v2.color_codigo is not distinct from x.color_codigo
           and ((m.ubicacion_id = p_ubicacion_id and m.sububicacion_id = v_piso
                 and (m.tipo = 'entrada' or (m.tipo = 'ajuste' and m.cantidad > 0)))
                or (m.tipo = 'traslado' and m.ubicacion_destino_id = p_ubicacion_id and m.sububicacion_destino_id = v_piso))
      ) pe
     where pe.primera is not null
  ),
  llegada_cayla_de as (
    -- La última LLEGADA A CAYLA del modelo+color (decisión de Felipe del 2026-09-27): de cualquiera de sus tallas, esté o
    -- no en la lista, activa o no, en CUALQUIER sede (`fn_es_llegada_a_cayla`: lote o recepción de compra, producción del
    -- Taller, carga inicial). La recepción de un traslado no cuenta: su temporada no vuelve a empezar porque cambió de
    -- tienda. La novedad («Nueva») sigue siendo de esta tienda (`primera_de`): son dos preguntas distintas.
    select coalesce(jsonb_object_agg(x.clave, lc.ultima), '{}'::jsonb) as m
      from modelos x
      cross join lateral (
        select max(m.created_at) as ultima
          from variantes v2
          join movimientos m on m.variante_id = v2.id
         where v2.producto_id = x.producto_id
           and v2.color_codigo is not distinct from x.color_codigo
           and fn_es_llegada_a_cayla(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
      ) lc
     where lc.ultima is not null
  ),
  base as materialized (
    select u.*, st.piso, st.total - st.piso as almacen,
           ((select pd.m from primera_de pd) ->> (u.producto_id::text || '|' || coalesce(u.color_codigo, '')))::timestamptz
             as primera_exhibicion,
           h.ultima_llegada,
           ((select lc.m from llegada_cayla_de lc) ->> (u.producto_id::text || '|' || coalesce(u.color_codigo, '')))::timestamptz
             as ultima_llegada_cayla,
           tp.par ->> 0 as temporada, tp.par ->> 1 as temporada_origen
      from u
      left join lateral (
        select coalesce(sum(s.cantidad) filter (where su.tipo = 'piso_venta'), 0)::integer as piso,
               coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0)::integer as total
          from stock s
          left join sububicaciones su on su.id = s.sububicacion_id
         where s.variante_id = u.variante_id and s.ubicacion_id = p_ubicacion_id
      ) st on true
      left join lateral (
        -- Toda la historia de esta talla en ESTA tienda: su última llegada.
        select max(m.created_at) as ultima_llegada
          from movimientos m
         where m.variante_id = u.variante_id
           and m.ubicacion_id = p_ubicacion_id
           and fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
      ) h on true
      cross join lateral (
        select (select td.m from temporada_de td) -> (u.producto_id::text || '|' || coalesce(u.color_codigo, '')) as par
      ) tp
  ),
  fin_de as (
    -- El fin de la aparición de su temporada que corresponde a su última llegada A CAYLA: una llamada por pareja distinta.
    select coalesce(jsonb_object_agg(x.clave, oc.hasta), '{}'::jsonb) as m
      from (select distinct b.temporada || '|' || b.ultima_llegada_cayla::text as clave, b.temporada, b.ultima_llegada_cayla
              from base b
             where b.temporada is not null and b.ultima_llegada_cayla is not null) x
      cross join lateral fn_ocurrencia_temporada(x.temporada, x.ultima_llegada_cayla) oc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'variante_id', b.variante_id,
           'producto_id', b.producto_id,
           'producto_nombre', b.referencia,
           'codigo', b.codigo,
           'color_codigo', b.color_codigo,
           'color_nombre', b.color_nombre,
           'talla', b.talla,
           'categoria_id', b.categoria_id,
           'categoria_nombre', b.categoria_nombre,
           'temporada', b.temporada,
           'temporada_origen', b.temporada_origen,
           'es_clasico', coalesce(((select ca.clasico from catalogo ca) -> b.temporada)::boolean, false),
           'fin_estacion', (select f.m from fin_de f) -> (b.temporada || '|' || b.ultima_llegada_cayla::text),
           'en_estacion_ahora', (select e.m from hoy_es_su_estacion e) -> b.temporada,
           'primera_exhibicion', b.primera_exhibicion,
           'ultima_llegada', b.ultima_llegada,
           'ultima_llegada_cayla', b.ultima_llegada_cayla,
           'piso_hoy', coalesce(b.piso, 0),
           'almacen_hoy', coalesce(b.almacen, 0))
         order by b.categoria_nombre nulls last, b.referencia, b.color_nombre nulls first, b.talla nulls first, b.variante_id),
         '[]'::jsonb)
    into v_prendas
    from base b;

  return jsonb_build_object(
    'separa_piso', true,
    'desde', v_desde,
    'ahora', v_ahora,
    'prendas', v_prendas,
    'eventos', v_eventos,
    'tardias', v_tardias,
    'dudosas', v_dudosas);
end
$fn$;

comment on function retail.fn_frescura_sede(uuid, integer) is
  'ADR-0208 (paso 3 de Frescura 3c): la lectura de una tienda para Frescura del piso, en un solo jsonb. prendas (stock distinto de 0 hoy fuera de la cuarentena o algún movimiento en la ventana; sin la Prenda sin registrar ni productos es_prueba), con su temporada (fn_temporada_efectiva_nucleo, también de lo descontinuado), si es clásica, el fin de la estación de la última llegada de su modelo+color A CAYLA (ultima_llegada_cayla: lote, producción o carga inicial en cualquier sede, fn_es_llegada_a_cayla; la recepción de un traslado no), si hoy es su estación, la primera exhibición de su modelo+color (cualquier talla) y su última llegada en esa tienda (fn_es_llegada), y su piso y almacén de hoy; eventos del piso por prenda [ts, delta, marcas, oid] (1 venta, 2 interno, 4 edad desconocida) para el FIFO de historiaDeCohortes; tardias y dudosas del núcleo de bajadas. Taller o tienda sin piso y almacén: {"separa_piso": false}. Solo lectura; una llamada al libro y una al núcleo. Candado: líder y opera la tienda (el módulo frescura nace con la pantalla).';

revoke all on function retail.fn_frescura_sede(uuid, integer) from public, anon;
grant execute on function retail.fn_frescura_sede(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. La confianza del registro, por tienda y mes de Lima (sin productos de prueba)
-- ----------------------------------------------------------------------------

create or replace function retail.fn_confianza_registro(p_ubicacion_id uuid default null, p_meses integer default 2)
returns table (
  ubicacion_id uuid,
  sede text,
  mes date,
  filas integer,
  unidades integer,
  tardias integer,
  confianza numeric,
  nivel text
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $fn$
#variable_conflict use_column
declare
  -- W, la ventana de la bajada tardía del núcleo (10 minutos, su valor por defecto). Una fila cerrada todavía puede
  -- cambiar hasta 2W después de la bajada (ADR-0208, T33): solo cuentan las de hace 2W o más.
  c_ventana constant interval := interval '10 minutes';
  v_ahora timestamptz := now();
  v_mes_actual date := date_trunc('month', v_ahora at time zone 'America/Lima')::date;
  v_primer_mes date;
  v_desde timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo el líder puede ver la confianza del registro.' using hint = 'frescura_sin_permiso';
  end if;
  if p_ubicacion_id is not null and not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'Solo el líder puede ver la confianza del registro de esta sede.' using hint = 'frescura_sin_permiso';
  end if;
  -- El núcleo lee hasta 120 días: tres meses calendario caben siempre (el primer día del antepasado queda a 92 como mucho).
  if p_meses is null or p_meses not between 1 and 3 then
    raise exception 'Se leen de 1 a 3 meses.';
  end if;
  v_primer_mes := (v_mes_actual - make_interval(months => p_meses - 1))::date;
  v_desde := v_primer_mes::timestamp at time zone 'America/Lima';

  return query
  with sedes as (
    -- Las tiendas con piso y almacén (el Taller no tiene piso); con p_ubicacion_id, solo esa.
    select u.id, u.nombre
      from ubicaciones u
     where u.activo
       and (p_ubicacion_id is null or u.id = p_ubicacion_id)
       and exists (select 1 from sububicaciones s where s.ubicacion_id = u.id and s.tipo = 'piso_venta')
       and exists (select 1 from sububicaciones s where s.ubicacion_id = u.id and s.tipo = 'almacen_tienda')
  ),
  meses as (
    select g::date as mes from generate_series(v_primer_mes::timestamp, v_mes_actual::timestamp, interval '1 month') g
  ),
  cuentan as (
    select s.id as sede_id, date_trunc('month', n.bajada_en at time zone 'America/Lima')::date as mes_bajada,
           n.cantidad_efectiva, n.unidades_tardias
      from sedes s
      cross join lateral fn_bajadas_del_piso_nucleo(s.id, v_desde, null) n
      -- Sin productos de prueba, como fn_frescura_sede: una bajada de práctica no es el hábito del equipo (revisión 3).
      -- La prenda se busca por llave (variante → producto), sin cruzar dos conjuntos calculados.
      join variantes v on v.id = n.variante_id
      join productos p on p.id = v.producto_id
     where n.cerrada
       and not p.es_prueba
       and n.estado not in ('dudosa', 'corregida')
       and not n.es_carga_inicial
       and n.bajada_en + 2 * c_ventana <= v_ahora
  ),
  por_mes as (
    select c.sede_id, c.mes_bajada, count(*)::integer as n_filas, sum(c.cantidad_efectiva)::integer as n_unidades,
           sum(c.unidades_tardias)::integer as n_tardias
      from cuentan c
     group by c.sede_id, c.mes_bajada
  )
  select s.id, s.nombre, m.mes,
         coalesce(pm.n_filas, 0),
         coalesce(pm.n_unidades, 0),
         coalesce(pm.n_tardias, 0),
         case when coalesce(pm.n_unidades, 0) > 0 then round(1 - pm.n_tardias::numeric / pm.n_unidades, 4) end,
         case when coalesce(pm.n_filas, 0) >= 20 then 'solido'
              when coalesce(pm.n_filas, 0) >= 10 then 'aceptable'
              when coalesce(pm.n_filas, 0) >= 1 then 'pocos_datos' end
    from sedes s
    cross join meses m
    left join por_mes pm on pm.sede_id = s.id and pm.mes_bajada = m.mes
   order by s.nombre, m.mes;
end
$fn$;

comment on function retail.fn_confianza_registro(uuid, integer) is
  'ADR-0208 (paso 3 de Frescura 3c): la confianza del registro de las bajadas al piso, por tienda y mes calendario de Lima (p_meses de 1 a 3, el actual y los anteriores). filas = bajadas que cuentan (cerradas, ni dudosa ni corregida, sin productos es_prueba ni la carga inicial, de hace 20 minutos o más para que la cifra no se mueva); unidades = suma de cantidad_efectiva; tardias = unidades registradas al cobrar; confianza = 1 - tardias / unidades (nula sin unidades); nivel por filas: pocos_datos 1-9, aceptable 10-19, solido 20 o más. Una fila por tienda y mes aunque no haya bajadas. Sin personas: el indicador es del equipo. Candado: líder (con una tienda, además que la opere).';

revoke all on function retail.fn_confianza_registro(uuid, integer) from public, anon;
grant execute on function retail.fn_confianza_registro(uuid, integer) to authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';
