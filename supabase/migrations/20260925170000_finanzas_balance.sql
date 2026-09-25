-- ============================================================================
-- 20260925170000 — El Balance: saldos de arranque, la comprobación antes de dibujarlo y lo que es de cada tienda
-- (ADR-0195 F7; retoma ADR-0198: el capital es una ENTRADA y el Balance no se dibuja si no cuadra; PLAN-FINANZAS §8
-- pieza 9 y §10 punto 1: Balance por tienda = «lo que es de la tienda», decidido por Felipe el 2026-09-24)
--
-- EL PROBLEMA PRIMERO
--   Felipe pregunta «¿cuánto vale CAYLA?» y nadie lo puede contestar: el sistema sabe lo que se vendió, lo que se debe a
--   cada proveedor, lo que hay en cada cajón y en cada banco, pero no lo que CAYLA tenía el día que empezó a usarlo (el
--   capital, lo que ya se le debía a SUNAT, lo que el dueño le prestó). Sin ese punto de partida no hay Balance. Y un
--   Balance que «cuadra» porque el capital se calcula como lo que falta (Activo − Pasivo) no prueba nada: cuadraría
--   siempre, aunque falte registrar la mitad de las cosas.
--   Además, el diario de F5 todavía no conocía la plata que cambia de lugar ni la del dueño (depósitos, abonos del POS,
--   pago de la tarjeta, aportes, préstamos, retiros), ni lo que sobra o falta al cerrar una caja: con eso afuera, la caja
--   del diario nunca coincidiría con la de la tienda.
--
-- LAS REGLAS
--   1. SALDOS DE ARRANQUE (`saldos_iniciales`): lo que CAYLA tenía AL EMPEZAR el día de arranque, cuenta por cuenta, como
--      un asiento de apertura (debe/haber). Lo registra el líder UNA vez (`registrar_saldo_inicial`, firmado con el
--      responsable). Solo se agregan filas: una corrección es una fila nueva que REEMPLAZA a otra, con motivo. Nada se
--      edita ni se borra. El conjunto vigente tiene que cuadrar (lo que tiene = lo que debe + lo tuyo): el capital y las
--      utilidades acumuladas los ESCRIBE el líder (del contador), nunca los calcula el sistema.
--      Lo que el sistema ya sabe a esa fecha (caja y bancos de F3, mercadería, activos fijos, facturas por pagar,
--      adelantos de clientas) viene propuesto (`fn_saldos_iniciales_propuesta`).
--   2. EL BALANCE A UNA FECHA (`fn_balance_general(corte, null)`, solo el líder) = saldos de arranque + el diario
--      `fn_asientos` desde el arranque hasta el corte. Lo de resultados (ventas, costos, gastos) se cierra en «lo tuyo»:
--      utilidades acumuladas y la utilidad del mes del corte. Un saldo nunca se guarda: se suma.
--   3. LA COMPROBACIÓN (`fn_conciliacion_contable(corte)`, ADR-0198): el Balance se dibuja solo si
--        · hay saldos de arranque y cuadran; el diario cuadra (ningún asiento con debe ≠ haber); lo que tiene = lo que
--          debe + lo tuyo;
--        · CADA cuenta importante da lo mismo por dos caminos: el diario contra su registro propio —
--            101/104/105/451 contra los saldos de Cuentas y dinero (F3), 201 contra stock × costo (+ en camino entre
--            tiendas + facturado por recibir), 33/39 contra los activos fijos, 421 contra el saldo de cada factura, 122
--            contra las separaciones pendientes.
--      Si no, dice qué cuenta no cuadra, por cuánto y por qué (las causas que sabe medir: egresos de caja sin clasificar,
--      pagos que no dicen de qué cuenta salieron, prendas que entraron por Producción, algo registrado con fecha anterior
--      al arranque…). El IGV contra Impuestos (F8) se muestra para revisar, sin bloquear: las bases son distintas (el
--      diario lo reconoce al vender; SUNAT, al emitir el comprobante).
--   4. LO QUE ES DE LA TIENDA (`fn_balance_por_tienda`, `fn_balance_general(corte, tienda)`): su cajón y su caja fuerte,
--      su mercadería, sus muebles (al costo menos lo depreciado) y SU parte de las facturas por pagar (reparto de
--      ADR-0139/0187). El banco, el capital y el IGV son de CAYLA entera: no se reparten. «Cuánto rinde lo invertido» =
--      utilidad del mes (Estado de resultados) ÷ lo invertido. Con el módulo «Reportes financieros», una cuenta ve SU
--      tienda; el líder, todas y el consolidado.
--   5. EL DIARIO SUMA LO QUE EL BALANCE NECESITABA (PARTE 1, parche por ancla sobre la definición VIVA de `fn_asientos`):
--        dinero:<tipo>    fecha del movimiento   aporte: cuenta | 52 · préstamo: cuenta | 47 · retiro: 591 | cuenta ·
--                                                devolución de préstamo: 47 | cuenta · depósito, abono del POS, pago de la
--                                                tarjeta y entre cuentas: destino | origen (la comisión ya la asienta el gasto)
--        traslado_banco   día del cierre        104 | 101 (el traslado a caja fuerte o al líder no cambia la cuenta 101)
--        diferencia_caja  al cerrar o al abrir  faltante: 6599 | 101 · sobrante: 101 | 6599
--      y corrige un error de F5: lo que se le DEVUELVE a una clienta (anulación, devolución, cambio y adelanto devuelto)
--      sale por la misma cuenta por la que entró su cobro (con tarjeta: 105, el POS), no por la tarjeta de crédito de
--      CAYLA (451).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DOS EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»)
--   PARTE 1  el diario: una cuenta nueva (6599), una función nueva y el parche de `fn_asientos` (solo funciones: no toma
--            ninguna tabla que use la tienda). Si un ancla no aparece UNA vez, se detiene sin tocar nada; si ya está
--            parchada, no hace nada.
--   PARTE 2  la tabla `saldos_iniciales` (RLS encendido y SIN políticas: se lee por funciones) y las funciones. Sobre
--            tablas en uso solo toma los candados de sus llaves foráneas (`cuentas`, `personas`), compatibles con leer.
--   Cada una con `lock_timeout = 3s`: si dice «lock timeout», se repite ESA parte. Las dos son idempotentes. Sin políticas.
--   Antes deben estar: F2 (20260924235000, 20260924235100, 20260925000000), F3 (20260925110000, sus tres partes), F4
--   (20260925120000) y F5 (20260925130000). F3b (20260925150000) es opcional: si está, el libro de F3 usa la cuenta
--   sellada y la comprobación lo aprovecha sola.
--   Con el prefijo `retail.` que el archivo ya trae. En local y en el CI corre entero.
-- SE ROMPE SI
--   · Se agrega una operación de plata nueva sin su regla en `fn_asientos`: la comprobación lo va a mostrar como una
--     diferencia sin explicar y el Balance deja de dibujarse (ese es el punto: nada falla en silencio).
--   · Alguien registra con fecha ANTERIOR al arranque (una factura vieja, un gasto atrasado): cambia lo que había al
--     arrancar y la comprobación lo dice («cambió lo anterior al arranque»); se corrige con una fila nueva, con motivo.
--   · La web nueva se publica antes: Reportes ▸ Balance diría «No se pudo leer el Balance». Nada más se rompe. Si esto se
--     pega primero, lo único que cambia hoy es que el Estado de resultados muestra los faltantes y sobrantes de caja.
-- ============================================================================

-- ============================== PARTE 1 · el diario suma lo que el Balance necesita ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que sobra o falta al cerrar (o al abrir) una caja: un gasto de operación que puede ser negativo (sobrante).
-- Provisional hasta el contador (el PCGE usa 6599 para faltantes y 7599 para sobrantes).
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('6599', 'Diferencias de caja (faltantes y sobrantes)', 'gasto', 'gastos_operacion', 45)
on conflict (codigo) do nothing;

-- Las reglas nuevas del diario, en una sola función que `fn_asientos` suma a las suyas (la ÚNICA casa de las reglas sigue
-- siendo el diario: esta función solo la llama `fn_asientos`, que ya decidió qué ubicaciones ve la cuenta).
-- Mismas columnas que las líneas de `fn_asientos`. Cada asiento vive en UNA ubicación (para que el diario de una tienda
-- también cuadre): por eso el traslado del cierre a la caja fuerte o al líder no asienta (es 101 → 101).
create or replace function retail.fn_asientos_dinero_y_caja(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql stable set search_path = retail, public, extensions as $$
  with
  lim as (
    select (p_desde::timestamp at time zone 'America/Lima') as ini, ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin
  ),
  -- ===== Movimientos de dinero (F3) vigentes: la plata cambia de lugar o entra/sale del dueño.
  md as (
    select d.id, d.tipo, d.fecha, d.ubicacion_id as u, d.monto, d.referencia,
           o.cuenta_contable as c_o, o.nombre as n_o, de.cuenta_contable as c_d, de.nombre as n_d
      from retail.movimientos_dinero d
      left join retail.cuentas_dinero o on o.id = d.cuenta_origen_id
      left join retail.cuentas_dinero de on de.id = d.cuenta_destino_id
     where d.estado = 'vigente' and d.fecha between p_desde and p_hasta
       and (p_todo or d.ubicacion_id = any (p_ubics))
  ),
  l_md as (
    select md.fecha as f, md.u, ('dinero:' || md.id)::text as asiento, md.tipo::text as regla,
           (case md.tipo when 'retiro' then '591' when 'devolucion_prestamo' then '47' else md.c_d end)::text as cuenta,
           md.monto::numeric as debe, 0::numeric as haber, 'movimientos_dinero'::text as ot, md.id as oid,
           (retail.fn_texto_movimiento_dinero(md.tipo) || coalesce(' → ' || md.n_d, '') || coalesce(' · ' || md.referencia, ''))::text as glosa
      from md
    union all
    select md.fecha, md.u, 'dinero:' || md.id, md.tipo,
           case md.tipo when 'aporte' then '52' when 'prestamo' then '47' else md.c_o end,
           0, md.monto, 'movimientos_dinero', md.id,
           case md.tipo when 'aporte' then 'Capital adicional del dueño' when 'prestamo' then 'CAYLA le debe al dueño'
                else 'Sale de ' || coalesce(md.n_o, 'la cuenta') end
      from md
  ),
  -- ===== El traslado del cierre al banco: sale del cajón y llega al banco (F3b sella a cuál; la cuenta contable es la 104).
  tb as (
    select t.id, k.ubicacion_id as u, (t.creado_en at time zone 'America/Lima')::date as fecha, t.monto, un.nombre
      from retail.caja_traslados t
      join retail.cajas k on k.id = t.caja_id
      join retail.ubicaciones un on un.id = k.ubicacion_id
      cross join lim
     where t.destino = 'banco' and not k.es_prueba and t.creado_en >= lim.ini and t.creado_en < lim.fin
       and (p_todo or k.ubicacion_id = any (p_ubics))
  ),
  l_tb as (
    select tb.fecha as f, tb.u, ('traslado_banco:' || tb.id)::text as asiento, 'traslado_banco'::text as regla, '104'::text as cuenta,
           tb.monto::numeric as debe, 0::numeric as haber, 'caja_traslados'::text as ot, tb.id as oid,
           ('Depósito del cierre de caja · ' || tb.nombre)::text as glosa
      from tb
    union all
    select tb.fecha, tb.u, 'traslado_banco:' || tb.id, 'traslado_banco', '101', 0, tb.monto, 'caja_traslados', tb.id, 'Sale del cajón al banco'
      from tb
  ),
  -- ===== Lo que sobró o faltó al cerrar una caja (contado − lo que decía el sistema) y al abrirla (lo que se contó al
  -- abrir − el fondo que dejó el cierre anterior). Sin esto, la caja del diario nunca daría lo mismo que la de la tienda.
  dc as (
    select k.id, k.ubicacion_id as u, (k.cerrada_en at time zone 'America/Lima')::date as fecha, k.diferencia as dif, 'cierre'::text as cuando
      from retail.cajas k cross join lim
     where k.estado = 'cerrada' and not k.es_prueba and coalesce(k.diferencia, 0) <> 0
       and k.cerrada_en >= lim.ini and k.cerrada_en < lim.fin and (p_todo or k.ubicacion_id = any (p_ubics))
    union all
    select k.id, k.ubicacion_id, (k.abierta_en at time zone 'America/Lima')::date, k.monto_apertura - k.monto_apertura_esperado, 'apertura'
      from retail.cajas k cross join lim
     where not k.es_prueba and k.monto_apertura_esperado is not null and k.monto_apertura <> k.monto_apertura_esperado
       and k.abierta_en >= lim.ini and k.abierta_en < lim.fin and (p_todo or k.ubicacion_id = any (p_ubics))
  ),
  l_dc as (
    select dc.fecha as f, dc.u, ('caja_' || dc.cuando || ':' || dc.id)::text as asiento, 'diferencia_caja'::text as regla, '101'::text as cuenta,
           greatest(dc.dif, 0)::numeric as debe, greatest(-dc.dif, 0)::numeric as haber, 'cajas'::text as ot, dc.id as oid,
           (case when dc.dif > 0 then 'Sobró al ' else 'Faltó al ' end || case dc.cuando when 'cierre' then 'cerrar la caja' else 'abrir la caja' end)::text as glosa
      from dc
    union all
    select dc.fecha, dc.u, 'caja_' || dc.cuando || ':' || dc.id, 'diferencia_caja', '6599', greatest(-dc.dif, 0), greatest(dc.dif, 0), 'cajas', dc.id,
           case when dc.dif > 0 then 'Sobrante de caja' else 'Faltante de caja' end
      from dc
  )
  select * from l_md
  union all select * from l_tb
  union all select * from l_dc;
$$;
comment on function retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[]) is
  'USO INTERNO de fn_asientos (ADR-0195 F7): movimientos de dinero (plata del dueño, depósitos, abonos del POS, pago de la tarjeta, entre cuentas), el traslado del cierre al banco y las diferencias de caja al cerrar y al abrir.';
revoke all on function retail.fn_asientos_dinero_y_caja(date, date, boolean, uuid[]) from public, anon, authenticated;

-- El parche, sobre la definición VIVA (no la de un archivo: otra fase pudo tocarla). Cada ancla tiene que aparecer UNA vez;
-- si no, se detiene sin tocar nada. Si ya está parchada (tiene la marca), no hace nada.
do $parche$
declare
  v_def text := pg_get_functiondef('retail.fn_asientos(date,date,uuid)'::regprocedure);
  v_nuevo text;
  r record;
  v_veces integer;
begin
  if position('fn_asientos_dinero_y_caja' in v_def) > 0 then
    raise notice 'F7: fn_asientos ya suma las reglas del Balance; no se toca.';
    return;
  end if;
  v_nuevo := v_def;
  for r in
    select * from (values
      -- 1. Las reglas nuevas se suman al final del diario.
      ('union all select * from l_nc union all select * from l_pago',
       'union all select * from l_nc union all select * from l_pago' || chr(10) ||
       '    -- F7 (ADR-0195): plata del dueño, depósitos, abonos del POS, pago de la tarjeta, traslado del cierre al banco y' || chr(10) ||
       '    -- diferencias de caja.' || chr(10) ||
       '    union all select * from retail.fn_asientos_dinero_y_caja(p_desde, p_hasta, v_todo, v_ubics)'),
      -- 2. Lo que se le devuelve a una clienta sale por la cuenta por la que entró su cobro (tarjeta: 105), no por la
      --    tarjeta de crédito de CAYLA (451).
      ('fn_asiento_cuenta_de_medio(c.metodo, ''sale'')', 'fn_asiento_cuenta_de_medio(c.metodo, ''entra'')'),
      ('fn_asiento_cuenta_de_medio(dd.metodo, ''sale'')', 'fn_asiento_cuenta_de_medio(dd.metodo, ''entra'')'),
      ('fn_asiento_cuenta_de_medio(cb.metodo, ''sale'')', 'fn_asiento_cuenta_de_medio(cb.metodo, ''entra'')'),
      ('fn_asiento_cuenta_de_medio(sd.medio, ''sale'')', 'fn_asiento_cuenta_de_medio(sd.medio, ''entra'')')
    ) x(ancla, nuevo)
  loop
    v_veces := (length(v_nuevo) - length(replace(v_nuevo, r.ancla, ''))) / length(r.ancla);
    if v_veces <> 1 then
      raise exception 'F7: el ancla «%» aparece % veces en fn_asientos (se esperaba 1). No se tocó nada: revisa la definición viva.', r.ancla, v_veces;
    end if;
    v_nuevo := replace(v_nuevo, r.ancla, r.nuevo);
  end loop;
  execute v_nuevo;
end $parche$;

comment on function retail.fn_asientos(date, date, uuid) is
  'Diario derivado (ADR-0198 C, ADR-0120, ADR-0195 F5 y F7): genera las líneas debe/haber desde las operaciones (ventas, anulaciones, devoluciones, cambios, mermas, separaciones, gastos, facturas, activos, planilla, notas de crédito, pagos a proveedores y, desde F7, movimientos de dinero, traslados del cierre al banco y diferencias de caja). Única casa de las reglas de posteo. No guarda nada.';

reset lock_timeout;

-- ============================== PARTE 2 · los saldos de arranque y el Balance ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Los saldos de arranque ----------
create table if not exists retail.saldos_iniciales (
  id uuid primary key default gen_random_uuid(),
  -- El día de arranque: el saldo es el que había AL EMPEZAR ese día. Es el mismo para todas las filas vigentes.
  fecha date not null,
  cuenta text not null references retail.cuentas (codigo),
  -- Como un asiento de apertura: lo que tiene va al debe; lo que debe y lo que es tuyo, al haber.
  debe numeric(14,2) not null default 0 check (debe >= 0),
  haber numeric(14,2) not null default 0 check (haber >= 0),
  -- «sistema»: el valor lo propuso el sistema con lo que ya sabía a esa fecha; «manual»: lo escribió el líder.
  origen text not null default 'manual' check (origen in ('sistema', 'manual')),
  nota text check (nota is null or char_length(nota) <= 300),
  -- Una corrección es una fila NUEVA que reemplaza a otra (una sola vez), con su motivo. La reemplazada queda a la vista.
  reemplaza_id uuid references retail.saldos_iniciales (id),
  motivo text check (motivo is null or char_length(motivo) <= 300),
  registrado_por uuid references public.personas (id),
  created_at timestamptz not null default clock_timestamp(),
  constraint saldos_iniciales_un_lado check (not (debe > 0 and haber > 0)),
  constraint saldos_iniciales_correccion_con_motivo check (reemplaza_id is null or char_length(trim(coalesce(motivo, ''))) >= 5)
);
comment on table retail.saldos_iniciales is
  'Lo que CAYLA tenía al empezar el día de arranque, cuenta por cuenta (ADR-0195 F7, ADR-0198): el punto de partida del Balance. Solo se agregan filas; una corrección reemplaza a otra con motivo. Lo registra el líder.';
create unique index if not exists saldos_iniciales_reemplaza_uq on retail.saldos_iniciales (reemplaza_id) where reemplaza_id is not null;
create index if not exists saldos_iniciales_cuenta_idx on retail.saldos_iniciales (cuenta);
alter table retail.saldos_iniciales enable row level security;
revoke all on table retail.saldos_iniciales from public, anon, authenticated;

create or replace function retail.fn_saldos_iniciales_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Un saldo de arranque no se edita ni se borra: se corrige con una fila nueva y su motivo.' using errcode = 'P0001';
end $$;
-- `create or replace trigger` y nunca `drop trigger`: en Supabase un `drop trigger` (aunque no exista) toma en exclusiva
-- las tablas de `auth` y `storage` y puede trabarse con el Asesor de seguridad al pegar (40P01).
create or replace trigger saldos_iniciales_inmutable before update or delete on retail.saldos_iniciales
  for each row execute function retail.fn_saldos_iniciales_inmutable();

-- Las filas vigentes: las que ninguna otra reemplazó.
create or replace function retail.fn_saldos_iniciales_vigentes()
returns table (id uuid, fecha date, cuenta text, debe numeric, haber numeric, origen text, nota text)
language sql stable set search_path = retail, public, extensions as $$
  select s.id, s.fecha, s.cuenta, s.debe, s.haber, s.origen, s.nota
    from retail.saldos_iniciales s
   where not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id);
$$;

create or replace function retail.fn_fecha_de_arranque() returns date
language sql stable set search_path = retail, public, extensions as $$
  select min(v.fecha) from retail.fn_saldos_iniciales_vigentes() v;
$$;

-- De qué lado vive el saldo de una cuenta: lo que tiene (activo, salvo la depreciación acumulada 39x) y los gastos, en el
-- debe; lo que debe, lo tuyo y los ingresos, en el haber.
create or replace function retail.fn_cuenta_deudora(p_cuenta text) returns boolean
language sql stable set search_path = retail, public, extensions as $$
  select k.tipo in ('activo', 'gasto') and k.codigo not like '39%' from retail.cuentas k where k.codigo = p_cuenta;
$$;

-- El diario que lee el Balance: el oficial. Si ya existe el cierre de mes (F9, `fn_diario`: lo congelado de cada unidad
-- y mes cerrados, y `fn_asientos` para lo abierto), ese; si no, `fn_asientos`. Así el Balance de un mes cerrado no cambia
-- aunque alguien toque algo después, y esta migración no depende del orden en que se peguen F7 y F9.
create or replace function retail.fn_bal_diario(p_desde date, p_hasta date)
returns table (fecha date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric)
language plpgsql stable set search_path = retail, public, extensions as $$
begin
  if to_regprocedure('retail.fn_diario(date,date,uuid)') is not null then
    return query execute
      'select d.fecha, d.ubicacion_id, d.asiento, d.regla, d.cuenta, d.debe, d.haber from retail.fn_diario($1, $2, null) d'
      using p_desde, p_hasta;
  else
    return query
      select a.fecha, a.ubicacion_id, a.asiento, a.regla, a.cuenta, a.debe, a.haber from retail.fn_asientos(p_desde, p_hasta, null) a;
  end if;
end $$;

-- ---------- 2. El «otro camino» de cada cuenta: su registro propio, a una fecha ----------
-- Todas son de USO INTERNO (sin permiso para nadie): las leen las funciones de abajo, que ya piden su permiso.

-- Las cuentas de dinero (F3) al cierre de un día, con la misma regla de `fn_cuentas_dinero_saldos` pero sin filtrar por
-- quién mira. El cajón lo dice la caja: abierta (y el corte es hoy o después), su esperado; si no, el fondo del último
-- cierre hasta ese día.
create or replace function retail.fn_bal_dinero(p_corte date)
returns table (cuenta_dinero_id uuid, tipo text, cuenta_contable text, ubicacion_id uuid, nombre text, saldo numeric, caja_abierta boolean,
               saldo_inicial numeric, saldo_desde date)
language sql stable set search_path = retail, public, extensions as $$
  with libro as materialized (
    select l.cuenta_id, l.fecha, l.monto from retail.fn_dinero_libro(p_corte) l where l.cuenta_id is not null
  )
  select c.id, c.tipo, c.cuenta_contable, c.ubicacion_id, c.nombre,
         case
           when c.tipo = 'cajon' and ab.id is not null and p_corte >= retail.fn_hoy_lima() then
             (select e.esperado from retail.fn_calcular_esperado_caja(ab.id) e)
           when c.tipo = 'cajon' then
             coalesce((select coalesce(k.monto_fondo, k.monto_cierre_real) from retail.cajas k
                        where k.ubicacion_id = c.ubicacion_id and k.estado = 'cerrada' and not k.es_prueba
                          and (k.cerrada_en at time zone 'America/Lima')::date <= p_corte
                        order by k.cerrada_en desc limit 1), 0)
           else c.saldo_inicial + coalesce((select sum(l.monto) from libro l
                                              where l.cuenta_id = c.id and (c.saldo_desde is null or l.fecha >= c.saldo_desde)), 0)
         end,
         ab.id is not null, c.saldo_inicial, c.saldo_desde
    from retail.cuentas_dinero c
    left join lateral (select k.id from retail.cajas k where k.ubicacion_id = c.ubicacion_id and k.estado = 'abierta' and not k.es_prueba limit 1) ab
      on c.tipo = 'cajon';
$$;

-- Las prendas en stock al cierre de un día, por ubicación, al costo de ese día. El stock de hoy menos lo que se movió
-- después; el costo, el que regía (`fn_costo_variante_al`, F5), o el de hoy si el corte es hoy.
create or replace function retail.fn_bal_stock(p_corte date)
returns table (ubicacion_id uuid, unidades bigint, valor numeric)
language sql stable set search_path = retail, public, extensions as $$
  with
  fin as (select ((p_corte + 1)::timestamp at time zone 'America/Lima') as t, p_corte >= retail.fn_hoy_lima() as es_hoy),
  actual as (select s.variante_id, s.ubicacion_id, sum(s.cantidad)::bigint as q from retail.stock s group by 1, 2),
  despues as (
    select m.variante_id, m.ubicacion_id,
           -sum(case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad when 'ajuste' then m.cantidad
                            when 'traslado' then -m.cantidad else 0 end)::bigint as q
      from retail.movimientos m cross join fin
     where m.created_at >= fin.t and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado')
     group by 1, 2
    union all
    select m.variante_id, m.ubicacion_destino_id, -sum(m.cantidad)::bigint
      from retail.movimientos m cross join fin
     where m.created_at >= fin.t and m.tipo = 'traslado'
     group by 1, 2
  ),
  al_corte as (
    select x.variante_id, x.ubicacion_id, sum(x.q) as q
      from (select * from actual union all select * from despues) x
     where x.variante_id <> '22222222-2222-4222-8222-222222222222'
     group by 1, 2
    having sum(x.q) <> 0
  )
  select a.ubicacion_id, sum(a.q)::bigint,
         round(sum(a.q * case when fin.es_hoy then v.costo else retail.fn_costo_variante_al(a.variante_id, fin.t) end), 2)
    from al_corte a join retail.variantes v on v.id = a.variante_id cross join fin
   group by a.ubicacion_id;
$$;

-- Lo que salió de una tienda hacia otra y todavía no se recibió al cierre de un día (sigue siendo de CAYLA). Un traslado
-- ya cerrado no está en camino: lo que no llegó se perdió (lo dice la comprobación).
create or replace function retail.fn_bal_transito(p_corte date) returns numeric
language sql stable set search_path = retail, public, extensions as $$
  with
  fin as (select ((p_corte + 1)::timestamp at time zone 'America/Lima') as t, p_corte >= retail.fn_hoy_lima() as es_hoy),
  env as (
    select ti.transferencia_id as tid, m.variante_id, sum(m.cantidad) as q
      from retail.movimientos m join retail.transferencia_items ti on ti.id = m.transferencia_item_id cross join fin
     where m.tipo = 'salida' and m.created_at < fin.t
     group by 1, 2
  ),
  rec as (
    select tr.transferencia_id as tid, m.variante_id, sum(m.cantidad) as q
      from retail.movimientos m join retail.transferencia_recepciones tr on tr.id = m.transferencia_recepcion_id cross join fin
     where m.tipo = 'entrada' and m.created_at < fin.t
     group by 1, 2
  )
  select coalesce(round(sum((e.q - coalesce(r.q, 0))
           * case when fin.es_hoy then v.costo else retail.fn_costo_variante_al(e.variante_id, fin.t) end), 2), 0)
    from env e
    left join rec r on r.tid = e.tid and r.variante_id = e.variante_id
    join retail.transferencias t on t.id = e.tid
    join retail.variantes v on v.id = e.variante_id
    cross join fin
   where e.q > coalesce(r.q, 0) and not (t.cerrado_en is not null and t.cerrado_en < fin.t);
$$;

-- Lo facturado de mercadería que todavía no llegó al cierre de un día (el diario ya lo sumó a la 201 con la factura).
-- Lo que se cerró sin recibir no está: el proveedor no lo va a mandar (lo dice la comprobación).
create or replace function retail.fn_bal_por_recibir(p_corte date) returns numeric
language sql stable set search_path = retail, public, extensions as $$
  with fin as (select ((p_corte + 1)::timestamp at time zone 'America/Lima') as t)
  select coalesce(round(sum(greatest(0, ci.cantidad - coalesce(rc.q, 0) - coalesce(ce.q, 0)) * ci.costo_unitario), 2), 0)
    from retail.compra_items ci
    join retail.compras c on c.id = ci.compra_id
    cross join fin
    left join lateral (select sum(m.cantidad) as q from retail.movimientos m
                        where m.compra_item_id = ci.id and m.tipo = 'entrada' and m.created_at < fin.t) rc on true
    left join lateral (select sum(x.cantidad) as q from retail.compra_item_cierres x
                        where x.compra_item_id = ci.id and x.created_at < fin.t) ce on true
   where c.naturaleza = 'mercaderia' and c.estado = 'vigente' and c.fecha_emision <= p_corte;
$$;

-- Los activos fijos al cierre de un día: su costo y lo depreciado hasta el último fin de mes (el diario asienta la
-- depreciación de cada mes el último día del mes, con la misma cuenta de F2b).
create or replace function retail.fn_bal_activos(p_corte date)
returns table (activo_id uuid, ubicacion_id uuid, cuenta text, costo numeric, depreciacion numeric, estado text)
language sql stable set search_path = retail, public, extensions as $$
  with m as (
    select case when p_corte = (date_trunc('month', p_corte) + interval '1 month - 1 day')::date then p_corte
                else (date_trunc('month', p_corte) - interval '1 day')::date end as fin_mes
  )
  select a.id, a.ubicacion_id, coalesce(a.cuenta_codigo, t.cuenta_pcge, '336'), a.costo,
         least(a.costo - a.valor_residual, round((a.costo - a.valor_residual) / a.vida_util_meses
               * retail.fn_meses_depreciados(a.fecha_adquisicion, a.vida_util_meses, m.fin_mes, a.fecha_baja), 2)),
         a.estado
    from retail.activos_fijos a
    left join retail.tipos_activo t on t.codigo = a.tipo
    cross join m
   where a.estado <> 'anulado' and a.fecha_adquisicion <= p_corte
     and not (a.estado = 'baja' and a.fecha_baja <= p_corte);
$$;

-- El saldo de cada comprobante de proveedor (mercadería, gasto o activo) al cierre de un día: total − lo pagado − lo que
-- sus notas de crédito le descontaron. Una factura anulada nunca existió (como en el diario).
create or replace function retail.fn_bal_facturas(p_corte date)
returns table (compra_id uuid, ubicacion_gestion_id uuid, naturaleza text, saldo numeric)
language sql stable set search_path = retail, public, extensions as $$
  select c.id, c.ubicacion_gestion_id, c.naturaleza, c.total - coalesce(pg.m, 0) - coalesce(nc.m, 0)
    from retail.compras c
    left join lateral (select sum(p.monto) as m from retail.compra_pagos p where p.compra_id = c.id and p.fecha <= p_corte) pg on true
    left join lateral (select sum(n.aplicado) as m from retail.compra_notas_credito n where n.compra_id = c.id and n.fecha <= p_corte) nc on true
   where c.estado = 'vigente' and c.fecha_emision <= p_corte;
$$;

-- Lo que los proveedores le deben a CAYLA (saldo a favor) al cierre de un día: lo que sus notas de crédito excedieron,
-- menos lo que ya se usó para pagar otra factura y lo que devolvieron en plata. Baja lo que CAYLA les debe.
create or replace function retail.fn_bal_saldo_a_favor(p_corte date) returns numeric
language sql stable set search_path = retail, public, extensions as $$
  select coalesce((select sum(n.monto - n.aplicado) from retail.compra_notas_credito n join retail.compras c on c.id = n.compra_id
                    where c.estado = 'vigente' and n.fecha <= p_corte), 0)
       - coalesce((select sum(p.monto) from retail.compra_pagos p join retail.compras c on c.id = p.compra_id
                    where c.estado = 'vigente' and p.metodo = 'saldo_a_favor' and p.fecha <= p_corte), 0)
       - coalesce((select sum(r.monto) from retail.proveedor_creditos r where r.tipo = 'reembolso' and r.fecha <= p_corte), 0);
$$;

-- La parte de cada tienda en lo que se debe al cierre de un día: el reparto de ADR-0139 (`compra_parte_por_tienda`)
-- menos lo que se pagó a nombre de la tienda, sin pasar el saldo de la factura (la regla de `fn_saldo_de_tienda`,
-- ADR-0187, a una fecha).
create or replace function retail.fn_bal_facturas_de_tienda(p_corte date)
returns table (ubicacion_id uuid, saldo numeric)
language sql stable set search_path = retail, public, extensions as $$
  with f as (select * from retail.fn_bal_facturas(p_corte) where saldo > 0)
  select pt.ubicacion_id,
         sum(greatest(0, least(
           pt.total - coalesce((select sum(g.monto) from retail.compra_pagos g
                                 where g.compra_id = pt.compra_id and g.ubicacion_id = pt.ubicacion_id and g.fecha <= p_corte), 0),
           f.saldo)))
    from retail.compra_parte_por_tienda pt join f on f.compra_id = pt.compra_id
   group by pt.ubicacion_id;
$$;

-- Los adelantos de separaciones que al cierre de un día todavía no se aplicaron a una venta ni se devolvieron (sin su IGV,
-- que la boleta de anticipo ya declaró). Una separación liberada que CAYLA se queda sigue aquí (F5).
create or replace function retail.fn_bal_anticipos(p_corte date)
returns table (ubicacion_id uuid, monto numeric)
language sql stable set search_path = retail, public, extensions as $$
  with fin as (select ((p_corte + 1)::timestamp at time zone 'America/Lima') as t)
  select s.ubicacion_id,
         sum(s.adelanto - round(s.adelanto - s.adelanto / (1 + retail.fn_tasa_igv((s.created_at at time zone 'America/Lima')::date)), 2))
    from retail.separaciones s cross join fin
   where s.created_at < fin.t
     and not (s.devuelta_en is not null and s.devuelta_en < fin.t)
     and not exists (select 1 from retail.ventas v where v.id = s.venta_id and v.created_at < fin.t)
   group by s.ubicacion_id;
$$;

-- El otro camino, cuenta por cuenta, en debe − haber (lo que tiene en positivo; lo que debe, en negativo). Solo las
-- cuentas que tienen un registro propio; el resto (IGV, planilla, capital, préstamo y aportes del dueño) sale solo del
-- diario.
create or replace function retail.fn_bal_otro_camino(p_corte date)
returns table (cuenta text, saldo numeric)
language sql stable set search_path = retail, public, extensions as $$
  select d.cuenta_contable, sum(d.saldo) from retail.fn_bal_dinero(p_corte) d group by d.cuenta_contable
  union all
  select '201', coalesce((select sum(s.valor) from retail.fn_bal_stock(p_corte) s), 0)
              + retail.fn_bal_transito(p_corte) + retail.fn_bal_por_recibir(p_corte)
  union all
  select a.cuenta, sum(a.costo) from retail.fn_bal_activos(p_corte) a group by a.cuenta
  union all
  select '391', -coalesce((select sum(a.depreciacion) from retail.fn_bal_activos(p_corte) a), 0)
  union all
  select '421', -(coalesce((select sum(f.saldo) from retail.fn_bal_facturas(p_corte) f), 0) - retail.fn_bal_saldo_a_favor(p_corte))
  union all
  select '122', -coalesce((select sum(x.monto) from retail.fn_bal_anticipos(p_corte) x), 0);
$$;

-- ---------- 3. Por qué no cuadra: las causas que la comprobación sabe medir ----------
-- Cada fila: la cuenta, una clave, el texto para Felipe y el monto con que explica la diferencia (diario − otro camino,
-- en debe − haber). `acepta` = la diferencia no hace falso el Balance (plata que el diario ubica en el banco correcto
-- pero que Cuentas y dinero todavía no sabe a qué cuenta fue).
create or replace function retail.fn_bal_causas_dinero(p_desde date, p_hasta date)
returns table (cuenta text, clave text, texto text, monto numeric, acepta boolean)
language plpgsql stable set search_path = retail, public, extensions as $$
declare
  v_ini timestamptz := (p_desde::timestamp at time zone 'America/Lima');
  v_fin timestamptz := ((p_hasta + 1)::timestamp at time zone 'America/Lima');
  v_taller_caja boolean := exists (select 1 from information_schema.columns
                                    where table_schema = 'retail' and table_name = 'comprobantes_produccion_pagos' and column_name = 'caja_movimiento_id');
  v_reemb_caja boolean := exists (select 1 from information_schema.columns
                                   where table_schema = 'retail' and table_name = 'proveedor_creditos' and column_name = 'caja_movimiento_id');
  v_taller_ids uuid[] := '{}';
  v_reemb_ids uuid[] := '{}';
begin
  if v_taller_caja then
    execute 'select coalesce(array_agg(caja_movimiento_id), ''{}'') from retail.comprobantes_produccion_pagos where caja_movimiento_id is not null'
      into v_taller_ids;
  end if;
  if v_reemb_caja then
    execute 'select coalesce(array_agg(caja_movimiento_id), ''{}'') from retail.proveedor_creditos where caja_movimiento_id is not null'
      into v_reemb_ids;
  end if;

  return query
  with
  libro as materialized (select * from retail.fn_dinero_libro(p_hasta) l where l.fecha >= p_desde),
  -- a. Plata que se movió y Cuentas y dinero todavía no sabe a qué cuenta fue: el diario la ubica por su medio.
  sin_cuenta as (
    select case
             when l.origen = 'cobros' then case when split_part(l.clave, ':', 4) = 'tarjeta' then '105' else '104' end
             when l.origen = 'traslado' then '104'
             when l.clave like 'pago:%' then (select case cp.metodo when 'efectivo' then '101' when 'tarjeta' then '451' else '104' end
                                                from retail.compra_pagos cp where cp.id = substr(l.clave, 6)::uuid)
             when l.clave like 'gasto:%' then (select case g.medio_pago when 'efectivo' then '101' when 'tarjeta' then '451' else '104' end
                                                 from retail.gastos g where g.id = substr(l.clave, 7)::uuid)
             when l.clave like 'activo:%' then (select case a.medio_pago when 'efectivo' then '101' when 'tarjeta' then '451' else '104' end
                                                  from retail.activos_fijos a where a.id = substr(l.clave, 8)::uuid)
             when l.clave like 'reembolso:%' then (select case r.metodo when 'efectivo' then '101' else '104' end
                                                     from retail.proveedor_creditos r where r.id = substr(l.clave, 11)::uuid)
           end as cta,
           l.monto
      from libro l
     where l.cuenta_id is null and l.clave not like 'pagoprod:%'
  ),
  -- b. Lo que Cuentas y dinero descuenta y el diario todavía no tiene: los pagos del Taller (Producción).
  taller as (
    select c.cuenta_contable as cta, l.monto
      from libro l join retail.cuentas_dinero c on c.id = l.cuenta_id
     where l.clave like 'pagoprod:%'
  ),
  -- c/d. Lo que salió o entró de un cajón y el diario no sabe qué fue.
  cm as (
    select m.id, m.tipo, m.monto, m.separacion_id,
           case when m.tipo = 'egreso' then retail.fn_egreso_ya_usado(m.id) end as uso
      from retail.caja_movimientos m join retail.cajas k on k.id = m.caja_id
     where not k.es_prueba and m.created_at >= v_ini and m.created_at < v_fin
  ),
  cajon as (
    select '101'::text as cta, 'sin_clasificar'::text as clave, 'Egresos de caja sin clasificar (en Gastos ▸ Egresos por clasificar)'::text as texto,
           sum(cm.monto) as monto
      from cm
     where cm.tipo = 'egreso' and cm.uso is null
       and not exists (select 1 from retail.separaciones s where s.devolucion_caja_movimiento_id = cm.id)
    union all
    select '101', 'no_es_gasto', 'Egresos marcados «no es gasto» que no dicen adónde fue la plata (un depósito o un retiro se registran en Cuentas y dinero)',
           sum(cm.monto) from cm where cm.tipo = 'egreso' and cm.uso = 'no_gasto'
    union all
    select '101', 'taller_cajon', 'Pagos del Taller que salieron de un cajón (el diario todavía no tiene los insumos de Producción)',
           sum(cm.monto) from cm where cm.tipo = 'egreso' and cm.uso = 'pago' and cm.id = any (v_taller_ids)
    union all
    select '101', 'apartados', 'Adelantos de apartados en efectivo (el diario todavía no los tiene)',
           -sum(cm.monto) from cm
     where cm.tipo = 'ingreso' and exists (select 1 from retail.apartados ap where ap.adelanto_caja_movimiento_id = cm.id)
    union all
    select '101', 'ingreso_sin_origen', 'Ingresos de caja que no dicen de dónde vino la plata',
           -sum(cm.monto) from cm
     where cm.tipo = 'ingreso' and cm.separacion_id is null
       and not exists (select 1 from retail.separacion_pagos sp where sp.caja_movimiento_id = cm.id)
       and not exists (select 1 from retail.apartados ap where ap.adelanto_caja_movimiento_id = cm.id)
       and not (cm.id = any (v_reemb_ids))
  ),
  -- e. La primera vez que abre una caja (sin un cierre anterior) el fondo llega de afuera.
  primeras as (
    select sum(k.monto_apertura) as monto from retail.cajas k
     where not k.es_prueba and k.monto_apertura_esperado is null and k.monto_apertura > 0 and k.abierta_en >= v_ini and k.abierta_en < v_fin
  ),
  -- f. Devoluciones que reembolsaron distinto de lo devuelto: el diario las vale por sus líneas; la caja y el banco, por
  -- lo que se reembolsó.
  dev as (
    select case d.reembolso_metodo when 'efectivo' then '101' when 'tarjeta' then '105' else '104' end as cta,
           coalesce(d.reembolso_monto, 0) - sum((vi.precio_unitario - vi.descuento_unitario) * di.cantidad) as monto
      from retail.devoluciones d
      join retail.ventas v on v.id = d.venta_id
      join retail.devolucion_items di on di.devolucion_id = d.id
      join retail.venta_items vi on vi.id = di.venta_item_id
     where d.estado = 'aprobada' and d.aprobado_en >= v_ini and d.aprobado_en < v_fin and not coalesce(v.es_prueba, false)
     group by d.id, d.reembolso_metodo, d.reembolso_monto
  ),
  -- g. Una cuenta que empieza con su saldo DESPUÉS del arranque: ese saldo no está en el arranque ni en el diario.
  nuevas as (
    select c.cuenta_contable as cta, c.nombre, c.saldo_desde,
           -c.saldo_inicial + coalesce((select sum(l.monto) from libro l where l.cuenta_id = c.id and l.fecha < c.saldo_desde), 0) as monto
      from retail.cuentas_dinero c
     where c.saldo_desde > p_desde and c.saldo_desde <= p_hasta and c.tipo not in ('cajon')
  )
  select s.cta, 'sin_cuenta', 'Movimientos que todavía no dicen a qué cuenta fueron (Cuentas y dinero los muestra aparte)', sum(s.monto), true
    from sin_cuenta s where s.cta is not null group by s.cta having sum(s.monto) <> 0
  union all
  select t.cta, 'pagos_taller', 'Pagos del Taller (el diario todavía no tiene los insumos de Producción)', -sum(t.monto), false
    from taller t group by t.cta having sum(t.monto) <> 0
  union all
  select c.cta, c.clave, c.texto, c.monto, false from cajon c where coalesce(c.monto, 0) <> 0
  union all
  select '101', 'primera_apertura', 'Cajas que abrieron por primera vez (su fondo llegó de afuera)', -p.monto, false
    from primeras p where coalesce(p.monto, 0) <> 0
  union all
  select d.cta, 'devoluciones', 'Devoluciones que reembolsaron distinto de lo devuelto', sum(d.monto), false
    from dev d group by d.cta having sum(d.monto) <> 0
  union all
  select n.cta, 'cuenta_nueva', '«' || n.nombre || '» empieza con su saldo el ' || to_char(n.saldo_desde, 'DD/MM/YYYY') || ', después del arranque', n.monto, false
    from nuevas n where n.monto <> 0;
end $$;

-- Las causas de la 201: lo que movió el stock sin asiento, o lo movió a otro valor.
create or replace function retail.fn_bal_causas_mercaderia(p_desde date, p_hasta date)
returns table (clave text, texto text, monto numeric)
language sql stable set search_path = retail, public, extensions as $$
  with
  lim as (select (p_desde::timestamp at time zone 'America/Lima') as ini, ((p_hasta + 1)::timestamp at time zone 'America/Lima') as fin),
  mv as (
    select m.*, (case m.tipo when 'salida' then -m.cantidad else m.cantidad end) as dq,
           coalesce((select h.costo_unitario_nuevo from retail.costo_historial h where h.movimiento_id = m.id),
                    retail.fn_costo_variante_al(m.variante_id, m.created_at)) as c_mov
      from retail.movimientos m cross join lim
     where m.created_at >= lim.ini and m.created_at < lim.fin and m.tipo in ('entrada', 'salida', 'ajuste')
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
  ),
  c as (
    -- Prendas que entraron por Producción (el diario todavía no tiene el costo del Taller).
    select 'produccion'::text as clave, 'Prendas que entraron (o se revirtieron) por Producción: el diario todavía no tiene el costo del Taller'::text as texto,
           -sum(mv.dq * mv.c_mov) as monto
      from mv where mv.motivo in ('produccion', 'reversion_produccion')
    union all
    select 'recepcion_sin_factura', 'Mercadería recibida sin factura',
           -sum(mv.dq * mv.c_mov) from mv where mv.tipo = 'entrada' and mv.motivo = 'recepcion' and mv.compra_item_id is null
    union all
    select 'recibido_antes', 'Mercadería recibida antes de la fecha de su factura (o de una factura anulada)',
           -sum(mv.dq * ci.costo_unitario)
      from mv join retail.compra_items ci on ci.id = mv.compra_item_id join retail.compras k on k.id = ci.compra_id
     where mv.tipo = 'entrada' and (k.estado <> 'vigente' or k.fecha_emision > p_hasta)
    union all
    select 'otras_entradas', 'Sobrantes de conteo y otras entradas sin asiento',
           -sum(mv.dq * mv.c_mov) from mv
     where (mv.tipo = 'entrada' and coalesce(mv.motivo, '') not in ('recepcion', 'produccion', 'traslado_entrada', 'devolucion', 'cambio', 'anulacion_venta'))
        or (mv.tipo = 'ajuste' and mv.cantidad > 0)
    union all
    select 'otras_salidas', 'Salidas que no son venta ni merma (devoluciones al proveedor, regularizaciones…)',
           -sum(mv.dq * mv.c_mov) from mv
     where (mv.tipo = 'salida' and coalesce(mv.motivo, '') not in ('venta', 'cambio', 'traslado_salida', 'reversion_produccion')
            and not retail.fn_es_merma(mv.tipo, mv.motivo, mv.cantidad))
        or (mv.tipo = 'ajuste' and mv.cantidad < 0 and not retail.fn_es_merma(mv.tipo, mv.motivo, mv.cantidad))
    union all
    -- Lo que vuelve de una clienta entra al stock al costo del día; el diario lo devuelve al costo sellado en la venta.
    select 'costo_del_dia', 'Devoluciones, cambios y anulaciones que volvieron al stock al costo del día, no al de la venta',
           sum(mv.cantidad * (coalesce(vd.costo_unitario, vc.costo_unitario, va.costo_unitario) - mv.c_mov))
      from mv
      left join retail.devolucion_items di on di.id = mv.devolucion_item_id
      left join retail.venta_items vd on vd.id = di.venta_item_id
      left join retail.cambios cb on cb.id = mv.cambio_id and mv.tipo = 'entrada'
      left join retail.venta_items vc on vc.id = cb.venta_item_id
      left join retail.venta_items va on va.id = mv.venta_item_id and mv.motivo = 'anulacion_venta'
     where mv.tipo = 'entrada' and mv.motivo in ('devolucion', 'cambio', 'anulacion_venta')
       and coalesce(vd.costo_unitario, vc.costo_unitario, va.costo_unitario) > 0
    union all
    -- El costo promedio se redondea a céntimos: cada compra revalúa el stock que ya había por unos céntimos.
    select 'redondeo', 'Redondeo del costo promedio al recibir',
           -sum((h.stock_previo + h.cantidad_nueva) * h.costo_resultante - h.stock_previo * h.costo_anterior - h.cantidad_nueva * h.costo_unitario_nuevo)
      from retail.costo_historial h cross join lim
     where h.created_at >= lim.ini and h.created_at < lim.fin
    union all
    select 'notas_credito', 'Notas de crédito de mercadería (bajan lo que costó; las prendas no se mueven)',
           -sum(n.subtotal)
      from retail.compra_notas_credito n join retail.compras k on k.id = n.compra_id
     where k.naturaleza = 'mercaderia' and k.estado = 'vigente' and n.fecha between p_desde and p_hasta
    union all
    select 'subtotal_distinto', 'Facturas de mercadería cuyo subtotal no es la suma de sus prendas',
           sum(k.subtotal - coalesce((select sum(ci.subtotal) from retail.compra_items ci where ci.compra_id = k.id), 0))
      from retail.compras k
     where k.naturaleza = 'mercaderia' and k.estado = 'vigente' and k.fecha_emision between p_desde and p_hasta
    union all
    select 'cerradas_sin_recibir', 'Prendas facturadas que el proveedor no mandó (cerradas sin recibir)',
           sum(x.cantidad * ci.costo_unitario)
      from retail.compra_item_cierres x join retail.compra_items ci on ci.id = x.compra_item_id join retail.compras k on k.id = ci.compra_id
      cross join lim
     where k.estado = 'vigente' and k.fecha_emision <= p_hasta and x.created_at >= lim.ini and x.created_at < lim.fin
    union all
    select 'faltante_traslado', 'Prendas que no llegaron en un traslado entre tiendas ya cerrado',
           sum(p.q * retail.fn_costo_variante_al(p.variante_id, p.cerrado_en))
      from (
        select t.id, t.cerrado_en, ti.variante_id,
               coalesce(sum(m.cantidad) filter (where m.tipo = 'salida' and m.transferencia_item_id = ti.id), 0)
             - coalesce((select sum(m2.cantidad) from retail.movimientos m2 join retail.transferencia_recepciones tr on tr.id = m2.transferencia_recepcion_id
                          where tr.transferencia_id = t.id and m2.variante_id = ti.variante_id and m2.tipo = 'entrada'), 0) as q
          from retail.transferencias t
          join retail.transferencia_items ti on ti.transferencia_id = t.id
          left join retail.movimientos m on m.transferencia_item_id = ti.id
          cross join lim
         where t.cerrado_en >= lim.ini and t.cerrado_en < lim.fin
         group by t.id, t.cerrado_en, ti.id, ti.variante_id
      ) p where p.q > 0
  )
  select c.clave, c.texto, round(c.monto, 2) from c where coalesce(round(c.monto, 2), 0) <> 0;
$$;

-- ---------- 4. Quién ve qué ----------
create or replace function retail.fn_exigir_lider_balance() returns void
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'El Balance de CAYLA entera y sus saldos de arranque los ve el líder. Con «Reportes financieros» ves lo que es de tu tienda.' using errcode = '42501';
  end if;
end $$;

-- ---------- 5. Lecturas ----------

-- Los saldos de arranque (todas las filas: las vigentes y las reemplazadas, que quedan a la vista). Solo el líder.
create or replace function retail.fn_saldos_iniciales()
returns table (id uuid, fecha date, cuenta text, nombre text, tipo text, monto numeric, debe numeric, haber numeric, origen text,
               nota text, motivo text, reemplaza_id uuid, vigente boolean, registrado_por_nombre text, creado_en timestamptz)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
begin
  perform retail.fn_exigir_lider_balance();
  return query
  select s.id, s.fecha, s.cuenta, k.nombre, k.tipo,
         case when retail.fn_cuenta_deudora(s.cuenta) then s.debe - s.haber else s.haber - s.debe end,
         s.debe, s.haber, s.origen, s.nota, s.motivo, s.reemplaza_id,
         not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id),
         trim(concat_ws(' ', p.nombres, p.apellidos)), s.created_at
    from retail.saldos_iniciales s
    join retail.cuentas k on k.codigo = s.cuenta
    left join public.personas p on p.id = s.registrado_por
   order by k.orden, s.created_at;
end $$;

-- Lo que el sistema propone para el día de arranque: lo que ya sabe al cierre del día anterior (caja y bancos de F3,
-- mercadería, activos, facturas por pagar, adelantos, plata del dueño que ya pasó por Cuentas y dinero), y las cuentas que
-- solo el líder puede decir (IGV, planilla por pagar, capital, utilidades acumuladas) con lo vigente o en cero.
-- `monto` va con el signo natural de la cuenta (lo que tiene, lo que debe o lo tuyo, en positivo). Solo el líder.
create or replace function retail.fn_saldos_iniciales_propuesta(p_fecha date)
returns table (cuenta text, nombre text, tipo text, monto numeric, origen text, detalle text, vigente numeric, orden integer)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_dia date;
begin
  perform retail.fn_exigir_lider_balance();
  if p_fecha is null then
    raise exception 'Elige el día de arranque.' using errcode = 'P0001';
  end if;
  v_dia := p_fecha - 1;
  return query
  with
  sistema as (
    select o.cuenta as cta, sum(o.saldo) as d from retail.fn_bal_otro_camino(v_dia) o group by o.cuenta
  ),
  dinero as (
    select d.cuenta_contable as cta, string_agg(d.nombre || ' S/ ' || to_char(d.saldo, 'FM999G999G990D00'), ' · ' order by d.nombre) as txt
      from retail.fn_bal_dinero(v_dia) d where d.saldo <> 0 group by d.cuenta_contable
  ),
  dueno as (
    select coalesce(sum(case d.tipo when 'prestamo' then d.monto when 'devolucion_prestamo' then -d.monto else 0 end), 0) as prestamo,
           coalesce(sum(case d.tipo when 'aporte' then d.monto else 0 end), 0) as aporte
      from retail.movimientos_dinero d where d.estado = 'vigente' and d.fecha < p_fecha
  ),
  vig as (
    select v.cuenta as cta, sum(v.debe - v.haber) as d from retail.fn_saldos_iniciales_vigentes() v group by v.cuenta
  ),
  lineas as (
    -- Lo que el sistema sabe.
    select s.cta, 'sistema'::text as origen, s.d,
           case s.cta
             when '101' then coalesce('Cuentas y dinero: ' || (select x.txt from dinero x where x.cta = '101'), 'Cajones, cajas fuertes y lo entregado al líder')
             when '104' then coalesce('Cuentas y dinero: ' || (select x.txt from dinero x where x.cta = '104'), 'Ningún banco con saldo: agrégalos en Configuración ▸ Cuentas y cobros')
             when '105' then 'Lo cobrado con tarjeta que el banco todavía no abona'
             when '451' then 'Lo que se debe de la tarjeta de crédito (Cuentas y dinero)'
             when '201' then 'Stock × costo de cada prenda, más lo que está en camino y lo facturado por recibir'
             when '391' then 'Lo depreciado de los activos fijos hasta el mes anterior'
             when '421' then 'El saldo de cada factura de proveedor (menos el saldo a favor)'
             when '122' then 'Adelantos de separaciones que todavía no se entregan ni devuelven'
             else 'Activos fijos al costo'
           end as detalle
      from sistema s
     where s.d <> 0 or s.cta in ('101', '201', '421')
    union all
    -- Lo que solo el líder sabe (del contador y del banco).
    select m.cta, 'manual', coalesce((select g.d from vig g where g.cta = m.cta), m.sugerido), m.detalle
      from (values
        ('4011', 0::numeric, 'Lo que se le debía a SUNAT de IGV (si SUNAT te debía, en negativo)'),
        ('41',   0::numeric, 'Sueldos de la planilla que se debían (normalmente cero)'),
        ('47',   -(select x.prestamo from dueno x), 'Lo que CAYLA le debía al dueño por préstamos'),
        ('50',   0::numeric, 'Lo que pusiste en el negocio al crearlo (del contador)'),
        ('52',   -(select x.aporte from dueno x), 'Aportes del dueño después de crearlo'),
        ('591',  0::numeric, 'Lo que el negocio ganó (o perdió) hasta el día anterior, sin retirar (del contador)')
      ) m(cta, sugerido, detalle)
  )
  select l.cta, k.nombre, k.tipo,
         case when retail.fn_cuenta_deudora(l.cta) then l.d else -l.d end,
         l.origen, l.detalle,
         (select case when retail.fn_cuenta_deudora(l.cta) then g.d else -g.d end from vig g where g.cta = l.cta),
         k.orden
    from lineas l join retail.cuentas k on k.codigo = l.cta
   order by k.orden, l.cta;
end $$;

-- El Balance a una fecha. Sin `p_ubicacion_id`: el de CAYLA entera (solo el líder), saldos de arranque + diario hasta el
-- corte; lo de resultados se cierra en «lo tuyo». Con una tienda: lo que es de la tienda (ver `fn_balance_por_tienda`).
-- `monto` con el signo natural: lo que tiene, lo que debe y lo tuyo, en positivo (la depreciación acumulada, en negativo
-- dentro de lo que tiene). `seccion`: activo · pasivo · patrimonio.
create or replace function retail.fn_balance_general(p_corte date default null, p_ubicacion_id uuid default null)
returns table (seccion text, cuenta text, nombre text, monto numeric, orden integer, detalle jsonb)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_corte date := coalesce(p_corte, retail.fn_hoy_lima());
  v_arr date;
  v_mes date := date_trunc('month', coalesce(p_corte, retail.fn_hoy_lima()))::date;
begin
  if p_ubicacion_id is not null then
    if not coalesce(retail.fn_es_lider(), false) and not (p_ubicacion_id = any (retail.fn_diario_ubicaciones())) then
      raise exception 'No puedes ver lo que es de esa tienda.' using errcode = '42501';
    end if;
    return query
    select x.seccion, x.cuenta, x.nombre, x.monto, x.orden, x.detalle
      from retail.fn_balance_por_tienda(v_corte) t
      cross join lateral (values
        ('activo', '101', 'Cajón y caja fuerte', t.caja, 1, jsonb_build_object('visible', t.caja_visible)),
        ('activo', '201', 'Mercadería', t.mercaderia, 2, '{}'::jsonb),
        ('activo', '33',  'Muebles, equipos y mejoras (menos lo depreciado)', t.activos_fijos, 3,
                  jsonb_build_object('costo', t.activos_costo, 'depreciacion', t.activos_depreciacion)),
        ('pasivo', '421', 'Su parte de las facturas por pagar', t.facturas_por_pagar, 4, '{}'::jsonb)
      ) x(seccion, cuenta, nombre, monto, orden, detalle)
     where t.ubicacion_id = p_ubicacion_id;
    return;
  end if;

  perform retail.fn_exigir_lider_balance();
  v_arr := retail.fn_fecha_de_arranque();
  if v_arr is null or v_corte < v_arr - 1 then
    return;   -- sin punto de partida no hay Balance (la comprobación lo dice)
  end if;

  return query
  with
  -- El día anterior al arranque es el propio arranque: sin diario (se pide un día y se descarta).
  a as materialized (
    select x.fecha, x.cuenta, x.debe, x.haber from retail.fn_bal_diario(v_arr, greatest(v_corte, v_arr)) x where x.fecha <= v_corte
  ),
  sal as (
    select z.cuenta, sum(z.d) as d from (
      select v.cuenta, v.debe - v.haber as d from retail.fn_saldos_iniciales_vigentes() v
      union all
      select a.cuenta, a.debe - a.haber from a
    ) z group by z.cuenta
  ),
  -- Lo de resultados (ingresos − gastos), antes del mes del corte y en el mes del corte.
  res as (
    select coalesce(sum(a.haber - a.debe) filter (where a.fecha < v_mes), 0) as antes,
           coalesce(sum(a.haber - a.debe) filter (where a.fecha >= v_mes), 0) as mes
      from a join retail.cuentas k on k.codigo = a.cuenta where k.tipo in ('ingreso', 'gasto')
  ),
  lineas as (
    select case when k.tipo = 'activo' then 'activo'
                when k.codigo = '4011' and s.d > 0 then 'activo'
                when k.tipo = 'pasivo' then 'pasivo'
                else 'patrimonio' end as seccion,
           k.codigo, k.nombre,
           case when k.tipo = 'activo' then s.d
                when k.codigo = '4011' and s.d > 0 then s.d
                else -s.d end
             + case when k.codigo = '591' then (select r.antes from res r) else 0 end as monto,
           k.orden
      from sal s join retail.cuentas k on k.codigo = s.cuenta
     where k.tipo in ('activo', 'pasivo', 'patrimonio')
       and (s.d <> 0 or k.codigo in ('101', '104', '201', '421', '50'))
    union all
    -- Las utilidades acumuladas siempre se muestran, aunque la 591 no tenga movimiento: ahí caen los meses anteriores.
    select 'patrimonio', '591', (select k.nombre from retail.cuentas k where k.codigo = '591'), (select r.antes from res r),
           (select k.orden from retail.cuentas k where k.codigo = '591')
     where not exists (select 1 from sal s where s.cuenta = '591')
    union all
    select 'patrimonio', 'resultado_mes', 'Resultado del mes', (select r.mes from res r), 999
  )
  select l.seccion, l.codigo, l.nombre, l.monto, l.orden,
         case l.codigo
           when '201' then jsonb_build_object('en_transito', retail.fn_bal_transito(v_corte), 'por_recibir', retail.fn_bal_por_recibir(v_corte))
           when 'resultado_mes' then jsonb_build_object('desde', greatest(v_mes, v_arr), 'hasta', v_corte)
           when '591' then jsonb_build_object('hasta', v_mes - 1)
           else '{}'::jsonb end
    from lineas l
   order by case l.seccion when 'activo' then 1 when 'pasivo' then 2 else 3 end, l.orden, l.codigo;
end $$;

-- Lo que es de cada tienda (y del Taller) a una fecha: su cajón y su caja fuerte, su mercadería, sus muebles al costo
-- menos lo depreciado y su parte de las facturas por pagar; lo invertido (lo que tiene − lo que debe) y cuánto rinde:
-- la utilidad del mes del corte (Estado de resultados, del 1 al corte) ÷ lo invertido. El banco, el capital y el IGV
-- son de CAYLA entera: no se reparten. El líder ve todas; con «Reportes financieros», la suya.
create or replace function retail.fn_balance_por_tienda(p_corte date default null)
returns table (ubicacion_id uuid, nombre text, tipo text, caja numeric, caja_visible boolean, mercaderia numeric,
               activos_fijos numeric, activos_costo numeric, activos_depreciacion numeric, facturas_por_pagar numeric,
               invertido numeric, ventas_mes numeric, utilidad_mes numeric, rinde numeric, desde date, hasta date,
               planilla_visible boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_corte date := coalesce(p_corte, retail.fn_hoy_lima());
  v_desde date := date_trunc('month', coalesce(p_corte, retail.fn_hoy_lima()))::date;
  v_lider boolean := retail.fn_es_lider();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_ve_caja boolean := retail.fn_puede_gestionar_caja();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver lo que es de tu tienda necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  return query
  with
  un as (
    select u.id, u.nombre, u.tipo from retail.ubicaciones u
     where u.tipo in ('tienda', 'taller') and u.id = any (v_ubics) and (u.activo or not v_lider)
  ),
  din as (select d.ubicacion_id, sum(d.saldo) as saldo, bool_or(d.tipo = 'cajon' and d.caja_abierta) as abierta
            from retail.fn_bal_dinero(v_corte) d where d.tipo in ('cajon', 'caja_fuerte') group by d.ubicacion_id),
  sto as (select s.ubicacion_id, s.valor from retail.fn_bal_stock(v_corte) s),
  act as (select a.ubicacion_id, sum(a.costo) as costo, sum(a.depreciacion) as dep from retail.fn_bal_activos(v_corte) a group by a.ubicacion_id),
  fac as (select f.ubicacion_id, f.saldo from retail.fn_bal_facturas_de_tienda(v_corte) f),
  er as (select e.ubicacion_id, e.ventas_netas, e.resultado, e.planilla_visible
           from retail.fn_estado_resultados(v_desde, v_corte, case when v_lider then null else v_ubics[1] end) e
          where e.ubicacion_id is not null),
  base as (
    select un.id, un.nombre, un.tipo,
           -- El esperado de una caja abierta lo ve solo quien puede cerrarla (ADR-0186, como en Cuentas y dinero).
           case when coalesce(din.abierta, false) and v_corte >= retail.fn_hoy_lima() and not v_ve_caja then null
                else coalesce(din.saldo, 0) end as caja,
           coalesce(sto.valor, 0) as merc,
           coalesce(act.costo, 0) as costo, coalesce(act.dep, 0) as dep,
           coalesce(fac.saldo, 0) as fac,
           er.ventas_netas, er.resultado, coalesce(er.planilla_visible, false) as pv
      from un
      left join din on din.ubicacion_id = un.id
      left join sto on sto.ubicacion_id = un.id
      left join act on act.ubicacion_id = un.id
      left join fac on fac.ubicacion_id = un.id
      left join er on er.ubicacion_id = un.id
  )
  select b.id, b.nombre, b.tipo, b.caja, b.caja is not null, b.merc, b.costo - b.dep, b.costo, b.dep, b.fac,
         coalesce(b.caja, 0) + b.merc + b.costo - b.dep - b.fac,
         coalesce(b.ventas_netas, 0), coalesce(b.resultado, 0),
         case when b.tipo = 'tienda' and coalesce(b.caja, 0) + b.merc + b.costo - b.dep - b.fac > 0
              then round(coalesce(b.resultado, 0) / (coalesce(b.caja, 0) + b.merc + b.costo - b.dep - b.fac), 4) end,
         v_desde, v_corte, b.pv
    from base b
   order by case b.tipo when 'tienda' then 1 else 2 end, b.nombre;
end $$;

-- La comprobación antes de dibujar el Balance (ADR-0198). Una fila por cosa que se comprueba, en el orden en que se
-- muestra. `diario` y `otro` con el signo natural de la cuenta; `diferencia` = diario − otro. `estado`: ok · nota (cuadra
-- con una aclaración) · no_cuadra · revisar (se muestra sin bloquear) · falta. El Balance se dibuja si ninguna fila con
-- `bloquea` está en no_cuadra ni falta. Solo el líder (es de CAYLA entera). F9 (cierre del mes) la puede llamar.
create or replace function retail.fn_conciliacion_contable(p_corte date default null)
returns table (orden integer, clave text, titulo text, contra text, diario numeric, otro numeric, diferencia numeric,
               estado text, bloquea boolean, causas jsonb, arranque date, corte date)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_corte date := coalesce(p_corte, retail.fn_hoy_lima());
  v_arr date;
  v_ini jsonb;        -- saldo de arranque por cuenta (debe − haber)
  v_dia jsonb;        -- diario del arranque al corte por cuenta
  v_otro jsonb;       -- el otro camino al corte
  v_otro0 jsonb;      -- el otro camino recalculado hoy para el día de arranque
  v_n_desc bigint;
  v_dif_desc numeric;
  v_desc jsonb;
  v_ini_act numeric;
  v_ini_pp numeric;
  v_act numeric;
  v_pp numeric;
  r record;
  v_d numeric; v_o numeric; v_dif numeric; v_explica numeric; v_acepta numeric; v_causas jsonb; v_cambio numeric;
  v_signo integer;
  v_estado text;
  v_igv_f8 numeric; v_igv_taller numeric;
  v_causas_dinero jsonb;   -- las causas de caja y bancos, calculadas UNA vez (leen el libro de F3)
begin
  perform retail.fn_exigir_lider_balance();
  v_arr := retail.fn_fecha_de_arranque();
  if v_arr is null then
    return query select 0, 'arranque'::text, 'Saldos de arranque'::text,
      'Lo que CAYLA tenía el día que empezó a usar el sistema: bancos, deudas y capital'::text,
      null::numeric, null::numeric, null::numeric, 'falta'::text, true, '[]'::jsonb, null::date, v_corte;
    return;
  end if;
  if v_corte < v_arr - 1 then
    return query select 0, 'corte'::text, 'Fecha del Balance'::text,
      ('El sistema arrancó el ' || to_char(v_arr, 'DD/MM/YYYY') || ': antes de eso no hay Balance')::text,
      null::numeric, null::numeric, null::numeric, 'falta'::text, true, '[]'::jsonb, v_arr, v_corte;
    return;
  end if;

  select coalesce(jsonb_object_agg(x.cuenta, x.d), '{}'::jsonb) into v_ini
    from (select v.cuenta, sum(v.debe - v.haber) as d from retail.fn_saldos_iniciales_vigentes() v group by v.cuenta) x;

  if v_corte >= v_arr then
    with a as materialized (select * from retail.fn_bal_diario(v_arr, v_corte)),
    porc as (select a.cuenta, sum(a.debe - a.haber) as d from a group by a.cuenta),
    des as (select a.asiento, min(a.regla) as regla, min(a.fecha) as fecha, sum(a.debe) - sum(a.haber) as dif
              from a group by a.asiento having round(sum(a.debe), 2) <> round(sum(a.haber), 2))
    select coalesce((select jsonb_object_agg(p.cuenta, p.d) from porc p), '{}'::jsonb),
           (select count(*) from des), coalesce((select sum(d.dif) from des d), 0),
           coalesce((select jsonb_agg(jsonb_build_object('texto', 'Asiento ' || z.regla || ' del ' || to_char(z.fecha, 'DD/MM') || ' (' || z.asiento || ')', 'monto', z.dif) order by abs(z.dif) desc)
                       from (select * from des order by abs(dif) desc limit 5) z), '[]'::jsonb)
      into v_dia, v_n_desc, v_dif_desc, v_desc
      from (select 1) uno;
  else
    v_dia := '{}'::jsonb; v_n_desc := 0; v_dif_desc := 0; v_desc := '[]'::jsonb;
  end if;

  select coalesce(jsonb_object_agg(o.cuenta, o.saldo), '{}'::jsonb) into v_otro from (select o.cuenta, sum(o.saldo) as saldo from retail.fn_bal_otro_camino(v_corte) o group by o.cuenta) o;
  select coalesce(jsonb_object_agg(o.cuenta, o.saldo), '{}'::jsonb) into v_otro0 from (select o.cuenta, sum(o.saldo) as saldo from retail.fn_bal_otro_camino(v_arr - 1) o group by o.cuenta) o;

  -- 1. Los saldos de arranque cuadran (lo que tiene = lo que debe + lo tuyo).
  select coalesce(sum(v.debe), 0), coalesce(sum(v.haber), 0) into v_ini_act, v_ini_pp from retail.fn_saldos_iniciales_vigentes() v;
  return query select 1, 'arranque'::text, 'Los saldos de arranque cuadran'::text,
    ('Al empezar el ' || to_char(v_arr, 'DD/MM/YYYY') || ': lo que tenía contra lo que debía más lo tuyo')::text,
    v_ini_act, v_ini_pp, v_ini_act - v_ini_pp,
    case when abs(v_ini_act - v_ini_pp) < 0.005 then 'ok' else 'no_cuadra' end, true, '[]'::jsonb, v_arr, v_corte;

  -- 2. El diario cuadra: ningún asiento con debe ≠ haber (fn_asientos_descuadrados, sobre el mismo diario).
  return query select 2, 'diario'::text, 'El diario cuadra'::text,
    (case when v_n_desc = 0 then 'Cada asiento, del arranque al corte, tiene el debe igual al haber'
          else v_n_desc || ' asiento' || case when v_n_desc = 1 then '' else 's' end || ' con el debe distinto del haber' end)::text,
    null::numeric, null::numeric, v_dif_desc,
    case when v_n_desc = 0 then 'ok' else 'no_cuadra' end, true, v_desc, v_arr, v_corte;

  -- 3. Lo que tiene = lo que debe + lo tuyo, al corte.
  select coalesce(sum(case when k.tipo = 'activo' then t.d end), 0),
         coalesce(-sum(case when k.tipo <> 'activo' then t.d end), 0)
    into v_act, v_pp
    from (select c.key as cuenta, (c.value)::numeric + coalesce((v_dia ->> c.key)::numeric, 0) as d from jsonb_each_text(v_ini) c
          union all
          select c.key, (c.value)::numeric from jsonb_each_text(v_dia) c where not (v_ini ? c.key)) t
    join retail.cuentas k on k.codigo = t.cuenta;
  return query select 3, 'ecuacion'::text, 'Lo que tiene = lo que debe + lo tuyo'::text,
    ('Al ' || to_char(v_corte, 'DD/MM/YYYY') || ', con la utilidad del período dentro de lo tuyo')::text,
    v_act, v_pp, v_act - v_pp,
    case when abs(v_act - v_pp) < 0.005 then 'ok' else 'no_cuadra' end, true, '[]'::jsonb, v_arr, v_corte;

  -- 4. Cada cuenta, por dos caminos.
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_causas_dinero from retail.fn_bal_causas_dinero(v_arr, v_corte) c;
  for r in
    select * from (values
      (10, '101', array['101'], 'Caja (cajones, cajas fuertes y lo entregado al líder)', 'contra lo que dice cada caja en Cuentas y dinero', 1),
      (11, '104', array['104'], 'Bancos y billeteras', 'contra el saldo de cada cuenta en Cuentas y dinero', 1),
      (12, '105', array['105'], 'Tarjeta por abonar', 'contra el POS en Cuentas y dinero', 1),
      (13, '451', array['451'], 'Tarjeta de crédito', 'contra la tarjeta en Cuentas y dinero', -1),
      (20, '201', array['201'], 'Mercaderías', 'contra stock × costo de cada prenda (más lo que está en camino y lo facturado por recibir)', 1),
      (30, '33',  array['332', '333', '334', '335', '336', '391'], 'Activos fijos, menos lo depreciado', 'contra cada activo fijo', 1),
      (40, '421', array['421'], 'Facturas por pagar', 'contra el saldo de cada factura de proveedor', -1),
      (50, '122', array['122'], 'Adelantos de clientas', 'contra las separaciones que no se entregaron ni devolvieron', -1)
    ) x(orden, clave, cuentas, titulo, contra, signo)
  loop
    v_signo := r.signo;
    select coalesce(sum(coalesce((v_ini ->> c)::numeric, 0) + coalesce((v_dia ->> c)::numeric, 0)), 0),
           coalesce(sum(coalesce((v_otro ->> c)::numeric, 0)), 0),
           coalesce(sum(coalesce((v_ini ->> c)::numeric, 0) - coalesce((v_otro0 ->> c)::numeric, 0)), 0)
      into v_d, v_o, v_cambio
      from unnest(r.cuentas) c;
    v_dif := v_d - v_o;
    -- Solo se muestran las cuentas que tienen algo (la caja, la mercadería y las facturas, siempre).
    if abs(v_d) < 0.005 and abs(v_o) < 0.005 and r.clave not in ('101', '201', '421') then
      continue;
    end if;
    -- Las causas, en debe − haber.
    if r.clave in ('101', '104', '105', '451') then
      select coalesce(jsonb_agg(jsonb_build_object('clave', c.clave, 'texto', c.texto, 'monto', v_signo * c.monto, 'acepta', c.acepta) order by abs(c.monto) desc), '[]'::jsonb),
             coalesce(sum(c.monto), 0), coalesce(sum(c.monto) filter (where c.acepta), 0)
        into v_causas, v_explica, v_acepta
        from jsonb_to_recordset(v_causas_dinero) as c(cuenta text, clave text, texto text, monto numeric, acepta boolean)
       where c.cuenta = r.clave;
    elsif r.clave = '201' then
      select coalesce(jsonb_agg(jsonb_build_object('clave', c.clave, 'texto', c.texto, 'monto', c.monto, 'acepta', false) order by abs(c.monto) desc), '[]'::jsonb),
             coalesce(sum(c.monto), 0), 0
        into v_causas, v_explica, v_acepta
        from retail.fn_bal_causas_mercaderia(v_arr, v_corte) c;
    else
      v_causas := '[]'::jsonb; v_explica := 0; v_acepta := 0;
    end if;
    if abs(v_cambio) >= 0.005 then
      v_causas := v_causas || jsonb_build_array(jsonb_build_object('clave', 'antes_del_arranque',
        'texto', 'Cambió lo que había al arrancar: algo se registró o se anuló con fecha anterior al ' || to_char(v_arr, 'DD/MM/YYYY') || ' (se corrige en los saldos de arranque, con motivo)',
        'monto', v_signo * v_cambio, 'acepta', false));
      v_explica := v_explica + v_cambio;
    end if;
    if abs(v_dif - v_explica) >= 0.005 and abs(v_dif) >= 0.005 then
      v_causas := v_causas || jsonb_build_array(jsonb_build_object('clave', 'sin_explicar', 'texto', 'Sin explicar todavía',
        'monto', v_signo * (v_dif - v_explica), 'acepta', false));
    end if;
    v_estado := case when abs(v_dif) < 0.005 then 'ok'
                     when abs(v_dif - v_acepta) < 0.005 then 'nota'
                     else 'no_cuadra' end;
    return query select r.orden, r.clave, r.titulo, r.contra, v_signo * v_d, v_signo * v_o, v_signo * v_dif,
      v_estado, true, case when v_estado = 'ok' then '[]'::jsonb else v_causas end, v_arr, v_corte;
  end loop;

  -- 5. El IGV del diario contra Impuestos (F8): para revisar, no bloquea. Lo que se le debe a SUNAT (positivo) o lo que
  -- SUNAT le debe a CAYLA (negativo). El diario reconoce el IGV al vender; Impuestos, al emitir el comprobante.
  if to_regprocedure('retail.fn_impuestos_ventas(date,date)') is not null and v_corte >= v_arr then
    execute $q$
      select coalesce((select sum(v.signo * v.igv) from retail.fn_impuestos_ventas($1, $2) v where v.cuenta), 0)
           - coalesce((select sum(c.igv) from retail.fn_impuestos_compras($1, $2) c where c.da_credito), 0),
             coalesce((select sum(c.igv) from retail.fn_impuestos_compras($1, $2) c where c.da_credito and c.origen = 'taller'), 0)
    $q$ into v_igv_f8, v_igv_taller using v_arr, v_corte;
    v_d := -(coalesce((v_ini ->> '4011')::numeric, 0) + coalesce((v_dia ->> '4011')::numeric, 0));
    v_o := -coalesce((v_ini ->> '4011')::numeric, 0) + v_igv_f8;
    v_dif := v_d - v_o;
    v_causas := '[]'::jsonb;
    if abs(v_igv_taller) >= 0.005 then
      v_causas := v_causas || jsonb_build_array(jsonb_build_object('clave', 'igv_taller',
        'texto', 'IGV de las facturas del Taller (Impuestos lo descuenta; el diario todavía no tiene los insumos)', 'monto', v_igv_taller, 'acepta', false));
    end if;
    if abs(v_dif - v_igv_taller) >= 0.005 then
      v_causas := v_causas || jsonb_build_array(jsonb_build_object('clave', 'igv_comprobantes',
        'texto', 'Ventas sin boleta o factura emitida, o comprobantes que no son del sistema (se revisan en Impuestos)',
        'monto', v_dif - v_igv_taller, 'acepta', false));
    end if;
    return query select 60, '4011'::text, 'IGV'::text, 'contra los comprobantes emitidos menos las facturas de proveedor (Impuestos)'::text,
      v_d, v_o, v_dif, case when abs(v_dif) < 0.005 then 'ok' else 'revisar' end, false,
      case when abs(v_dif) < 0.005 then '[]'::jsonb else v_causas end, v_arr, v_corte;
  end if;
end $$;

-- ---------- 6. Registrar los saldos de arranque (y corregirlos) ----------
-- `p_lineas`: [{cuenta, monto, origen?, nota?}] con el monto en el signo natural de la cuenta (lo que tiene, lo que debe
-- o lo tuyo, en positivo). La primera vez registra el arranque entero con su fecha. Después, cada línea es una
-- corrección: reemplaza a la vigente de esa cuenta (o agrega una cuenta nueva) y pide motivo; la fecha no cambia. El
-- resultado tiene que cuadrar. Solo el líder, firmado con el responsable. Devuelve cuántas filas escribió.
create or replace function retail.registrar_saldo_inicial(p_fecha date, p_lineas jsonb, p_motivo text default null)
returns integer
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_persona uuid;
  v_arr date;
  v_primera boolean;
  v_motivo text := nullif(trim(p_motivo), '');
  x jsonb;
  v_cuenta text;
  v_monto numeric;
  v_debe numeric;
  v_haber numeric;
  v_origen text;
  v_nota text;
  v_tipo text;
  v_prev retail.saldos_iniciales%rowtype;
  v_n integer := 0;
  v_debe_t numeric;
  v_haber_t numeric;
begin
  perform retail.fn_exigir_lider_balance();
  if p_fecha is null then
    raise exception 'Elige el día de arranque.' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'No hay saldos que registrar.' using errcode = 'P0001';
  end if;
  if p_fecha > retail.fn_hoy_lima() + 31 then
    raise exception 'El día de arranque no puede estar a más de un mes.' using errcode = 'P0001';
  end if;
  -- Uno a la vez: dos líderes registrando el arranque a la vez no pueden dejar dos arranques.
  perform pg_advisory_xact_lock(hashtextextended('saldos_iniciales', 0));
  v_persona := retail.fn_actor_persona_id(true);
  v_arr := retail.fn_fecha_de_arranque();
  v_primera := v_arr is null;
  if not v_primera then
    if p_fecha <> v_arr then
      raise exception 'El día de arranque es el %: no cambia. Corrige los saldos de ese día.', to_char(v_arr, 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
    if v_motivo is null or char_length(v_motivo) < 5 then
      raise exception 'Una corrección de los saldos de arranque necesita su motivo.' using errcode = 'P0001';
    end if;
  end if;
  if (select count(*) from jsonb_array_elements(p_lineas) l) <> (select count(distinct l ->> 'cuenta') from jsonb_array_elements(p_lineas) l) then
    raise exception 'Una cuenta aparece dos veces.' using errcode = 'P0001';
  end if;

  for x in select * from jsonb_array_elements(p_lineas) loop
    v_cuenta := nullif(trim(x ->> 'cuenta'), '');
    select k.tipo into v_tipo from retail.cuentas k where k.codigo = v_cuenta;
    if v_tipo is null or v_tipo not in ('activo', 'pasivo', 'patrimonio') then
      raise exception 'La cuenta «%» no va en un saldo de arranque (solo lo que tiene, lo que debe y lo tuyo).', coalesce(v_cuenta, '?') using errcode = 'P0001';
    end if;
    begin
      v_monto := round((x ->> 'monto')::numeric, 2);
    exception when others then
      raise exception 'El monto de la cuenta % no es un número.', v_cuenta using errcode = 'P0001';
    end;
    if v_monto is null then
      raise exception 'Falta el monto de la cuenta %.', v_cuenta using errcode = 'P0001';
    end if;
    v_origen := case when x ->> 'origen' = 'sistema' then 'sistema' else 'manual' end;
    v_nota := nullif(trim(x ->> 'nota'), '');
    if retail.fn_cuenta_deudora(v_cuenta) then
      v_debe := greatest(v_monto, 0); v_haber := greatest(-v_monto, 0);
    else
      v_haber := greatest(v_monto, 0); v_debe := greatest(-v_monto, 0);
    end if;

    select s.* into v_prev from retail.saldos_iniciales s
     where s.cuenta = v_cuenta and not exists (select 1 from retail.saldos_iniciales r where r.reemplaza_id = s.id)
     order by s.created_at desc limit 1;
    if v_prev.id is not null and v_primera then
      raise exception 'La cuenta % ya tiene saldo de arranque.', v_cuenta using errcode = 'P0001';
    end if;
    -- Una corrección que no cambia nada no deja fila.
    if v_prev.id is not null and v_prev.debe = v_debe and v_prev.haber = v_haber then
      continue;
    end if;
    insert into retail.saldos_iniciales (fecha, cuenta, debe, haber, origen, nota, reemplaza_id, motivo, registrado_por)
    values (p_fecha, v_cuenta, v_debe, v_haber, v_origen, v_nota, v_prev.id, case when v_primera then null else v_motivo end, v_persona);
    v_n := v_n + 1;
    v_prev := null;
  end loop;

  -- El resultado tiene que cuadrar: el capital y las utilidades acumuladas se escriben, no se calculan.
  select coalesce(sum(v.debe), 0), coalesce(sum(v.haber), 0) into v_debe_t, v_haber_t from retail.fn_saldos_iniciales_vigentes() v;
  if abs(v_debe_t - v_haber_t) >= 0.005 then
    raise exception 'Los saldos no cuadran: lo que tiene suma S/ % y lo que debe más lo tuyo, S/ % (diferencia S/ %). Revisa el capital y las utilidades acumuladas con el contador.',
      to_char(v_debe_t, 'FM999G999G990D00'), to_char(v_haber_t, 'FM999G999G990D00'), to_char(v_debe_t - v_haber_t, 'FM999G999G990D00')
      using errcode = 'P0001';
  end if;
  return v_n;
end $$;

-- ---------- 7. Permisos: nada se lee ni se escribe por fuera de las funciones ----------
revoke all on function retail.fn_saldos_iniciales_inmutable() from public, anon, authenticated;
revoke all on function retail.fn_saldos_iniciales_vigentes() from public, anon, authenticated;
revoke all on function retail.fn_fecha_de_arranque() from public, anon, authenticated;
revoke all on function retail.fn_cuenta_deudora(text) from public, anon, authenticated;
revoke all on function retail.fn_bal_diario(date, date) from public, anon, authenticated;
revoke all on function retail.fn_bal_dinero(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_stock(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_transito(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_por_recibir(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_activos(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_facturas(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_saldo_a_favor(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_facturas_de_tienda(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_anticipos(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_otro_camino(date) from public, anon, authenticated;
revoke all on function retail.fn_bal_causas_dinero(date, date) from public, anon, authenticated;
revoke all on function retail.fn_bal_causas_mercaderia(date, date) from public, anon, authenticated;
revoke all on function retail.fn_exigir_lider_balance() from public, anon, authenticated;
revoke all on function retail.fn_saldos_iniciales() from public, anon;
revoke all on function retail.fn_saldos_iniciales_propuesta(date) from public, anon;
revoke all on function retail.fn_balance_general(date, uuid) from public, anon;
revoke all on function retail.fn_balance_por_tienda(date) from public, anon;
revoke all on function retail.fn_conciliacion_contable(date) from public, anon;
revoke all on function retail.registrar_saldo_inicial(date, jsonb, text) from public, anon;
grant execute on function retail.fn_saldos_iniciales() to authenticated;
grant execute on function retail.fn_saldos_iniciales_propuesta(date) to authenticated;
grant execute on function retail.fn_balance_general(date, uuid) to authenticated;
grant execute on function retail.fn_balance_por_tienda(date) to authenticated;
grant execute on function retail.fn_conciliacion_contable(date) to authenticated;
grant execute on function retail.registrar_saldo_inicial(date, jsonb, text) to authenticated;

reset lock_timeout;
