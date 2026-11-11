-- ============================================================================
-- Regularizar ENV-009 y ENV-011 de Trujillo (2026-11-11, ADR-0636) — se pega UNA vez en el SQL Editor de producción, DESPUÉS de la migración
-- 20261111152000_unir_descarta_lo_contado_en_el_envio_propio.sql.
--
-- QUÉ PASÓ. Las prendas llegaron y entraron al stock por la recepción «sin aviso» ENV-007 (Lady Girl 17, Jirish 15). Después Compras registró
-- sus compras, cada una con su envío (ENV-011 y ENV-009), y alguien apretó «Recibir»: quedaron en «Seguir recibiendo». Si se cerraran contando,
-- esas 32 prendas entrarían dos veces.
--
-- QUÉ HACE. Une cada compra con ENV-007, a nombre de Felipe, con la misma función y los mismos candados que usará la pantalla
-- (`unir_recepcion_con_compra`): el envío de Compras queda ANULADO (lo contado, 2 prendas en ENV-009, queda como historia), la compra ya no se
-- puede volver a mandar y su papel pasa al libro (ENV-007 ya está cerrado). NO toca stock ni movimientos: el bloque final lo comprueba y, si
-- algo se movió, deshace todo.
-- TODO O NADA: si una unión falla (alguien tocó el envío mientras tanto), no queda ninguna.
-- QUÉ NO HACE. ENV-010 (falta corregir el proveedor de Valeria Mia en ENV-005 y la prenda 28 entró por un ajuste) ni ENV-002 (entró por
-- «Nuevo producto»): van aparte.
-- SE PUEDE PEGAR DOS VECES: la segunda vez cada unión responde «repetido» y no cambia nada.
-- ============================================================================
begin;
set local lock_timeout = '5s';

-- La foto de antes: cuánto stock y cuántos movimientos hay.
select set_config('regularizar.stock', (select coalesce(sum(s.cantidad), 0)::text from retail.stock s), true),
       set_config('regularizar.movs', (select count(*)::text from retail.movimientos), true);

-- A nombre de Felipe (Admin), como si lo hiciera desde la pantalla.
select set_config('request.jwt.claim.sub', '6b270aaa-896c-4b97-b8f4-017d6d41562a', true),
       set_config('request.jwt.claims', '{"sub":"6b270aaa-896c-4b97-b8f4-017d6d41562a","role":"authenticated"}', true),
       set_config('request.headers', '{}', true);
set local role authenticated;

do $uniones$
declare
  v_env007 constant uuid := 'a909cf79-0c9d-490e-8fd4-82523ff7dd29';
  v_r jsonb;
  v_par record;
begin
  for v_par in
    select * from (values
      ('ENV-011 · Francisco Ramos · Lady Girl, 17', 'e41d1df9-36a8-4e76-8096-dd04d2988d0f'::uuid),
      ('ENV-009 · Textil Anqori · Jirish, 15', 'c1b96006-2dd8-4f4a-9c03-0308200e0f53'::uuid)
    ) t(que, papel)
  loop
    v_r := retail.unir_recepcion_con_compra(v_env007, v_par.papel, null);
    if (v_r ->> 'unido') is distinct from 'true' then
      raise exception '% no se unió: %', v_par.que, v_r;
    end if;
    raise notice '% → %', v_par.que, v_r;
  end loop;
end $uniones$;

reset role;

-- El stock y los movimientos no se movieron: si no, se deshace todo.
do $comprueba$
begin
  if (select coalesce(sum(s.cantidad), 0)::text from retail.stock s) <> current_setting('regularizar.stock')
     or (select count(*)::text from retail.movimientos) <> current_setting('regularizar.movs') then
    raise exception 'El stock o los movimientos cambiaron: no se guarda nada.';
  end if;
end $comprueba$;

commit;

-- Lo que quedó (solo lectura): los dos envíos anulados, las dos compras unidas y su papel.
select retail.fn_envio_numero_texto(d.numero) as envio, d.estado, d.motivo_anulacion,
       (select string_agg(pr.nombre || ': ' || c.estado, ', ')
          from retail.compra_papel_llegadas l join retail.compra_papeles c on c.id = l.papel_id join retail.proveedores pr on pr.id = l.proveedor_id
         where l.envios_anulados @> array[d.id]) as compra
  from retail.despachos d
 where d.id in ('9e8b692f-1aa0-4c17-8c0d-57d6326b6ac0', 'b78b5fcf-f656-411d-b681-89d7980bd669')
 order by d.numero;
