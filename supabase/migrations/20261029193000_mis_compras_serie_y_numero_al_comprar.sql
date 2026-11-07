-- ============================================================================
-- Mis compras · la compradora escribe la serie y el número del papel al registrar la compra (ADR-0574, actividad 3 de 7).
--
-- EL PROBLEMA PRIMERO. Hoy la compradora fotografía el papel y anota el monto; la serie y el número los copia DESPUÉS una persona de Compras
-- (`completar_papel_compra`), mirando la foto, para que el papel nazca como comprobante en el libro de compras. Eso obliga a Compras a «completar»
-- cada compra a mano. Felipe, 2026-10-29: la serie y el número «también deben estar en el formulario del que compra» (el proveedor ya lo elige él).
-- Con los dos datos escritos al comprar, la actividad siguiente puede pasar el papel solo a los libros.
--
-- QUÉ HACE.
--   1. `compra_papeles.serie` y `compra_papeles.numero` (nulos: lo de antes no los tiene). Lo que escribió no cambia, como el resto del papel.
--   2. `registrar_compra_rapida` recibe dos parámetros más, `p_serie` y `p_numero` (de fábrica null: una pantalla de antes sigue guardando, sin
--      ellos, y Compras los copia como hasta hoy). Las mismas reglas de `completar_papel_compra`: factura y boleta, serie de letras y números hasta
--      8 (F001) y número de solo dígitos hasta 12; nota de venta, solo el número, opcional (letras, números o guiones, hasta 20), con serie «NV»;
--      sin papel, ninguno. Si dice uno de los dos, tiene que decir los dos. El mismo comprobante del mismo proveedor no se registra dos veces
--      (`papel_repetido`): ni contra los comprobantes ya en el libro ni contra otra compra anotada.
--   3. La función de ocho parámetros se retira: dos con el mismo nombre y parámetros opcionales dejan la llamada ambigua.
--
-- Solo una columna por tabla y funciones: sin políticas ni disparadores nuevos (ADR-0195). Idempotente.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Las dos columnas ----------
alter table retail.compra_papeles add column if not exists serie text;
alter table retail.compra_papeles add column if not exists numero text;
comment on column retail.compra_papeles.serie is 'ADR-0574: la serie del papel (F001, B002…) como la escribió la compradora al comprar. Nula en lo anotado antes: Compras la copia al completar.';
comment on column retail.compra_papeles.numero is 'ADR-0574: el número del papel como lo escribió la compradora al comprar. Nulo en lo anotado antes: Compras lo copia al completar.';

-- El papel nace con lo que dice la función que lo registra (como el pago): `retail.compra_serie_numero`.
select pg_temp.reemplazar('retail.fn_compra_papel_pago_por_defecto()',
$v$  return new;$v$,
$v$  -- La serie y el número que escribió la compradora al comprar (ADR-0574).
  if new.serie is null and new.numero is null then
    new.serie := nullif(current_setting('retail.compra_serie_numero', true), '')::jsonb ->> 'serie';
    new.numero := nullif(current_setting('retail.compra_serie_numero', true), '')::jsonb ->> 'numero';
  end if;
  return new;$v$, 1);

-- Lo que escribió no cambia (si ya lo tenía).
select pg_temp.reemplazar('retail.fn_compra_papeles_inmutable()',
$v$  -- El monto, lo pagado y su método solo cambian cuando la compradora corrige su compra (`corregir_compra_rapida`).$v$,
$v$  if (old.serie is not null and new.serie is distinct from old.serie) or (old.numero is not null and new.numero is distinct from old.numero) then
    raise exception 'Lo que anotó la compradora no cambia: Compras lo corrige al completar el papel.' using errcode = 'P0001';
  end if;
  -- El monto, lo pagado y su método solo cambian cuando la compradora corrige su compra (`corregir_compra_rapida`).$v$, 1);

-- ---------- 2. Registrar la compra con su serie y su número ----------
create or replace function retail.registrar_compra_rapida(
  p_id uuid,
  p_proveedor_id uuid,
  p_tipo text,
  p_monto numeric,
  p_foto_ruta text,
  p_lineas jsonb,
  p_pagado numeric default null,
  p_medio text default null,
  p_serie text default null,
  p_numero text default null
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_pagado numeric := round(p_pagado, 2);
  v_medio text := nullif(lower(btrim(coalesce(p_medio, ''))), '');
  v_monto numeric := round(p_monto, 2);
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_serie text := nullif(upper(btrim(coalesce(p_serie, ''))), '');
  v_numero text := nullif(btrim(coalesce(p_numero, '')), '');
  v_sn jsonb := null;
  v_r jsonb;
begin
  -- Auditoría 2026-10-27 (H11): el mismo candado que abrir y cerrar la ronda; si se está cerrando, esta compra espera y la base le dice «Abre tu ronda».
  if retail.fn_ve_modulo('ordenes_compra') is true then
    perform retail.fn_ronda_compras_candado(retail.fn_actor_persona_id(true));
  end if;

  -- La serie y el número del papel: los mismos que pide `completar_papel_compra`. Sin ninguno (una pantalla de antes), Compras los copia después.
  if v_serie is not null or v_numero is not null then
    if v_tipo in ('factura', 'boleta') then
      if v_serie is null or v_serie !~ '^[A-Z0-9]{1,8}$' then
        raise exception 'Copia la serie como está en el papel (F001, B002…): letras y números, hasta 8.' using errcode = 'P0001', hint = 'papel_serie';
      end if;
      if v_numero is null or v_numero !~ '^[0-9]{1,12}$' then
        raise exception 'Copia el número como está en el papel: solo números, hasta 12.' using errcode = 'P0001', hint = 'papel_numero';
      end if;
      v_sn := jsonb_build_object('serie', v_serie, 'numero', v_numero);
    elsif v_tipo = 'nota_venta' then
      -- Una nota de venta no tiene serie: lleva «NV» al pasar a los libros; el número es opcional.
      if v_numero is not null and v_numero !~ '^[0-9A-Za-z-]{1,20}$' then
        raise exception 'El número de la nota de venta: letras, números o guiones, hasta 20.' using errcode = 'P0001', hint = 'papel_numero';
      end if;
      v_sn := case when v_numero is null then null else jsonb_build_object('serie', null, 'numero', v_numero) end;
    end if;
    -- Sin papel, no hay serie ni número: lo que venga se ignora.
  end if;
  -- El mismo comprobante del mismo proveedor no se registra dos veces: ni en el libro ni en otra compra anotada (la que se reintenta no cuenta).
  if v_sn is not null and (v_sn ->> 'numero') is not null then
    if exists (select 1 from retail.compras c
                where c.proveedor_id = p_proveedor_id and c.numero = v_sn ->> 'numero' and c.estado = 'vigente'
                  and c.serie = case when v_tipo = 'nota_venta' then 'NV' else v_sn ->> 'serie' end)
       or exists (select 1 from retail.compra_papeles x
                   where x.proveedor_id = p_proveedor_id and x.id <> p_id and x.estado <> 'anulado' and x.tipo = v_tipo
                     and x.numero = v_sn ->> 'numero' and x.serie is not distinct from (v_sn ->> 'serie')) then
      raise exception 'Ese comprobante ya está registrado para este proveedor: revisa la serie y el número.' using errcode = 'P0001', hint = 'papel_repetido';
    end if;
  end if;

  -- Sin el pago (una pantalla de antes): como siempre, todo pagado en efectivo (lo pone el disparador).
  if p_pagado is null and p_medio is null then
    perform set_config('retail.compra_serie_numero', coalesce(v_sn::text, ''), true);
    v_r := retail.fn_registrar_compra_rapida_base(p_id, p_proveedor_id, p_tipo, p_monto, p_foto_ruta, p_lineas);
    perform set_config('retail.compra_serie_numero', '', true);
    return v_r;
  end if;
  if v_pagado is null or v_pagado = 'NaN'::numeric or v_pagado < 0 or (v_monto is not null and v_pagado > v_monto) then
    raise exception 'Lo que pagas ahora va de S/ 0 a lo que dice el papel' using errcode = 'P0001', hint = 'compra_rapida_pagado';
  end if;
  if v_pagado <> p_pagado then
    raise exception 'Lo que pagas ahora admite como máximo 2 decimales' using errcode = 'P0001', hint = 'compra_rapida_pagado';
  end if;
  if v_pagado = 0 then
    v_medio := null;
  elsif v_medio is null or v_medio not in ('yape', 'efectivo', 'transferencia') then
    raise exception 'Elige cómo pagaste: Yape, efectivo o transferencia' using errcode = 'P0001', hint = 'compra_rapida_medio';
  end if;

  perform set_config('retail.compra_pago', jsonb_build_object('pagado', v_pagado, 'medio', v_medio)::text, true);
  perform set_config('retail.compra_serie_numero', coalesce(v_sn::text, ''), true);
  v_r := retail.fn_registrar_compra_rapida_base(p_id, p_proveedor_id, p_tipo, p_monto, p_foto_ruta, p_lineas);
  perform set_config('retail.compra_pago', '', true);
  perform set_config('retail.compra_serie_numero', '', true);

  -- Un reintento con el mismo identificador devuelve lo que ya quedó: si quedó con otro pago o con otra serie, lo dice (como con otros datos).
  if exists (select 1 from retail.compra_papeles c where c.id = p_id and (c.pagado, c.medio_pago) is distinct from (v_pagado, v_medio)) then
    raise exception 'Esa compra ya se guardó con otros datos: recarga la pantalla' using errcode = 'P0001', hint = 'compra_rapida_otros_datos';
  end if;
  if v_sn is not null and exists (select 1 from retail.compra_papeles c where c.id = p_id and c.serie is not null
                                      and (c.serie, c.numero) is distinct from (v_sn ->> 'serie', v_sn ->> 'numero')) then
    raise exception 'Esa compra ya se guardó con otros datos: recarga la pantalla' using errcode = 'P0001', hint = 'compra_rapida_otros_datos';
  end if;
  return v_r;
end $$;
comment on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text, text, text) is
  'ADR-0480/0574: anota la compra con cuánto se pagó ahora, cómo, y la serie y el número del papel que escribió la compradora; sin ellos, Compras los copia después.';
revoke all on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text, text, text) from public, anon;
grant execute on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text, text, text) to authenticated;

-- La de ocho parámetros se retira: con las dos opcionales nuevas, una llamada sin ellas sería ambigua.
drop function if exists retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text);
