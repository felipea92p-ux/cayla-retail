-- ============================================================================
-- 20260926090000_actividad_por_modulo.sql — CAYLA V2 (ADR-0207)
--
-- EL PROBLEMA. Cada operación queda firmada en la fila de lo que se hizo: unas 55 tablas, cada una con su propia columna
-- (`ventas.usuario_id`, `cajas.abierta_por`, `cambios.usuario_id`…). No existe un lugar donde el Admin o una líder
-- pregunten «¿qué pasó hoy en la Caja de Trujillo y quién lo hizo?». Hay que saber SQL y en qué tabla mirar.
--
-- LA DECISIÓN (Felipe, 2026-09-25):
--   · Cada módulo tiene su historial propio; se abre desde la CABECERA (botón «Actividad», junto a la sede), no desde el
--     lateral: el panel muestra la actividad del módulo donde uno está parado.
--   · Lo ve el Admin y el Líder (todas las sedes) y quien tenga el módulo nuevo «Actividad» en su rol (la líder de
--     tienda): SOLO su sede. Nace sin rol, como todo módulo (ADR-0161); y nunca se da a una terminal (un aparato
--     compartido de mostrador no revisa lo que hacen las demás).
--   · Un traslado entre sedes lo ven las dos (ubicacion_id = origen, ubicacion_destino_id = destino).
--   · Lo que ya pasó se carga desde las firmas que ya existen (origen = 'carga_inicial'). Las ediciones antiguas no se
--     pueden recuperar: esas se anotan desde hoy.
--
-- CÓMO. Una sola tabla `retail.actividad`, de SOLO AGREGAR (como `movimientos`): nadie la edita ni la borra. Se llena
-- sola con disparadores sobre las tablas que ya guardan cada operación — no se toca ninguna de las funciones que guardan
-- (son 343). Cada evento lo arma UNA función (`fn_actividad_<evento>`) que usan tanto el disparador como la carga
-- inicial: el texto de hoy y el de lo cargado salen del mismo lugar.
--
-- PRIMER PASO (este archivo): Punto de venta, Historial de ventas (anulaciones), Caja y Cambios. Los demás módulos se
-- suman con una migración cada uno, agregando su función de evento y su disparador. Un módulo que todavía no anota su
-- actividad lo dice en el panel; nunca muestra una lista vacía como si no hubiera pasado nada.
--
-- UN ERROR AQUÍ NUNCA DETIENE UNA VENTA. Cada disparador envuelve su anotación en un bloque con excepción: si falla, deja
-- un WARNING en el log de Postgres y la operación sigue. Se prefirió perder una línea del historial a dejar una tienda
-- sin poder cobrar (principio 9). La prueba `pnpm pruebas:actividad` cuida que eso no pase en silencio.
--
-- PRODUCCIÓN. Sin políticas (la tabla solo se lee por funciones `security definer`), así que no toma las tablas de
-- `auth`/`storage` (ADR-0195): se pega en UNA sola parte. Con el prefijo `retail.` ya escrito. Re-ejecutable.
-- Prueba: `pnpm pruebas:actividad`.
-- ============================================================================

set lock_timeout = '3s';

-- ---------- 1. El módulo (ADR-0161: nace sin rol, solo lo ve el líder) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable)
  values ('actividad', 'Gestión', 'Actividad', 'Ver quién hizo qué en cada módulo de su tienda: ventas, anulaciones, caja y cambios, con fecha, hora y persona', 300, false, true)
  on conflict (clave) do nothing;

-- ---------- 2. Solo para personas, nunca para una terminal (como Colaboradores y Roles, ADR-0161 P6) ----------
-- Igual a la de 20260923140000 (la que está en producción) con 'actividad' en la lista.
create or replace function retail.fn_exigir_rol_de_terminal(p_rol_id uuid, p_modulo text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_solo_personas constant text[] := array['colaboradores', 'roles', 'actividad'];
  v_rol retail.roles;
  v_terminales text;
  v_modulos text;
begin
  if p_modulo is not null and not (p_modulo = any (c_solo_personas)) then
    return;
  end if;
  select * into v_rol from retail.roles where id = p_rol_id for update;
  if v_rol.id is null then
    return; -- el disparador de coherencia ya dice «ese rol no existe»
  end if;

  if p_modulo is null then
    -- Se le da este rol a una terminal: el rol no puede incluir los módulos de personas.
    select string_agg(m.nombre, ' y ' order by m.orden) into v_modulos
      from retail.rol_modulos rm join retail.modulos m on m.clave = rm.modulo
     where rm.rol_id = p_rol_id and rm.modulo = any (c_solo_personas);
    if v_modulos is not null then
      raise exception 'Una terminal no puede tener el rol «%»: incluye %, que solo se dan a personas. Elige otro rol o quítale esos módulos.', v_rol.nombre, v_modulos
        using errcode = '23514', hint = 'rol_solo_personas';
    end if;
  else
    -- Se enciende un módulo de personas en un rol: no puede tenerlo ninguna terminal.
    select string_agg(t.nombre, ', ' order by t.nombre) into v_terminales from retail.terminales t where t.rol_id = p_rol_id;
    if v_terminales is not null then
      raise exception '«%» solo se da a personas, y el rol «%» lo tienen terminales (%). Dales otro rol antes de encenderlo.',
        (select nombre from retail.modulos where clave = p_modulo), v_rol.nombre, v_terminales
        using errcode = '23514', hint = 'rol_solo_personas';
    end if;
  end if;
end;
$fn$;

-- ---------- 3. La tabla ----------
create table if not exists retail.actividad (
  id bigint generated always as identity primary key,
  -- Cuándo pasó (la hora de la operación, no la de la anotación: una venta sin conexión trae su hora).
  ocurrio_at timestamptz not null,
  -- El módulo donde se hizo (el de la pantalla que lo guarda): la anulación de una venta es del Historial de ventas.
  modulo text not null references retail.modulos (clave),
  -- Qué pasó, como clave estable (`venta_registrada`, `caja_cerrada`…); el texto para leer va en `descripcion`.
  accion text not null check (accion ~ '^[a-z_]+$'),
  -- La frase sin el sujeto: la pantalla antepone el nombre («Rosa Mendoza» + «anuló la venta B001-000123…»).
  descripcion text not null check (length(btrim(descripcion)) > 0),
  -- Quién lo hizo: el responsable que firmó (ADR-0162), no la cuenta. Vacío en filas viejas sin firma.
  persona_id uuid references public.personas (id),
  -- Desde qué aparato, si fue desde una terminal compartida.
  terminal_id uuid references retail.terminales (id),
  -- La sede de la operación; en un traslado, el origen. La líder de tienda ve las filas de SU sede (en cualquiera de las dos).
  ubicacion_id uuid references retail.ubicaciones (id),
  ubicacion_destino_id uuid references retail.ubicaciones (id),
  -- A qué se refiere (para enlazar desde la pantalla).
  tabla text not null,
  registro_id text not null,
  -- Montos, motivo, antes/después de una edición… lo que la pantalla quiera mostrar sin volver a la tabla de origen.
  detalle jsonb not null default '{}'::jsonb,
  -- 'vivo' = lo anotó el disparador en el momento; 'carga_inicial' = se reconstruyó de las firmas que ya existían.
  origen text not null default 'vivo' check (origen in ('vivo', 'carga_inicial')),
  anotado_at timestamptz not null default now()
);

comment on table retail.actividad is
  'ADR-0207: el historial de actividad de cada módulo (quién hizo qué, dónde y cuándo). Solo se agrega: nadie la edita ni la borra. La llenan disparadores; se lee con retail.fn_actividad().';

create index if not exists actividad_sede_modulo_idx on retail.actividad (ubicacion_id, modulo, ocurrio_at desc, id desc);
create index if not exists actividad_destino_idx on retail.actividad (ubicacion_destino_id, ocurrio_at desc) where ubicacion_destino_id is not null;
create index if not exists actividad_modulo_idx on retail.actividad (modulo, ocurrio_at desc, id desc);
create index if not exists actividad_registro_idx on retail.actividad (tabla, registro_id);
create index if not exists actividad_persona_idx on retail.actividad (persona_id, ocurrio_at desc) where persona_id is not null;

-- Solo se lee por funciones `security definer`: RLS encendido y sin políticas (nadie la lee directo).
alter table retail.actividad enable row level security;
revoke all on retail.actividad from anon, authenticated;

-- Solo agregar (mismo candado que `movimientos`, 20260914165703).
create or replace function retail.fn_actividad_inmutable() returns trigger
language plpgsql as $fn$
begin
  raise exception 'La actividad no se edita ni se borra: es el registro de lo que pasó' using errcode = '42501';
end;
$fn$;

create or replace trigger trg_actividad_inmutable
  before update or delete on retail.actividad
  for each row execute function retail.fn_actividad_inmutable();

-- ---------- 4. Piezas comunes ----------
-- Monto en soles como lo lee una persona: «S/ 1,289.50», con un espacio que no se corta (el monto nunca queda partido).
create or replace function retail.fn_actividad_soles(p numeric) returns text
language sql immutable as $$
  select 'S/' || chr(160) || to_char(coalesce(p, 0), 'FM999,999,990.00');
$$;

-- La prenda como se nombra en la tienda: «Blusa lino · M · Negro».
create or replace function retail.fn_actividad_prenda(p_variante_id uuid) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select concat_ws(' · ', nullif(btrim(p.descripcion), ''), t.valor, c.nombre)
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    left join retail.tallas t on t.id = v.talla_id
    left join retail.colores c on c.codigo = v.color_codigo
   where v.id = p_variante_id;
$$;

-- Anota un evento. En la carga inicial no repite lo que ya está (re-ejecutable).
create or replace function retail.fn_actividad_anotar(
  p_modulo text, p_accion text, p_descripcion text, p_persona_id uuid, p_terminal_id uuid, p_ubicacion_id uuid,
  p_ubicacion_destino_id uuid, p_tabla text, p_registro_id text, p_ocurrio_at timestamptz, p_detalle jsonb, p_origen text
) returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  if p_origen = 'carga_inicial' and exists (
    select 1 from retail.actividad a where a.tabla = p_tabla and a.registro_id = p_registro_id and a.accion = p_accion
  ) then
    return;
  end if;
  insert into retail.actividad (ocurrio_at, modulo, accion, descripcion, persona_id, terminal_id, ubicacion_id,
                                ubicacion_destino_id, tabla, registro_id, detalle, origen)
  values (coalesce(p_ocurrio_at, now()), p_modulo, p_accion, p_descripcion, p_persona_id, p_terminal_id, p_ubicacion_id,
          p_ubicacion_destino_id, p_tabla, p_registro_id, coalesce(jsonb_strip_nulls(p_detalle), '{}'::jsonb), p_origen);
end;
$fn$;

-- ---------- 5. Los eventos (uno por función; los usan el disparador y la carga inicial) ----------

-- Punto de venta · una venta. Corre al CONFIRMAR la transacción (disparador diferido): para entonces ya están sus
-- prendas y su comprobante, que se guardan después de la cabecera.
create or replace function retail.fn_actividad_venta_registrada(p_venta_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v retail.ventas;
  v_prendas integer;
  v_total numeric;
  v_comprobante text;
begin
  select * into v from retail.ventas where id = p_venta_id;
  if v.id is null then return; end if;
  select coalesce(sum(i.cantidad), 0), coalesce(sum(coalesce(i.subtotal, i.cantidad * (i.precio_unitario - i.descuento_unitario))), 0)
    into v_prendas, v_total
    from retail.venta_items i where i.venta_id = v.id;
  select c.serie || '-' || lpad(c.numero::text, 6, '0') into v_comprobante
    from retail.comprobantes c where c.venta_id = v.id and c.comprobante_original_id is null
   order by c.created_at limit 1;

  perform retail.fn_actividad_anotar(
    'vender', 'venta_registrada',
    'vendió ' || v_prendas || case when v_prendas = 1 then ' prenda' else ' prendas' end || ' por ' || retail.fn_actividad_soles(v_total)
      || case when v.descuento_pct > 0 then ' con ' || trim_scale(v.descuento_pct)::text || ' % de descuento' else '' end
      || coalesce(' · ' || v_comprobante, ''),
    v.usuario_id, v.terminal_id, v.ubicacion_id, null, 'ventas', v.id::text, v.created_at,
    jsonb_build_object('total', v_total, 'prendas', v_prendas, 'comprobante', v_comprobante,
                       'descuento_pct', nullif(v.descuento_pct, 0), 'es_prueba', nullif(v.es_prueba, false)),
    p_origen);

  -- Un descuento por encima del tope lo autoriza OTRA persona: es su propia línea, con su nombre.
  if v.descuento_autorizado_por is not null then
    perform retail.fn_actividad_anotar(
      'vender', 'descuento_autorizado',
      'autorizó ' || trim_scale(v.descuento_pct)::text || ' % de descuento en una venta de ' || retail.fn_actividad_soles(v_total)
        || coalesce(' · ' || v_comprobante, '') || coalesce(' · motivo: ' || nullif(btrim(v.descuento_motivo), ''), ''),
      v.descuento_autorizado_por, v.terminal_id, v.ubicacion_id, null, 'ventas', v.id::text, v.created_at,
      jsonb_build_object('descuento_pct', v.descuento_pct, 'total', v_total, 'vendio', v.usuario_id, 'es_prueba', nullif(v.es_prueba, false)),
      p_origen);
  end if;
end;
$fn$;

-- Historial de ventas · una anulación (se anula desde el Historial, así que es de ese módulo).
create or replace function retail.fn_actividad_venta_anulada(p_venta_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v retail.ventas;
  v_total numeric;
  v_comprobante text;
begin
  select * into v from retail.ventas where id = p_venta_id;
  if v.id is null or v.estado <> 'anulada' then return; end if;
  select coalesce(sum(coalesce(i.subtotal, i.cantidad * (i.precio_unitario - i.descuento_unitario))), 0) into v_total
    from retail.venta_items i where i.venta_id = v.id;
  select c.serie || '-' || lpad(c.numero::text, 6, '0') into v_comprobante
    from retail.comprobantes c where c.venta_id = v.id and c.comprobante_original_id is null
   order by c.created_at limit 1;

  perform retail.fn_actividad_anotar(
    'historial', 'venta_anulada',
    'anuló ' || coalesce('la venta ' || v_comprobante, 'una venta') || ' de ' || retail.fn_actividad_soles(v_total)
      || coalesce(' · motivo: ' || nullif(btrim(v.motivo_anulacion), ''), ''),
    v.anulado_por, null, v.ubicacion_id, null, 'ventas', v.id::text, v.anulado_en,
    jsonb_build_object('total', v_total, 'comprobante', v_comprobante, 'motivo', v.motivo_anulacion, 'es_prueba', nullif(v.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Caja · apertura.
create or replace function retail.fn_actividad_caja_abierta(p_caja_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  c retail.cajas;
begin
  select * into c from retail.cajas where id = p_caja_id;
  if c.id is null then return; end if;
  perform retail.fn_actividad_anotar(
    'caja', 'caja_abierta',
    'abrió la caja con ' || retail.fn_actividad_soles(c.monto_apertura)
      || case when c.monto_apertura_esperado is not null and abs(c.monto_apertura - c.monto_apertura_esperado) >= 0.01
              then ' · se esperaban ' || retail.fn_actividad_soles(c.monto_apertura_esperado)
                   || coalesce(' · motivo: ' || nullif(btrim(c.motivo_diferencia_apertura), ''), '')
              else '' end,
    c.abierta_por, c.terminal_id, c.ubicacion_id, null, 'cajas', c.id::text, c.abierta_en,
    jsonb_build_object('monto', c.monto_apertura, 'esperado', c.monto_apertura_esperado,
                       'motivo', c.motivo_diferencia_apertura, 'es_prueba', nullif(c.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Caja · cierre.
create or replace function retail.fn_actividad_caja_cerrada(p_caja_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  c retail.cajas;
begin
  select * into c from retail.cajas where id = p_caja_id;
  if c.id is null or c.estado <> 'cerrada' then return; end if;
  perform retail.fn_actividad_anotar(
    'caja', 'caja_cerrada',
    'cerró la caja: contó ' || retail.fn_actividad_soles(c.monto_cierre_real)
      || case when c.monto_cierre_sistema is not null then ', el sistema esperaba ' || retail.fn_actividad_soles(c.monto_cierre_sistema) else '' end
      || case when coalesce(c.diferencia, 0) > 0 then ' · sobraron ' || retail.fn_actividad_soles(c.diferencia)
              when coalesce(c.diferencia, 0) < 0 then ' · faltaron ' || retail.fn_actividad_soles(-c.diferencia)
              else '' end,
    c.cerrada_por, c.terminal_id, c.ubicacion_id, null, 'cajas', c.id::text, c.cerrada_en,
    jsonb_build_object('contado', c.monto_cierre_real, 'esperado', c.monto_cierre_sistema, 'diferencia', c.diferencia,
                       'nota', nullif(btrim(c.nota), ''), 'es_prueba', nullif(c.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Caja · el líder revisa una apertura que no coincidía (ADR-0186).
create or replace function retail.fn_actividad_apertura_revisada(p_caja_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  c retail.cajas;
begin
  select * into c from retail.cajas where id = p_caja_id;
  if c.id is null or c.apertura_revisada_por is null then return; end if;
  perform retail.fn_actividad_anotar(
    'caja', 'apertura_revisada',
    'dio por revisada la apertura con diferencia del ' || to_char(c.abierta_en at time zone 'America/Lima', 'DD/MM/YYYY'),
    c.apertura_revisada_por, null, c.ubicacion_id, null, 'cajas', c.id::text, c.apertura_revisada_en,
    jsonb_build_object('monto', c.monto_apertura, 'esperado', c.monto_apertura_esperado, 'es_prueba', nullif(c.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Caja · entrada o salida de dinero del cajón (a mano, un gasto pagado del cajón, el adelanto de un apartado…).
create or replace function retail.fn_actividad_caja_movimiento(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  m retail.caja_movimientos;
  c retail.cajas;
begin
  select * into m from retail.caja_movimientos where id = p_id;
  if m.id is null then return; end if;
  select * into c from retail.cajas where id = m.caja_id;
  perform retail.fn_actividad_anotar(
    'caja', case when m.es_ajuste then 'caja_ajuste' when m.tipo = 'ingreso' then 'caja_ingreso' else 'caja_egreso' end,
    'registró ' || case when m.es_ajuste then 'un ajuste de ' else '' end
      || case when m.tipo = 'ingreso' then 'una entrada de ' else 'una salida de ' end || retail.fn_actividad_soles(m.monto)
      || coalesce(' · ' || nullif(btrim(m.motivo), ''), '') || coalesce(' · ' || nullif(btrim(m.nota), ''), ''),
    m.usuario_id, m.terminal_id, c.ubicacion_id, null, 'caja_movimientos', m.id::text, m.created_at,
    jsonb_build_object('tipo', m.tipo, 'monto', m.monto, 'motivo', m.motivo, 'ajuste', nullif(m.es_ajuste, false),
                       'caja_id', m.caja_id, 'es_prueba', nullif(c.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Caja · dinero que sale del cajón al cerrar (caja fuerte, banco, entregado al líder; ADR-0186).
create or replace function retail.fn_actividad_caja_traslado(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  t retail.caja_traslados;
  c retail.cajas;
begin
  select * into t from retail.caja_traslados where id = p_id;
  if t.id is null then return; end if;
  select * into c from retail.cajas where id = t.caja_id;
  perform retail.fn_actividad_anotar(
    'caja', 'caja_traslado',
    'sacó ' || retail.fn_actividad_soles(t.monto) || ' del cajón '
      || case t.destino when 'caja_fuerte' then 'a la caja fuerte' when 'banco' then 'para depositar en el banco' else 'para entregarlo al líder' end
      || coalesce(' · ' || nullif(btrim(t.referencia), ''), ''),
    t.registrado_por, c.terminal_id, c.ubicacion_id, null, 'caja_traslados', t.id::text, t.creado_en,
    jsonb_build_object('monto', t.monto, 'destino', t.destino, 'referencia', t.referencia, 'caja_id', t.caja_id,
                       'es_prueba', nullif(c.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Cambios · una prenda por otra.
create or replace function retail.fn_actividad_cambio(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  k retail.cambios;
  v_antes text;
  v_despues text;
begin
  select * into k from retail.cambios where id = p_id;
  if k.id is null then return; end if;
  select retail.fn_actividad_prenda(i.variante_id) into v_antes from retail.venta_items i where i.id = k.venta_item_id;
  v_despues := retail.fn_actividad_prenda(k.variante_nueva_id);
  perform retail.fn_actividad_anotar(
    'cambios', 'cambio_registrado',
    'cambió ' || case when k.cantidad > 1 then k.cantidad || ' × ' else '' end
      || coalesce('«' || v_antes || '»', 'una prenda') || ' por ' || coalesce('«' || v_despues || '»', 'otra')
      || case when k.diferencia > 0 then ' · la clienta pagó ' || retail.fn_actividad_soles(k.diferencia)
              when k.diferencia < 0 then ' · se le devolvió ' || retail.fn_actividad_soles(-k.diferencia)
              else '' end
      || case when k.condicion = 'no_vendible' then ' · la prenda devuelta no se puede vender' else '' end,
    k.usuario_id, k.terminal_id, k.ubicacion_id, null, 'cambios', k.id::text, k.created_at,
    jsonb_build_object('antes', v_antes, 'despues', v_despues, 'cantidad', k.cantidad, 'diferencia', nullif(k.diferencia, 0),
                       'medio', k.metodo_pago_diferencia, 'motivo', k.motivo, 'condicion', k.condicion),
    p_origen);
end;
$fn$;

-- ---------- 6. Los disparadores ----------
-- Cada uno envuelve su anotación: un error del historial deja un WARNING y NUNCA detiene la operación.

create or replace function retail.trg_actividad_ventas() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    if tg_op = 'INSERT' then
      perform retail.fn_actividad_venta_registrada(new.id);
    elsif old.estado is distinct from new.estado and new.estado = 'anulada' then
      perform retail.fn_actividad_venta_anulada(new.id);
    end if;
  exception when others then
    raise warning 'actividad: no se anotó la venta % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace function retail.trg_actividad_cajas() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    if tg_op = 'INSERT' then
      perform retail.fn_actividad_caja_abierta(new.id);
    else
      if old.estado is distinct from new.estado and new.estado = 'cerrada' then
        perform retail.fn_actividad_caja_cerrada(new.id);
      end if;
      if old.apertura_revisada_por is null and new.apertura_revisada_por is not null then
        perform retail.fn_actividad_apertura_revisada(new.id);
      end if;
    end if;
  exception when others then
    raise warning 'actividad: no se anotó la caja % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace function retail.trg_actividad_caja_movimientos() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    perform retail.fn_actividad_caja_movimiento(new.id);
  exception when others then
    raise warning 'actividad: no se anotó el movimiento de caja % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace function retail.trg_actividad_caja_traslados() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    perform retail.fn_actividad_caja_traslado(new.id);
  exception when others then
    raise warning 'actividad: no se anotó el traslado de caja % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace function retail.trg_actividad_cambios() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    perform retail.fn_actividad_cambio(new.id);
  exception when others then
    raise warning 'actividad: no se anotó el cambio % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

-- La venta se anota al CONFIRMAR (disparador de restricción diferido): la cabecera se guarda antes que sus prendas y su
-- comprobante. `create or replace` no existe para estos disparadores, así que se crea solo si falta (nunca `drop trigger`,
-- que en Supabase toma las tablas de auth/storage: CLAUDE.md).
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_actividad_venta_nueva' and tgrelid = 'retail.ventas'::regclass) then
    create constraint trigger trg_actividad_venta_nueva
      after insert on retail.ventas
      deferrable initially deferred
      for each row execute function retail.trg_actividad_ventas();
  end if;
end $$;

create or replace trigger trg_actividad_venta_anulada
  after update of estado on retail.ventas
  for each row execute function retail.trg_actividad_ventas();

create or replace trigger trg_actividad_cajas
  after insert or update of estado, apertura_revisada_por on retail.cajas
  for each row execute function retail.trg_actividad_cajas();

create or replace trigger trg_actividad_caja_movimientos
  after insert on retail.caja_movimientos
  for each row execute function retail.trg_actividad_caja_movimientos();

create or replace trigger trg_actividad_caja_traslados
  after insert on retail.caja_traslados
  for each row execute function retail.trg_actividad_caja_traslados();

create or replace trigger trg_actividad_cambios
  after insert on retail.cambios
  for each row execute function retail.trg_actividad_cambios();

-- ---------- 7. Leer ----------
-- CONTRATO. Promete: la actividad que la cuenta puede ver, lo más nuevo primero, de a `p_limite` filas (máx. 200).
-- El Líder (y el Admin, que es Líder) ve todas las sedes y filtra con `p_ubicacion_id` (vacío = todas). Cualquier otra
-- cuenta con el módulo «Actividad» ve SOLO su sede, pida lo que pida. Una terminal, nunca. Para la siguiente página se
-- pasa la hora y el id de la última fila recibida (`p_antes_at`, `p_antes_id`).
create or replace function retail.fn_actividad(
  p_modulo text default null,
  p_ubicacion_id uuid default null,
  p_persona_id uuid default null,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_antes_at timestamptz default null,
  p_antes_id bigint default null,
  p_limite integer default 50
) returns table (
  id bigint, ocurrio_at timestamptz, modulo text, accion text, descripcion text,
  persona_id uuid, persona_nombre text, terminal_nombre text,
  ubicacion_id uuid, ubicacion_nombre text, ubicacion_destino_nombre text,
  tabla text, registro_id text, detalle jsonb, origen text
)
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
declare
  v_ubicacion uuid := p_ubicacion_id;
begin
  if exists (select 1 from retail.fn_terminal_actual() t where t.id is not null) then
    raise exception 'La actividad no se ve desde una terminal' using errcode = '42501';
  end if;
  if not retail.fn_ve_modulo('actividad') then
    raise exception 'No tienes acceso a la actividad' using errcode = '42501';
  end if;
  if not retail.fn_es_lider() then
    v_ubicacion := retail.fn_ubicacion_actual_persona();
    if v_ubicacion is null then
      raise exception 'No tienes una tienda asignada' using errcode = '42501';
    end if;
  end if;

  return query
  select a.id, a.ocurrio_at, a.modulo, a.accion, a.descripcion,
         a.persona_id, nullif(btrim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), ''), t.nombre,
         a.ubicacion_id, u.nombre, ud.nombre,
         a.tabla, a.registro_id, a.detalle, a.origen
    from retail.actividad a
    left join public.personas p on p.id = a.persona_id
    left join retail.terminales t on t.id = a.terminal_id
    left join retail.ubicaciones u on u.id = a.ubicacion_id
    left join retail.ubicaciones ud on ud.id = a.ubicacion_destino_id
   where (v_ubicacion is null or a.ubicacion_id = v_ubicacion or a.ubicacion_destino_id = v_ubicacion)
     and (p_modulo is null or a.modulo = p_modulo)
     and (p_persona_id is null or a.persona_id = p_persona_id)
     and (p_desde is null or a.ocurrio_at >= p_desde)
     and (p_hasta is null or a.ocurrio_at < p_hasta)
     and (p_antes_at is null or (a.ocurrio_at, a.id) < (p_antes_at, coalesce(p_antes_id, 9223372036854775807)))
   order by a.ocurrio_at desc, a.id desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200);
end;
$fn$;

comment on function retail.fn_actividad(text, uuid, uuid, timestamptz, timestamptz, timestamptz, bigint, integer) is
  'ADR-0207: la actividad que ve la cuenta. Líder: todas las sedes (o la pedida). Con el módulo Actividad: solo su sede. Terminal: nunca.';

-- Quiénes tienen actividad en lo que la cuenta ve (para el filtro «Persona»), con las mismas reglas de alcance.
create or replace function retail.fn_actividad_personas(p_ubicacion_id uuid default null, p_modulo text default null)
returns table (persona_id uuid, nombre text, ultima_at timestamptz)
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
declare
  v_ubicacion uuid := p_ubicacion_id;
begin
  if exists (select 1 from retail.fn_terminal_actual() t where t.id is not null) or not retail.fn_ve_modulo('actividad') then
    raise exception 'No tienes acceso a la actividad' using errcode = '42501';
  end if;
  if not retail.fn_es_lider() then
    v_ubicacion := retail.fn_ubicacion_actual_persona();
  end if;
  return query
  select a.persona_id, btrim(coalesce(p.nombres, '') || ' ' || coalesce(p.apellidos, '')), max(a.ocurrio_at)
    from retail.actividad a
    join public.personas p on p.id = a.persona_id
   where (v_ubicacion is null or a.ubicacion_id = v_ubicacion or a.ubicacion_destino_id = v_ubicacion)
     and (p_modulo is null or a.modulo = p_modulo)
   group by a.persona_id, p.nombres, p.apellidos
   order by 2;
end;
$fn$;

-- ---------- 8. Permisos ----------
-- Anotar es SOLO de los disparadores: nadie puede llamar estas funciones desde la web para inventar una línea.
revoke all on function retail.fn_actividad_inmutable() from public, anon, authenticated;
revoke all on function retail.fn_actividad_anotar(text, text, text, uuid, uuid, uuid, uuid, text, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_venta_registrada(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_venta_anulada(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_caja_abierta(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_caja_cerrada(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_apertura_revisada(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_caja_movimiento(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_caja_traslado(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_cambio(uuid, text) from public, anon, authenticated;
revoke all on function retail.trg_actividad_ventas() from public, anon, authenticated;
revoke all on function retail.trg_actividad_cajas() from public, anon, authenticated;
revoke all on function retail.trg_actividad_caja_movimientos() from public, anon, authenticated;
revoke all on function retail.trg_actividad_caja_traslados() from public, anon, authenticated;
revoke all on function retail.trg_actividad_cambios() from public, anon, authenticated;
revoke all on function retail.fn_actividad_prenda(uuid) from public, anon, authenticated;

revoke all on function retail.fn_actividad(text, uuid, uuid, timestamptz, timestamptz, timestamptz, bigint, integer) from public, anon;
grant execute on function retail.fn_actividad(text, uuid, uuid, timestamptz, timestamptz, timestamptz, bigint, integer) to authenticated;
revoke all on function retail.fn_actividad_personas(uuid, text) from public, anon;
grant execute on function retail.fn_actividad_personas(uuid, text) to authenticated;

-- ---------- 9. Lo que ya pasó (Felipe, 2026-09-25: «cárgalo») ----------
-- Desde las firmas que ya existen, con la hora de cada operación. Re-ejecutable: `fn_actividad_anotar` no repite.
do $$
declare
  r record;
begin
  for r in select id from retail.ventas order by created_at loop
    perform retail.fn_actividad_venta_registrada(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.ventas where estado = 'anulada' order by anulado_en loop
    perform retail.fn_actividad_venta_anulada(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.cajas order by abierta_en loop
    perform retail.fn_actividad_caja_abierta(r.id, 'carga_inicial');
    perform retail.fn_actividad_caja_cerrada(r.id, 'carga_inicial');
    perform retail.fn_actividad_apertura_revisada(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.caja_movimientos order by created_at loop
    perform retail.fn_actividad_caja_movimiento(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.caja_traslados order by creado_en loop
    perform retail.fn_actividad_caja_traslado(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.cambios order by created_at loop
    perform retail.fn_actividad_cambio(r.id, 'carga_inicial');
  end loop;
end $$;
