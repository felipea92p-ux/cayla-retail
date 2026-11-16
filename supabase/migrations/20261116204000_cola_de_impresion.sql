-- La cola de impresión: vender en el piso y que la boleta salga en la caja (Felipe, 2026-11-16).
--
-- EL PROBLEMA. La colaboradora vende desde el celular en el piso, que no tiene impresora (llegará una inalámbrica más
-- adelante). La boleta tiene que salir sola en la impresora de la caja, sin que nadie camine hasta ahí. La caja puede estar
-- apagada o sin papel en ese momento, y puede haber dos ventanas de caja abiertas: ninguna boleta se pierde y ninguna sale dos
-- veces (decisión de Felipe: «queda en cola y sale sola»).
--
-- EL DISEÑO.
--   · `retail.impresiones`: una fila por boleta que se pidió imprimir en la caja. Solo cambia de estado (pendiente → tomada →
--     impresa); no es un libro de stock ni de dinero. Una venta tiene a lo más UNA pedida viva (índice único parcial): pedirla
--     dos veces devuelve la misma. Ya impresa, se puede pedir otra vez (reimprimir).
--   · `pedir_impresion(venta)`: la llama el celular después de cobrar. Quien la pide es quien vendió (`ventas.usuario_id`):
--     la venta ya quedó firmada con su responsable, y una boleta impresa no es una operación nueva que firmar.
--   · `tomar_impresion(sede, equipo)`: la llama la ventana «CAYLA Caja». Toma la más antigua con `for update skip locked`, así
--     dos cajas a la vez nunca toman la misma. Una tomada que no se marcó en 2 minutos (la caja se colgó a mitad) vuelve a la
--     cola; tras 5 intentos se deja (algo la rompe y reimprimirla en bucle gastaría el rollo). Solo toma lo pedido en las
--     últimas 12 horas: si la caja estuvo apagada desde ayer, no saca de golpe las boletas viejas (el cliente ya se fue; la
--     boleta igual está en SUNAT y se reimprime desde Historial). Una venta anulada no se imprime.
--   · `marcar_impresion(id, impresa)`: impresa, o de vuelta a la cola si falló.
--   · `fn_impresion_estado(id)`: el celular pregunta si ya salió («En la cola de la caja» → «Impresa»).
--   Permisos: el módulo Vender (`fn_exigir_modulo('vender')`) y operar esa sede (`fn_puede_operar_ubicacion`), en la base.
--   La tabla tiene RLS encendido y SIN políticas: solo la tocan estas funciones `security definer` (ADR-0195).
--
-- TIEMPO REAL. La caja ya escucha `retail.ventas` (ADR-0603) y, al entrar una venta de su sede, pregunta por la cola; además
-- pregunta cada pocos segundos (respaldo). Esta tabla NO entra a la publicación: no hace falta y así no hay políticas que pegar.
--
-- PRODUCCIÓN. Una sola parte: crea una tabla nueva y funciones nuevas; no toca ninguna tabla en uso ni crea políticas
-- (ADR-0195). Idempotente: se puede pegar dos veces. `lock_timeout` de 3 s. Prueba: `pnpm pruebas:cola-de-impresion`.
-- Para deshacer: `drop function retail.pedir_impresion(uuid), retail.tomar_impresion(uuid, text),
-- retail.marcar_impresion(uuid, boolean), retail.fn_impresion_estado(uuid); drop table retail.impresiones;` (las pantallas
-- vuelven a imprimir donde se cobra).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.impresiones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  pedida_en timestamptz not null default now(),
  pedida_por uuid,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'tomada', 'impresa')),
  tomada_en timestamptz,
  tomada_por_equipo text check (tomada_por_equipo is null or char_length(tomada_por_equipo) between 1 and 80),
  impresa_en timestamptz,
  intentos integer not null default 0 check (intentos >= 0),
  constraint impresiones_impresa_con_fecha check ((estado = 'impresa') = (impresa_en is not null)),
  constraint impresiones_tomada_con_fecha check (estado = 'pendiente' or tomada_en is not null)
);

comment on table retail.impresiones is
  'Boletas que se pidieron imprimir en la caja (vender en el piso, 2026-11-16). Solo la tocan pedir_impresion, tomar_impresion y marcar_impresion.';

-- Una pedida viva por venta: pedirla dos veces (doble toque, reintento) no la imprime dos veces.
create unique index if not exists impresiones_una_viva_por_venta on retail.impresiones (venta_id) where estado <> 'impresa';
-- La cola de cada sede, en orden de llegada.
create index if not exists impresiones_cola_por_sede on retail.impresiones (ubicacion_id, pedida_en) where estado <> 'impresa';

alter table retail.impresiones enable row level security;
revoke all on table retail.impresiones from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function retail.pedir_impresion(p_venta_id uuid)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid;
  v_usuario uuid;
  v_estado text;
  v_id uuid;
begin
  perform retail.fn_exigir_modulo('vender');
  select v.ubicacion_id, v.usuario_id, v.estado into v_ubicacion, v_usuario, v_estado
    from retail.ventas v where v.id = p_venta_id;
  if v_ubicacion is null then
    raise exception 'Esa venta no existe.' using errcode = 'P0002', hint = 'venta_no_existe';
  end if;
  if not retail.fn_puede_operar_ubicacion(v_ubicacion) then
    raise exception 'No operas en la sede de esa venta.' using errcode = '42501', hint = 'sede_ajena';
  end if;
  if v_estado = 'anulada' then
    raise exception 'Esa venta está anulada: no se imprime.' using errcode = 'P0001', hint = 'venta_anulada';
  end if;

  insert into retail.impresiones (venta_id, ubicacion_id, pedida_por)
  values (p_venta_id, v_ubicacion, v_usuario)
  on conflict (venta_id) where estado <> 'impresa' do nothing
  returning id into v_id;

  if v_id is null then
    select i.id into v_id from retail.impresiones i where i.venta_id = p_venta_id and i.estado <> 'impresa';
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function retail.tomar_impresion(p_ubicacion_id uuid, p_equipo text)
returns table (impresion_id uuid, venta_id uuid, pendientes integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_venta uuid;
  v_pendientes integer;
begin
  perform retail.fn_exigir_modulo('vender');
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No operas en esa sede.' using errcode = '42501', hint = 'sede_ajena';
  end if;
  if p_equipo is null or char_length(btrim(p_equipo)) not between 1 and 80 then
    raise exception 'Falta el nombre del equipo que imprime.' using errcode = '22023', hint = 'equipo_invalido';
  end if;

  with siguiente as (
    select i.id
      from retail.impresiones i
      join retail.ventas v on v.id = i.venta_id
     where i.ubicacion_id = p_ubicacion_id
       and i.pedida_en > now() - interval '12 hours'
       and i.intentos < 5
       and v.estado <> 'anulada'
       and (i.estado = 'pendiente' or (i.estado = 'tomada' and i.tomada_en < now() - interval '2 minutes'))
     order by i.pedida_en, i.id
     limit 1
     for update of i skip locked
  )
  update retail.impresiones i
     set estado = 'tomada', tomada_en = now(), tomada_por_equipo = btrim(p_equipo), intentos = i.intentos + 1
    from siguiente
   where i.id = siguiente.id
  returning i.id, i.venta_id into v_id, v_venta;

  select count(*)::integer into v_pendientes
    from retail.impresiones i
    join retail.ventas v on v.id = i.venta_id
   where i.ubicacion_id = p_ubicacion_id
     and i.estado <> 'impresa'
     and i.pedida_en > now() - interval '12 hours'
     and i.intentos < 5
     and v.estado <> 'anulada'
     and i.id is distinct from v_id;

  return query select v_id, v_venta, v_pendientes;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function retail.marcar_impresion(p_impresion_id uuid, p_impresa boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid;
begin
  perform retail.fn_exigir_modulo('vender');
  select i.ubicacion_id into v_ubicacion from retail.impresiones i where i.id = p_impresion_id for update;
  if v_ubicacion is null then
    raise exception 'Esa impresión no existe.' using errcode = 'P0002', hint = 'impresion_no_existe';
  end if;
  if not retail.fn_puede_operar_ubicacion(v_ubicacion) then
    raise exception 'No operas en esa sede.' using errcode = '42501', hint = 'sede_ajena';
  end if;
  -- Solo la que está tomada cambia: marcar dos veces (o tarde, cuando otra caja ya la retomó y la imprimió) no hace nada.
  if p_impresa then
    update retail.impresiones set estado = 'impresa', impresa_en = now() where id = p_impresion_id and estado = 'tomada';
  else
    update retail.impresiones set estado = 'pendiente' where id = p_impresion_id and estado = 'tomada';
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function retail.fn_impresion_estado(p_impresion_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid;
  v_estado text;
begin
  perform retail.fn_exigir_modulo('vender');
  select i.ubicacion_id, i.estado into v_ubicacion, v_estado from retail.impresiones i where i.id = p_impresion_id;
  if v_ubicacion is null or not retail.fn_puede_operar_ubicacion(v_ubicacion) then
    return null;
  end if;
  return v_estado;
end
$$;

revoke all on function retail.pedir_impresion(uuid) from public, anon;
revoke all on function retail.tomar_impresion(uuid, text) from public, anon;
revoke all on function retail.marcar_impresion(uuid, boolean) from public, anon;
revoke all on function retail.fn_impresion_estado(uuid) from public, anon;
grant execute on function retail.pedir_impresion(uuid) to authenticated;
grant execute on function retail.tomar_impresion(uuid, text) to authenticated;
grant execute on function retail.marcar_impresion(uuid, boolean) to authenticated;
grant execute on function retail.fn_impresion_estado(uuid) to authenticated;
