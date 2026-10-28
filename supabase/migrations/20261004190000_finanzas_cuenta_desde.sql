-- ============================================================================
-- 20261004190000 — Finanzas cuenta DESDE una fecha: lo anterior al arranque no entra a los estados (ADR-0332)
--
-- EL PROBLEMA PRIMERO (Felipe, 2026-10-04): el sistema arrancó en octubre. En septiembre hubo 15 ventas de piloto (S/ 1,128)
-- y NINGÚN gasto registrado, pero Finanzas ▸ Resumen decía «Utilidad de septiembre –S/ 39,613» y «TRU perdió S/ 23,120»:
-- todo era la planilla de Dynamic del período 29-ago a 28-sep contra ventas que casi no existían. Un número que no dice nada
-- del negocio y que, además, disparaba avisos («CAYLA no llegó a cubrir sus costos») y pedía cerrar un septiembre vacío.
--
-- LA REGLA (una sola fecha, la decide el líder):
--   · `parametros_finanzas.inicio_finanzas` — siempre el día 1 de un mes (un primer mes a medias no se puede cerrar), o nulo
--     = sin corte (así queda hasta que alguien la ponga: esta migración NO cambia ningún número por sí sola).
--   · El DIARIO (`fn_asientos`) y el Estado de resultados (`fn_estado_resultados`) no cuentan nada anterior a esa fecha: un
--     rango que termina antes devuelve vacío, uno que la cruza arranca en ella. De ahí leen Resumen, Reportes, Balance y
--     Cierre, así que un solo punto corta a todos (Brooks: una mente).
--   · «Lo que ya pasó» del Flujo de caja no lista la planilla pagada antes de esa fecha.
--
-- LO QUE A PROPÓSITO NO SE CORTA (esto es lo importante; un corte a ciegas escondería plata real):
--   · LA PROYECCIÓN de caja (`fn_flujo_caja_proyeccion`): usa la última planilla pagada como estimado de la que viene. La planilla
--     de octubre (29-sep a 28-oct) SE PAGARÁ aunque el sistema sea nuevo; sin ella, «16 días de caja» y el aviso de la semana
--     26-oct a 1-nov bajo el mínimo (S/ 30,062) desaparecerían.
--   · Los IMPUESTOS (`fn_impuestos_*`): el IGV de septiembre se declara a SUNAT en octubre aunque Finanzas «arranque» en octubre.
--   · La vista `planilla_por_sede` y Eficiencia del Taller: el costo por prenda necesita los sueldos de septiembre.
--   · El dinero (cuentas, cajas, conciliación) y lo que se debe (Por pagar): son saldos reales, no un período.
--
-- CONTRATO de `guardar_inicio_finanzas(p_fecha)`: promete fijar (o quitar) la fecha, dejar el antes/después en
-- `configuracion_historial` con el responsable, y no borrar ni editar nada ya registrado — solo cambia lo que las pantallas
-- cuentan. Asume: quien llama tiene el módulo «Configuración»; la fecha es día 1, no es futura, y NO hay ningún mes cerrado
-- (un mes cerrado congeló su diario con el corte de entonces; moverlo después lo haría mentir. Se reabre primero).
--
-- ESTADOS IMPOSIBLES: un primer mes a medias (`check` de la columna); un corte en el futuro que esconda el mes en curso
-- (la función); un corte movido bajo un mes ya cerrado (la función).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA EJECUCIÓN, con el prefijo `retail.` ya escrito. `alter table retail.parametros_finanzas`
-- (una fila, solo la leen funciones de Finanzas) con `lock_timeout = 3s`; sin políticas ni disparadores, así que no toma las
-- tablas de `auth`/`storage` (ADR-0195, «Políticas y deadlocks»). Las 4 funciones vivas se reescriben desde SU definición en
-- la base (`pg_get_functiondef`), cambiando solo la línea ancla; si alguna no trae el texto esperado exactamente una vez, la
-- migración ABORTA entera. Antes de escribirla se comprobó en producción (2026-10-04, solo lectura): cada ancla aparece UNA vez.
-- Pegarla dos veces no hace nada la segunda. Probada con `pnpm pruebas:finanzas-arranque`.
--
-- SE ROMPE SI: (1) Dynamic marca «pagado» el período de octubre DESPUÉS de que cierres octubre: octubre saldría sin sueldos y
-- parecería ganancia (el chequeo «planilla» del Cierre ya lo avisa); (2) una migración futura recrea `fn_asientos` o
-- `fn_estado_resultados` copiando un texto viejo del repo: devuelve el corte sin avisar (lo vigila `finanzas_arranque.mjs`).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. La columna ---------------------------------------------------------------------------------------------------------
alter table retail.parametros_finanzas
  add column if not exists inicio_finanzas date
    constraint parametros_finanzas_inicio_primer_dia check (inicio_finanzas is null or extract(day from inicio_finanzas) = 1);
comment on column retail.parametros_finanzas.inicio_finanzas is
  'Desde cuándo cuenta Finanzas (ADR-0332): el diario, el Estado de resultados, el Balance y el Cierre no miran nada anterior. Siempre día 1 de un mes. Nulo = sin corte.';

-- 2. La pregunta (de uso interno: la leen las funciones de Finanzas, que ya piden su permiso) -----------------------------
create or replace function retail.fn_finanzas_desde()
returns date
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select p.inicio_finanzas from retail.parametros_finanzas p where p.id; $$;
comment on function retail.fn_finanzas_desde() is
  'USO INTERNO (ADR-0332): el día desde el que cuenta Finanzas, o nulo si no hay corte.';
revoke all on function retail.fn_finanzas_desde() from public, anon, authenticated;

-- 3. Fijarla o quitarla ---------------------------------------------------------------------------------------------------
create or replace function retail.guardar_inicio_finanzas(p_fecha date)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid := retail.fn_actor_persona_id(true);
  v_antes date;
begin
  if not retail.fn_puede_configurar() then
    raise exception 'Cambiar desde cuándo cuenta Finanzas necesita el módulo «Configuración» en tu rol.' using errcode = 'P0001';
  end if;
  if p_fecha is not null and extract(day from p_fecha) <> 1 then
    raise exception 'Finanzas arranca el día 1 de un mes: un primer mes a medias no se puede cerrar.' using errcode = 'P0001';
  end if;
  if p_fecha is not null and p_fecha > retail.fn_hoy_lima() then
    raise exception 'Finanzas no puede arrancar en el futuro: esconderías el mes en curso.' using errcode = 'P0001';
  end if;
  select p.inicio_finanzas into v_antes from retail.parametros_finanzas p where p.id for update;
  if v_antes is not distinct from p_fecha then
    return;
  end if;
  if exists (select 1 from retail.periodos x where x.estado = 'cerrado') then
    raise exception 'Ya hay meses cerrados: un mes cerrado congeló su diario con el corte de entonces. Reábrelos antes de mover desde cuándo cuenta Finanzas.' using errcode = 'P0001';
  end if;
  update retail.parametros_finanzas set inicio_finanzas = p_fecha, actualizado_por = v_actor, actualizado_en = now() where id;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('inicio_finanzas', jsonb_build_object('antes', v_antes, 'despues', p_fecha), v_actor);
end $$;
comment on function retail.guardar_inicio_finanzas(date) is
  'ADR-0332: fija (o quita, con nulo) desde qué día cuenta Finanzas. Día 1, no futuro, sin meses cerrados; deja el antes/después en configuracion_historial.';
revoke all on function retail.guardar_inicio_finanzas(date) from public, anon;
grant execute on function retail.guardar_inicio_finanzas(date) to authenticated;

-- 4. El corte, en las funciones vivas ------------------------------------------------------------------------------------
-- Cambia `p_viejo` por `p_nuevo` en la única función `retail.<p_nombre>`. Exige que `p_viejo` aparezca exactamente una vez;
-- si la función ya trae `p_nuevo`, se salta. Nombre propio para no chocar con otras migraciones en la
-- misma sesión (el `pg_temp` se comparte).
create function pg_temp.reemplazar_arranque(p_nombre text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $$
declare
  v_oids oid[];
  v_def text;
  v_veces int;
begin
  select array_agg(p.oid) into v_oids from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = p_nombre;
  if coalesce(cardinality(v_oids), 0) <> 1 then
    raise exception 'ADR-0332: se esperaba una sola función retail.% y hay %', p_nombre, coalesce(cardinality(v_oids), 0);
  end if;
  v_def := pg_get_functiondef(v_oids[1]);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception 'ADR-0332: retail.% trae % veces «%» (se esperaba 1): la base no es la que se revisó, no se toca nada',
      p_nombre, v_veces, p_viejo;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$$;

-- 4a. El diario y el Estado de resultados: lo anterior al corte no entra; un rango que lo cruza arranca en él.
select pg_temp.reemplazar_arranque(f, 'v_todo := v_lider and p_ubicacion_id is null;',
$r$v_todo := v_lider and p_ubicacion_id is null;
  -- ADR-0332: Finanzas cuenta desde `parametros_finanzas.inicio_finanzas`. Lo anterior no entra; un rango que termina antes
  -- no devuelve nada y uno que la cruza arranca en ella.
  if retail.fn_finanzas_desde() is not null then
    if p_hasta < retail.fn_finanzas_desde() then
      return;
    end if;
    p_desde := greatest(p_desde, retail.fn_finanzas_desde());
  end if;$r$)
from unnest(array['fn_asientos', 'fn_estado_resultados']) f;

-- 4b. «Lo que ya pasó» del Flujo: la planilla pagada antes del corte no se lista (la proyección NO se toca: ver arriba).
select pg_temp.reemplazar_arranque('fn_flujo_caja_real', 'where p.fecha_fin between p_desde and v_hasta',
  'where p.fecha_fin between greatest(p_desde, coalesce(retail.fn_finanzas_desde(), p_desde)) and v_hasta');

-- 4c. La lectura de Caja y avisos trae también el corte (el Resumen ya la lleva en `parametros`).
select pg_temp.reemplazar_arranque('fn_parametros_finanzas', '''actualizado_en'', p.actualizado_en)',
  '''actualizado_en'', p.actualizado_en, ''inicio_finanzas'', p.inicio_finanzas)');

drop function pg_temp.reemplazar_arranque(text, text, text);

reset lock_timeout;
