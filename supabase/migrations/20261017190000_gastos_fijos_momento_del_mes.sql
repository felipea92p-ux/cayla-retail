-- ============================================================================
-- Gasto fijo que llega «la primera semana», «en la quincena» o «a fin de mes» (ADR-0440, Felipe 2026-10-17)
--
-- EL PROBLEMA PRIMERO. Un gasto fijo solo sabía decir «llega el día N», con N entre 1 y 28 (`gastos_fijos_dia_del_mes_check`:
-- «para que exista en todos los meses»). Pero el alquiler, la planilla de un contador o el servicio de internet no se pagan «el
-- 28»: se pagan «a fin de mes», y fin de mes es el 28, el 29, el 30 o el 31 según el mes y el año. Obligar a escribir 28 hace que
-- el sistema marque «falta» el día 29 de un mes que todavía no vence, y que el Flujo de caja proyecte el pago dos o tres días
-- antes de tiempo. Con la quincena y la primera semana pasa igual: son una época del mes, no un número.
--
-- LA DECISIÓN. `gastos_fijos.momento`, con cuatro valores, y la fecha en que se espera sale SOLO de ahí:
--   · 'dia'            → el día N (1 a 28), como siempre. Nada cambia para lo ya cargado: nace 'dia' por defecto.
--   · 'primera_semana' → llega entre el 1 y el 7; se espera el 7 (recién «falta» si pasó el 7).
--   · 'quincena'       → se espera el 15.
--   · 'fin_de_mes'     → se espera el ÚLTIMO día de ese mes (28, 29, 30 o 31). Recién «falta» al día siguiente.
-- `dia_del_mes` se queda, `not null` y de 1 a 28, como ORDEN y respaldo de lo que ya lee todo el resto (Resumen, Cierre,
-- Presupuesto, Flujo): para los tres momentos vale 7, 15 y 28, y un candado (`gastos_fijos_momento_coherente`) lo exige, así que
-- la base no puede quedar con «fin de mes, día 3». La fecha esperada vive en UNA función (`fn_fecha_esperada_fijo`) y la usa
-- `fn_gastos_fijos_mes`, de donde la leen el Flujo de caja, el Resumen y el Cierre: nadie más calcula «el día» por su cuenta.
--
-- CONTRATO (Liskov)
--   PROMETE: llamar `guardar_gasto_fijo` con sus nueve argumentos de siempre se comporta igual (el décimo, `p_momento`, es opcional y
--            vale 'dia'); un fijo 'dia' sigue esperándose el día N; `fn_gastos_fijos_mes` devuelve las mismas columnas de antes
--            más `momento`, a continuación de `dia_del_mes`. Ninguna fila existente cambia.
--   ASUME:   `fn_gastos_fijos_mes` y `guardar_gasto_fijo` en producción son las de 20260925000000 con el único parche de
--            20260928220000 (`fn_ve_finanzas_de_todo`); si no lo son, la migración lo dice y no pisa nada.
--   NO HACE: no toca `fn_gastos_fijos_sugeridos` (propone siempre un día), ni datos, ni políticas, ni `rol_modulos`.
--
-- CÓMO SE PEGA. Una sola parte, sin políticas (ADR-0195): un `alter table` con candado breve de `gastos_fijos` (solo la leen las
-- pantallas de Finanzas; en producción tiene 0 filas, 2026-10-17) y tres funciones. Idempotente. La web se publica antes sin
-- problema: manda `p_momento` solo cuando no es 'dia', y lee `momento` si la base lo trae.
-- ============================================================================
set lock_timeout = '3s';

-- 1. La columna y sus candados. ---------------------------------------------------------------------------------------------

alter table retail.gastos_fijos add column if not exists momento text not null default 'dia';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gastos_fijos_momento_valido' and conrelid = 'retail.gastos_fijos'::regclass) then
    alter table retail.gastos_fijos add constraint gastos_fijos_momento_valido
      check (momento in ('dia', 'primera_semana', 'quincena', 'fin_de_mes'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gastos_fijos_momento_coherente' and conrelid = 'retail.gastos_fijos'::regclass) then
    alter table retail.gastos_fijos add constraint gastos_fijos_momento_coherente
      check (momento = 'dia' or dia_del_mes = case momento when 'primera_semana' then 7 when 'quincena' then 15 else 28 end);
  end if;
end;
$$;

comment on column retail.gastos_fijos.momento is
  'Cuándo llega cada mes: un día fijo (dia), la primera semana, la quincena o fin de mes (ADR-0440). La fecha esperada sale de aquí (fn_fecha_esperada_fijo); dia_del_mes queda como orden (7, 15 y 28 para los tres últimos).';

-- 2. La fecha en que se espera, en un solo lugar. -----------------------------------------------------------------------------

create or replace function retail.fn_fecha_esperada_fijo(p_mes_ini date, p_momento text, p_dia integer)
returns date
language sql
immutable
set search_path to 'retail', 'public', 'extensions'
as $$
  select case p_momento
           when 'primera_semana' then p_mes_ini + 6
           when 'quincena'       then p_mes_ini + 14
           when 'fin_de_mes'     then (p_mes_ini + interval '1 month')::date - 1
           else p_mes_ini + (p_dia - 1)
         end;
$$;
comment on function retail.fn_fecha_esperada_fijo(date, text, integer) is
  'ADR-0440: la fecha en que se espera un gasto fijo en el mes que empieza en p_mes_ini. Día N, el 7 (primera semana), el 15 (quincena) o el último día del mes (fin de mes: 28, 29, 30 o 31).';
revoke all on function retail.fn_fecha_esperada_fijo(date, text, integer) from public, anon;
grant execute on function retail.fn_fecha_esperada_fijo(date, text, integer) to authenticated;

-- 3. Guardar un fijo con su momento. -----------------------------------------------------------------------------------------
-- El décimo argumento es opcional: una llamada vieja de nueve sigue funcionando. La firma de nueve se retira para que una
-- llamada por nombre no quede ambigua entre las dos.

drop function if exists retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer);

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
  p_momento text default 'dia'
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
    raise exception 'Elige cuándo llega: un día fijo, la primera semana, la quincena o fin de mes.' using errcode = 'P0001';
  end if;
  if v_momento = 'dia' then
    if p_dia_del_mes is null or p_dia_del_mes not between 1 and 28 then
      raise exception 'El día va del 1 al 28. Si llega el 29, 30 o 31, elige «Fin de mes».' using errcode = 'P0001';
    end if;
    v_dia := p_dia_del_mes;
  else
    v_dia := case v_momento when 'primera_semana' then 7 when 'quincena' then 15 else 28 end;
  end if;
  if p_proveedor_id is not null and not exists (select 1 from retail.proveedores where id = p_proveedor_id) then
    raise exception 'Ese proveedor no existe.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if p_id is null then
    insert into retail.gastos_fijos (ubicacion_id, categoria, descripcion, proveedor_id, comprobante_tipo, monto, monto_variable,
                                     dia_del_mes, momento, creado_por, actualizado_por)
    values (p_ubicacion_id, p_categoria, trim(p_descripcion), p_proveedor_id, coalesce(p_comprobante_tipo, 'factura'),
            round(p_monto, 2), coalesce(p_monto_variable, false), v_dia, v_momento, v_actor, v_actor)
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
           actualizado_por = v_actor, actualizado_en = now()
     where id = p_id;
  end if;
  return v_id;
end $$;
revoke all on function retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text) from public, anon;
grant execute on function retail.guardar_gasto_fijo(uuid, uuid, text, text, uuid, text, numeric, boolean, integer, text) to authenticated;

-- 4. Los fijos del mes, con su momento y su fecha esperada de verdad. ---------------------------------------------------------
-- Cambia la forma de lo que devuelve (una columna más), así que se rehace entera. Antes: comprueba que la de la base es la que
-- esta migración conoce, para no pisar un parche que nadie vio.

do $$
declare v_def text;
begin
  if to_regprocedure('retail.fn_gastos_fijos_mes(date, uuid, boolean)') is null then
    raise exception 'fn_gastos_fijos_mes no existe en esta base: aplica antes 20260925000000.';
  end if;
  v_def := pg_get_functiondef('retail.fn_gastos_fijos_mes(date, uuid, boolean)'::regprocedure);
  if position('momento' in v_def) = 0 then
    if position('retail.fn_ve_finanzas_de_todo()' in v_def) = 0
       or position('(v_ini + (f.dia_del_mes - 1))::date' in v_def) = 0
       or position('order by (g.id is not null), f.dia_del_mes, f.descripcion' in v_def) = 0 then
      raise exception 'fn_gastos_fijos_mes cambió en la base: revisar antes de pegar (ADR-0440 espera la de 20260925000000 + 20260928220000).';
    end if;
  end if;
end;
$$;

drop function if exists retail.fn_gastos_fijos_mes(date, uuid, boolean);

create function retail.fn_gastos_fijos_mes(p_mes date, p_ubicacion_id uuid default null, p_solo_empresa boolean default false)
returns table (
  id uuid, ubicacion_id uuid, ubicacion_nombre text, categoria text, categoria_nombre text, descripcion text,
  proveedor_id uuid, proveedor_nombre text, comprobante_tipo text, monto numeric, monto_variable boolean,
  dia_del_mes smallint, momento text, fecha_esperada date, estado text, gasto_id uuid, gasto_monto numeric
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
         retail.fn_fecha_esperada_fijo(v_ini, f.momento, f.dia_del_mes),
         case when g.id is not null then 'registrado'
              when retail.fn_fecha_esperada_fijo(v_ini, f.momento, f.dia_del_mes) < v_hoy then 'falta'
              else 'por_llegar' end,
         g.id, g.monto_total
    from retail.gastos_fijos f
    join retail.categorias_gasto k on k.codigo = f.categoria
    left join retail.ubicaciones u on u.id = f.ubicacion_id
    left join retail.proveedores p on p.id = f.proveedor_id
    left join lateral (
      select x.id, x.monto_total from retail.gastos x
       where x.gasto_fijo_id = f.id and x.estado = 'vigente'
         and x.fecha >= v_ini and x.fecha < (v_ini + interval '1 month')::date
       limit 1
    ) g on true
   where f.activo
     and ((f.ubicacion_id is null and v_lider) or f.ubicacion_id = any (v_ubics))
     and (p_ubicacion_id is null or f.ubicacion_id = p_ubicacion_id)
     and (not p_solo_empresa or f.ubicacion_id is null)
   order by (g.id is not null), retail.fn_fecha_esperada_fijo(v_ini, f.momento, f.dia_del_mes), f.descripcion;
end $$;
revoke all on function retail.fn_gastos_fijos_mes(date, uuid, boolean) from public, anon;
grant execute on function retail.fn_gastos_fijos_mes(date, uuid, boolean) to authenticated;

reset lock_timeout;
