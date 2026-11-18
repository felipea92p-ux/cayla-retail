-- ============================================================================
-- 20261106171000 — La Producción entra al diario: las telas que se cortan y las prendas que el Taller mete al stock
--
-- EL PROBLEMA PRIMERO. El 5-nov el Taller metió al stock 139 prendas de tres órdenes (#2, #3 y #4), al costo de la orden:
-- tela S/ 829,68 + maquila S/ 409,20 = S/ 1 238,93. El stock subió, pero el diario no tenía ninguna regla de Producción:
-- la comprobación del Balance mostraba la 201 S/ 1 238,93 por debajo de stock × costo, con la causa «el diario todavía no
-- tiene el costo del Taller». Y lo que costó esa ropa no estaba en ningún lado: la tela se cortó el 30 y 31-oct y la maquila
-- se pagó desde un banco ya cuadrado (Felipe, 2026-11-06), o sea que al arranque del Balance (1-nov) esas tres órdenes eran
-- ropa a medio hacer que el arranque no contó. Tampoco contó las telas que quedaban en el estante (S/ 197,93).
--
-- LA DECISIÓN (Felipe eligió «regla en el diario», 2026-11-06). Dos cuentas nuevas del PCGE y una regla con dos tramos:
--   · 241 «Materias primas (telas e insumos)» y 231 «Productos en proceso (Taller)», de activo.
--   · Al cortar tela para una orden (`movimientos_insumo` consumo; su devolución lo deshace): 231 al debe, 241 al haber,
--     al costo del lote.
--   · Al meter la prenda al stock (`movimientos` motivo produccion; la reversión lo deshace): 201 al debe, 231 al haber,
--     al MISMO costo con que la comprobación valora el stock (el de `costo_historial`, o el de la variante ese día).
--   · La causa «produccion» de la comprobación de la 201 deja de existir: el diario ya lo tiene.
--   · Saldos de arranque al 1-nov, corregidos con motivo: 231 = S/ 1 238,93 (las tres órdenes a medio hacer), 241 = S/ 197,93
--     (las telas del estante) y el capital sube lo mismo (S/ 1 436,86). Así la 231 queda en 0 cuando las prendas entran.
--
-- LO QUE NO HACE (y queda escrito para la próxima actividad): no registra cómo se PAGA la tela ni la maquila de una orden
-- nueva. Hoy ninguna de las dos tiene un camino al dinero (el lote de tela no dice de qué cuenta salió; los comprobantes del
-- Taller no se usan). Mientras no lo tenga, una orden nueva deja la 241 y la 231 por debajo de lo real, A LA VISTA en el
-- Balance (no esconde nada: la 201 sigue cuadrando). El paso siguiente es darle a la tela y a la maquila su categoría de
-- gasto (a la 241 y a la 231), que es un cambio en la pantalla de Gastos.
--
-- CONTRATO
--   PROMETE: (1) `fn_asientos` devuelve las líneas de `fn_asientos_produccion`, que cuadran solas (debe = haber por asiento);
--            (2) la comprobación de la 201 ya no da la causa «produccion»; (3) los saldos de arranque suman 231 y 241 y el
--            capital, una sola vez; (4) repetir la migración no cambia nada.
--   ASUME:   que ya están pegadas 20261106002000 y 20261106153000 (las anclas son de la definición viva del 2026-11-06) y que
--            el arranque es el 1-nov-2026; si no, la corrección del arranque no se hace (y lo dice con un aviso).
--   NO HACE: no toca movimientos ni costos, ni el Estado de resultados (231 y 241 son de balance), ni cierra ningún mes.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA SOLA EJECUCIÓN. Agrega dos filas al plan de cuentas, crea una función, reescribe dos
-- funciones desde su definición viva y agrega tres filas a los saldos de arranque. No crea políticas ni toma tablas en uso
-- con `alter`. Sin `select … into` dentro de un texto entre comillas (ADR-0288).
-- SE ROMPE SI: alguien corrige los saldos de arranque de 231/241 a mano después (esta corrección no se repite: se ve que ya
-- existe la 231); o si se cierra noviembre antes de pegarla (su foto no trae la Producción).
-- DOWN: volver a pegar la definición de `fn_asientos` y `fn_bal_causas_mercaderia` sin las anclas nuevas, y corregir los
--       saldos de arranque de 231, 241 y 50 desde la web (con motivo).
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

-- ---------- 1. Las dos cuentas ----------
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('231', 'Productos en proceso (Taller)',      'activo', null, 4),
  ('241', 'Materias primas (telas e insumos)', 'activo', null, 4)
on conflict (codigo) do nothing;

-- ---------- 2. La regla ----------
create or replace function retail.fn_asientos_produccion(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql stable set search_path = retail, public, extensions as $$
  with
  lim as (select (p_desde::timestamp at time zone 'America/Lima') as ini, ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin),
  -- La tela que se corta para una orden sale del estante (241) y pasa a la ropa a medio hacer (231), al costo de su lote.
  -- Una devolución (también la de «deshacer el corte») la regresa.
  tela as (
    select mi.id, mi.ubicacion_id, (mi.created_at at time zone 'America/Lima')::date as f,
           round((case mi.tipo when 'consumo' then 1 else -1 end) * mi.cantidad * mi.costo_unitario, 2) as valor
      from retail.movimientos_insumo mi cross join lim
     where mi.created_at >= lim.ini and mi.created_at < lim.fin
       and mi.tipo in ('consumo', 'devolucion') and mi.produccion_id is not null
       and (p_todo or mi.ubicacion_id = any (p_ubics))
  ),
  -- La prenda que el Taller mete al stock pasa de la 231 a la 201, al costo con que la comprobación valora el stock.
  -- Una reversión de Producción la saca.
  prenda as (
    select m.id, m.ubicacion_id, (m.created_at at time zone 'America/Lima')::date as f,
           round((case m.tipo when 'salida' then -m.cantidad else m.cantidad end)
                 * coalesce((select h.costo_unitario_nuevo from retail.costo_historial h where h.movimiento_id = m.id),
                            retail.fn_costo_variante_al(m.variante_id, m.created_at)), 2) as valor
      from retail.movimientos m cross join lim
     where m.created_at >= lim.ini and m.created_at < lim.fin
       and m.motivo in ('produccion', 'reversion_produccion')
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and not retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_id, m.created_at)
       and (p_todo or m.ubicacion_id = any (p_ubics))
  )
  select t.f, t.ubicacion_id, 'produccion_tela:' || t.id, 'produccion_tela', '231', greatest(t.valor, 0), greatest(-t.valor, 0),
         'movimientos_insumo', t.id, case when t.valor > 0 then 'Se corta la tela para la orden' else 'Vuelve tela de la orden' end
    from tela t where t.valor <> 0
  union all
  select t.f, t.ubicacion_id, 'produccion_tela:' || t.id, 'produccion_tela', '241', greatest(-t.valor, 0), greatest(t.valor, 0),
         'movimientos_insumo', t.id, case when t.valor > 0 then 'Sale del estante' else 'Vuelve al estante' end
    from tela t where t.valor <> 0
  union all
  select p.f, p.ubicacion_id, 'produccion:' || p.id, 'produccion', '201', greatest(p.valor, 0), greatest(-p.valor, 0),
         'movimientos', p.id, case when p.valor > 0 then 'Entra la prenda que hizo el Taller' else 'Se revierte una prenda del Taller' end
    from prenda p where p.valor <> 0
  union all
  select p.f, p.ubicacion_id, 'produccion:' || p.id, 'produccion', '231', greatest(-p.valor, 0), greatest(p.valor, 0),
         'movimientos', p.id, case when p.valor > 0 then 'Deja de estar en proceso' else 'Vuelve a estar en proceso' end
    from prenda p where p.valor <> 0;
$$;
comment on function retail.fn_asientos_produccion(date, date, boolean, uuid[]) is
  'Interna (20261106171000): la Producción en el diario. La tela que se corta pasa de 241 a 231 al costo de su lote; la prenda que entra al stock pasa de 231 a 201 al costo con que la comprobación valora el stock. Un asiento por movimiento, que cuadra solo. El pago de la tela y de la maquila todavía no tiene regla.';
revoke all on function retail.fn_asientos_produccion(date, date, boolean, uuid[]) from public, anon, authenticated;

-- El diario la suma, junto a las demás reglas que viven en su propia función.
select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
$a$    union all select * from retail.fn_asientos_claure(p_desde, p_hasta, v_todo, v_ubics)$a$,
$n$    union all select * from retail.fn_asientos_claure(p_desde, p_hasta, v_todo, v_ubics)
    -- 20261106171000: la tela que se corta (241 → 231) y la prenda que el Taller mete al stock (231 → 201).
    union all select * from retail.fn_asientos_produccion(p_desde, p_hasta, v_todo, v_ubics)$n$, 1);

-- ---------- 3. La comprobación de la 201: Producción ya no es una causa ----------
-- Se deja la rama (da los nombres y tipos de las columnas del `union`) pero sin filas: el diario ya la asienta.
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
$a$      from mv where mv.motivo in ('produccion', 'reversion_produccion')$a$,
$n$      from mv where false  -- 20261106171000: el diario ya asienta la Producción (fn_asientos_produccion)$n$, 1);

-- ---------- 4. Saldos de arranque: lo que el arranque no contó del Taller ----------
-- Una sola vez, y solo en la base que tiene el arranque del 1-nov-2026 (producción). Igual que `registrar_saldo_inicial`:
-- una fila nueva por cuenta, y la del capital reemplaza a la vigente con su motivo.
do $$
declare
  v_arr date := retail.fn_fecha_de_arranque();
  v_cap retail.saldos_iniciales%rowtype;
  v_motivo text := 'Lo que el arranque no contó del Taller: 3 órdenes a medio hacer al 1-nov (tela cortada el 30 y 31-oct + maquila pagada, S/ 1 238,93) y las telas del estante (S/ 197,93). Migración 20261106171000.';
begin
  if v_arr is distinct from date '2026-11-01' then
    raise notice 'Sin arranque del 1-nov-2026: no se corrigen saldos de arranque.';
    return;
  end if;
  if exists (select 1 from retail.saldos_iniciales s where s.cuenta in ('231', '241')) then
    return;
  end if;
  select s.* into v_cap from retail.saldos_iniciales s
   where s.cuenta = '50' and not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id)
   order by s.created_at desc limit 1;
  if v_cap.id is null then
    raise exception 'No hay capital en los saldos de arranque: corrígelo desde la web.';
  end if;
  insert into retail.saldos_iniciales (fecha, cuenta, debe, haber, origen, nota, reemplaza_id, motivo, registrado_por) values
    (v_arr, '231', 1238.93, 0, 'manual', 'Órdenes #2, #3 y #4 del Taller', null, v_motivo, v_cap.registrado_por),
    (v_arr, '241', 197.93, 0, 'manual', 'Telas e insumos del estante al 1-nov', null, v_motivo, v_cap.registrado_por),
    (v_arr, '50', v_cap.debe, v_cap.haber + 1436.86, v_cap.origen, v_cap.nota, v_cap.id, v_motivo, v_cap.registrado_por);
end $$;

reset lock_timeout;
