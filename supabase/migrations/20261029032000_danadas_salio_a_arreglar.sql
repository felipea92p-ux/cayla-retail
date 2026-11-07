-- ============================================================================
-- 20261029032000_danadas_salio_a_arreglar.sql — CAYLA V2 · ADR-0564, actividad 4 (Felipe, 2026-10-28)
-- Dañadas: «Salió a arreglar» — la prenda separada sale de la tienda a arreglarse, cerca o en el Taller, y la lista lo sabe.
--
-- EL PROBLEMA PRIMERO. Hasta hoy una dañada pasaba de «en cuarentena» directo a «se arregló»: el tiempo que la prenda está FUERA de la
-- tienda (en manos de una costurera, o camino al Taller de Lima) no existía en el sistema. Nadie podía contestar «¿dónde está esa
-- blusa?» ni «¿cuánto lleva fuera?», y una prenda olvidada en el Taller se veía igual que una que sigue colgada en el perchero de las
-- dañadas. No se lleva a un envío formal (decisión de Felipe: la lleva quien pase por el almacén): basta marcar que salió.
--
-- DECISIÓN DE FELIPE (2026-10-28, ADR-0564): «Salió a arreglar» registra la salida, con la ruta (cerca o Taller de CAYLA, depende del daño),
-- y la lista de Dañadas muestra «En arreglo · Taller · hace 3 días».
--
-- QUÉ HACE.
--   1. `prendas_danadas` gana `en_arreglo_desde`, `ruta_arreglo` ('cerca' | 'taller') y `sacada_por`: cuándo salió, hacia dónde y quién
--      la sacó. La prenda NO se mueve de la cuarentena en el inventario (sigue en la sede para el stock: no está a la venta y el
--      conteo la ve donde estaba); lo que cambia es dónde está físicamente, y eso lo dice la fila. Un CHECK impide una ruta sin fecha
--      o una fecha sin ruta.
--   2. `sacar_danada_a_arreglar(p_id, p_ruta, p_nota)`: marca la salida. Quien ve Existencias y opera la sede de la prenda (como todas las
--      salidas de Dañadas, ADR-0534), firmado por el responsable. La nota (opcional, hasta 200) queda en `nota_arreglo`.
--      Repetirla con la misma ruta devuelve `ya_registrada` sin cambiar nada (un doble toque o un reintento tras un corte); con otra
--      ruta dice que ya está en arreglo.
--
-- DIFERENCIA CON EL PLAN APROBADO. El plan decía «solo el líder»; se deja a quien ve Existencias (ADR-0534, 2026-10-27, quitó la
-- validación del líder de resolver/liquidar): las cuentas de almacén y de caja, que son las que llevan la prenda, nunca son líder.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · una ruta de arreglo fuera de la lista, o una ruta sin fecha de salida (CHECK);
--   · una prenda ya resuelta (liquidada, botada, donada, devuelta o arreglada) que se marca como «salió a arreglar» (la función lo rechaza).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual en el SQL Editor (trae `retail.` y su `search_path`), ANTES de publicar la web. Si la
-- web sale primero, nada se rompe: la lista lee la salida aparte y, sin las columnas, no marca a nadie en arreglo; solo «Salió a arreglar»
-- falla al usarse. Sin políticas ni `drop trigger` (ADR-0195 no aplica). El `alter table` toma un candado breve sobre `prendas_danadas`
-- (lock_timeout 3 s: si no lo consigue falla sin daño y se vuelve a pegar). Idempotente.
-- Cómo se verifica después:
--   select estado, ruta_arreglo, count(*) from retail.prendas_danadas group by 1, 2;
--
-- SE ROMPE SI: alguien resuelve la prenda por otra puerta mientras está fuera (Se botó, Liquidada…): la fila conserva `en_arreglo_desde`
-- como historia y la lista deja de mostrarla porque ya no está en cuarentena; no hay estado imposible, solo un dato de más.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.prendas_danadas add column if not exists en_arreglo_desde timestamptz;
alter table retail.prendas_danadas add column if not exists ruta_arreglo text;
alter table retail.prendas_danadas add column if not exists sacada_por uuid;
alter table retail.prendas_danadas add column if not exists nota_arreglo text;

comment on column retail.prendas_danadas.en_arreglo_desde is
  'ADR-0564: cuándo salió la prenda de la tienda a arreglarse (sacar_danada_a_arreglar). Null mientras sigue en la tienda. Queda como historia aunque la prenda se resuelva después.';
comment on column retail.prendas_danadas.ruta_arreglo is
  'ADR-0564: hacia dónde salió a arreglarse: cerca (una costurera cercana) o taller (el Taller de CAYLA en Lima). Va siempre junto con en_arreglo_desde.';

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_ruta_arreglo_valida;
alter table retail.prendas_danadas add constraint prendas_danadas_ruta_arreglo_valida
  check ((en_arreglo_desde is null) = (ruta_arreglo is null) and (ruta_arreglo is null or ruta_arreglo in ('cerca', 'taller')));

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_nota_arreglo_valida;
alter table retail.prendas_danadas add constraint prendas_danadas_nota_arreglo_valida
  check (nota_arreglo is null or char_length(btrim(nota_arreglo)) between 3 and 200);

create or replace function retail.sacar_danada_a_arreglar(p_id uuid, p_ruta text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  pd prendas_danadas%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_actor uuid;
begin
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes sacar prendas a arreglar: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using errcode = '42501', hint = 'arreglo_sin_modulo';
  end if;
  if p_ruta is null or p_ruta not in ('cerca', 'taller') then
    raise exception 'Elige quién la arregla: cerca de la tienda o el Taller de CAYLA.' using hint = 'arreglo_ruta_invalida';
  end if;
  if v_nota is not null and (char_length(v_nota) < 3 or char_length(v_nota) > 200) then
    raise exception 'La nota debe tener entre 3 y 200 letras, o déjala vacía.' using hint = 'arreglo_nota_invalida';
  end if;

  -- La fila, con candado: dos personas que la sacan a la vez se esperan, y la segunda ve la salida de la primera.
  select * into pd from prendas_danadas where id = p_id for update;
  if not found then
    raise exception 'Esa prenda dañada ya no está en la lista. Recarga la pantalla.' using hint = 'arreglo_no_existe';
  end if;
  if not fn_puede_operar_ubicacion(pd.ubicacion_id) then
    raise exception 'No puedes sacar a arreglar una prenda de esa tienda: no es tu sede.' using hint = 'arreglo_sin_tienda';
  end if;
  if pd.estado <> 'en_cuarentena' then
    raise exception 'Esta prenda ya se resolvió. Recarga la pantalla.' using hint = 'arreglo_ya_resuelta';
  end if;
  if pd.en_arreglo_desde is not null then
    -- Un doble toque o un reintento tras un corte de red: lo mismo, sin cambiar nada. Otra ruta es otra decisión.
    if pd.ruta_arreglo = p_ruta then
      return jsonb_build_object('ya_registrada', true, 'id', pd.id, 'ruta', pd.ruta_arreglo);
    end if;
    raise exception 'Esta prenda ya salió a arreglar (%). Si cambió de manos, avísale al líder.',
      case pd.ruta_arreglo when 'taller' then 'al Taller de CAYLA' else 'cerca de la tienda' end
      using hint = 'arreglo_ya_en_arreglo';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  update prendas_danadas
     set en_arreglo_desde = now(), ruta_arreglo = p_ruta, sacada_por = v_actor, nota_arreglo = v_nota
   where id = p_id;

  return jsonb_build_object('ya_registrada', false, 'id', p_id, 'ruta', p_ruta);
end;
$fn$;

comment on function retail.sacar_danada_a_arreglar(uuid, text, text) is
  'ADR-0564: «Salió a arreglar». Marca que la prenda dañada en cuarentena salió de la tienda a arreglarse (ruta: cerca o taller), con quién la sacó y una nota opcional. No mueve stock: sigue en la cuarentena de la sede. Quien ve Existencias y opera la sede; firma el responsable. Repetir la misma ruta devuelve ya_registrada.';

revoke all on function retail.sacar_danada_a_arreglar(uuid, text, text) from public, anon;
grant execute on function retail.sacar_danada_a_arreglar(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
