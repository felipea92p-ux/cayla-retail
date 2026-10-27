-- ============================================================================
-- 20261026171000 — Plan de campaña: la base recuerda lo que el sistema propuso junto a lo que se guardó (ADR-0520, Felipe 2026-10-26, tarea #1)
--
-- EL PROBLEMA PRIMERO. El Plan propone los tres escenarios (flojo, normal, bueno) desde lo vendido en los últimos días, y la persona los
--   acepta o los cambia. `planes_compra_lineas` guarda UNA fila por categoría con lo último que se guardó: cada guardado pisa al anterior y
--   lo que el sistema propuso en ese momento no se guarda en ningún lado. La propuesta depende del día (cambian las ventas), así que
--   después NO se puede reconstruir: recalcularla con las ventas de después da otro número. Sin ese dato nadie podrá decir si el sistema
--   acierta mejor que la persona, ni volver a lo que se había decidido antes de un cambio (las versiones del plan, tarea #6, se
--   construyen sobre este historial).
--
-- LO QUE HACE.
--   1. `planes_compra_lineas_historial`: una fila por cada guardado de una categoría, con TODO lo que quedó guardado (escenarios, precio,
--      costo, lo que sobra, descuento, curva, nota), la versión de la línea que resultó, quién y cuándo, y —si la web la manda— la
--      PROPUESTA que el sistema mostró en ese instante. Solo se agrega: un disparador impide editarla y borrarla.
--   2. `guardar_plan_compra_linea` gana `p_propuesta jsonb default null` y escribe el historial EN LA MISMA TRANSACCIÓN que el guardado:
--      o quedan las dos cosas o no queda ninguna. null = la web de antes: se guarda igual y la fila queda sin propuesta.
--      Cambia la firma: se borra la de 12 parámetros y se crea la de 13 en la misma transacción (dos sobrecargas confundirían a PostgREST).
--   3. `fn_plan_compra_linea_al_historial`: la única que escribe el historial. Interna: ni la tienda ni nadie de afuera la ejecuta.
--
-- LO QUE NO HACE.
--   · No cambia ningún cálculo, ningún permiso ni lo que ve la persona. Esta migración solo recuerda; leer el historial (para versiones y para
--     medir aciertos) es de la tarea #6.
--   · No calcula la propuesta en la base: la manda la pantalla, que es quien la mostró. Calcularla aquí duplicaría `proponer` de la web
--     (dos fuentes de verdad). Por eso la columna es lo que la pantalla DIJO, no una verdad independiente.
--   · No deduplica un doble clic: dos guardados iguales dejan dos filas con versiones seguidas. Es lo que pasó.
--
-- CONTRATO. PROMETE: cada guardado de una línea deja exactamente una fila en el historial, atada a la versión que resultó, o no guarda
--   nada. ASUME: `p_propuesta` es un objeto JSON de hasta 8 KB (la web manda {v, calculada_en, …}); la base no mira qué trae adentro.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema, no la pantalla):
--   · una línea guardada sin su fila de historial (los dos insert van en la misma función; la única que escribe `planes_compra_lineas`);
--   · dos filas para la misma versión de la misma línea (UNIQUE plan, categoría, versión: la versión sube en cada escritura);
--   · una fila editada o borrada después (disparador `planes_compra_lineas_historial_inmutable`);
--   · una propuesta que no sea un objeto, o enorme (CHECK); escenarios desordenados o costo ≥ precio (los mismos CHECK que la línea);
--   · nadie escribe ni lee la tabla desde la web (RLS sin políticas y sin permisos de tabla).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una tabla NUEVA (su `alter … enable row level security` no toca ninguna
--   tabla en uso), un disparador con `create or replace trigger` (nunca `drop trigger`: ADR-0195), tres funciones y SIN políticas.
--   `lock_timeout` 3 s. Idempotente: pegarla dos veces deja lo mismo. Si la función que reemplaza no es la que se leyó al escribir esto
--   (md5 del cuerpo), no aplica nada y lo dice. Va DESPUÉS de 20261024215000 (el descuento): sin esa, la guarda no encuentra la firma.
-- ORDEN CON LA WEB: da igual. La web vieja con la base nueva guarda como siempre (sin propuesta); la web nueva con la base vieja recibe de
--   PostgREST «no existe esa firma», y reintenta SIN la propuesta (el guardado nunca se pierde por esto).
-- CAÍDA EXTERNA. Nada llama a la red. Si la pantalla no puede calcular la propuesta, guarda sin ella y la fila lo dice (propuesta null).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: lo que se reemplaza es la función del descuento (ADR-0499) -------------------------------------------------------

do $$
declare
  v_cuerpo text;
begin
  v_cuerpo := (select prosrc from pg_proc
                where oid = to_regprocedure('retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer,numeric)'));
  if v_cuerpo is null then
    -- Ya pasó (se pegó dos veces): la de 13 parámetros decide.
    if to_regprocedure('retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer,numeric,jsonb)') is null then
      raise exception 'retail.guardar_plan_compra_linea no existe con la firma del descuento (20261024215000): esta migración va después. No se aplicó nada.';
    end if;
  elsif md5(v_cuerpo) <> 'b8a8be791f596c9bd87767935fe08a98' then
    raise exception 'retail.guardar_plan_compra_linea cambió desde que se escribió esta migración (md5 %): regenera esta migración desde su definición real. No se aplicó nada.', md5(v_cuerpo);
  end if;
end;
$$;

-- 1. El historial ------------------------------------------------------------------------------------------------------------------

create table if not exists retail.planes_compra_lineas_historial (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references retail.planes_compra (id),
  categoria_id uuid not null references retail.categorias (id),
  -- La versión que tenía la línea DESPUÉS de este guardado (sube en cada escritura, ADR-0193).
  version integer not null check (version >= 1),
  flojo integer not null check (flojo >= 0),
  normal integer not null,
  bueno integer not null,
  precio numeric(10, 2) not null check (precio > 0),
  costo numeric(10, 2) not null check (costo >= 0),
  recupero_pct integer not null check (recupero_pct between 0 and 100),
  descuento_pct numeric(5, 2) not null default 0 check (descuento_pct >= 0 and descuento_pct < 100),
  curva jsonb not null default '{}'::jsonb check (jsonb_typeof(curva) = 'object'),
  nota text check (nota is null or btrim(nota) <> ''),
  -- Lo que el sistema propuso en pantalla cuando se guardó. null = la pantalla no pudo calcularla o es la web de antes.
  propuesta jsonb check (propuesta is null or (jsonb_typeof(propuesta) = 'object' and octet_length(propuesta::text) <= 8192)),
  guardado_por uuid not null references public.personas (id),
  guardado_en timestamptz not null default now(),
  constraint planes_compra_lineas_historial_una_por_version unique (plan_id, categoria_id, version),
  constraint planes_compra_lineas_historial_escenarios check (flojo <= normal and normal <= bueno),
  constraint planes_compra_lineas_historial_margen check (costo < precio)
);
comment on table retail.planes_compra_lineas_historial is
  'ADR-0520: una fila por cada guardado de una categoría del plan de campaña — lo que quedó guardado, la versión que resultó, quién y cuándo, y la propuesta que el sistema mostró en pantalla en ese momento (propuesta; null si no la hubo). Solo se agrega (disparador): es lo que el plan decía entonces. La escribe guardar_plan_compra_linea en la misma transacción; nadie más.';
comment on column retail.planes_compra_lineas_historial.propuesta is
  'Lo que la PANTALLA propuso al guardar, no una verdad calculada en la base: la web manda un objeto {v, calculada_en, …} de hasta 8 KB. La propuesta depende del día y no se puede reconstruir después con las ventas de después.';

alter table retail.planes_compra_lineas_historial enable row level security;
revoke all on retail.planes_compra_lineas_historial from public, anon, authenticated;

-- Solo se agrega: ni editar ni borrar, ni siquiera el dueño por descuido.
create or replace function retail.fn_plan_compra_historial_inmutable() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'El historial del plan de campaña no se edita ni se borra: es lo que el plan decía en ese momento' using errcode = '42501';
end;
$$;
revoke all on function retail.fn_plan_compra_historial_inmutable() from public, anon, authenticated;

create or replace trigger planes_compra_lineas_historial_inmutable
  before update or delete on retail.planes_compra_lineas_historial
  for each row execute function retail.fn_plan_compra_historial_inmutable();

-- 2. La única que escribe el historial ---------------------------------------------------------------------------------------------
-- Lee la línea YA guardada (con su versión nueva) y la copia: así lo que queda en el historial es lo que quedó en la línea, no lo que la
-- llamada creyó mandar. Corre dentro de `guardar_plan_compra_linea`, que es security definer; nadie más puede ejecutarla.

create or replace function retail.fn_plan_compra_linea_al_historial(p_linea_id uuid, p_propuesta jsonb)
returns void
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  insert into retail.planes_compra_lineas_historial
    (plan_id, categoria_id, version, flojo, normal, bueno, precio, costo, recupero_pct, descuento_pct, curva, nota, propuesta, guardado_por, guardado_en)
  select l.plan_id, l.categoria_id, l.version, l.flojo, l.normal, l.bueno, l.precio, l.costo, l.recupero_pct, l.descuento_pct, l.curva, l.nota,
         p_propuesta, l.actualizado_por, l.updated_at
    from retail.planes_compra_lineas l
   where l.id = p_linea_id;
  if not found then
    raise exception 'No se encontró la línea del plan que se acaba de guardar' using hint = 'plan_compra_historial';
  end if;
end;
$$;
revoke all on function retail.fn_plan_compra_linea_al_historial(uuid, jsonb) from public, anon, authenticated;
comment on function retail.fn_plan_compra_linea_al_historial(uuid, jsonb) is
  'ADR-0520. Interna: copia la línea del plan recién guardada (con su versión) al historial, con la propuesta que mostró la pantalla. Solo la llama guardar_plan_compra_linea; ni la web ni anon la ejecutan.';

-- 3. Guardar una categoría, con su historial ---------------------------------------------------------------------------------------

drop function if exists retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric);

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
  p_descuento_pct numeric default null,
  p_propuesta jsonb default null
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
  -- Un `null` JSON cuenta como «sin propuesta».
  v_propuesta jsonb := case when p_propuesta = 'null'::jsonb then null else p_propuesta end;
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
  if v_propuesta is not null and (jsonb_typeof(v_propuesta) <> 'object' or octet_length(v_propuesta::text) > 8192) then
    raise exception 'Lo que propuso el sistema no se entiende o es demasiado grande.' using hint = 'plan_compra_propuesta';
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
        perform retail.fn_plan_compra_linea_al_historial(v_id, v_propuesta);
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

  -- El historial, en esta misma transacción: si no se puede escribir, tampoco se guarda la línea.
  perform retail.fn_plan_compra_linea_al_historial(v_id, v_propuesta);

  return jsonb_build_object('id', v_id, 'plan_id', p_plan_id, 'categoria_id', p_categoria_id, 'version', v_version);
end;
$$;

revoke all on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric, jsonb) from public, anon;
grant execute on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric, jsonb) to authenticated;
comment on function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric, jsonb) is
  'ADR-0349 + ADR-0372 (B4) + ADR-0499 + ADR-0520: guarda los supuestos de UNA categoría del plan (los tres escenarios, precio, costo, lo que sobra, el descuento de la campaña, la curva y una nota) y deja una fila en planes_compra_lineas_historial en la misma transacción. Pide el módulo plan_compra; firma el responsable del combo (fn_actor_persona_id(true)). p_version_esperada (ADR-0193): la versión que la hoja leyó (0 = no había plan); si otra persona guardó otra cosa entre medio, PT409 version_cambiada. p_descuento_pct: 0 a menos de 100; null = no lo toca. p_propuesta: lo que el sistema propuso en pantalla (objeto JSON de hasta 8 KB); null = sin propuesta. Devuelve {id, plan_id, categoria_id, version}.';

reset lock_timeout;
notify pgrst, 'reload schema';
