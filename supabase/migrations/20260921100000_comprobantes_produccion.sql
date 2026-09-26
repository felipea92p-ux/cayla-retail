-- ============================================================================
-- 20260921100000_comprobantes_produccion.sql — CAYLA V2 (ADR-0133, F4b; decisión D-H)
--
-- PROBLEMA. Hoy el Taller mete tela y avíos con `recibir_insumo`, tecleando "cuánto costó" a
-- mano: no hay un documento detrás. La factura del proveedor de tela —el papel que dice qué
-- se compró, a qué precio, con cuánto IGV y para cuándo hay que pagarla— no existe en el
-- sistema, y por eso nadie sabe cuánto se le debe a quién ni si un precio subió. En Compras
-- eso lo resuelve la factura de compra (ADR-0035); Felipe decidió (D-H) que Producción tenga
-- **la suya, propia**, sin tocar la de Compras.
--
-- QUÉ HACE. Tres tablas y las RPC que las escriben, con las MISMAS reglas duras de ADR-0035:
--   · `comprobantes_produccion` — la factura/boleta/nota de venta del proveedor de Producción
--     (`proveedores_produccion`, F4a): serie-número único por proveedor, contado o crédito,
--     subtotal + IGV = total (CHECK), IGV solo en facturas.
--   · `comprobantes_produccion_items` — sus líneas: un insumo del catálogo (o un concepto libre,
--     para maquila y servicios), cantidad y costo unitario SIN IGV. `subtotal` se deriva.
--   · `comprobantes_produccion_pagos` — lo pagado (uno o varios medios). El saldo NUNCA se guarda:
--     se deriva (`fn_comprobantes_produccion`), así no puede desincronizarse (principio 4).
--
--   · `registrar_comprobante_produccion` — **contado ⇒ pago obligatorio en la misma transacción**
--     y por el total exacto; crédito ⇒ vencimiento obligatorio y pago opcional; idempotente por
--     `p_token`; el subtotal sale de las líneas y el total del papel se cuadra con tolerancia de
--     redondeo (0,01 por línea + 0,01).
--   · `anular_comprobante_produccion` — con motivo, y nunca si ya hay pagos (anular dejaría dinero
--     sin respaldo; mismo criterio que `anular_compra`). Se anula, jamás se borra.
--   · `fn_comprobantes_produccion(p_limite)` — la lista con `pagado`, `saldo`, `estado_pago` y
--     `vencido` derivados. La reutilizarán Por pagar (F4c) y Recibir (F4d).
--
-- DINERO SOLO DEL LÍDER (D-G, ADR-0126): las tres tablas nacen con RLS de solo-líder para leer y
-- SIN grants de escritura; toda escritura pasa por las RPC (que exigen `fn_es_lider()`).
--
-- QUÉ NO HACE (a propósito, cada cosa es una fase): NO abre lotes ni sube el saldo de insumos
-- (eso es recibir, F4d: "la factura dice qué se compró; el lote dice qué llegó"); NO registra pagos
-- posteriores (F4c); NO toca Compras (`compras`, `compra_items`, `compra_pagos`, `registrar_compra`)
-- ni los medios de pago de Compras.
--
-- SE ROMPE SI: `retail.fn_es_lider()` cambia de significado, o si F4d agrega el vínculo
-- lote↔línea y `anular_comprobante_produccion` no se actualiza para negar la anulación de un
-- comprobante con mercadería recibida (queda anotado en el PLAN, F4d).
--
-- ESTADO: solo local hasta que Felipe la pegue en producción (prefijo `retail.` ya incluido).
-- Idempotente. Tablas nuevas: al pegarla entran al diccionario (`docs/datos/generado/`).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. el comprobante ----------
create table if not exists retail.comprobantes_produccion (
  id                uuid primary key default gen_random_uuid(),
  proveedor_id      uuid not null references retail.proveedores_produccion (id),
  tipo              text not null default 'factura' check (tipo in ('factura', 'boleta', 'nota_venta')),
  serie             text not null check (char_length(btrim(serie)) > 0),
  numero            text not null check (char_length(btrim(numero)) > 0),
  fecha_emision     date not null default current_date,
  condicion         text not null check (condicion in ('contado', 'credito')),
  fecha_vencimiento date,
  subtotal          numeric(12, 2) not null check (subtotal >= 0),
  igv               numeric(12, 2) not null check (igv >= 0),
  total             numeric(12, 2) not null check (total >= 0),
  estado            text not null default 'vigente' check (estado in ('vigente', 'anulada')),
  motivo_anulacion  text,
  nota              text,
  usuario_id        uuid references public.personas (id),
  token_cliente     uuid unique,
  created_at        timestamptz not null default now(),
  constraint comprobantes_produccion_serie_numero_unico unique (proveedor_id, serie, numero),
  constraint comprobantes_produccion_total_cuadra check (total = subtotal + igv),
  constraint comprobantes_produccion_igv_solo_factura check (tipo = 'factura' or igv = 0),
  constraint comprobantes_produccion_credito_con_vencimiento check (condicion = 'contado' or fecha_vencimiento is not null),
  constraint comprobantes_produccion_anulada_con_motivo check (estado = 'vigente' or (motivo_anulacion is not null and char_length(btrim(motivo_anulacion)) > 0))
);

comment on table retail.comprobantes_produccion is
  'Factura/boleta/nota de venta de un proveedor de PRODUCCIÓN (D-H, ADR-0133). Solo-líder. Escritura solo por registrar_/anular_comprobante_produccion. Pagado y saldo se DERIVAN (fn_comprobantes_produccion), nunca se guardan.';
comment on column retail.comprobantes_produccion.subtotal is 'Suma de las líneas, sin IGV.';

create index if not exists comprobantes_produccion_proveedor_idx on retail.comprobantes_produccion (proveedor_id, fecha_emision desc);
create index if not exists comprobantes_produccion_vencimiento_idx on retail.comprobantes_produccion (fecha_vencimiento) where estado = 'vigente' and condicion = 'credito';

-- ---------- 2. las líneas ----------
create table if not exists retail.comprobantes_produccion_items (
  id             uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references retail.comprobantes_produccion (id),
  insumo_id      uuid references retail.insumos (id),
  descripcion    text,
  cantidad       numeric(12, 3) not null check (cantidad > 0),
  costo_unitario numeric(12, 4) not null check (costo_unitario >= 0),
  subtotal       numeric(12, 2) generated always as (round(cantidad * costo_unitario, 2)) stored,
  -- Una línea es un insumo del catálogo (recibible en F4d) o un concepto libre (maquila, flete, servicio).
  constraint comprobantes_produccion_items_insumo_o_concepto check (insumo_id is not null or (descripcion is not null and char_length(btrim(descripcion)) > 0))
);

comment on table retail.comprobantes_produccion_items is
  'Líneas de un comprobante de Producción: un insumo del catálogo o un concepto libre. Costo unitario SIN IGV. Inmutables.';

create index if not exists comprobantes_produccion_items_comprobante_idx on retail.comprobantes_produccion_items (comprobante_id);
create index if not exists comprobantes_produccion_items_insumo_idx on retail.comprobantes_produccion_items (insumo_id) where insumo_id is not null;

-- ---------- 3. los pagos ----------
create table if not exists retail.comprobantes_produccion_pagos (
  id             uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references retail.comprobantes_produccion (id),
  fecha          date not null default current_date,
  monto          numeric(12, 2) not null check (monto > 0),
  metodo         text not null check (metodo in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro')),
  referencia     text,
  usuario_id     uuid references public.personas (id),
  created_at     timestamptz not null default now()
);

comment on table retail.comprobantes_produccion_pagos is
  'Pagos de un comprobante de Producción (uno o varios medios). Solo se agregan: no se editan ni se borran. Salen de la cuenta de la empresa, no de la caja de una tienda.';

create index if not exists comprobantes_produccion_pagos_comprobante_idx on retail.comprobantes_produccion_pagos (comprobante_id);

-- Líneas y pagos son un libro: nadie los edita ni los borra, ni siquiera con permisos de sobra.
create or replace function retail.fn_comprobantes_produccion_libro_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Las líneas y los pagos de un comprobante de Producción no se editan ni se borran' using errcode = '42501';
end;
$$;

drop trigger if exists comprobantes_produccion_items_inmutable on retail.comprobantes_produccion_items;
create trigger comprobantes_produccion_items_inmutable
  before update or delete on retail.comprobantes_produccion_items
  for each row execute function retail.fn_comprobantes_produccion_libro_inmutable();

drop trigger if exists comprobantes_produccion_pagos_inmutable on retail.comprobantes_produccion_pagos;
create trigger comprobantes_produccion_pagos_inmutable
  before update or delete on retail.comprobantes_produccion_pagos
  for each row execute function retail.fn_comprobantes_produccion_libro_inmutable();

-- ---------- 4. RLS: solo-líder para leer; ningún grant de escritura ----------
alter table retail.comprobantes_produccion enable row level security;
alter table retail.comprobantes_produccion_items enable row level security;
alter table retail.comprobantes_produccion_pagos enable row level security;

drop policy if exists comprobantes_produccion_select_lider on retail.comprobantes_produccion;
create policy comprobantes_produccion_select_lider on retail.comprobantes_produccion for select using (retail.fn_es_lider());
drop policy if exists comprobantes_produccion_items_select_lider on retail.comprobantes_produccion_items;
create policy comprobantes_produccion_items_select_lider on retail.comprobantes_produccion_items for select using (retail.fn_es_lider());
drop policy if exists comprobantes_produccion_pagos_select_lider on retail.comprobantes_produccion_pagos;
create policy comprobantes_produccion_pagos_select_lider on retail.comprobantes_produccion_pagos for select using (retail.fn_es_lider());

revoke all on retail.comprobantes_produccion, retail.comprobantes_produccion_items, retail.comprobantes_produccion_pagos from public, anon, authenticated;
grant select on retail.comprobantes_produccion, retail.comprobantes_produccion_items, retail.comprobantes_produccion_pagos to authenticated;
grant all on retail.comprobantes_produccion, retail.comprobantes_produccion_items, retail.comprobantes_produccion_pagos to service_role;

-- ---------- 5. registrar ----------
create or replace function retail.registrar_comprobante_produccion(
  p_proveedor_id uuid,
  p_serie text,
  p_numero text,
  p_condicion text,
  p_items jsonb,
  p_tipo text default 'factura',
  p_fecha_emision date default null,
  p_fecha_vencimiento date default null,
  p_igv_porcentaje numeric default 18,
  p_pago jsonb default null,
  p_nota text default null,
  p_total numeric default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_emision date := coalesce(p_fecha_emision, v_hoy);
  v_serie text := upper(btrim(coalesce(p_serie, '')));
  v_numero text := btrim(coalesce(p_numero, ''));
  v_item jsonb; v_n integer := 0;
  v_insumo uuid; v_cant numeric; v_costo numeric; v_desc text;
  v_subtotal numeric(12, 2) := 0; v_igv numeric(12, 2); v_total numeric(12, 2);
  v_tolerancia numeric;
  v_pagos jsonb; v_pago jsonb; v_monto numeric; v_fecha_pago date; v_suma numeric(12, 2) := 0;
  v_persona uuid; v_id uuid; v_existente uuid;
  v_constraint text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede registrar comprobantes de Producción.' using errcode = '42501';
  end if;
  if p_token is not null then
    select id into v_existente from retail.comprobantes_produccion where token_cliente = p_token;
    if found then return v_existente; end if;  -- reintento honesto: el primer envío sí llegó
  end if;
  if not exists (select 1 from retail.proveedores_produccion where id = p_proveedor_id) then
    raise exception 'Ese proveedor no existe en el directorio de Producción.';
  end if;
  if p_tipo not in ('factura', 'boleta', 'nota_venta') then
    raise exception 'El tipo debe ser factura, boleta o nota de venta.';
  end if;
  if v_serie = '' or v_numero = '' then
    raise exception 'El comprobante necesita serie y número.';
  end if;
  if p_condicion not in ('contado', 'credito') then
    raise exception 'La condición debe ser contado o crédito.';
  end if;
  if v_emision > v_hoy then
    raise exception 'La fecha de emisión (%) no puede ser futura: hoy es %.', to_char(v_emision, 'DD/MM/YYYY'), to_char(v_hoy, 'DD/MM/YYYY');
  end if;
  if p_condicion = 'credito' and p_fecha_vencimiento is null then
    raise exception 'Un comprobante al crédito necesita fecha de vencimiento.';
  end if;
  if p_condicion = 'credito' and p_fecha_vencimiento < v_emision then
    raise exception 'El vencimiento no puede ser anterior a la emisión.';
  end if;
  if p_condicion = 'contado' and p_pago is null then
    raise exception 'Un comprobante al contado se registra con su pago.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Un comprobante necesita al menos una línea.';
  end if;

  -- Líneas: cada una es un insumo del catálogo o un concepto libre; el subtotal es la suma de lo redondeado por línea.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;
    v_insumo := nullif(v_item ->> 'insumo_id', '')::uuid;
    v_desc := nullif(btrim(coalesce(v_item ->> 'descripcion', '')), '');
    v_cant := (v_item ->> 'cantidad')::numeric;
    v_costo := (v_item ->> 'costo_unitario')::numeric;
    if v_insumo is null and v_desc is null then
      raise exception 'La línea %: elige un insumo del catálogo o escribe qué se compró.', v_n;
    end if;
    if v_insumo is not null and not exists (select 1 from retail.insumos where id = v_insumo and archivado_at is null) then
      raise exception 'La línea %: ese insumo no existe o está archivado.', v_n;
    end if;
    if v_cant is null or v_cant <= 0 then
      raise exception 'La línea %: la cantidad tiene que ser mayor a cero.', v_n;
    end if;
    if v_costo is null or v_costo < 0 then
      raise exception 'La línea %: el costo unitario no puede ser negativo.', v_n;
    end if;
    v_subtotal := v_subtotal + round(v_cant * v_costo, 2);
  end loop;

  v_igv := case when p_tipo = 'factura' then round(v_subtotal * coalesce(p_igv_porcentaje, 0) / 100, 2) else 0 end;
  v_total := v_subtotal + v_igv;

  -- El total impreso en el papel: se cuadra contra las líneas con tolerancia de redondeo (el proveedor redondea por línea).
  if p_total is not null then
    if p_total < 0 then
      raise exception 'El total no puede ser negativo.';
    end if;
    v_tolerancia := 0.01 * (jsonb_array_length(p_items) + 1);
    if abs(p_total - v_total) > v_tolerancia then
      raise exception 'El total del documento (S/ %) no cuadra con sus líneas (S/ %): revisa cantidades y costos.', p_total, v_total;
    end if;
    if p_tipo <> 'factura' and p_total <> v_subtotal then
      raise exception 'Sin IGV el total tiene que ser igual a la suma de las líneas (S/ %), llegó S/ %.', v_subtotal, p_total;
    end if;
    v_total := p_total;
    v_igv := p_total - v_subtotal;
  end if;

  -- Pago: uno o varios medios; al contado suma EXACTAMENTE el total.
  if p_pago is not null then
    if jsonb_typeof(p_pago) = 'object' then
      v_pagos := jsonb_build_array(p_pago);
    elsif jsonb_typeof(p_pago) = 'array' and jsonb_array_length(p_pago) > 0 then
      v_pagos := p_pago;
    else
      raise exception 'El pago necesita al menos un medio con su monto.';
    end if;
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      v_monto := (v_pago ->> 'monto')::numeric;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero.';
      end if;
      if v_monto <> round(v_monto, 2) then
        raise exception 'Los montos del pago admiten como máximo 2 decimales (llegó %).', v_monto;
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
        raise exception 'Medio de pago no reconocido: %.', coalesce(v_pago ->> 'metodo', '(vacío)');
      end if;
      v_fecha_pago := coalesce(nullif(v_pago ->> 'fecha', '')::date, v_hoy);
      if v_fecha_pago > v_hoy then
        raise exception 'La fecha del pago (%) no puede ser futura: hoy es %.', to_char(v_fecha_pago, 'DD/MM/YYYY'), to_char(v_hoy, 'DD/MM/YYYY');
      end if;
      if v_fecha_pago < least(v_emision, v_hoy) then
        raise exception 'La fecha del pago (%) es anterior a la emisión del comprobante % (%).', to_char(v_fecha_pago, 'DD/MM/YYYY'), v_serie || '-' || v_numero, to_char(v_emision, 'DD/MM/YYYY');
      end if;
      v_suma := v_suma + v_monto;
    end loop;
    if p_condicion = 'contado' and v_suma <> v_total then
      raise exception 'Al contado el pago debe ser el total del comprobante (S/ %), se recibió S/ %.', v_total, v_suma;
    end if;
    if v_suma > v_total then
      raise exception 'El pago (S/ %) supera el total del comprobante (S/ %).', v_suma, v_total;
    end if;
  end if;

  select id into v_persona from public.personas where auth_user_id = auth.uid();

  insert into retail.comprobantes_produccion (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento, subtotal, igv, total, nota, usuario_id, token_cliente)
  values (p_proveedor_id, p_tipo, v_serie, v_numero, v_emision, p_condicion, case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
          v_subtotal, v_igv, v_total, retail.fn_texto_o_null(p_nota), v_persona, p_token)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into retail.comprobantes_produccion_items (comprobante_id, insumo_id, descripcion, cantidad, costo_unitario)
    values (v_id, nullif(v_item ->> 'insumo_id', '')::uuid, nullif(btrim(coalesce(v_item ->> 'descripcion', '')), ''), (v_item ->> 'cantidad')::numeric, (v_item ->> 'costo_unitario')::numeric);
  end loop;

  if v_pagos is not null then
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      insert into retail.comprobantes_produccion_pagos (comprobante_id, fecha, monto, metodo, referencia, usuario_id)
      values (v_id, coalesce(nullif(v_pago ->> 'fecha', '')::date, v_hoy), (v_pago ->> 'monto')::numeric, v_pago ->> 'metodo', nullif(btrim(coalesce(v_pago ->> 'referencia', '')), ''), v_persona);
    end loop;
  end if;

  return v_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'comprobantes_produccion_token_cliente_key' then
      select id into v_existente from retail.comprobantes_produccion where token_cliente = p_token;
      if found then return v_existente; end if;
    end if;
    raise exception 'El comprobante %-% de este proveedor ya está registrado.', v_serie, v_numero;
end;
$$;

comment on function retail.registrar_comprobante_produccion(uuid, text, text, text, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid) is
  'Registra un comprobante de un proveedor de Producción con sus líneas (y su pago). Solo líder. Contado exige pago por el total exacto; crédito exige vencimiento. Idempotente por token. No abre lotes (eso es recibir, F4d).';

-- ---------- 6. anular ----------
create or replace function retail.anular_comprobante_produccion(p_comprobante_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.comprobantes_produccion%rowtype;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede anular comprobantes de Producción.' using errcode = '42501';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Anular un comprobante necesita un motivo.';
  end if;
  select * into v_c from retail.comprobantes_produccion where id = p_comprobante_id for update;
  if not found then
    raise exception 'Ese comprobante no existe. Recarga la pantalla.';
  end if;
  if v_c.estado = 'anulada' then
    return;
  end if;
  -- Con pagos, anular dejaría dinero sin respaldo.
  if exists (select 1 from retail.comprobantes_produccion_pagos where comprobante_id = p_comprobante_id) then
    raise exception 'El comprobante tiene pagos registrados: no se puede anular.';
  end if;
  update retail.comprobantes_produccion set estado = 'anulada', motivo_anulacion = btrim(p_motivo) where id = p_comprobante_id;
end;
$$;

comment on function retail.anular_comprobante_produccion(uuid, text) is
  'Anula (nunca borra) un comprobante de Producción, con motivo y solo si no tiene pagos. Solo líder.';

-- ---------- 7. lectura con lo derivado ----------
create or replace function retail.fn_comprobantes_produccion(p_limite integer default 200)
returns table (
  id uuid, proveedor_id uuid, proveedor text, tipo text, serie text, numero text, fecha_emision date, condicion text, fecha_vencimiento date,
  subtotal numeric, igv numeric, total numeric, estado text, motivo_anulacion text, nota text, created_at timestamptz,
  lineas bigint, pagado numeric, saldo numeric, estado_pago text, vencido boolean
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select c.id, c.proveedor_id, p.nombre, c.tipo, c.serie, c.numero, c.fecha_emision, c.condicion, c.fecha_vencimiento,
         c.subtotal, c.igv, c.total, c.estado, c.motivo_anulacion, c.nota, c.created_at,
         (select count(*) from retail.comprobantes_produccion_items i where i.comprobante_id = c.id) as lineas,
         coalesce(pg.pagado, 0) as pagado,
         case when c.estado = 'anulada' then 0 else c.total - coalesce(pg.pagado, 0) end as saldo,
         case when c.estado = 'anulada' then 'anulada' when coalesce(pg.pagado, 0) >= c.total then 'pagada' when coalesce(pg.pagado, 0) > 0 then 'parcial' else 'pendiente' end as estado_pago,
         (c.estado = 'vigente' and c.condicion = 'credito' and c.total - coalesce(pg.pagado, 0) > 0 and c.fecha_vencimiento < retail.fn_hoy_lima()) as vencido
  from retail.comprobantes_produccion c
  join retail.proveedores_produccion p on p.id = c.proveedor_id
  left join lateral (select sum(monto) as pagado from retail.comprobantes_produccion_pagos x where x.comprobante_id = c.id) pg on true
  where retail.fn_es_lider()
  order by c.fecha_emision desc, c.created_at desc
  limit greatest(coalesce(p_limite, 200), 1);
$$;

comment on function retail.fn_comprobantes_produccion(integer) is
  'Lista de comprobantes de Producción con lo DERIVADO: pagado, saldo, estado_pago y vencido. Solo líder (cero filas para quien no lo es).';

-- ---------- 8. permisos ----------
revoke all on function retail.fn_comprobantes_produccion_libro_inmutable() from public, anon, authenticated;
revoke all on function retail.registrar_comprobante_produccion(uuid, text, text, text, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid) from public, anon;
grant execute on function retail.registrar_comprobante_produccion(uuid, text, text, text, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid) to authenticated;
revoke all on function retail.anular_comprobante_produccion(uuid, text) from public, anon;
grant execute on function retail.anular_comprobante_produccion(uuid, text) to authenticated;
revoke all on function retail.fn_comprobantes_produccion(integer) from public, anon;
grant execute on function retail.fn_comprobantes_produccion(integer) to authenticated;
