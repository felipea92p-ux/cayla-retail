-- ============================================================================
-- 20261106204000 — La carga inicial que llega después del arranque entra al diario contra el capital
--
-- EL PROBLEMA PRIMERO. El arranque del Balance es el 1-nov-2026, pero las tiendas siguen cargando al sistema prendas que
-- CAYLA ya tenía («carga_inicial»: 165 entradas del 2 al 6-nov, S/ 7 905,50 al 6-nov, y siguen). El diario no tenía regla
-- para ellas: la comprobación de la 201 las mostraba como «otras entradas sin asiento», que bloquea. El 6-nov se intentó
-- arreglar SUMÁNDOLAS al saldo de arranque de la 201 (y las ventas sin prenda del 1 al 6-nov), pero eso es contar como del
-- 1-nov lo que entró después: la comprobación lo marca como «Cambió lo que había al arrancar» (+S/ 8 942,89) y cada carga
-- nueva vuelve a abrir la diferencia. Es la misma plata vista de los dos lados.
--
-- LA DECISIÓN. Una carga inicial no es una compra ni una ganancia: es mercadería que ya era de CAYLA y se registra tarde.
--   · Desde el día de arranque del Balance, cada entrada `carga_inicial` asienta 201 al debe y 50 (Capital) al haber, al
--     costo con que la comprobación valora el stock. Antes del arranque no se asienta: ya está en el saldo de arranque.
--   · La comprobación de la 201 deja de contarlas como «otras entradas»: el diario ya las tiene.
--   · El saldo de arranque de la 201 vuelve a ser lo que el sistema tenía el 31-oct (`fn_bal_otro_camino`, S/ 82 168,11 al
--     6-nov) y el capital baja lo mismo que se le había sumado (S/ 8 942,89). Las ventas sin prenda quedan como su causa,
--     que ya es una nota aceptada.
--
-- CONTRATO
--   PROMETE: (1) `fn_asientos` devuelve las líneas de `fn_asientos_carga_inicial`, que cuadran solas; (2) la causa
--            «otras_entradas» ya no cuenta las cargas iniciales; (3) el saldo de arranque de la 201 queda igual al «otro
--            camino» del día anterior al arranque, y el capital se mueve lo mismo; (4) repetir la migración no cambia nada.
--   ASUME:   que ya está pegada 20261106171000 (ancla en su línea del `union`) y que el arranque es el 1-nov-2026.
--   NO HACE: no toca movimientos ni costos, ni el Estado de resultados (201 y 50 son de balance), ni octubre.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN, DESPUÉS DE 20261106171000. Crea una función, reescribe dos desde su
-- definición viva y agrega dos filas a los saldos de arranque. No crea políticas ni toma tablas en uso con `alter`. Sin
-- `select … into` dentro de un texto entre comillas (ADR-0288).
-- SE ROMPE SI: se cierra noviembre antes de pegarla (su foto no trae estas cargas).
-- DOWN: volver a pegar `fn_asientos` y `fn_bal_causas_mercaderia` sin las anclas nuevas, y corregir 201 y 50 en los saldos
--       de arranque desde la web (con motivo).
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

-- ---------- 1. La regla ----------
create or replace function retail.fn_asientos_carga_inicial(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql stable set search_path = retail, public, extensions as $$
  with
  lim as (
    select greatest((p_desde::timestamp at time zone 'America/Lima'),
                    (coalesce(retail.fn_fecha_de_arranque(), 'infinity'::date)::timestamp at time zone 'America/Lima')) as ini,
           ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin
  ),
  ci as (
    select m.id, m.ubicacion_id, (m.created_at at time zone 'America/Lima')::date as f,
           round(m.cantidad * coalesce((select h.costo_unitario_nuevo from retail.costo_historial h where h.movimiento_id = m.id),
                                       retail.fn_costo_variante_al(m.variante_id, m.created_at)), 2) as valor
      from retail.movimientos m cross join lim
     where m.created_at >= lim.ini and m.created_at < lim.fin
       and m.tipo = 'entrada' and m.motivo = 'carga_inicial'
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and not retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_id, m.created_at)
       and (p_todo or m.ubicacion_id = any (p_ubics))
  )
  select ci.f, ci.ubicacion_id, 'carga_inicial:' || ci.id, 'carga_inicial', '201', ci.valor, 0::numeric,
         'movimientos', ci.id, 'Entra mercadería que ya era de CAYLA (carga inicial)'
    from ci where ci.valor > 0
  union all
  select ci.f, ci.ubicacion_id, 'carga_inicial:' || ci.id, 'carga_inicial', '50', 0::numeric, ci.valor,
         'movimientos', ci.id, 'Es capital: no es compra ni ganancia'
    from ci where ci.valor > 0;
$$;
comment on function retail.fn_asientos_carga_inicial(date, date, boolean, uuid[]) is
  'Interna (20261106204000): la carga inicial que llega DESPUÉS del arranque del Balance entra a la 201 contra el capital (50), al costo con que la comprobación valora el stock. Antes del arranque no asienta: está en el saldo de arranque.';
revoke all on function retail.fn_asientos_carga_inicial(date, date, boolean, uuid[]) from public, anon, authenticated;

select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
$a$    union all select * from retail.fn_asientos_produccion(p_desde, p_hasta, v_todo, v_ubics)$a$,
$n$    union all select * from retail.fn_asientos_produccion(p_desde, p_hasta, v_todo, v_ubics)
    -- 20261106204000: la carga inicial que llega después del arranque (201 contra el capital).
    union all select * from retail.fn_asientos_carga_inicial(p_desde, p_hasta, v_todo, v_ubics)$n$, 1);

-- ---------- 2. La comprobación de la 201: la carga inicial ya no es «otra entrada» ----------
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
$a$coalesce(mv.motivo, '') not in ('recepcion', 'produccion', 'traslado_entrada', 'traslado_anulado', 'devolucion', 'cambio', 'anulacion_venta')$a$,
$n$coalesce(mv.motivo, '') not in ('recepcion', 'produccion', 'traslado_entrada', 'traslado_anulado', 'devolucion', 'cambio', 'anulacion_venta', 'carga_inicial')$n$, 1);

-- ---------- 3. Saldos de arranque: la 201 vuelve a lo que había el 31-oct ----------
do $$
declare
  v_arr date := retail.fn_fecha_de_arranque();
  v_201 retail.saldos_iniciales%rowtype;
  v_cap retail.saldos_iniciales%rowtype;
  v_real numeric;
  v_delta numeric;
  v_motivo text := 'La 201 vuelve a lo que el sistema tenía el 31-oct: la carga inicial y las ventas sin prenda de después del 1-nov ya no se suman al arranque (la carga inicial entra al diario contra el capital). Migración 20261106204000.';
begin
  if v_arr is distinct from date '2026-11-01' then
    raise notice 'Sin arranque del 1-nov-2026: no se corrigen saldos de arranque.';
    return;
  end if;
  for v_201 in select s.* from retail.saldos_iniciales s
                where s.cuenta = '201' and not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id)
                order by s.created_at desc limit 1 loop
    exit;
  end loop;
  for v_cap in select s.* from retail.saldos_iniciales s
                where s.cuenta = '50' and not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id)
                order by s.created_at desc limit 1 loop
    exit;
  end loop;
  if v_201.id is null or v_cap.id is null then
    raise exception 'Faltan la 201 o el capital en los saldos de arranque: corrígelo desde la web.';
  end if;
  v_real := round((select coalesce(sum(o.saldo), 0) from retail.fn_bal_otro_camino(v_arr - 1) o where o.cuenta = '201'), 2);
  v_delta := (v_201.debe - v_201.haber) - v_real;
  if abs(v_delta) < 0.005 then
    return;  -- ya está
  end if;
  insert into retail.saldos_iniciales (fecha, cuenta, debe, haber, origen, nota, reemplaza_id, motivo, registrado_por) values
    (v_arr, '201', v_real, 0, v_201.origen, v_201.nota, v_201.id, v_motivo, v_201.registrado_por),
    (v_arr, '50', v_cap.debe, v_cap.haber - v_delta, v_cap.origen, v_cap.nota, v_cap.id, v_motivo, v_cap.registrado_por);
end $$;

reset lock_timeout;
