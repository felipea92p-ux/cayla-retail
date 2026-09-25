-- ============================================================================
-- 20260924160000_edicion_simultanea_con_version.sql — CAYLA V2 · ADR-0193 (varios usuarios a la vez, etapa 5)
--
-- EL PROBLEMA PRIMERO. Dos personas abren la misma prenda en Productos ▸ Editar. La primera sube el precio de la M de
-- S/ 59 a S/ 69 y guarda. La segunda, que abrió la ficha antes, corrige la descripción y guarda: su formulario manda
-- TODAS las variantes con los precios que vio al abrir (S/ 59), y `catalogo_actualizar_producto` los escribe. El precio
-- vuelve a S/ 59 sin que nadie lo decida ni se entere — gana el último en guardar. Lo mismo en Colaboradores ▸ Roles y
-- accesos: `guardar_modulos_rol` reemplaza el conjunto COMPLETO de módulos del rol, así que dos líderes retocando el
-- mismo rol se borran los cambios entre sí.
--
-- QUÉ HACE (control optimista de versión: nadie bloquea a nadie mientras edita; se comprueba al guardar)
--   1. `productos.version` y `roles.version` (integer, empieza en 1). Un disparador `before update` la sube en CADA
--      escritura de la fila, venga de donde venga (la RPC, «Descontinuar» en bloque de /productos, el censo, el
--      archivo de datos de prueba, renombrar/archivar un rol): la versión no depende de que cada camino se acuerde.
--      El valor que mande quien escribe se ignora (siempre `old.version + 1`).
--   2. Los módulos de un rol viven en otra tabla (`rol_modulos`): un disparador ahí sube la versión del rol dueño en
--      cada alta, baja o cambio de fila.
--   3. Las variantes NO llevan versión propia: se editan solo desde la ficha del producto, y esa RPC siempre escribe
--      la fila del producto (sube su versión). Ver el ADR para el caso del costo que recalcula una recepción.
--   4. `catalogo_actualizar_producto` y `guardar_modulos_rol` reciben `p_version_esperada integer default null`.
--      Si viene y no coincide con la versión actual, rechazan con SQLSTATE `PT409` (PostgREST lo devuelve como HTTP
--      409 Conflict y la web lo distingue por el código) y un mensaje en español. Sin ella se comportan como hasta
--      hoy: la web publicada antes de esta migración sigue funcionando igual.
--      Ahora DEVUELVEN la versión nueva (antes `void`): la pantalla la usa para un segundo guardado sin recargar
--      (reintentar las etiquetas de la ficha, varios clics seguidos en la matriz de roles). La web vieja ignora el dato.
--
-- LA CARRERA. Comprobar «¿sigue en la versión 5?» con un select suelto no basta: dos guardados a la vez leerían los
-- dos un 5. Por eso el producto se relee con `for update` filtrando por la versión (el segundo espera al primero y, al
-- despertar, Postgres vuelve a evaluar el filtro con la fila ya cambiada: no la encuentra y rechaza). El rol ya se
-- bloqueaba con `for update` antes de comparar.
--
-- CÓMO. Mismo patrón de anclas que 20260924110000 (ADR-0188): se parte de la definición VIVA de cada base
-- (`pg_get_functiondef`) —el Postgres local y producción tienen cuerpos distintos de `catalogo_actualizar_producto`
-- (producción ya tiene el candado de costo de 20260923193700)— y solo se reemplazan tres anclas por función (la firma,
-- el lugar de la comprobación y el final). Cada ancla tiene que aparecer EXACTAMENTE una vez o la migración aborta sin
-- tocar nada. Como cambia la firma, se crea la función nueva y se BORRA la vieja en la misma transacción (si no,
-- quedarían dos sobrecargas y PostgREST no sabría a cuál llamar), y se reaplican los permisos de la vieja.
-- Re-pegable: si la firma nueva ya existe, no hace nada.
--
-- QUÉ NO HACE. No toca datos (la columna nace en 1 en todas las filas). No cambia ningún mensaje existente.
--
-- ORDEN PARA PRODUCCIÓN: primero ESTA migración, después la web. La web vieja con la base nueva funciona igual (no manda
-- la versión); la web nueva con la base vieja fallaría al leer `version`.
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`, no hace falta el prefijo `retail.`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- 1. Columnas y disparadores de versión
-- ----------------------------------------------------------------------------

alter table productos add column if not exists version integer not null default 1;
alter table roles add column if not exists version integer not null default 1;

comment on column productos.version is
  'ADR-0193: sube en cada escritura de la fila (disparador productos_version_bu). La ficha la lee al abrir y la manda a catalogo_actualizar_producto como p_version_esperada: si otra persona guardó entre medio, se rechaza (PT409) en vez de pisar sus cambios.';
comment on column roles.version is
  'ADR-0193: sube en cada escritura del rol o de sus módulos (roles_version_bu, rol_modulos_version_aiud). Roles y accesos la manda a guardar_modulos_rol como p_version_esperada.';

-- Las columnas nuevas se leen desde la web con la sesión de la persona. Hoy ambas tablas tienen `grant select` de tabla
-- entera (cubre columnas nuevas), pero `variantes` ya pasó a permisos por columna (20260923193700): si alguna de estas
-- dos pasa también, la versión no puede quedar fuera. Redundante hoy, inofensivo siempre.
grant select (version) on table productos to authenticated;
grant select (version) on table roles to authenticated;

create or replace function fn_subir_version()
returns trigger
language plpgsql
set search_path = retail, public
as $$
begin
  -- Siempre la de antes + 1: nadie fija la versión a mano (ni para «adelantarse» ni para esquivar el control).
  new.version := old.version + 1;
  return new;
end;
$$;
comment on function fn_subir_version() is 'ADR-0193: disparador before update de productos y roles — la versión sube en cada escritura.';

drop trigger if exists productos_version_bu on productos;
create trigger productos_version_bu before update on productos
  for each row execute function fn_subir_version();

drop trigger if exists roles_version_bu on roles;
create trigger roles_version_bu before update on roles
  for each row execute function fn_subir_version();

-- Los módulos del rol: cualquier alta/baja/cambio en rol_modulos sube la versión del rol. SECURITY DEFINER porque quien
-- escribe en rol_modulos (hoy solo funciones SECURITY DEFINER) no tiene por qué poder actualizar `roles` directamente.
-- Sin riesgo de bloqueo cruzado nuevo: `guardar_modulos_rol` ya tiene bloqueada la fila del rol cuando escribe aquí.
create or replace function fn_subir_version_rol_por_modulos()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update retail.roles set version = version + 1 where id = new.rol_id;
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.rol_id is distinct from old.rol_id) then
    update retail.roles set version = version + 1 where id = old.rol_id;
  end if;
  return null;
end;
$$;
revoke all on function fn_subir_version_rol_por_modulos() from public, anon, authenticated;
comment on function fn_subir_version_rol_por_modulos() is 'ADR-0193: cambiar los módulos de un rol es cambiar el rol — sube roles.version.';

drop trigger if exists rol_modulos_version_aiud on rol_modulos;
create trigger rol_modulos_version_aiud after insert or update or delete on rol_modulos
  for each row execute function fn_subir_version_rol_por_modulos();

-- ----------------------------------------------------------------------------
-- 2. Las dos funciones reciben la versión esperada (parche con anclas sobre la definición viva)
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
  a record;
  v_def text;
  v_veces int;
  v_vieja regprocedure;
begin
  for r in
    select * from (values
      ('catalogo_actualizar_producto',
       'retail.catalogo_actualizar_producto(uuid,text,text,jsonb,uuid,text,integer,text,boolean,jsonb,uuid,uuid,uuid,uuid,boolean)',
       'retail.catalogo_actualizar_producto(uuid,text,text,jsonb,uuid,text,integer,text,boolean,jsonb,uuid,uuid,uuid,uuid,boolean,integer)'),
      ('guardar_modulos_rol',
       'retail.guardar_modulos_rol(uuid,text[])',
       'retail.guardar_modulos_rol(uuid,text[],integer)')
    ) as t(fn, firma_vieja, firma_nueva)
  loop
    if to_regprocedure(r.firma_nueva) is not null then
      if to_regprocedure(r.firma_vieja) is not null then
        raise exception 'ADR-0193: retail.% tiene la firma nueva Y la vieja. Revisar antes de pegar.', r.fn;
      end if;
      raise notice 'ADR-0193: retail.% ya tenía la versión esperada (se volvió a pegar)', r.fn;
      continue;
    end if;
    v_vieja := to_regprocedure(r.firma_vieja);
    if v_vieja is null then
      raise exception 'ADR-0193: no existe % — revisar la definición viva antes de pegar.', r.firma_vieja;
    end if;
    v_def := pg_get_functiondef(v_vieja);

    for a in
      select * from (values
        -- catalogo_actualizar_producto ---------------------------------------------------------------------------
        ('catalogo_actualizar_producto', 1,
         E'p_confirmo_distinto boolean DEFAULT false)\n RETURNS void',
         E'p_confirmo_distinto boolean DEFAULT false, p_version_esperada integer DEFAULT NULL::integer)\n RETURNS integer'),
        ('catalogo_actualizar_producto', 2,
         E'    raise exception ''El producto % no existe.'', p_producto_id;\n  end if;\n',
         E'    raise exception ''El producto % no existe.'', p_producto_id;\n  end if;\n\n'
         '  -- ADR-0193: control optimista de versión. La ficha manda la versión que leyó al abrir; si otra persona guardó\n'
         '  -- entre medio, se rechaza en vez de pisar sus precios. `for update` + filtro por versión cierra la carrera de\n'
         '  -- dos guardados a la vez (el segundo espera, relee la fila ya cambiada y no la encuentra). Si el filtro no\n'
         '  -- encuentra la fila por falta de permiso (RLS) y no por versión, sigue: el update de abajo da su mensaje.\n'
         '  if p_version_esperada is not null then\n'
         '    perform 1 from productos where id = p_producto_id and version = p_version_esperada for update;\n'
         '    if not found and exists (select 1 from productos where id = p_producto_id and version <> p_version_esperada) then\n'
         '      raise exception ''Otra persona cambió esta prenda mientras la editabas. Recarga para ver sus cambios.''\n'
         '        using errcode = ''PT409'', hint = ''version_cambiada'';\n'
         '    end if;\n'
         '  end if;\n'),
        ('catalogo_actualizar_producto', 3,
         E'\nend;\n$function$',
         E'\n\n  -- ADR-0193: la versión nueva (el update de arriba la subió), para un segundo guardado sin recargar.\n'
         '  return (select version from productos where id = p_producto_id);\nend;\n$function$'),
        -- guardar_modulos_rol ------------------------------------------------------------------------------------
        ('guardar_modulos_rol', 1,
         E'(p_rol_id uuid, p_modulos text[])\n RETURNS void',
         E'(p_rol_id uuid, p_modulos text[], p_version_esperada integer DEFAULT NULL::integer)\n RETURNS integer'),
        ('guardar_modulos_rol', 2,
         E'    raise exception ''Ese rol no existe — actualiza la pantalla'';\n  end if;\n',
         E'    raise exception ''Ese rol no existe — actualiza la pantalla'';\n  end if;\n'
         '  -- ADR-0193: la fila ya está bloqueada (`for update` arriba), así que comparar aquí no tiene carrera.\n'
         '  if p_version_esperada is not null and v_rol.version <> p_version_esperada then\n'
         '    raise exception ''Otra persona cambió este rol mientras lo editabas. Recarga para ver sus cambios.''\n'
         '      using errcode = ''PT409'', hint = ''version_cambiada'';\n'
         '  end if;\n'),
        ('guardar_modulos_rol', 3,
         E'\nend;\n$function$',
         E'\n  -- ADR-0193: la versión nueva (la subió el disparador de rol_modulos si hubo cambios).\n'
         '  return (select version from retail.roles where id = p_rol_id);\nend;\n$function$')
      ) as t(fn, n, ancla, nuevo)
      where t.fn = r.fn
      order by t.n
    loop
      v_veces := (length(v_def) - length(replace(v_def, a.ancla, ''))) / length(a.ancla);
      if v_veces <> 1 then
        raise exception 'ADR-0193: retail.% no tiene el ancla % esperada (aparece % veces). Revisar su definición antes de pegar.',
          r.fn, a.n, v_veces;
      end if;
      v_def := replace(v_def, a.ancla, a.nuevo);
    end loop;

    -- Un `return;` suelto en el cuerpo viejo dejaría una salida sin versión: se exige que no haya.
    if v_def ~* '\mreturn\s*;' then
      raise exception 'ADR-0193: retail.% tiene un return; suelto — revisar antes de pegar.', r.fn;
    end if;

    execute v_def;                                   -- crea la firma nueva
    execute format('drop function %s', v_vieja);     -- y borra la vieja: nunca dos sobrecargas
    execute format('revoke all on function %s from public, anon', r.firma_nueva);
    execute format('grant execute on function %s to authenticated', r.firma_nueva);
    raise notice 'ADR-0193: retail.% ahora recibe p_version_esperada', r.fn;
  end loop;
end;
$$;

comment on function catalogo_actualizar_producto(uuid, text, text, jsonb, uuid, text, integer, text, boolean, jsonb, uuid, uuid, uuid, uuid, boolean, integer) is
  'Guarda la ficha de un producto (datos, variantes, fotos). p_version_esperada (ADR-0193): la versión que la ficha leyó al abrir; si no coincide, PT409 «Otra persona cambió esta prenda…». Devuelve la versión nueva.';
comment on function guardar_modulos_rol(uuid, text[], integer) is
  'Reemplaza los módulos de un rol. p_version_esperada (ADR-0193): la versión que la pantalla leyó; si no coincide, PT409 «Otra persona cambió este rol…». Devuelve la versión nueva.';

-- PostgREST: que vea las firmas nuevas sin reiniciar.
notify pgrst, 'reload schema';
