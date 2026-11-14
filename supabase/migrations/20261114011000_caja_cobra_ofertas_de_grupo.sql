-- ============================================================================
-- 20261114011000 — La caja cobra «Llevar varias y pagar menos» (ADR-0655, actividad 6, parte 3 de 4: la caja)
--
-- EL PROBLEMA. La base ya sabe armar los grupos de un ticket y repartir su ahorro (`fn_ofertas_de_grupo`, 20261114003000), pero
--   `registrar_venta` solo conoce el «% menos» por prenda: un 3x2 no se podía cobrar, y si la caja mandaba el descuento la venta se
--   rechazaba como un descuento a mano sin motivo.
--
-- LO QUE HACE.
--   1. `venta_items` guarda la parte del grupo de cada línea: `descuento_grupo_unitario` (está DENTRO de `descuento_unitario`, como la del
--      club) y `oferta_grupo_id` (de qué oferta); y el candado del motivo deja fuera esa parte, como la del club. Así cada prenda queda con lo que pagó: va igual a SUNAT (la caja declara precio menos
--      descuento) y a un cambio o una devolución (decisión 7 de la maqueta: nada que tocar ahí).
--   2. `fn_exigir_ofertas_de_grupo(items, sede, hoy)`: antes de mirar cada línea, `registrar_venta` vuelve a armar los grupos con LA regla
--      y exige que cada línea traiga su parte, ni menos (la clienta la recibe: `venta_grupo_omitido`) ni más (`venta_grupo_no_coincide`).
--      Una venta sin conexión llega días después: la parte puede ser la de hoy o la de hasta 3 días antes (la misma tolerancia que el
--      % de campaña), así que se acepta entre lo que exige la regla hoy y lo que daba con esa tolerancia.
--   3. `registrar_venta` (4 reemplazos anclados): declara `v_grupo`; llama a la regla antes del bucle; resta la parte del grupo de lo que
--      mira como descuento de campaña o a mano (Felipe 2026-11-13: un descuento a mano se SUMA a la parte del grupo, y sus topes —motivo,
--      costo, 15 y 35 %— miran solo lo suyo); y guarda las dos columnas nuevas. El total de la venta no cambia de cuenta: precio menos
--      descuento total.
--   4. `ofertas_de_grupo_vigentes(sede)`: para la caja, qué oferta de grupo rige hoy para cada prenda de esa tienda (con su forma), de una
--      vez (por conjuntos, como `fn_choques_de_oferta`).
--
-- QUÉ NO HACE. Los apartados (`separar_prendas`, `entregar_separacion`) y la tienda web siguen sin grupos: son la parte 4 y la actividad 7.
--   Una venta con una línea de grupo en cantidad > 1 cuyas prendas quedan en grupos distintos no cabe en un `descuento_unitario` por unidad:
--   la caja manda cada prenda de una oferta de grupo en su propia línea (cantidad 1), y la base lo exige (la parte de la línea tiene que dar
--   exacta).
--
-- DESCARTÉ: que la base calcule y escriba sola la parte del grupo: el ticket que vio la clienta y el comprobante tienen que ser los mismos
--   números que manda la caja; la base los verifica (como el % de campaña y el cupón del Club).
--
-- SE ROMPE SI: alguien cambia las líneas ancladas de `registrar_venta` antes de pegar esto: los reemplazos se detienen sin tocar nada. Un
--   parche nuevo a `registrar_venta` se suma a `scripts/pruebas/registrar-venta-antes-de-precio-sede.mjs`.
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: `alter table venta_items` (dos columnas y sus candados, sin políticas) y
--   funciones. Va DESPUÉS de 20261114003000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:caja-ofertas-de-grupo`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_ofertas_de_grupo(date, uuid, jsonb, integer)') is null then
    raise exception 'Falta fn_ofertas_de_grupo (20261114003000): esta migración va después. No se aplicó nada.';
  end if;
end;
$$;

-- 1. La parte del grupo en cada línea vendida ------------------------------------------------------------------------------------------

alter table retail.venta_items add column if not exists descuento_grupo_unitario numeric(10, 2) not null default 0;
alter table retail.venta_items add column if not exists oferta_grupo_id uuid references retail.campana_reglas (id);

comment on column retail.venta_items.descuento_grupo_unitario is
  'ADR-0655. La parte del ahorro de una oferta de grupo (3x2, N por S/, la N.ª al X %) que le tocó a esta prenda, por unidad. Está DENTRO de descuento_unitario (como la del club): precio_unitario − descuento_unitario es lo que se pagó.';
comment on column retail.venta_items.oferta_grupo_id is 'ADR-0655. La oferta de grupo de la que viene descuento_grupo_unitario.';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'retail.venta_items'::regclass and conname = 'venta_items_grupo_dentro_del_descuento') then
    alter table retail.venta_items add constraint venta_items_grupo_dentro_del_descuento
      check (descuento_grupo_unitario >= 0 and descuento_grupo_unitario + descuento_club_unitario <= descuento_unitario + 0.001);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'retail.venta_items'::regclass and conname = 'venta_items_grupo_con_oferta') then
    alter table retail.venta_items add constraint venta_items_grupo_con_oferta
      check (descuento_grupo_unitario = 0 or oferta_grupo_id is not null);
  end if;
end;
$$;

-- Un descuento pide su motivo (`venta_items_motivo_coherente_con_descuento`), salvo la parte del club; ahora tampoco la del grupo: una prenda
-- cuyo único descuento es su parte del 3x2 no lleva motivo. Sigue `not valid`, como estaba (no vuelve a revisar las ventas de antes).
do $$
begin
  if position('descuento_grupo_unitario' in coalesce((select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'retail.venta_items'::regclass and conname = 'venta_items_motivo_coherente_con_descuento'), '')) = 0 then
    alter table retail.venta_items drop constraint if exists venta_items_motivo_coherente_con_descuento;
    alter table retail.venta_items add constraint venta_items_motivo_coherente_con_descuento check (
      ((descuento_unitario - descuento_club_unitario - descuento_grupo_unitario) = 0 and motivo_descuento is null)
      or ((descuento_unitario - descuento_club_unitario - descuento_grupo_unitario) > 0 and motivo_descuento is not null)
    ) not valid;
  end if;
end;
$$;

create index if not exists venta_items_oferta_grupo_idx on retail.venta_items (oferta_grupo_id) where oferta_grupo_id is not null;

-- 2. La caja tiene que mandar la parte del grupo que da la regla -------------------------------------------------------------------------

create or replace function retail.fn_exigir_ofertas_de_grupo(p_items jsonb, p_ubicacion_id uuid, p_hoy date)
returns void
language plpgsql
stable
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_lineas jsonb;
  r record;
  v_mandado numeric;
begin
  v_lineas := (
    select coalesce(jsonb_agg(jsonb_build_object('variante_id', x ->> 'variante_id', 'precio_unitario', x ->> 'precio_unitario',
                                                 'cantidad', coalesce((x ->> 'cantidad')::integer, 1)) order by n), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality o(x, n)
  );
  for r in
    with items as (
      select o.n::integer as linea, o.x,
             coalesce((o.x ->> 'cantidad')::integer, 1) as cantidad,
             coalesce((o.x ->> 'descuento_grupo_unitario')::numeric, 0) as grupo,
             nullif(btrim(coalesce(o.x ->> 'oferta_grupo_id', '')), '')::uuid as oferta,
             coalesce((o.x ->> 'descuento_unitario')::numeric, 0) as total,
             coalesce((o.x ->> 'descuento_club_unitario')::numeric, 0) as club
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality o(x, n)
    ),
    -- Lo que exige hoy (sin tolerancia) y lo más que pudo dar con la tolerancia de una venta sin conexión.
    minimo as (select * from retail.fn_ofertas_de_grupo(p_hoy, p_ubicacion_id, v_lineas, 0)),
    maximo as (select * from retail.fn_ofertas_de_grupo(p_hoy, p_ubicacion_id, v_lineas, 3))
    select i.*, coalesce(mi.descuento, 0) as d_min, mi.regla_id as r_min, mi.oferta_nombre as n_min,
           coalesce(ma.descuento, 0) as d_max, ma.regla_id as r_max, ma.oferta_nombre as n_max,
           (select p.referencia || ' (' || coalesce(v.codigo, v.sku, 'sin código') || ')'
              from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = (i.x ->> 'variante_id')::uuid) as prenda
    from items i
    left join minimo mi on mi.linea = i.linea
    left join maximo ma on ma.linea = i.linea
  loop
    if r.grupo < 0 or r.grupo + r.club > r.total + 0.001 then
      raise exception 'La parte de la oferta de % no puede ser mayor que su descuento. Vuelve a abrir el cobro.', r.prenda
        using detail = r.prenda, hint = 'venta_grupo_invalido';
    end if;
    v_mandado := round(r.grupo * r.cantidad, 2);
    if v_mandado < r.d_min - 0.005 then
      raise exception 'venta_grupo_omitido'
        using detail = r.prenda,
              hint = format('«%s» le da S/%s a esta línea y la caja mandó S/%s. Vuelve a abrir el cobro.', r.n_min, r.d_min, v_mandado);
    end if;
    if v_mandado > r.d_max + 0.005 then
      raise exception 'venta_grupo_no_coincide'
        using detail = r.prenda,
              hint = format('La oferta da S/%s a esta línea y la caja mandó S/%s. Si son varias prendas iguales, cada una va en su línea.', r.d_max, v_mandado);
    end if;
    if r.grupo > 0 and r.oferta is distinct from coalesce(r.r_min, r.r_max) and r.oferta is distinct from r.r_max then
      raise exception 'venta_grupo_no_coincide'
        using detail = r.prenda, hint = 'La línea dice otra oferta que la que rige para esta prenda. Vuelve a abrir el cobro.';
    end if;
  end loop;
end;
$function$;

comment on function retail.fn_exigir_ofertas_de_grupo(jsonb, uuid, date) is
  'ADR-0655. Lo llama registrar_venta antes de mirar cada línea: con LA regla (fn_ofertas_de_grupo), cada línea trae su parte del ahorro de su grupo, ni menos (venta_grupo_omitido) ni más (venta_grupo_no_coincide), y la oferta que rige. Una venta sin conexión puede traer la parte de hasta 3 días antes.';

revoke all on function retail.fn_exigir_ofertas_de_grupo(jsonb, uuid, date) from public, anon, authenticated;

-- 3. registrar_venta: la regla antes del bucle, la parte del grupo fuera de lo que se mide como campaña o a mano, y las columnas -------

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

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'),
  $v$  v_club numeric;                        -- la parte del club de la línea (descuento_club_unitario que mandó Cobrar)
$v$,
  $n$  v_club numeric;                        -- la parte del club de la línea (descuento_club_unitario que mandó Cobrar)
  v_grupo numeric := 0;                  -- ADR-0655: la parte de la oferta de grupo de la línea (descuento_grupo_unitario)
$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'),
  $v$  for v_item in select * from jsonb_array_elements(p_items) loop
    select retail.fn_precio_en_sede(v.id, p_ubicacion_id), p.referencia, coalesce(v.codigo, v.sku, 'sin código')$v$,
  $n$  -- ADR-0655: las ofertas de grupo (3x2, N por S/, la N.ª al X %): cada línea trae su parte, la que da LA regla.
  perform retail.fn_exigir_ofertas_de_grupo(p_items, p_ubicacion_id, v_hoy);

  for v_item in select * from jsonb_array_elements(p_items) loop
    select retail.fn_precio_en_sede(v.id, p_ubicacion_id), p.referencia, coalesce(v.codigo, v.sku, 'sin código')$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'),
  $v$    v_motivo := btrim(coalesce(v_item ->> 'motivo_descuento', ''));
$v$,
  $n$    -- ADR-0655: la parte de la oferta de grupo ya la validó fn_exigir_ofertas_de_grupo; lo que sigue (campaña, descuento a mano, costo,
    -- 15 y 35 %) mide lo demás. Un descuento a mano se SUMA a la parte del grupo (Felipe 2026-11-13).
    v_grupo := coalesce((v_item ->> 'descuento_grupo_unitario')::numeric, 0);
    v_descuento := v_descuento - v_grupo;
    v_motivo := btrim(coalesce(v_item ->> 'motivo_descuento', ''));
$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'),
  $v$      (((v_item ->> 'precio_unitario')::numeric - v_descuento - v_club) * (v_item ->> 'cantidad')::integer);$v$,
  $n$      (((v_item ->> 'precio_unitario')::numeric - v_descuento - v_grupo - v_club) * (v_item ->> 'cantidad')::integer);$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'),
  $v$      descuento_club_unitario, origen_sugerencia
    )$v$,
  $n$      descuento_club_unitario, origen_sugerencia, descuento_grupo_unitario, oferta_grupo_id
    )$n$,
  1);

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'),
  $v$        nullif(btrim(coalesce(v_item ->> 'origen_sugerencia', '')), '')
      )
      returning id into v_item_id;$v$,
  $n$        nullif(btrim(coalesce(v_item ->> 'origen_sugerencia', '')), ''),
        coalesce((v_item ->> 'descuento_grupo_unitario')::numeric, 0),
        case when coalesce((v_item ->> 'descuento_grupo_unitario')::numeric, 0) > 0
             then nullif(btrim(coalesce(v_item ->> 'oferta_grupo_id', '')), '')::uuid end
      )
      returning id into v_item_id;$n$,
  1);

-- 4. Para la caja: qué oferta de grupo rige hoy para cada prenda de la tienda --------------------------------------------------------------

create or replace function retail.ofertas_de_grupo_vigentes(p_ubicacion_id uuid)
returns table (
  variante_id uuid, regla_id uuid, producto_id uuid, tipo text, lleva smallint, paga smallint, monto numeric, porcentaje numeric, agrupa text,
  oferta_nombre text, etiqueta_nombre text
)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  with
  hoy as (select retail.fn_hoy_lima() as d),
  vigentes as (
    select r.*, e.nombre as e_nombre,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'solo'), '{}'::uuid[]) as solo,
           coalesce((select array_agg(rc.categoria_id) from retail.campana_regla_categorias rc where rc.regla_id = r.id and rc.modo = 'fuera'), '{}'::uuid[]) as fuera,
           coalesce((select array_agg(rp.producto_id) from retail.campana_regla_productos rp where rp.regla_id = r.id), '{}'::uuid[]) as productos
    from retail.campana_reglas r
    join retail.etiquetas e on e.id = r.etiqueta_id and e.estado = 'aprobado' and e.activo
    cross join hoy
    where r.estado = 'activa' and r.tipo <> 'pct'
      and (e.vigente_desde is null or e.vigente_desde <= hoy.d)
      and (e.vigente_hasta is null or e.vigente_hasta >= hoy.d)
      and retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id)
      and retail.fn_regla_rige_en(r.desde, r.hasta, r.dias_semana, hoy.d, 0)
      and (
        not exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id)
        or (p_ubicacion_id is not null and exists (select 1 from retail.campana_regla_sedes rs where rs.regla_id = r.id and rs.ubicacion_id = p_ubicacion_id))
      )
  ),
  alcanza as (
    select g.id as regla_id, x.variante_id
    from vigentes g
    cross join lateral retail.fn_variantes_de_oferta(g.etiqueta_id, g.solo, g.fuera, g.productos, g.incluye_claure) x
  ),
  -- Una oferta que cedió se calla donde la que gana también alcanza (como en fn_ofertas_de_grupo).
  sin_cedidas as (
    select a.* from alcanza a
    where not exists (
      select 1 from retail.campana_regla_cesiones c
      join alcanza w on w.regla_id = c.gana_regla_id and w.variante_id = a.variante_id
      where c.cede_regla_id = a.regla_id
    )
  )
  select distinct on (s.variante_id) s.variante_id, g.id, v.producto_id, g.tipo, g.lleva, g.paga, g.monto, g.porcentaje, g.agrupa, g.nombre, g.e_nombre
  from sin_cedidas s
  join vigentes g on g.id = s.regla_id
  join retail.variantes v on v.id = s.variante_id
  -- Sin llave, como campanas_vigentes: lo que da una oferta es público (la tienda web también lo muestra).
  order by s.variante_id, g.creada_en, g.id
$function$;

comment on function retail.ofertas_de_grupo_vigentes(uuid) is
  'ADR-0655. Para la caja: la oferta de grupo (3x2, N por S/, la N.ª al X %) que rige hoy en esa tienda para cada prenda, con su forma y su modelo. La caja arma el ticket con la misma regla (lib/ofertas-de-grupo.ts) y registrar_venta la vuelve a exigir.';

revoke all on function retail.ofertas_de_grupo_vigentes(uuid) from public, anon;
grant execute on function retail.ofertas_de_grupo_vigentes(uuid) to authenticated;
