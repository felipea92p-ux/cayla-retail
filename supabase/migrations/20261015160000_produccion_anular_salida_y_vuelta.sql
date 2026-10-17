-- Producción · anular una Salida o una Vuelta mal anotada (ADR-0400, actividad 4b; decisión de Felipe, 2026-10-15).
--
-- EL PROBLEMA PRIMERO. Lo anotado en una orden solo se agrega (principio 4: nada se edita ni se borra). Eso deja sin salida a la encargada que anota
-- una Salida de 48 cuando mandó 40, o a otro servicio, o una Vuelta con buenas de más: hasta hoy se arreglaba con el líder, en la base. Felipe
-- decidió (2026-10-15, «Poder anular, con motivo»): una Salida o una Vuelta se ANULA con su motivo mientras nada haya avanzado después, y no se
-- borra: queda anotada y tachada en la línea de tiempo.
--
-- CÓMO, SIN TOCAR CADA SUMA. Anular es agregar la fila contraria, el mismo principio que «Deshacer» un avance (ADR-0400): una Salida o una Vuelta
-- de anulación (`anula_id`) lleva las mismas líneas con la cantidad en NEGATIVO, y una Vuelta anulada además deshace sus avances con filas
-- `origen = 'deshacer'`. Todas las sumas que ya existen (lo que salió, lo que volvió, lo hecho, el devengado) dan lo correcto SIN cambiar una
-- línea. Lo único que se vuelve a escribir son tres funciones que miraban «¿se anotó algo alguna vez?» y ahora miran lo NETO:
--   · `fn_fases_de_orden`: una fase «empezó» si lo neto de avances, salidas o vueltas no es cero. Una fase con todo anulado (o con un Deshacer total)
--     vuelve a «no empezó»: se puede cambiar quién la hace, que era justo el caso de «mandé al taller equivocado». Cierra la limitación que dejó
--     la actividad 3 («un Deshacer total deja la fase como empezada»).
--   · `cambiar_quien_fase` (154000): la misma regla.
--   · `fn_orden_produccion`: la línea de tiempo trae el tipo `anulacion` («Anuló la salida de 48 a X: el motivo»), esconde las filas compensatorias
--     (no son una Salida más) y marca en cada Salida y Vuelta si ya `anulada` y si es `anulable` ahora.
--
-- QUÉ CREA.
--   1. `produccion_salidas` y `produccion_vueltas` ganan `anula_id` (la que anulan; una sola anulación por fila) y `motivo` (obligatorio si anula).
--   2. Las cantidades de las líneas pueden ser negativas SOLO en una fila de anulación: un disparador mira a la fila madre (un CHECK no puede).
--   3. `fn_produccion_salida_anulable` / `fn_produccion_vuelta_anulable`: NULL si se puede; si no, el motivo (el hint que la función lanza y que la
--      pantalla entiende): anular_inexistente · anular_es_anulacion · anular_ya_anulada · anular_ya_volvio (de esa salida ya volvieron prendas:
--      anula primero la vuelta) · anular_ya_avanzo (la fase siguiente ya usó las buenas de esa vuelta).
--   4. `anular_salida(p_salida_id, p_motivo)` y `anular_vuelta(p_vuelta_id, p_motivo)`: como las demás de escritura (módulo `produccion` en ese
--      Taller, `fn_actor_persona_id(true)`, candado por orden, actividad sin montos); devuelven `fn_fases_de_orden`.
--
-- DESCARTÉ
--   · Una tabla `produccion_anulaciones` con un `where not exists` en cada suma: cinco funciones que cambiar (y las que vengan) y cualquier suma nueva
--     que lo olvide cuenta lo anulado. Con filas compensatorias las sumas no necesitan saber que existe anular.
--   · Poder anular en cualquier orden, y editar la cantidad de una Salida: lo anotado no se edita; se anula y se anota de nuevo.
--   · Anular una anulación: si se anuló por error, se anota la Salida otra vez.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 154000 y 155000). Sin políticas; `alter table` sobre tablas NUEVAS de esta obra (sin uso
-- todavía); `create or replace trigger` (nunca `drop trigger`, ADR-0195); sin `select … into` dentro de textos entre comillas (ADR-0288).
-- Idempotente: se puede pegar dos veces.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las columnas de la anulación ----------
alter table retail.produccion_salidas add column if not exists anula_id uuid references retail.produccion_salidas (id);
alter table retail.produccion_salidas add column if not exists motivo text;
create unique index if not exists produccion_salidas_anula_unico on retail.produccion_salidas (anula_id) where anula_id is not null;
alter table retail.produccion_salidas drop constraint if exists produccion_salidas_anulacion;
alter table retail.produccion_salidas add constraint produccion_salidas_anulacion check ((anula_id is null) = (motivo is null) and (motivo is null or btrim(motivo) <> ''));
comment on column retail.produccion_salidas.anula_id is 'ADR-0400 (anular): la salida que esta fila anula (sus líneas llevan la cantidad en negativo). Una sola anulación por salida.';

alter table retail.produccion_vueltas add column if not exists anula_id uuid references retail.produccion_vueltas (id);
alter table retail.produccion_vueltas add column if not exists motivo text;
create unique index if not exists produccion_vueltas_anula_unico on retail.produccion_vueltas (anula_id) where anula_id is not null;
alter table retail.produccion_vueltas drop constraint if exists produccion_vueltas_anulacion;
alter table retail.produccion_vueltas add constraint produccion_vueltas_anulacion check ((anula_id is null) = (motivo is null) and (motivo is null or btrim(motivo) <> ''));
comment on column retail.produccion_vueltas.anula_id is 'ADR-0400 (anular): la vuelta que esta fila anula (sus líneas llevan las cantidades en negativo y sus avances se deshacen). Una sola anulación por vuelta.';

-- ---------- 2. Las cantidades negativas, solo en una fila de anulación ----------
alter table retail.produccion_salida_lineas drop constraint if exists produccion_salida_lineas_cantidad_check;
alter table retail.produccion_salida_lineas add constraint produccion_salida_lineas_cantidad_check check (cantidad <> 0);

alter table retail.produccion_vuelta_lineas drop constraint if exists produccion_vuelta_lineas_algo;
alter table retail.produccion_vuelta_lineas drop constraint if exists produccion_vuelta_lineas_buenas_check;
alter table retail.produccion_vuelta_lineas drop constraint if exists produccion_vuelta_lineas_segundas_check;
alter table retail.produccion_vuelta_lineas drop constraint if exists produccion_vuelta_lineas_faltantes_check;
alter table retail.produccion_vuelta_lineas drop constraint if exists produccion_vuelta_lineas_motivo;
alter table retail.produccion_vuelta_lineas drop constraint if exists produccion_vuelta_lineas_forma;
alter table retail.produccion_vuelta_lineas add constraint produccion_vuelta_lineas_forma check (
  (buenas >= 0 and segundas >= 0 and faltantes >= 0 and buenas + segundas + faltantes > 0 and (segundas + faltantes = 0 or motivo is not null))
  or (buenas <= 0 and segundas <= 0 and faltantes <= 0 and buenas + segundas + faltantes < 0)
);

create or replace function retail.fn_produccion_salida_linea_signo() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_anula uuid;
begin
  select s.anula_id into v_anula from retail.produccion_salidas s where s.id = new.salida_id;
  if v_anula is null and new.cantidad <= 0 then
    raise exception 'Una salida manda prendas: la cantidad es mayor que cero' using errcode = '23514';
  end if;
  if v_anula is not null and new.cantidad >= 0 then
    raise exception 'Anular una salida resta lo que mandó: la cantidad es menor que cero' using errcode = '23514';
  end if;
  return new;
end;
$$;
create or replace trigger produccion_salida_lineas_signo before insert on retail.produccion_salida_lineas
  for each row execute function retail.fn_produccion_salida_linea_signo();

create or replace function retail.fn_produccion_vuelta_linea_signo() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_anula uuid;
begin
  select v.anula_id into v_anula from retail.produccion_vueltas v where v.id = new.vuelta_id;
  if v_anula is null and (new.buenas < 0 or new.segundas < 0 or new.faltantes < 0) then
    raise exception 'Una vuelta anota prendas que volvieron: las cantidades no son negativas' using errcode = '23514';
  end if;
  if v_anula is not null and (new.buenas > 0 or new.segundas > 0 or new.faltantes > 0) then
    raise exception 'Anular una vuelta resta lo que anotó: las cantidades no son positivas' using errcode = '23514';
  end if;
  return new;
end;
$$;
create or replace trigger produccion_vuelta_lineas_signo before insert on retail.produccion_vuelta_lineas
  for each row execute function retail.fn_produccion_vuelta_linea_signo();

-- ---------- 3. ¿Se puede anular? NULL si sí; si no, el motivo ----------
create or replace function retail.fn_produccion_salida_anulable(p_salida_id uuid) returns text
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare v_s record; v_l record; v_salieron integer; v_volvieron integer;
begin
  select s.id, s.fase_id, s.anula_id into v_s from retail.produccion_salidas s where s.id = p_salida_id;
  if v_s.id is null then return 'anular_inexistente'; end if;
  if v_s.anula_id is not null then return 'anular_es_anulacion'; end if;
  if exists (select 1 from retail.produccion_salidas a where a.anula_id = p_salida_id) then return 'anular_ya_anulada'; end if;
  -- Sin esa salida, lo que sigue afuera por talla y color no puede quedar por debajo de lo que ya volvió (buenas, segundas o faltantes).
  for v_l in select sl.variante_id, sl.cantidad from retail.produccion_salida_lineas sl where sl.salida_id = p_salida_id loop
    select coalesce(sum(sl.cantidad), 0) into v_salieron
      from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
     where s.fase_id = v_s.fase_id and sl.variante_id = v_l.variante_id;
    select coalesce(sum(vl.buenas + vl.segundas + vl.faltantes), 0) into v_volvieron
      from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
     where vu.fase_id = v_s.fase_id and vl.variante_id = v_l.variante_id;
    if v_salieron - v_l.cantidad < v_volvieron then return 'anular_ya_volvio'; end if;
  end loop;
  return null;
end;
$$;

create or replace function retail.fn_produccion_vuelta_anulable(p_vuelta_id uuid) returns text
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare v_v record; v_l record; v_siguiente uuid; v_hechas integer; v_usado integer;
begin
  select v.id, v.fase_id, v.anula_id into v_v from retail.produccion_vueltas v where v.id = p_vuelta_id;
  if v_v.id is null then return 'anular_inexistente'; end if;
  if v_v.anula_id is not null then return 'anular_es_anulacion'; end if;
  if exists (select 1 from retail.produccion_vueltas a where a.anula_id = p_vuelta_id) then return 'anular_ya_anulada'; end if;
  -- Las buenas de esa vuelta avanzaron a la fase siguiente: si esa fase ya las usó (terminó o mandó afuera), no se anula (la misma regla de `deshacer_avance`).
  v_siguiente := retail.fn_produccion_fase_siguiente(v_v.fase_id);
  if v_siguiente is not null then
    for v_l in select vl.variante_id, vl.buenas from retail.produccion_vuelta_lineas vl where vl.vuelta_id = p_vuelta_id and vl.buenas > 0 loop
      select coalesce(sum(a.cantidad), 0) into v_hechas from retail.produccion_avances a where a.fase_id = v_v.fase_id and a.variante_id = v_l.variante_id;
      select greatest(
          coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_siguiente and a.variante_id = v_l.variante_id), 0),
          coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
                     where s.fase_id = v_siguiente and sl.variante_id = v_l.variante_id), 0))
        into v_usado;
      if v_usado > v_hechas - v_l.buenas then return 'anular_ya_avanzo'; end if;
    end loop;
  end if;
  return null;
end;
$$;

-- ---------- 4. Anular una Salida y anular una Vuelta ----------
create or replace function retail.anular_salida(p_salida_id uuid, p_motivo text) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare v_s record; v_op record; v_motivo text; v_razon text; v_nueva uuid; v_total integer;
begin
  select s.id, s.fase_id into v_s from retail.produccion_salidas s where s.id = p_salida_id;
  if v_s.id is null then
    raise exception 'Esa salida no existe' using hint = 'anular_inexistente';
  end if;
  select * into v_op from retail.fn_produccion_operar_fase(v_s.fase_id);
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'Cuéntanos por qué se anula esta salida' using hint = 'anular_sin_motivo';
  end if;
  v_razon := retail.fn_produccion_salida_anulable(p_salida_id);
  if v_razon = 'anular_es_anulacion' then
    raise exception 'Una anulación no se anula: si te equivocaste, anota la salida otra vez' using hint = v_razon;
  elsif v_razon = 'anular_ya_anulada' then
    raise exception 'Esa salida ya se anuló' using hint = v_razon;
  elsif v_razon = 'anular_ya_volvio' then
    raise exception 'De esa salida ya volvieron prendas de %: anula primero la vuelta', coalesce(v_op.proveedor_nombre, 'el servicio') using hint = v_razon;
  elsif v_razon is not null then
    raise exception 'Esa salida no se puede anular' using hint = v_razon;
  end if;
  insert into retail.produccion_salidas (fase_id, anula_id, motivo, hecho_por, created_at)
    values (v_s.fase_id, p_salida_id, v_motivo, v_op.actor, clock_timestamp()) returning id into v_nueva;
  insert into retail.produccion_salida_lineas (salida_id, variante_id, cantidad)
    select v_nueva, sl.variante_id, -sl.cantidad from retail.produccion_salida_lineas sl where sl.salida_id = p_salida_id;
  select coalesce(sum(sl.cantidad), 0) into v_total from retail.produccion_salida_lineas sl where sl.salida_id = p_salida_id;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_salida_anulada',
      'anuló la salida de ' || retail.fn_actividad_cuantas(v_total, 'prenda', 'prendas') || ' de ' || retail.fn_fase_nombre(v_op.clave)
        || ' a ' || coalesce(v_op.proveedor_nombre, 'un servicio') || ' de la ' || retail.fn_produccion_numero_texto(v_op.numero) || ': ' || v_motivo,
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', v_s.fase_id, 'fase', v_op.clave,
                         'salida_id', p_salida_id, 'anulacion_id', v_nueva, 'cantidad', v_total),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la anulación de la salida de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;

create or replace function retail.anular_vuelta(p_vuelta_id uuid, p_motivo text) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare v_v record; v_op record; v_motivo text; v_razon text; v_nueva uuid; v_buenas integer; v_siguiente uuid;
begin
  select v.id, v.fase_id into v_v from retail.produccion_vueltas v where v.id = p_vuelta_id;
  if v_v.id is null then
    raise exception 'Esa vuelta no existe' using hint = 'anular_inexistente';
  end if;
  select * into v_op from retail.fn_produccion_operar_fase(v_v.fase_id);
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    raise exception 'Cuéntanos por qué se anula esta vuelta' using hint = 'anular_sin_motivo';
  end if;
  v_razon := retail.fn_produccion_vuelta_anulable(p_vuelta_id);
  if v_razon = 'anular_es_anulacion' then
    raise exception 'Una anulación no se anula: si te equivocaste, anota la vuelta otra vez' using hint = v_razon;
  elsif v_razon = 'anular_ya_anulada' then
    raise exception 'Esa vuelta ya se anuló' using hint = v_razon;
  elsif v_razon = 'anular_ya_avanzo' then
    v_siguiente := retail.fn_produccion_fase_siguiente(v_v.fase_id);
    raise exception 'Las prendas buenas de esa vuelta ya pasaron a %: no se puede anular',
      (select retail.fn_fase_nombre(f.clave) from retail.produccion_fases f where f.id = v_siguiente) using hint = v_razon;
  elsif v_razon is not null then
    raise exception 'Esa vuelta no se puede anular' using hint = v_razon;
  end if;
  insert into retail.produccion_vueltas (fase_id, anula_id, motivo, hecho_por, created_at)
    values (v_v.fase_id, p_vuelta_id, v_motivo, v_op.actor, clock_timestamp()) returning id into v_nueva;
  insert into retail.produccion_vuelta_lineas (vuelta_id, variante_id, buenas, segundas, faltantes)
    select v_nueva, vl.variante_id, -vl.buenas, -vl.segundas, -vl.faltantes from retail.produccion_vuelta_lineas vl where vl.vuelta_id = p_vuelta_id;
  -- Las buenas que esa vuelta hizo avanzar se deshacen con su fila contraria (la misma que usa «Deshacer»): la fase vuelve a deber esas prendas.
  insert into retail.produccion_avances (fase_id, variante_id, cantidad, origen, vuelta_id, deshace_id, hecho_por, created_at)
    select a.fase_id, a.variante_id, -a.cantidad, 'deshacer', v_nueva, a.id, v_op.actor, clock_timestamp()
      from retail.produccion_avances a where a.vuelta_id = p_vuelta_id and a.origen = 'vuelta';
  select coalesce(sum(vl.buenas), 0) into v_buenas from retail.produccion_vuelta_lineas vl where vl.vuelta_id = p_vuelta_id;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_vuelta_anulada',
      'anuló la vuelta de ' || retail.fn_actividad_cuantas(v_buenas, 'prenda buena', 'prendas buenas') || ' de ' || retail.fn_fase_nombre(v_op.clave)
        || ' (' || coalesce(v_op.proveedor_nombre, 'un servicio') || ') de la ' || retail.fn_produccion_numero_texto(v_op.numero) || ': ' || v_motivo,
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', v_v.fase_id, 'fase', v_op.clave,
                         'vuelta_id', p_vuelta_id, 'anulacion_id', v_nueva, 'buenas', v_buenas),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la anulación de la vuelta de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;

-- ---------- 5. Las tres funciones que ahora miran lo NETO (mismo cuerpo salvo lo comentado arriba) ----------
create or replace function retail.fn_fases_de_orden(p_produccion_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid; v_plan integer; v_abierta timestamptz; v_f record; v_salida jsonb := '[]'::jsonb;
  v_entrada integer; v_hechas integer; v_salieron integer; v_volvieron integer; v_buenas integer; v_segundas integer; v_faltantes integer;
  v_prev_hecha boolean := true; v_prev_hechas integer; v_prev_fin timestamptz; v_estado text; v_actual boolean; v_hay_actual boolean := false;
  v_empezada boolean; v_desde timestamptz; v_desde_a timestamptz; v_desde_s timestamptz; v_fin timestamptz; v_devengado numeric; v_desde_efectivo timestamptz;
begin
  select p.ubicacion_id, p.cantidad_plan, p.created_at into v_ubicacion, v_plan, v_abierta
    from retail.producciones p where p.id = p_produccion_id;
  if v_ubicacion is null or not retail.fn_produccion_puede_leer(v_ubicacion) then return null; end if;
  v_prev_hechas := v_plan; v_prev_fin := v_abierta;
  for v_f in
    select f.*, pr.nombre as proveedor_nombre
    from retail.produccion_fases f left join retail.proveedores_produccion pr on pr.id = f.proveedor_id
    where f.produccion_id = p_produccion_id order by f.secuencia
  loop
    select coalesce(sum(a.cantidad), 0), min(a.created_at), max(a.created_at) into v_hechas, v_desde_a, v_fin
      from retail.produccion_avances a where a.fase_id = v_f.id;
    select coalesce(sum(l.cantidad), 0), min(s.created_at) into v_salieron, v_desde_s
      from retail.produccion_salidas s join retail.produccion_salida_lineas l on l.salida_id = s.id where s.fase_id = v_f.id;
    -- La fase empezó con lo primero que se anotó: un avance o una salida (least ignora los nulos).
    v_desde := least(v_desde_a, v_desde_s);
    select coalesce(sum(l.buenas), 0), coalesce(sum(l.segundas), 0), coalesce(sum(l.faltantes), 0)
      into v_buenas, v_segundas, v_faltantes
      from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas l on l.vuelta_id = vu.id where vu.fase_id = v_f.id;
    v_volvieron := v_buenas + v_segundas + v_faltantes;
    v_entrada := v_prev_hechas;
    -- Empezó lo que tiene algo anotado y vivo: lo neto de avances, salidas y vueltas (una anulación o un Deshacer total devuelven la fase a «no empezó»).
    v_empezada := v_hechas <> 0 or v_salieron <> 0 or v_volvieron <> 0;
    if v_prev_hecha and v_entrada > 0 and v_hechas + v_segundas + v_faltantes >= v_entrada then v_estado := 'hecha';
    elsif v_empezada then v_estado := 'en_curso';
    else v_estado := 'pendiente'; end if;
    v_actual := (v_estado <> 'hecha') and not v_hay_actual;
    if v_actual then v_hay_actual := true; end if;
    v_desde_efectivo := case when v_empezada then v_desde when v_actual then v_prev_fin end;
    v_devengado := case when v_f.quien = 'servicio' and v_volvieron > 0 then round(v_buenas * v_f.tarifa_prenda + v_f.fijo_orden, 2)
                        when v_f.quien = 'servicio' then 0 else null end;
    v_salida := v_salida || jsonb_build_object(
      'id', v_f.id, 'clave', v_f.clave, 'nombre', retail.fn_fase_nombre(v_f.clave), 'secuencia', v_f.secuencia, 'posicion', v_f.posicion,
      'quien', v_f.quien, 'proveedor_id', v_f.proveedor_id, 'proveedor_nombre', v_f.proveedor_nombre,
      'tarifa_prenda', v_f.tarifa_prenda, 'fijo_orden', v_f.fijo_orden, 'cantidad_minima', v_f.cantidad_minima,
      'fecha_prometida', v_f.fecha_prometida, 'nota', v_f.nota,
      'entrada', v_entrada, 'hechas', v_hechas, 'afuera', greatest(v_salieron - v_volvieron, 0), 'salieron', v_salieron,
      'segundas', v_segundas, 'faltantes', v_faltantes,
      'estado', v_estado, 'actual', v_actual, 'empezada', v_empezada,
      'desde', v_desde_efectivo,
      'dias_en_fase', case when v_estado = 'hecha' then null
                           else greatest(floor(extract(epoch from (now() - v_desde_efectivo)) / 86400), 0)::int end,
      'devengado', v_devengado);
    v_prev_hecha := (v_estado = 'hecha');
    v_prev_hechas := v_hechas;
    v_prev_fin := coalesce(v_fin, v_prev_fin);
  end loop;
  return v_salida;
end;
$$;

create or replace function retail.cambiar_quien_fase(
  p_fase_id uuid, p_quien text, p_proveedor_id uuid default null, p_tarifa_prenda numeric default null,
  p_fijo_orden numeric default null, p_cantidad_minima integer default null, p_fecha_prometida date default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_f record; v_ubicacion uuid; v_estado text; v_n jsonb; v_actor uuid;
begin
  select f.*, p.ubicacion_id, p.estado as estado_orden into v_f
    from retail.produccion_fases f join retail.producciones p on p.id = f.produccion_id where f.id = p_fase_id;
  if v_f.id is null then
    raise exception 'Esa fase no existe' using hint = 'fase_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_f.ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_f.estado_orden <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  -- Empezó lo que tiene algo anotado y vivo (lo neto: un Deshacer total o una anulación devuelven la fase a «no empezó»; ADR-0400, anular).
  if coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = p_fase_id), 0) <> 0
     or coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = p_fase_id), 0) <> 0 then
    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;
  v_n := retail.fn_produccion_fases_normalizar(jsonb_build_array(jsonb_build_object(
    'clave', v_f.clave, 'posicion', v_f.posicion, 'quien', p_quien, 'proveedor_id', p_proveedor_id, 'tarifa_prenda', p_tarifa_prenda,
    'fijo_orden', p_fijo_orden, 'cantidad_minima', p_cantidad_minima, 'fecha_prometida', p_fecha_prometida, 'nota', v_f.nota))
    || case when v_f.clave = 'corte' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('clave', 'corte', 'quien', 'taller')) end
    || case when v_f.clave = 'costura' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('clave', 'costura', 'quien', 'taller')) end
    || case when v_f.clave = 'acabado' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('clave', 'acabado', 'quien', 'taller')) end
  ) -> 0;
  update retail.produccion_fases f set
    quien = v_n ->> 'quien', proveedor_id = nullif(v_n ->> 'proveedor_id', '')::uuid,
    tarifa_prenda = nullif(v_n ->> 'tarifa_prenda', '')::numeric, fijo_orden = coalesce((v_n ->> 'fijo_orden')::numeric, 0),
    cantidad_minima = nullif(v_n ->> 'cantidad_minima', '')::integer, fecha_prometida = nullif(v_n ->> 'fecha_prometida', '')::date
  where f.id = p_fase_id;
  return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
end;
$$;

create or replace function retail.fn_orden_produccion(p_produccion_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_o record; v_ve_costos boolean; v_producto jsonb; v_lineas jsonb; v_fases jsonb; v_f jsonb; v_fases_salida jsonb := '[]'::jsonb;
  v_por_variante jsonb; v_insumos jsonb; v_costos jsonb; v_tiempo jsonb; v_fase_id uuid;
  v_tela_est numeric := 0; v_avios_est numeric := 0; v_tela_real numeric := 0; v_avios_real numeric := 0;
  v_serv_est numeric := 0; v_serv_dev numeric := 0;
begin
  select p.id, p.numero, p.estado, p.es_muestra, p.fecha_entrega, p.nota, p.created_at, p.inventariado_at, p.cantidad_plan, p.cantidad_buenas,
         p.ubicacion_id, p.producto_id, p.creado_por, u.nombre as ubicacion_nombre, nullif(concat_ws(' ', pe.nombres, pe.apellidos), '') as creado_por_nombre
    into v_o
    from retail.producciones p
    join retail.ubicaciones u on u.id = p.ubicacion_id
    left join public.personas pe on pe.id = p.creado_por
   where p.id = p_produccion_id;
  if v_o.id is null or not retail.fn_produccion_puede_leer(v_o.ubicacion_id) then return null; end if;
  -- Los costos del Taller los ve quien ve `produccion` parado en ese Taller, o el líder (ADR-0400, supuestos).
  v_ve_costos := retail.fn_es_lider() or (retail.fn_ve_modulo('produccion') and retail.fn_puede_operar_ubicacion(v_o.ubicacion_id));

  -- El modelo: referencia, categoría (para dibujar la prenda sin foto, ADR-0333), tejido y el precio más alto de sus variantes.
  select jsonb_build_object(
      'id', pr.id, 'referencia', pr.referencia, 'codigo', pr.codigo, 'estado', pr.estado,
      'categoria', case when c.id is null then null else jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia) end,
      'tejido_id', pr.tejido_id, 'tejido_nombre', t.nombre,
      'precio', (select max(v.precio) from retail.variantes v where v.producto_id = pr.id and v.activo))
    into v_producto
    from retail.productos pr
    left join retail.categorias c on c.id = pr.categoria_id
    left join retail.tejidos t on t.id = pr.tejido_id
   where pr.id = v_o.producto_id;

  -- Las líneas: por color y talla (XS … XL antes que los números; lo demás al final).
  select coalesce(jsonb_agg(jsonb_build_object(
      'variante_id', l.variante_id, 'sku', v.sku, 'codigo', v.codigo, 'talla', ta.valor, 'color_codigo', v.color_codigo,
      'color_nombre', co.nombre, 'color_hex', co.hex, 'cantidad_plan', l.cantidad_plan, 'cantidad_buenas', l.cantidad_buenas)
      order by co.nombre, v.color_codigo, retail.fn_actividad_peso_talla(coalesce(ta.valor, '')), ta.valor, l.created_at), '[]'::jsonb)
    into v_lineas
    from retail.produccion_lineas l
    join retail.variantes v on v.id = l.variante_id
    left join retail.tallas ta on ta.id = v.talla_id
    left join retail.colores co on co.codigo = v.color_codigo
   where l.produccion_id = p_produccion_id;

  -- Las fases, cada una con su detalle por talla y color (los mismos candados que las funciones de escritura: la pantalla precarga «lo que falta»).
  v_fases := coalesce(retail.fn_fases_de_orden(p_produccion_id), '[]'::jsonb);
  for v_f in select * from jsonb_array_elements(v_fases) loop
    v_fase_id := (v_f ->> 'id')::uuid;
    select coalesce(jsonb_agg(x.fila order by x.color_nombre, x.color_codigo, x.peso, x.talla, x.creada), '[]'::jsonb)
      into v_por_variante
      from (
        select co.nombre as color_nombre, v.color_codigo, retail.fn_actividad_peso_talla(coalesce(ta.valor, '')) as peso, ta.valor as talla, l.created_at as creada,
               jsonb_build_object(
                 'variante_id', l.variante_id, 'plan', l.cantidad_plan,
                 'entrada', retail.fn_produccion_entrada_variante(v_fase_id, l.variante_id),
                 'hechas', coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_fase_id and a.variante_id = l.variante_id), 0),
                 'salieron', coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
                                       where s.fase_id = v_fase_id and sl.variante_id = l.variante_id), 0),
                 'volvieron_buenas', coalesce((select sum(vl.buenas) from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
                                               where vu.fase_id = v_fase_id and vl.variante_id = l.variante_id), 0),
                 'segundas', coalesce((select sum(vl.segundas) from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
                                       where vu.fase_id = v_fase_id and vl.variante_id = l.variante_id), 0),
                 'faltantes', coalesce((select sum(vl.faltantes) from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
                                        where vu.fase_id = v_fase_id and vl.variante_id = l.variante_id), 0),
                 'afuera', greatest(
                   coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id
                             where s.fase_id = v_fase_id and sl.variante_id = l.variante_id), 0)
                   - coalesce((select sum(vl.buenas + vl.segundas + vl.faltantes) from retail.produccion_vueltas vu join retail.produccion_vuelta_lineas vl on vl.vuelta_id = vu.id
                               where vu.fase_id = v_fase_id and vl.variante_id = l.variante_id), 0), 0)) as fila
          from retail.produccion_lineas l
          join retail.variantes v on v.id = l.variante_id
          left join retail.tallas ta on ta.id = v.talla_id
          left join retail.colores co on co.codigo = v.color_codigo
         where l.produccion_id = p_produccion_id
      ) x;
    v_fases_salida := v_fases_salida || (v_f || jsonb_build_object('por_variante', v_por_variante));
    if v_f ->> 'quien' = 'servicio' then
      v_serv_est := v_serv_est + coalesce((v_f ->> 'tarifa_prenda')::numeric, 0) * v_o.cantidad_plan + coalesce((v_f ->> 'fijo_orden')::numeric, 0);
      v_serv_dev := v_serv_dev + coalesce((v_f ->> 'devengado')::numeric, 0);
    end if;
  end loop;

  -- La tela y los avíos de la orden: el plan, lo usado (consumo − devolución del libro, por insumo: el libro no sabe de colores, así que una
  -- misma tela en dos colores muestra el mismo usado en las dos filas) y el saldo del insumo en ese Taller (el `case` de `v_insumo_saldos`).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pi.id, 'insumo_id', pi.insumo_id, 'codigo', i.codigo, 'nombre', i.nombre, 'tipo', i.tipo, 'unidad', i.unidad_medida,
      'color_codigo', pi.color_codigo, 'color_nombre', co.nombre, 'consumo_por_prenda', pi.consumo_por_prenda, 'cantidad_plan', pi.cantidad_plan,
      'usado', coalesce((select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) from retail.movimientos_insumo mi
                         where mi.produccion_id = p_produccion_id and mi.insumo_id = pi.insumo_id and mi.tipo in ('consumo', 'devolucion')), 0),
      'saldo', coalesce((select sum(case when mi.tipo in ('compra', 'devolucion') then mi.cantidad
                                         when mi.tipo in ('consumo', 'merma') then -mi.cantidad else mi.cantidad end)
                         from retail.movimientos_insumo mi where mi.insumo_id = pi.insumo_id and mi.ubicacion_id = v_o.ubicacion_id), 0),
      'nota', pi.nota) order by i.tipo desc, i.nombre, pi.color_codigo), '[]'::jsonb)
    into v_insumos
    from retail.produccion_insumos pi
    join retail.insumos i on i.id = pi.insumo_id
    left join retail.colores co on co.codigo = pi.color_codigo
   where pi.produccion_id = p_produccion_id;

  if v_ve_costos then
    -- Estimado: el plan de cada tela o avío × el costo del lote más antiguo con saldo en ese Taller (PEPS, como `registrar_consumo_insumo`);
    -- sin lote con saldo, 0 (la pantalla dice «sin tela recibida», no inventa un precio).
    select coalesce(sum(case when i.tipo = 'tela' then pi.cantidad_plan * coalesce(peps.costo, 0) end), 0),
           coalesce(sum(case when i.tipo <> 'tela' then pi.cantidad_plan * coalesce(peps.costo, 0) end), 0)
      into v_tela_est, v_avios_est
      from retail.produccion_insumos pi
      join retail.insumos i on i.id = pi.insumo_id
      left join lateral (
        select l.costo_unitario as costo
          from retail.insumo_lotes l
         where l.insumo_id = pi.insumo_id and l.ubicacion_id = v_o.ubicacion_id
           and l.cantidad_ingresada
               - coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo in ('consumo', 'merma')), 0)
               + coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo = 'devolucion'), 0) > 0
         order by l.fecha_ingreso, l.created_at limit 1
      ) peps on true
     where pi.produccion_id = p_produccion_id;
    -- Real hasta hoy: lo consumido menos lo devuelto, al costo del lote de cada movimiento (la misma cuenta de `fn_recalcular_costo_insumos_produccion`).
    select coalesce(sum(case when i.tipo = 'tela' then (case when mi.tipo = 'consumo' then 1 else -1 end) * mi.cantidad * mi.costo_unitario end), 0),
           coalesce(sum(case when i.tipo <> 'tela' then (case when mi.tipo = 'consumo' then 1 else -1 end) * mi.cantidad * mi.costo_unitario end), 0)
      into v_tela_real, v_avios_real
      from retail.movimientos_insumo mi
      join retail.insumos i on i.id = mi.insumo_id
     where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion');
    v_costos := jsonb_build_object(
      'tela_estimado', round(v_tela_est, 2), 'avios_estimado', round(v_avios_est, 2),
      'tela_real', round(v_tela_real, 2), 'avios_real', round(v_avios_real, 2),
      'servicios_estimado', round(v_serv_est, 2), 'servicios_devengado', round(v_serv_dev, 2),
      'total_estimado', round(v_tela_est + v_avios_est + v_serv_est, 2),
      'total_real_hasta_hoy', round(v_tela_real + v_avios_real + v_serv_dev, 2));
  end if;

  -- La línea de tiempo: la apertura, cada avance del Taller y cada Deshacer, cada Salida y cada Vuelta; del más reciente al más viejo.
  -- `avance_id` viaja solo en un avance que todavía se puede deshacer (la misma regla que `deshacer_avance`).
  select coalesce(jsonb_agg(x.fila order by x.cuando desc, x.prioridad desc), '[]'::jsonb)
    into v_tiempo
    from (
      select p.created_at as cuando, 0 as prioridad, jsonb_build_object(
          'cuando', p.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), 'tipo', 'apertura',
          'fase_clave', null, 'fase_nombre', null, 'cantidad', p.cantidad_plan,
          'detalle', retail.fn_actividad_cuantas(p.cantidad_plan, 'prenda', 'prendas') || case when p.es_muestra then ' (muestra)' else '' end
            || coalesce(' · afuera: ' || (
                 select string_agg(retail.fn_fase_nombre(f.clave) || ' con ' || pr.nombre, ', ' order by f.secuencia)
                   from retail.produccion_fases f join retail.proveedores_produccion pr on pr.id = f.proveedor_id
                  where f.produccion_id = p.id and f.quien = 'servicio'), ' · todo en el Taller'),
          'avance_id', null, 'id', p.id) as fila
        from retail.producciones p left join public.personas pe on pe.id = p.creado_por
       where p.id = p_produccion_id
      union all
      select a.created_at, 1, jsonb_build_object(
          'cuando', a.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''),
          'tipo', case when a.origen = 'deshacer' then 'deshacer' else 'avance' end,
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', abs(a.cantidad),
          'detalle', abs(a.cantidad) || ' de ' || retail.fn_produccion_variante_texto(a.variante_id) || coalesce(' · ' || a.nota, ''),
          'variante_id', a.variante_id,
          'avance_id', case when a.origen = 'taller' and retail.fn_produccion_avance_deshacible(a.id) is null then a.id end, 'id', a.id)
        from retail.produccion_avances a
        join retail.produccion_fases f on f.id = a.fase_id
        left join public.personas pe on pe.id = a.hecho_por
       where f.produccion_id = p_produccion_id and (a.origen = 'taller' or (a.origen = 'deshacer' and a.vuelta_id is null))
      union all
      select s.created_at, 2, jsonb_build_object(
          'cuando', s.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), 'tipo', 'salida',
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', t.cantidad,
          'detalle', retail.fn_actividad_cuantas(t.cantidad, 'prenda', 'prendas') || ' a ' || coalesce(pr.nombre, 'un servicio')
            || coalesce(' · guía ' || s.guia, '') || coalesce(' · ' || s.nota, ''),
          'guia', s.guia, 'lineas', t.lineas, 'avance_id', null, 'id', s.id,
          'anulada', exists (select 1 from retail.produccion_salidas a where a.anula_id = s.id),
          'anulable', retail.fn_produccion_salida_anulable(s.id) is null)
        from retail.produccion_salidas s
        join retail.produccion_fases f on f.id = s.fase_id
        left join retail.proveedores_produccion pr on pr.id = f.proveedor_id
        left join public.personas pe on pe.id = s.hecho_por
        cross join lateral (
          select coalesce(sum(sl.cantidad), 0)::integer as cantidad,
                 coalesce(jsonb_agg(jsonb_build_object('variante_id', sl.variante_id, 'cantidad', sl.cantidad)), '[]'::jsonb) as lineas
            from retail.produccion_salida_lineas sl where sl.salida_id = s.id) t
       where f.produccion_id = p_produccion_id and s.anula_id is null
      union all
      select vu.created_at, 3, jsonb_build_object(
          'cuando', vu.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), 'tipo', 'vuelta',
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', t.buenas,
          'detalle', t.buenas || ' buenas'
            || case when t.segundas > 0 then ' · ' || t.segundas || ' segundas' else '' end
            || case when t.faltantes > 0 then ' · ' || t.faltantes || ' faltantes' else '' end
            || coalesce(': ' || t.motivos, '') || coalesce(' · guía ' || vu.guia, '') || coalesce(' · ' || vu.nota, ''),
          'buenas', t.buenas, 'segundas', t.segundas, 'faltantes', t.faltantes, 'guia', vu.guia, 'lineas', t.lineas, 'avance_id', null, 'id', vu.id,
          'anulada', exists (select 1 from retail.produccion_vueltas a where a.anula_id = vu.id),
          'anulable', retail.fn_produccion_vuelta_anulable(vu.id) is null)
        from retail.produccion_vueltas vu
        join retail.produccion_fases f on f.id = vu.fase_id
        left join public.personas pe on pe.id = vu.hecho_por
        cross join lateral (
          select coalesce(sum(vl.buenas), 0)::integer as buenas, coalesce(sum(vl.segundas), 0)::integer as segundas,
                 coalesce(sum(vl.faltantes), 0)::integer as faltantes, string_agg(distinct vl.motivo, '; ') as motivos,
                 coalesce(jsonb_agg(jsonb_build_object('variante_id', vl.variante_id, 'buenas', vl.buenas, 'segundas', vl.segundas,
                                                       'faltantes', vl.faltantes, 'motivo', vl.motivo)), '[]'::jsonb) as lineas
            from retail.produccion_vuelta_lineas vl where vl.vuelta_id = vu.id) t
       where f.produccion_id = p_produccion_id and vu.anula_id is null
      union all
      -- Las anulaciones (filas compensatorias): «Anuló la salida de 48 a X: el motivo». La salida o la vuelta original sigue en su lugar, con `anulada`.
      select s.created_at, 4, jsonb_build_object(
          'cuando', s.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), 'tipo', 'anulacion',
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', t.cantidad,
          'detalle', 'Anuló la salida de ' || retail.fn_actividad_cuantas(t.cantidad, 'prenda', 'prendas') || ' a ' || coalesce(pr.nombre, 'un servicio') || ': ' || s.motivo,
          'anula', 'salida', 'motivo', s.motivo, 'avance_id', null, 'id', s.id)
        from retail.produccion_salidas s
        join retail.produccion_fases f on f.id = s.fase_id
        left join retail.proveedores_produccion pr on pr.id = f.proveedor_id
        left join public.personas pe on pe.id = s.hecho_por
        cross join lateral (select coalesce(abs(sum(sl.cantidad)), 0)::integer as cantidad from retail.produccion_salida_lineas sl where sl.salida_id = s.id) t
       where f.produccion_id = p_produccion_id and s.anula_id is not null
      union all
      select vu.created_at, 4, jsonb_build_object(
          'cuando', vu.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), 'tipo', 'anulacion',
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', t.buenas,
          'detalle', 'Anuló la vuelta de ' || t.buenas || ' buenas'
            || case when t.segundas > 0 then ' · ' || t.segundas || ' segundas' else '' end
            || case when t.faltantes > 0 then ' · ' || t.faltantes || ' faltantes' else '' end || ': ' || vu.motivo,
          'anula', 'vuelta', 'motivo', vu.motivo, 'avance_id', null, 'id', vu.id)
        from retail.produccion_vueltas vu
        join retail.produccion_fases f on f.id = vu.fase_id
        left join public.personas pe on pe.id = vu.hecho_por
        cross join lateral (select coalesce(abs(sum(vl.buenas)), 0)::integer as buenas, coalesce(abs(sum(vl.segundas)), 0)::integer as segundas,
                                   coalesce(abs(sum(vl.faltantes)), 0)::integer as faltantes from retail.produccion_vuelta_lineas vl where vl.vuelta_id = vu.id) t
       where f.produccion_id = p_produccion_id and vu.anula_id is not null
    ) x;

  return jsonb_build_object(
    'orden', jsonb_build_object(
      'id', v_o.id, 'numero', v_o.numero, 'numero_texto', retail.fn_produccion_numero_texto(v_o.numero), 'estado', v_o.estado,
      'es_muestra', v_o.es_muestra, 'fecha_entrega', v_o.fecha_entrega, 'nota', v_o.nota, 'created_at', v_o.created_at,
      'creado_por', v_o.creado_por, 'creado_por_nombre', v_o.creado_por_nombre, 'inventariado_at', v_o.inventariado_at,
      'cantidad_plan', v_o.cantidad_plan, 'cantidad_buenas', v_o.cantidad_buenas,
      'ubicacion_id', v_o.ubicacion_id, 'ubicacion_nombre', v_o.ubicacion_nombre, 'producto', v_producto),
    'lineas', v_lineas,
    'fases', v_fases_salida,
    'insumos', v_insumos,
    'costos', v_costos,
    'linea_de_tiempo', v_tiempo,
    'permisos', jsonb_build_object(
      'puede_operar', retail.fn_ve_modulo('produccion') and retail.fn_puede_operar_ubicacion(v_o.ubicacion_id),
      've_costos', v_ve_costos));
end;
$$;

-- ---------- 6. Permisos ----------
revoke all on function retail.anular_salida(uuid, text) from public, anon;
revoke all on function retail.anular_vuelta(uuid, text) from public, anon;
grant execute on function retail.anular_salida(uuid, text) to authenticated, service_role;
grant execute on function retail.anular_vuelta(uuid, text) to authenticated, service_role;
-- Las funciones reescritas conservan sus permisos (`create or replace`); se repiten por si la base las perdió.
revoke all on function retail.fn_orden_produccion(uuid) from public, anon;
grant execute on function retail.fn_orden_produccion(uuid) to authenticated, service_role;
revoke all on function retail.fn_fases_de_orden(uuid) from public, anon;
grant execute on function retail.fn_fases_de_orden(uuid) to authenticated, service_role;
revoke all on function retail.cambiar_quien_fase(uuid, text, uuid, numeric, numeric, integer, date) from public, anon;
grant execute on function retail.cambiar_quien_fase(uuid, text, uuid, numeric, numeric, integer, date) to authenticated, service_role;
-- Internas: nadie las llama desde la API.
revoke all on function retail.fn_produccion_salida_anulable(uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_vuelta_anulable(uuid) from public, anon, authenticated;
revoke all on function retail.fn_produccion_salida_linea_signo() from public, anon, authenticated;
revoke all on function retail.fn_produccion_vuelta_linea_signo() from public, anon, authenticated;

reset lock_timeout;
