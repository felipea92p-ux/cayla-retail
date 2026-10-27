-- ============================================================================
-- 20261024215000 — Plan de campaña: el descuento que se supuso en cada categoría (ADR-0499, Felipe 2026-10-24, «mejora 1»)
--
-- EL PROBLEMA PRIMERO. El Plan calcula cuánto comprar con el precio de LISTA: lo que se pierde por cada prenda que faltó es «precio − costo».
--   Pero en la campaña se vende con descuento (Navidad −20 %, Cyber −30 %…). Con el descuento queda menos por prenda, así que quedarse corto
--   duele menos y conviene comprar un poco menos; y si el descuento se come todo el margen, la campaña pierde plata en esa categoría y nadie
--   lo ve. Además el plan no dejaba escrito QUÉ descuento se supuso (el problema de origen de ADR-0349: «nadie puede revisar después qué
--   se supuso»).
--
-- LO QUE HACE.
--   1. `planes_compra_lineas.descuento_pct` (numeric(5,2), 0 por defecto, de 0 a menos de 100): el descuento que quien armó el plan supuso
--      para esa categoría. 0 = precio de lista (todo plan de antes queda igual).
--   2. `guardar_plan_compra_linea` gana `p_descuento_pct numeric default null`: null = no lo toca (la web de antes sigue guardando igual y NO
--      borra un descuento ya guardado). Entra en la comparación de versión de B4: dos personas que guardan descuentos distintos no se pisan.
--      Cambia la firma: se borra la vieja y se crea la nueva en la misma transacción (dos sobrecargas confundirían a PostgREST).
--   3. `fn_plan_compra_descuento(plan)`: SOLO LEE. Devuelve lo guardado por categoría y lo que SUGIERE la campaña del plan: el mayor % que
--      alcanza a esa categoría entre el descuento de siempre de la etiqueta (por sus categorías) y sus ofertas activas que tocan las fechas
--      del plan (ADR-0496), con de dónde sale, sus fechas, sus días de la semana y las tiendas si rige solo en algunas (ADR-0486).
--      Marca `con_descuento: true`: la web nueva solo manda el descuento si ve esa marca.
--
-- LO QUE NO HACE.
--   · No toca `fn_plan_compra` (ya lleva 10 filtros de familias y parches anclados): la lectura nueva es una función aparte, como
--     `fn_plan_compra_propuesta` y `fn_plan_compra_pedido`.
--   · No cambia las unidades de los escenarios: el ×N histórico ya trae el efecto de campañas pasadas; el descuento solo mueve el margen.
--   · No toca los precios del catálogo ni lo que cobra la caja. El descuento del Plan es un supuesto, no una regla de venta.
--   · El sugerido NO pondera por días ni por tiendas (v1): es el mayor %. Si la oferta rige solo martes y jueves o solo en una tienda, la
--     función lo dice (`dias_semana`, `solo_en`) y quien arma el plan lo corrige. Las prendas marcadas a mano (sin categoría) no cuentan.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema, no la pantalla): un descuento negativo o de 100 % o más (CHECK); un descuento
--   guardado sin pasar por la función (RLS sin políticas: nadie escribe la tabla directo).
-- A PROPÓSITO NO ES UN ESTADO IMPOSIBLE: un descuento que deja el precio por debajo del costo. Una liquidación puede perder margen a
--   sabiendas; la pantalla lo avisa con todas sus letras, la base no lo prohíbe.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: un `alter table` de una tabla chica (0 líneas en producción el
--   2026-10-24), dos funciones y SIN políticas ni `drop trigger` (ADR-0195). `lock_timeout` 3 s. Idempotente: pegarla dos veces deja lo
--   mismo. Si la función que reemplaza no es la que se leyó al escribir esto (md5 del cuerpo), no aplica nada y lo dice.
-- ORDEN: da igual. La web vieja con la base nueva guarda como siempre; la web nueva con la base vieja no ve `con_descuento` y no lo manda.
-- CAÍDA EXTERNA. Nada llama a la red. Si la lectura falla, la web calcula con 0 % y lo dice: nunca inventa un descuento.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: lo que se reemplaza es la función de B4 ----------------------------------------------------------------------------

do $$
declare
  v_cuerpo text;
begin
  v_cuerpo := (select prosrc from pg_proc
                where oid = to_regprocedure('retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer)'));
  if v_cuerpo is null then
    -- Ya pasó (se pegó dos veces) o va antes de B4: la de 12 parámetros decide.
    if to_regprocedure('retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer,numeric)') is null then
      raise exception 'retail.guardar_plan_compra_linea no existe con la firma de B4 (20261010200000): esta migración va después. No se aplicó nada.';
    end if;
  elsif md5(v_cuerpo) <> '3d16664d66ab6c8a75d6ebd04b56052c' then
    raise exception 'retail.guardar_plan_compra_linea cambió desde que se escribió esta migración (md5 %): regenera esta migración desde su definición real. No se aplicó nada.', md5(v_cuerpo);
  end if;
end;
$$;

-- 1. La columna --------------------------------------------------------------------------------------------------------------------

alter table retail.planes_compra_lineas
  add column if not exists descuento_pct numeric(5, 2) not null default 0
  constraint planes_compra_lineas_descuento_rango check (descuento_pct >= 0 and descuento_pct < 100);

comment on column retail.planes_compra_lineas.descuento_pct is
  'ADR-0499. El descuento que se supuso para esta categoría en la campaña, en % (0 a menos de 100). 0 = precio de lista. Baja lo que se gana por prenda en la campaña (precio × (1 − d) − costo) y por eso baja el cuantil crítico; lo que sobra se recupera sobre el precio de LISTA. Es un supuesto del plan, no una regla de venta: no cambia ningún precio.';

-- 2. Guardar una categoría, con su descuento ---------------------------------------------------------------------------------------

drop function if exists retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer);

create or replace function retail.guardar_plan_compra_linea(
  p_plan_id uuid,
  p_categoria_id uuid,
  p_flojo integer,
  p_normal integer,
  p_bueno integer,
  p_precio numeric,
  p_costo numeric,
  p_recupero_pct integer,
  p_curva jsonb default '{}'::jsonb,
  p_nota text default null,
  p_version_esperada integer default null,
  p_descuento_pct numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_curva jsonb := coalesce(p_curva, '{}'::jsonb);
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  -- null = «no lo toques» (la web de antes): en una línea nueva queda en 0, en una que ya existe se conserva.
  v_desc numeric := round(p_descuento_pct, 2);
  v_suma integer;
  v_ajena boolean;
  v_persona uuid;
  v_id uuid;
  v_version integer;
  v_actual retail.planes_compra_lineas%rowtype;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Armar el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if not exists (select 1 from retail.categorias where id = p_categoria_id and activo) then
    raise exception 'Esa categoría no existe o está desactivada' using hint = 'plan_compra_categoria';
  end if;
  if p_flojo is null or p_normal is null or p_bueno is null or p_flojo < 0 or p_flojo > p_normal or p_normal > p_bueno then
    raise exception 'Los escenarios van de menor a mayor: flojo, normal y bueno (flojo puede ser 0).' using hint = 'plan_compra_escenarios';
  end if;
  if p_precio is null or p_precio <= 0 or p_costo is null or p_costo < 0 or p_costo >= p_precio then
    raise exception 'El costo tiene que ser menor que el precio de venta.' using hint = 'plan_compra_margen';
  end if;
  if p_recupero_pct is null or p_recupero_pct not between 0 and 100 then
    raise exception 'Lo que sobra se vende entre el 0 %% y el 100 %% del precio.' using hint = 'plan_compra_recupero';
  end if;
  if v_desc is not null and (v_desc < 0 or v_desc >= 100) then
    raise exception 'El descuento de la campaña va de 0 %% a menos de 100 %%.' using hint = 'plan_compra_descuento';
  end if;
  if jsonb_typeof(v_curva) <> 'object' then
    raise exception 'La curva de tallas no se entiende' using hint = 'plan_compra_curva';
  end if;
  if v_curva <> '{}'::jsonb then
    -- Cada talla tiene que ser de la categoría, con un porcentaje entero de 0 a 100, y todas juntas suman 100.
    v_ajena := exists (
      select 1 from jsonb_each(v_curva) e
       where not exists (select 1 from retail.categoria_tallas ct
                          where ct.categoria_id = p_categoria_id and ct.talla_id::text = e.key)
          or jsonb_typeof(e.value) <> 'number'
          or (e.value)::numeric <> trunc((e.value)::numeric)
          or (e.value)::numeric not between 0 and 100);
    if v_ajena then
      raise exception 'La curva tiene una talla que no es de esta categoría o un porcentaje que no es entero entre 0 y 100.'
        using hint = 'plan_compra_curva';
    end if;
    v_suma := (select sum((e.value)::numeric)::integer from jsonb_each(v_curva) e);
    if v_suma <> 100 then
      raise exception 'La curva de tallas suma % %%: tiene que sumar 100 %%.', v_suma using hint = 'plan_compra_curva_suma';
    end if;
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  -- B4: la versión que leyó la hoja. Sin ella (la web de antes), se guarda como siempre.
  if p_version_esperada is not null then
    for v_actual in
      select l.* from retail.planes_compra_lineas l
       where l.plan_id = p_plan_id and l.categoria_id = p_categoria_id
       for update
    loop
      exit;
    end loop;
    if v_actual.id is null then
      -- No hay línea: se crea, salvo que otra persona la cree en este mismo instante (el único la detiene y se compara abajo).
      insert into retail.planes_compra_lineas
        (plan_id, categoria_id, flojo, normal, bueno, precio, costo, recupero_pct, descuento_pct, curva, nota, actualizado_por, updated_at)
      values
        (p_plan_id, p_categoria_id, p_flojo, p_normal, p_bueno, round(p_precio, 2), round(p_costo, 2), p_recupero_pct, coalesce(v_desc, 0),
         v_curva, v_nota, v_persona, now())
      on conflict (plan_id, categoria_id) do nothing
      returning id, version into v_id, v_version;
      if v_id is not null then
        return jsonb_build_object('id', v_id, 'plan_id', p_plan_id, 'categoria_id', p_categoria_id, 'version', v_version);
      end if;
      for v_actual in
        select l.* from retail.planes_compra_lineas l
         where l.plan_id = p_plan_id and l.categoria_id = p_categoria_id
         for update
      loop
        exit;
      end loop;
    end if;
    -- Cambió desde que se abrió la hoja Y se manda otra cosa: no se pisa. Si se manda lo mismo (un reintento), no hay nada que defender.
    if v_actual.version <> p_version_esperada
       and (v_actual.flojo, v_actual.normal, v_actual.bueno, v_actual.precio, v_actual.costo, v_actual.recupero_pct, v_actual.descuento_pct, v_actual.curva, v_actual.nota)
           is distinct from (p_flojo, p_normal, p_bueno, round(p_precio, 2), round(p_costo, 2), p_recupero_pct, coalesce(v_desc, v_actual.descuento_pct), v_curva, v_nota) then
      raise exception '% guardó otro plan de % a las % mientras lo editabas: lo tuyo no se guardó. Vuelve a abrir la categoría para ver lo que guardó.',
          coalesce(retail.fn_actividad_nombre(v_actual.actualizado_por), 'Otra persona'),
          (select c.nombre from retail.categorias c where c.id = p_categoria_id),
          to_char(v_actual.updated_at at time zone 'America/Lima', 'HH24:MI')
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
  end if;

  insert into retail.planes_compra_lineas as l
    (plan_id, categoria_id, flojo, normal, bueno, precio, costo, recupero_pct, descuento_pct, curva, nota, actualizado_por, updated_at)
  values
    (p_plan_id, p_categoria_id, p_flojo, p_normal, p_bueno, round(p_precio, 2), round(p_costo, 2), p_recupero_pct, coalesce(v_desc, 0), v_curva,
     v_nota, v_persona, now())
  on conflict (plan_id, categoria_id) do update
     set flojo = excluded.flojo, normal = excluded.normal, bueno = excluded.bueno, precio = excluded.precio,
         costo = excluded.costo, recupero_pct = excluded.recupero_pct,
         -- Sin descuento en la llamada (la web de antes) se conserva el guardado; con él, manda el nuevo.
         descuento_pct = case when v_desc is null then l.descuento_pct else excluded.descuento_pct end,
         curva = excluded.curva, nota = excluded.nota,
         actualizado_por = excluded.actualizado_por, updated_at = excluded.updated_at
  returning l.id, l.version into v_id, v_version;

  return jsonb_build_object('id', v_id, 'plan_id', p_plan_id, 'categoria_id', p_categoria_id, 'version', v_version);
end;
$$;

revoke all on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric) from public, anon;
grant execute on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric) to authenticated;
comment on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric) is
  'ADR-0349 + ADR-0372 (B4) + ADR-0499: guarda los supuestos de UNA categoría del plan (los tres escenarios, precio, costo, lo que sobra, el descuento de la campaña, la curva y una nota). Pide el módulo plan_compra; firma el responsable del combo (fn_actor_persona_id(true)). p_version_esperada (ADR-0193): la versión que la hoja leyó (0 = no había plan); si otra persona guardó otra cosa entre medio, PT409 version_cambiada. p_descuento_pct: 0 a menos de 100; null = no lo toca. Devuelve {id, plan_id, categoria_id, version}.';

-- 3. Leer lo guardado y lo que sugiere la campaña ----------------------------------------------------------------------------------

create or replace function retail.fn_plan_compra_descuento(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_plan retail.planes_compra%rowtype;
  v_e retail.etiquetas%rowtype;
  v_lineas jsonb;
  v_sugeridos jsonb;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v_plan in select p.* from retail.planes_compra p where p.id = p_plan_id loop
    exit;
  end loop;
  if v_plan.id is null then
    return null;
  end if;

  -- Lo guardado: una fila por categoría con plan.
  v_lineas := coalesce((
    select jsonb_agg(jsonb_build_object('categoria_id', l.categoria_id, 'descuento_pct', l.descuento_pct))
      from retail.planes_compra_lineas l where l.plan_id = v_plan.id), '[]'::jsonb);

  -- La campaña del plan: aprobada y activa (un % solo vive en una etiqueta aprobada, ADR-0107). Sin etiqueta o sin aprobar, no hay sugerido.
  if v_plan.etiqueta_id is not null then
    for v_e in select e.* from retail.etiquetas e where e.id = v_plan.etiqueta_id and e.estado = 'aprobado' and e.activo loop
      exit;
    end loop;
  end if;

  if v_e.id is not null then
    v_sugeridos := coalesce((
      with cand as (
        -- 1. Lo de siempre: el % de la campaña, por las categorías que tiene.
        select ec.categoria_id, e.descuento_pct::numeric as pct, e.nombre as fuente, 'campana'::text as origen,
               e.vigente_desde as desde, e.vigente_hasta as hasta, null::smallint[] as dias, e.id as etiqueta_id, null::uuid as regla_id
          from retail.etiquetas e
          join retail.etiqueta_categorias ec on ec.etiqueta_id = e.id
         where e.id = v_e.id and e.descuento_pct is not null
        union all
        -- 2. Las ofertas activas que tocan las fechas del plan. «Solo estas categorías» manda; sin ellas, las de la campaña; menos las que deja fuera.
        select c.id, r.porcentaje, r.nombre, 'oferta', r.desde, r.hasta, r.dias_semana, r.etiqueta_id, r.id
          from retail.campana_reglas r
          join retail.categorias c on c.activo
         where r.etiqueta_id = v_e.id and r.estado = 'activa' and r.tipo = 'pct'
           and r.desde <= v_plan.hasta and r.hasta >= v_plan.desde
           and (
             exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo' and rc.categoria_id = c.id)
             or (
               not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo')
               and exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = r.etiqueta_id and ec.categoria_id = c.id)
             )
           )
           and not exists (select 1 from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera' and rc.categoria_id = c.id)
      ),
      mejor as (
        -- Una por categoría: la de mayor %; a igual %, la de siempre antes que una oferta (más simple de explicar).
        select distinct on (x.categoria_id) x.*
          from cand x
          join retail.categorias cat on cat.id = x.categoria_id and cat.activo
         order by x.categoria_id, x.pct desc, x.origen, x.desde nulls first
      )
      select jsonb_agg(jsonb_build_object(
               'categoria_id', m.categoria_id,
               'descuento_pct', m.pct,
               'origen', m.origen,
               'fuente', m.fuente,
               'desde', m.desde,
               'hasta', m.hasta,
               -- Los siete días = todos los días: no hace falta decirlo.
               'dias_semana', case when m.dias is null or m.dias @> array[1, 2, 3, 4, 5, 6, 7]::smallint[] then null else to_jsonb(m.dias) end,
               -- Si rige solo en algunas tiendas: la oferta con sus tiendas, o la campaña con las suyas.
               'solo_en', (
                 select jsonb_agg(u.nombre order by u.nombre)
                   from retail.ubicaciones u
                  where u.id in (
                    select rs.ubicacion_id from retail.campana_regla_sedes rs where m.regla_id is not null and rs.regla_id = m.regla_id
                    union
                    select cs.ubicacion_id from retail.campana_sedes cs
                     where cs.etiqueta_id = m.etiqueta_id
                       and (m.regla_id is null or not exists (select 1 from retail.campana_regla_sedes rs2 where rs2.regla_id = m.regla_id))
                  ))
             ) order by m.categoria_id)
        from mejor m), '[]'::jsonb);
  else
    v_sugeridos := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    -- La web nueva solo manda el descuento al guardar si ve esta marca.
    'con_descuento', true,
    'campana', case when v_e.id is null then null
                    else jsonb_build_object('id', v_e.id, 'nombre', v_e.nombre, 'descuento_pct', v_e.descuento_pct) end,
    'lineas', v_lineas,
    'sugeridos', v_sugeridos
  );
end;
$$;

revoke all on function retail.fn_plan_compra_descuento(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_descuento(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_descuento(uuid) is
  'ADR-0499. Del plan: el descuento guardado por categoría (lineas) y el que SUGIERE su campaña (sugeridos): el mayor % que alcanza a la categoría entre el descuento de siempre de la etiqueta y sus ofertas activas que tocan las fechas del plan, con su fuente, fechas, días de la semana y tiendas si rige solo en algunas. Solo lee. Pide el módulo plan_compra (42501 si no). con_descuento = la base guarda el descuento.';

reset lock_timeout;
notify pgrst, 'reload schema';
