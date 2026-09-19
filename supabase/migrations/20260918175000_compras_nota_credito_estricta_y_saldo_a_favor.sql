-- ============================================================================
-- ADR-0106 (corrección 2026-09-18) — la nota de crédito se ordena, y lo que no
-- baja una deuda queda como SALDO A FAVOR del proveedor.
--
-- LO QUE FALLABA. Hoy cualquiera de estas cosas pasaba:
--   · registrar una nota de crédito sin que hubiera ningún faltante cerrado;
--   · registrar una nota «por faltante» con el comprobante todavía a medias
--     (un cierre posterior obligaba a una segunda nota por el mismo faltante);
--   · registrar dos notas por el mismo faltante;
--   · nada que hacer con una nota sobre una factura AL CONTADO: nace pagada
--     (saldo 0) y la base rechazaba cualquier nota (`monto > saldo`).
--
-- LO QUE CAMBIA.
--   1. `compra_notas_credito.aplicado`: cuánto de la nota bajó la deuda de ESE
--      comprobante = min(monto, saldo). El resto (monto − aplicado) es saldo a
--      favor. `compras.notas_credito` (la foto que resta del saldo) pasa a sumar
--      `aplicado`, no `monto`: así `saldo` sigue siendo ≥ 0 (compras_no_sobrepagada
--      intacta) y NO se toca lo que significa `saldo` (principio 1, núcleo estable).
--   2. `proveedor_creditos`: libro append-only del saldo a favor de cada proveedor.
--      Tres tipos de movimiento: `nota_credito` (+, lo que sobró de una nota),
--      `aplicacion` (−, usado como medio de pago de un comprobante) y `reembolso`
--      (−, el proveedor devolvió el dinero). El saldo a favor NO se guarda: es la suma
--      del libro (principio 4).
--   3. Reglas de la nota POR FALTANTE (motivo = 'faltante'), aplicadas en el único
--      punto por donde pasan todas las notas (`fn_insertar_nota_credito_compra`):
--        · UNA por comprobante (índice único parcial + mensaje claro);
--        · solo con el comprobante RESUELTO al 100 % (recibido + cerrado = facturado);
--        · solo si hay al menos un cierre por faltante;
--        · monto ≤ lo cerrado a su costo + IGV (S/ 1 de margen por redondeo).
--      Devolución, descuento y otro NO llevan estas reglas (SUNAT permite varias notas
--      por factura): solo la de ninguna nota suma más que el comprobante.
--   4. `cerrar_linea_compra` ya NO registra la nota: cierra y punto. La nota se
--      registra aparte (o junto con la recepción, en `recibir_y_cerrar_compras`).
--
-- COMPATIBILIDAD. Nada de esto está en producción todavía (compras tiene 0 filas allá);
-- en local, las notas que ya existen quedan con aplicado = monto (comportamiento de antes).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. cuánto de la nota bajó la deuda ====================
alter table compra_notas_credito add column aplicado numeric(12, 2);

-- El libro es inmutable a propósito; la única excepción es este relleno único de filas viejas.
alter table compra_notas_credito disable trigger compra_notas_credito_inmutables;
update compra_notas_credito set aplicado = monto where aplicado is null;
alter table compra_notas_credito enable trigger compra_notas_credito_inmutables;

alter table compra_notas_credito alter column aplicado set not null;
alter table compra_notas_credito
  add constraint compra_notas_credito_aplicado_valido check (aplicado >= 0 and aplicado <= monto);

comment on column compra_notas_credito.aplicado is
  'Cuánto de la nota bajó lo que se debe de ESTE comprobante = min(monto, saldo al registrarla). monto − aplicado quedó como saldo a favor del proveedor (proveedor_creditos). compras.notas_credito suma esta columna.';

-- Una sola nota por faltante por comprobante.
create unique index compra_notas_credito_faltante_unica
  on compra_notas_credito (compra_id) where motivo = 'faltante';

-- La foto y su reconstrucción suman lo APLICADO (lo que resta del saldo), no el monto de la nota.
create or replace function retail.fn_compra_nota_credito_insertada() returns trigger
language plpgsql security definer set search_path = retail, public, extensions
as $$
begin
  update compras set notas_credito = notas_credito + new.aplicado where id = new.compra_id;
  return new;
end;
$$;

create or replace function retail.recalcular_compras()
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  update compras c set
    pagado = coalesce((select sum(monto) from compra_pagos p where p.compra_id = c.id), 0),
    notas_credito = coalesce((select sum(n.aplicado) from compra_notas_credito n where n.compra_id = c.id), 0),
    facturado_cantidad = coalesce((select sum(cantidad) from compra_items i where i.compra_id = c.id), 0),
    recibido_cantidad = coalesce((
      select sum(m.cantidad) from movimientos m join compra_items i on i.id = m.compra_item_id
      where i.compra_id = c.id
    ), 0),
    cerrado_cantidad = coalesce((
      select sum(k.cantidad) from compra_item_cierres k join compra_items i on i.id = k.compra_item_id
      where i.compra_id = c.id
    ), 0);
end;
$$;

comment on column compras.notas_credito is
  'Suma de compra_notas_credito.APLICADO de este comprobante (lo que de las notas bajó su deuda). Foto mantenida por trigger; resta del saldo. Lo que sobró de una nota vive en proveedor_creditos.';

-- ==================== 2. el libro del saldo a favor ====================
create table proveedor_creditos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores (id),
  tipo text not null check (tipo in ('nota_credito', 'aplicacion', 'reembolso')),
  monto numeric(12, 2) not null check (monto > 0),
  fecha date not null,
  compra_id uuid references compras (id),                    -- comprobante de origen (nota) o de destino (aplicación)
  nota_credito_id uuid references compra_notas_credito (id), -- solo tipo = nota_credito
  compra_pago_id uuid references compra_pagos (id),          -- solo tipo = aplicacion
  metodo text,                                               -- solo tipo = reembolso: cómo devolvió el dinero
  referencia text,
  nota text,
  usuario_id uuid references personas (id),
  created_at timestamptz not null default now(),
  constraint proveedor_creditos_origen check (
    (tipo = 'nota_credito' and nota_credito_id is not null)
    or (tipo = 'aplicacion' and compra_pago_id is not null)
    or (tipo = 'reembolso' and metodo is not null)
  )
);
create index proveedor_creditos_proveedor_idx on proveedor_creditos (proveedor_id, created_at desc);

comment on table proveedor_creditos is
  'Libro append-only del saldo a favor de cada proveedor (ADR-0106, corrección 2026-09-18). nota_credito = lo que sobró de una nota tras bajar la deuda de su comprobante; aplicacion = usado como medio de pago; reembolso = el proveedor devolvió el dinero. Saldo = suma(nota_credito) − suma(aplicacion) − suma(reembolso): se calcula, no se guarda.';

alter table proveedor_creditos enable row level security;

create policy proveedor_creditos_select on proveedor_creditos for select
  using (fn_puede_registrar_compras());

revoke insert, update, delete, truncate on proveedor_creditos from authenticated, anon;

create function retail.fn_libro_creditos_es_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'El libro del saldo a favor no se edita ni se borra. '
    'Para corregir un error, registra un movimiento nuevo — así queda constancia de qué pasó.';
end;
$$;

create trigger proveedor_creditos_inmutables
  before update or delete on proveedor_creditos
  for each row execute function retail.fn_libro_creditos_es_inmutable();

-- Saldo a favor de un proveedor. SECURITY INVOKER a propósito: la RLS del libro (solo quien
-- registra compras) hace que un integrante lea 0, sin lógica aparte.
create function retail.fn_saldo_favor_proveedor(p_proveedor_id uuid)
returns numeric
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(sum(case tipo when 'nota_credito' then monto else -monto end), 0)::numeric(12, 2)
  from proveedor_creditos
  where proveedor_id = p_proveedor_id;
$$;

comment on function retail.fn_saldo_favor_proveedor(uuid) is
  'Cuánto le debe el proveedor a CAYLA en saldo a favor (ADR-0106). Suma del libro proveedor_creditos; 0 para quien no puede registrar compras (RLS).';

revoke all on function retail.fn_saldo_favor_proveedor(uuid) from public, anon;
grant execute on function retail.fn_saldo_favor_proveedor(uuid) to authenticated;

-- Usar saldo a favor como medio de pago. Interna: la llaman las RPC de pago con el comprobante
-- YA bloqueado; acá se bloquea el proveedor (siempre en ese orden: comprobante, proveedor) y se
-- verifica que alcance. Dos pagos simultáneos no pueden gastar el mismo saldo.
create function retail.fn_consumir_saldo_favor(
  p_proveedor_id uuid,
  p_monto numeric,
  p_compra_id uuid,
  p_compra_pago_id uuid,
  p_fecha date,
  p_persona uuid
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_saldo numeric(12, 2);
begin
  perform 1 from proveedores where id = p_proveedor_id for update;
  v_saldo := fn_saldo_favor_proveedor(p_proveedor_id);
  if p_monto > v_saldo then
    raise exception 'El saldo a favor con este proveedor es S/ % y se intenta usar S/ %', v_saldo, p_monto;
  end if;
  insert into proveedor_creditos (proveedor_id, tipo, monto, fecha, compra_id, compra_pago_id, usuario_id)
    values (p_proveedor_id, 'aplicacion', p_monto, p_fecha, p_compra_id, p_compra_pago_id, p_persona);
end;
$$;

revoke all on function retail.fn_consumir_saldo_favor(uuid, numeric, uuid, uuid, date, uuid) from public, anon, authenticated;

-- ==================== 3. la nota, con sus reglas ====================
create or replace function retail.fn_insertar_nota_credito_compra(
  p_compra_id uuid,
  p_serie_numero text,
  p_fecha date,
  p_monto numeric,
  p_motivo text,
  p_nota text,
  p_cierre_id uuid,
  p_persona uuid
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_c compras%rowtype;
  v_serie text := upper(trim(coalesce(p_serie_numero, '')));
  v_igv numeric(12, 2);
  v_igv_previo numeric(12, 2);
  v_monto_previo numeric(12, 2);
  v_aplicado numeric(12, 2);
  v_excedente numeric(12, 2);
  v_valor_cerrado numeric(12, 2);
  v_tasa numeric;
  v_tope numeric(12, 2);
  v_id uuid;
begin
  select * into v_c from compras where id = p_compra_id;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;
  if v_c.estado <> 'vigente' then
    raise exception 'El comprobante %-% está anulado, no acepta notas de crédito', v_c.serie, v_c.numero;
  end if;
  if v_serie = '' then
    raise exception 'La nota de crédito necesita su serie y número';
  end if;
  if p_fecha is null then
    raise exception 'La nota de crédito necesita su fecha';
  end if;
  if p_fecha < v_c.fecha_emision then
    raise exception 'La nota de crédito no puede ser anterior al comprobante (emitido el %)', to_char(v_c.fecha_emision, 'DD/MM/YYYY');
  end if;
  if p_fecha > fn_hoy_lima() then
    raise exception 'La fecha de la nota de crédito no puede ser futura';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'La nota de crédito necesita un monto mayor a cero';
  end if;
  if p_monto <> round(p_monto, 2) then
    raise exception 'El monto de la nota de crédito admite como máximo 2 decimales (llegó %)', p_monto;
  end if;
  if coalesce(p_motivo, '') not in ('faltante', 'devolucion', 'descuento', 'otro') then
    raise exception 'Motivo de nota de crédito no reconocido: %', coalesce(p_motivo, '(vacío)');
  end if;
  if p_cierre_id is not null and not exists (
    select 1
    from compra_item_cierres k
    join compra_items i on i.id = k.compra_item_id
    where k.id = p_cierre_id and i.compra_id = p_compra_id
  ) then
    raise exception 'El cierre % no pertenece a este comprobante', p_cierre_id;
  end if;

  -- Ninguna suma de notas puede pasar del comprobante: no se acredita más de lo que se facturó.
  select coalesce(sum(monto), 0) into v_monto_previo from compra_notas_credito where compra_id = p_compra_id;
  if v_monto_previo + p_monto > v_c.total then
    raise exception 'Las notas de crédito de %-% sumarían S/ %, más que el comprobante (S/ %)',
      v_c.serie, v_c.numero, v_monto_previo + p_monto, v_c.total;
  end if;

  -- La nota POR FALTANTE tiene reglas propias: es un documento por comprobante que cubre todo
  -- lo que no llegó, así que se registra cuando ya se sabe cuánto fue.
  if p_motivo = 'faltante' then
    if exists (select 1 from compra_notas_credito where compra_id = p_compra_id and motivo = 'faltante') then
      raise exception '%-% ya tiene su nota de crédito por faltante: es una sola por comprobante. Para otro concepto (devolución, descuento) elige ese motivo',
        v_c.serie, v_c.numero;
    end if;
    if v_c.cerrado_cantidad <= 0 then
      raise exception 'Una nota por faltante necesita al menos una línea cerrada por faltante en %-%: cierra primero lo que no llegó',
        v_c.serie, v_c.numero;
    end if;
    if v_c.recibido_cantidad + v_c.cerrado_cantidad < v_c.facturado_cantidad then
      raise exception '%-% todavía tiene % unidades sin resolver: recíbelas o ciérralas antes de registrar la nota por faltante',
        v_c.serie, v_c.numero, v_c.facturado_cantidad - v_c.recibido_cantidad - v_c.cerrado_cantidad;
    end if;
    select coalesce(sum(k.cantidad * i.costo_unitario), 0) into v_valor_cerrado
      from compra_item_cierres k join compra_items i on i.id = k.compra_item_id
      where i.compra_id = p_compra_id;
    v_tasa := case when v_c.subtotal > 0 then v_c.igv / v_c.subtotal else 0 end;
    v_tope := round(v_valor_cerrado * (1 + v_tasa), 2) + 1;
    if p_monto > v_tope then
      raise exception 'La nota por faltante (S/ %) supera lo que se cerró sin llegar, a su costo con IGV (S/ %)',
        p_monto, round(v_valor_cerrado * (1 + v_tasa), 2);
    end if;
  end if;

  -- Cuánto baja la deuda de ESTE comprobante y cuánto queda a favor del proveedor.
  v_aplicado := least(p_monto, greatest(v_c.saldo, 0));
  v_excedente := p_monto - v_aplicado;

  select coalesce(sum(igv), 0) into v_igv_previo from compra_notas_credito where compra_id = p_compra_id;
  v_igv := case
    when v_c.total > 0 then least(round(p_monto * v_c.igv / v_c.total, 2), greatest(v_c.igv - v_igv_previo, 0))
    else 0
  end;

  begin
    insert into compra_notas_credito (compra_id, cierre_id, serie_numero, fecha, subtotal, igv, monto, aplicado, motivo, nota, usuario_id)
      values (p_compra_id, p_cierre_id, v_serie, p_fecha, p_monto - v_igv, v_igv, p_monto, v_aplicado, p_motivo,
              nullif(trim(coalesce(p_nota, '')), ''), p_persona)
      returning id into v_id;
  exception
    when unique_violation then
      if sqlerrm like '%compra_notas_credito_faltante_unica%' then
        raise exception '%-% ya tiene su nota de crédito por faltante: es una sola por comprobante', v_c.serie, v_c.numero;
      end if;
      raise exception 'La nota de crédito % ya está registrada en el comprobante %-%', v_serie, v_c.serie, v_c.numero;
  end;

  if v_excedente > 0 then
    insert into proveedor_creditos (proveedor_id, tipo, monto, fecha, compra_id, nota_credito_id, usuario_id)
      values (v_c.proveedor_id, 'nota_credito', v_excedente, p_fecha, p_compra_id, v_id, p_persona);
  end if;

  return v_id;
end;
$$;

comment on function retail.fn_insertar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid, uuid) is
  'Interna (ADR-0106): valida e inserta una nota de crédito. Reglas de la nota por faltante: una por comprobante, con el comprobante resuelto al 100 %, con cierres y sin pasar de lo cerrado a su costo + IGV. Lo que no baja la deuda del comprobante (monto − saldo) se anota en proveedor_creditos como saldo a favor. El llamador ya bloqueó el comprobante y validó el permiso.';

-- ==================== 4. cerrar una línea: solo cierra ====================
drop function retail.cerrar_linea_compra(uuid, integer, text, text, jsonb);

create function retail.cerrar_linea_compra(
  p_compra_item_id uuid,
  p_cantidad integer,
  p_motivo text,                       -- no_llego | danada | error_proveedor
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_linea compra_items%rowtype;
  v_compra compras%rowtype;
  v_persona uuid;
  v_recibido bigint;
  v_cerrado bigint;
  v_pendiente bigint;
  v_cierre_id uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a cerrar debe ser mayor a cero';
  end if;
  if coalesce(p_motivo, '') not in ('no_llego', 'danada', 'error_proveedor') then
    raise exception 'Motivo de cierre no reconocido: %', coalesce(p_motivo, '(vacío)');
  end if;

  -- permiso antes de bloquear nada
  select * into v_linea from compra_items where id = p_compra_item_id;
  if not found then
    raise exception 'La línea de comprobante % no existe', p_compra_item_id;
  end if;
  select * into v_compra from compras where id = v_linea.compra_id;
  if not fn_puede_operar_ubicacion(v_compra.ubicacion_destino_id) then
    raise exception 'No tienes permiso para cerrar líneas de este comprobante';
  end if;

  -- candados: línea y después comprobante (mismo orden que recibir_compras)
  select * into v_linea from compra_items where id = p_compra_item_id for update;
  select * into v_compra from compras where id = v_linea.compra_id for update;
  if v_compra.estado <> 'vigente' then
    raise exception 'El comprobante %-% está anulado, no acepta cierres', v_compra.serie, v_compra.numero;
  end if;

  select coalesce(sum(cantidad), 0) into v_recibido from movimientos where compra_item_id = v_linea.id;
  select coalesce(sum(cantidad), 0) into v_cerrado from compra_item_cierres where compra_item_id = v_linea.id;
  v_pendiente := v_linea.cantidad - v_recibido - v_cerrado;
  if v_pendiente <= 0 then
    raise exception 'La línea ya no tiene unidades pendientes: no hay nada que cerrar';
  end if;
  if p_cantidad > v_pendiente then
    raise exception 'La línea tiene % unidades pendientes: no se pueden cerrar %', v_pendiente, p_cantidad;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into compra_item_cierres (compra_item_id, cantidad, motivo, nota, usuario_id)
    values (v_linea.id, p_cantidad, p_motivo, nullif(trim(coalesce(p_nota, '')), ''), v_persona)
    returning id into v_cierre_id;

  return v_cierre_id;
end;
$$;

comment on function retail.cerrar_linea_compra(uuid, integer, text, text) is
  'Cierra unidades pendientes de una línea de comprobante: «no van a llegar» (ADR-0106 D2). p_cantidad <= pendiente (cantidad - recibido - cerrado). Solo cierra: la nota de crédito se registra aparte (registrar_nota_credito_compra) o junto con la recepción (recibir_y_cerrar_compras), porque es una por comprobante. No toca stock. Devuelve el id del cierre.';

revoke all on function retail.cerrar_linea_compra(uuid, integer, text, text) from public, anon;
grant execute on function retail.cerrar_linea_compra(uuid, integer, text, text) to authenticated;

comment on function retail.registrar_nota_credito_compra(uuid, text, date, numeric, text, text, uuid) is
  'Registra una nota de crédito del proveedor contra un comprobante (ADR-0106 D2). Solo líder. La deuda del comprobante baja min(monto, saldo); lo que sobre queda como saldo a favor del proveedor. Nota por faltante: una por comprobante, con el comprobante resuelto al 100 %. motivo: faltante | devolucion | descuento | otro.';
