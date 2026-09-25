-- ============================================================================
-- 20260925103000 — Configuración ▸ Caja y avisos: el mínimo de caja y cuándo avisar (ADR-0195, spike `cfgCaja`)
--
-- EL PROBLEMA PRIMERO: el Resumen y el Flujo de caja (F6/F10) tienen que decir «esta semana bajas del piso que no quieres
-- perforar»; Gastos, «este gasto vino 25 % más alto que su promedio»; Por pagar y el Resumen, «vence en 7 días». Esos tres
-- números los decide Felipe (decisión «mínimo de caja configurable», PLAN-FINANZAS §10) y no pueden vivir escritos en el
-- código de cada pantalla.
--
-- LAS REGLAS
--   · Una sola fila (`id = true`), como `configuracion_empresa`. Valores de arranque del spike: mínimo S/ 15,000, aviso
--     de gasto +25 %, vencimientos con 7 días.
--   · La cambia solo el líder, firmando con el responsable y dejando el antes/después en `configuracion_historial`.
--   · La lee cualquiera que vea un módulo de Finanzas (las pantallas que avisan la necesitan); nadie lee la tabla directo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA EJECUCIÓN: tabla nueva y funciones; no toma candados de tablas en uso. Sin políticas.
-- SE ROMPE SI: la web se publica antes (Configuración ▸ Caja y avisos llama a funciones que no existirían).
-- ============================================================================
set lock_timeout = '3s';

create table if not exists retail.parametros_finanzas (
  id boolean primary key default true check (id),
  minimo_caja numeric(12,2) not null default 15000 check (minimo_caja >= 0),
  aviso_gasto_pct numeric(6,2) not null default 25 check (aviso_gasto_pct > 0 and aviso_gasto_pct <= 500),
  aviso_vence_dias integer not null default 7 check (aviso_vence_dias between 1 and 60),
  actualizado_por uuid,
  actualizado_en timestamptz not null default now()
);
comment on table retail.parametros_finanzas is
  'Configuración ▸ Caja y avisos (una sola fila): mínimo de caja que el Flujo y el Resumen vigilan, cuánto sobre su promedio es un gasto «fuera de lo normal» y con cuántos días se avisa un vencimiento.';
insert into retail.parametros_finanzas (id) values (true) on conflict (id) do nothing;
alter table retail.parametros_finanzas enable row level security;
revoke all on retail.parametros_finanzas from public, anon, authenticated;

create or replace function retail.fn_parametros_finanzas()
returns jsonb language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not (retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['gastos', 'cuentas_dinero', 'reportes_financieros'])) then
    raise exception 'Ver la configuración de Finanzas necesita un módulo de Finanzas en tu rol.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('minimo_caja', p.minimo_caja, 'aviso_gasto_pct', p.aviso_gasto_pct, 'aviso_vence_dias', p.aviso_vence_dias,
                                    'actualizado_en', p.actualizado_en)
            from retail.parametros_finanzas p where p.id);
end $$;

create or replace function retail.guardar_parametros_finanzas(p_minimo_caja numeric, p_aviso_gasto_pct numeric, p_aviso_vence_dias integer)
returns void language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actor uuid := retail.fn_actor_persona_id(true); v_antes jsonb;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder cambia el mínimo de caja y los avisos.' using errcode = 'P0001';
  end if;
  if p_minimo_caja is null or p_minimo_caja < 0 then
    raise exception 'El mínimo de caja no puede ser negativo.' using errcode = 'P0001';
  end if;
  if p_aviso_gasto_pct is null or p_aviso_gasto_pct <= 0 or p_aviso_gasto_pct > 500 then
    raise exception 'El aviso de gasto va de 1 %% a 500 %%.' using errcode = 'P0001';
  end if;
  if p_aviso_vence_dias is null or p_aviso_vence_dias not between 1 and 60 then
    raise exception 'Los días de aviso van de 1 a 60.' using errcode = 'P0001';
  end if;
  select to_jsonb(p) - 'id' - 'actualizado_por' - 'actualizado_en' into v_antes from retail.parametros_finanzas p where p.id for update;
  update retail.parametros_finanzas
     set minimo_caja = round(p_minimo_caja, 2), aviso_gasto_pct = round(p_aviso_gasto_pct, 2), aviso_vence_dias = p_aviso_vence_dias,
         actualizado_por = v_actor, actualizado_en = now()
   where id;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('parametros_finanzas', jsonb_build_object('antes', v_antes, 'despues',
          jsonb_build_object('minimo_caja', p_minimo_caja, 'aviso_gasto_pct', p_aviso_gasto_pct, 'aviso_vence_dias', p_aviso_vence_dias)), v_actor);
end $$;

revoke all on function retail.fn_parametros_finanzas() from public, anon;
revoke all on function retail.guardar_parametros_finanzas(numeric, numeric, integer) from public, anon;
grant execute on function retail.fn_parametros_finanzas() to authenticated;
grant execute on function retail.guardar_parametros_finanzas(numeric, numeric, integer) to authenticated;

reset lock_timeout;
