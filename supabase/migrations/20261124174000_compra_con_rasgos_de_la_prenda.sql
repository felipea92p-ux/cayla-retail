-- Margen por rasgos (ADR-0700), actividad 3 de 6: «Compré ropa» guarda lo que la prenda tiene y el precio que se vio afuera. Una sola parte.
--
-- EL PROBLEMA PRIMERO. El precio de venta de una prenda de proveedor lo escribe quien compra, en «Compré ropa», desde el celular (ADR-0480):
-- 82 de 139 líneas de compra en producción ya traen precio. Es quien eligió la prenda la que sabe si nadie la tiene, si está en tendencia o si
-- la tela se nota, y es ahí donde se piensa el precio, antes de que la etiqueta se imprima sola al recibir (ADR-0180). Si las casillas no se
-- guardan con la línea, se pierden: quien recibe no las sabe, y en 3 a 6 meses nadie puede medir si «En tendencia» se vende al precio alto.
--
-- QUÉ CREA.
--   1. `orden_compra_items.rasgos` (text[]): las casillas de la prenda que regían al fijar su precio, en el orden de la hoja. Solo los cuatro
--      códigos de ADR-0700; nulo = ninguna. No depende del precio: una prenda «a la espera de precio» (ADR-0660) también guarda lo que tiene,
--      para que quien ponga el precio después lo vea. NO es `sugerido_motivos` (el porqué de un precio alto o bajo, 20261022080000): lo que la
--      prenda tiene es de la prenda, valga lo que valga.
--   2. `orden_compra_items.precio_visto_afuera` (numeric(12,2)): el precio de la misma prenda, o una parecida, en otra tienda. Es un techo del
--      sugerido, no suma nada. De S/ 0.01 a S/ 5 000, como todo precio.
--   3. `fn_rasgos_de_linea(jsonb)` y `fn_precio_visto_de_linea(jsonb)`: leen lo que manda la pantalla y frenan lo que no se entiende, con su hint.
--   4. REEMPLAZO ANCLADO de `fn_registrar_compra_rapida_base`: justo después de escribir las líneas de cada orden, la misma función completa
--      sus casillas y su precio visto, por la posición de cada línea, en la misma transacción. No se tocan las columnas ni el `select` del
--      `insert`: `20261113211000` (por definir) ancla ese bloque entero, y las pruebas que la vuelven a pegar dejarían de encontrarlo.
--   5. `fn_reglas_de_precio()` trae además las dos listas (ids): toda hoja que fija un precio sabe sola si la marca suma «Marca que el cliente
--      conoce» o si el tejido trae «Tela que se nota», sin otra lectura.
--
-- DECIDÍ: columnas propias en la línea, escritas por la misma función que la crea (todo o nada).
-- DESCARTÉ: (a) los códigos en `sugerido_motivos`: su candado exige un precio sugerido, y la prenda «a la espera» perdería sus casillas; (b) una
-- llamada aparte después de registrar: una compra podría quedar sin casillas si la segunda no llega; (c) agregar las columnas dentro del
-- `insert`: rompería el ancla de 20261113211000 en las pruebas que la vuelven a pegar.
-- SE ROMPE SI: una orden se reescribe desde «Editar orden» del escritorio (`fn_orden_compra_escribir_lineas` borra y escribe las líneas sin
-- estas columnas): la compra pierde sus casillas. Lo cierra 20261124181000. «Corregir la compra» (`corregir_compra_rapida`) no la toca: solo
-- cambia campos o mueve la línea.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (solo con el OK de Felipe). Después de 20261124170000. Una parte: dos columnas con candado en una tabla que se usa
-- (sin políticas en esta parte), funciones nuevas y un reemplazo anclado que se detiene si el texto vivo cambió (producción y el repo tienen la
-- misma `fn_registrar_compra_rapida_base`, md5 52a061ca… el 2026-11-24). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1 y 2. Las columnas ----------

alter table retail.orden_compra_items add column if not exists rasgos text[];
alter table retail.orden_compra_items add column if not exists precio_visto_afuera numeric(12, 2);
comment on column retail.orden_compra_items.rasgos is
  'Lo que la prenda tiene al fijar su precio (ADR-0700): nadie_la_tiene, en_tendencia, tela_que_se_nota, marca_conocida. Nulo = ninguna.';
comment on column retail.orden_compra_items.precio_visto_afuera is
  'El precio de la misma prenda, o una parecida, en otra tienda (ADR-0700): techo del precio sugerido. Nulo = no se vio.';

do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.orden_compra_items'::regclass and conname = 'orden_compra_items_rasgos') then
    alter table retail.orden_compra_items add constraint orden_compra_items_rasgos check (
      rasgos is null or (cardinality(rasgos) between 1 and 4
                         and rasgos <@ array['nadie_la_tiene', 'en_tendencia', 'tela_que_se_nota', 'marca_conocida']::text[]));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.orden_compra_items'::regclass and conname = 'orden_compra_items_visto_afuera') then
    alter table retail.orden_compra_items add constraint orden_compra_items_visto_afuera check (
      precio_visto_afuera is null or (precio_visto_afuera > 0 and precio_visto_afuera <= 5000));
  end if;
end $mig$;

-- ---------- 3. Leer lo que manda la pantalla ----------

-- Las casillas de una línea, en el orden de la hoja y sin repetir. Sin el dato, `null` o una lista vacía: ninguna.
create or replace function retail.fn_rasgos_de_linea(p jsonb)
returns text[]
language plpgsql immutable set search_path = retail, public, extensions as $$
declare
  v_orden constant text[] := array['nadie_la_tiene', 'en_tendencia', 'tela_que_se_nota', 'marca_conocida'];
  v text[];
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) <> 'array' or exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) <> 'string' or not (e #>> '{}') = any (v_orden)) then
    raise exception 'Una casilla de la prenda no se entiende' using errcode = 'P0001', hint = 'compra_rapida_rasgos';
  end if;
  v := array(select r from unnest(v_orden) with ordinality o(r, n) where exists (select 1 from jsonb_array_elements_text(p) e where e = r) order by n);
  return nullif(v, '{}'::text[]);
end $$;

-- El precio visto afuera: un número de S/ 0.01 a S/ 5 000, con dos decimales. Sin el dato, `null`.
create or replace function retail.fn_precio_visto_de_linea(p jsonb)
returns numeric
language plpgsql immutable set search_path = retail, public, extensions as $$
declare
  v numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' or (jsonb_typeof(p) = 'string' and btrim(p #>> '{}') = '') then
    return null;
  end if;
  begin
    v := round((p #>> '{}')::numeric, 2);
  exception when others then
    v := null;
  end;
  if v is null or v <= 0 or v > 5000 then
    raise exception 'El precio que se vio afuera va de S/ 0.10 a S/ 5 000' using errcode = 'P0001', hint = 'compra_rapida_visto';
  end if;
  return v;
end $$;

-- ---------- 4. El reemplazo anclado ----------

create or replace function pg_temp.reemplazar_rasgos(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_rasgos(
  'retail.fn_registrar_compra_rapida_base(uuid,uuid,text,numeric,text,jsonb)',
  $v$    v_ordenes := v_ordenes || jsonb_build_object('id', v_orden, 'numero', v_numero, 'destino_id', v_destino);$v$,
  $n$    -- ADR-0700: lo que la prenda tiene y el precio que se vio afuera, en la línea de la misma posición (la del `insert` de arriba).
    update retail.orden_compra_items i
       set rasgos = retail.fn_rasgos_de_linea(x.v -> 'linea' -> 'rasgos'),
           precio_visto_afuera = retail.fn_precio_visto_de_linea(x.v -> 'linea' -> 'precio_visto_afuera')
      from (select v, row_number() over (order by (v ->> 'posicion')::integer) as pos
              from jsonb_array_elements(v_validas) v where (v ->> 'destino_id')::uuid = v_destino) x
     where i.orden_compra_id = v_orden and i.posicion = x.pos
       and (x.v -> 'linea' ? 'rasgos' or x.v -> 'linea' ? 'precio_visto_afuera');
    v_ordenes := v_ordenes || jsonb_build_object('id', v_orden, 'numero', v_numero, 'destino_id', v_destino);$n$);

-- ---------- 5. La regla trae las dos listas ----------

create or replace function retail.fn_reglas_de_precio()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  r retail.reglas_de_precio;
  v_listas jsonb;
begin
  if not coalesce(retail.fn_tiene_acceso_retail(), false) then
    raise exception 'Tu cuenta no tiene acceso al ERP.' using errcode = '42501';
  end if;
  -- Solo los ids: con ellos la hoja sabe si la marca o el tejido de la prenda suman su casilla (ADR-0700).
  v_listas := jsonb_build_object(
    'marcas_conocidas', coalesce((select jsonb_agg(m.id order by m.id) from retail.marcas m where m.conocida and m.activo), '[]'::jsonb),
    'tejidos_que_se_notan', coalesce((select jsonb_agg(t.id order by t.id) from retail.tejidos t where t.se_nota and t.activo), '[]'::jsonb));
  select * into r from retail.reglas_de_precio order by id desc limit 1;
  if r.id is null then
    return jsonb_build_object('margen_base', 37,
      'puntos', jsonb_build_object('nadie_la_tiene', 3, 'en_tendencia', 3, 'tela_que_se_nota', 3, 'marca_conocida', 3),
      'registrado_en', null, 'registrado_por', null) || v_listas;
  end if;
  return jsonb_build_object('margen_base', r.margen_base,
    'puntos', jsonb_build_object('nadie_la_tiene', r.puntos_nadie_la_tiene, 'en_tendencia', r.puntos_en_tendencia,
                                 'tela_que_se_nota', r.puntos_tela_que_se_nota, 'marca_conocida', r.puntos_marca_conocida),
    'registrado_en', r.registrado_en,
    'registrado_por', (select nullif(trim(concat_ws(' ', p.nombres, p.apellidos)), '') from public.personas p where p.id = r.registrado_por))
    || v_listas;
end $$;

revoke all on function retail.fn_rasgos_de_linea(jsonb) from public, anon, authenticated;
revoke all on function retail.fn_precio_visto_de_linea(jsonb) from public, anon, authenticated;
