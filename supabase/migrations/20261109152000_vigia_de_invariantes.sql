-- ADR-0632: el vigía diario de invariantes en producción (#8 de la auditoría del 2026-11-09).
--
-- EL PROBLEMA. Las 28 invariantes de `/chaos` (el stock cuadra con `movimientos`, la venta con sus pagos, una venta tiene un solo
-- comprobante vivo…) solo se miraban en la base LOCAL, durante un ataque. En producción nadie las corría: un parche pegado en el SQL
-- Editor que hiciera que una devolución no devolviera el stock no daría error en ninguna pantalla, y se notaría semanas después en un
-- conteo, sin saber desde cuándo. Y producción se cambia a mano casi a diario (256 migraciones nuevas en los 14 días al 2026-11-09).
--
-- LO QUE SE AGREGA (todo nuevo: ninguna tabla ni función que ya existe cambia):
--   1. `invariantes`: las consultas como DATOS, sembradas desde `scripts/chaos/invariantes.mjs` (el bloque generado del final; la
--      prueba `scripts/chaos/vigia-semilla.test.mjs` falla si se separan). `activa` es el interruptor de cada una.
--   2. `invariantes_corridas`: una fila por invariante y corrida, con su estado, cuántas filas violan, cuántas son NUEVAS y sus huellas
--      (md5 de la clave: la venta, la caja, la prenda en su sede). Ni un nombre, ni un monto, ni un DNI.
--   3. `invariantes_conocidas`: lo que ya estaba roto cuando se empezó a mirar (`heredada`) o que el Admin aceptó con su motivo
--      (`aceptada`). Se RETIRA cuando deja de aparecer: si vuelve a romperse, cuenta otra vez como nueva.
--   4. `fn_correr_invariantes()`: las corre todas, cada una aislada (un error no tumba a las demás). Solo la llave de servicio (el
--      trabajo programado de Vercel, `/api/salud/invariantes`) o `postgres` sin sesión (el SQL Editor).
--   5. `fn_invariantes_estado()`: la última corrida en resumen, para el Observatorio del Admin.
--   6. `fn_invariantes_aceptar(invariante, nota)`: el Admin dice «esto es así a propósito»; deja de contar como nueva.
--
-- PROMETE: una invariante que no se pudo mirar sale `error` u `omitida` (con su motivo), nunca `limpia`. Lo que sigue roto sigue
--          contando como nuevo cada día hasta que se arregla o se acepta. Dos corridas a la vez: la segunda vuelve sin hacer nada.
-- ASUME:   que las consultas solo leen. Corren envueltas en `select … from (<consulta>) x`, donde Postgres no admite `insert`, `update`
--          ni `delete`, y la tabla de definiciones solo la escribe `postgres` (RLS sin políticas, sin permisos para nadie más).
-- SE DEGRADA ASÍ: si el trabajo programado no corre, no se pierde nada (cada corrida recalcula de los datos de verdad); el Observatorio
--          dice «el vigía no corre» a las 26 horas.
-- NO HACE: no arregla nada. Tampoco tiene un tope de tiempo por invariante: Postgres no corta una consulta que ya corre porque una
--          función cambie `statement_timeout`. Si una se vuelve lenta, cae la corrida entera y eso se ve en el aviso. Y una clave mal
--          escrita solo se nota el día que hay algo que violar (sale «error»): antes la ataja el CI (`vigia-semilla.test.mjs`).
--
-- Sin políticas: las tres tablas solo se leen y escriben por funciones `security definer` (regla de «Políticas y deadlocks»). Se pega
-- en UNA sola parte: no hay `alter` de tablas en uso ni `create policy`. Se puede volver a pegar. Para deshacerla: `drop function` de
-- las tres funciones y `drop table` de las tres tablas (nada más depende de ellas).

set lock_timeout = '3s';

-- ---------- 1. Las definiciones ----------
create table if not exists retail.invariantes (
  id text primary key check (id ~ '^INV-[0-9]{2}$'),
  nombre text not null unique check (nombre ~ '^[a-z_]+$'),
  gravedad smallint not null check (gravedad in (1, 2)),
  nivel text not null check (nivel in ('cruzada', 'sospecha')),
  clave text[] not null check (cardinality(clave) > 0),
  requiere_sesion boolean not null default false,
  activa boolean not null default true,
  dice text not null check (length(dice) > 40),
  sql text not null check (sql ~* '^\s*(with|select)\y'),
  linea_base_en timestamptz,
  creada_en timestamptz not null default now()
);
comment on table retail.invariantes is
  'ADR-0632: los estados imposibles que el vigía diario mira en producción. Sembrada desde scripts/chaos/invariantes.mjs (no se edita a mano, salvo `activa`). `linea_base_en` null = la próxima corrida arma su línea base.';
alter table retail.invariantes enable row level security;
revoke all on table retail.invariantes from public, anon, authenticated;

-- ---------- 2. Las corridas ----------
create table if not exists retail.invariantes_corridas (
  id bigint generated always as identity primary key,
  corrida_id uuid not null,
  corrida_en timestamptz not null,
  invariante_id text not null references retail.invariantes (id),
  estado text not null check (estado in ('limpia', 'viola', 'error', 'omitida')),
  total integer not null default 0,
  nuevas integer not null default 0,
  huellas text[] not null default '{}',
  mensaje text,
  unique (corrida_id, invariante_id),
  -- Lo que cada estado puede llevar: una limpia no tiene filas, una que viola tiene al menos una (y no más huellas que filas, ni más
  -- nuevas que huellas), y una que no se pudo mirar dice por qué.
  constraint invariantes_corridas_estado_cuadra check (
    case estado
      when 'limpia' then total = 0 and nuevas = 0 and cardinality(huellas) = 0 and mensaje is null
      when 'viola' then total > 0 and cardinality(huellas) between 1 and total and nuevas between 0 and cardinality(huellas)
                        and mensaje is null
      else total = 0 and nuevas = 0 and cardinality(huellas) = 0 and mensaje is not null
    end)
);
comment on table retail.invariantes_corridas is
  'ADR-0632: lo que encontró cada corrida del vigía, invariante por invariante. Solo conteos y huellas (md5 de la clave), nunca datos de personas.';
alter table retail.invariantes_corridas enable row level security;
revoke all on table retail.invariantes_corridas from public, anon, authenticated;

-- ---------- 3. Lo que ya se sabía ----------
create table if not exists retail.invariantes_conocidas (
  id bigint generated always as identity primary key,
  invariante_id text not null references retail.invariantes (id),
  huella text not null check (huella ~ '^[0-9a-f]{32}$'),
  motivo text not null check (motivo in ('heredada', 'aceptada')),
  nota text,
  aceptada_por uuid references public.personas (id),
  desde timestamptz not null default now(),
  resuelta_en timestamptz,
  constraint invariantes_conocidas_aceptada_con_motivo check (motivo = 'heredada' or length(btrim(coalesce(nota, ''))) >= 10),
  constraint invariantes_conocidas_heredada_sin_persona check (motivo = 'aceptada' or aceptada_por is null),
  constraint invariantes_conocidas_resuelta_despues check (resuelta_en is null or resuelta_en >= desde)
);
-- Una misma violación se conoce una sola vez mientras siga abierta; una vez retirada puede volver a conocerse.
create unique index if not exists invariantes_conocidas_vigente
  on retail.invariantes_conocidas (invariante_id, huella) where resuelta_en is null;
comment on table retail.invariantes_conocidas is
  'ADR-0632: violaciones que no cuentan como nuevas: las que ya estaban al fijar la línea base (heredada) o las que el Admin aceptó con su motivo. Se retiran (resuelta_en) cuando dejan de aparecer; nunca se borran.';
alter table retail.invariantes_conocidas enable row level security;
revoke all on table retail.invariantes_conocidas from public, anon, authenticated;

-- ---------- 4. Correrlas ----------
create or replace function retail.fn_correr_invariantes()
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_rol text := nullif(auth.role(), '');
  v_corrida uuid := gen_random_uuid();
  v_en timestamptz := clock_timestamp();
  v record;
  v_estado text;
  v_total integer;
  v_huellas text[];
  v_completa boolean;
  v_nuevas integer;
  v_mensaje text;
begin
  -- Solo el trabajo programado (llave de servicio) o el SQL Editor (postgres SIN sesión de nadie). `is not distinct from`: con un
  -- `=`, un rol nulo daría null y el candado quedaría abierto. Una cuenta con sesión (aunque sea Admin) no la corre: no es suya.
  if not (v_rol is not distinct from 'service_role' or (v_rol is null and session_user in ('postgres', 'supabase_admin'))) then
    raise exception 'El vigía de invariantes solo lo corre el trabajo programado.' using errcode = '42501';
  end if;
  -- Un reintento del trabajo programado mientras la anterior sigue: la segunda vuelve sin hacer nada.
  if not pg_try_advisory_xact_lock(hashtext('retail.fn_correr_invariantes')) then
    return jsonb_build_object('ok', false, 'motivo', 'ya_corriendo');
  end if;

  for v in select * from retail.invariantes order by id loop
    v_total := 0;
    v_huellas := '{}';
    v_nuevas := 0;
    v_mensaje := null;
    if not v.activa then
      v_estado := 'omitida';
      v_mensaje := 'Apagada (retail.invariantes.activa = false).';
    elsif v.requiere_sesion then
      v_estado := 'omitida';
      v_mensaje := 'Necesita una sesión con permisos que el trabajo programado no tiene; la mira /chaos como líder.';
    else
      begin
        -- La huella es el md5 de las columnas de la clave (nunca la fila entera: sus cifras cambian de un día a otro).
        execute format(
          'select count(*)::integer, coalesce(array_agg(distinct h), ''{}''::text[]), coalesce(bool_and(completa), true)
             from (select md5((select jsonb_object_agg(k, j -> k) from unnest($1::text[]) k)::text) as h, j ?& $1 as completa
                     from (select to_jsonb(x) as j from (%s) x) y) z',
          v.sql)
          using v.clave
          into v_total, v_huellas, v_completa;
        if not v_completa then
          raise exception 'La clave (%) nombra una columna que la consulta no devuelve.', array_to_string(v.clave, ', ');
        end if;
        v_estado := case when v_total = 0 then 'limpia' else 'viola' end;
      exception when others then
        -- No se pudo mirar: es un error, nunca «limpia». `others` no atrapa una cancelación: si alguien detiene la corrida, se detiene.
        v_estado := 'error';
        v_total := 0;
        v_huellas := '{}';
        v_mensaje := left(sqlerrm, 300);
      end;
    end if;

    if v_estado in ('limpia', 'viola') then
      if v.linea_base_en is null then
        -- Primera vez que se mira (o cambió su consulta o su clave): lo que hay hoy ya estaba. Es la línea base, no algo nuevo.
        update retail.invariantes_conocidas set resuelta_en = v_en where invariante_id = v.id and resuelta_en is null;
        insert into retail.invariantes_conocidas (invariante_id, huella, motivo, desde)
        select v.id, h, 'heredada', v_en from unnest(v_huellas) h;
        update retail.invariantes set linea_base_en = v_en where id = v.id;
      else
        -- Lo conocido que ya no aparece se retira: si vuelve a romperse, cuenta otra vez como nuevo.
        update retail.invariantes_conocidas set resuelta_en = v_en
         where invariante_id = v.id and resuelta_en is null and huella <> all (v_huellas);
        select count(*) into v_nuevas
          from (select unnest(v_huellas)
                except
                select k.huella from retail.invariantes_conocidas k where k.invariante_id = v.id and k.resuelta_en is null) n;
      end if;
    end if;

    insert into retail.invariantes_corridas (corrida_id, corrida_en, invariante_id, estado, total, nuevas, huellas, mensaje)
    values (v_corrida, v_en, v.id, v_estado, v_total, v_nuevas, v_huellas, v_mensaje);
  end loop;

  return retail.fn_invariantes_estado();
end $$;
comment on function retail.fn_correr_invariantes() is
  'ADR-0632: corre las invariantes activas, guarda la corrida y devuelve el resumen (fn_invariantes_estado). Solo la llave de servicio o postgres sin sesión.';

-- ---------- 5. El resumen de la última corrida ----------
create or replace function retail.fn_invariantes_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_rol text := nullif(auth.role(), '');
  v_corrida uuid;
  v_en timestamptz;
  v_resumen jsonb;
begin
  if not (v_rol is not distinct from 'service_role'
          or (v_rol is null and session_user in ('postgres', 'supabase_admin'))
          or retail.fn_es_admin() is true) then
    raise exception 'El estado del vigía de invariantes lo ve el Admin.' using errcode = '42501';
  end if;
  -- La última corrida; el `id desc` desempata dos corridas en el mismo instante.
  select c.corrida_id, c.corrida_en into v_corrida, v_en
    from retail.invariantes_corridas c
   order by c.corrida_en desc, c.id desc
   limit 1;
  if v_corrida is null then
    return jsonb_build_object('ultima_corrida_en', null);
  end if;
  select jsonb_build_object(
           'ultima_corrida_en', v_en,
           'invariantes', count(*),
           'limpias', count(*) filter (where c.estado = 'limpia'),
           'violadas', count(*) filter (where c.estado = 'viola'),
           'nuevas_graves', coalesce(sum(c.nuevas) filter (where i.gravedad = 1), 0),
           'nuevas_leves', coalesce(sum(c.nuevas) filter (where i.gravedad = 2), 0),
           'conocidas', coalesce(sum(cardinality(c.huellas) - c.nuevas), 0),
           'errores', count(*) filter (where c.estado = 'error'),
           'omitidas', count(*) filter (where c.estado = 'omitida'),
           'detalle', coalesce(
             jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'gravedad', i.gravedad, 'estado', c.estado,
                                          'total', c.total, 'nuevas', c.nuevas, 'mensaje', c.mensaje)
                       order by i.gravedad, i.id) filter (where c.estado in ('viola', 'error')),
             '[]'::jsonb))
    into v_resumen
    from retail.invariantes_corridas c
    join retail.invariantes i on i.id = c.invariante_id
   where c.corrida_id = v_corrida;
  return v_resumen;
end $$;
comment on function retail.fn_invariantes_estado() is
  'ADR-0632: resumen de la última corrida del vigía (nuevas graves y leves, conocidas, errores, omitidas y el detalle de lo que viola o falló). Admin, llave de servicio o postgres.';

-- ---------- 6. Aceptar lo que es así a propósito ----------
create or replace function retail.fn_invariantes_aceptar(p_invariante_id text, p_nota text)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_rol text := nullif(auth.role(), '');
  v_huellas text[];
  v_persona uuid;
  v_n integer;
begin
  if not ((v_rol is null and session_user in ('postgres', 'supabase_admin')) or retail.fn_es_admin() is true) then
    raise exception 'Aceptar una invariante rota es del Admin.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nota, ''))) < 10 then
    raise exception 'Escribe por qué es así a propósito (10 letras o más).' using errcode = 'P0001';
  end if;
  select c.huellas into v_huellas
    from retail.invariantes_corridas c
   where c.invariante_id = p_invariante_id
   order by c.corrida_en desc, c.id desc
   limit 1;
  if v_huellas is null then
    raise exception 'La invariante % todavía no se ha corrido.', p_invariante_id using errcode = 'P0001';
  end if;
  if auth.uid() is not null then
    v_persona := retail.fn_actor_persona_id(true);
  end if;
  insert into retail.invariantes_conocidas (invariante_id, huella, motivo, nota, aceptada_por)
  select p_invariante_id, h, 'aceptada', btrim(p_nota), v_persona from unnest(v_huellas) h
  on conflict (invariante_id, huella) where resuelta_en is null do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
comment on function retail.fn_invariantes_aceptar(text, text) is
  'ADR-0632: el Admin acepta, con su motivo, lo que la última corrida encontró en una invariante: deja de contar como nuevo. Devuelve cuántas aceptó.';

revoke all on function retail.fn_correr_invariantes() from public, anon, authenticated;
grant execute on function retail.fn_correr_invariantes() to service_role;
revoke all on function retail.fn_invariantes_estado() from public, anon;
grant execute on function retail.fn_invariantes_estado() to authenticated, service_role;
revoke all on function retail.fn_invariantes_aceptar(text, text) from public, anon;
grant execute on function retail.fn_invariantes_aceptar(text, text) to authenticated;

-- ---------- 7. La siembra ----------
-- >>> siembra generada por scripts/chaos/vigia-semilla.mjs: no se edita a mano
insert into retail.invariantes (id, nombre, gravedad, nivel, clave, requiere_sesion, activa, dice, sql) values
  ('INV-01', 'stock_igual_a_movimientos', 1, 'cruzada', array['variante_id', 'ubicacion_id', 'sububicacion_id']::text[], false, true,
   $txt$`stock` es un snapshot derivado: debe ser exactamente lo que sale de sumar `movimientos` (la misma cuenta de `retail.recalcular_stock()`), por prenda, sede y sububicación, en cantidad y en apartado (principio 4).$txt$,
   $inv$with rec as (
  select variante_id, ubicacion_id, sububicacion_id, sum(c) as c, sum(a) as a from (
    select variante_id, ubicacion_id, sububicacion_id, cantidad as c, 0 as a from retail.movimientos where tipo in ('entrada','ajuste')
    union all select variante_id, ubicacion_id, sububicacion_id, -cantidad, 0 from retail.movimientos where tipo in ('salida','traslado')
    union all select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad, 0 from retail.movimientos where tipo = 'traslado'
    union all select variante_id, ubicacion_id, sububicacion_id, 0, cantidad from retail.movimientos where tipo = 'apartado'
    union all select variante_id, ubicacion_id, sububicacion_id, 0, -cantidad from retail.movimientos where tipo = 'liberacion_apartado'
  ) t group by 1, 2, 3
)
select coalesce(r.variante_id, s.variante_id) as variante_id,
       coalesce(r.ubicacion_id, s.ubicacion_id) as ubicacion_id,
       coalesce(r.sububicacion_id, s.sububicacion_id) as sububicacion_id,
       coalesce(s.cantidad, 0) as stock, coalesce(r.c, 0) as segun_movimientos,
       coalesce(s.cantidad_apartada, 0) as apartado_stock, coalesce(r.a, 0) as apartado_movimientos
  from rec r
  full join retail.stock s on s.variante_id = r.variante_id and s.ubicacion_id = r.ubicacion_id
                          and s.sububicacion_id is not distinct from r.sububicacion_id
 where coalesce(s.cantidad, 0) <> coalesce(r.c, 0) or coalesce(s.cantidad_apartada, 0) <> coalesce(r.a, 0)$inv$),
  ('INV-02', 'venta_cuadra_con_sus_pagos', 1, 'cruzada', array['venta_id']::text[], false, true,
   $txt$Una venta completada cobra exactamente lo que suman sus líneas: Σ `venta_items.subtotal` = Σ `venta_pagos.monto` (el redondeo es un pago más).$txt$,
   $inv$select v.id as venta_id, v.ubicacion_id, round(coalesce(i.t, 0), 2) as lineas, round(coalesce(p.t, 0), 2) as pagos
  from retail.ventas v
  left join (select venta_id, sum(subtotal) as t from retail.venta_items group by 1) i on i.venta_id = v.id
  left join (select venta_id, sum(monto) as t from retail.venta_pagos group by 1) p on p.venta_id = v.id
 where v.estado = 'completada' and abs(coalesce(i.t, 0) - coalesce(p.t, 0)) > 0.011$inv$),
  ('INV-03', 'venta_descuenta_lo_que_vendio', 1, 'cruzada', array['venta_item_id']::text[], false, true,
   $txt$Cada línea de una venta completada tiene salidas de stock por exactamente su cantidad: lo vendido y lo descontado no se separan (ni dobles ni faltantes).$txt$,
   $inv$select i.id as venta_item_id, i.venta_id, i.variante_id, i.cantidad as vendido, coalesce(m.t, 0) as salido
  from retail.venta_items i
  join retail.ventas v on v.id = i.venta_id and v.estado = 'completada'
  left join (select venta_item_id, sum(cantidad) as t from retail.movimientos
              where tipo = 'salida' and venta_item_id is not null group by 1) m on m.venta_item_id = i.id
 where coalesce(m.t, 0) <> i.cantidad
   -- ADR-0379: una pieza de liquidación nunca estuvo en el stock, así que su línea no descuenta nada a propósito. Lo que la
   -- cuida es INV-13 (la pieza vendida cuadra con su línea), no esta.
   and not exists (select 1 from retail.piezas_liquidacion pl where pl.venta_item_id = i.id)
   -- ADR-0408 act. 10: la prenda de un pedido web se vende al quedar pagado y sale del stock recién al entregarla. Mientras su
   -- línea del pedido no se entrega, su línea de venta no tiene salida a propósito (con una, sí es violación). La cuida INV-18.
   and not (coalesce(m.t, 0) = 0
            and exists (select 1 from retail.pedido_web_lineas pwl where pwl.venta_item_id = i.id and pwl.estado <> 'entregada'))$inv$),
  ('INV-04', 'venta_en_su_caja_y_su_hora', 1, 'cruzada', array['venta_id']::text[], false, true,
   $txt$Toda venta cae en una caja de SU sede y dentro del tiempo en que esa caja estuvo abierta: nunca en la de otra sede ni en el día de ayer, ya contado y depositado.$txt$,
   $inv$select v.id as venta_id, v.caja_id, v.ubicacion_id as sede_venta, c.ubicacion_id as sede_caja, v.created_at, c.abierta_en, c.cerrada_en
  from retail.ventas v
  left join retail.cajas c on c.id = v.caja_id
 where not coalesce(v.es_prueba, false)
   and (v.caja_id is null
        or c.ubicacion_id <> v.ubicacion_id
        or v.created_at < c.abierta_en - interval '2 seconds'
        or (c.cerrada_en is not null and v.created_at > c.cerrada_en + interval '2 seconds'))$inv$),
  ('INV-05', 'caja_cerrada_cuadra_su_diferencia', 1, 'cruzada', array['caja_id']::text[], false, true,
   $txt$Una caja cerrada tiene fecha de cierre y monto contado, una abierta no tiene ninguno, y la diferencia es exactamente lo contado menos lo que el sistema esperaba.$txt$,
   $inv$select id as caja_id, ubicacion_id, estado, cerrada_en, monto_cierre_sistema, monto_cierre_real, diferencia
  from retail.cajas
 where (estado = 'cerrada' and (cerrada_en is null or monto_cierre_real is null))
    or (estado = 'abierta' and (cerrada_en is not null or monto_cierre_real is not null))
    or (estado = 'cerrada' and monto_cierre_real is not null and monto_cierre_sistema is not null
        and abs(coalesce(diferencia, 0) - (monto_cierre_real - monto_cierre_sistema)) > 0.011)$inv$),
  ('INV-06', 'un_comprobante_por_venta', 1, 'cruzada', array['venta_id']::text[], false, true,
   $txt$Una venta tiene a lo sumo un comprobante vivo (boleta o factura): dos significa que se cobró y se facturó dos veces. Los anulados y rechazados no cuentan; los anticipos de un apartado tampoco.$txt$,
   $inv$select venta_id, count(*) as comprobantes, array_agg(serie || '-' || numero order by numero) as numeros
  from retail.comprobantes
 where venta_id is not null and tipo in ('boleta', 'factura')
   and estado not in ('anulado', 'rechazado') and not coalesce(es_anticipo, false)
 group by venta_id having count(*) > 1$inv$),
  ('INV-07', 'comprobante_suma_lo_que_la_venta', 1, 'cruzada', array['comprobante_id']::text[], false, true,
   $txt$El total de la boleta o factura es el de la venta que la originó: lo que SUNAT recibe es lo que la clienta pagó.$txt$,
   $inv$select c.id as comprobante_id, c.venta_id, c.serie || '-' || c.numero as numero, c.total as comprobante, round(i.t, 2) as venta
  from retail.comprobantes c
  join (select venta_id, sum(subtotal) as t from retail.venta_items group by 1) i on i.venta_id = c.venta_id
 where c.tipo in ('boleta', 'factura') and c.estado not in ('anulado', 'rechazado')
   and not coalesce(c.es_anticipo, false) and coalesce(c.anticipo_deducido, 0) = 0
   and abs(c.total - i.t) > 0.011$inv$),
  ('INV-08', 'lo_que_entra_por_un_traslado_salio_de_alguna_sede', 1, 'cruzada', array['transferencia_id', 'variante_id']::text[], false, true,
   $txt$Por un traslado no puede entrar a una sede más de una prenda que la que salió por él: sería stock que apareció sin salir de ninguna parte.$txt$,
   $inv$with entro as (
  select tr.transferencia_id, m.variante_id, sum(m.cantidad) as q
    from retail.movimientos m join retail.transferencia_recepciones tr on tr.id = m.transferencia_recepcion_id
   where m.tipo = 'entrada'
   group by 1, 2
), salio as (
  select coalesce(ti.transferencia_id, trs.transferencia_id) as transferencia_id, m.variante_id, sum(m.cantidad) as q
    from retail.movimientos m
    left join retail.transferencia_items ti on ti.id = m.transferencia_item_id
    left join retail.transferencia_recepciones trs on trs.id = m.transferencia_recepcion_id
   where m.tipo = 'salida' and coalesce(ti.transferencia_id, trs.transferencia_id) is not null
   group by 1, 2
)
select e.transferencia_id, e.variante_id, coalesce(s.q, 0) as salio, e.q as entro
  from entro e left join salio s on s.transferencia_id = e.transferencia_id and s.variante_id = e.variante_id
 where e.q > coalesce(s.q, 0)$inv$),
  ('INV-09', 'asientos_cuadran', 1, 'cruzada', array['asiento']::text[], true, true,
   $txt$El libro cuadra: ningún asiento tiene Σdebe distinto de Σhaber (usa `retail.fn_asientos_descuadrados`, la misma función que Finanzas).$txt$,
   $inv$select asiento, regla, fecha, debe, haber, diferencia from retail.fn_asientos_descuadrados(date '2000-01-01', date '2100-01-01')$inv$),
  ('INV-10', 'movimiento_con_responsable', 2, 'cruzada', array['movimiento_id']::text[], false, true,
   $txt$Todo movimiento de stock lo firma una persona (`usuario_id`): un movimiento sin autor no se puede explicar en el conteo del mes.$txt$,
   $inv$select id as movimiento_id, tipo, variante_id, ubicacion_id, cantidad, created_at
  from retail.movimientos where usuario_id is null$inv$),
  ('INV-11', 'sospecha_de_doble_cobro', 2, 'sospecha', array['venta_a', 'venta_b']::text[], false, false,
   $txt$SOSPECHA (se confirma mirando): dos ventas de la misma sede y persona, con las mismas prendas, a menos de 10 segundos y con tokens distintos: el patrón de un doble clic que se coló.$txt$,
   $inv$with firma as (
  select v.id, v.ubicacion_id, v.usuario_id, v.created_at,
         (select string_agg(i.variante_id::text || ':' || i.cantidad, ',' order by i.variante_id, i.cantidad)
            from retail.venta_items i where i.venta_id = v.id) as prendas
    from retail.ventas v where v.estado = 'completada'
)
select a.id as venta_a, b.id as venta_b, a.ubicacion_id, round(extract(epoch from b.created_at - a.created_at)::numeric, 1) as segundos
  from firma a
  join firma b on b.ubicacion_id = a.ubicacion_id and b.usuario_id is not distinct from a.usuario_id
              and b.id <> a.id and b.created_at >= a.created_at and b.created_at - a.created_at < interval '10 seconds'
              and b.prendas = a.prendas and (b.created_at > a.created_at or b.id > a.id)$inv$),
  ('INV-12', 'sospecha_de_movimiento_repetido', 2, 'sospecha', array['movimiento_a', 'movimiento_b']::text[], false, false,
   $txt$SOSPECHA (se confirma mirando): dos movimientos idénticos (misma prenda, sede, tipo, cantidad y persona) a menos de 2 segundos y sin venta: el patrón de un «Guardar» pulsado dos veces en Ajustar, Recibir o Traslado.$txt$,
   $inv$select a.id as movimiento_a, b.id as movimiento_b, a.tipo, a.variante_id, a.cantidad, a.ubicacion_id,
       round(extract(epoch from b.created_at - a.created_at)::numeric, 2) as segundos
  from retail.movimientos a
  join retail.movimientos b on b.id <> a.id and b.variante_id = a.variante_id and b.ubicacion_id = a.ubicacion_id
                           and b.sububicacion_id is not distinct from a.sububicacion_id and b.tipo = a.tipo
                           and b.cantidad = a.cantidad and b.usuario_id is not distinct from a.usuario_id
                           and b.created_at >= a.created_at and b.created_at - a.created_at < interval '2 seconds'
                           and (b.created_at > a.created_at or b.id > a.id)
 where a.venta_item_id is null and b.venta_item_id is null
   and a.transferencia_item_id is null and a.compra_item_id is null and a.produccion_id is null$inv$),
  ('INV-13', 'pieza_de_liquidacion_cuadra', 1, 'cruzada', array['pieza_id']::text[], false, true,
   $txt$Una pieza de liquidación (ADR-0379) a la venta tiene UNA etiqueta que la caja acepta, y una vendida apunta a una línea de una venta completada, de una sola unidad, cobrada al precio de su etiqueta: nunca vendida dos veces, ni vendida en una venta anulada, ni a otro precio.$txt$,
   $inv$select p.id as pieza_id, p.estado, p.precio, vi.precio_unitario, vi.cantidad, v.estado as venta_estado,
       (select count(*) from retail.piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente) as vigentes
  from retail.piezas_liquidacion p
  left join retail.venta_items vi on vi.id = p.venta_item_id
  left join retail.ventas v on v.id = vi.venta_id
 where (p.estado = 'disponible' and (select count(*) from retail.piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente) <> 1)
    or (p.estado = 'vendida' and (v.estado is distinct from 'completada' or vi.cantidad <> 1 or vi.precio_unitario <> p.precio
                                  or vi.descuento_unitario <> 0))
    or (p.estado <> 'disponible' and exists (select 1 from retail.piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente and p.estado = 'retirada'))$inv$),
  ('INV-14', 'compra_anulada_sin_mercaderia', 1, 'cruzada', array['compra_id']::text[], false, true,
   $txt$Una factura de proveedor anulada no tiene mercadería ingresada: `anular_compra` lo prohíbe («dejaría stock o dinero sin respaldo»). Si la tiene, hay prendas en el stock que ya no le deben nada a nadie. Nació de /chaos 2026-10-13 (recibir y anular a la vez: las dos pasaban).$txt$,
   $inv$select c.id as compra_id, c.serie || '-' || c.numero as factura, sum(m.cantidad) as unidades_ingresadas
  from retail.compras c
  join retail.compra_items ci on ci.compra_id = c.id
  join retail.movimientos m on m.compra_item_id = ci.id
 where c.estado = 'anulada'
 group by c.id, c.serie, c.numero$inv$),
  ('INV-15', 'caja_abierta_con_efectivo', 1, 'cruzada', array['caja_id']::text[], false, true,
   $txt$Una caja abierta nunca espera menos de cero en el cajón: no se puede sacar plata que no está (egresos, reembolsos, vueltos de un cambio, ventas anuladas). Se calcula con `fn_calcular_esperado_caja`, la misma cuenta que usa `cerrar_caja`. Nació de /chaos 2026-10-13.$txt$,
   $inv$select c.id as caja_id, c.ubicacion_id, e.esperado
  from retail.cajas c
  cross join lateral retail.fn_calcular_esperado_caja(c.id) e
 where c.estado = 'abierta' and e.esperado < 0$inv$),
  ('INV-16', 'montos_de_ventas_finitos', 1, 'cruzada', array['tabla', 'fila_id']::text[], false, true,
   $txt$Ningún monto de Ventas o de Caja es `NaN` ni infinito. En Postgres `'NaN'::numeric` es mayor que cualquier número y `'Infinity'` también existe: los dos pasan los CHECK `>= 0` y, una vez dentro, cualquier suma que los toque (el esperado de la caja, el total del día) se rompe. Nació de /chaos 2026-10-13.$txt$,
   $inv$select 'cajas' as tabla, id::text as fila_id, 'monto_apertura,monto_cierre_sistema,monto_cierre_real,diferencia,monto_fondo,monto_apertura_esperado,fondo_requerido' as columnas from retail.cajas where abs(monto_apertura) >= 'Infinity' or abs(monto_cierre_sistema) >= 'Infinity' or abs(monto_cierre_real) >= 'Infinity' or abs(diferencia) >= 'Infinity' or abs(monto_fondo) >= 'Infinity' or abs(monto_apertura_esperado) >= 'Infinity' or abs(fondo_requerido) >= 'Infinity'
union all
select 'caja_movimientos' as tabla, id::text as fila_id, 'monto' as columnas from retail.caja_movimientos where abs(monto) >= 'Infinity'
union all
select 'caja_traslados' as tabla, id::text as fila_id, 'monto' as columnas from retail.caja_traslados where abs(monto) >= 'Infinity'
union all
select 'venta_pagos' as tabla, id::text as fila_id, 'monto,recibido' as columnas from retail.venta_pagos where abs(monto) >= 'Infinity' or abs(recibido) >= 'Infinity'
union all
select 'venta_items' as tabla, id::text as fila_id, 'precio_unitario,descuento_unitario,costo_unitario,descuento_club_unitario' as columnas from retail.venta_items where abs(precio_unitario) >= 'Infinity' or abs(descuento_unitario) >= 'Infinity' or abs(costo_unitario) >= 'Infinity' or abs(descuento_club_unitario) >= 'Infinity'
union all
select 'ventas' as tabla, id::text as fila_id, 'descuento_pct' as columnas from retail.ventas where abs(descuento_pct) >= 'Infinity'
union all
select 'cambios' as tabla, id::text as fila_id, 'diferencia' as columnas from retail.cambios where abs(diferencia) >= 'Infinity'
union all
select 'devoluciones' as tabla, id::text as fila_id, 'reembolso_monto' as columnas from retail.devoluciones where abs(reembolso_monto) >= 'Infinity'
union all
select 'separaciones' as tabla, id::text as fila_id, 'total,adelanto' as columnas from retail.separaciones where abs(total) >= 'Infinity' or abs(adelanto) >= 'Infinity'
union all
select 'separacion_items' as tabla, id::text as fila_id, 'precio_unitario,descuento_unitario' as columnas from retail.separacion_items where abs(precio_unitario) >= 'Infinity' or abs(descuento_unitario) >= 'Infinity'
union all
select 'separacion_pagos' as tabla, id::text as fila_id, 'monto,recibido' as columnas from retail.separacion_pagos where abs(monto) >= 'Infinity' or abs(recibido) >= 'Infinity'
union all
select 'separacion_abonos' as tabla, id::text as fila_id, 'monto' as columnas from retail.separacion_abonos where abs(monto) >= 'Infinity'
union all
select 'separacion_ediciones' as tabla, id::text as fila_id, 'total_antes,total_despues' as columnas from retail.separacion_ediciones where abs(total_antes) >= 'Infinity' or abs(total_despues) >= 'Infinity'
union all
select 'comprobantes' as tabla, id::text as fila_id, 'subtotal,igv,total,anticipo_deducido' as columnas from retail.comprobantes where abs(subtotal) >= 'Infinity' or abs(igv) >= 'Infinity' or abs(total) >= 'Infinity' or abs(anticipo_deducido) >= 'Infinity'
union all
select 'proformas' as tabla, id::text as fila_id, 'subtotal,igv,total' as columnas from retail.proformas where abs(subtotal) >= 'Infinity' or abs(igv) >= 'Infinity' or abs(total) >= 'Infinity'$inv$),
  ('INV-17', 'montos_de_plata_finitos', 1, 'cruzada', array['tabla', 'fila_id']::text[], false, true,
   $txt$Ningún monto de la plata de Finanzas o de un fondo (movimientos de dinero, gastos, pagos a proveedores, el reparto de un gasto del viaje, las rendiciones) es `NaN` ni infinito. Un NaN pasa el CHECK `> 0` y, una vez dentro, deja en NaN el saldo del fondo, la caja de origen y el Diario. Nació de /chaos 2026-10-14 (fase 6).$txt$,
   $inv$select 'movimientos_dinero' as tabla, id::text as fila_id, 'monto,comision' as columnas from retail.movimientos_dinero where abs(monto) >= 'Infinity' or abs(comision) >= 'Infinity'
union all
select 'gastos' as tabla, id::text as fila_id, 'monto_total,igv' as columnas from retail.gastos where abs(monto_total) >= 'Infinity' or abs(igv) >= 'Infinity'
union all
select 'compra_pagos' as tabla, id::text as fila_id, 'monto' as columnas from retail.compra_pagos where abs(monto) >= 'Infinity'
union all
select 'gastos_viaje_ordenes' as tabla, gasto_id::text as fila_id, 'monto' as columnas from retail.gastos_viaje_ordenes where abs(monto) >= 'Infinity'
union all
select 'rendiciones_fondo' as tabla, id::text as fila_id, 'arrastre,entregado,devuelto,pagado,gastos,otros,saldo,efectivo,faltante' as columnas from retail.rendiciones_fondo where abs(arrastre) >= 'Infinity' or abs(entregado) >= 'Infinity' or abs(devuelto) >= 'Infinity' or abs(pagado) >= 'Infinity' or abs(gastos) >= 'Infinity' or abs(otros) >= 'Infinity' or abs(saldo) >= 'Infinity' or abs(efectivo) >= 'Infinity' or abs(faltante) >= 'Infinity'
union all
select 'rendicion_fondo_items' as tabla, rendicion_id || ':' || clave::text as fila_id, 'monto' as columnas from retail.rendicion_fondo_items where abs(monto) >= 'Infinity'$inv$),
  ('INV-18', 'pedido_web_cuadra_con_su_venta', 1, 'cruzada', array['pedido_id', 'problema']::text[], false, true,
   $txt$Un pedido web pagado o entregado tiene UNA venta (ADR-0408 act. 10): una línea de venta por prenda no quitada, cobrada con un solo «anticipo» por el total, con su boleta; y cada prenda sale del stock al entregarse, nunca antes (una salida por prenda entregada, ninguna por la que todavía espera). Un pedido sin pagar no tiene venta. Uno anulado DESPUÉS de pagarse (20261015114000) conserva su venta, ANULADA entera, se le devolvió todo y su boleta no quedó viva ante SUNAT sin su nota de crédito.$txt$,
   $inv$select w.id as pedido_id, w.codigo, w.estado, 'venta' as problema
  from retail.pedidos_web w
 where (w.estado in ('pagado', 'entregado') or (w.estado = 'anulado' and w.pagado_en is not null)) <> (w.venta_id is not null)
union all
select w.id, w.codigo, w.estado, 'lineas'
  from retail.pedidos_web w
 where w.venta_id is not null
   and (exists (select 1 from retail.pedido_web_lineas l
                 where l.pedido_id = w.id and l.estado <> 'quitada'
                   and not exists (select 1 from retail.venta_items vi
                                    where vi.id = l.venta_item_id and vi.venta_id = w.venta_id and vi.variante_id = l.variante_id
                                      and vi.cantidad = 1 and vi.precio_unitario = l.precio_lista and vi.descuento_unitario = l.descuento))
        or exists (select 1 from retail.venta_items vi where vi.venta_id = w.venta_id
                    and not exists (select 1 from retail.pedido_web_lineas l where l.pedido_id = w.id and l.venta_item_id = vi.id)))
union all
select w.id, w.codigo, w.estado, 'cobro'
  from retail.pedidos_web w
 where w.venta_id is not null
   and coalesce((select string_agg(vp.metodo || ':' || vp.monto, ',') from retail.venta_pagos vp where vp.venta_id = w.venta_id), '')
       <> 'anticipo:' || w.total
union all
select w.id, w.codigo, w.estado, 'boleta'
  from retail.pedidos_web w
 where w.venta_id is not null
   and not exists (select 1 from retail.comprobantes c where c.venta_id = w.venta_id and c.tipo in ('boleta', 'factura'))
union all
select w.id, w.codigo, w.estado, 'salida'
  from retail.pedidos_web w
  join retail.pedido_web_lineas l on l.pedido_id = w.id and l.venta_item_id is not null
 where coalesce((select sum(m.cantidad) from retail.movimientos m where m.venta_item_id = l.venta_item_id and m.tipo = 'salida'), 0)
       <> case when l.estado = 'entregada' then 1 else 0 end
union all
select w.id, w.codigo, w.estado, 'entrega'
  from retail.pedidos_web w
 where w.estado = 'entregado'
   and exists (select 1 from retail.pedido_web_lineas l where l.pedido_id = w.id and l.estado not in ('quitada', 'entregada'))
union all
-- Anulado después de pagarse: su venta anulada entera (cada línea con su anulación), nada sin devolver y la boleta sin quedar viva.
select w.id, w.codigo, w.estado, 'anulacion'
  from retail.pedidos_web w
  join retail.ventas v on v.id = w.venta_id
 where w.estado = 'anulado' and w.pagado_en is not null
   and (v.estado <> 'anulada' or w.pagado <> 0
        or exists (select 1 from retail.venta_items vi where vi.venta_id = v.id
                    and not exists (select 1 from retail.venta_anulacion_items ai where ai.venta_item_id = vi.id))
        or exists (select 1 from retail.comprobantes c where c.venta_id = v.id and c.tipo in ('boleta', 'factura')
                    and (c.estado in ('pendiente', 'pendiente_reintento', 'enviado')
                         or (c.estado = 'aceptado' and not exists (select 1 from retail.comprobantes n
                                                                   where n.comprobante_original_id = c.id and n.tipo = 'nota_credito')))))$inv$),
  ('INV-19', 'la_plata_de_nos_debe_cuadra', 1, 'cruzada', array['fila_id', 'problema']::text[], false, true,
   $txt$La plata de «Nos debe» (ADR-0362, fase 5b) cuadra entre tablas: el documento interno por lo que no llegó cierra sus prendas en el comprobante y el de lo devuelto por llegar dañado no cierra nada (sí llegaron), cada uno de la deuda que le corresponde; un «Depositó» devuelve exactamente lo que su documento dejó a favor (ni más ni menos: lo demás sería saldo a favor fantasma o un reembolso de más); y la nota de crédito del proveedor (07) dice lo mismo que los documentos internos que respalda, todos de su comprobante. Nació de /chaos 2026-10-15 (fase 5b).$txt$,
   $inv$select n.id::text as fila_id, n.serie_numero, 'documento_y_cierre' as problema
  from retail.compra_notas_credito n
 where n.interna
   and ((n.motivo = 'devolucion') <> (n.cierre_id is null)
        or exists (select 1 from retail.proveedor_deuda_resoluciones r join retail.despacho_diferencias x on x.id = r.diferencia_id
                    where r.nota_credito_id = n.id and (x.causa = 'devuelta') <> (n.motivo = 'devolucion')))
union all
select r.id::text, n.serie_numero, 'deposito'
  from retail.proveedor_deuda_resoluciones r
  join retail.compra_notas_credito n on n.id = r.nota_credito_id
 where r.forma = 'deposito'
   and coalesce((select sum(k.monto) from retail.proveedor_creditos k where k.nota_credito_id = n.id and k.tipo = 'reembolso'), 0)
       <> coalesce((select sum(k.monto) from retail.proveedor_creditos k where k.nota_credito_id = n.id and k.tipo = 'nota_credito'), 0)
union all
select p.id::text, p.serie_numero, 'nota_proveedor'
  from retail.compra_notas_proveedor p
  left join lateral (select sum(n.monto) as monto, sum(n.igv) as igv
                       from retail.compra_notas_proveedor_documentos d
                       join retail.compra_notas_credito n on n.id = d.nota_credito_id
                      where d.nota_proveedor_id = p.id) s on true
 where p.monto is distinct from s.monto or p.igv is distinct from s.igv
    or exists (select 1 from retail.compra_notas_proveedor_documentos d join retail.compra_notas_credito n on n.id = d.nota_credito_id
                where d.nota_proveedor_id = p.id and (not n.interna or n.compra_id <> p.compra_id))$inv$),
  ('INV-20', 'lo_devuelto_cuadra_con_su_prenda', 1, 'cruzada', array['diferencia_id', 'problema']::text[], false, true,
   $txt$Cada deuda «devuelta» (lo que se le devolvió al proveedor por llegar dañado, ADR-0362 fase 5b, actividad 6a) tiene su prenda de la cuarentena marcada «devuelta al proveedor» a ESE proveedor y por la misma cantidad, con su salida de la cuarentena sin `compra_item_id` (si lo llevara, el comprobante la contaría como recibida otra vez). Si no, la deuda cobra prendas que siguen en la cuarentena, o a otro proveedor. Nació de /chaos 2026-10-15 (fase 5b).$txt$,
   $inv$select x.id::text as diferencia_id, coalesce(pd.estado, 'sin prenda') as estado, 'prenda' as problema
  from retail.despacho_diferencias x
  left join retail.prendas_danadas pd on pd.id = x.prenda_danada_id
 where x.causa = 'devuelta'
   and (pd.id is null or pd.estado <> 'devuelta_proveedor' or pd.proveedor_id is distinct from x.proveedor_id or pd.cantidad <> x.cantidad
        or not exists (select 1 from retail.movimientos m
                        where m.id = pd.movimiento_salida_id and m.tipo = 'salida' and m.motivo = 'cuarentena_devuelta_proveedor'
                          and m.compra_item_id is null and m.cantidad = pd.cantidad))$inv$),
  ('INV-21', 'caja_cerrada_cuadra_su_fondo', 1, 'cruzada', array['caja_id']::text[], false, true,
   $txt$Una caja cerrada real cumple contado = fondo que deja + trasladado (ADR-0186: el fondo se calcula, nunca se escribe). Si no, el cajón de esa noche sale inflado o desinflado, la apertura del día siguiente «falta» o «sobra» contra un esperado que nunca existió, y el Diario lo asienta como pérdida. Nació de la auditoría de Finanzas 2026-10-16 (G01): un traslado regularizado a mano sin tocar el fondo dejó S/ 700 de falso faltante en Trujillo. Desde `20261016211000` un candado diferido lo impide; esta invariante vigila lo que ya estaba o lo que se cuele por una puerta nueva.$txt$,
   $inv$select c.id as caja_id, c.ubicacion_id, c.monto_cierre_real, c.monto_fondo,
       coalesce((select sum(t.monto) from retail.caja_traslados t where t.caja_id = c.id), 0) as trasladado
  from retail.cajas c
 where c.estado = 'cerrada' and not c.es_prueba and c.monto_fondo is not null and c.monto_cierre_real is not null
   and abs(c.monto_fondo + coalesce((select sum(t.monto) from retail.caja_traslados t where t.caja_id = c.id), 0) - c.monto_cierre_real) >= 0.005$inv$),
  ('INV-22', 'cambio_por_varias_cuadra', 1, 'cruzada', array['cambio_id']::text[], false, true,
   $txt$Un cambio de una prenda por VARIAS cuadra en las tres cosas que lo definen (ADR-0470): su diferencia es el valor de todo lo que se llevó menos lo que la clienta pagó por lo que devolvió; las unidades que salieron del piso son las que dice su lista de prendas; y las que volvieron son las que se devolvieron. Si no, la caja o la cuenta de Izipay cobraron una cifra y el stock movió otra. `registrar_cambio_varias` lo guarda todo junto; esto vigila lo que se cuele por otra puerta o un arreglo a mano. Nació del cambio del body por dos Top Rib (B005-000670, 2026-10-21), que se había registrado como un cambio uno por uno y una venta aparte.$txt$,
   $inv$select c.id as cambio_id, c.diferencia,
       round(sum(s.precio_unitario * s.cantidad) - (vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2) as diferencia_esperada,
       sum(s.cantidad) as unidades_anotadas,
       (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'salida') as unidades_que_salieron,
       c.cantidad as unidades_devueltas,
       (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'entrada') as unidades_que_volvieron
  from retail.cambios c
  join retail.venta_items vi on vi.id = c.venta_item_id
  join retail.cambio_salidas s on s.cambio_id = c.id
 group by c.id, c.diferencia, c.cantidad, vi.precio_unitario, vi.descuento_unitario
having c.diferencia <> round(sum(s.precio_unitario * s.cantidad) - (vi.precio_unitario - vi.descuento_unitario) * c.cantidad, 2)
    or sum(s.cantidad) <> (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'salida')
    or c.cantidad <> (select coalesce(sum(m.cantidad), 0) from retail.movimientos m where m.cambio_id = c.id and m.tipo = 'entrada')$inv$),
  ('INV-23', 'stock_por_dueno_cuadra', 1, 'cruzada', array['variante_id', 'ubicacion_id', 'sububicacion_id', 'motivo']::text[], false, true,
   $txt$En una sede donde operan dos empresas (Lima), lo de CLAURE (`stock_dueno`) nunca pasa del stock de su fila, ni lo apartado de lo apartado, y no hay reparto por dueño donde operan una sola empresa (ADR-0542: CAYLA es el resto, así que este es el único descuadre posible).$txt$,
   $inv$select variante_id, ubicacion_id, sububicacion_id, motivo from retail.fn_stock_dueno_descuadres()$inv$),
  ('INV-24', 'copias_del_color_iguales_a_su_tela', 2, 'cruzada', array['insumo_id']::text[], false, true,
   $txt$Cada color de una tela (un insumo con `material_id`, ADR-0554) es el reflejo de su tela: mismo tipo y unidad (una tela siempre en metros), mismo tejido, misma merma, el código «código de la tela-código del color» y un nombre que empieza por el de la ficha MÁS SU MEDIDA si la tiene (ADR-0580: el disparador compone «Botón nácar 18 L · Negro», y sin contar la medida esta invariante gritaba en cada avío y se volvía ciega para un descuadre de verdad). Si no, la orden pide una merma que la tela ya no tiene, el plan sugiere el tejido equivocado o dos colores de una misma tela se llaman distinto. Un disparador las copia en cada guardado; esto vigila lo que se cuele por un camino que lo salte (un arreglo a mano con los disparadores apagados, o una migración). El nombre se compara solo hasta el de la tela: el color puede haberse renombrado en Catálogo y el insumo no se entera hasta que se guarda su tela (se corrige guardándola desde «Editar tela»).$txt$,
   $inv$select i.id as insumo_id, i.codigo, i.nombre, m.codigo as tela_codigo, m.nombre as tela,
       i.tipo as tipo_del_color, m.tipo as tipo_de_la_tela, i.unidad_medida as unidad_del_color, m.unidad_medida as unidad_de_la_tela,
       i.tejido_id as tejido_del_color, m.tejido_id as tejido_de_la_tela, i.merma_pct as merma_del_color, m.merma_pct as merma_de_la_tela
  from retail.insumos i
  join retail.materiales m on m.id = i.material_id
 where i.tipo is distinct from m.tipo
    or i.unidad_medida is distinct from m.unidad_medida
    or i.tejido_id is distinct from m.tejido_id
    or i.merma_pct is distinct from m.merma_pct
    or i.codigo is distinct from m.codigo || coalesce('-' || i.color_codigo, '')
    or not (i.nombre = m.nombre
         or i.nombre = m.nombre || coalesce(' ' || retail.fn_medida_texto(m.medida_valor, m.medida_unidad), '')
         or starts_with(i.nombre, m.nombre || coalesce(' ' || retail.fn_medida_texto(m.medida_valor, m.medida_unidad), '') || ' · '))$inv$),
  ('INV-25', 'color_retirado_sin_tela_guardada', 1, 'cruzada', array['insumo_id', 'ubicacion_id', 'motivo']::text[], false, true,
   $txt$Un color de tela retirado (`archivado_at`, «Retirar color», ADR-0554) no guarda tela: ni saldo distinto de cero en ninguna sede, ni un lote que haya entrado DESPUÉS de retirarlo. Si lo tuviera, serían metros que el libro de movimientos sigue contando (y suman al capital en insumos) pero que ninguna lista muestra: stock fantasma. `retirar_color_de_material` se niega con saldo y un disparador en `insumo_lotes` rechaza el ingreso a un retirado; esto vigila lo que se cuele por un camino que los salte (un arreglo a mano, una migración, una función nueva que escriba el libro sin pasar por el lote).$txt$,
   $inv$select i.id as insumo_id, i.codigo, i.archivado_at, s.ubicacion_id, s.fisico as cantidad, 'saldo' as motivo
  from retail.insumos i
  join retail.v_insumo_saldos s on s.insumo_id = i.id
 where i.material_id is not null and i.archivado_at is not null and s.fisico <> 0
union all
select i.id, i.codigo, i.archivado_at, l.ubicacion_id, l.cantidad_ingresada, 'lote_posterior'
  from retail.insumos i
  join retail.insumo_lotes l on l.insumo_id = i.id
 where i.material_id is not null and i.archivado_at is not null and l.created_at > i.archivado_at$inv$),
  ('INV-26', 'lote_de_insumo_cuadra_con_su_libro', 1, 'cruzada', array['lote_id']::text[], false, true,
   $txt$La cantidad de cada lote de insumo es lo que su `compra` y sus `ajuste` suman en el libro de movimientos (ADR-0570: corregir o eliminar un ingreso cambia el lote Y deja el par «deshago + anoto» en el libro). Si no coinciden, el saldo del color que muestra la orden (la suma del libro) y el que descuenta el PEPS (la cantidad del lote) dicen cosas distintas: tela que se ve y no se puede cortar, o tela que se corta y no se ve.$txt$,
   $inv$select l.id as lote_id, l.insumo_id, l.ubicacion_id, l.cantidad_ingresada as cantidad_del_lote, coalesce(m.suma, 0) as suma_del_libro
  from retail.insumo_lotes l
  left join lateral (
    select sum(x.cantidad) as suma from retail.movimientos_insumo x where x.insumo_lote_id = l.id and x.tipo in ('compra', 'ajuste')
  ) m on true
 where l.cantidad_ingresada <> coalesce(m.suma, 0)$inv$),
  ('INV-27', 'compra_anulada_sin_pagos', 1, 'cruzada', array['compra_id']::text[], false, true,
   $txt$Una factura de proveedor anulada no tiene pagos: `anular_compra` lo prohíbe, porque la plata saldría del banco sin una deuda que la respalde (tarea 36 de «Las 36»).$txt$,
   $inv$select c.id as compra_id, c.serie || '-' || c.numero as factura, sum(p.monto) as pagado
  from retail.compras c
  join retail.compra_pagos p on p.compra_id = c.id
 where c.estado = 'anulada'
 group by c.id, c.serie, c.numero$inv$),
  ('INV-28', 'compra_pagado_igual_a_sus_pagos', 1, 'cruzada', array['compra_id']::text[], false, true,
   $txt$Lo que una factura vigente dice que tiene pagado es la suma de sus pagos. Si no, Por pagar y el banco cuentan dos historias de la misma deuda (tarea 36 de «Las 36»).$txt$,
   $inv$select c.id as compra_id, c.serie || '-' || c.numero as factura, c.pagado, coalesce(sum(p.monto), 0) as suma_pagos
  from retail.compras c
  left join retail.compra_pagos p on p.compra_id = c.id
 where c.estado = 'vigente'
 group by c.id, c.serie, c.numero, c.pagado
having c.pagado <> coalesce(sum(p.monto), 0)$inv$)
on conflict (id) do update set
  nombre = excluded.nombre, gravedad = excluded.gravedad, nivel = excluded.nivel, dice = excluded.dice,
  requiere_sesion = excluded.requiere_sesion, sql = excluded.sql, clave = excluded.clave,
  linea_base_en = case when retail.invariantes.sql is distinct from excluded.sql
                         or retail.invariantes.clave is distinct from excluded.clave
                       then null else retail.invariantes.linea_base_en end;
-- <<< fin de la siembra generada
