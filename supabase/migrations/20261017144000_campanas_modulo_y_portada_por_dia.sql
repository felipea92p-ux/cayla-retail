-- Tienda web ▸ Campañas (ADR-0436, Felipe 2026-10-16/17; maqueta docs/maquetas/campanas-diseno-2026-10): actividad 1.
--
-- EL PROBLEMA. Las campañas (Día del Gato, Halloween, Navidad) viven como etiquetas de estilo «campaña» en Catálogo ▸ Atributos, y
-- la regla de cuál anuncia la portada de la tienda online estaba escrita DENTRO de `tienda_portada()`, donde nadie del ERP la ve. Con
-- tres campañas que se cruzan en octubre, nadie podía saber cuál estaba saliendo en la web, ni cuál saldría la semana siguiente.
--
-- LO QUE HACE.
-- 1. El módulo «Campañas» (`campanas`), la sexta pantalla de Tienda web, entre Vitrina y Recomendaciones. Nace SIN rol, solo para el
--    líder, y delegable (CLAUDE.md «Módulos y roles»): esta migración no se lo da a nadie. Es la llave única de las campañas (Felipe,
--    decisión 3: «todo junto, como hoy»): quien lo ve, las diseña y les pone el descuento (eso llega en las actividades 2 y 4).
-- 2. LA regla de la portada, una sola vez: `fn_campana_en_portada(dia)` dice qué campaña anuncia la tienda ESE día. La leen la tienda
--    (`tienda_portada()`, que hoy pregunta por hoy) y el ERP (`campanas_portada_dias`, que pregunta día por día). Si la regla cambia
--    (actividad 6: las campañas sin descuento), cambia en un solo lugar y las dos se enteran.
-- 3. `campanas_lista()`: las campañas con sus fechas, su descuento y cuántas prendas llevan, para la pantalla.
--
-- QUÉ NO CAMBIA. La regla de hoy, copiada tal cual de `tienda_portada()` (20261014220000; verificada igual en producción el
-- 2026-10-17, md5 del cuerpo 1c1e45c5…): aprobada, activa, con descuento, vigente ese día, con prendas o categorías; la que termina
-- primero, después la de mayor descuento, después por nombre. La tienda ve lo mismo que antes (lo comprueba el final).
--
-- Idempotente y sin políticas: se pega en el SQL Editor de una vez (CLAUDE.md «Políticas y deadlocks»).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que la tienda ve HOY, para comprobar al final que no cambió (en la sesión, no en la transacción: corre igual pegada de una vez o
-- sentencia por sentencia).
select set_config('campanas.portada_antes', retail.tienda_portada()::text, false);

-- 1. El módulo -------------------------------------------------------------------------------------------------------------

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('campanas', 'Tienda web', 'Campañas',
   'Ver las campañas y cuál anuncia la portada de la tienda online cada día; crearlas, ponerles fechas, prendas y descuento (que también cobra la caja de las tiendas), imprimir sus etiquetas de precio, y diseñar y publicar cómo se ve cada una en la portada',
   67, false, true)
on conflict (clave) do nothing;

-- 2. La pregunta -------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_puede_campanas()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['campanas']); $$;

comment on function retail.fn_puede_campanas() is
  'Tienda web ▸ Campañas (ADR-0436): el líder o quien tenga el módulo «Campañas» en su rol.';

revoke all on function retail.fn_puede_campanas() from public, anon;
grant execute on function retail.fn_puede_campanas() to authenticated, service_role;

-- 3. LA regla de la portada --------------------------------------------------------------------------------------------------

create or replace function retail.fn_campana_en_portada(p_dia date)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select e.id
  from retail.etiquetas e
  where e.estilo = 'campana'
    and e.estado = 'aprobado'
    and e.activo
    and e.descuento_pct > 0
    and (e.vigente_desde is null or e.vigente_desde <= p_dia)
    and (e.vigente_hasta is null or e.vigente_hasta >= p_dia)
    and (
      exists (select 1 from retail.variante_etiquetas ve where ve.etiqueta_id = e.id)
      or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id)
    )
  order by e.vigente_hasta nulls last, e.descuento_pct desc, e.nombre
  limit 1;
$$;

comment on function retail.fn_campana_en_portada(date) is
  'Tienda web ▸ Campañas (ADR-0436): LA regla de qué campaña anuncia la portada de la tienda online un día dado (null = ninguna). La leen tienda_portada() y campanas_portada_dias(). Interna.';

revoke all on function retail.fn_campana_en_portada(date) from public, anon, authenticated;

-- La tienda pregunta por hoy. Misma salida que antes: {campana: {nombre, pct, hasta} | null}.
create or replace function retail.tienda_portada()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'campana', (
      select jsonb_build_object('nombre', e.nombre, 'pct', e.descuento_pct, 'hasta', e.vigente_hasta)
      from retail.etiquetas e
      where e.id = retail.fn_campana_en_portada(retail.fn_hoy_lima())
    )
  );
$$;

comment on function retail.tienda_portada() is
  'Tienda online (ADR-0408): la portada sin cuenta. {campana: {nombre, pct, hasta} | null}. Cuál, lo decide fn_campana_en_portada (ADR-0436). Solo la llama tienda_web.';

revoke all on function retail.tienda_portada() from public, anon, authenticated;
grant execute on function retail.tienda_portada() to tienda_web;

-- 4. Lo que lee la pantalla ----------------------------------------------------------------------------------------------------

-- Las campañas (las rechazadas no: nunca existieron para la tienda), con cuántos modelos y variantes llevan a mano y en cuántas
-- categorías rigen. Las desactivadas sí: la pantalla las muestra como tales.
create or replace function retail.campanas_lista()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Ver las campañas necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nombre', e.nombre,
        'activo', e.activo,
        'estado', e.estado,
        'desde', e.vigente_desde,
        'hasta', e.vigente_hasta,
        'pct', e.descuento_pct,
        'modelos', coalesce(p.modelos, 0),
        'variantes', coalesce(p.variantes, 0),
        'categorias', coalesce(c.categorias, 0)
      ) order by e.vigente_desde nulls last, e.nombre)
    from retail.etiquetas e
    left join lateral (
      select count(distinct v.producto_id)::int as modelos, count(*)::int as variantes
      from retail.variante_etiquetas ve
      join retail.variantes v on v.id = ve.variante_id
      where ve.etiqueta_id = e.id
    ) p on true
    left join lateral (
      select count(*)::int as categorias from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id
    ) c on true
    where e.estilo = 'campana' and e.estado <> 'rechazado'
  ), '[]'::jsonb);
end;
$$;

comment on function retail.campanas_lista() is
  'Tienda web ▸ Campañas (ADR-0436): [{id, nombre, activo, estado, desde, hasta, pct, modelos, variantes, categorias}]. Pide fn_puede_campanas().';

revoke all on function retail.campanas_lista() from public, anon;
grant execute on function retail.campanas_lista() to authenticated, service_role;

-- Qué campaña anuncia la portada cada día de un rango: la misma regla que la tienda, día por día. Tope de 400 días: la pantalla pide
-- tres meses, y un rango sin tope sería una consulta por día sin fin.
create or replace function retail.campanas_portada_dias(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Ver las campañas necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'El rango de días no es válido.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('dia', d::date, 'campana', retail.fn_campana_en_portada(d::date)) order by d)
    from generate_series(p_desde, p_hasta, interval '1 day') d
  ), '[]'::jsonb);
end;
$$;

comment on function retail.campanas_portada_dias(date, date) is
  'Tienda web ▸ Campañas (ADR-0436): [{dia, campana (id | null)}] por cada día del rango (máx. 400), con la regla de fn_campana_en_portada. Pide fn_puede_campanas().';

revoke all on function retail.campanas_portada_dias(date, date) from public, anon;
grant execute on function retail.campanas_portada_dias(date, date) to authenticated, service_role;

-- 5. Comprobación: la tienda ve hoy exactamente lo mismo que antes ---------------------------------------------------------------

-- Se compara QUÉ campaña se anuncia (nombre, % y fin), no la forma de la respuesta: las que siguen le suman campos (el diseño,
-- 20261017200000; el id y las prendas, 20261017204000). Volver a pegar esta DESPUÉS de esas le quita a la tienda esos campos (sale el rojo
-- de siempre y, sin descuento, ninguna campaña) hasta volver a pegarlas en orden; si la de antes no tenía descuento, la regla de esta la
-- descarta a propósito, y no se compara.
do $$
declare
  v_antes jsonb := current_setting('campanas.portada_antes')::jsonb -> 'campana';
  v_ahora jsonb := retail.tienda_portada() -> 'campana';
begin
  if (v_antes = 'null'::jsonb or (v_antes ->> 'pct') is not null)
     and jsonb_build_object('nombre', v_antes -> 'nombre', 'pct', v_antes -> 'pct', 'hasta', v_antes -> 'hasta')
         is distinct from jsonb_build_object('nombre', v_ahora -> 'nombre', 'pct', v_ahora -> 'pct', 'hasta', v_ahora -> 'hasta') then
    raise exception 'tienda_portada() cambió de respuesta al pasar a fn_campana_en_portada: no se aplica nada.';
  end if;
  if not exists (select 1 from retail.modulos where clave = 'campanas' and grupo = 'Tienda web' and delegable and not solo_lider) then
    raise exception 'El módulo «campanas» no quedó como se esperaba.';
  end if;
end;
$$;
