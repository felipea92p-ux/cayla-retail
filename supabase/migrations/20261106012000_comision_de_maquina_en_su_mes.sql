-- ============================================================================
-- 20261106012000 — La comisión de la máquina entra en su mes, estimada, y se ajusta al depositar; y «Cuadrar depósitos» (tarea 14 de «Las 36 de Finanzas», ADR-0552)
--
-- EL PROBLEMA PRIMERO. La comisión solo entraba cuando alguien registraba el depósito. Un mes con días pendientes salía mejor de lo que es, y sin registrar nada las puentes crecían y el aviso mentía.
--
-- LA DECISIÓN (Felipe 2026-11-05: «sí, estimar y ajustar»).
--   1. Cada lote pendiente se estima POR OPERACIÓN con la tarifa de ese día: comisión = round(monto × tasa, 2), más su IGV redondeado, más el cargo fijo. Es lo que se midió contra el banco (ADR-0552).
--   2. Devengo sin guardar nada: el día del lote, 6392 | 4691. El día del depósito, lo contrario: 4691 | 6392, y entra el gasto real de siempre en la 639. Así el mes del lote lleva lo estimado y el del
--      depósito lleva solo la diferencia. Sale de datos que no cambian, así que un mes cerrado queda igual aunque el depósito llegue después; y la puente no se toca, porque la estimación va contra la 4691.
--   3. «Cuadrar depósitos»: con vista previa, registra lo vencido de cada máquina como depósito marcado «estimado», al banco fijo de la máquina (tarea 3). Solo con su tarifa y su banco. Vence a lo que
--      tarda la máquina, con tope de 2 días corridos, y nunca el día de hoy, que sigue vendiendo. `reemplazar_deposito_estimado` lo cambia por lo que llegó, en una sola transacción.
--
-- DESCARTÉ el factor aprendido de ADR-0552 (decisión 4): cambia con cada depósito, así que la reversa no devolvería lo que el mes cerrado devengó y la 4691 nunca volvería a cero. La tarifa es estable; se
-- reconsidera si el error medido crece. DESCARTÉ también `fn_pos_comision_estimada`: estima por día, y redondear por operación es lo que coincide con el banco.
--
-- SUPUESTOS PARA EL CONTADOR: las cuentas 6392 y 4691; sin sede y sin crédito fiscal, igual que hoy el gasto 639 real (repartir por sede cambia cuántos gastos nacen por depósito y va aparte); y la tarifa de
-- Vendemás, 2,30 % + IGV medido en ADR-0552, que esta migración siembra solo si la máquina no tiene ninguna. American Express cuesta más y queda dentro del margen de error de ~2 % medido.
--
-- SE ROMPE SI: alguien cambia la fecha de una venta o el monto de un pago de un mes ya cerrado; hoy nada lo permite. Si la máquina retiene un lote ya «cuadrado», el banco del ERP queda alto hasta la
-- conciliación diaria (ADR-0552). Cuadrar solo es seguro con esa conciliación: es la condición de la decisión 6 del ADR.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, sin políticas (RLS encendido, se lee solo por funciones `security definer`, ADR-0195). Crea una tabla, dos cuentas, cinco funciones, y reescribe dos funciones
-- desde su definición viva; si el ancla no aparece, aborta entero. Pegarla dos veces no hace nada. Al pegarla, los lotes pendientes desde el inicio de Finanzas entran a su mes y el resultado baja por eso.
-- Verificado: `pnpm pruebas:comision-estimada`.
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

insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('6392', 'Comisiones de máquinas, estimadas (se ajustan al depositar)', 'gasto', 'gastos_operacion', 49),
  ('4691', 'Comisiones de máquinas por reconocer', 'pasivo', null, 50)
on conflict (codigo) do nothing;

-- ADR-0552, requisito 5: sin tarifa no hay estimación. Solo si la máquina no tiene ninguna.
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde)
select m.id, 'tarjeta', 2.30, true, 0, 1, '1900-01-01'
  from retail.pos_maquinas m
 where m.nombre ilike 'vendem%'
   and not exists (select 1 from retail.pos_tarifas t where t.maquina_id = m.id and t.medio = 'tarjeta');

create table if not exists retail.pos_abonos_estimados (
  movimiento_id uuid primary key references retail.movimientos_dinero (id),
  reemplazado_por uuid references retail.movimientos_dinero (id),
  creado_por uuid,
  creado_en timestamptz not null default now()
);
alter table retail.pos_abonos_estimados enable row level security;
comment on table retail.pos_abonos_estimados is
  'Tarea 14: los depósitos de máquina que «Cuadrar depósitos» registró sin ver el banco. Se reemplazan por lo real con reemplazar_deposito_estimado.';

-- La comisión de un lote, operación por operación. Interna. 0 sin tarifa: nunca se inventa una cifra.
create or replace function retail.fn_pos_comision_lote(p_cuenta_id uuid, p_fecha date, p_ubicacion_id uuid, p_medio text)
returns numeric
language sql stable security definer
set search_path = retail, public, extensions
as $$
  with t as (
    select (retail.fn_pos_tarifa(m.id, p_medio, p_fecha)).* from retail.pos_maquinas m where m.cuenta_id = p_cuenta_id
  )
  select coalesce(sum(round(vp.monto * t.tasa_pct / 100, 2)
                      + case when t.igv_sobre_tasa then round(round(vp.monto * t.tasa_pct / 100, 2) * retail.fn_tasa_igv(p_fecha), 2) else 0 end
                      + t.cargo_fijo), 0)::numeric
    from t
    join retail.venta_pagos vp on vp.cuenta_dinero_id = p_cuenta_id and vp.metodo = p_medio
    join retail.ventas v on v.id = vp.venta_id
   where t.id is not null
     and v.ubicacion_id = p_ubicacion_id and v.estado = 'completada' and not coalesce(v.es_prueba, false)
     and v.created_at >= (p_fecha::timestamp at time zone 'America/Lima') and v.created_at < ((p_fecha + 1)::timestamp at time zone 'America/Lima');
$$;
revoke all on function retail.fn_pos_comision_lote(uuid, date, uuid, text) from public, anon, authenticated;

select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])',
$a$  l_md as ($a$,
$n$  -- Tarea 14: la comisión estimada de cada lote, el día del lote; y su reversa, el día del depósito. Sin sede, como el gasto real.
  lotes_est as (
    select l.cuenta_id, l.f, l.ubicacion_id, l.medio, retail.fn_pos_comision_lote(l.cuenta_id, l.f, l.ubicacion_id, l.medio) as estimada
      from (select distinct vp.cuenta_dinero_id as cuenta_id, (v.created_at at time zone 'America/Lima')::date as f, v.ubicacion_id, vp.metodo as medio
              from retail.venta_pagos vp
              join retail.ventas v on v.id = vp.venta_id
              join retail.pos_maquinas m on m.cuenta_id = vp.cuenta_dinero_id
             where p_todo and v.estado = 'completada' and not coalesce(v.es_prueba, false)
               and v.created_at >= (greatest(p_desde, coalesce(retail.fn_finanzas_desde(), p_desde))::timestamp at time zone 'America/Lima')
               and v.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima')) l
  ),
  rev_est as (
    select d.fecha as f, d.id as movimiento_id, a.clave, retail.fn_pos_comision_lote(a.cuenta_id, a.fecha, a.ubicacion_id, a.medio) as estimada
      from retail.pos_abonos_lotes a
      join retail.movimientos_dinero d on d.id = a.movimiento_dinero_id and d.estado = 'vigente'
     where p_todo and d.fecha between p_desde and p_hasta and a.fecha >= coalesce(retail.fn_finanzas_desde(), a.fecha)
  ),
  l_comision_est as (
    select e.f, null::uuid as u, ('comision_est:' || e.cuenta_id || ':' || e.f || ':' || e.ubicacion_id || ':' || e.medio)::text as asiento, 'comision_estimada'::text as regla,
           '6392'::text as cuenta, e.estimada::numeric as debe, 0::numeric as haber, 'pos_tarifas'::text as ot, null::uuid as oid,
           'Comisión estimada de lo cobrado con la máquina'::text as glosa
      from lotes_est e where e.estimada > 0
    union all
    select e.f, null::uuid, 'comision_est:' || e.cuenta_id || ':' || e.f || ':' || e.ubicacion_id || ':' || e.medio, 'comision_estimada', '4691', 0, e.estimada, 'pos_tarifas', null::uuid, 'Se reconoce al depositar'
      from lotes_est e where e.estimada > 0
    union all
    select r.f, null::uuid, 'comision_rev:' || r.movimiento_id || ':' || r.clave, 'comision_estimada', '4691', r.estimada, 0, 'movimientos_dinero', r.movimiento_id, 'Ya depositó: sale lo estimado'
      from rev_est r where r.estimada > 0
    union all
    select r.f, null::uuid, 'comision_rev:' || r.movimiento_id || ':' || r.clave, 'comision_estimada', '6392', 0, r.estimada, 'movimientos_dinero', r.movimiento_id, 'Ya depositó: entra la comisión real'
      from rev_est r where r.estimada > 0
  ),
  l_md as ($n$, 1);

-- Dentro de `l_md`: el final de la función lo vuelven a pegar otras migraciones en sus pruebas, y no se toca.
select pg_temp.reemplazar('retail.fn_asientos_dinero_y_caja(date,date,boolean,uuid[])',
$a$      from md where md.renta > 0
  ),$a$,
$n$      from md where md.renta > 0
    union all
    select * from l_comision_est
  ),$n$, 1);

-- Dos mermas con el mismo monto no tenían orden fijo: cambiar el diario volteaba el detalle sin mover una cifra, y la foto de un mes podía salir distinta. Desempata por su regla.
select pg_temp.reemplazar('retail.fn_estado_resultados(date,date,uuid)',
$a$jsonb_build_object('regla', m.regla, 'monto', m.monto) order by m.monto desc)$a$,
$n$jsonb_build_object('regla', m.regla, 'monto', m.monto) order by m.monto desc, m.regla)$n$, 1);
select pg_temp.reemplazar('retail.fn_estado_resultados(date,date,uuid)',
$a$jsonb_build_object('regla', q.regla, 'monto', q.monto) order by q.monto desc)$a$,
$n$jsonb_build_object('regla', q.regla, 'monto', q.monto) order by q.monto desc, q.regla)$n$, 1);

-- Lo que ya venció en cada máquina y cuánto debería haber llegado. Solo lee.
create or replace function retail.fn_cuadrar_depositos_vista()
returns table (cuenta_id uuid, maquina text, banco_id uuid, banco text, dias integer, bruto numeric, comision numeric, neto numeric, claves text[], desde date, hasta date, falta text)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_hoy date := retail.fn_hoy_lima();
begin
  perform retail.fn_exigir_lider_dinero('Cuadrar los depósitos de las máquinas');
  return query
  with lotes as (
    select m.cuenta_id, m.nombre as maquina, m.banco_id, p.clave, p.fecha, p.bruto,
           (retail.fn_pos_tarifa(m.id, p.medio, p.fecha)).id as tarifa_id,
           retail.fn_pos_comision_lote(m.cuenta_id, p.fecha, p.ubicacion_id, p.medio) as comision
      from retail.pos_maquinas m
     cross join lateral retail.fn_pos_pendientes(m.cuenta_id) p
     where m.archivada_en is null and p.fecha < v_hoy and p.bruto > 0
       and (p.dias_habiles >= coalesce((retail.fn_pos_tarifa(m.id, p.medio, p.fecha)).dias_abono, 3) or v_hoy - p.fecha >= 2)
  )
  select l.cuenta_id, l.maquina, l.banco_id, b.nombre, count(*)::integer, sum(l.bruto)::numeric, sum(l.comision)::numeric, sum(l.bruto - l.comision)::numeric,
         array_agg(l.clave order by l.fecha, l.clave), min(l.fecha), max(l.fecha),
         case when l.banco_id is null then 'banco' when bool_or(l.tarifa_id is null) then 'tarifa' end
    from lotes l
    left join retail.cuentas_dinero b on b.id = l.banco_id
   group by l.cuenta_id, l.maquina, l.banco_id, b.nombre
   order by l.maquina;
end $$;
comment on function retail.fn_cuadrar_depositos_vista() is 'Tarea 14: la vista previa de «Cuadrar depósitos». `falta`: banco o tarifa, lo que impide cuadrar esa máquina.';
revoke all on function retail.fn_cuadrar_depositos_vista() from public, anon;
grant execute on function retail.fn_cuadrar_depositos_vista() to authenticated;

create or replace function retail.cuadrar_deposito_maquina(p_cuenta_id uuid, p_claves text[], p_neto numeric, p_token uuid default null)
returns uuid
language plpgsql security definer
set search_path = retail, public, extensions
as $$
declare
  v_fila record;
  v_mov uuid;
begin
  perform retail.fn_exigir_lider_dinero('Cuadrar los depósitos de las máquinas');
  if p_token is not null then
    v_mov := (select d.id from retail.movimientos_dinero d where d.token_cliente = p_token);
    if v_mov is not null then
      return v_mov;
    end if;
  end if;
  for v_fila in select * from retail.fn_cuadrar_depositos_vista() f where f.cuenta_id = p_cuenta_id loop
    if v_fila.falta = 'banco' then
      raise exception 'A % le falta su banco: elígelo en Configuración ▸ Dinero.', v_fila.maquina using errcode = 'P0001';
    end if;
    if v_fila.falta = 'tarifa' then
      raise exception 'A % le falta su tarifa: cárgala en Configuración ▸ Dinero.', v_fila.maquina using errcode = 'P0001';
    end if;
    -- Lo que se confirma es lo que se vio: si una venta cambió entre la vista previa y el clic, no se cuadra a ciegas.
    if (select array_agg(c order by c) from unnest(v_fila.claves) c) is distinct from (select array_agg(c order by c) from unnest(p_claves) c)
       or abs(v_fila.neto - coalesce(p_neto, 0)) >= 0.005 then
      raise exception 'Algo cambió en % desde que abriste esto: vuelve a abrir «Cuadrar depósitos».', v_fila.maquina using errcode = 'P0001';
    end if;
    v_mov := ((retail.registrar_abono_pos(p_cuenta_id, v_fila.banco_id, retail.fn_hoy_lima(), v_fila.neto, p_claves, 'Estimado con «Cuadrar depósitos»', p_token)) ->> 'movimiento_id')::uuid;
    insert into retail.pos_abonos_estimados (movimiento_id, creado_por) values (v_mov, retail.fn_actor_persona_id(true)) on conflict (movimiento_id) do nothing;
    return v_mov;
  end loop;
  raise exception 'Esa máquina ya no tiene nada vencido: vuelve a abrir «Cuadrar depósitos».' using errcode = 'P0001';
end $$;
comment on function retail.cuadrar_deposito_maquina(uuid, text[], numeric, uuid) is 'Tarea 14: registra lo vencido de una máquina como depósito estimado. Todo o nada por máquina, idempotente por token.';
revoke all on function retail.cuadrar_deposito_maquina(uuid, text[], numeric, uuid) from public, anon;
grant execute on function retail.cuadrar_deposito_maquina(uuid, text[], numeric, uuid) to authenticated;

create or replace function retail.reemplazar_deposito_estimado(p_movimiento_id uuid, p_neto numeric, p_fecha date default null, p_referencia text default null, p_token uuid default null)
returns uuid
language plpgsql security definer
set search_path = retail, public, extensions
as $$
declare
  v_e retail.pos_abonos_estimados%rowtype;
  v_d retail.movimientos_dinero%rowtype;
  v_claves text[];
  v_nuevo uuid;
begin
  perform retail.fn_exigir_lider_dinero('Cambiar un depósito estimado por el real');
  perform pg_advisory_xact_lock(hashtextextended('pos_estimado:' || p_movimiento_id::text, 0));
  select * into v_e from retail.pos_abonos_estimados where movimiento_id = p_movimiento_id;
  if not found then
    raise exception 'Ese depósito no es estimado.' using errcode = 'P0001';
  end if;
  if v_e.reemplazado_por is not null then
    return v_e.reemplazado_por;
  end if;
  select * into v_d from retail.movimientos_dinero where id = p_movimiento_id;
  if v_d.estado <> 'vigente' then
    raise exception 'Ese depósito ya está anulado.' using errcode = 'P0001';
  end if;
  v_claves := (select array_agg(a.clave) from retail.pos_abonos_lotes a where a.movimiento_dinero_id = p_movimiento_id);
  perform retail.anular_movimiento_dinero(p_movimiento_id, 'Se reemplaza por el depósito real');
  v_nuevo := ((retail.registrar_abono_pos(v_d.cuenta_origen_id, v_d.cuenta_destino_id, coalesce(p_fecha, v_d.fecha), p_neto, v_claves, coalesce(nullif(trim(p_referencia), ''), 'Depósito real'), p_token)) ->> 'movimiento_id')::uuid;
  update retail.pos_abonos_estimados set reemplazado_por = v_nuevo where movimiento_id = p_movimiento_id;
  return v_nuevo;
end $$;
comment on function retail.reemplazar_deposito_estimado(uuid, numeric, date, text, uuid) is 'Tarea 14 (ADR-0552, decisión 5): lo estimado se cambia por lo real en una sola transacción, con los mismos días.';
revoke all on function retail.reemplazar_deposito_estimado(uuid, numeric, date, text, uuid) from public, anon;
grant execute on function retail.reemplazar_deposito_estimado(uuid, numeric, date, text, uuid) to authenticated;

create or replace function retail.fn_depositos_estimados()
returns table (movimiento_id uuid)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
begin
  perform retail.fn_exigir_lider_dinero('Ver los depósitos estimados');
  return query
  select e.movimiento_id from retail.pos_abonos_estimados e join retail.movimientos_dinero d on d.id = e.movimiento_id
   where e.reemplazado_por is null and d.estado = 'vigente';
end $$;
comment on function retail.fn_depositos_estimados() is 'Tarea 14: qué depósitos siguen estimados, para su insignia. Solo lee.';
revoke all on function retail.fn_depositos_estimados() from public, anon;
grant execute on function retail.fn_depositos_estimados() to authenticated;

reset lock_timeout;
