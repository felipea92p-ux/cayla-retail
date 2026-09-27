-- ============================================================================
-- Nº de operación en los pagos digitales (ADR-0230, Ventas ▸ Historial conectado, 2026-09-26)
-- ============================================================================
--
-- EL PROBLEMA. La clienta vuelve a cambiar una prenda sin la boleta, pero con la captura de su Yape en el celular. Ese
-- número de operación no se guardaba en ninguna parte: `venta_pagos` solo tenía método, monto y lo recibido en efectivo.
-- Historial, Cambios y Devoluciones no podían encontrar la venta por él (Square busca por los últimos 4 de la tarjeta; en
-- Perú lo equivalente es el nº de operación de Yape o Plin).
--
-- QUÉ HACE.
--   1. `venta_pagos.referencia` (texto, opcional): el nº de operación, solo letras y dígitos, hasta 40, y SOLO en Yape,
--      Plin o transferencia (un candado lo hace imposible en efectivo, tarjeta o anticipo).
--   2. Un índice parcial para buscar por él (casi todas las filas lo tienen vacío).
--   3. `registrar_venta` guarda `referencia` si el Punto de Venta la manda. NO se reescribe la función: se reemplaza SOLO
--      su `insert into venta_pagos` sobre la definición VIVA (varias migraciones la parchean en vivo, ADR-0161; copiar un
--      cuerpo viejo borraría esos parches). Misma firma de 16 parámetros: no crea sobrecarga. Si el texto a reemplazar no
--      está tal cual, la migración se DETIENE con error en vez de aplicar a medias.
--
-- ORDEN DE DESPLIEGUE. La web puede salir ANTES que esta migración: `registrar_venta` lee cada pago clave por clave e ignora
-- `referencia` mientras no exista la columna, y Historial reintenta su lectura sin la columna (42703). Nada se cae.
--
-- CÓMO PEGARLA EN PRODUCCIÓN. Una sola parte, sin políticas (no toma las tablas de auth/storage, ADR-0195). El `alter` de
-- `venta_pagos` pide un candado corto sobre una tabla en uso: `lock_timeout` de 3 s; si choca con una venta en curso,
-- falla sin tocar nada y se vuelve a pegar. Es idempotente.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.venta_pagos add column if not exists referencia text;

comment on column retail.venta_pagos.referencia is
  'Nº de operación de Yape, Plin o transferencia que anotó el mostrador (opcional, ADR-0230). Solo letras y dígitos, hasta 40.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'venta_pagos_referencia_valida' and conrelid = 'retail.venta_pagos'::regclass) then
    alter table retail.venta_pagos
      add constraint venta_pagos_referencia_valida
      check (referencia is null or (referencia ~ '^[0-9A-Za-z]{1,40}$' and metodo in ('yape', 'plin', 'transferencia')));
  end if;
end $$;

create index if not exists venta_pagos_referencia_idx on retail.venta_pagos (referencia) where referencia is not null;

-- registrar_venta: solo el insert de pagos, sobre la definición viva.
do $$
declare
  v_fn regprocedure := 'retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_fn);
  v_nueva text;
  c_insert constant text := 'insert into venta_pagos (venta_id, metodo, monto, recibido)';
  c_valores constant text := $txt$then nullif(v_pago ->> 'recibido', '')::numeric end
      );$txt$;
begin
  -- Ya aplicada: nada que hacer.
  if position('recibido, referencia)' in v_def) > 0 then
    return;
  end if;
  if position(c_insert in v_def) = 0 or position(c_valores in v_def) = 0 then
    raise exception 'registrar_venta no tiene el insert de pagos esperado: revisar su definición viva antes de aplicar (ADR-0230)';
  end if;
  v_nueva := replace(v_def, c_insert, 'insert into venta_pagos (venta_id, metodo, monto, recibido, referencia)');
  v_nueva := replace(v_nueva, c_valores, $txt$then nullif(v_pago ->> 'recibido', '')::numeric end,
        case when v_pago ->> 'metodo' in ('yape', 'plin', 'transferencia')
             then nullif(left(regexp_replace(coalesce(v_pago ->> 'referencia', ''), '[^0-9A-Za-z]', '', 'g'), 40), '') end
      );$txt$);
  execute v_nueva;
end $$;

-- Verificación (a mano, después de pegar):
--   select count(*) from pg_proc where proname = 'registrar_venta';                    -- 1 (sin sobrecarga)
--   select position('recibido, referencia)' in pg_get_functiondef('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text)'::regprocedure)) > 0;  -- true
--   select column_name from information_schema.columns where table_schema = 'retail' and table_name = 'venta_pagos' and column_name = 'referencia';
