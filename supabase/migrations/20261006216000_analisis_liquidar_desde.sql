-- ============================================================================
-- 20261006216000 — Análisis: «Liquidar desde», uno para todas las tiendas y todas las personas (ADR-0356, actividad 4)
--
-- EL PROBLEMA PRIMERO. En «No se vende», una prenda quieta pasa de «Vigílalas» a «Liquidar» cuando lleva N días sin venderse.
--   Felipe (2026-10-06): ese N no es fijo; se mueve con el control del carril (de 30 a 85 días, 60 de fábrica) y lo que se guarda
--   vale para TODAS las tiendas y TODAS las personas. Hasta hoy la web lo tenía escrito en el código (60, `LIQUIDAR_DEFECTO`):
--   mover el control solo cambiaba la vista de quien lo movía y se perdía al recargar.
--
-- LAS REGLAS
--   · Un solo valor para la red: `parametros_analisis` (una sola fila, `id = true`, como `parametros_finanzas`).
--   · Lo cambia quien ve Análisis (`fn_puede_analizar`: el líder o un rol con el módulo Análisis): «para todos», decisión de Felipe.
--     No es «solo del líder».
--   · Firma con el responsable del combo (`fn_actor_persona_id(true)`, ADR-0162) y deja el antes y el después en
--     `configuracion_historial` (que alimenta Actividad). Guardar el mismo valor no escribe nada.
--   · Lo lee toda cuenta de retail (`fn_tiene_acceso_retail`): es un número de trabajo, sin dinero ni prendas.
--
-- DECIDÍ: tabla propia y no una columna de `configuracion_empresa`. (1) `configuracion_empresa` es la identidad fiscal: su fila
--   exige RUC y razón social, y donde todavía no se cargaron (la base local, el CI) no hay fila que actualizar: «Liquidar desde» no
--   se podría guardar. Aquí la fila nace con la migración, con su valor de fábrica. (2) Toda venta lee `configuracion_empresa`
--   (`fn_exige_responsable`): agregarle una columna es un `alter` de una tabla en uso, que en producción va solo en su parte. Una
--   tabla nueva no toma el candado de ninguna tabla de la tienda: se pega de una vez. (3) Los próximos números de Análisis que
--   Felipe quiera mover sin deploy (la meta de «se vende lo que llega», los 90 días del rojo) tienen dónde vivir.
-- DECIDÍ: `actualizado_por` sin llave foránea a `public.personas`, como `parametros_finanzas` y `configuracion_historial`: crear esa
--   llave toma un candado sobre `personas` (de Dynamic, en uso todo el día) en la misma transacción.
--
-- ESTADOS IMPOSIBLES QUE CIERRA
--   · Un «Liquidar desde» fuera de 30–85 días (o vacío): check en la tabla, y la función lo rechaza antes con su frase.
--   · Dos valores a la vez (uno por tienda o por persona): la tabla tiene UNA fila (`id boolean` = true, check).
--   · Sin fila (nadie sabría desde cuándo se liquida): la migración la crea; la lectura vuelve a 60 si faltara, y guardar la recrea.
--   · Leerla o escribirla por fuera de las funciones: RLS encendido SIN políticas y `revoke`.
--
-- LO QUE NO SE TOCA: ninguna tabla ni función existente. `fn_actividad_configuracion` no conoce este cambio: Actividad lo anota por
--   su rama genérica («cambió la configuración: liquidar desde»), en el módulo Configuración.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA EJECUCIÓN (con el OK de Felipe): una tabla nueva, su fila y dos funciones. No hace `alter` de
--   ninguna tabla en uso ni crea políticas (no toma `auth` ni `storage`), así que no hay partes. Espera como mucho 3 s un candado.
--   Se puede pegar dos veces (idempotente). Lleva su `set search_path`: se pega tal cual.
-- SE ROMPE SI: la web nueva de Análisis se publica antes de pegar esto. No se cae: Análisis usa 60 días y lo dice en su nota
--   («No se pudo leer desde cuándo se liquida»), y «Guardar para todos» responde que todavía no se puede. Pegar ANTES de fusionar.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select id, liquidar_desde from retail.parametros_analisis;                                     → t | 60
--   select p.oid::regprocedure, p.prosecdef from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_liquidar_desde', 'guardar_liquidar_desde') order by 1;
--     → fn_liquidar_desde() | t   y   guardar_liquidar_desde(integer) | t
--   select has_function_privilege('anon', 'retail.guardar_liquidar_desde(integer)', 'execute'),
--          has_function_privilege('anon', 'retail.fn_liquidar_desde()', 'execute'),
--          has_function_privilege('authenticated', 'retail.guardar_liquidar_desde(integer)', 'execute'),
--          has_table_privilege('authenticated', 'retail.parametros_analisis', 'select');           → f | f | t | f
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El valor, uno para toda la red ----------
create table if not exists retail.parametros_analisis (
  id              boolean primary key default true,
  liquidar_desde  smallint not null default 60,
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  constraint parametros_analisis_una_fila check (id),
  constraint parametros_analisis_liquidar_desde_rango check (liquidar_desde between 30 and 85)
);
comment on table retail.parametros_analisis is
  'Análisis (ADR-0356), una sola fila: los números que Análisis usa para TODAS las tiendas y todas las personas. Se lee con fn_liquidar_desde y se cambia con guardar_liquidar_desde (firma con el responsable; antes/después en configuracion_historial). Nadie la lee directo.';
comment on column retail.parametros_analisis.liquidar_desde is
  'Desde cuántos días sin venderse una prenda quieta pasa de «Vigílalas» a «Liquidar» en «No se vende» (30 a 85; 60 de fábrica). El mismo para toda la red: lo mueve quien ve Análisis (Felipe, 2026-10-06).';
comment on column retail.parametros_analisis.actualizado_por is
  'public.personas.id de quien lo cambió por última vez: el responsable del combo (fn_actor_persona_id(true)). Null = el de fábrica.';

insert into retail.parametros_analisis (id) values (true) on conflict (id) do nothing;

-- RLS encendido y SIN políticas: nadie la lee ni la escribe directo; todo pasa por las dos funciones de abajo (security definer).
alter table retail.parametros_analisis enable row level security;
revoke all on retail.parametros_analisis from public, anon, authenticated;

-- ---------- 2. Leer: desde cuántos días se liquida ----------
-- PROMETE: un número de 30 a 85; 60 si la fila faltara. ASUME: una cuenta de retail (persona activa o terminal).
create or replace function retail.fn_liquidar_desde()
returns integer
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_tiene_acceso_retail() then
    raise exception 'Para leer desde cuándo se liquida hace falta una cuenta de retail.' using errcode = '42501', hint = 'sin_acceso_retail';
  end if;
  return coalesce((select p.liquidar_desde from retail.parametros_analisis p where p.id), 60);
end;
$$;
comment on function retail.fn_liquidar_desde() is
  'Análisis (ADR-0356): desde cuántos días sin venderse se liquida, uno para toda la red (parametros_analisis; 60 si faltara la fila). Lo lee toda cuenta de retail. Hint: sin_acceso_retail.';

-- ---------- 3. Guardar: quien ve Análisis lo cambia para todos ----------
-- PROMETE: con 30 a 85 días, deja ese valor para toda la red, firmado con el responsable, y su antes/después en
--   configuracion_historial; devuelve el valor guardado. Si ya era ese, no escribe nada (ni historial). Dos personas guardando a
--   la vez se ordenan por el candado de la fila: el «antes» de la segunda es lo que guardó la primera.
-- RECHAZA: sin Análisis (42501, analisis_sin_modulo); fuera de 30–85 (P0001, liquidar_desde_fuera_de_rango); sin responsable
--   presente donde se exige (los 42501 de fn_actor_persona_id).
create or replace function retail.guardar_liquidar_desde(p_dias integer)
returns integer
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_antes smallint;
begin
  if not coalesce(retail.fn_puede_analizar(), false) then
    raise exception 'Para cambiar desde cuándo se liquida necesitas Análisis en tu rol.' using errcode = '42501', hint = 'analisis_sin_modulo';
  end if;
  if p_dias is null or p_dias < 30 or p_dias > 85 then
    raise exception '«Liquidar desde» va de 30 a 85 días.' using errcode = 'P0001', hint = 'liquidar_desde_fuera_de_rango';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  -- La fila es una sola y se toma con candado: si faltara, se recrea con el valor de fábrica.
  insert into retail.parametros_analisis (id) values (true) on conflict (id) do nothing;
  select p.liquidar_desde into v_antes from retail.parametros_analisis p where p.id for update;
  if v_antes = p_dias then
    return p_dias;
  end if;

  update retail.parametros_analisis
     set liquidar_desde = p_dias, actualizado_por = v_actor, actualizado_en = now()
   where id;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('liquidar_desde', jsonb_build_object('antes', v_antes, 'despues', p_dias), v_actor);
  return p_dias;
end;
$$;
comment on function retail.guardar_liquidar_desde(integer) is
  'Análisis (ADR-0356): cambia «Liquidar desde» (30 a 85 días) para TODAS las tiendas y personas. Quien ve Análisis (fn_puede_analizar); firma con el responsable (fn_actor_persona_id(true)); antes/después en configuracion_historial (que = liquidar_desde). Mismo valor = no escribe. Devuelve el valor guardado. Hints: analisis_sin_modulo, liquidar_desde_fuera_de_rango.';

-- ---------- 4. Permisos ----------
revoke all on function retail.fn_liquidar_desde() from public, anon;
revoke all on function retail.guardar_liquidar_desde(integer) from public, anon;
grant execute on function retail.fn_liquidar_desde() to authenticated;
grant execute on function retail.guardar_liquidar_desde(integer) to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
