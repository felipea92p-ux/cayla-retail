-- ============================================================================
-- 20261109230000_recibir_crea_proveedor_y_marca.sql — CAYLA V2 · ADR-0635
-- Quien recibe mercadería crea el proveedor o la marca que no está en la lista, sin pedírselo a nadie.
--
-- EL PROBLEMA PRIMERO. En Recibir, los combos de proveedor y de marca eran listas cerradas. Si llegaba un fardo de un proveedor que
-- nunca se registró, o una marca nueva, quien recibía no podía seguir: `registrar_proveedor` pide el módulo Proveedores, `crear_marca`
-- pide el Catálogo, y la tienda que recibe casi nunca tiene ninguno de los dos. Felipe (2026-11-09): «al momento de seleccionar el
-- proveedor se pueda crear uno», «solo pida la razón social y el RUC (opcional)», «sin necesidad de tener los otros módulos».
--
-- QUÉ HACE (dos funciones nuevas y estrechas, por el módulo Recibir mercadería; no toca tablas, políticas ni otras funciones)
--   1. `registrar_proveedor_de_recepcion(nombre, ruc)`: devuelve UN proveedor activo, el que ya estaba (por RUC y después por el
--      nombre, como lo compara la base: `fn_clave_texto`) o uno nuevo con solo su razón social y su RUC si se escribió. No modifica uno
--      que ya existe, no lo reactiva y no escribe banco, rubros ni contacto: eso lo completa después quien administra proveedores.
--   2. `registrar_marca_de_recepcion(nombre, proveedor)`: crea la marca y la une a su proveedor (`marca_proveedores`). Si ya hay una que
--      se escribe igual, no crea otra: le suma el proveedor y devuelve esa. Una desactivada no se reactiva desde aquí.
--   Las dos firman con el responsable (`fn_actor_persona_id(true)`, el «Quién cuenta» de Recibir) y lo anotan en la Actividad.
--
-- DECIDÍ copiar el molde de Mis compras (`registrar_proveedor_de_orden` 20261021202000 y `registrar_marca_de_compra` 20261024214000) en
-- funciones propias de Recibir, con su permiso escrito donde se usa.
-- DESCARTÉ
--   · Abrir `registrar_proveedor_de_orden` / `registrar_marca_de_compra` también a Recibir: son funciones de Mis compras, en producción, y
--     su Actividad dice «desde una orden» / «desde una compra». Tocarlas para sumar otro módulo mezcla dos permisos en una función viva.
--   · Abrir `registrar_proveedor` o `crear_marca`: dejarían escribir banco y CCI, o editar el catálogo, sin esos permisos.
-- SE ROMPE SI: alguien registra «Hilos del Sur» sin RUC y ya existía «Hilos del Sur S.A.C.»: la clave del nombre solo ve nombres iguales
-- (sin tildes ni mayúsculas) y quedan dos fichas. No existe fusionar proveedores; por eso la hoja pregunta «¿no será…?» ANTES de registrar.
--
-- DOS LLAMADAS A LA VEZ: los mismos candados que `registrar_proveedor_de_orden` (`proveedor:<clave del nombre>` y luego `proveedor:<RUC>`;
-- `marca:<clave>` para la marca): un doble clic o dos sedes a la vez se turnan y la segunda encuentra a la primera.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte: crea dos funciones, sin `alter`, sin políticas ni `drop trigger`
-- (ADR-0195). Idempotente (`create or replace`). La web puede publicarse antes: sin estas funciones (PGRST202) la hoja dice que el
-- registro todavía no está disponible y no se rompe nada.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El proveedor ----------
create or replace function retail.registrar_proveedor_de_recepcion(p_nombre text, p_ruc text default null)
returns table (proveedor_id uuid, proveedor_nombre text, proveedor_ruc text, ya_existia boolean)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  -- Sin espacios de más, también por dentro: «Hilos  del Sur» es «Hilos del Sur».
  v_nombre text := retail.fn_texto_o_null(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_ruc text := retail.fn_texto_o_null(p_ruc);
  v_clave text;
  v_fila retail.proveedores%rowtype;
  v_hallado boolean := false;
  v_nuevo boolean := false;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Registrar un proveedor al recibir necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién recibe.' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  -- Ningún mensaje lleva el nombre ni el RUC (el repo es público y los logs también: un RUC 10… contiene un DNI).
  if v_nombre is null then
    raise exception 'Escribe la razón social del proveedor.' using errcode = 'P0001', hint = 'proveedor_sin_nombre';
  end if;
  if char_length(v_nombre) > 120 then
    raise exception 'La razón social va hasta 120 letras.' using errcode = 'P0001', hint = 'proveedor_nombre_largo';
  end if;
  if v_ruc is not null then
    v_ruc := regexp_replace(v_ruc, '[^0-9]', '', 'g');
    if v_ruc !~ '^[0-9]{11}$' then
      raise exception 'El RUC tiene 11 dígitos. Si no lo tienes, déjalo vacío.' using errcode = 'P0001', hint = 'proveedor_ruc_invalido';
    end if;
  end if;

  v_clave := retail.fn_clave_texto(v_nombre);
  perform pg_advisory_xact_lock(hashtextextended('proveedor:' || v_clave, 0));
  if v_ruc is not null then
    perform pg_advisory_xact_lock(hashtextextended('proveedor:' || v_ruc, 0));
  end if;

  -- ¿Ya existe? Primero por RUC (es lo único), después por el nombre.
  if v_ruc is not null then
    for v_fila in select p.* from retail.proveedores p where p.ruc = v_ruc loop
      v_hallado := true;
      exit;
    end loop;
  end if;
  if not v_hallado then
    for v_fila in select p.* from retail.proveedores p where retail.fn_clave_texto(p.nombre) = v_clave loop
      v_hallado := true;
      exit;
    end loop;
    -- El mismo nombre con OTRO RUC es otra empresa: no se devuelve la que ya estaba.
    if v_hallado and v_ruc is not null and v_fila.ruc is not null and v_fila.ruc <> v_ruc then
      raise exception 'Ya hay un proveedor con ese nombre y otro RUC. Revisa el RUC o cambia el nombre.'
        using errcode = 'P0001', hint = 'proveedor_nombre_en_uso';
    end if;
  end if;

  if v_hallado then
    if not v_fila.activo then
      raise exception 'Ese proveedor está desactivado. Pídele a quien administra proveedores que lo reactive.'
        using errcode = 'P0001', hint = 'proveedor_desactivado';
    end if;
    return query select v_fila.id, v_fila.nombre, v_fila.ruc, true;
    return;
  end if;

  begin
    insert into retail.proveedores (nombre, ruc) values (v_nombre, v_ruc) returning * into v_fila;
    v_nuevo := true;
  exception when unique_violation then
    -- Un índice único se adelantó: se relee y se devuelve ese, salvo que sea otra empresa (mismo nombre, otro RUC).
    v_hallado := false;
    for v_fila in select p.* from retail.proveedores p
                   where (v_ruc is not null and p.ruc = v_ruc) or retail.fn_clave_texto(p.nombre) = v_clave
                   order by (p.ruc = v_ruc) desc nulls last loop
      v_hallado := true;
      exit;
    end loop;
    if not v_hallado then raise; end if;
    if v_ruc is not null and v_fila.ruc is not null and v_fila.ruc <> v_ruc then
      raise exception 'Ya hay un proveedor con ese nombre y otro RUC. Revisa el RUC o cambia el nombre.'
        using errcode = 'P0001', hint = 'proveedor_nombre_en_uso';
    end if;
    if not v_fila.activo then
      raise exception 'Ese proveedor está desactivado. Pídele a quien administra proveedores que lo reactive.'
        using errcode = 'P0001', hint = 'proveedor_desactivado';
    end if;
  end;

  if v_nuevo then
    -- Actividad (ADR-0207): sin RUC. Si falla, el proveedor igual queda guardado.
    begin
      perform retail.fn_actividad_anotar(
        'recibir', 'proveedor_registrado',
        'sumó al proveedor ' || v_fila.nombre || ' al recibir mercadería',
        v_actor, retail.fn_actividad_terminal_ahora(), null, null,
        'proveedores', v_fila.id::text, now(),
        jsonb_build_object('proveedor_id', v_fila.id, 'con_ruc', v_fila.ruc is not null),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el proveedor nuevo (%)', sqlerrm;
    end;
  end if;

  return query select v_fila.id, v_fila.nombre, v_fila.ruc, not v_nuevo;
end;
$$;
revoke all on function retail.registrar_proveedor_de_recepcion(text, text) from public, anon;
grant execute on function retail.registrar_proveedor_de_recepcion(text, text) to authenticated;
comment on function retail.registrar_proveedor_de_recepcion(text, text) is
  'ADR-0635: quien recibe registra un proveedor nuevo con su razón social y su RUC (opcional), o recibe el que ya estaba. Con el módulo Recibir mercadería; no toca banco, rubros ni lo que ya existe.';

-- ---------- 2. La marca ----------
create or replace function retail.registrar_marca_de_recepcion(p_nombre text, p_proveedor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_actor uuid;
  v_marca uuid;
  v_activa boolean;
  v_real text;
  v_nueva boolean := false;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Crear una marca al recibir necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién recibe.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 60 then
    raise exception 'Escribe el nombre de la marca, como dice su etiqueta' using errcode = 'P0001', hint = 'marca_nombre';
  end if;
  if p_proveedor_id is null or not exists (select 1 from retail.proveedores where id = p_proveedor_id and activo) then
    raise exception 'Elige quién trae esta marca: un proveedor activo' using errcode = 'P0001', hint = 'marca_sin_proveedor';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('marca:' || retail.fn_clave_texto(v_nombre), 0));
  for v_marca, v_activa, v_real in
    select m.id, m.activo, m.nombre from retail.marcas m where retail.fn_clave_texto(m.nombre) = retail.fn_clave_texto(v_nombre)
  loop
    exit;
  end loop;
  if v_marca is null then
    insert into retail.marcas (nombre) values (v_nombre) returning id, nombre into v_marca, v_real;
    v_nueva := true;
  elsif not v_activa then
    raise exception 'La marca «%» existe pero está desactivada: pide que la reactiven en Catálogo ▸ Marcas', v_real
      using errcode = 'P0001', hint = 'marca_desactivada';
  end if;

  insert into retail.marca_proveedores (marca_id, proveedor_id) values (v_marca, p_proveedor_id) on conflict do nothing;

  if v_nueva then
    begin
      perform retail.fn_actividad_anotar('recibir', 'marca_creada', 'agregó la marca «' || v_real || '» al recibir mercadería',
        v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'marcas', v_marca::text, now(),
        jsonb_build_object('proveedor_id', p_proveedor_id), 'vivo');
    exception when others then
      raise warning 'actividad: no se anotó la marca nueva: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('id', v_marca, 'nombre', v_real, 'nueva', v_nueva);
end;
$$;
revoke all on function retail.registrar_marca_de_recepcion(text, uuid) from public, anon;
grant execute on function retail.registrar_marca_de_recepcion(text, uuid) to authenticated;
comment on function retail.registrar_marca_de_recepcion(text, uuid) is
  'ADR-0635: quien recibe crea una marca nueva unida a su proveedor; si ya existe, le suma el proveedor y la devuelve. Con el módulo Recibir mercadería.';

reset lock_timeout;
