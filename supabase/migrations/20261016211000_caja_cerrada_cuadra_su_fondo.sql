-- ============================================================================
-- 20261016211000_caja_cerrada_cuadra_su_fondo.sql — CAYLA V2 (auditoría de Finanzas 2026-10-16, causa raíz G01)
--
-- EL PROBLEMA PRIMERO. Una caja cerrada guarda tres números que se pertenecen: lo que se contó (`monto_cierre_real`), lo que se
-- llevó a otro lado (las filas de `caja_traslados`) y lo que quedó en el cajón para el turno siguiente (`monto_fondo`). ADR-0186
-- dice que el fondo «se calcula, nunca se escribe» (contado − trasladado), y `cerrar_caja` lo cumple porque escribe los tres en
-- la misma función. Pero NADA en el esquema lo exigía: el 16-oct alguien regularizó a mano un traslado de S/ 700 de la caja de
-- Trujillo del 8-oct (insertó la fila en `caja_traslados`) sin tocar su `monto_fondo`, que se quedó en 977.20 en vez de 277.20.
-- Efecto en cadena: el cajón de Trujillo al 8-oct se infla en 700, la apertura del día siguiente (277.20) «faltó» 700 contra lo
-- esperado congelado (977.20) y el Diario asienta esa falta en la 6599 y la carga al Estado de resultados de octubre. Es la
-- única de 30 cajas reales que no cuadra, pero nada impedía la siguiente (principio 2: un estado imposible es un defecto del
-- esquema, no de quien teclea).
--
-- Segundo hilo, el mismo daño con otra puerta: `archivar_caja_prueba` marca una caja como de prueba pero no mira a la caja REAL
-- que abrió después. Esa caja congeló su `monto_apertura_esperado` cuando la de prueba todavía contaba como «el último cierre»
-- (en Arequipa: 0.00 en vez de los 300.00 que dejó la caja real anterior), y el Diario lee ese número congelado: anotó un
-- sobrante de 118.90 donde el Flujo —que sí salta las cajas de prueba— anota un faltante de 181.10. Dos lectores, dos verdades.
--
-- CÓMO. (1) Un candado DIFERIDO (se mira al confirmar la transacción, como una llave foránea) en `caja_traslados` y en `cajas`:
-- una caja cerrada real con fondo escrito debe cumplir contado = fondo + trasladado, o la transacción entera se rechaza con un
-- mensaje que dice qué corregir. Es diferido y se VUELVE A LEER la caja al confirmar (un disparador diferido recibe la fila del
-- momento del evento, no la última), así `cerrar_caja` —que escribe la caja y el traslado en el orden que quiera— no se entera.
-- (2) `archivar_caja_prueba` recalcula, con la misma regla que `abrir_caja`, lo esperado por la primera caja real posterior; si la
-- apertura ya no coincide y no traía motivo, deja uno (el candado `caja_apertura_explica_diferencia` lo exige).
-- No toca filas existentes: el relleno de las tres cajas de hoy es un script aparte, a pegar con el OK de Felipe
-- (`pegar-en-produccion-caja-fondo-2026-10.sql`).
-- Idempotente (create or replace; los disparadores solo se crean si faltan). Sin políticas y sin `drop trigger`: se puede pegar
-- entera (ver «Políticas y deadlocks»).
-- Verificado: `scripts/pruebas/caja_fondo_coherente.mjs`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ── 1. El candado ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function retail.fn_caja_cerrada_cuadra_su_fondo()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  v_ids uuid[];
  v_id uuid;
  v_caja retail.cajas%rowtype;
  v_trasladado numeric;
begin
  -- Qué caja(s) toca el evento. Un traslado movido de una caja a otra deja dos por mirar.
  if tg_table_name = 'caja_traslados' then
    if tg_op = 'DELETE' then
      v_ids := array[old.caja_id];
    elsif tg_op = 'INSERT' then
      v_ids := array[new.caja_id];
    else
      v_ids := array[old.caja_id, new.caja_id];
    end if;
  else
    v_ids := array[new.id];
  end if;

  foreach v_id in array v_ids loop
    -- Se lee de nuevo: al confirmar, la fila del evento puede ser una versión vieja de la caja.
    select * into v_caja from retail.cajas where id = v_id;
    if not found or v_caja.estado <> 'cerrada' or v_caja.es_prueba
       or v_caja.monto_fondo is null or v_caja.monto_cierre_real is null then
      continue;
    end if;

    select coalesce(sum(t.monto), 0) into v_trasladado from retail.caja_traslados t where t.caja_id = v_id;
    if abs(v_caja.monto_fondo + v_trasladado - v_caja.monto_cierre_real) >= 0.005 then
      raise exception 'La caja cerrada no cuadra: se contó S/ %, pero deja S/ % en el cajón y se trasladó S/ %. Si regularizas un traslado de una caja ya cerrada, corrige en la misma operación lo que dejó en el cajón (contado − trasladado) y lo esperado por la apertura siguiente.',
        to_char(v_caja.monto_cierre_real, 'FM999999990.00'), to_char(v_caja.monto_fondo, 'FM999999990.00'), to_char(v_trasladado, 'FM999999990.00')
        using errcode = 'P0001', hint = 'caja_fondo_incoherente';
    end if;
  end loop;
  return null;
end;
$f$;

comment on function retail.fn_caja_cerrada_cuadra_su_fondo() is
  'Candado diferido: una caja cerrada real con fondo escrito cumple contado = fondo + trasladado (ADR-0186). Auditoría de Finanzas 2026-10-16, G01.';

-- Un disparador de restricción no admite `create or replace` («CREATE OR REPLACE CONSTRAINT TRIGGER is not supported») y un
-- `drop trigger` toma en exclusiva las tablas de `auth` y `storage` del Supabase (ADR-0195): se crea solo si falta. Cambiar la
-- regla después es `create or replace function` arriba; los disparadores no se tocan.
do $t$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_caja_traslados_cuadra_su_fondo' and tgrelid = 'retail.caja_traslados'::regclass) then
    create constraint trigger trg_caja_traslados_cuadra_su_fondo
      after insert or update or delete on retail.caja_traslados
      deferrable initially deferred
      for each row execute function retail.fn_caja_cerrada_cuadra_su_fondo();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_cajas_cuadra_su_fondo' and tgrelid = 'retail.cajas'::regclass) then
    create constraint trigger trg_cajas_cuadra_su_fondo
      after update of monto_fondo, monto_cierre_real, estado, es_prueba on retail.cajas
      deferrable initially deferred
      for each row execute function retail.fn_caja_cerrada_cuadra_su_fondo();
  end if;
end;
$t$;

-- ── 2. Archivar una caja de prueba no deja a la siguiente esperando lo que ella dejó ────────────────────────────
create or replace function retail.archivar_caja_prueba(p_caja_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $f$
declare
  v_caja cajas%rowtype;
  v_sistema numeric;
  v_sig cajas%rowtype;
  v_esperado numeric;
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

  -- La caja real que abrió después congeló como «esperado» lo que dejó esta, cuando todavía contaba como último cierre.
  -- Se recalcula con la misma regla que `abrir_caja` (el fondo del último cierre REAL de la sede antes de abrir).
  select * into v_sig from cajas c
   where c.ubicacion_id = v_caja.ubicacion_id and not c.es_prueba and c.abierta_en > v_caja.abierta_en
   order by c.abierta_en
   limit 1;
  if found then
    select c.monto_fondo into v_esperado from cajas c
     where c.ubicacion_id = v_sig.ubicacion_id and c.estado = 'cerrada' and not c.es_prueba and c.cerrada_en <= v_sig.abierta_en
     order by c.cerrada_en desc
     limit 1;
    if v_esperado is distinct from v_sig.monto_apertura_esperado then
      update cajas
      set monto_apertura_esperado = v_esperado,
          motivo_diferencia_apertura = case
            when v_esperado is not null and abs(monto_apertura - v_esperado) >= 0.01
                 and length(btrim(coalesce(motivo_diferencia_apertura, ''))) < 3
              then 'Se archivó la caja de prueba anterior: lo esperado se recalculó.'
            else motivo_diferencia_apertura
          end
      where id = v_sig.id;
    end if;
  end if;
end;
$f$;
