-- ============================================================================
-- 20261026204000 — Plan de campaña: el PASO 2. De cada categoría, qué modelos repetir y de cada uno qué colores y tallas
--   (ADR-0526, Felipe 2026-10-26, spike ⑥ «Ranking de modelos» dentro de la hoja de la categoría de ③, tarea #9)
--
-- EL PROBLEMA PRIMERO. El paso 1 dice cuántas prendas de cada categoría comprar (las 414 de Polos), pero quien compra tiene que decir QUÉ: de cuáles modelos, en qué colores y en qué tallas. Hoy
--   eso vive en la cabeza de quien llama al proveedor o al Taller, y lo que más plata se pierde es la que se va a un color o una talla que no sale. El sistema ya sabe qué modelos vendieron y con qué
--   colores y tallas (las ventas del ERP) y cuánto queda de cada uno; le falta (a) leerlo ordenado y (b) un lugar donde guardar lo que la persona eligió.
--
-- LO QUE HACE.
--   1. `fn_plan_compra_modelos(plan, categoría)`: la LECTURA. Los modelos de la categoría que vendieron o tienen stock, con su marca, lo vendido en los últimos 90 días y lo que hay hoy, y de cada
--      uno sus colores y tallas; cuántas ventas de la categoría no tienen modelo (anotadas «sin registrar»); los colores de toda la categoría (la guía para los modelos nuevos); y lo último
--      que se guardó. Con las MISMAS reglas de `fn_plan_compra` (qué es una venta, qué es stock): una sola fuente de verdad.
--   2. `planes_compra_paso_2`: lo que la persona ELIGIÓ, como fotos que solo se agregan (la última es la vigente): el % de «repetir lo que ya vendió», el total del paso 1 con que se guardó y las
--      prendas por modelo × color × talla. Nada se edita ni se borra: volver a lo anterior es leer otra foto.
--   3. `guardar_plan_compra_paso_2(…)`: guarda una foto nueva. Rechaza lo imposible (un modelo de otra categoría, una talla que no es de la categoría, un reparto que se pasa del total del paso 1),
--      se pone en fila con quien guarda lo mismo a la vez y no pisa a nadie: si otra persona guardó mientras tú editabas, te lo dice.
--   4. `fn_plan_compra_pasos_2(plan)`: qué categorías ya tienen su paso 2 guardado (para marcarlas en la lista del Plan sin abrir cada una).
--
-- LO QUE NO HACE.
--   · No cambia el total del paso 1: el paso 2 reparte lo que el paso 1 decidió (un total que se «sube» desde aquí sería una segunda fuente de verdad de cuánto comprar). Si lo elegido se pasa
--     del total, la base lo rechaza y la pantalla dice cuánto.
--   · No inventa modelos: lo que no se reparte en modelos que ya vendieron queda como «modelos nuevos por elegir» (se calcula en la web: total − repartido); aquí no se guarda.
--   · No hace pedidos ni toca Compras: enviar lo elegido a quien lo surte es otro paso.
--
-- CONTRATO. PROMETE: la foto vigente de una categoría es la de mayor versión; las versiones de una categoría son 1, 2, 3… sin huecos ni repetidas aunque dos personas guarden a la vez; y toda foto
--   cumple `unidades ≤ total`. ASUME: el total del paso 1 lo calcula la web (la base no lo conoce: se lo manda y lo guarda junto a lo elegido); si el paso 1 cambia después, la pantalla lo dice.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema, no la pantalla):
--   · un reparto que suma más que el total con que se guardó (CHECK `unidades <= total`);
--   · dos fotos de la misma categoría con el mismo número (UNIQUE) o una foto editada o borrada (disparador `planes_compra_paso_2_inmutable`, el mismo del historial del plan);
--   · un reparto de un modelo de otra categoría, de un color que no existe o de una talla que no es de la categoría, o la misma celda dos veces (la función lo rechaza);
--   · nadie lee ni escribe la tabla desde la web (RLS sin políticas y sin permisos de tabla).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una tabla NUEVA con su `alter … enable row level security` (no toca ninguna tabla en uso), un disparador con
--   `create or replace trigger` (nunca `drop trigger`: ADR-0195) y funciones; SIN políticas. `lock_timeout` 3 s. Idempotente: pegarla dos veces deja lo mismo. Va DESPUÉS de 20261026190000.
-- ORDEN CON LA WEB: da igual. La web nueva con la base vieja recibe «no existe esa función» y esconde el paso 2; la web vieja con la base nueva no sabe del paso 2.
-- CAÍDA EXTERNA. Nada llama a la red. Si la lectura falla, la hoja de la categoría sigue con el paso 1 y el paso 2 dice que no pudo leerse.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. La tabla: fotos del reparto que solo se agregan ---------------------------------------------------------------------------------------

create table if not exists retail.planes_compra_paso_2 (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references retail.planes_compra (id),
  categoria_id uuid not null references retail.categorias (id),
  version integer not null check (version >= 1),
  -- «Repetir lo que ya vendió»: el % del total que va a modelos que ya vendieron (el resto queda como modelos nuevos por elegir).
  pct integer not null check (pct between 0 and 100),
  -- El total del paso 1 con que se guardó: lo elegido nunca lo pasa.
  total integer not null check (total >= 0),
  -- Las prendas elegidas: [{ "p": modelo, "c": color, "t": talla (null si la categoría no tiene tallas), "n": prendas }], solo n > 0, ordenadas.
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 5000 and octet_length(items::text) <= 1048576),
  unidades integer not null check (unidades >= 0),
  por uuid not null references public.personas (id),
  en timestamptz not null default now(),
  constraint planes_compra_paso_2_una_por_version unique (plan_id, categoria_id, version),
  constraint planes_compra_paso_2_cabe_en_el_total check (unidades <= total)
);
comment on table retail.planes_compra_paso_2 is
  'Paso 2 del plan de campaña: lo que la persona eligió repartir de una categoría en modelos, colores y tallas, como fotos que solo se agregan (la de mayor versión es la vigente). Guarda el % de repetir lo que ya vendió, el total del paso 1 con que se guardó y las prendas por modelo × color × talla. Solo la tocan sus funciones; la web no la lee ni la escribe directo.';

alter table retail.planes_compra_paso_2 enable row level security;
revoke all on retail.planes_compra_paso_2 from public, anon, authenticated;

-- Nada se edita ni se borra (el mismo disparador del historial del plan).
create or replace trigger planes_compra_paso_2_inmutable
  before update or delete on retail.planes_compra_paso_2
  for each row execute function retail.fn_plan_compra_historial_inmutable();

-- 2. La lectura: los modelos de una categoría con sus colores y tallas -------------------------------------------------------------------------

create or replace function retail.fn_plan_compra_modelos(p_plan_id uuid, p_categoria_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  v_desde timestamptz := now() - interval '90 days';
  -- Cuántos modelos se mandan como máximo: con más, los que menos vendieron se quedan fuera (y la respuesta dice cuántos había). Una categoría real tiene decenas.
  c_max_modelos constant integer := 300;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if not exists (select 1 from retail.categorias where id = p_categoria_id and activo) then
    raise exception 'Esa categoría no existe o está desactivada' using hint = 'plan_compra_categoria';
  end if;
  -- Una categoría fuera de los motores (bolsas, empaque) no se reparte en modelos: no compra con este plan.
  if not retail.fn_categoria_entra_a_motores(p_categoria_id) then
    return jsonb_build_object('soportado', true, 'entra', false);
  end if;

  return (
    -- Lo vendido y lo que hay, por modelo × color × talla. Las mismas reglas de `fn_plan_compra`: una venta completada y no de prueba (sin la prenda centinela), y el stock libre de
    -- apartados y sin Cuarentena en las ubicaciones activas.
    with con_datos as (
      select va.producto_id, va.color_codigo, va.talla_id,
             coalesce(sum(vv.unidades), 0)::integer as vendidas, coalesce(sum(sv.unidades), 0)::integer as hay
        from retail.variantes va
        join retail.productos pr on pr.id = va.producto_id
        left join (select vi.variante_id, sum(vi.cantidad)::integer as unidades
                     from retail.ventas v
                     join retail.venta_items vi on vi.venta_id = v.id
                    where v.estado = 'completada' and not v.es_prueba and vi.variante_id <> c_centinela
                      and v.created_at >= v_desde and v.created_at < now()
                    group by vi.variante_id) vv on vv.variante_id = va.id
        left join (select st.variante_id, sum(greatest(st.cantidad - coalesce(st.cantidad_apartada, 0), 0))::integer as unidades
                     from retail.stock st
                     join retail.ubicaciones u on u.id = st.ubicacion_id and u.activo
                     left join retail.sububicaciones sb on sb.id = st.sububicacion_id
                    where st.variante_id <> c_centinela and sb.tipo is distinct from 'cuarentena'
                    group by st.variante_id) sv on sv.variante_id = va.id
       where pr.categoria_id = p_categoria_id and not pr.es_prueba and va.id <> c_centinela
       group by va.producto_id, va.color_codigo, va.talla_id
      having coalesce(sum(vv.unidades), 0) > 0 or coalesce(sum(sv.unidades), 0) > 0
    ),
    -- Lo que ya se eligió en el último paso 2 aparece SIEMPRE, aunque ese modelo ya no tenga ventas en 90 días ni stock: si no, la pantalla no lo vería y al guardar de nuevo se
    -- perdería en silencio. (Entra con 0 vendidas y 0 que hay; si además tiene datos de verdad, se suman.)
    guardadas as (
      select x.p as producto_id, x.c as color_codigo, x.t as talla_id, 0 as vendidas, 0 as hay
        from jsonb_to_recordset(coalesce((select r.items from retail.planes_compra_paso_2 r
                                           where r.plan_id = p_plan_id and r.categoria_id = p_categoria_id
                                           order by r.version desc limit 1), '[]'::jsonb)) as x(p uuid, c text, t uuid, n integer)
    ),
    celdas as (
      select u.producto_id, u.color_codigo, u.talla_id, sum(u.vendidas)::integer as vendidas, sum(u.hay)::integer as hay
        from (select * from con_datos union all select * from guardadas) u
       group by u.producto_id, u.color_codigo, u.talla_id
    ),
    por_color as (
      select ce.producto_id, ce.color_codigo, sum(ce.vendidas)::integer as vendidas, sum(ce.hay)::integer as hay,
             jsonb_agg(jsonb_build_object('id', ce.talla_id, 'vendidas', ce.vendidas, 'hay', ce.hay)) as tallas
        from celdas ce
       group by ce.producto_id, ce.color_codigo
    ),
    por_modelo as (
      select pc.producto_id, sum(pc.vendidas)::integer as vendidas, sum(pc.hay)::integer as hay,
             jsonb_agg(jsonb_build_object('codigo', pc.color_codigo, 'nombre', co.nombre, 'hex', co.hex, 'vendidas', pc.vendidas, 'hay', pc.hay, 'tallas', pc.tallas)
                       order by pc.vendidas desc, co.nombre) as colores
        from por_color pc
        left join retail.colores co on co.codigo = pc.color_codigo
       group by pc.producto_id
    ),
    los_mejores as (
      select pm.vendidas, pr.referencia as nombre,
             jsonb_build_object('id', pr.id, 'nombre', pr.referencia, 'codigo', pr.codigo, 'marca', ma.nombre,
                                'vendidas', pm.vendidas, 'hay', pm.hay, 'colores', pm.colores) as modelo
        from por_modelo pm
        join retail.productos pr on pr.id = pm.producto_id
        left join retail.marcas ma on ma.id = pr.marca_id
       order by pm.vendidas desc, pr.referencia
       limit c_max_modelos
    ),
    colores_de_la_categoria as (
      select ce.color_codigo, co.nombre, co.hex, sum(ce.vendidas)::integer as vendidas, sum(ce.hay)::integer as hay
        from celdas ce
        left join retail.colores co on co.codigo = ce.color_codigo
       group by ce.color_codigo, co.nombre, co.hex
      having sum(ce.vendidas) > 0
       order by sum(ce.vendidas) desc, co.nombre
       limit 12
    )
    select jsonb_build_object(
      'soportado', true,
      'entra', true,
      'hoy', retail.fn_hoy_lima(),
      'categoria', (select jsonb_build_object('id', c.id, 'nombre', c.nombre) from retail.categorias c where c.id = p_categoria_id),
      'tallas', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'valor', t.valor))
                            from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id
                           where ct.categoria_id = p_categoria_id), '[]'::jsonb),
      -- Las ventas de la categoría que NO tienen modelo: anotadas «sin registrar» (cada una trae su categoría y su talla; cada fila cuenta una prenda).
      'sin_modelo', (select count(*)::integer
                       from retail.prendas_por_regularizar p
                       join retail.venta_items vi on vi.id = p.venta_item_id
                       join retail.ventas v on v.id = vi.venta_id
                      where p.categoria_id = p_categoria_id and p.estado in ('pendiente', 'cerrada_sin_prenda')
                        and v.estado = 'completada' and not v.es_prueba and v.created_at >= v_desde and v.created_at < now()),
      'modelos', coalesce((select jsonb_agg(m.modelo order by m.vendidas desc, m.nombre) from los_mejores m), '[]'::jsonb),
      'modelos_total', (select count(*)::integer from por_modelo),
      -- Los colores de TODA la categoría (la guía de colores para los modelos nuevos): lo que más vendió, con lo que ya hay.
      'colores_categoria', coalesce((select jsonb_agg(jsonb_build_object('codigo', x.color_codigo, 'nombre', x.nombre, 'hex', x.hex, 'vendidas', x.vendidas, 'hay', x.hay)
                                                     order by x.vendidas desc, x.nombre)
                                       from colores_de_la_categoria x), '[]'::jsonb),
      -- Lo último que se guardó de esta categoría (la foto de mayor versión).
      'guardado', (select jsonb_build_object('version', r.version, 'pct', r.pct, 'total', r.total, 'unidades', r.unidades, 'items', r.items,
                                             'por', retail.fn_actividad_nombre(r.por), 'en', r.en)
                     from retail.planes_compra_paso_2 r
                    where r.plan_id = p_plan_id and r.categoria_id = p_categoria_id
                    order by r.version desc
                    limit 1)
    )
  );
end;
$$;
revoke all on function retail.fn_plan_compra_modelos(uuid, uuid) from public, anon;
grant execute on function retail.fn_plan_compra_modelos(uuid, uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_modelos(uuid, uuid) is
  'Paso 2 del plan: los modelos de una categoría que vendieron en 90 días o tienen stock, con marca, lo vendido y lo que hay, y de cada uno sus colores y tallas; las ventas sin modelo; los colores de la categoría; y el último reparto guardado. Las mismas reglas de venta y de stock de fn_plan_compra.';

-- 3. Qué categorías ya tienen su paso 2 guardado -----------------------------------------------------------------------------------------------

create or replace function retail.fn_plan_compra_pasos_2(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  return jsonb_build_object(
    'soportado', true,
    'repartos', coalesce((
      select jsonb_agg(jsonb_build_object('categoria_id', u.categoria_id, 'version', u.version, 'pct', u.pct, 'total', u.total, 'unidades', u.unidades,
                                          'por', retail.fn_actividad_nombre(u.por), 'en', u.en))
        from (select distinct on (r.categoria_id) r.categoria_id, r.version, r.pct, r.total, r.unidades, r.por, r.en
                from retail.planes_compra_paso_2 r
               where r.plan_id = p_plan_id
               order by r.categoria_id, r.version desc) u), '[]'::jsonb));
end;
$$;
revoke all on function retail.fn_plan_compra_pasos_2(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_pasos_2(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_pasos_2(uuid) is
  'Paso 2 del plan: por categoría, el último reparto guardado (versión, % de repetir, total del paso 1 con que se guardó, prendas repartidas, quién y cuándo), para marcarlas en la lista sin abrir cada una.';

-- 4. Guardar una foto nueva ---------------------------------------------------------------------------------------------------------------------

create or replace function retail.guardar_plan_compra_paso_2(
  p_plan_id uuid,
  p_categoria_id uuid,
  p_pct integer,
  p_total integer,
  p_items jsonb,
  p_version_esperada integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_filas jsonb;
  v_items jsonb;
  v_unidades integer;
  v_con_tallas boolean;
  v_ultima retail.planes_compra_paso_2%rowtype;
  v_version integer;
  v_malo text;
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
  if p_pct is null or p_pct not between 0 and 100 then
    raise exception 'El porcentaje de repetir lo que ya vendió va de 0 %% a 100 %%.' using hint = 'plan_compra_paso_2_pct';
  end if;
  if p_total is null or p_total < 0 then
    raise exception 'El total del paso 1 no se entiende.' using hint = 'plan_compra_paso_2_total';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 5000 then
    raise exception 'El reparto no se entiende o es demasiado grande.' using hint = 'plan_compra_paso_2_items';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  v_con_tallas := exists (select 1 from retail.categoria_tallas ct where ct.categoria_id = p_categoria_id);

  -- Las filas, ya leídas con su tipo: un valor que no calza (un número donde va un id) se dice con claridad, no con el error crudo de Postgres.
  begin
    v_filas := (select coalesce(jsonb_agg(jsonb_build_object('p', x.p, 'c', x.c, 't', x.t, 'n', x.n)), '[]'::jsonb)
                  from jsonb_to_recordset(p_items) as x(p uuid, c text, t uuid, n integer));
  exception when others then
    raise exception 'El reparto no se entiende: cada fila lleva modelo, color, talla y prendas.' using hint = 'plan_compra_paso_2_items';
  end;

  v_malo := (select 'prendas' from jsonb_to_recordset(v_filas) as f(p uuid, c text, t uuid, n integer) where f.n is null or f.n < 1 or f.n > 100000 limit 1);
  if v_malo is not null then
    raise exception 'Cada fila del reparto lleva de 1 a 100000 prendas.' using hint = 'plan_compra_paso_2_prendas';
  end if;
  v_malo := (select 'modelo' from jsonb_to_recordset(v_filas) as f(p uuid, c text, t uuid, n integer)
              where f.p is null or not exists (select 1 from retail.productos pr where pr.id = f.p and pr.categoria_id = p_categoria_id and not pr.es_prueba) limit 1);
  if v_malo is not null then
    raise exception 'El reparto trae un modelo que no es de esta categoría.' using hint = 'plan_compra_paso_2_modelo';
  end if;
  v_malo := (select 'color' from jsonb_to_recordset(v_filas) as f(p uuid, c text, t uuid, n integer)
              where f.c is null or not exists (select 1 from retail.colores co where co.codigo = f.c) limit 1);
  if v_malo is not null then
    raise exception 'El reparto trae un color que no existe.' using hint = 'plan_compra_paso_2_color';
  end if;
  v_malo := (select 'talla' from jsonb_to_recordset(v_filas) as f(p uuid, c text, t uuid, n integer)
              where (v_con_tallas and (f.t is null or not exists (select 1 from retail.categoria_tallas ct where ct.categoria_id = p_categoria_id and ct.talla_id = f.t)))
                 or (not v_con_tallas and f.t is not null) limit 1);
  if v_malo is not null then
    raise exception 'El reparto trae una talla que no es de esta categoría.' using hint = 'plan_compra_paso_2_talla';
  end if;
  v_malo := (select 'repetida' from jsonb_to_recordset(v_filas) as f(p uuid, c text, t uuid, n integer) group by f.p, f.c, f.t having count(*) > 1 limit 1);
  if v_malo is not null then
    raise exception 'El reparto trae la misma prenda (modelo, color y talla) dos veces.' using hint = 'plan_compra_paso_2_repetida';
  end if;

  v_unidades := coalesce((select sum(f.n)::integer from jsonb_to_recordset(v_filas) as f(p uuid, c text, t uuid, n integer)), 0);
  if v_unidades > p_total then
    raise exception 'Repartiste % prendas y el total del paso 1 es %: te pasas por %.', v_unidades, p_total, v_unidades - p_total using hint = 'plan_compra_paso_2_se_pasa';
  end if;
  v_items := coalesce((select jsonb_agg(jsonb_build_object('p', f.p, 'c', f.c, 't', f.t, 'n', f.n) order by f.p, f.c, f.t nulls first)
                         from jsonb_to_recordset(v_filas) as f(p uuid, c text, t uuid, n integer)), '[]'::jsonb);

  -- En fila con quien guarda lo mismo a la vez: la versión se numera bajo este candado, sin huecos ni repetidas.
  perform pg_advisory_xact_lock(hashtextextended('plan_compra_paso_2:' || p_plan_id::text || ':' || p_categoria_id::text, 0));
  for v_ultima in
    select r.* from retail.planes_compra_paso_2 r where r.plan_id = p_plan_id and r.categoria_id = p_categoria_id order by r.version desc limit 1
  loop
    exit;
  end loop;

  -- Lo mismo que ya está guardado (un doble clic, un reintento tras un corte): no se guarda otra foto igual.
  if v_ultima.id is not null and v_ultima.pct = p_pct and v_ultima.total = p_total and v_ultima.items = v_items then
    return jsonb_build_object('version', v_ultima.version, 'unidades', v_ultima.unidades, 'sin_cambios', true);
  end if;
  -- Otra persona guardó mientras tú editabas Y lo tuyo es distinto: no se pisa.
  if coalesce(v_ultima.version, 0) <> coalesce(p_version_esperada, 0) then
    raise exception '% guardó otro paso 2 de % a las % mientras lo editabas: lo tuyo no se guardó. Vuelve a abrir la categoría para ver lo que guardó.',
        coalesce(retail.fn_actividad_nombre(v_ultima.por), 'Otra persona'),
        (select c.nombre from retail.categorias c where c.id = p_categoria_id),
        to_char(v_ultima.en at time zone 'America/Lima', 'HH24:MI')
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  v_version := coalesce(v_ultima.version, 0) + 1;
  insert into retail.planes_compra_paso_2 (plan_id, categoria_id, version, pct, total, items, unidades, por)
  values (p_plan_id, p_categoria_id, v_version, p_pct, p_total, v_items, v_unidades, v_persona);
  return jsonb_build_object('version', v_version, 'unidades', v_unidades, 'sin_cambios', false);
end;
$$;
revoke all on function retail.guardar_plan_compra_paso_2(uuid, uuid, integer, integer, jsonb, integer) from public, anon;
grant execute on function retail.guardar_plan_compra_paso_2(uuid, uuid, integer, integer, jsonb, integer) to authenticated, service_role;
comment on function retail.guardar_plan_compra_paso_2(uuid, uuid, integer, integer, jsonb, integer) is
  'Paso 2 del plan: guarda una foto nueva del reparto de una categoría (modelo × color × talla). Rechaza lo imposible (modelo de otra categoría, talla ajena, un reparto que se pasa del total del paso 1), se pone en fila con quien guarda lo mismo a la vez y no pisa a quien guardó mientras tanto. Lo idéntico a lo ya guardado no crea otra foto.';

reset lock_timeout;
notify pgrst, 'reload schema';
