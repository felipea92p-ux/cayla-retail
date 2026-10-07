-- ============================================================================
-- Guías interactivas: «ya se la ofrecí» (ADR-0362, Felipe 2026-10-07)
--
-- QUÉ. Cada pantalla del ERP tiene una guía (una demo con el velo oscuro que recorre sus piezas). Se le OFRECE a cada persona
-- una sola vez por pantalla, la primera vez que entra (Felipe: «una vez por persona y pantalla»); después se repite a pedido
-- desde «Demo» en Mi perfil. Esta tabla recuerda a quién ya se le ofreció cada guía y si la terminó.
--
-- QUIÉN ES «LA PERSONA». En una sesión de persona, ella misma (`fn_actor_persona_id(false)`). En una TERMINAL (un aparato de
-- tienda sin persona), la responsable que la pantalla mande en `x-responsable` si está de turno; si no manda ninguna, la propia
-- cuenta de la terminal (`auth.uid()`): la oferta se recuerda por aparato. No es una operación del negocio (no mueve dinero ni
-- stock ni firma nada), por eso no exige responsable: si no se sabe quién, se recuerda por la cuenta y la demo no se cae.
--
-- POR QUÉ EN LA BASE Y NO EN EL NAVEGADOR. En la tienda varias personas usan el mismo Mac: recordado en el navegador, la
-- segunda nunca vería la oferta. Si esta migración no está (o la base no responde), la web recuerda en el navegador y sigue.
--
-- CÓMO SE PEGA. Una sola parte: crea una tabla nueva (RLS encendido SIN políticas: solo la tocan estas funciones
-- `security definer`) y tres funciones; no hace `alter` de tablas en uso ni crea políticas (ADR-0195). Re-ejecutable.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta retail.fn_actor_persona_id: pega antes 20260929230000_acciones_sin_responsable.sql.';
  end if;
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null then
    raise exception 'Falta retail.fn_tiene_acceso_retail().';
  end if;
end $$;

create table if not exists retail.guias_vistas (
  -- La persona (public.personas.id) o, en una terminal sin responsable, la cuenta (auth.users.id). Sin FK a propósito: puede
  -- ser cualquiera de las dos, y esta fila es un recordatorio de interfaz, no un dato del negocio.
  quien uuid not null,
  -- La clave de la guía (`lib/guias/`: la ruta con puntos, «vender», «vender.apartados»).
  guia text not null check (guia ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  ofrecida_en timestamptz not null default now(),
  -- Cuándo la recorrió hasta el final (NULL: la saltó o salió a medias). Para saber qué guías se usan, no para volver a ofrecerla.
  completada_en timestamptz,
  primary key (quien, guia)
);
comment on table retail.guias_vistas is
  'ADR-0362: a quién ya se le ofreció cada guía interactiva (una vez por persona y pantalla). Solo la tocan fn_guias_vistas y marcar_guia_vista.';

alter table retail.guias_vistas enable row level security;
revoke all on table retail.guias_vistas from anon, authenticated;

-- Quién mira: la persona de la sesión o la responsable de la terminal; si no se sabe, la cuenta. Nunca lanza.
create or replace function retail.fn_guia_quien()
returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v uuid;
begin
  begin
    v := retail.fn_actor_persona_id(false);
  exception when others then
    v := null; -- una terminal sin responsable: se recuerda por la cuenta
  end;
  return coalesce(v, auth.uid());
end;
$$;

revoke all on function retail.fn_guia_quien() from public, anon;
grant execute on function retail.fn_guia_quien() to authenticated, service_role;

-- Las guías que ya se le ofrecieron a quien mira. Solo lectura.
create or replace function retail.fn_guias_vistas()
returns setof text
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien uuid;
begin
  if auth.uid() is null or not retail.fn_tiene_acceso_retail() then
    return;
  end if;
  v_quien := retail.fn_guia_quien();
  return query select g.guia from retail.guias_vistas g where g.quien = v_quien;
end;
$$;

comment on function retail.fn_guias_vistas() is
  'ADR-0362: las claves de las guías interactivas que ya se le ofrecieron a quien mira (persona, responsable de la terminal o la cuenta).';
revoke all on function retail.fn_guias_vistas() from public, anon;
grant execute on function retail.fn_guias_vistas() to authenticated, service_role;

-- Anota que se le ofreció (y, si la terminó, cuándo). Re-ejecutable: ofrecer dos veces no duplica; terminarla no se borra.
create or replace function retail.marcar_guia_vista(p_guia text, p_completa boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien uuid;
begin
  if auth.uid() is null or not retail.fn_tiene_acceso_retail() then
    raise exception 'Sin acceso a retail' using errcode = '42501';
  end if;
  if p_guia is null or p_guia !~ '^[a-z0-9][a-z0-9._-]{0,79}$' then
    raise exception 'Guía no válida' using errcode = '22023';
  end if;
  v_quien := retail.fn_guia_quien();
  insert into retail.guias_vistas as g (quien, guia, completada_en)
  values (v_quien, p_guia, case when p_completa then now() end)
  on conflict (quien, guia) do update
    set completada_en = coalesce(g.completada_en, excluded.completada_en);
end;
$$;

comment on function retail.marcar_guia_vista(text, boolean) is
  'ADR-0362: anota que a quien mira ya se le ofreció la guía p_guia (y, con p_completa, que la terminó). No es una operación del negocio: no pide responsable.';
revoke all on function retail.marcar_guia_vista(text, boolean) from public, anon;
grant execute on function retail.marcar_guia_vista(text, boolean) to authenticated, service_role;

reset lock_timeout;
