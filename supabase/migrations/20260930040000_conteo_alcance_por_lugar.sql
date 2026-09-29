-- ============================================================================
-- Conteo · «cuántas variantes vas a contar» ANTES de abrir el conteo
--
-- La tarjeta «Abrir un conteo» (maqueta `docs/maquetas/conteo-abrir-2026-09/`) dice, al elegir dónde y qué, cuántas
-- VARIANTES (modelo · color · talla) trae ese conteo. Esta función lo responde con la MISMA regla con que
-- `abrir_conteo` arma la foto (una fila por variante con stock > 0 en el lugar, sin la pieza del sistema, y si el conteo es de
-- una categoría solo esa): una cifra que no coincidiera con la foto sería peor que no tener cifra.
--
-- CONTRATO
--   PROMETE: para una ubicación, cuántas variantes traería un conteo de cada lugar (piso o almacén) y categoría, y cuántas
--            uno de toda la ubicación (`sububicacion_id` NULL: lo que cuenta una sede que no separa piso y almacén, el
--            Taller). Una fila por (lugar, categoría) con al menos una variante; `categoria_id` NULL = producto sin categoría.
--   ASUME:   quien llama puede operar esa ubicación (`fn_puede_operar_ubicacion`); si no, devuelve vacío en vez de fallar.
--   NO HACE: no escribe, no abre nada ni congela nada, y NO devuelve unidades: el conteo es a ciegas (lo que el sistema
--            espera de cada prenda se congela al abrir y no se muestra mientras se cuenta). Contar VARIANTES no lo revela:
--            es el mismo «X de N variantes verificadas» que la pantalla de contar ya muestra.
--
-- SE DEGRADA ASÍ: la pantalla trata esta función como opcional. Si no existe todavía en la base (web desplegada antes que
-- el SQL) o falla, la tarjeta se dibuja igual, sin cifras. No bloquea abrir un conteo.
--
-- Solo lectura: no toca tablas, no toma bloqueos de escritura y no lleva políticas (ADR-0195: nada que choque con el Asesor).
-- ============================================================================

create or replace function retail.fn_conteo_alcance(p_ubicacion_id uuid)
returns table(sububicacion_id uuid, categoria_id uuid, variantes integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $function$
  with permiso as (
    select fn_puede_operar_ubicacion(p_ubicacion_id) as ok
  ),
  por_variante as (
    -- La foto de `abrir_conteo`, antes de filtrar por lugar: cuánto hay de cada variante en cada sububicación.
    select st.variante_id, st.sububicacion_id, p.categoria_id, sum(st.cantidad) as cantidad
      from stock st
      join variantes va on va.id = st.variante_id
      join productos p on p.id = va.producto_id
     where st.ubicacion_id = p_ubicacion_id
       and (select ok from permiso)
       and not fn_producto_es_pieza_del_sistema(p.id)
     group by st.variante_id, st.sububicacion_id, p.categoria_id
  )
  -- Un conteo de piso o de almacén: solo esos dos lugares se pueden contar (la cuarentena tiene su propio proceso).
  select pv.sububicacion_id, pv.categoria_id, count(*)::integer
    from por_variante pv
    join sububicaciones su on su.id = pv.sububicacion_id and su.tipo in ('piso_venta', 'almacen_tienda')
   where pv.cantidad > 0
   group by pv.sububicacion_id, pv.categoria_id
  union all
  -- Un conteo de toda la ubicación (sububicación NULL): la variante cuenta una vez, con lo que suma en todos sus lugares.
  select null::uuid, t.categoria_id, count(*)::integer
    from (select variante_id, categoria_id, sum(cantidad) as cantidad from por_variante group by variante_id, categoria_id) t
   where t.cantidad > 0
   group by t.categoria_id;
$function$;

comment on function retail.fn_conteo_alcance(uuid) is
  'Cuántas variantes traería un conteo por lugar (piso/almacén) y categoría, con la misma regla que la foto de abrir_conteo; '
  'sububicacion_id NULL = toda la ubicación (sedes que no separan piso y almacén). Solo variantes, nunca unidades: el conteo es a ciegas. '
  'Vacío si quien llama no opera la ubicación. Solo lectura.';

revoke all on function retail.fn_conteo_alcance(uuid) from public, anon;
grant execute on function retail.fn_conteo_alcance(uuid) to authenticated;
