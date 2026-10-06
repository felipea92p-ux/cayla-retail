-- ============================================================================
-- 20261006180000_historial_de_la_prenda.sql — CAYLA V2 (ADR-0354; Felipe, 2026-10-06: maqueta A «Hilo del tiempo»)
--
-- EL PROBLEMA. El historial de una prenda debía contar TODOS sus cambios y quién los hizo, pero el ledger
-- `historial_producto_cambios` no anotaba cinco cosas que sí cambian una prenda:
--   · las ETIQUETAS (poner «Oferta», quitar «Nuevo»): `variante_etiquetas` no tenía disparador;
--   · un COLOR o una TALLA NUEVOS: el disparador de `variantes` es solo AFTER UPDATE;
--   · las FOTOS que se suben o quitan desde la ficha;
--   · el TEJIDO y el PATRÓN.
-- Y no decía DÓNDE se hizo el cambio.
--
-- LO QUE HACE (todo por disparador, como el resto del ledger desde 20260915204541: ninguna pantalla puede olvidarse):
--   1. Columna `ubicacion_id` en el ledger, llenada sola por su valor por defecto (`fn_historial_sede`: la sede de la
--      operación, la misma que usa Actividad). Las filas viejas quedan sin sede: no se inventa.
--   2. Disparadores nuevos que escriben en el ledger con la firma de siempre (`fn_actor_persona_id(true)`):
--        variante_etiquetas  → campo `etiqueta`        (valor = etiqueta_id; antes vacío = se puso, después vacío = se quitó)
--        variantes (INSERT)  → campo `variante_nueva`  (valor_nuevo = {"color","talla","precio"} de ese momento)
--        producto_fotos      → campo `foto`            (valor = la URL; vacío del otro lado). Lo que Actividad ya leía como
--                                                      «agregó / quitó N fotos» sigue igual (quitada = valor_nuevo vacío).
--        productos           → campos `tejido_id` y `patron_id`
--      NO anotan lo que nace junto con la prenda (el alta ya lo cuenta `producto_origen`): una variante, etiqueta o foto de
--      un producto creado en la MISMA transacción (`productos.created_at = now()`) no es un cambio, es el nacimiento.
--   3. Para que el ledger diga solo lo que de verdad cambió:
--        · Una foto subida con `agregar_foto_producto` (Existencias ▸ Fotos que faltan, ADR-0283; hoy solo en ramas, no en
--          `main` ni en producción) escribe su propia fila `foto` = 'agregada'. Como el disparador ya anotó esa foto (con su
--          URL), un filtro ANTES de insertar en el ledger descarta esa segunda fila. No se toca esa función: así da igual en
--          qué orden se fusionen las ramas.
--        · Parche ANCLADO a `actualizar_variantes_etiquetas`: borraba TODAS las etiquetas de la variante y las volvía a poner en cada guardado
--          de la ficha: con el disparador, cada guardado habría anotado «quitó Oferta» y «puso Oferta» sin que nada cambiara.
--          Ahora borra solo las que salen y pone solo las que entran (`on conflict do nothing`). El resultado final es el mismo.
--   4. Lectura `fn_historial_prenda(p_producto_id)`: cada fila del ledger de la prenda con los nombres ya resueltos (color,
--      talla, etiqueta, categoría, marca…), el color del dato (hex), quién (nombre, rol, su sede) y dónde; más una fila
--      `alta` armada de `producto_origen` (quién, cuándo y dónde nació, con qué colores, tallas y precio). El costo solo a
--      quien ve el dinero de compras (`fn_puede_ver_dinero_de_compras`, 20260923193700): el historial no es otra puerta.
--   5. Actividad dice bien los campos nuevos (`fn_actividad_etiqueta_campo`, `fn_actividad_valor_producto`).
--
-- LO QUE NO HACE. No reconstruye el pasado: lo que pasó antes de este archivo no quedó anotado y la pantalla lo dice.
-- No toca `fn_actor_persona_id` ni `acciones_sin_responsable` (la firma de Editar producto va en 20261006180100, que se
-- pega DESPUÉS de publicar la web).
--
-- PRODUCCIÓN. Sin políticas (ADR-0195): UNA sola parte, re-ejecutable, `lock_timeout = 3s`. Toma candados breves de
-- `historial_producto_cambios` (columna nueva SIN valor por defecto primero: no reescribe la tabla), `variantes`,
-- `variante_etiquetas`, `producto_fotos` y `productos` al crear los disparadores (`create or replace trigger`, nunca
-- `drop trigger`). El parche anclado falla sin tocar nada si la función viva no es la revisada.
-- Prueba: `node scripts/pruebas/historial_prenda.mjs`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. Dónde se hizo ----------

alter table retail.historial_producto_cambios add column if not exists ubicacion_id uuid references retail.ubicaciones (id);

-- La sede de la operación (terminal → su tienda; persona → la sede que manda la web). Sin sesión (SQL Editor, scripts) o si
-- algo falla: vacío. Nunca detiene un guardado.
create or replace function retail.fn_historial_sede() returns uuid
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
begin
  if auth.uid() is null then
    return null;
  end if;
  return retail.fn_ubicacion_de_la_operacion();
exception when others then
  return null;
end;
$fn$;
revoke all on function retail.fn_historial_sede() from public, anon, authenticated;

alter table retail.historial_producto_cambios alter column ubicacion_id set default retail.fn_historial_sede();

-- ---------- 2. Piezas comunes de los disparadores ----------

-- Quién firma (el responsable del combo, ADR-0162). Si la firma falla, la fila queda sin persona: el guardado sigue.
create or replace function retail.fn_historial_actor() returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  return retail.fn_actor_persona_id(true);
exception when others then
  return null;
end;
$fn$;
revoke all on function retail.fn_historial_actor() from public, anon, authenticated;

-- ¿La prenda nace en esta misma transacción? Entonces lo que se le agrega es su nacimiento, no un cambio.
create or replace function retail.fn_historial_nace_ahora(p_producto_id uuid) returns boolean
language sql stable security definer set search_path = retail, public, extensions as $$
  select coalesce((select p.created_at = now() from retail.productos p where p.id = p_producto_id), true);
$$;
revoke all on function retail.fn_historial_nace_ahora(uuid) from public, anon, authenticated;

-- ---------- 3. Etiquetas ----------

create or replace function retail.fn_historial_etiqueta() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_variante uuid := case when tg_op = 'INSERT' then new.variante_id else old.variante_id end;
  v_producto uuid;
  v_variante_nueva boolean;
begin
  begin
    v_producto := (select v.producto_id from retail.variantes v where v.id = v_variante);
    -- Variante que ya no existe (se borró con su prenda) o que nace ahora: no es un cambio de etiquetas.
    if v_producto is null then return null; end if;
    v_variante_nueva := (select v.created_at = now() from retail.variantes v where v.id = v_variante);
    if v_variante_nueva or retail.fn_historial_nace_ahora(v_producto) then return null; end if;

    if tg_op = 'INSERT' then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', v_variante, 'etiqueta', null, new.etiqueta_id::text, retail.fn_historial_actor());
    else
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', v_variante, 'etiqueta', old.etiqueta_id::text, null, retail.fn_historial_actor());
    end if;
  exception when others then
    raise warning 'historial: no se anotó la etiqueta de la variante % (%)', v_variante, sqlerrm;
  end;
  return null;
end;
$fn$;
revoke all on function retail.fn_historial_etiqueta() from public, anon, authenticated;

create or replace trigger variante_etiquetas_historial
  after insert or delete on retail.variante_etiquetas
  for each row execute function retail.fn_historial_etiqueta();

-- ---------- 4. Variante nueva (un color o una talla que se suma a una prenda que ya existía) ----------

create or replace function retail.fn_historial_variante_nueva() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    if retail.fn_historial_nace_ahora(new.producto_id) then return null; end if;
    insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('variante', new.id, 'variante_nueva', null,
            jsonb_build_object('color', new.color_codigo,
                               'talla', (select t.valor from retail.tallas t where t.id = new.talla_id),
                               'precio', new.precio)::text,
            retail.fn_historial_actor());
  exception when others then
    raise warning 'historial: no se anotó la variante nueva % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;
revoke all on function retail.fn_historial_variante_nueva() from public, anon, authenticated;

create or replace trigger variantes_nueva_historial
  after insert on retail.variantes
  for each row execute function retail.fn_historial_variante_nueva();

-- ---------- 5. Fotos ----------

create or replace function retail.fn_historial_foto() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_producto uuid := case when tg_op = 'INSERT' then new.producto_id else old.producto_id end;
begin
  begin
    -- Foto de una prenda que se está borrando o que nace ahora: no es un cambio.
    if not exists (select 1 from retail.productos p where p.id = v_producto) or retail.fn_historial_nace_ahora(v_producto) then
      return null;
    end if;
    if tg_op = 'INSERT' then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', v_producto, 'foto', null, new.url, retail.fn_historial_actor());
    else
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', v_producto, 'foto', old.url, null, retail.fn_historial_actor());
    end if;
  exception when others then
    raise warning 'historial: no se anotó la foto de la prenda % (%)', v_producto, sqlerrm;
  end;
  return null;
end;
$fn$;
revoke all on function retail.fn_historial_foto() from public, anon, authenticated;

create or replace trigger producto_fotos_historial
  after insert or delete on retail.producto_fotos
  for each row execute function retail.fn_historial_foto();

-- ---------- 6. Tejido y patrón ----------

create or replace function retail.fn_historial_tejido_patron() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid := retail.fn_historial_actor();
begin
  begin
    if new.tejido_id is distinct from old.tejido_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'tejido_id', old.tejido_id::text, new.tejido_id::text, v_actor);
    end if;
    if new.patron_id is distinct from old.patron_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'patron_id', old.patron_id::text, new.patron_id::text, v_actor);
    end if;
  exception when others then
    raise warning 'historial: no se anotó el tejido o patrón de % (%)', new.id, sqlerrm;
  end;
  return new;
end;
$fn$;
revoke all on function retail.fn_historial_tejido_patron() from public, anon, authenticated;

create or replace trigger productos_tejido_patron_historial
  after update of tejido_id, patron_id on retail.productos
  for each row
  when (old.tejido_id is distinct from new.tejido_id or old.patron_id is distinct from new.patron_id)
  execute function retail.fn_historial_tejido_patron();

-- ---------- 7. Parches anclados (la función viva, no la del archivo) ----------

create or replace function pg_temp.reemplazar_historial(p_nombre text, p_viejo text, p_nuevo text)
returns void language plpgsql as $$
declare
  v_oids oid[];
  v_def text;
  v_veces int;
begin
  select array_agg(p.oid) into v_oids from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = p_nombre;
  if coalesce(cardinality(v_oids), 0) <> 1 then
    raise exception 'ADR-0354: se esperaba una sola función retail.% y hay %', p_nombre, coalesce(cardinality(v_oids), 0);
  end if;
  v_def := pg_get_functiondef(v_oids[1]);
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicado
  end if;
  v_veces := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_veces <> 1 then
    raise exception 'ADR-0354: retail.% trae % veces el ancla «%» (se esperaba 1): la base no es la que se revisó, no se toca nada',
      p_nombre, v_veces, left(p_viejo, 60);
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$$;

-- El llamado va dentro de un `do` (ADR-0288: el SQL Editor no mira dentro de un cuerpo $$, y el ancla trae un «select … into»
-- implícito que no debe confundir con un SELECT INTO).
do $do$
begin
  -- Poner solo lo que entra y quitar solo lo que sale: el ledger anota cambios, no un «borrar todo y volver a poner».
  perform pg_temp.reemplazar_historial(
    'actualizar_variantes_etiquetas',
    $v$    delete from retail.variante_etiquetas where variante_id = v_variante_id;
    if v_etiqueta_ids is not null and array_length(v_etiqueta_ids, 1) > 0 then
      insert into retail.variante_etiquetas (variante_id, etiqueta_id)
        select distinct v_variante_id, e from unnest(v_etiqueta_ids) as e;
    end if;$v$,
    $n$    -- ADR-0354: solo sale lo que ya no está y solo entra lo nuevo (antes se borraba todo y se volvía a poner).
    delete from retail.variante_etiquetas
     where variante_id = v_variante_id and not (etiqueta_id = any (coalesce(v_etiqueta_ids, '{}'::uuid[])));
    if v_etiqueta_ids is not null and array_length(v_etiqueta_ids, 1) > 0 then
      insert into retail.variante_etiquetas (variante_id, etiqueta_id)
        select distinct v_variante_id, e from unnest(v_etiqueta_ids) as e
        on conflict (variante_id, etiqueta_id) do nothing;
    end if;$n$);
end;
$do$;

-- La fila 'agregada' de `agregar_foto_producto` sobra si el disparador ya anotó esa foto en el mismo guardado (con la URL).
create or replace function retail.fn_historial_foto_sin_duplicar() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  if exists (select 1 from retail.historial_producto_cambios h
              where h.entidad = new.entidad and h.entidad_id = new.entidad_id and h.campo = 'foto'
                and h.created_at = now() and h.valor_nuevo is not null and h.valor_nuevo <> 'agregada') then
    return null;
  end if;
  return new;
end;
$fn$;
revoke all on function retail.fn_historial_foto_sin_duplicar() from public, anon, authenticated;

create or replace trigger historial_foto_sin_duplicar
  before insert on retail.historial_producto_cambios
  for each row when (new.campo = 'foto' and new.valor_nuevo = 'agregada')
  execute function retail.fn_historial_foto_sin_duplicar();

-- ---------- 8. Actividad dice bien los campos nuevos ----------

create or replace function retail.fn_actividad_etiqueta_campo(p_campo text) returns text
language sql immutable as $$
  select case p_campo
    when 'referencia' then 'nombre' when 'precio' then 'precio' when 'categoria_id' then 'categoría' when 'temporada' then 'temporada'
    when 'marca_id' then 'marca' when 'proveedor_id' then 'proveedor' when 'estado' then 'estado' when 'color' then 'color'
    when 'talla' then 'talla' when 'activo' then 'variantes activas' when 'codigo' then 'código'
    when 'costo' then 'costo' when 'costo_declarado' then 'costo' when 'descripcion' then 'descripción' when 'foto' then 'fotos'
    -- ADR-0354
    when 'etiqueta' then 'etiquetas' when 'variante_nueva' then 'variantes nuevas' when 'tejido_id' then 'tejido' when 'patron_id' then 'patrón'
    else replace(p_campo, '_', ' ') end;
$$;

create or replace function retail.fn_actividad_valor_producto(p_campo text, p_valor text) returns text
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
begin
  if p_valor is null or btrim(p_valor) = '' then
    return case p_campo when 'marca_id' then 'sin marca' when 'proveedor_id' then 'sin proveedor'
                        when 'categoria_id' then 'sin categoría' when 'temporada' then 'sin temporada'
                        when 'etiqueta' then 'sin ella' when 'tejido_id' then 'sin tejido' when 'patron_id' then 'sin patrón' else '—' end;
  end if;
  return case p_campo
    when 'categoria_id' then coalesce((select k.nombre from retail.categorias k where k.id::text = p_valor), p_valor)
    when 'marca_id' then coalesce((select m.nombre from retail.marcas m where m.id::text = p_valor), p_valor)
    when 'proveedor_id' then coalesce((select v.nombre from retail.proveedores v where v.id::text = p_valor), p_valor)
    when 'temporada' then coalesce((select t.nombre from retail.temporadas t where t.clave = p_valor), p_valor)
    when 'color' then coalesce((select c.nombre from retail.colores c where c.codigo = p_valor), p_valor)
    when 'precio' then retail.fn_actividad_soles(p_valor::numeric)
    when 'estado' then case p_valor when 'descontinuado' then 'descontinuado' else p_valor end
    -- ADR-0354
    when 'etiqueta' then '«' || coalesce((select e.nombre from retail.etiquetas e where e.id::text = p_valor), 'una etiqueta') || '»'
    when 'tejido_id' then coalesce((select x.nombre from retail.tejidos x where x.id::text = p_valor), 'otro tejido')
    when 'patron_id' then coalesce((select x.nombre from retail.patrones x where x.id::text = p_valor), 'otro patrón')
    when 'variante_nueva' then coalesce((select c.nombre from retail.colores c where c.codigo = (p_valor::jsonb ->> 'color')), 'sin color')
                               || coalesce(' · ' || (p_valor::jsonb ->> 'talla'), '')
    else p_valor
  end;
exception when others then
  return p_valor;
end;
$fn$;
revoke all on function retail.fn_actividad_valor_producto(text, text) from public, anon, authenticated;

-- ---------- 9. Lectura del historial de una prenda ----------

-- El nombre de lo que guarda una fila (`categoria_id` → «Vestidos», `etiqueta` → «Oferta»…). Nunca un uuid: si ya no
-- existe, vacío y la pantalla dice «una … que ya no está».
create or replace function retail.fn_historial_nombre(p_campo text, p_valor text) returns text
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
begin
  if p_valor is null or btrim(p_valor) = '' then return null; end if;
  return case
    when p_campo = 'categoria_id' then (select k.nombre from retail.categorias k where k.id::text = p_valor)
    when p_campo = 'marca_id' then (select m.nombre from retail.marcas m where m.id::text = p_valor)
    when p_campo = 'proveedor_id' then (select x.nombre from retail.proveedores x where x.id::text = p_valor)
    when p_campo = 'temporada' or p_campo like 'temporada:%' then (select t.nombre from retail.temporadas t where t.clave = p_valor)
    when p_campo in ('color', 'color_codigo') then (select c.nombre from retail.colores c where c.codigo = p_valor)
    when p_campo = 'talla_id' then (select t.valor from retail.tallas t where t.id::text = p_valor)
    when p_campo = 'etiqueta' then (select e.nombre from retail.etiquetas e where e.id::text = p_valor)
    when p_campo = 'tejido_id' then (select x.nombre from retail.tejidos x where x.id::text = p_valor)
    when p_campo = 'patron_id' then (select x.nombre from retail.patrones x where x.id::text = p_valor)
    when p_campo = 'variante_nueva' then (select c.nombre from retail.colores c where c.codigo = (p_valor::jsonb ->> 'color'))
    else null
  end;
exception when others then
  return null;
end;
$fn$;
revoke all on function retail.fn_historial_nombre(text, text) from public, anon, authenticated;

-- El color de la prenda (dato, ADR-0336) cuando la fila habla de un color.
create or replace function retail.fn_historial_hex(p_campo text, p_valor text) returns text
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
begin
  if p_valor is null or btrim(p_valor) = '' then return null; end if;
  return case
    when p_campo in ('color', 'color_codigo') then (select c.hex from retail.colores c where c.codigo = p_valor)
    when p_campo = 'variante_nueva' then (select c.hex from retail.colores c where c.codigo = (p_valor::jsonb ->> 'color'))
    else null
  end;
exception when others then
  return null;
end;
$fn$;
revoke all on function retail.fn_historial_hex(text, text) from public, anon, authenticated;

-- Se borra antes de crearla: cambiar las columnas que devuelve no se puede con `create or replace` (drop function no toma
-- los candados de auth/storage, ADR-0195).
drop function if exists retail.fn_historial_prenda(uuid);
create function retail.fn_historial_prenda(p_producto_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  entidad text,
  campo text,
  valor_anterior text,
  valor_nuevo text,
  nombre_anterior text,
  nombre_nuevo text,
  hex_anterior text,
  hex_nuevo text,
  variante_id uuid,
  variante_color text,
  variante_hex text,
  variante_talla text,
  usuario_id uuid,
  usuario_nombre text,
  usuario_rol text,
  usuario_sede text,
  sede text,
  -- La excepción de temporada de UN color (`temporada:NEG`): el nombre y el color de ese color.
  campo_color text,
  campo_hex text
)
language sql stable security definer set search_path = retail, public, extensions as $$
  with filas as (
    select h.*, v.id as v_id, v.color_codigo as v_color, v.talla_id as v_talla
      from retail.historial_producto_cambios h
      left join retail.variantes v on h.entidad = 'variante' and v.id = h.entidad_id
     where ((h.entidad = 'producto' and h.entidad_id = p_producto_id) or (h.entidad = 'variante' and v.producto_id = p_producto_id))
       and h.campo <> 'eliminado'
       -- El costo, solo a quien ve el dinero de compras (20260923193700).
       and (h.campo not in ('costo', 'costo_declarado') or retail.fn_puede_ver_dinero_de_compras())
  ),
  quien as (
    select per.id,
           nullif(btrim(coalesce(per.nombres, '') || ' ' || coalesce(per.apellidos, '')), '') as nombre,
           coalesce(r.nombre, case when c.rol = 'lider' then 'Líder' else 'Integrante' end) as rol,
           u.nombre as sede
      from public.personas per
      left join retail.colaboradores c on c.persona_id = per.id
      left join retail.roles r on r.id = c.rol_id
      left join retail.ubicaciones u on u.id = c.ubicacion_asignada_id
  ),
  nacio as (
    select p.id as producto_id, p.created_at as cuando, o.persona_id, o.ubicacion_id
      from retail.productos p
      left join retail.producto_origen o on o.producto_id = p.id
     where p.id = p_producto_id
  )
  select f.id, f.created_at, f.entidad, f.campo, f.valor_anterior, f.valor_nuevo,
         retail.fn_historial_nombre(f.campo, f.valor_anterior), retail.fn_historial_nombre(f.campo, f.valor_nuevo),
         retail.fn_historial_hex(f.campo, f.valor_anterior), retail.fn_historial_hex(f.campo, f.valor_nuevo),
         f.v_id, co.nombre, co.hex, ta.valor,
         f.usuario_id, q.nombre, q.rol, q.sede, ub.nombre, cc.nombre, cc.hex
    from filas f
    left join retail.colores co on co.codigo = f.v_color
    left join retail.tallas ta on ta.id = f.v_talla
    left join quien q on q.id = f.usuario_id
    left join retail.ubicaciones ub on ub.id = f.ubicacion_id
    left join retail.colores cc on f.campo like 'temporada:%' and cc.codigo = substr(f.campo, 11)
  union all
  -- El nacimiento: quién, cuándo y dónde (`producto_origen`, ADR-0283), con lo que traía (las variantes nacidas con ella y su
  -- precio de entonces: el primer «antes» del ledger o, si nunca cambió, el de hoy).
  select n.producto_id, n.cuando, 'producto', 'alta', null,
         jsonb_build_object(
           'nombre', coalesce((select h.valor_anterior from retail.historial_producto_cambios h
                                where h.entidad = 'producto' and h.entidad_id = n.producto_id and h.campo = 'referencia'
                                order by h.created_at, h.id limit 1),
                              (select p.referencia from retail.productos p where p.id = n.producto_id)),
           'categoria', (select k.nombre from retail.productos p join retail.categorias k on k.id = p.categoria_id where p.id = n.producto_id),
           -- Para dibujarla sin foto como siempre (ADR-0333): el ícono sale del prefijo, el tono de la familia.
           'prefijo', (select k.prefijo from retail.productos p join retail.categorias k on k.id = p.categoria_id where p.id = n.producto_id),
           'familia', (select k.familia from retail.productos p join retail.categorias k on k.id = p.categoria_id where p.id = n.producto_id),
           'colores', coalesce((select jsonb_agg(distinct jsonb_build_object('nombre', c.nombre, 'hex', c.hex))
                                  from retail.variantes v join retail.colores c on c.codigo = v.color_codigo
                                 where v.producto_id = n.producto_id and v.created_at = n.cuando), '[]'::jsonb),
           'tallas', coalesce((select jsonb_agg(distinct t.valor)
                                 from retail.variantes v join retail.tallas t on t.id = v.talla_id
                                where v.producto_id = n.producto_id and v.created_at = n.cuando), '[]'::jsonb),
           'variantes', (select count(*) from retail.variantes v where v.producto_id = n.producto_id and v.created_at = n.cuando),
           'precio', (select min(coalesce((select h.valor_anterior::numeric from retail.historial_producto_cambios h
                                           where h.entidad = 'variante' and h.entidad_id = v.id and h.campo = 'precio'
                                           order by h.created_at, h.id limit 1), v.precio))
                        from retail.variantes v where v.producto_id = n.producto_id and v.created_at = n.cuando)
         )::text,
         null, null, null, null,
         null, null, null, null,
         n.persona_id, q.nombre, q.rol, q.sede, ub.nombre, null, null
    from nacio n
    left join quien q on q.id = n.persona_id
    left join retail.ubicaciones ub on ub.id = n.ubicacion_id;
$$;
revoke all on function retail.fn_historial_prenda(uuid) from public, anon;
grant execute on function retail.fn_historial_prenda(uuid) to authenticated;

comment on function retail.fn_historial_prenda(uuid) is
  'ADR-0354: el historial de una prenda (sus cambios de ficha, variantes, etiquetas y fotos; nunca ventas ni stock), con nombres, color, quién y dónde ya resueltos, más su nacimiento. El costo solo a quien ve el dinero de compras.';
