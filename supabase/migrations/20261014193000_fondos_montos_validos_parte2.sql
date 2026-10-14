-- ============================================================================
-- 20261014193000_fondos_montos_validos_parte2.sql — ADR-0362 fase 6 (/chaos 2026-10-14, Felipe 2026-10-14)
--
-- Parte 2 de «montos y datos válidos en los fondos» (la parte 1 pone los candados en las tablas). Aquí, las funciones del fondo dicen
-- QUÉ corregir, en palabras de tienda, antes de que el candado rebote o de que algo dudoso se guarde en silencio. Lo que /chaos
-- (2026-10-14, semilla 1014) encontró por la API, y Felipe aprobó cerrar:
--   · Un monto que no es un número (NaN, infinito) entraba en `entregar_fondo` y `registrar_gasto_viaje` (`fn_monto_valido`, de
--     20261013205000, lo rechaza también en devolver, pagar una deuda y rendir).
--   · Tres decimales se redondeaban en silencio en entregar y devolver (10.005 → 10.01); pagar una deuda y el gasto del viaje ya los
--     rechazaban. Ahora los cuatro dicen «máximo 2 decimales». Y un monto de diez mil millones o más es un error de tipeo, no una
--     compra: «demasiado grande» (antes rebotaba con un «numeric field overflow» técnico).
--   · Fechas de 1900: solo se frenaba la futura. Desde aquí, la plata de un fondo y un gasto del viaje no son de antes del 13/10/2026,
--     cuando empezaron los fondos (`fn_fondos_desde`; Felipe 2026-10-14). Pagar una deuda ya exigía no ser de antes de la deuda.
--   · Un carácter invisible (espacio de ancho cero, U+200B y sus parientes) pasaba como «para qué», como nota de «Otro» y como motivo
--     de anulación: `btrim` no lo quita. `fn_sin_invisibles` los quita antes de mirar si el texto está vacío.
--   · El motivo de anular una entrega no tenía largo máximo (anular el pago de una deuda cortaba en 200): ahora los dos, 200.
--
-- CONTRATO (Liskov)
--   PROMETE: esas funciones rechazan con P0001 (hint `monto_invalido` o `fecha_antes_de_los_fondos`) lo que antes guardaban o rebotaba
--            en un CHECK. Lo válido pasa igual que antes. Las dos funciones nuevas son puras (immutable).
--   ASUME:   la parte 1 (20261014192000) y `fn_monto_valido` (20261013205000).
--   NO HACE: no toca tablas, políticas ni el token de reintento (eso es 20261014194000).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, solo funciones, DESPUÉS de la parte 1. Reemplazos ANCLADOS sobre la
-- definición viva: cada ancla aparece las veces dichas en el banco `cayla-oc` y en producción (las mismas huellas, medido el 2026-10-14).
-- Si una función cambió, aborta sin cambiar nada. Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
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

-- ---------- 1. Dos piezas puras ----------
create or replace function retail.fn_sin_invisibles(p_texto text)
returns text
language sql
immutable
set search_path = retail, public
as $$
  -- Los espacios de ancho cero (U+200B, U+200C, U+200D), la unión de palabras (U+2060) y la marca de orden (U+FEFF): no se ven, y
  -- `btrim` no los quita. Un texto hecho solo de ellos es un texto vacío.
  select translate(p_texto, chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279), '');
$$;
comment on function retail.fn_sin_invisibles(text) is
  'ADR-0362 fase 6 (/chaos 2026-10-14): el texto sin los caracteres que no se ven (U+200B, U+200C, U+200D, U+2060, U+FEFF), para mirar si quedó vacío.';

create or replace function retail.fn_fondos_desde()
returns date
language sql
immutable
set search_path = retail, public
as $$
  -- Felipe 2026-10-14: la plata de un fondo y un gasto del viaje no son de antes de que existieran los fondos (la fase 6 del ADR-0362).
  select date '2026-10-13';
$$;
comment on function retail.fn_fondos_desde() is
  'ADR-0362 fase 6 (Felipe 2026-10-14): el primer día en que puede haber plata de un fondo o un gasto del viaje (13/10/2026).';

-- ---------- 2. Entregar plata ----------
select pg_temp.reemplazar('retail.entregar_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');$v$,
$n$  v_motivo text := nullif(trim(retail.fn_sin_invisibles(coalesce(p_motivo, ''))), '');$n$,
1);
select pg_temp.reemplazar('retail.entregar_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;$v$,
$n$  -- /chaos 2026-10-14: un monto de verdad (NaN e infinito pasan un «> 0»), con céntimos y de un tamaño posible.
  if not retail.fn_monto_valido(p_monto) or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if p_monto <> v_monto then
    raise exception 'El monto admite como máximo 2 decimales.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_monto >= 10000000000 then
    raise exception 'El monto es demasiado grande: revísalo.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;$n$,
1);
select pg_temp.reemplazar('retail.entregar_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  if v_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;$v$,
$n$  if v_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;
  if v_fecha < retail.fn_fondos_desde() then
    raise exception 'La fecha no puede ser de antes del %, cuando empezaron los fondos.', to_char(retail.fn_fondos_desde(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'fecha_antes_de_los_fondos';
  end if;$n$,
1);

-- ---------- 3. Registrar lo que se devuelve ----------
select pg_temp.reemplazar('retail.devolver_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  v_nota text := nullif(trim(coalesce(p_nota, '')), '');$v$,
$n$  v_nota text := nullif(trim(retail.fn_sin_invisibles(coalesce(p_nota, ''))), '');$n$,
1);
select pg_temp.reemplazar('retail.devolver_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;$v$,
$n$  -- /chaos 2026-10-14: un monto de verdad (NaN e infinito pasan un «> 0»), con céntimos y de un tamaño posible.
  if not retail.fn_monto_valido(p_monto) or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if p_monto <> v_monto then
    raise exception 'El monto admite como máximo 2 decimales.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_monto >= 10000000000 then
    raise exception 'El monto es demasiado grande: revísalo.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;$n$,
1);
select pg_temp.reemplazar('retail.devolver_fondo(uuid, uuid, numeric, text, date, uuid)',
$v$  if v_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;$v$,
$n$  if v_fecha > v_hoy then
    raise exception 'La fecha no puede ser futura.' using errcode = 'P0001';
  end if;
  if v_fecha < retail.fn_fondos_desde() then
    raise exception 'La fecha no puede ser de antes del %, cuando empezaron los fondos.', to_char(retail.fn_fondos_desde(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'fecha_antes_de_los_fondos';
  end if;$n$,
1);

-- ---------- 4. Registrar lo que alguien paga de su deuda ----------
select pg_temp.reemplazar('retail.pagar_deuda_fondo(uuid, numeric, uuid, text, date, uuid)',
$v$  v_nota text := nullif(trim(coalesce(p_nota, '')), '');$v$,
$n$  v_nota text := nullif(trim(retail.fn_sin_invisibles(coalesce(p_nota, ''))), '');$n$,
1);
select pg_temp.reemplazar('retail.pagar_deuda_fondo(uuid, numeric, uuid, text, date, uuid)',
$v$  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;$v$,
$n$  -- /chaos 2026-10-14: un monto de verdad (NaN pasa un «> 0»; lo de más lo frena lo que debe).
  if not retail.fn_monto_valido(p_monto) or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;$n$,
1);

-- ---------- 5. Un gasto del viaje ----------
select pg_temp.reemplazar('retail.registrar_gasto_viaje(text, text, numeric, date, text, text, uuid, uuid[], text, text, text, uuid)',
$v$  if p_concepto = 'otro' and nullif(btrim(coalesce(p_nota, '')), '') is null then$v$,
$n$  if p_concepto = 'otro' and nullif(btrim(retail.fn_sin_invisibles(coalesce(p_nota, ''))), '') is null then$n$,
1);
select pg_temp.reemplazar('retail.registrar_gasto_viaje(text, text, numeric, date, text, text, uuid, uuid[], text, text, text, uuid)',
$v$  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;$v$,
$n$  -- /chaos 2026-10-14: un monto de verdad (NaN e infinito pasan un «> 0»).
  if not retail.fn_monto_valido(p_monto) or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;$n$,
1);
select pg_temp.reemplazar('retail.registrar_gasto_viaje(text, text, numeric, date, text, text, uuid, uuid[], text, text, text, uuid)',
$v$  if p_monto <> v_monto then
    raise exception 'El monto admite como máximo 2 decimales.' using errcode = 'P0001';
  end if;$v$,
$n$  if p_monto <> v_monto then
    raise exception 'El monto admite como máximo 2 decimales.' using errcode = 'P0001';
  end if;
  if v_monto >= 10000000000 then
    raise exception 'El monto es demasiado grande: revísalo.' using errcode = 'P0001', hint = 'monto_invalido';
  end if;$n$,
1);
select pg_temp.reemplazar('retail.registrar_gasto_viaje(text, text, numeric, date, text, text, uuid, uuid[], text, text, text, uuid)',
$v$  if p_fecha is null or p_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha del gasto no puede ser futura.' using errcode = 'P0001';
  end if;$v$,
$n$  if p_fecha is null or p_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha del gasto no puede ser futura.' using errcode = 'P0001';
  end if;
  if p_fecha < retail.fn_fondos_desde() then
    raise exception 'La fecha del gasto no puede ser de antes del %, cuando empezaron los gastos del viaje.', to_char(retail.fn_fondos_desde(), 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'fecha_antes_de_los_fondos';
  end if;$n$,
1);

-- ---------- 6. Rendir ----------
select pg_temp.reemplazar('retail.rendir_fondo(numeric, text, uuid)',
$v$  if v_efectivo is null or v_efectivo < 0 then$v$,
$n$  if not retail.fn_monto_valido(p_efectivo) or v_efectivo < 0 then$n$,
1);

-- ---------- 7. Anular: un motivo que se lea, de 200 letras como máximo ----------
select pg_temp.reemplazar('retail.anular_movimiento_fondo(uuid, text)',
$v$  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'Di por qué se anula.' using errcode = 'P0001';
  end if;$v$,
$n$  if p_motivo is null or trim(retail.fn_sin_invisibles(p_motivo)) = '' then
    raise exception 'Di por qué se anula.' using errcode = 'P0001';
  end if;
  if char_length(trim(p_motivo)) > 200 then
    raise exception 'El motivo es muy largo (máximo 200 letras).' using errcode = 'P0001';
  end if;$n$,
1);
select pg_temp.reemplazar('retail.anular_pago_deuda_fondo(uuid, text)',
$v$  if p_motivo is null or trim(p_motivo) = '' then$v$,
$n$  if p_motivo is null or trim(retail.fn_sin_invisibles(p_motivo)) = '' then$n$,
1);

-- ---------- 8. Permisos de las dos piezas nuevas ----------
-- Las llaman funciones `security definer` (corren como su dueña, `postgres`): ella tiene que poder ejecutarlas aunque la migración
-- la pegue otro usuario. Nadie más las llama.
revoke all on function retail.fn_sin_invisibles(text) from public, anon, authenticated;
revoke all on function retail.fn_fondos_desde() from public, anon, authenticated;
grant execute on function retail.fn_sin_invisibles(text), retail.fn_fondos_desde() to postgres;

reset lock_timeout;
notify pgrst, 'reload schema';
