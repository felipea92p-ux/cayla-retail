-- ============================================================================
-- 20261004230000_conteo_firma_arranque_columnas.sql — CAYLA V2 · Inventario ▸ Conteo I (ADR-0328, actividad 15)
-- PARTE 1 de 2: las columnas y sus candados. La parte 2 (20261004230100) trae las funciones que las usan.
--
-- EL PROBLEMA PRIMERO.
--   1. Firma. Desde una terminal, cerrar un conteo y recibir un traslado quedan SIN persona: ADR-0280 soltó esas acciones del
--      combo «Responsable» y la base las guarda con NULL. En producción, 9 de 12 conteos cerrados no dicen quién los cerró.
--      Felipe (2026-10-04): «si ya se colocó un nombre en el manejo de una operación no creo necesario estar pidiéndolo varias
--      veces». Para heredar el nombre hace falta saber quién firmó la operación y cuándo; el conteo lo sabe (`abierto_por`,
--      `created_at`), la recepción de un traslado no lo guarda en ningún lado.
--   2. Arranque. El primer conteo completo de una sede trae cientos de diferencias que son errores de la carga inicial, no
--      prendas perdidas. Hoy entran a Finanzas como merma (cuenta 659) y hunden la exactitud de Análisis.
--   3. Atajo. «Aplicar todos completos» anota lo que CAYLA espera en todas las pendientes «como si ya las hubieras contado»:
--      el conteo dice «todo correcto» sin que nadie haya mirado, y la exactitud sube sola.
--
-- QUÉ HACE (solo esquema; ninguna función cambia en esta parte):
--   · `transferencias.recepcion_firmada_por` / `recepcion_firmada_en`: la última persona que puso su nombre en la recepción
--     de ese traslado, y cuándo. La lee y la renueva cada paso de recibir (parte 2, `fn_firma_de_recepcion`).
--   · `conteos.es_arranque`: el conteo fue el de arranque de su tramo, contado entero y de verdad (sin pendientes y sin nada
--     «aplicado sin contar»). El tramo depende del lugar (Felipe, 2026-10-04): en el ALMACÉN (y en una ubicación sin piso ni
--     almacén aparte) es el lugar entero, así que solo un conteo de TODO puede serlo; en el PISO es cada CATEGORÍA, porque el
--     piso se cuenta por categorías a lo largo de la semana, así que un conteo de una categoría del piso es el arranque de esa
--     categoría. Y el cuadre del piso de la sede (`cuadres_piso`, ADR-0328 decisión técnica 4) reinicia todos los tramos de esa
--     sede. Lo escribe solo `cerrar_conteo` (parte 2), y una vez puesta la marca el tramo queda gastado aunque el conteo se
--     reabra o se cancele. `fn_arranque_por_categoria` (aquí abajo) es la ÚNICA definición de «en este lugar el arranque es por
--     categoría».
--   · `conteo_items.aplicada_sin_contar`: la cifra la puso «Aplicar todos completos» (lo que CAYLA esperaba), no una persona
--     que contó. La escribe solo `conteo_aplicar_completos` (parte 2); un disparador la apaga en cuanto la línea se vuelve a
--     verificar o se borra su cifra.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · una firma de recepción con persona y sin hora, o con hora y sin persona;
--   · un conteo de una sola categoría marcado «de arranque» fuera del piso (en el almacén el arranque es del lugar completo:
--     disparador `conteos_arranque_coherente`, que también cubre un conteo de una categoría de toda la ubicación);
--   · una línea «aplicada sin contar» sin cifra, o con una cifra distinta de lo que CAYLA esperaba: eso sería una diferencia,
--     y una diferencia solo la encuentra alguien que cuenta;
--   · una línea que se volvió a contar a mano y sigue marcada «sin contar» (el disparador la apaga en la misma escritura).
--
-- DESCARTÉ
--   · Guardar la firma de la recepción en cada línea (`transferencia_recepciones.registrado_por` + su `created_at`): la línea se
--     reescribe al corregir lo contado y `created_at` sigue siendo el de la primera vez; al día siguiente la base vería «otro
--     día» en cada paso y volvería a preguntar el nombre una y otra vez.
--   · Un CHECK «conteo cerrado ⇒ `cerrado_por` no vacío»: hay cierres viejos sin nombre y archivarlos o purgarlos (UPDATE de
--     filas viejas) chocaría con el candado. La garantía vive en las funciones que cierran (parte 2).
--   · Un CHECK para «arranque de una categoría solo en el piso»: el tipo de lugar vive en `sububicaciones`, otra tabla, y un CHECK
--     no puede mirarla. Lo hace un disparador (mismo código de error, 23514); la primera versión era un CHECK «solo de TODO el
--     lugar», que en el piso le habría negado el arranque a cada categoría.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: en el SQL Editor, tal cual (ya trae `retail.`), ANTES de la parte 2 y fuera del horario de
-- tienda. Toma por un instante `transferencias`, `conteos` y `conteo_items` (columnas nuevas con valor por defecto: no reescriben
-- la tabla; cada CHECK lee las filas una vez) y, por la llave hacia `public.personas`, esa tabla un instante. Sin políticas ni
-- `drop trigger` (los disparadores van con `create or replace trigger`): no choca con el Asesor de seguridad (ADR-0195). Con `lock_timeout` de 3 s: si una tienda está guardando, falla sin trabar y se
-- vuelve a pegar. Idempotente. La web vieja sigue funcionando con estas columnas puestas (nadie las lee todavía).
--
-- SE ROMPE SI alguien escribe `aplicada_sin_contar = true` fuera de `conteo_aplicar_completos` (la tabla no se escribe desde la
-- API: RLS solo deja leer), o si una restauración de respaldos de `conteo_items` trae la columna en NULL explícito (es NOT NULL:
-- la restauración falla en vez de inventar un valor).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Traslados: quién está recibiendo (la última firma con nombre de la recepción)
-- ---------------------------------------------------------------------------
alter table retail.transferencias
  add column if not exists recepcion_firmada_por uuid references public.personas(id),
  add column if not exists recepcion_firmada_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transferencias_firma_recepcion_completa'
                   and conrelid = 'retail.transferencias'::regclass) then
    alter table retail.transferencias
      add constraint transferencias_firma_recepcion_completa
      check ((recepcion_firmada_por is null) = (recepcion_firmada_en is null));
  end if;
end $$;

comment on column retail.transferencias.recepcion_firmada_por is
  'ADR-0328: la última persona que firmó un paso de la recepción (registrar lo contado, confirmar, cerrar con diferencia). '
  'Una terminal sin nombre hereda esta firma si es del mismo día (Lima); si no, se le pregunta una vez. La escribe fn_firma_de_recepcion.';
comment on column retail.transferencias.recepcion_firmada_en is
  'ADR-0328: cuándo se firmó por última vez la recepción (ver recepcion_firmada_por).';

-- ---------------------------------------------------------------------------
-- 2. Conteos: el de arranque
-- ---------------------------------------------------------------------------
alter table retail.conteos add column if not exists es_arranque boolean not null default false;

-- La primera versión de esta parte ponía un CHECK «solo un conteo de TODO el lugar es de arranque». En el piso el arranque es por
-- categoría (Felipe, 2026-10-04), así que ese candado ya no es la regla: se quita si una base lo tenía, y lo reemplaza el
-- disparador de abajo. `drop constraint` no toma los candados de auth/storage (ADR-0195).
alter table retail.conteos drop constraint if exists conteos_arranque_es_del_lugar_completo;

-- PROMETE: true si en ese lugar de conteo el arranque es por CATEGORÍA (el piso de venta), false si es del lugar entero (el almacén
--   de tienda, o una ubicación sin piso ni almacén aparte: sububicación NULL). Es la ÚNICA definición de esa regla: la usan el
--   disparador de abajo, las funciones del arranque (parte 2) y la lectura del detalle.
-- POR QUÉ (Felipe, 2026-10-04): el piso se cuenta por categorías o por lotes a lo largo de la semana; nunca de una vez entero. Si el
--   arranque fuera solo del piso completo, el piso no tendría arranque nunca y los errores de la carga caerían como merma.
create or replace function retail.fn_arranque_por_categoria(p_sububicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select exists (select 1 from retail.sububicaciones s where s.id = p_sububicacion_id and s.tipo = 'piso_venta');
$fn$;

revoke all on function retail.fn_arranque_por_categoria(uuid) from public, anon, authenticated;

comment on function retail.fn_arranque_por_categoria(uuid) is
  'ADR-0328: en ese lugar de conteo, ¿el arranque es por categoría (el piso de venta) o del lugar entero (almacén, o toda la '
  'ubicación)? Única definición de la regla. Interna.';

-- Un conteo de una categoría solo puede ser el de arranque en el piso (el de esa categoría); en el almacén o en toda la ubicación,
-- el de arranque es el de TODO el lugar. Mismo código que un CHECK (23514): el tipo de lugar vive en otra tabla.
create or replace function retail.trg_conteos_arranque_coherente() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if new.es_arranque and new.alcance <> 'todo' and not retail.fn_arranque_por_categoria(new.sububicacion_id) then
    raise exception 'Un conteo de una categoría solo es de arranque en el piso; en el almacén, el de arranque es el de todo el lugar.'
      using errcode = '23514', hint = 'arranque_incoherente';
  end if;
  return new;
end;
$fn$;

revoke all on function retail.trg_conteos_arranque_coherente() from public, anon, authenticated;

create or replace trigger conteos_arranque_coherente
  before insert or update of es_arranque, alcance, sububicacion_id on retail.conteos
  for each row execute function retail.trg_conteos_arranque_coherente();

comment on column retail.conteos.es_arranque is
  'ADR-0328: el conteo fue el de arranque de su tramo, contado entero y de verdad: sin pendientes y sin nada aplicado sin contar '
  '(fn_conteo_vale_como_arranque). Tramo: en el almacén (o toda la ubicación), el lugar entero (solo un conteo de todo); en el piso, '
  'cada categoría (fn_arranque_por_categoria). El cuadre del piso de la sede reinicia los tramos. Corrige el stock, pero sus ajustes '
  'llevan motivo conteo_arranque: no son merma (fn_es_merma) ni entran en la exactitud. Lo marca solo cerrar_conteo; la marca, no '
  'el estado, dice que el tramo ya se gastó.';

-- ---------------------------------------------------------------------------
-- 3. Líneas de conteo: «aplicada sin contar»
-- ---------------------------------------------------------------------------
alter table retail.conteo_items add column if not exists aplicada_sin_contar boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conteo_items_sin_contar_es_lo_esperado'
                   and conrelid = 'retail.conteo_items'::regclass) then
    alter table retail.conteo_items
      add constraint conteo_items_sin_contar_es_lo_esperado
      check (not aplicada_sin_contar or (cantidad_contada is not null and cantidad_contada = cantidad_sistema));
  end if;
end $$;

comment on column retail.conteo_items.aplicada_sin_contar is
  'ADR-0328: la cifra la anotó «Aplicar todos completos» con lo que CAYLA esperaba, sin que nadie contara. No sube la exactitud. '
  'La escribe solo conteo_aplicar_completos; el disparador conteo_items_sin_contar_se_apaga la apaga al volver a verificar la línea.';

-- La marca vale solo para la verificación que la puso: si la línea se vuelve a verificar (otra hora, otra cifra u otro «debe
-- haber»), o se le borra la cifra, ya no es «sin contar». Quien la pone (`conteo_aplicar_completos`) la escribe en la misma
-- sentencia que la verificación, desde `false`: por eso se mira el valor VIEJO.
create or replace function retail.trg_conteo_items_sin_contar() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if old.aplicada_sin_contar and new.aplicada_sin_contar
     and (new.verificado_en is distinct from old.verificado_en
          or new.cantidad_contada is distinct from old.cantidad_contada
          or new.cantidad_sistema is distinct from old.cantidad_sistema) then
    new.aplicada_sin_contar := false;
  end if;
  return new;
end;
$fn$;

revoke all on function retail.trg_conteo_items_sin_contar() from public, anon, authenticated;

-- `create or replace trigger`, nunca `drop trigger` + `create trigger` (el `drop` toma los candados de auth/storage, ADR-0195).
create or replace trigger conteo_items_sin_contar_se_apaga
  before update on retail.conteo_items
  for each row execute function retail.trg_conteo_items_sin_contar();
