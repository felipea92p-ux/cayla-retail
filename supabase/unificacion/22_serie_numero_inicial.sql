-- ============================================================================
-- 22 — Fijar el próximo correlativo al registrar una serie (producción)
-- Equivale a supabase/migrations/0039_serie_numero_inicial.sql, con el prefijo
-- `retail.` que exige el SQL Editor del proyecto unificado (ver CLAUDE.md).
-- Pegar COMPLETO en el SQL Editor de producción.
--
-- Por qué: el 2026-09-05 se transmitió a producción la boleta B004-000001
-- (Trujillo) en la primera prueba real con Lucode — ese número ya existe ante
-- SUNAT. Sin esto, la serie B004 volvería a nacer en 1 y SUNAT rechazaría por
-- duplicado. Después de pegar esto hay que dejar la serie en su número real:
--
--   select retail.registrar_serie_comprobante('<sede_id_TRU>', 'boleta', 'B004', 2);
--
-- OJO: se dropea la firma vieja de 3 parámetros a propósito. Un
-- CREATE OR REPLACE que agrega un parámetro NO la reemplaza — deja las dos
-- vivas y cualquier llamada falla con "function is not unique" (ADR-0004).
-- ============================================================================

drop function if exists retail.registrar_serie_comprobante(uuid, text, text);

create or replace function retail.registrar_serie_comprobante(
  p_sede_id uuid,
  p_tipo text,
  p_serie text,
  p_siguiente_numero integer default null
)
returns uuid
language plpgsql security definer set search_path = retail, public
as $$
declare
  v_id uuid;
  v_serie text := upper(p_serie);
  v_max_emitido integer;
begin
  if not retail.es_lider() then
    raise exception 'Solo un Líder puede registrar series de comprobantes';
  end if;
  if p_tipo not in ('boleta', 'factura', 'nota_credito', 'nota_debito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo;
  end if;

  if p_siguiente_numero is not null then
    if p_siguiente_numero < 1 then
      raise exception 'El próximo número debe ser 1 o mayor';
    end if;

    -- Dentro de una misma serie nunca se retrocede a un número ya emitido:
    -- sería un duplicado garantizado ante SUNAT.
    select coalesce(max(numero), 0) into v_max_emitido
      from comprobantes
      where sede_id = p_sede_id and tipo = p_tipo and serie = v_serie;

    if p_siguiente_numero <= v_max_emitido then
      raise exception 'En la serie % ya se emitió el número %. El próximo debe ser mayor a %.',
        v_serie, v_max_emitido, v_max_emitido;
    end if;
  end if;

  insert into series_comprobantes (sede_id, tipo, serie, siguiente_numero)
    values (p_sede_id, p_tipo, v_serie, coalesce(p_siguiente_numero, 1))
  on conflict (sede_id, tipo) do update set
    serie = excluded.serie,
    siguiente_numero = coalesce(p_siguiente_numero, series_comprobantes.siguiente_numero)
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
-- Verificación después de pegar:
-- 1. select oid::regprocedure from pg_proc
--      where proname = 'registrar_serie_comprobante'
--        and pronamespace = 'retail'::regnamespace;
--    -- debe salir UNA sola fila, la de 4 parámetros.
-- ============================================================================
