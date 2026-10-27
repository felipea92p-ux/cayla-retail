-- ============================================================================
-- 20261026184000 — Plan de campaña: el plan con tope se guarda (el «precio de la plata») y cada cambio grande queda como una versión a la que se puede volver
--   (ADR-0523, Felipe 2026-10-26, spike ④ «Presupuesto», tareas #5 y #6)
--
-- EL PROBLEMA PRIMERO. La pestaña Presupuesto propone un plan que cabe en el tope: un «precio de la plata» (λ) igual para todas las categorías que
--   baja la compra donde cada sol rinde menos. Hasta aquí solo SIMULA. Para usarlo hay que guardarlo en el plan (si no, cada pantalla recalcularía
--   con λ = 0 y el plan «con tope» desaparecería al recargar). Y guardar sin querer hoy no se deshace: cada guardado de una categoría pisa al anterior
--   (el historial de ADR-0520 recuerda, pero nada lo lee). Quien usa un plan con tope, o corrige tres categorías a la vez, necesita poder decir
--   «vuelvo a como estaba el martes».
--
-- LO QUE HACE.
--   1. `planes_compra.precio_de_la_plata` (λ, entre −1 y 50; 0 = el plan de siempre). Es lo único que cambia de una tabla que ya existe.
--   2. `planes_compra_versiones`: una fila por versión, con una FOTO del plan en ese momento (las categorías con sus supuestos, λ y el tope), quién,
--      cuándo, la nota, de dónde salió (a mano, «plan con tope», una restauración, o la automática que se guarda ANTES de un cambio grande) y lo que la
--      pantalla mostró (prendas, inversión). Solo se agrega: un disparador impide editarla y borrarla. La numera la base (1, 2, 3…) sin huecos ni repetidos.
--   3. Cuatro funciones que la web llama: `fn_plan_compra_versiones` (la lista, sin las fotos), `fn_plan_compra_version` (una foto), y las tres que
--      escriben: `guardar_plan_compra_version`, `usar_plan_compra_con_tope` y `restaurar_plan_compra_version`. Cada una pide el módulo «Plan de campaña»
--      y firma el responsable del combo (`fn_actor_persona_id(true)`).
--   4. Tres internas (la foto, su huella, la fila nueva): ni la tienda ni nadie de afuera las ejecuta.
--
-- LO QUE NO HACE.
--   · No cambia ningún cálculo. `calcular` en la web sigue siendo la única que decide cuánto comprar; la base guarda el λ y la web lo aplica.
--   · «Volver a una versión» NO borra nada: crea una versión NUEVA con lo que tenía la elegida. Las versiones de después siguen en la lista. Tampoco borra las
--     categorías que se armaron después de esa versión (no estaban en la foto: se quedan como están).
--   · No calcula prendas ni inversión (eso es `calcular`, en la web): las guarda tal como la pantalla las mostró. Son lo que se VIO, no una verdad independiente.
--   · No compara versiones: «qué cambió» lo arma la web con las dos fotos.
--
-- CONTRATO. PROMETE: cada escritura de λ, de tope-con-plan o de categorías por restauración deja su versión en la MISMA transacción (o no cambia nada);
--   dos personas que cambian el plan a la vez se ponen en fila (se bloquea la fila del plan) y quedan versiones seguidas, sin repetir número.
--   ASUME: `p_prendas` e `p_inversion` los calcula la pantalla; la base solo comprueba que no sean negativos.
--
-- ESTADOS QUE NUNCA DEBEN EXISTIR (los cierra el esquema, no la pantalla):
--   · dos versiones con el mismo número en un plan (UNIQUE plan, número) ni un hueco en la numeración (se numera bajo el bloqueo del plan);
--   · una restauración sin decir de qué versión vuelve, una versión que no es restauración que lo diga, o una que vuelva a una versión posterior a ella (CHECK);
--   · una versión editada o borrada (disparador `planes_compra_versiones_inmutable`, el mismo del historial);
--   · un precio de la plata fuera de −1…50, una nota de más de 120 letras o una foto que no sea una lista o pese más de 256 KB (CHECK);
--   · un λ o un tope cambiados por una función que no deje su versión (solo estas dos funciones los escriben junto con su versión);
--   · nadie escribe ni lee las tablas desde la web (RLS sin políticas y sin permisos de tabla).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una columna con valor de fábrica constante (no reescribe la tabla), una tabla NUEVA con su
--   `alter … enable row level security` (no toca ninguna tabla en uso), un disparador con `create or replace trigger` (nunca `drop trigger`: ADR-0195) y
--   funciones, SIN políticas. `lock_timeout` 3 s. Idempotente: pegarla dos veces deja lo mismo. Va DESPUÉS de 20261026171000 (el historial): sin esa, la
--   restauración no encuentra `fn_plan_compra_linea_al_historial`.
-- ORDEN CON LA WEB: da igual. La web de antes con la base nueva ignora todo (no sabe de λ ni de versiones); la web nueva con la base vieja recibe de PostgREST
--   «no existe esa función» y esconde las versiones y el botón «Usar el plan con tope»: el plan se ve y se simula, no se guarda.
-- CAÍDA EXTERNA. Nada llama a la red. Si la lectura de versiones falla, el Plan se calcula con λ = 0 y lo dice (el plan con tope no se aplica en silencio).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: el historial de las líneas tiene que estar (la restauración lo escribe) -------------------------------------------

do $$
begin
  if to_regprocedure('retail.fn_plan_compra_linea_al_historial(uuid,jsonb)') is null then
    raise exception 'retail.fn_plan_compra_linea_al_historial no existe: esta migración va después de 20261026171000 (el historial de las líneas). No se aplicó nada.';
  end if;
end;
$$;

-- 1. El precio de la plata del plan ----------------------------------------------------------------------------------------------------

alter table retail.planes_compra
  add column if not exists precio_de_la_plata numeric(8, 3) not null default 0 check (precio_de_la_plata between -1 and 50);
comment on column retail.planes_compra.precio_de_la_plata is
  'El «precio de la plata» (λ) del plan con tope: cuánto cuesta cada sol inmovilizado en mercadería. 0 = el plan de siempre; positivo aprieta la compra de todas las categorías a la vez, negativo la afloja. La web lo aplica en calcular(); solo lo escriben usar_plan_compra_con_tope y restaurar_plan_compra_version, que dejan su versión.';

-- 2. Las versiones ------------------------------------------------------------------------------------------------------------------

create table if not exists retail.planes_compra_versiones (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references retail.planes_compra (id),
  numero integer not null check (numero >= 1),
  nota text not null default '' check (char_length(nota) <= 120),
  -- De dónde salió: a mano («Guardar una versión»), al usar el plan con tope, al volver a una versión, o la automática que se guarda ANTES de un cambio grande
  -- para que «volver» siempre tenga adónde.
  origen text not null check (origen in ('manual', 'plan_con_tope', 'restauracion', 'automatica')),
  restaurada_de integer check (restaurada_de is null or restaurada_de >= 1),
  precio_de_la_plata numeric(8, 3) not null check (precio_de_la_plata between -1 and 50),
  tope numeric(12, 2) check (tope is null or tope > 0),
  -- La foto: una lista con una fila por categoría del plan (sus supuestos tal como estaban).
  lineas jsonb not null check (jsonb_typeof(lineas) = 'array' and octet_length(lineas::text) <= 262144),
  -- Lo que la pantalla mostró al guardar; null = no se sabe (la automática no lo trae siempre).
  prendas integer check (prendas is null or prendas >= 0),
  inversion numeric(12, 2) check (inversion is null or inversion >= 0),
  -- Para saber si el plan de hoy YA es esta versión (si no cambió nada desde entonces).
  huella text not null,
  creada_por uuid not null references public.personas (id),
  creada_en timestamptz not null default now(),
  constraint planes_compra_versiones_una_por_numero unique (plan_id, numero),
  constraint planes_compra_versiones_restauracion check ((origen = 'restauracion') = (restaurada_de is not null)),
  constraint planes_compra_versiones_vuelve_a_una_anterior check (restaurada_de is null or restaurada_de < numero)
);
comment on table retail.planes_compra_versiones is
  'Versiones del plan de campaña: una foto del plan (categorías con sus supuestos, el precio de la plata y el tope) en cada punto que alguien guardó, o que el sistema guardó antes de un cambio grande. Solo se agrega (disparador): volver a una versión crea una NUEVA, no borra nada. La escriben guardar_plan_compra_version, usar_plan_compra_con_tope y restaurar_plan_compra_version; nadie más.';
comment on column retail.planes_compra_versiones.huella is
  'md5 de la foto + el precio de la plata + el tope, calculado con fn_plan_compra_huella: igual a la del plan de hoy = el plan no cambió desde esta versión.';

alter table retail.planes_compra_versiones enable row level security;
revoke all on retail.planes_compra_versiones from public, anon, authenticated;

-- Solo se agrega: el mismo disparador que protege el historial de las líneas (su mensaje habla del «historial del plan de campaña», que es lo que es).
create or replace trigger planes_compra_versiones_inmutable
  before update or delete on retail.planes_compra_versiones
  for each row execute function retail.fn_plan_compra_historial_inmutable();

-- 3. Las internas: la foto, su huella y la fila nueva -----------------------------------------------------------------------------

-- La foto de las categorías del plan, siempre en el mismo orden: es lo que se compara (huella) y lo que «volver» restaura.
create or replace function retail.fn_plan_compra_lineas_json(p_plan_id uuid)
returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'categoria_id', l.categoria_id, 'flojo', l.flojo, 'normal', l.normal, 'bueno', l.bueno,
           'precio', l.precio, 'costo', l.costo, 'recupero_pct', l.recupero_pct, 'descuento_pct', l.descuento_pct,
           'curva', l.curva, 'nota', l.nota) order by l.categoria_id), '[]'::jsonb)
    from retail.planes_compra_lineas l
   where l.plan_id = p_plan_id;
$$;
revoke all on function retail.fn_plan_compra_lineas_json(uuid) from public, anon, authenticated;

create or replace function retail.fn_plan_compra_huella(p_lineas jsonb, p_precio numeric, p_tope numeric)
returns text
language sql
immutable
set search_path = retail, public, extensions
as $$
  select md5(jsonb_build_object('l', p_lineas, 'p', round(p_precio, 3), 't', round(p_tope, 2))::text);
$$;
revoke all on function retail.fn_plan_compra_huella(jsonb, numeric, numeric) from public, anon, authenticated;

-- Escribe UNA versión con la foto de hoy. Quien la llama ya tomó el bloqueo del plan (`for update`): así la numeración no se repite ni deja huecos.
create or replace function retail.fn_plan_compra_nueva_version(
  p_plan_id uuid,
  p_nota text,
  p_origen text,
  p_restaurada_de integer,
  p_prendas integer,
  p_inversion numeric,
  p_persona uuid
)
returns integer
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_plan retail.planes_compra%rowtype;
  v_lineas jsonb;
  v_numero integer;
begin
  for v_plan in select p.* from retail.planes_compra p where p.id = p_plan_id loop
    exit;
  end loop;
  v_lineas := retail.fn_plan_compra_lineas_json(p_plan_id);
  v_numero := coalesce((select max(v.numero) from retail.planes_compra_versiones v where v.plan_id = p_plan_id), 0) + 1;
  insert into retail.planes_compra_versiones
    (plan_id, numero, nota, origen, restaurada_de, precio_de_la_plata, tope, lineas, prendas, inversion, huella, creada_por)
  values
    (p_plan_id, v_numero, coalesce(p_nota, ''), p_origen, p_restaurada_de, v_plan.precio_de_la_plata, v_plan.tope_inversion, v_lineas,
     p_prendas, p_inversion, retail.fn_plan_compra_huella(v_lineas, v_plan.precio_de_la_plata, v_plan.tope_inversion), p_persona);
  return v_numero;
end;
$$;
revoke all on function retail.fn_plan_compra_nueva_version(uuid, text, text, integer, integer, numeric, uuid) from public, anon, authenticated;

-- Antes de un cambio grande: si el plan de hoy tiene algo que ninguna versión recuerda, se guarda como versión automática. Así «volver» siempre tiene adónde.
-- Devuelve el número de la versión automática, o null si no hacía falta (no hay categorías, o la última versión ya es el plan de hoy).
create or replace function retail.fn_plan_compra_proteger_lo_de_hoy(p_plan_id uuid, p_nota text, p_prendas integer, p_inversion numeric, p_persona uuid)
returns integer
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_plan retail.planes_compra%rowtype;
  v_lineas jsonb;
  v_ultima text;
begin
  for v_plan in select p.* from retail.planes_compra p where p.id = p_plan_id loop
    exit;
  end loop;
  v_lineas := retail.fn_plan_compra_lineas_json(p_plan_id);
  if v_lineas = '[]'::jsonb then
    return null;
  end if;
  v_ultima := (select v.huella from retail.planes_compra_versiones v where v.plan_id = p_plan_id order by v.numero desc limit 1);
  if v_ultima is not distinct from retail.fn_plan_compra_huella(v_lineas, v_plan.precio_de_la_plata, v_plan.tope_inversion) then
    return null;
  end if;
  return retail.fn_plan_compra_nueva_version(p_plan_id, p_nota, 'automatica', null, p_prendas, p_inversion, p_persona);
end;
$$;
revoke all on function retail.fn_plan_compra_proteger_lo_de_hoy(uuid, text, integer, numeric, uuid) from public, anon, authenticated;

-- 4. Leer ---------------------------------------------------------------------------------------------------------------------------

-- La lista (la más nueva primero) SIN las fotos —pesan— y con la huella del plan de hoy: la web sabe cuál versión es «la de hoy» (la de la misma huella) y si el
-- plan tiene cambios que ninguna versión recuerda. `precio_de_la_plata` y `tope` son los de hoy.
create or replace function retail.fn_plan_compra_versiones(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_plan retail.planes_compra%rowtype;
  v_lista jsonb;
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
  v_lista := coalesce((
    select jsonb_agg(jsonb_build_object(
             'numero', v.numero, 'nota', v.nota, 'origen', v.origen, 'restaurada_de', v.restaurada_de,
             'precio_de_la_plata', v.precio_de_la_plata, 'tope', v.tope, 'prendas', v.prendas, 'inversion', v.inversion,
             'huella', v.huella, 'por', retail.fn_actividad_nombre(v.creada_por), 'en', v.creada_en) order by v.numero desc)
      from retail.planes_compra_versiones v
     where v.plan_id = p_plan_id), '[]'::jsonb);
  return jsonb_build_object(
    -- La web nueva solo ofrece las versiones y «Usar el plan con tope» si ve esta marca.
    'soportado', true,
    'precio_de_la_plata', v_plan.precio_de_la_plata,
    'tope', v_plan.tope_inversion,
    'huella_actual', retail.fn_plan_compra_huella(retail.fn_plan_compra_lineas_json(p_plan_id), v_plan.precio_de_la_plata, v_plan.tope_inversion),
    'versiones', v_lista
  );
end;
$$;
revoke all on function retail.fn_plan_compra_versiones(uuid) from public, anon;
grant execute on function retail.fn_plan_compra_versiones(uuid) to authenticated;
comment on function retail.fn_plan_compra_versiones(uuid) is
  'ADR-0523: la lista de versiones del plan (la más nueva primero, sin las fotos), el precio de la plata y el tope de hoy, y la huella del plan de hoy para saber cuál versión es «la de hoy». Pide el módulo plan_compra. null si el plan no existe.';

-- Una versión con su foto (para ver qué cambió contra el plan de hoy, o para volver a ella).
create or replace function retail.fn_plan_compra_version(p_plan_id uuid, p_numero integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v retail.planes_compra_versiones%rowtype;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Ver el plan de campaña necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  for v in select x.* from retail.planes_compra_versiones x where x.plan_id = p_plan_id and x.numero = p_numero loop
    exit;
  end loop;
  if v.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'numero', v.numero, 'nota', v.nota, 'origen', v.origen, 'restaurada_de', v.restaurada_de,
    'precio_de_la_plata', v.precio_de_la_plata, 'tope', v.tope, 'prendas', v.prendas, 'inversion', v.inversion,
    'huella', v.huella, 'por', retail.fn_actividad_nombre(v.creada_por), 'en', v.creada_en, 'lineas', v.lineas
  );
end;
$$;
revoke all on function retail.fn_plan_compra_version(uuid, integer) from public, anon;
grant execute on function retail.fn_plan_compra_version(uuid, integer) to authenticated;
comment on function retail.fn_plan_compra_version(uuid, integer) is
  'ADR-0523: una versión del plan con su foto (las categorías con sus supuestos). Pide el módulo plan_compra. null si no existe.';

-- 5. Escribir -----------------------------------------------------------------------------------------------------------------------

-- «Guardar una versión ahora»: un punto de control a mano. Se niega si el plan no cambió desde la última versión (otra igual no sirve de nada, y así un doble
-- clic no deja dos).
create or replace function retail.guardar_plan_compra_version(p_plan_id uuid, p_nota text default null, p_prendas integer default null, p_inversion numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_nota text := coalesce(btrim(p_nota), '');
  v_plan retail.planes_compra%rowtype;
  v_lineas jsonb;
  v_ultima text;
  v_numero integer;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Guardar una versión del plan necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if char_length(v_nota) > 120 then
    raise exception 'La nota de la versión es demasiado larga (máximo 120 letras).' using hint = 'plan_compra_version_nota';
  end if;
  if (p_prendas is not null and p_prendas < 0) or (p_inversion is not null and p_inversion < 0) then
    raise exception 'Las prendas y la inversión de la versión no pueden ser negativas.' using hint = 'plan_compra_version_cifras';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  -- El bloqueo del plan: quien cambia el plan se pone en fila.
  for v_plan in select p.* from retail.planes_compra p where p.id = p_plan_id for update loop
    exit;
  end loop;
  if v_plan.id is null then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  v_lineas := retail.fn_plan_compra_lineas_json(p_plan_id);
  if v_lineas = '[]'::jsonb then
    raise exception 'El plan todavía no tiene categorías: no hay nada que guardar como versión.' using hint = 'plan_compra_version_vacia';
  end if;
  v_ultima := (select v.huella from retail.planes_compra_versiones v where v.plan_id = p_plan_id order by v.numero desc limit 1);
  if v_ultima is not distinct from retail.fn_plan_compra_huella(v_lineas, v_plan.precio_de_la_plata, v_plan.tope_inversion) then
    raise exception 'El plan no cambió desde la última versión: no hay nada nuevo que guardar.' using hint = 'plan_compra_sin_cambios';
  end if;
  v_numero := retail.fn_plan_compra_nueva_version(p_plan_id, nullif(v_nota, ''), 'manual', null, p_prendas, p_inversion, v_persona);
  return jsonb_build_object('plan_id', p_plan_id, 'numero', v_numero);
end;
$$;
revoke all on function retail.guardar_plan_compra_version(uuid, text, integer, numeric) from public, anon;
grant execute on function retail.guardar_plan_compra_version(uuid, text, integer, numeric) to authenticated;
comment on function retail.guardar_plan_compra_version(uuid, text, integer, numeric) is
  'ADR-0523: guarda una versión (un punto de control) del plan de campaña: la foto de las categorías con sus supuestos, el precio de la plata y el tope. Se niega si el plan no cambió desde la última versión o no tiene categorías. p_prendas / p_inversion: lo que la pantalla mostró. Pide el módulo plan_compra; firma el responsable del combo. Devuelve {plan_id, numero}.';

-- «Usar el plan con tope»: guarda el precio de la plata y el tope y deja la versión, todo junto. Si el plan de hoy tenía algo sin versión, antes se guarda como versión
-- automática: «la actual queda guardada para volver» es verdad.
create or replace function retail.usar_plan_compra_con_tope(
  p_plan_id uuid,
  p_precio_de_la_plata numeric,
  p_tope numeric,
  p_nota text default null,
  p_prendas integer default null,
  p_inversion numeric default null,
  p_prendas_antes integer default null,
  p_inversion_antes numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_nota text := coalesce(btrim(p_nota), '');
  v_precio numeric(8, 3) := round(p_precio_de_la_plata, 3);
  v_tope numeric(12, 2) := round(p_tope, 2);
  v_plan retail.planes_compra%rowtype;
  v_antes integer;
  v_numero integer;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Usar el plan con tope necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if v_precio is null or v_precio < -1 or v_precio > 50 then
    raise exception 'El precio de la plata tiene que estar entre −1 y 50.' using hint = 'plan_compra_precio_de_la_plata';
  end if;
  if v_tope is null or v_tope <= 0 or v_tope > 9999999999 then
    raise exception 'El tope tiene que ser mayor que cero.' using hint = 'plan_compra_tope';
  end if;
  if char_length(v_nota) > 120 then
    raise exception 'La nota de la versión es demasiado larga (máximo 120 letras).' using hint = 'plan_compra_version_nota';
  end if;
  if (p_prendas is not null and p_prendas < 0) or (p_inversion is not null and p_inversion < 0)
     or (p_prendas_antes is not null and p_prendas_antes < 0) or (p_inversion_antes is not null and p_inversion_antes < 0) then
    raise exception 'Las prendas y la inversión de la versión no pueden ser negativas.' using hint = 'plan_compra_version_cifras';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  for v_plan in select p.* from retail.planes_compra p where p.id = p_plan_id for update loop
    exit;
  end loop;
  if v_plan.id is null then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  if retail.fn_plan_compra_lineas_json(p_plan_id) = '[]'::jsonb then
    raise exception 'El plan todavía no tiene categorías: no hay plan que ajustar al tope.' using hint = 'plan_compra_version_vacia';
  end if;
  if v_plan.precio_de_la_plata = v_precio and v_plan.tope_inversion is not distinct from v_tope then
    raise exception 'El plan ya está así: mismo tope y mismo precio de la plata.' using hint = 'plan_compra_sin_cambios';
  end if;

  v_antes := retail.fn_plan_compra_proteger_lo_de_hoy(p_plan_id, 'Antes de usar el plan con tope', p_prendas_antes, p_inversion_antes, v_persona);

  update retail.planes_compra
     set precio_de_la_plata = v_precio,
         tope_inversion = v_tope,
         -- Mismo rastro que `guardar_plan_compra_tope`: quién y cuándo (solo si el tope cambió de verdad).
         tope_actualizado_por = case when tope_inversion is distinct from v_tope then v_persona else tope_actualizado_por end,
         tope_actualizado_en = case when tope_inversion is distinct from v_tope then now() else tope_actualizado_en end
   where id = p_plan_id;

  v_numero := retail.fn_plan_compra_nueva_version(p_plan_id, nullif(v_nota, ''), 'plan_con_tope', null, p_prendas, p_inversion, v_persona);
  return jsonb_build_object('plan_id', p_plan_id, 'numero', v_numero, 'automatica', v_antes, 'precio_de_la_plata', v_precio, 'tope', v_tope);
end;
$$;
revoke all on function retail.usar_plan_compra_con_tope(uuid, numeric, numeric, text, integer, numeric, integer, numeric) from public, anon;
grant execute on function retail.usar_plan_compra_con_tope(uuid, numeric, numeric, text, integer, numeric, integer, numeric) to authenticated;
comment on function retail.usar_plan_compra_con_tope(uuid, numeric, numeric, text, integer, numeric, integer, numeric) is
  'ADR-0523: «Usar el plan con tope»: guarda el precio de la plata y el tope del plan y deja su versión, en una transacción. Si el plan de hoy tenía cambios sin versión, antes los guarda como versión automática (p_prendas_antes / p_inversion_antes: lo que la pantalla mostraba). Se niega si no cambia nada o el plan no tiene categorías. Bloquea la fila del plan. Pide el módulo plan_compra; firma el responsable del combo. Devuelve {plan_id, numero, automatica, precio_de_la_plata, tope}.';

-- «Volver a esta versión»: NO borra nada. Pone las categorías, el precio de la plata y el tope como los tenía la versión elegida y deja una versión NUEVA
-- que lo dice. Las categorías que se armaron después de esa versión no estaban en su foto: se quedan como están. Solo se reescribe lo que de verdad cambió.
create or replace function retail.restaurar_plan_compra_version(
  p_plan_id uuid,
  p_numero integer,
  p_nota text default null,
  p_prendas integer default null,
  p_inversion numeric default null,
  p_prendas_antes integer default null,
  p_inversion_antes numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_nota text := coalesce(btrim(p_nota), '');
  v_plan retail.planes_compra%rowtype;
  v_ver retail.planes_compra_versiones%rowtype;
  v_lineas jsonb;
  v_huella text;
  v_antes integer;
  v_numero integer;
  v_e jsonb;
  v_id uuid;
  v_cambiadas integer := 0;
  v_cambia_el_plan boolean;
begin
  if retail.fn_ve_modulo('plan_compra') is not true then
    raise exception 'Volver a una versión del plan necesita el módulo «Plan de campaña» en tu rol'
      using errcode = '42501', hint = 'plan_compra_sin_modulo';
  end if;
  if char_length(v_nota) > 120 then
    raise exception 'La nota de la versión es demasiado larga (máximo 120 letras).' using hint = 'plan_compra_version_nota';
  end if;
  if (p_prendas is not null and p_prendas < 0) or (p_inversion is not null and p_inversion < 0)
     or (p_prendas_antes is not null and p_prendas_antes < 0) or (p_inversion_antes is not null and p_inversion_antes < 0) then
    raise exception 'Las prendas y la inversión de la versión no pueden ser negativas.' using hint = 'plan_compra_version_cifras';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;
  for v_plan in select p.* from retail.planes_compra p where p.id = p_plan_id for update loop
    exit;
  end loop;
  if v_plan.id is null then
    raise exception 'Ese plan de campaña no existe' using hint = 'plan_compra_inexistente';
  end if;
  for v_ver in select x.* from retail.planes_compra_versiones x where x.plan_id = p_plan_id and x.numero = p_numero loop
    exit;
  end loop;
  if v_ver.id is null then
    raise exception 'Esa versión del plan no existe' using hint = 'plan_compra_version_inexistente';
  end if;
  -- ¿El plan de hoy ya es esa versión? Entonces no hay a qué volver.
  v_lineas := retail.fn_plan_compra_lineas_json(p_plan_id);
  v_huella := retail.fn_plan_compra_huella(v_lineas, v_plan.precio_de_la_plata, v_plan.tope_inversion);
  if v_huella = v_ver.huella then
    raise exception 'El plan ya está como la versión %.', p_numero using hint = 'plan_compra_sin_cambios';
  end if;

  v_antes := retail.fn_plan_compra_proteger_lo_de_hoy(p_plan_id, format('Antes de volver a la versión %s', p_numero), p_prendas_antes, p_inversion_antes, v_persona);
  v_cambia_el_plan := v_plan.precio_de_la_plata is distinct from v_ver.precio_de_la_plata or v_plan.tope_inversion is distinct from v_ver.tope;

  update retail.planes_compra
     set precio_de_la_plata = v_ver.precio_de_la_plata,
         tope_inversion = v_ver.tope,
         tope_actualizado_por = case when tope_inversion is distinct from v_ver.tope then v_persona else tope_actualizado_por end,
         tope_actualizado_en = case when tope_inversion is distinct from v_ver.tope then now() else tope_actualizado_en end
   where id = p_plan_id;

  -- Las categorías de la foto: solo se escribe la que cambió (o la que ya no está). El historial de cada una se escribe aquí mismo, como al guardarla a mano.
  for v_e in select e.value from jsonb_array_elements(v_ver.lineas) e loop
    v_id := null;
    insert into retail.planes_compra_lineas as l
      (plan_id, categoria_id, flojo, normal, bueno, precio, costo, recupero_pct, descuento_pct, curva, nota, actualizado_por, updated_at)
    values
      (p_plan_id, (v_e->>'categoria_id')::uuid, (v_e->>'flojo')::integer, (v_e->>'normal')::integer, (v_e->>'bueno')::integer,
       (v_e->>'precio')::numeric, (v_e->>'costo')::numeric, (v_e->>'recupero_pct')::integer, (v_e->>'descuento_pct')::numeric,
       coalesce(v_e->'curva', '{}'::jsonb), nullif(v_e->>'nota', ''), v_persona, now())
    on conflict (plan_id, categoria_id) do update
       set flojo = excluded.flojo, normal = excluded.normal, bueno = excluded.bueno, precio = excluded.precio, costo = excluded.costo,
           recupero_pct = excluded.recupero_pct, descuento_pct = excluded.descuento_pct, curva = excluded.curva, nota = excluded.nota,
           actualizado_por = excluded.actualizado_por, updated_at = excluded.updated_at
     where (l.flojo, l.normal, l.bueno, l.precio, l.costo, l.recupero_pct, l.descuento_pct, l.curva, l.nota)
           is distinct from (excluded.flojo, excluded.normal, excluded.bueno, excluded.precio, excluded.costo, excluded.recupero_pct, excluded.descuento_pct, excluded.curva, excluded.nota)
    returning l.id into v_id;
    if v_id is not null then
      perform retail.fn_plan_compra_linea_al_historial(v_id, null);
      v_cambiadas := v_cambiadas + 1;
    end if;
  end loop;

  -- Si el plan solo difería en categorías que se armaron DESPUÉS (no están en la foto), no hay a qué volver: se deshace todo (también la automática).
  if not v_cambia_el_plan and v_cambiadas = 0 then
    raise exception 'El plan ya está como la versión %: lo único distinto son categorías que armaste después.', p_numero using hint = 'plan_compra_sin_cambios';
  end if;

  v_numero := retail.fn_plan_compra_nueva_version(p_plan_id, coalesce(nullif(v_nota, ''), format('Volví a la versión %s', p_numero)), 'restauracion', p_numero, p_prendas, p_inversion, v_persona);
  return jsonb_build_object('plan_id', p_plan_id, 'numero', v_numero, 'automatica', v_antes, 'restaurada_de', p_numero, 'categorias_cambiadas', v_cambiadas);
end;
$$;
revoke all on function retail.restaurar_plan_compra_version(uuid, integer, text, integer, numeric, integer, numeric) from public, anon;
grant execute on function retail.restaurar_plan_compra_version(uuid, integer, text, integer, numeric, integer, numeric) to authenticated;
comment on function retail.restaurar_plan_compra_version(uuid, integer, text, integer, numeric, integer, numeric) is
  'ADR-0523: vuelve a una versión del plan SIN borrar nada: pone las categorías, el precio de la plata y el tope como los tenía la versión elegida (solo reescribe lo que cambió, y deja el historial de cada categoría) y crea una versión NUEVA. Las categorías armadas después de esa versión no se tocan. Si el plan de hoy tenía cambios sin versión, antes los guarda como versión automática. Se niega si el plan ya está así. Bloquea la fila del plan. Pide el módulo plan_compra; firma el responsable del combo. Devuelve {plan_id, numero, automatica, restaurada_de, categorias_cambiadas}.';

reset lock_timeout;
notify pgrst, 'reload schema';
