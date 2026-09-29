-- ============================================================================
-- 20260929230000_acciones_sin_responsable.sql — CAYLA V2 (ADR-0161, ADR-0162; pedido de Felipe, 2026-09-29)
--
-- EL PROBLEMA. Con `configuracion_empresa.exige_responsable` encendido, TODA acción que guarda pide elegir quién de las
-- presentes en la tienda la hace: 149 lugares en la web. Felipe repasó los 149 uno por uno y marcó 30 donde el combo
-- estorba más de lo que ayuda (el alta de producto pedía hasta 9 veces el mismo nombre; aprobar un color, adjuntar un
-- archivo a una factura…). De esos 30 quedaron 28 acciones: dos filas eran en realidad el «Quién cuenta» de todo el conteo
-- y el modal «Nuevo color», que Felipe no quería soltar (ver ADR-0280). La lista viva está en
-- `apps/web/lib/responsable-omitido.ts`.
--
-- LA REGLA NUEVA. Esas 28 acciones se pueden hacer SIN elegir responsable:
--   · Sesión de PERSONA: firma a su propio nombre, sin exigir marca de asistencia (como ya hace el Admin, 20260924171300).
--   · Sesión de TERMINAL: la acción se guarda sin persona (`fn_actor_persona_id` devuelve NULL). Queda `terminal_id`
--     donde la tabla lo lleva; el nombre de una persona, no. Es la decisión de Felipe («quita para todos»).
--     Única excepción, en la web: apartar una prenda sigue pidiendo responsable en una terminal, porque
--     `separaciones.creado_por` es NOT NULL y `apartar_stock` rechaza un actor vacío.
--
-- CÓMO SE PIDE. La web manda el encabezado `x-responsable-omitido: <clave>` (como ya manda `x-responsable`). La base solo
-- lo respeta si la clave está en `retail.acciones_sin_responsable`: una clave que no está (o un encabezado inventado
-- para una acción que Felipe NO soltó, como la caja o la venta) se ignora y sigue el candado de siempre. No cambia ni una
-- de las funciones que guardan: el único punto de decisión es `fn_actor_persona_id`.
--
-- PARA VOLVER (Felipe: «volver»). Dos palancas, en este orden:
--   1. Web: `git revert` del commit «quita 30 combos» — las pantallas vuelven a pedir responsable.
--   2. Base: `delete from retail.acciones_sin_responsable;` (deja de respetar el encabezado) o volver a pegar la definición
--      de `fn_actor_persona_id` de 20260924171300_admin_firma_sin_asistencia.sql. Si solo se hace esta segunda sin la
--      primera, las 28 pantallas quedan sin combo y la base rechaza con «Elige quién hace esta operación».
--
-- Igual a la definición de 20260924171300 (la de producción, comparada el 2026-09-29) más el encabezado nuevo.
-- Re-ejecutable. Prueba: `pnpm pruebas:responsable-omitido`. Va en UNA sola parte: solo crea una tabla nueva (RLS sin
-- políticas: la lee únicamente la función `security definer`) y reemplaza una función; no toca tablas en uso (ADR-0195).
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta retail.fn_actor_persona_id: pega antes 20260924171300_admin_firma_sin_asistencia.sql';
  end if;
end $$;

create table if not exists retail.acciones_sin_responsable (
  clave text primary key check (clave ~ '^[a-z0-9_]+$'),
  descripcion text not null
);
comment on table retail.acciones_sin_responsable is
  'Acciones que Felipe soltó del combo «Responsable» (2026-09-29): las únicas para las que fn_actor_persona_id respeta el encabezado x-responsable-omitido. Vaciarla devuelve el candado a todas.';

-- Solo la lee `fn_actor_persona_id` (security definer): ningún rol de la API necesita tocarla.
alter table retail.acciones_sin_responsable enable row level security;
revoke all on table retail.acciones_sin_responsable from anon, authenticated;

insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('apartar_prenda', 'Apartar una prenda para una clienta (desde Existencias)'),
  ('aviso_apartado', 'Dejar el aviso o recordatorio a la clienta de un apartado'),
  ('traslado_recibir', 'Recibir, confirmar o cerrar con diferencia un traslado'),
  ('conteo_cerrar', 'Cerrar el conteo y aplicar las diferencias'),
  ('regularizar_prenda', 'Regularizar una prenda por regularizar'),
  ('compra_adjunto_subir', 'Adjuntar un archivo a una factura de compra'),
  ('compra_adjunto_quitar', 'Quitar un adjunto de una factura de compra'),
  ('alta_producto_categoria', 'Configurar una categoría dentro del alta de producto'),
  ('alta_producto_tejido', 'Proponer un tejido nuevo dentro del alta de producto'),
  ('alta_producto_talla', 'Proponer una talla nueva dentro del alta de producto'),
  ('alta_producto_etiqueta', 'Crear una etiqueta dentro del alta de producto'),
  ('alta_producto_color', 'Crear un color dentro del alta de producto'),
  ('alta_producto_marca', 'Crear una marca dentro del alta de producto'),
  ('alta_producto_muestra', 'Elegir la muestra de un valor dentro del alta de producto'),
  ('alta_producto_valor', 'Proponer otro valor de atributo dentro del alta de producto'),
  ('producto_confirmar_cambios', 'Confirmar los cambios de la ficha de un producto'),
  ('producto_revisar_alta', 'Aprobar o rechazar una prenda dada de alta al vuelo en un conteo'),
  ('color_rechazar', 'Rechazar un color propuesto'),
  ('talla_aprobar', 'Aprobar una talla propuesta'),
  ('talla_rechazar', 'Rechazar una talla propuesta'),
  ('tejido_rechazar', 'Rechazar un tejido propuesto'),
  ('patron_rechazar', 'Rechazar un patrón propuesto'),
  ('muestra_foto', 'Subir o quitar la foto de muestra de un tejido o patrón'),
  ('temporada_fechas_anio', 'Guardar las fechas del año de las temporadas'),
  ('etiqueta_estado', 'Aprobar, desactivar o reactivar una etiqueta'),
  ('etiqueta_rechazar', 'Rechazar una etiqueta propuesta'),
  ('etiqueta_campana', 'Ponerle campaña a una etiqueta'),
  ('catalogo_confirmar_estado', 'Aprobar, desactivar o reactivar un valor del Catálogo con un solo clic')
on conflict (clave) do update set descripcion = excluded.descripcion;

create or replace function retail.fn_actor_persona_id(p_de_tienda boolean default true)
returns uuid
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_headers json;
  v_texto text;
  v_responsable uuid;
  v_momento timestamptz := now();
  v_ubicacion uuid;
  v_terminal record;
  v_yo uuid;
  v_omitida boolean := false;
begin
  -- Sin sesión (SQL Editor, scripts con la llave de servicio): igual que antes, nadie.
  if auth.uid() is null then
    return null;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_texto := nullif(trim(v_headers ->> 'x-responsable'), '');
  if v_texto is not null then
    begin
      v_responsable := v_texto::uuid;
    exception when invalid_text_representation then
      raise exception 'El responsable enviado no es válido' using errcode = '22P02';
    end;
  end if;
  -- Acción soltada del combo (20260929230000): solo cuenta si NO se eligió a nadie y la clave está en la lista.
  v_texto := nullif(trim(v_headers ->> 'x-responsable-omitido'), '');
  if v_texto is not null and v_responsable is null then
    v_omitida := exists (select 1 from retail.acciones_sin_responsable a where a.clave = v_texto);
  end if;
  -- Venta sin conexión: vale la hora de la venta (Felipe, 2026-09-22), acotada a 7 días atrás.
  v_texto := nullif(trim(v_headers ->> 'x-momento'), '');
  if v_texto is not null then
    begin
      v_momento := v_texto::timestamptz;
    exception when others then
      raise exception 'La hora de la operación no es válida' using errcode = '22007';
    end;
    if v_momento > now() + interval '5 minutes' or v_momento < now() - interval '7 days' then
      raise exception 'La hora de la operación está fuera de rango' using errcode = '22007';
    end if;
  end if;

  select * into v_terminal from retail.fn_terminal_actual() limit 1;

  -- Sesión de TERMINAL: siempre firma una persona presente en SU tienda… salvo una acción soltada del combo: queda sin persona.
  if v_terminal.id is not null then
    if v_responsable is null then
      if v_omitida then
        return null;
      end if;
      raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
    end if;
    if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                   where p.id = v_responsable and p.estado = 'activo') then
      raise exception 'Esa persona no tiene acceso a retail' using errcode = '42501', hint = 'responsable_sin_acceso';
    end if;
    if not retail.fn_persona_presente(v_responsable, v_terminal.ubicacion_id, v_momento) then
      raise exception 'Esa persona no está de turno en esta tienda: tiene que marcar su entrada' using errcode = '42501', hint = 'responsable_no_presente';
    end if;
    return v_responsable;
  end if;

  -- Sesión de PERSONA.
  select p.id into v_yo from public.personas p where p.auth_user_id = auth.uid();
  if not p_de_tienda or (v_responsable is null and (v_omitida or not retail.fn_exige_responsable())) then
    return v_yo; -- idéntico a la búsqueda que reemplaza
  end if;
  -- ADMIN (20260924171300): firma a su nombre sin marcar asistencia. Sin responsable o eligiéndose a sí mismo; si
  -- elige a otra persona, esa pasa por el candado de abajo como con cualquier cuenta.
  if coalesce(v_responsable, v_yo) = v_yo and retail.fn_es_admin() then
    return v_yo;
  end if;
  if v_responsable is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  begin
    v_ubicacion := nullif(trim(v_headers ->> 'x-ubicacion'), '')::uuid;
  exception when invalid_text_representation then
    v_ubicacion := null;
  end;
  if v_ubicacion is null or not retail.fn_puede_operar_ubicacion(v_ubicacion) then
    raise exception 'Falta la tienda de la operación' using errcode = '42501', hint = 'ubicacion_requerida';
  end if;
  if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                 where p.id = v_responsable and p.estado = 'activo') then
    raise exception 'Esa persona no tiene acceso a retail' using errcode = '42501', hint = 'responsable_sin_acceso';
  end if;
  if not retail.fn_persona_presente(v_responsable, v_ubicacion, v_momento) then
    raise exception 'Esa persona no está de turno en esta tienda: tiene que marcar su entrada' using errcode = '42501', hint = 'responsable_no_presente';
  end if;
  return v_responsable;
end;
$fn$;

comment on function retail.fn_actor_persona_id(boolean) is
  'ADR-0162: quién FIRMA la operación. Desde 20260923230000 toda función que guarda llama con true: firma el responsable del combo (x-responsable presente en la sede x-ubicacion). Desde 20260924171300 el Admin (fn_es_admin) firma a su nombre sin marcar asistencia. Desde 20260929230000, una acción de retail.acciones_sin_responsable (encabezado x-responsable-omitido) firma la persona de la sesión sin asistencia, o nadie (NULL) si es una terminal. false queda solo para PERMISOS que se comparan con la cuenta (fn_alcanzo_a, «no te quites/suspendas/cambies el rol a ti mismo»). NO decide permisos: eso es de la cuenta (fn_es_lider, fn_puede_*).';
