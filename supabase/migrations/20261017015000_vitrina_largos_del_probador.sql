-- ============================================================================
-- 20261017015000_vitrina_largos_del_probador.sql — CAYLA V2 · «Arma el tuyo» (ADR-0434), actividad 3: largos y la lista viva
--
-- EL PROBLEMA PRIMERO. El probador de la tienda online dibuja cada prenda a su tamaño real: la altura en pantalla es su largo en cm
-- por una escala, y el ancho sale de la proporción de su recorte. Ninguna tabla guarda un largo (medido el 2026-10-16). Sin él, una
-- falda maxi sale del tamaño de una mini. Y la lista de lo que le falta a cada prenda para el probador vivía en un Excel que envejece.
--
-- LO QUE HACE
--   1. `vitrina_productos.largo_cm`: el largo propio de la prenda (cm, de arriba abajo como cae puesta), medido en la sesión de fotos.
--      Es un dato para mostrarla en la web, como `descripcion_web`: vive en la vitrina y no en `productos`.
--   2. `retail.vitrina_largos_tipicos`: el largo con que el probador dibuja una prenda de esa categoría hasta que alguien anote el suyo.
--      Nace con los valores del ADR-0434. **Vestidos, conjuntos, enterizos y faldas no tienen típico** (Felipe, 2026-10-16: su largo
--      cambia demasiado de una prenda a otra): entran al probador solo con su largo propio. RLS encendido y SIN políticas.
--   3. Las funciones del ERP, con `fn_exigir_modulo('vitrina_web')` y firmadas con `fn_actor_persona_id(true)`:
--        · `fn_vitrina_probador()` — la lista viva de Vitrina ▸ Probador: cada prenda publicada, de lo que más vendió en 90 días a lo
--          que menos, con su largo (el propio y el típico), sus colores (con o sin foto propia, y cuánto hay) y cómo van sus recortes;
--          y los largos típicos de las categorías que hay en la web.
--        · `vitrina_guardar_largo(…)` — el largo propio de una prenda (vacío: vuelve al típico).
--        · `vitrina_guardar_largos_tipicos(…)` — los típicos por categoría (vacío: esa categoría no tiene típico).
--      Quién y cuándo, en `retail.actividad` (módulo `vitrina_web`).
--
-- REGLAS (lo que la base no deja que pase)
--   · Un largo va de 5 a 250 cm (un cinturón no entra al probador; un vestido de gala llega al piso: 160).
--   · Solo se anota el largo de una prenda que está en la vitrina (publicada o no): el probador solo dibuja prendas de la web.
--   · Guardar el largo NO sube la `version` de la vitrina: no pisa lo que otra persona edita en la hoja del modelo (el largo es otro
--     dato), igual que ordenar los looks.
--
-- DESCARTÉ: el largo en `productos` (obligaba a tocar Editar producto y `catalogo_actualizar_producto`, que comparten varias sesiones);
--   un largo por talla (una S y una L de la misma blusa se ven casi iguales en un celular: el probador dibuja la prenda, no la talla);
--   el típico en `categorias` (es un dato de la web, como el resto de la vitrina, y lo edita quien ve la Vitrina, no quien edita el
--   catálogo).
--
-- PRODUCCIÓN. APLICADA el 2026-10-16 con el OK de Felipe (actividad 3 del ADR-0434), después de 20261017003000. Una sola parte,
-- re-ejecutable: agrega una columna a `vitrina_productos` (ACCESS EXCLUSIVE un instante: una columna nula sin valor por defecto y un
-- CHECK sobre ~300 filas; `lock_timeout` lo corta a los 3 s) y crea una tabla NUEVA sin políticas; no crea políticas ni toca
-- disparadores (ADR-0195), así que no se mezcla un `alter` de una tabla en uso con políticas. Dentro de los textos entre comillas no hay
-- ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:vitrina-probador`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El largo propio de la prenda ----------
alter table retail.vitrina_productos add column if not exists largo_cm smallint;
alter table retail.vitrina_productos drop constraint if exists vitrina_productos_largo;
alter table retail.vitrina_productos add constraint vitrina_productos_largo check (largo_cm is null or largo_cm between 5 and 250);
comment on column retail.vitrina_productos.largo_cm is
  'El largo de la prenda en cm, de arriba abajo como cae puesta, para el probador de la tienda online (ADR-0434). Vacío: usa el típico de su categoría (vitrina_largos_tipicos), si tiene.';

-- ---------- 2. Los largos típicos por categoría ----------
create table if not exists retail.vitrina_largos_tipicos (
  categoria_id     uuid primary key references retail.categorias (id) on delete cascade,
  largo_cm         smallint not null,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid references public.personas (id),
  constraint vitrina_largos_tipicos_largo check (largo_cm between 5 and 250)
);
comment on table retail.vitrina_largos_tipicos is
  'El largo típico (cm) con que el probador de la tienda online dibuja una prenda de esa categoría hasta que se anote el suyo (ADR-0434). Una categoría sin fila no tiene típico: sus prendas entran al probador solo con su largo propio. Solo la tocan sus funciones.';
alter table retail.vitrina_largos_tipicos enable row level security;
revoke all on table retail.vitrina_largos_tipicos from public, anon, authenticated;

-- La siembra del ADR-0434 (sin vestidos, conjuntos, enterizos ni faldas). `do nothing`: volver a pegar no pisa lo que se ajustó.
insert into retail.vitrina_largos_tipicos (categoria_id, largo_cm)
select c.id, v.largo
  from retail.categorias c
  join (values
    ('TOP', 45), ('COR', 35), ('POL', 60), ('SUD', 62), ('CMS', 65), ('BOD', 65),
    ('SHO', 35), ('PAN', 100), ('JEA', 100),
    ('CHA', 55), ('CAS', 60), ('BLZ', 70), ('CAP', 80),
    ('CAR', 30)
  ) as v (prefijo, largo) on v.prefijo = c.prefijo
on conflict (categoria_id) do nothing;

-- ---------- 3. Anotar en la Actividad ----------
create or replace function retail.fn_vitrina_largo_anotar(p_accion text, p_descripcion text, p_persona_id uuid, p_registro text, p_detalle jsonb)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
begin
  begin
    perform retail.fn_actividad_anotar(
      'vitrina_web', p_accion, p_descripcion, p_persona_id, retail.fn_actividad_terminal_ahora(),
      retail.fn_actividad_sede_de(p_persona_id, 'vivo'), null, 'vitrina_productos', p_registro, now(), p_detalle, 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el largo (%)', sqlerrm;
  end;
end;
$fn$;
revoke all on function retail.fn_vitrina_largo_anotar(text, text, uuid, text, jsonb) from public, anon, authenticated;

-- ---------- 4. La lista viva de Vitrina ▸ Probador ----------
create or replace function retail.fn_vitrina_probador()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  perform retail.fn_exigir_modulo('vitrina_web');

  return (
    with pub as (
      select vp.producto_id, vp.largo_cm, p.codigo, p.referencia as nombre, p.categoria_id
        from retail.vitrina_productos vp
        join retail.productos p on p.id = vp.producto_id
       where vp.publicado
    ),
    ventas as (
      select va.producto_id, sum(vi.cantidad)::integer as n
        from retail.venta_items vi
        join retail.ventas v on v.id = vi.venta_id
        join retail.variantes va on va.id = vi.variante_id
       where v.created_at >= now() - interval '90 days'
         and v.estado = 'completada'
         and not coalesce(v.es_prueba, false)
         and va.producto_id in (select pub.producto_id from pub)
       group by va.producto_id
    ),
    colores as (
      select va.producto_id, va.color_codigo, coalesce(sum(s.cantidad), 0)::integer as hay
        from retail.variantes va
        left join retail.stock s on s.variante_id = va.id
       where va.activo
         and va.color_codigo is not null
         and va.producto_id in (select pub.producto_id from pub)
       group by va.producto_id, va.color_codigo
    ),
    fotos as (
      select pf.producto_id, pf.color_codigo, pf.url, pf.es_principal, pf.orden, pf.created_at, pf.id,
             substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$') as archivo,
             substring(pf.url from '^(https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/)') as base
        from retail.producto_fotos pf
       where pf.producto_id in (select pub.producto_id from pub)
    )
    select jsonb_build_object(
      'prendas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'producto_id', pub.producto_id,
                 'codigo', pub.codigo,
                 'nombre', pub.nombre,
                 'categoria', case when c.id is null then null
                                   else jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo) end,
                 'vendidas', coalesce(ve.n, 0),
                 'largo', pub.largo_cm,
                 'tipico', lt.largo_cm,
                 'colores', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'codigo', co.color_codigo, 'nombre', cl.nombre, 'hex', cl.hex, 'hay', co.hay,
                            'foto', exists (select 1 from fotos fo where fo.producto_id = pub.producto_id and fo.color_codigo = co.color_codigo))
                          order by cl.orden, cl.nombre, co.color_codigo)
                     from colores co
                     left join retail.colores cl on cl.codigo = co.color_codigo
                    where co.producto_id = pub.producto_id), '[]'::jsonb),
                 'fotos', (select count(*) from fotos fo where fo.producto_id = pub.producto_id and fo.archivo is not null),
                 'recortes', jsonb_build_object(
                   'listos', (select count(*) from fotos fo join retail.foto_recortes r on r.foto = fo.archivo
                               where fo.producto_id = pub.producto_id and r.estado = 'listo'),
                   'por_revisar', (select count(*) from fotos fo join retail.foto_recortes r on r.foto = fo.archivo
                                    where fo.producto_id = pub.producto_id and r.estado = 'por_revisar'),
                   'sin', (select count(*) from fotos fo
                            where fo.producto_id = pub.producto_id and fo.archivo is not null
                              and not exists (select 1 from retail.foto_recortes r where r.foto = fo.archivo))),
                 -- La que se ve en la lista: el recorte listo de su foto principal (o de la primera que lo tenga), si no, su foto.
                 'miniatura', coalesce(
                   (select fo.base || r.recorte from fotos fo join retail.foto_recortes r on r.foto = fo.archivo
                     where fo.producto_id = pub.producto_id and r.estado = 'listo'
                     order by fo.es_principal desc, fo.orden, fo.created_at, fo.id limit 1),
                   (select fo.url from fotos fo where fo.producto_id = pub.producto_id
                     order by fo.es_principal desc, fo.orden, fo.created_at, fo.id limit 1)),
                 'miniatura_es_recorte', exists (
                   select 1 from fotos fo join retail.foto_recortes r on r.foto = fo.archivo
                    where fo.producto_id = pub.producto_id and r.estado = 'listo')
               ) order by coalesce(ve.n, 0) desc, pub.nombre, pub.producto_id)
          from pub
          left join retail.categorias c on c.id = pub.categoria_id
          left join retail.vitrina_largos_tipicos lt on lt.categoria_id = pub.categoria_id
          left join ventas ve on ve.producto_id = pub.producto_id), '[]'::jsonb),
      'tipicos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'categoria_id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'largo', lt.largo_cm,
                 'prendas', (select count(*) from pub where pub.categoria_id = c.id))
               order by c.nombre)
          from retail.categorias c
          left join retail.vitrina_largos_tipicos lt on lt.categoria_id = c.id
         where c.id in (select pub.categoria_id from pub) or lt.categoria_id is not null), '[]'::jsonb)
    )
  );
end;
$fn$;
revoke all on function retail.fn_vitrina_probador() from public, anon;
grant execute on function retail.fn_vitrina_probador() to authenticated;

-- ---------- 5. El largo propio de una prenda ----------
-- `p_largo_cm` null: vuelve al típico de su categoría (o, si no tiene, la prenda sale del probador hasta que se anote).
create or replace function retail.vitrina_guardar_largo(p_producto_id uuid, p_largo_cm integer)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_antes smallint;
  v_nombre text;
  v_existe boolean := false;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_producto_id is null then
    raise exception 'vitrina_largo_invalido' using hint = 'Falta la prenda.';
  end if;
  if p_largo_cm is not null and (p_largo_cm < 5 or p_largo_cm > 250) then
    raise exception 'vitrina_largo_invalido' using hint = 'El largo va de 5 a 250 cm.';
  end if;
  for v_antes, v_nombre in
    select vp.largo_cm, p.referencia
      from retail.vitrina_productos vp
      join retail.productos p on p.id = vp.producto_id
     where vp.producto_id = p_producto_id
       for update of vp
  loop
    v_existe := true;
    exit;
  end loop;
  if not v_existe then
    raise exception 'vitrina_largo_sin_vitrina' using hint = 'Esa prenda no está en la vitrina: muéstrala en la web primero.';
  end if;

  if v_antes is distinct from p_largo_cm then
    update retail.vitrina_productos
       set largo_cm = p_largo_cm, actualizado_en = now(), actualizado_por = v_actor
     where producto_id = p_producto_id;
    perform retail.fn_vitrina_largo_anotar(
      'vitrina_largo',
      case when p_largo_cm is null then 'volvió al largo típico de «' || v_nombre || '» en el probador'
           else 'anotó el largo de «' || v_nombre || '» para el probador: ' || p_largo_cm || ' cm' end,
      v_actor, p_producto_id::text, jsonb_build_object('producto_id', p_producto_id, 'antes', v_antes, 'ahora', p_largo_cm));
  end if;

  return jsonb_build_object('producto_id', p_producto_id, 'largo', p_largo_cm);
end;
$fn$;
revoke all on function retail.vitrina_guardar_largo(uuid, integer) from public, anon;
grant execute on function retail.vitrina_guardar_largo(uuid, integer) to authenticated;

-- ---------- 6. Los largos típicos ----------
-- `p_largos`: [{categoria_id, largo_cm}] — `largo_cm` null quita el típico (esa categoría entra al probador solo con su largo propio).
-- Las categorías que no vienen no cambian. Todo o nada.
create or replace function retail.vitrina_guardar_largos_tipicos(p_largos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_fila jsonb;
  v_categoria uuid;
  v_largo integer;
  v_antes smallint;
  v_cambios jsonb := '[]'::jsonb;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_largos is null or jsonb_typeof(p_largos) <> 'array' or jsonb_array_length(p_largos) = 0 then
    raise exception 'vitrina_largo_invalido' using hint = 'No llegó ningún largo.';
  end if;
  for v_fila in select * from jsonb_array_elements(p_largos) loop
    v_categoria := nullif(v_fila ->> 'categoria_id', '')::uuid;
    v_largo := nullif(v_fila ->> 'largo_cm', '')::integer;
    if v_categoria is null or not exists (select 1 from retail.categorias where id = v_categoria) then
      raise exception 'vitrina_largo_invalido' using hint = 'Una de las categorías ya no existe. Recarga la pantalla.';
    end if;
    if v_largo is not null and (v_largo < 5 or v_largo > 250) then
      raise exception 'vitrina_largo_invalido' using hint = 'El largo va de 5 a 250 cm.';
    end if;
    v_antes := (select lt.largo_cm from retail.vitrina_largos_tipicos lt where lt.categoria_id = v_categoria);
    continue when v_antes is not distinct from v_largo;
    if v_largo is null then
      delete from retail.vitrina_largos_tipicos where categoria_id = v_categoria;
    else
      insert into retail.vitrina_largos_tipicos (categoria_id, largo_cm, actualizado_por)
      values (v_categoria, v_largo, v_actor)
      on conflict (categoria_id) do update set largo_cm = excluded.largo_cm, actualizado_en = now(), actualizado_por = v_actor;
    end if;
    v_cambios := v_cambios || jsonb_build_object('categoria_id', v_categoria, 'antes', v_antes, 'ahora', v_largo);
  end loop;

  if jsonb_array_length(v_cambios) > 0 then
    perform retail.fn_vitrina_largo_anotar(
      'vitrina_largos_tipicos',
      'cambió ' || jsonb_array_length(v_cambios) || case when jsonb_array_length(v_cambios) = 1 then ' largo típico' else ' largos típicos' end
        || ' del probador',
      v_actor, 'largos_tipicos', jsonb_build_object('cambios', v_cambios));
  end if;

  return jsonb_build_object('cambios', jsonb_array_length(v_cambios));
end;
$fn$;
revoke all on function retail.vitrina_guardar_largos_tipicos(jsonb) from public, anon;
grant execute on function retail.vitrina_guardar_largos_tipicos(jsonb) to authenticated;

-- ---------- 7. Validación final: si algo no quedó, se deshace todo ----------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'vitrina_productos' and column_name = 'largo_cm') then
    raise exception 'largos: falta vitrina_productos.largo_cm';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'retail.vitrina_largos_tipicos'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'retail' and tablename = 'vitrina_largos_tipicos') then
    raise exception 'largos: vitrina_largos_tipicos va con RLS encendido y sin políticas';
  end if;
  if has_table_privilege('authenticated', 'retail.vitrina_largos_tipicos', 'SELECT')
     or has_table_privilege('anon', 'retail.vitrina_largos_tipicos', 'SELECT') then
    raise exception 'largos: la tabla se lee solo por sus funciones';
  end if;
  if has_function_privilege('anon', 'retail.vitrina_guardar_largo(uuid, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.vitrina_guardar_largo(uuid, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.vitrina_guardar_largos_tipicos(jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.fn_vitrina_probador()', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_vitrina_largo_anotar(text, text, uuid, text, jsonb)', 'EXECUTE') then
    raise exception 'largos: los permisos de sus funciones no quedaron como deben';
  end if;
  if exists (select 1 from pg_roles where rolname = 'tienda_web')
     and (has_function_privilege('tienda_web', 'retail.fn_vitrina_probador()', 'EXECUTE')
          or has_function_privilege('tienda_web', 'retail.vitrina_guardar_largo(uuid, integer)', 'EXECUTE')
          or has_table_privilege('tienda_web', 'retail.vitrina_largos_tipicos', 'SELECT')) then
    raise exception 'largos: la tienda lee los largos por su propia función, no por las del ERP';
  end if;
end $$;

reset lock_timeout;
