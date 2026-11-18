-- ============================================================================
-- 20261029031000_danadas_lugar_de_la_sede.sql — CAYLA V2 · ADR-0564, actividad 2 (Felipe, 2026-10-28)
-- Cada tienda dice DÓNDE deja físicamente las prendas dañadas («perchero detrás de caja»), y el sistema lo muestra.
--
-- EL PROBLEMA PRIMERO. La «cuarentena» del sistema es un lugar lógico: dice que la prenda ya no se vende, pero no dónde está en la
-- tienda. Las tiendas no tienen un lugar fijo para las dañadas: cada colaboradora la deja donde cabe, y a la hora de llevarlas a
-- arreglar nadie sabe si faltan o dónde buscarlas. El sistema ya mueve la prenda a la cuarentena; falta que diga dónde dejarla.
--
-- DECISIÓN DE FELIPE (2026-10-28, ADR-0564): cada sede marca su lugar y el sistema lo muestra al reportar y en la lista de Dañadas.
--
-- QUÉ HACE.
--   1. `sububicaciones` gana `lugar` (texto libre, 3 a 80 letras, o null), `lugar_por` y `lugar_en` (quién lo marcó y cuándo).
--      Solo se usa en la sububicación de tipo 'cuarentena'; en el resto queda null.
--   2. `definir_lugar_danadas(p_ubicacion_id, p_lugar)`: lo marca o lo borra (texto vacío). Quien ve Existencias y opera esa sede,
--      firmado por el responsable. Por naturaleza es idempotente (repetirlo deja lo mismo): no pide marca de reintento.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · un lugar de 1 o 2 letras, o de más de 80 (CHECK);
--   · un lugar marcado por alguien que no opera esa sede o no ve Existencias (la función lo rechaza antes).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual en el SQL Editor (trae `retail.` y su `search_path`), ANTES de publicar la
-- web. Si la web sale primero, todo sigue en pie: la lectura del lugar nunca lanza (sin la columna, no hay lugar) y solo «Marcar el
-- lugar» falla al usarse. Sin políticas ni `drop trigger` (ADR-0195 no aplica). El `alter table` toma un candado breve sobre
-- `sububicaciones` (lock_timeout 3 s: si no lo consigue falla sin daño y se vuelve a pegar). Idempotente.
-- Cómo se verifica después:
--   select ubicacion_id, nombre, lugar from retail.sububicaciones where tipo = 'cuarentena';
--
-- SE ROMPE SI: una tienda nace sin sububicación 'cuarentena' (hoy la crea `seed.sql` y `activacion-cuarentena-produccion.sql`):
-- marcar el lugar dice «esta sede no tiene cuarentena» y la pantalla no ofrece el botón.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.sububicaciones add column if not exists lugar text;
alter table retail.sububicaciones add column if not exists lugar_por uuid;
alter table retail.sububicaciones add column if not exists lugar_en timestamptz;

comment on column retail.sububicaciones.lugar is
  'ADR-0564: DÓNDE deja físicamente la tienda las prendas dañadas («perchero detrás de caja»). Solo en la sububicación de tipo cuarentena; null en el resto y en las sedes que aún no lo marcaron. Lo escribe solo definir_lugar_danadas.';

alter table retail.sububicaciones drop constraint if exists sububicaciones_lugar_valido;
alter table retail.sububicaciones add constraint sububicaciones_lugar_valido
  check (lugar is null or char_length(btrim(lugar)) between 3 and 80);

create or replace function retail.definir_lugar_danadas(p_ubicacion_id uuid, p_lugar text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_lugar text := nullif(btrim(coalesce(p_lugar, '')), '');
  v_cuarentena uuid;
  v_actor uuid;
begin
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes marcar el lugar de las prendas dañadas: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using errcode = '42501', hint = 'lugar_sin_modulo';
  end if;
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes marcar el lugar de las dañadas en esa tienda: no es tu sede.' using hint = 'lugar_sin_tienda';
  end if;
  if v_lugar is not null and (char_length(v_lugar) < 3 or char_length(v_lugar) > 80) then
    raise exception 'El lugar debe tener entre 3 y 80 letras («perchero detrás de caja»).' using hint = 'lugar_invalido';
  end if;
  v_cuarentena := (select s.id from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'cuarentena');
  if v_cuarentena is null then
    raise exception 'Esta sede no separa las prendas dañadas: aquí no se marca un lugar para ellas.' using hint = 'lugar_sede_sin_cuarentena';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  update sububicaciones set lugar = v_lugar, lugar_por = v_actor, lugar_en = now() where id = v_cuarentena;

  return jsonb_build_object('lugar', v_lugar);
end;
$fn$;

comment on function retail.definir_lugar_danadas(uuid, text) is
  'ADR-0564: marca (o borra, con texto vacío) el lugar físico donde la tienda deja las prendas dañadas, en su sububicación cuarentena. Pide el módulo Existencias y operar la sede; firma el responsable. Idempotente.';

revoke all on function retail.definir_lugar_danadas(uuid, text) from public, anon;
grant execute on function retail.definir_lugar_danadas(uuid, text) to authenticated;

notify pgrst, 'reload schema';
