-- ADR-0604, actualización (c) (Felipe 2026-11-03): «Nos debe» dice QUÉ PRENDA debe el proveedor, y la reposición salda primero esa prenda.
--
-- EL PROBLEMA PRIMERO. Desde que se cuenta modelo por modelo, cada línea de la compra es una prenda con nombre: si de «Vestido Lima» llegaron 5 de 7, se sabe cuál faltó. Pero «Nos debe» seguía
-- hablando por categoría y marca. Tres síntomas: (1) la deuda de una línea que eligió su prenda del catálogo sin escribir descripción salía como «2 vestidos», sin decir cuáles; (2) el aviso de la
-- orden nueva decía «te debe 3 vestidos» cuando lo útil es pedirle «2 Vestido Lima y 1 Vestido Sofía»; y (3) lo grave: si el proveedor debía 2 Vestido Lima (antiguas) y 1 Vestido Sofía, y al mes mandaba
-- el Vestido Sofía como reposición, se saldaba el Vestido Lima, porque la reposición salda «de la más antigua a la más nueva» dentro de la categoría. La ficha decía que se debía lo que ya había llegado.
--
-- QUÉ HACE (una sola parte, re-pegable). No mueve stock ni plata y no agrega columnas.
--   1. `fn_prenda_de_la_diferencia`: de qué prenda es una diferencia. La que se devolvió dañada; si no, la que se anotó al comprar esa línea (su prenda del catálogo o, si solo se escribió el nombre, ese nombre).
--   2. `fn_cercania_de_la_deuda`: qué tan cerca está una deuda de lo que trajo un sobrante. Mira lo que se contó en esa línea: lo que llegó sin que la línea lo pidiera es lo de más, seguro; lo que pidió también
--      pudo llegar de más. Una deuda de otra prenda está lejos.
--   3. `fn_recepcion_cerrar` (REEMPLAZO ANCLADO): la reposición salda primero las deudas de esa prenda; después, como siempre, de la más antigua a la más nueva.
--   4. `fn_nos_debe_deuda` suma `prenda`; `fn_nos_debe_resumen`, las `prendas` de cada categoría y marca; `fn_nos_debe_del_envio`, lo mismo (REEMPLAZOS ANCLADOS). Solo agregan llaves: la web de hoy las ignora.
--
-- POR DEFECTO [lo revisa Felipe]:
--   · El tope sigue por proveedor, categoría y marca (`fn_nos_debe_pendiente`): un proveedor puede reponer con otro modelo, y quien recibe es quien dice que es la reposición. Si llega otro modelo y lo
--     marcan así, salda la deuda más antigua, como hasta hoy.
--   · Dos prendas son la misma si son el mismo producto o se llaman igual sin contar mayúsculas ni espacios de más (lo anotado por nombre y creado después en el catálogo sigue siendo esa prenda).
--
-- DESCARTÉ:
--   · Una columna `producto_id` en `despacho_diferencias`: la prenda ya está en la línea de la compra y la devuelta en su cuarentena. Copiarla sería otra fuente de verdad, y agregarla pide `alter` de una tabla en
--     uso y rellenar lo que ya existe (el disparador `despacho_diferencias_fija` no deja tocar lo escrito).
--   · Exigir la misma prenda para saldar: rechazaría una reposición con otro modelo, que pasa, y le quitaría la decisión a quien tiene la prenda en la mano.
--   · Volver a escribir las deudas ya saldadas al revés: lo resuelto no se cambia ni se borra (`nos_debe_inmutable`). Corre para lo que se cierre desde hoy.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte: funciones nuevas y reemplazos anclados, sin tablas, políticas ni `drop` (ADR-0195), y sin `select … into` dentro de un texto entre comillas
-- (ADR-0288). Los reemplazos abortan SIN TOCAR NADA si la función viva cambió y no hacen nada si ya están aplicados: se puede pegar dos veces. El bloque final comprueba que quedó todo.

set lock_timeout = '3s';

-- Reemplazo anclado: falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar_nos_debe_por_prenda(p_firma text, p_viejo text, p_nuevo text)
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
    raise exception '% cambió desde que se escribió esta migración: se esperaba una aparición de «%» y hay %. Regenera el reemplazo desde su definición real.', p_firma, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. De qué prenda es una diferencia ----------
create or replace function retail.fn_prenda_de_la_diferencia(p_diferencia_id uuid)
returns table (producto_id uuid, nombre text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(da.producto_id, i.producto_id),
         nullif(btrim(coalesce(pda.referencia, pco.referencia, di.descripcion, '')), '')
    from retail.despacho_diferencias_vigentes x
    left join retail.despacho_items di on di.id = x.despacho_item_id
    left join retail.orden_compra_items i on i.id = di.orden_compra_item_id
    left join retail.productos pco on pco.id = i.producto_id
    left join lateral (select v.producto_id
                         from retail.prendas_danadas d
                         join retail.variantes v on v.id = d.variante_id
                        where d.id = x.prenda_danada_id) da on true
    left join retail.productos pda on pda.id = da.producto_id
   where x.id = p_diferencia_id;
$$;
comment on function retail.fn_prenda_de_la_diferencia(uuid) is
  'ADR-0604: de qué prenda es una diferencia de un envío: la devuelta dañada o, si no, la que se anotó al comprar la línea (su producto o su descripción). Sin filas con nombre: la línea no decía qué prenda era. Interna.';
revoke all on function retail.fn_prenda_de_la_diferencia(uuid) from public, anon, authenticated;

-- ---------- 2. Qué tan cerca está una deuda de lo que llegó de más ----------
create or replace function retail.fn_cercania_de_la_deuda(p_deuda_id uuid, p_sobrante_id uuid)
returns integer
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with pedida as (
    -- La misma comparación de nombres de la pantalla (`normaliza`, lib/recepcion-modelos-reglas.ts).
    select p.producto_id, lower(regexp_replace(btrim(p.nombre), '\s+', ' ', 'g')) as nombre
      from retail.fn_prenda_de_la_diferencia(p_sobrante_id) p
  ),
  conteo as (
    select k.separado
      from retail.despacho_diferencias_vigentes x
      join retail.despacho_conteos k on k.despacho_id = x.despacho_id
                                    and k.despacho_item_id is not distinct from x.despacho_item_id
                                    and k.extra_posicion is not distinct from x.extra_posicion
     where x.id = p_sobrante_id
  ),
  llego as (
    select (e ->> 'producto_id')::uuid as producto_id, lower(regexp_replace(btrim(pr.referencia), '\s+', ' ', 'g')) as nombre
      from conteo c
     cross join lateral jsonb_array_elements(case when jsonb_typeof(c.separado -> 'prendas') = 'array' then c.separado -> 'prendas' else '[]'::jsonb end) e
      left join retail.productos pr on pr.id = (e ->> 'producto_id')::uuid
    union all
    select null, lower(regexp_replace(btrim(e ->> 'descripcion'), '\s+', ' ', 'g'))
      from conteo c
     cross join lateral jsonb_array_elements(case when jsonb_typeof(c.separado -> 'nuevas') = 'array' then c.separado -> 'nuevas' else '[]'::jsonb end) e
     where nullif(btrim(coalesce(e ->> 'descripcion', '')), '') is not null
  ),
  -- Lo que llegó en esa línea y no es lo que pidió: es lo de más, seguro (2). Lo que pidió también pudo llegar de más (1).
  candidatas as (
    select l.producto_id, l.nombre, 2 as cercania
      from llego l
     where not exists (select 1 from pedida p where l.producto_id = p.producto_id or l.nombre = p.nombre)
    union all
    select p.producto_id, p.nombre, 1 from pedida p
  )
  select coalesce(max(c.cercania), 0)
    from candidatas c
   cross join retail.fn_prenda_de_la_diferencia(p_deuda_id) d
   where c.producto_id = d.producto_id or c.nombre = lower(regexp_replace(btrim(d.nombre), '\s+', ' ', 'g'));
$$;
comment on function retail.fn_cercania_de_la_deuda(uuid, uuid) is
  'ADR-0604: qué tan cerca está una deuda de lo que trajo un sobrante: 2 si es de una prenda que llegó en esa línea sin que la pidiera, 1 si es de la que pidió, 0 si no. Ordena qué deuda salda primero una reposición. Interna.';
revoke all on function retail.fn_cercania_de_la_deuda(uuid, uuid) from public, anon, authenticated;

-- ---------- 3. La reposición salda primero esa prenda ----------
select pg_temp.reemplazar_nos_debe_por_prenda(
  'retail.fn_recepcion_cerrar(uuid, uuid, jsonb, jsonb, text, uuid, text)',
  'order by x.creado_en, dd.numero, x.id',
  'order by retail.fn_cercania_de_la_deuda(x.id, v_sob.id) desc, x.creado_en, dd.numero, x.id'
);

-- ---------- 4. Las lecturas dicen la prenda ----------
select pg_temp.reemplazar_nos_debe_por_prenda(
  'retail.fn_nos_debe_deuda(uuid)',
  $v$'descripcion', di.descripcion,$v$,
  $n$'descripcion', di.descripcion,
           -- ADR-0604: qué prenda se debe (la pantalla la nombra); `null` si la línea no lo decía.
           'prenda', (select jsonb_build_object('id', pd.producto_id, 'nombre', pd.nombre)
                        from retail.fn_prenda_de_la_diferencia(x.id) pd
                       where pd.nombre is not null),$n$
);

select pg_temp.reemplazar_nos_debe_por_prenda(
  'retail.fn_nos_debe_resumen()',
  $v$'unidades', g.unidades, 'monto', g.monto$v$,
  $n$'unidades', g.unidades, 'monto', g.monto,
                        -- ADR-0604: de esa categoría y marca, qué prendas se deben (lo que no dice cuál queda solo en `unidades`).
                        'prendas', coalesce((
                          select jsonb_agg(jsonb_build_object('nombre', q.nombre, 'unidades', q.unidades) order by q.unidades desc, q.nombre)
                            from (select a.j -> 'prenda' ->> 'nombre' as nombre, sum((a.j ->> 'pendiente')::integer)::integer as unidades
                                    from abiertas a
                                   where a.proveedor_id = p.proveedor_id and a.categoria_id = g.categoria_id and a.marca_id is not distinct from g.marca_id
                                     and a.j -> 'prenda' ->> 'nombre' is not null
                                   group by 1) q
                        ), '[]'::jsonb)$n$
);

select pg_temp.reemplazar_nos_debe_por_prenda(
  'retail.fn_nos_debe_del_envio(uuid)',
  $v$'costo_unitario', q.costo_unitario
$v$,
  $n$'costo_unitario', q.costo_unitario,
           -- ADR-0604: de esa categoría y marca, qué prendas se deben: la recepción las nombra al ofrecer «Es la reposición de lo que faltó».
           'prendas', coalesce((
             select jsonb_agg(jsonb_build_object('nombre', y.nombre, 'unidades', y.unidades) order by y.unidades desc, y.nombre)
               from (select pd.nombre, sum(z.cantidad - t.resuelto)::integer as unidades
                       from retail.despacho_diferencias_vigentes z
                      cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto
                                            from retail.proveedor_deuda_resoluciones r
                                           where r.diferencia_id = z.id) t
                      cross join retail.fn_prenda_de_la_diferencia(z.id) pd
                      where z.tipo = 'faltante' and z.causa in ('no_vino', 'devuelta')
                        and z.cantidad > t.resuelto
                        and z.despacho_id <> p_despacho_id
                        and z.proveedor_id = q.proveedor_id and z.categoria_id = q.categoria_id and z.marca_id is not distinct from q.marca_id
                        and pd.nombre is not null
                      group by pd.nombre) y
           ), '[]'::jsonb)
$n$
);

-- ---------- Comprobación ----------
do $$
begin
  if position('fn_cercania_de_la_deuda' in pg_get_functiondef('retail.fn_recepcion_cerrar(uuid, uuid, jsonb, jsonb, text, uuid, text)'::regprocedure)) = 0
     or position('fn_prenda_de_la_diferencia' in pg_get_functiondef('retail.fn_nos_debe_deuda(uuid)'::regprocedure)) = 0
     or position('''prendas''' in pg_get_functiondef('retail.fn_nos_debe_resumen()'::regprocedure)) = 0
     or position('''prendas''' in pg_get_functiondef('retail.fn_nos_debe_del_envio(uuid)'::regprocedure)) = 0 then
    raise exception 'La migración no quedó completa: revisa los reemplazos';
  end if;
end;
$$;

reset lock_timeout;
