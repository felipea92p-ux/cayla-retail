-- ============================================================================
-- 20260922234100_series_archivar.sql — CAYLA V2
--
-- D-60 paso 4 (`docs/superpowers/specs/2026-09-22-comprobantes-series-y-envio-automatico-design.md`):
-- archivar una serie en vez de reemplazarla.
--
-- EL PROBLEMA. `registrar_serie_comprobante` hacía `on conflict (ubicacion_id, tipo) do update set
-- serie = ...` conservando `siguiente_numero`: «cambiar» B004 por B010 dejaba la B010 arrancando en el
-- 24, y la B004 desaparecía sin rastro. Y el día de salir a producción hay que dejar las series usadas
-- en pruebas y empezar series nuevas en 1 (las pruebas en sandbox consumen la misma numeración).
--
-- QUÉ CAMBIA
--   · `series_comprobantes.archivada_at` / `archivada_por` / `motivo_archivo`: una serie archivada ya no
--     reserva números, pero queda con su historial (nunca un DELETE: sus comprobantes la nombran).
--   · El candado «una serie por tienda y tipo» pasa a ser «una serie ACTIVA por tienda y tipo» (índice
--     único parcial). Así se puede archivar la B004 y registrar la B010 en la misma tienda.
--   · `registrar_serie_comprobante` ya no reemplaza nada: si la tienda tiene una activa de ese tipo,
--     lo dice y pide archivarla primero. Y un nombre de serie no se reusa nunca para el mismo tipo
--     (ni en otra tienda ni después de archivarlo): sus números chocarían con comprobantes que ya existen
--     (`unique (tipo, serie, numero)`). Va en la RPC y no como índice porque bases viejas de desarrollo
--     tienen la misma serie en dos tiendas; producción no (B004/F004/B005/F005, verificado 2026-09-22).
--   · `archivar_serie_comprobante(uuid, text)`: nueva, solo líder, con motivo.
--   · `fn_reservar_numero_serie`: toma solo la serie activa y actualiza por `id`. MISMA firma: la llaman
--     `emitir_comprobante`, `emitir_nota` y `aprobar_devolucion`, que no se tocan.
--
-- ORDEN (importa). Va DESPUÉS de `20260922224300_nota_de_venta.sql` a propósito: esa migración siembra
-- las series NV con `on conflict (ubicacion_id, tipo) do nothing`, que necesita el índice único COMPLETO
-- que esta reemplaza por uno parcial. Si esta corriera antes, una base armada desde cero fallaría ahí.
--
-- LO QUE ESTO NO RESUELVE (a propósito). SUNAT pide que una nota de crédito lleve la letra del documento
-- que corrige (B… para boletas, F… para facturas). Con una sola NC activa por tienda, una tienda que corrija
-- boletas y facturas necesitaría dos. Eso exige que `emitir_nota` y `aprobar_devolucion` le digan a la
-- reserva qué letra quieren — cambiar su firma, y otras ramas las están tocando hoy. Queda en BACKLOG.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.series_comprobantes
  add column if not exists archivada_at timestamptz,
  add column if not exists archivada_por uuid references public.personas(id),
  add column if not exists motivo_archivo text;

alter table retail.series_comprobantes drop constraint if exists series_comprobantes_archivada_tiene_motivo;
alter table retail.series_comprobantes add constraint series_comprobantes_archivada_tiene_motivo
  check (archivada_at is null or nullif(btrim(motivo_archivo), '') is not null);

comment on column retail.series_comprobantes.archivada_at is
  'D-60 paso 4: cuándo se archivó. Archivada = ya no reserva números; queda por su historial. null = activa.';

-- «una por tienda y tipo» → «una ACTIVA por tienda y tipo»
alter table retail.series_comprobantes drop constraint if exists series_comprobantes_ubicacion_id_tipo_key;
drop index if exists retail.series_comprobantes_ubicacion_id_tipo_key;
create unique index if not exists series_comprobantes_activa_por_tienda_y_tipo
  on retail.series_comprobantes (ubicacion_id, tipo)
  where archivada_at is null;

-- ---------- la reserva: solo la activa ----------
create or replace function retail.fn_reservar_numero_serie(p_ubicacion_id uuid, p_tipo text)
returns table (serie text, numero integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_serie text; v_numero integer;
begin
  select sc.id, sc.serie, sc.siguiente_numero into v_id, v_serie, v_numero
    from series_comprobantes sc
   where sc.ubicacion_id = p_ubicacion_id and sc.tipo = p_tipo and sc.archivada_at is null
     for update;
  if not found then
    raise exception 'No hay una serie registrada para % en esta ubicación', p_tipo;
  end if;
  update series_comprobantes set siguiente_numero = v_numero + 1 where id = v_id;
  return query select v_serie, v_numero;
end;
$$;

-- ---------- registrar: ya no reemplaza ----------
create or replace function retail.registrar_serie_comprobante(
  p_ubicacion_id uuid, p_tipo text, p_serie text, p_siguiente_numero integer default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_activa text; v_serie text := upper(btrim(p_serie));
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede registrar una serie de comprobantes';
  end if;
  if p_siguiente_numero is not null and p_siguiente_numero < 1 then
    raise exception 'El próximo número empieza en 1 o más';
  end if;

  select serie into v_activa from series_comprobantes
   where ubicacion_id = p_ubicacion_id and tipo = p_tipo and archivada_at is null;
  if found then
    raise exception 'Esta tienda ya tiene la serie % activa para ese tipo: archívala primero para registrar otra', v_activa;
  end if;

  if exists (select 1 from series_comprobantes where tipo = p_tipo and serie = v_serie) then
    raise exception 'La serie % ya se usó para ese tipo de comprobante: una serie no se vuelve a usar, elige otra', v_serie;
  end if;

  insert into series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
    values (p_ubicacion_id, p_tipo, v_serie, coalesce(p_siguiente_numero, 1))
    returning id into v_id;
  return v_id;
end;
$$;

-- ---------- archivar ----------
create or replace function retail.archivar_serie_comprobante(p_serie_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_persona uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede archivar una serie de comprobantes';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Archivar una serie necesita un motivo';
  end if;
  select id into v_persona from public.personas where auth_user_id = auth.uid();

  update series_comprobantes
     set archivada_at = now(), archivada_por = v_persona, motivo_archivo = btrim(p_motivo)
   where id = p_serie_id and archivada_at is null;
  if not found then
    raise exception 'Esa serie no existe o ya está archivada';
  end if;
end;
$$;

revoke all on function retail.archivar_serie_comprobante(uuid, text) from public;
grant execute on function retail.archivar_serie_comprobante(uuid, text) to authenticated;
