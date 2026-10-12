-- ============================================================================
-- Apartados: el celular del cliente deja de ser obligatorio (ADR-0367, Felipe 2026-10-09).
--
-- POR QUÉ: en el mostrador hay clientes que no quieren dar su número, o no lo tienen a mano. El apartado se
-- rechazaba entero por eso («El celular de la clienta tiene 9 dígitos…»), aunque el DNI y el nombre ya dicen
-- quién es. El celular servía para dos cosas, y las dos siguen cubiertas sin él:
--   1. Avisarle por WhatsApp que su apartado vence: sin celular no hay aviso (la pantalla no ofrece el botón).
--   2. Devolverle el adelanto por Yape o Plin si no recoge: `v_dev_num := coalesce(v_dev_num, v_celular)` ya
--      exigía 9 dígitos al número de devolución; sin celular, la colaboradora escribe ese número aparte
--      (o elige transferencia). La regla de dinero NO cambia: sin un destino válido el apartado no se registra.
--
-- QUÉ CAMBIA:
--   - `separaciones.clienta_celular` admite null (el check de 9 dígitos sigue para el que sí viene).
--   - `separar_prendas`: un celular vacío queda null; uno escrito sigue exigiendo 9 dígitos. A `apartar_stock`
--     (que pide un contacto) le llega el celular, o «DNI <número>», o «sin celular».
--   `separar_pedido_para_apartar` llama a `separar_prendas`, así que hereda el cambio. `pedir_prenda_para_apartar`
--   (pedir a otra sede) sigue pidiendo celular: es otro flujo y no se tocó.
--
-- PRODUCCIÓN: un `alter` de una tabla en uso, sin políticas (regla de deadlocks de CLAUDE.md). Idempotente.
-- EN PRODUCCIÓN desde el 2026-10-09 (MCP `apply_migration`, versión 20261009231332; md5 de `separar_prendas`: 9fba5b39…).
-- El archivo lleva esa misma versión (nació como 20261009200000).
-- CÓMO SE DESHACE: `alter column clienta_celular set not null` (solo si no quedó ningún apartado sin celular) y
-- los dos reemplazos de abajo al revés.
-- ============================================================================

set lock_timeout = '3s';

alter table retail.separaciones alter column clienta_celular drop not null;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void language plpgsql as $f$
declare v_def text; v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception 'apartado sin celular: en % se esperaban % apariciones de «%» y hay %', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. Un celular vacío es null, no un texto de 0 dígitos.
select pg_temp.reemplazar(
  'retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)',
  E'v_celular text := regexp_replace(coalesce(p_clienta_celular, ''''), ''\\D'', '''', ''g'');',
  E'v_celular text := nullif(regexp_replace(coalesce(p_clienta_celular, ''''), ''\\D'', '''', ''g''), '''');',
  1
);

-- 2. Solo el celular que se escribió tiene que tener 9 dígitos.
select pg_temp.reemplazar(
  'retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)',
  E'if v_celular !~ ''^[0-9]{9}$'' then\n    raise exception ''El celular de la clienta tiene 9 dígitos: por ahí se le avisa y se le devuelve'';',
  E'if v_celular is not null and v_celular !~ ''^[0-9]{9}$'' then\n    raise exception ''El celular del cliente tiene 9 dígitos (o déjalo vacío)'';',
  1
);

-- 3. La reserva de stock pide un contacto: el celular, o el DNI, o lo dice.
select pg_temp.reemplazar(
  'retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)',
  E'v_nombres || '' '' || v_apellidos, v_celular, v_vence,',
  E'v_nombres || '' '' || v_apellidos, coalesce(v_celular, ''DNI '' || v_dni, ''sin celular''), v_vence,',
  1
);

-- 4. Sin celular, el número de Yape/Plin para devolver se pide aparte: el mensaje lo dice.
select pg_temp.reemplazar(
  'retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)',
  E'raise exception ''El número de % tiene 9 dígitos'', initcap(p_devolucion_medio);',
  E'raise exception ''El número de % para devolverle el adelanto tiene 9 dígitos (sin celular, escríbelo aparte)'', initcap(p_devolucion_medio);',
  1
);

-- Validación: quedó todo y nada del texto viejo.
do $v$
declare
  v_def text := pg_get_functiondef('retail.separar_prendas(uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid)'::regprocedure);
begin
  if position('v_celular is not null and v_celular' in v_def) = 0
     or position('coalesce(v_celular, ''DNI ''' in v_def) = 0
     or position('nullif(regexp_replace(coalesce(p_clienta_celular' in v_def) = 0 then
    raise exception 'apartado sin celular: separar_prendas no quedó como se esperaba';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'retail' and table_name = 'separaciones' and column_name = 'clienta_celular' and is_nullable = 'NO') then
    raise exception 'apartado sin celular: la columna sigue siendo obligatoria';
  end if;
end;
$v$;
