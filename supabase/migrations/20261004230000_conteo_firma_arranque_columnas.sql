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
--   · `conteos.es_arranque`: el conteo fue el de arranque de su lugar, el primero de TODO el lugar contado entero y de verdad
--     (sin pendientes y sin nada «aplicado sin contar»). Lo escribe solo `cerrar_conteo` (parte 2), y una vez puesta la marca
--     el arranque del lugar queda gastado aunque el conteo se reabra o se cancele.
--   · `conteo_items.aplicada_sin_contar`: la cifra la puso «Aplicar todos completos» (lo que CAYLA esperaba), no una persona
--     que contó. La escribe solo `conteo_aplicar_completos` (parte 2); un disparador la apaga en cuanto la línea se vuelve a
--     verificar o se borra su cifra.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · una firma de recepción con persona y sin hora, o con hora y sin persona;
--   · un conteo de una sola categoría marcado «de arranque» (el arranque es del lugar completo);
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
--
-- CÓMO SE PEGA EN PRODUCCIÓN: en el SQL Editor, tal cual (ya trae `retail.`), ANTES de la parte 2 y fuera del horario de
-- tienda. Toma por un instante `transferencias`, `conteos` y `conteo_items` (columnas nuevas con valor por defecto: no reescriben
-- la tabla; cada CHECK lee las filas una vez) y, por la llave hacia `public.personas`, esa tabla un instante. Sin políticas: no
-- choca con el Asesor de seguridad (ADR-0195). Con `lock_timeout` de 3 s: si una tienda está guardando, falla sin trabar y se
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

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conteos_arranque_es_del_lugar_completo'
                   and conrelid = 'retail.conteos'::regclass) then
    alter table retail.conteos
      add constraint conteos_arranque_es_del_lugar_completo check (not es_arranque or alcance = 'todo');
  end if;
end $$;

comment on column retail.conteos.es_arranque is
  'ADR-0328: el primer conteo de TODO el lugar (piso, almacén o toda la ubicación) contado entero y de verdad: sin pendientes y '
  'sin nada aplicado sin contar (fn_conteo_vale_como_arranque). Corrige el stock, pero sus ajustes llevan motivo conteo_arranque: '
  'no son merma (fn_es_merma) ni entran en la exactitud. Lo marca solo cerrar_conteo; la marca, no el estado, dice que el arranque '
  'del lugar ya se gastó.';

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
