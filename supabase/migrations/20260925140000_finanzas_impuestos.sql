-- ============================================================================
-- 20260925140000 — Impuestos: el IGV del mes, el límite del régimen y los registros para el contador (ADR-0195 F8)
--
-- EL PROBLEMA PRIMERO
--   Cada mes CAYLA le paga a SUNAT el IGV que cobró al vender MENOS el IGV que pagó al comprar con factura. Hoy nadie ve
--   ese número: el débito vive en `comprobantes` (Facturación), el crédito en `compras` (mercadería, gastos y activos) y en
--   `comprobantes_produccion` (el Taller), y el contador lo arma a mano desde Alegra. Si el crédito de un mes supera al
--   débito, sobra un SALDO A FAVOR que se descuenta el mes siguiente; si nadie lo arrastra, CAYLA paga de más. Y hay un
--   límite de ventas (300 UIT en el Régimen MYPE) que, al cruzarlo, cambia los libros que hay que llevar: hay que verlo
--   venir, no enterarse cuando ya pasó.
--
-- LAS REGLAS
--   · DÉBITO (IGV cobrado): el IGV de los comprobantes de venta que valen para SUNAT —boleta, factura y nota de débito,
--     menos las notas de crédito—, por la fecha en que se emitieron (hora de Lima). Valen los aceptados y los que siguen
--     en camino (pendiente, enviado, reintentando: el IGV se reconoce al vender). NO valen: los anulados, los rechazados,
--     los no emitidos, las notas de venta (internas), los emitidos al ambiente de PRUEBAS de SUNAT (`sandbox`, hay uno en
--     producción) ni los de una venta de prueba. La regla vive en UN lugar: `fn_impuestos_ventas`.
--   · CRÉDITO (IGV que se descuenta): el IGV de las FACTURAS de proveedor vigentes, de las tres naturalezas (mercadería,
--     gasto, activo) y del Taller, por su fecha de emisión; menos el IGV de las notas de crédito del proveedor. Una boleta
--     o un recibo por honorarios no dan crédito (la base ya lo impone: solo una factura lleva IGV). Regla en
--     `fn_impuestos_compras`.
--   · SALDO A FAVOR: se arrastra mes a mes desde el primer mes con datos. A pagar = débito − crédito − saldo anterior; si
--     sale negativo, no se paga nada y lo que sobra pasa al mes siguiente. Nada de esto se guarda: se suma cada vez.
--   · PARÁMETROS con vigencia en `parametros_tributarios` (la tabla de la tasa de IGV, F2a): UIT, régimen de renta, límite
--     en UIT y tasa del pago a cuenta. Los que rigen por año (todos menos el IGV) empiezan el 1 de enero. Los valores de
--     arranque son PROVISIONALES y lo dicen: los confirma el contador.
--   · Solo se AGREGAN filas: una corrección es una fila nueva con la misma vigencia, y gana la más reciente. Así se puede
--     corregir un «5,005» mal tipeado sin perder lo que hubo. Por eso la llave pasa a ser `id` (antes era nombre+vigencia).
--   · Módulo `impuestos`: «solo líder por ahora» (20260925100000). Todo pregunta `fn_es_lider()`. Es de CAYLA entera: no
--     se filtra por tienda. Guardar un parámetro firma con el responsable y queda en `configuracion_historial`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DOS EJECUCIONES SEPARADAS, EN ORDEN (CLAUDE.md «Políticas y deadlocks»)
--   PARTE 1 · `parametros_tributarios`, sola: columnas nuevas, llave `id`, checks y los valores provisionales. Toma la
--             tabla en exclusiva un instante (solo la leen los gastos con factura, por `fn_tasa_igv`) y, al crear la FK de
--             `registrado_por`, SHARE ROW EXCLUSIVE sobre `public.personas` (frena escrituras en personas un instante,
--             igual que F2b con `activos_fijos`). Medido en local: nada de `auth` ni `storage`.
--   PARTE 2 · Funciones: la tasa de IGV con correcciones, las lecturas de Impuestos, los registros y el guardado. No toma
--             en exclusiva ninguna tabla.
--   Cada parte espera 3 s un candado: si dice «lock timeout», se repite ESA parte. Idempotentes. Sin políticas (RLS
--   encendido y sin políticas: todo se lee por funciones). En local y en el CI el archivo corre entero.
--   Al pegar en el SQL Editor, cada tabla ya lleva `retail.` y cada parte fija su `search_path`.
--
-- SE ROMPE SI
--   · se vuelve a correr 20260924235000 DESPUÉS de esta: su `on conflict (nombre, vigente_desde)` ya no tiene llave
--     única donde apoyarse (la llave es `id`). No hace falta correrla de nuevo: ya está en producción.
--   · alguien lee `parametros_tributarios` directo con «order by vigente_desde desc limit 1»: con correcciones, dos
--     filas tienen la misma vigencia. Se lee con `fn_tasa_igv` o `fn_parametro_tributario` (ordenan por vigencia y
--     después por la más reciente).
--   · la web nueva se publica antes: /finanzas/impuestos y Configuración ▸ Impuestos llaman funciones que no existirían.
--     Tampoco sin 20260925100000 (el módulo `impuestos` en `retail.modulos`): la ruta pide `exigirModulo("impuestos")`.
-- ============================================================================

-- ============================== PARTE 1 · parametros_tributarios (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.parametros_tributarios add column if not exists id uuid not null default gen_random_uuid();
-- El régimen es un texto (rmt, general…); los demás, un número.
alter table retail.parametros_tributarios add column if not exists texto text;
-- «Por confirmar con el contador»: los valores de arranque. El que el líder escribe ya no lo es.
alter table retail.parametros_tributarios add column if not exists provisional boolean not null default false;
alter table retail.parametros_tributarios add column if not exists registrado_por uuid references public.personas (id);
-- La UIT (5500) no entraba en numeric(6,4). Subir la precisión sin cambiar la escala no reescribe la tabla.
alter table retail.parametros_tributarios alter column valor type numeric(12, 4);
alter table retail.parametros_tributarios alter column valor drop not null;

-- Llave: `id`. Una corrección es una fila nueva con la misma vigencia (antes la llave nombre+vigencia lo impedía).
do $$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'retail.parametros_tributarios'::regclass and contype = 'p'
                and pg_get_constraintdef(oid) <> 'PRIMARY KEY (id)') then
    alter table retail.parametros_tributarios drop constraint parametros_tributarios_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.parametros_tributarios'::regclass and contype = 'p') then
    alter table retail.parametros_tributarios add constraint parametros_tributarios_pkey primary key (id);
  end if;
end $$;
create index if not exists parametros_tributarios_vigencia_idx
  on retail.parametros_tributarios (nombre, vigente_desde desc, created_at desc);

alter table retail.parametros_tributarios drop constraint if exists parametros_tributarios_nombre_check;
alter table retail.parametros_tributarios add constraint parametros_tributarios_nombre_check
  check (nombre in ('igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen'));
alter table retail.parametros_tributarios drop constraint if exists parametros_tributarios_valor_check;
alter table retail.parametros_tributarios drop constraint if exists parametros_tributarios_valor_coherente;
alter table retail.parametros_tributarios add constraint parametros_tributarios_valor_coherente check (
  case nombre
    when 'regimen' then valor is null and texto in ('rmt', 'general', 'rer', 'nrus')
    when 'igv' then texto is null and valor > 0 and valor < 1
    when 'renta_pago_cuenta' then texto is null and valor >= 0 and valor < 1
    when 'uit' then texto is null and valor >= 1000 and valor <= 100000
    when 'umbral_uit' then texto is null and valor > 0 and valor <= 100000
    else false
  end);
-- Lo que rige por ejercicio (UIT, régimen, límite, pago a cuenta) empieza el 1 de enero; el IGV, desde cualquier fecha.
alter table retail.parametros_tributarios drop constraint if exists parametros_tributarios_anual;
alter table retail.parametros_tributarios add constraint parametros_tributarios_anual
  check (nombre = 'igv' or (extract(month from vigente_desde) = 1 and extract(day from vigente_desde) = 1));

comment on table retail.parametros_tributarios is
  'Parámetros tributarios con vigencia: tasa de IGV (desde una fecha) y, por año, UIT, régimen de renta, límite en UIT y tasa del pago a cuenta. Solo se agregan filas: una corrección es una fila nueva con la misma vigencia y gana la más reciente. Se leen con fn_tasa_igv / fn_parametro_tributario.';
comment on column retail.parametros_tributarios.provisional is
  'Valor de arranque que el contador todavía no confirmó. El que escribe el líder desde Configuración ya no es provisional.';

-- Valores de arranque, PROVISIONALES: los confirma el contador (PLAN-FINANZAS §10, punto 6).
insert into retail.parametros_tributarios (nombre, vigente_desde, valor, texto, nota, provisional)
select v.nombre, v.vigente_desde, v.valor, v.texto, v.nota, true
  from (values
    ('uit',               date '2025-01-01', 5350::numeric, null::text, 'UIT 2025. Por confirmar con el contador.'),
    ('uit',               date '2026-01-01', 5500,          null,       'Por confirmar con el contador.'),
    ('regimen',           date '2026-01-01', null,          'rmt',      'Régimen MYPE Tributario, por confirmar con el contador.'),
    ('umbral_uit',        date '2026-01-01', 300,           null,       'RMT: pasadas 300 UIT de ventas en el año se lleva Diario y Mayor completos y sube el pago a cuenta. Por confirmar.'),
    ('renta_pago_cuenta', date '2026-01-01', 0.0100,        null,       'RMT hasta 300 UIT: 1 % de la venta neta del mes. Por confirmar.')
  ) as v (nombre, vigente_desde, valor, texto, nota)
 where not exists (select 1 from retail.parametros_tributarios p where p.nombre = v.nombre and p.vigente_desde = v.vigente_desde);

create or replace function retail.fn_parametros_tributarios_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Un parámetro tributario no se edita ni se borra: se agrega una fila nueva (una corrección también es una fila nueva, y gana la más reciente).'
    using errcode = 'P0001';
end $$;

alter table retail.parametros_tributarios enable row level security;
revoke all on retail.parametros_tributarios from public, anon, authenticated;

reset lock_timeout;

-- ============================== PARTE 2 · funciones ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Parámetros: leer el que rige y guardar ----------

-- La tasa de IGV de una fecha. Igual que en F2a, pero si una vigencia se corrigió, gana la corrección más reciente.
create or replace function retail.fn_tasa_igv(p_fecha date) returns numeric
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare v numeric;
begin
  select valor into v from retail.parametros_tributarios
   where nombre = 'igv' and vigente_desde <= p_fecha
   order by vigente_desde desc, created_at desc, id desc limit 1;
  if v is null then
    raise exception 'No hay tasa de IGV vigente para el %.', p_fecha using errcode = 'P0001';
  end if;
  return v;
end $$;

-- El parámetro que rige en una fecha (el de su vigencia más cercana hacia atrás; si se corrigió, la corrección más
-- reciente). Sin fila, no devuelve nada: quien la llama decide qué mostrar. Uso interno de las funciones de Impuestos.
create or replace function retail.fn_parametro_tributario(p_nombre text, p_fecha date)
returns table (valor numeric, texto text, vigente_desde date, provisional boolean, nota text)
language sql stable security definer set search_path = retail, public, extensions as $$
  select p.valor, p.texto, p.vigente_desde, p.provisional, p.nota
    from retail.parametros_tributarios p
   where p.nombre = p_nombre and p.vigente_desde <= p_fecha
   order by p.vigente_desde desc, p.created_at desc, p.id desc
   limit 1;
$$;

-- Configuración ▸ Impuestos: cada vigencia con su valor de hoy (la última corrección), quién la puso y cuántas veces se
-- corrigió. Solo el líder.
create or replace function retail.fn_parametros_tributarios_lista()
returns table (nombre text, vigente_desde date, valor numeric, texto text, nota text, provisional boolean,
               registrado_por text, registrado_en timestamptz, correcciones integer)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Solo el líder ve los parámetros tributarios.' using errcode = '42501';
  end if;
  return query
  select distinct on (p.nombre, p.vigente_desde)
         p.nombre, p.vigente_desde, p.valor, p.texto, p.nota, p.provisional,
         nullif(trim(concat_ws(' ', pe.nombres, pe.apellidos)), ''), p.created_at,
         (count(*) over (partition by p.nombre, p.vigente_desde) - 1)::integer
    from retail.parametros_tributarios p
    left join public.personas pe on pe.id = p.registrado_por
   order by p.nombre, p.vigente_desde, p.created_at desc, p.id desc;
end $$;

-- Guardar un parámetro = agregar una fila (una corrección si la vigencia ya existía). Solo el líder, firmado con el
-- responsable. `p_valor` del IGV y del pago a cuenta va como fracción (0.18, 0.01): la pantalla convierte el %.
create or replace function retail.guardar_parametro_tributario(p_nombre text, p_vigente_desde date, p_valor numeric, p_texto text default null)
returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_antes record;
  v_id uuid;
  v_valor numeric := case when p_nombre = 'regimen' then null else p_valor end;
  v_texto text := case when p_nombre = 'regimen' then nullif(trim(p_texto), '') end;
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Solo el líder cambia los parámetros tributarios.' using errcode = '42501';
  end if;
  if p_nombre is null or p_nombre not in ('igv', 'uit', 'umbral_uit', 'renta_pago_cuenta', 'regimen') then
    raise exception 'Ese parámetro no existe.' using errcode = 'P0001';
  end if;
  if p_vigente_desde is null or p_vigente_desde < date '2000-01-01' then
    raise exception 'Falta desde cuándo rige.' using errcode = 'P0001';
  end if;
  if p_nombre <> 'igv' and (extract(month from p_vigente_desde) <> 1 or extract(day from p_vigente_desde) <> 1) then
    raise exception 'La UIT, el régimen, el límite y el pago a cuenta rigen por año: desde el 1 de enero.' using errcode = 'P0001';
  end if;
  if p_nombre = 'regimen' and (v_texto is null or v_texto not in ('rmt', 'general', 'rer', 'nrus')) then
    raise exception 'Elige un régimen de la lista.' using errcode = 'P0001';
  end if;
  if p_nombre = 'igv' and (v_valor is null or v_valor <= 0 or v_valor >= 1) then
    raise exception 'La tasa de IGV va entre 0 y 100 %%.' using errcode = 'P0001';
  end if;
  if p_nombre = 'renta_pago_cuenta' and (v_valor is null or v_valor < 0 or v_valor >= 1) then
    raise exception 'El pago a cuenta va entre 0 y 100 %% de la venta.' using errcode = 'P0001';
  end if;
  if p_nombre = 'uit' and (v_valor is null or v_valor < 1000 or v_valor > 100000) then
    raise exception 'La UIT va en soles (S/ 5,500, no 5.5).' using errcode = 'P0001';
  end if;
  if p_nombre = 'umbral_uit' and (v_valor is null or v_valor <= 0 or v_valor > 100000) then
    raise exception 'El límite va en UIT (300), no en soles.' using errcode = 'P0001';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  select p.id, p.valor, p.texto, p.provisional into v_antes
    from retail.parametros_tributarios p
   where p.nombre = p_nombre and p.vigente_desde = p_vigente_desde
   order by p.created_at desc, p.id desc limit 1;
  -- Mismo valor y ya confirmado: no hay nada que agregar.
  if v_antes.id is not null and v_antes.valor is not distinct from v_valor and v_antes.texto is not distinct from v_texto
     and not v_antes.provisional then
    return v_antes.id;
  end if;

  -- clock_timestamp y no now(): dos correcciones en la misma transacción siguen teniendo un orden.
  insert into retail.parametros_tributarios (nombre, vigente_desde, valor, texto, provisional, registrado_por, created_at)
  values (p_nombre, p_vigente_desde, v_valor, v_texto, false, v_actor, clock_timestamp())
  returning id into v_id;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('parametro_tributario',
          jsonb_build_object('nombre', p_nombre, 'vigente_desde', p_vigente_desde,
                             'antes', case when v_antes.id is null then null
                                           else jsonb_build_object('valor', v_antes.valor, 'texto', v_antes.texto, 'provisional', v_antes.provisional) end,
                             'despues', jsonb_build_object('valor', v_valor, 'texto', v_texto)),
          v_actor);
  return v_id;
end $$;

-- ---------- 2. Las dos reglas: qué comprobante de venta y qué comprobante de proveedor cuentan ----------

-- Los comprobantes de venta del período que le importan a SUNAT. `cuenta` = entra al IGV (los anulados vienen igual, con
-- `cuenta = false`, porque el registro de ventas los lista en cero). `signo` = −1 en una nota de crédito.
create or replace function retail.fn_impuestos_ventas(p_desde date, p_hasta date)
returns table (comprobante_id uuid, fecha date, tipo text, estado text, cuenta boolean, signo integer,
               base numeric, igv numeric, total numeric)
language sql stable security definer set search_path = retail, public, extensions as $$
  select c.id, (c.created_at at time zone 'America/Lima')::date, c.tipo, c.estado,
         c.estado in ('pendiente', 'enviado', 'aceptado', 'pendiente_reintento'),
         case when c.tipo = 'nota_credito' then -1 else 1 end,
         c.subtotal, c.igv, c.total
    from retail.comprobantes c
   where c.tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito')
     and c.estado in ('pendiente', 'enviado', 'aceptado', 'pendiente_reintento', 'anulado')
     and c.entorno_transmision is distinct from 'sandbox'
     and not exists (select 1 from retail.ventas v where v.id = c.venta_id and v.es_prueba)
     and c.created_at >= (p_desde::timestamp at time zone 'America/Lima')
     and c.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Lima');
$$;

-- Los comprobantes de proveedor del período: compras vigentes (las tres naturalezas), comprobantes del Taller vigentes y
-- notas de crédito del proveedor (en negativo). `da_credito` = solo una factura da IGV descontable. Las notas de venta
-- de un proveedor no son comprobantes de pago: no entran.
create or replace function retail.fn_impuestos_compras(p_desde date, p_hasta date)
returns table (origen text, id uuid, naturaleza text, fecha date, tipo text, base numeric, igv numeric, total numeric, da_credito boolean)
language sql stable security definer set search_path = retail, public, extensions as $$
  select 'compra', k.id, k.naturaleza, k.fecha_emision, k.tipo, k.subtotal, k.igv, k.total, k.tipo = 'factura'
    from retail.compras k
   where k.estado = 'vigente' and k.tipo in ('factura', 'boleta', 'recibo_por_honorarios')
     and k.fecha_emision between p_desde and p_hasta
  union all
  select 'taller', p.id, 'taller', p.fecha_emision, p.tipo, p.subtotal, p.igv, p.total, p.tipo = 'factura'
    from retail.comprobantes_produccion p
   where p.estado = 'vigente' and p.tipo in ('factura', 'boleta')
     and p.fecha_emision between p_desde and p_hasta
  union all
  select 'nota_credito', n.id, k.naturaleza, n.fecha, 'nota_credito', -n.subtotal, -n.igv, -n.monto, k.tipo = 'factura'
    from retail.compra_notas_credito n
    join retail.compras k on k.id = n.compra_id
   where k.estado = 'vigente' and n.fecha between p_desde and p_hasta;
$$;

-- ---------- 3. El IGV de cada mes, con el saldo a favor arrastrado ----------

-- Un mes por fila desde `p_desde` hasta el mes de `p_hasta`. El saldo a favor se arrastra desde el PRIMER mes con datos
-- aunque se pidan menos meses: por eso se recorre desde ahí y solo se devuelven los pedidos.
create or replace function retail.fn_impuestos_igv_meses(p_desde date, p_hasta date)
returns table (mes date, comprobantes integer, base_ventas numeric, igv_ventas numeric, igv_notas_credito numeric, debito numeric,
               credito_mercaderia numeric, credito_gastos numeric, credito_activos numeric, credito_taller numeric,
               credito_notas numeric, credito numeric, saldo_anterior numeric, a_pagar numeric, saldo_a_favor numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_pedido date := date_trunc('month', p_desde)::date;
  v_fin date := date_trunc('month', p_hasta)::date;
  v_ini date;
  v_saldo numeric := 0;
  v_resultado numeric;
  r record;
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Solo el líder ve los impuestos.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or v_pedido > v_fin then
    raise exception 'El rango de meses no es válido.' using errcode = 'P0001';
  end if;
  select date_trunc('month', least(
           v_pedido,
           (select min(x.fecha) from retail.fn_impuestos_ventas(date '2000-01-01', v_fin + 31) x where x.cuenta),
           (select min(x.fecha) from retail.fn_impuestos_compras(date '2000-01-01', v_fin + 31) x where x.da_credito)))::date
    into v_ini;

  for r in
    with meses as (
      select g::date as m from generate_series(v_ini, v_fin, interval '1 month') g
    ),
    ve as (
      select date_trunc('month', x.fecha)::date as m,
             count(*) filter (where x.cuenta)::integer as n,
             coalesce(sum(x.signo * x.base) filter (where x.cuenta), 0) as base,
             coalesce(sum(x.igv) filter (where x.cuenta and x.signo > 0), 0) as igv_mas,
             coalesce(sum(x.igv) filter (where x.cuenta and x.signo < 0), 0) as igv_nc
        from retail.fn_impuestos_ventas(v_ini, (v_fin + interval '1 month - 1 day')::date) x
       group by 1
    ),
    co as (
      select date_trunc('month', x.fecha)::date as m,
             coalesce(sum(x.igv) filter (where x.da_credito and x.origen = 'compra' and x.naturaleza = 'mercaderia'), 0) as cm,
             coalesce(sum(x.igv) filter (where x.da_credito and x.origen = 'compra' and x.naturaleza = 'gasto'), 0) as cg,
             coalesce(sum(x.igv) filter (where x.da_credito and x.origen = 'compra' and x.naturaleza = 'activo'), 0) as ca,
             coalesce(sum(x.igv) filter (where x.da_credito and x.origen = 'taller'), 0) as ct,
             coalesce(-sum(x.igv) filter (where x.da_credito and x.origen = 'nota_credito'), 0) as cn
        from retail.fn_impuestos_compras(v_ini, (v_fin + interval '1 month - 1 day')::date) x
       group by 1
    )
    select meses.m, coalesce(ve.n, 0) as n, coalesce(ve.base, 0) as base, coalesce(ve.igv_mas, 0) as igv_mas,
           coalesce(ve.igv_nc, 0) as igv_nc, coalesce(co.cm, 0) as cm, coalesce(co.cg, 0) as cg, coalesce(co.ca, 0) as ca,
           coalesce(co.ct, 0) as ct, coalesce(co.cn, 0) as cn
      from meses left join ve on ve.m = meses.m left join co on co.m = meses.m
     order by meses.m
  loop
    mes := r.m;
    comprobantes := r.n;
    base_ventas := r.base;
    igv_ventas := r.igv_mas;
    igv_notas_credito := r.igv_nc;
    debito := r.igv_mas - r.igv_nc;
    credito_mercaderia := r.cm;
    credito_gastos := r.cg;
    credito_activos := r.ca;
    credito_taller := r.ct;
    credito_notas := r.cn;
    credito := r.cm + r.cg + r.ca + r.ct - r.cn;
    saldo_anterior := v_saldo;
    v_resultado := debito - credito - v_saldo;
    if v_resultado >= 0 then
      a_pagar := v_resultado;
      saldo_a_favor := 0;
    else
      a_pagar := 0;
      saldo_a_favor := -v_resultado;
    end if;
    v_saldo := saldo_a_favor;
    if r.m >= v_pedido then
      return next;
    end if;
  end loop;
end $$;

-- ---------- 4. La pantalla de Impuestos, en una lectura ----------

-- `p_mes`: el mes que se mira (por defecto, el anterior: el que se declara). Devuelve el mes, los últimos 6 meses hasta
-- hoy, los parámetros que rigen, las ventas de los últimos 24 meses (para el límite y su proyección), el pago a cuenta de
-- renta y lo que conviene revisar antes de declarar.
create or replace function retail.fn_impuestos_panel(p_mes date default null)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_actual date := date_trunc('month', v_hoy)::date;
  v_mes date;
  v_fin_mes date;
  v_hist date := (date_trunc('month', v_hoy) - interval '5 months')::date;
  v_meses jsonb;
  v_uit record;
  v_umbral record;
  v_regimen record;
  v_renta record;
  v_igv record;
  v_ventas jsonb;
  v_12m numeric;
  v_primer date;
  v_umbral_soles numeric;
  v_foco jsonb;
  v_revisar jsonb;
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Solo el líder ve los impuestos (módulo Impuestos, «solo líder por ahora»).' using errcode = '42501';
  end if;
  v_mes := least(date_trunc('month', coalesce(p_mes, (v_hoy - interval '1 month')::date))::date, v_actual);
  v_fin_mes := (v_mes + interval '1 month - 1 day')::date;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.mes), '[]'::jsonb) into v_meses
    from retail.fn_impuestos_igv_meses(least(v_mes, v_hist), v_hoy) m;
  select e into v_foco from jsonb_array_elements(v_meses) e where (e ->> 'mes')::date = v_mes;

  select * into v_igv from retail.fn_parametro_tributario('igv', v_fin_mes);
  select * into v_uit from retail.fn_parametro_tributario('uit', v_hoy);
  select * into v_umbral from retail.fn_parametro_tributario('umbral_uit', v_hoy);
  select * into v_regimen from retail.fn_parametro_tributario('regimen', v_hoy);
  select * into v_renta from retail.fn_parametro_tributario('renta_pago_cuenta', v_fin_mes);

  -- Ventas sin IGV (base imponible, menos notas de crédito) de los últimos 24 meses, mes a mes: la misma fuente que el
  -- débito. El límite mira los últimos 12 (el mes en curso incluido); la pantalla proyecta con el resto.
  select coalesce(jsonb_agg(jsonb_build_object('mes', g.m, 'base', coalesce(v.base, 0)) order by g.m), '[]'::jsonb)
    into v_ventas
    from (select gs::date as m from generate_series((v_actual - interval '23 months')::date, v_actual, interval '1 month') gs) g
    left join (select date_trunc('month', x.fecha)::date as m, sum(x.signo * x.base) filter (where x.cuenta) as base
                 from retail.fn_impuestos_ventas((v_actual - interval '23 months')::date, v_hoy) x group by 1) v on v.m = g.m;
  select coalesce(sum((e ->> 'base')::numeric), 0) into v_12m
    from jsonb_array_elements(v_ventas) e where (e ->> 'mes')::date > (v_actual - interval '12 months')::date;
  select min(x.fecha) into v_primer from retail.fn_impuestos_ventas(date '2000-01-01', v_hoy) x where x.cuenta;
  v_umbral_soles := case when v_uit.valor is not null and v_umbral.valor is not null then round(v_uit.valor * v_umbral.valor, 2) end;

  -- Lo que puede hacer que se pague de más (o de menos), del mes que se mira.
  select jsonb_build_object(
    'boletas', (
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(b.total), 0), 'gastos', count(*) filter (where b.naturaleza = 'gasto'),
                                'proveedores', coalesce((select jsonb_agg(distinct b2.proveedor) from (
                                   select pr.nombre as proveedor from retail.compras k join retail.proveedores pr on pr.id = k.proveedor_id
                                    where k.estado = 'vigente' and k.tipo = 'boleta' and k.fecha_emision between v_mes and v_fin_mes
                                   union all
                                   select pp.nombre from retail.comprobantes_produccion p join retail.proveedores_produccion pp on pp.id = p.proveedor_id
                                    where p.estado = 'vigente' and p.tipo = 'boleta' and p.fecha_emision between v_mes and v_fin_mes) b2), '[]'::jsonb))
        from retail.fn_impuestos_compras(v_mes, v_fin_mes) b
       where b.tipo = 'boleta'),
    'sin_aceptar', (
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(x.total), 0))
        from retail.fn_impuestos_ventas(v_mes, v_fin_mes) x where x.cuenta and x.estado <> 'aceptado'),
    'rechazados', (
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(c.total), 0))
        from retail.comprobantes c
       where c.estado = 'rechazado' and c.tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito')
         and c.entorno_transmision is distinct from 'sandbox'
         and c.created_at >= (v_mes::timestamp at time zone 'America/Lima')
         and c.created_at < ((v_fin_mes + 1)::timestamp at time zone 'America/Lima')),
    -- Ventas del mes sin boleta ni factura que valga (nota de venta, sin comprobante, o la emitió Alegra): su IGV no está
    -- en el débito. Una separación pagada entera no lleva comprobante final: el del anticipo ya la cubrió.
    'sin_comprobante', (
      with validos as (
        select c.venta_id
          from retail.fn_impuestos_ventas(v_mes - 31, v_fin_mes + 31) x
          join retail.comprobantes c on c.id = x.comprobante_id
         where x.cuenta and c.tipo in ('boleta', 'factura') and c.venta_id is not null
      )
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(t.total), 0), 'alegra', count(*) filter (where t.emisor = 'alegra'))
        from (select v.id, v.emisor,
                     (select coalesce(sum(i.subtotal), 0) from retail.venta_items i where i.venta_id = v.id) as total
                from retail.ventas v
               where v.estado <> 'anulada' and not v.es_prueba
                 and v.created_at >= (v_mes::timestamp at time zone 'America/Lima')
                 and v.created_at < ((v_fin_mes + 1)::timestamp at time zone 'America/Lima')
                 and v.id not in (select validos.venta_id from validos)
                 and not exists (select 1 from retail.separaciones s where s.venta_id = v.id and s.comprobante_anticipo_id is not null)) t),
    'honorarios', (
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(k.total), 0), 'mayores', count(*) filter (where k.total > 1500))
        from retail.compras k
       where k.estado = 'vigente' and k.tipo = 'recibo_por_honorarios' and k.fecha_emision between v_mes and v_fin_mes)
  ) into v_revisar;

  return jsonb_build_object(
    'hoy', v_hoy,
    'mes', v_mes,
    'mes_actual', v_actual,
    'foco', v_foco,
    'historial', coalesce((select jsonb_agg(e order by (e ->> 'mes')::date) from jsonb_array_elements(v_meses) e where (e ->> 'mes')::date >= v_hist), '[]'::jsonb),
    'parametros', jsonb_build_object(
      'igv', case when v_igv.valor is null then null else jsonb_build_object('valor', v_igv.valor, 'provisional', v_igv.provisional) end,
      'uit', case when v_uit.valor is null then null else jsonb_build_object('valor', v_uit.valor, 'anio', extract(year from v_uit.vigente_desde)::integer, 'provisional', v_uit.provisional) end,
      'umbral_uit', case when v_umbral.valor is null then null else jsonb_build_object('valor', v_umbral.valor, 'provisional', v_umbral.provisional) end,
      'regimen', case when v_regimen.texto is null then null else jsonb_build_object('texto', v_regimen.texto, 'provisional', v_regimen.provisional) end,
      'renta', case when v_renta.valor is null then null else jsonb_build_object('valor', v_renta.valor, 'provisional', v_renta.provisional) end),
    'umbral', jsonb_build_object(
      'ventas_12m', v_12m,
      'umbral_soles', v_umbral_soles,
      'avance', case when v_umbral_soles > 0 then round(v_12m / v_umbral_soles, 4) end,
      'cruzado', coalesce(v_12m >= v_umbral_soles, false),
      'primer_mes', date_trunc('month', v_primer)::date,
      'ventas_meses', v_ventas),
    'renta', jsonb_build_object(
      'base', coalesce((v_foco ->> 'base_ventas')::numeric, 0),
      'tasa', v_renta.valor,
      'monto', case when v_renta.valor is null then null else round(coalesce((v_foco ->> 'base_ventas')::numeric, 0) * v_renta.valor, 2) end),
    'revisar', v_revisar
  );
end $$;

-- ---------- 5. Los registros para el contador (insumo del PLE 14.1 y 8.1, D-36) ----------

-- Registro de ventas del mes: cada comprobante que le importa a SUNAT, en orden de emisión. La nota de crédito va en
-- negativo con el comprobante que modifica; el anulado va con importes en cero (el PLE lo pide así, para la correlación).
create or replace function retail.fn_impuestos_registro_ventas(p_mes date)
returns table (fecha date, tipo text, serie text, numero integer, cliente_tipo_doc text, cliente_num_doc text, cliente_nombre text,
               base numeric, igv numeric, total numeric, estado text, anulado boolean,
               ref_fecha date, ref_tipo text, ref_serie text, ref_numero integer, tienda text, observacion text)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_ini date := date_trunc('month', p_mes)::date;
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Solo el líder baja los registros para el contador.' using errcode = '42501';
  end if;
  return query
  select x.fecha, c.tipo, c.serie, c.numero, c.cliente_tipo_doc, c.cliente_num_doc, c.cliente_nombre,
         case when x.cuenta then x.signo * c.subtotal else 0 end,
         case when x.cuenta then x.signo * c.igv else 0 end,
         case when x.cuenta then x.signo * c.total else 0 end,
         c.estado, not x.cuenta,
         (o.created_at at time zone 'America/Lima')::date, o.tipo, o.serie, o.numero,
         u.nombre,
         nullif(concat_ws(' · ',
           case when c.es_anticipo then 'Anticipo de un apartado' end,
           case when c.anticipo_deducido > 0 then 'Descuenta el anticipo ' || a.serie || '-' || a.numero || ' (S/ ' || c.anticipo_deducido || ')' end,
           case when c.tipo in ('nota_credito', 'nota_debito') then c.motivo end,
           case when not x.cuenta then 'Anulado: ' || coalesce(c.motivo_anulacion, '') end), '')
    from retail.fn_impuestos_ventas(v_ini, (v_ini + interval '1 month - 1 day')::date) x
    join retail.comprobantes c on c.id = x.comprobante_id
    left join retail.comprobantes o on o.id = c.comprobante_original_id
    left join retail.comprobantes a on a.id = c.anticipo_comprobante_id
    left join retail.ubicaciones u on u.id = c.ubicacion_id
   order by x.fecha, c.created_at, c.serie, c.numero;
end $$;

-- Registro de compras del mes: facturas, boletas y recibos por honorarios de las tres naturalezas, comprobantes del
-- Taller y notas de crédito del proveedor (en negativo, con la factura que modifican). `no_gravado` = lo que no lleva IGV
-- discriminado (una boleta o un recibo va entero ahí).
create or replace function retail.fn_impuestos_registro_compras(p_mes date)
returns table (origen text, naturaleza text, fecha date, vencimiento date, tipo text, serie text, numero text,
               proveedor_ruc text, proveedor text, base numeric, igv numeric, no_gravado numeric, total numeric, da_credito boolean,
               ref_fecha date, ref_tipo text, ref_serie text, ref_numero text, tienda text)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_ini date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Solo el líder baja los registros para el contador.' using errcode = '42501';
  end if;
  return query
  select r.* from (
    select 'compra'::text, k.naturaleza, k.fecha_emision, k.fecha_vencimiento, k.tipo, k.serie, k.numero,
           pr.ruc, pr.nombre,
           case when k.tipo = 'factura' then k.subtotal else 0 end,
           k.igv,
           k.total - case when k.tipo = 'factura' then k.subtotal + k.igv else 0 end,
           k.total, k.tipo = 'factura',
           null::date, null::text, null::text, null::text,
           coalesce(ug.nombre, ugs.nombre, uac.nombre, case when k.naturaleza <> 'mercaderia' then 'De la empresa' end)
      from retail.compras k
      join retail.proveedores pr on pr.id = k.proveedor_id
      left join retail.ubicaciones ug on ug.id = k.ubicacion_gestion_id
      left join lateral (select u.nombre from retail.gastos g join retail.ubicaciones u on u.id = g.ubicacion_id
                          where g.compra_id = k.id and g.estado = 'vigente' limit 1) ugs on true
      left join lateral (select u.nombre from retail.activos_fijos af join retail.ubicaciones u on u.id = af.ubicacion_id
                          where af.compra_id = k.id limit 1) uac on true
     where k.estado = 'vigente' and k.tipo in ('factura', 'boleta', 'recibo_por_honorarios')
       and k.fecha_emision between v_ini and v_fin
    union all
    select 'taller', 'taller', p.fecha_emision, p.fecha_vencimiento, p.tipo, p.serie, p.numero,
           pp.ruc, pp.nombre,
           case when p.tipo = 'factura' then p.subtotal else 0 end,
           p.igv,
           p.total - case when p.tipo = 'factura' then p.subtotal + p.igv else 0 end,
           p.total, p.tipo = 'factura',
           null, null, null, null, 'Taller'
      from retail.comprobantes_produccion p
      join retail.proveedores_produccion pp on pp.id = p.proveedor_id
     where p.estado = 'vigente' and p.tipo in ('factura', 'boleta')
       and p.fecha_emision between v_ini and v_fin
    union all
    select 'nota_credito', k.naturaleza, n.fecha, null, 'nota_credito',
           split_part(n.serie_numero, '-', 1),
           nullif(substr(n.serie_numero, length(split_part(n.serie_numero, '-', 1)) + 2), ''),
           pr.ruc, pr.nombre,
           case when k.tipo = 'factura' then -n.subtotal else 0 end,
           -n.igv,
           -(n.monto - case when k.tipo = 'factura' then n.subtotal + n.igv else 0 end),
           -n.monto, k.tipo = 'factura',
           k.fecha_emision, k.tipo, k.serie, k.numero,
           coalesce(ug.nombre, case when k.naturaleza <> 'mercaderia' then 'De la empresa' end)
      from retail.compra_notas_credito n
      join retail.compras k on k.id = n.compra_id
      join retail.proveedores pr on pr.id = k.proveedor_id
      left join retail.ubicaciones ug on ug.id = k.ubicacion_gestion_id
     where k.estado = 'vigente' and n.fecha between v_ini and v_fin
  ) r (origen, naturaleza, fecha, vencimiento, tipo, serie, numero, proveedor_ruc, proveedor, base, igv, no_gravado, total, da_credito,
       ref_fecha, ref_tipo, ref_serie, ref_numero, tienda)
  order by r.fecha, r.proveedor, r.serie, r.numero;
end $$;

-- ---------- Permisos ----------
revoke all on function retail.fn_tasa_igv(date) from public, anon;
revoke all on function retail.fn_parametro_tributario(text, date) from public, anon, authenticated;
revoke all on function retail.fn_impuestos_ventas(date, date) from public, anon, authenticated;
revoke all on function retail.fn_impuestos_compras(date, date) from public, anon, authenticated;
revoke all on function retail.fn_parametros_tributarios_lista() from public, anon;
revoke all on function retail.guardar_parametro_tributario(text, date, numeric, text) from public, anon;
revoke all on function retail.fn_impuestos_igv_meses(date, date) from public, anon;
revoke all on function retail.fn_impuestos_panel(date) from public, anon;
revoke all on function retail.fn_impuestos_registro_ventas(date) from public, anon;
revoke all on function retail.fn_impuestos_registro_compras(date) from public, anon;
grant execute on function retail.fn_tasa_igv(date) to authenticated;
grant execute on function retail.fn_parametros_tributarios_lista() to authenticated;
grant execute on function retail.guardar_parametro_tributario(text, date, numeric, text) to authenticated;
grant execute on function retail.fn_impuestos_igv_meses(date, date) to authenticated;
grant execute on function retail.fn_impuestos_panel(date) to authenticated;
grant execute on function retail.fn_impuestos_registro_ventas(date) to authenticated;
grant execute on function retail.fn_impuestos_registro_compras(date) to authenticated;

reset lock_timeout;
