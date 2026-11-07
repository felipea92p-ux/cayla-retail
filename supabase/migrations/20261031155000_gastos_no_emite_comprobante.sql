-- ============================================================================
-- 20261031155000_gastos_no_emite_comprobante.sql — CAYLA V2 · ADR-0588 (Gastos: «No emite comprobante»)
-- Un gasto grande sin comprobante que nunca lo tendrá se marca con su motivo y deja de pedir algo (Felipe, 2026-10-31, punto 2 de la comparación con
-- las apps de gastos de hoy —Spendesk: «no puedo dar el comprobante»—, y su decisión: «sale de la cuenta»).
--
-- EL PROBLEMA PRIMERO. Desde S/ 300 un gasto sin comprobante se marca en ámbar y suma en «Te toca» y en el chip («con factura recuperarías S/ X de
-- IGV»). Pero el gasfitero que no emite nada, o el recibo que se perdió, no se van a resolver: la marca se queda para siempre y, de tanto verla, la
-- gente aprende a ignorar «Te toca» entera.
--
-- QUÉ HACE
--   1. `gastos_no_emiten`: una fila por gasto, con su motivo (no emite / se perdió / otro, con su nota), quién y cuándo. No se cambia ni se borra: si
--      después llega el papel, «Llegó el comprobante» lo agrega igual y la marca ya no aplica (el gasto deja de ser «sin comprobante»).
--   2. `marcar_gasto_no_emite(gasto, motivo, nota)`: solo un gasto vigente sin comprobante; el mismo motivo dos veces devuelve lo que ya quedó. Deja su
--      línea en el rastro (`gasto_correcciones`: «Comprobante: Sin comprobante → No emite: …»). No cambia ninguna cifra, así que se puede también en un
--      mes cerrado.
--   3. `fn_gastos_no_emiten(desde, hasta, sede, solo_empresa)`: los marcados de la lista, con la MISMA visibilidad que `fn_gastos_lista` (la pantalla
--      los junta). Con eso el gasto sale de la marca, de «Te toca», del chip y del IGV «que recuperarías»; sigue saliendo en el filtro «Sin
--      comprobante» (lo es) y en su hoja, en gris, con el motivo.
--
-- DESCARTÉ
--   · Una columna en `gastos`: `alter table` de una tabla en uso (ADR-0195) y tocar `fn_gastos_lista`, que se lee en tres pantallas.
--   · Un motivo libre sin lista: tres motivos cubren lo que pasa en tienda; «otro» pide la nota.
--   · Marcarlo también con comprobante o en un gasto del viaje (su papel es la planilla): no hay nada que resolver.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, DESPUÉS de 20261031151000 y 20261031154000). UNA sola parte: una tabla nueva (vacía) con RLS y sin
-- políticas (solo la leen funciones security definer), funciones nuevas; sin `alter` de tablas en uso, sin políticas ni `drop trigger` (ADR-0195).
-- Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. Los gastos que no tendrán comprobante ----------
create table if not exists retail.gastos_no_emiten (
  gasto_id uuid primary key references retail.gastos (id),
  motivo text not null check (motivo in ('no_emite', 'se_perdio', 'otro')),
  nota text check (nota is null or (btrim(nota) <> '' and char_length(nota) <= 200)),
  marcado_por uuid not null references public.personas (id),
  marcado_en timestamptz not null default now(),
  constraint gastos_no_emiten_otro_con_nota check (motivo <> 'otro' or nota is not null)
);
comment on table retail.gastos_no_emiten is
  'ADR-0588: un gasto sin comprobante que no lo tendrá (no emite, se perdió u otro, con su nota). Sale de lo que pide algo; no se cambia ni se borra.';

alter table retail.gastos_no_emiten enable row level security;
revoke all on retail.gastos_no_emiten from anon, authenticated;

create or replace function retail.fn_gastos_no_emiten_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Lo que se marcó «sin comprobante» no se cambia ni se borra: si llega el papel, se agrega al gasto.' using errcode = 'P0001';
end $$;
revoke all on function retail.fn_gastos_no_emiten_inmutable() from public, anon, authenticated;
create or replace trigger gastos_no_emiten_inmutable
  before update or delete on retail.gastos_no_emiten
  for each row execute function retail.fn_gastos_no_emiten_inmutable();

-- ---------- 2. Marcarlo ----------
create or replace function retail.marcar_gasto_no_emite(p_gasto_id uuid, p_motivo text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_g retail.gastos%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_ya retail.gastos_no_emiten%rowtype;
  v_actor uuid;
begin
  if p_motivo is null or p_motivo not in ('no_emite', 'se_perdio', 'otro') then
    raise exception 'Elige por qué no tiene comprobante.' using errcode = 'P0001';
  end if;
  if p_motivo = 'otro' and v_nota is null then
    raise exception 'Cuenta en una línea por qué no tiene comprobante.' using errcode = 'P0001';
  end if;
  if char_length(v_nota) > 200 then
    raise exception 'El motivo cabe en 200 letras.' using errcode = 'P0001';
  end if;
  select * into v_g from retail.gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'Ese gasto no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(v_g.ubicacion_id) then
    raise exception 'No puedes cambiar gastos de esa tienda.' using errcode = '42501';
  end if;
  -- Dos toques: el segundo ve la marca del primero. Con el mismo motivo, devuelve lo que ya quedó.
  for v_ya in select * from retail.gastos_no_emiten n where n.gasto_id = p_gasto_id loop
    if v_ya.motivo = p_motivo and v_ya.nota is not distinct from v_nota then
      return jsonb_build_object('ya_estaba', true);
    end if;
    raise exception 'Ese gasto ya está marcado sin comprobante.' using errcode = 'P0001';
  end loop;
  if v_g.estado = 'anulado' then
    raise exception 'Ese gasto está anulado.' using errcode = 'P0001';
  end if;
  if v_g.compra_id is not null then
    raise exception 'Ese gasto ya tiene su comprobante.' using errcode = 'P0001';
  end if;
  if v_g.categoria in ('traer_mercaderia', 'viaje_compra') then
    raise exception 'Es un gasto del viaje de compra: su papel va en Compras.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Sin sesión no se cambia un gasto.' using errcode = '42501';
  end if;
  insert into retail.gastos_no_emiten (gasto_id, motivo, nota, marcado_por) values (p_gasto_id, p_motivo, v_nota, v_actor);
  insert into retail.gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
  values (gen_random_uuid(), p_gasto_id, 'comprobante', 'Sin comprobante',
          'No emite: ' || case p_motivo when 'no_emite' then 'el proveedor no emite comprobante' when 'se_perdio' then 'se perdió el comprobante' else v_nota end,
          v_actor);
  return jsonb_build_object('ya_estaba', false);
end $$;
comment on function retail.marcar_gasto_no_emite(uuid, text, text) is
  'ADR-0588: marca un gasto sin comprobante que no lo tendrá (no emite, se perdió u otro con nota): deja de pedir algo. Con rastro.';
revoke all on function retail.marcar_gasto_no_emite(uuid, text, text) from public, anon;
grant execute on function retail.marcar_gasto_no_emite(uuid, text, text) to authenticated;

-- ---------- 3. Los marcados de la lista ----------
-- La MISMA visibilidad que `fn_gastos_lista` (quien no ve gastos, no ve nada; el líder ve los «de la empresa»). Solo los que siguen sin comprobante.
create or replace function retail.fn_gastos_no_emiten(p_desde date, p_hasta date, p_ubicacion_id uuid default null, p_solo_empresa boolean default false)
returns table (gasto_id uuid, motivo text, nota text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_lider boolean := retail.fn_ve_finanzas_de_todo();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    return;
  end if;
  return query
  select n.gasto_id, n.motivo, n.nota
    from retail.gastos_no_emiten n
    join retail.gastos g on g.id = n.gasto_id
   where g.fecha between p_desde and p_hasta
     and g.compra_id is null
     and ((g.ubicacion_id is null and v_lider) or g.ubicacion_id = any (v_ubics))
     and (p_ubicacion_id is null or g.ubicacion_id = p_ubicacion_id)
     and (not coalesce(p_solo_empresa, false) or g.ubicacion_id is null);
end $$;
revoke all on function retail.fn_gastos_no_emiten(date, date, uuid, boolean) from public, anon;
grant execute on function retail.fn_gastos_no_emiten(date, date, uuid, boolean) to authenticated;
