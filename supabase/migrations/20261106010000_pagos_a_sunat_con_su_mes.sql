-- ============================================================================
-- 20261106010000 — Cada pago a SUNAT dice de qué mes es y qué paga (tarea 10 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. `movimientos_dinero` no tiene mes ni concepto, y `pago_sunat` asentaba todo a la 4011 aunque llevara renta. El mes nunca pasaba a pagado, «Pagas» seguía con «Falta»,
-- la renta pagada como gasto bajaba la utilidad, y tras el primer pago la fila 4011 del Balance salía «revisar» culpando a las ventas sin boleta. El primer vencimiento es a mediados de noviembre.
--
-- LA DECISIÓN. Una tabla hija, `impuestos_pagos`: un pago del banco puede cubrir IGV y renta, y cada línea dice su mes y su concepto. `registrar_pago_sunat` guarda el movimiento y sus líneas juntos.
-- El IGV baja la 4011; la renta va a la 4017. Un `pago_sunat` viejo, sin líneas, sigue contando como antes. Anular el movimiento anula sus líneas (se leen solo con el movimiento vigente).
-- La proyección resta lo pagado de ese mes; la comprobación de la 4011 resta los pagos; la propuesta de arranque sugiere la 4011 desde `saldo_favor_igv`.
--
-- SUPUESTOS PARA EL CONTADOR: la renta a cuenta va a la 4017 sin provisión, así que queda en negativo como pago adelantado. El vencimiento sigue siendo el día 15 como punto medio: el cronograma
-- por último dígito del RUC necesita el RUC y la tabla de SUNAT de cada año, y se hace cuando se confirme.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Crea una tabla sin políticas (RLS encendido, se lee solo por funciones `security definer`, ADR-0195), y reescribe cuatro funciones desde su definición
-- viva; si un ancla no aparece exactamente las veces esperadas, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:pago-planilla-y-sunat`, `pruebas:balance` y `pruebas:flujo-caja`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

create table if not exists retail.impuestos_pagos (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references retail.movimientos_dinero (id),
  mes date not null check (mes = date_trunc('month', mes)::date),
  concepto text not null check (concepto in ('igv', 'renta')),
  monto numeric(12,2) not null check (monto > 0),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  unique (movimiento_id, mes, concepto)
);
alter table retail.impuestos_pagos enable row level security;
comment on table retail.impuestos_pagos is
  'Tarea 10: de qué mes y concepto es cada pago a SUNAT. Sus líneas suman el movimiento. Se lee solo con el movimiento vigente: anularlo anula sus líneas.';
create index if not exists impuestos_pagos_mes on retail.impuestos_pagos (mes);

create or replace function retail.registrar_pago_sunat(p_cuenta_id uuid, p_fecha date, p_lineas jsonb, p_referencia text default null, p_token uuid default null)
returns uuid
language plpgsql security definer
set search_path = retail, public, extensions
as $$
declare
  v_total numeric;
  v_mov uuid;
  v_actor uuid;
begin
  perform retail.fn_exigir_lider_dinero('Registrar un pago a SUNAT');
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Di de qué mes es el pago y cuánto es de IGV o de renta.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) l
              where l ->> 'concepto' not in ('igv', 'renta') or coalesce((l ->> 'monto')::numeric, 0) <= 0
                 or (l ->> 'mes')::date <> date_trunc('month', (l ->> 'mes')::date)::date) then
    raise exception 'Cada línea lleva su mes, si es IGV o renta, y un monto mayor que cero.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lineas) l where (l ->> 'mes')::date > date_trunc('month', coalesce(p_fecha, retail.fn_hoy_lima()))::date) then
    raise exception 'Ese pago no puede ser de un mes que todavía no empezaba en esa fecha.' using errcode = 'P0001';
  end if;
  v_total := (select sum((l ->> 'monto')::numeric) from jsonb_array_elements(p_lineas) l);
  v_actor := retail.fn_actor_persona_id(true);
  v_mov := retail.registrar_movimiento_dinero('pago_sunat', v_total, p_cuenta_id, null, p_fecha, p_referencia, 0, null, null, p_token);
  -- Con el mismo token el movimiento es el de antes, y sus líneas ya están.
  insert into retail.impuestos_pagos (movimiento_id, mes, concepto, monto, creado_por)
  select v_mov, (l ->> 'mes')::date, l ->> 'concepto', (l ->> 'monto')::numeric, v_actor from jsonb_array_elements(p_lineas) l
  on conflict (movimiento_id, mes, concepto) do nothing;
  return v_mov;
end $$;
comment on function retail.registrar_pago_sunat(uuid, date, jsonb, text, uuid) is
  'Tarea 10: el pago a SUNAT y de qué mes y concepto es, juntos. Firma con el responsable del combo.';
revoke all on function retail.registrar_pago_sunat(uuid, date, jsonb, text, uuid) from public, anon;
grant execute on function retail.registrar_pago_sunat(uuid, date, jsonb, text, uuid) to authenticated;

create or replace function retail.fn_impuestos_pagos()
returns table (mes date, concepto text, monto numeric)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  if not retail.fn_puede_ver_impuestos() then
    raise exception 'Ver lo pagado a SUNAT necesita el módulo Impuestos en tu rol.' using errcode = '42501';
  end if;
  return query
  select p.mes, p.concepto, sum(p.monto)::numeric
    from retail.impuestos_pagos p join retail.movimientos_dinero d on d.id = p.movimiento_id
   where d.estado = 'vigente'
   group by p.mes, p.concepto;
end $$;
comment on function retail.fn_impuestos_pagos() is 'Tarea 10: lo pagado a SUNAT por mes y concepto, de los movimientos vigentes. Solo lee.';
revoke all on function retail.fn_impuestos_pagos() from public, anon;
grant execute on function retail.fn_impuestos_pagos() to authenticated;

-- El diario: la renta va a la 4017; el IGV sigue bajando la 4011.
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])',
$a$    select d.id, d.tipo, d.fecha, d.ubicacion_id as u, d.monto, d.referencia,$a$,
$n$    select d.id, d.tipo, d.fecha, d.ubicacion_id as u, d.monto, d.referencia,
           coalesce((select sum(p.monto) from retail.impuestos_pagos p where p.movimiento_id = d.id and p.concepto = 'renta'), 0) as renta,$n$, 1);
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])',
$a$           md.monto::numeric as debe, 0::numeric as haber, 'movimientos_dinero'::text as ot, md.id as oid,$a$,
$n$           (md.monto - md.renta)::numeric as debe, 0::numeric as haber, 'movimientos_dinero'::text as ot, md.id as oid,$n$, 1);
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])',
$a$                else 'Sale de ' || coalesce(md.n_o, 'la cuenta') end
      from md
  ),$a$,
$n$                else 'Sale de ' || coalesce(md.n_o, 'la cuenta') end
      from md
    union all
    select md.fecha, md.u, 'dinero:' || md.id, md.tipo, '4017', md.renta, 0, 'movimientos_dinero', md.id, 'Pago a cuenta del impuesto a la renta'
      from md where md.renta > 0
  ),$n$, 1);

-- La comprobación de la 4011: lo pagado de IGV baja los dos lados.
select pg_temp.reemplazar('retail.fn_conciliacion_contable(date)',
$a$    v_o := -coalesce((v_ini ->> '4011')::numeric, 0) + v_igv_f8;$a$,
$n$    v_o := -coalesce((v_ini ->> '4011')::numeric, 0) + v_igv_f8
           - coalesce((select sum(d.monto - coalesce((select sum(p.monto) from retail.impuestos_pagos p where p.movimiento_id = d.id and p.concepto = 'renta'), 0))
                         from retail.movimientos_dinero d
                        where d.tipo = 'pago_sunat' and d.estado = 'vigente' and d.fecha between v_arr and v_corte), 0);$n$, 1);

-- La propuesta de arranque: el saldo a favor que se declaró es lo que SUNAT le debía a CAYLA.
select pg_temp.reemplazar('retail.fn_saldos_iniciales_propuesta(date)',
$a$        ('4011', 0::numeric,$a$,
$n$        ('4011', coalesce((select t.valor from retail.fn_parametro_tributario('saldo_favor_igv', p_fecha) t), 0)::numeric,$n$, 1);

-- La proyección: lo pagado de ese mes y concepto se resta directo. Lo que se pagó sin líneas sigue contando como antes.
select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$a$                               where d.tipo = 'pago_sunat' and d.estado = 'vigente' and d.fecha >= v_mes and d.fecha <= v_hoy), 0);$a$,
$n$                               where d.tipo = 'pago_sunat' and d.estado = 'vigente' and d.fecha >= v_mes and d.fecha <= v_hoy
                                 and not exists (select 1 from retail.impuestos_pagos p where p.movimiento_id = d.id)), 0);
    v_igv_ant := greatest(v_igv_ant - coalesce((select sum(p.monto) from retail.impuestos_pagos p join retail.movimientos_dinero d on d.id = p.movimiento_id
                                        where d.estado = 'vigente' and p.mes = v_mes_ant and p.concepto = 'igv'), 0), 0);
    v_renta_ant := greatest(v_renta_ant - coalesce((select sum(p.monto) from retail.impuestos_pagos p join retail.movimientos_dinero d on d.id = p.movimiento_id
                                            where d.estado = 'vigente' and p.mes = v_mes_ant and p.concepto = 'renta'), 0), 0);$n$, 1);

reset lock_timeout;
