-- Estante «Apartados» (Apartados v2, paso 3 — ADR-0232; spike `docs/maquetas/apartados-v2-2026-09/`).
--
-- EL PROBLEMA. «Guárdala en Apartados del almacén» era un recordatorio: nadie sabía en qué lugar quedaba cada prenda,
-- y al entregar había que buscarla entre todas por la etiqueta.
--
-- LA DECISIÓN. Cada apartado abierto recibe un lugar numerado de su tienda (A-01, A-02…), el más bajo libre, en el
-- mismo instante en que se crea (disparador BEFORE INSERT: `separar_prendas` no se toca). Se libera solo al cerrarse
-- (se entrega, se libera o se devuelve): la cuenta solo mira los abiertos. NO es un movimiento de stock: la prenda ya
-- queda reservada (`stock.cantidad_apartada`, ADR-0141) y Existencias ya la cuenta como apartada; mover stock a otra
-- sububicación tocaría el núcleo (`movimientos`/`stock`, principio 1) y la entrega (que vende desde la sububicación
-- del apartado) sin ganar nada que el número no dé.
--
-- `buscar_separaciones` devuelve el estante (columna nueva: se recrea), en cada pago la fecha y si fue un abono
-- (paso 2) y, en cada prenda, el id de su fila (lo necesita «Editar prendas», paso 4). Cambia el tipo de salida, así que va `drop function` + `create` (drop function no toma las tablas de auth).
--
-- PRODUCCIÓN. Una columna nueva en `separaciones`, un disparador (`create or replace trigger`, nunca drop trigger) y la
-- función. Sin políticas. Una sola parte. Idempotente. Va DESPUÉS de 20260927100000 (lee `separacion_pagos.abono_id`).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.separaciones add column if not exists estante text check (estante is null or estante ~ '^A-[0-9]{2,3}$');

create or replace function retail.fn_separacion_estante()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_n integer;
begin
  if new.estante is not null then
    return new;
  end if;
  -- Dos apartados a la vez en la misma tienda no se llevan el mismo lugar: un candado por tienda hasta el final.
  perform pg_advisory_xact_lock(hashtext('separacion_estante'), hashtext(new.ubicacion_id::text));
  select min(n) into v_n
    from generate_series(1, 999) n
   where not exists (
     select 1 from separaciones s
      where s.ubicacion_id = new.ubicacion_id and s.estado = 'abierta' and s.estante = 'A-' || lpad(n::text, 2, '0'));
  new.estante := 'A-' || lpad(coalesce(v_n, 999)::text, 2, '0');
  return new;
end;
$$;
revoke all on function retail.fn_separacion_estante() from public, anon, authenticated;

create or replace trigger separaciones_estante
  before insert on retail.separaciones
  for each row execute function retail.fn_separacion_estante();

-- Los apartados abiertos de hoy reciben su lugar, por orden de llegada (los cerrados no lo necesitan).
do $$
declare
  r record;
  v_n integer;
begin
  for r in select id, ubicacion_id from retail.separaciones where estado = 'abierta' and estante is null order by created_at loop
    select min(n) into v_n from generate_series(1, 999) n
     where not exists (select 1 from retail.separaciones s
                        where s.ubicacion_id = r.ubicacion_id and s.estado = 'abierta' and s.estante = 'A-' || lpad(n::text, 2, '0'));
    update retail.separaciones set estante = 'A-' || lpad(v_n::text, 2, '0') where id = r.id;
  end loop;
end $$;

drop function if exists retail.buscar_separaciones(uuid, text, text[]);
CREATE OR REPLACE FUNCTION retail.buscar_separaciones(p_ubicacion_id uuid, p_texto text DEFAULT NULL::text, p_estados text[] DEFAULT NULL::text[])
 RETURNS TABLE(id uuid, codigo text, estado text, clienta_nombres text, clienta_apellidos text, clienta_celular text, clienta_dni text, asesora text, total numeric, adelanto numeric, saldo numeric, vence_el date, extensiones smallint, creada_en timestamp with time zone, devolucion_medio text, devolucion_numero text, devolucion_cci_final text, liberada_sola boolean, comprobante_anticipo text, comprobante_final text, nota_credito text, items jsonb, pagos jsonb, estante text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select s.id, s.codigo, s.estado, s.clienta_nombres, s.clienta_apellidos, s.clienta_celular, s.clienta_dni,
         nullif(btrim(coalesce(pa.nombres, '') || ' ' || coalesce(pa.apellidos, '')), ''),
         s.total, s.adelanto, case when s.estado = 'abierta' then s.total - s.adelanto else 0 end,
         s.vence_el, s.extensiones, s.created_at,
         s.devolucion_medio, s.devolucion_numero, right(s.devolucion_cci, 4),
         (s.liberada_en is not null and s.liberada_por is null),
         ca.serie || '-' || lpad(ca.numero::text, 6, '0'),
         (select cf.serie || '-' || lpad(cf.numero::text, 6, '0') from comprobantes cf where cf.venta_id = s.venta_id and s.venta_id is not null order by cf.created_at limit 1),
         cn.serie || '-' || lpad(cn.numero::text, 6, '0'),
         (select jsonb_agg(jsonb_build_object('id', si.id, 'variante_id', si.variante_id, 'sku', v.sku, 'referencia', p.referencia,
                                              'cantidad', si.cantidad, 'precio_unitario', si.precio_unitario,
                                              'descuento_unitario', si.descuento_unitario) order by v.sku)
            from separacion_items si join variantes v on v.id = si.variante_id join productos p on p.id = v.producto_id
           where si.separacion_id = s.id),
         (select jsonb_agg(jsonb_build_object('metodo', sp.metodo, 'monto', sp.monto, 'fecha', sp.created_at, 'abono', sp.abono_id is not null) order by sp.created_at)
            from separacion_pagos sp where sp.separacion_id = s.id),
         s.estante
    from separaciones s
    left join public.personas pa on pa.id = s.asesora_id
    left join comprobantes ca on ca.id = s.comprobante_anticipo_id
    left join comprobantes cn on cn.id = s.nota_credito_id
   where s.ubicacion_id = p_ubicacion_id
     and fn_puede_operar_ubicacion(p_ubicacion_id)
     and (p_estados is null or s.estado = any (p_estados))
     and (
       nullif(btrim(coalesce(p_texto, '')), '') is null
       or s.id::text = btrim(p_texto)
       or s.codigo ilike '%' || btrim(p_texto) || '%'
       or (s.clienta_nombres || ' ' || s.clienta_apellidos) ilike '%' || btrim(p_texto) || '%'
       or s.clienta_dni = regexp_replace(p_texto, '\D', '', 'g')
       or s.clienta_celular = regexp_replace(p_texto, '\D', '', 'g')
       or (ca.serie || '-' || lpad(ca.numero::text, 6, '0')) ilike '%' || btrim(p_texto) || '%'
     )
   order by case s.estado when 'liberada' then 0 when 'abierta' then 1 else 2 end, s.vence_el, s.created_at
   limit 200;
$function$;

revoke all on function retail.buscar_separaciones(uuid, text, text[]) from public, anon;
grant execute on function retail.buscar_separaciones(uuid, text, text[]) to authenticated;
