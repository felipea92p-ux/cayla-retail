-- 3 · DESPUÉS de pegar 20261101033000 (ADR-0597) — SOLO LECTURA. Las cuatro columnas deben dar true.
select (to_regprocedure('retail.poner_costo_a_fase(uuid,numeric,numeric)') is not null) as rpc,
       position('v_f.tarifa_prenda is not null or v_f.fijo_orden > 0' in pg_get_functiondef('retail.fn_fases_de_orden(uuid)'::regprocedure)) > 0 as fases,
       position('(v_f ->> ''tarifa_prenda'') is not null' in pg_get_functiondef('retail.fn_orden_produccion(uuid)'::regprocedure)) > 0 as orden,
       pg_get_functiondef('retail.fn_costo_servicios_orden(uuid)'::regprocedure) like '%devengado'' is not null%' as costo;
