-- ============================================================================
-- scripts/demo/deshacer-90-dias.sql
-- Retira la historia sintética de 90 días que cargó sembrar-90-dias.sql (ADR-0150), sin tocar nada real.
--
-- Qué es «sembrado»: toda fila con id que empieza en 5eed, más lo que cuelga de un producto/variante sembrado sin id
-- propio 5eed (códigos de barras, fotos, stock, etiquetas de variante, repartos de compra, que ponen los triggers).
--
-- Cómo corre (una sola transacción, todo o nada):
--   1. Revisa que NINGUNA fila real apunte a algo sembrado (una venta real de una prenda demo, un apartado, un conteo,
--      una devolución real sobre una boleta sembrada…). Si hay alguna, aborta y dice cuál: no se borra nada.
--   2. Apaga los 3 candados de historial (movimientos, cierres de compra, notas de crédito de compra) SOLO dentro de
--      esta transacción: es DDL transaccional, así que si algo falla vuelven a quedar como estaban.
--   3. Borra de hijos a padres y devuelve los contadores (códigos de producto, series de comprobantes, numeración de
--      traslados) al valor de ANTES de la carga — salvo que después de la carga se haya emitido un número real mayor:
--      entonces ese contador no se toca (bajarlo repetiría un número real).
--   4. Vuelve a encender los candados y comprueba que no quedó nada sembrado.
-- Las series de nota de crédito NC01/NC02 que registró la carga NO se tocan: son configuración real de facturación
-- que Felipe autorizó y sirven igual sin la demo.
--
-- Pruebas hechas en tienda con prendas demo (ventas, compras, notas de crédito de proveedor): con la primera línea
-- `set cayla_seed.incluir_pruebas = 'true';` se van con la demo, completas, y su numeración también vuelve atrás. Sin
-- ese interruptor el candado del paso 1 aborta como siempre. Usarlo SOLO mientras todo lo real sea de prueba.
--
-- Ensayo: termina en ROLLBACK. Para la corrida real: primera línea `set cayla_seed.definitivo = 'true';` y la última
-- cambiada a COMMIT — las dos juntas (sin el interruptor, la numeración de traslados no se devuelve; con el interruptor y
-- sin COMMIT, se movería de verdad aunque todo lo demás se deshaga). Bloquea `movimientos` unos segundos (~40 s en total
-- en producción): correrlo cuando nadie esté vendiendo.
-- ============================================================================

begin;
set local statement_timeout = 0;
set local search_path to retail, public, extensions;

-- ---- 1. Alcance: qué es sembrado ----
create temp table zz_prod on commit drop as select id from productos where id::text like '5eed%';
create temp table zz_var on commit drop as
select id from variantes where id::text like '5eed%' or producto_id in (select id from zz_prod);

-- ---- 1b. Pruebas hechas con prendas demo (solo con set cayla_seed.incluir_pruebas = 'true') ----
-- Todo lo real de producción era de prueba al 2026-09-24: una venta real con alguna prenda demo, una compra real con
-- alguna línea demo y una nota de crédito de proveedor sobre una compra demo se borran enteras, antes del candado.
-- Sus comprobantes quedan en zz_pcomp para devolver también su numeración (paso 5).
create temp table zz_pcomp on commit drop as select tipo, serie, numero from comprobantes where false;
do $$
begin
  if coalesce(current_setting('cayla_seed.incluir_pruebas', true), '') <> 'true' then return; end if;
  create temp table zz_pv on commit drop as
  select distinct venta_id as id from venta_items where variante_id in (select id from zz_var) and id::text not like '5eed%';
  create temp table zz_pc on commit drop as
  select distinct compra_id as id from compra_items
   where (producto_id in (select id from zz_prod) or variante_id in (select id from zz_var)) and compra_id::text not like '5eed%';
  -- Borrar el movimiento de una prenda REAL descuadraría su stock (es un snapshot derivado): eso se resuelve a mano.
  if exists (select 1 from movimientos m
             where (m.venta_item_id in (select id from venta_items where venta_id in (select id from zz_pv))
                 or m.compra_item_id in (select id from compra_items where compra_id in (select id from zz_pc)))
               and m.variante_id not in (select id from zz_var)) then
    raise exception '[deshacer] Una venta o compra de prueba también movió prendas reales; no se borra nada. Resolverla a mano primero.';
  end if;
  insert into zz_pcomp select tipo, serie, numero from comprobantes where venta_id in (select id from zz_pv);

  alter table movimientos disable trigger movimientos_inmutables;
  alter table compra_notas_credito disable trigger compra_notas_credito_inmutables;
  alter table proveedor_creditos disable trigger proveedor_creditos_inmutables;
  delete from prendas_por_regularizar where variante_id in (select id from zz_var)
      or venta_item_id in (select id from venta_items where venta_id in (select id from zz_pv));
  delete from movimientos where id::text not like '5eed%'
     and (venta_item_id in (select id from venta_items where venta_id in (select id from zz_pv))
       or compra_item_id in (select id from compra_items where compra_id in (select id from zz_pc)));
  delete from comprobantes where venta_id in (select id from zz_pv);
  delete from venta_pagos where venta_id in (select id from zz_pv);
  delete from venta_items where venta_id in (select id from zz_pv);
  delete from ventas where id in (select id from zz_pv);
  delete from compra_item_destinos where compra_item_id in (select id from compra_items where compra_id in (select id from zz_pc));
  delete from compra_items where compra_id in (select id from zz_pc);
  delete from compras where id in (select id from zz_pc);
  delete from proveedor_creditos where compra_id::text like '5eed%'
      or nota_credito_id in (select id from compra_notas_credito where compra_id::text like '5eed%');
  delete from compra_notas_credito where compra_id::text like '5eed%' and id::text not like '5eed%';
end $$;

-- ---- 2. Candado: ninguna fila real apunta a algo sembrado ----
-- Recorre TODAS las claves foráneas de una columna del schema retail cuyo destino tiene filas sembradas, y cuenta las
-- filas de origen que no son sembradas. Las tablas «derivadas» (sin id 5eed propio, se borran con su padre) no cuentan.
do $$
declare
  r record; v_n bigint; v_malas text := '';
  v_derivadas text[] := array['stock', 'codigos_barras', 'producto_fotos', 'variante_etiquetas', 'compra_item_destinos'];
begin
  for r in
    select cl.relname as origen, a.attname as col, rf.relname as destino,
           exists (select 1 from information_schema.columns c
                   where c.table_schema = 'retail' and c.table_name = cl.relname and c.column_name = 'id') as origen_tiene_id
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_class rf on rf.oid = con.confrelid
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f' and n.nspname = 'retail' and array_length(con.conkey, 1) = 1
      and exists (select 1 from information_schema.columns c
                  where c.table_schema = 'retail' and c.table_name = rf.relname and c.column_name = 'id')
      and not (cl.relname = any (v_derivadas))
  loop
    execute format(
      'select count(*) from retail.%I o where o.%I in (select d.id from retail.%I d where d.id::text like ''5eed%%''%s) %s',
      r.origen, r.col, r.destino,
      case when r.destino = 'variantes' then ' or d.id in (select id from zz_var)' else '' end,
      case when r.origen_tiene_id then 'and o.id::text not like ''5eed%%''' else '' end)
      into v_n;
    if v_n > 0 then v_malas := v_malas || format(E'\n  · %s filas reales de %s.%s apuntan a %s sembrados', v_n, r.origen, r.col, r.destino); end if;
  end loop;
  -- historial de ediciones de productos (sin FK): si alguien editó un producto sembrado, ese historial es inmutable
  select count(*) into v_n from historial_producto_cambios h
   where h.entidad_id in (select id from zz_prod union all select id from zz_var);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s cambios registrados en historial_producto_cambios sobre productos sembrados', v_n); end if;
  -- Colisión de marca: un uuid aleatorio real empieza por 5eed 1 de cada 65.536 veces (pasó en la base local con un
  -- código de barras). Una fila 5eed que cuelga de un padre REAL del mismo universo sembrado (producto, variante, venta,
  -- compra, traslado, caja…), o que se creó después de la carga, no es de la demo: se aborta antes de borrarla.
  for r in
    select cl.relname as origen, a.attname as col, rf.relname as destino
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
    join pg_class rf on rf.oid = con.confrelid
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f' and n.nspname = 'retail' and array_length(con.conkey, 1) = 1
      and rf.relname in ('productos', 'variantes', 'ventas', 'venta_items', 'compras', 'compra_items', 'transferencias',
                         'transferencia_items', 'envios', 'lotes', 'cambios', 'cajas', 'movimientos', 'compra_item_cierres')
      and exists (select 1 from information_schema.columns c
                  where c.table_schema = 'retail' and c.table_name = cl.relname and c.column_name = 'id')
      and not (cl.relname = any (v_derivadas))
  loop
    execute format(
      'select count(*) from retail.%I o where o.id::text like ''5eed%%'' and o.%I is not null
         and o.%I not in (select d.id from retail.%I d where d.id::text like ''5eed%%''%s)',
      r.origen, r.col, r.col, r.destino,
      case when r.destino = 'variantes' then ' or d.id in (select id from zz_var)' else '' end)
      into v_n;
    if v_n > 0 then v_malas := v_malas || format(E'\n  · %s filas de %s con id 5eed apuntan a %s REALES (%s): colisión de marca, no son de la demo', v_n, r.origen, r.destino, r.col); end if;
  end loop;
  for r in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'retail' and c.column_name = 'created_at'
      and exists (select 1 from information_schema.columns k where k.table_schema = 'retail' and k.table_name = c.table_name and k.column_name = 'id')
      and not (c.table_name = any (v_derivadas))
      and c.table_name in (select table_name from information_schema.tables where table_schema = 'retail' and table_type = 'BASE TABLE')
  loop
    execute format('select count(*) from retail.%I where id::text like ''5eed%%'' and created_at > %L', r.table_name,
                   (select max(created_at) + interval '1 hour' from movimientos where id::text like '5eed%')) into v_n;
    if v_n > 0 then v_malas := v_malas || format(E'\n  · %s filas de %s con id 5eed creadas después de la carga: colisión de marca', v_n, r.table_name); end if;
  end loop;
  if v_malas <> '' then
    raise exception E'[deshacer] Hay datos reales enganchados a la demo; no se borra nada. Resolverlos primero (si son pruebas: primera línea set cayla_seed.incluir_pruebas = ''true'';):%', v_malas;
  end if;
end $$;

-- ---- 3. Valores de antes de la carga (se calculan ANTES de borrar) ----
-- Código de producto: la carga tomó números seguidos a partir de (último real + 1), así que el valor previo es el
-- primer número sembrado − 1. Si hay un código real mayor que el último sembrado, se creó después: no se toca.
create temp table zz_corr on commit drop as
select s.prefijo, s.previo, s.max_sembrado,
       (select max(split_part(q.codigo, '-', 2)::int) from productos q
         where split_part(q.codigo, '-', 1) = s.prefijo and q.codigo ~ '^[A-Z]+-[0-9]+$'
           and q.id not in (select id from zz_prod)) as max_real
from (select split_part(p.codigo, '-', 1) as prefijo,
             min(split_part(p.codigo, '-', 2)::int) - 1 as previo,
             max(split_part(p.codigo, '-', 2)::int) as max_sembrado
      from productos p where p.id in (select id from zz_prod) and p.codigo ~ '^[A-Z]+-[0-9]+$'
      group by 1) s;

-- Series de comprobantes: lo mismo con el correlativo (siguiente_numero previo = primer número sembrado o de prueba;
-- los de prueba ya se borraron en el 1b, así que max_real ya no los ve).
create temp table zz_series on commit drop as
select c.tipo, c.serie, min(c.numero) as previo, max(c.numero) as max_sembrado,
       (select max(r.numero) from comprobantes r where r.tipo = c.tipo and r.serie = c.serie and r.id::text not like '5eed%') as max_real
from (select tipo, serie, numero from comprobantes where id::text like '5eed%'
      union all select tipo, serie, numero from zz_pcomp) c
group by 1, 2;

-- Traslados: solo si la carga definitiva sincronizó la secuencia con su último número (si no, no la movió).
create temp table zz_transf on commit drop as
select min(numero) - 1 as previo, max(numero) as max_sembrado,
       (select max(numero) from transferencias where id::text not like '5eed%') as max_real
from transferencias where id::text like '5eed%';

-- ---- 4. Borrado, de hijos a padres ----
alter table movimientos disable trigger movimientos_inmutables;
alter table compra_item_cierres disable trigger compra_item_cierres_inmutables;
alter table compra_notas_credito disable trigger compra_notas_credito_inmutables;

-- ciclo movimientos ↔ traslados: se corta del lado del movimiento (el candado está apagado)
update movimientos set transferencia_item_id = null, transferencia_recepcion_id = null
 where id::text like '5eed%' and (transferencia_item_id is not null or transferencia_recepcion_id is not null);

delete from stock where variante_id in (select id from zz_var);
delete from prendas_danadas where id::text like '5eed%';
delete from venta_anulacion_items where id::text like '5eed%';
delete from transferencia_recepciones where id::text like '5eed%';
delete from transferencia_items where id::text like '5eed%';
delete from movimientos where id::text like '5eed%';
delete from cambios where id::text like '5eed%';
delete from comprobantes where id::text like '5eed%';
delete from venta_pagos where id::text like '5eed%';
delete from venta_items where id::text like '5eed%';
delete from ventas where id::text like '5eed%';
delete from cajas where id::text like '5eed%';
delete from transferencias where id::text like '5eed%';
delete from compra_notas_credito where id::text like '5eed%';
delete from compra_item_cierres where id::text like '5eed%';
delete from compra_item_destinos where compra_item_id in (select id from compra_items where id::text like '5eed%');
delete from compra_items where id::text like '5eed%';
delete from compra_pagos where id::text like '5eed%';
delete from compras where id::text like '5eed%';
delete from lotes where id::text like '5eed%';
delete from envios where id::text like '5eed%';
delete from codigos_barras where variante_id in (select id from zz_var);
delete from variante_etiquetas where variante_id in (select id from zz_var) or etiqueta_id::text like '5eed%';
delete from producto_fotos where producto_id in (select id from zz_prod);
delete from variantes where id in (select id from zz_var);
delete from productos where id in (select id from zz_prod);
delete from etiquetas where id::text like '5eed%';

set constraints all immediate;  -- el reparto de compras es un candado diferido: que se revise aquí, no en el COMMIT

-- ALWAYS, no `enable trigger` a secas: ese lo deja en modo normal y el candado deja de valer en modo réplica (D-22,
-- 20260926160000). Así se perdió el 2026-09-24.
alter table movimientos enable always trigger movimientos_inmutables;
alter table compra_item_cierres enable trigger compra_item_cierres_inmutables;
alter table compra_notas_credito enable trigger compra_notas_credito_inmutables;
alter table proveedor_creditos enable trigger proveedor_creditos_inmutables;  -- lo apaga el 1b

-- ---- 5. Contadores al valor de antes de la carga ----
delete from codigos_correlativos c using zz_corr z
 where c.prefijo = z.prefijo and z.previo = 0 and coalesce(z.max_real, 0) <= z.max_sembrado
   and c.ultimo = z.max_sembrado;                              -- la fila la creó la carga
update codigos_correlativos c set ultimo = z.previo, updated_at = now() from zz_corr z
 where c.prefijo = z.prefijo and z.previo > 0 and coalesce(z.max_real, 0) <= z.max_sembrado
   and c.ultimo = z.max_sembrado;

update series_comprobantes s set siguiente_numero = z.previo from zz_series z
 where s.tipo = z.tipo and s.serie = z.serie and coalesce(z.max_real, 0) < z.previo
   and s.siguiente_numero = z.max_sembrado + 1;

do $$
declare z record;
begin
  select * into z from zz_transf;
  -- setval() NO es transaccional: un ROLLBACK no lo deshace (le pasó al primer ensayo en producción, 2026-09-22, y hubo
  -- que devolver la secuencia a mano). Solo corre con `set cayla_seed.definitivo = 'true';` antes del begin, junto con
  -- cambiar la última línea a COMMIT — nunca en un ensayo.
  if coalesce(current_setting('cayla_seed.definitivo', true), '') = 'true'
     and z.max_sembrado is not null and coalesce(z.max_real, 0) <= z.previo
     and (select last_value from transferencias_numero_seq) = z.max_sembrado then
    if greatest(z.previo, coalesce(z.max_real, 0)) > 0 then
      perform setval('transferencias_numero_seq', greatest(z.previo, coalesce(z.max_real, 0)), true);
    else
      perform setval('transferencias_numero_seq', 1, false);
    end if;
  end if;
end $$;

-- ---- 6. Chequeos: no quedó nada sembrado y los candados están encendidos ----
do $$
declare v_n bigint; r record;
begin
  for r in
    -- solo las tablas que escribe la carga con id 5eed propio (en las derivadas y en el resto, un 5eed es casualidad)
    select unnest(array['cajas', 'cambios', 'compra_item_cierres', 'compra_items', 'compra_notas_credito', 'compra_pagos',
                        'compras', 'comprobantes', 'envios', 'etiquetas', 'lotes', 'movimientos', 'prendas_danadas',
                        'productos', 'transferencia_items', 'transferencia_recepciones', 'transferencias', 'variantes',
                        'venta_anulacion_items', 'venta_items', 'venta_pagos', 'ventas']) as table_name
  loop
    execute format('select count(*) from retail.%I where id::text like ''5eed%%''', r.table_name) into v_n;
    if v_n > 0 then raise exception '[deshacer] quedaron % filas sembradas en %', v_n, r.table_name; end if;
  end loop;
  select count(*) into v_n from pg_trigger
   where tgname in ('movimientos_inmutables', 'compra_item_cierres_inmutables', 'compra_notas_credito_inmutables',
                    'proveedor_creditos_inmutables')
     and tgenabled = 'D';
  if v_n > 0 then raise exception '[deshacer] % candados de historial quedaron apagados', v_n; end if;
  -- Los dos candados de movimientos van en ALWAYS (D-22): encendidos en modo normal no bastan.
  select count(*) into v_n from pg_trigger
   where tgrelid = 'retail.movimientos'::regclass
     and tgname in ('movimientos_inmutables', 'movimientos_sin_truncate')
     and tgenabled <> 'A';
  if v_n > 0 then raise exception '[deshacer] % candados de movimientos no quedaron en ALWAYS', v_n; end if;
  raise notice '[deshacer] OK — no queda nada sembrado; candados de historial encendidos';
end $$;

-- ---------------------------------------------------------------------------
-- Ensayo: ROLLBACK. Para la corrida real, cambiar esta última línea por COMMIT.
-- ---------------------------------------------------------------------------
rollback;
