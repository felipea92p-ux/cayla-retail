-- Registrar un proveedor NUEVO desde la orden de compra (2026-10-21, decisión de Felipe después del informe
-- `docs/pantallas/compras-ordenes-nueva.md`, tarea #7). Una sola parte, sin políticas.
--
-- POR QUÉ. La compradora, en Gamarra, se encuentra con un proveedor que nunca registraron: no puede pedirle nada hasta que alguien con
-- el módulo Proveedores lo dé de alta. Hoy ninguna de las dos altas rápidas le sirve: `registrar_proveedor` pide gestionar Proveedores
-- (y falla si el nombre o el RUC ya existen) y `registrar_proveedor_de_gasto` pide el módulo Gastos y le siembra el rubro «Gastos» (lo
-- metería en el combo de los gastos fijos). Felipe: «mostrar la opción registrar proveedor, permitir guardarlo con lo más básico, y
-- luego el aviso de completar datos». Lo básico: nombre + RUC, con la salida «No tiene RUC».
--
-- DECIDÍ: una función NUEVA y estrecha, por el módulo Órdenes de compra (ADR-0306: un botón no es un módulo; ADR-0178: no le entrega
-- Proveedores, solo un acto acotado). Promete devolver UN proveedor activo: el que ya estaba o uno nuevo que lleva solo lo que se
-- escribió (nombre, RUC o «sin RUC», celular opcional). No modifica uno que ya existe, no lo reactiva, no escribe banco, cuenta, CCI
-- ni rubros y no consulta el padrón (eso lo hace la pantalla). «Ficha incompleta» NO es una columna: sale de que no tiene datos de pago
-- (`sinDatosDePago`, el chip y el filtro de Proveedores que ya existen).
-- DESCARTÉ: abrir `registrar_proveedor` a más gente (dejaría escribir banco y CCI sin el permiso de Proveedores) y copiar el molde de
-- gastos tal cual (descarta en silencio el RUC escrito si el nombre ya existía, y dos llamadas con y sin RUC toman candados distintos).
-- SE ROMPE SI: una compradora registra «Mias Gamarra» sin RUC y ya existía «Mias»: la clave del nombre solo ve nombres iguales (sin
-- tildes ni mayúsculas; «S.A.C.» y «SAC» siguen siendo distintos, docs/BACKLOG.md P-25) y quedan dos fichas. No existe fusionar
-- proveedores; por eso la pantalla pregunta «¿no será…?» ANTES de registrar.
--
-- DOS LLAMADAS A LA VEZ. Usa las MISMAS CLAVES de candado que `registrar_proveedor_de_gasto` (`proveedor:<RUC>` y `proveedor:<clave del
-- nombre>`), pero toma las dos, siempre primero la del nombre y luego la del RUC (la de gastos toma una sola: el RUC si lo hay y, si
-- no, el nombre): dos compradoras o un doble clic se serializan, la segunda encuentra a la primera y devuelve el MISMO proveedor con
-- `ya_existia = true`. Si aun así un índice único se adelanta, relee y devuelve ese, salvo que sea otra empresa (mismo nombre, otro
-- RUC): ahí rechaza, como arriba.
--
-- FIRMA. `fn_actor_persona_id(true)` y la clave `proveedor_de_orden` en `acciones_sin_responsable`: con la cuenta de una persona firma
-- ella sin combo; desde una terminal se elige quién (como en las demás acciones de la orden, decisión 39): sin autor, rechaza con
-- `responsable_requerido`. Anota en Actividad sin RUC ni montos; si la nota falla, el proveedor igual queda guardado. (La primera versión
-- dejaba a una terminal registrar sin persona; la revisión independiente del 2026-10-21 la corrigió: la regla de CLAUDE.md es que toda
-- acción que guarda firma, y las excepciones las suelta Felipe una por una.)
--
-- PRODUCCIÓN. Una sola parte: crea UNA función y siembra UNA clave de una tabla chica (`acciones_sin_responsable`); no toma candados
-- sobre `auth`/`storage` ni sobre tablas en uso (sin políticas, sin `alter`). Re-pegable. La web se puede publicar ANTES: sin esta
-- función (PGRST202) el botón dice que el registro no está disponible todavía y no se rompe nada.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('proveedor_de_orden', 'Registrar un proveedor nuevo desde una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

create or replace function retail.registrar_proveedor_de_orden(
  p_nombre text,
  p_ruc text default null,
  p_sin_ruc boolean default false,
  p_celular text default null
)
returns table (proveedor_id uuid, proveedor_nombre text, proveedor_ruc text, ya_existia boolean)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_nombre text := retail.fn_texto_o_null(p_nombre);
  v_ruc text := retail.fn_texto_o_null(p_ruc);
  v_celular text := retail.fn_texto_o_null(p_celular);
  v_clave text;
  v_fila retail.proveedores%rowtype;
  v_hallado boolean := false;
  v_nuevo boolean := false;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Registrar un proveedor desde una orden necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  -- Desde una terminal la clave suelta el combo, pero la acción sigue necesitando una persona (quien registró queda en Actividad).
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  -- Lo escrito, en orden de lo que más se puede equivocar. Ningún mensaje lleva el nombre ni el RUC (el repo es público y los logs
  -- también: un RUC que empieza con 10 contiene el DNI de una persona).
  if v_nombre is null then
    raise exception 'El proveedor necesita un nombre.' using errcode = 'P0001', hint = 'proveedor_sin_nombre';
  end if;
  if char_length(v_nombre) > 120 then
    raise exception 'El nombre del proveedor va hasta 120 letras.' using errcode = 'P0001', hint = 'proveedor_nombre_largo';
  end if;
  if coalesce(p_sin_ruc, false) and v_ruc is not null then
    raise exception 'Si no tiene RUC, no escribas uno.' using errcode = 'P0001', hint = 'proveedor_ruc_y_sin_ruc';
  end if;
  if not coalesce(p_sin_ruc, false) and v_ruc is null then
    raise exception 'Escribe el RUC o marca «No tiene RUC».' using errcode = 'P0001', hint = 'proveedor_sin_ruc';
  end if;
  if v_ruc is not null and v_ruc !~ '^[0-9]{11}$' then
    raise exception 'El RUC tiene 11 dígitos.' using errcode = 'P0001', hint = 'proveedor_ruc_invalido';
  end if;
  if v_celular is not null then
    v_celular := regexp_replace(v_celular, '[^0-9]', '', 'g');
    if length(v_celular) = 11 and left(v_celular, 2) = '51' then
      v_celular := substr(v_celular, 3);
    end if;
    if v_celular !~ '^9[0-9]{8}$' then
      raise exception 'El celular tiene 9 dígitos y empieza con 9.' using errcode = 'P0001', hint = 'proveedor_celular_invalido';
    end if;
  end if;

  v_clave := retail.fn_clave_texto(v_nombre);
  -- Los mismos candados que `registrar_proveedor_de_gasto`, siempre en este orden (nombre y luego RUC).
  perform pg_advisory_xact_lock(hashtextextended('proveedor:' || v_clave, 0));
  if v_ruc is not null then
    perform pg_advisory_xact_lock(hashtextextended('proveedor:' || v_ruc, 0));
  end if;

  -- ¿Ya existe? Primero por RUC (es lo único), después por el nombre.
  if v_ruc is not null then
    select p.* into v_fila from retail.proveedores p where p.ruc = v_ruc limit 1;
    v_hallado := found;
  end if;
  if not v_hallado then
    select p.* into v_fila from retail.proveedores p where retail.fn_clave_texto(p.nombre) = v_clave limit 1;
    v_hallado := found;
    -- El mismo nombre con OTRO RUC es otra empresa: no se devuelve la que ya estaba (sería pedirle a quien no es).
    if v_hallado and v_ruc is not null and v_fila.ruc is not null and v_fila.ruc <> v_ruc then
      raise exception 'Ya hay un proveedor con ese nombre y otro RUC. Revisa el RUC o cambia el nombre.'
        using errcode = 'P0001', hint = 'proveedor_nombre_en_uso';
    end if;
  end if;

  if v_hallado then
    -- Uno desactivado no se reactiva desde una orden: lo decide quien administra proveedores.
    if not v_fila.activo then
      raise exception 'Ese proveedor está desactivado. Pídele a quien administra proveedores que lo reactive.'
        using errcode = 'P0001', hint = 'proveedor_desactivado';
    end if;
    return query select v_fila.id, v_fila.nombre, v_fila.ruc, true;
    return;
  end if;

  begin
    insert into retail.proveedores (nombre, ruc, telefono) values (v_nombre, v_ruc, v_celular) returning * into v_fila;
    v_nuevo := true;
  exception when unique_violation then
    -- Un índice único se adelantó (el RUC o el nombre ya estaban): se relee y se devuelve ese.
    select p.* into v_fila from retail.proveedores p
     where (v_ruc is not null and p.ruc = v_ruc) or retail.fn_clave_texto(p.nombre) = v_clave
     order by (p.ruc = v_ruc) desc nulls last limit 1;
    if not found then raise; end if;
    -- Si el que se adelantó es OTRA empresa (el mismo nombre con otro RUC), no se devuelve: sería pedirle a quien no es.
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
    -- Actividad (ADR-0207): sin RUC ni montos. Si falla, el proveedor igual queda guardado.
    begin
      perform retail.fn_actividad_anotar(
        'ordenes_compra', 'proveedor_registrado',
        'sumó al proveedor ' || v_fila.nombre || ' desde una orden de compra',
        v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_compra_sede_actividad(v_actor), null,
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
revoke all on function retail.registrar_proveedor_de_orden(text, text, boolean, text) from public, anon;
grant execute on function retail.registrar_proveedor_de_orden(text, text, boolean, text) to authenticated;
comment on function retail.registrar_proveedor_de_orden(text, text, boolean, text) is
  'Registra un proveedor nuevo desde una orden de compra con lo más básico (nombre + RUC o sin RUC, celular opcional), o devuelve el que ya estaba. Por el módulo Órdenes de compra; no toca banco, rubros ni lo que ya existe (Felipe 2026-10-21).';
