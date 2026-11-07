-- ============================================================================
-- 20261029053000_planilla_cuenta_por_banco.sql — CAYLA V2 (ADR-0567, actividad 2)
--
-- EL PROBLEMA PRIMERO. La actividad 1 dice cuánto de la planilla salió hacia cada banco de quien cobra (BCP, Interbank), pero no de qué
-- cuenta de CAYLA: eso es una regla del negocio (Felipe, 2026-10-28: «la de BCP sale de BCP Empresa, la de Interbank de Interbank
-- Empresas») y no puede vivir escrita en el código: las cuentas tienen nombre libre, se archivan y se crean. Sin una regla guardada, cada
-- salida pediría elegir la cuenta a mano y un descuido bajaría el saldo del banco equivocado.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `planilla_cuentas`: una fila por banco de quien cobra ('bcp', 'interbank') con la cuenta de CAYLA de donde sale lo
--            suyo; la cuenta, si la hay, es SIEMPRE un banco (lo vigila un disparador, no solo la función). (2)
--            `guardar_cuenta_planilla(banco, cuenta)`: la guarda o la quita (cuenta nula = no se propone ninguna), firma con el responsable
--            del combo y deja el cambio en `configuracion_historial`; repetir lo mismo no escribe nada. (3) `fn_planilla_cuentas()`:
--            los dos bancos, cada uno con su cuenta si sigue activa.
--   ASUME:   `fn_exigir_lider_dinero` (el líder o quien tiene «Configuración», como «A qué cuenta entra cada cobro»).
--   FALLA:   `42501` sin permiso; `P0001` con un banco que no es BCP ni Interbank, o una cuenta que no es un banco activo.
--   NO HACE: no registra salidas (actividad 3), no mueve nada pasado, no toca Dynamic. Quien no tiene banco en Dynamic no tiene regla:
--            al registrar su salida se elige la cuenta.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, DESPUÉS DE 20261029052000. Una tabla nueva (RLS encendido y sin políticas: solo la
-- leen y escriben funciones security definer), su disparador (`create or replace trigger`, nunca `drop trigger`: ADR-0195) y tres
-- funciones. Las llaves foráneas toman un candado corto sobre `cuentas_dinero` y `public.personas`; sin políticas. Idempotente.
-- Verificado: `scripts/pruebas/planilla_salidas.mjs` (escenas 6 y 7).
-- SE ROMPE SI: alguien archiva la cuenta elegida: deja de proponerse (la lectura solo trae cuentas activas) y el aviso pide elegirla.
-- DOWN: drop function retail.fn_planilla_cuentas(); drop function retail.guardar_cuenta_planilla(text, uuid);
--       drop table retail.planilla_cuentas; drop function retail.fn_planilla_cuentas_validar();
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. De qué cuenta sale lo de quienes cobran en cada banco ----------
create table if not exists retail.planilla_cuentas (
  banco text primary key check (banco in ('bcp', 'interbank')),
  cuenta_id uuid references retail.cuentas_dinero (id),
  guardada_por uuid references public.personas (id),
  guardada_en timestamptz not null default now()
);
comment on table retail.planilla_cuentas is
  'ADR-0567: de qué cuenta de CAYLA sale la planilla de quienes cobran en cada banco (Dynamic, datos_personales.entidad_bancaria). Cuenta nula = no se propone ninguna.';
alter table retail.planilla_cuentas enable row level security;
revoke all on retail.planilla_cuentas from public, anon, authenticated;

-- La cuenta es un banco: lo cumple toda escritura, no solo la de la pantalla.
create or replace function retail.fn_planilla_cuentas_validar() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if new.cuenta_id is not null and not exists (select 1 from retail.cuentas_dinero c where c.id = new.cuenta_id and c.tipo = 'banco') then
    raise exception 'La planilla sale de un banco: elige una cuenta de banco.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function retail.fn_planilla_cuentas_validar() from public, anon, authenticated;
create or replace trigger planilla_cuentas_validar before insert or update on retail.planilla_cuentas
  for each row execute function retail.fn_planilla_cuentas_validar();

-- ---------- 2. Guardarla ----------
create or replace function retail.guardar_cuenta_planilla(p_banco text, p_cuenta_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_hay boolean;
  v_antes uuid;
  v_actor uuid;
begin
  perform retail.fn_exigir_lider_dinero('Decir de qué cuenta sale la planilla');
  if p_banco is null or p_banco not in ('bcp', 'interbank') then
    raise exception 'El banco tiene que ser BCP o Interbank.' using errcode = 'P0001';
  end if;
  if p_cuenta_id is not null and not exists (
    select 1 from retail.cuentas_dinero c where c.id = p_cuenta_id and c.tipo = 'banco' and c.archivada_en is null
  ) then
    raise exception 'La planilla sale de un banco: elige una cuenta de banco activa.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('planilla_cuenta:' || p_banco, 0));
  v_hay := exists (select 1 from retail.planilla_cuentas p where p.banco = p_banco);
  v_antes := (select p.cuenta_id from retail.planilla_cuentas p where p.banco = p_banco);
  if v_hay and v_antes is not distinct from p_cuenta_id then
    return;
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  insert into retail.planilla_cuentas (banco, cuenta_id, guardada_por, guardada_en)
  values (p_banco, p_cuenta_id, v_actor, now())
  on conflict (banco) do update set cuenta_id = excluded.cuenta_id, guardada_por = excluded.guardada_por, guardada_en = excluded.guardada_en;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('planilla_cuenta', jsonb_build_object('banco', p_banco, 'cuenta_id', p_cuenta_id, 'antes', v_antes), v_actor);
end $$;
comment on function retail.guardar_cuenta_planilla(text, uuid) is
  'ADR-0567: guarda de qué cuenta de banco sale la planilla de quienes cobran en BCP o Interbank (nula = ninguna). Líder o Configuración; firma con el responsable.';
revoke all on function retail.guardar_cuenta_planilla(text, uuid) from public, anon;
grant execute on function retail.guardar_cuenta_planilla(text, uuid) to authenticated;

-- ---------- 3. Leerla ----------
create or replace function retail.fn_planilla_cuentas()
returns table (banco text, cuenta_id uuid, cuenta_nombre text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  if not (coalesce(retail.fn_es_lider(), false) or coalesce(retail.fn_puede_configurar(), false)) then
    return;
  end if;
  return query
  select b.banco, c.id, c.nombre
    from (values ('bcp', 1), ('interbank', 2)) as b (banco, orden)
    left join retail.planilla_cuentas p on p.banco = b.banco
    left join retail.cuentas_dinero c on c.id = p.cuenta_id and c.archivada_en is null
   order by b.orden;
end $$;
comment on function retail.fn_planilla_cuentas() is
  'ADR-0567: los dos bancos de quien cobra (BCP, Interbank) con la cuenta activa de donde sale su planilla, o nula. Líder o Configuración; si no, vacío.';
revoke all on function retail.fn_planilla_cuentas() from public, anon;
grant execute on function retail.fn_planilla_cuentas() to authenticated;
