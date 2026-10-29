-- ============================================================================
-- 20261029154000 — Las pérdidas y las prendas dañadas de CLAURE no son de CAYLA (ADR-0560; actividad 14)
--
-- EL PROBLEMA PRIMERO. En Tienda Lima conviven prendas de CAYLA y de CLAURE. Si una prenda de Claudia se daña o se pierde, esa merma es plata de ella, no de CAYLA. Pero la pantalla Pérdidas,
-- la calidad de las prendas dañadas y el Diario (la cuenta 6951 de mermas, y con él el Estado de resultados) leían el libro de movimientos sin mirar de quién era la prenda: la merma de
-- CLAURE entraba como pérdida de CAYLA. Felipe (2026-10-29): «solo Pérdidas y calidad de dañadas» se separan por dueño; Frescura del piso, el Resumen por variante y el piso NO.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_movimiento_es_de_claure(empresa, sede, cuándo)` (interna): el movimiento del libro es de CLAURE si trae su dueño (`movimientos.empresa_id`, ADR-0542), la sede es de las
--            que CLAURE opera y es del arranque de su cuenta (`cuenta_corriente_desde`) o después: la misma regla que `fn_item_es_de_claure` pero para el libro. (2) `fn_perdidas_hechos` (Pérdidas)
--            no lista la merma de un movimiento de CLAURE ni la anulación de una prenda de CLAURE; (3) `fn_calidad_danadas` no cuenta la prenda de CLAURE devuelta o anulada sin volver sana;
--            (4) el Diario (`fn_asientos`, la cuenta 6951) y el Estado de resultados (las mermas sin costo) no cuentan la merma de CLAURE. Lo demás de cada función es EXACTAMENTE lo de antes.
--   ASUME:   `movimientos.empresa_id` dice de quién era la unidad que salió (lo escribe el libro desde ADR-0542); un movimiento sin dueño es de CAYLA.
--   NO HACE: no toca las pérdidas en traslados entre sedes (`fn_perdidas_de_traslados`: el traslado no dice de quién era lo que se perdió), Frescura del piso, el Resumen por variante, el
--            Balance (eso es la actividad 15) ni ninguna tabla.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029153000. Una función nueva y seis reemplazos anclados sobre funciones vivas (`fn_perdidas_hechos`, `fn_calidad_danadas`,
-- `fn_asientos`, `fn_estado_resultados`): si una no tiene el texto esperado ABORTA SIN CAMBIAR NADA y dice cuál. Sin políticas ni `alter table`; idempotente. SE ROMPE SI: otra migración reescribe
-- esas funciones y cambia esos textos.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

-- ---------- 1. La regla común para el libro de movimientos ----------
create or replace function retail.fn_movimiento_es_de_claure(p_empresa_id uuid, p_ubicacion_id uuid, p_cuando timestamptz)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select p_empresa_id is not null and exists (
    select 1
      from retail.empresas e
      join retail.empresa_sedes es on es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id
     where e.id = p_empresa_id and e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null
       and (p_cuando at time zone 'America/Lima')::date >= e.cuenta_corriente_desde)
$$;

comment on function retail.fn_movimiento_es_de_claure(uuid, uuid, timestamptz) is
  'ADR-0560 (interna): un movimiento del libro es de CLAURE si trae su dueño (movimientos.empresa_id), la sede es de las que CLAURE opera y es del arranque de su cuenta o después. Es lo que apartan Pérdidas, la calidad de dañadas y el Diario.';
revoke all on function retail.fn_movimiento_es_de_claure(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---------- 2. Pérdidas: la merma y la anulación de una prenda de CLAURE no se listan ----------
select pg_temp.reemplazar('retail.fn_perdidas_hechos(uuid, timestamp with time zone, timestamp with time zone)',
$v$     and retail.fn_perdida_razon(m.tipo, m.motivo, m.cantidad) is not null$v$,
$n$     and retail.fn_perdida_razon(m.tipo, m.motivo, m.cantidad) is not null
     and not retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_id, m.created_at)$n$,
1);

select pg_temp.reemplazar('retail.fn_perdidas_hechos(uuid, timestamp with time zone, timestamp with time zone)',
$v$     and ai.condicion <> 'vendible'$v$,
$n$     and ai.condicion <> 'vendible'
     and not retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at)$n$,
1);

-- ---------- 3. Calidad de dañadas: la prenda de CLAURE devuelta o anulada sin volver sana no cuenta ----------
select pg_temp.reemplazar('retail.fn_calidad_danadas(date, integer)',
$v$      and di.condicion <> 'vendible'$v$,
$n$      and di.condicion <> 'vendible'
      and not retail.fn_item_es_de_claure(di.venta_item_id, d.ubicacion_id,
                (select ve2.created_at from retail.venta_items vi2 join retail.ventas ve2 on ve2.id = vi2.venta_id where vi2.id = di.venta_item_id))$n$,
1);

select pg_temp.reemplazar('retail.fn_calidad_danadas(date, integer)',
$v$    where ai.condicion <> 'vendible'$v$,
$n$    where ai.condicion <> 'vendible'
      and not retail.fn_item_es_de_claure(vi.id, ve.ubicacion_id, ve.created_at)$n$,
1);

-- ---------- 4. El Diario (6951) y el Estado de resultados: la merma de CLAURE no es gasto de CAYLA ----------
select pg_temp.reemplazar('retail.fn_asientos(date, date, uuid)',
$v$       and retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)
       and (v_todo or m.ubicacion_id = any (v_ubics))$v$,
$n$       and retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)
       and not retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_id, m.created_at)
       and (v_todo or m.ubicacion_id = any (v_ubics))$n$,
1);

select pg_temp.reemplazar('retail.fn_estado_resultados(date, date, uuid)',
$v$       and retail.fn_costo_variante_al(m.variante_id, m.created_at) = 0$v$,
$n$       and retail.fn_costo_variante_al(m.variante_id, m.created_at) = 0
       and not retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_id, m.created_at)$n$,
1);

do $$
begin
  if position('fn_movimiento_es_de_claure' in pg_get_functiondef('retail.fn_perdidas_hechos(uuid, timestamp with time zone, timestamp with time zone)'::regprocedure)) = 0
     or position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_perdidas_hechos(uuid, timestamp with time zone, timestamp with time zone)'::regprocedure)) = 0
     or position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_calidad_danadas(date, integer)'::regprocedure)) = 0
     or position('fn_movimiento_es_de_claure' in pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure)) = 0
     or position('fn_movimiento_es_de_claure' in pg_get_functiondef('retail.fn_estado_resultados(date, date, uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: las pérdidas y las dañadas no quedaron apartando lo de CLAURE';
  end if;
end $$;
