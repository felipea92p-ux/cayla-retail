-- ============================================================================
-- 20260929170000_notas_de_credito_una_serie_por_letra.sql — CAYLA V2
--
-- Salida a la SUNAT real (2026-09-29): una tienda necesita DOS series de nota de crédito, BC.. para corregir
-- boletas y FC.. para corregir facturas. Felipe: «BC01 para boletas y FC01 para facturas».
--
-- EL PROBLEMA. SUNAT exige que la serie de una nota lleve la letra del documento que corrige (RS 117-2017,
-- Anexo N.° 3): B… si corrige una boleta, F… si corrige una factura. `20260922234100_series_archivar.sql` dejó
-- esto pendiente a propósito: con «una serie ACTIVA por tienda y tipo» una tienda solo podía tener UNA nota de
-- crédito, y la que tenía en producción (`NC01`, `NC02`) no empieza ni con B ni con F: SUNAT la rechaza siempre.
-- Aquella migración creyó que resolverlo obligaba a cambiar la firma de `emitir_nota` y `aprobar_devolucion`. No:
-- `emitir_nota` ya tiene el comprobante original en la mano y sabe si es boleta o factura, así que la letra la
-- decide ella sola y `aprobar_devolucion` (y quien la llame) no cambia.
--
-- QUÉ CAMBIA
--   1. Índice único parcial: de `(ubicacion_id, tipo)` a `(ubicacion_id, tipo, letra)` donde la letra solo cuenta
--      en las notas (crédito y débito). Boleta, factura y nota de venta siguen con UNA activa por tienda.
--   2. `fn_reservar_numero_serie(uuid, text, text default null)`: el tercer parámetro es la letra. Se DROPEA la
--      firma vieja de 2 parámetros (un `create or replace` con un parámetro más deja las dos vivas y la llamada
--      falla con «is not unique», ADR-0004). Las llamadas de 2 parámetros de `emitir_comprobante` siguen sirviendo.
--      Sin permisos para nadie más que su dueño, como la firma que reemplaza: reservar un número es de las RPC.
--   3. `emitir_nota`: pide la serie de la letra del original (boleta → B, factura → F). Es el ÚNICO cambio: el resto
--      del cuerpo es el de producción tal cual (verificado 2026-09-29, idéntico al local).
--   4. `registrar_serie_comprobante`: la comprobación «esta tienda ya tiene una serie activa» mira la letra en las
--      notas, y ahora rechaza en la base lo que antes solo rechazaba la pantalla: cuatro caracteres, y la letra que
--      pide cada tipo. Así `NC01` no se vuelve a poder registrar (entró a producción justamente por esa falta).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Una sola parte, completa, en el SQL Editor. No crea políticas ni altera tablas: solo
-- índice y funciones, así que no toma los bloqueos de `auth`/`storage` (ADR-0195). Es idempotente: se puede pegar dos
-- veces. Cada sentencia lleva su prefijo `retail.` y `set search_path` va al inicio (CLAUDE.md).
-- Va ANTES de `pegar-en-produccion-series-salida-a-produccion-2026-09.sql`, que registra las dos series de nota
-- por tienda y falla con un aviso claro si esta migración falta.
--
-- NO cambia ningún dato. No toca `comprobantes` ni `series_comprobantes` (solo su índice).
--
-- VERIFICACIÓN (después de pegar):
--   select indexdef from pg_indexes where schemaname = 'retail' and tablename = 'series_comprobantes'
--    and indexname = 'series_comprobantes_activa_por_tienda_tipo_y_letra';   -- una fila, con `left(serie, 1)`
--   select oid::regprocedure from pg_proc where pronamespace = 'retail'::regnamespace
--    and proname = 'fn_reservar_numero_serie';                               -- UNA fila, la de 3 parámetros
--   select proacl from pg_proc where oid = 'retail.fn_reservar_numero_serie(uuid, text, text)'::regprocedure;
--                                                                            -- {postgres=X/postgres}, nada más
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. Una serie ACTIVA por tienda y tipo — y, en las notas, por letra.
drop index if exists retail.series_comprobantes_activa_por_tienda_y_tipo;
create unique index if not exists series_comprobantes_activa_por_tienda_tipo_y_letra
  on retail.series_comprobantes (
    ubicacion_id,
    tipo,
    (case when tipo in ('nota_credito', 'nota_debito') then left(serie, 1) else '' end)
  )
  where archivada_at is null;

-- 2. La reserva, con la letra opcional.
drop function if exists retail.fn_reservar_numero_serie(uuid, text);

create or replace function retail.fn_reservar_numero_serie(p_ubicacion_id uuid, p_tipo text, p_letra text default null)
returns table (serie text, numero integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_serie text; v_numero integer;
begin
  -- `p_letra` solo tiene sentido en las notas; sin ella (boleta, factura, nota de venta) toma la única activa. Con
  -- una nota y sin letra se toma la primera por nombre: hoy ninguna llamada lo hace, `emitir_nota` siempre la pasa.
  select sc.id, sc.serie, sc.siguiente_numero into v_id, v_serie, v_numero
    from series_comprobantes sc
   where sc.ubicacion_id = p_ubicacion_id and sc.tipo = p_tipo and sc.archivada_at is null
     and (p_letra is null or left(sc.serie, 1) = upper(p_letra))
   order by sc.serie
   limit 1
     for update;
  if not found then
    if p_letra is null then
      raise exception 'No hay una serie registrada para % en esta ubicación', p_tipo;
    end if;
    raise exception 'No hay una serie de % que corrija % en esta ubicación: regístrala en Comprobantes ▸ Series (empieza con %)',
      p_tipo, case upper(p_letra) when 'B' then 'boletas' when 'F' then 'facturas' else p_letra end, upper(p_letra);
  end if;
  update series_comprobantes set siguiente_numero = v_numero + 1 where id = v_id;
  return query select v_serie, v_numero;
end;
$$;

revoke all on function retail.fn_reservar_numero_serie(uuid, text, text) from public;
revoke execute on function retail.fn_reservar_numero_serie(uuid, text, text) from anon, authenticated;

-- 3. La nota pide la serie de la letra del documento que corrige.
create or replace function retail.emitir_nota(
  p_comprobante_original_id uuid, p_tipo text, p_motivo text, p_subtotal numeric, p_igv numeric, p_total numeric,
  p_items jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_original comprobantes%rowtype; v_serie text; v_numero integer; v_id uuid; v_persona uuid; v_items jsonb;
begin
  select * into v_original from comprobantes where id = p_comprobante_original_id;
  if not found then
    raise exception 'El comprobante original % no existe', p_comprobante_original_id;
  end if;
  if not fn_puede_operar_ubicacion(v_original.ubicacion_id) then
    raise exception 'No tienes permiso para emitir notas en esa ubicación';
  end if;
  -- SUNAT: la nota lleva la letra del documento que corrige (B si corrige una boleta, F si una factura).
  select serie, numero into v_serie, v_numero
    from fn_reservar_numero_serie(
      v_original.ubicacion_id, p_tipo,
      case v_original.tipo when 'boleta' then 'B' when 'factura' then 'F' else null end
    );
  v_persona := retail.fn_actor_persona_id(true);
  v_items := coalesce(p_items, v_original.items);
  insert into comprobantes (ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
    subtotal, igv, total, usuario_id, comprobante_original_id, motivo, items)
    values (v_original.ubicacion_id, p_tipo, v_serie, v_numero, v_original.cliente_tipo_doc, v_original.cliente_num_doc,
      v_original.cliente_nombre, p_subtotal, p_igv, p_total, v_persona, p_comprobante_original_id, p_motivo, v_items)
    returning id into v_id;
  return v_id;
end;
$$;

-- 4. Registrar: por letra en las notas, y el formato también lo exige la base.
create or replace function retail.registrar_serie_comprobante(
  p_ubicacion_id uuid, p_tipo text, p_serie text, p_siguiente_numero integer default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_activa text; v_serie text := upper(btrim(p_serie)); v_es_nota boolean := p_tipo in ('nota_credito', 'nota_debito');
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede registrar una serie de comprobantes';
  end if;
  if p_siguiente_numero is not null and p_siguiente_numero < 1 then
    raise exception 'El próximo número empieza en 1 o más';
  end if;

  -- Lo que SUNAT exige de la serie (RS 117-2017, Anexo N.° 3): cuatro caracteres, y la primera letra según el
  -- documento. La nota de venta no es un documento de SUNAT: su serie es libre. Antes solo lo comprobaba la
  -- pantalla, y `NC01` entró a producción: SUNAT rechaza todo lo que salga con ella.
  if p_tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito') then
    if v_serie !~ '^[A-Z0-9]{4}$' then
      raise exception 'La serie tiene cuatro caracteres, solo letras y números (por ejemplo B001)';
    end if;
    if p_tipo = 'boleta' and left(v_serie, 1) <> 'B' then
      raise exception 'La serie de una boleta empieza con B (por ejemplo B001)';
    end if;
    if p_tipo = 'factura' and left(v_serie, 1) <> 'F' then
      raise exception 'La serie de una factura empieza con F (por ejemplo F001)';
    end if;
    if v_es_nota and left(v_serie, 1) not in ('B', 'F') then
      raise exception 'La serie de una nota empieza con B si corrige boletas o con F si corrige facturas (por ejemplo BC01)';
    end if;
  end if;

  select serie into v_activa from series_comprobantes
   where ubicacion_id = p_ubicacion_id and tipo = p_tipo and archivada_at is null
     and (not v_es_nota or left(serie, 1) = left(v_serie, 1));
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
