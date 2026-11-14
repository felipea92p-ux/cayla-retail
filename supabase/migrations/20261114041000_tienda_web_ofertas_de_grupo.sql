-- ============================================================================
-- 20261114041000 — La tienda web cobra «Llevar varias y pagar menos» (ADR-0655, actividad 7)
--
-- EL PROBLEMA. La caja (20261114011000) y los apartados (20261114032000) ya cobran el 3x2, «N por S/» y «la N.ª al X %», pero la tienda web
--   seguía cobrando el precio normal: la hoja de la oferta lo avisaba («en la tienda web todavía se cobra el precio normal»).
--
-- LA REGLA DE LA WEB. Un pedido web nace con el precio de ESE día y ya no se rearma: «la prenda de un pedido web y su precio no se cambian»
--   (`fn_pedido_web_linea_reglas`, ADR-0408). La clienta no edita su pedido: la única que quita una prenda es la tienda, al confirmar, cuando
--   no la tiene. Si eso rompe un 3x2, las demás conservan el precio con el que se separaron (la tienda no le cobra más a la clienta por lo que
--   la tienda no tuvo). Es distinto de un apartado, donde quien quita es la clienta (ADR-0655, «Parte 4»).
--
-- LO QUE HACE.
--   1. `pedido_web_lineas` guarda la parte de la oferta de grupo de cada prenda (`descuento_grupo`, DENTRO de `descuento`, así su `precio`
--      calculado, el total del pedido y el reparto del cupón ya la cuentan) y su oferta (`oferta_grupo_id`); el candado «descuento con
--      campaña» deja fuera esa parte, y un disparador nuevo hace que no cambie después de nacer (como el resto de la línea).
--   2. `tienda_separar` arma los grupos con LA regla de hoy en esa tienda (`fn_ofertas_de_grupo`, de a una prenda, de la más cara; empate,
--      por prenda: el orden de la base) y pone su parte en el descuento de cada prenda. Si la bolsa le mostró otro ahorro (`ahorro_grupo` de
--      cada línea), no separa: «el precio de una prenda de tu bolsa cambió», como cuando cambia el precio.
--   3. `crear_pedido_web` acepta y guarda la parte y su oferta.
--   4. `fn_pedido_web_vender` lleva la parte a la venta sin motivo y con su oferta, como la caja (por su propio `insert`: el de siempre lo
--      dejaron otras migraciones que sus pruebas vuelven a pegar).
--   5. `tienda_bolsa_grupos(lineas, sede)`: lo que ahorra cada prenda de la bolsa con su oferta de grupo, para que la tienda lo muestre antes
--      de separar. Es aparte de `tienda_bolsa` (que no se toca) y la tienda la pide en la misma consulta.
--
-- DESCARTÉ: rearmar el grupo cuando la tienda quita una prenda al confirmar (le cobraría más a la clienta por una falta de la tienda y
--   rompería la regla de que el precio de una línea no cambia); que la tienda calcule los grupos (el precio lo decide la base, ADR-0408).
--
-- SE ROMPE SI: alguien cambia las líneas ancladas de las tres funciones antes de pegar esto (los reemplazos se detienen sin tocar nada).
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: `alter table pedido_web_lineas` (columnas y candados, sin políticas), un
--   disparador con `create or replace trigger` y funciones. Va DESPUÉS de 20261114032000 (usa `fn_ofertas_de_grupo` con `fn_repartir_grupos`).
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:tienda-ofertas-de-grupo`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_repartir_grupos(jsonb)') is null then
    raise exception 'Falta 20261114032000 (fn_repartir_grupos): esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

-- 1. La parte del grupo en cada prenda del pedido -------------------------------------------------------------------------------------

alter table retail.pedido_web_lineas add column if not exists descuento_grupo numeric(10, 2) not null default 0;
alter table retail.pedido_web_lineas add column if not exists oferta_grupo_id uuid references retail.campana_reglas (id);

comment on column retail.pedido_web_lineas.descuento_grupo is
  'ADR-0655. La parte del ahorro de su oferta de grupo (3x2, N por S/, la N.ª al X %) que le tocó a esta prenda al separar. Está DENTRO de descuento: precio = precio_lista − descuento ya la cuenta. No cambia después (el pedido nace con el precio de ese día).';
comment on column retail.pedido_web_lineas.oferta_grupo_id is 'ADR-0655. La oferta de grupo de la que viene descuento_grupo.';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.pedido_web_lineas'::regclass and conname = 'pedido_web_lineas_grupo_dentro_del_descuento') then
    alter table retail.pedido_web_lineas add constraint pedido_web_lineas_grupo_dentro_del_descuento
      check (descuento_grupo >= 0 and descuento_grupo <= descuento);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.pedido_web_lineas'::regclass and conname = 'pedido_web_lineas_grupo_con_oferta') then
    alter table retail.pedido_web_lineas add constraint pedido_web_lineas_grupo_con_oferta
      check ((descuento_grupo > 0) = (oferta_grupo_id is not null));
  end if;
  -- Un descuento de campaña lleva su campaña; la parte de la oferta de grupo viene de su oferta y no cuenta ahí.
  if position('descuento_grupo' in coalesce((select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'retail.pedido_web_lineas'::regclass and conname = 'pedido_web_lineas_descuento_con_campana'), '')) = 0 then
    alter table retail.pedido_web_lineas drop constraint if exists pedido_web_lineas_descuento_con_campana;
    alter table retail.pedido_web_lineas add constraint pedido_web_lineas_descuento_con_campana
      check ((descuento - descuento_grupo > 0) = (descuento_etiqueta_id is not null));
  end if;
end;
$$;

-- Como el precio de la línea (fn_pedido_web_linea_reglas), su parte del grupo no se reescribe.
create or replace function retail.fn_pedido_web_linea_grupo_fijo()
returns trigger
language plpgsql
set search_path to 'retail', 'public'
as $function$
begin
  if (new.descuento_grupo, new.oferta_grupo_id) is distinct from (old.descuento_grupo, old.oferta_grupo_id) then
    raise exception 'La parte de una oferta de grupo de una prenda de un pedido web no se cambia.' using errcode = '23514', hint = 'pedido_web_inmutable';
  end if;
  return new;
end;
$function$;

create or replace trigger pedido_web_lineas_grupo_fijo
  before update of descuento_grupo, oferta_grupo_id on retail.pedido_web_lineas
  for each row execute function retail.fn_pedido_web_linea_grupo_fijo();

-- 2. Los reemplazos anclados ---------------------------------------------------------------------------------------------------------

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 2a. crear_pedido_web: acepta la parte del grupo y su oferta.

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'crear_pedido_web'),
  $v$  v_etiqueta uuid;
begin$v$,
  $n$  v_etiqueta uuid;
  v_grupo numeric;  -- ADR-0655: la parte de la oferta de grupo de la prenda (DENTRO de v_descuento)
  v_oferta uuid;
begin$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'crear_pedido_web'),
  $v$      v_etiqueta := nullif(v_linea ->> 'descuento_etiqueta_id', '')::uuid;
$v$,
  $n$      v_etiqueta := nullif(v_linea ->> 'descuento_etiqueta_id', '')::uuid;
      v_grupo := coalesce((v_linea ->> 'descuento_grupo')::numeric, 0);
      v_oferta := nullif(v_linea ->> 'oferta_grupo_id', '')::uuid;
$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'crear_pedido_web'),
  $v$    if (v_descuento > 0) <> (v_etiqueta is not null)
$v$,
  $n$    -- ADR-0655: la parte de una oferta de grupo está dentro del descuento, no pide campaña y sí su oferta.
    if v_grupo < 0 or v_grupo > v_descuento or round(v_grupo, 2) <> v_grupo or (v_grupo > 0) <> (v_oferta is not null)
       or (v_oferta is not null and not exists (select 1 from retail.campana_reglas r where r.id = v_oferta and r.tipo <> 'pct')) then
      raise exception 'La oferta de la prenda % de la bolsa no es válida.', v_pos using errcode = '22023', hint = 'pedido_web_linea_invalida';
    end if;
    if (v_descuento - v_grupo > 0) <> (v_etiqueta is not null)
$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'crear_pedido_web'),
  $v$    insert into retail.pedido_web_lineas (pedido_id, posicion, variante_id, precio_lista, descuento, descuento_etiqueta_id)
      values (v_id, v_pos, v_variante, v_precio, v_descuento, v_etiqueta);$v$,
  $n$    insert into retail.pedido_web_lineas (pedido_id, posicion, variante_id, precio_lista, descuento, descuento_etiqueta_id, descuento_grupo, oferta_grupo_id)
      values (v_id, v_pos, v_variante, v_precio, v_descuento, v_etiqueta, v_grupo, v_oferta);$n$,
  1);

-- 2b. tienda_separar: los grupos con LA regla de hoy en esa tienda, y lo que mostró la bolsa.

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'tienda_separar'),
  $v$  v_libres integer;
begin$v$,
  $n$  v_libres integer;
  v_grupos jsonb := '{}'::jsonb;  -- ADR-0655: {n.º de la prenda en el motor: {d: su parte, r: su oferta, v: su variante}}
begin$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'tienda_separar'),
  $v$  v_resumen := retail.crear_pedido_web(v_clienta, p_ubicacion_id, v_para_el_motor, p_token);
$v$,
  $n$  -- ADR-0655 (actividad 7): las ofertas de grupo (3x2, N por S/, la N.ª al X %) con LA regla de hoy en esa tienda, de a una prenda y en el
  -- orden de la base (de la más cara; empate, por prenda). Su parte va DENTRO del descuento de cada prenda: el pedido nace con el precio de
  -- ese día y ya no se rearma (la prenda de un pedido web y su precio no se cambian).
  v_grupos := (
    with u as (
      select o.n::integer as idx, (o.x ->> 'variante_id')::uuid as variante_id, (o.x ->> 'precio_lista')::numeric as precio
      from jsonb_array_elements(v_para_el_motor) with ordinality o(x, n)
    ),
    l as (select row_number() over (order by u.precio desc, u.variante_id, u.idx)::integer as linea, u.* from u),
    g as (select * from retail.fn_ofertas_de_grupo(retail.fn_hoy_lima(), p_ubicacion_id,
            (select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'precio_unitario', l.precio, 'cantidad', 1) order by l.linea), '[]'::jsonb) from l), 0))
    select coalesce(jsonb_object_agg(l.idx::text, jsonb_build_object('d', g.descuento, 'r', g.regla_id, 'v', l.variante_id)), '{}'::jsonb)
    from l join g on g.linea = l.linea
    where g.descuento > 0
  );
  -- Lo que la bolsa le mostró (si lo manda) tiene que ser lo de ahora: si la oferta cambió mientras miraba, no se separa.
  for r in
    select (e.x ->> 'variante_id')::uuid as variante_id, (e.x ->> 'ahorro_grupo')::numeric as visto
      from jsonb_array_elements(p_lineas) e(x)
     where jsonb_typeof(e.x -> 'ahorro_grupo') = 'number'
  loop
    if abs(r.visto - coalesce((select sum((x.value ->> 'd')::numeric) from jsonb_each(v_grupos) x where (x.value ->> 'v')::uuid = r.variante_id), 0)) > 0.005 then
      raise exception 'El precio de una prenda de tu bolsa cambió.' using errcode = '22023', hint = 'tienda_separar_precio', detail = r.variante_id::text;
    end if;
  end loop;
  v_para_el_motor := (
    select jsonb_agg(case when v_grupos ? o.n::text
                          then o.x || jsonb_build_object('descuento', (o.x ->> 'descuento')::numeric + (v_grupos -> o.n::text ->> 'd')::numeric,
                                                         'descuento_grupo', (v_grupos -> o.n::text ->> 'd')::numeric,
                                                         'oferta_grupo_id', v_grupos -> o.n::text ->> 'r')
                          else o.x end
                     order by o.n)
    from jsonb_array_elements(v_para_el_motor) with ordinality o(x, n)
  );

  v_resumen := retail.crear_pedido_web(v_clienta, p_ubicacion_id, v_para_el_motor, p_token);
$n$,
  1);

-- 2c. fn_pedido_web_vender: la parte del grupo va a la venta sin motivo y con su oferta. (El `insert` de siempre queda tal cual, en el
-- `else`: lo dejaron otras migraciones que sus pruebas vuelven a pegar, y un motivo «campaña» sin campaña no pasa `venta_items_campana_coherente`.)

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_pedido_web_vender'),
  $v$    v_cupon_idx := v_cupon_idx + 1;
    v_cupon_parte := coalesce(v_cupon_partes[v_cupon_idx], 0);
    -- Como en caja: descuento_unitario es el TOTAL (campaña + cupón) y descuento_club_unitario la parte del cupón.
    insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                                    motivo_descuento, descuento_etiqueta_id, descuento_club_unitario)
      values (v_venta, l.variante_id, 1, l.precio_lista, l.descuento + v_cupon_parte, l.costo,
              case when l.descuento > 0 then 'campana' end, l.descuento_etiqueta_id, v_cupon_parte)
      returning id into v_item;$v$,
  $n$    if (select x.descuento_grupo from retail.pedido_web_lineas x where x.id = l.id) > 0 then
      -- ADR-0655: la parte de la oferta de grupo no lleva motivo (como en la caja) y viaja con su oferta; el cupón, como siempre.
      v_cupon_idx := v_cupon_idx + 1;
      v_cupon_parte := coalesce(v_cupon_partes[v_cupon_idx], 0);
      insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                                      motivo_descuento, descuento_etiqueta_id, descuento_club_unitario, descuento_grupo_unitario, oferta_grupo_id)
        select v_venta, l.variante_id, 1, l.precio_lista, l.descuento + v_cupon_parte, l.costo,
               case when l.descuento - x.descuento_grupo > 0 then 'campana' end, l.descuento_etiqueta_id, v_cupon_parte,
               x.descuento_grupo, x.oferta_grupo_id
          from retail.pedido_web_lineas x where x.id = l.id
        returning id into v_item;
    else
    v_cupon_idx := v_cupon_idx + 1;
    v_cupon_parte := coalesce(v_cupon_partes[v_cupon_idx], 0);
    -- Como en caja: descuento_unitario es el TOTAL (campaña + cupón) y descuento_club_unitario la parte del cupón.
    insert into retail.venta_items (venta_id, variante_id, cantidad, precio_unitario, descuento_unitario, costo_unitario,
                                    motivo_descuento, descuento_etiqueta_id, descuento_club_unitario)
      values (v_venta, l.variante_id, 1, l.precio_lista, l.descuento + v_cupon_parte, l.costo,
              case when l.descuento > 0 then 'campana' end, l.descuento_etiqueta_id, v_cupon_parte)
      returning id into v_item;
    end if;$n$,
  1);

-- 3. Lo que ahorra la bolsa, para mostrarlo antes de separar ---------------------------------------------------------------------------

create or replace function retail.tienda_bolsa_grupos(p_lineas jsonb, p_sede uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  -- Las prendas de la bolsa como las lee `tienda_bolsa` (una id mal escrita no llega al cast; hasta 2 de una prenda), con su precio de lista
  -- en la tienda elegida, y de a una en el orden de la base: lo mismo que hará `tienda_separar` en esa tienda.
  with
  sede as (select retail.fn_tienda_sede_elegida(p_sede, retail.fn_tienda_sedes_web()) as id),
  crudo as (
    select e.n,
           case when jsonb_typeof(e.x) = 'object' and e.x ->> 'variante_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (e.x ->> 'variante_id')::uuid end as variante_id,
           case when jsonb_typeof(e.x) = 'object' and jsonb_typeof(e.x -> 'cantidad') = 'number' and (e.x ->> 'cantidad') ~ '^[0-9]{1,2}$'
                then (e.x ->> 'cantidad')::integer end as cantidad
    from jsonb_array_elements(case when jsonb_typeof(p_lineas) = 'array' then p_lineas else '[]'::jsonb end) with ordinality as e (x, n)
  ),
  entrada as (
    select c.variante_id, least(sum(c.cantidad), 2)::integer as cantidad
    from crudo c where c.variante_id is not null and c.cantidad between 1 and 20
    group by c.variante_id
  ),
  precios as (
    select pr.variante_id, pr.precio_lista from retail.fn_tienda_precio_talla(array(select en.variante_id from entrada en), (select id from sede)) pr
    where pr.se_ofrece
  ),
  u as (
    select en.variante_id, p.precio_lista as precio, k
    from entrada en join precios p on p.variante_id = en.variante_id
    cross join lateral generate_series(1, en.cantidad) k
  ),
  l as (select row_number() over (order by u.precio desc, u.variante_id, u.k)::integer as linea, u.* from u),
  g as (select * from retail.fn_ofertas_de_grupo(retail.fn_hoy_lima(), (select id from sede),
          (select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'precio_unitario', l.precio, 'cantidad', 1) order by l.linea), '[]'::jsonb) from l), 0)),
  por_variante as (
    select l.variante_id, sum(g.descuento) as ahorro, max(g.faltan) as faltan, (array_agg(g.regla_id))[1] as regla_id,
           (array_agg(g.etiqueta_nombre))[1] as campana
    from l join g on g.linea = l.linea group by l.variante_id
  )
  select jsonb_build_object(
    'ahorro', coalesce((select sum(pv.ahorro) from por_variante pv), 0),
    'lineas', coalesce((
      select jsonb_object_agg(pv.variante_id::text, jsonb_build_object(
               'ahorro', pv.ahorro, 'faltan', pv.faltan, 'campana', pv.campana,
               'tipo', r.tipo, 'lleva', r.lleva, 'paga', r.paga, 'monto', r.monto, 'porcentaje', r.porcentaje))
      from por_variante pv join retail.campana_reglas r on r.id = pv.regla_id), '{}'::jsonb))
$function$;

comment on function retail.tienda_bolsa_grupos(jsonb, uuid) is
  'ADR-0655 (actividad 7). Lo que ahorra cada prenda de la bolsa con su oferta de grupo (3x2, N por S/, la N.ª al X %) en la tienda elegida, con la forma de la oferta y cuántas le faltan al grupo: lo mismo que cobrará tienda_separar. La tienda lo pide junto con tienda_bolsa.';

revoke all on function retail.tienda_bolsa_grupos(jsonb, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_bolsa_grupos(jsonb, uuid) to tienda_web;

revoke all on function retail.fn_pedido_web_linea_grupo_fijo() from public, anon, authenticated;
