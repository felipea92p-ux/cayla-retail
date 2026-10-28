-- ============================================================================
-- 20261003110000_venta_pagos_candado_redondeo.sql — CAYLA V2 (ADR-0311, actividad 2, PARTE 1 de 2)
--
-- EL CAMBIO. Prepara `venta_pagos` para una fila de redondeo del efectivo: S/ 0.10 es la moneda más chica que circula y la ley
-- solo permite redondear hacia abajo (100.19 → se cobra 100.10 y el 0.09 que no se cobra queda como una fila
-- `metodo = 'redondeo'` de la venta). Esta parte NO escribe ninguna fila: solo deja el esquema listo, con los candados de lo
-- que nunca debe existir. Sola, no cambia nada de lo que hoy cobra la caja.
--
--   1. `venta_pagos_metodo_check` acepta 'redondeo'. Se rehace SOBRE LA LISTA VIVA (lee `pg_get_constraintdef` y le suma
--      el medio nuevo): no suelta ningún medio que ya esté permitido. Ya se reescribió dos veces y una lista copiada de un
--      archivo viejo soltaría 'qr' o 'anticipo' (casi pasó con 0ed663f1).
--   2. `venta_pagos_redondeo_valido`: el redondeo es menor de S/ 0.10 (más sería otra cosa, no un redondeo). Que sea mayor
--      que cero ya lo exige `venta_pagos_monto_check`; que no lleve `recibido` ni `referencia`, los dos CHECK que ya existen
--      (`recibido` solo en efectivo; `referencia` solo en Yape, Plin y transferencia).
--   3. Un solo redondeo por venta: índice único parcial. Dos filas serían redondear dos veces.
--
-- LO QUE EL ESQUEMA NO PUEDE DECIR. «Un redondeo solo existe junto a una fila de efectivo cuyo monto es múltiplo de 0.10 y es el
-- redondeo exacto de la ley» involucra dos filas: lo exige la única función que escribe ventas (`registrar_venta`,
-- actividad 5, ADR-0119), y una prueba de auditoría (`scripts/pruebas/redondeo_efectivo.mjs`) lo vigila.
--
-- PRODUCCIÓN. Pegar SOLA, en el SQL Editor, ANTES de la parte 2 y de publicar la web (la web nueva todavía no manda ninguna fila
-- de redondeo: con la base vieja no pasa nada). Toma ACCESS EXCLUSIVE sobre `venta_pagos` unos milisegundos (48 filas el
-- 2026-10-02); con `lock_timeout = 3s`, si una venta la tiene tomada, falla sin tocar nada y se vuelve a pegar. Sin políticas ni
-- `drop trigger`. Idempotente: pegarla dos veces no hace nada la segunda.
--
-- VERIFICACIÓN (solo lectura):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'venta_pagos_metodo_check';   → incluye 'redondeo' y los 7 de antes
--   select conname from pg_constraint where conname = 'venta_pagos_redondeo_valido';                    → 1 fila
--   select indexname from pg_indexes where indexname = 'venta_pagos_un_redondeo_por_venta';             → 1 fila
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $migracion$
declare
  v_def text;
  v_medios text[];
  v_nuevos text[];
begin
  v_def := (select pg_get_constraintdef(c.oid) from pg_constraint c
             where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_metodo_check');
  if v_def is null then
    raise exception 'redondeo: no existe venta_pagos_metodo_check. No se toca nada: revisa la tabla venta_pagos.';
  end if;

  -- 1. El medio nuevo, sumado a los que ya están permitidos (los de la definición viva, en su orden).
  if v_def like '%''redondeo''%' then
    raise notice 'venta_pagos_metodo_check ya acepta redondeo: no se toca.';
  else
    v_medios := array(select m[1] from regexp_matches(v_def, '''([a-z_]+)''::text', 'g') as t(m));
    if not (v_medios @> array['efectivo', 'tarjeta', 'yape', 'plin', 'transferencia']) then
      raise exception 'redondeo: la lista viva de medios no es la esperada (%). No se toca nada.', v_def;
    end if;
    v_nuevos := v_medios || array['redondeo'];
    alter table retail.venta_pagos drop constraint venta_pagos_metodo_check;
    execute format(
      'alter table retail.venta_pagos add constraint venta_pagos_metodo_check check (metodo in (%s))',
      (select string_agg(quote_literal(x), ', ' order by o) from unnest(v_nuevos) with ordinality as u(x, o))
    );
  end if;

  -- 2. El redondeo es menor de S/ 0.10.
  if not exists (select 1 from pg_constraint c where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_redondeo_valido') then
    alter table retail.venta_pagos
      add constraint venta_pagos_redondeo_valido check (metodo <> 'redondeo' or monto < 0.10);
  end if;

  -- 3. Un solo redondeo por venta.
  create unique index if not exists venta_pagos_un_redondeo_por_venta on retail.venta_pagos (venta_id) where metodo = 'redondeo';

  -- Validación final: si algo no quedó como se espera, se aborta TODO.
  v_def := (select pg_get_constraintdef(c.oid) from pg_constraint c
             where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_metodo_check');
  if v_def not like '%''redondeo''%' then
    raise exception 'redondeo: venta_pagos_metodo_check no quedó con el medio nuevo.';
  end if;
  if v_medios is not null and exists (select 1 from unnest(v_medios) x where v_def not like '%''' || x || '''%') then
    raise exception 'redondeo: venta_pagos_metodo_check perdió un medio que ya estaba permitido (%).', v_def;
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_redondeo_valido')
     or not exists (select 1 from pg_indexes where schemaname = 'retail' and indexname = 'venta_pagos_un_redondeo_por_venta') then
    raise exception 'redondeo: faltan el CHECK del monto o el índice de un redondeo por venta.';
  end if;
end
$migracion$;

comment on constraint venta_pagos_redondeo_valido on retail.venta_pagos is
  'ADR-0311: el redondeo del efectivo es menor de S/ 0.10 (la moneda más chica que circula). Mayor que cero lo exige venta_pagos_monto_check.';
comment on index retail.venta_pagos_un_redondeo_por_venta is
  'ADR-0311: una venta tiene a lo más UNA fila de redondeo del efectivo.';

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si al terminar no ves una fila con esta parte y «QUEDÓ BIEN», el texto se
-- pegó cortado (el editor de Supabase no avisa si el corte cae entre dos instrucciones: «Success» no quiere decir que se aplicó todo).
-- Copia el archivo COMPLETO (en la terminal: `pbcopy < supabase/migrations/<archivo>`) y vuelve a pegarlo: es seguro repetirlo.
select '20261003110000 · el candado de venta_pagos para el medio redondeo' as parte,
       case when exists (select 1 from pg_constraint c where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_metodo_check' and pg_get_constraintdef(c.oid) like '%''redondeo''%') and exists (select 1 from pg_constraint c where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_redondeo_valido') and exists (select 1 from pg_indexes where schemaname = 'retail' and indexname = 'venta_pagos_un_redondeo_por_venta')
            then 'QUEDÓ BIEN' else 'REVISAR: falta alguna parte anterior o el texto se pegó cortado' end as resultado;
