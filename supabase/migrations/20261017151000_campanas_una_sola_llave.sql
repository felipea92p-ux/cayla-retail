-- Tienda web ▸ Campañas (ADR-0436, actividad 2): la campaña se configura desde Campañas, con UNA llave.
--
-- EL PROBLEMA. Hasta hoy una campaña (Día del Gato, Navidad) se configuraba en Catálogo ▸ Atributos ▸ Etiquetas y la llave era el módulo
-- Etiquetas. Felipe decidió (2026-10-17, decisión 3: «todo junto, como hoy») que quien ve Campañas la diseña Y le pone el descuento, y
-- que la configuración se muda a Campañas. Las etiquetas que no son campaña (Para liquidar, Estreno) se quedan en Atributos, con
-- Etiquetas.
--
-- LO QUE HACE.
-- 1. LA pregunta de siempre, `fn_puede_tocar_etiqueta(id)` —la que ya hacían `actualizar_campana_etiqueta` y `etiquetar_variantes` por
--    cada etiqueta—, ahora mira de qué etiqueta se trata: una campaña pide Campañas (`fn_puede_campanas`); cualquier otra, Etiquetas.
--    Un solo lugar decide la llave, y lo que ya la preguntaba se entera solo.
-- 2. Al crear una etiqueta, la aprueba sola quien tiene la llave de ESA etiqueta (una campaña, quien tiene Campañas), en el disparador
--    `fn_etiquetas_estado_trigger`. Sin esto, una campaña creada desde Campañas por alguien sin Etiquetas nacería «por aprobar».
-- 3. `etiquetar_variantes` deja entrar a quien tiene Etiquetas O Campañas (cada etiqueta se sigue mirando una por una), y los mensajes
--    dicen el módulo que de verdad hace falta.
-- 4. Las funciones de la pantalla (todas piden Campañas y nada más): `campana_detalle` (lo que lee la campaña por dentro),
--    `crear_campana` (nombre y fechas), `guardar_campana` (nombre, descuento, fechas y categorías, todo o nada: el nombre aquí y lo
--    demás por `actualizar_campana_etiqueta`, el mismo camino de siempre) y `activar_campana` (desactivar o volver a activar).
--
-- CONSECUENCIA QUE SE ACEPTA (ADR-0436, DECIDÍ 1). En producción, el 2026-10-17, «Terminal Almacén» y «Terminal de ventas» tienen
-- Etiquetas y no Campañas: desde esta migración ya no configuran una campaña hasta que el líder les dé Campañas en Roles y accesos.
--
-- Las funciones que se parchan venían iguales en producción y en el repo el 2026-10-17 (md5 del cuerpo: fn_puede_tocar_etiqueta
-- 780ff9ef…, fn_etiquetas_estado_trigger 533f30d2…, etiquetar_variantes ee7e23e3…, actualizar_campana_etiqueta 6c1c1e9f…). Los
-- reemplazos son anclados: si una cambió, la migración no aplica nada y dice cuál. Idempotente y sin políticas: se pega de una vez.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejos text[], p_nuevos text[])
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
  v_cambio boolean := false;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  for i in 1 .. cardinality(p_viejos) loop
    -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
    continue when position(p_nuevos[i] in v_def) > 0;
    v_n := (length(v_def) - length(replace(v_def, p_viejos[i], ''))) / length(p_viejos[i]);
    if v_n <> 1 then
      raise exception '% cambió desde que se escribió esta migración: el ancla % aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
        p_firma, i, v_n;
    end if;
    v_def := replace(v_def, p_viejos[i], p_nuevos[i]);
    v_cambio := true;
  end loop;
  if v_cambio then
    execute v_def;
  end if;
end;
$f$;

-- 1. LA llave de cada etiqueta -------------------------------------------------------------------------------------------------

do $$
declare
  v_cuerpo text := (select prosrc from pg_proc where oid = 'retail.fn_puede_tocar_etiqueta(uuid,numeric)'::regprocedure);
begin
  if position('fn_puede_campanas' in v_cuerpo) = 0 and md5(v_cuerpo) <> '780ff9ef81265d1b9086f7f29670c4c3' then
    raise exception 'fn_puede_tocar_etiqueta cambió desde el 2026-10-17 (md5 %): regenera esta migración desde su definición real.', md5(v_cuerpo);
  end if;
end;
$$;

create or replace function retail.fn_puede_tocar_etiqueta(p_etiqueta_id uuid, p_descuento_nuevo numeric default null)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Una campaña es de Campañas (ADR-0436); cualquier otra etiqueta, de Etiquetas (ADR-0293). El descuento no cambia la llave.
  select case
    when exists (select 1 from retail.etiquetas e where e.id = p_etiqueta_id and e.estilo = 'campana') then retail.fn_puede_campanas()
    else retail.fn_puede_editar_etiquetas()
  end;
$$;

comment on function retail.fn_puede_tocar_etiqueta(uuid, numeric) is
  'Quién configura una etiqueta (descuento, fechas, categorías, prendas): una campaña, quien tiene Campañas (ADR-0436); cualquier otra, quien tiene Etiquetas (ADR-0293). La preguntan actualizar_campana_etiqueta y etiquetar_variantes.';

-- 2. Al crear: la aprueba quien tiene la llave de esa etiqueta ---------------------------------------------------------------------

select pg_temp.reemplazar_anclado(
  'retail.fn_etiquetas_estado_trigger()',
  array[$a$    if retail.fn_puede_editar_etiquetas() then
      new.estado := 'aprobado';$a$],
  array[$n$    -- Nace aprobada si quien la crea tiene la llave de ESA etiqueta: una campaña, Campañas (ADR-0436); otra, Etiquetas.
    if (case when new.estilo = 'campana' then retail.fn_puede_campanas() else retail.fn_puede_editar_etiquetas() end) then
      new.estado := 'aprobado';$n$]
);

-- 3. Etiquetar prendas y configurar: entra quien tiene una de las dos llaves; cada etiqueta se mira con la suya --------------------

select pg_temp.reemplazar_anclado(
  'retail.etiquetar_variantes(jsonb)',
  array[
    $a$  if not retail.fn_puede_editar_etiquetas() then
    raise exception 'Etiquetar prendas necesita el módulo Etiquetas en tu rol.' using errcode = '42501';$a$,
    $a$    if not retail.fn_puede_tocar_etiqueta(v_etiqueta_id) then
      raise exception 'Etiquetar prendas necesita el módulo Etiquetas en tu rol.' using errcode = '42501';$a$
  ],
  array[
    $n$  -- Entra quien tiene Etiquetas o Campañas (ADR-0436); abajo, cada etiqueta se mira con su propia llave.
  if not (retail.fn_puede_editar_etiquetas() or retail.fn_puede_campanas()) then
    raise exception 'Poner o quitar prendas necesita el módulo Etiquetas o Campañas en tu rol.' using errcode = '42501';$n$,
    $n$    if not retail.fn_puede_tocar_etiqueta(v_etiqueta_id) then
      raise exception 'Las prendas de una campaña se eligen con el módulo Campañas; las de otra etiqueta, con el módulo Etiquetas.' using errcode = '42501';$n$
  ]
);

select pg_temp.reemplazar_anclado(
  'retail.actualizar_campana_etiqueta(uuid,numeric,date,date,uuid[])',
  array[$a$    raise exception 'Configurar una campaña necesita el módulo Etiquetas en tu rol.' using errcode = '42501';$a$],
  array[$n$    raise exception 'Una campaña se configura con el módulo Campañas; otra etiqueta con descuento, con el módulo Etiquetas.' using errcode = '42501';$n$]
);

-- 4. Las funciones de la pantalla ----------------------------------------------------------------------------------------------

-- El nombre de una campaña: sin espacios de más, de 1 a 60 letras y sin repetir otra etiqueta (sin importar tildes ni mayúsculas).
create or replace function retail.fn_campana_nombre_valido(p_nombre text, p_sin_contar uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
begin
  if v_nombre = '' then
    raise exception 'Escribe el nombre de la campaña.' using errcode = 'P0001', hint = 'campana_nombre';
  end if;
  if length(v_nombre) > 60 then
    raise exception 'El nombre es muy largo: hasta 60 letras.' using errcode = 'P0001', hint = 'campana_nombre';
  end if;
  if exists (
    select 1 from retail.etiquetas e
    where retail.fn_clave_texto(e.nombre) = retail.fn_clave_texto(v_nombre) and e.id is distinct from p_sin_contar
  ) then
    raise exception 'Ya hay una campaña o etiqueta «%».', v_nombre using errcode = 'P0001', hint = 'campana_existe';
  end if;
  return v_nombre;
end;
$$;

revoke all on function retail.fn_campana_nombre_valido(text, uuid) from public, anon, authenticated;

create or replace function retail.campana_detalle(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v jsonb;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Ver las campañas necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  select jsonb_build_object(
      'id', e.id,
      'nombre', e.nombre,
      'activo', e.activo,
      'estado', e.estado,
      'desde', e.vigente_desde,
      'hasta', e.vigente_hasta,
      'pct', e.descuento_pct,
      'categoria_ids', coalesce((select jsonb_agg(ec.categoria_id order by ec.categoria_id) from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id), '[]'::jsonb),
      'variante_ids', coalesce((select jsonb_agg(ve.variante_id order by ve.variante_id) from retail.variante_etiquetas ve where ve.etiqueta_id = e.id), '[]'::jsonb),
      -- Las prendas que lleva a mano, por modelo: lo que dibuja la pestaña Prendas (la miniatura sale del color y la categoría).
      'prendas', coalesce((
        select jsonb_agg(x.prenda order by x.nombre)
        from (
          select p.referencia as nombre,
                 jsonb_build_object(
                   'producto_id', p.id,
                   'nombre', p.referencia,
                   'codigo', p.codigo,
                   'categoria', c.nombre,
                   'prefijo', c.prefijo,
                   'familia', c.familia,
                   'foto', (select f.url from retail.producto_fotos f where f.producto_id = p.id order by f.es_principal desc, f.orden, f.created_at limit 1),
                   'variantes', count(*),
                   'colores', jsonb_agg(distinct jsonb_build_object('nombre', co.nombre, 'hex', co.hex)) filter (where co.codigo is not null)
                 ) as prenda
          from retail.variante_etiquetas ve
          join retail.variantes v on v.id = ve.variante_id
          join retail.productos p on p.id = v.producto_id
          left join retail.categorias c on c.id = p.categoria_id
          left join retail.colores co on co.codigo = v.color_codigo
          where ve.etiqueta_id = e.id
          group by p.id, p.referencia, p.codigo, c.nombre, c.prefijo, c.familia
        ) x
      ), '[]'::jsonb)
    )
  into v
  from retail.etiquetas e
  where e.id = p_id and e.estilo = 'campana' and e.estado <> 'rechazado';
  if v is null then
    raise exception 'Esa campaña ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'campana_no_existe';
  end if;
  return v;
end;
$$;

comment on function retail.campana_detalle(uuid) is
  'Tienda web ▸ Campañas (ADR-0436): una campaña por dentro: {id, nombre, activo, estado, desde, hasta, pct, categoria_ids, variante_ids, prendas: [{producto_id, nombre, codigo, categoria, prefijo, familia, foto, variantes, colores}]}. Pide fn_puede_campanas().';

revoke all on function retail.campana_detalle(uuid) from public, anon;
grant execute on function retail.campana_detalle(uuid) to authenticated, service_role;

-- Una campaña nueva: la etiqueta de estilo campaña, aprobada (quien la crea tiene la llave) y, si se dieron, con sus fechas. Sin
-- descuento ni prendas: eso se pone después, en su pestaña Datos.
create or replace function retail.crear_campana(p_nombre text, p_desde date default null, p_hasta date default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text;
  v_id uuid;
  v_estado text;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Crear una campaña necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  v_nombre := retail.fn_campana_nombre_valido(p_nombre);
  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then
    raise exception 'La campaña no puede terminar antes de empezar.' using errcode = 'P0001', hint = 'campana_fechas';
  end if;
  begin
    -- El disparador `etiquetas_estado_biut` firma quién la propuso (el responsable del combo) y la aprueba.
    insert into retail.etiquetas (nombre, estilo) values (v_nombre, 'campana') returning id, estado into v_id, v_estado;
  exception when unique_violation then
    raise exception 'Ya hay una campaña o etiqueta «%».', v_nombre using errcode = 'P0001', hint = 'campana_existe';
  end;
  if v_estado <> 'aprobado' then
    raise exception 'La campaña quedaría por aprobar: créala desde una cuenta con el módulo «Campañas».' using errcode = '42501';
  end if;
  if p_desde is not null or p_hasta is not null then
    perform retail.actualizar_campana_etiqueta(v_id, null, p_desde, p_hasta, '{}'::uuid[]);
  end if;
  return v_id;
end;
$$;

comment on function retail.crear_campana(text, date, date) is
  'Tienda web ▸ Campañas (ADR-0436): crea una campaña (etiqueta de estilo campaña, aprobada) con su nombre y, si se dan, sus fechas. Devuelve su id. Pide fn_puede_campanas().';

revoke all on function retail.crear_campana(text, date, date) from public, anon;
grant execute on function retail.crear_campana(text, date, date) to authenticated, service_role;

-- Guardar lo de la pestaña Datos, todo o nada: el nombre aquí; descuento, fechas y categorías por el camino de siempre
-- (`actualizar_campana_etiqueta`, con sus reglas: aprobada para tener descuento, de 0 a 100 %, fechas en orden). La fila se toma
-- primero: dos personas guardando la misma campaña a la vez se turnan, nadie pisa a medias lo del otro.
create or replace function retail.guardar_campana(
  p_id uuid,
  p_nombre text,
  p_descuento_pct numeric,
  p_desde date,
  p_hasta date,
  p_categoria_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text;
  v_actual text;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Configurar una campaña necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  select e.nombre into v_actual from retail.etiquetas e where e.id = p_id and e.estilo = 'campana' and e.estado <> 'rechazado' for update;
  if not found then
    raise exception 'Esa campaña ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'campana_no_existe';
  end if;
  v_nombre := retail.fn_campana_nombre_valido(p_nombre, p_id);
  if v_nombre is distinct from v_actual then
    update retail.etiquetas set nombre = v_nombre where id = p_id;
  end if;
  perform retail.actualizar_campana_etiqueta(p_id, p_descuento_pct, p_desde, p_hasta, coalesce(p_categoria_ids, '{}'::uuid[]));
end;
$$;

comment on function retail.guardar_campana(uuid, text, numeric, date, date, uuid[]) is
  'Tienda web ▸ Campañas (ADR-0436): guarda el nombre, el descuento, las fechas y las categorías de una campaña, todo o nada (lo demás por actualizar_campana_etiqueta). Pide fn_puede_campanas().';

revoke all on function retail.guardar_campana(uuid, text, numeric, date, date, uuid[]) from public, anon;
grant execute on function retail.guardar_campana(uuid, text, numeric, date, date, uuid[]) to authenticated, service_role;

-- Desactivar o volver a activar. La misma regla que Atributos: no se desactiva mientras alguna prenda la lleve a mano (sus prendas
-- seguirían con una etiqueta que nadie ve); se le quitan primero.
create or replace function retail.activar_campana(p_id uuid, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_prendas integer;
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Configurar una campaña necesita el módulo «Campañas» en tu rol.' using errcode = '42501';
  end if;
  perform 1 from retail.etiquetas e where e.id = p_id and e.estilo = 'campana' and e.estado = 'aprobado' for update;
  if not found then
    raise exception 'Esa campaña ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'campana_no_existe';
  end if;
  if p_activo is null then
    raise exception 'Falta decir si se activa o se desactiva.' using errcode = 'P0001';
  end if;
  if not p_activo then
    select count(*) into v_prendas from retail.variante_etiquetas where etiqueta_id = p_id;
    if v_prendas > 0 then
      raise exception 'No se puede desactivar: % % todavía la %. Quítaselas primero en Prendas.',
        v_prendas, case when v_prendas = 1 then 'prenda' else 'prendas' end, case when v_prendas = 1 then 'lleva' else 'llevan' end
        using errcode = 'P0001', hint = 'campana_con_prendas';
    end if;
  end if;
  update retail.etiquetas set activo = p_activo where id = p_id and activo is distinct from p_activo;
end;
$$;

comment on function retail.activar_campana(uuid, boolean) is
  'Tienda web ▸ Campañas (ADR-0436): desactiva una campaña (si ninguna prenda la lleva a mano) o la vuelve a activar. Pide fn_puede_campanas().';

revoke all on function retail.activar_campana(uuid, boolean) from public, anon;
grant execute on function retail.activar_campana(uuid, boolean) to authenticated, service_role;

-- 5. Comprobación: los tres reemplazos quedaron -------------------------------------------------------------------------------

do $$
begin
  if position('fn_puede_campanas' in pg_get_functiondef('retail.fn_etiquetas_estado_trigger()'::regprocedure)) = 0
     or position('fn_puede_campanas' in pg_get_functiondef('retail.etiquetar_variantes(jsonb)'::regprocedure)) = 0
     or position('se configura con el módulo Campañas' in pg_get_functiondef('retail.actualizar_campana_etiqueta(uuid,numeric,date,date,uuid[])'::regprocedure)) = 0
     or position('fn_puede_campanas' in pg_get_functiondef('retail.fn_puede_tocar_etiqueta(uuid,numeric)'::regprocedure)) = 0 then
    raise exception 'La llave única de las campañas no quedó completa: no se aplica nada.';
  end if;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
