-- ============================================================================
-- 20261106011000 — La planilla ya puede pagarse entera, sin contar dos veces lo provisionado (tareas 12 y 13 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. La 41 sube por el costo real y solo baja por el neto: AFP, EsSalud, retención de 4ª, CTS, gratificación y liquidaciones no tenían salida. Registrarlas como gasto duplicaba
-- el costo, «Pagar a SUNAT» bajaba el IGV, y «Pagar la planilla» quedaba «suelta» para siempre pidiendo que la enlacen. Además, la 62 ya carga la provisión de cada mes y, al pagarse, la gratificación
-- volvía a entrar como bono dentro de `total`: en julio fueron S/ 7.722 de bonos sobre S/ 2.296 de provisión. La siguiente vez sería a fin de noviembre o en diciembre.
--
-- LA DECISIÓN.
--   1. `planilla_pagos_concepto`, tabla hija: dice que un `pago_planilla` es de aportes, CTS, gratificación o liquidación, y de qué mes. Sin fila, sigue siendo sueldos. Tabla aparte para no tocar
--      `movimientos_dinero`, que las tiendas usan todo el día. `registrar_pago_de_planilla` guarda los dos juntos. El asiento no cambia: 41 | banco.
--   2. `fn_planilla_salidas_sueltas` deja fuera lo que ya dice su concepto: no es una salida de sueldos sin enlazar.
--   3. La proyección trae AFP, EsSalud y retenciones del último período pagado, menos lo ya pagado, y estima igual los meses siguientes.
--   4. Los bonos de gratificación, CTS, vacaciones y bonificación extraordinaria salen del COSTO (`planilla_por_sede.costo_total` y `fn_planilla_provision_calc`): ya estaban en la 62 como provisión.
--      `pagado`, el neto, no cambia: esa plata sí sale del banco y baja la 41.
--   5. `fn_liquidaciones_por_registrar`: lo que Dynamic liquidó desde el inicio de Finanzas y aquí no tiene salida de banco.
--
-- SUPUESTOS PARA EL CONTADOR:
--   · Una sola 41, sin separar 403, 407 y 415.
--   · Opción «a»: la provisión baja al pagar; no se deja de provisionar para cargar al pagar. Por eso la 41 de arranque tiene que traer lo provisionado antes de esa fecha; si no, la primera
--     gratificación deja la 41 en negativo sin que el gasto esté mal.
--   · AFP, EsSalud y retenciones vencen el día 15 del mes siguiente, como punto medio: la AFP es en los primeros días hábiles y lo demás sigue el cronograma de SUNAT.
--   · CTS y gratificación NO se proyectan: Felipe todavía no confirma el régimen laboral, y el régimen decide si corresponden. Se pueden pagar, pero nada las anuncia.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Crea una tabla sin políticas (RLS encendido, se lee solo por funciones `security definer`, ADR-0195), añade una columna al final de la vista y reescribe
-- funciones desde su definición viva; si un ancla no aparece exactamente las veces esperadas, aborta entero. Pegarla dos veces no hace nada. Al pegarla baja el costo de los períodos que pagaron
-- esos bonos; hoy, solo julio, anterior al inicio de Finanzas. Verificado: `pnpm pruebas:planilla-conceptos`.
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

create table if not exists retail.planilla_pagos_concepto (
  movimiento_id uuid primary key references retail.movimientos_dinero (id),
  concepto text not null check (concepto in ('aportes', 'gratificacion', 'cts', 'liquidacion')),
  mes date not null check (mes = date_trunc('month', mes)::date),
  creado_por uuid,
  creado_en timestamptz not null default now()
);
alter table retail.planilla_pagos_concepto enable row level security;
comment on table retail.planilla_pagos_concepto is
  'Tarea 12: qué parte de la planilla paga un pago_planilla que no es de sueldos, y de qué mes. Se lee solo con el movimiento vigente: anularlo lo anula.';
create index if not exists planilla_pagos_concepto_mes on retail.planilla_pagos_concepto (concepto, mes);

create or replace function retail.registrar_pago_de_planilla(p_cuenta_id uuid, p_fecha date, p_monto numeric, p_concepto text, p_mes date, p_referencia text default null, p_token uuid default null)
returns uuid
language plpgsql security definer
set search_path = retail, public, extensions
as $$
declare
  v_mov uuid;
begin
  perform retail.fn_exigir_lider_dinero('Registrar un pago de la planilla');
  if p_concepto is null or p_concepto not in ('aportes', 'gratificacion', 'cts', 'liquidacion') then
    raise exception 'Di qué parte de la planilla estás pagando.' using errcode = 'P0001';
  end if;
  if p_mes is null or p_mes <> date_trunc('month', p_mes)::date then
    raise exception 'Di de qué mes es el pago.' using errcode = 'P0001';
  end if;
  if p_mes > date_trunc('month', coalesce(p_fecha, retail.fn_hoy_lima()))::date then
    raise exception 'Ese pago no puede ser de un mes que todavía no empezaba en esa fecha.' using errcode = 'P0001';
  end if;
  v_mov := retail.registrar_movimiento_dinero('pago_planilla', p_monto, p_cuenta_id, null, p_fecha, p_referencia, 0, null, null, p_token);
  -- Con el mismo token el movimiento es el de antes, y su concepto ya está.
  insert into retail.planilla_pagos_concepto (movimiento_id, concepto, mes, creado_por)
  values (v_mov, p_concepto, p_mes, retail.fn_actor_persona_id(true))
  on conflict (movimiento_id) do nothing;
  return v_mov;
end $$;
comment on function retail.registrar_pago_de_planilla(uuid, date, numeric, text, date, text, uuid) is
  'Tarea 12: paga aportes, gratificación, CTS o una liquidación: baja la 41, no el IGV ni un gasto. Firma con el responsable del combo.';
revoke all on function retail.registrar_pago_de_planilla(uuid, date, numeric, text, date, text, uuid) from public, anon;
grant execute on function retail.registrar_pago_de_planilla(uuid, date, numeric, text, date, text, uuid) to authenticated;

select pg_temp.reemplazar('retail.fn_planilla_salidas_sueltas()',
$a$     and not exists (select 1 from retail.planilla_salidas s where s.movimiento_id = m.id)$a$,
$n$     and not exists (select 1 from retail.planilla_salidas s where s.movimiento_id = m.id)
     and not exists (select 1 from retail.planilla_pagos_concepto c where c.movimiento_id = m.id)$n$, 1);

-- Lo provisionado que Dynamic pagó como bono en un período. Interna: la llaman funciones `security definer`.
create or replace function retail.fn_planilla_bonos_provisionados(p_periodo uuid)
returns table (persona_id uuid, monto numeric)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
begin
  if to_regclass('public.movimientos_planilla') is null then
    return;
  end if;
  return query execute $q$
    select m.persona_id, sum(m.monto)::numeric
      from public.movimientos_planilla m
     where m.periodo_id = $1 and m.tipo = 'bono'
       and m.categoria in ('gratificacion', 'cts', 'vacaciones', 'bonificacion_extraordinaria')
     group by m.persona_id
  $q$ using p_periodo;
end $$;
revoke all on function retail.fn_planilla_bonos_provisionados(uuid) from public, anon, authenticated;

select pg_temp.reemplazar('retail.fn_planilla_provision_calc(date,date,date,timestamp with time zone)',
$a$               + coalesce((f ->> 'provision_total')::numeric, 0) as costo,$a$,
$n$               + coalesce((f ->> 'provision_total')::numeric, 0)
               - coalesce((select b.monto from retail.fn_planilla_bonos_provisionados(r.id) b where b.persona_id = (f ->> 'persona_id')::uuid), 0) as costo,$n$, 1);

-- La vista de lo pagado: el costo sin lo que ya estaba provisionado, y los aportes del período.
do $$
begin
  if to_regclass('public.v_planilla_pagada') is null or to_regclass('public.periodos_planilla') is null or to_regclass('public.sedes') is null
     or to_regclass('public.movimientos_planilla') is null then
    raise notice 'planilla_por_sede: Dynamic no está en esta base: no se toca la vista.';
    return;
  end if;

  execute $vista$
    create or replace view retail.planilla_por_sede with (security_invoker = true) as
    select
      v.sede_codigo,
      s.tipo                          as sede_tipo,
      p.id                            as periodo_id,
      p.fecha_ini,
      p.fecha_fin,
      count(distinct v.persona_id)    as personas,
      sum(v.total)                    as pagado,
      sum(v.provision_total)          as provisiones,
      sum(v.total + coalesce(v.descuento_pension, 0) + coalesce(v.retencion_4ta, 0) + coalesce(v.aporte_essalud, 0) + v.provision_total
          - coalesce((select sum(m.monto) from public.movimientos_planilla m
                       where m.periodo_id = v.periodo_id and m.persona_id = v.persona_id and m.tipo = 'bono'
                         and m.categoria in ('gratificacion', 'cts', 'vacaciones', 'bonificacion_extraordinaria')), 0)) as costo_total,
      sum(coalesce(v.descuento_pension, 0) + coalesce(v.retencion_4ta, 0) + coalesce(v.aporte_essalud, 0)) as aportes
    from public.v_planilla_pagada v
    join public.periodos_planilla p on p.id = v.periodo_id and p.estado = 'pagado'
    join public.sedes s on s.codigo = v.sede_codigo
    where v.grupo is distinct from 'prueba'
    group by v.sede_codigo, s.tipo, p.id, p.fecha_ini, p.fecha_fin
    having count(distinct v.persona_id) >= 3
  $vista$;
end $$;

-- Los aportes del último período pagado. `to_jsonb` para no caerse si la vista aún no trae la columna (principio 9).
create or replace function retail.fn_flujo_planilla_aportes()
returns table (fecha_fin date, aportes numeric)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_flujo_planilla_visible() then
    return;
  end if;
  return query execute $q$
    select p.fecha_fin::date, sum(coalesce((to_jsonb(p) ->> 'aportes')::numeric, 0))::numeric
      from retail.planilla_por_sede p
     where p.fecha_fin = (select max(x.fecha_fin) from retail.planilla_por_sede x)
     group by p.fecha_fin
  $q$;
end $$;
revoke all on function retail.fn_flujo_planilla_aportes() from public, anon, authenticated;

select pg_temp.reemplazar('retail.fn_flujo_caja_proyeccion(integer)',
$a$  salidas as (
    select * from vencimientos union all select * from fijos union all select * from planilla union all select * from impuestos union all select * from impuestos_anteriores$a$,
$n$  -- Tareas 12 y 22: AFP, EsSalud y retenciones, día 15 del mes siguiente al período. Sin CTS ni gratificación hasta que se confirme el régimen laboral.
  aportes as (
    select 'aportes'::text as tipo, 'aportes:' || to_char(m.mes, 'YYYY-MM') as id, greatest(m.vence, v_ini) as fecha, m.vence as vence,
           'AFP, EsSalud y retenciones de ' || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from m.mes)::integer] as titulo,
           case when m.k = 0 then 'Del último período pagado, menos lo que ya pagaste.' else 'Como el último período pagado.' end as detalle,
           'planilla'::text as clase, null::uuid as ubicacion_id, null::text as unidad, m.monto as monto, (m.vence < v_hoy) as atrasada
      from (
        select k, (date_trunc('month', a.fecha_fin) + make_interval(months => k))::date as mes,
               ((date_trunc('month', a.fecha_fin) + make_interval(months => k + 1))::date + 14) as vence,
               greatest(a.aportes - coalesce((select sum(d.monto) from retail.planilla_pagos_concepto c join retail.movimientos_dinero d on d.id = c.movimiento_id
                                               where d.estado = 'vigente' and c.concepto = 'aportes'
                                                 and c.mes = (date_trunc('month', a.fecha_fin) + make_interval(months => k))::date), 0), 0) as monto
          from retail.fn_flujo_planilla_aportes() a cross join generate_series(0, 15) k
      ) m
     where m.monto > 0 and m.vence between v_hoy - 31 and v_fin
  ),
  salidas as (
    select * from vencimientos union all select * from fijos union all select * from planilla union all select * from aportes union all select * from impuestos union all select * from impuestos_anteriores$n$, 1);

-- Lo que Dynamic liquidó y aquí no tiene salida de banco. Solo sumas: ningún nombre ni monto por persona.
create or replace function retail.fn_liquidaciones_por_registrar()
returns table (mes date, personas integer, total numeric, registrado numeric)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
declare
  v_desde date := retail.fn_finanzas_desde();
begin
  if not coalesce(retail.fn_es_lider(), false) or not retail.fn_planilla_visible() or to_regclass('public.liquidacion_pagada') is null then
    return;
  end if;
  return query execute $q$
    with vigente as (
      select distinct on (l.persona_id, l.fecha_cese) l.persona_id, l.total, l.anulada, (l.congelada_at at time zone 'America/Lima')::date as pagada_el
        from public.liquidacion_pagada l
       order by l.persona_id, l.fecha_cese, l.version desc
    ),
    por_mes as (
      select date_trunc('month', v.pagada_el)::date as mes, count(*)::integer as personas, sum(v.total)::numeric as total
        from vigente v
       where not v.anulada and v.total > 0 and ($1 is null or v.pagada_el >= $1)
       group by 1
    )
    select p.mes, p.personas, p.total,
           coalesce((select sum(d.monto) from retail.planilla_pagos_concepto c join retail.movimientos_dinero d on d.id = c.movimiento_id
                      where d.estado = 'vigente' and c.concepto = 'liquidacion' and c.mes = p.mes), 0)::numeric
      from por_mes p
     where p.total > coalesce((select sum(d.monto) from retail.planilla_pagos_concepto c join retail.movimientos_dinero d on d.id = c.movimiento_id
                                where d.estado = 'vigente' and c.concepto = 'liquidacion' and c.mes = p.mes), 0)
     order by p.mes
  $q$ using v_desde;
end $$;
comment on function retail.fn_liquidaciones_por_registrar() is 'Tarea 12: por mes, lo liquidado en Dynamic desde el inicio de Finanzas que falta registrar como salida. Solo lee.';
revoke all on function retail.fn_liquidaciones_por_registrar() from public, anon;
grant execute on function retail.fn_liquidaciones_por_registrar() to authenticated;

reset lock_timeout;
