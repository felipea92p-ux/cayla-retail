-- ============================================================================
-- Gasto fijo: «pagar N días antes de que venza» (ADR-0487, Felipe 2026-10-23)
--
-- EL PROBLEMA PRIMERO. Un gasto fijo decía «llega la quincena» (ADR-0440) y el sistema esperaba el pago ese día. Pero el recibo de la luz o
-- del celular no se paga el día que «llega»: trae impreso un VENCE, y conviene pagarlo unos días antes (un canal de pago que falla, una
-- transferencia que tarda en reflejarse, la mora). Medido en producción el 2026-10-23: de los 16 fijos de servicios, 14 decían «la quincena»
-- porque nadie sabe cuándo llega un recibo; lo que sí está escrito es su vencimiento. Felipe: «más que todo la fecha de vencimiento y pagar
-- unos días antes».
--
-- LA DECISIÓN (dos pasos, un solo ADR).
--   · Paso 1, sin migración: la fecha que ya existe (`momento` + `dia_del_mes` → `fecha_esperada`) pasa a LEERSE como el vencimiento. Mismas columnas,
--     mismas funciones; cambian los textos de la web.
--   · Paso 2, ESTA migración: `gastos_fijos.dias_antes` (0 a 30, de fábrica 0). La fecha en que se paga es el vencimiento menos esos días:
--       fecha_pago  = fecha_esperada - dias_antes
--       toca_pagar  = el fijo todavía no se registró, no venció (estado «por_llegar») y ya llegó su fecha de pago.
--     Con `dias_antes = 0` todo queda como estaba, así que lo ya cargado no cambia. El estado de un fijo sigue siendo «registrado», «por_llegar»
--     o «falta» (venció y no está registrado): `toca_pagar` es una pista aparte, para no tocar a quien lee el estado (Resumen, Cierre, Confianza).
--
-- CONTRATO (Liskov)
--   PROMETE: `guardar_gasto_fijo` gana un 12.º argumento opcional, `p_dias_antes` (nulo = no toca: crea con 0 y al editar deja el que tiene);
--            llamarla con 9, 10 u 11 argumentos se comporta igual. `fn_gastos_fijos_mes` devuelve las mismas columnas de antes y, al final,
--            `dias_antes`, `fecha_pago` y `toca_pagar`. El Flujo de caja proyecta la salida en `fecha_pago` (hoy: en `fecha_esperada`).
--   ASUME:   `guardar_gasto_fijo` de 11 argumentos de 20261018003000, `fn_gastos_fijos_mes` de 20261017190000 y `fn_flujo_caja_proyeccion` con el
--            bloque de fijos de 20260925160000 (cada texto ancla aparece una vez o la migración aborta). Mismo texto que producción el 2026-10-23.
--   NO HACE: no toca `momento`, `dia_del_mes` ni `fn_fecha_esperada_fijo`; no cambia lo que lee el Resumen («falta»); no mueve datos.
--
-- ESTADOS IMPOSIBLES (Lamport): `dias_antes` negativo o de más de 30 días (una persona que escribe «45» casi seguro quiso decir otra cosa). Lo impide
--   el esquema (`gastos_fijos_dias_antes_valido`), no solo la pantalla.
-- TODO-O-NADA (Gray): el fijo y su «pagar antes» se guardan en la MISMA llamada (`guardar_gasto_fijo`): no hay un fijo a medias.
-- SI NO RESPONDE ALGO EXTERNO (Vogels): nada externo; es SQL de la base.
--
-- CÓMO SE PEGA. Una sola parte, sin políticas (ADR-0195): un `alter table` con candado breve de `gastos_fijos` (solo la leen las pantallas de
-- Finanzas; 25 filas el 2026-10-23), tres reemplazos y un `select` final. Idempotente: si ya está, no hace nada. La web se publica antes sin problema:
-- manda `p_dias_antes` solo si la persona lo cambió y solo muestra el campo si la base ya devuelve `dias_antes`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. Guardas: las funciones vivas son las que esta migración conoce (o ya traen el cambio). --------------------------------------

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('retail.fn_gastos_fijos_mes(date, uuid, boolean)'::regprocedure);
  if position('dias_antes' in v_def) = 0 and (position('fn_fecha_esperada_fijo' in v_def) = 0 or position('momento' in v_def) = 0) then
    raise exception 'fn_gastos_fijos_mes cambió en la base: revisar antes de pegar (ADR-0487 espera la de 20261017190000).';
  end if;
  if to_regprocedure('retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb)') is null
     and to_regprocedure('retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb, integer)') is null then
    raise exception 'Pega antes 20261018003000_gasto_fijo_ficha_de_pago.sql (guardar_gasto_fijo con la ficha de pago).';
  end if;
end;
$$;

-- 1. La columna y su candado. --------------------------------------------------------------------------------------------------

alter table retail.gastos_fijos add column if not exists dias_antes smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gastos_fijos_dias_antes_valido' and conrelid = 'retail.gastos_fijos'::regclass) then
    alter table retail.gastos_fijos add constraint gastos_fijos_dias_antes_valido check (dias_antes between 0 and 30);
  end if;
end;
$$;

comment on column retail.gastos_fijos.dias_antes is
  'Cuántos días antes de que venza se paga (0 a 30; 0 = el mismo día). La fecha de pago es fecha_esperada - dias_antes (ADR-0487); el Flujo de caja proyecta la salida ahí.';

-- 2. Guardar un fijo, con su «pagar antes». ----------------------------------------------------------------------------------------
-- Igual que la de 20261018003000, más el 12.º argumento (y los mensajes dicen «vence», no «llega»). La de 11 argumentos se retira: con el
-- último opcional, una llamada de 9, 10 u 11 resuelve a esta.

drop function if exists retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb);

create or replace function retail.guardar_gasto_fijo(
  p_id uuid,
  p_ubicacion_id uuid,
  p_categoria text,
  p_descripcion text,
  p_proveedor_id uuid,
  p_comprobante_tipo text,
  p_monto numeric,
  p_monto_variable boolean,
  p_dia_del_mes integer,
  p_momento text default 'dia',
  p_ficha jsonb default null,
  p_dias_antes integer default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare v_actual retail.gastos_fijos%rowtype; v_actor uuid; v_id uuid := p_id;
        v_momento text := coalesce(p_momento, 'dia'); v_dia integer;
begin
  if not retail.fn_gastos_puede(p_ubicacion_id) then
    raise exception 'No puedes guardar gastos fijos de esa tienda.' using errcode = '42501';
  end if;
  if not exists (select 1 from retail.categorias_gasto where codigo = p_categoria and activo) then
    raise exception 'Elige una categoría de la lista.' using errcode = 'P0001';
  end if;
  if p_descripcion is null or trim(p_descripcion) = '' then
    raise exception 'Escribe qué se paga.' using errcode = 'P0001';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if v_momento not in ('dia', 'primera_semana', 'quincena', 'fin_de_mes') then
    raise exception 'Elige cuándo vence: un día fijo, la primera semana, la quincena o fin de mes.' using errcode = 'P0001';
  end if;
  if v_momento = 'dia' then
    if p_dia_del_mes is null or p_dia_del_mes not between 1 and 28 then
      raise exception 'El día va del 1 al 28. Si vence el 29, 30 o 31, elige «Fin de mes».' using errcode = 'P0001';
    end if;
    v_dia := p_dia_del_mes;
  else
    v_dia := case v_momento when 'primera_semana' then 7 when 'quincena' then 15 else 28 end;
  end if;
  if p_dias_antes is not null and p_dias_antes not between 0 and 30 then
    raise exception 'Pagar antes va de 0 a 30 días. Con 0 se paga el mismo día que vence.' using errcode = 'P0001';
  end if;
  if p_proveedor_id is not null and not exists (select 1 from retail.proveedores where id = p_proveedor_id) then
    raise exception 'Ese proveedor no existe.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if p_id is null then
    insert into retail.gastos_fijos (ubicacion_id, categoria, descripcion, proveedor_id, comprobante_tipo, monto, monto_variable,
                                     dia_del_mes, momento, dias_antes, creado_por, actualizado_por)
    values (p_ubicacion_id, p_categoria, trim(p_descripcion), p_proveedor_id, coalesce(p_comprobante_tipo, 'factura'),
            round(p_monto, 2), coalesce(p_monto_variable, false), v_dia, v_momento, coalesce(p_dias_antes, 0), v_actor, v_actor)
    returning id into v_id;
  else
    select * into v_actual from retail.gastos_fijos where id = p_id for update;
    if not found or not v_actual.activo then
      raise exception 'Ese gasto fijo no existe o está archivado.' using errcode = 'P0001';
    end if;
    if not retail.fn_gastos_puede(v_actual.ubicacion_id) then
      raise exception 'Ese gasto fijo es de otra tienda.' using errcode = '42501';
    end if;
    update retail.gastos_fijos
       set ubicacion_id = p_ubicacion_id, categoria = p_categoria, descripcion = trim(p_descripcion), proveedor_id = p_proveedor_id,
           comprobante_tipo = coalesce(p_comprobante_tipo, 'factura'), monto = round(p_monto, 2),
           monto_variable = coalesce(p_monto_variable, false), dia_del_mes = v_dia, momento = v_momento,
           dias_antes = coalesce(p_dias_antes, v_actual.dias_antes),
           actualizado_por = v_actor, actualizado_en = now()
     where id = p_id;
  end if;
  if p_ficha is not null then
    perform retail.fn_gasto_fijo_ficha_aplicar(v_id, p_ficha, v_actor);
  end if;
  return v_id;
end $$;
revoke all on function retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb, integer) from public, anon;
grant execute on function retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb, integer) to authenticated;

-- 3. Los fijos del mes, con su fecha de pago. ------------------------------------------------------------------------------------
-- Cambia la forma de lo que devuelve (tres columnas más al final), así que se rehace entera. `fecha_esperada` sigue siendo el vencimiento.

drop function if exists retail.fn_gastos_fijos_mes(date, uuid, boolean);

create function retail.fn_gastos_fijos_mes(p_mes date, p_ubicacion_id uuid default null, p_solo_empresa boolean default false)
returns table (
  id uuid, ubicacion_id uuid, ubicacion_nombre text, categoria text, categoria_nombre text, descripcion text,
  proveedor_id uuid, proveedor_nombre text, comprobante_tipo text, monto numeric, monto_variable boolean,
  dia_del_mes smallint, momento text, fecha_esperada date, estado text, gasto_id uuid, gasto_monto numeric,
  dias_antes smallint, fecha_pago date, toca_pagar boolean
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare v_ubics uuid[] := retail.fn_gastos_ubicaciones(); v_lider boolean := retail.fn_ve_finanzas_de_todo();
        v_ini date := date_trunc('month', p_mes)::date; v_hoy date := retail.fn_hoy_lima();
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los gastos fijos necesita el módulo Gastos en tu rol.' using errcode = '42501';
  end if;
  return query
  select f.id, f.ubicacion_id, coalesce(u.nombre, 'De la empresa'), f.categoria, k.nombre, f.descripcion, f.proveedor_id, p.nombre,
         f.comprobante_tipo, f.monto, f.monto_variable, f.dia_del_mes, f.momento,
         x.vence,
         case when g.id is not null then 'registrado'
              when x.vence < v_hoy then 'falta'
              else 'por_llegar' end,
         g.id, g.monto_total,
         f.dias_antes, x.vence - f.dias_antes,
         (g.id is null and x.vence >= v_hoy and x.vence - f.dias_antes <= v_hoy)
    from retail.gastos_fijos f
    cross join lateral (select retail.fn_fecha_esperada_fijo(v_ini, f.momento, f.dia_del_mes) as vence) x
    join retail.categorias_gasto k on k.codigo = f.categoria
    left join retail.ubicaciones u on u.id = f.ubicacion_id
    left join retail.proveedores p on p.id = f.proveedor_id
    left join lateral (
      select y.id, y.monto_total from retail.gastos y
       where y.gasto_fijo_id = f.id and y.estado = 'vigente'
         and y.fecha >= v_ini and y.fecha < (v_ini + interval '1 month')::date
       limit 1
    ) g on true
   where f.activo
     and ((f.ubicacion_id is null and v_lider) or f.ubicacion_id = any (v_ubics))
     and (p_ubicacion_id is null or f.ubicacion_id = p_ubicacion_id)
     and (not p_solo_empresa or f.ubicacion_id is null)
   order by (g.id is not null), x.vence, f.descripcion;
end $$;
revoke all on function retail.fn_gastos_fijos_mes(date, uuid, boolean) from public, anon;
grant execute on function retail.fn_gastos_fijos_mes(date, uuid, boolean) to authenticated;

-- 4. El Flujo de caja proyecta la salida en la fecha de pago. ------------------------------------------------------------------------
-- Reemplazo anclado sobre la función VIVA (no se reescribe: la han parchado varias migraciones). Un solo ancla que une tres cosas del bloque de
-- fijos: hasta qué mes se piden (un fijo que vence a inicios del mes que viene puede pagarse este mes), la fecha del renglón y el filtro.
-- El segundo dato de la fila (`vence`) sigue siendo `fecha_esperada`. Idempotente: si el texto nuevo ya está, no toca nada.

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$greatest(f.fecha_esperada, v_ini), f.fecha_esperada,$v$,
  $n$greatest(f.fecha_pago, v_ini), f.fecha_esperada,$n$);

select pg_temp.anclar('retail.fn_flujo_caja_proyeccion(integer)',
  $v$date_trunc('month', v_fin), interval '1 month') m
     cross join lateral retail.fn_gastos_fijos_mes(m::date) f
     where f.estado in ('por_llegar', 'falta') and greatest(f.fecha_esperada, v_ini) <= v_fin$v$,
  $n$date_trunc('month', v_fin + 30), interval '1 month') m
     cross join lateral retail.fn_gastos_fijos_mes(m::date) f
     where f.estado in ('por_llegar', 'falta') and greatest(f.fecha_pago, v_ini) <= v_fin$n$);

reset lock_timeout;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», es seguro volver a pegarlo completo.
select '20261023173000 · pagar N días antes' as parte,
       case when exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'gastos_fijos' and column_name = 'dias_antes')
             and exists (select 1 from pg_constraint where conname = 'gastos_fijos_dias_antes_valido' and conrelid = 'retail.gastos_fijos'::regclass)
             and to_regprocedure('retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb, integer)') is not null
             and to_regprocedure('retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text, jsonb)') is null
             and position('fecha_pago' in pg_get_functiondef('retail.fn_gastos_fijos_mes(date, uuid, boolean)'::regprocedure)) > 0
             and position('greatest(f.fecha_pago, v_ini), f.fecha_esperada,' in pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure)) > 0
             and position('v_fin + 30' in pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure)) > 0
            then 'QUEDÓ BIEN' else 'REVISAR: falta algún paso' end as resultado;
