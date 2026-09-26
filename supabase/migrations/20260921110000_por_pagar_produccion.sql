-- ============================================================================
-- 20260921110000_por_pagar_produccion.sql — CAYLA V2 (ADR-0133, F4c; decisión D-I)
--
-- PROBLEMA. F4b registra el comprobante del proveedor de tela y, si es al contado, su pago. Pero
-- casi toda la tela se compra a CRÉDITO: el comprobante queda debiendo y hace falta (a) pagarlo
-- después —entero o en partes, con uno o varios medios— sin poder pasarse del saldo ni pagar dos
-- veces por un reintento, y (b) saber cuánto debe CAYLA en total. Hoy esa segunda pregunta exige
-- sumar a mano la pantalla de Por pagar de Compras y la de Producción, y el IGV que se puede
-- descontar (crédito fiscal) queda partido en dos libros.
--
-- QUÉ HACE.
--  1. `comprobantes_produccion_pagos.grupo_id` — agrupa los medios de UN mismo acto de pago
--     (una transferencia + un efectivo son un pago) y, a la vez, es la llave de idempotencia.
--  2. `registrar_pago_comprobante_produccion(comprobante, pagos, fecha, token)` — el pago
--     posterior. Bloquea el comprobante (`for update`, para que dos pagos simultáneos no se
--     pasen), exige que esté vigente, valida cada medio igual que el pago al contado de F4b
--     (monto > 0 con máx. 2 decimales, medio conocido, fecha ni futura ni anterior a la
--     emisión) y **nunca deja pagar más que el saldo**. El mismo `p_token` devuelve el pago
--     que ya se hizo sin repetirlo.
--  3. D-I — el consolidado, de SOLO LECTURA y solo para el líder:
--       · `fn_deuda_consolidada()` — cuánto se debe a cada proveedor, de Compras y de Producción,
--         cuánto de eso ya venció y la próxima fecha de vencimiento.
--       · `fn_igv_credito_fiscal(mes)` — el IGV de los comprobantes del mes (por fecha de emisión,
--         vigentes) de los dos libros, menos el IGV de las notas de crédito de Compras.
--     Leen `compras` y `compra_notas_credito` (Compras) sin modificarlas: son dos libros que se
--     SUMAN en una lectura, no un libro nuevo. Un solo lugar donde ver «cuánto debe CAYLA».
--
-- QUÉ NO HACE. No paga varios comprobantes de un golpe (el «pagar juntos» de Compras, ADR-0132,
-- queda para cuando haga falta), no genera el registro de compras de SUNAT, y no toca los
-- pagos que ya existen (`grupo_id` de los de F4b queda nulo: son de antes del agrupamiento).
--
-- SE ROMPE SI: `compras.saldo` deja de ser `total − pagado − notas_credito` (columna generada) o
-- se renombra `compra_notas_credito.igv`; las dos lecturas del consolidado dependen de eso.
--
-- ESTADO: solo local hasta que Felipe la pegue en producción (prefijo `retail.` ya incluido).
-- Idempotente. Depende de F4b (`20260921100000`, ya en producción).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. agrupar los medios de un mismo pago ----------
alter table retail.comprobantes_produccion_pagos add column if not exists grupo_id uuid;

comment on column retail.comprobantes_produccion_pagos.grupo_id is
  'Un acto de pago con varios medios (transferencia + efectivo) comparte grupo_id; también es la llave de idempotencia de registrar_pago_comprobante_produccion. Nulo en los pagos al contado de F4b.';

create index if not exists comprobantes_produccion_pagos_grupo_idx on retail.comprobantes_produccion_pagos (grupo_id) where grupo_id is not null;

-- ---------- 2. el pago posterior ----------
create or replace function retail.registrar_pago_comprobante_produccion(
  p_comprobante_id uuid,
  p_pagos jsonb,
  p_fecha date default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_fecha date := coalesce(p_fecha, v_hoy);
  v_c retail.comprobantes_produccion%rowtype;
  v_pago jsonb; v_monto numeric; v_suma numeric(12, 2) := 0;
  v_pagado numeric(12, 2); v_saldo numeric(12, 2);
  v_grupo uuid := coalesce(p_token, gen_random_uuid());
  v_persona uuid;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede registrar pagos de Producción.' using errcode = '42501';
  end if;
  -- Reintento honesto: el primer envío sí llegó. Se devuelve el pago que ya existe sin repetirlo.
  if p_token is not null and exists (select 1 from retail.comprobantes_produccion_pagos where grupo_id = p_token) then
    return p_token;
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'El pago necesita al menos un medio con su monto.';
  end if;

  select * into v_c from retail.comprobantes_produccion where id = p_comprobante_id for update;
  if not found then
    raise exception 'Ese comprobante no existe. Recarga la pantalla.';
  end if;
  if v_c.estado <> 'vigente' then
    raise exception 'Ese comprobante está anulado: no admite pagos.';
  end if;
  if v_fecha > v_hoy then
    raise exception 'La fecha del pago (%) no puede ser futura: hoy es %.', to_char(v_fecha, 'DD/MM/YYYY'), to_char(v_hoy, 'DD/MM/YYYY');
  end if;
  if v_fecha < least(v_c.fecha_emision, v_hoy) then
    raise exception 'La fecha del pago (%) es anterior a la emisión del comprobante % (%).', to_char(v_fecha, 'DD/MM/YYYY'), v_c.serie || '-' || v_c.numero, to_char(v_c.fecha_emision, 'DD/MM/YYYY');
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
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
    v_suma := v_suma + v_monto;
  end loop;

  -- El saldo se calcula con el comprobante bloqueado: dos pagos simultáneos se hacen la cola y el segundo ve el saldo real.
  select coalesce(sum(monto), 0) into v_pagado from retail.comprobantes_produccion_pagos where comprobante_id = p_comprobante_id;
  v_saldo := v_c.total - v_pagado;
  if v_saldo <= 0 then
    raise exception 'Ese comprobante ya está pagado por completo.';
  end if;
  if v_suma > v_saldo then
    raise exception 'El pago (S/ %) supera el saldo del comprobante (S/ %).', v_suma, v_saldo;
  end if;

  select id into v_persona from public.personas where auth_user_id = auth.uid();
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into retail.comprobantes_produccion_pagos (comprobante_id, fecha, monto, metodo, referencia, usuario_id, grupo_id)
    values (p_comprobante_id, v_fecha, (v_pago ->> 'monto')::numeric, v_pago ->> 'metodo', nullif(btrim(coalesce(v_pago ->> 'referencia', '')), ''), v_persona, v_grupo);
  end loop;
  return v_grupo;
end;
$$;

comment on function retail.registrar_pago_comprobante_produccion(uuid, jsonb, date, uuid) is
  'Pago posterior de un comprobante de Producción, con uno o varios medios. Solo líder. Bloquea el comprobante, nunca supera el saldo, valida fechas y es idempotente por token (grupo_id).';

-- ---------- 3. D-I: deuda consolidada de los dos libros ----------
create or replace function retail.fn_deuda_consolidada()
returns table (origen text, proveedor_id uuid, proveedor text, comprobantes bigint, saldo numeric, vencido numeric, proximo_vencimiento date)
language sql stable security definer set search_path = retail, public, extensions as $$
  select 'compras'::text, p.id, p.nombre, count(*), sum(c.saldo),
         coalesce(sum(c.saldo) filter (where c.condicion = 'credito' and c.fecha_vencimiento < retail.fn_hoy_lima()), 0),
         min(c.fecha_vencimiento) filter (where c.condicion = 'credito')
  from retail.compras c join retail.proveedores p on p.id = c.proveedor_id
  where retail.fn_es_lider() and c.estado = 'vigente' and c.saldo > 0
  group by p.id, p.nombre
  union all
  select 'produccion'::text, p.id, p.nombre, count(*), sum(x.total - x.pagado),
         coalesce(sum(x.total - x.pagado) filter (where x.condicion = 'credito' and x.fecha_vencimiento < retail.fn_hoy_lima()), 0),
         min(x.fecha_vencimiento) filter (where x.condicion = 'credito')
  from (
    select c.*, coalesce((select sum(g.monto) from retail.comprobantes_produccion_pagos g where g.comprobante_id = c.id), 0) as pagado
    from retail.comprobantes_produccion c where c.estado = 'vigente'
  ) x join retail.proveedores_produccion p on p.id = x.proveedor_id
  where retail.fn_es_lider() and x.total - x.pagado > 0
  group by p.id, p.nombre
  order by 5 desc;
$$;

comment on function retail.fn_deuda_consolidada() is
  'D-I: cuánto se debe a cada proveedor, de Compras y de Producción, cuánto ya venció y la próxima fecha de vencimiento. Solo lectura, solo líder (cero filas para quien no lo es).';

create or replace function retail.fn_igv_credito_fiscal(p_mes date default null)
returns table (mes date, igv_compras numeric, igv_produccion numeric, igv_notas_credito numeric, igv_neto numeric)
language sql stable security definer set search_path = retail, public, extensions as $$
  with m as (select date_trunc('month', coalesce(p_mes, retail.fn_hoy_lima()))::date as ini),
  c as (select coalesce(sum(igv), 0) as v from retail.compras, m where estado = 'vigente' and fecha_emision >= m.ini and fecha_emision < m.ini + interval '1 month'),
  pr as (select coalesce(sum(igv), 0) as v from retail.comprobantes_produccion, m where estado = 'vigente' and fecha_emision >= m.ini and fecha_emision < m.ini + interval '1 month'),
  nc as (select coalesce(sum(n.igv), 0) as v from retail.compra_notas_credito n join retail.compras k on k.id = n.compra_id, m
         where k.estado = 'vigente' and n.fecha >= m.ini and n.fecha < m.ini + interval '1 month')
  select m.ini, c.v, pr.v, nc.v, c.v + pr.v - nc.v from m, c, pr, nc where retail.fn_es_lider();
$$;

comment on function retail.fn_igv_credito_fiscal(date) is
  'D-I: IGV de los comprobantes vigentes del mes (por fecha de emisión) de Compras y de Producción, menos el IGV de las notas de crédito de Compras del mes. Solo lectura, solo líder.';

-- ---------- 4. permisos ----------
revoke all on function retail.registrar_pago_comprobante_produccion(uuid, jsonb, date, uuid) from public, anon;
grant execute on function retail.registrar_pago_comprobante_produccion(uuid, jsonb, date, uuid) to authenticated;
revoke all on function retail.fn_deuda_consolidada() from public, anon;
grant execute on function retail.fn_deuda_consolidada() to authenticated;
revoke all on function retail.fn_igv_credito_fiscal(date) from public, anon;
grant execute on function retail.fn_igv_credito_fiscal(date) to authenticated;
