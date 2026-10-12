-- ============================================================================
-- Pedir a otra sede para apartar: el celular del cliente también es opcional (ADR-0367, Felipe 2026-10-09).
--
-- POR QUÉ: la misma razón que `20261009231332_apartado_sin_celular.sql` (hay clientes que no lo dan), en el otro camino al
-- apartado: la prenda que se pide a otra tienda. Si el celular sigue obligatorio aquí, un cliente sin celular se aparta en
-- su tienda pero no puede pedir la talla que falta.
--
-- QUÉ CAMBIA:
--   - `separacion_pedidos_clienta_completa`: antes nombres, apellidos y celular eran los tres o ninguno (un pedido de
--     reposición no lleva cliente). Ahora nombres y apellidos van juntos, y un celular solo existe si hay cliente. «Tiene
--     cliente» sigue siendo `clienta_nombres is not null` en todas las funciones (se revisaron las 20 que leen la tabla).
--   - `pedir_prenda_para_apartar`: un celular vacío queda null; uno escrito sigue exigiendo 9 dígitos que empiezan en 9.
--   - `fn_apartar_pedidos_que_llegaron`: al llegar la prenda se aparta con `apartar_stock`, que pide un contacto; sin
--     celular recibe «sin celular» (antes fallaba y el pedido quedaba sin apartar, con un warning).
--   Avisar que llegó: la pantalla ofrece WhatsApp solo con celular; sin él, deja constancia del aviso dado de otra forma.
--
-- PRODUCCIÓN: un `alter` de una tabla en uso (cambiar un check), sin políticas. Idempotente.
-- EN PRODUCCIÓN desde el 2026-10-09 (MCP `apply_migration`, versión 20261009232138; md5 de `pedir_prenda_para_apartar`:
-- 590f1707…, de `fn_apartar_pedidos_que_llegaron`: 30c1a896…). El archivo lleva esa versión (nació como 20261009233000).
-- CÓMO SE DESHACE: el check viejo (solo si ningún pedido con cliente quedó sin celular) y los reemplazos al revés.
-- ============================================================================

set lock_timeout = '3s';

alter table retail.separacion_pedidos drop constraint if exists separacion_pedidos_clienta_completa;
alter table retail.separacion_pedidos add constraint separacion_pedidos_clienta_completa
  check ((clienta_nombres is null) = (clienta_apellidos is null) and (clienta_celular is null or clienta_nombres is not null));

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'pedido sin celular: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. Un celular vacío es null.
select pg_temp.reemplazar(
  'retail.pedir_prenda_para_apartar(uuid, uuid, uuid, integer, text, text, text, text, uuid)',
  E'v_celular text := regexp_replace(coalesce(p_clienta_celular, ''''), ''\\D'', '''', ''g'');',
  E'v_celular text := nullif(regexp_replace(coalesce(p_clienta_celular, ''''), ''\\D'', '''', ''g''), '''');',
  1
);

-- 2. Solo el celular que se escribió tiene que ser un celular.
select pg_temp.reemplazar(
  'retail.pedir_prenda_para_apartar(uuid, uuid, uuid, integer, text, text, text, text, uuid)',
  E'if v_celular !~ ''^9[0-9]{8}$'' then\n    raise exception ''El celular de la clienta tiene 9 dígitos y empieza en 9'';',
  E'if v_celular is not null and v_celular !~ ''^9[0-9]{8}$'' then\n    raise exception ''El celular del cliente tiene 9 dígitos y empieza en 9 (o déjalo vacío)'';',
  1
);

-- 3. Al llegar, la reserva pide un contacto.
select pg_temp.reemplazar(
  'retail.fn_apartar_pedidos_que_llegaron(uuid, uuid, uuid, integer)',
  E'pe.clienta_nombres || '' '' || pe.clienta_apellidos, pe.clienta_celular, fn_hoy_lima() + 3,',
  E'pe.clienta_nombres || '' '' || pe.clienta_apellidos, coalesce(pe.clienta_celular, ''sin celular''), fn_hoy_lima() + 3,',
  1
);

do $v$
begin
  if position('v_celular is not null and v_celular' in pg_get_functiondef('retail.pedir_prenda_para_apartar(uuid, uuid, uuid, integer, text, text, text, text, uuid)'::regprocedure)) = 0
     or position('coalesce(pe.clienta_celular, ''sin celular'')' in pg_get_functiondef('retail.fn_apartar_pedidos_que_llegaron(uuid, uuid, uuid, integer)'::regprocedure)) = 0
     or position('clienta_celular IS NULL) OR' in (select pg_get_constraintdef(oid) from pg_constraint
                                                  where conname = 'separacion_pedidos_clienta_completa' and conrelid = 'retail.separacion_pedidos'::regclass)) = 0 then
    raise exception 'pedido sin celular: no quedó como se esperaba';
  end if;
end;
$v$;
