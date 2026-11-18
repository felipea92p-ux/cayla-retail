-- ============================================================================
-- 20261026212000 — Plan de campaña: CÓMO SE PAGA lo que se compra, el IGV por categoría y si Finanzas lo ve
--   (ADR-0527, Felipe 2026-10-26, spike ⑤ «Cuándo se pide y se paga» y el contrato con Finanzas ▸ Resumen «Inversión en mercadería», tarea #10)
--
-- EL PROBLEMA PRIMERO. El Plan dice cuánto comprar y cuánto cuesta, pero no CUÁNDO sale esa plata de la caja ni qué parte es IGV; y Finanzas, que sí necesita saberlo para decir si la caja aguanta, no
--   tiene de dónde leerlo. Además, una compra de campaña no es un gasto (es mercadería que entra al estante y se vuelve costo el día que se vende): quien mira Finanzas debe poder decidir si esa campaña
--   se ve, se ve solo en «¿y si compro esto?», o no se ve.
--
-- LO QUE HACE (el contrato aprobado por Felipe con la sesión de Finanzas ▸ Resumen, `docs/maquetas/finanzas-v3-2026-10/resumen-campana/README.md`).
--   1. `planes_compra.visibilidad_finanzas`: «todo» (Resumen, flujo de caja y Escenarios) · «escenarios» (solo Escenarios) · «nada» (Finanzas no la ve). Por defecto «todo». Firmada: quién y cuándo lo cambió.
--   2. `planes_compra_pagos`: la LISTA DE PAGOS de la campaña (fecha, %) como fotos que solo se agregan, con quién y cuándo. **Lo que se guarda son los pagos, no la forma de armarlos**: si mañana cambia la
--      pantalla del Plan, Finanzas no se entera. Junto a ellos viaja, opaco, lo que la pantalla necesita para volver a abrirse (las tandas) y las categorías cuyo costo YA incluye el IGV. La base exige que
--      los pagos sumen 100 %.
--   3. `fn_plan_compra_pagos` (la lectura), `guardar_plan_compra_pagos` (una foto nueva), `cambiar_visibilidad_plan_compra` y `fn_plan_compra_pagado` (cuánto de lo facturado de las órdenes de la campaña ya se pagó,
--      sin IGV: es lo que Finanzas llama «pagado»).
--
-- LO QUE NO HACE.
--   · No calcula cuánto cuesta el plan ni el IGV: eso es la cuenta del Plan (`calcular`, en la web), que la lee quien la necesita (el Resumen de Finanzas la arma con las mismas funciones del Plan). Dos fuentes de
--     verdad de «cuánto comprar» serían una de más.
--   · No mueve plata ni crea pagos reales: es el plan de pagos. El pago real vive en Compras ▸ Por pagar y reemplaza al planeado.
--   · No toca el flujo de caja de Reportes: que `todo` entre a esa proyección es de Finanzas y de otra migración.
--
-- CONTRATO. PROMETE: la lista de pagos vigente de una campaña es la foto de mayor versión; toda foto suma exactamente 100 %, con fechas reales, sin repetir y de 1 a 24 pagos; las versiones son 1, 2, 3…
--   sin huecos ni repetidas aunque dos personas guarden a la vez; y la visibilidad solo toma uno de los tres valores y dice quién la cambió. ASUME: las órdenes de una campaña son las que ya cuenta
--   `fn_plan_compra_pedido` (generadas, con entrega o emisión dentro de las fechas de la campaña).
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema, no la pantalla):
--   · una lista de pagos que no suma 100 %, con una fecha que no existe, repetida o vacía (CHECK `planes_compra_pagos_suman_cien`, con la función inmutable `fn_pagos_de_compra_validos`);
--   · una visibilidad que no sea «todo», «escenarios» o «nada», o cambiada sin decir quién (CHECK);
--   · una foto de pagos editada o borrada (disparador `planes_compra_pagos_inmutable`, el mismo del historial del plan) o dos con el mismo número (UNIQUE);
--   · nadie lee ni escribe la tabla desde la web (RLS sin políticas y sin permisos de tabla).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una columna nueva en `planes_compra` (con valor constante: no reescribe la tabla), una tabla NUEVA con su `alter … enable row level security`, un
--   disparador con `create or replace trigger` (nunca `drop trigger`: ADR-0195) y funciones; SIN políticas. `lock_timeout` 3 s. Idempotente. Va DESPUÉS de 20261026204000.
-- ORDEN CON LA WEB: da igual. La web nueva con la base vieja recibe «no existe esa función» y no ofrece «Cuándo se paga» ni el bloque de Finanzas; la web vieja con la base nueva no sabe de pagos.
-- CAÍDA EXTERNA. Nada llama a la red. Si la lectura falla, el Plan lo dice y Finanzas no dibuja el bloque: nunca un S/ 0 que parezca un dato.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. La visibilidad en Finanzas ------------------------------------------------------------------------------------------------------

alter table retail.planes_compra add column if not exists visibilidad_finanzas text not null default 'todo';
alter table retail.planes_compra add column if not exists visibilidad_finanzas_por uuid references public.personas (id);
alter table retail.planes_compra add column if not exists visibilidad_finanzas_en timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planes_compra_visibilidad_finanzas_valida' and conrelid = 'retail.planes_compra'::regclass) then
    alter table retail.planes_compra add constraint planes_compra_visibilidad_finanzas_valida
      check (visibilidad_finanzas in ('todo', 'escenarios', 'nada') and (visibilidad_finanzas_por is null) = (visibilidad_finanzas_en is null));
  end if;
end;
$$;
comment on column retail.planes_compra.visibilidad_finanzas is
  'Si Finanzas ve la compra de esta campaña: todo (Resumen, flujo de caja y Escenarios), escenarios (solo Escenarios) o nada. Por defecto todo; lo cambia cambiar_visibilidad_plan_compra y queda quién y cuándo.';

-- 2. La lista de pagos: fotos que solo se agregan -------------------------------------------------------------------------------------

-- ¿Una lista de pagos es válida? De 1 a 24 pagos, cada uno con una fecha que existe y un % de 0,01 a 100; sin fechas repetidas y sumando exactamente 100. Inmutable: solo mira el JSON.
create or replace function retail.fn_pagos_de_compra_validos(p_pagos jsonb)
returns boolean
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_n integer;
  v_e jsonb;
  v_fecha text;
  v_pct numeric;
  v_suma numeric := 0;
  v_vistas text[] := '{}';
begin
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then
    return false;
  end if;
  v_n := jsonb_array_length(p_pagos);
  if v_n < 1 or v_n > 24 then
    return false;
  end if;
  for v_e in select value from jsonb_array_elements(p_pagos) loop
    if jsonb_typeof(v_e) <> 'object' or jsonb_typeof(v_e -> 'fecha') <> 'string' or jsonb_typeof(v_e -> 'pct') <> 'number' then
      return false;
    end if;
    v_fecha := v_e ->> 'fecha';
    if v_fecha !~ '^\d{4}-\d{2}-\d{2}$' then
      return false;
    end if;
    -- Que la fecha EXISTA (el 31 de febrero no): make_date lo rechaza.
    begin
      perform make_date(split_part(v_fecha, '-', 1)::integer, split_part(v_fecha, '-', 2)::integer, split_part(v_fecha, '-', 3)::integer);
    exception when others then
      return false;
    end;
    v_pct := (v_e ->> 'pct')::numeric;
    if v_pct < 0.01 or v_pct > 100 or v_fecha = any (v_vistas) then
      return false;
    end if;
    v_vistas := v_vistas || v_fecha;
    v_suma := v_suma + v_pct;
  end loop;
  return round(v_suma, 2) = 100;
end;
$$;
revoke all on function retail.fn_pagos_de_compra_validos(jsonb) from public, anon, authenticated;

create table if not exists retail.planes_compra_pagos (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references retail.planes_compra (id),
  version integer not null check (version >= 1),
  -- La lista de pagos: [{ "fecha": "2026-11-12", "pct": 40 }, …]. Es lo que lee Finanzas.
  pagos jsonb not null,
  -- Lo que la pantalla del Plan necesita para volver a abrirse tal como se dejó (las tandas y sus formas de pago). OPACO para Finanzas: nadie lo lee fuera del Plan.
  tandas jsonb not null default '[]'::jsonb,
  -- Los ids de las categorías cuyo costo YA incluye el IGV (a las demás se les suma). Es de esta campaña: no cambia el costo de la ficha.
  igv_incluido jsonb not null default '[]'::jsonb,
  por uuid not null references public.personas (id),
  en timestamptz not null default now(),
  constraint planes_compra_pagos_una_por_version unique (plan_id, version),
  constraint planes_compra_pagos_suman_cien check (retail.fn_pagos_de_compra_validos(pagos)),
  constraint planes_compra_pagos_igv_lista check (jsonb_typeof(igv_incluido) = 'array' and jsonb_array_length(igv_incluido) <= 500),
  constraint planes_compra_pagos_tandas_tope check (jsonb_typeof(tandas) in ('array', 'object') and octet_length(tandas::text) <= 16384)
);
comment on table retail.planes_compra_pagos is
  'Cómo se paga lo que se compra para una campaña: la lista de pagos (fecha, %, suma 100) como fotos que solo se agregan, con quién y cuándo, las tandas con que se armó (opaco) y las categorías cuyo costo ya incluye el IGV. La de mayor versión es la vigente. Finanzas lee los pagos, no la forma de armarlos.';
alter table retail.planes_compra_pagos enable row level security;
revoke all on retail.planes_compra_pagos from public, anon, authenticated;

create or replace trigger planes_compra_pagos_inmutable
  before update or delete on retail.planes_compra_pagos
  for each row execute function retail.fn_plan_compra_historial_inmutable();

-- 3. Leer ------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_plan_compra_pagos(p_plan_id uuid)
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
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    return null;
  end if;
  return jsonb_build_object(
    'soportado', true,
    -- «por» es null mientras nadie la haya cambiado: `fn_actividad_nombre(null)` devolvería «una persona», que parecería una firma.
    'plan', (select jsonb_build_object('id', p.id, 'visibilidad_finanzas', p.visibilidad_finanzas,
                                       'por', case when p.visibilidad_finanzas_por is null then null else retail.fn_actividad_nombre(p.visibilidad_finanzas_por) end,
                                       'en', p.visibilidad_finanzas_en)
               from retail.planes_compra p where p.id = p_plan_id),
    'guardado', (select jsonb_build_object('version', g.version, 'pagos', g.pagos, 'tandas', g.tandas, 'igv_incluido', g.igv_incluido,
                                           'por', retail.fn_actividad_nombre(g.por), 'en', g.en)
                   from retail.planes_compra_pagos g
                  where g.plan_id = p_plan_id
                  order by g.version desc
                  limit 1));
end;
$$;
revoke all on function retail.fn_plan_compra_pagos(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_pagos(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_pagos(uuid) is
  'Cómo se paga la compra de una campaña: la última lista de pagos (fecha, %), las tandas con que se armó y las categorías cuyo costo incluye el IGV, más si Finanzas la ve y quién lo decidió.';

-- 4. Guardar una foto nueva de los pagos -------------------------------------------------------------------------------------------------

create or replace function retail.guardar_plan_compra_pagos(
  p_plan_id uuid,
  p_pagos jsonb,
  p_tandas jsonb,
  p_igv_incluido jsonb,
  p_version_esperada integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_pagos jsonb;
  v_igv jsonb;
  v_tandas jsonb := coalesce(p_tandas, '[]'::jsonb);
  v_suma numeric;
  v_n integer;
  v_ultima retail.planes_compra_pagos%rowtype;
  v_version integer;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Armar el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if not exists (select 1 from retail.planes_compra where id = p_plan_id) then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Agrega al menos un pago.' using hint = 'plan_compra_pagos_vacios';
  end if;
  v_n := jsonb_array_length(p_pagos);
  if v_n > 24 then
    raise exception 'Una campaña lleva hasta 24 pagos.' using hint = 'plan_compra_pagos_muchos';
  end if;
  -- Normalizada: ordenada por fecha y con el % a dos decimales; así lo idéntico se reconoce aunque llegue en otro orden.
  begin
    v_pagos := (select jsonb_agg(jsonb_build_object('fecha', x.fecha, 'pct', round(x.pct, 2)) order by x.fecha)
                  from jsonb_to_recordset(p_pagos) as x(fecha text, pct numeric));
  exception when others then
    raise exception 'Los pagos no se entienden: cada uno lleva su fecha y su porcentaje.' using hint = 'plan_compra_pagos_formato';
  end;
  v_suma := (select sum(x.pct) from jsonb_to_recordset(v_pagos) as x(fecha text, pct numeric));
  if not retail.fn_pagos_de_compra_validos(v_pagos) then
    if round(coalesce(v_suma, 0), 2) <> 100 then
      raise exception 'Los pagos suman % %%: tienen que sumar 100 %%.', round(coalesce(v_suma, 0), 2) using hint = 'plan_compra_pagos_suma';
    end if;
    raise exception 'Cada pago lleva una fecha que existe y un porcentaje de 0,01 a 100, y no se repite la fecha.' using hint = 'plan_compra_pagos_invalidos';
  end if;
  if p_igv_incluido is null or jsonb_typeof(p_igv_incluido) <> 'array' then
    raise exception 'La lista de categorías con IGV incluido no se entiende.' using hint = 'plan_compra_pagos_igv';
  end if;
  begin
    v_igv := coalesce((select jsonb_agg(distinct to_jsonb(x.c::text) order by to_jsonb(x.c::text))
                         from jsonb_array_elements_text(p_igv_incluido) as x(c)), '[]'::jsonb);
  exception when others then
    raise exception 'La lista de categorías con IGV incluido no se entiende.' using hint = 'plan_compra_pagos_igv';
  end;
  -- El CASE (no un OR) porque Postgres no promete en qué orden evalúa un OR: sin él, un texto que no es id reventaría con el error crudo de la conversión.
  if exists (select 1 from jsonb_array_elements_text(v_igv) as x(c)
              where case when x.c ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         then not exists (select 1 from retail.categorias ca where ca.id = x.c::uuid)
                         else true end) then
    raise exception 'El IGV incluido trae una categoría que no existe.' using hint = 'plan_compra_pagos_igv';
  end if;
  if jsonb_typeof(v_tandas) not in ('array', 'object') or octet_length(v_tandas::text) > 16384 then
    raise exception 'Las tandas no se entienden o son demasiado grandes.' using hint = 'plan_compra_pagos_tandas';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  -- En fila con quien guarda lo mismo a la vez: la versión se numera bajo este candado, sin huecos ni repetidas.
  perform pg_advisory_xact_lock(hashtextextended('plan_compra_pagos:' || p_plan_id::text, 0));
  for v_ultima in
    select g.* from retail.planes_compra_pagos g where g.plan_id = p_plan_id order by g.version desc limit 1
  loop
    exit;
  end loop;

  -- Lo mismo que ya está guardado (un doble clic, un reintento tras un corte de red): no se guarda otra foto igual.
  if v_ultima.id is not null and v_ultima.pagos = v_pagos and v_ultima.igv_incluido = v_igv and v_ultima.tandas = v_tandas then
    return jsonb_build_object('version', v_ultima.version, 'sin_cambios', true);
  end if;
  -- Otra persona guardó mientras tú editabas Y lo tuyo es distinto: no se pisa.
  if coalesce(v_ultima.version, 0) <> coalesce(p_version_esperada, 0) then
    raise exception '% guardó otra forma de pago de esta campaña a las % mientras la editabas: lo tuyo no se guardó. Vuelve a abrirla para ver lo que guardó.',
        coalesce(retail.fn_actividad_nombre(v_ultima.por), 'Otra persona'),
        to_char(v_ultima.en at time zone 'America/Lima', 'HH24:MI')
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  v_version := coalesce(v_ultima.version, 0) + 1;
  insert into retail.planes_compra_pagos (plan_id, version, pagos, tandas, igv_incluido, por)
  values (p_plan_id, v_version, v_pagos, v_tandas, v_igv, v_persona);
  return jsonb_build_object('version', v_version, 'sin_cambios', false);
end;
$$;
revoke all on function retail.guardar_plan_compra_pagos(uuid, jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function retail.guardar_plan_compra_pagos(uuid, jsonb, jsonb, jsonb, integer) to authenticated, service_role;
comment on function retail.guardar_plan_compra_pagos(uuid, jsonb, jsonb, jsonb, integer) is
  'Guarda una foto nueva de cómo se paga la compra de una campaña: la lista de pagos (fecha, %, suma exactamente 100), las tandas con que se armó (opaco) y las categorías cuyo costo incluye el IGV. Lo idéntico a lo ya guardado no crea otra foto; si otra persona guardó mientras tanto, no la pisa (PT409).';

-- 5. Cambiar si Finanzas la ve ------------------------------------------------------------------------------------------------------------

create or replace function retail.cambiar_visibilidad_plan_compra(p_plan_id uuid, p_valor text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_actual text;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Cambiar lo que Finanzas ve de la campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if p_valor is null or p_valor not in ('todo', 'escenarios', 'nada') then
    raise exception 'Finanzas ve la campaña entera, solo en Escenarios, o no la ve.' using hint = 'plan_compra_visibilidad';
  end if;
  -- Con candado de fila: dos personas que la cambian a la vez se turnan, y la segunda ve lo que dejó la primera.
  for v_actual in select p.visibilidad_finanzas from retail.planes_compra p where p.id = p_plan_id for update loop exit; end loop;
  if v_actual is null then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if v_actual = p_valor then
    return jsonb_build_object('visibilidad_finanzas', v_actual, 'sin_cambios', true);
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  update retail.planes_compra
     set visibilidad_finanzas = p_valor, visibilidad_finanzas_por = v_persona, visibilidad_finanzas_en = now()
   where id = p_plan_id;
  return jsonb_build_object('visibilidad_finanzas', p_valor, 'sin_cambios', false);
end;
$$;
revoke all on function retail.cambiar_visibilidad_plan_compra(uuid, text) from public, anon;
grant execute on function retail.cambiar_visibilidad_plan_compra(uuid, text) to authenticated, service_role;
comment on function retail.cambiar_visibilidad_plan_compra(uuid, text) is
  'Decide si Finanzas ve la compra de una campaña: todo (Resumen, flujo de caja y Escenarios), escenarios (solo Escenarios) o nada. Queda quién y cuándo. No borra nada: la campaña sigue en el Plan y en Compras.';

-- 6. Cuánto de lo facturado ya se pagó ----------------------------------------------------------------------------------------------------

-- Lo que Finanzas llama «pagado» y «facturado», SIN IGV, de las órdenes de la campaña (las mismas que cuenta `fn_plan_compra_pedido`: generadas, con entrega o emisión dentro de las fechas de la
-- campaña). Cada comprobante aporta lo pagado en la proporción de su subtotal sobre su total (el IGV no es costo de la mercadería; una nota de venta, que no lleva IGV, aporta todo lo pagado).
-- Los anulados y los que no son mercadería no cuentan.
create or replace function retail.fn_plan_compra_pagado(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_desde date;
  v_hasta date;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v_desde, v_hasta in select p.desde, p.hasta from retail.planes_compra p where p.id = p_plan_id loop exit; end loop;
  if v_desde is null then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'soportado', true,
      'comprobantes', count(*)::integer,
      'facturado_sin_igv', coalesce(round(sum(c.subtotal), 2), 0),
      'pagado_sin_igv', coalesce(round(sum(case when c.total > 0 then least(c.pagado, c.total) * c.subtotal / c.total else 0 end), 2), 0),
      'pagado_total', coalesce(round(sum(least(c.pagado, c.total)), 2), 0))
      from retail.compras c
      join retail.ordenes_compra o on o.id = c.orden_compra_id
     where c.estado = 'vigente' and c.naturaleza = 'mercaderia'
       and o.estado = 'generada'
       and coalesce(o.fecha_entrega_estimada, o.fecha_emision) between v_desde and v_hasta);
end;
$$;
revoke all on function retail.fn_plan_compra_pagado(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_pagado(uuid) to authenticated, service_role;
comment on function retail.fn_plan_compra_pagado(uuid) is
  'De las órdenes de una campaña: cuánto se facturó y cuánto de eso ya se pagó, sin IGV (y lo pagado con IGV). Lo que Finanzas llama facturado y pagado.';

reset lock_timeout;
notify pgrst, 'reload schema';
