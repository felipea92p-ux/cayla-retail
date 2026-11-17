-- ============================================================================
-- 20261116174000 — Una venta cobrada sin conexión no se pierde porque su oferta cambió antes de subirla (ADR-0655, Felipe 2026-11-16)
--
-- EL PROBLEMA. La caja cobra sin red con las ofertas que tiene en la memoria (3x2, «N por S/», monto) y sube la venta cuando vuelve la red,
--   con la hora de la venta (`x-momento`). `fn_exigir_ofertas_de_grupo` vuelve a armar los grupos con el DÍA de la venta (20261114132000),
--   pero con las ofertas COMO ESTÁN AL SUBIR: si entre el cobro y la subida alguien retiró la oferta, le cambió la forma o las prendas, o
--   activó otra, la base rechazaba la venta (`venta_grupo_no_coincide` / `venta_grupo_omitido`). Para entonces la plata está en el cajón y la
--   prenda se fue con el cliente; el rechazo pedía «vuelve a abrir el cobro», que en una venta en cola no existe. Probado en la casuística del
--   2026-11-16 (docs/backlog/2026-11-16-ofertas-promociones-casos.md, caso 1).
--
-- LO QUE DECIDIÓ FELIPE (2026-11-16): «Se acepta y queda marcada».
--   DECIDÍ: si la venta llega con `x-momento` (solo lo manda la cola sin conexión, ADR-0162) y la parte de la oferta de alguna línea no es la
--     que la base arma hoy, se acepta lo que cobró la caja —siempre dentro de los candados de siempre: la parte nunca pasa el descuento de la
--     línea ni su precio, y si dice una oferta, esa oferta existe— y la venta queda marcada en `ventas.oferta_cambiada` con lo que se cobró y
--     lo que la base habría pedido, línea por línea, para revisarla.
--   DESCARTÉ: reconstruir la oferta de esa hora desde su historial (cada cambio futuro tendría que guardar su foto, y una venta cobrada mal
--     igual se rechazaría); y rechazar como antes.
--   SE ROMPE SI alguien manda `x-momento` en una venta en línea para colar un ahorro que ya no rige: lo acota el mismo candado (nunca más que
--     el descuento de la línea, con una oferta que existe) y la venta queda marcada a la vista.
--
-- LO QUE HACE.
--   · `ventas.oferta_cambiada jsonb` (nula en una venta normal): columna nueva, sin valor por defecto (no reescribe la tabla).
--   · `fn_venta_sin_conexion()`: ¿esta petición trae `x-momento`?
--   · `fn_exigir_ofertas_de_grupo` (el mismo cuerpo de 20261116173000): sin conexión, lo que antes rechazaba lo anota y lo deja en
--     `retail.oferta_cambiada` (un ajuste de la transacción); en línea, rechaza como siempre. Pasa a VOLATILE: escribe ese ajuste.
--   · El disparador `ventas_oferta_cambiada` (BEFORE INSERT en `ventas`) copia ese ajuste a la venta y lo limpia. `registrar_venta` no cambia.
--
-- ORDEN DE PEGADO. Esta migración ANTES de publicar la web de esta rama: el historial de ventas lee `oferta_cambiada`, y sin la columna la
--   pantalla se caería (lo mismo que tumbó Existencias el 2026-11-10).
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: un `alter table ventas add column if not exists` (instantáneo, sin valor por
--   defecto), funciones y un disparador nuevo (`create trigger` solo si no existe); ni `drop trigger` ni políticas (ADR-0195). Va DESPUÉS de
--   20261116173000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:venta-sin-conexion-oferta` (scripts/pruebas/venta_sin_conexion_oferta.mjs).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.ventas add column if not exists oferta_cambiada jsonb;

comment on column retail.ventas.oferta_cambiada is
  'ADR-0655 (Felipe 2026-11-16). Nula en una venta normal. Una venta cobrada sin conexión cuya oferta cambió antes de subirla se acepta con lo que cobró la caja y guarda aquí, por línea, lo que se cobró y lo que la base habría pedido.';

create or replace function retail.fn_venta_sin_conexion()
returns boolean
language plpgsql
stable
set search_path to 'retail', 'public'
as $function$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return false;
  end;
  return nullif(trim(v_headers ->> 'x-momento'), '') is not null;
end;
$function$;

comment on function retail.fn_venta_sin_conexion() is
  'ADR-0655 (Felipe 2026-11-16). ¿La petición trae x-momento? Solo lo manda la cola sin conexión de la caja (ADR-0162).';

revoke all on function retail.fn_venta_sin_conexion() from public, anon, authenticated;

create or replace function retail.fn_exigir_ofertas_de_grupo(p_items jsonb, p_ubicacion_id uuid, p_hoy date)
 returns void
 language plpgsql
 volatile security definer
 set search_path to 'retail', 'public'
as $function$
declare
  v_lineas jsonb;
  r record;
  v_mandado numeric;
  v_sin_conexion boolean := retail.fn_venta_sin_conexion();
  v_cambios jsonb := '[]'::jsonb;
  v_motivo text;
begin
  v_lineas := (
    select coalesce(jsonb_agg(jsonb_build_object('variante_id', x ->> 'variante_id', 'precio_unitario', x ->> 'precio_unitario',
                                                 'cantidad', coalesce((x ->> 'cantidad')::integer, 1),
                                                 'descuento_manual', greatest(coalesce((x ->> 'descuento_unitario')::numeric, 0)
                                                                              - coalesce((x ->> 'descuento_club_unitario')::numeric, 0)
                                                                              - coalesce((x ->> 'descuento_grupo_unitario')::numeric, 0), 0)) order by n), '[]'::jsonb)
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
    -- Los candados que valen siempre, también sin conexión.
    if r.grupo < 0 or r.grupo + r.club > r.total + 0.001 then
      raise exception 'La parte de la oferta de % no puede ser mayor que su descuento. Vuelve a abrir el cobro.', r.prenda
        using detail = r.prenda, hint = 'venta_grupo_invalido';
    end if;
    if r.grupo > 0 and (r.oferta is null or not exists (select 1 from retail.campana_reglas cr where cr.id = r.oferta)) then
      raise exception 'venta_grupo_no_coincide'
        using detail = r.prenda, hint = 'La línea trae una parte de oferta sin una oferta que exista. Vuelve a abrir el cobro.';
    end if;
    v_mandado := round(r.grupo * r.cantidad, 2);
    v_motivo := case
      when v_mandado < r.d_min - 0.005 then 'omitido'
      when v_mandado > r.d_max + 0.005 then 'no_coincide'
      when r.grupo > 0 and r.oferta is distinct from coalesce(r.r_min, r.r_max) and r.oferta is distinct from r.r_max then 'otra_oferta'
    end;
    continue when v_motivo is null;
    -- ADR-0655 (Felipe 2026-11-16): una venta cobrada sin conexión se acepta con lo que cobró la caja y queda marcada.
    if v_sin_conexion then
      v_cambios := v_cambios || jsonb_build_array(jsonb_build_object(
        'linea', r.linea, 'prenda', r.prenda, 'motivo', v_motivo, 'cobro', v_mandado, 'oferta_cobrada', r.oferta,
        'pedia', case when v_motivo = 'omitido' then r.d_min else r.d_max end, 'oferta_de_hoy', coalesce(r.r_min, r.r_max),
        'oferta_de_hoy_nombre', coalesce(r.n_min, r.n_max)));
      continue;
    end if;
    if v_motivo = 'omitido' then
      raise exception 'venta_grupo_omitido'
        using detail = r.prenda,
              hint = format('«%s» le da S/%s a esta línea y la caja mandó S/%s. Vuelve a abrir el cobro.', r.n_min, r.d_min, v_mandado);
    elsif v_motivo = 'no_coincide' then
      raise exception 'venta_grupo_no_coincide'
        using detail = r.prenda,
              hint = format('La oferta da S/%s a esta línea y la caja mandó S/%s. Si son varias prendas iguales, cada una va en su línea.', r.d_max, v_mandado);
    else
      raise exception 'venta_grupo_no_coincide'
        using detail = r.prenda, hint = 'La línea dice otra oferta que la que rige para esta prenda. Vuelve a abrir el cobro.';
    end if;
  end loop;
  -- La venta la guarda el disparador ventas_oferta_cambiada al insertarla (registrar_venta no cambia).
  perform set_config('retail.oferta_cambiada', case when jsonb_array_length(v_cambios) > 0 then v_cambios::text else '' end, true);
end;
$function$;

create or replace function retail.fn_venta_oferta_cambiada()
returns trigger
language plpgsql
set search_path to 'retail', 'public'
as $function$
declare
  v_texto text := nullif(current_setting('retail.oferta_cambiada', true), '');
begin
  if v_texto is not null then
    new.oferta_cambiada := v_texto::jsonb;
    -- Una sola venta por exigencia: la siguiente de la misma transacción no la hereda.
    perform set_config('retail.oferta_cambiada', '', true);
  end if;
  return new;
end;
$function$;

comment on function retail.fn_venta_oferta_cambiada() is
  'ADR-0655 (Felipe 2026-11-16). La llama el disparador ventas_oferta_cambiada: copia a la venta lo que fn_exigir_ofertas_de_grupo anotó de una venta sin conexión cuya oferta cambió.';

revoke all on function retail.fn_venta_oferta_cambiada() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.ventas'::regclass and tgname = 'ventas_oferta_cambiada') then
    create trigger ventas_oferta_cambiada
      before insert on retail.ventas
      for each row
      execute function retail.fn_venta_oferta_cambiada();
  end if;
end;
$$;
