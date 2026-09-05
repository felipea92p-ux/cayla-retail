-- Poder fijar el próximo correlativo al registrar una serie.
--
-- Por qué ahora: el 2026-09-05 se transmitió a producción la boleta
-- B004-000001 (Trujillo) en una prueba real con Lucode. Ese número YA existe
-- ante SUNAT. Con `registrar_serie_comprobante` como estaba —correlativo
-- siempre naciendo en 1— la base definitiva volvería a emitir B004-000001 y
-- SUNAT lo rechazaría por duplicado, quemando un número en cada intento. No
-- había forma de decirle al sistema "esta serie ya va por el 2".
--
-- Aclaración que también corrige la UI: en facturación electrónica la serie NO
-- la asigna SUNAT, la define el emisor (formato letra + 3 dígitos). Lo que sí
-- es obligatorio es que el correlativo sea único y ascendente DENTRO de la
-- serie. De ahí el candado: se puede saltar hacia adelante (continuar una
-- serie ya usada), nunca retroceder a un número ya emitido.
--
-- OJO (lección de ADR-0004, el susto de `recibir_lote`): un CREATE OR REPLACE
-- que AGREGA un parámetro no reemplaza nada — Postgres deja las dos firmas
-- vivas y toda llamada de 3 argumentos falla con "function is not unique".
-- Por eso la vieja se dropea explícitamente antes.
drop function if exists registrar_serie_comprobante(uuid, text, text);

create or replace function registrar_serie_comprobante(
  p_sede_id uuid,
  p_tipo text,
  p_serie text,
  p_siguiente_numero integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_serie text := upper(p_serie);
  v_max_emitido integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un Líder puede registrar series de comprobantes';
  end if;
  if p_tipo not in ('boleta', 'factura', 'nota_credito', 'nota_debito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo;
  end if;

  if p_siguiente_numero is not null then
    if p_siguiente_numero < 1 then
      raise exception 'El próximo número debe ser 1 o mayor';
    end if;

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
    -- Sin número explícito, el correlativo en curso no se toca.
    siguiente_numero = coalesce(p_siguiente_numero, series_comprobantes.siguiente_numero)
  returning id into v_id;

  return v_id;
end;
$$;
