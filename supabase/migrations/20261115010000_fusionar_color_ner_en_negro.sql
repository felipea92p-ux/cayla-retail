-- ============================================================================
-- 20261115010000_fusionar_color_ner_en_negro.sql — CAYLA V2 · ADR-0576 (act. 2026-11-15) · ADR-0263 D-137
-- Fusiona el color «NER» en Negro (NEG) y lo archiva. Solo datos: no cambia el esquema ni ninguna función.
--
-- EL PROBLEMA PRIMERO. «NER» se creó a mano el 2026-10-26 (hex #100f0f, familia «tierra»): era Negro con otro nombre.
-- Nada lo frenó: el aviso «Existe también» (ADR-0576) llegó el 30-oct, y aun con él no salta: por nombre, «NER» no se
-- parece a «Negro»; por tono, la distancia ΔE2000 es 9,0 y el aviso salta bajo 8. Pasó 19 días sin uso hasta que el
-- lector de colores de la foto (ADR-0663, 2026-11-13) empezó a proponerlo: compara con la luz a la mitad (kL = 2) y
-- una prenda negra fotografiada (#0a0a0a–#222222) queda más cerca de NER que de Negro. El 2026-11-14 salieron en NER
-- tres prendas (POL-0083, PAN-0039, PAN-0041: 8 variantes, 17 unidades en TRU y LIM, sin ventas ni apartados), y
-- POL-0083 ya estaba publicada en la tienda web con el color «NER». Del 9 al 12-nov, 32 prendas negras se registraron
-- en Negro y ninguna en NER.
--
-- QUÉ HACE (Felipe, 2026-11-15: «hay que hacer una fusión y que quede por defecto el negro»).
--   1. Cada variante NER pasa a NEG con la regla de ADR-0263 D-137, la misma de `fn_corregir_identidad_variante`:
--      conserva su id, su stock y su historia (lo que la cita lo hace por id); su código se recalcula
--      (POL-0083-NER-S → POL-0083-NEG-S) y el viejo se queda en `codigos_barras` apuntando a ella, así las etiquetas ya
--      pegadas siguen sonando en Vender, Conteo, Cambios y Traslados. El disparador `variantes_registrar_cambio` anota
--      color y código en el historial de la prenda con quien firma. Las fotos y la temporada del color siguen al color
--      (paso 7 de esa función) y sube la versión de la prenda (ADR-0193: una ficha abierta antes recibe PT409).
--      No se llama a `fn_corregir_identidad_variante` porque pregunta el permiso a la cuenta (`auth.uid()`), y una
--      migración no tiene cuenta.
--   2. NER se archiva: `activo = false` y una nota. No se borra (nunca DELETE en un catálogo con historia), y su nombre
--      queda tomado (`colores_clave_unica` incluye los inactivos), así nadie vuelve a crear «NER». Inactivo, ni los
--      combos ni el lector de la foto (`cartaComparable`) lo ofrecen.
--
-- CANDADOS. Si NER no existe, no hace nada (local y CI). Aborta entera, sin tocar nada, si Negro no está activo o si
-- alguna prenda ya tiene Negro en la talla de una variante NER (D-138: no se unen variantes; eso se resuelve a mano).
-- Al final comprueba que ninguna variante ni foto quedó en NER.
--
-- PARA PEGAR. Una sola parte, sin políticas ni `drop trigger` (ADR-0195), idempotente. En producción se corrió el
-- 2026-11-15 con la firma de Felipe (`request.jwt.claims` de su cuenta, en la misma transacción), para que el historial
-- de cada prenda diga quién ordenó la fusión; sin firma, el historial queda sin autor y todo lo demás es igual.
-- ============================================================================

set lock_timeout = '3s';

do $fusion$
declare
  r record;
  v_codigo_nuevo text;
  v_temporada text;
  v_actor uuid;
  v_pid uuid;
  v_productos uuid[] := '{}';
  v_variantes int := 0;
begin
  if not exists (select 1 from retail.colores c where c.codigo = 'NER') then
    raise notice 'No hay color NER: nada que fusionar.';
    return;
  end if;

  if not exists (select 1 from retail.colores c where c.codigo = 'NEG' and c.activo) then
    raise exception 'Negro (NEG) no existe o no está activo: la fusión de NER no se hace.';
  end if;

  -- D-138: si una prenda ya tiene Negro en esa talla, son dos variantes de la misma prenda física y no se unen solas.
  if exists (
    select 1
      from retail.variantes a
      join retail.variantes b
        on b.producto_id = a.producto_id
       and b.id <> a.id
       and b.talla_id is not distinct from a.talla_id
       and b.color_codigo = 'NEG'
     where a.color_codigo = 'NER'
  ) then
    raise exception 'Una prenda ya tiene Negro en la talla de una variante NER: pasa su stock con un ajuste y desactiva la NER antes de fusionar.';
  end if;

  -- Candados en el orden de fn_corregir_identidad_variante (T8): primero las prendas, después sus variantes.
  perform 1
     from retail.productos p
    where p.id in (select v.producto_id from retail.variantes v where v.color_codigo = 'NER')
    order by p.id
      for update;

  -- 1. Las variantes, una por una (ADR-0263 D-137).
  for r in
    select v.id, v.producto_id, v.talla_id, v.codigo, p.codigo as producto_codigo
      from retail.variantes v
      join retail.productos p on p.id = v.producto_id
     where v.color_codigo = 'NER'
     order by v.producto_id, v.id
       for update of v
  loop
    v_codigo_nuevo := retail.fn_codigo_variante_libre(
      coalesce(r.producto_codigo, retail.fn_asignar_codigo_producto(r.producto_id))
        || '-NEG'
        || '-' || retail.fn_token_talla((select t.valor from retail.tallas t where t.id = r.talla_id)),
      r.id);

    if r.codigo is not null and v_codigo_nuevo is distinct from r.codigo then
      insert into retail.codigos_barras (codigo, variante_id, origen)
        values (r.codigo, r.id, 'propio')
        on conflict (codigo) do nothing;
    end if;

    update retail.variantes
       set color_codigo = 'NEG',
           codigo = v_codigo_nuevo
     where id = r.id;

    insert into retail.codigos_barras (codigo, variante_id, origen)
      values (v_codigo_nuevo, r.id, 'propio')
      on conflict (codigo) do nothing;

    v_variantes := v_variantes + 1;
    if not (r.producto_id = any (v_productos)) then
      v_productos := v_productos || r.producto_id;
    end if;
  end loop;

  -- 2. Por prenda: fotos y temporada siguen al color (ADR-0228, ADR-0246) y sube la versión (ADR-0193).
  foreach v_pid in array v_productos loop
    update retail.producto_fotos
       set color_codigo = 'NEG'
     where producto_id = v_pid
       and color_codigo = 'NER';

    for v_temporada in
      select pct.temporada
        from retail.producto_color_temporadas pct
       where pct.producto_id = v_pid
         and pct.color_codigo = 'NER'
    loop
      v_actor := retail.fn_actor_persona_id(true);
      if not exists (select 1 from retail.producto_color_temporadas pct
                      where pct.producto_id = v_pid and pct.color_codigo = 'NEG') then
        update retail.producto_color_temporadas
           set color_codigo = 'NEG'
         where producto_id = v_pid
           and color_codigo = 'NER';
        insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
        values ('producto', v_pid, 'temporada:NEG', null, v_temporada, v_actor);
      else
        -- Negro ya tiene la suya y manda; NER se queda sin variantes, y un color sin variantes no tiene temporada.
        delete from retail.producto_color_temporadas
         where producto_id = v_pid
           and color_codigo = 'NER';
      end if;
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', v_pid, 'temporada:NER', v_temporada, null, v_actor);
    end loop;

    update retail.productos set version = version where id = v_pid;
  end loop;

  -- 3. NER se archiva, no se borra.
  update retail.colores
     set activo = false,
         notas = concat_ws(' · ', nullif(btrim(notas), ''),
           'Fusionado en Negro (NEG) el 2026-11-15: era el mismo color con otro nombre (ADR-0576, act. 2026-11-15).')
   where codigo = 'NER'
     and activo;

  -- 4. Nada puede quedar colgando de NER.
  if exists (select 1 from retail.variantes v where v.color_codigo = 'NER')
     or exists (select 1 from retail.producto_fotos f where f.color_codigo = 'NER')
     or exists (select 1 from retail.producto_color_temporadas pct where pct.color_codigo = 'NER') then
    raise exception 'La fusión de NER dejó filas en NER: no se aplica nada.';
  end if;

  raise notice 'NER fusionado en Negro: % variantes de % prendas.', v_variantes, coalesce(array_length(v_productos, 1), 0);
end;
$fusion$;
