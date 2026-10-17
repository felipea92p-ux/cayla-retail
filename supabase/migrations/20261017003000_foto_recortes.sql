-- ============================================================================
-- 20261017003000_foto_recortes.sql — CAYLA V2 · «Arma el tuyo» (ADR-0434), actividad 1: los recortes de las fotos de prenda
--
-- EL PROBLEMA PRIMERO. El probador de la tienda online apila prendas a su tamaño real: un top sobre un pantalón, un blazer encima.
-- Para encimarlas, cada prenda tiene que estar recortada, con fondo transparente. Las fotos de hoy son JPG sobre blanco (ADR-0228): el
-- ERP separa la prenda del fondo con MODNet al subirla, pero la pega sobre blanco y la transparencia se pierde. La lámina de los looks
-- lo disimula multiplicando la foto, y eso no sirve para encimar: un blazer «multiplicado» deja ver el top a través.
--
-- LO QUE HACE
--   1. `retail.foto_recortes`: una fila por foto con su recorte. `foto` es el archivo de la foto en el bucket `retail-productos-fotos`
--      (`fotos/<id>.jpg`), `recorte` el PNG transparente (`recortes/<id>.png`), `proporcion` su ancho sobre su alto (para dibujarlo sin
--      esperar a que cargue) y `estado`: `listo` (lo usa el probador), `por_revisar` (salió dudoso: con huecos, de una foto que se
--      subió con su fondo, o sin original) o `descartado` (no se usa; la foto sigue igual). NINGUNA FOTO SE MODIFICA: el recorte es un
--      archivo más (Felipe, 2026-10-16).
--      Va por ARCHIVO y no por fila de `producto_fotos` porque la fila recién nace al guardar la ficha y el recorte se hace al subir la
--      foto (actividad 2); así tampoco se toca `catalogo_actualizar_producto`. RLS encendido y SIN políticas: solo la tocan sus
--      funciones (security definer).
--   2. Las funciones del ERP:
--        · `fn_vitrina_recortes()` — la lectura de Tienda web ▸ Vitrina ▸ Probador: cada foto de un modelo publicado en la web, con su
--          original (si está en el almacén), cuánto vendió su modelo en 90 días (para recortar primero lo que más se vende) y su recorte.
--          Módulo `vitrina_web`.
--        · `registrar_recorte(…)` — anota el recorte que la pantalla ya subió. Lo hace «Preparar recortes» (módulo `vitrina_web`) o,
--          desde la actividad 2, quien sube una foto en Editar o Nuevo producto (quien edita el catálogo). Firma con
--          `fn_actor_persona_id(true)` (el combo «Responsable», ADR-0162).
--        · `revisar_recorte(…)` — usar o descartar un recorte (módulo `vitrina_web`), anotado en la Actividad.
--      La tienda lo lee desde la actividad 4 (`tienda_probador`, otra migración).
--
-- REGLAS (lo que la base no deja que pase)
--   · Un recorte se anota solo si su PNG ya está en el almacén y su foto existe (en el almacén o en una ficha): nunca una fila que
--     apunta a nada.
--   · El archivo de la foto no puede ser un recorte ni un original, y el recorte vive en `recortes/` y es PNG.
--   · Volver a anotar la misma foto reemplaza su recorte (un reintento, o una foto descartada que se recorta de nuevo).
--
-- DESCARTÉ: columnas nuevas en `producto_fotos` (la fila no existe al subir la foto, y se guardan en `catalogo_actualizar_producto`, que
--   comparten varias sesiones); deducir el recorte del nombre del archivo sin tabla (la tienda tendría que preguntarle al almacén si
--   existe y no sabría su proporción ni si se descartó); anotar cada recorte en la Actividad (la tabla ya dice quién y cuándo, y
--   «Preparar recortes» haría cientos de filas iguales: se anota solo lo que decide una persona, usar o descartar).
--
-- PRODUCCIÓN. NO está aplicada (actividad 1 del ADR-0434, con el OK de Felipe). Una sola parte, re-ejecutable: una tabla NUEVA sin
-- políticas y funciones; no altera tablas en uso, no crea políticas ni toca disparadores (ADR-0195). La llave foránea a
-- `public.personas` toma un instante esa tabla en modo SHARE ROW EXCLUSIVE (`lock_timeout` lo corta a los 3 s). Dentro de los textos
-- entre comillas no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:vitrina-recortes`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La tabla ----------
create table if not exists retail.foto_recortes (
  foto             text primary key,
  recorte          text not null,
  proporcion       numeric(6, 4) not null,
  estado           text not null default 'listo',
  motivo           text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid references public.personas (id),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid references public.personas (id),
  constraint foto_recortes_foto_valida check (foto ~ '^[^/]' and foto !~ '^(recortes|originales)/'),
  constraint foto_recortes_recorte_valido check (recorte ~ '^recortes/[^/]+\.png$'),
  constraint foto_recortes_proporcion_valida check (proporcion > 0.05 and proporcion < 20),
  constraint foto_recortes_estado_valido check (estado in ('listo', 'por_revisar', 'descartado')),
  constraint foto_recortes_motivo_valido check (motivo is null or motivo in ('huecos', 'con_fondo', 'sin_original'))
);

comment on table retail.foto_recortes is
  'El recorte (PNG transparente, `recortes/<id>.png`) de cada foto de prenda, para el probador de la tienda online (ADR-0434). `foto` es '
  'el archivo de la foto en el bucket retail-productos-fotos. listo = lo usa el probador; por_revisar = salió dudoso; descartado = no se '
  'usa. La foto nunca se modifica. Solo la tocan sus funciones.';

alter table retail.foto_recortes enable row level security;
revoke all on table retail.foto_recortes from public, anon, authenticated;

-- ---------- 2. Anotar en la Actividad (solo lo que decide una persona) ----------
create or replace function retail.fn_vitrina_recorte_anotar(p_accion text, p_descripcion text, p_persona_id uuid, p_foto text, p_detalle jsonb)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
begin
  begin
    perform retail.fn_actividad_anotar(
      'vitrina_web', p_accion, p_descripcion, p_persona_id, retail.fn_actividad_terminal_ahora(),
      retail.fn_actividad_sede_de(p_persona_id, 'vivo'), null, 'foto_recortes', p_foto, now(), p_detalle, 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el recorte (%)', sqlerrm;
  end;
end;
$fn$;
revoke all on function retail.fn_vitrina_recorte_anotar(text, text, uuid, text, jsonb) from public, anon, authenticated;

-- ---------- 3. La lectura de Vitrina ▸ Probador ----------
-- Cada foto de un modelo publicado en la web, de lo que más vendió en 90 días a lo que menos: si «Preparar recortes» se corta a la
-- mitad, ya quedó lo que más se mira. `original` solo si el archivo está en el almacén (las fotos de antes del ADR-0228 no lo tienen:
-- la pantalla recorta entonces desde la foto misma y lo deja por revisar).
create or replace function retail.fn_vitrina_recortes()
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
      select vp.producto_id, p.codigo, p.referencia as nombre
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
    f as (
      select pf.id, pf.producto_id, pf.color_codigo, pf.url, pf.es_principal, pf.orden, pf.created_at,
             substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$') as archivo,
             substring(pf.url from '^(https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/)') as base
        from retail.producto_fotos pf
       where pf.producto_id in (select pub.producto_id from pub)
    )
    select jsonb_build_object('fotos', coalesce(jsonb_agg(jsonb_build_object(
             'foto', f.archivo,
             'url', f.url,
             'original', case
                 when f.archivo ~ '^fotos/[^/]+\.jpg$'
                  and exists (select 1 from storage.objects o
                               where o.bucket_id = 'retail-productos-fotos'
                                 and o.name = 'originales/' || substring(f.archivo from '^fotos/(.+)$'))
                 then f.base || 'originales/' || substring(f.archivo from '^fotos/(.+)$')
               end,
             'producto_id', f.producto_id,
             'codigo', pub.codigo,
             'nombre', pub.nombre,
             'color', f.color_codigo,
             'color_nombre', co.nombre,
             'vendidas', coalesce(ve.n, 0),
             'recorte', case when r.foto is null then null else jsonb_build_object(
                 'url', f.base || r.recorte, 'proporcion', r.proporcion, 'estado', r.estado, 'motivo', r.motivo) end
           ) order by coalesce(ve.n, 0) desc, pub.nombre, pub.producto_id, f.es_principal desc, f.orden, f.created_at, f.id), '[]'::jsonb))
      from f
      join pub on pub.producto_id = f.producto_id
      left join ventas ve on ve.producto_id = f.producto_id
      left join retail.colores co on co.codigo = f.color_codigo
      left join retail.foto_recortes r on r.foto = f.archivo
     where f.archivo is not null
  );
end;
$fn$;
revoke all on function retail.fn_vitrina_recortes() from public, anon;
grant execute on function retail.fn_vitrina_recortes() to authenticated;

-- ---------- 4. Anotar un recorte que la pantalla ya subió ----------
-- `p_motivo` null = salió bien (`listo`); 'huecos', 'con_fondo' o 'sin_original' = `por_revisar`.
create or replace function retail.registrar_recorte(p_foto text, p_recorte text, p_proporcion numeric, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_estado text;
  v_proporcion numeric(6, 4);
begin
  if not (retail.fn_ve_modulo('vitrina_web') or retail.fn_puede_editar_catalogo()) then
    raise exception 'recorte_sin_permiso'
      using errcode = '42501', hint = 'Para guardar el recorte de una foto necesitas la Vitrina web o poder editar el catálogo.';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  if p_foto is null or p_foto !~ '^[^/]' or p_foto ~ '^(recortes|originales)/' then
    raise exception 'recorte_datos_invalidos' using hint = 'Esa no es una foto de prenda.';
  end if;
  if p_recorte is null or p_recorte !~ '^recortes/[^/]+\.png$' then
    raise exception 'recorte_datos_invalidos' using hint = 'El recorte tiene que ser un PNG de la carpeta de recortes.';
  end if;
  if p_proporcion is null or p_proporcion <= 0.05 or p_proporcion >= 20 then
    raise exception 'recorte_datos_invalidos' using hint = 'La proporción del recorte no es válida.';
  end if;
  if p_motivo is not null and p_motivo not in ('huecos', 'con_fondo', 'sin_original') then
    raise exception 'recorte_datos_invalidos' using hint = 'No se entiende por qué el recorte quedó por revisar.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'retail-productos-fotos' and o.name = p_foto)
     and not exists (select 1 from retail.producto_fotos pf
                      where substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$') = p_foto) then
    raise exception 'recorte_foto_no_existe' using hint = 'Esa foto ya no está. Recarga la pantalla.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'retail-productos-fotos' and o.name = p_recorte) then
    raise exception 'recorte_archivo_no_existe' using hint = 'El recorte no llegó al almacén. Vuelve a intentarlo.';
  end if;

  v_estado := case when p_motivo is null then 'listo' else 'por_revisar' end;
  v_proporcion := round(p_proporcion, 4);
  insert into retail.foto_recortes (foto, recorte, proporcion, estado, motivo, creado_por, actualizado_por)
  values (p_foto, p_recorte, v_proporcion, v_estado, p_motivo, v_actor, v_actor)
  on conflict (foto) do update
     set recorte = excluded.recorte,
         proporcion = excluded.proporcion,
         estado = excluded.estado,
         motivo = excluded.motivo,
         actualizado_en = now(),
         actualizado_por = v_actor;

  return jsonb_build_object('foto', p_foto, 'recorte', p_recorte, 'proporcion', v_proporcion, 'estado', v_estado, 'motivo', p_motivo);
end;
$fn$;
revoke all on function retail.registrar_recorte(text, text, numeric, text) from public, anon;
grant execute on function retail.registrar_recorte(text, text, numeric, text) to authenticated;

-- ---------- 5. Usar o descartar un recorte ----------
create or replace function retail.revisar_recorte(p_foto text, p_usar boolean)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_fila retail.foto_recortes%rowtype;
  v_estado text;
  v_prenda text;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_foto is null or p_usar is null then
    raise exception 'recorte_datos_invalidos' using hint = 'Falta la foto o si se usa su recorte.';
  end if;
  for v_fila in select * from retail.foto_recortes where foto = p_foto for update loop
    exit;
  end loop;
  if v_fila.foto is null then
    raise exception 'recorte_no_existe' using hint = 'Esa foto todavía no tiene recorte. Recarga la pantalla.';
  end if;

  v_estado := case when p_usar then 'listo' else 'descartado' end;
  if v_fila.estado <> v_estado then
    -- La Actividad nombra la prenda de la foto (la primera ficha que la usa), para que se entienda sin abrir nada.
    v_prenda := (select p.referencia
                   from retail.producto_fotos pf
                   join retail.productos p on p.id = pf.producto_id
                  where substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$') = p_foto
                  order by pf.created_at
                  limit 1);
    update retail.foto_recortes
       set estado = v_estado, actualizado_en = now(), actualizado_por = v_actor
     where foto = p_foto;
    perform retail.fn_vitrina_recorte_anotar(
      case when p_usar then 'vitrina_recorte_usado' else 'vitrina_recorte_descartado' end,
      case when p_usar then 'usó en el probador el recorte de una foto de «' || coalesce(v_prenda, 'una prenda') || '»'
           else 'descartó para el probador el recorte de una foto de «' || coalesce(v_prenda, 'una prenda') || '»' end,
      v_actor, p_foto, jsonb_build_object('foto', p_foto, 'antes', v_fila.estado, 'ahora', v_estado, 'motivo', v_fila.motivo));
  end if;

  return jsonb_build_object('foto', p_foto, 'recorte', v_fila.recorte, 'proporcion', v_fila.proporcion, 'estado', v_estado, 'motivo', v_fila.motivo);
end;
$fn$;
revoke all on function retail.revisar_recorte(text, boolean) from public, anon;
grant execute on function retail.revisar_recorte(text, boolean) to authenticated;

-- ---------- 6. Validación final: si algo no quedó, se deshace todo ----------
do $$
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'retail.foto_recortes'::regclass) then
    raise exception 'foto_recortes: la tabla tiene que tener RLS encendido';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'retail' and tablename = 'foto_recortes') then
    raise exception 'foto_recortes: la tabla no lleva políticas (solo la tocan sus funciones)';
  end if;
  if has_table_privilege('authenticated', 'retail.foto_recortes', 'SELECT')
     or has_table_privilege('anon', 'retail.foto_recortes', 'SELECT')
     or (exists (select 1 from pg_roles where rolname = 'tienda_web') and has_table_privilege('tienda_web', 'retail.foto_recortes', 'SELECT')) then
    raise exception 'foto_recortes: la tabla se lee solo por sus funciones';
  end if;
  if has_function_privilege('anon', 'retail.registrar_recorte(text, text, numeric, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.registrar_recorte(text, text, numeric, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.revisar_recorte(text, boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.fn_vitrina_recortes()', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_vitrina_recorte_anotar(text, text, uuid, text, jsonb)', 'EXECUTE') then
    raise exception 'foto_recortes: los permisos de sus funciones no quedaron como deben';
  end if;
  if exists (select 1 from pg_roles where rolname = 'tienda_web')
     and (has_function_privilege('tienda_web', 'retail.registrar_recorte(text, text, numeric, text)', 'EXECUTE')
          or has_function_privilege('tienda_web', 'retail.revisar_recorte(text, boolean)', 'EXECUTE')
          or has_function_privilege('tienda_web', 'retail.fn_vitrina_recortes()', 'EXECUTE')) then
    raise exception 'foto_recortes: la tienda no puede escribir ni leer los recortes del ERP';
  end if;
end $$;

reset lock_timeout;
