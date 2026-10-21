-- ============================================================================
-- regularizar-anticipo-viejo.sql — CAYLA V2 (Felipe, 2026-10-14; ADR-0399)
--
-- QUÉ HACE. Un apartado de ANTES de ADR-0399 tiene su boleta de anticipo (con su correlativo gastado). Si esa boleta NUNCA salió a SUNAT
-- (estado `pendiente`, sin entorno ni envío) se puede marcar «no emitida» y el apartado pasa al camino nuevo: constancia hasta
-- entregar, una sola boleta o factura por el total. Este archivo hace la SEGUNDA mitad (desligar el apartado de esa boleta).
--
-- DOS PASOS, EN ESTE ORDEN (y solo con el OK de Felipe; este archivo NO se corre solo):
--   1. En la pantalla Comprobantes, la boleta del apartado se marca «no emitida» con un motivo (`marcar_comprobante_no_emitido`,
--      ADR-0093: solo un líder, solo un comprobante que nunca se transmitió; queda quién y cuándo). El número (por ejemplo
--      B005-273) NO se reutiliza: queda como hueco documentado, igual que cualquier comprobante no emitido.
--   2. Este archivo, pegado en el SQL Editor de producción. Se niega a tocar nada si la boleta no está «no emitida», si el apartado
--      no está abierto o si tiene abonos con comprobante vivo. No borra ninguna fila: solo pone `comprobante_anticipo_id` en NULL.
--
-- QUÉ SE ROMPE SI SE SALTA EL PASO 1. El apartado quedaría ligado a una boleta viva: al entregarlo, la boleta final descontaría un
-- anticipo que nunca llegó a SUNAT.
--
-- VERIFICACIÓN (al final, solo lectura): el apartado sin anticipo y su boleta `no_emitido`.
-- Se cambia el código entre comillas para otro apartado.
-- ============================================================================

set search_path = retail, public, extensions;

begin;

do $regularizar$
declare
  c_codigo constant text := 'APT-TRU-0006';
  s retail.separaciones;
  c retail.comprobantes;
begin
  perform 1 from retail.separaciones where codigo = c_codigo for update;
  s := (select t from retail.separaciones t where t.codigo = c_codigo);
  if s.id is null then
    raise exception 'No existe el apartado %', c_codigo;
  end if;
  if s.estado <> 'abierta' then
    raise exception 'Solo se regulariza un apartado abierto (el % está %)', c_codigo, s.estado;
  end if;
  if s.comprobante_anticipo_id is null then
    raise notice 'El apartado % ya no tiene boleta de anticipo: no hay nada que hacer.', c_codigo;
    return;
  end if;
  c := (select t from retail.comprobantes t where t.id = s.comprobante_anticipo_id);
  if c.estado <> 'no_emitido' then
    raise exception 'La boleta de anticipo % está «%»: márcala primero como no emitida en Comprobantes (paso 1).', c.serie || '-' || c.numero, c.estado;
  end if;
  if exists (select 1 from retail.comprobantes x where x.separacion_id = s.id and x.es_anticipo and x.id <> c.id and x.estado not in ('no_emitido', 'anulado')) then
    raise exception 'El apartado % tiene abonos con su propio comprobante vivo: no se regulariza solo, avisa a Felipe.', c_codigo;
  end if;
  update retail.separaciones set comprobante_anticipo_id = null where id = s.id;
  raise notice 'Listo: % ya no depende de la boleta % (queda como hueco documentado).', c_codigo, c.serie || '-' || c.numero;
end
$regularizar$;

commit;

select s.codigo, s.estado, s.comprobante_anticipo_id is null as sin_anticipo,
       (select c.serie || '-' || c.numero || ' · ' || c.estado from retail.comprobantes c where c.separacion_id = s.id and c.es_anticipo order by c.created_at limit 1) as boleta_vieja
  from retail.separaciones s where s.codigo = 'APT-TRU-0006';
