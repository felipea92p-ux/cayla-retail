-- ============================================================================
-- 20261105231000 — El Cierre de mes mira lo que todavía falta (tarea 7 de «Las 36 de Finanzas»; Felipe 2026-11-05: «frenar lo que rebota»)
--
-- EL PROBLEMA PRIMERO. `fn_cierre_mes_estado` no conocía los envíos abiertos, los comprobantes que SUNAT todavía no acepta, las compras por completar,
-- los gastos de compra por revisar ni si falta el arranque. Si octubre cerraba antes, al cerrar el conteo de un envío su comprobante rebotaba contra
-- el candado del mes y la única salida era reabrir.
--
-- LA DECISIÓN DE FELIPE. Cinco chequeos nuevos:
--   · FRENAN desde la fecha de corte de Finanzas (noviembre de 2026), y antes avisan: `envios_abiertos` y `comprobantes_sin_aceptar`, por sede. Son los que
--     rebotan o le mienten a SUNAT si se cierra sin ellos. Usan `pb.bloquea`, como los otros pendientes por sede.
--   · SOLO AVISAN: `papeles_por_completar` y `gastos_por_revisar`, en «De la empresa» porque no tienen sede (ADR-0485 d.6: no se frena por lo recibido sin
--     papel), y `arranque`, también en la empresa.
-- Un comprobante rechazado cuenta: no vale ante SUNAT hasta que se corrija. Lo de prueba, lo interno, lo no emitido y lo anulado no cuentan.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin tablas ni políticas. Reescribe `fn_cierre_mes_estado` desde su definición viva con tres anclas; si una no
-- aparece exactamente una vez, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:cierre-diferencias`.
--
-- SE ROMPE SI: una migración futura recrea `fn_cierre_mes_estado` copiando un texto viejo del repo (lo vigila el bloque L de la prueba).
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

select pg_temp.reemplazar('retail.fn_cierre_mes_estado(date)',
$a$  -- ¿Frenan los pendientes en cada unidad?$a$,
$n$  -- Tarea 7: envíos que siguen abiertos o en camino al terminar el mes, por la sede que los recibe.
  ea as (
    select d.ubicacion_destino_id as uid, count(*) as n
      from retail.despachos d
     where d.estado in ('en_camino', 'abierto') and coalesce(d.abierto_en, d.despachado_en) < v_fin_ts
     group by d.ubicacion_destino_id
  ),
  -- Tarea 7: comprobantes de venta del mes que SUNAT todavía no acepta, por la sede que los emitió.
  cna as (
    select c.ubicacion_id as uid, count(*) as n
      from retail.comprobantes c
     where c.estado in ('pendiente', 'enviado', 'rechazado', 'pendiente_reintento')
       and c.entorno_transmision = 'produccion'
       and c.created_at >= v_ini_ts and c.created_at < v_fin_ts
     group by c.ubicacion_id
  ),
  -- ¿Frenan los pendientes en cada unidad?$n$, 1);

select pg_temp.reemplazar('retail.fn_cierre_mes_estado(date)',
$a$    select uni.alc, uni.uid, 13, 'diario',$a$,
$n$    select uni.alc, uni.uid, 12, 'envios_abiertos', coalesce(ea.n, 0) = 0, pb.bloquea, jsonb_build_object('n', coalesce(ea.n, 0))
      from uni left join ea on ea.uid = uni.uid
      join pb on pb.alc = uni.alc and pb.uid is not distinct from uni.uid
     where uni.alc = 'ubicacion'
    union all
    select uni.alc, uni.uid, 12, 'comprobantes_sin_aceptar', coalesce(cna.n, 0) = 0, pb.bloquea, jsonb_build_object('n', coalesce(cna.n, 0))
      from uni left join cna on cna.uid = uni.uid
      join pb on pb.alc = uni.alc and pb.uid is not distinct from uni.uid
     where uni.alc = 'ubicacion'
    union all
    select 'empresa'::text, null::uuid, 12, 'papeles_por_completar', x.n = 0, false, jsonb_build_object('n', x.n)
      from (select count(*) as n from retail.compra_papeles p where p.estado = 'por_completar' and p.fecha <= v_fin) x
    union all
    select 'empresa'::text, null::uuid, 12, 'gastos_por_revisar', x.n = 0, false, jsonb_build_object('n', x.n)
      from (select count(*) as n from retail.compra_gastos g where g.estado = 'por_completar' and g.fecha <= v_fin) x
    union all
    select 'empresa'::text, null::uuid, 12, 'arranque', retail.fn_fecha_de_arranque() is not null, false, jsonb_build_object('fecha', retail.fn_fecha_de_arranque())
    union all
    select uni.alc, uni.uid, 13, 'diario',$n$, 1);

-- Los chequeos del mismo lugar salen siempre en el mismo orden.
select pg_temp.reemplazar('retail.fn_cierre_mes_estado(date)',
$a$order by ch.ord)$a$,
$n$order by ch.ord, ch.clave)$n$, 1);

reset lock_timeout;
