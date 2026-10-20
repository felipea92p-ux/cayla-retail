-- ============================================================================
-- 20261020004000_tienda_quitar_de_bandeja.sql — CAYLA V2 · Tienda online: quitar UNA notificación de la bandeja (Felipe, 2026-10-19)
--
-- EL CAMBIO. La «×» del panel de la campanita ya no borra la notificación: solo la quita de la bandeja (del panel). Sigue en
-- «Todas las notificaciones». «Vaciar bandeja» hace lo mismo con todas a la vez.
--
-- CÓMO. Una marca por notificación: `quitada_de_bandeja_en`. La bandeja muestra las que no tienen marca y llegaron después del último
-- vaciado. Si una talla vuelve a llegar después de estar no vigente, es un aviso nuevo: vuelve a la bandeja.
--
-- QUÉ CAMBIA
--   · `avisos_tienda.quitada_de_bandeja_en` (nueva, nula por defecto).
--   · `tienda_avisos_quitar_de_bandeja`: pone la marca a las claves dadas.
--   · `tienda_avisos_listar` (solo la bandeja) excluye las marcadas.
--   · `tienda_avisos_sincronizar`: una notificación que vuelve a llegar deja de estar marcada.
--
-- NO SE PEGA EN PRODUCCIÓN desde aquí: es una migración local para probar. Felipe lo decide antes de pegarla.
-- ============================================================================

set search_path = retail, public;

alter table retail.avisos_tienda add column if not exists quitada_de_bandeja_en timestamptz;

-- Sincronizar: lo que vuelve a llegar (estaba no vigente) sale de la papelera Y de la marca de «quitada de la bandeja».
create or replace function retail.tienda_avisos_sincronizar(p_usuario_web_id uuid, p_avisos jsonb, p_completo boolean)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_cuenta uuid;
  v_fila jsonb;
  v_claves text[] := '{}';
begin
  if p_usuario_web_id is null or p_completo is null or p_avisos is null or jsonb_typeof(p_avisos) <> 'array'
     or jsonb_array_length(p_avisos) > 200 then
    return jsonb_build_object('estado', 'invalido');
  end if;
  select w.id into v_cuenta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id for update;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;

  for v_fila in select x from jsonb_array_elements(p_avisos) x loop
    if coalesce(v_fila->>'clave', '') !~ '^(llego|respuesta)-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_fila->>'tipo', '') <> split_part(v_fila->>'clave', '-', 1)
       or coalesce(v_fila->>'titulo', '') = '' or coalesce(v_fila->>'texto', '') = '' or coalesce(v_fila->>'href', '') = '' then
      continue;
    end if;
    insert into retail.avisos_tienda as a (cuenta_web_id, clave, tipo, titulo, texto, href, recibido_en, vigente)
    values (v_cuenta, v_fila->>'clave', v_fila->>'tipo',
            left(v_fila->>'titulo', 200), left(v_fila->>'texto', 600), left(v_fila->>'href', 300),
            coalesce(nullif(v_fila->>'cuando', '')::timestamptz, now()), true)
    on conflict (cuenta_web_id, clave) do update set
      titulo = excluded.titulo,
      texto = excluded.texto,
      href = excluded.href,
      recibido_en = case when a.vigente then a.recibido_en else excluded.recibido_en end,
      borrado_en = case when a.vigente then a.borrado_en else null end,
      quitada_de_bandeja_en = case when a.vigente then a.quitada_de_bandeja_en else null end,
      vigente = true;
    v_claves := array_append(v_claves, v_fila->>'clave');
  end loop;

  if p_completo then
    update retail.avisos_tienda set vigente = false
     where cuenta_web_id = v_cuenta and tipo = 'llego' and vigente and not (clave = any (v_claves));
  end if;
  return jsonb_build_object('estado', 'ok');
end;
$$;

-- Listar: en la bandeja, sin las que se quitaron de ella.
create or replace function retail.tienda_avisos_listar(p_usuario_web_id uuid, p_busqueda text, p_pagina integer, p_tamano integer, p_solo_bandeja boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $$
declare
  v_cuenta uuid;
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_tamano integer := least(greatest(coalesce(p_tamano, 10), 1), 50);
  v_busca text := '%' || replace(replace(replace(lower(btrim(coalesce(p_busqueda, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_desde timestamptz := '-infinity'::timestamptz;
  v_solo boolean := coalesce(p_solo_bandeja, false);
  v_total integer;
  v_items jsonb;
  v_claves jsonb;
begin
  if p_usuario_web_id is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  select w.id into v_cuenta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if v_solo then
    select b.vaciada_en into v_desde from retail.avisos_bandeja b where b.cuenta_web_id = v_cuenta;
    v_desde := coalesce(v_desde, '-infinity'::timestamptz);
  end if;

  select count(*) into v_total from retail.avisos_tienda a
   where a.cuenta_web_id = v_cuenta and a.borrado_en is null and a.recibido_en > v_desde
     and (not v_solo or a.quitada_de_bandeja_en is null)
     and lower(a.titulo || ' ' || a.texto) like v_busca;

  select coalesce(jsonb_agg(f.j order by f.recibido_en desc, f.clave desc), '[]'::jsonb) into v_items
    from (
      select a.recibido_en, a.clave,
             jsonb_build_object('clave', a.clave, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'href', a.href,
                                'recibido_en', a.recibido_en, 'vigente', a.vigente) as j
        from retail.avisos_tienda a
       where a.cuenta_web_id = v_cuenta and a.borrado_en is null and a.recibido_en > v_desde
         and (not v_solo or a.quitada_de_bandeja_en is null)
         and lower(a.titulo || ' ' || a.texto) like v_busca
       order by a.recibido_en desc, a.clave desc
       limit v_tamano offset (v_pagina - 1) * v_tamano
    ) f;

  select coalesce(jsonb_agg(a.clave), '[]'::jsonb) into v_claves
    from retail.avisos_tienda a
   where a.cuenta_web_id = v_cuenta and a.borrado_en is null and a.recibido_en > v_desde
     and (not v_solo or a.quitada_de_bandeja_en is null);

  return jsonb_build_object('estado', 'ok', 'total', v_total, 'pagina', v_pagina, 'tamano', v_tamano,
                            'items', v_items, 'claves', v_claves);
end;
$$;

-- Quitar de la bandeja (no borrar): la notificación sigue en «Todas las notificaciones».
create or replace function retail.tienda_avisos_quitar_de_bandeja(p_usuario_web_id uuid, p_claves text[])
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_cuenta uuid;
  v_quitadas integer;
begin
  if p_usuario_web_id is null or p_claves is null or cardinality(p_claves) = 0 or cardinality(p_claves) > 500 then
    return jsonb_build_object('estado', 'invalido');
  end if;
  select w.id into v_cuenta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id for update;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  update retail.avisos_tienda set quitada_de_bandeja_en = now()
   where cuenta_web_id = v_cuenta and borrado_en is null and quitada_de_bandeja_en is null and clave = any (p_claves);
  get diagnostics v_quitadas = row_count;
  return jsonb_build_object('estado', 'ok', 'quitadas', v_quitadas);
end;
$$;

revoke all on function retail.tienda_avisos_quitar_de_bandeja(uuid, text[]) from public, anon, authenticated;
grant execute on function retail.tienda_avisos_quitar_de_bandeja(uuid, text[]) to tienda_web;
