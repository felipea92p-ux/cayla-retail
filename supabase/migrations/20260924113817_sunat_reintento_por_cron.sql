-- ============================================================================
-- 20260924113817_sunat_reintento_por_cron.sql — CAYLA V2
--
-- PL-113 (acta de la Sesión 4 del plano maestro, 2026-09-23): «un trabajo programado (Vercel Cron) cada
-- 5-10 minutos reintenta todo comprobante pendiente, apoyado en el token de idempotencia ya existente. Si
-- sigue sin transmitirse pasadas varias horas, deja de reintentar solo y dispara el aviso al líder» (PL-114).
--
-- EL PROBLEMA. El reintento de D-60 (`20260922193700`) solo corre cuando alguien tiene una pantalla abierta
-- (Vender tras cobrar, Comprobantes al abrir). Una caída de Lucode a las 21:00 con la tienda cerrada deja la
-- cola quieta hasta el día siguiente. El trabajo programado (`GET /api/lucode/reintentar`, cron de
-- `apps/web/vercel.json`) no trae la sesión de nadie: entra con la llave de servicio, y las tres funciones
-- que usa preguntaban por una persona (`fn_es_lider`, `fn_puede_operar_ubicacion`) — la llave de servicio no
-- es nadie y las tres la rechazaban.
--
-- QUÉ CAMBIA (tres `create or replace` con la misma firma: ningún llamador cambia, no nace otra sobrecarga)
--   · `fn_tomar_comprobantes_para_reintento`: acepta a la llave de servicio y, SOLO para ella, toma lo emitido
--     en las últimas 4 horas. Pasado eso el trabajo programado lo suelta (PL-113) y el Inicio del líder lo
--     avisa (PL-114): `HORAS_REINTENTO_AUTOMATICO` en `apps/web/lib/transmision-reglas.ts` es el MISMO número
--     — cambiar los dos juntos. Los barridos del navegador quedan como estaban (un pendiente, hasta 3 días):
--     van atados a alguien con la pantalla abierta, y el líder que entra a Comprobantes por el aviso necesita
--     que su barrido todavía lo intente.
--     El «token de idempotencia» es la reserva de siempre: `for update skip locked` + `proximo_reintento_at`
--     +5 min en la MISMA operación, compartida por el trabajo programado y los barridos — dos pasadas a la
--     vez nunca mandan el mismo comprobante.
--   · `fn_marcar_reintento_transmision` y `actualizar_transmision_comprobante`: su candado de sede deja pasar
--     a la llave de servicio. Nada más cambia en ellas (mismas guardas de estado).
--   · `grant execute … to service_role` en las tres (hasta hoy solo `authenticated`).
--
-- POR QUÉ LA LLAVE DE SERVICIO Y NO UNA «PERSONA DE SISTEMA». La llave de servicio ya salta RLS y tiene
-- `grant all` sobre las tablas de `retail` (0005): dejarla pasar por estas tres funciones no le da nada que
-- no tuviera; sí la obliga a escribir por la misma función que la pantalla, con sus guardas, en vez de un
-- UPDATE directo. `auth.role()` sale del JWT que arma el gateway de Supabase: una sesión de persona no puede
-- decir que es `service_role`. Se compara con `is not distinct from` y no con `=`: sin claims (psql directo)
-- `auth.role()` es null y un `not (null or false)` es null — el IF no lanzaría y el candado quedaría abierto.
--
-- LO QUE NO TOCA. Las 2 boletas de PL-116 (B004-000004 S/655.50 y B004-000005 S/185.30) ya no existen en
-- producción (consultado 2026-09-23: la serie B004 del 1 al 8 solo tiene el 2 y el 3, aceptado y anulado); y
-- aunque volvieran, son del 14/15-sep: la ventana de 4 horas deja fuera cualquier pendiente viejo. Si se
-- transmite al sandbox o a SUNAT real lo decide la ruta (`LUCODE_ENTORNO`), no la base: hoy el trabajo
-- programado se niega a transmitir fuera del sandbox.
--
-- SE ROMPE SI la llave de servicio llega a un navegador (`lib/supabase-admin.ts` es `server-only`, y la
-- variable no lleva `NEXT_PUBLIC_`).
--
-- PEGAR EN PRODUCCIÓN: ya lleva el prefijo `retail.` en cada objeto. Huellas (md5 de pg_get_functiondef)
-- ANTES, leídas en producción el 2026-09-23: fn_tomar_comprobantes_para_reintento 344aa75b…,
-- fn_marcar_reintento_transmision e2317ab9…, actualizar_transmision_comprobante 50c5eb98….
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. fn_tomar_comprobantes_para_reintento ----------
create or replace function retail.fn_tomar_comprobantes_para_reintento(
  p_ubicacion_id uuid default null,
  p_limite integer default 5
)
returns setof uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  -- El trabajo programado (PL-113) entra con la llave de servicio: no es ninguna persona.
  v_cron boolean := auth.role() is not distinct from 'service_role';
begin
  if p_ubicacion_id is null then
    if not (v_cron or fn_es_lider()) then
      raise exception 'Solo un líder puede reintentar los comprobantes de todas las sedes';
    end if;
  elsif not (v_cron or fn_puede_operar_ubicacion(p_ubicacion_id)) then
    raise exception 'No tienes permiso para operar esa ubicación';
  end if;

  return query
    with tomados as (
      select c.id
        from comprobantes c
        left join ventas v on v.id = c.venta_id
       where (p_ubicacion_id is null or c.ubicacion_id = p_ubicacion_id)
         and (v.id is null or v.estado <> 'anulada')
         -- PL-113: el trabajo programado suelta lo que lleva 4 horas sin llegar; desde ahí avisa el Inicio del líder.
         and (not v_cron or c.created_at > now() - interval '4 hours')
         and (
           (c.estado = 'pendiente_reintento' and coalesce(c.proximo_reintento_at, now()) <= now())
           or (c.estado = 'pendiente' and c.created_at < now() - interval '2 minutes'
               and c.created_at > now() - interval '3 days'
               and coalesce(c.proximo_reintento_at, now()) <= now())
         )
       order by c.created_at
       limit greatest(1, least(p_limite, 20))
       for update of c skip locked
    )
    update comprobantes c
       set proximo_reintento_at = now() + interval '5 minutes'
      from tomados t
     where c.id = t.id
    returning c.id;
end;
$$;

revoke all on function retail.fn_tomar_comprobantes_para_reintento(uuid, integer) from public;
grant execute on function retail.fn_tomar_comprobantes_para_reintento(uuid, integer) to authenticated, service_role;

-- ---------- 2. fn_marcar_reintento_transmision ----------
create or replace function retail.fn_marcar_reintento_transmision(p_comprobante_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion_id uuid;
  v_estado text;
  v_intentos integer;
begin
  select ubicacion_id, estado, intentos_transmision
    into v_ubicacion_id, v_estado, v_intentos
    from comprobantes where id = p_comprobante_id
    for update;
  if not found then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  -- PL-113: el trabajo programado (llave de servicio) también anota sus intentos fallidos.
  if not (auth.role() is not distinct from 'service_role' or fn_puede_operar_ubicacion(v_ubicacion_id)) then
    raise exception 'No tienes permiso para operar ese comprobante';
  end if;
  -- Solo se puede encolar lo que todavía no llegó a un estado final ante SUNAT: un
  -- 'enviado'/'aceptado'/'rechazado'/'anulado'/'no_emitido' NO se pisa (evita que una
  -- respuesta tardía de Lucode que SÍ llegó bien quede sobrescrita por un timeout que
  -- llegó después en el reintento).
  if v_estado not in ('pendiente', 'pendiente_reintento') then
    raise exception 'Este comprobante ya está en estado "%" — no se puede encolar para reintento', v_estado;
  end if;

  update comprobantes set
    estado = 'pendiente_reintento',
    intentos_transmision = v_intentos + 1,
    ultimo_intento_transmision_at = now(),
    ultimo_error_transmision = nullif(btrim(coalesce(p_error, '')), ''),
    -- Backoff simple: 15 minutos por intento, tope de 2 horas — evita machacar a Lucode en
    -- una caída larga sin necesitar una tabla de configuración para esto todavía.
    proximo_reintento_at = now() + least((v_intentos + 1) * interval '15 minutes', interval '2 hours')
  where id = p_comprobante_id;
end;
$$;

grant execute on function retail.fn_marcar_reintento_transmision(uuid, text) to authenticated, service_role;

-- ---------- 3. actualizar_transmision_comprobante ----------
create or replace function retail.actualizar_transmision_comprobante(
  p_comprobante_id uuid, p_estado text, p_entorno text,
  p_respuesta_sunat jsonb default null, p_motivo_rechazo text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_ubicacion_id uuid;
begin
  select ubicacion_id into v_ubicacion_id from comprobantes where id = p_comprobante_id;
  if not found then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  -- PL-113: el trabajo programado (llave de servicio) guarda lo que respondió Lucode, igual que la pantalla.
  if not (auth.role() is not distinct from 'service_role' or fn_puede_operar_ubicacion(v_ubicacion_id)) then
    raise exception 'No tienes permiso para actualizar ese comprobante';
  end if;
  if p_estado not in ('enviado', 'aceptado', 'rechazado') then
    raise exception 'actualizar_transmision_comprobante no maneja el estado % — anular_comprobante() es aparte', p_estado;
  end if;
  update comprobantes set
    estado = p_estado,
    entorno_transmision = p_entorno,
    respuesta_sunat = coalesce(p_respuesta_sunat, respuesta_sunat),
    motivo_rechazo = p_motivo_rechazo,
    enviado_at = coalesce(enviado_at, now())
  where id = p_comprobante_id;
end;
$$;

grant execute on function retail.actualizar_transmision_comprobante(uuid, text, text, jsonb, text) to authenticated, service_role;
