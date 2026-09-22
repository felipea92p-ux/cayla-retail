-- ============================================================================
-- 20260922130000_archivar_datos_de_prueba.sql — CAYLA V2
--
-- «ARCHIVAR LOS DATOS DE PRUEBA DE PRODUCCIÓN SIN BORRAR NADA» — EN LA BASE.
--
-- QUÉ DECIDE D-54. `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`, D-54: en producción hay
-- ~14 boletas/ventas pendientes sin transmitir, 3 cajas abiertas y 3 conteos anulados que son
-- datos ficticios de prueba (confirmado por Felipe, dueño del sistema) — más algunos productos
-- de prueba (códigos BLU/PAN/VES). No son riesgo tributario. Antes de que Tienda TRU salga en
-- vivo esta semana con datos reales, tienen que dejar de mezclarse con la operación real, SIN
-- borrarse: `movimientos` está protegido contra DELETE por trigger
-- (20260914165703_movimientos_inmutables.sql) y el criterio del repo es el mismo para el resto
-- del historial — nada se borra, se archiva.
--
-- QUIÉN Y CUÁNDO. Felipe (dueño) el 2026-09-21, en la ronda de 60 preguntas.
--
-- QUÉ CAMBIA
--   1. `es_prueba boolean not null default false` en `productos`, `ventas`, `cajas` y
--      `conteos` — una columna nueva, no un valor más de `estado`: `estado` sigue significando
--      exactamente lo mismo que hoy (una venta «completada» de prueba sigue completada; una
--      caja «abierta» de prueba, hasta que se archive, sigue abierta). Mezclar «es de prueba»
--      dentro de `estado` habría obligado a cada función y cada pantalla que ya lee `estado` a
--      aprender un valor nuevo que no le importa.
--   2. Cuatro funciones para archivar, una por tabla (no una sola con el nombre de tabla como
--      parámetro): cada una tiene su propio candado de ubicación y, en `cajas`, un efecto
--      colateral que las otras tres no necesitan — un `text` genérico habría escondido esa
--      diferencia adentro de un `execute format(...)` en vez de nombrarla en la firma.
--        · `archivar_producto_prueba(uuid)`
--        · `archivar_venta_prueba(uuid)`
--        · `archivar_caja_prueba(uuid)`
--        · `archivar_conteo_prueba(uuid)`
--      Las cuatro: SECURITY DEFINER, `search_path` fijo, y el candado de líder (`fn_es_lider()`)
--      PRIMERO — antes de mirar si la fila existe, mismo patrón que `cerrar_caja`
--      (20260921120000): quien no es líder no averigua nada. `ventas`/`cajas`/`productos` no
--      necesitan más: sus RLS ya bloquean cualquier UPDATE que no pase por una función
--      SECURITY DEFINER (`ventas`/`cajas` no tienen policy de escritura; `productos_write_lider`
--      ya exige líder para CUALQUIER columna). `conteos` sí tiene una policy de escritura
--      amplia (`conteos_write`, para que una colaboradora pueda operar su conteo) — sin un
--      candado propio, esa misma policy habría dejado que una colaboradora marcara
--      `es_prueba` con un PATCH directo a la tabla, sin pasar por la función ni por un líder.
--      Punto 3 lo cierra con un trigger.
--   3. `conteos_es_prueba_solo_lider`: trigger BEFORE INSERT OR UPDATE en `conteos` que
--      rechaza cualquier cambio a `es_prueba` que no venga de un líder — el mismo candado que
--      la función, pero puesto en la tabla, no solo en la función, porque en esta tabla (a
--      diferencia de ventas/cajas/productos) SÍ hay otro camino de escritura.
--   4. `archivar_caja_prueba`: si la caja sigue `abierta`, la cierra ANTES de archivarla,
--      llamando a `cerrar_caja(id, monto_apertura)` — la misma función de un cierre real, no
--      una copia de su fórmula — y corrige «contado»/«diferencia» con lo que esa misma llamada
--      YA calculó como esperado: un cierre administrativo tiene diferencia CERO por definición
--      (nadie contó billetes de una caja que nunca existió). Ver «SE ROMPE SI» por qué el cierre
--      en sí no es opcional.
--   5. `archivar_conteo_prueba`: si el conteo sigue `abierto`, RECHAZA archivarlo (usa
--      `anular_conteo`/`cerrar_conteo` primero) — mismo motivo que el punto 4, pero como
--      candado en vez de acción automática: un conteo abierto normalmente lo cierra quien lo
--      contó, no algo que esta función deba decidir por su cuenta.
--
-- QUÉ SE CONSERVA. `estado` en las cuatro tablas sigue significando lo mismo para toda función
-- y pantalla que ya lo lee; el candado de ubicación (`fn_puede_operar_ubicacion`) sigue después
-- del de líder, igual que en `cerrar_caja`/`registrar_movimiento`.
--
-- QUIÉN DEJA DE PODER HACER QUÉ. Un colaborador (rol `colaborador`) no podía archivar antes y
-- sigue sin poder — ninguna pantalla llama estas funciones todavía (el archivado de HOY es el
-- script `pegar-en-produccion-archivar-datos-prueba-2026-09.sql`, aparte, que Felipe aprueba
-- antes de que alguien lo pegue). Lo nuevo es que una colaboradora que antes SÍ podía mover
-- `conteos.estado`/`cerrado_en` vía `conteos_write` (para operar su propio conteo) ya NO puede
-- tocar `conteos.es_prueba` por ese mismo camino: el trigger se lo bloquea aunque sea su sede.
--
-- LO MÁS IMPORTANTE QUE D-54 NO PIDIÓ EXPLÍCITAMENTE, Y POR QUÉ VA ACÁ. Marcar una caja de
-- prueba como `es_prueba = true` sin cerrarla NO resuelve el problema real: hay un índice único
-- —`cajas_ubicacion_abierta_unica` (0008_caja_y_pagos.sql), «nunca dos cajas abiertas a la vez
-- en la misma ubicación»— y mientras la caja de prueba de Tienda TRU siga `abierta`, NADIE va a
-- poder abrir la caja REAL el día que TRU salga en vivo (`abrir_caja` chocaría con ese índice).
-- Peor: hasta que alguien lo note, `getCajaAbierta()` (`apps/web/lib/caja.ts`) le mostraría a
-- quien abra `/caja` en TRU el tablero de la caja de PRUEBA, y una venta real terminaría
-- atribuida a ella. Por eso `archivar_caja_prueba` CIERRA la caja (si sigue abierta) como parte
-- de archivarla, no solo la marca.
--
-- SE ROMPE SI
--   · Se pega el script de producción (punto 3 de la tarea) ANTES que esta migración: las
--     funciones no existen todavía y el script fallaría en la primera línea. Orden: esta
--     migración primero, el script de datos después.
--   · Alguien llama `archivar_caja_prueba` sobre una caja `abierta` que en realidad SÍ es real
--     (no de prueba): la cierra igual, con diferencia CERO forzada — y esa cifra sí sería una
--     mentira contable (una caja real casi nunca cuadra en cero exacto). Por diseño no hay forma
--     de que la función lo sepa — por eso el candado es «solo líder», no «cualquiera», y por eso
--     el script de producción del punto 3 nombra los 3 IDs exactos, uno por uno, nunca "todas
--     las abiertas".
--
-- Re-ejecutable (`create or replace` + `add column if not exists` + `drop trigger if exists`).
-- Prefijo `retail.` SOLO al pegar en el SQL Editor de producción — no en este archivo (ver
-- CLAUDE.md, «Cómo aplicar SQL a producción»).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. la columna nueva, en las cuatro tablas ----------
alter table productos add column if not exists es_prueba boolean not null default false;
alter table ventas add column if not exists es_prueba boolean not null default false;
alter table cajas add column if not exists es_prueba boolean not null default false;
alter table conteos add column if not exists es_prueba boolean not null default false;

comment on column productos.es_prueba is 'Dato ficticio de prueba (D-54): nunca se borra, se excluye de las pantallas por defecto. No es "descontinuado" — un producto real descontinuado sigue siendo un producto real.';
comment on column ventas.es_prueba is 'Dato ficticio de prueba (D-54): nunca se borra, se excluye del historial por defecto.';
comment on column cajas.es_prueba is 'Dato ficticio de prueba (D-54): nunca se borra, se excluye del historial de cierres por defecto.';
comment on column conteos.es_prueba is 'Dato ficticio de prueba (D-54): nunca se borra, se excluye de las listas por defecto.';

-- ---------- 2. archivar_producto_prueba: solo líder ----------
create or replace function archivar_producto_prueba(p_producto_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede archivar un dato de prueba' using errcode = '42501';
  end if;

  if not exists (select 1 from productos where id = p_producto_id) then
    raise exception 'El producto % no existe', p_producto_id;
  end if;

  update productos set es_prueba = true where id = p_producto_id;
end;
$$;

-- ---------- 3. archivar_venta_prueba: solo líder ----------
create or replace function archivar_venta_prueba(p_venta_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta ventas%rowtype;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede archivar un dato de prueba' using errcode = '42501';
  end if;

  select * into v_venta from ventas where id = p_venta_id;
  if not found then
    raise exception 'La venta % no existe', p_venta_id;
  end if;
  if not fn_puede_operar_ubicacion(v_venta.ubicacion_id) then
    raise exception 'No tienes permiso para archivar esa venta';
  end if;

  update ventas set es_prueba = true where id = p_venta_id;
end;
$$;

-- ---------- 4. archivar_caja_prueba: solo líder — cierra la caja si sigue abierta ----------
create or replace function archivar_caja_prueba(p_caja_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_caja cajas%rowtype;
  v_sistema numeric;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede archivar un dato de prueba' using errcode = '42501';
  end if;

  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para archivar esa caja';
  end if;

  -- Una caja «abierta» archivada sin cerrarse sigue bloqueando el índice único de la
  -- ubicación (0008_caja_y_pagos.sql): nadie podría abrir la caja REAL de esa sede. Se
  -- cierra con la MISMA función que un cierre real —reutiliza su cálculo del efectivo
  -- esperado en vez de duplicarlo— y luego se corrige «contado» para que quede igual al
  -- esperado: un cierre administrativo tiene diferencia CERO por definición (no hay nadie
  -- contando billetes de una caja que nunca existió). El primer argumento de `cerrar_caja`
  -- es solo el «contado» que dispara el cálculo; `v_sistema` es lo que la función misma
  -- devuelve haber calculado, no un número inventado acá.
  if v_caja.estado = 'abierta' then
    select monto_sistema into v_sistema from cerrar_caja(p_caja_id, v_caja.monto_apertura);
    update cajas set monto_cierre_real = v_sistema, diferencia = 0 where id = p_caja_id;
  end if;

  update cajas
  set es_prueba = true,
      nota = case
        when nota is null or nota = '' then 'Archivada como dato de prueba (D-54).'
        else nota || ' — Archivada como dato de prueba (D-54).'
      end
  where id = p_caja_id;
end;
$$;

-- ---------- 5. archivar_conteo_prueba: solo líder — rechaza un conteo todavía abierto ----------
create or replace function archivar_conteo_prueba(p_conteo_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_conteo conteos%rowtype;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder de equipo puede archivar un dato de prueba' using errcode = '42501';
  end if;

  select * into v_conteo from conteos where id = p_conteo_id;
  if not found then
    raise exception 'El conteo % no existe', p_conteo_id;
  end if;
  if not fn_puede_operar_ubicacion(v_conteo.ubicacion_id) then
    raise exception 'No tienes permiso para archivar ese conteo';
  end if;

  -- Mismo motivo que la caja abierta (punto 4): un conteo «abierto» archivado sin cerrarse
  -- seguiría bloqueando el índice único de la ubicación (`conteos_un_abierto_por_ubicacion`).
  -- Acá no hay un "cierre administrativo" razonable —cerrar_conteo AJUSTA STOCK según lo
  -- contado, y no hay nada de verdad contado en un conteo de prueba—, así que se rechaza en
  -- vez de decidir por su cuenta: quien archive primero anula o cierra con la función normal.
  if v_conteo.estado = 'abierto' then
    raise exception 'No se puede archivar un conteo abierto — anúlalo con anular_conteo() primero' using errcode = '22023';
  end if;

  update conteos set es_prueba = true where id = p_conteo_id;
end;
$$;

-- ---------- 6. conteos: el candado también en la tabla, no solo en la función ----------
-- `conteos_write` (0004_rls.sql) deja escribir a cualquiera que opere la ubicación —correcto
-- para que una colaboradora lleve su propio conteo— pero sin este trigger esa misma policy
-- dejaría marcar `es_prueba` con un PATCH directo a la tabla, sin pasar por la función ni por
-- un líder. Mismo criterio que ADR-0143: el candado va en la base, no solo en el único camino
-- que hoy usa la pantalla.
create or replace function fn_conteos_es_prueba_solo_lider() returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if (tg_op = 'INSERT' and new.es_prueba) or (tg_op = 'UPDATE' and new.es_prueba is distinct from old.es_prueba) then
    if not fn_es_lider() then
      raise exception 'Solo un líder de equipo puede marcar un conteo como dato de prueba' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists conteos_es_prueba_solo_lider on conteos;
create trigger conteos_es_prueba_solo_lider
  before insert or update on conteos
  for each row execute function fn_conteos_es_prueba_solo_lider();

-- ---------- 7. permisos ----------
grant execute on function archivar_producto_prueba(uuid) to authenticated;
grant execute on function archivar_venta_prueba(uuid) to authenticated;
grant execute on function archivar_caja_prueba(uuid) to authenticated;
grant execute on function archivar_conteo_prueba(uuid) to authenticated;
