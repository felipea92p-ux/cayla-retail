-- ============================================================================
-- 20261011110000_precio_de_tienda_no_baja_del_costo.sql — CAYLA V2 (Felipe, 2026-10-11; ADR-0370, sigue a 20261011100000)
--
-- EL PROBLEMA. Un descuento en la caja se BLOQUEA si deja la prenda bajo el costo (`venta_descuento_bajo_costo`), también a un líder.
-- El precio de una tienda, que cambia lo que cobra TODA una tienda, solo pedía motivo y avisaba a más de 30 % de distancia: un error
-- de tipeo (S/ 6.99 en vez de 69.90) dejaba una tienda vendiendo a pérdida sin que nadie lo viera. Pueden ponerlo 26 de las 27
-- personas activas (12 integrantes en su tienda y 14 líderes en cualquiera).
--
-- LA DECISIÓN (Felipe, 2026-10-11, entre «bloquear a todos» y «bloquear salvo un líder con motivo»): bloquear a TODOS, líder incluido.
-- Razones, con datos de producción del 2026-10-11: la caja ya prohíbe vender bajo el costo a todos (la excepción haría del precio de
-- tienda una puerta más abierta que la caja); el precio de tienda no vence («vale hasta que alguien lo quite») y liquidar es temporal,
-- para eso está la campaña, que tiene fechas y puede limitarse a una tienda; y en 90 días hubo 261 líneas vendidas, 0 bajo el costo,
-- así que la regla no estorba a nadie hoy. Sin tope extra para una integrante (se dejó como está a propósito).
--
-- LO QUE HACE. Reemplaza `poner_precio_sede` (mismas firma y permisos) con el piso: si el precio es MENOR que el costo de cualquiera
-- de las tallas activas de la prenda, se rechaza con un mensaje que no dice cuánto cuesta. Igualar el precio de la prenda (que es
-- quitar el de la tienda) y quitar no se tocan. Todo lo demás de la función queda como en 20261011100000.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas, políticas ni disparadores. Pruebas: `pnpm pruebas:precio-sede`.
-- Verificación: `select pg_get_functiondef(p.oid) like '%precio_sede_bajo_costo%' from pg_proc p join pg_namespace n on n.oid =
-- p.pronamespace where n.nspname = 'retail' and p.proname = 'poner_precio_sede';` → `true`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.poner_precio_sede(
  p_producto_id uuid, p_ubicacion_id uuid, p_precio numeric, p_motivo text
) returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_precio numeric(12,2) := round(p_precio, 2);
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_vig retail.precios_sede_prenda%rowtype;
  v_activas integer;
  v_igual_grilla boolean;
  v_costo_max numeric;
  v_var record;
begin
  -- NaN (que numeric acepta y que Postgres ordena por ENCIMA de todo número) no pasa por «<= 0» ni por el piso: se rechaza aquí.
  if p_precio is null or p_precio = 'NaN'::numeric or v_precio <= 0 then
    raise exception 'Escribe un precio mayor que cero.';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Escribe por qué esta tienda tiene otro precio.';
  end if;
  perform retail.fn_precio_sede_exigir(p_producto_id, p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);

  -- `for … loop exit` y no la forma corta: el SQL Editor no se confunde (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»).
  for v_activas, v_igual_grilla, v_costo_max in
    select count(*)::integer, coalesce(bool_and(v.precio = v_precio), false), max(v.costo)
      from retail.variantes v where v.producto_id = p_producto_id and v.activo
  loop
    exit;
  end loop;
  if v_activas = 0 then
    raise exception 'Esta prenda no tiene tallas activas: actívala antes de ponerle precio.';
  end if;

  for v_vig in
    select * from retail.precios_sede_prenda ps
     where ps.producto_id = p_producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null
  loop
    exit;
  end loop;

  if v_igual_grilla then
    if v_vig.id is null then
      raise exception 'Ese ya es el precio de la prenda en todas sus tallas: no hace falta un precio propio para esta tienda.';
    end if;
    -- Igualarla a la grilla es quitarla.
    return retail.quitar_precio_sede(p_producto_id, p_ubicacion_id, v_motivo);
  end if;

  -- El piso (Felipe 2026-10-11): igual que la caja, que no deja vender bajo el costo a nadie —ni a un líder—, el precio de una
  -- tienda no puede quedar por debajo de lo que cuesta CUALQUIERA de sus tallas activas (el precio vale para todas). Quedar justo en
  -- el costo sí se puede. Para liquidar bajo el costo está la campaña (con fechas, y puede ser de una sola tienda). El mensaje no
  -- dice cuánto cuesta: el costo es dato con permiso.
  if v_costo_max is not null and v_precio < v_costo_max then
    raise exception 'Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).'
      using hint = 'precio_sede_bajo_costo';
  end if;

  -- Mismo precio y mismo motivo: nada que hacer. Un motivo diferente SÍ es un cambio (20261010100600): nace otra fila, con la misma
  -- fecha de inicio.
  if v_vig.id is not null and v_vig.precio = v_precio and v_vig.motivo = v_motivo then
    return 0;
  end if;

  if v_vig.id is not null then
    update retail.precios_sede_prenda set archivado_en = now(), archivado_por = v_actor where id = v_vig.id;
  end if;
  insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo, vigente_desde, creado_por)
  values (p_producto_id, p_ubicacion_id, v_precio, v_motivo,
          case when v_vig.id is not null and v_vig.precio = v_precio then v_vig.vigente_desde else now() end, v_actor);

  for v_var in
    select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id
  loop
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id,
      coalesce(v_vig.precio, v_var.precio), v_vig.id is not null, v_precio, true, v_motivo, v_actor);
  end loop;
  return v_activas;
end;
$fn$;
revoke all on function retail.poner_precio_sede(uuid, uuid, numeric, text) from public, anon;
grant execute on function retail.poner_precio_sede(uuid, uuid, numeric, text) to authenticated;
