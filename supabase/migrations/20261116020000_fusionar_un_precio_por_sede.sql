-- ============================================================================
-- 20261116020000_fusionar_un_precio_por_sede.sql — Fusionar productos: tras fusionar, cada sede cobra UN precio por la prenda (ADR-0650, act. 2026-11-16)
-- ============================================================================
--
-- EL PROBLEMA PRIMERO. 20261115153000 dejaba, en tres casos, la misma prenda con dos precios en la misma tienda (ensayo 2026-11-15, en
-- local). Blusa de tallas S y M a S/ 79.90 (general) fusionada con su repetida de talla XL, que cobraba S/ 169 en Trujillo:
--   1. Sin conflicto (solo la repetida tenía precio propio en Trujillo): XL y M quedaban en 169 y S en 79.90. La hoja decía «Conserva S/ 169».
--   2. Con conflicto, eligiendo la repetida, cuando la que queda tenía precio propio solo en una talla: lo mismo, S se quedaba en 79.90.
--   3. Eligiendo otro precio general (S/ 99) con la repetida a S/ 79.90 en Trujillo: la hoja ni mostraba Trujillo y quedaban 79.90 y 99.
-- La causa: solo se alineaban las tallas que ya tenían precio propio; la que cobraba el general no se tocaba. Y la lista de sedes
-- comparaba contra el precio general de ANTES, no contra el elegido.
--
-- LA REGLA (Felipe 2026-11-16: «arréglalo», con «un solo precio por sede»). Dos capas, las mismas de `fn_precios_en_sedes`:
--   · El PRECIO DE LA PRENDA en cada tienda es uno. En cada sede que la hoja muestra, toda talla a la venta del producto final cobra el
--     precio de prenda de la ficha ganadora: la elegida para esa sede o, si no se eligió, la de por defecto (la que queda, si tenía precio
--     de prenda ahí; si no, la primera repetida que lo tenía). Es el precio que la hoja le mostró a la persona.
--   · Una EXCEPCIÓN DE TALLA (`precios_sede_variante`, «la XL cuesta más en Trujillo») es una decisión de alguien sobre esa talla: viaja
--     con su talla y se conserva, también si es igual al precio general. Si dos chocan al juntarse dos tallas, gana la de la ficha ganadora
--     en esa sede; si no, la de la que queda. La de una talla apagada es vieja y no revive cuando la fusión la vuelve a poner a la venta.
--   · Sedes que la hoja no muestra: el precio de prenda de la que queda (o el general) y las excepciones como arriba.
--   · La lista de sedes compara precios de PRENDA, y contra el precio general que la persona eligió (`p_elecciones.precio`).
--   · La talla de obsequio no se toca. «Un solo precio» (`precio_modo = 'uno'`) no cambia.
-- Revisión adversarial 2026-11-16 (dos rondas, cada hallazgo reproducido en local): la primera versión tomaba como «precio de la ficha» el
-- más repetido entre sus tallas con precio propio, y una excepción de una talla se volvía el precio de toda la prenda.
--
-- DESCARTÉ
--   · «Talla por talla» sin unificar la prenda: deja la misma prenda con dos precios en la tienda sin que nadie lo decidiera, y la hoja
--     prometía uno. Felipe eligió un precio por sede.
--   · Borrar las excepciones de talla de la ficha perdedora: es borrar una decisión que la persona no vio en la hoja.
--   · Escribir el precio en la capa de la prenda (`precios_sede_prenda`): su disparador archivaría las excepciones por talla. Se escribe
--     por talla, solo donde lo de hoy no es lo que corresponde.
--
-- SE ROMPE SI: alguien usa excepciones de talla para TODAS las tallas en vez del precio de prenda de la tienda. Ahí cada talla conserva
-- la suya y la hoja, que solo mira precios de prenda, no muestra esa sede.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA parte (tres funciones reescritas, una nueva de 4 argumentos, dos `drop function` de las firmas viejas y
-- un reemplazo anclado en `fusionar_productos`); sin `alter table`, sin políticas, sin `drop trigger` (ADR-0195). Idempotente. Sin
-- `select … into` dentro de textos entre comillas (ADR-0288). Necesita 20261115153000.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. La lista de sedes: el precio de cada FICHA en cada tienda ----------
-- El precio de una ficha en una tienda es el de su prenda allí (`precios_sede_prenda`) o, si no tiene, el precio general que tendrá el
-- producto final (el elegido, `p_elecciones.precio`; sin elección, el de la que queda). Las excepciones de UNA talla no cuentan: son de
-- esa talla y viajan con ella (20261115153000 usaba el más repetido entre las tallas con precio propio, y así una excepción de una
-- talla podía volverse el precio de toda la prenda; revisión 2026-11-16).
-- Una sede sale en la lista cuando una repetida tiene precio de prenda allí distinto del de la que queda. `conflicto` = dos fichas con
-- precio de prenda distinto; `por_defecto` = la que queda si tiene precio de prenda allí, si no la primera repetida que lo tiene.

create or replace function retail.fn_fusion_precios_sede_resumen(p_queda uuid, p_duplicados uuid[], p_elecciones jsonb)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with fichas as (
    select o.id, o.n, o.id = p_queda as queda
      from unnest(array_prepend(p_queda, array(
             select d0 from (select d0, min(k) as k from unnest(coalesce(p_duplicados, '{}'::uuid[])) with ordinality as x(d0, k)
                              where d0 is not null and d0 <> p_queda group by d0) y order by k))) with ordinality as o(id, n)
  ), general as (
    select coalesce(nullif(coalesce(p_elecciones, '{}'::jsonb) ->> 'precio', '')::numeric,
                    (select mode() within group (order by w.precio) from retail.variantes w
                      where w.producto_id = p_queda and w.activo and w.fusionada_en_id is null)) as precio
  ), sedes as (
    select u.id, u.nombre
      from retail.ubicaciones u
     where u.activo and u.tipo = 'tienda'
       and exists (select 1 from retail.precios_sede_prenda ps
                    where ps.ubicacion_id = u.id and ps.archivado_en is null and ps.producto_id in (select f.id from fichas f))
  ), celdas as (
    select s.id as ubicacion_id, s.nombre, f.id, f.n, f.queda, ps.precio as propio,
           coalesce((select q.precio from retail.precios_sede_prenda q
                      where q.producto_id = p_queda and q.ubicacion_id = s.id and q.archivado_en is null),
                    (select g.precio from general g)) as de_la_que_queda
      from sedes s
      cross join fichas f
      left join retail.precios_sede_prenda ps on ps.producto_id = f.id and ps.ubicacion_id = s.id and ps.archivado_en is null
  ), por_sede as (
    select c.ubicacion_id, c.nombre,
           jsonb_agg(jsonb_build_object('id', c.id, 'queda', c.queda,
                                        'precio', coalesce(c.propio, (select g.precio from general g)),
                                        'propio', c.propio is not null) order by c.n) as productos,
           bool_or(not c.queda and c.propio is not null and c.propio is distinct from c.de_la_que_queda) as sale,
           count(distinct c.propio) as distintos,
           coalesce(max(c.id::text) filter (where c.queda and c.propio is not null),
                    (array_agg(c.id::text order by c.n) filter (where c.propio is not null))[1]) as por_defecto
      from celdas c
     group by c.ubicacion_id, c.nombre
  )
  select coalesce(jsonb_agg(jsonb_build_object('ubicacion_id', p.ubicacion_id, 'nombre', p.nombre, 'conflicto', p.distintos > 1,
                                               'por_defecto', p.por_defecto::uuid, 'productos', p.productos) order by p.nombre)
                  filter (where p.sale), '[]'::jsonb)
    from por_sede p
$$;

comment on function retail.fn_fusion_precios_sede_resumen(uuid, uuid[], jsonb) is
  'ADR-0650 (act. 2026-11-16): las sedes donde una ficha repetida tiene precio de prenda distinto del que cobraría la que queda (su precio de prenda allí o el general elegido), con su elección por defecto. La leen previsualizar_fusion_productos y fn_fusion_precios_sede_capturar.';
revoke all on function retail.fn_fusion_precios_sede_resumen(uuid, uuid[], jsonb) from public, anon, authenticated;

-- ---------- 2. La previsualización pasa las elecciones a la lista ----------

create or replace function retail.previsualizar_fusion_productos(p_queda uuid, p_duplicados uuid[], p_elecciones jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_plan jsonb;
  v_sedes jsonb;
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes fusionar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.'
      using errcode = '42501';
  end if;
  v_plan := retail.fn_fusion_productos_plan(p_queda, p_duplicados, p_elecciones);
  if not coalesce((v_plan ->> 'ok')::boolean, false) then
    return v_plan;
  end if;
  v_sedes := retail.fn_fusion_precios_sede_resumen(p_queda, p_duplicados, p_elecciones);
  if jsonb_array_length(v_sedes) = 0 then
    return v_plan;
  end if;
  return v_plan || jsonb_build_object(
    'precios_sede', v_sedes,
    'diferencias', coalesce(v_plan -> 'diferencias', '[]'::jsonb) || '["precio_sede"]'::jsonb);
end;
$$;

-- ---------- 3. Antes de mover nada: las excepciones de talla y la lista de sedes que vio la persona ----------
-- Las excepciones se leen de su tabla (`precios_sede_variante`), no de «lo que cobra distinto del general»: una excepción igual al precio
-- general también es una decisión de alguien («esta talla no sube») y se conserva. Solo las de tallas a la venta: la de una talla apagada
-- es vieja y no vuelve a valer cuando la fusión la reactiva.

create or replace function retail.fn_fusion_precios_sede_capturar(p_queda uuid, p_duplicados uuid[], p_plan jsonb, p_elecciones jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
begin
  create temp table if not exists fusion_sede_excepciones (
    producto_id uuid, destino_id uuid, ubicacion_id uuid, precio numeric, orden integer
  ) on commit drop;
  truncate pg_temp.fusion_sede_excepciones;
  -- `destino_id`: la talla en la que termina (la misma si se muda; la que la absorbe si se junta). `orden`: la que queda, primero.
  insert into pg_temp.fusion_sede_excepciones
    select v.producto_id,
           coalesce((select (e ->> 'con_variante_id')::uuid from jsonb_array_elements(p_plan -> 'variantes') e
                      where e ->> 'trato' = 'junta' and (e ->> 'variante_id')::uuid = v.id), v.id),
           pv.ubicacion_id, pv.precio,
           array_position(array_prepend(p_queda, p_duplicados), v.producto_id)
      from retail.precios_sede_variante pv
      join retail.variantes v on v.id = pv.variante_id
      join retail.ubicaciones u on u.id = pv.ubicacion_id
     where pv.archivado_en is null and v.activo and v.fusionada_en_id is null and u.activo and u.tipo = 'tienda'
       and v.producto_id = any (array_prepend(p_queda, p_duplicados));

  -- Las sedes que la persona vio en la hoja, con el precio de prenda de cada ficha que lo tiene y la que gana por defecto. Sale del
  -- mismo cálculo que la previsualización, con las mismas elecciones: lo que se aplica es lo que se vio.
  create temp table if not exists fusion_sede_lista (
    ubicacion_id uuid, por_defecto uuid, producto_id uuid, precio numeric
  ) on commit drop;
  truncate pg_temp.fusion_sede_lista;
  insert into pg_temp.fusion_sede_lista
    select (s ->> 'ubicacion_id')::uuid, (s ->> 'por_defecto')::uuid, (p ->> 'id')::uuid, (p ->> 'precio')::numeric
      from jsonb_array_elements(retail.fn_fusion_precios_sede_resumen(p_queda, p_duplicados, p_elecciones)) s
      cross join lateral jsonb_array_elements(s -> 'productos') p
     where (p ->> 'propio')::boolean;
end;
$$;

comment on function retail.fn_fusion_precios_sede_capturar(uuid, uuid[], jsonb, jsonb) is
  'ADR-0650 (act. 2026-11-16): guarda, antes de mover nada, las excepciones de talla a la venta y la lista de sedes que vio la persona. Solo la llama fusionar_productos.';
revoke all on function retail.fn_fusion_precios_sede_capturar(uuid, uuid[], jsonb, jsonb) from public, anon, authenticated;

-- ---------- 4. Después de mover todo: un precio de prenda por sede; cada excepción de talla, en su talla ----------

create or replace function retail.fn_fusion_precios_sede_aplicar(
  p_queda uuid, p_modo text, p_elecciones jsonb, p_persona uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_n integer;
  v_archivados integer := 0;
  v_fijados integer := 0;
  v_hoy numeric;
  v_sin numeric;
  v_sede text;
  r record;
begin
  if p_modo = 'uno' then
    -- Un solo precio: los de sede del producto final se archivan (nunca se borran) y todas cobran el general.
    update retail.precios_sede_variante pv
       set archivado_en = now(), archivado_por = p_persona,
           archivado_motivo = 'Fusión de productos: un solo precio para todas las sedes'
     where pv.archivado_en is null and pv.variante_id in (select w.id from retail.variantes w where w.producto_id = p_queda);
    get diagnostics v_n = row_count;
    v_archivados := v_n;
    update retail.precios_sede_prenda pp
       set archivado_en = now(), archivado_por = p_persona,
           archivado_motivo = 'Fusión de productos: un solo precio para todas las sedes'
     where pp.archivado_en is null and pp.producto_id = p_queda;
    get diagnostics v_n = row_count;
    v_archivados := v_archivados + v_n;
    return jsonb_build_object('modo', 'uno', 'archivados', v_archivados, 'fijados', 0);
  end if;

  -- La captura de esta misma transacción tiene que existir. Si no (una fusión que empezó justo mientras se pegaba esta migración),
  -- se frena con una frase y todo se deshace: basta con volver a intentarlo.
  if to_regclass('pg_temp.fusion_sede_lista') is null or to_regclass('pg_temp.fusion_sede_excepciones') is null then
    raise exception 'El sistema se acaba de actualizar mientras fusionabas. No se cambió nada: vuelve a intentarlo.'
      using errcode = 'P0001', hint = 'fusion_reintentar';
  end if;

  -- Para cada talla a la venta del producto final y cada tienda, lo que debe cobrar:
  --   1. Si la talla (o la que se juntó con ella) tenía una excepción propia en esa tienda: esa. Si dos chocan al juntarse, la de la ficha
  --      ganadora en esa sede; si no, la de la que queda.
  --   2. Si no, el precio de la prenda en esa tienda: en una sede de la lista, el de la ficha ganadora (la elegida o la de por defecto);
  --      fuera de la lista, el de la que queda allí, o el general.
  -- Solo se escribe donde lo de hoy no es eso. La talla de obsequio (S/ 0 en una categoría que lo admite) no se toca.
  for r in
    with ganador as (
      select distinct l.ubicacion_id,
             coalesce((select l2.producto_id from pg_temp.fusion_sede_lista l2
                        where l2.ubicacion_id = l.ubicacion_id
                          and l2.producto_id::text = nullif(p_elecciones #>> array['precios_sede', l.ubicacion_id::text], '')),
                      l.por_defecto) as producto_id
        from pg_temp.fusion_sede_lista l
    ), ganador_precio as (
      select g.ubicacion_id, g.producto_id, l.precio
        from ganador g
        join pg_temp.fusion_sede_lista l on l.ubicacion_id = g.ubicacion_id and l.producto_id = g.producto_id
    ), prenda as (
      select u.id as ubicacion_id, gp.producto_id as ganador,
             coalesce(gp.precio,
                      (select ps.precio from retail.precios_sede_prenda ps
                        where ps.producto_id = p_queda and ps.ubicacion_id = u.id and ps.archivado_en is null)) as precio
        from retail.ubicaciones u
        left join ganador_precio gp on gp.ubicacion_id = u.id
       where u.activo and u.tipo = 'tienda'
    )
    select w.id as destino_id, pr.ubicacion_id,
           coalesce((select e.precio from pg_temp.fusion_sede_excepciones e
                      where e.destino_id = w.id and e.ubicacion_id = pr.ubicacion_id
                      order by (e.producto_id is not distinct from pr.ganador) desc, e.orden
                      limit 1),
                    pr.precio,
                    w.precio) as precio
      from retail.variantes w
      join retail.productos p on p.id = w.producto_id
      cross join prenda pr
     where w.producto_id = p_queda and w.activo and w.fusionada_en_id is null
       and not (w.precio = 0 and retail.fn_categoria_admite_precio_cero(p.categoria_id))
  loop
    v_hoy := retail.fn_precio_en_sede(r.destino_id, r.ubicacion_id);
    if v_hoy is distinct from r.precio then
      v_sede := (select u.nombre from retail.ubicaciones u where u.id = r.ubicacion_id);
      if r.precio > 5000 then
        raise exception 'El precio de S/ % en % pasa del tope de S/ 5 000 por talla y sede. Corrígelo antes de fusionar.', r.precio, v_sede
          using errcode = 'P0001', hint = 'precio_sede_tope';
      end if;
      update retail.precios_sede_variante
         set archivado_en = now(), archivado_por = p_persona,
             archivado_motivo = 'Fusión de productos: un precio para la prenda en esta sede'
       where variante_id = r.destino_id and ubicacion_id = r.ubicacion_id and archivado_en is null;
      -- Sin la excepción, ¿ya cobra lo que debe? (una excepción vieja que sobraba). Si no, se escribe la que corresponde.
      v_sin := retail.fn_precio_en_sede(r.destino_id, r.ubicacion_id);
      if v_sin is distinct from r.precio then
        insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo, creado_por)
          values (r.destino_id, r.ubicacion_id, r.precio, 'Fusión de productos: un precio para la prenda en ' || v_sede, p_persona);
      end if;
      v_fijados := v_fijados + 1;
    end if;
  end loop;
  return jsonb_build_object('modo', 'por_sede', 'archivados', 0, 'fijados', v_fijados);
end;
$$;

comment on function retail.fn_fusion_precios_sede_aplicar(uuid, text, jsonb, uuid) is
  'ADR-0650 (act. 2026-11-16): deja a cada sede de la lista con un precio de prenda (el de la ficha ganadora) y cada excepción de talla en su talla (por_sede), o a todas con uno solo (uno). Solo la llama fusionar_productos, después de mover las tallas.';
revoke all on function retail.fn_fusion_precios_sede_aplicar(uuid, text, jsonb, uuid) from public, anon, authenticated;

-- ---------- 5. fusionar_productos llama a la captura con las elecciones (reemplazo anclado, re-ejecutable) ----------

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
  'retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)',
  $a$  perform retail.fn_fusion_precios_sede_capturar(p_queda, v_dups, v_plan);$a$,
  $a$  perform retail.fn_fusion_precios_sede_capturar(p_queda, v_dups, v_plan, v_el);$a$,
  1);

-- ---------- 6. Las firmas viejas ya no las llama nadie ----------
-- `drop function` no toma las tablas de `auth` ni de `storage` (ADR-0195).
drop function if exists retail.fn_fusion_precios_sede_capturar(uuid, uuid[], jsonb);
drop function if exists retail.fn_fusion_precios_sede_resumen(uuid, uuid[]);

-- ---------- 7. Verificación: si algo no quedó, la migración falla ----------
do $$
begin
  if position('fn_fusion_precios_sede_capturar(p_queda, v_dups, v_plan, v_el)' in
              pg_get_functiondef('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)'::regprocedure)) = 0
     or position('fn_fusion_precios_sede_resumen(p_queda, p_duplicados, p_elecciones)' in
              pg_get_functiondef('retail.previsualizar_fusion_productos(uuid, uuid[], jsonb)'::regprocedure)) = 0
     or position('fusion_sede_excepciones' in
              pg_get_functiondef('retail.fn_fusion_precios_sede_aplicar(uuid, text, jsonb, uuid)'::regprocedure)) = 0 then
    raise exception '20261116020000: la fusión no quedó con un precio por sede.';
  end if;
end;
$$;
