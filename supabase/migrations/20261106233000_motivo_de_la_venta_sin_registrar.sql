-- ============================================================================
-- 20261106233000 — Por qué se anotó a mano: la venta sin registrar guarda su motivo (ADR-0179, actualización 2026-11-06)
--
-- EL PROBLEMA PRIMERO. Con todo etiquetado, en la semana del 31-oct al 6-nov el ~34 % de las prendas vendidas en AQP y el ~15 % en
-- TRU se anotaron como «Prenda sin registrar», la misma proporción que antes de etiquetar. En AQP, en 51 de 77 había una prenda
-- igual con stock en el piso de venta. La base sabe QUÉ se anotó, pero no POR QUÉ: si la pistola no lee la etiqueta, si la prenda
-- no tenía etiqueta, si el sistema decía que no había o si fue el apuro. Sin eso no se sabe qué arreglar (Felipe, 2026-11-06).
--
-- CONTRATO (Liskov)
--   PROMETE: cada línea de `p_items` que es una «Prenda sin registrar» puede traer `motivo_sin_registrar` (uno de cinco) y, con
--            «otro», `motivo_sin_registrar_detalle` (texto corto). `registrar_venta` los deja en `prendas_por_regularizar.motivo` y
--            `.motivo_detalle`. Un motivo que no es de la lista se guarda como «sin motivo» (null): la venta NUNCA se cae por esto
--            (la regla del sello de la máquina, 20261016182000). El detalle solo se guarda con «otro», recortado a 120 letras.
--   ASUME:   la web (Vender) lo pide antes de agregar la línea al ticket; una pestaña abierta antes de publicar, una venta encolada
--            sin conexión de antes o la tienda web no lo mandan, y quedan sin motivo (null). Por eso la columna admite null.
--   NO HACE: no cambia ningún otro candado ni cifra de `registrar_venta`; no toca dinero, stock ni comprobante. No exige el
--            motivo en la base (rechazar la venta en el mostrador por un dato de diagnóstico sería peor que no tenerlo).
--
-- CÓMO. Dos columnas nuevas con su candado, y un reemplazo anclado sobre la función VIVA (`pg_temp.reemplazar`, el patrón de
-- 20261016182000) en el único `insert into prendas_por_regularizar` de `registrar_venta`. El ancla es ese `insert` entero, idéntico
-- en producción y en la base local (comprobado el 2026-11-06: aparece una vez). Aborta sin cambiar nada si no está exactamente una
-- vez. Idempotente: si el texto nuevo ya está, no hace nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN. Toma `prendas_por_regularizar` un instante (dos `add column` sin valor por
-- defecto: no reescriben la tabla) y la función. Sin políticas: no choca con el Asesor de seguridad (CLAUDE.md, «Políticas y deadlocks»).
-- SE ROMPE SI: una migración futura recrea `registrar_venta` desde un texto anterior a esta: el motivo vuelve a perderse en silencio.
-- `pruebas:prenda-sin-registrar-motivo` lo vigila, y el inverso vive en `DESHACER_MOTIVO_SIN_REGISTRAR`
-- (`scripts/pruebas/registrar-venta-antes-de-precio-sede.mjs`).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.prendas_por_regularizar
  add column if not exists motivo text,
  add column if not exists motivo_detalle text;

comment on column retail.prendas_por_regularizar.motivo is
  'Por qué la caja la anotó a mano (Vender): pistola_no_lee, sin_etiqueta, sistema_sin_stock, cola u otro. Null: venta de antes del 2026-11-06 o de una pantalla que no lo pide.';
comment on column retail.prendas_por_regularizar.motivo_detalle is
  'Con motivo = otro: lo que escribió la caja, hasta 120 letras. Null en cualquier otro motivo.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'prendas_por_regularizar_motivo_valido') then
    alter table retail.prendas_por_regularizar
      add constraint prendas_por_regularizar_motivo_valido
      check (motivo is null or motivo in ('pistola_no_lee', 'sin_etiqueta', 'sistema_sin_stock', 'cola', 'otro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prendas_por_regularizar_motivo_detalle') then
    -- El detalle solo existe con «otro», y nunca vacío ni largo.
    alter table retail.prendas_por_regularizar
      add constraint prendas_por_regularizar_motivo_detalle
      check (motivo_detalle is null or (motivo = 'otro' and length(btrim(motivo_detalle)) between 1 and 120));
  end if;
end $$;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta'),
$v$      insert into prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id,
                                           color_codigo, precio_cobrado, vendido_por)
        values (v_item_id, p_ubicacion_id, btrim(v_item ->> 'descripcion_libre'),
                (v_item ->> 'categoria_id')::uuid, (v_item ->> 'talla_id')::uuid, v_item ->> 'color_codigo',
                (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0),
                coalesce(p_asesora_id, v_persona));$v$,
$n$      insert into prendas_por_regularizar (venta_item_id, ubicacion_id, descripcion, categoria_id, talla_id,
                                           color_codigo, precio_cobrado, vendido_por, motivo, motivo_detalle)
        values (v_item_id, p_ubicacion_id, btrim(v_item ->> 'descripcion_libre'),
                (v_item ->> 'categoria_id')::uuid, (v_item ->> 'talla_id')::uuid, v_item ->> 'color_codigo',
                (v_item ->> 'precio_unitario')::numeric - coalesce((v_item ->> 'descuento_unitario')::numeric, 0),
                coalesce(p_asesora_id, v_persona),
                -- 20261106233000: por qué se anotó a mano. Fuera de la lista, «sin motivo»: la venta nunca se cae por esto.
                case when v_item ->> 'motivo_sin_registrar' in ('pistola_no_lee', 'sin_etiqueta', 'sistema_sin_stock', 'cola', 'otro')
                     then v_item ->> 'motivo_sin_registrar' end,
                case when v_item ->> 'motivo_sin_registrar' = 'otro'
                     then nullif(left(btrim(coalesce(v_item ->> 'motivo_sin_registrar_detalle', '')), 120), '') end);$n$, 1);
