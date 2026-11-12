-- ============================================================================
-- 20261112162000_corregir_linea_al_contar.sql — CAYLA V2 · ADR-0393 (act. 2026-11-12)
-- Recibir: la categoría y la marca de una prenda «por crear» de la compra se corrigen MIENTRAS se cuenta.
--
-- EL PROBLEMA PRIMERO. Al registrar la compra en «Mis compras», la encargada anotó «Polo nousse» en Polos y era una blusa (Felipe 2026-11-12).
-- En el almacén, la tarjeta del modelo decía «Nuevo · por crear» con la categoría equivocada y no había cómo corregirla: `cambiar_linea_de_pendiente`
-- (20261107185000) solo corrige con el envío CERRADO, desde «Para después». Mientras se cuenta, «Crearla ahora» la habría creado como polo.
--
-- QUÉ CAMBIA: `corregir_linea_al_contar(p_despacho_id, p_despacho_item_ids, p_categoria_id, p_marca_id)`, con el envío ABIERTO, corrige la categoría y
-- la marca de las líneas del aviso que anotaron ese modelo (casi siempre una; la misma prenda comprada dos veces, dos), en su sitio. Lo contado de una
-- línea del aviso vive en `despacho_conteos` por `despacho_item_id` y no guarda categoría ni marca: se va con la línea sin moverse. Igual que al
-- cerrar (20261111192000), la marca queda vinculada al proveedor de la compra (`marca_proveedores`).
--
-- CANDADOS (toda prenda es de la categoría y la marca de su línea):
--   · la línea no es de una prenda del catálogo (`orden_compra_items.producto_id`), nada de ella entró al stock (`despacho_recibidos`), no tiene
--     pendientes ni diferencias de un cierre anterior (envío reabierto: se corrige en «Para después»);
--   · lo contado en la línea es solo ese modelo: sin prendas del catálogo separadas, sin otras nuevas y sin prendas sueltas sin decir qué son. Si
--     hay otra cosa, se dice: se pone en cero, se corrige y se vuelve a contar (moverla pasaría otra prenda de categoría sin que nadie lo vea);
--   · ninguna otra línea del envío contó ese modelo (al corregir quedaría partido en dos categorías).
--
-- LO QUE NO CAMBIA: la orden de compra (lo que se pidió) y la factura, como al cerrar (20261107185000); stock, movimientos y costos; el proveedor.
--
-- DESCARTÉ
--   · Soltar el candado de `cambiar_linea_de_pendiente` para el envío abierto: esa función parte de un pendiente, que solo existe al cerrar.
--   · Obligar a cerrar el envío para corregir: el almacén tiene la prenda en la mano ahora, y cerrar con la categoría mala deja la diferencia y lo que
--     «nos debe» anotados contra la categoría equivocada.
--
-- CONTRATO
--   PROMETE: con el envío abierto, las líneas pasan a esa categoría y esa marca, con lo contado; queda en la Actividad. Sin cambio, no hace nada.
--   FALLA:   envío no abierto, línea ajena, categoría o marca inactiva, o cualquiera de los candados de arriba (con su `hint`).
--   NO HACE: no cambia el proveedor, la orden ni la factura; no toca stock ni costos; no mueve un modelo agregado al contar (ese se quita y se agrega).
--
-- PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente. Pegar ANTES de publicar la web: con la web nueva
-- y la base vieja, el lápiz responde «función no encontrada» y no guarda nada.
-- VERIFICACIÓN (→ t): select to_regprocedure('retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)') is not null;
-- CÓMO SE DESHACE: drop function retail.corregir_linea_al_contar(uuid, uuid[], uuid, uuid);
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.corregir_linea_al_contar(p_despacho_id uuid, p_despacho_item_ids uuid[], p_categoria_id uuid, p_marca_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_ids uuid[];
  v_item retail.despacho_items;
  v_conteo retail.despacho_conteos;
  v_clave text;
  v_vistas integer := 0;
  v_cambiadas integer := 0;
  v_cat_antes text;
  v_cat text;
  v_marca_antes text;
  v_marca text;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Corregir lo que llega necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  v_ids := array(select distinct x from unnest(coalesce(p_despacho_item_ids, '{}'::uuid[])) x where x is not null order by x);
  if cardinality(v_ids) = 0 then
    raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'recepcion_linea_ajena';
  end if;

  -- Candados en el orden de siempre (ADR-0190): el envío → sus líneas → lo contado.
  v_despacho := (select d from retail.despachos d where d.id = p_despacho_id for update);
  if v_despacho.id is null then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado <> 'abierto' then
    raise exception 'La categoría y la marca se corrigen aquí mientras se cuenta: con el envío cerrado, corrígelas en «Para después»' using hint = 'categoria_envio_no_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  if p_categoria_id is null or not exists (select 1 from retail.categorias c where c.id = p_categoria_id and c.activo) then
    raise exception 'Elige una categoría activa' using hint = 'recepcion_extra_categoria';
  end if;
  -- Una línea de la compra siempre lleva marca al corregirla, como al cerrar (20261107185000).
  if p_marca_id is null then
    raise exception 'Elige la marca de la prenda' using hint = 'recepcion_marca';
  end if;
  if not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
    raise exception 'Esa marca ya no está activa: elige otra' using hint = 'recepcion_marca';
  end if;
  v_cat := (select c.nombre from retail.categorias c where c.id = p_categoria_id);
  v_marca := (select m.nombre from retail.marcas m where m.id = p_marca_id);

  for v_item in
    select i.* from retail.despacho_items i where i.id = any (v_ids) and i.despacho_id = p_despacho_id order by i.id for update of i
  loop
    v_vistas := v_vistas + 1;

    if exists (select 1 from retail.orden_compra_items oc where oc.id = v_item.orden_compra_item_id and oc.producto_id is not null) then
      raise exception 'Esa prenda ya está en el catálogo: su categoría se cambia en Catálogo ▸ Productos' using hint = 'categoria_linea_con_prenda';
    end if;
    if exists (select 1 from retail.despacho_recibidos r where r.despacho_id = p_despacho_id and r.despacho_item_id = v_item.id) then
      raise exception 'Parte de esta línea ya entró al stock como prenda de su categoría: no se puede corregir aquí' using hint = 'categoria_linea_con_stock';
    end if;
    if exists (select 1 from retail.despacho_pendientes y where y.despacho_id = p_despacho_id and y.despacho_item_id = v_item.id)
       or exists (select 1 from retail.despacho_diferencias f where f.despacho_id = p_despacho_id and f.despacho_item_id = v_item.id and f.vigente) then
      raise exception 'Esta línea ya se cerró una vez: corrígela en «Para después», al cerrar de nuevo' using hint = 'categoria_linea_con_diferencia';
    end if;

    -- El nombre del modelo, como lo arma la pantalla (`limpiarDescripcion` + `normaliza`).
    v_clave := lower(left(regexp_replace(btrim(coalesce(v_item.descripcion, '')), '\s+', ' ', 'g'), 200));

    v_conteo := (select k from retail.despacho_conteos k where k.despacho_id = p_despacho_id and k.despacho_item_id = v_item.id for update);
    if v_conteo.id is not null then
      if jsonb_array_length(coalesce(v_conteo.separado -> 'prendas', '[]'::jsonb)) > 0 then
        raise exception 'En esta línea ya se contaron prendas del catálogo: ponlas en cero, corrige y vuelve a contarlas' using hint = 'categoria_linea_mezclada';
      end if;
      if exists (select 1 from jsonb_array_elements(coalesce(v_conteo.separado -> 'nuevas', '[]'::jsonb)) n(x)
                  where v_clave = '' or lower(left(regexp_replace(btrim(coalesce(n.x ->> 'descripcion', '')), '\s+', ' ', 'g'), 200)) <> v_clave)
         or retail.fn_envio_total_separado(v_conteo.separado) <> v_conteo.contadas then
        raise exception 'Junto con este modelo se contaron otras prendas en su línea: ponlas en cero, corrige y vuelve a contarlas' using hint = 'categoria_linea_mezclada';
      end if;
    end if;

    if v_clave <> '' and exists (
      select 1 from retail.despacho_conteos k, jsonb_array_elements(coalesce(k.separado -> 'nuevas', '[]'::jsonb)) n(x)
       where k.despacho_id = p_despacho_id
         and (k.despacho_item_id is null or not (k.despacho_item_id = any (v_ids)))
         and lower(left(regexp_replace(btrim(coalesce(n.x ->> 'descripcion', '')), '\s+', ' ', 'g'), 200)) = v_clave
    ) then
      raise exception 'Este modelo también se contó en otra parte del envío: ponlo en cero allí, corrige y vuelve a contarlo' using hint = 'categoria_modelo_en_otra_linea';
    end if;

    continue when v_item.categoria_id = p_categoria_id and v_item.marca_id is not distinct from p_marca_id;

    update retail.despacho_items i set categoria_id = p_categoria_id, marca_id = p_marca_id where i.id = v_item.id;
    -- La compra prueba que ese proveedor trae esa marca: la pareja se registra si faltaba (como al cerrar, 20261111192000).
    insert into retail.marca_proveedores (marca_id, proveedor_id)
    select p_marca_id, o.proveedor_id
      from retail.orden_compra_items oc join retail.ordenes_compra o on o.id = oc.orden_compra_id
     where oc.id = v_item.orden_compra_item_id and o.proveedor_id is not null
    on conflict do nothing;
    v_cambiadas := v_cambiadas + 1;

    v_cat_antes := (select c.nombre from retail.categorias c where c.id = v_item.categoria_id);
    v_marca_antes := coalesce((select m.nombre from retail.marcas m where m.id = v_item.marca_id), 'Sin marca');
    begin
      perform retail.fn_actividad_anotar(
        'recibir', 'despacho_pendiente_categoria_cambiada',
        'pasó la línea ' || coalesce(v_item.descripcion, 'sin nombre') || ' de ' || v_cat_antes || ' · ' || v_marca_antes || ' a ' || v_cat || ' · ' || v_marca || ' mientras contaba ' || retail.fn_envio_numero_texto(v_despacho.numero),
        v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
        'despachos', p_despacho_id::text, now(),
        jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', null, 'despacho_item_id', v_item.id, 'categoria_antes', v_item.categoria_id, 'categoria_id', p_categoria_id, 'marca_antes', v_item.marca_id, 'marca_id', p_marca_id, 'cantidad', coalesce(v_conteo.contadas, 0)),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el cambio de línea del envío % (%)', v_despacho.numero, sqlerrm;
    end;
  end loop;

  if v_vistas <> cardinality(v_ids) then
    raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'recepcion_linea_ajena';
  end if;

  return jsonb_build_object('despacho_id', p_despacho_id, 'cambiadas', v_cambiadas);
end;
$$;
comment on function retail.corregir_linea_al_contar(uuid, uuid[], uuid, uuid) is
  'ADR-0393 (act. 2026-11-12, 20261112162000): con el envío ABIERTO, corrige la categoría y la marca de las líneas del aviso que anotaron un modelo «por crear» '
  '(despacho_items), con lo contado. Se niega si la línea es de una prenda del catálogo, si algo entró al stock, si ya se cerró una vez, si en ella se contó otra cosa '
  'o si el modelo se contó en otra línea. No toca la orden, la factura, el proveedor, el stock ni los costos. Módulo Recibir, su sede; firma el responsable; queda en la Actividad.';
revoke all on function retail.corregir_linea_al_contar(uuid, uuid[], uuid, uuid) from public, anon;
grant execute on function retail.corregir_linea_al_contar(uuid, uuid[], uuid, uuid) to authenticated, service_role;

reset lock_timeout;
