-- ============================================================================
-- 20260922180000_devoluciones_motivo_estructurado.sql — CAYLA V2
--
-- «MOTIVO DEL CAMBIO/DEVOLUCIÓN EN 1 TOQUE» PARA DEVOLUCIONES.
--
-- QUÉ DECIDE. D-79, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`: «al cambiar o
-- devolver, motivo obligatorio (talla, calce, defecto, no le gustó, regalo) → "calce por
-- prenda" para revisar con el Taller». Esta migración cierra la mitad que faltaba:
-- `retail.cambios` YA tiene un motivo obligatorio de lista cerrada desde
-- 20260919000100_cambios_motivo_y_estado_de_prenda.sql (aplicada en producción el
-- 2026-09-19; vocabulario propio — talla_chica/talla_grande/otro_color/defecto/otro,
-- pensado para saber hacia qué lado ajustar el patrón). `retail.devoluciones` seguía sin
-- columna estructurada: `crear_devolucion(p_motivo text)` guardaba texto libre compuesto en
-- la pantalla («Tiene un defecto — costura abierta en la manga»), agrupable por `motivo`
-- solo cuando nadie escribía un detalle. BACKLOG.md ya lo tenía anotado como pendiente:
-- «`devoluciones.motivo_codigo` estructurado (...) esperar a fusionar la migración de venta
-- anulada para no tocar `crear_devolucion` en paralelo» — esa migración
-- (20260918163712_devolucion_rechaza_venta_anulada, de otra sesión) no está en `origin/main`
-- al momento de escribir esto (verificado 2026-09-22), así que no hay colisión que esperar.
--
-- QUIÉN Y CUÁNDO. Ronda de las 60 preguntas de Felipe, decisión D-79 (2026-09-21); esta
-- migración, agente de la tanda de ejecución (D-88), 2026-09-22.
--
-- QUÉ CAMBIA.
--   1. `devoluciones.motivo_codigo` — lista cerrada: talla, calce, defecto, no_le_gusto,
--      regalo, otro. Columna NULLABLE (las devoluciones de antes de hoy no lo tienen: no se
--      inventa un motivo que nadie contó — mismo criterio que `cambios.motivo`), pero la
--      función que la llena ya no acepta null: `p_motivo_codigo` es obligatorio, sin default,
--      porque este archivo actualiza también al único punto que llama `crear_devolucion`
--      (`DevolucionesFlujo.tsx`) en el mismo cambio.
--   2. `crear_devolucion` gana el parámetro `p_motivo_codigo text` (candado en la función,
--      no solo en la pantalla — principio 2 de este repo). La columna `motivo` (texto libre)
--      NO se toca: sigue existiendo para lo que la clienta cuenta de más («costura abierta en
--      la manga»), la sigue usando `rechazar_devolucion` para anotar el rechazo, y la sigue
--      leyendo `DevolucionesPendientes.tsx`. Este archivo no rediseña esa lectura.
--
-- QUÉ SE CONSERVA. El candado de ubicación (`fn_puede_operar_ubicacion`) sigue siendo la
-- PRIMERA verificación de la función, antes de mirar el motivo o los ítems — igual que ya
-- estaba. El resto del cuerpo de `crear_devolucion` es idéntico al de
-- `supabase/migrations/0003_funciones.sql` (única definición existente: sin sobrecargas que
-- coordinar, a diferencia de `aprobar_devolucion`, que sí tiene varias versiones en el
-- historial).
--
-- QUIÉN DEJA DE PODER HACER QUÉ. Nadie pierde una operación que hacía: una devolución sin
-- motivo_codigo simplemente deja de poder registrarse (antes tampoco se podía registrar sin
-- el motivo de texto libre — la pantalla ya lo exigía; ahora también lo exige la base).
--
-- LO QUE ESTE CAMBIO **NO** HACE, A PROPÓSITO (D-79 lo pide explícito, y Felipe lo prohibió
-- para esta tarea): el motivo del cambio o la devolución **no se usa en ningún cálculo de
-- ranking, puntaje o comparación entre asesoras** — es un dato para revisar el calce por
-- prenda CON EL TALLER, nunca para medir personas. Ni esta migración ni el código que la
-- acompaña agregan un `group by` ni una vista por colaboradora sobre esta columna.
--
-- POR QUÉ `cambios.motivo` NO SE TOCA AQUÍ (objeción explícita, no un olvido). Unificar los
-- dos vocabularios en uno solo («una sola mente») sería más consistente, pero costaría: (a)
-- redefinir un `check` que ya está activo en producción sobre una función que Felipe todavía
-- no verificó con una sesión real de punta a punta (BACKLOG.md, sección Cambios: «Verificar
-- con sesión real»); (b) perder la distinción talla_chica/talla_grande, que hoy le dice al
-- Taller hacia qué lado corregir el patrón — más información que la «talla» plana de D-79, no
-- menos; (c) rediseñar los chips ya construidos y documentados en ADR-0125
-- (`CambioReemplazo.tsx`). Nada de eso lo pide esta tarea, y tocar una función en producción
-- sin necesidad real viola el principio 12 (causa raíz, no parches por parchar). Queda en
-- BACKLOG como decisión de Felipe: ¿unificar el vocabulario de Cambios y Devoluciones antes
-- de construir el reporte de «calce por prenda» que cruce los dos, o mantenerlos separados
-- porque miden cosas distintas (una prenda que se cambia sigue en la tienda; una que se
-- devuelve, no)?
--
-- SE ROMPE SI: se despliega el código nuevo (que manda `p_motivo_codigo`) ANTES que esta
-- migración — `crear_devolucion` de 4 parámetros no seguiría existiendo con ese nombre de
-- parámetro y PostgREST respondería «could not find function». Orden de despliegue: esta
-- migración primero, el front después (mismo orden que documentó 20260919000100 para
-- Cambios). O si alguien construye el reporte de «calce por prenda» agrupando por asesora en
-- vez de por prenda/motivo — eso es exactamente lo que este archivo prohíbe.
--
-- Este archivo ya trae el prefijo `retail.` en los nombres de función y su `search_path`,
-- igual que los demás desde 20260920: se pega entero en el SQL Editor de producción (con el
-- ok de Felipe — este agente NO lo aplica).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. devoluciones.motivo_codigo: lista cerrada (D-79) ----------
alter table retail.devoluciones add column if not exists motivo_codigo text;
comment on column retail.devoluciones.motivo_codigo is
  'Por qué se devuelve la prenda (lista cerrada, D-79): talla, calce, defecto, no_le_gusto, regalo, otro. Null solo en devoluciones anteriores a esta migración. NUNCA usar para rankear, puntuar ni comparar asesoras — es un dato para revisar el calce por prenda con el Taller. La columna motivo (texto libre) sigue existiendo aparte, para el detalle que cuenta la clienta.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'devoluciones_motivo_codigo_check') then
    alter table retail.devoluciones add constraint devoluciones_motivo_codigo_check
      check (motivo_codigo is null or motivo_codigo in ('talla', 'calce', 'defecto', 'no_le_gusto', 'regalo', 'otro'));
  end if;
end $$;

-- ---------- 2. crear_devolucion: motivo_codigo obligatorio, sin default ----------
-- `create or replace` NO alcanza (mismo bug que documentó 20260919000100 para
-- `registrar_cambio`, verificado acá de nuevo con un Postgres desechable: agregar un
-- parámetro al final, aunque sea uno solo, cambia `proargtypes` y Postgres crea una SEGUNDA
-- sobrecarga en vez de reemplazar — quedaban las dos, la de 4 parámetros seguía viva). Va
-- drop + create.
drop function if exists retail.crear_devolucion(uuid, uuid, jsonb, text);
create or replace function retail.crear_devolucion(
  p_venta_id uuid, p_ubicacion_id uuid, p_items jsonb, p_motivo text, p_motivo_codigo text
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_devolucion_id uuid; v_item jsonb; v_venta_item venta_items%rowtype;
  v_ya_devuelto integer; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para registrar devoluciones en esa ubicación';
  end if;

  -- Nuevo (D-79): candado en la base, no solo en la pantalla — mismo criterio que
  -- `registrar_cambio` usa para su propio `p_motivo` desde 20260919000100.
  if p_motivo_codigo is null or p_motivo_codigo not in ('talla', 'calce', 'defecto', 'no_le_gusto', 'regalo', 'otro') then
    raise exception 'Motivo de la devolución desconocido: %', p_motivo_codigo;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una devolución necesita al menos un ítem';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into devoluciones (venta_id, ubicacion_id, motivo, motivo_codigo, solicitado_por)
    values (p_venta_id, p_ubicacion_id, p_motivo, p_motivo_codigo, v_persona)
    returning id into v_devolucion_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_venta_item from venta_items
      where id = (v_item ->> 'venta_item_id')::uuid and venta_id = p_venta_id;
    if not found then
      raise exception 'El ítem % no pertenece a la venta %', v_item ->> 'venta_item_id', p_venta_id;
    end if;

    select coalesce(sum(di.cantidad), 0) into v_ya_devuelto
      from devolucion_items di join devoluciones d on d.id = di.devolucion_id
      where di.venta_item_id = v_venta_item.id and d.estado <> 'rechazada';

    if v_ya_devuelto + (v_item ->> 'cantidad')::integer > v_venta_item.cantidad then
      raise exception 'Se pide devolver % pero la línea vendió % y ya se devolvieron %',
        (v_item ->> 'cantidad')::integer, v_venta_item.cantidad, v_ya_devuelto;
    end if;

    insert into devolucion_items (devolucion_id, venta_item_id, cantidad, condicion)
      values (v_devolucion_id, v_venta_item.id, (v_item ->> 'cantidad')::integer, v_item ->> 'condicion');
  end loop;

  return v_devolucion_id;
end;
$$;

-- `create or replace` le da EXECUTE a PUBLIC de nuevo (comportamiento de Postgres al crear
-- una función) — se revoca y se vuelve a dar solo a `authenticated`, igual que el resto de
-- funciones de escritura de este módulo (`registrar_cambio`, `aprobar_devolucion`).
revoke all on function retail.crear_devolucion(uuid, uuid, jsonb, text, text) from public;
grant execute on function retail.crear_devolucion(uuid, uuid, jsonb, text, text) to authenticated;
