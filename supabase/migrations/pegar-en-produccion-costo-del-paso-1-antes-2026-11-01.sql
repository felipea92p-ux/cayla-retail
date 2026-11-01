-- 1 · ANTES de pegar 20261101033000 (ADR-0597) — SOLO LECTURA, no cambia nada.
-- Debe dar UNA fila con: las dos anclas en 1, y los tres últimos en true. Si algo no da lo esperado, NO pegues la migración y avisa: se detendría sola (todo va en una transacción),
-- pero es más barato saberlo antes.
with d as (
  select pg_get_functiondef('retail.fn_fases_de_orden(uuid)'::regprocedure) as fases,
         pg_get_functiondef('retail.fn_orden_produccion(uuid)'::regprocedure) as orden
)
select
  (length(fases) - length(replace(fases, 'when v_f.quien = ''servicio'' then 0 else null end;', ''))) / length('when v_f.quien = ''servicio'' then 0 else null end;') as ancla_fases_esperada_1,
  (length(orden) - length(replace(orden, 'if v_f ->> ''quien'' = ''servicio'' then', ''))) / length('if v_f ->> ''quien'' = ''servicio'' then') as ancla_orden_esperada_1,
  to_regprocedure('retail.poner_costo_a_fase(uuid,numeric,numeric)') is null as aun_no_existe_esperado_true,
  (select pg_get_constraintdef(oid) like '%tarifa_prenda IS NULL) AND (fecha_prometida IS NULL)%' from pg_constraint where conname = 'produccion_fases_quien' and conrelid = 'retail.produccion_fases'::regclass) as check_viejo_esperado_true,
  (to_regprocedure('retail.fn_ve_costos_del_taller(uuid)') is not null
    and to_regprocedure('retail.fn_fase_es_hito(text)') is not null
    and to_regprocedure('retail.fn_produccion_exigir_operar(uuid)') is not null
    and to_regprocedure('retail.fn_produccion_numero_texto(integer)') is not null) as dependencias_esperado_true
from d;
