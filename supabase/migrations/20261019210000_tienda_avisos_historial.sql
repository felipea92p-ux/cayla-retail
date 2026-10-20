-- ============================================================================
-- 20261019210000_tienda_avisos_historial.sql — CAYLA V2 · Tienda online: historial de notificaciones por cuenta (Felipe, 2026-10-19)
--
-- EL PROBLEMA. La campanita solo sabía lo que estaba a favor HOY (una talla que llegó, una respuesta reciente). Una talla que se separó o
-- se volvió a acabar desaparecía, y nada guardaba CUÁNDO le llegó el aviso a la clienta. Felipe quiere: el panel con las 5 más recientes,
-- la hora de recepción de cada una, y una pantalla «Todas las notificaciones» con búsqueda, paginado y borrado.
--
-- ANALOGÍA CAYLA. Es el buzón de la clienta en la tienda: cada aviso entra con su fecha y hora de llegada, y se queda ahí hasta que ella
-- lo tira. Aunque la prenda ya no esté, el aviso sigue en el buzón.
--
-- QUÉ HACE
--   1. `retail.avisos_tienda`: un aviso por cuenta y clave (la misma clave que usa la tienda: «llego-…» o «respuesta-…»), con su texto
--      tal como se vio al recibirlo, su hora de recepción (`recibido_en`), si sigue a favor (`vigente`) y si la persona lo borró (`borrado_en`).
--   2. `tienda_avisos_sincronizar`: la tienda la llama al leer los avisos. Anota los nuevos y, si la lista de tallas es completa, marca como
--      no vigentes las tallas que ya no están a favor (se volvieron a acabar). Una talla que vuelve a llegar después de estar no vigente es
--      un aviso NUEVO: recibido_en se reinicia y sale de la papelera.
--   3. `tienda_avisos_listar`: las notificaciones no borradas, de la más reciente a la más antigua, con búsqueda y paginado.
--   4. `tienda_avisos_borrar`: borra una, varias o todas (la fila queda con `borrado_en`: no se pierde, no sale más).
--
-- QUÉ SE GARANTIZA
--   · Una fila por cuenta y clave (llave primaria): un aviso no se duplica aunque la tienda lo lea mil veces.
--   · Cada cuenta solo toca lo suyo: las funciones buscan la cuenta por su usuario (`cuentas_web`).
--   · Topes: 200 avisos por sincronización, 50 por página, 500 claves por borrado.
--   · RLS encendido y sin políticas; nadie lee ni escribe la tabla por fuera de sus funciones (ni `tienda_web` directamente).
--
-- NO SE PEGA EN PRODUCCIÓN desde aquí: es una migración local para probar. Antes de pegarla en producción, Felipe lo decide.
-- ============================================================================

set search_path = retail, public;

create table if not exists retail.avisos_tienda (
  cuenta_web_id uuid not null references retail.cuentas_web (id) on delete cascade,
  clave text not null
    check (clave ~ '^(llego|respuesta)-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  tipo text not null check (tipo in ('llego', 'respuesta')),
  titulo text not null check (char_length(titulo) between 1 and 200),
  texto text not null check (char_length(texto) between 1 and 600),
  href text not null check (char_length(href) between 1 and 300),
  recibido_en timestamptz not null default now(),
  vigente boolean not null default true,
  borrado_en timestamptz,
  primary key (cuenta_web_id, clave),
  check (tipo = split_part(clave, '-', 1))
);

create index if not exists avisos_tienda_lista_idx on retail.avisos_tienda (cuenta_web_id, recibido_en desc)
  where borrado_en is null;

alter table retail.avisos_tienda enable row level security;
revoke all on retail.avisos_tienda from public, anon, authenticated, tienda_web;

comment on table retail.avisos_tienda is
  'Tienda online (Felipe, 2026-10-19): el historial de notificaciones de cada cuenta, con la hora en que la cuenta las recibió. Interna: solo sus funciones tienda_avisos_*.';

-- ---------------------------------------------------------------------------
-- Anota los avisos que hoy están a favor. p_avisos: [{clave, tipo, titulo, texto, href, cuando?}]. Si p_completo, las tallas que ya no
-- están a favor pasan a no vigentes.
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
    -- Un aviso con forma rara no se guarda (los demás sí): la clave y el tipo tienen que cuadrar.
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
      -- Una talla que estaba no vigente y vuelve a llegar es un aviso nuevo: cuenta desde ahora y sale de la papelera.
      recibido_en = case when a.vigente then a.recibido_en else excluded.recibido_en end,
      borrado_en = case when a.vigente then a.borrado_en else null end,
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

-- ---------------------------------------------------------------------------
-- Las notificaciones no borradas, de la más reciente a la más antigua. `p_busqueda`: texto que buscar en el título y el texto (sin
-- distinguir mayúsculas). Devuelve también todas las claves no borradas, para el globo y el aviso en vivo.
create or replace function retail.tienda_avisos_listar(p_usuario_web_id uuid, p_busqueda text, p_pagina integer, p_tamano integer)
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

  select count(*) into v_total from retail.avisos_tienda a
   where a.cuenta_web_id = v_cuenta and a.borrado_en is null and lower(a.titulo || ' ' || a.texto) like v_busca;

  select coalesce(jsonb_agg(f.j order by f.recibido_en desc, f.clave desc), '[]'::jsonb) into v_items
    from (
      select a.recibido_en, a.clave,
             jsonb_build_object('clave', a.clave, 'tipo', a.tipo, 'titulo', a.titulo, 'texto', a.texto, 'href', a.href,
                                'recibido_en', a.recibido_en, 'vigente', a.vigente) as j
        from retail.avisos_tienda a
       where a.cuenta_web_id = v_cuenta and a.borrado_en is null and lower(a.titulo || ' ' || a.texto) like v_busca
       order by a.recibido_en desc, a.clave desc
       limit v_tamano offset (v_pagina - 1) * v_tamano
    ) f;

  select coalesce(jsonb_agg(a.clave), '[]'::jsonb) into v_claves
    from retail.avisos_tienda a where a.cuenta_web_id = v_cuenta and a.borrado_en is null;

  return jsonb_build_object('estado', 'ok', 'total', v_total, 'pagina', v_pagina, 'tamano', v_tamano,
                            'items', v_items, 'claves', v_claves);
end;
$$;

-- ---------------------------------------------------------------------------
-- Borra (marca) una, varias o todas las notificaciones de la cuenta. `p_todas` borra todas; si no, solo `p_claves`.
create or replace function retail.tienda_avisos_borrar(p_usuario_web_id uuid, p_claves text[], p_todas boolean)
returns jsonb
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_cuenta uuid;
  v_borradas integer;
begin
  if p_usuario_web_id is null or (not coalesce(p_todas, false) and (p_claves is null or cardinality(p_claves) = 0))
     or cardinality(coalesce(p_claves, '{}'::text[])) > 500 then
    return jsonb_build_object('estado', 'invalido');
  end if;
  select w.id into v_cuenta from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id for update;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;

  update retail.avisos_tienda set borrado_en = now()
   where cuenta_web_id = v_cuenta and borrado_en is null
     and (coalesce(p_todas, false) or clave = any (coalesce(p_claves, '{}'::text[])));
  get diagnostics v_borradas = row_count;
  return jsonb_build_object('estado', 'ok', 'borradas', v_borradas);
end;
$$;

revoke all on function retail.tienda_avisos_sincronizar(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function retail.tienda_avisos_listar(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function retail.tienda_avisos_borrar(uuid, text[], boolean) from public, anon, authenticated;
grant execute on function retail.tienda_avisos_sincronizar(uuid, jsonb, boolean) to tienda_web;
grant execute on function retail.tienda_avisos_listar(uuid, text, integer, integer) to tienda_web;
grant execute on function retail.tienda_avisos_borrar(uuid, text[], boolean) to tienda_web;
