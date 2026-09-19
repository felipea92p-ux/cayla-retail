-- ============================================================================
-- ADR-0134 — Proveedores: CCI, Yape/Plin y titular de la cuenta.
--
-- EL PROBLEMA. Pagar a un proveedor exige un destino inequívoco. Hoy solo hay `cuenta_bancaria`
-- (texto libre que la pantalla rotula «CCI» aunque pueda ser una cuenta local) y `telefono` (el
-- WhatsApp del contacto, que el modal de pago rotula «Yape / Plin»). Un destino mal rotulado es
-- plata enviada al lugar equivocado y no se revierte.
--
-- DECISIÓN (Felipe, 2026-09-19).
--   · Cuatro columnas nuevas en `proveedores`, con candado de formato:
--       cci                 20 dígitos, solo números (la RPC quita espacios y guiones).
--       celular_billetera   9 dígitos que empiezan con 9 (sin +51). Distinto de `telefono`.
--       billeteras          {yape}, {plin} o {plin,yape}: qué app abrir. Va de la mano con el celular.
--       titular_cuenta      el nombre que muestra el banco/Yape antes de confirmar (control anti-error).
--   · `cuenta_bancaria` NO se toca (queda como «cuenta local»). `telefono` NO se copia a la billetera:
--     adivinar un destino de dinero es peor que dejarlo vacío.
--   · Se escribe por UNA RPC nueva, solo líder: `guardar_cuentas_proveedor`. `registrar_proveedor` y
--     `actualizar_proveedor` NO cambian de firma (ya tuvieron un bug de sobrecarga doble).
--   · `fn_proveedores()` trae las 4 columnas. Su cuerpo es el de PRODUCCIÓN (pg_get_functiondef,
--     verificado por md5 contra el local el 2026-09-19), más las 4 columnas al final.
--   · Visibilidad: igual que `banco`/`cuenta_bancaria` (D-27). Cerrarla a solo-líder queda para el final
--     del proyecto (decisión de Felipe, 2026-09-19); las 5 columnas de pago se cierran juntas o ninguna.
--
-- ESTADO. Aplicada en PRODUCCIÓN el 2026-09-19 con la confirmación de Felipe, tras un ensayo completo en
-- una transacción revertida. Quedó registrada como `20260919173940 proveedores_cci_y_billetera` (este archivo
-- conserva su timestamp del repo; se renumera al aplicar, como las demás). Verificada contra la base: 16
-- columnas, 5 candados, una sola firma de `fn_proveedores` y de la RPC, nada en `public`, EXECUTE solo
-- `authenticated`. Producción tenía 2 proveedores y ninguna cuenta cargada: el backfill no copió nada.
-- Pruebas: `pnpm pruebas:proveedores-cuentas` (28 casos, cada uno con ROLLBACK).
--
-- No hay DELETE de datos. Las columnas nuevas nacen nulas; el backfill solo copia lo inequívoco.
-- ============================================================================
set search_path = retail, public, extensions;

-- ---------- 1. columnas ----------
alter table retail.proveedores
  add column if not exists cci text,
  add column if not exists celular_billetera text,
  add column if not exists billeteras text[],
  add column if not exists titular_cuenta text;

-- ---------- 2. candados (soltar y poner: re-ejecutable) ----------
alter table retail.proveedores
  drop constraint if exists proveedores_cci_formato,
  drop constraint if exists proveedores_celular_billetera_formato,
  drop constraint if exists proveedores_billeteras_validas,
  drop constraint if exists proveedores_billetera_coherente,
  drop constraint if exists proveedores_titular_largo,
  add constraint proveedores_cci_formato
    check (cci is null or cci ~ '^[0-9]{20}$'),
  add constraint proveedores_celular_billetera_formato
    check (celular_billetera is null or celular_billetera ~ '^9[0-9]{8}$'),
  add constraint proveedores_billeteras_validas
    check (billeteras is null
           or (cardinality(billeteras) between 1 and 2 and billeteras <@ array['yape', 'plin']::text[])),
  -- un celular sin saber de qué app, o una app sin número, no puede existir
  add constraint proveedores_billetera_coherente
    check ((celular_billetera is null) = (billeteras is null)),
  add constraint proveedores_titular_largo
    check (titular_cuenta is null or char_length(titular_cuenta) between 2 and 120);

comment on column retail.proveedores.cci is
  'Código de Cuenta Interbancario: 20 dígitos, solo números. Para transferir desde otro banco.';
comment on column retail.proveedores.celular_billetera is
  'Celular (9 dígitos, sin +51) al que se yapea/plinea. Distinto de `telefono` (el WhatsApp del contacto).';
comment on column retail.proveedores.billeteras is
  'Qué app tiene ese celular: {yape}, {plin} o {plin,yape}. NULL si no hay billetera; va de la mano con celular_billetera.';
comment on column retail.proveedores.titular_cuenta is
  'Nombre que muestra el banco/Yape al pagar; quien paga lo compara antes de confirmar. Un solo titular para CCI y billetera.';
comment on column retail.proveedores.cuenta_bancaria is
  'Número de cuenta del banco (depósito o mismo banco), texto libre. El interbancario vive en `cci`. Dato de un tercero (D-27).';

-- ---------- 3. backfill: solo copia lo inequívoco (20 dígitos = CCI); idempotente ----------
update retail.proveedores
   set cci = regexp_replace(cuenta_bancaria, '[ -]', '', 'g')
 where cci is null
   and cuenta_bancaria ~ '^[0-9 -]+$'
   and regexp_replace(cuenta_bancaria, '[ -]', '', 'g') ~ '^[0-9]{20}$';

-- ---------- 4. escritura: una RPC, solo líder, reemplazo completo (NULL = vaciar) ----------
create or replace function retail.guardar_cuentas_proveedor(
  p_proveedor_id uuid,
  p_cci text default null,
  p_celular_billetera text default null,
  p_billeteras text[] default null,
  p_titular_cuenta text default null
) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_cci text := nullif(regexp_replace(coalesce(p_cci, ''), '[\s.-]', '', 'g'), '');
  v_cel text := nullif(regexp_replace(coalesce(p_celular_billetera, ''), '[^0-9]', '', 'g'), '');
  v_bil text[];
  v_titular text := retail.fn_texto_o_null(p_titular_cuenta);
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede editar las cuentas de un proveedor.';
  end if;
  if v_cel ~ '^51[0-9]{9}$' then v_cel := substr(v_cel, 3); end if;  -- «+51 987…» → «987…»
  if v_cci is not null and v_cci !~ '^[0-9]{20}$' then
    raise exception 'El CCI tiene que ser de 20 dígitos. Si solo tienes el número de cuenta, va en «Cuenta».';
  end if;
  if v_cel is not null and v_cel !~ '^9[0-9]{8}$' then
    raise exception 'El celular de Yape/Plin tiene que ser de 9 dígitos y empezar con 9.';
  end if;
  select array_agg(distinct lower(b) order by lower(b)) into v_bil
    from unnest(coalesce(p_billeteras, '{}'::text[])) b;
  if v_bil is not null and not (v_bil <@ array['yape', 'plin']) then
    raise exception 'Solo se aceptan Yape o Plin.';
  end if;
  if v_cel is not null and v_bil is null then
    raise exception 'Indica si ese celular es Yape, Plin o ambos.';
  end if;
  if v_cel is null and v_bil is not null then
    raise exception 'Escribe el celular de la billetera, o quita Yape/Plin.';
  end if;
  if v_titular is not null and char_length(v_titular) not between 2 and 120 then
    raise exception 'El titular tiene que tener entre 2 y 120 caracteres.';
  end if;

  update retail.proveedores
     set cci = v_cci, celular_billetera = v_cel, billeteras = v_bil, titular_cuenta = v_titular
   where id = p_proveedor_id;
  if not found then
    raise exception 'Ese proveedor ya no existe. Recarga la pantalla.';
  end if;
end;
$$;

revoke all on function retail.guardar_cuentas_proveedor(uuid, text, text, text[], text) from public, anon;
grant execute on function retail.guardar_cuentas_proveedor(uuid, text, text, text[], text) to authenticated;

-- ---------- 5. lectura: fn_proveedores() trae las 4 columnas ----------
-- Cuerpo = el de producción (2026-09-19) + las 4 columnas al final del RETURNS, del select y del group by.
-- `drop` primero porque cambia el RETURNS; sin él quedarían dos firmas vivas. Se pega de una sola vez.
drop function if exists retail.fn_proveedores();

create function retail.fn_proveedores()
 returns table(id uuid, nombre text, ruc text, contacto text, telefono text, banco text, cuenta_bancaria text, activo boolean, facturas bigint, total_facturado numeric, saldo numeric, ultima_compra date, facturas_vencidas bigint, facturas_recibidas_completas bigint, facturas_con_recepcion_pendiente bigint, facturas_atrasadas bigint, rubro text, plazo_credito_dias integer, forma_pago_preferida text, facturado_12m numeric, saldo_vencido numeric, dias_desde_ultima_compra integer, entregas_por_recibir bigint, saldo_favor numeric, cci text, celular_billetera text, billeteras text[], titular_cuenta text)
 language sql
 stable security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
  select p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada') end as facturas,
         case when fn_es_lider() then coalesce(sum(c.total) filter (where c.estado <> 'anulada'), 0) end as total_facturado,
         case when fn_es_lider() then coalesce(sum(c.saldo) filter (where c.estado <> 'anulada'), 0) end as saldo,
         case when fn_es_lider() then max(c.fecha_emision) filter (where c.estado <> 'anulada') end as ultima_compra,
         case when fn_es_lider() then count(c.id) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < fn_hoy_lima()) end as facturas_vencidas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion = 'recibida') end as facturas_recibidas_completas,
         case when fn_es_lider() then count(c.id) filter (where c.estado <> 'anulada' and c.estado_recepcion in ('parcial', 'sin_recibir')) end as facturas_con_recepcion_pendiente,
         case when fn_es_lider() then count(c.id) filter (
           where c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')
             and fn_hoy_lima() > coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7)
         ) end as facturas_atrasadas,
         p.rubro, p.plazo_credito_dias, p.forma_pago_preferida,
         case when fn_es_lider() then coalesce(sum(c.total) filter (where c.estado <> 'anulada' and c.fecha_emision > fn_hoy_lima() - 365), 0) end as facturado_12m,
         case when fn_es_lider() then coalesce(sum(c.saldo) filter (where c.estado = 'vigente' and c.saldo > 0 and c.fecha_vencimiento < fn_hoy_lima()), 0) end as saldo_vencido,
         case when fn_es_lider() then (fn_hoy_lima() - max(c.fecha_emision) filter (where c.estado <> 'anulada'))::integer end as dias_desde_ultima_compra,
         case when fn_es_lider() then count(c.id) filter (where c.estado = 'vigente' and c.estado_recepcion in ('sin_recibir', 'parcial')) end as entregas_por_recibir,
         case when fn_es_lider() then retail.fn_saldo_favor_proveedor(p.id) end as saldo_favor,
         p.cci, p.celular_billetera, p.billeteras, p.titular_cuenta
  from retail.proveedores p
  left join retail.compras c
    on c.proveedor_id = p.id
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  where retail.fn_tiene_acceso_retail()
  group by p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo, p.rubro, p.plazo_credito_dias, p.forma_pago_preferida,
           p.cci, p.celular_billetera, p.billeteras, p.titular_cuenta
  order by p.activo desc, p.nombre;
$function$;

revoke all on function retail.fn_proveedores() from public, anon;
grant execute on function retail.fn_proveedores() to authenticated;
