-- ADR-0400 act. (k) y (l), paquete R1, actividad 2 (2026-10-19): Ploteo, la fase de UN TOQUE (no cuenta prendas).
--
-- EL PROBLEMA
--   Ploteo (la marcada a escala real que define el metraje, Audaces) es la primera fase de la ruta nueva (secuencia 5) pero no cuenta prendas:
--   se marca «hecha» con un toque (act. k, supuesto confirmado por Felipe el 2026-10-19). La base decide la cadena de cantidades por la
--   secuencia: «la primera fase» es la de menor secuencia, y a ella le entra `plan × 1,10`; a las demás, lo terminado en la anterior. Con Ploteo
--   en esa cadena, Corte dejaría de ser la primera: su tope pasaría a depender de lo «terminado» en Ploteo y se perdería el margen de cortar de más.
--   Además un servicio de ploteo cobra por ORDEN (el fijo), no por prenda, y la base exige tarifa por prenda en todo servicio.
--
-- QUÉ HACE (una tabla nueva append-only, dos funciones que escriben, y ajustes a lo que ya existe)
--   · `fn_fase_es_hito(clave)`: la fase que se marca en vez de contarse. Hoy solo `ploteo`; una fase más es una línea.
--   · `produccion_fase_marcas`: lo marcado, que solo se agrega (disparador `fn_produccion_anotado_inmutable`). Deshacer es otra fila que apunta a la
--     marca que deshace (`deshace_id`), como un avance negativo: una marca está viva si ninguna otra la deshace. RLS sin políticas.
--   · `marcar_fase_hecha(fase, nota)` y `deshacer_marca_fase(fase)`: módulo `produccion` y Taller (`fn_produccion_exigir_operar`), firman con
--     `fn_actor_persona_id(true)`, un candado por orden (ADR-0190), actividad sin montos. Solo para una fase que es hito.
--   · `fn_produccion_fase_anterior` y `fn_produccion_fase_siguiente` SALTAN las fases hito: Corte sigue siendo la primera que cuenta (plan × 1,10).
--   · `fn_produccion_entrada_variante` devuelve 0 para una fase hito (nada entra a algo que no cuenta); `registrar_avance`, `registrar_salida` y
--     `registrar_vuelta` rechazan una fase hito con `fase_es_hito` y una frase clara (reemplazos ANCLADOS, de una línea, idempotentes).
--   · `fn_fases_de_orden`: una fase hito está `hecha` si tiene una marca viva y `pendiente` si no; nunca «en curso»; no entra a la cadena (no
--     cambia lo que le entra a la fase siguiente); sale con `hito`, `marcada` y `marca_id` (el resto de las fases, con `hito: false`). Una fase hito
--     pendiente es la «actual» solo mientras nadie empezó una fase posterior (una orden de un modelo que se repite puede saltarse el ploteo). Un
--     servicio de ploteo devenga su fijo cuando se marca (`devengado`); un ploteo del Taller no devenga nada.
--   · `fn_orden_produccion`: la línea de tiempo suma «marcó» y «deshizo la marca» (reemplazo anclado).
--   · `cambiar_quien_fase`: una fase hito marcada ya «empezó» (no se cambia quién la hace).
--   · Un servicio de ploteo cobra por orden: `produccion_fases_quien` acepta `tarifa_prenda` nula si es ploteo con fijo > 0, `proveedor_tarifas.tarifa_prenda`
--     deja de ser obligatoria con la misma regla, `fn_produccion_fases_normalizar` y `guardar_tarifa_servicio` la tratan así (`fase_sin_fijo`,
--     `tarifa_ploteo_es_fijo`, `tarifa_ploteo_sin_fijo`).
--
-- DESCARTÉ
--   · Ploteo como una fase que cuenta («terminé todas» con un clic): le quita a Corte el margen de cortar de más (tendría que entrar solo lo
--     terminado en Ploteo) o obliga a que «la primera fase que cuenta» sea otra regla escondida en cada función.
--   · Que Corte exija el ploteo marcado: «sin plano no hay corte» es la tensión 3 del ADR-0400 act. (l), abierta; no se decide aquí.
--   · Guardar la marca como un avance de todo el plan en una fase aparte: mezcla dos cosas (prendas y hitos) en la tabla de las prendas.
--
-- ASUME   las funciones tal como las dejaron 20261014155000, 20261015160000 y 20261019191000 (candado de md5; los reemplazos anclados cuentan sus
--         anclas y se detienen si no son las esperadas). Tablas de Producción con 0 filas en producción (2026-10-16).
-- CÓMO SE PEGA EN PRODUCCIÓN (Felipe, 2026-10-19, por adelantado; después de 20261019191000): una sola parte; no hay políticas; el `alter` de
--   `proveedor_tarifas` y `produccion_fases` es sobre tablas que nadie usa todavía. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. El candado: las funciones que se reemplazan enteras son las que esta migración espera ----------
do $$
declare
  v_f record; v_md5 text;
begin
  for v_f in
    select * from (values
      ('retail.fn_produccion_fase_anterior(uuid)', 'e2c381aef475641da4a816153505b300', 'fa5396ea2c5d90837743c166a4337805'),
      ('retail.fn_produccion_fase_siguiente(uuid)', '29077c27b355203331356d42fbd91f24', '9f20a7597c9d708143f19882ec0eb2ea'),
      ('retail.fn_produccion_entrada_variante(uuid,uuid)', 'de8852d687f101f1e2149bb6179d4e46', 'a98fab26dc415c42d21a6744962931f5'),
      ('retail.fn_fases_de_orden(uuid)', '5d85e0c36f27cb9275931284bda12993', 'c8d53aaa6b345084986d3bc8353c0bdc'),
      ('retail.cambiar_quien_fase(uuid,text,uuid,numeric,numeric,integer,date)', '58bb4ab9f0b1f28ddd615eb8b43499ca', '70767670b2d3a99580510b9ab2fe4476'),
      ('retail.fn_produccion_fases_normalizar(jsonb)', '6c3d1c3ef7caa1f4ad492fbe0726c28e', 'f2d14f9b37fd8c9c4e984995ceae325b'),
      ('retail.guardar_tarifa_servicio(uuid,text,numeric,integer,numeric,text)', 'bc50d9ba61ef4dd6b8013c40451b7df2', '4d086c8277c9329ab3526f821947e8a8')
    ) as t (firma, viejo, nuevo)
  loop
    v_md5 := md5((select p.prosrc from pg_proc p where p.oid = v_f.firma::regprocedure));
    if v_md5 not in (v_f.viejo, v_f.nuevo) then
      raise exception '% cambió desde que se escribió esta migración (md5 %): regenera el reemplazo desde su definición real.', v_f.firma, v_md5;
    end if;
  end loop;
end;
$$;

-- Inserta `p_bloque` antes de la primera aparición de `p_ancla`, que tiene que aparecer exactamente `p_veces` veces. Si `p_marca` ya está en la
-- función, no hace nada (idempotente). Anclas de código, nunca comentarios.
create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_veces integer, p_bloque text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_ancla, v_n;
  end if;
  execute overlay(v_def placing p_bloque || p_ancla from position(p_ancla in v_def) for length(p_ancla));
end;
$f$;

-- ---------- 1. Qué fase se marca en vez de contarse, y lo que se marcó ----------
create or replace function retail.fn_fase_es_hito(p_clave text) returns boolean
language sql immutable
set search_path = retail, public, extensions
as $$ select p_clave = 'ploteo' $$;

create table if not exists retail.produccion_fase_marcas (
  id uuid primary key default gen_random_uuid(),
  fase_id uuid not null references retail.produccion_fases (id),
  -- La marca que esta fila deshace (NULL en una marca). Una marca solo se deshace una vez.
  deshace_id uuid references retail.produccion_fase_marcas (id),
  nota text check (nota is null or btrim(nota) <> ''),
  hecho_por uuid not null references public.personas (id),
  created_at timestamptz not null default now(),
  constraint produccion_fase_marcas_una_vez unique (deshace_id)
);
create index if not exists produccion_fase_marcas_fase_idx on retail.produccion_fase_marcas (fase_id);
comment on table retail.produccion_fase_marcas is
  'ADR-0400 act. (k) y (l): lo que se marcó «hecho» en una fase que no cuenta prendas (Ploteo). Solo se agrega: deshacer es otra fila con deshace_id. '
  'Una marca está viva si ninguna otra la deshace. Solo se lee y escribe por funciones security definer (RLS sin políticas).';
create or replace trigger produccion_fase_marcas_inmutable before update or delete on retail.produccion_fase_marcas
  for each row execute function retail.fn_produccion_anotado_inmutable();
alter table retail.produccion_fase_marcas enable row level security;
revoke all on retail.produccion_fase_marcas from anon, authenticated;

-- La marca viva de una fase (NULL si no hay).
create or replace function retail.fn_produccion_marca_viva(p_fase_id uuid) returns uuid
language sql stable
set search_path = retail, public, extensions
as $$
  select m.id from retail.produccion_fase_marcas m
   where m.fase_id = p_fase_id and m.deshace_id is null
     and not exists (select 1 from retail.produccion_fase_marcas d where d.deshace_id = m.id)
   order by m.created_at desc, m.id desc limit 1
$$;

-- ---------- 2. Un servicio de ploteo cobra por orden: la tarifa por prenda puede faltar si hay fijo ----------
alter table retail.produccion_fases drop constraint if exists produccion_fases_quien;
alter table retail.produccion_fases add constraint produccion_fases_quien check (
  case when quien = 'servicio'
    then proveedor_id is not null and (tarifa_prenda is not null or (clave = 'ploteo' and fijo_orden > 0))
    else proveedor_id is null and tarifa_prenda is null and fecha_prometida is null and cantidad_minima is null
  end
);
alter table retail.proveedor_tarifas alter column tarifa_prenda drop not null;
alter table retail.proveedor_tarifas drop constraint if exists proveedor_tarifas_tarifa_o_ploteo;
alter table retail.proveedor_tarifas add constraint proveedor_tarifas_tarifa_o_ploteo check (
  tarifa_prenda is not null or (fase_clave = 'ploteo' and fijo_orden > 0)
);

-- ---------- 3. La cadena de cantidades salta las fases que no cuentan ----------
create or replace function retail.fn_produccion_fase_anterior(p_fase_id uuid) returns uuid
language sql stable
set search_path = retail, public, extensions
as $$
  select f2.id
  from retail.produccion_fases f
  join retail.produccion_fases f2 on f2.produccion_id = f.produccion_id and f2.secuencia < f.secuencia and not retail.fn_fase_es_hito(f2.clave)
  where f.id = p_fase_id
  order by f2.secuencia desc limit 1
$$;

create or replace function retail.fn_produccion_fase_siguiente(p_fase_id uuid) returns uuid
language sql stable
set search_path = retail, public, extensions
as $$
  select f2.id
  from retail.produccion_fases f
  join retail.produccion_fases f2 on f2.produccion_id = f.produccion_id and f2.secuencia > f.secuencia and not retail.fn_fase_es_hito(f2.clave)
  where f.id = p_fase_id
  order by f2.secuencia limit 1
$$;

create or replace function retail.fn_produccion_entrada_variante(p_fase_id uuid, p_variante_id uuid) returns integer
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare v_produccion uuid; v_clave text; v_anterior uuid; v_plan integer;
begin
  select f.produccion_id, f.clave into v_produccion, v_clave from retail.produccion_fases f where f.id = p_fase_id;
  if v_produccion is null then return 0; end if;
  -- Una fase que se marca (Ploteo) no cuenta prendas: nada «entra» a ella.
  if retail.fn_fase_es_hito(v_clave) then return 0; end if;
  v_anterior := retail.fn_produccion_fase_anterior(p_fase_id);
  if v_anterior is null then
    select l.cantidad_plan into v_plan from retail.produccion_lineas l where l.produccion_id = v_produccion and l.variante_id = p_variante_id;
    return coalesce(ceil(v_plan * 1.10), 0)::integer;
  end if;
  return coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_anterior and a.variante_id = p_variante_id), 0)::integer;
end;
$$;

-- Avance, Salida y Vuelta rechazan una fase que se marca, antes de mirar quién la hace (reemplazos anclados, idempotentes).
select pg_temp.insertar_antes(
  'retail.registrar_avance(uuid, jsonb, text)',
  $v$  if v_op.quien <> 'taller' then$v$, 1,
  $v$  if retail.fn_fase_es_hito(v_op.clave) then
    raise exception 'La fase «%» no cuenta prendas: se marca como hecha, no se anota «Terminé»', retail.fn_fase_nombre(v_op.clave) using hint = 'fase_es_hito';
  end if;
$v$,
  $v$fase_es_hito$v$);
select pg_temp.insertar_antes(
  'retail.registrar_salida(uuid, jsonb, text, text)',
  $v$  if v_op.quien <> 'servicio' then$v$, 1,
  $v$  if retail.fn_fase_es_hito(v_op.clave) then
    raise exception 'La fase «%» no manda prendas afuera: se marca como hecha', retail.fn_fase_nombre(v_op.clave) using hint = 'fase_es_hito';
  end if;
$v$,
  $v$fase_es_hito$v$);
select pg_temp.insertar_antes(
  'retail.registrar_vuelta(uuid, jsonb, text, text)',
  $v$  if v_op.quien <> 'servicio' then$v$, 1,
  $v$  if retail.fn_fase_es_hito(v_op.clave) then
    raise exception 'La fase «%» no recibe prendas de vuelta: se marca como hecha', retail.fn_fase_nombre(v_op.clave) using hint = 'fase_es_hito';
  end if;
$v$,
  $v$fase_es_hito$v$);

-- ---------- 4. Marcar y deshacer ----------
create or replace function retail.marcar_fase_hecha(p_fase_id uuid, p_nota text default null) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_op record; v_nota text; v_id uuid;
begin
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  if not retail.fn_fase_es_hito(v_op.clave) then
    raise exception 'La fase «%» se anota con «Terminé N»: no se marca como hecha', retail.fn_fase_nombre(v_op.clave) using hint = 'fase_no_es_hito';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  -- Un candado por orden (ADR-0190): dos toques a la vez se forman en fila y el segundo ve que ya está marcada.
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  if retail.fn_produccion_marca_viva(p_fase_id) is not null then
    raise exception '«%» ya está marcada como hecha', retail.fn_fase_nombre(v_op.clave) using hint = 'marca_ya_hecha';
  end if;
  insert into retail.produccion_fase_marcas (fase_id, nota, hecho_por, created_at)
    values (p_fase_id, v_nota, v_op.actor, clock_timestamp()) returning id into v_id;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_fase_marcada',
      'marcó ' || retail.fn_fase_nombre(v_op.clave) || ' como hecho en la ' || retail.fn_produccion_numero_texto(v_op.numero),
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', p_fase_id, 'fase', v_op.clave, 'marca_id', v_id),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la marca de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;

create or replace function retail.deshacer_marca_fase(p_fase_id uuid) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_op record; v_viva uuid; v_id uuid;
begin
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  if not retail.fn_fase_es_hito(v_op.clave) then
    raise exception 'La fase «%» no se marca: no hay nada que deshacer', retail.fn_fase_nombre(v_op.clave) using hint = 'fase_no_es_hito';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_viva := retail.fn_produccion_marca_viva(p_fase_id);
  if v_viva is null then
    raise exception '«%» no está marcada como hecha', retail.fn_fase_nombre(v_op.clave) using hint = 'marca_inexistente';
  end if;
  insert into retail.produccion_fase_marcas (fase_id, deshace_id, hecho_por, created_at)
    values (p_fase_id, v_viva, v_op.actor, clock_timestamp()) returning id into v_id;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_fase_desmarcada',
      'deshizo la marca de ' || retail.fn_fase_nombre(v_op.clave) || ' en la ' || retail.fn_produccion_numero_texto(v_op.numero),
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', p_fase_id, 'fase', v_op.clave, 'marca_id', v_viva),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el deshacer de la marca de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;

-- ---------- 5. fn_fases_de_orden: una fase hito se marca y no entra a la cadena ----------
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
  v_marca uuid; v_marca_at timestamptz;
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
    -- Una fase que se marca (Ploteo): hecha con una marca viva, pendiente sin ella. No cuenta prendas y no cambia lo que le entra a la fase siguiente.
    if retail.fn_fase_es_hito(v_f.clave) then
      v_marca := retail.fn_produccion_marca_viva(v_f.id);
      v_marca_at := (select m.created_at from retail.produccion_fase_marcas m where m.id = v_marca);
      v_empezada := v_marca is not null;
      v_estado := case when v_empezada then 'hecha' else 'pendiente' end;
      -- Pendiente, es la «actual» solo mientras nadie empezó una fase posterior (un modelo que se repite puede saltarse el ploteo).
      v_actual := (not v_empezada) and not v_hay_actual
        and not exists (
          select 1 from retail.produccion_fases g
           where g.produccion_id = p_produccion_id and g.secuencia > v_f.secuencia
             and (exists (select 1 from retail.produccion_avances a where a.fase_id = g.id)
                  or exists (select 1 from retail.produccion_salidas s where s.fase_id = g.id)));
      if v_actual then v_hay_actual := true; end if;
      v_desde_efectivo := case when v_empezada then v_marca_at when v_actual then v_prev_fin end;
      v_devengado := case when v_f.quien = 'servicio' then (case when v_empezada then round(coalesce(v_f.fijo_orden, 0), 2) else 0 end) else null end;
      v_salida := v_salida || jsonb_build_object(
        'id', v_f.id, 'clave', v_f.clave, 'nombre', retail.fn_fase_nombre(v_f.clave), 'secuencia', v_f.secuencia, 'posicion', v_f.posicion,
        'quien', v_f.quien, 'proveedor_id', v_f.proveedor_id, 'proveedor_nombre', v_f.proveedor_nombre,
        'tarifa_prenda', v_f.tarifa_prenda, 'fijo_orden', v_f.fijo_orden, 'cantidad_minima', v_f.cantidad_minima,
        'fecha_prometida', v_f.fecha_prometida, 'nota', v_f.nota,
        'entrada', 0, 'hechas', 0, 'afuera', 0, 'salieron', 0, 'segundas', 0, 'faltantes', 0,
        'estado', v_estado, 'actual', v_actual, 'empezada', v_empezada,
        'desde', v_desde_efectivo,
        'dias_en_fase', case when v_estado = 'hecha' then null
                             else greatest(floor(extract(epoch from (now() - v_desde_efectivo)) / 86400), 0)::int end,
        'devengado', v_devengado,
        'hito', true, 'marcada', v_empezada, 'marca_id', v_marca);
      continue;
    end if;
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
      'devengado', v_devengado,
      'hito', false, 'marcada', false, 'marca_id', null);
    v_prev_hecha := (v_estado = 'hecha');
    v_prev_hechas := v_hechas;
    v_prev_fin := coalesce(v_fin, v_prev_fin);
  end loop;
  return v_salida;
end;
$$;

-- ---------- 6. La línea de tiempo de la orden suma lo que se marcó (reemplazo anclado, idempotente) ----------
select pg_temp.insertar_antes(
  'retail.fn_orden_produccion(uuid)',
  E'    ) x;\n\n  return jsonb_build_object(', 1,
  $v$      union all
      select m.created_at, 1, jsonb_build_object(
          'cuando', m.created_at, 'quien_nombre', nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''),
          'tipo', case when m.deshace_id is null then 'marca' else 'desmarca' end,
          'fase_clave', f.clave, 'fase_nombre', retail.fn_fase_nombre(f.clave), 'cantidad', 0,
          'detalle', null, 'nota', m.nota, 'avance_id', null, 'id', m.id)
        from retail.produccion_fase_marcas m
        join retail.produccion_fases f on f.id = m.fase_id
        left join public.personas pe on pe.id = m.hecho_por
       where f.produccion_id = p_produccion_id
$v$,
  $v$produccion_fase_marcas$v$);

-- ---------- 7. Cambiar quién: una fase hito marcada ya empezó ----------
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
  -- Empezó lo que tiene algo anotado y vivo: lo neto de avances y salidas, o (en una fase que se marca) una marca viva.
  if coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = p_fase_id), 0) <> 0
     or coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = p_fase_id), 0) <> 0
     or retail.fn_produccion_marca_viva(p_fase_id) is not null then
    raise exception 'La fase «%» ya empezó: quién la hace no se cambia', retail.fn_fase_nombre(v_f.clave) using hint = 'fase_empezada';
  end if;
  -- Las demás fases de la orden viajan como están (en el Taller) para que la ruta completa pase la misma validación que al abrir.
  v_n := retail.fn_produccion_fases_normalizar(jsonb_build_array(jsonb_build_object(
    'clave', v_f.clave, 'posicion', v_f.posicion, 'quien', p_quien, 'proveedor_id', p_proveedor_id, 'tarifa_prenda', p_tarifa_prenda,
    'fijo_orden', p_fijo_orden, 'cantidad_minima', p_cantidad_minima, 'fecha_prometida', p_fecha_prometida, 'nota', v_f.nota))
    || coalesce((select jsonb_agg(jsonb_build_object('clave', o.clave, 'posicion', o.posicion, 'quien', 'taller') order by o.secuencia)
                   from retail.produccion_fases o where o.produccion_id = v_f.produccion_id and o.id <> p_fase_id), '[]'::jsonb)
  ) -> 0;
  update retail.produccion_fases f set
    quien = v_n ->> 'quien', proveedor_id = nullif(v_n ->> 'proveedor_id', '')::uuid,
    tarifa_prenda = nullif(v_n ->> 'tarifa_prenda', '')::numeric, fijo_orden = coalesce((v_n ->> 'fijo_orden')::numeric, 0),
    cantidad_minima = nullif(v_n ->> 'cantidad_minima', '')::integer, fecha_prometida = nullif(v_n ->> 'fecha_prometida', '')::date
  where f.id = p_fase_id;
  return (select jsonb_agg(x) -> 0 from jsonb_array_elements(retail.fn_fases_de_orden(v_f.produccion_id)) x where (x ->> 'id')::uuid = p_fase_id);
end;
$$;

-- ---------- 8. Un servicio de ploteo cobra por orden (el fijo), no por prenda ----------
create or replace function retail.fn_produccion_fases_normalizar(p_fases jsonb) returns jsonb
language plpgsql stable
set search_path = retail, public, extensions
as $$
declare
  v_f jsonb; v_clave text; v_quien text; v_posicion text; v_prov uuid; v_tarifa numeric; v_fijo numeric; v_min integer;
  v_fecha date; v_nota text; v_rubro text; v_activo boolean; v_salida jsonb := '[]'::jsonb; v_claves text[] := '{}';
  v_l_tarifa numeric; v_l_min integer; v_l_fijo numeric;
  v_solo_nuevas constant text[] := array['ploteo', 'habilitado', 'ojales_botones', 'limpieza_revision', 'planchado', 'etiquetado_embolsado'];
begin
  if p_fases is null or jsonb_typeof(p_fases) <> 'array' or jsonb_array_length(p_fases) = 0 then
    raise exception 'La orden necesita sus fases: por lo menos Corte, Costura y Acabado' using hint = 'fases_espina';
  end if;
  for v_f in select * from jsonb_array_elements(p_fases) loop
    v_clave := lower(btrim(coalesce(v_f ->> 'clave', '')));
    if v_clave not in ('ploteo', 'corte', 'habilitado', 'costura', 'ojales_botones', 'limpieza_revision', 'planchado', 'etiquetado_embolsado',
                       'acabado', 'bordado', 'estampado', 'lavanderia') then
      raise exception 'Una de las fases no existe: «%»', v_clave using hint = 'fase_desconocida';
    end if;
    if v_clave = any (v_claves) then
      raise exception 'La fase «%» va una sola vez en la orden', retail.fn_fase_nombre(v_clave) using hint = 'fase_repetida';
    end if;
    v_claves := v_claves || v_clave;
    v_posicion := nullif(lower(btrim(coalesce(v_f ->> 'posicion', ''))), '');
    if v_clave in ('bordado', 'estampado') then
      if v_posicion is null or v_posicion not in ('pieza', 'prenda') then
        raise exception 'El % dice si va sobre la pieza cortada o sobre la prenda armada', retail.fn_fase_nombre(v_clave) using hint = 'fase_sin_posicion';
      end if;
    elsif v_posicion is not null then
      raise exception 'Solo bordado y estampado eligen si van sobre pieza o sobre prenda' using hint = 'fase_con_posicion';
    end if;
    v_quien := lower(btrim(coalesce(v_f ->> 'quien', 'taller')));
    if v_quien not in ('taller', 'servicio') then
      raise exception 'Cada fase la hace el Taller o un servicio de afuera' using hint = 'fase_quien';
    end if;
    v_nota := nullif(btrim(coalesce(v_f ->> 'nota', '')), '');
    v_prov := null; v_tarifa := null; v_fijo := 0; v_min := null; v_fecha := null;
    if v_quien = 'servicio' then
      begin
        v_prov := nullif(v_f ->> 'proveedor_id', '')::uuid;
      exception when others then
        raise exception 'El proveedor de «%» no es válido', retail.fn_fase_nombre(v_clave) using hint = 'fase_proveedor';
      end;
      if v_prov is null then
        raise exception 'Si «%» sale a un servicio, dice a quién', retail.fn_fase_nombre(v_clave) using hint = 'fase_sin_proveedor';
      end if;
      select pr.rubro, pr.activo into v_rubro, v_activo from retail.proveedores_produccion pr where pr.id = v_prov;
      if v_rubro is null or v_activo is not true then
        raise exception 'Ese proveedor no está activo en el directorio del Taller' using hint = 'fase_proveedor_inactivo';
      end if;
      if v_rubro in ('tela', 'avios') then
        raise exception 'Ese proveedor vende tela o avíos; un servicio de «%» es de maquila u otro rubro', retail.fn_fase_nombre(v_clave)
          using hint = 'fase_proveedor_rubro';
      end if;
      begin
        v_tarifa := nullif(btrim(coalesce(v_f ->> 'tarifa_prenda', '')), '')::numeric;
        v_fijo := coalesce(nullif(btrim(coalesce(v_f ->> 'fijo_orden', '')), '')::numeric, 0);
        v_min := nullif(btrim(coalesce(v_f ->> 'cantidad_minima', '')), '')::integer;
      exception when others then
        raise exception 'La tarifa de «%» no es un número válido', retail.fn_fase_nombre(v_clave) using hint = 'fase_tarifa_invalida';
      end;
      -- Sin tarifa escrita: la lista de precios del proveedor para esa fase (la vigente más reciente).
      if v_tarifa is null then
        -- Solo se toma lo de la lista si hay una fila: un FOR sin filas deja en NULL lo que se le pasó como destino (se perdería el fijo escrito).
        for v_l_tarifa, v_l_min, v_l_fijo in
          select t.tarifa_prenda, t.cantidad_minima, t.fijo_orden
          from retail.proveedor_tarifas t
          where t.proveedor_id = v_prov and t.fase_clave = v_clave and t.vigente_desde <= retail.fn_hoy_lima()
          order by t.vigente_desde desc limit 1
        loop
          v_tarifa := v_l_tarifa; v_min := coalesce(v_min, v_l_min); v_fijo := case when v_fijo > 0 then v_fijo else v_l_fijo end;
          exit;
        end loop;
      end if;
      if v_clave = 'ploteo' then
        -- El ploteo se cobra por ORDEN (el fijo): no hay tarifa por prenda ni cantidad mínima.
        v_tarifa := null; v_min := null;
        if v_fijo is null or v_fijo <= 0 then
          raise exception 'Falta lo que cobra el ploteo por esta orden: escríbelo o guárdalo en la lista de precios del proveedor' using hint = 'fase_sin_fijo';
        end if;
      elsif v_tarifa is null or v_tarifa <= 0 then
        raise exception 'Falta la tarifa por prenda de «%»: escríbela o guárdala en la lista de precios del proveedor', retail.fn_fase_nombre(v_clave)
          using hint = 'fase_sin_tarifa';
      end if;
      if (v_tarifa is not null and v_tarifa > 9999.99) or v_fijo < 0 or v_fijo > 99999.99 or (v_min is not null and v_min <= 0) then
        raise exception 'La tarifa de «%» está fuera de rango', retail.fn_fase_nombre(v_clave) using hint = 'fase_tarifa_invalida';
      end if;
      begin
        v_fecha := nullif(v_f ->> 'fecha_prometida', '')::date;
      exception when others then
        raise exception 'La fecha prometida de «%» no es válida', retail.fn_fase_nombre(v_clave) using hint = 'fase_fecha_invalida';
      end;
      if v_fecha is not null and v_fecha < retail.fn_hoy_lima() then
        raise exception 'La fecha prometida de «%» ya pasó', retail.fn_fase_nombre(v_clave) using hint = 'fase_fecha_pasada';
      end if;
    end if;
    v_salida := v_salida || jsonb_build_object(
      'clave', v_clave, 'posicion', v_posicion, 'secuencia', retail.fn_fase_secuencia(v_clave, v_posicion), 'quien', v_quien,
      'proveedor_id', v_prov, 'tarifa_prenda', v_tarifa, 'fijo_orden', v_fijo, 'cantidad_minima', v_min, 'fecha_prometida', v_fecha, 'nota', v_nota);
  end loop;
  -- La ruta: la nueva si lleva alguna fase que solo ella tiene; si no, la anterior. Las dos a la vez no.
  if v_claves && v_solo_nuevas then
    if 'acabado' = any (v_claves) then
      raise exception 'Acabado es de la ruta anterior: con las fases nuevas se usan Limpiar hilos y revisar, Planchado y Etiquetar y embolsar'
        using hint = 'fases_mezcla';
    end if;
    if not (v_claves @> array['ploteo', 'corte', 'habilitado', 'costura', 'limpieza_revision', 'planchado', 'etiquetado_embolsado']) then
      raise exception 'La orden necesita sus fases: Ploteo, Corte, Habilitado, Costura, Limpiar hilos y revisar, Planchado y Etiquetar y embolsar'
        using hint = 'fases_espina';
    end if;
  elsif not (v_claves @> array['corte', 'costura', 'acabado']) then
    raise exception 'La orden necesita sus fases: por lo menos Corte, Costura y Acabado' using hint = 'fases_espina';
  end if;
  return v_salida;
end;
$$;

create or replace function retail.guardar_tarifa_servicio(
  p_proveedor_id uuid, p_fase_clave text, p_tarifa_prenda numeric, p_cantidad_minima integer default null, p_fijo_orden numeric default 0, p_nota text default null
) returns uuid
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_pr record; v_actor uuid; v_id uuid; v_nota text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder carga la lista de precios de los servicios de afuera' using errcode = '42501', hint = 'tarifa_solo_lider';
  end if;
  select pr.id, pr.nombre, pr.rubro into v_pr from retail.proveedores_produccion pr where pr.id = p_proveedor_id;
  if v_pr.id is null then
    raise exception 'Ese proveedor no existe' using hint = 'tarifa_proveedor_inexistente';
  end if;
  if v_pr.rubro in ('tela', 'avios') then
    raise exception '% vende tela o avíos, no un servicio de afuera: su lista de precios no lleva fases', v_pr.nombre using hint = 'tarifa_no_es_servicio';
  end if;
  if p_fase_clave is null or p_fase_clave not in ('ploteo', 'corte', 'habilitado', 'costura', 'ojales_botones', 'limpieza_revision', 'planchado',
                                                  'etiquetado_embolsado', 'acabado', 'bordado', 'estampado', 'lavanderia') then
    raise exception 'Elige la fase a la que se le pone precio' using hint = 'tarifa_fase_invalida';
  end if;
  if p_fase_clave = 'ploteo' then
    -- El ploteo se cobra por ORDEN: solo el fijo; sin tarifa por prenda ni cantidad mínima.
    if coalesce(p_tarifa_prenda, 0) <> 0 then
      raise exception 'El ploteo se cobra por orden, no por prenda: escribe solo el fijo por orden' using hint = 'tarifa_ploteo_es_fijo';
    end if;
    if p_cantidad_minima is not null then
      raise exception 'El ploteo no pide cantidad mínima: se cobra por orden' using hint = 'tarifa_ploteo_es_fijo';
    end if;
    if coalesce(p_fijo_orden, 0) <= 0 or p_fijo_orden > 99999 then
      raise exception 'Escribe lo que cobra el ploteo por cada orden' using hint = 'tarifa_ploteo_sin_fijo';
    end if;
  else
    if p_tarifa_prenda is null or p_tarifa_prenda <= 0 or p_tarifa_prenda > 99999 then
      raise exception 'La tarifa por prenda es un monto mayor que cero' using hint = 'tarifa_monto_invalido';
    end if;
    if p_cantidad_minima is not null and p_cantidad_minima <= 0 then
      raise exception 'La cantidad mínima es de una prenda en adelante (o se deja vacía si el servicio no pide mínimo)' using hint = 'tarifa_minimo_invalido';
    end if;
    if coalesce(p_fijo_orden, 0) < 0 or coalesce(p_fijo_orden, 0) > 99999 then
      raise exception 'El fijo por orden es cero o más (el ponchado de un bordado, por ejemplo)' using hint = 'tarifa_fijo_invalido';
    end if;
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');
  v_actor := retail.fn_actor_persona_id(true);

  insert into retail.proveedor_tarifas (proveedor_id, fase_clave, tarifa_prenda, cantidad_minima, fijo_orden, vigente_desde, nota, creado_por)
    values (p_proveedor_id, p_fase_clave, case when p_fase_clave = 'ploteo' then null else round(p_tarifa_prenda, 2) end, p_cantidad_minima,
            round(coalesce(p_fijo_orden, 0), 2), retail.fn_hoy_lima(), v_nota, v_actor)
  on conflict (proveedor_id, fase_clave, vigente_desde) do update
    set tarifa_prenda = excluded.tarifa_prenda, cantidad_minima = excluded.cantidad_minima, fijo_orden = excluded.fijo_orden, nota = excluded.nota, creado_por = excluded.creado_por
  returning id into v_id;

  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'tarifa_servicio_guardada',
      'cargó la tarifa de ' || v_pr.nombre || ' para ' || retail.fn_fase_nombre(p_fase_clave),
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_ubicacion_actual_persona(), retail.fn_ubicacion_actual_persona(),
      'proveedor_tarifas', v_id::text, now(),
      jsonb_build_object('proveedor_id', p_proveedor_id, 'fase', p_fase_clave), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la tarifa de % (%)', v_pr.nombre, sqlerrm;
  end;
  return v_id;
end;
$$;

-- ---------- 9. Permisos ----------
revoke all on function retail.marcar_fase_hecha(uuid, text) from public, anon;
revoke all on function retail.deshacer_marca_fase(uuid) from public, anon;
grant execute on function retail.marcar_fase_hecha(uuid, text) to authenticated, service_role;
grant execute on function retail.deshacer_marca_fase(uuid) to authenticated, service_role;
-- Internas: nadie las llama desde la API.
revoke all on function retail.fn_fase_es_hito(text) from public, anon, authenticated;
revoke all on function retail.fn_produccion_marca_viva(uuid) from public, anon, authenticated;
-- Las funciones reescritas conservan sus permisos (`create or replace`); se repiten por si la base las perdió.
revoke all on function retail.fn_fases_de_orden(uuid) from public, anon;
grant execute on function retail.fn_fases_de_orden(uuid) to authenticated, service_role;
revoke all on function retail.cambiar_quien_fase(uuid, text, uuid, numeric, numeric, integer, date) from public, anon;
grant execute on function retail.cambiar_quien_fase(uuid, text, uuid, numeric, numeric, integer, date) to authenticated, service_role;
revoke all on function retail.guardar_tarifa_servicio(uuid, text, numeric, integer, numeric, text) from public, anon;
grant execute on function retail.guardar_tarifa_servicio(uuid, text, numeric, integer, numeric, text) to authenticated, service_role;

reset lock_timeout;
