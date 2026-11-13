-- ============================================================================
-- Regularizar ENV-010 de Trujillo (2026-11-11, ADR-0636 act. c) — se pega UNA vez en producción, DESPUÉS de la migración
-- 20261111175000_corregir_proveedor_de_una_marca_y_unir_con_faltante.sql.
--
-- QUÉ PASÓ. La compra de Valeria Mia Peru Moda EIRL (28: 15 pantalones y 13 chalecos) llegó antes de registrarse: 27 entraron por la recepción
-- «sin aviso» ENV-005 (a nombre de «CAYLA SAC» por error) y el chaleco 13 con «Ajustar stock» el 6-nov. Después alguien apretó «Recibir» en el
-- envío de Compras (ENV-010) y contó 10: quedó en «Seguir recibiendo».
--
-- QUÉ HACE, a nombre de Felipe (Admin), todo o nada:
--   1. En ENV-005, lo de la marca Valeria Mia pasa a «Valeria Mia Peru Moda EIRL» (lo recibido, lo contado y el lote de sus 27 prendas). Las
--      otras ocho marcas de ENV-005 no se tocan.
--   2. Une la compra con ENV-005 aceptando el faltante (Felipe: «Unir con 27»): ENV-010 queda anulado (sus 10 contadas como historia), la compra
--      ya no se puede volver a mandar ni recibir, y su papel pasa al libro con 27 «recibido antes».
--   NO toca stock ni la cantidad de movimientos: el bloque final lo comprueba y, si algo se movió, deshace todo.
-- SE PUEDE PEGAR DOS VECES: la segunda, la corrección dice «ya es de ese proveedor» y se salta, y la unión responde «repetido».
-- ============================================================================
begin;
set local lock_timeout = '5s';

select set_config('regularizar.stock', (select coalesce(sum(s.cantidad), 0)::text from retail.stock s), true),
       set_config('regularizar.movs', (select count(*)::text from retail.movimientos), true);

select set_config('request.jwt.claim.sub', '6b270aaa-896c-4b97-b8f4-017d6d41562a', true),
       set_config('request.jwt.claims', '{"sub":"6b270aaa-896c-4b97-b8f4-017d6d41562a","role":"authenticated"}', true),
       set_config('request.headers', '{}', true),
       set_config('retail.union_acepta_faltante', 'si', true);
set local role authenticated;

do $env010$
declare
  v_env005 constant uuid := '9431d954-88ef-4e10-9478-e2d5905e7d44';
  v_marca constant uuid := '34ec128c-08ac-42f3-b45f-78d34120f503';      -- Valeria Mia
  v_proveedor constant uuid := '1463f68d-7565-4942-9c32-85c8f9c2b96d';  -- Valeria Mia Peru Moda EIRL
  v_papel constant uuid := '1b2708ea-b75c-4a1b-a924-62b13ab502bf';      -- la compra de ENV-010
  v_c jsonb;
  v_u jsonb;
begin
  begin
    v_c := retail.corregir_proveedor_de_marca(v_env005, v_marca, v_proveedor, 'Lo de Valeria Mia es de Valeria Mia Peru Moda EIRL: llegó sin aviso antes de registrarse la compra (ENV-010)');
  exception when others then
    -- Segunda vez: ya está corregido; cualquier otro error, para.
    if sqlerrm not like 'Lo de % en este envío ya es de %' then
      raise;
    end if;
    v_c := jsonb_build_object('ya_estaba', true);
  end;
  v_u := retail.unir_recepcion_con_compra(v_env005, v_papel, null);
  if (v_u ->> 'unido') is distinct from 'true' then
    raise exception 'ENV-010 no se unió: %', v_u;
  end if;
  perform set_config('regularizar.resultado', jsonb_build_object('correccion', v_c, 'union', v_u)::text, true);
end $env010$;

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
       (select c.estado from retail.compra_papeles c where c.id = '1b2708ea-b75c-4a1b-a924-62b13ab502bf') as compra
  from retail.despachos d where d.id = '84aa8ec1-e626-419d-952c-f596b1c21d0f';
