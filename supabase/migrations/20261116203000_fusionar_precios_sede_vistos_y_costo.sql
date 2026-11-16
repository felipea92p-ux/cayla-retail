-- ============================================================================
-- 20261116203000_fusionar_precios_sede_vistos_y_costo.sql — Fusionar: lo que se ve es lo que se cobra (ADR-0650, act. 2026-11-16 b)
-- ============================================================================
--
-- EL PROBLEMA PRIMERO (auditoría 2026-11-16, reproducido en una base local con todas las migraciones).
--   1. Precio cambiado mientras se mira la fusión. La fusión compara la VERSIÓN de cada ficha (PT409), pero poner o cambiar un precio de
--      tienda (`poner_precio_sede`) no cambia esa versión. Si alguien le pone precio de tienda a una de las fichas entre la vista previa y
--      «Sí, fusionar», la fusión sigue y la tienda queda cobrando otra cosa que la que la persona vio: la hoja mostraba Lima a S/ 84.90 y
--      quedó en S/ 95.
--   2. Precio bajo el costo, dicho tarde. Si el precio de tienda que quedaría está bajo el costo de alguna talla, la vista previa decía
--      «todo listo» y recién al confirmar la fusión frenaba (`fn_fusion_precios_sede_costo`, 20261116020000). La frase es clara, pero la
--      persona lo sabe recién al final.
--
-- LA REGLA
--   1. La hoja manda la lista de precios por sede que mostró (`p_elecciones.precios_sede_vistos`). `fusionar_productos`, antes de escribir
--      nada, la compara con la de ese momento (la misma función, `fn_fusion_precios_sede_resumen`): si cambió, frena con PT409
--      `version_cambiada` y la frase de siempre. Se compara la HUELLA (sede, conflicto, ficha por defecto, y de cada ficha su precio y si
--      es propio), no el texto: el orden de las claves y «84.9» contra «84.90» no cuentan. Sin la clave (una pantalla de antes), nada cambia.
--   2. La vista previa marca, en cada ficha con precio propio de una sede, `bajo_costo`: si quedaría bajo el costo de alguna talla del
--      producto final que no tiene excepción propia en esa sede. Es un AVISO para elegir a tiempo; quien frena sigue siendo el control
--      exacto del final de la fusión (que además mira el costo elegido, `costo_de`, que este aviso no conoce).
--
-- DESCARTÉ
--   · Subir la versión de la ficha en cada precio de tienda: frenaría también la edición de la ficha cada vez que una tienda cambia su
--     precio, en pantallas que no tienen nada que ver con la fusión.
--   · Ensayar la fusión entera en la vista previa: necesita al responsable firmando, que la hoja pide recién al final.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA parte (dos funciones nuevas, `previsualizar_fusion_productos` reescrita y un reemplazo anclado en
-- `fusionar_productos`); sin `alter table`, sin políticas, sin `drop trigger` (ADR-0195). Idempotente. Sin `select … into` dentro de textos
-- entre comillas (ADR-0288). Necesita 20261116020000.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. La huella de una lista de precios por sede ----------

create or replace function retail.fn_fusion_precios_sede_huella(p_sedes jsonb)
returns jsonb
language sql
immutable
set search_path = retail, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'u', s ->> 'ubicacion_id',
           'c', coalesce((s ->> 'conflicto')::boolean, false),
           'd', s ->> 'por_defecto',
           'p', (select coalesce(jsonb_agg(jsonb_build_object('i', p ->> 'id', 'v', (p ->> 'precio')::numeric,
                                                              'o', coalesce((p ->> 'propio')::boolean, false))
                                           order by p ->> 'id'), '[]'::jsonb)
                   from jsonb_array_elements(case when jsonb_typeof(s -> 'productos') = 'array' then s -> 'productos' else '[]'::jsonb end) p))
         order by s ->> 'ubicacion_id'), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_sedes) = 'array' then p_sedes else '[]'::jsonb end) s
   where jsonb_typeof(s) = 'object'
$$;

comment on function retail.fn_fusion_precios_sede_huella(jsonb) is
  'ADR-0650 (act. 2026-11-16 b): la huella de una lista de precios por sede (sede, conflicto, por defecto, precio y si es propio de cada ficha), para comparar la que vio la persona con la de ahora.';
revoke all on function retail.fn_fusion_precios_sede_huella(jsonb) from public, anon, authenticated;

-- ---------- 2. El aviso de costo en la lista ----------

create or replace function retail.fn_fusion_precios_sede_con_costo(p_sedes jsonb, p_plan jsonb, p_queda uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Las tallas del producto final: las de la que queda y las que se mudan (las que se juntan desaparecen en la de la que queda).
  -- El obsequio no cuenta. El costo es el de hoy de cada talla.
  with finales as (
    select w.id, w.costo
      from retail.variantes w
     where w.activo and w.fusionada_en_id is null and w.costo is not null
       and (w.producto_id = p_queda
            or w.id in (select (e ->> 'variante_id')::uuid
                          from jsonb_array_elements(coalesce(p_plan -> 'variantes', '[]'::jsonb)) e
                         where e ->> 'trato' = 'muda' and coalesce((e ->> 'activo')::boolean, true)))
       and not (w.precio = 0 and retail.fn_categoria_admite_precio_cero((select pr.categoria_id from retail.productos pr where pr.id = p_queda)))
  )
  select coalesce(jsonb_agg(
           s || jsonb_build_object('productos', (
             select coalesce(jsonb_agg(p || jsonb_build_object('bajo_costo',
                      coalesce((p ->> 'propio')::boolean, false) and (p ->> 'precio') is not null and exists (
                        select 1 from finales f
                         where f.costo > (p ->> 'precio')::numeric
                           and not exists (select 1 from retail.precios_sede_variante pv
                                            where pv.variante_id = f.id and pv.ubicacion_id = (s ->> 'ubicacion_id')::uuid
                                              and pv.archivado_en is null)))
                    order by k), '[]'::jsonb)
               from jsonb_array_elements(s -> 'productos') with ordinality as x(p, k)))
         order by n), '[]'::jsonb)
    from jsonb_array_elements(p_sedes) with ordinality as y(s, n)
$$;

comment on function retail.fn_fusion_precios_sede_con_costo(jsonb, jsonb, uuid) is
  'ADR-0650 (act. 2026-11-16 b): marca en la lista de precios por sede la ficha cuyo precio propio quedaría bajo el costo de alguna talla (aviso de la vista previa; el control exacto es fn_fusion_precios_sede_costo).';
revoke all on function retail.fn_fusion_precios_sede_con_costo(jsonb, jsonb, uuid) from public, anon, authenticated;

-- ---------- 3. La vista previa suma el aviso de costo ----------

create or replace function retail.previsualizar_fusion_productos(p_queda uuid, p_duplicados uuid[], p_elecciones jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_plan jsonb;
  v_sedes jsonb;
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes fusionar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.'
      using errcode = '42501';
  end if;
  v_plan := retail.fn_fusion_productos_plan(p_queda, p_duplicados, p_elecciones);
  if not coalesce((v_plan ->> 'ok')::boolean, false) then
    return v_plan;
  end if;
  v_sedes := retail.fn_fusion_precios_sede_resumen(p_queda, p_duplicados, p_elecciones);
  if jsonb_array_length(v_sedes) = 0 then
    return v_plan;
  end if;
  return v_plan || jsonb_build_object(
    'precios_sede', retail.fn_fusion_precios_sede_con_costo(v_sedes, v_plan, p_queda),
    'diferencias', coalesce(v_plan -> 'diferencias', '[]'::jsonb) || '["precio_sede"]'::jsonb);
end;
$$;

-- ---------- 4. fusionar_productos: si los precios por sede cambiaron desde que se vieron, frena (reemplazo anclado) ----------

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

select pg_temp.reemplazar(
  'retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)',
  $a$  perform retail.fn_fusion_precios_sede_capturar(p_queda, v_dups, v_plan, v_el);$a$,
  $a$  -- Lo que se ve es lo que se cobra (20261116203000): si los precios por sede cambiaron desde que la persona los vio, no se escribe nada.
  if v_el ? 'precios_sede_vistos'
     and retail.fn_fusion_precios_sede_huella(v_el -> 'precios_sede_vistos')
         is distinct from retail.fn_fusion_precios_sede_huella(retail.fn_fusion_precios_sede_resumen(p_queda, v_dups, v_el)) then
    raise exception 'Los precios por sede de estas fichas cambiaron mientras mirabas la fusión: revisa los de ahora y vuelve a confirmar.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  perform retail.fn_fusion_precios_sede_capturar(p_queda, v_dups, v_plan, v_el);$a$,
  1);

-- ---------- 5. Verificación: si algo no quedó, la migración falla ----------
do $$
begin
  if position('fn_fusion_precios_sede_huella(v_el -> ''precios_sede_vistos'')' in
              pg_get_functiondef('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)'::regprocedure)) = 0
     or position('fn_fusion_precios_sede_con_costo' in
              pg_get_functiondef('retail.previsualizar_fusion_productos(uuid, uuid[], jsonb)'::regprocedure)) = 0 then
    raise exception '20261116203000: fusionar_productos o previsualizar_fusion_productos no quedaron con la huella y el aviso de costo.';
  end if;
end;
$$;
