-- ============================================================================
-- Regularizar ENV-002 de Trujillo (2026-11-11, ADR-0636 act. d) — se pega UNA vez en producción, DESPUÉS de las dos partes de
-- 20261111181000_dar_compras_por_llegadas_por_otra_entrada.sql.
--
-- QUÉ PASÓ. Seis compras del 28-oct (163 prendas, S/ 4,293) viajaban en ENV-002. Sus prendas entraron a la tienda el 29-oct con «Nuevo producto» y
-- con ajustes de stock, antes de que se recibiera el envío. Después alguien empezó a contar ENV-002 (154 contadas): quedó en «Seguir recibiendo».
--
-- QUÉ HACE, a nombre de Felipe (Admin), todo o nada: da las seis compras por llegadas «por otra entrada». ENV-002 queda anulado (lo contado como
-- historia), las compras ya no se pueden volver a mandar, recibir, editar ni anular, y salen de toda lista «por enviar». NO pasan al libro (son de
-- antes del arranque contable: su mercadería ya está en el inventario de apertura) y NO toca stock ni movimientos: el bloque final lo comprueba.
-- SE PUEDE PEGAR DOS VECES: la segunda vez las seis salen como «repetidas» y no cambia nada.
-- ============================================================================
begin;
set local lock_timeout = '5s';

select set_config('regularizar.stock', (select coalesce(sum(s.cantidad), 0)::text from retail.stock s), true),
       set_config('regularizar.movs', (select count(*)::text from retail.movimientos), true);

select set_config('request.jwt.claim.sub', '6b270aaa-896c-4b97-b8f4-017d6d41562a', true),
       set_config('request.jwt.claims', '{"sub":"6b270aaa-896c-4b97-b8f4-017d6d41562a","role":"authenticated"}', true),
       set_config('request.headers', '{}', true);
set local role authenticated;

do $env002$
declare
  v_r jsonb;
begin
  v_r := retail.dar_compras_por_llegadas(array[
    '6a07bb91-3bc0-40a1-aee2-da01b1253ae9',  -- Industrias GC SAC · Strend, 7
    '70de3e29-279b-4879-8167-b7d042007292',  -- Marisol Sonia Bellido Ccaccya · Ivanana, 39
    '34f47667-d17b-4365-bb3d-cfa070070d0e',  -- Moda Mia, 9
    '1144a9ad-26d1-4913-9c14-66631d7c885e',  -- MODAS NERVUS E.I.R.L · nervus, 24
    '99f70d23-353b-4928-85c0-69c4faf26b1a',  -- SALCEDO LOZANO MARIA DE LAS MERCEDES · Lalesh New, 44
    '3cdea2db-1359-4cac-bb4b-717643b3f23e'   -- Victor Hugo Pun Renteria · Matic Moda, 40
  ]::uuid[], 'Entraron a Trujillo el 29-oct con «Nuevo producto» y ajustes de stock, antes de recibirse ENV-002');
  if jsonb_array_length(v_r -> 'hechas') + jsonb_array_length(v_r -> 'repetidas') <> 6 then
    raise exception 'No quedaron las seis compras: %', v_r;
  end if;
  perform set_config('regularizar.resultado', v_r::text, true);
end $env002$;

reset role;

do $comprueba$
begin
  if (select coalesce(sum(s.cantidad), 0)::text from retail.stock s) <> current_setting('regularizar.stock')
     or (select count(*)::text from retail.movimientos) <> current_setting('regularizar.movs') then
    raise exception 'El stock o los movimientos cambiaron: no se guarda nada.';
  end if;
end $comprueba$;

commit;

-- Lo que quedó (solo lectura).
select retail.fn_envio_numero_texto(d.numero) as envio, d.estado, d.motivo_anulacion,
       (select count(*) from retail.compra_papel_llegadas l where l.via = 'otra_entrada') as compras_dadas_por_llegadas
  from retail.despachos d where d.id = '6ec176b3-066f-4550-9615-09e068254333';
